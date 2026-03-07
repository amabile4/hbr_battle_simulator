import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { BattleDomAdapter, grantExtraTurn, CharacterStyle, Party, createBattleStateFromParty } from '../src/index.js';
import { getStore, getSixUsableStyleIds } from './helpers.js';

function createRoot() {
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
      <div data-role="token-debug-list"></div>
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

function setFrontlineNormalAttackSelections(adapter, root, win) {
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
  assert.ok(csv.includes('seq,turn,od_turn,od_context,ex,od,transcendence,enemyAction'));
  assert.ok(csv.includes(',1,,'));
});

test('dom adapter exports records json and triggers file download flow', () => {
  const store = getStore();
  const { root, win } = createRoot();
  const adapter = new BattleDomAdapter({ root, dataStore: store, initialSP: 10 });
  const originalCreateObjectURL = win.URL.createObjectURL;
  const originalRevokeObjectURL = win.URL.revokeObjectURL;
  const originalAnchorClick = win.HTMLAnchorElement.prototype.click;
  const createObjectCalls = [];
  const revokedUrls = [];
  let clickedHref = '';
  let clickedDownload = '';

  win.URL.createObjectURL = (blob) => {
    createObjectCalls.push(blob);
    return 'blob:records-json-test';
  };
  win.URL.revokeObjectURL = (url) => {
    revokedUrls.push(url);
  };
  win.HTMLAnchorElement.prototype.click = function clickOverride() {
    clickedHref = this.getAttribute('href') ?? this.href;
    clickedDownload = this.getAttribute('download') ?? this.download;
  };

  try {
    adapter.mount();
    adapter.previewCurrentTurn();
    adapter.commitCurrentTurn();
    const json = adapter.exportRecordsJson();

    const parsed = JSON.parse(json);
    assert.equal(parsed.schemaVersion, 1);
    assert.equal(parsed.recordStore.records.length, 1);
    assert.equal(root.querySelector('[data-role="records-json-output"]').value, json);
    assert.equal(createObjectCalls.length, 1);
    assert.equal(clickedHref.includes('blob:records-json-test'), true);
    assert.equal(clickedDownload.startsWith('records_'), true);
    assert.equal(clickedDownload.endsWith('.json'), true);
    assert.deepEqual(revokedUrls, ['blob:records-json-test']);
  } finally {
    win.URL.createObjectURL = originalCreateObjectURL;
    win.URL.revokeObjectURL = originalRevokeObjectURL;
    win.HTMLAnchorElement.prototype.click = originalAnchorClick;
  }
});

test('enemy count in turn controls is reflected in preview record', () => {
  const store = getStore();
  const { root, win } = createRoot();
  const adapter = new BattleDomAdapter({ root, dataStore: store, initialSP: 10 });

  adapter.mount();
  const enemyCount = root.querySelector('[data-role="enemy-count"]');
  enemyCount.value = '3';
  enemyCount.dispatchEvent(new win.Event('change', { bubbles: true }));

  const preview = adapter.previewCurrentTurn();
  assert.equal(preview.enemyCount, 3);
});

test('single-target attack can select enemy target from controls', () => {
  const store = getStore();
  const { root, win } = createRoot();
  const adapter = new BattleDomAdapter({ root, dataStore: store, initialSP: 10 });

  adapter.mount();
  const enemyCount = root.querySelector('[data-role="enemy-count"]');
  enemyCount.value = '3';
  enemyCount.dispatchEvent(new win.Event('change', { bubbles: true }));

  const firstFront = adapter.party.getFrontline()[0];
  const targetSelect = root.querySelector(`[data-action-target-slot="${firstFront.position}"]`);
  assert.ok(targetSelect);
  assert.equal(targetSelect.style.display, '');
  assert.deepEqual(
    [...targetSelect.options].map((option) => option.textContent),
    ['Target: Enemy 1', 'Target: Enemy 2', 'Target: Enemy 3']
  );

  targetSelect.value = 'enemy:1';
  targetSelect.dispatchEvent(new win.Event('change', { bubbles: true }));

  const preview = adapter.previewCurrentTurn();
  assert.equal(preview.actions[0].targetEnemyIndex, 1);
});

test('record table shows selected enemy target with enemy name', () => {
  const store = getStore();
  const { root, win } = createRoot();
  const adapter = new BattleDomAdapter({ root, dataStore: store, initialSP: 10 });

  adapter.mount();
  const enemyCount = root.querySelector('[data-role="enemy-count"]');
  enemyCount.value = '3';
  enemyCount.dispatchEvent(new win.Event('change', { bubbles: true }));
  adapter.applyScenarioEnemyNames(['Enemy A', 'Enemy B', 'Enemy C']);

  const firstFront = adapter.party.getFrontline()[0];
  const targetSelect = root.querySelector(`[data-action-target-slot="${firstFront.position}"]`);
  targetSelect.value = 'enemy:1';
  targetSelect.dispatchEvent(new win.Event('change', { bubbles: true }));

  adapter.commitCurrentTurn();

  const rowText = root.querySelector('[data-role="record-body"] tr')?.textContent ?? '';
  assert.ok(rowText.includes('Enemy 2 (Enemy B)'));
});

test('enemy config controls update enemy names and damage rates', () => {
  const store = getStore();
  const { root, win } = createRoot();
  const adapter = new BattleDomAdapter({ root, dataStore: store, initialSP: 10 });

  adapter.mount();
  const enemyCount = root.querySelector('[data-role="enemy-count"]');
  enemyCount.value = '2';
  enemyCount.dispatchEvent(new win.Event('change', { bubbles: true }));

  const nameInput = root.querySelector('[data-role="enemy-name-input"][data-enemy-index="1"]');
  assert.ok(nameInput);
  nameInput.value = 'Boss B';
  nameInput.dispatchEvent(new win.Event('change', { bubbles: true }));

  const fireRateInput = root.querySelector(
    '[data-role="enemy-damage-rate-input"][data-enemy-index="1"][data-damage-key="Fire"]'
  );
  assert.ok(fireRateInput);
  fireRateInput.value = '50';
  fireRateInput.dispatchEvent(new win.Event('change', { bubbles: true }));

  assert.equal(adapter.state.turnState.enemyState.enemyNamesByEnemy['1'], 'Boss B');
  assert.equal(adapter.state.turnState.enemyState.damageRatesByEnemy['1'].Fire, 50);
  assert.ok((root.querySelector('[data-role="enemy-status-target"]')?.textContent ?? '').includes('Boss B'));
});

test('enemy down-turn status can be applied and cleared from controls', () => {
  const store = getStore();
  const { root } = createRoot();
  const adapter = new BattleDomAdapter({ root, dataStore: store, initialSP: 10 });
  adapter.mount();

  const turns = root.querySelector('[data-role="enemy-status-turns"]');
  turns.value = '2';
  adapter.applyEnemyStatusFromDom();

  const statusesAfterApply = adapter.state.turnState.enemyState.statuses;
  assert.equal(statusesAfterApply.length, 2);
  assert.equal(statusesAfterApply.some((status) => status.statusType === 'DownTurn'), true);
  assert.equal(statusesAfterApply.some((status) => status.statusType === 'Break'), true);
  assert.equal(
    statusesAfterApply.find((status) => status.statusType === 'DownTurn')?.remainingTurns,
    2
  );
  assert.ok((root.querySelector('[data-role="enemy-status-list"]')?.textContent ?? '').includes('DownTurn(2)'));
  assert.ok((root.querySelector('[data-role="enemy-status-list"]')?.textContent ?? '').includes('Break'));

  adapter.clearEnemyStatusFromDom();
  assert.equal(adapter.state.turnState.enemyState.statuses.length, 1);
  assert.equal(adapter.state.turnState.enemyState.statuses[0].statusType, 'Break');
  assert.equal(root.querySelector('[data-role="enemy-status-list"]')?.textContent, 'Enemy Status: Enemy 1: Break');
});

test('enemy break status can be applied and cleared from controls', () => {
  const store = getStore();
  const { root } = createRoot();
  const adapter = new BattleDomAdapter({ root, dataStore: store, initialSP: 10 });
  adapter.mount();

  const typeSelect = root.querySelector('[data-role="enemy-status-type"]');
  const turns = root.querySelector('[data-role="enemy-status-turns"]');
  typeSelect.value = 'Break';
  turns.value = '3';
  adapter.applyEnemyStatusFromDom();

  const statusesAfterApply = adapter.state.turnState.enemyState.statuses;
  assert.equal(statusesAfterApply.length, 1);
  assert.equal(statusesAfterApply[0].statusType, 'Break');
  assert.equal(statusesAfterApply[0].remainingTurns, 0);
  assert.ok((root.querySelector('[data-role="enemy-status-list"]')?.textContent ?? '').includes('Break'));

  adapter.clearEnemyStatusFromDom();
  assert.equal(adapter.state.turnState.enemyState.statuses.length, 0);
  assert.equal(root.querySelector('[data-role="enemy-status-list"]')?.textContent, 'Enemy Status: -');
});

test('enemy dead status can be applied and cleared from controls', () => {
  const store = getStore();
  const { root } = createRoot();
  const adapter = new BattleDomAdapter({ root, dataStore: store, initialSP: 10 });
  adapter.mount();

  const typeSelect = root.querySelector('[data-role="enemy-status-type"]');
  typeSelect.value = 'Dead';
  adapter.applyEnemyStatusFromDom();

  const statusesAfterApply = adapter.state.turnState.enemyState.statuses;
  assert.equal(statusesAfterApply.length, 1);
  assert.equal(statusesAfterApply[0].statusType, 'Dead');
  assert.ok((root.querySelector('[data-role="enemy-status-list"]')?.textContent ?? '').includes('Dead'));

  adapter.clearEnemyStatusFromDom();
  assert.equal(adapter.state.turnState.enemyState.statuses.length, 0);
  assert.equal(root.querySelector('[data-role="enemy-status-list"]')?.textContent, 'Enemy Status: -');
});

test('enemy zone controls are shown only for field-holder enemies and apply enemy field state', () => {
  const store = getStore();
  const { root, win } = createRoot();
  const adapter = new BattleDomAdapter({ root, dataStore: store, initialSP: 10 });
  adapter.mount();

  const zoneControls = root.querySelector('[data-role="enemy-zone-controls"]');
  assert.equal(zoneControls?.hidden, true);

  const enabled = root.querySelector('[data-role="enemy-zone-enabled"][data-enemy-index="0"]');
  assert.ok(enabled);

  enabled.checked = true;
  enabled.dispatchEvent(new win.Event('change', { bubbles: true }));
  const type = root.querySelector('[data-role="enemy-zone-type"][data-enemy-index="0"]');
  const turns = root.querySelector('[data-role="enemy-zone-turns"][data-enemy-index="0"]');
  assert.ok(type);
  assert.ok(turns);
  type.value = 'Thunder';
  type.dispatchEvent(new win.Event('change', { bubbles: true }));
  const turnsAfterTypeChange = root.querySelector('[data-role="enemy-zone-turns"][data-enemy-index="0"]');
  assert.ok(turnsAfterTypeChange);
  turnsAfterTypeChange.value = '6';
  turnsAfterTypeChange.dispatchEvent(new win.Event('change', { bubbles: true }));

  assert.equal(zoneControls?.hidden, false);
  const sourceSelect = root.querySelector('[data-role="enemy-zone-source"]');
  assert.equal(sourceSelect?.value, '0');

  root.querySelector('[data-action="enemy-zone-apply"]')?.dispatchEvent(new win.Event('click', { bubbles: true }));

  assert.deepEqual(adapter.state.turnState.zoneState, {
    type: 'Thunder',
    sourceSide: 'enemy',
    remainingTurns: 6,
  });
  assert.equal(root.querySelector('[data-role="field-state-label"]')?.textContent, 'Field=Thunder(6) | Territory=-');
});

test('scenario runner loads setup and executes turns deterministically', () => {
  const store = getStore();
  const { root } = createRoot();
  const adapter = new BattleDomAdapter({ root, dataStore: store, initialSP: 10 });
  adapter.mount();

  const front = adapter.party.getFrontline();
  const scenario = {
    version: 1,
    setup: {
      enemyCount: 3,
      enemyNames: ['Enemy A', 'Enemy B', 'Enemy C'],
      enemyDamageRates: [{ Slash: 50 }, { Fire: 150 }, { Thunder: 75 }],
      initialOdGauge: 100,
      enemyStatuses: [{ statusType: 'DownTurn', targetIndex: 0, remainingTurns: 2 }],
      zoneState: { type: 'Fire', sourceSide: 'player', remainingTurns: 8 },
      territoryState: { type: 'ReviveTerritory', sourceSide: 'player', remainingTurns: null },
    },
    turns: [
      {
        preemptiveOdLevel: 1,
        actions: [
          { position: front[0].position + 1, skillId: front[0].getActionSkills()[0].skillId },
        ],
      },
      {
        actions: [
          { position: front[0].position + 1, skillId: front[0].getActionSkills()[0].skillId },
        ],
      },
    ],
  };

  root.querySelector('[data-role="scenario-json"]').value = JSON.stringify(scenario);
  adapter.loadScenarioFromDom();
  adapter.applyLoadedScenarioSetup();

  assert.equal(adapter.state.turnState.enemyState.enemyCount, 3);
  assert.deepEqual(adapter.state.turnState.enemyState.enemyNamesByEnemy, {
    0: 'Enemy A',
    1: 'Enemy B',
    2: 'Enemy C',
  });
  assert.deepEqual(adapter.state.turnState.enemyState.damageRatesByEnemy, {
    0: { Slash: 50 },
    1: { Fire: 150 },
    2: { Thunder: 75 },
  });
  assert.equal(adapter.state.turnState.enemyState.statuses.length, 1);
  assert.deepEqual(adapter.state.turnState.zoneState, {
    type: 'Fire',
    sourceSide: 'player',
    remainingTurns: 8,
  });
  assert.deepEqual(adapter.state.turnState.territoryState, {
    type: 'ReviveTerritory',
    sourceSide: 'player',
    remainingTurns: null,
  });

  adapter.runAllScenarioTurns();
  assert.equal(adapter.recordStore.records.length, 2);
  assert.equal(adapter.scenarioCursor, 2);
  assert.equal(
    adapter.state.turnState.enemyState.statuses.length,
    1,
    'enemy status should not tick during OD/EX commits without enemy turn consumption'
  );
});

test('turn plan base setup stores multi-enemy initial state from setup', () => {
  const store = getStore();
  const { root } = createRoot();
  const adapter = new BattleDomAdapter({ root, dataStore: store, initialSP: 10 });
  adapter.mount();

  const scenario = {
    version: 1,
    setup: {
      enemyCount: 3,
      enemyNames: ['Enemy A', 'Enemy B', 'Enemy C'],
      enemyDamageRates: [{ Slash: 50 }, { Fire: 150 }, { Thunder: 75 }],
      enemyStatuses: [{ statusType: 'DownTurn', targetIndex: 0, remainingTurns: 2 }],
      zoneState: { type: 'Fire', sourceSide: 'player', remainingTurns: 8 },
      territoryState: { type: 'ReviveTerritory', sourceSide: 'player', remainingTurns: null },
    },
    turns: [],
  };

  root.querySelector('[data-role="scenario-json"]').value = JSON.stringify(scenario);
  adapter.loadScenarioFromDom();
  adapter.applyLoadedScenarioSetup();

  assert.deepEqual(adapter.turnPlanBaseSetup.enemyNamesByEnemy, {
    0: 'Enemy A',
    1: 'Enemy B',
    2: 'Enemy C',
  });
  assert.deepEqual(adapter.turnPlanBaseSetup.damageRatesByEnemy, {
    0: { Slash: 50 },
    1: { Fire: 150 },
    2: { Thunder: 75 },
  });
  assert.deepEqual(adapter.turnPlanBaseSetup.enemyStatuses, [
    { statusType: 'DownTurn', targetIndex: 0, remainingTurns: 2 },
  ]);
  assert.deepEqual(adapter.turnPlanBaseSetup.zoneState, {
    type: 'Fire',
    sourceSide: 'player',
    remainingTurns: 8,
  });
  assert.deepEqual(adapter.turnPlanBaseSetup.territoryState, {
    type: 'ReviveTerritory',
    sourceSide: 'player',
    remainingTurns: null,
  });
});

test('reinitialize from turn plan base restores multi-enemy initial state', () => {
  const store = getStore();
  const { root, win } = createRoot();
  const adapter = new BattleDomAdapter({ root, dataStore: store, initialSP: 10 });
  adapter.mount();

  const enemyCount = root.querySelector('[data-role="enemy-count"]');
  enemyCount.value = '3';
  enemyCount.dispatchEvent(new win.Event('change', { bubbles: true }));
  adapter.applyScenarioEnemyNames(['Enemy A', 'Enemy B', 'Enemy C']);
  adapter.applyScenarioEnemyDamageRates([{ Slash: 50 }, { Fire: 150 }, { Thunder: 75 }]);
  adapter.state.turnState.zoneState = {
    type: 'Fire',
    sourceSide: 'player',
    remainingTurns: 8,
  };
  adapter.state.turnState.territoryState = {
    type: 'ReviveTerritory',
    sourceSide: 'player',
    remainingTurns: null,
  };
  const turns = root.querySelector('[data-role="enemy-status-turns"]');
  turns.value = '2';
  adapter.applyEnemyStatusFromDom();
  adapter.initializeBattle(undefined, { preserveTurnPlans: true });
  adapter.state.turnState.zoneState = {
    type: 'Fire',
    sourceSide: 'player',
    remainingTurns: 8,
  };
  adapter.state.turnState.territoryState = {
    type: 'ReviveTerritory',
    sourceSide: 'player',
    remainingTurns: null,
  };
  adapter.turnPlanBaseSetup.zoneState = structuredClone(adapter.state.turnState.zoneState);
  adapter.turnPlanBaseSetup.territoryState = structuredClone(adapter.state.turnState.territoryState);

  adapter.applyScenarioEnemyNames(['Changed A']);
  adapter.applyScenarioEnemyDamageRates([{ Slash: 999 }]);
  adapter.clearEnemyStatusFromDom();
  adapter.state.turnState.zoneState = null;
  adapter.state.turnState.territoryState = null;

  adapter.reinitializeFromTurnPlanBase();

  assert.deepEqual(adapter.state.turnState.enemyState.enemyNamesByEnemy, {
    0: 'Enemy A',
    1: 'Enemy B',
    2: 'Enemy C',
  });
  assert.deepEqual(adapter.state.turnState.enemyState.damageRatesByEnemy, {
    0: { Slash: 50 },
    1: { Fire: 150 },
    2: { Thunder: 75 },
  });
  assert.deepEqual(adapter.state.turnState.enemyState.statuses, [
    { statusType: 'Break', targetIndex: 0, remainingTurns: 0 },
    { statusType: 'DownTurn', targetIndex: 0, remainingTurns: 2 },
  ]);
  assert.deepEqual(adapter.state.turnState.zoneState, {
    type: 'Fire',
    sourceSide: 'player',
    remainingTurns: 8,
  });
  assert.deepEqual(adapter.state.turnState.territoryState, {
    type: 'ReviveTerritory',
    sourceSide: 'player',
    remainingTurns: null,
  });
});

test('scenario loader accepts exported CSV and converts it to runnable scenario', () => {
  const store = getStore();
  const { root } = createRoot();
  const adapter = new BattleDomAdapter({ root, dataStore: store, initialSP: 10 });
  adapter.mount();

  const front = adapter.party.getFrontline();
  const csv = [
    'seq,turn,od_turn,od_context,ex,od,transcendence,enemyAction,Pos1_position,Pos1_action',
    `1,1,OD1-1,preemptive,,0.00%,0%,,1,"${front[0].getActionSkills()[0].name} (SP 0) [Self,-hit]"`,
    `2,1,OD1-1,preemptive,ex,10.00%,0%,,1,"${front[0].getActionSkills()[0].name} (SP 0) [Self,-hit]"`,
  ].join('\n');

  root.querySelector('[data-role="scenario-json"]').value = csv;
  const scenario = adapter.loadScenarioFromDom();
  assert.equal(Array.isArray(scenario.turns), true);
  assert.equal(scenario.turns.length, 2);
  assert.equal(scenario.turns[0].preemptiveOdLevel, 1);
  assert.equal(scenario.turns[0].actions[0].actorName, 'Pos1');
  assert.equal(Array.isArray(scenario.setup.initialPositions), true);
  assert.equal(scenario.setup.initialPositions.length, 1);

  adapter.applyLoadedScenarioSetup();
  adapter.runAllScenarioTurns();
  assert.equal(adapter.recordStore.records.length, 2);
});

test('scenario run applies setup automatically when setup step is skipped', () => {
  const store = getStore();
  const { root } = createRoot();
  const adapter = new BattleDomAdapter({ root, dataStore: store, initialSP: 10 });
  adapter.mount();

  const front = adapter.party.getFrontline();
  const frontMember = front[0];
  const backMember =
    adapter.party.members
      .slice()
      .sort((a, b) => a.position - b.position)
      .find((member) => member.position >= 3) ?? null;
  assert.ok(backMember, 'expected at least one backline member');

  const scenario = {
    version: 1,
    setup: {
      initialPositions: [
        { characterName: frontMember.characterName, position: 4 },
        { characterName: backMember.characterName, position: 1 },
      ],
    },
    turns: [
      {
        actions: [{ actorName: backMember.characterName, skillId: backMember.getActionSkills()[0].skillId }],
      },
    ],
  };

  root.querySelector('[data-role="scenario-json"]').value = JSON.stringify(scenario);
  adapter.loadScenarioFromDom();
  adapter.runAllScenarioTurns();

  const movedFrontMember = adapter.findScenarioMemberByActorName(frontMember.characterName);
  const movedBackMember = adapter.findScenarioMemberByActorName(backMember.characterName);
  assert.equal(Number(movedFrontMember?.position), 3);
  assert.equal(Number(movedBackMember?.position), 0);
  assert.equal(adapter.scenarioCursor, 1);
  assert.equal(adapter.recordStore.records.length, 1);
});

test('scenario loader reconstructs swaps from CSV position transitions', () => {
  const store = getStore();
  const { root } = createRoot();
  const adapter = new BattleDomAdapter({ root, dataStore: store, initialSP: 10 });
  adapter.mount();

  const csv = [
    'seq,turn,od_turn,od_context,ex,od,transcendence,enemyAction,A_position,A_action,B_position,B_action',
    '1,1,,,,0.00%,0%,,1,-,2,-',
    '2,1,,,,0.00%,0%,,2,-,1,-',
  ].join('\n');

  root.querySelector('[data-role="scenario-json"]').value = csv;
  const scenario = adapter.loadScenarioFromDom();
  assert.equal(scenario.turns.length, 2);
  assert.deepEqual(scenario.turns[0].swaps, [{ from: 1, to: 2 }]);
});

test('scenario action resolves actor by actorName before position', () => {
  const store = getStore();
  const { root } = createRoot();
  const adapter = new BattleDomAdapter({ root, dataStore: store, initialSP: 10 });
  adapter.mount();

  const members = Array.from({ length: 6 }, (_, idx) =>
    new CharacterStyle({
      characterId: `ACT${idx + 1}`,
      characterName: `Actor${idx + 1}`,
      styleId: idx + 1,
      styleName: `Style${idx + 1}`,
      partyIndex: idx,
      position: idx,
      initialSP: 10,
      skills: [{ id: 900000 + idx, name: `Skill${idx + 1}`, label: `Skill${idx + 1}`, sp_cost: 0 }],
    })
  );

  const party = new Party(members);
  party.swap(0, 1);
  adapter.party = party;
  adapter.state = createBattleStateFromParty(adapter.party);
  adapter.renderActionSelectors();

  assert.doesNotThrow(() =>
    adapter.setScenarioActionOnDom({
      actorName: 'Actor1',
      position: 1,
      skillName: 'Skill1',
    })
  );
});

test('scenario can stage current turn without commit and advance cursor on manual commit', () => {
  const store = getStore();
  const { root } = createRoot();
  const adapter = new BattleDomAdapter({ root, dataStore: store, initialSP: 10 });
  adapter.mount();

  const front = adapter.party.getFrontline();
  const firstMember = front[0];
  const firstSkill = firstMember.getActionSkills()[0];
  adapter.scenario = {
    version: 1,
    setup: {},
    turns: [
      {
        actions: [{ actorName: firstMember.characterName, skillId: firstSkill.skillId }],
      },
    ],
  };
  adapter.scenarioCursor = 0;
  adapter.scenarioStagedTurnIndex = null;

  adapter.stageCurrentScenarioTurn();
  assert.equal(adapter.scenarioCursor, 0);
  assert.equal(adapter.scenarioStagedTurnIndex, 0);
  const actionSelect = root.querySelector(`[data-action-slot="${firstMember.position}"]`);
  assert.equal(Number(actionSelect?.value), Number(firstSkill.skillId));

  adapter.commitCurrentTurn();
  assert.equal(adapter.scenarioCursor, 1);
  assert.equal(adapter.scenarioStagedTurnIndex, null);
});

test('scenario ignores preemptiveOdLevel when current turn is not normal (OD/EX continuation)', () => {
  const store = getStore();
  const { root } = createRoot();
  const adapter = new BattleDomAdapter({ root, dataStore: store, initialSP: 10 });
  adapter.mount();

  const front = adapter.party.getFrontline();
  const actor = front[0];
  const actionSkill = actor.getActionSkills()[0];

  // Ensure we can activate OD3 once, remain in OD turn, then run next turn without retrying preemptive OD.
  adapter.state.turnState.odGauge = 300;
  adapter.scenario = {
    version: 1,
    setup: {},
    turns: [
      {
        preemptiveOdLevel: 3,
        actions: [{ actorName: actor.characterName, skillId: actionSkill.skillId }],
      },
      {
        preemptiveOdLevel: 1,
        actions: [{ actorName: actor.characterName, skillId: actionSkill.skillId }],
      },
    ],
  };
  adapter.scenarioSetupApplied = true;
  adapter.scenarioCursor = 0;

  assert.doesNotThrow(() => adapter.runNextScenarioTurn());
  assert.equal(adapter.state.turnState.turnType, 'od');
  assert.doesNotThrow(() => adapter.runNextScenarioTurn());
  assert.equal(adapter.scenarioCursor, 2);
});

test('OD controls: preemptive activation and interrupt reservation/commit', () => {
  const store = getStore();
  const { root } = createRoot();
  const adapter = new BattleDomAdapter({ root, dataStore: store, initialSP: 10 });
  adapter.mount();

  const interruptButton = root.querySelector('[data-action="open-interrupt-od"]');
  assert.equal(interruptButton.hidden, false, 'interrupt button should be visible in normal/extra turn');

  adapter.state.turnState.odGauge = 120;
  adapter.renderTurnStatus();
  assert.equal(interruptButton.hidden, false, 'interrupt button should remain visible');

  adapter.openOdDialog('normal');
  adapter.confirmOdDialog('normal');
  assert.equal(adapter.state.turnState.turnType, 'od');
  assert.equal(adapter.state.turnState.odGauge, 20);
  adapter.closeOdDialog('normal');
  assert.equal(adapter.state.turnState.turnType, 'normal');
  assert.equal(adapter.state.turnState.odGauge, 120, 'cancel should restore consumed gauge');

  // reset and test interrupt path
  adapter.initializeBattle();
  adapter.state.turnState.odGauge = 150;
  adapter.renderTurnStatus();
  adapter.openOdDialog('interrupt');
  const interruptSelect = root.querySelector('[data-role="interrupt-od-level"]');
  interruptSelect.value = '1';
  adapter.confirmOdDialog('interrupt');

  adapter.commitCurrentTurn();
  assert.equal(adapter.state.turnState.turnType, 'od');
  assert.equal(adapter.state.turnState.odContext, 'interrupt');
  assert.equal(adapter.state.turnState.odGauge < 150, true);
  assert.equal(adapter.state.turnState.turnIndex, 1);
});

test('passive log panel shows triggered passive descriptions on OD start', () => {
  const store = getStore();
  const { root } = createRoot();
  const adapter = new BattleDomAdapter({ root, dataStore: store, initialSP: 10 });
  adapter.mount();

  adapter.initializeBattle([
    1001408,
    ...getSixUsableStyleIds(store)
      .filter((id) => store.getStyleById(id)?.chara_label !== 'TTojo')
      .slice(0, 5),
  ]);
  adapter.state.turnState.odGauge = 120;

  adapter.openOdDialog('normal');
  adapter.confirmOdDialog('normal');

  const text = root.querySelector('[data-role="passive-log-output"]')?.textContent ?? '';
  assert.equal(text.includes('OD1-1'), true);
  assert.equal(text.includes('東城 つかさ') || text.includes('TTojo'), true);
  assert.equal(text.includes('オーバードライブ中 ダメージアップ'), true);
});

test('normal OD dialog stays visible while interrupt OD dialog is toggled', () => {
  const store = getStore();
  const { root, win } = createRoot();
  const adapter = new BattleDomAdapter({ root, dataStore: store, initialSP: 10 });
  adapter.mount();

  adapter.state.turnState.odGauge = 280;
  adapter.renderTurnStatus();
  setFrontlineNormalAttackSelections(adapter, root, win);

  const normalDialog = root.querySelector('[data-role="od-dialog"]');
  const interruptDialog = root.querySelector('[data-role="interrupt-od-dialog"]');
  assert.equal(normalDialog.hidden, false);
  assert.equal(interruptDialog.hidden, true);

  adapter.openOdDialog('interrupt');
  assert.equal(normalDialog.hidden, false);
  assert.equal(interruptDialog.hidden, false);

  adapter.closeOdDialog('interrupt');
  assert.equal(normalDialog.hidden, false);
  assert.equal(interruptDialog.hidden, true);
});

test('interrupt OD projected gauge allows OD3 reservation at initial 280% with three normal attacks', () => {
  const store = getStore();
  const { root, win } = createRoot();
  const adapter = new BattleDomAdapter({ root, dataStore: store, initialSP: 10 });
  adapter.mount();

  adapter.state.turnState.odGauge = 280;
  adapter.renderTurnStatus();
  setFrontlineNormalAttackSelections(adapter, root, win);

  const projection = root.querySelector('[data-role="interrupt-od-projection"]');
  adapter.openOdDialog('interrupt');
  const interruptSelect = root.querySelector('[data-role="interrupt-od-level"]');
  const options = [...interruptSelect.options].map((option) => String(option.value));
  assert.equal(options.includes('3'), true);
  assert.equal((projection?.textContent ?? '').includes('300.00%'), true);

  interruptSelect.value = '3';
  adapter.confirmOdDialog('interrupt');
  adapter.commitCurrentTurn();

  assert.equal(adapter.state.turnState.turnType, 'od');
  assert.equal(adapter.state.turnState.odContext, 'interrupt');
  assert.equal(adapter.state.turnState.turnLabel, 'OD3-1');
});

test('interrupt OD projected gauge allows OD1 from thunder party at initial 0%', () => {
  const store = getStore();
  const { root, win } = createRoot();
  const adapter = new BattleDomAdapter({ root, dataStore: store, initialSP: 10 });
  adapter.mount();

  // 雷6人編成 (超越初期値90) + InitialOD=0
  adapter.initializeBattle([1001107, 1001205, 1001308, 1010204, 1001706, 1002104], {
    initialOdGauge: 0,
  });
  setFrontlineNormalAttackSelections(adapter, root, win);

  adapter.openOdDialog('interrupt');
  const interruptSelect = root.querySelector('[data-role="interrupt-od-level"]');
  const options = [...interruptSelect.options].map((option) => String(option.value));
  assert.deepEqual(options, ['1']);
  assert.equal(Number(adapter.interruptOdProjection?.projectedGauge) >= 100, true);
});

test('interrupt OD projection includes token-based OD gain from 真夏のひんやりショック！', () => {
  const store = getStore();
  const { root, win } = createRoot();
  const adapter = new BattleDomAdapter({ root, dataStore: store, initialSP: 10 });
  adapter.mount();

  const muStyle = store.styles.find((style) =>
    Array.isArray(style?.skills) && style.skills.some((skill) => Number(skill?.id) === 46006609)
  );
  assert.ok(muStyle);
  const others = getSixUsableStyleIds(store).filter((id) => Number(id) !== Number(muStyle.id));
  adapter.initializeBattle([Number(muStyle.id), ...others.slice(0, 5)], {
    skillSetsByPartyIndex: {
      0: [46006609],
    },
    initialOdGauge: 60,
  });
  adapter.state.party[0].tokenState.current = 4;
  adapter.renderPartyState();

  const actionSelect = root.querySelector('[data-action-slot="0"]');
  assert.ok(actionSelect);
  actionSelect.value = '46006609';
  actionSelect.dispatchEvent(new win.Event('change', { bubbles: true }));

  adapter.openOdDialog('interrupt');
  const interruptSelect = root.querySelector('[data-role="interrupt-od-level"]');
  const options = [...interruptSelect.options].map((option) => String(option.value));

  assert.deepEqual(options, ['1']);
  assert.equal(Number(adapter.interruptOdProjection?.projectedGauge) >= 100, true);
});

test('interrupt OD projection is cleared when selected action changes before reservation', () => {
  const store = getStore();
  const { root, win } = createRoot();
  const adapter = new BattleDomAdapter({ root, dataStore: store, initialSP: 10 });
  adapter.mount();

  adapter.state.turnState.odGauge = 280;
  adapter.renderTurnStatus();
  setFrontlineNormalAttackSelections(adapter, root, win);

  adapter.openOdDialog('interrupt');
  assert.equal(Number(adapter.interruptOdProjection?.projectedGauge) > 0, true);

  const dialog = root.querySelector('[data-role="interrupt-od-dialog"]');
  const projection = root.querySelector('[data-role="interrupt-od-projection"]');
  assert.equal(projection.hidden, false);
  const firstSelect = root.querySelector('[data-action-slot]');
  const alternative = [...firstSelect.options].find((option) => option.value !== firstSelect.value);
  if (!alternative) {
    return;
  }
  firstSelect.value = String(alternative.value);
  firstSelect.dispatchEvent(new win.Event('change', { bubbles: true }));

  assert.equal(adapter.interruptOdProjection, null);
  assert.equal(dialog.hidden, true);
  assert.equal((projection?.textContent ?? '').trim(), '');
  assert.equal(projection.hidden, true);
});

test('interrupt OD projection is hidden when dialog is closed after reservation', () => {
  const store = getStore();
  const { root, win } = createRoot();
  const adapter = new BattleDomAdapter({ root, dataStore: store, initialSP: 10 });
  adapter.mount();

  adapter.state.turnState.odGauge = 280;
  adapter.renderTurnStatus();
  setFrontlineNormalAttackSelections(adapter, root, win);

  const openButton = root.querySelector('[data-action="open-interrupt-od"]');
  const projection = root.querySelector('[data-role="interrupt-od-projection"]');
  const dialog = root.querySelector('[data-role="interrupt-od-dialog"]');
  adapter.openOdDialog('interrupt');

  assert.equal(dialog.hidden, false);
  assert.equal(openButton.hidden, false);
  assert.equal(projection.hidden, false);

  const interruptSelect = root.querySelector('[data-role="interrupt-od-level"]');
  interruptSelect.value = '1';
  adapter.confirmOdDialog('interrupt');

  assert.equal(dialog.hidden, true);
  assert.equal(openButton.hidden, false);
  assert.equal(projection.hidden, true);
});

test('interrupt OD dialog is hidden when projection state is missing', () => {
  const store = getStore();
  const { root, win } = createRoot();
  const adapter = new BattleDomAdapter({ root, dataStore: store, initialSP: 10 });
  adapter.mount();

  const dialog = root.querySelector('[data-role="interrupt-od-dialog"]');
  const openButton = root.querySelector('[data-action="open-interrupt-od"]');
  assert.equal(dialog.hidden, true);

  adapter.state.turnState.odGauge = 280;
  adapter.renderTurnStatus();
  setFrontlineNormalAttackSelections(adapter, root, win);
  adapter.openOdDialog('interrupt');
  assert.equal(dialog.hidden, false);

  // 見込み状態が失われた場合は、ダイアログ表示を維持しない
  adapter.interruptOdProjection = null;
  adapter.renderOdControls();

  assert.equal(dialog.hidden, true);
  assert.equal(openButton.hidden, false);
});

test('interrupt OD button stays visible and disabled when state is missing', () => {
  const store = getStore();
  const { root } = createRoot();
  const adapter = new BattleDomAdapter({ root, dataStore: store, initialSP: 10 });
  adapter.mount();

  adapter.state = null;
  adapter.renderOdControls();

  const openButton = root.querySelector('[data-action="open-interrupt-od"]');
  assert.equal(openButton.hidden, false);
  assert.equal(openButton.disabled, true);
});

test('interrupt OD button is shown in extra turn', () => {
  const store = getStore();
  const { root } = createRoot();
  const adapter = new BattleDomAdapter({ root, dataStore: store, initialSP: 10 });
  adapter.mount();

  const exCharacterId = adapter.state.party.find((member) => member.position === 0)?.characterId;
  adapter.state = grantExtraTurn(adapter.state, [exCharacterId]);
  adapter.renderTurnStatus();

  const interruptButton = root.querySelector('[data-action="open-interrupt-od"]');
  assert.equal(interruptButton.hidden, false);
});

test('turn label shows transcendence gauge only when transcendence style is in party', () => {
  const store = getStore();
  const { root } = createRoot();
  const adapter = new BattleDomAdapter({ root, dataStore: store, initialSP: 10 });
  adapter.mount();

  const label = root.querySelector('[data-role="turn-label"]');
  assert.equal((label?.textContent ?? '').includes('超越=-'), true);

  const transcendenceRule = store.listTranscendenceRules()[0] ?? null;
  if (!transcendenceRule) {
    return;
  }

  const targetStyle = store.getStyleById(Number(transcendenceRule.styleId));
  if (!targetStyle) {
    return;
  }
  const targetCharaLabel = String(targetStyle.chara_label ?? '');
  const others = getSixUsableStyleIds(store).filter((id) => {
    const style = store.getStyleById(Number(id));
    if (!style) {
      return false;
    }
    return String(style.chara_label ?? '') !== targetCharaLabel;
  });
  adapter.initializeBattle([Number(transcendenceRule.styleId), ...others.slice(0, 5)]);
  assert.equal((label?.textContent ?? '').includes('超越='), true);
});

test('turn label keeps base turn and marks ex-turn separately', () => {
  const store = getStore();
  const { root } = createRoot();
  const adapter = new BattleDomAdapter({ root, dataStore: store, initialSP: 10 });
  adapter.mount();

  const exCharacterId = adapter.state.party.find((member) => member.position === 0)?.characterId;
  adapter.state = grantExtraTurn(adapter.state, [exCharacterId]);
  adapter.renderTurnStatus();

  const label = root.querySelector('[data-role="turn-label"]')?.textContent ?? '';
  assert.equal(label.includes(' | T01 | '), true);
  assert.equal(label.includes(' | EX | '), true);
});

test('turn label shows OD turn in dedicated column while in OD turn', () => {
  const store = getStore();
  const { root } = createRoot();
  const adapter = new BattleDomAdapter({ root, dataStore: store, initialSP: 10 });
  adapter.mount();

  adapter.state.turnState.odGauge = 100;
  adapter.openOdDialog('normal');
  adapter.confirmOdDialog('normal');
  adapter.renderTurnStatus();

  const label = root.querySelector('[data-role="turn-label"]')?.textContent ?? '';
  assert.equal(/\|\s*OD1-1\s+\|/.test(label), true);
});

test('turn label keeps OD turn visible during OD-suspended extra turn', () => {
  const store = getStore();
  const { root } = createRoot();
  const adapter = new BattleDomAdapter({ root, dataStore: store, initialSP: 10 });
  adapter.mount();

  adapter.state.turnState.turnType = 'extra';
  adapter.state.turnState.turnLabel = 'EX';
  adapter.state.turnState.turnIndex = 2;
  adapter.state.turnState.odLevel = 3;
  adapter.state.turnState.remainingOdActions = 2;
  adapter.state.turnState.odSuspended = true;
  adapter.renderTurnStatus();

  const label = root.querySelector('[data-role="turn-label"]')?.textContent ?? '';
  assert.equal(label.includes('| T02 |'), true);
  assert.equal(label.includes('| OD3-1 '), true);
  assert.equal(label.includes('| EX |'), true);
});

test('turn label keeps OD1-1 visible during od-suspended extra turn with remaining=0', () => {
  const store = getStore();
  const { root } = createRoot();
  const adapter = new BattleDomAdapter({ root, dataStore: store, initialSP: 10 });
  adapter.mount();

  adapter.state.turnState.turnType = 'extra';
  adapter.state.turnState.turnLabel = 'EX';
  adapter.state.turnState.turnIndex = 1;
  adapter.state.turnState.odLevel = 1;
  adapter.state.turnState.remainingOdActions = 0;
  adapter.state.turnState.odSuspended = true;
  adapter.renderTurnStatus();

  const label = root.querySelector('[data-role="turn-label"]')?.textContent ?? '';
  assert.equal(label.includes('| T01 |'), true);
  assert.equal(label.includes('| OD1-1 '), true);
  assert.equal(label.includes('| EX |'), true);
});

test('action selector displays SP ALL for sp_cost -1 skills', () => {
  const store = getStore();
  const { root } = createRoot();
  const adapter = new BattleDomAdapter({ root, dataStore: store, initialSP: 10 });
  adapter.mount();

  const members = Array.from({ length: 6 }, (_, idx) =>
    new CharacterStyle({
      characterId: `C${idx + 1}`,
      characterName: `C${idx + 1}`,
      styleId: idx + 1,
      styleName: `S${idx + 1}`,
      partyIndex: idx,
      position: idx,
      initialSP: 10,
      skills:
        idx === 0
          ? [{ id: 777001, name: 'Trinity Blazing', label: 'TB', sp_cost: -1, consume_type: 'Sp' }]
          : [{ id: 777100 + idx, name: 'Normal', label: `N${idx}`, sp_cost: 0, consume_type: 'Sp' }],
    })
  );

  adapter.party = new Party(members);
  adapter.state = createBattleStateFromParty(adapter.party);
  adapter.renderActionSelectors();

  const select = root.querySelector('[data-action-slot="0"]');
  const text = select?.options?.[0]?.textContent ?? '';
  assert.equal(text.includes('SP ALL'), true);
});

test('action selector displays Token cost for token consume skills', () => {
  const store = getStore();
  const { root } = createRoot();
  const adapter = new BattleDomAdapter({ root, dataStore: store, initialSP: 10 });
  adapter.mount();

  const members = Array.from({ length: 6 }, (_, idx) =>
    new CharacterStyle({
      characterId: `TK${idx + 1}`,
      characterName: `TK${idx + 1}`,
      styleId: idx + 1,
      styleName: `TKS${idx + 1}`,
      partyIndex: idx,
      position: idx,
      initialSP: 10,
      skills:
        idx === 0
          ? [{ id: 777002, name: 'Token Burst', label: 'TB2', sp_cost: 5, consume_type: 'Token' }]
          : [{ id: 777200 + idx, name: 'Normal', label: `N2${idx}`, sp_cost: 0, consume_type: 'Sp' }],
    })
  );

  adapter.party = new Party(members);
  adapter.state = createBattleStateFromParty(adapter.party);
  adapter.renderActionSelectors();

  const select = root.querySelector('[data-action-slot="0"]');
  const text = select?.options?.[0]?.textContent ?? '';
  assert.equal(text.includes('Token 5'), true);
  assert.equal(text.includes('SP 5'), false);
});

test('action selector shows target selector for non-HealSp AllySingle skills', () => {
  const store = getStore();
  const { root } = createRoot();
  const adapter = new BattleDomAdapter({ root, dataStore: store, initialSP: 10 });
  adapter.mount();

  const members = Array.from({ length: 6 }, (_, idx) =>
    new CharacterStyle({
      characterId: `T${idx + 1}`,
      characterName: `T${idx + 1}`,
      styleId: idx + 1,
      styleName: `TS${idx + 1}`,
      partyIndex: idx,
      position: idx,
      initialSP: 10,
      skills:
        idx === 0
          ? [
              {
                id: 778001,
                name: 'Single Target Buff',
                label: 'STB',
                sp_cost: 0,
                consume_type: 'Sp',
                parts: [{ skill_type: 'AttackUp', target_type: 'AllySingleWithoutSelf' }],
              },
            ]
          : [{ id: 778100 + idx, name: 'Normal', label: `N${idx}`, sp_cost: 0, consume_type: 'Sp' }],
    })
  );

  adapter.party = new Party(members);
  adapter.state = createBattleStateFromParty(adapter.party);
  adapter.renderActionSelectors();

  const targetSelect = root.querySelector('[data-action-target-slot="0"]');
  assert.ok(targetSelect);
  assert.notEqual(targetSelect.style.display, 'none');
  assert.equal(targetSelect.options.length, 5);
});

test('kishinka button is shown for Tezuka and activates reinforced state', () => {
  const store = getStore();
  const { root } = createRoot();
  const adapter = new BattleDomAdapter({ root, dataStore: store, initialSP: 10 });
  adapter.mount();

  const tezukaStyle = store.styles.find((style) => String(style.chara_label ?? '') === 'STezuka');
  if (!tezukaStyle) {
    return;
  }

  const others = getSixUsableStyleIds(store).filter((id) => Number(id) !== Number(tezukaStyle.id));
  adapter.initializeBattle([Number(tezukaStyle.id), ...others.slice(0, 5)]);

  const button = root.querySelector('[data-action="kishinka"]');
  const badge = root.querySelector('[data-role="kishinka-state"]');
  assert.equal(button.hidden, false);

  adapter.state.turnState.odGauge = 0;
  button.click();
  const tezuka = adapter.state.party.find((m) => m.characterId === 'STezuka');
  assert.equal(tezuka?.isReinforcedMode, true);
  assert.equal(button.disabled, true, 'kishinka button should be disabled while reinforced');
  assert.equal(adapter.state.turnState.odGauge, 15);
  assert.equal((badge?.textContent ?? '').includes('鬼神化中'), true);
});

test('action selector hit label shows base+funnel while reinforced', () => {
  const store = getStore();
  const { root } = createRoot();
  const adapter = new BattleDomAdapter({ root, dataStore: store, initialSP: 10 });
  adapter.mount();

  const tezukaStyle = store.styles.find((style) => String(style.chara_label ?? '') === 'STezuka');
  if (!tezukaStyle) {
    return;
  }
  const others = getSixUsableStyleIds(store).filter((id) => Number(id) !== Number(tezukaStyle.id));
  adapter.initializeBattle([Number(tezukaStyle.id), ...others.slice(0, 5)]);

  // 鬼神化で Funnel(+3) が付く
  const button = root.querySelector('[data-action="kishinka"]');
  button.click();

  const select = root.querySelector('[data-action-slot="0"]');
  const hasFunnelHitLabel = [...select.options].some((opt) => /Hit\s+\d+\+3\b/.test(opt.textContent));
  assert.equal(hasFunnelHitLabel, true);
  const hasSpZeroCost = [...select.options].some((opt) => /\(SP 0 \/ Hit /.test(opt.textContent));
  assert.equal(hasSpZeroCost, true);
});

test('initialize battle applies manually entered initial OD gauge', () => {
  const store = getStore();
  const { root } = createRoot();
  const adapter = new BattleDomAdapter({ root, dataStore: store, initialSP: 10 });
  adapter.mount();

  const input = root.querySelector('[data-role="initial-od-gauge"]');
  input.value = '-123.45';
  adapter.initializeBattle();
  assert.equal(adapter.state.turnState.odGauge, -123.45);

  input.value = '-5000';
  adapter.initializeBattle();
  assert.equal(adapter.state.turnState.odGauge, -999.99);

  input.value = '5000';
  adapter.initializeBattle();
  assert.equal(adapter.state.turnState.odGauge, 300);
});

test('initialize battle applies start SP base + equip bonus per slot', () => {
  const store = getStore();
  const { root, win } = createRoot();
  const adapter = new BattleDomAdapter({ root, dataStore: store, initialSP: 3 });
  adapter.mount();

  const slot0 = root.querySelector('[data-role="start-sp-equip-select"][data-slot="0"]');
  const slot1 = root.querySelector('[data-role="start-sp-equip-select"][data-slot="1"]');
  slot0.value = '3';
  slot1.value = '1';
  slot0.dispatchEvent(new win.Event('change', { bubbles: true }));
  slot1.dispatchEvent(new win.Event('change', { bubbles: true }));

  adapter.initializeBattle([1001101, 1001201, 1001301, 1001401, 1001501, 1001701]);

  const member0 = adapter.party.members.find((m) => m.partyIndex === 0);
  const member1 = adapter.party.members.find((m) => m.partyIndex === 1);
  const member2 = adapter.party.members.find((m) => m.partyIndex === 2);
  assert.equal(member0.sp.current, 6);
  assert.equal(member1.sp.current, 4);
  assert.equal(member2.sp.current, 6);
});

test('initialize battle applies selected normal attack belt to party member', () => {
  const store = getStore();
  const { root, win } = createRoot();
  const adapter = new BattleDomAdapter({ root, dataStore: store, initialSP: 10 });
  adapter.mount();

  const beltSelect = root.querySelector('[data-role="normal-attack-belt-select"][data-slot="0"]');
  assert.ok(beltSelect);
  beltSelect.value = 'Fire';
  beltSelect.dispatchEvent(new win.Event('change', { bubbles: true }));

  adapter.initializeBattle();

  assert.deepEqual(adapter.party.members[0].normalAttackElements, ['Fire']);
  assert.match(
    root.querySelector('[data-role="slot-summary"][data-slot="0"]')?.textContent ?? '',
    /通常攻撃属性: 火/
  );
});

test('initialize battle applies 閃光 to frontline initial SP', () => {
  const store = getStore();
  const { root } = createRoot();
  const adapter = new BattleDomAdapter({ root, dataStore: store, initialSP: 3 });
  adapter.mount();

  adapter.initializeBattle(
    [1001108, 1001201, 1001301, 1001401, 1001501, 1001701],
    {
      limitBreakLevelsByPartyIndex: { 0: 1 },
      startSpEquipByPartyIndex: { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
    }
  );

  const flashHolder = adapter.party.members.find((m) => m.partyIndex === 0);
  const nonPassiveFront = adapter.party.members.find((m) => m.partyIndex === 1);
  assert.equal(flashHolder.sp.current, 4, 'frontline 閃光 should add +1 at battle init');
  assert.equal(nonPassiveFront.sp.current, 3, 'member without turn-start passive should stay at base');
});

test('selection state can be saved and loaded from localStorage slots', () => {
  const store = getStore();
  const { root, win } = createRoot();
  win.confirm = () => true;
  const adapter = new BattleDomAdapter({ root, dataStore: store, initialSP: 10 });
  adapter.mount();

  const slot = 0;
  const characterSelect = root.querySelector(`[data-role="character-select"][data-slot="${slot}"]`);
  const styleSelect = root.querySelector(`[data-role="style-select"][data-slot="${slot}"]`);
  const lbSelect = root.querySelector(`[data-role="limit-break-select"][data-slot="${slot}"]`);
  const driveSelect = root.querySelector(`[data-role="drive-pierce-select"][data-slot="${slot}"]`);
  const startSpEquipSelect = root.querySelector(
    `[data-role="start-sp-equip-select"][data-slot="${slot}"]`
  );
  const motivationSelect = root.querySelector(`[data-role="motivation-select"][data-slot="${slot}"]`);
  const saveSlotSelect = root.querySelector('[data-role="selection-slot-select"]');

  characterSelect.value = 'RKayamori';
  characterSelect.dispatchEvent(new win.Event('change', { bubbles: true }));
  styleSelect.value = '1001108'; // The Feel of the Throne (SSR)
  styleSelect.dispatchEvent(new win.Event('change', { bubbles: true }));
  lbSelect.value = '1';
  lbSelect.dispatchEvent(new win.Event('change', { bubbles: true }));
  driveSelect.value = '12';
  driveSelect.dispatchEvent(new win.Event('change', { bubbles: true }));
  startSpEquipSelect.value = '3';
  startSpEquipSelect.dispatchEvent(new win.Event('change', { bubbles: true }));
  motivationSelect.value = '5';
  motivationSelect.dispatchEvent(new win.Event('change', { bubbles: true }));

  const skillChecks = [...root.querySelectorAll(`[data-role="skill-check"][data-slot="${slot}"]`)];
  const target = skillChecks.find((box) => {
    const text = box.closest('label')?.textContent ?? '';
    return text.includes('エクシード・ルミナンス');
  });
  if (target) {
    target.checked = false;
    target.dispatchEvent(new win.Event('change', { bubbles: true }));
  }

  saveSlotSelect.value = '2';
  adapter.saveSelectionToSlot(2);

  characterSelect.value = 'TTojo';
  characterSelect.dispatchEvent(new win.Event('change', { bubbles: true }));

  adapter.loadSelectionFromSlot(2);

  assert.equal(characterSelect.value, 'RKayamori');
  assert.equal(styleSelect.value, '1001108');
  assert.equal(lbSelect.value, '1');
  assert.equal(driveSelect.value, '12');
  assert.equal(startSpEquipSelect.value, '3');
  assert.equal(motivationSelect.value, '5');
  if (target) {
    const restored = [...root.querySelectorAll(`[data-role="skill-check"][data-slot="${slot}"]`)].find(
      (box) => (box.closest('label')?.textContent ?? '').includes('エクシード・ルミナンス')
    );
    assert.equal(restored?.checked, false, 'skill checkbox state should be restored');
  }

  const preview = root.querySelector('[data-role="selection-slot-preview"]').textContent ?? '';
  assert.ok(preview.includes('savedAt:'), 'preview should show saved timestamp');
  assert.ok(preview.includes('P1:'), 'preview should show party lines');
  assert.ok(preview.includes('Motivation=絶好調(5)'), 'preview should include saved motivation');
  const summary = root.querySelector('[data-role="selection-summary"]').textContent ?? '';
  assert.ok(summary.includes('やる気=絶好調(5)'), 'summary should include selected motivation');
});

test('initialize battle applies selected motivation and preserves it in turn plan base setup', () => {
  const store = getStore();
  const { root, win } = createRoot();
  const adapter = new BattleDomAdapter({ root, dataStore: store, initialSP: 10 });
  adapter.mount();

  const motivation0 = root.querySelector('[data-role="motivation-select"][data-slot="0"]');
  const motivation1 = root.querySelector('[data-role="motivation-select"][data-slot="1"]');
  motivation0.value = '5';
  motivation0.dispatchEvent(new win.Event('change', { bubbles: true }));
  motivation1.value = '1';
  motivation1.dispatchEvent(new win.Event('change', { bubbles: true }));

  adapter.initializeBattle();

  assert.equal(adapter.party.members[0].motivationState.current, 5);
  assert.equal(adapter.party.members[1].motivationState.current, 1);
  assert.equal(adapter.turnPlanBaseSetup.initialMotivationByPartyIndex['0'], 5);
  assert.equal(adapter.turnPlanBaseSetup.initialMotivationByPartyIndex['1'], 1);

  const partyState = root.querySelector('[data-role="party-state"]').textContent ?? '';
  assert.ok(partyState.includes('Motivation=絶好調(5)'));
  assert.ok(partyState.includes('Motivation=絶不調(1)'));
});

test('save/load button honors confirm dialog cancellation', () => {
  const store = getStore();
  const { root, win } = createRoot();
  let confirmCalls = 0;
  win.confirm = () => {
    confirmCalls += 1;
    return false;
  };
  const adapter = new BattleDomAdapter({ root, dataStore: store, initialSP: 10 });
  adapter.mount();

  root.querySelector('[data-action="save-selection"]').click();
  root.querySelector('[data-action="load-selection"]').click();

  assert.equal(confirmCalls >= 2, true, 'confirm should be called for save and load');
  const status = root.querySelector('[data-role="status"]').textContent ?? '';
  assert.ok(status.includes('canceled'), 'status should report cancellation');
});

test('mount auto-saves to slot 0 without overwriting manual slots', () => {
  const store = getStore();
  const { root, win } = createRoot();
  const storageKey = 'hbr.battle_simulator.selection_slots.v1';
  const preSaved = {
    schemaVersion: 1,
    slots: Array(11).fill(null),
  };
  preSaved.slots[1] = {
    schemaVersion: 1,
    savedAt: '2000-01-01T00:00:00.000Z',
    partySelections: [],
    extras: { sentinel: true },
  };
  win.localStorage.setItem(storageKey, JSON.stringify(preSaved));

  const adapter = new BattleDomAdapter({ root, dataStore: store, initialSP: 10 });
  adapter.mount();

  const after = JSON.parse(win.localStorage.getItem(storageKey));
  assert.equal(typeof after?.slots?.[0]?.savedAt, 'string', 'slot 0 should be auto-saved on mount');
  assert.equal(after?.slots?.[1]?.savedAt, '2000-01-01T00:00:00.000Z');
  assert.equal(after?.slots?.[1]?.extras?.sentinel, true);
});

test('dom adapter applies swap immediately and keeps swap event for commit record', () => {
  const store = getStore();
  const { root } = createRoot();
  const adapter = new BattleDomAdapter({ root, dataStore: store, initialSP: 10 });

  const styleIds = getSixUsableStyleIds(store);
  adapter.initializeBattle(styleIds);
  const beforePos0 = adapter.state.party.find((m) => m.position === 0);
  const beforePos3 = adapter.state.party.find((m) => m.position === 3);

  const swap = adapter.queueSwap(0, 3);
  assert.equal(swap.fromPositionIndex, 0);
  assert.equal(swap.toPositionIndex, 3);
  assert.equal(adapter.state.party.find((m) => m.position === 0)?.characterId, beforePos3?.characterId);
  assert.equal(adapter.state.party.find((m) => m.position === 3)?.characterId, beforePos0?.characterId);

  adapter.previewCurrentTurn();
  const committed = adapter.commitCurrentTurn();

  assert.equal(adapter.pendingSwapEvents.length, 0);
  assert.equal(adapter.recordStore.records.length, 1);
  assert.equal(committed.swapEvents.length, 1);
});

test('records table supports simple mode toggle and keeps priority columns left in full mode', () => {
  const store = getStore();
  const { root, win } = createRoot();
  const adapter = new BattleDomAdapter({ root, dataStore: store, initialSP: 10 });
  adapter.mount();

  adapter.previewCurrentTurn();
  adapter.commitCurrentTurn();

  const tbody = root.querySelector('[data-role="record-body"]');
  const fullRow = tbody?.querySelector('tr');
  assert.ok(fullRow);
  assert.equal(fullRow.children.length > 10, true);
  assert.equal(fullRow.children[0].textContent, '1');
  assert.ok(fullRow.children[1].querySelector('[data-action="turn-plan-edit-row"]'));
  assert.equal(fullRow.children[2].textContent, String(adapter.recordStore.records[0]?.turnLabel ?? ''));
  assert.equal(fullRow.children[3].textContent.includes('%'), true);

  const simpleToggle = root.querySelector('[data-role="records-simple-toggle"]');
  simpleToggle.checked = true;
  simpleToggle.dispatchEvent(new win.Event('change', { bubbles: true }));

  const simpleRow = tbody?.querySelector('tr');
  assert.ok(simpleRow);
  assert.equal(simpleRow.children.length, 10);
  assert.equal(simpleRow.children[0].textContent, '1');
  assert.ok(simpleRow.children[1].querySelector('[data-action="turn-plan-edit-row"]'));
  assert.equal(simpleRow.children[2].textContent, String(adapter.recordStore.records[0]?.turnLabel ?? ''));
});

test('record ops for latest committed row is enabled immediately', () => {
  const store = getStore();
  const { root } = createRoot();
  const adapter = new BattleDomAdapter({ root, dataStore: store, initialSP: 10 });
  adapter.mount();

  adapter.previewCurrentTurn();
  adapter.commitCurrentTurn();

  const firstRowEdit = root.querySelector(
    '[data-role="record-body"] tr:nth-child(1) [data-action="turn-plan-edit-row"]'
  );
  assert.ok(firstRowEdit);
  assert.equal(firstRowEdit.disabled, false);

  adapter.previewCurrentTurn();
  adapter.commitCurrentTurn();

  const secondRowEdit = root.querySelector(
    '[data-role="record-body"] tr:nth-child(2) [data-action="turn-plan-edit-row"]'
  );
  assert.ok(secondRowEdit);
  assert.equal(secondRowEdit.disabled, false);
});

test('records boundary sequence keeps ui and internal state in sync', () => {
  const store = getStore();
  const { root } = createRoot();
  const adapter = new BattleDomAdapter({ root, dataStore: store, initialSP: 10 });
  adapter.mount();

  const getRows = () => [...root.querySelectorAll('[data-role="record-body"] tr')];
  const getEditButton = (rowNumber) =>
    root.querySelector(
      `[data-role="record-body"] tr:nth-child(${rowNumber}) [data-action="turn-plan-edit-row"]`
    );
  const assertCounts = (expected) => {
    assert.equal(adapter.recordStore.records.length, expected, 'recordStore length mismatch');
    assert.equal(adapter.turnPlans.length, expected, 'turnPlans length mismatch');
    assert.equal(getRows().length, expected, 'table rows mismatch');
  };

  assertCounts(0);

  adapter.previewCurrentTurn();
  adapter.commitCurrentTurn();
  assertCounts(1);
  assert.equal(getEditButton(1)?.disabled, false, 'first row should be editable after first commit');

  adapter.previewCurrentTurn();
  adapter.commitCurrentTurn();
  assertCounts(2);
  assert.equal(getEditButton(2)?.disabled, false, 'latest row should be editable after second commit');

  const deleteFirst = root.querySelector(
    '[data-role="record-body"] tr:nth-child(1) [data-action="turn-plan-delete-row"]'
  );
  assert.ok(deleteFirst, 'delete button should exist for first row');
  deleteFirst.click();
  assertCounts(1);
  assert.equal(getEditButton(1)?.disabled, false, 'remaining row should stay editable after delete');

  root.querySelector('[data-action="clear-records"]').click();
  assertCounts(0);
  assert.equal(root.querySelector('[data-role="status"]').textContent, 'Records cleared.');

  adapter.previewCurrentTurn();
  adapter.commitCurrentTurn();
  assertCounts(1);
  assert.equal(getEditButton(1)?.disabled, false, 'row should be editable after re-creating first record');
});

test('scenario first run creates editable first records row', () => {
  const store = getStore();
  const { root } = createRoot();
  const adapter = new BattleDomAdapter({ root, dataStore: store, initialSP: 10 });
  adapter.mount();

  const front = adapter.party.getFrontline();
  const scenario = {
    version: 1,
    setup: { enemyCount: 1, initialOdGauge: 0, enemyStatuses: [] },
    turns: [
      {
        actions: [
          { position: front[0].position + 1, skillId: front[0].getActionSkills()[0].skillId },
        ],
      },
    ],
  };

  root.querySelector('[data-role="scenario-json"]').value = JSON.stringify(scenario);
  adapter.loadScenarioFromDom();
  adapter.applyLoadedScenarioSetup();
  adapter.runNextScenarioTurn();

  assert.equal(adapter.recordStore.records.length, 1);
  assert.equal(adapter.turnPlans.length, 1);
  assert.equal(root.querySelectorAll('[data-role="record-body"] tr').length, 1);
  const editButton = root.querySelector(
    '[data-role="record-body"] tr:nth-child(1) [data-action="turn-plan-edit-row"]'
  );
  assert.ok(editButton);
  assert.equal(editButton.disabled, false);
});

test('turn plan strict recalculation stops at first invalid edited row', () => {
  const store = getStore();
  const { root } = createRoot();
  const adapter = new BattleDomAdapter({ root, dataStore: store, initialSP: 10 });
  adapter.mount();

  adapter.previewCurrentTurn();
  adapter.commitCurrentTurn();
  assert.equal(adapter.turnPlans.length, 1);

  adapter.turnPlans[0] = {
    ...adapter.turnPlans[0],
    actions: [
      {
        ...adapter.turnPlans[0].actions[0],
        skillId: 99999999,
      },
    ],
  };
  adapter.recalculateTurnPlans({ mode: 'strict' });

  assert.equal(Number(adapter.turnPlanReplayError?.index), 0);
  assert.equal(adapter.recordStore.records.length, 0);
});

test('turn plan force recalculation allows OD gauge deficit and continues', () => {
  const store = getStore();
  const { root } = createRoot();
  const adapter = new BattleDomAdapter({ root, dataStore: store, initialSP: 10 });
  adapter.mount();

  adapter.previewCurrentTurn();
  adapter.commitCurrentTurn();
  assert.equal(adapter.turnPlans.length, 1);

  adapter.turnPlans[0] = {
    ...adapter.turnPlans[0],
    preemptiveOdLevel: 3,
  };
  adapter.recalculateTurnPlans({ mode: 'force' });

  assert.equal(adapter.turnPlanReplayError, null);
  assert.equal(adapter.recordStore.records.length, 1);
  assert.equal(Number(adapter.state.turnState.odGauge) < 0, true);
});

test('turn plan replay resolves swaps by character reference', () => {
  const store = getStore();
  const { root } = createRoot();
  const adapter = new BattleDomAdapter({ root, dataStore: store, initialSP: 10 });
  adapter.mount();

  adapter.queueSwap(0, 3);
  adapter.previewCurrentTurn();
  adapter.commitCurrentTurn();
  assert.equal(adapter.turnPlans.length, 1);
  assert.equal(adapter.turnPlans[0].swaps.length, 1);
  assert.equal(String(adapter.turnPlans[0].swaps[0].fromCharacterId).length > 0, true);

  adapter.recalculateTurnPlans({ mode: 'strict' });

  assert.equal(adapter.turnPlanReplayError, null);
  assert.equal(adapter.recordStore.records.length, 1);
  assert.equal(Number(adapter.recordStore.records[0].swapEvents?.length ?? 0), 1);
});

test('turn plan replay resolves swaps by style reference', () => {
  const store = getStore();
  const { root } = createRoot();
  const adapter = new BattleDomAdapter({ root, dataStore: store, initialSP: 10 });
  adapter.mount();

  adapter.queueSwap(0, 3);
  adapter.previewCurrentTurn();
  adapter.commitCurrentTurn();
  assert.equal(adapter.turnPlans.length, 1);

  const swapPlan = adapter.turnPlans[0].swaps[0];
  const fromMember = adapter.state.party.find((member) => member.characterId === swapPlan.fromCharacterId);
  const toMember = adapter.state.party.find((member) => member.characterId === swapPlan.toCharacterId);
  if (!fromMember || !toMember) {
    return;
  }
  adapter.turnPlans[0].swaps = [
    {
      fromStyleId: String(fromMember.styleId),
      toStyleId: String(toMember.styleId),
    },
  ];

  adapter.recalculateTurnPlans({ mode: 'strict' });

  assert.equal(adapter.turnPlanReplayError, null);
  assert.equal(adapter.recordStore.records.length, 1);
  assert.equal(Number(adapter.recordStore.records[0].swapEvents?.length ?? 0), 1);
});

test('turn plan recalculation preserves multi-enemy setup delta', () => {
  const store = getStore();
  const { root, win } = createRoot();
  const adapter = new BattleDomAdapter({ root, dataStore: store, initialSP: 10 });
  adapter.mount();

  const enemyCount = root.querySelector('[data-role="enemy-count"]');
  enemyCount.value = '3';
  enemyCount.dispatchEvent(new win.Event('change', { bubbles: true }));
  adapter.applyScenarioEnemyNames(['Enemy A', 'Enemy B', 'Enemy C']);
  adapter.applyScenarioEnemyDamageRates([{ Slash: 50 }, { Fire: 150 }, { Thunder: 75 }]);
  adapter.state.turnState.zoneState = {
    type: 'Fire',
    sourceSide: 'player',
    remainingTurns: 8,
  };
  adapter.state.turnState.territoryState = {
    type: 'ReviveTerritory',
    sourceSide: 'player',
    remainingTurns: null,
  };
  const turns = root.querySelector('[data-role="enemy-status-turns"]');
  turns.value = '2';
  adapter.applyEnemyStatusFromDom();

  adapter.previewCurrentTurn();
  adapter.commitCurrentTurn();

  assert.equal(adapter.turnPlans.length, 1);
  assert.deepEqual(adapter.turnPlans[0].setupDelta.enemyNames, {
    0: 'Enemy A',
    1: 'Enemy B',
    2: 'Enemy C',
  });
  assert.deepEqual(adapter.turnPlans[0].setupDelta.enemyDamageRates, {
    0: { Slash: 50 },
    1: { Fire: 150 },
    2: { Thunder: 75 },
  });
  assert.equal(Array.isArray(adapter.turnPlans[0].setupDelta.enemyStatuses), true);
  assert.deepEqual(adapter.turnPlans[0].setupDelta.zoneState, {
    type: 'Fire',
    sourceSide: 'player',
    remainingTurns: 8,
  });
  assert.deepEqual(adapter.turnPlans[0].setupDelta.territoryState, {
    type: 'ReviveTerritory',
    sourceSide: 'player',
    remainingTurns: null,
  });

  adapter.recalculateTurnPlans({ mode: 'strict' });

  assert.equal(adapter.turnPlanReplayError, null);
  assert.deepEqual(adapter.state.turnState.enemyState.enemyNamesByEnemy, {
    0: 'Enemy A',
    1: 'Enemy B',
    2: 'Enemy C',
  });
  assert.deepEqual(adapter.state.turnState.enemyState.damageRatesByEnemy, {
    0: { Slash: 50 },
    1: { Fire: 150 },
    2: { Thunder: 75 },
  });
  assert.deepEqual(adapter.state.turnState.zoneState, {
    type: 'Fire',
    sourceSide: 'player',
    remainingTurns: 7,
  });
  assert.deepEqual(adapter.state.turnState.territoryState, {
    type: 'ReviveTerritory',
    sourceSide: 'player',
    remainingTurns: null,
  });
});

test('turn plan replay prioritizes recorded action position over stale character reference', () => {
  const store = getStore();
  const { root } = createRoot();
  const adapter = new BattleDomAdapter({ root, dataStore: store, initialSP: 10 });
  adapter.mount();

  const frontline = adapter.party.getFrontline().slice().sort((a, b) => a.position - b.position);
  let fromMember = null;
  let toMember = null;
  let uniqueSkill = null;
  for (let i = 0; i < frontline.length; i += 1) {
    for (let j = 0; j < frontline.length; j += 1) {
      if (i === j) {
        continue;
      }
      const candidateFrom = frontline[i];
      const candidateTo = frontline[j];
      const candidateSkill =
        candidateTo.getActionSkills().find((skill) => !candidateFrom.getSkill(skill.skillId)) ?? null;
      if (candidateSkill) {
        fromMember = candidateFrom;
        toMember = candidateTo;
        uniqueSkill = candidateSkill;
        break;
      }
    }
    if (uniqueSkill) {
      break;
    }
  }
  if (!fromMember || !toMember || !uniqueSkill) {
    return;
  }

  adapter.queueSwap(fromMember.position, toMember.position);
  const toAfterSwap = adapter.state.party.find((member) => member.characterId === toMember.characterId);
  if (!toAfterSwap) {
    return;
  }
  const targetSelect = root.querySelector(`[data-action-slot="${toAfterSwap.position}"]`);
  if (!targetSelect) {
    return;
  }
  targetSelect.value = String(uniqueSkill.skillId);

  adapter.previewCurrentTurn();
  adapter.commitCurrentTurn();
  assert.equal(adapter.turnPlans.length, 1);

  const actionWithUniqueSkill =
    adapter.turnPlans[0].actions.find((action) => Number(action.skillId) === Number(uniqueSkill.skillId)) ?? null;
  if (!actionWithUniqueSkill) {
    return;
  }
  assert.equal(Number(actionWithUniqueSkill.positionIndex), Number(toAfterSwap.position));

  adapter.turnPlans[0].actions = adapter.turnPlans[0].actions.map((action) =>
    Number(action.skillId) === Number(uniqueSkill.skillId)
      ? {
          ...action,
          characterId: String(fromMember.characterId),
          characterName: String(fromMember.characterName),
        }
      : action
  );

  adapter.recalculateTurnPlans({ mode: 'strict' });

  assert.equal(adapter.turnPlanReplayError, null);
  const replayedAction =
    adapter.recordStore.records[0]?.actions?.find((action) => Number(action.skillId) === Number(uniqueSkill.skillId)) ??
    null;
  if (!replayedAction) {
    return;
  }
  assert.equal(String(replayedAction.characterId), String(toMember.characterId));
});

test('turn plan force recalculation allows SP deficit', () => {
  const store = getStore();
  const { root } = createRoot();
  const adapter = new BattleDomAdapter({ root, dataStore: store, initialSP: 0 });
  adapter.mount();

  const actor = adapter.party.getFrontline()[0];
  const expensiveSkill =
    actor
      .getActionSkills()
      .filter((skill) => Number(skill.spCost ?? 0) >= 5)
      .sort((a, b) => Number(b.spCost ?? 0) - Number(a.spCost ?? 0))[0] ?? null;
  if (!expensiveSkill) {
    return;
  }
  const actorPosition = Number(actor.position);

  for (let i = 0; i < 2; i += 1) {
    const actionSelect = root.querySelector(`[data-action-slot="${actorPosition}"]`);
    if (actionSelect) {
      actionSelect.value = String(expensiveSkill.skillId);
    }
    adapter.previewCurrentTurn();
    adapter.commitCurrentTurn();
  }
  assert.equal(adapter.turnPlans.length, 2);

  adapter.recalculateTurnPlans({ mode: 'force' });

  const replayActor = adapter.state.party.find((member) => member.characterId === actor.characterId);
  assert.ok(replayActor);
  assert.equal(Number(replayActor.sp.current) < 0, true);
});

test('action selection is preserved after commit for each position', () => {
  const store = getStore();
  const { root } = createRoot();
  const adapter = new BattleDomAdapter({ root, dataStore: store, initialSP: 10 });

  adapter.mount();
  const actionSelect = root.querySelector('[data-action-slot="0"]');
  const options = [...actionSelect.querySelectorAll('option')];
  if (options.length < 2) {
    return;
  }

  const chosen = options[1].value;
  actionSelect.value = chosen;
  adapter.previewCurrentTurn();
  adapter.commitCurrentTurn();

  const actionSelectAfter = root.querySelector('[data-action-slot="0"]');
  assert.equal(actionSelectAfter.value, chosen);
});

test('swap candidates are filtered by EX state and mixed EX/normal swap is blocked', () => {
  const store = getStore();
  const { root, win } = createRoot();
  const adapter = new BattleDomAdapter({ root, dataStore: store, initialSP: 10 });
  adapter.mount();

  const exCharacterId = adapter.state.party.find((member) => member.position === 0)?.characterId;
  adapter.state = grantExtraTurn(adapter.state, [exCharacterId]);
  adapter.renderPartyState();

  const swapFrom = root.querySelector('[data-role="swap-from"]');
  const swapTo = root.querySelector('[data-role="swap-to"]');
  const fromValues = [...swapFrom.options].map((option) => Number(option.value));
  assert.deepEqual(fromValues, [0], 'during EX turn, Swap From should list only EX members');

  // EX member selected as source => no valid target (only one EX)
  swapFrom.value = '0';
  swapFrom.dispatchEvent(new win.Event('change', { bubbles: true }));
  const toValuesForExFrom = [...swapTo.options].map((option) => option.value);
  assert.equal(toValuesForExFrom.length, 1);
  assert.equal(toValuesForExFrom[0], '', 'EX source should have no normal target candidates');

  assert.equal(
    [...swapFrom.options].some((option) => Number(option.value) === 3),
    false,
    'during EX turn, non-EX members must not appear in Swap From'
  );

  assert.throws(
    () => adapter.queueSwap(0, 5),
    /Swap is allowed only between \[EX\]<->\[EX\] during an Extra Turn/
  );
});

test('swap selectors display character names while keeping position values', () => {
  const store = getStore();
  const { root } = createRoot();
  const adapter = new BattleDomAdapter({ root, dataStore: store, initialSP: 10 });
  adapter.mount();

  const swapFrom = root.querySelector('[data-role="swap-from"]');
  const firstOption = swapFrom?.options?.[0];
  assert.ok(firstOption);
  assert.equal(firstOption.textContent.includes('Pos '), false);

  const memberAtPosition0 = adapter.state.party.find((member) => member.position === 0);
  assert.equal(firstOption.textContent.includes(memberAtPosition0.characterName), true);
  assert.equal(firstOption.value, '0');
});

test('party state shows EP alongside SP only for Nanase', () => {
  const store = getStore();
  const { root } = createRoot();
  const adapter = new BattleDomAdapter({ root, dataStore: store, initialSP: 10 });

  const nanaseStyleId = 1010204;
  const others = getSixUsableStyleIds(store).filter((id) => store.getStyleById(id)?.chara_label !== 'NNanase');
  adapter.initializeBattle([nanaseStyleId, ...others.slice(0, 5)]);

  const rows = [...root.querySelectorAll('[data-role="party-state"] li')].map((li) => li.textContent ?? '');
  assert.equal(rows.some((line) => line.includes('七瀬 七海') && line.includes('EP=')), true);
  assert.equal(rows.filter((line) => !line.includes('七瀬 七海')).some((line) => line.includes('EP=')), false);
});

test('token debug controls update current token state with clamp', () => {
  const store = getStore();
  const { root, win } = createRoot();
  const adapter = new BattleDomAdapter({ root, dataStore: store, initialSP: 10 });
  adapter.mount();
  const tokenStyleId = 1004204;
  const others = getSixUsableStyleIds(store).filter((id) => Number(id) !== Number(tokenStyleId));
  adapter.initializeBattle([tokenStyleId, ...others.slice(0, 5)]);

  const member = adapter.state.party[0];
  assert.ok(member);
  const getInput = () =>
    root.querySelector(`[data-role="token-debug-input"][data-character-id="${member.characterId}"]`);
  let input = getInput();
  assert.ok(input);

  input.value = '12';
  input.dispatchEvent(new win.Event('change', { bubbles: true }));
  assert.equal(member.tokenState.current, 10);

  input = getInput();
  assert.ok(input);
  input.value = '-3';
  input.dispatchEvent(new win.Event('change', { bubbles: true }));
  assert.equal(member.tokenState.current, 0);

  const rows = [...root.querySelectorAll('[data-role="party-state"] li')].map((li) => li.textContent ?? '');
  assert.equal(rows.some((line) => line.includes(`${member.characterName}`) && line.includes('Token=0')), true);
});

test('morale display stays hidden at 0 and appears after morale rises', () => {
  const store = getStore();
  const { root } = createRoot();
  const adapter = new BattleDomAdapter({ root, dataStore: store, initialSP: 10 });
  adapter.mount();
  const moraleStyleId = Number(
    store.styles.find(
      (style) =>
        String(style?.chara_label ?? '') === 'EAoi' &&
        Array.isArray(style?.skills) &&
        style.skills.some((skill) => Number(skill?.id ?? skill) === 46002113)
    )?.id
  );
  const others = getSixUsableStyleIds(store).filter((id) => Number(id) !== moraleStyleId);
  adapter.initializeBattle([moraleStyleId, ...others.slice(0, 5)]);

  const member = adapter.state.party[0];
  assert.ok(member);
  let rows = [...root.querySelectorAll('[data-role="party-state"] li')].map((li) => li.textContent ?? '');
  assert.equal(rows.some((line) => line.includes(`${member.characterName}`) && line.includes('Morale=')), false);

  member.moraleState.current = 1;
  adapter.renderPartyState();

  rows = [...root.querySelectorAll('[data-role="party-state"] li')].map((li) => li.textContent ?? '');
  assert.equal(rows.some((line) => line.includes(`${member.characterName}`) && line.includes('Morale=1')), true);
  member.moraleState.current = 0;
  adapter.renderPartyState();

  rows = [...root.querySelectorAll('[data-role="party-state"] li')].map((li) => li.textContent ?? '');
  assert.equal(rows.some((line) => line.includes(`${member.characterName}`) && line.includes('Morale=')), false);
});

test('turn status shows current field and territory state', () => {
  const store = getStore();
  const { root } = createRoot();
  const adapter = new BattleDomAdapter({ root, dataStore: store, initialSP: 10 });
  adapter.mount();

  const label = root.querySelector('[data-role="field-state-label"]');
  assert.equal(label?.textContent, 'Field=- | Territory=-');

  adapter.state.turnState.zoneState = {
    type: 'Fire',
    sourceSide: 'player',
    remainingTurns: 8,
  };
  adapter.state.turnState.territoryState = {
    type: 'ReviveTerritory',
    sourceSide: 'player',
    remainingTurns: null,
  };
  adapter.renderTurnStatus();

  assert.equal(
    root.querySelector('[data-role="field-state-label"]')?.textContent,
    'Field=Fire(8) | Territory=ReviveTerritory'
  );
});

test('character -> style selection is linked and reflected on screen', () => {
  const store = getStore();
  const { root, win } = createRoot();
  const adapter = new BattleDomAdapter({ root, dataStore: store, initialSP: 10 });
  adapter.mount();

  const characterSelects = root.querySelectorAll('[data-role="character-select"]');
  const styleSelects = root.querySelectorAll('[data-role="style-select"]');
  const lbSelects = root.querySelectorAll('[data-role="limit-break-select"]');
  const driveSelects = root.querySelectorAll('[data-role="drive-pierce-select"]');
  const startSpEquipSelects = root.querySelectorAll('[data-role="start-sp-equip-select"]');
  assert.equal(characterSelects.length, 6);
  assert.equal(styleSelects.length, 6);
  assert.equal(lbSelects.length, 6);
  assert.equal(driveSelects.length, 6);
  assert.equal(startSpEquipSelects.length, 6);

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

test('style -> skill selection is linked', () => {
  const store = getStore();
  const { root, win } = createRoot();
  const adapter = new BattleDomAdapter({ root, dataStore: store, initialSP: 10 });
  adapter.mount();

  const slot = 0;
  const checklist = root.querySelector(`[data-role="skill-checklist"][data-slot="${slot}"]`);

  assert.ok(checklist !== null, 'skill-checklist should exist');
  assert.ok(
    checklist.querySelectorAll(`[data-role="skill-check"][data-slot="${slot}"]`).length > 0,
    'skills should be populated'
  );

  const candidates = store.listCharacterCandidates();
  const charWithMultipleStyles = candidates.find((c) => c.styleCount >= 2);
  if (charWithMultipleStyles) {
    const charSelect = root.querySelector(`[data-role="character-select"][data-slot="${slot}"]`);
    const styleSelect = root.querySelector(`[data-role="style-select"][data-slot="${slot}"]`);
    charSelect.value = charWithMultipleStyles.label;
    charSelect.dispatchEvent(new win.Event('change', { bubbles: true }));

    const styles = store
      .listStylesByCharacter(charWithMultipleStyles.label)
      .filter((s) => Array.isArray(s.skills) && s.skills.length > 0);
    if (styles.length >= 2) {
      styleSelect.value = String(styles[1].id);
      styleSelect.dispatchEvent(new win.Event('change', { bubbles: true }));
      assert.ok(
        checklist.querySelectorAll(`[data-role="skill-check"][data-slot="${slot}"]`).length > 0,
        'skills updated for new style'
      );
    }
  }

  const slotSummary = root.querySelector(`[data-role="slot-summary"][data-slot="${slot}"]`).textContent;
  assert.ok(slotSummary.includes('Equipped Skills:'), 'slot summary includes equipped skill count');
  assert.ok(slotSummary.includes('Passives:'), 'slot summary includes passive count');
});

test('style selection updates passive list', () => {
  const store = getStore();
  const { root, win } = createRoot();
  const adapter = new BattleDomAdapter({ root, dataStore: store, initialSP: 10 });
  adapter.mount();

  const slot = 0;
  const characterSelect = root.querySelector(`[data-role="character-select"][data-slot="${slot}"]`);
  const styleSelect = root.querySelector(`[data-role="style-select"][data-slot="${slot}"]`);
  const passiveList = root.querySelector(`[data-role="passive-list"][data-slot="${slot}"]`);

  characterSelect.value = 'TTojo';
  characterSelect.dispatchEvent(new win.Event('change', { bubbles: true }));
  styleSelect.value = '1001402';
  styleSelect.dispatchEvent(new win.Event('change', { bubbles: true }));

  const text = passiveList.textContent ?? '';
  assert.ok(text.includes('Passives:'), 'passive list should be rendered');
  assert.ok(text.includes('福運') || text.includes('[Overdrive]'), 'known passive should be listed');
});

test('limit break selector range follows style tier and filters passives', () => {
  const store = getStore();
  const { root, win } = createRoot();
  const adapter = new BattleDomAdapter({ root, dataStore: store, initialSP: 10 });
  adapter.mount();

  const slot = 0;
  const characterSelect = root.querySelector(`[data-role="character-select"][data-slot="${slot}"]`);
  const styleSelect = root.querySelector(`[data-role="style-select"][data-slot="${slot}"]`);
  const lbSelect = root.querySelector(`[data-role="limit-break-select"][data-slot="${slot}"]`);
  const passiveList = root.querySelector(`[data-role="passive-list"][data-slot="${slot}"]`);

  characterSelect.value = 'RKayamori';
  characterSelect.dispatchEvent(new win.Event('change', { bubbles: true }));
  styleSelect.value = '1001101'; // Attack or Music (A)
  styleSelect.dispatchEvent(new win.Event('change', { bubbles: true }));

  assert.equal(lbSelect.options.length, 21, 'A tier should have LB 0..20');
  lbSelect.value = '4';
  lbSelect.dispatchEvent(new win.Event('change', { bubbles: true }));
  assert.equal((passiveList.textContent ?? '').includes('疾風'), false, '疾風 should be hidden at LB4');

  lbSelect.value = '5';
  lbSelect.dispatchEvent(new win.Event('change', { bubbles: true }));
  assert.equal((passiveList.textContent ?? '').includes('疾風'), true, '疾風 should appear at LB5');
});

test('condition support panel shows planned support tiers for selected style passives', () => {
  const store = getStore();
  const { root, win } = createRoot();
  const adapter = new BattleDomAdapter({ root, dataStore: store, initialSP: 10 });
  adapter.mount();

  const slot = 0;
  const characterSelect = root.querySelector(`[data-role="character-select"][data-slot="${slot}"]`);
  const styleSelect = root.querySelector(`[data-role="style-select"][data-slot="${slot}"]`);
  const lbSelect = root.querySelector(`[data-role="limit-break-select"][data-slot="${slot}"]`);
  const summary = root.querySelector('[data-role="condition-support-summary"]');

  characterSelect.value = 'RKayamori';
  characterSelect.dispatchEvent(new win.Event('change', { bubbles: true }));
  styleSelect.value = '1001103';
  styleSelect.dispatchEvent(new win.Event('change', { bubbles: true }));
  lbSelect.value = '3';
  lbSelect.dispatchEvent(new win.Event('change', { bubbles: true }));

  const text = summary.textContent ?? '';
  assert.equal(text.includes('Global Passive Condition Support'), true);
  assert.equal(text.includes('stateful_future: DpRate'), true);
  assert.equal(text.includes('Selected Style: 閃光のサーキットバースト'), true);
  assert.equal(text.includes('堅忍: DpRate:stateful_future'), true);
});

test('passive skills are shown in checklist but excluded from action selector', () => {
  const store = getStore();
  const { root, win } = createRoot();
  const adapter = new BattleDomAdapter({ root, dataStore: store, initialSP: 10 });
  adapter.mount();

  const slot = 0;
  const characterSelect = root.querySelector(`[data-role="character-select"][data-slot="${slot}"]`);
  const styleSelect = root.querySelector(`[data-role="style-select"][data-slot="${slot}"]`);
  characterSelect.value = 'TTojo';
  characterSelect.dispatchEvent(new win.Event('change', { bubbles: true }));
  styleSelect.value = '1001408'; // 哀情のラメント
  styleSelect.dispatchEvent(new win.Event('change', { bubbles: true }));

  const checklistLabels = [...root.querySelectorAll(`[data-role="skill-check"][data-slot="${slot}"]`)]
    .map((box) => box.closest('label')?.textContent ?? '');
  assert.ok(
    checklistLabels.some((text) => text.includes('日陰のシエスタ') && text.includes('[パッシブ]')),
    'passive badge should be shown in checklist'
  );
  assert.ok(
    checklistLabels.some((text) => text.includes('ディフェンスブースト') && text.includes('[オーブ]') && text.includes('[パッシブ]')),
    'orb passive should show [オーブ][パッシブ]'
  );

  const styleIds = getSixUsableStyleIds(store);
  const tojoIndex = styleIds.findIndex((id) => store.getStyleById(id)?.chara_label === 'TTojo');
  if (tojoIndex >= 0) {
    styleIds[tojoIndex] = 1001408;
  } else {
    styleIds[0] = 1001408;
  }
  adapter.initializeBattle(styleIds, { skillSetsByPartyIndex: {} });
  const tojoMember = adapter.party.members.find((member) => member.styleId === 1001408);
  const actionNames = (tojoMember?.getActionSkills() ?? []).map((skill) => skill.name);
  assert.equal(
    actionNames.some((name) =>
      name.includes('日陰のシエスタ') ||
      name.includes('ディフェンスブースト') ||
      name.includes('紡がれた記憶')
    ),
    false,
    'passive skills should not appear in action selector'
  );
});

test('style selection exposes usable skills by restricted/generalize/admiral rules', () => {
  const store = getStore();
  const { root, win } = createRoot();
  const adapter = new BattleDomAdapter({ root, dataStore: store, initialSP: 10 });
  adapter.mount();

  const slot = 0;
  const characterSelect = root.querySelector(`[data-role="character-select"][data-slot="${slot}"]`);
  const styleSelect = root.querySelector(`[data-role="style-select"][data-slot="${slot}"]`);
  const getSkillIds = () =>
    [...root.querySelectorAll(`[data-role="skill-check"][data-slot="${slot}"]`)].map((el) =>
      Number(el.value)
    );

  // KMaruyama(スマイリー) should see generalized restricted skill and normal shared skill.
  characterSelect.value = 'KMaruyama';
  characterSelect.dispatchEvent(new win.Event('change', { bubbles: true }));
  styleSelect.value = '1007205'; // スマイリー・ブルーム (SS, non-generalize)
  styleSelect.dispatchEvent(new win.Event('change', { bubbles: true }));

  const maruyamaSkillIds = getSkillIds();
  assert.equal(maruyamaSkillIds.includes(46007206), true, 'ヴォイドストーム should be usable via generalize');
  assert.equal(maruyamaSkillIds.includes(46007214), true, '勇気の灯火 should be shared as normal skill');

  // Non-Admiral RKayamori style should not see 指揮行動.
  characterSelect.value = 'RKayamori';
  characterSelect.dispatchEvent(new win.Event('change', { bubbles: true }));
  styleSelect.value = '1001103'; // 閃光のサーキットバースト (non-Admiral)
  styleSelect.dispatchEvent(new win.Event('change', { bubbles: true }));
  const rkNonAdmiralSkillIds = getSkillIds();
  assert.equal(rkNonAdmiralSkillIds.includes(46001134), false, '指揮行動 should be hidden on non-Admiral');

  // Admiral style should see 指揮行動.
  styleSelect.value = '1001111'; // Glorious Blades (Admiral)
  styleSelect.dispatchEvent(new win.Event('change', { bubbles: true }));
  const rkAdmiralSkillIds = getSkillIds();
  assert.equal(rkAdmiralSkillIds.includes(46001134), true, '指揮行動 should be available on Admiral');
});

test('style options are ordered by tier asc and then in_date asc', () => {
  const store = getStore();
  const { root, win } = createRoot();
  const adapter = new BattleDomAdapter({ root, dataStore: store, initialSP: 10 });
  adapter.mount();

  const slot = 0;
  const characterSelect = root.querySelector(`[data-role="character-select"][data-slot="${slot}"]`);
  const styleSelect = root.querySelector(`[data-role="style-select"][data-slot="${slot}"]`);

  characterSelect.value = 'RKayamori';
  characterSelect.dispatchEvent(new win.Event('change', { bubbles: true }));

  const optionIds = [...styleSelect.options].map((opt) => Number(opt.value));
  const styles = optionIds.map((id) => store.getStyleById(id));
  const tierOrder = { A: 0, S: 1, SS: 2, SSR: 3 };

  for (let i = 1; i < styles.length; i += 1) {
    const prev = styles[i - 1];
    const curr = styles[i];
    const prevTier = tierOrder[String(prev?.tier ?? '').toUpperCase()] ?? Number.POSITIVE_INFINITY;
    const currTier = tierOrder[String(curr?.tier ?? '').toUpperCase()] ?? Number.POSITIVE_INFINITY;
    assert.ok(prevTier <= currTier, 'tier order should be ascending');

    if (prevTier === currTier) {
      const prevDate = new Date(String(prev?.in_date ?? '')).getTime();
      const currDate = new Date(String(curr?.in_date ?? '')).getTime();
      assert.ok(prevDate <= currDate, 'in_date should be ascending within same tier');
    }
  }
});

test('unchecked skills are excluded from battle member loadout', () => {
  const store = getStore();
  const { root } = createRoot();
  const adapter = new BattleDomAdapter({ root, dataStore: store, initialSP: 10 });
  adapter.mount();

  const slot = 0;
  const boxes = [...root.querySelectorAll(`[data-role="skill-check"][data-slot="${slot}"]`)];
  assert.ok(boxes.length >= 2, 'need at least two skills for this test');

  for (const box of boxes) {
    box.checked = false;
  }
  boxes[0].checked = true;

  adapter.initializeBattle();
  const member = adapter.party.getByPosition(0);
  assert.equal(member.skills.length, 1, 'only one equipped skill should remain');
  assert.equal(member.skills[0].skillId, Number(boxes[0].value));
});

test('normal attack is always equipped and cannot be unchecked', () => {
  const store = getStore();
  const { root } = createRoot();
  const adapter = new BattleDomAdapter({ root, dataStore: store, initialSP: 10 });
  adapter.mount();

  const slot = 0;
  const boxes = [...root.querySelectorAll(`[data-role="skill-check"][data-slot="${slot}"]`)];
  const normal = boxes.find((box) => {
    const label = box.closest('label');
    return (label?.textContent ?? '').includes('通常攻撃');
  });

  assert.ok(normal, 'normal attack checkbox should exist');
  assert.equal(normal.disabled, true, 'normal attack checkbox should be disabled');
  assert.equal(normal.checked, true, 'normal attack checkbox should be checked');

  for (const box of boxes) {
    box.checked = false;
  }

  adapter.initializeBattle();
  const member = adapter.party.getByPosition(0);
  const skillNames = member.skills.map((skill) => skill.name);
  assert.equal(skillNames.includes('通常攻撃'), true, 'normal attack should always remain equipped');
});

test('admiral command is always equipped and cannot be unchecked on Admiral style', () => {
  const store = getStore();
  const { root, win } = createRoot();
  const adapter = new BattleDomAdapter({ root, dataStore: store, initialSP: 10 });
  adapter.mount();

  const slot = 0;
  const characterSelect = root.querySelector(`[data-role="character-select"][data-slot="${slot}"]`);
  const styleSelect = root.querySelector(`[data-role="style-select"][data-slot="${slot}"]`);

  characterSelect.value = 'RKayamori';
  characterSelect.dispatchEvent(new win.Event('change', { bubbles: true }));
  styleSelect.value = '1001111'; // Glorious Blades (Admiral)
  styleSelect.dispatchEvent(new win.Event('change', { bubbles: true }));

  const boxes = [...root.querySelectorAll(`[data-role="skill-check"][data-slot="${slot}"]`)];
  const labels = boxes.map((box) => box.closest('label')?.textContent ?? '');
  const admiralCommand = boxes.find((box) => {
    const label = box.closest('label');
    return (label?.textContent ?? '').includes('指揮行動');
  });

  assert.ok(admiralCommand, 'admiral command checkbox should exist');
  assert.equal(admiralCommand.disabled, true, 'admiral command checkbox should be disabled');
  assert.equal(admiralCommand.checked, true, 'admiral command checkbox should be checked');
  assert.equal(labels[0].includes('指揮行動'), true, 'admiral command should be listed first');
  assert.equal(labels.some((text) => text.includes('通常攻撃')), false, 'normal attack should be hidden');
});

test('master passive shows [マスター][パッシブ] tag in checklist', () => {
  const store = getStore();
  const { root, win } = createRoot();
  const adapter = new BattleDomAdapter({ root, dataStore: store, initialSP: 10 });
  adapter.mount();

  const slot = 0;
  const characterSelect = root.querySelector(`[data-role="character-select"][data-slot="${slot}"]`);
  const styleSelect = root.querySelector(`[data-role="style-select"][data-slot="${slot}"]`);
  characterSelect.value = 'RKayamori';
  characterSelect.dispatchEvent(new win.Event('change', { bubbles: true }));
  styleSelect.value = '1001103';
  styleSelect.dispatchEvent(new win.Event('change', { bubbles: true }));

  const labels = [...root.querySelectorAll(`[data-role="skill-check"][data-slot="${slot}"]`)]
    .map((box) => box.closest('label')?.textContent ?? '');
  assert.equal(
    labels.some((text) => text.includes('紡がれた記憶') && text.includes('[マスター]') && text.includes('[パッシブ]')),
    true,
    'master passive should show both master and passive tags'
  );
});
