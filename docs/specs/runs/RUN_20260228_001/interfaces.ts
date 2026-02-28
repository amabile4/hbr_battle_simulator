// [HANDSHAKE] provider=claude model=claude-sonnet-4-6 session=n/a ts=2026-02-28T00:14:00Z
// HBR Battle Simulator - 統合 TypeScript インターフェース定義
// RUN: RUN_20260228_001
// 参照: integrated_architecture_spec.md, decision_log.md

// =============================================================================
// 0. 共有プリミティブ型（shared-types.ts に配置: DEC-001）
// =============================================================================

export type TurnType = 'normal' | 'od' | 'extra';
export type ODContext = 'preemptive' | 'interrupt' | null;
export type RecordStatus = 'preview' | 'committed';
export type SpChangeSource = 'cost' | 'base' | 'od' | 'passive' | 'active' | 'clamp';
export type SkillType = 'damage' | 'non_damage';

// =============================================================================
// 1. CharacterDomain（character-state.ts）
// =============================================================================

export interface SpState {
  current: number;   // 可変。負債（マイナス）許可: R10確定
  min: number;       // デフォルト0、特性でマイナス可能
  max: number;       // デフォルト20、特性で25/30拡張可
  bonus: number;     // ターン回復ボーナス（BASE_SP_RECOVERY=2への加算: Q-G1仮採用）
}

export interface SkillSlot {
  skillId: number;
  name: string;
  spCost: number;              // 0..99
  type: SkillType;
  consumeType: string | null;
  maxLevel: number | null;
  /**
   * スキルによるSP回復の上限値（R10確定）。
   * 省略時: sp.max を eventCeiling として使用
   * 指定時: この値を eventCeiling として使用（active拡張ルール）
   */
  spRecoveryCeiling?: number;
}

export interface EffectSlot {
  effectId: string;
  name: string;
  /** Q-EF1: 仮確定値。要ユーザー確認 */
  source: 'skill' | 'passive' | 'item' | 'system';
  durationRemaining: number; // -1 = 永続（v1デフォルト）
  // 将来拡張ポイント（v1未使用）
  stacks?: number;
  tags?: string[];
}

export interface CharacterState {
  // --- 不変フィールド（生成後変更不可）---
  readonly characterId: string;
  readonly characterName: string;
  readonly styleId: number;
  readonly styleName: string;
  /** 初期パーティーインデックス（不変、CSV列固定に使用: DEC-003）*/
  readonly partyIndex: 0 | 1 | 2 | 3 | 4 | 5;
  readonly skills: readonly SkillSlot[];

  // --- 可変フィールド（ターン進行で更新）---
  position: 0 | 1 | 2 | 3 | 4 | 5;  // 現在ポジション（交代で変化）
  sp: SpState;
  isAlive: boolean;
  isBreak: boolean;
  /** extraターンでの行動権限（allowedCharacterIdsと連携）*/
  isExtraActive: boolean;
  effects: EffectSlot[];
}

/**
 * ターン前後のキャラクター状態不変スナップショット（DEC-011）
 * CharacterStateとは独立して定義し、Readonly保証
 */
export type CharacterSnapshot = Readonly<{
  characterId: string;
  characterName: string;
  /** 初期パーティーインデックス（CSV列固定用）*/
  partyIndex: 0 | 1 | 2 | 3 | 4 | 5;
  /** スナップショット時点のポジション */
  positionIndex: 0 | 1 | 2 | 3 | 4 | 5;
  isFront: boolean;
  sp: Readonly<SpState>;
  isAlive: boolean;
  isBreak: boolean;
  isExtraActive: boolean;
}>;

// --- CharacterDomain 純粋関数シグネチャ ---

/**
 * SP変動統一関数（R10確定）
 * 凍結ルール統一式: effectiveCeiling = Math.max(current, eventCeiling)
 * 回復(delta>0)のみ凍結ルール適用。消費(delta<0)は負債許可
 */
export declare function applySpChange(
  current: number,
  delta: number,
  min: number,
  eventCeiling: number
): number;

/**
 * source別 eventCeiling取得（R10確定一覧）
 */
export declare function getEventCeiling(
  source: SpChangeSource,
  spMax: number,
  skillCeiling?: number
): number;

/**
 * 交代可否判定（純粋関数: BattleState依存排除）
 */
export declare function canSwapWith(
  a: CharacterState,
  b: CharacterState,
  isExtraActive: boolean,
  allowedCharacterIds: readonly string[]
): boolean;

/**
 * ポジション交代（イミュータブル: 新配列を返す）
 */
export declare function swapPosition(
  party: readonly CharacterState[],
  posA: number,
  posB: number
): readonly CharacterState[];

// --- CharacterDomain イベント ---

export type CharacterStateChangedEvent = {
  type: 'character.state.changed';
  sequenceId: number; // = turnId（DEC-002: turnIdフィールドを削除）
  characterId: string;
  before: Readonly<Pick<CharacterState, 'position' | 'isAlive' | 'isBreak' | 'isExtraActive' | 'sp'>>;
  after: Readonly<Pick<CharacterState, 'position' | 'isAlive' | 'isBreak' | 'isExtraActive' | 'sp'>>;
  reason: 'skill' | 'recovery' | 'damage' | 'revive' | 'swap' | 'system';
  spSource?: SpChangeSource;
  at: string; // ISO 8601 UTC
};

// --- 拡張ポイント（将来実装: ダメージ計算）---

export interface DamageResult {
  rawDamage: number;
  finalDamage: number;
  isCritical: boolean;
}

export interface DamageCalculationHook {
  calculate(input: {
    attacker: CharacterState;
    /** v1スコープ外: 敵キャラはnull */
    defender: CharacterSnapshot | null;
    skill: SkillSlot;
    turnContext: { sequenceId: number; isDuringOD: boolean };
  }): DamageResult;
}

export interface BuffDebuffResolver {
  resolve(input: {
    target: CharacterState;
    effects: readonly EffectSlot[];
    phase: 'beforeAction' | 'afterAction' | 'turnStart' | 'turnEnd';
  }): {
    spDeltaBonus?: number;
    damageMultiplier?: number;
    flags?: Partial<Pick<CharacterState, 'isBreak' | 'isExtraActive'>>;
  };
}

// =============================================================================
// 2. TurnController（turn-state.ts）
// =============================================================================

export interface ExtraTurnState {
  active: boolean;
  /** 同時並列付与でも1固定（R7確定）*/
  remainingActions: number;
  allowedCharacterIds: string[];
  /** extra権が付与されたターンのturnIndex */
  grantTurnIndex: number;
}

export interface TurnState {
  turnIndex: number;        // 表示用ターン番号（敵ターン遷移で+1）
  sequenceId: number;       // 内部連番（commitTurnごとに+1: R7確定）
  turnType: TurnType;
  /** 表示値（生成はTurnControllerが担当: DEC-003）例: "T1", "OD1-1", "EX" */
  turnLabel: string;

  // OD管理
  /** 0=非OD（DEC-005: odLevel追加）*/
  odLevel: 0 | 1 | 2 | 3;
  remainingOdActions: number;
  odContext: ODContext;
  odSuspended: boolean;     // extra割り込み中はtrue
  /** extra中にODトリガー→extra完了後に発動（R9確定: DEC-010でinterruptとして発動）*/
  odPending: boolean;

  // Extra管理（DEC-004: ExtraTurnState構造化）
  extraTurnState: ExtraTurnState | null;
}

export interface BattleState {
  readonly party: readonly CharacterState[];
  readonly turnState: TurnState;
  readonly positionMap: readonly [number, number, number, number, number, number];
  /** バトル開始時固定（CSV列固定用: DEC-003）*/
  readonly initialParty: readonly CharacterSnapshot[];
}

export interface ActionDict {
  [positionIndex: number]: {
    skillId: number;
    characterId: string;
  };
}

export declare function previewTurn(
  state: BattleState,
  actions: ActionDict,
  enemyAction: string | null
): TurnRecord;

export declare function commitTurn(
  state: BattleState,
  previewRecord: TurnRecord,
  swapEvents: SwapEvent[]
): { nextState: BattleState; committedRecord: TurnRecord };

// =============================================================================
// 3. ActionRecordSystem（record-store.ts）
// =============================================================================

export interface SPChangeEntry {
  source: SpChangeSource;
  delta: number;
  preSP: number;
  postSP: number; // マイナス負債も許可
  eventCeiling: number;
}

export interface ActionEntry {
  characterId: string;
  characterName: string;
  /** 初期パーティーインデックス（CSV列固定: DEC-003）*/
  partyIndex: number;
  positionIndex: number;
  /** extraターン内の行動か（DEC-007: Geminiレビュー提案採用）*/
  isExtraAction: boolean;
  skillId: number;
  skillName: string;
  spCost: number;
  spChanges: SPChangeEntry[];
  startSP: number;
  endSP: number;
  // 将来拡張ポイント（DEC-008）
  damageResult?: DamageResult;
}

export interface SwapEvent {
  swapSequence: number;
  fromPositionIndex: number; // 前衛ポジション(0-2)
  toPositionIndex: number;   // 後衛ポジション(3-5)
  outCharacterId: string;
  outCharacterName: string;
  inCharacterId: string;
  inCharacterName: string;
}

export interface EffectSnapshot {
  characterId: string;
  effects: Array<{
    effectId: string;
    name: string;
    source: string;
    durationRemaining: number;
  }>;
}

export interface TurnRecord {
  /** = sequenceId（DEC-002: turnId=sequenceIdに統一）*/
  turnId: number;
  turnIndex: number;
  turnLabel: string;
  turnType: TurnType;
  recordStatus: RecordStatus;

  odContext: ODContext;
  isExtraTurn: boolean;
  remainingOdActionsAtStart: number;

  /** previewTurn呼び出し直前のスナップショット（Q-CL1仮採用）*/
  snapBefore: CharacterSnapshot[];
  /** commitTurn後のスナップショット（previewではnull可）*/
  snapAfter: CharacterSnapshot[] | null;

  enemyAction: string | null;
  actions: ActionEntry[];
  /** preview・committedの両段階で保持可（DEC-006）*/
  swapEvents: SwapEvent[];
  effectSnapshots: EffectSnapshot[];

  createdAt: string;    // ISO 8601 UTC
  committedAt: string | null;
}

export interface BattleRecordStore {
  records: TurnRecord[];
  nextSequenceId: number;
}

export interface TurnContextInput {
  turnIndex: number;
  turnLabel: string;
  turnType: TurnType;
  odContext: ODContext;
  isExtraTurn: boolean;
  remainingOdActionsAtStart: number;
  enemyAction: string | null;
}

export interface RecordAssembler {
  fromSnapshot(
    snapBefore: CharacterSnapshot[],
    context: TurnContextInput,
    actions: ActionEntry[],
    swapEvents: SwapEvent[],
    sequenceId: number
  ): TurnRecord; // recordStatus='preview'

  commitRecord(
    preview: TurnRecord,
    snapAfter: CharacterSnapshot[],
    swapEvents: SwapEvent[],
    committedAt: string
  ): TurnRecord; // recordStatus='committed'
}

export interface RecordEditor {
  upsertRecord(store: BattleRecordStore, record: TurnRecord): BattleRecordStore;
  deleteRecord(
    store: BattleRecordStore,
    turnId: number,
    opts?: { cascade: boolean }
  ): BattleRecordStore;
  insertBefore(
    store: BattleRecordStore,
    targetTurnId: number,
    record: TurnRecord
  ): BattleRecordStore;
  reindexTurnLabels(store: BattleRecordStore): BattleRecordStore;
}

export interface CsvExporter {
  /**
   * Google Spreadsheet互換CSV生成
   * 列固定: initialPartyのpartyIndex順（DEC-003採用）
   */
  exportToCSV(
    store: BattleRecordStore,
    initialParty: CharacterSnapshot[]
  ): string;
  recordToRow(record: TurnRecord, initialParty: CharacterSnapshot[]): string[];
}

// --- ActionRecordSystem イベント ---

export type RecordCommittedEvent = {
  type: 'record.committed';
  sequenceId: number;
  turnIndex: number;
  turnLabel: string;
  record: TurnRecord;
};

export type RecordDeletedEvent = {
  type: 'record.deleted';
  turnId: number;
  cascadeDeletedIds: number[];
};

export type StoreReindexedEvent = {
  type: 'store.reindexed';
  affectedTurnIds: number[];
};

export type BattleRecordEvent =
  | RecordCommittedEvent
  | RecordDeletedEvent
  | StoreReindexedEvent;
