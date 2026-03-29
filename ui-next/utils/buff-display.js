/**
 * buff-display.js
 *
 * statusEffects 配列からプレイヤーバフを抽出し、アイコン表示用 HTML に変換するユーティリティ。
 * 文字は一切使用せず、assets/skill_type/ の画像アイコンのみで状態を表現する。
 */

import {
  resolveSkillTypeIconUrl,
  STATUS_TYPE_DISPLAY_ORDER,
} from './char-detail-popup.js';

const MAX_TOTAL_BUFF_ICONS = 10;

const NON_BUFF_STATUS_TYPES = new Set([
  'AttackDown',
  'AttackDownOverwrite',
  'DefenseDown',
  'DefenseDownOverwrite',
  'CriticalRateDown',
  'CriticalDamageDown',
  'ResistDown',
  'ResistDownOverwrite',
  'Fragile',
  'HealDown',
  'OverDrivePointDown',
  'ConfusionRandom',
  'ImprisonRandom',
  'StunRandom',
  'RecoilRandom',
  'Misfortune',
  'SelfDamage',
  'RemoveBuff',
]);

const DISPLAY_ORDER_INDEX = new Map(
  STATUS_TYPE_DISPLAY_ORDER.map((statusType, index) => [statusType, index])
);

function isActiveEffect(effect) {
  if (String(effect?.exitCond ?? '') === 'Eternal') return true;
  return Number(effect?.remaining ?? 0) > 0;
}

function isBuffLikeStatusEffect(effect) {
  const statusType = String(effect?.statusType ?? '').trim();
  if (!statusType || NON_BUFF_STATUS_TYPES.has(statusType)) {
    return false;
  }
  if (!DISPLAY_ORDER_INDEX.has(statusType)) {
    return false;
  }
  const metadata = effect?.metadata ?? {};
  if (metadata?.isDebuff === true) {
    return false;
  }
  if (Number(metadata?.specialStatusTypeId) === 146) {
    return false;
  }
  return true;
}

function readEffectPower(effect) {
  const numeric = Number(effect?.power ?? 0);
  if (!Number.isFinite(numeric)) {
    return 0;
  }
  return numeric;
}

function compareStatusEffectsByPowerDesc(a, b) {
  const powerA = readEffectPower(a);
  const powerB = readEffectPower(b);
  if (powerA !== powerB) {
    return powerB - powerA;
  }
  const remainingA = Number(a?.remaining ?? 0);
  const remainingB = Number(b?.remaining ?? 0);
  if (remainingA !== remainingB) {
    return remainingB - remainingA;
  }
  const idA = Number(a?.effectId ?? 0);
  const idB = Number(b?.effectId ?? 0);
  return idA - idB;
}

function pickTopStatusEffectsByPower(effects, limit) {
  const max = Math.max(0, Number(limit) || 0);
  if (max <= 0) {
    return [];
  }
  return effects
    .slice()
    .sort(compareStatusEffectsByPowerDesc)
    .slice(0, max);
}

function isCountLikeEffect(effect) {
  if (String(effect?.limitType ?? '') === 'Only') {
    return false;
  }
  return String(effect?.exitCond ?? '') === 'Count' || String(effect?.limitType ?? '') === 'Count';
}

function selectAdoptedEffectsByCompetition(effects) {
  const persistentDefaults = effects.filter(
    (effect) => String(effect?.limitType ?? '') !== 'Only' && !isCountLikeEffect(effect)
  );
  const onlyCandidates = effects.filter((effect) => String(effect?.limitType ?? '') === 'Only');
  const countCandidates = effects.filter((effect) => isCountLikeEffect(effect));

  const bestOnly = pickTopStatusEffectsByPower(onlyCandidates, 1)[0] ?? null;
  const topCount = pickTopStatusEffectsByPower(countCandidates, 2);
  const onlyPower = bestOnly ? readEffectPower(bestOnly) : 0;
  const countPower = topCount.reduce((sum, effect) => sum + readEffectPower(effect), 0);
  const adopted = countPower >= onlyPower ? topCount : bestOnly ? [bestOnly] : [];

  return [...persistentDefaults, ...adopted];
}

/**
 * statusEffects 配列から表示対象バフのみを抽出する。
 * @param {Array} statusEffects
 * @returns {Array}
 */
export function getDisplayableBuffs(statusEffects) {
  if (!Array.isArray(statusEffects)) return [];
  return statusEffects.filter((effect) => isActiveEffect(effect) && isBuffLikeStatusEffect(effect));
}

/**
 * statusEffects からバフアイコン一覧の HTML を生成する。
 * - 単独発動（limitType === 'Only'）: 同種 1 個
 * - それ以外: 同種 最大 2 個
 * バフが 0 件のときは空文字を返す。
 * @param {Array} statusEffects
 * @returns {string}
 */
export function buildBuffListHtml(statusEffects) {
  const activeBuffs = getDisplayableBuffs(statusEffects);
  if (activeBuffs.length === 0) return '';

  // statusType ごとにグループ化
  const byType = new Map();
  for (const effect of activeBuffs) {
    if (!byType.has(effect.statusType)) byType.set(effect.statusType, []);
    byType.get(effect.statusType).push(effect);
  }

  const parts = [];
  let iconCount = 0;
  const orderedStatusTypes = [...byType.keys()].sort((a, b) => {
    return (DISPLAY_ORDER_INDEX.get(a) ?? Number.MAX_SAFE_INTEGER) -
      (DISPLAY_ORDER_INDEX.get(b) ?? Number.MAX_SAFE_INTEGER);
  });

  for (const statusType of orderedStatusTypes) {
    const effects = byType.get(statusType) ?? [];
    const adoptedEffects = selectAdoptedEffectsByCompetition(effects);
    if (adoptedEffects.length === 0) {
      continue;
    }
    const iconUrl = resolveSkillTypeIconUrl(statusType);
    if (!iconUrl) continue;
    const countByType = adoptedEffects.length;
    const allowedCount = Math.min(countByType, MAX_TOTAL_BUFF_ICONS - iconCount);
    for (let i = 0; i < allowedCount; i++) {
      parts.push(`<img src="${iconUrl}" alt="${statusType}" class="buff-icon" />`);
      iconCount += 1;
    }
    if (iconCount >= MAX_TOTAL_BUFF_ICONS) {
      break;
    }
  }

  if (parts.length === 0) return '';
  return `<div class="buff-icon-list">${parts.join('')}</div>`;
}
