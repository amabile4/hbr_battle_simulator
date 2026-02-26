# Migration Increment Runbook

## 目的

`seraphdb` 側データ更新後に、過去と同じ分析ロジックで再計算し、`skillDatabase` 移行指標の増分を毎回同じ手順で確認する。

## 前提

- `skillDatabase.json` は `seraphdb/data/skillDatabase.json` へのシンボリックリンク。
- `json/*.json`（主要 raw データ）は `seraphdb/data/json/*.json` へのシンボリックリンク。
- ルートで実行する。

## 手順（最短）

1. 分析実行
`npm run analyze:migration`

2. 増分比較（基準: `HEAD:json/migration_metrics.json`）
`npm run analyze:migration:delta`

3. まとめて実行
`npm run analyze:migration:all`

## 生成物

- `json/migration_artifacts.json`
- `json/new_skill_database.draft.json`
- `json/migration_metrics.json`
- `json/migration_increment_report.json`

## 判定観点

- 増分の主要指標
  - `legacyRowCount`
  - `candidateDistinctNameRowCount`
  - `exactMatch`
  - `nameMatchOnly`
  - `unmatchedLegacyRows`
  - `candidateRowsNotInLegacy`
  - `typeMismatch`
- 判定クラス
  - `replacementClassification.replaceable`
  - `replacementClassification.needAdditionalImplementation`
  - `replacementClassification.nonReplaceable`

## 補足

- 比較スクリプトは `HEAD` を基準にするため、通常は「データ更新後、コミット前」に実行すると差分確認が明確。
- さらに比較を残したい場合は `json/migration_increment_report.json` をコミット対象に含める。
