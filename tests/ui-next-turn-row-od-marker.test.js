import test from 'node:test';
import assert from 'node:assert/strict';

import { resolveOdMarkerLabel } from '../ui-next/components/turn-row.js';

test('resolveOdMarkerLabel prefers OD sub-turn index for ODx-y labels', () => {
  assert.equal(resolveOdMarkerLabel('OD2-1'), 'OD1');
  assert.equal(resolveOdMarkerLabel('OD2-2'), 'OD2');
  assert.equal(resolveOdMarkerLabel('OD3-3'), 'OD3');
});

test('resolveOdMarkerLabel falls back to level label for legacy OD labels', () => {
  assert.equal(resolveOdMarkerLabel('OD1'), 'OD1');
  assert.equal(resolveOdMarkerLabel('OD2'), 'OD2');
  assert.equal(resolveOdMarkerLabel('T18'), '');
  assert.equal(resolveOdMarkerLabel('T18', { fallback: 'OD' }), 'OD');
});
