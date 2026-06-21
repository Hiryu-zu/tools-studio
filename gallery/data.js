/*
 * 見つけたもの ギャラリーのデータ。
 * 追加するときは、該当カテゴリ(cat)の items 配列に、下のブロックを1つ貼るだけ。
 *
 *   {
 *     name: "ツール名",
 *     desc: "1〜2行の概要。",
 *     chips: ["タグ1", "タグ2"],          // 省略可（[] でOK）
 *     links: [                              // リンクが無ければ links: []
 *       { label: "表示名", url: "https://..." }
 *     ]
 *   },
 *
 * ・末尾カンマがあっても動きます（JSなので寛容）。
 * ・新カテゴリを足したいときは、一番下に { cat:"🆕 名前", items:[ ... ] } を追加。
 * ・編集後は git add -A && git commit && git push で公開反映。
 */
window.GALLERY_DATA = [
  {
    cat: "🎨 画像・エフェクト（ブラウザ完結）",
    items: [
      {
        name: "画像グリッチ / ひび割れ加工ツール",
        desc: "AMIXの「IMG Breaker」や「画像をバキバキに割るツール」が参考。Canvas+JSで画像をスライスしてランダムにズラす/回転。スライダー調整→PNG書き出しまで静的HTML1枚で作れそう。",
        chips: ["Canvas", "画像加工", "自作向き"],
        links: [
          { label: "IMG Breaker", url: "https://amix-design.com/news-111-85407.html" },
          { label: "AMIX tools", url: "https://amix-design.com/tools" }
        ]
      },
      {
        name: "水面リップル / 流体の背景エフェクト",
        desc: "jQuery RipplesやWebGL Waterが参考。ポートフォリオやLPの背景に「マウスで波紋が広がる」WebGLシェーダーを組み込む。（※自分でも実装済み）",
        chips: ["WebGL", "背景演出"],
        links: [
          { label: "コリス解説", url: "https://coliss.com/articles/build-websites/operation/javascript/jquery-plugin-ripples.html" }
        ]
      },
      {
        name: "VFX用メッシュ生成ツール（Effect Mesh Generator）",
        desc: "スラッシュ/衝撃波/リボン型メッシュをスライダーで作りOBJ出力。MITライセンスでソース公開。UI改善やFBX出力対応を足して作り直す余地あり。",
        chips: ["OSS", "MIT", "3D/VFX"],
        links: [
          { label: "Effect Mesh Generator", url: "https://big615big615.github.io/EffectMeshGenerator/" }
        ]
      },
      {
        name: "雑誌風レイアウト / 高速テキスト表示の実験（Pretext.js）",
        desc: "15KBでDOM reflowなしのテキスト計測ライブラリ。無限スクロールや段組みレイアウトを試すデモページに使える。",
        chips: ["ライブラリ", "タイポグラフィ"],
        links: [
          { label: "pretextjs.dev", url: "https://pretextjs.dev/" }
        ]
      }
    ]
  },
  {
    cat: "🗣️ AIキャラクター・音声系",
    items: [
      {
        name: "ローカルTTS+チャットの「話すAIアシスタント」",
        desc: "Irodori-TTS v3とClaude Code/CodexのCLI出力を繋ぎ、返答を感情付き音声で再生するローカルアプリ。まずはテキスト→音声再生のミニアプリから。表情/アバターは後付け可能。",
        chips: ["ローカル", "TTS", "AI"],
        links: [
          { label: "Irodori-TTS (GitHub)", url: "https://github.com/Aratako/Irodori-TTS" }
        ]
      },
      {
        name: "AI人格の「自己観測・記録」ダッシュボード",
        desc: "Hermes＋Obsidian連携のように、AIエージェントの作業ログ・メモリをObsidian Vault形式で蓄積し関連グラフを可視化するローカルWebビュー。既存の情報収集/research構成がそのまま使える。",
        chips: ["Obsidian", "可視化", "ローカル"],
        links: []
      }
    ]
  },
  {
    cat: "🤖 情報収集・自動化（自分用Webツール）",
    items: [
      {
        name: "「いいね収集→要約→Todo化」パイプラインのWeb化",
        desc: "今のX Likes収集＋Jina Reader資料化の手順をn8nのワークフローに移植。X/note/Qiitaから定時収集→Gemini/Claudeで要約・分類→Discordやローカルへ通知という構成。",
        chips: ["n8n", "自動化", "ワークフロー"],
        links: [
          { label: "n8n.io", url: "https://n8n.io/" }
        ]
      },
      {
        name: "Markdown資料から確認用Webアプリを自動生成",
        desc: "既存テンプレートを使い、todo-localと同じ構成（index.html/styles.css/app.js/data.js）で、調査結果や計画Markdownを一覧・絞り込み・詳細表示できる静的Webアプリに。ローカル確認用の第一歩として着手しやすい。",
        chips: ["静的Web", "ローカル", "着手しやすい"],
        links: []
      }
    ]
  },
  {
    cat: "🛠️ クリエイティブ制作支援",
    items: [
      {
        name: "TRPGマップエディタの自分用カスタム版",
        desc: "「違法建築のTRPGラボ」のマップエディタ（ブラウザ完結・square/hex対応・PNG/SVG出力）が参考。使いたいテクスチャやスタンプだけ入れた軽量版を作る。",
        chips: ["ブラウザ完結", "エディタ"],
        links: [
          { label: "TRPG Map Maker", url: "https://ihoukentiku.github.io/trpg_map_maker/map_list.html" }
        ]
      },
      {
        name: "1枚画像→3Dモデル化ワークフローのまとめページ",
        desc: "Meshy 6での3Dモデル生成手順を、「画像アップロード→Meshy/他ツールへのリンク→Blender読み込みチェックリスト」のステップガイドWebページにまとめる。",
        chips: ["3D", "ガイド", "Meshy"],
        links: []
      }
    ]
  },
  {
    cat: "🧩 開発支援・コード可視化",
    items: [
      {
        name: "コード依存関係グラフのローカル可視化（CodeGraphContext）",
        desc: "MCPサーバー＋CLIで、ローカルコードをグラフDB化しダークモード/glassmorphismの対話的グラフで表示。自分のプロジェクトの依存関係確認用Webビューとして導入。",
        chips: ["MCP", "可視化", "ローカル"],
        links: [
          { label: "codegraphcontext.github.io", url: "https://codegraphcontext.github.io/" }
        ]
      },
      {
        name: "AIエージェント用UIデザインSkillの自作",
        desc: "「UIスキル集」の考え方を参考に、Claude Code/Codexに渡す独自のSKILL.md（配色・タイポ・余白ルール）を作り、生成されるWeb UIの「AIっぽさ」を減らす。",
        chips: ["Skill", "デザイン", "AI"],
        links: []
      }
    ]
  },
  {
    cat: "🌌 没入型・体験型Web表現",
    items: [
      {
        name: "WebGPU物理シミュレーションのインタラクティブLP",
        desc: "パーティクルや布シミュレーションをWebGPUで動かし、トップページの演出に使う。スマホ対応とパフォーマンスのバランスは要検証。",
        chips: ["WebGPU", "物理", "演出"],
        links: []
      },
      {
        name: "曇りガラスUI（glassmorphism）のポートフォリオ",
        desc: "曇りガラスUIや流体インク表現を組み合わせた、自己紹介・作品集ページのデザイン実験。",
        chips: ["glassmorphism", "デザイン実験"],
        links: []
      }
    ]
  }
];
