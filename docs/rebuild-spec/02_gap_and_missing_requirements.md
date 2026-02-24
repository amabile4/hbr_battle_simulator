# 02 Gap And Missing Requirements

## 事実ベースのギャップ（README要求 vs 実装）

### G-01 特殊ターン（OD/追加ターン）
- 要求: `Must` OD1-3・追加ターンの状態/表記/SP効果を扱う。
  - 根拠: `README.md:163`, `README.md:176`, `README.md:270`
- 実装: `currentTurn` の整数インクリメントのみで、OD状態や追加ターン状態を保持していない。
  - 根拠: `js/control-manager.js:102`, `js/control-manager.js:103`
- ギャップ評価: `Must` 不足

### G-02 CSV出力
- 要求: `Must` Google Spreadsheet互換CSV（3行ヘッダ含む）出力。
  - 根拠: `README.md:22`, `README.md:240`, `README.md:301`
- 実装: DOMテーブル描画のみ。CSV生成/ダウンロード処理なし。
  - 根拠: `js/results-manager.js:24`
- ギャップ評価: `Must` 不足

### G-03 SP変動要因の詳細記録
- 要求: `Should` 回復要因・消費要因・内訳記録。
  - 根拠: `README.md:152`, `README.md:156`
- 実装: `startSP/endSP/action` のみで理由情報なし。
  - 根拠: `js/control-manager.js:61`, `js/results-manager.js:37`
- ギャップ評価: `Should` 不足

### G-04 バフ/デバフ管理
- 要求: `Should` バフ状態管理/継続ターン/記録。
  - 根拠: `README.md:205`, `README.md:286`
- 実装: バフ/デバフ用状態モデルなし。
  - 根拠: `js/globals.js`, `js/control-manager.js`, `js/results-manager.js`
- ギャップ評価: `Should` 不足

### G-05 追加ターン時の交代制限
- 要求: `Must` 追加ターン対象者のみ交代可など制約。
  - 根拠: `README.md:190`, `README.md:194`
- 実装: 入れ替え対象はUI上ほぼ汎用（選択2点交換）で、追加ターン制限判定なし。
  - 根拠: `js/event-handlers.js:56`, `js/event-handlers.js:63`
- ギャップ評価: `Must` 不足

## 推測ベースの不足仕様
- `Must` 状態遷移仕様（通常/OD/追加）を明文化しないと再開発時に分岐再現不可。
  - 根拠: G-01
- `Must` 出力契約（CSV列定義、特殊ラベル、エンコーディング）を固定しないと検証不能。
  - 根拠: G-02
- `Should` SPイベントを「理由付き差分」で記録しないと将来分析/デバッグが困難。
  - 根拠: G-03
