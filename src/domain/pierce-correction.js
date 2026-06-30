import {
  PIERCE_OPTION_VALUES,
  PIERCE_BASE_BONUS_MIN_PERCENT,
  PIERCE_MAX_REFERENCE_HIT,
} from '../config/battle-defaults.js';

function clampReferenceHit(hitCount) {
  const hit = Math.max(1, Number(hitCount ?? 1));
  return Math.min(PIERCE_MAX_REFERENCE_HIT, hit);
}

function pierceStep(piercePercent) {
  return (piercePercent - PIERCE_BASE_BONUS_MIN_PERCENT) / (PIERCE_MAX_REFERENCE_HIT - 1);
}

function isValidPiercePercent(piercePercent) {
  return PIERCE_OPTION_VALUES.includes(piercePercent) && piercePercent !== 0;
}

/**
 * アタック／ブレイクピアス（減衰型）のヒット数補正。
 * 1ヒットで最大値 p%、10ヒット以上で最小値 5%。
 * bonus = p - ((p - 5) / 9) * (clampedHit - 1)
 *
 * @param {number} hitCount - 有効ヒット数
 * @param {number} piercePercent - ピアス倍率（10/12/15）
 * @returns {number} 補正後ボーナス（% 単位、小数第4位まで）
 */
export function resolveAttackOrBreakPierceBonusPercent(hitCount, piercePercent) {
  const p = Number(piercePercent ?? 0);
  if (!isValidPiercePercent(p)) {
    return 0;
  }
  const clamped = clampReferenceHit(hitCount);
  const bonus = p - pierceStep(p) * (clamped - 1);
  return Number(bonus.toFixed(4));
}

/**
 * ブラスト／ドライブピアス（上昇型）のヒット数補正。
 * 1ヒットで最小値 5%、10ヒット以上で最大値 p%。
 * bonus = 5 + ((p - 5) / 9) * (clampedHit - 1)
 *
 * @param {number} hitCount - 有効ヒット数
 * @param {number} piercePercent - ピアス倍率（10/12/15）
 * @returns {number} 補正後ボーナス（% 単位、小数第4位まで）
 */
export function resolveBlastOrDrivePierceBonusPercent(hitCount, piercePercent) {
  const p = Number(piercePercent ?? 0);
  if (!isValidPiercePercent(p)) {
    return 0;
  }
  const clamped = clampReferenceHit(hitCount);
  const bonus = PIERCE_BASE_BONUS_MIN_PERCENT + pierceStep(p) * (clamped - 1);
  return Number(bonus.toFixed(4));
}
