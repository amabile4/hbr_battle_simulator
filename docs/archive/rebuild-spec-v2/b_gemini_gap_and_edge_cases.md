[HANDSHAKE] provider=gemini model=gemini-unknown session=n/a ts=2026-02-24T15:49:29Z

# b_gemini_gap_and_edge_cases

## 0. 目的
本書は、再開発時の不足仕様・境界条件・運用要件を、既存実装と既存文書の差分から確定可能な粒度まで分解する。

## 1. 根拠ファイルパス（31件）
1. `README.md`
2. `hbr_gui_simulator_modular.html`
3. `index.html`
4. `js/globals.js`
5. `js/data-manager.js`
6. `js/party-manager.js`
7. `js/display-manager.js`
8. `js/event-handlers.js`
9. `js/control-manager.js`
10. `js/results-manager.js`
11. `skillDatabase.json`
12. `package.json`
13. `vitest.config.js`
14. `tests/setup.js`
15. `tests/control-manager.test.js`
16. `tests/skill-database.test.js`
17. `tests/fixtures/test-data.js`
18. `docs/rebuild-spec/00_overview.md`
19. `docs/rebuild-spec/01_as_is_implemented_spec.md`
20. `docs/rebuild-spec/02_gap_and_missing_requirements.md`
21. `docs/rebuild-spec/03_rebuild_requirements_v1.md`
22. `docs/rebuild-spec/04_non_functional_requirements.md`
23. `docs/rebuild-spec/05_data_model_and_interfaces.md`
24. `docs/rebuild-spec/06_risks_and_migration_strategy.md`
25. `docs/rebuild-spec/07_open_questions_for_user.md`
26. `docs/rebuild-spec/08_orchestration_report.md`
27. `docs/rebuild-spec/childA_codex_notes.md`
28. `docs/rebuild-spec/childB_gemini_notes.md`
29. `docs/rebuild-spec/childC_claude_notes.md`
30. `MODULAR_ARCHITECTURE.md`
31. `DEVELOPMENT_NOTES.md`

## 2. 機能別ギャップ・境界条件（16機能）

### F01 スキルDB読込
- 入力: `fetch('skillDatabase.json')` のHTTPレスポンス
- 出力: `characterDatabase` 初期化、編成UI生成呼び出し
- 前提条件: JSONに `characters` が存在し、キー数が1以上
- 失敗時挙動: `catch` で模擬データへ切替
- 境界条件: JSON成功でも `characters` 空の場合は例外化して模擬データへ遷移し、候補不足時は6人編成確定不可の状態へ遷移
- 不足仕様: JSONのスキーマバージョン不一致時の扱いが未定義

### F02 模擬データフォールバック
- 入力: 読込失敗例外
- 出力: 3キャラクター固定の `characterDatabase`
- 前提条件: `PartyManager.generateCharacterConfig()` が利用可能
- 失敗時挙動: 3キャラ構成のまま継続し、6人編成確定不能によって操作が劣化する
- 境界条件: 模擬データは6枠編成に対して候補不足を起こす
- 不足仕様: 本番運用で模擬データ許容か禁止かが未確定

### F03 編成UI生成と重複抑止
- 入力: `characterDatabase` キー配列
- 出力: 6枠の選択/数値入力DOM、重複候補の `disabled` 制御
- 前提条件: `CONFIG.MAX_CHARACTERS=6`
- 失敗時挙動: 候補数が6未満の場合はスロット表示を維持しつつ「6人編成確定不可」エラー状態を表示して確定操作を拒否
- 境界条件: 5人以下しか選べないデータでは6枠確定不能
- 不足仕様: 6名未満を許容する仕様が存在しない

### F04 編成確定バリデーション
- 入力: `char_i`, `sp_i`, `bonus_i`
- 出力: `currentParty` 配列、表示更新、ヘッダ更新
- 前提条件: 各 `char_i` が非空かつDB存在
- 失敗時挙動: `alert` 表示後に処理中断
- 境界条件: `parseInt` 失敗時に `6`/`0` へ強制
- 不足仕様: `sp_i` の上限超過値をプログラム側で再検証していない

### F05 配置入替（通常）
- 入力: 2つのポジション選択
- 出力: `positionMap` 交換、表示再生成
- 前提条件: 入替モード有効、2点選択成立
- 失敗時挙動: 同一ポジション再選択時は交換なし
- 境界条件: 前衛-後衛交換時にスキル選択が消去される
- 不足仕様: 追加ターン制約付きの交換可否判定が未実装

### F06 入替時スキル状態整合
- 入力: `turnActions`, `positionMap`, `currentParty`
- 出力: 前衛同士は行動移送、前後衛は行動削除
- 前提条件: `turnActions[position].character` が現配置と一致
- 失敗時挙動: 不一致行動は `confirmSPChanges` で消費スキップ
- 境界条件: 交換後に0コスト技が見つからない前衛は未選択状態
- 不足仕様: 未選択前衛がいる時の実行ボタン活性条件がUI依存

### F07 スキル選択（前衛限定）
- 入力: クリック位置、対象キャラのスキル一覧
- 出力: ドロップダウン候補、`turnActions[position]`
- 前提条件: クリック位置 `< 3` かつキャラ存在
- 失敗時挙動: 後衛クリックは無処理で終了
- 境界条件: `skill.cost > currentSP` は選択不可
- 不足仕様: `currentSP` がプレビュー中に変動した場合の候補再評価タイミングが未定義

### F08 ターン実行（プレビュー）
- 入力: `currentParty`, `turnActions`, `currentTurn`
- 出力: `battleHistory` に同ターン上書き保存
- 前提条件: 前衛3枠の行動が揃っている
- 失敗時挙動: 前提条件不成立の場合は保存拒否し、`TURN_PREVIEW_REJECTED` をエラー記録へ追加する
- 境界条件: 実行しても `currentSP` は変更しない
- 再現条件: 前後衛入替で0コスト未定義キャラが前衛化し、`turnActions` 未補完のまま実行条件が崩れる
- 不足仕様: 行動順序2フェーズ適用が記録に反映されない

### F09 次ターン遷移（確定）
- 入力: 現在ターンのプレビュー結果、`turnActions`
- 出力: SP消費確定、ターン+1、SP回復、行動初期化
- 前提条件: `battleHistory` に現在ターンが存在、または自動実行で生成。`turnType` が判定可能
- 失敗時挙動: DOM要素欠落時は表示同期が崩れる
- 境界条件: `normal` のみ `BASE_SP_RECOVERY + spBonus` を適用してターン+1。`od/extra` はターン据え置きで専用回復規則を適用
- 不足仕様: OD上限突破回復の例外規則が未実装

### F10 SP保存/復元
- 入力: `currentParty[].currentSP`
- 出力: `savedSPState[]` へ保存、または復元
- 前提条件: 配列長一致
- 失敗時挙動: 配列長不一致時は復元スキップ
- 境界条件: `null` キャラを0として保存
- 不足仕様: 復元失敗をUI通知しない

### F11 SP消費確定の整合判定
- 入力: 前衛3枠の `turnActions`
- 出力: 対象キャラの `currentSP` 減算
- 前提条件: `turnActions[position].character === current front character`
- 失敗時挙動: 名称不一致なら減算しない
- 境界条件: 減算後は下限0で丸め
- 不足仕様: 不一致発生時の監査ログが存在しない

### F12 戦闘履歴モデル
- 入力: ターン番号、敵行動固定文字列、6人分記録
- 出力: `battleHistory[]`
- 前提条件: 各キャラに `name/startSP/action/endSP`
- 失敗時挙動: ターン行は保存されるが、SP変動理由と配置変更履歴が欠落したまま固定化される
- 境界条件: 同一ターンは `findIndex` で上書き
- 不足仕様: 配置変更履歴・SP変動要因が未保存

### F13 結果テーブル描画
- 入力: `battleHistory`, `currentParty`
- 出力: ヘッダ2段 + ボディ行の再描画
- 前提条件: `resultsBody` と `thead` が存在
- 失敗時挙動: 要素欠落時は `return` して無更新
- 境界条件: 毎回 `tbody.innerHTML=''` で全件再描画
- 不足仕様: 大量ターン時の再描画コスト上限が未規定

### F14 CSV出力（未実装）
- 入力: 仕様上は `battleHistory + 配置履歴 + 特殊ターン状態`
- 出力: 仕様上はGoogle Spreadsheet互換CSV
- 前提条件: UTF-8、列Bターンラベル、2-3行目ヘッダ構造は固定。1行目ヘッダ文法は未確定（U04参照）
- 失敗時挙動: 現実装は機能自体が無く、出力不可
- 境界条件: A/D列余白、E-V固定列を要件化済みだがコード不在
- 不足仕様: 文字列エスケープ規則、改行含有セル処理が未確定

### F15 特殊ターン（OD/追加、未実装）
- 入力: OD発動操作、追加ターン付与効果
- 出力: `turnType`, `turnLabel`, `odLevel`, `extraTurnState`
- 前提条件: ターン進行に例外分岐を持つ
- 失敗時挙動: 現実装は通常ターン加算のみで要件不達
- 境界条件: 「ターン数増加しない特殊ターン」のルールが未反映
- 不足仕様: ODと追加ターン同時成立時の優先順位が未確定

### F16 バフ/デバフ管理（未実装）
- 入力: スキル効果適用イベント
- 出力: 効果種別・残ターン・重複数の状態
- 前提条件: 対象範囲と重複上限が定義済み
- 失敗時挙動: 現実装は保存先が無く履歴喪失
- 境界条件: エンハンス2重上限の扱いを要求文書は規定
- 不足仕様: 記録専用と計算反映の範囲分割が未確定

## 3. 具体論点（17件）
1. `currentTurn` が1開始実装で、要求文書の0ターン概念と不整合。
2. 特殊ターン中に「ターン数を増やさない」規則がコード上に存在しない。
3. 追加ターン時の交代制限ロジックが存在しない。
4. OD1/2/3のSP回復値(+5/+12/+20)を適用する処理が存在しない。
5. OD上限突破時の `MAX_SP=20` 例外処理が存在しない。
6. SP回復は `spBonus` 単一値のみで、対象範囲条件を表現できない。
7. `battleHistory.enemyAction` が固定値で、入力手段が存在しない。
8. 行動順序2フェーズ（非ダメージ先行）が履歴順序に反映されない。
9. `executeTurn` は現実装では前提破れ時に保存余地があるため、再構築では保存拒否とエラー記録を必須化する。
10. `parseInt` 依存で `sp`/`bonus` の小数・文字混在がサイレント補正される。
11. CSV機能が無く、READMEの最終出力要件を満たさない。
12. `results-manager` は全再描画方式で、長期セッション性能要件が未定義。
13. バフ/デバフ状態の永続モデルが無く、履歴列出力仕様へ接続不能。
14. フォールバック模擬データはキャラ数不足のため、6人固定要件との衝突がある。
15. `savedSPState` の復元失敗時にエラー通知が無い。
16. テストはSP周辺中心で、ターン種別・CSV・交代制限の回帰検証が未整備。
17. 仕様文書群で「Pythonクラス設計」と「ブラウザJS実装」が混在し、再開発境界が不明瞭。

## 4. 実装時判断ポイント（12件）
1. ターン番号の基準を `0開始` か `1開始` のどちらで固定するか。
2. `turnType` を `normal|od|extra` の単一値にするか、複合状態にするか。
3. OD回復で上限突破を許可する対象を「発動者のみ」に限定するか。
4. 追加ターン制約は「交代可否のみ」か「スキル選択可否」まで含めるか。
5. SPイベントモデルを差分ログ方式にし、監査可能性を優先するか。
6. `character` 識別子を表示名から `characterId` に変更するか。
7. CSV生成の責務を `ResultsManager` へ置くか、独立モジュールに分離するか。
8. CSVに改行/カンマを含むスキル名のエスケープ仕様をRFC4180準拠にするか。
9. `battleHistory` をターン確定時のみappendするか、プレビューで上書き維持するか。
10. 大量ターン時の描画戦略を全件再描画から差分更新へ切替えるか。
11. フォールバック模擬データを開発専用に限定し、本番で起動失敗扱いにするか。
12. テスト戦略を `unit中心` のままにするか、CSVスナップショット/E2Eを追加するか。

## 5. 未確定事項（未確定 + 仮説 + 検証方法）

### U01 追加ターンとOD同時成立
- 未確定: 同時成立時の表示ラベルと処理順序
- 仮説: 処理順序は `OD処理 -> 追加ターン処理`、表示は `ODn-追加m` の複合表記
- 検証方法: ルール表を作成し、同一入力で期待CSV行を3ケース作成して合意

### U02 追加ターン交代制限の単位
- 未確定: 制限対象を「キャラ単位」か「ポジション単位」か
- 仮説: キャラ単位で管理し、許可集合外との交換を禁止
- 検証方法: 1人追加/2人追加/前衛3人追加の3シナリオで交換可否表をレビュー

### U03 OD上限突破の復帰条件
- 未確定: OD終了後に20へ切り捨てるか維持するか
- 仮説: OD終了タイミングで20へ切り捨て
- 検証方法: OD中・OD終了直後・次通常ターン開始時のSP値を期待表で固定

### U04 CSV 3行ヘッダの固定文言
- 未確定: 1行目のバフ記録文法
- 仮説: 1行目は `battle_meta` としてキー=値をセミコロン連結
- 検証方法: 既存Spreadsheet運用サンプルを2件収集し文法を確定。確定後にF14前提条件へ昇格する

### U05 バフ/デバフのv1範囲
- 未確定: 記録のみ実装か、継続ターン計算まで含むか
- 仮説: v1は記録のみ、v1.1で継続計算追加
- 検証方法: 工数見積比較（記録のみ/継続計算）を提示し意思決定

### U06 同名キャラ将来対応
- 未確定: 同名別スタイル実装時の識別キー
- 仮説: `styleId` を主キー化し表示名は別属性に分離
- 検証方法: DBサンプルに同名2件を追加したバリデータ試験

## 6. 推測ラベル付き補足
- 推測: 再開発では `BattleState` 単一状態モデルへ寄せると、OD/追加ターン/CSVを同一履歴から生成できる。
- 推測: 既存の「プレビュー→確定」2段階はUX価値があるため、消費確定ポイントだけを厳密化すれば再利用可能。
- 推測: 仕様固定前にUIを先行実装すると、特殊ターンとCSVで再設計コストが増大する。
- 推測（将来拡張リスク）: `confirmSPChanges` の名称一致判定は同名キャラ導入時に識別衝突を起こすため、`characterId` 判定へ移行が必要になる。

## 7. 運用要件（最小）
1. 仕様確定前に `ターン遷移表` と `CSVサンプル` を承認する。
2. CIで `tests/skill-database.test.js` に加えて `特殊ターン` と `CSV` の回帰テストを必須化する。
3. `skillDatabase.json` 読込失敗時の挙動を `開発環境のみフォールバック` に限定する。
4. リリース判定条件に「README 10章のMust要件充足」を明記する。
