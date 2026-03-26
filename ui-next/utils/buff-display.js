/**
 * buff-display.js
 *
 * statusEffects 配列からプレイヤーバフを抽出し、アイコン表示用 HTML に変換するユーティリティ。
 * 文字は一切使用せず、assets/skill_type/ の画像アイコンのみで状態を表現する。
 */

const DISPLAYABLE_BUFF_TYPES = new Set([
  'AttackUp',
  'DefenseUp',
  'CriticalRateUp',
  'CriticalDamageUp',
  'DebuffGuard',
  'BuffCharge',
]);

const SKILL_TYPE_ICON_BASE = new URL('../../assets/skill_type/', import.meta.url).href;

function resolveSkillTypeIconUrl(statusType) {
  const name = String(statusType ?? '').trim();
  if (!name) return '';
  return `${SKILL_TYPE_ICON_BASE}${encodeURIComponent(name)}.webp`;
}

function isActiveEffect(effect) {
  if (String(effect?.exitCond ?? '') === 'Eternal') return true;
  return Number(effect?.remaining ?? 0) > 0;
}

/**
 * statusEffects 配列から表示対象バフのみを抽出する。
 * @param {Array} statusEffects
 * @returns {Array}
 */
export function getDisplayableBuffs(statusEffects) {
  if (!Array.isArray(statusEffects)) return [];
  return statusEffects.filter(
    (e) => DISPLAYABLE_BUFF_TYPES.has(String(e?.statusType ?? '')) && isActiveEffect(e)
  );
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
  for (const [statusType, effects] of byType) {
    const iconUrl = resolveSkillTypeIconUrl(statusType);
    if (!iconUrl) continue;
    const isOnlyType = effects.every((e) => String(e.limitType ?? '') === 'Only');
    const count = isOnlyType ? 1 : Math.min(effects.length, 2);
    for (let i = 0; i < count; i++) {
      parts.push(`<img src="${iconUrl}" alt="${statusType}" class="buff-icon" />`);
    }
  }

  if (parts.length === 0) return '';
  return `<div class="buff-icon-list">${parts.join('')}</div>`;
}
