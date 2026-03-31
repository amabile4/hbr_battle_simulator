# UI Next Drag And Drop Review Request

> **ステータス**: 🟢 進行中 | 📅 作成: 2026-03-28 | 🔄 最終更新: 2026-03-28
> **対象 branch**: `feature/ui-next-layout-rework`

## 目的

`ui-next` の D&D 入れ替えが、実ブラウザでは `TurnEdit` と `PartySetup` の両方で壊れているため、現行実装のレビューを依頼したい。

今回ほしいのは新しい UI 提案ではなく、**なぜ browser 実機で D&D が成立しないのか**、および **どの実装方針へ戻すべきか / 直すべきか** のコードレビューである。

## 現在の問題整理

### 1. TurnEdit

- 現在は **前衛同士も含めて D&D で入れ替えできない**
- 以前は少なくとも「前衛側の D&D は動いていた」時点があった
- 現在はドラッグ時の ghost image らしき視覚反応は出る
- しかし drop 後に slot swap が成立しない
- ユーザー観測では、特に **前衛↔後衛の交代** が成立しない

### 2. PartySetup

- **D&D 自体が始まらない**
- 画像を掴んだときの drag ghost も出ない
- tap-to-swap などの代替導線を追加したが、ユーザーが期待しているのは desktop D&D の復旧である

### 3. テストとの不一致

- 現在の JSDOM テストは PASS している
- しかし実ブラウザでは不成立
- つまり問題は「ロジックの有無」ではなく、**ブラウザの drag event 経路 / target 解決 / draggable 要素構造 / child 要素との干渉** にある可能性が高い

## 期待挙動

### TurnEdit

- 未コミット row では slot を D&D で入れ替えられる
- 前衛↔前衛だけでなく、**前衛↔後衛** も入れ替えられる
- drop 先が slot root ではなく、画像・本文・badge・情報領域など child 要素の上でも swap が成立する
- EX ターン制約がある場合だけ `#isSwapAllowed()` の制約に従って禁止される

### PartySetup

- slot 番号 header を drag handle として D&D で入れ替えられる
- **前衛↔後衛** も入れ替えられる
- style 本体だけでなく、その slot に紐づく `LB / drivePierce / spEquip / belt / morale / support / equippedSkillIds` も一緒に移動する
- touch 環境では tap-to-swap が fallback としてあってよいが、desktop D&D を壊してはいけない

## あるべき姿の参照資料

- [ui_next_design.md](ui_next_design.md)
  - `slot の順番を D&D で入れ替えられること`
  - `desktop では slot 番号 header を drag handle にして、front/back をまたぐ D&D swap を維持する`
  - `D&D は style だけでなく、その slot に紐づく listbox の設定値もまとめて移動する`
- [ui_next_implementation_tasklist.md](ui_next_implementation_tasklist.md)
  - T05: Party Setup の D&D 完了条件
  - T12-E-5 / TurnRow 系の D&D 完了条件

## 現在の実装状況

### PartySetup

- [ui-next/components/party-setup.js](../../ui-next/components/party-setup.js)
- 現在は slot 番号 header に `draggable="true"` を付けて drag source にしている
- `dragstart / dragend` は header 側
- `dragover / drop` は root 委譲で `closest('[data-slot]')` 解決に寄せた
- tap-to-swap も同じ header 要素に共存している

### TurnEdit

- [ui-next/components/turn-row.js](../../ui-next/components/turn-row.js)
- front slot / back slot とも `data-turn-slot` に `draggable` を付けている
- `#isSwapAllowed()` で EX ターン制約だけを判定している
- 現在は `dragstart / dragend` を slot 側、`dragover / drop` を row root 委譲へ寄せている

## 実ブラウザで壊れている観測事実

### TurnEdit

- drag gesture 自体は始まっているように見える
- しかし drop 後に swap が成立しない
- 現在は前衛同士も含めて実質的に壊れているとの報告

### PartySetup

- drag gesture 自体が始まらない
- drag ghost が出ない
- slot header をドラッグしても入れ替えにならない

## いま疑っている論点

断定はせず、レビューしてほしい観点として以下を挙げる。

1. `draggable` を付ける要素が適切か
2. nested interactive element と drag handle の共存が壊れていないか
3. `dragover / drop` を個別 listener に置くべきか、root 委譲に置くべきか
4. `event.target.closest(...)` 解決が browser ごとに不安定ではないか
5. `dragstart` は発火していても、drop target 側で `preventDefault()` が効いていない可能性はないか
6. visual highlight / opacity 制御と本来の drop 成立条件がずれていないか
7. JSDOM テストが browser 実装差を見逃しているポイントはどこか

## レビュー対象ファイル

- [ui-next/components/party-setup.js](../../ui-next/components/party-setup.js)
- [ui-next/components/turn-row.js](../../ui-next/components/turn-row.js)
- [ui-next/components/turn-area.js](../../ui-next/components/turn-area.js)
- [tests/ui-next-party-setup.test.js](../../tests/ui-next-party-setup.test.js)
- [tests/ui-next-turn-ui.test.js](../../tests/ui-next-turn-ui.test.js)
- 必要なら:
  - [docs/active/ui_next_design.md](ui_next_design.md)
  - [docs/active/ui_next_implementation_tasklist.md](ui_next_implementation_tasklist.md)

## Claude への依頼内容

次の観点で、**コードレビュー**として見てほしい。

1. `TurnEdit` の D&D が browser 実機で成立しない直接原因の仮説
2. `PartySetup` の D&D が開始すらしない直接原因の仮説
3. `draggable` の付与位置、drag handle、drop target 解決のどこに構造的な問題があるか
4. JSDOM では PASS しているのに browser で壊れる理由
5. 最小差分で直すならどこをどう戻す / 組み替えるべきか
6. 無理に patch を重ねるより、drag 実装方式を整理し直すべきならその方針

## 望む回答形式

- Findings first
- 重要度順
- ファイル / 関数 / 実装ブロックへの言及つき
- `TurnEdit` と `PartySetup` を分けて論じる
- 「直接原因の仮説」と「最小修正案」を分ける
- browser 実装差や HTML5 D&D の罠があるなら併記してほしい
