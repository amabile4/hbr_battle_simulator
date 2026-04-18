import test from 'node:test';
import assert from 'node:assert/strict';

import {
  CharacterStyle,
  Party,
  applyInitialPassiveState,
  createBattleStateFromParty,
} from '../src/index.js';
import { applyBeforeCommitOperations } from '../src/turn/turn-operations.js';
import { REPLAY_OPERATION_TYPES } from '../src/ui/lightweight-replay-script.js';
import { FORM_CHANGE_KEYS, FORM_CHANGE_STYLE_IDS } from '../src/domain/form-change.js';
import { getStore } from './helpers.js';

const INITIAL_SP = 10;
const ACTOR_CHARACTER_ID = 'KAsakura';
const ACTOR_LIMIT_BREAK_LEVEL = 4;

function createProtectionSkill(id, name) {
  return {
    id,
    label: `TestSkill${id}`,
    name,
    target_type: 'Self',
    consume_type: 'Sp',
    sp_cost: 0,
    is_restricted: 0,
    parts: [{ skill_type: 'Protection', target_type: 'Self' }],
  };
}

function createPartyWithFormChangeLead() {
  const store = getStore();
  const actor = store.buildCharacterStyle({
    styleId: FORM_CHANGE_STYLE_IDS.K_ASAKURA_TWINS,
    partyIndex: 0,
    initialSP: INITIAL_SP,
    limitBreakLevel: ACTOR_LIMIT_BREAK_LEVEL,
  });
  const allies = Array.from({ length: 5 }, (_, index) =>
    new CharacterStyle({
      characterId: `ALLY${index + 1}`,
      characterName: `ALLY${index + 1}`,
      styleId: 9100 + index,
      styleName: `ALLY_STYLE_${index + 1}`,
      role: 'Attacker',
      partyIndex: index + 1,
      position: index + 1,
      initialSP: INITIAL_SP,
      skills: [createProtectionSkill(9200 + index, `ALLY_PROTECTION_${index + 1}`)],
      passives: [],
    })
  );
  return new Party([actor, ...allies]);
}

test('CODE:Virtual Killer LB4 base form applies 朝倉可憐専用 turn-start passives', () => {
  const state = applyInitialPassiveState(createBattleStateFromParty(createPartyWithFormChangeLead()));
  const actor = state.party.find((member) => member.characterId === ACTOR_CHARACTER_ID);
  assert.ok(actor, 'actor should exist');

  assert.equal(actor.getCurrentFormKey(), FORM_CHANGE_KEYS.KAREI);
  assert.equal(actor.role, 'Blaster');
  assert.equal(actor.sp.current, INITIAL_SP + 1, '閃光 should still recover self SP');
  assert.equal(state.turnState.odGauge, 10, '紡がれる勇気 should add 10% OD in 朝倉可憐 form');
  for (const ally of state.party.filter((member) => member.characterId !== ACTOR_CHARACTER_ID)) {
    assert.equal(ally.sp.current, INITIAL_SP + 1, '仲間と共に should recover ally SP in 朝倉可憐 form');
  }
});

test('CODE:Virtual Killer LB4 Karen form suppresses 朝倉可憐専用 turn-start passives', () => {
  const baseState = createBattleStateFromParty(createPartyWithFormChangeLead());
  const state = applyInitialPassiveState(
    applyBeforeCommitOperations(baseState, [
      {
        type: REPLAY_OPERATION_TYPES.CHANGE_FORM,
        payload: {
          characterId: ACTOR_CHARACTER_ID,
          formKey: FORM_CHANGE_KEYS.KAREN,
          displayName: 'カレン',
        },
      },
    ])
  );
  const actor = state.party.find((member) => member.characterId === ACTOR_CHARACTER_ID);
  assert.ok(actor, 'actor should exist');

  assert.equal(actor.getCurrentFormKey(), FORM_CHANGE_KEYS.KAREN);
  assert.equal(actor.role, 'Breaker');
  assert.equal(actor.sp.current, INITIAL_SP + 1, '閃光 should remain active in either form');
  assert.equal(state.turnState.odGauge, 0, '紡がれる勇気 should not fire in Karen form');
  for (const ally of state.party.filter((member) => member.characterId !== ACTOR_CHARACTER_ID)) {
    assert.equal(ally.sp.current, INITIAL_SP, '仲間と共に should stay inactive in Karen form');
  }
});
