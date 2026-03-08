# Code Review Follow-up Task List

> **ステータス**: 🟢 進行中 | 📅 最終更新: 2026-03-08

## 目的

- `docs/20260308_code-review/` は 2026-03-08 時点のレビュー結果を残すスナップショットとして維持する
- 実際の対応順、対応状況、完了コミット、関連テストはこの active ドキュメントで追跡する
- Phase 7 実装とレビュー指摘対応を混線させず、先に潰すものと後回しにするものを明示する

## 運用ルール

- レビュー本文の修正や追記は行わず、出典として `../20260308_code-review/` 配下を参照する
- 対応したタスクは `状態`、`完了コミット`、`確認テスト` を更新する
- 実装タスクを完了したら、関連する active ドキュメントも同じコミットで更新する
- `Phase 7 より先に対応する項目` は、低リスクで開発速度または安全性に直結するものに限定する

## 状態定義

| 状態 | 意味 |
|------|------|
| `todo` | 未着手 |
| `doing` | 着手中 |
| `done` | 完了 |
| `deferred` | 方針上、後回し |

## 優先順

1. P0: Phase 7 前に片付ける小さな効率改善
2. P0: Phase 7 前に片付ける小さなレビュー修正
3. P1: DP / passive の Phase 7
4. P2: テスト不足の補完
5. P3: 中長期のレビュー改善

## P0: Phase 7 前の即時対応

| ID | 状態 | 概要 | 出典 | 完了条件 | 完了コミット | 確認テスト | メモ |
|----|------|------|------|----------|--------------|------------|------|
| `R-001` | `done` | `package.json` に `test:quick` `test:dom` `test:dom:full` を追加する | [06_test_grouping_proposal.md](../20260308_code-review/06_test_grouping_proposal.md) | スクリプト追加、各コマンドの実行確認、利用方針を active docs に一言残す | `0414102` | `npm run test:quick`, `npm run test:dom`, `npm run test:dom:full` | 日常の反復は `test:quick`、DOM 変更確認は `test:dom`、PR 前は `test:dom:full` または `npm test` を使う |
| `R-002` | `done` | `src/ui/dom-adapter.js` の `SPECIAL_BREAK_CAP_BONUS_PERCENT` 直書きを共通定数参照へ統一する | [00_summary.md](../20260308_code-review/00_summary.md) `NEW-H1` | 該当 2 箇所が定数参照に置き換わり、関連テストが通る | `0414102` | `npm run test:quick`, `npm run test:dom`, `npm run test:dom:full` | 定数は `src/config/battle-defaults.js` に寄せて `turn-controller.js` と共有 |

## P1: DP / passive Phase 7

出典: [dp_implementation_plan.md](dp_implementation_plan.md), [passive_implementation_tasklist.md](passive_implementation_tasklist.md)

| ID | 状態 | 概要 | 完了条件 | 完了コミット | 確認テスト | メモ |
|----|------|------|----------|--------------|------------|------|
| `P7-001` | `done` | `OnPlayerTurnStart` の DP 条件パッシブを接続する | `DpRate()` 条件つき passive が turn start pipeline で反映される | `ca4cc72` | `npm test` | `applyInitialPassiveState()` と turn start pipeline で `HealDpRate` / `ReviveDpRate` を扱えるようにした |
| `P7-002` | `done` | `OnEnemyTurnStart` の DP 条件パッシブを接続する | base turn 境界で DP 条件 passive が反映される | `ca4cc72` | `npm test` | base turn 境界の `dp_passive` が `committedRecord.passiveEvents` と `committedRecord.dpEvents` に残る |
| `P7-003` | `done` | `OnEveryTurn` の DP 条件パッシブを接続する | `OnPlayerTurnStart` と区別を崩さずに `OnEveryTurn` が反映される | `ca4cc72` | `npm test` | passive timing の記録責務を維持したまま `dpEvents` を追加 |
| `P7-004` | `done` | `OnBattleWin` の DP 回復系パッシブを接続する | battle win 境界で DP 回復イベントと passive log が成立する | `ca4cc72` | `npm test` | DP 回復量の扱いは Phase 4 方針を維持 |
| `P7-005` | `done` | Phase 7 回帰テストを追加する | timing 別の DP 条件 passive と DP 回復起点が再現される | `ca4cc72` | `npm test` | `プロテクション` を no-op 代替として使う規約は維持 |
| `P7-006` | `done` | Phase 7 完了後に active docs を更新する | `dp_implementation_plan.md` と `passive_implementation_tasklist.md` の進捗が一致する | `ca4cc72` | `npm test` | `docs/README.md` の DP plan ステータスも完了へ更新する |

## P2: テスト不足の補完

| ID | 状態 | 概要 | 出典 | 完了条件 | 完了コミット | 確認テスト | メモ |
|----|------|------|------|----------|--------------|------------|------|
| `T-001` | `done` | `damage-calculation-context.js` の単体テストを追加する | [05_test_coverage_review.md](../20260308_code-review/05_test_coverage_review.md) | 専用テストファイルで境界値を直接確認できる | `0dc9886` | `npm test` | `tests/damage-calculation-context.test.js` を新設し、`test:quick` に組み込んだ |
| `T-002` | `done` | `adapter-core.js` / `battle-adapter-facade.js` の単体テストを追加する | [05_test_coverage_review.md](../20260308_code-review/05_test_coverage_review.md) | DOM に依存しないロジックを分離して検証できる | `0dc9886` | `npm test` | swap 制約、`preserveTurnPlans` 分岐、turn-plan capture を DOM なしで固定した |
| `T-003` | `done` | fixture または `maxCandidates` による dom-adapter テスト高速化 | [07_test_data_shrink_study.md](../20260308_code-review/07_test_data_shrink_study.md) | 高速化方式を選定し、`test:dom` と組み合わせて運用できる | `1e9fe29` | `npm run test:dom:full`, `npm test` | `test:dom` 系では候補ラベル allowlist を使い、full data の `npm test` は従来どおり残す |
| `T-004` | `done` | 実データ未カバーのメカニクスカテゴリテストを補完する | [08_test_coverage_from_real_data.md](../20260308_code-review/08_test_coverage_from_real_data.md) | EP / SP量条件 / Morale / 後衛条件の不足分を追加 | `1e9fe29` | `npm test` | `tests/real-data-mechanics-coverage.test.js` を新設し、`test:quick` に組み込んだ |

## P3: 中長期のレビュー改善

| ID | 状態 | 概要 | 出典 | 完了条件 | 完了コミット | 確認テスト | メモ |
|----|------|------|------|----------|--------------|------------|------|
| `R-003` | `deferred` | `src/ui/dom-adapter.js` の分割計画と実施 | [04_recommendations.md](../20260308_code-review/04_recommendations.md) `R-C1` | 役割分割方針が確定し、テストを保ったまま分割できる | - | - | 工数大、Phase 7 と混ぜない |
| `R-004` | `deferred` | `src/turn/turn-controller.js` の分割計画と実施 | [04_recommendations.md](../20260308_code-review/04_recommendations.md) `R-C2` | passive / condition / effect / recovery の責務が分離される | - | - | 工数大、リスク高 |
| `R-005` | `done` | `swap()` / `queueSwapState()` の原子性改善 | [04_recommendations.md](../20260308_code-review/04_recommendations.md) `R-H1` | 途中失敗時の状態不整合が起きない | `1e9fe29` | `npm run test:quick`, `npm test` | `Party.swap()` は `setPosition()` に依存せず直接位置を入れ替え、同一位置 swap は no-op にした |
| `R-006` | `doing` | エラーハンドリング戦略の統一 | [04_recommendations.md](../20260308_code-review/04_recommendations.md) `R-H2` | UI / domain / 外部 I/O の例外方針が統一される | - | `npm run test:dom:full`, `npm test` | UI event 入口、外部 I/O (`localStorage`, scenario JSON 読み込み)、force/replay warning 付与までは helper 化済み。残りは `dom-adapter` 内の深い replay 分岐整理 |
| `R-007` | `done` | Regex 条件解析の定数化・安全化 | [03_turn_layer.md](../20260308_code-review/03_turn_layer.md), [04_recommendations.md](../20260308_code-review/04_recommendations.md) `R-H3` | 重複 regex とマジックナンバーが整理される | `11e886e` | `npm run test:quick`, `npm test` | 比較演算子・数値・関数呼び出し・`SpecialStatusCountByType(20)` を turn-controller のモジュール定数へ集約した |
| `R-008` | `done` | 日本語文字列ハードコードの削減 | [04_recommendations.md](../20260308_code-review/04_recommendations.md) `R-H4` | 代表的なスキル名直比較がフラグまたは定数へ置き換わる | `84e60e7` | `npm run test:quick`, `npm test` | `通常攻撃` / `指揮行動` / `追撃` の代表的な比較を `src/domain/skill-classifiers.js` へ集約した |
| `R-009` | `deferred` | `battle-adapter-facade.js` / `dom-adapter.js` の状態管理整理 | [00_summary.md](../20260308_code-review/00_summary.md) `H1` | 状態変数の責務が分離され、因果関係が追える | - | - | |

## 対応記録メモ

- 2026-03-08: follow-up 用 active タスクリストを新設。レビュー本文は snapshot として固定し、今後の対応状況はこの文書で追跡する方針を確定。
- 2026-03-08: P0 として `test:quick` / `test:dom` / `test:dom:full` を導入。日常反復では `test:quick` を基本にし、DOM を触った時だけ `test:dom` を追加、PR 前に `test:dom:full` または `npm test` を回す。
- 2026-03-08: Phase 7 で passive 起点の `dpEvents` を turn start / boundary timing に接続。`OnPlayerTurnStart` / `OnEveryTurn` / `OnEnemyTurnStart` / `OnBattleWin` の DP 条件 passive を実装し、unsupported passive log の誤混入も同時に修正した。
- 2026-03-08: `damage-calculation-context.js` の専用テストを追加。defaults、`targetEnemyIndex` の null-safe 正規化、`eligibleEnemyIndexes` のフィルタ、`funnelEffects` clone を直接固定した。
- 2026-03-08: `adapter-core.js` / `battle-adapter-facade.js` の単体テストを追加。swap の EX 制約、`preserveTurnPlans` の reset/preserve 分岐、commit 時の turn-plan capture を DOM なしで検証できるようにした。
- 2026-03-08: `T-004` として EP 消費、`Ep()>=N`、`Sp()<=N` / `Sp()>=N && IsFront()`、`MoraleLevel()>=N && IsFront()`、`IsFront()==0` を実データカテゴリ単位で追加し、`tests/real-data-mechanics-coverage.test.js` に集約した。
- 2026-03-08: `T-003` は `maxCandidates` 単独では必要キャラが index 50 まで散って効果が薄かったため、`HBR_TEST_CHARACTER_LABELS` による候補ラベル allowlist を採用した。`test:dom` / `test:dom:full` は軽量候補集合、`npm test` は full data のまま使い分ける。
- 2026-03-08: `R-005` として `Party.swap()` を setter 連鎖から切り離し、直接 position/revision を更新する原子的な入れ替えに変更した。`setPosition` を差し替えても swap が崩れないことと、同一位置 swap が no-op であることをテストで固定した。
- 2026-03-08: `R-007` として condition 評価まわりの regex を turn-controller 冒頭へ集約した。比較演算子、整数/小数パターン、`CountBC`、`PlayedSkillCount`、`SpecialStatusCountByType(20)`、`IsCharacter(...)` などの重複を定数化し、extra-active の type `20` も定数へ置いた。
- 2026-03-08: `R-006` 着手として `dom-adapter` の UI event 入口を共通 helper (`bindSafeClickAction`, `bindSafeRootListener`) に寄せた。direct click と delegated change の両方が `runSafely()` を通ることを DOM テストで固定した。
- 2026-03-08: `R-008` として `通常攻撃` / `指揮行動` / `追撃` の代表的な name/label/desc 直比較を `src/domain/skill-classifiers.js` へ切り出し、`hbr-data-store` / `dom-adapter` / `turn-controller` から共有する形にした。classifier 単体テストも追加した。
- 2026-03-08: `R-006` の次段として `localStorage` 読み書きと scenario JSON 読み込みを `dom-adapter` の helper へ寄せた。`readSelectionStore()` は read/parse 失敗時に空ストアへフォールバックし、`writeSelectionStore()` と `parseScenarioDocument()` は UI 側で扱いやすい文脈付きエラーへ包み直すようにした。
- 2026-03-08: `R-006` の force/replay 系でも `executeScenarioStep()` と `resetTurnReplayTransientState()` を導入し、`kishinka` / swap / action override / position alignment の warning 付与と、force fallback 前の transient state reset を 1 箇所へ寄せた。`turnPlanReplayWarnings` に `swap skipped` が残ることも DOM テストで固定した。
