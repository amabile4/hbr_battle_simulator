import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

import { UsedSkillsOverlayController } from '../ui-next/components/used-skills-overlay.js';

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

test('UsedSkillsOverlayController renders rows and toggles open/close', () =>
  withDom(({ root }) => {
    const controller = new UsedSkillsOverlayController({ root });
    controller.mount();

    controller.setRows([
      {
        partyIndex: 0,
        characterName: '茅森 月歌',
        styleName: '[Daybreak] 茅森 月歌',
        usedSkills: [
          { name: 'スキルA', categoryLabel: 'スタイル固有' },
          { name: 'オーブスキルA', categoryLabel: 'オーブ' },
        ],
        equippedPassiveSkills: [
          { name: '装備パッシブA', categoryLabel: 'キャラ汎用' },
        ],
      },
    ]);

    controller.open();
    const dialog = root.querySelector('[data-role="used-skills-dialog"]');
    assert.ok(dialog);
    assert.equal(dialog.classList.contains('hidden'), false);

    const items = [...root.querySelectorAll('li')].map((node) => String(node.textContent ?? ''));
    assert.equal(items.some((text) => text.includes('スキルA')), true);
    assert.equal(items.some((text) => text.includes('オーブスキルA')), true);
    assert.equal(items.some((text) => text.includes('装備パッシブA')), true);

    controller.close();
    assert.equal(dialog.classList.contains('hidden'), true);
  }));
