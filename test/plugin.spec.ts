import '@testing-library/jest-dom/vitest';
import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGrowiDirective from '@growi/remark-growi-directive';
import remarkRehype from 'remark-rehype';
import type { Root as HastRoot, Element } from 'hast';
import packageJson from '../package.json';
import { remarkPageListPlugin } from '../src/remark-pagelist';
import { parsePageListingInfo, createExcerptText, normalizeExcerptOptions, createSubordinatedPageList, type GrowiPageItem } from '../src/components/SubordinatedPageList';
import { activate, deactivate, PLUGIN_NAME } from '../client-entry';

const PageList = createSubordinatedPageList(React);
// 空本文・本文欠落と、APIが返さないページを別々に扱う契約を固定します。
describe('権限情報の応答', () => {
  it('要求IDのうち妥当な情報だけを採用し、本文の有無で除外しない', () => {
    const result = parsePageListingInfo({ data: {
      allowed: { isEmpty: false, revisionShortBody: '' },
      noBody: { isEmpty: false }, missing: null,
      unrelated: { isEmpty: false }, forbidden: { isEmpty: false, isForbidden: true },
    } }, ['allowed', 'noBody', 'missing', 'absent', 'forbidden']);
    expect(Object.keys(result)).toEqual(['allowed', 'noBody']);
  });
  it.each([null, {}, { data: [] }, { data: { article: {} } }, { data: { article: 'invalid' } }])('不正応答を許可結果へ変換しない: %j', (json) => {
    expect(() => parsePageListingInfo(json, ['article'])).toThrow();
  });
});
// 既存機能の回帰検証と抜粋取得の検証を分け、通信件数の意味を明確にします。
const LegacyPageList = (props: React.ComponentProps<typeof PageList>) => React.createElement(PageList, { excerpt: 'false', ...props });
// 元Markdownの構造を解析し、表示文字と最大量だけを取り出すことを確認します。
describe('抜粋の整形', () => {
  it('装飾・リンク・画像をテキスト化し、段落と箇条書きの間を空白で区切る', () => {
    expect(createExcerptText('# 見出し\n\n**重要**な[リンク](https://example.com)と`code`\n\n- 一つ\n- 二つ\n\n![図](image.png)', 350))
      .toBe('見出し 重要なリンクとcode 一つ 二つ 図');
  });
  it('HTMLノードを除外し、途中で切れたMarkdownも安全なテキストにする', () => {
    expect(createExcerptText('<script>alert(1)</script>\n\n本文 <img src=x onerror=alert(1)> **途中', 350)).toBe('本文 **途中');
  });
  it('省略記号を上限に含め、絵文字のサロゲートペアを壊さない', () => {
    expect(createExcerptText('日本😀語の本文', 4)).toBe('日本😀…');
    expect(createExcerptText('文章', 1)).toBe('…');
    expect(createExcerptText('短文', 5)).toBe('短文');
  });
  it('オンオフ・既定値・不正値・最大値を正規化する', () => {
    expect(normalizeExcerptOptions()).toEqual({ enabled: true, length: 200, lines: 3 });
    expect(normalizeExcerptOptions(' FALSE ', '999', '99')).toEqual({ enabled: false, length: 350, lines: 10 });
    for (const value of ['', '0', '-1', '1.5', 'abc']) {
      expect(normalizeExcerptOptions('invalid', value, value)).toEqual({ enabled: true, length: 200, lines: 3 });
    }
  });
});
// 件数と更新日時を独立させ、人気スコア・閲覧数・いいね数の順序を区別します。
const page = (path: string, views = 0, likes = 0, days = 1): GrowiPageItem => ({
  _id: path, path, updatedAt: new Date(Date.now() - days * 86400000).toISOString(),
  createdAt: new Date(Date.now() - (days + 1) * 86400000).toISOString(),
  seenUsers: Array.from({ length: views }, (_, index) => `viewer-${index}`),
  liker: Array.from({ length: likes }, (_, index) => `liker-${index}`),
  lastUpdateUser: { username: 'tester', name: 'テスト利用者' },
});
const fixtures = [page('/Tech'), page('/Tech/Views', 10, 0), page('/Tech/Likes', 1, 6), page('/Tech/Sub/Popular', 8, 4), page('/Technology/Outside')];
const mockPages = (pages = fixtures) => mockExcerptApi(pages, {});
// 実際と同じ一覧→追加情報の2段階にし、追加通信だけを独立して数えます。
const apiResponse = (json: unknown, status = 200) => ({ ok: status < 400, status, json: async () => json });
const mockExcerptApi = (pages: GrowiPageItem[], info: Record<string, { revisionShortBody?: string | null } | null>) => {
  const listingInfo = Object.fromEntries(pages.map((item) => [item._id, { isEmpty: false, ...info[item._id] }]));
  const permissionFetch = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => apiResponse({ data: listingInfo }));
  const infoFetch = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => apiResponse({ data: listingInfo }));
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input), window.location.origin);
    if (url.pathname === '/_api/v3/page-listing/info') return url.searchParams.get('attachShortBody') === 'true'
      ? infoFetch(input, init) : permissionFetch(input, init);
    return apiResponse(url.pathname === '/_api/search'
      ? { data: pages.map((pageData) => ({ pageData })), totalCount: pages.length }
      : { data: { pages, totalCount: pages.length } });
  });
  vi.stubGlobal('fetch', fetchMock);
  return { fetchMock, infoFetch, permissionFetch };
};
afterEach(() => { cleanup(); deactivate(); vi.unstubAllGlobals(); window.history.replaceState({}, '', '/'); });

describe('仕様書の必須7項目', () => {
  it('1. パッケージ名とスクリプトプラグインのスキーマを固定する', () => {
    expect(packageJson.name).toBe('growi-plugin-pagelist');
    expect(packageJson.growiPlugin).toEqual({ schemaVersion: '4', types: ['script'] });
  });

  it('2. 実際のGROWI記法から全オプションをカスタム要素へ変換する', async () => {
    const processor = unified().use(remarkParse).use(remarkGrowiDirective).use(remarkPageListPlugin).use(remarkRehype);
    const tree = await processor.run(processor.parse('$pagelist(/Tech, limit=6, recursive=false, sort=popular, tag=pickup, view=card, newdays=7, excerpt=false, excerptlength=80, excerptlines=1)')) as HastRoot;
    const element = tree.children.find((node) => node.type === 'element' && node.tagName === 'growi-pagelist') as Element;
    expect(element?.properties).toEqual({ targetpath: '/Tech', limit: '6', recursive: 'false', sort: 'popular', tag: 'pickup', view: 'card', newdays: '7', excerpt: 'false', excerptlength: '80', excerptlines: '1' });
  });

  it('3. 再帰探索では全階層を含め、起点・表示中ページ・隣接パスを除外する', async () => {
    window.history.replaceState({}, '', '/Tech/Views');
    mockPages();
    render(React.createElement(LegacyPageList, { targetpath: '/Tech/', recursive: 'true' }));
    expect(await screen.findByRole('link', { name: 'Popular' })).toHaveAttribute('href', '/Tech/Sub/Popular');
    expect(screen.queryByRole('link', { name: 'Tech' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Views' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Outside' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Likes' })).toHaveAttribute('href', '/Tech/Likes');
  });

  it('4. recursive=falseでは直下だけを表示する', async () => {
    mockPages();
    render(React.createElement(LegacyPageList, { targetpath: '/Tech', recursive: 'false' }));
    expect(await screen.findByRole('link', { name: 'Views' })).toHaveAttribute('href', '/Tech/Views');
    expect(screen.queryByRole('link', { name: 'Popular' })).not.toBeInTheDocument();
    const url = new URL(vi.mocked(fetch).mock.calls[0][0] as string, window.location.origin);
    expect(url.searchParams.get('limit')).toBe('100');
  });

  it.each([
    ['popular', ['/Tech/Sub/Popular', '/Tech/Likes', '/Tech/Views']],
    ['likes', ['/Tech/Likes', '/Tech/Sub/Popular', '/Tech/Views']],
    ['views', ['/Tech/Views', '/Tech/Sub/Popular', '/Tech/Likes']],
  ])('5. sort=%sを降順にし、順位とメトリクスを表示する', async (sort, expected) => {
    mockPages();
    render(React.createElement(LegacyPageList, { targetpath: '/Tech', sort }));
    await screen.findByTestId('pagelist-view-list');
    expect(screen.getAllByRole('link').map((link) => link.getAttribute('href'))).toEqual(expected);
    expect(screen.getByTestId('pagelist-rank-1')).toHaveTextContent('1位');
    expect(screen.getAllByTitle('閲覧者数')).toHaveLength(3);
    expect(screen.getAllByTitle('いいね数')).toHaveLength(3);
  });

  it.each(['data', 'pages', 'pageData'])('6. タグ検索の%s形式をカードで表示する', async (format) => {
    const pages = [page('/Tech/Pickup')];
    const response = format === 'pageData' ? { data: pages.map((item) => ({ pageData: item })) } : { [format]: pages };
    const { fetchMock } = mockExcerptApi(pages, {});
    fetchMock.mockResolvedValueOnce(apiResponse(response));
    render(React.createElement(LegacyPageList, { tag: 'pickup', view: 'card' }));
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
    const { fetchMock } = mockExcerptApi([...first, last], {});
    fetchMock.mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ data: { pages: first, totalCount: 101 } }) })
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ data: { pages: [last], totalCount: 101 } }) });
    render(React.createElement(LegacyPageList, { targetpath: '/Tech', sort: 'popular', limit: '1' }));
    expect(await screen.findByRole('link', { name: 'Winner' })).toHaveAttribute('href', '/Tech/Winner');
    fireEvent.click(screen.getByRole('button', { name: '次へ' }));
    await waitFor(() => expect(screen.getByTestId('pagelist-page-info')).toHaveTextContent('2 / 101'));
    expect(screen.getByTestId('pagelist-rank-2')).toBeVisible();
    expect(fetchMock.mock.calls.filter(([input]) => String(input).includes('/pages/list?'))).toHaveLength(2);
  });

  it('NEWの期限、未来日付、newdays=0を扱う', async () => {
    mockPages([page('/Tech/New', 0, 0, 1), page('/Tech/Old', 0, 0, 10), page('/Tech/Future', 0, 0, -1)]);
    const { rerender } = render(React.createElement(LegacyPageList, { targetpath: '/Tech', newdays: '3' }));
    await screen.findByTestId('pagelist-view-list');
    expect(screen.getAllByTestId('pagelist-new-badge')).toHaveLength(1);
    rerender(React.createElement(LegacyPageList, { targetpath: '/Tech', newdays: '0' }));
    expect(screen.queryByTestId('pagelist-new-badge')).not.toBeInTheDocument();
  });

  it('API失敗を表示し再試行で回復する', async () => {
    const { fetchMock } = mockExcerptApi([page('/Tech/Recovered')], {});
    fetchMock.mockResolvedValueOnce(apiResponse({}, 403));
    render(React.createElement(LegacyPageList, { targetpath: '/Tech' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('HTTP 403');
    fireEvent.click(screen.getByRole('button', { name: '再試行' }));
    expect(await screen.findByRole('link', { name: 'Recovered' })).toHaveAttribute('href', '/Tech/Recovered');
  });

  it('対象変更後に古い応答が返っても表示を上書きしない', async () => {
    let complete!: (value: ReturnType<typeof apiResponse>) => void;
    const { fetchMock } = mockExcerptApi([page('/Other/Latest')], {});
    fetchMock.mockImplementationOnce(() => new Promise((resolve) => { complete = resolve; }));
    const { rerender } = render(React.createElement(LegacyPageList, { targetpath: '/Tech' }));
    rerender(React.createElement(LegacyPageList, { targetpath: '/Other' }));
    await screen.findByRole('link', { name: 'Latest' });
    complete(apiResponse({ pages: [page('/Tech/Stale')] }));
    await waitFor(() => expect(screen.queryByRole('link', { name: 'Stale' })).not.toBeInTheDocument());
  });

  it('空結果を表示する', async () => {
    mockPages([]);
    render(React.createElement(LegacyPageList, { targetpath: '/Tech' }));

    expect(await screen.findByTestId('pagelist-empty')).toBeVisible();
  });

  it('path指定・num別名・既定値を解析し、他のディレクティブを変更しない', async () => {
    const processor = unified().use(remarkParse).use(remarkGrowiDirective).use(remarkPageListPlugin).use(remarkRehype);
    const tree = await processor.run(processor.parse('$pagelist(path=/Tech, num=5)')) as HastRoot;
    const element = tree.children[0] as Element;
    expect(element.properties).toMatchObject({ targetpath: '/Tech', limit: '5', sort: 'updatedAt', recursive: 'true', newdays: '3', view: 'list', excerpt: 'true', excerptlength: '200', excerptlines: '3' });
    const other = await processor.run(processor.parse('$other()')) as HastRoot;
    expect((other.children[0] as Element).tagName).not.toBe('growi-pagelist');
  });
});

describe('抜粋の取得と共通表示', () => {
  it.each([
    ['list', ''], ['card', ''], ['list', 'pickup'], ['card', 'pickup'],
  ])('%s表示・tag=%sで標準APIから取得し、5要素を表示する', async (view, tag) => {
    const item = page('/Tech/Sub/Article', 8, 2);
    const { fetchMock, infoFetch } = mockExcerptApi([item], { [item._id]: { revisionShortBody: '# 要点\n\n本文の**抜粋**です。' } });
    render(React.createElement(PageList, { targetpath: '/Tech', view, tag }));
    expect(await screen.findByTestId('pagelist-excerpt')).toHaveTextContent('要点 本文の抜粋です。');
    expect(screen.getByRole('link', { name: 'Article' })).toHaveAttribute('href', '/Tech/Sub/Article');
    expect(screen.getByText('/Tech/Sub')).toBeVisible();
    expect(screen.getByRole('img', { name: 'テスト利用者のアイコン' })).toBeVisible();
    expect(screen.getByLabelText('閲覧者数 8')).toBeVisible();
    expect(infoFetch).toHaveBeenCalledTimes(1);
    const [input, init] = infoFetch.mock.calls[0];
    const params = new URL(String(input), window.location.origin).searchParams;
    expect(params.getAll('pageIds[]')).toEqual([item._id]);
    expect(params.get('attachShortBody')).toBe('true');
    expect(init?.credentials).toBe('same-origin');
    expect(String(fetchMock.mock.calls[0][0])).toContain(tag ? '/_api/search?' : '/_api/v3/pages/list?');
  });

  it.each(['card', 'list'])('excerpt=falseでは%sの抜粋・余白・本文取得通信がない', async (view) => {
    const item = page('/Tech/Article');
    const { infoFetch } = mockExcerptApi([item], { [item._id]: { revisionShortBody: '表示しない本文' } });
    render(React.createElement(PageList, { targetpath: '/Tech', view, excerpt: ' FALSE ', excerptlength: '350', excerptlines: '10' }));
    await screen.findByRole('link', { name: 'Article' });
    expect(infoFetch).not.toHaveBeenCalled();
    expect(screen.queryByTestId('pagelist-excerpt')).not.toBeInTheDocument();
    expect(screen.queryByText('抜粋を読み込み中...')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '抜粋を再試行' })).not.toBeInTheDocument();
  });

  it('表示中のIDだけ取得し、ページ送りと戻る操作で本文を対応させる', async () => {
    const items = [page('/Tech/First', 0, 0, 1), page('/Tech/Second', 0, 0, 2)];
    const { infoFetch } = mockExcerptApi(items, {
      [items[0]._id]: { revisionShortBody: '一番目の本文' }, [items[1]._id]: { revisionShortBody: '二番目の本文' },
    });
    render(React.createElement(PageList, { targetpath: '/Tech', limit: '1' }));
    expect(await screen.findByTestId('pagelist-excerpt')).toHaveTextContent('一番目の本文');
    expect(new URL(String(infoFetch.mock.calls[0][0]), window.location.origin).searchParams.getAll('pageIds[]')).toEqual([items[0]._id]);
    fireEvent.click(screen.getByRole('button', { name: '次へ' }));
    await waitFor(() => expect(screen.getByTestId('pagelist-excerpt')).toHaveTextContent('二番目の本文'));
    fireEvent.click(screen.getByRole('button', { name: '前へ' }));
    await waitFor(() => expect(screen.getByTestId('pagelist-excerpt')).toHaveTextContent('一番目の本文'));
    expect(infoFetch).toHaveBeenCalledTimes(2);
  });

  it('文字数・行数・表示形式の変更は追加通信せず、上限を適用する', async () => {
    const item = page('/Tech/Article');
    const { infoFetch } = mockExcerptApi([item], { [item._id]: { revisionShortBody: '日本😀語'.repeat(90) } });
    const { rerender } = render(React.createElement(PageList, { targetpath: '/Tech' }));
    const initial = await screen.findByTestId('pagelist-excerpt');
    expect(Array.from(initial.textContent ?? '')).toHaveLength(200);
    expect(initial.style.webkitLineClamp).toBe('3');
    rerender(React.createElement(PageList, { targetpath: '/Tech', view: 'card', excerptlength: '4', excerptlines: '1' }));
    expect(screen.getByTestId('pagelist-excerpt')).toHaveTextContent('日本😀…');
    expect(screen.getByTestId('pagelist-excerpt').style.webkitLineClamp).toBe('1');
    rerender(React.createElement(PageList, { targetpath: '/Tech', excerptlength: '999', excerptlines: '99' }));
    expect(Array.from(screen.getByTestId('pagelist-excerpt').textContent ?? '')).toHaveLength(350);
    expect(screen.getByTestId('pagelist-excerpt').style.webkitLineClamp).toBe('10');
    expect(infoFetch).toHaveBeenCalledTimes(1);
  });

  it('空本文と本文欠落を非表示にし、空本文だけを成功キャッシュにする', async () => {
    const items = [page('/Tech/Empty', 0, 0, 1), page('/Tech/Hidden', 0, 0, 2)];
    const { infoFetch } = mockExcerptApi(items, { [items[0]._id]: { revisionShortBody: '' }, [items[1]._id]: {} });
    render(React.createElement(PageList, { targetpath: '/Tech', limit: '1' }));
    await waitFor(() => expect(infoFetch).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.queryByText('抜粋を読み込み中...')).not.toBeInTheDocument());
    expect(screen.queryByTestId('pagelist-excerpt')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '次へ' }));
    await waitFor(() => expect(infoFetch).toHaveBeenCalledTimes(2));
    fireEvent.click(screen.getByRole('button', { name: '前へ' }));
    await screen.findByRole('link', { name: 'Empty' });
    fireEvent.click(screen.getByRole('button', { name: '次へ' }));
    await waitFor(() => expect(infoFetch).toHaveBeenCalledTimes(3));
    expect(screen.queryByTestId('pagelist-excerpt')).not.toBeInTheDocument();
  });

  it.each([403, 404, 500])('HTTP %sでも一覧を残し、抜粋だけ再試行できる', async (status) => {
    const item = page('/Tech/Article');
    const { infoFetch } = mockExcerptApi([item], { [item._id]: { revisionShortBody: '回復した本文' } });
    infoFetch.mockResolvedValueOnce(apiResponse({}, status));
    render(React.createElement(PageList, { targetpath: '/Tech' }));
    expect(await screen.findByText(`抜粋を取得できませんでした (HTTP ${status})`)).toBeVisible();
    expect(screen.getByRole('link', { name: 'Article' })).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: '抜粋を再試行' }));
    expect(await screen.findByTestId('pagelist-excerpt')).toHaveTextContent('回復した本文');
    expect(infoFetch).toHaveBeenCalledTimes(2);
  });

  it('51件を50件ずつ直列取得し、部分失敗しても成功分を残す', async () => {
    const items = Array.from({ length: 51 }, (_, index) => page(`/Tech/Article-${index}`));
    const info = Object.fromEntries(items.map((item) => [item._id, { isEmpty: false, revisionShortBody: `${item.path}の本文` }]));
    const { infoFetch } = mockExcerptApi(items, info);
    infoFetch.mockImplementationOnce(async (input) => {
      expect(new URL(String(input), window.location.origin).searchParams.getAll('pageIds[]')).toHaveLength(50);
      return apiResponse({ data: info });
    }).mockResolvedValueOnce(apiResponse({}, 500));
    render(React.createElement(PageList, { targetpath: '/Tech', limit: '51' }));
    await screen.findByRole('button', { name: '抜粋を再試行' });
    expect(screen.getAllByTestId('pagelist-excerpt')).toHaveLength(50);
    expect(infoFetch).toHaveBeenCalledTimes(2);
    expect(new URL(String(infoFetch.mock.calls[1][0]), window.location.origin).searchParams.getAll('pageIds[]')).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: '抜粋を再試行' }));
    await waitFor(() => expect(screen.getAllByTestId('pagelist-excerpt')).toHaveLength(51));
    expect(infoFetch).toHaveBeenCalledTimes(3);
    expect(new URL(String(infoFetch.mock.calls[2][0]), window.location.origin).searchParams.getAll('pageIds[]')).toHaveLength(1);
  });

  it('表示中の画像読込失敗を更新者の頭文字へ置き換える', async () => {
    const item = page('/Tech/Article');
    item.lastUpdateUser!.imageUrlCached = '/missing-avatar.png';
    mockExcerptApi([item], {});
    render(React.createElement(PageList, { targetpath: '/Tech' }));
    const image = await screen.findByRole('img', { name: 'テスト利用者のアイコン' });
    expect(image.tagName).toBe('IMG');
    fireEvent.error(image);
    expect(screen.getByRole('img', { name: 'テスト利用者のアイコン' }).tagName).toBe('SPAN');
    expect(screen.getByRole('img', { name: 'テスト利用者のアイコン' })).toHaveTextContent('テ');
  });

  it('HTMLをDOMとして挿入しない', async () => {
    const item = page('/Tech/Article');
    mockExcerptApi([item], { [item._id]: { revisionShortBody: '<script>alert(1)</script>\n\n安全な本文 <img src=x onerror=alert(1)>' } });
    const { container } = render(React.createElement(PageList, { targetpath: '/Tech' }));
    expect(await screen.findByTestId('pagelist-excerpt')).toHaveTextContent('安全な本文');
    expect(container.querySelector('script, img[src="x"]')).toBeNull();
  });

  it('オンからオフへの切替で中止し、古い本文を出さず再有効化できる', async () => {
    const item = page('/Tech/Article');
    const { infoFetch } = mockExcerptApi([item], { [item._id]: { revisionShortBody: '新しい本文' } });
    let complete!: (response: ReturnType<typeof apiResponse>) => void;
    infoFetch.mockImplementationOnce(() => new Promise((resolve) => { complete = resolve; }));
    const { rerender, unmount } = render(React.createElement(PageList, { targetpath: '/Tech' }));
    await waitFor(() => expect(infoFetch).toHaveBeenCalledTimes(1));
    const signal = infoFetch.mock.calls[0][1]?.signal;
    rerender(React.createElement(PageList, { targetpath: '/Tech', excerpt: 'false' }));
    expect(signal?.aborted).toBe(true);
    await act(async () => { complete(apiResponse({ data: { [item._id]: { isEmpty: false, revisionShortBody: '古い本文' } } })); });
    expect(screen.queryByTestId('pagelist-excerpt')).not.toBeInTheDocument();
    rerender(React.createElement(PageList, { targetpath: '/Tech', excerpt: 'true' }));
    expect(await screen.findByTestId('pagelist-excerpt')).toHaveTextContent('新しい本文');
    expect(infoFetch).toHaveBeenCalledTimes(2);
    unmount();
    expect(infoFetch.mock.calls[1][1]?.signal?.aborted).toBe(true);
  });

  it('ページ切替の遅い応答は新しい抜粋とキャッシュを上書きしない', async () => {
    const items = [page('/Tech/First', 0, 0, 1), page('/Tech/Second', 0, 0, 2)];
    const { infoFetch } = mockExcerptApi(items, { [items[1]._id]: { revisionShortBody: '二番目' } });
    let complete!: (response: ReturnType<typeof apiResponse>) => void;
    infoFetch.mockImplementationOnce(() => new Promise((resolve) => { complete = resolve; }));
    render(React.createElement(PageList, { targetpath: '/Tech', limit: '1' }));
    await waitFor(() => expect(infoFetch).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole('button', { name: '次へ' }));
    expect(await screen.findByTestId('pagelist-excerpt')).toHaveTextContent('二番目');
    await act(async () => { complete(apiResponse({ data: { [items[0]._id]: { isEmpty: false, revisionShortBody: '遅い本文' } } })); });
    expect(screen.getByTestId('pagelist-excerpt')).toHaveTextContent('二番目');
    expect(infoFetch.mock.calls[0][1]?.signal?.aborted).toBe(true);
  });

  it('対象変更時に同じIDのキャッシュを流用せず、更新日時が変わった本文も再取得する', async () => {
    const item = page('/Tech/Article');
    const { fetchMock, infoFetch, permissionFetch } = mockExcerptApi([item], { [item._id]: { revisionShortBody: '変更前' } });
    const { rerender } = render(React.createElement(PageList, { targetpath: '/Tech' }));
    expect(await screen.findByTestId('pagelist-excerpt')).toHaveTextContent('変更前');
    infoFetch.mockResolvedValue(apiResponse({ data: { [item._id]: { isEmpty: false, revisionShortBody: '変更後' } } }));
    fetchMock.mockImplementation(async (input, init) => String(input).includes('/page-listing/info?')
      ? new URL(String(input), window.location.origin).searchParams.get('attachShortBody') === 'true' ? infoFetch(input, init) : permissionFetch(input, init)
      : apiResponse({ data: { pages: [{ ...item, updatedAt: new Date().toISOString() }], totalCount: 1 } }));
    rerender(React.createElement(PageList, { targetpath: '/' }));
    await waitFor(() => expect(screen.getByTestId('pagelist-excerpt')).toHaveTextContent('変更後'));
    expect(infoFetch).toHaveBeenCalledTimes(2);
  });

  it('空一覧からオンオフを切り替えてもHooksの順序を保ち、本文取得しない', async () => {
    const { infoFetch } = mockExcerptApi([], {});
    const { rerender } = render(React.createElement(PageList, { targetpath: '/Tech' }));
    await screen.findByTestId('pagelist-empty');
    rerender(React.createElement(PageList, { targetpath: '/Tech', excerpt: 'false' }));
    rerender(React.createElement(PageList, { targetpath: '/Tech', excerpt: 'true' }));
    expect(screen.getByTestId('pagelist-empty')).toBeVisible();
    expect(infoFetch).not.toHaveBeenCalled();
  });
});

// 権限APIが完了する前に、候補の記事情報をDOMへ一度も渡さないことを確認します。
describe('権限スキップ', () => {
  it('確認中は記事を出さず、返されなかったIDを件数・順位からも除外する', async () => {
    const allowed = page('/Tech/Public', 1, 1);
    const hidden = page('/Tech/Secret/Confidential', 100, 100);
    const { permissionFetch } = mockExcerptApi([hidden, allowed], {});
    let complete!: (response: ReturnType<typeof apiResponse>) => void;
    permissionFetch.mockImplementationOnce(() => new Promise((resolve) => { complete = resolve; }));
    const { container } = render(React.createElement(PageList, { targetpath: '/Tech', sort: 'popular', excerpt: 'false' }));
    await waitFor(() => expect(permissionFetch).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    expect(container).not.toHaveTextContent('Secret');
    expect(container).not.toHaveTextContent('Public');
    await act(async () => { complete(apiResponse({ data: { [allowed._id]: { isEmpty: false } } })); });
    expect(await screen.findByRole('link', { name: 'Public' })).toBeVisible();
    expect(container).not.toHaveTextContent('Confidential');
    expect(container).not.toHaveTextContent('Secret');
    expect(screen.getByText('全 1 件')).toBeVisible();
    expect(screen.getByTestId('pagelist-rank-1')).toBeVisible();
    expect(screen.queryByTestId('pagelist-rank-2')).not.toBeInTheDocument();
  });

  it.each([
    ['card', '', 'true'], ['card', '', 'false'], ['list', '', 'true'], ['list', '', 'false'],
    ['card', 'pickup', 'true'], ['card', 'pickup', 'false'], ['list', 'pickup', 'true'], ['list', 'pickup', 'false'],
  ])('%s/tag=%s/excerpt=%sで常に権限を確認し、非公開ページを完全に除外する', async (view, tag, excerpt) => {
    const allowed = page('/Tech/Public', 1, 1);
    const hidden = page('/Tech/Secret/Confidential', 100, 100);
    const { permissionFetch, infoFetch } = mockExcerptApi([hidden, allowed], { [allowed._id]: { revisionShortBody: '公開本文' } });
    permissionFetch.mockResolvedValue(apiResponse({ data: { [allowed._id]: { isEmpty: false }, [hidden._id]: null } }));
    const { container } = render(React.createElement(PageList, { targetpath: '/Tech', view, tag, excerpt, sort: 'popular' }));
    await screen.findByRole('link', { name: 'Public' });
    expect(container).not.toHaveTextContent('Secret');
    expect(container).not.toHaveTextContent('Confidential');
    expect(container.querySelector('a[href*="Secret"]')).toBeNull();
    expect(screen.getByText('全 1 件')).toBeVisible();
    expect(permissionFetch).toHaveBeenCalledTimes(1);
    const [input, init] = permissionFetch.mock.calls[0];
    expect(new URL(String(input), window.location.origin).searchParams.get('attachShortBody')).toBe('false');
    expect(init?.credentials).toBe('same-origin');
    expect(init?.cache).toBe('no-store');
    if (excerpt === 'true') expect(await screen.findByTestId('pagelist-excerpt')).toHaveTextContent('公開本文');
    else expect(infoFetch).not.toHaveBeenCalled();
  });

  it('空本文・本文欠落の許可ページは残し、権限除外後もlimitを満たすよう詰める', async () => {
    const items = [page('/Tech/Denied', 99), page('/Tech/Empty', 8), page('/Tech/NoBody', 7), page('/Tech/Third', 6)];
    const { permissionFetch } = mockExcerptApi(items, { [items[1]._id]: { revisionShortBody: '' } });
    permissionFetch.mockResolvedValue(apiResponse({ data: Object.fromEntries(items.slice(1).map((item) => [item._id, { isEmpty: false }])) }));
    render(React.createElement(PageList, { targetpath: '/Tech', limit: '2', sort: 'views', excerpt: 'false' }));
    await screen.findByRole('link', { name: 'Empty' });
    expect(screen.getAllByRole('link').map((link) => link.textContent)).toEqual(['Empty', 'NoBody']);
    expect(screen.getByTestId('pagelist-page-info')).toHaveTextContent('1 / 2');
    expect(screen.getByText('全 3 件')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: '次へ' }));
    await screen.findByRole('link', { name: 'Third' });
    expect(screen.getByTestId('pagelist-rank-3')).toBeVisible();
    expect(screen.queryByRole('link', { name: 'Denied' })).not.toBeInTheDocument();
    expect(permissionFetch).toHaveBeenCalledTimes(2);
  });

  it('全IDが省略された正常応答は空表示にし、本文を取得しない', async () => {
    const { permissionFetch, infoFetch } = mockExcerptApi([page('/Tech/Private')], {});
    permissionFetch.mockResolvedValue(apiResponse({ data: {} }));
    render(React.createElement(PageList, { targetpath: '/Tech' }));
    expect(await screen.findByTestId('pagelist-empty')).toBeVisible();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(infoFetch).not.toHaveBeenCalled();
  });

  it.each([401, 403, 404, 500])('権限確認HTTP%sは記事を出さず、全候補の再試行で回復する', async (status) => {
    const { permissionFetch, infoFetch } = mockExcerptApi([page('/Tech/Article')], {});
    permissionFetch.mockResolvedValueOnce(apiResponse({}, status));
    render(React.createElement(PageList, { targetpath: '/Tech' }));
    expect(await screen.findByTestId('pagelist-permission-error')).toHaveTextContent('閲覧権限を確認できませんでした。');
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    expect(screen.queryByText('全 1 件')).not.toBeInTheDocument();
    expect(infoFetch).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: '再試行' }));
    expect(await screen.findByRole('link', { name: 'Article' })).toBeVisible();
    expect(permissionFetch).toHaveBeenCalledTimes(2);
  });

  it.each(['invalid-json', 'invalid-map', 'invalid-info', 'network'])('権限応答の%sでも未確認の記事へフォールバックしない', async (failure) => {
    const { permissionFetch } = mockExcerptApi([page('/Tech/Article')], {});
    if (failure === 'invalid-json') permissionFetch.mockResolvedValueOnce({ ok: true, status: 200, json: async () => { throw new SyntaxError('invalid JSON'); } });
    if (failure === 'invalid-map') permissionFetch.mockResolvedValueOnce(apiResponse({ data: [] }));
    if (failure === 'invalid-info') permissionFetch.mockResolvedValueOnce(apiResponse({ data: { '/Tech/Article': {} } }));
    if (failure === 'network') permissionFetch.mockRejectedValueOnce(new Error('network failure'));
    render(React.createElement(PageList, { targetpath: '/Tech', excerpt: 'false' }));
    await screen.findByTestId('pagelist-permission-error');
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    expect(screen.queryByText('Article')).not.toBeInTheDocument();
  });

  it('51件を全て確認するまでは何も出さず、途中失敗でも部分件数を公開しない', async () => {
    const items = Array.from({ length: 51 }, (_, index) => page(`/Tech/Article-${index}`));
    const { permissionFetch } = mockExcerptApi(items, {});
    permissionFetch.mockResolvedValueOnce(apiResponse({ data: Object.fromEntries(items.map((item) => [item._id, { isEmpty: false }])) }))
      .mockResolvedValueOnce(apiResponse({}, 500));
    render(React.createElement(PageList, { targetpath: '/Tech', limit: '51', excerpt: 'false' }));
    await screen.findByTestId('pagelist-permission-error');
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    expect(screen.queryByText(/全 .* 件/)).not.toBeInTheDocument();
    expect(permissionFetch).toHaveBeenCalledTimes(2);
    expect(new URL(String(permissionFetch.mock.calls[0][0]), window.location.origin).searchParams.getAll('pageIds[]')).toHaveLength(50);
    expect(new URL(String(permissionFetch.mock.calls[1][0]), window.location.origin).searchParams.getAll('pageIds[]')).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: '再試行' }));
    await screen.findByText('全 51 件');
    expect(permissionFetch).toHaveBeenCalledTimes(4);
  });

  it('ページ送り前に再確認し、以前許可された記事が非公開ならキャッシュ本文も出さない', async () => {
    const items = [page('/Tech/First', 9), page('/Tech/Second', 8), page('/Tech/Third', 7)];
    const { permissionFetch } = mockExcerptApi(items, { [items[0]._id]: { revisionShortBody: '以前の公開本文' } });
    render(React.createElement(PageList, { targetpath: '/Tech', limit: '1', sort: 'views' }));
    await screen.findByTestId('pagelist-excerpt');
    permissionFetch.mockResolvedValue(apiResponse({ data: { [items[1]._id]: { isEmpty: false }, [items[2]._id]: { isEmpty: false } } }));
    fireEvent.click(screen.getByRole('button', { name: '次へ' }));
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    await screen.findByRole('link', { name: 'Third' });
    fireEvent.click(screen.getByRole('button', { name: '前へ' }));
    await screen.findByRole('link', { name: 'Second' });
    expect(screen.queryByRole('link', { name: 'First' })).not.toBeInTheDocument();
    expect(screen.queryByText('以前の公開本文')).not.toBeInTheDocument();
    expect(screen.getByText('全 2 件')).toBeVisible();
  });

  it('タブ復帰時に再確認し、確認失敗なら以前の許可記事も隠す', async () => {
    const { permissionFetch } = mockExcerptApi([page('/Tech/Article')], {});
    const { unmount } = render(React.createElement(PageList, { targetpath: '/Tech', excerpt: 'false' }));
    await screen.findByRole('link', { name: 'Article' });
    permissionFetch.mockResolvedValueOnce(apiResponse({}, 401));
    let visibility = 'hidden';
    const descriptor = Object.getOwnPropertyDescriptor(document, 'visibilityState');
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => visibility });
    try {
      fireEvent(document, new Event('visibilitychange'));
      expect(screen.queryByRole('link')).not.toBeInTheDocument();
      visibility = 'visible';
      fireEvent(document, new Event('visibilitychange'));
      await screen.findByTestId('pagelist-permission-error');
      expect(screen.queryByRole('link')).not.toBeInTheDocument();
      expect(permissionFetch).toHaveBeenCalledTimes(2);
    } finally {
      unmount();
      if (descriptor) Object.defineProperty(document, 'visibilityState', descriptor);
      else Reflect.deleteProperty(document, 'visibilityState');
    }
  });

  it('対象変更前の遅い権限応答が、新しい候補の許可結果へ混入しない', async () => {
    const items = [page('/Tech/Old'), page('/Other/New')];
    const { permissionFetch } = mockExcerptApi(items, {});
    let complete!: (response: ReturnType<typeof apiResponse>) => void;
    permissionFetch.mockImplementationOnce(() => new Promise((resolve) => { complete = resolve; }));
    const { rerender } = render(React.createElement(PageList, { targetpath: '/Tech', excerpt: 'false' }));
    await waitFor(() => expect(permissionFetch).toHaveBeenCalledTimes(1));
    rerender(React.createElement(PageList, { targetpath: '/Other', excerpt: 'false' }));
    await screen.findByRole('link', { name: 'New' });
    await act(async () => { complete(apiResponse({ data: { [items[0]._id]: { isEmpty: false } } })); });
    expect(screen.queryByRole('link', { name: 'Old' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'New' })).toBeVisible();
    expect(permissionFetch.mock.calls[0][1]?.signal?.aborted).toBe(true);
  });

  it('権限確認後、本文取得でIDが消えた場合は記事全体を除き再計算する', async () => {
    const items = [page('/Tech/Revoked', 9), page('/Tech/Public', 1)];
    const { infoFetch, permissionFetch } = mockExcerptApi(items, { [items[1]._id]: { revisionShortBody: '残す本文' } });
    infoFetch.mockResolvedValueOnce(apiResponse({ data: { [items[1]._id]: { isEmpty: false, revisionShortBody: '残す本文' } } }));
    render(React.createElement(PageList, { targetpath: '/Tech', sort: 'views' }));
    await waitFor(() => expect(screen.getByText('全 1 件')).toBeVisible());
    expect(screen.queryByRole('link', { name: 'Revoked' })).not.toBeInTheDocument();
    expect(await screen.findByTestId('pagelist-excerpt')).toHaveTextContent('残す本文');
    expect(screen.getByTestId('pagelist-rank-1')).toBeVisible();
    expect(permissionFetch).toHaveBeenCalledTimes(2);
    expect(infoFetch).toHaveBeenCalledTimes(2);
  });
});