import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

import { InitialSetupController } from '../ui-next/components/initial-setup.js';
import { TARGET_SELECTION_MODES } from '../ui-next/utils/simulator-settings.js';

class TestResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

function withDom(run) {
  const dom = new JSDOM(
    '<!doctype html><html><body><div id="root"></div><div id="picker-overlay"></div></body></html>',
    { url: 'https://example.test/' },
  );
  const previous = {
    window: globalThis.window,
    document: globalThis.document,
    ResizeObserver: globalThis.ResizeObserver,
    CustomEvent: globalThis.CustomEvent,
    Event: globalThis.Event,
    MouseEvent: globalThis.MouseEvent,
    localStorage: globalThis.localStorage,
  };

  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.ResizeObserver = TestResizeObserver;
  globalThis.CustomEvent = dom.window.CustomEvent;
  globalThis.Event = dom.window.Event;
  globalThis.MouseEvent = dom.window.MouseEvent;
  globalThis.localStorage = dom.window.localStorage;

  try {
    return run({
      dom,
      win: dom.window,
      root: dom.window.document.querySelector('#root'),
      pickerOverlay: dom.window.document.querySelector('#picker-overlay'),
    });
  } finally {
    globalThis.window = previous.window;
    globalThis.document = previous.document;
    globalThis.ResizeObserver = previous.ResizeObserver;
    globalThis.CustomEvent = previous.CustomEvent;
    globalThis.Event = previous.Event;
    globalThis.MouseEvent = previous.MouseEvent;
    globalThis.localStorage = previous.localStorage;
    dom.window.close();
  }
}

function createStoreStub() {
  const styles = [
    {
      id: 1001,
      name: '茅森 月歌 style',
      chara: '茅森 月歌',
      chara_label: 'C1001',
      image: '',
      tier: 'SS',
      passives: [],
      skills: [],
    },
    {
      id: 1002,
      name: '和泉 ユキ style',
      chara: '和泉 ユキ',
      chara_label: 'C1002',
      image: '',
      tier: 'SS',
      passives: [],
      skills: [],
    },
    {
      id: 1003,
      name: '逢川 めぐみ style',
      chara: '逢川 めぐみ',
      chara_label: 'C1003',
      image: '',
      tier: 'SS',
      passives: [],
      skills: [],
    },
  ];
  const styleById = new Map(styles.map((style) => [style.id, style]));
  const equipableSkillsByStyleId = new Map([
    [1001, [
      { id: 46000001, skillId: 46000001, name: '通常攻撃', label: 'Skill46000001', sp_cost: 0 },
      {
        id: 46400001,
        skillId: 46400001,
        name: 'ルビー・パフューム',
        label: 'Skill46400001',
        sp_cost: 0,
        sourceType: 'passive',
        passive: { timing: 'OnFirstBattleStart', effect: 'HighBoost' },
      },
      {
        id: 46500001,
        skillId: 46500001,
        name: 'マスタースキル',
        label: 'Skill46500001',
        sp_cost: 0,
        sourceType: 'master',
      },
    ]],
    [1002, [{ id: 46000011, skillId: 46000011, name: '通常攻撃', label: 'Skill46000011', sp_cost: 0 }]],
    [1003, [{ id: 46000021, skillId: 46000021, name: '通常攻撃', label: 'Skill46000021', sp_cost: 0 }]],
  ]);
  return {
    styles,
    getStyleById(styleId) {
      return styleById.get(Number(styleId)) ?? null;
    },
    listSkillsByStyleId() {
      return [];
    },
    listEquipableSkillsByStyleId(styleId) {
      return equipableSkillsByStyleId.get(Number(styleId)) ?? [];
    },
  };
}

test('InitialSetupController mounts Simulator Settings tab separately from Enemy and Stage', () =>
  withDom(({ root, pickerOverlay, win }) => {
    const controller = new InitialSetupController({
      root,
      pickerOverlay,
      store: createStoreStub(),
    });
    controller.mount();

    const simulatorTab = root.querySelector('[role="tab"][data-tab="simulator"]');
    assert.ok(simulatorTab);

    simulatorTab.dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
    const simulatorContent = root.querySelector('[data-tab-content="simulator"]');
    assert.equal(simulatorContent.hidden, false);
    assert.equal(root.querySelector('[data-role="enemy-target-simplify-toggle"]').checked, true);
    assert.equal(root.querySelector('[data-role="ally-target-simplify-toggle"]').checked, true);

    const enemyContent = root.querySelector('[data-tab-content="enemy"]');
    const stageContent = root.querySelector('[data-tab-content="stage"]');
    assert.equal(enemyContent.querySelector('[data-role="enemy-target-simplify-toggle"]'), null);
    assert.equal(enemyContent.querySelector('[data-role="ally-target-simplify-toggle"]'), null);
    assert.equal(stageContent.querySelector('[data-role="enemy-target-simplify-toggle"]'), null);
    assert.equal(stageContent.querySelector('[data-role="ally-target-simplify-toggle"]'), null);
  }));

test('InitialSetupController no longer mounts Passive Log as a setup tab', () =>
  withDom(({ root, pickerOverlay, win }) => {
    const controller = new InitialSetupController({
      root,
      pickerOverlay,
      store: createStoreStub(),
    });
    controller.mount();

    const passiveLogTab = root.querySelector('[role="tab"][data-tab="passive-log"]');
    assert.equal(passiveLogTab, null);
    assert.equal(root.querySelector('[data-tab-content="passive-log"]'), null);
  }));

test('InitialSetupController enemy tab shows Turn0 preemptive field as display-only setup', () =>
  withDom(({ root, pickerOverlay, win }) => {
    const controller = new InitialSetupController({
      root,
      pickerOverlay,
      store: createStoreStub(),
    });
    controller.mount();

    root
      .querySelector('[role="tab"][data-tab="enemy"]')
      .dispatchEvent(new win.MouseEvent('click', { bubbles: true }));

    const enemyContent = root.querySelector('[data-tab-content="enemy"]');
    assert.equal(enemyContent.hidden, false);
    assert.equal(enemyContent.textContent.includes('Turn0(先制攻撃)'), true);
    assert.equal(enemyContent.textContent.includes('開幕フィールド'), true);
    assert.equal(enemyContent.textContent.includes('敵プリセット'), true);
    assert.equal(
      enemyContent.textContent.indexOf('Turn0(先制攻撃)') < enemyContent.textContent.indexOf('敵プリセット'),
      true,
    );

    const fieldSelect = enemyContent.querySelector('[data-action="select-preemptive-field"]');
    assert.ok(fieldSelect);
    assert.deepEqual(
      [...fieldSelect.options].map((option) => option.value),
      ['none', 'fire', 'ice', 'thunder', 'light', 'dark'],
    );
  }));

test('InitialSetupController getSetupSnapshot returns split simulator target selection modes', () =>
  withDom(({ root, pickerOverlay }) => {
    const controller = new InitialSetupController({
      root,
      pickerOverlay,
      store: createStoreStub(),
    });
    controller.mount();

    const partySnapshot = {
      isFrontFilled: false,
      styleIds: [null, null, null, null, null, null],
    };

    let setupSnapshot = controller.getSetupSnapshot(partySnapshot);
    assert.equal(
      setupSnapshot.simulatorSettings.targetSelection.enemyMode,
      TARGET_SELECTION_MODES.SIMPLE,
    );
    assert.equal(
      setupSnapshot.simulatorSettings.targetSelection.allyMode,
      TARGET_SELECTION_MODES.SIMPLE,
    );
    assert.equal(setupSnapshot.simulatorSettings.captureUntilBattleEnd, true);

    root.querySelector('[data-role="enemy-target-simplify-toggle"]').checked = false;
    root.querySelector('[data-role="ally-target-simplify-toggle"]').checked = true;
    const captureToggle = root.querySelector('[data-role="capture-until-battle-end-toggle"]');
    assert.equal(captureToggle.disabled, false);
    captureToggle.checked = false;
    setupSnapshot = controller.getSetupSnapshot(partySnapshot);

    assert.equal(
      setupSnapshot.simulatorSettings.targetSelection.enemyMode,
      TARGET_SELECTION_MODES.MANUAL,
    );
    assert.equal(
      setupSnapshot.simulatorSettings.targetSelection.allyMode,
      TARGET_SELECTION_MODES.SIMPLE,
    );
    assert.equal(setupSnapshot.simulatorSettings.captureUntilBattleEnd, false);
  }));

test('InitialSetupController getSetupSnapshot includes enemy preemptive field selection', () =>
  withDom(({ root, pickerOverlay, win }) => {
    const controller = new InitialSetupController({
      root,
      pickerOverlay,
      store: createStoreStub(),
    });
    controller.mount();

    root
      .querySelector('[role="tab"][data-tab="enemy"]')
      .dispatchEvent(new win.MouseEvent('click', { bubbles: true }));

    const fieldSelect = root.querySelector('[data-action="select-preemptive-field"]');
    fieldSelect.value = 'thunder';
    fieldSelect.dispatchEvent(new win.Event('change', { bubbles: true }));

    const setupSnapshot = controller.getSetupSnapshot({
      isFrontFilled: false,
      styleIds: [null, null, null, null, null, null],
    });
    assert.equal(setupSnapshot.enemy.preemptiveField, 'thunder');
  }));

test('InitialSetupController no longer exposes session save/load controls in Simulator Settings', () =>
  withDom(({ root, pickerOverlay, win }) => {
    const controller = new InitialSetupController({
      root,
      pickerOverlay,
      store: createStoreStub(),
    });
    controller.mount();

    root
      .querySelector('[role="tab"][data-tab="simulator"]')
      .dispatchEvent(new win.MouseEvent('click', { bubbles: true }));

    assert.equal(root.querySelector('[data-role="session-save-btn"]'), null);
    assert.equal(root.querySelector('[data-role="session-load-btn"]'), null);
    assert.equal(root.querySelector('[data-role="session-load-input"]'), null);
  }));

test('InitialSetupController applySetupSnapshot restores simulator toggles', () =>
  withDom(({ root, pickerOverlay }) => {
    const controller = new InitialSetupController({
      root,
      pickerOverlay,
      store: createStoreStub(),
    });
    controller.mount();

    controller.applySetupSnapshot({
      party: {
        styleIds: [null, null, null, null, null, null],
        supportStyleIds: [null, null, null, null, null, null],
      },
      simulatorSettings: {
        targetSelection: {
          enemyMode: TARGET_SELECTION_MODES.MANUAL,
          allyMode: TARGET_SELECTION_MODES.SIMPLE,
        },
        captureUntilBattleEnd: true,
      },
    });

    assert.equal(root.querySelector('[data-role="enemy-target-simplify-toggle"]').checked, false);
    assert.equal(root.querySelector('[data-role="ally-target-simplify-toggle"]').checked, true);
    assert.equal(root.querySelector('[data-role="capture-until-battle-end-toggle"]').checked, true);
  }));

test('InitialSetupController applySetupSnapshot restores enemy preemptive field selection', () =>
  withDom(({ root, pickerOverlay, win }) => {
    const controller = new InitialSetupController({
      root,
      pickerOverlay,
      store: createStoreStub(),
    });
    controller.mount();

    controller.applySetupSnapshot({
      enemy: {
        preemptiveField: 'fire',
      },
    });

    root
      .querySelector('[role="tab"][data-tab="enemy"]')
      .dispatchEvent(new win.MouseEvent('click', { bubbles: true }));

    const fieldSelect = root.querySelector('[data-action="select-preemptive-field"]');
    assert.equal(fieldSelect.value, 'fire');
  }));

test('InitialSetupController getCurrentSetupSnapshot returns party and simulator settings together', () =>
  withDom(({ root, pickerOverlay }) => {
    const controller = new InitialSetupController({
      root,
      pickerOverlay,
      store: createStoreStub(),
    });
    controller.mount();

    const snapshot = controller.getCurrentSetupSnapshot();

    assert.ok(snapshot.party);
    assert.equal(
      snapshot.simulatorSettings.targetSelection.enemyMode,
      TARGET_SELECTION_MODES.SIMPLE,
    );
    assert.equal(snapshot.simulatorSettings.captureUntilBattleEnd, true);
    assert.equal(snapshot.enemy.preemptiveField, 'none');
  }));

test('InitialSetupController restores enemy manual resistance percent and absorb selection', () =>
  withDom(({ root, pickerOverlay, win }) => {
    const controller = new InitialSetupController({
      root,
      pickerOverlay,
      store: createStoreStub(),
      enemies: [
        {
          id: 9001,
          name: '敵テスト',
          dimension: 1,
          od_rate: 2,
          max_d_rate: 650,
          resistances: {
            element: {
              slash: 100,
              stab: 100,
              strike: 100,
              fire: 400,
              ice: 30,
              thunder: 100,
              light: 100,
              dark: 100,
              nonelement: 100,
            },
          },
          absorbElementList: ['nonelement'],
        },
      ],
    });
    controller.mount();

    controller.applySetupSnapshot({
      enemy: {
        selectedEnemyId: 9001,
        isManual: true,
        manual: {
          od_rate: 7,
          max_d_rate: 700,
          element: {
            slash: 150,
            stab: 100,
            strike: 100,
            fire: 400,
            ice: 30,
            thunder: 100,
            light: 100,
            dark: 60,
            nonelement: 100,
          },
          absorbElementList: ['fire', 'nonelement'],
        },
      },
    });

    root
      .querySelector('[role="tab"][data-tab="enemy"]')
      .dispatchEvent(new win.MouseEvent('click', { bubbles: true }));

    assert.equal(root.querySelector('[data-edit-element="fire"]').value, '400');
    assert.equal(root.querySelector('[data-edit-element="ice"]').value, '30');
    assert.equal(root.querySelector('[data-edit-absorb="fire"]').checked, true);
    assert.equal(root.querySelector('[data-edit-absorb="nonelement"]').checked, true);

    const snapshot = controller.getCurrentSetupSnapshot();
    assert.equal(snapshot.enemy.isManual, true);
    assert.equal(snapshot.enemy.resistances.element.fire, 400);
    assert.equal(snapshot.enemy.resistances.element.ice, 30);
    assert.deepEqual(snapshot.enemy.absorbElementList, ['fire', 'nonelement']);
  }));

test('InitialSetupController auto-recalculates when active battle gains skills from skill settings', () =>
  withDom(({ root, pickerOverlay, win }) => {
    const recalculations = [];
    const controller = new InitialSetupController({
      root,
      pickerOverlay,
      store: createStoreStub(),
      onRecalculate: (snapshot, options) => {
        recalculations.push({ snapshot, options });
      },
    });
    controller.mount();
    controller.applySetupSnapshot({
      party: {
        styleIds: [1001, 1002, 1003, null, null, null],
        supportStyleIds: [null, null, null, null, null, null],
        limitBreakLevelsByPartyIndex: { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
        supportLimitBreakLevelsByPartyIndex: { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
        drivePierceByPartyIndex: { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
        startSpEquipByPartyIndex: { 0: 3, 1: 3, 2: 3, 3: 3, 4: 3, 5: 3 },
        skillSetsByPartyIndex: {
          0: [46000001, 46400001],
          1: [46000011],
          2: [46000021],
        },
      },
      simulatorSettings: {
        targetSelection: {
          enemyMode: TARGET_SELECTION_MODES.SIMPLE,
          allyMode: TARGET_SELECTION_MODES.SIMPLE,
        },
      },
    });
    controller.setHasActiveBattle(true);
    controller.setHasRecords(false);

    root
      .querySelector('[data-action="open-skill-settings"][data-slot-index="0"]')
      .dispatchEvent(new win.MouseEvent('click', { bubbles: true }));

    const masterCheckbox = win.document.querySelector(
      'input[data-field="skill-setting"][data-slot-index="0"][value="46500001"]'
    );
    masterCheckbox.checked = true;
    masterCheckbox.dispatchEvent(new win.Event('change', { bubbles: true }));

    assert.equal(recalculations.length, 1);
    assert.equal(recalculations[0].options.automatic, true);
    assert.deepEqual(recalculations[0].options.meta.addedSkillIds, [46500001]);
    assert.deepEqual(recalculations[0].snapshot.party.skillSetsByPartyIndex['0'], [
      46000001,
      46400001,
      46500001,
    ]);
  }));
