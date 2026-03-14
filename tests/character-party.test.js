import test from 'node:test';
import assert from 'node:assert/strict';
import { applySpChange, CharacterStyle } from '../src/index.js';
import { getStore, getSixUsableStyleIds } from './helpers.js';

test('applySpChange clamps to negative min when SP goes below zero (minus-SP passive)', () => {
  // SP が min 未満まで消費されようとするとき、min でクランプされる
  assert.equal(applySpChange(3, -10, -5, 20), -5, 'should clamp to min=-5');
  assert.equal(applySpChange(0, -3, -5, 20), -3, 'SP from 0 to -3 is within min=-5');
  assert.equal(applySpChange(-3, -3, -5, 20), -5, 'SP from -3 to -6 clamps at min=-5');
});

test('applySpChange freeze rule does not apply during negative-SP recovery', () => {
  // current=-3, delta=+5, min=-5, ceiling=20 → effectiveCeiling=max(-3,20)=20 → -3+5=2
  assert.equal(applySpChange(-3, 5, -5, 20), 2);
  // current=18, delta=+5, min=-5, ceiling=20 → effectiveCeiling=max(18,20)=20 → 20 (freeze)
  assert.equal(applySpChange(18, 5, -5, 20), 20);
});

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

test('party swap updates positions atomically without depending on member setPosition', () => {
  const store = getStore();
  const styleIds = getSixUsableStyleIds(store);
  const party = store.buildPartyFromStyleIds(styleIds, { initialSP: 10 });
  const member0 = party.getByPosition(0);
  const member3 = party.getByPosition(3);

  member0.setPosition = () => {
    throw new Error('setPosition should not be called during atomic swap');
  };
  member3.setPosition = () => {
    throw new Error('setPosition should not be called during atomic swap');
  };

  const result = party.swap(0, 3);

  assert.equal(party.getByPosition(0).characterId, member3.characterId);
  assert.equal(party.getByPosition(3).characterId, member0.characterId);
  assert.deepEqual(result, {
    from: member0.characterId,
    to: member3.characterId,
    fromPosition: 0,
    toPosition: 3,
  });
});

test('party swap no-ops when from and to positions are the same', () => {
  const store = getStore();
  const styleIds = getSixUsableStyleIds(store);
  const party = store.buildPartyFromStyleIds(styleIds, { initialSP: 10 });
  const member0 = party.getByPosition(0);
  const beforeRevision = member0.revision;

  const result = party.swap(0, 0);

  assert.equal(party.getByPosition(0).characterId, member0.characterId);
  assert.equal(member0.revision, beforeRevision);
  assert.deepEqual(result, {
    from: member0.characterId,
    to: member0.characterId,
    fromPosition: 0,
    toPosition: 0,
  });
});

test('buildCharacterStyle keeps passive activation metadata on member state', () => {
  const store = getStore();
  const member = store.buildCharacterStyle({ styleId: 1001108, partyIndex: 0, initialSP: 10 });
  const passive = member.passives.find((item) => item.name === '心眼の境地');

  assert.ok(passive);
  assert.equal(passive.timing, 'OnPlayerTurnStart');
  assert.equal(passive.condition, 'SpecialStatusCountByType(78)>0 && IsFront()');
  assert.equal(passive.effect, 'NormalBuff_Up');
  assert.equal(passive.activRate, 0);
  assert.equal(passive.autoType, 'None');
  assert.equal(passive.requiredLimitBreakLevel, 0);
  assert.equal(passive.sourceType, 'style');
  assert.equal(Array.isArray(passive.parts), true);
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

test('単独発動: skill-origin Only and passive-origin Only coexist as separate slots', () => {
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

  // スキル由来の[単独発動] Funnel (sourceType='skill', デフォルト)
  member.addStatusEffect({
    statusType: 'Funnel',
    limitType: 'Only',
    exitCond: 'PlayerTurnEnd',
    remaining: 3,
    power: 5,
    sourceType: 'skill',
  });
  // パッシブ由来の[単独発動] Funnel (sourceType='passive') — 別枠で共存可能
  member.addStatusEffect({
    statusType: 'Funnel',
    limitType: 'Only',
    exitCond: 'PlayerTurnEnd',
    remaining: 3,
    power: 3,
    sourceType: 'passive',
  });

  const effective = member.resolveEffectiveFunnelEffects();
  // スキル枠(power=5) とパッシブ枠(power=3) の両方が返る
  assert.deepEqual(
    effective.map((item) => ({ limitType: item.limitType, sourceType: item.sourceType, power: item.power })),
    [
      { limitType: 'Only', sourceType: 'skill', power: 5 },
      { limitType: 'Only', sourceType: 'passive', power: 3 },
    ]
  );
});

test('単独発動: 同じ sourceType の Only は最強のみ有効（2つ同時不可）', () => {
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

  // パッシブ由来の[単独発動]が2つある場合、最強の1つのみ有効
  member.addStatusEffect({
    statusType: 'Funnel',
    limitType: 'Only',
    exitCond: 'PlayerTurnEnd',
    remaining: 3,
    power: 3,
    sourceType: 'passive',
  });
  member.addStatusEffect({
    statusType: 'Funnel',
    limitType: 'Only',
    exitCond: 'PlayerTurnEnd',
    remaining: 3,
    power: 6,
    sourceType: 'passive',
  });

  const effective = member.resolveEffectiveFunnelEffects();
  // power=6 の1つだけ返る
  assert.deepEqual(
    effective.map((item) => ({ limitType: item.limitType, sourceType: item.sourceType, power: item.power })),
    [{ limitType: 'Only', sourceType: 'passive', power: 6 }]
  );
});

test('単独発動: skill-origin Only は effectName / elements ごとに別グループで共存する', () => {
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
    statusType: 'AttackUp',
    limitType: 'Only',
    exitCond: 'PlayerTurnEnd',
    remaining: 3,
    power: 0.4,
    sourceType: 'skill',
    elements: ['Ice'],
    metadata: { effectName: 'IceBuff_Up' },
  });
  member.addStatusEffect({
    statusType: 'AttackUp',
    limitType: 'Only',
    exitCond: 'PlayerTurnEnd',
    remaining: 3,
    power: 0.6,
    sourceType: 'skill',
    elements: ['Ice'],
    metadata: { effectName: 'IceBuff_Up' },
  });
  member.addStatusEffect({
    statusType: 'AttackUp',
    limitType: 'Only',
    exitCond: 'PlayerTurnEnd',
    remaining: 3,
    power: 0.35,
    sourceType: 'skill',
    elements: ['Light'],
    metadata: { effectName: 'LightBuff_Up' },
  });

  const effective = member.resolveEffectiveStatusEffects('AttackUp');

  assert.deepEqual(
    effective.map((item) => ({
      power: item.power,
      effectName: item.metadata?.effectName,
      elements: item.elements,
    })),
    [
      { power: 0.6, effectName: 'IceBuff_Up', elements: ['Ice'] },
      { power: 0.35, effectName: 'LightBuff_Up', elements: ['Light'] },
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
  member.commitSkillPreview(previewNormal);
  assert.equal(member.sp.current, 12);

  const previewAll = member.previewSkillUse(46041404);
  assert.equal(previewAll.startSP, 12);
  assert.equal(previewAll.endSP, 0);
  member.commitSkillPreview(previewAll);
  assert.equal(member.sp.current, 0);
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
