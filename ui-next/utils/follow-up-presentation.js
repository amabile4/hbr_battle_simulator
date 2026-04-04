import { normalizeFollowUpOverrides } from './follow-up-overrides.js';
import { resolveManualBreakActorLabel } from './manual-break-presentation.js';

function resolveEnemyLabel(enemyIndex, enemyNamesByEnemy = {}) {
  const numericEnemyIndex = Number(enemyIndex);
  if (!Number.isInteger(numericEnemyIndex) || numericEnemyIndex < 0) {
    return '';
  }
  const enemyName = String(
    enemyNamesByEnemy[String(numericEnemyIndex)] ?? enemyNamesByEnemy[numericEnemyIndex] ?? ''
  ).trim();
  return enemyName ? `E${numericEnemyIndex + 1} ${enemyName}` : `E${numericEnemyIndex + 1}`;
}

export function buildFollowUpChipModels({
  overrides = [],
  members = [],
  store,
  enemyNamesByEnemy = {},
  resolvedSkillNameByPosition = {},
} = {}) {
  const membersByPosition = new Map(
    (Array.isArray(members) ? members : []).map((member) => [Number(member?.position), member])
  );

  return normalizeFollowUpOverrides(overrides)
    .map((override) => {
      const member = membersByPosition.get(Number(override.position));
      if (!member) {
        return null;
      }
      const actorLabel = resolveManualBreakActorLabel(member, store);
      const enemyLabel = resolveEnemyLabel(override.enemyIndex, enemyNamesByEnemy);
      const skillName = String(
        resolvedSkillNameByPosition?.[String(override.position)] ??
          resolvedSkillNameByPosition?.[override.position] ??
          '追撃'
      ).trim() || '追撃';
      return {
        key: `${override.position}:${override.enemyIndex}`,
        position: Number(override.position),
        enemyIndex: Number(override.enemyIndex),
        actorLabel,
        enemyLabel,
        skillName,
        label: `${actorLabel}→${enemyLabel} ${skillName}`,
      };
    })
    .filter(Boolean);
}
