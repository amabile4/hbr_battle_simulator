# 2026-03-06 調査タスクリスト

## 出力ファイル

- `skills_unimplemented_occurrences.csv`
  - `skills.json` 起点で抽出した未対応項目の全出現行
- `skills_unimplemented_catalog.csv`
  - 上記を `category + item_key` で集約した未対応一覧表（レビュー用）
- `unsupported_matrix.csv`
  - `skills_unimplemented_catalog.csv` と同内容の未対応一覧表（提出用ファイル名）
- `skills_unimplemented_summary.md`
  - 抽出ルールと件数サマリ
- `implementation_status.md`
  - 実装済み機能 / 未実装機能の全体整理（skills.json 非依存の未実装含む）
- `generate_skill_unimplemented_report.mjs`
  - CSV / summary 生成スクリプト

## この調査での「未対応」定義

- `state_condition_unimplemented`
  - `cond / iuc_cond / part.cond / hit_condition / target_condition` のうち、
    `src/turn/turn-controller.js` の条件パーサで未対応の条件句
- `enemy_status_unimplemented`
  - 敵対象の状態異常付与候補パーツ（`skills.json`）のうち、
    `turn-controller` に適用処理が存在しないもの
- `overwrite_cond_unresolved`
  - `overwrite_cond` が記述されているが、現行実装で参照されない条件
- `effect_unresolved`
  - top-level `effect` のうち、metadata-only と判定した label を除いた「追加 runtime 接続が必要な可能性がある」特殊効果ラベル

## 再生成方法

```bash
node docs/20260306_tasklist/generate_skill_unimplemented_report.mjs
```
