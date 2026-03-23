# SP厳密モード実装タスクリスト

**ステータス**: ✅ 完了
**最終更新**: 2026-03-14

---

## 概要

SP厳密モード（Strict）/ 通常モード（Normal）トグルの実装。

- **厳密モード ON**: `commitCurrentTurn` 先頭でSP不足チェック → 不足なら即リターン（ターン進行なし）
- **通常モード OFF**: 現行動作のまま（マイナスSP許容）
- **ターンプラン再計算（replay）**: `skipStrictSpMode: true` フラグで除外

**影響範囲**: 初回実装は `src/ui/dom-adapter.js` / `ui/index.html`。
2026-03-14 の PRI-010 で `resolveEffectiveSkillForAction()` 連携により、strict mode のコスト判定も実効 SP コストへ同期した。

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

- 特殊ケース（手塚キャラの `isReinforcedMode` 等）では厳密モードが誤ブロックする可能性あり（低頻度・許容範囲）。

## 追補（2026-03-14）

- `commitCurrentTurn()` の strict mode 判定は `resolveEffectiveSkillForAction()` を通すように更新済み
- これにより `overwrite_cond` / `overwrite` / `ReduceSp` を含む実効コストと、UI preview / commit 判定が一致する
