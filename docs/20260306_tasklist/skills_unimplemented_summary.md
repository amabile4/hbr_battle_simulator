# Skills 未対応項目調査 (2026-03-06)

- 対象データ: `json/skills.json`
- 判定基準: `src/turn/turn-controller.js` / `src/data/hbr-data-store.js` の実装に基づく
- 生成物:
  - `skills_unimplemented_occurrences.csv` (全出現行)
  - `skills_unimplemented_catalog.csv` (キー単位の集約)

## 集計

| category | unique_keys | occurrences |
|---|---:|---:|
| state_condition_unimplemented | 0 | 0 |
| enemy_status_unimplemented | 0 | 0 |
| overwrite_cond_unresolved | 0 | 0 |
| effect_unresolved | 0 | 0 |

## 条件式パーサーで実装済みの主な条件

- `PlayedSkillCount(...)` 比較
- `BreakHitCount()` 比較
- `SpecialStatusCountByType(...)` 比較（tracked special status のみ）
- `OverDriveGauge()` / `Sp()` / `Ep()` / `DpRate()` 比較
- `IsOverDrive()` / `IsReinforcedMode()` / `IsCharging()` / `IsFront()` / `HasSkill()` / `TargetBreakDownTurn()` / `RemoveDebuffCount()`
- `IsNatureElement(...)` / `IsCharacter(...)` / `IsTeam(...)` / `IsWeakElement(...)` / `IsZone(...)` / `IsTerritory(...)`
- `CountBC(...)` は runtime evaluator と同じ nested clause だけ対応

## 補足

- `overwrite_cond` は、expression 全体ではなく未対応 clause のみを集計する。
- top-level `effect` は、metadata-only / active-buff吸収済み label (16種) を除外し、追加 runtime 接続が必要な label のみ `effect_unresolved` に残す。
- 敵状態異常は runtime helper で supported / unsupported を判定し、未接続の part のみ `enemy_status_unimplemented` に残す。
