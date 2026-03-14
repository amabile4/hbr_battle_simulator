/**
 * support_skills.json の 1グループと LB レベルから
 * lb_lv <= limitBreakLevel の最大エントリを返す
 *
 * @param {{ list: Array<{ lb_lv: number, passive: object }> } | null} supportGroup
 * @param {number} limitBreakLevel
 * @returns {{ lb_lv: number, passive: object } | null}
 */
export function resolveSupportPassiveEntry(supportGroup, limitBreakLevel) {
  if (!supportGroup || !Array.isArray(supportGroup.list)) return null;
  const sorted = [...supportGroup.list].sort((a, b) => b.lb_lv - a.lb_lv);
  return sorted.find((entry) => entry.lb_lv <= limitBreakLevel) ?? null;
}

/**
 * entry.passive を sourceType:'support' 付きのオブジェクトに変換
 *
 * @param {object} passive
 * @param {object | null} sourceMeta
 * @returns {object}
 */
export function buildSupportPassive(passive, sourceMeta) {
  return {
    ...structuredClone(passive),
    sourceType: 'support',
    sourceMeta: structuredClone(sourceMeta ?? {}),
    tier: '',
  };
}
