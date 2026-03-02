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
