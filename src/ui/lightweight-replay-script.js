import { MAX_PARTY_SIZE } from '../domain/party.js';

export const LIGHTWEIGHT_REPLAY_SCRIPT_VERSION = 1;

export const REPLAY_TARGET_TYPES = Object.freeze({
  ALLY: 'ally',
  ENEMY: 'enemy',
  NONE: 'none',
});

export const REPLAY_OPERATION_TYPES = Object.freeze({
  ACTIVATE_KISHINKA: 'ActivateKishinka',
  ACTIVATE_PREEMPTIVE_OD: 'ActivatePreemptiveOd',
  RESERVE_INTERRUPT_OD: 'ReserveInterruptOd',
});

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function clonePlainObject(value) {
  return isPlainObject(value) ? structuredClone(value) : {};
}

function normalizeOptionalNumber(value) {
  if (value === null || value === undefined || value === '') {
    return null;
  }
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function normalizeNumericArray(values = []) {
  const source = Array.isArray(values) ? values : [];
  return Array.from({ length: MAX_PARTY_SIZE }, (_, index) => {
    return normalizeOptionalNumber(source[index]);
  });
}

function normalizeTypedEnvelopeEntry(entry) {
  if (!isPlainObject(entry)) {
    return null;
  }
  const type = String(entry.type ?? '').trim();
  if (!type) {
    return null;
  }
  const normalized = { type };
  if ('payload' in entry) {
    normalized.payload = structuredClone(entry.payload);
    return normalized;
  }
  const payload = Object.fromEntries(
    Object.entries(entry)
      .filter(([key]) => key !== 'type')
      .map(([key, value]) => [key, structuredClone(value)])
  );
  if (Object.keys(payload).length > 0) {
    normalized.payload = payload;
  }
  return normalized;
}

function normalizeTypedEnvelopeEntries(entries = []) {
  return (Array.isArray(entries) ? entries : []).map((entry) => normalizeTypedEnvelopeEntry(entry)).filter(Boolean);
}

function createTypedEnvelopeRegistry(definitions = {}) {
  const normalizedDefinitions = Object.freeze(
    Object.fromEntries(
      Object.entries(definitions).map(([type, definition]) => [String(type), Object.freeze({ ...definition })])
    )
  );
  return Object.freeze({
    has(type) {
      return Object.hasOwn(normalizedDefinitions, String(type ?? ''));
    },
    get(type) {
      return normalizedDefinitions[String(type ?? '')] ?? null;
    },
    listTypes() {
      return Object.keys(normalizedDefinitions);
    },
    normalizeEntries(entries = []) {
      return normalizeTypedEnvelopeEntries(entries);
    },
  });
}

export const replaySetupEntryRegistry = createTypedEnvelopeRegistry();
export const replayOperationRegistry = createTypedEnvelopeRegistry({
  [REPLAY_OPERATION_TYPES.ACTIVATE_KISHINKA]: Object.freeze({ timing: 'beforeCommit' }),
  [REPLAY_OPERATION_TYPES.ACTIVATE_PREEMPTIVE_OD]: Object.freeze({ timing: 'beforeCommit' }),
  [REPLAY_OPERATION_TYPES.RESERVE_INTERRUPT_OD]: Object.freeze({ timing: 'afterCommitReservation' }),
});
export const replayOverrideEntryRegistry = createTypedEnvelopeRegistry();

export function normalizeReplayTarget(target) {
  if (target === null || target === undefined || target === '') {
    return null;
  }
  if (!isPlainObject(target)) {
    return null;
  }

  const explicitType = String(target.type ?? '').trim();
  if (explicitType === REPLAY_TARGET_TYPES.ENEMY) {
    const enemyIndex = Number(target.enemyIndex ?? target.targetEnemyIndex);
    if (!Number.isFinite(enemyIndex)) {
      return null;
    }
    return {
      type: REPLAY_TARGET_TYPES.ENEMY,
      enemyIndex: Math.max(0, Math.trunc(enemyIndex)),
    };
  }
  if (explicitType === REPLAY_TARGET_TYPES.ALLY) {
    const styleId = Number(target.styleId ?? target.targetStyleId);
    if (Number.isFinite(styleId)) {
      return {
        type: REPLAY_TARGET_TYPES.ALLY,
        styleId,
      };
    }
    const characterId = String(target.characterId ?? target.targetCharacterId ?? '').trim();
    return characterId ? { type: REPLAY_TARGET_TYPES.ALLY, characterId } : null;
  }
  if (explicitType === REPLAY_TARGET_TYPES.NONE) {
    return { type: REPLAY_TARGET_TYPES.NONE };
  }
  if (explicitType) {
    return structuredClone(target);
  }

  const enemyIndex = Number(target.enemyIndex ?? target.targetEnemyIndex);
  if (Number.isFinite(enemyIndex)) {
    return {
      type: REPLAY_TARGET_TYPES.ENEMY,
      enemyIndex: Math.max(0, Math.trunc(enemyIndex)),
    };
  }

  const styleId = Number(target.styleId ?? target.targetStyleId);
  if (Number.isFinite(styleId)) {
    return {
      type: REPLAY_TARGET_TYPES.ALLY,
      styleId,
    };
  }

  const characterId = String(target.characterId ?? target.targetCharacterId ?? '').trim();
  if (characterId) {
    return {
      type: REPLAY_TARGET_TYPES.ALLY,
      characterId,
    };
  }

  return null;
}

export function normalizeReplayTurnSlot(slot = {}) {
  const source = isPlainObject(slot) ? slot : {};
  const styleId = normalizeOptionalNumber(source.styleId);
  const skillId = normalizeOptionalNumber(source.skillId);
  const normalized = {
    styleId,
    skillId,
  };
  if ('target' in source || normalized.skillId !== null) {
    normalized.target = normalizeReplayTarget(source.target ?? { type: REPLAY_TARGET_TYPES.NONE });
  }
  return normalized;
}

function normalizeReplayTurnSlots(slots = []) {
  const source = Array.isArray(slots) ? slots : [];
  return Array.from({ length: MAX_PARTY_SIZE }, (_, index) => normalizeReplayTurnSlot(source[index]));
}

export function normalizeLightweightReplayTurn(turn = {}) {
  const source = isPlainObject(turn) ? turn : {};
  const turnNumber = Number(source.turn);
  return {
    turn: Number.isFinite(turnNumber) ? turnNumber : null,
    slots: normalizeReplayTurnSlots(source.slots),
    operations: replayOperationRegistry.normalizeEntries(source.operations),
    note: typeof source.note === 'string' ? source.note : '',
    overrideEntries: replayOverrideEntryRegistry.normalizeEntries(source.overrideEntries),
  };
}

export function normalizeLightweightReplaySetup(setup = {}) {
  const source = isPlainObject(setup) ? setup : {};
  return {
    styleIds: normalizeNumericArray(source.styleIds),
    supportStyleIdsByPartyIndex: clonePlainObject(source.supportStyleIdsByPartyIndex),
    supportLimitBreakLevelsByPartyIndex: clonePlainObject(source.supportLimitBreakLevelsByPartyIndex),
    skillSetsByPartyIndex: clonePlainObject(source.skillSetsByPartyIndex),
    limitBreakLevelsByPartyIndex: clonePlainObject(source.limitBreakLevelsByPartyIndex),
    initialOdGauge: Number.isFinite(Number(source.initialOdGauge)) ? Number(source.initialOdGauge) : 0,
    initialDpStateByPartyIndex: clonePlainObject(source.initialDpStateByPartyIndex),
    initialBreakByPartyIndex: clonePlainObject(source.initialBreakByPartyIndex),
    initialMotivationByPartyIndex: clonePlainObject(source.initialMotivationByPartyIndex),
    setupEntries: replaySetupEntryRegistry.normalizeEntries(source.setupEntries),
  };
}

export function normalizeLightweightReplayScript(script = {}) {
  const source = isPlainObject(script) ? script : {};
  const version = Number(source.version);
  return {
    version: Number.isFinite(version) ? version : LIGHTWEIGHT_REPLAY_SCRIPT_VERSION,
    setup: normalizeLightweightReplaySetup(source.setup),
    turns: (Array.isArray(source.turns) ? source.turns : []).map((turn) => normalizeLightweightReplayTurn(turn)),
  };
}

export function createEmptyLightweightReplayScript(setup = {}) {
  return normalizeLightweightReplayScript({
    version: LIGHTWEIGHT_REPLAY_SCRIPT_VERSION,
    setup,
    turns: [],
  });
}

export function createLightweightReplaySetupFromBaseSetup(baseSetup = {}, existingSetup = {}) {
  const base = isPlainObject(baseSetup) ? baseSetup : {};
  const existing = isPlainObject(existingSetup) ? existingSetup : {};
  return normalizeLightweightReplaySetup({
    styleIds: base.styleIds ?? existing.styleIds,
    supportStyleIdsByPartyIndex: base.supportStyleIdsByPartyIndex ?? existing.supportStyleIdsByPartyIndex,
    supportLimitBreakLevelsByPartyIndex:
      base.supportLimitBreakLevelsByPartyIndex ?? existing.supportLimitBreakLevelsByPartyIndex,
    skillSetsByPartyIndex: base.skillSetsByPartyIndex ?? existing.skillSetsByPartyIndex,
    limitBreakLevelsByPartyIndex: base.limitBreakLevelsByPartyIndex ?? existing.limitBreakLevelsByPartyIndex,
    initialOdGauge: base.initialOdGauge ?? existing.initialOdGauge,
    initialDpStateByPartyIndex: base.initialDpStateByPartyIndex ?? existing.initialDpStateByPartyIndex,
    initialBreakByPartyIndex: base.initialBreakByPartyIndex ?? existing.initialBreakByPartyIndex,
    initialMotivationByPartyIndex:
      base.initialMotivationByPartyIndex ?? existing.initialMotivationByPartyIndex,
    setupEntries: base.setupEntries ?? existing.setupEntries,
  });
}

export function createLightweightReplayScriptFromBaseSetup(baseSetup = {}, existingScript = {}) {
  const existing = isPlainObject(existingScript) ? existingScript : {};
  return normalizeLightweightReplayScript({
    version: existing.version ?? LIGHTWEIGHT_REPLAY_SCRIPT_VERSION,
    setup: createLightweightReplaySetupFromBaseSetup(baseSetup, existing.setup),
    turns: existing.turns ?? [],
  });
}
