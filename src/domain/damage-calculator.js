import {
  DAMAGE_CALCULATION_BUFF_TYPES,
  DAMAGE_CALCULATION_DEBUFF_TYPES,
  DAMAGE_CALCULATION_STAT_KEYS,
  DAMAGE_DEBUFF_CATEGORIES,
  DAMAGE_FRAGILE_CATEGORIES,
} from '../contracts/damage-calculation.js';

const DEFAULT_ENEMY_BORDER = 770;
const DEFAULT_LEVEL = 10;
const DEFAULT_ORB_LEVEL = 0;
const DEFAULT_PROVIDER_STAT = 675;
const DEFAULT_ATTACKER_STAT = 600;
const DEFAULT_DAMAGE_RANGE_RATE = 0.1;
const DEFAULT_TOKEN_RATE_PER_COUNT = 0.1;
const DEFAULT_ZONE_MULTIPLIER = 1.5;
const CRITICAL_BASE_RATE = 1.5;
const CRITICAL_BORDER_REDUCTION = 50;
const NORMAL_ATTACK_CRIT_E_DIVISOR = 2;
const ORB_POWER_RATE_PER_LEVEL = 0.04;
const ORB_THRESHOLD_PER_LEVEL = 60;
const DEFAULT_SKILL_SP = 4;
const DEFAULT_GROWTHS = Object.freeze([0.03, 0.02]);
const DEFAULT_EFFECT_POWER = Object.freeze([0, 0]);
const DEFAULT_ATTACK_PARAMETERS = Object.freeze({ str: 1, dex: 1 });
const DEFAULT_MULTIPLIERS = Object.freeze({ hp: 1, dp: 1 });

export const NORMAL_ATTACK_SKILL_NAME = '通常攻撃';
export const PURSUIT_SKILL_NAME = '追撃';
export const NORMAL_ATTACK_ID_SUFFIX = '01';
export const PURSUIT_ID_SUFFIX = '91';

export const ATTACK_PART_TYPES = Object.freeze([
  'AttackNormal',
  'AttackSkill',
  'DamageRateChangeAttackSkill',
  'PenetrationCriticalAttack',
  'PenetrationNormalAttack',
  'PenetrationSkill',
  'TokenAttack',
  'AttackBySp',
  'AttackByOwnDpRate',
  'FixedHpDamageRateAttack',
]);

const NESTED_PART_TYPES = new Set(['SkillCondition', 'SkillRandom', 'SkillSwitch']);
const ATTACK_PART_TYPE_SET = new Set(ATTACK_PART_TYPES);
const SUPPORTED_BUFF_SET = new Set(DAMAGE_CALCULATION_BUFF_TYPES);
const SUPPORTED_DEBUFF_SET = new Set(DAMAGE_CALCULATION_DEBUFF_TYPES);
const DEBUFF_CATEGORY_SET = new Set(DAMAGE_DEBUFF_CATEGORIES);
const FRAGILE_CATEGORY_SET = new Set(DAMAGE_FRAGILE_CATEGORIES);

const EFFECT_PART_TYPES_BY_STATUS = Object.freeze({
  AttackUp: ['AttackUp'],
  ElementAttackUp: ['ElementAttackUp', 'AttackUp'],
  DefenseDown: ['DefenseDown'],
  ElementResistDown: ['ElementResistDown', 'DefenseDown'],
  Fragile: ['Fragile'],
  CritDamageUp: ['CritDamageUp', 'CritRateUp', 'CritBuff'],
  CritBuff: ['CritDamageUp', 'CritRateUp', 'CritBuff'],
  MindEye: ['MindEye', 'WeaknessAttackUp'],
  Charge: ['BuffCharge', 'Charge'],
  Funnel: ['Funnel'],
});

const ZONE_ELEMENT_MAP = Object.freeze({
  firezone: 'fire',
  icezone: 'ice',
  thunderzone: 'thunder',
  darkzone: 'dark',
  lightzone: 'light',
});

function toNumber(value, fallback = 0) {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : fallback;
}

function hasValue(value) {
  return value !== null && value !== undefined && value !== '';
}

function clonePlainObject(value) {
  return value && typeof value === 'object' ? { ...value } : {};
}

function skillIdEndsWith(skill, suffix) {
  return String(skill?.id ?? '').endsWith(suffix);
}

function cleanSkillName(skillName) {
  return String(skillName ?? '')
    .replace('[単独発動]', '')
    .split('[')[0]
    .split('(')[0]
    .split('（')[0]
    .trim();
}

export function flattenSkillParts(parts = []) {
  const flat = [];
  for (const part of parts ?? []) {
    const skillType = String(part?.skill_type ?? '');
    if (!NESTED_PART_TYPES.has(skillType)) {
      flat.push(part);
      continue;
    }

    const nested = part?.strval;
    if (Array.isArray(nested)) {
      for (const subSkill of nested) {
        if (subSkill?.parts) {
          flat.push(...flattenSkillParts(subSkill.parts));
        }
      }
      continue;
    }

    if (nested?.parts) {
      flat.push(...flattenSkillParts(nested.parts));
    }
  }
  return flat;
}

function findAttackPart(skill) {
  for (const part of flattenSkillParts(skill?.parts ?? [])) {
    if (ATTACK_PART_TYPE_SET.has(String(part?.skill_type ?? ''))) {
      return part;
    }
  }
  return null;
}

function findSkillByNameAndSuffix(skills, name, suffix) {
  return skills.find((skill) => skill?.name === name && skillIdEndsWith(skill, suffix)) ?? null;
}

function findSkill(skills, skillId, skillName) {
  let candidates = [];
  if (hasValue(skillId)) {
    candidates = skills.filter((skill) => Number(skill?.id) === Number(skillId));
  }

  const cleanedName = cleanSkillName(skillName);
  if (!candidates.length && cleanedName === NORMAL_ATTACK_SKILL_NAME) {
    const skill = findSkillByNameAndSuffix(skills, NORMAL_ATTACK_SKILL_NAME, NORMAL_ATTACK_ID_SUFFIX);
    candidates = skill ? [skill] : [];
  }
  if (!candidates.length && cleanedName === PURSUIT_SKILL_NAME) {
    const skill = findSkillByNameAndSuffix(skills, PURSUIT_SKILL_NAME, PURSUIT_ID_SUFFIX);
    candidates = skill ? [skill] : [];
  }
  if (!candidates.length && cleanedName) {
    candidates = skills.filter((skill) => skill?.name === cleanedName);
  }
  if (!candidates.length) {
    return null;
  }

  return candidates.find((candidate) => Boolean(findAttackPart(candidate))) ?? candidates[0];
}

function findEffectPart(skills, skillId, skillName, targetTypes) {
  const skill = findSkill(skills, skillId, skillName);
  if (!skill) {
    return null;
  }
  const targetTypeSet = new Set(targetTypes);
  return (
    flattenSkillParts(skill.parts ?? []).find((part) =>
      targetTypeSet.has(String(part?.skill_type ?? ''))
    ) ?? null
  );
}

function getEnemyBorder(enemies, enemyId) {
  const enemy = enemies.find((entry) => String(entry?.id) === String(enemyId));
  const border = Number(enemy?.base_param?.param_border);
  return border > 0 ? border : DEFAULT_ENEMY_BORDER;
}

function resolveProviderStat(effect) {
  if (hasValue(effect?.providerWis)) {
    return toNumber(effect.providerWis, DEFAULT_PROVIDER_STAT);
  }
  if (hasValue(effect?.providerWisOrLuk)) {
    return toNumber(effect.providerWisOrLuk, DEFAULT_PROVIDER_STAT);
  }
  return DEFAULT_PROVIDER_STAT;
}

export function resolveEffectPower(effect, skills, options = {}) {
  if (hasValue(effect?.power)) {
    return Number(effect.power);
  }

  const statusType = effect?.statusType;
  const targetTypes = EFFECT_PART_TYPES_BY_STATUS[statusType] ?? [statusType];
  const part = findEffectPart(skills, effect?.sourceSkillId, effect?.skillName, targetTypes);
  if (!part) {
    return 0;
  }

  const powers = part.power ?? DEFAULT_EFFECT_POWER;
  const vMin = toNumber(powers[0]) * 100;
  const vMax = toNumber(powers[1], vMin / 100) * 100;
  const threshold = toNumber(part.diff_for_max);
  const growths = part.growth ?? DEFAULT_GROWTHS;
  const gMin = toNumber(growths[0], DEFAULT_GROWTHS[0]);
  const gMax = toNumber(growths[1], gMin);
  const providerStat = resolveProviderStat(effect);
  const skillLevel = toNumber(effect?.skillLevel, options.defaultLevel ?? DEFAULT_LEVEL);
  const orbLevel = toNumber(effect?.orbLevel, options.defaultOrbLevel ?? DEFAULT_ORB_LEVEL);
  const orbPowerRate = ORB_POWER_RATE_PER_LEVEL * orbLevel;
  const orbThreshold = ORB_THRESHOLD_PER_LEVEL * orbLevel;

  const minAtLevel = vMin * (1 + gMin * (skillLevel - 1));
  const maxAtLevel = vMax * (1 + gMax * (skillLevel - 1)) * (1 + orbPowerRate);
  const finalThreshold = threshold + orbThreshold;

  if (finalThreshold <= 0 || providerStat >= finalThreshold) {
    return Math.max(0, maxAtLevel);
  }
  if (providerStat < 0) {
    return Math.max(0, minAtLevel);
  }

  const resolved = ((maxAtLevel - minAtLevel) / finalThreshold) * providerStat + minAtLevel;
  return Math.max(0, resolved);
}

function aggregateBuffs(buffs) {
  const normalBuffs = [];
  const singleBuffs = [];
  for (const buff of buffs) {
    const skillName = String(buff?.skillName ?? '');
    const power = toNumber(buff?.resolvedPower);
    if (skillName.includes('[単独発動]') || skillName.includes('単独発動')) {
      singleBuffs.push(power);
    } else {
      normalBuffs.push(power);
    }
  }

  normalBuffs.sort((a, b) => b - a);
  singleBuffs.sort((a, b) => b - a);
  const normalTotal = normalBuffs.slice(0, 2).reduce((sum, power) => sum + power, 0);
  const singleMax = singleBuffs[0] ?? 0;
  return Math.max(normalTotal, singleMax) / 100;
}

function inferDebuffCategory(effect) {
  if (DEBUFF_CATEGORY_SET.has(effect?.category)) {
    return effect.category;
  }
  const skillName = String(effect?.skillName ?? '');
  const statusType = String(effect?.statusType ?? '');
  if (
    (skillName.includes('永続') && (skillName.includes('属性') || skillName.includes('属防'))) ||
    skillName.includes('氷華、千射万箭')
  ) {
    return 'PermElementDefense';
  }
  if (skillName.includes('DP防御') || skillName.includes('ほてるししむら')) {
    return 'DPDefense';
  }
  if (skillName.includes('属性') || skillName.includes('グラビトン') || statusType === 'ElementResistDown') {
    return 'ElementDefense';
  }
  if (skillName.includes('永続') || skillName.includes('インフィニティ')) {
    return 'PermDefense';
  }
  return 'NormalDefense';
}

function inferFragileCategory(effect) {
  if (FRAGILE_CATEGORY_SET.has(effect?.category)) {
    return effect.category;
  }
  const skillName = String(effect?.skillName ?? '');
  return skillName.includes('永続') || skillName.includes('まだまだ行くで')
    ? 'PermFragile'
    : 'NormalFragile';
}

function aggregateDebuffs(debuffs) {
  const categories = {
    NormalDefense: [],
    PermDefense: [],
    ElementDefense: [],
    PermElementDefense: [],
    DPDefense: [],
  };

  for (const debuff of debuffs) {
    categories[inferDebuffCategory(debuff)].push(toNumber(debuff?.resolvedPower));
  }

  let total = 0;
  for (const [category, powers] of Object.entries(categories)) {
    powers.sort((a, b) => b - a);
    total += category === 'DPDefense'
      ? powers.reduce((sum, power) => sum + power, 0)
      : powers.slice(0, 2).reduce((sum, power) => sum + power, 0);
  }
  return total / 100;
}

function aggregateFragiles(fragiles, isWeaknessAttack) {
  const categories = {
    NormalFragile: [],
    PermFragile: [],
  };

  for (const fragile of fragiles) {
    categories[inferFragileCategory(fragile)].push(toNumber(fragile?.resolvedPower));
  }

  const normalTotal = isWeaknessAttack
    ? categories.NormalFragile.sort((a, b) => b - a).slice(0, 2).reduce((sum, power) => sum + power, 0)
    : 0;
  const permTotal = categories.PermFragile.sort((a, b) => b - a).slice(0, 2).reduce((sum, power) => sum + power, 0);
  return (normalTotal + permTotal) / 100;
}

function calculateWeightedAttackStat(stats, weights) {
  let weightedSum = 0;
  let weightSum = 0;
  for (const [statName, weight] of Object.entries(weights ?? {})) {
    const numericWeight = Number(weight);
    if (numericWeight <= 0) {
      continue;
    }
    const statValue = toNumber(stats?.[statName], DEFAULT_ATTACKER_STAT);
    weightedSum += statValue * numericWeight;
    weightSum += numericWeight;
  }
  if (weightSum > 0) {
    return weightedSum / weightSum;
  }

  const statValues = DAMAGE_CALCULATION_STAT_KEYS.map((key) => toNumber(stats?.[key], DEFAULT_ATTACKER_STAT));
  return statValues.reduce((sum, value) => sum + value, 0) / statValues.length;
}

function calculateBaseDamage({ statusAtk, paramBorder, threshold, minPower, maxPower, isCritical, isNormalAttack, abilitySprCorrection }) {
  const effectiveThreshold = isCritical && isNormalAttack
    ? threshold / NORMAL_ATTACK_CRIT_E_DIVISOR
    : threshold;
  const border = isCritical
    ? paramBorder - CRITICAL_BORDER_REDUCTION - Math.max(0, -CRITICAL_BORDER_REDUCTION - abilitySprCorrection)
    : paramBorder;
  const diff = statusAtk - border;
  const base = diff < 0
    ? (minPower / effectiveThreshold) * (diff + effectiveThreshold)
    : ((maxPower - minPower) / effectiveThreshold) * Math.min(diff, effectiveThreshold) + minPower;
  return Math.max(0, base * (isCritical ? CRITICAL_BASE_RATE : 1));
}

function resolvePowerParameters(part, skillLevel, skill) {
  const powers = part?.power ?? DEFAULT_EFFECT_POWER;
  const growths = part?.growth ?? [0, 0];
  const minPower = toNumber(powers[0]) * (1 + toNumber(growths[0]) * (skillLevel - 1));
  const maxPower = toNumber(powers[1], powers[0]) * (1 + toNumber(growths[1]) * (skillLevel - 1));
  const fallbackSp = toNumber(skill?.sp_cost, DEFAULT_SKILL_SP);
  return {
    threshold: toNumber(part?.diff_for_max, 105 + fallbackSp * 3),
    minPower,
    maxPower,
  };
}

export function calculateDamage(input, data) {
  const styles = data?.styles ?? [];
  const enemies = data?.enemies ?? [];
  const skills = data?.skills ?? [];

  const attacker = clonePlainObject(input?.attacker);
  const defender = clonePlainObject(input?.defender);
  const skillInput = clonePlainObject(input?.skill);
  const ignoredEffects = [];

  const skillName = cleanSkillName(skillInput.name);
  const skill = findSkill(skills, skillInput.skillId, skillName);
  const style = styles.find((entry) => Number(entry?.id) === Number(attacker.styleId)) ?? null;
  const attackPart = skill ? findAttackPart(skill) : null;
  const allParts = skill ? flattenSkillParts(skill.parts ?? []) : [];
  const fallbackPart = attackPart ?? allParts[0] ?? null;
  const skillLevel = toNumber(skillInput.level, DEFAULT_LEVEL);
  const stats = attacker.stats ?? {};
  const weights = fallbackPart?.parameters ?? DEFAULT_ATTACK_PARAMETERS;
  const statusAtk = calculateWeightedAttackStat(stats, weights);
  const paramBorder = hasValue(defender.paramBorder)
    ? Number(defender.paramBorder)
    : getEnemyBorder(enemies, defender.enemyId);

  const { threshold, minPower, maxPower } = resolvePowerParameters(fallbackPart, skillLevel, skill);
  const isNormalAttack = skill?.name === NORMAL_ATTACK_SKILL_NAME && skillIdEndsWith(skill, NORMAL_ATTACK_ID_SUFFIX);
  const abilitySprCorrection = toNumber(
    hasValue(attacker.abilitySprCorrection) ? attacker.abilitySprCorrection : attacker.as48
  );

  let baseDamageNormal = calculateBaseDamage({
    statusAtk,
    paramBorder,
    threshold,
    minPower,
    maxPower,
    isCritical: false,
    isNormalAttack,
    abilitySprCorrection,
  });
  let baseDamageCrit = calculateBaseDamage({
    statusAtk,
    paramBorder,
    threshold,
    minPower,
    maxPower,
    isCritical: true,
    isNormalAttack,
    abilitySprCorrection,
  });

  if (!attackPart) {
    baseDamageNormal = 0;
    baseDamageCrit = 0;
    ignoredEffects.push({
      statusType: 'no_attack_part',
      skillName: skillInput.name ?? '',
      side: 'context',
    });
  }

  const tokenRatio = hasValue(attacker.tokenRatio)
    ? Number(attacker.tokenRatio)
    : toNumber(attacker.tokenCount) * DEFAULT_TOKEN_RATE_PER_COUNT;

  const buffsResolved = [];
  const debuffsResolved = [];
  const fragilesResolved = [];
  const critBuffsResolved = [];
  const funnelBuffsResolved = [];

  for (const rawBuff of attacker.statusEffects ?? []) {
    const buff = { ...rawBuff, statusType: rawBuff?.statusType ?? rawBuff?.buffType ?? 'AttackUp' };
    if (!SUPPORTED_BUFF_SET.has(buff.statusType)) {
      ignoredEffects.push({ statusType: buff.statusType, skillName: buff.skillName ?? '', side: 'attacker' });
      continue;
    }
    const resolved = { ...buff, skillName: buff.skillName ?? '', resolvedPower: resolveEffectPower(buff, skills) };
    if (['AttackUp', 'Charge', 'ElementAttackUp'].includes(buff.statusType)) {
      buffsResolved.push(resolved);
    } else if (['CritDamageUp', 'CritBuff', 'MindEye'].includes(buff.statusType)) {
      critBuffsResolved.push(resolved);
    } else if (buff.statusType === 'Funnel') {
      funnelBuffsResolved.push(resolved);
    }
  }

  for (const rawDebuff of defender.statusEffects ?? []) {
    const debuff = { ...rawDebuff, statusType: rawDebuff?.statusType ?? rawDebuff?.debuffType ?? 'DefenseDown' };
    if (!SUPPORTED_DEBUFF_SET.has(debuff.statusType)) {
      ignoredEffects.push({ statusType: debuff.statusType, skillName: debuff.skillName ?? '', side: 'defender' });
      continue;
    }
    const resolved = { ...debuff, skillName: debuff.skillName ?? '', resolvedPower: resolveEffectPower(debuff, skills) };
    if (['DefenseDown', 'ElementResistDown'].includes(debuff.statusType)) {
      debuffsResolved.push(resolved);
    } else if (debuff.statusType === 'Fragile') {
      fragilesResolved.push(resolved);
    }
  }

  const isHpTarget = defender.isHpTarget ?? true;
  const multipliers = fallbackPart?.multipliers ?? DEFAULT_MULTIPLIERS;
  const specialEffect = toNumber(multipliers[isHpTarget ? 'hp' : 'dp'], 1);
  const weaponType = style?.type ?? 'Slash';
  const affinityMultiplier = toNumber(defender.resistances?.[weaponType], 1);
  const activeZone = String(input?.activeZone ?? 'None').trim().toLowerCase();
  let zoneMultiplier = 1;
  if (activeZone !== 'none') {
    const zoneElement = ZONE_ELEMENT_MAP[activeZone];
    if (zoneElement) {
      const skillElements = (fallbackPart?.elements ?? []).map((element) => String(element).trim().toLowerCase());
      if (skillElements.includes(zoneElement)) {
        zoneMultiplier = DEFAULT_ZONE_MULTIPLIER;
      }
    } else {
      ignoredEffects.push({ statusType: 'activeZone', skillName: input?.activeZone ?? '', side: 'context' });
    }
  }

  const resistanceTotal = affinityMultiplier * zoneMultiplier;
  const isWeaknessAttack = resistanceTotal > 1;
  const buffMultiplier = 1 + aggregateBuffs(buffsResolved);
  const passiveDefenseDown = toNumber(defender.passiveDefenseDown);
  const debuffMultiplier = 1 + aggregateDebuffs(debuffsResolved) + passiveDefenseDown;
  const vulnerabilityMultiplier = 1 + aggregateFragiles(fragilesResolved, isWeaknessAttack);
  const critBuffTotal = critBuffsResolved
    .filter((buff) => buff.statusType !== 'MindEye')
    .reduce((sum, buff) => sum + toNumber(buff.resolvedPower), 0) / 100;
  const mindEyeTotal = isWeaknessAttack
    ? critBuffsResolved
        .filter((buff) => buff.statusType === 'MindEye')
        .reduce((sum, buff) => sum + toNumber(buff.resolvedPower), 0) / 100
    : 0;
  const critMindeyeMultiplier = (CRITICAL_BASE_RATE + critBuffTotal + mindEyeTotal) / CRITICAL_BASE_RATE;
  const funnelMultiplier = 1 + funnelBuffsResolved.reduce((sum, buff) => sum + toNumber(buff.resolvedPower), 0) / 100;
  const tokenMultiplier = 1 + tokenRatio;
  const destructionRate = toNumber(defender.destructionRate, 1);

  const expectedNormal = Math.max(
    0,
    baseDamageNormal *
      resistanceTotal *
      destructionRate *
      specialEffect *
      debuffMultiplier *
      vulnerabilityMultiplier *
      buffMultiplier *
      tokenMultiplier *
      funnelMultiplier
  );
  const expectedCrit = Math.max(
    0,
    baseDamageCrit *
      resistanceTotal *
      destructionRate *
      specialEffect *
      debuffMultiplier *
      vulnerabilityMultiplier *
      buffMultiplier *
      tokenMultiplier *
      critMindeyeMultiplier *
      funnelMultiplier
  );

  return {
    normal: {
      expected: expectedNormal,
      min: expectedNormal * (1 - DEFAULT_DAMAGE_RANGE_RATE),
      max: expectedNormal * (1 + DEFAULT_DAMAGE_RANGE_RATE),
    },
    critical: {
      expected: expectedCrit,
      min: expectedCrit * (1 - DEFAULT_DAMAGE_RANGE_RATE),
      max: expectedCrit * (1 + DEFAULT_DAMAGE_RANGE_RATE),
    },
    breakdown: {
      baseDamageNormal,
      baseDamageCrit,
      buffMultiplier,
      critMindeyeMultiplier,
      debuffMultiplier,
      vulnerabilityMultiplier,
      resistMultiplier: zoneMultiplier,
      affinityMultiplier,
      tokenMultiplier,
      funnelMultiplier,
      ignoredEffects,
    },
  };
}
