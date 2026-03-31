import test from 'node:test';
import assert from 'node:assert/strict';

import { buildEnemyList } from '../ui-next/utils/enemy-list.js';

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
    makeEnemy({ id: 13450045, name: '希望を喰むもの', in_date: '2023-06-24', od_rate: 0 }),
    makeEnemy({ id: 101, name: '1月ボス', in_date: '2026-01-05' }),
    makeEnemy({ id: 102, name: '2月ボス', in_date: '2026-02-05' }),
    makeEnemy({ id: 103, name: '3月ボス', in_date: '2026-03-05' }),
    makeEnemy({ id: 104, name: '4月ボス', in_date: '2026-04-05' }),
  ];

  const result = buildEnemyList(enemies, new Date('2026-04-30T00:00:00+09:00'));

  assert.deepEqual(
    result.map((enemy) => [enemy.id, enemy.dimension]),
    [
      [13450045, null],
      [104, 202604],
      [103, 202603],
      [102, 202602],
    ],
  );
});

test('buildEnemyList spans the year boundary for the recent three months window', () => {
  const enemies = [
    makeEnemy({ id: 13450045, name: '希望を喰むもの', in_date: '2023-06-24' }),
    makeEnemy({ id: 201, name: '10月ボス', in_date: '2025-10-05' }),
    makeEnemy({ id: 202, name: '11月ボス', in_date: '2025-11-05' }),
    makeEnemy({ id: 203, name: '12月ボス', in_date: '2025-12-05' }),
    makeEnemy({ id: 204, name: '1月ボス', in_date: '2026-01-05' }),
  ];

  const result = buildEnemyList(enemies, new Date('2026-01-30T00:00:00+09:00'));

  assert.deepEqual(
    result.map((enemy) => enemy.id),
    [13450045, 204, 203, 202],
  );
});