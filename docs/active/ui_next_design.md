# UI Next 設計メモ

> **ステータス**: 🟢 進行中 | 📅 開始: 2026-03-15

## 目的

- 既存ページを流用せず、新しい UI を独立した導線として構築する
- 既存 battle engine は再利用しつつ、UI 層は新規に設計する
- `styles.json` に記述された style 画像を使い、視覚的に party / position / turn を編集しやすくする

## 前提

- 既存 UI は [ui/index.html](../../ui/index.html) を維持し、互換性を壊さない
- 新 UI は別ルートで構築し、既存 UI と直接結合しない
- 共通で使う asset / resolver / contract は `main` に戻せる形で設計する
- style 画像の正本は [assets/styles](../../assets/styles) に置く
- style 画像の参照は [src/ui/style-asset-url.js](../../src/ui/style-asset-url.js) を通す
- 過去に作成した GUI モックとレイアウト資料は [ui_next_gui_design_spec.md](ui_next_gui_design_spec.md) と [ui_next_mockup_light.png](ui_next_mockup_light.png) を正本として引き継ぐ

## 設計原則

1. 新 UI は「既存 UI の大改修」ではなく「新規ページ」として扱う
2. engine 修正が必要でも、UI 専用の暫定ロジックを engine 本体へ混ぜない
3. D&D や配置編集などの操作系は UI Next 側へ閉じ込める
4. 共有化できるものは asset / resolver / helper / adapter contract に限定する
5. 既存 UI と新 UI の両方が存在しても運用できる期間を前提にする

## 想定ディレクトリ構成

```text
ui-next/
  index.html
  app.js
  styles.css

src/ui-next/
  page-controller.js
  drag-drop.js
  view-model.js
  renderers/
```

補足:

- `ui-next/` はブラウザ公開用の entry と静的ファイル
- `src/ui-next/` は新 UI 専用ロジック
- 既存の `src/ui/` は current UI 用として当面維持する

## 画面スコープ

初期段階で扱う対象:

- style 画像付きの 6 slot 表示
- position 入れ替え
- style 選択
- skill / target の編集導線
- turn 単位の編集と再計算トリガ

初期段階で後回しにしてよい対象:

- 既存 UI の全 controls の完全移植
- 旧ページと同じ DOM 構造の互換維持
- 旧 `dom-adapter.js` の表示ロジック再利用

## engine との境界

新 UI は以下を再利用対象とする。

- `HbrDataStore`
- battle state 初期化
- preview / commit / replay 系 API
- lightweight replay script 系の正本モデル

新 UI が直接持つもの:

- レイアウト
- stateful な画面操作
- D&D
- style 画像表示
- slot 編集体験

## branch 運用

- 新 UI の日常作業は `feature/ui-next-*` で進める
- engine bugfix は `main` へ入ってから `ui-next` へ取り込む
- `ui-next` と `engine` の feature branch 同士を直接 merge しない

## 未確定事項

- `ui-next/` を root 直下に置くか、`ui/pages/next/` 配下に置くか
- D&D の入力方式を pointer events 中心にするか、HTML5 drag and drop を使うか
- replay script 編集をどの段階から UI Next 側へ載せるか
- 旧ページから新ページへの導線をいつ張るか

## 現時点の共通土台

- [assets/styles](../../assets/styles): style 画像の正本
- [src/ui/style-asset-url.js](../../src/ui/style-asset-url.js): style 画像 URL resolver
