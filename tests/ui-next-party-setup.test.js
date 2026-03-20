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
    passives: [],
    skills: [],
  };
}

function createStoreStub() {
  const styles = [
    createStyle(1001, '茅森 月歌'),
    createStyle(1002, '和泉 ユキ'),
    createStyle(1003, '逢川 めぐみ'),
  ];
  const styleById = new Map(styles.map((style) => [style.id, style]));
  return {
    styles,
    getStyleById(styleId) {
      return styleById.get(Number(styleId)) ?? null;
    },
    listSkillsByStyleId() {
      return [];
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

test('PartySetupController confirms before overwriting an existing preset', () =>
  withDom(({ root, pickerOverlay, win }) => {
    const controller = new PartySetupController({
      root,
      pickerOverlay,
      store: createStoreStub(),
    });
    controller.mount();

    root
      .querySelector('[data-action="toggle-preset"]')
      .dispatchEvent(new win.MouseEvent('click', { bubbles: true }));

    controller.applySnapshot({
      styleIds: [1001, 1002, 1003, null, null, null],
      supportStyleIds: [null, null, null, null, null, null],
      limitBreakLevelsByPartyIndex: { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
      supportLimitBreakLevelsByPartyIndex: { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
      drivePierceByPartyIndex: { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
      startSpEquipByPartyIndex: { 0: 3, 1: 3, 2: 3, 3: 3, 4: 3, 5: 3 },
    });
    root
      .querySelector('[data-action="save-preset"][data-preset-index="0"]')
      .dispatchEvent(new win.MouseEvent('click', { bubbles: true }));

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

    root
      .querySelector('[data-action="save-preset"][data-preset-index="0"]')
      .dispatchEvent(new win.MouseEvent('click', { bubbles: true }));

    assert.equal(confirmCalls, 1);
    assert.equal(win.localStorage.getItem('hbr.ui_next.party_presets.v1'), before);
  }));
