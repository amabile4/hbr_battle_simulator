import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

import {
  applyPassiveLogResizingState,
  applyPassiveLogOpenState,
  applySetupOpenState,
  clampPassiveLogPaneHeight,
  setToolbarButtonLabel,
  syncToolbarQuickHelpCompactState,
} from '../ui-next/utils/workspace-shell.js';

function withDom(run) {
  const dom = new JSDOM(
    `<!doctype html><html><body>
      <main id="app"></main>
      <aside id="setup-area"></aside>
      <section id="passive-log-pane"></section>
      <button id="toggle-setup"><span data-role="toolbar-icon"></span><span data-role="toolbar-label"></span></button>
      <button id="toggle-passive-log"><span data-role="toolbar-icon"></span><span data-role="toolbar-label"></span></button>
      <div id="workspace-toolbar" class="workspace-toolbar">
        <button id="quick-help-operations" class="workspace-toolbar__button workspace-toolbar__button--help">
          <span class="help-btn__text"><span>敵状態確認</span><span>キャラアイコン</span></span>
          <span class="help-btn__mouse"></span>
        </button>
      </div>
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
      workspaceToolbar: dom.window.document.querySelector('#workspace-toolbar'),
      quickHelpButton: dom.window.document.querySelector('#quick-help-operations'),
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
    assert.equal(toggleSetup.querySelector('[data-role="toolbar-label"]').textContent, '設定を表示');
    assert.equal(toggleSetup.getAttribute('aria-expanded'), 'false');
    assert.equal(toggleSetup.dataset.active, 'false');
    assert.ok(toggleSetup.querySelector('[data-role="toolbar-icon"]'));
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
    assert.equal(togglePassiveLog.querySelector('[data-role="toolbar-label"]').textContent, 'ログを隠す');
    assert.equal(togglePassiveLog.dataset.active, 'true');
  }));

test('applyPassiveLogOpenState keeps desktop pane height across close and reopen in the same session', () =>
  withDom(({ appRoot, passiveLogPane, togglePassiveLog }) => {
    Object.defineProperty(window, 'innerWidth', {
      configurable: true,
      value: 1280,
      writable: true,
    });

    applyPassiveLogOpenState({
      appRoot,
      paneRoot: passiveLogPane,
      toggleButton: togglePassiveLog,
      open: true,
      hasRows: true,
      heightPx: 320,
      workspaceHeightPx: 720,
      viewportWidth: window.innerWidth,
    });

    assert.equal(passiveLogPane.hidden, false);
    assert.equal(passiveLogPane.style.height, '320px');
    assert.equal(passiveLogPane.style.flexBasis, '320px');

    applyPassiveLogOpenState({
      appRoot,
      paneRoot: passiveLogPane,
      toggleButton: togglePassiveLog,
      open: false,
      hasRows: true,
      heightPx: 320,
      workspaceHeightPx: 720,
      viewportWidth: window.innerWidth,
    });

    assert.equal(passiveLogPane.hidden, true);
    assert.equal(passiveLogPane.style.height, '320px');

    applyPassiveLogOpenState({
      appRoot,
      paneRoot: passiveLogPane,
      toggleButton: togglePassiveLog,
      open: true,
      hasRows: true,
      heightPx: 320,
      workspaceHeightPx: 720,
      viewportWidth: window.innerWidth,
    });

    assert.equal(passiveLogPane.hidden, false);
    assert.equal(passiveLogPane.style.height, '320px');
  }));

test('clampPassiveLogPaneHeight keeps pane within min and remaining workspace budget', () => {
  assert.equal(clampPassiveLogPaneHeight(80, 720), 128);
  assert.equal(clampPassiveLogPaneHeight(999, 720), 480);
  assert.equal(clampPassiveLogPaneHeight(320, 720), 320);
});

test('applyPassiveLogOpenState ignores desktop resize height on mobile widths', () =>
  withDom(({ appRoot, passiveLogPane, togglePassiveLog }) => {
    Object.defineProperty(window, 'innerWidth', {
      configurable: true,
      value: 390,
      writable: true,
    });

    applyPassiveLogOpenState({
      appRoot,
      paneRoot: passiveLogPane,
      toggleButton: togglePassiveLog,
      open: true,
      hasRows: true,
      heightPx: 320,
      workspaceHeightPx: 720,
      viewportWidth: window.innerWidth,
    });

    assert.equal(passiveLogPane.hidden, false);
    assert.equal(passiveLogPane.style.height, '');
    assert.equal(passiveLogPane.dataset.passiveLogResizeEnabled, 'false');
  }));

test('applyPassiveLogResizingState toggles a body class while dragging', () =>
  withDom(({ appRoot }) => {
    applyPassiveLogResizingState({ appRoot, active: true });
    assert.equal(appRoot.dataset.passiveLogResizing, 'true');
    assert.equal(document.body.classList.contains('passive-log-resizing'), true);

    applyPassiveLogResizingState({ appRoot, active: false });
    assert.equal(appRoot.dataset.passiveLogResizing, 'false');
    assert.equal(document.body.classList.contains('passive-log-resizing'), false);
  }));

test('setToolbarButtonLabel preserves icon markup when toolbar buttons have nested spans', () =>
  withDom(({ toggleSetup }) => {
    setToolbarButtonLabel(toggleSetup, 'JSON保存');

    assert.equal(toggleSetup.querySelector('[data-role="toolbar-label"]').textContent, 'JSON保存');
    assert.equal(toggleSetup.getAttribute('aria-label'), 'JSON保存');
    assert.ok(toggleSetup.querySelector('[data-role="toolbar-icon"]'));
  }));

test('syncToolbarQuickHelpCompactState hides help text when toolbar overflows', () =>
  withDom(({ workspaceToolbar, quickHelpButton }) => {
    Object.defineProperty(workspaceToolbar, 'clientWidth', {
      configurable: true,
      get: () => 320,
    });
    Object.defineProperty(workspaceToolbar, 'scrollWidth', {
      configurable: true,
      get: () => 332,
    });

    const compact = syncToolbarQuickHelpCompactState({
      toolbar: workspaceToolbar,
      helpButton: quickHelpButton,
    });

    assert.equal(compact, true);
    assert.equal(quickHelpButton.dataset.compact, 'true');
  }));

test('syncToolbarQuickHelpCompactState restores help text when toolbar fits', () =>
  withDom(({ workspaceToolbar, quickHelpButton }) => {
    quickHelpButton.dataset.compact = 'true';
    Object.defineProperty(workspaceToolbar, 'clientWidth', {
      configurable: true,
      get: () => 320,
    });
    Object.defineProperty(workspaceToolbar, 'scrollWidth', {
      configurable: true,
      get: () => 300,
    });

    const compact = syncToolbarQuickHelpCompactState({
      toolbar: workspaceToolbar,
      helpButton: quickHelpButton,
    });

    assert.equal(compact, false);
    assert.equal(quickHelpButton.dataset.compact, 'false');
  }));
