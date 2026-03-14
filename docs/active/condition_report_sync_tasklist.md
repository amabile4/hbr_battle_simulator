# 条件式/未対応レポート同期タスクリスト（PRI-014）

> **ステータス**: ✅ 完了 | 📅 開始: 2026-03-14 | 📅 最終更新: 2026-03-14

## 目的

- `src/turn/turn-controller.js` の条件 evaluator と `docs/20260306_tasklist/generate_skill_unimplemented_report.mjs` の判定差分を解消する
- false positive が多くなった `skills_unimplemented_summary.md` / `unsupported_matrix.csv` を、再び優先順位判断に使える状態へ戻す
- 真の runtime 残件である `HasSkill()` / `RemoveDebuffCount()` / `TargetBreakDownTurn()` / `SpecialStatusCountByType(146)` を閉じる

## 事前調査メモ（2026-03-14 ad-hoc survey）

- generator は `PlayedSkillCount` / `BreakHitCount` / `SpecialStatusCountByType(20)` / `OverDriveGauge` / `Sp` / `IsOverDrive` / `IsReinforcedMode` と少数の `CountBC(...)` しか認識していない
- runtime evaluator は既に以下を扱える
  - 逆順比較: `0.0 < DpRate()`
  - zero-arg: `DpRate` / `Ep` / `Turn` / `IsFront` / `IsCharging` / `IsHitWeak` / `MoraleLevel` / `MotivationLevel`
  - single-arg: `IsNatureElement` / `IsCharacter` / `IsTeam` / `IsWeakElement` / `IsZone` / `IsTerritory`
  - player-side / enemy-side `CountBC(...)`
- 現行 catalog の false positive 代表
  - `IsHitWeak()`
  - `IsCharging()`
  - `IsNatureElement(Fire)==1`
  - `IsZone(Thunder)==1`
  - `0.0<DpRate()`
  - `CountBC(IsPlayer() && IsTeam(31C)==1)>=3`
- 真の runtime gap は概ね以下
  - `HasSkill(YoOhshimaSkill53)==1`
  - `RemoveDebuffCount()>0`
  - `TargetBreakDownTurn()>0`
  - `SpecialStatusCountByType(146)` と関連 `overwrite_cond`

## 今回のスコープ

### 今回やること

- 条件 clause の supported/unresolved 判定を runtime 基準で共有化する
- `HasSkill()` / `RemoveDebuffCount()` / `TargetBreakDownTurn()` を evaluator に追加する
- `SpecialStatusCountByType(146)` を tracked special status として扱えるようにする
- `RemoveDebuff` 実行結果を action context へ載せ、同一スキル内 `hit_condition` で参照できるようにする
- 未対応レポートを再生成し、priority docs と README を同期する

### 今回やらないこと

- `PRI-015` の enemy-side `SpecialStatusCountByType(172)` / `Talisman` / `Misfortune` など低優先残件
- battle core の実ダメージ計算
- 敵 AI / 勝敗判定 / 戦闘終了フロー
- `docs/20260306_tasklist/` のスナップショット構造自体の改修

## 対象ファイル

- `src/turn/turn-controller.js`
- `src/domain/character-style.js`
- `docs/20260306_tasklist/generate_skill_unimplemented_report.mjs`
- `docs/20260306_tasklist/skills_unimplemented_summary.md`
- `docs/20260306_tasklist/skills_unimplemented_catalog.csv`
- `docs/20260306_tasklist/skills_unimplemented_occurrences.csv`
- `docs/20260306_tasklist/unsupported_matrix.csv`
- `tests/turn-state-transitions.test.js`
- `tests/condition-report-sync.test.js`
- `docs/active/implementation_priority_tasklist.md`
- `docs/README.md`

## タスクリスト

### フェーズ1: 判定ルール整理

- [x] **T01**: runtime evaluator と generator の条件 clause 判定を共有化する
- [x] **T02**: `overwrite_cond` を「無条件 unresolved」ではなく clause 単位で集計する
- [x] **T03**: `0.0 < DpRate()` / `IsNatureElement(...)` / `IsZone(...)` / `CountBC(...)` など既存実装済み false positive を generator から除外する

### フェーズ2: runtime 残件実装

- [x] **T04**: `HasSkill()` を member が保持する action / triggered skill label で解決する
- [x] **T05**: `TargetBreakDownTurn()` を選択中の敵 target の `DownTurn` から解決する
- [x] **T06**: `RemoveDebuffCount()` を action context に追加し、`RemoveDebuff` 実行結果で評価できるようにする
- [x] **T07**: `SpecialStatusCountByType(146)` を tracked special status として扱い、`overwrite_cond` / `SkillCondition` を解決する

### フェーズ3: テスト

- [x] **T08**: `HasSkill()` の evaluator テストを追加する
- [x] **T09**: `RemoveDebuffCount()` の skill-chain テストを追加する
- [x] **T10**: `TargetBreakDownTurn()` の target-aware 条件テストを追加する
- [x] **T11**: `御祈祷オーバーヒート` の real-data 回帰で `SpecialStatusCountByType(146)` + `overwrite_cond` を固定する
- [x] **T12**: generator 共有 helper の regression test を追加する

### フェーズ4: レポート/ドキュメント同期

- [x] **T13**: `generate_skill_unimplemented_report.mjs` を更新して CSV / summary を再生成する
- [x] **T14**: `implementation_priority_tasklist.md` の PRI-014 状態を更新する
- [x] **T15**: `docs/README.md` を同期する

## 完了条件

- `HasSkill()` / `RemoveDebuffCount()` / `TargetBreakDownTurn()` / `SpecialStatusCountByType(146)` が evaluator で処理できる
- `overwrite_cond` が generator で runtime と同じ supported/unresolved 判定になる
- `skills_unimplemented_summary.md` / `skills_unimplemented_catalog.csv` / `skills_unimplemented_occurrences.csv` / `unsupported_matrix.csv` が同じ判定ルールで再生成される
- PRI-014 完了時に本ファイル、[`implementation_priority_tasklist.md`](implementation_priority_tasklist.md)、[`../README.md`](../README.md) が同じコミットで更新される

## 実装結果

- `turn-controller` に `listUnsupportedConditionClausesByRuntimeSupport()` を追加し、generator が runtime と同じ clause 判定を使うようにした
- `HasSkill()` / `TargetBreakDownTurn()` / `RemoveDebuffCount()` を evaluator に追加した
- `RemoveDebuff` は preview 時に `removeDebuffCount` を先読みし、commit 時に tracked debuff status を実際に除去するようにした
- `SpecialStatusCountByType(146)` を tracked special status として扱い、`御祈祷オーバーヒート` の `overwrite_cond` / `SkillCondition` を接続した
- generator では `overwrite_cond` を clause 単位集計へ変更し、`PRI-013` までで吸収済みの top-level buff/effect label も `effect_unresolved` から除外した
- 再生成後の未対応集計は `state_condition_unimplemented: 1`, `overwrite_cond_unresolved: 3`, `effect_unresolved: 0` まで圧縮された

## 検証

- `node --test tests/condition-report-sync.test.js tests/turn-state-transitions.test.js`
  - 286 PASS
- `npm run test:quick`
  - 353 PASS
