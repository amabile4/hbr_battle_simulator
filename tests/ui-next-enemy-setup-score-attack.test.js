/**
 * EnemySetup のスコアアタック敵パラメータ解決テスト
 *
 * スコアアタック敵(label に scoreattack を含む)は enemies.json 側の base_param が
 * 難易度によらないプレースホルダのため、setScoreAttackEvents() で注入した
 * score_attack.json 相当データから、難易度40(最高、アビス)の rbl/dl/hl を
 * 優先して使うことを固定する。通常の敵は従来どおり base_param を使う。
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

const SCORE_ATTACK_ENEMY = {
  id: 13313207,
  name: 'オーカークロウ',
  label: 'SwellCrowOchre_scoreattack98_g',
  // enemies.json 由来のプレースホルダ値（難易度によらず固定・小さい値）
  base_param: { dp: 5000, hp: 10000, param_border: 160, d_rate: 5 },
  resistances: { element: null },
};

const NORMAL_ENEMY = {
  id: 9001,
  name: 'DB敵',
  label: 'Hard_DeathSlug1st',
  base_param: { dp: 480, hp: 3400, param_border: 620, d_rate: 175 },
  resistances: { element: null },
};

const SCORE_ATTACK_EVENTS = [
  {
    id: 145000098,
    name: '#98 Ambush of the Past',
    in_date: '2026-06-19 02:00:00+00:00',
    battles: [
      {
        d: 1,
        dn: 'ビギナー',
        b: ['SwellCrowOchre_scoreattack98_a'],
        rbl: [160, 0, 0],
        dl: [5000, 0, 0],
        hl: [10000, 0, 0],
      },
      {
        d: 40,
        dn: 'アビス',
        b: ['SwellCrowOchre_scoreattack98_g'],
        rbl: [770, 0, 0],
        dl: [1800000, 0, 0],
        hl: [110000000, 0, 0],
      },
    ],
  },
];

function selectEnemy(root, enemyId) {
  const select = root.querySelector('[data-action="select-enemy"]');
  select.value = String(enemyId);
  select.dispatchEvent(new window.Event('change', { bubbles: true }));
}

test('enemy setup: selecting a score-attack enemy resolves stats from injected score attack events (grade 40)', () => {
  withDom(({ root }) => {
    const controller = new EnemySetupController({ root, enemies: [SCORE_ATTACK_ENEMY] });
    controller.mount();
    controller.setScoreAttackEvents(SCORE_ATTACK_EVENTS);

    selectEnemy(root, SCORE_ATTACK_ENEMY.id);

    const snapshot = controller.getSnapshot();
    assert.equal(snapshot.enemySlots[0].param_border, 770, '破壊ボーダーは難易度40の rbl[0] になること');
    assert.equal(snapshot.enemySlots[0].maxDp, 1800000, 'maxDp は難易度40の dl[0] になること');
    assert.equal(snapshot.enemySlots[0].maxHp, 110000000, 'maxHp は難易度40の hl[0] になること');
    assert.equal(snapshot.enemySlots[0].dp, 1800000, 'dp は難易度40の dl[0] になること');
  });
});

test('enemy setup: score-attack stats fall back gracefully when no score attack events are injected yet', () => {
  withDom(({ root }) => {
    const controller = new EnemySetupController({ root, enemies: [SCORE_ATTACK_ENEMY] });
    controller.mount();
    // setScoreAttackEvents を呼ばない = 未ロード状態

    selectEnemy(root, SCORE_ATTACK_ENEMY.id);

    const snapshot = controller.getSnapshot();
    // データ未注入時は enemies.json 側のプレースホルダ base_param にフォールバックする
    assert.equal(snapshot.enemySlots[0].maxDp, 5000);
    assert.equal(snapshot.enemySlots[0].maxHp, 10000);
  });
});

test('enemy setup: selecting a normal (non score-attack) enemy is unaffected by score attack events', () => {
  withDom(({ root }) => {
    const controller = new EnemySetupController({ root, enemies: [NORMAL_ENEMY] });
    controller.mount();
    controller.setScoreAttackEvents(SCORE_ATTACK_EVENTS);

    selectEnemy(root, NORMAL_ENEMY.id);

    const snapshot = controller.getSnapshot();
    assert.equal(snapshot.enemySlots[0].param_border, 620);
    assert.equal(snapshot.enemySlots[0].maxDp, 480);
    assert.equal(snapshot.enemySlots[0].maxHp, 3400);
  });
});

test('enemy setup: renders a score attack grade select (1-40) defaulting to 40', () => {
  withDom(({ root }) => {
    const controller = new EnemySetupController({ root, enemies: [SCORE_ATTACK_ENEMY] });
    controller.mount();

    const select = root.querySelector('[data-action="select-score-attack-grade"]');
    assert.ok(select, '難易度選択 select が存在すること');
    assert.equal(select.options.length, 40, '選択肢が1〜40の40件であること');
    assert.equal(select.value, '40', '既定値は40であること');
    assert.equal(controller.getSnapshot().scoreAttackGrade, 40);
  });
});

test('enemy setup: changing the score attack grade re-resolves stats for the selected difficulty', () => {
  withDom(({ root }) => {
    const controller = new EnemySetupController({ root, enemies: [SCORE_ATTACK_ENEMY] });
    controller.mount();
    controller.setScoreAttackEvents(SCORE_ATTACK_EVENTS);
    selectEnemy(root, SCORE_ATTACK_ENEMY.id);

    const gradeSelect = root.querySelector('[data-action="select-score-attack-grade"]');
    gradeSelect.value = '1';
    gradeSelect.dispatchEvent(new window.Event('change', { bubbles: true }));

    const snapshot = controller.getSnapshot();
    assert.equal(snapshot.scoreAttackGrade, 1);
    assert.equal(snapshot.enemySlots[0].param_border, 160, '難易度1の rbl[0] になること');
    assert.equal(snapshot.enemySlots[0].maxDp, 5000, '難易度1の dl[0] になること');
    assert.equal(snapshot.enemySlots[0].maxHp, 10000, '難易度1の hl[0] になること');
  });
});

test('enemy setup: scoreAttackGrade survives applySnapshot -> getSnapshot roundtrip', () => {
  withDom(({ root }) => {
    const controller = new EnemySetupController({ root, enemies: [SCORE_ATTACK_ENEMY] });
    controller.mount();
    controller.setScoreAttackEvents(SCORE_ATTACK_EVENTS);
    selectEnemy(root, SCORE_ATTACK_ENEMY.id);

    const gradeSelect = root.querySelector('[data-action="select-score-attack-grade"]');
    gradeSelect.value = '1';
    gradeSelect.dispatchEvent(new window.Event('change', { bubbles: true }));

    const saved = controller.getSnapshot();
    controller.resetToDefaults();
    assert.equal(controller.getSnapshot().scoreAttackGrade, 40, 'reset 後は既定値40に戻ること');

    controller.applySnapshot(saved);
    assert.equal(controller.getSnapshot().scoreAttackGrade, 1, 'applySnapshot で難易度が復元されること');
  });
});

test('enemy setup: out-of-range scoreAttackGrade values are clamped to 1-40', () => {
  withDom(({ root }) => {
    const controller = new EnemySetupController({ root, enemies: [SCORE_ATTACK_ENEMY] });
    controller.mount();
    controller.applySnapshot({ scoreAttackGrade: 999 });
    assert.equal(controller.getSnapshot().scoreAttackGrade, 40);

    controller.applySnapshot({ scoreAttackGrade: -5 });
    assert.equal(controller.getSnapshot().scoreAttackGrade, 1);
  });
});

// --- スコアアタック「イベント選択(入力補助)」セクション ---

const SCORE_ATTACK_EVENT_91 = {
  id: 145000091,
  name: '#91 The lurking despair',
  in_date: '2026-02-13 02:00:00+00:00',
  battles: [
    {
      d: 40, dn: 'アビス', b: ['DesertDendronNether_scoreattack91_g'],
      bn: [{ n: 'ネザーデンドロン' }],
      rbl: [500, 0, 0], dl: [900000, 0, 0], hl: [50000000, 0, 0],
    },
  ],
};

const SCORE_ATTACK_EVENT_TOO_OLD = {
  id: 145000001,
  name: 'スコアアタック1',
  in_date: '2022-04-08 02:00:00+00:00',
  battles: [
    { d: 40, dn: 'アビス', b: ['DeathSlug1st_scoreattack_a'], bn: [{ n: 'デススラッグ' }], rbl: [65, 0, 0], dl: [9000, 0, 0], hl: [30000, 0, 0] },
  ],
};

// SCORE_ATTACK_EVENTS の #98 に bn を付与した版(イベント選択セクションの代表名抽出に必要)
const SCORE_ATTACK_EVENTS_WITH_BN = [
  {
    ...SCORE_ATTACK_EVENTS[0],
    battles: SCORE_ATTACK_EVENTS[0].battles.map((b) => ({ ...b, bn: [{ n: 'オーカークロウ' }] })),
  },
  SCORE_ATTACK_EVENT_91,
  SCORE_ATTACK_EVENT_TOO_OLD,
];

test('enemy setup: score attack event select lists only cutoff-supported events, newest first', () => {
  withDom(({ root }) => {
    const controller = new EnemySetupController({ root, enemies: [] });
    controller.mount();
    controller.setScoreAttackEvents(SCORE_ATTACK_EVENTS_WITH_BN);

    const select = root.querySelector('[data-action="select-score-attack-event"]');
    assert.ok(select, 'イベント選択 select が存在すること');
    // 「選択なし」+ #98 + #91(#1 はカットオフ未満のため除外)
    assert.equal(select.options.length, 3);
    assert.equal(select.value, '', '初期状態は未選択であること');
    assert.ok(select.options[1].textContent.includes('#98'));
    assert.ok(select.options[1].textContent.includes('オーカークロウ'));
    assert.ok(select.options[2].textContent.includes('#91'));
    assert.ok(!select.innerHTML.includes('スコアアタック1'), 'カットオフ未満のイベントは含まれないこと');
  });
});

test('enemy setup: selecting a score attack event assigns it to the active slot and resolves stats', () => {
  withDom(({ root }) => {
    const controller = new EnemySetupController({ root, enemies: [NORMAL_ENEMY] });
    controller.mount();
    controller.setScoreAttackEvents(SCORE_ATTACK_EVENTS_WITH_BN);

    const eventSelect = root.querySelector('[data-action="select-score-attack-event"]');
    const option98 = [...eventSelect.options].find((o) => o.textContent.includes('#98'));
    eventSelect.value = option98.value;
    eventSelect.dispatchEvent(new window.Event('change', { bubbles: true }));

    const snapshot = controller.getSnapshot();
    assert.ok(snapshot.selectedEnemyName.includes('オーカークロウ'));
    // 既定の難易度40で、Phase1/2 で固定済みの実データ(770/1800000/110000000)と一致すること
    assert.equal(snapshot.enemySlots[0].param_border, 770);
    assert.equal(snapshot.enemySlots[0].maxDp, 1800000);
    assert.equal(snapshot.enemySlots[0].maxHp, 110000000);

    // 難易度セレクタと連動して再解決されること
    const gradeSelect = root.querySelector('[data-action="select-score-attack-grade"]');
    gradeSelect.value = '1';
    gradeSelect.dispatchEvent(new window.Event('change', { bubbles: true }));
    const snapshotAfterGradeChange = controller.getSnapshot();
    assert.equal(snapshotAfterGradeChange.enemySlots[0].param_border, 160);
  });
});

test('enemy setup: score attack event selection survives applySnapshot -> getSnapshot roundtrip', () => {
  withDom(({ root }) => {
    const controller = new EnemySetupController({ root, enemies: [NORMAL_ENEMY] });
    controller.mount();
    controller.setScoreAttackEvents(SCORE_ATTACK_EVENTS_WITH_BN);

    const eventSelect = root.querySelector('[data-action="select-score-attack-event"]');
    const option98 = [...eventSelect.options].find((o) => o.textContent.includes('#98'));
    eventSelect.value = option98.value;
    eventSelect.dispatchEvent(new window.Event('change', { bubbles: true }));

    const saved = controller.getSnapshot();

    controller.resetToDefaults();
    assert.notEqual(controller.getSnapshot().selectedEnemyId, saved.selectedEnemyId, 'reset 後はスコアアタック選択が残っていないこと');

    controller.applySnapshot(saved);
    assert.ok(controller.getSnapshot().selectedEnemyName.includes('オーカークロウ'));
    assert.equal(controller.getSnapshot().enemySlots[0].param_border, 770);
  });
});
