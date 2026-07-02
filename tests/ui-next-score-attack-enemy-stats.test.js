import test from 'node:test';
import assert from 'node:assert/strict';

import {
  isScoreAttackEnemyLabel,
  normalizeScoreAttackEvents,
  resolveScoreAttackGrade40Stats,
  resolveScoreAttackStatsByGrade,
  buildScoreAttackEventEnemyPresets,
  SCORE_ATTACK_MIN_SUPPORTED_EVENT_ID,
  SCORE_ATTACK_EVENT_CATEGORY_KEY,
} from '../ui-next/utils/score-attack-enemy-stats.js';

function makeBattle({ d, dn, b, rbl, dl, hl }) {
  return { d, dn, b, rbl, dl, hl };
}

const SAMPLE_EVENT = {
  id: 145000098,
  name: '#98 Ambush of the Past',
  in_date: '2026-06-19 02:00:00+00:00',
  battles: [
    makeBattle({ d: 1, dn: 'ビギナー', b: ['SwellCrowOchre_scoreattack98_a'], rbl: [160, 0, 0], dl: [5000, 0, 0], hl: [10000, 0, 0] }),
    makeBattle({ d: 40, dn: 'アビス', b: ['SwellCrowOchre_scoreattack98_g'], rbl: [770, 0, 0], dl: [1800000, 0, 0], hl: [110000000, 0, 0] }),
  ],
};

const OLD_EVENT = {
  id: 145000001,
  name: 'scoreAttack1',
  in_date: '2022-04-08 02:00:00+00:00',
  battles: [
    makeBattle({ d: 40, dn: 'アビス', b: ['SwellCrowOchre_scoreattack98_g'], rbl: [65, 0, 0], dl: [9000, 0, 0], hl: [30000, 0, 0] }),
  ],
};

test('isScoreAttackEnemyLabel matches scoreattack labels case-insensitively', () => {
  assert.equal(isScoreAttackEnemyLabel('SwellCrowOchre_scoreattack98_g'), true);
  assert.equal(isScoreAttackEnemyLabel('DeathSlug2nd_ScoreAttack_a'), true);
  assert.equal(isScoreAttackEnemyLabel('Hard_DeathSlug1st'), false);
  assert.equal(isScoreAttackEnemyLabel(''), false);
  assert.equal(isScoreAttackEnemyLabel(undefined), false);
});

test('normalizeScoreAttackEvents converts the score_attack.json object-map shape into an array', () => {
  const raw = { 0: SAMPLE_EVENT, 1: { id: 1, in_date: null } };
  const events = normalizeScoreAttackEvents(raw);
  assert.equal(events.length, 1, 'battles を持たないイベントは除外される');
  assert.equal(events[0].id, SAMPLE_EVENT.id);
});

test('normalizeScoreAttackEvents passes through an already-array shape', () => {
  const events = normalizeScoreAttackEvents([SAMPLE_EVENT]);
  assert.equal(events.length, 1);
});

test('normalizeScoreAttackEvents returns an empty array for invalid input', () => {
  assert.deepEqual(normalizeScoreAttackEvents(null), []);
  assert.deepEqual(normalizeScoreAttackEvents(undefined), []);
  assert.deepEqual(normalizeScoreAttackEvents('not json'), []);
});

test('resolveScoreAttackGrade40Stats resolves rbl/dl/hl at d===40 from the matching event', () => {
  const stats = resolveScoreAttackGrade40Stats('SwellCrowOchre_scoreattack98_g', [SAMPLE_EVENT]);
  assert.deepEqual(stats, { param_border: 770, dp: 1800000, hp: 110000000 });
});

test('resolveScoreAttackGrade40Stats prefers the most recent event when the label appears in multiple events', () => {
  const stats = resolveScoreAttackGrade40Stats('SwellCrowOchre_scoreattack98_g', [OLD_EVENT, SAMPLE_EVENT]);
  assert.deepEqual(stats, { param_border: 770, dp: 1800000, hp: 110000000 });
});

test('resolveScoreAttackGrade40Stats returns null when the label is not found', () => {
  assert.equal(resolveScoreAttackGrade40Stats('UnknownEnemy_scoreattack1_a', [SAMPLE_EVENT]), null);
});

test('resolveScoreAttackGrade40Stats returns null when the matching event has no d===40 battle', () => {
  const eventWithoutGrade40 = {
    ...SAMPLE_EVENT,
    battles: [SAMPLE_EVENT.battles[0]],
  };
  assert.equal(resolveScoreAttackGrade40Stats('SwellCrowOchre_scoreattack98_a', [eventWithoutGrade40]), null);
});

test('resolveScoreAttackGrade40Stats returns null for empty/invalid inputs', () => {
  assert.equal(resolveScoreAttackGrade40Stats('', [SAMPLE_EVENT]), null);
  assert.equal(resolveScoreAttackGrade40Stats('SwellCrowOchre_scoreattack98_g', []), null);
  assert.equal(resolveScoreAttackGrade40Stats('SwellCrowOchre_scoreattack98_g', undefined), null);
});

test('resolveScoreAttackStatsByGrade resolves an arbitrary difficulty, not only 40', () => {
  const stats = resolveScoreAttackStatsByGrade('SwellCrowOchre_scoreattack98_a', [SAMPLE_EVENT], 1);
  assert.deepEqual(stats, { param_border: 160, dp: 5000, hp: 10000 });
});

test('normalizeScoreAttackEvents excludes events before the supported cutoff id', () => {
  const raw = { 0: OLD_EVENT, 1: SAMPLE_EVENT };
  const events = normalizeScoreAttackEvents(raw);
  assert.equal(events.length, 1, 'カットオフ未満のレガシー形式イベントは除外される');
  assert.equal(events[0].id, SAMPLE_EVENT.id);
  assert.ok(SAMPLE_EVENT.id >= SCORE_ATTACK_MIN_SUPPORTED_EVENT_ID);
  assert.ok(OLD_EVENT.id < SCORE_ATTACK_MIN_SUPPORTED_EVENT_ID);
});

function makeMinimalEvent({ id, name, in_date, battles }) {
  return { id, name, in_date, battles };
}

const EVENT_98 = makeMinimalEvent({
  id: 145000098,
  name: '#98 Ambush of the Past',
  in_date: '2026-06-19 02:00:00+00:00',
  battles: [
    makeBattle({ d: 1, dn: 'ビギナー', b: ['SwellCrowOchre_scoreattack98_a'], rbl: [160, 0, 0], dl: [5000, 0, 0], hl: [10000, 0, 0] }),
  ].map((b) => ({ ...b, bn: [{ n: 'オーカークロウ' }] })),
});

const EVENT_91 = makeMinimalEvent({
  id: 145000091,
  name: '#91 The lurking despair',
  in_date: '2026-02-13 02:00:00+00:00',
  battles: [
    { d: 1, dn: 'ビギナー', b: ['DesertDendronNether_scoreattack91_a'], bn: [{ n: 'ネザーデンドロン' }] },
  ],
});

// #94相当: 先頭バトルの1体目がラベル空文字・bn=null、2体目から有効データが取れる例
const EVENT_94_LIKE = makeMinimalEvent({
  id: 145000094,
  name: '#94 Endless Phantom',
  in_date: '2026-04-10 02:00:00+00:00',
  battles: [
    { d: 1, dn: 'ビギナー', b: ['', 'CatHornFigurine_scoreattack94_a_a', 'CatHornFigurine_scoreattack94_a_b'], bn: [null, { n: 'フィギュリンホーン' }, { n: 'フィギュリンホーン' }] },
  ],
});

const EVENT_TOO_OLD = makeMinimalEvent({
  id: 145000001,
  name: 'スコアアタック1',
  in_date: '2022-04-08 02:00:00+00:00',
  battles: [
    { d: 1, dn: 'ビギナー', b: ['DeathSlug1st_scoreattack_a'], bn: [{ n: 'デススラッグ' }] },
  ],
});

test('buildScoreAttackEventEnemyPresets extracts a representative label/name per event', () => {
  const presets = buildScoreAttackEventEnemyPresets([EVENT_91, EVENT_98]);
  const preset98 = presets.find((p) => p.name.includes('オーカークロウ'));
  assert.ok(preset98, 'イベント名+代表種族名が含まれること');
  assert.equal(preset98.label, 'SwellCrowOchre_scoreattack98_a');
  assert.equal(preset98.categoryKey, SCORE_ATTACK_EVENT_CATEGORY_KEY);
});

test('buildScoreAttackEventEnemyPresets skips empty label / null bn entries and uses the next valid one', () => {
  const presets = buildScoreAttackEventEnemyPresets([EVENT_94_LIKE]);
  assert.equal(presets.length, 1);
  assert.equal(presets[0].label, 'CatHornFigurine_scoreattack94_a_a');
  assert.ok(presets[0].name.includes('フィギュリンホーン'));
});

test('buildScoreAttackEventEnemyPresets excludes events before the supported cutoff id', () => {
  const presets = buildScoreAttackEventEnemyPresets([EVENT_TOO_OLD, EVENT_98]);
  assert.equal(presets.length, 1);
  assert.equal(presets[0].label, 'SwellCrowOchre_scoreattack98_a');
});

test('buildScoreAttackEventEnemyPresets sorts newest event first (descending by event id)', () => {
  const presets = buildScoreAttackEventEnemyPresets([EVENT_91, EVENT_98]);
  assert.deepEqual(presets.map((p) => -p.id), [145000098, 145000091]);
});

test('buildScoreAttackEventEnemyPresets assigns a unique negative id per event', () => {
  const presets = buildScoreAttackEventEnemyPresets([EVENT_91, EVENT_98]);
  assert.ok(presets.every((p) => p.id < 0));
  assert.deepEqual(new Set(presets.map((p) => p.id)).size, presets.length);
});

test('buildScoreAttackEventEnemyPresets returns an empty array for invalid input', () => {
  assert.deepEqual(buildScoreAttackEventEnemyPresets(null), []);
  assert.deepEqual(buildScoreAttackEventEnemyPresets(undefined), []);
});
