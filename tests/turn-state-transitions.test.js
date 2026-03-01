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

function findStyleIdBySkillId(store, skillId) {
  for (const style of store.styles) {
    if (!Array.isArray(style.skills)) {
      continue;
    }
    if (style.skills.some((s) => Number(s.id ?? s.i) === Number(skillId))) {
      return Number(style.id);
    }
  }
  throw new Error(`style not found for skillId=${skillId}`);
}

test('preemptive od returns to same normal turn context after remaining actions consumed', () => {
  const store = getStore();
  const styleIds = getSixUsableStyleIds(store);
  const party = store.buildPartyFromStyleIds(styleIds, { initialSP: 10 });

  let state = createBattleStateFromParty(party);
  state.turnState.odGauge = 100;
  state = activateOverdrive(state, 1, 'preemptive');

  assert.equal(state.turnState.turnType, 'od');
  assert.equal(state.turnState.remainingOdActions, 1);

  const preview = previewTurn(state, buildActionDict(party));
  const { nextState } = commitTurn(state, preview);

  assert.equal(nextState.turnState.turnType, 'normal');
  assert.equal(nextState.turnState.turnIndex, 1);
});

test('activateOverdrive consumes gauge by level and rejects insufficient gauge unless forced', () => {
  const store = getStore();
  const styleIds = getSixUsableStyleIds(store);
  const party = store.buildPartyFromStyleIds(styleIds, { initialSP: 10 });
  let state = createBattleStateFromParty(party);

  state.turnState.odGauge = 250.5;
  state = activateOverdrive(state, 2, 'preemptive');
  assert.equal(state.turnState.turnType, 'od');
  assert.equal(state.turnState.odGauge, 50.5);

  const lowGaugeState = createBattleStateFromParty(party);
  lowGaugeState.turnState.odGauge = 80;
  assert.throws(() => activateOverdrive(lowGaugeState, 1, 'preemptive'), /requires 100% gauge/);

  const forcedState = activateOverdrive(lowGaugeState, 1, 'preemptive', { forceActivation: true });
  assert.equal(forcedState.turnState.turnType, 'od');
  assert.equal(forcedState.turnState.odGauge, 80);
});

test('commitTurn can activate interrupt OD after commit', () => {
  const store = getStore();
  const styleIds = getSixUsableStyleIds(store);
  const party = store.buildPartyFromStyleIds(styleIds, { initialSP: 10 });
  let state = createBattleStateFromParty(party);
  state.turnState.odGauge = 150;

  const preview = previewTurn(state, buildActionDict(party));
  const { nextState } = commitTurn(state, preview, [], { interruptOdLevel: 1 });

  assert.equal(nextState.turnState.turnType, 'od');
  assert.equal(nextState.turnState.odContext, 'interrupt');
  assert.equal(nextState.turnState.odGauge < 150, true, 'interrupt OD should consume 100% gauge');
  assert.equal(nextState.turnState.odGauge > 0, true, 'remaining gauge should stay positive in this case');
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
  nextState.turnState.odGauge = 100;
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

test('all-target attack with drive uses per-hit truncation before total hit multiplication', () => {
  const members = Array.from({ length: 6 }, (_, idx) =>
    new CharacterStyle({
      characterId: `H${idx + 1}`,
      characterName: `H${idx + 1}`,
      styleId: idx + 1,
      styleName: `S${idx + 1}`,
      partyIndex: idx,
      position: idx,
      initialSP: 20,
      drivePiercePercent: idx === 0 ? 15 : 0,
      skills: [
        {
          id: 9700 + idx,
          name: idx === 0 ? 'Hit12 AoE Attack' : 'Normal',
          sp_cost: 1,
          hit_count: 12,
          target_type: 'All',
          parts: [{ skill_type: 'AttackSkill', target_type: 'All' }],
        },
      ],
    })
  );
  const party = new Party(members);
  let state = createBattleStateFromParty(party);

  for (let i = 0; i < 2; i += 1) {
    const preview = previewTurn(
      state,
      {
        0: { characterId: 'H1', skillId: 9700 },
      },
      null,
      3
    );
    state = commitTurn(state, preview).nextState;
  }

  // per-hit truncation model:
  // bonus(hit=12, drive15)=15%
  // per-hit = trunc2(2.5 * 1.15) = 2.87
  // one action (12hit * 3targets) = trunc2(2.87 * 36) = 103.32
  // two actions = 206.64 -> floor 206
  assert.equal(Math.floor(state.turnState.odGauge), 206);
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
  // - 攻撃ぶんODは1hitごとに計算し、小数第2位で切り捨てて合算
  // - サンダーパルス(2hit) + ドライブ15%(2hit=>+6.11%) の場合
  //   敵1体ぶん: trunc2(2 * 2.5 * 1.0611) = trunc2(5.3055) = 5.30
  //   敵3体合計: 15.90
  //   10ターン: 159.00
  assert.equal(state.turnState.odGauge, 159);
  assert.deepEqual(flooredByTurn.slice(0, 4), [15, 31, 47, 63]);
});

test('AttackSkill + OverDrivePointUp applies drive bonus and max self-parameter assumption', () => {
  const store = getStore();
  const cases = [
    // 実機確認値: 渾身銃撃=18, 海のギャング=71, サービス・エース=21
    { skillId: 46004504, expected: 18, breakHitCount: 0 },
    { skillId: 46005605, expected: 71, breakHitCount: 0 },
    { skillId: 46005502, expected: 21, breakHitCount: 0 },
  ];

  for (const c of cases) {
    const styleId = findStyleIdBySkillId(store, c.skillId);
    const others = getSixUsableStyleIds(store).filter((id) => id !== styleId);
    const styleIds = [styleId, ...others.slice(0, 5)];
    const party = store.buildPartyFromStyleIds(styleIds, {
      initialSP: 20,
      drivePierceByPartyIndex: { 0: 15 },
    });
    const actor = party.getByPosition(0);
    const state = createBattleStateFromParty(party);

    const preview = previewTurn(state, {
      0: {
        characterId: actor.characterId,
        skillId: c.skillId,
        breakHitCount: c.breakHitCount,
      },
    });
    const { nextState } = commitTurn(state, preview);
    assert.equal(
      Math.floor(nextState.turnState.odGauge),
      c.expected,
      `skillId=${c.skillId} should match confirmed OD integer`
    );
  }
});

test('OverDrivePointUp condition BreakHitCount()>0 is evaluated from action context', () => {
  const store = getStore();
  const skillId = 46005507; // 哀のスノードロップ
  const styleId = findStyleIdBySkillId(store, skillId);
  const others = getSixUsableStyleIds(store).filter((id) => id !== styleId);
  const styleIds = [styleId, ...others.slice(0, 5)];
  const party = store.buildPartyFromStyleIds(styleIds, {
    initialSP: 20,
    drivePierceByPartyIndex: { 0: 15 },
  });
  const actor = party.getByPosition(0);

  // 非ブレイク時: 攻撃ぶんのみ
  let state = createBattleStateFromParty(party);
  let preview = previewTurn(state, {
    0: { characterId: actor.characterId, skillId, breakHitCount: 0 },
  });
  let committed = commitTurn(state, preview);
  assert.equal(Math.floor(committed.nextState.turnState.odGauge), 5);

  // ブレイク時: OverDrivePointUp(+150%)を追加
  state = createBattleStateFromParty(party);
  preview = previewTurn(state, {
    0: { characterId: actor.characterId, skillId, breakHitCount: 1 },
  });
  committed = commitTurn(state, preview);
  assert.equal(Math.floor(committed.nextState.turnState.odGauge), 164);
});

test('non-damaging OD gain skill applies drive bonus and first-use branching (Compensation)', () => {
  const store = getStore();
  const skillId = 46005308; // コンペンセーション
  const styleId = findStyleIdBySkillId(store, skillId);
  const others = getSixUsableStyleIds(store).filter((id) => id !== styleId);
  const styleIds = [styleId, ...others.slice(0, 5)];
  const party = store.buildPartyFromStyleIds(styleIds, {
    initialSP: 20,
    drivePierceByPartyIndex: { 0: 15 },
  });
  const actor = party.getByPosition(0);

  // 1回目: 75% に drive(1hit扱い=+5%) を適用 => 78.75
  let state = createBattleStateFromParty(party);
  let preview = previewTurn(state, {
    0: { characterId: actor.characterId, skillId },
  });
  let committed = commitTurn(state, preview);
  assert.equal(Math.floor(committed.nextState.turnState.odGauge), 78);

  // 2回目: 25% に drive(1hit扱い=+5%) を適用 => +26.25
  state = committed.nextState;
  preview = previewTurn(state, {
    0: { characterId: actor.characterId, skillId },
  });
  committed = commitTurn(state, preview);
  assert.ok(Math.abs(committed.nextState.turnState.odGauge - 105) < 0.01);
  assert.equal(Math.floor(committed.nextState.turnState.odGauge), 105);
});

test('od gauge is capped at 300%', () => {
  const members = Array.from({ length: 6 }, (_, idx) =>
    new CharacterStyle({
      characterId: `C${idx + 1}`,
      characterName: `C${idx + 1}`,
      styleId: idx + 1,
      styleName: `S${idx + 1}`,
      partyIndex: idx,
      position: idx,
      initialSP: 20,
      drivePiercePercent: idx === 0 ? 15 : 0,
      skills: [
        {
          id: 9800 + idx,
          name: idx === 0 ? 'Big AoE' : 'Normal',
          sp_cost: 1,
          hit_count: 12,
          target_type: 'All',
          parts: [{ skill_type: 'AttackSkill', target_type: idx === 0 ? 'All' : 'Single' }],
        },
      ],
    })
  );

  const party = new Party(members);
  let state = createBattleStateFromParty(party);
  state.turnState.odGauge = 299.5;
  const preview = previewTurn(
    state,
    {
      0: { characterId: 'C1', skillId: 9800 },
    },
    null,
    3
  );
  const { nextState } = commitTurn(state, preview);
  assert.equal(nextState.turnState.odGauge, 300);
});

test('OverDrivePointDown reduces od gauge and lower bound is -999', () => {
  const members = Array.from({ length: 6 }, (_, idx) =>
    new CharacterStyle({
      characterId: `D${idx + 1}`,
      characterName: `D${idx + 1}`,
      styleId: idx + 1,
      styleName: `S${idx + 1}`,
      partyIndex: idx,
      position: idx,
      initialSP: 20,
      skills: [
        {
          id: 9900 + idx,
          name: idx === 0 ? 'Spend OD 50' : 'Normal',
          sp_cost: 0,
          hit_count: -1,
          target_type: 'Self',
          parts:
            idx === 0
              ? [{ skill_type: 'OverDrivePointDown', target_type: 'Self', power: [0.5, 0] }]
              : [{ skill_type: 'AttackSkill', target_type: 'Single' }],
        },
      ],
    })
  );

  const party = new Party(members);
  let state = createBattleStateFromParty(party);
  state.turnState.odGauge = 40;
  let preview = previewTurn(state, {
    0: { characterId: 'D1', skillId: 9900 },
  });
  let committed = commitTurn(state, preview);
  assert.equal(committed.nextState.turnState.odGauge, -10);

  state = createBattleStateFromParty(party);
  state.turnState.odGauge = 184.7;
  preview = previewTurn(state, {
    0: { characterId: 'D1', skillId: 9900 },
  });
  committed = commitTurn(state, preview);
  assert.equal(committed.nextState.turnState.odGauge, 134.7);

  state = createBattleStateFromParty(party);
  state.turnState.odGauge = -990;
  preview = previewTurn(state, {
    0: { characterId: 'D1', skillId: 9900 },
  });
  committed = commitTurn(state, preview);
  assert.equal(committed.nextState.turnState.odGauge, -999);
});

test('skill with IsOverDrive() condition is unusable outside OD and usable in OD', () => {
  const members = Array.from({ length: 6 }, (_, idx) =>
    new CharacterStyle({
      characterId: `OD${idx + 1}`,
      characterName: `OD${idx + 1}`,
      styleId: idx + 1,
      styleName: `ODS${idx + 1}`,
      partyIndex: idx,
      position: idx,
      initialSP: 10,
      skills: [
        {
          id: 10000 + idx,
          name: 'OD Only Skill',
          label: `ODOnly${idx + 1}`,
          sp_cost: 0,
          cond: 'IsOverDrive()',
          parts: [],
        },
      ],
    })
  );
  const party = new Party(members);
  let state = createBattleStateFromParty(party);

  assert.throws(
    () =>
      previewTurn(state, {
        0: { characterId: 'OD1', skillId: 10000 },
      }),
    /cannot be used because cond is not satisfied/
  );

  state.turnState.odGauge = 100;
  state = activateOverdrive(state, 1, 'preemptive');
  const preview = previewTurn(state, {
    0: { characterId: 'OD1', skillId: 10000 },
  });
  assert.equal(preview.actions.length, 1);
});

test('skill with IsOverDrive()==0 is unusable in OD and usable outside OD', () => {
  const members = Array.from({ length: 6 }, (_, idx) =>
    new CharacterStyle({
      characterId: `ODZ${idx + 1}`,
      characterName: `ODZ${idx + 1}`,
      styleId: idx + 1,
      styleName: `ODZS${idx + 1}`,
      partyIndex: idx,
      position: idx,
      initialSP: 10,
      skills: [
        {
          id: 10200 + idx,
          name: 'OD Forbidden Skill',
          label: `ODForbidden${idx + 1}`,
          sp_cost: 0,
          cond: 'IsOverDrive()==0',
          parts: [],
        },
      ],
    })
  );
  const party = new Party(members);
  let state = createBattleStateFromParty(party);

  const normalPreview = previewTurn(state, {
    0: { characterId: 'ODZ1', skillId: 10200 },
  });
  assert.equal(normalPreview.actions.length, 1);

  state.turnState.odGauge = 100;
  state = activateOverdrive(state, 1, 'preemptive');
  assert.throws(
    () =>
      previewTurn(state, {
        0: { characterId: 'ODZ1', skillId: 10200 },
      }),
    /cannot be used because cond is not satisfied/
  );
});

test('skill with SpecialStatusCountByType(20)==0 is blocked during extra turn', () => {
  const members = Array.from({ length: 6 }, (_, idx) =>
    new CharacterStyle({
      characterId: `EX${idx + 1}`,
      characterName: `EX${idx + 1}`,
      styleId: idx + 1,
      styleName: `EXS${idx + 1}`,
      partyIndex: idx,
      position: idx,
      initialSP: 10,
      skills: [
        {
          id: 10100 + idx,
          name: 'No Extra Skill',
          label: `NoExtra${idx + 1}`,
          sp_cost: 0,
          cond: 'SpecialStatusCountByType(20)==0',
          parts: [],
        },
      ],
    })
  );
  const party = new Party(members);
  let state = createBattleStateFromParty(party);
  state = grantExtraTurn(state, ['EX1']);

  assert.throws(
    () =>
      previewTurn(state, {
        0: { characterId: 'EX1', skillId: 10100 },
      }),
    /cannot be used because cond is not satisfied/
  );
});

test('kishin state lasts 3 actionable turns then applies 1-turn action disable', () => {
  const members = Array.from({ length: 6 }, (_, idx) =>
    new CharacterStyle({
      characterId: idx === 0 ? 'STezuka' : `K${idx + 1}`,
      characterName: idx === 0 ? '手塚 咲' : `K${idx + 1}`,
      styleId: idx + 1,
      styleName: `KS${idx + 1}`,
      partyIndex: idx,
      position: idx,
      initialSP: 10,
      skills: [
        {
          id: 10300 + idx,
          name: idx === 0 ? '天駆の鉄槌' : 'Normal',
          label: idx === 0 ? 'STezukaSkill' : `KSkill${idx + 1}`,
          sp_cost: 1,
          parts: idx === 0 ? [{ skill_type: 'AttackSkill' }] : [],
        },
      ],
    })
  );
  const party = new Party(members);
  let state = createBattleStateFromParty(party);
  const tezuka = state.party.find((m) => m.characterId === 'STezuka');
  tezuka.activateReinforcedMode(3);

  for (let i = 0; i < 3; i += 1) {
    const preview = previewTurn(state, {
      0: { characterId: 'STezuka', skillId: 10300 },
      1: { characterId: 'K2', skillId: 10301 },
      2: { characterId: 'K3', skillId: 10302 },
    });
    state = commitTurn(state, preview).nextState;
  }

  const afterThree = state.party.find((m) => m.characterId === 'STezuka');
  assert.equal(afterThree.isReinforcedMode, false);
  assert.equal(afterThree.actionDisabledTurns, 1);
  const actionSkills = afterThree.getActionSkills();
  assert.equal(actionSkills.length, 1);
  assert.equal(actionSkills[0].skillId, 0);
  assert.equal(actionSkills[0].name, '行動なし');

  const previewDisabledTurn = previewTurn(state, {
    0: { characterId: 'STezuka', skillId: 0 },
    1: { characterId: 'K2', skillId: 10301 },
    2: { characterId: 'K3', skillId: 10302 },
  });
  state = commitTurn(state, previewDisabledTurn).nextState;
  const recovered = state.party.find((m) => m.characterId === 'STezuka');
  assert.equal(recovered.actionDisabledTurns, 0);
});
