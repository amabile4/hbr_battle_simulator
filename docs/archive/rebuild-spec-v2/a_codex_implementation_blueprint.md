[HANDSHAKE] provider=codex model=gpt-5-codex session=n/a ts=2026-02-24T15:49:31Z

# A_Codex Implementation Blueprint (Rebuild Spec v2)

## 0. 目的と適用範囲
- 目的: 現行実装の事実を保持しつつ、再実装時に仕様欠落で停止しない実装青写真を定義する。
- 対象: ブラウザ版戦闘シミュレータのドメイン状態管理、ターン計算、配置入れ替え、結果出力、テスト。
- 対象外: ダメージ計算、敵AI判定、サーバー保存。
- 仕様レベル: 実装直前レベル。関数契約、失敗時挙動、境界条件を固定する。

## 1. 根拠ファイル一覧（34件）
1. `README.md`
2. `MODULAR_ARCHITECTURE.md`
3. `DEVELOPMENT_NOTES.md`
4. `CLAUDE.md`
5. `index.html`
6. `hbr_gui_simulator_modular.html`
7. `package.json`
8. `vitest.config.js`
9. `skillDatabase.json`
10. `js/globals.js`
11. `js/data-manager.js`
12. `js/party-manager.js`
13. `js/display-manager.js`
14. `js/event-handlers.js`
15. `js/control-manager.js`
16. `js/results-manager.js`
17. `css/styles.css`
18. `css/party-setup.css`
19. `css/party-display.css`
20. `css/controls.css`
21. `css/results.css`
22. `tests/setup.js`
23. `tests/control-manager.test.js`
24. `tests/skill-database.test.js`
25. `tests/fixtures/test-data.js`
26. `docs/rebuild-spec/00_overview.md`
27. `docs/rebuild-spec/01_as_is_implemented_spec.md`
28. `docs/rebuild-spec/02_gap_and_missing_requirements.md`
29. `docs/rebuild-spec/03_rebuild_requirements_v1.md`
30. `docs/rebuild-spec/04_non_functional_requirements.md`
31. `docs/rebuild-spec/05_data_model_and_interfaces.md`
32. `docs/rebuild-spec/06_risks_and_migration_strategy.md`
33. `docs/rebuild-spec/07_open_questions_for_user.md`
34. `docs/rebuild-spec/08_orchestration_report.md`

## 2. 実装構造（固定）
- 層1: `StateEngine`（純粋関数）。DOM参照禁止。
- 層2: `UseCase`（UI入力をStateEngine引数へ正規化）。
- 層3: `Renderer`（DOM描画専用）。状態更新禁止。
- 層4: `Persistence/Export`（CSV生成）。

### 2.1 最低限の状態モデル
- `BattleState`
  - `turnIndex: number`
  - `turnType: 'normal' | 'od' | 'extra'`
  - `turnLabel: string`（`1`, `OD1`, `追加1` など）
  - `odLevel: 0 | 1 | 2 | 3`
  - `odRemainingActions: number`
  - `odAllowOverflow: boolean`
  - `extraTurnState: ExtraTurnState`
  - `positionMap: [number, number, number, number, number, number]`
  - `party: CharacterState[6]`
  - `savedSPState: SavedSPState | null`
  - `plannedActions: Record<FrontPosition, PlannedAction>`
  - `history: TurnRecord[]`
- `CharacterState`
  - `id, name, initialSP, currentSP, spBonus, skills`
- `TurnRecord`
  - `turnIndex, turnLabel, turnType, enemyAction, characters[6], spEvents[]`

### 2.2 型定義（必須）
- `type FrontPosition = 0 | 1 | 2`
- `type SavedSPState = [number, number, number, number, number, number]`
- `type PlannedAction = {`
  - `characterId: string`
  - `characterName: string`
  - `skillId: string`
  - `skillName: string`
  - `skillCost: number`
  - `position: FrontPosition`
  - `}`
- `type ExtraTurnState = {`
  - `active: boolean`
  - `allowedCharacterIds: string[]`
  - `remainingActions: number`
  - `grantedBy: 'od' | 'skill'`
  - `}`
- `type CsvExportResult = {`
  - `status: 'ok' | 'error'`
  - `csv: string`
  - `errors: string[]`
  - `}`

## 3. アルゴリズム仕様（中核）
### 3.1 ターン実行（プレビュー）
1. `savedSPState` 未保存なら保存、保存済みなら復元。
2. 前衛3枠のみ `plannedActions` を適用し `endSPPreview = startSP - cost` を計算。
3. `history` は同一 `turnIndex` を上書き。
4. `currentSP` は変更しない。

### 3.2 ターン確定（次ターン）
1. 未プレビューなら自動でプレビュー実行。
2. 前衛3枠のみ `currentSP -= cost`、下限0。
3. `savedSPState` を破棄。
4. `turnType` で分岐して次状態を確定。
5. `turnType='normal'`: `turnIndex = turnIndex + 1`、全6人に `BASE_SP_RECOVERY + spBonus` を加算し上限20で丸める。
6. `turnType='od'`: `turnIndex` は増加させず、OD発動者へ `OD_SP_RECOVERY[odLevel]`（`{1:5, 2:12, 3:20}`）を加算する。`odAllowOverflow=true` の間は20上限を適用しない。
7. `turnType='extra'`: `turnIndex` は増加させず、追加ターン仕様で定義された回復イベントのみ適用する。通常の `BASE_SP_RECOVERY` は適用しない。
8. 分岐後に `plannedActions` を初期化し、前衛へcost=0スキルを再設定。

### 3.3 配置入れ替え
1. `positionMap[from]` と `positionMap[to]` を交換。
2. 前衛↔前衛: `plannedActions` を交換し `character` 名を再解決。
3. 前衛↔後衛を含む交換: 該当2ポジションの `plannedActions` を削除。
4. 新前衛にcost=0スキルを補完。
5. プレビュー中ならSP復元後に同ターン結果を再計算。

### 3.4 SPイベント化（再実装時追加）
- `SPEvent = {source, targetId, delta, pre, post, ruleId}`。
- `source`: `base_recovery | bonus_recovery | skill_cost | passive | active_recovery | od_recovery`。
- 1ターンのSP変化は合計でなくイベント列で保持する。

## 4. 機能別仕様（I/O/前提/失敗/境界）
### F01 スキルDB読込
- 入力: `skillDatabase.json` のURL。
- 出力: `characterDatabase`。
- 前提条件: JSONに `characters` が存在。
- 失敗時挙動: fetch/parse失敗時は模擬データへ切替。
- 境界条件: キャラ0件時はUIに「読込中/失敗」表示し編成確定不可。

### F02 パーティー設定UI生成
- 入力: `characterDatabase`。
- 出力: 6スロット分の `select + initialSP + spBonus`。
- 前提条件: `CONFIG.MAX_CHARACTERS=6`。
- 失敗時挙動: DB空ならスロット生成せずメッセージ表示。
- 境界条件: `initialSP` は4..20、`spBonus` は0..3。

### F03 編成確定
- 入力: 6スロット選択値。
- 出力: `currentParty[6]`。
- 前提条件: 6枠すべて選択済みかつDB存在キャラ。
- 失敗時挙動: 未選択/未知キャラで確定中断、ユーザー通知。
- 境界条件: 同名キャラ重複はUIで無効化。

### F04 前衛スキル選択
- 入力: front position, skill index。
- 出力: `plannedActions[position]` 更新。
- 前提条件: position<3、対象キャラ存在。
- 失敗時挙動: 後衛クリック時は無処理。
- 境界条件: `cost > currentSP` のスキルは選択不可。

### F05 ターン実行ボタン活性制御
- 入力: 前衛3枠の `plannedActions` 有無。
- 出力: executeボタン `disabled`。
- 前提条件: 前衛キャラが存在。
- 失敗時挙動: DOM要素未取得時は状態更新をスキップ。
- 境界条件: 前衛枠にnullがある編成は未許可（編成時に排除）。

### F06 ターンプレビュー
- 入力: `currentParty`, `positionMap`, `plannedActions`, `turnIndex`。
- 出力: `TurnRecord`（上書き保存）。
- 前提条件: 前衛3枠の行動が定義済み。
- 失敗時挙動: 行動欠落時は実行不可（ボタン抑止）。
- 境界条件: 同一ターン複数実行は常に上書き。

### F07 次ターン確定
- 入力: 現在ターンの `plannedActions`。
- 出力: `currentSP` 確定、`turnType` に応じた次状態。
- 前提条件: 当該ターンレコードが存在（無ければ自動作成）。
- 失敗時挙動: キャラ不整合時は該当消費をスキップ。
- 境界条件:
  - `normal`: `turnIndex = turnIndex + 1`、全6人へ `BASE_SP_RECOVERY + spBonus` を適用し上限20で丸める。
  - `od`: `turnIndex` を増加させず、OD発動者に `OD_SP_RECOVERY[odLevel]` を適用する。`odAllowOverflow=true` の間は上限20を適用しない。
  - `extra`: `turnIndex` を増加させず、`extraTurnState.remainingActions` を1減算する。0到達で `turnType='normal'` とし、交代制約を解除する。

### F08 配置入れ替え
- 入力: 2つのposition。
- 出力: `positionMap`, `plannedActions`, 再描画。
- 前提条件: swap mode有効、2点選択完了。
- 失敗時挙動: 同一点再選択時は交換せずモード終了。
- 境界条件: 前衛↔後衛交換時は行動再入力が必要。

### F09 結果テーブル描画
- 入力: `history`。
- 出力: `resultsBody` 行群。
- 前提条件: ヘッダ構造が存在。
- 失敗時挙動: tbody未取得時は処理中断。
- 境界条件: 行動名長文は折返し表示、値は文字列化。

### F10 結果ヘッダ更新
- 入力: `currentParty`。
- 出力: 2段ヘッダ（キャラ名 + 始/行動/終）。
- 前提条件: 6人編成完了。
- 失敗時挙動: thead未取得時は更新しない。
- 境界条件: キャラ名空文字は禁止（編成時に排除）。

### F11 スキルDB整合性検証（CI）
- 入力: `skillDatabase.json`。
- 出力: pass/fail。
- 前提条件: metadata/characters構造。
- 失敗時挙動: テスト失敗でCI停止。
- 境界条件: costは0..20整数、通常攻撃(cost=0)を全キャラ必須。

### F12 CSV出力（新規実装対象）
- 入力: `history`, `currentParty`, `formatSpec`。
- 出力: `CsvExportResult`。
- 前提条件: ターンラベル規約と3行ヘッダ仕様が確定済み。
- 失敗時挙動: 必須列不足時は `CsvExportResult{status:'error', csv:'', errors:[...]}`
  を返却する。例外送出は行わない。
- 境界条件:
  - RFC4180準拠で `,` `"` 改行を含むセルを二重引用符でエスケープする。
  - 先頭文字が `=` `+` `-` `@` のセルは式インジェクション対策として先頭に `'` を付与する。
  - UTF-8/BOM有無を実装オプション化し、6人固定列を維持する。

## 5. 具体論点（18件）
1. `savedSPState` はプレビュー再実行の決定性担保に必須。
2. `turnActions[position].character === currentCharacter.name` 条件は消費誤適用を防ぐ。
3. `positionMap.indexOf(index)` はO(n)で6固定なら許容、将来人数可変化時は逆引き配列へ変更。
4. 入れ替え直後の結果再計算を行わないと `history` の行動主体が不一致になる。
5. 前衛↔後衛交換時に行動を削除する設計は、誤キャラへのSP消費確定を防止する。
6. デフォルトスキル自動選択は `executeBtn` の無効化解除条件を満たすために必要。
7. `battleHistory` の同ターン上書きはプレビューUIと一致する。
8. `nextTurn` の自動プレビュー実行は未記録ターンの発生を防止できる。
9. SP回復を「次ターン時」に限定する現在仕様はREADMEの一部要件と差分がある。
10. `spBonus` 単値では他者付与型パッシブを表現できない。
11. `results-manager` の全再描画は実装量を削減できるが、100ターン超でDOM更新量が増加する。
12. `skillDatabase` の `type` 値が `damage/non_damage/support` で混在するため列挙固定が必要。
13. `alert` 依存の入力エラー通知はテストしにくい。
14. `globals.js` 主導の共有可変状態は回帰原因の局所化を困難化する。
15. 現行テストはControlManager実装を直接importせずモック再実装しているため、回帰検知力が限定的。
16. テーブル列幅デバッグUIは本番表示ノイズになるため開発フラグで分離すべき。
17. `loadMockData()` は起動継続手段として機能するが、本番での誤使用リスクがある。
18. `index.html` リダイレクト構成は単純だがURLパラメータ保持に注意が必要。

## 6. 実装時判断ポイント（12件）
1. 状態管理方式: グローバル継続か `BattleState` 単一オブジェクト化か。
2. 既存クラス構造継承か、`StateEngine + Adapter` へ分離するか。
3. SP計算を合計値更新で続行するか、`SPEvent` 列へ移行するか。
4. OD/追加ターンの表現を `turnType + meta` に統一するか。
5. CSV出力責務を `ResultsManager` に置くか独立 `ExportManager` に置くか。
6. スキルtype正規化のタイミングをロード時にするかビルド時にするか。
7. 交代制約判定をUI層で行うかUseCase層で行うか。
8. エラー通知を `alert` 継続か、画面内通知コンポーネント化か。
9. テスト方針をモック中心から実モジュールimport中心へ切替えるか。
10. デバッグ表示をDOM常設か開発モード限定か。
11. `save/restore` を残すか、毎回純粋再計算へ置換するか。
12. 6人固定を堅持するか将来可変人数に備えるか。

## 7. 未確定事項（必ずラベル付き）
- 未確定: OD1/OD2/OD3のSP配布対象。
  - 仮説: 現行README記述に合わせ「発動者のみ」。
  - 検証方法: 仕様確定会議でユーザー承認を取得し、サンプルCSV 3ケースを承認物に固定。
- 未確定: 追加ターン複数付与時の行動順。
  - 仮説: position昇順を基本とし、同一キャラ重複付与は1回に圧縮。
  - 検証方法: 競合ケース（2名/3名付与）をテーブル化し承認を得る。
- 未確定: CSVのA,D列など補助列の必須性。
  - 仮説: v2初版は必須列のみ実装し補助列は空欄固定。
  - 検証方法: 既存運用シートへのインポート検証を3回実施。

## 8. 推測（事実と分離）
- 推測: 再実装は「UI再利用 + 状態計算差し替え」が総工数最小。
- 推測: 先にCSV契約を固定するとOD/追加ターンの状態表現が自然に確定する。
- 推測: 既存テスト資産はDB整合性維持に有効、ただしターン遷移は再設計後に全面書換が必要。

## 9. テスト観点（再実装時の必須ケース）
- 正常系: 編成→スキル選択→プレビュー→次ターン→回復までの一連遷移。
- 正常系: 前衛↔前衛交換後も行動主体が一致すること。
- 正常系: 前衛↔後衛交換後に行動が再入力必須になること。
- 異常系: DB読込失敗で模擬データへフォールバックすること。
- 異常系: 不正スキルindex入力時に状態破壊しないこと。
- 境界: SP=0で高コストスキルを選択不可にすること。
- 境界: SP回復で20超過しないこと。
- 境界: 同一ターンの複数プレビューが上書きであること。
- 境界: cost=0スキルのみ選択時にSP不変であること。
- 回帰: CSV出力の列数・ヘッダ行数が固定であること。
- 回帰: `turnType='od'` で `turnIndex` 非増加、`odRemainingActions` 減算、`odAllowOverflow` 適用が成立すること。
- 回帰: `turnType='extra'` で `turnIndex` 非増加、`extraTurnState.remainingActions` の減算と0到達時の通常復帰が成立すること。
- 回帰: `extraTurnState.allowedCharacterIds` 外との配置入れ替えを拒否できること。

## 10. 実装順序（停止しないための順）
1. `BattleState` 型と `TurnRecord` 型を定義。
2. `executePreview` と `confirmTurn` の純粋関数を先行実装。
3. 入れ替えロジックを純粋関数化。
4. 既存UIから新UseCaseを呼ぶアダプタを実装。
5. CSVエクスポータを追加。
6. ユニットテストを純粋関数中心に再編。
7. 最後にDOMデバッグ表示を開発モード限定へ移行。
