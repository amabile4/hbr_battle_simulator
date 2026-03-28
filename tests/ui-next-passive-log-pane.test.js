import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

import { PassiveLogPaneController } from '../ui-next/components/passive-log-pane.js';

function withDom(run) {
  const dom = new JSDOM(
    '<!doctype html><html><body><section id="root"></section></body></html>',
    { url: 'https://example.test/' },
  );
  const previous = {
    window: globalThis.window,
    document: globalThis.document,
  };

  globalThis.window = dom.window;
  globalThis.document = dom.window.document;

  try {
    return run({
      root: dom.window.document.querySelector('#root'),
    });
  } finally {
    globalThis.window = previous.window;
    globalThis.document = previous.document;
    dom.window.close();
  }
}

test('PassiveLogPaneController mounts with empty state and notifies unavailable', () =>
  withDom(({ root }) => {
    const availability = [];
    const controller = new PassiveLogPaneController({
      root,
      onHasRowsChange: (hasRows) => availability.push(hasRows),
    });

    controller.mount();

    assert.equal(root.querySelector('[data-role="passive-log-empty"]').classList.contains('hidden'), false);
    assert.equal(root.querySelector('[data-role="passive-log-rows"]').classList.contains('hidden'), true);
    assert.deepEqual(availability, [false]);
  }));

test('PassiveLogPaneController renders rows in a nowrap scroll container', () =>
  withDom(({ root }) => {
    const controller = new PassiveLogPaneController({ root });
    controller.mount();
    controller.setRows([
      { kind: 'marker', text: '=== 戦闘開始 ===' },
      {
        kind: 'passive',
        text: 'T1：茅森 月歌 style / 茅森 月歌 : [機敏] バトル開始時 前衛にいると自身のSP+2',
      },
    ]);

    const rowsContainer = root.querySelector('[data-role="passive-log-rows"]');
    const renderedRows = [...root.querySelectorAll('[data-role="passive-log-row"]')];
    assert.equal(rowsContainer.classList.contains('hidden'), false);
    assert.equal(rowsContainer.style.whiteSpace, 'nowrap');
    assert.equal(renderedRows.length, 2);
    assert.equal(renderedRows[0].dataset.rowKind, 'marker');
    assert.equal(renderedRows[1].dataset.rowKind, 'passive');
    assert.equal(root.querySelector('[data-role="passive-log-count"]').textContent, '2');
  }));
