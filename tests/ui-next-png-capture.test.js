import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

import { buildPngCaptureClone, mountPngCaptureSandbox } from '../ui-next/utils/png-capture.js';

function makeRect(width, height = 480) {
  return {
    width,
    height,
    top: 0,
    left: 0,
    right: width,
    bottom: height,
    x: 0,
    y: 0,
    toJSON() { return {}; },
  };
}

function withDom(markup, run) {
  const dom = new JSDOM(`<!doctype html><html><body>${markup}</body></html>`, {
    url: 'https://example.test/',
  });
  const previous = {
    window: globalThis.window,
    document: globalThis.document,
  };

  globalThis.window = dom.window;
  globalThis.document = dom.window.document;

  try {
    return run({
      root: dom.window.document.querySelector('#turn-area'),
    });
  } finally {
    globalThis.window = previous.window;
    globalThis.document = previous.document;
    dom.window.close();
  }
}

function stubElementWidths(root, selector, width, height = 64) {
  [...root.querySelectorAll(selector)].forEach((element) => {
    element.getBoundingClientRect = () => makeRect(width, height);
  });
}

function createTurnAreaMarkup() {
  return `
    <section id="turn-area">
      <div data-role="turn-toolbar">toolbar</div>
      <div data-role="turn-row-list">
        <div data-turn-row data-row-mode="committed" data-battle-ended="false">
          <div data-turn-buttons>編集</div>
          <div data-turn-note><textarea>note-1</textarea></div>
        </div>
        <div data-turn-row data-row-mode="committed" data-battle-ended="true">
          <div data-turn-buttons>編集</div>
          <div data-turn-note><textarea>note-2</textarea></div>
        </div>
        <div data-turn-row data-row-mode="committed" data-battle-ended="false">
          <div data-turn-buttons>編集</div>
          <div data-turn-note><textarea>note-3</textarea></div>
        </div>
        <div data-turn-row data-row-mode="edit" data-battle-ended="false">
          <div data-turn-buttons>再コミット</div>
          <div data-turn-note><textarea>draft-edit</textarea></div>
        </div>
        <div data-turn-row data-row-mode="input" data-battle-ended="false">
          <div data-turn-buttons>実行</div>
          <div data-turn-note><textarea>draft-input</textarea></div>
        </div>
      </div>
    </section>
  `;
}

test('buildPngCaptureClone keeps committed rows only and marks clone as png capture', () =>
  withDom(createTurnAreaMarkup(), ({ root }) => {
    root.getBoundingClientRect = () => makeRect(840);
    const { clone, meta } = buildPngCaptureClone(root, {
      captureUntilBattleEnd: false,
    });

    const rows = [...clone.querySelectorAll('[data-turn-row]')];
    assert.equal(clone.dataset.captureMode, 'png');
    assert.equal(rows.length, 3);
    assert.deepEqual(rows.map((row) => row.dataset.rowMode), ['committed', 'committed', 'committed']);
    assert.equal(meta.committedRowCount, 3);
    assert.equal(meta.captureWidth, 840);
    assert.equal(clone.style.width, '840px');
    assert.equal(clone.style.minWidth, '840px');
    assert.equal(clone.querySelector('[data-role="turn-row-list"]').style.width, '100%');
    assert.equal(meta.truncatedAtBattleEnd, false);
    assert.equal(rows.every((row) => row.querySelector('[data-turn-buttons]').hidden), true);
  }));

test('buildPngCaptureClone uses turn-row-list as the export source and does not mutate live DOM', () =>
  withDom(createTurnAreaMarkup(), ({ root }) => {
    const sourceButtons = [...root.querySelectorAll('[data-turn-buttons]')];
    const sourceRows = [...root.querySelectorAll('[data-turn-row]')];

    const { clone } = buildPngCaptureClone(root, {
      captureUntilBattleEnd: false,
    });

    assert.equal(clone.querySelector('[data-role="turn-toolbar"]'), null);
    assert.equal(clone.firstElementChild?.dataset.role, 'turn-row-list');
    assert.equal(sourceRows.length, 5);
    assert.equal(sourceButtons.every((button) => button.hidden === false), true);
  }));

test('buildPngCaptureClone copies container context, slot layout mode, and width metrics to clone root', () =>
  withDom(createTurnAreaMarkup(), ({ root }) => {
    root.dataset.turnSlotLayout = 'split';
    root.getBoundingClientRect = () => makeRect(840);
    stubElementWidths(root, '[data-turn-note]', 144);
    stubElementWidths(root, '[data-turn-buttons]', 110);

    const { clone } = buildPngCaptureClone(root, {
      captureUntilBattleEnd: false,
    });

    assert.equal(clone.dataset.turnSlotLayout, 'split');
    assert.equal(clone.style.getPropertyValue('container-type'), 'inline-size');
    assert.equal(clone.style.getPropertyValue('container-name'), 'turn-area');
    assert.equal(clone.style.getPropertyValue('--png-capture-note-width'), '144px');
    assert.equal(clone.style.getPropertyValue('--png-capture-hidden-buttons-width'), '110px');
  }));

test('buildPngCaptureClone trims rows after the first battle-end row when enabled', () =>
  withDom(createTurnAreaMarkup(), ({ root }) => {
    const { clone, meta } = buildPngCaptureClone(root, {
      captureUntilBattleEnd: true,
    });

    const rows = [...clone.querySelectorAll('[data-turn-row]')];
    assert.equal(rows.length, 2);
    assert.deepEqual(rows.map((row) => row.dataset.battleEnded), ['false', 'true']);
    assert.equal(meta.battleEndFound, true);
    assert.equal(meta.truncatedAtBattleEnd, true);
  }));

test('buildPngCaptureClone keeps all committed rows when battle-end row does not exist', () =>
  withDom(
    `
      <section id="turn-area">
        <div data-role="turn-row-list">
          <div data-turn-row data-row-mode="committed" data-battle-ended="false">
            <div data-turn-buttons>編集</div>
            <div data-turn-note><textarea>note-1</textarea></div>
          </div>
          <div data-turn-row data-row-mode="committed" data-battle-ended="false">
            <div data-turn-buttons>編集</div>
            <div data-turn-note><textarea>note-2</textarea></div>
          </div>
          <div data-turn-row data-row-mode="input" data-battle-ended="false">
            <div data-turn-buttons>実行</div>
            <div data-turn-note><textarea>draft</textarea></div>
          </div>
        </div>
      </section>
    `,
    ({ root }) => {
      const { clone, meta } = buildPngCaptureClone(root, {
        captureUntilBattleEnd: true,
      });

      const rows = [...clone.querySelectorAll('[data-turn-row]')];
      assert.equal(rows.length, 2);
      assert.equal(meta.battleEndFound, false);
      assert.equal(meta.truncatedAtBattleEnd, false);
    }
  ));

test('buildPngCaptureClone preserves enemy detail labels as real DOM text for capture rendering', () =>
  withDom(
    `
      <section id="turn-area">
        <div data-role="turn-row-list">
          <div data-turn-row data-row-mode="committed" data-battle-ended="false">
            <div data-turn-info>
              <button type="button"
                      data-role="enemy-detail-trigger"
                      aria-label="敵情報確認"
                      class="turn-info-enemy-button">
                <span class="turn-info-enemy-button__label" aria-hidden="true">
                  <span class="turn-info-enemy-button__label-text turn-info-enemy-button__label-text--full">敵情報確認</span>
                  <span class="turn-info-enemy-button__label-text turn-info-enemy-button__label-text--medium">敵情報</span>
                  <span class="turn-info-enemy-button__label-text turn-info-enemy-button__label-text--short">敵</span>
                </span>
              </button>
            </div>
          </div>
        </div>
      </section>
    `,
    ({ root }) => {
      const { clone } = buildPngCaptureClone(root, {
        captureUntilBattleEnd: false,
      });

      const trigger = clone.querySelector('[data-role="enemy-detail-trigger"]');
      assert.ok(trigger);
      assert.equal(trigger.getAttribute('aria-label'), '敵情報確認');
      assert.equal(
        trigger.querySelector('.turn-info-enemy-button__label-text--full')?.textContent?.trim(),
        '敵情報確認'
      );
      assert.equal(
        trigger.querySelector('.turn-info-enemy-button__label-text--medium')?.textContent?.trim(),
        '敵情報'
      );
      assert.equal(
        trigger.querySelector('.turn-info-enemy-button__label-text--short')?.textContent?.trim(),
        '敵'
      );
    }
  ));

test('mountPngCaptureSandbox keeps capture target visible to the renderer while placing it offscreen', () =>
  withDom(createTurnAreaMarkup(), ({ root }) => {
    root.getBoundingClientRect = () => makeRect(720, 400);

    const { target, cleanup } = mountPngCaptureSandbox(root, {});
    const sandbox = target.parentElement;

    assert.equal(sandbox?.dataset.captureSandbox, 'png');
    assert.equal(sandbox?.style.left, '-100000px');
    assert.equal(sandbox?.style.visibility, '');
    assert.equal(target.style.width, '720px');

    cleanup();
    assert.equal(document.querySelector('[data-capture-sandbox="png"]'), null);
  }));
