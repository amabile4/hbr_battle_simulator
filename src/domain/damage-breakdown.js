export const DAMAGE_RANDOM_FIXED_MULTIPLIER = 1;
export const DAMAGE_BREAKDOWN_VERSION = 1;
export const CRITICAL_GUARANTEE_PERCENT = 100;
export const CRITICAL_BASE_MULTIPLIER = 1.5;

export const DAMAGE_BREAKDOWN_GROUPS = Object.freeze([
  Object.freeze({ id: 'attack-buff', dataGroup: 'buff', title: '攻撃バフ枠' }),
  Object.freeze({ id: 'crit-mindeye', dataGroup: 'crit-mindeye', title: 'クリティカル枠' }),
  Object.freeze({ id: 'funnel', dataGroup: 'funnel', title: '連撃バフ枠' }),
  Object.freeze({ id: 'token-passive', dataGroup: 'token-passive', title: 'トークン・固有枠' }),
  Object.freeze({ id: 'debuff', dataGroup: 'debuff', title: '敵デバフ・脆弱枠' }),
  Object.freeze({ id: 'affinity', dataGroup: 'affinity', title: '基本相性枠' }),
]);

const ELEMENT_LABELS = Object.freeze({
  Fire: '火',
  Ice: '氷',
  Thunder: '雷',
  Light: '光',
  Dark: '闇',
  Slash: '斬',
  Stab: '突',
  Strike: '打',
});

const STATUS_LABELS = Object.freeze({
  AttackUp: '攻撃力アップ',
  BuffCharge: 'チャージ',
  CriticalRateUp: 'クリティカル確率アップ',
  CriticalDamageUp: 'クリティカルダメージアップ',
  DefenseDown: '防御力ダウン',
  Fragile: '脆弱',
  Funnel: '連撃数アップ',
  MindEye: '心眼',
  ResistDown: '属性耐性ダウン',
  ResistDownOverwrite: '属性耐性打ち消し',
  TokenAttack: 'トークン攻撃倍率',
  Zone: 'フィールド',
});

const ELEMENT_MATCHING_STATUS_TYPES = new Set([
  'AttackUp',
  'CriticalRateUp',
  'CriticalDamageUp',
  'DefenseDown',
  'ResistDown',
  'ResistDownOverwrite',
]);

function toFiniteNumber(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function roundTo(value, digits = 4) {
  const scale = 10 ** digits;
  return Math.round(toFiniteNumber(value) * scale) / scale;
}

function cloneArray(value) {
  return Array.isArray(value) ? structuredClone(value) : [];
}

function normalizeElements(elements) {
  if (!Array.isArray(elements)) {
    return [];
  }
  return [...new Set(elements.map((value) => String(value ?? '').trim()).filter(Boolean))];
}

function getElementLabel(element) {
  return ELEMENT_LABELS[String(element ?? '').trim()] ?? String(element ?? '').trim();
}

function getStatusLabel(statusType, elements = []) {
  const normalized = String(statusType ?? '').trim();
  const base = STATUS_LABELS[normalized] ?? normalized;
  const normalizedElements = normalizeElements(elements);
  if (ELEMENT_MATCHING_STATUS_TYPES.has(normalized) && normalizedElements.length > 0) {
    return `${getElementLabel(normalizedElements[0])}${base}`;
  }
  return base;
}

function isActiveEffect(effect) {
  const exitCond = String(effect?.exitCond ?? '').trim();
  if (exitCond === 'Eternal') {
    return true;
  }
  const remaining = toFiniteNumber(effect?.remaining ?? effect?.remainingTurns, 0);
  return remaining > 0;
}

function readEffectPower(effect) {
  return toFiniteNumber(effect?.power, 0);
}

function compareEffectPowerDesc(left, right) {
  const powerDiff = readEffectPower(right) - readEffectPower(left);
  if (powerDiff !== 0) {
    return powerDiff;
  }
  const remainingDiff =
    toFiniteNumber(right?.remaining ?? right?.remainingTurns, 0) -
    toFiniteNumber(left?.remaining ?? left?.remainingTurns, 0);
  if (remainingDiff !== 0) {
    return remainingDiff;
  }
  return toFiniteNumber(left?.effectId, 0) - toFiniteNumber(right?.effectId, 0);
}

function durationGroup(effect) {
  return String(effect?.exitCond ?? '').trim() === 'Eternal' ? 'eternal' : 'finite';
}

function competitionKey(effect) {
  const statusType = String(effect?.statusType ?? '').trim();
  const elements = normalizeElements(effect?.elements).sort().join(',');
  return `${statusType}|${elements}|${durationGroup(effect)}|${String(effect?.targetIndex ?? '')}`;
}

function pickTopByPower(effects, limit) {
  return cloneArray(effects)
    .sort(compareEffectPowerDesc)
    .slice(0, Math.max(0, toFiniteNumber(limit, 0)));
}

function sumEffectPower(effects) {
  return (Array.isArray(effects) ? effects : []).reduce((sum, effect) => sum + readEffectPower(effect), 0);
}

function selectAdoptedEffects(effects) {
  const activeEffects = cloneArray(effects).filter(isActiveEffect);
  const groups = new Map();
  for (const effect of activeEffects) {
    const key = competitionKey(effect);
    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key).push(effect);
  }

  const adopted = [];
  for (const groupEffects of groups.values()) {
    const only = groupEffects.filter((effect) => String(effect?.limitType ?? '') === 'Only');
    const nonOnly = groupEffects.filter((effect) => String(effect?.limitType ?? '') !== 'Only');
    const topOnly = pickTopByPower(only, 1);
    const topNonOnly = pickTopByPower(nonOnly, 2);
    adopted.push(...(sumEffectPower(topOnly) >= sumEffectPower(topNonOnly) ? topOnly : topNonOnly));
  }
  return adopted;
}

function effectMatchesAttackReferences(effect, references) {
  const elements = normalizeElements(effect?.elements);
  if (elements.length === 0) {
    return true;
  }
  const refSet = new Set(normalizeElements(references));
  return elements.some((element) => refSet.has(element));
}

function createRateContribution(effect, options = {}) {
  const statusType = String(options.statusType ?? effect?.statusType ?? '').trim();
  const elements = normalizeElements(effect?.elements);
  const value = toFiniteNumber(options.value ?? effect?.power, 0);
  return {
    kind: String(options.kind ?? 'rate'),
    label: String(options.label ?? getStatusLabel(statusType, elements)),
    value,
    iconStatusType: String(options.iconStatusType ?? statusType),
    elements,
    sourceSkillName: String(options.sourceSkillName ?? effect?.sourceSkillName ?? ''),
    sourceCharacterName: String(options.sourceCharacterName ?? effect?.sourceCharacterName ?? ''),
    description: String(options.description ?? effect?.sourceSkillDesc ?? ''),
  };
}

function createStaticContribution(options = {}) {
  return {
    kind: String(options.kind ?? 'rate'),
    label: String(options.label ?? ''),
    value: toFiniteNumber(options.value, 0),
    iconStatusType: String(options.iconStatusType ?? ''),
    elements: normalizeElements(options.elements),
    sourceSkillName: String(options.sourceSkillName ?? ''),
    sourceCharacterName: String(options.sourceCharacterName ?? ''),
    description: String(options.description ?? ''),
  };
}

function normalizeGroup(group, rateSum) {
  const multiplier =
    group.id === 'affinity'
      ? (Number.isFinite(Number(rateSum)) ? roundTo(rateSum) : 1)
      : group.id === 'token-passive'
        ? roundTo(calculateTokenPassiveMultiplier(group.contributions))
      : group.id === 'crit-mindeye'
        ? roundTo(rateSum || CRITICAL_BASE_MULTIPLIER)
        : roundTo(1 + rateSum);
  return {
    id: group.id,
    dataGroup: group.dataGroup,
    title: group.title,
    multiplier,
    formula: buildFormula(group.id, group.contributions, multiplier),
    contributions: group.contributions,
  };
}

function calculateTokenPassiveMultiplier(contributions) {
  const entries = Array.isArray(contributions) ? contributions : [];
  const rateTotal = entries
    .filter((entry) => String(entry?.kind ?? 'rate') !== 'multiplier')
    .reduce((sum, entry) => sum + toFiniteNumber(entry.value, 0), 0);
  const multiplierTotal = entries
    .filter((entry) => String(entry?.kind ?? 'rate') === 'multiplier')
    .reduce((product, entry) => product * toFiniteNumber(entry.value, 1), 1);
  return (1 + rateTotal) * multiplierTotal;
}

function buildFormula(groupId, contributions, multiplier) {
  if (!Array.isArray(contributions) || contributions.length === 0) {
    return groupId === 'affinity' ? `式: ${formatMultiplier(multiplier)}` : '式: 1.0';
  }
  if (groupId === 'affinity') {
    return `式: ${contributions.map((entry) => formatMultiplier(entry.value)).join(' * ')}`;
  }
  if (groupId === 'crit-mindeye') {
    return `式: ${formatMultiplier(CRITICAL_BASE_MULTIPLIER)} + ${formatSignedPercent(
      contributions
        .filter((entry) => entry.label !== 'クリティカル基礎倍率')
        .reduce((sum, entry) => sum + toFiniteNumber(entry.value, 0), 0)
    )}`;
  }
  if (groupId === 'token-passive' && contributions.some((entry) => String(entry?.kind ?? 'rate') === 'multiplier')) {
    const rateTotal = contributions
      .filter((entry) => String(entry?.kind ?? 'rate') !== 'multiplier')
      .reduce((sum, entry) => sum + toFiniteNumber(entry.value, 0), 0);
    const multiplierTerms = contributions
      .filter((entry) => String(entry?.kind ?? 'rate') === 'multiplier')
      .map((entry) => formatMultiplier(entry.value));
    return `式: (1.0 + ${formatSignedPercent(rateTotal)}) * ${multiplierTerms.join(' * ')}`;
  }
  return `式: 1.0 + ${formatSignedPercent(
    contributions.reduce((sum, entry) => sum + toFiniteNumber(entry.value, 0), 0)
  )}`;
}

function formatMultiplier(value) {
  return `${roundTo(value, 2).toFixed(2)}x`;
}

function formatSignedPercent(value) {
  const percent = Math.round(toFiniteNumber(value, 0) * 100);
  return `${percent >= 0 ? '+' : ''}${percent}%`;
}

function normalizeZoneBonusRate(zonePowerRate) {
  const numeric = toFiniteNumber(zonePowerRate, 0);
  if (numeric <= 0) {
    return 0;
  }
  return numeric > 1 ? numeric - 1 : numeric;
}

function getTargetIndexes(input) {
  const fromRates = Object.keys(input?.effectiveDamageRatesByEnemy ?? {})
    .map((key) => Number(key))
    .filter((value) => Number.isInteger(value) && value >= 0);
  if (fromRates.length > 0) {
    return [...new Set(fromRates)].sort((left, right) => left - right);
  }
  const target = Number(input?.targetEnemyIndex);
  return Number.isInteger(target) && target >= 0 ? [target] : [0];
}

function getTargetLabel(input, targetEnemyIndex) {
  const slotLabel = `E${Number(targetEnemyIndex) + 1}`;
  const enemyName = String(input?.enemyNamesByEnemy?.[String(targetEnemyIndex)] ?? '').trim();
  return enemyName ? `${slotLabel} ${enemyName}` : slotLabel;
}

function collectAttackBuffContributions(input, targetContext) {
  const effects = cloneArray(input?.activeStatusEffects).filter(
    (effect) => String(effect?.statusType ?? '') === 'AttackUp'
  );
  const contributions = effects.map((effect) => createRateContribution(effect));

  for (const effect of cloneArray(input?.chargeEffects)) {
    const value = readEffectPower(effect);
    if (value !== 0) {
      contributions.push(createRateContribution(effect, { statusType: 'BuffCharge' }));
    }
  }

  const zoneBonus = normalizeZoneBonusRate(input?.zonePowerRate);
  if (zoneBonus !== 0) {
    contributions.push(
      createStaticContribution({
        label: `${getElementLabel(input?.zoneType)}フィールド`,
        value: zoneBonus,
        iconStatusType: 'Zone',
        elements: [String(input?.zoneType ?? '')].filter(Boolean),
      })
    );
  }

  if (targetContext.isWeak && !targetContext.isNormalAttack) {
    for (const effect of cloneArray(input?.selectedMindEyeEffects)) {
      const value = readEffectPower(effect);
      if (value !== 0) {
        contributions.push(createRateContribution(effect, { statusType: 'MindEye' }));
      }
    }
  }

  const accessoryRate = toFiniteNumber(input?.accessoryAttackUpRate, 0);
  if (accessoryRate !== 0) {
    contributions.push(
      createStaticContribution({
        label: 'アクセサリ',
        value: accessoryRate,
        iconStatusType: 'AttackUp',
      })
    );
  }

  const foodBuffAttackUpRate = toFiniteNumber(input?.foodBuffAttackUpRate, 0);
  if (foodBuffAttackUpRate !== 0) {
    contributions.push(
      createStaticContribution({
        label: '食事バフ攻撃力',
        value: foodBuffAttackUpRate,
        iconStatusType: 'AttackUp',
      })
    );
  }

  const highBoostSkillAtkRate = toFiniteNumber(input?.highBoostSkillAtkRate, 0);
  if (highBoostSkillAtkRate !== 0) {
    contributions.push(
      createStaticContribution({
        label: 'ハイブースト',
        value: highBoostSkillAtkRate,
        iconStatusType: 'HighBoost',
      })
    );
  }

  for (const contribution of cloneArray(input?.accessoryContributions)) {
    const value = toFiniteNumber(contribution?.value ?? contribution?.rate, 0);
    if (value !== 0) {
      contributions.push(createStaticContribution({ ...contribution, value }));
    }
  }

  const representedAttackUp =
    sumValues(effects.map((effect) => createRateContribution(effect))) +
    foodBuffAttackUpRate +
    highBoostSkillAtkRate +
    toFiniteNumber(input?.babiedSkillAttackUpRate, 0) +
    toFiniteNumber(input?.divaSkillAttackUpRate, 0) +
    toFiniteNumber(input?.markAttackUpRate, 0) +
    toFiniteNumber(input?.attackUpPerTokenRate, 0);
  const missingAttackUpRate = toFiniteNumber(input?.attackUpRate, 0) - representedAttackUp;
  if (missingAttackUpRate > 0) {
    contributions.push(
      createStaticContribution({
        label: '攻撃力UP',
        value: missingAttackUpRate,
        iconStatusType: 'AttackUp',
      })
    );
  }

  return contributions;
}

function collectCritMindEyeContributions(input) {
  const contributions = [
    createStaticContribution({
      label: 'クリティカル基礎倍率',
      kind: 'multiplier',
      value: CRITICAL_BASE_MULTIPLIER,
      iconStatusType: 'CriticalDamageUp',
    }),
  ];
  const criticalDamageEffects = cloneArray(input?.activeStatusEffects).filter(
    (effect) => String(effect?.statusType ?? '') === 'CriticalDamageUp'
  );
  for (const effect of criticalDamageEffects) {
    contributions.push(createRateContribution(effect));
  }
  const representedCriticalDamageUp = sumValues(criticalDamageEffects.map((effect) => createRateContribution(effect)));
  const missingCriticalDamageUpRate = toFiniteNumber(input?.criticalDamageUpRate, 0) - representedCriticalDamageUp;
  if (missingCriticalDamageUpRate > 0) {
    contributions.push(
      createStaticContribution({
        label: 'クリティカル威力UP',
        value: missingCriticalDamageUpRate,
        iconStatusType: 'CriticalDamageUp',
      })
    );
  }
  const markCriticalDamageUp = toFiniteNumber(input?.markCriticalDamageUp, 0);
  if (markCriticalDamageUp !== 0) {
    contributions.push(
      createStaticContribution({
        label: '固有マーク クリティカル威力',
        value: markCriticalDamageUp,
        iconStatusType: 'CriticalDamageUp',
      })
    );
  }
  return contributions;
}

function collectFunnelContributions(input) {
  const contributions = [];
  for (const effect of cloneArray(input?.funnelEffects)) {
    const hitBonus = Math.max(0, readEffectPower(effect));
    const damageBonus = toFiniteNumber(effect?.metadata?.damageBonus, 0);
    const totalRate = hitBonus * damageBonus;
    if (totalRate === 0) {
      continue;
    }
    contributions.push(
      createRateContribution(effect, {
        statusType: 'Funnel',
        value: totalRate,
        description: `追加${hitBonus}hit x ${Math.round(damageBonus * 100)}%`,
      })
    );
  }
  return contributions;
}

function collectTokenPassiveContributions(input) {
  const contributions = [];
  const tokenRate = toFiniteNumber(input?.tokenAttackTotalRate, 0);
  if (tokenRate !== 0) {
    contributions.push(
      createStaticContribution({
        label: 'トークン攻撃倍率',
        value: tokenRate,
        iconStatusType: 'TokenSet',
        description: `${toFiniteNumber(input?.tokenAttackTokenCount, 0)}個 x ${Math.round(toFiniteNumber(input?.tokenAttackRatePerToken, 0) * 100)}%`,
      })
    );
  }
  const damageRateUpPerTokenRate = toFiniteNumber(input?.damageRateUpPerTokenRate, 0);
  if (damageRateUpPerTokenRate !== 0) {
    contributions.push(
      createStaticContribution({
        label: 'トークン連動ダメージアップ',
        value: damageRateUpPerTokenRate,
        iconStatusType: 'TokenSet',
      })
    );
  }
  const attackByOwnDpRateResolvedMultiplier = toFiniteNumber(input?.attackByOwnDpRateResolvedMultiplier, 0);
  if (attackByOwnDpRateResolvedMultiplier > 0 && attackByOwnDpRateResolvedMultiplier !== 1) {
    contributions.push(
      createStaticContribution({
        label: 'DP条件倍率',
        kind: 'multiplier',
        value: attackByOwnDpRateResolvedMultiplier,
        iconStatusType: 'AttackUp',
      })
    );
  }
  const fixedRates = [
    ['オギャり', input?.babiedSkillAttackUpRate, 'Babied'],
    ['歌姫の加護', input?.divaSkillAttackUpRate, 'Diva'],
    ['固有マーク攻撃力', input?.markAttackUpRate, 'AttackUp'],
    ['トークン連動攻撃力', input?.attackUpPerTokenRate, 'TokenSet'],
  ];
  for (const [label, rawValue, iconStatusType] of fixedRates) {
    const value = toFiniteNumber(rawValue, 0);
    if (value !== 0) {
      contributions.push(createStaticContribution({ label, value, iconStatusType }));
    }
  }
  return contributions;
}

function collectEnemyStatusContributions(input, targetContext, statusTypes) {
  const statuses = selectAdoptedEffects(input?.enemyStatusEffects)
    .filter((status) => Number(status?.targetIndex ?? 0) === Number(targetContext.targetEnemyIndex))
    .filter((status) => statusTypes.has(String(status?.statusType ?? '')))
    .filter((status) => effectMatchesAttackReferences(status, targetContext.attackReferences));

  return statuses
    .filter((status) => String(status?.statusType ?? '') !== 'Fragile' || targetContext.isWeak)
    .map((status) => createRateContribution(status));
}

function collectAffinityContributions(input, targetContext) {
  const explicit = cloneArray(input?.affinityContributionsByEnemy?.[String(targetContext.targetEnemyIndex)]);
  if (explicit.length > 0) {
    return explicit
      .map((entry) =>
        createStaticContribution({
          label: String(entry?.label ?? `${getElementLabel(entry?.reference)}相性`),
          kind: 'multiplier',
          value: toFiniteNumber(entry?.multiplier ?? entry?.value, 1),
          iconStatusType: String(entry?.iconStatusType ?? ''),
          elements: [String(entry?.reference ?? '')].filter(Boolean),
        })
      )
      .filter((entry) => entry.value >= 0);
  }
  const multiplier = toFiniteNumber(
    input?.effectiveDamageRatesByEnemy?.[String(targetContext.targetEnemyIndex)],
    100
  ) / 100;
  return [
    createStaticContribution({
      label: '基本相性',
      kind: 'multiplier',
      value: multiplier > 0 ? multiplier : 1,
    }),
  ];
}

function normalizeTargetContext(input, targetEnemyIndex) {
  const affinityMultiplier = toFiniteNumber(input?.effectiveDamageRatesByEnemy?.[String(targetEnemyIndex)], 100) / 100;
  return {
    targetEnemyIndex,
    targetLabel: getTargetLabel(input, targetEnemyIndex),
    affinityMultiplier: affinityMultiplier > 0 ? affinityMultiplier : 1,
    isWeak: affinityMultiplier > 1,
    isNormalAttack: input?.isNormalAttack === true,
    attackReferences: normalizeElements(input?.attackReferencesByEnemy?.[String(targetEnemyIndex)]),
  };
}

function buildGroupsForTarget(input, targetContext) {
  const attackBuff = collectAttackBuffContributions(input, targetContext);
  const critMindEye = collectCritMindEyeContributions(input);
  const funnel = collectFunnelContributions(input);
  const tokenPassive = collectTokenPassiveContributions(input);
  const debuff = collectEnemyStatusContributions(
    input,
    targetContext,
    new Set(['DefenseDown', 'Fragile', 'ResistDown', 'ResistDownOverwrite'])
  );
  const affinity = collectAffinityContributions(input, targetContext);

  const critRateSum = critMindEye.reduce((sum, entry) => {
    if (entry.label === 'クリティカル基礎倍率') {
      return sum;
    }
    return sum + toFiniteNumber(entry.value, 0);
  }, 0);
  const affinityMultiplier = affinity.reduce((product, entry) => product * toFiniteNumber(entry.value, 1), 1);
  const groups = [
    normalizeGroup({ ...DAMAGE_BREAKDOWN_GROUPS[0], contributions: attackBuff }, sumValues(attackBuff)),
    normalizeGroup({ ...DAMAGE_BREAKDOWN_GROUPS[1], contributions: critMindEye }, CRITICAL_BASE_MULTIPLIER + critRateSum),
    normalizeGroup({ ...DAMAGE_BREAKDOWN_GROUPS[2], contributions: funnel }, sumValues(funnel)),
    normalizeGroup({ ...DAMAGE_BREAKDOWN_GROUPS[3], contributions: tokenPassive }, sumValues(tokenPassive)),
    normalizeGroup({ ...DAMAGE_BREAKDOWN_GROUPS[4], contributions: debuff }, sumValues(debuff)),
    normalizeGroup({ ...DAMAGE_BREAKDOWN_GROUPS[5], contributions: affinity }, affinityMultiplier),
  ];
  return groups;
}

function sumValues(contributions) {
  return (Array.isArray(contributions) ? contributions : []).reduce(
    (sum, contribution) => sum + toFiniteNumber(contribution.value, 0),
    0
  );
}

export function buildCriticalRateBreakdown(input = {}) {
  const contributions = [];
  const criticalRateEffects = cloneArray(input?.activeStatusEffects).filter(
    (effect) => String(effect?.statusType ?? '') === 'CriticalRateUp'
  );
  for (const effect of criticalRateEffects) {
    contributions.push(createRateContribution(effect));
  }
  const representedCriticalRateUp = sumValues(criticalRateEffects.map((effect) => createRateContribution(effect)));
  const missingCriticalRateUpRate = toFiniteNumber(input?.criticalRateUpRate, 0) - representedCriticalRateUp;
  if (missingCriticalRateUpRate > 0) {
    contributions.push(
      createStaticContribution({
        label: 'クリティカル率UP',
        value: missingCriticalRateUpRate,
        iconStatusType: 'CriticalRateUp',
      })
    );
  }
  const markCriticalRateUp = toFiniteNumber(input?.markCriticalRateUp, 0);
  if (markCriticalRateUp !== 0) {
    contributions.push(
      createStaticContribution({
        label: '固有マーク クリティカル率',
        value: markCriticalRateUp,
        iconStatusType: 'CriticalRateUp',
      })
    );
  }
  if (input?.hasPenetrationCritical === true) {
    contributions.push(
      createStaticContribution({
        label: '貫通クリティカル',
        value: 1,
        iconStatusType: 'CriticalRateUp',
      })
    );
  }
  const totalRate = contributions.reduce((sum, contribution) => sum + toFiniteNumber(contribution.value, 0), 0);
  const criticalRatePercent = Math.round(totalRate * 100);
  return {
    criticalRatePercent,
    isCriticalGuaranteed: criticalRatePercent >= CRITICAL_GUARANTEE_PERCENT,
    contributions,
  };
}

export function buildDamageBreakdown(input = {}) {
  const targetBreakdowns = getTargetIndexes(input).map((targetEnemyIndex) => {
    const targetContext = normalizeTargetContext(input, targetEnemyIndex);
    const groups = buildGroupsForTarget(input, targetContext);
    const finalMultiplier = roundTo(
      groups.reduce((product, group) => product * toFiniteNumber(group.multiplier, 1), 1) *
        DAMAGE_RANDOM_FIXED_MULTIPLIER
    );
    const increasePercent = Math.round((finalMultiplier - 1) * 100);
    return {
      targetEnemyIndex,
      targetLabel: targetContext.targetLabel,
      finalMultiplier,
      increasePercent,
      formula: groups.map((group) => formatMultiplier(group.multiplier)).join(' * '),
      groups,
    };
  });
  return {
    version: DAMAGE_BREAKDOWN_VERSION,
    mode: 'critical',
    randomMultiplier: DAMAGE_RANDOM_FIXED_MULTIPLIER,
    targetBreakdowns,
  };
}
