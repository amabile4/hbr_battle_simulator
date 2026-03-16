import { previewTurnRecord, commitTurnRecord } from '../../src/ui/adapter-core.js';
import { activateOverdrive } from '../../src/turn/turn-controller.js';
import { getOdGaugeRequirement } from '../../src/config/battle-defaults.js';
import {
  createEmptyLightweightReplayScript,
  normalizeLightweightReplayTurn,
  REPLAY_OPERATION_TYPES,
} from '../../src/ui/lightweight-replay-script.js';

/**
 * LightweightReplayScript を正本として保持し、previewTurn/commitTurn を透過的に管理するクラス。
 *
 * - GUI は position キーのスロット操作だけを渡す
 * - 内部で previewTurn → commitTurn の 2段階を処理する
 * - 過去ターンのスロット変更は recalculateFrom() で該当ターン以降を再計算する
 *
 * ⚠️ 既知の制限（エンジン側修正待ち）:
 *   commitTurn() は nextState = { ...state, party: [...state.party] } という shallow copy を行い、
 *   commitSkillPreview() が CharacterStyle を in-place mutation するため、
 *   全 state が party メンバーの SP 参照を共有する。
 *   結果として「コミット済み行の SP 表示」が常に最新ターン後の値になるバグがある。
 *   → 修正方針: src/records/record-assembler.js で committedRecord に spAtTurnStart を追加する。
 *      詳細: docs/active/ui_next_engine_fix_tasklist.md
 */
export class TurnEngineManager {
  #initialState = null;
  #replayScript = null;
  #computedStates = [];   // [i] = turn i の commit 後 state
  #computedRecords = [];  // [i] = turn i の committedRecord（null = エラーで停止）

  // 未コミット行の OD 予約（commit 時にクリア）
  #pendingPreemptiveOdLevel = null;  // number | null
  #pendingInterruptOdLevel = null;   // number | null

  get replayScript() { return this.#replayScript; }
  get computedRecords() { return this.#computedRecords; }
  get computedStates() { return this.#computedStates; }
  get initialState() { return this.#initialState; }
  get pendingPreemptiveOdLevel() { return this.#pendingPreemptiveOdLevel; }
  get pendingInterruptOdLevel() { return this.#pendingInterruptOdLevel; }

  /** Apply 後に呼ぶ。初期 BattleState と空の ReplayScript を設定する。*/
  get currentState() {
    return this.#computedStates.at(-1) ?? this.#initialState;
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
    let state = this.currentState;

    // 先制OD が pending の場合は commit 前に発動
    const preemptiveLevel = this.#pendingPreemptiveOdLevel;
    if (preemptiveLevel != null) {
      state = activateOverdrive(state, preemptiveLevel, 'preemptive');
    }

    const actions = this.#buildActionsDict(state, slotActions);
    const previewRecord = previewTurnRecord(
      state, actions, options.enemyAction ?? null, options.enemyCount ?? 1
    );

    const interruptLevel = options.interruptOdLevel ?? this.#pendingInterruptOdLevel ?? 0;
    const { nextState, committedRecord } = commitTurnRecord(state, previewRecord, [], {
      interruptOdLevel: interruptLevel,
    });

    // operations を構築してから ReplayTurn を生成
    const operations = [];
    if (preemptiveLevel != null) {
      operations.push({ type: REPLAY_OPERATION_TYPES.ACTIVATE_PREEMPTIVE_OD, payload: { level: preemptiveLevel } });
    }
    if (this.#pendingInterruptOdLevel != null) {
      operations.push({ type: REPLAY_OPERATION_TYPES.RESERVE_INTERRUPT_OD, payload: { level: this.#pendingInterruptOdLevel } });
    }

    // slotActions は currentState（先制OD 適用前）の position を基準に記録
    const replayTurn = this.#buildReplayTurn(
      this.currentState, slotActions, options.note ?? '', operations
    );
    this.#replayScript.turns.push(replayTurn);
    this.#computedStates.push(nextState);
    this.#computedRecords.push(committedRecord);

    // pending をリセット
    this.#pendingPreemptiveOdLevel = null;
    this.#pendingInterruptOdLevel = null;

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

    const baseState = fromIndex === 0
      ? this.#initialState
      : this.#computedStates[fromIndex - 1];

    let state = baseState;
    const turns = this.#replayScript.turns;

    for (let i = fromIndex; i < turns.length; i++) {
      const turn = turns[i];
      const slotActions = this.#slotActionsFromReplayTurn(turn);

      // 先制OD operation を再現
      const preemptiveLevel = this.#extractOperationLevel(
        turn.operations, REPLAY_OPERATION_TYPES.ACTIVATE_PREEMPTIVE_OD
      );
      if (preemptiveLevel != null) {
        try {
          state = activateOverdrive(state, preemptiveLevel, 'preemptive');
        } catch (err) {
          console.warn(`TurnEngineManager.recalculateFrom: activateOverdrive failed at turn ${i}:`, err.message);
          this.#computedStates.push(state);
          this.#computedRecords.push(null);
          break;
        }
      }

      const actions = this.#buildActionsDict(state, slotActions);

      // 割込OD operation を再現
      const interruptLevel = this.#extractOperationLevel(
        turn.operations, REPLAY_OPERATION_TYPES.RESERVE_INTERRUPT_OD
      );

      try {
        const previewRecord = previewTurnRecord(state, actions, null, 1);
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
  previewCurrentTurn(slotActions = {}) {
    let state = this.currentState;

    // 先制OD が pending の場合は発動後の state でプレビュー
    if (this.#pendingPreemptiveOdLevel != null) {
      try {
        state = activateOverdrive(state, this.#pendingPreemptiveOdLevel, 'preemptive');
      } catch {
        return null;
      }
    }

    const actions = this.#buildActionsDict(state, slotActions);
    try {
      const previewRecord = previewTurnRecord(state, actions, null, 1);
      const odGaugeAfter = Number(previewRecord.projections?.odGaugeAtEnd ?? state.turnState?.odGauge ?? 0);

      // 割込OD 発動可能レベル: 通常ターンのみ判定（OD中・EX中は不可）
      const isTurnNormal = String(state.turnState?.turnType ?? '') === 'normal';
      const activatableInterrupt = isTurnNormal
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

  /**
   * 現在 state で発動可能な先制OD レベル一覧を返す。
   * 通常ターン以外（OD中・EX中）は常に空配列。
   * @returns {number[]} 発動可能なレベルのリスト（例: [1, 2]）
   */
  getActivatablePreemptiveOdLevels() {
    const state = this.currentState;
    const gauge = Number(state?.turnState?.odGauge ?? 0);
    const turnType = String(state?.turnState?.turnType ?? '');
    if (turnType !== 'normal') return [];
    return [1, 2, 3].filter((level) => gauge >= getOdGaugeRequirement(level));
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

  // ---- private ----

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

      actions[member.position] = {
        skillId: action.skillId,
        ...(action.target != null ? { target: action.target } : {}),
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
          ...(slot.target != null ? { target: slot.target } : {}),
        };
      }
    });
    return slotActions;
  }

  /** commit 時点の state + slotActions から LightweightReplayTurn を生成する */
  #buildReplayTurn(state, slotActions, note = '', operations = []) {
    const slots = Array.from({ length: 6 }, (_, position) => {
      const member = state.party.find((m) => m.position === position);
      const action = slotActions[position];
      return {
        styleId: member?.styleId ?? null,
        skillId: action?.skillId ?? null,
        ...(action?.target != null ? { target: action.target } : {}),
      };
    });
    return normalizeLightweightReplayTurn({
      turn: state.turnState?.turnIndex ?? null,
      slots,
      note,
      operations,
    });
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
}
