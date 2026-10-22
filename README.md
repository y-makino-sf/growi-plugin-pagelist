# growi-plugin-pagelist

![GROWI Compatibility](https://img.shields.io/badge/GROWI-v6%20%7C%20v7%20%7C%20v8-blue)
![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6)
![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)

GROWIの未作成ページに自動表示される「配下のページ一覧」をさらに進化させ、**社内ノウハウDBやポータルのトップページに必要な「最新のページ」「人気のページ（ランキング）」「おすすめページ（タグ抽出・カード表示）」を `$pagelist()` 記法ひとつで自在に埋め込めるようにする**スクリプトプラグインです。

---

## 💡 開発の背景と解決したい課題（Why this plugin?）

GROWIを社内ノウハウDBとして運用する際、トップページや各部門ポータルで以下の課題を解決するために開発されました。

1. **親ページを作成しても「サブフォルダ以下の最新一覧」を表示したい**
   - GROWI標準では親ページを作成すると未作成時の一覧が消えてしまいますが、`$pagelist()` を貼るだけでサブフォルダ以下すべて（`recursive=true`）の最新ページ一覧をページネーション付きで表示できます。
2. **埋もれた良記事を発掘する「人気ランキング」を自動表示したい**
   - 閲覧者数（👀）やいいね数（❤️）を集計し、王冠バッジ付きのランキング形式で人気ノウハウを自動表示します（`sort=popular` / `views` / `likes`）。
3. **トップページを手動更新せずに「おすすめ・必読記事」を華やかに飾りたい**
   - 各記事に `pickup` などのタグを付けるだけで自動収集し、2列のグリッドカード（`view=card`）でトップページにハイライト表示できます（`tag=pickup, view=card`）。

---

## 🚀 使い方（Usage）

### 1. 最新のページ一覧を表示する（基本形・NEWバッジ付き）
指定パス配下のサブフォルダ以下すべてを再帰探索し、更新日時の新しい順で表示します（直近3日以内の記事には `NEW` バッジが付きます）。
```markdown
$pagelist()
$pagelist(/TechKnowhow, limit=10, newdays=3)
```

### 2. 人気のページランキングを表示する（`sort=popular` / `views` / `likes`）
社内でよく読まれている・いいねが多い記事をランキング表示します。
```markdown
<!-- 総合人気スコア順（いいね数×2 ＋ 閲覧者数） -->
$pagelist(/TechKnowhow, sort=popular, limit=5)

<!-- 純粋な閲覧者数順 / いいね数順 -->
$pagelist(/TechKnowhow, sort=views, limit=5)
$pagelist(/TechKnowhow, sort=likes, limit=5)
```

### 3. おすすめ・必読ページをカード形式で飾る（`tag` ＋ `view=card`）
特定のタグが付いた記事を自動抽出し、ポータル向けのグリッドカード形式で表示します。
```markdown
$pagelist(tag=pickup, view=card, limit=6)
```

### 4. 直下の階層（1階層下）のみを表示する（`recursive=false`）
サブフォルダの深い階層は除外し、直下のページのみを表示します。
```markdown
$pagelist(/Engineering/Guides, recursive=false)
```

### 5. 本文抜粋の表示量を調整する
カード・リストの両方に、親パス、更新者アイコン、タイトル、足跡（閲覧者数）、本文抜粋を表示します。抜粋は既定で200文字以内・最大3行です。
```markdown
<!-- 抜粋なし。抜粋用APIも呼びません -->
$pagelist(/TechKnowhow, excerpt=false)

<!-- 小さく表示 -->
$pagelist(/TechKnowhow, view=card, excerptlength=80, excerptlines=1)

<!-- 多めに表示 -->
$pagelist(/TechKnowhow, view=card, excerptlength=350, excerptlines=5)
```
文字数で切り詰めた後に行数を制限するため、画面幅によって実際に見える文字数は変わります。短い本文に固定の高さは設けません。

---

## ⚙️ オプション一覧

| オプション | 指定例 | デフォルト値 | 説明 |
| :--- | :--- | :--- | :--- |
| **対象パス** | `$pagelist(/Tech)`<br>`$pagelist(path=/Tech)` | 現在のページパス | 探索起点となる親ページのパス（自ページは自動除外）。 |
| **`limit`** (`num`) | `limit=5` | `10` | 1ページあたりの表示件数。 |
| **`recursive`** | `recursive=true`<br>`recursive=false` | `true` | `true`: サブフォルダ以下全階層を再帰探索。<br>`false`: 直下の1階層のみ探索。 |
| **`sort`** | `sort=updatedAt`<br>`sort=createdAt`<br>`sort=popular`<br>`sort=views`<br>`sort=likes` | `updatedAt` | 並び順の指定。`popular` / `views` / `likes` 指定時はランキング順位バッジと閲覧数・いいね数を表示。 |
| **`tag`** | `tag=pickup` | なし | 指定したタグが付いているページを抽出（`/_api/search` 連動）。 |
| **`view`** | `view=list`<br>`view=card` | `list` | `list`: フラットな1列リスト表示。<br>`card`: 2列のBootstrapグリッドカード表示。 |
| **`newdays`** | `newdays=3` | `3` | 指定日数以内に更新された記事に `NEW` バッジを付与（`0` で非表示）。 |
| **`excerpt`** | `excerpt=true` / `excerpt=false` | `true` | 抜粋の表示／非表示。`false` は文字数・行数指定より優先し、抜粋用の追加通信と表示領域を省略。 |
| **`excerptlength`** | `excerptlength=80` | `200` | プレーンテキスト化した抜粋の最大文字数（1〜350）。末尾の省略記号も含む。 |
| **`excerptlines`** | `excerptlines=1` | `3` | 抜粋の最大行数（1〜10）。カード・リスト共通。 |

抜粋の数値指定は正の整数です。未指定・空・0・負数・小数・非数値は既定値、上限を超える正の整数は上限になります。`excerpt` は前後空白と大文字小文字を正規化し、`true` / `false` 以外は既定値に戻します。

---

## 📦 インストール方法（GROWIへの導入）

1. GROWIの **「管理画面」** ＞ **「プラグイン」** を開きます。
2. **「プラグインをインストール」** から以下のリポジトリURLを入力します。
   ```text
   https://github.com/<あなたのGitHubアカウント名>/growi-plugin-pagelist
   ```

---

## 🛠️ 開発・ローカル検証コマンド（Windows PowerShell対応）

```powershell
# 依存パッケージのインストール
npm install

# ローカルSandboxの起動（http://localhost:5173 で最新・人気・おすすめカードをライブ検証）
npm run dev

# 単体テストの実行（Vitest）
npm test

# 本番ビルドとマニフェスト検証（※GitHubへPushする際は dist/ ごとコミットしてください）
npm run build
npm run verify:build
```

### 実装・検証上の補足

- `tag` のみを指定するとWiki全体（`/`）を検索します。範囲を限定する場合は `path` も指定してください。
- 起点ページに加え、表示中のページも一覧から除外します。
- 全体の並び順と除外後のページ送りを正確にするため、APIの続きを取得してからソート・階層フィルタ・ページ分割を行います。人気順・タグ検索・直下探索は100件単位、通常一覧は `limit` 単位で取得します。大規模Wikiでは対象パスを絞ってください。
- API応答の `pages`、`data.pages`、検索の `data[].pageData` を処理します。API失敗時はエラーと再試行ボタンを表示します。
- 抜粋はGROWI 7.1.9の標準 `/_api/v3/page-listing/info`（`attachShortBody=true`）から、表示中のページIDだけを50件ずつ直列で取得します。本文全体の個別取得は行いません。
- このAPIの取得上限は元Markdownの冒頭350文字です。MarkdownやHTMLの装飾を除いた結果は指定文字数より短いことがあります。HTMLは実行せず、検索ハイライトもHTMLとして描画しません。
- 足跡数は `seenUsers` の件数で、同じ利用者による再読込を加算するPVではありません。更新者画像がない／読み込めない場合は頭文字アイコンを表示します。
- 抜粋取得に失敗してもタイトル・リンクは残り、抜粋だけを再試行できます。空本文や本文情報が返らない記事は抜粋を省略します。本文欠落だけから権限不足と断定しません。
- 抜粋の成功結果はコンポーネント内でIDと更新日時に紐付けて保持します。ページを戻る場合や文字数・行数だけの変更では再取得せず、一覧の再取得時には無効化します。永続キャッシュは使用しません。
- SandboxはローカルのモックAPIを使います。Markdown編集と初期化はヘッダーのツールボタンで操作できます。既存ポートが使用中ならViteが別ポートで起動します。
- Sandboxは3種類の既存一覧に加え、1行・5行・抜粋なしの表示例を含みます。URLに `?mockExcerptError=500`（または403/404）を付けると抜粋取得失敗を確認できます。
- 単体テストは必須7項目と抜粋・非同期処理の境界値を含む40ケースです。本番ビルドではソース・Sandbox・テストの型も検査します。
- `dist/.vite/manifest.json` と生成JS/CSSを必ず配布リポジトリへ含めてください。`npm run verify:build` は固定エントリと成果物を検証します。
- GROWI v6/v7/v8の実サーバーでの疎通・権限制御・検索設定の確認は別途必要です。ローカルテストは各バージョンでの動作保証を代替しません。
- 抜粋APIはGROWI 7.1.9の公式コードに基づく実装です。同バージョンの実機でのView/Preview、標準一覧との比較、権限制限ページ、本文更新後の再表示は未検証です。v6/v8の抜粋API互換性も未検証です。

---

## 📄 ライセンス

[MIT License](./LICENSE)
