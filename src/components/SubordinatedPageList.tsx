import type React from 'react';
import '../pagelist.css';

// 一覧APIと検索APIに共通する最小限のページ情報です。
export interface GrowiPageItem {
  _id: string;
  path: string;
  updatedAt: string;
  createdAt?: string;
  seenUsers?: unknown[];
  liker?: unknown[];
  lastUpdateUser?: { name?: string; username: string; imageUrlCached?: string };
}
export type SortMode = 'updatedAt' | 'createdAt' | 'popular' | 'views' | 'likes';
export type ViewMode = 'list' | 'card';
export interface SubordinatedPageListProps {
  targetpath?: string;
  limit?: string;
  recursive?: string;
  sort?: string;
  tag?: string;
  view?: string;
  newdays?: string;
}

// 末尾スラッシュを揃え、/Tech と /Technology を別階層として扱います。
export const normalizeGrowiPath = (raw: string): string => {
  const path = raw.trim();
  return path && path !== '/' ? `/${path.replace(/^\/+|\/+$/g, '')}` : '/';
};
export const extractPageTitle = (path: string): string => normalizeGrowiPath(path).split('/').pop() || '/';
export const getViewsCount = (page: GrowiPageItem): number => Array.isArray(page.seenUsers) ? page.seenUsers.length : 0;
export const getLikesCount = (page: GrowiPageItem): number => Array.isArray(page.liker) ? page.liker.length : 0;
export const getPopularScore = (page: GrowiPageItem): number => getLikesCount(page) * 2 + getViewsCount(page);
export const filterPagesByHierarchy = (pages: GrowiPageItem[], base: string, recursive: boolean): GrowiPageItem[] => {
  const normalized = normalizeGrowiPath(base);
  const prefix = normalized === '/' ? '/' : `${normalized}/`;
  return pages.filter((page) => {
    const path = normalizeGrowiPath(page.path);
    return path !== normalized && path.startsWith(prefix) && (recursive || !path.slice(prefix.length).includes('/'));
  });
};
const timestamp = (date: string): number => Date.parse(date) || 0;
export const sortPages = (pages: GrowiPageItem[], mode: SortMode): GrowiPageItem[] => [...pages].sort((left, right) => {
  let difference = 0;
  if (mode === 'popular') difference = getPopularScore(right) - getPopularScore(left);
  if (mode === 'views') difference = getViewsCount(right) - getViewsCount(left);
  if (mode === 'likes') difference = getLikesCount(right) - getLikesCount(left);
  if (mode === 'createdAt') difference = timestamp(right.createdAt ?? right.updatedAt) - timestamp(left.createdAt ?? left.updatedAt);
  return difference || timestamp(right.updatedAt) - timestamp(left.updatedAt) || left.path.localeCompare(right.path);
});
const integer = (value: string, fallback: number, minimum: number): number => {
  const parsed = Number(value);
  return value.trim() !== '' && Number.isSafeInteger(parsed) && parsed >= minimum ? parsed : fallback;
};
const currentPath = (): string => {
  try { return normalizeGrowiPath(decodeURIComponent(window.location.pathname)); }
  catch { return normalizeGrowiPath(window.location.pathname); }
};

// v3のdata.pagesと旧形式のpages、検索結果のdata[].pageDataを同じ形式に揃えます。
const unpackResponse = (json: unknown): { pages: GrowiPageItem[]; total?: number } => {
  const root = json as Record<string, unknown>;
  if (!root || typeof root !== 'object') throw new Error('APIの応答形式が不正です。');
  const body = root.data && !Array.isArray(root.data) && typeof root.data === 'object'
    ? root.data as Record<string, unknown> : root;
  const list = Array.isArray(body.pages) ? body.pages : Array.isArray(root.data) ? root.data : undefined;
  if (!list) throw new Error('APIの応答にページ一覧がありません。');
  const pages = list.map((item: unknown) => {
    const record = item as Record<string, unknown>;
    return record?.pageData ?? record;
  }).filter((item): item is GrowiPageItem => Boolean(item && typeof item === 'object' &&
    typeof (item as GrowiPageItem).path === 'string' && typeof (item as GrowiPageItem).updatedAt === 'string'));
  const meta = (root.meta ?? {}) as Record<string, unknown>;
  const total = body.totalCount ?? body.total ?? root.totalCount ?? root.total ?? meta.total;
  return { pages, total: typeof total === 'number' ? total : undefined };
};

// 100件を超える母集団も取り切り、ページごとのソートでランキングが変動することを防ぎます。
const fetchAllPages = async (path: string, tag: string, batchSize: number, signal: AbortSignal): Promise<GrowiPageItem[]> => {
  const collected = new Map<string, GrowiPageItem>();
  let received = 0;
  for (let page = 1; ; page += 1) {
    const params = tag ? new URLSearchParams({
      q: `tag:${tag}${path === '/' ? '' : ` prefix:${path}`}`,
      limit: String(batchSize), offset: String((page - 1) * batchSize),
    }) : new URLSearchParams({ path, limit: String(batchSize), page: String(page) });
    const response = await fetch(`${tag ? '/_api/search' : '/_api/v3/pages/list'}?${params}`, {
      method: 'GET', credentials: 'same-origin', signal,
    });
    if (!response.ok) throw new Error(`${tag ? 'タグ検索' : 'ページ一覧'}の取得に失敗しました (HTTP ${response.status})`);
    const result = unpackResponse(await response.json());
    const before = collected.size;
    result.pages.forEach((item) => collected.set(item._id ?? item.path, item));
    received += result.pages.length;
    if (result.total !== undefined && received >= result.total) break;
    if (result.pages.length < batchSize && result.total === undefined) break;
    if (result.pages.length === 0 || collected.size === before) {
      if (result.total !== undefined && received < result.total) throw new Error('APIから続きのページを取得できませんでした。');
      break;
    }
  }
  return [...collected.values()];
};

// JSXも受け取ったReact.createElementを使い、本体と異なるReactのHooksを呼ばない構造にします。
export const createSubordinatedPageList = (ReactInstance: typeof React) => {
  const React = ReactInstance;
  const { useEffect, useState } = ReactInstance;
  return function SubordinatedPageList({ targetpath, limit = '10', recursive = 'true', sort = 'updatedAt', tag = '', view = 'list', newdays = '3' }: SubordinatedPageListProps): React.ReactElement {
    const selfPath = currentPath();
    const trimmedTag = tag.trim();
    const resolvedPath = normalizeGrowiPath(targetpath?.trim() || (trimmedTag ? '/' : selfPath));
    const limitNumber = integer(limit, 10, 1);
    const newDays = integer(newdays, 3, 0);
    const isRecursive = recursive.trim().toLowerCase() !== 'false';
    const sortMode: SortMode = ['updatedAt', 'createdAt', 'popular', 'views', 'likes'].includes(sort) ? sort as SortMode : 'updatedAt';
    const ranking = ['popular', 'views', 'likes'].includes(sortMode);
    const batchSize = trimmedTag || ranking || !isRecursive ? 100 : limitNumber;
    const [result, setResult] = useState<{ pages: GrowiPageItem[]; loading: boolean; error: string | null }>({ pages: [], loading: true, error: null });
    const [currentPage, setCurrentPage] = useState(1);
    const [retry, setRetry] = useState(0);

    useEffect(() => {
      const controller = new AbortController();
      setResult({ pages: [], loading: true, error: null });
      setCurrentPage(1);
      void fetchAllPages(resolvedPath, trimmedTag, batchSize, controller.signal).then((pages) => {
        if (!controller.signal.aborted) setResult({ pages, loading: false, error: null });
      }).catch((error: unknown) => {
        if (!controller.signal.aborted) setResult({ pages: [], loading: false, error: error instanceof Error ? error.message : 'ページを取得できませんでした。' });
      });
      return () => controller.abort();
    }, [resolvedPath, trimmedTag, batchSize, retry]);
    useEffect(() => { setCurrentPage(1); }, [limitNumber, isRecursive, sortMode]);

    const sorted = sortPages(filterPagesByHierarchy(result.pages, resolvedPath, isRecursive)
      .filter((page) => normalizeGrowiPath(page.path) !== selfPath), sortMode);
    const totalPages = Math.max(1, Math.ceil(sorted.length / limitNumber));
    const activePage = Math.min(currentPage, totalPages);
    const pages = sorted.slice((activePage - 1) * limitNumber, activePage * limitNumber);
    if (result.loading) return <div className="growi-pagelist" role="status" data-testid="pagelist-loading">ページ一覧を読み込み中...</div>;
    if (result.error) return <div className="growi-pagelist" role="alert" data-testid="pagelist-error">{result.error} <button type="button" onClick={() => setRetry(retry + 1)}>再試行</button></div>;
    if (!pages.length) return <div className="growi-pagelist" data-testid="pagelist-empty">該当するページはありません。</div>;

    const pageContent = (page: GrowiPageItem, index: number) => {
      const rank = (activePage - 1) * limitNumber + index + 1;
      const age = Date.now() - timestamp(page.updatedAt);
      const isNew = newDays > 0 && age >= 0 && age <= newDays * 86400000;
      const user = page.lastUpdateUser;
      const name = user?.name || user?.username || '不明';
      return <>
        <div className="pagelist-title-row">
          {ranking && <span className={`pagelist-rank pagelist-rank-${Math.min(rank, 4)}`} data-testid={`pagelist-rank-${rank}`}>{rank <= 3 ? '♛ ' : ''}{rank}位</span>}
          <a className="pagelist-link" href={encodeURI(normalizeGrowiPath(page.path))}>{view === 'card' ? extractPageTitle(page.path) : page.path}</a>
          {isNew && <span className="pagelist-new" data-testid="pagelist-new-badge">NEW</span>}
        </div>
        {view === 'card' && <div className="pagelist-path">{page.path}</div>}
        <div className="pagelist-metadata">
          <span className="pagelist-author">{user?.imageUrlCached && <img src={user.imageUrlCached} alt="" width="20" height="20" loading="lazy" />}{name}</span>
          <span title="閲覧者数">閲覧 {getViewsCount(page)}</span>
          <span title="いいね数">いいね {getLikesCount(page)}</span>
          <time dateTime={page.updatedAt}>{new Date(page.updatedAt).toLocaleDateString('ja-JP')}</time>
        </div>
      </>;
    };
    return <div className="growi-pagelist page-list my-3" data-testid="pagelist-container">
      <div className="pagelist-summary"><code>{resolvedPath}</code>{trimmedTag && <span>#{trimmedTag}</span>}<span>全 {sorted.length} 件</span></div>
      {view === 'card'
        ? <div className="pagelist-grid row row-cols-1 row-cols-md-2 g-3" data-testid="pagelist-view-card">{pages.map((page, index) => <div className="col" key={page._id ?? page.path}><article className="card h-100">{pageContent(page, index)}</article></div>)}</div>
        : <ul className="pagelist-list" data-testid="pagelist-view-list">{pages.map((page, index) => <li key={page._id ?? page.path}>{pageContent(page, index)}</li>)}</ul>}
      {totalPages > 1 && <nav className="pagelist-pagination" aria-label="ページ一覧のページ送り">
        <button type="button" title="前のページ" aria-label="前へ" disabled={activePage === 1} onClick={() => setCurrentPage(activePage - 1)}>←</button>
        <span data-testid="pagelist-page-info">{activePage} / {totalPages}</span>
        <button type="button" title="次のページ" aria-label="次へ" disabled={activePage === totalPages} onClick={() => setCurrentPage(activePage + 1)}>→</button>
      </nav>}
    </div>;
  };
};