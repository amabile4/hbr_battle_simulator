# バフ消費ロジック統一スキーマ設計

> **ステータス**: 📚 参照 | 📅 最終更新: 2026-06-27

## 概要

このドキュメントは、バフ消費判定を統一するための共通スキーマを定義します。  
すべてのバフ（Funnel、MindEye、特殊状態、ターン型など）が共通のメタデータと判定ロジックに従うための設計です。

> Phase 3 実装反映（2026-03-31）
> - `shouldConsume()` と `buildActionContext()` は runtime 経路に接続済み
> - TurnEnd 系（Player/Enemy）は `ActionContext('TurnEnd')` ベースで判定
> - `validateBuffMetadata()` は warning/strict gate 付きで runtime 接続済み
> - `Sprightly` は `consumeTrigger: "SkillUse"` で非ダメージを含む対象SPスキル使用時に消費

---

## 1. バフメタデータ統一スキーマ

### 既存スキーマ（StatusEffect）との統合

現在の `normalizeStatusEffect()` で返される `StatusEffect` インタフェース：

```typescript
interface StatusEffect {
  effectId: number;
  statusType: string;
  limitType: string;           // 'Default' | 'Only' | 'Once' | 'Special'
  exitCond: string;             // 'Count' | 'PlayerTurnEnd' | 'EnemyTurnEnd' | 'Eternal' | ...
  remaining: number;
  power: number;
  sourceType: string;           // 'skill' | 'passive'
  sourceSkillId: number | null;
  sourceSkillLabel: string;
  sourceSkillName: string;
  sourceSkillDesc: string;
  sourceCharacterId: string;
  sourceCharacterName: string;
  sourceSkillDesc: string;
  metadata: object | null;
}
```

### 拡張スキーマ（Buff Consumption Metadata）

バフ消費判定に必要な追加フィールドを `metadata` に統一化：

```typescript
interface BuffConsumptionMetadata {
  // 消費トリガーの明示（新規）
  consumeTrigger: 'DamageDealt' | 'NormalAttack' | 'Pursuit' | 'TurnEnd' | 'SpecialStatus' | 'Manual' | 'SkillUse';
  
  // 消費量（デフォルト1）
  consumeAmount?: number;

  // Only型が競合する非同一グループの ID 連番（新規）
  // 例: Funnelなら FunnelUp グループ、MindEyeなら MindEyeDetection グループ
  onlyGroupKey?: string;
  
  // 手動消費対象かどうか（新規）
  // true な場合、特定スキルやアクションで明示的に呼び出す必要がある
  isManualConsumption?: boolean;
  
  // 特殊状態ならそのID（既存metadata活用）
  specialStatusTypeId?: number;
}
```

### 正規化されたバフメタデータの例

#### Funnel (ファンネル)

```json
{
  "effectId": 1,
  "statusType": "Funnel",
  "limitType": "Default",
  "exitCond": "Count",
  "remaining": 2,
  "power": 3,
  "metadata": {
    "consumeTrigger": "DamageDealt",
    "consumeAmount": 1,
    "onlyGroupKey": "FunnelUp",
    "effectName": "FunnelUp",
    "damageTier": "large",
    "multiHit": 3
  }
}
```

#### MindEye (マインドアイ)

```json
{
  "effectId": 2,
  "statusType": "MindEye",
  "limitType": "Count",
  "exitCond": "Count",
  "remaining": 1,
  "power": 1,
  "sourceType": "skill",
  "metadata": {
    "consumeTrigger": "DamageDealt",
    "consumeAmount": 1,
    "onlyGroupKey": "MindEyeDetection",
    "specialStatusTypeId": 78,
    "singleTrigger": true,
    "isManualConsumption": false
  }
}
```

#### アクティブバフ（PlayerTurnEnd型）

```json
{
  "effectId": 3,
  "statusType": "AttackUp",
  "limitType": "Default",
  "exitCond": "PlayerTurnEnd",
  "remaining": 3,
  "power": 10,
  "metadata": {
    "consumeTrigger": "TurnEnd",
    "consumeAmount": 1,
    "effectName": "AttackUp"
  }
}
```

#### Eternal型バフ

```json
{
  "effectId": 4,
  "statusType": "BuffCharge",
  "limitType": "Only",
  "exitCond": "Eternal",
  "remaining": 0,
  "power": 1,
  "metadata": {
    "consumeTrigger": "Manual",
    "consumeAmount": 0,
    "onlyGroupKey": "BuffChargeEffect",
    "specialStatusTypeId": 25
  }
}
```

---

## 2. アクションコンテキスト（ActionContext）型定義

スキル実行時のアクション種別を統一的に表現するための型：

```typescript
interface ActionContext {
  // アクション種別
  actionType: 'NormalAttack' | 'Skill' | 'Pursuit' | 'TurnEnd' | 'Manual' | 'System';
  
  // スキルメタデータ（actionType='Skill'の場合のみ必須）
  skill?: {
    skillId: number;
    label: string;
    name: string;
    sourceType: 'style' | 'support' | 'passive';
    consumeType: 'Sp' | 'Ep' | 'Token' | 'Morale' | 'Motivation';
    parts?: Array<{
      skill_type: string; // 'AttackNormal' | 'AttackSkill' | 'Funnel' | 'MindEye' | ...
      effect?: {
        exitCond?: string;
        exitVal?: number[];
      };
    }>;
  };
  
  // 与ダメージフラグ
  hasDamage: boolean;
  
  // ターン情報
  turnPhase?: 'PlayerTurnStart' | 'PlayerTurnEnd' | 'EnemyTurnStart' | 'EnemyTurnEnd' | 'AdditionalTurn';
  
  // その他コンテキスト
  isNormalAttack?: boolean;
  isPursuit?: boolean;
  isBroken?: boolean;
}
```

### ActionContext 構築例

#### 通常攻撃の場合

```typescript
const context: ActionContext = {
  actionType: 'NormalAttack',
  hasDamage: true,
  isNormalAttack: true,
};
```

#### ダメージスキル実行の場合

```typescript
const context: ActionContext = {
  actionType: 'Skill',
  hasDamage: true,
  skill: {
    skillId: 50001,
    label: 'STezukaAttack',
    name: '牙牙',
    sourceType: 'style',
    consumeType: 'Sp',
    parts: [
      {
        skill_type: 'AttackSkill',
        effect: { exitCond: 'Count', exitVal: [2] }
      },
      {
        skill_type: 'Funnel',
        effect: { exitCond: 'Count', exitVal: [1] }
      }
    ]
  }
};
```

#### プレイヤーターン終了の場合

```typescript
const context: ActionContext = {
  actionType: 'TurnEnd',
  hasDamage: false,
  turnPhase: 'PlayerTurnEnd',
};
```

#### 追撃の場合

```typescript
const context: ActionContext = {
  actionType: 'Pursuit',
  hasDamage: true,
  isPursuit: true,
  skill: { /* pursuit skill metadata */ }
};
```

---

## 3. shouldConsume() 関数シグネチャと判定ルール

### 関数シグネチャ

```typescript
function shouldConsume(
  effect: StatusEffect,
  actionContext: ActionContext,
  options?: {
    maxConsume?: number;        // 同時消費バフの最大数（Only型競合対策）
    excludeEternal?: boolean;   // Eternal型を判定から除くか
  }
): {
  shouldConsume: boolean;       // このアクションで消費するか
  reason: string;               // 判定理由（デバッグ用）
  consumeAmount: number;        // 消費量
}
```

### 判定ロジック（優先度順）

#### 1. アクティブ性チェック

```
if (remaining <= 0 && exitCond !== 'Eternal') {
  return { shouldConsume: false, reason: 'Effect is not active' };
}
```

#### 2. トリガーマッチング

```
map exitCond → trigger
  - 'Count' → 'DamageDealt' | 'NormalAttack' | 'Pursuit' | 'Manual' | 'SpecialStatus' | 'SkillUse'
  - 'PlayerTurnEnd' → 'TurnEnd'
  - 'EnemyTurnEnd' → 'TurnEnd'
  - 'Eternal' → 'Manual' のみ

if (metadata.consumeTrigger !== actionContext trigger) {
  return { shouldConsume: false, reason: 'Trigger mismatch' };
}
```

#### 3. アクション種別の詳細チェック

```
if (exitCond === 'Count') {
  // スキルの parts に当該 statusType が含まれるか確認
  if (actionContext.skill?.parts) {
    const matchingParts = actionContext.skill.parts
      .filter(p => SKILL_TYPE_TO_STATUS_ID[p.skill_type] === statusType);
    if (matchingParts.length === 0) {
      return { shouldConsume: false, reason: 'Skill does not apply this effect' };
    }
  }
}
```

#### 4. Only型競合チェック

```
if (limitType === 'Only') {
  // 同一 onlyGroupKey の他効果と競合判定
  // 呼び出し側で shouldConsume の結果をフィルタして最強1つを選出
  // ここでは全結果を返す（呼び出し側の resolveEffectiveStatusEffects に任せる）
}
```

#### 5. 消費量決定

```
consumeAmount = metadata.consumeAmount ?? 1;
```

### 判定マトリクス（すべての組み合わせ）

| exitCond | limitType | actionType | hasDamage | shouldConsume | 理由 |
|---------|----------|----------|----------|------------|------|
| Count | Default | NormalAttack | true | ✓ | NormalAttackはダメージ行動 |
| Count | Default | Skill | true | ✓ | Skillはダメージ行動 |
| Count | Default | Skill | false | ✗ | ダメージなしスキルは非該当 |
| Count | Once | Skill | false | ✓ | consumeTrigger=SkillUseの対象スキル |
| Count | Default | Pursuit | true | ✓ | Pursuitはダメージ行動 |
| Count | Default | TurnEnd | - | ✗ | TurnEndではCount型消費なし |
| Count | Only | Skill | true | ✓ (限定) | Only型は呼び出し側で最強選出 |
| Count | Only | NormalAttack | true | ✓ (限定) | 上に同じ |
| Count | Only | Manual | - | ✓ | 手動消費は常に可能 |
| PlayerTurnEnd | Default | TurnEnd | - | ✓ | ターン終了フェーズ |
| PlayerTurnEnd | Default | Skill | - | ✗ | スキル実行時は非該当 |
| EnemyTurnEnd | Default | TurnEnd | - | ✓ | 敵ターン終了 |
| Eternal | Only | Manual | - | ✓ | Eternalは手動消費のみ |
| Eternal | Only | TurnEnd | - | ✗ | Eternalはターン進行では消費しない |

---

## 4. 既存フィールドとの対応マッピング

### exitCond → consumeTrigger

| exitCond | consumeTrigger | 説明 |
|---------|--------------|------|
| Count | DamageDealt / NormalAttack / Pursuit / Manual / SkillUse | 数制のバフ、複数トリガー可能 |
| PlayerTurnEnd | TurnEnd | プレイヤーターン終了自動デクリメント |
| EnemyTurnEnd | TurnEnd | 敵ターン終了自動デクリメント |
| Eternal | Manual | 永続バフ、手動消費のみ |

### limitType → Only型競合判定

| limitType | 競合判定 | 説明 |
|----------|--------|------|
| Default | なし | 複数同時に作用可能 |
| Only | あり（同グループ内） | 同グループ内は最強1つのみ |
| Once | なし | 1回の対象行動で1件を消費 |
| Special | あり（特殊） | 例）特殊状態のみ（実装時に拡張） |

---

## 5. マイグレーション戦略

### Phase 2 で実装すべき関数群

| 関数 | 役割 | 実装ファイル |
|-----|------|---------|
| `shouldConsume(effect, context, options?)` | CoreロジックLv*1: 判定 | character-style.js |
| `resolveEffectiveStatusEffects(statusType, effects, context)` | Only型の競合判定と最強選出 | character-style.js |
| `buildActionContext(...)` | ActionContext構築ヘルパー | turn-controller.js |
| `validateBuffMetadata(effect)` | メタデータバリデーション | character-style.js |

### Phase 3 で置換すべき呼び出し箇所

| 現在の呼び出し | 置換先 | 優先度 |
|-------------|------|------|
| `consumeSelectedCountStatusEffects()` | `shouldConsume` に統合 | 高 |
| `tickStatusEffectsByExitCond(exitCond)` | `shouldConsume` を内部で呼ぶ | 高 |
| `tickStatusEffectsWhere(predicate)` | `shouldConsume` に統合可能な部分は統合 | 中 |
| `consumeMindEyeEffects()` | `shouldConsume` へ統合 | 中 |
| `removeStatusEffectsWhere(predicate)` | predicate を `shouldConsume` ベースに | 低 |

---

## 6. 設計原則

1. **トリガー一元化**: すべての消費判定は `shouldConsume()` を経由する
2. **メタデータ明示化**: バフの意図（何がトリガーか、幾つ消費するか）を metadata に記述
3. **呼び出し側は軽く**: turn-controller は ActionContext を構築して `shouldConsume` を呼ぶだけ
4. **段階移行**: 既存コードとの共存を前提に、新ロジックは opt-in 可能に設計
5. **テスト駆動**: マトリクステストで判定の網羅性を常に検証
