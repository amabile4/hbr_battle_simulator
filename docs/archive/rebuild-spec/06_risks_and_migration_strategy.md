# 06 Risks And Migration Strategy

## 1. 主要リスク
- `High` 仕様乖離リスク: READMEの要求（OD/CSV/バフ）と現行実装差分が大きい。
  - 根拠: `README.md`, `js/control-manager.js`, `js/results-manager.js`
- `High` 状態不整合リスク: グローバル状態とDOM再描画の密結合で、機能追加時に副作用が増える。
  - 根拠: `js/globals.js`, `js/display-manager.js`, `js/control-manager.js`
- `Medium` データ進化リスク: スキルDB拡張時に `name/cost/type` 以外を扱えない。
  - 根拠: `tests/skill-database.test.js:69`

## 2. 移行戦略（ゼロから再開発）

### Phase 1: 仕様固定
- `Must` `07_open_questions_for_user.md` の未確定事項を確定し、状態遷移表を作成。
- `Must` CSVフォーマットをスナップショット例で確定。

### Phase 2: コア実装
- `Must` ドメイン層（状態/遷移/SP計算）を先行実装。
- `Should` 既存 `skillDatabase.json` を暫定カタログとして再利用。

### Phase 3: UI接続
- `Must` 現行画面相当のUIをドメインAPI接続で再構築。
- `Should` 現行の操作フロー（編成→選択→実行→次ターン）を維持して差分最小化。

### Phase 4: 検証
- `Must` 既存テスト + 新規テスト（OD/追加ターン/CSV）で回帰防止。
- `Could` シナリオベースの回帰データを固定化。
