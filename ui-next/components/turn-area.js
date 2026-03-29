import { TurnRowController } from './turn-row.js';
import { buildPassiveDebugLogRows } from '../utils/passive-debug-log.js';
import { REPLAY_OPERATION_TYPES } from '../../src/ui/lightweight-replay-script.js';

function createEmptyRowDiagnostics() {
  return {
    warnings: [],
    error: null,
  };
}

const TURN_REPLAY_STATUS_HIDDEN_CLASS =
  'hidden pointer-events-none fixed left-4 z-40 max-w-sm rounded-lg border px-3 py-2 text-xs font-semibold shadow-md';
const TURN_REPLAY_STATUS_VISIBLE_BASE_CLASS =
  'pointer-events-none fixed left-4 z-40 max-w-sm rounded-lg border px-3 py-2 text-xs font-semibold shadow-md';
const TURN_REPLAY_STATUS_BOTTOM_STYLE = 'max(1rem, env(safe-area-inset-bottom))';

export class TurnAreaController {
  #root;
  #store;
  #engineManager;
  #onError;
  #onTurnCommitted;
  #onPassiveLogRowsChange;
  #rowControllers = [];
  #simulatorSettings = {};
  #statusEl = null;
  #rowsRoot = null;
  #editSession = null;

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

  initialize(initialState, replaySetup = {}, simulatorSettings = {}, validationPolicy = {}) {
    this.#engineManager.initialize(initialState, replaySetup, { validationPolicy });
    this.#simulatorSettings = simulatorSettings;
    this.#editSession = null;
    this.#renderRows();
    this.#emitPassiveLogRows();
  }

  loadSession(initialState, replayScript, simulatorSettings = {}, validationPolicy = {}) {
    this.#engineManager.loadReplayScript(initialState, replayScript, { validationPolicy });
    this.#simulatorSettings = simulatorSettings;
    this.#editSession = null;
    this.#renderRows();
    this.#emitPassiveLogRows();
  }

  reinitialize(newInitialState, simulatorSettings = {}) {
    this.#simulatorSettings = simulatorSettings;
    this.#editSession = null;
    this.#engineManager.recalculateAll(newInitialState);
    this.#renderRows();
    this.#emitPassiveLogRows();
  }

  #ensureScaffold() {
    if (this.#statusEl && this.#rowsRoot) {
      return;
    }
    this.#root.innerHTML = `
      <div data-role="turn-row-list" class="overflow-hidden rounded-xl border border-gray-200 bg-white"></div>
    `;
    this.#rowsRoot = this.#root.querySelector('[data-role="turn-row-list"]');
    this.#statusEl = this.#ensureFloatingStatusHost();
  }

  #ensureFloatingStatusHost() {
    const existing = document.querySelector('[data-role="turn-replay-status"]');
    if (typeof window !== 'undefined' && existing instanceof window.HTMLElement) {
      existing.className = TURN_REPLAY_STATUS_HIDDEN_CLASS;
      existing.textContent = '';
      existing.style.bottom = TURN_REPLAY_STATUS_BOTTOM_STYLE;
      return existing;
    }

    const statusEl = document.createElement('div');
    statusEl.dataset.role = 'turn-replay-status';
    statusEl.className = TURN_REPLAY_STATUS_HIDDEN_CLASS;
    statusEl.style.bottom = TURN_REPLAY_STATUS_BOTTOM_STYLE;
    document.body.appendChild(statusEl);
    return statusEl;
  }

  #clearRows() {
    this.#rowsRoot.innerHTML = '';
    this.#rowControllers = [];
  }

  #renderRows(options = {}) {
    const scrollState = options?.preserveScroll ? this.#captureScrollState() : null;
    this.#ensureScaffold();
    this.#clearRows();

    const replayTurns = this.#engineManager.replayScript?.turns ?? [];
    for (let turnIndex = 0; turnIndex < replayTurns.length; turnIndex += 1) {
      if (this.#editSession?.turnIndex === turnIndex) {
        this.#appendEditRow(turnIndex);
        continue;
      }
      this.#appendCommittedRow(turnIndex);
    }

    if (!this.#editSession && !this.#engineManager.replayDiagnostics.error) {
      this.#appendInputRow();
    }

    this.#renderStatusSummary();
    if (scrollState) {
      this.#restoreScrollState(scrollState);
    }
  }

  #captureScrollState() {
    if (typeof window === 'undefined') {
      return null;
    }
    const elements = [];
    const seen = new Set();
    let node = this.#root;
    while (node && node instanceof window.HTMLElement) {
      const computedStyle =
        typeof window.getComputedStyle === 'function' ? window.getComputedStyle(node) : null;
      const overflowY = String(computedStyle?.overflowY ?? computedStyle?.overflow ?? '');
      const overflowX = String(computedStyle?.overflowX ?? computedStyle?.overflow ?? '');
      const isScrollable =
        /(auto|scroll|overlay)/.test(`${overflowY} ${overflowX}`) ||
        Number(node.scrollTop ?? 0) !== 0 ||
        Number(node.scrollLeft ?? 0) !== 0;
      if (isScrollable && !seen.has(node)) {
        elements.push({
          element: node,
          top: Number(node.scrollTop ?? 0),
          left: Number(node.scrollLeft ?? 0),
        });
        seen.add(node);
      }
      node = node.parentElement;
    }

    const scrollingElement = document.scrollingElement ?? document.documentElement ?? null;
    if (scrollingElement && !seen.has(scrollingElement)) {
      elements.push({
        element: scrollingElement,
        top: Number(scrollingElement.scrollTop ?? 0),
        left: Number(scrollingElement.scrollLeft ?? 0),
      });
    }

    return {
      elements,
      windowX: Number(window.scrollX ?? 0),
      windowY: Number(window.scrollY ?? 0),
    };
  }

  #restoreScrollState(scrollState = null) {
    if (!scrollState) {
      return;
    }
    for (const entry of scrollState.elements ?? []) {
      if (!entry?.element) {
        continue;
      }
      entry.element.scrollLeft = Number(entry.left ?? 0);
      entry.element.scrollTop = Number(entry.top ?? 0);
    }

    if (typeof window?.scrollTo === 'function') {
      window.scrollTo(Number(scrollState.windowX ?? 0), Number(scrollState.windowY ?? 0));
      return;
    }

    const scrollingElement = document.scrollingElement ?? document.documentElement ?? null;
    if (scrollingElement) {
      scrollingElement.scrollLeft = Number(scrollState.windowX ?? 0);
      scrollingElement.scrollTop = Number(scrollState.windowY ?? 0);
    }
  }

  #buildRowDiagnostics(turnIndex) {
    const diagnostics = this.#engineManager.replayDiagnostics;
    return {
      warnings: Array.isArray(diagnostics?.turnWarnings?.[turnIndex])
        ? [...diagnostics.turnWarnings[turnIndex]]
        : [],
      error:
        diagnostics?.error && Number(diagnostics.error.index) === turnIndex
          ? String(diagnostics.error.message ?? '')
          : null,
    };
  }

  #buildEditSnapshot(turnIndex, draft) {
    try {
      const snapshot = this.#engineManager.buildTurnEditSnapshot(turnIndex, draft);
      if (snapshot) {
        this.#editSession = {
          turnIndex,
          draft: structuredClone(snapshot.draft),
        };
      }
      return {
        snapshot,
        diagnostics: {
          warnings: snapshot?.warnings ?? [],
          error: null,
        },
      };
    } catch (error) {
      const replayTurn = this.#engineManager.getReplayTurn(turnIndex);
      const fallbackDraft = structuredClone(draft ?? this.#engineManager.buildTurnEditDraft(turnIndex));
      return {
        snapshot: {
          draft: fallbackDraft,
          stateBefore: this.#engineManager.getStateBefore(turnIndex),
          previewResourceState: { spAfterByPartyIndex: {} },
          odGaugeAfter: null,
          odState: {
            preemptiveOdLevel: this.#extractOperationLevel(
              fallbackDraft?.operations,
              REPLAY_OPERATION_TYPES.ACTIVATE_PREEMPTIVE_OD
            ),
            interruptOdLevel: this.#extractOperationLevel(
              fallbackDraft?.operations,
              REPLAY_OPERATION_TYPES.RESERVE_INTERRUPT_OD
            ),
            activatablePreemptive: [],
            activatableInterrupt: [],
          },
          operationState: null,
          replayTurn,
        },
        diagnostics: {
          warnings: [],
          error: String(error?.message ?? error ?? ''),
        },
      };
    }
  }

  #extractOperationLevel(operations = [], type) {
    const operation = (Array.isArray(operations) ? operations : []).find(
      (entry) => String(entry?.type ?? '') === String(type)
    );
    const level = Number(operation?.payload?.level ?? operation?.level);
    return Number.isFinite(level) && level >= 1 && level <= 3 ? level : null;
  }

  #appendInputRow() {
    const turnIndex = this.#engineManager.committedTurnCount;
    const rowEl = document.createElement('div');
    this.#rowsRoot.appendChild(rowEl);

    const row = new TurnRowController({
      root: rowEl,
      store: this.#store,
      turnIndex,
      rowMode: 'input',
      rowDiagnostics: createEmptyRowDiagnostics(),
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
      onNoteChange: () => {},
      onPreviewRequest: () => this.#handlePreviewRequest(),
      onOdChange: (ti, odType, level) => this.#handleOdChange(ti, odType, level),
      onOperationAdd: (ti, operation) => this.#handleOperationAdd(ti, operation),
      onOperationRemove: (ti, operationIndex) => this.#handleOperationRemove(ti, operationIndex),
    });

    row.mount();
    this.#rowControllers.push(row);
    this.#refreshInputRow();
  }

  #appendCommittedRow(turnIndex) {
    const rowEl = document.createElement('div');
    this.#rowsRoot.appendChild(rowEl);
    const replayTurn = this.#engineManager.getReplayTurn(turnIndex);
    const row = new TurnRowController({
      root: rowEl,
      store: this.#store,
      turnIndex,
      rowMode: 'committed',
      rowDiagnostics: this.#buildRowDiagnostics(turnIndex),
      record: this.#engineManager.computedRecords[turnIndex] ?? null,
      replayTurn,
      operations: replayTurn?.operations ?? [],
      operationState: null,
      stateBefore: this.#engineManager.getStateBefore(turnIndex),
      stateAfter: this.#engineManager.computedStates[turnIndex] ?? null,
      simulatorSettings: this.#simulatorSettings,
      onEditStart: (ti) => this.#handleEditStart(ti),
    });
    row.mount();
    this.#rowControllers.push(row);
  }

  #appendEditRow(turnIndex) {
    const rowEl = document.createElement('div');
    this.#rowsRoot.appendChild(rowEl);
    const { snapshot, diagnostics } = this.#buildEditSnapshot(turnIndex, this.#editSession?.draft);
    const replayTurn = this.#engineManager.getReplayTurn(turnIndex);
    const row = new TurnRowController({
      root: rowEl,
      store: this.#store,
      turnIndex,
      rowMode: 'edit',
      rowDiagnostics: diagnostics,
      record: null,
      replayTurn,
      operations: snapshot?.draft?.operations ?? [],
      operationState: snapshot?.operationState ?? null,
      stateBefore: snapshot?.stateBefore ?? this.#engineManager.getStateBefore(turnIndex),
      stateAfter: null,
      previewResourceState: snapshot?.previewResourceState ?? { spAfterByPartyIndex: {} },
      previewOdGaugeAfter: snapshot?.odGaugeAfter ?? null,
      odState: snapshot?.odState ?? null,
      simulatorSettings: this.#simulatorSettings,
      editDraft: snapshot?.draft ?? this.#editSession?.draft ?? null,
      onSlotChange: (ti, position, action) => this.#handleSlotChange(ti, position, action),
      onPreviewRequest: () => this.#handlePreviewRequest(),
      onEditCancel: () => this.#handleEditCancel(),
      onRecommit: (ti) => this.#handleRecommit(ti),
    });
    row.mount();
    row.updateOdPreview(snapshot?.odGaugeAfter ?? null);
    this.#rowControllers.push(row);
  }

  #handleCommit(turnIndex) {
    const row = this.#rowControllers.find((controller) => controller.turnIndex === turnIndex) ?? null;
    if (!row) {
      return;
    }
    try {
      this.#engineManager.commitNextTurn(row.getCurrentSlotActions(), {
        note: row.getCurrentNote(),
        enemyCount: row.getCurrentEnemyCount(),
        actionOutcomeOverrides: row.getCurrentActionOutcomeOverrides(),
      });
    } catch (error) {
      console.error('TurnAreaController: commitNextTurn failed:', error);
      this.#onError?.(error);
      return;
    }

    this.#renderRows({ preserveScroll: true });
    this.#onTurnCommitted?.();
    this.#emitPassiveLogRows();
  }

  #handleEditStart(turnIndex) {
    const draft = this.#engineManager.buildTurnEditDraft(turnIndex);
    if (!draft) {
      return;
    }
    this.#editSession = {
      turnIndex,
      draft,
    };
    this.#renderRows({ preserveScroll: true });
  }

  #handleEditCancel() {
    this.#editSession = null;
    this.#renderRows({ preserveScroll: true });
  }

  #handleRecommit(turnIndex) {
    const row = this.#rowControllers.find((controller) => controller.turnIndex === turnIndex) ?? null;
    if (!row) {
      return;
    }
    try {
      this.#engineManager.replaceCommittedTurn(turnIndex, row.getCurrentTurnEditDraft());
    } catch (error) {
      console.error('TurnAreaController: replaceCommittedTurn failed:', error);
      this.#onError?.(error);
      return;
    }
    this.#editSession = null;
    this.#renderRows({ preserveScroll: true });
    this.#emitPassiveLogRows();
  }

  #handleSlotChange(turnIndex, position, action) {
    if (action.swapWith == null) {
      return;
    }
    this.#handleSwap(turnIndex, position, action.swapWith);
  }

  #handlePreviewRequest() {
    if (this.#editSession) {
      this.#refreshEditRow();
      return;
    }
    this.#refreshInputRow();
  }

  #handleSwap(turnIndex, srcPosition, dstPosition) {
    if (this.#editSession && turnIndex === this.#editSession.turnIndex) {
      this.#handleEditSwap(srcPosition, dstPosition);
      return;
    }
    if (this.#editSession || turnIndex !== this.#engineManager.committedTurnCount) {
      return;
    }
    this.#engineManager.swapCurrentPositions(srcPosition, dstPosition);
    this.#refreshInputRow();
  }

  #handleEditSwap(srcPosition, dstPosition) {
    const draft = this.#editSession?.draft;
    if (!draft?.slots) {
      return;
    }
    const slots = draft.slots;
    if (!slots[srcPosition] || !slots[dstPosition]) {
      return;
    }
    [slots[srcPosition], slots[dstPosition]] = [slots[dstPosition], slots[srcPosition]];
    // 後衛に移動したスロットのスキルをクリア
    for (let i = 3; i < slots.length; i++) {
      if (slots[i]) slots[i].skillId = null;
    }
    this.#refreshEditRow(draft);
  }

  #handleOdChange(turnIndex, odType, level) {
    if (this.#editSession || turnIndex !== this.#engineManager.committedTurnCount) {
      return;
    }
    if (odType === 'preemptive') {
      this.#engineManager.setPendingPreemptiveOd(level);
    } else {
      this.#engineManager.setPendingInterruptOd(level);
    }
    this.#refreshInputRow();
  }

  #handleOperationAdd(turnIndex, operation) {
    if (this.#editSession || turnIndex !== this.#engineManager.committedTurnCount) {
      return;
    }
    if (!this.#engineManager.addPendingSpecialOperation(operation)) {
      return;
    }
    this.#refreshInputRow();
  }

  #handleOperationRemove(turnIndex, operationIndex) {
    if (this.#editSession || turnIndex !== this.#engineManager.committedTurnCount) {
      return;
    }
    if (!this.#engineManager.removePendingSpecialOperation(operationIndex)) {
      return;
    }
    this.#refreshInputRow();
  }

  #refreshEditRow(draftOverride = null) {
    if (!this.#editSession) {
      return;
    }
    const row = this.#rowControllers.find(
      (controller) => controller.turnIndex === this.#editSession.turnIndex
    );
    if (!row) {
      return;
    }
    const draft = draftOverride ?? row.getCurrentTurnEditDraft();
    this.#editSession = {
      turnIndex: this.#editSession.turnIndex,
      draft,
    };
    const { snapshot, diagnostics } = this.#buildEditSnapshot(this.#editSession.turnIndex, draft);
    row.update({
      rowMode: 'edit',
      rowDiagnostics: diagnostics,
      record: null,
      replayTurn: this.#engineManager.getReplayTurn(this.#editSession.turnIndex),
      operations: snapshot?.draft?.operations ?? [],
      operationState: snapshot?.operationState ?? null,
      stateBefore: snapshot?.stateBefore ?? this.#engineManager.getStateBefore(this.#editSession.turnIndex),
      stateAfter: null,
      previewResourceState: snapshot?.previewResourceState ?? { spAfterByPartyIndex: {} },
      previewOdGaugeAfter: snapshot?.odGaugeAfter ?? null,
      odState: snapshot?.odState ?? null,
      simulatorSettings: this.#simulatorSettings,
      editDraft: snapshot?.draft ?? draft,
    });
    row.updateOdPreview(snapshot?.odGaugeAfter ?? null);
    this.#renderStatusSummary();
  }

  #refreshInputRow() {
    if (this.#editSession) {
      return;
    }
    const lastRow = this.#rowControllers.at(-1);
    if (!lastRow) {
      return;
    }
    const enemyCount = lastRow.getCurrentEnemyCount();
    const snapshot = this.#engineManager.buildInputRowSnapshot({
      slotActions: lastRow.getCurrentSlotActions(),
      enemyCount,
      actionOutcomeOverrides: lastRow.getCurrentActionOutcomeOverrides(),
    });
    lastRow.update({
      rowMode: 'input',
      rowDiagnostics: createEmptyRowDiagnostics(),
      record: null,
      replayTurn: null,
      operations: this.#engineManager.pendingSpecialOperations,
      stateBefore: snapshot.stateBefore,
      stateAfter: null,
      previewResourceState: snapshot.previewResourceState,
      previewOdGaugeAfter: snapshot.odGaugeAfter,
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
    this.#renderStatusSummary();
  }

  #renderStatusSummary() {
    this.#ensureScaffold();
    const diagnostics = this.#engineManager.replayDiagnostics;
    const warningCount =
      (diagnostics.setupWarnings ?? []).length +
      (diagnostics.turnWarnings ?? []).reduce(
        (sum, warnings) => sum + (Array.isArray(warnings) ? warnings.length : 0),
        0
      );

    let text = '';
    let classes = [];
    if (diagnostics.error) {
      text = `再計算停止: T${Number(diagnostics.error.index) + 1} ${diagnostics.error.message}`;
      classes = ['border-red-200', 'bg-red-50', 'text-red-700'];
    } else if (this.#engineManager.committedTurnCount > 0) {
      text = `再計算完了: ${diagnostics.appliedTurnCount} turns / warnings=${warningCount}`;
      classes = warningCount > 0
        ? ['border-amber-200', 'bg-amber-50', 'text-amber-700']
        : ['border-sky-200', 'bg-sky-50', 'text-sky-700'];
    }

    if (!text) {
      this.#statusEl.className = TURN_REPLAY_STATUS_HIDDEN_CLASS;
      this.#statusEl.textContent = '';
      return;
    }

    this.#statusEl.className = `${TURN_REPLAY_STATUS_VISIBLE_BASE_CLASS} ${classes.join(' ')}`;
    this.#statusEl.textContent = text;
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
        replayDiagnostics: this.#engineManager.replayDiagnostics,
      })
    );
  }
}
