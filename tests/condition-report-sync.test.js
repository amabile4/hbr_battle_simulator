import test from 'node:test';
import assert from 'node:assert/strict';

import {
  classifyEnemyStatusPartRuntimeSupport,
  listUnsupportedConditionClausesByRuntimeSupport,
} from '../src/turn/turn-controller.js';

test('report helper treats implemented PRI-014 clauses as supported', () => {
  const supportedExpressions = [
    '0.0 < DpRate()',
    'HasSkill(YoOhshimaSkill53)==1',
    'RemoveDebuffCount()>0',
    'TargetBreakDownTurn()>0',
    'SpecialStatusCountByType(146) > 0',
    'CountBC(IsPlayer()==0&&IsDead()==0&&SpecialStatusCountByType(3)>0)>0',
    'CountBC(IsPlayer()==0&&IsDead()==0&&SpecialStatusCountByType(22)>0)>0',
    'CountBC(IsDead()==0 && IsPlayer()==0&&SpecialStatusCountByType(172)>0)>0',
    'CountBC(IsPlayer() && IsTeam(31C)==1)>=3',
    'CountBC(IsPlayer()==0&&IsDead()==0&&IsBroken()==1&&DamageRate()>=200.0)>0',
    'CountBC(IsPlayer() == 1 && IsCharacter(ADate) == 1 && SpecialStatusCountByType(146) < 1) > 0',
  ];

  for (const expression of supportedExpressions) {
    assert.deepEqual(
      listUnsupportedConditionClausesByRuntimeSupport(expression),
      [],
      `expected supported expression: ${expression}`
    );
  }
});

test('report helper keeps unknown enemy-side special status ids unresolved', () => {
  const unresolved = 'CountBC(IsDead()==0 && IsPlayer()==0&&SpecialStatusCountByType(999)>0)>0';

  assert.deepEqual(listUnsupportedConditionClausesByRuntimeSupport(unresolved), [unresolved]);
});

test('enemy status report helper matches PRI-015 runtime support boundary', () => {
  const supportedActionDefenseDown = classifyEnemyStatusPartRuntimeSupport(
    {
      skill_type: 'DefenseDown',
      target_type: 'Single',
      effect: { exitCond: 'EnemyTurnEnd', limitType: 'Default' },
    },
    { isPassiveSource: false }
  );
  assert.equal(supportedActionDefenseDown.isEnemyStatusCandidate, true);
  assert.equal(supportedActionDefenseDown.supported, true);

  const supportedActionSuperBreakDown = classifyEnemyStatusPartRuntimeSupport(
    {
      skill_type: 'SuperBreakDown',
      target_type: 'Single',
      effect: { exitCond: 'None', limitType: 'None' },
    },
    { isPassiveSource: false }
  );
  assert.equal(supportedActionSuperBreakDown.isEnemyStatusCandidate, true);
  assert.equal(supportedActionSuperBreakDown.supported, true);

  const supportedPassiveTalisman = classifyEnemyStatusPartRuntimeSupport(
    {
      skill_type: 'Talisman',
      target_type: 'All',
      effect: { exitCond: 'Eternal', limitType: 'None' },
    },
    { isPassiveSource: true }
  );
  assert.equal(supportedPassiveTalisman.isEnemyStatusCandidate, true);
  assert.equal(supportedPassiveTalisman.supported, true);

  const unsupportedActionMisfortune = classifyEnemyStatusPartRuntimeSupport(
    {
      skill_type: 'Misfortune',
      target_type: 'Single',
      effect: { exitCond: 'EnemyTurnEnd', limitType: 'None' },
    },
    { isPassiveSource: false }
  );
  assert.equal(unsupportedActionMisfortune.isEnemyStatusCandidate, true);
  assert.equal(unsupportedActionMisfortune.supported, false);

  const unsupportedPassiveDefenseDown = classifyEnemyStatusPartRuntimeSupport(
    {
      skill_type: 'DefenseDown',
      target_type: 'All',
      effect: { exitCond: 'PlayerTurnEnd', limitType: 'None' },
    },
    { isPassiveSource: true }
  );
  assert.equal(unsupportedPassiveDefenseDown.isEnemyStatusCandidate, true);
  assert.equal(unsupportedPassiveDefenseDown.supported, false);
});
