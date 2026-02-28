import test from 'node:test';
import assert from 'node:assert/strict';
import { getStore } from './helpers.js';

test('style/skill lookup and assignment operations work', () => {
  const store = getStore();
  const targetStyle = store.styles.find((style) => Array.isArray(style.skills));

  assert.ok(targetStyle);

  const customSkillId = 99999901;

  store.putSkill({
    id: customSkillId,
    name: 'Test Skill',
    label: 'TestSkill',
    sp_cost: 3,
    consume_type: 'Sp',
    max_level: 1,
    parts: [{ skill_type: 'AttackSkill' }],
  });

  const updatedStyle = store.assignSkillToStyle(targetStyle.id, customSkillId);
  const found = updatedStyle.skills.some((skillRef) => Number(skillRef.id) === customSkillId);

  assert.equal(found, true);
  assert.equal(store.getSkillById(customSkillId).name, 'Test Skill');
});

test('listStylesByCharacter returns styles', () => {
  const store = getStore();
  const style = store.styles[0];
  const items = store.listStylesByCharacter(style.chara_label);

  assert.ok(items.length >= 1);
  assert.ok(items.some((row) => Number(row.id) === Number(style.id)));
});
