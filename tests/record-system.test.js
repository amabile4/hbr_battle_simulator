import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createBattleRecordStore,
  createBattleStateFromParty,
  CsvExporter,
  previewTurn,
  commitTurn,
  RecordEditor,
} from '../src/index.js';
import { getStore, getSixUsableStyleIds } from './helpers.js';

function buildFrontActionDict(party) {
  return Object.fromEntries(
    party.getFrontline().map((member) => {
      const skill = member.skills.find((item) => item.spCost > 0) ?? member.skills[0];
      return [
        String(member.position),
        {
          characterId: member.characterId,
          skillId: skill.skillId,
        },
      ];
    })
  );
}

test('record editor supports upsert/insert/delete workflow', () => {
  const store = getStore();
  const styleIds = getSixUsableStyleIds(store);
  const party = store.buildPartyFromStyleIds(styleIds, { initialSP: 10 });

  const state1 = createBattleStateFromParty(party);
  const rec1 = commitTurn(state1, previewTurn(state1, buildFrontActionDict(party))).committedRecord;

  const state2 = createBattleStateFromParty(party, {
    ...state1.turnState,
    sequenceId: 2,
    turnIndex: 2,
    turnLabel: 'T2',
  });
  const rec2 = commitTurn(state2, previewTurn(state2, buildFrontActionDict(party))).committedRecord;

  let battleStore = createBattleRecordStore();
  battleStore = RecordEditor.upsertRecord(battleStore, rec1);
  battleStore = RecordEditor.upsertRecord(battleStore, rec2);

  assert.equal(battleStore.records.length, 2);

  const inserted = { ...rec2, turnId: 999, turnType: 'extra', turnLabel: 'EX' };
  battleStore = RecordEditor.insertBefore(battleStore, 2, inserted);
  assert.equal(battleStore.records.length, 3);

  battleStore = RecordEditor.deleteRecord(battleStore, 2);
  assert.equal(battleStore.records.length, 2);

  battleStore = RecordEditor.reindexTurnLabels(battleStore);
  assert.equal(battleStore.records[0].turnId, 1);
});

test('csv exporter outputs stable character columns by initial party index', () => {
  const store = getStore();
  const styleIds = getSixUsableStyleIds(store);
  const party = store.buildPartyFromStyleIds(styleIds, { initialSP: 10 });
  const state = createBattleStateFromParty(party);

  const preview = previewTurn(state, buildFrontActionDict(party));
  const { committedRecord } = commitTurn(state, preview);

  let battleStore = createBattleRecordStore();
  battleStore = RecordEditor.upsertRecord(battleStore, committedRecord);

  const csv = CsvExporter.exportToCSV(battleStore, state.initialParty);

  assert.ok(csv.includes('seq,turnLabel,actionContext,enemyAction'));
  assert.ok(csv.includes('T1'));
  assert.ok(csv.includes('normal'));

  const firstName = state.initialParty.find((p) => p.partyIndex === 0).characterName;
  assert.ok(csv.includes(`${firstName}_startSP`));
  assert.ok(csv.includes(`${firstName}_position`));
  const firstDataRow = csv.split('\n')[1]?.split(',') ?? [];
  const positionCol = 5; // seq,turnLabel,actionContext,enemyAction,startSP,position,...
  assert.equal(Number(firstDataRow[positionCol]) >= 1, true, 'position should be 1-based in CSV');
});
