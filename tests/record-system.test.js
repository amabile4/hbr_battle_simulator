import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createBattleRecordStore,
  createBattleStateFromParty,
  CharacterStyle,
  CsvExporter,
  Party,
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

test('csv action cell renders hit as base+funnel when funnel bonus exists', () => {
  const members = Array.from({ length: 6 }, (_, idx) =>
    new CharacterStyle({
      characterId: `CR${idx + 1}`,
      characterName: `CR${idx + 1}`,
      styleId: idx + 1,
      styleName: `CRS${idx + 1}`,
      partyIndex: idx,
      position: idx,
      initialSP: 10,
      skills: [
        {
          id: 31000 + idx,
          name: idx === 0 ? 'Attack + Funnel' : 'Normal',
          label: idx === 0 ? 'AttackFunnel' : `CRSkill${idx + 1}`,
          sp_cost: 0,
          hit_count: idx === 0 ? 1 : 0,
          target_type: 'Single',
          parts:
            idx === 0
              ? [
                  { skill_type: 'AttackSkill', target_type: 'Single' },
                  {
                    skill_type: 'Funnel',
                    target_type: 'Self',
                    power: [3, 0],
                    value: [0.25, 0],
                    effect: { limitType: 'Default', exitCond: 'Count', exitVal: [1, 0] },
                  },
                ]
              : [],
        },
      ],
    })
  );
  const party = new Party(members);
  const state = createBattleStateFromParty(party);
  const actor = state.party.find((m) => m.characterId === 'CR1');
  actor.addStatusEffect({
    statusType: 'Funnel',
    limitType: 'Default',
    exitCond: 'Count',
    remaining: 1,
    power: 3,
    metadata: { damageBonus: 0.25 },
  });
  const preview = previewTurn(state, {
    0: { characterId: 'CR1', skillId: 31000 },
  });
  const { committedRecord } = commitTurn(state, preview);
  const store = RecordEditor.upsertRecord(createBattleRecordStore(), committedRecord);
  const csv = CsvExporter.exportToCSV(store, state.initialParty);

  assert.ok(csv.includes('Attack + Funnel [Single,4hit (1+3)]'));
});
