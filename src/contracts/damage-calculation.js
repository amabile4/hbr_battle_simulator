export const DAMAGE_CALCULATION_STAT_KEYS = Object.freeze(['str', 'dex', 'wis', 'spr', 'luk', 'con']);

export const DAMAGE_CALCULATION_ACTIVE_ZONES = Object.freeze([
  'None',
  'FireZone',
  'IceZone',
  'ThunderZone',
  'DarkZone',
  'LightZone',
]);

export const DAMAGE_CALCULATION_BUFF_TYPES = Object.freeze([
  'AttackUp',
  'CritDamageUp',
  'CritBuff',
  'MindEye',
  'Charge',
  'Funnel',
  'ElementAttackUp',
]);

export const DAMAGE_CALCULATION_DEBUFF_TYPES = Object.freeze([
  'DefenseDown',
  'ElementResistDown',
  'Fragile',
]);

export const DAMAGE_DEBUFF_CATEGORIES = Object.freeze([
  'NormalDefense',
  'PermDefense',
  'ElementDefense',
  'PermElementDefense',
  'DPDefense',
]);

export const DAMAGE_FRAGILE_CATEGORIES = Object.freeze(['NormalFragile', 'PermFragile']);

/**
 * @typedef {object} DamageInputContext
 * @property {object} attacker
 * @property {object} defender
 * @property {object} skill
 * @property {'None'|'FireZone'|'IceZone'|'ThunderZone'|'DarkZone'|'LightZone'} activeZone
 */

/**
 * @typedef {object} DamageResult
 * @property {{expected:number,min:number,max:number}} normal
 * @property {{expected:number,min:number,max:number}} critical
 * @property {object} breakdown
 */
