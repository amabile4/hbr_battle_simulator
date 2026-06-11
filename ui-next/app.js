import { HbrDataStore } from '../src/data/hbr-data-store.js';
import { InitialSetupController } from './components/initial-setup.js';
import { PassiveLogPaneController } from './components/passive-log-pane.js';
import { PartyPresetToolbarController } from './components/party-preset-toolbar.js';
import { UsedSkillsOverlayController } from './components/used-skills-overlay.js';
import { BattleStateManager } from './engine/battle-state-manager.js';
import { TurnEngineManager } from './engine/turn-engine-manager.js';
import { TurnAreaController } from './components/turn-area.js';
import {
  createEmptyLightweightReplayScript,
  createLightweightReplayScriptFromBaseSetup,
} from '../src/ui/lightweight-replay-script.js';
import { buildUsedSkillsByPartyMember } from './utils/used-skills-view.js';
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
  bindToolbarQuickHelpCompactState,
  resolvePassiveLogMaxHeightPx,
  setToolbarButtonLabel,
  updatePassiveLogResizeHandle,
} from './utils/workspace-shell.js';
import { mountPngCaptureSandbox } from './utils/png-capture.js';
import { buildEnemyList } from './utils/enemy-list.js';
import { buildReplaySetupFromPartySnapshot } from './utils/replay-setup.js';
import {
  createJsonDataCacheContext,
  fetchJsonWithCache,
} from './utils/json-cache.js';
import { loadDamageCalculationData } from './utils/damage-calculation-data.js';

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

let jsonDataCacheContextPromise = null;

function getJsonDataCacheContext() {
  if (!jsonDataCacheContextPromise) {
    jsonDataCacheContextPromise = createJsonDataCacheContext();
  }
  return jsonDataCacheContextPromise;
}

async function fetchJson(path) {
  const cacheContext = await getJsonDataCacheContext();
  return fetchJsonWithCache(path, cacheContext);
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

const TOOLBAR_HELP_LONG_PRESS_MS = 550;
const RIGHT_CLICK_HELP_SVG = `
  <svg viewBox="0 0 64 64" fill="none" aria-hidden="true">
    <rect x="10" y="4" width="44" height="56" rx="22" fill="#f8fafc" stroke="#334155" stroke-width="3"/>
    <path d="M32 8V34" stroke="#334155" stroke-width="3"/>
    <path d="M32 34H52" stroke="#334155" stroke-width="3"/>
    <path d="M32 34V8" stroke="#334155" stroke-width="3"/>
    <path d="M32 8H52" stroke="#334155" stroke-width="3"/>
    <rect x="32" y="8" width="20" height="24" rx="9" fill="#0ea5e9" stroke="#0369a1" stroke-width="2"/>
  </svg>
`;

const TOOLBAR_HELP_CONTENT = Object.freeze({
  operations: {
    title: '操作説明',
    items: [
      {
        label: '敵情報確認',
        body: '左クリック/右クリック（PC）またはタップ長押し（スマートフォン）で、現在のターンで敵にかかっているバフ・デバフ・状態異常などをポップアップで一覧確認できます。行動前に敵の情報を把握することで、最適なスキル選択や戦略立案に役立ちます。',
      },
      {
        label: 'キャラクターアイコン',
        body: 'パーティーのキャラクターアイコンを右クリック（PC）またはタップ長押し（スマートフォン）すると、そのキャラクターの現在スタイル・スキル構成・SP残量などの詳細情報をポップアップで確認できます。',
      },
    ],
  },
});

function escapeHelpHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function setupToolbarQuickHelp() {
  const buttons = [...document.querySelectorAll('[data-role="toolbar-quick-help"]')];
  if (buttons.length === 0) {
    return;
  }
  const boundToolbars = new WeakSet();

  let popover = null;
  let longPressTimer = null;

  const clearLongPressTimer = () => {
    if (longPressTimer === null) {
      return;
    }
    window.clearTimeout(longPressTimer);
    longPressTimer = null;
  };

  const closePopover = () => {
    if (!popover) {
      return;
    }
    popover.remove();
    popover = null;
  };

  const placePopover = (button) => {
    if (!popover) {
      return;
    }
    const rect = button.getBoundingClientRect();
    const padding = 8;
    const maxLeft = Math.max(
      padding,
      window.innerWidth - padding - Number(popover.offsetWidth || 0)
    );
    const left = Math.min(Math.max(padding, rect.left), maxLeft);
    const spaceBelow = window.innerHeight - rect.bottom;
    const showBelow = spaceBelow >= Number(popover.offsetHeight || 0) + 16;
    const top = showBelow
      ? rect.bottom + 8
      : Math.max(padding, rect.top - Number(popover.offsetHeight || 0) - 8);
    popover.style.left = `${left}px`;
    popover.style.top = `${top}px`;
  };

  const openPopover = (button) => {
    const kind = button.dataset.helpKind;
    const content = TOOLBAR_HELP_CONTENT[kind];
    if (!content) {
      return;
    }
    closePopover();
    popover = document.createElement('div');
    popover.className = 'toolbar-quick-help-popover';
    const itemsHtml = (content.items ?? []).map(item => `
      <div class="toolbar-quick-help-popover__item">
        <div class="toolbar-quick-help-popover__item-label">${escapeHelpHtml(item.label)}</div>
        <p class="toolbar-quick-help-popover__item-body">${escapeHelpHtml(item.body)}</p>
      </div>
    `).join('');
    popover.innerHTML = `
      <div class="toolbar-quick-help-popover__card" role="dialog" aria-label="${escapeHelpHtml(content.title)} ヘルプ">
        <div class="toolbar-quick-help-popover__header">
          <strong class="toolbar-quick-help-popover__title">${escapeHelpHtml(content.title)}</strong>
          <button class="toolbar-quick-help-popover__close" aria-label="閉じる" type="button">✕</button>
        </div>
        <div class="toolbar-quick-help-popover__items">
          ${itemsHtml}
        </div>
      </div>
    `;
    const closeBtn = popover.querySelector('.toolbar-quick-help-popover__close');
    if (closeBtn) {
      closeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        closePopover();
      });
    }
    document.body.appendChild(popover);
    placePopover(button);
  };

  const handleDocumentPointerDown = (event) => {
    if (!popover) {
      return;
    }
    const target = event.target;
    if (
      target instanceof window.HTMLElement &&
      (popover.contains(target) || target.closest('[data-role="toolbar-quick-help"]'))
    ) {
      return;
    }
    closePopover();
  };

  document.addEventListener('pointerdown', handleDocumentPointerDown);
  window.addEventListener('resize', closePopover);
  window.addEventListener('scroll', closePopover, true);

  for (const button of buttons) {
    const toolbar = button.closest('.workspace-toolbar');
    if (toolbar && !boundToolbars.has(toolbar)) {
      bindToolbarQuickHelpCompactState({
        toolbar,
        helpButton: button,
        runtimeWindow: window,
      });
      boundToolbars.add(toolbar);
    }

    button.addEventListener('contextmenu', (event) => {
      event.preventDefault();
      event.stopPropagation();
      clearLongPressTimer();
      openPopover(button);
    });

    button.addEventListener('click', () => {
      if (button.dataset.longPressHandled === 'true') {
        button.dataset.longPressHandled = 'false';
        return;
      }
      if (popover) {
        closePopover();
      } else {
        openPopover(button);
      }
    });

    button.addEventListener('touchstart', () => {
      clearLongPressTimer();
      button.dataset.longPressHandled = 'false';
      longPressTimer = window.setTimeout(() => {
        button.dataset.longPressHandled = 'true';
        openPopover(button);
      }, TOOLBAR_HELP_LONG_PRESS_MS);
    }, { passive: true });

    button.addEventListener('touchmove', clearLongPressTimer, { passive: true });
    button.addEventListener('touchend', clearLongPressTimer, { passive: true });
    button.addEventListener('touchcancel', clearLongPressTimer, { passive: true });
  }
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

function scheduleDeferredTask(task, delayMs = 0) {
  if (typeof window.requestIdleCallback === 'function') {
    window.requestIdleCallback(() => {
      void task();
    }, { timeout: 1200 });
    return;
  }
  window.setTimeout(() => {
    void task();
  }, delayMs);
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
  const jstOffsetMs = 9 * 60 * 60 * 1000;
  const stamp = new Date(Date.now() + jstOffsetMs)
    .toISOString()
    .replace(/[:]/g, '-')
    .replace('Z', '+09-00');
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

function buildTurnPostSkillSpByStyleId(turnEngineManager, turnIndex) {
  const record = turnEngineManager.computedRecords?.[turnIndex] ?? null;
  const actions = Array.isArray(record?.actions) ? record.actions : [];

  // turnStartSP を取得し、costDelta のみを加算して表示用SPを計算する。
  // cost.postSP はアクション間 HealSp（例: スペクタクルアート）適用後の値を含むため
  // 実機表記と一致しない。実機では各キャラクターの表示SPは
  // 「ターン開始SP − 自スキルコスト」で計算される。
  const stateBefore = turnEngineManager.getStateBefore(turnIndex);
  const turnStartSpByStyleId = {};
  if (Array.isArray(stateBefore?.party)) {
    for (const member of stateBefore.party) {
      const sid = Number(member?.styleId);
      if (Number.isFinite(sid)) {
        turnStartSpByStyleId[String(sid)] = Number(member?.sp?.current ?? 0);
      }
    }
  }

  const result = {};
  for (const action of actions) {
    const styleId = Number(action?.styleId);
    const castIndex = Number(action?.castIndex ?? 0);
    const costDeltaSum = Array.isArray(action?.spChanges)
      ? action.spChanges
          .filter((c) => c?.source === 'cost' && Number.isFinite(Number(c?.delta)))
          .reduce((sum, c) => sum + Number(c.delta), 0)
      : 0;
    const turnStartSp = turnStartSpByStyleId[String(styleId)];
    const displayedSp = Number.isFinite(turnStartSp) ? turnStartSp + costDeltaSum : NaN;
    if (!Number.isFinite(styleId) || !Number.isFinite(displayedSp)) {
      continue;
    }
    const key = String(styleId);
    const existing = result[key];
    if (!existing || castIndex < existing.castIndex) {
      result[key] = { value: displayedSp, castIndex };
    }
  }
  return Object.fromEntries(
    Object.entries(result).map(([styleId, value]) => [styleId, Number(value.value)])
  );
}

function buildTurnActionOrderByStyleId(turnEngineManager, turnIndex) {
  const record = turnEngineManager.computedRecords?.[turnIndex] ?? null;
  const actions = Array.isArray(record?.actions) ? record.actions : [];
  const seenStyleIds = new Set();
  const result = [];
  for (const action of actions) {
    const styleId = Number(action?.styleId);
    if (!Number.isFinite(styleId) || seenStyleIds.has(styleId)) {
      continue;
    }
    seenStyleIds.add(styleId);
    result.push(styleId);
  }
  return result;
}

function saveCurrentSession({ initialSetup, turnEngineManager, store }) {
  const snapshot = initialSetup.getCurrentSetupSnapshot();
  if (!snapshot?.party?.isFrontFilled) {
    throw new Error('前衛3スロットを設定してください。');
  }
  const replaySetup = buildReplaySetupFromPartySnapshot(snapshot.party);
  const replayScript = turnEngineManager.replayScript
    ? createLightweightReplayScriptFromBaseSetup(replaySetup, turnEngineManager.replayScript)
    : createEmptyLightweightReplayScript(replaySetup);
  const decoratedSnapshot = decorateSessionSnapshotForHumans({
    setup: snapshot.party,
    enemy: snapshot.enemy,
    simulatorSettings: snapshot.simulatorSettings,
    validationPolicy: turnEngineManager.validationPolicy ?? DEFAULT_VALIDATION_POLICY,
    replayScript,
  }, {
    resolveStyleName: (styleId) => resolveStyleNameFromStore(store, styleId),
    resolveCharacterName: (styleId) => resolveCharacterNameFromStore(store, styleId),
    resolveSkillName: (skillId) => resolveSkillNameFromStore(store, skillId),
    getTurnStartSpByStyleId: (turnIndex) =>
      buildTurnStartSpByStyleId(turnEngineManager, turnIndex),
    getTurnPostSkillSpByStyleId: (turnIndex) =>
      buildTurnPostSkillSpByStyleId(turnEngineManager, turnIndex),
    getTurnActionOrderByStyleId: (turnIndex) =>
      buildTurnActionOrderByStyleId(turnEngineManager, turnIndex),
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
    enemy: session.enemy,
    simulatorSettings: session.simulatorSettings,
  });
  const state = battleStateManager.buildFromSnapshot(session.setup, session.enemy);
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
  const usedSkillsToggleButton = document.querySelector('#toggle-used-skills');
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

  setupToolbarQuickHelp();

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
      usedSkillsToggle: usedSkillsToggleButton,
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
      enemyEShieldOverrides,
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
      fetchJsonOrFallback('../json/enemy_eshield_overrides.json', []),
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
      enemyEShieldOverrides,
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
    const usedSkillsOverlay = new UsedSkillsOverlayController({
      root: document.querySelector('#used-skills-overlay'),
    });
    passiveLogPane.mount();
    usedSkillsOverlay.mount();
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
      enemies: [],
      onApply: (snapshot) => {
        try {
          const state = battleStateManager.buildFromSnapshot(snapshot.party, snapshot.enemy);
          const replaySetup = buildReplaySetupFromPartySnapshot(snapshot.party);
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
          const state = battleStateManager.buildFromSnapshot(snapshot.party, snapshot.enemy);
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

    // enemies.json は Party Setup 初期表示を阻害しないよう遅延ロードする。
    scheduleDeferredTask(async () => {
      try {
        const rawEnemies = await fetchJsonOrFallback('../json/enemies.json', []);
        const enemyPresets = buildEnemyList(rawEnemies, new Date(), {
          enemyEShieldOverrides: store.enemyEShieldOverrides,
        });
        initialSetup.setEnemies(enemyPresets);
        turnArea.setEnemyPresets(enemyPresets);
      } catch (error) {
        console.error('Failed to hydrate enemy presets:', error);
      }
    }, 0);

    // dimension_battle.json は Stage Setup のプリセット用データとして遅延ロードする。
    scheduleDeferredTask(async () => {
      try {
        const dimensionBattles = await fetchJsonOrFallback('../json/dimension_battle.json', []);
        initialSetup.setDimensionBattles(dimensionBattles);
      } catch (error) {
        console.error('Failed to hydrate stage presets:', error);
      }
    }, 0);

    // DPダメージガイド用の計算データを TurnEngineManager に注入する。
    // 起動時のレンダリングをブロックしないよう遅延ロードする。
    // 失敗時はガイドなしのまま続行（アプリを止めない）。
    scheduleDeferredTask(async () => {
      try {
        const damageCalculationData = await loadDamageCalculationData();
        turnEngineManager.setDamageCalculationData(damageCalculationData);
        // セッションロード直後など既にターンが存在する場合は再計算して DP を反映する。
        if (turnEngineManager.committedTurnCount > 0) {
          turnEngineManager.recalculateFrom(0);
        }
      } catch (error) {
        console.error('Failed to load damage calculation data for DP guide:', error);
      }
    }, 0);

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

    workspaceShell.buttons.usedSkillsToggle?.addEventListener('click', () => {
      const rows = buildUsedSkillsByPartyMember({
        store,
        turnEngineManager,
      });
      usedSkillsOverlay.setRows(rows);
      usedSkillsOverlay.toggle();
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

main().catch((error) => {
  showStatus(`Error: ${error.message}`);
  console.error(error);
});
