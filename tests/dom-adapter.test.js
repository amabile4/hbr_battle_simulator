import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { BattleDomAdapter } from '../src/index.js';
import { getStore, getSixUsableStyleIds } from './helpers.js';

function createRoot() {
  const dom = new JSDOM(`<!doctype html><body>
    <div id="app">
      <div data-role="style-slots"></div>
      <span data-role="selection-summary"></span>
      <button data-action="initialize"></button>
      <input data-role="enemy-action" />
      <div data-role="action-slots"></div>
      <select data-role="swap-from"><option value="0">0</option></select>
      <select data-role="swap-to"><option value="3">3</option></select>
      <button data-action="swap"></button>
      <button data-action="preview"></button>
      <button data-action="commit"></button>
      <button data-action="clear-records"></button>
      <button data-action="export-csv"></button>
      <span data-role="turn-label"></span>
      <span data-role="status"></span>
      <ul data-role="party-state"></ul>
      <pre data-role="preview-output"></pre>
      <tbody data-role="record-body"></tbody>
      <textarea data-role="csv-output"></textarea>
    </div>
  </body>`);

  return {
    root: dom.window.document.querySelector('#app'),
    win: dom.window,
  };
}

test('dom adapter initializes, previews, commits, and exports csv', () => {
  const store = getStore();
  const { root } = createRoot();
  const adapter = new BattleDomAdapter({ root, dataStore: store, initialSP: 10 });

  adapter.mount();
  const preview = adapter.previewCurrentTurn();

  assert.equal(preview.recordStatus, 'preview');

  const committed = adapter.commitCurrentTurn();
  assert.equal(committed.recordStatus, 'committed');
  assert.equal(adapter.recordStore.records.length, 1);

  const csv = adapter.exportCsv();
  assert.ok(csv.includes('turnLabel,enemyAction'));
  assert.ok(csv.includes('T1'));
});

test('dom adapter can initialize using explicit style ids and queue swap', () => {
  const store = getStore();
  const { root } = createRoot();
  const adapter = new BattleDomAdapter({ root, dataStore: store, initialSP: 10 });

  const styleIds = getSixUsableStyleIds(store);
  adapter.initializeBattle(styleIds);

  const swap = adapter.queueSwap(0, 3);
  assert.equal(swap.fromPositionIndex, 0);
  assert.equal(swap.toPositionIndex, 3);

  adapter.previewCurrentTurn();
  adapter.commitCurrentTurn();

  assert.equal(adapter.pendingSwapEvents.length, 0);
  assert.equal(adapter.recordStore.records.length, 1);
});

test('character -> style selection is linked and reflected on screen', () => {
  const store = getStore();
  const { root, win } = createRoot();
  const adapter = new BattleDomAdapter({ root, dataStore: store, initialSP: 10 });
  adapter.mount();

  const characterSelects = root.querySelectorAll('[data-role="character-select"]');
  const styleSelects = root.querySelectorAll('[data-role="style-select"]');
  assert.equal(characterSelects.length, 6);
  assert.equal(styleSelects.length, 6);

  const slot = 0;
  const characterSelect = root.querySelector(`[data-role="character-select"][data-slot="${slot}"]`);
  const styleSelect = root.querySelector(`[data-role="style-select"][data-slot="${slot}"]`);
  const initialCharacter = characterSelect.value;

  const target = store
    .listCharacterCandidates()
    .find((candidate) => candidate.label !== initialCharacter && candidate.styleCount > 1);
  assert.ok(target);

  characterSelect.value = target.label;
  characterSelect.dispatchEvent(new win.Event('change', { bubbles: true }));

  assert.ok(styleSelect.options.length > 0);
  for (const option of styleSelect.options) {
    assert.equal(option.getAttribute('data-character-label'), target.label);
  }

  styleSelect.selectedIndex = Math.max(0, styleSelect.options.length - 1);
  styleSelect.dispatchEvent(new win.Event('change', { bubbles: true }));

  const slotSummary = root.querySelector(`[data-role="slot-summary"][data-slot="${slot}"]`).textContent;
  const summary = root.querySelector('[data-role="selection-summary"]').textContent;

  assert.ok(slotSummary.includes('Character:'));
  assert.ok(slotSummary.includes('Style:'));
  assert.ok(summary.includes('Slot 1:'));
});
