import { TurnRowController } from './turn-row.js';

/**
 * 左ペイン（#turn-area）のターンリスト全体を管理するコントローラー。
 *
 * - Apply → initialize() でターン1の入力行を追加
 * - Commit → commitNextTurn → 次のターン行を追加
 * - 過去ターンのスロット変更 → updateSlot → recalculateFrom → refreshRows
 * - D&D swap → onSlotChange の swapWith フィールドで検知してポジション入れ替え
 * - OD 操作 → onOdChange で TurnEngineManager の pending フラグを更新
 */
export class TurnAreaController {
  #root;
  #store;
  #engineManager;
  #onError;
  #onTurnCommitted;
  #rowControllers = [];

  constructor({ root, store, engineManager, onError = null, onTurnCommitted = null }) {
    this.#root = root;
    this.#store = store;
    this.#engineManager = engineManager;
    this.#onError = onError;
    this.#onTurnCommitted = onTurnCommitted;
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

  /**
   * ターン列を保持したまま初期 BattleState を差し替えて全再計算する。
   * Party Setup 変更後の「↺ 設定を反映」に使用。
   * @param {object} newInitialState 新しい初期 BattleState
   */
  reinitialize(newInitialState) {
    if (this.#engineManager.committedTurnCount === 0) {
      // 記録がなければ通常の initialize と同じ（入力行の stateBefore だけ更新）
      this.#engineManager.recalculateAll(newInitialState);
      const lastRow = this.#rowControllers.at(-1);
      lastRow?.update({
        record: null,
        stateBefore: this.#engineManager.currentState,
        stateAfter: null,
        odState: this.#buildOdState([]),
      });
      return;
    }
    this.#engineManager.recalculateAll(newInitialState);
    this.#refreshRowsFrom(0);
  }

  // ---- private ----

  #appendInputRow() {
    const turnIndex = this.#rowControllers.length;
    const rowEl = document.createElement('div');
    this.#root.appendChild(rowEl);

    const row = new TurnRowController({
      root: rowEl,
      store: this.#store,
      turnIndex,
      record: null,
      stateBefore: this.#engineManager.currentState,
      stateAfter: null,
      odState: this.#buildOdState([]),
      onSlotChange: (ti, position, action) => this.#handleSlotChange(ti, position, action),
      onCommit: (ti) => this.#handleCommit(ti),
      onNoteChange: (ti, note) => this.#engineManager.updateNote(ti, note),
      onPreviewRequest: (ti, slotActions) => this.#handlePreviewRequest(ti, slotActions),
      onOdChange: (ti, odType, level) => this.#handleOdChange(ti, odType, level),
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
      this.#onError?.(err);
      return;
    }

    // 最後のコミット済み行を再描画
    this.#refreshRow(turnIndex);
    // 次のターン入力行を追加
    this.#appendInputRow();
    // 記録が生まれたことを通知（↺ 設定を反映ボタンの有効化に使用）
    this.#onTurnCommitted?.();
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
   * 未コミット行の OD 操作。
   * TurnEngineManager の pending フラグを更新し、入力行を再描画する。
   * @param {number} turnIndex
   * @param {'preemptive'|'interrupt'} odType
   * @param {number|null} level
   */
  #handleOdChange(turnIndex, odType, level) {
    if (odType === 'preemptive') {
      this.#engineManager.setPendingPreemptiveOd(level);
    } else {
      this.#engineManager.setPendingInterruptOd(level);
    }

    // 先制OD 変更はプレビュー結果（スキル/OD%）が変わるため全再描画
    const lastRow = this.#rowControllers.at(-1);
    const slotActions = lastRow?.getCurrentSlotActions() ?? {};
    const preview = this.#engineManager.previewCurrentTurn(slotActions);

    lastRow?.update({
      record: null,
      stateBefore: this.#engineManager.currentState,
      stateAfter: null,
      odState: this.#buildOdState(preview?.activatableInterrupt ?? []),
    });
    // OD After ゲージを更新
    lastRow?.updateOdPreview(preview?.odGaugeAfter ?? null);
  }

  /**
   * 未コミット行のスキル変更によるプレビューリクエスト。
   * TurnEngineManager に現在ターンをプレビューさせ、OD After 値と割込OD候補を更新する。
   */
  #handlePreviewRequest(turnIndex, slotActions) {
    const preview = this.#engineManager.previewCurrentTurn(slotActions);
    const lastRow = this.#rowControllers.at(-1);
    lastRow?.updateOdPreview(preview?.odGaugeAfter ?? null);
    lastRow?.updateInterruptOdCandidates(preview?.activatableInterrupt ?? []);
  }

  /**
   * 未コミット行でのスロット D&D 入れ替え。
   */
  #handleSwap(turnIndex, srcPosition, dstPosition) {
    this.#engineManager.swapCurrentPositions(srcPosition, dstPosition);
    const lastRow = this.#rowControllers.at(-1);
    const slotActions = lastRow?.getCurrentSlotActions() ?? {};
    const preview = this.#engineManager.previewCurrentTurn(slotActions);
    lastRow?.update({
      record: null,
      stateBefore: this.#engineManager.currentState,
      stateAfter: null,
      odState: this.#buildOdState(preview?.activatableInterrupt ?? []),
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
      odState: this.#buildOdState([]),
    });
  }

  /**
   * 未コミット行に渡す odState を構築する。
   * @param {number[]} activatableInterrupt プレビュー結果から得た割込OD候補（なければ []）
   */
  #buildOdState(activatableInterrupt) {
    return {
      preemptiveOdLevel:    this.#engineManager.pendingPreemptiveOdLevel,
      interruptOdLevel:     this.#engineManager.pendingInterruptOdLevel,
      activatablePreemptive: this.#engineManager.getActivatablePreemptiveOdLevels(),
      activatableInterrupt,
    };
  }
}
