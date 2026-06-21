# 水面リップル背景エフェクト ― 引継ぎ資料

最終更新: 2026-06-13

## 1. プロジェクト概要

マウス操作で波紋が広がるWebGL(+Canvas2Dフォールバック)背景エフェクトのツール。
`index.html` をブラウザ(Chrome/Edge推奨)で開くだけで動作する単体Webアプリ。

きっかけは X(旧Twitter)のviral投稿(konmari氏、Claude Fable 5の作例)で、
「キラキラ水面に桜の花びらが揺れる」デモを参考に、同種のインタラクティブ水面エフェクトを自作した。

## 2. ファイル構成

```
C:\便利＆ユニークツール制作\水面リップル背景エフェクト\
├── index.html      … ページ本体・設定パネルUI
├── style.css       … レイアウト・パネルのスタイル
├── ripple.js       … 波紋シミュレーション本体(WebGL / Canvas2D両対応、メイン実装)
├── bg.jpg          … 背景画像(候補1: ミント×桜ピンクのキラキラ水面、採用済み)
├── bg-data.js      … bg.jpgをbase64データURL化したもの(file://でのCORS回避用)
├── bg-candidate1.png/2.png/3.png … Codexで生成した背景候補3案(削除権限なく残存、無害)
├── README.md       … 使い方・技術メモ
└── HANDOFF.md       … このファイル
```

## 3. これまでの作業内容(完了済み)

1. **ツール本体の実装**: ピンポンフレームバッファ方式のWebGL波紋シミュレーション
   + 屈折表現のレンダリング。WebGL非対応環境向けにCanvas2Dのタイル変位フォールバックも実装。
2. **背景画像の組込み**: Codexで背景画像を生成し `bg.jpg` として保存。
3. **動作確認・バグ修正**:
   - `style.css` の `.fallback` に `[hidden]` 時の `display: none` 指定が無く、
     フォールバック表示が常時前面に出てしまう問題を修正(`.fallback[hidden] { display: none; }` を追加)。
   - `file://` で開いた際、`bg.jpg` を `texImage2D` に渡すと
     クロスオリジン `SecurityError` が発生する問題を、`bg.jpg` をbase64の
     data URLとして埋め込んだ `bg-data.js` を用意し回避(`window.BG_DATA_URL` を `ripple.js` が優先利用)。
4. **視覚改善(透明感・自然な波・キラキラ反射)**:
   - 波紋伝播を4方向→8方向(上下左右+斜め)加重平均に変更し、より円形・滑らかに伝わるよう調整
     (WebGLの`UPDATE_SHADER`、Canvas2Dの`updateSimulation()`の両方に適用)。
   - `RENDER_SHADER` に薄い水色のティント(`waterTint`)を追加し、水面の透明感を表現。
   - 波の起伏が大きい箇所に、時間で揺らぐハッシュノイズベースのキラキラ輝点(スパークル)を追加。
     `uTime` ユニフォームを新設し、`frame(time, drops)` 内で `gl.uniform1f(renderProg.uniforms['uTime'], time / 1000)` を設定。
   - Canvas2Dフォールバック側にも同等のティントオーバーレイ・スパークル(`sparkleHash()`)を実装し、
     `render(time)` に時刻を渡すよう変更。
5. **背景画像の再生成・選定**:
   - Codexに3案の背景候補(①昼の桜×ミント、②夕暮れ〜夜の星空、③クリアブルー陽光)を生成依頼。
   - ユーザーが**候補1(昼の桜×ミントのキラキラ水面)**を選択。
   - `bg-candidate1.png` → JPEG変換して `bg.jpg` に上書き、`bg-data.js` を再生成済み。

## 4. 現在の状態

- 上記すべての修正・改善は `ripple.js` / `style.css` / `index.html` / `bg.jpg` / `bg-data.js` に
  反映済み。**ユーザー側での動作確認はまだ未実施**(直近の視覚改善+新背景画像の反映後、
  ブラウザでの見た目チェックはこれから)。
- `bg-candidate1.png`, `bg-candidate2.png`, `bg-candidate3.png` は削除しようとしたが
  権限エラーで失敗し、フォルダに残存。動作には影響しないが、不要であればユーザー自身で削除可能。

## 5. 次にやること(候補)

- ブラウザで `index.html` を開き、新しい背景・キラキラ反射・透明感のある波紋を実際に確認する。
- 見た目の微調整が必要な場合:
  - `ripple.js` の `RENDER_SHADER`(WebGL)と `create2DRenderer` 内 `render()`(Canvas2D)の
    `waterTint` の色・係数、スパークルの出現頻度(`step(0.985, ...)` のしきい値)、
    強さ(`sparkle * 1.6` など)を調整。
  - 波紋の伝わり方は `UPDATE_SHADER` / `updateSimulation()` の重み(0.2 / 0.05)で調整可能。
- 不要な `bg-candidate*.png` をユーザー側で削除(任意)。

## 6. 技術メモ・注意点

- WebGL1ベース。シミュレーション解像度は最大480pxに制限してパフォーマンスを確保。
- 高さマップは `(c.rg - 0.5) * 2.0` でデコード/エンコードする独自フォーマット。
- `file://` で画像を扱う場合は必ず `bg-data.js` のようなdata URL埋め込みでCORS回避が必要
  (新しい背景画像に差し替える際も同様の手順が必要)。
- bashサンドボックス経由でこのフォルダ内の `ripple.js` を直接編集・検証すると、
  マウントが古いキャッシュを返すことがある(過去に発生)。編集はファイルツール(Read/Edit/Write)を使い、
  整合性確認もファイルツールのRead結果を信頼すること。
