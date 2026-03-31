import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

import { PartySetupController } from '../ui-next/components/party-setup.js';
import { getStore } from './helpers.js';

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

function createBaseSnapshot(mainStyleId, supportStyleId = null) {
  return {
    styleIds: [mainStyleId, 1001101, 1001201, null, null, null],
    supportStyleIds: [supportStyleId, null, null, null, null, null],
    limitBreakLevelsByPartyIndex: { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
    supportLimitBreakLevelsByPartyIndex: { 0: 4, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
    drivePierceByPartyIndex: { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
    startSpEquipByPartyIndex: { 0: 3, 1: 3, 2: 3, 3: 3, 4: 3, 5: 3 },
  };
}

function findUiNextResonancePair(store) {
  const mainStyles = store.styles.filter((style) => String(style?.tier ?? '') === 'SSR');
  const supportStyles = store.styles.filter((style) => Boolean(String(style?.resonance ?? '').trim()));

  for (const mainStyle of mainStyles) {
    const mainElements = Array.isArray(mainStyle?.elements) ? mainStyle.elements : [];
    for (const supportStyle of supportStyles) {
      if (Number(mainStyle.id) === Number(supportStyle.id)) {
        continue;
      }
      const supportElements = Array.isArray(supportStyle?.elements) ? supportStyle.elements : [];
      const hasElementMatch =
        mainElements.length === 0
          ? supportElements.length === 0
          : mainElements.some((element) => supportElements.includes(element));
      if (!hasElementMatch) {
        continue;
      }
      const group = store.getSupportGroupByLabel(supportStyle.resonance);
      const passiveName = group?.list?.at(-1)?.passive?.name ?? '';
      if (!passiveName) {
        continue;
      }
      return {
        mainStyleId: Number(mainStyle.id),
        supportStyleId: Number(supportStyle.id),
        passiveName,
      };
    }
  }

  throw new Error('Could not find an SSR main style and resonance support pair for ui-next tests.');
}

test('ui-next PartySetup highlights resonance-ready support slot for SSR main style', () =>
  withDom(({ root, pickerOverlay }) => {
    const store = getStore();
    const pair = findUiNextResonancePair(store);
    const controller = new PartySetupController({
      root,
      pickerOverlay,
      store,
    });
    controller.mount();
    controller.applySnapshot(createBaseSnapshot(pair.mainStyleId, pair.supportStyleId));

    const supportButton = root.querySelector(
      '[data-action="open-picker"][data-slot-index="0"][data-mode="support"]'
    );
    assert.ok(supportButton);
    assert.match(supportButton.className, /\bring-2\b/);
    assert.match(supportButton.className, /\bring-purple-400\b/);
  }));

test('ui-next StylePicker shows resonance passive detail for selectable support style', () =>
  withDom(({ root, pickerOverlay, win }) => {
    const store = getStore();
    const pair = findUiNextResonancePair(store);
    const controller = new PartySetupController({
      root,
      pickerOverlay,
      store,
    });
    controller.mount();
    controller.applySnapshot(createBaseSnapshot(pair.mainStyleId, null));

    root
      .querySelector('[data-action="open-picker"][data-slot-index="0"][data-mode="support"]')
      .dispatchEvent(new win.MouseEvent('click', { bubbles: true }));

    const card = pickerOverlay.querySelector(`[data-style-id="${pair.supportStyleId}"]`);
    assert.ok(card, 'support card should be visible in ui-next picker');

    card.dispatchEvent(new win.MouseEvent('mouseover', { bubbles: true }));

    const detailText = pickerOverlay.querySelector('#picker-support-detail')?.textContent ?? '';
    assert.equal(detailText.includes(pair.passiveName), true);
  }));
