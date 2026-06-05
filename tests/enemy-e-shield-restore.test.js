import test from 'node:test';
import assert from 'node:assert/strict';

import {
  normalizeEnemyEShieldState,
  restoreEShieldStateToMax,
  restoreEShieldStateToStageMax,
} from '../src/domain/enemy-e-shield.js';

test('restoreEShieldStateToMax returns null when source is null', () => {
  assert.equal(restoreEShieldStateToMax(null), null);
  assert.equal(restoreEShieldStateToMax(undefined), null);
});

test('restoreEShieldStateToMax returns null when state cannot be normalized', () => {
  // elements が空であれば normalize は null を返す
  assert.equal(restoreEShieldStateToMax({ current: 0, max: 30, elements: [] }), null);
});

test('restoreEShieldStateToMax restores current to max while preserving other fields', () => {
  const source = {
    current: 0,
    max: 30,
    elements: ['Fire', 'Wind'],
    defUpRate: 50,
    damageLimit: 9999,
  };
  const restored = restoreEShieldStateToMax(source);
  assert.equal(restored.current, 30);
  assert.equal(restored.max, 30);
  assert.deepEqual(restored.elements, ['Fire', 'Wind']);
  assert.equal(restored.defUpRate, 50);
  assert.equal(restored.damageLimit, 9999);
});

test('restoreEShieldStateToMax keeps max when current already equals max', () => {
  const source = { current: 30, max: 30, elements: ['Fire'] };
  const restored = restoreEShieldStateToMax(source);
  assert.equal(restored.current, 30);
  assert.equal(restored.max, 30);
});

test('restoreEShieldStateToMax handles partial damage state (current < max)', () => {
  const source = { current: 17, max: 45, elements: ['Earth'] };
  const restored = restoreEShieldStateToMax(source);
  assert.equal(restored.current, 45);
});

test('restoreEShieldStateToMax does not mutate input', () => {
  const source = { current: 0, max: 30, elements: ['Fire'] };
  const restored = restoreEShieldStateToMax(source);
  assert.equal(source.current, 0);
  // elements 配列も独立であること
  restored.elements.push('Water');
  assert.deepEqual(source.elements, ['Fire']);
});

test('normalizeEnemyEShieldState clamps current to max (regression: input source for restore)', () => {
  const normalized = normalizeEnemyEShieldState({
    current: 99,
    max: 30,
    elements: ['Fire'],
  });
  assert.equal(normalized.current, 30);
  assert.equal(normalized.max, 30);
});

test('restoreEShieldStateToStageMax restores current and max from stage-specific values', () => {
  const source = {
    current: 0,
    max: 30,
    maxByStage: [30, 35, 40],
    elements: ['Fire', 'Light', 'Dark'],
    defUpRate: 9900,
  };

  const restored = restoreEShieldStateToStageMax(source, 2);

  assert.deepEqual(restored, {
    current: 40,
    max: 40,
    maxByStage: [30, 35, 40],
    elements: ['Fire', 'Light', 'Dark'],
    defUpRate: 9900,
    damageLimit: 0,
  });
  assert.deepEqual(source.maxByStage, [30, 35, 40]);
});

test('restoreEShieldStateToStageMax falls back to current max when stage value is absent', () => {
  const restored = restoreEShieldStateToStageMax({
    current: 0,
    max: 30,
    maxByStage: [30],
    elements: ['Fire'],
  }, 1);

  assert.equal(restored.current, 30);
  assert.equal(restored.max, 30);
});
