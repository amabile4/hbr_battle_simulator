import { previewTurnRecord, commitTurnRecord } from '../../src/ui/adapter-core.js';
import { resolveEffectiveSkillForAction } from '../../src/turn/turn-controller.js';
import {
  clampEnemyCount,
  DEFAULT_ENEMY_COUNT,
  getOdGaugeRequirement,
} from '../../src/config/battle-defaults.js';
import {
  applyBeforeCommitOperations,
  canActivateKishinka,
  getActivatablePreemptiveOdLevels as resolveActivatablePreemptiveOdLevels,
  MAKAI_KIHEI_MAX_USES,
  TEZUKA_CHARACTER_ID,
  resolveMakaiKiheiAvailability,
} from '../../src/turn/turn-operations.js';
import {
  applyReplayOverrideEntriesToScenarioTurn,
  createEmptyLightweightReplayScript,
  normalizeLightweightReplayScript,
  normalizeLightweightReplayTurn,
  REPLAY_OPERATION_TYPES,
  REPLAY_OVERRIDE_ENTRY_TYPES,
  replayOperationRegistry,
} from '../../src/ui/lightweight-replay-script.js';
import {
  normalizeTurnReplayTarget,
  resolveTurnBreakAttributionMode,
  TURN_BREAK_ATTRIBUTION_MODES,
} from '../utils/turn-targeting.js';
import {
  ACTION_OUTCOME_TYPES,
  buildActionOutcomeOverrideEntry,
  getActionOutcomeOverridesFromOverrideEntries,
  getBreakEnemyIndexesForPosition,
  normalizeActionOutcomeOverrides,
} from '../utils/action-outcome-overrides.js';
import { normalizeValidationPolicy } from '../utils/validation-policy.js';

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
  #validationPolicy = normalizeValidationPolicy();

  get replayScript() { return this.#replayScript; }
  get computedRecords() { return this.#computedRecords; }
  get computedStates() { return this.#computedStates; }
  get initialState() { return this.#initialState; }
  get pendingPreemptiveOdLevel() { return this.#pendingPreemptiveOdLevel; }
  get pendingInterruptOdLevel() { return this.#pendingInterruptOdLevel; }
  get pendingSpecialOperations() {
    return this.#pendingSpecialOperations.map((operation) => structuredClone(operation));
  }
  get validationPolicy() {
    return structuredClone(this.#validationPolicy);
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
      return applyBeforeCommitOperations(
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
  initialize(initialState, replaySetup = {}, options = {}) {
    this.#initialState = initialState;
    this.#replayScript = createEmptyLightweightReplayScript(replaySetup);
    this.#computedStates = [];
    this.#computedRecords = [];
    this.#pendingPreemptiveOdLevel = null;
    this.#pendingInterruptOdLevel = null;
    this.#pendingSpecialOperations = [];
    this.#validationPolicy = normalizeValidationPolicy(options.validationPolicy);
  }

  loadReplayScript(initialState, replayScript = {}, options = {}) {
    this.#initialState = initialState;
    this.#replayScript = normalizeLightweightReplayScript(replayScript);
    this.#computedStates = [];
    this.#computedRecords = [];
    this.#pendingPreemptiveOdLevel = null;
    this.#pendingInterruptOdLevel = null;
    this.#pendingSpecialOperations = [];
    this.#validationPolicy = normalizeValidationPolicy(options.validationPolicy);
    this.recalculateFrom(0);
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
    let state = applyBeforeCommitOperations(
      this.currentState,
      operations,
      { enemyCount }
    );
    const actionOutcomeOverrides = this.#normalizeActionOutcomeOverridesForState(
      state,
      slotActions,
      options.actionOutcomeOverrides,
      enemyCount
    );

    const actions = this.#buildActionsDict(state, slotActions, actionOutcomeOverrides);
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
      state,
      slotActions,
      options.note ?? '',
      operations,
      enemyCount,
      actionOutcomeOverrides
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
      const actionOutcomeOverrides = this.#resolveReplayTurnActionOutcomeOverrides(
        turn,
        enemyCount,
        state,
        slotActions
      );
      this.#replaceReplayOverrideEntry(
        turn,
        REPLAY_OVERRIDE_ENTRY_TYPES.ACTION_OUTCOME_OVERRIDES,
        actionOutcomeOverrides.length > 0 ? actionOutcomeOverrides : null
      );
      try {
        state = applyBeforeCommitOperations(state, turn.operations, { enemyCount });
      } catch (err) {
        console.warn(`TurnEngineManager.recalculateFrom: before-commit operations failed at turn ${i}:`, err.message);
        this.#computedStates.push(state);
        this.#computedRecords.push(null);
        break;
      }

      const actions = this.#buildActionsDict(state, slotActions, actionOutcomeOverrides);

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
      state = applyBeforeCommitOperations(
        state,
        this.#buildPendingBeforeCommitOperations(),
        { enemyCount }
      );
    } catch {
      return null;
    }
    const actionOutcomeOverrides = this.#normalizeActionOutcomeOverridesForState(
      state,
      slotActions,
      options.actionOutcomeOverrides,
      enemyCount
    );

    return this.#previewResolvedTurn(state, slotActions, enemyCount, actionOutcomeOverrides);
  }

  buildInputRowSnapshot({ slotActions = {}, enemyCount = null, actionOutcomeOverrides = [] } = {}) {
    const normalizedEnemyCount = clampEnemyCount(
      enemyCount ?? this.currentState?.turnState?.enemyState?.enemyCount
    );
    let stateBefore = this.currentState;
    try {
      stateBefore = applyBeforeCommitOperations(
        this.currentState,
        this.#buildPendingBeforeCommitOperations(),
        { enemyCount: normalizedEnemyCount }
      );
    } catch {
      stateBefore = this.currentState;
    }

    const resolvedSlotActions = this.#resolveInputRowSlotActions(
      stateBefore,
      slotActions,
      normalizedEnemyCount
    );
    const normalizedActionOutcomeOverrides = this.#normalizeActionOutcomeOverridesForState(
      stateBefore,
      resolvedSlotActions,
      actionOutcomeOverrides,
      normalizedEnemyCount
    );
    const preview = this.#previewResolvedTurn(
      stateBefore,
      resolvedSlotActions,
      normalizedEnemyCount,
      normalizedActionOutcomeOverrides
    );

    return {
      stateBefore,
      slotActions: resolvedSlotActions,
      odGaugeAfter: preview?.odGaugeAfter ?? null,
      activatablePreemptive: resolveActivatablePreemptiveOdLevels(stateBefore),
      activatableInterrupt: preview?.activatableInterrupt ?? [],
      operationState: {
        kishinkaStatus: this.getKishinkaStatus(),
        makaiKiheiStatus: this.getMakaiKiheiStatus(),
      },
    };
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
    return canActivateKishinka(this.currentState);
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
    const availability = resolveMakaiKiheiAvailability(this.currentState);
    if (!availability.availableInState) {
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
      hasYamawaki: availability.hasYamawaki,
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
    const state = applyBeforeCommitOperations(
      this.currentState,
      this.#pendingSpecialOperations,
      { enemyCount }
    );
    return resolveActivatablePreemptiveOdLevels(state);
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

  updateEnemyCount(turnIndex, enemyCount) {
    const turn = this.#replayScript?.turns[turnIndex];
    if (!turn) return;
    const normalizedEnemyCount = clampEnemyCount(enemyCount);
    this.#replaceReplayOverrideEntry(turn, REPLAY_OVERRIDE_ENTRY_TYPES.ENEMY_COUNT, normalizedEnemyCount);
    const stateBefore = this.getStateBefore(turnIndex);
    const slotActions = this.#slotActionsFromReplayTurn(turn);
    const actionOutcomeOverrides = this.#normalizeActionOutcomeOverridesForState(
      stateBefore,
      slotActions,
      this.#resolveReplayTurnActionOutcomeOverrides(turn, normalizedEnemyCount),
      normalizedEnemyCount
    );
    this.#replaceReplayOverrideEntry(
      turn,
      REPLAY_OVERRIDE_ENTRY_TYPES.ACTION_OUTCOME_OVERRIDES,
      actionOutcomeOverrides.length > 0 ? actionOutcomeOverrides : null
    );
    this.recalculateFrom(turnIndex);
  }

  updateActionOutcomeOverrides(turnIndex, actionOutcomeOverrides) {
    const turn = this.#replayScript?.turns[turnIndex];
    if (!turn) return;
    const stateBefore = this.getStateBefore(turnIndex);
    const enemyCount = this.#resolveReplayTurnEnemyCount(turn, stateBefore);
    const slotActions = this.#slotActionsFromReplayTurn(turn);
    const normalized = this.#normalizeActionOutcomeOverridesForState(
      stateBefore,
      slotActions,
      actionOutcomeOverrides,
      enemyCount
    );
    this.#replaceReplayOverrideEntry(
      turn,
      REPLAY_OVERRIDE_ENTRY_TYPES.ACTION_OUTCOME_OVERRIDES,
      normalized.length > 0 ? normalized : null
    );
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
      return applyBeforeCommitOperations(rawBefore, turn.operations, { enemyCount });
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

  #previewResolvedTurn(state, slotActions = {}, enemyCount, actionOutcomeOverrides = []) {
    const actions = this.#buildActionsDict(state, slotActions, actionOutcomeOverrides);
    try {
      const previewRecord = previewTurnRecord(state, actions, null, enemyCount);
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

  #resolveInputRowSlotActions(state, slotActions = {}) {
    const resolvedSlotActions = {};
    for (const [slotKey, action] of Object.entries(slotActions)) {
      if (!action || action.skillId == null) {
        continue;
      }
      const partyIndex = Number(action.partyIndex ?? slotKey);
      const position = Number(action.position);
      const member = Number.isFinite(partyIndex)
        ? state?.party?.find((item) => Number(item?.partyIndex) === partyIndex) ?? null
        : Number.isFinite(position)
          ? state?.party?.find((item) => Number(item?.position) === position) ?? null
          : null;
      if (!member) {
        continue;
      }
      resolvedSlotActions[member.position] = {
        skillId: action.skillId,
        styleId: member.styleId ?? action.styleId ?? null,
        target: normalizeTurnReplayTarget(action.target),
      };
    }
    return resolvedSlotActions;
  }

  #countReplayOperations(operations = [], type) {
    return (Array.isArray(operations) ? operations : []).filter(
      (operation) => String(operation?.type ?? '') === String(type)
    ).length;
  }

  /**
   * GUI の slotActions（position キー）を previewTurn 用 actions dict に変換する。
   * action.styleId が指定されている場合は styleId でメンバーを検索する。
   */
  #buildActionsDict(state, slotActions, actionOutcomeOverrides = []) {
    const actions = {};
    const normalizedEnemyCount = clampEnemyCount(
      state?.turnState?.enemyState?.enemyCount ?? DEFAULT_ENEMY_COUNT
    );
    const normalizedActionOutcomeOverrides = this.#normalizeActionOutcomeOverridesForState(
      state,
      slotActions,
      actionOutcomeOverrides,
      normalizedEnemyCount
    );
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
      const breakEnemyIndexes = getBreakEnemyIndexesForPosition(
        normalizedActionOutcomeOverrides,
        member.position
      );

      actions[member.position] = {
        skillId: action.skillId,
        ...materializedTarget,
        ...(breakEnemyIndexes.length > 0
          ? {
              breakHitCount: breakEnemyIndexes.length,
              manualBreakEnemyIndexes: breakEnemyIndexes,
            }
          : {}),
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
  #buildReplayTurn(
    state,
    slotActions,
    note = '',
    operations = [],
    enemyCount = DEFAULT_ENEMY_COUNT,
    actionOutcomeOverrides = []
  ) {
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
    const normalizedActionOutcomeOverrides = this.#normalizeActionOutcomeOverridesForState(
      state,
      slotActions,
      actionOutcomeOverrides,
      normalizedEnemyCount
    );
    const overrideEntries = [
      {
        type: REPLAY_OVERRIDE_ENTRY_TYPES.ENEMY_COUNT,
        payload: normalizedEnemyCount,
      },
    ];
    const actionOutcomeOverrideEntry = buildActionOutcomeOverrideEntry(
      normalizedActionOutcomeOverrides,
      normalizedEnemyCount
    );
    if (actionOutcomeOverrideEntry) {
      overrideEntries.push(actionOutcomeOverrideEntry);
    }
    return normalizeLightweightReplayTurn({
      turn: state.turnState?.turnIndex ?? null,
      slots,
      note,
      operations,
      overrideEntries,
    });
  }

  #resolveReplayTurnEnemyCount(replayTurn, state) {
    const scenarioTurn = {};
    applyReplayOverrideEntriesToScenarioTurn(replayTurn?.overrideEntries ?? [], scenarioTurn, []);
    return clampEnemyCount(
      scenarioTurn.enemyCount ?? state?.turnState?.enemyState?.enemyCount ?? DEFAULT_ENEMY_COUNT
    );
  }

  #resolveReplayTurnActionOutcomeOverrides(replayTurn, enemyCount, state = null, slotActions = null) {
    const normalized = getActionOutcomeOverridesFromOverrideEntries(
      replayTurn?.overrideEntries ?? [],
      enemyCount
    );
    if (!state || !slotActions) {
      return normalized;
    }
    return this.#normalizeActionOutcomeOverridesForState(
      state,
      slotActions,
      normalized,
      enemyCount
    );
  }

  #replaceReplayOverrideEntry(turn, type, payload) {
    const nextOverrideEntries = (Array.isArray(turn?.overrideEntries) ? turn.overrideEntries : [])
      .filter((entry) => String(entry?.type ?? '') !== String(type))
      .map((entry) => structuredClone(entry));
    const hasPayload =
      payload !== null &&
      payload !== undefined &&
      (!Array.isArray(payload) || payload.length > 0);
    if (hasPayload) {
      nextOverrideEntries.push({
        type,
        payload: structuredClone(payload),
      });
    }
    turn.overrideEntries = nextOverrideEntries;
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

  #normalizeSingleTargetEnemyIndex(targetEnemyIndex, enemyCount) {
    const normalizedEnemyCount = clampEnemyCount(enemyCount);
    const numericTargetEnemyIndex = Number(targetEnemyIndex);
    if (
      Number.isInteger(numericTargetEnemyIndex) &&
      numericTargetEnemyIndex >= 0 &&
      numericTargetEnemyIndex < normalizedEnemyCount
    ) {
      return numericTargetEnemyIndex;
    }
    return 0;
  }

  #normalizeActionOutcomeOverridesForState(state, slotActions = {}, actionOutcomeOverrides = [], enemyCount) {
    const normalizedEnemyCount = clampEnemyCount(
      enemyCount ?? state?.turnState?.enemyState?.enemyCount ?? DEFAULT_ENEMY_COUNT
    );
    const normalizedOverrides = normalizeActionOutcomeOverrides(
      actionOutcomeOverrides,
      normalizedEnemyCount
    );
    if (normalizedOverrides.length === 0) {
      return [];
    }

    const nextOverrides = [];
    for (const override of normalizedOverrides) {
      const position = Number(override?.position);
      if (!Number.isInteger(position)) {
        continue;
      }
      const action = slotActions?.[position];
      if (!action || action.skillId == null) {
        continue;
      }
      const member = action.styleId != null
        ? state?.party?.find((candidate) => candidate.styleId === action.styleId) ?? null
        : state?.party?.find((candidate) => candidate.position === position) ?? null;
      if (!member) {
        continue;
      }
      const skill = member.getSkill(action.skillId);
      if (!skill) {
        continue;
      }

      let effectiveSkill = skill;
      try {
        effectiveSkill = resolveEffectiveSkillForAction(state, member, skill) ?? skill;
      } catch {
        effectiveSkill = skill;
      }
      const breakAttributionMode = resolveTurnBreakAttributionMode({ skill, effectiveSkill });
      if (breakAttributionMode === TURN_BREAK_ATTRIBUTION_MODES.NONE) {
        continue;
      }
      if (breakAttributionMode === TURN_BREAK_ATTRIBUTION_MODES.ALL) {
        nextOverrides.push({
          position,
          outcome: ACTION_OUTCOME_TYPES.BREAK,
          enemyIndexes: [...override.enemyIndexes],
        });
        continue;
      }
      if (override.enemyIndexes.length === 0) {
        continue;
      }
      const materializedTarget = this.#materializeActionTarget(state, action.target);
      nextOverrides.push({
        position,
        outcome: ACTION_OUTCOME_TYPES.BREAK,
        enemyIndexes: [
          this.#normalizeSingleTargetEnemyIndex(
            materializedTarget?.targetEnemyIndex,
            normalizedEnemyCount
          ),
        ],
      });
    }

    return normalizeActionOutcomeOverrides(nextOverrides, normalizedEnemyCount);
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
