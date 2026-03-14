# Implementation Priority Task List

> **ステータス**: 🟢 進行中 | 📅 最終更新: 2026-03-14
>
> **前回完了分**: [`../archive/20260314_priority_history_pri010_012.md`](../archive/20260314_priority_history_pri010_012.md) に `PRI-010`〜`PRI-012` を退避済み
>
> **判断メモ**: `PRI-016` を完了し、residual enemy status 10 key を action / passive runtime へ接続した。再生成後の unsupported report は `state_condition` `0`, `overwrite_cond` `0`, `enemy_status` `0`, `effect` `0`

## 目的

- 次の実装波を `3` 本に絞り、再開時の判断コストを下げる
- `CharacterStyle.statusEffects` / `turn-controller` / `record` の既存基盤を再利用して短い波で閉じる
- スナップショット由来の古い未対応件数ではなく、現行コードに即した優先順位へ更新する

## 優先度決定基準

1. 既存の `statusEffects` / `enemyState.statuses` / condition evaluator を再利用できるか
2. 1 本で複数 label / skill 群を同時に前進させられるか
3. `preview / commit / record / scenario / docs / tests` まで一気通貫で閉じられるか
4. battle core 未実装でも planning / record の価値が上がるか

## 再開時の読書順

1. [`active_buff_status_implementation_tasklist.md`](active_buff_status_implementation_tasklist.md)
2. [`top_level_effect_implementation_tasklist.md`](top_level_effect_implementation_tasklist.md)
3. [`enemy_status_closure_implementation_tasklist.md`](enemy_status_closure_implementation_tasklist.md)
4. [`special_status_implementation_tasklist.md`](special_status_implementation_tasklist.md)
5. [`enemy_residual_status_implementation_tasklist.md`](enemy_residual_status_implementation_tasklist.md)
6. [`enemy_status_implementation_tasklist.md`](enemy_status_implementation_tasklist.md)
7. [`passive_implementation_tasklist.md`](passive_implementation_tasklist.md)
8. [`../20260306_tasklist/implementation_status.md`](../20260306_tasklist/implementation_status.md)
9. [`../archive/20260314_priority_history_pri010_012.md`](../archive/20260314_priority_history_pri010_012.md)

## 優先順位

| 優先 | ID | 状態 | テーマ | 主な出典 | 先にやる理由 | 完了条件 |
|------|----|------|--------|----------|--------------|----------|
| 完了 | `PRI-013` | `done` | active buff status 基盤（active skill 由来 `AttackUp` / `DefenseUp` / `CriticalRateUp` / `CriticalDamageUp`） | [`active_buff_status_implementation_tasklist.md`](active_buff_status_implementation_tasklist.md), [`top_level_effect_implementation_tasklist.md`](top_level_effect_implementation_tasklist.md), [`passive_implementation_tasklist.md`](passive_implementation_tasklist.md) | `NormalBuff_Up` / `ProtectBuff` / `CriticalBuff_Up` / 属性 buff 系を `statusEffects` 基盤へ接続し、preview / record / UI まで可視化できた。`HealDp_Buff` も metadata-only 回帰で固定済み | active skill の buff part が `statusEffects` として保存され、`Count` / `PlayerTurnEnd` / `EnemyTurnEnd` の減衰、preview / record / UI 表示、代表実データ回帰まで完了 |
| 完了 | `PRI-014` | `done` | 条件式残件と未対応レポート生成器の同期 | [`condition_report_sync_tasklist.md`](condition_report_sync_tasklist.md), [`../20260306_tasklist/generate_skill_unimplemented_report.mjs`](../20260306_tasklist/generate_skill_unimplemented_report.mjs), [`special_status_implementation_tasklist.md`](special_status_implementation_tasklist.md), [`../20260306_tasklist/skills_unimplemented_summary.md`](../20260306_tasklist/skills_unimplemented_summary.md) | runtime と generator の差分が false positive の主因になっていた。ここを閉じると unsupported report が再び次優先判断に使える | `HasSkill()` / `RemoveDebuffCount()` / `TargetBreakDownTurn()` / `SpecialStatusCountByType(146)` が runtime で解決し、レポート再生成後の残件が `state_condition 1` / `overwrite_cond 3` / `effect 0` になる |
| 完了 | `PRI-015` | `done` | enemy-side `SpecialStatusCountByType(3/22/172)` と enemy status report 同期 | [`enemy_residual_status_implementation_tasklist.md`](enemy_residual_status_implementation_tasklist.md), [`enemy_status_implementation_tasklist.md`](enemy_status_implementation_tasklist.md), [`special_status_implementation_tasklist.md`](special_status_implementation_tasklist.md), [`condition_report_sync_tasklist.md`](condition_report_sync_tasklist.md) | 調査で `DefenseDown` / `Fragile` / `SuperDown` 条件と report false positive が残差の本体と判明した。ここを閉じると条件残件は消え、次 priority を未接続 enemy status 残件へ絞れる | `SpecialStatusCountByType(3/22/172)` が runtime で解決し、generator が runtime 実装済み enemy status を未対応として再報告しない |
| 完了 | `PRI-016` | `done` | residual enemy status クローズ（確率系 / 補助 debuff / enemy buff / passive enemy debuff） | [`enemy_status_closure_implementation_tasklist.md`](enemy_status_closure_implementation_tasklist.md), [`enemy_residual_status_implementation_tasklist.md`](enemy_residual_status_implementation_tasklist.md), [`special_status_implementation_tasklist.md`](special_status_implementation_tasklist.md) | `PRI-015` 後の残件 10 key を generic enemy status 基盤へ吸収し、`PlayerTurnEnd` passive debuff と variant 配下 status も接続した。これで unsupported report を再び全カテゴリ 0 件へ戻せた | `StunRandom` / `ConfusionRandom` / `ImprisonRandom` / `Misfortune` / `HealDown` / `Hacking` / `Cover` / enemy-target `AttackUp` / `DefenseUp` / passive `DefenseDown` が runtime / report / tests まで同期される |
| P0 | `PRI-017` | `todo` | player-side enemy inflicted status manual hook（`T14` / scenario bridge） | [`special_status_implementation_tasklist.md`](special_status_implementation_tasklist.md), [`enemy_status_closure_implementation_tasklist.md`](enemy_status_closure_implementation_tasklist.md), [`passive_implementation_tasklist.md`](passive_implementation_tasklist.md) | unsupported report は 0 件化したため、明示的な残 gap は `SpecialStatusCountByType(79)` を扱う player-side 手動拘束 hook に収束した。enemy AI 未実装でも scenario / manual setup の価値が高い | player-side `ImprisonRandom` / `SpecialStatusCountByType(79)` を手動 state で注入でき、CountBC / preview / record / scenario が同じ表現で扱える |

## PRI-013 タスクリスト

詳細は [`active_buff_status_implementation_tasklist.md`](active_buff_status_implementation_tasklist.md) を参照。

- [x] active skill 由来の timed buff を `statusEffects` に正規化する
- [x] `AttackUp` / `DefenseUp` / `CriticalRateUp` / `CriticalDamageUp` の `Count` / `PlayerTurnEnd` / `EnemyTurnEnd` を扱う
- [x] 属性付き buff と無属性 buff を同じ基盤で扱う
- [x] preview / record / state snapshot から現在有効な buff を追えるようにする
- [x] `NormalBuff_Up` / `ProtectBuff` / `CriticalBuff_Up` / 属性 buff 系の代表実データ回帰を追加する

## PRI-014 タスクリスト

詳細は [`condition_report_sync_tasklist.md`](condition_report_sync_tasklist.md) を参照。

- [x] runtime / generator の clause 判定を共有化する
- [x] `HasSkill()` / `RemoveDebuffCount()` / `TargetBreakDownTurn()` を evaluator へ追加する
- [x] `SpecialStatusCountByType(146)` と関連 `overwrite_cond` を解決する
- [x] `generate_skill_unimplemented_report.mjs` を現行 evaluator と同期し、CSV / summary を再生成する

## PRI-015 タスクリスト

詳細は [`enemy_residual_status_implementation_tasklist.md`](enemy_residual_status_implementation_tasklist.md) を参照。

- [x] enemy-side `SpecialStatusCountByType(3/22/172)` を `DefenseDown` / `Fragile` / `SuperDown` に接続する
- [x] generator を runtime 実装済み enemy status 判定へ同期する
- [x] `にゃんこ大魔法` / `御稲荷神話` / `シンメトリー・リベレーション` の回帰を追加する

## PRI-016 タスクリスト

- [x] `StunRandom` / `ConfusionRandom` / `ImprisonRandom` の deterministic simulator rule を決める
- [x] `Misfortune` / `HealDown` / `Hacking` / `Cover` の保持スキーマと record 表現を決める
- [x] enemy-target `AttackUp` / `DefenseUp` と passive `DefenseDown` を action / passive timing へ接続する
- [x] [`special_status_implementation_tasklist.md`](special_status_implementation_tasklist.md) の `T14`（拘束状態手動フック）を PRI-017 へ分離する判断を確定する

## PRI-017 タスクリスト

- [ ] player-side `SpecialStatusCountByType(79)` / `ImprisonRandom` の手動付与スキーマを決める
- [ ] scenario / setup / record で player-side enemy inflicted status を保持できるようにする
- [ ] CountBC(プレイヤー側) と preview 表示を同じ manual state から評価できるようにする

## 今回のスコープ外

- 実ダメージ計算、敵AI、勝敗判定、戦闘終了フロー
- `Random()` / `ConquestBikeLevel()` の UI override
- Mark / Territory の追加見える化改善だけを目的にした単独タスク

## メモ

- `docs/20260306_tasklist/` はスナップショット起点なので、件数はそのまま真値として使わない
- `PRI-012` の完了により、「top-level `effect` 実装」は独立テーマではなくなった
- 各 PRI 完了時は、この文書と [`../README.md`](../README.md) を同じコミットで更新する
