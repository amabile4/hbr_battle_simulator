const TURN_ROW_SELECTOR = '[data-turn-row]';
const TURN_BUTTONS_SELECTOR = '[data-turn-buttons]';
const TURN_NOTE_SELECTOR = '[data-turn-note]';
const TURN_ROW_LIST_SELECTOR = '[data-role="turn-row-list"]';
const TURN_CAPTURE_CUSTOM_PROPERTY_PREFIX = '--turn-';
const TURN_SLOT_LAYOUT_DATASET_KEY = 'turnSlotLayout';
const CAPTURE_NOTE_WIDTH_CUSTOM_PROPERTY = '--png-capture-note-width';
const CAPTURE_HIDDEN_BUTTON_WIDTH_CUSTOM_PROPERTY = '--png-capture-hidden-buttons-width';
const CAPTURE_CONTAINER_TYPE = 'inline-size';
const CAPTURE_CONTAINER_NAME = 'turn-area';
const COMMITTED_ROW_MODE = 'committed';
const BATTLE_ENDED_DATASET_VALUE = 'true';
const OFFSCREEN_LEFT_PX = -100000;

// PNG export intentionally uses an offscreen clone instead of mutating live turn-area DOM.
// Future layout changes should extend clone-root metadata/measurements here, not add
// temporary live-DOM rewrites unless the export architecture itself is being reconsidered.
function resolveCaptureWidth(turnAreaRoot) {
  const rect = typeof turnAreaRoot?.getBoundingClientRect === 'function'
    ? turnAreaRoot.getBoundingClientRect()
    : null;
  const measuredWidth = Math.ceil(
    rect?.width ??
    turnAreaRoot?.clientWidth ??
    turnAreaRoot?.offsetWidth ??
    turnAreaRoot?.scrollWidth ??
    0
  );
  return measuredWidth > 0 ? measuredWidth : null;
}

function isBattleEndedRow(row) {
  return String(row?.dataset?.battleEnded ?? 'false') === BATTLE_ENDED_DATASET_VALUE;
}

function copyTurnLayoutCustomProperties(source, target) {
  if (
    typeof window === 'undefined' ||
    !(source instanceof window.HTMLElement) ||
    !(target instanceof window.HTMLElement) ||
    typeof window.getComputedStyle !== 'function'
  ) {
    return;
  }

  const computedStyle = window.getComputedStyle(source);
  for (let index = 0; index < computedStyle.length; index += 1) {
    const propertyName = computedStyle.item(index);
    if (!String(propertyName).startsWith(TURN_CAPTURE_CUSTOM_PROPERTY_PREFIX)) {
      continue;
    }
    target.style.setProperty(propertyName, computedStyle.getPropertyValue(propertyName));
  }
}

function resolveMaxWidth(root, selector) {
  if (typeof root?.querySelectorAll !== 'function') {
    return null;
  }

  let maxWidth = null;
  [...root.querySelectorAll(selector)].forEach((element) => {
    const width = resolveCaptureWidth(element);
    if (width === null) {
      return;
    }
    maxWidth = maxWidth === null ? width : Math.max(maxWidth, width);
  });
  return maxWidth;
}

function applyCaptureLayoutContext(turnAreaRoot, captureRoot) {
  if (
    typeof window === 'undefined' ||
    !(captureRoot instanceof window.HTMLElement)
  ) {
    return;
  }

  captureRoot.style.setProperty('container-type', CAPTURE_CONTAINER_TYPE);
  captureRoot.style.setProperty('container-name', CAPTURE_CONTAINER_NAME);

  const turnSlotLayout = String(turnAreaRoot?.dataset?.[TURN_SLOT_LAYOUT_DATASET_KEY] ?? '').trim();
  if (turnSlotLayout) {
    captureRoot.dataset[TURN_SLOT_LAYOUT_DATASET_KEY] = turnSlotLayout;
  }

  const noteWidth = resolveMaxWidth(turnAreaRoot, TURN_NOTE_SELECTOR);
  if (noteWidth !== null) {
    captureRoot.style.setProperty(CAPTURE_NOTE_WIDTH_CUSTOM_PROPERTY, `${noteWidth}px`);
  }

  const buttonWidth = resolveMaxWidth(turnAreaRoot, TURN_BUTTONS_SELECTOR);
  if (buttonWidth !== null) {
    captureRoot.style.setProperty(CAPTURE_HIDDEN_BUTTON_WIDTH_CUSTOM_PROPERTY, `${buttonWidth}px`);
  }
}

export function buildPngCaptureClone(turnAreaRoot, { captureUntilBattleEnd = false } = {}) {
  // Export source is the committed turn-row list. Wrapper chrome stays out of the PNG,
  // and export-specific layout state lives on captureRoot so the live DOM remains untouched.
  const sourceRowList = turnAreaRoot?.querySelector?.(TURN_ROW_LIST_SELECTOR) ?? null;
  const sourceNode = sourceRowList ?? turnAreaRoot;
  const rowListClone = sourceNode.cloneNode(true);
  const captureRoot = document.createElement('div');
  const captureWidth =
    resolveCaptureWidth(sourceNode) ??
    resolveCaptureWidth(turnAreaRoot);

  captureRoot.dataset.captureMode = 'png';
  captureRoot.style.overflow = 'visible';
  captureRoot.style.display = 'block';
  captureRoot.style.boxSizing = 'border-box';
  captureRoot.style.backgroundColor = '#ffffff';
  applyCaptureLayoutContext(turnAreaRoot, captureRoot);
  if (captureWidth !== null) {
    captureRoot.style.width = `${captureWidth}px`;
    captureRoot.style.minWidth = `${captureWidth}px`;
  }
  rowListClone.style.display = 'block';
  rowListClone.style.boxSizing = 'border-box';
  rowListClone.style.width = '100%';
  rowListClone.style.minWidth = '100%';
  copyTurnLayoutCustomProperties(sourceNode, captureRoot);

  let battleEndFound = false;
  let committedRowCount = 0;
  const rows = [...rowListClone.querySelectorAll(TURN_ROW_SELECTOR)];
  rows.forEach((row) => {
    if (String(row.dataset.rowMode ?? '') !== COMMITTED_ROW_MODE) {
      row.remove();
      return;
    }

    committedRowCount += 1;
    if (captureUntilBattleEnd && battleEndFound) {
      row.remove();
      return;
    }

    row.querySelectorAll(TURN_BUTTONS_SELECTOR).forEach((buttonColumn) => {
      buttonColumn.hidden = true;
      buttonColumn.setAttribute('aria-hidden', 'true');
    });

    if (isBattleEndedRow(row)) {
      battleEndFound = true;
    }
  });

  captureRoot.appendChild(rowListClone);

  return {
    clone: captureRoot,
    meta: {
      battleEndFound,
      captureWidth,
      committedRowCount,
      truncatedAtBattleEnd: Boolean(captureUntilBattleEnd && battleEndFound),
    },
  };
}

export function mountPngCaptureSandbox(turnAreaRoot, options = {}) {
  const { clone, meta } = buildPngCaptureClone(turnAreaRoot, options);
  const sandbox = document.createElement('div');
  sandbox.dataset.captureSandbox = 'png';
  sandbox.style.position = 'fixed';
  sandbox.style.left = `${OFFSCREEN_LEFT_PX}px`;
  sandbox.style.top = '0';
  sandbox.style.display = 'block';
  sandbox.style.pointerEvents = 'none';
  sandbox.style.overflow = 'hidden';
  sandbox.style.backgroundColor = '#ffffff';
  sandbox.style.width = meta.captureWidth !== null ? `${meta.captureWidth}px` : 'max-content';

  sandbox.appendChild(clone);
  document.body.appendChild(sandbox);

  return {
    meta,
    target: clone,
    cleanup() {
      sandbox.remove();
    },
  };
}
