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

export const REPLAY_SETUP_ENTRY_TYPES = Object.freeze({
  INITIAL_MOTIVATION_BY_PARTY_INDEX: 'InitialMotivationByPartyIndex',
  INITIAL_DP_STATE_BY_PARTY_INDEX: 'InitialDpStateByPartyIndex',
  INITIAL_BREAK_BY_PARTY_INDEX: 'InitialBreakByPartyIndex',
  TOKEN_STATE_BY_PARTY_INDEX: 'TokenStateByPartyIndex',
  MORALE_STATE_BY_PARTY_INDEX: 'MoraleStateByPartyIndex',
  MOTIVATION_STATE_BY_PARTY_INDEX: 'MotivationStateByPartyIndex',
  MARK_STATE_BY_PARTY_INDEX: 'MarkStateByPartyIndex',
  STATUS_EFFECTS_BY_PARTY_INDEX: 'StatusEffectsByPartyIndex',
});

export const REPLAY_OVERRIDE_ENTRY_TYPES = Object.freeze({
  ENEMY_COUNT: 'EnemyCount',
  ENEMY_ACTION: 'EnemyAction',
  ENEMY_NAMES: 'EnemyNames',
  ENEMY_DAMAGE_RATES: 'EnemyDamageRates',
  ENEMY_DESTRUCTION_RATES: 'EnemyDestructionRates',
  ENEMY_DESTRUCTION_RATE_CAPS: 'EnemyDestructionRateCaps',
  ENEMY_BREAK_STATES: 'EnemyBreakStates',
  ENEMY_STATUSES: 'EnemyStatuses',
  DP_STATE_BY_PARTY_INDEX: 'DpStateByPartyIndex',
  TOKEN_STATE_BY_PARTY_INDEX: 'TokenStateByPartyIndex',
  MORALE_STATE_BY_PARTY_INDEX: 'MoraleStateByPartyIndex',
  MOTIVATION_STATE_BY_PARTY_INDEX: 'MotivationStateByPartyIndex',
  MARK_STATE_BY_PARTY_INDEX: 'MarkStateByPartyIndex',
  STATUS_EFFECTS_BY_PARTY_INDEX: 'StatusEffectsByPartyIndex',
  ZONE_STATE: 'ZoneState',
  TERRITORY_STATE: 'TerritoryState',
  ENEMY_ATTACK_TARGET_CHARACTER_IDS: 'EnemyAttackTargetCharacterIds',
});

function cloneReplayPayload(value) {
  if (value === undefined) {
    return undefined;
  }
  if (isPlainObject(value) || Array.isArray(value)) {
    return structuredClone(value);
  }
  return value;
}

function isEmptyReplayPayload(value) {
  if (value === null || value === undefined) {
    return true;
  }
  if (Array.isArray(value)) {
    return value.length === 0;
  }
  if (isPlainObject(value)) {
    return Object.keys(value).length === 0;
  }
  return false;
}

function createReplaySetupEntryDefinition(legacyField) {
  return Object.freeze({
    legacyField,
    applyToInitializeOptions(initializeOptions, payload) {
      initializeOptions[legacyField] = cloneReplayPayload(payload) ?? {};
    },
  });
}

function createReplayOverrideEntryDefinition(fieldName) {
  return Object.freeze({
    fieldName,
    applyToScenarioTurn(scenarioTurn, payload) {
      const nextPayload = cloneReplayPayload(payload);
      if (nextPayload === undefined) {
        return;
      }
      scenarioTurn[fieldName] = nextPayload;
    },
  });
}

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

export const replaySetupEntryRegistry = createTypedEnvelopeRegistry({
  [REPLAY_SETUP_ENTRY_TYPES.INITIAL_MOTIVATION_BY_PARTY_INDEX]: createReplaySetupEntryDefinition(
    'initialMotivationByPartyIndex'
  ),
  [REPLAY_SETUP_ENTRY_TYPES.INITIAL_DP_STATE_BY_PARTY_INDEX]: createReplaySetupEntryDefinition(
    'initialDpStateByPartyIndex'
  ),
  [REPLAY_SETUP_ENTRY_TYPES.INITIAL_BREAK_BY_PARTY_INDEX]: createReplaySetupEntryDefinition(
    'initialBreakByPartyIndex'
  ),
  [REPLAY_SETUP_ENTRY_TYPES.TOKEN_STATE_BY_PARTY_INDEX]: createReplaySetupEntryDefinition(
    'tokenStateByPartyIndex'
  ),
  [REPLAY_SETUP_ENTRY_TYPES.MORALE_STATE_BY_PARTY_INDEX]: createReplaySetupEntryDefinition(
    'moraleStateByPartyIndex'
  ),
  [REPLAY_SETUP_ENTRY_TYPES.MOTIVATION_STATE_BY_PARTY_INDEX]: createReplaySetupEntryDefinition(
    'motivationStateByPartyIndex'
  ),
  [REPLAY_SETUP_ENTRY_TYPES.MARK_STATE_BY_PARTY_INDEX]: createReplaySetupEntryDefinition(
    'markStateByPartyIndex'
  ),
  [REPLAY_SETUP_ENTRY_TYPES.STATUS_EFFECTS_BY_PARTY_INDEX]: createReplaySetupEntryDefinition(
    'statusEffectsByPartyIndex'
  ),
});
export const replayOperationRegistry = createTypedEnvelopeRegistry({
  [REPLAY_OPERATION_TYPES.ACTIVATE_KISHINKA]: Object.freeze({ timing: 'beforeCommit' }),
  [REPLAY_OPERATION_TYPES.ACTIVATE_PREEMPTIVE_OD]: Object.freeze({ timing: 'beforeCommit' }),
  [REPLAY_OPERATION_TYPES.RESERVE_INTERRUPT_OD]: Object.freeze({ timing: 'afterCommitReservation' }),
});
export const replayOverrideEntryRegistry = createTypedEnvelopeRegistry({
  [REPLAY_OVERRIDE_ENTRY_TYPES.ENEMY_COUNT]: createReplayOverrideEntryDefinition('enemyCount'),
  [REPLAY_OVERRIDE_ENTRY_TYPES.ENEMY_ACTION]: createReplayOverrideEntryDefinition('enemyAction'),
  [REPLAY_OVERRIDE_ENTRY_TYPES.ENEMY_NAMES]: createReplayOverrideEntryDefinition('enemyNames'),
  [REPLAY_OVERRIDE_ENTRY_TYPES.ENEMY_DAMAGE_RATES]: createReplayOverrideEntryDefinition('enemyDamageRates'),
  [REPLAY_OVERRIDE_ENTRY_TYPES.ENEMY_DESTRUCTION_RATES]:
    createReplayOverrideEntryDefinition('enemyDestructionRates'),
  [REPLAY_OVERRIDE_ENTRY_TYPES.ENEMY_DESTRUCTION_RATE_CAPS]:
    createReplayOverrideEntryDefinition('enemyDestructionRateCaps'),
  [REPLAY_OVERRIDE_ENTRY_TYPES.ENEMY_BREAK_STATES]: createReplayOverrideEntryDefinition('enemyBreakStates'),
  [REPLAY_OVERRIDE_ENTRY_TYPES.ENEMY_STATUSES]: createReplayOverrideEntryDefinition('enemyStatuses'),
  [REPLAY_OVERRIDE_ENTRY_TYPES.DP_STATE_BY_PARTY_INDEX]:
    createReplayOverrideEntryDefinition('dpStateByPartyIndex'),
  [REPLAY_OVERRIDE_ENTRY_TYPES.TOKEN_STATE_BY_PARTY_INDEX]:
    createReplayOverrideEntryDefinition('tokenStateByPartyIndex'),
  [REPLAY_OVERRIDE_ENTRY_TYPES.MORALE_STATE_BY_PARTY_INDEX]:
    createReplayOverrideEntryDefinition('moraleStateByPartyIndex'),
  [REPLAY_OVERRIDE_ENTRY_TYPES.MOTIVATION_STATE_BY_PARTY_INDEX]:
    createReplayOverrideEntryDefinition('motivationStateByPartyIndex'),
  [REPLAY_OVERRIDE_ENTRY_TYPES.MARK_STATE_BY_PARTY_INDEX]:
    createReplayOverrideEntryDefinition('markStateByPartyIndex'),
  [REPLAY_OVERRIDE_ENTRY_TYPES.STATUS_EFFECTS_BY_PARTY_INDEX]:
    createReplayOverrideEntryDefinition('statusEffectsByPartyIndex'),
  [REPLAY_OVERRIDE_ENTRY_TYPES.ZONE_STATE]: createReplayOverrideEntryDefinition('zoneState'),
  [REPLAY_OVERRIDE_ENTRY_TYPES.TERRITORY_STATE]: createReplayOverrideEntryDefinition('territoryState'),
  [REPLAY_OVERRIDE_ENTRY_TYPES.ENEMY_ATTACK_TARGET_CHARACTER_IDS]:
    createReplayOverrideEntryDefinition('enemyAttackTargetCharacterIds'),
});

function collectLegacyReplaySetupEntries(setup = {}, explicitTypes = new Set()) {
  const source = isPlainObject(setup) ? setup : {};
  const entries = [];
  for (const type of replaySetupEntryRegistry.listTypes()) {
    if (explicitTypes.has(type)) {
      continue;
    }
    const definition = replaySetupEntryRegistry.get(type);
    const legacyField = String(definition?.legacyField ?? '').trim();
    if (!legacyField || !(legacyField in source)) {
      continue;
    }
    const payload = cloneReplayPayload(source[legacyField]);
    if (isEmptyReplayPayload(payload)) {
      continue;
    }
    entries.push({ type, payload });
  }
  return entries;
}

export function getReplaySetupEntries(setup = {}) {
  const source = isPlainObject(setup) ? setup : {};
  const explicitEntries = replaySetupEntryRegistry.normalizeEntries(source.setupEntries);
  const explicitTypes = new Set(explicitEntries.map((entry) => String(entry.type ?? '')));
  return [...collectLegacyReplaySetupEntries(source, explicitTypes), ...explicitEntries];
}

function mergeReplaySetupEntries(preferredSetup = {}, fallbackSetup = {}) {
  const preferredEntries = getReplaySetupEntries(preferredSetup);
  const preferredTypes = new Set(preferredEntries.map((entry) => String(entry.type ?? '')));
  const fallbackEntries = getReplaySetupEntries(fallbackSetup).filter(
    (entry) => !preferredTypes.has(String(entry.type ?? ''))
  );
  return [...fallbackEntries, ...preferredEntries];
}

export function applyReplaySetupEntriesToInitializeOptions(setup = {}, initializeOptions = {}, warnings = []) {
  for (const entry of getReplaySetupEntries(setup)) {
    const type = String(entry?.type ?? '').trim();
    if (!type) {
      continue;
    }
    const definition = replaySetupEntryRegistry.get(type);
    if (typeof definition?.applyToInitializeOptions !== 'function') {
      warnings.push(`setup entry ignored: ${type}`);
      continue;
    }
    definition.applyToInitializeOptions(initializeOptions, entry.payload);
  }
  return initializeOptions;
}

export function applyReplayOverrideEntriesToScenarioTurn(entries = [], scenarioTurn = {}, warnings = []) {
  for (const entry of replayOverrideEntryRegistry.normalizeEntries(entries)) {
    const type = String(entry?.type ?? '').trim();
    if (!type) {
      continue;
    }
    const definition = replayOverrideEntryRegistry.get(type);
    if (typeof definition?.applyToScenarioTurn !== 'function') {
      warnings.push(`override entry ignored: ${type}`);
      continue;
    }
    definition.applyToScenarioTurn(scenarioTurn, entry.payload);
  }
  return scenarioTurn;
}

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
    setupEntries: mergeReplaySetupEntries(source),
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
    setupEntries: mergeReplaySetupEntries(existing, base),
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
