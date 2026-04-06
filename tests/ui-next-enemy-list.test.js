import test from 'node:test';
import assert from 'node:assert/strict';

import { buildEnemyList } from '../ui-next/utils/enemy-list.js';
import {
  ALWAYS_VISIBLE_ENEMY_PRESET_IDS,
  DEATH_SLUG_WHITE_SAMPLE_ENEMY,
  DEFAULT_SUMMON_SAMPLE_ENEMY,
  PINNED_INITIAL_SETUP_ENEMY,
} from '../src/data/enemy-sample-presets.js';

function makeEnemy({
  id,
  name,
  in_date,
  is_boss = true,
  od_rate = 0,
  max_d_rate = 999,
  absorbElementList = [],
}) {
  return {
    id,
    name,
    in_date,
    flags: { is_boss },
    base_param: {
      od_rate,
      max_d_rate,
    },
    resistances: {
      element: {
        slash: 0,
        stab: 0,
        strike: 0,
        fire: 0,
        ice: 0,
        thunder: 0,
        light: 0,
        dark: 0,
        nonelement: 0,
        absorb_element_list: absorbElementList,
      },
    },
  };
}

test('buildEnemyList uses the current month and previous two months, not quarter boundaries', () => {
  const enemies = [
    makeEnemy({ id: PINNED_INITIAL_SETUP_ENEMY.id, name: PINNED_INITIAL_SETUP_ENEMY.name, in_date: '2023-06-24', od_rate: 0 }),
    makeEnemy({ id: 101, name: '1月ボス', in_date: '2026-01-05' }),
    makeEnemy({ id: 102, name: '2月ボス', in_date: '2026-02-05' }),
    makeEnemy({ id: 103, name: '3月ボス', in_date: '2026-03-05' }),
    makeEnemy({ id: 104, name: '4月ボス', in_date: '2026-04-05' }),
  ];

  const result = buildEnemyList(enemies, new Date('2026-04-30T00:00:00+09:00'));

  assert.deepEqual(
    result.map((enemy) => [enemy.id, enemy.dimension]),
    [
      [PINNED_INITIAL_SETUP_ENEMY.id, null],
      [104, 202604],
      [103, 202603],
      [102, 202602],
    ],
  );
});

test('buildEnemyList spans the year boundary for the recent three months window', () => {
  const enemies = [
    makeEnemy({ id: PINNED_INITIAL_SETUP_ENEMY.id, name: PINNED_INITIAL_SETUP_ENEMY.name, in_date: '2023-06-24' }),
    makeEnemy({ id: 201, name: '10月ボス', in_date: '2025-10-05' }),
    makeEnemy({ id: 202, name: '11月ボス', in_date: '2025-11-05' }),
    makeEnemy({ id: 203, name: '12月ボス', in_date: '2025-12-05' }),
    makeEnemy({ id: 204, name: '1月ボス', in_date: '2026-01-05' }),
  ];

  const result = buildEnemyList(enemies, new Date('2026-01-30T00:00:00+09:00'));

  assert.deepEqual(
    result.map((enemy) => enemy.id),
    [PINNED_INITIAL_SETUP_ENEMY.id, 204, 203, 202],
  );
});

test('buildEnemyList keeps the summon sample enemies pinned when they are present', () => {
  const enemies = [
    makeEnemy({
      id: PINNED_INITIAL_SETUP_ENEMY.id,
      name: PINNED_INITIAL_SETUP_ENEMY.name,
      in_date: '2023-06-24',
    }),
    makeEnemy({
      id: DEATH_SLUG_WHITE_SAMPLE_ENEMY.id,
      name: DEATH_SLUG_WHITE_SAMPLE_ENEMY.name,
      in_date: '2026-02-20',
    }),
    makeEnemy({
      id: DEFAULT_SUMMON_SAMPLE_ENEMY.id,
      name: DEFAULT_SUMMON_SAMPLE_ENEMY.name,
      in_date: '2026-02-20',
      absorbElementList: ['fire'],
    }),
  ];

  const result = buildEnemyList(enemies, new Date('2026-04-30T00:00:00+09:00'));

  assert.deepEqual(
    result.map((enemy) => enemy.id),
    ALWAYS_VISIBLE_ENEMY_PRESET_IDS.filter((enemyId) => enemies.some((enemy) => enemy.id === enemyId)),
  );
  assert.deepEqual(
    result.find((enemy) => enemy.id === DEFAULT_SUMMON_SAMPLE_ENEMY.id)?.absorbElementList,
    ['fire'],
  );
});
