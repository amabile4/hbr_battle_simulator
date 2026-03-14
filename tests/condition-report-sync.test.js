import test from 'node:test';
import assert from 'node:assert/strict';

import { listUnsupportedConditionClausesByRuntimeSupport } from '../src/turn/turn-controller.js';

test('report helper treats implemented PRI-014 clauses as supported', () => {
  const supportedExpressions = [
    '0.0 < DpRate()',
    'HasSkill(YoOhshimaSkill53)==1',
    'RemoveDebuffCount()>0',
    'TargetBreakDownTurn()>0',
    'SpecialStatusCountByType(146) > 0',
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

test('report helper keeps PRI-015 enemy-side gaps unresolved', () => {
  const unresolved = 'CountBC(IsDead()==0 && IsPlayer()==0&&SpecialStatusCountByType(172)>0)>0';

  assert.deepEqual(listUnsupportedConditionClausesByRuntimeSupport(unresolved), [unresolved]);
});
