# リファレンス実装コード集（パターン1完全版）

## 1. `package.json`
```json
{
  "name": "growi-plugin-pagelist",
  "version": "1.0.0",
  "description": "社内ノウハウポータル向け：最新・人気ランキング・おすすめタグ抽出・カード表示に対応したGROWI配下ページ一覧プラグイン",
  "license": "MIT",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc --noEmit && vite build",
    "test": "vitest run",
    "test:watch": "vitest",
    "verify:build": "node scripts/verify-build.mjs"
  },
  "growiPlugin": {
    "schemaVersion": "4",
    "types": [
      "script"
    ]
  },
  "dependencies": {
    "@growi/pluginkit": "^1.2.8",
    "@growi/remark-growi-directive": "^1.0.0",
    "unist-util-visit": "^5.0.0"
  },
  "devDependencies": {
    "@testing-library/jest-dom": "^6.5.0",
    "@testing-library/react": "^16.0.0",
    "@types/mdast": "^4.0.0",
    "@types/node": "^22.0.0",
    "@types/react": "^18.3.0",
    "@types/react-dom": "^18.3.0",
    "@vitejs/plugin-react": "^4.3.0",
    "jsdom": "^25.0.0",
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "react-markdown": "^9.0.1",
    "remark-parse": "^11.0.0",
    "remark-rehype": "^11.1.0",
    "typescript": "^5.5.0",
    "unified": "^11.0.5",
    "vite": "^5.4.0",
    "vitest": "^2.1.0"
  }
}
```

## 2. `tsconfig.json` ＆ `vite.config.ts`

### `tsconfig.json`
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true
  },
  "include": ["client-entry.tsx", "src", "dev", "test"]
}
```

### `vite.config.ts`
```typescript
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig(({ command }) => ({
  plugins: [react()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    manifest: true,
    rollupOptions:
      command === 'build'
        ? {
            input: 'client-entry.tsx',
          }
        : undefined,
  },
  test: {
    environment: 'jsdom',
    globals: true,
  },
}));
```

## 3. `src/remark-pagelist.ts`
```typescript
import type {
  LeafGrowiPluginDirective,
  TextGrowiPluginDirective,
} from '@growi/remark-growi-directive';
import type { Root } from 'mdast';
import type { Plugin } from 'unified';
import { visit } from 'unist-util-visit';

/**
 * $pagelist(...) 記法を解析し、カスタム要素 <growi-pagelist> に変換するRemarkプラグイン
 * 対応オプション: path(または第1引数), limit(num), recursive, sort, tag, view, newdays
 */
export const remarkPageListPlugin: Plugin<[], Root> = () => {
  return (tree) => {
    visit(tree, (node) => {
      if (
        node.type !== 'textGrowiPluginDirective' &&
        node.type !== 'leafGrowiPluginDirective'
      ) {
        return;
      }

      const directiveNode = node as
        | TextGrowiPluginDirective
        | LeafGrowiPluginDirective;

      if (directiveNode.name !== 'pagelist') {
        return;
      }

      const data = directiveNode.data ?? (directiveNode.data = {});
      const attributes = directiveNode.attributes ?? {};

      // 予約キー以外の空文字値を持つキーを第1引数（対象パス）として扱う
      const reservedKeys = new Set([
        'recursive',
        'reverse',
        'card',
        'list',
        'popular',
        'views',
        'likes',
      ]);
      const positionalPathEntry = Object.entries(attributes).find(
        ([key, value]) => value === '' && !reservedKeys.has(key)
      );

      // tag指定のみの場合は全体（"/"）をデフォルトの探索範囲とするため空文字のまま渡す
      const targetPath = positionalPathEntry
        ? positionalPathEntry[0]
        : (attributes.path ?? '');

      const limit = attributes.limit ?? attributes.num ?? '10';

      const recursiveAttr = attributes.recursive;
      const recursive =
        recursiveAttr !== undefined &&
        recursiveAttr.toLowerCase().trim() === 'false'
          ? 'false'
          : 'true';

      // ソート順: updatedAt | createdAt | popular | views | likes
      const sort = (attributes.sort ?? 'updatedAt').trim();

      // タグ抽出（おすすめ・必読ページ用）
      const tag = (attributes.tag ?? '').trim();

      // 表示モード: list | card
      const view =
        (attributes.view ?? 'list').toLowerCase().trim() === 'card'
          ? 'card'
          : 'list';

      // NEWバッジを表示する日数（デフォルト3日）
      const newdays = (attributes.newdays ?? '3').trim();

      data.hName = 'growi-pagelist';
      data.hProperties = {
        targetpath: targetPath.trim(),
        limit: String(limit).trim(),
        recursive,
        sort,
        tag,
        view,
        newdays,
      };
    });
  };
};
```

## 4. `src/components/SubordinatedPageList.tsx`
```tsx
import type React from 'react';

/**
 * GROWIのページデータ型（一覧APIおよび検索APIの両レスポンスに対応）
 */
export interface GrowiPageItem {
  _id: string;
  path: string;
  updatedAt: string;
  createdAt?: string;
  seenUsers?: string[];
  liker?: string[];
  commentCount?: number;
  lastUpdateUser?: {
    name?: string;
    username: string;
    imageUrlCached?: string;
  };
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

/**
 * パス文字列を正規化する（先頭スラッシュ付与、末尾スラッシュ除去）
 */
export const normalizeGrowiPath = (rawPath: string): string => {
  const trimmed = rawPath.trim();
  if (!trimmed || trimmed === '/') {
    return '/';
  }
  const withLeadingSlash = trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
  return withLeadingSlash.replace(/\/+$/, '');
};

/**
 * ページタイトル（パスの最終セグメント）を抽出するヘルパー
 */
export const extractPageTitle = (pagePath: string): string => {
  const normalized = normalizeGrowiPath(pagePath);
  if (normalized === '/') return '/';
  const segments = normalized.split('/');
  return segments[segments.length - 1] || normalized;
};

/**
 * 閲覧者数・いいね数を安全に取得するヘルパー
 */
export const getViewsCount = (page: GrowiPageItem): number =>
  Array.isArray(page.seenUsers) ? page.seenUsers.length : 0;

export const getLikesCount = (page: GrowiPageItem): number =>
  Array.isArray(page.liker) ? page.liker.length : 0;

/**
 * 人気総合スコア（いいね数×2 ＋ 閲覧者数）を算出する
 */
export const getPopularScore = (page: GrowiPageItem): number =>
  getLikesCount(page) * 2 + getViewsCount(page);

/**
 * 起点ページ自身を除外し、recursive設定に応じて階層フィルタを行う純粋関数
 */
export const filterPagesByHierarchy = (
  pages: GrowiPageItem[],
  basePath: string,
  isRecursive: boolean
): GrowiPageItem[] => {
  const normalizedBase = normalizeGrowiPath(basePath);
  const prefix = normalizedBase === '/' ? '/' : `${normalizedBase}/`;

  return pages.filter((page) => {
    const normalizedPagePath = normalizeGrowiPath(page.path);

    // 起点ページ自身は除外
    if (normalizedPagePath === normalizedBase) {
      return false;
    }

    if (!normalizedPagePath.startsWith(prefix)) {
      return false;
    }

    if (isRecursive) {
      return true;
    }

    const relativePath = normalizedPagePath.slice(prefix.length);
    return !relativePath.includes('/');
  });
};

/**
 * 指定されたソートモードに従ってページ配列を並び替える純粋関数
 */
export const sortPages = (
  pages: GrowiPageItem[],
  sortMode: SortMode
): GrowiPageItem[] => {
  return [...pages].sort((a, b) => {
    switch (sortMode) {
      case 'popular': {
        const diff = getPopularScore(b) - getPopularScore(a);
        if (diff !== 0) return diff;
        break;
      }
      case 'views': {
        const diff = getViewsCount(b) - getViewsCount(a);
        if (diff !== 0) return diff;
        break;
      }
      case 'likes': {
        const diff = getLikesCount(b) - getLikesCount(a);
        if (diff !== 0) return diff;
        break;
      }
      case 'createdAt': {
        const dateA = new Date(a.createdAt ?? a.updatedAt).getTime();
        const dateB = new Date(b.createdAt ?? b.updatedAt).getTime();
        return dateB - dateA;
      }
      default:
        break;
    }
    // 同点時およびデフォルト（updatedAt）は更新日時の降順
    return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
  });
};

/**
 * GROWI本体のReactインスタンスを受け取ってコンポーネントを生成するファクトリ関数
 */
export const createSubordinatedPageList = (ReactInstance: typeof React) => {
  const { useState, useEffect } = ReactInstance;

  return function SubordinatedPageList({
    targetpath,
    limit = '10',
    recursive = 'true',
    sort = 'updatedAt',
    tag = '',
    view = 'list',
    newdays = '3',
  }: SubordinatedPageListProps): React.ReactElement {
    const [pages, setPages] = useState<GrowiPageItem[]>([]);
    const [totalCount, setTotalCount] = useState<number>(0);
    const [currentPage, setCurrentPage] = useState<number>(1);
    const [isLoading, setIsLoading] = useState<boolean>(true);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);

    // タグ指定がありパス未指定の場合は、Wiki全体（"/"）を探索対象とする
    const trimmedTag = tag.trim();
    const rawPath =
      targetpath && targetpath.trim() !== ''
        ? targetpath.trim()
        : trimmedTag !== ''
          ? '/'
          : decodeURIComponent(window.location.pathname);
    const resolvedPath = normalizeGrowiPath(rawPath);

    const limitNumber = Math.max(1, Number.parseInt(limit, 10) || 10);
    const isRecursive = recursive.toLowerCase() !== 'false';
    const sortMode = (
      ['updatedAt', 'createdAt', 'popular', 'views', 'likes'].includes(sort)
        ? sort
        : 'updatedAt'
    ) as SortMode;
    const viewMode: ViewMode =
      view.toLowerCase() === 'card' ? 'card' : 'list';
    const newDaysNumber = Math.max(0, Number.parseInt(newdays, 10) || 0);

    const isRankingMode =
      sortMode === 'popular' || sortMode === 'views' || sortMode === 'likes';
    // クライアント側で全件ソートや階層フィルタが必要なケースかどうか
    const requiresClientSidePagination =
      trimmedTag !== '' || isRankingMode || !isRecursive;

    useEffect(() => {
      setCurrentPage(1);
    }, [resolvedPath, limitNumber, isRecursive, sortMode, trimmedTag]);

    useEffect(() => {
      let isMounted = true;

      const fetchPagesData = async () => {
        setIsLoading(true);
        setErrorMessage(null);

        try {
          let rawPages: GrowiPageItem[] = [];
          let apiTotal = 0;

          if (trimmedTag !== '') {
            // 1. タグ指定時は /_api/search を呼び出してタグ検索を行う
            const searchQuery =
              resolvedPath !== '/'
                ? `tag:${trimmedTag} prefix:${resolvedPath}`
                : `tag:${trimmedTag}`;
            const params = new URLSearchParams({
              q: searchQuery,
              limit: '100',
              offset: '0',
            });
            const response = await fetch(`/_api/search?${params.toString()}`, {
              method: 'GET',
              headers: { 'Content-Type': 'application/json' },
              credentials: 'same-origin',
            });
            if (!response.ok) {
              throw new Error(
                `タグ検索APIの取得に失敗しました (HTTP ${response.status})`
              );
            }
            const json = await response.json();
            // GROWIの /_api/search は data 配列内の pageData または直接ページオブジェクトを返す
            const list = Array.isArray(json.data)
              ? json.data.map((item: any) => item.pageData ?? item)
              : Array.isArray(json.pages)
                ? json.pages
                : [];
            rawPages = list;
            apiTotal = rawPages.length;
          } else {
            // 2. 通常時は /_api/v3/pages/list を呼び出す
            const fetchLimit = requiresClientSidePagination ? 100 : limitNumber;
            const fetchPage = requiresClientSidePagination ? 1 : currentPage;
            const params = new URLSearchParams({
              path: resolvedPath,
              limit: String(fetchLimit),
              page: String(fetchPage),
            });

            const response = await fetch(
              `/_api/v3/pages/list?${params.toString()}`,
              {
                method: 'GET',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'same-origin',
              }
            );
            if (!response.ok) {
              throw new Error(
                `ページ一覧の取得に失敗しました (HTTP ${response.status})`
              );
            }
            const json = await response.json();
            rawPages = Array.isArray(json.pages) ? json.pages : [];
            apiTotal =
              typeof json.totalCount === 'number'
                ? json.totalCount
                : rawPages.length;
          }

          if (!isMounted) return;

          // 起点ページ自身の除外および階層フィルタ
          const filtered = filterPagesByHierarchy(
            rawPages,
            resolvedPath,
            isRecursive
          );

          // 指定されたソートモードで並び替え
          const sorted = sortPages(filtered, sortMode);

          if (requiresClientSidePagination) {
            const start = (currentPage - 1) * limitNumber;
            setPages(sorted.slice(start, start + limitNumber));
            setTotalCount(sorted.length);
          } else {
            const selfIncluded = rawPages.some(
              (p) => normalizeGrowiPath(p.path) === resolvedPath
            );
            setPages(sorted);
            setTotalCount(Math.max(0, apiTotal - (selfIncluded ? 1 : 0)));
          }
        } catch (err) {
          if (!isMounted) return;
          setErrorMessage(
            err instanceof Error
              ? err.message
              : '予期せぬエラーが発生しました'
          );
        } finally {
          if (isMounted) {
            setIsLoading(false);
          }
        }
      };

      void fetchPagesData();

      return () => {
        isMounted = false;
      };
    }, [
      resolvedPath,
      limitNumber,
      currentPage,
      isRecursive,
      sortMode,
      trimmedTag,
      requiresClientSidePagination,
    ]);

    // NEWバッジ判定ヘルパー
    const isNewPage = (updatedAt: string): boolean => {
      if (newDaysNumber <= 0) return false;
      const diffMs = Date.now() - new Date(updatedAt).getTime();
      return diffMs >= 0 && diffMs <= newDaysNumber * 24 * 60 * 60 * 1000;
    };

    if (isLoading) {
      return (
        <div className="text-muted my-2" data-testid="pagelist-loading">
          ページ一覧を読み込み中...
        </div>
      );
    }

    if (errorMessage) {
      return (
        <div className="alert alert-warning my-2" data-testid="pagelist-error">
          {errorMessage}
        </div>
      );
    }

    if (pages.length === 0) {
      return (
        <div className="text-muted my-2" data-testid="pagelist-empty">
          該当するページはありません。
        </div>
      );
    }

    const totalPages = Math.max(1, Math.ceil(totalCount / limitNumber));

    return (
      <div className="page-list my-3" data-testid="pagelist-container">
        {/* ヘッダー情報バー */}
        <div className="d-flex flex-wrap justify-content-between align-items-center mb-2 gap-1">
          <small className="text-muted d-flex align-items-center gap-1 flex-wrap">
            <span>
              対象: <code>{resolvedPath}</code>
            </span>
            {trimmedTag !== '' && (
              <span className="badge bg-warning-subtle text-dark border">
                🏷️ tag: {trimmedTag}
              </span>
            )}
            <span className="badge bg-secondary-subtle text-secondary">
              {isRecursive ? 'recursive' : '直下のみ'}
            </span>
            {isRankingMode && (
              <span className="badge bg-danger-subtle text-danger">
                🔥 ランキング ({sortMode})
              </span>
            )}
            <span>（全 {totalCount} 件）</span>
          </small>
        </div>

        {/* カードグリッド表示モード (view=card) */}
        {viewMode === 'card' ? (
          <div
            className="row row-cols-1 row-cols-md-2 g-3"
            data-testid="pagelist-view-card"
          >
            {pages.map((page, idx) => {
              const rank = (currentPage - 1) * limitNumber + idx + 1;
              const title = extractPageTitle(page.path);
              const formattedDate = new Date(
                page.updatedAt
              ).toLocaleDateString('ja-JP');
              const userName =
                page.lastUpdateUser?.name ||
                page.lastUpdateUser?.username ||
                'Unknown';
              const views = getViewsCount(page);
              const likes = getLikesCount(page);

              return (
                <div className="col" key={page._id}>
                  <div className="card h-100 shadow-sm border-secondary-subtle">
                    <div className="card-body d-flex flex-column justify-content-between py-2 px-3">
                      <div>
                        <div className="d-flex justify-content-between align-items-start gap-2 mb-1">
                          <a
                            href={page.path}
                            className="fw-bold text-decoration-none text-break"
                          >
                            {isRankingMode && (
                              <span className="badge bg-dark me-1">
                                #{rank}
                              </span>
                            )}
                            {title}
                          </a>
                          {isNewPage(page.updatedAt) && (
                            <span className="badge bg-danger flex-shrink-0">
                              NEW
                            </span>
                          )}
                        </div>
                        <div className="small text-muted text-truncate mb-2">
                          {page.path}
                        </div>
                      </div>

                      <div className="d-flex justify-content-between align-items-center border-top pt-2 mt-1 small text-muted">
                        <span>👤 {userName}</span>
                        <div className="d-flex align-items-center gap-2">
                          {(isRankingMode || views > 0) && (
                            <span title="閲覧者数">👀 {views}</span>
                          )}
                          {(isRankingMode || likes > 0) && (
                            <span title="いいね数">❤️ {likes}</span>
                          )}
                          <span>{formattedDate}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          /* フラットリスト表示モード (view=list) */
          <ul
            className="page-list-ul page-list-ul-flat list-group list-group-flush border rounded"
            data-testid="pagelist-view-list"
          >
            {pages.map((page, idx) => {
              const rank = (currentPage - 1) * limitNumber + idx + 1;
              const formattedDate = new Date(page.updatedAt).toLocaleString(
                'ja-JP'
              );
              const userName =
                page.lastUpdateUser?.name ||
                page.lastUpdateUser?.username ||
                'Unknown';
              const userAvatar = page.lastUpdateUser?.imageUrlCached;
              const views = getViewsCount(page);
              const likes = getLikesCount(page);

              return (
                <li
                  key={page._id}
                  className="list-group-item d-flex justify-content-between align-items-center py-2"
                >
                  <div className="d-flex align-items-center text-truncate me-2">
                    {isRankingMode && (
                      <span
                        className={`badge me-2 flex-shrink-0 ${
                          rank === 1
                            ? 'bg-warning text-dark'
                            : rank === 2
                              ? 'bg-secondary'
                              : rank === 3
                                ? 'bg-info text-dark'
                                : 'bg-light text-secondary border'
                        }`}
                        data-testid={`pagelist-rank-${rank}`}
                      >
                        {rank <= 3 ? `👑 ${rank}位` : `${rank}位`}
                      </span>
                    )}

                    {userAvatar ? (
                      <img
                        src={userAvatar}
                        alt={userName}
                        title={userName}
                        className="rounded-circle me-2 flex-shrink-0"
                        style={{
                          width: '20px',
                          height: '20px',
                          objectFit: 'cover',
                        }}
                      />
                    ) : (
                      <span
                        className="badge rounded-pill bg-secondary me-2 flex-shrink-0"
                        title={userName}
                      >
                        {userName.slice(0, 1).toUpperCase()}
                      </span>
                    )}

                    <a
                      href={page.path}
                      className="text-break fw-bold text-decoration-none me-2"
                    >
                      {page.path}
                    </a>

                    {isNewPage(page.updatedAt) && (
                      <span
                        className="badge bg-danger flex-shrink-0"
                        data-testid="pagelist-new-badge"
                      >
                        NEW
                      </span>
                    )}
                  </div>

                  <div className="d-flex align-items-center gap-2 flex-shrink-0">
                    {(isRankingMode || views > 0) && (
                      <span
                        className="badge bg-light text-secondary border"
                        title="閲覧者数"
                      >
                        👀 {views}
                      </span>
                    )}
                    {(isRankingMode || likes > 0) && (
                      <span
                        className="badge bg-light text-danger border"
                        title="いいね数"
                      >
                        ❤️ {likes}
                      </span>
                    )}
                    <span className="badge bg-light text-secondary border">
                      {formattedDate}
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        {/* ページネーション */}
        {totalPages > 1 && (
          <div className="d-flex justify-content-center align-items-center gap-2 mt-2">
            <button
              type="button"
              className="btn btn-sm btn-outline-secondary"
              disabled={currentPage <= 1}
              onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
            >
              前へ
            </button>
            <span className="small text-muted" data-testid="pagelist-page-info">
              {currentPage} / {totalPages}
            </span>
            <button
              type="button"
              className="btn btn-sm btn-outline-secondary"
              disabled={currentPage >= totalPages}
              onClick={() =>
                setCurrentPage((prev) => Math.min(totalPages, prev + 1))
              }
            >
              次へ
            </button>
          </div>
        )}
      </div>
    );
  };
};
```

## 5. `client-entry.tsx`
```tsx
import { growiReact } from '@growi/pluginkit/dist/v4/client';
import React from 'react';
import { createSubordinatedPageList } from './src/components/SubordinatedPageList';
import { remarkPageListPlugin } from './src/remark-pagelist';

export const PLUGIN_NAME = 'growi-plugin-pagelist';

declare global {
  interface Window {
    growiFacade?: {
      react?: typeof React;
      markdownRenderer?: {
        optionsGenerators?: {
          customGenerateViewOptions?: (...args: any[]) => any;
          generateViewOptions?: (...args: any[]) => any;
          customGeneratePreviewOptions?: (...args: any[]) => any;
          generatePreviewOptions?: (...args: any[]) => any;
        };
      };
    };
    pluginActivators?: Record<
      string,
      {
        activate: () => void;
        deactivate: () => void;
      }
    >;
  }
}

export const activate = (): void => {
  if (
    typeof window === 'undefined' ||
    window.growiFacade == null ||
    window.growiFacade.markdownRenderer == null
  ) {
    return;
  }

  const { optionsGenerators } = window.growiFacade.markdownRenderer;
  if (optionsGenerators == null) {
    return;
  }

  let ReactInstance = React;
  try {
    ReactInstance = growiReact(React) ?? React;
  } catch {
    ReactInstance = window.growiFacade.react ?? React;
  }

  const SubordinatedPageList = createSubordinatedPageList(ReactInstance);

  const wrapOptionsGenerator = (
    originalGenerator: (...args: any[]) => any
  ) => {
    return (...args: any[]) => {
      const options = originalGenerator(...args);
      options.remarkPlugins = options.remarkPlugins ?? [];
      options.remarkPlugins.push(remarkPageListPlugin);

      options.components = {
        ...options.components,
        'growi-pagelist': SubordinatedPageList,
      };

      return options;
    };
  };

  const originalView =
    optionsGenerators.customGenerateViewOptions ??
    optionsGenerators.generateViewOptions;
  if (originalView != null) {
    optionsGenerators.customGenerateViewOptions =
      wrapOptionsGenerator(originalView);
  }

  const originalPreview =
    optionsGenerators.customGeneratePreviewOptions ??
    optionsGenerators.generatePreviewOptions;
  if (originalPreview != null) {
    optionsGenerators.customGeneratePreviewOptions =
      wrapOptionsGenerator(originalPreview);
  }
};

export const deactivate = (): void => {};

if (typeof window !== 'undefined') {
  window.pluginActivators = window.pluginActivators ?? {};
  window.pluginActivators[PLUGIN_NAME] = {
    activate,
    deactivate,
  };
}
```

## 6. `index.html` ＆ `dev/sandbox.tsx`

### `index.html`
```html
<!DOCTYPE html>
<html lang="ja">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>growi-plugin-pagelist Local Sandbox</title>
    <link
      href="[https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css](https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css)"
      rel="stylesheet"
    />
  </head>
  <body class="bg-light">
    <div id="root"></div>
    <script type="module" src="/dev/sandbox.tsx"></script>
  </body>
</html>
```

### `dev/sandbox.tsx`
```tsx
import remarkGrowiDirective from '@growi/remark-growi-directive';
import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import Markdown from 'react-markdown';
import {
  createSubordinatedPageList,
  type GrowiPageItem,
} from '../src/components/SubordinatedPageList';
import { remarkPageListPlugin } from '../src/remark-pagelist';

// 閲覧者数・いいね数・タグ付きのモックデータ
const MOCK_PAGES: (GrowiPageItem & { tags?: string[] })[] = [
  {
    _id: 'self',
    path: '/TechKnowhow',
    updatedAt: new Date().toISOString(),
    seenUsers: ['u1'],
    liker: [],
    lastUpdateUser: { name: '管理者', username: 'admin' },
  },
  {
    _id: 'p1',
    path: '/TechKnowhow/Git_GitHub_Flow_Guide',
    updatedAt: new Date(Date.now() - 1000 * 60 * 60 * 5).toISOString(), // 5時間前 (NEW)
    seenUsers: ['u1', 'u2', 'u3', 'u4', 'u5', 'u6', 'u7', 'u8'],
    liker: ['u1', 'u2', 'u3', 'u4', 'u5'],
    tags: ['pickup', '必読'],
    lastUpdateUser: { name: '山田 太郎', username: 'taro' },
  },
  {
    _id: 'p2',
    path: '/TechKnowhow/Azure/Fabric_Architecture_BestPractices',
    updatedAt: new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString(), // 1日前 (NEW)
    seenUsers: ['u1', 'u2', 'u3', 'u4', 'u5', 'u6'],
    liker: ['u1', 'u2', 'u3', 'u4'],
    tags: ['pickup'],
    lastUpdateUser: { name: '佐藤 花子', username: 'hanako' },
  },
  {
    _id: 'p3',
    path: '/TechKnowhow/CSharp/DotNet_Performance_Tuning',
    updatedAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 10).toISOString(), // 10日前
    seenUsers: ['u1', 'u2', 'u3', 'u4', 'u5', 'u6', 'u7', 'u8', 'u9', 'u10'],
    liker: ['u1', 'u2'],
    tags: ['pickup'],
    lastUpdateUser: { name: '鈴木 一郎', username: 'ichiro' },
  },
  {
    _id: 'p4',
    path: '/TechKnowhow/Trouble/VPN_Connection_Issue',
    updatedAt: new Date(Date.now() - 1000 * 60 * 60 * 2).toISOString(), // 2時間前 (NEW)
    seenUsers: ['u1', 'u2'],
    liker: ['u1'],
    tags: [],
    lastUpdateUser: { name: '高橋 健太', username: 'kenta' },
  },
];

const originalFetch = window.fetch.bind(window);
window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
  const urlStr = typeof input === 'string' ? input : input.toString();

  if (urlStr.startsWith('/_api/search')) {
    const url = new URL(urlStr, window.location.origin);
    const q = url.searchParams.get('q') ?? '';
    const tagMatch = q.match(/tag:([^\s]+)/);
    const targetTag = tagMatch ? tagMatch[1] : '';
    const matched = MOCK_PAGES.filter((p) => p.tags?.includes(targetTag));
    return new Response(JSON.stringify({ data: matched }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (urlStr.startsWith('/_api/v3/pages/list')) {
    return new Response(
      JSON.stringify({
        pages: MOCK_PAGES,
        totalCount: MOCK_PAGES.length,
        limit: 10,
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  }

  return originalFetch(input, init);
};

const SubordinatedPageList = createSubordinatedPageList(React);

const INITIAL_MARKDOWN = `# 🏢 社内ノウハウポータル プレビュー

## ⭐ おすすめ・必読ノウハウ（タグ抽出 ＋ カード表示）
$pagelist(tag=pickup, view=card, limit=4)

## 🔥 人気のノウハウランキング（人気スコア順）
$pagelist(/TechKnowhow, sort=popular, limit=5)

## 🆕 最新の技術ノウハウ（更新日時順 ＋ NEWバッジ）
$pagelist(/TechKnowhow, sort=updatedAt, limit=5, newdays=3)
`;

const markdownComponents: Record<string, React.ComponentType<any>> = {
  'growi-pagelist': SubordinatedPageList,
};

const SandboxApp: React.FC = () => {
  const [markdown, setMarkdown] = useState<string>(INITIAL_MARKDOWN);
  return (
    <div className="container py-4">
      <h2 className="mb-3">growi-plugin-pagelist Sandbox (パターン1完全版)</h2>
      <div className="row g-4">
        <div className="col-md-5">
          <textarea
            className="form-control font-monospace"
            rows={18}
            value={markdown}
            onChange={(e) => setMarkdown(e.target.value)}
          />
        </div>
        <div className="col-md-7">
          <div className="card p-3 bg-white shadow-sm">
            <Markdown components="{markdownComponents}" remarkPageListPlugin]} remarkPlugins="{[remarkGrowiDirective,">
              {markdown}
            </Markdown>
          </div>
        </div>
      </div>
    </div>
  );
};

const root = document.getElementById('root');
if (root) createRoot(root).render(<SandboxApp/>);
```

## 7. `scripts/verify-build.mjs`
```javascript
import fs from 'node:fs';
import path from 'node:path';

const manifestCandidates = [
  path.resolve('dist/.vite/manifest.json'),
  path.resolve('dist/manifest.json'),
];
const manifestPath = manifestCandidates.find((p) => fs.existsSync(p));
if (!manifestPath) {
  console.error('❌ manifest.json が見つかりません');
  process.exit(1);
}
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
if (!manifest['client-entry.tsx']) {
  console.error('❌ client-entry.tsx キーがありません');
  process.exit(1);
}
console.log('✅ ビルド成果物検証OK:', manifest['client-entry.tsx'].file);
```
