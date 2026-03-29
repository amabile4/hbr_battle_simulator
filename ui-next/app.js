import { HbrDataStore } from '../src/data/hbr-data-store.js';
import { InitialSetupController } from './components/initial-setup.js';
import { PassiveLogPaneController } from './components/passive-log-pane.js';
import { PartyPresetToolbarController } from './components/party-preset-toolbar.js';
import { BattleStateManager } from './engine/battle-state-manager.js';
import { TurnEngineManager } from './engine/turn-engine-manager.js';
import { TurnAreaController } from './components/turn-area.js';
import { createEmptyLightweightReplayScript } from '../src/ui/lightweight-replay-script.js';
import {
  decorateSessionSnapshotForHumans,
  normalizeSessionSnapshot,
} from './utils/session-snapshot.js';
import { DEFAULT_VALIDATION_POLICY } from './utils/validation-policy.js';
import {
  applyPassiveLogPaneHeight,
  applyPassiveLogOpenState,
  applyPassiveLogResizingState,
  applySetupOpenState,
  clampPassiveLogPaneHeight,
  isPassiveLogResizeEnabled,
  PASSIVE_LOG_DEFAULT_HEIGHT_PX,
  PASSIVE_LOG_MIN_HEIGHT_PX,
  PASSIVE_LOG_RESIZE_STEP_PX,
  resolvePassiveLogMaxHeightPx,
  setToolbarButtonLabel,
  updatePassiveLogResizeHandle,
} from './utils/workspace-shell.js';
import { mountPngCaptureSandbox } from './utils/png-capture.js';

const UI_NEXT_READY_FLAG_KEY = '__UI_NEXT_READY__';
const UI_NEXT_BOOT_METRICS_KEY = '__UI_NEXT_BOOT_METRICS__';

function setUiNextReadyFlag(ready) {
  window[UI_NEXT_READY_FLAG_KEY] = Boolean(ready);
}

function createBootProfiler() {
  const startedAt = Date.now();
  const marks = [];

  const publish = (status, errorMessage = null) => {
    window[UI_NEXT_BOOT_METRICS_KEY] = {
      status,
      startedAt,
      endedAt: Date.now(),
      totalMs: Math.max(0, Number(performance.now().toFixed(2))),
      marks: marks.map((mark) => ({ ...mark })),
      ...(errorMessage ? { errorMessage } : {}),
    };
  };

  return {
    mark(phase, note = '') {
      marks.push({
        phase: String(phase),
        note: String(note ?? ''),
        atMs: Number(performance.now().toFixed(2)),
      });
    },
    done() {
      publish('ready');
    },
    fail(error) {
      publish('failed', String(error?.message ?? error ?? 'unknown error'));
    },
  };
}

async function fetchJson(path) {
  if (window.location.protocol === 'file:') {
    const url = new URL(path, import.meta.url).href;
    const module = await import(url, { with: { type: 'json' } });
    return module.default;
  }
  const response = await fetch(path);
  if (!response.ok) {
    throw new Error(`Failed to fetch ${path}: ${response.status}`);
  }
  return response.json();
}

async function fetchJsonOrFallback(path, fallback) {
  try {
    return await fetchJson(path);
  } catch (error) {
    const msg = String(error?.message ?? error ?? '');
    const isMissing =
      msg.includes(`Failed to fetch ${path}: 404`) ||
      msg.includes('Failed to fetch dynamically imported module') ||
      msg.includes('Cannot find module') ||
      msg.includes('Importing a module script failed');
    if (!isMissing) throw error;
    console.warn(`Optional JSON missing, using fallback for ${path}`, error);
    return fallback;
  }
}

let _statusTimer = null;
function resolveStatusTone(msg) {
  return /エラー|Error:|失敗|Failed/i.test(String(msg)) ? 'error' : 'info';
}

function showStatus(msg, tone = resolveStatusTone(msg)) {
  const el = document.querySelector('[data-role="status"]');
  if (!el) return;
  el.textContent = msg;
  el.dataset.tone = tone;
  el.classList.remove('hidden');
  clearTimeout(_statusTimer);
  _statusTimer = setTimeout(() => el.classList.add('hidden'), 5000);
}

function downloadTextFile(text, filename) {
  const blob = new Blob([text], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  try {
    link.click();
  } finally {
    link.remove();
    URL.revokeObjectURL(url);
  }
}

function makeSessionFilename() {
  const stamp = new Date().toISOString().replace(/[:]/g, '-');
  return `ui_next_session_${stamp}.json`;
}

const TURN_SLOT_LAYOUT_MODES = Object.freeze({
  BALANCED: 'balanced',
  SPLIT: 'split',
});

const TURN_SLOT_LAYOUT_STORAGE_KEY = 'ui-next-turn-slot-layout';

function normalizeTurnSlotLayoutMode(mode) {
  return mode === TURN_SLOT_LAYOUT_MODES.SPLIT
    ? TURN_SLOT_LAYOUT_MODES.SPLIT
    : TURN_SLOT_LAYOUT_MODES.BALANCED;
}

function readStoredTurnSlotLayoutMode() {
  try {
    return normalizeTurnSlotLayoutMode(window.localStorage?.getItem(TURN_SLOT_LAYOUT_STORAGE_KEY));
  } catch {
    return TURN_SLOT_LAYOUT_MODES.BALANCED;
  }
}

function writeStoredTurnSlotLayoutMode(mode) {
  try {
    window.localStorage?.setItem(
      TURN_SLOT_LAYOUT_STORAGE_KEY,
      normalizeTurnSlotLayoutMode(mode)
    );
  } catch {
    // localStorage が利用できない環境では永続化を諦める
  }
}

function applyTurnSlotLayoutMode(turnAreaRoot, toggleButton, mode) {
  const normalizedMode = normalizeTurnSlotLayoutMode(mode);
  if (turnAreaRoot) {
    turnAreaRoot.dataset.turnSlotLayout = normalizedMode;
  }
  if (toggleButton) {
    setToolbarButtonLabel(
      toggleButton,
      normalizedMode === TURN_SLOT_LAYOUT_MODES.SPLIT
        ? 'レイアウト: 前衛2:1'
        : 'レイアウト: 均等'
    );
    toggleButton.title =
      normalizedMode === TURN_SLOT_LAYOUT_MODES.SPLIT
        ? 'TurnEdit は前衛66% / 後衛33% です'
        : 'TurnEdit は前後衛均等幅です';
  }
  writeStoredTurnSlotLayoutMode(normalizedMode);
  return normalizedMode;
}

let _htmlToImage = null;
async function getHtmlToImage() {
  if (!_htmlToImage) {
    _htmlToImage = await import('https://esm.sh/html-to-image@1');
  }
  return _htmlToImage;
}

function patchDisabledSelects(container) {
  const selects = [...container.querySelectorAll('select[disabled]')];
  const saved = selects.map((sel) => ({
    el: sel,
    color: sel.style.color,
    backgroundColor: sel.style.backgroundColor,
    opacity: sel.style.opacity,
    pointerEvents: sel.style.pointerEvents,
  }));
  selects.forEach((sel) => {
    sel.removeAttribute('disabled');
    sel.style.color = '#374151';
    sel.style.backgroundColor = '#f9fafb';
    sel.style.opacity = '1';
    sel.style.pointerEvents = 'none';
  });
  return function restore() {
    saved.forEach(({ el, color, backgroundColor, opacity, pointerEvents }) => {
      el.setAttribute('disabled', '');
      el.style.color = color;
      el.style.backgroundColor = backgroundColor;
      el.style.opacity = opacity;
      el.style.pointerEvents = pointerEvents;
    });
  };
}

function isCaptureUntilBattleEndEnabled() {
  return Boolean(
    document.querySelector('[data-role="capture-until-battle-end-toggle"]')?.checked ?? false
  );
}

function resolveStyleNameFromStore(store, styleId) {
  if (!Number.isFinite(Number(styleId))) {
    return null;
  }
  return store?.resolveStyleName?.(styleId) ?? (String(store?.getStyleById(styleId)?.name ?? '').trim() || null);
}

function resolveCharacterNameFromStore(store, styleId) {
  if (!Number.isFinite(Number(styleId))) {
    return null;
  }
  return store?.resolveCharacterNameByStyleId?.(styleId) ?? null;
}

function resolveSkillNameFromStore(store, skillId) {
  if (!Number.isFinite(Number(skillId))) {
    return null;
  }
  return store?.resolveSkillName?.(skillId) ?? (String(store?.getSkillById(skillId)?.name ?? '').trim() || null);
}

function buildTurnStartSpByStyleId(turnEngineManager, turnIndex) {
  const stateBefore = turnEngineManager.getStateBefore(turnIndex);
  const members = Array.isArray(stateBefore?.party) ? stateBefore.party : [];
  const result = {};
  for (const member of members) {
    const styleId = Number(member?.styleId);
    const sp = Number(member?.sp?.current);
    if (!Number.isFinite(styleId) || !Number.isFinite(sp)) {
      continue;
    }
    result[String(styleId)] = sp;
  }
  return result;
}

function buildTurnActionSpByStyleId(turnEngineManager, turnIndex) {
  const record = turnEngineManager.computedRecords?.[turnIndex] ?? null;
  const actions = Array.isArray(record?.actions) ? record.actions : [];
  const result = {};
  for (const action of actions) {
    const styleId = Number(action?.styleId);
    const startSp = Number(action?.startSP);
    const castIndex = Number(action?.castIndex ?? 0);
    if (!Number.isFinite(styleId) || !Number.isFinite(startSp)) {
      continue;
    }
    const key = String(styleId);
    const existing = result[key];
    if (!existing || castIndex < existing.castIndex) {
      result[key] = { value: startSp, castIndex };
    }
  }
  return Object.fromEntries(
    Object.entries(result).map(([styleId, value]) => [styleId, Number(value.value)])
  );
}

function saveCurrentSession({ initialSetup, turnEngineManager, store }) {
  const snapshot = initialSetup.getCurrentSetupSnapshot();
  if (!snapshot?.party?.isFrontFilled) {
    throw new Error('前衛3スロットを設定してください。');
  }
  const replaySetup = buildReplaySetupFromSnapshot(snapshot.party);
  const replayScript = turnEngineManager.replayScript
    ? structuredClone(turnEngineManager.replayScript)
    : createEmptyLightweightReplayScript(replaySetup);
  const decoratedSnapshot = decorateSessionSnapshotForHumans({
    setup: snapshot.party,
    simulatorSettings: snapshot.simulatorSettings,
    validationPolicy: turnEngineManager.validationPolicy ?? DEFAULT_VALIDATION_POLICY,
    replayScript,
  }, {
    resolveStyleName: (styleId) => resolveStyleNameFromStore(store, styleId),
    resolveCharacterName: (styleId) => resolveCharacterNameFromStore(store, styleId),
    resolveSkillName: (skillId) => resolveSkillNameFromStore(store, skillId),
    getTurnStartSpByStyleId: (turnIndex) => buildTurnStartSpByStyleId(turnEngineManager, turnIndex),
    getTurnActionSpByStyleId: (turnIndex) => buildTurnActionSpByStyleId(turnEngineManager, turnIndex),
  });
  const sessionText = JSON.stringify(decoratedSnapshot, null, 2);
  downloadTextFile(sessionText, makeSessionFilename());
}

function loadSessionText({
  text,
  initialSetup,
  battleStateManager,
  turnArea,
}) {
  const session = normalizeSessionSnapshot(JSON.parse(text));
  initialSetup.applySetupSnapshot({
    party: session.setup,
    simulatorSettings: session.simulatorSettings,
  });
  const state = battleStateManager.buildFromSnapshot(session.setup);
  turnArea.loadSession(
    state,
    session.replayScript,
    session.simulatorSettings,
    session.validationPolicy,
  );
  initialSetup.setHasActiveBattle(true);
  initialSetup.setHasRecords(session.replayScript.turns.length > 0);
  window.collapseSetup?.();
  showStatus(`セッションを読み込みました (${session.replayScript.turns.length} turns).`);
}

function setupWorkspaceShell() {
  const appRoot = document.querySelector('#app');
  const workspaceMain = document.querySelector('#workspace-main');
  const turnAreaRoot = document.querySelector('#turn-area');
  const setupArea = document.querySelector('#setup-area');
  const passiveLogPaneRoot = document.querySelector('#passive-log-pane');
  const setupToggleButton = document.querySelector('#toggle-setup');
  const passiveLogToggleButton = document.querySelector('#toggle-passive-log');
  const turnLayoutToggleButton = document.querySelector('#toggle-turn-layout');
  const captureButton = document.querySelector('#capture-btn');
  const passiveLogResizeHandle =
    passiveLogPaneRoot?.querySelector('[data-role="passive-log-resize-handle"]') ?? null;

  let setupOpen = applySetupOpenState({
    appRoot,
    setupArea,
    toggleButton: setupToggleButton,
    open: true,
  });
  let passiveLogHeightPx = PASSIVE_LOG_DEFAULT_HEIGHT_PX;
  let passiveLogOpen = applyPassiveLogOpenState({
    appRoot,
    paneRoot: passiveLogPaneRoot,
    toggleButton: passiveLogToggleButton,
    open: false,
    hasRows: false,
    heightPx: passiveLogHeightPx,
    workspaceHeightPx: Number(workspaceMain?.getBoundingClientRect?.().height ?? 0),
    viewportWidth: Number(window.innerWidth ?? 0),
  });
  let currentTurnSlotLayoutMode = applyTurnSlotLayoutMode(
    turnAreaRoot,
    turnLayoutToggleButton,
    readStoredTurnSlotLayoutMode()
  );

  const resolveWorkspaceHeight = () => {
    const height = Number(workspaceMain?.getBoundingClientRect?.().height ?? 0);
    return Number.isFinite(height) ? height : 0;
  };

  const setPassiveLogResizing = (active) => {
    const normalized = Boolean(active);
    applyPassiveLogResizingState({ appRoot, active: normalized });
    if (passiveLogResizeHandle) {
      passiveLogResizeHandle.dataset.active = normalized ? 'true' : 'false';
    }
  };

  const syncPassiveLogPaneLayout = () => {
    const workspaceHeightPx = resolveWorkspaceHeight();
    const appliedHeightPx = applyPassiveLogPaneHeight({
      appRoot,
      paneRoot: passiveLogPaneRoot,
      heightPx: passiveLogHeightPx,
      workspaceHeightPx,
      viewportWidth: Number(window.innerWidth ?? 0),
    });
    if (appliedHeightPx != null) {
      passiveLogHeightPx = appliedHeightPx;
    }
    updatePassiveLogResizeHandle({
      paneRoot: passiveLogPaneRoot,
      heightPx: passiveLogHeightPx,
      workspaceHeightPx,
    });
    if (passiveLogResizeHandle) {
      passiveLogResizeHandle.setAttribute(
        'aria-disabled',
        String(!isPassiveLogResizeEnabled(Number(window.innerWidth ?? 0)))
      );
    }
  };

  setupToggleButton?.addEventListener('click', () => {
    setupOpen = applySetupOpenState({
      appRoot,
      setupArea,
      toggleButton: setupToggleButton,
      open: !setupOpen,
    });
  });

  passiveLogToggleButton?.addEventListener('click', () => {
    if (passiveLogToggleButton.disabled) {
      return;
    }
    passiveLogOpen = applyPassiveLogOpenState({
      appRoot,
      paneRoot: passiveLogPaneRoot,
      toggleButton: passiveLogToggleButton,
      open: !passiveLogOpen,
      hasRows: appRoot?.dataset.passiveLogAvailable === 'true',
      heightPx: passiveLogHeightPx,
      workspaceHeightPx: resolveWorkspaceHeight(),
      viewportWidth: Number(window.innerWidth ?? 0),
    });
    syncPassiveLogPaneLayout();
  });

  turnLayoutToggleButton?.addEventListener('click', () => {
    currentTurnSlotLayoutMode =
      currentTurnSlotLayoutMode === TURN_SLOT_LAYOUT_MODES.SPLIT
        ? TURN_SLOT_LAYOUT_MODES.BALANCED
        : TURN_SLOT_LAYOUT_MODES.SPLIT;
    applyTurnSlotLayoutMode(turnAreaRoot, turnLayoutToggleButton, currentTurnSlotLayoutMode);
  });

  captureButton?.addEventListener('click', async () => {
    captureButton.disabled = true;
    setToolbarButtonLabel(captureButton, '保存中...');
    try {
      const { toPng } = await getHtmlToImage();
      const { target, meta, cleanup } = mountPngCaptureSandbox(turnAreaRoot, {
        captureUntilBattleEnd: isCaptureUntilBattleEndEnabled(),
      });
      if (meta.committedRowCount === 0) {
        cleanup();
        throw new Error('PNG保存対象のコミット済みターンがありません。');
      }

      const restoreSelects = patchDisabledSelects(target);
      try {
        const dataUrl = await toPng(target, {
          pixelRatio: window.devicePixelRatio || 1,
          backgroundColor: '#ffffff',
        });
        const link = document.createElement('a');
        const stamp = new Date().toISOString().replace(/:/g, '-').replace(/\..+/, '');
        link.href = dataUrl;
        link.download = `hbr_battle_${stamp}.png`;
        document.body.appendChild(link);
        try {
          link.click();
        } finally {
          link.remove();
        }
        showStatus(
          meta.truncatedAtBattleEnd
            ? 'PNG保存しました（バトル終了行まで）。'
            : 'PNG保存しました。'
        );
      } finally {
        restoreSelects();
        cleanup();
      }
    } catch (error) {
      console.error('キャプチャエラー:', error);
      showStatus(`キャプチャエラー: ${error.message}`, 'error');
    } finally {
      captureButton.disabled = false;
      setToolbarButtonLabel(captureButton, 'PNG保存');
    }
  });

  passiveLogResizeHandle?.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) {
      return;
    }
    if (passiveLogPaneRoot?.hidden || !isPassiveLogResizeEnabled(Number(window.innerWidth ?? 0))) {
      return;
    }

    const startY = Number(event.clientY ?? 0);
    const startHeightPx = clampPassiveLogPaneHeight(passiveLogHeightPx, resolveWorkspaceHeight());
    const pointerId = Number.isFinite(Number(event.pointerId)) ? Number(event.pointerId) : null;

    event.preventDefault();
    passiveLogHeightPx = startHeightPx;
    syncPassiveLogPaneLayout();
    setPassiveLogResizing(true);
    if (pointerId != null) {
      passiveLogResizeHandle.setPointerCapture?.(pointerId);
    }

    const handlePointerMove = (moveEvent) => {
      if (pointerId != null && moveEvent.pointerId !== pointerId) {
        return;
      }
      const deltaY = startY - Number(moveEvent.clientY ?? startY);
      passiveLogHeightPx = clampPassiveLogPaneHeight(startHeightPx + deltaY, resolveWorkspaceHeight());
      syncPassiveLogPaneLayout();
    };

    const finishResize = (endEvent) => {
      if (pointerId != null && endEvent.pointerId !== pointerId) {
        return;
      }
      if (pointerId != null) {
        passiveLogResizeHandle.releasePointerCapture?.(pointerId);
      }
      setPassiveLogResizing(false);
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', finishResize);
      window.removeEventListener('pointercancel', finishResize);
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', finishResize);
    window.addEventListener('pointercancel', finishResize);
  });

  passiveLogResizeHandle?.addEventListener('keydown', (event) => {
    if (passiveLogPaneRoot?.hidden || !isPassiveLogResizeEnabled(Number(window.innerWidth ?? 0))) {
      return;
    }

    const workspaceHeightPx = resolveWorkspaceHeight();
    const maxHeightPx = resolvePassiveLogMaxHeightPx(workspaceHeightPx);
    let nextHeightPx = null;
    if (event.key === 'ArrowUp') {
      nextHeightPx = passiveLogHeightPx + PASSIVE_LOG_RESIZE_STEP_PX;
    } else if (event.key === 'ArrowDown') {
      nextHeightPx = passiveLogHeightPx - PASSIVE_LOG_RESIZE_STEP_PX;
    } else if (event.key === 'Home') {
      nextHeightPx = PASSIVE_LOG_MIN_HEIGHT_PX;
    } else if (event.key === 'End' && Number.isFinite(maxHeightPx)) {
      nextHeightPx = maxHeightPx;
    }
    if (nextHeightPx == null) {
      return;
    }

    event.preventDefault();
    passiveLogHeightPx = clampPassiveLogPaneHeight(nextHeightPx, workspaceHeightPx);
    syncPassiveLogPaneLayout();
  });

  window.addEventListener('resize', () => {
    syncPassiveLogPaneLayout();
  });
  syncPassiveLogPaneLayout();

  window.collapseSetup = () => {
    setupOpen = applySetupOpenState({
      appRoot,
      setupArea,
      toggleButton: setupToggleButton,
      open: false,
    });
  };

  return {
    updatePassiveLogAvailability(hasRows) {
      passiveLogOpen = applyPassiveLogOpenState({
        appRoot,
        paneRoot: passiveLogPaneRoot,
        toggleButton: passiveLogToggleButton,
        open: passiveLogOpen,
        hasRows,
        heightPx: passiveLogHeightPx,
        workspaceHeightPx: resolveWorkspaceHeight(),
        viewportWidth: Number(window.innerWidth ?? 0),
      });
      syncPassiveLogPaneLayout();
    },
    buttons: {
      sessionSave: document.querySelector('#session-save-btn'),
      sessionLoad: document.querySelector('#session-load-btn'),
      sessionLoadInput: document.querySelector('#session-load-input'),
    },
  };
}

async function main() {
  const bootProfiler = createBootProfiler();
  setUiNextReadyFlag(false);
  bootProfiler.mark('main:start');

  try {
    let workspaceShell = null;
    bootProfiler.mark('data:fetch:start');
    const [
      characters,
      styles,
      skills,
      passives,
      accessories,
      skillRuleOverrides,
      epRuleOverrides,
      transcendenceRuleOverrides,
      supportSkills,
    ] = await Promise.all([
      fetchJson('../json/characters.json'),
      fetchJson('../json/styles.json'),
      fetchJson('../json/skills.json'),
      fetchJson('../json/passives.json'),
      fetchJson('../json/accessories.json'),
      fetchJson('../json/skill_rule_overrides.json'),
      fetchJson('../json/ep_rule_overrides.json'),
      fetchJson('../json/transcendence_rule_overrides.json'),
      fetchJsonOrFallback('../json/support_skills.json', []),
    ]);
    const payload = {
      characters,
      styles,
      skills,
      passives,
      accessories,
      skillRuleOverrides,
      epRuleOverrides,
      transcendenceRuleOverrides,
      supportSkills,
    };
    bootProfiler.mark('data:fetch:done');

    bootProfiler.mark('store:init:start');
    const store = HbrDataStore.fromRawData(payload);
    const battleStateManager = new BattleStateManager({ store });
    const turnEngineManager = new TurnEngineManager();
    bootProfiler.mark('store:init:done');

    // initialSetup は turnArea の onTurnCommitted から参照するため let で先行宣言する
    let initialSetup;

    bootProfiler.mark('workspace:init:start');
    const passiveLogPane = new PassiveLogPaneController({
      root: document.querySelector('#passive-log-pane'),
      onHasRowsChange: (hasRows) => workspaceShell?.updatePassiveLogAvailability(hasRows),
    });
    passiveLogPane.mount();
    workspaceShell = setupWorkspaceShell();
    bootProfiler.mark('workspace:init:done');

    bootProfiler.mark('turn-area:init:start');
    const turnAreaRoot = document.querySelector('#turn-area');
    const turnArea = new TurnAreaController({
      root: turnAreaRoot,
      store,
      engineManager: turnEngineManager,
      onError: (err) => showStatus(`ターン実行エラー: ${err.message}`),
      onTurnCommitted: () => initialSetup?.setHasRecords(true),
      onPassiveLogRowsChange: (rows) => passiveLogPane.setRows(rows),
    });
    bootProfiler.mark('turn-area:init:done');

    const setupRoot = document.querySelector('#initial-setup-root');
    const pickerOverlay = document.querySelector('#style-picker-overlay');
    const presetToolbarRoot = document.querySelector('#party-preset-toolbar');

    bootProfiler.mark('initial-setup:init:start');
    initialSetup = new InitialSetupController({
      root: setupRoot,
      pickerOverlay,
      store,
      onApply: (snapshot) => {
        try {
          const state = battleStateManager.buildFromSnapshot(snapshot.party);
          const replaySetup = buildReplaySetupFromSnapshot(snapshot.party);
          turnArea.initialize(state, replaySetup, snapshot.simulatorSettings, DEFAULT_VALIDATION_POLICY);
          initialSetup.setHasActiveBattle(true);
          initialSetup.setHasRecords(false);
          window.collapseSetup?.();
        } catch (err) {
          showStatus(`BattleState 生成エラー: ${err.message}`);
          console.error(err);
        }
      },
      onRecalculate: (snapshot, options = {}) => {
        try {
          const state = battleStateManager.buildFromSnapshot(snapshot.party);
          turnArea.reinitialize(state, snapshot.simulatorSettings);
          initialSetup.setHasActiveBattle(true);
          if (!options.automatic) {
            window.collapseSetup?.();
          }
        } catch (err) {
          showStatus(`再計算エラー: ${err.message}`);
          console.error(err);
        }
      },
    });
    initialSetup.mount();
    bootProfiler.mark('initial-setup:init:done');

    bootProfiler.mark('preset-toolbar:init:start');
    const presetToolbar = new PartyPresetToolbarController({
      root: presetToolbarRoot,
      getPresetPreviews: () => initialSetup.getPartyPresetPreviews(),
      onLoadPreset: async (index) => {
        const loaded = initialSetup.loadPartyPreset(index);
        if (loaded) {
          showStatus(`プリセット ${index + 1} を読み込みました。`);
        }
        return loaded;
      },
      onSavePreset: async (index, options = {}) => {
        const saved = initialSetup.savePartyPreset(index, options);
        if (saved) {
          showStatus(`プリセット ${index + 1} を保存しました。`);
        }
        return saved;
      },
      onRenamePreset: async (index, options = {}) => {
        const renamed = initialSetup.renamePartyPreset(index, options);
        if (renamed) {
          showStatus(`プリセット ${index + 1} の名前を更新しました。`);
        }
        return renamed;
      },
      onClearPreset: async (index) => {
        const cleared = initialSetup.clearPartyPreset(index);
        if (cleared) {
          showStatus(`プリセット ${index + 1} を削除しました。`);
        }
        return cleared;
      },
      onError: (error) => {
        showStatus(`プリセットエラー: ${error.message}`, 'error');
        console.error(error);
      },
    });
    presetToolbar.mount();
    presetToolbar.sync();
    bootProfiler.mark('preset-toolbar:init:done');

    workspaceShell.buttons.sessionSave?.addEventListener('click', () => {
      try {
        saveCurrentSession({
          initialSetup,
          turnEngineManager,
          store,
        });
        showStatus('セッション JSON を保存しました。');
      } catch (err) {
        showStatus(`保存エラー: ${err.message}`);
        console.error(err);
      }
    });

    workspaceShell.buttons.sessionLoad?.addEventListener('click', () => {
      workspaceShell.buttons.sessionLoadInput?.click();
    });

    workspaceShell.buttons.sessionLoadInput?.addEventListener('change', async () => {
      const file = workspaceShell.buttons.sessionLoadInput.files?.[0] ?? null;
      if (!file) {
        return;
      }
      try {
        const text = await file.text();
        loadSessionText({
          text,
          initialSetup,
          battleStateManager,
          turnArea,
        });
      } catch (err) {
        showStatus(`読込エラー: ${err.message}`);
        console.error(err);
      } finally {
        workspaceShell.buttons.sessionLoadInput.value = '';
      }
    });

    bootProfiler.mark('main:ready');
    setUiNextReadyFlag(true);
    bootProfiler.done();
  } catch (error) {
    bootProfiler.fail(error);
    setUiNextReadyFlag(false);
    throw error;
  }
}

/**
 * PartySetupController.getSnapshot() の戻り値から LightweightReplaySetup を生成する。
 * @param {object} snapshot
 * @returns {object} setup オブジェクト（createEmptyLightweightReplayScript に渡す）
 */
function buildReplaySetupFromSnapshot(snapshot) {
  // filledIndices: null を除いた前衛→後衛の左詰めインデックス
  const filledIndices = snapshot.styleIds
    .map((id, i) => (id !== null ? i : null))
    .filter((i) => i !== null);

  return {
    styleIds: filledIndices.map((i) => snapshot.styleIds[i]),
    supportStyleIdsByPartyIndex: Object.fromEntries(
      filledIndices
        .map((srcIdx, newIdx) => [newIdx, snapshot.supportStyleIds[srcIdx]])
        .filter(([, id]) => id !== null)
    ),
    limitBreakLevelsByPartyIndex: Object.fromEntries(
      filledIndices.map((srcIdx, newIdx) => [newIdx, snapshot.limitBreakLevelsByPartyIndex[srcIdx] ?? 0])
    ),
    skillSetsByPartyIndex: Object.fromEntries(
      filledIndices
        .map((srcIdx, newIdx) => {
          const equippedSkillIds =
            snapshot.skillSetsByPartyIndex?.[srcIdx] ??
            snapshot.skillSetsByPartyIndex?.[String(srcIdx)] ??
            null;
          return Array.isArray(equippedSkillIds)
            ? [newIdx, structuredClone(equippedSkillIds)]
            : null;
        })
        .filter(Boolean)
    ),
  };
}

main().catch((error) => {
  showStatus(`Error: ${error.message}`);
  console.error(error);
});
