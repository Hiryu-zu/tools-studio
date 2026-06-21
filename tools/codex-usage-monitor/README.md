# Claude Code / Codex 使用量ダッシュボード

ローカルの Claude Code (`~/.claude`) と Codex CLI (`~/.codex`) のログを解析し、
トークン使用量・コスト・セッション・ツール使用回数・メモリ/システム情報を可視化します。
依存ゼロ・自己完結の単一HTMLダッシュボードです。

## 使い方

1. データを生成（同じフォルダで実行）:
   ```
   python collect.py
   ```
   → `usage_data.json` が出力されます。標準パスを自動検出します。

2. `dashboard.html` をブラウザで開き、`usage_data.json` をドラッグ&ドロップ。
   - 動作確認だけなら右上の「デモデータ」ボタンでサンプル表示できます。

### ワンファイルにまとめたい場合
```
python collect.py --build-html
```
→ データを埋め込んだ `usage_dashboard_filled.html`（ダブルクリックで開く完全自己完結版）を生成します。

### オプション
- `python collect.py --claude <path> --codex <path>` … ログ場所を明示指定
- メモリ/プロセス情報には psutil が必要: `pip install psutil`

## 拡張方法（拡張性）

- **新しいデータ源を足す**: `collect.py` の `COLLECTORS` リストに
  「`agg` に書き込む関数」を1つ追加するだけ。出力JSONに新キーが増えます。
- **新しいグラフ/パネルを足す**: `dashboard.html` の `registerPanel({...})` を呼ぶだけ。
  `has(data)` でデータ有無を判定し、`render(el, data)` で自由に描画できます。
  データが無いパネルは自動的に非表示になります。
- **料金単価の更新**: `collect.py` 冒頭の `PRICING` テーブルを書き換え。

## 注意
- コストは `PRICING` テーブルに基づく概算です。
- Claude Code の JSONL はストリーミング途中値を含むことがあり、トークン数は目安です。
- すべてローカルで完結し、外部送信はありません。

---

# ライブ残量モニタ（リアルタイムに「あとどれくらい残っているか」）

過去消費の集計（上）とは別に、Claude / Codex の**レート残量（5時間枠・週枠）**を
常時表示するライブモニタです。「あと何％残っていて、いつリセットされるか」を一目で把握できます。

## 使い方

```
python monitor.py
```

→ `http://localhost:8787/live_dashboard.html` が開けるようになります（ブラウザでアクセス）。
60秒ごとに残量を取得し、画面は自動更新＋リセットまでの残り時間を毎秒カウントダウンします。

- 動作確認だけ: `python monitor.py --demo`（サンプル表示）
- 1回だけ取得してJSON出力: `python monitor.py --once`
- ポート変更: `python monitor.py --port 9000`

## 取得元（非公開・非保証のエンドポイント）

- **Claude**: `GET https://api.anthropic.com/api/oauth/usage`
  - トークン: `~/.claude/.credentials.json` の `claudeAiOauth.accessToken`
    （macOSはキーチェーン、または環境変数 `CLAUDE_OAUTH_TOKEN` で上書き可）
  - ヘッダ `anthropic-beta: oauth-2025-04-20` が必要
- **Codex**: `codex app-server` に JSON-RPC で `initialize` → `account/rateLimits/read`
  - `codex` CLI がインストール・ログイン済みであること

> これらはCLIのバージョンでフィールド名やエンドポイントが変わりうる「自分用」前提のAPIです。
> 高頻度アクセスは429になるため、最短55秒のキャッシュを入れています。
> （参考にした記事: tatsuya582氏「Claude Code と Codex のレート残量を確認するために…」）

## 拡張方法

- **対象を増やす**: `monitor.py` の `PROVIDERS` に「provider dict を返す関数」を追加。
- **見た目を変える**: `live_dashboard.html` の `winRow()` / 色しきい値 `colorFor()` を編集。

## ファイル構成

| ファイル | 役割 |
|---|---|
| `monitor.py` | 残量取得デーモン＋localhost配信（ライブ残量モニタ） |
| `live_dashboard.html` | 残量ゲージUI（自動更新） |
| `collect.py` | 過去消費の集計（トークン/コスト/セッション/メモリ） |
| `dashboard.html` | 過去消費の分析ダッシュボード |

## Windows補足（実機調査の結果）

- **Codex**: `codex` がPATHに無くても、`%LOCALAPPDATA%\OpenAI\Codex\bin\codex.exe` などの
  既定インストール先を自動探索します。明示指定したい場合は環境変数 `CODEX_BIN` にパスを設定。
- **Claude**: ログイン情報は `~/.claude/.credentials.json` か **Windows資格情報マネージャー**
  （`Claude Code-credentials`）の両方を見ます。Claude Code CLI 未ログインだと「未ログイン」表示になります。
  - 有効化するには Claude Code CLI を入れてログイン:
    ```
    npm install -g @anthropic-ai/claude-code
    claude            # 起動して /login でサインイン
    ```
  - もしくは環境変数 `CLAUDE_OAUTH_TOKEN` にトークンを設定。

---

# フォルダ構成と自動起動（PC起動時にバックグラウンド常駐）

このツール一式は `Claude-Codex残量モニタ` フォルダにまとまっています。

## 自動起動を有効にする
`install_autostart.bat` を**ダブルクリック**するだけ。
- スタートアップに `ClaudeCodexMonitor.vbs` を登録（次回PC起動時から、コンソール非表示でバックグラウンド起動）
- その場でモニタを起動し、ダッシュボードをブラウザで開く

以後はPCを起動すると自動で `localhost:8787` が立ち上がります。`ダッシュボードを開く.url` をダブルクリックすればいつでも残量画面を開けます（タスクバーやスタートにピン留めも可）。

## 自動起動を解除する
`uninstall_autostart.bat` をダブルクリック（スタートアップ登録を削除）。

## ファイル一覧
| ファイル | 役割 |
|---|---|
| `monitor.py` | 残量取得＋localhost配信の本体 |
| `live_dashboard.html` | 残量ゲージUI |
| `monitor_hidden.vbs` | コンソール非表示で起動するランチャ |
| `install_autostart.bat` / `uninstall_autostart.bat` | 自動起動の登録／解除 |
| `start_monitor.bat` | 手動起動（コンソール表示・デバッグ用） |
| `ダッシュボードを開く.url` | ダッシュボードへのショートカット |
| `collect.py` / `dashboard.html` | 過去消費の集計・分析（別機能） |

> 備考: バックグラウンド起動は `python` を非表示ウィンドウで実行します。`python` がPATHにある前提です。

## モニタを手動で再起動したいとき
`restart_monitor.bat` をダブルクリック（8787を掴んでいるプロセスを解放してクリーンに起動し直します）。
