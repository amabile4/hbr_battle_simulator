import {
  toNumber,
  clonePlainObject,
  cleanSkillName,
  findSkill,
  findAttackPart,
  resolveEffectPower,
} from './calculator-helpers.js';

const DESTRUCTION_BASE_HIT_REFERENCE = 8;
const RATIO_PERCENT_DENOMINATOR = 100;

/**
 * 破壊率（Destruction Rate）の計算およびヒットごとの累積シミュレーションを行う
 */
export function calculateDestruction(input, data) {
  const enemies = data?.enemies ?? [];
  const skills = data?.skills ?? [];

  const attacker = clonePlainObject(input?.attacker);
  const defender = clonePlainObject(input?.defender);
  const skillInput = clonePlainObject(input?.skill);
  const hits = input?.hits ?? [];

  const ignoredEffects = [];

  // 2. Look up skill and attack part
  const skillId = skillInput.skillId;
  const skillName = skillInput.name;
  let cleanName = skillName;
  if (skillName) {
    cleanName = skillName.replace('[単独発動]', '').split('[')[0].split('(')[0].split('（')[0].trim();
  }
  const skill = findSkill(skills, skillId, cleanName) ?? (
    Array.isArray(skillInput?.parts) ? skillInput : null
  );

  let part = null;
  if (skillInput.attackPart !== undefined && skillInput.attackPart !== null) {
    part = skillInput.attackPart;
  } else if (skill) {
    part = findAttackPart(skill);
  }

  // 3. Resolve dr, SP cost and attack type
  let isNormalAttack = false;
  let isPursuit = false;
  let sp = 4.0;

  if (skillInput.isNormalAttack !== undefined && skillInput.isNormalAttack !== null) {
    isNormalAttack = Boolean(skillInput.isNormalAttack);
  }

  if (skillInput.isPursuit !== undefined && skillInput.isPursuit !== null) {
    isPursuit = Boolean(skillInput.isPursuit);
  }

  if (skillInput.spCostOverride !== undefined && skillInput.spCostOverride !== null) {
    sp = Number(skillInput.spCostOverride);
  } else if (skill) {
    sp = Number(skill.sp_cost ?? 4.0);
  }
  sp = Math.max(0.0, sp);

  // Resolve dr value
  let dr = null;
  if (part && part.multipliers && part.multipliers.dr !== undefined && part.multipliers.dr !== null) {
    const conditionResults = skillInput.conditionResults ?? null;
    if (part.skill_type === 'DamageRateChangeAttackSkill' && part.cond && conditionResults && conditionResults[part.cond] === true) {
      dr = Number(part.value[0]);
    } else {
      dr = Number(part.multipliers.dr);
    }
  }

  if (dr === null || dr === undefined) {
    if (isNormalAttack) {
      dr = 1.0;
    } else if (isPursuit) {
      dr = 0.75;
    }
  }

  // 4. Resolve destruction factor (F_tag) and AoE flag (only used as fallback when dr is missing)
  const isAoE = (skill && (skill.target_type === 'All' || skill.is_aoe === true)) || (skillInput && skillInput.isAoE === true);

  let fTag = isAoE ? 0.20 : 0.25;
  if (skill) {
    const desc = skill.desc || '';
    if (desc.includes('[破壊率絶大]')) {
      fTag = 2.50;
    } else if (desc.includes('[破壊率超特大]')) {
      fTag = isAoE ? 1.60 : 2.00;
    } else if (desc.includes('[破壊率特大]')) {
      fTag = isAoE ? 1.20 : 1.50;
    } else if (desc.includes('[破壊率大]')) {
      fTag = isAoE ? 0.80 : 1.00;
    }
  }

  // 5. Resolve enemy destructionMultiplier
  const enemyId = defender.enemyId;
  const enemy = enemies.find((e) => String(e.id) === String(enemyId));

  let destMult = defender.destructionMultiplier;
  if (destMult === undefined || destMult === null) {
    if (enemy && enemy.base_param) {
      destMult = Number(enemy.base_param.d_rate ?? 1.0);
    } else {
      destMult = 1.0;
    }
  } else {
    destMult = Number(destMult);
  }
  // 非有限値・負値をガード: 破壊不可（0）として扱う
  if (!Number.isFinite(destMult) || destMult < 0) {
    destMult = 0.0;
  }

  // 6. Calculate base destruction rate before buffs
  let baseDestRate = 0.0;
  if (dr !== null && dr !== undefined) {
    if (isNormalAttack) {
      baseDestRate = destMult / RATIO_PERCENT_DENOMINATOR;
    } else if (isPursuit) {
      baseDestRate = dr * 8.0 * destMult / RATIO_PERCENT_DENOMINATOR;
    } else {
      const rawBaseHitCount = Number(skillInput.baseHitCount ?? skill?.hit_count ?? skill?.hitCount ?? 0);
      const baseHitCountForFormula = Number.isFinite(rawBaseHitCount) && rawBaseHitCount > 0
        ? rawBaseHitCount
        : Math.max(1, hits.filter((hit) => !hit.isMultiHit).length);
      baseDestRate =
        dr * destMult * baseHitCountForFormula /
        (DESTRUCTION_BASE_HIT_REFERENCE * RATIO_PERCENT_DENOMINATOR);
    }
  } else {
    // Fallback tag-based calculation
    const spVal = (isNormalAttack || isPursuit) ? 8.0 : sp;
    const drVal = destMult / 25.0;
    baseDestRate = fTag * spVal * drVal;
  }

  let accessoryBonus = attacker.accessoryDestructionRateBonus;
  if (accessoryBonus !== undefined && accessoryBonus !== null) {
    accessoryBonus = Number(accessoryBonus);
  } else {
    accessoryBonus = 0.0;
  }

  // 8. Resolve buffs (DestructionUp)
  const buffs = attacker.statusEffects ?? [];
  const destructionBuffsResolved = [];

  for (const b of buffs) {
    if (b.statusType === 'DestructionUp') {
      const pResolved = resolveEffectPower(b, skills);
      destructionBuffsResolved.push(pResolved);
    }
  }

  destructionBuffsResolved.sort((a, b) => b - a);
  const buffMultiplier = destructionBuffsResolved.slice(0, 2).reduce((sum, val) => sum + val, 0) / 100.0;

  // 9. Total hits count (h)
  let h = hits.filter((hit) => !hit.isMultiHit).length;
  if (h === 0) {
    if (skill) {
      h = Number(skill.hit_count ?? 1);
    } else {
      h = 1;
    }
  }
  const funnelHitCount = Math.max(0.0, toNumber(skillInput.funnelHitCount, 0.0));
  h = Math.max(1, h, Math.ceil(toNumber(skillInput.baseHitCount, 0.0) + funnelHitCount));

  // 11. Base destruction with buffs and blaster
  const flatDestructionBonus = toNumber(attacker.flatDestructionRateBonus, 0.0);
  const transcendenceBurstDestructionRateGainBonusRate = toNumber(
    attacker.transcendenceBurstDestructionRateGainBonusRate,
    0.0
  );
  const markDestructionRateGainBonusRate = toNumber(
    attacker.markDestructionRateGainBonusRate,
    0.0
  );
  const resonanceBonus = toNumber(attacker.resonanceDestructionRateBonus, 0.0);
  const bonusSum =
    buffMultiplier +
    transcendenceBurstDestructionRateGainBonusRate +
    markDestructionRateGainBonusRate +
    flatDestructionBonus +
    accessoryBonus +
    resonanceBonus;

  let baseDestruction = 0.0;
  if (isNormalAttack) {
    baseDestruction = baseDestRate * (1.0 + transcendenceBurstDestructionRateGainBonusRate);
  } else if (isPursuit) {
    baseDestruction = baseDestRate;
  } else {
    baseDestruction = Math.floor(baseDestRate * (1.0 + bonusSum) * 10000.0) / 10000.0;
  }

  // 12. Apply enemy destructionResist
  const destResist = defender.destructionResist !== undefined && defender.destructionResist !== null
    ? Number(defender.destructionResist)
    : 0.0;

  const finalBaseDestruction = isNormalAttack
    ? baseDestruction
    : baseDestruction * (1.0 - destResist);

  // 13. Resolve destruction rate limit
  let destLimit = defender.destructionLimit;
  if (destLimit === undefined || destLimit === null) {
    if (enemy && enemy.base_param) {
      destLimit = Number(enemy.base_param.max_d_rate ?? 150.0) / 100.0;
    } else {
      destLimit = 3.0;
    }
  } else {
    destLimit = Number(destLimit);
  }

  let limitExceedBonus = attacker.destructionLimitExceedBonus;
  if (limitExceedBonus !== undefined && limitExceedBonus !== null) {
    limitExceedBonus = Number(limitExceedBonus);
  } else {
    limitExceedBonus = 0.0;
  }

  const finalDestLimit = destLimit + limitExceedBonus;

  // 14. Simulation
  const autoBreak = input?.autoBreak !== undefined && input?.autoBreak !== null ? Boolean(input.autoBreak) : false;
  const dpInit = Number(defender.dp ?? 0.0);
  let destructionRate = Number(defender.destructionRate ?? 1.0);
  const funnelRate = Math.max(0.0, toNumber(skillInput.funnelRate, 0.0));
  const funnelMultiplier = isNormalAttack || isPursuit
    ? 1.0
    : 1.0 + funnelRate * funnelHitCount;
  const effectiveBaseDestruction = finalBaseDestruction * funnelMultiplier;

  let dmgAccum = 0.0;
  let isBroken = dpInit <= 0.0;
  for (const hit of hits) {
    dmgAccum += Number(hit.damage ?? 0.0);
    const hitIsBreak = autoBreak ? (dmgAccum >= dpInit) : (hit.isBreakHit === true);
    if (hitIsBreak || isBroken) {
      isBroken = true;
      let addI = 0.0;
      if (hit.isMultiHit) {
        addI = effectiveBaseDestruction * Number(hit.hitRatio ?? 1.0);
      } else {
        addI = effectiveBaseDestruction / h;
      }
      destructionRate = Math.min(finalDestLimit, destructionRate + addI);
    }
  }

  // 15. Ignored effects warning
  for (const b of buffs) {
    if (b.statusType !== 'DestructionUp') {
      ignoredEffects.push({
        statusType: b.statusType,
        skillName: b.skillName,
        side: 'attacker',
      });
    }
  }

  return {
    destructionRate,
    breakdown: {
      // 入力パラメータ
      dr,
      destMult,
      sp,
      isNormalAttack,
      isPursuit,
      hitCount: h,
      // 中間計算値
      baseDestRate,
      sRatio: 0,
      buffMultiplier,
      blasterCorrection: 0,
      accessoryBonus,
      flatDestructionBonus,
      transcendenceBurstDestructionRateGainBonusRate,
      markDestructionRateGainBonusRate,
      bonusSum,
      destResist,
      resonanceBonus,
      funnelHitCount,
      funnelRate,
      funnelMultiplier,
      // 最終値
      baseDestruction,
      finalBaseDestruction,
      effectiveBaseDestruction,
      destLimit,
      limitExceedBonus,
      finalDestLimit,
      // シミュレーション
      destructionRate,
      dpInit,
      autoBreak,
      ignoredEffects,
    },
  };
}
