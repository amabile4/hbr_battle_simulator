import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

import { createBattleStateFromParty } from '../src/index.js';
import { getStore } from './helpers.js';
import { TurnAreaController } from '../ui-next/components/turn-area.js';
import { TurnEngineManager } from '../ui-next/engine/turn-engine-manager.js';
import { TARGET_SELECTION_MODES } from '../ui-next/utils/simulator-settings.js';

const UI_NEXT_YUINA_SWITCH_STYLE_ID = 1004107;
const EMBEDDED_NORMAL_ATTACK_STYLE_ID = 1010103;
const SAME_NAME_SWITCH_PARENT_SKILL_ID = 46001215;

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

function createSimulatorSettings() {
  return {
    targetSelection: {
      enemyMode: TARGET_SELECTION_MODES.SIMPLE,
      allyMode: TARGET_SELECTION_MODES.SIMPLE,
    },
  };
}

function createStateWithLeadStyle(styleId) {
  const store = getStore();
  return createBattleStateFromParty(
    store.buildPartyFromStyleIds([styleId, 1001101, 1001201, 1001301, 1001401, 1001501], {
      initialSP: 20,
    })
  );
}

function createStateWithLeadStyleUniqueParty(styleId) {
  const store = getStore();
  const leadStyle = store.styles.find((style) => Number(style.id) === Number(styleId));
  assert.ok(leadStyle, 'lead style should exist in store');

  const leadChara = String(leadStyle.chara ?? '');
  const pickedStyleIds = [Number(styleId)];
  const usedCharas = new Set([leadChara]);

  for (const style of store.styles ?? []) {
    const candidateStyleId = Number(style?.id);
    const candidateChara = String(style?.chara ?? '');
    if (!Number.isFinite(candidateStyleId) || candidateStyleId === Number(styleId)) {
      continue;
    }
    if (usedCharas.has(candidateChara)) {
      continue;
    }
    pickedStyleIds.push(candidateStyleId);
    usedCharas.add(candidateChara);
    if (pickedStyleIds.length >= 6) {
      break;
    }
  }

  assert.equal(pickedStyleIds.length, 6, 'test party should be resolved with 6 unique characters');

  return createBattleStateFromParty(
    store.buildPartyFromStyleIds(pickedStyleIds, { initialSP: 20 })
  );
}

function mountTurnArea(root, state) {
  const store = getStore();
  const controller = new TurnAreaController({
    root,
    store,
    engineManager: new TurnEngineManager(),
    onError(error) {
      throw error;
    },
    onTurnCommitted() {},
  });
  controller.initialize(state, {}, createSimulatorSettings());
  return controller;
}

test('ui-next listbox exposes both selectable Yuina switch variants', () =>
  withDom(({ root }) => {
    mountTurnArea(root, createStateWithLeadStyle(UI_NEXT_YUINA_SWITCH_STYLE_ID));

    const options = Array.from(
      root.querySelectorAll('select[data-skill-select][data-position="0"] option')
    ).map((option) => option.textContent ?? '');

    assert.equal(options.some((text) => text.includes('蒼焔ノ迷宮')), true);
    assert.equal(options.some((text) => text.includes('蒼焔ノ螺旋')), true);
  }));

test('ui-next listbox restores embedded normal attack first and keeps pursuit hidden', () =>
  withDom(({ root }) => {
    mountTurnArea(root, createStateWithLeadStyle(EMBEDDED_NORMAL_ATTACK_STYLE_ID));

    const options = Array.from(
      root.querySelectorAll('select[data-skill-select][data-position="0"] option')
    ).map((option) => option.textContent ?? '');

    assert.equal(options[0]?.includes('通常攻撃'), true, 'normal attack should be the first selectable option');
    assert.equal(options.some((text) => text.includes('追撃')), false, 'pursuit should stay hidden from ui-next listbox');
  }));

test('ui-next listbox keeps element hint text for same-name switch variants', () =>
  withDom(({ root }) => {
    const store = getStore();
    const sameNameSwitchStyle = store.styles.find((style) =>
      (style.skills ?? []).some((skillRef) => Number(skillRef.id) === SAME_NAME_SWITCH_PARENT_SKILL_ID)
    );
    assert.ok(sameNameSwitchStyle, 'style with same-name SkillSwitch parent should exist in test data');

    mountTurnArea(root, createStateWithLeadStyleUniqueParty(Number(sameNameSwitchStyle.id)));

    const options = Array.from(
      root.querySelectorAll('select[data-skill-select][data-position="0"] option')
    ).map((option) => option.textContent ?? '');

    const darkVariant = options.some((text) => text.includes('(闇)コードダクネス'));
    const fireVariant = options.some((text) => text.includes('(火)コードダクネス'));

    assert.equal(darkVariant, true, 'same-name switch dark variant should include element hint text');
    assert.equal(fireVariant, true, 'same-name switch fire variant should include element hint text');
  }));
