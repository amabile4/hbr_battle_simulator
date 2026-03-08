import { JSDOM } from 'jsdom';

export function createRoot() {
  const dom = new JSDOM(`<!doctype html><body>
    <div id="app">
      <div data-role="style-slots"></div>
      <span data-role="selection-summary"></span>
      <select data-role="selection-slot-select"></select>
      <button data-action="save-selection"></button>
      <button data-action="load-selection"></button>
      <button data-action="clear-selection-slot"></button>
      <pre data-role="selection-slot-preview"></pre>
      <input data-role="initial-od-gauge" type="number" value="0" />
      <button data-action="initialize"></button>
      <input data-role="enemy-action" />
      <select data-role="enemy-count"><option value="1">1</option><option value="2">2</option><option value="3">3</option></select>
      <select data-role="enemy-status-type"><option value="DownTurn">DownTurn</option><option value="Break">Break</option><option value="Dead">Dead</option></select>
      <select data-role="enemy-status-target"><option value="0">Enemy 1</option></select>
      <input data-role="enemy-status-turns" type="number" value="1" />
      <button data-action="enemy-status-apply"></button>
      <button data-action="enemy-status-clear"></button>
      <strong data-role="enemy-status-list"></strong>
      <div data-role="enemy-config-list"></div>
      <div data-role="enemy-zone-controls" hidden>
        <select data-role="enemy-zone-source"></select>
        <button data-action="enemy-zone-apply"></button>
      </div>
      <div data-role="action-slots"></div>
      <select data-role="swap-from"><option value="0">0</option></select>
      <select data-role="swap-to"><option value="3">3</option></select>
      <button data-action="swap"></button>
      <button data-action="preview"></button>
      <button data-action="commit"></button>
      <button data-action="open-interrupt-od"></button>
      <span data-role="interrupt-od-badge"></span>
      <span data-role="interrupt-od-projection"></span>
      <button data-action="open-od"></button>
      <button data-action="kishinka" hidden></button>
      <span data-role="kishinka-state"></span>
      <input data-role="force-od-toggle" type="checkbox" />
      <div data-role="od-dialog" hidden>
        <select data-role="od-level"><option value="1">1</option><option value="2">2</option><option value="3">3</option></select>
        <button data-action="od-confirm"></button>
        <button data-action="od-cancel"></button>
      </div>
      <div data-role="interrupt-od-dialog" hidden>
        <select data-role="interrupt-od-level"><option value="1">1</option><option value="2">2</option><option value="3">3</option></select>
        <button data-action="interrupt-od-confirm"></button>
        <button data-action="interrupt-od-cancel"></button>
      </div>
      <button data-action="clear-records"></button>
      <input data-role="records-simple-toggle" type="checkbox" />
      <select data-role="turn-plan-recalc-mode"><option value="strict">strict</option><option value="force">force</option></select>
      <button data-action="turn-plan-recalc"></button>
      <span data-role="turn-plan-recalc-status"></span>
      <div data-role="turn-plan-edit-toolbar" hidden>
        <span data-role="turn-plan-edit-title"></span>
        <button data-action="turn-plan-edit-save"></button>
        <button data-action="turn-plan-edit-cancel"></button>
      </div>
      <button data-action="export-csv"></button>
      <button data-action="export-records-json"></button>
      <textarea data-role="scenario-json"></textarea>
      <button data-action="scenario-load"></button>
      <button data-action="scenario-apply-setup"></button>
      <button data-action="scenario-stage-next"></button>
      <button data-action="scenario-run-next"></button>
      <button data-action="scenario-run-all"></button>
      <span data-role="scenario-status"></span>
      <span data-role="turn-label"></span>
      <span data-role="field-state-label"></span>
      <span data-role="status"></span>
      <ul data-role="party-state"></ul>
      <div data-role="dp-debug-list"></div>
      <div data-role="token-debug-list"></div>
      <div data-role="enemy-attack-target-controls"></div>
      <pre data-role="preview-output"></pre>
      <pre data-role="condition-support-summary"></pre>
      <pre data-role="passive-log-output"></pre>
      <table>
        <thead><tr data-role="record-head"></tr></thead>
        <tbody data-role="record-body"></tbody>
      </table>
      <textarea data-role="csv-output"></textarea>
      <textarea data-role="records-json-output"></textarea>
    </div>
  </body>`, { url: 'https://example.test/' });

  return {
    root: dom.window.document.querySelector('#app'),
    win: dom.window,
  };
}

export function setFrontlineNormalAttackSelections(adapter, root, win) {
  for (const member of adapter.party.getFrontline()) {
    const select = root.querySelector(`[data-action-slot="${member.position}"]`);
    if (!select) {
      continue;
    }
    const normalOption = [...select.options].find((option) =>
      String(option.textContent ?? '').includes('通常攻撃')
    );
    if (!normalOption) {
      continue;
    }
    select.value = String(normalOption.value);
    select.dispatchEvent(new win.Event('change', { bubbles: true }));
  }
}
