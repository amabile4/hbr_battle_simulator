# フェーズ3 実装 WBS (Work Breakdown Structure)

本ドキュメントは、Python版コアロジックの整理、`hbr_battle_simulator` への移行、および TypeScript 移植・検証（フェーズ3）に関する進行状況管理表です。

---

## 📋 移植タスク一覧

### 🔴 1. ワークスペースの整理とコアロジックの移行
- `[x]` **T3.1.1: コアロジックの分離とシミュレータへの配置**
  - コアロジック（`damage_calc_engine.py` 等）を `hbr_battle_simulator/calc/` へ移動。
  - 仕様ドキュメントを `hbr_battle_simulator/docs/calc/` へ移動。
  - Excel ファイルおよび分析・突合スクリプトは `hbr_calc` 側に残し、シミュレータへは持ち込まない。
- `[x]` **T3.1.2: シミュレータ側データディレクトリ（json/）の確認**
  - シミュレータ側の `hbr_battle_simulator/json/` フォルダのデータ構造を確認し、`seraphdb_json` の代替として利用可能であることを確認。

### 🟡 2. 計算エンジンの TypeScript 移植実装
- `[x]` **T3.2.1: JSON マスタ（json/）読み込み機構の実装**
  - `hbr_battle_simulator/json/` のファイルをロードし、シミュレータ実行時の注入インターフェースと一致させる。
- `[x]` **T3.2.2: スキル/Part 解決器と解決アルゴリズムの移植**
  - `_flatten_parts`, `_find_skill`, `_find_effect_part` の移植。
  - `SkillCondition`, `SkillRandom`, `SkillSwitch` のネストした part 構造のフラット化。
  - **Part selection algorithm の仕様化**: 攻撃 part 識別（`skill_type` 許可リスト）、`diff_for_max`（`e59`）や `power`（`l59`/`m59`）等のマスタ引き当て、通常攻撃（name == 通常攻撃）・追撃（name == 追撃）の判定仕様と具体 skillId の確定、および解決失敗時フォールバックの実装。
  - **解決失敗時のフォールバック仕様**: 初期移植では攻撃 part 未発見時に `candidates[0]` 使用＆ `base_damage = 0` クランプとする Python 互換を維持。発生時は `ignoredEffects` に `{statusType: "no_attack_part", skillName: ..., side: "context"}` を記録して警告。
- `[x]` **T3.2.3: バフ・デバフ・脆弱・心眼・連撃の動的解決と集約ロジック移植**
  - シミュレータのドメイン定義（`interfaces.js`, `damage-calculation-context.js`）と用語を完全統一して移植。
  - パッシブデバフ `passiveDefenseDown` の加算処理（C1）の実装。
- `[x]` **T3.2.4: 通常/クリティカルダメージ期待値および breakdown 計算の移植**
  - `calculate_damage` を `calculateDamage` として移植。
  - 実ステータス必須化（C2）、`category` 必須化（C3）の適用。
 
### 🟢 3. テスト検証環境の構築と実行
- `[x]` **T3.3.1: 固定 fixture テスト (node:test) の実装**
  - `tests/damage-calculator.test.js` を作成し、`test_cases_fixed.json` を用いたテスト実行とパス確認。
  - `npm test` で新規テストを含む全 1235 件 PASS、`UV_CACHE_DIR=/tmp/uv-cache-hbr uv run python run_fixed_fixtures_tests.py` で Python 版固定 fixture 6/6 PASS を確認。
- `[x]` **T3.3.2: 大規模クロス言語テストデータ発生器の作成と検証**
  - Excel と分析スクリプトが残っている `hbr_calc` 側で、数千ケースのテストデータ `test_cases_large.json` を生成する `generate_test_cases_large.py` を実装・実行。
  - 生成された JSON を用いて、`hbr_calc` に symbolic link を貼り `node --experimental-test-coverage --test run_js_large_tests.mjs` を実行し、検証した2,000ケースすべてで Python 版と一致すること、および `damage-calculator.js` の Line Coverage が 84.22% に達していることを確認。

### 🟦 4. 実装後レビュー残課題
- `[x]` **T3.4.1: category fallback warning 方針の確定**
  - 初期移植では、`category` 未指定の既存 fixture と Python 互換を保つため、`DefenseDown` / `ElementResistDown` / `Fragile` の名称ベース推定 fallback を維持する。
  - 大規模アサーション検証の結果、本フォールバックによる計算値の不一致は生じず、非ブロッカー（計算結果に影響を与えない）であることを確認。
  - strict contract（名称ベースフォールバックの完全排除）への移行については、計算結果に影響しないため Phase3 完了条件からは除外し、Phase4（画面連携）の進捗にあわせたフォローアップタスクとして継続検討する。

---

## 📈 進捗状況

| タスクID | 分類 | 内容 | 状況 |
| :--- | :--- | :--- | :--- |
| T3.1.1 | Move | コアロジック・ドキュメントのシミュレータ移動 | 完了 |
| T3.1.2 | Data | シミュレータ側 `json/` マスタ確認 | 完了 |
| T3.2.1 | Data | `json/` データ読み込み/インジェクション実装 | 完了 |
| T3.2.2 | Engine | スキル/Part 解決器の移植 | 完了 |
| T3.2.3 | Engine | バフ・デバフ効果量解決と重複上限ロジック移植 | 完了 |
| T3.2.4 | Engine | ダメージ期待値/Breakdown 移植 | 完了 |
| T3.3.1 | Test | 固定 fixture テスト（node:test） | 完了 |
| T3.3.2 | Test | 大規模クロス言語アサーションテスト | 完了 |
| T3.4.1 | Follow-up | category fallback warning 方針の確定 | 完了 (非ブロッカー/Phase4へ移行) |
