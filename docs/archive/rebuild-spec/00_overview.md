# 00 Overview

## 目的
半年前の実装途中プロジェクトを、既存コードと既存文書から「現在実装済み仕様」を抽出し、ゼロから再開発するための仕様セットに再構成する。

## 対象と制約
- 対象: `index.html` から起動されるブラウザ版シミュレータ実装一式
- 対象外: 将来構想のみで実装根拠がない機能の断定
- 本書の方針: 事実（実装/文書根拠あり）と推測（再開発設計案）を分離

## 調査根拠（主要）
- 実装: `js/*.js`, `hbr_gui_simulator_modular.html`, `skillDatabase.json`
- 要求文書: `README.md`, `MODULAR_ARCHITECTURE.md`
- 品質根拠: `tests/*.test.js`, `package.json`
- マルチエージェント補助メモ: `docs/rebuild-spec/childA_codex_notes.md`, `docs/rebuild-spec/childB_gemini_notes.md`, `docs/rebuild-spec/childC_claude_notes.md`

## 現状判定（要約）
- 実装済み中心: 6人編成UI、前衛3人のスキル選択、SP消費確定、ターン進行、結果テーブル表示。
- 未実装/未確定中心: OD/追加ターン状態遷移、CSV出力、バフ/デバフ履歴、SP変動理由の構造化。
- 再開発可否（v1判定）: 「中核ループは再現可能、ただし仕様不足が残るため完全再開発仕様としては追加確定が必要」。

## 文書マップ
- 実装済み仕様: `01_as_is_implemented_spec.md`
- ギャップ: `02_gap_and_missing_requirements.md`
- 再開発要件v1: `03_rebuild_requirements_v1.md`
- 非機能: `04_non_functional_requirements.md`
- データ/IF: `05_data_model_and_interfaces.md`
- リスク/移行: `06_risks_and_migration_strategy.md`
- 未確定事項: `07_open_questions_for_user.md`
- オーケストレーション記録: `08_orchestration_report.md`
