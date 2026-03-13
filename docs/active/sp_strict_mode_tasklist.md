# SP厳密モード実装タスクリスト

**ステータス**: ✅ 完了
**最終更新**: 2026-03-13

---

## 概要

SP厳密モード（Strict）/ 通常モード（Normal）トグルの実装。

- **厳密モード ON**: `commitCurrentTurn` 先頭でSP不足チェック → 不足なら即リターン（ターン進行なし）
- **通常モード OFF**: 現行動作のまま（マイナスSP許容）
- **ターンプラン再計算（replay）**: `skipStrictSpMode: true` フラグで除外

**影響範囲**: `src/ui/dom-adapter.js` / `ui/index.html` の2ファイルのみ
`src/turn/turn-controller.js` は無変更。

---

## タスクリスト

### フェーズ1: コアロジック

- [x] **T01**: `commitCurrentTurn` 先頭にSPチェックを追加
  - `getActionableFrontlineMembers()` で対象メンバー取得
  - SP不足時: `setStatus()` でエラーメッセージ + `return null`
  - `options.skipStrictSpMode === true` なら skip
- [x] **T02**: `buildTurnPlanReplayCommitOptions` に `skipStrictSpMode: true` を追加

### フェーズ2: UI

- [x] **T03**: `ui/index.html` にトグル checkbox 追加（`force-od-toggle` の隣）
- [x] **T04**: `src/ui/dom-adapter.js` 状態管理追加
  - コンストラクタ: `this.spStrictMode = false`
  - イベントリスナー: toggle 変更 → `this.spStrictMode` 更新 + `invalidatePreviewState()`
  - `isSpStrictModeEnabled()` メソッド追加

### フェーズ3: テスト

- [x] **T05**: `npm test` — 519 PASS（リグレッションなし）
- [x] **T06**: このドキュメント作成
- [x] **T07**: `docs/README.md` にエントリ追加

---

## 既知の制限

- SP コストチェックは `skill.spCost`（base値）を使用。`overwriteCond` による実効コストは考慮しない。
- 特殊ケース（手塚キャラの `isReinforcedMode` 等）では厳密モードが誤ブロックする可能性あり（低頻度・許容範囲）。
