# Skills 未対応項目調査 (2026-03-06)

- 対象データ: `json/skills.json`
- 判定基準: `src/turn/turn-controller.js` / `src/data/hbr-data-store.js` の実装に基づく
- 生成物:
  - `skills_unimplemented_occurrences.csv` (全出現行)
  - `skills_unimplemented_catalog.csv` (キー単位の集約)

## 集計

| category | unique_keys | occurrences |
|---|---:|---:|
| state_condition_unimplemented | 47 | 108 |
| enemy_status_unimplemented | 16 | 219 |
| overwrite_cond_unresolved | 37 | 53 |
| effect_unresolved | 9 | 129 |

## 条件式パーサーで実装済みの主な条件

- `PlayedSkillCount(...)` 比較
- `BreakHitCount()` 比較
- `SpecialStatusCountByType(20)` 比較
- `OverDriveGauge()` 比較
- `Sp()` 比較
- `IsOverDrive()` / `IsReinforcedMode()` (真偽・数値比較)
- `CountBC(...)` は限定対応 (実装済み inner 式のみ)

## 補足

- `overwrite_cond` は、現行コードで参照されない条件を「未確定/未実装」扱いとして集計する。
- top-level `effect` は、metadata-only label (7種) を除外し、追加 runtime 接続が必要な label のみ `effect_unresolved` に残す。
- 敵状態異常は `skills.json` 上の候補パーツを抽出し、`turn-controller` に適用ロジックが無いものを未実装として列挙。
