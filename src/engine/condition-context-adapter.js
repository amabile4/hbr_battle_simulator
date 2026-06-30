import {
  createEmptyContext,
  evaluateCondition,
  evaluateCountBcValue as evaluateCountBcContextValue,
} from './cond-evaluator.js';
import { getDpRate } from '../domain/dp-state.js';
import { isNormalAttackSkill } from '../domain/skill-classifiers.js';
import {
  isEnemyDead,
  isEnemyBroken,
  getEnemyDestructionRatePercent,
  getEnemyStatusRemainingTurns,
  isEnemyWeakToElement,
  hasEnemySpecialStatusByType,
  getConditionTargetEnemyIndex,
  getEnemyState,
  isHitWeakBySkillContext,
} from '../turn/turn-controller.js';

const DEFAULT_TURN_INDEX = 1;
const DEFAULT_DP_RATE = 1;
const DEFAULT_POSITION = 99;
const DEFAULT_TARGET_ENEMY_INDEX = -1;
const INACTIVE_FIELD_TYPE = 'None';
const ENEMY_STATUS_DOWN_TURN = 'DownTurn';
const ENEMY_SPECIAL_STATUS_TYPE_IDS = [3, 12, 22, 57, 172];

export function buildSpecialStatusesMap(member) {
  const map = new Map();
  for (const effect of member?.statusEffects ?? []) {
    const typeId = Number(effect?.metadata?.specialStatusTypeId ?? 0);
    if (!typeId) continue;

    const isActive =
      String(effect?.exitCond ?? '') === 'Eternal' ||
      Number(effect?.remaining ?? 0) > 0 ||
      (String(effect?.statusType ?? '') === 'BIYamawakiServant' && typeId === 155);
    if (isActive) {
      map.set(typeId, (map.get(typeId) ?? 0) + 1);
    }
  }
  // isExtraActive maps to special status type 20
  if (member?.isExtraActive) {
    map.set(20, 1);
  }
  return map;
}

function buildEnemySpecialStatusesMap(state, targetIndex) {
  const map = new Map();
  const turnState = state?.turnState;
  if (!turnState) return map;

  for (const typeId of ENEMY_SPECIAL_STATUS_TYPE_IDS) {
    if (hasEnemySpecialStatusByType(turnState, targetIndex, typeId)) {
      map.set(typeId, 1);
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
    dpRate: member?.dpState ? getDpRate(member.dpState) : DEFAULT_DP_RATE,
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
      typeof member?.hasSkillReference === 'function' ? Boolean(member.hasSkillReference(label)) : false,
    getSkillUseCountByLabel: (label) =>
      typeof member?.getSkillUseCountByLabel === 'function'
        ? Number(member.getSkillUseCountByLabel(label) ?? 0)
        : 0,
  };
}

function buildEnemyMember(state, targetIndex, member = null, skill = null, actionEntry = null) {
  const defaults = createEmptyContext().member;
  const turnState = state?.turnState;
  const isAlive = !isEnemyDead(turnState, targetIndex);
  const isBreak = isEnemyBroken(turnState, targetIndex);

  return {
    ...defaults,
    isPlayer: false,
    position: 99,
    isAlive,
    isBreak,
    specialStatuses: buildEnemySpecialStatusesMap(state, targetIndex),
    characterId: '',
    team: '',
    elements: [],
    weaponElement: '',
    role: '',
    isWeakToElement: (el) => {
      if (el) {
        return isEnemyWeakToElement(turnState, targetIndex, el);
      } else {
        return isHitWeakBySkillContext(state, member, skill, actionEntry).value;
      }
    },
    isTargetWeakNatureElement: (el) => false,
    damageRate: getEnemyDestructionRatePercent(turnState, targetIndex),
    breakDownTurn: isAlive
      ? getEnemyStatusRemainingTurns(turnState, targetIndex, ENEMY_STATUS_DOWN_TURN)
      : 0,
    isBroken: isBreak,
    isDead: !isAlive,
    isCharging: hasEnemySpecialStatusByType(turnState, targetIndex, 25),
  };
}

function buildTargetContext(state, targetEnemyIndex, member = null, skill = null, actionEntry = null) {
  const defaults = createEmptyContext().target;
  const turnState = state?.turnState;
  const hasTarget = Number.isFinite(targetEnemyIndex) && targetEnemyIndex >= 0;
  if (!hasTarget) {
    return defaults;
  }
  const isAlive = !isEnemyDead(turnState, targetEnemyIndex);
  const isBreak = isEnemyBroken(turnState, targetEnemyIndex);

  return {
    isWeakToElement: (el) => {
      if (el) {
        return isEnemyWeakToElement(turnState, targetEnemyIndex, el);
      } else {
        return isHitWeakBySkillContext(state, member, skill, actionEntry).value;
      }
    },
    isTargetWeakNatureElement: (el) => false,
    damageRate: getEnemyDestructionRatePercent(turnState, targetEnemyIndex),
    breakDownTurn: isAlive
      ? getEnemyStatusRemainingTurns(turnState, targetEnemyIndex, ENEMY_STATUS_DOWN_TURN)
      : 0,
    isBroken: isBreak,
    isDead: !isAlive,
    isCharging: hasEnemySpecialStatusByType(turnState, targetEnemyIndex, 25),
    debuffIconCount: 0,
  };
}

export function buildConditionContext(state, member, skill, actionEntry = null) {
  const turnState = state?.turnState;
  const targetEnemyIndex = getConditionTargetEnemyIndex(state, skill, actionEntry);

  const enemyCount = getEnemyState(turnState).enemyCount;
  const enemies = [];
  for (let i = 0; i < enemyCount; i++) {
    enemies.push(buildEnemyMember(state, i, member, skill, actionEntry));
  }

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
      isNormalAttack: isNormalAttackSkill(skill),
    },
    action: {
      breakHitCount: Number(actionEntry?.breakHitCount ?? 0),
      removeDebuffCount: Number(actionEntry?.removeDebuffCount ?? 0),
      targetEnemyIndex: Number.isFinite(targetEnemyIndex) ? targetEnemyIndex : DEFAULT_TARGET_ENEMY_INDEX,
    },
    target: buildTargetContext(state, targetEnemyIndex, member, skill, actionEntry),
    party: (state?.party ?? []).map(buildPlayerMember),
    enemies,
  };
}

export function evaluateConditionExpression(expression, state, member, skill, actionEntry = null) {
  const context = buildConditionContext(state, member, skill, actionEntry);
  const evalResult = evaluateCondition(expression, context);
  return {
    result: evalResult.result,
    knownCount: evalResult.knownCount,
    unknownCount: evalResult.unknownCount,
    ok: evalResult.ok,
    parseError: evalResult.parseError,
  };
}

export function evaluateCountBcValue(expression, state, member, skill = null, actionEntry = null) {
  const context = buildConditionContext(state, member, skill, actionEntry);
  return evaluateCountBcContextValue(expression, context);
}
