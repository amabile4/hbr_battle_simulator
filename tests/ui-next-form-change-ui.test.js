import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

import { createBattleStateFromParty } from '../src/index.js';
import { TurnAreaController } from '../ui-next/components/turn-area.js';
import { TurnEngineManager } from '../ui-next/engine/turn-engine-manager.js';
import { TARGET_SELECTION_MODES } from '../ui-next/utils/simulator-settings.js';
import { FORM_CHANGE_STYLE_IDS } from '../src/domain/form-change.js';
import { getStore } from './helpers.js';

class TestResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

function withDom(run) {
  const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
    url: 'https://example.test/',
  });
  const previous = {
    window: globalThis.window,
    document: globalThis.document,
    ResizeObserver: globalThis.ResizeObserver,
    CustomEvent: globalThis.CustomEvent,
    Event: globalThis.Event,
    MouseEvent: globalThis.MouseEvent,
  };

  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.ResizeObserver = TestResizeObserver;
  globalThis.CustomEvent = dom.window.CustomEvent;
  globalThis.Event = dom.window.Event;
  globalThis.MouseEvent = dom.window.MouseEvent;

  try {
    return run({
      dom,
      root: dom.window.document.querySelector('#root'),
      win: dom.window,
    });
  } finally {
    globalThis.window = previous.window;
    globalThis.document = previous.document;
    globalThis.ResizeObserver = previous.ResizeObserver;
    globalThis.CustomEvent = previous.CustomEvent;
    globalThis.Event = previous.Event;
    globalThis.MouseEvent = previous.MouseEvent;
    dom.window.close();
  }
}

function createSimulatorSettings() {
  return {
    targetSelection: {
      enemyMode: TARGET_SELECTION_MODES.SIMPLE,
      allyMode: TARGET_SELECTION_MODES.SIMPLE,
    },
  };
}

function createStateWithFormChangeLead() {
  const store = getStore();
  const leadStyle = store.getStyleById(FORM_CHANGE_STYLE_IDS.K_ASAKURA_TWINS);
  assert.ok(leadStyle, 'lead style should exist');

  const styleIds = [Number(leadStyle.id)];
  const usedCharacters = new Set([String(leadStyle.chara_label ?? '')]);
  for (const style of store.styles ?? []) {
    const styleId = Number(style?.id);
    const characterLabel = String(style?.chara_label ?? '');
    if (!Number.isFinite(styleId) || styleId === Number(leadStyle.id) || usedCharacters.has(characterLabel)) {
      continue;
    }
    styleIds.push(styleId);
    usedCharacters.add(characterLabel);
    if (styleIds.length >= 6) {
      break;
    }
  }
  assert.equal(styleIds.length, 6, 'test party should include 6 unique characters');

  return createBattleStateFromParty(
    store.buildPartyFromStyleIds(styleIds, { initialSP: 20 })
  );
}

function mountTurnArea(root, state) {
  const controller = new TurnAreaController({
    root,
    store: getStore(),
    engineManager: new TurnEngineManager(),
    onError(error) {
      throw error;
    },
    onTurnCommitted() {},
  });
  controller.initialize(state, {}, createSimulatorSettings());
  return controller;
}

function getInputRow(root) {
  return root.querySelector('[data-turn-row][data-row-mode="input"]');
}

function getLeadIcon(root) {
  return getInputRow(root)?.querySelector('[data-turn-slot][data-position="0"] [data-turn-slot-icon] img') ?? null;
}

test('ui-next CHANGE button toggles CODE:Virtual Killer icon and operation chip', () =>
  withDom(({ root, win }) => {
    mountTurnArea(root, createStateWithFormChangeLead());

    const initialIcon = getLeadIcon(root);
    assert.ok(initialIcon);
    assert.match(initialIcon.src, /KAsakuraTwins_R3_Thumbnail\.webp$/);

    const changeButton = getInputRow(root)?.querySelector('[data-role="form-change-btn"][data-party-index="0"]');
    assert.ok(changeButton);
    changeButton.dispatchEvent(new win.MouseEvent('click', { bubbles: true, cancelable: true }));

    const changedIcon = getLeadIcon(root);
    assert.ok(changedIcon);
    assert.match(changedIcon.src, /KAsakuraTwinsAnother_R3_Thumbnail\.webp$/);
    assert.match(getInputRow(root)?.textContent ?? '', /フォーム:\s*カレン/);
  }));

test('ui-next exclusive skill selection auto-switches the form and carries it to the next turn', () =>
  withDom(({ root, win }) => {
    mountTurnArea(root, createStateWithFormChangeLead());

    const select = getInputRow(root)?.querySelector('[data-skill-select][data-party-index="0"]');
    assert.ok(select);
    select.value = '46001522';
    select.dispatchEvent(new win.Event('change', { bubbles: true }));

    const karenIcon = getLeadIcon(root);
    assert.ok(karenIcon);
    assert.match(karenIcon.src, /KAsakuraTwinsAnother_R3_Thumbnail\.webp$/);

    const commitButton = getInputRow(root)?.querySelector('[data-role="commit-btn"]');
    assert.ok(commitButton);
    commitButton.dispatchEvent(new win.MouseEvent('click', { bubbles: true, cancelable: true }));

    let nextInputRow = root.querySelectorAll('[data-turn-row][data-row-mode="input"]').item(0);
    assert.ok(nextInputRow);
    const nextIcon = nextInputRow.querySelector('[data-turn-slot][data-position="0"] [data-turn-slot-icon] img');
    assert.ok(nextIcon);
    assert.match(nextIcon.src, /KAsakuraTwinsAnother_R3_Thumbnail\.webp$/);

    const nextSelect = nextInputRow.querySelector('[data-skill-select][data-party-index="0"]');
    assert.ok(nextSelect);
    nextSelect.value = '46001523';
    nextSelect.dispatchEvent(new win.Event('change', { bubbles: true }));

    nextInputRow = root.querySelectorAll('[data-turn-row][data-row-mode="input"]').item(0);
    const baseIcon = nextInputRow?.querySelector('[data-turn-slot][data-position="0"] [data-turn-slot-icon] img');
    assert.ok(baseIcon);
    assert.match(baseIcon.src, /KAsakuraTwins_R3_Thumbnail\.webp$/);
  }));
