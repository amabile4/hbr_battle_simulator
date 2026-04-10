import test from 'node:test';
import assert from 'node:assert/strict';

import { generateT33SkillPassiveAudit } from '../scripts/generate-t33-skill-passive-audit.mjs';

test('T33 audit summary matches the post-talisman-completion baseline', () => {
  const report = generateT33SkillPassiveAudit();

  assert.equal(report.counts.structuralConditionGaps, 0);
  assert.equal(report.counts.structuralOverwriteGaps, 0);
  assert.equal(report.counts.structuralEnemyStatusGaps, 0);
  assert.equal(report.counts.silentSkipEnemyStatusCandidates, 4);
  assert.equal(report.counts.logicGapCount, 0);
  assert.deepEqual(report.logicGaps, []);
  assert.equal(report.counts.staleDocFalsePositiveCount, 0);
  assert.deepEqual(report.staleDocFalsePositives, []);

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

test('恐怖の叫び is no longer reported as a T33 logic gap', () => {
  const report = generateT33SkillPassiveAudit();
  assert.equal(
    report.logicGaps.some((item) => item.sourceName === '恐怖の叫び'),
    false
  );
});

test('もつれトラップ is no longer reported as a structural enemy status gap', () => {
  const report = generateT33SkillPassiveAudit();
  assert.equal(report.counts.structuralEnemyStatusGaps, 0);
});
