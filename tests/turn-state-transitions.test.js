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

function createTranscendenceTestParty({ initialGaugePercent = null } = {}) {
  const members = Array.from({ length: 6 }, (_, idx) =>
    new CharacterStyle({
      characterId: `TC${idx + 1}`,
      characterName: `TC${idx + 1}`,
      styleId: idx + 1,
      styleName: `TS${idx + 1}`,
      role: idx === 0 ? 'Admiral' : 'Attacker',
      elements: idx <= 2 ? ['Ice'] : ['Fire'],
      transcendenceRule:
        idx === 0
          ? {
              styleId: 1,
              gaugeElement: 'Ice',
              initialGaugePercentPerMatchingElementMember: 15,
              gaugeGainPercentOnMatchingElementAction: 4,
              maxGaugePercent: 100,
              triggerOnReachMax: { odGaugeDeltaPercent: 100 },
            }
          : null,
      partyIndex: idx,
      position: idx,
      initialSP: 10,
      skills: [
        {
          id: 15000 + idx,
          name: 'Support',
          sp_cost: 0,
          parts: [{ skill_type: 'AttackUp', target_type: 'Self' }],
        },
      ],
    })
  );

  const party = new Party(members);
  const state = createBattleStateFromParty(party);
  if (initialGaugePercent !== null) {
    state.turnState.transcendence.gaugePercent = Number(initialGaugePercent);
  }
  return state;
}

test('transcendence gauge initializes by matching-element member count x 15%', () => {
  const state = createTranscendenceTestParty();
  assert.equal(state.turnState.transcendence?.active, true);
  assert.equal(state.turnState.transcendence?.gaugeElement, 'Ice');
  assert.equal(state.turnState.transcendence?.gaugePercent, 45);
});

test('transcendence gauge gains +4 per matching-element action and is capped at 100%', () => {
  let state = createTranscendenceTestParty({ initialGaugePercent: 96 });
  state.turnState.odGauge = 10;

  const preview = previewTurn(state, {
    0: { characterId: 'TC1', skillId: 15000 }, // Ice
    1: { characterId: 'TC2', skillId: 15001 }, // Ice
    2: { characterId: 'TC3', skillId: 15002 }, // Ice
  });
  assert.equal(preview.projections?.transcendence?.endGaugePercent, 100);
  assert.equal(preview.projections?.transcendence?.odGaugeBonusPercent, 100);

  const committed = commitTurn(state, preview);
  state = committed.nextState;
  assert.equal(state.turnState.transcendence?.gaugePercent, 100);
  assert.equal(state.turnState.odGauge, 110);

  // 2ターン目: すでに100%到達済みのため、OD+100は再発しない。
  const preview2 = previewTurn(state, {
    0: { characterId: 'TC1', skillId: 15000 },
    1: { characterId: 'TC2', skillId: 15001 },
    2: { characterId: 'TC3', skillId: 15002 },
  });
  const committed2 = commitTurn(state, preview2);
  assert.equal(committed2.nextState.turnState.odGauge, 110);
  assert.equal(committed2.nextState.turnState.transcendence?.gaugePercent, 100);
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

test('self-only additional turn in extra turn does not carry previous allowed members', () => {
  const members = Array.from({ length: 6 }, (_, idx) =>
    new CharacterStyle({
      characterId: `X${idx + 1}`,
      characterName: `X${idx + 1}`,
      styleId: idx + 1,
      styleName: `XS${idx + 1}`,
      partyIndex: idx,
      position: idx,
      initialSP: 10,
      skills: [
        {
          id: 11000 + idx,
          name: idx === 0 ? 'Self Extra' : 'Normal',
          sp_cost: 0,
          additionalTurnRule:
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
                  additionalTurnTargetTypes: ['Self'],
                }
              : null,
          parts: idx === 0 ? [{ skill_type: 'AdditionalTurn', target_type: 'Self' }] : [],
        },
      ],
    })
  );

  let state = createBattleStateFromParty(new Party(members));
  state = grantExtraTurn(state, ['X1', 'X2', 'X3']);

  const preview = previewTurn(state, {
    0: { characterId: 'X1', skillId: 11000 },
    1: { characterId: 'X2', skillId: 11001 },
    2: { characterId: 'X3', skillId: 11002 },
  });
  const { nextState } = commitTurn(state, preview);
  assert.equal(nextState.turnState.turnType, 'extra');
  assert.deepEqual(nextState.turnState.extraTurnState?.allowedCharacterIds, ['X1']);
});

test('additional turn AllySingleWithoutSelf respects selected targetCharacterId', () => {
  const members = Array.from({ length: 6 }, (_, idx) =>
    new CharacterStyle({
      characterId: `ATS${idx + 1}`,
      characterName: `ATS${idx + 1}`,
      styleId: idx + 1,
      styleName: `ATSS${idx + 1}`,
      partyIndex: idx,
      position: idx,
      initialSP: 10,
      skills: [
        {
          id: 54000 + idx,
          name: idx === 0 ? 'Single Extra' : 'Normal',
          sp_cost: 0,
          additionalTurnRule:
            idx === 0
              ? {
                  skillUsableInExtraTurn: true,
                  additionalTurnGrantInExtraTurn: true,
                  conditions: {
                    requiresOverDrive: false,
                    requiresReinforcedMode: false,
                  },
                  additionalTurnTargetTypes: ['AllySingleWithoutSelf'],
                }
              : null,
          parts:
            idx === 0
              ? [{ skill_type: 'AdditionalTurn', target_type: 'AllySingleWithoutSelf' }]
              : [],
        },
      ],
    })
  );

  const state = createBattleStateFromParty(new Party(members));
  const preview = previewTurn(state, {
    0: { characterId: 'ATS1', skillId: 54000, targetCharacterId: 'ATS3' },
    1: { characterId: 'ATS2', skillId: 54001 },
    2: { characterId: 'ATS3', skillId: 54002 },
  });
  const { nextState } = commitTurn(state, preview);

  assert.equal(nextState.turnState.turnType, 'extra');
  assert.deepEqual(nextState.turnState.extraTurnState?.allowedCharacterIds, ['ATS3']);
});

test('additional turn target_condition IsFront()==1 rejects backline target', () => {
  const members = Array.from({ length: 6 }, (_, idx) =>
    new CharacterStyle({
      characterId: `ATF${idx + 1}`,
      characterName: `ATF${idx + 1}`,
      styleId: idx + 1,
      styleName: `ATFS${idx + 1}`,
      partyIndex: idx,
      position: idx,
      initialSP: 10,
      skills: [
        {
          id: 54100 + idx,
          name: idx === 0 ? 'Front Only Extra' : 'Normal',
          sp_cost: 0,
          additionalTurnRule:
            idx === 0
              ? {
                  skillUsableInExtraTurn: true,
                  additionalTurnGrantInExtraTurn: true,
                  conditions: {
                    requiresOverDrive: false,
                    requiresReinforcedMode: false,
                  },
                  additionalTurnTargets: [
                    { targetType: 'AllySingleWithoutSelf', targetCondition: 'IsFront()==1' },
                  ],
                  additionalTurnTargetTypes: ['AllySingleWithoutSelf'],
                }
              : null,
          parts:
            idx === 0
              ? [{ skill_type: 'AdditionalTurn', target_type: 'AllySingleWithoutSelf', target_condition: 'IsFront()==1' }]
              : [],
        },
      ],
    })
  );

  const state = createBattleStateFromParty(new Party(members));
  const preview = previewTurn(state, {
    0: { characterId: 'ATF1', skillId: 54100, targetCharacterId: 'ATF5' },
    1: { characterId: 'ATF2', skillId: 54101 },
    2: { characterId: 'ATF3', skillId: 54102 },
  });
  const { nextState } = commitTurn(state, preview);

  assert.equal(nextState.turnState.turnType, 'normal');
  assert.equal(nextState.party.some((m) => m.isExtraActive), false);
});

test('OD turn resumes after extra turn (OD3-1 -> EX -> OD3-2)', () => {
  const members = Array.from({ length: 6 }, (_, idx) =>
    new CharacterStyle({
      characterId: `R${idx + 1}`,
      characterName: `R${idx + 1}`,
      styleId: idx + 1,
      styleName: `RS${idx + 1}`,
      partyIndex: idx,
      position: idx,
      initialSP: 10,
      skills: [
        {
          id: 12000 + idx,
          name: idx === 0 ? 'Grant Self Extra' : 'Normal',
          sp_cost: 0,
          additionalTurnRule:
            idx === 0
              ? {
                  skillUsableInExtraTurn: true,
                  additionalTurnGrantInExtraTurn: false,
                  conditions: {
                    requiresOverDrive: false,
                    requiresReinforcedMode: false,
                    excludesExtraTurnForSkillUse: false,
                    excludesExtraTurnForAdditionalTurnGrant: true,
                  },
                  additionalTurnTargetTypes: ['Self'],
                }
              : null,
          parts: idx === 0 ? [{ skill_type: 'AdditionalTurn', target_type: 'Self' }] : [],
        },
      ],
    })
  );

  let state = createBattleStateFromParty(new Party(members));
  state.turnState.odGauge = 300;
  state = activateOverdrive(state, 3, 'preemptive');
  assert.equal(state.turnState.turnLabel, 'OD3-1');

  // OD3-1 で追加ターン付与
  const previewOd = previewTurn(state, {
    0: { characterId: 'R1', skillId: 12000 },
    1: { characterId: 'R2', skillId: 12001 },
    2: { characterId: 'R3', skillId: 12002 },
  });
  state = commitTurn(state, previewOd).nextState;
  assert.equal(state.turnState.turnType, 'extra');
  assert.equal(state.turnState.odSuspended, true);
  assert.equal(state.turnState.remainingOdActions, 2);

  // EX終了後は OD3-2 へ復帰するべき
  const previewEx = previewTurn(state, {
    0: { characterId: 'R1', skillId: 12000 },
  });
  state = commitTurn(state, previewEx).nextState;
  assert.equal(state.turnState.turnType, 'od');
  assert.equal(state.turnState.turnLabel, 'OD3-2');
  assert.equal(state.turnState.remainingOdActions, 2);
  assert.equal(state.turnState.odSuspended, false);
});

test('OD SP recovery is granted once per OD activation (no repeated +20 on OD3-2 after EX)', () => {
  const members = Array.from({ length: 6 }, (_, idx) =>
    new CharacterStyle({
      characterId: `OR${idx + 1}`,
      characterName: `OR${idx + 1}`,
      styleId: idx + 1,
      styleName: `ORS${idx + 1}`,
      partyIndex: idx,
      position: idx,
      initialSP: 10,
      skills:
        idx === 0
          ? [
              {
                id: 12100,
                name: 'Grant Self Extra',
                sp_cost: 0,
                additionalTurnRule: {
                  skillUsableInExtraTurn: true,
                  additionalTurnGrantInExtraTurn: false,
                  conditions: {
                    requiresOverDrive: false,
                    requiresReinforcedMode: false,
                    excludesExtraTurnForSkillUse: false,
                    excludesExtraTurnForAdditionalTurnGrant: true,
                  },
                  additionalTurnTargetTypes: ['Self'],
                },
                parts: [{ skill_type: 'AdditionalTurn', target_type: 'Self' }],
              },
              {
                id: 12101,
                name: 'Normal',
                sp_cost: 0,
                parts: [{ skill_type: 'AttackSkill', target_type: 'Single' }],
              },
            ]
          : [{ id: 12110 + idx, name: 'Normal', sp_cost: 0, parts: [{ skill_type: 'AttackSkill' }] }],
    })
  );

  let state = createBattleStateFromParty(new Party(members));
  state.turnState.odGauge = 300;
  state = activateOverdrive(state, 3, 'preemptive');

  // OD3-1: +20 (OD) +2 (base) = +22
  let preview = previewTurn(state, {
    0: { characterId: 'OR1', skillId: 12100 },
    1: { characterId: 'OR2', skillId: 12111 },
    2: { characterId: 'OR3', skillId: 12112 },
  });
  state = commitTurn(state, preview).nextState;
  let actor = state.party.find((m) => m.characterId === 'OR1');
  assert.equal(actor.sp.current, 32);
  assert.equal(state.turnState.turnType, 'extra');

  // EX: base回復は freeze ルールで current(32) を維持（上乗せなし）
  preview = previewTurn(state, {
    0: { characterId: 'OR1', skillId: 12101 },
  });
  state = commitTurn(state, preview).nextState;
  actor = state.party.find((m) => m.characterId === 'OR1');
  assert.equal(actor.sp.current, 32);
  assert.equal(state.turnState.turnType, 'od');
  assert.equal(state.turnState.turnLabel, 'OD3-2');

  // OD3-2: OD回復(+20)は再発しない。SPは32維持。
  preview = previewTurn(state, {
    0: { characterId: 'OR1', skillId: 12101 },
    1: { characterId: 'OR2', skillId: 12111 },
    2: { characterId: 'OR3', skillId: 12112 },
  });
  state = commitTurn(state, preview).nextState;
  actor = state.party.find((m) => m.characterId === 'OR1');
  assert.equal(actor.sp.current, 32);
});

test('OD1 preemptive + single extra returns to T1 after extra ends', () => {
  const members = Array.from({ length: 6 }, (_, idx) =>
    new CharacterStyle({
      characterId: `O${idx + 1}`,
      characterName: `O${idx + 1}`,
      styleId: idx + 1,
      styleName: `OS${idx + 1}`,
      partyIndex: idx,
      position: idx,
      initialSP: 10,
      skills: [
        {
          id: 13000 + idx,
          name: idx === 0 ? 'Grant Self Extra Once' : 'Normal',
          sp_cost: 0,
          additionalTurnRule:
            idx === 0
              ? {
                  skillUsableInExtraTurn: true,
                  additionalTurnGrantInExtraTurn: false,
                  conditions: {
                    requiresOverDrive: false,
                    requiresReinforcedMode: false,
                    excludesExtraTurnForSkillUse: false,
                    excludesExtraTurnForAdditionalTurnGrant: true,
                  },
                  additionalTurnTargetTypes: ['Self'],
                }
              : null,
          parts: idx === 0 ? [{ skill_type: 'AdditionalTurn', target_type: 'Self' }] : [],
        },
      ],
    })
  );

  let state = createBattleStateFromParty(new Party(members));
  state.turnState.odGauge = 100;
  state = activateOverdrive(state, 1, 'preemptive');
  assert.equal(state.turnState.turnLabel, 'OD1-1');

  const odPreview = previewTurn(state, {
    0: { characterId: 'O1', skillId: 13000 },
    1: { characterId: 'O2', skillId: 13001 },
    2: { characterId: 'O3', skillId: 13002 },
  });
  let committed = commitTurn(state, odPreview);
  state = committed.nextState;
  assert.equal(state.turnState.turnType, 'extra');
  assert.equal(committed.committedRecord.odTurnLabelAtStart, 'OD1-1');

  const exPreview = previewTurn(state, {
    0: { characterId: 'O1', skillId: 13000 },
  });
  committed = commitTurn(state, exPreview);
  state = committed.nextState;
  assert.equal(committed.committedRecord.odTurnLabelAtStart, 'OD1-1');
  assert.equal(state.turnState.turnType, 'normal');
  assert.equal(state.turnState.turnLabel, 'T1');
  assert.equal(state.turnState.turnIndex, 1);
});

test('OD1 preemptive + chained extras returns to T1 after all extras end', () => {
  const members = Array.from({ length: 6 }, (_, idx) =>
    new CharacterStyle({
      characterId: `Z${idx + 1}`,
      characterName: `Z${idx + 1}`,
      styleId: idx + 1,
      styleName: `ZS${idx + 1}`,
      partyIndex: idx,
      position: idx,
      initialSP: 10,
      skills:
        idx === 0
          ? [
              {
                id: 14000,
                name: 'Chain Self Extra',
                sp_cost: 0,
                additionalTurnRule: {
                  skillUsableInExtraTurn: true,
                  additionalTurnGrantInExtraTurn: true,
                  conditions: {
                    requiresOverDrive: false,
                    requiresReinforcedMode: false,
                    excludesExtraTurnForSkillUse: false,
                    excludesExtraTurnForAdditionalTurnGrant: false,
                  },
                  additionalTurnTargetTypes: ['Self'],
                },
                parts: [{ skill_type: 'AdditionalTurn', target_type: 'Self' }],
              },
              {
                id: 14001,
                name: 'End Chain',
                sp_cost: 0,
                parts: [],
              },
            ]
          : [
              {
                id: 14000 + idx + 1,
                name: 'Normal',
                sp_cost: 0,
                parts: [],
              },
            ],
    })
  );

  let state = createBattleStateFromParty(new Party(members));
  state.turnState.odGauge = 100;
  state = activateOverdrive(state, 1, 'preemptive');

  const odPreview = previewTurn(state, {
    0: { characterId: 'Z1', skillId: 14000 },
    1: { characterId: 'Z2', skillId: 14002 },
    2: { characterId: 'Z3', skillId: 14003 },
  });
  state = commitTurn(state, odPreview).nextState;
  assert.equal(state.turnState.turnType, 'extra');

  // EX, EX, EX を継続
  for (let i = 0; i < 3; i += 1) {
    const exPreview = previewTurn(state, {
      0: { characterId: 'Z1', skillId: 14000 },
    });
    state = commitTurn(state, exPreview).nextState;
    assert.equal(state.turnState.turnType, 'extra');
  }

  // 最後のEXで連鎖を止める
  const exEndPreview = previewTurn(state, {
    0: { characterId: 'Z1', skillId: 14001 },
  });
  state = commitTurn(state, exEndPreview).nextState;

  assert.equal(state.turnState.turnType, 'normal');
  assert.equal(state.turnState.turnLabel, 'T1');
  assert.equal(state.turnState.turnIndex, 1);
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

test('HealSp AllyFront increases SP for all frontline members', () => {
  const members = Array.from({ length: 6 }, (_, idx) =>
    new CharacterStyle({
      characterId: `HSF${idx + 1}`,
      characterName: `HSF${idx + 1}`,
      styleId: idx + 1,
      styleName: `HSFS${idx + 1}`,
      partyIndex: idx,
      position: idx,
      initialSP: 10,
      skills: [
        {
          id: 51000 + idx,
          name: idx === 0 ? 'Front SP Up' : 'Normal',
          sp_cost: 0,
          parts:
            idx === 0
              ? [{ skill_type: 'HealSp', target_type: 'AllyFront', power: [3, 0] }]
              : [{ skill_type: 'AttackSkill', target_type: 'Single' }],
        },
      ],
    })
  );

  const state = createBattleStateFromParty(new Party(members));
  const preview = previewTurn(state, {
    0: { characterId: 'HSF1', skillId: 51000 },
    1: { characterId: 'HSF2', skillId: 51001 },
    2: { characterId: 'HSF3', skillId: 51002 },
  });
  const { nextState } = commitTurn(state, preview);

  const m1 = nextState.party.find((m) => m.characterId === 'HSF1');
  const m2 = nextState.party.find((m) => m.characterId === 'HSF2');
  const m3 = nextState.party.find((m) => m.characterId === 'HSF3');
  const m4 = nextState.party.find((m) => m.characterId === 'HSF4');

  // frontline: +3 (skill) +2 (base)
  assert.equal(m1.sp.current, 15);
  assert.equal(m2.sp.current, 15);
  assert.equal(m3.sp.current, 15);
  // backline: +2 (base only)
  assert.equal(m4.sp.current, 12);
});

test('HealSp AllyAll increases SP for all party members', () => {
  const members = Array.from({ length: 6 }, (_, idx) =>
    new CharacterStyle({
      characterId: `HSA${idx + 1}`,
      characterName: `HSA${idx + 1}`,
      styleId: idx + 1,
      styleName: `HSAS${idx + 1}`,
      partyIndex: idx,
      position: idx,
      initialSP: 10,
      skills: [
        {
          id: 51500 + idx,
          name: idx === 0 ? 'All SP Up' : 'Normal',
          sp_cost: 0,
          parts:
            idx === 0
              ? [{ skill_type: 'HealSp', target_type: 'AllyAll', power: [3, 0] }]
              : [{ skill_type: 'AttackSkill', target_type: 'Single' }],
        },
      ],
    })
  );

  const state = createBattleStateFromParty(new Party(members));
  const preview = previewTurn(state, {
    0: { characterId: 'HSA1', skillId: 51500 },
    1: { characterId: 'HSA2', skillId: 51501 },
    2: { characterId: 'HSA3', skillId: 51502 },
  });
  const { nextState } = commitTurn(state, preview);

  for (const member of nextState.party) {
    assert.equal(member.sp.current, 15);
  }
});

test('HealSp AllyAllWithoutSelf excludes actor and affects all allies', () => {
  const members = Array.from({ length: 6 }, (_, idx) =>
    new CharacterStyle({
      characterId: `HSAS${idx + 1}`,
      characterName: `HSAS${idx + 1}`,
      styleId: idx + 1,
      styleName: `HSASS${idx + 1}`,
      partyIndex: idx,
      position: idx,
      initialSP: 10,
      skills: [
        {
          id: 51600 + idx,
          name: idx === 0 ? 'All Other SP Up' : 'Normal',
          sp_cost: 0,
          parts:
            idx === 0
              ? [{ skill_type: 'HealSp', target_type: 'AllyAllWithoutSelf', power: [3, 0] }]
              : [{ skill_type: 'AttackSkill', target_type: 'Single' }],
        },
      ],
    })
  );

  const state = createBattleStateFromParty(new Party(members));
  const preview = previewTurn(state, {
    0: { characterId: 'HSAS1', skillId: 51600 },
    1: { characterId: 'HSAS2', skillId: 51601 },
    2: { characterId: 'HSAS3', skillId: 51602 },
  });
  const { nextState } = commitTurn(state, preview);

  const actor = nextState.party.find((m) => m.characterId === 'HSAS1');
  assert.equal(actor.sp.current, 12);
  for (const member of nextState.party.filter((m) => m.characterId !== 'HSAS1')) {
    assert.equal(member.sp.current, 15);
  }
});

test('HealSp AllySingleWithoutSelf targets one ally and excludes self', () => {
  const members = Array.from({ length: 6 }, (_, idx) =>
    new CharacterStyle({
      characterId: `HSS${idx + 1}`,
      characterName: `HSS${idx + 1}`,
      styleId: idx + 1,
      styleName: `HSSS${idx + 1}`,
      partyIndex: idx,
      position: idx,
      initialSP: 10,
      skills: [
        {
          id: 52000 + idx,
          name: idx === 0 ? 'Single Other SP Up' : 'Normal',
          sp_cost: 0,
          parts:
            idx === 0
              ? [{ skill_type: 'HealSp', target_type: 'AllySingleWithoutSelf', power: [4, 0] }]
              : [{ skill_type: 'AttackSkill', target_type: 'Single' }],
        },
      ],
    })
  );

  const state = createBattleStateFromParty(new Party(members));
  const preview = previewTurn(state, {
    0: { characterId: 'HSS1', skillId: 52000 },
    1: { characterId: 'HSS2', skillId: 52001 },
    2: { characterId: 'HSS3', skillId: 52002 },
  });
  const { nextState } = commitTurn(state, preview);

  const actor = nextState.party.find((m) => m.characterId === 'HSS1');
  const ally = nextState.party.find((m) => m.characterId === 'HSS2');

  // actor: base only
  assert.equal(actor.sp.current, 12);
  // first non-self frontline ally gets +4 then base +2
  assert.equal(ally.sp.current, 16);
});

test('HealSp AllySingleWithoutSelf respects selected targetCharacterId', () => {
  const members = Array.from({ length: 6 }, (_, idx) =>
    new CharacterStyle({
      characterId: `HST${idx + 1}`,
      characterName: `HST${idx + 1}`,
      styleId: idx + 1,
      styleName: `HSTS${idx + 1}`,
      partyIndex: idx,
      position: idx,
      initialSP: 10,
      skills: [
        {
          id: 53000 + idx,
          name: idx === 0 ? 'Single Other SP Up' : 'Normal',
          sp_cost: 0,
          parts:
            idx === 0
              ? [{ skill_type: 'HealSp', target_type: 'AllySingleWithoutSelf', power: [4, 0] }]
              : [{ skill_type: 'AttackSkill', target_type: 'Single' }],
        },
      ],
    })
  );

  const state = createBattleStateFromParty(new Party(members));
  const preview = previewTurn(state, {
    0: { characterId: 'HST1', skillId: 53000, targetCharacterId: 'HST5' },
    1: { characterId: 'HST2', skillId: 53001 },
    2: { characterId: 'HST3', skillId: 53002 },
  });
  const { nextState } = commitTurn(state, preview);

  const actor = nextState.party.find((m) => m.characterId === 'HST1');
  const t2 = nextState.party.find((m) => m.characterId === 'HST2');
  const t3 = nextState.party.find((m) => m.characterId === 'HST3');
  const t5 = nextState.party.find((m) => m.characterId === 'HST5');

  assert.equal(actor.sp.current, 12);
  assert.equal(t2.sp.current, 12, 'non-selected frontline ally should get base only');
  assert.equal(t3.sp.current, 12, 'non-selected ally should get base only');
  assert.equal(t5.sp.current, 16, 'selected backline ally should receive HealSp');
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

test('CountBC(...BreakDownTurn()>0) is evaluated from enemy down-turn state', () => {
  const members = Array.from({ length: 6 }, (_, idx) =>
    new CharacterStyle({
      characterId: `ED${idx + 1}`,
      characterName: `ED${idx + 1}`,
      styleId: idx + 1,
      styleName: `EDS${idx + 1}`,
      partyIndex: idx,
      position: idx,
      initialSP: 10,
      skills:
        idx === 0
          ? [
              {
                id: 18000,
                name: 'BreakDown Dependent',
                label: 'BreakDownDependent',
                sp_cost: 0,
                iuc_cond: 'CountBC(IsPlayer()==0&&IsDead()==0&&BreakDownTurn()>0)>0',
                parts: [],
              },
            ]
          : [{ id: 18000 + idx, name: 'Normal', label: `EDSkill${idx + 1}`, sp_cost: 0, parts: [] }],
    })
  );
  const party = new Party(members);
  const state = createBattleStateFromParty(party);

  assert.throws(
    () =>
      previewTurn(state, {
        0: { characterId: 'ED1', skillId: 18000 },
      }),
    /cannot be used/i
  );

  state.turnState.enemyState = {
    enemyCount: 1,
    statuses: [{ statusType: 'DownTurn', targetIndex: 0, remainingTurns: 1 }],
  };
  const preview = previewTurn(state, {
    0: { characterId: 'ED1', skillId: 18000 },
  });
  const { nextState } = commitTurn(state, preview);
  assert.equal(nextState.turnState.enemyState.statuses.length, 0, 'down turn should tick down after commit');
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

test('od-suspended extra turn satisfies both OD and extra-turn conditions simultaneously', () => {
  const members = Array.from({ length: 6 }, (_, idx) =>
    new CharacterStyle({
      characterId: `OX${idx + 1}`,
      characterName: `OX${idx + 1}`,
      styleId: idx + 1,
      styleName: `OXS${idx + 1}`,
      partyIndex: idx,
      position: idx,
      initialSP: 10,
      skills:
        idx === 0
          ? [
              {
                id: 10150,
                name: 'OD Only',
                label: 'ODOnlyInExtra',
                sp_cost: 0,
                cond: 'IsOverDrive()==1',
                parts: [],
              },
              {
                id: 10151,
                name: 'OD Forbidden',
                label: 'ODForbiddenInExtra',
                sp_cost: 0,
                cond: 'IsOverDrive()==0',
                parts: [],
              },
              {
                id: 10152,
                name: 'No Extra',
                label: 'NoExtraInOd',
                sp_cost: 0,
                cond: 'SpecialStatusCountByType(20)==0',
                parts: [],
              },
            ]
          : [{ id: 10160 + idx, name: 'Normal', label: `OXSkill${idx + 1}`, sp_cost: 0, parts: [] }],
    })
  );

  let state = createBattleStateFromParty(new Party(members));
  state = grantExtraTurn(state, ['OX1']);
  state.turnState.odSuspended = true;
  state.turnState.odLevel = 3;
  state.turnState.remainingOdActions = 2;
  state.turnState.odContext = 'interrupt';

  const odOnlyPreview = previewTurn(state, {
    0: { characterId: 'OX1', skillId: 10150 },
  });
  assert.equal(odOnlyPreview.actions.length, 1, 'OD-only skill should be usable during OD-suspended EX');

  assert.throws(
    () =>
      previewTurn(state, {
        0: { characterId: 'OX1', skillId: 10151 },
      }),
    /cannot be used because cond is not satisfied/,
    'OD-forbidden skill should be blocked during OD-suspended EX'
  );

  assert.throws(
    () =>
      previewTurn(state, {
        0: { characterId: 'OX1', skillId: 10152 },
      }),
    /cannot be used because cond is not satisfied/,
    'extra-turn-forbidden skill should remain blocked during OD-suspended EX'
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

test('Tezuka kishin turn count advances on extra turn even when Tezuka is not in allowed extra members', () => {
  const members = Array.from({ length: 6 }, (_, idx) =>
    new CharacterStyle({
      characterId: idx === 0 ? 'STezuka' : `KX${idx + 1}`,
      characterName: idx === 0 ? '手塚 咲' : `KX${idx + 1}`,
      styleId: idx + 1,
      styleName: `KXS${idx + 1}`,
      partyIndex: idx,
      position: idx,
      initialSP: 10,
      skills: [
        {
          id: 18000 + idx,
          name: 'Normal',
          label: `KXSkill${idx + 1}`,
          sp_cost: 0,
          parts: [{ skill_type: 'AttackSkill', target_type: 'Single' }],
        },
      ],
    })
  );

  let state = createBattleStateFromParty(new Party(members));
  const tezuka = state.party.find((m) => m.characterId === 'STezuka');
  tezuka.activateReinforcedMode(3);

  state = grantExtraTurn(state, ['KX2']);
  const preview = previewTurn(state, {
    1: { characterId: 'KX2', skillId: 18001 },
  });
  state = commitTurn(state, preview).nextState;

  const after = state.party.find((m) => m.characterId === 'STezuka');
  assert.equal(after.reinforcedTurnsRemaining, 2);
});

test('kishin remaining 1 still allows Tezuka self-extra grant before expiring', () => {
  const members = Array.from({ length: 6 }, (_, idx) =>
    new CharacterStyle({
      characterId: idx === 0 ? 'STezuka' : `KR${idx + 1}`,
      characterName: idx === 0 ? '手塚 咲' : `KR${idx + 1}`,
      styleId: idx + 1,
      styleName: `KRS${idx + 1}`,
      partyIndex: idx,
      position: idx,
      initialSP: 10,
      skills: [
        {
          id: idx === 0 ? 10400 : 10400 + idx,
          name: idx === 0 ? '天駆の鉄槌' : 'Normal',
          label: idx === 0 ? 'STezukaTenku' : `KRSkill${idx + 1}`,
          sp_cost: 0,
          additionalTurnRule:
            idx === 0
              ? {
                  skillUsableInExtraTurn: true,
                  additionalTurnGrantInExtraTurn: true,
                  conditions: {
                    requiresOverDrive: false,
                    requiresReinforcedMode: true,
                    excludesExtraTurnForSkillUse: false,
                    excludesExtraTurnForAdditionalTurnGrant: false,
                  },
                  additionalTurnTargetTypes: ['Self'],
                }
              : null,
          parts:
            idx === 0
              ? [
                  { skill_type: 'AttackSkill', target_type: 'All' },
                  { skill_type: 'AdditionalTurn', target_type: 'Self' },
                ]
              : [],
        },
      ],
    })
  );

  let state = createBattleStateFromParty(new Party(members));
  const tezuka = state.party.find((m) => m.characterId === 'STezuka');
  tezuka.activateReinforcedMode(3);
  state = grantExtraTurn(state, ['STezuka']);

  for (let i = 0; i < 3; i += 1) {
    const preview = previewTurn(state, {
      0: { characterId: 'STezuka', skillId: 10400 },
    });
    state = commitTurn(state, preview).nextState;
    assert.equal(state.turnState.turnType, 'extra', `commit #${i + 1} should still be extra`);
  }

  const afterThird = state.party.find((m) => m.characterId === 'STezuka');
  assert.equal(afterThird.isReinforcedMode, false);
  assert.equal(afterThird.actionDisabledTurns, 1);

  const disabledSkills = afterThird.getActionSkills();
  assert.equal(disabledSkills.length, 1);
  assert.equal(disabledSkills[0].skillId, 0);

  const previewDisabled = previewTurn(state, {
    0: { characterId: 'STezuka', skillId: 0 },
  });
  state = commitTurn(state, previewDisabled).nextState;
  assert.equal(state.turnState.turnType, 'normal');
});

test('commitTurn imports Funnel effect values from skill parts into statusEffects', () => {
  const members = Array.from({ length: 6 }, (_, idx) =>
    new CharacterStyle({
      characterId: `FU${idx + 1}`,
      characterName: `FU${idx + 1}`,
      styleId: idx + 1,
      styleName: `FUS${idx + 1}`,
      partyIndex: idx,
      position: idx,
      initialSP: 10,
      skills: [
        {
          id: 21000 + idx,
          name: idx === 0 ? 'Funnel Self' : 'Normal',
          label: idx === 0 ? 'FunnelSelf' : `FUSkill${idx + 1}`,
          sp_cost: 0,
          parts:
            idx === 0
              ? [
                  {
                    skill_type: 'Funnel',
                    target_type: 'Self',
                    power: [5, 0],
                    value: [0.06, 0],
                    effect: { limitType: 'Default', exitCond: 'Count', exitVal: [1, 0] },
                  },
                ]
              : [],
        },
      ],
    })
  );

  let state = createBattleStateFromParty(new Party(members));
  const preview = previewTurn(state, {
    0: { characterId: 'FU1', skillId: 21000 },
  });
  state = commitTurn(state, preview).nextState;

  const actor = state.party.find((m) => m.characterId === 'FU1');
  const effects = actor.resolveEffectiveFunnelEffects();
  assert.equal(effects.length, 1);
  assert.equal(effects[0].power, 5);
  assert.equal(effects[0].limitType, 'Default');
  assert.equal(effects[0].exitCond, 'Count');
  assert.equal(effects[0].remaining, 1);
  assert.equal(effects[0].metadata?.damageBonus, 0.06);
});

test('commitTurn imports Funnel from SkillCondition resolved branch', () => {
  const members = Array.from({ length: 6 }, (_, idx) =>
    new CharacterStyle({
      characterId: `FC${idx + 1}`,
      characterName: `FC${idx + 1}`,
      styleId: idx + 1,
      styleName: `FCS${idx + 1}`,
      partyIndex: idx,
      position: idx,
      initialSP: 10,
      skills: [
        {
          id: 22000 + idx,
          name: idx === 0 ? 'Conditional Funnel' : 'Normal',
          label: idx === 0 ? 'ConditionalFunnel' : `FCSkill${idx + 1}`,
          sp_cost: 0,
          parts:
            idx === 0
              ? [
                  {
                    skill_type: 'SkillCondition',
                    cond: 'IsOverDrive()==1',
                    strval: [
                      {
                        id: 1,
                        parts: [
                          {
                            skill_type: 'Funnel',
                            target_type: 'Self',
                            power: [3, 0],
                            value: [0.5, 0],
                            effect: { limitType: 'Only', exitCond: 'PlayerTurnEnd', exitVal: [3, 0] },
                          },
                        ],
                      },
                      {
                        id: 2,
                        parts: [
                          {
                            skill_type: 'Funnel',
                            target_type: 'Self',
                            power: [5, 0],
                            value: [0.12, 0],
                            effect: { limitType: 'Default', exitCond: 'Count', exitVal: [1, 0] },
                          },
                        ],
                      },
                    ],
                  },
                ]
              : [],
        },
      ],
    })
  );

  // 非ODでは後段(branch #2)が選ばれる
  let state = createBattleStateFromParty(new Party(members));
  let preview = previewTurn(state, {
    0: { characterId: 'FC1', skillId: 22000 },
  });
  state = commitTurn(state, preview).nextState;
  let effects = state.party.find((m) => m.characterId === 'FC1').resolveEffectiveFunnelEffects();
  assert.equal(effects[0].power, 5);
  assert.equal(effects[0].metadata?.damageBonus, 0.12);

  // ODでは前段(branch #1)が選ばれる
  state.turnState.odGauge = 100;
  state = activateOverdrive(state, 1, 'preemptive');
  preview = previewTurn(state, {
    0: { characterId: 'FC1', skillId: 22000 },
  });
  state = commitTurn(state, preview).nextState;
  effects = state.party.find((m) => m.characterId === 'FC1').resolveEffectiveFunnelEffects();
  assert.equal(effects.some((item) => item.power === 3 && item.metadata?.damageBonus === 0.5), true);
});

test('OD gain uses Funnel hit bonus and consumes count-based Funnel on damage action', () => {
  const members = Array.from({ length: 6 }, (_, idx) =>
    new CharacterStyle({
      characterId: `FO${idx + 1}`,
      characterName: `FO${idx + 1}`,
      styleId: idx + 1,
      styleName: `FOS${idx + 1}`,
      partyIndex: idx,
      position: idx,
      initialSP: 10,
      skills: [
        {
          id: 23000 + idx,
          name: idx === 0 ? 'Attack + Funnel' : 'Normal',
          label: idx === 0 ? 'AttackFunnel' : `FOSkill${idx + 1}`,
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

  let state = createBattleStateFromParty(new Party(members));
  let preview = previewTurn(state, {
    0: { characterId: 'FO1', skillId: 23000 },
  });
  let committed = commitTurn(state, preview);
  state = committed.nextState;

  // base hit 1 + funnel +3 => 4 hits => 10.0%
  assert.equal(state.turnState.odGauge, 10);
  const odEvent = committed.committedRecord.actions[0].funnelApplied;
  assert.equal(Array.isArray(odEvent), true);
  const actor = state.party.find((m) => m.characterId === 'FO1');
  assert.equal(actor.resolveEffectiveFunnelEffects().length, 0, 'count-based funnel should be consumed');

  preview = previewTurn(state, {
    0: { characterId: 'FO1', skillId: 23000 },
  });
  committed = commitTurn(state, preview);
  state = committed.nextState;
  assert.equal(state.turnState.odGauge, 20, 'same action repeats same +10.0%');
});

test('PlayerTurnEnd status expiry is applied only to members who acted this turn', () => {
  const members = Array.from({ length: 6 }, (_, idx) =>
    new CharacterStyle({
      characterId: `TE${idx + 1}`,
      characterName: `TE${idx + 1}`,
      styleId: idx + 1,
      styleName: `TES${idx + 1}`,
      partyIndex: idx,
      position: idx,
      initialSP: 10,
      skills: [{ id: 24000 + idx, name: 'Normal', label: `TESkill${idx + 1}`, sp_cost: 0, parts: [] }],
    })
  );

  let state = createBattleStateFromParty(new Party(members));
  state = grantExtraTurn(state, ['TE1']);
  state.party.find((m) => m.characterId === 'TE1').addStatusEffect({
    statusType: 'Funnel',
    limitType: 'Only',
    exitCond: 'PlayerTurnEnd',
    remaining: 2,
    power: 3,
  });
  state.party.find((m) => m.characterId === 'TE2').addStatusEffect({
    statusType: 'Funnel',
    limitType: 'Only',
    exitCond: 'PlayerTurnEnd',
    remaining: 2,
    power: 3,
  });

  const preview = previewTurn(state, {
    0: { characterId: 'TE1', skillId: 24000 },
  });
  state = commitTurn(state, preview).nextState;

  const te1 = state.party.find((m) => m.characterId === 'TE1').resolveEffectiveFunnelEffects();
  const te2 = state.party.find((m) => m.characterId === 'TE2').resolveEffectiveFunnelEffects();
  assert.equal(te1[0].remaining, 1, 'acted member should tick PlayerTurnEnd');
  assert.equal(te2[0].remaining, 2, 'non-acting member should not tick PlayerTurnEnd');
});

test('count-based MindEye is consumed by damage action only', () => {
  const members = Array.from({ length: 6 }, (_, idx) =>
    new CharacterStyle({
      characterId: `ME${idx + 1}`,
      characterName: `ME${idx + 1}`,
      styleId: idx + 1,
      styleName: `MES${idx + 1}`,
      partyIndex: idx,
      position: idx,
      initialSP: 10,
      skills:
        idx === 0
          ? [
              {
                id: 25000,
                name: 'Damage',
                label: 'DamageSkill',
                sp_cost: 0,
                hit_count: 1,
                target_type: 'Single',
                parts: [{ skill_type: 'AttackSkill', target_type: 'Single' }],
              },
              {
                id: 25001,
                name: 'Buff',
                label: 'BuffSkill',
                sp_cost: 0,
                parts: [{ skill_type: 'AttackUp', target_type: 'Self' }],
              },
            ]
          : [{ id: 25000 + idx + 1, name: 'Normal', label: `MESkill${idx + 1}`, sp_cost: 0, parts: [] }],
    })
  );

  // Damage consumes Count mind-eye
  let state = createBattleStateFromParty(new Party(members));
  state.party.find((m) => m.characterId === 'ME1').addStatusEffect({
    statusType: 'MindEye',
    limitType: 'Default',
    exitCond: 'Count',
    remaining: 1,
    power: 1,
  });
  let preview = previewTurn(state, {
    0: { characterId: 'ME1', skillId: 25000 },
  });
  state = commitTurn(state, preview).nextState;
  assert.equal(state.party.find((m) => m.characterId === 'ME1').resolveEffectiveMindEyeEffects().length, 0);

  // Non-damage does not consume Count mind-eye
  state = createBattleStateFromParty(new Party(members));
  state.party.find((m) => m.characterId === 'ME1').addStatusEffect({
    statusType: 'MindEye',
    limitType: 'Default',
    exitCond: 'Count',
    remaining: 1,
    power: 1,
  });
  preview = previewTurn(state, {
    0: { characterId: 'ME1', skillId: 25001 },
  });
  state = commitTurn(state, preview).nextState;
  assert.equal(state.party.find((m) => m.characterId === 'ME1').resolveEffectiveMindEyeEffects().length, 1);
});
