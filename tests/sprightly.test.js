import test from 'node:test';
import assert from 'node:assert/strict';

import {
  applyInitialPassiveState,
  CharacterStyle,
  commitTurn,
  createBattleStateFromParty,
  Party,
  previewTurn,
} from '../src/index.js';
import { resolveEffectiveSkillForAction } from '../src/turn/turn-controller.js';
import { formatSkillCostLabel } from '../ui-next/utils/skill-label.js';
import { TurnEngineManager } from '../ui-next/engine/turn-engine-manager.js';
import { getStore } from './helpers.js';

const SPRIGHTLY_STATUS_TYPE = 'Sprightly';
const SPRIGHTLY_SKILL_ID = 46008215;
const SPRIGHTLY_STYLE_ID = 1008208;

function createSprightlyStatus(power, effectId) {
  return {
    effectId,
    statusType: SPRIGHTLY_STATUS_TYPE,
    limitType: 'Once',
    exitCond: 'Count',
    remaining: 1,
    power,
    metadata: { consumeTrigger: 'SkillUse', consumeAmount: 1 },
  };
}

function createProtectionSkill(id) {
  return {
    id,
    name: 'プロテクション',
    label: `Protection${id}`,
    sp_cost: 0,
    target_type: 'Self',
    parts: [{ skill_type: 'Protection', target_type: 'Self' }],
  };
}

function createManualState(actorOverrides = {}) {
  const members = Array.from({ length: 6 }, (_, index) =>
    new CharacterStyle({
      characterId: index === 0 ? 'SPR1' : `SPR${index + 1}`,
      characterName: `SPR${index + 1}`,
      styleId: 9900 + index,
      styleName: `Sprightly Test ${index + 1}`,
      partyIndex: index,
      position: index,
      initialSP: 20,
      skills:
        index === 0
          ? actorOverrides.skills ?? [
              {
                id: 99001,
                name: 'SP13 Skill',
                label: 'SprightlyCostTest',
                sp_cost: 13,
                parts: [{ skill_type: 'AttackSkill', target_type: 'Single', type: 'Slash' }],
              },
            ]
          : [createProtectionSkill(99001 + index)],
      passives: index === 0 ? actorOverrides.passives ?? [] : [],
      statusEffects: index === 0 ? actorOverrides.statusEffects ?? [] : [],
    })
  );
  return createBattleStateFromParty(new Party(members));
}

test('軽快は50%、軽快(小)は20%を切り上げ、previewでは元stateを消費しない', () => {
  let state = createManualState({
    statusEffects: [createSprightlyStatus(0.2, 10), createSprightlyStatus(0.5, 11)],
  });

  const preview = previewTurn(state, {
    0: { characterId: 'SPR1', skillId: 99001, targetEnemyIndex: 0 },
  });
  const action = preview.actions[0];
  assert.equal(action.spCost, 7);
  assert.deepEqual(action.sprightlyCostAdjustment, {
    effectId: 11,
    reductionRate: 0.5,
    spCostBefore: 13,
    spCostAfter: 7,
  });
  assert.equal(state.party[0].resolveEffectiveStatusEffects(SPRIGHTLY_STATUS_TYPE).length, 2);

  let committed = commitTurn(state, preview);
  assert.deepEqual(committed.committedRecord.actions[0].consumedSprightlyEffects, [
    {
      effectId: 11,
      statusType: SPRIGHTLY_STATUS_TYPE,
      limitType: 'Once',
      exitCond: 'Count',
      power: 0.5,
      remainingBefore: 1,
      remainingAfter: 0,
      elements: [],
    },
  ]);
  assert.deepEqual(
    committed.nextState.party[0].resolveEffectiveStatusEffects(SPRIGHTLY_STATUS_TYPE).map((effect) => effect.power),
    [0.2]
  );

  state = committed.nextState;
  const smallPreview = previewTurn(state, {
    0: { characterId: 'SPR1', skillId: 99001, targetEnemyIndex: 0 },
  });
  assert.equal(smallPreview.actions[0].spCost, 11);
  committed = commitTurn(state, smallPreview);
  assert.equal(committed.nextState.party[0].resolveEffectiveStatusEffects(SPRIGHTLY_STATUS_TYPE).length, 0);
});

test('軽快は既存の固定SP補正後に適用し、最終消費SPを1未満にしない', () => {
  const state = createManualState({
    skills: [
      {
        id: 99001,
        name: 'Adjusted Skill',
        label: 'AdjustedSprightlyCostTest',
        sp_cost: 9,
        parts: [{ skill_type: 'AttackSkill', target_type: 'Single', type: 'Slash' }],
      },
      {
        id: 99002,
        name: 'SP1 Skill',
        label: 'MinimumSprightlyCostTest',
        sp_cost: 1,
        parts: [],
      },
    ],
    passives: [
      {
        id: 99100,
        name: 'Reduce SP',
        timing: 'OnFirstBattleStart',
        parts: [{ skill_type: 'ReduceSp', target_type: 'Self', power: [2, 0] }],
      },
    ],
    statusEffects: [
      createSprightlyStatus(0.5, 20),
      {
        statusType: 'HighBoost',
        limitType: 'Only',
        exitCond: 'Eternal',
        remaining: 0,
        power: 1.8,
        metadata: { spCostIncrease: 2, onlyGroupKey: 'HighBoost' },
      },
    ],
  });

  const adjusted = resolveEffectiveSkillForAction(state, state.party[0], state.party[0].getSkill(99001));
  assert.equal(adjusted.sprightlyCostAdjustment.spCostBefore, 9, '9 - 2 + 2 の後に軽快を適用');
  assert.equal(adjusted.spCost, 5);

  state.party[0].statusEffects = [createSprightlyStatus(0.5, 21)];
  state.party[0].passives = [];
  const minimum = resolveEffectiveSkillForAction(state, state.party[0], state.party[0].getSkill(99002));
  assert.equal(minimum.spCost, 1);
  assert.equal(formatSkillCostLabel(state.party[0].getSkill(99002), state.party[0], state), '(1)');
});

test('軽快適用後の消費SPで不足SP warningを判定する', () => {
  const state = createManualState({
    statusEffects: [createSprightlyStatus(0.5, 25)],
  });
  state.party[0].sp.current = 7;
  let preview = previewTurn(state, {
    0: { characterId: 'SPR1', skillId: 99001, targetEnemyIndex: 0 },
  });
  assert.equal(preview.actions[0].spCost, 7);
  assert.equal(preview.actions[0].insufficientSpWarning, '');

  state.party[0].sp.current = 6;
  preview = previewTurn(state, {
    0: { characterId: 'SPR1', skillId: 99001, targetEnemyIndex: 0 },
  });
  assert.match(preview.actions[0].insufficientSpWarning, /requires SP >= 7/);
});

test('軽快のコストと消費結果はreplay再計算後も一致する', () => {
  const manager = new TurnEngineManager();
  manager.initialize(createManualState({
    statusEffects: [createSprightlyStatus(0.5, 26)],
  }));
  const committed = manager.commitNextTurn({
    0: { skillId: 99001, target: { type: 'enemy', enemyIndex: 0 } },
  });
  assert.equal(committed.actions[0].spCost, 7);
  assert.equal(committed.actions[0].consumedSprightlyEffects[0].effectId, 26);
  assert.equal(
    committed.stateSnapshot.statusEffectsByPartyIndex[0].some(
      (effect) => effect.statusType === SPRIGHTLY_STATUS_TYPE
    ),
    false
  );

  manager.recalculateFrom(0);
  assert.equal(manager.computedRecords[0].actions[0].spCost, 7);
  assert.equal(manager.computedRecords[0].actions[0].consumedSprightlyEffects[0].effectId, 26);
});

test('対象外スキルは軽快を適用も消費もせず、軽快付与スキルは使用後に新しい状態を付与する', () => {
  const state = createManualState({
    skills: [
      { id: 99001, name: 'Free', label: 'Free', sp_cost: 0, parts: [] },
      { id: 99002, name: 'All SP', label: 'AllSp', sp_cost: -1, parts: [] },
      { id: 99003, name: 'EP', label: 'EpSkill', sp_cost: 3, consume_type: 'Ep', parts: [] },
      {
        id: 99005,
        name: 'Conditional Free',
        label: 'ConditionalFree',
        sp_cost: 10,
        overwrite: 0,
        overwrite_cond: 'Sp()>=0',
        parts: [],
      },
      {
        id: 99004,
        name: 'Grant Sprightly',
        label: 'GrantSprightly',
        sp_cost: 13,
        parts: [
          {
            skill_type: SPRIGHTLY_STATUS_TYPE,
            target_type: 'AllyAll',
            power: [0.5, 0],
            effect: { limitType: 'Once', exitCond: 'Count', exitVal: [1, 0] },
          },
        ],
      },
    ],
    statusEffects: [createSprightlyStatus(0.2, 30)],
  });
  const actor = state.party[0];

  for (const skillId of [99001, 99002, 99003, 99004, 99005]) {
    const resolved = resolveEffectiveSkillForAction(state, actor, actor.getSkill(skillId));
    assert.equal(resolved.sprightlyCostAdjustment, undefined, `skill ${skillId} should be excluded`);
  }

  const preview = previewTurn(state, { 0: { characterId: 'SPR1', skillId: 99004 } });
  assert.equal(preview.actions[0].spCost, 13);
  const committed = commitTurn(state, preview);
  assert.deepEqual(
    committed.nextState.party[0].resolveEffectiveStatusEffects(SPRIGHTLY_STATUS_TYPE).map((effect) => effect.power),
    [0.5, 0.2]
  );
  assert.equal(committed.committedRecord.actions[0].consumedSprightlyEffects.length, 0);
  assert.equal(
    committed.committedRecord.actions[0].statusEffectsApplied.filter(
      (effect) => effect.statusType === SPRIGHTLY_STATUS_TYPE
    ).length,
    6
  );
});

test('先行スキルが付与した軽快は同一ターンの後続スキルへ適用される', () => {
  const members = Array.from({ length: 6 }, (_, index) =>
    new CharacterStyle({
      characterId: `SEQ${index + 1}`,
      characterName: `SEQ${index + 1}`,
      styleId: 9950 + index,
      styleName: `Sequence ${index + 1}`,
      partyIndex: index,
      position: index,
      initialSP: 20,
      skills:
        index === 0
          ? [
              {
                id: 99501,
                name: 'Grant Sprightly',
                sp_cost: 13,
                parts: [
                  {
                    skill_type: SPRIGHTLY_STATUS_TYPE,
                    target_type: 'AllyAll',
                    power: [0.5, 0],
                    effect: { limitType: 'Once', exitCond: 'Count', exitVal: [1, 0] },
                  },
                ],
              },
            ]
          : index === 1
            ? [
                {
                  id: 99502,
                  name: 'Later Attack',
                  sp_cost: 13,
                  parts: [{ skill_type: 'AttackSkill', target_type: 'Single', type: 'Slash' }],
                },
              ]
            : [createProtectionSkill(99501 + index)],
    })
  );
  const state = createBattleStateFromParty(new Party(members));
  const preview = previewTurn(state, {
    0: { characterId: 'SEQ1', skillId: 99501 },
    1: { characterId: 'SEQ2', skillId: 99502, targetEnemyIndex: 0 },
  });

  assert.equal(preview.actions.find((action) => action.characterId === 'SEQ1').spCost, 13);
  assert.equal(preview.actions.find((action) => action.characterId === 'SEQ2').spCost, 7);
  const committed = commitTurn(state, preview);
  assert.equal(
    committed.nextState.party[1].resolveEffectiveStatusEffects(SPRIGHTLY_STATUS_TYPE).length,
    0
  );
});

test('実データの花茶は条件成立時に前衛闇属性へ軽快(小)を付与する', () => {
  const store = getStore();
  const darkStyleIds = [];
  const nonDarkStyleIds = [];
  const darkCharacterIds = new Set(['LShanhua']);
  for (const style of store.styles.filter(
    (candidate) => Array.isArray(candidate?.elements) && candidate.elements.includes('Dark')
  )) {
    const characterId = String(style?.chara_label ?? '');
    if (!characterId || darkCharacterIds.has(characterId)) continue;
    darkStyleIds.push(Number(style.id));
    darkCharacterIds.add(characterId);
    if (darkStyleIds.length >= 3) break;
  }
  const nonDarkCharacterIds = new Set(darkCharacterIds);
  for (const style of store.styles.filter(
    (candidate) => !Array.isArray(candidate?.elements) || !candidate.elements.includes('Dark')
  )) {
    const characterId = String(style?.chara_label ?? '');
    if (!characterId || nonDarkCharacterIds.has(characterId)) continue;
    nonDarkStyleIds.push(Number(style.id));
    nonDarkCharacterIds.add(characterId);
    if (nonDarkStyleIds.length >= 2) break;
  }
  assert.equal(darkStyleIds.length >= 3, true);
  assert.equal(nonDarkStyleIds.length >= 2, true);

  const party = store.buildPartyFromStyleIds(
    [
      SPRIGHTLY_STYLE_ID,
      darkStyleIds[0],
      nonDarkStyleIds[0],
      darkStyleIds[1],
      darkStyleIds[2],
      nonDarkStyleIds[1],
    ],
    { initialSP: 20 }
  );
  const state = createBattleStateFromParty(party);
  applyInitialPassiveState(state);

  assert.deepEqual(
    state.party.slice(0, 3).map((member) =>
      member.resolveEffectiveStatusEffects(SPRIGHTLY_STATUS_TYPE).map((effect) => effect.power)
    ),
    [[0.2], [0.2], []]
  );

  const actor = state.party[0];
  const preview = previewTurn(state, {
    0: { characterId: actor.characterId, skillId: SPRIGHTLY_SKILL_ID },
  });
  assert.equal(preview.actions[0].spCost, 13, '軽快付与スキル自身は既存の軽快(小)で軽減されない');
  const committed = commitTurn(state, preview);
  assert.deepEqual(
    committed.nextState.party[0].resolveEffectiveStatusEffects(SPRIGHTLY_STATUS_TYPE).map((effect) => effect.power),
    [0.5, 0.2]
  );
});
