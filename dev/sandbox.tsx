import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import Markdown, { type Components } from 'react-markdown';
import remarkGrowiDirective from '@growi/remark-growi-directive';
import { BookOpen, Code2, RotateCcw } from 'lucide-react';
import 'bootstrap/dist/css/bootstrap.min.css';
import './sandbox.css';
import { createSubordinatedPageList, type GrowiPageItem } from '../src/components/SubordinatedPageList';
import { remarkPageListPlugin } from '../src/remark-pagelist';

// 実APIと同じ件数・offset/pageを扱い、一覧側のページングもそのまま検証します。
const sample = (path: string, days: number, views: number, likes: number, author: string, tags: string[] = []): GrowiPageItem & { tags: string[] } => ({
  _id: path, path, updatedAt: new Date(Date.now() - days * 86400000).toISOString(),
  createdAt: new Date(Date.now() - (days + 30) * 86400000).toISOString(),
  seenUsers: Array.from({ length: views }, (_, index) => String(index)),
  liker: Array.from({ length: likes }, (_, index) => String(index)),
  lastUpdateUser: { username: author, name: author }, tags,
});
const MOCK_PAGES = [
  sample('/TechKnowhow', 0, 0, 0, '管理者'),
  sample('/TechKnowhow/Git・GitHubのチーム開発ガイド', .2, 84, 23, '山田 太郎', ['pickup']),
  sample('/TechKnowhow/Azure/Fabricアーキテクチャ設計', 1, 62, 18, '佐藤 花子', ['pickup']),
  sample('/TechKnowhow/CSharp/.NETパフォーマンス改善', 10, 103, 12, '鈴木 一郎', ['pickup']),
  sample('/TechKnowhow/Trouble/VPN接続のトラブル対応', .1, 32, 8, '高橋 健太'),
  sample('/TechKnowhow/新入社員のための開発環境セットアップ', 2, 57, 17, '田中 葵', ['pickup']),
  sample('/TechKnowhow/レビュー観点チェックリスト', 5, 45, 14, '山田 太郎'),
  sample('/TechKnowhow/Security/秘密情報の取り扱い', 6, 40, 11, '佐藤 花子', ['必読']),
];
const nativeFetch = window.fetch.bind(window);
window.fetch = async (input, init) => {
  const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url, window.location.origin);
  if (url.pathname !== '/_api/search' && url.pathname !== '/_api/v3/pages/list') return nativeFetch(input, init);
  const search = url.pathname === '/_api/search';
  const query = url.searchParams.get('q') ?? '';
  const tag = query.match(/tag:([^\s]+)/)?.[1];
  const prefix = search ? query.match(/prefix:([^\s]+)/)?.[1] ?? '/' : url.searchParams.get('path') ?? '/';
  const matches = MOCK_PAGES.filter((page) => (!tag || page.tags.includes(tag)) &&
    (prefix === '/' || page.path === prefix || page.path.startsWith(`${prefix}/`)));
  const limit = Number(url.searchParams.get('limit') ?? 10);
  const offset = search ? Number(url.searchParams.get('offset') ?? 0) : (Number(url.searchParams.get('page') ?? 1) - 1) * limit;
  const pages = matches.slice(offset, offset + limit);
  return new Response(JSON.stringify(search
    ? { data: pages.map((pageData) => ({ pageData })), totalCount: matches.length }
    : { data: { pages, totalCount: matches.length } }), { status: 200, headers: { 'Content-Type': 'application/json' } });
};
const PageList = createSubordinatedPageList(React);
const components = { 'growi-pagelist': PageList } as Components;
const INITIAL_MARKDOWN = `## おすすめ・必読ノウハウ
$pagelist(tag=pickup, view=card, limit=4)

## 人気ランキング
$pagelist(/TechKnowhow, sort=popular, limit=3)

## 最新のノウハウ
$pagelist(/TechKnowhow, sort=updatedAt, limit=4, newdays=3)
`;

// 編集中のMarkdownにも本体と同じRemarkプラグインを適用し、記法から描画までを確認します。
function SandboxApp(): React.ReactElement {
  const [markdown, setMarkdown] = useState(INITIAL_MARKDOWN);
  const [editing, setEditing] = useState(false);
  return <>
    <header className="portal-header"><div className="portal-width"><BookOpen size={22} /><span>KNOWLEDGE / 社内ナレッジ</span><span className="sandbox-label">LOCAL SANDBOX</span></div></header>
    <main className="portal-width">
      <div className="portal-heading"><div><p className="portal-eyebrow">ENGINEERING KNOWLEDGE</p><h1>ナレッジポータル</h1><p className="portal-subtitle">技術・運用・チームの知見</p></div>
        <div className="portal-tools"><button type="button" title="Markdownを編集" aria-label="Markdownを編集" aria-pressed={editing} onClick={() => setEditing(!editing)}><Code2 size={19} /></button><button type="button" title="初期内容に戻す" aria-label="初期内容に戻す" onClick={() => setMarkdown(INITIAL_MARKDOWN)}><RotateCcw size={18} /></button></div>
      </div>
      {editing && <textarea className="markdown-editor" aria-label="ポータルのMarkdown" value={markdown} onChange={(event) => setMarkdown(event.target.value)} spellCheck={false} />}
      <div className="portal-content"><Markdown components={components} remarkPlugins={[remarkGrowiDirective, remarkPageListPlugin]}>{markdown}</Markdown></div>
      <footer>growi-plugin-pagelist <span>GROWI v6 / v7 / v8</span></footer>
    </main>
  </>;
}
const root = document.getElementById('root');
if (root) createRoot(root).render(<SandboxApp />);