# 装備品ステータスボーナス仕様

## 概要

`resolveCharacterStyleStats`（`src/domain/character-stats.js`）はスタイル適用後の6能力を装備品なしで算出する。  
装備ボーナスは**フラット加算値**として別途 `resolveEquipmentStatBonus`（`src/domain/equipment-stats.js`）で算出し、加算することで最終ステータスを求める。

```
最終ステータス[stat] = resolveCharacterStyleStats(...)[stat] + resolveEquipmentStatBonus(config, masterData)[stat]
```

乗算・切り上げは不要（すべてフラット加算）。

---

## ステータスキーマッピング

JSONの `type` フィールドと内部キーの対応：

| JSON type | 内部キー | 日本語 |
|-----------|---------|--------|
| `Power` | `str` | 力 |
| `Dexterity` | `dex` | 器用さ |
| `Wisdom` | `wis` | 知性 |
| `Spirit` | `spr` | 精神 |
| `Luck` | `luk` | 運 |
| `Toughness` | `con` | 体力 |

`Sp`・`Dp`・`PassiveSkill` はステータスボーナスに含めない。

---

## 装備種別ごとのボーナス算出

### 1. ソウル（Soul）

**データソース**: `json/accessories.json` (`label` が `Acc.Soul.*` のエントリ)

ソウルは `effects[]` と `rng_eff[]` が空。ボーナスはテキストフィールドから算出する。

**全能力ボーナス計算式**：
```
allStatBonusPerLevel = parseInt(text.match(/全能力 \+(\d+)/)[1])
allStatBonus = allStatBonusPerLevel × enhanceLevel
```

例：エモーショナル・ソウル（`text: "茅森 月歌の全能力 +5"`）を強化レベル +5 で使用 → 全能力 +25

**スロット効果**（プレイヤーが任意に選択）：  
`slotEffects: [{stat: 'str', value: 3}, ...]` を最大3スロット指定する。  
スロット効果はJSONに記載されておらず、プレイヤー設定値として `EquipmentConfig` に持つ。

### 2. ブースター（Booster）

**データソース**: `json/boosters.json`

`effects[]` の `{category: 'Ability', type: StatType, skill: null, value_type: 'RealNumber'}` エントリを合算する。

主なブースターの能力値（JSON実値、旧資料の「全能力+21」は誤り）：

| ブースター | 力(str) | 器用さ(dex) | 知性(wis) | 体力(con) | 精神(spr) | 運(luk) |
|----------|---------|------------|---------|---------|---------|---------|
| マエストロ (0601) | 51 | 40 | 40 | 40 | 40 | 40 |
| インスペクター (0602) | 40 | 51 | 40 | 40 | 40 | 40 |
| コンダクター (0603) | 39 | 39 | 53 | 39 | 39 | 39 |
| フルガード (0701) | 40 | 40 | 40 | 46 | 46 | 40 |

### 3. チップ（Chip）

**データソース**: `json/chips.json`

`effects[]` を合算する（ブースターと同じ構造）。最大4枚装備。

主なチップ：

| チップ | 能力ボーナス |
|-------|------------|
| 攻撃チップⅤ (SChip_5001) | str+5, dex+5 |
| 耐久チップⅤ (SChip_5002) | con+5, spr+5 |
| ヒールチップⅤ (SChip_5003) | wis+7 |

### 4. アクセサリ（指輪・ピアス・腕輪・首飾り・オーブ）

**データソース**: `json/accessories.json`

アクセサリのボーナスは2種類の格納方式がある：

#### 4a. 固定効果 (`effects[]`)

エンハンス段階がIDに埋め込まれているアクセサリ（指輪・腕輪）。  
`effects[]` の `{category: 'Ability', skill: null}` エントリを全て合算する。

例：ボルトリング (力メイン +6, ID: 5000307)
- `effects[].type='Power', value=[55,0]` → str+55
- `effects[].type='Dexterity', value=[42,0]` → dex+42
- `effects[].type='Toughness', value=[10,0]` → con+10

#### 4b. ランダム効果 (`rng_eff[][]`)

エンハンス段階を `enhanceTier`（= `plus` 値）で指定するアクセサリ（ピアス・首飾り）。  
`rng_eff[slot][index]` の `plus === enhanceTier` かつ `skill === null` のエントリのうち、各 `type` の最大値を合算する。

例：アタックピアス (ID: 5021002) を `enhanceTier=2`（+6強化相当）で使用
- `rng_eff[2][plus=2].type='Wisdom', value=[48,0]` → wis+48

**enhanceTier マッピング目安**：
- `plus=0` : 強化なし〜低強化
- `plus=1` : 中程度強化
- `plus=2` : 最高強化（+6相当）

#### 4c. スロット効果（player-specified）

指輪・ピアス・腕輪・首飾りはそれぞれ最大3スロット、オーブは0スロット。  
スロットはプレイヤーが任意の能力を+3ずつ選択するため、JSONに記載がない。  
`EquipmentConfig` の `slotEffects: [{stat, value}]` で指定する。

#### 4d. オーブ

オーブ（5スロット目）はパッシブスキルのみを付与し、6能力ボーナスは0。

### 5. チャーム（Charm）

**データソース**: `json/accessories.json` (`label` が `Acc.Charm01.*` の6種)

チャームは `rng_eff[0][plus=N]` に強化段階ごとの能力値が記載されている（強化段階 = `plus` 値 0〜4）。  
同一 `plus` 値に複数選択肢がある場合は最大値を使用する（最大値テンプレートビルドの場合）。

| 強化段階 (plus) | 最大値 |
|---------------|-------|
| 0 | +6 |
| 1 | +9 |
| 2 | +12 |
| 3 | +14 |
| 4 | +15 |

---

## EquipmentConfig 型定義

```js
{
  soul: {
    id: number,                        // accessories.json の ID
    enhanceLevel: number,              // 0〜5（全能力+N × enhanceLevel）
    slotEffects: [{stat, value}]       // 最大3スロット、player-specified
  } | null,
  booster: {
    id: number                         // boosters.json の ID
  } | null,
  chips: [{ id: number }],             // chips.json の ID。最大4枚
  accessories: [{
    id: number,                        // accessories.json の ID
    enhanceTier: number,               // rng_eff の plus 値（固定effectsのみのアイテムは無視）
    slotEffects: [{stat, value}]       // 最大3スロット（オーブは []）
  }],                                  // 最大5枠 (Ring, Earring, Bracelet, Necklace, Orb)
  charms: [{
    id: number,                        // accessories.json の ID
    enhanceTier: number                // 0〜4（rng_eff[0][plus=N]）
  }]                                   // 最大6個（stat 種別ごとに1個）
}
```

---

## minビルドの考え方

| パラメータ | 可逆 | 最小値への操作 |
|--------|------|------------|
| 装備 | ○ | 全外し → `resolveEquipmentStatBonus(null)` = 全0 |
| 限界突破 | ○ | `limitBreakLevel=0` を `resolveCharacterStyleStats` に渡す |
| キャラクターLv | ✗ | 実機実測値をfixture入力 |
| スタイルLv | ✗ | 実機実測値をfixture入力（別タスク） |
| スキルLv | ✗ | ダメージ計算に影響、ステータスには無関係 |

手加減が必要な場合（バフ・デバフ系アタッカー）：  
`limitBreakLevel=0` + 装備なしで `resolveCharacterStyleStats` の最小値が確認できる。

---

## スタイルレベル（スコープ外）

スタイルレベル（0〜20）はキャラクターの「経験値」から上昇する不可逆パラメータで、追加の%ボーナスを与える。  
本スペックのスコープ外とし、別タスクで `resolveCharacterStyleStats` への引数追加として実装する。

---

## 参照実装

- 計算関数：[src/domain/equipment-stats.js](../../src/domain/equipment-stats.js)
- テンプレートビルドfixture：[tests/fixtures/equipment_template_builds.json](../../tests/fixtures/equipment_template_builds.json)
- テスト：[tests/equipment-template-builds.test.js](../../tests/equipment-template-builds.test.js)
