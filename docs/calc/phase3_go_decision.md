# フェーズ3 進行可否判定ドキュメント

**判定日**: 2026-06-02  
**判定者**: claude-calc（Claude Code）、codex-calc（Codex CLI）  
**対象**: `hbr_calc` ダメージ計算エンジン Python 版（フェーズ1・2）の TypeScript 移植（フェーズ3）進行可否

---

## 判定結果

**条件付き GO**

フェーズ1・2のレビュー指摘事項（High 7件・Medium 5件）はすべて修正・検証済みであり、フェーズ3開始を阻害する未解決の High 項目は存在しない。ただし、以下の3件をフェーズ3 WBS の最初のタスクとして着手前に確定させることを条件とする。

---

## 判定根拠

### テスト状況（判定時点）

| テストスイート | 結果 |
| :--- | :--- |
| `uv run python test_phase2.py` | **14/14 OK** |
| `uv run python run_fixed_fixtures_tests.py` | **6/6 PASS** |
| `uv run python run_regression_tests.py` | **115/115 PASS** |

### レビュー指摘の解消状況

#### High 項目（全 7 件解消）

| 項目 | 対応内容 |
| :--- | :--- |
| `ElementResistDown` ルーティング漏れ | `debuffs_resolved` へのルーティング修正・テスト追加 |
| 未処理 `statusType` サイレントドロップ | `Charge` / `MindEye` / `Funnel` / `ElementAttackUp` 実装、`ignoredEffects` 出力 |
| `tokenCount` / `tokenRatio` 不一致 | 両方許容、`tokenCount` × 0.10 換算を実装、仕様書統一 |
| 脆弱・パッシブ枠の回帰不足 | 非ゼロ期待値 fixture 6件追加（Fragile / ElementResistDown / MindEye 経路を網羅） |
| Excel スナップショット依存 | 固定 fixture へ移行（`test_cases_fixed.json`） |
| `_find_skill()` 部分一致 | 攻撃 `skill_type` 許可リスト（完全一致）方式に変更 |
| `critMindeyeMultiplier` 命名不整合 | `MindEye` を弱点時クリ枠として実装、`crit_scale` に反映 |

#### Medium 項目（全 5 件解消）

| 項目 | 対応内容 |
| :--- | :--- |
| `classify_debuff()` 名前順序依存 | `category` フィールド直接指定を最優先、複合条件の判定順を整理、テスト追加 |
| `as48` が入力仕様にない | `phase2_design_specification.md` の `DamageInputContext` に追記 |
| `get_enemy_border()` fallback | `0` / `None` 判定を分離（`param_border is None` の場合のみフォールバック） |
| `get_interpolated_stats()` 近似 | フォールバック専用と明記（コード・仕様書） |
| `activeZone` 自由文字列 | `ZONE_ELEMENT_MAP` 明示マッピング導入、未知ゾーンは `ignoredEffects` へ |

### フォールバック値 770 の根拠

`get_enemy_border()` のデフォルト値 `770` は、このゲームで最もダメージ計算が活用されるコンテンツであるスコアアタックの難易度 40・グレード 35 の敵ステータスに基づく。「全体平均値」ではなく、**最も一般的なユースケースに合わせた実用的な代表値**として設定されている。

### 追加確認事項

- **`青春色のシュプール`（体力依存 TokenAttack）**: `skills.json` 上で `parameters.con=1` の `TokenAttack` 型攻撃スキルであることを確認。Excel `ダメージ計算機` シート row 40 との突合で W/X/Y/AB 相当の値が完全一致（`baseDamageNormal: 2686.578125`、`normal.expected: 4701.51171875`）。`test_con_based_token_attack_matches_excel_snapshot` を追加済み。
- **`Fireworks` / `IceFire` 誤検出防止**: `ZONE_ELEMENT_MAP` 完全一致により偽陽性が解消されたことを `test_active_zone_mapping_and_warning` で確認済み。

---

## フェーズ3開始条件（事前定義の確定）

以下の 3 件について、入力契約（`DamageInputContext` の TypeScript 型定義）における事前定義を確定しました。

### C1: パッシブデバフ（AJ81 相当）の入力スキーマ
- **決定**: `DamageInputContext` の `defender` オブジェクトに、新プロパティ `passiveDefenseDown?: number`（デフォルト: `0.0`、倍率値）を追加します。
- **仕様**:
  - アビリティや編成効果などによる常時防御デバフの合計を格納します。
  - `passiveDefenseDown` はアクティブデバフの集約（上位2枠制限あり）とは独立した固定加算値であり、カテゴリ制限の対象外とします。
  - デバフ倍率の算出は、通常アクティブデバフ集約値にこのパッシブデバフ値を単純加算します。
    $$\text{debuffMultiplier} = 1.0 + \text{aggregateDebuffs}(\text{statusEffects}) + \text{passiveDefenseDown}$$

### C2: 実ステータス必須化の設計方針
- **決定**: `DamageInputContext` の `attacker.stats`（`str`, `dex`, `wis`, `spr`, `luk`, `con`）を**必須プロパティ（Required）**として定義します。
- **仕様**:
  - 呼び出し側（シミュレータ）からは必ず実ステータスを注入します。
  - 近似補完用の `get_interpolated_stats()` は、TypeScript 版ではメインの計算ロジックから切り離し、ユーティリティヘルパー関数としてのみライブラリに同梱します。

### C3: `DamageInputContext` の TypeScript 型正規化
- **決定**: デバフオブジェクトにおける `category` を**必須プロパティ**として定義します（`statusType` が `DefenseDown` / `ElementResistDown` / `Fragile` すべてが対象）。
- **仕様**:
  - `DefenseDown` / `ElementResistDown` の場合は `category: 'NormalDefense' | 'PermDefense' | 'ElementDefense' | 'PermElementDefense' | 'DPDefense'` が必須となります。
  - `Fragile` の場合は `category: 'NormalFragile' | 'PermFragile'` が必須となります。
  - Python 版の `classify_debuff()` や `classify_fragile()` に頼るスキル名からの文字列推定分類は TypeScript 版では廃止します。
  - シミュレータ側で必ずデバフカテゴリを正規化して渡す契約とし、データ連携の曖昧さを排除します。

---

## フェーズ3中に対処（開始ブロッカーではない）

| 項目 | 対処方針 |
| :--- | :--- |
| クリバフ上限のゲーム仕様確認 | フェーズ3 実装前にゲーム内実測またはリリースノートで確認 |
| ゾーン込み弱点判定の実測検証 | ゲーム内でゾーン有効・耐性属性時の脆弱適用を実測 |
| 特殊スキル（TokenAttack 等）の fixture 継続 | Excel 突合ケースを個別 fixture として蓄積する方針を継続 |
| `test_non_attack_skills_clamp_to_zero` に `フィルエンハンス` 追加 | 軽微。次回テスト拡充時に対応 |

---

## 参照ドキュメント

- `docs/phase1_phase2_review_results.md` — レビュー指摘一覧・優先度表（参照元: hbr_calc リポジトリ）
- `docs/review_wbs.md` — 修正タスク進捗管理（参照元: hbr_calc リポジトリ）
- `docs/review_followup_unresolved.md` — フォローアップ指摘（再修正依頼）（参照元: hbr_calc リポジトリ）
- `docs/review_followup_verification.md` — 再修正完了確認記録（参照元: hbr_calc リポジトリ）
- `docs/calc/phase2_design_specification.md` — フェーズ2仕様・`DamageInputContext` 型定義
- `docs/calc/damage_calculation_model.md` — 数式モデル（Vulnerability / MindEye / Funnel 反映済み）
