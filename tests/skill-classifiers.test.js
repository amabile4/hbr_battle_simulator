import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isAdmiralCommandSkill,
  isNormalAttackSkill,
  isPursuitOnlySkill,
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
