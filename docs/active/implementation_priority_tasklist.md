# Implementation Priority Task List

> **ステータス**: 🟢 進行中 | 📅 最終更新: 2026-03-14
>
> **前回完了分**: [`../archive/20260314_priority_history_pri010_012.md`](../archive/20260314_priority_history_pri010_012.md) に `PRI-010`〜`PRI-012` を退避済み
>
> **判断メモ**: `PRI-013` を完了し、top-level `effect` の runtime 残件は active buff status 基盤で吸収できた。次の真の残件は、おおむね条件式 `6 clause`、`overwrite_cond` `4 clause`、敵状態異常 `9 type`

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
| P0 | `PRI-014` | `todo` | 条件式残件と未対応レポート生成器の同期 | [`../20260306_tasklist/generate_skill_unimplemented_report.mjs`](../20260306_tasklist/generate_skill_unimplemented_report.mjs), [`special_status_implementation_tasklist.md`](special_status_implementation_tasklist.md), [`../20260306_tasklist/skills_unimplemented_summary.md`](../20260306_tasklist/skills_unimplemented_summary.md) | 現行 survey で真の条件式 gap は `6 clause` まで減っている。`HasSkill()` / `RemoveDebuffCount()` / `TargetBreakDownTurn()` / `0.0 < DpRate()` 正規化 / `SpecialStatusCountByType(146)` を片付けると、unsupported report が再び優先順位判断に使える | 残件 clause を parser か simulator ルールで整理し、generator が現行 evaluator と同じ判定を返す。`skills_unimplemented_summary.md` / `unsupported_matrix.csv` を再生成して docs に同期する |
| P1 | `PRI-015` | `todo` | 残り敵状態異常と関連 `overwrite_cond` / `CountBC` の整理 | [`enemy_status_implementation_tasklist.md`](enemy_status_implementation_tasklist.md), [`special_status_implementation_tasklist.md`](special_status_implementation_tasklist.md), [`../20260306_tasklist/implementation_status.md`](../20260306_tasklist/implementation_status.md) | 残件は `StunRandom` / `Misfortune` / `ConfusionRandom` / `ImprisonRandom` / `HealDown` / `Cover` / `Talisman` / `SuperBreakDown` など少数精鋭へ圧縮済み。ここを決めると enemy-side special status `3 / 22 / 172` 系の `overwrite_cond` と `CountBC` も同時に閉じられる | simulator ルールが定義され、必要な enemy status が `turnState.enemyState.statuses` で保持される。関連 `overwrite_cond` / `CountBC` が回帰テスト付きで解決する |

## PRI-013 タスクリスト

詳細は [`active_buff_status_implementation_tasklist.md`](active_buff_status_implementation_tasklist.md) を参照。

- [x] active skill 由来の timed buff を `statusEffects` に正規化する
- [x] `AttackUp` / `DefenseUp` / `CriticalRateUp` / `CriticalDamageUp` の `Count` / `PlayerTurnEnd` / `EnemyTurnEnd` を扱う
- [x] 属性付き buff と無属性 buff を同じ基盤で扱う
- [x] preview / record / state snapshot から現在有効な buff を追えるようにする
- [x] `NormalBuff_Up` / `ProtectBuff` / `CriticalBuff_Up` / 属性 buff 系の代表実データ回帰を追加する

## PRI-014 タスクリスト

- [ ] `0.0 < DpRate()` のような逆順比較を evaluator / report 両方で同じく扱う
- [ ] `HasSkill()` と `RemoveDebuffCount()` を simulator ルール込みで整理する
- [ ] `SpecialStatusCountByType(146)` など player-side special status の残件を整理する
- [ ] `TargetBreakDownTurn()` を skill 文脈で解決できる形にする
- [ ] `generate_skill_unimplemented_report.mjs` を現行 evaluator と同期し、CSV / summary を再生成する

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
