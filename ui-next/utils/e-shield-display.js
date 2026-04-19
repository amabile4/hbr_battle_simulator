import { normalizeEnemyEShieldState } from '../../src/domain/enemy-e-shield.js';

const E_SHIELD_ELEMENT_DISPLAY_LABELS = Object.freeze({
  Fire: '火',
  Ice: '氷',
  Thunder: '雷',
  Light: '光',
  Dark: '闇',
});

const E_SHIELD_ELEMENT_COLORS = Object.freeze({
  Fire: '#ef4444',
  Ice: '#38bdf8',
  Thunder: '#facc15',
  Light: '#fde68a',
  Dark: '#7c3aed',
});

const E_SHIELD_DEPLETED_FILL =
  'radial-gradient(circle at 35% 25%, #f8fafc 0%, #cbd5e1 42%, #94a3b8 100%)';

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function resolveEnemyEShieldElementColor(element) {
  return E_SHIELD_ELEMENT_COLORS[String(element ?? '').trim()] ?? '#60a5fa';
}

function resolveEnemyEShieldFill(state) {
  if (!state || state.current <= 0) {
    return E_SHIELD_DEPLETED_FILL;
  }

  const colors = state.elements.slice(0, 3).map((element) => resolveEnemyEShieldElementColor(element));
  if (colors.length <= 1) {
    const baseColor = colors[0] ?? '#60a5fa';
    return `radial-gradient(circle at 35% 25%, #ffffff 0%, ${baseColor} 34%, ${baseColor} 64%, #1d4ed8 100%)`;
  }
  if (colors.length === 2) {
    return `linear-gradient(135deg, ${colors[0]} 0 49%, ${colors[1]} 51% 100%)`;
  }
  return `conic-gradient(from -90deg at 50% 42%, ${colors[0]} 0 33.33%, ${colors[1]} 33.33% 66.66%, ${colors[2]} 66.66% 100%)`;
}

export function normalizeEnemyEShieldDisplayState(raw = null) {
  return normalizeEnemyEShieldState(raw);
}

export function isDisplayableEnemyEShieldState(raw = null) {
  return Boolean(normalizeEnemyEShieldDisplayState(raw));
}

export function formatEnemyEShieldGaugeLabel(raw = null, options = {}) {
  const state = normalizeEnemyEShieldDisplayState(raw);
  if (!state) {
    return '';
  }
  return options.showMax === false ? String(state.current) : `${state.current}/${state.max}`;
}

export function formatEnemyEShieldElementsLabel(raw = null, options = {}) {
  const state = normalizeEnemyEShieldDisplayState(raw);
  if (!state || state.elements.length === 0) {
    return '';
  }
  const separator = String(options.separator ?? ' / ');
  return state.elements
    .map((element) => E_SHIELD_ELEMENT_DISPLAY_LABELS[element] ?? String(element))
    .join(separator);
}

export function formatEnemyEShieldAccessibleLabel(raw = null, options = {}) {
  const state = normalizeEnemyEShieldDisplayState(raw);
  if (!state) {
    return '';
  }
  const prefix = Number.isInteger(Number(options.enemyIndex))
    ? `E${Number(options.enemyIndex) + 1} `
    : '';
  const gaugeLabel = formatEnemyEShieldGaugeLabel(state, {
    showMax: options.showMax !== false,
  });
  const elementLabel = formatEnemyEShieldElementsLabel(state);
  return elementLabel
    ? `${prefix}Eシールド ${gaugeLabel} ${elementLabel}`
    : `${prefix}Eシールド ${gaugeLabel}`;
}

export function buildEnemyEShieldBadgeHtml(raw = null, options = {}) {
  const state = normalizeEnemyEShieldDisplayState(raw);
  if (!state) {
    return '';
  }

  const mode = String(options.mode ?? 'row') === 'popup' ? 'popup' : 'row';
  const badgeRole = String(options.dataRole ?? 'enemy-e-shield-badge').trim() || 'enemy-e-shield-badge';
  const showSlotMarker =
    options.showSlotMarker !== false && Number.isInteger(Number(options.enemyIndex));
  const currentLabel = String(state.current);
  const splitCount = Math.max(1, Math.min(state.elements.length || 1, 3));
  const digitCount = Math.max(1, Math.min(currentLabel.length, 3));
  const classes = [
    'enemy-e-shield-badge',
    `enemy-e-shield-badge--${mode}`,
    `enemy-e-shield-badge--split-${splitCount}`,
    `enemy-e-shield-badge--digits-${digitCount}`,
  ];
  if (state.current <= 0) {
    classes.push('enemy-e-shield-badge--depleted');
  }

  const accessibleLabel = formatEnemyEShieldAccessibleLabel(state, {
    enemyIndex: options.enemyIndex,
    showMax: options.showMaxInLabel !== false,
  });
  const slotMarkerHtml = showSlotMarker
    ? `<span class="enemy-e-shield-badge__slot-marker" data-role="enemy-e-shield-slot-marker">${Number(options.enemyIndex) + 1}</span>`
    : '';

  return `
    <span
      class="${classes.join(' ')}"
      data-role="${escapeHtml(badgeRole)}"
      data-eshield-split-count="${splitCount}"
      data-eshield-depleted="${state.current <= 0 ? 'true' : 'false'}"
      data-eshield-current="${state.current}"
      data-eshield-max="${state.max}"
      style="--enemy-e-shield-fill:${escapeHtml(resolveEnemyEShieldFill(state))};"
      title="${escapeHtml(accessibleLabel)}"
      aria-label="${escapeHtml(accessibleLabel)}"
      role="img">
      <span class="enemy-e-shield-badge__shape" aria-hidden="true"></span>
      <span class="enemy-e-shield-badge__shine" aria-hidden="true"></span>
      <span class="enemy-e-shield-badge__value" data-role="enemy-e-shield-badge-value">${escapeHtml(currentLabel)}</span>
      ${slotMarkerHtml}
    </span>
  `;
}
