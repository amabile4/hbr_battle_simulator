import { previewTurn, activateOverdrive } from './turn-controller.js';
import {
  clampEnemyCount,
  DEFAULT_ENEMY_COUNT,
  getOdGaugeRequirement,
  OD_GAUGE_MAX_PERCENT,
  REINFORCED_MODE_OD_GAUGE_BONUS,
} from '../config/battle-defaults.js';
import { REPLAY_OPERATION_TYPES, replayOperationRegistry } from '../ui/lightweight-replay-script.js';

export const TEZUKA_CHARACTER_ID = 'STezuka';
export const MAKAI_KIHEI_STYLE_ID = 1003108;
export const MAKAI_KIHEI_PASSIVE_LABEL = 'Passive.Machina_Demon';
export const MAKAI_KIHEI_SKILL_LABEL = 'BIYamawakiSkill55b';
export const MAKAI_KIHEI_MAX_USES = 3;
export const MAKAI_KIHEI_DEFAULT_POSITION = 0;

const BEFORE_COMMIT_OPERATION_TYPES = new Set(
  Object.values(REPLAY_OPERATION_TYPES).filter((type) => replayOperationRegistry.get(type)?.timing === 'beforeCommit')
);

function cloneOperationPayload(value) {
  return value && typeof value === 'object' ? structuredClone(value) : {};
}

function getOperationWarningReporter(options = {}) {
  return typeof options.onWarning === 'function' ? options.onWarning : null;
}

function isOdContextActive(turnState = {}) {
  const turnType = String(turnState?.turnType ?? '');
  return (
    turnType === 'od' ||
    Boolean(turnState?.odSuspended) ||
    Boolean(turnState?.odPending)
  );
}

function isExtraContextActive(turnState = {}) {
  return (
    String(turnState?.turnType ?? '') === 'extra' ||
    turnState?.extraTurnState != null
  );
}

function assertPreemptiveOdContext(state) {
  if (isOdContextActive(state?.turnState) || isExtraContextActive(state?.turnState)) {
    throw new Error('Preemptive OD cannot be activated in current OD/EX context.');
  }
}

function withEnemyCount(state, enemyCount) {
  const normalizedEnemyCount = clampEnemyCount(
    enemyCount ?? state?.turnState?.enemyState?.enemyCount ?? DEFAULT_ENEMY_COUNT
  );
  if (Number(state?.turnState?.enemyState?.enemyCount) === normalizedEnemyCount) {
    return state;
  }
  return {
    ...state,
    turnState: {
      ...state.turnState,
      enemyState: {
        ...state.turnState?.enemyState,
        enemyCount: normalizedEnemyCount,
      },
    },
  };
}

function extractOperationLevel(operation = {}) {
  const level = Number(operation?.payload?.level ?? operation?.level);
  return Number.isFinite(level) && level >= 1 && level <= 3 ? level : null;
}

function createEmbeddedPreviewSkill(embeddedSkill = {}) {
  return {
    skillId: Number(embeddedSkill.id ?? embeddedSkill.skillId),
    label: String(embeddedSkill.label ?? MAKAI_KIHEI_SKILL_LABEL),
    name: String(embeddedSkill.name ?? '騎兵起動'),
    desc: String(embeddedSkill.desc ?? ''),
    targetType: String(embeddedSkill.target_type ?? embeddedSkill.targetType ?? 'All'),
    spCost: Number(embeddedSkill.sp_cost ?? embeddedSkill.spCost ?? 0),
    sourceType: 'system',
    isPassive: false,
    type: 'damage',
    consumeType: String(embeddedSkill.consume_type ?? embeddedSkill.consumeType ?? 'Sp'),
    hitCount: Number(embeddedSkill.hit_count ?? embeddedSkill.hitCount ?? 0),
    isRestricted: Number(embeddedSkill.is_restricted ?? embeddedSkill.isRestricted ?? 0) === 1,
    hits: Array.isArray(embeddedSkill.hits) ? structuredClone(embeddedSkill.hits) : [],
    maxLevel: embeddedSkill.max_level ?? embeddedSkill.maxLevel ?? null,
    cond: String(embeddedSkill.cond ?? ''),
    iucCond: String(embeddedSkill.iuc_cond ?? embeddedSkill.iucCond ?? ''),
    overwriteCond: String(embeddedSkill.overwrite_cond ?? embeddedSkill.overwriteCond ?? ''),
    effect: String(embeddedSkill.effect ?? ''),
    overwrite: embeddedSkill.overwrite ?? null,
    additionalTurnRule: null,
    parts: Array.isArray(embeddedSkill.parts) ? structuredClone(embeddedSkill.parts) : [],
    passive: null,
  };
}

function moveActorToFrontForOperationPreview(state, actor) {
  if (!state?.party || !actor || Number(actor.position) <= 2) {
    return;
  }
  const currentFront =
    state.party.find((member) => Number(member?.position) === MAKAI_KIHEI_DEFAULT_POSITION) ?? null;
  const originalPosition = Number(actor.position);
  actor.position = MAKAI_KIHEI_DEFAULT_POSITION;
  if (currentFront && currentFront !== actor) {
    currentFront.position = originalPosition;
  }
}

function applyKishinkaToState(state) {
  const clonedParty = state.party.map((member) => member.clone());
  const tezuka = clonedParty.find((member) => member.characterId === TEZUKA_CHARACTER_ID) ?? null;
  if (!tezuka) {
    return state;
  }
  tezuka.activateReinforcedMode(3);
  const nextOdGauge = Math.min(
    OD_GAUGE_MAX_PERCENT,
    Number(state.turnState?.odGauge ?? 0) + REINFORCED_MODE_OD_GAUGE_BONUS
  );
  return {
    ...state,
    party: clonedParty,
    turnState: {
      ...state.turnState,
      odGauge: Number(nextOdGauge.toFixed(2)),
    },
  };
}

function applyKishinkaOperation(state) {
  if (!canActivateKishinka(state)) {
    return state;
  }
  return applyKishinkaToState(state);
}

function applyMakaiKiheiToState(state) {
  const availability = resolveMakaiKiheiAvailability(state);
  if (!availability.availableInState || !availability.embeddedSkill) {
    return state;
  }

  const workingState = {
    ...state,
    party: state.party.map((member) => member.clone()),
    turnState: { ...state.turnState },
  };
  const workingActor =
    workingState.party.find((member) => Number(member?.styleId) === MAKAI_KIHEI_STYLE_ID) ?? null;
  if (!workingActor) {
    return state;
  }

  moveActorToFrontForOperationPreview(workingState, workingActor);
  const previewSkill = createEmbeddedPreviewSkill(availability.embeddedSkill);
  workingActor.skills = Object.freeze([...(workingActor.skills ?? []), previewSkill]);

  let previewRecord = null;
  try {
    previewRecord = previewTurn(
      workingState,
      { [workingActor.position]: { skillId: previewSkill.skillId } },
      null,
      clampEnemyCount(state?.turnState?.enemyState?.enemyCount ?? DEFAULT_ENEMY_COUNT)
    );
  } catch {
    return state;
  }

  const odGaugeAfter = Number(previewRecord?.projections?.odGaugeAtEnd ?? state?.turnState?.odGauge ?? 0);
  if (!Number.isFinite(odGaugeAfter)) {
    return state;
  }
  return {
    ...state,
    turnState: {
      ...state.turnState,
      odGauge: Number(odGaugeAfter.toFixed(2)),
    },
  };
}

function applyOperation(state, operation = {}, options = {}) {
  const type = String(operation?.type ?? '').trim();
  if (!type || !BEFORE_COMMIT_OPERATION_TYPES.has(type)) {
    return state;
  }
  if (type === REPLAY_OPERATION_TYPES.ACTIVATE_KISHINKA) {
    return applyKishinkaOperation(state);
  }
  if (type === REPLAY_OPERATION_TYPES.ACTIVATE_MAKAI_KIHEI) {
    return applyMakaiKiheiToState(state);
  }
  if (type === REPLAY_OPERATION_TYPES.ACTIVATE_PREEMPTIVE_OD) {
    const level = extractOperationLevel(operation);
    if (level != null) {
      assertPreemptiveOdContext(state);
      const currentGauge = Number(state?.turnState?.odGauge ?? 0);
      const requiredGauge = getOdGaugeRequirement(level);
      const allowInsufficientOd = Boolean(options.allowInsufficientOd);
      if (allowInsufficientOd && currentGauge < requiredGauge) {
        getOperationWarningReporter(options)?.(
          `insufficient OD allowed: OD${level} requires ${requiredGauge}% gauge. current=${currentGauge.toFixed(2)}%`
        );
      }
      return activateOverdrive(state, level, 'preemptive', {
        forceActivation: allowInsufficientOd && currentGauge < requiredGauge,
        forceConsumeGauge: allowInsufficientOd && currentGauge < requiredGauge,
      });
    }
  }
  return state;
}

export function canActivateKishinka(state) {
  const tezuka = state?.party?.find((member) => member.characterId === TEZUKA_CHARACTER_ID) ?? null;
  if (!tezuka) {
    return false;
  }
  return !tezuka.isReinforcedMode && !(Number(tezuka.actionDisabledTurns ?? 0) > 0);
}

export function resolveMakaiKiheiAvailability(state) {
  const actor = state?.party?.find((member) => Number(member?.styleId) === MAKAI_KIHEI_STYLE_ID) ?? null;
  const passive =
    actor?.passives?.find?.((entry) => String(entry?.label ?? '') === MAKAI_KIHEI_PASSIVE_LABEL) ?? null;
  const specialCommandPart =
    passive?.parts?.find?.((entry) => String(entry?.skill_type ?? '') === 'SpecialCommandCountUp') ?? null;
  const embeddedSkill =
    specialCommandPart?.strval?.find?.(
      (entry) => entry && typeof entry === 'object' && String(entry.label ?? '') === MAKAI_KIHEI_SKILL_LABEL
    ) ??
    specialCommandPart?.strval?.find?.((entry) => entry && typeof entry === 'object') ??
    null;

  return {
    hasYamawaki: Boolean(actor),
    actor,
    passive: passive ? { ...passive, parts: Array.isArray(passive.parts) ? cloneOperationPayload(passive.parts) : [] } : null,
    embeddedSkill: embeddedSkill && typeof embeddedSkill === 'object' ? structuredClone(embeddedSkill) : null,
    availableInState: Boolean(actor && embeddedSkill && typeof embeddedSkill === 'object'),
  };
}

export function getActivatablePreemptiveOdLevels(state) {
  const gauge = Number(state?.turnState?.odGauge ?? 0);
  const turnType = String(state?.turnState?.turnType ?? '');
  const isOdTurn = turnType === 'od';
  const isExtraTurn = turnType === 'extra';
  const inOdContext = isOdTurn || Boolean(state?.turnState?.odSuspended) || Boolean(state?.turnState?.odPending);
  const inExtraContext = isExtraTurn || state?.turnState?.extraTurnState != null;
  if (inOdContext || inExtraContext) {
    return [];
  }
  return [1, 2, 3].filter((level) => gauge >= getOdGaugeRequirement(level));
}

export function applyBeforeCommitOperations(state, operations = [], options = {}) {
  const sourceOperations = Array.isArray(operations) ? operations : [];
  const normalizedState = withEnemyCount(state, options.enemyCount);
  const regularBeforeCommitOperations = [];
  const preemptiveOdOperations = [];
  const onWarning = getOperationWarningReporter(options);

  for (const rawOperation of sourceOperations) {
    const operation =
      rawOperation && typeof rawOperation === 'object'
        ? { type: String(rawOperation.type ?? '').trim(), payload: cloneOperationPayload(rawOperation.payload) }
        : null;
    if (!operation?.type) {
      continue;
    }
    const definition = replayOperationRegistry.get(operation.type);
    if (!definition) {
      onWarning?.(`unknown operation ignored: ${operation.type}`);
      continue;
    }
    if (!BEFORE_COMMIT_OPERATION_TYPES.has(operation.type)) {
      continue;
    }
    if (operation.type === REPLAY_OPERATION_TYPES.ACTIVATE_PREEMPTIVE_OD) {
      preemptiveOdOperations.push(operation);
      continue;
    }
    regularBeforeCommitOperations.push(operation);
  }

  let nextState = normalizedState;
  for (const operation of regularBeforeCommitOperations) {
    nextState = applyOperation(nextState, operation, options);
  }
  for (const operation of preemptiveOdOperations) {
    nextState = applyOperation(nextState, operation, options);
  }
  return nextState;
}
