import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { BattleDomAdapter } from '../src/index.js';
import { getStore, getSixUsableStyleIds } from './helpers.js';

function createRoot() {
  const dom = new JSDOM(`<!doctype html><body>
    <div id="app">
      <div data-role="style-slots"></div>
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

  return dom.window.document.querySelector('#app');
}

test('dom adapter initializes, previews, commits, and exports csv', () => {
  const store = getStore();
  const root = createRoot();
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
  const root = createRoot();
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
