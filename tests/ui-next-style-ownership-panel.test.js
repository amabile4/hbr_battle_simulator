import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

import { StyleOwnershipPanel } from '../ui-next/components/style-ownership-panel.js';

test('StyleOwnershipPanel renders the team name before the team leader name', () => {
  const dom = new JSDOM(
    '<!doctype html><html><body><div id="root"></div></body></html>',
    { url: 'https://example.test/' },
  );
  const previous = {
    window: globalThis.window,
    document: globalThis.document,
    localStorage: globalThis.localStorage,
  };

  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.localStorage = dom.window.localStorage;

  try {
    const panel = new StyleOwnershipPanel({
      store: {
        styles: [{
          id: 1,
          tier: 'SS',
          team: '31A',
          chara: '茅森 月歌 — Ruka Kayamori',
          chara_label: 'KayamoriRuka',
          name: '黎明のエモーショナル・ソウル',
        }],
        getLimitBreakMaxByTier: () => 4,
      },
    });
    panel.mount(dom.window.document.querySelector('#root'));
    panel.open();

    const labels = [...dom.window.document.querySelectorAll('.sop-team-header span')]
      .map((node) => node.textContent);

    assert.deepEqual(labels, ['31A', '茅森 月歌']);
  } finally {
    globalThis.window = previous.window;
    globalThis.document = previous.document;
    globalThis.localStorage = previous.localStorage;
    dom.window.close();
  }
});
