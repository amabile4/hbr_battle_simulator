# calc-python — 検証用静的リファレンス

**これは build / CI / `npm test` の対象外の静的資料です。** ダメージ・破壊率計算の移植元（Python版）と、移植時の解析スクリプト・調査結果を、JS↔Python parity の照合や将来の再実装の参照用に保持する。

hbr_calc リポジトリ（旧 calc-core 正本、現在アーカイブ）から curated copy した。**calc-core の正本は本リポジトリ `src/domain/*-calculator*.js`** であり、ここの Python/解析物は履歴・参照目的。

## 構成
- `engine/` — Python版計算エンジン（`base_engine.py` / `damage_calc_engine.py` / `destruction_calc_engine.py`）。JS版の移植元。
- `tests/` — Python版テスト（regression / fixtures 生成 / phase2 / effect resolution 等）。実行には別途 Python 環境（uv/venv）が必要だが、本リポジトリでは環境を持ち込んでいない。
- `analysis/` — 移植時の**自作**解析スクリプト（Python `.py`）と自作の調査結果（`destruction_analysis_report.json`, `feedback_draft.md`）。

## 持ち込まなかったもの / 削除したもの
**第三者の著作物（実体相当）はリポジトリに含めない**。必要時はアーカイブ済み hbr_calc リポジトリ（および原典の Excel / hbr-tool.com）を各自参照:
- **計算機 Excel（他者作）由来**: 数式・セル・マニュアル本文のダンプ（`extracted_info/` 一式、`extracted_ods_xml/`, `extracted_xml/`, `clean_formulas*`, `formulas_by_sheet.json`）。
- **hbr-tool.com（他者サイト）由来**: バンドル抽出・再現コード（`hbr_tool_harness.mjs` および同ハーネスに依存する比較スクリプト `compare_engines.mjs` / `reconcile_session.mjs` / `reconciliation_helper.mjs` / `debug_overlimit.mjs` / `test_harness.mjs`）、バンドルアプリ（`hbr_tool_main*.js`, `hbr_tool_local/`）。
- `.venv` / `pyproject.toml` / `uv.lock`（Python 実行環境）, `seraphdb_json/`（生データ）。
- ※ 上記のうち一部は統合初期に誤って取り込み後、著作物保護のため作業ツリー・git 履歴から除去済み。

## 注意
- JS版（正本）は Python版・旧 fixtures から**意図的に乖離**している箇所がある（例: Zone/MindEye をスキル攻撃力アップカテゴリへ移動、`destructionRateOverride` 未搭載）。詳細は [docs/calc/hbr_calc_integration_record.md](../../docs/calc/hbr_calc_integration_record.md) 参照。Python版の出力と JS版が一致しないケースは、この意図的差分の可能性がある。
