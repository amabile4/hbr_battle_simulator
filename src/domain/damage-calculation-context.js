export function buildDamageCalculationContext(input = {}) {
  return {
    actorCharacterId: String(input.actorCharacterId ?? ''),
    actorStyleId: Number(input.actorStyleId ?? 0),
    skillId: Number(input.skillId ?? 0),
    skillLabel: String(input.skillLabel ?? ''),
    skillName: String(input.skillName ?? ''),
    targetType: String(input.targetType ?? ''),
    isNormalAttack: input.isNormalAttack === true,
    isPursuit: input.isPursuit === true,
    destructionAttackPart:
      input.destructionAttackPart && typeof input.destructionAttackPart === 'object'
        ? structuredClone(input.destructionAttackPart)
        : null,
    destructionConditionResultsByEnemy:
      input.destructionConditionResultsByEnemy && typeof input.destructionConditionResultsByEnemy === 'object'
        ? structuredClone(input.destructionConditionResultsByEnemy)
        : {},
    enemyCount: Number(input.enemyCount ?? 1),
    targetEnemyIndex:
      input.targetEnemyIndex === null || input.targetEnemyIndex === undefined
        ? null
        : Number.isFinite(Number(input.targetEnemyIndex))
          ? Number(input.targetEnemyIndex)
          : null,
    baseHitCount: Number(input.baseHitCount ?? 0),
    funnelHitBonus: Number(input.funnelHitBonus ?? 0),
    effectiveHitCountPerEnemy: Number(input.effectiveHitCountPerEnemy ?? 0),
    effectiveHitCountTotal: Number(input.effectiveHitCountTotal ?? 0),
    eligibleEnemyIndexes: Array.isArray(input.eligibleEnemyIndexes)
      ? input.eligibleEnemyIndexes
          .map((value) => Number(value))
          .filter((value) => Number.isInteger(value) && value >= 0)
      : [],
    effectiveDamageRatesByEnemy:
      input.effectiveDamageRatesByEnemy && typeof input.effectiveDamageRatesByEnemy === 'object'
        ? Object.fromEntries(
            Object.entries(input.effectiveDamageRatesByEnemy).map(([targetIndex, rate]) => [
              String(targetIndex),
              Number(rate ?? 0),
            ])
          )
        : {},
    enemyParamBorderByEnemy:
      input.enemyParamBorderByEnemy && typeof input.enemyParamBorderByEnemy === 'object'
        ? Object.fromEntries(
            Object.entries(input.enemyParamBorderByEnemy).map(([targetIndex, value]) => [
              String(targetIndex),
              Number(value ?? 0),
            ])
          )
        : {},
    enemyDpByEnemy:
      input.enemyDpByEnemy && typeof input.enemyDpByEnemy === 'object'
        ? Object.fromEntries(
            Object.entries(input.enemyDpByEnemy).map(([targetIndex, value]) => [
              String(targetIndex),
              Number(value ?? 0),
            ])
          )
        : {},
    enemyNamesByEnemy:
      input.enemyNamesByEnemy && typeof input.enemyNamesByEnemy === 'object'
        ? Object.fromEntries(
            Object.entries(input.enemyNamesByEnemy).map(([targetIndex, value]) => [
              String(targetIndex),
              String(value ?? '').trim(),
            ])
          )
        : {},
    destructionRateByEnemy:
      input.destructionRateByEnemy && typeof input.destructionRateByEnemy === 'object'
        ? Object.fromEntries(
            Object.entries(input.destructionRateByEnemy).map(([targetIndex, value]) => [
              String(targetIndex),
              Number(value ?? 0),
            ])
          )
        : {},
    destructionRateCapByEnemy:
      input.destructionRateCapByEnemy && typeof input.destructionRateCapByEnemy === 'object'
        ? Object.fromEntries(
            Object.entries(input.destructionRateCapByEnemy).map(([targetIndex, value]) => [
              String(targetIndex),
              Number(value ?? 0),
            ])
          )
        : {},
    activeStatusEffects: Array.isArray(input.activeStatusEffects)
      ? structuredClone(input.activeStatusEffects)
      : [],
    chargeEffects: Array.isArray(input.chargeEffects) ? structuredClone(input.chargeEffects) : [],
    enemyStatusEffects: Array.isArray(input.enemyStatusEffects)
      ? structuredClone(input.enemyStatusEffects)
      : [],
    attackReferencesByEnemy:
      input.attackReferencesByEnemy && typeof input.attackReferencesByEnemy === 'object'
        ? structuredClone(input.attackReferencesByEnemy)
        : {},
    affinityContributionsByEnemy:
      input.affinityContributionsByEnemy && typeof input.affinityContributionsByEnemy === 'object'
        ? structuredClone(input.affinityContributionsByEnemy)
        : {},
    enemyTalismanLevelByEnemy:
      input.enemyTalismanLevelByEnemy && typeof input.enemyTalismanLevelByEnemy === 'object'
        ? Object.fromEntries(
            Object.entries(input.enemyTalismanLevelByEnemy).map(([targetIndex, level]) => [
              String(targetIndex),
              Number(level ?? 0),
            ])
          )
        : {},
    enemyDisasterLevelByEnemy:
      input.enemyDisasterLevelByEnemy && typeof input.enemyDisasterLevelByEnemy === 'object'
        ? Object.fromEntries(
            Object.entries(input.enemyDisasterLevelByEnemy).map(([targetIndex, level]) => [
              String(targetIndex),
              Number(level ?? 0),
            ])
          )
        : {},
    enemyAllAbilityDownByEnemy:
      input.enemyAllAbilityDownByEnemy && typeof input.enemyAllAbilityDownByEnemy === 'object'
        ? Object.fromEntries(
            Object.entries(input.enemyAllAbilityDownByEnemy).map(([targetIndex, penalty]) => [
              String(targetIndex),
              Number(penalty ?? 0),
            ])
          )
        : {},
    tokenAttackTokenCount: Number(input.tokenAttackTokenCount ?? 0),
    tokenAttackRatePerToken: Number(input.tokenAttackRatePerToken ?? 0),
    tokenAttackTotalRate: Number(input.tokenAttackTotalRate ?? 0),
    attackByOwnDpRateStartDpRate: Number(input.attackByOwnDpRateStartDpRate ?? 0),
    attackByOwnDpRateReferenceDpRate: Number(input.attackByOwnDpRateReferenceDpRate ?? 0),
    attackByOwnDpRateLowDpMultiplier: Number(input.attackByOwnDpRateLowDpMultiplier ?? 0),
    attackByOwnDpRateHighDpMultiplier: Number(input.attackByOwnDpRateHighDpMultiplier ?? 0),
    attackByOwnDpRateResolvedMultiplier: Number(input.attackByOwnDpRateResolvedMultiplier ?? 0),
    highBoostSkillAtkRate: Number(input.highBoostSkillAtkRate ?? 0),
    attackUpRate: Number(input.attackUpRate ?? 0),
    defenseUpRate: Number(input.defenseUpRate ?? 0),
    criticalRateUpRate: Number(input.criticalRateUpRate ?? 0),
    criticalDamageUpRate: Number(input.criticalDamageUpRate ?? 0),
    damageRateUpPerTokenRate: Number(input.damageRateUpPerTokenRate ?? 0),
    babiedSkillAttackUpRate: Number(input.babiedSkillAttackUpRate ?? 0),
    babiedOdGaugeGainUpRate: Number(input.babiedOdGaugeGainUpRate ?? 0),
    divaSkillAttackUpRate: Number(input.divaSkillAttackUpRate ?? 0),
    foodBuffAttackUpRate: Number(input.foodBuffAttackUpRate ?? 0),
    foodBuffHealDpByDamageRate: Number(input.foodBuffHealDpByDamageRate ?? 0),
    markAttackUpRate: Number(input.markAttackUpRate ?? 0),
    markDamageTakenDownRate: Number(input.markDamageTakenDownRate ?? 0),
    markDestructionRateGainBonusRate: Number(input.markDestructionRateGainBonusRate ?? 0), // 印Lv3: 破壊率上昇量+10%（WIP: 威力詳細未表示）
    transcendenceBurstAttackUpRate: Number(input.transcendenceBurstAttackUpRate ?? 0),
    transcendenceBurstDestructionRateGainBonusRate: Number(
      input.transcendenceBurstDestructionRateGainBonusRate ?? 0
    ),
    resonanceDestructionRateBonus: Number(input.resonanceDestructionRateBonus ?? 0),
    transcendenceBurstAttackBuffSkillEffectUpRate: Number(
      input.transcendenceBurstAttackBuffSkillEffectUpRate ?? 0
    ),
    transcendenceBurstDebuffSkillEffectUpRate: Number(
      input.transcendenceBurstDebuffSkillEffectUpRate ?? 0
    ),
    transcendenceBurstCriticalRateUpRate: Number(input.transcendenceBurstCriticalRateUpRate ?? 0),
    transcendenceBurstCriticalDamageUpRate: Number(input.transcendenceBurstCriticalDamageUpRate ?? 0),
    markCriticalRateUp: Number(input.markCriticalRateUp ?? 0),
    markCriticalDamageUp: Number(input.markCriticalDamageUp ?? 0),
    accessoryAttackUpRate: Number(input.accessoryAttackUpRate ?? 0),
    accessoryContributions: Array.isArray(input.accessoryContributions)
      ? structuredClone(input.accessoryContributions)
      : [],
    chainDestructionRateBonus: Number(input.chainDestructionRateBonus ?? 0),
    // ピアス装備（ヒット数解決済み ratio）: attack=対HPダメージ乗数 / break=対DPダメージ乗数
    attackPierceUpRate: Number(input.attackPierceUpRate ?? 0),
    breakPierceUpRate: Number(input.breakPierceUpRate ?? 0),
    // ブラストピアス（raw ratio・傾斜は destruction-calculator 側）
    blastPierceDestructionRateBonus: Number(input.blastPierceDestructionRateBonus ?? 0),
    overDrivePointUpByTokenPerToken: Number(input.overDrivePointUpByTokenPerToken ?? 0),
    overDrivePointUpByTokenTokenCount: Number(input.overDrivePointUpByTokenTokenCount ?? 0),
    overDrivePointUpByTokenTotalPercent: Number(input.overDrivePointUpByTokenTotalPercent ?? 0),
    zoneType: String(input.zoneType ?? ''),
    zonePowerRate: Number(input.zonePowerRate ?? 0),
    hasPenetrationCritical: input.hasPenetrationCritical === true,
    selectedMindEyeEffects: Array.isArray(input.selectedMindEyeEffects)
      ? structuredClone(input.selectedMindEyeEffects)
      : [],
    criticalRateBreakdown:
      input.criticalRateBreakdown && typeof input.criticalRateBreakdown === 'object'
        ? structuredClone(input.criticalRateBreakdown)
        : null,
    damageBreakdown:
      input.damageBreakdown && typeof input.damageBreakdown === 'object'
        ? structuredClone(input.damageBreakdown)
        : null,
    funnelEffects: Array.isArray(input.funnelEffects) ? structuredClone(input.funnelEffects) : [],
  };
}
