import test from 'node:test';
import assert from 'node:assert/strict';
import {
  commitTurn,
  CharacterStyle,
  createBattleStateFromParty,
  createBattleRecordStore,
  Party,
  previewTurn,
  RecordEditor,
} from '../src/index.js';
import { getStore, getSixUsableStyleIds } from './helpers.js';

function buildProtectionMember(index, idBase) {
  return new CharacterStyle({
    characterId: `PROTECTION${index}`,
    characterName: `Protection ${index}`,
    styleId: idBase + index,
    styleName: `Protection Style ${index}`,
    partyIndex: index,
    position: index,
    skills: [
      {
        id: idBase * 10 + index,
        label: 'Protection',
        name: 'プロテクション',
        sp_cost: 0,
        target_type: 'Self',
        parts: [{ skill_type: 'Protection', target_type: 'Self' }],
      },
    ],
    passives: [],
  });
}

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

test('commitTurn keeps damageContext for damage actions even when OD gain is zero', () => {
  const members = Array.from({ length: 6 }, (_, index) =>
    new CharacterStyle({
      characterId: `DMG${index + 1}`,
      characterName: `DMG${index + 1}`,
      styleId: 9900 + index,
      styleName: `DMG${index + 1}`,
      partyIndex: index,
      position: index,
      initialSP: 10,
      weaponType: index === 0 ? 'Slash' : '',
      skills: [
        index === 0
          ? {
              id: 990001,
              name: 'Resisted Slash',
              label: 'Resisted',
              sp_cost: 0,
              target_type: 'EnemySingle',
              hit_count: 1,
              parts: [
                {
                  skill_type: 'AttackSkill',
                  target_type: 'EnemySingle',
                  type: 'Slash',
                  elements: ['Fire'],
                },
              ],
            }
          : {
              id: 990100 + index,
              name: 'Protection',
              label: 'Protection',
              sp_cost: 0,
              target_type: 'Self',
              parts: [{ skill_type: 'Protection', target_type: 'Self' }],
            },
      ],
      passives: [],
    })
  );
  const state = createBattleStateFromParty(new Party(members));
  state.turnState.enemyState.damageRatesByEnemy = {
    0: { Slash: 50, Fire: 100 },
  };

  const preview = previewTurn(state, {
    0: { characterId: 'DMG1', skillId: 990001, targetEnemyIndex: 0 },
  });
  const { committedRecord } = commitTurn(state, preview);
  const action = committedRecord.actions[0];

  assert.equal(action.odGaugeGain, 0);
  assert.ok(action.damageContext);
  assert.equal(action.damageContext.damageBreakdown.targetBreakdowns[0].targetEnemyIndex, 0);
  assert.equal(
    action.damageContext.damageBreakdown.targetBreakdowns[0].groups.find((group) => group.dataGroup === 'affinity').multiplier,
    0.5
  );
});

test('interval_turn blocks reuse until the configured turn difference elapses', () => {
  const member = new CharacterStyle({
    characterId: 'INTERVAL',
    characterName: 'Interval Tester',
    styleId: 9910,
    styleName: 'Interval Style',
    partyIndex: 0,
    position: 0,
    skills: [
      {
        id: 991001,
        label: 'RKayamoriSkill11',
        name: 'Interval Skill',
        sp_cost: 0,
        interval_turn: 3,
        target_type: 'Self',
        parts: [{ skill_type: 'Protection', target_type: 'Self' }],
      },
      {
        id: 991002,
        label: 'Protection',
        name: 'Protection',
        sp_cost: 0,
        target_type: 'Self',
        parts: [{ skill_type: 'Protection', target_type: 'Self' }],
      },
    ],
    passives: [],
  });
  let state = createBattleStateFromParty(
    new Party([member, buildProtectionMember(1, 9920), buildProtectionMember(2, 9920)])
  );
  const action = (skillId) => ({
    0: { characterId: 'INTERVAL', skillId },
  });

  state = commitTurn(state, previewTurn(state, action(991001))).nextState;
  assert.equal(state.party[0].getSkillLastUsedTurnByLabel('RKayamoriSkill11'), 1);
  assert.throws(() => previewTurn(state, action(991001)), /interval_turn 3/);

  state = commitTurn(state, previewTurn(state, action(991002))).nextState;
  assert.throws(() => previewTurn(state, action(991001)), /interval_turn 3/);

  state = commitTurn(state, previewTurn(state, action(991002))).nextState;
  assert.equal(state.turnState.turnIndex, 4);
  assert.doesNotThrow(() => previewTurn(state, action(991001)));
});

test('sp_cost_by_use_count resolves by prior uses and clamps to the final cost', () => {
  const member = new CharacterStyle({
    characterId: 'CATHY',
    characterName: 'Cathy',
    styleId: 9911,
    styleName: 'Cost Style',
    partyIndex: 0,
    position: 0,
    initialSP: 100,
    skills: [
      {
        id: 991101,
        label: 'CathyCSkill51',
        name: 'カラスの鳴き声で',
        sp_cost: 8,
        sp_cost_by_use_count: [8, 12, 16, 20],
        target_type: 'Self',
        parts: [{ skill_type: 'Protection', target_type: 'Self' }],
      },
    ],
    passives: [],
  });
  let state = createBattleStateFromParty(
    new Party([member, buildProtectionMember(1, 9930), buildProtectionMember(2, 9930)])
  );
  const resolvedCosts = [];

  for (let useIndex = 0; useIndex < 5; useIndex += 1) {
    const preview = previewTurn(state, {
      0: { characterId: 'CATHY', skillId: 991101 },
    });
    resolvedCosts.push(preview.actions[0].startSP - preview.actions[0].endSP);
    state = commitTurn(state, preview).nextState;
  }

  assert.deepEqual(resolvedCosts, [8, 12, 16, 20, 20]);
  assert.equal(state.party[0].getSkillUseCountByLabel('CathyCSkill51'), 5);
});

test('real skill metadata is normalized for all interval and use-count cost skills', () => {
  const store = getStore();
  const intervalLabels = [
    'RKayamoriSkill11',
    'EAoiSkill08',
    'KMaruyamaSkill53',
    'KMaruyamaSkill08',
    'KMaruyamaSkill09',
  ];
  const labels = [...intervalLabels, 'CathyCSkill51'];
  const rawSkills = labels.map((label) => store.skills.find((skill) => skill.label === label));
  assert.equal(rawSkills.every(Boolean), true);

  const member = new CharacterStyle({
    characterId: 'REAL_METADATA',
    characterName: 'Real Metadata',
    styleId: 9912,
    styleName: 'Real Metadata Style',
    partyIndex: 0,
    position: 0,
    skills: rawSkills,
    passives: [],
  });

  for (const label of intervalLabels) {
    assert.equal(member.skills.find((skill) => skill.label === label)?.intervalTurn, 3, label);
  }
  assert.deepEqual(
    member.skills.find((skill) => skill.label === 'CathyCSkill51')?.spCostByUseCount,
    [8, 12, 16, 20]
  );
});
