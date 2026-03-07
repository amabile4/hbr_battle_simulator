export const START_SP_BASE = 1;
export const START_SP_FIXED_BONUS = 2;
export const DEFAULT_INITIAL_SP = START_SP_BASE + START_SP_FIXED_BONUS;
export const DEFAULT_START_SP_EQUIP_BONUS = 3;
export const DEFAULT_ENEMY_COUNT = 1;
export const MIN_ENEMY_COUNT = 1;
export const MAX_ENEMY_COUNT = 3;

export const OD_LEVELS = Object.freeze([1, 2, 3]);
export const OD_RECOVERY_BY_LEVEL = Object.freeze({ 1: 5, 2: 12, 3: 20 });
export const OD_COST_BY_LEVEL = Object.freeze({ 1: 100, 2: 200, 3: 300 });
export const OD_GAUGE_PER_HIT_PERCENT = 2.5;
export const OD_GAUGE_MIN_PERCENT = -999.99;
export const OD_GAUGE_MAX_PERCENT = 300;
export const REINFORCED_MODE_OD_GAUGE_BONUS = 15;

export const DRIVE_PIERCE_OPTION_VALUES = Object.freeze([0, 10, 12, 15]);
export const DRIVE_PIERCE_OPTIONS = Object.freeze([
  { value: 0, label: 'ドライブピアスなし' },
  { value: 10, label: 'ドライブピアス +10%' },
  { value: 12, label: 'ドライブピアス +12%' },
  { value: 15, label: 'ドライブピアス +15%' },
]);
export const DRIVE_PIERCE_BASE_BONUS_AT_HIT_1 = 5;
export const DRIVE_PIERCE_MAX_REFERENCE_HIT = 10;

export function getOdGaugeRequirement(level) {
  return Number(OD_COST_BY_LEVEL[Number(level)] ?? 0);
}

export function clampEnemyCount(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) {
    return DEFAULT_ENEMY_COUNT;
  }
  return Math.max(MIN_ENEMY_COUNT, Math.min(MAX_ENEMY_COUNT, n));
}
