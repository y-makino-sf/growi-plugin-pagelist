# テストおよびローカル動作確認（Sandbox）仕様書

## 1. Vitest による自動テスト（`npm test`）
`test/plugin.spec.ts` で以下の7項目を検証すること。
1. **`package.json` 検証**: `name` が `"growi-plugin-pagelist"` かつ `growiPlugin.schemaVersion` が `"4"` であること。
2. **AST変換検証**: `$pagelist(/Tech, limit=6, recursive=false, sort=popular, tag=pickup, view=card, newdays=7, excerpt=false, excerptlength=80, excerptlines=1)` のすべての属性が `<growi-pagelist>` の `hProperties` に正しくマッピングされること。未指定時は抜粋あり・200文字・3行とする。
3. **再帰探索（`recursive=true`）と自ページ除外検証**: 起点ページ自身が除外され、サブフォルダ以下の全階層が表示されること。
4. **直下のみ探索（`recursive=false`）検証**: サブフォルダの深い階層が除外され、直下1階層のみが表示されること。
5. **人気ランキングソート（`sort=popular` / `likes` / `views`）検証**: `seenUsers` や `liker` の件数に応じて正しく降順ソートされ、ランキング順位バッジやメトリクスが表示されること。
6. **タグ抽出（`tag=pickup`）とカード表示（`view=card`）検証**: `/_api/search` が呼ばれ、カードレイアウト（`pagelist-view-card`）で描画されること。
7. **アクティベート検証**: `window.pluginActivators['growi-plugin-pagelist'].activate()` により View / Preview の両方にプラグインが登録されること。

## 2. ローカルSandbox（`npm run dev`）
- `dev/sandbox.tsx` において、トップページの「おすすめ（`tag=pickup, view=card`）」「人気ランキング（`sort=popular`）」「最新ノウハウ（`sort=updatedAt, newdays=3`）」の3つを1画面でプレビューできるようにモックデータを整備する。
- 一覧APIとは別に `/_api/v3/page-listing/info` をモックし、ID別の `revisionShortBody` を返す。本文は元Markdown350文字の取得上限を再現する。
- 1行80文字、5行350文字、抜粋なしの例も用意する。既存のMarkdownエディターから記法を変更して動作確認する。
- 日本語・装飾・長文・画像あり／なし・空本文・本文欠落のケースを含める。外部画像サービスを使わず、更新者画像はローカル生成のPNGとする。
- URLの `?mockExcerptError=403` / `404` / `500` で、抜粋API失敗時にも一覧が残ることを確認できる。

## 3. 抜粋と非同期処理の自動検証

現在の合計は40ケース。既存の17ケースを維持し、整形4ケース・取得表示19ケースを追加する。

- 通常／タグ検索 × カード／リストの4経路で、親パス・アイコン・タイトル・足跡・抜粋を表示する。
- `pageIds[]` が1件でも配列で送られ、表示中のIDだけに限定されること。
- `excerpt=false` の非表示・追加API呼び出し0・文字数や行数より優先すること。
- 文字数・行数の既定値／上限／不正値、文字数制限の省略記号、絵文字、HTML非挿入、Markdownのテキスト化。
- 文字数・行数・viewだけの変更では再取得せず、ページ送り／戻る操作でキャッシュを使用すること。
- 空本文と本文欠落の区別、50件ごとの取得、部分失敗時の成功分維持、403/404/500の再試行。
- オンオフ変更／ページ切替／アンマウント時の中止と古い応答の無視、対象・更新日時変更時の再取得、空結果でHooks順序を保つこと。
- アバター画像の読込失敗を代替表示へ切り替えること。

## 4. ブラウザと実機の確認

1. ローカルの1280px／375pxで、カード2列／1列、横はみ出しなし、画像描画、1・3・5行のclamp、短文が自然な高さになることを確認する。
2. Markdown編集、抜粋オフ、ページ送りを操作し、追加APIが表示対象だけに限定されることを確認する。
3. `npm test`、`npm run build`、`npm run verify:build` を実行し、manifestとJS/CSSを生成する。
4. GROWI 7.1.9実機が利用可能になったら、未作成親ページの標準一覧との比較、View/Preview、権限制限ページ、本文更新後の再表示、実API疎通を確認する。ローカル結果だけで実機動作を保証しない。
