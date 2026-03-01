import test from 'node:test';
import assert from 'node:assert/strict';
import {
  activateOverdrive,
  CharacterStyle,
  commitTurn,
  createBattleStateFromParty,
  grantExtraTurn,
  Party,
  previewTurn,
} from '../src/index.js';
import { getStore, getSixUsableStyleIds } from './helpers.js';

function buildActionDict(party) {
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

test('od state transitions to normal after remaining actions consumed', () => {
  const store = getStore();
  const styleIds = getSixUsableStyleIds(store);
  const party = store.buildPartyFromStyleIds(styleIds, { initialSP: 10 });

  let state = createBattleStateFromParty(party);
  state = activateOverdrive(state, 1, 'preemptive');

  assert.equal(state.turnState.turnType, 'od');
  assert.equal(state.turnState.remainingOdActions, 1);

  const preview = previewTurn(state, buildActionDict(party));
  const { nextState } = commitTurn(state, preview);

  assert.equal(nextState.turnState.turnType, 'normal');
  assert.equal(nextState.turnState.turnIndex, 2);
});

test('extra turn can be granted and consumed', () => {
  const store = getStore();
  const styleIds = getSixUsableStyleIds(store);
  const party = store.buildPartyFromStyleIds(styleIds, { initialSP: 10 });

  let state = createBattleStateFromParty(party);
  const allowed = [party.getByPosition(0).characterId];
  state = grantExtraTurn(state, allowed);

  assert.equal(state.turnState.turnType, 'extra');
  assert.equal(state.turnState.extraTurnState.active, true);
  assert.equal(
    state.party.filter((m) => m.isExtraActive).map((m) => m.characterId).join(','),
    allowed.join(','),
    'only granted member should be marked as extra-active'
  );

  const preview = previewTurn(state, {
    0: {
      characterId: party.getByPosition(0).characterId,
      skillId: party.getByPosition(0).skills[0].skillId,
    },
  });

  const { nextState } = commitTurn(state, preview);
  assert.equal(nextState.turnState.turnType, 'normal');
  assert.equal(nextState.turnState.turnIndex, 2);
  assert.equal(
    nextState.party.some((m) => m.isExtraActive),
    false,
    'extra-active flags should be cleared after extra turn finishes'
  );
});

function createManualExtraTurnParty() {
  const members = Array.from({ length: 6 }, (_, idx) => {
    const characterId = `C${idx + 1}`;
    const extraRule =
      idx === 0
        ? {
            skillUsableInExtraTurn: true,
            additionalTurnGrantInExtraTurn: true,
            conditions: {
              requiresOverDrive: false,
              requiresReinforcedMode: false,
              excludesExtraTurnForSkillUse: false,
              excludesExtraTurnForAdditionalTurnGrant: false,
            },
            additionalTurnTargetTypes: ['AllyFront'],
          }
        : null;

    return new CharacterStyle({
      characterId,
      characterName: characterId,
      styleId: idx + 1,
      styleName: `S${idx + 1}`,
      partyIndex: idx,
      position: idx,
      initialSP: 10,
      skills: [
        {
          id: 9000 + idx,
          name: idx === 0 ? 'Grant Front Extra' : 'Normal',
          sp_cost: 0,
          additionalTurnRule: extraRule,
          parts: extraRule ? [{ skill_type: 'AdditionalTurn', target_type: 'AllyFront' }] : [],
        },
      ],
    });
  });

  return new Party(members);
}

test('commitTurn grants extra turn and marks allowed members as extra-active', () => {
  const party = createManualExtraTurnParty();
  const state = createBattleStateFromParty(party);

  const preview = previewTurn(state, {
    0: { characterId: 'C1', skillId: 9000 },
    1: { characterId: 'C2', skillId: 9001 },
    2: { characterId: 'C3', skillId: 9002 },
  });
  const { nextState } = commitTurn(state, preview);

  assert.equal(nextState.turnState.turnType, 'extra');
  assert.deepEqual(
    nextState.turnState.extraTurnState?.allowedCharacterIds,
    ['C1', 'C2', 'C3'],
    'AllyFront grant should mark current frontline members'
  );
  assert.deepEqual(
    nextState.party
      .filter((m) => m.isExtraActive)
      .map((m) => m.characterId)
      .sort(),
    ['C1', 'C2', 'C3']
  );
});

test('extra turn disallows non-allowed members from acting', () => {
  const party = createManualExtraTurnParty();
  let state = createBattleStateFromParty(party);
  state = grantExtraTurn(state, ['C1']);

  assert.throws(
    () =>
      previewTurn(state, {
        1: { characterId: 'C2', skillId: 9001 },
      }),
    /not allowed to act in extra turn/
  );
});

test('Nanase supports parallel SP/EP and EP ceiling changes in OD', () => {
  const store = getStore();
  const nanaseStyleId = 1010204; // 約束は暁の彼方で (Admiral)
  const others = getSixUsableStyleIds(store).filter((id) => store.getStyleById(id)?.chara_label !== 'NNanase');
  const styleIds = [nanaseStyleId, ...others.slice(0, 5)];
  const party = store.buildPartyFromStyleIds(styleIds, { initialSP: 10 });

  let state = createBattleStateFromParty(party);
  const nanase = state.party.find((m) => m.characterId === 'NNanase');
  assert.ok(nanase);
  assert.equal(nanase.ep.current, 0);
  assert.equal(nanase.ep.max, 10);

  // 宿る想い (SP消費 + HealEp)
  const action = {
    [String(nanase.position)]: {
      characterId: nanase.characterId,
      skillId: 46041501,
    },
  };

  const preview = previewTurn(state, action);
  assert.equal(preview.actions[0].startEP, 0);
  assert.equal(preview.actions[0].endEP, 0, '宿る想いはEP消費ではない');
  const { nextState } = commitTurn(state, preview);
  const after = nextState.party.find((m) => m.characterId === 'NNanase');
  assert.equal(after.ep.current, 4, 'HealEp +3 and Admiral turn gain +1');

  // OD発動時の+5 and 上限20
  state = activateOverdrive(nextState, 1, 'preemptive');
  const odNanase = state.party.find((m) => m.characterId === 'NNanase');
  assert.equal(odNanase.ep.current, 9);

  // OD中はEP上限20として扱われるため、10を超えて増加できる
  const odPreview = previewTurn(state, {
    [String(odNanase.position)]: {
      characterId: odNanase.characterId,
      skillId: 46041501,
    },
  });
  const odCommitted = commitTurn(state, odPreview);
  const odAfter = odCommitted.nextState.party.find((m) => m.characterId === 'NNanase');
  assert.equal(odAfter.ep.current > 10, true, 'OD中はEP上限20として10超過が可能');
});

test('Nanase Rider uses external EP rule while Admiral uses passive-derived EP rule', () => {
  const store = getStore();
  const riderOnly = [1010203, ...getSixUsableStyleIds(store).filter((id) => store.getStyleById(id)?.chara_label !== 'NNanase').slice(0, 5)];
  let riderState = createBattleStateFromParty(store.buildPartyFromStyleIds(riderOnly, { initialSP: 10 }));
  const riderNanase = riderState.party.find((m) => m.characterId === 'NNanase');
  assert.equal(riderNanase.epRule?.turnStartEpDelta, 2);
  const riderPreview = previewTurn(riderState, {
    [String(riderNanase.position)]: { characterId: riderNanase.characterId, skillId: riderNanase.getActionSkills()[0].skillId },
  });
  const riderCommitted = commitTurn(riderState, riderPreview);
  const riderAfter = riderCommitted.nextState.party.find((m) => m.characterId === 'NNanase');
  assert.ok(riderAfter.ep.current >= 2, 'Rider turn-start EP gain should come from override rule');

  const admiralOnly = [1010204, ...getSixUsableStyleIds(store).filter((id) => store.getStyleById(id)?.chara_label !== 'NNanase').slice(0, 5)];
  const admiralState = createBattleStateFromParty(store.buildPartyFromStyleIds(admiralOnly, { initialSP: 10 }));
  const admiralNanase = admiralState.party.find((m) => m.characterId === 'NNanase');
  assert.equal(admiralNanase.epRule, null);
  const preview = previewTurn(admiralState, {
    [String(admiralNanase.position)]: { characterId: admiralNanase.characterId, skillId: 46041501 },
  });
  const committed = commitTurn(admiralState, preview);
  const admiralAfter = committed.nextState.party.find((m) => m.characterId === 'NNanase');
  assert.equal(admiralAfter.ep.current, 4, 'Admiral EP+1 should be from passive skill + HealEp3 from 宿る想い');
});

test('normal attack guarantees minimum 7.5% OD gain even when hit count is below 3', () => {
  const members = Array.from({ length: 6 }, (_, idx) =>
    new CharacterStyle({
      characterId: `N${idx + 1}`,
      characterName: `N${idx + 1}`,
      styleId: idx + 1,
      styleName: `S${idx + 1}`,
      partyIndex: idx,
      position: idx,
      initialSP: 10,
      skills: [
        {
          id: 9100 + idx,
          label: `N${idx + 1}AttackNormal`,
          name: '通常攻撃',
          sp_cost: 0,
          hit_count: 1,
          parts: [{ skill_type: 'AttackSkill', target_type: 'Single' }],
        },
      ],
    })
  );
  const party = new Party(members);
  const state = createBattleStateFromParty(party);
  const preview = previewTurn(state, {
    0: { characterId: 'N1', skillId: 9100 },
  });
  const { nextState } = commitTurn(state, preview);

  assert.equal(nextState.turnState.odGauge, 7.5);
});

test('skill attack increases OD gauge by hit_count * 2.5%', () => {
  const members = Array.from({ length: 6 }, (_, idx) =>
    new CharacterStyle({
      characterId: `A${idx + 1}`,
      characterName: `A${idx + 1}`,
      styleId: idx + 1,
      styleName: `S${idx + 1}`,
      partyIndex: idx,
      position: idx,
      initialSP: 10,
      skills: [
        {
          id: 9200 + idx,
          name: idx === 0 ? 'Hit5 Attack' : 'Buff',
          sp_cost: 1,
          hit_count: idx === 0 ? 5 : 0,
          parts:
            idx === 0
              ? [{ skill_type: 'AttackSkill', target_type: 'Single' }]
              : [{ skill_type: 'AttackUp', target_type: 'Self' }],
        },
      ],
    })
  );
  const party = new Party(members);
  const state = createBattleStateFromParty(party);
  const preview = previewTurn(state, {
    0: { characterId: 'A1', skillId: 9200 },
    1: { characterId: 'A2', skillId: 9201 },
  });
  const { nextState } = commitTurn(state, preview);

  assert.equal(nextState.turnState.odGauge, 12.5);
});

test('non-damaging debuff skill with hit_count does not increase OD gauge', () => {
  const members = Array.from({ length: 6 }, (_, idx) =>
    new CharacterStyle({
      characterId: `D${idx + 1}`,
      characterName: `D${idx + 1}`,
      styleId: idx + 1,
      styleName: `S${idx + 1}`,
      partyIndex: idx,
      position: idx,
      initialSP: 10,
      skills: [
        {
          id: 9300 + idx,
          name: idx === 0 ? 'Weaken-like' : 'Normal',
          sp_cost: 1,
          hit_count: 1,
          parts:
            idx === 0
              ? [
                  { skill_type: 'AttackDown', target_type: 'Single' },
                  { skill_type: 'RemoveBuff', target_type: 'Single' },
                ]
              : [{ skill_type: 'AttackSkill', target_type: 'Single' }],
        },
      ],
    })
  );
  const party = new Party(members);
  const state = createBattleStateFromParty(party);
  const preview = previewTurn(state, {
    0: { characterId: 'D1', skillId: 9300 },
  });
  const { nextState } = commitTurn(state, preview);

  assert.equal(nextState.turnState.odGauge, 0);
});

test('non-damaging skill-switch with hit_count does not increase OD gauge', () => {
  const members = Array.from({ length: 6 }, (_, idx) =>
    new CharacterStyle({
      characterId: `S${idx + 1}`,
      characterName: `S${idx + 1}`,
      styleId: idx + 1,
      styleName: `Style${idx + 1}`,
      partyIndex: idx,
      position: idx,
      initialSP: 10,
      skills: [
        {
          id: 9400 + idx,
          name: idx === 0 ? 'Aoharu-like' : 'Normal',
          sp_cost: 1,
          hit_count: 1,
          parts:
            idx === 0
              ? [
                  {
                    skill_type: 'SkillSwitch',
                    target_type: 'All',
                    strval: [
                      {
                        id: 994001,
                        name: 'Branch A',
                        hit_count: 1,
                        parts: [{ skill_type: 'AttackUp', target_type: 'AllyAll' }],
                      },
                      {
                        id: 994002,
                        name: 'Branch B',
                        hit_count: 1,
                        parts: [{ skill_type: 'CriticalRateUp', target_type: 'AllyAll' }],
                      },
                    ],
                  },
                ]
              : [{ skill_type: 'AttackSkill', target_type: 'Single' }],
        },
      ],
    })
  );
  const party = new Party(members);
  const state = createBattleStateFromParty(party);
  const preview = previewTurn(state, {
    0: { characterId: 'S1', skillId: 9400 },
  });
  const { nextState } = commitTurn(state, preview);

  assert.equal(nextState.turnState.odGauge, 0);
});

test('all-target attack scales OD gain by enemy count', () => {
  const members = Array.from({ length: 6 }, (_, idx) =>
    new CharacterStyle({
      characterId: `E${idx + 1}`,
      characterName: `E${idx + 1}`,
      styleId: idx + 1,
      styleName: `S${idx + 1}`,
      partyIndex: idx,
      position: idx,
      initialSP: 10,
      skills: [
        {
          id: 9500 + idx,
          name: idx === 0 ? 'AoE Attack' : 'Normal',
          sp_cost: 1,
          hit_count: 2,
          target_type: idx === 0 ? 'All' : 'Single',
          parts: [{ skill_type: 'AttackSkill', target_type: idx === 0 ? 'All' : 'Single' }],
        },
      ],
    })
  );
  const party = new Party(members);
  const state = createBattleStateFromParty(party);
  const preview = previewTurn(
    state,
    {
      0: { characterId: 'E1', skillId: 9500 },
    },
    null,
    3
  );
  const { nextState } = commitTurn(state, preview);

  assert.equal(nextState.turnState.odGauge, 15, '2 hits * 3 enemies * 2.5%');
});

test('single-target attack does not scale OD gain by enemy count', () => {
  const members = Array.from({ length: 6 }, (_, idx) =>
    new CharacterStyle({
      characterId: `F${idx + 1}`,
      characterName: `F${idx + 1}`,
      styleId: idx + 1,
      styleName: `S${idx + 1}`,
      partyIndex: idx,
      position: idx,
      initialSP: 10,
      skills: [
        {
          id: 9600 + idx,
          name: idx === 0 ? 'Single Attack' : 'Normal',
          sp_cost: 1,
          hit_count: 2,
          target_type: 'Single',
          parts: [{ skill_type: 'AttackSkill', target_type: 'Single' }],
        },
      ],
    })
  );
  const party = new Party(members);
  const state = createBattleStateFromParty(party);
  const preview = previewTurn(
    state,
    {
      0: { characterId: 'F1', skillId: 9600 },
    },
    null,
    3
  );
  const { nextState } = commitTurn(state, preview);

  assert.equal(nextState.turnState.odGauge, 5, 'single-target remains 2 hits * 2.5%');
});

test('manual-compare case: Ruka Thunder Pulse vs 3 enemies with Drive Pierce 15% for 10 turns', () => {
  const store = getStore();
  const rukaStyleId = 1001107; // ナイトクルーズ・エスコート (サンダーパルス所持)
  const others = getSixUsableStyleIds(store).filter((id) => store.getStyleById(id)?.chara_label !== 'RKayamori');
  const styleIds = [rukaStyleId, ...others.slice(0, 5)];
  const party = store.buildPartyFromStyleIds(styleIds, {
    initialSP: 10,
    drivePierceByPartyIndex: { 0: 15 },
  });
  let state = createBattleStateFromParty(party);
  const ruka = state.party.find((m) => m.characterId === 'RKayamori');
  assert.ok(ruka);

  const flooredByTurn = [];
  for (let i = 0; i < 10; i += 1) {
    const preview = previewTurn(
      state,
      {
        [String(ruka.position)]: {
          characterId: ruka.characterId,
          skillId: 46001111, // サンダーパルス (2hit, All)
        },
      },
      null,
      3
    );
    state = commitTurn(state, preview).nextState;
    flooredByTurn.push(Math.floor(state.turnState.odGauge));
  }

  // 仕様:
  // - ODゲージは小数第2位まで保持し、第3位以下を切り捨て
  // - 全体攻撃は敵1体ごとに計算した値を(小数第2位まで)合算
  // - サンダーパルス(2hit) + ドライブ15%(2hit=>+6.11%) の場合
  //   敵1体ぶん: trunc2(2 * 2.5 * 1.0611) = trunc2(5.3055) = 5.30
  //   敵3体合計: 15.90
  //   10ターン: 159.00
  assert.equal(state.turnState.odGauge, 159);
  assert.deepEqual(flooredByTurn.slice(0, 4), [15, 31, 47, 63]);
});
