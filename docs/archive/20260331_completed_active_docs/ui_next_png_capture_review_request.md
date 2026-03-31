# UI Next PNG Capture Review Request

> **ステータス**: �️ アーカイブ | 📅 作成: 2026-03-28 | 🔄 最終更新: 2026-03-31
> T23 PNG Capture Rework ✅ 完了済み。レビュー結果は archive に移動済み。
>
> **レビュー結果**: [`../archive/20260328_png_capture_code_review_findings.md`](../archive/20260328_png_capture_code_review_findings.md)
> （採用した論点 / 採用しなかった論点を追記したアーカイブ版）

## 目的

`ui-next` の `PNG保存` 実装について、`html-to-image` を使った clone capture の設計と実装をレビューしてほしい。

今回ほしいのは「新しい実装案を雑に足すこと」ではなく、**なぜ横幅が崩れて右半分が白くなるのか**、および **capture 対象の組み方が正しいか** のコードレビューである。

## 背景

`ui-next` では TurnPlanner の PNG 保存を次の方針へ変更した。

- committed row のみを PNG 保存対象にする
- `Simulator Settings > バトル終了までをキャプチャ` が ON のときだけ、最初の `バトル終了` 行を含むところまでで打ち切る
- 右側の操作ボタン列は PNG に描画せず、メモ欄をそのぶん横に詰める
- live DOM を直接いじらず、offscreen clone を作って `html-to-image` に渡す

この機能追加の文脈で、capture 周辺の実装を複数回調整している。

## 再現条件

### セッション

- `~/Downloads/ui_next_session_2026-03-28T07-06-56.048Z.json`

### 手順

1. `ui-next` を開く
2. 上記 session JSON を読み込む
3. `Simulator Settings` で `バトル終了までをキャプチャ` を ON にする
4. `PNG保存` を押す

### 既知の事実

- この session では `#10` で battle end に到達している
- 下方向の打ち切りは概ね期待どおりで、battle end 以降の行を保存しない方向は動いている
- 問題は主に **横幅の capture** に出ている

## 期待挙動

- PNG は committed rows だけを含む
- `captureUntilBattleEnd` が ON のときは `#10` の battle-end row を含むところまでで縦方向に打ち切る
- 右側の `編集 / 実行 / 再コミット / キャンセル / OD操作` 列は PNG に出ない
- メモ欄と chip 列はそのぶん右へ広がる
- 横幅は画面上の TurnPlanner と同等に使われ、**右半分が白い空白にならない**
- style icon / info box / slot 群が横に潰れず、通常レイアウトに近い比率で保存される

## 実際に起きている不具合

時系列で観測された不具合は次のとおり。

1. 右半分が白い空白になり、左半分 50% 程度にだけ要素が描画される
2. 修正途中で、一度は画像全体が真っ白になる
3. その後白紙化は解消したが、再び「左半分だけ描画され、右半分が白い」状態に戻る
4. battle end による縦方向の打ち切り自体は大きくは壊れていない

つまり、現在の主問題は **capture width / capture target / layout fixation のどこかが誤っており、PNG の横方向だけが破綻していること** である。

## 現在の実装方針

### `ui-next/app.js`

- `#capture-btn` クリックで `mountPngCaptureSandbox(turnAreaRoot, ...)` を呼ぶ
- `patchDisabledSelects(target)` を clone 側に当てる
- `html-to-image` の `toPng(target, { pixelRatio, backgroundColor })` を呼ぶ

### `ui-next/utils/png-capture.js`

- live `#turn-area` から clone を作る
- committed row 以外を除去する
- `captureUntilBattleEnd` が ON の場合、最初の `data-battle-ended="true"` 行より後ろを除去する
- `data-turn-buttons` を clone 上で `hidden` にする
- offscreen sandbox に append して PNG 化する
- 現時点では outer `#turn-area` ではなく、inner の `[data-role="turn-row-list"]` を source とし、`--turn-*` custom property を clone にコピーして layout を固定しようとしている

### `ui-next/components/turn-row.js`

- committed row root に `data-battle-ended="true|false"` を出している

## レビュー対象ファイル

- [ui-next/app.js](../../ui-next/app.js)
- [ui-next/utils/png-capture.js](../../ui-next/utils/png-capture.js)
- [ui-next/components/initial-setup.js](../../ui-next/components/initial-setup.js)
- [ui-next/components/turn-row.js](../../ui-next/components/turn-row.js)
- [ui-next/styles.css](../../ui-next/styles.css)
- [tests/ui-next-png-capture.test.js](../../tests/ui-next-png-capture.test.js)

必要なら補助資料として以下も参照してよい。

- [docs/active/ui_next_design.md](ui_next_design.md)
- [docs/active/ui_next_implementation_tasklist.md](ui_next_implementation_tasklist.md)

## Claude への依頼内容

次の観点で、**コードレビュー**として見てほしい。

1. `html-to-image` に渡す capture target の選び方が妥当か
2. offscreen sandbox / clone / width fixation のどこに構造的な問題があるか
3. container query と `--turn-*` custom property を clone に持ち込む方針が正しいか
4. 右半分が白くなる直接原因の仮説を、ソースコードベースで優先度つきで挙げてほしい
5. 最小差分で直すならどこを変えるべきか
6. もし現方針自体が悪いなら、より堅い代替案は何か

## 望む回答形式

- Findings first
- 重要度順
- ファイル / 行 / 実装ブロックへの言及つき
- 「いま壊れている根本原因の仮説」と「最小修正案」を分けてほしい
- 可能なら `html-to-image` / clone capture でやりがちな罠も併記してほしい
