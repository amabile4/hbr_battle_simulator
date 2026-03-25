/**
 * buff-display.js
 *
 * statusEffects 配列からプレイヤーバフを抽出し、HTML 表示用に変換するユーティリティ。
 * 保持情報: バフ種別 / 持続ターン / 効果値 / 付与者名
 */

const DISPLAYABLE_BUFF_TYPES = new Set([
  'AttackUp',
  'DefenseUp',
  'CriticalRateUp',
  'CriticalDamageUp',
  'HealDpRate',
  'DebuffGuard',
  'BuffCharge',
]);

const BUFF_LABELS = {
  AttackUp: '攻↑',
  DefenseUp: '防↑',
  CriticalRateUp: 'CT率↑',
  CriticalDamageUp: 'CT倍↑',
  HealDpRate: '回復↑',
  DebuffGuard: 'Dガード',
  BuffCharge: 'バフ蓄',
};

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

function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * 1件のバフを HTML タグ文字列に変換する。
 * @param {object} effect
 * @returns {string}
 */
export function buildBuffTagHtml(effect) {
  const label = BUFF_LABELS[effect.statusType] ?? String(effect.statusType ?? '');
  const power = Number(effect.power ?? 0);
  const powerStr = power > 0 ? `+${Math.round(power * 100)}%` : '';
  const remaining =
    String(effect.exitCond ?? '') === 'Eternal' ? '∞' : `${Number(effect.remaining ?? 0)}`;
  const fromName = String(effect.sourceCharacterName ?? '').trim();
  const tooltip = [label, powerStr, `${remaining}T`, fromName ? `(${fromName})` : '']
    .filter(Boolean)
    .join(' ');
  return (
    `<span class="buff-tag" title="${escapeHtml(tooltip)}">` +
    escapeHtml(label) +
    (powerStr ? `<span class="buff-power">${escapeHtml(powerStr)}</span>` : '') +
    `<span class="buff-remaining">${escapeHtml(remaining)}</span>` +
    `</span>`
  );
}

/**
 * statusEffects からバフ一覧の HTML を生成する。
 * バフが 0 件のときは空文字を返す。
 * @param {Array} statusEffects
 * @returns {string}
 */
export function buildBuffListHtml(statusEffects) {
  const buffs = getDisplayableBuffs(statusEffects);
  if (buffs.length === 0) return '';
  return `<div class="buff-list">${buffs.map(buildBuffTagHtml).join('')}</div>`;
}
