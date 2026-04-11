import {
  activateOverdrive,
  applyEnemyStateOverrideSnapshot,
  buildEnemyStateOverrideSnapshot,
  isEnemyAlive,
} from './turn-controller.js';
import {
  ENEMY_OD_RATE_UNIT,
  clampEnemyCount,
  DEFAULT_ENEMY_COUNT,
  DEFAULT_DESTRUCTION_RATE_CAP_PERCENT,
  DEFAULT_DESTRUCTION_RATE_PERCENT,
  DEFAULT_ENEMY_RESISTANCE_RATE_PERCENT,
  MAX_ENEMY_COUNT,
  getOdGaugeRequirement,
  OD_GAUGE_MIN_PERCENT,
  OD_GAUGE_PER_HIT_PERCENT,
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
const SUMMONABLE_ENEMY_RESISTANCE_KEYS = Object.freeze({
  slash: 'Slash',
  stab: 'Stab',
  strike: 'Strike',
  fire: 'Fire',
  ice: 'Ice',
  thunder: 'Thunder',
  light: 'Light',
  dark: 'Dark',
  nonelement: 'Nonelement',
});
const SUMMON_ENEMY_NO_SLOT_WARNING = 'summon enemy ignored: no available enemy slot.';

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

function withExpandedEnemyCount(state, enemyCount) {
  const currentEnemyCount = clampEnemyCount(
    state?.turnState?.enemyState?.enemyCount ?? DEFAULT_ENEMY_COUNT
  );
  if (enemyCount == null) {
    return withEnemyCount(state, currentEnemyCount);
  }
  return withEnemyCount(state, Math.max(currentEnemyCount, clampEnemyCount(enemyCount)));
}

function extractOperationLevel(operation = {}) {
  const level = Number(operation?.payload?.level ?? operation?.level);
  return Number.isFinite(level) && level >= 1 && level <= 3 ? level : null;
}

function truncateToTwoDecimals(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return 0;
  }
  if (numeric >= 0) {
    return Math.floor((numeric + 1e-9) * 100) / 100;
  }
  return Math.ceil((numeric - 1e-9) * 100) / 100;
}

function clampOdGauge(value) {
  return Math.max(OD_GAUGE_MIN_PERCENT, Math.min(OD_GAUGE_MAX_PERCENT, value));
}

function resolveEnemyOdRateMultiplier(turnState, targetEnemyIndex) {
  const rawRate = Number(turnState?.enemyState?.odRateByEnemy?.[String(Number(targetEnemyIndex))] ?? 0);
  if (!Number.isFinite(rawRate) || rawRate === 0) {
    return 1;
  }
  if (Math.abs(rawRate) <= 10) {
    return rawRate;
  }
  return rawRate / ENEMY_OD_RATE_UNIT;
}

function resolveMakaiKiheiHitCount(embeddedSkill = {}) {
  const explicitHitCount = Number(embeddedSkill.hit_count ?? embeddedSkill.hitCount);
  if (Number.isFinite(explicitHitCount) && explicitHitCount > 0) {
    return explicitHitCount;
  }
  const hitsLength = Array.isArray(embeddedSkill.hits) ? embeddedSkill.hits.length : 0;
  return Math.max(1, hitsLength);
}

function computeMakaiKiheiOdGain(state, embeddedSkill, enemyCountOverride = null) {
  const enemyCount = clampEnemyCount(
    enemyCountOverride ?? state?.turnState?.enemyState?.enemyCount ?? DEFAULT_ENEMY_COUNT
  );
  const hitCount = resolveMakaiKiheiHitCount(embeddedSkill);
  let total = 0;

  for (let targetEnemyIndex = 0; targetEnemyIndex < enemyCount; targetEnemyIndex += 1) {
    if (!isEnemyAlive(state?.turnState, targetEnemyIndex, enemyCount)) {
      continue;
    }
    const perHitGain = truncateToTwoDecimals(
      OD_GAUGE_PER_HIT_PERCENT * resolveEnemyOdRateMultiplier(state?.turnState, targetEnemyIndex)
    );
    total = truncateToTwoDecimals(total + truncateToTwoDecimals(perHitGain * hitCount));
  }

  return total;
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
  const currentOdGauge = truncateToTwoDecimals(Number(state?.turnState?.odGauge ?? 0));
  const odGain = computeMakaiKiheiOdGain(state, availability.embeddedSkill);
  const odGaugeAfter = truncateToTwoDecimals(clampOdGauge(currentOdGauge + odGain));
  return {
    ...state,
    turnState: {
      ...state.turnState,
      odGauge: odGaugeAfter,
    },
  };
}

function normalizeSummonEnemyCount(value, fallback = DEFAULT_ENEMY_COUNT) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return clampEnemyCount(fallback);
  }
  return clampEnemyCount(numeric);
}

function normalizeSummonEnemyRates(payload = {}) {
  const elementRates = payload?.resistances?.element ?? payload?.element ?? {};
  return Object.fromEntries(
    Object.entries(SUMMONABLE_ENEMY_RESISTANCE_KEYS).map(([uiKey, engineKey]) => {
      const numericRate = Number(elementRates?.[uiKey]);
      return [
        engineKey,
        Number.isFinite(numericRate) ? numericRate : DEFAULT_ENEMY_RESISTANCE_RATE_PERCENT,
      ];
    })
  );
}

function normalizeSummonEnemyAbsorbElements(payload = {}) {
  const list = Array.isArray(payload?.absorbElementList)
    ? payload.absorbElementList
    : Array.isArray(payload?.resistances?.element?.absorb_element_list)
      ? payload.resistances.element.absorb_element_list
      : [];
  return [...new Set(list.map((value) => String(value ?? '').trim().toLowerCase()).filter(Boolean))];
}

function normalizeSummonEnemyPayload(payload = {}) {
  if (!payload || typeof payload !== 'object') {
    return null;
  }
  const enemyName = String(
    payload.enemyName ??
    payload.name ??
    payload.selectedEnemyName ??
    ''
  ).trim();
  const enemyId = Number(payload.enemyId ?? payload.id ?? payload.selectedEnemyId ?? NaN);
  const odRate = Number(payload.od_rate ?? payload.odRate ?? 0);
  const maxDestructionRate = Number(payload.max_d_rate ?? payload.maxDRate ?? DEFAULT_DESTRUCTION_RATE_CAP_PERCENT);
  const targetEnemyIndex = Number(payload.targetEnemyIndex ?? payload.target_enemy_index ?? NaN);
  return {
    enemyId: Number.isFinite(enemyId) ? enemyId : null,
    enemyName,
    odRate: Number.isFinite(odRate) ? odRate : 0,
    maxDestructionRate: Number.isFinite(maxDestructionRate)
      ? maxDestructionRate
      : DEFAULT_DESTRUCTION_RATE_CAP_PERCENT,
    damageRates: normalizeSummonEnemyRates(payload),
    absorbElements: normalizeSummonEnemyAbsorbElements(payload),
    targetEnemyIndex: Number.isInteger(targetEnemyIndex) ? targetEnemyIndex : null,
  };
}

function resolveRequestedSummonEnemySlotIndex(turnState, requestedEnemyIndex) {
  const currentEnemyCount = normalizeSummonEnemyCount(
    turnState?.enemyState?.enemyCount,
    DEFAULT_ENEMY_COUNT
  );
  const normalizedRequestedEnemyIndex = Number(requestedEnemyIndex);
  if (
    !Number.isInteger(normalizedRequestedEnemyIndex) ||
    normalizedRequestedEnemyIndex < 0 ||
    normalizedRequestedEnemyIndex >= MAX_ENEMY_COUNT
  ) {
    return null;
  }
  if (normalizedRequestedEnemyIndex < currentEnemyCount) {
    return isEnemyAlive(turnState, normalizedRequestedEnemyIndex, currentEnemyCount)
      ? null
      : normalizedRequestedEnemyIndex;
  }
  return normalizedRequestedEnemyIndex === currentEnemyCount ? normalizedRequestedEnemyIndex : null;
}

function resolveSummonEnemySlotIndex(turnState, requestedEnemyIndex = null) {
  const requestedSlotIndex = resolveRequestedSummonEnemySlotIndex(turnState, requestedEnemyIndex);
  if (requestedSlotIndex !== null) {
    return requestedSlotIndex;
  }
  const currentEnemyCount = normalizeSummonEnemyCount(
    turnState?.enemyState?.enemyCount,
    DEFAULT_ENEMY_COUNT
  );
  if (currentEnemyCount < MAX_ENEMY_COUNT) {
    return currentEnemyCount;
  }
  for (let enemyIndex = 0; enemyIndex < currentEnemyCount; enemyIndex += 1) {
    if (!isEnemyAlive(turnState, enemyIndex, currentEnemyCount)) {
      return enemyIndex;
    }
  }
  return null;
}

function applySummonEnemyToState(state, operation = {}, options = {}) {
  if (!state?.turnState) {
    return state;
  }
  const onWarning = getOperationWarningReporter(options);
  const summonEnemy = normalizeSummonEnemyPayload(operation?.payload);
  if (!summonEnemy) {
    return state;
  }
  const targetEnemyIndex = resolveSummonEnemySlotIndex(
    state.turnState,
    summonEnemy.targetEnemyIndex
  );
  if (!Number.isInteger(targetEnemyIndex) || targetEnemyIndex < 0) {
    onWarning?.(SUMMON_ENEMY_NO_SLOT_WARNING);
    return state;
  }

  const currentSnapshot = buildEnemyStateOverrideSnapshot(state.turnState);
  const slotKey = String(targetEnemyIndex);
  const nextEnemyCount = Math.max(
    normalizeSummonEnemyCount(currentSnapshot.enemyCount, DEFAULT_ENEMY_COUNT),
    normalizeSummonEnemyCount(targetEnemyIndex + 1, DEFAULT_ENEMY_COUNT)
  );

  const nextSnapshot = {
    ...currentSnapshot,
    enemyCount: nextEnemyCount,
    enemyNames: {
      ...(currentSnapshot.enemyNames ?? {}),
      [slotKey]: summonEnemy.enemyName,
    },
    enemyDamageRates: {
      ...(currentSnapshot.enemyDamageRates ?? {}),
      [slotKey]: summonEnemy.damageRates,
    },
    enemyDestructionRates: {
      ...(currentSnapshot.enemyDestructionRates ?? {}),
      [slotKey]: DEFAULT_DESTRUCTION_RATE_PERCENT,
    },
    enemyDestructionRateCaps: {
      ...(currentSnapshot.enemyDestructionRateCaps ?? {}),
      [slotKey]: summonEnemy.maxDestructionRate,
    },
    enemyOdRates: {
      ...(currentSnapshot.enemyOdRates ?? {}),
      [slotKey]: summonEnemy.odRate,
    },
    enemyAbsorbElements: {
      ...(currentSnapshot.enemyAbsorbElements ?? {}),
      [slotKey]: summonEnemy.absorbElements,
    },
    enemyBreakStates: Object.fromEntries(
      Object.entries(currentSnapshot.enemyBreakStates ?? {}).filter(([enemyIndex]) => String(enemyIndex) !== slotKey)
    ),
    enemyStatuses: (Array.isArray(currentSnapshot.enemyStatuses) ? currentSnapshot.enemyStatuses : []).filter(
      // Reusing a dead slot must clear every status that belonged to the previous enemy.
      (status) => Number(status?.targetIndex ?? -1) !== targetEnemyIndex
    ),
  };
  applyEnemyStateOverrideSnapshot(state.turnState, nextSnapshot);
  return state;
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
  if (type === REPLAY_OPERATION_TYPES.SUMMON_ENEMY) {
    return applySummonEnemyToState(state, operation, options);
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
  const onWarning = getOperationWarningReporter(options);

  const summonOperations = [];
  const regularBeforeCommitOperations = [];
  const preemptiveOdOperations = [];

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
    if (operation.type === REPLAY_OPERATION_TYPES.SUMMON_ENEMY) {
      summonOperations.push(operation);
      continue;
    }
    if (operation.type === REPLAY_OPERATION_TYPES.ACTIVATE_PREEMPTIVE_OD) {
      preemptiveOdOperations.push(operation);
      continue;
    }
    regularBeforeCommitOperations.push(operation);
  }

  // Summon mutates occupied slot count itself. Preserve that expanded count
  // when the caller still passes a stale pre-summon enemyCount.
  let nextState = state;
  for (const operation of summonOperations) {
    nextState = applyOperation(nextState, operation, options);
  }
  nextState = summonOperations.length > 0
    ? withExpandedEnemyCount(nextState, options.enemyCount)
    : withEnemyCount(nextState, options.enemyCount);
  for (const operation of regularBeforeCommitOperations) {
    nextState = applyOperation(nextState, operation, options);
  }
  for (const operation of preemptiveOdOperations) {
    nextState = applyOperation(nextState, operation, options);
  }
  return nextState;
}
