import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createBattleRecordStore,
  createBattleStateFromParty,
  CharacterStyle,
  CsvExporter,
  JsonExporter,
  Party,
  previewTurn,
  commitTurn,
  RecordEditor,
} from '../src/index.js';
import { getStore, getSixUsableStyleIds } from './helpers.js';

function makeSimpleRecord(turnId, turnType, turnIndex, turnLabel) {
  return {
    turnId,
    turnIndex,
    turnType,
    turnLabel,
    odTurnLabelAtStart: '',
    odContext: '',
    odGaugeAtStart: 0,
    enemyAction: '',
    snapBefore: [],
    snapAfter: [],
    actions: [],
  };
}

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

  assert.ok(csv.includes('seq,turn,od_turn,od_context,ex,od,transcendence,enemyAction'));
  assert.ok(csv.includes(',1,'));
  assert.ok(csv.includes('0.00%'));

  const firstName = state.initialParty.find((p) => p.partyIndex === 0).characterName;
  assert.ok(csv.includes(`${firstName}_startSP`));
  assert.ok(csv.includes(`${firstName}_position`));
  const rows = csv.split('\n');
  const header = rows[0]?.split(',') ?? [];
  const firstDataRow = rows[1]?.split(',') ?? [];
  const positionCol = header.indexOf(`${firstName}_position`);
  assert.equal(Number(firstDataRow[positionCol]) >= 1, true, 'position should be 1-based in CSV');
});

test('json exporter writes all record store fields for file save payload', () => {
  const store = getStore();
  const styleIds = getSixUsableStyleIds(store);
  const party = store.buildPartyFromStyleIds(styleIds, {
    initialSP: 10,
    initialMotivationByPartyIndex: { 0: 5, 1: 1 },
    initialDpStateByPartyIndex: { 0: { currentDp: 84, effectiveDpCap: 98 } },
  });
  const state = createBattleStateFromParty(party);

  const preview = previewTurn(state, buildFrontActionDict(party));
  const { committedRecord } = commitTurn(state, preview);

  let battleStore = createBattleRecordStore();
  battleStore = RecordEditor.upsertRecord(battleStore, committedRecord);
  const exportedAt = '2026-03-06T00:00:00.000Z';
  const payload = JSON.parse(JsonExporter.exportToJSON(battleStore, { exportedAt }));

  assert.equal(payload.schemaVersion, 1);
  assert.equal(payload.exportedAt, exportedAt);
  assert.equal(payload.recordStore.nextSequenceId, battleStore.nextSequenceId);
  assert.equal(Array.isArray(payload.recordStore.records), true);
  assert.equal(payload.recordStore.records.length, 1);
  assert.equal(payload.recordStore.records[0].turnId, committedRecord.turnId);
  assert.equal(payload.recordStore.records[0].actions.length, committedRecord.actions.length);
  assert.equal(payload.recordStore.records[0].actions[0].skillId, committedRecord.actions[0].skillId);
  assert.equal(payload.recordStore.records[0].actions[0].spChanges[0].eventCeiling, 'Infinity');
  assert.equal(payload.recordStore.records[0].snapBefore[0].motivationState.current, 5);
  assert.equal(payload.recordStore.records[0].snapBefore[1].motivationState.current, 1);
  assert.equal(payload.recordStore.records[0].snapBefore[0].dpState.currentDp, 84);
  assert.equal(payload.recordStore.records[0].snapBefore[0].dpState.effectiveDpCap, 98);
  assert.deepEqual(payload.recordStore.records[0].swapEvents, committedRecord.swapEvents);
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

  assert.ok(csv.includes('Attack + Funnel (SP 0) [Single,4hit (1+3)]'));
});

test('csv action cell shows selected enemy target with enemy name when available', () => {
  const initialParty = [
    { characterName: 'A', partyIndex: 0, positionIndex: 0, sp: { current: 10 } },
    { characterName: 'B', partyIndex: 1, positionIndex: 1, sp: { current: 10 } },
    { characterName: 'C', partyIndex: 2, positionIndex: 2, sp: { current: 10 } },
    { characterName: 'D', partyIndex: 3, positionIndex: 3, sp: { current: 10 } },
    { characterName: 'E', partyIndex: 4, positionIndex: 4, sp: { current: 10 } },
    { characterName: 'F', partyIndex: 5, positionIndex: 5, sp: { current: 10 } },
  ];

  const record = {
    turnId: 3,
    turnIndex: 3,
    turnType: 'normal',
    turnLabel: 'T3',
    odTurnLabelAtStart: '',
    odContext: '',
    odGaugeAtStart: 0,
    enemyAction: '',
    enemyCount: 3,
    enemyNamesByEnemy: { 1: 'Boss B' },
    snapBefore: initialParty,
    snapAfter: initialParty,
    actions: [
      {
        partyIndex: 0,
        skillName: 'Targeted Slash',
        consumeType: 'Sp',
        spChanges: [{ source: 'cost', delta: 0 }],
        spCost: 0,
        skillTargetType: 'Single',
        skillHitCount: 2,
        skillBaseHitCount: 2,
        skillFunnelHitBonus: 0,
        targetEnemyIndex: 1,
      },
    ],
  };

  const row = CsvExporter.recordToRow(record, initialParty);
  assert.equal(row[10], 'Targeted Slash (SP 0) [Single,2hit] -> Enemy 2 (Boss B)');
});

test('csv omits targeted enemy label when enemy count is one', () => {
  const initialParty = [
    { characterName: 'A', partyIndex: 0, positionIndex: 0, sp: { current: 10 } },
    { characterName: 'B', partyIndex: 1, positionIndex: 1, sp: { current: 10 } },
    { characterName: 'C', partyIndex: 2, positionIndex: 2, sp: { current: 10 } },
    { characterName: 'D', partyIndex: 3, positionIndex: 3, sp: { current: 10 } },
    { characterName: 'E', partyIndex: 4, positionIndex: 4, sp: { current: 10 } },
    { characterName: 'F', partyIndex: 5, positionIndex: 5, sp: { current: 10 } },
  ];

  const record = {
    turnId: 4,
    turnIndex: 4,
    turnType: 'normal',
    turnLabel: 'T4',
    odTurnLabelAtStart: '',
    odContext: '',
    odGaugeAtStart: 0,
    enemyAction: '',
    enemyCount: 1,
    enemyNamesByEnemy: { 0: 'Solo Boss' },
    snapBefore: initialParty,
    snapAfter: initialParty,
    actions: [
      {
        partyIndex: 0,
        skillName: 'Targeted Slash',
        consumeType: 'Sp',
        spChanges: [{ source: 'cost', delta: 0 }],
        spCost: 0,
        skillTargetType: 'Single',
        skillHitCount: 2,
        skillBaseHitCount: 2,
        skillFunnelHitBonus: 0,
        targetEnemyIndex: 0,
      },
    ],
  };

  const row = CsvExporter.recordToRow(record, initialParty);
  assert.equal(row[10], 'Targeted Slash (SP 0) [Single,2hit]');
});

test('csv keeps od_turn during od-suspended extra and exposes od_context', () => {
  const initialParty = [
    { characterName: 'A', partyIndex: 0 },
    { characterName: 'B', partyIndex: 1 },
    { characterName: 'C', partyIndex: 2 },
    { characterName: 'D', partyIndex: 3 },
    { characterName: 'E', partyIndex: 4 },
    { characterName: 'F', partyIndex: 5 },
  ];

  const record = {
    turnId: 2,
    turnIndex: 2,
    turnType: 'extra',
    turnLabel: 'EX',
    odTurnLabelAtStart: 'OD3-1',
    odContext: 'interrupt',
    odGaugeAtStart: 150,
    enemyAction: '',
    snapBefore: [],
    snapAfter: [],
    actions: [],
  };

  const row = CsvExporter.recordToRow(record, initialParty);
  assert.equal(row[1], 2);
  assert.equal(row[2], 'OD3-1');
  assert.equal(row[3], 'interrupt');
  assert.equal(row[4], 'ex');
});

test('csv enemyAction cell includes active enemy status summary for debugging', () => {
  const initialParty = [
    { characterName: 'A', partyIndex: 0 },
    { characterName: 'B', partyIndex: 1 },
    { characterName: 'C', partyIndex: 2 },
    { characterName: 'D', partyIndex: 3 },
    { characterName: 'E', partyIndex: 4 },
    { characterName: 'F', partyIndex: 5 },
  ];

  const record = {
    turnId: 6,
    turnIndex: 6,
    turnType: 'normal',
    turnLabel: 'T6',
    odTurnLabelAtStart: '',
    odContext: '',
    odGaugeAtStart: 123.45,
    enemyAction: '',
    enemyStatusSummary: 'DownTurn:E1(1)',
    snapBefore: [],
    snapAfter: [],
    actions: [],
  };

  const row = CsvExporter.recordToRow(record, initialParty);
  assert.equal(row[7], 'DownTurn:E1(1)');
});

// A群: insertBefore 境界テスト
test('insertBefore inserts at head when target is the first turnId', () => {
  let battleStore = createBattleRecordStore();
  battleStore = RecordEditor.upsertRecord(battleStore, makeSimpleRecord(1, 'normal', 1, 'T1'));
  battleStore = RecordEditor.upsertRecord(battleStore, makeSimpleRecord(2, 'normal', 2, 'T2'));

  const newRecord = makeSimpleRecord(999, 'extra', 0, 'EX');
  battleStore = RecordEditor.insertBefore(battleStore, 1, newRecord);

  assert.equal(battleStore.records.length, 3);
  assert.equal(battleStore.records[0].turnId, 1);
  assert.equal(battleStore.records[0].turnType, 'extra');
  assert.equal(battleStore.records[1].turnId, 2);
  assert.equal(battleStore.records[1].turnType, 'normal');
});

test('insertBefore throws when target turnId does not exist', () => {
  let battleStore = createBattleRecordStore();
  battleStore = RecordEditor.upsertRecord(battleStore, makeSimpleRecord(1, 'normal', 1, 'T1'));

  assert.throws(
    () => RecordEditor.insertBefore(battleStore, 999, makeSimpleRecord(999, 'extra', 1, 'EX')),
    /Target turnId not found/
  );
});

// A群: cascade 削除テスト
test('deleteRecord with cascade removes linked od and extra records sharing the same turnIndex', () => {
  let battleStore = createBattleRecordStore();
  battleStore = RecordEditor.upsertRecord(battleStore, makeSimpleRecord(1, 'normal', 1, 'T1'));
  battleStore = RecordEditor.upsertRecord(battleStore, makeSimpleRecord(2, 'od', 1, 'OD1'));
  battleStore = RecordEditor.upsertRecord(battleStore, makeSimpleRecord(3, 'extra', 1, 'EX'));
  battleStore = RecordEditor.upsertRecord(battleStore, makeSimpleRecord(4, 'normal', 2, 'T2'));

  assert.equal(battleStore.records.length, 4);

  // OD を cascade 削除 → 同じ turnIndex=1 の normal・extra も消える
  battleStore = RecordEditor.deleteRecord(battleStore, 2, { cascade: true });

  assert.equal(battleStore.records.length, 1);
  assert.equal(battleStore.records[0].turnType, 'normal');
  assert.equal(battleStore.records[0].turnLabel, 'T1');
});

// A群: reindexTurnLabels 混在テスト
test('reindexTurnLabels produces correct labels for normal/od/extra/normal/od sequence', () => {
  let battleStore = createBattleRecordStore();
  battleStore = RecordEditor.upsertRecord(battleStore, makeSimpleRecord(1, 'normal', 0, ''));
  battleStore = RecordEditor.upsertRecord(battleStore, makeSimpleRecord(2, 'od', 0, ''));
  battleStore = RecordEditor.upsertRecord(battleStore, makeSimpleRecord(3, 'extra', 0, ''));
  battleStore = RecordEditor.upsertRecord(battleStore, makeSimpleRecord(4, 'normal', 0, ''));
  battleStore = RecordEditor.upsertRecord(battleStore, makeSimpleRecord(5, 'od', 0, ''));

  battleStore = RecordEditor.reindexTurnLabels(battleStore);

  const labels = battleStore.records.map((r) => r.turnLabel);
  assert.deepEqual(labels, ['T1', 'OD1', 'EX', 'T2', 'OD1']);

  const turnIndexes = battleStore.records.map((r) => r.turnIndex);
  assert.deepEqual(turnIndexes, [1, 1, 1, 2, 2]);
});

// A群: 0件レコードCSV出力
test('csv exporter with empty record store outputs header line only', () => {
  const store = getStore();
  const styleIds = getSixUsableStyleIds(store);
  const party = store.buildPartyFromStyleIds(styleIds, { initialSP: 10 });
  const state = createBattleStateFromParty(party);

  const emptyStore = createBattleRecordStore();
  const csv = CsvExporter.exportToCSV(emptyStore, state.initialParty);

  const rows = csv.trim().split('\n').filter((r) => r.trim() !== '');
  assert.equal(rows.length, 1, 'should have header row only');
  assert.ok(rows[0].includes('seq,turn'), 'header should include fixed columns');
  const firstName = state.initialParty.find((p) => p.partyIndex === 0).characterName;
  assert.ok(rows[0].includes(`${firstName}_startSP`), 'header should include character columns');
});

// B群: swap後もCSV列が初期パーティーインデックス固定
test('csv column order stays fixed by initial partyIndex after party swap', () => {
  const store = getStore();
  const styleIds = getSixUsableStyleIds(store);
  const party = store.buildPartyFromStyleIds(styleIds, { initialSP: 10 });

  // partyIndex=0 と partyIndex=3 のキャラクター名を記録しておく（swap 前）
  const nameAtPartyIndex0 = party.members.find((m) => m.partyIndex === 0).characterName;
  const nameAtPartyIndex3 = party.members.find((m) => m.partyIndex === 3).characterName;

  // swap position 0 ↔ position 3（party オブジェクトに対して呼ぶ）
  party.swap(0, 3);

  // swap 後に state を作成 → initialParty は partyIndex 順でスナップショットされる
  const state = createBattleStateFromParty(party);

  // swap後の前衛（position < 3）でアクションを組み立てる
  const frontActions = Object.fromEntries(
    state.party
      .filter((m) => m.position < 3)
      .map((m) => [String(m.position), { characterId: m.characterId, skillId: m.skills[0].skillId }])
  );
  const preview = previewTurn(state, frontActions);
  const { committedRecord } = commitTurn(state, preview);

  let battleStore = createBattleRecordStore();
  battleStore = RecordEditor.upsertRecord(battleStore, committedRecord);

  const csv = CsvExporter.exportToCSV(battleStore, state.initialParty);
  const header = csv.split('\n')[0].split(',');

  const idx0Col = header.indexOf(`${nameAtPartyIndex0}_startSP`);
  const idx3Col = header.indexOf(`${nameAtPartyIndex3}_startSP`);

  assert.ok(idx0Col >= 0, 'partyIndex=0 character column must exist');
  assert.ok(idx3Col >= 0, 'partyIndex=3 character column must exist');
  assert.ok(idx0Col < idx3Col, 'partyIndex=0 column must appear before partyIndex=3 column');
});

// B群: Infinity値のJSON出力→文字列'Infinity'確認と数値復元
test('json exporter serializes Infinity eventCeiling as string and it restores to numeric Infinity', () => {
  const store = getStore();
  const styleIds = getSixUsableStyleIds(store);
  const party = store.buildPartyFromStyleIds(styleIds, { initialSP: 10 });
  const state = createBattleStateFromParty(party);

  // state.party は配列なので position で絞り込む
  const frontlineMember = state.party.find((m) => m.position === 0);
  const preview = previewTurn(state, {
    0: { characterId: frontlineMember.characterId, skillId: frontlineMember.skills[0].skillId },
  });
  const { committedRecord } = commitTurn(state, preview);

  let battleStore = createBattleRecordStore();
  battleStore = RecordEditor.upsertRecord(battleStore, committedRecord);
  const payload = JSON.parse(JsonExporter.exportToJSON(battleStore, {}));

  const eventCeiling = payload.recordStore.records[0].actions[0].spChanges[0].eventCeiling;
  assert.equal(eventCeiling, 'Infinity', 'exported value must be the string "Infinity"');
  assert.equal(Number(eventCeiling), Number.POSITIVE_INFINITY, 'string "Infinity" must convert back to numeric Infinity');
});

test('csv action cell shows SP 0 for Tezuka skills during reinforced mode', () => {
  const members = Array.from({ length: 6 }, (_, idx) =>
    new CharacterStyle({
      characterId: idx === 0 ? 'STezuka' : `TZ${idx + 1}`,
      characterName: idx === 0 ? '手塚 咲' : `TZ${idx + 1}`,
      styleId: idx + 1,
      styleName: `TZS${idx + 1}`,
      partyIndex: idx,
      position: idx,
      initialSP: 10,
      skills: [
        idx === 0
          ? {
              id: 46041403,
              name: '天駆の鉄槌',
              label: 'STezukaSkill03',
              sp_cost: 7,
              consume_type: 'Sp',
              hit_count: 1,
              target_type: 'All',
              parts: [{ skill_type: 'AttackSkill', target_type: 'All' }],
            }
          : {
              id: 46050000 + idx,
              name: 'Normal',
              label: `TZSkill${idx + 1}`,
              sp_cost: 0,
              consume_type: 'Sp',
              parts: [],
            },
      ],
    })
  );

  const party = new Party(members);
  const tezuka = party.members.find((m) => m.characterId === 'STezuka');
  tezuka.activateReinforcedMode(3);
  const state = createBattleStateFromParty(party);
  const preview = previewTurn(state, {
    0: { characterId: 'STezuka', skillId: 46041403 },
  });
  const { committedRecord } = commitTurn(state, preview);
  const store = RecordEditor.upsertRecord(createBattleRecordStore(), committedRecord);
  const csv = CsvExporter.exportToCSV(store, state.initialParty);

  assert.ok(csv.includes('天駆の鉄槌 (SP 0) [All,4hit (1+3)]'));
});
