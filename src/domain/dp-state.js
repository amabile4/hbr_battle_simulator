export const DEFAULT_DP_MIN = 0;

function isBlankDpValue(value) {
  return typeof value === 'string' && value.trim() === '';
}

function toFiniteNumber(value, fallback = 0) {
  if (isBlankDpValue(value)) {
    return fallback;
  }
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

export function normalizeBaseMaxDp(value, fallback = 0) {
  return Math.max(DEFAULT_DP_MIN, toFiniteNumber(value, fallback));
}

export function normalizeEffectiveDpCap(value, baseMaxDp = 0) {
  const normalizedBaseMaxDp = normalizeBaseMaxDp(baseMaxDp, 0);
  const fallback = normalizedBaseMaxDp;
  const normalizedValue =
    value === undefined || value === null || isBlankDpValue(value)
      ? fallback
      : toFiniteNumber(value, fallback);
  return Math.max(normalizedBaseMaxDp, normalizedValue);
}

export function normalizeCurrentDp(value, baseMaxDp = 0, effectiveDpCap = baseMaxDp) {
  const normalizedBaseMaxDp = normalizeBaseMaxDp(baseMaxDp, 0);
  const normalizedEffectiveDpCap = normalizeEffectiveDpCap(
    effectiveDpCap,
    normalizedBaseMaxDp
  );
  const fallback = normalizedBaseMaxDp;
  const normalizedValue =
    value === undefined || value === null || isBlankDpValue(value)
      ? fallback
      : toFiniteNumber(value, fallback);
  return Math.max(
    DEFAULT_DP_MIN,
    Math.min(normalizedEffectiveDpCap, normalizedValue)
  );
}

export function createDpState(input = {}) {
  const normalizedBaseMaxDp = normalizeBaseMaxDp(
    input.baseMaxDp ?? input.baseMax,
    0
  );
  const normalizedEffectiveDpCap = normalizeEffectiveDpCap(
    input.effectiveDpCap ?? input.effectiveCap,
    normalizedBaseMaxDp
  );
  const normalizedCurrentDp = normalizeCurrentDp(
    input.currentDp ?? input.current,
    normalizedBaseMaxDp,
    normalizedEffectiveDpCap
  );

  return {
    baseMaxDp: normalizedBaseMaxDp,
    currentDp: normalizedCurrentDp,
    effectiveDpCap: normalizedEffectiveDpCap,
    minDp: DEFAULT_DP_MIN,
  };
}

export function cloneDpState(dpState) {
  return {
    ...createDpState(dpState),
  };
}

export function getDpRate(dpState) {
  const normalized = createDpState(dpState);
  if (normalized.baseMaxDp <= 0) {
    return normalized.currentDp > 0 ? Number.POSITIVE_INFINITY : 0;
  }
  return normalized.currentDp / normalized.baseMaxDp;
}
