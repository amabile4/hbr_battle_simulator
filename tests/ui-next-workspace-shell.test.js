import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

import {
  applyPassiveLogOpenState,
  applySetupOpenState,
} from '../ui-next/utils/workspace-shell.js';

function withDom(run) {
  const dom = new JSDOM(
    `<!doctype html><html><body>
      <main id="app"></main>
      <aside id="setup-area"></aside>
      <section id="passive-log-pane"></section>
      <button id="toggle-setup"></button>
      <button id="toggle-passive-log"></button>
    </body></html>`,
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
      appRoot: dom.window.document.querySelector('#app'),
      setupArea: dom.window.document.querySelector('#setup-area'),
      passiveLogPane: dom.window.document.querySelector('#passive-log-pane'),
      toggleSetup: dom.window.document.querySelector('#toggle-setup'),
      togglePassiveLog: dom.window.document.querySelector('#toggle-passive-log'),
    });
  } finally {
    globalThis.window = previous.window;
    globalThis.document = previous.document;
    dom.window.close();
  }
}

test('applySetupOpenState hides setup area and updates toggle label', () =>
  withDom(({ appRoot, setupArea, toggleSetup }) => {
    applySetupOpenState({
      appRoot,
      setupArea,
      toggleButton: toggleSetup,
      open: false,
    });

    assert.equal(appRoot.dataset.setupOpen, 'false');
    assert.equal(setupArea.hidden, true);
    assert.equal(toggleSetup.textContent, '設定を表示');
    assert.equal(toggleSetup.getAttribute('aria-expanded'), 'false');
  }));

test('applyPassiveLogOpenState disables toggle until rows exist', () =>
  withDom(({ appRoot, passiveLogPane, togglePassiveLog }) => {
    applyPassiveLogOpenState({
      appRoot,
      paneRoot: passiveLogPane,
      toggleButton: togglePassiveLog,
      open: true,
      hasRows: false,
    });

    assert.equal(appRoot.dataset.passiveLogAvailable, 'false');
    assert.equal(appRoot.dataset.passiveLogOpen, 'false');
    assert.equal(passiveLogPane.hidden, true);
    assert.equal(togglePassiveLog.disabled, true);

    applyPassiveLogOpenState({
      appRoot,
      paneRoot: passiveLogPane,
      toggleButton: togglePassiveLog,
      open: true,
      hasRows: true,
    });

    assert.equal(appRoot.dataset.passiveLogAvailable, 'true');
    assert.equal(appRoot.dataset.passiveLogOpen, 'true');
    assert.equal(passiveLogPane.hidden, false);
    assert.equal(togglePassiveLog.disabled, false);
    assert.equal(togglePassiveLog.textContent, 'ログを隠す');
  }));
