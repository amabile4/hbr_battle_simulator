export const PASSIVE_LOG_DEFAULT_HEIGHT_PX = 16 * 16;
export const PASSIVE_LOG_MIN_HEIGHT_PX = 8 * 16;
export const PASSIVE_LOG_RESIZE_STEP_PX = 16;
export const PASSIVE_LOG_RESIZE_BREAKPOINT_PX = 640;
export const TURN_AREA_MIN_HEIGHT_PX = 240;
export const TOOLBAR_OVERFLOW_EPSILON_PX = 1;

function resolveViewportWidth(viewportWidth) {
  const numeric = Number(viewportWidth);
  if (Number.isFinite(numeric)) {
    return numeric;
  }
  const runtimeWidth = Number(globalThis.window?.innerWidth ?? 0);
  return Number.isFinite(runtimeWidth) ? runtimeWidth : 0;
}

function clearPassiveLogPaneHeight(paneRoot) {
  if (!paneRoot) {
    return;
  }
  paneRoot.style.height = '';
  paneRoot.style.flexBasis = '';
  paneRoot.style.flexGrow = '';
  paneRoot.style.flexShrink = '';
  paneRoot.style.maxHeight = '';
  paneRoot.style.minHeight = '';
  delete paneRoot.dataset.passiveLogHeightPx;
}

export function setToolbarButtonLabel(button, label) {
  if (!button) {
    return;
  }
  const normalizedLabel = String(label ?? '');
  const labelEl = button.querySelector?.('[data-role="toolbar-label"]');
  if (labelEl) {
    labelEl.textContent = normalizedLabel;
  } else {
    button.textContent = normalizedLabel;
  }
  button.setAttribute('aria-label', normalizedLabel);
}

export function syncToolbarQuickHelpCompactState({
  toolbar,
  helpButton,
  overflowThresholdPx = TOOLBAR_OVERFLOW_EPSILON_PX,
}) {
  if (!toolbar || !helpButton) {
    return false;
  }

  helpButton.removeAttribute('data-compact');
  const thresholdPx = Number.isFinite(Number(overflowThresholdPx))
    ? Number(overflowThresholdPx)
    : TOOLBAR_OVERFLOW_EPSILON_PX;
  const compact = Number(toolbar.scrollWidth ?? 0) > Number(toolbar.clientWidth ?? 0) + thresholdPx;
  helpButton.dataset.compact = compact ? 'true' : 'false';
  return compact;
}

export function bindToolbarQuickHelpCompactState({
  toolbar,
  helpButton,
  runtimeWindow = globalThis.window,
}) {
  if (!toolbar || !helpButton) {
    return () => {};
  }

  const win = runtimeWindow ?? globalThis.window;
  const requestFrame = typeof win?.requestAnimationFrame === 'function'
    ? win.requestAnimationFrame.bind(win)
    : (callback) => win?.setTimeout?.(callback, 0) ?? globalThis.setTimeout(callback, 0);
  const cancelFrame = typeof win?.cancelAnimationFrame === 'function'
    ? win.cancelAnimationFrame.bind(win)
    : (handle) => win?.clearTimeout?.(handle) ?? globalThis.clearTimeout(handle);

  let scheduledHandle = null;
  const scheduleSync = () => {
    if (scheduledHandle != null) {
      return;
    }
    scheduledHandle = requestFrame(() => {
      scheduledHandle = null;
      syncToolbarQuickHelpCompactState({ toolbar, helpButton });
    });
  };

  const ResizeObserverCtor = win?.ResizeObserver ?? globalThis.ResizeObserver;
  const MutationObserverCtor = win?.MutationObserver ?? globalThis.MutationObserver;

  const resizeObserver = typeof ResizeObserverCtor === 'function'
    ? new ResizeObserverCtor(scheduleSync)
    : null;
  resizeObserver?.observe(toolbar);

  const mutationObserver = typeof MutationObserverCtor === 'function'
    ? new MutationObserverCtor(scheduleSync)
    : null;
  mutationObserver?.observe(toolbar, {
    subtree: true,
    childList: true,
    characterData: true,
  });

  win?.addEventListener?.('resize', scheduleSync);
  scheduleSync();

  return () => {
    if (scheduledHandle != null) {
      cancelFrame(scheduledHandle);
      scheduledHandle = null;
    }
    resizeObserver?.disconnect();
    mutationObserver?.disconnect();
    win?.removeEventListener?.('resize', scheduleSync);
  };
}

export function applySetupOpenState({
  appRoot,
  setupArea,
  toggleButton,
  open,
}) {
  const normalized = Boolean(open);
  if (appRoot) {
    appRoot.dataset.setupOpen = normalized ? 'true' : 'false';
  }
  if (setupArea) {
    setupArea.hidden = !normalized;
  }
  if (toggleButton) {
    setToolbarButtonLabel(toggleButton, normalized ? '設定を隠す' : '設定を表示');
    toggleButton.title = normalized ? 'Initial Setup を隠す' : 'Initial Setup を表示';
    toggleButton.setAttribute('aria-expanded', String(normalized));
    toggleButton.setAttribute('aria-pressed', String(normalized));
    toggleButton.dataset.active = normalized ? 'true' : 'false';
  }
  return normalized;
}

export function isPassiveLogResizeEnabled(viewportWidth) {
  return resolveViewportWidth(viewportWidth) >= PASSIVE_LOG_RESIZE_BREAKPOINT_PX;
}

export function resolvePassiveLogMaxHeightPx(
  workspaceHeightPx,
  {
    minHeightPx = PASSIVE_LOG_MIN_HEIGHT_PX,
    minTurnAreaHeightPx = TURN_AREA_MIN_HEIGHT_PX,
  } = {},
) {
  const workspaceHeight = Number(workspaceHeightPx);
  if (!Number.isFinite(workspaceHeight) || workspaceHeight <= 0) {
    return Number.POSITIVE_INFINITY;
  }
  return Math.max(minHeightPx, workspaceHeight - minTurnAreaHeightPx);
}

export function clampPassiveLogPaneHeight(
  heightPx,
  workspaceHeightPx,
  {
    defaultHeightPx = PASSIVE_LOG_DEFAULT_HEIGHT_PX,
    minHeightPx = PASSIVE_LOG_MIN_HEIGHT_PX,
    minTurnAreaHeightPx = TURN_AREA_MIN_HEIGHT_PX,
  } = {},
) {
  const normalizedHeight = Number(heightPx);
  const fallbackHeight = Number(defaultHeightPx);
  const resolvedHeight = Number.isFinite(normalizedHeight) ? normalizedHeight : fallbackHeight;
  const roundedHeight = Math.round(resolvedHeight);
  const minHeight = Math.max(0, Math.round(Number(minHeightPx) || 0));
  const maxHeight = resolvePassiveLogMaxHeightPx(workspaceHeightPx, {
    minHeightPx,
    minTurnAreaHeightPx,
  });
  return Math.min(maxHeight, Math.max(minHeight, roundedHeight));
}

export function applyPassiveLogPaneHeight({
  appRoot,
  paneRoot,
  heightPx,
  workspaceHeightPx,
  viewportWidth,
}) {
  const resizeEnabled = isPassiveLogResizeEnabled(viewportWidth);
  if (appRoot) {
    appRoot.dataset.passiveLogResizeEnabled = resizeEnabled ? 'true' : 'false';
  }
  if (!paneRoot) {
    return null;
  }
  paneRoot.dataset.passiveLogResizeEnabled = resizeEnabled ? 'true' : 'false';
  if (!resizeEnabled) {
    clearPassiveLogPaneHeight(paneRoot);
    return null;
  }

  const clampedHeight = clampPassiveLogPaneHeight(heightPx, workspaceHeightPx);
  paneRoot.style.height = `${clampedHeight}px`;
  paneRoot.style.flexBasis = `${clampedHeight}px`;
  paneRoot.style.flexGrow = '0';
  paneRoot.style.flexShrink = '0';
  paneRoot.style.maxHeight = 'none';
  paneRoot.style.minHeight = `${PASSIVE_LOG_MIN_HEIGHT_PX}px`;
  paneRoot.dataset.passiveLogHeightPx = String(clampedHeight);
  return clampedHeight;
}

export function applyPassiveLogResizingState({ appRoot, active }) {
  const normalized = Boolean(active);
  if (appRoot) {
    appRoot.dataset.passiveLogResizing = normalized ? 'true' : 'false';
  }
  const body = globalThis.document?.body;
  body?.classList.toggle('passive-log-resizing', normalized);
}

export function updatePassiveLogResizeHandle({
  paneRoot,
  heightPx,
  workspaceHeightPx,
}) {
  const handle = paneRoot?.querySelector?.('[data-role="passive-log-resize-handle"]');
  if (!handle) {
    return;
  }
  const minHeight = PASSIVE_LOG_MIN_HEIGHT_PX;
  const maxHeight = resolvePassiveLogMaxHeightPx(workspaceHeightPx);
  const currentHeight = clampPassiveLogPaneHeight(heightPx, workspaceHeightPx);
  handle.setAttribute('aria-valuemin', String(minHeight));
  handle.setAttribute(
    'aria-valuemax',
    String(Number.isFinite(maxHeight) ? Math.round(maxHeight) : currentHeight),
  );
  handle.setAttribute('aria-valuenow', String(currentHeight));
  handle.dataset.resizeEnabled = paneRoot?.dataset.passiveLogResizeEnabled === 'true' ? 'true' : 'false';
}

export function applyPassiveLogOpenState({
  appRoot,
  paneRoot,
  toggleButton,
  open,
  hasRows,
  heightPx,
  workspaceHeightPx,
  viewportWidth,
}) {
  const available = Boolean(hasRows);
  const normalized = available && Boolean(open);
  if (appRoot) {
    appRoot.dataset.passiveLogAvailable = available ? 'true' : 'false';
    appRoot.dataset.passiveLogOpen = normalized ? 'true' : 'false';
  }
  if (paneRoot) {
    paneRoot.hidden = !normalized;
  }
  applyPassiveLogPaneHeight({
    appRoot,
    paneRoot,
    heightPx,
    workspaceHeightPx,
    viewportWidth,
  });
  updatePassiveLogResizeHandle({
    paneRoot,
    heightPx,
    workspaceHeightPx,
  });
  if (toggleButton) {
    toggleButton.disabled = !available;
    setToolbarButtonLabel(toggleButton, normalized ? 'ログを隠す' : 'ログを表示');
    toggleButton.title = available
      ? (normalized ? 'Passive Log を隠す' : 'Passive Log を表示')
      : 'Passive Log はまだありません';
    toggleButton.setAttribute('aria-expanded', String(normalized));
    toggleButton.setAttribute('aria-pressed', String(normalized));
    toggleButton.dataset.active = normalized ? 'true' : 'false';
  }
  return normalized;
}
