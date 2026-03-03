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
      <div data-role="action-slots"></div>
      <select data-role="swap-from"><option value="0">0</option></select>
      <select data-role="swap-to"><option value="3">3</option></select>
      <button data-action="swap"></button>
      <button data-action="preview"></button>
      <button data-action="commit"></button>
      <button data-action="open-interrupt-od" hidden></button>
      <span data-role="interrupt-od-badge"></span>
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
      <button data-action="export-csv"></button>
      <span data-role="turn-label"></span>
      <span data-role="status"></span>
      <ul data-role="party-state"></ul>
      <pre data-role="preview-output"></pre>
      <tbody data-role="record-body"></tbody>
      <textarea data-role="csv-output"></textarea>
    </div>
  </body>`, { url: 'https://example.test/' });

  return {
    root: dom.window.document.querySelector('#app'),
    win: dom.window,
  };
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

test('OD controls: preemptive activation and interrupt reservation/commit', () => {
  const store = getStore();
  const { root } = createRoot();
  const adapter = new BattleDomAdapter({ root, dataStore: store, initialSP: 10 });
  adapter.mount();

  const interruptButton = root.querySelector('[data-action="open-interrupt-od"]');
  assert.equal(interruptButton.hidden, true, 'interrupt button should be hidden when od gauge < 100');

  adapter.state.turnState.odGauge = 120;
  adapter.renderTurnStatus();
  assert.equal(interruptButton.hidden, false, 'interrupt button should be visible when od gauge >= 100');

  adapter.openOdDialog('normal');
  adapter.confirmOdDialog('normal');
  assert.equal(adapter.state.turnState.turnType, 'od');
  assert.equal(adapter.state.turnState.odGauge, 20);

  // reset and test interrupt path
  adapter.initializeBattle();
  adapter.state.turnState.odGauge = 150;
  adapter.renderTurnStatus();
  adapter.openOdDialog('interrupt');
  const interruptSelect = root.querySelector('[data-role="interrupt-od-level"]');
  interruptSelect.value = '1';
  adapter.confirmOdDialog('interrupt');

  adapter.previewCurrentTurn();
  adapter.commitCurrentTurn();
  assert.equal(adapter.state.turnState.turnType, 'od');
  assert.equal(adapter.state.turnState.odContext, 'interrupt');
  assert.equal(adapter.state.turnState.odGauge < 150, true);
});

test('interrupt OD button is shown in extra turn when gauge requirement is satisfied', () => {
  const store = getStore();
  const { root } = createRoot();
  const adapter = new BattleDomAdapter({ root, dataStore: store, initialSP: 10 });
  adapter.mount();

  const exCharacterId = adapter.state.party.find((member) => member.position === 0)?.characterId;
  adapter.state = grantExtraTurn(adapter.state, [exCharacterId]);
  adapter.state.turnState.odGauge = 120;
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
  const saveSlotSelect = root.querySelector('[data-role="selection-slot-select"]');

  characterSelect.value = 'RKayamori';
  characterSelect.dispatchEvent(new win.Event('change', { bubbles: true }));
  styleSelect.value = '1001108'; // The Feel of the Throne (SSR)
  styleSelect.dispatchEvent(new win.Event('change', { bubbles: true }));
  lbSelect.value = '1';
  lbSelect.dispatchEvent(new win.Event('change', { bubbles: true }));
  driveSelect.value = '12';
  driveSelect.dispatchEvent(new win.Event('change', { bubbles: true }));

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
  if (target) {
    const restored = [...root.querySelectorAll(`[data-role="skill-check"][data-slot="${slot}"]`)].find(
      (box) => (box.closest('label')?.textContent ?? '').includes('エクシード・ルミナンス')
    );
    assert.equal(restored?.checked, false, 'skill checkbox state should be restored');
  }

  const preview = root.querySelector('[data-role="selection-slot-preview"]').textContent ?? '';
  assert.ok(preview.includes('savedAt:'), 'preview should show saved timestamp');
  assert.ok(preview.includes('P1:'), 'preview should show party lines');
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

  // EX member selected as source => no valid target (only one EX)
  swapFrom.value = '0';
  swapFrom.dispatchEvent(new win.Event('change', { bubbles: true }));
  const toValuesForExFrom = [...swapTo.options].map((option) => option.value);
  assert.equal(toValuesForExFrom.length, 1);
  assert.equal(toValuesForExFrom[0], '', 'EX source should have no normal target candidates');

  // Normal member selected as source => only normal candidates
  swapFrom.value = '3';
  swapFrom.dispatchEvent(new win.Event('change', { bubbles: true }));
  const toValuesForNormalFrom = [...swapTo.options].map((option) => Number(option.value));
  assert.equal(
    toValuesForNormalFrom.includes(0),
    false,
    'normal source should not be able to pick EX target'
  );

  assert.throws(
    () => adapter.queueSwap(0, 5),
    /Swap is allowed only between \[EX\]<->\[EX\] or normal<->normal/
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

test('character -> style selection is linked and reflected on screen', () => {
  const store = getStore();
  const { root, win } = createRoot();
  const adapter = new BattleDomAdapter({ root, dataStore: store, initialSP: 10 });
  adapter.mount();

  const characterSelects = root.querySelectorAll('[data-role="character-select"]');
  const styleSelects = root.querySelectorAll('[data-role="style-select"]');
  const lbSelects = root.querySelectorAll('[data-role="limit-break-select"]');
  const driveSelects = root.querySelectorAll('[data-role="drive-pierce-select"]');
  assert.equal(characterSelects.length, 6);
  assert.equal(styleSelects.length, 6);
  assert.equal(lbSelects.length, 6);
  assert.equal(driveSelects.length, 6);

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
