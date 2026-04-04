import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

import { StageSetupController } from '../ui-next/components/stage-setup.js';

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

test('StageSetupController applies selected preset to upper inputs only on explicit button click', () =>
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
    checkboxes.item(2).checked = true;
    checkboxes.item(2).dispatchEvent(new win.Event('change', { bubbles: true }));

    assert.equal(root.querySelector('[data-role="stage-initial-od"]').value, '0');

    root
      .querySelector('[data-action="apply-stage-preset"]')
      .dispatchEvent(new win.MouseEvent('click', { bubbles: true }));

    const snapshot = controller.getSnapshot();
    assert.equal(snapshot.initialOdGauge, 200);
    assert.equal(
      snapshot.initialStatusEffects.some((effect) => effect.statusType === 'DefenseUp'),
      true,
    );
  }));

test('StageSetupController shows hint for unsupported preset effects', () =>
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

    root
      .querySelector('[data-action="apply-stage-preset"]')
      .dispatchEvent(new win.MouseEvent('click', { bubbles: true }));

    const hint = root.querySelector('[data-role="stage-preset-hint"]');
    assert.equal(hint.classList.contains('hidden'), false);
    assert.equal(hint.textContent.includes('毎ターンSP+1'), true);
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
