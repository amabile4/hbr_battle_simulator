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

export function buildAutomaticFollowUpChipModelsFromActions({
  actions = [],
  members = [],
  store,
  enemyNamesByEnemy = {},
} = {}) {
  const membersByPosition = new Map(
    (Array.isArray(members) ? members : []).map((member) => [Number(member?.position), member])
  );
  return (Array.isArray(actions) ? actions : [])
    .map((action, index) => {
      if (String(action?.pursuitTriggerSource ?? '') !== 'auto') {
        return null;
      }
      if (Math.max(0, Number(action?.pursuedHitCount ?? 0)) <= 0) {
        return null;
      }
      const position = Number(action?.pursuitSourcePosition);
      const member = membersByPosition.get(position);
      if (!member) {
        return null;
      }
      const enemyIndex = Number(action?.pursuedTargetEnemyIndex ?? action?.targetEnemyIndex ?? 0);
      const actorLabel = resolveManualBreakActorLabel(member, store);
      const enemyLabel = resolveEnemyLabel(enemyIndex, enemyNamesByEnemy);
      const skillName = String(action?.pursuitSourceSkillName ?? '').trim() || '追撃';
      const actionKey = String(action?.actionInstanceId ?? '') || `${action?.characterId ?? 'action'}:${index}`;
      return {
        key: `auto:${actionKey}:${position}:${enemyIndex}`,
        position,
        enemyIndex,
        actorLabel,
        enemyLabel,
        skillName,
        label: `${actorLabel}→${enemyLabel} 自動追撃 ${skillName}`,
      };
    })
    .filter(Boolean);
}
