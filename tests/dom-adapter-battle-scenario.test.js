import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BattleDomAdapter,
  grantExtraTurn,
  CharacterStyle,
  Party,
  createBattleStateFromParty,
} from '../src/index.js';
import { getStore, getSixUsableStyleIds } from './helpers.js';
import { createRoot, setFrontlineNormalAttackSelections } from './dom-adapter-test-utils.js';

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

test('record table omits target enemy label when only one enemy exists', () => {
  const store = getStore();
  const { root } = createRoot();
  const adapter = new BattleDomAdapter({ root, dataStore: store, initialSP: 10 });

  adapter.mount();
  adapter.commitCurrentTurn();

  const rowText = root.querySelector('[data-role="record-body"] tr')?.textContent ?? '';
  assert.equal(rowText.includes('-> Enemy 1'), false);
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

  const destructionRateInput = root.querySelector(
    '[data-role="enemy-destruction-rate-input"][data-enemy-index="1"]'
  );
  assert.ok(destructionRateInput);
  destructionRateInput.value = '250';
  destructionRateInput.dispatchEvent(new win.Event('change', { bubbles: true }));

  assert.equal(adapter.state.turnState.enemyState.enemyNamesByEnemy['1'], 'Boss B');
  assert.equal(adapter.state.turnState.enemyState.damageRatesByEnemy['1'].Fire, 50);
  assert.equal(adapter.state.turnState.enemyState.destructionRateByEnemy['1'], 250);
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
