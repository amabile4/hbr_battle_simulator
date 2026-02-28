import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { BattleDomAdapter } from '../src/index.js';
import { getStore, getSixUsableStyleIds } from './helpers.js';

function createRoot() {
  const dom = new JSDOM(`<!doctype html><body>
    <div id="app">
      <div data-role="style-slots"></div>
      <span data-role="selection-summary"></span>
      <button data-action="initialize"></button>
      <input data-role="enemy-action" />
      <div data-role="action-slots"></div>
      <select data-role="swap-from"><option value="0">0</option></select>
      <select data-role="swap-to"><option value="3">3</option></select>
      <button data-action="swap"></button>
      <button data-action="preview"></button>
      <button data-action="commit"></button>
      <button data-action="clear-records"></button>
      <button data-action="export-csv"></button>
      <span data-role="turn-label"></span>
      <span data-role="status"></span>
      <ul data-role="party-state"></ul>
      <pre data-role="preview-output"></pre>
      <tbody data-role="record-body"></tbody>
      <textarea data-role="csv-output"></textarea>
    </div>
  </body>`);

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
  assert.ok(csv.includes('turnLabel,enemyAction'));
  assert.ok(csv.includes('T1'));
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

test('character -> style selection is linked and reflected on screen', () => {
  const store = getStore();
  const { root, win } = createRoot();
  const adapter = new BattleDomAdapter({ root, dataStore: store, initialSP: 10 });
  adapter.mount();

  const characterSelects = root.querySelectorAll('[data-role="character-select"]');
  const styleSelects = root.querySelectorAll('[data-role="style-select"]');
  assert.equal(characterSelects.length, 6);
  assert.equal(styleSelects.length, 6);

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
  const admiralCommand = boxes.find((box) => {
    const label = box.closest('label');
    return (label?.textContent ?? '').includes('指揮行動');
  });

  assert.ok(admiralCommand, 'admiral command checkbox should exist');
  assert.equal(admiralCommand.disabled, true, 'admiral command checkbox should be disabled');
  assert.equal(admiralCommand.checked, true, 'admiral command checkbox should be checked');
});
