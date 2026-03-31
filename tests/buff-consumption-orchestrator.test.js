import test from 'node:test';
import assert from 'node:assert/strict';

import { shouldConsume, validateBuffMetadata } from '../src/domain/character-style.js';
import { buildActionContext, evaluateCompetitiveConsumption } from '../src/turn/turn-controller.js';

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

test('evaluateCompetitiveConsumptionはCount勝ちの selectedEffects を維持しつつ非ダメージでは消費IDを返さない', () => {
  const countA = createEffect({ effectId: 11, power: 0.4 });
  const countB = createEffect({ effectId: 12, power: 0.3 });
  const only = createEffect({ effectId: 13, limitType: 'Only', power: 0.6 });
  const actionContext = buildActionContext('Skill', {
    parts: [{ skill_type: 'AttackUp' }],
  });

  const result = evaluateCompetitiveConsumption([countA, countB, only], actionContext, { countLimit: 2 });

  assert.deepEqual(result.selectedEffects.map((effect) => Number(effect.effectId)), [11, 12]);
  assert.deepEqual(result.selectedCountEffectIds, []);
});

test('evaluateCompetitiveConsumptionはCount勝ちの selectedCountEffectIds を与ダメージ行動で返す', () => {
  const countA = createEffect({ effectId: 21, power: 0.4 });
  const countB = createEffect({ effectId: 22, power: 0.3 });
  const only = createEffect({ effectId: 23, limitType: 'Only', power: 0.6 });
  const actionContext = buildActionContext('Skill', {
    parts: [{ skill_type: 'AttackSkill' }],
  });

  const result = evaluateCompetitiveConsumption([countA, countB, only], actionContext, { countLimit: 2 });

  assert.deepEqual(result.selectedEffects.map((effect) => Number(effect.effectId)), [21, 22]);
  assert.deepEqual(result.selectedCountEffectIds, [21, 22]);
});

test('evaluateCompetitiveConsumptionはwarningモードで不正metadataを警告しつつ消費候補を維持する', () => {
  const invalid = createEffect({
    effectId: 31,
    limitType: 'Invalid',
    power: 0.5,
  });
  const actionContext = buildActionContext('Skill', {
    parts: [{ skill_type: 'AttackSkill' }],
  });
  const warnings = [];

  const result = evaluateCompetitiveConsumption([invalid], actionContext, {
    countLimit: 2,
    buffMetadataValidation: {
      enabled: true,
      mode: 'warning',
      onWarning: (message) => warnings.push(String(message)),
    },
  });

  assert.deepEqual(result.selectedCountEffectIds, [31]);
  assert.equal(warnings.length, 1);
});

test('evaluateCompetitiveConsumptionはstrictモードで不正metadataの消費候補を除外する', () => {
  const invalid = createEffect({
    effectId: 41,
    limitType: 'Invalid',
    power: 0.5,
  });
  const actionContext = buildActionContext('Skill', {
    parts: [{ skill_type: 'AttackSkill' }],
  });

  const result = evaluateCompetitiveConsumption([invalid], actionContext, {
    countLimit: 2,
    buffMetadataValidation: {
      enabled: true,
      mode: 'strict',
      onWarning: () => {},
    },
  });

  assert.deepEqual(result.selectedCountEffectIds, []);
});
