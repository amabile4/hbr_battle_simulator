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
  assert.equal(text.includes('東城 つかさ : [[Overdrive]] オーバードライブ中 ダメージアップ'), true);
});

test('passive log panel shows battle-start passive descriptions on initialize', () => {
  const store = getStore();
  const { root } = createRoot();
  const adapter = new BattleDomAdapter({ root, dataStore: store, initialSP: 10 });
  adapter.mount();

  adapter.initializeBattle([1004307, 1001104, 1001204, 1001504, 1001401, 1001701], {
    limitBreakLevelsByPartyIndex: { 0: 3 },
  });

  const text = root.querySelector('[data-role="passive-log-output"]')?.textContent ?? '';
  assert.equal(text.includes('T1'), true);
  assert.equal(text.includes('桐生 美也 : [夏のひより] 初戦開始時 火属性スタイルに火の印を付与する(ターン永続/解除不可)'), true);
  assert.equal(text.includes('朝倉 可憐 : [玄人] 自身のクリティカル率を常時+100%'), true);
  assert.equal(text.includes('和泉 ユキ : [遥拝の君] 味方の攻撃で敵をブレイクしたとき敵のダウンターンを1ターン延長'), true);
});

test('direct click actions are routed through runSafely', () => {
  const store = getStore();
  const { root, win } = createRoot();
  const adapter = new BattleDomAdapter({ root, dataStore: store, initialSP: 10 });
  adapter.mount();

  adapter.clearRecordsState = () => {
    throw new Error('clear failed');
  };

  const button = root.querySelector('[data-action="clear-records"]');
  assert.ok(button);
  assert.doesNotThrow(() => {
    button.dispatchEvent(new win.Event('click', { bubbles: true }));
  });
  assert.equal((root.querySelector('[data-role="status"]')?.textContent ?? '').includes('clear failed'), true);
});

test('delegated change actions are routed through runSafely', () => {
  const store = getStore();
  const { root, win } = createRoot();
  const adapter = new BattleDomAdapter({ root, dataStore: store, initialSP: 10 });
  adapter.mount();

  adapter.onCharacterSelectionChanged = () => {
    throw new Error('change failed');
  };

  const select = root.querySelector('[data-role="character-select"][data-slot="0"]');
  assert.ok(select);
  const alternative = [...select.options].find((option) => option.value !== select.value);
  assert.ok(alternative);

  select.value = String(alternative.value);
  assert.doesNotThrow(() => {
    select.dispatchEvent(new win.Event('change', { bubbles: true }));
  });
  assert.equal((root.querySelector('[data-role="status"]')?.textContent ?? '').includes('change failed'), true);
});

test('mount falls back to empty selection store when localStorage read throws', () => {
  const store = getStore();
  const { root, win } = createRoot();
  const adapter = new BattleDomAdapter({ root, dataStore: store, initialSP: 10 });
  const storageProto = Object.getPrototypeOf(win.localStorage);
  const originalGetItem = storageProto.getItem;

  storageProto.getItem = () => {
    throw new Error('storage read failed');
  };

  try {
    assert.doesNotThrow(() => {
      adapter.mount();
    });
    const select = root.querySelector('[data-role="selection-slot-select"]');
    assert.ok(select);
    assert.equal(select.options.length >= 2, true);
  } finally {
    storageProto.getItem = originalGetItem;
  }
});

test('readSelectionStore migrates legacy manual-slot array into current slot layout', () => {
  const store = getStore();
  const { root, win } = createRoot();
  const adapter = new BattleDomAdapter({ root, dataStore: store, initialSP: 10 });
  const legacy = {
    schemaVersion: 1,
    slots: Array(10).fill(null),
  };
  legacy.slots[0] = { savedAt: '2000-01-01T00:00:00.000Z', extras: { slot: 1 } };
  legacy.slots[9] = { savedAt: '2000-01-02T00:00:00.000Z', extras: { slot: 10 } };
  win.localStorage.setItem('hbr.battle_simulator.selection_slots.v1', JSON.stringify(legacy));

  const saved = adapter.readSelectionStore();

  assert.equal(saved.schemaVersion, 1);
  assert.equal(saved.slots.length, 11);
  assert.equal(saved.slots[0], null);
  assert.deepEqual(saved.slots[1]?.extras, { slot: 1 });
  assert.deepEqual(saved.slots[10]?.extras, { slot: 10 });
});

test('readSelectionStore falls back to empty store when saved schema is invalid', () => {
  const store = getStore();
  const { root, win } = createRoot();
  const adapter = new BattleDomAdapter({ root, dataStore: store, initialSP: 10 });
  win.localStorage.setItem(
    'hbr.battle_simulator.selection_slots.v1',
    JSON.stringify({ schemaVersion: 999, slots: ['unexpected'] })
  );

  const saved = adapter.readSelectionStore();

  assert.equal(saved.schemaVersion, 1);
  assert.equal(saved.slots.length, 11);
  assert.equal(saved.slots.every((slot) => slot === null), true);
});

test('save selection surfaces localStorage write failures via runSafely', () => {
  const store = getStore();
  const { root, win } = createRoot();
  const adapter = new BattleDomAdapter({ root, dataStore: store, initialSP: 10 });
  const storageProto = Object.getPrototypeOf(win.localStorage);
  const originalSetItem = storageProto.setItem;
  const originalConfirm = win.confirm;
  adapter.mount();

  win.confirm = () => true;
  storageProto.setItem = () => {
    throw new Error('storage write failed');
  };

  try {
    const button = root.querySelector('[data-action="save-selection"]');
    assert.ok(button);
    assert.doesNotThrow(() => {
      button.dispatchEvent(new win.Event('click', { bubbles: true }));
    });
    assert.equal(
      (root.querySelector('[data-role="status"]')?.textContent ?? '').includes(
        'Selection save failed: storage write failed'
      ),
      true
    );
  } finally {
    win.confirm = originalConfirm;
    storageProto.setItem = originalSetItem;
  }
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

  const originalListPassivesByStyleId = store.listPassivesByStyleId.bind(store);

  const slot = 0;
  const characterSelect = root.querySelector(`[data-role="character-select"][data-slot="${slot}"]`);
  const styleSelect = root.querySelector(`[data-role="style-select"][data-slot="${slot}"]`);
  const lbSelect = root.querySelector(`[data-role="limit-break-select"][data-slot="${slot}"]`);
  const driveSelect = root.querySelector(`[data-role="drive-pierce-select"][data-slot="${slot}"]`);
  const startSpEquipSelect = root.querySelector(
    `[data-role="start-sp-equip-select"][data-slot="${slot}"]`
  );
  const motivationSelect = root.querySelector(`[data-role="motivation-select"][data-slot="${slot}"]`);
  const initialBreakCheckbox = root.querySelector(
    `[data-role="initial-break-checkbox"][data-slot="${slot}"]`
  );
  const initialDpCurrentInput = root.querySelector(
    `[data-role="initial-dp-current-input"][data-slot="${slot}"]`
  );
  const initialDpCapInput = root.querySelector(
    `[data-role="initial-dp-cap-input"][data-slot="${slot}"]`
  );
  const saveSlotSelect = root.querySelector('[data-role="selection-slot-select"]');

  characterSelect.value = 'RKayamori';
  characterSelect.dispatchEvent(new win.Event('change', { bubbles: true }));
  styleSelect.value = '1001108';
  styleSelect.dispatchEvent(new win.Event('change', { bubbles: true }));
  lbSelect.value = '1';
  lbSelect.dispatchEvent(new win.Event('change', { bubbles: true }));
  driveSelect.value = '12';
  driveSelect.dispatchEvent(new win.Event('change', { bubbles: true }));
  startSpEquipSelect.value = '3';
  startSpEquipSelect.dispatchEvent(new win.Event('change', { bubbles: true }));
  initialBreakCheckbox.checked = true;
  initialBreakCheckbox.dispatchEvent(new win.Event('change', { bubbles: true }));
  initialDpCurrentInput.value = '91';
  initialDpCurrentInput.dispatchEvent(new win.Event('change', { bubbles: true }));
  initialDpCapInput.value = '105';
  initialDpCapInput.dispatchEvent(new win.Event('change', { bubbles: true }));
  const selectedStyleId = Number(styleSelect.value);
  store.listPassivesByStyleId = (styleId, options = {}) => {
    const list = originalListPassivesByStyleId(styleId, options);
    if (Number(styleId) !== selectedStyleId) {
      return list;
    }
    return [
      ...list,
      {
        passiveId: 999001,
        name: 'プレイボール',
        parts: [{ skill_type: 'Motivation', target_type: 'AllyAll', power: [5, 0] }],
      },
    ];
  };
  adapter.syncMotivationSelectionControls();
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
  assert.equal(initialBreakCheckbox.checked, true);
  assert.equal(initialDpCurrentInput.value, '91');
  assert.equal(initialDpCapInput.value, '105');
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
  assert.ok(preview.includes('Break=ON'), 'preview should include saved break state');
  assert.ok(preview.includes('DP=91/70 Cap=105'), 'preview should include saved DP state');
  const summary = root.querySelector('[data-role="selection-summary"]').textContent ?? '';
  assert.ok(summary.includes('やる気=絶好調(5)'), 'summary should include selected motivation');
  assert.ok(summary.includes('Break=ON'), 'summary should include selected break state');
});

test('initialize battle applies selected motivation and preserves it in turn plan base setup', () => {
  const store = getStore();
  const { root, win } = createRoot();
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
        passiveId: 999002,
        name: 'プレイボール',
        parts: [{ skill_type: 'Motivation', target_type: 'AllyAll', power: [5, 0] }],
      },
    ];
  };
  adapter.syncMotivationSelectionControls();

  const motivation0 = root.querySelector('[data-role="motivation-select"][data-slot="0"]');
  const motivation1 = root.querySelector('[data-role="motivation-select"][data-slot="1"]');
  const initialDpCurrent0 = root.querySelector('[data-role="initial-dp-current-input"][data-slot="0"]');
  const initialDpCap0 = root.querySelector('[data-role="initial-dp-cap-input"][data-slot="0"]');
  const initialDpCurrent1 = root.querySelector('[data-role="initial-dp-current-input"][data-slot="1"]');
  const initialDpCap1 = root.querySelector('[data-role="initial-dp-cap-input"][data-slot="1"]');
  const initialBreak0 = root.querySelector('[data-role="initial-break-checkbox"][data-slot="0"]');
  motivation0.value = '5';
  motivation0.dispatchEvent(new win.Event('change', { bubbles: true }));
  motivation1.value = '1';
  motivation1.dispatchEvent(new win.Event('change', { bubbles: true }));
  initialBreak0.checked = true;
  initialBreak0.dispatchEvent(new win.Event('change', { bubbles: true }));
  initialDpCurrent0.value = '84';
  initialDpCurrent0.dispatchEvent(new win.Event('change', { bubbles: true }));
  initialDpCap0.value = '98';
  initialDpCap0.dispatchEvent(new win.Event('change', { bubbles: true }));
  initialDpCurrent1.value = '17';
  initialDpCurrent1.dispatchEvent(new win.Event('change', { bubbles: true }));
  initialDpCap1.value = '50';
  initialDpCap1.dispatchEvent(new win.Event('change', { bubbles: true }));

  adapter.initializeBattle();

  assert.equal(adapter.party.members[0].motivationState.current, 5);
  assert.equal(adapter.party.members[1].motivationState.current, 1);
  assert.equal(adapter.party.members[0].isBreak, true);
  assert.equal(adapter.party.members[0].dpState.currentDp, 84);
  assert.equal(adapter.party.members[0].dpState.effectiveDpCap, 98);
  assert.equal(adapter.party.members[1].dpState.currentDp, 17);
  assert.equal(adapter.party.members[1].dpState.effectiveDpCap, 50);
  assert.equal(adapter.turnPlanBaseSetup.initialMotivationByPartyIndex['0'], 5);
  assert.equal(adapter.turnPlanBaseSetup.initialMotivationByPartyIndex['1'], 1);
  assert.equal(adapter.turnPlanBaseSetup.initialBreakByPartyIndex['0'], true);
  assert.equal(adapter.turnPlanBaseSetup.initialDpStateByPartyIndex['0'].currentDp, 84);
  assert.equal(adapter.turnPlanBaseSetup.initialDpStateByPartyIndex['0'].effectiveDpCap, 98);
  assert.equal(adapter.turnPlanBaseSetup.initialDpStateByPartyIndex['1'].currentDp, 17);
  assert.equal(adapter.turnPlanBaseSetup.initialDpStateByPartyIndex['1'].effectiveDpCap, 50);
});

test('InitializeBattle ボタン click で buildPartyFromStyleIds エラーにならないこと', () => {
  const store = getStore();
  const { root, win } = createRoot();
  const adapter = new BattleDomAdapter({ root, dataStore: store, initialSP: 10 });
  adapter.mount();

  // ボタンクリックで MouseEvent が initializeBattle の第一引数に渡されると
  // styleIds = MouseEvent になり "requires exactly 6 style IDs" エラーになる（修正前の挙動）
  const btn = root.querySelector('[data-action="initialize"]');
  btn.dispatchEvent(new win.Event('click', { bubbles: true }));

  const status = adapter.getStatus?.() ?? '';
  assert.ok(
    !String(status).startsWith('Error:'),
    `Expected no error but got: ${status}`
  );
});
