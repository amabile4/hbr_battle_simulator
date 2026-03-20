import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

import { CharacterStyle, Party, createBattleStateFromParty } from '../src/index.js';
import { TurnRowController } from '../ui-next/components/turn-row.js';
import { TurnAreaController } from '../ui-next/components/turn-area.js';
import { TurnEngineManager } from '../ui-next/engine/turn-engine-manager.js';
import { REPLAY_OPERATION_TYPES } from '../src/ui/lightweight-replay-script.js';
import { TARGET_SELECTION_MODES } from '../ui-next/utils/simulator-settings.js';

const MAKAI_KIHEI_STYLE_ID = 1003108;
const MAKAI_KIHEI_SKILL_ID = 46003117;
const TEZUKA_CHARACTER_ID = 'STezuka';
const TEZUKA_STYLE_ID = 1001408;

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

function createMakaiKiheiPassive() {
  return {
    id: 57001285,
    label: 'Passive.Machina_Demon',
    name: '魔界騎兵起動！',
    timing: 'OnBattleStart',
    parts: [
      {
        skill_type: 'SpecialCommandCountUp',
        target_type: 'Self',
        power: [3, 0],
        strval: [
          {
            id: MAKAI_KIHEI_SKILL_ID,
            label: 'BIYamawakiSkill55b',
            name: '魔界騎兵起動',
            hit_count: 6,
            target_type: 'All',
            consume_type: 'Sp',
            is_restricted: 0,
            sp_cost: 0,
            max_level: 1,
            overwrite: 0,
            overwrite_cond: '',
            effect: '',
            cond: '',
            parts: [{ skill_type: 'PenetrationCriticalAttack', target_type: 'All', type: 'Slash' }],
            hits: [
              { id: 1, type: 'Main', power_ratio: 1 / 6 },
              { id: 2, type: 'Main', power_ratio: 1 / 6 },
              { id: 3, type: 'Main', power_ratio: 1 / 6 },
              { id: 4, type: 'Main', power_ratio: 1 / 6 },
              { id: 5, type: 'Main', power_ratio: 1 / 6 },
              { id: 6, type: 'Main', power_ratio: 1 / 6 },
            ],
          },
          -1,
        ],
      },
    ],
  };
}

function createPartyWithActorSkill(actorSkill, actorOptions = {}) {
  const members = Array.from({ length: 6 }, (_, index) =>
    new CharacterStyle({
      characterId: index === 0 ? (actorOptions.characterId ?? 'UI1') : `UI${index + 1}`,
      characterName: index === 0 ? (actorOptions.characterName ?? 'UI1') : `UI${index + 1}`,
      styleId: index === 0 ? (actorOptions.styleId ?? 9300) : 9300 + index,
      styleName: index === 0 ? (actorOptions.styleName ?? 'UIS1') : `UIS${index + 1}`,
      partyIndex: index,
      position: index,
      initialSP: 10,
      skills:
        index === 0
          ? (actorOptions.skills ?? [actorSkill])
          : [
              createSkill({
                id: 9400 + index,
                name: `Protection${index + 1}`,
                targetType: 'Self',
                parts: [{ skill_type: 'Protection', target_type: 'Self' }],
              }),
            ],
      passives: index === 0 ? (actorOptions.passives ?? []) : [],
    })
  );
  return new Party(members);
}

function createState(actorSkill, enemyCount = 1, actorOptions = {}) {
  const state = createBattleStateFromParty(createPartyWithActorSkill(actorSkill, actorOptions));
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

function createSimulatorSettings({
  enemyMode = TARGET_SELECTION_MODES.SIMPLE,
  allyMode = TARGET_SELECTION_MODES.SIMPLE,
} = {}) {
  return {
    targetSelection: {
      enemyMode,
      allyMode,
    },
  };
}

function createTurnAreaController({ root, state, simulatorSettings }) {
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
  controller.initialize(state, {}, simulatorSettings);
  return { controller, engineManager };
}

function mountTurnRow({ root, stateBefore, simulatorSettings }) {
  const row = new TurnRowController({
    root,
    store: createStoreStub(),
    turnIndex: 0,
    record: null,
    replayTurn: null,
    operations: [],
    operationState: {
      kishinkaStatus: { hasTezuka: false },
      makaiKiheiStatus: { hasYamawaki: false, available: false, remainingUses: 0 },
    },
    stateBefore,
    stateAfter: null,
    simulatorSettings,
    odState: {
      preemptiveOdLevel: null,
      interruptOdLevel: null,
      activatablePreemptive: [],
      activatableInterrupt: [],
    },
    onSlotChange: () => {},
    onCommit: () => {},
    onNoteChange: () => {},
    onPreviewRequest: () => {},
    onOdChange: () => {},
    onOperationAdd: () => {},
    onOperationRemove: () => {},
  });
  row.mount();
  return row;
}

test('TurnRowController preserves draft skill and note across rerender without reading DOM state', () =>
  withDom(({ root, win }) => {
    const actorSkill = createSkill({
      id: 9500,
      name: 'Single Slash',
      targetType: 'Single',
      parts: [{ skill_type: 'AttackSkill', target_type: 'Single', type: 'Slash' }],
    });
    const alternateSkill = createSkill({
      id: 9509,
      name: 'Protection Alt',
      targetType: 'Self',
      parts: [{ skill_type: 'Protection', target_type: 'Self' }],
    });
    const state = createBattleStateFromParty(
      createPartyWithActorSkill(actorSkill, {
        skills: [actorSkill, alternateSkill],
      })
    );
    const row = mountTurnRow({
      root,
      stateBefore: state,
      simulatorSettings: createSimulatorSettings(),
    });

    const skillSelect = root.querySelector('[data-skill-select][data-party-index="0"]');
    skillSelect.value = '9509';
    skillSelect.dispatchEvent(new win.Event('change', { bubbles: true }));

    const noteEl = root.querySelector('[data-role="note"]');
    noteEl.value = 'draft-note';
    noteEl.dispatchEvent(new win.Event('input', { bubbles: true }));

    row.update({
      record: null,
      stateBefore: createBattleStateFromParty(
        createPartyWithActorSkill(actorSkill, {
          skills: [actorSkill, alternateSkill],
        })
      ),
      stateAfter: null,
      odState: {
        preemptiveOdLevel: null,
        interruptOdLevel: null,
        activatablePreemptive: [],
        activatableInterrupt: [],
      },
      simulatorSettings: createSimulatorSettings(),
    });

    assert.equal(root.querySelector('[data-skill-select][data-party-index="0"]').value, '9509');
    assert.equal(root.querySelector('[data-role="note"]').value, 'draft-note');
  }));

test('TurnRowController hides manual target UI for all-target skills even when enemy selection is manual', () =>
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
    mountTurnRow({
      root,
      stateBefore: state,
      simulatorSettings: createSimulatorSettings({
        enemyMode: TARGET_SELECTION_MODES.MANUAL,
      }),
    });

    assert.equal(root.querySelector('[data-role="target-trigger"]'), null);
    assert.equal(root.querySelector('[data-role="target-popover"]'), null);
  }));

test('TurnRowController shows enemy target trigger only when enemy selection is manual', () =>
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
    mountTurnRow({
      root,
      stateBefore: state,
      simulatorSettings: createSimulatorSettings({
        enemyMode: TARGET_SELECTION_MODES.MANUAL,
        allyMode: TARGET_SELECTION_MODES.SIMPLE,
      }),
    });

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

test('TurnRowController shows ally target popover only when ally selection is manual', () =>
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
    mountTurnRow({
      root,
      stateBefore: state,
      simulatorSettings: createSimulatorSettings({
        enemyMode: TARGET_SELECTION_MODES.SIMPLE,
        allyMode: TARGET_SELECTION_MODES.MANUAL,
      }),
    });

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

    controller.initialize(
      state,
      {},
      createSimulatorSettings({ enemyMode: TARGET_SELECTION_MODES.MANUAL }),
    );

    const enemyCountSelect = root.querySelector('[data-role="enemy-count"]');
    enemyCountSelect.value = '3';
    enemyCountSelect.dispatchEvent(new win.Event('change', { bubbles: true }));

    const commitButton = root.querySelector('[data-role="commit-btn"]');
    commitButton.dispatchEvent(new win.MouseEvent('click', { bubbles: true }));

    const latestEnemyCountSelect = root.querySelectorAll('[data-role="enemy-count"]').item(0);
    assert.equal(latestEnemyCountSelect.value, '3');
  }));

test('TurnAreaController reinitialize applies updated split target settings to the input row', () =>
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

    controller.initialize(
      state,
      {},
      createSimulatorSettings({ enemyMode: TARGET_SELECTION_MODES.MANUAL }),
    );
    assert.ok(root.querySelector('[data-role="target-trigger"][data-target-kind="enemy"]'));

    controller.reinitialize(
      state,
      createSimulatorSettings({ enemyMode: TARGET_SELECTION_MODES.SIMPLE }),
    );

    assert.equal(root.querySelector('[data-role="target-trigger"]'), null);
  }));

test('TurnAreaController preserves committed enemy explicit target when simulator settings change', () =>
  withDom(({ root, win }) => {
    const state = createState(
      createSkill({
        id: 9506,
        name: 'Pinned Slash',
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

    controller.initialize(
      state,
      {},
      createSimulatorSettings({ enemyMode: TARGET_SELECTION_MODES.MANUAL }),
    );

    const enemyCountSelect = root.querySelector('[data-role="enemy-count"]');
    enemyCountSelect.value = '3';
    enemyCountSelect.dispatchEvent(new win.Event('change', { bubbles: true }));

    root
      .querySelector('[data-role="target-trigger"][data-target-kind="enemy"]')
      .dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
    root
      .querySelector('[data-role="target-candidate"][data-target-kind="enemy"][data-enemy-index="2"]')
      .dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
    root
      .querySelector('[data-role="commit-btn"]')
      .dispatchEvent(new win.MouseEvent('click', { bubbles: true }));

    assert.equal(
      engineManager.computedRecords[0]?.actions.find((action) => action.positionIndex === 0)?.targetEnemyIndex,
      2,
    );

    controller.reinitialize(
      state,
      createSimulatorSettings({
        enemyMode: TARGET_SELECTION_MODES.SIMPLE,
        allyMode: TARGET_SELECTION_MODES.SIMPLE,
      }),
    );

    assert.equal(
      engineManager.computedRecords[0]?.actions.find((action) => action.positionIndex === 0)?.targetEnemyIndex,
      2,
    );
    assert.ok(root.querySelector('[data-role="target-trigger-label"]'));
    assert.equal(root.querySelector('[data-role="target-trigger"][data-target-kind="enemy"]'), null);
  }));

test('TurnAreaController preserves committed ally explicit target when simulator settings change', () =>
  withDom(({ root, win }) => {
    const state = createState(
      createSkill({
        id: 9507,
        name: 'Frontline Buff',
        targetType: 'AllySingleWithoutSelf',
        condition: 'IsFront()==1',
        parts: [{ skill_type: 'AdditionalTurn', target_type: 'AllySingleWithoutSelf' }],
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

    const targetStyleId = state.party.find((member) => member.position === 2)?.styleId;
    const targetCharacterId = state.party.find((member) => member.position === 2)?.characterId;

    controller.initialize(
      state,
      {},
      createSimulatorSettings({ allyMode: TARGET_SELECTION_MODES.MANUAL }),
    );

    root
      .querySelector('[data-role="target-trigger"][data-target-kind="ally"]')
      .dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
    root
      .querySelector(`[data-role="target-candidate"][data-target-kind="ally"][data-style-id="${targetStyleId}"]`)
      .dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
    root
      .querySelector('[data-role="commit-btn"]')
      .dispatchEvent(new win.MouseEvent('click', { bubbles: true }));

    assert.equal(
      engineManager.computedRecords[0]?.actions.find((action) => action.positionIndex === 0)?.targetCharacterId,
      targetCharacterId,
    );

    controller.reinitialize(
      state,
      createSimulatorSettings({
        enemyMode: TARGET_SELECTION_MODES.SIMPLE,
        allyMode: TARGET_SELECTION_MODES.SIMPLE,
      }),
    );

    assert.equal(
      engineManager.computedRecords[0]?.actions.find((action) => action.positionIndex === 0)?.targetCharacterId,
      targetCharacterId,
    );
    assert.ok(root.querySelector('[data-role="target-trigger-label"]'));
    assert.equal(root.querySelector('[data-role="target-trigger"][data-target-kind="ally"]'), null);
  }));

test('TurnAreaController clears uncommitted target picks when simulator settings are reapplied', () =>
  withDom(({ root, win }) => {
    const state = createState(
      createSkill({
        id: 9508,
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

    controller.initialize(
      state,
      {},
      createSimulatorSettings({ enemyMode: TARGET_SELECTION_MODES.MANUAL }),
    );

    const enemyCountSelect = root.querySelector('[data-role="enemy-count"]');
    enemyCountSelect.value = '3';
    enemyCountSelect.dispatchEvent(new win.Event('change', { bubbles: true }));

    root
      .querySelector('[data-role="target-trigger"][data-target-kind="enemy"]')
      .dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
    root
      .querySelector('[data-role="target-candidate"][data-target-kind="enemy"][data-enemy-index="2"]')
      .dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
    assert.match(
      root.querySelector('[data-role="target-trigger"][data-target-kind="enemy"]').textContent,
      /E3/,
    );

    controller.reinitialize(
      state,
      createSimulatorSettings({ enemyMode: TARGET_SELECTION_MODES.SIMPLE }),
    );
    controller.reinitialize(
      state,
      createSimulatorSettings({ enemyMode: TARGET_SELECTION_MODES.MANUAL }),
    );

    assert.match(
      root.querySelector('[data-role="target-trigger"][data-target-kind="enemy"]').textContent,
      /E1/,
    );
  }));

test('TurnAreaController adds Kishinka as an operation chip without mutating note text', () =>
  withDom(({ root, win }) => {
    const state = createState(
      createSkill({
        id: 9510,
        name: 'Tezuka Slash',
        targetType: 'Single',
        parts: [{ skill_type: 'AttackSkill', target_type: 'Single', type: 'Slash' }],
      }),
      1,
      {
        characterId: TEZUKA_CHARACTER_ID,
        characterName: '手塚 咲',
        styleId: TEZUKA_STYLE_ID,
        styleName: '鬼神テスト',
      }
    );
    const { engineManager } = createTurnAreaController({
      root,
      state,
      simulatorSettings: createSimulatorSettings(),
    });

    const noteEl = root.querySelector('[data-role="note"]');
    noteEl.value = '鬼神化メモ';
    noteEl.dispatchEvent(new win.Event('input', { bubbles: true }));

    root.querySelector('[data-role="kishinka-btn"]').click();

    const chipLabels = [...root.querySelectorAll('[data-role="operation-chip"]')].map((chip) =>
      chip.textContent.replace('×', '').trim()
    );
    assert.deepEqual(chipLabels, ['鬼神化']);
    assert.equal(root.querySelector('[data-role="note"]').value, '鬼神化メモ');
    assert.equal(engineManager.getKishinkaStatus().activePending, true);
    assert.equal(engineManager.currentStateWithPending.turnState.odGauge, 15);

    root.querySelector('[data-role="operation-chip-remove"]').click();

    assert.equal(root.querySelector('[data-role="operation-chip"]'), null);
    assert.equal(root.querySelector('[data-role="note"]').value, '鬼神化メモ');
    assert.equal(engineManager.getKishinkaStatus().activePending, false);
    assert.equal(engineManager.currentStateWithPending.turnState.odGauge, 0);
  }));

test('TurnAreaController removes committed Kishinka chips and recalculates the replay turn', () =>
  withDom(({ root }) => {
    const state = createState(
      createSkill({
        id: 9511,
        name: 'Tezuka Slash',
        targetType: 'Single',
        parts: [{ skill_type: 'AttackSkill', target_type: 'Single', type: 'Slash' }],
      }),
      1,
      {
        characterId: TEZUKA_CHARACTER_ID,
        characterName: '手塚 咲',
        styleId: TEZUKA_STYLE_ID,
        styleName: '鬼神テスト',
      }
    );
    const { engineManager } = createTurnAreaController({
      root,
      state,
      simulatorSettings: createSimulatorSettings(),
    });

    root.querySelector('[data-role="kishinka-btn"]').click();
    root.querySelector('[data-role="commit-btn"]').click();

    assert.deepEqual(
      engineManager.replayScript.turns[0].operations.map((operation) => operation.type),
      [REPLAY_OPERATION_TYPES.ACTIVATE_KISHINKA]
    );
    assert.equal(engineManager.getStateBefore(0)?.party?.[0]?.isReinforcedMode, true);

    root.querySelector('[data-role="operation-chip-remove"]').click();

    assert.deepEqual(engineManager.replayScript.turns[0].operations, []);
    assert.equal(engineManager.getStateBefore(0)?.party?.[0]?.isReinforcedMode, false);
    assert.equal(root.querySelector('[data-role="operation-chip"]'), null);
  }));

test('TurnAreaController shows Makai Kihei button only when Yamawaki passive is present', () =>
  withDom(({ root }) => {
    const ordinaryState = createState(
      createSkill({
        id: 9512,
        name: 'Normal Slash',
        targetType: 'Single',
        parts: [{ skill_type: 'AttackSkill', target_type: 'Single', type: 'Slash' }],
      }),
      1
    );
    createTurnAreaController({
      root,
      state: ordinaryState,
      simulatorSettings: createSimulatorSettings(),
    });
    assert.equal(root.querySelector('[data-role="makai-kihei-btn"]'), null);

    const makaiState = createState(
      createSkill({
        id: 9513,
        name: 'Makai Follow',
        targetType: 'Self',
        parts: [{ skill_type: 'Protection', target_type: 'Self' }],
      }),
      3,
      {
        characterId: 'BIYamawaki',
        characterName: '山脇・ボン・イヴァール',
        styleId: MAKAI_KIHEI_STYLE_ID,
        styleName: '誇り高き魔王の凱旋',
        passives: [createMakaiKiheiPassive()],
      }
    );
    createTurnAreaController({
      root,
      state: makaiState,
      simulatorSettings: createSimulatorSettings(),
    });
    assert.ok(root.querySelector('[data-role="makai-kihei-btn"]'));
  }));

test('TurnAreaController limits pending Makai Kihei chips to three uses', () =>
  withDom(({ root, win }) => {
    const state = createState(
      createSkill({
        id: 9514,
        name: 'Makai Follow',
        targetType: 'Self',
        parts: [{ skill_type: 'Protection', target_type: 'Self' }],
      }),
      3,
      {
        characterId: 'BIYamawaki',
        characterName: '山脇・ボン・イヴァール',
        styleId: MAKAI_KIHEI_STYLE_ID,
        styleName: '誇り高き魔王の凱旋',
        passives: [createMakaiKiheiPassive()],
      }
    );
    const { engineManager } = createTurnAreaController({
      root,
      state,
      simulatorSettings: createSimulatorSettings(),
    });

    const noteEl = root.querySelector('[data-role="note"]');
    noteEl.value = '騎兵メモ';
    noteEl.dispatchEvent(new win.Event('input', { bubbles: true }));

    for (let index = 0; index < 3; index += 1) {
      root.querySelector('[data-role="makai-kihei-btn"]').click();
    }

    const chipLabels = [...root.querySelectorAll('[data-role="operation-chip"]')].map((chip) =>
      chip.textContent.replace('×', '').trim()
    );
    const makaiButton = root.querySelector('[data-role="makai-kihei-btn"]');
    assert.deepEqual(chipLabels, ['騎兵起動', '騎兵起動', '騎兵起動']);
    assert.equal(makaiButton.disabled, true);
    assert.match(makaiButton.textContent, /残0/);
    assert.equal(root.querySelector('[data-role="note"]').value, '騎兵メモ');
    assert.equal(engineManager.getMakaiKiheiStatus().remainingUses, 0);
  }));

test('TurnAreaController removing a committed Makai Kihei chip restores remaining uses on the input row', () =>
  withDom(({ root }) => {
    const state = createState(
      createSkill({
        id: 9515,
        name: 'Makai Follow',
        targetType: 'Self',
        parts: [{ skill_type: 'Protection', target_type: 'Self' }],
      }),
      3,
      {
        characterId: 'BIYamawaki',
        characterName: '山脇・ボン・イヴァール',
        styleId: MAKAI_KIHEI_STYLE_ID,
        styleName: '誇り高き魔王の凱旋',
        passives: [createMakaiKiheiPassive()],
      }
    );
    const { engineManager } = createTurnAreaController({
      root,
      state,
      simulatorSettings: createSimulatorSettings(),
    });

    root.querySelector('[data-role="makai-kihei-btn"]').click();
    root.querySelector('[data-role="makai-kihei-btn"]').click();
    root.querySelector('[data-role="commit-btn"]').click();

    assert.equal(engineManager.getStateBefore(0)?.turnState?.odGauge, 90);
    assert.match(root.querySelectorAll('[data-role="makai-kihei-btn"]').item(0).textContent, /残1/);

    root.querySelector('[data-role="operation-chip-remove"]').click();

    assert.equal(engineManager.getStateBefore(0)?.turnState?.odGauge, 45);
    assert.deepEqual(
      engineManager.replayScript.turns[0].operations.map((operation) => operation.type),
      [REPLAY_OPERATION_TYPES.ACTIVATE_MAKAI_KIHEI]
    );
    assert.match(root.querySelectorAll('[data-role="makai-kihei-btn"]').item(0).textContent, /残2/);
  }));

test('TurnAreaController recalculates Makai Kihei OD gain when the input row enemyCount changes', () =>
  withDom(({ root, win }) => {
    const state = createState(
      createSkill({
        id: 9516,
        name: 'Makai Follow',
        targetType: 'Self',
        parts: [{ skill_type: 'Protection', target_type: 'Self' }],
      }),
      1,
      {
        characterId: 'BIYamawaki',
        characterName: '山脇・ボン・イヴァール',
        styleId: MAKAI_KIHEI_STYLE_ID,
        styleName: '誇り高き魔王の凱旋',
        passives: [createMakaiKiheiPassive()],
      }
    );
    const { engineManager } = createTurnAreaController({
      root,
      state,
      simulatorSettings: createSimulatorSettings(),
    });

    const enemyCountSelect = root.querySelector('[data-role="enemy-count"]');
    enemyCountSelect.value = '2';
    enemyCountSelect.dispatchEvent(new win.Event('change', { bubbles: true }));
    root.querySelector('[data-role="makai-kihei-btn"]').click();

    assert.equal(engineManager.getCurrentStateWithPending(2).turnState.odGauge, 30);
    assert.match(root.querySelector('[data-turn-od-gauge]').textContent, /030\.00%/);

    root.querySelector('[data-role="commit-btn"]').click();

    assert.equal(engineManager.getStateBefore(0)?.turnState?.odGauge, 30);
    assert.equal(engineManager.computedRecords[0]?.enemyCount, 2);
  }));
