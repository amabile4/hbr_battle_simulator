import test from 'node:test';
import assert from 'node:assert/strict';
import {
  commitTurn,
  createBattleStateFromParty,
  createBattleRecordStore,
  previewTurn,
  RecordEditor,
} from '../src/index.js';
import { getStore, getSixUsableStyleIds } from './helpers.js';

test('turn preview and commit work with revision guard', () => {
  const store = getStore();
  const styleIds = getSixUsableStyleIds(store);
  const party = store.buildPartyFromStyleIds(styleIds, { initialSP: 15 });
  const state = createBattleStateFromParty(party);

  const actionDict = Object.fromEntries(
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

  const preview = previewTurn(state, actionDict);

  assert.equal(preview.recordStatus, 'preview');
  assert.equal(preview.actions.length, 3);
  assert.equal(preview.turnType, 'normal');

  const { nextState, committedRecord } = commitTurn(state, preview);
  assert.equal(committedRecord.recordStatus, 'committed');
  assert.equal(committedRecord.actions.length, 3);
  assert.equal(nextState.turnState.sequenceId, 2);
  assert.equal(nextState.turnState.turnIndex, 2);

  assert.throws(() => commitTurn(nextState, preview), /State changed after preview/);
});

test('commitTurn throws when called with null preview (no prior previewTurn)', () => {
  const store = getStore();
  const styleIds = getSixUsableStyleIds(store);
  const party = store.buildPartyFromStyleIds(styleIds, { initialSP: 10 });
  const state = createBattleStateFromParty(party);

  assert.throws(() => commitTurn(state, null), /commitTurn requires preview TurnRecord/);
  assert.throws(() => commitTurn(state, undefined), /commitTurn requires preview TurnRecord/);
  assert.throws(() => commitTurn(state, { recordStatus: 'committed' }), /commitTurn requires preview TurnRecord/);
});

test('preview/commit records can be stored and reindexed', () => {
  const store = getStore();
  const styleIds = getSixUsableStyleIds(store);
  const party = store.buildPartyFromStyleIds(styleIds, { initialSP: 15 });
  const state = createBattleStateFromParty(party);

  const actionDict = Object.fromEntries(
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

  const preview = previewTurn(state, actionDict);
  const { committedRecord } = commitTurn(state, preview);

  let recordStore = createBattleRecordStore();
  recordStore = RecordEditor.upsertRecord(recordStore, committedRecord);
  recordStore = RecordEditor.reindexTurnLabels(recordStore);

  assert.equal(recordStore.records.length, 1);
  assert.equal(recordStore.records[0].turnId, 1);
  assert.equal(recordStore.records[0].turnLabel, 'T1');
});
