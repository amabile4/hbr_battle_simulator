import {
  DAMAGE_CALCULATION_BUFF_TYPES,
  DAMAGE_CALCULATION_DEBUFF_TYPES,
  DAMAGE_CALCULATION_STAT_KEYS,
  DAMAGE_DEBUFF_CATEGORIES,
  DAMAGE_FRAGILE_CATEGORIES,
} from '../contracts/damage-calculation.js';

import {
  toNumber,
  hasValue,
  clonePlainObject,
  skillIdEndsWith,
  cleanSkillName,
  flattenSkillParts,
  findAttackPart,
  findSkill,
  findEffectPart,
  getEnemyBorder,
  resolveEffectPower,
  ATTACK_PART_TYPES,
  NORMAL_ATTACK_SKILL_NAME,
  PURSUIT_SKILL_NAME,
  NORMAL_ATTACK_ID_SUFFIX,
  PURSUIT_ID_SUFFIX,
} from './calculator-helpers.js';

const DEFAULT_ENEMY_BORDER = 770;
const DEFAULT_LEVEL = 10;
const DEFAULT_ORB_LEVEL = 0;
const DEFAULT_PROVIDER_STAT = 675;
const DEFAULT_ATTACKER_STAT = 600;
const DEFAULT_DAMAGE_RANGE_RATE = 0.1;
const DEFAULT_TOKEN_RATE_PER_COUNT = 0.1;
const DEFAULT_ZONE_MULTIPLIER = 1.5;
const DEFAULT_DESTRUCTION_RATE = 1;
const DEFAULT_DESTRUCTION_MULTIPLIER = 1;
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

function aggregateBuffs(buffs) {
  const normalBuffs = [];
  const singleBuffs = [];
  for (const buff of buffs) {
    const power = toNumber(buff?.resolvedPower);
    if (String(buff?.limitType ?? '') === 'Only') {
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
  const statusType = String(effect?.statusType ?? '');
  if (statusType === 'ElementResistDown') {
    return 'ElementDefense';
  }
  return 'NormalDefense';
}

function inferFragileCategory(effect) {
  if (FRAGILE_CATEGORY_SET.has(effect?.category)) {
    return effect.category;
  }
  return 'NormalFragile';
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

function calculateBaseDamage({ statusAtk, paramBorder, threshold, minPower, maxPower, isCritical, isNormalAttack, abilitySprCorrection, clampOverLimit = true }) {
  const effectiveThreshold = isCritical && isNormalAttack
    ? threshold / NORMAL_ATTACK_CRIT_E_DIVISOR
    : threshold;
  const border = isCritical
    ? paramBorder - CRITICAL_BORDER_REDUCTION - Math.max(0, -CRITICAL_BORDER_REDUCTION - abilitySprCorrection)
    : paramBorder;
  const diff = statusAtk - border;
  
  let base;
  if (diff < 0) {
    base = (minPower / effectiveThreshold) * (diff + effectiveThreshold);
  } else if (diff < effectiveThreshold) {
    base = ((maxPower - minPower) / effectiveThreshold) * diff + minPower;
  } else {
    if (clampOverLimit) {
      base = maxPower;
    } else {
      base = maxPower + maxPower * (diff - effectiveThreshold) * 0.0025;
    }
  }
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
  const options = input?.options ?? {};
  const clampOverLimit = options.clampOverLimit !== false;
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
  const isPursuit = skill?.name === PURSUIT_SKILL_NAME && skillIdEndsWith(skill, PURSUIT_ID_SUFFIX);
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
    clampOverLimit,
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
    clampOverLimit,
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
  const mindEyeBuffsResolved = [];
  const funnelBuffsResolved = [];

  for (const rawBuff of attacker.statusEffects ?? []) {
    const buff = { ...rawBuff, statusType: rawBuff?.statusType ?? rawBuff?.buffType ?? 'AttackUp' };
    if (!SUPPORTED_BUFF_SET.has(buff.statusType)) {
      ignoredEffects.push({ statusType: buff.statusType, skillName: buff.skillName ?? '', side: 'attacker' });
      continue;
    }
    const buffWithStats = { ...buff };
    if (!buffWithStats.providerStats && !buffWithStats.stats && !buffWithStats.providerWis && !buffWithStats.providerWisOrLuk) {
      buffWithStats.providerStats = stats;
    }
    const resolved = { ...buffWithStats, skillName: buffWithStats.skillName ?? '', resolvedPower: resolveEffectPower(buffWithStats, skills) };
    if (['AttackUp', 'Charge', 'ElementAttackUp'].includes(buff.statusType)) {
      buffsResolved.push(resolved);
    } else if (['CritDamageUp', 'CritBuff'].includes(buff.statusType)) {
      critBuffsResolved.push(resolved);
    } else if (buff.statusType === 'MindEye') {
      mindEyeBuffsResolved.push(resolved);
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
    const resolved = { ...debuff, skillName: debuff.skillName ?? '', resolvedPower: resolveEffectPower(debuff, skills, { enemyBorder: paramBorder }) };
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
  let zoneBuffRate = 0;
  if (activeZone !== 'none') {
    const zoneElement = ZONE_ELEMENT_MAP[activeZone];
    if (zoneElement) {
      const skillElements = (fallbackPart?.elements ?? []).map((element) => String(element).trim().toLowerCase());
      if (skillElements.includes(zoneElement)) {
        // Zone は公式仕様でスキル攻撃力アップカテゴリ（加算）
        zoneBuffRate = DEFAULT_ZONE_MULTIPLIER - 1;
      }
    } else {
      ignoredEffects.push({ statusType: 'activeZone', skillName: input?.activeZone ?? '', side: 'context' });
    }
  }

  // 武器属性相性のみが resistanceTotal を構成する（Zone は攻撃バフカテゴリへ）
  const resistanceTotal = affinityMultiplier;
  const isWeaknessAttack = resistanceTotal > 1;
  // MindEye: スキル攻撃力アップカテゴリ（通常+クリ両方に影響）。ただし通常攻撃および追撃には適用しない。
  const mindEyeTotal = isWeaknessAttack && !isNormalAttack && !isPursuit
    ? mindEyeBuffsResolved.reduce((sum, buff) => sum + toNumber(buff.resolvedPower), 0) / 100
    : 0;
  const buffMultiplier = 1 + aggregateBuffs(buffsResolved) + zoneBuffRate + mindEyeTotal;
  const passiveDefenseDown = toNumber(defender.passiveDefenseDown);
  const debuffVal = aggregateDebuffs(debuffsResolved) + passiveDefenseDown;
  const fragileVal = aggregateFragiles(fragilesResolved, isWeaknessAttack);
  const debuffMultiplier = 1 + debuffVal + fragileVal;
  const vulnerabilityMultiplier = 1;
  // クリティカル枠: CritDamageUp/CritBuff のみ（MindEye は攻撃バフカテゴリへ移動）
  const critBuffTotal = critBuffsResolved.reduce((sum, buff) => sum + toNumber(buff.resolvedPower), 0) / 100;
  const critMindeyeMultiplier = (CRITICAL_BASE_RATE + critBuffTotal) / CRITICAL_BASE_RATE;
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
      resolvedSkill: skill
        ? {
            id: Number(skill.id ?? 0),
            name: String(skill.name ?? ''),
            isNormalAttack,
          }
        : null,
      baseDamageNormal,
      baseDamageCrit,
      buffMultiplier,
      critMindeyeMultiplier,
      debuffMultiplier,
      vulnerabilityMultiplier,
      resistMultiplier: 1,
      affinityMultiplier,
      tokenMultiplier,
      funnelMultiplier,
      ignoredEffects,
    },
  };
}

/**
 * 破壊率（Destruction Rate）の計算およびヒットごとの累積シミュレーションを行う
 */
export function calculateDestruction(input, data) {
  const styles = data?.styles ?? [];
  const enemies = data?.enemies ?? [];
  const skills = data?.skills ?? [];
  const spMapping = data?.spMapping ?? {};

  const attacker = clonePlainObject(input?.attacker);
  const defender = clonePlainObject(input?.defender);
  const skillInput = clonePlainObject(input?.skill);
  const hits = input?.hits ?? [];

  const ignoredEffects = [];

  // 1. 攻撃者の解決とロールの特定
  const styleId = attacker.styleId;
  const style = styles.find((s) => Number(s.id) === Number(styleId)) ?? null;
  const role = style ? (style.role ?? 'Attacker') : 'Attacker';

  // ブラスターロール補正（+200% = 2.00）
  let bg27 = String(role).toLowerCase() === 'blaster' ? 2.00 : 0.0;

  // 装備アクセサリ（ブラストピアス等）
  const accessories = attacker.accessories ?? [];
  if (accessories.includes('BlastPierce') || accessories.includes('ブラストピアス')) {
    bg27 += 0.15;
  }

  // 2. スキルの基本情報の取得 (BG30)
  const skillId = skillInput.skillId;
  const skillName = skillInput.name;
  const cleanName = cleanSkillName(skillName);

  const skill = findSkill(skills, skillId, cleanName);

  let bg30 = 0.0;
  let hitCount = 1;
  let part = null;

  if (skill) {
    hitCount = toNumber(skill.hit_count, 1);
    const parts = flattenSkillParts(skill.parts ?? []);

    for (const p of parts) {
      if (ATTACK_PART_TYPE_SET.has(String(p.skill_type ?? ''))) {
        part = p;
        break;
      }
    }
  }

  if (part) {
    const multipliers = part.multipliers ?? {};
    const bg30Raw = toNumber(multipliers.dr, 1.0);

    let isNormalAttack = false;
    let isPursuit = false;
    if (skillName) {
      if (skillName.includes('通常攻撃')) {
        isNormalAttack = true;
      } else if (skillName.includes('追撃')) {
        isPursuit = true;
      }
    }

    if (isNormalAttack) {
      bg30 = 0.08;
    } else if (isPursuit) {
      bg30 = bg30Raw;
    } else {
      let spCost = skill ? toNumber(skill.sp_cost, 0.0) : 0.0;
      const mappingInfo = spMapping[skillName] || spMapping[cleanName];
      if (mappingInfo) {
        const spVal = mappingInfo.sp;
        if (spVal !== undefined && spVal !== null && spVal !== '-') {
          spCost = toNumber(spVal);
        }
      }
      bg30 = (bg30Raw * spCost) / 100.0;
    }
  } else {
    // フォールバック
    bg30 = 1.0;
    if (skillName) {
      if (skillName.includes('通常攻撃')) {
        bg30 = 0.08;
      } else if (skillName.includes('追撃')) {
        bg30 = 1.0;
      }
    }
  }

  // 3. バフの集約 (AS39)
  const SUPPORTED_BUFFS = new Set(['DestructionUp']);
  const buffs = attacker.statusEffects ?? [];
  const destructionBuffsResolved = [];

  for (const b of buffs) {
    const st = b.statusType;
    if (!SUPPORTED_BUFFS.has(st)) {
      ignoredEffects.push({ statusType: st, skillName: b.skillName ?? '', side: 'attacker' });
      continue;
    }

    const pResolved = resolveEffectPower(b, skills);
    destructionBuffsResolved.push({
      ...b,
      resolvedPower: pResolved,
    });
  }

  // 破壊率バフの集約ルール（通常バフと同様に、上位2枠の合計を適用）
  destructionBuffsResolved.sort((a, b) => b.resolvedPower - a.resolvedPower);
  const as39 = destructionBuffsResolved.slice(0, 2).reduce((sum, b) => sum + b.resolvedPower, 0) / 100.0;

  // 4. デバフ側の処理 (現在サポートされていないデバフはすべて警告)
  const debuffs = defender.statusEffects ?? [];
  for (const d of debuffs) {
    ignoredEffects.push({ statusType: d.statusType, skillName: d.skillName ?? '', side: 'defender' });
  }

  // 5. 敵の耐性と破壊上限の解決
  const al10 = toNumber(defender.destructionResist, 0.0);

  let destructionLimit = defender.destructionLimit;
  if (destructionLimit === undefined || destructionLimit === null) {
    const enemyId = defender.enemyId;
    const enemy = enemies.find((e) => String(e.id) === String(enemyId));
    if (enemy && enemy.base_param) {
      const maxDRate = toNumber(enemy.base_param.max_d_rate, 150);
      destructionLimit = maxDRate / 100.0;
    } else {
      destructionLimit = 3.0; // デフォルト 300%
    }
  }

  // 6. 基本破壊率の計算 (D_base)
  let dBase = 0.0;
  let isNormalAttack = false;
  let isPursuit = false;
  if (skillName) {
    if (skillName.includes('通常攻撃')) {
      isNormalAttack = true;
    } else if (skillName.includes('追撃')) {
      isPursuit = true;
    }
  }

  if (isNormalAttack || isPursuit) {
    dBase = bg30;
  } else if (bg27 === 0) {
    dBase = Math.floor(bg30 * (1.0 + as39) * 10000) / 10000.0;
  } else {
    // ブラスター補正 (スロープ補正) の計算
    const bPct = bg27 * 100.0;
    let slopePct = 0.0;
    if (hitCount < 11) {
      slopePct = 5.0 + ((bPct - 5.0) * (hitCount - 1.0)) / 9.0;
    } else {
      slopePct = bPct;
    }

    dBase = Math.floor((bg30 * (100.0 + slopePct + as39 * 100.0)) / 100.0 * 10000) / 10000.0;
  }

  const destructionMultiplier = toNumber(defender.destructionMultiplier, DEFAULT_DESTRUCTION_MULTIPLIER);
  const dFinalBase = dBase * (1.0 - al10) * destructionMultiplier;

  // 7. ヒットごとの累積シミュレーション
  // 破壊率は内部・戻り値ともに 1.0 ベース（100% = 1.0）で扱う。
  const initialDestruction = defender.destructionRate !== undefined && defender.destructionRate !== null
    ? toNumber(defender.destructionRate, DEFAULT_DESTRUCTION_RATE)
    : DEFAULT_DESTRUCTION_RATE;
  const dpInitial = toNumber(defender.dp, 0.0);
  const autoBreak = input?.autoBreak === true;

  let currentDestruction = initialDestruction;
  let accumulatedDamage = 0.0;

  for (const hit of hits) {
    const damage = toNumber(hit.damage, 0.0);
    const isMultiHit = Boolean(hit.isMultiHit);
    const hitRatio = toNumber(hit.hitRatio, 1.0);

    accumulatedDamage += damage;
    const isBroken = autoBreak
      ? accumulatedDamage >= dpInitial
      : hit.isBreakHit === true;

    let addVal = 0.0;
    if (isBroken) {
      if (isMultiHit) {
        // 連撃ヒット
        addVal = dFinalBase * hitRatio;
      } else {
        // 通常ヒット
        addVal = dFinalBase / hitCount;
      }
    }
    currentDestruction = Math.min(destructionLimit, currentDestruction + addVal);
  }

  return {
    destructionRate: currentDestruction,
    breakdown: {
      baseDestruction: dBase,
      finalBaseDestruction: dFinalBase,
      blasterCorrection: bg27,
      buffMultiplier: as39,
      destructionMultiplier,
      ignoredEffects,
    },
  };
}

export {
  NORMAL_ATTACK_SKILL_NAME,
  PURSUIT_SKILL_NAME,
  NORMAL_ATTACK_ID_SUFFIX,
  PURSUIT_ID_SUFFIX,
  ATTACK_PART_TYPES,
  flattenSkillParts,
  resolveEffectPower,
} from './calculator-helpers.js';
