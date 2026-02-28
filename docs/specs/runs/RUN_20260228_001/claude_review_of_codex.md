[HANDSHAKE] provider=claude model=claude-sonnet-4-6 session=n/a ts=2026-02-28T00:05:00Z

# Codex キャラクタークラス設計 レビュー

**レビュアー**: Claude（行動記録システム担当）
**対象**: codex_character_class_design.md
**RUN**: RUN_20260228_001

---

## 1. agreed_v1 (R1-R10) との整合確認

### [MINOR] partySlot vs position の二重管理
Codex設計では `partySlot: 0|1|2|3|4|5`（不変）と `position: 0|1|2|3|4|5`（可変）を両方保持している。
`partySlot` は「初期割り当てスロット番号」を意図しているが、agreed_v1 では `positionMap` によるポジション管理を踏襲している。
現行実装（globals.js）の `positionMap` との対応が不明確。

**提案**:
```typescript
interface CharacterState {
  readonly partyIndex: 0 | 1 | 2 | 3 | 4 | 5; // 不変: 初期パーティーインデックス
  position: 0 | 1 | 2 | 3 | 4 | 5;            // 可変: 現在のポジション（交代で変化）
}
```
`partyIndex` と `position` の意味を明示的に分離し、positionMapとの対応を文書化する。

---

## 2. 行動記録システムとのインターフェース確認

### [MAJOR] CharacterStateChangedEvent.turnId の型不一致
Codex設計の `CharacterStateChangedEvent`:
```typescript
{ type: "character.state.changed"; sequenceId: number; turnId: number; ... }
```
agreed_v1 では `TurnRecord.turnId = sequenceId`（R7確定）。
`turnId` と `sequenceId` が両方フィールドに存在すると冗長かつ混乱の原因。

**提案**: `turnId` を削除し `sequenceId` のみ残す:
```typescript
type CharacterStateChangedEvent = {
  type: "character.state.changed";
  sequenceId: number;  // = turnId (R7確定)
  characterId: string;
  before: ...; after: ...; reason: ...; spSource?: ...; at: string;
};
```

### [SUGGESTION] CharacterSnapshot の定義が欠如
行動記録システムは `CharacterSnapshot`（ターン前後の不変スナップショット）を中核として使用するが、
Codex設計には `CharacterState` のみで `CharacterSnapshot` 型が定義されていない。
RecordAssembler.fromSnapshot() への入力型として必要。

**提案**: CharacterState とは別に CharacterSnapshot を定義する:
```typescript
type CharacterSnapshot = Readonly<{
  characterId: string;
  characterName: string;
  positionIndex: number;
  isFront: boolean;
  sp: Readonly<SpState>;
  isAlive: boolean;
  isBreak: boolean;
  isExtraActive: boolean;
}>;
```

---

## 3. SkillSlot の評価

### [MINOR] spRecoveryCeiling の説明が不足
`spRecoveryCeiling?: number` は省略時 `sp.max` 準拠と記載されているが、agreed_v1 R10確定の eventCeiling体系：
- active通常: `sp.max`
- active拡張（spRecoveryCeiling指定時）: `spRecoveryCeiling`
という2ケースの区別が不明確。

**提案**: JSDocコメントで明示:
```typescript
export interface SkillSlot {
  // ...
  /**
   * このスキルでSP回復する際の上限値。
   * 省略時は sp.max を使用（通常ルール）。
   * 指定時は applySpChange の eventCeiling にこの値を使用（R10確定）。
   */
  spRecoveryCeiling?: number;
}
```

---

## 4. 純粋関数シグネチャの評価

### [MAJOR] clampAfterRecovery と applySpChange の責務重複
Codex設計では両方が定義されているが、agreed_v1 R10確定の SP変動統一関数は:
- `applySpChange(current, delta, min, eventCeiling)` → 単一変動適用
- `clampAfterRecovery(current, delta, min, max, isDuringOD)` → 凍結ルール込みクランプ

この2関数の呼び出し順序と責務が不明確。

**提案**: 呼び出しシーケンスを文書化:
```typescript
// 推奨呼び出し順（R10確定の凍結ルール統一式）:
// 1. applySpChange: delta適用とeventCeiling制限
// 2. clampAfterRecovery: 凍結ルール（current > sp.max なら回復無効）
function applySpChange(current: number, delta: number, min: number, eventCeiling: number): number {
  const raw = current + delta;
  const effectiveCeiling = Math.max(current, eventCeiling); // 凍結ルール統一式
  return Math.max(min, Math.min(raw, effectiveCeiling));
}
```

### [SUGGESTION] swapPosition の戻り値型
```typescript
function swapPosition(party: readonly CharacterState[], a: number, b: number): CharacterState[];
```
純粋関数として設計されているが、`CharacterState[]`（mutable）を返すと呼び出し側が副作用を持てる。
`readonly CharacterState[]` を返すことを推奨。

---

## 5. EffectSlot の評価

### [MINOR] source の列挙値が仮定
Codex設計の `source: "skill" | "passive" | "item" | "system"` は暫定とされているが、
行動記録システムが `EffectSnapshot` に書き込む際に使用するため、
統一された列挙値が早期に確定される必要がある。

**未確定事項として記録（Q-EF1）**: EffectSlot.source の確定値一覧が必要。

---

## 6. 拡張ポイントの評価

### [SUGGESTION] DamageCalculationHook の defender 型
```typescript
export interface DamageCalculationHook {
  calculate(input: {
    attacker: CharacterState;
    defender: CharacterState; // ← 問題
    ...
  }): ...;
}
```
`defender` が `CharacterState`（自キャラの状態）と同じ型というのは将来の拡張で問題になる可能性がある。
敵キャラクターはバトルシミュレータの v1 スコープ外のため、`defender?: CharacterSnapshot | null` として optional にしておくことを推奨。

---

## 7. 依存方向の評価

### [CRITICAL] BattleState の曖昧性
Codex設計のセクション8では:
```
TurnController -> CharacterDomain / RecordAssembler -> TurnController
```
と記述されているが、`BattleState` という集約型が定義されていない。
Gemini設計では `previewTurn(currentState: BattleState, ...)` を使用しており、
`BattleState` = `CharacterState[] + TurnState` の合成型が必要。

**提案**: BattleState を共有型として定義:
```typescript
interface BattleState {
  readonly party: readonly CharacterState[];  // 6人固定
  readonly turnState: TurnState;
  readonly positionMap: readonly [number, number, number, number, number, number];
}
```

---

## 8. レビューサマリー

| 重大度 | 件数 | 内容 |
|--------|------|------|
| [CRITICAL] | 1 | BattleState の共有型定義が欠如 |
| [MAJOR] | 2 | CharacterStateChangedEvent.turnId重複、clampAfterRecovery責務不明確 |
| [MINOR] | 3 | partySlot/position二重管理、spRecoveryCeiling説明不足、EffectSlot.source未確定 |
| [SUGGESTION] | 3 | CharacterSnapshot型欠如、swapPosition戻り値型、DamageCalculationHook.defender |

---

## 9. 新たな未確定事項

| ID | 優先度 | 内容 |
|----|--------|------|
| Q-EF1 | Should | EffectSlot.source の確定値一覧（skill/passive/item/system で確定か） |
| Q-BS1 | Must | BattleState 集約型をどのモジュールが所有するか（CharacterDomainか共有型か） |
