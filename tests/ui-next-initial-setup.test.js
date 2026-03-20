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
  return {
    styles: [],
    getStyleById() {
      return null;
    },
    listSkillsByStyleId() {
      return [];
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

    root.querySelector('[data-role="enemy-target-simplify-toggle"]').checked = false;
    root.querySelector('[data-role="ally-target-simplify-toggle"]').checked = true;
    setupSnapshot = controller.getSetupSnapshot(partySnapshot);

    assert.equal(
      setupSnapshot.simulatorSettings.targetSelection.enemyMode,
      TARGET_SELECTION_MODES.MANUAL,
    );
    assert.equal(
      setupSnapshot.simulatorSettings.targetSelection.allyMode,
      TARGET_SELECTION_MODES.SIMPLE,
    );
  }));

test('InitialSetupController exposes session save/load controls in Simulator Settings', () =>
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

    assert.ok(root.querySelector('[data-role="session-save-btn"]'));
    assert.ok(root.querySelector('[data-role="session-load-btn"]'));
    assert.ok(root.querySelector('[data-role="session-load-input"]'));
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
      },
    });

    assert.equal(root.querySelector('[data-role="enemy-target-simplify-toggle"]').checked, false);
    assert.equal(root.querySelector('[data-role="ally-target-simplify-toggle"]').checked, true);
  }));
