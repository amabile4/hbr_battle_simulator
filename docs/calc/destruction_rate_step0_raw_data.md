# 破壊率 検証 — Step 0 生データ参照シート

> 実機検証の Excel 入力用に、JSON から取得した確定値をまとめた参照シート。
> 各 Step の「Excel 予定値」はこの値を使って計算する。

---

## 1. 検証スキル

### 1a. コードダクネス（和泉ユキ）

| 項目 | 値 | 備考 |
|---|---|---|
| skillId | `46001215` (SkillSwitch 親) | |
| 実アクション skillId | `46001217` (Fire 属性バリアント = `YIzumiSkill56b`) | |
| 表示 hit_count | **6**（`46001217` の `hit_count`） | |
| 接触ヒット数 | **9**（base 6 + Funnel 3） | Funnel は神命を宿す瞳 |
| 計算ヒット数 | **6** | power_ratio 按分は 6 hit 単位 |
| スキルタイプ | AttackSkill（Stab） | |
| 属性 | **Fire** | スイッチ先 = 火属性バリアント（ユキが撃つときは 46001217） |
| ステータス依存 | str:1 / dex:2 / wis:0 / luk:0（加重計算） | |
| diff_for_max | 149 | 敵 param_border + 149 = 649 で最大到達 |

#### AttackSkill part (Fire変身後 46001217)

| 項目 | 値 |
|---|---|
| `power` | [6682.5, 13365] |
| `value` | [0, 0] |
| `multipliers.dp` | 2（対DP +100%） |
| `multipliers.hp` | 1 |
| **`multipliers.dr`** | **3.625** ← 破壊率用スキル倍率 |
| 要素 | Fire |
| hits (power_ratio) | [0.1, 0.1, 0.1, 0.2, 0.2, 0.3]（計 1.0） |

#### 付与される敵ステータス効果

| statusType | power | 持続 | 備考 |
|---|---|---|---|
| Hacking | 0 | 2 ターン | dv=100 |
| Fragile | [0.42, 0.60] | 2 ターン | diff_for_max=149 / parameters: {wis:1, luk:2} |

> Fragile は敵 param_border 500 を基準に補間される。最大 60%。バースト ×1.2 で最大 72%。

---

### 1b. 咲き昇る宵の幻（桐生美也）

| 項目 | 値 |
|---|---|
| skillId | `46004311` |
| `multipliers.dr` | **20.25** |
| 使用箇所 | 実測 +584.7% の参照 |

---

### 1c. 神命を宿す瞳（白河ユイナ）— 連撃スキル

| 項目 | 値 |
|---|---|
| skillId | `46004121` |
| Funnel part power[0] | **3**（連撃による追加ヒット数） |
| Funnel part value[0] | **0.25**（1ヒットあたりの破壊率上昇率） |
| 連撃適用対象 | T2 ユキのコードダクネス（9 hit = 6 + 3） |

---

## 2. 対象敵 — 異時層 スカルフェザー 最終形態

| 項目 | 値 | 備考 |
|---|---|---|
| enemyId | `13420081` | |
| 検証セッション | `tests/e2e/fixtures/ui_next_session_destruction_preview_2026-06-14.json` | |
| param_border | **500** | `param_def=500` 由来（`param_border=670` ではない） |
| **d_rate**（破壊率上昇率） | **10** | destMult として使用 |
| 初期 DP | **4,550,000** | T0 開始時 |
| **T1 後 DP（T2 開始時）** | **0**（T1 でブレイク済み） | autoBreak は T2 では発生しない |
| destResist | **0**（明記なし = 耐性なし） | |
| max_d_rate | 999 | |
| od_rate | 1 | |
| element 相性 | slash/stab/strike=100, **fire=250**（2.5x）, ice/thunder/light/dark=250, nonelement=10 | |

> **重要**: 火属性 250% = ダメージ計算上の affinity 2.5x。破壊率上昇率には影響しない（破壊率は d_rate のみ依存）。

---

## 3. ユニット情報（T2コードダクネス時点）

### ユキ（和泉ユキ）

| 項目 | 値 |
|---|---|
| partyIndex | 1 |
| styleId | 1001209（傍らのプリンセス） |
| **超越バースト** | **LB4 → 超越有効**（攻撃力+3.0, CritDmg+1.0） |
| 破壊率用超越 +10% | **あり**（LB4含む限り +10%） |
| str | 598 |
| dex | 818 |
| wis | 643 |
| spr | 632 |
| luk | 628 |
| con | 629 |

> コードダクネスの AttackSkill part は str:1 / dex:2 加重。加重平均 = (598×1 + 818×2)/3 = 744.67。

### ユイナ（白河ユイナ）— 連撃付与者

| 項目 | 値 |
|---|---|
| partyIndex | 2 |
| styleId | 1004110 |
| LB | **2**（超越バーストなし） |
| T1 行動 | 神命を宿す瞳 (46004121) ← この時点で Funnel 付与 |
| T2 行動 | 指揮行動 (46004125) — AttackUp +15% |

### 美也（桐生美也）— 584.7% ケース

| 項目 | 値 |
|---|---|
| partyIndex | 0 |
| styleId | 1004307 |
| LB | **4**（超越有効） |
| T2 行動 | 咲き昇る宵の幻 (46004311) — dr=20.25 |

---

## 4. T1 → T2 の流れ

```
T1:
  美也: 咲き昇る宵の幻 (46004311) → これで敵をブレイク
  ユキ: 通常攻撃
  ユイナ: 神命を宿す瞳 (46004121) → 連撃 3 hit 付与

T1 終了時:
  敵 DP = 0 (ブレイク済み)
  敵破壊率 = ??? (この値が 100% ではない可能性が問題)
  連撃バフ = 付与済み

T2:
  ユキ: コードダクネス (46001217, Fire) — 9 接触 hit
    破壊率 +32.6%（note 実測）
  美也: 咲き昇る宵の幻 (46004311)
    破壊率 +584.7%（note 実測）
  ユイナ: 指揮行動
```

---

## 5. 破壊率計算式（実機検証 2026-06-15 後）

> **重要な改訂**: 実機検証により、破壊率上昇量は**ヒット数に依存しない**ことが判明しました。

```
# Step A: baseDestRate（破壊率上昇量ベース） — ヒット数非依存
baseDestRate = dr × d_rate / 100
             (旧式 dr × d_rate × hitCount / 800 は廃止)

# Step B: ボーナス加算グループ（スキル攻撃のみ）
bonusSum = 超越(+0.10)
         + 火の印
         + 共鳴
         + flat
         + accessory
         + resonance
         + buffMultiplier

# Step C: 切捨て丸め（小数第4位）
baseDestruction = floor(baseDestRate × (1 + bonusSum) × 10000) / 10000

# Step D: 耐性
finalBaseDestruction = baseDestruction × (1 - destResist)
                    = baseDestruction × 1.0  （destResist=0 なら）

# Step E: 連撃乗算
funnelMultiplier = 1 + funnelRate × funnelHitCount
effectiveBaseDestruction = finalBaseDestruction × funnelMultiplier

# Step F: per-hit蓄積
h = baseHitCount + funnelHitCount   # 接触ヒット数
perHitAdd = effectiveBaseDestruction / h
全 hit 累積 = perHitAdd × 実効 hit 数
```

---

## 6. コードダクネス (T2) 期待値計算例

> **前提**: T2 開始時 DP=0（ブレイク済み）→ autoBreak 発生なし。
> 全 9 hit が破壊率蓄積対象。

```
baseHitCount = 6
h = 6 + 3 = 9

baseDestRate = 3.625 × 10 / 100
             = 0.3625

# 超越のみの場合（仮に他のバフがなければ）
bonusSum = 0.10
baseDestruction = floor(0.3625 × 1.10 × 10000) / 10000
                = floor(3987.5) / 10000
                = 0.3987

funnelMultiplier = 1 + 0.25 × 3 = 1.75
effectiveBaseDestruction = 0.3987 × 1.75
                        = 0.697725  → 切捨て後 0.6977

# 全 9 hit 蓄積
totalAdds = effectiveBaseDestruction / h × h = 0.6977
         = 69.77%
```

**仮定 1（ユキに超越+10%のみ）**: 破壊率上昇予想 = **+69.77%**
**実測値** = **+32.6%**
**乖離** = 69.77 − 32.6 = +37.2%（実測の方が低い）

> **注**: 上記の乖離は仮定が間違っていたためであり、実機検証で正しい条件と式が判明している（旧式計算の参考記録として残置）。

### 仮説チェック

| 仮説 | 説明 | 計算値 | 備考 |
|---|---|---|---|
| H1 | 超越 +10% 適用、全 9 hit 蓄積 | 52.32% | 乖離 +19.7% |
| H2 | 超越なし、全 9 hit 蓄積 | `0.271875 × 1.75 = 0.476` = **47.58%** | 乖離 +14.98% |
| H3 | 6 hit のみ蓄積（Funnel 効かない） | `0.2990 × 1.75 × 6/9 = 0.349` = **34.88%** | 乖離 +2.3%（実測に近い！） |

> ⚠️ **H3（Funnel hit が破壊率蓄積に関与しない）** は実測 +32.6% にほぼ一致。
> → この線を Step 1-3 で実機検証する価値が高い。

---

## 7. Excel 入力テンプレ（コードダクネス T2 想定）

| 列 | 項目 | ユキ T2 値 |
|---|---|---|
| A | テストNo | 1 |
| B | 条件 | コードダクネス T2 / 敵スカルフェザー / DP=0 / 連撃3 |
| C | dpInit | 0 |
| D | d_rate | 10 |
| E | dr | 3.625 |
| F | baseHitCount | 6 |
| G | 超越 | 0.10（LB4 有効） |
| H | 火の印 | 0（要確認） |
| I | 共鳴 | 0（要確認） |
| J | funnelRate × funnelHitCount | 0.25 × 3 |
| K | 予想破壊率上昇(%) | （Excel式で） |
| L | 実機結果(%) | +32.6%（note） |
| M | 判定 |  |

---

## 8. 実機検証時の注意点

### スカルフェザーの再現性

- 「異時層 スカルフェザー 最終形態」は期間限定イベント等での出現の可能性あり。
- 容易に再現できない場合は、**Step 1-3 は別の敵 + 別のシンプルスキル**で検証して構造だけ確定し、**Step 5 でスカルフェザーフィクスチャ全部入り**で照合する。

### 実機で取れる観測値

- 各スキル発動後の **破壊率表示**（%、変化量は手計算/Excel減算）
- 各ヒットの **ダメージ**（必要时）
- ステータス画面の **超越バースト ON/OFF**
- 敵ステータス画面の **DownTurn / Break 表記**

### Step 1-3 用の代替候補（シンプルな構成）

- 単体 attack skill with dr > 1, hit_count = 1 or 2
- 火の印・共鳴なし
- 通常の周回可能な敵

---

## 9. 前回の懸念点（再整理）

### autoBreak vs 全 hit 蓄積

本件では **DP=0 開始**のため、autoBreak は発生しないはず。
全 9 hit 中：6 base hit + 3 funnel hit すべてが蓄積対象になるはずだが、実測との乖離から **Funnel hit は破壊率蓄積に寄与しない** 可能性が浮上。

### bonusSum 構成員の過不足

ユキが T2 時点で batBuff に何を持つか再確認が必要：
- 超越バースト（破壊率 +10%）= あり（LB4）
- 火の印 = ？
- 共鳴 = ？
- DestructionUp バフ = ？
- 指揮（AttackUp）は攻撃力バフで、破壊率 bonusSum には入らない
