# 敵特殊状態残件整理 タスクリスト（PRI-015）

> **ステータス**: ✅ 完了 | 📅 開始: 2026-03-14 | 📅 完了: 2026-03-14

## 目的

- enemy-side `SpecialStatusCountByType(3/22/172)` を既存 `enemyState.statuses` / special break 基盤へ接続する
- `generate_skill_unimplemented_report.mjs` の enemy status 判定を runtime 実装済み範囲に同期する
- `PRI-014` 後の真の残件を「条件で参照される enemy special status」と「未参照の確率系/補助 status」に分離する

## 事前調査メモ

- `SpecialStatusCountByType(3)` は `にゃんこ大魔法` の文言と実パーツから `DefenseDown` と推定できる
- `SpecialStatusCountByType(22)` は `御稲荷神話` の文言と実パーツから `Fragile` と推定できる
- `SpecialStatusCountByType(172)` は `シンメトリー・リベレーション` の文言と `SuperBreakDown` 実装から `SuperDown` と推定できる
- `DefenseDown` / `Fragile` / `AttackDown` / `ResistDown` / `ResistDownOverwrite` は `PRI-011` で実装済み
- `SuperBreakDown` は `applyEnemyBreakEffectsFromActions()`、`Talisman` は passive timing + `enemyState.talismanState` で既に実装済み
- それでも `skills_unimplemented_summary.md` に `enemy_status_unimplemented` が残るのは、generator が keyword ベースで過大検出しているため
- `StunRandom` / `ConfusionRandom` / `ImprisonRandom` / `Misfortune` / `HealDown` / `Hacking` / `Cover` / enemy-target `AttackUp` / `DefenseUp` は現時点で条件参照が見当たらない

## 今回のスコープ

### 今回やること

- enemy special status type `3 / 22 / 172` を runtime condition evaluator に追加する
- enemy status report を runtime 実装済み skill_type と同期する
- `にゃんこ大魔法` / `御稲荷神話` / `シンメトリー・リベレーション` の real-data 回帰を追加する
- 再生成レポートと priority docs / README を同期する

### 今回やらないこと

- `StunRandom` / `ConfusionRandom` / `ImprisonRandom` の deterministic simulator rule 実装
- `Misfortune` / `HealDown` / `Hacking` / `Cover` / enemy-target `AttackUp` / `DefenseUp` の state 保存
- 敵状態異常のダメージ計算反映
- UI からの手動 enemy status 入力拡張

## 対象ファイル

- `src/turn/turn-controller.js`
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

### フェーズ1: runtime 条件接続

- [x] **T01**: `SpecialStatusCountByType(3)` を enemy-side `DefenseDown` として解決する
- [x] **T02**: `SpecialStatusCountByType(22)` を enemy-side `Fragile` として解決する
- [x] **T03**: `SpecialStatusCountByType(172)` を enemy-side `SuperDown` として解決する

### フェーズ2: report 同期

- [x] **T04**: enemy status report 用に runtime 実装済み skill_type 判定 helper を追加する
- [x] **T05**: generator で `DefenseDown` / `Fragile` / `AttackDown` / `ResistDown` / `ResistDownOverwrite` / `SuperBreakDown` / `Talisman` を false positive から除外する
- [x] **T06**: 再生成後の残件を「未参照の確率系/補助 status」に限定する

### フェーズ3: テスト

- [x] **T07**: `condition-report-sync.test.js` に `SpecialStatusCountByType(3/22/172)` support を追加する
- [x] **T08**: `にゃんこ大魔法` の `overwrite_cond` 回帰を追加する
- [x] **T09**: `御稲荷神話` の `overwrite_cond` 回帰を追加する
- [x] **T10**: `シンメトリー・リベレーション` の `overwrite_cond` + `SkillCondition` 回帰を追加する

### フェーズ4: ドキュメント同期

- [x] **T11**: 再生成 CSV / summary を更新する
- [x] **T12**: `implementation_priority_tasklist.md` と `docs/README.md` を同期する

## 完了条件

- `CountBC(IsPlayer()==0&&IsDead()==0&&SpecialStatusCountByType(3/22/172)>0)` が runtime で解決する
- `にゃんこ大魔法` / `御稲荷神話` / `シンメトリー・リベレーション` の `overwrite_cond` が実データ回帰で固定される
- generator が runtime 実装済み enemy status を未対応として再列挙しない
- `enemy_status_unimplemented` が未参照の確率系/補助 status 中心まで縮小される
- 本ファイル、[`implementation_priority_tasklist.md`](implementation_priority_tasklist.md)、[`../README.md`](../README.md) が同じコミットで更新される

## 実装結果

- `turn-controller` の enemy-side `SpecialStatusCountByType` に `3: DefenseDown`, `22: Fragile`, `172: SuperDown` を追加した
- report 用 helper `classifyEnemyStatusPartRuntimeSupport()` を追加し、generator が runtime 実装済み enemy status を false positive で再列挙しないようにした
- `にゃんこ大魔法` / `御稲荷神話` / `シンメトリー・リベレーション` の `overwrite_cond` と `SkillCondition` 回帰を固定した
- 再生成後の未対応集計は `state_condition_unimplemented: 0`, `overwrite_cond_unresolved: 0`, `enemy_status_unimplemented: 10 keys / 40 occurrences` まで圧縮された
- 残件は `StunRandom` / `ConfusionRandom` / `ImprisonRandom` / `Misfortune` / `HealDown` / `Hacking` / `Cover` / enemy-target `AttackUp` / `DefenseUp` / passive `DefenseDown` に整理できた

## 検証

- `node --test tests/condition-report-sync.test.js tests/turn-state-transitions.test.js`
  - 291 PASS
- `npm run test:quick`
  - 356 PASS
