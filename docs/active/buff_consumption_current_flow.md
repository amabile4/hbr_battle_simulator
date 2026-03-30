# バフ消費ロジック詳細フロー分析

## 概要

このドキュメントは、現在の分散したバフ消費ロジックの詳細なフローを分析するものです。  
各バフ種別がどのコンテキストで、どのような関数を経由して消費されるかをフローチャート化します。

---

## 1. Funnel（ファンネル）バフの消費フロー

### 現在の消費パターン

- **何**: 与ダメージスキル実行時、ヒット数ボーナスの提供と消費
- **どこから**: `turn-controller.js` の `resolveSkill()` 関数内
- **呼び出し経路**: 

```
resolveSkill()
  ↓
resolveHitCount()
  ↓
resolveFunnelCompetitionForAction(member) ← Funnel selection
  ↓
hasDamage が true → consumeSelectedCountStatusEffects(..., 'Funnel', ids)
  ↓
member.tickStatusEffectsWhere(predicate)  ← 内部デクリメント
```

### フロー図

```
スキル実行開始
  ↓
resolveHitCount() 呼び出し
  ├─ Funnelバフ取得: getFunnelEffects({ activeOnly: true })
  ├─ 競合判定: resolveFunnelCompetitionForAction()
  │  └─ resolveCountOnlyCompetitionForEffects() で Only型選出
  ├─ hitボーナス計算: funnelHitBonus = selectedEffects.reduce(...)
  └─ 有効hitCount決定: baseHitCount + funnelHitBonus
      ↓
  与ダメージあり？
    ├─ YES → consumeSelectedCountStatusEffects('Funnel', selectedCountEffectIds)
    │         └─ クリティカルアク: member.tickStatusEffectsWhere(predicate)
    │            └─ remaining をデクリメント
    └─ NO → 消費なし（消費条件失敗）
```

### 問題点

- 「selection」と「consumption」が別の関数で行われている
- Count型 exitCond のみが自動消費対象
- Only型との競合判定ロジックが `resolveCountOnlyCompetitionForEffects()` に隠れている

---

## 2. MindEye（マインドアイ）バフの消費フロー

### 現在の消費パターン

- **何**: 与ダメージスキル実行時、目玉アイコン表示数制御と消費
- **どこから**: `turn-controller.js` の `resolveSkill()` 関数内（Funnelと同じ）
- **呼び出し経路**:

```
resolveSkill()
  ↓
hasDamage && mindEyeResolution.selectedCountEffectIds.length > 0
  ↓
consumeSelectedCountStatusEffects(..., 'MindEye', selectedCountEffectIds)
  ↓
member.tickStatusEffectsWhere(predicate)
```

### フロー図

```
スキル実行開始
  ↓
与ダメージ判定
  ├─ YES
  │  ├─ MindEyeバフ取得: getMindEyeEffects({ activeOnly: true })
  │  ├─ 競合判定: resolveMindEyeCompetitionForAction()
  │  └─ 選出効果あり？
  │     ├─ YES → consumeSelectedCountStatusEffects('MindEye', selectedCountEffectIds)
  │     │         └─ remaining デクリメント
  │     └─ NO → パス（効果なし）
  └─ NO → スキップ
```

### 問題点

- Funnelと重複した判定ロジック
- 両者ともFunnelと全く同じ `selectedCountEffectIds` 選出ロジック

---

## 3. 特殊状態（SpecialStatus）消費フロー

### 現在の消費パターン

- **何**: MindEye（ID: 78）など特定の特殊状態を手動消費
- **どこから**: 複数箇所
  - `character-style.js`: `tickSpecialStatusCountEffects()`
  - `turn-controller.js`: 特定スキル効果での消費
  
### フロー図

```
プレイヤーアクション実行後
  ↓
tickSpecialStatusCountEffects()
  ├─ exitCond === 'Count' かつ specialStatusTypeId が設定されたeffectを検出
  └─ remaining をデクリメント
      ↓
  または、特定スキルの効果内
    ├─ MindEyeが存在？
    ├─ YES → member.consumeMindEyeEffects(1)
    │        └─ resolveEffectiveMindEyeEffects() で競合判定
    │        └─ consumeStatusEffectsByType('MindEye', 1)
    │           └─ tickStatusEffectsWhere() で消費実行
    └─ NO → パス
```

### 問題点

- 手動消費と自動消費の分岐が不明確
- 特殊状態IDで判定する仕組みと、statusType で判定する仕組みがMIX

---

## 4. DoubleActionExtraSkill削除フロー

### 現在の消費パターン

- **何**: 追加ターン消費後の DoubleActionExtraSkill バフ削除
- **どこから**: `turn-controller.js` の `resolveAdditionalTurnForMember()` 内
  
### フロー図

```
追加ターン使用
  ↓
consumeDoubleActionExtraSkillEffects(1)
  ├─ resolveEffectiveDoubleActionExtraSkillEffects() で競合判定
  └─ resolveEffectiveStatusEffects('DoubleActionExtraSkill') で Only型選出
      ↓
  exitCond === 'Count' かつ選出効果あり？
    ├─ YES → tickStatusEffectsWhere() でデクリメント
    └─ NO → パス
```

### 問題点

- 完全削除（remaining=0）ではなく、デクリメント（remaining-1）である
- 削除対象の明示的指定がない（Only型の最強1つのみ）

---

## 5. ターン終了フェーズでのバフデクリメント

### 現在の消費パターン

- **何**: ターン終了時に exitCond='PlayerTurnEnd' や 'EnemyTurnEnd' なバフをデクリメント
- **どこから**: `turn-controller.js` の複数の終了処理
  - `processEnemyPhase()`: line 3074
  - `commitEnemyTurnRecord()`: 内部

### フロー図

```
ターン終了イベント
  ├─ プレイヤーターン終了
  │  └─ party.forEach(member => member.tickStatusEffectsByExitCond('PlayerTurnEnd'))
  │     ├─ exitCond === 'PlayerTurnEnd' かつ active な effect
  │     ├─ remaining をデクリメント
  │     └─ remaining === 0 になれば自動削除
  │
  └─ 敵ターン終了
     └─ enemies.forEach(enemy => enemy.tickStatusEffectsByExitCond('EnemyTurnEnd'))
        └─ 同上
```

### 問題点

- ターン型バフと Count型バフのデクリメント判定が分離している
- どちらも `tickStatusEffectsByExitCond()` に委ねられているが、exitCond だけで判定

---

## 6. 各消費メソッドのシグネチャ一覧

| メソッド | 定義位置 | 呼び出し側 | 消費トリガー |
|---------|--------|---------|----------|
| `consumeFunnelEffects(count)` | character-style.js | 非使用（wrapper）| - |
| `consumeMindEyeEffects(count)` | character-style.js | 非使用（wrapper）| - |
| `consumeStatusEffectsByType(type, count)` | character-style.js | Funnel/MindEyeの内部 | Count型exitCond |
| `tickStatusEffectsByExitCond(exitCond)` | character-style.js | turn-controller.js多数 | 指定exitCond |
| `tickStatusEffectsWhere(predicate)` | character-style.js | turn-controller.js内 | predicate判定 |
| `removeStatusEffectsWhere(predicate, count)` | character-style.js | turn-controller.js | predicate判定 |
| `consumeDoubleActionExtraSkillEffects(count)` | character-style.js | turn-controller.js | Count型exitCond |
| `tickSpecialStatusCountEffects()` | character-style.js | 非直接使用 | specialStatusTypeId |

---

## 7. 消費判定のマトリクス（現状）

| バフ種別 | exitCond | limitType | トリガー | 消費方法 | 呼び出し関数 |
|-------|---------|----------|------|------|----------|
| Funnel | Count | Default/Only | 与ダメスキル | tickStatusEffectsWhere | consumeSelectedCountStatusEffects |
| MindEye | Count | Default/Only | 与ダメスキル | tickStatusEffectsWhere | consumeSelectedCountStatusEffects |
| 特殊状態(MindEye) | Count | - | 手動/アクション | tickStatusEffectsWhere | tickSpecialStatusCountEffects |
| アクティブバフ一般 | PlayerTurnEnd | Default | ターン終了 | tickStatusEffectsByExitCond | tickStatusEffectsByExitCond |
| アクティブバフ一般 | EnemyTurnEnd | Default | ターン終了 | tickStatusEffectsByExitCond | tickStatusEffectsByExitCond |
| DoubleActionExtraSkill | Count | Only | 追加ターン消費 | tickStatusEffectsWhere | consumeDoubleActionExtraSkillEffects |
| 敵デバフ一般 | Count | - | 明示削除 | removeStatusEffectsWhere | 直接呼び出し |

---

## 問題の構造

### 1. **ロジック分散**
- 「いつ消費するか（トリガー）」が複数の場所で判定されている
- 「どう消費するか（メカニック）」も一貫性を欠く

### 2. **スキーマ非統一**
- バフメタデータ（exitCond, limitType）の意味が統一されていない
- `consumeTrigger` という概念がそもそもコードに無い

### 3. **テストの局所性**
- 個別ケース（Funnel、MindEye、特殊状態）ごとにテストが分かれている
- マトリクス的な網羅テストがない

---

## 統一化への示唆

次の Phase で設計する `shouldConsume(effect, ActionContext): boolean` は、以下の判定をすべて一元化する必要があります：

1. `effect.exitCond` は現在のアクションコンテキストと合致するか
2. `effect.limitType === 'Only'` の場合、他の候補との競合判定が必要か
3. `effect.remaining` の消費量は幾つか
4. 消費後の削除判定（remaining → 0 か、それ以上保持か）

