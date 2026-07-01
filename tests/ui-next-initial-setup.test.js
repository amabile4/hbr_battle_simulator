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

function createStoreStubWithBaseStats() {
  const store = createStoreStub();
  const stats = { str: 10, dex: 20, wis: 30, spr: 40, luk: 50, con: 60 };
  store.characters = [
    {
      label: 'C1001',
      base_param: {
        level: [1, 200],
        ...Object.fromEntries(Object.entries(stats).map(([key, value]) => [key, [1, value]])),
      },
    },
    {
      label: 'C1002',
      base_param: {
        level: [1, 200],
        ...Object.fromEntries(Object.entries(stats).map(([key, value]) => [key, [1, value + 100]])),
      },
    },
  ];
  store.getCharacterByLabel = (label) =>
    store.characters.find((character) => character.label === label) ?? null;
  for (const [index, style] of store.styles.entries()) {
    style.role = index === 0 ? 'Attacker' : 'Buffer';
    style.base_param = index === 0
      ? { str: 1, dex: 2, wis: 3, spr: 4, luk: 5, con: 6 }
      : { str: 7, dex: 8, wis: 9, spr: 10, luk: 11, con: 12 };
    style.ability_tree = [];
    style.limit_break = { stat_up_per_level: 2.5, bonus_per_level: [] };
  }
  return store;
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
        { enchant: { desc: 'ODゲージ上昇量+20%' } },
        { enchant: { desc: 'ターン開始時ダウンターン中の敵がいるとSP+2' } },
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
    assert.match(simulatorContent.textContent, /転生回数（0〜20）/);
    assert.match(simulatorContent.textContent, /称号レベル（0〜15）/);
    assert.equal(root.querySelector('[data-role="enemy-target-simplify-toggle"]').checked, true);
    assert.equal(root.querySelector('[data-role="ally-target-simplify-toggle"]').checked, false);

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

test('InitialSetupController stage tab mounts Stage Setup UI instead of TODO placeholder', () =>
  withDom(({ root, pickerOverlay, win }) => {
    const controller = new InitialSetupController({
      root,
      pickerOverlay,
      store: createStoreStub(),
      dimensionBattles: createDimensionBattlesFixture(),
    });
    controller.mount();

    root
      .querySelector('[role="tab"][data-tab="stage"]')
      .dispatchEvent(new win.MouseEvent('click', { bubbles: true }));

    const stageContent = root.querySelector('[data-tab-content="stage"]');
    assert.equal(stageContent.hidden, false);
    assert.equal(stageContent.textContent.includes('(TODO)'), false);
    assert.ok(stageContent.querySelector('[data-role="stage-initial-od"]'));
    assert.ok(stageContent.querySelector('[data-role="stage-dimension-battle"]'));
  }));

test('InitialSetupController stage preset reflection updates only upper stage setup snapshot', () =>
  withDom(({ root, pickerOverlay, win }) => {
    const controller = new InitialSetupController({
      root,
      pickerOverlay,
      store: createStoreStub(),
      dimensionBattles: createDimensionBattlesFixture(),
    });
    controller.mount();

    root
      .querySelector('[role="tab"][data-tab="stage"]')
      .dispatchEvent(new win.MouseEvent('click', { bubbles: true }));

    const dimensionSelect = root.querySelector('[data-role="stage-dimension-battle"]');
    const odInput = root.querySelector('[data-role="stage-initial-od"]');
    const spInput = root.querySelector('[data-role="stage-initial-sp"]');
    const defenseUpToggle = root.querySelector('[data-role="stage-effect-defense-up"]');

    dimensionSelect.value = '191000001';
    dimensionSelect.dispatchEvent(new win.Event('change', { bubbles: true }));

    const satelliteCheckboxes = root.querySelectorAll('[data-role="stage-satellite-checkbox"]');
    satelliteCheckboxes.item(0).checked = true;
    satelliteCheckboxes.item(0).dispatchEvent(new win.Event('change', { bubbles: true }));

    assert.equal(Number(odInput.value), 200);
    assert.equal(Number(spInput.value), 0);
    assert.equal(defenseUpToggle.checked, false);

    satelliteCheckboxes.item(2).checked = true;
    satelliteCheckboxes.item(2).dispatchEvent(new win.Event('change', { bubbles: true }));

    const snapshot = controller.getCurrentSetupSnapshot();
    assert.equal(Number(odInput.value), 200);
    assert.equal(Number(spInput.value), 0);
    assert.equal(defenseUpToggle.checked, true);
    assert.equal(snapshot.party.stageSetup.initialOdGauge, 200);
    assert.equal(snapshot.party.stageSetup.initialSpBonusAll, 0);
    assert.equal(snapshot.party.stageSetup.selectedDimensionBattleId, 191000001);
    assert.deepEqual(snapshot.party.stageSetup.enchantEffects, []);
    assert.equal(
      snapshot.party.stageSetup.initialStatusEffects.some((effect) => effect.statusType === 'DefenseUp'),
      true,
    );
  }));

test('InitialSetupController applySetupSnapshot restores stage setup upper inputs', () =>
  withDom(({ root, pickerOverlay, win }) => {
    const controller = new InitialSetupController({
      root,
      pickerOverlay,
      store: createStoreStub(),
      dimensionBattles: createDimensionBattlesFixture(),
    });
    controller.mount();

    controller.applySetupSnapshot({
      party: {
        styleIds: [1001, 1002, 1003, null, null, null],
        supportStyleIds: [null, null, null, null, null, null],
        stageSetup: {
          initialOdGauge: -300,
          initialSpBonusAll: 5,
          turnlyOdGauge: -10,
          selectedDimensionBattleId: 191000002,
          enchantEffects: [
            { effectType: 'odGaugeGainBonusPercent', amount: 20 },
          ],
          initialStatusEffects: [
            {
              scope: 'all',
              statusType: 'DebuffGuard',
              remaining: 1,
              limitType: 'Count',
              exitCond: 'Count',
            },
          ],
        },
      },
    });

    root
      .querySelector('[role="tab"][data-tab="stage"]')
      .dispatchEvent(new win.MouseEvent('click', { bubbles: true }));

    assert.equal(root.querySelector('[data-role="stage-initial-od"]').value, '-300');
    assert.equal(root.querySelector('[data-role="stage-initial-sp"]').value, '5');
    assert.equal(root.querySelector('[data-role="stage-turnly-od"]').value, '-10');
    assert.equal(root.querySelector('[data-role="stage-effect-defense-up"]').checked, false);
    assert.equal(root.querySelector('[data-role="stage-effect-debuff-guard"]').checked, true);
    assert.equal(root.querySelector('[data-role="stage-dimension-battle"]').value, '191000002');
    assert.deepEqual(
      [...root.querySelectorAll('[data-role="stage-enchant-summary"] li')].map((item) => item.textContent.trim()),
      ['ODゲージ上昇量+20%']
    );
  }));

test('InitialSetupController stage setup save/load preserves enchantEffects', () =>
  withDom(({ root, pickerOverlay, win }) => {
    const controller = new InitialSetupController({
      root,
      pickerOverlay,
      store: createStoreStub(),
      dimensionBattles: createDimensionBattlesFixture(),
    });
    controller.mount();

    root
      .querySelector('[role="tab"][data-tab="stage"]')
      .dispatchEvent(new win.MouseEvent('click', { bubbles: true }));

    const dimensionSelect = root.querySelector('[data-role="stage-dimension-battle"]');
    dimensionSelect.value = '191000001';
    dimensionSelect.dispatchEvent(new win.Event('change', { bubbles: true }));

    const satelliteCheckboxes = root.querySelectorAll('[data-role="stage-satellite-checkbox"]');
    satelliteCheckboxes.item(4).checked = true;
    satelliteCheckboxes.item(4).dispatchEvent(new win.Event('change', { bubbles: true }));
    satelliteCheckboxes.item(5).checked = true;
    satelliteCheckboxes.item(5).dispatchEvent(new win.Event('change', { bubbles: true }));

    const snapshot = controller.getCurrentSetupSnapshot();
    assert.deepEqual(snapshot.party.stageSetup.enchantEffects, [
      { effectType: 'odGaugeGainBonusPercent', amount: 20 },
      { effectType: 'turnStartSpIfEnemyDown', scope: 'all', amount: 2 },
    ]);

    controller.applySetupSnapshot(snapshot);

    assert.deepEqual(
      [...root.querySelectorAll('[data-role="stage-enchant-summary"] li')].map((item) => item.textContent.trim()),
      ['ODゲージ上昇量+20%', 'ターン開始時ダウンターン中の敵がいるとSP+2']
    );
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
      TARGET_SELECTION_MODES.MANUAL,
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

test('InitialSetupController keeps session setup raw and materializes stats at the battle boundary', () =>
  withDom(({ root, pickerOverlay }) => {
    let appliedSnapshot = null;
    const controller = new InitialSetupController({
      root,
      pickerOverlay,
      store: createStoreStubWithBaseStats(),
      onApply: (snapshot) => {
        appliedSnapshot = snapshot;
      },
    });
    controller.mount();
    controller.applySetupSnapshot({
      party: {
        styleIds: [1001, 1001, 1001, null, null, null],
        supportStyleIds: [1002, null, null, null, null, null],
        limitBreakLevelsByPartyIndex: { 0: 0 },
        supportLimitBreakLevelsByPartyIndex: { 0: 0 },
        statsByPartyIndex: {},
      },
    });

    assert.deepEqual(controller.getCurrentSetupSnapshot().party.statsByPartyIndex, {});

    root.querySelector('[data-role="apply-btn"]').click();
    const effectiveStats = appliedSnapshot.party.statsByPartyIndex['0'];
    assert.ok(effectiveStats);
    assert.deepEqual(Object.keys(effectiveStats.stats).sort(), ['con', 'dex', 'luk', 'spr', 'str', 'wis']);
    assert.deepEqual(Object.keys(effectiveStats.supportStats).sort(), ['con', 'dex', 'luk', 'spr', 'str', 'wis']);
  }));

test('InitialSetupController restores enemy manual resistance percent, absorb selection, and Eシールド', () =>
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
          e_shield: {
            count: 12,
            max: 30,
            maxByStage: [30, 35, 40],
            elements: ['Fire', 'Ice'],
            def_up_rate: 5000,
            dmg_limit: 200000,
          },
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
    assert.equal(root.querySelector('[data-edit-eshield-field="count"]').value, '12');
    assert.equal(root.querySelector('[data-edit-eshield-field="max"]').value, '30');
    assert.equal(root.querySelector('[data-edit-eshield-field="max"]').disabled, false);
    assert.equal(root.querySelector('[data-edit-eshield-element="Fire"]').checked, true);
    assert.equal(root.querySelector('[data-edit-eshield-element="Ice"]').checked, true);
    assert.equal(root.querySelector('[data-edit-eshield-field="def_up_rate"]').value, '5000');
    assert.equal(root.querySelector('[data-edit-eshield-field="dmg_limit"]').value, '200000');
    assert.equal(root.querySelector('[data-edit-eshield-stages]'), null);
    assert.match(
      root.querySelector('[data-role="enemy-e-shield-editor"]')?.textContent ?? '',
      /段階別最大値: 30,35,40/
    );

    const snapshot = controller.getCurrentSetupSnapshot();
    assert.equal(snapshot.enemy.isManual, true);
    assert.equal(snapshot.enemy.resistances.element.fire, 400);
    assert.equal(snapshot.enemy.resistances.element.ice, 30);
    assert.deepEqual(snapshot.enemy.absorbElementList, ['fire', 'nonelement']);
    assert.deepEqual(snapshot.enemy.e_shield, {
      count: 12,
      max: 30,
      maxByStage: [30, 35, 40],
      elements: ['Fire', 'Ice'],
      def_up_rate: 5000,
      dmg_limit: 200000,
    });
  }));

test('InitialSetupController enemy setup manual edit updates Eシールド fields in snapshot', () =>
  withDom(({ root, pickerOverlay, win }) => {
    const controller = new InitialSetupController({
      root,
      pickerOverlay,
      store: createStoreStub(),
      enemies: [
        {
          id: 9101,
          name: 'Eシールド対象',
          categoryKey: 'template',
          categoryLabel: 'テンプレート',
          dimension: null,
          od_rate: 1,
          max_d_rate: 999,
          resistances: { element: {} },
          absorbElementList: [],
          e_shield: {
            count: 30,
            max: 30,
            maxByStage: [30, 35, 40],
            elements: ['Fire', 'Ice'],
            def_up_rate: 5000,
            dmg_limit: 0,
          },
          extra_hp_gauge: {
            total: 3,
            remaining: 3,
            values: [75000000, 150000000, 200000000],
          },
        },
      ],
    });
    controller.mount();

    root
      .querySelector('[role="tab"][data-tab="enemy"]')
      .dispatchEvent(new win.MouseEvent('click', { bubbles: true }));

    root
      .querySelector('[data-action="select-enemy"]')
      .dispatchEvent(new win.Event('change', { bubbles: true }));

    root
      .querySelector('[data-action="toggle-edit"]')
      .dispatchEvent(new win.MouseEvent('click', { bubbles: true }));

    const countInput = root.querySelector('[data-edit-eshield-field="count"]');
    countInput.value = '7';
    countInput.dispatchEvent(new win.Event('change', { bubbles: true }));

    const maxInput = root.querySelector('[data-edit-eshield-field="max"]');
    assert.equal(maxInput.value, '30');
    assert.equal(maxInput.disabled, true);

    const fireCheckbox = root.querySelector('[data-edit-eshield-element="Fire"]');
    fireCheckbox.checked = false;
    fireCheckbox.dispatchEvent(new win.Event('change', { bubbles: true }));

    const lightCheckbox = root.querySelector('[data-edit-eshield-element="Light"]');
    lightCheckbox.checked = true;
    lightCheckbox.dispatchEvent(new win.Event('change', { bubbles: true }));

    const defUpInput = root.querySelector('[data-edit-eshield-field="def_up_rate"]');
    defUpInput.value = '3200';
    defUpInput.dispatchEvent(new win.Event('change', { bubbles: true }));

    const damageLimitInput = root.querySelector('[data-edit-eshield-field="dmg_limit"]');
    damageLimitInput.value = '150000';
    damageLimitInput.dispatchEvent(new win.Event('change', { bubbles: true }));

    assert.equal(root.querySelector('[data-edit-eshield-stages]'), null);
    const stageInputs = root.querySelectorAll('[data-edit-eshield-stage-index]');
    assert.equal(stageInputs.length, 3);
    assert.equal(stageInputs.item(0).value, '30');
    assert.equal(stageInputs.item(1).value, '35');
    assert.equal(stageInputs.item(2).value, '40');
    [7, 11, 15].forEach((value, index) => {
      const input = root.querySelector(`[data-edit-eshield-stage-index="${index}"]`);
      input.value = String(value);
      input.dispatchEvent(new win.Event('change', { bubbles: true }));
    });

    const snapshot = controller.getCurrentSetupSnapshot();
    assert.equal(snapshot.enemy.isManual, true);
    assert.deepEqual(snapshot.enemy.e_shield, {
      count: 7,
      max: 7,
      maxByStage: [7, 11, 15],
      elements: ['Ice', 'Light'],
      def_up_rate: 3200,
      dmg_limit: 150000,
    });
    assert.deepEqual(snapshot.enemy.enemySlots[0].manual.e_shield, {
      count: 7,
      max: 7,
      maxByStage: [7, 11, 15],
      elements: ['Ice', 'Light'],
      def_up_rate: 3200,
      dmg_limit: 150000,
    });
  }));

test('InitialSetupController enemy setup defaults to slot 1 selected and slots 2/3 empty', () =>
  withDom(({ root, pickerOverlay, win }) => {
    const controller = new InitialSetupController({
      root,
      pickerOverlay,
      store: createStoreStub(),
      enemies: [
        {
          id: 13450045,
          name: '希望を喰むもの',
          dimension: null,
          od_rate: 0,
          max_d_rate: 999,
          resistances: { element: {} },
          absorbElementList: [],
        },
        {
          id: 7001,
          name: '魔王ヤマワキ',
          dimension: 202603,
          od_rate: 8500,
          max_d_rate: 700,
          resistances: { element: {} },
          absorbElementList: [],
        },
      ],
    });
    controller.mount();

    root
      .querySelector('[role="tab"][data-tab="enemy"]')
      .dispatchEvent(new win.MouseEvent('click', { bubbles: true }));

    const slotButtons = root.querySelectorAll('[data-action="set-active-slot"]');
    assert.equal(slotButtons.length, 3);
    assert.equal(slotButtons.item(0).textContent.includes('[1] 希望を喰むもの'), true);
    assert.equal(slotButtons.item(1).textContent.includes('[2] -'), true);
    assert.equal(slotButtons.item(2).textContent.includes('[3] -'), true);

    const snapshot = controller.getCurrentSetupSnapshot();
    assert.deepEqual(snapshot.enemy.selectedEnemyIds, [13450045, null, null]);
    assert.equal(snapshot.enemy.enemyCount, 1);
    assert.equal(snapshot.enemy.od_rate, 1);
  }));

test('InitialSetupController enemy setup supports selecting and deleting slot 2 enemy', () =>
  withDom(({ root, pickerOverlay, win }) => {
    const controller = new InitialSetupController({
      root,
      pickerOverlay,
      store: createStoreStub(),
      enemies: [
        {
          id: 13450045,
          name: '希望を喰むもの',
          dimension: null,
          od_rate: 0,
          max_d_rate: 999,
          resistances: { element: {} },
          absorbElementList: [],
        },
        {
          id: 7001,
          name: '魔王ヤマワキ',
          dimension: 202603,
          od_rate: 8500,
          max_d_rate: 700,
          resistances: { element: {} },
          absorbElementList: [],
        },
      ],
    });
    controller.mount();

    root
      .querySelector('[role="tab"][data-tab="enemy"]')
      .dispatchEvent(new win.MouseEvent('click', { bubbles: true }));

    root
      .querySelector('[data-action="set-active-slot"][data-slot-index="1"]')
      .dispatchEvent(new win.MouseEvent('click', { bubbles: true }));

    const categorySelect = root.querySelector('[data-action="select-enemy-category"]');
    let presetSelect = root.querySelector('[data-action="select-enemy"]');
    const recentMonthOption = [...categorySelect.options].find((option) => option.textContent.includes('2026年3月'));
    categorySelect.value = recentMonthOption?.value ?? categorySelect.value;
    categorySelect.dispatchEvent(new win.Event('change', { bubbles: true }));
    presetSelect = root.querySelector('[data-action="select-enemy"]');
    presetSelect.value = '7001';
    presetSelect.dispatchEvent(new win.Event('change', { bubbles: true }));

    let snapshot = controller.getCurrentSetupSnapshot();
    assert.deepEqual(snapshot.enemy.selectedEnemyIds, [13450045, 7001, null]);
    assert.equal(snapshot.enemy.enemyCount, 2);
    assert.equal(snapshot.enemy.enemySlots[1].od_rate, 0.85);

    root
      .querySelector('[data-action="clear-slot"][data-slot-index="1"]')
      .dispatchEvent(new win.MouseEvent('click', { bubbles: true }));

    snapshot = controller.getCurrentSetupSnapshot();
    assert.deepEqual(snapshot.enemy.selectedEnemyIds, [13450045, null, null]);
    assert.equal(snapshot.enemy.enemyCount, 1);
  }));

test('InitialSetupController enemy setup switches slot 1 via category selector and reaches 恒星掃戦線 presets', () =>
  withDom(({ root, pickerOverlay, win }) => {
    const controller = new InitialSetupController({
      root,
      pickerOverlay,
      store: createStoreStub(),
      enemies: [
        {
          id: 13450045,
          name: '希望を喰むもの',
          categoryKey: 'template',
          categoryLabel: 'テンプレート',
          dimension: null,
          od_rate: 0,
          max_d_rate: 999,
          resistances: { element: {} },
          absorbElementList: [],
        },
        {
          id: 13450815,
          name: '変貌を重ねる不滅の円環',
          categoryKey: 'normal:stellar-sweepfront',
          categoryLabel: '恒星掃戦線',
          dimension: 202508,
          base_param: { param_border: 812 },
          od_rate: 0,
          max_d_rate: 999,
          resistances: { element: {} },
          absorbElementList: [],
        },
      ],
    });
    controller.mount();

    root
      .querySelector('[role="tab"][data-tab="enemy"]')
      .dispatchEvent(new win.MouseEvent('click', { bubbles: true }));

    const categorySelect = root.querySelector('[data-action="select-enemy-category"]');
    categorySelect.value = 'normal:stellar-sweepfront';
    categorySelect.dispatchEvent(new win.Event('change', { bubbles: true }));

    const slotButtons = root.querySelectorAll('[data-action="set-active-slot"]');
    assert.equal(slotButtons.item(0).textContent.includes('変貌を重ねる不滅の円環'), true);

    const snapshot = controller.getCurrentSetupSnapshot();
    assert.deepEqual(snapshot.enemy.selectedEnemyIds, [13450815, null, null]);
    assert.equal(snapshot.enemy.selectedEnemyName, '変貌を重ねる不滅の円環');
    assert.equal(snapshot.enemy.enemySlots[0].param_border, 812);
    assert.equal(snapshot.enemy.enemySlots[0].destructionRate, 1);
    assert.equal(
      root.querySelector('[data-role="enemy-current-destruction-rate"]')?.textContent.includes('100.00%'),
      true,
    );
  }));

test('InitialSetupController template category keeps the Eシールド sample enemy ready for quick selection', () =>
  withDom(({ root, pickerOverlay, win }) => {
    const controller = new InitialSetupController({
      root,
      pickerOverlay,
      store: createStoreStub(),
      enemies: [
        {
          id: 13450045,
          name: '希望を喰むもの',
          categoryKey: 'template',
          categoryLabel: 'テンプレート',
          dimension: null,
          od_rate: 0,
          max_d_rate: 999,
          resistances: { element: {} },
          absorbElementList: [],
        },
        {
          id: 13450815,
          name: '変貌を重ねる不滅の円環',
          categoryKey: 'template',
          categoryLabel: 'テンプレート',
          dimension: null,
          od_rate: 0,
          max_d_rate: 999,
          resistances: { element: {} },
          absorbElementList: [],
          e_shield: {
            count: 30,
            max: 30,
            elements: ['Fire', 'Ice'],
            def_up_rate: 0,
            dmg_limit: 0,
          },
        },
      ],
    });
    controller.mount();

    root
      .querySelector('[role="tab"][data-tab="enemy"]')
      .dispatchEvent(new win.MouseEvent('click', { bubbles: true }));

    const categorySelect = root.querySelector('[data-action="select-enemy-category"]');
    const presetSelect = root.querySelector('[data-action="select-enemy"]');

    assert.equal(categorySelect.value, 'template');
    assert.equal(
      [...presetSelect.options].some((option) => option.value === '13450815' && option.textContent.includes('変貌を重ねる不滅の円環')),
      true,
    );

    presetSelect.value = '13450815';
    presetSelect.dispatchEvent(new win.Event('change', { bubbles: true }));

    const snapshot = controller.getCurrentSetupSnapshot();
    assert.deepEqual(snapshot.enemy.selectedEnemyIds, [13450815, null, null]);
    assert.equal(snapshot.enemy.selectedEnemyName, '変貌を重ねる不滅の円環');
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

test('InitialSetupController auto-recalculates effective automatic stats after character settings change', () =>
  withDom(({ root, pickerOverlay, win }) => {
    const recalculations = [];
    const controller = new InitialSetupController({
      root,
      pickerOverlay,
      store: createStoreStubWithBaseStats(),
      onRecalculate: (snapshot, options) => {
        recalculations.push({ snapshot, options });
      },
    });
    controller.mount();
    controller.applySetupSnapshot({
      party: {
        styleIds: [1001, 1002, 1003, null, null, null],
        supportStyleIds: [null, null, null, null, null, null],
        limitBreakLevelsByPartyIndex: { 0: 0, 1: 0, 2: 0 },
        supportLimitBreakLevelsByPartyIndex: { 0: 0, 1: 0, 2: 0 },
        statsByPartyIndex: {},
      },
    });
    controller.setHasActiveBattle(true);
    win.localStorage.setItem('hbr.ui_next.character_settings.v1', JSON.stringify({
      C1001: { titleRank: 12, reincarnation: 6 },
    }));

    controller.recomputePartyStats();

    assert.equal(recalculations.length, 1);
    assert.equal(recalculations[0].options.meta.hasStatsDelta, true);
    assert.ok(recalculations[0].snapshot.party.statsByPartyIndex['0'].stats);
  }));

test('InitialSetupController auto-recalculates active battle when enemy preset changes', () =>
  withDom(({ root, pickerOverlay, win }) => {
    const recalculations = [];
    const controller = new InitialSetupController({
      root,
      pickerOverlay,
      store: createStoreStub(),
      enemies: [
        {
          id: 13450045,
          name: '希望を喰むもの',
          categoryKey: 'template',
          categoryLabel: 'テンプレート',
          param_border: 770,
          od_rate: 0,
          max_d_rate: 999,
          resistances: { element: {} },
          absorbElementList: [],
        },
        {
          id: 13420081,
          name: '異時層 スカルフェザー 最終形態',
          categoryKey: 'normal:dimension-hard',
          categoryLabel: '異時層',
          param_border: 500,
          od_rate: 1,
          max_d_rate: 999,
          resistances: {
            element: {
              fire: 250,
              ice: 250,
              thunder: 250,
              light: 250,
              dark: 250,
              nonelement: 10,
            },
          },
          absorbElementList: [],
        },
      ],
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
      },
    });
    controller.setHasActiveBattle(true);
    controller.setHasRecords(false);

    root
      .querySelector('[role="tab"][data-tab="enemy"]')
      .dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
    const categorySelect = root.querySelector('[data-action="select-enemy-category"]');
    categorySelect.value = 'normal:dimension-hard';
    categorySelect.dispatchEvent(new win.Event('change', { bubbles: true }));
    recalculations.length = 0;

    const presetSelect = root.querySelector('[data-action="select-enemy"]');
    presetSelect.value = '13420081';
    presetSelect.dispatchEvent(new win.Event('change', { bubbles: true }));

    assert.equal(recalculations.length, 1);
    assert.equal(recalculations[0].options.automatic, true);
    assert.deepEqual(recalculations[0].options.meta, { enemySetupChanged: true });
    assert.equal(recalculations[0].snapshot.enemy.selectedEnemyId, 13420081);
    assert.equal(recalculations[0].snapshot.enemy.selectedEnemyName, '異時層 スカルフェザー 最終形態');
    assert.equal(recalculations[0].snapshot.enemy.enemySlots[0].param_border, 500);
  }));

test('InitialSetupController 全体初期化 resets party, enemy, and stage setup values after confirmation', () =>
  withDom(({ root, pickerOverlay, win }) => {
    const controller = new InitialSetupController({
      root,
      pickerOverlay,
      store: createStoreStub(),
      enemies: [
        { id: 13450045, name: '希望を喰むもの', od_rate: 0, max_d_rate: 999, resistances: { element: {} } },
        { id: 7001, name: '魔王ヤマワキ', od_rate: 8500, max_d_rate: 700, resistances: { element: {} } },
      ],
      dimensionBattles: createDimensionBattlesFixture(),
    });
    controller.mount();

    controller.applySetupSnapshot({
      party: {
        styleIds: [1001, 1002, 1003, null, null, null],
        supportStyleIds: [null, null, null, null, null, null],
        stageSetup: {
          initialOdGauge: -300,
          initialSpBonusAll: 5,
          turnlyOdGauge: -10,
          selectedDimensionBattleId: 191000001,
          enchantEffects: [
            { effectType: 'odGaugeGainBonusPercent', amount: 20 },
          ],
          initialStatusEffects: [{ scope: 'all', statusType: 'DefenseUp' }],
        },
      },
      enemy: {
        preemptiveField: 'thunder',
        selectedEnemyIds: [7001, null, null],
      },
    });

    win.confirm = () => true;

    root
      .querySelector('[data-action="toggle-party-manage"]')
      .dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
    win.document
      .querySelector('[data-role="party-manage-menu"] [data-action="reset-all-setup"]')
      .dispatchEvent(new win.MouseEvent('click', { bubbles: true }));

    const snapshot = controller.getCurrentSetupSnapshot();
    assert.deepEqual(snapshot.party.styleIds, [null, null, null, null, null, null]);
    assert.equal(snapshot.enemy.preemptiveField, 'none');
    assert.equal(snapshot.party.stageSetup.initialOdGauge, 0);
    assert.equal(snapshot.party.stageSetup.initialSpBonusAll, 0);
    assert.equal(snapshot.party.stageSetup.turnlyOdGauge, 0);
    assert.equal(snapshot.party.stageSetup.initialStatusEffects.length, 0);
    assert.deepEqual(snapshot.party.stageSetup.enchantEffects, []);
  }));

test('InitialSetupController 全体初期化 keeps current setup when confirmation is cancelled', () =>
  withDom(({ root, pickerOverlay, win }) => {
    const controller = new InitialSetupController({
      root,
      pickerOverlay,
      store: createStoreStub(),
      enemies: [
        { id: 13450045, name: '希望を喰むもの', od_rate: 0, max_d_rate: 999, resistances: { element: {} } },
      ],
      dimensionBattles: createDimensionBattlesFixture(),
    });
    controller.mount();

    controller.applySetupSnapshot({
      party: {
        styleIds: [1001, 1002, 1003, null, null, null],
        supportStyleIds: [null, null, null, null, null, null],
        stageSetup: {
          initialOdGauge: -300,
          initialSpBonusAll: 5,
          turnlyOdGauge: -10,
          selectedDimensionBattleId: 191000001,
          enchantEffects: [
            { effectType: 'odGaugeGainBonusPercent', amount: 20 },
          ],
          initialStatusEffects: [{ scope: 'all', statusType: 'DefenseUp' }],
        },
      },
      enemy: {
        preemptiveField: 'thunder',
        selectedEnemyIds: [13450045, null, null],
      },
    });

    win.confirm = () => false;

    root
      .querySelector('[data-action="toggle-party-manage"]')
      .dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
    win.document
      .querySelector('[data-role="party-manage-menu"] [data-action="reset-all-setup"]')
      .dispatchEvent(new win.MouseEvent('click', { bubbles: true }));

    const snapshot = controller.getCurrentSetupSnapshot();
    assert.deepEqual(snapshot.party.styleIds, [1001, 1002, 1003, null, null, null]);
    assert.equal(snapshot.enemy.preemptiveField, 'thunder');
    assert.equal(snapshot.party.stageSetup.initialOdGauge, -300);
    assert.equal(snapshot.party.stageSetup.initialSpBonusAll, 5);
    assert.equal(snapshot.party.stageSetup.turnlyOdGauge, -10);
    assert.equal(snapshot.party.stageSetup.initialStatusEffects.length, 1);
    assert.deepEqual(snapshot.party.stageSetup.enchantEffects, [
      { effectType: 'odGaugeGainBonusPercent', amount: 20 },
    ]);
  }));
