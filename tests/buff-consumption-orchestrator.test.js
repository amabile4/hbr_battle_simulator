import test from 'node:test';
import assert from 'node:assert/strict';

import { shouldConsume, validateBuffMetadata } from '../src/domain/character-style.js';
import { buildActionContext } from '../src/turn/turn-controller.js';

function createEffect(overrides = {}) {
  return {
    effectId: 1,
    statusType: 'Funnel',
    exitCond: 'Count',
    limitType: 'Default',
    remaining: 1,
    metadata: {},
    ...overrides,
  };
}

test('Count型は通常攻撃(ダメージあり)で消費する', () => {
  const result = shouldConsume(
    createEffect(),
    { actionType: 'NormalAttack', hasDamage: true, turnPhase: 'PlayerTurn' }
  );

  assert.equal(result.shouldConsume, true);
  assert.equal(result.consumeAmount, 1);
});

test('Count型はダメージなしSkillで消費しない', () => {
  const result = shouldConsume(
    createEffect(),
    { actionType: 'Skill', hasDamage: false, turnPhase: 'PlayerTurn' }
  );

  assert.equal(result.shouldConsume, false);
  assert.equal(result.consumeAmount, 0);
});

test('Count型はAdditionalTurnのダメージ行動で消費する', () => {
  const result = shouldConsume(
    createEffect(),
    { actionType: 'AdditionalTurn', hasDamage: true, turnPhase: 'AdditionalTurn' }
  );

  assert.equal(result.shouldConsume, true);
  assert.equal(result.consumeAmount, 1);
});

test('PlayerTurnEnd型はTurnEnd/PlayerTurnEndでのみ消費する', () => {
  const effect = createEffect({
    statusType: 'AttackUp',
    exitCond: 'PlayerTurnEnd',
  });

  const consumeAtTurnEnd = shouldConsume(effect, {
    actionType: 'TurnEnd',
    hasDamage: false,
    turnPhase: 'PlayerTurnEnd',
  });
  const noConsumeAtSkill = shouldConsume(effect, {
    actionType: 'Skill',
    hasDamage: true,
    turnPhase: 'PlayerTurn',
  });

  assert.equal(consumeAtTurnEnd.shouldConsume, true);
  assert.equal(noConsumeAtSkill.shouldConsume, false);
});

test('Eternal型はManualでのみ消費する', () => {
  const effect = createEffect({
    statusType: 'BuffCharge',
    exitCond: 'Eternal',
    limitType: 'Only',
    remaining: 0,
  });

  const consumeAtManual = shouldConsume(effect, {
    actionType: 'Manual',
    hasDamage: false,
    turnPhase: 'PlayerTurn',
  });
  const noConsumeAtNormal = shouldConsume(effect, {
    actionType: 'NormalAttack',
    hasDamage: true,
    turnPhase: 'PlayerTurn',
  });

  assert.equal(consumeAtManual.shouldConsume, true);
  assert.equal(noConsumeAtNormal.shouldConsume, false);
});

test('validateBuffMetadataはremaining=0のEternal + limitType!=Onlyをエラーにする', () => {
  const errors = validateBuffMetadata(
    createEffect({
      statusType: 'BuffCharge',
      exitCond: 'Eternal',
      limitType: 'Default',
      remaining: 0,
    })
  );

  assert.ok(errors.includes('Eternal effects should have limitType=Only'));
});

test('buildActionContextはOD_DAMAGE_PART_TYPESに含まれるskill_typeをダメージ扱いする', () => {
  const context = buildActionContext('Skill', {
    parts: [{ skill_type: 'AttackSkill' }],
  });

  assert.equal(context.hasDamage, true);
});

test('buildActionContextは非ダメージskill_typeをダメージ扱いしない', () => {
  const context = buildActionContext('Skill', {
    parts: [{ skill_type: 'AttackUp' }],
  });

  assert.equal(context.hasDamage, false);
});
