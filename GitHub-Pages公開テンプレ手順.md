# GitHub + Pages 公開テンプレ手順

新しいツール集フォルダを GitHub で管理し、スマホからも確認できるよう
GitHub Pages で公開するための再利用テンプレ。`<...>` を差し替えて使う。

---

## このリポジトリの確定情報（tools-studio）

| 項目 | 値 |
|------|----|
| オーナー | Hiryu-zu |
| リポジトリ名 | tools-studio |
| 公開設定 | Public |
| リモートURL | `https://github.com/Hiryu-zu/tools-studio.git` |
| 公開トップURL（Pages有効化後） | `https://hiryu-zu.github.io/tools-studio/` |

---

## STEP 0: 事前準備（初回のみ）

- Git をインストール済みか確認: PowerShellで `git --version`
- 名前とメールを設定（未設定なら）:
  ```powershell
  git config --global user.name "Hiryu-zu"
  git config --global user.email "ogayu0206@gmail.com"
  ```

## STEP 1: GitHubで空リポジトリを作成

1. https://github.com/new を開く
2. Repository name: `<リポジトリ名>`（英小文字ハイフン推奨）
3. Description: 任意
4. **Public** を選択
5. **README / .gitignore / license は付けない**（ローカルから push するため空で作る）
6. 「Create repository」

> ※今回の tools-studio は作成済み。

## STEP 2: ローカルを push（Windowsで実行）

PowerShell で対象フォルダに入って実行。**このフォルダ専用の確定コマンド:**

```powershell
cd "C:\便利＆ユニークツール制作"

# 過去の作りかけ/不要ファイルを掃除（無ければ無視される）
Remove-Item -Recurse -Force .git, state.json, __deltest.txt -ErrorAction SilentlyContinue

git init
git branch -M main
git add -A
git commit -m "初回: ツール集を sites/tools/assets/docs 構成で公開"
git remote add origin https://github.com/Hiryu-zu/tools-studio.git
git push -u origin main
```

- 認証画面が出たら「Sign in with browser」でログイン。
- `node_modules/` 等は `.gitignore` 済みなので push されない。

## STEP 3: GitHub Pages を有効化

1. リポジトリの **Settings → Pages**
2. Build and deployment → Source: **Deploy from a branch**
3. Branch: **main** / フォルダ: **/ (root)** → **Save**
4. 1〜2分待つと上部に公開URLが表示される:
   `https://hiryu-zu.github.io/tools-studio/`
5. そのURLをスマホでブックマーク。トップから各サイトへ移動できる。

## STEP 4: 以降の更新フロー

成果物を追加・修正したら、フォルダ4分類（sites / tools / assets / docs）に従って配置し:

```powershell
cd "C:\便利＆ユニークツール制作"
git add -A
git commit -m "<変更内容を日本語1行で>"
git push
```

push するだけで Pages に自動反映される（反映に1〜2分）。

---

## 新しいプロジェクトを足すときのテンプレ

1. ブラウザで動くもの → `sites/<英名>/` に入れ、入口は `index.html`
2. ルートの `index.html`（一覧トップ）にカードを1枚追記:
   ```html
   <a class="card" href="./sites/<英名>/">
     <h2><span class="ico">🔧</span><日本語タイトル></h2>
     <p><1行説明></p>
     <span class="tag">動くサイト</span>
   </a>
   ```
3. `git add -A && git commit -m "追加: <名前>" && git push`

## 注意点メモ

- フォルダ名は英小文字ハイフン（日本語名はPagesのURLで崩れる）。
- Vite等ビルドが要るものは `src-projects/` にソース、ビルド成果を `sites/` に置く。
- Private にすると無料プランでは Pages が使えない（Public 必須）。
- 監視ツール実行中は `Claude-Codex残量モニタ` 等がロックされ移動/削除できない。停止してから整理する。
