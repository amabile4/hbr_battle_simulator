import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

import { CharacterStyle, Party, createBattleStateFromParty } from '../src/index.js';
import { TurnRowController } from '../ui-next/components/turn-row.js';
import { TurnAreaController } from '../ui-next/components/turn-area.js';
import { TurnEngineManager } from '../ui-next/engine/turn-engine-manager.js';

class TestResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

function withDom(run) {
  const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
    url: 'https://example.test/',
  });
  const previous = {
    window: globalThis.window,
    document: globalThis.document,
    ResizeObserver: globalThis.ResizeObserver,
    CustomEvent: globalThis.CustomEvent,
    Event: globalThis.Event,
    MouseEvent: globalThis.MouseEvent,
  };

  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.ResizeObserver = TestResizeObserver;
  globalThis.CustomEvent = dom.window.CustomEvent;
  globalThis.Event = dom.window.Event;
  globalThis.MouseEvent = dom.window.MouseEvent;

  try {
    return run({
      dom,
      win: dom.window,
      root: dom.window.document.querySelector('#root'),
    });
  } finally {
    globalThis.window = previous.window;
    globalThis.document = previous.document;
    globalThis.ResizeObserver = previous.ResizeObserver;
    globalThis.CustomEvent = previous.CustomEvent;
    globalThis.Event = previous.Event;
    globalThis.MouseEvent = previous.MouseEvent;
    dom.window.close();
  }
}

function createSkill({ id, name, targetType, parts, condition = '' }) {
  return {
    id,
    name,
    label: `${name}${id}`,
    sp_cost: 0,
    target_type: targetType,
    parts: parts.map((part) => ({
      ...part,
      ...(condition ? { target_condition: condition } : {}),
    })),
  };
}

function createPartyWithActorSkill(actorSkill) {
  const members = Array.from({ length: 6 }, (_, index) =>
    new CharacterStyle({
      characterId: `UI${index + 1}`,
      characterName: `UI${index + 1}`,
      styleId: 9300 + index,
      styleName: `UIS${index + 1}`,
      partyIndex: index,
      position: index,
      initialSP: 10,
      skills: [
        index === 0
          ? actorSkill
          : createSkill({
              id: 9400 + index,
              name: `Protection${index + 1}`,
              targetType: 'Self',
              parts: [{ skill_type: 'Protection', target_type: 'Self' }],
            }),
      ],
    })
  );
  return new Party(members);
}

function createState(actorSkill, enemyCount = 1) {
  const state = createBattleStateFromParty(createPartyWithActorSkill(actorSkill));
  state.turnState.enemyState.enemyCount = enemyCount;
  return state;
}

function createStoreStub() {
  return {
    getStyleById() {
      return null;
    },
  };
}

function mountTurnRow({ root, stateBefore, enemyParams }) {
  const row = new TurnRowController({
    root,
    store: createStoreStub(),
    turnIndex: 0,
    record: null,
    stateBefore,
    stateAfter: null,
    enemyParams,
    odState: {
      preemptiveOdLevel: null,
      interruptOdLevel: null,
      activatablePreemptive: [],
      activatableInterrupt: [],
      kishinkaStatus: { hasTezuka: false },
    },
    onSlotChange: () => {},
    onCommit: () => {},
    onNoteChange: () => {},
    onPreviewRequest: () => {},
    onOdChange: () => {},
    onKishinkaActivate: () => {},
  });
  row.mount();
  return row;
}

test('TurnRowController hides manual target UI for all-target skills even in detailed mode', () =>
  withDom(({ root }) => {
    const state = createState(
      createSkill({
        id: 9501,
        name: 'All Burst',
        targetType: 'All',
        parts: [{ skill_type: 'AttackSkill', target_type: 'All', type: 'Slash' }],
      }),
      3
    );
    mountTurnRow({ root, stateBefore: state, enemyParams: { isDetailedMode: true } });

    assert.equal(root.querySelector('[data-role="target-trigger"]'), null);
    assert.equal(root.querySelector('[data-role="target-popover"]'), null);
  }));

test('TurnRowController shows enemy target trigger only when needed and opens floating popover on demand', () =>
  withDom(({ root, win }) => {
    const state = createState(
      createSkill({
        id: 9502,
        name: 'Single Slash',
        targetType: 'Single',
        parts: [{ skill_type: 'AttackSkill', target_type: 'Single', type: 'Slash' }],
      }),
      3
    );
    mountTurnRow({ root, stateBefore: state, enemyParams: { isDetailedMode: true } });

    const trigger = root.querySelector('[data-role="target-trigger"][data-target-kind="enemy"]');
    const popover = root.querySelector('[data-role="target-popover"][data-target-kind="enemy"]');
    assert.ok(trigger);
    assert.ok(popover);
    assert.equal(popover.hidden, true);

    trigger.dispatchEvent(new win.MouseEvent('click', { bubbles: true }));

    const reopenedPopover = root.querySelector('[data-role="target-popover"][data-target-kind="enemy"]');
    const candidateButtons = root.querySelectorAll('[data-role="target-candidate"][data-target-kind="enemy"]');
    assert.equal(reopenedPopover.hidden, false);
    assert.equal(candidateButtons.length, 3);
  }));

test('TurnRowController shows ally target popover with disabled backline entries for front-only skills', () =>
  withDom(({ root, win }) => {
    const state = createState(
      createSkill({
        id: 9503,
        name: 'Frontline Buff',
        targetType: 'AllySingleWithoutSelf',
        condition: 'IsFront()==1',
        parts: [{ skill_type: 'AdditionalTurn', target_type: 'AllySingleWithoutSelf' }],
      }),
      1
    );
    mountTurnRow({ root, stateBefore: state, enemyParams: { isDetailedMode: true } });

    const trigger = root.querySelector('[data-role="target-trigger"][data-target-kind="ally"]');
    assert.ok(trigger);
    trigger.dispatchEvent(new win.MouseEvent('click', { bubbles: true }));

    const candidateButtons = [...root.querySelectorAll('[data-role="target-candidate"][data-target-kind="ally"]')];
    assert.equal(candidateButtons.length, 6);
    const disabledCount = candidateButtons.filter((button) => button.disabled).length;
    assert.equal(disabledCount, 4);
  }));

test('TurnAreaController carries committed enemyCount into the next input row', () =>
  withDom(({ root, win }) => {
    const state = createState(
      createSkill({
        id: 9504,
        name: 'Single Slash',
        targetType: 'Single',
        parts: [{ skill_type: 'AttackSkill', target_type: 'Single', type: 'Slash' }],
      }),
      1
    );
    const engineManager = new TurnEngineManager();
    const controller = new TurnAreaController({
      root,
      store: createStoreStub(),
      engineManager,
      onError: (error) => {
        throw error;
      },
      onTurnCommitted: () => {},
    });

    controller.initialize(state, {}, { isDetailedMode: true });

    const enemyCountSelect = root.querySelector('[data-role="enemy-count"]');
    enemyCountSelect.value = '3';
    enemyCountSelect.dispatchEvent(new win.Event('change', { bubbles: true }));

    const commitButton = root.querySelector('[data-role="commit-btn"]');
    commitButton.dispatchEvent(new win.MouseEvent('click', { bubbles: true }));

    const latestEnemyCountSelect = root.querySelectorAll('[data-role="enemy-count"]').item(0);
    assert.equal(latestEnemyCountSelect.value, '3');
  }));

test('TurnAreaController reinitialize applies updated detailed-mode setting to the input row', () =>
  withDom(({ root }) => {
    const state = createState(
      createSkill({
        id: 9505,
        name: 'Single Slash',
        targetType: 'Single',
        parts: [{ skill_type: 'AttackSkill', target_type: 'Single', type: 'Slash' }],
      }),
      3
    );
    const engineManager = new TurnEngineManager();
    const controller = new TurnAreaController({
      root,
      store: createStoreStub(),
      engineManager,
      onError: (error) => {
        throw error;
      },
      onTurnCommitted: () => {},
    });

    controller.initialize(state, {}, { isDetailedMode: true });
    assert.ok(root.querySelector('[data-role="target-trigger"][data-target-kind="enemy"]'));

    controller.reinitialize(state, { isDetailedMode: false });

    assert.equal(root.querySelector('[data-role="target-trigger"]'), null);
  }));
