import { createEmptyContext, evaluateCondition } from './cond-evaluator.js';

const DEFAULT_TURN_INDEX = 1;
const DEFAULT_DP_RATE = 1;
const DEFAULT_POSITION = 99;
const DEFAULT_TARGET_ENEMY_INDEX = -1;
const INACTIVE_FIELD_TYPE = 'None';

export function buildSpecialStatusesMap(member) {
  const map = new Map();
  for (const effect of member?.statusEffects ?? []) {
    const typeId = Number(effect?.metadata?.specialStatusTypeId ?? 0);
    if (!typeId) continue;

    const isActive =
      String(effect?.exitCond ?? '') === 'Eternal' ||
      Number(effect?.remaining ?? 0) > 0;
    if (isActive) {
      map.set(typeId, (map.get(typeId) ?? 0) + 1);
    }
  }
  return map;
}

function getActiveFieldType(fieldState) {
  if (!fieldState || typeof fieldState !== 'object') {
    return INACTIVE_FIELD_TYPE;
  }
  const type = String(fieldState.type ?? '').trim();
  if (!type) {
    return INACTIVE_FIELD_TYPE;
  }
  const rawRemaining = fieldState.remainingTurns;
  const remainingTurns =
    rawRemaining === null || rawRemaining === undefined
      ? null
      : Number.isFinite(Number(rawRemaining))
        ? Number(rawRemaining)
        : null;
  return remainingTurns === null || remainingTurns > 0 ? type : INACTIVE_FIELD_TYPE;
}

function isOverDriveActive(turnState) {
  const turnType = String(turnState?.turnType ?? '');
  return turnType === 'od' || (turnType === 'extra' && Boolean(turnState?.odSuspended));
}

function buildPlayerMember(member) {
  const defaults = createEmptyContext().member;
  return {
    ...defaults,
    sp: { current: Number(member?.sp?.current ?? 0) },
    ep: { current: Number(member?.ep?.current ?? 0) },
    dpRate: Number(member?.dpRate ?? DEFAULT_DP_RATE),
    token: { current: Number(member?.token?.current ?? member?.tokenState?.current ?? 0) },
    morale: { current: Number(member?.morale?.current ?? member?.moraleState?.current ?? 0) },
    motivation: { current: Number(member?.motivation?.current ?? member?.motivationState?.current ?? 0) },
    markStates: member?.markStates ?? {},
    position: Number(member?.position ?? DEFAULT_POSITION),
    isAlive: member?.isAlive !== false,
    isBreak: Boolean(member?.isBreak),
    isShredding: Boolean(member?.isShredding),
    isReinforcedMode: Boolean(member?.isReinforcedMode),
    isPlayer: true,
    specialStatuses: buildSpecialStatusesMap(member),
    characterId: String(member?.characterId ?? ''),
    team: String(member?.team ?? ''),
    elements: Array.isArray(member?.elements) ? member.elements : [],
    weaponElement: String(member?.weaponElement ?? ''),
    role: String(member?.role ?? ''),
    isAttackNormal: Boolean(member?.isAttackNormal),
    isApplyLearning: Boolean(member?.isApplyLearning),
    debuffIconCount: Number(member?.debuffIconCount ?? 0),
    hasSkill: (label) =>
      typeof member?.hasSkill === 'function' ? Boolean(member.hasSkill(label)) : false,
    getSkillUseCountByLabel: (label) =>
      typeof member?.getSkillUseCountByLabel === 'function'
        ? Number(member.getSkillUseCountByLabel(label) ?? 0)
        : 0,
  };
}

export function buildConditionContext(state, member, skill, actionEntry = null) {
  const defaults = createEmptyContext();
  const turnState = state?.turnState;

  return {
    state: {
      turnIndex: Number(turnState?.turnIndex ?? DEFAULT_TURN_INDEX),
      odGauge: Number(turnState?.odGauge ?? 0),
      zone: getActiveFieldType(turnState?.zoneState),
      territory: getActiveFieldType(turnState?.territoryState),
      talismanActive: Boolean(turnState?.enemyState?.talismanState?.active),
      isOverDrive: isOverDriveActive(turnState),
    },
    member: buildPlayerMember(member),
    skill: {
      label: String(skill?.label ?? ''),
      tier: String(skill?.tier ?? skill?.ct ?? ''),
      spCost: Number(skill?.spCost ?? 0),
      element: skill?.element ?? '',
      isNormalAttack: Boolean(skill?.isNormalAttack),
    },
    action: {
      breakHitCount: Number(actionEntry?.breakHitCount ?? 0),
      removeDebuffCount: Number(actionEntry?.removeDebuffCount ?? 0),
      targetEnemyIndex: Number(actionEntry?.targetEnemyIndex ?? DEFAULT_TARGET_ENEMY_INDEX),
    },
    target: defaults.target,
    party: (state?.party ?? []).map(buildPlayerMember),
    enemies: [],
  };
}

export function evaluateConditionExpression(expression, state, member, skill, actionEntry = null) {
  const context = buildConditionContext(state, member, skill, actionEntry);
  return evaluateCondition(expression, context).result;
}
