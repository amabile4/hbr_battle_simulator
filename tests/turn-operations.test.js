import test from 'node:test';
import assert from 'node:assert/strict';

import { CharacterStyle, Party, createBattleStateFromParty } from '../src/index.js';
import {
  applyBeforeCommitOperations,
  canActivateKishinka,
  resolveMakaiKiheiAvailability,
} from '../src/turn/turn-operations.js';
import { REPLAY_OPERATION_TYPES } from '../src/ui/lightweight-replay-script.js';

const MAKAI_KIHEI_STYLE_ID = 1003108;
const MAKAI_KIHEI_SKILL_ID = 46003117;
const TEZUKA_STYLE_ID = 1001408;
const TEZUKA_CHARACTER_ID = 'STezuka';

function createSkill({ id, name, targetType, parts }) {
  return {
    id,
    name,
    label: `${name}${id}`,
    sp_cost: 0,
    target_type: targetType,
    parts,
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

function createMember({
  characterId,
  characterName,
  styleId,
  styleName,
  partyIndex,
  position,
  initialSP = 10,
  skills = [],
  passives = [],
}) {
  return new CharacterStyle({
    characterId,
    characterName,
    styleId,
    styleName,
    partyIndex,
    position,
    initialSP,
    skills,
    passives,
  });
}

function createBaselineParty(overrides = {}) {
  return new Party(
    Array.from({ length: 6 }, (_, index) => {
      const override = overrides[index] ?? {};
      return createMember({
        characterId: override.characterId ?? `UT${index + 1}`,
        characterName: override.characterName ?? `UT${index + 1}`,
        styleId: override.styleId ?? 9800 + index,
        styleName: override.styleName ?? `UTS${index + 1}`,
        partyIndex: index,
        position: override.position ?? index,
        initialSP: override.initialSP ?? 10,
        skills:
          override.skills ??
          [
            createSkill({
              id: 9900 + index,
              name: `Protection${index + 1}`,
              targetType: 'Self',
              parts: [{ skill_type: 'Protection', target_type: 'Self' }],
            }),
          ],
        passives: override.passives ?? [],
      });
    })
  );
}

function createState(overrides = {}, { odGauge = 0, enemyCount = 1 } = {}) {
  const state = createBattleStateFromParty(createBaselineParty(overrides));
  state.turnState.odGauge = odGauge;
  state.turnState.enemyState.enemyCount = enemyCount;
  return state;
}

test('applyBeforeCommitOperations uses the supplied enemyCount for Makai Kihei OD gain', () => {
  const state = createState(
    {
      0: {
        characterId: 'BIYamawaki',
        characterName: '山脇・ボン・イヴァール',
        styleId: MAKAI_KIHEI_STYLE_ID,
        styleName: '誇り高き魔王の凱旋',
        passives: [createMakaiKiheiPassive()],
      },
    },
    { odGauge: 0, enemyCount: 1 }
  );

  const nextState = applyBeforeCommitOperations(
    state,
    [{ type: REPLAY_OPERATION_TYPES.ACTIVATE_MAKAI_KIHEI }],
    { enemyCount: 2 }
  );

  assert.equal(nextState.turnState.enemyState.enemyCount, 2);
  assert.equal(nextState.turnState.odGauge, 30);
});

test('applyBeforeCommitOperations applies Kishinka and Makai Kihei before preemptive OD', () => {
  const state = createState(
    {
      0: {
        characterId: TEZUKA_CHARACTER_ID,
        characterName: '手塚 咲',
        styleId: TEZUKA_STYLE_ID,
        styleName: '鬼神テスト',
      },
      1: {
        characterId: 'BIYamawaki',
        characterName: '山脇・ボン・イヴァール',
        styleId: MAKAI_KIHEI_STYLE_ID,
        styleName: '誇り高き魔王の凱旋',
        passives: [createMakaiKiheiPassive()],
      },
    },
    { odGauge: 70, enemyCount: 2 }
  );

  const nextState = applyBeforeCommitOperations(state, [
    { type: REPLAY_OPERATION_TYPES.ACTIVATE_KISHINKA },
    { type: REPLAY_OPERATION_TYPES.ACTIVATE_MAKAI_KIHEI },
    { type: REPLAY_OPERATION_TYPES.ACTIVATE_PREEMPTIVE_OD, payload: { level: 1 } },
  ]);

  assert.equal(nextState.party[0].isReinforcedMode, true);
  assert.equal(nextState.turnState.turnType, 'od');
  assert.equal(nextState.turnState.odGauge, 15);
});

test('capability helpers resolve Kishinka and Makai Kihei availability from state only', () => {
  const state = createState(
    {
      0: {
        characterId: TEZUKA_CHARACTER_ID,
        characterName: '手塚 咲',
        styleId: TEZUKA_STYLE_ID,
        styleName: '鬼神テスト',
      },
      1: {
        characterId: 'BIYamawaki',
        characterName: '山脇・ボン・イヴァール',
        styleId: MAKAI_KIHEI_STYLE_ID,
        styleName: '誇り高き魔王の凱旋',
        passives: [createMakaiKiheiPassive()],
      },
    }
  );

  assert.equal(canActivateKishinka(state), true);
  const makai = resolveMakaiKiheiAvailability(state);
  assert.equal(makai.hasYamawaki, true);
  assert.equal(makai.availableInState, true);
  assert.equal(makai.embeddedSkill?.label, 'BIYamawakiSkill55b');

  state.party[0].activateReinforcedMode(3);
  assert.equal(canActivateKishinka(state), false);
});
