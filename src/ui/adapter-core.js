import {
  createBattleStateFromParty,
  previewTurn,
  commitTurn,
  applyInitialPassiveState,
} from '../turn/turn-controller.js';
import { createBattleRecordStore, RecordEditor, CsvExporter, JsonExporter } from '../records/record-store.js';
import { createInitialTurnState } from '../contracts/interfaces.js';
import { DEFAULT_MARK_LEVEL_MAX, MARK_STATE_ELEMENTS } from '../config/battle-defaults.js';

const DEFAULT_STATE_MIN = 0;
const DEFAULT_TOKEN_STATE_MAX = 10;
const DEFAULT_MORALE_STATE_MAX = 10;
const DEFAULT_MOTIVATION_STATE_MAX = 5;

function canSwapByExtraState(a, b, hasAnyExtra = false) {
  if (hasAnyExtra) {
    return Boolean(a?.isExtraActive) && Boolean(b?.isExtraActive);
  }
  return true;
}

function getPartyMembers(party) {
  if (Array.isArray(party)) {
    return party;
  }
  return Array.isArray(party?.members) ? party.members : [];
}

function normalizeBoundedState(rawState, fallbackState, fallbackMax) {
  const state = rawState && typeof rawState === 'object' ? rawState : {};
  const fallback = fallbackState && typeof fallbackState === 'object' ? fallbackState : {};
  const min = Number.isFinite(Number(state.min))
    ? Number(state.min)
    : Number.isFinite(Number(fallback.min))
      ? Number(fallback.min)
      : DEFAULT_STATE_MIN;
  const max = Number.isFinite(Number(state.max))
    ? Number(state.max)
    : Number.isFinite(Number(fallback.max))
      ? Number(fallback.max)
      : fallbackMax;
  const currentRaw = Number.isFinite(Number(state.current))
    ? Number(state.current)
    : Number.isFinite(Number(fallback.current))
      ? Number(fallback.current)
      : min;
  return {
    current: Math.max(min, Math.min(max, currentRaw)),
    min,
    max,
  };
}

function normalizeMarkStates(rawMarkStates, fallbackMarkStates) {
  const source = rawMarkStates && typeof rawMarkStates === 'object' ? rawMarkStates : {};
  const fallback = fallbackMarkStates && typeof fallbackMarkStates === 'object' ? fallbackMarkStates : {};
  return Object.fromEntries(
    MARK_STATE_ELEMENTS.map((element) => [
      element,
      normalizeBoundedState(source[element], fallback[element], DEFAULT_MARK_LEVEL_MAX),
    ])
  );
}

function applyInitialPartyStateOverrides(
  party,
  {
    tokenStateByPartyIndex = {},
    moraleStateByPartyIndex = {},
    motivationStateByPartyIndex = {},
    markStateByPartyIndex = {},
  } = {}
) {
  const members = getPartyMembers(party);
  for (const member of members) {
    const key = String(member.partyIndex);
    if (tokenStateByPartyIndex[key] && typeof tokenStateByPartyIndex[key] === 'object') {
      member.tokenState = normalizeBoundedState(
        tokenStateByPartyIndex[key],
        member.tokenState,
        DEFAULT_TOKEN_STATE_MAX
      );
    }
    if (moraleStateByPartyIndex[key] && typeof moraleStateByPartyIndex[key] === 'object') {
      member.moraleState = normalizeBoundedState(
        moraleStateByPartyIndex[key],
        member.moraleState,
        DEFAULT_MORALE_STATE_MAX
      );
    }
    if (motivationStateByPartyIndex[key] && typeof motivationStateByPartyIndex[key] === 'object') {
      member.motivationState = normalizeBoundedState(
        motivationStateByPartyIndex[key],
        member.motivationState,
        DEFAULT_MOTIVATION_STATE_MAX
      );
    }
    if (markStateByPartyIndex[key] && typeof markStateByPartyIndex[key] === 'object') {
      member.markStates = normalizeMarkStates(markStateByPartyIndex[key], member.markStates);
    }
  }
}

export function createInitializedBattleSnapshot({
  dataStore,
  initialSP,
  styleIds,
  skillSetsByPartyIndex,
  limitBreakLevelsByPartyIndex,
  drivePierceByPartyIndex,
  normalAttackElementsByPartyIndex,
  startSpEquipByPartyIndex,
  initialMotivationByPartyIndex = {},
  initialDpStateByPartyIndex = {},
  initialBreakByPartyIndex = {},
  tokenStateByPartyIndex = {},
  moraleStateByPartyIndex = {},
  motivationStateByPartyIndex = {},
  markStateByPartyIndex = {},
  supportStyleIdsByPartyIndex = {},
  supportLimitBreakLevelsByPartyIndex = {},
  initialOdGauge,
  enemyCount,
  enemyNamesByEnemy = {},
  damageRatesByEnemy = {},
  destructionRateByEnemy = {},
  destructionRateCapByEnemy = {},
  enemyStatuses = [],
  breakStateByEnemy = {},
  enemyZoneConfigByEnemy = {},
  zoneState = null,
  territoryState = null,
}) {
  const initialSpByPartyIndex = Object.fromEntries(
    Object.entries(startSpEquipByPartyIndex).map(([index, bonus]) => [
      Number(index),
      Number(initialSP) + Number(bonus ?? 0),
    ])
  );

  const party = dataStore.buildPartyFromStyleIds(styleIds, {
    initialSP,
    initialSpByPartyIndex,
    initialMotivationByPartyIndex,
    initialDpStateByPartyIndex,
    initialBreakByPartyIndex,
    skillSetsByPartyIndex,
    limitBreakLevelsByPartyIndex,
    drivePierceByPartyIndex,
    normalAttackElementsByPartyIndex,
    supportStyleIdsByPartyIndex,
    supportLimitBreakLevelsByPartyIndex,
  });
  applyInitialPartyStateOverrides(party, {
    tokenStateByPartyIndex,
    moraleStateByPartyIndex,
    motivationStateByPartyIndex,
    markStateByPartyIndex,
  });

  const initialTurnState = {
    ...createInitialTurnState(),
    odGauge: Number(initialOdGauge),
    enemyState: {
      enemyCount: Number(enemyCount),
      statuses: Array.isArray(enemyStatuses)
        ? enemyStatuses.map((status) => ({
            statusType: String(status?.statusType ?? ''),
            targetIndex: Number(status?.targetIndex ?? 0),
            remainingTurns: Number(status?.remainingTurns ?? 0),
          }))
        : [],
      damageRatesByEnemy:
        damageRatesByEnemy && typeof damageRatesByEnemy === 'object' ? structuredClone(damageRatesByEnemy) : {},
      destructionRateByEnemy:
        destructionRateByEnemy && typeof destructionRateByEnemy === 'object'
          ? structuredClone(destructionRateByEnemy)
          : {},
      destructionRateCapByEnemy:
        destructionRateCapByEnemy && typeof destructionRateCapByEnemy === 'object'
          ? structuredClone(destructionRateCapByEnemy)
          : {},
      breakStateByEnemy:
        breakStateByEnemy && typeof breakStateByEnemy === 'object' ? structuredClone(breakStateByEnemy) : {},
      enemyNamesByEnemy:
        enemyNamesByEnemy && typeof enemyNamesByEnemy === 'object' ? structuredClone(enemyNamesByEnemy) : {},
      zoneConfigByEnemy:
        enemyZoneConfigByEnemy && typeof enemyZoneConfigByEnemy === 'object'
          ? structuredClone(enemyZoneConfigByEnemy)
          : {},
    },
    zoneState: zoneState && typeof zoneState === 'object' ? structuredClone(zoneState) : null,
    territoryState: territoryState && typeof territoryState === 'object' ? structuredClone(territoryState) : null,
  };

  const state = createBattleStateFromParty(party, initialTurnState);
  applyInitialPassiveState(state);

  return {
    party,
    state,
    turnPlanBaseSetup: {
      styleIds: [...styleIds].map((id) => Number(id)),
      skillSetsByPartyIndex: structuredClone(skillSetsByPartyIndex),
      limitBreakLevelsByPartyIndex: structuredClone(limitBreakLevelsByPartyIndex),
      drivePierceByPartyIndex: structuredClone(drivePierceByPartyIndex),
      normalAttackElementsByPartyIndex: structuredClone(normalAttackElementsByPartyIndex),
      startSpEquipByPartyIndex: structuredClone(startSpEquipByPartyIndex),
      initialMotivationByPartyIndex: structuredClone(initialMotivationByPartyIndex),
      initialDpStateByPartyIndex: structuredClone(initialDpStateByPartyIndex),
      initialBreakByPartyIndex: structuredClone(initialBreakByPartyIndex),
      tokenStateByPartyIndex: structuredClone(tokenStateByPartyIndex),
      moraleStateByPartyIndex: structuredClone(moraleStateByPartyIndex),
      motivationStateByPartyIndex: structuredClone(motivationStateByPartyIndex),
      markStateByPartyIndex: structuredClone(markStateByPartyIndex),
      initialOdGauge: Number(initialOdGauge),
      enemyCount: Number(enemyCount),
      enemyNamesByEnemy:
        enemyNamesByEnemy && typeof enemyNamesByEnemy === 'object' ? structuredClone(enemyNamesByEnemy) : {},
      damageRatesByEnemy:
        damageRatesByEnemy && typeof damageRatesByEnemy === 'object' ? structuredClone(damageRatesByEnemy) : {},
      destructionRateByEnemy:
        destructionRateByEnemy && typeof destructionRateByEnemy === 'object'
          ? structuredClone(destructionRateByEnemy)
          : {},
      destructionRateCapByEnemy:
        destructionRateCapByEnemy && typeof destructionRateCapByEnemy === 'object'
          ? structuredClone(destructionRateCapByEnemy)
          : {},
      enemyStatuses: Array.isArray(enemyStatuses) ? structuredClone(enemyStatuses) : [],
      breakStateByEnemy:
        breakStateByEnemy && typeof breakStateByEnemy === 'object' ? structuredClone(breakStateByEnemy) : {},
      enemyZoneConfigByEnemy:
        enemyZoneConfigByEnemy && typeof enemyZoneConfigByEnemy === 'object'
          ? structuredClone(enemyZoneConfigByEnemy)
          : {},
      zoneState: zoneState && typeof zoneState === 'object' ? structuredClone(zoneState) : null,
      territoryState: territoryState && typeof territoryState === 'object' ? structuredClone(territoryState) : null,
    },
  };
}

export function queueSwapState(state, pendingSwapEvents, fromPositionIndex, toPositionIndex) {
  if (!state) {
    throw new Error('State is not initialized.');
  }
  if (fromPositionIndex === toPositionIndex) {
    return { event: null, skippedSamePosition: true };
  }

  const outMember = state.party.find((member) => member.position === fromPositionIndex);
  const inMember = state.party.find((member) => member.position === toPositionIndex);
  if (!outMember || !inMember) {
    throw new Error('Swap target position not found.');
  }

  const hasAnyExtra = state.party.some((m) => m.isExtraActive);
  if (!canSwapByExtraState(outMember, inMember, hasAnyExtra)) {
    throw new Error('Swap is allowed only between [EX]<->[EX] during an Extra Turn.');
  }

  const event = {
    swapSequence: pendingSwapEvents.length + 1,
    fromPositionIndex,
    toPositionIndex,
    outCharacterId: outMember.characterId,
    outCharacterName: outMember.characterName,
    inCharacterId: inMember.characterId,
    inCharacterName: inMember.characterName,
  };

  const fromPos = outMember.position;
  const toPos = inMember.position;
  outMember.setPosition(toPos);
  inMember.setPosition(fromPos);
  pendingSwapEvents.push(event);

  return {
    event,
    outMember,
    inMember,
    skippedSamePosition: false,
  };
}

export function previewTurnRecord(state, actions, enemyAction, enemyCount, options = {}) {
  return previewTurn(state, actions, enemyAction, enemyCount, options);
}

export function commitTurnRecord(state, previewRecord, pendingSwapEvents, options = {}) {
  return commitTurn(state, previewRecord, pendingSwapEvents, {
    applySwapOnCommit: false,
    interruptOdLevel: Number(options.interruptOdLevel ?? 0),
    forceOdActivation: Boolean(options.forceOdActivation ?? false),
    forceResourceDeficit: Boolean(options.forceResourceDeficit ?? false),
    enemyAttackTargetCharacterIds: Array.isArray(options.enemyAttackTargetCharacterIds)
      ? structuredClone(options.enemyAttackTargetCharacterIds)
      : [],
  });
}

export function appendCommittedRecord(recordStore, committedRecord) {
  return RecordEditor.upsertRecord(recordStore, committedRecord);
}

export function resetRecordStore() {
  return createBattleRecordStore();
}

export function exportCsvText(recordStore, initialParty) {
  return CsvExporter.exportToCSV(recordStore, initialParty);
}

export function exportRecordsJsonText(recordStore) {
  return JsonExporter.exportToJSON(recordStore);
}
