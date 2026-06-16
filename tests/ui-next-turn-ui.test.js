import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

import { CharacterStyle, Party, applyInitialPassiveState, createBattleStateFromParty } from '../src/index.js';
import { TurnRowController } from '../ui-next/components/turn-row.js';
import { TurnAreaController } from '../ui-next/components/turn-area.js';
import { TurnEngineManager } from '../ui-next/engine/turn-engine-manager.js';
import { openCharDetailPopup } from '../ui-next/utils/char-detail-popup.js';
import { EnemyDetailPopup } from '../ui-next/components/enemy-detail-popup.js';
import {
  createEmptyLightweightReplayScript,
  REPLAY_OPERATION_TYPES,
  REPLAY_OVERRIDE_ENTRY_TYPES,
} from '../src/ui/lightweight-replay-script.js';
import { applyBeforeCommitOperations } from '../src/turn/turn-operations.js';
import { TARGET_SELECTION_MODES } from '../ui-next/utils/simulator-settings.js';
import { FORM_CHANGE_KEYS, FORM_CHANGE_STYLE_IDS } from '../src/domain/form-change.js';
import {
  DEFAULT_SUMMON_SAMPLE_ENEMY,
  DEATH_SLUG_WHITE_SAMPLE_ENEMY,
} from '../src/data/enemy-sample-presets.js';
import { getStore } from './helpers.js';

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
    fetch: globalThis.fetch,
  };

  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.ResizeObserver = TestResizeObserver;
  globalThis.CustomEvent = dom.window.CustomEvent;
  globalThis.Event = dom.window.Event;
  globalThis.MouseEvent = dom.window.MouseEvent;
  dom.window.scrollTo = () => {};

  const cleanup = () => {
    globalThis.window = previous.window;
    globalThis.document = previous.document;
    globalThis.ResizeObserver = previous.ResizeObserver;
    globalThis.CustomEvent = previous.CustomEvent;
    globalThis.Event = previous.Event;
    globalThis.MouseEvent = previous.MouseEvent;
    globalThis.fetch = previous.fetch;
    dom.window.close();
  };

  try {
    const result = run({
      dom,
      win: dom.window,
      root: dom.window.document.querySelector('#root'),
    });
    if (result && typeof result.then === 'function') {
      return result.finally(cleanup);
    }
    cleanup();
    return result;
  } catch (error) {
    cleanup();
    throw error;
  }
}

function getEnemyDetailPopup(win) {
  const popups = win.document.body.querySelectorAll('.enemy-detail-popup');
  return popups.item(popups.length - 1);
}

function setViewportSize(win, { width, height } = {}) {
  if (Number.isFinite(width)) {
    Object.defineProperty(win, 'innerWidth', {
      configurable: true,
      value: width,
    });
  }
  if (Number.isFinite(height)) {
    Object.defineProperty(win, 'innerHeight', {
      configurable: true,
      value: height,
    });
  }
}

function clickElement(win, element) {
  element?.dispatchEvent(new win.MouseEvent('click', { bubbles: true, cancelable: true }));
}

function openEnemyDetailPopup(trigger, win, { eventType = 'click' } = {}) {
  assert.ok(trigger);
  trigger.dispatchEvent(new win.MouseEvent(eventType, { bubbles: true, cancelable: true }));
  const popup = getEnemyDetailPopup(win);
  assert.ok(popup);
  return popup;
}

function triggerEnemyPopupAction(win, actionType, { enemyIndex = null } = {}) {
  const popup = getEnemyDetailPopup(win);
  assert.ok(popup);
  if (Number.isInteger(enemyIndex) && enemyIndex >= 0) {
    const tab = popup.querySelector(
      `[data-role="enemy-popup-tab"][data-enemy-tab-index="${enemyIndex}"]`
    );
    assert.ok(tab);
    tab.dispatchEvent(new win.MouseEvent('click', { bubbles: true, cancelable: true }));
  }
  const refreshedPopup = getEnemyDetailPopup(win);
  assert.ok(refreshedPopup);
  const actionButton = refreshedPopup.querySelector(
    `[data-role="enemy-popup-action"][data-action-type="${actionType}"]`
  );
  assert.ok(actionButton);
  assert.equal(actionButton.disabled, false);
  actionButton.dispatchEvent(new win.MouseEvent('click', { bubbles: true, cancelable: true }));
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
      roleAbility: index === 0 ? (actorOptions.roleAbility ?? null) : null,
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

function createEShieldState({ current = 10, max = 10, elements = ['Light', 'Dark'] } = {}) {
  return {
    current,
    max,
    elements: [...elements],
    defUpRate: 5000,
    damageLimit: 0,
  };
}

function createFrontlineState(frontlineSkills, enemyCount = 1, frontOptions = []) {
  const members = Array.from({ length: 6 }, (_, index) =>
    new CharacterStyle({
      characterId: frontOptions[index]?.characterId ?? `UI${index + 1}`,
      characterName: frontOptions[index]?.characterName ?? `UI${index + 1}`,
      styleId: frontOptions[index]?.styleId ?? 9300 + index,
      styleName: frontOptions[index]?.styleName ?? `UIS${index + 1}`,
      roleAbility: frontOptions[index]?.roleAbility ?? null,
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
  captureUntilBattleEnd = false,
} = {}) {
  return {
    targetSelection: {
      enemyMode,
      allyMode,
    },
    captureUntilBattleEnd,
  };
}

function createEnemyPreset({
  id = DEFAULT_SUMMON_SAMPLE_ENEMY.id,
  name = DEFAULT_SUMMON_SAMPLE_ENEMY.name,
  od_rate = 0,
  max_d_rate = 350,
  fireRate = 250,
  eShield = null,
} = {}) {
  return {
    id,
    name,
    od_rate,
    max_d_rate,
    resistances: {
      element: {
        slash: 100,
        stab: 100,
        strike: 100,
        fire: fireRate,
        ice: 250,
        thunder: 250,
        light: 250,
        dark: 250,
        nonelement: 100,
      },
    },
    absorbElementList: [],
    ...(eShield ? { e_shield: structuredClone(eShield) } : {}),
  };
}

function createEnemyPopupPayload(occupiedCount = 1) {
  return {
    enemies: Array.from({ length: 3 }, (_, index) => {
      const occupied = index < occupiedCount;
      return {
        occupied,
        alive: occupied,
        broken: false,
        dead: false,
        canSummon: !occupied,
        canEditEShield: occupied,
        canBreak: occupied,
        canKill: occupied,
        name: occupied ? `PopupEnemy${index + 1}` : `E${index + 1} 未使用`,
        statuses: [],
        ...(index === 0 && occupied
          ? {
              eShieldState: {
                current: 10,
                max: 10,
                elements: ['Light', 'Dark'],
                defUpRate: 5000,
                damageLimit: 0,
              },
            }
          : {}),
      };
    }),
    activeEnemyIndex: 0,
  };
}

function createSummonEnemyOperation({
  enemyId = DEFAULT_SUMMON_SAMPLE_ENEMY.id,
  enemyName = DEFAULT_SUMMON_SAMPLE_ENEMY.name,
  maxDRate = 350,
  fireRate = 250,
  targetEnemyIndex = null,
} = {}) {
  return {
    type: REPLAY_OPERATION_TYPES.SUMMON_ENEMY,
    payload: {
      enemyId,
      enemyName,
      od_rate: 0,
      max_d_rate: maxDRate,
      resistances: {
        element: {
          slash: 100,
          stab: 100,
          strike: 100,
          fire: fireRate,
          ice: 250,
          thunder: 250,
          light: 250,
          dark: 250,
          nonelement: 100,
        },
      },
      absorbElementList: ['fire'],
      ...(Number.isInteger(targetEnemyIndex) ? { targetEnemyIndex } : {}),
    },
  };
}

function createSetEnemyEShieldOperation({
  targetEnemyIndex = 0,
  eShieldState = createEShieldState(),
} = {}) {
  return {
    type: REPLAY_OPERATION_TYPES.SET_ENEMY_E_SHIELD,
    payload: {
      targetEnemyIndex,
      eShieldState: eShieldState ? structuredClone(eShieldState) : null,
    },
  };
}

function createTurnAreaController({
  root,
  state,
  simulatorSettings,
  store = createStoreStub(),
  enemyPresets = [],
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
  controller.setEnemyPresets(enemyPresets);
  return { controller, engineManager };
}

function extractPassiveLogTexts(rows = []) {
  return rows.map((row) => row.text);
}

function mountTurnRow({
  root,
  stateBefore,
  stateAfter = null,
  simulatorSettings,
  store = createStoreStub(),
  enemyPresets = [],
  operations = [],
  previewActionFlow = [],
}) {
  const row = new TurnRowController({
    root,
    store,
    enemyPresets,
    turnIndex: 0,
    record: null,
    replayTurn: null,
    operations,
    operationState: {
      kishinkaStatus: { hasTezuka: false },
      makaiKiheiStatus: { hasYamawaki: false, available: false, remainingUses: 0 },
    },
    stateBefore,
    stateAfter,
    previewActionFlow,
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

function createDragDataTransfer() {
  const calls = [];
  return {
    calls,
    effectAllowed: '',
    dropEffect: '',
    setData(...args) {
      calls.push(args);
    },
  };
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

test('TurnRowController records ally hit and DP adjustment override entries from row controls', () =>
  withDom(({ root }) => {
    const actorSkill = createSkill({
      id: 9500,
      name: 'Single Slash',
      targetType: 'Single',
      parts: [{ skill_type: 'AttackSkill', target_type: 'Single', type: 'Slash' }],
    });
    const state = createBattleStateFromParty(createPartyWithActorSkill(actorSkill));
    state.party[0].setDpState({ baseMaxDp: 70, currentDp: 70, effectiveDpCap: 70 });
    const row = mountTurnRow({
      root,
      stateBefore: state,
      simulatorSettings: createSimulatorSettings(),
    });

    assert.equal(root.querySelector('[data-role="ally-hit-toggle"]'), null);
    root.querySelector('[data-role="party-state-toggle"]').click();
    root.querySelector('[data-role="ally-hit-toggle"][data-character-id="UI1"]').click();
    root.querySelector('[data-role="ally-dp-set"][data-party-index="0"][data-dp-mode="99"]').click();

    assert.deepEqual(row.getCurrentOverrideEntries(), [
      {
        type: REPLAY_OVERRIDE_ENTRY_TYPES.ENEMY_ATTACK_TARGET_CHARACTER_IDS,
        payload: ['UI1'],
      },
      {
        type: REPLAY_OVERRIDE_ENTRY_TYPES.DP_STATE_BY_PARTY_INDEX,
        payload: {
          0: { baseMaxDp: 70, currentDp: 69, effectiveDpCap: 70, minDp: 0 },
        },
      },
    ]);
  })
);

test('TurnRowController shows OD debt badges for negative gauge values without changing minus styling', () =>
  withDom(({ root }) => {
    const state = createState(
      createSkill({
        id: 95001,
        name: 'Protection',
        targetType: 'Self',
        parts: [{ skill_type: 'Protection', target_type: 'Self' }],
      })
    );
    state.turnState.odGauge = -300;

    const row = mountTurnRow({
      root,
      stateBefore: state,
      simulatorSettings: createSimulatorSettings(),
    });

    const startBadge = root.querySelector(
      '[data-od-gauge-row="start"] [data-role="turn-od-stage-badge"]'
    );
    const endBadge = root.querySelector(
      '[data-od-gauge-row="end"] [data-role="turn-od-stage-badge"]'
    );

    assert.equal(startBadge?.textContent?.trim(), '3');
    assert.equal(endBadge?.textContent?.trim(), '3');
    assert.equal(startBadge?.dataset.stage, 'minus');
    assert.match(startBadge?.className ?? '', /turn-od-stage-minus/);

    row.updateOdPreview(-240);
    assert.equal(endBadge?.textContent?.trim(), '2');
    assert.equal(endBadge?.dataset.stage, 'minus');
    assert.match(endBadge?.className ?? '', /turn-od-stage-minus/);

    row.updateOdPreview(-100);
    assert.equal(endBadge?.textContent?.trim(), '1');
    assert.equal(endBadge?.dataset.stage, 'minus');

    row.updateOdPreview(-99);
    assert.equal(endBadge?.textContent?.trim(), '0');
    assert.equal(endBadge?.dataset.stage, 'minus');
  }));

test('TurnRowController allows drag-and-drop swapping from front to back slots via child drop targets', () =>
  withDom(({ root, win }) => {
    const state = createState(
      createSkill({
        id: 9500,
        name: 'Single Slash',
        targetType: 'Single',
        parts: [{ skill_type: 'AttackSkill', target_type: 'Single', type: 'Slash' }],
      }),
    );
    const slotChanges = [];
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
      stateBefore: state,
      stateAfter: null,
      simulatorSettings: createSimulatorSettings(),
      odState: {
        preemptiveOdLevel: null,
        interruptOdLevel: null,
        activatablePreemptive: [],
        activatableInterrupt: [],
      },
      onSlotChange: (...args) => {
        slotChanges.push(args);
      },
      onCommit: () => {},
      onNoteChange: () => {},
      onPreviewRequest: () => {},
      onOdChange: () => {},
      onOperationAdd: () => {},
      onOperationRemove: () => {},
    });
    row.mount();

    const sourceHandle = root.querySelector('[data-turn-slot][data-position="0"] [data-role="turn-slot-drag-handle"]');
    const targetChild = root.querySelector('[data-turn-slot][data-position="3"] [data-role="slot-body"]');
    const dataTransfer = createDragDataTransfer();
    const dragStartEvent = new win.Event('dragstart', { bubbles: true, cancelable: true });
    Object.defineProperty(dragStartEvent, 'dataTransfer', { value: dataTransfer });
    sourceHandle.dispatchEvent(dragStartEvent);

    const dragOverEvent = new win.Event('dragover', { bubbles: true, cancelable: true });
    Object.defineProperty(dragOverEvent, 'dataTransfer', { value: dataTransfer });
    targetChild.dispatchEvent(dragOverEvent);

    const dropEvent = new win.Event('drop', { bubbles: true, cancelable: true });
    Object.defineProperty(dropEvent, 'dataTransfer', { value: dataTransfer });
    targetChild.dispatchEvent(dropEvent);

    assert.deepEqual(dataTransfer.calls, [['text/plain', '']]);
    assert.equal(dragOverEvent.defaultPrevented, true);
    assert.deepEqual(slotChanges, [[0, 0, { swapWith: 3 }]]);
  }));

test('TurnRowController marks committed battle-end rows with data-battle-ended', () =>
  withDom(({ root }) => {
    const skill = createSkill({
      id: 95109,
      name: 'Final Blow',
      targetType: 'All',
      parts: [{ skill_type: 'AttackSkill', target_type: 'All', type: 'Slash' }],
    });
    const stateBefore = createState(skill, 1);
    const stateAfter = createState(skill, 1);
    stateAfter.turnState.enemyState.allEnemiesDefeated = true;

    const row = new TurnRowController({
      root,
      store: createStoreStub(),
      turnIndex: 0,
      rowMode: 'committed',
      rowDiagnostics: null,
      record: {
        turnIndex: 1,
        turnId: 1,
        odGaugeAtStart: 0,
        projections: { odGaugeAtEnd: 0 },
        actions: [],
      },
      replayTurn: {
        turn: 1,
        slots: [{ styleId: stateBefore.party[0].styleId, skillId: 95109 }],
        operations: [],
        note: '',
        overrideEntries: [],
      },
      operations: [],
      operationState: {
        kishinkaStatus: { hasTezuka: false },
        makaiKiheiStatus: { hasYamawaki: false, available: false, remainingUses: 0 },
      },
      stateBefore,
      stateAfter,
      onSlotChange: () => {},
      onCommit: () => {},
      onNoteChange: () => {},
      onPreviewRequest: () => {},
      onOdChange: () => {},
      onOperationAdd: () => {},
      onOperationRemove: () => {},
      simulatorSettings: createSimulatorSettings(),
    });
    row.mount();

    assert.equal(root.querySelector('[data-turn-row]').dataset.battleEnded, 'true');
    assert.equal(root.querySelector('[data-role="turn-info-battle-end"]').textContent.trim(), 'バトル終了');
  }));

test('TurnRowController shows a repeat indicator for committed double-action casts', () =>
  withDom(({ root }) => {
    const skill = createSkill({
      id: 95110,
      name: 'Double EX',
      targetType: 'All',
      parts: [{ skill_type: 'AttackSkill', target_type: 'All', type: 'Slash' }],
    });
    const stateBefore = createState(skill, 1);

    const row = new TurnRowController({
      root,
      store: createStoreStub(),
      turnIndex: 0,
      rowMode: 'committed',
      rowDiagnostics: null,
      record: {
        turnIndex: 1,
        turnId: 1,
        odGaugeAtStart: 0,
        projections: { odGaugeAtEnd: 0 },
        actions: [
          {
            positionIndex: 0,
            skillId: 95110,
            castCount: 2,
            castIndex: 0,
            spChanges: [{ source: 'cost', postSP: 10 }],
            endSP: 10,
          },
        ],
      },
      replayTurn: {
        turn: 1,
        slots: [{ styleId: stateBefore.party[0].styleId, skillId: 95110 }],
        operations: [],
        note: '',
        overrideEntries: [],
      },
      operations: [],
      operationState: {
        kishinkaStatus: { hasTezuka: false },
        makaiKiheiStatus: { hasYamawaki: false, available: false, remainingUses: 0 },
      },
      stateBefore,
      stateAfter: stateBefore,
      onSlotChange: () => {},
      onCommit: () => {},
      onNoteChange: () => {},
      onPreviewRequest: () => {},
      onOdChange: () => {},
      onOperationAdd: () => {},
      onOperationRemove: () => {},
      simulatorSettings: createSimulatorSettings(),
    });
    row.mount();

    const slot = root.querySelector('[data-turn-slot][data-position="0"]');
    const indicator = slot?.querySelector('[data-role="repeat-indicator"]');
    assert.equal(slot?.dataset.repeatCastCount, '2');
    assert.equal(indicator?.textContent?.trim(), 'x2');
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

test('TurnAreaController committed SP badge keeps post-cost value even when the skill heals self SP', () =>
  withDom(({ root, win }) => {
    const normalSkill = createSkill({
      id: 9520,
      name: '通常攻撃',
      targetType: 'Self',
      parts: [{ skill_type: 'Protection', target_type: 'Self' }],
    });
    const selfHealSkill = createSkill({
      id: 9521,
      name: '神命を宿す瞳',
      targetType: 'Self',
      spCost: 8,
      parts: [
        { skill_type: 'Protection', target_type: 'Self' },
        { skill_type: 'HealSp', target_type: 'Self', power: [3, 0] },
      ],
    });
    const state = createState(normalSkill, 1, {
      initialSP: 17,
      skills: [normalSkill, selfHealSkill],
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
    let inputSelect = inputRow.querySelector('[data-skill-select][data-party-index="0"]');
    inputSelect.value = '9521';
    inputSelect.dispatchEvent(new win.Event('change', { bubbles: true }));

    inputRow = getInputRow();
    assert.equal(getBadgeText(inputRow), '9', 'preview は turn start 17 - cost 8 を表示する');

    inputRow.querySelector('[data-role="commit-btn"]').dispatchEvent(
      new win.MouseEvent('click', { bubbles: true })
    );

    const committedRow = getRows().item(0);
    assert.equal(getBadgeText(committedRow), '9', 'committed 行でも self HealSp 後の 12 ではなく post-cost の 9 を表示する');
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
    assert.ok(statusEl.querySelector('[data-role="turn-replay-status-close"]'));
    assert.match(root.querySelector('[data-turn-info]').textContent, /Warn\(/);
  }));

test('TurnAreaController surfaces pending summon warnings on the input row', () =>
  withDom(({ root }) => {
    const actorSkill = createSkill({
      id: 95115,
      name: 'Safe Guard',
      targetType: 'Self',
      parts: [{ skill_type: 'Protection', target_type: 'Self' }],
    });
    const state = createState(actorSkill, 3);
    state.turnState.enemyState.enemyNamesByEnemy = { 0: 'Alpha', 1: 'Beta', 2: 'Gamma' };
    state.turnState.enemyState.statuses = [];

    const { controller, engineManager } = createTurnAreaController({
      root,
      state,
      simulatorSettings: createSimulatorSettings(),
      enemyPresets: [createEnemyPreset()],
    });

    assert.equal(engineManager.addPendingSpecialOperation(createSummonEnemyOperation()), true);
    controller.setEnemyPresets([createEnemyPreset()]);

    assert.match(root.querySelector('[data-turn-info]').textContent, /Warn\(/);
  }));

test('TurnAreaController status summary can be dismissed by close button', () =>
  withDom(({ root }) => {
    const costlySkill = createSkill({
      id: 95117,
      name: 'Risk Cut',
      targetType: 'Self',
      spCost: 8,
      parts: [{ skill_type: 'Protection', target_type: 'Self' }],
    });
    const state = createState(costlySkill, 1, {
      initialSP: 1,
      skills: [costlySkill],
    });

    createTurnAreaController({
      root,
      state,
      simulatorSettings: createSimulatorSettings(),
    });

    root.querySelector('[data-role="commit-btn"]').click();

    const statusEl = document.querySelector('[data-role="turn-replay-status"]');
    assert.ok(statusEl);
    assert.match(statusEl.textContent, /再計算完了/);

    const closeButton = statusEl.querySelector('[data-role="turn-replay-status-close"]');
    assert.ok(closeButton);
    closeButton.click();

    assert.match(statusEl.className, /hidden/);
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
    assert.equal(infoSpace.contains(trigger), false);
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

test('TurnRowController shortens ally target labels using the shortest character name', () =>
  withDom(({ root, win }) => {
    const skill = createSkill({
      id: 95031,
      name: 'Frontline Buff',
      targetType: 'AllySingleWithoutSelf',
      parts: [{ skill_type: 'AdditionalTurn', target_type: 'AllySingleWithoutSelf' }],
    });
    const state = createFrontlineState([skill], 1, [
      { characterId: 'ACTOR', characterName: '前衛 1' },
      {},
      {},
      {},
      { characterId: 'RKayamori', characterName: '茅森 月歌' },
      {},
    ]);
    mountTurnRow({
      root,
      stateBefore: state,
      simulatorSettings: createSimulatorSettings({
        enemyMode: TARGET_SELECTION_MODES.SIMPLE,
        allyMode: TARGET_SELECTION_MODES.MANUAL,
      }),
      store: createStoreStub({
        RKayamori: {
          label: 'RKayamori',
          name: '茅森 月歌 — Ruka Kayamori',
        },
      }),
    });

    root
      .querySelector('[data-role="target-trigger"][data-target-kind="ally"]')
      .dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
    root
      .querySelector('[data-role="target-candidate"][data-target-kind="ally"][data-style-id="9304"]')
      .dispatchEvent(new win.MouseEvent('click', { bubbles: true }));

    const trigger = root.querySelector('[data-role="target-trigger"][data-target-kind="ally"]');
    assert.match(trigger.textContent ?? '', /味方/);
    assert.match(trigger.textContent ?? '', /月歌/);
    assert.doesNotMatch(trigger.textContent ?? '', /P5/);
    assert.doesNotMatch(trigger.textContent ?? '', /茅森 月歌/);
  }));

test('TurnRowController opens enemy detail popup from Enemy label context menu', () =>
  withDom(({ root, win }) => {
    const state = createState(
      createSkill({
        id: 9504,
        name: 'Single Slash',
        targetType: 'Single',
        parts: [{ skill_type: 'AttackSkill', target_type: 'Single', type: 'Slash' }],
      }),
      3
    );
    state.turnState.enemyState.enemyNamesByEnemy = {
      0: 'Alpha',
      1: 'Beta',
      2: 'Gamma',
    };
    state.turnState.enemyState.statuses = [
      {
        statusType: 'AttackDown',
        targetIndex: 1,
        remainingTurns: 2,
        exitCond: 'EnemyTurnEnd',
      },
    ];

    mountTurnRow({
      root,
      stateBefore: state,
      simulatorSettings: createSimulatorSettings(),
    });

    const trigger = root.querySelector('[data-role="enemy-detail-trigger"]');
    assert.equal(trigger.getAttribute('aria-label'), '敵情報確認');
    assert.equal(
      trigger.querySelector('.turn-info-enemy-button__label-text--full')?.textContent?.trim(),
      '敵情報確認'
    );
    assert.equal(
      trigger.querySelector('.turn-info-enemy-button__label-text--medium')?.textContent?.trim(),
      '敵情報'
    );
    assert.equal(
      trigger.querySelector('.turn-info-enemy-button__label-text--short')?.textContent?.trim(),
      '敵'
    );
    const popup = openEnemyDetailPopup(trigger, win, { eventType: 'contextmenu' });
    const tabs = popup.querySelectorAll('[data-role="enemy-popup-tab"]');
    assert.equal(tabs.length, 3);
    assert.match(tabs.item(0).className, /\bchar-popup-tab\b/);
    assert.match(popup.textContent ?? '', /E1 Alpha/);

    const betaTab = popup.querySelector('[data-role="enemy-popup-tab"][data-enemy-tab-index="1"]');
    assert.ok(betaTab);
    betaTab.dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
    const rerenderedPopup = getEnemyDetailPopup(win);
    assert.ok(rerenderedPopup);
    assert.match(rerenderedPopup.textContent ?? '', /E2 Beta/);
    assert.match(rerenderedPopup.textContent ?? '', /攻撃力ダウン/);
  }));

test('TurnRowController enemy detail popup uses a foldable 名称 section and omits the old title label', () =>
  withDom(({ root, win }) => {
    setViewportSize(win, { width: 1280, height: 900 });
    const state = createState(
      createSkill({
        id: 95048,
        name: 'Single Slash',
        targetType: 'Single',
        parts: [{ skill_type: 'AttackSkill', target_type: 'Single', type: 'Slash' }],
      }),
      1
    );
    state.turnState.enemyState.enemyNamesByEnemy = { 0: 'Alpha' };

    mountTurnRow({
      root,
      stateBefore: state,
      simulatorSettings: createSimulatorSettings(),
    });

    const popup = openEnemyDetailPopup(root.querySelector('[data-role="enemy-detail-trigger"]'), win);
    assert.ok(popup.querySelector('[data-role="enemy-popup-header"]'));
    assert.equal((popup.textContent ?? '').includes('敵詳細'), false);
    assert.ok(popup.querySelector('[data-role="enemy-popup-layout"][data-layout-mode="narrow"]'));

    const wideLayoutToggle = popup.querySelector(
      '[data-role="enemy-popup-layout-option"][data-layout-preference="wide"]'
    );
    assert.ok(wideLayoutToggle);
    clickElement(win, wideLayoutToggle);

    const widePopup = getEnemyDetailPopup(win);
    assert.ok(widePopup);
    assert.ok(widePopup.querySelector('[data-role="enemy-popup-layout"][data-layout-mode="wide"]'));

    const toggle = widePopup.querySelector('[data-role="enemy-popup-basic-toggle"][data-enemy-index="0"]');
    assert.ok(toggle);
    assert.match(toggle.textContent ?? '', /名称/);
    assert.match(toggle.textContent ?? '', /E1 Alpha/);
    assert.equal(toggle.getAttribute('aria-expanded'), 'true');
    assert.match(toggle.textContent ?? '', /▲/);
    assert.ok(
      widePopup.querySelector(
        '[data-role="enemy-popup-column"][data-enemy-tab-index="0"] [data-role="enemy-popup-basic-info"]'
      )
    );

    const unusedToggle = widePopup.querySelector(
      '[data-role="enemy-popup-basic-toggle"][data-enemy-index="2"]'
    );
    assert.ok(unusedToggle);
    assert.equal(unusedToggle.getAttribute('aria-expanded'), 'false');
    assert.match(unusedToggle.textContent ?? '', /▼/);
    assert.equal(
      widePopup.querySelector(
        '[data-role="enemy-popup-column"][data-enemy-tab-index="2"] [data-role="enemy-popup-basic-info"]'
      ),
      null
    );

    clickElement(win, toggle);
    const collapsedPopup = getEnemyDetailPopup(win);
    assert.ok(collapsedPopup);
    const collapsedToggle = collapsedPopup.querySelector(
      '[data-role="enemy-popup-basic-toggle"][data-enemy-index="0"]'
    );
    assert.ok(collapsedToggle);
    assert.equal(collapsedToggle.getAttribute('aria-expanded'), 'false');
    assert.match(collapsedToggle.textContent ?? '', /▼/);
    assert.equal(
      collapsedPopup.querySelector(
        '[data-role="enemy-popup-column"][data-enemy-tab-index="0"] [data-role="enemy-popup-basic-info"]'
      ),
      null
    );
  }));

test('EnemyDetailPopup defaults to narrow for one occupied enemy and keeps manual wide layout across rerenders', () =>
  withDom(({ win }) => {
    setViewportSize(win, { width: 1360, height: 900 });
    const payload = createEnemyPopupPayload(1);
    const popup = new EnemyDetailPopup();
    popup.show(payload, 0);

    let root = popup.getRootElement();
    assert.ok(root?.querySelector('[data-role="enemy-popup-layout"][data-layout-mode="narrow"]'));

    const wideToggle = root?.querySelector(
      '[data-role="enemy-popup-layout-option"][data-layout-preference="wide"]'
    );
    assert.ok(wideToggle);
    clickElement(win, wideToggle);

    root = popup.getRootElement();
    assert.ok(root?.querySelector('[data-role="enemy-popup-layout"][data-layout-mode="wide"]'));
    assert.equal(root?.querySelectorAll('[data-role="enemy-popup-column"]').length, 3);

    const secondTab = root?.querySelector('[data-role="enemy-popup-tab"][data-enemy-tab-index="1"]');
    assert.ok(secondTab);
    clickElement(win, secondTab);

    root = popup.getRootElement();
    assert.ok(root?.querySelector('[data-role="enemy-popup-layout"][data-layout-mode="wide"]'));

    popup.show(payload, 1);
    root = popup.getRootElement();
    assert.ok(root?.querySelector('[data-role="enemy-popup-layout"][data-layout-mode="wide"]'));

    popup.close();

    const reopenedPopup = new EnemyDetailPopup();
    reopenedPopup.show(payload, 0);
    const reopenedRoot = reopenedPopup.getRootElement();
    assert.ok(reopenedRoot?.querySelector('[data-role="enemy-popup-layout"][data-layout-mode="narrow"]'));
    reopenedPopup.close();
  }));

test('EnemyDetailPopup basic info shows Eシールド summary when present', () =>
  withDom(() => {
    const popup = new EnemyDetailPopup();
    popup.show(createEnemyPopupPayload(1), 0);

    const root = popup.getRootElement();
    assert.ok(root);
    const summary = root.querySelector('[data-role="enemy-popup-e-shield-summary"]');
    assert.ok(summary);
    assert.equal(summary.querySelectorAll('[data-role="enemy-popup-e-shield-badge"]').length, 1);
    assert.match(summary.textContent ?? '', /10\/10/);
    assert.match(summary.textContent ?? '', /光 \/ 闇/);
    popup.close();
  }));

test('EnemyDetailPopup basic info shows normal HP current and max when supplied', () =>
  withDom(() => {
    const popup = new EnemyDetailPopup();
    const payload = createEnemyPopupPayload(1);
    payload.enemies[0].hpCurrent = 900;
    payload.enemies[0].hpMax = 1000;
    popup.show(payload, 0);

    const root = popup.getRootElement();
    const hpRow = [...root.querySelectorAll('[data-role="enemy-popup-basic-info-row"]')]
      .find((row) => row.textContent.includes('HP'));
    assert.ok(hpRow);
    assert.equal(
      hpRow.querySelector('[data-role="enemy-popup-basic-info-value"]')?.textContent,
      '900 / 1000'
    );
    popup.close();
  }));

test('EnemyDetailPopup basic info keeps extra HP gauge display before normal HP fields', () =>
  withDom(() => {
    const popup = new EnemyDetailPopup();
    const payload = createEnemyPopupPayload(1);
    payload.enemies[0].extraHpGaugeState = { total: 3, remaining: 2, values: [100, 100, 100] };
    payload.enemies[0].hpCurrent = 900;
    payload.enemies[0].hpMax = 1000;
    popup.show(payload, 0);

    const root = popup.getRootElement();
    const hpRow = [...root.querySelectorAll('[data-role="enemy-popup-basic-info-row"]')]
      .find((row) => row.textContent.includes('HP'));
    assert.ok(hpRow);
    assert.equal(
      hpRow.querySelector('[data-role="enemy-popup-basic-info-value"]')?.textContent,
      '2 / 3'
    );
    popup.close();
  }));

test('TurnRowController omits Eシールド strip when no enemy has Eシールド state', () =>
  withDom(({ root }) => {
    const skill = createSkill({
      id: 9600,
      name: 'Protection',
      targetType: 'Self',
      parts: [{ skill_type: 'Protection', target_type: 'Self' }],
    });
    const state = createState(skill, 2);

    mountTurnRow({
      root,
      stateBefore: state,
      simulatorSettings: createSimulatorSettings(),
    });

    assert.equal(root.querySelector('[data-role="turn-info-e-shield-strip"]'), null);
  }));

test('TurnRowController renders compact Eシールド strip with split colors and depleted badge', () =>
  withDom(({ root }) => {
    const skill = createSkill({
      id: 9602,
      name: 'Single Slash',
      targetType: 'Single',
      parts: [{ skill_type: 'AttackSkill', target_type: 'Single', type: 'Slash' }],
    });
    const stateBefore = createState(skill, 3);
    const stateAfter = createState(skill, 3);
    stateAfter.turnState.enemyState.eShieldStateByEnemy = {
      0: createEShieldState({ current: 9, max: 10, elements: ['Fire'] }),
      1: createEShieldState({ current: 7, max: 10, elements: ['Light', 'Dark'] }),
      2: createEShieldState({ current: 0, max: 10, elements: ['Fire', 'Ice', 'Thunder'] }),
    };

    mountTurnRow({
      root,
      stateBefore,
      stateAfter,
      simulatorSettings: createSimulatorSettings(),
    });

    const strip = root.querySelector('[data-role="turn-info-e-shield-strip"]');
    assert.ok(strip);
    const badges = strip.querySelectorAll('[data-role="turn-info-e-shield-badge"]');
    assert.equal(badges.length, 3);
    assert.equal(
      strip.querySelectorAll('[data-role="turn-info-e-shield-badge"][data-eshield-split-count="1"]').length,
      1
    );
    assert.equal(
      strip.querySelectorAll('[data-role="turn-info-e-shield-badge"][data-eshield-split-count="2"]').length,
      1
    );
    assert.equal(
      strip.querySelectorAll('[data-role="turn-info-e-shield-badge"][data-eshield-split-count="3"]').length,
      1
    );
    assert.equal(
      strip.querySelectorAll('[data-role="turn-info-e-shield-badge"][data-eshield-depleted="true"]').length,
      1
    );
    assert.match(strip.textContent ?? '', /9/);
    assert.match(strip.textContent ?? '', /7/);
    assert.match(strip.textContent ?? '', /0/);
  }));

test('EnemyDetailPopup defaults to wide for multiple occupied enemies and allows manual narrow selection', () =>
  withDom(({ win }) => {
    setViewportSize(win, { width: 1360, height: 900 });
    const popup = new EnemyDetailPopup();
    popup.show(createEnemyPopupPayload(2), 0);

    let root = popup.getRootElement();
    assert.ok(root?.querySelector('[data-role="enemy-popup-layout"][data-layout-mode="wide"]'));
    assert.equal(root?.querySelectorAll('[data-role="enemy-popup-column"]').length, 3);

    const narrowToggle = root?.querySelector(
      '[data-role="enemy-popup-layout-option"][data-layout-preference="narrow"]'
    );
    assert.ok(narrowToggle);
    clickElement(win, narrowToggle);

    root = popup.getRootElement();
    assert.ok(root?.querySelector('[data-role="enemy-popup-layout"][data-layout-mode="narrow"]'));
    assert.equal(root?.querySelectorAll('[data-role="enemy-popup-column"]').length, 1);
    popup.close();
  }));

test('EnemyDetailPopup forces narrow below the minimum multi-column width and restores the manual layout after resize', () =>
  withDom(({ win }) => {
    setViewportSize(win, { width: 1360, height: 900 });
    const popup = new EnemyDetailPopup();
    popup.show(createEnemyPopupPayload(1), 0);

    let root = popup.getRootElement();
    const wideToggle = root?.querySelector(
      '[data-role="enemy-popup-layout-option"][data-layout-preference="wide"]'
    );
    assert.ok(wideToggle);
    clickElement(win, wideToggle);

    root = popup.getRootElement();
    assert.ok(root?.querySelector('[data-role="enemy-popup-layout"][data-layout-mode="wide"]'));

    setViewportSize(win, { width: 1240, height: 900 });
    win.dispatchEvent(new win.Event('resize'));

    root = popup.getRootElement();
    assert.ok(root?.querySelector('[data-role="enemy-popup-layout"][data-layout-mode="narrow"]'));
    assert.equal(
      root?.querySelector('[data-role="enemy-popup-layout-option"][data-layout-preference="wide"]')?.disabled,
      true
    );

    setViewportSize(win, { width: 1360, height: 900 });
    win.dispatchEvent(new win.Event('resize'));

    root = popup.getRootElement();
    assert.ok(root?.querySelector('[data-role="enemy-popup-layout"][data-layout-mode="wide"]'));
    assert.equal(
      root?.querySelector('[data-role="enemy-popup-layout-option"][data-layout-preference="wide"]')?.disabled,
      false
    );
    popup.close();
  }));

test('TurnRowController opens enemy detail popup from Enemy label click', () =>
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
    state.turnState.enemyState.enemyNamesByEnemy = {
      0: 'Alpha',
    };
    state.turnState.enemyState.statuses = [
      {
        statusType: 'DefenseDown',
        targetIndex: 0,
        remainingTurns: 2,
        exitCond: 'EnemyTurnEnd',
      },
    ];

    mountTurnRow({
      root,
      stateBefore: state,
      simulatorSettings: createSimulatorSettings(),
    });

    const popup = openEnemyDetailPopup(root.querySelector('[data-role="enemy-detail-trigger"]'), win);
    assert.match(popup.textContent ?? '', /E1 Alpha/);
    assert.match(popup.textContent ?? '', /防御力ダウン/);
  }));

test('TurnAreaController keeps only the enemy detail trigger in the row and exposes popup actions in a 3-column wide layout', () =>
  withDom(({ root, win }) => {
    setViewportSize(win, { width: 1280, height: 900 });
    const state = createState(
      createSkill({
        id: 95040,
        name: 'Single Slash',
        targetType: 'Single',
        parts: [{ skill_type: 'AttackSkill', target_type: 'Single', type: 'Slash' }],
      }),
      3
    );
    createTurnAreaController({
      root,
      state,
      simulatorSettings: createSimulatorSettings(),
      enemyPresets: [createEnemyPreset()],
    });

    const inputRow = root.querySelector('[data-turn-row][data-row-mode="input"]');
    const inputToolsBox = inputRow?.querySelector('[data-role="enemy-tools-box"]');
    assert.ok(inputToolsBox);
    const inputTrigger = inputToolsBox.querySelector('[data-role="enemy-detail-trigger"]');
    assert.ok(inputTrigger);
    assert.equal(inputToolsBox.querySelector('[data-role="enemy-summon-toggle"]'), null);
    assert.equal(inputToolsBox.querySelector('[data-role="manual-break-toggle"]'), null);
    assert.equal(inputToolsBox.querySelector('[data-role="kill-toggle"]'), null);

    const inputPopup = openEnemyDetailPopup(inputTrigger, win);
    const inputWideLayout = inputPopup.querySelector('[data-role="enemy-popup-layout"][data-layout-mode="wide"]');
    assert.ok(inputWideLayout);
    assert.equal(inputWideLayout.querySelectorAll('[data-role="enemy-popup-column"]').length, 3);
    const inputActivePanel = inputWideLayout.querySelector('[data-role="enemy-popup-column"][data-selected="true"]');
    assert.ok(inputActivePanel);
    assert.deepEqual(
      [...inputPopup.querySelectorAll('[data-role="enemy-popup-action"]')].map((button) => button.dataset.actionType),
      ['summon', 'eshield', 'break', 'kill']
    );
    assert.deepEqual(
      [...inputPopup.querySelectorAll('[data-role="enemy-popup-action"]')].map(
        (button) => button.lastElementChild?.textContent?.trim()
      ),
      ['召喚', 'Eシールド', 'ブレイク付与', '討伐']
    );
    const actionIconSources = [...inputPopup.querySelectorAll('[data-role="enemy-popup-action-icon"]')]
      .map((image) => image.getAttribute('src') ?? '');
    assert.equal(actionIconSources.some((src) => src.includes('Summon.webp')), true);
    assert.equal(actionIconSources.some((src) => src.includes('Break.webp')), true);
    assert.equal(actionIconSources.some((src) => src.includes('defeat.webp')), true);
    assert.ok(
      inputPopup.querySelector(
        '[data-role="enemy-popup-action"][data-action-type="eshield"] [data-role="enemy-popup-action-eshield-icon"]'
      )
    );
    getEnemyDetailPopup(win).querySelector('[data-role="popup-close"]').dispatchEvent(
      new win.MouseEvent('click', { bubbles: true, cancelable: true })
    );

    root
      .querySelector('[data-role="commit-btn"]')
      .dispatchEvent(new win.MouseEvent('click', { bubbles: true }));

    const committedRow = root.querySelector('[data-turn-row][data-row-mode="committed"]');
    const committedToolsBox = committedRow?.querySelector('[data-role="enemy-tools-box"]');
    assert.ok(committedToolsBox);
    const committedTrigger = committedToolsBox.querySelector('[data-role="enemy-detail-trigger"]');
    assert.ok(committedTrigger);
    assert.equal(committedToolsBox.querySelector('[data-role="enemy-summon-toggle"]'), null);
    assert.equal(committedToolsBox.querySelector('[data-role="manual-break-toggle"]'), null);
    assert.equal(committedToolsBox.querySelector('[data-role="kill-toggle"]'), null);

    const committedPopup = openEnemyDetailPopup(committedTrigger, win);
    const committedWideLayout = committedPopup.querySelector('[data-role="enemy-popup-layout"][data-layout-mode="wide"]');
    assert.ok(committedWideLayout);
    assert.equal(
      committedPopup.querySelector('[data-role="enemy-popup-action"][data-action-type="summon"]').disabled,
      true
    );
    assert.equal(
      committedPopup.querySelector('[data-role="enemy-popup-action"][data-action-type="eshield"]').disabled,
      true
    );
    assert.equal(
      committedPopup.querySelector('[data-role="enemy-popup-action"][data-action-type="break"]').disabled,
      true
    );
    assert.equal(
      committedPopup.querySelector('[data-role="enemy-popup-action"][data-action-type="kill"]').disabled,
      true
    );
  }));

test('TurnRowController enemy popup switches defeat to HP break for multi-gauge enemies and renders HP break chips', () =>
  withDom(({ root, win }) => {
    const skill = createSkill({
      id: 950305,
      name: 'Single Slash',
      targetType: 'Single',
      parts: [{ skill_type: 'AttackSkill', target_type: 'Single', type: 'Slash' }],
    });
    const state = createState(skill, 1);
    state.turnState.enemyState.enemyNamesByEnemy = { 0: '多重ゲージ敵' };
    state.turnState.enemyState.extraHpGaugeStateByEnemy = {
      0: {
        total: 3,
        remaining: 2,
        values: [40400000, 40400000, 40400000],
      },
    };

    mountTurnRow({
      root,
      stateBefore: state,
      simulatorSettings: createSimulatorSettings(),
    });

    const popup = openEnemyDetailPopup(root.querySelector('[data-role="enemy-detail-trigger"]'), win, {
      eventType: 'contextmenu',
    });
    assert.match(popup.textContent ?? '', /HP/);
    assert.match(popup.textContent ?? '', /2 \/ 3/);

    const hpBreakAction = popup.querySelector('[data-role="enemy-popup-action"][data-action-type="hpbreak"]');
    assert.ok(hpBreakAction);
    assert.match(hpBreakAction.textContent ?? '', /HP破壊/);
    assert.equal(popup.querySelector('[data-role="enemy-popup-action"][data-action-type="kill"]'), null);

    triggerEnemyPopupAction(win, 'hpbreak', { enemyIndex: 0 });
    const refreshedPopup = getEnemyDetailPopup(win);
    assert.match(refreshedPopup.textContent ?? '', /HP破壊した前衛を選択/);

    clickElement(win, refreshedPopup.querySelector('[data-role="popup-hp-break-single-toggle"]'));
    clickElement(win, getEnemyDetailPopup(win).querySelector('[data-role="enemy-popup-outcome-confirm"]'));

    const hpBreakChip = root.querySelector('[data-role="hp-break-chip"]');
    assert.ok(hpBreakChip);
    assert.match(hpBreakChip.textContent ?? '', /HP破壊/);
  }));

test('TurnRowController opens summon editor and queues selected summon enemy operation', () =>
  withDom(({ root, win }) => {
    const state = createState(
      createSkill({
        id: 95041,
        name: 'Single Slash',
        targetType: 'Single',
        parts: [{ skill_type: 'AttackSkill', target_type: 'Single', type: 'Slash' }],
      }),
      1
    );
    const addedOperations = [];
    const row = new TurnRowController({
      root,
      store: createStoreStub(),
      enemyPresets: [
        createEnemyPreset({
          id: DEATH_SLUG_WHITE_SAMPLE_ENEMY.id,
          name: DEATH_SLUG_WHITE_SAMPLE_ENEMY.name,
          max_d_rate: 999,
        }),
        createEnemyPreset({
          id: DEFAULT_SUMMON_SAMPLE_ENEMY.id,
          name: DEFAULT_SUMMON_SAMPLE_ENEMY.name,
          eShield: {
            count: 10,
            max: 10,
            elements: ['Fire', 'Ice'],
            def_up_rate: 0,
            dmg_limit: 0,
          },
        }),
      ],
      turnIndex: 0,
      record: null,
      replayTurn: null,
      operations: [],
      operationState: {
        kishinkaStatus: { hasTezuka: false },
        makaiKiheiStatus: { hasYamawaki: false, available: false, remainingUses: 0 },
      },
      stateBefore: state,
      stateAfter: null,
      simulatorSettings: createSimulatorSettings(),
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
      onOperationAdd: (_turnIndex, operation) => {
        addedOperations.push(operation);
      },
      onOperationRemove: () => {},
    });
    row.mount();

    const trigger = root.querySelector('[data-role="enemy-detail-trigger"]');
    const popup = openEnemyDetailPopup(trigger, win);
    // E1 is occupied — summon must be disabled
    const e1Summon = popup.querySelector('[data-role="enemy-popup-action"][data-action-type="summon"]');
    assert.ok(e1Summon);
    assert.equal(e1Summon.disabled, true);
    // Switch to E2 (empty slot) where summon is allowed
    const e2Tab = popup.querySelector('[data-role="enemy-popup-tab"][data-enemy-tab-index="1"]');
    assert.ok(e2Tab);
    e2Tab.dispatchEvent(new win.MouseEvent('click', { bubbles: true, cancelable: true }));
    const refreshedPopup = getEnemyDetailPopup(win);
    const summonButton = refreshedPopup.querySelector('[data-role="enemy-popup-action"][data-action-type="summon"]');
    assert.ok(summonButton);
    assert.equal(summonButton.disabled, false);
    assert.match(summonButton.innerHTML, /Summon\.webp/);
    summonButton.dispatchEvent(new win.MouseEvent('click', { bubbles: true }));

    const editor = root.querySelector('[data-role="enemy-summon-editor"]');
    assert.ok(editor);
    assert.equal(editor.hasAttribute('hidden'), false);
    assert.ok(getEnemyDetailPopup(win));
    assert.match(editor.className, /bg-slate-800/);
    assert.match(editor.className, /border-slate-600/);
    assert.equal(editor.style.zIndex, '1010');

    const select = root.querySelector('[data-role="enemy-summon-select"]');
    select.value = String(DEFAULT_SUMMON_SAMPLE_ENEMY.id);
    select.dispatchEvent(new win.Event('change', { bubbles: true }));

    root
      .querySelector('[data-role="enemy-summon-submit"]')
      .dispatchEvent(new win.MouseEvent('click', { bubbles: true }));

    assert.equal(addedOperations.length, 1);
    assert.equal(addedOperations[0]?.type, REPLAY_OPERATION_TYPES.SUMMON_ENEMY);
    assert.equal(addedOperations[0]?.payload?.enemyId, DEFAULT_SUMMON_SAMPLE_ENEMY.id);
    assert.equal(addedOperations[0]?.payload?.enemyName, DEFAULT_SUMMON_SAMPLE_ENEMY.name);
    assert.equal(addedOperations[0]?.payload?.targetEnemyIndex, 1);
    assert.equal(addedOperations[0]?.payload?.max_d_rate, 350);
    assert.equal(addedOperations[0]?.payload?.resistances?.element?.fire, 250);
    assert.deepEqual(addedOperations[0]?.payload?.e_shield, {
      count: 10,
      max: 10,
      elements: ['Fire', 'Ice'],
      def_up_rate: 0,
      dmg_limit: 0,
    });
  }));

test('TurnRowController keeps dead-slot summon requests on the selected enemy slot', () =>
  withDom(({ root, win }) => {
    const addedOperations = [];
    const state = createState(
      createSkill({
        id: 95049,
        name: 'Single Slash',
        targetType: 'Single',
        parts: [{ skill_type: 'AttackSkill', target_type: 'Single', type: 'Slash' }],
      }),
      1
    );
    state.turnState.enemyState.enemyNamesByEnemy = { 0: 'Alpha' };
    state.turnState.enemyState.statuses = [
      {
        statusType: 'Dead',
        targetIndex: 0,
        remainingTurns: 0,
        exitCond: 'Eternal',
      },
    ];

    const row = new TurnRowController({
      root,
      store: createStoreStub(),
      turnIndex: 0,
      rowMode: 'input',
      rowDiagnostics: null,
      record: null,
      replayTurn: null,
      operations: [],
      operationState: {
        kishinkaStatus: { hasTezuka: false },
        makaiKiheiStatus: { hasYamawaki: false, available: false, remainingUses: 0 },
      },
      stateBefore: state,
      stateAfter: null,
      enemyPresets: [createEnemyPreset()],
      simulatorSettings: createSimulatorSettings(),
      onSlotChange: () => {},
      onCommit: () => {},
      onNoteChange: () => {},
      onPreviewRequest: () => {},
      onOdChange: () => {},
      onOperationAdd: (_turnIndex, operation) => {
        addedOperations.push(operation);
      },
      onOperationRemove: () => {},
    });
    row.mount();

    const popup = openEnemyDetailPopup(root.querySelector('[data-role="enemy-detail-trigger"]'), win);
    const summonButton = popup.querySelector('[data-role="enemy-popup-action"][data-action-type="summon"]');
    assert.ok(summonButton);
    assert.equal(summonButton.disabled, false);
    summonButton.dispatchEvent(new win.MouseEvent('click', { bubbles: true }));

    const editor = root.querySelector('[data-role="enemy-summon-editor"]');
    assert.ok(editor);
    assert.match(editor.textContent ?? '', /配置先: E1/);
    assert.equal(editor.style.zIndex, '1010');
    editor
      .querySelector('[data-role="enemy-summon-submit"]')
      .dispatchEvent(new win.MouseEvent('click', { bubbles: true }));

    assert.equal(addedOperations.length, 1);
    assert.equal(addedOperations[0]?.payload?.targetEnemyIndex, 0);
  }));

test('TurnRowController draft enemy detail popup uses materialized summon state without adding a phantom slot', () =>
  withDom(({ root, win }) => {
    setViewportSize(win, { width: 1280, height: 900 });
    const summonOperation = createSummonEnemyOperation();
    const stateBefore = applyBeforeCommitOperations(
      createState(
        createSkill({
          id: 95042,
          name: 'Single Slash',
          targetType: 'Single',
          parts: [{ skill_type: 'AttackSkill', target_type: 'Single', type: 'Slash' }],
        }),
        1
      ),
      [summonOperation],
      { enemyCount: 1 }
    );
    mountTurnRow({
      root,
      stateBefore,
      simulatorSettings: createSimulatorSettings(),
      enemyPresets: [createEnemyPreset()],
      operations: [summonOperation],
    });

    const popup = openEnemyDetailPopup(root.querySelector('[data-role="enemy-detail-trigger"]'), win);
    const e2Column = popup.querySelector('[data-role="enemy-popup-column"][data-enemy-tab-index="1"]');
    const e3Column = popup.querySelector('[data-role="enemy-popup-column"][data-enemy-tab-index="2"]');
    assert.ok(e2Column);
    assert.ok(e3Column);
    assert.match(e2Column.textContent ?? '', new RegExp(DEFAULT_SUMMON_SAMPLE_ENEMY.name));
    assert.match(e3Column.textContent ?? '', /E3 未使用/);
    assert.doesNotMatch(e3Column.textContent ?? '', new RegExp(DEFAULT_SUMMON_SAMPLE_ENEMY.name));
  }));

test('TurnRowController draft enemy detail popup keeps a requested dead-slot summon on E1', () =>
  withDom(({ root, win }) => {
    setViewportSize(win, { width: 1280, height: 900 });
    const summonOperation = createSummonEnemyOperation({ targetEnemyIndex: 0 });
    const baseState = createState(
      createSkill({
        id: 95043,
        name: 'Single Slash',
        targetType: 'Single',
        parts: [{ skill_type: 'AttackSkill', target_type: 'Single', type: 'Slash' }],
      }),
      1
    );
    baseState.turnState.enemyState.enemyNamesByEnemy = { 0: 'Alpha' };
    baseState.turnState.enemyState.statuses = [
      {
        statusType: 'Dead',
        targetIndex: 0,
        remainingTurns: 0,
        exitCond: 'Eternal',
      },
    ];
    const stateBefore = applyBeforeCommitOperations(baseState, [summonOperation], { enemyCount: 1 });
    mountTurnRow({
      root,
      stateBefore,
      simulatorSettings: createSimulatorSettings(),
      enemyPresets: [createEnemyPreset()],
      operations: [summonOperation],
    });

    const popup = openEnemyDetailPopup(root.querySelector('[data-role="enemy-detail-trigger"]'), win);
    const wideLayoutToggle = popup.querySelector(
      '[data-role="enemy-popup-layout-option"][data-layout-preference="wide"]'
    );
    assert.ok(wideLayoutToggle);
    clickElement(win, wideLayoutToggle);

    const widenedPopup = getEnemyDetailPopup(win);
    assert.ok(widenedPopup);
    const e1Column = widenedPopup.querySelector('[data-role="enemy-popup-column"][data-enemy-tab-index="0"]');
    const e2Column = widenedPopup.querySelector('[data-role="enemy-popup-column"][data-enemy-tab-index="1"]');
    assert.ok(e1Column);
    assert.ok(e2Column);
    assert.match(e1Column.textContent ?? '', new RegExp(DEFAULT_SUMMON_SAMPLE_ENEMY.name));
    assert.match(e2Column.textContent ?? '', /E2 未使用/);
    assert.doesNotMatch(e2Column.textContent ?? '', new RegExp(DEFAULT_SUMMON_SAMPLE_ENEMY.name));
  }));

test('TurnAreaController popup Eシールド editor prefills current state, supports max restore, and upserts same-slot operations', () =>
  withDom(({ root, win }) => {
    setViewportSize(win, { width: 1280, height: 900 });
    const state = createState(
      createSkill({
        id: 95044,
        name: 'Protection',
        targetType: 'Self',
        parts: [{ skill_type: 'Protection', target_type: 'Self' }],
      }),
      1
    );
    state.turnState.enemyState.enemyNamesByEnemy = { 0: 'Alpha' };
    state.turnState.enemyState.eShieldStateByEnemy = {
      0: createEShieldState({ current: 0, max: 30, elements: ['Light', 'Dark'] }),
    };

    const { engineManager } = createTurnAreaController({
      root,
      state,
      simulatorSettings: createSimulatorSettings(),
      enemyPresets: [createEnemyPreset()],
    });

    const inputRow = root.querySelector('[data-turn-row][data-row-mode="input"]');
    const popup = openEnemyDetailPopup(inputRow.querySelector('[data-role="enemy-detail-trigger"]'), win);
    const eShieldAction = popup.querySelector('[data-role="enemy-popup-action"][data-action-type="eshield"]');
    assert.ok(eShieldAction);
    assert.equal(eShieldAction.disabled, false);
    clickElement(win, eShieldAction);

    let refreshedPopup = getEnemyDetailPopup(win);
    let editor = refreshedPopup.querySelector('[data-role="enemy-popup-eshield-editor"]');
    assert.ok(editor);
    const currentInput = editor.querySelector('[data-role="enemy-popup-eshield-current"]');
    const maxInput = editor.querySelector('[data-role="enemy-popup-eshield-max"]');
    assert.equal(currentInput?.value, '0');
    assert.equal(maxInput?.value, '30');
    assert.deepEqual(
      [...editor.querySelectorAll('[data-role="enemy-popup-eshield-element-toggle"]')]
        .filter((input) => input.checked)
        .map((input) => input.dataset.element),
      ['Light', 'Dark']
    );

    maxInput.value = '45';
    clickElement(win, editor.querySelector('[data-role="enemy-popup-eshield-fill-max"]'));
    assert.equal(currentInput.value, '45');
    clickElement(win, editor.querySelector('[data-role="enemy-popup-eshield-apply"]'));

    refreshedPopup = getEnemyDetailPopup(win);
    assert.ok(refreshedPopup?.querySelector('[data-role="enemy-popup-eshield-editor"]'));
    assert.match(refreshedPopup.textContent ?? '', /45\/45/);
    assert.ok(root.querySelector('[data-role="turn-info-e-shield-strip"]'));
    assert.equal(root.querySelectorAll('[data-role="operation-chip"]').length, 1);
    assert.match(root.querySelector('[data-role="operation-chip"]')?.textContent ?? '', /Eシールド: E1 45\/45/);
    assert.equal(engineManager.pendingSpecialOperations.length, 1);
    assert.deepEqual(engineManager.pendingSpecialOperations[0], createSetEnemyEShieldOperation({
      targetEnemyIndex: 0,
      eShieldState: createEShieldState({ current: 45, max: 45, elements: ['Light', 'Dark'] }),
    }));

    editor = refreshedPopup.querySelector('[data-role="enemy-popup-eshield-editor"]');
    const nextMaxInput = editor.querySelector('[data-role="enemy-popup-eshield-max"]');
    nextMaxInput.value = '60';
    clickElement(win, editor.querySelector('[data-role="enemy-popup-eshield-fill-max"]'));
    clickElement(win, editor.querySelector('[data-role="enemy-popup-eshield-apply"]'));

    const updatedPopup = getEnemyDetailPopup(win);
    assert.ok(updatedPopup?.querySelector('[data-role="enemy-popup-eshield-editor"]'));
    assert.match(updatedPopup.textContent ?? '', /60\/60/);
    assert.equal(root.querySelectorAll('[data-role="operation-chip"]').length, 1);
    assert.match(root.querySelector('[data-role="operation-chip"]')?.textContent ?? '', /Eシールド: E1 60\/60/);
    assert.equal(engineManager.pendingSpecialOperations.length, 1);
    assert.deepEqual(engineManager.pendingSpecialOperations[0], createSetEnemyEShieldOperation({
      targetEnemyIndex: 0,
      eShieldState: createEShieldState({ current: 60, max: 60, elements: ['Light', 'Dark'] }),
    }));
  }));

test('TurnAreaController popup Eシールド editor clears the summary and strip immediately when attributes are removed', () =>
  withDom(({ root, win }) => {
    setViewportSize(win, { width: 1280, height: 900 });
    const state = createState(
      createSkill({
        id: 95045,
        name: 'Protection',
        targetType: 'Self',
        parts: [{ skill_type: 'Protection', target_type: 'Self' }],
      }),
      1
    );
    state.turnState.enemyState.eShieldStateByEnemy = {
      0: createEShieldState({ current: 18, max: 30, elements: ['Light', 'Dark'] }),
    };

    const { engineManager } = createTurnAreaController({
      root,
      state,
      simulatorSettings: createSimulatorSettings(),
      enemyPresets: [createEnemyPreset()],
    });

    const inputRow = root.querySelector('[data-turn-row][data-row-mode="input"]');
    const popup = openEnemyDetailPopup(inputRow.querySelector('[data-role="enemy-detail-trigger"]'), win);
    clickElement(win, popup.querySelector('[data-role="enemy-popup-action"][data-action-type="eshield"]'));

    const editor = getEnemyDetailPopup(win).querySelector('[data-role="enemy-popup-eshield-editor"]');
    assert.ok(editor);
    clickElement(win, editor.querySelector('[data-role="enemy-popup-eshield-element-toggle"][data-element="Light"]'));
    clickElement(win, editor.querySelector('[data-role="enemy-popup-eshield-element-toggle"][data-element="Dark"]'));
    clickElement(win, editor.querySelector('[data-role="enemy-popup-eshield-apply"]'));

    const refreshedPopup = getEnemyDetailPopup(win);
    assert.equal(refreshedPopup.querySelector('[data-role="enemy-popup-e-shield-summary"]'), null);
    assert.equal(root.querySelector('[data-role="turn-info-e-shield-strip"]'), null);
    assert.equal(root.querySelectorAll('[data-role="operation-chip"]').length, 1);
    assert.match(root.querySelector('[data-role="operation-chip"]')?.textContent ?? '', /Eシールド解除: E1/);
    assert.equal(engineManager.pendingSpecialOperations.length, 1);
    assert.deepEqual(engineManager.pendingSpecialOperations[0], createSetEnemyEShieldOperation({
      targetEnemyIndex: 0,
      eShieldState: null,
    }));
  }));

test('TurnAreaController applies popup break/kill to actor-based chips for unique single-target attribution', () =>
  withDom(({ root, win }) => {
    setViewportSize(win, { width: 1280, height: 900 });
    createTurnAreaController({
      root,
      state: createState(
        createSkill({
          id: 95041,
          name: 'Single Slash',
          targetType: 'Single',
          parts: [{ skill_type: 'AttackSkill', target_type: 'Single', type: 'Slash' }],
        }),
        3
      ),
      simulatorSettings: createSimulatorSettings(),
      enemyPresets: [createEnemyPreset()],
    });

    let inputRow = root.querySelector('[data-turn-row][data-row-mode="input"]');
    assert.ok(inputRow);

    openEnemyDetailPopup(inputRow.querySelector('[data-role="enemy-detail-trigger"]'), win);
    triggerEnemyPopupAction(win, 'break', { enemyIndex: 0 });

    inputRow = root.querySelector('[data-turn-row][data-row-mode="input"]');
    assert.ok(inputRow);
    const breakChipLabels = [...inputRow.querySelectorAll('[data-role="manual-break-chip"]')].map((chip) =>
      chip.textContent?.trim()
    );
    assert.deepEqual(breakChipLabels, ['UI1→E1 ブレイク']);
    assert.ok(getEnemyDetailPopup(win));

    openEnemyDetailPopup(inputRow.querySelector('[data-role="enemy-detail-trigger"]'), win);
    triggerEnemyPopupAction(win, 'kill', { enemyIndex: 0 });

    inputRow = root.querySelector('[data-turn-row][data-row-mode="input"]');
    assert.ok(inputRow);
    const chipLabelsAfterKill = [...inputRow.querySelectorAll('[data-role="kill-chip"]')].map((chip) =>
      chip.textContent?.trim()
    );
    assert.deepEqual(chipLabelsAfterKill, ['UI1→E1 討伐']);
  }));

test('TurnAreaController enables summon after popup-attributed kill and disables break/kill on unused slots', () =>
  withDom(({ root, win }) => {
    setViewportSize(win, { width: 1280, height: 900 });
    const { controller: _controller } = createTurnAreaController({
      root,
      state: createState(
        createSkill({
          id: 95046,
          name: 'Single Slash',
          targetType: 'Single',
          parts: [{ skill_type: 'AttackSkill', target_type: 'Single', type: 'Slash' }],
        }),
        3
      ),
      simulatorSettings: createSimulatorSettings(),
      enemyPresets: [createEnemyPreset()],
    });
    let inputRow = root.querySelector('[data-turn-row][data-row-mode="input"]');
    assert.ok(inputRow);

    openEnemyDetailPopup(inputRow.querySelector('[data-role="enemy-detail-trigger"]'), win);
    triggerEnemyPopupAction(win, 'kill', { enemyIndex: 0 });

    inputRow = root.querySelector('[data-turn-row][data-row-mode="input"]');
    assert.ok(inputRow);
    const reopenedPopup = openEnemyDetailPopup(inputRow.querySelector('[data-role="enemy-detail-trigger"]'), win);
    const summonAction = reopenedPopup.querySelector('[data-role="enemy-popup-action"][data-action-type="summon"]');
    assert.ok(summonAction);
    assert.equal(summonAction.disabled, false);
    reopenedPopup.querySelector('[data-role="popup-close"]').dispatchEvent(
      new win.MouseEvent('click', { bubbles: true, cancelable: true })
    );

    const oneEnemyRoot = win.document.createElement('div');
    root.appendChild(oneEnemyRoot);
    mountTurnRow({
      root: oneEnemyRoot,
      stateBefore: createState(
        createSkill({
          id: 95047,
          name: 'Single Slash',
          targetType: 'Single',
          parts: [{ skill_type: 'AttackSkill', target_type: 'Single', type: 'Slash' }],
        }),
        1
      ),
      simulatorSettings: createSimulatorSettings(),
      enemyPresets: [createEnemyPreset()],
    });
    const oneEnemyPopup = openEnemyDetailPopup(oneEnemyRoot.querySelector('[data-role="enemy-detail-trigger"]'), win);
    const e3Tab = oneEnemyPopup.querySelector('[data-role="enemy-popup-tab"][data-enemy-tab-index="2"]');
    assert.ok(e3Tab);
    e3Tab.dispatchEvent(new win.MouseEvent('click', { bubbles: true, cancelable: true }));
    const refreshedPopup = getEnemyDetailPopup(win);
    assert.ok(refreshedPopup);
    assert.equal(
      refreshedPopup.querySelector('[data-role="enemy-popup-action"][data-action-type="break"]').disabled,
      true
    );
    assert.equal(
      refreshedPopup.querySelector('[data-role="enemy-popup-action"][data-action-type="kill"]').disabled,
      true
    );
    assert.equal(
      refreshedPopup.querySelector('[data-role="enemy-popup-action"][data-action-type="summon"]').disabled,
      true
    );
  }));

test('TurnAreaController preserves summoned slot identity for break and follow-up through recommit', () =>
  withDom(({ root, win }) => {
    setViewportSize(win, { width: 1280, height: 900 });
    const state = createState(
      createSkill({
        id: 95047,
        name: 'Summon Break Follow',
        targetType: 'Single',
        parts: [{ skill_type: 'AttackSkill', target_type: 'Single', type: 'Slash' }],
      }),
      1,
      {
        passives: [createBreakHealPassive()],
      }
    );
    const { engineManager } = createTurnAreaController({
      root,
      state,
      simulatorSettings: createSimulatorSettings(),
      enemyPresets: [createEnemyPreset()],
    });

    let inputRow = root.querySelector('[data-turn-row][data-row-mode="input"]');
    assert.ok(inputRow);

    const summonPopup = openEnemyDetailPopup(inputRow.querySelector('[data-role="enemy-detail-trigger"]'), win);
    summonPopup
      .querySelector('[data-role="enemy-popup-tab"][data-enemy-tab-index="1"]')
      .dispatchEvent(new win.MouseEvent('click', { bubbles: true, cancelable: true }));
    getEnemyDetailPopup(win)
      .querySelector('[data-role="enemy-popup-action"][data-action-type="summon"]')
      .dispatchEvent(new win.MouseEvent('click', { bubbles: true, cancelable: true }));

    const editor = root.querySelector('[data-role="enemy-summon-editor"]');
    assert.ok(editor);
    const select = editor.querySelector('[data-role="enemy-summon-select"]');
    select.value = String(DEFAULT_SUMMON_SAMPLE_ENEMY.id);
    select.dispatchEvent(new win.Event('change', { bubbles: true }));
    editor
      .querySelector('[data-role="enemy-summon-submit"]')
      .dispatchEvent(new win.MouseEvent('click', { bubbles: true, cancelable: true }));

    inputRow = root.querySelector('[data-turn-row][data-row-mode="input"]');
    assert.ok(inputRow);
    assert.match(inputRow.querySelector('[data-role="operation-chip"]').textContent ?? '', /召喚/);

    openEnemyDetailPopup(inputRow.querySelector('[data-role="enemy-detail-trigger"]'), win);
    triggerEnemyPopupAction(win, 'break', { enemyIndex: 1 });
    getEnemyDetailPopup(win)
      .querySelector('[data-role="manual-break-target-candidate"][data-party-index="0"][data-enemy-index="1"]')
      .dispatchEvent(new win.MouseEvent('click', { bubbles: true, cancelable: true }));
    getEnemyDetailPopup(win)
      .querySelector('[data-role="manual-break-single-toggle"][data-party-index="0"]')
      .dispatchEvent(new win.MouseEvent('click', { bubbles: true, cancelable: true }));

    inputRow = root.querySelector('[data-turn-row][data-row-mode="input"]');
    assert.ok(inputRow);
    assert.equal(
      [...inputRow.querySelectorAll('[data-role="manual-break-chip"]')]
        .map((chip) => chip.textContent?.trim() ?? '')
        .some((label) => label.includes(DEFAULT_SUMMON_SAMPLE_ENEMY.name) && label.includes('ブレイク')),
      true
    );

    getEnemyDetailPopup(win)
      ?.querySelector('[data-role="popup-close"]')
      ?.dispatchEvent(new win.MouseEvent('click', { bubbles: true, cancelable: true }));

    inputRow.querySelector('[data-role="follow-up-toggle"]').dispatchEvent(
      new win.MouseEvent('click', { bubbles: true, cancelable: true })
    );
    root
      .querySelector('[data-role="follow-up-enemy-candidate"][data-position="3"][data-enemy-index="1"]')
      .dispatchEvent(new win.MouseEvent('click', { bubbles: true, cancelable: true }));

    inputRow = root.querySelector('[data-turn-row][data-row-mode="input"]');
    assert.ok(inputRow);
    assert.equal(
      [...inputRow.querySelectorAll('[data-role="follow-up-chip"]')]
        .map((chip) => chip.textContent?.trim() ?? '')
        .some((label) => label.includes('E2') && label.includes(DEFAULT_SUMMON_SAMPLE_ENEMY.name)),
      true
    );

    root
      .querySelector('[data-role="commit-btn"]')
      .dispatchEvent(new win.MouseEvent('click', { bubbles: true, cancelable: true }));

    let committedRow = root.querySelectorAll('[data-turn-row]').item(0);
    assert.ok(committedRow);
    assert.equal(
      [...committedRow.querySelectorAll('[data-role="manual-break-chip"]')]
        .map((chip) => chip.textContent?.trim() ?? '')
        .some((label) => label.includes(DEFAULT_SUMMON_SAMPLE_ENEMY.name) && label.includes('ブレイク')),
      true
    );
    assert.equal(
      [...committedRow.querySelectorAll('[data-role="follow-up-chip"]')]
        .map((chip) => chip.textContent?.trim() ?? '')
        .some((label) => label.includes('E2') && label.includes(DEFAULT_SUMMON_SAMPLE_ENEMY.name)),
      true
    );

    const committedAction = engineManager.computedRecords[0]?.actions.find(
      (action) => action.positionIndex === 0
    );
    assert.equal(committedAction?.targetEnemyIndex, 1);
    assert.equal(committedAction?.breakHitCount, 1);
    assert.equal(committedAction?.pursuedHitCount, 1);

    root.querySelector('[data-role="edit-btn"]').click();
    root.querySelector('[data-role="recommit-btn"]').click();

    committedRow = root.querySelectorAll('[data-turn-row]').item(0);
    assert.ok(committedRow);
    assert.equal(
      [...committedRow.querySelectorAll('[data-role="manual-break-chip"]')]
        .map((chip) => chip.textContent?.trim() ?? '')
        .some((label) => label.includes(DEFAULT_SUMMON_SAMPLE_ENEMY.name) && label.includes('ブレイク')),
      true
    );
    assert.equal(
      [...committedRow.querySelectorAll('[data-role="follow-up-chip"]')]
        .map((chip) => chip.textContent?.trim() ?? '')
        .some((label) => label.includes('E2') && label.includes(DEFAULT_SUMMON_SAMPLE_ENEMY.name)),
      true
    );
    assert.deepEqual(engineManager.getReplayTurn(0)?.actionOutcomeOverrides, [
      { position: 0, outcome: 'Break', enemyIndexes: [1] },
    ]);
    assert.deepEqual(engineManager.getReplayTurn(0)?.followUpOverrides, [
      { position: 3, enemyIndex: 1 },
    ]);
  }));

test('TurnAreaController shows Break badge and disables popup break action for already-broken enemies', () =>
  withDom(({ root, win }) => {
    setViewportSize(win, { width: 1280, height: 900 });
    const state = createState(
      createSkill({
        id: 95048,
        name: 'Single Slash',
        targetType: 'Single',
        parts: [{ skill_type: 'AttackSkill', target_type: 'Single', type: 'Slash' }],
      }),
      1
    );
    state.turnState.enemyState.statuses = [{ statusType: 'Break', targetIndex: 0, remainingTurns: 0 }];

    createTurnAreaController({
      root,
      state,
      simulatorSettings: createSimulatorSettings(),
      enemyPresets: [createEnemyPreset()],
    });

    const popup = openEnemyDetailPopup(root.querySelector('[data-role="enemy-detail-trigger"]'), win);
    const stateBadge = popup.querySelector('[data-role="enemy-popup-state-badge"]');
    const breakAction = popup.querySelector('[data-role="enemy-popup-action"][data-action-type="break"]');
    assert.ok(stateBadge);
    assert.ok(breakAction);
    assert.equal(stateBadge.textContent?.trim(), 'BREAK');
    assert.equal(breakAction.textContent?.trim(), 'ブレイク付与');
    assert.equal(breakAction.disabled, true);
    assert.equal(popup.querySelector('[data-status-type="Break"]'), null);
  }));

test('TurnRowController enemy detail popup shows enemy resistance and absorb stats', () =>
  withDom(({ root, win }) => {
    const state = createState(
      createSkill({
        id: 95042,
        name: 'Single Slash',
        targetType: 'Single',
        parts: [{ skill_type: 'AttackSkill', target_type: 'Single', type: 'Slash' }],
      }),
      1
    );
    state.turnState.enemyState.enemyNamesByEnemy = { 0: DEFAULT_SUMMON_SAMPLE_ENEMY.name };
    state.turnState.enemyState.damageRatesByEnemy = {
      0: {
        Slash: 100,
        Stab: 100,
        Strike: 100,
        Fire: 250,
        Ice: 250,
        Thunder: 250,
        Light: 250,
        Dark: 250,
        Nonelement: 100,
      },
    };
    state.turnState.enemyState.absorbElementsByEnemy = { 0: ['fire'] };
    state.turnState.enemyState.destructionRateCapByEnemy = { 0: 350 };
    state.turnState.enemyState.odRateByEnemy = { 0: 0 };

    mountTurnRow({
      root,
      stateBefore: state,
      simulatorSettings: createSimulatorSettings(),
    });

    const popup = openEnemyDetailPopup(root.querySelector('[data-role="enemy-detail-trigger"]'), win);
    assert.match(popup.textContent ?? '', /耐性/);
    assert.match(popup.textContent ?? '', /火250/);
    assert.match(popup.textContent ?? '', /吸収/);
    assert.match(popup.textContent ?? '', /fire/);
  }));

test('TurnRowController enemy detail popup marks dead occupied slots with a Dead badge', () =>
  withDom(({ root, win }) => {
    setViewportSize(win, { width: 1360, height: 900 });
    const state = createState(
      createSkill({
        id: 95045,
        name: 'Single Slash',
        targetType: 'Single',
        parts: [{ skill_type: 'AttackSkill', target_type: 'Single', type: 'Slash' }],
      }),
      2
    );
    state.turnState.enemyState.enemyNamesByEnemy = {
      0: 'Alpha',
      1: 'Beta',
    };
    state.turnState.enemyState.statuses = [
      {
        statusType: 'Dead',
        targetIndex: 1,
        remainingTurns: 0,
        exitCond: 'Eternal',
      },
    ];

    mountTurnRow({
      root,
      stateBefore: state,
      simulatorSettings: createSimulatorSettings(),
    });

    const popup = openEnemyDetailPopup(root.querySelector('[data-role="enemy-detail-trigger"]'), win);
    assert.match(popup.textContent ?? '', /E2 Beta/);
    assert.match(popup.textContent ?? '', /Dead/);
  }));

test('TurnRowController committed enemy detail popup uses stateBefore (same turn) instead of next turn state', () =>
  withDom(({ root, win }) => {
    const skill = createSkill({
      id: 9601,
      name: 'Single Slash',
      targetType: 'Single',
      parts: [{ skill_type: 'AttackSkill', target_type: 'Single', type: 'Slash' }],
    });
    const stateBefore = createState(skill, 1);
    const stateAfter = createState(skill, 1);
    stateBefore.turnState.enemyState.enemyNamesByEnemy = { 0: 'Alpha' };
    stateAfter.turnState.enemyState.enemyNamesByEnemy = { 0: 'Alpha' };
    stateBefore.turnState.enemyState.eShieldStateByEnemy = {
      0: createEShieldState({ current: 10, max: 10, elements: ['Light', 'Dark'] }),
    };
    stateAfter.turnState.enemyState.eShieldStateByEnemy = {
      0: createEShieldState({ current: 6, max: 10, elements: ['Light', 'Dark'] }),
    };
    stateBefore.turnState.enemyState.statuses = [
      {
        statusType: 'AttackDown',
        targetIndex: 0,
        remainingTurns: 2,
        exitCond: 'EnemyTurnEnd',
      },
    ];
    stateAfter.turnState.enemyState.statuses = [
      {
        statusType: 'DefenseDown',
        targetIndex: 0,
        remainingTurns: 1,
        exitCond: 'EnemyTurnEnd',
      },
    ];

    const row = new TurnRowController({
      root,
      store: createStoreStub(),
      turnIndex: 0,
      rowMode: 'committed',
      rowDiagnostics: null,
      record: {
        turnIndex: 18,
        turnId: 18,
        odGaugeAtStart: 0,
        projections: { odGaugeAtEnd: 0 },
        actions: [],
      },
      replayTurn: {
        turn: 18,
        slots: [{ styleId: stateBefore.party[0].styleId, skillId: 9601 }],
        operations: [],
        note: '',
        overrideEntries: [],
      },
      operations: [],
      operationState: {
        kishinkaStatus: { hasTezuka: false },
        makaiKiheiStatus: { hasYamawaki: false, available: false, remainingUses: 0 },
      },
      stateBefore,
      stateAfter,
      onSlotChange: () => {},
      onCommit: () => {},
      onNoteChange: () => {},
      onPreviewRequest: () => {},
      onOdChange: () => {},
      onOperationAdd: () => {},
      onOperationRemove: () => {},
      simulatorSettings: createSimulatorSettings(),
    });
    row.mount();

    const trigger = root.querySelector('[data-role="enemy-detail-trigger"]');
    assert.ok(trigger);
    trigger.dispatchEvent(new win.MouseEvent('contextmenu', { bubbles: true, cancelable: true }));

    const popup = win.document.body.querySelector('.enemy-detail-popup');
    assert.ok(popup);
    assert.match(popup.textContent ?? '', /攻撃力ダウン/);
    assert.doesNotMatch(popup.textContent ?? '', /防御力ダウン/);
    assert.match(popup.textContent ?? '', /6\/10/);
    assert.doesNotMatch(popup.textContent ?? '', /10\/10/);
  }));

test('TurnRowController committed HP break row keeps Eシールド depleted until the next row', () =>
  withDom(({ root, win }) => {
    const skill = createSkill({
      id: 96011,
      name: 'Single Slash',
      targetType: 'Single',
      parts: [{ skill_type: 'AttackSkill', target_type: 'Single', type: 'Slash' }],
    });
    const stateBefore = createState(skill, 1);
    const stateAfter = createState(skill, 1);
    stateBefore.turnState.enemyState.enemyNamesByEnemy = { 0: '絶界に屹立せし蝕樹' };
    stateAfter.turnState.enemyState.enemyNamesByEnemy = { 0: '絶界に屹立せし蝕樹' };
    stateBefore.turnState.enemyState.eShieldStateByEnemy = {
      0: createEShieldState({ current: 0, max: 35, elements: ['Fire', 'Light', 'Dark'] }),
    };
    stateAfter.turnState.enemyState.eShieldStateByEnemy = {
      0: createEShieldState({ current: 35, max: 35, elements: ['Fire', 'Light', 'Dark'] }),
    };
    stateBefore.turnState.enemyState.extraHpGaugeStateByEnemy = {
      0: { total: 3, remaining: 3, values: [57500000, 57500000, 57500000] },
    };
    stateAfter.turnState.enemyState.extraHpGaugeStateByEnemy = {
      0: { total: 3, remaining: 2, values: [57500000, 57500000, 57500000] },
    };

    const row = new TurnRowController({
      root,
      store: createStoreStub(),
      turnIndex: 4,
      rowMode: 'committed',
      rowDiagnostics: null,
      record: {
        turnIndex: 1,
        turnId: 5,
        odGaugeAtStart: 200,
        projections: { odGaugeAtEnd: 200 },
        actions: [
          {
            positionIndex: 0,
            characterId: 'M1',
            skillId: 96011,
            manualHpBreakEnemyIndexes: [0],
            hpBreakCount: 1,
          },
        ],
      },
      replayTurn: {
        turn: 1,
        slots: [{ styleId: stateBefore.party[0].styleId, skillId: 96011 }],
        operations: [],
        note: '',
        actionOutcomeOverrides: [{ position: 0, outcome: 'HpBreak', enemyIndexes: [0] }],
        overrideEntries: [],
      },
      operations: [],
      operationState: {
        kishinkaStatus: { hasTezuka: false },
        makaiKiheiStatus: { hasYamawaki: false, available: false, remainingUses: 0 },
      },
      stateBefore,
      stateAfter,
      onSlotChange: () => {},
      onCommit: () => {},
      onNoteChange: () => {},
      onPreviewRequest: () => {},
      onOdChange: () => {},
      onOperationAdd: () => {},
      onOperationRemove: () => {},
      simulatorSettings: createSimulatorSettings(),
    });
    row.mount();

    const strip = root.querySelector('[data-role="turn-info-e-shield-strip"]');
    assert.ok(strip);
    const stripBadge = strip.querySelector('[data-role="turn-info-e-shield-badge"]');
    assert.ok(stripBadge);
    assert.equal(stripBadge.getAttribute('data-eshield-current'), '0');
    assert.equal(stripBadge.getAttribute('data-eshield-max'), '35');
    assert.equal(stripBadge.getAttribute('data-eshield-depleted'), 'true');

    const trigger = root.querySelector('[data-role="enemy-detail-trigger"]');
    assert.ok(trigger);
    trigger.dispatchEvent(new win.MouseEvent('contextmenu', { bubbles: true, cancelable: true }));

    const popup = win.document.body.querySelector('.enemy-detail-popup');
    assert.ok(popup);
    const popupSummary = popup.querySelector('[data-role="enemy-popup-e-shield-summary"]');
    assert.ok(popupSummary);
    assert.match(popupSummary.textContent ?? '', /0\/35/);
    assert.doesNotMatch(popup.textContent ?? '', /35\/35/);
  }));

test('TurnRowController enemy detail popup resolves missing sourceSkillDesc from store', () =>
  withDom(({ root, win }) => {
    const skill = createSkill({
      id: 96015,
      name: 'Single Slash',
      targetType: 'Single',
      parts: [{ skill_type: 'AttackSkill', target_type: 'Single', type: 'Slash' }],
    });
    const stateBefore = createState(skill, 1);
    stateBefore.turnState.enemyState.enemyNamesByEnemy = { 0: 'Alpha' };
    stateBefore.turnState.enemyState.statuses = [
      {
        statusType: 'DefenseDown',
        targetIndex: 0,
        remainingTurns: 2,
        power: 0.3,
        exitCond: 'EnemyTurnEnd',
        sourceSkillId: 46001311,
        sourceSkillName: 'ヒットチャートからの一閃',
      },
    ];

    mountTurnRow({
      root,
      stateBefore,
      store: {
        ...createStoreStub(),
        resolveSkillDescription(skillId) {
          return Number(skillId) === 46001311 ? '敵の防御力と闇属性防御力を下げる' : null;
        },
      },
      simulatorSettings: createSimulatorSettings(),
    });

    const popup = openEnemyDetailPopup(root.querySelector('[data-role="enemy-detail-trigger"]'), win, {
      eventType: 'contextmenu',
    });
    assert.match(popup.textContent ?? '', /ヒットチャートからの一閃/);
    assert.match(popup.textContent ?? '', /敵の防御力と闇属性防御力を下げる/);
  }));

test('TurnRowController committed enemy detail popup includes committed action flow section', () =>
  withDom(({ root, win }) => {
    const skill = createSkill({
      id: 9611,
      name: 'Single Slash',
      targetType: 'Single',
      parts: [{ skill_type: 'AttackSkill', target_type: 'Single', type: 'Slash' }],
    });
    const stateBefore = createState(skill, 1);
    stateBefore.turnState.enemyState.statuses = [];

    const row = new TurnRowController({
      root,
      store: createStoreStub(),
      turnIndex: 0,
      rowMode: 'committed',
      rowDiagnostics: null,
      record: {
        turnIndex: 18,
        turnId: 18,
        odGaugeAtStart: 0,
        projections: { odGaugeAtEnd: 0 },
        actions: [
          {
            characterId: String(stateBefore.party[0].characterId),
            characterName: String(stateBefore.party[0].characterName),
            partyIndex: 0,
            skillId: 9611,
            skillName: 'コードダクネス',
            spCost: 6,
            startSP: 10,
            endSP: 4,
            enemyStatusChanges: [
              {
                statusType: 'AttackDown',
                targetIndex: 0,
                remaining: 2,
                exitCond: 'EnemyTurnEnd',
              },
            ],
          },
        ],
      },
      replayTurn: {
        turn: 18,
        slots: [{ styleId: stateBefore.party[0].styleId, skillId: 9611 }],
        operations: [],
        note: '',
        overrideEntries: [],
      },
      operations: [],
      operationState: {
        kishinkaStatus: { hasTezuka: false },
        makaiKiheiStatus: { hasYamawaki: false, available: false, remainingUses: 0 },
      },
      stateBefore,
      stateAfter: null,
      onSlotChange: () => {},
      onCommit: () => {},
      onNoteChange: () => {},
      onPreviewRequest: () => {},
      onOdChange: () => {},
      onOperationAdd: () => {},
      onOperationRemove: () => {},
      simulatorSettings: createSimulatorSettings(),
    });
    row.mount();

    const trigger = root.querySelector('[data-role="enemy-detail-trigger"]');
    assert.ok(trigger);
    trigger.dispatchEvent(new win.MouseEvent('contextmenu', { bubbles: true, cancelable: true }));

    const popup = win.document.body.querySelector('.enemy-detail-popup');
    assert.ok(popup);
    assert.match(popup.textContent ?? '', /プレビュー（コミット見込み）/);
    assert.match(popup.textContent ?? '', /攻撃力ダウン/);
  }));

test('TurnRowController committed enemy detail popup shows talisman action flow changes from record.fieldStateApplied', () =>
  withDom(({ root, win }) => {
    const skill = createSkill({
      id: 9612,
      name: 'Single Slash',
      targetType: 'Single',
      parts: [{ skill_type: 'AttackSkill', target_type: 'Single', type: 'Slash' }],
    });
    const stateBefore = createState(skill, 1);
    stateBefore.turnState.enemyState.enemyNamesByEnemy = { 0: 'Alpha' };
    stateBefore.turnState.enemyState.talismanState = { active: true, level: 3, maxLevel: 10 };

    const row = new TurnRowController({
      root,
      store: createStoreStub(),
      turnIndex: 0,
      rowMode: 'committed',
      rowDiagnostics: null,
      record: {
        turnIndex: 19,
        turnId: 19,
        odGaugeAtStart: 0,
        projections: { odGaugeAtEnd: 0 },
        actions: [
          {
            characterId: String(stateBefore.party[0].characterId),
            characterName: String(stateBefore.party[0].characterName),
            partyIndex: 0,
            skillId: 9612,
            skillName: '恐怖の叫びEX',
            spCost: 6,
            startSP: 10,
            endSP: 4,
            fieldStateApplied: [
              {
                kind: 'talisman',
                source: 'passive_trigger',
                activeBefore: true,
                activeAfter: true,
                levelBefore: 3,
                levelAfter: 5,
                levelDelta: 2,
                maxLevel: 10,
              },
            ],
            enemyStatusChanges: [],
          },
        ],
      },
      replayTurn: {
        turn: 19,
        slots: [{ styleId: stateBefore.party[0].styleId, skillId: 9612 }],
        operations: [],
        note: '',
        overrideEntries: [],
      },
      operations: [],
      operationState: {
        kishinkaStatus: { hasTezuka: false },
        makaiKiheiStatus: { hasYamawaki: false, available: false, remainingUses: 0 },
      },
      stateBefore,
      stateAfter: null,
      onSlotChange: () => {},
      onCommit: () => {},
      onNoteChange: () => {},
      onPreviewRequest: () => {},
      onOdChange: () => {},
      onOperationAdd: () => {},
      onOperationRemove: () => {},
      simulatorSettings: createSimulatorSettings(),
    });
    row.mount();

    const popup = openEnemyDetailPopup(root.querySelector('[data-role="enemy-detail-trigger"]'), win, {
      eventType: 'contextmenu',
    });
    assert.match(popup.textContent ?? '', /霊符/);
    assert.match(popup.textContent ?? '', /Lv3\/10/);
    assert.match(popup.textContent ?? '', /Lv3 → 5 \(\+2\)/);
    assert.equal(popup.querySelector('[data-role="enemy-popup-talisman-section"]'), null);
    assert.ok(popup.querySelector('[data-role="enemy-popup-talisman-block"]'));
  }));

test('TurnRowController enemy detail popup shows preview section at top for input row', () =>
  withDom(({ root, win }) => {
    const skill = createSkill({
      id: 9602,
      name: 'Single Slash',
      targetType: 'Single',
      parts: [{ skill_type: 'AttackSkill', target_type: 'Single', type: 'Slash' }],
    });
    const state = createState(skill, 1);
    state.turnState.enemyState.enemyNamesByEnemy = { 0: 'Alpha' };

    mountTurnRow({
      root,
      stateBefore: state,
      simulatorSettings: createSimulatorSettings(),
      previewActionFlow: [
        {
          order: 1,
          actorCharacterId: String(state.party[0].characterId),
          actorCharacterName: '小笠原 緋雨',
          skillId: 46004517,
          skillName: 'ハッピー！エッグ・ラッシュ！',
          costDelta: 0,
          costPreSp: 3,
          costPostSp: 3,
          statusEffectsApplied: [],
          statusEffectsRemoved: [],
          enemyStatusChanges: [
            {
              statusType: 'AttackDown',
              targetIndex: 0,
              remaining: 2,
              exitCond: 'EnemyTurnEnd',
            },
          ],
        },
      ],
    });

    const trigger = root.querySelector('[data-role="enemy-detail-trigger"]');
    assert.ok(trigger);
    trigger.dispatchEvent(new win.MouseEvent('contextmenu', { bubbles: true, cancelable: true }));

    const popup = win.document.body.querySelector('.enemy-detail-popup');
    assert.ok(popup);
    assert.match(popup.textContent ?? '', /プレビュー（コミット見込み）/);
    assert.match(popup.textContent ?? '', /攻撃力ダウン/);
    assert.doesNotMatch(popup.textContent ?? '', /小笠原 緋雨/);
    assert.doesNotMatch(popup.textContent ?? '', /cost/);
  }));

test('TurnRowController enemy detail popup preview resolves sourceSkillDesc from store', () =>
  withDom(({ root, win }) => {
    const skill = createSkill({
      id: 96024,
      name: 'Preview Desc Check',
      targetType: 'Single',
      parts: [{ skill_type: 'AttackSkill', target_type: 'Single', type: 'Slash' }],
    });
    const state = createState(skill, 1);
    state.turnState.enemyState.enemyNamesByEnemy = { 0: 'Alpha' };

    mountTurnRow({
      root,
      stateBefore: state,
      store: {
        ...createStoreStub(),
        resolveSkillDescription(skillId) {
          return Number(skillId) === 46001311 ? '敵の防御力と闇属性防御力を下げる' : null;
        },
      },
      simulatorSettings: createSimulatorSettings(),
      previewActionFlow: [
        {
          order: 1,
          actorCharacterId: String(state.party[0].characterId),
          actorCharacterName: '小笠原 緋雨',
          skillId: 46001311,
          skillName: 'ヒットチャートからの一閃',
          costDelta: 0,
          costPreSp: 3,
          costPostSp: 3,
          statusEffectsApplied: [],
          statusEffectsRemoved: [],
          enemyStatusChanges: [
            {
              statusType: 'DefenseDown',
              targetIndex: 0,
              remaining: 2,
              exitCond: 'EnemyTurnEnd',
              sourceSkillId: 46001311,
              sourceSkillName: 'ヒットチャートからの一閃',
            },
          ],
        },
      ],
    });

    const popup = openEnemyDetailPopup(root.querySelector('[data-role="enemy-detail-trigger"]'), win, {
      eventType: 'contextmenu',
    });
    assert.match(popup.textContent ?? '', /プレビュー（コミット見込み）/);
    assert.match(popup.textContent ?? '', /ヒットチャートからの一閃/);
    assert.match(popup.textContent ?? '', /敵の防御力と闇属性防御力を下げる/);
    assert.doesNotMatch(popup.textContent ?? '', /小笠原 緋雨/);
  }));

test('TurnRowController enemy detail popup shows talisman summary, icon, and preview changes', () =>
  withDom(({ root, win }) => {
    const skill = createSkill({
      id: 96022,
      name: 'Single Slash',
      targetType: 'Single',
      parts: [{ skill_type: 'AttackSkill', target_type: 'Single', type: 'Slash' }],
    });
    const state = createState(skill, 1);
    state.turnState.enemyState.enemyNamesByEnemy = { 0: 'Alpha' };
    state.turnState.enemyState.talismanState = { active: true, level: 3, maxLevel: 10 };

    mountTurnRow({
      root,
      stateBefore: state,
      simulatorSettings: createSimulatorSettings(),
      previewActionFlow: [
        {
          order: 1,
          actorCharacterId: String(state.party[0].characterId),
          actorCharacterName: '國見 タマ',
          skillId: 46004517,
          skillName: '恐怖の叫びEX',
          costDelta: 0,
          costPreSp: 3,
          costPostSp: 3,
          fieldStateApplied: [
            {
              kind: 'talisman',
              source: 'passive_trigger',
              activeBefore: true,
              activeAfter: true,
              levelBefore: 3,
              levelAfter: 5,
              levelDelta: 2,
              maxLevel: 10,
            },
          ],
          statusEffectsApplied: [],
          statusEffectsRemoved: [],
          enemyStatusChanges: [],
        },
      ],
    });

    const popup = openEnemyDetailPopup(root.querySelector('[data-role="enemy-detail-trigger"]'), win, {
      eventType: 'contextmenu',
    });
    const talismanIcon = popup.querySelector('[data-role="enemy-popup-talisman-icon"]');
    assert.ok(talismanIcon);
    assert.match(talismanIcon.getAttribute('src') ?? '', /assets\/skill_type\/Talisman\.webp$/);
    assert.ok(popup.querySelector('[data-role="enemy-popup-talisman-block"]'));
    assert.equal(popup.querySelector('[data-role="enemy-popup-talisman-section"]'), null);
    assert.match(popup.textContent ?? '', /霊符/);
    assert.match(popup.textContent ?? '', /Lv3\/10/);
    assert.match(popup.textContent ?? '', /全能力-30/);
    assert.match(popup.textContent ?? '', /Lv3 → 5 \(\+2\)/);
    assert.match(popup.textContent ?? '', /國見 タマ \/ 恐怖の叫びEX/);
  }));

test('TurnRowController committed enemy detail popup shows disaster action flow changes from record.fieldStateApplied', () =>
  withDom(({ root, win }) => {
    const skill = createSkill({
      id: 9613,
      name: 'Trap',
      targetType: 'All',
      parts: [{ skill_type: 'AttackSkill', target_type: 'All', type: 'Light' }],
    });
    const stateBefore = createState(skill, 1);
    stateBefore.turnState.enemyState.enemyNamesByEnemy = { 0: 'Alpha' };
    stateBefore.turnState.enemyState.disasterState = { active: true, level: 2, maxLevel: 10, penaltyPerLevel: 7 };

    const row = new TurnRowController({
      root,
      store: createStoreStub(),
      turnIndex: 0,
      rowMode: 'committed',
      rowDiagnostics: null,
      record: {
        turnIndex: 20,
        turnId: 20,
        odGaugeAtStart: 0,
        projections: { odGaugeAtEnd: 0 },
        actions: [
          {
            characterId: String(stateBefore.party[0].characterId),
            characterName: String(stateBefore.party[0].characterName),
            partyIndex: 0,
            skillId: 9613,
            skillName: 'もつれトラップ',
            spCost: 6,
            startSP: 10,
            endSP: 4,
            fieldStateApplied: [
              {
                kind: 'disaster',
                source: 'active_skill',
                activeBefore: true,
                activeAfter: true,
                levelBefore: 2,
                levelAfter: 4,
                levelDelta: 2,
                maxLevel: 10,
              },
            ],
            enemyStatusChanges: [],
          },
        ],
      },
      replayTurn: {
        turn: 20,
        slots: [{ styleId: stateBefore.party[0].styleId, skillId: 9613 }],
        operations: [],
        note: '',
        overrideEntries: [],
      },
      operations: [],
      operationState: {
        kishinkaStatus: { hasTezuka: false },
        makaiKiheiStatus: { hasYamawaki: false, available: false, remainingUses: 0 },
      },
      stateBefore,
      stateAfter: null,
      onSlotChange: () => {},
      onCommit: () => {},
      onNoteChange: () => {},
      onPreviewRequest: () => {},
      onOdChange: () => {},
      onOperationAdd: () => {},
      onOperationRemove: () => {},
      simulatorSettings: createSimulatorSettings(),
    });
    row.mount();

    const popup = openEnemyDetailPopup(root.querySelector('[data-role="enemy-detail-trigger"]'), win, {
      eventType: 'contextmenu',
    });
    assert.match(popup.textContent ?? '', /禍/);
    assert.match(popup.textContent ?? '', /Lv2\/10/);
    assert.match(popup.textContent ?? '', /Lv2 → 4 \(\+2\)/);
    assert.equal(popup.querySelector('[data-role="enemy-popup-disaster-section"]'), null);
    assert.ok(popup.querySelector('[data-role="enemy-popup-disaster-block"]'));
  }));

test('TurnRowController enemy detail popup shows disaster summary, icon, and preview changes', () =>
  withDom(({ root, win }) => {
    const skill = createSkill({
      id: 96023,
      name: 'Trap',
      targetType: 'All',
      parts: [{ skill_type: 'AttackSkill', target_type: 'All', type: 'Light' }],
    });
    const state = createState(skill, 1);
    state.turnState.enemyState.enemyNamesByEnemy = { 0: 'Alpha' };
    state.turnState.enemyState.disasterState = { active: true, level: 2, maxLevel: 10, penaltyPerLevel: 7 };

    mountTurnRow({
      root,
      stateBefore: state,
      simulatorSettings: createSimulatorSettings(),
      previewActionFlow: [
        {
          order: 1,
          actorCharacterId: String(state.party[0].characterId),
          actorCharacterName: '伊達 朱里',
          skillId: 46005514,
          skillName: 'もつれトラップ',
          costDelta: 0,
          costPreSp: 6,
          costPostSp: 0,
          fieldStateApplied: [
            {
              kind: 'disaster',
              source: 'active_skill',
              activeBefore: true,
              activeAfter: true,
              levelBefore: 2,
              levelAfter: 4,
              levelDelta: 2,
              maxLevel: 10,
            },
          ],
          statusEffectsApplied: [],
          statusEffectsRemoved: [],
          enemyStatusChanges: [],
        },
      ],
    });

    const popup = openEnemyDetailPopup(root.querySelector('[data-role="enemy-detail-trigger"]'), win, {
      eventType: 'contextmenu',
    });
    const disasterIcon = popup.querySelector('[data-role="enemy-popup-disaster-icon"]');
    assert.ok(disasterIcon);
    assert.match(disasterIcon.getAttribute('src') ?? '', /assets\/skill_type\/Disaster\.webp$/);
    assert.ok(popup.querySelector('[data-role="enemy-popup-disaster-block"]'));
    assert.equal(popup.querySelector('[data-role="enemy-popup-disaster-section"]'), null);
    assert.match(popup.textContent ?? '', /禍/);
    assert.match(popup.textContent ?? '', /Lv2\/10/);
    assert.match(popup.textContent ?? '', /全能力-14/);
    assert.match(popup.textContent ?? '', /Lv2 → 4 \(\+2\)/);
    assert.match(popup.textContent ?? '', /伊達 朱里 \/ もつれトラップ/);
  }));

test('TurnRowController enemy detail popup keeps SuperBreak visible with canonical label when remainingTurns is 0', () =>
  withDom(({ root, win }) => {
    const skill = createSkill({
      id: 96021,
      name: 'Single Slash',
      targetType: 'Single',
      parts: [{ skill_type: 'AttackSkill', target_type: 'Single', type: 'Slash' }],
    });
    const state = createState(skill, 1);
    state.turnState.enemyState.enemyNamesByEnemy = { 0: 'Alpha' };
    state.turnState.enemyState.statuses = [
      {
        statusType: 'SuperBreak',
        elements: ['Light'],
        targetIndex: 0,
        remainingTurns: 0,
      },
    ];

    mountTurnRow({
      root,
      stateBefore: state,
      simulatorSettings: createSimulatorSettings(),
    });

    const trigger = root.querySelector('[data-role="enemy-detail-trigger"]');
    assert.ok(trigger);
    trigger.dispatchEvent(new win.MouseEvent('contextmenu', { bubbles: true, cancelable: true }));

    const popup = win.document.body.querySelector('.enemy-detail-popup');
    assert.ok(popup);
    assert.match(popup.textContent ?? '', /強ブレイク/);
    assert.doesNotMatch(popup.textContent ?? '', /StrongBreak/);
    assert.doesNotMatch(popup.textContent ?? '', /∞/);
    assert.ok(popup.querySelector('[data-status-type="SuperBreak"]'));
    assert.match(
      popup.querySelector('[data-status-type="SuperBreak"] img')?.getAttribute('src') ?? '',
      /LightSuperBreak\.webp/
    );
  }));

test('TurnRowController enemy detail popup preview keeps SuperBreak visible with canonical label when preview remaining is 0', () =>
  withDom(({ root, win }) => {
    const skill = createSkill({
      id: 96022,
      name: 'Single Slash',
      targetType: 'Single',
      parts: [{ skill_type: 'AttackSkill', target_type: 'Single', type: 'Slash' }],
    });
    const state = createState(skill, 1);
    state.turnState.enemyState.enemyNamesByEnemy = { 0: 'Alpha' };

    mountTurnRow({
      root,
      stateBefore: state,
      simulatorSettings: createSimulatorSettings(),
      previewActionFlow: [
        {
          order: 1,
          actorCharacterId: String(state.party[0].characterId),
          actorCharacterName: '和泉 ユキ',
          skillId: 46001212,
          skillName: '光輝の夜明け',
          costDelta: -14,
          costPreSp: 6,
          costPostSp: -8,
          statusEffectsApplied: [],
          statusEffectsRemoved: [],
          enemyStatusChanges: [
            {
              statusType: 'SuperBreak',
              elements: ['Light'],
              targetIndex: 0,
              remaining: 0,
            },
          ],
        },
      ],
    });

    const trigger = root.querySelector('[data-role="enemy-detail-trigger"]');
    assert.ok(trigger);
    trigger.dispatchEvent(new win.MouseEvent('contextmenu', { bubbles: true, cancelable: true }));

    const popup = win.document.body.querySelector('.enemy-detail-popup');
    assert.ok(popup);
    assert.match(popup.textContent ?? '', /プレビュー（コミット見込み）/);
    assert.match(popup.textContent ?? '', /強ブレイク/);
    assert.doesNotMatch(popup.textContent ?? '', /StrongBreak/);
    assert.doesNotMatch(popup.textContent ?? '', /∞/);
    assert.ok(popup.querySelector('[data-status-type="SuperBreak"]'));
    assert.match(
      popup.querySelector('[data-status-type="SuperBreak"] img')?.getAttribute('src') ?? '',
      /LightSuperBreak\.webp/
    );
  }));

test('TurnRowController enemy detail popup preview shows Hacking icon for enemy status change', () =>
  withDom(({ root, win }) => {
    const skill = createSkill({
      id: 96023,
      name: 'Single Slash',
      targetType: 'Single',
      parts: [{ skill_type: 'AttackSkill', target_type: 'Single', type: 'Slash' }],
    });
    const state = createState(skill, 1);
    state.turnState.enemyState.enemyNamesByEnemy = { 0: 'Alpha' };

    mountTurnRow({
      root,
      stateBefore: state,
      simulatorSettings: createSimulatorSettings(),
      previewActionFlow: [
        {
          order: 1,
          actorCharacterId: String(state.party[0].characterId),
          actorCharacterName: '和泉 ユキ',
          skillId: 46001215,
          skillName: 'コードダクネス',
          costDelta: -14,
          costPreSp: 14,
          costPostSp: 0,
          statusEffectsApplied: [],
          statusEffectsRemoved: [],
          enemyStatusChanges: [
            {
              statusType: 'Hacking',
              targetIndex: 0,
              remaining: 2,
              exitCond: 'EnemyTurnEnd',
            },
          ],
        },
      ],
    });

    const popup = openEnemyDetailPopup(root.querySelector('[data-role="enemy-detail-trigger"]'), win);
    assert.ok(popup);
    assert.match(popup.textContent ?? '', /プレビュー（コミット見込み）/);
    assert.match(popup.textContent ?? '', /ハッキング/);
    assert.ok(popup.querySelector('[data-status-type="Hacking"]'));
    assert.match(
      popup.querySelector('[data-status-type="Hacking"] img')?.getAttribute('src') ?? '',
      /Hacking\.webp/
    );
  }));

test('TurnRowController enemy detail popup shows no-change row when action has no enemy status changes', () =>
  withDom(({ root, win }) => {
    const skill = createSkill({
      id: 9605,
      name: 'Single Slash',
      targetType: 'Single',
      parts: [{ skill_type: 'AttackSkill', target_type: 'Single', type: 'Slash' }],
    });
    const state = createState(skill, 1);

    mountTurnRow({
      root,
      stateBefore: state,
      simulatorSettings: createSimulatorSettings(),
      previewActionFlow: [
        {
          order: 1,
          actorCharacterId: String(state.party[0].characterId),
          actorCharacterName: '和泉 ユキ',
          skillId: 123,
          skillName: 'コードダクネス',
          costDelta: -6,
          costPreSp: 10,
          costPostSp: 4,
          statusEffectsApplied: [],
          statusEffectsRemoved: [],
          enemyStatusChanges: [],
        },
      ],
    });

    const trigger = root.querySelector('[data-role="enemy-detail-trigger"]');
    assert.ok(trigger);
    trigger.dispatchEvent(new win.MouseEvent('contextmenu', { bubbles: true, cancelable: true }));

    const popup = win.document.body.querySelector('.enemy-detail-popup');
    assert.ok(popup);
    assert.match(popup.textContent ?? '', /このターンで付与される状態変化なし/);
  }));

test('TurnRowController enemy detail popup omits sourceSkillDesc for Dead status in preview', () =>
  withDom(({ root, win }) => {
    const skill = createSkill({
      id: 9606,
      name: 'Single Slash',
      targetType: 'Single',
      parts: [{ skill_type: 'AttackSkill', target_type: 'Single', type: 'Slash' }],
    });
    const state = createState(skill, 2);
    state.turnState.enemyState.enemyNamesByEnemy = {
      0: 'Alpha',
      1: 'Beta',
    };
    state.turnState.enemyState.statuses = [
      {
        statusType: 'Dead',
        targetIndex: 1,
        remainingTurns: 0,
        exitCond: 'Eternal',
      },
    ];

    mountTurnRow({
      root,
      stateBefore: state,
      simulatorSettings: createSimulatorSettings(),
      previewActionFlow: [
        {
          order: 1,
          actorCharacterId: String(state.party[0].characterId),
          actorCharacterName: '和泉 ユキ',
          skillId: 46009999,
          skillName: 'トドメの一撃',
          costDelta: -6,
          costPreSp: 10,
          costPostSp: 4,
          statusEffectsApplied: [],
          statusEffectsRemoved: [],
          enemyStatusChanges: [
            {
              statusType: 'Dead',
              targetIndex: 1,
              remaining: 0,
              exitCond: 'Eternal',
              sourceSkillId: 46009999,
              sourceSkillName: 'トドメの一撃',
            },
          ],
        },
      ],
      store: {
        ...createStoreStub(),
        resolveSkillDescription(skillId) {
          return Number(skillId) === 46009999 ? '敵全体に大ダメージを与え戦闘不能にする' : null;
        },
      },
    });

    const popup = openEnemyDetailPopup(root.querySelector('[data-role="enemy-detail-trigger"]'), win);
    assert.ok(popup);
    const e2Tab = popup.querySelector('[data-role="enemy-popup-tab"][data-enemy-tab-index="1"]');
    assert.ok(e2Tab);
    e2Tab.dispatchEvent(new win.MouseEvent('click', { bubbles: true, cancelable: true }));

    const refreshedPopup = getEnemyDetailPopup(win);
    assert.ok(refreshedPopup);
    assert.match(refreshedPopup.textContent ?? '', /E2 Beta/);
    assert.match(refreshedPopup.textContent ?? '', /Dead/);
    assert.match(refreshedPopup.textContent ?? '', /プレビュー（コミット見込み）/);
    assert.match(refreshedPopup.textContent ?? '', /トドメの一撃/);
    assert.doesNotMatch(refreshedPopup.textContent ?? '', /敵全体に大ダメージを与え戦闘不能にする/);
  }));

test('char detail popup shows preview section at top of status tab', () =>
  withDom(({ root, win }) => {
    const skill = createSkill({
      id: 9603,
      name: 'Single Slash',
      targetType: 'Single',
      parts: [{ skill_type: 'AttackSkill', target_type: 'Single', type: 'Slash' }],
    });
    const state = createState(skill, 1);
    const targetMember = state.party[0];
    const actorMember = state.party[1];

    openCharDetailPopup(
      targetMember,
      {
        statusEffects: [],
        previewActionFlow: [
          {
            order: 2,
            actorCharacterId: String(actorMember.characterId),
            actorCharacterName: String(actorMember.characterName),
            skillId: 46001115,
            skillName: '黒曜のオーバーロード',
            costDelta: -13,
            costPreSp: 14,
            costPostSp: 1,
            statusEffectsApplied: [
              {
                targetCharacterId: String(targetMember.characterId),
                statusTypeId: 78,
                remaining: 1,
                exitCond: 'Count',
                sourceSkillName: '炯眼の構え',
                sourceCharacterName: '茅森 月歌',
              },
            ],
            statusEffectsRemoved: [],
            enemyStatusChanges: [],
          },
        ],
      },
      { x: 200, y: 120, isCommitted: false }
    );

    const popup = win.document.body.querySelector('#char-detail-popup');
    assert.ok(popup);
    assert.match(popup.textContent ?? '', /プレビュー（コミット見込み）/);
    assert.match(popup.textContent ?? '', /心眼/);
    assert.match(popup.textContent ?? '', /炯眼の構え/);
    assert.match(popup.textContent ?? '', /茅森 月歌/);
    assert.match(popup.textContent ?? '', /1回/);
    assert.doesNotMatch(popup.textContent ?? '', /0回/);
    const previewBlocks = popup.querySelectorAll('.char-popup-preview-section .char-popup-buff-block');
    assert.equal(previewBlocks.length > 0, true);
  }));

test('char detail popup resolves missing sourceSkillDesc from resolver', () =>
  withDom(({ win }) => {
    const targetMember = {
      characterId: 'NNanase',
      characterName: '七瀬 七海',
      styleId: 1000001,
      styleName: 'テストスタイル',
      elements: ['Thunder'],
      weaponType: 'Slash',
      passives: [],
    };

    openCharDetailPopup(
      targetMember,
      {
        statusEffects: [
          {
            statusType: 'AttackUp',
            power: 0.4,
            remaining: 2,
            exitCond: 'PlayerTurnEnd',
            sourceSkillId: 46300009,
            sourceSkillName: 'ソフニング',
          },
        ],
      },
      {
        x: 200,
        y: 120,
        isCommitted: false,
        resolveSkillDescription(skillId) {
          return Number(skillId) === 46300009 ? '敵の防御力を下げる' : null;
        },
      }
    );

    const popup = win.document.body.querySelector('#char-detail-popup');
    assert.ok(popup);
    assert.match(popup.textContent ?? '', /ソフニング/);
    assert.match(popup.textContent ?? '', /敵の防御力を下げる/);
  }));

test('char detail popup prefixes elemental critical labels and icons with 雷 for Thunder effects', () =>
  withDom(({ win }) => {
    const targetMember = {
      characterId: 'NNanase',
      characterName: '七瀬 七海',
      styleId: 1000001,
      styleName: 'テストスタイル',
      elements: ['Thunder'],
      weaponType: 'Slash',
      passives: [],
    };

    openCharDetailPopup(
      targetMember,
      {
        statusEffects: [
          {
            statusType: 'CriticalDamageUp',
            power: 0.9,
            remaining: 7,
            exitCond: 'PlayerTurnEnd',
            elements: ['Thunder'],
            sourceSkillName: 'ノヴァエリミネーション',
            sourceCharacterName: '七瀬 七海',
          },
          {
            statusType: 'CriticalRateUp',
            power: 1,
            remaining: 7,
            exitCond: 'PlayerTurnEnd',
            elements: ['Thunder'],
            sourceSkillName: 'ノヴァエリミネーション',
            sourceCharacterName: '七瀬 七海',
          },
        ],
        previewActionFlow: [],
      },
      { x: 200, y: 120, isCommitted: false }
    );

    const popup = win.document.body.querySelector('#char-detail-popup');
    assert.ok(popup);
    assert.match(popup.textContent ?? '', /雷クリティカルダメージアップ/);
    assert.match(popup.textContent ?? '', /雷クリティカル確率アップ/);

    const statusIcons = [...popup.querySelectorAll('.char-popup-buff-icon img')].map((img) => img.getAttribute('src') ?? '');
    assert.equal(statusIcons.some((src) => src.includes('ThunderCriticalDamageUp.webp')), true);
    assert.equal(statusIcons.some((src) => src.includes('ThunderCriticalRateUp.webp')), true);
  }));

test('char detail popup shows Funnel size label by power mapping (25=大, 50=特大)', () =>
  withDom(({ win }) => {
    const targetMember = {
      characterId: 'NNanase',
      characterName: '七瀬 七海',
      styleId: 1000001,
      styleName: 'テストスタイル',
      elements: ['Thunder'],
      weaponType: 'Slash',
      passives: [],
    };

    openCharDetailPopup(
      targetMember,
      {
        statusEffects: [
          {
            statusType: 'Funnel',
            power: 3,
            remaining: 1,
            exitCond: 'Count',
            sourceSkillName: '連撃大テスト',
            sourceCharacterName: '七瀬 七海',
            metadata: { damageBonus: 0.25 },
          },
          {
            statusType: 'Funnel',
            power: 3,
            remaining: 1,
            exitCond: 'Count',
            sourceSkillName: '連撃特大テスト',
            sourceCharacterName: '七瀬 七海',
            metadata: { damageBonus: 0.5 },
          },
        ],
        previewActionFlow: [],
      },
      { x: 200, y: 120, isCommitted: false }
    );

    const popup = win.document.body.querySelector('#char-detail-popup');
    assert.ok(popup);
    assert.match(popup.textContent ?? '', /連撃（大）3回\s*75%/);
    assert.match(popup.textContent ?? '', /連撃（特大）3回\s*150%/);
  }));

test('char detail popup preview section renders Funnel from previewActionFlow.funnelApplied', () =>
  withDom(({ win }) => {
    const targetMember = {
      characterId: 'NNanase',
      characterName: '七瀬 七海',
      styleId: 1000001,
      styleName: 'テストスタイル',
      elements: ['Thunder'],
      weaponType: 'Slash',
      passives: [],
    };

    openCharDetailPopup(
      targetMember,
      {
        statusEffects: [],
        previewActionFlow: [
          {
            order: 1,
            actorCharacterId: 'NNanase',
            actorCharacterName: '七瀬 七海',
            skillId: 46004517,
            skillName: 'ハッピー！エッグ・ラッシュ！',
            statusEffectsApplied: [],
            funnelApplied: [
              {
                targetCharacterId: 'NNanase',
                skillName: 'ハッピー！エッグ・ラッシュ！',
                hitBonus: 3,
                damageBonus: 0.5,
                remaining: 1,
                exitCond: 'Count',
              },
            ],
          },
        ],
      },
      { x: 200, y: 120, isCommitted: false }
    );

    const popup = win.document.body.querySelector('#char-detail-popup');
    assert.ok(popup);
    assert.match(popup.textContent ?? '', /ハッピー！エッグ・ラッシュ！/);
    assert.match(popup.textContent ?? '', /連撃（特大）3回\s*150%/);
  }));

test('char detail popup damage tab only renders the opened character action', () =>
  withDom(({ win }) => {
    const previousFetch = globalThis.fetch;
    globalThis.fetch = async () => ({
      ok: true,
      json: async () => [],
    });
    const targetMember = {
      characterId: 'NNanase',
      characterName: '七瀬 七海',
      styleId: 1000001,
      styleName: 'テストスタイル',
      elements: ['Thunder'],
      weaponType: 'Slash',
      passives: [],
    };
    const makeDamageContext = (finalMultiplier) => ({
      criticalRateBreakdown: {
        criticalRatePercent: 100,
        isCriticalGuaranteed: true,
        contributions: [],
      },
      damageBreakdown: {
        version: 1,
        targetBreakdowns: [
          {
            targetEnemyIndex: 0,
            targetLabel: 'E1',
            finalMultiplier,
            increasePercent: Math.round((finalMultiplier - 1) * 100),
            formula: `${finalMultiplier.toFixed(2)}x`,
            groups: [],
          },
        ],
      },
    });

    try {
      openCharDetailPopup(
        targetMember,
        {
          statusEffects: [],
          previewActionFlow: [
            {
              actorCharacterId: 'NNanase',
              skillName: '七瀬の威力詳細',
              damageContext: makeDamageContext(2),
            },
            {
              actorCharacterId: 'OTHER',
              skillName: '他キャラの威力詳細',
              damageContext: makeDamageContext(9),
            },
          ],
        },
        { x: 200, y: 120, isCommitted: false }
      );

      const popup = win.document.body.querySelector('#char-detail-popup');
      assert.ok(popup);
      popup.querySelector('.char-popup-tab[data-tab="damage"]')?.dispatchEvent(
        new win.MouseEvent('click', { bubbles: true, cancelable: true })
      );

      const damagePanel = popup.querySelector('[data-tab-panel="damage"]');
      assert.ok(damagePanel);
      assert.match(damagePanel.textContent ?? '', /七瀬の威力詳細/);
      assert.match(damagePanel.textContent ?? '', /2.00x/);
      assert.doesNotMatch(damagePanel.textContent ?? '', /他キャラの威力詳細/);
      assert.doesNotMatch(damagePanel.textContent ?? '', /9.00x/);
    } finally {
      globalThis.fetch = previousFetch;
    }
  }));

test('char detail popup damage tab shows FightingSpirit stat delta and attacker note', () =>
  withDom(async ({ win }) => {
    const previousFetch = globalThis.fetch;
    globalThis.fetch = async () => ({
      ok: true,
      json: async () => [],
    });
    const targetMember = {
      characterId: 'NNanase',
      characterName: '七瀬 七海',
      styleId: 1000001,
      styleName: 'テストスタイル',
      role: 'Attacker',
      stats: { str: 820, dex: 810, wis: 800, spr: 790, luk: 780, con: 770 },
      elements: ['Thunder'],
      weaponType: 'Slash',
      passives: [],
    };

    try {
      openCharDetailPopup(
        targetMember,
        {
          statusEffects: [],
          previewActionFlow: [
            {
              actorCharacterId: 'NNanase',
              skillName: '闘志反映テスト',
              damageContext: {
                actorCharacterId: 'NNanase',
                actorStyleId: 1000001,
                skillId: 999001,
                skillName: '闘志反映テスト',
                fightingSpiritBonusValue: 2,
                damageBreakdown: {
                  version: 1,
                  targetBreakdowns: [
                    {
                      targetEnemyIndex: 0,
                      targetLabel: 'E1',
                      finalMultiplier: 1,
                      increasePercent: 0,
                      formula: '1.00x',
                      groups: [],
                    },
                  ],
                },
              },
            },
          ],
        },
        { x: 200, y: 120, isCommitted: false }
      );

      const popup = win.document.body.querySelector('#char-detail-popup');
      assert.ok(popup);
      popup.querySelector('.char-popup-tab[data-tab="damage"]')?.dispatchEvent(
        new win.MouseEvent('click', { bubbles: true, cancelable: true })
      );
      await new Promise((resolve) => setTimeout(resolve, 0));

      const damagePanel = popup.querySelector('[data-tab-panel="damage"]');
      assert.ok(damagePanel);
      assert.equal(
        damagePanel.querySelector('[data-role="damage-calc-stat-delta"][data-stat="str"]')?.textContent,
        '+2'
      );
      assert.equal(
        damagePanel.querySelector('[data-role="damage-calc-stat-resolved"][data-stat="str"]')?.textContent,
        '822'
      );
      assert.equal(
        damagePanel.querySelector('[data-role="damage-calc-attacker-note"]')?.value,
        '闘志[全ステータス+2]'
      );
    } finally {
      globalThis.fetch = previousFetch;
    }
  }));

test('char detail popup damage tab uses damage context destruction cap for manual destruction input', () =>
  withDom(async ({ win }) => {
    const targetMember = {
      characterId: 'NNanase',
      characterName: '七瀬 七海',
      styleId: 1000001,
      styleName: 'テストスタイル',
      elements: ['Thunder'],
      weaponType: 'Slash',
      passives: [],
    };
    const damageContext = {
      actorCharacterId: 'NNanase',
      actorStyleId: 1000001,
      skillId: 999001,
      skillName: '破壊率上限テスト',
      isNormalAttack: false,
      targetEnemyIndex: 0,
      enemyCount: 1,
      baseHitCount: 1,
      effectiveHitCountPerEnemy: 1,
      destructionRateByEnemy: { 0: 600 },
      destructionRateCapByEnemy: { 0: 600 },
      enemyNamesByEnemy: { 0: 'E1' },
      effectiveDamageRatesByEnemy: { 0: 100 },
      damageBreakdown: {
        version: 1,
        targetBreakdowns: [
          {
            targetEnemyIndex: 0,
            targetLabel: 'E1',
            finalMultiplier: 1,
            increasePercent: 0,
            formula: '1.00x',
            groups: [],
          },
        ],
      },
      criticalRateBreakdown: {
        criticalRatePercent: 0,
        isCriticalGuaranteed: false,
        contributions: [],
      },
    };
    const previousFetch = globalThis.fetch;
    globalThis.fetch = async () => ({
      ok: true,
      json: async () => [],
    });

    try {
      openCharDetailPopup(
        targetMember,
        {
          statusEffects: [],
          previewActionFlow: [
            {
              actorCharacterId: 'NNanase',
              skillName: '破壊率上限テスト',
              damageContext,
            },
          ],
        },
        {
          x: 200,
          y: 120,
          isCommitted: false,
          enemyDestructionState: {
            destructionRateByEnemy: { 0: 300 },
            destructionRateCapByEnemy: { 0: 300 },
          },
        }
      );

      const popup = win.document.body.querySelector('#char-detail-popup');
      assert.ok(popup);
      popup.querySelector('.char-popup-tab[data-tab="damage"]')?.dispatchEvent(
        new win.MouseEvent('click', { bubbles: true, cancelable: true })
      );

      const input = popup.querySelector('[data-role="destruction-rate-input"]');
  const destructionRateSummary = popup.querySelector('[data-role="damage-calc-destruction-rate"]');
      const after = popup.querySelector('[data-role="destruction-rate-after"]');
      assert.ok(input);
  assert.ok(destructionRateSummary);
      assert.ok(after);
      input.value = '600';
      input.dispatchEvent(new win.Event('input', { bubbles: true }));

      for (let attempt = 0; attempt < 20 && after.textContent?.trim() !== '600.00%'; attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 0));
      }

      assert.match(destructionRateSummary.textContent?.trim() ?? '', /600\.00% \/ 600\.00%/);
      assert.equal(after.textContent?.trim(), '600.00%');
    } finally {
      globalThis.fetch = previousFetch;
    }
  }));

test('char detail popup damage tab previews normal attack destruction from raw d_rate', () =>
  withDom(async ({ win }) => {
    const targetMember = {
      characterId: 'NNanase',
      characterName: '七瀬 七海',
      styleId: 1000001,
      styleName: 'テストスタイル',
      elements: ['Thunder'],
      weaponType: 'Slash',
      passives: [],
    };
    const damageContext = {
      actorCharacterId: 'NNanase',
      actorStyleId: 1000001,
      skillId: 999002,
      skillName: '通常攻撃',
      isNormalAttack: true,
      targetEnemyIndex: 0,
      enemyCount: 1,
      baseHitCount: 3,
      effectiveHitCountPerEnemy: 3,
      destructionRateByEnemy: { 0: 100 },
      destructionRateCapByEnemy: { 0: 999 },
      destructionMultiplierByEnemy: { 0: 10 },
      enemyNamesByEnemy: { 0: 'E1' },
      effectiveDamageRatesByEnemy: { 0: 100 },
      transcendenceBurstDestructionRateGainBonusRate: 0,
      blastPierceDestructionRateBonus: 2,
      chainDestructionRateBonus: 2,
      resonanceDestructionRateBonus: 2,
      damageBreakdown: {
        version: 1,
        targetBreakdowns: [
          {
            targetEnemyIndex: 0,
            targetLabel: 'E1',
            finalMultiplier: 1,
            increasePercent: 0,
            formula: '1.00x',
            groups: [],
          },
        ],
      },
      criticalRateBreakdown: {
        criticalRatePercent: 0,
        isCriticalGuaranteed: false,
        contributions: [],
      },
    };
    const previousFetch = globalThis.fetch;
    globalThis.fetch = async () => ({
      ok: true,
      json: async () => [],
    });

    try {
      openCharDetailPopup(
        targetMember,
        {
          statusEffects: [],
          previewActionFlow: [
            {
              actorCharacterId: 'NNanase',
              skillName: '通常攻撃',
              damageContext,
            },
          ],
        },
        { x: 200, y: 120, isCommitted: false }
      );

      const popup = win.document.body.querySelector('#char-detail-popup');
      assert.ok(popup);
      popup.querySelector('.char-popup-tab[data-tab="damage"]')?.dispatchEvent(
        new win.MouseEvent('click', { bubbles: true, cancelable: true })
      );

      const input = popup.querySelector('[data-role="destruction-rate-input"]');
      const after = popup.querySelector('[data-role="destruction-rate-after"]');
      assert.ok(input);
      assert.ok(after);
      input.value = '100';
      input.dispatchEvent(new win.Event('input', { bubbles: true }));

      for (let attempt = 0; attempt < 20 && after.textContent?.trim() !== '110.00%'; attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 0));
      }

      assert.equal(after.textContent?.trim(), '110.00%');
    } finally {
      globalThis.fetch = previousFetch;
    }
  }));

test('char detail popup damage tab shows normal enemy HP current and max', () =>
  withDom(({ win }) => {
    const targetMember = {
      characterId: 'NNanase',
      characterName: '七瀬 七海',
      styleId: 1000001,
      styleName: 'テストスタイル',
      elements: ['Thunder'],
      weaponType: 'Slash',
      passives: [],
    };

    openCharDetailPopup(
      targetMember,
      {
        statusEffects: [],
        previewActionFlow: [
          {
            actorCharacterId: 'NNanase',
            skillName: 'HP表示テスト',
            damageContext: {
              actorCharacterId: 'NNanase',
              actorStyleId: 1000001,
              skillId: 999002,
              skillName: 'HP表示テスト',
              isNormalAttack: false,
              targetEnemyIndex: 0,
              enemyCount: 1,
              baseHitCount: 1,
              effectiveHitCountPerEnemy: 1,
              destructionRateByEnemy: { 0: 100 },
              destructionRateCapByEnemy: { 0: 300 },
              enemyNamesByEnemy: { 0: 'E1' },
              effectiveDamageRatesByEnemy: { 0: 100 },
              damageBreakdown: {
                version: 1,
                targetBreakdowns: [
                  {
                    targetEnemyIndex: 0,
                    targetLabel: 'E1',
                    finalMultiplier: 1,
                    increasePercent: 0,
                    formula: '1.00x',
                    groups: [],
                  },
                ],
              },
              criticalRateBreakdown: {
                criticalRatePercent: 0,
                isCriticalGuaranteed: false,
                contributions: [],
              },
            },
          },
        ],
      },
      {
        x: 200,
        y: 120,
        isCommitted: false,
        enemyDestructionState: {
          remainingDpByEnemy: { 0: 12345.4 },
          enemyDpByEnemy: { 0: 67890.6 },
          remainingHpByEnemy: { 0: 12345.4 },
          enemyHpByEnemy: { 0: 67890.6 },
        },
      }
    );

    const popup = win.document.body.querySelector('#char-detail-popup');
    assert.ok(popup);
    popup.querySelector('.char-popup-tab[data-tab="damage"]')?.dispatchEvent(
      new win.MouseEvent('click', { bubbles: true, cancelable: true })
    );

    const dpStatus = popup.querySelector('[data-role="damage-calc-dp-status"]');
    assert.equal(dpStatus?.textContent?.trim(), '12345 / 67891');
    const hpStatus = popup.querySelector('[data-role="damage-calc-hp-status"]');
    assert.equal(hpStatus?.textContent?.trim(), '12345 / 67891');
  }));

test('char detail popup damage tab prefers extra HP gauge over normal HP fields', () =>
  withDom(({ win }) => {
    const targetMember = {
      characterId: 'NNanase',
      characterName: '七瀬 七海',
      styleId: 1000001,
      styleName: 'テストスタイル',
      elements: ['Thunder'],
      weaponType: 'Slash',
      passives: [],
    };

    openCharDetailPopup(
      targetMember,
      {
        statusEffects: [],
        previewActionFlow: [
          {
            actorCharacterId: 'NNanase',
            skillName: 'HPゲージ優先テスト',
            damageContext: {
              actorCharacterId: 'NNanase',
              actorStyleId: 1000001,
              skillId: 999003,
              skillName: 'HPゲージ優先テスト',
              isNormalAttack: false,
              targetEnemyIndex: 0,
              enemyCount: 1,
              baseHitCount: 1,
              effectiveHitCountPerEnemy: 1,
              destructionRateByEnemy: { 0: 100 },
              destructionRateCapByEnemy: { 0: 300 },
              enemyNamesByEnemy: { 0: 'E1' },
              effectiveDamageRatesByEnemy: { 0: 100 },
              damageBreakdown: {
                version: 1,
                targetBreakdowns: [
                  {
                    targetEnemyIndex: 0,
                    targetLabel: 'E1',
                    finalMultiplier: 1,
                    increasePercent: 0,
                    formula: '1.00x',
                    groups: [],
                  },
                ],
              },
              criticalRateBreakdown: {
                criticalRatePercent: 0,
                isCriticalGuaranteed: false,
                contributions: [],
              },
            },
          },
        ],
      },
      {
        x: 200,
        y: 120,
        isCommitted: false,
        enemyDestructionState: {
          remainingHpByEnemy: { 0: 12345 },
          enemyHpByEnemy: { 0: 67890 },
          extraHpGaugeStateByEnemy: { 0: { total: 3.6, remaining: 2.4, values: [100, 100, 100] } },
        },
      }
    );

    const popup = win.document.body.querySelector('#char-detail-popup');
    assert.ok(popup);
    popup.querySelector('.char-popup-tab[data-tab="damage"]')?.dispatchEvent(
      new win.MouseEvent('click', { bubbles: true, cancelable: true })
    );

    const hpStatus = popup.querySelector('[data-role="damage-calc-hp-status"]');
    assert.equal(hpStatus?.textContent?.trim(), '2 / 4');
  }));

test('char detail popup shows form chip and dims inactive ability entries for form-change styles', () =>
  withDom(({ win }) => {
    const member = getStore().buildCharacterStyle({
      styleId: FORM_CHANGE_STYLE_IDS.K_ASAKURA_TWINS,
      partyIndex: 0,
      limitBreakLevel: 4,
    });
    member.setCurrentForm(FORM_CHANGE_KEYS.KAREN);

    openCharDetailPopup(
      member,
      {
        statusEffects: [],
        passiveEvents: [],
      },
      { x: 200, y: 120, isCommitted: false }
    );

    const popup = win.document.body.querySelector('#char-detail-popup');
    assert.ok(popup);
    const formChip = popup.querySelector('[data-role="char-popup-form-chip"]');
    assert.ok(formChip);
    assert.match(formChip.textContent ?? '', /フォーム:\s*カレン/);

    popup.querySelector('.char-popup-tab[data-tab="ability"]')?.dispatchEvent(
      new win.MouseEvent('click', { bubbles: true, cancelable: true })
    );

    const overdriveEntry = popup.querySelector('[data-role="char-popup-ability-entry"][data-passive-name="[Overdrive]"]');
    assert.equal(overdriveEntry, null);

    const activeKarenEntry = [...popup.querySelectorAll('[data-role="char-popup-ability-entry"]')]
      .find((entry) => (entry.getAttribute('data-passive-name') ?? '').includes('無差別な殺人鬼'));
    assert.ok(activeKarenEntry);
    assert.equal(activeKarenEntry.getAttribute('data-passive-active'), 'true');
    assert.equal(activeKarenEntry.classList.contains('dimmed'), false);

    const inactiveKareiEntry = [...popup.querySelectorAll('[data-role="char-popup-ability-entry"]')]
      .find((entry) => (entry.getAttribute('data-passive-name') ?? '').includes('仲間と共に'));
    assert.ok(inactiveKareiEntry);
    assert.equal(inactiveKareiEntry.getAttribute('data-passive-active'), 'false');
    assert.equal(inactiveKareiEntry.classList.contains('dimmed'), true);

    const commonEntry = [...popup.querySelectorAll('[data-role="char-popup-ability-entry"]')]
      .find((entry) => (entry.getAttribute('data-passive-name') ?? '') === '閃光');
    assert.ok(commonEntry);
    assert.equal(commonEntry.getAttribute('data-passive-active'), 'true');
    assert.equal(commonEntry.textContent?.includes('LB1'), true);
  }));

test('char detail popup draft passive tab uses current active passives for form-change styles', () =>
  withDom(({ win }) => {
    const member = getStore().buildCharacterStyle({
      styleId: FORM_CHANGE_STYLE_IDS.K_ASAKURA_TWINS,
      partyIndex: 0,
      limitBreakLevel: 4,
    });
    member.setCurrentForm(FORM_CHANGE_KEYS.KAREN);

    openCharDetailPopup(
      member,
      {
        statusEffects: [],
        passiveEvents: [
          {
            characterId: String(member.characterId),
            passiveName: '仲間と共に【朝倉可憐 専用】',
            passiveDesc: '旧フォームの履歴',
          },
        ],
      },
      { x: 200, y: 120, isCommitted: false }
    );

    const popup = win.document.body.querySelector('#char-detail-popup');
    assert.ok(popup);
    popup.querySelector('.char-popup-tab[data-tab="passive"]')?.dispatchEvent(
      new win.MouseEvent('click', { bubbles: true, cancelable: true })
    );

    const passivePanel = popup.querySelector('[data-tab-panel="passive"]');
    assert.ok(passivePanel);
    assert.match(passivePanel.textContent ?? '', /無差別な殺人鬼【カレン 専用】/);
    assert.match(passivePanel.textContent ?? '', /閃光/);
    assert.match(passivePanel.textContent ?? '', /貴様に託した【カレン 専用】/);
    assert.doesNotMatch(passivePanel.textContent ?? '', /仲間と共に【朝倉可憐 専用】/);
    assert.doesNotMatch(passivePanel.textContent ?? '', /紡がれる勇気【朝倉可憐 専用】/);
  }));

test('char detail popup committed passive tab keeps fired passive history for form-change styles', () =>
  withDom(({ win }) => {
    const member = getStore().buildCharacterStyle({
      styleId: FORM_CHANGE_STYLE_IDS.K_ASAKURA_TWINS,
      partyIndex: 0,
      limitBreakLevel: 4,
    });
    member.setCurrentForm(FORM_CHANGE_KEYS.KAREN);

    openCharDetailPopup(
      member,
      {
        statusEffects: [],
        passiveEvents: [
          {
            characterId: String(member.characterId),
            passiveName: '無差別な殺人鬼【カレン 専用】',
            passiveDesc: '発動履歴',
          },
          {
            characterId: String(member.characterId),
            passiveName: '閃光',
            passiveDesc: '発動履歴',
          },
        ],
      },
      { x: 200, y: 120, isCommitted: true }
    );

    const popup = win.document.body.querySelector('#char-detail-popup');
    assert.ok(popup);
    popup.querySelector('.char-popup-tab[data-tab="passive"]')?.dispatchEvent(
      new win.MouseEvent('click', { bubbles: true, cancelable: true })
    );

    const passivePanel = popup.querySelector('[data-tab-panel="passive"]');
    assert.ok(passivePanel);
    assert.match(passivePanel.textContent ?? '', /無差別な殺人鬼【カレン 専用】/);
    assert.match(passivePanel.textContent ?? '', /閃光/);
    assert.doesNotMatch(passivePanel.textContent ?? '', /貴様に託した【カレン 専用】/);
  }));

test('TurnRowController committed char detail popup includes committed action flow section', () =>
  withDom(({ root, win }) => {
    const skill = createSkill({
      id: 9612,
      name: 'Ally Buff',
      targetType: 'AllyAll',
      parts: [{ skill_type: 'AttackUp', target_type: 'AllyAll' }],
    });
    const stateBefore = createState(skill, 1);

    const row = new TurnRowController({
      root,
      store: createStoreStub(),
      turnIndex: 0,
      rowMode: 'committed',
      rowDiagnostics: null,
      record: {
        turnIndex: 18,
        turnId: 18,
        odGaugeAtStart: 0,
        projections: { odGaugeAtEnd: 0 },
        snapBefore: stateBefore.party.map((member) => ({
          partyIndex: member.partyIndex,
          statusEffects: [],
          isReinforcedMode: false,
          reinforcedTurnsRemaining: 0,
          actionDisabledTurns: 0,
        })),
        actions: [
          {
            characterId: String(stateBefore.party[1].characterId),
            characterName: String(stateBefore.party[1].characterName),
            partyIndex: 1,
            skillId: 9612,
            skillName: 'フィルエンハンス',
            statusEffectsApplied: [
              {
                targetCharacterId: String(stateBefore.party[0].characterId),
                statusType: 'AttackUp',
                remaining: 1,
                exitCond: 'Count',
                sourceSkillName: 'フィルエンハンス',
                sourceCharacterName: String(stateBefore.party[1].characterName),
              },
            ],
            statusEffectsRemoved: [],
            enemyStatusChanges: [],
          },
        ],
      },
      replayTurn: {
        turn: 18,
        slots: [{ styleId: stateBefore.party[1].styleId, skillId: 9612 }],
        operations: [],
        note: '',
        overrideEntries: [],
      },
      operations: [],
      operationState: {
        kishinkaStatus: { hasTezuka: false },
        makaiKiheiStatus: { hasYamawaki: false, available: false, remainingUses: 0 },
      },
      stateBefore,
      stateAfter: null,
      onSlotChange: () => {},
      onCommit: () => {},
      onNoteChange: () => {},
      onPreviewRequest: () => {},
      onOdChange: () => {},
      onOperationAdd: () => {},
      onOperationRemove: () => {},
      simulatorSettings: createSimulatorSettings(),
    });
    row.mount();

    const firstSlotIcon = root.querySelectorAll('[data-turn-slot-icon]')[0];
    assert.ok(firstSlotIcon);
    firstSlotIcon.dispatchEvent(new win.MouseEvent('contextmenu', { bubbles: true, cancelable: true }));

    const popup = win.document.body.querySelector('#char-detail-popup');
    assert.ok(popup);
    assert.match(popup.textContent ?? '', /プレビュー（コミット見込み）/);
    assert.match(popup.textContent ?? '', /攻撃力アップ/);
  }));

test('TurnRowController collapses enemy detail popup to a single selected column on narrow viewports', () =>
  withDom(({ root, win }) => {
    setViewportSize(win, { width: 720, height: 640 });
    const state = createState(
      createSkill({
        id: 95035,
        name: 'Enemy Popup Narrow',
        targetType: 'Single',
        parts: [{ skill_type: 'AttackSkill', target_type: 'Single', type: 'Slash' }],
      }),
      3
    );
    mountTurnRow({
      root,
      stateBefore: state,
      simulatorSettings: createSimulatorSettings(),
      enemyPresets: [createEnemyPreset()],
    });

    const popup = openEnemyDetailPopup(root.querySelector('[data-role="enemy-detail-trigger"]'), win);
    const narrowLayout = popup.querySelector('[data-role="enemy-popup-layout"][data-layout-mode="narrow"]');
    assert.ok(narrowLayout);
    assert.equal(narrowLayout.querySelectorAll('[data-role="enemy-popup-column"]').length, 1);
    assert.equal(
      popup.querySelectorAll('[data-role="enemy-popup-tab"]').length,
      3
    );
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
    assert.equal(infoSpace.contains(trigger), false);
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
    assert.ok(targetAnchor.contains(root.querySelector('[data-role="target-trigger"][data-target-kind="enemy"]')));
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
    openEnemyDetailPopup(root.querySelector('[data-role="enemy-detail-trigger"]'), win);
    triggerEnemyPopupAction(win, 'break', { enemyIndex: 2 });
    const popup = getEnemyDetailPopup(win);
    assert.ok(popup);
    assert.equal(
      popup.querySelectorAll('[data-role="manual-break-target-candidate"][data-party-index="0"]').length,
      3
    );

    popup
      .querySelector('[data-role="manual-break-target-candidate"][data-party-index="0"][data-enemy-index="2"]')
      .dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
    getEnemyDetailPopup(win)
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

    openEnemyDetailPopup(root.querySelector('[data-role="enemy-detail-trigger"]'), win);
    triggerEnemyPopupAction(win, 'break', { enemyIndex: 1 });
    const popup = getEnemyDetailPopup(win);
    assert.ok(popup);
    popup
      .querySelector('[data-role="manual-break-target-candidate"][data-party-index="0"][data-enemy-index="0"]')
      .dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
    getEnemyDetailPopup(win)
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

    openEnemyDetailPopup(root.querySelector('[data-role="enemy-detail-trigger"]'), win);
    triggerEnemyPopupAction(win, 'break', { enemyIndex: 2 });
    const popup = getEnemyDetailPopup(win);
    assert.ok(popup);
    popup
      .querySelector('[data-role="manual-break-candidate"][data-party-index="0"][data-enemy-index="0"]')
      .dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
    getEnemyDetailPopup(win)
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

test('TurnRowController manual break editor keeps only the Break section with simplified single-target label', () =>
  withDom(({ root, win }) => {
    const state = createState(
      createSkill({
        id: 950331,
        name: 'Single Break Layout',
        targetType: 'Single',
        parts: [{ skill_type: 'AttackSkill', target_type: 'Single', type: 'Slash' }],
      }),
      3,
    );
    mountTurnRow({
      root,
      stateBefore: state,
      simulatorSettings: createSimulatorSettings(),
	    });

	    openEnemyDetailPopup(root.querySelector('[data-role="enemy-detail-trigger"]'), win);
	    triggerEnemyPopupAction(win, 'break', { enemyIndex: 2 });

    const actorCard = getEnemyDetailPopup(win)?.querySelector('[data-role="enemy-popup-editor-actor"][data-party-index="0"]');
    assert.ok(actorCard);
    const text = actorCard.textContent;
    assert.equal(text.includes('討伐'), false);
    assert.equal(text.includes('対象敵:'), false);
    assert.equal(text.includes('をブレイク'), false);

    const sectionHeadings = [...actorCard.querySelectorAll('div')]
      .filter((el) => el.classList.contains('text-green-700'))
      .map((el) => el.textContent.trim());
    assert.deepEqual(sectionHeadings, ['ブレイク']);
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
    openEnemyDetailPopup(root.querySelector('[data-role="enemy-detail-trigger"]'), win);
    triggerEnemyPopupAction(win, 'break', { enemyIndex: 1 });
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

test('TurnAreaController keeps enemy target controls in the slot target anchor across simulator setting rerenders', () =>
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
      assert.equal(infoSpace.contains(trigger), false);
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

test('TurnAreaController emits Stage Setup passive log rows on turn start after commit', () =>
  withDom(({ root, win }) => {
    let passiveLogRows = [];
    const state = createState(
      createSkill({
        id: 95084,
        name: 'Stage Setup Commit Skill',
        targetType: 'Self',
        parts: [{ skill_type: 'Protection', target_type: 'Self' }],
      }),
      1,
      {
        characterId: 'PLOG_STAGE',
        characterName: 'StageSetupLog役',
        styleId: 9804,
        styleName: 'StageSetupLogスタイル',
      },
    );
    state.stageSetupTurnly = {
      odGauge: 10,
      spAll: 0,
      spFront: 1,
      spBack: 0,
    };

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
      passiveLogRows.some((row) => row.kind === 'marker' && row.text === '=== T2開始 ==='),
    );
    assert.ok(
      passiveLogRows.some(
        (row) =>
          row.kind === 'passive' &&
          row.text === 'T2：Stage Setup : 毎ターン前衛のSP+1',
      ),
    );
    assert.ok(
      passiveLogRows.some(
        (row) =>
          row.kind === 'passive' &&
          row.text === 'T2：Stage Setup : 毎ターンOD+10%',
      ),
    );
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

    const chips = [...root.querySelectorAll('[data-role="operation-chip"]')];
    const chipLabels = chips.map((chip) =>
      chip.textContent.replace('×', '').trim()
    );
    const makaiButton = root.querySelector('[data-role="makai-kihei-btn"]');
    assert.deepEqual(chipLabels, ['騎兵起動', '騎兵起動', '騎兵起動']);
    assert.equal(
      chips.every((chip) =>
        chip.className.includes('whitespace-nowrap')
      ),
      true
    );
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
      2,
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

    assert.equal(engineManager.getCurrentStateWithPending(2).turnState.odGauge, 30);
    assert.match(root.querySelector('[data-turn-od-gauge]').textContent, /030\.00%/);

    root.querySelector('[data-role="commit-btn"]').click();

    assert.equal(engineManager.getStateBefore(0)?.turnState?.odGauge, 30);
    assert.equal(engineManager.computedRecords[0]?.enemyCount, 2);
  }));

test('TurnAreaController ignores drive pierce for Makai Kihei OD preview and commit', () =>
  withDom(({ root }) => {
    const state = createState(
      createSkill({
        id: 9517,
        name: 'Makai Follow',
        targetType: 'Self',
        parts: [{ skill_type: 'Protection', target_type: 'Self' }],
      }),
      2,
      {
        characterId: 'BIYamawaki',
        characterName: '山脇・ボン・イヴァール',
        styleId: MAKAI_KIHEI_STYLE_ID,
        styleName: '誇り高き魔王の凱旋',
        passives: [createMakaiKiheiPassive()],
      }
    );
    state.turnState.odGauge = 10;
    state.party[0].drivePiercePercent = 15;

    const { engineManager } = createTurnAreaController({
      root,
      state,
      simulatorSettings: createSimulatorSettings(),
    });

    root.querySelector('[data-role="makai-kihei-btn"]').click();
    root.querySelector('[data-role="makai-kihei-btn"]').click();

    assert.equal(engineManager.getCurrentStateWithPending(2).turnState.odGauge, 70);
    assert.match(root.querySelector('[data-turn-od-gauge]').textContent, /070\.00%/);

    root.querySelector('[data-role="commit-btn"]').click();

    assert.equal(engineManager.getStateBefore(0)?.turnState?.odGauge, 70);
  }));

test('TurnAreaController shows and applies 総攻撃 only during HOLD UP all-down state', () =>
  withDom(({ root }) => {
    const state = createState(
      createSkill({
        id: 9528,
        name: 'All Out Test',
        targetType: 'Self',
        parts: [{ skill_type: 'Protection', target_type: 'Self' }],
      }),
      2,
      {
        roleAbility: { name: '総攻撃' },
      }
    );
    state.turnState.odGauge = 10;
    state.turnState.holdUpActive = true;
    state.turnState.enemyState.statuses = [
      { statusType: 'DownTurn', targetIndex: 0, remainingTurns: 1, exitCond: 'PlayerTurnEnd' },
      { statusType: 'DownTurn', targetIndex: 1, remainingTurns: 1, exitCond: 'PlayerTurnEnd' },
    ];
    state.turnState.enemyState.destructionRateByEnemy = { 0: 120, 1: 140 };
    const { engineManager } = createTurnAreaController({
      root,
      state,
      simulatorSettings: createSimulatorSettings(),
    });

    const allOutButton = root.querySelector('[data-role="all-out-attack-btn"]');
    assert.ok(allOutButton);
    assert.equal(allOutButton.disabled, false);

    allOutButton.click();

    const chips = [...root.querySelectorAll('[data-role="operation-chip"]')].map((chip) =>
      chip.textContent.replace('×', '').trim()
    );
    const pendingState = engineManager.getCurrentStateWithPending(2);
    assert.deepEqual(chips, ['総攻撃']);
    assert.equal(pendingState.turnState.odGauge, 45);
    assert.equal(pendingState.turnState.holdUpActive, false);
    assert.equal(pendingState.turnState.enemyState.destructionRateByEnemy['0'], 220);
    assert.equal(pendingState.turnState.enemyState.destructionRateByEnemy['1'], 240);
    assert.equal(root.querySelector('[data-role="all-out-attack-btn"]').disabled, true);

    root.querySelector('[data-role="operation-chip-remove"]').click();

    const restoredState = engineManager.getCurrentStateWithPending(2);
    assert.equal(root.querySelector('[data-role="operation-chip"]'), null);
    assert.equal(restoredState.turnState.odGauge, 10);
    assert.equal(restoredState.turnState.holdUpActive, true);
    assert.equal(restoredState.turnState.enemyState.destructionRateByEnemy['0'], 120);
  }));

test('TurnAreaController hides or disables 総攻撃 when ability or HOLD UP condition is missing', () =>
  withDom(({ root }) => {
    const skill = createSkill({
      id: 9529,
      name: 'All Out Disabled',
      targetType: 'Self',
      parts: [{ skill_type: 'Protection', target_type: 'Self' }],
    });
    const noAbilityState = createState(skill, 1);
    createTurnAreaController({
      root,
      state: noAbilityState,
      simulatorSettings: createSimulatorSettings(),
    });
    assert.equal(root.querySelector('[data-role="all-out-attack-btn"]'), null);

    const disabledState = createState(skill, 1, { roleAbility: { name: '総攻撃' } });
    createTurnAreaController({
      root,
      state: disabledState,
      simulatorSettings: createSimulatorSettings(),
    });
    const disabledButton = root.querySelector('[data-role="all-out-attack-btn"]');
    assert.ok(disabledButton);
    assert.equal(disabledButton.disabled, true);
  }));

test('TurnAreaController keeps special button area width and compacts when three special buttons are visible', () =>
  withDom(({ root }) => {
    const state = createFrontlineState(
      [
        createSkill({
          id: 9530,
          name: 'Tezuka Protection',
          targetType: 'Self',
          parts: [{ skill_type: 'Protection', target_type: 'Self' }],
        }),
        createSkill({
          id: 9531,
          name: 'Makai Protection',
          targetType: 'Self',
          parts: [{ skill_type: 'Protection', target_type: 'Self' }],
        }),
        createSkill({
          id: 9532,
          name: 'All Out Protection',
          targetType: 'Self',
          parts: [{ skill_type: 'Protection', target_type: 'Self' }],
        }),
      ],
      1,
      [
        {
          characterId: TEZUKA_CHARACTER_ID,
          characterName: '手塚 咲',
          styleId: TEZUKA_STYLE_ID,
          styleName: '鬼神テスト',
        },
        {
          characterId: 'BIYamawaki',
          characterName: '山脇・ボン・イヴァール',
          styleId: MAKAI_KIHEI_STYLE_ID,
          styleName: '誇り高き魔王の凱旋',
          passives: [createMakaiKiheiPassive()],
        },
        {
          characterId: 'Mona',
          characterName: 'モナ',
          styleId: 1021102,
          styleName: '黎明の魔術師',
          roleAbility: { name: '総攻撃' },
        },
      ]
    );
    state.turnState.holdUpActive = true;
    state.turnState.enemyState.statuses = [
      { statusType: 'DownTurn', targetIndex: 0, remainingTurns: 1, exitCond: 'PlayerTurnEnd' },
    ];
    createTurnAreaController({
      root,
      state,
      simulatorSettings: createSimulatorSettings(),
    });

    const buttonArea = root.querySelector('[data-turn-buttons]');
    assert.ok(buttonArea.className.includes('w-[110px]'));
    assert.ok(buttonArea.className.includes('auto-rows-[minmax(20px,auto)]'));
    assert.ok(root.querySelector('[data-role="kishinka-btn"]'));
    assert.ok(root.querySelector('[data-role="makai-kihei-btn"]'));
    assert.ok(root.querySelector('[data-role="all-out-attack-btn"]'));
  }));

test('TurnAreaController commits manual break attribution and hides committed-row break controls', () =>
  withDom(({ root, win }) => {
    const state = createState(
      createSkill({
        id: 9518,
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

    openEnemyDetailPopup(root.querySelector('[data-role="enemy-detail-trigger"]'), win);
    triggerEnemyPopupAction(win, 'break', { enemyIndex: 2 });
    getEnemyDetailPopup(win)
      .querySelector('[data-role="manual-break-target-candidate"][data-party-index="0"][data-enemy-index="2"]')
      .dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
    getEnemyDetailPopup(win)
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
    assert.deepEqual(engineManager.getReplayTurn(0)?.actionOutcomeOverrides, [
      { position: 0, outcome: 'Break', enemyIndexes: [2] },
    ]);
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

    openEnemyDetailPopup(root.querySelector('[data-role="enemy-detail-trigger"]'), win);
    triggerEnemyPopupAction(win, 'break');

    getEnemyDetailPopup(win)
      .querySelector('[data-role="manual-break-single-toggle"][data-party-index="0"]')
      .dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
    getEnemyDetailPopup(win)
      .querySelector('[data-role="manual-break-target-candidate"][data-party-index="1"][data-enemy-index="1"]')
      .dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
    getEnemyDetailPopup(win)
      .querySelector('[data-role="manual-break-single-toggle"][data-party-index="1"]')
      .dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
    getEnemyDetailPopup(win)
      .querySelector('[data-role="manual-break-target-candidate"][data-party-index="2"][data-enemy-index="2"]')
      .dispatchEvent(new win.MouseEvent('click', { bubbles: true }));

    assert.match(
      root.querySelector('[data-turn-slot][data-position="1"] [data-role="target-trigger-label"]').textContent,
      /E2/,
    );
    assert.match(
      root.querySelector('[data-turn-slot][data-position="2"] [data-role="target-trigger-label"]').textContent,
      /E3/,
    );

    root
      .querySelector('[data-role="commit-btn"]')
      .dispatchEvent(new win.MouseEvent('click', { bubbles: true }));

    const committedActions = engineManager.computedRecords[0]?.actions ?? [];
    const firstAction = committedActions.find((action) => action.positionIndex === 0);
    const secondAction = committedActions.find((action) => action.positionIndex === 1);
    const thirdAction = committedActions.find((action) => action.positionIndex === 2);

    assert.equal(firstAction?.targetEnemyIndex, 0);
    assert.equal(firstAction?.breakHitCount, 1);
    assert.deepEqual(firstAction?.manualBreakEnemyIndexes, [0]);
    assert.equal(secondAction?.targetEnemyIndex, 1);
    assert.equal(secondAction?.breakHitCount, 1);
    assert.deepEqual(secondAction?.manualBreakEnemyIndexes, [1]);
    assert.equal(thirdAction?.targetEnemyIndex, 2);
    assert.equal(thirdAction?.breakHitCount, 0);
    assert.deepEqual(thirdAction?.manualBreakEnemyIndexes ?? [], []);
    assert.deepEqual(engineManager.getReplayTurn(0)?.actionOutcomeOverrides, [
      { position: 0, outcome: 'Break', enemyIndexes: [0] },
      { position: 1, outcome: 'Break', enemyIndexes: [1] },
    ]);
  }));

test('TurnAreaController disables later duplicate manual break targets after an earlier actor claims them', () =>
  withDom(({ root, win }) => {
    const singleTargetSkill = createSkill({
      id: 9519,
      name: 'Focused Slash',
      targetType: 'Single',
      parts: [{ skill_type: 'AttackSkill', target_type: 'Single', type: 'Slash' }],
    });
    const state = createFrontlineState(
      [singleTargetSkill, singleTargetSkill, singleTargetSkill],
      2
    );
    const { engineManager } = createTurnAreaController({
      root,
      state,
      simulatorSettings: createSimulatorSettings(),
    });

    openEnemyDetailPopup(root.querySelector('[data-role="enemy-detail-trigger"]'), win);
    triggerEnemyPopupAction(win, 'break');

    getEnemyDetailPopup(win)
      .querySelector('[data-role="manual-break-single-toggle"][data-party-index="0"]')
      .dispatchEvent(new win.MouseEvent('click', { bubbles: true }));

    const secondActorDuplicateToggle = getEnemyDetailPopup(win)
      .querySelector('[data-role="manual-break-single-toggle"][data-party-index="1"]');
    assert.equal(secondActorDuplicateToggle.hasAttribute('disabled'), true);

    const secondActorTargetE2 = getEnemyDetailPopup(win)
      .querySelector('[data-role="manual-break-target-candidate"][data-party-index="1"][data-enemy-index="1"]');
    assert.equal(secondActorTargetE2.hasAttribute('disabled'), false);
    secondActorTargetE2.dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
    getEnemyDetailPopup(win)
      .querySelector('[data-role="manual-break-single-toggle"][data-party-index="1"]')
      .dispatchEvent(new win.MouseEvent('click', { bubbles: true }));

    root
      .querySelector('[data-role="commit-btn"]')
      .dispatchEvent(new win.MouseEvent('click', { bubbles: true }));

    const committedActions = engineManager.computedRecords[0]?.actions ?? [];
    const firstAction = committedActions.find((action) => action.positionIndex === 0);
    const secondAction = committedActions.find((action) => action.positionIndex === 1);
    const thirdAction = committedActions.find((action) => action.positionIndex === 2);

    assert.deepEqual(firstAction?.manualBreakEnemyIndexes, [0]);
    assert.deepEqual(secondAction?.manualBreakEnemyIndexes, [1]);
    assert.deepEqual(thirdAction?.manualBreakEnemyIndexes ?? [], []);
    assert.deepEqual(engineManager.getReplayTurn(0)?.actionOutcomeOverrides, [
      { position: 0, outcome: 'Break', enemyIndexes: [0] },
      { position: 1, outcome: 'Break', enemyIndexes: [1] },
    ]);
  }));
