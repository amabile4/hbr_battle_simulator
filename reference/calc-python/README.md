# calc-python — 検証用静的リファレンス

**これは build / CI / `npm test` の対象外の静的資料です。** ダメージ・破壊率計算の移植元（Python版）と、移植時の解析スクリプト・調査結果を、JS↔Python parity の照合や将来の再実装の参照用に保持する。

hbr_calc リポジトリ（旧 calc-core 正本、現在アーカイブ）から curated copy した。**calc-core の正本は本リポジトリ `src/domain/*-calculator*.js`** であり、ここの Python/解析物は履歴・参照目的。

## 構成
- `engine/` — Python版計算エンジン（`base_engine.py` / `damage_calc_engine.py` / `destruction_calc_engine.py`）。JS版の移植元。
- `tests/` — Python版テスト（regression / fixtures 生成 / phase2 / effect resolution 等）。実行には別途 Python 環境（uv/venv）が必要だが、本リポジトリでは環境を持ち込んでいない。
- `analysis/` — 移植時の解析スクリプト（Python `.py` / Node `.mjs`,`.js`）と調査結果レポート（`destruction_analysis_report.json`, `feedback_draft.md`, `extracted_info/*` の各レポート）。

## 持ち込まなかったもの（アーカイブ hbr_calc 参照）
容量・性質の都合で以下は取り込んでいない。必要時はアーカイブ済み hbr_calc リポジトリを参照:
- Excel/ODS の生抽出物（`extracted_ods_xml/`, `extracted_xml/`, `extracted_info/clean_formulas*`, `formulas_by_sheet.json` — 計 140MB+）
- ファンサイト計算機のバンドル JS（`hbr_tool_main*.js`, `hbr_tool_local/`）
- `.venv` / `pyproject.toml` / `uv.lock`（Python 実行環境）, `seraphdb_json/`（生データ）

## 注意
- JS版（正本）は Python版・旧 fixtures から**意図的に乖離**している箇所がある（例: Zone/MindEye をスキル攻撃力アップカテゴリへ移動、`destructionRateOverride` 未搭載）。詳細は [docs/calc/hbr_calc_integration_record.md](../../docs/calc/hbr_calc_integration_record.md) 参照。Python版の出力と JS版が一致しないケースは、この意図的差分の可能性がある。
