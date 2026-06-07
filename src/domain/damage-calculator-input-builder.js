import { DAMAGE_CALCULATION_STAT_KEYS } from '../contracts/damage-calculation.js';
import { NORMAL_ATTACK_SKILL_NAME } from './damage-calculator.js';

const DEFAULT_LIMIT_BREAK_COUNT = 0;
const MAX_LIMIT_BREAK_COUNT = 4;
const LIMIT_BREAK_STAT_BONUS = 20;
const DEFAULT_ENEMY_BORDER = 770;
const DEFAULT_DESTRUCTION_RATE = 1;
const DEFAULT_AFFINITY_RATE = 1;
const DEFAULT_SKILL_LEVEL = 10;
const CRITICAL_BASE_RATE = 1.5;
const WEAPON_TYPES = Object.freeze(['Slash', 'Stab', 'Strike']);
const SYNTHETIC_SKILL_NAME = '威力詳細合算';

const DEFAULT_STATS_BY_ROLE = Object.freeze({
  attacker: Object.freeze({ str: 650, dex: 650, wis: 600, spr: 600, luk: 600, con: 600 }),
  blaster: Object.freeze({ str: 650, dex: 650, wis: 600, spr: 600, luk: 600, con: 600 }),
  breaker: Object.freeze({ str: 650, dex: 650, wis: 600, spr: 600, luk: 600, con: 600 }),
  buffer: Object.freeze({ str: 600, dex: 600, wis: 670, spr: 620, luk: 600, con: 600 }),
  debuffer: Object.freeze({ str: 600, dex: 600, wis: 650, spr: 600, luk: 670, con: 600 }),
  defender: Object.freeze({ str: 600, dex: 600, wis: 600, spr: 670, luk: 600, con: 650 }),
  healer: Object.freeze({ str: 600, dex: 600, wis: 600, spr: 670, luk: 600, con: 650 }),
  admiral: Object.freeze({ str: 620, dex: 620, wis: 620, spr: 620, luk: 620, con: 620 }),
  rider: Object.freeze({ str: 620, dex: 620, wis: 620, spr: 620, luk: 620, con: 620 }),
});

function toFiniteNumber(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function clampLimitBreakCount(value) {
  const numeric = Math.trunc(toFiniteNumber(value, DEFAULT_LIMIT_BREAK_COUNT));
  return Math.max(DEFAULT_LIMIT_BREAK_COUNT, Math.min(MAX_LIMIT_BREAK_COUNT, numeric));
}

function normalizeRole(role) {
  return String(role ?? '').trim().toLowerCase();
}

function getTargetEnemyIndex(damageContext = {}, enemyAdapter = {}) {
  const adapterIndex = Number(enemyAdapter?.targetEnemyIndex);
  if (Number.isInteger(adapterIndex) && adapterIndex >= 0) {
    return adapterIndex;
  }
  const contextIndex = Number(damageContext?.targetEnemyIndex);
  if (Number.isInteger(contextIndex) && contextIndex >= 0) {
    return contextIndex;
  }
  const firstTarget = Array.isArray(damageContext?.damageBreakdown?.targetBreakdowns)
    ? damageContext.damageBreakdown.targetBreakdowns[0]
    : null;
  const firstTargetIndex = Number(firstTarget?.targetEnemyIndex);
  return Number.isInteger(firstTargetIndex) && firstTargetIndex >= 0 ? firstTargetIndex : 0;
}

function getTargetBreakdown(damageContext = {}, targetEnemyIndex = 0) {
  const targetBreakdowns = Array.isArray(damageContext?.damageBreakdown?.targetBreakdowns)
    ? damageContext.damageBreakdown.targetBreakdowns
    : [];
  return (
    targetBreakdowns.find((target) => Number(target?.targetEnemyIndex) === Number(targetEnemyIndex)) ??
    targetBreakdowns[0] ??
    null
  );
}

function getGroupMultiplier(targetBreakdown, dataGroup) {
  const group = (targetBreakdown?.groups ?? []).find((entry) => String(entry?.dataGroup ?? '') === dataGroup);
  const multiplier = Number(group?.multiplier);
  return Number.isFinite(multiplier) && multiplier > 0 ? multiplier : 1;
}

function multiplierToPower(multiplier) {
  const numeric = Number(multiplier);
  return Number.isFinite(numeric) ? Math.max(0, (numeric - 1) * 100) : 0;
}

function criticalMultiplierToPower(multiplier) {
  const numeric = Number(multiplier);
  return Number.isFinite(numeric) ? Math.max(0, (numeric * CRITICAL_BASE_RATE - CRITICAL_BASE_RATE) * 100) : 0;
}

function normalizeStats(defaultStats, attackerStatsInput = {}) {
  return Object.fromEntries(
    DAMAGE_CALCULATION_STAT_KEYS.map((key) => [
      key,
      normalizeStatValue(attackerStatsInput?.[key], defaultStats[key]),
    ])
  );
}

function normalizeStatValue(value, fallback) {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : fallback;
}

function buildResistanceMap(affinityRate) {
  return Object.fromEntries(WEAPON_TYPES.map((weaponType) => [weaponType, affinityRate]));
}

function resolveActiveZone(damageContext = {}) {
  const zoneType = String(damageContext?.zoneType ?? '').trim();
  const zonePowerRate = Number(damageContext?.zonePowerRate ?? 0);
  return zoneType && Number.isFinite(zonePowerRate) && zonePowerRate > 0 ? `${zoneType}Zone` : 'None';
}

function buildSyntheticEffect(statusType, power, side) {
  if (!Number.isFinite(power) || power <= 0) {
    return null;
  }
  return {
    statusType,
    power,
    skillName: SYNTHETIC_SKILL_NAME,
    source: 'damageBreakdown',
    side,
  };
}

function buildSyntheticAttackerEffects(damageContext = {}, targetBreakdown = null) {
  const effects = [];
  const buffPower = multiplierToPower(getGroupMultiplier(targetBreakdown, 'buff'));
  const critPower = criticalMultiplierToPower(getGroupMultiplier(targetBreakdown, 'crit-mindeye'));
  const funnelPower = multiplierToPower(getGroupMultiplier(targetBreakdown, 'funnel'));

  for (const effect of [
    buildSyntheticEffect('AttackUp', buffPower, 'attacker'),
    buildSyntheticEffect('CritDamageUp', critPower, 'attacker'),
    buildSyntheticEffect('Funnel', funnelPower, 'attacker'),
  ]) {
    if (effect) effects.push(effect);
  }
  return effects;
}

function buildSyntheticDefenderEffects(targetBreakdown = null) {
  const debuffPower = multiplierToPower(getGroupMultiplier(targetBreakdown, 'debuff'));
  const effect = buildSyntheticEffect('DefenseDown', debuffPower, 'defender');
  return effect ? [effect] : [];
}

function resolveAffinityRate(damageContext = {}, enemyAdapter = {}, targetEnemyIndex = 0, targetBreakdown = null) {
  const adapterRate = Number(enemyAdapter?.affinityRate);
  if (Number.isFinite(adapterRate) && adapterRate >= 0) {
    return adapterRate;
  }
  const keyedRate = Number(damageContext?.effectiveDamageRatesByEnemy?.[String(targetEnemyIndex)]);
  if (Number.isFinite(keyedRate) && keyedRate >= 0) {
    return keyedRate / 100;
  }
  return getGroupMultiplier(targetBreakdown, 'affinity') || DEFAULT_AFFINITY_RATE;
}

function resolveDestructionRate(damageContext = {}, enemyAdapter = {}, targetEnemyIndex = 0) {
  const adapterRate = Number(enemyAdapter?.destructionRate);
  if (Number.isFinite(adapterRate) && adapterRate > 0) {
    return adapterRate;
  }
  const keyedPercent = Number(damageContext?.destructionRateByEnemy?.[String(targetEnemyIndex)]);
  if (Number.isFinite(keyedPercent) && keyedPercent > 0) {
    return keyedPercent / 100;
  }
  return DEFAULT_DESTRUCTION_RATE;
}

export function resolveDefaultStats(role, limitBreakCount = DEFAULT_LIMIT_BREAK_COUNT) {
  const roleKey = normalizeRole(role);
  const base = DEFAULT_STATS_BY_ROLE[roleKey] ?? DEFAULT_STATS_BY_ROLE.admiral;
  const limitBreakBonus = clampLimitBreakCount(limitBreakCount) * LIMIT_BREAK_STAT_BONUS;
  return Object.fromEntries(
    DAMAGE_CALCULATION_STAT_KEYS.map((key) => [key, Number(base[key] ?? 620) + limitBreakBonus])
  );
}

export function buildDamageStatDeltaViewModel(damageContext = {}, attackerStatsInput = {}, enemyAdapter = {}) {
  const defaultStats = resolveDefaultStats(attackerStatsInput?.role, attackerStatsInput?.limitBreakCount);
  const attackerStats = normalizeStats(defaultStats, attackerStatsInput);
  const paramBorder = toFiniteNumber(enemyAdapter?.paramBorder, DEFAULT_ENEMY_BORDER);
  const enemyStats = Object.fromEntries(DAMAGE_CALCULATION_STAT_KEYS.map((key) => [key, paramBorder]));
  const makeRow = (base) => ({ base, buffDelta: 0, debuffDelta: 0, resolved: base });
  return {
    attacker: Object.fromEntries(DAMAGE_CALCULATION_STAT_KEYS.map((key) => [key, makeRow(attackerStats[key])])),
    enemy: Object.fromEntries(DAMAGE_CALCULATION_STAT_KEYS.map((key) => [key, makeRow(enemyStats[key])])),
  };
}

export function buildDamageCalculationInput(damageContext = {}, attackerStatsInput = {}, enemyAdapter = {}) {
  const targetEnemyIndex = getTargetEnemyIndex(damageContext, enemyAdapter);
  const targetBreakdown = getTargetBreakdown(damageContext, targetEnemyIndex);
  const defaultStats = resolveDefaultStats(attackerStatsInput?.role, attackerStatsInput?.limitBreakCount);
  const stats = normalizeStats(defaultStats, attackerStatsInput);
  const affinityRate = resolveAffinityRate(damageContext, enemyAdapter, targetEnemyIndex, targetBreakdown);
  const destructionRate = resolveDestructionRate(damageContext, enemyAdapter, targetEnemyIndex);
  const tokenPassiveMultiplier = getGroupMultiplier(targetBreakdown, 'token-passive');
  const tokenRatio = Number.isFinite(Number(attackerStatsInput?.tokenRatio))
    ? Number(attackerStatsInput.tokenRatio)
    : Math.max(0, tokenPassiveMultiplier - 1);

  return {
    attacker: {
      characterId: String(damageContext?.actorCharacterId ?? ''),
      styleId: toFiniteNumber(damageContext?.actorStyleId, 0),
      role: String(attackerStatsInput?.role ?? 'Attacker'),
      limitBreakCount: clampLimitBreakCount(attackerStatsInput?.limitBreakCount),
      stats,
      tokenCount: toFiniteNumber(attackerStatsInput?.tokenCount, damageContext?.tokenAttackTokenCount ?? 0),
      tokenRatio,
      statusEffects: buildSyntheticAttackerEffects(damageContext, targetBreakdown),
    },
    defender: {
      enemyId: enemyAdapter?.enemyId ?? null,
      enemyName: String(enemyAdapter?.enemyName ?? targetBreakdown?.targetLabel ?? ''),
      paramBorder: toFiniteNumber(enemyAdapter?.paramBorder, DEFAULT_ENEMY_BORDER),
      isHpTarget: enemyAdapter?.isHpTarget !== false,
      destructionRate,
      affinityRate,
      resistances: buildResistanceMap(affinityRate),
      statusEffects: buildSyntheticDefenderEffects(targetBreakdown),
    },
    skill: {
      skillId: toFiniteNumber(damageContext?.skillId, 0),
      name: damageContext?.isNormalAttack ? NORMAL_ATTACK_SKILL_NAME : String(damageContext?.skillName ?? ''),
      kind: damageContext?.isNormalAttack ? 'normal' : 'skill',
      level: toFiniteNumber(attackerStatsInput?.skillLevel, DEFAULT_SKILL_LEVEL),
    },
    activeZone: resolveActiveZone(damageContext),
    targetEnemyIndex,
  };
}
