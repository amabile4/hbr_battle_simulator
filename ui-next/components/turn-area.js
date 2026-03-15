import { TurnRowController } from './turn-row.js';

/**
 * 左ペイン（#turn-area）のターンリスト全体を管理するコントローラー。
 *
 * - Apply → initialize() でターン1の入力行を追加
 * - Commit → commitNextTurn → 次のターン行を追加
 * - 過去ターンのスロット変更 → updateSlot → recalculateFrom → refreshRows
 * - D&D swap → onSlotChange の swapWith フィールドで検知してポジション入れ替え
 */
export class TurnAreaController {
  #root;
  #engineManager;
  #rowControllers = [];

  constructor({ root, engineManager }) {
    this.#root = root;
    this.#engineManager = engineManager;
  }

  /**
   * Apply 後に呼ぶ。ターンリストをリセットしてターン1の入力行を表示する。
   * @param {object} initialState BattleState
   * @param {object} replaySetup  LightweightReplaySetup
   */
  initialize(initialState, replaySetup = {}) {
    this.#engineManager.initialize(initialState, replaySetup);
    this.#root.innerHTML = '';
    this.#rowControllers = [];
    this.#appendInputRow();
  }

  // ---- private ----

  #appendInputRow() {
    const turnIndex = this.#rowControllers.length;
    const rowEl = document.createElement('div');
    this.#root.appendChild(rowEl);

    const row = new TurnRowController({
      root: rowEl,
      turnIndex,
      record: null,
      stateBefore: this.#engineManager.currentState,
      stateAfter: null,
      onSlotChange: (ti, position, action) => this.#handleSlotChange(ti, position, action),
      onCommit: (ti) => this.#handleCommit(ti),
      onNoteChange: (ti, note) => this.#engineManager.updateNote(ti, note),
    });

    row.mount();
    this.#rowControllers.push(row);
  }

  #handleCommit(turnIndex) {
    const row = this.#rowControllers[turnIndex];
    const slotActions = row.getCurrentSlotActions();
    const note = row.getCurrentNote();

    try {
      this.#engineManager.commitNextTurn(slotActions, { note });
    } catch (err) {
      console.error('TurnAreaController: commitNextTurn failed:', err);
      // TODO: エラー表示
      return;
    }

    // 最後のコミット済み行を再描画
    this.#refreshRow(turnIndex);
    // 次のターン入力行を追加
    this.#appendInputRow();
  }

  #handleSlotChange(turnIndex, position, action) {
    if (action.swapWith != null) {
      // D&D によるポジション入れ替え（コミット前行のみ発生）
      this.#handleSwap(turnIndex, position, action.swapWith);
      return;
    }

    // コミット済みターンのスキル変更 → 再計算
    if (turnIndex < this.#engineManager.committedTurnCount) {
      this.#engineManager.updateSlot(turnIndex, position, action);
      this.#refreshRowsFrom(turnIndex);
    }
    // 未コミット行のスキル変更は commitNextTurn 時に収集するため何もしない
  }

  /**
   * 未コミット行でのスロット D&D 入れ替え。
   * stateBefore の party の position を入れ替えて TurnRow を再描画する。
   * （エンジン side effects なし — commit 時に新しい positions として処理される）
   */
  #handleSwap(turnIndex, srcPosition, dstPosition) {
    const state = this.#engineManager.currentState;
    if (!state?.party) return;

    // party の position をメモリ上で入れ替え（state は mutable オブジェクト想定）
    const src = state.party.find((m) => m.position === srcPosition);
    const dst = state.party.find((m) => m.position === dstPosition);
    if (!src || !dst) return;

    src.position = dstPosition;
    dst.position = srcPosition;

    // 未コミット行（最後の行）を再描画
    const lastRow = this.#rowControllers.at(-1);
    lastRow?.update({
      record: null,
      stateBefore: state,
      stateAfter: null,
    });
  }

  /** 指定インデックスのコミット済み行を最新データで再描画 */
  #refreshRow(turnIndex) {
    const row = this.#rowControllers[turnIndex];
    if (!row) return;
    const record = this.#engineManager.computedRecords[turnIndex];
    const stateBefore = turnIndex === 0
      ? this.#engineManager.initialState
      : this.#engineManager.computedStates[turnIndex - 1];
    const stateAfter = this.#engineManager.computedStates[turnIndex];
    row.update({ record, stateBefore, stateAfter });
  }

  /** fromIndex 以降の全行を再描画する */
  #refreshRowsFrom(fromIndex) {
    const committedCount = this.#engineManager.committedTurnCount;
    // コミット済み行（last row 手前まで）を再描画
    for (let i = fromIndex; i < committedCount && i < this.#rowControllers.length - 1; i++) {
      this.#refreshRow(i);
    }
    // 未コミット行（最後の行）の stateBefore を更新
    const lastRow = this.#rowControllers.at(-1);
    lastRow?.update({
      record: null,
      stateBefore: this.#engineManager.currentState,
      stateAfter: null,
    });
  }
}
