import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isAdmiralCommandSkill,
  isNormalAttackSkill,
  isPursuitOnlySkill,
  extractSkillLabelTrailingNumber,
  extractSkillLabelSkillNumber,
  classifySkillType,
  isExSkillByLabel,
} from '../src/domain/skill-classifiers.js';

test('isNormalAttackSkill matches by name and label suffix', () => {
  assert.equal(isNormalAttackSkill({ name: '通常攻撃' }), true);
  assert.equal(isNormalAttackSkill({ label: 'RukaAttackNormal' }), true);
  assert.equal(isNormalAttackSkill({ name: '通常攻撃+', label: 'OtherSkill' }), false);
});

test('isAdmiralCommandSkill requires both command name and Admiral role', () => {
  assert.equal(isAdmiralCommandSkill({ name: '指揮行動', role: 'Admiral' }), true);
  assert.equal(isAdmiralCommandSkill({ name: '指揮行動', role: 'Attacker' }), false);
  assert.equal(isAdmiralCommandSkill({ name: '通常攻撃', role: 'Admiral' }), false);
});

test('isPursuitOnlySkill matches by name, label suffix, and desc marker', () => {
  assert.equal(isPursuitOnlySkill({ name: '追撃' }), true);
  assert.equal(isPursuitOnlySkill({ label: 'AnySkill91' }), true);
  assert.equal(isPursuitOnlySkill({ desc: 'このスキルは追撃でのみ発動可能' }), true);
  assert.equal(isPursuitOnlySkill({ name: '通常攻撃', label: 'AttackNormal' }), false);
});

test('extractSkillLabelTrailingNumber returns trailing number or null', () => {
  assert.equal(extractSkillLabelTrailingNumber('YShirakawaSkill09'), 9);
  assert.equal(extractSkillLabelTrailingNumber('YShirakawaSkill51'), 51);
  assert.equal(extractSkillLabelTrailingNumber('YShirakawaSkillEX01'), 1);
  assert.equal(extractSkillLabelTrailingNumber('NoNumber'), null);
  assert.equal(extractSkillLabelTrailingNumber(''), null);
  assert.equal(extractSkillLabelTrailingNumber(null), null);
});

test('extractSkillLabelSkillNumber returns Skill number before evolution suffix', () => {
  assert.equal(extractSkillLabelSkillNumber('YShirakawaSkill09'), 9);
  assert.equal(extractSkillLabelSkillNumber('ByakkoSkill51Ev1'), 51);
  assert.equal(extractSkillLabelSkillNumber('MKiryuMasterlyPassiveSkill01'), 1);
  assert.equal(extractSkillLabelSkillNumber('NoNumber'), null);
});

test('isExSkillByLabel returns true for Skill number >= 51', () => {
  assert.equal(isExSkillByLabel({ label: 'YShirakawaSkill51' }), true);
  assert.equal(isExSkillByLabel({ label: 'ByakkoSkill51Ev1' }), true);
  assert.equal(isExSkillByLabel({ label: 'CharacterSkill99' }), true);
  assert.equal(isExSkillByLabel({ label: 'CharacterSkill50' }), false);
  assert.equal(isExSkillByLabel({ label: 'CharacterSkill09' }), false);
  assert.equal(isExSkillByLabel({ label: 'NoNumber' }), false);
  assert.equal(isExSkillByLabel({}), false);
  assert.equal(isExSkillByLabel(null), false);
});

test('classifySkillType returns correct category', () => {
  assert.equal(classifySkillType({ label: 'CharacterSkill09', is_restricted: 0 }), 'スキル');
  assert.equal(classifySkillType({ label: 'CharacterSkill09', is_restricted: 1 }), 'スキル（専用）');
  assert.equal(classifySkillType({ label: 'CharacterSkill51', is_restricted: 0 }), 'EXスキル');
  assert.equal(classifySkillType({ label: 'CharacterSkill51', is_restricted: 1 }), 'EXスキル（専用）');
  assert.equal(classifySkillType({ label: 'CharacterSkill51Ev1', is_restricted: 1 }), 'EXスキル（専用）');
  assert.equal(classifySkillType({ label: 'CharacterSkill51', isRestricted: true }), 'EXスキル（専用）');
  assert.equal(classifySkillType({}), null);
  assert.equal(classifySkillType(null), null);
});
