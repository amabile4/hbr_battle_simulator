import { TurnRowController } from './turn-row.js';
import { buildPassiveDebugLogRows } from '../utils/passive-debug-log.js';

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
  #onPassiveLogRowsChange;
  #rowControllers = [];
  #simulatorSettings = {};

  constructor({
    root,
    store,
    engineManager,
    onError = null,
    onTurnCommitted = null,
    onPassiveLogRowsChange = null,
  }) {
    this.#root = root;
    this.#store = store;
    this.#engineManager = engineManager;
    this.#onError = onError;
    this.#onTurnCommitted = onTurnCommitted;
    this.#onPassiveLogRowsChange = onPassiveLogRowsChange;
  }

  /**
   * Apply 後に呼ぶ。ターンリストをリセットしてターン1の入力行を表示する。
   * @param {object} initialState BattleState
   * @param {object} replaySetup  LightweightReplaySetup
   * @param {object} simulatorSettings Simulator UI settings
   */
  initialize(initialState, replaySetup = {}, simulatorSettings = {}, validationPolicy = {}) {
    this.#engineManager.initialize(initialState, replaySetup, { validationPolicy });
    this.#simulatorSettings = simulatorSettings;
    this.#root.innerHTML = '';
    this.#rowControllers = [];
    this.#appendInputRow();
    this.#emitPassiveLogRows();
  }

  loadSession(initialState, replayScript, simulatorSettings = {}, validationPolicy = {}) {
    this.#engineManager.loadReplayScript(initialState, replayScript, { validationPolicy });
    this.#simulatorSettings = simulatorSettings;
    this.#root.innerHTML = '';
    this.#rowControllers = [];
    for (let turnIndex = 0; turnIndex < this.#engineManager.committedTurnCount; turnIndex += 1) {
      this.#appendCommittedRow(turnIndex);
    }
    this.#appendInputRow();
    this.#emitPassiveLogRows();
  }

  /**
   * ターン列を保持したまま初期 BattleState を差し替えて全再計算する。
   * Party Setup 変更後の「↺ 設定を反映」に使用。
   * @param {object} newInitialState 新しい初期 BattleState
   * @param {object} simulatorSettings Simulator UI settings
   */
  reinitialize(newInitialState, simulatorSettings = {}) {
    this.#simulatorSettings = simulatorSettings;
    if (this.#engineManager.committedTurnCount === 0) {
      // 記録がなければ通常の initialize と同じ（入力行の stateBefore だけ更新）
      this.#engineManager.recalculateAll(newInitialState);
      this.#refreshInputRow();
      this.#emitPassiveLogRows();
      return;
    }
    this.#engineManager.recalculateAll(newInitialState);
    this.#refreshRowsFrom(0);
    this.#emitPassiveLogRows();
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
      replayTurn: null,
      operations: this.#engineManager.pendingSpecialOperations,
      stateBefore: this.#engineManager.currentState,
      stateAfter: null,
      odState: {
        preemptiveOdLevel: this.#engineManager.pendingPreemptiveOdLevel,
        interruptOdLevel: this.#engineManager.pendingInterruptOdLevel,
        activatablePreemptive: [],
        activatableInterrupt: [],
      },
      operationState: {
        kishinkaStatus: this.#engineManager.getKishinkaStatus(),
        makaiKiheiStatus: this.#engineManager.getMakaiKiheiStatus(),
      },
      simulatorSettings: this.#simulatorSettings,
      onSlotChange: (ti, position, action) => this.#handleSlotChange(ti, position, action),
      onCommit: (ti) => this.#handleCommit(ti),
      onNoteChange: (ti, note) => this.#engineManager.updateNote(ti, note),
      onPreviewRequest: () => this.#handlePreviewRequest(),
      onOdChange: (ti, odType, level) => this.#handleOdChange(ti, odType, level),
      onOperationAdd: (ti, operation) => this.#handleOperationAdd(ti, operation),
      onOperationRemove: (ti, operationIndex) => this.#handleOperationRemove(ti, operationIndex),
      onEnemyCountChange: (ti, enemyCount) => this.#handleEnemyCountChange(ti, enemyCount),
      onActionOutcomeChange: (ti, actionOutcomeOverrides) =>
        this.#handleActionOutcomeChange(ti, actionOutcomeOverrides),
    });

    row.mount();
    this.#rowControllers.push(row);
    // 初期描画後にプレビューを実行して割込OD候補・OD After ゲージを反映
    this.#refreshInputRow();
  }

  #appendCommittedRow(turnIndex) {
    const rowEl = document.createElement('div');
    this.#root.appendChild(rowEl);
    const replayTurn = this.#engineManager.getReplayTurn(turnIndex);
    const row = new TurnRowController({
      root: rowEl,
      store: this.#store,
      turnIndex,
      record: this.#engineManager.computedRecords[turnIndex],
      replayTurn,
      operations: replayTurn?.operations ?? [],
      operationState: null,
      stateBefore: this.#engineManager.getStateBefore(turnIndex),
      stateAfter: this.#engineManager.computedStates[turnIndex],
      simulatorSettings: this.#simulatorSettings,
      onSlotChange: (ti, position, action) => this.#handleSlotChange(ti, position, action),
      onCommit: () => {},
      onNoteChange: (ti, note) => this.#engineManager.updateNote(ti, note),
      onPreviewRequest: () => {},
      onOdChange: () => {},
      onOperationAdd: () => {},
      onOperationRemove: (ti, operationIndex) => this.#handleOperationRemove(ti, operationIndex),
      onEnemyCountChange: (ti, enemyCount) => this.#handleEnemyCountChange(ti, enemyCount),
      onActionOutcomeChange: (ti, actionOutcomeOverrides) =>
        this.#handleActionOutcomeChange(ti, actionOutcomeOverrides),
    });
    row.mount();
    this.#rowControllers.push(row);
  }

  #handleCommit(turnIndex) {
    const row = this.#rowControllers[turnIndex];
    const note = row.getCurrentNote();
    const enemyCount = row.getCurrentEnemyCount();
    const snapshot = this.#engineManager.buildInputRowSnapshot({
      slotActions: row.getCurrentSlotActions(),
      enemyCount,
      actionOutcomeOverrides: row.getCurrentActionOutcomeOverrides(),
    });

    try {
      this.#engineManager.commitNextTurn(snapshot.slotActions, {
        note,
        enemyCount,
        actionOutcomeOverrides: row.getCurrentActionOutcomeOverrides(),
      });
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
    this.#emitPassiveLogRows();
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
      this.#emitPassiveLogRows();
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

    // OD 変更でプレビュー結果（スキル/OD%）が変わるため未コミット行を全再描画
    this.#refreshInputRow();
  }

  #handleOperationAdd(turnIndex, operation) {
    if (turnIndex < this.#engineManager.committedTurnCount) {
      return;
    }
    if (!this.#engineManager.addPendingSpecialOperation(operation)) {
      return;
    }
    this.#refreshInputRow();
  }

  #handleOperationRemove(turnIndex, operationIndex) {
    if (turnIndex < this.#engineManager.committedTurnCount) {
      const replayTurn = this.#engineManager.getReplayTurn(turnIndex);
      if (!replayTurn) {
        return;
      }
      const nextOperations = replayTurn.operations.filter((_, index) => index !== operationIndex);
      this.#engineManager.updateOperations(turnIndex, nextOperations);
      this.#refreshRowsFrom(turnIndex);
      this.#emitPassiveLogRows();
      return;
    }
    if (!this.#engineManager.removePendingSpecialOperation(operationIndex)) {
      return;
    }
    this.#refreshInputRow();
  }

  #handleEnemyCountChange(turnIndex, enemyCount) {
    if (turnIndex >= this.#engineManager.committedTurnCount) {
      return;
    }
    this.#engineManager.updateEnemyCount(turnIndex, enemyCount);
    this.#refreshRowsFrom(turnIndex);
    this.#emitPassiveLogRows();
  }

  #handleActionOutcomeChange(turnIndex, actionOutcomeOverrides) {
    if (turnIndex >= this.#engineManager.committedTurnCount) {
      return;
    }
    this.#engineManager.updateActionOutcomeOverrides(turnIndex, actionOutcomeOverrides);
    this.#refreshRowsFrom(turnIndex);
    this.#emitPassiveLogRows();
  }

  /**
   * 未コミット行のスキル変更によるプレビューリクエスト。
   */
  #handlePreviewRequest() {
    this.#refreshInputRow();
  }

  /**
   * 未コミット行でのスロット D&D 入れ替え。
   */
  #handleSwap(turnIndex, srcPosition, dstPosition) {
    this.#engineManager.swapCurrentPositions(srcPosition, dstPosition);
    this.#refreshInputRow();
  }

  /** 指定インデックスのコミット済み行を最新データで再描画 */
  #refreshRow(turnIndex) {
    const row = this.#rowControllers[turnIndex];
    if (!row) return;
    const record = this.#engineManager.computedRecords[turnIndex];
    const replayTurn = this.#engineManager.getReplayTurn(turnIndex);
    // 鬼神化 operation がある場合は鬼神化適用済み state を返す。
    // これにより SP0 でコミットしたスキルが鬼神化終了後も正しく選択状態を保持する。
    const stateBefore = this.#engineManager.getStateBefore(turnIndex);
    const stateAfter = this.#engineManager.computedStates[turnIndex];
    row.update({
      record,
      replayTurn,
      operations: replayTurn?.operations ?? [],
      operationState: null,
      stateBefore,
      stateAfter,
      simulatorSettings: this.#simulatorSettings,
    });
  }

  /** fromIndex 以降の全行を再描画する */
  #refreshRowsFrom(fromIndex) {
    const committedCount = this.#engineManager.committedTurnCount;
    // コミット済み行（last row 手前まで）を再描画
    for (let i = fromIndex; i < committedCount && i < this.#rowControllers.length - 1; i++) {
      this.#refreshRow(i);
    }
    // 未コミット行（最後の行）を stateBefore + プレビュー結果で更新
    this.#refreshInputRow();
  }

  #refreshInputRow() {
    const lastRow = this.#rowControllers.at(-1);
    if (!lastRow) return;
    const enemyCount = lastRow.getCurrentEnemyCount();
    const snapshot = this.#engineManager.buildInputRowSnapshot({
      slotActions: lastRow.getCurrentSlotActions(),
      enemyCount,
      actionOutcomeOverrides: lastRow.getCurrentActionOutcomeOverrides(),
    });
    lastRow.update({
      record: null,
      replayTurn: null,
      operations: this.#engineManager.pendingSpecialOperations,
      stateBefore: snapshot.stateBefore,
      stateAfter: null,
      previewResourceState: snapshot.previewResourceState,
      odState: {
        preemptiveOdLevel: this.#engineManager.pendingPreemptiveOdLevel,
        interruptOdLevel: this.#engineManager.pendingInterruptOdLevel,
        activatablePreemptive: snapshot.activatablePreemptive,
        activatableInterrupt: snapshot.activatableInterrupt,
      },
      operationState: snapshot.operationState,
      simulatorSettings: this.#simulatorSettings,
    });
    lastRow.updateOdPreview(snapshot.odGaugeAfter);
  }

  #emitPassiveLogRows() {
    if (typeof this.#onPassiveLogRowsChange !== 'function') {
      return;
    }
    this.#onPassiveLogRowsChange(
      buildPassiveDebugLogRows({
        initialState: this.#engineManager.initialState,
        currentState: this.#engineManager.currentState,
        committedRecords: this.#engineManager.computedRecords,
        getStateBefore: (turnIndex) => this.#engineManager.getStateBefore(turnIndex),
      })
    );
  }
}
