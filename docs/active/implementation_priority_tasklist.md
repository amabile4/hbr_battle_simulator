# Implementation Priority Task List

> **ステータス**: 🟢 進行中 | 📅 最終更新: 2026-03-14
>
> **前回完了分**: [`../archive/20260314_priority_history_pri010_012.md`](../archive/20260314_priority_history_pri010_012.md) に `PRI-010`〜`PRI-012` を退避済み
>
> **判断メモ**: `PRI-014` を完了し、条件 evaluator / generator の差分と `HasSkill()` / `RemoveDebuffCount()` / `TargetBreakDownTurn()` / `SpecialStatusCountByType(146)` を解消した。現行 survey の真の残件は `state_condition` `1 clause`、`overwrite_cond` `3 clause`、敵状態異常 `16 keys`

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
3. [`special_status_implementation_tasklist.md`](special_status_implementation_tasklist.md)
4. [`enemy_status_implementation_tasklist.md`](enemy_status_implementation_tasklist.md)
5. [`passive_implementation_tasklist.md`](passive_implementation_tasklist.md)
6. [`../20260306_tasklist/implementation_status.md`](../20260306_tasklist/implementation_status.md)
7. [`../archive/20260314_priority_history_pri010_012.md`](../archive/20260314_priority_history_pri010_012.md)

## 優先順位

| 優先 | ID | 状態 | テーマ | 主な出典 | 先にやる理由 | 完了条件 |
|------|----|------|--------|----------|--------------|----------|
| 完了 | `PRI-013` | `done` | active buff status 基盤（active skill 由来 `AttackUp` / `DefenseUp` / `CriticalRateUp` / `CriticalDamageUp`） | [`active_buff_status_implementation_tasklist.md`](active_buff_status_implementation_tasklist.md), [`top_level_effect_implementation_tasklist.md`](top_level_effect_implementation_tasklist.md), [`passive_implementation_tasklist.md`](passive_implementation_tasklist.md) | `NormalBuff_Up` / `ProtectBuff` / `CriticalBuff_Up` / 属性 buff 系を `statusEffects` 基盤へ接続し、preview / record / UI まで可視化できた。`HealDp_Buff` も metadata-only 回帰で固定済み | active skill の buff part が `statusEffects` として保存され、`Count` / `PlayerTurnEnd` / `EnemyTurnEnd` の減衰、preview / record / UI 表示、代表実データ回帰まで完了 |
| 完了 | `PRI-014` | `done` | 条件式残件と未対応レポート生成器の同期 | [`condition_report_sync_tasklist.md`](condition_report_sync_tasklist.md), [`../20260306_tasklist/generate_skill_unimplemented_report.mjs`](../20260306_tasklist/generate_skill_unimplemented_report.mjs), [`special_status_implementation_tasklist.md`](special_status_implementation_tasklist.md), [`../20260306_tasklist/skills_unimplemented_summary.md`](../20260306_tasklist/skills_unimplemented_summary.md) | runtime と generator の差分が false positive の主因になっていた。ここを閉じると unsupported report が再び次優先判断に使える | `HasSkill()` / `RemoveDebuffCount()` / `TargetBreakDownTurn()` / `SpecialStatusCountByType(146)` が runtime で解決し、レポート再生成後の残件が `state_condition 1` / `overwrite_cond 3` / `effect 0` になる |
| P0 | `PRI-015` | `todo` | 残り敵状態異常と関連 `overwrite_cond` / `CountBC` の整理 | [`enemy_status_implementation_tasklist.md`](enemy_status_implementation_tasklist.md), [`special_status_implementation_tasklist.md`](special_status_implementation_tasklist.md), [`../20260306_tasklist/implementation_status.md`](../20260306_tasklist/implementation_status.md), [`condition_report_sync_tasklist.md`](condition_report_sync_tasklist.md) | `PRI-014` 後の真の残件は enemy-side `SpecialStatusCountByType(172/22/3)` と、それに紐づく `overwrite_cond` / `CountBC` まで圧縮できた。ここを閉じると条件式残件がほぼ消える | simulator ルールが定義され、必要な enemy status が `turnState.enemyState.statuses` で保持される。関連 `overwrite_cond` / `CountBC` が回帰テスト付きで解決する |

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

- [ ] 確率系 enemy status（`StunRandom` / `ConfusionRandom` / `ImprisonRandom`）の simulator ルールを決める
- [ ] `Misfortune` / `HealDown` / `Cover` / `Talisman` / `SuperBreakDown` の保持スキーマを決める
- [ ] enemy-side `SpecialStatusCountByType(3/22/172)` と関連 `overwrite_cond` を接続する
- [ ] [`special_status_implementation_tasklist.md`](special_status_implementation_tasklist.md) の `T14`（拘束状態手動フック）をここに吸収するか判断する

## 今回のスコープ外

- 実ダメージ計算、敵AI、勝敗判定、戦闘終了フロー
- `Random()` / `ConquestBikeLevel()` の UI override
- Mark / Territory の追加見える化改善だけを目的にした単独タスク

## メモ

- `docs/20260306_tasklist/` はスナップショット起点なので、件数はそのまま真値として使わない
- `PRI-012` の完了により、「top-level `effect` 実装」は独立テーマではなくなった
- 各 PRI 完了時は、この文書と [`../README.md`](../README.md) を同じコミットで更新する
