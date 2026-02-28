export const SP_CHANGE_SOURCES = Object.freeze([
  'cost',
  'base',
  'od',
  'passive',
  'active',
  'clamp',
]);

/**
 * R10準拠のSP変動処理。
 * 回復時のみ凍結ルールを適用し、消費時は下限のみを見る。
 */
export function applySpChange(current, delta, min, eventCeiling) {
  if (!Number.isFinite(current) || !Number.isFinite(delta) || !Number.isFinite(min)) {
    throw new Error('applySpChange requires finite numeric current/delta/min.');
  }

  if (delta > 0) {
    const effectiveCeiling = Math.max(current, eventCeiling);
    return Math.max(min, Math.min(current + delta, effectiveCeiling));
  }

  return Math.max(min, current + delta);
}

/**
 * source別のSP上限計算。
 */
export function getEventCeiling(source, spMax, skillCeiling) {
  if (!SP_CHANGE_SOURCES.includes(source)) {
    throw new Error(`Unknown SP change source: ${source}`);
  }

  switch (source) {
    case 'cost':
      return Number.POSITIVE_INFINITY;
    case 'od':
      return 99;
    case 'active':
      return Number.isFinite(skillCeiling) ? skillCeiling : spMax;
    default:
      return spMax;
  }
}
