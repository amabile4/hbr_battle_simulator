import {
  toNumber,
  clonePlainObject,
  cleanSkillName,
  flattenSkillParts,
  findSkill,
  ATTACK_PART_TYPE_SET,
  resolveEffectPower,
} from './calculator-helpers.js';

/**
 * 破壊率（Destruction Rate）の計算およびヒットごとの累積シミュレーションを行う
 */
export function calculateDestruction(input, data) {
  const styles = data?.styles ?? [];
  const enemies = data?.enemies ?? [];
  const skills = data?.skills ?? [];

  const attacker = clonePlainObject(input?.attacker);
  const defender = clonePlainObject(input?.defender);
  const skillInput = clonePlainObject(input?.skill);
  const hits = input?.hits ?? [];

  const ignoredEffects = [];

  // 1. Look up attacker style & role
  const styleId = attacker.styleId;
  const style = styles.find((s) => Number(s.id) === Number(styleId)) ?? null;
  const role = style ? (style.role ?? 'Attacker') : 'Attacker';

  // 2. Look up skill
  const skillId = skillInput.skillId;
  const skillName = skillInput.name;
  let cleanName = skillName;
  if (skillName) {
    cleanName = skillName.replace('[単独発動]', '').split('[')[0].split('(')[0].split('（')[0].trim();
  }
  const skill = findSkill(skills, skillId, cleanName);

  // 3. SP cost and attack type resolution
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

  // 4. Get dr (destruction rate) from skill parts
  let dr = 1.0;
  let part = null;
  if (skill) {
    const parts = flattenSkillParts(skill.parts ?? []);
    for (const p of parts) {
      if (ATTACK_PART_TYPE_SET.has(String(p.skill_type ?? ''))) {
        part = p;
        break;
      }
    }
    if (part && part.multipliers) {
      dr = Number(part.multipliers.dr ?? 1.0);
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

  // 6. Calculate BG30 (base destruction rate before buffs)
  let bg30 = 0.0;
  if (isNormalAttack || isPursuit) {
    bg30 = (dr * 8.0 * destMult) / 100.0;
  } else {
    bg30 = (dr * sp * destMult) / 100.0;
  }

  // 7. Blaster correction & accessories
  let blasterCorrection = 0.0;
  if (String(role).toLowerCase() === 'blaster') {
    blasterCorrection += 2.0;
  }

  let accessoryBonus = attacker.accessoryDestructionRateBonus;
  if (accessoryBonus !== undefined && accessoryBonus !== null) {
    accessoryBonus = Number(accessoryBonus);
  } else {
    accessoryBonus = 0.0;
  }
  blasterCorrection += accessoryBonus;

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

  // 10. Blaster slope correction
  let sRatio = 0.0;
  if (blasterCorrection > 0.0) {
    const bPct = blasterCorrection * 100.0;
    let slopePct = 0.0;
    if (h < 11) {
      slopePct = 5.0 + ((bPct - 5.0) * (h - 1)) / 9.0;
    } else {
      slopePct = bPct;
    }
    sRatio = slopePct / 100.0;
  }

  // 11. Base destruction with buffs and blaster
  const flatDestructionBonus = toNumber(attacker.flatDestructionRateBonus, 0.0);

  let baseDestruction = 0.0;
  if (isNormalAttack || isPursuit) {
    baseDestruction = bg30;
  } else {
    baseDestruction = Math.floor(bg30 * (1.0 + sRatio + buffMultiplier + flatDestructionBonus) * 10000.0) / 10000.0;
  }

  // 12. Apply enemy destructionResist (AL10)
  const destResist = defender.destructionResist !== undefined && defender.destructionResist !== null
    ? Number(defender.destructionResist)
    : 0.0;

  let resonanceBonus = attacker.resonanceDestructionRateBonus;
  if (resonanceBonus !== undefined && resonanceBonus !== null) {
    resonanceBonus = Number(resonanceBonus);
  } else {
    resonanceBonus = 0.0;
  }

  const finalBaseDestruction = baseDestruction * (1.0 - destResist) * (1.0 + resonanceBonus);

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

  let dmgAccum = 0.0;
  let isBroken = dpInit <= 0.0;
  for (const hit of hits) {
    dmgAccum += Number(hit.damage ?? 0.0);
    const hitIsBreak = autoBreak ? (dmgAccum >= dpInit) : (hit.isBreakHit === true);
    if (hitIsBreak || isBroken) {
      isBroken = true;
      let addI = 0.0;
      if (hit.isMultiHit) {
        addI = finalBaseDestruction * Number(hit.hitRatio ?? 1.0);
      } else {
        addI = finalBaseDestruction / h;
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
      baseDestruction,
      finalBaseDestruction,
      blasterCorrection,
      buffMultiplier,
      destructionMultiplier: destMult,
      accessoryBonus,
      resonanceBonus,
      limitExceedBonus,
      flatDestructionRateBonus: flatDestructionBonus,
      ignoredEffects,
    },
  };
}
