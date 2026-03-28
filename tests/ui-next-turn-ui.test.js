import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

import { CharacterStyle, Party, applyInitialPassiveState, createBattleStateFromParty } from '../src/index.js';
import { TurnRowController } from '../ui-next/components/turn-row.js';
import { TurnAreaController } from '../ui-next/components/turn-area.js';
import { TurnEngineManager } from '../ui-next/engine/turn-engine-manager.js';
import {
  createEmptyLightweightReplayScript,
  REPLAY_OPERATION_TYPES,
  REPLAY_OVERRIDE_ENTRY_TYPES,
} from '../src/ui/lightweight-replay-script.js';
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
  dom.window.scrollTo = () => {};

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

function createSkill({ id, name, targetType, parts, condition = '', spCost = 0 }) {
  return {
    id,
    name,
    label: `${name}${id}`,
    sp_cost: spCost,
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

function createBreakHealPassive() {
  return {
    id: 99910,
    name: '激動テスト',
    timing: 'OnFirstBattleStart',
    parts: [
      { skill_type: 'AdditionalHitOnBreaking', target_type: 'Self', power: [0, 0], value: [0, 0] },
      { skill_type: 'HealSp', target_type: 'Self', power: [8, 0], value: [0, 0] },
    ],
  };
}

function createBattleStartPassive({
  id = 99911,
  name = '開始補助',
  desc = 'バトル開始時 自身のSP+2',
  spAmount = 2,
} = {}) {
  return {
    id,
    name,
    desc,
    timing: 'OnBattleStart',
    parts: [{ skill_type: 'HealSp', target_type: 'Self', power: [spAmount, 0], value: [0, 0] }],
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
      initialSP: index === 0 ? (actorOptions.initialSP ?? 10) : 10,
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

function createFrontlineState(frontlineSkills, enemyCount = 1, frontOptions = []) {
  const members = Array.from({ length: 6 }, (_, index) =>
    new CharacterStyle({
      characterId: frontOptions[index]?.characterId ?? `UI${index + 1}`,
      characterName: frontOptions[index]?.characterName ?? `UI${index + 1}`,
      styleId: frontOptions[index]?.styleId ?? 9300 + index,
      styleName: frontOptions[index]?.styleName ?? `UIS${index + 1}`,
      partyIndex: index,
      position: index,
      initialSP: 10,
      skills: [
        frontlineSkills[index] ?? createSkill({
          id: 9400 + index,
          name: `Protection${index + 1}`,
          targetType: 'Self',
          parts: [{ skill_type: 'Protection', target_type: 'Self' }],
        }),
      ],
      passives: frontOptions[index]?.passives ?? [],
    })
  );
  const state = createBattleStateFromParty(new Party(members));
  state.turnState.enemyState.enemyCount = enemyCount;
  return state;
}

function createStoreStub(charactersByLabel = {}) {
  return {
    getStyleById() {
      return null;
    },
    getCharacterByLabel(label) {
      return charactersByLabel[String(label ?? '')] ?? null;
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

function createTurnAreaController({
  root,
  state,
  simulatorSettings,
  store = createStoreStub(),
  onPassiveLogRowsChange = null,
}) {
  const engineManager = new TurnEngineManager();
  const controller = new TurnAreaController({
    root,
    store,
    engineManager,
    onError: (error) => {
      throw error;
    },
    onTurnCommitted: () => {},
    onPassiveLogRowsChange,
  });
  controller.initialize(state, {}, simulatorSettings);
  return { controller, engineManager };
}

function extractPassiveLogTexts(rows = []) {
  return rows.map((row) => row.text);
}

function mountTurnRow({ root, stateBefore, simulatorSettings, store = createStoreStub() }) {
  const row = new TurnRowController({
    root,
    store,
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

test('TurnAreaController shows preview and committed endSP on the SP badge', () =>
  withDom(({ root, win }) => {
    const normalSkill = createSkill({
      id: 9510,
      name: '通常攻撃',
      targetType: 'Self',
      parts: [{ skill_type: 'Protection', target_type: 'Self' }],
    });
    const costlySkill = createSkill({
      id: 9511,
      name: '夜醒',
      targetType: 'Self',
      spCost: 7,
      parts: [{ skill_type: 'Protection', target_type: 'Self' }],
    });
    const state = createState(normalSkill, 1, {
      initialSP: 11,
      skills: [normalSkill, costlySkill],
    });
    createTurnAreaController({
      root,
      state,
      simulatorSettings: createSimulatorSettings(),
    });

    const getRows = () => root.querySelectorAll('[data-turn-row]');
    const getInputRow = () => getRows().item(getRows().length - 1);
    const getBadgeText = (row) =>
      row.querySelector('[data-turn-slot][data-position="0"] [data-sp-badge]').textContent.trim();

    let inputRow = getInputRow();
    assert.equal(getBadgeText(inputRow), '11');

    let inputSelect = inputRow.querySelector('[data-skill-select][data-party-index="0"]');
    inputSelect.value = '9511';
    inputSelect.dispatchEvent(new win.Event('change', { bubbles: true }));

    inputRow = getInputRow();
    assert.equal(getBadgeText(inputRow), '4');

    inputSelect = inputRow.querySelector('[data-skill-select][data-party-index="0"]');
    inputSelect.value = '9510';
    inputSelect.dispatchEvent(new win.Event('change', { bubbles: true }));

    inputRow = getInputRow();
    assert.equal(getBadgeText(inputRow), '11');

    inputSelect = inputRow.querySelector('[data-skill-select][data-party-index="0"]');
    inputSelect.value = '9511';
    inputSelect.dispatchEvent(new win.Event('change', { bubbles: true }));

    inputRow = getInputRow();
    assert.equal(getBadgeText(inputRow), '4');

    inputRow.querySelector('[data-role="commit-btn"]').dispatchEvent(
      new win.MouseEvent('click', { bubbles: true })
    );

    const committedRow = getRows().item(0);
    assert.equal(getBadgeText(committedRow), '4');
  }));

test('TurnAreaController keeps only one committed-row edit session open and cancels without mutating replay', () =>
  withDom(({ root, win }) => {
    const baseSkill = createSkill({
      id: 95111,
      name: 'Safe Guard',
      targetType: 'Self',
      parts: [{ skill_type: 'Protection', target_type: 'Self' }],
    });
    const altSkill = createSkill({
      id: 95112,
      name: 'Alt Guard',
      targetType: 'Self',
      parts: [{ skill_type: 'Protection', target_type: 'Self' }],
    });
    const state = createState(baseSkill, 1, {
      skills: [baseSkill, altSkill],
    });
    const { engineManager } = createTurnAreaController({
      root,
      state,
      simulatorSettings: createSimulatorSettings(),
    });

    root.querySelector('[data-role="commit-btn"]').click();

    assert.equal(root.querySelector('[data-role="edit-btn"]') !== null, true);
    assert.equal(root.querySelector('[data-role="commit-btn"]') !== null, true);

    root.querySelector('[data-role="edit-btn"]').click();

    assert.equal(root.querySelector('[data-role="recommit-btn"]') !== null, true);
    assert.equal(root.querySelector('[data-role="edit-cancel-btn"]') !== null, true);
    assert.equal(root.querySelector('[data-role="commit-btn"]'), null);

    const editSelect = root.querySelector('[data-skill-select][data-party-index="0"]');
    editSelect.value = '95112';
    editSelect.dispatchEvent(new win.Event('change', { bubbles: true }));

    root.querySelector('[data-role="edit-cancel-btn"]').click();

    assert.equal(engineManager.replayScript.turns[0].slots[0].skillId, 95111);
    assert.equal(root.querySelector('[data-role="edit-btn"]') !== null, true);
    assert.equal(root.querySelector('[data-role="commit-btn"]') !== null, true);
  }));

test('TurnAreaController preserves scroll position when opening committed-row edit mode', () =>
  withDom(({ root, win }) => {
    const viewport = document.createElement('div');
    viewport.style.overflowY = 'auto';
    viewport.style.height = '240px';
    root.parentElement.appendChild(viewport);
    viewport.appendChild(root);

    let viewportScrollTop = 480;
    let viewportScrollLeft = 0;
    let viewportScrollWrites = 0;
    Object.defineProperty(viewport, 'scrollTop', {
      configurable: true,
      get() {
        return viewportScrollTop;
      },
      set(value) {
        viewportScrollWrites += 1;
        viewportScrollTop = Number(value);
      },
    });
    Object.defineProperty(viewport, 'scrollLeft', {
      configurable: true,
      get() {
        return viewportScrollLeft;
      },
      set(value) {
        viewportScrollLeft = Number(value);
      },
    });

    let scrollX = 0;
    let scrollY = 480;
    let windowScrollCalls = 0;
    Object.defineProperty(win, 'scrollX', {
      configurable: true,
      get() {
        return scrollX;
      },
    });
    Object.defineProperty(win, 'scrollY', {
      configurable: true,
      get() {
        return scrollY;
      },
    });
    win.scrollTo = (x, y) => {
      windowScrollCalls += 1;
      scrollX = Number(x);
      scrollY = Number(y);
    };

    const baseSkill = createSkill({
      id: 95110,
      name: 'Scroll Guard',
      targetType: 'Self',
      parts: [{ skill_type: 'Protection', target_type: 'Self' }],
    });
    createTurnAreaController({
      root,
      state: createState(baseSkill, 1),
      simulatorSettings: createSimulatorSettings(),
    });

    root.querySelector('[data-role="commit-btn"]').click();
    viewportScrollWrites = 0;
    windowScrollCalls = 0;

    root.querySelector('[data-role="edit-btn"]').click();

    assert.equal(viewportScrollTop, 480);
    assert.equal(scrollY, 480);
    assert.equal(viewportScrollWrites > 0, true);
    assert.equal(windowScrollCalls > 0, true);
  }));

test('TurnAreaController surfaces recommit warnings in the status summary and committed row badge', () =>
  withDom(({ root, win }) => {
    const safeSkill = createSkill({
      id: 95113,
      name: 'Safe Guard',
      targetType: 'Self',
      parts: [{ skill_type: 'Protection', target_type: 'Self' }],
    });
    const costlySkill = createSkill({
      id: 95114,
      name: 'Risk Slash',
      targetType: 'Self',
      spCost: 7,
      parts: [{ skill_type: 'Protection', target_type: 'Self' }],
    });
    const state = createState(safeSkill, 1, {
      initialSP: 4,
      skills: [safeSkill, costlySkill],
    });
    const { engineManager } = createTurnAreaController({
      root,
      state,
      simulatorSettings: createSimulatorSettings(),
    });

    root.querySelector('[data-role="commit-btn"]').click();
    root.querySelector('[data-role="edit-btn"]').click();

    const editSelect = root.querySelector('[data-skill-select][data-party-index="0"]');
    editSelect.value = '95114';
    editSelect.dispatchEvent(new win.Event('change', { bubbles: true }));

    root.querySelector('[data-role="recommit-btn"]').click();

    assert.equal(engineManager.replayDiagnostics.turnWarnings[0].length > 0, true);
    const statusEl = document.querySelector('[data-role="turn-replay-status"]');
    assert.ok(statusEl);
    assert.equal(root.contains(statusEl), false);
    assert.match(statusEl.textContent, /warnings=[1-9]/);
    assert.match(root.querySelector('[data-turn-info]').textContent, /Warn\(/);
  }));

test('TurnAreaController recommits an unchanged edited row without breaking swapped front/back positions', () =>
  withDom(({ root, win }) => {
    const leadSkill = createSkill({
      id: 95115,
      name: 'Lead Guard',
      targetType: 'Self',
      parts: [{ skill_type: 'Protection', target_type: 'Self' }],
    });
    const state = createState(leadSkill, 1);
    const { controller, engineManager } = createTurnAreaController({
      root,
      state,
      simulatorSettings: createSimulatorSettings(),
    });
    const replayScript = {
      turns: [
        {
          turn: 1,
          slots: [
            { styleId: state.party[3].styleId, skillId: 9403 },
            { styleId: state.party[1].styleId, skillId: 9401 },
            { styleId: state.party[2].styleId, skillId: 9402 },
            { styleId: state.party[0].styleId, skillId: null },
            { styleId: state.party[4].styleId, skillId: null },
            { styleId: state.party[5].styleId, skillId: null },
          ],
          operations: [],
          note: '',
          overrideEntries: [{ type: REPLAY_OVERRIDE_ENTRY_TYPES.ENEMY_COUNT, payload: 1 }],
        },
      ],
    };

    controller.loadSession(state, replayScript, createSimulatorSettings());

    root.querySelector('[data-role="edit-btn"]').click();
    root.querySelector('[data-role="recommit-btn"]').dispatchEvent(
      new win.MouseEvent('click', { bubbles: true })
    );

    assert.equal(engineManager.replayDiagnostics.error, null);
    assert.equal(engineManager.replayScript.turns[0].slots[0].styleId, state.party[3].styleId);
    assert.equal(engineManager.replayScript.turns[0].slots[0].skillId, 9403);
    assert.equal(engineManager.replayScript.turns[0].slots[3].styleId, state.party[0].styleId);
    assert.equal(engineManager.replayScript.turns[0].slots[3].skillId, null);
    assert.equal(root.querySelector('[data-role="commit-btn"]') !== null, true);
  }));

test('TurnAreaController recommits an unchanged extra-turn row without reviving inactive members', () =>
  withDom(({ root, win }) => {
    const actorSkill = createSkill({
      id: 95116,
      name: 'Extra Lead',
      targetType: 'Self',
      parts: [{ skill_type: 'Protection', target_type: 'Self' }],
    });
    const state = createState(actorSkill, 1);
    state.turnState.turnType = 'extra';
    state.turnState.extraTurnState = {
      active: true,
      remainingActions: 1,
      allowedCharacterIds: ['UI1'],
      grantTurnIndex: 1,
    };
    const { controller, engineManager } = createTurnAreaController({
      root,
      state,
      simulatorSettings: createSimulatorSettings(),
    });
    const replayScript = {
      turns: [
        {
          turn: 1,
          slots: [
            { styleId: state.party[0].styleId, skillId: 95116 },
            { styleId: state.party[1].styleId, skillId: null },
            { styleId: state.party[2].styleId, skillId: null },
            { styleId: state.party[3].styleId, skillId: null },
            { styleId: state.party[4].styleId, skillId: null },
            { styleId: state.party[5].styleId, skillId: null },
          ],
          operations: [],
          note: '',
          overrideEntries: [{ type: REPLAY_OVERRIDE_ENTRY_TYPES.ENEMY_COUNT, payload: 1 }],
        },
      ],
    };

    controller.loadSession(state, replayScript, createSimulatorSettings());

    root.querySelector('[data-role="edit-btn"]').click();
    root.querySelector('[data-role="recommit-btn"]').dispatchEvent(
      new win.MouseEvent('click', { bubbles: true })
    );

    assert.equal(engineManager.replayDiagnostics.error, null);
    assert.equal(engineManager.replayScript.turns[0].slots[0].skillId, 95116);
    assert.equal(engineManager.replayScript.turns[0].slots[1].skillId, null);
    assert.equal(engineManager.replayScript.turns[0].slots[2].skillId, null);
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
    const selectRow = root.querySelector('[data-role="slot-select-row"][data-position="0"]');
    const infoSpace = root.querySelector('[data-slot-info-space][data-position="0"]');
    const targetAnchor = root.querySelector('[data-role="slot-target-anchor"][data-position="0"]');
    assert.ok(trigger);
    assert.ok(popover);
    assert.ok(selectRow);
    assert.ok(infoSpace);
    assert.ok(targetAnchor);
    assert.equal(selectRow.contains(trigger), false);
    assert.ok(infoSpace.contains(trigger));
    assert.ok(targetAnchor.contains(trigger));
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

test('TurnRowController keeps the manual break editor inside the viewport vertically', () =>
  withDom(({ root, win }) => {
    const originalGetBoundingClientRect = win.Element.prototype.getBoundingClientRect;
    Object.defineProperty(win, 'innerWidth', {
      configurable: true,
      value: 800,
    });
    Object.defineProperty(win, 'innerHeight', {
      configurable: true,
      value: 400,
    });
    win.Element.prototype.getBoundingClientRect = function getBoundingClientRectMock() {
      if (this.classList?.contains('target-popover')) {
        return {
          left: 200,
          right: 480,
          top: 360,
          bottom: 560,
          width: 280,
          height: 200,
          x: 200,
          y: 360,
          toJSON() {
            return this;
          },
        };
      }
      return {
        left: 0,
        right: 0,
        top: 0,
        bottom: 0,
        width: 0,
        height: 0,
        x: 0,
        y: 0,
        toJSON() {
          return this;
        },
      };
    };

    try {
      const state = createState(
        createSkill({
          id: 95035,
          name: 'Break Menu Overflow',
          targetType: 'Single',
          parts: [{ skill_type: 'AttackSkill', target_type: 'Single', type: 'Slash' }],
        }),
        3
      );
      mountTurnRow({
        root,
        stateBefore: state,
        simulatorSettings: createSimulatorSettings(),
      });

      root
        .querySelector('[data-role="manual-break-toggle"]')
        .dispatchEvent(new win.MouseEvent('click', { bubbles: true }));

      const popover = root.querySelector('[data-role="manual-break-editor"]');
      assert.equal(popover.hidden, false);
      assert.equal(popover.style.maxHeight, '384px');
      assert.equal(popover.style.overflowY, 'auto');
      assert.equal(popover.style.transform, 'translate(0px, -168px)');
    } finally {
      win.Element.prototype.getBoundingClientRect = originalGetBoundingClientRect;
    }
  }));

test('TurnRowController keeps skill badges stable near the responsive threshold even with a detached target anchor', () =>
  withDom(({ root }) => {
    const state = createState(
      createSkill({
        id: 95030,
        name: 'Responsive Badge Check',
        targetType: 'Single',
        parts: [
          {
            skill_type: 'AttackSkill',
            target_type: 'Single',
            type: 'Slash',
            elements: ['Fire'],
          },
        ],
      }),
      3
    );
    const row = mountTurnRow({
      root,
      stateBefore: state,
      simulatorSettings: createSimulatorSettings({
        enemyMode: TARGET_SELECTION_MODES.MANUAL,
      }),
    });

    const select = root.querySelector('[data-skill-select][data-position="0"]');
    const badgeEl = root.querySelector('[data-skill-badges][data-position="0"]');
    const selectRow = root.querySelector('[data-role="slot-select-row"][data-position="0"]');
    const infoSpace = root.querySelector('[data-slot-info-space][data-position="0"]');
    const targetAnchor = root.querySelector('[data-role="slot-target-anchor"][data-position="0"]');
    const trigger = root.querySelector('[data-role="target-trigger"][data-target-kind="enemy"]');
    let rowWidth = 152;
    Object.defineProperty(selectRow, 'offsetWidth', {
      configurable: true,
      get() {
        return rowWidth;
      },
    });
    Object.defineProperty(select, 'offsetWidth', {
      configurable: true,
      get() {
        return rowWidth;
      },
    });

    assert.ok(selectRow);
    assert.ok(infoSpace);
    assert.ok(targetAnchor);
    assert.ok(trigger);
    assert.equal(selectRow.contains(trigger), false);
    assert.ok(infoSpace.contains(trigger));
    assert.ok(targetAnchor.contains(trigger));

    delete badgeEl.dataset.responsiveVisible;
    row.refreshSkillSelects();
    assert.notEqual(badgeEl.style.display, 'none');

    rowWidth = 144;
    row.refreshSkillSelects();
    assert.notEqual(badgeEl.style.display, 'none');

    rowWidth = 140;
    row.refreshSkillSelects();
    assert.equal(badgeEl.style.display, 'none');

    rowWidth = 154;
    row.refreshSkillSelects();
    assert.equal(badgeEl.style.display, 'none');

    rowWidth = 158;
    row.refreshSkillSelects();
    assert.notEqual(badgeEl.style.display, 'none');
    assert.ok(infoSpace.contains(root.querySelector('[data-role="target-trigger"][data-target-kind="enemy"]')));
  }));

test('TurnRowController lets simple-mode single-target rows override target locally and bind break to that target', () =>
  withDom(({ root, win }) => {
    const state = createState(
      createSkill({
        id: 95031,
        name: 'Break Attribution',
        targetType: 'Single',
        parts: [{ skill_type: 'AttackSkill', target_type: 'Single', type: 'Slash' }],
      }),
      3
    );
    const row = mountTurnRow({
      root,
      stateBefore: state,
      simulatorSettings: createSimulatorSettings(),
    });

    assert.equal(root.querySelector('[data-role="break-trigger"]'), null);
    root
      .querySelector('[data-role="manual-break-toggle"]')
      .dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
    assert.equal(
      root.querySelectorAll('[data-role="manual-break-target-candidate"][data-party-index="0"]').length,
      3
    );

    root
      .querySelector('[data-role="manual-break-target-candidate"][data-party-index="0"][data-enemy-index="2"]')
      .dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
    root
      .querySelector('[data-role="manual-break-single-toggle"][data-party-index="0"]')
      .dispatchEvent(new win.MouseEvent('click', { bubbles: true }));

    assert.deepEqual(row.getCurrentActionOutcomeOverrides(), [
      { position: 0, outcome: 'Break', enemyIndexes: [2] },
    ]);
    assert.deepEqual(row.getCurrentSlotActions()[0]?.target, { type: 'enemy', enemyIndex: 2 });
    assert.match(
      root.querySelector('[data-role="target-trigger-label"]').textContent,
      /E3/,
    );
    const noteColumn = root.querySelector('[data-turn-note]');
    const noteTextarea = root.querySelector('[data-role="note"]');
    assert.match(noteColumn.className, /\bflex\b/);
    assert.match(noteColumn.className, /\bself-stretch\b/);
    assert.doesNotMatch(noteTextarea.className, /\bh-full\b/);
    assert.match(noteTextarea.className, /\bflex-1\b/);
    const chipLabels = [...root.querySelectorAll('[data-role="manual-break-chip"]')].map((chip) =>
      chip.textContent.trim()
    );
    assert.deepEqual(chipLabels, ['UI1→E3 ブレイク']);
  }));

test('TurnRowController resolves manual break chip labels with nickname and enemy name', () =>
  withDom(({ root, win }) => {
    const state = createState(
      createSkill({
        id: 95032,
        name: 'Break Attribution',
        targetType: 'Single',
        parts: [{ skill_type: 'AttackSkill', target_type: 'Single', type: 'Slash' }],
      }),
      2,
      {
        characterId: 'BIYamawaki',
        characterName: '山脇・ボン・イヴァール',
      }
    );
    state.turnState.enemyState.enemyNamesByEnemy = { 0: 'ワイバーン' };
    mountTurnRow({
      root,
      stateBefore: state,
      simulatorSettings: createSimulatorSettings(),
      store: createStoreStub({
        BIYamawaki: {
          label: 'BIYamawaki',
          name: '山脇・ボン・イヴァール — Ivar Bon Yamawaki — ワッキー Wakkii',
        },
      }),
    });

    root
      .querySelector('[data-role="manual-break-toggle"]')
      .dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
    root
      .querySelector('[data-role="manual-break-target-candidate"][data-party-index="0"][data-enemy-index="0"]')
      .dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
    root
      .querySelector('[data-role="manual-break-single-toggle"][data-party-index="0"]')
      .dispatchEvent(new win.MouseEvent('click', { bubbles: true }));

    assert.deepEqual(
      [...root.querySelectorAll('[data-role="manual-break-chip"]')].map((chip) => chip.textContent.trim()),
      ['ワッキー→ワイバーン ブレイク']
    );
  }));

test('TurnRowController keeps all-target manual break multi-select for partial break cases', () =>
  withDom(({ root, win }) => {
    const state = createState(
      createSkill({
        id: 95033,
        name: 'Wide Break Attribution',
        targetType: 'All',
        parts: [{ skill_type: 'AttackSkill', target_type: 'All', type: 'Slash' }],
      }),
      3
    );
    const row = mountTurnRow({
      root,
      stateBefore: state,
      simulatorSettings: createSimulatorSettings(),
    });

    root
      .querySelector('[data-role="manual-break-toggle"]')
      .dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
    root
      .querySelector('[data-role="manual-break-candidate"][data-party-index="0"][data-enemy-index="0"]')
      .dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
    root
      .querySelector('[data-role="manual-break-candidate"][data-party-index="0"][data-enemy-index="2"]')
      .dispatchEvent(new win.MouseEvent('click', { bubbles: true }));

    assert.deepEqual(row.getCurrentActionOutcomeOverrides(), [
      { position: 0, outcome: 'Break', enemyIndexes: [0, 2] },
    ]);
    assert.deepEqual(
      [...root.querySelectorAll('[data-role="manual-break-chip"]')].map((chip) => chip.textContent.trim()),
      ['UI1→E1 ブレイク', 'UI1→E3 ブレイク']
    );
  }));

test('TurnRowController ties single-target break to the current manual target', () =>
  withDom(({ root, win }) => {
    const state = createState(
      createSkill({
        id: 95034,
        name: 'Manual Target Break',
        targetType: 'Single',
        parts: [{ skill_type: 'AttackSkill', target_type: 'Single', type: 'Slash' }],
      }),
      3
    );
    const row = mountTurnRow({
      root,
      stateBefore: state,
      simulatorSettings: createSimulatorSettings({
        enemyMode: TARGET_SELECTION_MODES.MANUAL,
      }),
    });

    root
      .querySelector('[data-role="target-trigger"][data-target-kind="enemy"]')
      .dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
    root
      .querySelector('[data-role="target-candidate"][data-target-kind="enemy"][data-enemy-index="1"]')
      .dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
    root
      .querySelector('[data-role="manual-break-toggle"]')
      .dispatchEvent(new win.MouseEvent('click', { bubbles: true }));

    assert.equal(
      root.querySelector('[data-role="manual-break-candidate"][data-party-index="0"]'),
      null
    );
    assert.match(
      root.querySelector('[data-role="manual-break-single-toggle"][data-party-index="0"]').textContent,
      /E2/,
    );

    root
      .querySelector('[data-role="manual-break-single-toggle"][data-party-index="0"]')
      .dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
    assert.deepEqual(row.getCurrentActionOutcomeOverrides(), [
      { position: 0, outcome: 'Break', enemyIndexes: [1] },
    ]);

    root
      .querySelector('[data-role="target-trigger"][data-target-kind="enemy"]')
      .dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
    root
      .querySelector('[data-role="target-candidate"][data-target-kind="enemy"][data-enemy-index="2"]')
      .dispatchEvent(new win.MouseEvent('click', { bubbles: true }));

    assert.deepEqual(row.getCurrentSlotActions()[0]?.target, { type: 'enemy', enemyIndex: 2 });
    assert.deepEqual(row.getCurrentActionOutcomeOverrides(), [
      { position: 0, outcome: 'Break', enemyIndexes: [2] },
    ]);
    assert.deepEqual(
      [...root.querySelectorAll('[data-role="manual-break-chip"]')].map((chip) => chip.textContent.trim()),
      ['UI1→E3 ブレイク']
    );
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

test('TurnAreaController keeps enemy target controls in the info-space anchor across simulator setting rerenders', () =>
  withDom(({ root }) => {
    const state = createState(
      createSkill({
        id: 9517,
        name: 'Detached Slash',
        targetType: 'Single',
        parts: [{ skill_type: 'AttackSkill', target_type: 'Single', type: 'Slash' }],
      }),
      3
    );
    const { controller } = createTurnAreaController({
      root,
      state,
      simulatorSettings: createSimulatorSettings({ enemyMode: TARGET_SELECTION_MODES.MANUAL }),
    });

    const assertDetachedTargetTrigger = () => {
      const trigger = root.querySelector('[data-role="target-trigger"][data-target-kind="enemy"]');
      const selectRow = root.querySelector('[data-role="slot-select-row"][data-position="0"]');
      const infoSpace = root.querySelector('[data-slot-info-space][data-position="0"]');
      const targetAnchor = root.querySelector('[data-role="slot-target-anchor"][data-position="0"]');
      assert.ok(trigger);
      assert.ok(selectRow);
      assert.ok(infoSpace);
      assert.ok(targetAnchor);
      assert.equal(selectRow.contains(trigger), false);
      assert.ok(infoSpace.contains(trigger));
      assert.ok(targetAnchor.contains(trigger));
    };

    assertDetachedTargetTrigger();

    controller.reinitialize(
      state,
      createSimulatorSettings({ enemyMode: TARGET_SELECTION_MODES.SIMPLE }),
    );
    assert.equal(root.querySelector('[data-role="slot-target-anchor"][data-position="0"]'), null);

    controller.reinitialize(
      state,
      createSimulatorSettings({ enemyMode: TARGET_SELECTION_MODES.MANUAL }),
    );
    assertDetachedTargetTrigger();
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

test('TurnAreaController emits initial passive log rows for battle-start passives', () =>
  withDom(({ root }) => {
    let passiveLogRows = [];
    const state = createState(
      createSkill({
        id: 95080,
        name: 'Log Guard',
        targetType: 'Self',
        parts: [{ skill_type: 'Protection', target_type: 'Self' }],
      }),
      1,
      {
        characterId: 'PLOG1',
        characterName: '開始ログ役',
        styleId: 9801,
        styleName: '開始ログスタイル',
        passives: [
          createBattleStartPassive({
            id: 99921,
            name: '開始補助',
            desc: 'バトル開始時 自身のSP+2',
          }),
        ],
      },
    );
    applyInitialPassiveState(state);

    createTurnAreaController({
      root,
      state,
      simulatorSettings: createSimulatorSettings(),
      onPassiveLogRowsChange: (rows) => {
        passiveLogRows = rows;
      },
    });

    assert.deepEqual(extractPassiveLogTexts(passiveLogRows), [
      '=== 戦闘開始 ===',
      '--- OnBattleStart ---',
      'T1：開始ログ役 : [開始補助] バトル開始時 自身のSP+2',
    ]);
  }));

test('TurnAreaController appends only new passive trigger rows after commit', () =>
  withDom(({ root, win }) => {
    let passiveLogRows = [];
    const exSkill = createSkill({
      id: 95081,
      name: 'EX Log Skill',
      targetType: 'Self',
      parts: [{ skill_type: 'HealSp', target_type: 'Self', power: [0, 0] }],
    });
    exSkill.is_restricted = 1;

    const state = createState(exSkill, 1, {
      characterId: 'PLOG2',
      characterName: '実行ログ役',
      styleId: 9802,
      styleName: '実行ログスタイル',
      passives: [
        createBattleStartPassive({
          id: 99922,
          name: '開始補助',
          desc: 'バトル開始時 自身のSP+2',
        }),
        {
          id: 99923,
          name: '追加支援テスト',
          timing: 'OnFirstBattleStart',
          parts: [
            { skill_type: 'AdditionalHitOnExtraSkill', target_type: 'Self', power: [0, 0], value: [0, 0] },
            { skill_type: 'AttackUp', target_type: 'AllyAll', power: [0.6, 0], value: [0, 0] },
          ],
        },
      ],
    });
    applyInitialPassiveState(state);

    createTurnAreaController({
      root,
      state,
      simulatorSettings: createSimulatorSettings(),
      onPassiveLogRowsChange: (rows) => {
        passiveLogRows = rows;
      },
    });

    root
      .querySelector('[data-role="commit-btn"]')
      .dispatchEvent(new win.MouseEvent('click', { bubbles: true }));

    const passiveRows = passiveLogRows.filter((row) => row.kind === 'passive');
    assert.equal(
      passiveRows.filter((row) => row.passiveName === '開始補助').length,
      1,
    );
    assert.equal(
      passiveRows.filter((row) => row.passiveName === '追加支援テスト').length,
      1,
    );
    assert.ok(
      passiveLogRows.some((row) => row.kind === 'marker' && row.text === '=== T1実行 ==='),
    );
    assert.ok(
      passiveLogRows.some((row) => row.kind === 'marker' && row.text === '--- OnFirstBattleStart ---'),
    );
    assert.match(
      passiveRows.find((row) => row.passiveName === '追加支援テスト')?.text ?? '',
      /\[追加支援テスト\]/,
    );
  }));

test('TurnAreaController emits EX boundary passive markers only when additional turn passives fire', () =>
  withDom(({ root, win }) => {
    let passiveLogRows = [];
    const grantExtraSkill = createSkill({
      id: 95082,
      name: 'Grant Front Extra',
      targetType: 'AllyFront',
      parts: [{ skill_type: 'AdditionalTurn', target_type: 'AllyFront' }],
    });
    grantExtraSkill.additionalTurnRule = {
      skillUsableInExtraTurn: true,
      additionalTurnGrantInExtraTurn: true,
      conditions: {
        requiresOverDrive: false,
        requiresReinforcedMode: false,
        excludesExtraTurnForSkillUse: false,
        excludesExtraTurnForAdditionalTurnGrant: false,
      },
      additionalTurnTargetTypes: ['AllyFront'],
    };

    const state = createFrontlineState(
      [grantExtraSkill],
      1,
      [
        null,
        {
          characterId: 'PLOG3',
          characterName: 'EXログ役',
          styleId: 9803,
          styleName: 'EXログスタイル',
          passives: [
            {
              id: 99923,
              name: 'アフターサービス',
              desc: '追加ターン開始時 自身のSP+1',
              timing: 'OnAdditionalTurnStart',
              parts: [{ skill_type: 'HealSp', target_type: 'Self', power: [1, 0], value: [0, 0] }],
            },
          ],
        },
      ],
    );

    createTurnAreaController({
      root,
      state,
      simulatorSettings: createSimulatorSettings(),
      onPassiveLogRowsChange: (rows) => {
        passiveLogRows = rows;
      },
    });

    root
      .querySelector('[data-role="commit-btn"]')
      .dispatchEvent(new win.MouseEvent('click', { bubbles: true }));

    assert.ok(
      passiveLogRows.some((row) => row.kind === 'marker' && row.text === '=== EX開始 ==='),
    );
    assert.ok(
      passiveLogRows.some((row) => row.kind === 'marker' && row.text === '--- OnAdditionalTurnStart ---'),
    );
    const exPassiveRow = passiveLogRows.find(
      (row) => row.kind === 'passive' && row.passiveName === 'アフターサービス',
    );
    assert.ok(exPassiveRow);
    assert.equal(exPassiveRow.turnLabel, 'EX');
    assert.match(exPassiveRow.text, /EXログ役/);
  }));

test('TurnAreaController rebuilds passive log rows on reinitialize and loadSession', () =>
  withDom(({ root }) => {
    let passiveLogRows = [];
    const simulatorSettings = createSimulatorSettings();
    const buildState = ({ characterId, characterName, styleId, styleName, passiveId, passiveName, passiveDesc }) => {
      const state = createState(
        createSkill({
          id: 95083,
          name: 'Replay Guard',
          targetType: 'Self',
          parts: [{ skill_type: 'Protection', target_type: 'Self' }],
        }),
        1,
        {
          characterId,
          characterName,
          styleId,
          styleName,
          passives: [
            createBattleStartPassive({
              id: passiveId,
              name: passiveName,
              desc: passiveDesc,
            }),
          ],
        },
      );
      applyInitialPassiveState(state);
      return state;
    };

    const stateA = buildState({
      characterId: 'PLOG4A',
      characterName: '初期ログA',
      styleId: 9804,
      styleName: '初期ログスタイルA',
      passiveId: 99924,
      passiveName: '開始A',
      passiveDesc: 'Aだけを表示する',
    });
    const { controller } = createTurnAreaController({
      root,
      state: stateA,
      simulatorSettings,
      onPassiveLogRowsChange: (rows) => {
        passiveLogRows = rows;
      },
    });

    assert.ok(passiveLogRows.some((row) => row.kind === 'passive' && row.passiveName === '開始A'));

    const stateB = buildState({
      characterId: 'PLOG4B',
      characterName: '初期ログB',
      styleId: 9805,
      styleName: '初期ログスタイルB',
      passiveId: 99925,
      passiveName: '開始B',
      passiveDesc: 'Bだけを表示する',
    });
    controller.reinitialize(stateB, simulatorSettings);

    assert.equal(passiveLogRows.some((row) => row.kind === 'passive' && row.passiveName === '開始A'), false);
    assert.ok(passiveLogRows.some((row) => row.kind === 'passive' && row.passiveName === '開始B'));

    const stateC = buildState({
      characterId: 'PLOG4C',
      characterName: '初期ログC',
      styleId: 9806,
      styleName: '初期ログスタイルC',
      passiveId: 99926,
      passiveName: '開始C',
      passiveDesc: 'Cだけを表示する',
    });
    controller.loadSession(stateC, createEmptyLightweightReplayScript(), simulatorSettings);

    assert.equal(passiveLogRows.some((row) => row.kind === 'passive' && row.passiveName === '開始B'), false);
    assert.ok(passiveLogRows.some((row) => row.kind === 'passive' && row.passiveName === '開始C'));
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

    root.querySelector('[data-role="edit-btn"]').click();
    root.querySelector('[data-role="operation-chip-remove"]').click();
    root.querySelector('[data-role="recommit-btn"]').click();

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

    root.querySelector('[data-role="edit-btn"]').click();
    root.querySelector('[data-role="operation-chip-remove"]').click();
    root.querySelector('[data-role="recommit-btn"]').click();

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

test('TurnAreaController commits manual break attribution and hides committed-row break controls', () =>
  withDom(({ root, win }) => {
    const state = createState(
      createSkill({
        id: 9517,
        name: 'Break Attribution',
        targetType: 'Single',
        parts: [{ skill_type: 'AttackSkill', target_type: 'Single', type: 'Slash' }],
      }),
      3,
      {
        passives: [createBreakHealPassive()],
      }
    );
    const { engineManager } = createTurnAreaController({
      root,
      state,
      simulatorSettings: createSimulatorSettings(),
    });

    root
      .querySelector('[data-role="manual-break-toggle"]')
      .dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
    root
      .querySelector('[data-role="manual-break-target-candidate"][data-party-index="0"][data-enemy-index="2"]')
      .dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
    root
      .querySelector('[data-role="manual-break-single-toggle"][data-party-index="0"]')
      .dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
    root
      .querySelector('[data-role="commit-btn"]')
      .dispatchEvent(new win.MouseEvent('click', { bubbles: true }));

    const committedAction = engineManager.computedRecords[0]?.actions.find(
      (action) => action.positionIndex === 0
    );
    assert.equal(committedAction?.targetEnemyIndex, 2);
    assert.equal(committedAction?.breakHitCount, 1);
    assert.equal(
      committedAction?.spChanges.some((change) => change.source === 'sp_passive'),
      true
    );

    const committedRow = root.querySelectorAll('[data-turn-row]').item(0);
    assert.equal(committedRow.querySelector('[data-role="manual-break-toggle"]'), null);
    assert.equal(committedRow.querySelector('[data-role="manual-break-editor"]'), null);
    assert.deepEqual(
      [...committedRow.querySelectorAll('[data-role="manual-break-chip"]')].map((chip) =>
        chip.textContent.trim()
      ),
      ['UI1→E3 ブレイク']
    );
    assert.deepEqual(
      engineManager.getReplayTurn(0)?.overrideEntries.find(
        (entry) => entry.type === REPLAY_OVERRIDE_ENTRY_TYPES.ACTION_OUTCOME_OVERRIDES
      )?.payload,
      [{ position: 0, outcome: 'Break', enemyIndexes: [2] }]
    );
  }));

test('TurnAreaController supports simple-mode local target overrides for three single-target attackers in one turn', () =>
  withDom(({ root, win }) => {
    const singleTargetSkill = createSkill({
      id: 9518,
      name: 'Focused Slash',
      targetType: 'Single',
      parts: [{ skill_type: 'AttackSkill', target_type: 'Single', type: 'Slash' }],
    });
    const state = createFrontlineState(
      [singleTargetSkill, singleTargetSkill, singleTargetSkill],
      3,
      [{ passives: [createBreakHealPassive()] }]
    );
    const { engineManager } = createTurnAreaController({
      root,
      state,
      simulatorSettings: createSimulatorSettings(),
    });

    root
      .querySelector('[data-role="manual-break-toggle"]')
      .dispatchEvent(new win.MouseEvent('click', { bubbles: true }));

    root
      .querySelector('[data-role="manual-break-single-toggle"][data-party-index="0"]')
      .dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
    root
      .querySelector('[data-role="manual-break-target-candidate"][data-party-index="1"][data-enemy-index="1"]')
      .dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
    root
      .querySelector('[data-role="manual-break-single-toggle"][data-party-index="1"]')
      .dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
    root
      .querySelector('[data-role="manual-break-target-candidate"][data-party-index="2"][data-enemy-index="2"]')
      .dispatchEvent(new win.MouseEvent('click', { bubbles: true }));

    assert.match(
      root.querySelectorAll('[data-role="target-trigger-label"]').item(0).textContent,
      /E2/,
    );
    assert.match(
      root.querySelectorAll('[data-role="target-trigger-label"]').item(1).textContent,
      /E3/,
    );

    root
      .querySelector('[data-role="commit-btn"]')
      .dispatchEvent(new win.MouseEvent('click', { bubbles: true }));

    const committedActions = engineManager.computedRecords[0]?.actions ?? [];
    const firstAction = committedActions.find((action) => action.positionIndex === 0);
    const secondAction = committedActions.find((action) => action.positionIndex === 1);
    const thirdAction = committedActions.find((action) => action.positionIndex === 2);

    assert.equal(firstAction?.targetEnemyIndex ?? null, null);
    assert.equal(firstAction?.breakHitCount, 1);
    assert.deepEqual(firstAction?.manualBreakEnemyIndexes, [0]);
    assert.equal(secondAction?.targetEnemyIndex, 1);
    assert.equal(secondAction?.breakHitCount, 1);
    assert.deepEqual(secondAction?.manualBreakEnemyIndexes, [1]);
    assert.equal(thirdAction?.targetEnemyIndex, 2);
    assert.equal(thirdAction?.breakHitCount, 0);
    assert.deepEqual(thirdAction?.manualBreakEnemyIndexes ?? [], []);
    assert.deepEqual(
      engineManager.getReplayTurn(0)?.overrideEntries.find(
        (entry) => entry.type === REPLAY_OVERRIDE_ENTRY_TYPES.ACTION_OUTCOME_OVERRIDES
      )?.payload,
      [
        { position: 0, outcome: 'Break', enemyIndexes: [0] },
        { position: 1, outcome: 'Break', enemyIndexes: [1] },
      ]
    );
  }));
