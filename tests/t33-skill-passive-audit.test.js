import test from 'node:test';
import assert from 'node:assert/strict';

import { generateT33SkillPassiveAudit } from '../scripts/generate-t33-skill-passive-audit.mjs';

test('T33 audit summary matches the phase-1 baseline', () => {
  const report = generateT33SkillPassiveAudit();

  assert.equal(report.counts.structuralConditionGaps, 0);
  assert.equal(report.counts.structuralOverwriteGaps, 0);
  assert.equal(report.counts.structuralEnemyStatusGaps, 0);
  assert.equal(report.counts.silentSkipEnemyStatusCandidates, 3);
  assert.equal(report.counts.logicGapCount, 1);

  assert.deepEqual(
    report.logicGaps.map((item) => item.key),
    ['stylePassive:57001275']
  );
  assert.equal(report.logicGaps[0].sourceName, '恐怖の叫び');
  assert.equal(report.logicGaps[0].styleName, 'ようこそ♪ナイトメア・パレード');
  assert.equal(report.logicGaps[0].controlCaseKey, 'skillPassive:46401601');

  assert.deepEqual(
    report.staleDocFalsePositives.map((item) => item.key),
    [
      'stylePassive:57001121',
      'stylePassive:57001147',
      'stylePassive:57001219',
      'topic:additional-hit-on-breaking-attackup',
      'topic:on-overdrive-start',
    ]
  );
  assert.ok(report.staleDocFalsePositives.some((item) => item.sourceName === '浄化の喝采'));
  assert.ok(report.staleDocFalsePositives.some((item) => item.sourceName === 'ライトプロテクション'));
  assert.ok(report.staleDocFalsePositives.some((item) => item.sourceName === '役者魂'));

  assert.deepEqual(
    report.outOfScope.map((item) => item.key),
    [
      'task:conquest-bike-level-ui-override',
      'task:mark-territory-visibility',
      'task:pri-018-skill-usage-limits',
    ]
  );

  assert.ok(
    report.observabilityGaps.some((item) => item.key === 'topic:on-every-turn-include-special-passive-log')
  );
  assert.ok(
    report.observabilityGaps.some((item) => item.key === 'topic:style-embedded-passive-audit-surface')
  );
});

test.todo('恐怖の叫び: EX 使用後に Talisman level-up が発火する');
