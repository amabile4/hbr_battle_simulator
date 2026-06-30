/**
 * EnemySetup の dp/hp 往復テスト
 *
 * 手動敵（selectedEnemyId なし）の snapshot 直書き dp/hp が
 * applySnapshot → getSnapshot の往復で保持されることを固定する。
 * （欠落していると save→load 後に DP/HP ガイドが無効化される回帰）
 * 敵を選び直した場合は override がクリアされ、選択敵からの再導出に戻る。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

import { EnemySetupController } from '../ui-next/components/enemy-setup.js';

function withDom(run) {
  const dom = new JSDOM(
    '<!doctype html><html><body><div id="root"></div></body></html>',
    { url: 'https://example.test/' },
  );
  const previous = {
    window: globalThis.window,
    document: globalThis.document,
  };
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  try {
    return run({ root: dom.window.document.querySelector('#root') });
  } finally {
    globalThis.window = previous.window;
    globalThis.document = previous.document;
  }
}

const MANUAL_ENEMY_SNAPSHOT = {
  isManual: true,
  selectedEnemyName: 'テストホッパーα',
  param_border: 620,
  dp: 1,
  hp: 12345,
  od_rate: 0,
  max_d_rate: 300,
  d_rate: 125,
  destructionRate: 1,
  resistances: {
    element: {
      slash: 100, stab: 100, strike: 100, fire: 100, ice: 100,
      thunder: 100, light: 100, dark: 100, nonelement: 100,
    },
  },
  absorbElementList: [],
};

test('enemy setup: manual enemy dp/hp survive applySnapshot -> getSnapshot roundtrip', () => {
  withDom(({ root }) => {
    const controller = new EnemySetupController({ root, enemies: [] });
    controller.mount();
    controller.applySnapshot(MANUAL_ENEMY_SNAPSHOT);

    const snapshot = controller.getSnapshot();
    assert.equal(snapshot.dp, 1, 'flat dp が往復で保持されること');
    assert.equal(snapshot.hp, 12345, 'flat hp が往復で保持されること');
    assert.equal(snapshot.enemySlots[0].dp, 1, 'slot dp が往復で保持されること');
    assert.equal(snapshot.enemySlots[0].hp, 12345, 'slot hp が往復で保持されること');
    assert.equal(snapshot.d_rate, 125, 'flat d_rate が往復で保持されること');
    assert.equal(snapshot.enemySlots[0].d_rate, 125, 'slot d_rate が往復で保持されること');

    // 2回目の往復（save -> load -> save 相当）でも保持される
    controller.applySnapshot(snapshot);
    const second = controller.getSnapshot();
    assert.equal(second.dp, 1, '2往復目でも dp が保持されること');
    assert.equal(second.hp, 12345, '2往復目でも hp が保持されること');
    assert.equal(second.d_rate, 125, '2往復目でも d_rate が保持されること');
  });
});

test('enemy setup: selecting a database enemy clears the dp/hp override', () => {
  withDom(({ root }) => {
    const dbEnemy = {
      id: 9001,
      name: 'DB敵',
      base_param: { dp: 480, hp: 3400, param_border: 620, d_rate: 175 },
      resistances: { element: null },
    };
    const controller = new EnemySetupController({ root, enemies: [dbEnemy] });
    controller.mount();
    controller.applySnapshot(MANUAL_ENEMY_SNAPSHOT);
    assert.equal(controller.getSnapshot().dp, 1, '事前条件: override が効いていること');

    const select = root.querySelector('[data-action="select-enemy"]');
    assert.ok(select, '敵選択 select が存在すること');
    select.value = '9001';
    select.dispatchEvent(new window.Event('change', { bubbles: true }));

    const snapshot = controller.getSnapshot();
    assert.equal(snapshot.dp, 480, '敵選択後は選択敵の dp に戻ること');
    assert.equal(snapshot.hp, undefined, '敵選択後は hp override が消えること（再導出方針）');
    assert.equal(snapshot.d_rate, 175, '敵選択後は enemies.json 由来の d_rate に戻ること');
  });
});
