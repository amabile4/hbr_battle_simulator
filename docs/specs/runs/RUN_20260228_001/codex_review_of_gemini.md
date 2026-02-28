[HANDSHAKE] provider=codex model=GPT-5-Codex session=n/a ts=2026-02-28T06:01:39Z

## 1. 整合性（`spec_review_state.json` agreed_v1 R1-R10）
- [CRITICAL] **R10違反**: Gemini案 8章の「`current > sp.max` なら `base/od/passive` 回復無効」は、R10確定の「**OD中は凍結ルール適用外（eventCeiling=99）**」と矛盾します。  
- [MAJOR] **R9遷移の誤り**: 図で `extra -> OD_Preemptive (odPending=true)` になっていますが、R9確定は「extra中に成立したODは**interrupt文脈で保留→extra全完了後に発動**」です。  
- [MAJOR] **R7/R8情報不足**: `TurnState` に `odLevel` がなく、OD1/2/3回復量・ラベル生成・検証が不安定です。  
- [MAJOR] **R1/R4/R7不十分**: `TurnRecord.turnId = sequenceId`、`recordStatus='committed'` への確定更新、`SwapEvent.swapSequence` が仕様として明示不足。  
- [MINOR] `agreed_v1` 自体に相互矛盾（passive上限なし vs R10の`passive=sp.max`）があるため、最終優先順位（R10優先）を文書化すべきです。  

## 2. CharacterStateとのインターフェース境界
- [MAJOR] `allowedCharacterIds` と `CharacterState.isExtraActive` の責務分担が未定義です（単一情報源がない）。  
- [MAJOR] `previewTurn(actions: ActionDict)` が「前衛3名前提」のままで、extra並列消費（複数権利者）との入力整合が曖昧です。  
- [MINOR] `isAlive/isBreak` をTurn制御がどう参照するか（行動可否/回復対象）が未記載です。  

## 3. 問題点・不足点（要点）
- [CRITICAL] OD凍結ロジックが本文内で自己矛盾（7章と8章）。  
- [MAJOR] `commitTurn(currentState, previewRecord)` で `cost` を再適用する設計だと、実装次第で二重消費リスク。  
- [MAJOR] preemptive/interrupt復帰先を `turnType` だけで持つ設計は脆い（復帰先メタデータ不足）。  
- [MINOR] `TurnState` が拡張しきれておらず、`extraTurnState` 構造体を持たないため連続extra管理が実装依存になる。  

## 4. 修正提案（TypeScript）
```ts
type TurnType = 'normal' | 'od' | 'extra';
type ODContext = 'preemptive' | 'interrupt' | null;

interface ExtraTurnState {
  active: boolean;
  remainingActions: number; // 同時付与でも1固定
  allowedCharacterIds: string[];
  grantTurnIndex: number;
}

interface TurnState {
  turnIndex: number;         // 敵ターン遷移で+1
  sequenceId: number;        // commitごとに+1
  turnType: TurnType;
  turnLabel: string;

  odLevel: 0 | 1 | 2 | 3;
  remainingOdActions: number;
  odContext: ODContext;
  odSuspended: boolean;
  odPending: boolean;

  extraTurnState: ExtraTurnState | null;
}

type SpSource = 'cost' | 'base' | 'od' | 'passive' | 'active' | 'clamp';

function applySpChange(current: number, delta: number, min: number, eventCeiling: number): number {
  if (delta > 0) {
    const effectiveCeiling = Math.max(current, eventCeiling);
    return Math.max(min, Math.min(current + delta, effectiveCeiling));
  }
  return Math.max(min, current + delta);
}

// R10準拠: 凍結は eventCeiling 基準。ODは ceiling=99 なので current>sp.max でも回復可
function eventCeilingOf(source: SpSource, spMax: number, skillCeiling?: number): number {
  if (source === 'cost') return Infinity;
  if (source === 'od') return 99;
  if (source === 'active') return skillCeiling ?? spMax;
  return spMax; // base/passive/clamp
}
```

## 5. 未確定事項（Gemini案に潜む仮定）
- [MAJOR] `odPending` 発火時の `odContext` を何に固定するか（R9では実質`interrupt`）。  
- [MAJOR] `commitTurn` は preview結果を「検証して採用」するのか「再計算する」のか（二重適用防止のため要固定）。  
- [SUGGESTION] turnLabel命名規則（`OD 1-1` 形式など）をテスト可能な関数仕様に落とす。  
- [SUGGESTION] `SwapEvent` は「最終1件のみ」でも `swapSequence=0` を必須化して将来拡張余地を残す。
