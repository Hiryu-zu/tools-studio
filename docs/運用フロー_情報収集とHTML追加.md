# 運用フロー — 情報収集 と HTML追加

「調べる（ローカル）」と「公開する（GitHub）」の2トラックで回す。

```
[情報収集フォルダ：ローカル・非公開]        [tools-studio：GitHub・公開]
 inbox → sources → projects → outputs            sites/      … 自作の動くサイト
        └→ 厳選リスト(jisaku-idea-list)  ──橋渡し──→  gallery/    … 見つけたもの
```

---

## トラックA：情報収集（ローカルのまま）

1. 新しく気になるサイト/ツールを見つけたら、生データは今まで通り
   `情報収集/research` に貯める（inbox→sources→…）。
2. 「試したい・残したい」と思ったものだけ、**厳選リスト**
   （`research/projects/jisaku-idea-list-*.md` のような current なメモ）に
   名前・概要・URL を1行追記する。これが公開ギャラリーへの橋渡しになる。
3. `.env` などの秘密情報はここから外に出さない（公開リポジトリに入れない）。

## トラックB：HTMLの追加（公開側）

足すものは2種類。どちらも最後は `git add -A && git commit && git push` で反映。

### B-1. 見つけた他者のサイト/ツール → ギャラリーに追加

`gallery/data.js` の該当カテゴリの `items` に、次を1ブロック貼るだけ：

```js
{
  name: "ツール名",
  desc: "1〜2行の概要。",
  chips: ["タグ1", "タグ2"],
  links: [ { label: "表示名", url: "https://..." } ]   // 無ければ links: []
},
```

HTML本体（`gallery/index.html`）は触らなくてよい（data.jsを読むだけ）。

### B-2. 自分で作った動くサイト → sites/ に追加

1. `sites/<英名>/` を作り、入口を `index.html` にする
2. トップ `index.html` のカード一覧に1枚追記（既存カードをコピーして書き換え）
3. ビルドが要るもの（Vite等）は `src-projects/` にソース、成果を `sites/` へ

## モバイルからのとき

スマホで思いついたら `inbox/` に「これをギャラリーに追加して」とURL付きでメモを置く
→ PC側で `git pull` して取り込み、data.js に反映して push。
（将来は inbox の自動チェックで半自動化も可能。検討案は docs/inbox自動処理_検討案.md）

## 反映先URL

- トップ: https://hiryu-zu.github.io/tools-studio/
- ギャラリー: https://hiryu-zu.github.io/tools-studio/gallery/

## まとめ（迷ったらこれだけ）

- 調べたもの → 情報収集に貯める（非公開）
- 残したい発見 → gallery/data.js に1ブロック追加 → push
- 作った動くサイト → sites/ に追加＋トップにカード → push
