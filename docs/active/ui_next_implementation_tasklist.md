# UI Next 実装タスクリスト

> **ステータス**: 🟢 進行中 | 📅 開始: 2026-03-15 | 🔄 最終更新: 2026-03-15
>
> **進捗サマリー**: T01 ✅ / T02 🔶（support icon・最小化 未） / T03 🔶（support icon 未） / T04 ✅ / T09 🔶（HbrDataStore 接続のみ） / T10 ✅ / T05〜T08・T11・T12 未着手
>
> **前提設計**:
> [ui_next_design.md](ui_next_design.md)
>
> **参考モック / レイアウト資料**:
> [ui_next_gui_design_spec.md](ui_next_gui_design_spec.md)

## 目的

- 新 UI の作業範囲を既存 UI / engine 改修から切り分ける
- style 画像付きの新しい party 操作体験を段階的に構築する
- D&D による position 編集を中核導線として実装する
- `Initial Setup` と `Style Picker` の 2 層構成を最初の合意スコープとする

## 実装原則

1. 新 UI は別ページとして実装する
2. 既存 UI の DOM 構造を前提にしない
3. 共有できるものだけを `main` に戻す
4. engine bugfix を新 UI branch の正本にしない
5. docs は設計と実装進捗を分けて管理する

## タスク

### T01: 新 UI の entry 作成

- [x] `ui-next/` の entry files を作成する
- [x] 新 UI 用の最小表示ページを表示できるようにする
- [x] 既存 `ui/index.html` に影響を与えないことを確認する

完了条件:

- [x] 新 UI の空ページが独立して開ける

> ✅ T01 完了（2026-03-15）: `ui-next/index.html`, `ui-next/app.js` 作成。`importmap` で `node:fs` / `node:path` を既存 shim に差し替え済み。

### T02: Party Setup shell

- [x] `Initial Setup` container の中に `Party Setup` block を置く
- [x] `front 3 + back 3` の 6 slot panel を横並びに表示する
- [x] slot panel の基本構成を `main icon -> listbox 群 -> support icon` で組む（T04 と合わせて実装）
- [x] 未選択 slot の empty state と略称 placeholder を定義する
- [x] `Initial Setup` 右ペインをスライドアウト（⚙ 設定 ◀/▶ ボタン）で開閉できる骨格を入れる
- [ ] シミュレーター開始後（Apply 後）に `Initial Setup` を最小化する連携は T09 で実装

完了条件:

- [x] `Initial Setup > Party Setup` の構造が 1 画面で見え、退避導線（スライドアウト）がある

> 🔶 T02 部分完了（2026-03-15）: 6 slot パネル（front 3 + back 3）・3タブシェル（Party/Enemy/Stage）・empty state・listbox 縦積み・右ペインスライドアウト（ヘッダーボタン）実装済み。Apply 後の連携は T09 で実装予定。

### T03: style 画像表示基盤

- [x] `resolveStyleImageUrl()` を使って main / support style 画像を描画する（main icon 実装済み）
- [x] 画像未設定時の fallback 表示を決める（`?` プレースホルダー）
- [x] slot panel に style 名 / character 名の最小情報を表示する

完了条件:

- [ ] 6 slot の main / support icon が style 画像つきで描画できる（support icon は T08 で実装予定）

> 🔶 T03 部分完了（2026-03-15）: main icon の `resolveStyleImageUrl()` 描画・fallback（＋プレースホルダー）・キャラ名オーバーレイ実装済み。Style Picker（全画面アイコン高密度 grid）から main style を選択してスロットに反映できる。team 別グループ化・キャラ昇順→レアリティ昇順→実装順ソート・名前表示トグル・ホバー title（`[style名] キャラ名`）実装済み。support icon は T08 で実装予定。

### T04: slot listbox 群

- [x] `LB`（限突 0〜N）`ドライブピアス`（DP なし/+10/+12/+15）`SP装備`（なし/SP+1/SP+2/SP+3）`属性ベルト` の listbox を縦積みで配置する
- [x] `やる気` は やる気パッシブ（label に `Morale` または `Motivation` 含む）を持つスタイルがセットされた時だけ表示する
- [x] icon 幅と listbox 幅を揃える
- [x] 未選択時の placeholder 表示（empty state）を入れる

完了条件:

- [x] slot panel 内の基本設定が listbox で編集できる

> ✅ T04 完了（2026-03-15）: LB→「限突 N」表記・SP装備→固定4択・やる気→Morale/Motivationパッシブ持ちスタイル時のみ表示（8スタイル対象）。DRIVE_PIERCE_OPTIONS を battle-defaults.js から再利用。右ペインスライドアウトも同時実装。

### T05: D&D による position 入れ替え

- [ ] slot の drag start / hover / drop を実装する
- [ ] ドロップ時に slot 単位で main / support / listbox 設定をまとめて入れ替える
- [ ] accidental drag を減らすための最小ガードを入れる

完了条件:

- slot panel をドラッグして順番を入れ替えられる

### T06: Style Picker shell

- [ ] full-screen picker を追加する
- [ ] picker 上部に filter bar を固定配置する
- [ ] team 別 style icon grid を横並び折り返しで表示する
- [ ] `main` / `support` mode を切り替えられる picker shell にする

完了条件:

- main / support のどちらからでも full-screen picker を開ける

### T07: Style Picker filter / ordering

- [ ] team ごとの style 順を `characters.json` と `cards[]` の出現順に揃える
- [ ] rarity / weapon / element / role filter を表示する
- [ ] filter 対象外の style を非表示にし、左詰めで再配置する
- [ ] `無` 属性を `elements.length === 0` として扱う

完了条件:

- filter 付き team grid から style を選べる

### T08: main / support 選択導線

- [ ] `main style icon` クリックで picker を開く
- [ ] `support style icon` クリックで picker を開く
- [ ] `main` mode は 1 click で選択確定して元画面へ戻る
- [ ] `support` mode は hover preview を表示する
- [ ] `support` mode は 1 click 目で詳細表示を固定する
- [ ] `support` mode は同じ card への 2 click 目で選択確定して元画面へ戻る
- [ ] support 詳細表示に `共鳴アビリティ名 / 効果説明 / LB MAX 性能値` を出す
- [ ] picker の filter 状態と scroll 位置を保持する

完了条件:

- slot ごとに main / support style を意図した操作モデルで差し替えられる

### T09: engine bridge の最小接続

- [x] `HbrDataStore` 読み込みを新 UI entry から接続する
- [ ] 6 slot の表示状態を party / battle state と同期できるようにする
- [ ] 初期 battle state の生成まで接続する
- [ ] `Initial Setup` の設定変更を初期 battle state の更新として扱えるようにする
- [ ] `Apply` 操作で既存の turn script / replay script を turn 1 から再計算できるようにする
- [ ] 編集中は現在のシミュレート結果を即破棄しないようにする

完了条件:

- [ ] 新 UI から battle state の初期化と「初期設定変更後の全再計算」まで到達できる

> 🔶 T09 部分着手（2026-03-15）: `HbrDataStore.fromRawData()` を `ui-next/app.js` から接続済み。battle state 同期以降は未実装。

### T10: Enemy / Stage Setup extension point

- [x] `Initial Setup` 配下に `Enemy Setup` block を差し込める構造にする
- [x] `Initial Setup` 配下に `Stage Setup` block を差し込める構造にする
- [x] 初回マイルストーンでは placeholder または reserved area に留め、full 実装を必須にしない

完了条件:

- [x] `Party Setup` 実装を壊さずに `Enemy Setup` / `Stage Setup` を後から追加できる構造になっている

> ✅ T10 完了（2026-03-15）: InitialSetup の3タブシェル（Party/Enemy/Stage）として placeholder 実装済み。`initial-setup.js` の `TABS` 配列に追加するだけで拡張可能な構造。

### T11: replay/edit 連携方針の固定

- [ ] 新 UI が `ReplayScript` を直接編集するかを決める
- [ ] turn / slots / operations / note のうち、初回で扱う範囲を固定する
- [ ] 旧編集 UI と新 UI の責務境界を整理する

完了条件:

- 新 UI がどこまで編集対象を持つか文書で固定されている

### T12: 新 UI 初回リリースの最低ライン

- [ ] 6 slot 表示
- [ ] D&D 入れ替え
- [ ] style 画像描画
- [ ] listbox 編集
- [ ] main / support picker
- [ ] support 共鳴アビリティ詳細表示
- [ ] 開始後に `Initial Setup` を最小化できる
- [ ] `Initial Setup` の変更を turn 1 から全再計算できる
- [ ] `Enemy Setup` / `Stage Setup` の extension point がある
- [ ] 初期化導線
- [ ] 最低限の error 表示

完了条件:

- 「`Initial Setup > Party Setup` を中心に、style 選択と D&D ができ、後続の enemy / stage setup を差し込める新ページ」が成立している

## メモ

- engine bugfix が必要になった場合は、原則 `main` を経由して取り込む
- UI Next 側だけで必要な試験実装は、新 UI 専用ロジックへ閉じ込める
- 共有 asset / resolver / contract は `main` に戻しやすい粒度を維持する
