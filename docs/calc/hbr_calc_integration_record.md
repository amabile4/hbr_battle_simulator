# hbr_calc 統合記録（calc-core 正本一本化）

| 項目 | 値 |
|------|----|
| ステータス | 🟢 進行中 |
| 開始日 | 2026-06-14 |
| 方針 | curated copy / Python静的リファレンス / JS検証はnode:test＋大規模別script / hbr_calcアーカイブ |
| ブランチ | feature/integrate-hbr-calc |

## 目的
hbr_calc（旧 calc-core 正本）を hbr_battle_simulator へ取り込み、「PR→同期（デプロイ）」運用を廃止。calc-core の正本を simulator に一本化する。

---

## Phase A: calc-core 正本確定（reconciliation）✅ 判定: GO・正本= simulator

### JS calc-core 6ファイルの対応
- **完全一致(2)**: `src/contracts/damage-calculation.js`, `src/data/damage-calculation-data.js`。
- **乖離(3)**: `src/domain/{damage-calculator,calculator-helpers,destruction-calculator}.js`。
- `src/index.js` は別スコープ（calc API export vs 本体 index）。同期対象外。

### 乖離の内訳（simulator が正本として妥当）
- **calculator-helpers.js**: simulator のみ `collectSearchableSkills`（SkillSwitch 変種検索）。`findSkill` が `searchableSkills` 経由になるだけでロジック欠落なし。→ simulator superset。
- **destruction-calculator.js**: simulator のみ `skillInput.parts` fallback と destMult 非有限/負ガード(f9ab4cd)。attack part 解決は `skillInput.attackPart ?? findAttackPart(skill)` で hbr_calc の inline flattenSkillParts と機能等価。→ simulator superset。
- **damage-calculator.js**: 単なる import/定数 inline 差に加え、**意図的なロジック分岐**あり:
  - **Zone / MindEye の扱い**: simulator は「スキル攻撃力アップカテゴリ（加算）」へ移動（`resistanceTotal = affinityMultiplier` のみ、Zone の element 乗算を廃止、MindEye は通常/追撃除外）。hbr_calc は旧モデル（Zone を element 耐性乗算 `elementMultiplier`）。→ **simulator が新・公式仕様準拠モデル**。
  - **destructionRate**: simulator は `isHpTarget ? destructionRate : DEFAULT`。hbr_calc は `destructionRateOverride`（ナイトキルエッジの一時上書き）対応。

### hbr_calc 固有・simulator 未搭載（既知ギャップ）
- **`destructionRateOverride`（ナイトキルエッジ等の一時破壊率上書き）**: simulator 全体で参照ゼロ（src/ui-next/tests いずれも未使用）。**休眠未使用機能**であり silent loss ではない。将来ナイトキルエッジ実装時はアーカイブ hbr_calc / `reference/calc-python` から再導入可能。

### 結論
- simulator の calc-core を**唯一の正本**に確定（より進化したモデル＋ガード＋検索拡張を保持）。
- 既存 `npm test`(1435 pass) が動作回帰ガード。
- **Phase C 注意**: hbr_calc の fixtures/Python parity は **旧モデル（Zone=耐性乗算 / destructionRateOverride 等）** を前提に生成されている。simulator JS は意図的に乖離しているため、Zone/MindEye/destructionRateOverride 系の fixture は simulator JS と**不一致になりうる**。Phase C で失敗を triage（simulator 意図的進化＝期待値更新/除外 か、真のバグ＝修正 か）する。

---

## Phase B〜F
（実施に応じて追記）
