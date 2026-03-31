# アクションコンテキスト分類表・判定マトリクス

> **ステータス**: 📚 参照 | 📅 最終更新: 2026-03-31

## 概要

このドキュメントは、**すべての行動種別 × すべてのバフ種別 × すべての exitCond** の組み合わせに対して、  
「そのアクションでこのバフが消費されるか」を一覧化したマトリクスです。

実装時のテストケースの網羅性確保と、デバッグ時の参照資料として使用します。

> Phase 3 差分確認（2026-03-31）
> - P3-05（TurnEnd shouldConsume 経路移行）後も、本マトリクスの消費判定定義に変更なし
> - PlayerTurnEnd は行動者のみ、EnemyTurnEnd は全体適用の実装挙動を維持

---

## 1. アクション種別の定義

### 1.1 プレイヤー側アクション

| アクション種別 | ActionType | hasDamage | turnPhase | 説明 |
|------------|-----------|----------|----------|------|
| **通常攻撃** | NormalAttack | true | - | キャラの物理/特殊攻撃 |
| **スキル（ダメ有）** | Skill | true | - | 与ダメージを含むスキル |
| **スキル（ダメ無）** | Skill | false | - | バフ、デバフのみのスキル |
| **追撃** | Pursuit | true | - | 通常攻撃後の連撃 |
| **追加ターン** | Skill | true | AdditionalTurn | OD時の追加ターン |
| **プロテクション** | Skill | false | - | 行動なしの代替（SP消費不要） |

### 1.2 ターン管理アクション

| アクション種別 | ActionType | turnPhase | 説明 |
|------------|-----------|----------|------|
| **プレイヤーターン終了** | TurnEnd | PlayerTurnEnd | 全キャラのターン終了後に自動実行 |
| **敵ターン終了** | TurnEnd | EnemyTurnEnd | 全敵のターン終了後に自動実行 |
| **強化状態終了** | TurnEnd | ReinforcedModeEnd | 強化状態が終わるとき |

### 1.3 特殊・手動アクション

| アクション種別 | ActionType | 説明 |
|------------|-----------|------|
| **特殊状態消費** | SpecialStatus | MindEye等の手動消費 |
| **バフ削除** | Manual | 敵デバフ削除など |

---

## 2. バフ種別の定義

### バフカテゴリ

| カテゴリ | statusType例 | exitCond | limitType | 説明 |
|--------|----------|---------|----------|------|
| **数制バフ（与ダメ）** | Funnel, MindEye | Count | Default/Only | 与ダメージスキルで消費 |
| **数制バフ（その他）** | DoubleActionExtraSkill | Count | Only | 使用時自動消費 |
| **ターン型バフ** | AttackUp, DefenseUp | PlayerTurnEnd/EnemyTurnEnd | Default | ターン終了時自動 |
| **永続バフ** | BuffCharge | Eternal | Only | 手動消費またはスキル付帯 |
| **特殊状態** | MindEye（ID:78） | Count | - | 特殊状態ID管理 |
| **敵デバフ** | DefenseDown, Fragile | Count | - | 敵に付与される | 

---

## 3. 完全判定マトリクス

### 3.1 数制バフ（Funnel / MindEye 等）

#### exitCond = "Count"

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ バフ: Count型（Funnel, MindEye, 特殊状態）                                   │
│ limitType: Default / Only                                                    │
│ 消費トリガー: DamageDealt / NormalAttack / Pursuit / Manual                  │
└─────────────────────────────────────────────────────────────────────────────┘

アクション ↓ | 通常攻撃 | Skillダメ | Skill無ダメ | 追撃 | ターン終了 | 追加ターン | 手動消費
────────────┼────────┼─────────┼──────────┼────┼────────┼────────┼────────
Funnel      |   ✗    |    ✓    |    ✗     | ✓  |   ✗    |   ✓    |   ✓
MindEye     |   ✗    |    ✓    |    ✗     | ✓  |   ✗    |   ✓    |   ✓
特殊状態ID78|   ✓    |    ✓    |    ✗     | ✓  |   ✗    |   ✓    |   ✓
汎用Count型 |   ✓    |    ✓    |    ✗     | ✓  |   ✗    |   ✓    |   ✓
```

**注釈:**
- ✓: 消費される
- ✗: 消費されない
- Funnel / MindEye は現行の呼び出し側ガード（通常攻撃・追撃除外）を反映し、通常攻撃列を ✗ とする
- Only型の場合でも「消費される」が、呼び出し側で競合判定（同グループ内最強1つ）

**詳細ロジック:**

```
if exitCond === 'Count':
  トリガー判定
    if actionType in [NormalAttack, Skill, Pursuit, AdditionalTurn]:
      かつ hasDamage === true:
        → 消費 ✓
    elif actionType === Manual:
      → 消費 ✓
    else:
      → 非消費 ✗
```

---

### 3.2 ターン型バフ

#### exitCond = "PlayerTurnEnd"

```
┌──────────────────────────────────────────────────────────────────────────┐
│ バフ: PlayerTurnEnd型（プレイヤーターン終了で自動デクリメント）           │
│ これらはターン終了フェーズでのみ消費される                              │
└──────────────────────────────────────────────────────────────────────────┘

アクション ↓ | 通常攻撃 | Skill | 追撃 | ターン終了 | 追加ターン
────────────┼────────┼──────┼────┼────────┼────────
PlayerTurnEnd|  ✗     |  ✗   |  ✗  |   ✓    |   ✗
AttackUp    |  ✗     |  ✗   |  ✗  |   ✓    |   ✗
DefenseUp   |  ✗     |  ✗   |  ✗  |   ✓    |   ✗
```

**ロジック:**

```
if exitCond === 'PlayerTurnEnd':
  if actionType === TurnEnd && turnPhase === 'PlayerTurnEnd':
    → 消費 ✓
  else:
    → 非消費 ✗
```

#### exitCond = "EnemyTurnEnd"

```
同じロジックだが turnPhase === 'EnemyTurnEnd' で判定
```

---

### 3.3 Eternal型バフ

#### exitCond = "Eternal"

```
┌─────────────────────────────────────────────────────────────────────────┐
│ バフ: Eternal型（永続）                                                │
│ limitType: Only                                                          │
│ 手動消費またはスキル内で明示的に指定された場合のみ消費                 │
└─────────────────────────────────────────────────────────────────────────┘

アクション ↓ | 通常攻撃 | Skill | ターン終了 | 手動削除 | スキル指定
────────────┼────────┼──────┼────────┼────────┼────────
BuffCharge  |  ✗     |  ✗   |   ✗    |   ✓    |   ✓
Eternal型   |  ✗     |  ✗   |   ✗    |   ✓    |   ✓
```

**ロジック:**

```
if exitCond === 'Eternal':
  if actionType === Manual:
    → 消費 ✓
  elif statusType が skill.parts に明示的に含まれる:
    → 消費 ✓
  else:
    → 非消費 ✗
  
  注: Eternal は remaining=0 でも isActiveStatusEffect() が true を返す
```

---

## 4. スキル内での複合バフ生成・消費パターン

### 4.1 Funnelを生成かつ消費するスキル例

```
スキル "牙牙" (TeZuka)
  parts:
    - { skill_type: "AttackSkill", damage: 100 }
    - { skill_type: "Funnel", effect: { exitVal: [1] } }  ← 生成
    
実行時:
  1. Funnel生成（既存ロジック）
  2. 与ダメージあり
  3. shouldConsume(Funnel, context) で exitCond=Count, hasDamage=true
     → 消費 ✓
```

### 4.2 MindEyeを生成するが消費しないスキル例

```
スキル "心眼" (某キャラ)
  parts:
    - { skill_type: "MindEye", effect: { exitVal: [1] } }  ← 生成
    
実行時:
  1. MindEye生成
  2. 与ダメージなし（非ダメージスキル）
  3. shouldConsume(MindEye, context) で hasDamage=false
     → 非消費 ✗
```

---

## 5. Only型（限定枠）の競合判定マトリクス

### 5.1 Funnel同一グループでの競合

```
同じ onlyGroupKey="FunnelUp" のバフより、
最も power が高い1つのみが有効になる。

例：
  効果A: Funnel, power=3, Only
  効果B: Funnel, power=2, Only
  
判定結果:
  → 効果A のみが active、効果Bは無視される
```

### 5.2 複数グループが存在する場合

```
グループが異なれば各グループで最強1つが有効。

例：
  グループFunnelUp:
    - 効果A: power=3  ← 選出
    - 効果B: power=2
  
  グループFunnelBoost:
    - 効果C: power=5  ← 別グループなので選出
    - 効果D: power=1
  
判定結果:
  → 効果A（FunnelUp最強）+ 効果C（FunnelBoost最強）の2つが同時に有効
```

### 5.3 Only型の消費判定

```
Only型バフが複数あるとき:
  - resolveEffectiveStatusEffects() で競合判定の後、最強1つ選出
  - shouldConsume() は全効果に対して呼び出し側で実施
  - 呼び出し側で「選出された効果」のみをフィルタして消費
```

---

## 6. 特殊なバフ消費ルール

### 6.1 速弾き (Shredding) 状態での消費

```
speed弾き中は SP の下限が -30 に設定されるが、
バフの消費ルール自体は変わらない。

影響を受ける: Count型バフの「与ダメージスキル実行」判定
影響を受けない: ターン型バフ、Eternal型バフ
```

### 6.2 強化状態 (ReinforcedMode) での消費

```
強化状態中に生成された Funnel バフ:
  - exitCond: Count（変わらず）
  - 消費ルール: 通常と同じ

強化状態が終了すると:
  1. 付属の Funnel / MindEye バフは削除（PlayerTurnEnd型と同じ）
  2. その他のバフは継続
```

### 6.3 行動不可状態での消費

```
actionDisabledTurns > 0 の場合:
  - スキル実行: getActionSkills() が [NoAction] のみ返す
  - NoAction スキルは非ダメージ
  - したがって Count型バフは消費されない
```

---

## 7. 消費流程フロー（統一化後の期待値）

### Before: 現在（分散）

```
Skill実行
  ├─ Funnel判定
  │  ├─ resolveFunnelCompetitionForAction()
  │  ├─ consumeSelectedCountStatusEffects()
  │  └─ tickStatusEffectsWhere()
  │
  ├─ MindEye判定
  │  ├─ resolveMindEyeCompetitionForAction()
  │  ├─ consumeSelectedCountStatusEffects()
  │  └─ tickStatusEffectsWhere()
  │
  └─ (その他バフは非消費)
```

### After: 統一化後

```
Skill実行
  ↓
actionContext 構築
  ↓
党バフに対して forEach:
  ↓
shouldConsume(effect, actionContext) 呼び出し
  ├─ exitCond と actionType マッチング
  ├─ limitType による競合判定（Only型）
  └─ remaining デクリメント ← 一元化
```

---

## 8. テスト網羅チェックリスト

### Unit Test: shouldConsume() の判定正確性

```
[ ] Count型 + NormalAttack → shouldConsume = true
[ ] Count型 + Skill(hasDamage=true) → shouldConsume = true
[ ] Count型 + Skill(hasDamage=false) → shouldConsume = false
[ ] Count型 + Pursuit → shouldConsume = true
[ ] Count型 + AdditionalTurn(hasDamage=true) → shouldConsume = true
[ ] Count型 + TurnEnd → shouldConsume = false
[ ] Count型 + Manual → shouldConsume = true

[ ] PlayerTurnEnd + TurnEnd(PlayerTurnEnd phase) → shouldConsume = true
[ ] PlayerTurnEnd + Skill → shouldConsume = false
[ ] PlayerTurnEnd + TurnEnd(EnemyTurnEnd phase) → shouldConsume = false

[ ] EnemyTurnEnd + TurnEnd(EnemyTurnEnd phase) → shouldConsume = true
[ ] EnemyTurnEnd + Skill → shouldConsume = false

[ ] Eternal + Manual → shouldConsume = true
[ ] Eternal + NormalAttack → shouldConsume = false
[ ] Eternal + TurnEnd → shouldConsume = false

[ ] Only型Funnel競合 → resolveEffectiveStatusEffects で最強1つ選出
[ ] Only型MindEye競合 → resolveEffectiveStatusEffects で最強1つ選出
```

### Integration Test: turn-controller での実際の動作

```
[ ] 通常攻撃でFunnelが消費される
[ ] ダメージスキルでMindEyeが消費される
[ ] 非ダメージスキルではCount型バフが消費されない
[ ] プレイヤーターン終了でPlayerTurnEnd型が消費される
[ ] 敵ターン終了でEnemyTurnEnd型が消費される
[ ] Eternal型バフは手動でのみ削除される
[ ] 複数のOnly型Funnelがあるとき最強1つだけ消費される
```

---

## 9. 定義の統一性チェック

### 用語の厳密な定義

| 用語 | 定義 | 例 |
|-----|------|-----|
| **トリガー** | バフが消費される条件のタイムポイント | DamageDealt, TurnEnd, Manual |
| **消費** | remaining をデクリメント または 削除 | remaining-- → 0で削除 |
| **有効（Active）** | remaining > 0 (Eternal除く) | Active → UI表示、効果発揮 |
| **競合（Conflict）** | 複数バフが同じ枠を求める状態 | Only型が複数存在 |
| **選出（Selection）** | 複数候補から有効バフを決定 | Only型で最強1つ選出 |

---

## 10. 今後の拡張可能性

###新しいトリガーの追加例

```typescript
// 将来の新バフ種別
interface FutureBuffPattern {
  consumeTrigger: 'BreakDealt'      // Break状態を与えたとき
                | 'HealingDealt'    // 回復を与えたとき
                | 'StatusRemoved'   // ステータス削除時
                | 'CriticalHit'     // クリティカル発生時
}
```

すべて `shouldConsume()` に判定ロジックを追加するだけで対応可能。

