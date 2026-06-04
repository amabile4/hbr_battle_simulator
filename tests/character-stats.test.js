import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeCharacterStats,
  normalizeStatsByPartyIndex,
  resolveStatsWithSupport,
} from '../src/domain/character-stats.js';

const MAIN_STATS = Object.freeze({
  str: 650,
  dex: 660,
  wis: 670,
  spr: 680,
  luk: 690,
  con: 700,
});

test('resolveStatsWithSupport adds 10% of each support stat', () => {
  const supportStats = {
    str: 100,
    dex: 110,
    wis: 120,
    spr: 130,
    luk: 140,
    con: 150,
  };

  assert.deepEqual(resolveStatsWithSupport(MAIN_STATS, supportStats), {
    str: 660,
    dex: 671,
    wis: 682,
    spr: 693,
    luk: 704,
    con: 715,
  });
});

test('resolveStatsWithSupport returns main stats without support and rejects incomplete main stats', () => {
  assert.deepEqual(resolveStatsWithSupport(MAIN_STATS), MAIN_STATS);
  assert.equal(resolveStatsWithSupport({ str: 650 }), null);
});

test('normalizers reject incomplete stats and preserve valid slot entries', () => {
  assert.equal(normalizeCharacterStats({ str: 650 }), null);
  assert.deepEqual(normalizeStatsByPartyIndex({
    0: { stats: MAIN_STATS },
    1: { supportStats: MAIN_STATS },
    2: { stats: { str: 650 } },
  }), {
    0: { stats: MAIN_STATS },
    1: { supportStats: MAIN_STATS },
  });
});
