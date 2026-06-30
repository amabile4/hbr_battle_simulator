import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

import { CharacterSettingsPanel } from '../ui-next/components/character-settings-panel.js';
import { importCharacterSettingsCsv } from '../ui-next/utils/csv-import-export.js';
import {
  DEFAULT_REINCARNATION,
  DEFAULT_TITLE_RANK,
  MAX_REINCARNATION,
  MAX_TITLE_RANK,
} from '../ui-next/utils/character-settings-store.js';

test('character settings keep defaults separate from the actual maximum values', () => {
  assert.equal(DEFAULT_REINCARNATION, 5);
  assert.equal(DEFAULT_TITLE_RANK, 12);
  assert.equal(MAX_REINCARNATION, 20);
  assert.equal(MAX_TITLE_RANK, 15);
});

test('CharacterSettingsPanel renders the actual title and reincarnation limits', () => {
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
    const panel = new CharacterSettingsPanel({
      store: {
        characters: [{ label: 'TestCharacter', name: 'テストキャラクター' }],
        styles: [],
      },
    });
    panel.mount(dom.window.document.querySelector('#root'));
    panel.open();

    const titleInputs = dom.window.document.querySelectorAll(
      '[data-csp-bulk="titleRank"], [data-csp-field="titleRank"]',
    );
    const reincarnationInputs = dom.window.document.querySelectorAll(
      '[data-csp-bulk="reincarnation"], [data-csp-field="reincarnation"]',
    );

    assert.equal(titleInputs.length, 2);
    assert.equal(reincarnationInputs.length, 2);
    for (const input of titleInputs) assert.equal(input.max, '15');
    for (const input of reincarnationInputs) assert.equal(input.max, '20');
  } finally {
    globalThis.window = previous.window;
    globalThis.document = previous.document;
    globalThis.localStorage = previous.localStorage;
    dom.window.close();
  }
});

test('character settings CSV accepts values through title 15 and reincarnation 20', () => {
  const characters = [
    { label: 'A' },
    { label: 'B' },
    { label: 'C' },
    { label: 'D' },
    { label: 'E' },
  ];
  const charactersByLabel = new Map(characters.map((character) => [character.label, character]));
  const csv = [
    'charaLabel,charaName,titleRank,reincarnation',
    'A,A,15,20',
    'B,B,13,20',
    'C,C,12,10',
    'D,D,16,20',
    'E,E,15,21',
  ].join('\n');

  const result = importCharacterSettingsCsv(csv, {
    getCharacterByLabel: (label) => charactersByLabel.get(label) ?? null,
  });

  assert.equal(result.ok, true);
  assert.equal(result.message, '3 件を反映しました（2 件スキップ）');
  assert.deepEqual(result.settings, {
    A: { titleRank: 15, reincarnation: 20 },
    B: { titleRank: 13, reincarnation: 20 },
    C: { titleRank: 12, reincarnation: 10 },
  });
});
