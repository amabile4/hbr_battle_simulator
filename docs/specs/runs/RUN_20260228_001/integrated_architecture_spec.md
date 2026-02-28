[HANDSHAKE] provider=claude model=claude-sonnet-4-6 session=n/a ts=2026-02-28T00:10:00Z

# 統合アーキテクチャ仕様

**RUN**: RUN_20260228_001
**策定**: Claude（リーダー）、Codex・Geminiのレビュー知見を統合
**参照**: codex_character_class_design.md, gemini_turn_control_design.md, claude_action_record_design.md + 全レビュー

---

## 1. システム境界と責務分割

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         HBR Battle Simulator v1                         │
│                                                                          │
│  ┌──────────────────────┐                                                │
│  │  CharacterDomain     │  ← 純粋関数 + イミュータブル型定義             │
│  │  ・CharacterState    │    他システムへ依存しない（最下層）             │
│  │  ・SpState           │                                                │
│  │  ・SkillSlot         │                                                │
│  │  ・EffectSlot        │                                                │
│  │  ・applySpChange()   │                                                │
│  │  ・canSwapWith()     │                                                │
│  └────────┬─────────────┘                                                │
│           │ 参照（read-only）                                             │
│  ┌────────▼─────────────────────────┐                                    │
│  │  TurnController                  │  ← ターン状態機械                  │
│  │  ・TurnState / BattleState       │    CharacterDomainを参照           │
│  │  ・previewTurn()                 │    RecordAssemblerへ書き込む        │
│  │  ・commitTurn()                  │                                    │
│  │  ・OD/extra状態機械             │                                    │
│  └────────┬─────────────────────────┘                                    │
│           │ TurnContextInput + CharacterSnapshot（スナップショット経由）   │
│  ┌────────▼─────────────────────────┐                                    │
│  │  ActionRecordSystem              │  ← 行動記録・編集・CSV出力          │
│  │  ・BattleRecordStore             │    BattleState依存を排除           │
│  │  ・RecordAssembler               │    スナップショット入力のみ受理      │
│  │  ・RecordEditor                  │                                    │
│  │  ・CsvExporter                   │                                    │
│  └────────┬─────────────────────────┘                                    │
│           │ BattleRecordEvent                                             │
│  ┌────────▼─────────────────────────┐                                    │
│  │  UI Layer                        │  ← DOM/表示（既存ResultsManager）  │
│  └──────────────────────────────────┘                                    │
└─────────────────────────────────────────────────────────────────────────┘

依存方向: CharacterDomain → (なし)
         TurnController → CharacterDomain
         ActionRecordSystem → CharacterDomain（型定義のみ）
         UI Layer → ActionRecordSystem, TurnController
```

---

## 2. 共有型定義（全システムが参照）

```typescript
// ========================
// 共有集約型 BattleState
// (Q-BS1解決: TurnControllerが所有、CharacterDomainと共に shared-types.ts に配置)
// ========================
interface BattleState {
  readonly party: readonly CharacterState[];  // [0..5] 固定長6
  readonly turnState: TurnState;
  readonly positionMap: readonly [number, number, number, number, number, number];
  readonly initialParty: readonly CharacterSnapshot[]; // バトル開始時固定（CSV列用）
}
```

---

## 3. CharacterDomain（Codex設計 + Claudeレビュー反映）

```typescript
// ========== SP型 ==========
interface SpState {
  current: number;  // 可変（負債も許可: R10確定）
  min: number;      // 可変（デフォルト0、特性でマイナス可）
  max: number;      // 可変（デフォルト20、特性で25/30拡張可）
  bonus: number;    // 可変（BASE_SP_RECOVERY=2 への加算: Q-G1確定）
}

// ========== スキル ==========
type SkillType = 'damage' | 'non_damage';

interface SkillSlot {
  skillId: number;
  name: string;
  spCost: number;               // 0..99
  type: SkillType;
  consumeType: string | null;
  maxLevel: number | null;
  /**
   * スキルによるSP回復の上限値。省略時は sp.max を使用（通常ルール）。
   * 指定時は eventCeiling にこの値を適用（R10確定）。
   */
  spRecoveryCeiling?: number;
}

// ========== エフェクト（v1=記録のみ）==========
interface EffectSlot {
  effectId: string;
  name: string;
  source: 'skill' | 'passive' | 'system'; // (Q-EF1確定: itemはv1対象外、将来追加)
  durationRemaining: number; // -1 = 永続（v1デフォルト）
  // 将来拡張ポイント（v1は未使用）
  stacks?: number;
  tags?: string[];
}

// ========== キャラクター状態 ==========
interface CharacterState {
  // --- 不変（生成後に変更しない）---
  readonly characterId: string;     // 正規化済みキャラID
  readonly characterName: string;
  readonly styleId: number;
  readonly styleName: string;
  readonly partyIndex: 0|1|2|3|4|5; // 初期パーティーインデックス（不変）
  readonly skills: readonly SkillSlot[];

  // --- 可変（ターン進行で更新）---
  position: 0|1|2|3|4|5;           // 現在のポジション（交代で変化）
  sp: SpState;
  isAlive: boolean;
  isBreak: boolean;
  isExtraActive: boolean;
  effects: EffectSlot[];
}

// ========== キャラクタースナップショット（不変コピー）==========
type CharacterSnapshot = Readonly<{
  characterId: string;
  characterName: string;
  partyIndex: number;               // 初期インデックス（記録・参照用）
  positionIndex: number;            // スナップショット時点のポジション
  isFront: boolean;
  sp: Readonly<SpState>;
  isAlive: boolean;
  isBreak: boolean;
  isExtraActive: boolean;
}>;

// ========== 純粋関数 ==========

/**
 * SP変動統一関数（R10確定）
 * 凍結ルール: effectiveCeiling = Math.max(current, eventCeiling)
 * delta > 0（回復）の場合のみ凍結ルールが適用される
 */
function applySpChange(
  current: number,
  delta: number,
  min: number,
  eventCeiling: number
): number {
  if (delta > 0) {
    const effectiveCeiling = Math.max(current, eventCeiling); // 凍結ルール統一式
    return Math.max(min, Math.min(current + delta, effectiveCeiling));
  }
  return Math.max(min, current + delta); // 消費はceilingなし（負債許可）
}

/**
 * eventCeiling取得（R10確定の一覧）
 */
function getEventCeiling(
  source: SpChangeSource,
  spMax: number,
  skillCeiling?: number
): number {
  switch (source) {
    case 'cost':    return Infinity; // 負債許可
    case 'od':      return 99;       // OD回復は sp.max を無視して最大99
    case 'active':  return skillCeiling ?? spMax;
    default:        return spMax;    // base/passive/clamp
  }
}

/**
 * 交代可否判定（純粋関数: BattleState依存排除）
 */
function canSwapWith(
  a: CharacterState,
  b: CharacterState,
  isExtraActive: boolean,
  allowedCharacterIds: readonly string[]
): boolean;

/**
 * ポジション交代（イミュータブル: 新配列を返す）
 */
function swapPosition(
  party: readonly CharacterState[],
  posA: number,
  posB: number
): readonly CharacterState[];
```

---

## 4. TurnController（Gemini設計 + Codexレビュー反映）

```typescript
// ========== OD ==========
type ODContext = 'preemptive' | 'interrupt' | null;

// ========== ExtraTurnState（Codexレビュー提案採用）==========
interface ExtraTurnState {
  active: boolean;
  remainingActions: number;   // 同時並列付与でも1固定（R7確定）
  allowedCharacterIds: string[];
  grantTurnIndex: number;
}

// ========== TurnState ==========
interface TurnState {
  turnIndex: number;          // 敵ターン遷移で+1（表示用ターン番号）
  sequenceId: number;         // commitTurnごとに+1（単調増加内部連番: R7確定）
  turnType: TurnType;
  turnLabel: string;          // 表示値（"T1", "OD1-1", "EX": 生成はTurnControllerが担当）

  // OD管理
  odLevel: 0 | 1 | 2 | 3;    // 0=非OD (Codexレビューで追加)
  remainingOdActions: number; // OD1=1, OD2=2, OD3=3
  odContext: ODContext;
  odSuspended: boolean;       // extra割り込み中にtrue
  odPending: boolean;         // extra中にODトリガー→extra完了後に発動

  // Extra管理
  extraTurnState: ExtraTurnState | null; // null=extra非活性
}

// ========== previewTurn ==========
interface ActionDict {
  [positionIndex: number]: { skillId: number; characterId: string };
}

/**
 * previewTurn: 純粋関数（副作用なし）
 * BattleStateを受け取り、recordStatus='preview'のTurnRecordを返す
 */
function previewTurn(
  state: BattleState,
  actions: ActionDict,
  enemyAction: string | null
): TurnRecord;

/**
 * commitTurn: ターン確定（新しいBattleStateを返す）
 * SP確定処理順（通常）: cost → base → passive
 * OD回復（source='od'）: OD開始時に一括適用（Q-OD1確定）
 */
function commitTurn(
  state: BattleState,
  previewRecord: TurnRecord,
  swapEvents: SwapEvent[]  // commitTurn時点の最終交代状態
): { nextState: BattleState; committedRecord: TurnRecord };
```

---

## 5. ActionRecordSystem（Claude設計 + Geminiレビュー反映）

```typescript
// ========== SP変動 ==========
type SpChangeSource = 'cost' | 'base' | 'od' | 'passive' | 'active' | 'clamp';

interface SPChangeEntry {
  source: SpChangeSource;
  delta: number;
  preSP: number;
  postSP: number;
  eventCeiling: number;
}

// ========== 行動エントリ ==========
interface ActionEntry {
  characterId: string;
  characterName: string;
  partyIndex: number;          // 初期パーティーインデックス（記録・参照用）
  positionIndex: number;       // 行動時のポジション
  isExtraAction: boolean;      // extraターン内の行動か（Geminiレビュー提案採用）
  skillId: number;
  skillName: string;
  spCost: number;
  spChanges: SPChangeEntry[];
  startSP: number;
  endSP: number;
}

// ========== 交代イベント ==========
interface SwapEvent {
  swapSequence: number;
  fromPositionIndex: number;
  toPositionIndex: number;
  outCharacterId: string;
  outCharacterName: string;
  inCharacterId: string;
  inCharacterName: string;
}

// ========== TurnRecord ==========
type RecordStatus = 'preview' | 'committed';

interface TurnRecord {
  turnId: number;              // = sequenceId（R7確定: turnIdとsequenceIdを統一）
  turnIndex: number;
  turnLabel: string;
  turnType: TurnType;
  recordStatus: RecordStatus;

  odContext: ODContext;
  isExtraTurn: boolean;
  remainingOdActionsAtStart: number;

  // スナップショット（snapBeforeはpreviewTurn呼び出し直前: Q-CL1確定）
  snapBefore: CharacterSnapshot[];
  snapAfter: CharacterSnapshot[];   // committedでのみ有効（previewはnull可）

  enemyAction: string | null;
  actions: ActionEntry[];
  swapEvents: SwapEvent[];          // previewでも保持可（Geminiレビュー採用）
  effectSnapshots: EffectSnapshot[];

  createdAt: string;
  committedAt: string | null;
}

// ========== RecordAssembler ==========
interface TurnContextInput {
  turnIndex: number;
  turnLabel: string;
  turnType: TurnType;
  odContext: ODContext;
  isExtraTurn: boolean;
  remainingOdActionsAtStart: number;
  enemyAction: string | null;
}

interface RecordAssembler {
  fromSnapshot(
    snapBefore: CharacterSnapshot[],
    context: TurnContextInput,
    actions: ActionEntry[],
    swapEvents: SwapEvent[],   // previewでも渡す
    sequenceId: number
  ): TurnRecord;

  commitRecord(
    preview: TurnRecord,
    snapAfter: CharacterSnapshot[],
    swapEvents: SwapEvent[],   // commitTurn時の最終状態で上書き
    committedAt: string
  ): TurnRecord;
}

// ========== RecordEditor（表計算ライク）==========
interface RecordEditor {
  upsertRecord(store: BattleRecordStore, record: TurnRecord): BattleRecordStore;
  deleteRecord(store: BattleRecordStore, turnId: number): BattleRecordStore; // Q-CL2確定: 個別削除のみ
  insertBefore(store: BattleRecordStore, targetTurnId: number, record: TurnRecord): BattleRecordStore;
  reindexTurnLabels(store: BattleRecordStore): BattleRecordStore;
}

// ========== CsvExporter ==========
interface CsvExporter {
  /**
   * Google Spreadsheet互換CSV生成
   * 列固定: ポジション1..6（Q-CSV1確定: 1ターン1行ワイド形式）
   * 先頭列: turnIndex + turnLabel（Q-B2確定）
   */
  exportToCSV(store: BattleRecordStore, initialParty: CharacterSnapshot[]): string;
  recordToRow(record: TurnRecord, initialParty: CharacterSnapshot[]): string[];
}

// CSV列構造:
// [turnIndex, turnLabel, enemyAction,
//  pos1.characterName, pos1.startSP, pos1.action, pos1.endSP,
//  pos2.characterName, pos2.startSP, pos2.action, pos2.endSP,
//  ...,
//  pos6.characterName, pos6.startSP, pos6.action, pos6.endSP]
```

---

## 6. ターン状態遷移（統合）

```mermaid
stateDiagram-v2
    [*] --> Normal

    Normal --> OD_Preemptive : OD発動(行動前)
    Normal --> OD_Interrupt : 行動後OD発動
    Normal --> Extra : extraスキル発動
    Normal --> Normal : commitTurn(敵ターン→次ターン)

    state OD_Preemptive {
        OD_Active --> Extra_Suspended : extraスキル発動(odSuspended=true)
        Extra_Suspended --> OD_Active : extra完了(odSuspended=false)
        OD_Active --> OD_Active : remainingOdActions > 1
        OD_Active --> [*] : remainingOdActions == 0
    }
    OD_Preemptive --> Normal : OD終了(preemptive→自ターン継続)

    state OD_Interrupt {
        OD_Active_Int --> Extra_Suspended_Int : extraスキル発動
        Extra_Suspended_Int --> OD_Active_Int : extra完了
        OD_Active_Int --> [*] : remainingOdActions == 0
    }
    OD_Interrupt --> Normal : OD終了(interrupt→敵ターンへ)

    state Extra {
        Extra_Active --> Extra_Active : 連続extra(allowedIds merge)
        Extra_Active --> OD_Pending : ODトリガー(odPending=true保持)
        OD_Pending --> OD_Pending : 連続extra継続
        OD_Pending --> [*] : 全extra完了
    }
    Extra --> Normal : extra完了(odPending=false)
    Extra --> OD_Interrupt : extra完了(odPending=true→OD発動)
```

---

## 7. SP変動パイプライン（commitTurn内）

```
per キャラクター per ターン:

1. cost:  applySpChange(sp.current, -skill.spCost, sp.min, Infinity)
          → SP負債許可（R10確定）

2. base:  applySpChange(sp.current, BASE_SP_RECOVERY + sp.bonus, sp.min, sp.max)
          → 凍結ルール適用（current > sp.max なら回復無効）

3. passive: applySpChange(sp.current, passiveDelta, sp.min, sp.max)
            → 各キャラのパッシブ効果

OD開始時（一度だけ、全6人）:
- od: applySpChange(sp.current, odRecovery, sp.min, 99)
  → current > 99 の場合も回復可（R10確定のOD例外）
  → Q-OD1確定: 各ODターン後ではなく開始時一括

補足:
- Q-C4確定: OD終了時の追加clampは発生しない（凍結ルール継続のみ）
```

---

## 8. 確定事項（ユーザー回答反映）

| ID | 優先度 | テーマ | 確定内容 | 出典 |
|----|--------|--------|----------|------|
| Q-S001 | Must | ターン確定 | `commitTurn` は `previewRecord` を採用し、SP再計算しない | ユーザー回答 |
| Q-B2 | Should | CSV | `turnIndex` と `turnLabel` を2列で出力 | ユーザー回答 |
| Q-G1 | Should | キャラクター | `sp.bonus` は `BASE_SP_RECOVERY + bonus` 加算 | ユーザー回答 |
| Q-C4 | Should | ターン制御 | OD終了時の追加clampなし（凍結ルール継続） | ユーザー回答 |
| Q-CL1 | Should | 記録 | `snapBefore` はターン開始回復後・選択前 | ユーザー回答 |
| Q-EF1 | Should | エフェクト | v1の `EffectSlot.source` は `skill/passive/system`（`item`は将来追加） | ユーザー回答 |
| Q-OD1 | Should | OD | OD回復はOD開始時に一括適用 | ユーザー回答 |
| Q-CL2 | Could | RecordEditor | `deleteRecord` は個別削除のみ | ユーザー回答 |
| Q-CSV1 | Could | CSV | ポジション1..6固定、1ターン1行ワイド形式 | ユーザー回答 |
| Q-BS1 | Could | 共有型 | `BattleState` は `shared-types.ts` に配置 | ユーザー回答 |
