# コードダクネス T2 ダメージ乖離 調査記録

📦 スナップショット（2026-06-10 実施）

## 調査の目的

和泉ユキの「コードダクネス」（T2 Action 0）のシミュレータ計算値（約 673 万）と
実機観測値（5,925,362）の乖離を分析する。

**使用セッション**: `ui_next_session_2026-06-07T18-20-13.320+09-00.json`

---

## 確認済み事実

### 乖離の数値

| 項目 | 値 |
|---|---|
| 実機ダメージ | **5,925,362** |
| verify-damage-calc.mjs 計算値（DP ターゲット, DR=100% 仮定） | 6,738,814 |
| 乖離比 | 0.8793 |
| HP ターゲット + DR=155.54% で再計算した場合 | **5,240,664** |
| HP ターゲット補正後の残差 | **+12.7%**（未解明） |

---

### 基本パラメータ（T2 Action 0 時点）

| パラメータ | 値 | 備考 |
|---|---|---|
| role | Breaker | |
| limitBreakCount | 4 | |
| str | 598 | |
| dex | 818 | |
| wis | 643 | |
| skillId | 46001217 | Fire 属性コードダクネス variant |
| 敵 paramBorder | 500 | `param_def=500` 由来（`param_border=670` ではない）|
| `effectiveDamageRatesByEnemy["0"]` | 250 | 火属性弱点 2.5x |
| `destructionRateByEnemy["0"]`（damageContext） | 155.54% | ※下記参照 |
| `enemyDpByEnemy["0"]`（T1 後状態） | **0** | DP は T1 で破壊済み |

---

### damageBreakdown groups（replay 計算値）

| group | multiplier | 主な内訳 |
|---|---|---|
| attack-buff | **5.20** | 心眼 +1.20, 超越バースト攻撃力 +3.00 |
| crit-mindeye | **2.80** | 基礎 1.5, 超越バースト CritDmg +1.00, 固有マーク CritDmg +0.30 |
| funnel | **1.75** | 連撃数アップ +0.75（神命を宿す瞳 by ユイナ: 3 hit × 25%） |
| token-passive | **1.30** | 固有マーク攻撃力 +0.30 |
| debuff | **1.72** | 脆弱 +0.72 |
| affinity | **2.50** | 突相性 ×1.0, 火属性相性 ×2.50 |
| **finalMultiplier** | **142.43** | 上記の積 |

formula 文字列: `"5.20x * 2.80x * 1.75x * 1.30x * 1.72x * 2.50x"`

---

### 敵ステータス（T2 Action 0 時点の enemyStatusEffects）

```json
{"statusType": "Hacking", "power": 0,    "sourceSkillName": "コードダクネス"}
{"statusType": "Fragile", "power": 0.72, "sourceSkillName": "コードダクネス"}
{"statusType": "Break"}
{"statusType": "DownTurn"}
```

---

## 発見 1: DP+100%（`specialEffect=2.0`）の表示欠落

`calculateDamage` は `specialEffect = multipliers.dp = 2.0` を適用して正しく計算するが、
`breakdown` オブジェクトおよび表示用 `formula` 文字列に含まれていない。

```js
// damage-calculator.js L499
const specialEffect = toNumber(multipliers[isHpTarget ? 'hp' : 'dp'], 1);

// L573〜592 の return breakdown:
breakdown: {
  buffMultiplier,
  critMindeyeMultiplier,
  debuffMultiplier,
  affinityMultiplier,
  // ...
  // specialEffect は含まれない！
}
```

同様に `destructionRate` も `breakdown` に未掲載。

**影響**: `formula` を見るユーザーには `finalMultiplier = 142.43` と表示されるが、
実際の乗数は `142.43 × specialEffect × destructionRate`。

---

## 発見 2: 脆弱の power 計算と enemy_border 補正の未実装

### 格納値 0.72 の由来

現シミュレータは `resolvePreferredNonDamageRangeValue([0.42, 0.60]) = 0.60`（配列最大値）を
そのまま取得し、バースト +20% 拡張を適用して 0.72 を格納している。

```
resolvePreferredNonDamageRangeValue([0.42, 0.60]) = 0.60  ← パラメータ補間なし
↓
scaleHighBoostEnemyDebuffPower(state, actor, 'Fragile', 0.60)
= 0.60 × 1.2 = 0.72  ← 超越バースト +20%
```

### パラメータ加重と providerStat の計算方法

コードダクネスの脆弱パート: `parameters = {wis:1, luk:2}`（重み比）

攻撃ダメージ側の `calculateWeightedAttackStat` は `weightedSum / weightSum`（加重平均）で計算する。
脆弱の providerStat も同様に加重平均と考えるのが自然。

```
providerStat = (wis×1 + luk×2) / (1+2)
             = (643×1 + 628×2) / 3
             = 1899 / 3
             = 633
```

※ 単純な加重和（wis + 2×luk = 1899）ではなく加重平均とするのは、
  `calculateWeightedAttackStat`（L331-349）が同方式を採用しているため。

### 正しい計算式（敵デバフ・ダメージ計算のみ適用）

対敵デバフ・攻撃/防御ダメージに関わる効果値は、攻撃者と敵のパラメータ差分で補間される。

```
diff = providerStat - enemy_paramBorder
     = 633 - 500 = 133
diff_for_max = 149

diff (133) < diff_for_max (149) → 最大値未達

Fragile base power = ((60 - 42) / 149) × 133 + 42
                   = (18 / 149) × 133 + 42
                   ≈ 16.07 + 42
                   = 58.07%  ← 最大 60% 未満
```

| | 現シミュレータ | 正しい計算（加重平均仮定） |
|---|---|---|
| providerStat | — | **633**（= (643 + 1256) / 3） |
| diff | — | **133**（= 633 − 500） |
| Fragile base | 60%（最大値固定） | **58.07%** |
| バースト ×1.2 後 | 72% | **69.68%** |
| debuffMultiplier | 1.720 | **1.6968** |
| HP 計算値への影響 | 5,240,664 | **≈5,170,165**（−1.3%）|

**最大値到達条件**:
- `providerStat ≥ enemy_paramBorder + diff_for_max = 500 + 149 = 649`
- ユキの providerStat 633 < 649 → **最大値未達**
- luk を伸ばした場合（例: luk=643）: `(643 + 1286)/3 = 657.7 ≥ 649` → 最大達成

### 適用範囲の注意

この `enemy_paramBorder + diff_for_max` 境界チェックは **対敵デバフ・攻撃/防御ダメージ** にのみ適用すべき。
自身やパーティへのバフ効果は閾値を軽く超えることが多く、最大値固定でよい。

### 現コードの問題点

`resolveEffectPower`（`damage-calculator.js`）は `effect.power` が既設定の場合補間をスキップする。

```js
// damage-calculator.js L215-216
if (hasValue(effect?.power)) {
  return Number(effect.power);  // ← 格納値をそのまま返す（補間なし）
}
// 長パス（effect.power 未設定時のみ）
const threshold = toNumber(part.diff_for_max);  // ← enemy_paramBorder を加えていない
```

問題は 2 層構造:
1. **格納時**: `resolvePreferredNonDamageRangeValue` が最大値を返し、`enemy_paramBorder` 補正なしで格納
2. **読み取り時**: `effect.power` 設定済みのため長パスをスキップ（`providerStat` 参照なし）

長パスが仮に実行されても `enemy_paramBorder` が `resolveEffectPower` に渡されていないため、
正しい補間はできない設計になっている。

### 他の計算機との照合が必要な点

- `providerStat` が加重平均（`÷ 重みの合計`）という解釈が他の計算機と一致するか
- `diff = providerStat - enemy_paramBorder` の計算式が正しいか（Excel/web 実装との比較）
- バースト効果による拡張（×1.2）がデバフ格納前・後どちらに適用されるか

---

## 発見 3: HP ターゲット判定と破壊率

`enemyDpByEnemy["0"] = 0`（T1 後）→ コードダクネス時点で DP は破壊済み。
よって実際の攻撃はHP ターゲット（`isHpTarget = true`）。

```
isHpTarget = true
→ specialEffect = multipliers.hp = 1.0（DP+100% は不適用）
→ destructionRate = 1.5554（damageContext.destructionRateByEnemy["0"] = 155.54%）
```

verify スクリプトは以下の誤った仮定で計算していた:

| 項目 | verify スクリプト | 正しい値 |
|---|---|---|
| isHpTarget | false（DP ターゲット） | **true**（HP ターゲット）|
| specialEffect | 2.0 | **1.0** |
| destructionRate | 1.0（enemyState が空 `{}` でフォールバック） | **1.5554** |
| 計算結果 | 6,738,814 | 5,240,664 |

---

## 残差 +12.7% の仮説

HP ターゲット + DR=155.54% で補正しても実機値（5,925,362）より 12.7% 低い（5,240,664）。

```
必要な実効乗数: 5,925,362 / (baseDamageCrit × remaining_multipliers)
= 250.45

現在の計算: 2.5(affi) × 1.5554(dr) × 1.0(special) × 1.72(debuff)
            × 5.20(buff) × 1.30(token) × 2.80(crit) × 1.75(funnel)
= 221.53

不足分: 250.45 / 221.53 = 1.1306
```

考えられる要因:

| 仮説 | 根拠 | 検証状況 |
|---|---|---|
| 破壊率をヒット平均値で計算（開始 155.54%→終了 188.14%、平均 171.84%） | ヒットごとに DR 増加する仕様 | 未検証。平均 DR=171.84% なら 5,790,706（実機より低め） |
| DP破壊タイミングが T2 初弾より前（T1 内）で全9ヒットが HP | `enemyDpByEnemy=0` 確認済み | 対応済み |
| T1 の一部ヒットで DR 積算が開始し T2 開始時 DR > 155.54% | enemyState.destructionRateByEnemy = {} で追跡不全 | 状態管理バグの可能性あり |
| `criticalGuaranteed` が replay で `undefined`（未適用） | `ctx.criticalGuaranteed = undefined` 確認 | バースト CritDmg +100% は適用済み、保証フラグのみ欠落 |
| ゲーム内の DR 適用式が異なる（乗算でなく別演算） | 未調査 | 未検証 |

---

## verify-damage-calc.mjs の既知バグ

1. **破壊率の取得元**: `stateBefore.turnState.enemyState.destructionRateByEnemy` が `{}` → 100% フォールバック。
   正しくは `damageContext.destructionRateByEnemy` を使用すべき。

2. **isHpTarget の判定**: DP=0 なら HP ターゲット、との判定が未実装。
   `enemyDpByEnemy["0"] === 0` → `isHpTarget = true`、`specialEffect = multipliers.hp` に切り替えが必要。

3. **specialEffect と destructionRate の breakdown 未掲載**（表示上の問題。計算自体は正しい）。

---

## 次の検証ポイント（未着手）

1. **T2 開始時の DR が正しく 155.54% か確認**  
   `damageContext.destructionRateByEnemy` と `enemyState` の値が一致しない原因の調査

2. **ヒットごと DR 増加の影響**  
   コードダクネス 9 ヒット中、各ヒットに割り当てられた DR と、
   「+32.6%」増分の内訳検証

3. **`破壊率計算モデル` との整合**  
   `docs/calc/destruction_calculation_model.md` 仕様に基づいたヒット別 DR シミュレーション

4. **char-detail-popup の実際の表示値**  
   UI が表示する計算値との比較（HP/DP 判定含め）

---

## 参照ファイル

- `src/domain/damage-calculator.js` — `calculateDamage`, `resolveEffectPower`
- `src/domain/damage-calculator-input-builder.js` — `buildDamageCalculationInput`, `buildSyntheticDefenderEffects`
- `src/domain/damage-breakdown.js` — `collectEnemyStatusContributions`, `createRateContribution`
- `src/turn/turn-controller.js` — `scaleHighBoostEnemyDebuffPower`, `applyEnemyStatusEffectsFromActions`
- `docs/calc/destruction_calculation_model.md` — 破壊率仕様
- `scripts/verify-damage-calc.mjs` — 検証スクリプト（上記バグあり）
- `scripts/verify-transcendence-burst.mjs` — 超越バースト確認スクリプト
