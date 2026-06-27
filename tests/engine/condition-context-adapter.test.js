import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildConditionContext,
  buildSpecialStatusesMap,
  evaluateConditionExpression,
} from '../../src/engine/condition-context-adapter.js';

test('buildSpecialStatusesMap: active finite and Eternal effects are counted', () => {
  const member = {
    statusEffects: [
      { metadata: { specialStatusTypeId: 25 }, exitCond: 'Count', remaining: 2 },
      { metadata: { specialStatusTypeId: 25 }, exitCond: 'Turn', remaining: 1 },
      { metadata: { specialStatusTypeId: 57 }, exitCond: 'Turn', remaining: 0 },
      { metadata: { specialStatusTypeId: 172 }, exitCond: 'Eternal', remaining: 0 },
      { metadata: {}, exitCond: 'Eternal', remaining: 0 },
    ],
  };

  const result = buildSpecialStatusesMap(member);

  assert.deepEqual([...result.entries()], [[25, 2], [172, 1]]);
});

test('buildConditionContext: existing battle objects are mapped to ConditionContext', () => {
  const member = {
    sp: { current: 12 },
    ep: { current: 3 },
    dpRate: 0.75,
    token: { current: 4 },
    position: 1,
    isAlive: true,
    characterId: 'RKayamori',
    role: 'Attacker',
    elements: ['Fire'],
    weaponElement: 'Fire',
    statusEffects: [
      { metadata: { specialStatusTypeId: 25 }, exitCond: 'Count', remaining: 1 },
    ],
  };
  const state = {
    turnState: {
      turnIndex: 4,
      odGauge: 120,
      turnType: 'extra',
      odSuspended: true,
      zoneState: { type: 'Fire', remainingTurns: 2 },
      territoryState: { type: 'Ice', remainingTurns: 0 },
      enemyState: { talismanState: { active: true } },
    },
    party: [member],
  };
  const skill = { label: 'TestSkill', tier: 'SS', spCost: 8, element: 'Fire' };
  const actionEntry = { breakHitCount: 2, removeDebuffCount: 1, targetEnemyIndex: 0 };

  const context = buildConditionContext(state, member, skill, actionEntry);

  assert.deepEqual(context.state, {
    turnIndex: 4,
    odGauge: 120,
    zone: 'Fire',
    territory: 'None',
    talismanActive: true,
    isOverDrive: true,
  });
  assert.equal(context.member.sp.current, 12);
  assert.equal(context.member.token.current, 4);
  assert.equal(context.member.specialStatuses.get(25), 1);
  assert.equal(context.member.isPlayer, true);
  assert.equal(context.skill.label, 'TestSkill');
  assert.equal(context.action.targetEnemyIndex, 0);
  assert.equal(context.party.length, 1);
  assert.deepEqual(context.enemies, []);
});

test('evaluateConditionExpression: returns an IsOverDrive result as boolean', () => {
  const state = { turnState: { turnType: 'od' } };

  const result = evaluateConditionExpression('IsOverDrive()', state, {}, {});

  assert.equal(result, true);
  assert.equal(typeof result, 'boolean');
});
