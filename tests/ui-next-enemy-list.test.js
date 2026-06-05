import test from 'node:test';
import assert from 'node:assert/strict';

import { buildEnemyList } from '../ui-next/utils/enemy-list.js';
import {
  ALWAYS_VISIBLE_ENEMY_PRESET_IDS,
  DEATH_SLUG_WHITE_SAMPLE_ENEMY,
  DEFAULT_SUMMON_SAMPLE_ENEMY,
  E_SHIELD_SAMPLE_ENEMY,
  PINNED_INITIAL_SETUP_ENEMY,
} from '../src/data/enemy-sample-presets.js';

function makeEnemy({
  id,
  name,
  label = null,
  in_date,
  is_boss = true,
  od_rate = 0,
  max_d_rate = 999,
  absorbElementList = [],
  eShield = null,
  extraGaugeHp = null,
  eShieldMaxByStage = null,
}) {
  const extraGauge = {};
  if (eShield) {
    extraGauge.esp = eShield.esp ?? 0;
    if (Array.isArray(eShieldMaxByStage)) {
      extraGauge.esp_by_stage = [...eShieldMaxByStage];
    }
    extraGauge.eshield = {
      ele_list: eShield.ele_list ?? null,
      def_up_rate: eShield.def_up_rate ?? 0,
      dmg_limit: eShield.dmg_limit ?? 0,
    };
  }
  if (Array.isArray(extraGaugeHp)) {
    extraGauge.hp = [...extraGaugeHp];
  }
  return {
    id,
    name,
    ...(label ? { label } : {}),
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
    ...(Object.keys(extraGauge).length > 0
      ? {
          extra_gauge: extraGauge,
        }
      : {}),
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

test('buildEnemyList keeps the Eシールド sample enemy pinned in the template category', () => {
  const enemies = [
    makeEnemy({
      id: PINNED_INITIAL_SETUP_ENEMY.id,
      name: PINNED_INITIAL_SETUP_ENEMY.name,
      label: PINNED_INITIAL_SETUP_ENEMY.label,
      in_date: '2023-06-24',
    }),
    makeEnemy({
      id: E_SHIELD_SAMPLE_ENEMY.id,
      name: E_SHIELD_SAMPLE_ENEMY.name,
      label: E_SHIELD_SAMPLE_ENEMY.label,
      in_date: '2025-08-10',
      eShield: {
        esp: 30,
        ele_list: ['Fire', 'Ice'],
      },
    }),
  ];

  const result = buildEnemyList(enemies, new Date('2026-04-30T00:00:00+09:00'));

  assert.deepEqual(
    result.slice(0, 2).map((enemy) => enemy.id),
    [PINNED_INITIAL_SETUP_ENEMY.id, E_SHIELD_SAMPLE_ENEMY.id],
  );
  assert.equal(result[1].categoryKey, 'template');
  assert.deepEqual(result[1].e_shield, {
    count: 30,
    max: 30,
    elements: ['Fire', 'Ice'],
    def_up_rate: 0,
    dmg_limit: 0,
  });
});

test('buildEnemyList maps extra_gauge Eシールド metadata into enemy preset entries', () => {
  const enemies = [
    makeEnemy({ id: PINNED_INITIAL_SETUP_ENEMY.id, name: PINNED_INITIAL_SETUP_ENEMY.name, in_date: '2023-06-24' }),
    makeEnemy({
      id: 301,
      name: 'Eシールド敵',
      in_date: '2026-04-05',
      eShield: {
        esp: 10,
        ele_list: ['Light', 'Dark'],
        def_up_rate: 5000,
        dmg_limit: 0,
      },
    }),
  ];

  const result = buildEnemyList(enemies, new Date('2026-04-30T00:00:00+09:00'));
  const target = result.find((enemy) => enemy.id === 301);

  assert.deepEqual(target?.e_shield, {
    count: 10,
    max: 10,
    elements: ['Light', 'Dark'],
    def_up_rate: 5000,
    dmg_limit: 0,
  });
});

test('buildEnemyList maps stage-specific Eシールド values into enemy preset entries', () => {
  const enemies = [
    makeEnemy({ id: PINNED_INITIAL_SETUP_ENEMY.id, name: PINNED_INITIAL_SETUP_ENEMY.name, in_date: '2023-06-24' }),
    makeEnemy({
      id: 303,
      name: '段階Eシールド敵',
      in_date: '2026-06-05',
      eShield: {
        esp: 30,
        ele_list: ['Fire', 'Light', 'Dark'],
        def_up_rate: 9900,
        dmg_limit: 0,
      },
      eShieldMaxByStage: [30, 35, 40],
    }),
  ];

  const result = buildEnemyList(enemies, new Date('2026-06-05T00:00:00+09:00'));
  const target = result.find((enemy) => enemy.id === 303);

  assert.deepEqual(target?.e_shield, {
    count: 30,
    max: 30,
    maxByStage: [30, 35, 40],
    elements: ['Fire', 'Light', 'Dark'],
    def_up_rate: 9900,
    dmg_limit: 0,
  });
});

test('buildEnemyList drops inactive extra_gauge Eシールド metadata', () => {
  const enemies = [
    makeEnemy({ id: PINNED_INITIAL_SETUP_ENEMY.id, name: PINNED_INITIAL_SETUP_ENEMY.name, in_date: '2023-06-24' }),
    makeEnemy({
      id: 302,
      name: 'Eシールド0カウント敵',
      in_date: '2026-04-05',
      eShield: {
        esp: 0,
        ele_list: ['Light'],
        def_up_rate: 5000,
        dmg_limit: 0,
      },
    }),
    makeEnemy({
      id: 303,
      name: 'Eシールド属性なし敵',
      in_date: '2026-04-05',
      eShield: {
        esp: 10,
        ele_list: [],
        def_up_rate: 5000,
        dmg_limit: 0,
      },
    }),
  ];

  const result = buildEnemyList(enemies, new Date('2026-04-30T00:00:00+09:00'));

  assert.equal(result.find((enemy) => enemy.id === 302)?.e_shield, undefined);
  assert.equal(result.find((enemy) => enemy.id === 303)?.e_shield, undefined);
});

test('buildEnemyList maps extra_gauge hp metadata into enemy preset entries', () => {
  const enemies = [
    makeEnemy({ id: PINNED_INITIAL_SETUP_ENEMY.id, name: PINNED_INITIAL_SETUP_ENEMY.name, in_date: '2023-06-24' }),
    makeEnemy({
      id: 304,
      name: '多重HPゲージ敵',
      in_date: '2026-04-05',
      extraGaugeHp: [40400000, 40400000, 40400000],
    }),
  ];

  const result = buildEnemyList(enemies, new Date('2026-04-30T00:00:00+09:00'));
  const target = result.find((enemy) => enemy.id === 304);

  assert.deepEqual(target?.extra_hp_gauge, {
    total: 3,
    remaining: 3,
    values: [40400000, 40400000, 40400000],
  });
});

test('buildEnemyList exposes 恒星掃戦線 as category metadata and dedupes higher-rank duplicates', () => {
  const enemies = [
    makeEnemy({
      id: PINNED_INITIAL_SETUP_ENEMY.id,
      name: PINNED_INITIAL_SETUP_ENEMY.name,
      label: 'Dimension_01_X_RedCrimson',
      in_date: '2023-06-24',
    }),
    makeEnemy({
      id: 410,
      name: '変貌を重ねる不滅の円環',
      label: 'Dimension_09_X_KaleidoOuroboros',
      in_date: '2025-08-10',
    }),
    makeEnemy({
      id: 411,
      name: '峡谷に棲まう幽鬼',
      label: 'Dimension_05_X_UltimateFeeler',
      in_date: '2024-06-14',
    }),
    makeEnemy({
      id: 412,
      name: '峡谷に棲まう幽鬼',
      label: 'Dimension_11_X_UltimateFeeler',
      in_date: '2025-11-28',
    }),
    makeEnemy({
      id: 413,
      name: '[強化変種]ミーティアホーン',
      label: 'Dimension_09_X_CatHornMeteor_Summon',
      in_date: '2025-08-10',
      is_boss: false,
    }),
  ];

  const result = buildEnemyList(enemies, new Date('2026-04-30T00:00:00+09:00'));
  const stellarSweepfrontEntries = result.filter((enemy) => enemy.categoryLabel === '恒星掃戦線');

  assert.deepEqual(
    stellarSweepfrontEntries.map((enemy) => enemy.id),
    [412, 410],
  );
  assert.equal(stellarSweepfrontEntries.every((enemy) => enemy.categoryKey === 'normal:stellar-sweepfront'), true);
  assert.equal(result.some((enemy) => enemy.id === 411), false);
  assert.equal(result.some((enemy) => enemy.id === 413), false);
});

test('buildEnemyList places 異時層EX after templates and keeps EX battle variants', () => {
  const enemies = [
    makeEnemy({
      id: PINNED_INITIAL_SETUP_ENEMY.id,
      name: PINNED_INITIAL_SETUP_ENEMY.name,
      label: 'Dimension_01_X_RedCrimson',
      in_date: '2023-06-24',
    }),
    makeEnemy({
      id: 510,
      name: 'デススラッグEX',
      label: 'Ex_DeathSlug1st',
      in_date: '2026-02-01',
      is_boss: false,
    }),
    makeEnemy({
      id: 511,
      name: 'デススラッグEX',
      label: 'Ex_DeathSlug2nd',
      in_date: '2026-02-01',
    }),
    makeEnemy({
      id: 512,
      name: 'ロータリーモールEX',
      label: 'Ex_RotaryMole2nd',
      in_date: '2026-05-01',
      is_boss: false,
    }),
    makeEnemy({
      id: 513,
      name: 'レッドクリムゾンEX',
      label: 'Ex_RedCrimson',
      in_date: '2026-05-01',
    }),
    makeEnemy({
      id: 514,
      name: '[強化変種]ミーティアホーン',
      label: 'Dimension_09_EX1_CatHornMeteor_Summon',
      in_date: '2025-08-10',
      is_boss: false,
    }),
    makeEnemy({
      id: 520,
      name: '変貌を重ねる不滅の円環',
      label: 'Dimension_09_X_KaleidoOuroboros',
      in_date: '2025-08-10',
    }),
    makeEnemy({
      id: 530,
      name: '4月ボス',
      in_date: '2026-04-05',
    }),
  ];

  const result = buildEnemyList(enemies, new Date('2026-04-30T00:00:00+09:00'));
  const categoryLabels = [...new Set(result.map((enemy) => enemy.categoryLabel))];
  const dimensionExEntries = result.filter((enemy) => enemy.categoryLabel === '異時層EX');

  assert.deepEqual(categoryLabels.slice(0, 4), ['テンプレート', '異時層EX', '恒星掃戦線', '2026年4月']);
  assert.deepEqual(
    dimensionExEntries.map((enemy) => [enemy.id, enemy.name]),
    [
      [510, 'デススラッグEX 第一形態'],
      [511, 'デススラッグEX 第二形態'],
      [512, 'ロータリーモールEX'],
      [513, 'レッドクリムゾンEX'],
    ],
  );
  assert.equal(dimensionExEntries.every((enemy) => enemy.categoryKey === 'normal:dimension-ex'), true);
  assert.equal(result.some((enemy) => enemy.id === 514), false);
});
