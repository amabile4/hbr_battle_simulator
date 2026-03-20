import { previewTurnRecord, commitTurnRecord } from '../../src/ui/adapter-core.js';
import { activateOverdrive } from '../../src/turn/turn-controller.js';
import {
  clampEnemyCount,
  DEFAULT_ENEMY_COUNT,
  getOdGaugeRequirement,
  REINFORCED_MODE_OD_GAUGE_BONUS,
  OD_GAUGE_MAX_PERCENT,
} from '../../src/config/battle-defaults.js';
import {
  applyReplayOverrideEntriesToScenarioTurn,
  createEmptyLightweightReplayScript,
  normalizeLightweightReplayTurn,
  REPLAY_OPERATION_TYPES,
  REPLAY_OVERRIDE_ENTRY_TYPES,
  replayOperationRegistry,
} from '../../src/ui/lightweight-replay-script.js';
import { normalizeTurnReplayTarget } from '../utils/turn-targeting.js';

// turn-controller.js の TEZUKA_CHARACTER_ID と同値
const TEZUKA_CHARACTER_ID = 'STezuka';
const MAKAI_KIHEI_STYLE_ID = 1003108;
const MAKAI_KIHEI_PASSIVE_LABEL = 'Passive.Machina_Demon';
const MAKAI_KIHEI_SKILL_LABEL = 'BIYamawakiSkill55b';
const MAKAI_KIHEI_MAX_USES = 3;
const MAKAI_KIHEI_DEFAULT_POSITION = 0;

const BEFORE_COMMIT_OPERATION_TYPES = new Set(
  Object.entries(REPLAY_OPERATION_TYPES)
    .filter(([, type]) => replayOperationRegistry.get(type)?.timing === 'beforeCommit')
    .map(([, type]) => type)
);

/**
 * LightweightReplayScript を正本として保持し、previewTurn/commitTurn を透過的に管理するクラス。
 *
 * - GUI は position キーのスロット操作だけを渡す
 * - 内部で previewTurn → commitTurn の 2段階を処理する
 * - 過去ターンのスロット変更は recalculateFrom() で該当ターン以降を再計算する
 *
 * ✅ engine 修正済み（PR #4）:
 *   commitTurn() が party: state.party.map(m => m.clone()) で deep copy するため、
 *   各ターンの CharacterStyle インスタンスは独立している。
 *   recalculateFrom() は #alignPositionsToSlots で各ターンの position を slots から復元する。
 */
export class TurnEngineManager {
  #initialState = null;
  #replayScript = null;
  #computedStates = [];   // [i] = turn i の commit 後 state
  #computedRecords = [];  // [i] = turn i の committedRecord（null = エラーで停止）

  // 未コミット行の OD 予約（commit 時にクリア）
  #pendingPreemptiveOdLevel = null;  // number | null
  #pendingInterruptOdLevel = null;   // number | null
  #pendingSpecialOperations = [];    // ReplayOperation[]

  get replayScript() { return this.#replayScript; }
  get computedRecords() { return this.#computedRecords; }
  get computedStates() { return this.#computedStates; }
  get initialState() { return this.#initialState; }
  get pendingPreemptiveOdLevel() { return this.#pendingPreemptiveOdLevel; }
  get pendingInterruptOdLevel() { return this.#pendingInterruptOdLevel; }
  get pendingSpecialOperations() {
    return this.#pendingSpecialOperations.map((operation) => structuredClone(operation));
  }

  /** Apply 後に呼ぶ。初期 BattleState と空の ReplayScript を設定する。*/
  get currentState() {
    return this.#computedStates.at(-1) ?? this.#initialState;
  }

  /**
   * pending な鬼神化・先制OD を適用した表示用 state を返す（未コミット行のスキルコスト表示用）。
   * 鬼神化 pending 中は isReinforcedMode === true の state を返すため、
   * TurnRowController のスキルコスト計算で SP が 0 表示になる。
   */
  get currentStateWithPending() {
    return this.getCurrentStateWithPending();
  }

  getCurrentStateWithPending(enemyCount = null) {
    try {
      return this.#applyBeforeCommitOperationsToState(
        this.currentState,
        this.#buildPendingBeforeCommitOperations(),
        { enemyCount }
      );
    } catch {
      return this.currentState;
    }
  }

  get committedTurnCount() {
    return this.#replayScript?.turns.length ?? 0;
  }

  /**
   * Apply 後に呼ぶ。初期 BattleState と空の ReplayScript を設定する。
   * @param {object} initialState BattleState
   * @param {object} replaySetup  LightweightReplaySetup（setup のみ）
   */
  initialize(initialState, replaySetup = {}) {
    this.#initialState = initialState;
    this.#replayScript = createEmptyLightweightReplayScript(replaySetup);
    this.#computedStates = [];
    this.#computedRecords = [];
    this.#pendingPreemptiveOdLevel = null;
    this.#pendingInterruptOdLevel = null;
    this.#pendingSpecialOperations = [];
  }

  /**
   * 現在の最終 state に 1ターン追加してコミットする。
   * pending な先制OD があれば commit 前に activateOverdrive を実行する。
   * pending な割込OD があれば interruptOdLevel として commit に渡す。
   * @param {Object<number, {skillId: number|null, target?: object}>} slotActions
   * @param {object} options
   * @param {number} [options.interruptOdLevel=0]
   * @param {string} [options.note='']
   * @returns {object} committedRecord
   */
  commitNextTurn(slotActions = {}, options = {}) {
    const operations = this.#buildCommittedOperations();
    const enemyCount = clampEnemyCount(
      options.enemyCount ?? this.currentState?.turnState?.enemyState?.enemyCount
    );
    let state = this.#applyBeforeCommitOperationsToState(
      this.currentState,
      operations,
      { enemyCount }
    );

    const actions = this.#buildActionsDict(state, slotActions);
    const previewRecord = previewTurnRecord(
      state, actions, options.enemyAction ?? null, enemyCount
    );

    const interruptLevel = options.interruptOdLevel ?? this.#pendingInterruptOdLevel ?? 0;

    // commitTurn は state.party メンバーを in-place 変更する（updateReinforcedModeStateAfterTurn 等）。
    // #applyKishinkaToState や activateOverdrive を経ていない場合、state は computedStates[N-1] の
    // 直接参照となり、commitTurnRecord 後に computedStates[N-1].party が汚染される。
    // getStateBefore(N) = computedStates[N-1] を参照する committed 行の stateBefore が
    // 変異した state を返してしまい、getActionSkills() が誤った結果を返すバグの原因となる。
    // → party をクローンした作業用 state を commitTurnRecord に渡すことで汚染を防ぐ。
    const stateForCommit = { ...state, party: state.party.map((m) => m.clone()) };

    const { nextState, committedRecord } = commitTurnRecord(stateForCommit, previewRecord, [], {
      interruptOdLevel: interruptLevel,
    });

    // slotActions は currentState（先制OD 適用前）の position を基準に記録
    const replayTurn = this.#buildReplayTurn(
      this.currentState, slotActions, options.note ?? '', operations, enemyCount
    );
    this.#replayScript.turns.push(replayTurn);
    this.#computedStates.push(nextState);
    this.#computedRecords.push(committedRecord);

    // pending をリセット
    this.#pendingPreemptiveOdLevel = null;
    this.#pendingInterruptOdLevel = null;
    this.#pendingSpecialOperations = [];

    return committedRecord;
  }

  /**
   * 初期 BattleState を差し替えて全ターンを再計算する。
   * ReplayScript の turns は保持したまま、state だけを更新する。
   * Party Setup 変更後の全再計算に使用。
   * @param {object} newInitialState 新しい初期 BattleState
   */
  recalculateAll(newInitialState) {
    this.#initialState = newInitialState;
    if (this.#replayScript) {
      this.recalculateFrom(0);
    }
  }

  /**
   * fromIndex ターン以降を再計算する。
   * fromIndex 以降の computedStates / computedRecords を破棄して再実行。
   * OD operations（ACTIVATE_PREEMPTIVE_OD / RESERVE_INTERRUPT_OD）も再現する。
   * @param {number} fromIndex
   */
  recalculateFrom(fromIndex) {
    this.#computedStates.splice(fromIndex);
    this.#computedRecords.splice(fromIndex);
    // 過去ターンを再計算するため、未コミット pending は無効化する
    this.#pendingPreemptiveOdLevel = null;
    this.#pendingInterruptOdLevel = null;
    this.#pendingSpecialOperations = [];

    const baseState = fromIndex === 0
      ? this.#initialState
      : this.#computedStates[fromIndex - 1];

    // baseState の party を clone して作業用コピーを作る。
    // #alignPositionsToSlots が position を書き換えるため、permanent state を汚染しないよう独立させる。
    let state = { ...baseState, party: baseState.party.map((m) => m.clone()) };
    const turns = this.#replayScript.turns;

    for (let i = fromIndex; i < turns.length; i++) {
      const turn = turns[i];
      // replayTurn.slots[i].styleId に記録された配置に従い、各メンバーの position を復元する。
      // commitTurnRecord は state.party メンバーを in-place 変更するため、
      // state が computedStates[i-1] を参照している場合は汚染が発生する。
      // → 各イテレーション先頭で party をクローンして作業用コピーを確保する。
      state = { ...state, party: state.party.map((m) => m.clone()) };
      this.#alignPositionsToSlots(state, turn);
      const slotActions = this.#slotActionsFromReplayTurn(turn);
      const enemyCount = this.#resolveReplayTurnEnemyCount(turn, state);
      try {
        state = this.#applyBeforeCommitOperationsToState(state, turn.operations, { enemyCount });
      } catch (err) {
        console.warn(`TurnEngineManager.recalculateFrom: before-commit operations failed at turn ${i}:`, err.message);
        this.#computedStates.push(state);
        this.#computedRecords.push(null);
        break;
      }

      const actions = this.#buildActionsDict(state, slotActions);

      // 割込OD operation を再現
      const interruptLevel = this.#extractOperationLevel(
        turn.operations, REPLAY_OPERATION_TYPES.RESERVE_INTERRUPT_OD
      );

      try {
        const previewRecord = previewTurnRecord(state, actions, null, enemyCount);
        const { nextState, committedRecord } = commitTurnRecord(state, previewRecord, [], {
          interruptOdLevel: interruptLevel ?? 0,
        });
        this.#computedStates.push(nextState);
        this.#computedRecords.push(committedRecord);
        state = nextState;
      } catch (err) {
        // force モード相当: エラーを記録して以降をスキップ
        console.warn(`TurnEngineManager.recalculateFrom: turn ${i} failed:`, err.message);
        this.#computedStates.push(state);
        this.#computedRecords.push(null);
        break;
      }
    }
  }

  /**
   * 未コミット行のスキル選択に基づいて現在ターンをプレビューし、表示用の予測値を返す。
   * pending な先制OD がある場合は activateOverdrive 後の state でプレビューする。
   * state は変更しない。
   *
   * @param {Object<number, {skillId: number|null}>} slotActions position キー
   * @returns {{ odGaugeAfter: number, activatableInterrupt: number[] } | null}
   */
  previewCurrentTurn(slotActions = {}, options = {}) {
    const enemyCount = clampEnemyCount(
      options.enemyCount ?? this.currentState?.turnState?.enemyState?.enemyCount
    );
    let state = this.currentState;
    try {
      state = this.#applyBeforeCommitOperationsToState(
        state,
        this.#buildPendingBeforeCommitOperations(),
        { enemyCount }
      );
    } catch {
      return null;
    }

    const actions = this.#buildActionsDict(state, slotActions);
    try {
      const previewRecord = previewTurnRecord(
        state,
        actions,
        null,
        enemyCount
      );
      const odGaugeAfter = Number(previewRecord.projections?.odGaugeAtEnd ?? state.turnState?.odGauge ?? 0);

      const { canInterrupt } = this.#getOdActivationStatus(state.turnState);
      const activatableInterrupt = canInterrupt
        ? [1, 2, 3].filter((level) => odGaugeAfter >= getOdGaugeRequirement(level))
        : [];

      return { odGaugeAfter, activatableInterrupt };
    } catch {
      return null;
    }
  }

  /**
   * 先制OD の予約を設定/解除する。
   * null で解除。変更後は previewCurrentTurn を呼び直すこと。
   * @param {number|null} level
   */
  setPendingPreemptiveOd(level) {
    this.#pendingPreemptiveOdLevel = level != null ? Number(level) : null;
  }

  /**
   * 割込OD の予約を設定/解除する。
   * null で解除。
   * @param {number|null} level
   */
  setPendingInterruptOd(level) {
    this.#pendingInterruptOdLevel = level != null ? Number(level) : null;
  }

  addPendingSpecialOperation(operation) {
    const normalized = this.#normalizeReplayOperation(operation);
    if (!normalized) {
      return false;
    }
    const definition = replayOperationRegistry.get(normalized.type);
    if (definition?.allowMultiple === false) {
      const alreadyQueued = this.#pendingSpecialOperations.some((entry) => entry?.type === normalized.type);
      if (alreadyQueued) {
        return false;
      }
    }
    if (
      normalized.type === REPLAY_OPERATION_TYPES.ACTIVATE_KISHINKA &&
      !this.isKishinkaAvailable()
    ) {
      return false;
    }
    if (
      normalized.type === REPLAY_OPERATION_TYPES.ACTIVATE_MAKAI_KIHEI &&
      !this.getMakaiKiheiStatus().available
    ) {
      return false;
    }
    this.#pendingSpecialOperations.push(normalized);
    return true;
  }

  removePendingSpecialOperation(index) {
    const numericIndex = Number(index);
    if (!Number.isInteger(numericIndex) || numericIndex < 0 || numericIndex >= this.#pendingSpecialOperations.length) {
      return false;
    }
    this.#pendingSpecialOperations.splice(numericIndex, 1);
    return true;
  }

  /**
   * 現在 state で鬼神化が発動可能かを返す。
   * 手塚咲がパーティにいて、鬼神化中でも行動不能中でもない場合に true。
   * @returns {boolean}
   */
  isKishinkaAvailable() {
    const tezuka = this.currentState?.party?.find((m) => m.characterId === TEZUKA_CHARACTER_ID);
    if (!tezuka) return false;
    return !tezuka.isReinforcedMode && !(Number(tezuka.actionDisabledTurns ?? 0) > 0);
  }

  /**
   * 鬼神化の UI 表示用ステータスを返す。
   * @returns {{ hasTezuka: boolean, available?: boolean, activePending?: boolean, isActive?: boolean, turnsRemaining?: number, actionDisabledTurns?: number }}
   */
  getKishinkaStatus() {
    const tezuka = this.currentState?.party?.find((m) => m.characterId === TEZUKA_CHARACTER_ID);
    if (!tezuka) return { hasTezuka: false };
    return {
      hasTezuka: true,
      available: this.isKishinkaAvailable(),
      activePending: this.#pendingSpecialOperations.some(
        (operation) => operation?.type === REPLAY_OPERATION_TYPES.ACTIVATE_KISHINKA
      ),
      isActive: Boolean(tezuka.isReinforcedMode),
      turnsRemaining: Number(tezuka.reinforcedTurnsRemaining ?? 0),
      actionDisabledTurns: Number(tezuka.actionDisabledTurns ?? 0),
    };
  }

  getMakaiKiheiStatus() {
    const actor = this.currentState?.party?.find((member) => Number(member?.styleId) === MAKAI_KIHEI_STYLE_ID) ?? null;
    if (!actor || !this.#getMakaiKiheiEmbeddedSkill(actor)) {
      return {
        hasYamawaki: false,
        available: false,
        remainingUses: 0,
        pendingCount: 0,
        maxUses: MAKAI_KIHEI_MAX_USES,
      };
    }
    const committedCount = this.#countReplayOperations(
      this.#replayScript?.turns?.flatMap((turn) => turn?.operations ?? []) ?? [],
      REPLAY_OPERATION_TYPES.ACTIVATE_MAKAI_KIHEI
    );
    const pendingCount = this.#countReplayOperations(
      this.#pendingSpecialOperations,
      REPLAY_OPERATION_TYPES.ACTIVATE_MAKAI_KIHEI
    );
    const remainingUses = Math.max(
      0,
      MAKAI_KIHEI_MAX_USES - committedCount - pendingCount
    );
    return {
      hasYamawaki: true,
      available: remainingUses > 0,
      remainingUses,
      pendingCount,
      maxUses: MAKAI_KIHEI_MAX_USES,
    };
  }

  /**
   * 現在 state で発動可能な先制OD レベル一覧を返す。
   * @returns {number[]} 発動可能なレベルのリスト（例: [1, 2]）
   */
  getActivatablePreemptiveOdLevels(enemyCount = null) {
    const state = this.#applyBeforeCommitOperationsToState(
      this.currentState,
      this.#pendingSpecialOperations,
      { enemyCount }
    );
    const gauge = Number(state?.turnState?.odGauge ?? 0);
    const { canPreemptive } = this.#getOdActivationStatus(state?.turnState);
    if (!canPreemptive) return [];
    return [1, 2, 3].filter((level) => gauge >= getOdGaugeRequirement(level));
  }

  /**
   * ターン・OD状態・追加状態の三軸を見て、OD発動が可能な文脈かどうかを判定する。
   *
   * (1) ターン種別 (turnType): 'normal' / 'od' / 'extra'
   * (2) OD状態: odSuspended（EX割込中でOD一時停止）/ odPending（EX後にOD発動予約）
   * (3) 追加状態: extraTurnState（EXターンの行動可能キャラ情報）
   *
   * 先制OD (canPreemptive): 通常ターンかつ OD/EX 文脈でない場合のみ可能
   * 割込OD (canInterrupt) : OD 文脈でなければ可能（単独EXターンは許可）
   *
   * @param {object} turnState
   * @returns {{ canPreemptive: boolean, canInterrupt: boolean }}
   */
  #getOdActivationStatus(turnState) {
    // (1) ターン種別
    const turnType = String(turnState?.turnType ?? '');
    const isOdTurn    = turnType === 'od';
    const isExtraTurn = turnType === 'extra';

    // (2) OD状態: 一時停止中（OD中のEX）/ 発動予約中（EX後にOD）
    const odSuspended = Boolean(turnState?.odSuspended);
    const odPending   = Boolean(turnState?.odPending);

    // (3) 追加状態: EXターンの行動許可情報が存在するか
    const hasExtraState = turnState?.extraTurnState != null;

    // OD文脈: 直接OD中 / OD一時停止中のEX / OD発動待機中のEX
    const inOdContext = isOdTurn || odSuspended || odPending;

    // 追加ターン文脈: turnType または extraTurnState で判定
    const inExtraContext = isExtraTurn || hasExtraState;

    return {
      canPreemptive: !inOdContext && !inExtraContext,
      canInterrupt:  !inOdContext,
    };
  }

  /**
   * 指定ターンのスロットを更新して recalculateFrom を実行する。
   * コミット済みターンの過去編集に使用。
   * @param {number} turnIndex
   * @param {number} position  0-5（前衛 0-2 のみ skillId が有効）
   * @param {{skillId: number|null, target?: object}} action
   */
  updateSlot(turnIndex, position, action) {
    const turn = this.#replayScript?.turns[turnIndex];
    if (!turn) return;
    turn.slots[position] = {
      ...turn.slots[position],
      skillId: action.skillId ?? null,
      ...(action.target != null ? { target: action.target } : {}),
    };
    this.recalculateFrom(turnIndex);
  }

  updateOperations(turnIndex, operations) {
    const turn = this.#replayScript?.turns[turnIndex];
    if (!turn) return;
    turn.operations = (Array.isArray(operations) ? operations : [])
      .map((operation) => this.#normalizeReplayOperation(operation))
      .filter(Boolean);
    this.recalculateFrom(turnIndex);
  }

  getReplayTurn(turnIndex) {
    return this.#replayScript?.turns?.[turnIndex] ?? null;
  }

  /**
   * 未コミット行の入力対象となる現在 state でポジションを入れ替える。
   * D&D によるコミット前のパーティー順変更に使用。
   * @param {number} srcPosition
   * @param {number} dstPosition
   */
  swapCurrentPositions(srcPosition, dstPosition) {
    const state = this.currentState;
    if (!state?.party) return;
    const src = state.party.find((m) => m.position === srcPosition);
    const dst = state.party.find((m) => m.position === dstPosition);
    if (!src || !dst) return;
    src.position = dstPosition;
    dst.position = srcPosition;
  }

  /**
   * ターンのメモを更新する（再計算不要）。
   * @param {number} turnIndex
   * @param {string} note
   */
  updateNote(turnIndex, note) {
    const turn = this.#replayScript?.turns[turnIndex];
    if (turn) turn.note = String(note ?? '');
  }

  /**
   * 指定ターンのコミット済み行に渡す stateBefore を返す。
   * 鬼神化 operation（ACTIVATE_KISHINKA）がある場合は適用済み state を返す。
   * これにより、鬼神化後にコミットした SP0 スキルが再描画時も正しく選択状態を保持する。
   * @param {number} turnIndex 0始まりのターンインデックス
   * @returns {object} BattleState
   */
  getStateBefore(turnIndex) {
    const rawBefore = turnIndex === 0
      ? this.#initialState
      : this.#computedStates[turnIndex - 1];
    const turn = this.#replayScript?.turns?.[turnIndex];
    if (!Array.isArray(turn?.operations) || turn.operations.length === 0) {
      return rawBefore;
    }
    try {
      const enemyCount = this.#resolveReplayTurnEnemyCount(turn, rawBefore);
      return this.#applyBeforeCommitOperationsToState(rawBefore, turn.operations, { enemyCount });
    } catch {
      return rawBefore;
    }
  }

  // ---- private ----

  #normalizeReplayOperation(operation = {}) {
    if (!operation || typeof operation !== 'object') {
      return null;
    }
    const type = String(operation.type ?? '').trim();
    if (!type) {
      return null;
    }
    const normalized = { type };
    const payload = operation.payload && typeof operation.payload === 'object'
      ? structuredClone(operation.payload)
      : {};
    if (Object.keys(payload).length > 0) {
      normalized.payload = payload;
    }
    return normalized;
  }

  #buildPendingBeforeCommitOperations() {
    const operations = this.#pendingSpecialOperations.map((operation) => structuredClone(operation));
    if (this.#pendingPreemptiveOdLevel != null) {
      operations.push({
        type: REPLAY_OPERATION_TYPES.ACTIVATE_PREEMPTIVE_OD,
        payload: { level: this.#pendingPreemptiveOdLevel },
      });
    }
    return operations;
  }

  #buildCommittedOperations() {
    const operations = this.#buildPendingBeforeCommitOperations();
    if (this.#pendingInterruptOdLevel != null) {
      operations.push({
        type: REPLAY_OPERATION_TYPES.RESERVE_INTERRUPT_OD,
        payload: { level: this.#pendingInterruptOdLevel },
      });
    }
    return operations;
  }

  #applyBeforeCommitOperationsToState(state, operations = [], options = {}) {
    let nextState = this.#withEnemyCount(state, options.enemyCount);
    for (const operation of Array.isArray(operations) ? operations : []) {
      const type = String(operation?.type ?? '').trim();
      if (!BEFORE_COMMIT_OPERATION_TYPES.has(type)) {
        continue;
      }
      if (type === REPLAY_OPERATION_TYPES.ACTIVATE_KISHINKA) {
        nextState = this.#applyKishinkaOperation(nextState);
        continue;
      }
      if (type === REPLAY_OPERATION_TYPES.ACTIVATE_MAKAI_KIHEI) {
        nextState = this.#applyMakaiKiheiToState(nextState);
        continue;
      }
      if (type === REPLAY_OPERATION_TYPES.ACTIVATE_PREEMPTIVE_OD) {
        const level = this.#extractOperationLevel([operation], REPLAY_OPERATION_TYPES.ACTIVATE_PREEMPTIVE_OD);
        if (level != null) {
          nextState = activateOverdrive(nextState, level, 'preemptive');
        }
      }
    }
    return nextState;
  }

  #withEnemyCount(state, enemyCount) {
    const normalizedEnemyCount = clampEnemyCount(
      enemyCount ?? state?.turnState?.enemyState?.enemyCount ?? DEFAULT_ENEMY_COUNT
    );
    if (Number(state?.turnState?.enemyState?.enemyCount) === normalizedEnemyCount) {
      return state;
    }
    return {
      ...state,
      turnState: {
        ...state.turnState,
        enemyState: {
          ...state.turnState?.enemyState,
          enemyCount: normalizedEnemyCount,
        },
      },
    };
  }

  #applyKishinkaOperation(state) {
    const tezuka = state?.party?.find((member) => member.characterId === TEZUKA_CHARACTER_ID) ?? null;
    if (!tezuka || tezuka.isReinforcedMode || Number(tezuka.actionDisabledTurns ?? 0) > 0) {
      return state;
    }
    return this.#applyKishinkaToState(state);
  }

  #applyMakaiKiheiToState(state) {
    const actor = state?.party?.find((member) => Number(member?.styleId) === MAKAI_KIHEI_STYLE_ID) ?? null;
    const embeddedSkill = this.#getMakaiKiheiEmbeddedSkill(actor);
    if (!actor || !embeddedSkill) {
      return state;
    }

    const workingState = {
      ...state,
      party: state.party.map((member) => member.clone()),
      turnState: { ...state.turnState },
    };
    const workingActor =
      workingState.party.find((member) => Number(member?.styleId) === MAKAI_KIHEI_STYLE_ID) ?? null;
    if (!workingActor) {
      return state;
    }
    this.#moveActorToFrontForOperationPreview(workingState, workingActor);
    const previewSkill = this.#createEmbeddedPreviewSkill(embeddedSkill);
    workingActor.skills = Object.freeze([...(workingActor.skills ?? []), previewSkill]);

    let previewRecord = null;
    try {
      previewRecord = previewTurnRecord(
        workingState,
        { [workingActor.position]: { skillId: previewSkill.skillId } },
        null,
        clampEnemyCount(state?.turnState?.enemyState?.enemyCount ?? DEFAULT_ENEMY_COUNT)
      );
    } catch {
      return state;
    }
    const odGaugeAfter = Number(previewRecord?.projections?.odGaugeAtEnd ?? state?.turnState?.odGauge ?? 0);
    if (!Number.isFinite(odGaugeAfter)) {
      return state;
    }
    return {
      ...state,
      turnState: {
        ...state.turnState,
        odGauge: Number(odGaugeAfter.toFixed(2)),
      },
    };
  }

  #moveActorToFrontForOperationPreview(state, actor) {
    if (!state?.party || !actor || Number(actor.position) <= 2) {
      return;
    }
    const currentFront = state.party.find((member) => Number(member?.position) === MAKAI_KIHEI_DEFAULT_POSITION) ?? null;
    const originalPosition = Number(actor.position);
    actor.position = MAKAI_KIHEI_DEFAULT_POSITION;
    if (currentFront && currentFront !== actor) {
      currentFront.position = originalPosition;
    }
  }

  #createEmbeddedPreviewSkill(embeddedSkill = {}) {
    return {
      skillId: Number(embeddedSkill.id ?? embeddedSkill.skillId),
      label: String(embeddedSkill.label ?? MAKAI_KIHEI_SKILL_LABEL),
      name: String(embeddedSkill.name ?? '騎兵起動'),
      desc: String(embeddedSkill.desc ?? ''),
      targetType: String(embeddedSkill.target_type ?? embeddedSkill.targetType ?? 'All'),
      spCost: Number(embeddedSkill.sp_cost ?? embeddedSkill.spCost ?? 0),
      sourceType: 'system',
      isPassive: false,
      type: 'damage',
      consumeType: String(embeddedSkill.consume_type ?? embeddedSkill.consumeType ?? 'Sp'),
      hitCount: Number(embeddedSkill.hit_count ?? embeddedSkill.hitCount ?? 0),
      isRestricted: Number(embeddedSkill.is_restricted ?? embeddedSkill.isRestricted ?? 0) === 1,
      hits: Array.isArray(embeddedSkill.hits) ? structuredClone(embeddedSkill.hits) : [],
      maxLevel: embeddedSkill.max_level ?? embeddedSkill.maxLevel ?? null,
      cond: String(embeddedSkill.cond ?? ''),
      iucCond: String(embeddedSkill.iuc_cond ?? embeddedSkill.iucCond ?? ''),
      overwriteCond: String(embeddedSkill.overwrite_cond ?? embeddedSkill.overwriteCond ?? ''),
      effect: String(embeddedSkill.effect ?? ''),
      overwrite: embeddedSkill.overwrite ?? null,
      additionalTurnRule: null,
      parts: Array.isArray(embeddedSkill.parts) ? structuredClone(embeddedSkill.parts) : [],
      passive: null,
    };
  }

  #getMakaiKiheiEmbeddedSkill(actor) {
    const passive = actor?.passives?.find?.((entry) => String(entry?.label ?? '') === MAKAI_KIHEI_PASSIVE_LABEL) ?? null;
    const part = passive?.parts?.find?.((entry) => String(entry?.skill_type ?? '') === 'SpecialCommandCountUp') ?? null;
    const embeddedSkill = part?.strval?.find?.((entry) => entry && typeof entry === 'object' && String(entry.label ?? '') === MAKAI_KIHEI_SKILL_LABEL)
      ?? part?.strval?.find?.((entry) => entry && typeof entry === 'object')
      ?? null;
    return embeddedSkill && typeof embeddedSkill === 'object' ? embeddedSkill : null;
  }

  #countReplayOperations(operations = [], type) {
    return (Array.isArray(operations) ? operations : []).filter(
      (operation) => String(operation?.type ?? '') === String(type)
    ).length;
  }

  /**
   * state の party をクローンし、手塚咲の鬼神化を適用した新しい state を返す。
   * currentState を破壊しないために必ずクローンを使うこと。
   * @param {object} state BattleState
   * @returns {object} 新しい BattleState
   */
  #applyKishinkaToState(state) {
    const clonedParty = state.party.map((m) => m.clone());
    const tezuka = clonedParty.find((m) => m.characterId === TEZUKA_CHARACTER_ID);
    if (!tezuka) return state;
    tezuka.activateReinforcedMode(3);
    const newOdGauge = Math.min(
      OD_GAUGE_MAX_PERCENT,
      Number(state.turnState.odGauge ?? 0) + REINFORCED_MODE_OD_GAUGE_BONUS,
    );
    return {
      ...state,
      party: clonedParty,
      turnState: { ...state.turnState, odGauge: Number(newOdGauge.toFixed(2)) },
    };
  }

  /**
   * GUI の slotActions（position キー）を previewTurn 用 actions dict に変換する。
   * action.styleId が指定されている場合は styleId でメンバーを検索する。
   */
  #buildActionsDict(state, slotActions) {
    const actions = {};
    for (const [posStr, action] of Object.entries(slotActions)) {
      const slotPosition = Number(posStr);
      if (!Number.isFinite(slotPosition)) continue;
      if (action?.skillId == null) continue;

      const member = action.styleId != null
        ? state.party.find((m) => m.styleId === action.styleId)
        : state.party.find((m) => m.position === slotPosition);
      if (!member) continue;

      // 後衛にいるメンバーはスキルを使えない
      if (member.position > 2) continue;

      // EX ターン: allowedCharacterIds に含まれないメンバーのアクションは除外する
      if (state.turnState?.turnType === 'extra') {
        const allowed = state.turnState.extraTurnState?.allowedCharacterIds ?? [];
        if (!allowed.includes(member.characterId)) continue;
      }
      const skill = member.getSkill(action.skillId);
      if (!skill) continue;

      const materializedTarget = this.#materializeActionTarget(state, action.target);

      actions[member.position] = {
        skillId: action.skillId,
        ...materializedTarget,
      };
    }
    return actions;
  }

  /** ReplayTurn の slots から slotActions を復元する。styleId も保持して再計算時の検索に使う */
  #slotActionsFromReplayTurn(replayTurn) {
    const slotActions = {};
    replayTurn.slots.forEach((slot, position) => {
      if (slot?.skillId != null) {
        slotActions[position] = {
          skillId: slot.skillId,
          styleId: slot.styleId ?? null,
          target: normalizeTurnReplayTarget(slot.target),
        };
      }
    });
    return slotActions;
  }

  /** commit 時点の state + slotActions から LightweightReplayTurn を生成する */
  #buildReplayTurn(state, slotActions, note = '', operations = [], enemyCount = DEFAULT_ENEMY_COUNT) {
    const slots = Array.from({ length: 6 }, (_, position) => {
      const member = state.party.find((m) => m.position === position);
      const action = slotActions[position];
      return {
        styleId: member?.styleId ?? null,
        skillId: action?.skillId ?? null,
        ...(action?.target != null ? { target: action.target } : {}),
      };
    });
    const normalizedEnemyCount = clampEnemyCount(enemyCount);
    return normalizeLightweightReplayTurn({
      turn: state.turnState?.turnIndex ?? null,
      slots,
      note,
      operations,
      overrideEntries: [
        {
          type: REPLAY_OVERRIDE_ENTRY_TYPES.ENEMY_COUNT,
          payload: normalizedEnemyCount,
        },
      ],
    });
  }

  #resolveReplayTurnEnemyCount(replayTurn, state) {
    const scenarioTurn = {};
    applyReplayOverrideEntriesToScenarioTurn(replayTurn?.overrideEntries ?? [], scenarioTurn, []);
    return clampEnemyCount(
      scenarioTurn.enemyCount ?? state?.turnState?.enemyState?.enemyCount ?? DEFAULT_ENEMY_COUNT
    );
  }

  #materializeActionTarget(state, target) {
    const normalizedTarget = normalizeTurnReplayTarget(target);
    if (normalizedTarget.type === 'enemy') {
      const enemyIndex = Number(normalizedTarget.enemyIndex);
      if (Number.isFinite(enemyIndex) && enemyIndex >= 0) {
        return { targetEnemyIndex: enemyIndex };
      }
      return {};
    }
    if (normalizedTarget.type === 'ally') {
      const styleId = Number(normalizedTarget.styleId);
      if (Number.isFinite(styleId)) {
        const targetMember =
          state?.party?.find((member) => Number(member?.styleId) === styleId) ?? null;
        if (targetMember?.characterId) {
          return { targetCharacterId: String(targetMember.characterId) };
        }
      }
      const characterId = String(normalizedTarget.characterId ?? '').trim();
      if (characterId) {
        const targetMember =
          state?.party?.find((member) => String(member?.characterId) === characterId) ?? null;
        if (targetMember?.characterId) {
          return { targetCharacterId: String(targetMember.characterId) };
        }
      }
    }
    return {};
  }

  /**
   * ReplayTurn の operations から特定タイプの OD レベルを取り出す。
   * @param {Array} operations
   * @param {string} type REPLAY_OPERATION_TYPES の値
   * @returns {number|null}
   */
  #extractOperationLevel(operations, type) {
    if (!Array.isArray(operations)) return null;
    const op = operations.find((o) => o?.type === type);
    if (!op) return null;
    const level = Number(op.payload?.level ?? op.level);
    return Number.isFinite(level) && level >= 1 && level <= 3 ? level : null;
  }

  /**
   * replayTurn.slots[i].styleId に基づいて state.party の各メンバーの position を復元する。
   * D&D ポジション変更を recalculateFrom で正確に再現するために使用する。
   * commitTurnRecord が party を deep copy するため、この mutation は次のターン以降の state に影響しない。
   * @param {object} state BattleState（作業用コピー）
   * @param {object} replayTurn LightweightReplayTurn
   */
  #alignPositionsToSlots(state, replayTurn) {
    for (let i = 0; i < replayTurn.slots.length; i++) {
      const slot = replayTurn.slots[i];
      if (slot?.styleId == null) continue;
      const member = state.party.find((m) => m.styleId === slot.styleId);
      if (member) member.position = i;
    }
  }
}
