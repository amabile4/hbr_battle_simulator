import {
  createBattleStateFromParty,
  previewTurn,
  commitTurn,
  applyInitialPassiveState,
} from '../turn/turn-controller.js';
import { createBattleRecordStore, RecordEditor, CsvExporter, JsonExporter } from '../records/record-store.js';
import { createInitialTurnState } from '../contracts/interfaces.js';

function canSwapByExtraState(a, b, hasAnyExtra = false) {
  if (hasAnyExtra) {
    return Boolean(a?.isExtraActive) && Boolean(b?.isExtraActive);
  }
  return true;
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
  initialOdGauge,
  enemyCount,
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
    skillSetsByPartyIndex,
    limitBreakLevelsByPartyIndex,
    drivePierceByPartyIndex,
    normalAttackElementsByPartyIndex,
  });

  const initialTurnState = {
    ...createInitialTurnState(),
    odGauge: Number(initialOdGauge),
    enemyState: {
      enemyCount: Number(enemyCount),
      statuses: [],
      damageRatesByEnemy: {},
      enemyNamesByEnemy: {},
    },
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
      initialOdGauge: Number(initialOdGauge),
      enemyCount: Number(enemyCount),
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
