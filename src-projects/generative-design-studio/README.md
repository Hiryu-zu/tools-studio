# Generative Design Studio

ジェネラティブ・インタラクティブ背景エフェクトのスタジオ。
共通エンジンの上に「エフェクト」を差し替える構造で、新作を量産しやすくしたもの。

現在のエフェクト:
- **星の軌跡** … 天の極を中心に星が周回し尾を引く（Canvas2D）
- **水面リップル** … マウスで波紋が広がる水面（WebGL、星形きらめき・プロシージャル背景）

## 必要環境

- Node.js 18 以上（`node -v` で確認）

## セットアップ

```bash
cd generative-design-studio
npm install
npm run dev
```

表示された `http://localhost:5173` をブラウザで開く。

## ビルド / プレビュー

```bash
npm run build     # 型チェック + 本番ビルド (dist/)
npm run preview   # dist をローカルで確認
```

`vite.config.ts` の `base: './'` により、`dist/` はそのまま静的ホスティング（Vercel/Netlify/GitHub Pages）に置けます。

## 操作

- 右上のパネルでエフェクト切替・パラメータ調整・再生/一時停止・リセット。
- **星の軌跡**: 画面クリックで極（回転中心）を移動。
- **水面リップル**: マウス移動・クリックで波紋。

## 構成

```
src/
  engine/      共通エンジン（ループ・リサイズ・入力・effect切替）
    Engine.ts
    types.ts   Effect インターフェース / 型
  effects/     各エフェクト（Effect を実装）
    StarTrailEffect.ts
    RippleEffect.ts
    registry.ts   切替メニューの登録
  ui/
    Controls.ts   Tweakpane UI
  main.ts
  style.css
```

## 新しいエフェクトの追加

1. `src/effects/MyEffect.ts` を作り `Effect` を実装（`init/resize/frame` ＋ 任意で `pointer/reset/buildControls`）。
2. `src/effects/registry.ts` の `effects` 配列に1行追加。

## 次のステップ（技術要件ドキュメント参照）

- ポストプロセス（Bloom 等）での品質向上
- プリセット保存・URL共有、録画書き出し（MediaRecorder/CCapture）
- Vitest / Playwright（ビジュアル回帰）と CI、Vercel/Netlify デプロイ

## メモ

- 水面リップルの背景は外部画像に依存せずプロシージャル生成（自己完結）。実画像に差し替える場合は `public/` に画像を置き、`RippleEffect.makeBackground` を画像読み込みに変更。
