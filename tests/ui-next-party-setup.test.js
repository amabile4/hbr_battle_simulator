import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

import { PartySetupController } from '../ui-next/components/party-setup.js';

function withDom(run) {
  const dom = new JSDOM(
    '<!doctype html><html><body><div id="root"></div><div id="picker-overlay"></div></body></html>',
    { url: 'https://example.test/' },
  );
  const previous = {
    window: globalThis.window,
    document: globalThis.document,
    CustomEvent: globalThis.CustomEvent,
    Event: globalThis.Event,
    MouseEvent: globalThis.MouseEvent,
    localStorage: globalThis.localStorage,
  };

  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
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
    globalThis.CustomEvent = previous.CustomEvent;
    globalThis.Event = previous.Event;
    globalThis.MouseEvent = previous.MouseEvent;
    globalThis.localStorage = previous.localStorage;
    dom.window.close();
  }
}

function createStyle(id, chara, tier = 'SS') {
  return {
    id,
    name: `${chara} style`,
    chara,
    chara_label: `C${id}`,
    image: '',
    tier,
    role: id === 1001 ? 'Attacker' : 'Buffer',
    passives: [],
    skills: [],
  };
}

function createSkill(id, name, { sourceType = 'style', passive = false, label = `Skill${id}` } = {}) {
  return {
    id,
    skillId: id,
    name,
    label,
    sourceType,
    sp_cost: 0,
    ...(passive ? { passive: { timing: 'OnFirstBattleStart', effect: name } } : {}),
  };
}

function createStoreStub() {
  const styles = [
    createStyle(1001, '茅森 月歌'),
    createStyle(1002, '和泉 ユキ'),
    createStyle(1003, '逢川 めぐみ'),
  ];
  const styleById = new Map(styles.map((style) => [style.id, style]));
  const equipableSkillsByStyleId = new Map([
    [1001, [
      createSkill(46000001, '通常攻撃'),
      createSkill(46400001, 'ルビー・パフューム', { sourceType: 'passive', passive: true }),
      createSkill(46500001, 'マスタースキル', { sourceType: 'master' }),
      createSkill(46300001, 'オーブスキル', { sourceType: 'orb' }),
    ]],
    [1002, [
      createSkill(46000011, '通常攻撃'),
      createSkill(46400011, 'パッシブB', { sourceType: 'passive', passive: true }),
    ]],
    [1003, [
      createSkill(46000021, '通常攻撃'),
    ]],
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

test('PartySetupController defaults all SP equip selectors to SP +3', () =>
  withDom(({ root, pickerOverlay }) => {
    const controller = new PartySetupController({
      root,
      pickerOverlay,
      store: createStoreStub(),
    });
    controller.mount();

    const selects = [...root.querySelectorAll('select[data-field="spEquip"]')];
    assert.equal(selects.length, 6);
    assert.deepEqual(
      selects.map((select) => select.value),
      ['3', '3', '3', '3', '3', '3']
    );
    assert.deepEqual(
      Object.values(controller.getSnapshot().startSpEquipByPartyIndex),
      [3, 3, 3, 3, 3, 3]
    );
  }));

test('PartySetupController edits, snapshots, restores, and swaps slot stats', () =>
  withDom(({ root, pickerOverlay, win }) => {
    const controller = new PartySetupController({
      root,
      pickerOverlay,
      store: createStoreStub(),
    });
    controller.mount();
    controller.applySnapshot({
      styleIds: [1001, 1002, 1003, null, null, null],
      supportStyleIds: [null, null, null, null, null, null],
      limitBreakLevelsByPartyIndex: { 0: 0, 1: 0, 2: 0 },
      statsByPartyIndex: {
        0: { stats: { str: 650, dex: 670, wis: 600, spr: 610, luk: 620, con: 630 } },
      },
    });

    root.querySelector('[data-action="open-stats-settings"][data-slot-index="0"][data-mode="main"]')
      .dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
    const panel = win.document.querySelector('#stats-settings-panel');
    assert.equal(panel.style.display, 'block');
    assert.equal(panel.querySelector('[data-stat="str"]').value, '650');
    panel.querySelector('[data-stat="str"]').value = '700';
    panel.querySelector('[data-action="apply-stats"]')
      .dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
    assert.equal(controller.getSnapshot().statsByPartyIndex['0'].stats.str, 700);

    root.querySelector('[data-action="toggle-reorder-mode"]')
      .dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
    root.querySelector('[data-role="party-slot-main-button"][data-slot-index="0"]')
      .dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
    root.querySelector('[data-role="party-slot-main-button"][data-slot-index="1"]')
      .dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
    assert.equal(controller.getSnapshot().statsByPartyIndex['1'].stats.str, 700);

    controller.disbandParty();
    assert.deepEqual(controller.getSnapshot().statsByPartyIndex, {});
  }));

test('PartySetupController prefills unsaved main stats with support 10%', () =>
  withDom(({ root, pickerOverlay, win }) => {
    const controller = new PartySetupController({
      root,
      pickerOverlay,
      store: createStoreStub(),
    });
    controller.mount();
    controller.applySnapshot({
      styleIds: [1001, null, null, null, null, null],
      supportStyleIds: [1002, null, null, null, null, null],
      limitBreakLevelsByPartyIndex: { 0: 0 },
      supportLimitBreakLevelsByPartyIndex: { 0: 0 },
      statsByPartyIndex: {
        0: {
          supportStats: { str: 600, dex: 600, wis: 670, spr: 620, luk: 600, con: 600 },
        },
      },
    });

    root.querySelector('[data-action="open-stats-settings"][data-slot-index="0"][data-mode="main"]')
      .dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
    const panel = win.document.querySelector('#stats-settings-panel');

    assert.equal(panel.querySelector('[data-stat="str"]').value, '710');
    assert.equal(panel.querySelector('[data-stat="wis"]').value, '667');
    assert.equal(controller.getSnapshot().statsByPartyIndex['0'].stats, undefined);
  }));

test('PartySetupController exports belt selection as normalAttackElementsByPartyIndex', () =>
  withDom(({ root, pickerOverlay, win }) => {
    const controller = new PartySetupController({
      root,
      pickerOverlay,
      store: createStoreStub(),
    });
    controller.mount();

    const beltSelect = root.querySelector('select[data-field="belt"][data-slot-index="0"]');
    beltSelect.value = 'Ice';
    beltSelect.dispatchEvent(new win.Event('change', { bubbles: true }));

    assert.deepEqual(controller.getSnapshot().normalAttackElementsByPartyIndex, {
      0: ['Ice'],
    });
  }));

test('PartySetupController restores belt selector from normalAttackElementsByPartyIndex and ignores invalid values', () =>
  withDom(({ root, pickerOverlay }) => {
    const controller = new PartySetupController({
      root,
      pickerOverlay,
      store: createStoreStub(),
    });
    controller.mount();

    controller.applySnapshot({
      styleIds: [1001, null, null, null, null, null],
      supportStyleIds: [null, null, null, null, null, null],
      limitBreakLevelsByPartyIndex: { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
      supportLimitBreakLevelsByPartyIndex: { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
      drivePierceByPartyIndex: { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
      startSpEquipByPartyIndex: { 0: 3, 1: 3, 2: 3, 3: 3, 4: 3, 5: 3 },
      normalAttackElementsByPartyIndex: {
        0: ['Thunder'],
        1: ['Fire', 'Ice'],
        2: ['Void'],
      },
    });

    const values = [...root.querySelectorAll('select[data-field="belt"]')].map((select) => select.value);
    assert.equal(values[0], 'Thunder');
    assert.equal(values[1], '');
    assert.equal(values[2], '');
  }));

test('PartySetupController no longer renders preset controls inside setup body', () =>
  withDom(({ root, pickerOverlay }) => {
    const controller = new PartySetupController({
      root,
      pickerOverlay,
      store: createStoreStub(),
    });
    controller.mount();

    assert.equal(root.querySelector('[data-action="toggle-preset"]'), null);
    assert.equal(root.querySelector('[data-action="save-preset"]'), null);
    assert.equal(root.querySelector('[data-action="load-preset"]'), null);
  }));

test('PartySetupController PT解散 button clears current party selection from setup view', () =>
  withDom(({ root, pickerOverlay, win }) => {
    const controller = new PartySetupController({
      root,
      pickerOverlay,
      store: createStoreStub(),
    });
    controller.mount();
    controller.applySnapshot({
      styleIds: [1001, 1002, 1003, null, null, null],
      supportStyleIds: [null, null, null, null, null, null],
      limitBreakLevelsByPartyIndex: { 0: 4, 1: 1, 2: 0, 3: 0, 4: 0, 5: 0 },
      supportLimitBreakLevelsByPartyIndex: { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
      drivePierceByPartyIndex: { 0: 10, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
      startSpEquipByPartyIndex: { 0: 1, 1: 2, 2: 3, 3: 3, 4: 3, 5: 3 },
    });

    // Open the dropdown first
    root.querySelector('[data-action="toggle-party-manage"]').dispatchEvent(new win.MouseEvent('click', { bubbles: true }));

    win.document.body
      .querySelector('[data-action="disband-party"]')
      .dispatchEvent(new win.MouseEvent('click', { bubbles: true }));

    const snapshot = controller.getSnapshot();
    assert.equal(snapshot.isFrontFilled, false);
    assert.deepEqual(snapshot.styleIds, [null, null, null, null, null, null]);
    assert.deepEqual(snapshot.supportStyleIds, [null, null, null, null, null, null]);
    assert.deepEqual(
      Object.values(snapshot.startSpEquipByPartyIndex),
      [3, 3, 3, 3, 3, 3],
    );

    // Open the dropdown again to verify disabled state of disband button
    root.querySelector('[data-action="toggle-party-manage"]').dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
    assert.equal(win.document.body.querySelector('[data-action="disband-party"]').disabled, true);
  }));

test('PartySetupController 全体初期化 button triggers reset-all callback', () =>
  withDom(({ root, pickerOverlay, win }) => {
    let resetAllCount = 0;
    const controller = new PartySetupController({
      root,
      pickerOverlay,
      store: createStoreStub(),
      onResetAll: () => {
        resetAllCount += 1;
      },
    });
    controller.mount();

    // Open the dropdown first
    root.querySelector('[data-action="toggle-party-manage"]').dispatchEvent(new win.MouseEvent('click', { bubbles: true }));

    win.document.body
      .querySelector('[data-action="reset-all-setup"]')
      .dispatchEvent(new win.MouseEvent('click', { bubbles: true }));

    assert.equal(resetAllCount, 1);
  }));

test('PartySetupController shows reorder help only while reorder mode is active', () =>
  withDom(({ root, pickerOverlay, win }) => {
    const controller = new PartySetupController({
      root,
      pickerOverlay,
      store: createStoreStub(),
    });
    controller.mount();
    controller.applySnapshot({
      styleIds: [1001, null, null, null, null, null],
      supportStyleIds: [null, null, null, null, null, null],
      limitBreakLevelsByPartyIndex: { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
      supportLimitBreakLevelsByPartyIndex: { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
      drivePierceByPartyIndex: { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
      startSpEquipByPartyIndex: { 0: 3, 1: 3, 2: 3, 3: 3, 4: 3, 5: 3 },
    });

    const toggle = root.querySelector('[data-action="toggle-reorder-mode"]');
    assert.match(toggle?.textContent ?? '', /並替 OFF/);
    assert.equal(root.querySelector('.party-setup__header-help'), null);

    toggle.dispatchEvent(new win.MouseEvent('click', { bubbles: true }));

    assert.match(root.querySelector('[data-action="toggle-reorder-mode"]')?.textContent ?? '', /並替 ON/);
    assert.match(root.querySelector('.party-setup__header-help')?.textContent ?? '', /ドラッグ \/ 2回タップで入替/);
  }));

test('PartySetupController keeps filled main icon opening Style Picker in normal mode', () =>
  withDom(({ root, pickerOverlay, win }) => {
    const controller = new PartySetupController({
      root,
      pickerOverlay,
      store: createStoreStub(),
    });
    controller.mount();
    controller.applySnapshot({
      styleIds: [1001, 1002, 1003, null, null, null],
      supportStyleIds: [null, null, null, null, null, null],
      limitBreakLevelsByPartyIndex: { 0: 4, 1: 1, 2: 0, 3: 0, 4: 0, 5: 0 },
      supportLimitBreakLevelsByPartyIndex: { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
      drivePierceByPartyIndex: { 0: 10, 1: 5, 2: 0, 3: 0, 4: 0, 5: 0 },
      startSpEquipByPartyIndex: { 0: 1, 1: 2, 2: 3, 3: 3, 4: 3, 5: 3 },
    });

    root
      .querySelector('[data-role="party-slot-main-button"][data-slot-index="0"]')
      .dispatchEvent(new win.MouseEvent('click', { bubbles: true }));

    assert.equal(pickerOverlay.classList.contains('hidden'), false);
    assert.match(
      pickerOverlay.querySelector('#picker-mode-label')?.textContent ?? '',
      /スロット1\s*メインスタイルを選ぶ/,
    );
  }));

test('PartySetupController supports tap-based slot swapping from the main icon in reorder mode', () =>
  withDom(({ root, pickerOverlay, win }) => {
    const controller = new PartySetupController({
      root,
      pickerOverlay,
      store: createStoreStub(),
    });
    controller.mount();
    controller.applySnapshot({
      styleIds: [1001, 1002, 1003, null, null, null],
      supportStyleIds: [null, null, null, null, null, null],
      limitBreakLevelsByPartyIndex: { 0: 4, 1: 1, 2: 0, 3: 0, 4: 0, 5: 0 },
      supportLimitBreakLevelsByPartyIndex: { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
      drivePierceByPartyIndex: { 0: 10, 1: 5, 2: 0, 3: 0, 4: 0, 5: 0 },
      startSpEquipByPartyIndex: { 0: 1, 1: 2, 2: 3, 3: 3, 4: 3, 5: 3 },
    });

    root
      .querySelector('[data-action="toggle-reorder-mode"]')
      .dispatchEvent(new win.MouseEvent('click', { bubbles: true }));

    let icons = root.querySelectorAll('[data-role="party-slot-main-button"]');
    icons[0].dispatchEvent(new win.MouseEvent('click', { bubbles: true }));

    icons = root.querySelectorAll('[data-role="party-slot-main-button"]');
    assert.equal(icons[0].dataset.reorderSource, 'true');

    icons[1].dispatchEvent(new win.MouseEvent('click', { bubbles: true }));

    const snapshot = controller.getSnapshot();
    assert.deepEqual(snapshot.styleIds, [1002, 1001, 1003, null, null, null]);
    assert.deepEqual(
      Object.values(snapshot.limitBreakLevelsByPartyIndex),
      [1, 4, 0, 0, 0, 0],
    );
    assert.deepEqual(
      Object.values(snapshot.drivePierceByPartyIndex),
      [5, 10, 0, 0, 0, 0],
    );

    icons = root.querySelectorAll('[data-role="party-slot-main-button"]');
    assert.equal(icons[0].dataset.reorderSource, 'false');
    assert.equal(icons[1].dataset.reorderSource, 'false');
    assert.match(root.querySelector('[data-action="toggle-reorder-mode"]')?.textContent ?? '', /並替 ON/);
  }));

test('PartySetupController keeps empty main icon as swap destination only in reorder mode', () =>
  withDom(({ root, pickerOverlay, win }) => {
    const controller = new PartySetupController({
      root,
      pickerOverlay,
      store: createStoreStub(),
    });
    controller.mount();
    controller.applySnapshot({
      styleIds: [1001, 1002, 1003, 1002, null, null],
      supportStyleIds: [null, null, null, null, null, null],
      limitBreakLevelsByPartyIndex: { 0: 4, 1: 1, 2: 0, 3: 2, 4: 0, 5: 0 },
      supportLimitBreakLevelsByPartyIndex: { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
      drivePierceByPartyIndex: { 0: 10, 1: 5, 2: 0, 3: 15, 4: 0, 5: 0 },
      startSpEquipByPartyIndex: { 0: 1, 1: 2, 2: 3, 3: 1, 4: 3, 5: 3 },
    });

    root
      .querySelector('[data-action="toggle-reorder-mode"]')
      .dispatchEvent(new win.MouseEvent('click', { bubbles: true }));

    const emptyIcon = root.querySelector('[data-role="party-slot-main-button"][data-slot-index="4"]');
    emptyIcon.dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
    assert.equal(root.querySelector('[data-role="party-slot-main-button"][data-slot-index="4"]')?.dataset.reorderSource, 'false');

    root
      .querySelector('[data-role="party-slot-main-button"][data-slot-index="0"]')
      .dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
    root
      .querySelector('[data-role="party-slot-main-button"][data-slot-index="4"]')
      .dispatchEvent(new win.MouseEvent('click', { bubbles: true }));

    const snapshot = controller.getSnapshot();
    assert.deepEqual(snapshot.styleIds, [null, 1002, 1003, 1002, 1001, null]);
    assert.deepEqual(
      Object.values(snapshot.limitBreakLevelsByPartyIndex),
      [0, 1, 0, 2, 4, 0],
    );
    assert.deepEqual(
      Object.values(snapshot.drivePierceByPartyIndex),
      [0, 5, 0, 15, 10, 0],
    );
  }));

test('PartySetupController supports tap-based swapping between front and back rows in reorder mode', () =>
  withDom(({ root, pickerOverlay, win }) => {
    const controller = new PartySetupController({
      root,
      pickerOverlay,
      store: createStoreStub(),
    });
    controller.mount();
    controller.applySnapshot({
      styleIds: [1001, 1002, 1003, 1002, null, null],
      supportStyleIds: [null, null, null, null, null, null],
      limitBreakLevelsByPartyIndex: { 0: 4, 1: 1, 2: 0, 3: 2, 4: 0, 5: 0 },
      supportLimitBreakLevelsByPartyIndex: { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
      drivePierceByPartyIndex: { 0: 10, 1: 5, 2: 0, 3: 15, 4: 0, 5: 0 },
      startSpEquipByPartyIndex: { 0: 1, 1: 2, 2: 3, 3: 1, 4: 3, 5: 3 },
    });

    root
      .querySelector('[data-action="toggle-reorder-mode"]')
      .dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
    root
      .querySelector('[data-role="party-slot-main-button"][data-slot-index="0"]')
      .dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
    root
      .querySelector('[data-role="party-slot-main-button"][data-slot-index="3"]')
      .dispatchEvent(new win.MouseEvent('click', { bubbles: true }));

    const snapshot = controller.getSnapshot();
    assert.deepEqual(snapshot.styleIds, [1002, 1002, 1003, 1001, null, null]);
    assert.deepEqual(
      Object.values(snapshot.limitBreakLevelsByPartyIndex),
      [2, 1, 0, 4, 0, 0],
    );
    assert.deepEqual(
      Object.values(snapshot.drivePierceByPartyIndex),
      [15, 5, 0, 10, 0, 0],
    );
  }));

test('PartySetupController keeps desktop drag-and-drop swapping on the filled main icon in reorder mode', () =>
  withDom(({ root, pickerOverlay, win }) => {
    const controller = new PartySetupController({
      root,
      pickerOverlay,
      store: createStoreStub(),
    });
    controller.mount();
    controller.applySnapshot({
      styleIds: [1001, 1002, 1003, null, null, null],
      supportStyleIds: [null, null, null, null, null, null],
      limitBreakLevelsByPartyIndex: { 0: 4, 1: 1, 2: 0, 3: 0, 4: 0, 5: 0 },
      supportLimitBreakLevelsByPartyIndex: { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
      drivePierceByPartyIndex: { 0: 10, 1: 5, 2: 0, 3: 0, 4: 0, 5: 0 },
      startSpEquipByPartyIndex: { 0: 1, 1: 2, 2: 3, 3: 3, 4: 3, 5: 3 },
    });
    root
      .querySelector('[data-action="toggle-reorder-mode"]')
      .dispatchEvent(new win.MouseEvent('click', { bubbles: true }));

    const dataTransferCalls = [];
    const dataTransfer = {
      effectAllowed: '',
      dropEffect: '',
      setData(...args) {
        dataTransferCalls.push(args);
      },
    };
    const handles = root.querySelectorAll('[data-role="party-slot-main-button"]');
    const slots = root.querySelectorAll('[data-slot]');

    const dragStartEvent = new win.Event('dragstart', { bubbles: true, cancelable: true });
    Object.defineProperty(dragStartEvent, 'dataTransfer', { value: dataTransfer });
    handles[0].dispatchEvent(dragStartEvent);

    const dragOverEvent = new win.Event('dragover', { bubbles: true, cancelable: true });
    Object.defineProperty(dragOverEvent, 'dataTransfer', { value: dataTransfer });
    slots[1].dispatchEvent(dragOverEvent);

    const dropEvent = new win.Event('drop', { bubbles: true, cancelable: true });
    Object.defineProperty(dropEvent, 'dataTransfer', { value: dataTransfer });
    slots[1].dispatchEvent(dropEvent);

    assert.deepEqual(dataTransferCalls, [['text/plain', '']]);
    assert.equal(dragOverEvent.defaultPrevented, true);
    const snapshot = controller.getSnapshot();
    assert.deepEqual(snapshot.styleIds, [1002, 1001, 1003, null, null, null]);
    assert.deepEqual(
      Object.values(snapshot.limitBreakLevelsByPartyIndex),
      [1, 4, 0, 0, 0, 0],
    );
  }));

test('PartySetupController keeps desktop drag-and-drop swapping between front and back rows in reorder mode', () =>
  withDom(({ root, pickerOverlay, win }) => {
    const controller = new PartySetupController({
      root,
      pickerOverlay,
      store: createStoreStub(),
    });
    controller.mount();
    controller.applySnapshot({
      styleIds: [1001, 1002, 1003, 1002, null, null],
      supportStyleIds: [null, null, null, null, null, null],
      limitBreakLevelsByPartyIndex: { 0: 4, 1: 1, 2: 0, 3: 2, 4: 0, 5: 0 },
      supportLimitBreakLevelsByPartyIndex: { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
      drivePierceByPartyIndex: { 0: 10, 1: 5, 2: 0, 3: 15, 4: 0, 5: 0 },
      startSpEquipByPartyIndex: { 0: 1, 1: 2, 2: 3, 3: 1, 4: 3, 5: 3 },
    });
    root
      .querySelector('[data-action="toggle-reorder-mode"]')
      .dispatchEvent(new win.MouseEvent('click', { bubbles: true }));

    const dataTransferCalls = [];
    const dataTransfer = {
      effectAllowed: '',
      dropEffect: '',
      setData(...args) {
        dataTransferCalls.push(args);
      },
    };
    const handles = root.querySelectorAll('[data-role="party-slot-main-button"]');
    const slots = root.querySelectorAll('[data-slot]');

    const dragStartEvent = new win.Event('dragstart', { bubbles: true, cancelable: true });
    Object.defineProperty(dragStartEvent, 'dataTransfer', { value: dataTransfer });
    handles[0].dispatchEvent(dragStartEvent);

    const dragOverEvent = new win.Event('dragover', { bubbles: true, cancelable: true });
    Object.defineProperty(dragOverEvent, 'dataTransfer', { value: dataTransfer });
    slots[3].dispatchEvent(dragOverEvent);

    const dropEvent = new win.Event('drop', { bubbles: true, cancelable: true });
    Object.defineProperty(dropEvent, 'dataTransfer', { value: dataTransfer });
    slots[3].dispatchEvent(dropEvent);

    assert.deepEqual(dataTransferCalls, [['text/plain', '']]);
    assert.equal(dragOverEvent.defaultPrevented, true);
    const snapshot = controller.getSnapshot();
    assert.deepEqual(snapshot.styleIds, [1002, 1002, 1003, 1001, null, null]);
    assert.deepEqual(
      Object.values(snapshot.limitBreakLevelsByPartyIndex),
      [2, 1, 0, 4, 0, 0],
    );
    assert.deepEqual(
      Object.values(snapshot.drivePierceByPartyIndex),
      [15, 5, 0, 10, 0, 0],
    );
  }));

test('PartySetupController marks dragover destination on the slot root overlay in reorder mode', () =>
  withDom(({ root, pickerOverlay, win }) => {
    const controller = new PartySetupController({
      root,
      pickerOverlay,
      store: createStoreStub(),
    });
    controller.mount();
    controller.applySnapshot({
      styleIds: [1001, 1002, 1003, null, null, null],
      supportStyleIds: [null, null, null, null, null, null],
      limitBreakLevelsByPartyIndex: { 0: 4, 1: 1, 2: 0, 3: 0, 4: 0, 5: 0 },
      supportLimitBreakLevelsByPartyIndex: { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
      drivePierceByPartyIndex: { 0: 10, 1: 5, 2: 0, 3: 0, 4: 0, 5: 0 },
      startSpEquipByPartyIndex: { 0: 1, 1: 2, 2: 3, 3: 3, 4: 3, 5: 3 },
    });
    root
      .querySelector('[data-action="toggle-reorder-mode"]')
      .dispatchEvent(new win.MouseEvent('click', { bubbles: true }));

    const dataTransfer = {
      effectAllowed: '',
      dropEffect: '',
      setData() {},
    };
    const icons = root.querySelectorAll('[data-role="party-slot-main-button"]');
    const slots = root.querySelectorAll('[data-slot]');

    const dragStartEvent = new win.Event('dragstart', { bubbles: true, cancelable: true });
    Object.defineProperty(dragStartEvent, 'dataTransfer', { value: dataTransfer });
    icons[0].dispatchEvent(dragStartEvent);

    const dragOverEvent = new win.Event('dragover', { bubbles: true, cancelable: true });
    Object.defineProperty(dragOverEvent, 'dataTransfer', { value: dataTransfer });
    slots[1].dispatchEvent(dragOverEvent);

    assert.equal(slots[1].dataset.dragOver, 'true');
    assert.equal(dragOverEvent.defaultPrevented, true);
  }));

test('PartySetupController keeps support picker available while reorder mode is on', () =>
  withDom(({ root, pickerOverlay, win }) => {
    const controller = new PartySetupController({
      root,
      pickerOverlay,
      store: createStoreStub(),
    });
    controller.mount();
    controller.applySnapshot({
      styleIds: [1001, 1002, 1003, null, null, null],
      supportStyleIds: [null, null, null, null, null, null],
      limitBreakLevelsByPartyIndex: { 0: 4, 1: 1, 2: 0, 3: 0, 4: 0, 5: 0 },
      supportLimitBreakLevelsByPartyIndex: { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
      drivePierceByPartyIndex: { 0: 10, 1: 5, 2: 0, 3: 0, 4: 0, 5: 0 },
      startSpEquipByPartyIndex: { 0: 1, 1: 2, 2: 3, 3: 3, 4: 3, 5: 3 },
    });

    root
      .querySelector('[data-action="toggle-reorder-mode"]')
      .dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
    root
      .querySelector('[data-role="party-slot-main-button"][data-slot-index="0"]')
      .dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
    assert.equal(root.querySelector('[data-role="party-slot-main-button"][data-slot-index="0"]')?.dataset.reorderSource, 'true');

    root
      .querySelector('[data-action="open-picker"][data-slot-index="0"][data-mode="support"]')
      .dispatchEvent(new win.MouseEvent('click', { bubbles: true }));

    assert.equal(root.querySelector('[data-role="party-slot-main-button"][data-slot-index="0"]')?.dataset.reorderSource, 'false');
    assert.match(root.querySelector('[data-action="toggle-reorder-mode"]')?.textContent ?? '', /並替 ON/);
    assert.equal(pickerOverlay.classList.contains('hidden'), false);
  }));

test('PartySetupController clears selected reorder source on select and skill settings actions while keeping reorder mode on', () =>
  withDom(({ root, pickerOverlay, win }) => {
    const controller = new PartySetupController({
      root,
      pickerOverlay,
      store: createStoreStub(),
    });
    controller.mount();
    controller.applySnapshot({
      styleIds: [1001, 1002, 1003, null, null, null],
      supportStyleIds: [null, null, null, null, null, null],
      limitBreakLevelsByPartyIndex: { 0: 4, 1: 1, 2: 0, 3: 0, 4: 0, 5: 0 },
      supportLimitBreakLevelsByPartyIndex: { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
      drivePierceByPartyIndex: { 0: 10, 1: 5, 2: 0, 3: 0, 4: 0, 5: 0 },
      startSpEquipByPartyIndex: { 0: 1, 1: 2, 2: 3, 3: 3, 4: 3, 5: 3 },
    });

    root
      .querySelector('[data-action="toggle-reorder-mode"]')
      .dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
    root
      .querySelector('[data-role="party-slot-main-button"][data-slot-index="0"]')
      .dispatchEvent(new win.MouseEvent('click', { bubbles: true }));

    const lbSelect = root.querySelector('select[data-field="lb"][data-slot-index="0"]');
    lbSelect.value = '3';
    lbSelect.dispatchEvent(new win.Event('change', { bubbles: true }));

    assert.equal(root.querySelector('[data-role="party-slot-main-button"][data-slot-index="0"]')?.dataset.reorderSource, 'false');
    assert.match(root.querySelector('[data-action="toggle-reorder-mode"]')?.textContent ?? '', /並替 ON/);
    assert.equal(controller.getSnapshot().limitBreakLevelsByPartyIndex['0'], 3);

    root
      .querySelector('[data-role="party-slot-main-button"][data-slot-index="1"]')
      .dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
    root
      .querySelector('[data-action="open-skill-settings"][data-slot-index="1"]')
      .dispatchEvent(new win.MouseEvent('click', { bubbles: true }));

    assert.equal(root.querySelector('[data-role="party-slot-main-button"][data-slot-index="1"]')?.dataset.reorderSource, 'false');
    assert.match(root.querySelector('[data-action="toggle-reorder-mode"]')?.textContent ?? '', /並替 ON/);
    assert.ok(win.document.querySelector('[data-role="skill-settings-list"][data-slot="1"]'));
  }));

test('PartySetupController opens Style Picker with continuous selection enabled by default', () =>
  withDom(({ root, pickerOverlay, win }) => {
    const controller = new PartySetupController({
      root,
      pickerOverlay,
      store: createStoreStub(),
    });
    controller.mount();

    root
      .querySelector('[data-action="open-picker"][data-slot-index="0"][data-mode="main"]')
      .dispatchEvent(new win.MouseEvent('click', { bubbles: true }));

    const continuousToggle = pickerOverlay.querySelector('#picker-continuous-toggle');
    assert.ok(continuousToggle);
    assert.match(continuousToggle.className, /\bbg-green-50\b/);
    assert.match(continuousToggle.className, /\bborder-green-400\b/);

    pickerOverlay
      .querySelector('[data-style-id="1001"]')
      .dispatchEvent(new win.MouseEvent('click', { bubbles: true }));

    assert.equal(pickerOverlay.classList.contains('hidden'), false);
    assert.match(
      pickerOverlay.querySelector('#picker-mode-label')?.textContent ?? '',
      /スロット2\s*メインスタイルを選ぶ/,
    );
  }));

test('PartySetupController PT解散 button clears current party selection from picker header', () =>
  withDom(({ root, pickerOverlay, win }) => {
    const controller = new PartySetupController({
      root,
      pickerOverlay,
      store: createStoreStub(),
    });
    controller.mount();
    controller.applySnapshot({
      styleIds: [1001, 1002, 1003, null, null, null],
      supportStyleIds: [null, null, null, null, null, null],
      limitBreakLevelsByPartyIndex: { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
      supportLimitBreakLevelsByPartyIndex: { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
      drivePierceByPartyIndex: { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
      startSpEquipByPartyIndex: { 0: 3, 1: 3, 2: 3, 3: 3, 4: 3, 5: 3 },
    });

    root
      .querySelector('[data-action="open-picker"][data-slot-index="0"][data-mode="main"]')
      .dispatchEvent(new win.MouseEvent('click', { bubbles: true }));

    const disbandButton = pickerOverlay.querySelector('#picker-disband-party');
    assert.equal(disbandButton?.disabled, false);

    disbandButton.dispatchEvent(new win.MouseEvent('click', { bubbles: true }));

    const snapshot = controller.getSnapshot();
    assert.deepEqual(snapshot.styleIds, [null, null, null, null, null, null]);
    assert.equal(pickerOverlay.classList.contains('hidden'), true);
  }));

test('PartySetupController confirms before overwriting an existing preset', () =>
  withDom(({ root, pickerOverlay, win }) => {
    const controller = new PartySetupController({
      root,
      pickerOverlay,
      store: createStoreStub(),
    });
    controller.mount();

    controller.applySnapshot({
      styleIds: [1001, 1002, 1003, null, null, null],
      supportStyleIds: [null, null, null, null, null, null],
      limitBreakLevelsByPartyIndex: { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
      supportLimitBreakLevelsByPartyIndex: { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
      drivePierceByPartyIndex: { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
      startSpEquipByPartyIndex: { 0: 3, 1: 3, 2: 3, 3: 3, 4: 3, 5: 3 },
    });
    controller.savePreset(0, { name: '初期PT' });

    const before = win.localStorage.getItem('hbr.ui_next.party_presets.v1');
    assert.ok(before);

    controller.applySnapshot({
      styleIds: [null, null, null, null, null, null],
      supportStyleIds: [null, null, null, null, null, null],
      limitBreakLevelsByPartyIndex: { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
      supportLimitBreakLevelsByPartyIndex: { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
      drivePierceByPartyIndex: { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
      startSpEquipByPartyIndex: { 0: 3, 1: 3, 2: 3, 3: 3, 4: 3, 5: 3 },
    });

    let confirmCalls = 0;
    win.confirm = () => {
      confirmCalls += 1;
      return false;
    };

    controller.savePreset(0, { name: '別名' });

    assert.equal(confirmCalls, 1);
    assert.equal(win.localStorage.getItem('hbr.ui_next.party_presets.v1'), before);
  }));

test('PartySetupController normalizes current preset storage length into 20 toolbar presets', () =>
  withDom(({ root, pickerOverlay, win }) => {
    win.localStorage.setItem(
      'hbr.ui_next.party_presets.v1',
      JSON.stringify([
        {
          label: '現行プリセットA',
          savedAt: '2026-03-28T00:00:00.000Z',
          slots: [
            { styleId: 1001, supportStyleId: null, equippedSkillIds: [46000001, 46400001, 46500001, 46300001] },
            { styleId: 1002, supportStyleId: null, equippedSkillIds: [46000011, 46400011] },
            { styleId: 1003, supportStyleId: null, equippedSkillIds: [46000021] },
            { styleId: null, supportStyleId: null, equippedSkillIds: [] },
            { styleId: null, supportStyleId: null, equippedSkillIds: [] },
            { styleId: null, supportStyleId: null, equippedSkillIds: [] },
          ],
        },
        {
          label: '現行プリセットB',
          savedAt: '2026-03-28T00:00:01.000Z',
          slots: [
            { styleId: 1002, supportStyleId: null, equippedSkillIds: [46000011, 46400011] },
            { styleId: 1003, supportStyleId: null, equippedSkillIds: [46000021] },
            { styleId: null, supportStyleId: null, equippedSkillIds: [] },
            { styleId: null, supportStyleId: null, equippedSkillIds: [] },
            { styleId: null, supportStyleId: null, equippedSkillIds: [] },
            { styleId: null, supportStyleId: null, equippedSkillIds: [] },
          ],
        },
        null,
      ]),
    );

    const controller = new PartySetupController({
      root,
      pickerOverlay,
      store: createStoreStub(),
    });
    controller.mount();

    const previews = controller.getPresetPreviews();
    const stored = JSON.parse(win.localStorage.getItem('hbr.ui_next.party_presets.v1'));
    assert.equal(previews.length, 20);
    assert.equal(previews[0].label, '現行プリセットA');
    assert.equal(previews[1].label, '現行プリセットB');
    assert.equal(previews[2], null);
    assert.equal(previews[19], null);
    assert.equal(stored.length, 20);
    assert.equal(stored[19], null);
  }));

test('PartySetupController discards incompatible legacy preset entries without equippedSkillIds', () =>
  withDom(({ root, pickerOverlay, win }) => {
    win.localStorage.setItem(
      'hbr.ui_next.party_presets.v1',
      JSON.stringify([
        {
          label: '旧プリセット',
          savedAt: '2026-03-28T00:00:00.000Z',
          slots: [
            { styleId: 1001, supportStyleId: null },
            { styleId: 1002, supportStyleId: null },
            { styleId: 1003, supportStyleId: null },
          ],
        },
      ]),
    );

    const controller = new PartySetupController({
      root,
      pickerOverlay,
      store: createStoreStub(),
    });
    controller.mount();

    assert.equal(controller.getPresetPreviews()[0], null);
    assert.equal(controller.loadPreset(0), false);
    const stored = JSON.parse(win.localStorage.getItem('hbr.ui_next.party_presets.v1'));
    assert.equal(stored.length, 20);
    assert.equal(stored[0], null);
    assert.equal(stored[19], null);
  }));

test('PartySetupController saves optional preset names and allows later rename/clear', () =>
  withDom(({ root, pickerOverlay, win }) => {
    const controller = new PartySetupController({
      root,
      pickerOverlay,
      store: createStoreStub(),
    });
    controller.mount();
    controller.applySnapshot({
      styleIds: [1001, 1002, 1003, null, null, null],
      supportStyleIds: [null, null, null, null, null, null],
      limitBreakLevelsByPartyIndex: { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
      supportLimitBreakLevelsByPartyIndex: { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
      drivePierceByPartyIndex: { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
      startSpEquipByPartyIndex: { 0: 3, 1: 3, 2: 3, 3: 3, 4: 3, 5: 3 },
    });

    assert.equal(controller.savePreset(0, { name: '31A前衛' }), true);
    let stored = JSON.parse(win.localStorage.getItem('hbr.ui_next.party_presets.v1'));
    assert.equal(stored[0].name, '31A前衛');
    assert.equal(stored[0].label, '茅森 月歌・和泉 ユキ・逢川 めぐみ');

    assert.equal(controller.savePreset(1, { name: '   ' }), true);
    stored = JSON.parse(win.localStorage.getItem('hbr.ui_next.party_presets.v1'));
    assert.equal('name' in stored[1], false);

    assert.equal(controller.renamePreset(0, { name: '雷弱点PT' }), true);
    stored = JSON.parse(win.localStorage.getItem('hbr.ui_next.party_presets.v1'));
    assert.equal(stored[0].name, '雷弱点PT');

    assert.equal(controller.renamePreset(0, { name: '   ' }), true);
    stored = JSON.parse(win.localStorage.getItem('hbr.ui_next.party_presets.v1'));
    assert.equal('name' in stored[0], false);

    win.confirm = () => true;
    assert.equal(controller.clearPreset(0), true);
    stored = JSON.parse(win.localStorage.getItem('hbr.ui_next.party_presets.v1'));
    assert.equal(stored[0], null);
  }));

test('PartySetupController renders skill settings panel with required and tagged entries', () =>
  withDom(({ root, pickerOverlay, win }) => {
    const controller = new PartySetupController({
      root,
      pickerOverlay,
      store: createStoreStub(),
    });
    controller.mount();

    controller.applySnapshot({
      styleIds: [1001, 1002, 1003, null, null, null],
      supportStyleIds: [null, null, null, null, null, null],
      limitBreakLevelsByPartyIndex: { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
      supportLimitBreakLevelsByPartyIndex: { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
      drivePierceByPartyIndex: { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
      startSpEquipByPartyIndex: { 0: 3, 1: 3, 2: 3, 3: 3, 4: 3, 5: 3 },
    });

    assert.equal(root.querySelector('[data-role="skill-checklist"][data-slot="0"]'), null);

    const button = root.querySelector('[data-action="open-skill-settings"][data-slot-index="0"]');
    assert.match(button?.textContent ?? '', /スキル設定/);
    button.dispatchEvent(new win.MouseEvent('click', { bubbles: true }));

    const panel = win.document.querySelector('[data-role="skill-settings-list"][data-slot="0"]');
    assert.ok(panel, 'slot 0 should render skill settings panel');

    const requiredInput = panel.querySelector('input[value="46000001"]');
    assert.equal(requiredInput?.checked, true);
    assert.equal(requiredInput?.disabled, true);

    const passiveRow = panel.textContent;
    assert.match(passiveRow, /ルビー・パフューム/);
    assert.match(passiveRow, /パッシブ/);
    assert.match(passiveRow, /マスター/);
    assert.match(passiveRow, /オーブ/);

    assert.deepEqual(
      controller.getSnapshot().skillSetsByPartyIndex['0'],
      [46000001, 46400001, 46500001, 46300001]
    );
  }));

test('PartySetupController restores skillSetsByPartyIndex from snapshot and preset', () =>
  withDom(({ root, pickerOverlay, win }) => {
    const controller = new PartySetupController({
      root,
      pickerOverlay,
      store: createStoreStub(),
    });
    controller.mount();

    controller.applySnapshot({
      styleIds: [1001, 1002, 1003, null, null, null],
      supportStyleIds: [null, null, null, null, null, null],
      limitBreakLevelsByPartyIndex: { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
      supportLimitBreakLevelsByPartyIndex: { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
      drivePierceByPartyIndex: { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
      startSpEquipByPartyIndex: { 0: 3, 1: 3, 2: 3, 3: 3, 4: 3, 5: 3 },
      skillSetsByPartyIndex: {
        0: [46000001, 46500001],
      },
    });

    root
      .querySelector('[data-action="open-skill-settings"][data-slot-index="0"]')
      .dispatchEvent(new win.MouseEvent('click', { bubbles: true }));

    const passiveCheckbox = win.document.querySelector(
      'input[data-field="skill-setting"][data-slot-index="0"][value="46400001"]'
    );
    const masterCheckbox = win.document.querySelector(
      'input[data-field="skill-setting"][data-slot-index="0"][value="46500001"]'
    );
    assert.equal(passiveCheckbox?.checked, false);
    assert.equal(masterCheckbox?.checked, true);
    assert.deepEqual(controller.getSnapshot().skillSetsByPartyIndex['0'], [46000001, 46500001]);
    controller.savePreset(0, { name: '保存用PT' });

    controller.applySnapshot({
      styleIds: [1001, 1002, 1003, null, null, null],
      supportStyleIds: [null, null, null, null, null, null],
      limitBreakLevelsByPartyIndex: { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
      supportLimitBreakLevelsByPartyIndex: { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
      drivePierceByPartyIndex: { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
      startSpEquipByPartyIndex: { 0: 3, 1: 3, 2: 3, 3: 3, 4: 3, 5: 3 },
    });
    controller.loadPreset(0);

    assert.deepEqual(controller.getSnapshot().skillSetsByPartyIndex['0'], [46000001, 46500001]);
  }));

test('PartySetupController reports skill set delta meta from skill settings panel', () =>
  withDom(({ root, pickerOverlay, win }) => {
    const changes = [];
    const controller = new PartySetupController({
      root,
      pickerOverlay,
      store: createStoreStub(),
      onChange: (snapshot, meta) => {
        changes.push({ snapshot, meta });
      },
    });
    controller.mount();

    controller.applySnapshot({
      styleIds: [1001, 1002, 1003, null, null, null],
      supportStyleIds: [null, null, null, null, null, null],
      limitBreakLevelsByPartyIndex: { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
      supportLimitBreakLevelsByPartyIndex: { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
      drivePierceByPartyIndex: { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
      startSpEquipByPartyIndex: { 0: 3, 1: 3, 2: 3, 3: 3, 4: 3, 5: 3 },
    });

    root
      .querySelector('[data-action="open-skill-settings"][data-slot-index="0"]')
      .dispatchEvent(new win.MouseEvent('click', { bubbles: true }));

    const masterCheckbox = win.document.querySelector(
      'input[data-field="skill-setting"][data-slot-index="0"][value="46500001"]'
    );
    masterCheckbox.checked = false;
    masterCheckbox.dispatchEvent(new win.Event('change', { bubbles: true }));

    const lastChange = changes.at(-1);
    assert.deepEqual(lastChange.meta, {
      slotIndex: 0,
      addedSkillIds: [],
      removedSkillIds: [46500001],
      hasSkillSetDelta: true,
    });
    assert.deepEqual(lastChange.snapshot.skillSetsByPartyIndex['0'], [46000001, 46400001, 46300001]);
  }));

test('PartySetupController disables removing checked skills while records exist', () =>
  withDom(({ root, pickerOverlay, win }) => {
    const controller = new PartySetupController({
      root,
      pickerOverlay,
      store: createStoreStub(),
    });
    controller.mount();

    controller.applySnapshot({
      styleIds: [1001, 1002, 1003, null, null, null],
      supportStyleIds: [null, null, null, null, null, null],
      limitBreakLevelsByPartyIndex: { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
      supportLimitBreakLevelsByPartyIndex: { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
      drivePierceByPartyIndex: { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
      startSpEquipByPartyIndex: { 0: 3, 1: 3, 2: 3, 3: 3, 4: 3, 5: 3 },
      skillSetsByPartyIndex: {
        0: [46000001, 46500001],
      },
    });
    controller.setBattleState({ hasActiveBattle: true, hasRecords: true });

    root
      .querySelector('[data-action="open-skill-settings"][data-slot-index="0"]')
      .dispatchEvent(new win.MouseEvent('click', { bubbles: true }));

    const requiredCheckbox = win.document.querySelector(
      'input[data-field="skill-setting"][data-slot-index="0"][value="46000001"]'
    );
    const checkedOptionalCheckbox = win.document.querySelector(
      'input[data-field="skill-setting"][data-slot-index="0"][value="46500001"]'
    );
    const uncheckedOptionalCheckbox = win.document.querySelector(
      'input[data-field="skill-setting"][data-slot-index="0"][value="46400001"]'
    );

    assert.equal(requiredCheckbox?.disabled, true);
    assert.equal(checkedOptionalCheckbox?.checked, true);
    assert.equal(checkedOptionalCheckbox?.disabled, true);
    assert.equal(uncheckedOptionalCheckbox?.checked, false);
    assert.equal(uncheckedOptionalCheckbox?.disabled, false);
    assert.match(win.document.body.textContent ?? '', /記録中はスキル解除できません/);
  }));

test('PartySetupController handles party manage dropdown toggle and actions', () =>
  withDom(({ root, pickerOverlay, win }) => {
    let resetCalled = false;
    const controller = new PartySetupController({
      root,
      pickerOverlay,
      store: createStoreStub(),
      onResetAll: () => {
        resetCalled = true;
      },
    });
    controller.mount();

    // Verify initial state: dropdown is closed (no open class)
    assert.equal(win.document.body.querySelector('[data-role="party-manage-menu"]').classList.contains('is-open'), false);

    // Toggle dropdown
    const trigger = root.querySelector('[data-action="toggle-party-manage"]');
    trigger.dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
    assert.equal(win.document.body.querySelector('[data-role="party-manage-menu"]').classList.contains('is-open'), true);

    // Click reset-all-setup in dropdown
    win.document.body.querySelector('[data-action="reset-all-setup"]').dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
    assert.equal(resetCalled, true);
    assert.equal(win.document.body.querySelector('[data-role="party-manage-menu"]').classList.contains('is-open'), false);
  }));

test('PartySetupController supports multi-slot selection, escape key deselect, and bulk settings sync', () =>
  withDom(({ root, pickerOverlay, win }) => {
    const controller = new PartySetupController({
      root,
      pickerOverlay,
      store: createStoreStub(),
    });
    controller.mount();

    // Populate styles to make limit break available
    controller.applySnapshot({
      styleIds: [1001, 1002, 1003, null, null, null],
      supportStyleIds: [null, null, null, null, null, null],
      limitBreakLevelsByPartyIndex: { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
      supportLimitBreakLevelsByPartyIndex: { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
      drivePierceByPartyIndex: { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
      startSpEquipByPartyIndex: { 0: 3, 1: 3, 2: 3, 3: 3, 4: 3, 5: 3 },
    });

    // Click slot 0 number button to select it
    root.querySelectorAll('[data-action="toggle-slot-selection"]')[0].dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
    assert.equal(root.querySelector('[data-slot="0"]').classList.contains('is-selected'), true);
    assert.equal(root.querySelectorAll('[data-action="toggle-slot-selection"]')[0].textContent.trim(), '✓');

    // Click slot 1 number button to select it too
    root.querySelectorAll('[data-action="toggle-slot-selection"]')[1].dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
    assert.equal(root.querySelector('[data-slot="1"]').classList.contains('is-selected'), true);

    // Verify header switched to show selected count and clear selections button
    const clearBtn = root.querySelector('[data-action="clear-selections"]');
    assert.ok(clearBtn);
    assert.match(root.innerHTML, /2枠 選択中/);

    // Change limit break of slot 0 to 4
    const lbSelect0 = root.querySelector('select[data-field="lb"][data-slot-index="0"]');
    lbSelect0.value = '4';
    lbSelect0.dispatchEvent(new win.Event('change', { bubbles: true }));

    // Verify slot 1's limit break also changed to 4
    assert.equal(controller.getSnapshot().limitBreakLevelsByPartyIndex[1], 4);

    // Press Escape to clear selections
    win.document.body.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    assert.equal(root.querySelector('[data-slot="0"]').classList.contains('is-selected'), false);
    assert.equal(root.querySelector('[data-slot="1"]').classList.contains('is-selected'), false);
  }));

test('PartySetupController clears selection when clicking clear button or outside slots', () =>
  withDom(({ root, pickerOverlay, win }) => {
    const controller = new PartySetupController({
      root,
      pickerOverlay,
      store: createStoreStub(),
    });
    controller.mount();

    // Select slot 0
    root.querySelectorAll('[data-action="toggle-slot-selection"]')[0].dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
    assert.equal(root.querySelector('[data-slot="0"]').classList.contains('is-selected'), true);

    // Click "選択を解除" button
    const clearBtn = root.querySelector('[data-action="clear-selections"]');
    clearBtn.dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
    assert.equal(root.querySelector('[data-slot="0"]').classList.contains('is-selected'), false);

    // Select slot 0 again
    root.querySelectorAll('[data-action="toggle-slot-selection"]')[0].dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
    assert.equal(root.querySelector('[data-slot="0"]').classList.contains('is-selected'), true);

    // Click outside of character cards (e.g. background body)
    win.document.body.dispatchEvent(new win.MouseEvent('mousedown', { bubbles: true }));
    assert.equal(root.querySelector('[data-slot="0"]').classList.contains('is-selected'), false);
  }));
