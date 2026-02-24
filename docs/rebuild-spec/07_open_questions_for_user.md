# 07 Open Questions For User

## Must（実装着手前に確定が必要）
1. OD1/OD2/OD3 のSP回復は「発動者のみ」で確定か、全体配布ケースは存在するか。
   - 根拠: `README.md:146`（発動者記述あり）
2. 追加ターンの同時付与（複数対象）時、交代可能範囲と行動順はどう優先するか。
   - 根拠: `README.md:190`, `README.md:194`
3. CSVの正式列仕様で、`敵行動`・`バフ/デバフ`・空白列(A,D列)をv1で必須にするか。
   - 根拠: `README.md:253`, `README.md:259`
4. SPパッシブ効果の重複ルール（加算順、上限突破可否、同種重複）をどう定義するか。
   - 根拠: `README.md:119`, `README.md:124`

## Should（v1中に確定推奨）
1. スキル `type` を現行の文字列（damage/non_damage/support）から列挙型へ統一するか。
   - 根拠: `skillDatabase.json`, `tests/fixtures/test-data.js:19`
2. バフ/デバフをv1で「記録のみ」にするか、「継続ターン計算」まで含めるか。
   - 根拠: `README.md:205`, `README.md:286`

## Could（将来拡張）
1. 既存の列幅デバッグ表示を開発者向けログに移し、UIから分離するか。
   - 根拠: `hbr_gui_simulator_modular.html:81`
