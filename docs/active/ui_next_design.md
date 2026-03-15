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
- 過去に作成した GUI モックとレイアウト資料は [ui_next_gui_design_spec.md](ui_next_gui_design_spec.md) と [ui_next_mockup_light.png](ui_next_mockup_light.png) を参照資料として引き継ぐ

## 現時点の画面責務

初回実装では、setup 系 UI を次の 2 層で整理する。

1. `Initial Setup`
2. `Style Picker`

`Initial Setup` は battle start 時点の条件をまとめて編集する上位 block であり、`Style Picker` は `Initial Setup` 配下の party slot に対して 1 style を選ぶための全画面 picker とする。

## Screen 1: Initial Setup

### 上位概念

`Initial Setup` は、シミュレーター開始前に battle start 条件をまとめて入力するための block 群である。

含める block は次を想定する。

1. `Party Setup`
2. `Enemy Setup`
3. `Stage Setup`

このうち、初回実装で最優先なのは `Party Setup` である。`Enemy Setup` と `Stage Setup` はすぐに全実装しなくてもよいが、将来同じ `Initial Setup` 配下へ載る前提で設計する。

### Initial Setup の役割

- battle start 時点の条件を 1 箇所で編集できること
- シミュレーター開始前の大きな setup UI として使えること
- シミュレーター開始後は邪魔にならない形で退避できること
- 必要時に再表示し、初期条件を変えて turn 1 から再計算できること

## Block 1: Party Setup (`Character Selection`)

### 役割

- 6 slot の party 全体を狭い横幅で一覧できること
- `front 3 + back 3` の並びを常時見えること
- slot 単位で `main style` と `support style` を選び直せること
- slot の順番を D&D で入れ替えられること
- style 選択以外の基本設定を同じ slot panel 内で編集できること

### レイアウト

- 画面中央に、縦長の slot panel を 6 本横並びで配置する
- 並び順は `front 3 + back 3`
- 各 panel は「main icon」「縦積み listbox 群」「support icon」の順に構成する
- 6 本は詰めて並べ、party 全体を 1 画面で俯瞰できることを優先する

### Slot Panel 構成

各 slot panel は次の構造を持つ。

1. `main style icon`
2. 設定 listbox 群
3. `support style icon`

設定 listbox 群は、初回マイルストーンでは次を対象にする。

- `LB`
- `ドライブピアス`
- `SP装備`
- `属性ベルト`
- `やる気`

補足:

- listbox は icon と同じ幅に揃える
- 未選択時は略称を placeholder として表示する
- `main style icon` / `support style icon` は未選択でもクリック可能な明確な empty state を持つ

### 操作モデル

- `main style icon` をクリックすると `Style Picker` を開く
- 1 style を選ぶと元の `Party Setup` に戻り、対象 slot の `main` が更新される
- `support style icon` も同じ導線で開く
- `support` 側は共鳴アビリティなど support 専用情報を追加表示できる構造にする
- slot panel 全体は D&D で順番を入れ替える
- D&D は style だけでなく、その slot に紐づく listbox の設定値もまとめて移動する

### シミュレーター開始後の扱い

- `Party Setup` は主にシミュレーター開始前の編成・初期設定に使う
- シミュレーター開始後は、`Initial Setup` 全体を非表示または最小化できることを優先する
- 最小化後も「再表示して初期設定を見直す」導線は残す
- 盤面操作中は `Party Setup` が常時大きく見えている必要はない

### 再表示と再計算

- シミュレーター開始後に `Initial Setup` を再表示し、初期設定を編集できる
- 例: `ドライブピアス 15%` を外した場合の差分確認
- `Initial Setup` の編集は「現在のシミュレーター盤面をその場で部分更新する」のではなく、「初期設定を更新して最初から再計算する」入口として扱う
- 編集中は現在のシミュレート結果を即破棄しない
- `Apply` 相当の明示操作を行った時点で、更新した初期設定を battle の初期条件へ反映し、既存の turn script / replay script を使って turn 1 から再計算する
- つまり `Initial Setup` は「初期設定 editor」であり、開始後は「折りたたみ可能な再計算入口」としても使う

## Block 2: Enemy Setup

### 役割

- enemy side の battle start 条件を入力する
- `Turn Control` に散在していた setup 系入力を、初期条件としてまとめ直す
- 開始後に必要な時だけ再表示して変更し、turn 1 から再計算する

### 将来含める対象

- 敵数
- 敵名
- 敵の属性耐性 / 耐久力
- 初期 HP / DP
- 初期 break 状態
- battle start 時点で付与されている enemy status

補足:

- `Enemy Setup` は `Initial Setup` 配下の別 block とし、`Party Setup` と混在させない
- 初回 UI Next マイルストーンでは full 実装を急がない
- ただし `Initial Setup` の上位構造は、あとから `Enemy Setup` を自然に差し込めるものにする

## Block 3: Stage Setup

### 役割

- stage 固有の battle start 条件を入力する
- party や enemy 個別状態ではない global な開始条件を集約する

### 将来含める対象

- 開始時 OD がマイナス値から始まる条件
- 属性 field / zone / territory が張られた状態での開始
- stage 固有の特殊ルール
- battle start 時点で有効な global modifier

補足:

- `Stage Setup` も `Initial Setup` 配下の別 block とする
- `Party Setup` / `Enemy Setup` と別 block にすることで、どの初期条件を触っているかを明確に保つ

## Screen 2: Style Picker

### 役割

- 1 slot に設定する style を全画面から選ぶ
- team 別に style を一覧し、絵柄と filter で誤選択を減らす
- main / support の両方で再利用できる picker shell を提供する

### レイアウト

- 画面上部に filter bar を固定配置する
- 画面本体は team ごとの style icon grid にする
- grid は横方向に並べ、右端まで到達したら折り返す
- 横スクロールは使わない
- team label か team icon で group を識別できるようにする

### 並び順

- team ごとにまとめて表示する
- team 内の順序は `characters.json` の出現順を character の正本とする
- 各 character 内の style 順序は `characters.json.cards[]` の出現順を正本とする
- `styles.json` は style 詳細参照用に使うが、初回表示順の正本にはしない

### Filter

初回 picker で使う filter は次の通り。

- rarity: `A / S / SS / SSR`
- weapon attribute: `斬 / 突 / 打`
- elemental attribute: `火 / 氷 / 雷 / 光 / 闇 / 無`
- role: `Attacker / Blaster / Breaker / Buffer / Debuffer / Defender / Healer / Admiral / Rider`

補足:

- filter 対象外の style は非表示にし、表示領域は左へ詰める
- `無` は literal 値ではなく「属性配列が空」で表す
- support picker はこの filter bar をベースに、必要な共鳴アビリティ情報を併記できる構造にする

### 操作モデル

- picker には `main` / `support` mode を持たせる
- `main` mode は 1 click で style を選択し、元の画面へ戻る
- `support` mode は inspect-first とする
- `support` mode では hover で共鳴アビリティの preview を一時表示する
- `support` mode では 1 click 目で共鳴アビリティ詳細を固定表示する
- `support` mode では同じ card への 2 click 目で選択を確定し、元の画面へ戻る
- 別 card を click した場合は選択確定ではなく、固定表示先の切り替えとして扱う
- 戻った際、対象 slot だけが更新される
- filter 状態と scroll 位置は picker を閉じても保持する

### Support Picker 詳細表示

support picker で固定表示する内容は、初回マイルストーンでは次を対象にする。

- 共鳴アビリティ名
- 共鳴アビリティの効果説明
- `LB MAX` 前提の性能値

補足:

- hover preview は desktop での比較を速くするための補助機能とする
- tablet など hover がない環境では、1 click 目の固定表示だけで選択判断できることを優先する

## 初回マイルストーンで固定すること

- `Initial Setup` を battle start 条件の上位 container とする
- 初回実装の中心は `Initial Setup > Party Setup` とする
- `Initial Setup` は開始後に非表示または最小化できる
- `Style Picker` は「1 slot を差し替える全画面 picker」とする
- 6 slot 表示は `front 3 + back 3`
- slot panel は `main -> listbox 群 -> support` の縦構成とする
- D&D は slot 単位で行う
- main / support picker は同じ画面骨格を共有する
- `main picker` は single-click select とする
- `support picker` は hover preview + click-to-pin + same-card second click select とする
- `Initial Setup` 変更の適用は、現在結果を即破棄せず、明示 `Apply` 後に turn 1 から全再計算する

## 後続で詰めること

- `Enemy Setup` の最小入力セット
- `Stage Setup` の最小入力セット
- support picker の詳細表示 panel の exact layout
- `Initial Setup` の最小化 UI を header bar / drawer / accordion のどれで表現するか
- slot panel の exact width と desktop 最小幅
- style icon 上に常時出す badge 情報の最小セット
- mobile 対応をいつ始めるか

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
