export function buildDamageCalculationContext(input = {}) {
  return {
    actorCharacterId: String(input.actorCharacterId ?? ''),
    actorStyleId: Number(input.actorStyleId ?? 0),
    skillId: Number(input.skillId ?? 0),
    skillLabel: String(input.skillLabel ?? ''),
    skillName: String(input.skillName ?? ''),
    targetType: String(input.targetType ?? ''),
    enemyCount: Number(input.enemyCount ?? 1),
    baseHitCount: Number(input.baseHitCount ?? 0),
    funnelHitBonus: Number(input.funnelHitBonus ?? 0),
    effectiveHitCountPerEnemy: Number(input.effectiveHitCountPerEnemy ?? 0),
    effectiveHitCountTotal: Number(input.effectiveHitCountTotal ?? 0),
    funnelEffects: Array.isArray(input.funnelEffects) ? structuredClone(input.funnelEffects) : [],
  };
}

