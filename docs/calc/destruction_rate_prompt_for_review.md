# 破壊率計算式の検証依頼プロンプト

> 以下のブロック全体を、他の AI モデル（Claude / Gemini / Codex 等）に貼り付けて検証を依頼してください。

---

## 依頼内容

「ヘブンバーンズレッド」というゲームの破壊率計算エンジンの検証をしています。
現状以下の計算式を実装していますが、この式が**ゲーム仕様として正しいか**、また**検証手順として妥当か**を確認したいです。

特にお聞きしたいのは、以下の2点です：

1. **ベース式と各ボーナス因子の構造が正しいか**（特に加算グループ vs 乗算の切り分け）
2. **DP途中ブレイク（autoBreak）時の破壊率蓄積タイミング**が正しいか

---

## 現状の計算式（実機検証 2026-06-15 後）

> **重要な改訂**: 実機検証（5行の実測データ）により、破壊率上昇量は**ヒット数に依存しない**ことが判明しました。
> 旧式 `dr × destMult × hitCount / (8 × 100)` は8ヒット時のみ偶然一致していた式であり、
> **新式 `dr × destMult / 100`** に全面移行しました。

### ベース破壊率上昇量

```
baseDestRate = dr × destMult / 100
```

- `dr`: スキル倍率（skills.json の multipliers.dr）
- `destMult`: 敵の破壊率上昇率（enemies.json の base_param.d_rate）
- `100`: パーセント → 小数変換
- **ヒット数は最終式で不要**（d_rate がヒット数ぶんを合算済み）

### ボーナス加算グループ（スキル攻撃のみ、通常攻撃・追撃は対象外）

```
bonusSum = buffMultiplier
         + transcendenceBurstBonusRate
         + markDestructionRateGainBonusRate  （火の印など）
         + flatDestructionBonus
         + accessoryBonus
         + resonanceBonus
```

### baseDestruction の計算

```
baseDestruction = floor(baseDestRate × (1 + bonusSum) × 10000) / 10000
```

小数第4位で切捨て丸め。

### 敵の破壊率耐性（destResist）

```
finalBaseDestruction = baseDestruction × (1 - destResist)
```

### 連撃（Funnel）ボーナス乗算

```
funnelMultiplier = 1 + funnelRate × funnelHitCount

effectiveBaseDestruction = finalBaseDestruction × funnelMultiplier
```

- `funnelRate`: 連撃1ヒットあたりの破壊率上昇ボーナス（0.06=小, 0.12=中, 0.25=大, 0.50=特大）
- `funnelHitCount`: 連撃による追加ヒット数

### シミュレーション（DPごとの破壊率蓄積）

```
全ヒットを順に処理:
  dmgAccum += hit.damage
  if (dmgAccum >= dpInit && autoBreak) || hit.isBreakHit || isBroken:
    isBroken = true
    addI = effectiveBaseDestruction / h   // per-hit上昇量
    destructionRate = min(finalDestLimit, destructionRate + addI)

最終 destructionRate がそのアクションの破壊率上昇量
```

- `h`: 総ヒット数（baseHitCount + funnelHitCount）
- `dpInit`: アクション開始時のDP残量
- `autoBreak`: DPを0にした瞬間にブレイク判定するか（OD中など）

### 実測値で一致を確認済みのケース（5行の実機データより代表例）

| パラメータ | 値 |
|---|---|
| d_rate（敵破壊率上昇率） | 10 |
| dr | 20.25 |
| baseHitCount | 8 |
| 超越バースト | 0.10 |
| 火の印 | 0.10 |
| 共鳴 | 0.45 |
| funnelRate | 0.25 |
| funnelHitCount | 3 |
| **期待破壊率** | **584.7%** |

計算（新式）:
```
= (20.25 × 10 / 100) × (1 + 0.10 + 0.10 + 0.45) × (1 + 0.25 × 3)
= 2.025 × 1.65 × 1.75
= 5.8471 → 584.71% ✓（実測値 584.7% に一致）
```

また、ヒット数を変えた実測データでも新式が全て一致:

| hit | dr | d_rate | 計算 | 実測 |
|---|---|---|---|---|
| 6 | 3.625 | 10 | 76.1% | 76.1% ✓ |
| 8 | 20.25 | 10 | 584.7% | 584.7% ✓ |
| 1 | 1.25 | 10 | 36.1% | 36.1% ✓ |
| 2 | 1.6 | 10 | 46.2% | 46.2% ✓ |
| 3 | 2.75 | 10 | 79.4% | 79.4% ✓ |

> 旧式 `dr × d_rate × hitCount / 800` は hit=8 以外の全ケースで不一致でした。

---

## 検証手順案

破壊率計算を体系的に検証するため、以下の段階的アプローチを計画しています：

### Step 1: ベース式の単体検証（バフなし・連撃なし）
- 全バフオフ、連撃なしのスキル攻撃
- `baseDestRate = dr × d_rate / 100` の正しさを確認
- **異なるヒット数（1, 3, 8 hit 等）で破壊率上昇量が同じになることを確認**

### Step 2: 各ボーナス因子を1つずつ追加
- 超越バーストのみ → 次に火の印のみ → 次に共鳴のみ
- 毎回 `baseDestruction = baseDestRate × (1 + 単一ボーナス)` を確認
- 最後に全ボーナス加算

### Step 3: 連撃ボーナスの単体検証
- `(1 + funnelRate × funnelHitCount)` の乗算構造を確認

### Step 4: autoBreak 時の破壊率蓄積タイミング
- **ここが最重要かつ未確定**
- DP途中でブレイクした場合、どのヒットから破壊率が蓄積されるか
- 現行実装: ブレイク判定されたヒット以降の残りヒット分のみ蓄積

### Step 5: 複合ケースで全体確認

---

## お聞きしたい点

1. **ベース式 `dr × d_rate / 100` は正しいか？**（ヒット数非依存）
   - 実機検証で 1, 2, 3, 6, 8 ヒットのスキル全てがこの式に一致することを確認済み
   - 旧式 `dr × d_rate × hitCount / 800` は 8ヒット時のみ偶然一致していた

2. **ボーナスを全て加算グループ `(1 + bonusSum)` にまとめる構造は正しいか？**
   - 超越・火の印・共鳴・チェーン・ピアスが全て加算で、乗算ではない

3. **連撃ボーナス `(1 + funnelRate × funnelHitCount)` を独立乗算にするのは正しいか？**
   - ボーナス加算グループとは別の独立した乗算として扱っている

4. **autoBreak 時の挙動は正しいか？**
   - DPが0になった瞬間のヒット以降の残りヒット分のみ破壊率が蓄積される
   - それとも別の解釈（ブレイクしたヒット自体から蓄積、全体が乗る等）があるか

5. **検証手順の順番は妥当か？**
   - より効率的な順番、または抜けている検証項目があれば教えてほしい

6. **小数第4位切捨ての丸め処理は妥当か？**
   - `Math.floor(x × 10000) / 10000` を中間ステップで挟んでいる
