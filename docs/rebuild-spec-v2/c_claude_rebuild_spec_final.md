[HANDSHAKE] provider=claude model=claude-sonnet-4 session=n/a ts=2026-02-24T15:48:52Z

# HBR Battle Simulator 再構築最終仕様 v2（Child C）

## 1. 文書目的
本仕様は、既存実装と既存文書を統合し、ブラウザ単体で再実装できるレベルまで要件を固定する。対象は `index.html` から起動する戦闘行動シミュレータである。

## 2. 根拠ファイルパス（31件）
1. `README.md`
2. `DEVELOPMENT_NOTES.md`
3. `MODULAR_ARCHITECTURE.md`
4. `CLAUDE.md`
5. `hbr_gui_simulator_modular.html`
6. `index.html`
7. `skillDatabase.json`
8. `package.json`
9. `vitest.config.js`
10. `js/globals.js`
11. `js/data-manager.js`
12. `js/party-manager.js`
13. `js/display-manager.js`
14. `js/event-handlers.js`
15. `js/control-manager.js`
16. `js/results-manager.js`
17. `tests/setup.js`
18. `tests/control-manager.test.js`
19. `tests/skill-database.test.js`
20. `tests/fixtures/test-data.js`
21. `docs/rebuild-spec/00_overview.md`
22. `docs/rebuild-spec/01_as_is_implemented_spec.md`
23. `docs/rebuild-spec/02_gap_and_missing_requirements.md`
24. `docs/rebuild-spec/03_rebuild_requirements_v1.md`
25. `docs/rebuild-spec/04_non_functional_requirements.md`
26. `docs/rebuild-spec/05_data_model_and_interfaces.md`
27. `docs/rebuild-spec/06_risks_and_migration_strategy.md`
28. `docs/rebuild-spec/07_open_questions_for_user.md`
29. `docs/rebuild-spec/08_orchestration_report.md`
30. `docs/rebuild-spec/childA_codex_notes.md`
31. `docs/rebuild-spec/childB_gemini_notes.md`

## 3. Must / Should / Could 分類
### Must
- 6人固定編成、前衛3人のみ行動可能。
- ターン操作を `executeTurn`（プレビュー）と `nextTurn`（確定）で分離。
- SP上限20、下限0、通常ターン回復 `+2 + spBonus`。
- 行動履歴をターン単位で保持し、同ターン再実行時は上書き。
- 交代後に前衛行動と表示を同期。
- 結果テーブルを 6人 × (始/行動/終) で再描画。
- CSV出力を実装し、3行ヘッダを出力。
- 状態遷移を `normal | od | extra` で管理。
- テストを Vitest/jsdom で自動実行可能にする。

### Should
- SP変動に `source`（base/passive/active/od/cost）を保存。
- 追加ターン対象者制限と交代制限を同一ルールで検証。
- バフ/デバフを TurnRecord に保持し、CSVへ出力可能な形で保存。
- UI層と状態計算層を分離。

### Could
- E2Eテスト追加。
- デバッグ列幅表示を開発モード限定に切替。
- テーブル差分更新で描画回数を削減。

## 4. 具体論点（18件）
1. `executeTurn` は SPを変更しない。`nextTurn` でのみ確定する。
2. 同一ターン再実行時の履歴は append せず replace する。
3. `turnActions` は前衛ポジション（0,1,2）だけを有効キーとする。
4. スキル未選択を防ぐため、前衛には cost=0 を初期割当する。
5. 交代時は `savedSPState` を復元してプレビュー副作用を除去する。
6. 前衛↔後衛交代時は旧前衛の行動を破棄し、新前衛にデフォルト行動を設定する。
7. キャラ重複選択は UI段階で禁止する。
8. `skillDatabase.json` 読み込み失敗時は模擬データへフォールバックする。
9. `skillDatabase.json` の最小必須項目は `name,cost,type` とする。
10. スキルコストは整数 `0..20` とする。
11. 結果テーブルの列構成は固定（ターン/敵行動/各キャラ3列）とする。
12. `nextTurn` 押下時、未実行ターンがあれば自動 `executeTurn` する。
13. SP確定は「現在前衛かつ action.character が一致」の条件でのみ実施する。
14. SP回復は確定後に適用し、上限20で clamp する。
15. CSV列仕様は DOMテーブルと同一順序を基本にする。
16. OD/追加ターンは現行コード未実装のため、状態モデルを追加する。
17. バフ/デバフは現行実装なしのため、データモデルを先行定義する。
18. 仕様不足項目は `未確定` として隔離し、仮説と検証方法を明記する。

## 5. 機能仕様（各機能で 入力/出力/前提条件/失敗時挙動/境界条件 を定義）
### F1. 初期化とデータロード
- 入力: `DOMContentLoaded`, `skillDatabase.json`。
- 出力: `characterDatabase` 初期化、編成UI生成。
- 前提条件: JSONが `{metadata, characters}` 形式。
- 失敗時挙動: fetch/parse失敗時に模擬データをロードし継続。
- 境界条件: `characters` が空の場合は fetch失敗と同等に扱い、模擬データへフォールバックして処理継続。

### F2. パーティー編成
- 入力: 6枠の `char_i`, `sp_i`, `bonus_i`。
- 出力: `currentParty[6]`。
- 前提条件: 6枠すべてでキャラ選択済み、重複なし。
- 失敗時挙動: 未選択または不正キャラでアラートを表示し確定中止。
- 境界条件: `initialSP` は 4..20、`spBonus` は 0..3。

### F3. 配置表示
- 入力: `currentParty`, `positionMap`, `turnActions`。
- 出力: 前衛3/後衛3のカードUIとスキル表示。
- 前提条件: `currentParty.length===6`。
- 失敗時挙動: パーティー未設定メッセージを表示。
- 境界条件: 後衛はスキル表示 `—`、前衛未割当時は `未設定`。

### F4. スキル選択
- 入力: クリックポジション、対象キャラの `skills[]`。
- 出力: `turnActions[position]=PlannedAction`。
- 前提条件: 対象が前衛、スキルが存在。
- 失敗時挙動: 後衛クリック時は無操作で終了。
- 境界条件: `skill.cost > currentSP` の選択肢は disabled。

### F5. 配置入れ替え
- 入力: 2つのポジション。
- 出力: `positionMap` 更新、`from<3 && to<3` の場合は `turnActions` swap、それ以外は `turnActions[from]` と `turnActions[to]` を削除。
- 前提条件: swapモード有効、同一位置選択ではない。
- 失敗時挙動: `from===to` または `from/to` が `0..5` の範囲外なら交換しない。
- 境界条件: 前衛同士は行動を swap、前衛↔後衛は行動を削除して再付与。

### F6. ターン実行（プレビュー）
- 入力: `currentTurn`, `turnActions`, `currentParty`。
- 出力: `battleHistory` の当該ターン行。
- 前提条件: 前衛3人の行動が確定。
- 失敗時挙動: 条件不足時は実行ボタン disabled。
- 境界条件: 同ターン再実行は上書き、SP値は start/end を計算のみ。

### F7. ターン確定（次ターン）
- 入力: `battleHistory`, `turnActions`, `positionMap`。
- 出力: SP確定、回復適用、`currentTurn++`。
- 前提条件: 現在ターンの履歴が存在。未存在時は内部で `executeTurn`。
- 失敗時挙動: キャラ欠損エントリはスキップ。
- 境界条件:
  - `turnType='normal'`: SP消費確定後に `BASE_SP_RECOVERY + spBonus` を適用し、`0..20` へ clamp。
  - `turnType='od'`: OD回復イベント（`odLevel` に応じた回復量）を先に適用し、OD中は `MAX_SP` 超過を許容、OD終了時に `MAX_SP` へ clamp。
  - `turnType='extra'`: 追加ターン由来の回復ルールを適用し、`extraTurnState.remainingActions` を1減算、`remainingActions===0` で `turnType='normal'` へ遷移。
  - すべての分岐で確定後に `savedSPState` を空配列へリセット。

### F8. 結果表示
- 入力: `battleHistory[]`, `currentParty[]`。
- 出力: 結果テーブル再描画。
- 前提条件: テーブルDOM存在。
- 失敗時挙動: DOM欠損時は処理中断。
- 境界条件: 行動が空なら `—` を表示。

### F9. CSV出力（v2追加必須）
- 入力: `battleHistory`, `turnLabel`, `currentParty`, `formatSpec`。
- 出力: `{csv: string, errors: ExportError[]}`。
- 前提条件: `formatSpec` が必須列定義（3行ヘッダ、6人固定列）を含む。
- 失敗時挙動: 履歴0件は `errors=[]` でヘッダのみ出力。`formatSpec` 不正時は `csv=''` と `errors` を返却。
- 境界条件: 6人固定列。行動名のカンマは引用符エスケープ。

### F10. 特殊ターン管理（v2追加必須）
- 入力: `turnType`, `odLevel`, `extraTurnState`, 発動イベント。
- 出力: ターンラベル（例 `OD1`, `追加1`）、行動制約、SP変動イベント。
- 前提条件: `BattleState.turnType` が `normal|od|extra` のいずれか。
- 失敗時挙動: 不正状態遷移は拒否し、直前の整合状態を維持。
- 境界条件: OD中の残行動回数0で `normal` に戻す。

### F11. SPイベント記録（v2追加推奨）
- 入力: SP変動の各ルール適用結果。
- 出力: `spChanges[]`。
- 前提条件: 変動前後SPが計算済み。
- 失敗時挙動: 不正sourceは `unknown` で記録しテストで検出。
- 境界条件: 1ターン内で同キャラ複数イベントを許容。

## 6. API仕様（明確化）
- `initializeBattle(partyConfig, skillCatalog) -> BattleState`
- `validateParty(partyConfig, skillCatalog) -> ValidationError[]`
- `selectSkill(state, position, skillId) -> {state, validation}`
- `applySwap(state, fromPos, toPos) -> {state, validation}`
- `previewTurn(state) -> {state, turnRecord}`
- `commitTurn(state) -> {state, turnRecord}`
- `applySpecialTurn(state, event) -> {state, validation}`
- `exportCsv(state, formatSpec) -> {csv: string, errors: ExportError[]}`

## 6.1 型定義（明確化）
- `type FrontPosition = 0 | 1 | 2`
- `type SkillAction = { skillId: string, skillName: string, cost: number, type: 'damage'|'non_damage'|'support' }`
- `type PlannedAction = { characterId: string, position: FrontPosition, action: SkillAction }`
- `type ExportError = { code: string, message: string, field?: string }`

## 7. データ仕様（明確化）
### BattleState
- `turnIndex: number`
- `turnLabel: string`
- `turnType: 'normal'|'od'|'extra'`
- `odLevel: 0|1|2|3`
- `odRemainingActions: number`
- `extraTurnState: {active:boolean, source:'od'|'skill', remainingActions:number, allowedCharacterIds:string[], grantTurnIndex:number}`
- `savedSPState: number[]`
- `positionMap: [number,number,number,number,number,number]`
- `party: CharacterState[6]`
- `turnActions: Partial<Record<FrontPosition, PlannedAction>>`
- `history: TurnRecord[]`

### CharacterState
- `characterId: string`
- `name: string`
- `position: 0|1|2|3|4|5`
- `sp: {current:number, max:number, bonus:number}`
- `skills: Skill[]`
- `buffs: BuffState[]`
- `debuffs: DebuffState[]`

### TurnRecord
- `turnId: number`
- `turnLabel: string`
- `turnType: 'normal'|'od'|'extra'`
- `enemyAction: string`
- `characters: {name:string,startSP:number,action:string,endSP:number}[]`
- `spChanges: SPChangeEntry[]`
- `swapEvents: SwapEvent[]`

## 8. 状態遷移仕様（明確化）
1. `INIT` -> `PARTY_READY`: 6人編成確定。
2. `PARTY_READY` -> `TURN_PREVIEWED`: `previewTurn` 実行。
3. `TURN_PREVIEWED` -> `TURN_PREVIEWED`: 同一ターン再プレビュー（上書き）。
4. `TURN_PREVIEWED` -> `TURN_COMMITTED`: `commitTurn` 実行。
5. `TURN_COMMITTED` -> `PARTY_READY`: 次ターン開始。
6. `PARTY_READY` -> `SWAP_PENDING`: swapモード開始。
7. `SWAP_PENDING` -> `PARTY_READY`: swap確定またはキャンセル。
8. `PARTY_READY` -> `OD_ACTIVE`: OD発動条件成立時。
9. `OD_ACTIVE` -> `EXTRA_ACTIVE`: OD由来の追加ターン付与条件成立時。
10. `PARTY_READY` -> `EXTRA_ACTIVE`: OD非依存スキルで追加ターン付与時。
11. `OD_ACTIVE` / `EXTRA_ACTIVE` -> `PARTY_READY`: 残行動回数0。

## 9. 実装時の判断ポイント（12件）
1. 既存グローバル変数を段階移行するか、一括置換するか。
2. `turnActions` のキーを position固定で維持するか、characterId基準に変更するか。
3. CSVのターン列に `turnIndex` と `turnLabel` を分離出力するか。
4. OD回復を `spChanges` に1イベントで記録するか、対象ごとに分割するか。
5. 追加ターン中の交代制約を `allowedCharacterIds` で判定するか、`allowedPositions` で判定するか。
6. バフ/デバフの `duration` 消費タイミングを「ターン開始」「ターン終了」のどちらに固定するか。
7. `executeTurn` と `nextTurn` 名称を維持するか、`preview/commit` へ改名するか。
8. フォールバック模擬データを本番ビルドで残すか、開発モード限定にするか。
9. 失敗時の通知を `alert` 維持にするか、UIメッセージ領域へ移行するか。
10. テーブル再描画を全件更新で維持するか、行差分更新へ変更するか。
11. テストでDOM依存を残すか、ドメイン関数単体へ寄せるか。
12. 既存 `skillDatabase.json` を拡張（effects追加）するか、変換レイヤで吸収するか。

## 10. 実装ステップ順
1. `BattleState` / `TurnRecord` / `SPChangeEntry` 型を定義。
2. 既存ロジックから `previewTurn` と `commitTurn` を純関数化。
3. `applySwap` を純関数化し、交代後の行動再割当規則を固定。
4. `turnType` と OD/追加ターン状態遷移を実装。
5. SPイベントストリーム記録を追加。
6. 結果テーブル生成を `TurnRecord` 入力化。
7. CSV生成器を追加し、3行ヘッダを出力。
8. 既存UIイベントを新APIへ接続。
9. ユニットテスト追加（OD/追加ターン/CSV/交代制約）。
10. 既存テストを再実行し、回帰を確認。

## 11. 未確定事項（未確定 + 仮説 + 検証方法）
- 未確定: OD回復対象が発動者のみか全体配布を含むか。
  - 仮説: v2は「発動者のみ」で実装する。
  - 検証方法: ユーザー承認 + サンプル戦闘ログ2件の期待値照合。
- 未確定: 追加ターン同時付与時の行動順。
  - 仮説: 現在前衛ポジション昇順で実行する。
  - 検証方法: 2人同時付与ケースの期待CSVをレビュー。
- 未確定: CSVで `敵行動` 列を必須にするか。
  - 仮説: v2は必須列として固定し、値未設定時は `敵行動` を出力。
  - 検証方法: 現行DOM列との一致検証 + ユーザー確認。
- 未確定: バフ/デバフをv2で計算まで行うか、記録のみか。
  - 仮説: v2は記録のみ（計算なし）で固定。
  - 検証方法: 実装工数と回帰影響を比較し承認を得る。

## 12. 推測ラベル付き補足
- 推測: 既存 `savedSPState` 方式は UI編集とプレビュー再計算を両立するために導入された。再構築時は immutable state へ置換すると副作用を減らせる。
- 推測: `skillDatabase.json` に `effects` 構造を追加すると、OD/追加ターン/他者回復を同一処理系で扱える。
