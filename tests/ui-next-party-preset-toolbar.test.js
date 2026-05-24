import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

import { PartyPresetToolbarController } from '../ui-next/components/party-preset-toolbar.js';

class TestResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

function createPreviewSlots() {
  return [
    {
      style: { id: 1001, image: '', tier: 'SSR' },
      supportStyle: { id: 2001, image: '', tier: 'SS', resonance: '31A' },
    },
    { style: { id: 1002, image: '', tier: 'SS' }, supportStyle: null },
    { style: { id: 1003, image: '', tier: 'SS' }, supportStyle: null },
    { style: null, supportStyle: null },
    { style: null, supportStyle: null },
    { style: null, supportStyle: null },
  ];
}

async function withDom(run) {
  const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
    url: 'https://example.test/',
  });
  const previous = {
    window: globalThis.window,
    document: globalThis.document,
    HTMLElement: globalThis.HTMLElement,
    ResizeObserver: globalThis.ResizeObserver,
  };

  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.HTMLElement = dom.window.HTMLElement;
  globalThis.ResizeObserver = TestResizeObserver;
  dom.window.ResizeObserver = TestResizeObserver;
  dom.window.innerWidth = 1280;
  dom.window.innerHeight = 720;

  try {
    return await run({
      dom,
      win: dom.window,
      root: dom.window.document.querySelector('#root'),
    });
  } finally {
    globalThis.window = previous.window;
    globalThis.document = previous.document;
    globalThis.HTMLElement = previous.HTMLElement;
    globalThis.ResizeObserver = previous.ResizeObserver;
    dom.window.close();
  }
}

function createService() {
  const entries = Array.from({ length: 20 }, () => null);
  entries[0] = {
    name: '31A前衛',
    label: '茅森 月歌・和泉 ユキ・逢川 めぐみ',
    savedAt: '2026-03-28T00:00:00.000Z',
    slots: createPreviewSlots(),
  };
  entries[1] = {
    label: '自動命名PT',
    savedAt: '2026-03-28T00:00:01.000Z',
    slots: createPreviewSlots(),
  };
  const calls = {
    load: [],
    save: [],
    rename: [],
    clear: [],
  };
  return {
    entries,
    calls,
    getPresetPreviews() {
      return entries;
    },
    async loadPreset(index) {
      calls.load.push(index);
      return true;
    },
    async savePreset(index, { name }) {
      calls.save.push({ index, name });
      entries[index] = {
        name: name || undefined,
        label: '保存済みPT',
        savedAt: '2026-03-28T00:10:00.000Z',
        slots: createPreviewSlots(),
      };
      return true;
    },
    async renamePreset(index, { name }) {
      calls.rename.push({ index, name });
      if (entries[index]) {
        entries[index] = {
          ...entries[index],
          ...(name ? { name } : {}),
        };
        if (!name) {
          delete entries[index].name;
        }
      }
      return true;
    },
    async clearPreset(index) {
      calls.clear.push(index);
      entries[index] = null;
      return true;
    },
  };
}

test('PartyPresetToolbarController renders 20 circled preset buttons', () =>
  withDom(({ root }) => {
    const service = createService();
    const controller = new PartyPresetToolbarController({
      root,
      getPresetPreviews: () => service.getPresetPreviews(),
      onLoadPreset: (index) => service.loadPreset(index),
      onSavePreset: (index, options) => service.savePreset(index, options),
      onRenamePreset: (index, options) => service.renamePreset(index, options),
      onClearPreset: (index) => service.clearPreset(index),
    });
    controller.mount();

    const buttons = root.querySelectorAll('[data-role="party-preset-button"]');
    assert.equal(buttons.length, 20);
    assert.equal(buttons[0].textContent.trim(), '①');
    assert.equal(buttons[19].textContent.trim(), '⑳');
  }));

test('PartyPresetToolbarController toggles overflow indicator only while strip is clipped', () =>
  withDom(({ root }) => {
    const service = createService();
    const controller = new PartyPresetToolbarController({
      root,
      getPresetPreviews: () => service.getPresetPreviews(),
      onLoadPreset: (index) => service.loadPreset(index),
      onSavePreset: (index, options) => service.savePreset(index, options),
      onRenamePreset: (index, options) => service.renamePreset(index, options),
      onClearPreset: (index) => service.clearPreset(index),
    });
    controller.mount();

    const scroller = root.querySelector('[data-role="preset-scroller"]');
    const indicator = root.querySelector('[data-role="preset-overflow-indicator"]');
    Object.defineProperty(scroller, 'scrollWidth', { configurable: true, value: 400 });
    Object.defineProperty(scroller, 'clientWidth', { configurable: true, value: 120 });
    Object.defineProperty(scroller, 'scrollLeft', { configurable: true, value: 0, writable: true });
    controller.sync();
    assert.equal(indicator.hidden, false);
    assert.equal(scroller.getAttribute('data-overflowing'), 'true');
    assert.equal(root.getAttribute('data-overflowing'), 'true');

    scroller.scrollLeft = 280;
    scroller.dispatchEvent(new window.Event('scroll'));
    assert.equal(indicator.hidden, true);
  }));

test('PartyPresetToolbarController marks the strip as non-overflowing when all slots fit', () =>
  withDom(({ root }) => {
    const service = createService();
    const controller = new PartyPresetToolbarController({
      root,
      getPresetPreviews: () => service.getPresetPreviews(),
      onLoadPreset: (index) => service.loadPreset(index),
      onSavePreset: (index, options) => service.savePreset(index, options),
      onRenamePreset: (index, options) => service.renamePreset(index, options),
      onClearPreset: (index) => service.clearPreset(index),
    });
    controller.mount();

    const scroller = root.querySelector('[data-role="preset-scroller"]');
    const indicator = root.querySelector('[data-role="preset-overflow-indicator"]');
    Object.defineProperty(scroller, 'scrollWidth', { configurable: true, value: 120 });
    Object.defineProperty(scroller, 'clientWidth', { configurable: true, value: 400 });
    Object.defineProperty(scroller, 'scrollLeft', { configurable: true, value: 0, writable: true });

    controller.sync();

    assert.equal(indicator.hidden, true);
    assert.equal(scroller.getAttribute('data-overflowing'), 'false');
    assert.equal(root.getAttribute('data-overflowing'), 'false');
  }));

test('PartyPresetToolbarController uses name over label in hover preview and loads on click', async () =>
  withDom(async ({ root, win }) => {
    const service = createService();
    const controller = new PartyPresetToolbarController({
      root,
      getPresetPreviews: () => service.getPresetPreviews(),
      onLoadPreset: (index) => service.loadPreset(index),
      onSavePreset: (index, options) => service.savePreset(index, options),
      onRenamePreset: (index, options) => service.renamePreset(index, options),
      onClearPreset: (index) => service.clearPreset(index),
    });
    controller.mount();

    const buttons = root.querySelectorAll('[data-role="party-preset-button"]');
    buttons[0].dispatchEvent(new win.MouseEvent('mouseenter', { bubbles: true }));
    const hoverPreview = win.document.querySelector('[data-role="preset-hover-preview"]');
    assert.equal(hoverPreview.hidden, false);
    assert.match(hoverPreview.textContent ?? '', /31A前衛/);

    buttons[0].dispatchEvent(new win.MouseEvent('mouseleave', { bubbles: true }));
    assert.equal(hoverPreview.hidden, true);

    buttons[1].dispatchEvent(new win.MouseEvent('mouseenter', { bubbles: true }));
    assert.match(hoverPreview.textContent ?? '', /自動命名PT/);

    buttons[0].dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
    await new Promise((resolve) => win.setTimeout(resolve, 0));
    assert.deepEqual(service.calls.load, [0]);
  }));

test('PartyPresetToolbarController hides hover preview after async load completes', async () =>
  withDom(async ({ root, win }) => {
    const service = createService();
    const controller = new PartyPresetToolbarController({
      root,
      getPresetPreviews: () => service.getPresetPreviews(),
      onLoadPreset: (index) => service.loadPreset(index),
      onSavePreset: (index, options) => service.savePreset(index, options),
      onRenamePreset: (index, options) => service.renamePreset(index, options),
      onClearPreset: (index) => service.clearPreset(index),
    });
    controller.mount();

    const buttons = root.querySelectorAll('[data-role="party-preset-button"]');
    buttons[0].dispatchEvent(new win.MouseEvent('mouseenter', { bubbles: true }));
    const hoverPreview = win.document.querySelector('[data-role="preset-hover-preview"]');
    assert.equal(hoverPreview.hidden, false, 'Preview should be visible after mouseenter');

    // Click to load — async load resolves and re-renders buttons.
    // The mouseleave may not fire because DOM is rebuilt, so #handleLoad must
    // explicitly dismiss the preview.
    buttons[0].dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
    await new Promise((resolve) => win.setTimeout(resolve, 0));

    assert.equal(hoverPreview.hidden, true, 'Preview should be hidden after load completes');
  }));

test('PartyPresetToolbarController opens context menu and supports save rename clear actions', async () =>
  withDom(async ({ root, win }) => {
    const service = createService();
    const controller = new PartyPresetToolbarController({
      root,
      getPresetPreviews: () => service.getPresetPreviews(),
      onLoadPreset: (index) => service.loadPreset(index),
      onSavePreset: (index, options) => service.savePreset(index, options),
      onRenamePreset: (index, options) => service.renamePreset(index, options),
      onClearPreset: (index) => service.clearPreset(index),
    });
    controller.mount();

    let buttons = root.querySelectorAll('[data-role="party-preset-button"]');
    buttons[2].dispatchEvent(new win.MouseEvent('contextmenu', { bubbles: true }));
    const menu = win.document.querySelector('[data-role="preset-action-menu"]');
    assert.equal(menu.hidden, false);
    assert.match(menu.textContent ?? '', /保存/);

    menu.querySelector('[data-action="save"]').dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
    let input = menu.querySelector('[data-role="preset-name-input"]');
    input.value = '手動保存PT';
    menu.querySelector('[data-role="preset-name-form"]').dispatchEvent(new win.Event('submit', { bubbles: true }));
    await new Promise((resolve) => win.setTimeout(resolve, 0));
    assert.deepEqual(service.calls.save, [{ index: 2, name: '手動保存PT' }]);

    buttons = root.querySelectorAll('[data-role="party-preset-button"]');
    buttons[0].dispatchEvent(new win.MouseEvent('contextmenu', { bubbles: true }));
    menu.querySelector('[data-action="rename"]').dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
    input = menu.querySelector('[data-role="preset-name-input"]');
    input.value = '更新名';
    menu.querySelector('[data-role="preset-name-form"]').dispatchEvent(new win.Event('submit', { bubbles: true }));
    await new Promise((resolve) => win.setTimeout(resolve, 0));
    assert.deepEqual(service.calls.rename, [{ index: 0, name: '更新名' }]);

    buttons = root.querySelectorAll('[data-role="party-preset-button"]');
    buttons[0].dispatchEvent(new win.MouseEvent('contextmenu', { bubbles: true }));
    menu.querySelector('[data-action="clear"]').dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
    await new Promise((resolve) => win.setTimeout(resolve, 0));
    assert.deepEqual(service.calls.clear, [0]);
  }));

test('PartyPresetToolbarController opens action menu on long press and suppresses follow-up click load', async () =>
  withDom(async ({ root, win }) => {
    const service = createService();
    const controller = new PartyPresetToolbarController({
      root,
      getPresetPreviews: () => service.getPresetPreviews(),
      onLoadPreset: (index) => service.loadPreset(index),
      onSavePreset: (index, options) => service.savePreset(index, options),
      onRenamePreset: (index, options) => service.renamePreset(index, options),
      onClearPreset: (index) => service.clearPreset(index),
    });
    controller.mount();

    const button = root.querySelectorAll('[data-role="party-preset-button"]')[0];
    button.dispatchEvent(new win.Event('touchstart', { bubbles: true }));
    await new Promise((resolve) => win.setTimeout(resolve, 460));

    const menu = win.document.querySelector('[data-role="preset-action-menu"]');
    assert.equal(menu.hidden, false);

    button.dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
    await new Promise((resolve) => win.setTimeout(resolve, 0));
    assert.deepEqual(service.calls.load, []);
  }));

test('PartyPresetToolbarController prevents text selection from preset buttons during long press gestures', () =>
  withDom(({ root, win }) => {
    const service = createService();
    const controller = new PartyPresetToolbarController({
      root,
      getPresetPreviews: () => service.getPresetPreviews(),
      onLoadPreset: (index) => service.loadPreset(index),
      onSavePreset: (index, options) => service.savePreset(index, options),
      onRenamePreset: (index, options) => service.renamePreset(index, options),
      onClearPreset: (index) => service.clearPreset(index),
    });
    controller.mount();

    const button = root.querySelector('[data-role="party-preset-button"]');
    const selectStartEvent = new win.Event('selectstart', { bubbles: true, cancelable: true });
    button.dispatchEvent(selectStartEvent);
    assert.equal(selectStartEvent.defaultPrevented, true);
  }));
