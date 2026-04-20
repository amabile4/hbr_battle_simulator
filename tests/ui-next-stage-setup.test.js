import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

import { StageSetupController } from '../ui-next/components/stage-setup.js';
import { buildStageSetupEnchantEffectLabels } from '../src/domain/stage-setup-enchants.js';

function withDom(run) {
  const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
    url: 'https://example.test/',
  });
  const previous = {
    window: globalThis.window,
    document: globalThis.document,
    Event: globalThis.Event,
    MouseEvent: globalThis.MouseEvent,
  };

  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.Event = dom.window.Event;
  globalThis.MouseEvent = dom.window.MouseEvent;

  try {
    return run({ root: dom.window.document.querySelector('#root'), win: dom.window });
  } finally {
    globalThis.window = previous.window;
    globalThis.document = previous.document;
    globalThis.Event = previous.Event;
    globalThis.MouseEvent = previous.MouseEvent;
    dom.window.close();
  }
}

function createDimensionBattlesFixture() {
  return [
    {
      id: 191000001,
      label: 'dimension_001',
      satellites: [
        { enchant: { desc: '戦闘開始時ODゲージ+200%' } },
        { enchant: { desc: '毎ターンSP+1' } },
        { enchant: { desc: '防御力50%アップ' } },
        { enchant: { desc: 'デバフ無効1回付与' } },
        { enchant: { desc: '毎ターン前衛のSP+1' } },
        { enchant: { desc: '毎ターン後衛のSP+1' } },
        { enchant: { desc: 'ODゲージ上昇量+20%' } },
        { enchant: { desc: 'ターン開始時ダウンターン中の敵がいるとSP+2' } },
        { enchant: { desc: '敵を倒したとき敵1体につき味方全体のSP+1' } },
        { enchant: { desc: 'ターン開始時SP0未満の前衛の味方のSP+2' } },
        { enchant: { desc: 'ターン開始時SP0未満の後衛の味方のSP+2' } },
        { enchant: { desc: '回復量+50%' } },
      ],
    },
    {
      id: 191000002,
      label: 'dimension_002',
      satellites: [
        { enchant: { desc: '戦闘開始時SP+5' } },
      ],
    },
  ];
}

test('StageSetupController defaults to latest dimension battle and exposes upper inputs', () =>
  withDom(({ root }) => {
    const controller = new StageSetupController({
      root,
      dimensionBattles: createDimensionBattlesFixture(),
    });
    controller.mount();

    const battleSelect = root.querySelector('[data-role="stage-dimension-battle"]');
    assert.equal(battleSelect.value, '191000002');

    const snapshot = controller.getSnapshot();
    assert.equal(snapshot.initialOdGauge, 0);
    assert.equal(snapshot.initialSpBonusAll, 0);
    assert.equal(snapshot.selectedDimensionBattleId, 191000002);
  }));

test('StageSetupController applies preset to upper inputs immediately on satellite check', () =>
  withDom(({ root, win }) => {
    const controller = new StageSetupController({
      root,
      dimensionBattles: createDimensionBattlesFixture(),
    });
    controller.mount();

    const battleSelect = root.querySelector('[data-role="stage-dimension-battle"]');
    battleSelect.value = '191000001';
    battleSelect.dispatchEvent(new win.Event('change', { bubbles: true }));

    const checkboxes = root.querySelectorAll('[data-role="stage-satellite-checkbox"]');
    checkboxes.item(0).checked = true;
    checkboxes.item(0).dispatchEvent(new win.Event('change', { bubbles: true }));

    assert.equal(root.querySelector('[data-role="stage-initial-od"]').value, '200');

    checkboxes.item(2).checked = true;
    checkboxes.item(2).dispatchEvent(new win.Event('change', { bubbles: true }));

    const snapshot = controller.getSnapshot();
    assert.equal(snapshot.initialOdGauge, 200);
    assert.equal(
      snapshot.initialStatusEffects.some((effect) => effect.statusType === 'DefenseUp'),
      true,
    );
  }));

test('StageSetupController excludes supported enchant presets from unsupported hint', () =>
  withDom(({ root, win }) => {
    const controller = new StageSetupController({
      root,
      dimensionBattles: createDimensionBattlesFixture(),
    });
    controller.mount();

    const battleSelect = root.querySelector('[data-role="stage-dimension-battle"]');
    battleSelect.value = '191000001';
    battleSelect.dispatchEvent(new win.Event('change', { bubbles: true }));

    const checkboxes = root.querySelectorAll('[data-role="stage-satellite-checkbox"]');
    checkboxes.item(6).checked = true;
    checkboxes.item(6).dispatchEvent(new win.Event('change', { bubbles: true }));
    checkboxes.item(7).checked = true;
    checkboxes.item(7).dispatchEvent(new win.Event('change', { bubbles: true }));
    checkboxes.item(8).checked = true;
    checkboxes.item(8).dispatchEvent(new win.Event('change', { bubbles: true }));
    checkboxes.item(9).checked = true;
    checkboxes.item(9).dispatchEvent(new win.Event('change', { bubbles: true }));
    checkboxes.item(10).checked = true;
    checkboxes.item(10).dispatchEvent(new win.Event('change', { bubbles: true }));
    checkboxes.item(11).checked = true;
    checkboxes.item(11).dispatchEvent(new win.Event('change', { bubbles: true }));

    const hint = root.querySelector('[data-role="stage-preset-hint"]');
    assert.equal(hint.classList.contains('hidden'), false);
    assert.equal(hint.textContent.includes('回復量+50%'), true);
    assert.equal(hint.textContent.includes('ODゲージ上昇量+20%'), false);
    assert.equal(hint.textContent.includes('ターン開始時ダウンターン中の敵がいるとSP+2'), false);
    assert.equal(hint.textContent.includes('敵を倒したとき敵1体につき味方全体のSP+1'), false);
    assert.equal(hint.textContent.includes('ターン開始時SP0未満の前衛の味方のSP+2'), false);
    assert.equal(hint.textContent.includes('ターン開始時SP0未満の後衛の味方のSP+2'), false);
  }));

test('StageSetupController preset applies turnly SP fields immediately on check', () =>
  withDom(({ root, win }) => {
    const controller = new StageSetupController({
      root,
      dimensionBattles: createDimensionBattlesFixture(),
    });
    controller.mount();

    const battleSelect = root.querySelector('[data-role="stage-dimension-battle"]');
    battleSelect.value = '191000001';
    battleSelect.dispatchEvent(new win.Event('change', { bubbles: true }));

    const checkboxes = root.querySelectorAll('[data-role="stage-satellite-checkbox"]');
    checkboxes.item(1).checked = true;
    checkboxes.item(1).dispatchEvent(new win.Event('change', { bubbles: true }));
    checkboxes.item(4).checked = true;
    checkboxes.item(4).dispatchEvent(new win.Event('change', { bubbles: true }));
    checkboxes.item(5).checked = true;
    checkboxes.item(5).dispatchEvent(new win.Event('change', { bubbles: true }));

    const snapshot = controller.getSnapshot();
    assert.equal(snapshot.turnlySpAll, 1);
    assert.equal(snapshot.turnlySpFront, 1);
    assert.equal(snapshot.turnlySpBack, 1);
  }));

test('StageSetupController applySnapshot restores selected dimension battle and upper inputs', () =>
  withDom(({ root }) => {
    const controller = new StageSetupController({
      root,
      dimensionBattles: createDimensionBattlesFixture(),
    });
    controller.mount();

    controller.applySnapshot({
      initialOdGauge: -300,
      initialSpBonusAll: 5,
      selectedDimensionBattleId: 191000001,
      initialStatusEffects: [
        { statusType: 'DebuffGuard', scope: 'all', remaining: 1, limitType: 'Count', exitCond: 'Count' },
      ],
    });

    assert.equal(root.querySelector('[data-role="stage-initial-od"]').value, '-300');
    assert.equal(root.querySelector('[data-role="stage-initial-sp"]').value, '5');
    assert.equal(root.querySelector('[data-role="stage-effect-debuff-guard"]').checked, true);
    assert.equal(root.querySelector('[data-role="stage-dimension-battle"]').value, '191000001');
  }));

test('StageSetupController stores enchantEffects in snapshot and renders preset summary', () =>
  withDom(({ root, win }) => {
    const controller = new StageSetupController({
      root,
      dimensionBattles: createDimensionBattlesFixture(),
    });
    controller.mount();

    const battleSelect = root.querySelector('[data-role="stage-dimension-battle"]');
    battleSelect.value = '191000001';
    battleSelect.dispatchEvent(new win.Event('change', { bubbles: true }));

    const checkboxes = root.querySelectorAll('[data-role="stage-satellite-checkbox"]');
    for (const index of [6, 7, 8, 9, 10]) {
      checkboxes.item(index).checked = true;
      checkboxes.item(index).dispatchEvent(new win.Event('change', { bubbles: true }));
    }

    const snapshot = controller.getSnapshot();
    assert.deepEqual(snapshot.enchantEffects, [
      { effectType: 'odGaugeGainBonusPercent', amount: 20 },
      { effectType: 'turnStartSpIfEnemyDown', scope: 'all', amount: 2 },
      { effectType: 'turnStartSpIfNegativeSp', scope: 'front', amount: 2 },
      { effectType: 'turnStartSpIfNegativeSp', scope: 'back', amount: 2 },
      { effectType: 'spOnEnemyKill', scope: 'all', amount: 1 },
    ]);

    const summaryItems = [...root.querySelectorAll('[data-role="stage-enchant-summary"] li')].map((item) =>
      item.textContent.trim()
    );
    assert.deepEqual(summaryItems, buildStageSetupEnchantEffectLabels(snapshot.enchantEffects));
    assert.equal(root.querySelector('[data-role="stage-enchant-summary-empty"]').classList.contains('hidden'), true);
  }));

test('StageSetupController reset button restores only upper free inputs to initial defaults', () =>
  withDom(({ root, win }) => {
    const controller = new StageSetupController({
      root,
      dimensionBattles: createDimensionBattlesFixture(),
    });
    controller.mount();

    const battleSelect = root.querySelector('[data-role="stage-dimension-battle"]');
    battleSelect.value = '191000001';
    battleSelect.dispatchEvent(new win.Event('change', { bubbles: true }));

    root.querySelector('[data-role="stage-initial-od"]').value = '-300';
    root.querySelector('[data-role="stage-initial-od"]').dispatchEvent(new win.Event('change', { bubbles: true }));
    root.querySelector('[data-role="stage-initial-sp"]').value = '5';
    root.querySelector('[data-role="stage-initial-sp"]').dispatchEvent(new win.Event('change', { bubbles: true }));
    root.querySelector('[data-role="stage-effect-defense-up"]').checked = true;
    root.querySelector('[data-role="stage-effect-defense-up"]').dispatchEvent(new win.Event('change', { bubbles: true }));

    root
      .querySelector('[data-action="reset-stage-upper-inputs"]')
      .dispatchEvent(new win.MouseEvent('click', { bubbles: true }));

    const snapshot = controller.getSnapshot();
    assert.equal(snapshot.initialOdGauge, 0);
    assert.equal(snapshot.initialSpBonusAll, 0);
    assert.equal(snapshot.initialStatusEffects.length, 0);
    assert.equal(snapshot.selectedDimensionBattleId, 191000001);
    assert.equal(root.querySelector('[data-role="stage-dimension-battle"]').value, '191000001');
  }));

  test('StageSetupController - every-turn SP fields persist in snapshot', () =>
    withDom(({ root, win }) => {
      const controller = new StageSetupController({
        root,
        dimensionBattles: createDimensionBattlesFixture(),
      });
      controller.mount();

      // Set turnly SP values
      const turnlySpAllInput = root.querySelector('[data-role="stage-turnly-sp-all"]');
      const turnlySpFrontInput = root.querySelector('[data-role="stage-turnly-sp-front"]');
      const turnlySpBackInput = root.querySelector('[data-role="stage-turnly-sp-back"]');

      turnlySpAllInput.value = '2';
      turnlySpAllInput.dispatchEvent(new win.Event('change', { bubbles: true }));
      turnlySpFrontInput.value = '5';
      turnlySpFrontInput.dispatchEvent(new win.Event('change', { bubbles: true }));
      turnlySpBackInput.value = '-3';
      turnlySpBackInput.dispatchEvent(new win.Event('change', { bubbles: true }));

      const snapshot = controller.getSnapshot();
      assert.equal(snapshot.turnlySpAll, 2);
      assert.equal(snapshot.turnlySpFront, 5);
      assert.equal(snapshot.turnlySpBack, -3);
    }));

  test('StageSetupController - every-turn SP fields restore from snapshot', () =>
    withDom(({ root, win }) => {
      const controller = new StageSetupController({
        root,
        dimensionBattles: createDimensionBattlesFixture(),
      });
      controller.mount();

      const snapshot = {
        selectedDimensionBattleId: 191000001,
        initialOdGauge: 0,
        initialSpBonusAll: 0,
        initialStatusEffects: [],
        turnlySpAll: 3,
        turnlySpFront: 4,
        turnlySpBack: -2,
      };

      controller.applySnapshot(snapshot);

      const turnlySpAllInput = root.querySelector('[data-role="stage-turnly-sp-all"]');
      const turnlySpFrontInput = root.querySelector('[data-role="stage-turnly-sp-front"]');
      const turnlySpBackInput = root.querySelector('[data-role="stage-turnly-sp-back"]');

      assert.equal(turnlySpAllInput.value, '3');
      assert.equal(turnlySpFrontInput.value, '4');
      assert.equal(turnlySpBackInput.value, '-2');
    }));

test('StageSetupController applySnapshot restores enchant summary and reset clears it', () =>
  withDom(({ root, win }) => {
    const controller = new StageSetupController({
      root,
      dimensionBattles: createDimensionBattlesFixture(),
    });
    controller.mount();

    controller.applySnapshot({
      selectedDimensionBattleId: 191000001,
      initialOdGauge: 0,
      initialSpBonusAll: 0,
      initialStatusEffects: [],
      enchantEffects: [
        { effectType: 'odGaugeGainBonusPercent', amount: 20 },
        { effectType: 'turnStartSpIfEnemyDown', scope: 'all', amount: 2 },
      ],
    });

    let summaryItems = [...root.querySelectorAll('[data-role="stage-enchant-summary"] li')].map((item) =>
      item.textContent.trim()
    );
    assert.deepEqual(summaryItems, [
      'ODゲージ上昇量+20%',
      'ターン開始時ダウンターン中の敵がいるとSP+2',
    ]);
    assert.equal(root.querySelector('[data-role="stage-enchant-summary-empty"]').classList.contains('hidden'), true);

    root
      .querySelector('[data-action="reset-stage-upper-inputs"]')
      .dispatchEvent(new win.MouseEvent('click', { bubbles: true }));

    summaryItems = [...root.querySelectorAll('[data-role="stage-enchant-summary"] li')].map((item) =>
      item.textContent.trim()
    );
    assert.deepEqual(summaryItems, []);
    assert.equal(root.querySelector('[data-role="stage-enchant-summary-empty"]').classList.contains('hidden'), false);
    assert.deepEqual(controller.getSnapshot().enchantEffects, []);
  }));

  test('StageSetupController reset button resets every-turn SP fields to defaults', () =>
    withDom(({ root, win }) => {
      const controller = new StageSetupController({
        root,
        dimensionBattles: createDimensionBattlesFixture(),
      });
      controller.mount();

      const turnlySpAllInput = root.querySelector('[data-role="stage-turnly-sp-all"]');
      const turnlySpFrontInput = root.querySelector('[data-role="stage-turnly-sp-front"]');
      const turnlySpBackInput = root.querySelector('[data-role="stage-turnly-sp-back"]');

      turnlySpAllInput.value = '5';
      turnlySpAllInput.dispatchEvent(new win.Event('change', { bubbles: true }));
      turnlySpFrontInput.value = '10';
      turnlySpFrontInput.dispatchEvent(new win.Event('change', { bubbles: true }));
      turnlySpBackInput.value = '-5';
      turnlySpBackInput.dispatchEvent(new win.Event('change', { bubbles: true }));

      root
        .querySelector('[data-action="reset-stage-upper-inputs"]')
        .dispatchEvent(new win.MouseEvent('click', { bubbles: true }));

      assert.equal(turnlySpAllInput.value, '0');
      assert.equal(turnlySpFrontInput.value, '0');
      assert.equal(turnlySpBackInput.value, '0');
    }));
