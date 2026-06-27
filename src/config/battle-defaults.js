export const START_SP_BASE = 1;
export const START_SP_FIXED_BONUS = 2;
export const DEFAULT_INITIAL_SP = START_SP_BASE + START_SP_FIXED_BONUS;
export const DEFAULT_START_SP_EQUIP_BONUS = 3;
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

// ─── define_values.json からの派生定数ビルダー ───────────────────────────────
// MasterDefineValue.json のスケール変換:
//   /10000 → 3000 → 0.3 (rate 系 × basis-point 型)
//   /100   → 30 → 0.3   (CRITICAL_RATE_UP は percent 型)
//   raw    → 整数をそのまま使用

export function buildMarkEffectsFromDefineValues(dv) {
  const get10k = (key, fallback) => (dv?.[key] != null ? Number(dv[key]) / 10000 : fallback);
  const get100 = (key, fallback) => (dv?.[key] != null ? Number(dv[key]) / 100 : fallback);
  const getRaw = (key, fallback) => (dv?.[key] != null ? Number(dv[key]) : fallback);

  const base = INTRINSIC_MARK_EFFECTS_BY_ELEMENT.Fire;
  const sharedConfig = Object.freeze({
    skillDamageUpRateAtLevel1: get10k('FIRE_MARK_ATTACK_UP', base.skillDamageUpRateAtLevel1),
    damageTakenDownRateAtLevel2: get10k('FIRE_MARK_DAMAGE_RATE_UP', base.damageTakenDownRateAtLevel2),
    destructionRateGainBonusRateAtLevel3: get10k('FIRE_MARK_DEFENCE_UP', base.destructionRateGainBonusRateAtLevel3),
    criticalRateUpAtLevel4: get100('FIRE_MARK_CRITICAL_RATE_UP', base.criticalRateUpAtLevel4),
    criticalDamageUpAtLevel5: get10k('FIRE_MARK_CRITICAL_DAMAGE_UP', base.criticalDamageUpAtLevel5),
    extraFrontSpAtTurnStartAtLevel6: getRaw('FIRE_MARK_HEAL_SP', base.extraFrontSpAtTurnStartAtLevel6),
  });

  // Light Mark は MasterSpecialStatus 未収録 → LIGHT_MARK_* が追加されれば自動反映、なければ FIRE_MARK_* にフォールバック
  const lightBase = INTRINSIC_MARK_EFFECTS_BY_ELEMENT.Light;
  const lightConfig = Object.freeze({
    skillDamageUpRateAtLevel1: get10k('LIGHT_MARK_ATTACK_UP', sharedConfig.skillDamageUpRateAtLevel1) || get10k('FIRE_MARK_ATTACK_UP', lightBase.skillDamageUpRateAtLevel1),
    damageTakenDownRateAtLevel2: get10k('LIGHT_MARK_DAMAGE_RATE_UP', sharedConfig.damageTakenDownRateAtLevel2) || get10k('FIRE_MARK_DAMAGE_RATE_UP', lightBase.damageTakenDownRateAtLevel2),
    destructionRateGainBonusRateAtLevel3: get10k('LIGHT_MARK_DEFENCE_UP', sharedConfig.destructionRateGainBonusRateAtLevel3) || get10k('FIRE_MARK_DEFENCE_UP', lightBase.destructionRateGainBonusRateAtLevel3),
    criticalRateUpAtLevel4: get100('LIGHT_MARK_CRITICAL_RATE_UP', sharedConfig.criticalRateUpAtLevel4) || get100('FIRE_MARK_CRITICAL_RATE_UP', lightBase.criticalRateUpAtLevel4),
    criticalDamageUpAtLevel5: get10k('LIGHT_MARK_CRITICAL_DAMAGE_UP', sharedConfig.criticalDamageUpAtLevel5) || get10k('FIRE_MARK_CRITICAL_DAMAGE_UP', lightBase.criticalDamageUpAtLevel5),
    extraFrontSpAtTurnStartAtLevel6: getRaw('LIGHT_MARK_HEAL_SP', sharedConfig.extraFrontSpAtTurnStartAtLevel6) || getRaw('FIRE_MARK_HEAL_SP', lightBase.extraFrontSpAtTurnStartAtLevel6),
  });

  return Object.freeze({
    Fire: sharedConfig,
    Ice: sharedConfig,
    Thunder: sharedConfig,
    Dark: sharedConfig,
    Light: lightConfig,
  });
}

export function buildHighBoostDefaultsFromDefineValues(dv) {
  const get10k = (key, fallback) => (dv?.[key] != null ? Number(dv[key]) / 10000 : fallback);
  const getRaw = (key, fallback) => (dv?.[key] != null ? Number(dv[key]) : fallback);

  return Object.freeze({
    spCostIncrease: getRaw('HIGH_BOOST_INCREASE_SP', 2),
    attackBuffMultiplier: 1.0 + get10k('HIGH_BOOST_GIVE_ATTACK_BUFF_UP', 0.2),
    debuffMultiplier: 1.0 + get10k('HIGH_BOOST_GIVE_DEBUFF_UP', 0.2),
    dpHealMultiplier: 1.0 + get10k('HIGH_BOOST_GIVE_HEAL_UP', 0.5),
    // skillAtkRate は MasterSkillPart.json の effect.power 経由でデータ駆動済みのため固定値
    skillAtkRate: 1.8,
  });
}
