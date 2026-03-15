import { previewTurnRecord, commitTurnRecord } from '../../src/ui/adapter-core.js';
import {
  createEmptyLightweightReplayScript,
  normalizeLightweightReplayTurn,
} from '../../src/ui/lightweight-replay-script.js';

/**
 * LightweightReplayScript を正本として保持し、previewTurn/commitTurn を透過的に管理するクラス。
 *
 * - GUI は position キーのスロット操作だけを渡す
 * - 内部で previewTurn → commitTurn の 2段階を処理する
 * - 過去ターンのスロット変更は recalculateFrom() で該当ターン以降を再計算する
 */
export class TurnEngineManager {
  #initialState = null;
  #replayScript = null;
  #computedStates = [];   // [i] = turn i の commit 後 state
  #computedRecords = [];  // [i] = turn i の committedRecord（null = エラーで停止）

  get replayScript() { return this.#replayScript; }
  get computedRecords() { return this.#computedRecords; }
  get computedStates() { return this.#computedStates; }
  get initialState() { return this.#initialState; }

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
  }

  /**
   * 現在の最終 state に 1ターン追加してコミットする。
   * @param {Object<number, {skillId: number|null, target?: object}>} slotActions
   *   position キー（0-5）のスキル選択。後衛（3-5）は無視される。
   * @param {object} options
   * @param {number} [options.interruptOdLevel=0]
   * @param {string} [options.note='']
   * @returns {object} committedRecord
   */
  commitNextTurn(slotActions = {}, options = {}) {
    const state = this.currentState;
    const actions = this.#buildActionsDict(state, slotActions);

    const previewRecord = previewTurnRecord(
      state, actions, options.enemyAction ?? null, options.enemyCount ?? 1
    );
    const { nextState, committedRecord } = commitTurnRecord(state, previewRecord, [], {
      interruptOdLevel: options.interruptOdLevel ?? 0,
    });

    const replayTurn = this.#buildReplayTurn(state, slotActions, options.note ?? '');
    this.#replayScript.turns.push(replayTurn);
    this.#computedStates.push(nextState);
    this.#computedRecords.push(committedRecord);

    return committedRecord;
  }

  /**
   * fromIndex ターン以降を再計算する。
   * fromIndex 以降の computedStates / computedRecords を破棄して再実行。
   * @param {number} fromIndex
   */
  recalculateFrom(fromIndex) {
    this.#computedStates.splice(fromIndex);
    this.#computedRecords.splice(fromIndex);

    const baseState = fromIndex === 0
      ? this.#initialState
      : this.#computedStates[fromIndex - 1];

    let state = baseState;
    const turns = this.#replayScript.turns;

    for (let i = fromIndex; i < turns.length; i++) {
      const turn = turns[i];
      const slotActions = this.#slotActionsFromReplayTurn(turn);
      const actions = this.#buildActionsDict(state, slotActions);

      try {
        const previewRecord = previewTurnRecord(state, actions, null, 1);
        const { nextState, committedRecord } = commitTurnRecord(state, previewRecord, [], {
          interruptOdLevel: 0,
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
   * UI コントローラーが state を直接変更しないよう、変更はここに閉じる。
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
   * 後衛（position > 2）と skillId が null のエントリは除外する。
   */
  #buildActionsDict(state, slotActions) {
    const actions = {};
    for (const [posStr, action] of Object.entries(slotActions)) {
      const position = Number(posStr);
      if (!Number.isFinite(position) || position > 2) continue;
      if (action?.skillId == null) continue;
      const member = state.party.find((m) => m.position === position);
      if (!member) continue;
      // getSkill で有効性を確認（無効なら null が返る）
      const skill = member.getSkill(action.skillId);
      if (!skill) continue;
      actions[position] = {
        skillId: action.skillId,
        ...(action.target != null ? { target: action.target } : {}),
      };
    }
    return actions;
  }

  /** ReplayTurn の slots から slotActions を復元する */
  #slotActionsFromReplayTurn(replayTurn) {
    const slotActions = {};
    replayTurn.slots.forEach((slot, position) => {
      if (slot.skillId != null) {
        slotActions[position] = {
          skillId: slot.skillId,
          ...(slot.target != null ? { target: slot.target } : {}),
        };
      }
    });
    return slotActions;
  }

  /** commit 時点の state + slotActions から LightweightReplayTurn を生成する */
  #buildReplayTurn(state, slotActions, note = '') {
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
    });
  }
}
