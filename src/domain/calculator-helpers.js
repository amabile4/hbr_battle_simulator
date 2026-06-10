import {
  DAMAGE_CALCULATION_BUFF_TYPES,
  DAMAGE_CALCULATION_DEBUFF_TYPES,
  DAMAGE_CALCULATION_STAT_KEYS,
  DAMAGE_DEBUFF_CATEGORIES,
  DAMAGE_FRAGILE_CATEGORIES,
} from '../contracts/damage-calculation.js';

export const DEFAULT_ENEMY_BORDER = 770;
export const DEFAULT_LEVEL = 10;
export const DEFAULT_ORB_LEVEL = 0;
export const DEFAULT_PROVIDER_STAT = 675;
export const DEFAULT_ATTACKER_STAT = 600;
export const DEFAULT_DAMAGE_RANGE_RATE = 0.1;
export const DEFAULT_TOKEN_RATE_PER_COUNT = 0.1;
export const DEFAULT_ZONE_MULTIPLIER = 1.5;
export const DEFAULT_DESTRUCTION_RATE = 1;
export const DEFAULT_DESTRUCTION_MULTIPLIER = 1;
export const CRITICAL_BASE_RATE = 1.5;
export const CRITICAL_BORDER_REDUCTION = 50;
export const NORMAL_ATTACK_CRIT_E_DIVISOR = 2;
export const ORB_POWER_RATE_PER_LEVEL = 0.04;
export const ORB_THRESHOLD_PER_LEVEL = 60;
export const DEFAULT_SKILL_SP = 4;
export const DEFAULT_GROWTHS = Object.freeze([0.03, 0.02]);
export const DEFAULT_EFFECT_POWER = Object.freeze([0, 0]);
export const DEFAULT_ATTACK_PARAMETERS = Object.freeze({ str: 1, dex: 1 });
export const DEFAULT_MULTIPLIERS = Object.freeze({ hp: 1, dp: 1 });

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

export const NESTED_PART_TYPES = new Set(['SkillCondition', 'SkillRandom', 'SkillSwitch']);
export const ATTACK_PART_TYPE_SET = new Set(ATTACK_PART_TYPES);
export const SUPPORTED_BUFF_SET = new Set(DAMAGE_CALCULATION_BUFF_TYPES);
export const SUPPORTED_DEBUFF_SET = new Set(DAMAGE_CALCULATION_DEBUFF_TYPES);
export const DEBUFF_CATEGORY_SET = new Set(DAMAGE_DEBUFF_CATEGORIES);
export const FRAGILE_CATEGORY_SET = new Set(DAMAGE_FRAGILE_CATEGORIES);

export const EFFECT_PART_TYPES_BY_STATUS = Object.freeze({
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

export const ZONE_ELEMENT_MAP = Object.freeze({
  firezone: 'fire',
  icezone: 'ice',
  thunderzone: 'thunder',
  darkzone: 'dark',
  lightzone: 'light',
});

export function toNumber(value, fallback = 0) {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : fallback;
}

export function hasValue(value) {
  return value !== null && value !== undefined && value !== '';
}

export function clonePlainObject(value) {
  return value && typeof value === 'object' ? { ...value } : {};
}

export function skillIdEndsWith(skill, suffix) {
  return String(skill?.id ?? '').endsWith(suffix);
}

export function cleanSkillName(skillName) {
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

export function findAttackPart(skill) {
  for (const part of flattenSkillParts(skill?.parts ?? [])) {
    if (ATTACK_PART_TYPE_SET.has(String(part?.skill_type ?? ''))) {
      return part;
    }
  }
  return null;
}

export function findSkillByNameAndSuffix(skills, name, suffix) {
  return skills.find((skill) => skill?.name === name && skillIdEndsWith(skill, suffix)) ?? null;
}

export function findSkill(skills, skillId, skillName) {
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

export function findEffectPart(skills, skillId, skillName, targetTypes) {
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

export function getEnemyBorder(enemies, enemyId) {
  const enemy = enemies.find((entry) => String(entry?.id) === String(enemyId));
  const border = Number(enemy?.base_param?.param_border);
  return border > 0 ? border : DEFAULT_ENEMY_BORDER;
}

export function resolveProviderStat(effect) {
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

  let providerStatVal = DEFAULT_PROVIDER_STAT;
  const providerStats = effect?.providerStats ?? effect?.stats;
  if (providerStats && typeof providerStats === 'object') {
    const normStats = {};
    for (const [k, v] of Object.entries(providerStats)) {
      const kl = String(k).toLowerCase();
      if (kl === 'int') {
        normStats['wis'] = toNumber(v);
      } else if (kl === 'mnd') {
        normStats['spr'] = toNumber(v);
      } else {
        normStats[kl] = toNumber(v);
      }
    }
    
    let weightedSum = 0;
    let weightSum = 0;
    const weights = part.parameters ?? {};
    for (const [k, w] of Object.entries(weights)) {
      const numericWeight = Number(w);
      if (numericWeight > 0) {
        const statVal = normStats[k] ?? 600;
        weightedSum += statVal * numericWeight;
        weightSum += numericWeight;
      }
    }
    providerStatVal = weightSum > 0 ? (weightedSum / weightSum) : DEFAULT_PROVIDER_STAT;
  } else {
    if (hasValue(effect?.providerWis)) {
      providerStatVal = toNumber(effect.providerWis);
    } else if (hasValue(effect?.providerWisOrLuk)) {
      providerStatVal = toNumber(effect.providerWisOrLuk);
    } else {
      providerStatVal = DEFAULT_PROVIDER_STAT;
    }
  }

  const skillLevel = toNumber(effect?.skillLevel, options.defaultLevel ?? DEFAULT_LEVEL);
  const orbLevel = toNumber(effect?.orbLevel, options.defaultOrbLevel ?? DEFAULT_ORB_LEVEL);

  const minAtLevel = vMin * (1 + gMin * (skillLevel - 1));
  const maxAtLevel = vMax * (1 + gMax * (skillLevel - 1));
  
  const isDebuff = ['DefenseDown', 'ElementResistDown', 'Fragile'].includes(statusType);
  let resolvedPower = 0;
  
  if (isDebuff) {
    const enemyBorder = toNumber(options.enemyBorder ?? DEFAULT_ENEMY_BORDER);
    const statDiff = providerStatVal - enemyBorder;
    if (statDiff < 0) {
      resolvedPower = minAtLevel;
    } else if (statDiff < threshold) {
      resolvedPower = ((maxAtLevel - minAtLevel) / threshold) * statDiff + minAtLevel;
    } else {
      resolvedPower = maxAtLevel * (1 + 0.001 * (statDiff - threshold));
    }
    
    if (orbLevel > 0) {
      const tOrb = 20 * orbLevel;
      const tJewel = threshold + tOrb;
      
      let jewelAddition = 0;
      if (statDiff < 0) {
        jewelAddition = vMin * orbLevel * 0.02;
      } else if (statDiff < tJewel) {
        jewelAddition = (((vMax - vMin) / tJewel) * statDiff + vMin) * orbLevel * 0.02;
      } else {
        jewelAddition = vMax * orbLevel * 0.02;
      }
      resolvedPower += jewelAddition;
    }
    
    resolvedPower = Math.floor(100 * resolvedPower) / 100;
  } else {
    if (threshold <= 0) {
      resolvedPower = maxAtLevel;
    } else if (providerStatVal >= threshold) {
      resolvedPower = maxAtLevel * (1 + 0.0002 * (providerStatVal - threshold));
    } else if (providerStatVal < 0) {
      resolvedPower = minAtLevel;
    } else {
      resolvedPower = ((maxAtLevel - minAtLevel) / threshold) * providerStatVal + minAtLevel;
    }
    
    if (orbLevel > 0) {
      const tOrb = 60 * orbLevel;
      const tJewel = threshold + tOrb;
      
      let jewelAddition = 0;
      if (providerStatVal >= tJewel) {
        jewelAddition = vMax * orbLevel * 0.04;
      } else {
        jewelAddition = (((vMax - vMin) / tJewel) * providerStatVal + vMin) * orbLevel * 0.04;
      }
      resolvedPower += jewelAddition;
    }
  }
  
  return Math.max(0, resolvedPower);
}
