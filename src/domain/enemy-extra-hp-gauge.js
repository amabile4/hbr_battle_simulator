const EXTRA_HP_GAUGE_MIN_VALUE = 1;
const EXTRA_HP_GAUGE_MIN_REMAINING = 0;

function normalizeGaugeValue(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return null;
  }
  const normalized = Math.floor(numeric);
  return normalized >= EXTRA_HP_GAUGE_MIN_VALUE ? normalized : null;
}

function normalizeGaugeValues(values = []) {
  if (!Array.isArray(values)) {
    return [];
  }
  return values
    .map((value) => normalizeGaugeValue(value))
    .filter((value) => value !== null);
}

function normalizeRemainingGaugeCount(value, total, fallback = total) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return Math.min(Math.max(EXTRA_HP_GAUGE_MIN_REMAINING, Number(fallback) || total), total);
  }
  return Math.min(Math.max(EXTRA_HP_GAUGE_MIN_REMAINING, Math.floor(numeric)), total);
}

export function normalizeEnemyExtraHpGaugeState(raw = null, options = {}) {
  const source =
    Array.isArray(raw)
      ? { values: raw }
      : raw && typeof raw === 'object'
        ? raw
        : null;
  if (!source) {
    return null;
  }
  const values = normalizeGaugeValues(source.values ?? source.hp ?? options.values ?? options.hp ?? []);
  if (values.length === 0) {
    return null;
  }
  const total = values.length;
  const remaining = normalizeRemainingGaugeCount(
    options.remaining ?? source.remaining ?? source.current ?? source.count,
    total,
    total
  );
  return {
    total,
    remaining,
    values,
  };
}

export function cloneEnemyExtraHpGaugeState(raw = null, options = {}) {
  const normalized = normalizeEnemyExtraHpGaugeState(raw, options);
  return normalized
    ? {
        ...normalized,
        values: [...normalized.values],
      }
    : null;
}

export function canEnemyHpBreak(raw = null) {
  const normalized = normalizeEnemyExtraHpGaugeState(raw);
  return Boolean(normalized && normalized.remaining > 1);
}

export function decrementEnemyExtraHpGaugeState(raw = null) {
  const normalized = normalizeEnemyExtraHpGaugeState(raw);
  if (!normalized) {
    return null;
  }
  return {
    ...normalized,
    values: [...normalized.values],
    remaining: Math.max(EXTRA_HP_GAUGE_MIN_REMAINING, normalized.remaining - 1),
  };
}
