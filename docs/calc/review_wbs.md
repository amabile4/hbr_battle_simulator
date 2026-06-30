# レビュー指摘修正 WBS (Work Breakdown Structure)

本ドキュメントは、ダメージ計算エンジンのレビュー結果（`docs/phase1_phase2_review_results.md`）に基づく修正作業のタスクリストおよび進行状況管理表です。

---

## 📋 修正タスク一覧

### 🔴 優先度: High (即時修正)
- `[x]` **T1: `ElementResistDown` ルーティング漏れの修正**
  - `[x]` `calculate_damage` で `ElementResistDown` デバフを `debuffs_resolved` に追加するよう修正
  - `[x]` `test_phase2.py` に `ElementResistDown` の集約テストケースを追加
- `[x]` **T2: `tokenCount` と `tokenRatio` のスキーマ統一と換算実装**
  - `[x]` `calculate_damage` 内で `tokenRatio` と `tokenCount` 両方を許容するよう修正（`tokenCount` の場合は1個あたり+10%の攻撃力上昇に換算、`tokenRatio` を優先）
  - `[x]` 仕様書 `docs/phase2_design_specification.md` の表記を統一・明記
- `[x]` **T3: 未処理 `statusType` の実装と警告表示**
  - `[x]` `Charge`, `MindEye`, `Funnel`, `ElementAttackUp` などの動的解決を `resolve_effect_power` に追加
  - `[x]` 未対応の `statusType` が渡された場合にサイレントドロップせず、無視された警告リスト `ignoredEffects` を `breakdown` に追加して返す
- `[x]` **T4: 回帰テストの拡張（脆弱、属性防御、心眼、パッシブ等）**
  - `[x]` スプレッドシート依存しない固定 fixture ケースのテストスイート `run_fixed_fixtures_tests.py` / `test_cases_fixed.json` を新規作成
  - `[x]` 脆弱 (`Fragile`), 属性デバフ (`ElementResistDown`), 心眼 (`MindEye`) などの効果経路を検証するテストを追加
- `[x]` **T5: `_find_skill()` の `skill_type` 判定を許可リスト方式へ変更**
  - `[x]` 攻撃 part 判定の部分一致を廃止し、許可リスト（`AttackNormal`, `AttackSkill` 等）による厳密一致に変更
- `[x]` **T6: `critMindeyeMultiplier` の命名・実装不整合の解消**
  - `[x]` `MindEye` 効果を `resolve_effect_power` で解決し、クリティカル心眼枠として `crit_scale` に加算（弱点時のみ有効）
  - `[x]` 仕様書 `docs/phase2_design_specification.md` への記述の追記

### 🟡 優先度: Medium (設計改善・フォールバック修正)
- `[x]` **T7: `classify_debuff()` の名前順序依存の改善**
  - `[x]` `statusEffects` に `category` が直接指定された場合は最優先で分類に使用する仕様を実装
  - `[x]` 文字列判定の優先順位を整理し、順序依存（`永続` かつ `属性` の複合条件など）を検出するテストを `test_phase2.py` に追加
- `[x]` **T8: `as48` を `DamageInputContext` 仕様に追加**
  - `[x]` 仕様書 `docs/phase2_design_specification.md` の入力スキーマに `as48` を追加し、コメントで役割を明記
- `[x]` **T9: `get_enemy_border()` のフォールバック値および `0` の扱い見直し**
  - `[x]` fallback 値 `770` の説明コメントを修正（マスタ欠損または敵未指定、ホッパー系エネミー等の `param_border == 0` 時のフォールバック値であることを明記）
- `[x]` **T10: `get_interpolated_stats()` が近似モデルである旨を明記**
  - `[x]` 近似（フォールバック用）であることをコードコメントおよび仕様書に明記
- `[x]` **T11: `activeZone` の enum / union 化と正規化**
  - `[x]` `activeZone` の大文字小文字や揺らぎを正規化して判定するロジックを実装し、仕様書に enum 型として明記

### 🟢 優先度: Low (コードクリーンアップ)
- `[x]` **T12: 未使用変数・コメントのクリーンアップ**
  - `[x]` `calculate_damage` 内の未使用ローカル変数 `power_range` などのクリーンアップ

---

## 📈 進捗状況

| タスクID | 分類 | 内容 | 状況 |
| :--- | :--- | :--- | :--- |
| T1 | Bug | `ElementResistDown` ルーティング漏れ | 完了 |
| T2 | Schema | `tokenCount` と `tokenRatio` の統一 | 完了 |
| T3 | Feature | 未処理 `statusType` の解決と警告 | 完了 |
| T4 | Test | テストケース拡張と固定 fixture 化 | 完了 |
| T5 | Risk | `_find_skill` 判定を許可リスト化 | 完了 |
| T6 | Spec | `critMindeyeMultiplier` 心眼合算 | 完了 |
| T7 | Risk | `classify_debuff` 分類正規化 | 完了 |
| T8 | Schema | `as48` スキーマ追加 | 完了 |
| T9 | Fallback| `get_enemy_border` 境界値見直し | 完了 |
| T10 | Fallback| `get_interpolated_stats` 近似明記 | 完了 |
| T11 | Spec | `activeZone` enum化 | 完了 |
| T12 | Clean | 未使用変数削除 | 完了 |

---

## 🔄 再修正フォローアップ (2026-06-02)

`docs/review_followup_unresolved.md` で指摘された未解決の5項目について、再修正を行いました。

- **[x] 1. `calculate_damage()` 内の攻撃 part 選択厳密化**
  - `calculate_damage()` 内の part 走査も `ALLOWED_ATTACK_TYPES` 許可リスト厳密一致へ統一。非攻撃スキル指定時は基礎ダメージ `0.0` クランプ。
  - テストコード `test_non_attack_skills_clamp_to_zero` を追加。
- **[x] 2. 固定 fixture テストの非ゼロ最終ダメージ検証**
  - `test_cases_fixed.json` 内の全テストケースに `stats` (1000) および `paramBorder` (950) を設定し、基礎ダメージが非ゼロで計算されるように変更。
  - バフ、デバフ、脆弱、心眼、トークン、連撃の期待値を手計算し、最終ダメージに反映されることを検証。
- **[x] 3. `activeZone` の明示マップ・未知値警告**
  - `ZONE_ELEMENT_MAP` に基づく明示マッピングを導入。部分一致による誤判定（`Fireworks` 等）を排除。
  - 未知ゾーン指定時は `ignoredEffects` に警告を追加。
  - テストコード `test_active_zone_mapping_and_warning` を追加。
- **[x] 4. `damage_calculation_model.md` への Vulnerability / MindEye 反映**
  - 通常およびクリティカルの数式に `Vulnerability` (脆弱) 独立因子、およびクリティカル式に `MindEye` (心眼) の加算を追記。
  - 防御デバフと脆弱が別枠であることを明記。
- **[x] 5. `paramBorder=0` と未指定 (None) の区別**
  - `param_border is None` の判定に修正し、`0` を有効な境界値として処理。
  - テストコード `test_param_border_zero_distinction` を追加。
