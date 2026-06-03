# damageContext → DamageInputContext フィールドマッピング分析

> **作成日**: 2026-06-03 | **作成者**: claude
> **目的**: T1.3 の `buildDamageCalculationInput()` 設計のための事前調査

---

## 結論（先に書く）

`damageContext` は「ターン実行後の表示用出力」であり、`DamageInputContext` は「計算エンジンへの入力」なので、**直接1対1の変換はできない**。

ただし以下の設計（**Approach C: Hybrid**）により実用的な変換が可能：

1. **スキル・キャラクター情報** → damageContext から直接取得できる
2. **攻撃者ステータス** → 手動入力（または role 別デフォルト値）で補完
3. **バフ・デバフ倍率** → `damageBreakdown.targetBreakdowns[].groups` の合計値を pre-resolved power として渡す
4. **敵パラメータ** → Enemy Setup の選択から enemies.json を参照

---

## 1. damageContext のフィールド全体像

```js
// buildDamageCalculationContext() が保持するフィールド（全44フィールド）
{
  // スキル・キャラクター情報
  actorCharacterId, actorStyleId, skillId, skillName, skillLabel,
  targetType, isNormalAttack,                         // ← isNormalAttack ✅

  // ターゲット情報
  enemyCount, targetEnemyIndex, eligibleEnemyIndexes,
  effectiveDamageRatesByEnemy,                        // 破壊率（%表示値）

  // Hit 数
  baseHitCount, funnelHitBonus, effectiveHitCountPerEnemy, effectiveHitCountTotal,

  // 敵能力ダウン
  enemyTalismanLevelByEnemy, enemyDisasterLevelByEnemy, enemyAllAbilityDownByEnemy,

  // トークン
  tokenAttackTokenCount, tokenAttackRatePerToken, tokenAttackTotalRate,

  // DP依存攻撃
  attackByOwnDpRate*（複数フィールド）,

  // バフ率（合算値）
  highBoostSkillAtkRate, attackUpRate, defenseUpRate, criticalRateUpRate,
  criticalDamageUpRate, damageRateUpPerTokenRate,
  babiedSkillAttackUpRate, babiedOdGaugeGainUpRate,
  divaSkillAttackUpRate, foodBuffAttackUpRate, foodBuffHealDpByDamageRate,
  markAttackUpRate, markDamageTakenDownRate, markDestructionRateGainBonusRate,
  markCriticalRateUp, markCriticalDamageUp,
  accessoryAttackUpRate, accessoryContributions,
  overDrivePointUpByToken*（複数フィールド）,

  // Zone
  zoneType,                                           // 'Fire' | 'Ice' 等（'FireZone' 形式ではない）
  zonePowerRate,                                      // ゾーン倍率（例: 0.5 = 50%加算分）

  // エフェクト（個別配列）
  selectedMindEyeEffects,                            // ← 個別効果あり
  funnelEffects,                                     // ← 個別効果あり
  // ※ chargeEffects は damageContext に含まれない（damage-breakdown.js で member から取得）

  // 出力済みブレイクダウン
  criticalRateBreakdown, damageBreakdown,            // 既存の威力詳細グループ
}
```

---

## 2. フィールド別マッピング方針

### ✅ そのまま使える（直接マッピング可能）

| DamageInputContext フィールド | 取得元 | 備考 |
|---|---|---|
| `skill.skillId` | `damageContext.skillId` | |
| `skill.name` | `damageContext.skillName` | |
| `skill.kind` | `damageContext.isNormalAttack` | `true` → `'normal_attack'` |
| `attacker.characterId` | `damageContext.actorCharacterId` | |
| `attacker.styleId` | `damageContext.actorStyleId` | |
| `attacker.tokenCount` | `damageContext.tokenAttackTokenCount` | |
| `attacker.tokenRatio` | `damageContext.tokenAttackTotalRate` | 0 の場合は tokenCount から計算 |

### 🔄 変換が必要

| DamageInputContext フィールド | 取得元 | 変換内容 |
|---|---|---|
| `activeZone` | `damageContext.zoneType` | `'Fire'` → `'FireZone'`、空なら `'None'` |
| `defender.destructionRate` | `damageContext.effectiveDamageRatesByEnemy[targetIndex]` | % 表示値 ÷ 100 |

### 📦 damageBreakdown から再構築（重要な設計ポイント）

バフ・デバフの個別 `statusEffects` は damageContext に入っていないが、
`damageBreakdown.targetBreakdowns[i].groups` の各グループの `multiplier` から
**pre-resolved power として再構築**できる。

```js
// 例: attack-buff グループの multiplier = 1.35 → buffRate = 35%
// → { statusType: 'AttackUp', skillName: '合計攻撃バフ', power: 35 } を渡す
// calculateDamage() は power 直接指定時はスキル解決をスキップするので OK

const buffGroup = damageBreakdown.targetBreakdowns[0].groups
  .find(g => g.dataGroup === 'buff');
const buffTotalRate = (buffGroup.multiplier - 1) * 100;  // %

// MindEye は selectedMindEyeEffects に個別エフェクトとして存在するので
// そのまま power を読み出して渡せる
const mindEyePower = selectedMindEyeEffects
  .reduce((sum, e) => sum + (e.power ?? 0), 0) * 100;

// debuff グループ: multiplier = 1.5 → defenseDownRate = 50%
const debuffGroup = damageBreakdown.targetBreakdowns[0].groups
  .find(g => g.dataGroup === 'debuff');
const debuffTotalRate = (debuffGroup.multiplier - 1) * 100;
```

### ❌ damageContext から取得不可（外部から補完必要）

| DamageInputContext フィールド | 補完元 | 備考 |
|---|---|---|
| `attacker.stats` | **手動入力** または **role 別デフォルト** | T1.1 の主題 |
| `attacker.limitBreakCount` | **手動入力** | デフォルト 0 |
| `attacker.abilitySprCorrection` | **手動入力** | デフォルト 0 |
| `defender.enemyId` | **Enemy Setup snapshot** | ag が調査中 |
| `defender.paramBorder` | **enemies.json** | enemyId から引き当て |
| `defender.isHpTarget` | **手動選択** または true 固定 | v1 は HP 固定で可 |
| `defender.resistances` | **enemies.json** | weapon type の耐性マップ |
| `skill.level` | **手動入力** | デフォルト 10 |

---

## 3. 設計方針まとめ：Approach C (Hybrid)

```
damageContext
  ├── skill.skillId / name / kind         ─→ そのまま
  ├── attacker.characterId / styleId      ─→ そのまま
  ├── attacker.tokenCount / tokenRatio    ─→ そのまま
  ├── activeZone                          ─→ zoneType を変換
  └── damageBreakdown.groups             ─→ 各グループ multiplier を
                                              pre-resolved power に変換

AttackerStatsInput（手動入力 + デフォルト）
  └── str/dex/wis/spr/luk/con            ─→ attacker.stats に注入

Enemy Setup (ag 調査中)
  ├── enemyId                            ─→ defender.enemyId
  └── paramBorder / resistances          ─→ enemies.json から引き当て
```

---

## 4. `zoneType` 変換マップ

`damageContext.zoneType` は `'Fire'` 等の短縮形、`DamageInputContext.activeZone` は `'FireZone'` 形式。

```js
const ZONE_TYPE_TO_ACTIVE_ZONE = {
  Fire: 'FireZone',
  Ice: 'IceZone',
  Thunder: 'ThunderZone',
  Dark: 'DarkZone',
  Light: 'LightZone',
};
const activeZone = ZONE_TYPE_TO_ACTIVE_ZONE[damageContext.zoneType] ?? 'None';
```

---

## 5. chargeEffects の注意点

`chargeEffects`（チャージバフ）は `damageContext` に含まれない。
`damage-breakdown.js` が `member.resolveEffectiveStatusEffects('BuffCharge')` で取得している。

T1.3 の `buildDamageCalculationInput()` でチャージバフを扱う場合、
`damageBreakdown.groups['buff'].contributions` 内の `BuffCharge` エントリから
値を読み出すことで対応できる。

---

## 参照先

- `src/domain/damage-calculation-context.js` — damageContext の全フィールド定義
- `src/domain/damage-breakdown.js` — damageBreakdown の構築ロジック
- `src/contracts/damage-calculation.js` — DamageInputContext 型定義
- `src/domain/damage-calculator.js` — calculateDamage() 実装
