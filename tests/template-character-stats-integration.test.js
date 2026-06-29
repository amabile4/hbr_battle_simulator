import test from 'node:test';
import assert from 'node:assert/strict';

import { CHARACTER_STAT_KEYS } from '../src/domain/character-stats.js';
import { createInitializedBattleSnapshot } from '../src/ui/adapter-core.js';
import { getStore } from './helpers.js';

const STYLE_IDS = Object.freeze([1001104, 1002103, 1003103]);
const SUPPORT_STYLE_ID = 1006506;
const LIMIT_BREAK_LEVELS = Object.freeze({ 0: 0, 1: 0, 2: 0 });

test('HbrDataStore concretizes automatic main/support stats and honors manual values', () => {
  const store = getStore();
  const withoutSupport = store.buildPartyFromStyleIds(STYLE_IDS, {
    limitBreakLevelsByPartyIndex: LIMIT_BREAK_LEVELS,
  });
  const automaticMain = withoutSupport.members[0].stats;

  const automatic = store.buildPartyFromStyleIds(STYLE_IDS, {
    limitBreakLevelsByPartyIndex: LIMIT_BREAK_LEVELS,
    supportStyleIdsByPartyIndex: { 0: SUPPORT_STYLE_ID },
    supportLimitBreakLevelsByPartyIndex: { 0: 0 },
  }).members[0];
  assert.ok(CHARACTER_STAT_KEYS.every((key) => Number.isInteger(automatic.supportStats[key])));
  assert.deepEqual(
    automatic.stats,
    Object.fromEntries(
      CHARACTER_STAT_KEYS.map((key) => [key, automaticMain[key] + Math.ceil(automatic.supportStats[key] / 10)])
    )
  );

  const manualSupport = { str: 101, dex: 111, wis: 121, spr: 131, luk: 141, con: 151 };
  const withManualSupport = store.buildPartyFromStyleIds(STYLE_IDS, {
    limitBreakLevelsByPartyIndex: LIMIT_BREAK_LEVELS,
    supportStyleIdsByPartyIndex: { 0: SUPPORT_STYLE_ID },
    supportLimitBreakLevelsByPartyIndex: { 0: 0 },
    statsByPartyIndex: { 0: { supportStats: manualSupport } },
  }).members[0];
  assert.deepEqual(withManualSupport.supportStats, manualSupport);
  assert.deepEqual(
    withManualSupport.stats,
    Object.fromEntries(
      CHARACTER_STAT_KEYS.map((key) => [key, automaticMain[key] + Math.ceil(manualSupport[key] / 10)])
    )
  );

  const manualMain = { str: 701, dex: 702, wis: 703, spr: 704, luk: 705, con: 706 };
  const withManualMain = store.buildPartyFromStyleIds(STYLE_IDS, {
    limitBreakLevelsByPartyIndex: LIMIT_BREAK_LEVELS,
    supportStyleIdsByPartyIndex: { 0: SUPPORT_STYLE_ID },
    supportLimitBreakLevelsByPartyIndex: { 0: 0 },
    statsByPartyIndex: { 0: { stats: manualMain, supportStats: manualSupport } },
  }).members[0];
  assert.deepEqual(withManualMain.stats, manualMain);
  assert.deepEqual(withManualMain.supportStats, manualSupport);
});

test('battle initialization freezes resolved automatic stats in turnPlanBaseSetup', () => {
  const snapshot = createInitializedBattleSnapshot({
    dataStore: getStore(),
    initialSP: 9,
    styleIds: STYLE_IDS,
    skillSetsByPartyIndex: {},
    limitBreakLevelsByPartyIndex: LIMIT_BREAK_LEVELS,
    drivePierceByPartyIndex: {},
    normalAttackElementsByPartyIndex: {},
    startSpEquipByPartyIndex: {},
    supportStyleIdsByPartyIndex: { 0: SUPPORT_STYLE_ID },
    supportLimitBreakLevelsByPartyIndex: { 0: 0 },
    statsByPartyIndex: {},
    initialOdGauge: 0,
    enemyCount: 1,
  });

  for (const member of snapshot.party.members) {
    assert.deepEqual(
      snapshot.turnPlanBaseSetup.statsByPartyIndex[String(member.partyIndex)].stats,
      member.stats
    );
  }
  assert.deepEqual(
    snapshot.turnPlanBaseSetup.statsByPartyIndex['0'].supportStats,
    snapshot.party.members[0].supportStats
  );
});
