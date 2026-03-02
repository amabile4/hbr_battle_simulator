import test from 'node:test';
import assert from 'node:assert/strict';
import { applySpChange, CharacterStyle } from '../src/index.js';
import { getStore, getSixUsableStyleIds } from './helpers.js';

test('applySpChange follows freeze rule for positive delta', () => {
  const current = 25;
  const next = applySpChange(current, 5, 0, 20);

  assert.equal(next, 25);
});

test('build party with six styles and perform swap', () => {
  const store = getStore();
  const styleIds = getSixUsableStyleIds(store);
  const party = store.buildPartyFromStyleIds(styleIds, { initialSP: 10 });

  assert.equal(party.members.length, 6);
  assert.equal(party.getFrontline().length, 3);

  const before0 = party.getByPosition(0).characterId;
  const before3 = party.getByPosition(3).characterId;

  party.swap(0, 3);

  assert.equal(party.getByPosition(0).characterId, before3);
  assert.equal(party.getByPosition(3).characterId, before0);
});

test('character preview/commit applies preview result exactly once (Q-S001 A)', () => {
  const store = getStore();
  const styleIds = getSixUsableStyleIds(store);
  const party = store.buildPartyFromStyleIds(styleIds, { initialSP: 12 });

  const member = party.getByPosition(0);
  const costlySkill = member.skills.find((skill) => skill.spCost > 0) ?? member.skills[0];

  const preview = member.previewSkillUse(costlySkill.skillId);
  const committed = member.commitSkillPreview(preview);

  assert.equal(member.sp.current, preview.endSP);
  assert.equal(committed.appliedFromPreview, true);

  assert.throws(() => member.commitSkillPreview(preview), /Stale preview/);
});

test('sp_cost -1 consumes all current SP (magic number rule)', () => {
  const member = new CharacterStyle({
    characterId: 'TEST',
    characterName: 'TEST',
    styleId: 1,
    styleName: 'Test Style',
    partyIndex: 0,
    position: 0,
    initialSP: 17,
    initialEP: 3,
    skills: [
      {
        id: 999001,
        name: 'Trinity Blazing',
        label: 'TestAllSp',
        consume_type: 'Sp',
        sp_cost: -1,
      },
    ],
  });

  const preview = member.previewSkillUse(999001);
  assert.equal(preview.startSP, 17);
  assert.equal(preview.endSP, 0);
  assert.equal(preview.spDelta, -17);
  assert.equal(preview.startEP, 3);
  assert.equal(preview.endEP, 3);

  member.commitSkillPreview(preview);
  assert.equal(member.sp.current, 0);
  assert.equal(member.ep.current, 3);
});

test('statusEffects support Funnel stacking: Default stacks, Only keeps strongest', () => {
  const member = new CharacterStyle({
    characterId: 'TEST',
    characterName: 'TEST',
    styleId: 1,
    styleName: 'Test Style',
    partyIndex: 0,
    position: 0,
    initialSP: 10,
    skills: [],
  });

  member.addStatusEffect({
    statusType: 'Funnel',
    limitType: 'Default',
    exitCond: 'Count',
    remaining: 1,
    power: 3,
  });
  member.addStatusEffect({
    statusType: 'Funnel',
    limitType: 'Default',
    exitCond: 'Count',
    remaining: 1,
    power: 5,
  });
  member.addStatusEffect({
    statusType: 'Funnel',
    limitType: 'Only',
    exitCond: 'Count',
    remaining: 2,
    power: 4,
  });
  member.addStatusEffect({
    statusType: 'Funnel',
    limitType: 'Only',
    exitCond: 'Count',
    remaining: 2,
    power: 8,
  });

  const effective = member.resolveEffectiveFunnelEffects();
  assert.deepEqual(
    effective.map((item) => ({ limitType: item.limitType, power: item.power })),
    [
      { limitType: 'Only', power: 8 },
      { limitType: 'Default', power: 5 },
      { limitType: 'Default', power: 3 },
    ]
  );
});

test('consumeFunnelEffects consumes highest two count-based effects', () => {
  const member = new CharacterStyle({
    characterId: 'TEST',
    characterName: 'TEST',
    styleId: 1,
    styleName: 'Test Style',
    partyIndex: 0,
    position: 0,
    initialSP: 10,
    skills: [],
  });

  member.addStatusEffect({
    statusType: 'Funnel',
    limitType: 'Default',
    exitCond: 'Count',
    remaining: 1,
    power: 2,
  });
  member.addStatusEffect({
    statusType: 'Funnel',
    limitType: 'Default',
    exitCond: 'PlayerTurnEnd',
    remaining: 3,
    power: 9,
  });
  member.addStatusEffect({
    statusType: 'Funnel',
    limitType: 'Default',
    exitCond: 'Count',
    remaining: 2,
    power: 5,
  });
  member.addStatusEffect({
    statusType: 'Funnel',
    limitType: 'Only',
    exitCond: 'Count',
    remaining: 2,
    power: 8,
  });

  const consumed = member.consumeFunnelEffects(2);
  assert.deepEqual(
    consumed.map((item) => item.power),
    [8, 5],
    'top-2 count-based Funnel effects should be consumed first'
  );

  const remaining = member.resolveEffectiveFunnelEffects();
  assert.deepEqual(
    remaining.map((item) => ({ power: item.power, exitCond: item.exitCond, remaining: item.remaining })),
    [
      { power: 9, exitCond: 'PlayerTurnEnd', remaining: 3 },
      { power: 8, exitCond: 'Count', remaining: 1 },
      { power: 5, exitCond: 'Count', remaining: 1 },
      { power: 2, exitCond: 'Count', remaining: 1 },
    ]
  );
});

test('Tezuka reinforced mode makes SP skill cost zero and grants Funnel/MindEye states', () => {
  const member = new CharacterStyle({
    characterId: 'STezuka',
    characterName: '手塚 咲',
    styleId: 1010103,
    styleName: '希望の暁',
    partyIndex: 0,
    position: 0,
    initialSP: 12,
    skills: [
      { id: 46041402, name: '一点突破', label: 'STezukaSkill01', sp_cost: 10, consume_type: 'Sp' },
      { id: 46041404, name: 'トリニティ・ブレイジング', label: 'STezukaSkill51', sp_cost: -1, consume_type: 'Sp' },
    ],
  });

  member.activateReinforcedMode(3);

  const funnel = member.resolveEffectiveFunnelEffects();
  const mindEye = member.resolveEffectiveMindEyeEffects();
  assert.equal(funnel.length >= 1, true);
  assert.equal(mindEye.length >= 1, true);
  assert.equal(funnel[0].power, 3);
  assert.equal(funnel[0].exitCond, 'PlayerTurnEnd');
  assert.equal(funnel[0].remaining, 3);
  assert.equal(mindEye[0].exitCond, 'PlayerTurnEnd');
  assert.equal(mindEye[0].remaining, 3);

  const previewNormal = member.previewSkillUse(46041402);
  assert.equal(previewNormal.startSP, 12);
  assert.equal(previewNormal.endSP, 12);

  const previewAll = member.previewSkillUse(46041404);
  assert.equal(previewAll.startSP, 12);
  assert.equal(previewAll.endSP, 12);
});

test('Tezuka reinforced state decrements granted Funnel/MindEye by actionable turns', () => {
  const member = new CharacterStyle({
    characterId: 'STezuka',
    characterName: '手塚 咲',
    styleId: 1010103,
    styleName: '希望の暁',
    partyIndex: 0,
    position: 0,
    initialSP: 10,
    skills: [{ id: 46041402, name: '一点突破', label: 'STezukaSkill01', sp_cost: 10, consume_type: 'Sp' }],
  });

  member.activateReinforcedMode(3);
  for (let i = 0; i < 3; i += 1) {
    member.tickReinforcedModeTurnIfActionable(true);
  }

  assert.equal(member.isReinforcedMode, false);
  assert.equal(member.actionDisabledTurns, 1);
  assert.equal(member.resolveEffectiveFunnelEffects().length, 0);
  assert.equal(member.resolveEffectiveMindEyeEffects().length, 0);
});
