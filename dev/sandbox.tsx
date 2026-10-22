import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import Markdown, { type Components } from 'react-markdown';
import remarkGrowiDirective from '@growi/remark-growi-directive';
import { BookOpen, Code2, RotateCcw } from 'lucide-react';
import 'bootstrap/dist/css/bootstrap.min.css';
import './sandbox.css';
import { createSubordinatedPageList, type GrowiPageItem } from '../src/components/SubordinatedPageList';
import { remarkPageListPlugin } from '../src/remark-pagelist';

// 外部の画像サービスへ依存せず、更新者アイコンを確認できる小さなビットマップを作ります。
const avatarImage = (initial: string, color: string): string => {
  const canvas = document.createElement('canvas');
  canvas.width = 56;
  canvas.height = 56;
  const context = canvas.getContext('2d');
  if (!context) return '';
  context.fillStyle = color;
  context.fillRect(0, 0, 56, 56);
  context.fillStyle = '#ffffff';
  context.font = 'bold 26px "Yu Gothic UI", sans-serif';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillText(initial, 28, 29);
  return canvas.toDataURL('image/png');
};
const AVATARS: Record<string, string> = { '山田 太郎': avatarImage('山', '#247f6a'), '佐藤 花子': avatarImage('佐', '#a24c60') };
// 実APIと同じ件数・offset/pageを扱い、一覧側のページングもそのまま検証します。
const sample = (path: string, days: number, views: number, likes: number, author: string, tags: string[] = []): GrowiPageItem & { tags: string[] } => ({
  _id: path, path, updatedAt: new Date(Date.now() - days * 86400000).toISOString(),
  createdAt: new Date(Date.now() - (days + 30) * 86400000).toISOString(),
  seenUsers: Array.from({ length: views }, (_, index) => String(index)),
  liker: Array.from({ length: likes }, (_, index) => String(index)),
  lastUpdateUser: { username: author, name: author, imageUrlCached: AVATARS[author] }, tags,
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
// 本文は一覧へ混ぜず、標準の追加情報APIからIDで対応させます。空・欠落も別々に用意します。
const MOCK_BODIES: Record<string, string | null> = {
  '/TechKnowhow': '社内の技術と運用ノウハウを集めるポータルです。',
  '/TechKnowhow/Git・GitHubのチーム開発ガイド': `# チームで使うGitの基本\n\nブランチの切り方からプルリクエストの作成、レビュー、マージまでの流れをまとめました。**小さな変更**を早く共有し、手戻りの少ない開発を進めます。\n\n作業を始める前に最新の変更を取り込み、目的を一つに絞ってブランチを作成します。レビューでは変更の背景、影響範囲、確認方法を記載してください。\n\nコミットは意味のある単位にまとめ、タイトルには何を変更したのかを簡潔に記載します。機密情報や個人の認証情報が含まれていないことも必ず確認します。チームの共通ルールは定期的に見直し、新しく参加したメンバーが迷わない状態に保ちます。`,
  '/TechKnowhow/Azure/Fabricアーキテクチャ設計': '# 設計のチェックポイント\n\nデータの取り込みから可視化まで、[Fabric](https://example.com)を使った構成の判断基準を整理します。\n\n- ワークスペースの責任範囲\n- アクセス権限とデータ品質\n- 運用時のコストと監視\n\n`Lakehouse`と`Warehouse`の役割を分け、段階的に導入してください。',
  '/TechKnowhow/CSharp/.NETパフォーマンス改善': '応答が遅いときは、最初に計測してボトルネックを特定します。CPU、メモリ、データベースへのアクセスを分けて観察し、効果を数値で確認します。\n\n推測だけで最適化せず、再現条件と変更前後の結果を記録しましょう。',
  '/TechKnowhow/Trouble/VPN接続のトラブル対応': 'VPNに接続できないときの確認順序です。ネットワーク接続、認証情報、有効期限を確認してから、クライアントのログを採取してください。',
  '/TechKnowhow/新入社員のための開発環境セットアップ': '初日に必要なアカウント申請とツールの導入手順です。困ったときは担当メンターに相談してください。',
  '/TechKnowhow/レビュー観点チェックリスト': '',
  '/TechKnowhow/Security/秘密情報の取り扱い': null,
};
const nativeFetch = window.fetch.bind(window);
window.fetch = async (input, init) => {
  const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url, window.location.origin);
  if (url.pathname === '/_api/v3/page-listing/info') {
    // ?mockExcerptError=500で、一時的な取得失敗と一覧の退避表示を手動確認できます。
    const failure = Number(new URL(window.location.href).searchParams.get('mockExcerptError'));
    if ([403, 404, 500].includes(failure)) return new Response('{}', { status: failure });
    if (init?.signal?.aborted) throw new DOMException('取得が中止されました。', 'AbortError');
    const info = Object.fromEntries(url.searchParams.getAll('pageIds[]').filter((id) => id in MOCK_BODIES).map((id) => [id, {
      revisionShortBody: MOCK_BODIES[id] === null ? undefined : Array.from(MOCK_BODIES[id] ?? '').slice(0, 350).join(''),
    }]));
    return new Response(JSON.stringify({ data: info }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }
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

## コンパクトな一覧
$pagelist(/TechKnowhow, limit=2, excerptlength=80, excerptlines=1)

## 詳しく読む
$pagelist(/TechKnowhow, view=card, limit=2, excerptlength=350, excerptlines=5)

## タイトルだけの一覧
$pagelist(/TechKnowhow, limit=3, excerpt=false)
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