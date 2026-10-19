# テストおよびローカル動作確認（Sandbox）仕様書

## 1. Vitest による自動テスト（`npm test`）
`test/plugin.spec.ts` で以下の7項目を検証すること。
1. **`package.json` 検証**: `name` が `"growi-plugin-pagelist"` かつ `growiPlugin.schemaVersion` が `"4"` であること。
2. **AST変換検証**: `$pagelist(/Tech, limit=6, recursive=false, sort=popular, tag=pickup, view=card, newdays=7)` のすべての属性が `<growi-pagelist>` の `hProperties` に正しくマッピングされること。
3. **再帰探索（`recursive=true`）と自ページ除外検証**: 起点ページ自身が除外され、サブフォルダ以下の全階層が表示されること。
4. **直下のみ探索（`recursive=false`）検証**: サブフォルダの深い階層が除外され、直下1階層のみが表示されること。
5. **人気ランキングソート（`sort=popular` / `likes` / `views`）検証**: `seenUsers` や `liker` の件数に応じて正しく降順ソートされ、ランキング順位バッジやメトリクスが表示されること。
6. **タグ抽出（`tag=pickup`）とカード表示（`view=card`）検証**: `/_api/search` が呼ばれ、カードレイアウト（`pagelist-view-card`）で描画されること。
7. **アクティベート検証**: `window.pluginActivators['growi-plugin-pagelist'].activate()` により View / Preview の両方にプラグインが登録されること。

## 2. ローカルSandbox（`npm run dev`）
- `dev/sandbox.tsx` において、トップページの「おすすめ（`tag=pickup, view=card`）」「人気ランキング（`sort=popular`）」「最新ノウハウ（`sort=updatedAt, newdays=3`）」の3つを1画面でプレビューできるようにモックデータを整備する。
