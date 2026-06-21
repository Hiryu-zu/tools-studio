# 便利＆ユニークツール制作

個人制作のWebツール／ジェネラティブ背景エフェクト集。
GitHub で管理し、**GitHub Pages** でスマホからも各成果物を確認できる。

公開トップ（Pages有効化後）: `https://<ユーザー名>.github.io/<リポジトリ名>/`

## 構成

```
├─ index.html          一覧トップ（全サイトへのカード型リンク）
├─ sites/              【Pages公開】動くウェブサイトだけを置く
│   ├─ star-trail/                星の軌跡アニメーション
│   ├─ water-ripple/              水面リップル背景エフェクト
│   ├─ aspect-ratio-tool/         画像比率変換ツール
│   └─ generative-design-studio/  Generative Design Studio（ビルド済み）
├─ tools/             【非公開】ローカル実行ツール（codex-usage-monitor）
├─ assets/            【非公開】サイトでない素材（note-css-themes）
├─ docs/              メモ・仕様・参考リンク（_archive に退避物）
├─ src-projects/      ビルドが必要なプロジェクトのソース
│   └─ generative-design-studio/  Vite/TypeScript ソース
└─ フォルダ整理ルール.md  運用ルール（命名・置き場所・gitignore）
```

整理ルールの詳細は [フォルダ整理ルール.md](./フォルダ整理ルール.md) を参照。

## 置き場所の判断（4分類）

- ブラウザで開いて動く → `sites/`
- PC上で実行するツール（Python/bat等）→ `tools/`
- 単体では動かない部品・素材 → `assets/`
- 文章・メモ・仕様 → `docs/`

## Generative Design Studio の再ビルド

このサイトだけ Vite/TypeScript 製。ソースを直したら再ビルドして `sites/` を更新する。

バンドラ（rollup）が使える環境（Windowsローカル等）なら:

```bash
cd src-projects/generative-design-studio
npx vite build          # dist/ が生成される
# dist/ の中身を sites/generative-design-studio/ にコピー
```

バンドラが使えない環境向けの軽量ビルド（importmap + CDN方式・現在の公開物はこちら）:

```bash
cd src-projects/generative-design-studio
npx tsc -p tsconfig.build.json   # _jsbuild/ にJS出力
node build-nobundle.mjs          # import文をブラウザ用に書き換え
# _jsbuild/ を sites/generative-design-studio/js/ にコピー
```

three.js / tweakpane は `index.html` の importmap 経由で esm.sh から読み込む。

## GitHub Pages 公開手順

1. GitHubに空リポジトリを作成し、`git remote add origin <URL>` → `git push -u origin main`
2. リポジトリ Settings → Pages → Source: `main` / `/ (root)` を選択
3. 数分後、トップURLをスマホでブックマーク。以後は `git push` で更新が反映される
