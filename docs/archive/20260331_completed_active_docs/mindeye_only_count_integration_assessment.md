# MindEye Only/Count 分離統合可能性評価

> **ステータス**: 📦 スナップショット | 📅 最終更新: 2026-03-30
**判定日**: 2025-03-21  
**対象**: MindEye (StatusType 78) / Funnel (StatusType 15)

## 概要

ユーザー質問：「MindEye が Only・Count で 2 つ分離して管理されているのは古い実装ではないか？今回の Phase 2 統合に含めることはできないか？」

**結論**: 
- ❌ 古い実装ではない
- ✅ アーキテクチャ的に必要な設計
- ⚠️ Phase 2 では統合不要、Phase 3 以降で段階的統合が推奨

---

## 1. 現在の Only/Count 分離パターン

### 1.1 MindEye の 2 つのバリアント

#### Only 型 (reinforced mode より生成)

```javascript
// src/domain/character-style.js:224
function createReinforcedModeMindEyeEffect() {
  return {
    statusType: 'MindEye',
    limitType: 'Only',              // ← 1回限定
    exitCond: 'PlayerTurnEnd',      // ← ターン終了フェーズで自動デクリメント
    remaining: 3,
    sourceSkillName: '鬼神化',
  };
}
```

**特徴**:
- 手塚咲の reinforced mode (鬼神化) 発動時のみ生成
- `tickStatusEffectsByExitCond('PlayerTurnEnd')` で自動デクリメント
- ターン終了フェーズで**無条件に減衰**

#### Count 型 (通常スキルより生成)

```javascript
// json/skills.json より抽出
// skill "SMinaseSkill06" (キャッツアイ)
{
  "skill_type": "MindEye",
  "effect": {
    "limitType": "Default",
    "exitCond": "Count",            // ← Count でカウント消費
    "exitVal": [1, 0]
  }
}
```

**特徴**:
- 各スキルで付与される通常の MindEye
- `exitCond: 'Count'` で`tickSpecialStatusCountEffects()` 対象
- ただし `MANUAL_CONSUMPTION_SPECIAL_STATUS_TYPE_IDS = Set([78])` で除外
- **ダメージアクション時に手動消費**が本来の挙動

### 1.2 Funnel も同じパターン

```javascript
// src/domain/character-style.js:207-220
function createReinforcedModeFunnelEffect() {
  return {
    statusType: 'Funnel',
    limitType: 'Only',
    exitCond: 'PlayerTurnEnd',
    remaining: 3,
    sourceSkillName: '鬼神化',
  };
}

// + 通常スキルから Count 型 Funnel
```

---

## 2. Only vs Count 競合判定の役割

### 2.1 デザイン

同一ターン内でキャラが **複数バリアント** を持つことがある：

```
状況: 手塚咲が reinforced mode (Only型Funnel/MindEye) + 
      通常スキルで付与された Count型Funnel が 2 個存在

決定: ダメージアクション時にどちらを消費するか？
```

### 2.2 既存の競合解決ロジック

```javascript
// src/turn/turn-controller.js:6003-6011
function resolveFunnelCompetitionForAction(member) {
  if (!member || typeof member.getFunnelEffects !== 'function') {
    return { selectedEffects: [], reason: 'No member' };
  }

  return resolveCountOnlyCompetitionForEffects(
    member.getFunnelEffects({ activeOnly: true }),
    {
      countLimit: 2,
      reason: 'Funnel competition',
    }
  );
}

function resolveMindEyeCompetitionForAction(member) {
  return resolveCountOnlyCompetitionForEffects(
    member.getMindEyeEffects({ activeOnly: true }),
    {
      countLimit: 2,
      reason: 'MindEye competition',
    }
  );
}
```

**ルール**:
1. Only 型 1 個 vs Count 型の上位 2 個を合算
2. より高い power 値のセットが勝利
3. 採用されたセットのみが消費対象

---

## 3. Phase 2 shouldConsume() の対応状況

### 3.1 実装済みカバレッジ

```javascript
// src/domain/character-style.js:1376-1430
export function shouldConsume(effect, actionContext, options = {}) {
  switch (exitCond) {
    case 'Count':
      return shouldConsumeCountType(effect, actionContext);
      // → hasDamage && actionType in [NormalAttack, Skill, Pursuit, AdditionalTurn]

    case 'PlayerTurnEnd':
      return shouldConsumePlayerTurnEndType(actionContext);
      // → actionType === 'TurnEnd' && turnPhase === 'PlayerTurnEnd'

    case 'EnemyTurnEnd':
    case 'Eternal':
      // 同様に実装
  }
}
```

### 3.2 limitType サポート状況

```javascript
// src/domain/character-style.js:1380-1395
const exitCond = String(effect.exitCond ?? '');
const limitType = String(effect.limitType ?? '');
```

**✅ 既に limitType を認識している**が、現在は consumer decision には使われていない。

### 3.3 Only 型は自動デクリメント

```javascript
// src/domain/character-style.js:1027-1065
tickStatusEffectsByExitCond(exitCond) {
  for (const effect of this.statusEffects) {
    if (String(effect.exitCond) !== cond) continue;
    effect.remaining = Math.max(0, before - 1);  // ← 無条件
  }
}
```

**Only 型**の PlayerTurnEnd バフは`tickStatusEffectsByExitCond('PlayerTurnEnd')`で自動的に `remaining -= 1` される。

---

## 4. 統合不可な理由

### 理由 1: 競合判定が exitCond だけでは不足

```
Only型   Count型(-1)  Count型(-2)
power:3  power:2      power:1
────────────────────────────────

判定対象: Count型全部 vs Only型 1 つ
→ power 合算で競争
→ 勝者のセットのみ消費

shouldConsume(effect) では、
effect 1 つの視点しかないため、
「どのセット vs どのセット」という比較ができない
```

### 理由 2: Manual consumption の分岐

```javascript
// src/domain/character-style.js:1137-1155
tickSpecialStatusCountEffects() {
  // Count型を自動デクリメント
  if (MANUAL_CONSUMPTION_SPECIAL_STATUS_TYPE_IDS.has(specialStatusTypeId)) {
    continue;  // ← MindEye/Funnel/BuffCharge は除外
  }
}

// vs

// src/turn/turn-controller.js:5803-5804
const funnelSelected = resolveFunnelCompetitionForAction(member);
const mindEyeSelected = resolveMindEyeCompetitionForAction(member);
member.consumeSelectedCountStatusEffects([...]);
```

**設計の本質**:
- `PlayerTurnEnd` → 無条件自動デクリメント
- `Count` 通常 → 毎ターン自動デクリメント (`tickSpecialStatusCountEffects`)
- `Count` MindEye/Funnel → **手動競合判定** + **選別消費**

この 3 層構造は exitCond だけでは表現できない。

### 理由 3: 限定型 (limitType: Only) は「戦術的な 1 回制限」

```javascript
limitType: 'Only'    // ← 1 ターンごとに「この効果は 1 回だけ」
exitCond: 'PlayerTurnEnd'
```

これは「同じ状態効果が 2 つあってもうち 1 つだけ使える」という制約。

一方、通常の Count 型は「ストック・消費」モデル。

---

## 5. Phase 別統合ロードマップ

### Phase 2 ✅ (已完了)

- `shouldConsume(effect, actionContext)` 実装
- exitCond ベースの判定ロジック確立
- `buildActionContext()` で actionType 判定機構確立
- Test suite: 701 tests passing

### Phase 3 (推奨される次フェーズ)

**目標**: 呼び出し側の段階的マイグレーション

```javascript
// 現在 (Phase 1-2 混在)
const funnelSelected = resolveFunnelCompetitionForAction(member);
member.consumeSelectedCountStatusEffects(funnelIds);

// Phase 3 へ移行
const shouldConsume1 = shouldConsume(
  funnelOnly, 
  actionContext
);
const shouldConsume2 = shouldConsume(
  funnelCount1,
  actionContext
);
const shouldConsume3 = shouldConsume(
  funnelCount2,
  actionContext
);
// → 内部で resolveCountOnlyCompetitionForEffects() を呼び出す
//   helper に移動
```

**実装詳細**:
- `evaluateCompetitiveConsumption(effects, actionContext)` → helper
  - 内部で `resolveCountOnlyCompetitionForEffects()` を呼び出し
  - `shouldConsume()` を effect 別に評価
  - 勝者セットのみ返す

### Phase 4+

- 旧 `resolveFunnelCompetitionForAction()` 廃止
- 旧 `resolveMindEyeCompetitionForAction()` 廃止
- `resolveCountOnlyCompetitionForEffects()` も helper に完全統合

---

## 6. なぜ「古い実装」ではないのか

### 設計の整合性

| 層 | 処理 | 対象 | exitCond |
|----|------|------|----------|
| **自動1** | `tickStatusEffectsByExitCond()` | 全バフ | PlayerTurnEnd/EnemyTurnEnd |
| **自動2** | `tickSpecialStatusCountEffects()` | 通常 Count バフ | Count |
| **手動** | `resolveFunnelCompetitionForAction()` → `shouldConsume()` helper | MindEye/Funnel | Count (special) |

この 3 層構造は**ゲーム仕様に由来する**アーキテクチャ:
- アクティブバフ (PlayerTurnEnd) は自動
- 一般 Count バフ (HP回復増加等) も自動
- **戦術的な限定バフ** (MindEye/Funnel) は**プレイヤー行動に依存**するため手動

### 実装年代ではなく仕様に基づいた設計

Only/Count 分離は「いつ誰が実装したか」ではなく、**ゲーム仕様そのものが要求している**:

> 手塚咲の reinforced mode (鬼神化) で付与される MindEye/Funnel は
> - Only (1 ターン 1 回制限)
> - PlayerTurnEnd (ターン終了時に decay)
> 
> 一方、通常スキル MindEye/Funnel は
> - Default (複数スタック可)
> - Count (ダメージアクション時に消費)

### 補足: 本シミュレーターにおける実装経緯

本シミュレーターの実装順は、実機の実装史と逆順になっている。

- 実機: 鬼神化が後発で追加され、既存の判定ロジックに対してイレギュラーを後付けする必要があった
- 本シミュレーター: 先に鬼神化（reinforced mode）を実装し、その後に連撃（Funnel）/心眼（MindEye）の通常ロジックを段階追加した

このため、シミュレーター側では「後付けの例外」ではなく「先に安定している鬼神化系の挙動」を基準に設計が組まれている。
結果として、Only/Count 分離は legacy の残骸ではなく、既存の安定挙動を崩さず仕様差を安全に吸収するための設計判断である。

---

## 7. 結論と推奨アクション

### 現状判定

✅ **古い実装ではない**  
✅ **アーキテクチャ的に適切**  
✅ **Phase 2 統合の対象外**

### 推奨スケジュール

```
Phase 2 (✅完了):
  - shouldConsume() 実装完了
  - exitCond ベース判定確立
  - 用意完了、未使用

Phase 3:
  - 呼び出し側を段階的にマイグレーション
  - evaluateCompetitiveConsumption() helper 作成
  - resolveFunnelCompetitionForAction アダプター実装

Phase 4+:
  - 旧関数廃止
  - 完全統一
```

### 今回の実装スコープ判定

**Phase 2 内で含める**: ❌ 不要  
**Phase 3 として計画**: ✅ リスク低く実装可能  

現在は分離状態で動作安定済みのため、Phase 2 では Phase 3 の仕込み（`shouldConsume()` 実装等）に専念し、段階的マイグレーションが設計的に堅実。

---

## 参考: ファイル位置

- MindEye Only 型生成: [src/domain/character-style.js](src/domain/character-style.js#L224)
- Funnel Only 型生成: [src/domain/character-style.js](src/domain/character-style.js#L207)
- 競合判定 Funnel: [src/turn/turn-controller.js](src/turn/turn-controller.js#L6003)
- 競合判定 MindEye: [src/turn/turn-controller.js](src/turn/turn-controller.js#L6012)
- 自動消費: [src/domain/character-style.js](src/domain/character-style.js#L1137)
- Phase 2 shouldConsume: [src/domain/character-style.js](src/domain/character-style.js#L1376)
