const E_SHIELD_MIN_COUNT = 0;

function normalizeEnemyEShieldCount(value, fallback = 0) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return Math.max(E_SHIELD_MIN_COUNT, Math.floor(Number(fallback) || 0));
  }
  return Math.max(E_SHIELD_MIN_COUNT, Math.floor(numeric));
}

export function normalizeEnemyEShieldElements(elements = null) {
  if (!Array.isArray(elements)) {
    return [];
  }
  return [...new Set(elements.map((value) => String(value ?? '').trim()).filter(Boolean))];
}

export function normalizeEnemyEShieldState(raw = null, options = {}) {
  if (!raw || typeof raw !== 'object') {
    return null;
  }

  const normalizedCurrent = normalizeEnemyEShieldCount(
    options.current ?? options.count ?? raw.current ?? raw.count,
    0
  );
  const normalizedMax = normalizeEnemyEShieldCount(
    options.max ?? raw.max ?? raw.initial ?? raw.current ?? raw.count,
    normalizedCurrent
  );
  const elements = normalizeEnemyEShieldElements(raw.elements ?? raw.ele_list ?? options.elements ?? []);
  if (normalizedMax <= 0 || elements.length === 0) {
    return null;
  }

  const defUpRate = Number(raw.defUpRate ?? raw.def_up_rate ?? options.defUpRate ?? options.def_up_rate ?? 0);
  const damageLimit = Number(raw.damageLimit ?? raw.dmg_limit ?? options.damageLimit ?? options.dmg_limit ?? 0);
  return {
    current: Math.min(normalizedCurrent, normalizedMax),
    max: normalizedMax,
    elements,
    defUpRate: Number.isFinite(defUpRate) ? defUpRate : 0,
    damageLimit: Number.isFinite(damageLimit) ? damageLimit : 0,
  };
}

export function cloneEnemyEShieldState(raw = null, options = {}) {
  const normalized = normalizeEnemyEShieldState(raw, options);
  return normalized
    ? {
        ...normalized,
        elements: [...normalized.elements],
      }
    : null;
}

export function isEnemyEShieldActive(raw = null) {
  const normalized = normalizeEnemyEShieldState(raw);
  return Boolean(normalized && normalized.current > 0);
}

export function restoreEShieldStateToMax(raw = null) {
  const normalized = normalizeEnemyEShieldState(raw);
  if (!normalized) {
    return null;
  }
  return {
    ...normalized,
    elements: [...normalized.elements],
    current: normalized.max,
  };
}
