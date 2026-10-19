import '@testing-library/jest-dom/vitest';
import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGrowiDirective from '@growi/remark-growi-directive';
import remarkRehype from 'remark-rehype';
import type { Root as HastRoot, Element } from 'hast';
import packageJson from '../package.json';
import { remarkPageListPlugin } from '../src/remark-pagelist';
import { createSubordinatedPageList, type GrowiPageItem } from '../src/components/SubordinatedPageList';
import { activate, deactivate, PLUGIN_NAME } from '../client-entry';

const PageList = createSubordinatedPageList(React);
// 件数と更新日時を独立させ、人気スコア・閲覧数・いいね数の順序を区別します。
const page = (path: string, views = 0, likes = 0, days = 1): GrowiPageItem => ({
  _id: path, path, updatedAt: new Date(Date.now() - days * 86400000).toISOString(),
  createdAt: new Date(Date.now() - (days + 1) * 86400000).toISOString(),
  seenUsers: Array.from({ length: views }, (_, index) => `viewer-${index}`),
  liker: Array.from({ length: likes }, (_, index) => `liker-${index}`),
  lastUpdateUser: { username: 'tester', name: 'テスト利用者' },
});
const fixtures = [page('/Tech'), page('/Tech/Views', 10, 0), page('/Tech/Likes', 1, 6), page('/Tech/Sub/Popular', 8, 4), page('/Technology/Outside')];
const mockPages = (pages = fixtures) => vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
  ok: true, json: async () => ({ pages, totalCount: pages.length }),
}));
afterEach(() => { cleanup(); deactivate(); vi.unstubAllGlobals(); window.history.replaceState({}, '', '/'); });

describe('仕様書の必須7項目', () => {
  it('1. パッケージ名とスクリプトプラグインのスキーマを固定する', () => {
    expect(packageJson.name).toBe('growi-plugin-pagelist');
    expect(packageJson.growiPlugin).toEqual({ schemaVersion: '4', types: ['script'] });
  });

  it('2. 実際のGROWI記法から全オプションをカスタム要素へ変換する', async () => {
    const processor = unified().use(remarkParse).use(remarkGrowiDirective).use(remarkPageListPlugin).use(remarkRehype);
    const tree = await processor.run(processor.parse('$pagelist(/Tech, limit=6, recursive=false, sort=popular, tag=pickup, view=card, newdays=7)')) as HastRoot;
    const element = tree.children.find((node) => node.type === 'element' && node.tagName === 'growi-pagelist') as Element;
    expect(element?.properties).toEqual({ targetpath: '/Tech', limit: '6', recursive: 'false', sort: 'popular', tag: 'pickup', view: 'card', newdays: '7' });
  });

  it('3. 再帰探索では全階層を含め、起点・表示中ページ・隣接パスを除外する', async () => {
    window.history.replaceState({}, '', '/Tech/Views');
    mockPages();
    render(React.createElement(PageList, { targetpath: '/Tech/', recursive: 'true' }));
    expect(await screen.findByRole('link', { name: '/Tech/Sub/Popular' })).toBeVisible();
    expect(screen.queryByRole('link', { name: '/Tech' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: '/Tech/Views' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: '/Technology/Outside' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: '/Tech/Likes' })).toBeVisible();
  });

  it('4. recursive=falseでは直下だけを表示する', async () => {
    mockPages();
    render(React.createElement(PageList, { targetpath: '/Tech', recursive: 'false' }));
    expect(await screen.findByRole('link', { name: '/Tech/Views' })).toBeVisible();
    expect(screen.queryByRole('link', { name: '/Tech/Sub/Popular' })).not.toBeInTheDocument();
    const url = new URL(vi.mocked(fetch).mock.calls[0][0] as string, window.location.origin);
    expect(url.searchParams.get('limit')).toBe('100');
  });

  it.each([
    ['popular', ['/Tech/Sub/Popular', '/Tech/Likes', '/Tech/Views']],
    ['likes', ['/Tech/Likes', '/Tech/Sub/Popular', '/Tech/Views']],
    ['views', ['/Tech/Views', '/Tech/Sub/Popular', '/Tech/Likes']],
  ])('5. sort=%sを降順にし、順位とメトリクスを表示する', async (sort, expected) => {
    mockPages();
    render(React.createElement(PageList, { targetpath: '/Tech', sort }));
    await screen.findByTestId('pagelist-view-list');
    expect(screen.getAllByRole('link').map((link) => link.textContent)).toEqual(expected);
    expect(screen.getByTestId('pagelist-rank-1')).toHaveTextContent('1位');
    expect(screen.getAllByTitle('閲覧者数')).toHaveLength(3);
    expect(screen.getAllByTitle('いいね数')).toHaveLength(3);
  });

  it.each(['data', 'pages', 'pageData'])('6. タグ検索の%s形式をカードで表示する', async (format) => {
    const pages = [page('/Tech/Pickup')];
    const response = format === 'pageData' ? { data: pages.map((item) => ({ pageData: item })) } : { [format]: pages };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => response }));
    render(React.createElement(PageList, { tag: 'pickup', view: 'card' }));
    const cards = await screen.findByTestId('pagelist-view-card');
    expect(within(cards).getByRole('link', { name: 'Pickup' })).toBeVisible();
    const url = new URL(vi.mocked(fetch).mock.calls[0][0] as string, window.location.origin);
    expect(url.pathname).toBe('/_api/search');
    expect(url.searchParams.get('q')).toBe('tag:pickup');
  });

  it('7. activateがView/Preview両方を登録し、重複を防ぎ、解除で復元する', () => {
    const originalOptions = { remarkPlugins: [], components: { strong: 'strong' } };
    const original = vi.fn(() => originalOptions);
    const generators = { generateViewOptions: original, generatePreviewOptions: original };
    vi.stubGlobal('growiFacade', { react: React, markdownRenderer: { optionsGenerators: generators } });
    window.pluginActivators?.[PLUGIN_NAME].activate();
    activate();
    const registered = window.growiFacade.markdownRenderer?.optionsGenerators;
    if (!registered) throw new Error('レンダラーが登録されていません。');
    for (const key of ['customGenerateViewOptions', 'customGeneratePreviewOptions'] as const) {
      const options = registered[key]!();
      expect(options.remarkPlugins).toEqual([remarkPageListPlugin]);
      expect(options.components?.['growi-pagelist']).toBeTypeOf('function');
      expect(options.components?.strong).toBe('strong');
    }
    expect(originalOptions.remarkPlugins).toEqual([]);
    deactivate();
    expect(registered.customGenerateViewOptions).toBeUndefined();
    expect(registered.customGeneratePreviewOptions).toBeUndefined();
  });
});

describe('境界値と非同期処理の回帰検証', () => {
  // 100件以降の高スコア記事もランキングに含め、ページ送りでは再取得しません。
  it('100件超の全件取得とクライアント側ページ送り', async () => {
    const first = Array.from({ length: 100 }, (_, index) => page(`/Tech/Article-${index}`));
    const last = page('/Tech/Winner', 100, 100);
    const fetchMock = vi.fn().mockResolvedValueOnce({ ok: true, json: async () => ({ data: { pages: first, totalCount: 101 } }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ data: { pages: [last], totalCount: 101 } }) });
    vi.stubGlobal('fetch', fetchMock);
    render(React.createElement(PageList, { targetpath: '/Tech', sort: 'popular', limit: '1' }));
    expect(await screen.findByRole('link', { name: '/Tech/Winner' })).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: '次へ' }));
    expect(screen.getByTestId('pagelist-page-info')).toHaveTextContent('2 / 101');
    expect(screen.getByTestId('pagelist-rank-2')).toBeVisible();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('NEWの期限、未来日付、newdays=0を扱う', async () => {
    mockPages([page('/Tech/New', 0, 0, 1), page('/Tech/Old', 0, 0, 10), page('/Tech/Future', 0, 0, -1)]);
    const { rerender } = render(React.createElement(PageList, { targetpath: '/Tech', newdays: '3' }));
    await screen.findByTestId('pagelist-view-list');
    expect(screen.getAllByTestId('pagelist-new-badge')).toHaveLength(1);
    rerender(React.createElement(PageList, { targetpath: '/Tech', newdays: '0' }));
    expect(screen.queryByTestId('pagelist-new-badge')).not.toBeInTheDocument();
  });

  it('API失敗を表示し再試行で回復する', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce({ ok: false, status: 403 })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ pages: [page('/Tech/Recovered')] }) }));
    render(React.createElement(PageList, { targetpath: '/Tech' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('HTTP 403');
    fireEvent.click(screen.getByRole('button', { name: '再試行' }));
    expect(await screen.findByRole('link', { name: '/Tech/Recovered' })).toBeVisible();
  });

  it('対象変更後に古い応答が返っても表示を上書きしない', async () => {
    let complete!: (value: unknown) => void;
    vi.stubGlobal('fetch', vi.fn().mockImplementationOnce(() => new Promise((resolve) => { complete = resolve; }))
      .mockResolvedValue({ ok: true, json: async () => ({ pages: [page('/Other/Latest')] }) }));
    const { rerender } = render(React.createElement(PageList, { targetpath: '/Tech' }));
    rerender(React.createElement(PageList, { targetpath: '/Other' }));
    await screen.findByRole('link', { name: '/Other/Latest' });
    complete({ ok: true, json: async () => ({ pages: [page('/Tech/Stale')] }) });
    await waitFor(() => expect(screen.queryByRole('link', { name: '/Tech/Stale' })).not.toBeInTheDocument());
  });

  it('空結果を表示する', async () => {
    mockPages([]);
    render(React.createElement(PageList, { targetpath: '/Tech' }));
    expect(await screen.findByTestId('pagelist-empty')).toBeVisible();
  });

  it('path指定・num別名・既定値を解析し、他のディレクティブを変更しない', async () => {
    const processor = unified().use(remarkParse).use(remarkGrowiDirective).use(remarkPageListPlugin).use(remarkRehype);
    const tree = await processor.run(processor.parse('$pagelist(path=/Tech, num=5)')) as HastRoot;
    const element = tree.children[0] as Element;
    expect(element.properties).toMatchObject({ targetpath: '/Tech', limit: '5', sort: 'updatedAt', recursive: 'true', newdays: '3', view: 'list' });
    const other = await processor.run(processor.parse('$other()')) as HastRoot;
    expect((other.children[0] as Element).tagName).not.toBe('growi-pagelist');
  });
});