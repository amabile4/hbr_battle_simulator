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
import { createRoot } from './dom-adapter-test-utils.js';

test('motivation select stays disabled without motivation source and defaults to none', () => {
  const store = getStore();
  const { root } = createRoot();
  const adapter = new BattleDomAdapter({ root, dataStore: store, initialSP: 10 });
  adapter.mount();
  adapter.selectedPartyHasMotivationSource = () => false;
  adapter.syncMotivationSelectionControls();
  adapter.updateSlotSummary(0);
  adapter.renderSelectionSummary();

  const motivation0 = root.querySelector('[data-role="motivation-select"][data-slot="0"]');
  const summary = root.querySelector('[data-role="selection-summary"]').textContent ?? '';
  const slotSummary = root.querySelector('[data-role="slot-summary"][data-slot="0"]')?.textContent ?? '';

  assert.equal(motivation0.disabled, true);
  assert.equal(motivation0.value, '0');
  assert.equal(summary.includes('やる気='), false);
  assert.equal(slotSummary.includes('やる気初期値: -'), true);

  adapter.initializeBattle();
  assert.equal(adapter.party.members[0].motivationState.current, 0);
  assert.equal(adapter.turnPlanBaseSetup.initialMotivationByPartyIndex['0'], 0);
});

test('motivation select becomes enabled and defaults to normal when party has a motivation source', () => {
  const store = getStore();
  const { root } = createRoot();
  const adapter = new BattleDomAdapter({ root, dataStore: store, initialSP: 10 });
  adapter.mount();
  const originalListPassivesByStyleId = store.listPassivesByStyleId.bind(store);
  const slot0StyleId = Number(
    root.querySelector('[data-role="style-select"][data-slot="0"]')?.value ?? 0
  );
  store.listPassivesByStyleId = (styleId, options = {}) => {
    const list = originalListPassivesByStyleId(styleId, options);
    if (Number(styleId) !== slot0StyleId) {
      return list;
    }
    return [
      ...list,
      {
        passiveId: 999003,
        name: 'プレイボール',
        parts: [{ skill_type: 'Motivation', target_type: 'AllyAll', power: [5, 0] }],
      },
    ];
  };

  adapter.syncMotivationSelectionControls();
  adapter.updateSlotSummary(0);
  adapter.renderSelectionSummary();

  const motivation0 = root.querySelector('[data-role="motivation-select"][data-slot="0"]');
  const motivation1 = root.querySelector('[data-role="motivation-select"][data-slot="1"]');
  const summary = root.querySelector('[data-role="selection-summary"]').textContent ?? '';
  const slotSummary = root.querySelector('[data-role="slot-summary"][data-slot="0"]')?.textContent ?? '';

  assert.equal(motivation0.disabled, false);
  assert.equal(motivation1.disabled, false);
  assert.equal(motivation0.value, '3');
  assert.equal(motivation1.value, '3');
  assert.equal(summary.includes('やる気=普通(3)'), true);
  assert.equal(slotSummary.includes('やる気初期値: 普通(3)'), true);
});

test('party state shows motivation icons only when party has a motivation source', () => {
  const store = getStore();
  const { root } = createRoot();
  const adapter = new BattleDomAdapter({ root, dataStore: store, initialSP: 10 });
  adapter.mount();

  const plainParty = new Party(
    Array.from({ length: 6 }, (_, idx) =>
      new CharacterStyle({
        characterId: `PM${idx + 1}`,
        characterName: `PM${idx + 1}`,
        styleId: idx + 1,
        styleName: `PS${idx + 1}`,
        partyIndex: idx,
        position: idx,
        initialSP: 10,
        initialMotivation: idx === 0 ? 5 : 3,
        skills: [{ id: 9000 + idx, name: '通常', sp_cost: 0, parts: [] }],
      })
    )
  );
  adapter.party = plainParty;
  adapter.state = createBattleStateFromParty(plainParty);
  adapter.renderPartyState();
  let partyState = root.querySelector('[data-role="party-state"]').textContent ?? '';
  assert.equal(partyState.includes('🩷'), false);
  assert.equal(partyState.includes('🟣'), false);
  assert.equal(partyState.includes('Motivation='), false);

  const motivationParty = new Party(
    Array.from({ length: 6 }, (_, idx) =>
      new CharacterStyle({
        characterId: `MM${idx + 1}`,
        characterName: `MM${idx + 1}`,
        styleId: idx + 11,
        styleName: `MS${idx + 1}`,
        partyIndex: idx,
        position: idx,
        initialSP: 10,
        initialMotivation: idx === 0 ? 5 : idx === 1 ? 1 : 3,
        passives:
          idx === 0
            ? [
                {
                  id: 9100,
                  name: 'プレイボール',
                  timing: 'OnFirstBattleStart',
                  parts: [{ skill_type: 'Motivation', target_type: 'AllyAll', power: [5, 0] }],
                },
              ]
            : [],
        skills: [{ id: 9100 + idx, name: '通常', sp_cost: 0, parts: [] }],
      })
    )
  );
  adapter.party = motivationParty;
  adapter.state = createBattleStateFromParty(motivationParty);
  adapter.renderPartyState();
  partyState = root.querySelector('[data-role="party-state"]').textContent ?? '';
  assert.equal(partyState.includes('🩷'), true);
  assert.equal(partyState.includes('🟣'), true);
  assert.equal(partyState.includes('Motivation='), false);
});

test('party state shows small mark icons after motivation icon', () => {
  const store = getStore();
  const { root } = createRoot();
  const adapter = new BattleDomAdapter({ root, dataStore: store, initialSP: 10 });
  adapter.mount();

  const party = new Party(
    Array.from({ length: 6 }, (_, idx) =>
      new CharacterStyle({
        characterId: `MK${idx + 1}`,
        characterName: `MK${idx + 1}`,
        styleId: idx + 21,
        styleName: `MKS${idx + 1}`,
        partyIndex: idx,
        position: idx,
        initialSP: 10,
        initialMotivation: idx === 0 ? 5 : 3,
        markStates:
          idx === 0
            ? {
                Fire: { current: 6, min: 0, max: 6 },
                Thunder: { current: 2, min: 0, max: 6 },
                Dark: { current: 4, min: 0, max: 6 },
                Light: { current: 1, min: 0, max: 6 },
              }
            : {},
        passives:
          idx === 0
            ? [
                {
                  id: 9200,
                  name: 'プレイボール',
                  timing: 'OnFirstBattleStart',
                  parts: [{ skill_type: 'Motivation', target_type: 'AllyAll', power: [5, 0] }],
                },
              ]
            : [],
        skills: [{ id: 9200 + idx, name: '通常', sp_cost: 0, parts: [] }],
      })
    )
  );

  adapter.party = party;
  adapter.state = createBattleStateFromParty(party);
  adapter.renderPartyState();

  const firstRow = root.querySelector('[data-role="party-state"] li');
  const icons = [...firstRow.querySelectorAll('.mark-icon')].map((img) => img.getAttribute('src'));
  const levels = [...firstRow.querySelectorAll('.mark-level')].map((node) => node.textContent ?? '');

  assert.equal(firstRow.textContent.includes('🩷'), true);
  assert.deepEqual(icons, [
    './assets/marks/FireMark.webp',
    './assets/marks/ThunderMark.webp',
    './assets/marks/DarkMark.svg',
    './assets/marks/LightMark.svg',
  ]);
  assert.deepEqual(levels, ['6', '2', '4', '1']);
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
  adapter.commitCurrentTurn();

  assert.equal(adapter.pendingSwapEvents.length, 0);
  assert.equal(adapter.recordStore.records.length, 1);
  assert.equal(adapter.recordStore.records[0].swapEvents.length, 1);
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

test('turn plan edit row starts staged edit session and updates status message', () => {
  const store = getStore();
  const { root } = createRoot();
  const adapter = new BattleDomAdapter({ root, dataStore: store, initialSP: 10 });
  adapter.mount();

  adapter.previewCurrentTurn();
  adapter.commitCurrentTurn();

  const editButton = root.querySelector(
    '[data-role="record-body"] tr:nth-child(1) [data-action="turn-plan-edit-row"]'
  );
  assert.ok(editButton);

  editButton.click();

  assert.equal(adapter.turnPlanEditSession?.type, 'edit');
  assert.equal(adapter.turnPlanEditSession?.targetIndex, 0);
  assert.equal(root.querySelector('[data-role="status"]')?.textContent, 'Turn 1 を編集中です。');
});

test('serializeRecordField falls back to String(value) when JSON.stringify throws', () => {
  const store = getStore();
  const { root } = createRoot();
  const adapter = new BattleDomAdapter({ root, dataStore: store, initialSP: 10 });
  adapter.mount();

  const circular = {};
  circular.self = circular;

  assert.equal(adapter.serializeRecordField(circular), '[object Object]');
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
  adapter.applyScenarioEnemyDestructionRates({ 0: 300 });
  adapter.state.party[0].setDpState({ currentDp: 84, effectiveDpCap: 98 });
  adapter.state.party[1].setDpState({ currentDp: 0, effectiveDpCap: adapter.state.party[1].dpState.baseMaxDp });
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
  adapter.state.turnState.enemyState = {
    ...adapter.state.turnState.enemyState,
    statuses: [
      { statusType: 'Break', targetIndex: 0, remainingTurns: 0 },
      { statusType: 'DownTurn', targetIndex: 0, remainingTurns: 2 },
      { statusType: 'SuperDown', targetIndex: 0, remainingTurns: 0 },
    ],
    destructionRateCapByEnemy: { 0: 600 },
    breakStateByEnemy: {
      0: {
        baseCap: 300,
        strongBreakActive: false,
        superDown: { preRate: 250, preCap: 300 },
      },
    },
  };

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
  assert.deepEqual(adapter.turnPlans[0].setupDelta.enemyDestructionRates, {
    0: 300,
  });
  assert.deepEqual(adapter.turnPlans[0].setupDelta.enemyDestructionRateCaps, {
    0: 600,
  });
  assert.deepEqual(adapter.turnPlans[0].setupDelta.enemyBreakStates, {
    0: {
      baseCap: 300,
      strongBreakActive: false,
      superDown: { preRate: 250, preCap: 300 },
    },
  });
  assert.equal(Array.isArray(adapter.turnPlans[0].setupDelta.enemyStatuses), true);
  assert.equal(adapter.turnPlans[0].setupDelta.dpStateByPartyIndex['0'].currentDp, 84);
  assert.equal(adapter.turnPlans[0].setupDelta.dpStateByPartyIndex['0'].effectiveDpCap, 98);
  assert.equal(adapter.turnPlans[0].setupDelta.dpStateByPartyIndex['1'].currentDp, 0);
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
  assert.deepEqual(adapter.state.turnState.enemyState.destructionRateByEnemy, {
    0: 300,
  });
  assert.deepEqual(adapter.state.turnState.enemyState.destructionRateCapByEnemy, {
    0: 600,
  });
  assert.deepEqual(adapter.state.turnState.enemyState.breakStateByEnemy, {
    0: {
      baseCap: 300,
      strongBreakActive: false,
      superDown: { preRate: 250, preCap: 300 },
    },
  });
  assert.deepEqual(adapter.state.turnState.enemyState.statuses, [
    { statusType: 'Break', targetIndex: 0, remainingTurns: 0 },
    { statusType: 'DownTurn', targetIndex: 0, remainingTurns: 1 },
    { statusType: 'SuperDown', targetIndex: 0, remainingTurns: 0 },
  ]);
  assert.deepEqual(adapter.state.turnState.zoneState, {
    type: 'Fire',
    sourceSide: 'player',
    remainingTurns: 7,
  });
  assert.equal(adapter.state.party[0].dpState.currentDp, 84);
  assert.equal(adapter.state.party[0].dpState.effectiveDpCap, 98);
  assert.equal(adapter.state.party[1].dpState.currentDp, 0);
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

test('turn plan force recalculation records warnings for skipped invalid swaps', () => {
  const store = getStore();
  const { root } = createRoot();
  const adapter = new BattleDomAdapter({ root, dataStore: store, initialSP: 10 });
  adapter.mount();

  adapter.previewCurrentTurn();
  adapter.commitCurrentTurn();
  assert.equal(adapter.turnPlans.length, 1);

  adapter.turnPlans[0] = {
    ...adapter.turnPlans[0],
    swaps: [
      {
        fromCharacterId: 'UNKNOWN_MEMBER',
        toCharacterId: String(adapter.party.getFrontline()[0]?.characterId ?? ''),
      },
    ],
  };

  adapter.recalculateTurnPlans({ mode: 'force' });

  assert.equal(adapter.turnPlanReplayError, null);
  assert.equal(adapter.recordStore.records.length, 1);
  assert.equal(Array.isArray(adapter.turnPlanReplayWarnings[0]), true);
  assert.equal(
    adapter.turnPlanReplayWarnings[0].some((message) => String(message).includes('swap skipped')),
    true
  );
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

test('dp debug controls update current DP and cap with clamp', () => {
  const store = getStore();
  const { root, win } = createRoot();
  const adapter = new BattleDomAdapter({ root, dataStore: store, initialSP: 10 });
  adapter.mount();

  const member = adapter.state.party[0];
  assert.ok(member);
  const getCurrentInput = () =>
    root.querySelector(`[data-role="dp-debug-current-input"][data-character-id="${member.characterId}"]`);
  const getCapInput = () =>
    root.querySelector(`[data-role="dp-debug-cap-input"][data-character-id="${member.characterId}"]`);

  let currentInput = getCurrentInput();
  let capInput = getCapInput();
  assert.ok(currentInput);
  assert.ok(capInput);
  assert.equal(member.dpState.currentDp, member.dpState.baseMaxDp);

  currentInput.value = '95';
  currentInput.dispatchEvent(new win.Event('change', { bubbles: true }));
  assert.equal(member.dpState.currentDp, 95);
  assert.equal(member.dpState.effectiveDpCap, 95);

  capInput = getCapInput();
  capInput.value = '105';
  capInput.dispatchEvent(new win.Event('change', { bubbles: true }));
  assert.equal(member.dpState.effectiveDpCap, 105);

  currentInput = getCurrentInput();
  currentInput.value = '95';
  currentInput.dispatchEvent(new win.Event('change', { bubbles: true }));
  assert.equal(member.dpState.currentDp, 95);

  capInput = getCapInput();
  capInput.value = '60';
  capInput.dispatchEvent(new win.Event('change', { bubbles: true }));
  assert.equal(member.dpState.effectiveDpCap, 60);
  assert.equal(member.dpState.currentDp, 60);

  const rows = [...root.querySelectorAll('[data-role="party-state"] li')].map((li) => li.textContent ?? '');
  assert.equal(
    rows.some((line) => line.includes(`${member.characterName}`) && line.includes('DP=60/30 Cap=60')),
    true
  );
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

  const target = adapter.characterCandidates
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

test('character candidate filter limits selection options without changing default slot wiring', () => {
  const store = getStore();
  const { root } = createRoot();
  const labels = ['RKayamori', 'YIzumi', 'MAikawa', 'TTojo', 'KAsakura', 'TKunimi'];
  const adapter = new BattleDomAdapter({
    root,
    dataStore: store,
    initialSP: 10,
    characterCandidateLabels: labels,
  });
  adapter.mount();

  const characterSelect = root.querySelector('[data-role="character-select"][data-slot="0"]');
  const optionLabels = [...characterSelect.options].map((option) => String(option.value));

  assert.deepEqual(optionLabels, labels);
  assert.equal(characterSelect.value, 'RKayamori');
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

  const candidates = adapter.characterCandidates;
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
  styleSelect.value = '1001101';
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
  assert.equal(text.includes('implemented:'), true);
  assert.equal(text.includes('DpRate'), true);
  assert.equal(text.includes('stateful_future: -'), true);
  assert.equal(text.includes('Selected Style: 閃光のサーキットバースト'), true);
  assert.equal(text.includes('review_needed: -'), true);
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
  styleSelect.value = '1001408';
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

  characterSelect.value = 'KMaruyama';
  characterSelect.dispatchEvent(new win.Event('change', { bubbles: true }));
  styleSelect.value = '1007205';
  styleSelect.dispatchEvent(new win.Event('change', { bubbles: true }));

  const maruyamaSkillIds = getSkillIds();
  assert.equal(maruyamaSkillIds.includes(46007206), true, 'ヴォイドストーム should be usable via generalize');
  assert.equal(maruyamaSkillIds.includes(46007214), true, '勇気の灯火 should be shared as normal skill');

  characterSelect.value = 'RKayamori';
  characterSelect.dispatchEvent(new win.Event('change', { bubbles: true }));
  styleSelect.value = '1001103';
  styleSelect.dispatchEvent(new win.Event('change', { bubbles: true }));
  const rkNonAdmiralSkillIds = getSkillIds();
  assert.equal(rkNonAdmiralSkillIds.includes(46001134), false, '指揮行動 should be hidden on non-Admiral');

  styleSelect.value = '1001111';
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
  styleSelect.value = '1001111';
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
