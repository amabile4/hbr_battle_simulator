export function buildDamageCalculationContext(input = {}) {
  return {
    actorCharacterId: String(input.actorCharacterId ?? ''),
    actorStyleId: Number(input.actorStyleId ?? 0),
    skillId: Number(input.skillId ?? 0),
    skillLabel: String(input.skillLabel ?? ''),
    skillName: String(input.skillName ?? ''),
    targetType: String(input.targetType ?? ''),
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
    tokenAttackTokenCount: Number(input.tokenAttackTokenCount ?? 0),
    tokenAttackRatePerToken: Number(input.tokenAttackRatePerToken ?? 0),
    tokenAttackTotalRate: Number(input.tokenAttackTotalRate ?? 0),
    damageRateUpPerTokenRate: Number(input.damageRateUpPerTokenRate ?? 0),
    overDrivePointUpByTokenPerToken: Number(input.overDrivePointUpByTokenPerToken ?? 0),
    overDrivePointUpByTokenTokenCount: Number(input.overDrivePointUpByTokenTokenCount ?? 0),
    overDrivePointUpByTokenTotalPercent: Number(input.overDrivePointUpByTokenTotalPercent ?? 0),
    zoneType: String(input.zoneType ?? ''),
    zonePowerRate: Number(input.zonePowerRate ?? 0),
    funnelEffects: Array.isArray(input.funnelEffects) ? structuredClone(input.funnelEffects) : [],
  };
}
