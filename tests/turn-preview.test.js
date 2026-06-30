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

function buildIntervalMember() {
  return new CharacterStyle({
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
}

// interval_turn=3: スキル使用ターンはCT減算対象外。使用後3ターン経過で再使用可能。
test('interval_turn blocks reuse until 3 active turns have elapsed after use (use turn not counted)', () => {
  const member = buildIntervalMember();
  let state = createBattleStateFromParty(
    new Party([member, buildProtectionMember(1, 9920), buildProtectionMember(2, 9920)])
  );
  const action = (skillId) => ({
    0: { characterId: 'INTERVAL', skillId },
  });

  // T1: 使用 → CT=3がセットされるが使用ターン自体はカウントしない
  state = commitTurn(state, previewTurn(state, action(991001))).nextState;
  assert.equal(state.party[0].getSkillLastUsedTurnByLabel('RKayamoriSkill11'), 1);
  assert.equal(state.party[0].getSkillCooldownRemainingByLabel('RKayamoriSkill11'), 3, 'T2開始時: 残り3');
  assert.throws(() => previewTurn(state, action(991001)), /interval_turn 3/);

  // T2: 経過1 → CT=2
  state = commitTurn(state, previewTurn(state, action(991002))).nextState;
  assert.equal(state.party[0].getSkillCooldownRemainingByLabel('RKayamoriSkill11'), 2, 'T3開始時: 残り2');
  assert.throws(() => previewTurn(state, action(991001)), /interval_turn 3/);

  // T3: 経過2 → CT=1
  state = commitTurn(state, previewTurn(state, action(991002))).nextState;
  assert.equal(state.party[0].getSkillCooldownRemainingByLabel('RKayamoriSkill11'), 1, 'T4開始時: 残り1');
  assert.throws(() => previewTurn(state, action(991001)), /interval_turn 3/);

  // T4: 経過3 → CT=0
  state = commitTurn(state, previewTurn(state, action(991002))).nextState;
  assert.equal(state.turnState.turnIndex, 5);
  assert.equal(state.party[0].getSkillCooldownRemainingByLabel('RKayamoriSkill11'), 0, 'T5開始時: 残り0');
  assert.doesNotThrow(() => previewTurn(state, action(991001)));
});

// extraターンで自身が対象外の場合、そのextraターンへの移行時にCTが減算されない
// （CTはバフ/デバフと同様に「次ターン開始コンテキスト」で減算: 次ターンがextra(自身除外)なら減算なし）
test('interval_turn is not decremented at transitions into extra turns where the character is not allowed', () => {
  // PROTECTION1 がextraターンを自身に付与するスキルを持つ
  const protection1WithExtraGrant = new CharacterStyle({
    characterId: 'PROTECTION1',
    characterName: 'Protection 1',
    styleId: 9930,
    styleName: 'Extra Grant Style',
    partyIndex: 1,
    position: 1,
    skills: [
      {
        id: 993001,
        label: 'Protection1Extra',
        name: 'ExtraGrant',
        sp_cost: 0,
        target_type: 'Self',
        parts: [{ skill_type: 'Protection', target_type: 'Self' }],
        // 自身に追加ターンを付与（extraターン中は発動しない）
        additionalTurnRule: {
          additionalTurnTargets: [{ targetType: 'Self', targetCondition: '' }],
        },
      },
    ],
    passives: [],
  });
  const member = buildIntervalMember();
  let state = createBattleStateFromParty(
    new Party([member, protection1WithExtraGrant, buildProtectionMember(2, 9920)])
  );

  // T1 (normal): INTERVAL がCTスキルを使用 + P1 がextra付与
  // → 次ターン(T2)がextraになる → T1終了時: T2コンテキスト(extra, P1のみ)でINTERVAL除外 → CT減算なし
  // ただしjustSetも同時に有効なので、どちらの理由でも減算はなし
  const t1Actions = {
    0: { characterId: 'INTERVAL', skillId: 991001 },
    1: { characterId: 'PROTECTION1', skillId: 993001 },
  };
  state = commitTurn(state, previewTurn(state, t1Actions)).nextState;
  assert.equal(state.turnState.turnType, 'extra', 'T2はextraターン(P1のextra付与が発動)');
  assert.equal(state.party[0].getSkillCooldownRemainingByLabel('RKayamoriSkill11'), 3, 'T2開始時CT=3(使用ターン・extra遷移どちらも減算なし)');

  // T2 (extra, P1のみ): P1が行動(extraターン内では追加付与は発動しない)
  // → 次ターン(T3)がnormalになる → T2終了時: T3コンテキスト(normal, 全員)でINTERVAL含む → CT: 3→2
  state = commitTurn(state, previewTurn(state, { 1: { characterId: 'PROTECTION1', skillId: 993001 } })).nextState;
  assert.equal(state.turnState.turnType, 'normal', 'T3はnormalターン(extra終了)');
  assert.equal(state.party[0].getSkillCooldownRemainingByLabel('RKayamoriSkill11'), 2, 'T3開始時CT=2(T3が全員activeなので減算)');

  // T3 (normal): INTERVAL が通常行動 + P1 がextra付与
  // → 次ターン(T4)がextraになる → T3終了時: T4コンテキスト(extra, P1のみ)でINTERVAL除外 → CT減算なし
  const t3Actions = {
    0: { characterId: 'INTERVAL', skillId: 991002 },
    1: { characterId: 'PROTECTION1', skillId: 993001 },
  };
  state = commitTurn(state, previewTurn(state, t3Actions)).nextState;
  assert.equal(state.turnState.turnType, 'extra', 'T4はextraターン(P1のextra付与が発動)');
  // ★ キーアサーション: P1のextraターンにINTERVALが含まれないため、T3→T4遷移でCT減算なし
  assert.equal(
    state.party[0].getSkillCooldownRemainingByLabel('RKayamoriSkill11'),
    2,
    'T4開始時CT=2(extraターン対象外のためT3終了時に減算なし)'
  );

  // T4 (extra, P1): P1行動 → T5がnormal → CT: 2→1
  state = commitTurn(state, previewTurn(state, { 1: { characterId: 'PROTECTION1', skillId: 993001 } })).nextState;
  assert.equal(state.party[0].getSkillCooldownRemainingByLabel('RKayamoriSkill11'), 1, 'T5開始時CT=1');

  // T5 (normal): INTERVAL + P1 extra付与 → T6がextra → CT減算なし
  state = commitTurn(state, previewTurn(state, t3Actions)).nextState;
  assert.equal(
    state.party[0].getSkillCooldownRemainingByLabel('RKayamoriSkill11'),
    1,
    'T6開始時CT=1(extraターン対象外のため減算なし)'
  );

  // T6 (extra, P1): P1行動 → T7がnormal → CT: 1→0
  state = commitTurn(state, previewTurn(state, { 1: { characterId: 'PROTECTION1', skillId: 993001 } })).nextState;
  assert.equal(state.party[0].getSkillCooldownRemainingByLabel('RKayamoriSkill11'), 0, 'T7開始時CT=0(使用可能)');
  assert.doesNotThrow(
    () => previewTurn(state, { 0: { characterId: 'INTERVAL', skillId: 991001 } }),
    'T7: CTスキル再使用可能'
  );
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
