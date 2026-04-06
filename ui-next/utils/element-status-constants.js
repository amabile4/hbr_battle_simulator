/**
 * element-status-constants.js
 *
 * 属性付き statusType の共有定数。
 * char-detail-popup.js / enemy-status-display.js の双方から参照する。
 *
 * T34-FU2: レビュー Minor 指摘 — 重複定義の共通化
 */

// 属性スキルタイプ用漢字マップ
export const ELEMENT_KANJI = Object.freeze({
  Fire:    '火',
  Ice:     '氷',
  Thunder: '雷',
  Light:   '光',
  Dark:    '闇',
});

// elements_skill.md に対応する element-prefixed statusType セット
// {Element}{BaseType}.webp アイコンが存在し、ラベルに属性漢字を付加する対象
export const ELEMENT_PREFIXED_STATUS_TYPES = new Set([
  'DarkAttackUp', 'DarkCriticalDamageUp', 'DarkCriticalRateUp', 'DarkDefenseDown',
  'DarkResistDown', 'DarkResistDownOverwrite', 'DarkZone',
  'FireAttackUp', 'FireCriticalDamageUp', 'FireCriticalRateUp', 'FireDefenseDown',
  'FireResistDown', 'FireResistDownOverwrite', 'FireZone',
  'IceAttackUp', 'IceCriticalDamageUp', 'IceCriticalRateUp', 'IceDefenseDown',
  'IceResistDown', 'IceResistDownOverwrite', 'IceSuperBreak', 'IceZone',
  'LightAttackUp', 'LightCriticalDamageUp', 'LightCriticalRateUp', 'LightDefenseDown',
  'LightResistDown', 'LightResistDownOverwrite', 'LightSuperBreak', 'LightZone',
  'ThunderAttackUp', 'ThunderCriticalDamageUp', 'ThunderCriticalRateUp', 'ThunderDefenseDown',
  'ThunderResistDown', 'ThunderResistDownOverwrite', 'ThunderZone',
]);
