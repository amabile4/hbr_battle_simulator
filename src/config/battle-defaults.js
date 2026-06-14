export const START_SP_BASE = 1;
export const START_SP_FIXED_BONUS = 2;
export const DEFAULT_INITIAL_SP = START_SP_BASE + START_SP_FIXED_BONUS;
export const DEFAULT_START_SP_EQUIP_BONUS = 3;
export const ANCIENT_CHAIN_EQUIP_ID = 'ancient_chain';
export const ANCIENT_CHAIN_START_SP_BONUS = 3;
export const ANCIENT_CHAIN_SKILL_ATTACK_UP_RATE = 0.1;
export const ANCIENT_CHAIN_FLAT_DESTRUCTION_RATE_BONUS = 0.1;
export const ANCIENT_CHAIN_CONTRIBUTION_LABEL = 'エンシェントチェーン';
export const DEFAULT_ENEMY_COUNT = 1;
export const MIN_ENEMY_COUNT = 1;
export const MAX_ENEMY_COUNT = 3;
export const DEFAULT_ENEMY_RESISTANCE_RATE_PERCENT = 100;
// od_rate の単位: od_rate * 0.01% が実際の乗数 (例: 8500 → 85% → 0.85 倍)
// od_rate=0 の場合は補正なし（係数 1.0 扱い）
export const ENEMY_OD_RATE_UNIT = 10000;
export const DEFAULT_DESTRUCTION_RATE_PERCENT = 100;
export const DEFAULT_DESTRUCTION_RATE_CAP_PERCENT = 300;
export const SPECIAL_BREAK_CAP_BONUS_PERCENT = 300;
export const MARK_STATE_ELEMENTS = Object.freeze(['Fire', 'Ice', 'Thunder', 'Dark', 'Light']);
export const DEFAULT_MARK_LEVEL_MAX = 6;
export const INTRINSIC_MARK_EFFECTS_BY_ELEMENT = Object.freeze({
  Fire: Object.freeze({
    skillDamageUpRateAtLevel1: 0.3,
    damageTakenDownRateAtLevel2: 0.1,
    destructionRateGainBonusRateAtLevel3: 0.1, // 破壊率上昇量+10%（WIP: 破壊率追跡未実装のため damageContext 保持のみ）
    criticalRateUpAtLevel4: 0.3,
    criticalDamageUpAtLevel5: 0.3,
    extraFrontSpAtTurnStartAtLevel6: 1,
  }),
  Ice: Object.freeze({
    skillDamageUpRateAtLevel1: 0.3,
    damageTakenDownRateAtLevel2: 0.1,
    destructionRateGainBonusRateAtLevel3: 0.1, // 破壊率上昇量+10%（WIP: 破壊率追跡未実装のため damageContext 保持のみ）
    criticalRateUpAtLevel4: 0.3,
    criticalDamageUpAtLevel5: 0.3,
    extraFrontSpAtTurnStartAtLevel6: 1,
  }),
  Thunder: Object.freeze({
    skillDamageUpRateAtLevel1: 0.3,
    damageTakenDownRateAtLevel2: 0.1,
    destructionRateGainBonusRateAtLevel3: 0.1, // 破壊率上昇量+10%（WIP: 破壊率追跡未実装のため damageContext 保持のみ）
    criticalRateUpAtLevel4: 0.3,
    criticalDamageUpAtLevel5: 0.3,
    extraFrontSpAtTurnStartAtLevel6: 1,
  }),
  Dark: Object.freeze({
    skillDamageUpRateAtLevel1: 0.3,
    damageTakenDownRateAtLevel2: 0.1,
    destructionRateGainBonusRateAtLevel3: 0.1, // 破壊率上昇量+10%（WIP: 破壊率追跡未実装のため damageContext 保持のみ）
    criticalRateUpAtLevel4: 0.3,
    criticalDamageUpAtLevel5: 0.3,
    extraFrontSpAtTurnStartAtLevel6: 1,
  }),
  Light: Object.freeze({
    skillDamageUpRateAtLevel1: 0.3,
    damageTakenDownRateAtLevel2: 0.1,
    destructionRateGainBonusRateAtLevel3: 0.1, // 破壊率上昇量+10%（WIP: 破壊率追跡未実装のため damageContext 保持のみ）
    criticalRateUpAtLevel4: 0.3,
    criticalDamageUpAtLevel5: 0.3,
    extraFrontSpAtTurnStartAtLevel6: 1,
  }),
});

export const OD_LEVELS = Object.freeze([1, 2, 3]);
export const OD_RECOVERY_BY_LEVEL = Object.freeze({ 1: 5, 2: 12, 3: 20 });
export const OD_COST_BY_LEVEL = Object.freeze({ 1: 100, 2: 200, 3: 300 });
export const OD_GAUGE_PER_HIT_PERCENT = 2.5;
export const OD_GAUGE_MIN_PERCENT = -999.99;
export const OD_GAUGE_MAX_PERCENT = 300;
export const REINFORCED_MODE_OD_GAUGE_BONUS = 15;

export const PIERCE_OPTION_VALUES = Object.freeze([0, 10, 12, 15]);
export const PIERCE_BASE_BONUS_MIN_PERCENT = 5;
export const PIERCE_MAX_REFERENCE_HIT = 10;
export const FUNNEL_DESTRUCTION_RATE_PER_HIT = Object.freeze({
  0: 0.06,
  1: 0.06,
  2: 0.12,
  3: 0.25,
  5: 0.50,
});

export const DRIVE_PIERCE_OPTION_VALUES = PIERCE_OPTION_VALUES;
export const DRIVE_PIERCE_OPTIONS = Object.freeze([
  { value: 0, label: 'ドライブピアスなし' },
  { value: 10, label: 'ドライブピアス +10%' },
  { value: 12, label: 'ドライブピアス +12%' },
  { value: 15, label: 'ドライブピアス +15%' },
]);
export const DRIVE_PIERCE_BASE_BONUS_AT_HIT_1 = PIERCE_BASE_BONUS_MIN_PERCENT;
export const DRIVE_PIERCE_MAX_REFERENCE_HIT = PIERCE_MAX_REFERENCE_HIT;

// ピアス装備の種別: drive=ODゲージ上昇量(上昇型) / attack=対HPスキル攻撃力(減衰型)
// / break=対DPスキル攻撃力(減衰型) / blast=破壊率上昇量(上昇型)
export const PIERCE_TYPES = Object.freeze(['drive', 'attack', 'break', 'blast']);
export const PIERCE_EQUIP_OPTIONS = Object.freeze([
  { type: 'none', percent: 0, label: 'ピアスなし' },
  { type: 'drive', percent: 10, label: 'ドライブピアス +10%' },
  { type: 'drive', percent: 12, label: 'ドライブピアス +12%' },
  { type: 'drive', percent: 15, label: 'ドライブピアス +15%' },
  { type: 'attack', percent: 10, label: 'アタックピアス +10%' },
  { type: 'attack', percent: 12, label: 'アタックピアス +12%' },
  { type: 'attack', percent: 15, label: 'アタックピアス +15%' },
  { type: 'break', percent: 10, label: 'ブレイクピアス +10%' },
  { type: 'break', percent: 12, label: 'ブレイクピアス +12%' },
  { type: 'break', percent: 15, label: 'ブレイクピアス +15%' },
  { type: 'blast', percent: 10, label: 'ブラストピアス +10%' },
  { type: 'blast', percent: 12, label: 'ブラストピアス +12%' },
  { type: 'blast', percent: 15, label: 'ブラストピアス +15%' },
]);

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
