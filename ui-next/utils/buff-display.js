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

// true: json/skill_types.json の ID 昇順を優先
// false: 既存の STATUS_TYPE_DISPLAY_ORDER を使用
// すぐ元に戻したい場合はこの1行だけ false に変更する。
const USE_SKILL_TYPE_ID_ASC_ORDER = true;

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

// json/skill_types.json の ID（buff icon 表示で利用頻度の高いもの）
// 未登録 statusType は既存順序へフォールバックする。
const STATUS_TYPE_ID_MAP = Object.freeze({
  HealDp: 20,
  HealSp: 22,
  AttackUp: 30,
  DefenseUp: 36,
  Funnel: 50,
  CriticalRateUp: 70,
  CriticalDamageUp: 74,
  ResistUp: 100,
  BuffCharge: 111,
  GiveAttackBuffUp: 158,
  DamageRateUp: 163,
  MindEye: 187,
  ToughnessUpValue: 199,
  Shredding: 271,
  HighBoost: 289,
  HealUp: 291,
});

function getStatusTypeOrderValue(statusType) {
  const normalized = String(statusType ?? '').trim();
  const displayIndex = DISPLAY_ORDER_INDEX.get(normalized);

  if (USE_SKILL_TYPE_ID_ASC_ORDER) {
    const id = STATUS_TYPE_ID_MAP[normalized];
    if (Number.isFinite(id)) {
      return id;
    }
    // ID未定義タイプは既存順序を維持しつつ、ID定義タイプの後ろへ。
    if (displayIndex !== undefined) {
      return 10000 + displayIndex;
    }
    return 20000;
  }

  return displayIndex ?? Number.MAX_SAFE_INTEGER;
}

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

function escapeHtmlAttr(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function buildBuffIconImgHtml({ iconUrl = '', alt = '', title = '' } = {}) {
  const src = String(iconUrl ?? '').trim();
  if (!src) {
    return '';
  }
  const altText = escapeHtmlAttr(alt);
  const titleText = String(title ?? '').trim();
  const titleAttr = titleText ? ` title="${escapeHtmlAttr(titleText)}"` : '';
  return `<img src="${escapeHtmlAttr(src)}" alt="${altText}" class="buff-icon"${titleAttr} />`;
}

function normalizeExtraIcons(icons) {
  if (!Array.isArray(icons)) {
    return [];
  }
  return icons.filter((icon) => icon && typeof icon === 'object');
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
  return buildBuffListHtmlWithExtras(statusEffects, {});
}

/**
 * statusEffects 由来のアイコンに加え、外部状態（例: 鬼神化/行動不能）を
 * 同じ .buff-icon-list に合流させる。
 * @param {Array} statusEffects
 * @param {{ prependIcons?: Array<{iconUrl: string, alt?: string, title?: string}>, appendIcons?: Array<{iconUrl: string, alt?: string, title?: string}> }} options
 * @returns {string}
 */
export function buildBuffListHtmlWithExtras(statusEffects, options = {}) {
  const prependIcons = normalizeExtraIcons(options?.prependIcons);
  const appendIcons = normalizeExtraIcons(options?.appendIcons);
  const activeBuffs = getDisplayableBuffs(statusEffects);

  // statusType ごとにグループ化
  const byType = new Map();
  for (const effect of activeBuffs) {
    if (!byType.has(effect.statusType)) byType.set(effect.statusType, []);
    byType.get(effect.statusType).push(effect);
  }

  const parts = [];
  let iconCount = 0;

  for (const icon of prependIcons) {
    if (iconCount >= MAX_TOTAL_BUFF_ICONS) {
      break;
    }
    const iconHtml = buildBuffIconImgHtml(icon);
    if (!iconHtml) {
      continue;
    }
    parts.push(iconHtml);
    iconCount += 1;
  }

  const orderedStatusTypes = [...byType.keys()].sort((a, b) => {
    return getStatusTypeOrderValue(a) - getStatusTypeOrderValue(b);
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

  for (const icon of appendIcons) {
    if (iconCount >= MAX_TOTAL_BUFF_ICONS) {
      break;
    }
    const iconHtml = buildBuffIconImgHtml(icon);
    if (!iconHtml) {
      continue;
    }
    parts.push(iconHtml);
    iconCount += 1;
  }

  if (parts.length === 0) return '';
  return `<div class="buff-icon-list">${parts.join('')}</div>`;
}

export function buildActionDisabledIconEntry(actionDisabledTurns) {
  if (!(Number(actionDisabledTurns) > 0)) return null;
  const iconUrl = resolveSkillTypeIconUrl('RecoilRandom');
  if (!iconUrl) return null;
  return {
    iconUrl,
    alt: '行動不能',
    title: `行動不能: 残${Number(actionDisabledTurns)}T`,
  };
}

/**
 * actionDisabledTurns > 0 のとき RecoilRandom アイコンを buff-icon-list と同じ形式で返す。
 * engine は鬼神化終了の行動不能を statusEffects ではなく専用カウンターで管理するため、
 * buff-display の通常経路では表示されない。このヘルパーで補完する。
 * @param {number} actionDisabledTurns
 * @returns {string}
 */
export function buildActionDisabledIconHtml(actionDisabledTurns) {
  const entry = buildActionDisabledIconEntry(actionDisabledTurns);
  if (!entry) return '';
  return buildBuffListHtmlWithExtras([], { prependIcons: [entry] });
}
