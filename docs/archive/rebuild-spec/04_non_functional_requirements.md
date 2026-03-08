# 04 Non Functional Requirements

## 事実に基づく現状
- 実行環境は静的HTML+JSで、開発時は `python3 -m http.server 8080` を想定。
  - 根拠: `package.json:11`
- テスト基盤は Vitest/jsdom を採用。
  - 根拠: `package.json:7`, `package.json:13`

## 非機能要件（再開発）

### NFR-01 保守性
- `Must` UI層とドメイン層を分離し、状態変更をドメイン層API経由に限定する。
  - 根拠: `js/control-manager.js`, `js/results-manager.js`
- `Should` グローバル可変状態を段階的に削減し、状態オブジェクトを明示引数化する。
  - 根拠: `js/globals.js`

### NFR-02 信頼性
- `Must` SP計算は再実行で同一結果を返す決定的処理にする。
  - 根拠: `savedSPState` を使う現行プレビュー処理 `js/control-manager.js:27`
- `Must` スキルDB構造破損をCIで検知できること。
  - 根拠: `tests/skill-database.test.js`

### NFR-03 テスト可能性
- `Must` ターン遷移/SP計算/交代制約/CSV生成を単体テストで検証可能にする。
  - 根拠: 現行 `tests/control-manager.test.js` はSP中心
- `Should` 仕様重要シナリオ（OD/追加ターン）をスナップショット化する。
  - 根拠: `README.md:163`

### NFR-04 性能
- `Should` 1ターン再計算は6人固定構成で体感遅延なし（UI操作で100ms未満目標）。
  - 根拠: 6人固定要件 `README.md:30`
- `Could` テーブル再描画を差分更新化して不要再描画を減らす。
  - 根拠: 現行は毎回 `tbody.innerHTML=''` で全再描画 `js/results-manager.js:28`

### NFR-05 可観測性
- `Should` デバッグ情報は開発モードのみ表示し、本番表示から分離する。
  - 根拠: `hbr_gui_simulator_modular.html:81`, `js/results-manager.js:50`
