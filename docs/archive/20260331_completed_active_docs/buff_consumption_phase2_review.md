# バフ消費オーケストレータ Phase 1-2 実装レビュー

**対象コミット**: `21a01ad` → `6078aa5` (feat(engine): buff consumption orchestrator Phase 1-2 implementation)
**レビュー実施**: 2026-03-30
**ステータス**: ✅ 完了（Phase 2 指摘修正適用済み / Phase 3 統合は別タスク）

---

## 総合評価

| 観点 | 評価 |
|------|------|
| テスト全件 Pass | ✅ 692件 |
| 実際の挙動修正（`tickSpecialStatusCountEffects` ガード） | ✅ 正しい |
| `shouldConsume()` 関数の設計書整合 | ✅ 修正適用済み |
| `buildActionContext()` の hasDamage 検出 | ✅ 修正適用済み |
| Phase 3 統合準備 | ⚠️ 未接続箇所は継続（設計どおり） |

---

## 0. 2026-03-30 対応結果

- ✅ BUG-1 修正: `buildActionContext()` の hasDamage 判定を regex から `OD_DAMAGE_PART_TYPES.has(skillType)` に変更。
- ✅ BUG-2 修正: `shouldConsumeCountType()` に `AdditionalTurn` を追加。
- ✅ BUG-3 修正: `validateBuffMetadata()` の Eternal 検証で `remaining > 0` 条件を除去。
- ✅ テスト追加: `tests/buff-consumption-orchestrator.test.js` を新規作成し、`shouldConsume` / `validateBuffMetadata` / `buildActionContext` を単体検証。
- ✅ ドキュメント整合: `action_context_matrix.md` の Funnel / MindEye 通常攻撃列を ✗ に修正。
- ✅ 追加整理: `shouldConsume()` / `shouldConsumeCountType()` の dead variable と未使用ヘルパーを削除。

---

## 1. 正しく実装されている点

### `tickSpecialStatusCountEffects` のガード追加

```diff
-  member.tickSpecialStatusCountEffects();
+  if (hasDamageForCount && !isNormalOrPursuitForCount) {
+    member.tickSpecialStatusCountEffects();
+  }
```

**評価: 正しい** ✅

BuffCharge(25) / Dodge(122) / ShadowClone(125) 等の `specialStatusTypeId` 付き Count 型バフを
通常攻撃・追撃スキルで消費しないよう修正。

- テスト T06-B: BuffCharge が通常攻撃では消費されず、与ダメージスキルで消費されることを検証
- テスト T06-C: 7種の特殊状態バフ全種について同様の挙動を検証
- MindEye(78) は `MANUAL_CONSUMPTION_SPECIAL_STATUS_TYPE_IDS` に含まれているため当初より除外されており、この変更の直接対象ではない点も整合している

---

## 2. バグ一覧

### BUG-1: `buildActionContext()` の hasDamage 検出 regex が間違い【高】

**ファイル**: `src/turn/turn-controller.js` 〜 `buildActionContext()`

```javascript
// 現在（間違い）
return /^(PhysicalAttack|ElementalAttack|DamageFixedRate|DamageRate|FixedDamage|TokenAttack|FixedHpDamageRateAttack)$/.test(skillType);
```

コードベースの実際の `OD_DAMAGE_PART_TYPES`（`turn-controller.js:43`）:

```
AttackNormal, AttackSkill, DamageRateChangeAttackSkill,
PenetrationCriticalAttack, AttackByOwnDpRate, AttackBySp,
TokenAttack, FixedHpDamageRateAttack
```

regex 内の `PhysicalAttack`・`ElementalAttack`・`DamageFixedRate`・`DamageRate`・`FixedDamage` は
コードベースに存在しない型名。`AttackNormal`・`AttackSkill` が含まれていない。

**影響**: Phase 3 で `buildActionContext()` を統合した際、大半のスキルで `hasDamage=false` と判定され、Count 型バフが一切消費されなくなる。

**修正**: regex を `OD_DAMAGE_PART_TYPES` の実際の値に合わせる（または `OD_DAMAGE_PART_TYPES` を import して使う）。

---

### BUG-2: `shouldConsumeCountType()` が `AdditionalTurn` を未対応【高】

**ファイル**: `src/domain/character-style.js` 〜 `shouldConsumeCountType()`

```javascript
if (['NormalAttack', 'Skill', 'Pursuit'].includes(actionType)) {
```

`action_context_matrix.md` セクション 3.1 の定義:

```
追加ターン | ✓（Count型バフを消費する）
```

`buildActionContext()` の JSDoc にも `'AdditionalTurn'` が有効な actionType として記載されているが、
`shouldConsumeCountType` のリストに含まれていない。

**影響**: Phase 3 統合後、追加ターン中の与ダメージスキルで Count 型バフ（Funnel/MindEye 等）が消費されない。

**修正**: `['NormalAttack', 'Skill', 'Pursuit', 'AdditionalTurn']` に追加する。

---

### BUG-3: `validateBuffMetadata()` の Eternal チェックが機能しない【中】

**ファイル**: `src/domain/character-style.js` 〜 `validateBuffMetadata()`

```javascript
if (exitCond === 'Eternal' && remaining > 0 && limitType !== 'Only') {
  errors.push('Eternal effects should have limitType=Only');
}
```

`buff_consumption_schema.md` のサンプルでは Eternal 型バフの `remaining: 0`。
実際のゲームデータでも Eternal の `remaining` は 0 が設計上の期待値であるため、
`remaining > 0` 条件は実質的に never true になり、バリデーションが機能しない。

**修正**: 条件から `remaining > 0` を除去する。

---

## 3. Dead Code / 未接続の関数

Phase 2 として「実装するが接続しない」設計は理解できるが、下記は Phase 3 前に整理が必要:

| 追加された関数 | 実際に呼ばれているか | 備考 |
|---|---|---|
| `shouldConsume()` (export) | ❌ | import されているが実消費処理では未使用 |
| `validateBuffMetadata()` (export) | ❌ | import されているが呼び出しゼロ |
| `consumeSelectedCountStatusEffectsWithOrchestrator()` | ❌ | 定義のみ、呼び出しゼロ |
| `buildActionContext()` (export) | ❌ | 定義のみ、呼び出しゼロ |

`consumeSelectedCountStatusEffectsWithOrchestrator` は既存の `consumeSelectedCountStatusEffects` への
単純委譲で中身がなく、Phase 3 統合時に本来のロジックを書く必要がある。

---

## 4. Minor: Dead Variables

### `shouldConsumeCountType()` の `effectiveTrigger`

```javascript
const effectiveTrigger = consumeTrigger
  || inferConsumeTriggerFromActionType(actionType, hasDamage);
// ← 以降どこにも使われない
```

`inferConsumeTriggerFromActionType()` の呼び出しを含め完全に dead code。

### 外側 `shouldConsume()` の 3 変数

```javascript
const actionType = String(actionContext.actionType ?? '');
const hasDamage = Boolean(actionContext.hasDamage);
const turnPhase = String(actionContext.turnPhase ?? '');
```

switch 以降はヘルパー関数に全委譲するため未参照。

---

## 5. 設計書との不整合（既存コード）

`action_context_matrix.md` セクション 3.1:

```
Funnel  | ✓ (通常攻撃)
MindEye | ✓ (通常攻撃)
```

しかし既存コード `turn-controller.js:5802` （今回のコミットでは変更なし）:

```javascript
if (hasDamage && consumeStatusEffects && !isNormalAttackSkill(skill) && !isPursuitOnlySkill(skill)) {
  consumedFunnels = consumeSelectedCountStatusEffects(...);
  consumedMindEyes = consumeSelectedCountStatusEffects(...);
}
```

Funnel/MindEye は通常攻撃では消費されない実装になっている。
設計書の「通常攻撃 = ✓」が実態と異なる。

**対処**: `action_context_matrix.md` の Funnel/MindEye 行の「通常攻撃」列を ✗ に修正する。

---

## 6. テストカバレッジ

本レビュー時点で不足していた `shouldConsume()` の単体テストは、
`tests/buff-consumption-orchestrator.test.js` 追加により解消済み。

- Count（NormalAttack / Skill有無ダメ / AdditionalTurn）
- PlayerTurnEnd / Eternal
- `validateBuffMetadata()`（Eternal + remaining=0 ケース）
- `buildActionContext()`（OD_DAMAGE_PART_TYPES 判定）

---

## 7. Phase 3 着手前の必須対応

| 優先度 | 項目 | 担当箇所 | 対応 |
|--------|------|---------|------|
| **必須** | BUG-1: `buildActionContext()` の regex 修正 | `turn-controller.js` | ✅ |
| **必須** | BUG-2: `AdditionalTurn` を `shouldConsumeCountType` に追加 | `character-style.js` | ✅ |
| **推奨** | BUG-3: `validateBuffMetadata()` の Eternal 条件修正 | `character-style.js` | ✅ |
| **推奨** | `shouldConsume()` の単体テスト追加（セクション 8 チェックリスト実装） | `tests/` | ✅ |
| **任意** | `effectiveTrigger` 等の dead variable クリーンアップ | `character-style.js` | ✅ |
| **ドキュメント** | `action_context_matrix.md` の Funnel/MindEye 通常攻撃列を ✗ に修正 | `docs/active/` | ✅ |
