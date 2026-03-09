import test from 'node:test';
import assert from 'node:assert/strict';
import {
  activateOverdrive,
  analyzePassiveTimingCoverage,
  analyzePassiveConditionSupport,
  applyEnemyAttackTokenTriggers,
  applyPassiveTiming,
  CharacterStyle,
  commitTurn,
  createBattleStateFromParty,
  grantExtraTurn,
  Party,
  previewTurn,
  applyInitialPassiveState,
} from '../src/index.js';
import { getStore, getSixUsableStyleIds } from './helpers.js';

function buildActionDict(party) {
  return Object.fromEntries(
    party.getFrontline().map((member) => {
      const skill = member.skills.find((item) => item.spCost > 0) ?? member.skills[0];
      return [
        String(member.position),
        {
          characterId: member.characterId,
          skillId: skill.skillId,
        },
      ];
    })
  );
}

function findStyleIdBySkillId(store, skillId) {
  for (const style of store.styles) {
    if (!Array.isArray(style.skills)) {
      continue;
    }
    if (style.skills.some((s) => Number(s.id ?? s.i) === Number(skillId))) {
      return Number(style.id);
    }
  }
  throw new Error(`style not found for skillId=${skillId}`);
}

function createSixMemberManualParty(factory) {
  const members = Array.from({ length: 6 }, (_, idx) =>
    new CharacterStyle({
      characterId: `M${idx + 1}`,
      characterName: `M${idx + 1}`,
      styleId: idx + 1,
      styleName: `S${idx + 1}`,
      partyIndex: idx,
      position: idx,
      initialSP: 10,
      skills: [
        {
          id: 8000 + idx,
          name: '通常',
          sp_cost: 0,
          parts: idx <= 2 ? [{ skill_type: 'AttackNormal', target_type: 'Single', type: 'Slash' }] : [],
        },
      ],
      ...(typeof factory === 'function' ? factory(idx) : {}),
    })
  );
  return new Party(members);
}

test('consume_type Token spends token instead of SP on preview and commit', () => {
  const party = createSixMemberManualParty((idx) =>
    idx === 0
      ? {
          initialToken: 5,
          skills: [
            {
              id: 18000,
              name: 'Token Spend',
              sp_cost: 3,
              consume_type: 'Token',
              parts: [{ skill_type: 'AttackSkill', target_type: 'Single', type: 'Slash' }],
            },
          ],
        }
      : {}
  );
  const state = createBattleStateFromParty(party);

  const preview = previewTurn(state, {
    0: { characterId: 'M1', skillId: 18000, targetEnemyIndex: 0 },
    1: { characterId: 'M2', skillId: 8001 },
    2: { characterId: 'M3', skillId: 8002 },
  });
  const entry = preview.actions.find((item) => item.characterId === 'M1');
  assert.equal(entry.startSP, 10);
  assert.equal(entry.endSP, 10);
  assert.equal(entry.startToken, 5);
  assert.equal(entry.endToken, 2);

  const { nextState, committedRecord } = commitTurn(state, preview);
  const member = nextState.party.find((item) => item.characterId === 'M1');
  assert.equal(member.sp.current, 12);
  assert.equal(member.tokenState.current, 2);
  const committed = committedRecord.actions.find((item) => item.characterId === 'M1');
  assert.equal(committed.endToken, 2);
  assert.equal(committed.tokenChanges[0].delta, -3);
});

test('TokenSet skill part increases token and clamps at max 10', () => {
  const party = createSixMemberManualParty((idx) =>
    idx === 0
      ? {
          initialToken: 9,
          skills: [
            {
              id: 18010,
              name: 'Token Gain',
              sp_cost: 0,
              parts: [{ skill_type: 'TokenSet', target_type: 'Self', power: [2, 0] }],
            },
          ],
        }
      : {}
  );
  const state = createBattleStateFromParty(party);
  const preview = previewTurn(state, {
    0: { characterId: 'M1', skillId: 18010 },
    1: { characterId: 'M2', skillId: 8001 },
    2: { characterId: 'M3', skillId: 8002 },
  });

  const { nextState, committedRecord } = commitTurn(state, preview);
  const member = nextState.party.find((item) => item.characterId === 'M1');
  assert.equal(member.tokenState.current, 10);
  const committed = committedRecord.actions.find((item) => item.characterId === 'M1');
  assert.equal(committed.tokenChanges.some((item) => item.triggerType === 'TokenSet' && item.delta === 1), true);
});

test('TokenSetByAttacking grants token per damaged enemy', () => {
  const party = createSixMemberManualParty((idx) =>
    idx === 0
      ? {
          passives: [
            {
              id: 18100,
              name: '戦勲',
              timing: 'OnFirstBattleStart',
              condition: '',
              parts: [{ skill_type: 'TokenSetByAttacking', target_type: 'Self', power: [1, 0] }],
            },
          ],
          skills: [
            {
              id: 18101,
              name: 'All Attack',
              sp_cost: 0,
              target_type: 'All',
              parts: [{ skill_type: 'AttackSkill', target_type: 'All', type: 'Slash' }],
            },
          ],
        }
      : {}
  );
  const state = createBattleStateFromParty(party);
  state.turnState.enemyState.enemyCount = 3;

  const preview = previewTurn(state, {
    0: { characterId: 'M1', skillId: 18101 },
    1: { characterId: 'M2', skillId: 8001 },
    2: { characterId: 'M3', skillId: 8002 },
  });
  const { nextState, committedRecord } = commitTurn(state, preview);

  const member = nextState.party.find((item) => item.characterId === 'M1');
  assert.equal(member.tokenState.current, 3);
  const committed = committedRecord.actions.find((item) => item.characterId === 'M1');
  assert.equal(
    committed.tokenChanges.some((item) => item.triggerType === 'TokenSetByAttacking' && item.delta === 3),
    true
  );
});

test('TokenSetByHealedDp grants token when DP heal skill targets the member', () => {
  const party = createSixMemberManualParty((idx) => {
    if (idx === 0) {
      return {
        skills: [
          {
            id: 18120,
            name: 'DP Heal',
            sp_cost: 0,
            parts: [{ skill_type: 'HealDp', target_type: 'AllySingle', power: [10, 0] }],
          },
        ],
      };
    }
    if (idx === 1) {
      return {
        passives: [
          {
            id: 18121,
            name: '戦士の祝福',
            timing: 'OnFirstBattleStart',
            condition: '',
            parts: [{ skill_type: 'TokenSetByHealedDp', target_type: 'Self', power: [1, 0] }],
          },
        ],
      };
    }
    return {};
  });
  const state = createBattleStateFromParty(party);

  const preview = previewTurn(state, {
    0: { characterId: 'M1', skillId: 18120, targetCharacterId: 'M2' },
    1: { characterId: 'M2', skillId: 8001 },
    2: { characterId: 'M3', skillId: 8002 },
  });
  const { nextState, committedRecord } = commitTurn(state, preview);

  const target = nextState.party.find((item) => item.characterId === 'M2');
  assert.equal(target.tokenState.current, 1);
  const actorEntry = committedRecord.actions.find((item) => item.characterId === 'M1');
  assert.equal(
    actorEntry.dpChanges.some(
      (item) =>
        item.triggerType === 'DirectDpHeal' &&
        item.skillType === 'HealDp' &&
        item.targetCharacterId === 'M2' &&
        item.isAmountResolved === false
    ),
    true
  );
  const committed = committedRecord.actions.find((item) => item.characterId === 'M2');
  assert.equal(
    committed.tokenChanges.some((item) => item.triggerType === 'TokenSetByHealedDp' && item.delta === 1),
    true
  );
});

test('HealDpRate updates DP current/cap and records direct DP heal change', () => {
  const party = createSixMemberManualParty((idx) => {
    if (idx === 0) {
      return {
        skills: [
          {
            id: 18122,
            name: 'DP Rate Heal',
            sp_cost: 0,
            parts: [{ skill_type: 'HealDpRate', target_type: 'AllySingle', power: [0.1, 0], value: [1.2, 0] }],
          },
        ],
      };
    }
    if (idx === 1) {
      return {
        dpState: {
          baseMaxDp: 100,
          currentDp: 40,
          effectiveDpCap: 100,
        },
      };
    }
    return {};
  });
  const state = createBattleStateFromParty(party);

  const preview = previewTurn(state, {
    0: { characterId: 'M1', skillId: 18122, targetCharacterId: 'M2' },
    1: { characterId: 'M2', skillId: 8001 },
    2: { characterId: 'M3', skillId: 8002 },
  });
  const { nextState, committedRecord } = commitTurn(state, preview);

  const target = nextState.party.find((item) => item.characterId === 'M2');
  assert.equal(target.dpState.currentDp, 50);
  assert.equal(target.dpState.effectiveDpCap, 120);
  const actorEntry = committedRecord.actions.find((item) => item.characterId === 'M1');
  assert.equal(
    actorEntry.dpChanges.some(
      (item) =>
        item.triggerType === 'DirectDpHeal' &&
        item.skillType === 'HealDpRate' &&
        item.targetCharacterId === 'M2' &&
        item.delta === 10 &&
        item.preDp === 40 &&
        item.postDp === 50 &&
        item.postDpCap === 120 &&
        item.isAmountResolved === true
    ),
    true
  );
  assert.equal(
    committedRecord.dpEvents.some(
      (item) =>
        item.triggerType === 'DirectDpHeal' &&
        item.skillType === 'HealDpRate' &&
        item.characterId === 'M2' &&
        item.delta === 10
    ),
    true
  );
});

test('フェリチータ grants token only on initial skill use, not on later regeneration turns', () => {
  const store = getStore();
  const actorStyleId = findStyleIdBySkillId(store, 46008506);
  const others = getSixUsableStyleIds(store).filter((id) => Number(id) !== actorStyleId);
  const party = store.buildPartyFromStyleIds([actorStyleId, ...others.slice(0, 5)], {
    initialSP: 20,
    skillSetsByPartyIndex: {
      0: [46008506],
    },
  });
  let state = createBattleStateFromParty(party);
  let actor = state.party[0];

  assert.equal(actor.characterId, 'MdAngelis');

  const preview1 = previewTurn(state, {
    0: { characterId: actor.characterId, skillId: 46008506 },
  });
  const commit1 = commitTurn(state, preview1);
  state = commit1.nextState;
  actor = state.party[0];
  const entry1 = commit1.committedRecord.actions.find((item) => item.characterId === actor.characterId);

  assert.equal(actor.tokenState.current, 1);
  assert.equal(
    (entry1.tokenChanges ?? []).some((item) => item.triggerType === 'TokenSet' && item.delta === 1),
    true
  );
  assert.equal(
    (entry1.tokenChanges ?? []).some((item) => item.triggerType === 'TokenSetByHealedDp' && item.delta === 1),
    false
  );
  assert.equal(
    (entry1.dpChanges ?? []).some(
      (item) => item.triggerType === 'RegenerationDpGrant' && item.targetCharacterId === actor.characterId
    ),
    true
  );
  assert.equal(
    (commit1.committedRecord.dpEvents ?? []).some(
      (item) => item.triggerType === 'RegenerationDpTick' && item.characterId === actor.characterId
    ),
    true
  );
  const actorSnapAfterTurn1 = commit1.committedRecord.snapAfter.find(
    (item) => item.characterId === actor.characterId
  );
  assert.equal(
    (actorSnapAfterTurn1.statusEffects ?? []).some(
      (item) => item.statusType === 'RegenerationDp' && item.exitCond === 'EnemyTurnEnd' && item.remaining === 3
    ),
    true
  );

  const preview2 = previewTurn(state, {});
  const commit2 = commitTurn(state, preview2);
  state = commit2.nextState;
  actor = state.party[0];
  const entry2 = commit2.committedRecord.actions.find((item) => item.characterId === actor.characterId);

  assert.equal(actor.tokenState.current, 1);
  assert.equal(entry2, undefined);
  assert.equal(
    (commit2.committedRecord.dpEvents ?? []).some(
      (item) => item.triggerType === 'RegenerationDpTick' && item.characterId === actor.characterId
    ),
    true
  );

  const preview3 = previewTurn(state, {});
  const commit3 = commitTurn(state, preview3);
  state = commit3.nextState;
  actor = state.party[0];
  const entry3 = commit3.committedRecord.actions.find((item) => item.characterId === actor.characterId);

  assert.equal(actor.tokenState.current, 1);
  assert.equal(entry3, undefined);
  assert.equal(
    (commit3.committedRecord.dpEvents ?? []).some(
      (item) => item.triggerType === 'RegenerationDpTick' && item.characterId === actor.characterId
    ),
    true
  );
});

test('HealDpByDamage is tracked separately from direct DP heal triggers', () => {
  const party = createSixMemberManualParty((idx) => {
    if (idx === 0) {
      return {
        passives: [
          {
            id: 18124,
            name: '戦士の祝福',
            timing: 'OnFirstBattleStart',
            condition: '',
            parts: [{ skill_type: 'TokenSetByHealedDp', target_type: 'Self', power: [1, 0] }],
          },
        ],
        skills: [
          {
            id: 18123,
            name: 'Shield Tornado',
            sp_cost: 0,
            target_type: 'All',
            hit_count: 1,
            parts: [
              { skill_type: 'AttackSkill', target_type: 'All', type: 'Strike', power: [100, 0] },
              { skill_type: 'HealDpByDamage', target_type: 'Self', power: [0.3, 0] },
            ],
          },
        ],
      };
    }
    return {};
  });
  const state = createBattleStateFromParty(party);
  state.turnState.enemyState.enemyCount = 3;

  const preview = previewTurn(state, {
    0: { characterId: 'M1', skillId: 18123 },
    1: { characterId: 'M2', skillId: 8001 },
    2: { characterId: 'M3', skillId: 8002 },
  });
  const { nextState, committedRecord } = commitTurn(state, preview);

  const actor = nextState.party.find((item) => item.characterId === 'M1');
  assert.equal(actor.tokenState.current, 0);
  const actorEntry = committedRecord.actions.find((item) => item.characterId === 'M1');
  assert.equal(
    actorEntry.dpChanges.some(
      (item) =>
        item.triggerType === 'HealDpByDamage' &&
        item.skillType === 'HealDpByDamage' &&
        item.targetCharacterId === 'M1' &&
        item.delta === 0 &&
        item.isAmountResolved === false
    ),
    true
  );
  assert.equal(
    committedRecord.dpEvents.some(
      (item) =>
        item.triggerType === 'HealDpByDamage' &&
        item.skillType === 'HealDpByDamage' &&
        item.characterId === 'M1'
    ),
    true
  );
});

test('SelfDamage lowers current DP by baseMax rate and records DP self-damage', () => {
  const party = createSixMemberManualParty((idx) =>
    idx === 0
      ? {
          dpState: {
            baseMaxDp: 100,
            currentDp: 100,
            effectiveDpCap: 100,
          },
          skills: [
            {
              id: 18125,
              name: 'Self Damage Slash',
              sp_cost: 0,
              target_type: 'Single',
              hit_count: 1,
              parts: [
                { skill_type: 'AttackSkill', target_type: 'Single', type: 'Slash', power: [100, 0] },
                { skill_type: 'SelfDamage', target_type: 'Self', power: [0.5, 0] },
              ],
            },
          ],
        }
      : {}
  );
  const state = createBattleStateFromParty(party);

  const preview = previewTurn(state, {
    0: { characterId: 'M1', skillId: 18125, targetEnemyIndex: 0 },
    1: { characterId: 'M2', skillId: 8001 },
    2: { characterId: 'M3', skillId: 8002 },
  });
  const { nextState, committedRecord } = commitTurn(state, preview);

  const actor = nextState.party.find((item) => item.characterId === 'M1');
  assert.equal(actor.dpState.currentDp, 50);
  const actorEntry = committedRecord.actions.find((item) => item.characterId === 'M1');
  assert.equal(
    actorEntry.dpChanges.some(
      (item) =>
        item.triggerType === 'SelfDpDamage' &&
        item.skillType === 'SelfDamage' &&
        item.targetCharacterId === 'M1' &&
        item.delta === -50 &&
        item.preDp === 100 &&
        item.postDp === 50 &&
        item.isAmountResolved === true
    ),
    true
  );
  assert.equal(
    committedRecord.dpEvents.some(
      (item) =>
        item.triggerType === 'SelfDpDamage' &&
        item.skillType === 'SelfDamage' &&
        item.characterId === 'M1' &&
        item.delta === -50
    ),
    true
  );
});

test('SelfDamage supports ally-targeted DP reduction skill parts', () => {
  const party = createSixMemberManualParty((idx) =>
    idx <= 2
      ? {
          dpState: {
            baseMaxDp: 70,
            currentDp: 70,
            effectiveDpCap: 70,
          },
          ...(idx === 0
            ? {
                skills: [
                  {
                    id: 18126,
                    name: 'Ally Damage Boost',
                    sp_cost: 0,
                    parts: [
                      { skill_type: 'AttackUp', target_type: 'AllyAll', power: [0.3, 0] },
                      { skill_type: 'SelfDamage', target_type: 'AllyFrontWithoutSelf', power: [0.3, 0] },
                    ],
                  },
                ],
              }
            : {}),
        }
      : {}
  );
  const state = createBattleStateFromParty(party);

  const preview = previewTurn(state, {
    0: { characterId: 'M1', skillId: 18126 },
    1: { characterId: 'M2', skillId: 8001 },
    2: { characterId: 'M3', skillId: 8002 },
  });
  const { nextState, committedRecord } = commitTurn(state, preview);

  assert.equal(nextState.party[0].dpState.currentDp, 70);
  assert.equal(nextState.party[1].dpState.currentDp, 49);
  assert.equal(nextState.party[2].dpState.currentDp, 49);
  const actorEntry = committedRecord.actions.find((item) => item.characterId === 'M1');
  assert.equal(
    actorEntry.dpChanges.filter((item) => item.triggerType === 'SelfDpDamage').length,
    2
  );
  assert.equal(
    actorEntry.dpChanges.some(
      (item) => item.triggerType === 'SelfDpDamage' && item.targetCharacterId === 'M2' && item.delta === -21
    ),
    true
  );
  assert.equal(
    actorEntry.dpChanges.some(
      (item) => item.triggerType === 'SelfDpDamage' && item.targetCharacterId === 'M3' && item.delta === -21
    ),
    true
  );
});

test('SelfDamage keeps 1 DP floor instead of auto-breaking on 100% cost', () => {
  const party = createSixMemberManualParty((idx) =>
    idx === 0
      ? {
          dpState: {
            baseMaxDp: 70,
            currentDp: 70,
            effectiveDpCap: 70,
          },
          skills: [
            {
              id: 18131,
              name: 'Full Cost',
              sp_cost: 0,
              parts: [{ skill_type: 'SelfDamage', target_type: 'Self', power: [1, 0] }],
            },
          ],
        }
      : {}
  );
  const state = createBattleStateFromParty(party);

  const preview = previewTurn(state, {
    0: { characterId: 'M1', skillId: 18131 },
    1: { characterId: 'M2', skillId: 8001 },
    2: { characterId: 'M3', skillId: 8002 },
  });
  const { nextState, committedRecord } = commitTurn(state, preview);

  assert.equal(nextState.party[0].dpState.currentDp, 1);
  assert.equal(
    committedRecord.actions[0].dpChanges.some(
      (item) =>
        item.triggerType === 'SelfDpDamage' &&
        item.targetCharacterId === 'M1' &&
        item.preDp === 70 &&
        item.postDp === 1 &&
        item.delta === -69
    ),
    true
  );
});

test('AttackByOwnDpRate exposes resolved multiplier from current DP rate', () => {
  const party = createSixMemberManualParty((idx) => {
    if (idx === 0) {
      return {
        dpState: {
          baseMaxDp: 70,
          currentDp: 35,
          effectiveDpCap: 70,
        },
        skills: [
          {
            id: 18127,
            name: 'Low DP Burst',
            sp_cost: 0,
            target_type: 'Single',
            hit_count: 1,
            parts: [
              {
                skill_type: 'AttackByOwnDpRate',
                target_type: 'Single',
                type: 'Strike',
                power: [100, 0],
                value: [1.75, 1.0],
              },
            ],
          },
        ],
      };
    }
    if (idx === 1) {
      return {
        dpState: {
          baseMaxDp: 70,
          currentDp: 84,
          effectiveDpCap: 84,
        },
        skills: [
          {
            id: 18128,
            name: 'High DP Burst',
            sp_cost: 0,
            target_type: 'Single',
            hit_count: 1,
            parts: [
              {
                skill_type: 'AttackByOwnDpRate',
                target_type: 'Single',
                type: 'Slash',
                power: [100, 0],
                value: [0.6, 1.5],
              },
            ],
          },
        ],
      };
    }
    return {};
  });
  const state = createBattleStateFromParty(party);

  const preview = previewTurn(state, {
    0: { characterId: 'M1', skillId: 18127, targetEnemyIndex: 0 },
    1: { characterId: 'M2', skillId: 18128, targetEnemyIndex: 0 },
    2: { characterId: 'M3', skillId: 8002 },
  });

  assert.equal(preview.actions[0].attackByOwnDpRateContext.startDpRate, 0.5);
  assert.equal(preview.actions[0].attackByOwnDpRateContext.referenceDpRate, 0.5);
  assert.equal(preview.actions[0].attackByOwnDpRateContext.resolvedMultiplier, 1.375);
  assert.equal(preview.actions[1].attackByOwnDpRateContext.startDpRate, 1.2);
  assert.equal(preview.actions[1].attackByOwnDpRateContext.referenceDpRate, 1);
  assert.equal(preview.actions[1].attackByOwnDpRateContext.resolvedMultiplier, 1.5);

  const { committedRecord } = commitTurn(state, preview);
  const lowDpEntry = committedRecord.actions.find((item) => item.characterId === 'M1');
  const highDpEntry = committedRecord.actions.find((item) => item.characterId === 'M2');

  assert.equal(lowDpEntry.damageContext.attackByOwnDpRateStartDpRate, 0.5);
  assert.equal(lowDpEntry.damageContext.attackByOwnDpRateResolvedMultiplier, 1.375);
  assert.equal(highDpEntry.damageContext.attackByOwnDpRateStartDpRate, 1.2);
  assert.equal(highDpEntry.damageContext.attackByOwnDpRateReferenceDpRate, 1);
  assert.equal(highDpEntry.damageContext.attackByOwnDpRateResolvedMultiplier, 1.5);
});

test('post-action DpRate changes are visible to additional-turn passive conditions', () => {
  const party = createSixMemberManualParty((idx) =>
    idx === 0
      ? {
          dpState: {
            baseMaxDp: 70,
            currentDp: 70,
            effectiveDpCap: 70,
          },
          passives: [
            {
              id: 18129,
              name: '破砕の残光',
              timing: 'OnAdditionalTurnStart',
              condition: 'DpRate()<=0.05',
              parts: [{ skill_type: 'HealEp', target_type: 'Self', power: [2, 0] }],
            },
          ],
          skills: [
            {
              id: 18130,
              name: 'Near Break',
              sp_cost: 0,
              additionalTurnRule: {
                skillUsableInExtraTurn: true,
                additionalTurnGrantInExtraTurn: true,
                conditions: {
                  requiresOverDrive: false,
                  requiresReinforcedMode: false,
                  excludesExtraTurnForSkillUse: false,
                  excludesExtraTurnForAdditionalTurnGrant: false,
                },
                additionalTurnTargetTypes: ['Self'],
              },
              parts: [
                { skill_type: 'SelfDamage', target_type: 'Self', power: [1, 0] },
                { skill_type: 'AdditionalTurn', target_type: 'Self' },
              ],
            },
          ],
        }
      : {}
  );
  const state = createBattleStateFromParty(party);

  const preview = previewTurn(state, {
    0: { characterId: 'M1', skillId: 18130 },
    1: { characterId: 'M2', skillId: 8001 },
    2: { characterId: 'M3', skillId: 8002 },
  });
  const { nextState, committedRecord } = commitTurn(state, preview);

  const actor = nextState.party.find((item) => item.characterId === 'M1');
  assert.equal(nextState.turnState.turnType, 'extra');
  assert.equal(actor.dpState.currentDp, 1);
  assert.equal(actor.ep.current, 2);
  assert.equal(
    (committedRecord.actions[0].dpChanges ?? []).some(
      (item) => item.triggerType === 'SelfDpDamage' && item.targetCharacterId === 'M1' && item.postDp === 1
    ),
    true
  );
  assert.equal(
    (nextState.turnState.passiveEventsLastApplied ?? []).some(
      (item) => item.timing === 'OnAdditionalTurnStart' && item.passiveName === '破砕の残光'
    ),
    true
  );
});

test('Token() condition can trigger passives from current token state', () => {
  const party = createSixMemberManualParty((idx) =>
    idx === 0
      ? {
          initialSP: 1,
          initialToken: 3,
          passives: [
            {
              id: 18130,
              name: 'Token Heal',
              desc: '行動開始時 トークン3以上なら自身のSP+2',
              timing: 'OnPlayerTurnStart',
              condition: 'Token()>=3',
              parts: [{ skill_type: 'HealSp', target_type: 'Self', power: [2, 0] }],
            },
          ],
        }
      : {}
  );
  const state = createBattleStateFromParty(party);
  const result = applyPassiveTiming(state, 'OnPlayerTurnStart');

  assert.equal(result.spEvents.length, 1);
  assert.equal(state.party.find((item) => item.characterId === 'M1').sp.current, 3);
});

test('TokenAttack exposes token-based attack context on preview action', () => {
  const party = createSixMemberManualParty((idx) =>
    idx === 0
      ? {
          initialToken: 4,
          skills: [
            {
              id: 18140,
              name: 'Token Attack',
              sp_cost: 13,
              target_type: 'All',
              hit_count: 1,
              parts: [
                { skill_type: 'TokenAttack', target_type: 'All', power: [4177.5, 8355], value: [0.16, 0] },
                { skill_type: 'TokenChangeTimeline', target_type: 'All', power: [0, 0], value: [0, 0] },
              ],
            },
          ],
        }
      : {}
  );
  const state = createBattleStateFromParty(party);
  state.turnState.enemyState.enemyCount = 3;

  const preview = previewTurn(state, {
    0: { characterId: 'M1', skillId: 18140 },
    1: { characterId: 'M2', skillId: 8001 },
    2: { characterId: 'M3', skillId: 8002 },
  });
  const entry = preview.actions.find((item) => item.characterId === 'M1');

  assert.equal(entry.tokenAttackContext.tokenCount, 4);
  assert.equal(entry.tokenAttackContext.ratePerToken, 0.16);
  assert.equal(entry.tokenAttackContext.totalRate, 0.64);
});

test('TokenAttack context is preserved into committed damage context', () => {
  const party = createSixMemberManualParty((idx) =>
    idx === 0
      ? {
          initialToken: 5,
          skills: [
            {
              id: 18141,
              name: 'Token Attack',
              sp_cost: 13,
              target_type: 'Single',
              hit_count: 1,
              parts: [
                { skill_type: 'TokenAttack', target_type: 'Single', power: [5445, 10890], value: [0.16, 0] },
              ],
            },
          ],
        }
      : {}
  );
  const state = createBattleStateFromParty(party);

  const preview = previewTurn(state, {
    0: { characterId: 'M1', skillId: 18141, targetEnemyIndex: 0 },
    1: { characterId: 'M2', skillId: 8001 },
    2: { characterId: 'M3', skillId: 8002 },
  });
  const { committedRecord } = commitTurn(state, preview);
  const entry = committedRecord.actions.find((item) => item.characterId === 'M1');

  assert.equal(entry.damageContext.tokenAttackTokenCount, 5);
  assert.equal(entry.damageContext.tokenAttackRatePerToken, 0.16);
  assert.equal(entry.damageContext.tokenAttackTotalRate, 0.8);
});

test('TokenSetByAttacked grants token when enemy attack trigger is applied to the target member', () => {
  const party = createSixMemberManualParty((idx) =>
    idx === 0
      ? {
          passives: [
            {
              id: 18150,
              name: '護りの真髄',
              timing: 'OnFirstBattleStart',
              condition: '',
              parts: [{ skill_type: 'TokenSetByAttacked', target_type: 'Self', power: [1, 0] }],
            },
          ],
        }
      : {}
  );
  const state = createBattleStateFromParty(party);

  const events = applyEnemyAttackTokenTriggers(state, ['M1']);
  const member = state.party.find((item) => item.characterId === 'M1');

  assert.equal(events.length, 1);
  assert.equal(events[0].triggerType, 'TokenSetByAttacked');
  assert.equal(member.tokenState.current, 1);
});

test('commitTurn records enemy attack token triggers when attacked targets are provided', () => {
  const party = createSixMemberManualParty((idx) =>
    idx === 0
      ? {
          passives: [
            {
              id: 18151,
              name: '護りの真髄',
              timing: 'OnFirstBattleStart',
              condition: '',
              parts: [{ skill_type: 'TokenSetByAttacked', target_type: 'Self', power: [1, 0] }],
            },
          ],
        }
      : {}
  );
  const state = createBattleStateFromParty(party);
  const preview = previewTurn(state, {
    0: { characterId: 'M1', skillId: 8000, targetEnemyIndex: 0 },
    1: { characterId: 'M2', skillId: 8001, targetEnemyIndex: 0 },
    2: { characterId: 'M3', skillId: 8002, targetEnemyIndex: 0 },
  });

  const { nextState, committedRecord } = commitTurn(state, preview, [], {
    enemyAttackTargetCharacterIds: ['M1'],
  });
  const member = nextState.party.find((item) => item.characterId === 'M1');

  assert.equal(member?.tokenState.current, 1);
  assert.deepEqual(committedRecord.enemyAttackTargetCharacterIds, ['M1']);
  assert.equal(committedRecord.enemyAttackEvents.length, 1);
  assert.equal(committedRecord.enemyAttackEvents[0].characterId, 'M1');
  assert.equal(committedRecord.enemyAttackEvents[0].triggerType, 'TokenSetByAttacked');
  assert.equal(committedRecord.enemyAttackEvents[0].delta, 1);
  assert.equal(
    committedRecord.passiveEvents.some(
      (event) =>
        event.characterId === 'M1' &&
        event.triggerType === 'TokenSetByAttacked' &&
        event.source === 'enemy_attack' &&
        event.tokenDelta === 1
    ),
    true
  );
});

test('DamageRateUpPerToken is exposed on preview action modifiers', () => {
  const party = createSixMemberManualParty((idx) =>
    idx === 0
      ? {
          initialToken: 3,
          passives: [
            {
              id: 18160,
              name: '奮起',
              timing: 'OnPlayerTurnStart',
              condition: '',
              parts: [{ skill_type: 'DamageRateUpPerToken', target_type: 'AllyAll', power: [0.03, 0] }],
            },
          ],
        }
      : {}
  );
  const state = createBattleStateFromParty(party);

  const preview = previewTurn(state, {
    0: { characterId: 'M1', skillId: 8000 },
    1: { characterId: 'M2', skillId: 8001 },
    2: { characterId: 'M3', skillId: 8002 },
  });

  assert.equal(preview.actions[0].specialPassiveModifiers.damageRateUpRate, 0.09);
  assert.equal(
    preview.actions[0].specialPassiveEvents.some((event) => event.damageRateUpRate === 0.09),
    true
  );
});

test('OverDrivePointUpByToken increases od gauge gain by token count', () => {
  const party = createSixMemberManualParty((idx) =>
    idx === 0
      ? {
          initialToken: 3,
          skills: [
            {
              id: 18161,
              name: 'Token OD Up',
              sp_cost: 0,
              target_type: 'Self',
              hit_count: 0,
              parts: [
                { skill_type: 'OverDrivePointUpByToken', target_type: 'Self', power: [0.1, 0] },
              ],
            },
          ],
        }
      : {}
  );
  const state = createBattleStateFromParty(party);

  const preview = previewTurn(state, {
    0: { characterId: 'M1', skillId: 18161 },
    1: { characterId: 'M2', skillId: 8001 },
    2: { characterId: 'M3', skillId: 8002 },
  });
  const { committedRecord } = commitTurn(state, preview);
  const entry = committedRecord.actions.find((item) => item.characterId === 'M1');

  assert.equal(entry.odGaugeGain, 30);
  assert.equal(entry.damageContext.overDrivePointUpByTokenPerToken, 0.1);
  assert.equal(entry.damageContext.overDrivePointUpByTokenTokenCount, 3);
  assert.equal(entry.damageContext.overDrivePointUpByTokenTotalPercent, 30);
});

test('Morale skill part raises target morale and clamps at max 10', () => {
  const party = createSixMemberManualParty((idx) =>
    idx === 0
      ? {
          skills: [
            {
              id: 18200,
              name: 'Morale Up',
              sp_cost: 0,
              target_type: 'AllyAll',
              parts: [{ skill_type: 'Morale', target_type: 'AllyAll', power: [2, 0] }],
            },
          ],
        }
      : idx === 1
        ? { initialMorale: 9 }
        : {}
  );
  const state = createBattleStateFromParty(party);

  const preview = previewTurn(state, {
    0: { characterId: 'M1', skillId: 18200 },
    1: { characterId: 'M2', skillId: 8001 },
    2: { characterId: 'M3', skillId: 8002 },
  });
  const { nextState, committedRecord } = commitTurn(state, preview);

  assert.equal(nextState.party[0].moraleState.current, 2);
  assert.equal(nextState.party[1].moraleState.current, 10);
  const committed = committedRecord.actions.find((item) => item.characterId === 'M2');
  assert.equal(committed.moraleChanges.some((item) => item.triggerType === 'Morale' && item.delta === 1), true);
});

test('Morale consume_type spends current morale instead of SP', () => {
  const party = createSixMemberManualParty((idx) =>
    idx === 0
      ? {
          initialSP: 9,
          initialMorale: 6,
          skills: [
            {
              id: 18205,
              name: 'Morale Burst',
              sp_cost: 4,
              consume_type: 'Morale',
              target_type: 'Single',
              parts: [{ skill_type: 'AttackSkill', target_type: 'Single', type: 'Strike' }],
            },
          ],
        }
      : {}
  );
  const state = createBattleStateFromParty(party);

  const preview = previewTurn(state, {
    0: { characterId: 'M1', skillId: 18205, targetEnemyIndex: 0 },
    1: { characterId: 'M2', skillId: 8001 },
    2: { characterId: 'M3', skillId: 8002 },
  });
  assert.equal(preview.actions[0].startSP, 9);
  assert.equal(preview.actions[0].endSP, 9);
  const { nextState, committedRecord } = commitTurn(state, preview);
  const entry = committedRecord.actions.find((item) => item.characterId === 'M1');

  assert.equal(entry.startMorale, 6);
  assert.equal(entry.endMorale, 2);
  assert.equal(nextState.party[0].moraleState.current, 2);
  assert.equal((entry.moraleChanges ?? []).some((item) => item.source === 'cost' && item.delta === -4), true);
});

test('MoraleLevel condition can trigger passives from current morale state', () => {
  const party = createSixMemberManualParty((idx) =>
    idx === 0
      ? {
          initialSP: 1,
          initialMorale: 6,
          passives: [
            {
              id: 18210,
              name: 'Morale Heal',
              timing: 'OnPlayerTurnStart',
              condition: 'MoraleLevel()>=6',
              parts: [{ skill_type: 'HealSp', target_type: 'Self', power: [2, 0] }],
            },
          ],
        }
      : {}
  );
  const state = createBattleStateFromParty(party);
  const result = applyPassiveTiming(state, 'OnPlayerTurnStart');

  assert.equal(result.spEvents.length, 1);
  assert.equal(state.party[0].sp.current, 3);
});

test('MoraleLevel works inside CountBC player predicates', () => {
  const party = createSixMemberManualParty((idx) =>
    idx === 0
      ? {
          characterId: 'EAoi',
          characterName: '青井',
          initialSP: 1,
          initialMorale: 6,
          passives: [
            {
              id: 18211,
              name: '夢中',
              timing: 'OnPlayerTurnStart',
              condition: 'CountBC(IsPlayer()==1&&IsCharacter(EAoi)==1&&MoraleLevel()>=6)>0',
              parts: [{ skill_type: 'HealSp', target_type: 'Self', power: [2, 0] }],
            },
          ],
        }
      : {}
  );
  const state = createBattleStateFromParty(party);
  const result = applyPassiveTiming(state, 'OnPlayerTurnStart');

  assert.equal(result.spEvents.length, 1);
  assert.equal(state.party[0].sp.current, 3);
});

test('DpRate condition can trigger passives from current DP state', () => {
  const party = createSixMemberManualParty((idx) =>
    idx === 0
      ? {
          initialSP: 1,
          baseMaxDp: 70,
          currentDp: 84,
          effectiveDpCap: 98,
          passives: [
            {
              id: 18212,
              name: 'Dp Heal',
              timing: 'OnPlayerTurnStart',
              condition: 'DpRate()>=1.01',
              parts: [{ skill_type: 'HealSp', target_type: 'Self', power: [2, 0] }],
            },
          ],
        }
      : { baseMaxDp: 70 }
  );
  const state = createBattleStateFromParty(party);
  const result = applyPassiveTiming(state, 'OnPlayerTurnStart');

  assert.equal(result.spEvents.length, 1);
  assert.equal(state.party[0].sp.current, 3);
});

test('DpRate works inside CountBC player predicates', () => {
  const party = createSixMemberManualParty((idx) =>
    idx === 0
      ? {
          initialSP: 1,
          baseMaxDp: 70,
          currentDp: 70,
          passives: [
            {
              id: 18213,
              name: 'Dp Count Heal',
              timing: 'OnPlayerTurnStart',
              condition: 'CountBC(IsPlayer()==1&&DpRate()>=1.0)>0',
              parts: [{ skill_type: 'HealSp', target_type: 'Self', power: [2, 0] }],
            },
          ],
        }
      : { baseMaxDp: 70 }
  );
  const state = createBattleStateFromParty(party);
  const result = applyPassiveTiming(state, 'OnPlayerTurnStart');

  assert.equal(result.spEvents.length, 1);
  assert.equal(state.party[0].sp.current, 3);
});

test('OnEveryTurn passive HealDpRate updates DP state when DpRate condition matches', () => {
  const party = createSixMemberManualParty((idx) =>
    idx === 0
      ? {
          baseMaxDp: 70,
          currentDp: 35,
          passives: [
            {
              id: 18214,
              name: '気合',
              timing: 'OnEveryTurn',
              condition: 'DpRate()<=0.5 && IsFront()',
              parts: [{ skill_type: 'HealDpRate', target_type: 'Self', power: [0.15, 0] }],
            },
          ],
        }
      : { baseMaxDp: 70 }
  );
  const state = createBattleStateFromParty(party);
  const result = applyPassiveTiming(state, 'OnEveryTurn');

  assert.equal(result.dpEvents.length, 1);
  assert.ok(Math.abs(state.party[0].dpState.currentDp - 45.5) < 1e-9);
  assert.ok(
    result.passiveEvents.some(
      (event) => event.passiveName === '気合' && Math.abs(Number(event.dpDelta ?? 0) - 10.5) < 1e-9
    )
  );
});

test('applyInitialPassiveState applies OnPlayerTurnStart HealDpRate passive when DpRate condition matches', () => {
  const party = createSixMemberManualParty((idx) =>
    idx === 0
      ? {
          baseMaxDp: 70,
          currentDp: 35,
          passives: [
            {
              id: 18217,
              name: '静養',
              timing: 'OnPlayerTurnStart',
              condition: 'DpRate()<=0.5 && IsFront()',
              parts: [{ skill_type: 'HealDpRate', target_type: 'Self', power: [0.2, 0] }],
            },
          ],
        }
      : { baseMaxDp: 70 }
  );
  const state = createBattleStateFromParty(party);

  applyInitialPassiveState(state);

  assert.equal(state.party[0].dpState.currentDp, 49);
  assert.ok(
    state.turnState.passiveEventsLastApplied.some(
      (event) => event.passiveName === '静養' && Math.abs(Number(event.dpDelta ?? 0) - 14) < 1e-9
    )
  );
});

test('ReviveDpRate passive revives broken self only once when limit is 1', () => {
  const party = createSixMemberManualParty((idx) =>
    idx === 0
      ? {
          baseMaxDp: 70,
          currentDp: 0,
          passives: [
            {
              id: 18215,
              name: 'くじけぬ心',
              timing: 'OnEveryTurn',
              condition: 'DpRate()==0.0 && IsFront()',
              limit: 1,
              parts: [{ skill_type: 'ReviveDpRate', target_type: 'Self', power: [0.5, 0] }],
            },
          ],
        }
      : { baseMaxDp: 70 }
  );
  const state = createBattleStateFromParty(party);

  const first = applyPassiveTiming(state, 'OnEveryTurn');
  assert.equal(first.dpEvents.length, 1);
  assert.equal(state.party[0].dpState.currentDp, 35);

  state.party[0].setDpState({ currentDp: 0 });
  const second = applyPassiveTiming(state, 'OnEveryTurn');
  assert.equal(second.dpEvents.length, 0);
  assert.equal(second.passiveEvents.length, 0);
  assert.equal(state.party[0].dpState.currentDp, 0);
});

test('commitTurn applies OnEnemyTurnStart HealDpRate passive when base turn advances', () => {
  const party = createSixMemberManualParty((idx) =>
    idx === 0
      ? {
          baseMaxDp: 70,
          currentDp: 35,
          passives: [
            {
              id: 18218,
              name: '充填',
              timing: 'OnEnemyTurnStart',
              condition: 'DpRate()<=0.5 && IsFront()',
              parts: [{ skill_type: 'HealDpRate', target_type: 'Self', power: [0.1, 0] }],
            },
          ],
        }
      : { baseMaxDp: 70 }
  );
  const state = createBattleStateFromParty(party);
  const preview = previewTurn(state, {
    0: { characterId: 'M1', skillId: 8000, targetEnemyIndex: 0 },
    1: { characterId: 'M2', skillId: 8001 },
    2: { characterId: 'M3', skillId: 8002 },
  });

  const { nextState, committedRecord } = commitTurn(state, preview);

  assert.equal(nextState.party[0].dpState.currentDp, 42);
  assert.equal(
    committedRecord.passiveEvents.some(
      (event) => event.timing === 'OnEnemyTurnStart' && event.passiveName === '充填' && event.dpDelta === 7
    ),
    true
  );
  assert.equal(
    committedRecord.dpEvents.some(
      (event) => event.source === 'dp_passive' && event.passiveName === '充填' && event.delta === 7
    ),
    true
  );
});

test('unsupported OnEnemyTurnStart DefenseUp passive logs only when DpRate condition matches', () => {
  const createParty = (currentDp) =>
    createSixMemberManualParty((idx) =>
      idx === 0
        ? {
            baseMaxDp: 70,
            currentDp,
            passives: [
              {
                id: 18216,
                name: '堅忍',
                timing: 'OnEnemyTurnStart',
                condition: 'DpRate()==0.0 && IsFront()',
                parts: [{ skill_type: 'DefenseUp', target_type: 'Self', power: [0.5, 0] }],
              },
            ],
          }
        : { baseMaxDp: 70 }
    );

  const highState = createBattleStateFromParty(createParty(0));
  const highResult = applyPassiveTiming(highState, 'OnEnemyTurnStart');
  assert.ok(
    highResult.passiveEvents.some(
      (event) => event.passiveName === '堅忍' && event.unsupportedEffectTypes?.includes('DefenseUp')
    )
  );

  const lowState = createBattleStateFromParty(createParty(70));
  const lowResult = applyPassiveTiming(lowState, 'OnEnemyTurnStart');
  assert.equal(lowResult.passiveEvents.length, 0);
});

test('Morale skill variants resolve low and high morale branches without blocking use', () => {
  const createParty = (morale) =>
    createSixMemberManualParty((idx) =>
      idx === 0
        ? {
            characterId: 'KHiiragi',
            characterName: '柊',
            initialMorale: morale,
            skills: [
              {
                id: 18220,
                name: '邪眼・マリンスラッシュ',
                sp_cost: 16,
                target_type: 'All',
                iuc_cond: 'MoraleLevel()>=6',
                overwrite_cond: 'CountBC(IsPlayer()==1&&IsCharacter(KHiiragi)==1&&MoraleLevel()>=6)>0',
                parts: [
                  {
                    skill_type: 'SkillCondition',
                    target_type: 'All',
                    cond: 'CountBC(IsPlayer()==1&&IsCharacter(KHiiragi)==1&&MoraleLevel()>=6)>0',
                    strval: [
                      {
                        id: 18221,
                        name: 'high',
                        sp_cost: 8,
                        target_type: 'All',
                        parts: [{ skill_type: 'AttackSkill', target_type: 'All', type: 'Slash' }],
                      },
                      {
                        id: 18222,
                        name: 'low',
                        sp_cost: 16,
                        target_type: 'All',
                        parts: [{ skill_type: 'AttackSkill', target_type: 'All', type: 'Slash' }],
                      },
                    ],
                  },
                ],
              },
            ],
          }
        : {}
    );

  const lowPreview = previewTurn(createBattleStateFromParty(createParty(0)), {
    0: { characterId: 'KHiiragi', skillId: 18220 },
    1: { characterId: 'M2', skillId: 8001 },
    2: { characterId: 'M3', skillId: 8002 },
  });
  assert.equal(lowPreview.actions[0].spCost, 16);

  const highPreview = previewTurn(createBattleStateFromParty(createParty(6)), {
    0: { characterId: 'KHiiragi', skillId: 18220 },
    1: { characterId: 'M2', skillId: 8001 },
    2: { characterId: 'M3', skillId: 8002 },
  });
  assert.equal(highPreview.actions[0].spCost, 8);
});

test('SkillCondition supports reversed DpRate comparison clauses', () => {
  const createParty = (currentDp) =>
    createSixMemberManualParty((idx) =>
      idx === 0
        ? {
            characterId: 'KDpRate',
            characterName: 'DP条件役',
            initialSP: 20,
            baseMaxDp: 70,
            currentDp,
            skills: [
              {
                id: 18230,
                name: 'Dp Reverse Branch',
                sp_cost: 10,
                target_type: 'Single',
                parts: [
                  {
                    skill_type: 'SkillCondition',
                    cond: '0.0 < DpRate()',
                    strval: [
                      {
                        id: 18231,
                        name: 'high',
                        sp_cost: 0,
                        target_type: 'Single',
                        parts: [{ skill_type: 'AttackSkill', target_type: 'Single', type: 'Slash' }],
                      },
                      {
                        id: 18232,
                        name: 'low',
                        sp_cost: 10,
                        target_type: 'Single',
                        parts: [{ skill_type: 'AttackSkill', target_type: 'Single', type: 'Slash' }],
                      },
                    ],
                  },
                ],
              },
            ],
          }
        : { baseMaxDp: 70 }
    );

  const zeroPreview = previewTurn(createBattleStateFromParty(createParty(0)), {
    0: { characterId: 'KDpRate', skillId: 18230 },
    1: { characterId: 'M2', skillId: 8001 },
    2: { characterId: 'M3', skillId: 8002 },
  });
  assert.equal(zeroPreview.actions[0].spCost, 10);

  const highPreview = previewTurn(createBattleStateFromParty(createParty(35)), {
    0: { characterId: 'KDpRate', skillId: 18230 },
    1: { characterId: 'M2', skillId: 8001 },
    2: { characterId: 'M3', skillId: 8002 },
  });
  assert.equal(highPreview.actions[0].spCost, 0);
});

test('MotivationLevel condition can trigger passives from current motivation state', () => {
  const party = createSixMemberManualParty((idx) =>
    idx === 0
      ? {
          initialSP: 1,
          initialMotivation: 5,
          passives: [
            {
              id: 18225,
              name: 'Motivation Heal',
              timing: 'OnPlayerTurnStart',
              condition: 'MotivationLevel()>=4',
              parts: [{ skill_type: 'HealSp', target_type: 'Self', power: [2, 0] }],
            },
          ],
        }
      : {}
  );
  const state = createBattleStateFromParty(party);
  const result = applyPassiveTiming(state, 'OnPlayerTurnStart');

  assert.equal(result.spEvents.length, 1);
  assert.equal(state.party[0].sp.current, 3);
});

test('ThunderMark skill part does not mutate intrinsic thunder mark levels', () => {
  const party = createSixMemberManualParty((idx) => {
    if (idx === 0) {
      return {
        elements: ['Thunder'],
        skills: [
          {
            id: 18600,
            name: 'Thunder Mark Up',
            sp_cost: 0,
            parts: [
              {
                skill_type: 'ThunderMark',
                target_type: 'AllyAll',
                power: [2, 0],
                target_condition: 'IsNatureElement(Thunder)==1',
              },
            ],
          },
        ],
      };
    }
    if (idx === 1) {
      return {
        elements: ['Thunder'],
        skills: [
          {
            id: 18601,
            name: 'プロテクション',
            sp_cost: 0,
            target_type: 'Self',
            parts: [{ skill_type: 'BuffDefence', target_type: 'Self', type: 'None' }],
          },
        ],
      };
    }
    if (idx === 2) {
      return {
        elements: ['Fire'],
        skills: [
          {
            id: 18602,
            name: 'プロテクション',
            sp_cost: 0,
            target_type: 'Self',
            parts: [{ skill_type: 'BuffDefence', target_type: 'Self', type: 'None' }],
          },
        ],
      };
    }
    return {};
  });
  const state = createBattleStateFromParty(party);
  const preview = previewTurn(state, {
    0: { characterId: 'M1', skillId: 18600 },
    1: { characterId: 'M2', skillId: 18601 },
    2: { characterId: 'M3', skillId: 18602 },
  });

  const { nextState } = commitTurn(state, preview);
  assert.equal(nextState.party[0].markStates.Thunder.current, 2);
  assert.equal(nextState.party[1].markStates.Thunder.current, 2);
  assert.equal(nextState.party[2].markStates.Thunder.current, 0);
});

test('intrinsic mark levels are initialized from party element counts at battle start', () => {
  const party = createSixMemberManualParty((idx) => {
    if (idx <= 2) {
      return { elements: ['Fire'] };
    }
    if (idx === 3) {
      return { elements: ['Thunder'] };
    }
    return {};
  });

  const state = createBattleStateFromParty(party);

  assert.equal(state.party[0].markStates.Fire.current, 3);
  assert.equal(state.party[1].markStates.Fire.current, 3);
  assert.equal(state.party[2].markStates.Fire.current, 3);
  assert.equal(state.party[3].markStates.Thunder.current, 1);
  assert.equal(state.party[4].markStates.Fire.current, 0);
});

test('DarkMarkLevel condition can trigger passives from current dark mark state', () => {
  const party = createSixMemberManualParty((idx) =>
    idx === 0
      ? {
          markStates: {
            Dark: { current: 6, min: 0, max: 6 },
          },
          passives: [
            {
              id: 18610,
              name: 'Dark Mark Passive',
              timing: 'OnEveryTurn',
              condition: 'DarkMarkLevel()>=6',
              parts: [{ skill_type: 'HealSp', target_type: 'Self', power: [1, 0] }],
            },
          ],
        }
      : {}
  );
  const state = createBattleStateFromParty(party);
  const result = applyPassiveTiming(state, 'OnEveryTurn');

  assert.equal(result.spEvents.length, 1);
  assert.equal(result.spEvents[0]?.characterId, 'M1');
  assert.equal(result.spEvents[0]?.delta, 1);
});

test('LightMark passive timing keeps intrinsic light mark state unchanged at battle start', () => {
  const party = createSixMemberManualParty((idx) =>
    idx === 0
      ? {
          elements: ['Light'],
          passives: [
            {
              id: 18620,
              name: 'Light Mark Start',
              timing: 'OnBattleStart',
              condition: '',
              parts: [{ skill_type: 'LightMark', target_type: 'Self', power: [3, 0] }],
            },
          ],
        }
      : {}
  );
  const state = createBattleStateFromParty(party);
  const result = applyPassiveTiming(state, 'OnBattleStart');

  assert.equal(state.party[0].markStates.Light.current, 1);
  assert.equal(result.passiveEvents.length, 0);
});

test('猛火の進撃 grants ally-wide SP+5 when fire mark level is 6 or higher', () => {
  const store = getStore();
  const passive = store
    .listPassivesByStyleId(1004307, { limitBreakLevel: 3 })
    .find((item) => String(item.name ?? '') === '猛火の進撃');
  assert.ok(passive);

  const party = createSixMemberManualParty((idx) =>
    idx === 0
      ? {
          initialSP: 0,
          markStates: {
            Fire: { current: 6, min: 0, max: 6 },
          },
          passives: [passive],
        }
      : { initialSP: 0 }
  );
  const state = createBattleStateFromParty(party);
  const result = applyPassiveTiming(state, 'OnEveryTurn');

  assert.deepEqual(
    state.party.map((member) => member.sp.current),
    [5, 5, 5, 5, 5, 5]
  );
  assert.equal(result.spEvents.length, 6);
  assert.equal(result.passiveEvents[0]?.passiveName, '猛火の進撃');
});

test('猛火の進撃 triggers only once per sortie when passive limit is 1', () => {
  const store = getStore();
  const passive = store
    .listPassivesByStyleId(1004307, { limitBreakLevel: 3 })
    .find((item) => String(item.name ?? '') === '猛火の進撃');
  assert.ok(passive);

  const party = createSixMemberManualParty((idx) =>
    idx === 0
      ? {
          initialSP: 0,
          markStates: {
            Fire: { current: 6, min: 0, max: 6 },
          },
          passives: [passive],
        }
      : { initialSP: 0 }
  );
  const state = createBattleStateFromParty(party);

  const first = applyPassiveTiming(state, 'OnEveryTurn');
  const second = applyPassiveTiming(state, 'OnEveryTurn');

  assert.deepEqual(
    state.party.map((member) => member.sp.current),
    [5, 5, 5, 5, 5, 5]
  );
  assert.equal(first.spEvents.length, 6);
  assert.equal(second.spEvents.length, 0);
  assert.equal(first.passiveEvents.some((event) => event.passiveName === '猛火の進撃'), true);
  assert.equal(second.passiveEvents.some((event) => event.passiveName === '猛火の進撃'), false);
});

test('夏のひより party keeps intrinsic fire marks only on fire-element allies', () => {
  const store = getStore();
  const styleIds = [1004307, 1001104, 1001204, 1001504, 1001401, 1001701];
  assert.equal(styleIds.length, 6);

  const party = store.buildPartyFromStyleIds(styleIds, {
    initialSP: 10,
    limitBreakLevelsByPartyIndex: { 0: 3 },
  });
  const state = createBattleStateFromParty(party);

  applyInitialPassiveState(state);

  for (const member of state.party) {
    const expected = member.elements.includes('Fire') ? 4 : 0;
    assert.equal(Number(member.markStates?.Fire?.current ?? 0), expected, member.styleName);
  }
  assert.equal(
    state.turnState.passiveEventsLastApplied.some((event) => event.passiveName === '夏のひより'),
    false
  );
});

test('夏のひより alone does not satisfy 猛火の進撃 fire mark threshold', () => {
  const store = getStore();
  const styleIds = [1004307, 1001104, 1001204, 1001504, 1001401, 1001701];
  assert.equal(styleIds.length, 6);

  const party = store.buildPartyFromStyleIds(styleIds, {
    initialSP: 10,
    limitBreakLevelsByPartyIndex: { 0: 3 },
  });
  const state = createBattleStateFromParty(party);

  applyInitialPassiveState(state);
  const result = applyPassiveTiming(state, 'OnEveryTurn');

  assert.equal(Number(state.party[0].markStates?.Fire?.current ?? 0), 4);
  assert.equal(result.passiveEvents.some((event) => event.passiveName === '猛火の進撃'), false);
});

test('fire mark intrinsic level 6 grants extra SP only to frontline fire styles at battle start', () => {
  const party = createSixMemberManualParty((idx) =>
    idx <= 3
      ? {
          initialSP: 0,
          elements: ['Fire'],
          markStates: {
            Fire: { current: 6, min: 0, max: 6 },
          },
        }
      : {
          initialSP: 0,
          elements: idx === 4 ? ['Fire'] : [],
          markStates: {
            Fire: { current: idx === 4 ? 6 : 0, min: 0, max: 6 },
          },
        }
  );
  const state = createBattleStateFromParty(party);

  applyInitialPassiveState(state);

  assert.deepEqual(
    state.party.map((member) => member.sp.current),
    [1, 1, 1, 0, 0, 0]
  );
});

test('six-fire real-data opening SP includes fire mark level 6 recovery before turn-start passives', () => {
  const store = getStore();
  const styleIds = [1004307, 1001206, 1001106, 1001506, 1002405, 1004206];
  const party = store.buildPartyFromStyleIds(styleIds, {
    initialSP: 6,
    startSpEquipByPartyIndex: { 0: 3, 1: 3, 2: 3, 3: 3, 4: 3, 5: 3 },
    limitBreakLevelsByPartyIndex: { 0: 4 },
  });
  const state = createBattleStateFromParty(party);

  applyInitialPassiveState(state);

  assert.deepEqual(
    state.party.map((member) => member.sp.current),
    [13, 12, 12, 11, 11, 11]
  );
});

test('fire mark intrinsic modifiers are exposed on preview and damage context', () => {
  const party = createSixMemberManualParty((idx) =>
    idx === 0
      ? {
          initialSP: 10,
          elements: ['Fire'],
          markStates: {
            Fire: { current: 5, min: 0, max: 6 },
          },
          skills: [
            {
              id: 8401,
              name: '火炎斬',
              label: 'FireSlash',
              sp_cost: 4,
              hit_count: 2,
              target_type: 'Single',
              parts: [
                {
                  skill_type: 'AttackSkill',
                  target_type: 'Single',
                  type: 'Slash',
                  elements: ['Fire'],
                  power: [1.0, 0],
                },
              ],
            },
          ],
        }
      : {}
  );
  const state = createBattleStateFromParty(party);

  const preview = previewTurn(state, {
    0: { characterId: 'M1', skillId: 8401 },
  });

  assert.equal(preview.actions[0].specialPassiveModifiers?.markAttackUpRate, 0.3);
  assert.equal(preview.actions[0].specialPassiveModifiers?.markDamageTakenDownRate, 0.1);
  assert.equal(preview.actions[0].specialPassiveModifiers?.markDevastationRateUp, 0.1);
  assert.equal(preview.actions[0].specialPassiveModifiers?.markCriticalRateUp, 0.3);
  assert.equal(preview.actions[0].specialPassiveModifiers?.markCriticalDamageUp, 0.3);
  assert.equal(preview.actions[0].specialPassiveModifiers?.attackUpRate, 0.3);

  const { committedRecord } = commitTurn(state, preview);
  assert.equal(committedRecord.actions[0].damageContext?.markAttackUpRate, 0.3);
  assert.equal(committedRecord.actions[0].damageContext?.markDamageTakenDownRate, 0.1);
  assert.equal(committedRecord.actions[0].damageContext?.markDevastationRateUp, 0.1);
  assert.equal(committedRecord.actions[0].damageContext?.markCriticalRateUp, 0.3);
  assert.equal(committedRecord.actions[0].damageContext?.markCriticalDamageUp, 0.3);
});

test('thunder mark intrinsic level 6 grants extra SP only to frontline thunder styles at battle start', () => {
  const party = createSixMemberManualParty((idx) =>
    idx <= 3
      ? {
          initialSP: 0,
          elements: ['Thunder'],
          markStates: {
            Thunder: { current: 6, min: 0, max: 6 },
          },
        }
      : {
          initialSP: 0,
          elements: idx === 4 ? ['Thunder'] : [],
          markStates: {
            Thunder: { current: idx === 4 ? 6 : 0, min: 0, max: 6 },
          },
        }
  );
  const state = createBattleStateFromParty(party);

  applyInitialPassiveState(state);

  assert.deepEqual(
    state.party.map((member) => member.sp.current),
    [1, 1, 1, 0, 0, 0]
  );
});

test('dark and light mark intrinsic modifiers are exposed on preview and damage context', () => {
  const party = createSixMemberManualParty((idx) =>
    idx === 0
      ? {
          initialSP: 10,
          elements: ['Dark', 'Light'],
          markStates: {
            Dark: { current: 4, min: 0, max: 6 },
            Light: { current: 5, min: 0, max: 6 },
          },
          skills: [
            {
              id: 8402,
              name: '光闇連撃',
              label: 'DualElementAttack',
              sp_cost: 4,
              hit_count: 2,
              target_type: 'Single',
              parts: [
                {
                  skill_type: 'AttackSkill',
                  target_type: 'Single',
                  type: 'Slash',
                  elements: ['Dark', 'Light'],
                  power: [1.0, 0],
                },
              ],
            },
          ],
        }
      : {}
  );
  const state = createBattleStateFromParty(party);

  const preview = previewTurn(state, {
    0: { characterId: 'M1', skillId: 8402 },
  });

  assert.equal(preview.actions[0].specialPassiveModifiers?.markAttackUpRate, 0.6);
  assert.equal(preview.actions[0].specialPassiveModifiers?.markDamageTakenDownRate, 0.2);
  assert.equal(preview.actions[0].specialPassiveModifiers?.markDevastationRateUp, 0.2);
  assert.equal(preview.actions[0].specialPassiveModifiers?.markCriticalRateUp, 0.6);
  assert.equal(preview.actions[0].specialPassiveModifiers?.markCriticalDamageUp, 0.3);

  const { committedRecord } = commitTurn(state, preview);
  assert.equal(committedRecord.actions[0].damageContext?.markAttackUpRate, 0.6);
  assert.equal(committedRecord.actions[0].damageContext?.markDamageTakenDownRate, 0.2);
  assert.equal(committedRecord.actions[0].damageContext?.markDevastationRateUp, 0.2);
  assert.equal(committedRecord.actions[0].damageContext?.markCriticalRateUp, 0.6);
  assert.equal(committedRecord.actions[0].damageContext?.markCriticalDamageUp, 0.3);
});

test('CountBC with 3 motivated allies resolves high branch when 3 members are MotivationLevel>=4', () => {
  const createParty = (motivationValues) =>
    createSixMemberManualParty((idx) =>
      idx === 0
        ? {
            initialMotivation: motivationValues[idx] ?? 3,
            skills: [
              {
                id: 18226,
                name: 'Motivation Count Branch',
                sp_cost: 12,
                target_type: 'All',
                overwrite_cond: 'CountBC(IsPlayer()==1&&MotivationLevel()>=4)>=3',
                parts: [
                  {
                    skill_type: 'SkillCondition',
                    target_type: 'All',
                    cond: 'CountBC(IsPlayer()==1&&MotivationLevel()>=4)>=3',
                    strval: [
                      {
                        id: 18227,
                        name: 'high',
                        sp_cost: 6,
                        target_type: 'All',
                        parts: [{ skill_type: 'AttackSkill', target_type: 'All', type: 'Slash' }],
                      },
                      {
                        id: 18228,
                        name: 'low',
                        sp_cost: 12,
                        target_type: 'All',
                        parts: [{ skill_type: 'AttackSkill', target_type: 'All', type: 'Slash' }],
                      },
                    ],
                  },
                ],
              },
            ],
          }
        : {
            initialMotivation: motivationValues[idx] ?? 3,
          }
    );

  const highPreview = previewTurn(createBattleStateFromParty(createParty([4, 4, 4, 3, 3, 3])), {
    0: { characterId: 'M1', skillId: 18226 },
    1: { characterId: 'M2', skillId: 8001 },
    2: { characterId: 'M3', skillId: 8002 },
  });
  assert.equal(highPreview.actions[0].spCost, 6);

  const lowPreview = previewTurn(createBattleStateFromParty(createParty([4, 4, 3, 3, 3, 3])), {
    0: { characterId: 'M1', skillId: 18226 },
    1: { characterId: 'M2', skillId: 8001 },
    2: { characterId: 'M3', skillId: 8002 },
  });
  assert.equal(lowPreview.actions[0].spCost, 12);
});

test('スペシャルタッグ passive resolves 3/2/1 motivated ally branches', () => {
  const createParty = (motivationValues) =>
    createSixMemberManualParty((idx) =>
      idx === 0
        ? {
            initialMotivation: motivationValues[idx] ?? 3,
            passives: [
              {
                id: 18229,
                name: 'スペシャルタッグ',
                timing: 'OnPlayerTurnStart',
                condition: 'CountBC(MotivationLevel() >= 4) > 0',
                parts: [
                  {
                    skill_type: 'SkillCondition',
                    target_type: 'None',
                    cond: 'CountBC(MotivationLevel() >= 4) >= 3',
                    strval: [
                      {
                        id: 18230,
                        name: 'スペシャルタッグ',
                        desc: '好調以上の味方：3人',
                        parts: [{ skill_type: 'AttackUp', target_type: 'AllyAll', power: [0.3, 0] }],
                      },
                      {
                        id: 18231,
                        name: 'スペシャルタッグ',
                        desc: '好調以上の味方：2人',
                        parts: [{ skill_type: 'AttackUp', target_type: 'AllyAll', power: [0.2, 0] }],
                      },
                      {
                        id: 18232,
                        name: 'スペシャルタッグ',
                        desc: '好調以上の味方：1人',
                        parts: [{ skill_type: 'AttackUp', target_type: 'AllyAll', power: [0.1, 0] }],
                      },
                    ],
                  },
                ],
              },
            ],
          }
        : {
            initialMotivation: motivationValues[idx] ?? 3,
          }
    );

  const result3 = applyPassiveTiming(createBattleStateFromParty(createParty([4, 4, 4, 3, 3, 3])), 'OnPlayerTurnStart');
  assert.equal(result3.passiveEvents[0].attackUpRate, 0.3);
  assert.deepEqual(result3.passiveEvents[0].unsupportedEffectTypes, []);

  const result2 = applyPassiveTiming(createBattleStateFromParty(createParty([4, 4, 3, 3, 3, 3])), 'OnPlayerTurnStart');
  assert.equal(result2.passiveEvents[0].attackUpRate, 0.2);
  assert.deepEqual(result2.passiveEvents[0].unsupportedEffectTypes, []);

  const result1 = applyPassiveTiming(createBattleStateFromParty(createParty([4, 3, 3, 3, 3, 3])), 'OnPlayerTurnStart');
  assert.equal(result1.passiveEvents[0].attackUpRate, 0.1);
  assert.deepEqual(result1.passiveEvents[0].unsupportedEffectTypes, []);

  const result0 = applyPassiveTiming(createBattleStateFromParty(createParty([3, 3, 3, 3, 3, 3])), 'OnPlayerTurnStart');
  assert.equal(result0.passiveEvents.length, 0);
});

test('掴め栄冠！グランドスラム！ sets all ally motivation levels to 5', () => {
  const store = getStore();
  const actorStyleId = findStyleIdBySkillId(store, 46002210);
  const others = getSixUsableStyleIds(store).filter((id) => Number(id) !== actorStyleId);
  const party = store.buildPartyFromStyleIds([actorStyleId, ...others.slice(0, 5)], {
    initialSP: 20,
    initialMotivationByPartyIndex: { 0: 1, 1: 2, 2: 3, 3: 4, 4: 5, 5: 1 },
    skillSetsByPartyIndex: {
      0: [46002210],
    },
  });
  const state = createBattleStateFromParty(party);
  const actor = state.party[0];

  const preview = previewTurn(state, {
    0: { characterId: actor.characterId, skillId: 46002210 },
  });
  const { nextState, committedRecord } = commitTurn(state, preview);

  assert.deepEqual(
    nextState.party.map((member) => member.motivationState.current),
    [5, 5, 5, 5, 5, 5]
  );
  const motivationEvents = committedRecord.actions.flatMap((entry) => entry.motivationChanges ?? []);
  assert.equal(motivationEvents.some((event) => event.triggerType === 'Motivation' && event.postMotivation === 5), true);
});

test('絶好調女 gives SP+1 only to allies whose motivation level is 5', () => {
  const store = getStore();
  const actorStyleId = 1002207;
  const others = getSixUsableStyleIds(store).filter((id) => Number(id) !== actorStyleId);
  const party = store.buildPartyFromStyleIds([actorStyleId, ...others.slice(0, 5)], {
    initialSP: 1,
    limitBreakLevelsByPartyIndex: { 0: 1 },
    initialMotivationByPartyIndex: { 0: 5, 1: 5, 2: 4, 3: 3, 4: 2, 5: 1 },
  });
  const state = createBattleStateFromParty(party);

  const result = applyPassiveTiming(state, 'OnEveryTurn');

  assert.equal(result.spEvents.length, 2);
  assert.equal(state.party[0].sp.current, 2);
  assert.equal(state.party[1].sp.current, 2);
  assert.equal(state.party[2].sp.current, 1);
  assert.equal(state.party[3].sp.current, 1);
  assert.equal(state.party[4].sp.current, 1);
  assert.equal(state.party[5].sp.current, 1);
  assert.equal(
    result.passiveEvents.some((event) => event.passiveName === '絶好調女' && event.spDelta === 2),
    true
  );
});

test('怪童 gives self SP+1 only when motivation is 4 or higher', () => {
  const store = getStore();
  const actorStyleId = 1001110;
  const actorStyle = store.getStyleById(actorStyleId);
  const others = getSixUsableStyleIds(store).filter(
    (id) => String(store.getStyleById(id)?.chara ?? '') !== String(actorStyle?.chara ?? '')
  );

  const highParty = store.buildPartyFromStyleIds([actorStyleId, ...others.slice(0, 5)], {
    initialSP: 1,
    limitBreakLevelsByPartyIndex: { 0: 1 },
    initialMotivationByPartyIndex: { 0: 4 },
  });
  const highState = createBattleStateFromParty(highParty);
  const highResult = applyPassiveTiming(highState, 'OnEveryTurn');
  assert.equal(highState.party[0].sp.current, 2);
  assert.equal(highResult.passiveEvents.some((event) => event.passiveName === '怪童' && event.spDelta === 1), true);

  const lowParty = store.buildPartyFromStyleIds([actorStyleId, ...others.slice(0, 5)], {
    initialSP: 1,
    limitBreakLevelsByPartyIndex: { 0: 1 },
    initialMotivationByPartyIndex: { 0: 3 },
  });
  const lowState = createBattleStateFromParty(lowParty);
  const lowResult = applyPassiveTiming(lowState, 'OnEveryTurn');
  assert.equal(lowState.party[0].sp.current, 1);
  assert.equal(lowResult.passiveEvents.length, 0);
});

test('球界の頭脳 adds 10% OD gauge only when motivation is 4 or higher', () => {
  const store = getStore();
  const actorStyleId = 1004508;
  const others = getSixUsableStyleIds(store).filter((id) => Number(id) !== actorStyleId);

  const highParty = store.buildPartyFromStyleIds([actorStyleId, ...others.slice(0, 5)], {
    initialSP: 1,
    limitBreakLevelsByPartyIndex: { 0: 3 },
    initialMotivationByPartyIndex: { 0: 4 },
  });
  const highState = createBattleStateFromParty(highParty);
  highState.turnState.odGauge = 20;
  const highResult = applyPassiveTiming(highState, 'OnEveryTurn');
  assert.equal(highState.turnState.odGauge, 30);
  assert.equal(
    highResult.passiveEvents.some((event) => event.passiveName === '球界の頭脳' && event.odGaugeDelta === 10),
    true
  );

  const lowParty = store.buildPartyFromStyleIds([actorStyleId, ...others.slice(0, 5)], {
    initialSP: 1,
    limitBreakLevelsByPartyIndex: { 0: 3 },
    initialMotivationByPartyIndex: { 0: 3 },
  });
  const lowState = createBattleStateFromParty(lowParty);
  lowState.turnState.odGauge = 20;
  const lowResult = applyPassiveTiming(lowState, 'OnEveryTurn');
  assert.equal(lowState.turnState.odGauge, 20);
  assert.equal(lowResult.passiveEvents.length, 0);
});

test('不屈の魂 applies DebuffGuard only when motivation is 5', () => {
  const store = getStore();
  const actorStyleId = 1001110;
  const actorStyle = store.getStyleById(actorStyleId);
  const others = getSixUsableStyleIds(store).filter(
    (id) => String(store.getStyleById(id)?.chara ?? '') !== String(actorStyle?.chara ?? '')
  );

  const highParty = store.buildPartyFromStyleIds([actorStyleId, ...others.slice(0, 5)], {
    initialSP: 1,
    limitBreakLevelsByPartyIndex: { 0: 0 },
    initialMotivationByPartyIndex: { 0: 5 },
  });
  const highState = createBattleStateFromParty(highParty);
  const highResult = applyPassiveTiming(highState, 'OnEnemyTurnStart');
  const guardEffects = highState.party[0].getStatusEffectsByType('DebuffGuard');
  assert.equal(guardEffects.length, 1);
  assert.equal(guardEffects[0].exitCond, 'EnemyTurnEnd');
  assert.equal(
    highResult.passiveEvents.some((event) => event.passiveName === '不屈の魂' && event.appliedStatusEffects?.length === 1),
    true
  );

  const lowParty = store.buildPartyFromStyleIds([actorStyleId, ...others.slice(0, 5)], {
    initialSP: 1,
    limitBreakLevelsByPartyIndex: { 0: 0 },
    initialMotivationByPartyIndex: { 0: 4 },
  });
  const lowState = createBattleStateFromParty(lowParty);
  const lowResult = applyPassiveTiming(lowState, 'OnEnemyTurnStart');
  assert.equal(lowState.party[0].getStatusEffectsByType('DebuffGuard').length, 0);
  assert.equal(lowResult.passiveEvents.some((event) => event.passiveName === '不屈の魂'), false);
});

test('明鏡止水 applies DebuffGuard only when motivation is 5', () => {
  const store = getStore();
  const actorStyleId = 1002207;
  const others = getSixUsableStyleIds(store).filter((id) => Number(id) !== actorStyleId);

  const highParty = store.buildPartyFromStyleIds([actorStyleId, ...others.slice(0, 5)], {
    initialSP: 1,
    limitBreakLevelsByPartyIndex: { 0: 0 },
    initialMotivationByPartyIndex: { 0: 5 },
  });
  const highState = createBattleStateFromParty(highParty);
  const highResult = applyPassiveTiming(highState, 'OnEnemyTurnStart');
  assert.equal(highState.party[0].getStatusEffectsByType('DebuffGuard').length, 1);
  assert.equal(
    highResult.passiveEvents.some((event) => event.passiveName === '明鏡止水' && event.appliedStatusEffects?.length === 1),
    true
  );

  const lowParty = store.buildPartyFromStyleIds([actorStyleId, ...others.slice(0, 5)], {
    initialSP: 1,
    limitBreakLevelsByPartyIndex: { 0: 0 },
    initialMotivationByPartyIndex: { 0: 4 },
  });
  const lowState = createBattleStateFromParty(lowParty);
  const lowResult = applyPassiveTiming(lowState, 'OnEnemyTurnStart');
  assert.equal(lowState.party[0].getStatusEffectsByType('DebuffGuard').length, 0);
  assert.equal(lowResult.passiveEvents.some((event) => event.passiveName === '明鏡止水'), false);
});

test('BreakGuard skill part is added to self status effects and recorded on commit', () => {
  const party = createSixMemberManualParty((idx) =>
    idx === 0
      ? {
          skills: [
            {
              id: 18180,
              name: '聖女の守護',
              sp_cost: 0,
              target_type: 'Self',
              parts: [
                {
                  skill_type: 'BreakGuard',
                  target_type: 'Self',
                  power: [0.5, 0],
                  effect: { exitCond: 'Count', exitVal: [1, 0] },
                },
              ],
            },
          ],
        }
      : {}
  );
  const state = createBattleStateFromParty(party);

  const preview = previewTurn(state, {
    0: { characterId: 'M1', skillId: 18180 },
  });
  const committed = commitTurn(state, preview);
  const actor = committed.nextState.party.find((member) => member.characterId === 'M1');
  const action = committed.committedRecord.actions.find((entry) => entry.characterId === 'M1');

  assert.equal(actor.getStatusEffectsByType('BreakGuard').length, 1);
  assert.equal(actor.getStatusEffectsByType('BreakGuard')[0].exitCond, 'Count');
  assert.equal(action.statusEffectsApplied.length, 1);
  assert.equal(action.statusEffectsApplied[0].statusType, 'BreakGuard');
});

test('applyInitialPassiveState applies BreakGuard passive into status effects', () => {
  const party = createSixMemberManualParty((idx) =>
    idx === 0
      ? {
          passives: [
            {
              id: 91020,
              name: '根性',
              timing: 'OnBattleStart',
              condition: '',
              parts: [
                {
                  skill_type: 'BreakGuard',
                  target_type: 'Self',
                  power: [0.5, 0],
                  effect: { exitCond: 'Count', exitVal: [1, 0] },
                },
              ],
            },
          ],
        }
      : {}
  );
  const state = createBattleStateFromParty(party);

  applyInitialPassiveState(state);

  assert.equal(state.party[0].getStatusEffectsByType('BreakGuard').length, 1);
  assert.equal(state.turnState.passiveEventsLastApplied.some((event) => event.passiveName === '根性'), true);
  assert.equal(
    state.turnState.passiveEventsLastApplied.some(
      (event) =>
        event.passiveName === '根性' &&
        Array.isArray(event.appliedStatusEffects) &&
        event.appliedStatusEffects.some((effect) => effect.statusType === 'BreakGuard')
    ),
    true
  );
});

test('AdditionalHitOnSpecifiedSkill can raise morale via passive trigger', () => {
  const party = createSixMemberManualParty((idx) =>
    idx === 0
      ? {
          characterId: 'EAoi',
          characterName: '青井',
          passives: [
            {
              id: 18230,
              name: 'ムードメーカー',
              timing: 'OnFirstBattleStart',
              condition: '',
              parts: [
                {
                  skill_type: 'AdditionalHitOnSpecifiedSkill',
                  target_type: 'Self',
                  strval: [-1, { id: 18231, label: 'EAoiSkillX', name: 'Trigger Skill' }],
                },
                { skill_type: 'Morale', target_type: 'AllyAll', power: [2, 0] },
              ],
            },
          ],
          skills: [
            {
              id: 18231,
              label: 'EAoiSkillX',
              name: 'Trigger Skill',
              sp_cost: 0,
              parts: [{ skill_type: 'AttackSkill', target_type: 'Single', type: 'Strike' }],
            },
          ],
        }
      : {}
  );
  const state = createBattleStateFromParty(party);
  const preview = previewTurn(state, {
    0: { characterId: 'EAoi', skillId: 18231, targetEnemyIndex: 0 },
    1: { characterId: 'M2', skillId: 8001 },
    2: { characterId: 'M3', skillId: 8002 },
  });
  const { nextState } = commitTurn(state, preview);

  assert.equal(nextState.party[0].moraleState.current, 2);
  assert.equal(nextState.party[1].moraleState.current, 2);
});

test('AdditionalHitOnExtraSkill can raise morale when restricted skill is used', () => {
  const party = createSixMemberManualParty((idx) =>
    idx === 0
      ? {
          passives: [
            {
              id: 18240,
              name: 'Extra Morale',
              timing: 'OnFirstBattleStart',
              parts: [
                { skill_type: 'AdditionalHitOnExtraSkill', target_type: 'Self' },
                { skill_type: 'Morale', target_type: 'Self', power: [3, 0] },
              ],
            },
          ],
          skills: [
            {
              id: 18241,
              name: 'EX Skill',
              is_restricted: 1,
              sp_cost: 0,
              parts: [{ skill_type: 'AttackSkill', target_type: 'Single', type: 'Strike' }],
            },
          ],
        }
      : {}
  );
  const state = createBattleStateFromParty(party);
  const preview = previewTurn(state, {
    0: { characterId: 'M1', skillId: 18241, targetEnemyIndex: 0 },
    1: { characterId: 'M2', skillId: 8001 },
    2: { characterId: 'M3', skillId: 8002 },
  });
  const { nextState } = commitTurn(state, preview);

  assert.equal(nextState.party[0].moraleState.current, 3);
});

test('AdditionalHitOnKillCount can raise morale per defeated enemy', () => {
  const party = createSixMemberManualParty((idx) =>
    idx === 0
      ? {
          characterId: 'KILL1',
          characterName: 'KILL1',
          passives: [
            {
              id: 18250,
              name: '迸る衝動',
              timing: 'OnFirstBattleStart',
              parts: [
                { skill_type: 'AdditionalHitOnKillCount', target_type: 'Self' },
                { skill_type: 'Morale', target_type: 'Self', power: [2, 0] },
              ],
            },
          ],
          skills: [
            {
              id: 18251,
              name: 'Kill Skill',
              sp_cost: 0,
              parts: [{ skill_type: 'AttackSkill', target_type: 'All', type: 'Strike' }],
            },
          ],
        }
      : {}
  );
  const state = createBattleStateFromParty(party);
  const preview = previewTurn(state, {
    0: { characterId: 'KILL1', skillId: 18251, killCount: 2 },
    1: { characterId: 'M2', skillId: 8001 },
    2: { characterId: 'M3', skillId: 8002 },
  });
  const { nextState, committedRecord } = commitTurn(state, preview);
  const entry = committedRecord.actions.find((item) => item.characterId === 'KILL1');

  assert.equal(nextState.party[0].moraleState.current, 4);
  assert.equal((entry.moraleChanges ?? []).some((item) => item.triggerType === 'MoralePassiveTrigger' && item.delta === 4), true);
});

test('real kill-count morale passive raises morale for ally party members', () => {
  const store = getStore();
  const allyMoralePassive = structuredClone(store.passives.find((passive) => Number(passive?.id) === 100460600));
  assert.ok(allyMoralePassive);
  const party = createSixMemberManualParty((idx) =>
    idx === 0
      ? {
          characterId: 'LEAD1',
          characterName: 'LEAD1',
          initialSP: 20,
          passives: [allyMoralePassive],
          skills: [
            {
              id: 18252,
              name: 'Leader Kill',
              sp_cost: 0,
              parts: [{ skill_type: 'AttackSkill', target_type: 'Single', type: 'Strike' }],
            },
          ],
        }
      : {}
  );
  const state = createBattleStateFromParty(party);
  const preview = previewTurn(state, {
    0: { characterId: 'LEAD1', skillId: 18252, killCount: 2, targetEnemyIndex: 0 },
  });
  const { nextState } = commitTurn(state, preview);

  assert.deepEqual(
    nextState.party.map((member) => Number(member.moraleState?.current ?? 0)),
    [2, 2, 2, 2, 2, 2]
  );
});

test('real token consume skill 星降るシャンデリア・グラス spends 5 token and grants token and morale to all allies', () => {
  const store = getStore();
  const actorStyleId = findStyleIdBySkillId(store, 46006511);
  const others = getSixUsableStyleIds(store).filter((id) => Number(id) !== actorStyleId);
  const party = store.buildPartyFromStyleIds([actorStyleId, ...others.slice(0, 5)], {
    initialSP: 20,
  });
  const state = createBattleStateFromParty(party);
  const actor = state.party[0];
  actor.tokenState.current = 7;

  const preview = previewTurn(state, {
    0: { characterId: actor.characterId, skillId: 46006511 },
  });
  assert.equal(preview.actions[0].consumeType, 'Token');
  assert.equal(preview.actions[0].startToken, 7);
  assert.equal(preview.actions[0].endToken, 2);
  const { nextState, committedRecord } = commitTurn(state, preview);
  const entry = committedRecord.actions.find((item) => item.characterId === actor.characterId);

  assert.equal(actor.characterId, 'IrOhshima');
  assert.equal(nextState.party[0].tokenState.current, 6);
  assert.deepEqual(
    nextState.party.map((member) => Number(member.tokenState?.current ?? 0)),
    [6, 3, 3, 3, 3, 3]
  );
  assert.deepEqual(
    nextState.party.map((member) => Number(member.moraleState?.current ?? 0)),
    [3, 3, 3, 3, 3, 3]
  );
  assert.equal((entry.tokenChanges ?? []).some((item) => item.source === 'cost' && item.delta === -5), true);
  assert.equal((entry.moraleChanges ?? []).some((item) => item.triggerType === 'Morale' && item.delta === 3), true);
});

test('一途 spends 5 token on preview and commit', () => {
  const store = getStore();
  const actorStyleId = findStyleIdBySkillId(store, 46004211);
  const others = getSixUsableStyleIds(store).filter((id) => Number(id) !== actorStyleId);
  const party = store.buildPartyFromStyleIds([actorStyleId, ...others.slice(0, 5)], {
    initialSP: 20,
    skillSetsByPartyIndex: {
      0: [46004211],
    },
  });
  const state = createBattleStateFromParty(party);
  const actor = state.party[0];
  actor.tokenState.current = 7;

  const preview = previewTurn(state, {
    0: { characterId: actor.characterId, skillId: 46004211, targetEnemyIndex: 0 },
  });
  assert.equal(actor.characterId, 'MTsukishiro');
  assert.equal(preview.actions[0].consumeType, 'Token');
  assert.equal(preview.actions[0].startSP, 20);
  assert.equal(preview.actions[0].endSP, 20);
  assert.equal(preview.actions[0].startToken, 7);
  assert.equal(preview.actions[0].endToken, 2);

  const { nextState, committedRecord } = commitTurn(state, preview);
  const entry = committedRecord.actions.find((item) => item.characterId === actor.characterId);

  assert.equal(nextState.party[0].sp.current, 20);
  assert.equal(nextState.party[0].tokenState.current, 3);
  assert.equal((entry.tokenChanges ?? []).some((item) => item.source === 'cost' && item.delta === -5), true);
  assert.equal(
    (entry.tokenChanges ?? []).some((item) => item.triggerType === 'TokenSetByAttacking' && item.delta === 1),
    true
  );
});

test('サマーグレイス is usable outside OD and blocked during OD', () => {
  const store = getStore();
  const actorStyleId = findStyleIdBySkillId(store, 46006610);
  const others = getSixUsableStyleIds(store).filter((id) => Number(id) !== actorStyleId);
  const party = store.buildPartyFromStyleIds([actorStyleId, ...others.slice(0, 5)], {
    initialSP: 10,
    skillSetsByPartyIndex: {
      0: [46006610],
    },
  });
  let state = createBattleStateFromParty(party);
  const actor = state.party[0];

  const preview = previewTurn(state, {
    0: { characterId: actor.characterId, skillId: 46006610 },
  });
  const { nextState, committedRecord } = commitTurn(state, preview);
  const entry = committedRecord.actions.find((item) => item.characterId === actor.characterId);

  assert.equal(actor.characterId, 'MuOhshima');
  assert.equal(preview.actions[0].spCost, 4);
  assert.equal(preview.actions[0].startToken, 0);
  assert.equal(nextState.party[0].tokenState.current, 1);
  assert.equal(
    (entry.tokenChanges ?? []).some((item) => item.triggerType === 'TokenSet' && item.delta === 1),
    true
  );

  state = createBattleStateFromParty(party);
  state.turnState.odGauge = 100;
  state = activateOverdrive(state, 1, 'preemptive');

  assert.throws(
    () =>
      previewTurn(state, {
        0: { characterId: actor.characterId, skillId: 46006610 },
      }),
    /cannot be used because cond is not satisfied/
  );
});

test('真夏のひんやりショック！ consumes all token and converts it to OD gain', () => {
  const store = getStore();
  const actorStyleId = findStyleIdBySkillId(store, 46006609);
  const others = getSixUsableStyleIds(store).filter((id) => Number(id) !== actorStyleId);
  const party = store.buildPartyFromStyleIds([actorStyleId, ...others.slice(0, 5)], {
    initialSP: 10,
    skillSetsByPartyIndex: {
      0: [46006609],
    },
  });
  const state = createBattleStateFromParty(party);
  state.turnState.odGauge = 40;
  const actor = state.party[0];
  actor.tokenState.current = 4;

  const preview = previewTurn(state, {
    0: { characterId: actor.characterId, skillId: 46006609 },
  });
  const { nextState, committedRecord } = commitTurn(state, preview);
  const entry = committedRecord.actions.find((item) => item.characterId === actor.characterId);

  assert.equal(actor.characterId, 'MuOhshima');
  assert.equal(preview.actions[0].consumeType, 'Token');
  assert.equal(preview.actions[0].startToken, 4);
  assert.equal(preview.actions[0].endToken, 0);
  assert.equal(nextState.party[0].tokenState.current, 0);
  assert.equal(entry.odGaugeGain, 40);
  assert.equal(nextState.turnState.odGauge, 80);
  assert.equal((entry.tokenChanges ?? []).some((item) => item.source === 'cost' && item.delta === -4), true);
  assert.equal(entry.damageContext?.overDrivePointUpByTokenPerToken, 0.1);
  assert.equal(entry.damageContext?.overDrivePointUpByTokenTokenCount, 4);
  assert.equal(entry.damageContext?.overDrivePointUpByTokenTotalPercent, 40);
});

test('orb skill Cheer Up raises self morale for characters without innate morale support', () => {
  const store = getStore();
  const actorStyleId = 1001201; // YIzumi
  const others = getSixUsableStyleIds(store).filter((id) => store.getStyleById(id)?.chara_label !== 'YIzumi');
  const styleIds = [actorStyleId, ...others.slice(0, 5)];
  const party = store.buildPartyFromStyleIds(styleIds, {
    initialSP: 20,
    skillSetsByPartyIndex: {
      0: [46300018], // [オーブ] チアーアップ
    },
  });
  const state = createBattleStateFromParty(party);
  const actor = state.party[0];
  assert.equal(actor.characterId, 'YIzumi');

  const preview = previewTurn(state, {
    0: { characterId: actor.characterId, skillId: 46300018 },
  });
  const { nextState, committedRecord } = commitTurn(state, preview);

  assert.equal(nextState.party[0].moraleState.current, 2);
  assert.equal(nextState.party.slice(1).every((member) => Number(member.moraleState?.current ?? 0) === 0), true);
  assert.equal(
    (committedRecord.actions.find((entry) => entry.characterId === actor.characterId)?.moraleChanges ?? []).some(
      (item) => item.triggerType === 'Morale' && item.delta === 2
    ),
    true
  );
});

test('frontline morale skill raises morale only for front members', () => {
  const store = getStore();
  const actorStyleId = 1008303; // IRedmayne
  const others = getSixUsableStyleIds(store).filter((id) => store.getStyleById(id)?.chara_label !== 'IRedmayne');
  const styleIds = [actorStyleId, ...others.slice(0, 5)];
  const party = store.buildPartyFromStyleIds(styleIds, {
    initialSP: 20,
    skillSetsByPartyIndex: {
      0: [46008314], // 背水のギャンビット
    },
  });
  const state = createBattleStateFromParty(party);
  const actor = state.party[0];
  assert.equal(actor.characterId, 'IRedmayne');

  const preview = previewTurn(state, {
    0: { characterId: actor.characterId, skillId: 46008314, targetEnemyIndex: 0 },
  });
  const { nextState } = commitTurn(state, preview);

  assert.deepEqual(
    nextState.party.map((member) => Number(member.moraleState?.current ?? 0)),
    [5, 5, 5, 0, 0, 0]
  );
});

test('ハートフル・ボマー+ raises morale for all allies', () => {
  const store = getStore();
  const actorStyleId = findStyleIdBySkillId(store, 46005461);
  const actorStyle = store.getStyleById(actorStyleId);
  const actorCharaLabel = String(actorStyle?.chara_label ?? '');
  const extra31d = [];
  const seen31dChars = new Set([actorCharaLabel]);
  for (const style of store.styles) {
    if (String(style?.team ?? '') !== '31D') {
      continue;
    }
    const styleId = Number(style.id);
    const charaLabel = String(style?.chara_label ?? '');
    if (!Number.isFinite(styleId) || styleId === actorStyleId || seen31dChars.has(charaLabel)) {
      continue;
    }
    seen31dChars.add(charaLabel);
    extra31d.push(styleId);
    if (extra31d.length >= 2) {
      break;
    }
  }
  assert.equal(extra31d.length, 2);
  const others = getSixUsableStyleIds(store).filter((id) => ![actorStyleId, ...extra31d].includes(Number(id)));
  const styleIds = [actorStyleId, ...extra31d, ...others.slice(0, 3)];
  const party = store.buildPartyFromStyleIds(styleIds, {
    initialSP: 20,
    skillSetsByPartyIndex: {
      0: [46005461],
    },
  });
  const state = createBattleStateFromParty(party);
  const actor = state.party[0];

  const preview = previewTurn(state, {
    0: { characterId: actor.characterId, skillId: 46005461, targetEnemyIndex: 0 },
  });
  const { nextState, committedRecord } = commitTurn(state, preview);
  const entry = committedRecord.actions.find((item) => item.characterId === actor.characterId);

  assert.equal(actor.characterId, 'RMurohushi');
  assert.deepEqual(
    nextState.party.map((member) => Number(member.moraleState?.current ?? 0)),
    [4, 4, 4, 4, 4, 4]
  );
  assert.equal(
    (entry.moraleChanges ?? []).filter((item) => item.triggerType === 'Morale' && item.delta === 4).length,
    1
  );
});

test('バーテンダーズ・チョイス splits first and second use for token gain and OD cost', () => {
  const store = getStore();
  const actorStyleId = findStyleIdBySkillId(store, 46006308);
  const others = getSixUsableStyleIds(store).filter((id) => Number(id) !== actorStyleId);
  const party = store.buildPartyFromStyleIds([actorStyleId, ...others.slice(0, 5)], {
    initialSP: 10,
    skillSetsByPartyIndex: {
      0: [46006308],
    },
  });
  let state = createBattleStateFromParty(party);
  state.turnState.odGauge = 100;
  const actor = state.party[0];

  const preview1 = previewTurn(state, {
    0: { characterId: actor.characterId, skillId: 46006308 },
  });
  assert.equal(actor.characterId, 'MiOhshima');
  assert.equal(preview1.actions[0].spCost, 0);
  const commit1 = commitTurn(state, preview1);
  state = commit1.nextState;

  assert.equal(state.turnState.odGauge, 85);
  assert.deepEqual(
    state.party.map((member) => Number(member.tokenState?.current ?? 0)),
    [2, 2, 2, 0, 0, 0]
  );
  assert.deepEqual(
    state.party.map((member) => Number(member.sp?.current ?? 0)),
    [15, 15, 15, 15, 15, 15]
  );

  const preview2 = previewTurn(state, {
    0: { characterId: actor.characterId, skillId: 46006308 },
  });
  assert.equal(preview2.actions[0].spCost, 0);
  const commit2 = commitTurn(state, preview2);
  state = commit2.nextState;

  assert.equal(state.turnState.odGauge, 70);
  assert.deepEqual(
    state.party.map((member) => Number(member.tokenState?.current ?? 0)),
    [4, 4, 4, 0, 0, 0]
  );
  assert.deepEqual(
    state.party.map((member) => Number(member.sp?.current ?? 0)),
    [17, 17, 17, 17, 17, 17]
  );
});

test('preemptive od returns to same normal turn context after remaining actions consumed', () => {
  const store = getStore();
  const styleIds = getSixUsableStyleIds(store);
  const party = store.buildPartyFromStyleIds(styleIds, { initialSP: 10 });

  let state = createBattleStateFromParty(party);
  state.turnState.odGauge = 100;
  state = activateOverdrive(state, 1, 'preemptive');

  assert.equal(state.turnState.turnType, 'od');
  assert.equal(state.turnState.remainingOdActions, 1);

  const preview = previewTurn(state, buildActionDict(party));
  const { nextState } = commitTurn(state, preview);

  assert.equal(nextState.turnState.turnType, 'normal');
  assert.equal(nextState.turnState.turnIndex, 1);
});

test('activateOverdrive consumes gauge by level and rejects insufficient gauge unless forced', () => {
  const store = getStore();
  const styleIds = getSixUsableStyleIds(store);
  const party = store.buildPartyFromStyleIds(styleIds, { initialSP: 10 });
  let state = createBattleStateFromParty(party);

  state.turnState.odGauge = 250.5;
  state = activateOverdrive(state, 2, 'preemptive');
  assert.equal(state.turnState.turnType, 'od');
  assert.equal(state.turnState.odGauge, 50.5);

  const lowGaugeState = createBattleStateFromParty(party);
  lowGaugeState.turnState.odGauge = 80;
  assert.throws(() => activateOverdrive(lowGaugeState, 1, 'preemptive'), /requires 100% gauge/);

  const forcedState = activateOverdrive(lowGaugeState, 1, 'preemptive', { forceActivation: true });
  assert.equal(forcedState.turnState.turnType, 'od');
  assert.equal(forcedState.turnState.odGauge, 80);
});

test('passive timing coverage report identifies controller gaps against passives.json', () => {
  const store = getStore();
  const report = analyzePassiveTimingCoverage(store.passives);

  assert.deepEqual(report.supportedTimings, [
    { timing: 'OnAdditionalTurnStart', count: 10 },
    { timing: 'OnBattleStart', count: 84 },
    { timing: 'OnBattleWin', count: 4 },
    { timing: 'OnEnemyTurnStart', count: 31 },
    { timing: 'OnEveryTurn', count: 290 },
    { timing: 'OnFirstBattleStart', count: 108 },
    { timing: 'OnOverdriveStart', count: 9 },
    { timing: 'OnPlayerTurnStart', count: 198 },
  ]);
  assert.deepEqual(
    report.unsupportedTimings.map((item) => item.timing),
    ['None', 'OnEveryTurnIncludeSpecial']
  );
});

test('condition support matrix classifies passive conditions by planned tier', () => {
  const report = analyzePassiveConditionSupport([
    {
      id: 1,
      name: 'Support A',
      condition: 'DpRate()>=1.0 && IsFront()',
      parts: [],
    },
    {
      id: 2,
      name: 'Support B',
      condition: 'ConquestBikeLevel()>=80 || Random()<0.3',
      parts: [],
    },
    {
      id: 3,
      name: 'Support C',
      condition: 'IsNatureElement(Fire)==1 && IsCharacter(IIshii)==1',
      parts: [],
    },
    {
      id: 4,
      name: 'Support D',
      condition: 'MoraleLevel()>=6',
      parts: [],
    },
  ]);

  assert.deepEqual(report.summary.implemented, ['ConquestBikeLevel', 'DpRate', 'IsFront', 'MoraleLevel', 'Random']);
  assert.deepEqual(report.summary.ready_now, ['IsCharacter', 'IsNatureElement']);
  assert.deepEqual(report.summary.manual_state, []);
  assert.deepEqual(report.summary.stateful_future, []);
});

test('activateOverdrive records triggered passive events for debug logging', () => {
  const store = getStore();
  const styleIds = [
    1001408,
    ...getSixUsableStyleIds(store)
      .filter((id) => store.getStyleById(id)?.chara_label !== 'TTojo')
      .slice(0, 5),
  ];
  const party = store.buildPartyFromStyleIds(styleIds, { initialSP: 10 });
  let state = createBattleStateFromParty(party);

  state.turnState.odGauge = 120;
  state = activateOverdrive(state, 1, 'preemptive');

  const passiveEvents = state.turnState.passiveEventsLastApplied ?? [];
  assert.equal(passiveEvents.length > 0, true);
  assert.equal(passiveEvents.some((event) => event.turnLabel === 'OD1-1'), true);
  assert.equal(
    passiveEvents.some(
      (event) =>
        event.characterName === '東城 つかさ' &&
        String(event.passiveDesc ?? '').includes('オーバードライブ中 ダメージアップ')
    ),
    true
  );
});

test('commitTurn can activate interrupt OD after commit', () => {
  const store = getStore();
  const styleIds = getSixUsableStyleIds(store);
  const party = store.buildPartyFromStyleIds(styleIds, { initialSP: 10 });
  let state = createBattleStateFromParty(party);
  state.turnState.odGauge = 150;

  const preview = previewTurn(state, buildActionDict(party));
  const { nextState } = commitTurn(state, preview, [], { interruptOdLevel: 1 });

  assert.equal(nextState.turnState.turnType, 'od');
  assert.equal(nextState.turnState.odContext, 'interrupt');
  assert.equal(nextState.turnState.odGauge < 150, true, 'interrupt OD should consume 100% gauge');
  assert.equal(nextState.turnState.odGauge > 0, true, 'remaining gauge should stay positive in this case');
  assert.equal(nextState.turnState.turnIndex, 1, 'interrupt OD should keep base turn index until OD ends');
});

test('interrupt OD advances to next base turn after OD sequence ends', () => {
  const store = getStore();
  const styleIds = getSixUsableStyleIds(store);
  const party = store.buildPartyFromStyleIds(styleIds, { initialSP: 10 });
  let state = createBattleStateFromParty(party);
  state.turnState.odGauge = 150;

  // T1 の行動後に割込OD1へ入る (T1 | OD1-1)
  const preview = previewTurn(state, buildActionDict(party));
  state = commitTurn(state, preview, [], { interruptOdLevel: 1 }).nextState;
  assert.equal(state.turnState.turnType, 'od');
  assert.equal(state.turnState.turnIndex, 1);
  assert.equal(state.turnState.turnLabel, 'OD1-1');

  // OD1-1 消化後は T2 に進む
  const odPreview = previewTurn(state, buildActionDict(party));
  state = commitTurn(state, odPreview).nextState;
  assert.equal(state.turnState.turnType, 'normal');
  assert.equal(state.turnState.turnIndex, 2);
  assert.equal(state.turnState.turnLabel, 'T2');
});

test('normal/od/extra boundary transitions keep expected turn labels and indices', () => {
  const store = getStore();
  const styleIds = getSixUsableStyleIds(store);
  const party = store.buildPartyFromStyleIds(styleIds, { initialSP: 10 });
  const firstCharacterId = party.getByPosition(0).characterId;

  let state = createBattleStateFromParty(party);
  assert.equal(state.turnState.turnType, 'normal');
  assert.equal(state.turnState.turnLabel, 'T1');
  assert.equal(state.turnState.turnIndex, 1);
  assert.equal(state.turnState.sequenceId, 1);

  let preview = previewTurn(state, buildActionDict(party));
  state = commitTurn(state, preview).nextState;
  assert.equal(state.turnState.turnType, 'normal');
  assert.equal(state.turnState.turnLabel, 'T2');
  assert.equal(state.turnState.turnIndex, 2);
  assert.equal(state.turnState.sequenceId, 2);

  state.turnState.odGauge = 100;
  state = activateOverdrive(state, 1, 'preemptive');
  assert.equal(state.turnState.turnType, 'od');
  assert.equal(state.turnState.turnLabel, 'OD1-1');
  assert.equal(state.turnState.turnIndex, 2, 'preemptive OD should keep base turn index');
  assert.equal(state.turnState.sequenceId, 2, 'OD activation itself should not advance sequence');

  preview = previewTurn(state, buildActionDict(party));
  state = commitTurn(state, preview).nextState;
  assert.equal(state.turnState.turnType, 'normal');
  assert.equal(state.turnState.turnLabel, 'T2');
  assert.equal(state.turnState.turnIndex, 2, 'OD1 end should return to same base turn context');
  assert.equal(state.turnState.sequenceId, 3);

  state = grantExtraTurn(state, [firstCharacterId]);
  assert.equal(state.turnState.turnType, 'extra');
  assert.equal(state.turnState.turnLabel, 'EX');
  assert.equal(state.turnState.turnIndex, 2, 'granting extra turn should not advance base turn');
  assert.equal(state.turnState.sequenceId, 3);

  preview = previewTurn(state, {
    0: { characterId: firstCharacterId, skillId: party.getByPosition(0).skills[0].skillId },
  });
  state = commitTurn(state, preview).nextState;
  assert.equal(state.turnState.turnType, 'normal');
  assert.equal(state.turnState.turnLabel, 'T3');
  assert.equal(state.turnState.turnIndex, 3);
  assert.equal(state.turnState.sequenceId, 4);
});

function createTranscendenceTestParty({ initialGaugePercent = null } = {}) {
  const members = Array.from({ length: 6 }, (_, idx) =>
    new CharacterStyle({
      characterId: `TC${idx + 1}`,
      characterName: `TC${idx + 1}`,
      styleId: idx + 1,
      styleName: `TS${idx + 1}`,
      role: idx === 0 ? 'Admiral' : 'Attacker',
      elements: idx <= 2 ? ['Ice'] : ['Fire'],
      transcendenceRule:
        idx === 0
          ? {
              styleId: 1,
              gaugeElement: 'Ice',
              initialGaugePercentPerMatchingElementMember: 15,
              gaugeGainPercentOnMatchingElementAction: 4,
              maxGaugePercent: 100,
              triggerOnReachMax: { odGaugeDeltaPercent: 100 },
            }
          : null,
      partyIndex: idx,
      position: idx,
      initialSP: 10,
      skills: [
        {
          id: 15000 + idx,
          name: 'Support',
          sp_cost: 0,
          parts: [{ skill_type: 'AttackUp', target_type: 'Self' }],
        },
      ],
    })
  );

  const party = new Party(members);
  const state = createBattleStateFromParty(party);
  if (initialGaugePercent !== null) {
    state.turnState.transcendence.gaugePercent = Number(initialGaugePercent);
  }
  return state;
}

test('transcendence gauge initializes by matching-element member count x 15%', () => {
  const state = createTranscendenceTestParty();
  assert.equal(state.turnState.transcendence?.active, true);
  assert.equal(state.turnState.transcendence?.gaugeElement, 'Ice');
  assert.equal(state.turnState.transcendence?.gaugePercent, 45);
});

test('transcendence gauge gains +4 per matching-element action and is capped at 100%', () => {
  let state = createTranscendenceTestParty({ initialGaugePercent: 96 });
  state.turnState.odGauge = 10;

  const preview = previewTurn(state, {
    0: { characterId: 'TC1', skillId: 15000 }, // Ice
    1: { characterId: 'TC2', skillId: 15001 }, // Ice
    2: { characterId: 'TC3', skillId: 15002 }, // Ice
  });
  assert.equal(preview.projections?.transcendence?.endGaugePercent, 100);
  assert.equal(preview.projections?.transcendence?.odGaugeBonusPercent, 100);

  const committed = commitTurn(state, preview);
  state = committed.nextState;
  assert.equal(state.turnState.transcendence?.gaugePercent, 100);
  assert.equal(state.turnState.odGauge, 110);

  // 2ターン目: すでに100%到達済みのため、OD+100は再発しない。
  const preview2 = previewTurn(state, {
    0: { characterId: 'TC1', skillId: 15000 },
    1: { characterId: 'TC2', skillId: 15001 },
    2: { characterId: 'TC3', skillId: 15002 },
  });
  const committed2 = commitTurn(state, preview2);
  assert.equal(committed2.nextState.turnState.odGauge, 110);
  assert.equal(committed2.nextState.turnState.transcendence?.gaugePercent, 100);
});

test('extra turn can be granted and consumed', () => {
  const store = getStore();
  const styleIds = getSixUsableStyleIds(store);
  const party = store.buildPartyFromStyleIds(styleIds, { initialSP: 10 });

  let state = createBattleStateFromParty(party);
  const allowed = [party.getByPosition(0).characterId];
  state = grantExtraTurn(state, allowed);

  assert.equal(state.turnState.turnType, 'extra');
  assert.equal(state.turnState.extraTurnState.active, true);
  assert.equal(
    state.party.filter((m) => m.isExtraActive).map((m) => m.characterId).join(','),
    allowed.join(','),
    'only granted member should be marked as extra-active'
  );

  const preview = previewTurn(state, {
    0: {
      characterId: party.getByPosition(0).characterId,
      skillId: party.getByPosition(0).skills[0].skillId,
    },
  });

  const { nextState } = commitTurn(state, preview);
  assert.equal(nextState.turnState.turnType, 'normal');
  assert.equal(nextState.turnState.turnIndex, 2);
  assert.equal(
    nextState.party.some((m) => m.isExtraActive),
    false,
    'extra-active flags should be cleared after extra turn finishes'
  );
});

function createManualExtraTurnParty() {
  const members = Array.from({ length: 6 }, (_, idx) => {
    const characterId = `C${idx + 1}`;
    const extraRule =
      idx === 0
        ? {
            skillUsableInExtraTurn: true,
            additionalTurnGrantInExtraTurn: true,
            conditions: {
              requiresOverDrive: false,
              requiresReinforcedMode: false,
              excludesExtraTurnForSkillUse: false,
              excludesExtraTurnForAdditionalTurnGrant: false,
            },
            additionalTurnTargetTypes: ['AllyFront'],
          }
        : null;

    return new CharacterStyle({
      characterId,
      characterName: characterId,
      styleId: idx + 1,
      styleName: `S${idx + 1}`,
      partyIndex: idx,
      position: idx,
      initialSP: 10,
      skills: [
        {
          id: 9000 + idx,
          name: idx === 0 ? 'Grant Front Extra' : 'Normal',
          sp_cost: 0,
          additionalTurnRule: extraRule,
          parts: extraRule ? [{ skill_type: 'AdditionalTurn', target_type: 'AllyFront' }] : [],
        },
      ],
    });
  });

  return new Party(members);
}

test('commitTurn grants extra turn and marks allowed members as extra-active', () => {
  const party = createManualExtraTurnParty();
  const state = createBattleStateFromParty(party);

  const preview = previewTurn(state, {
    0: { characterId: 'C1', skillId: 9000 },
    1: { characterId: 'C2', skillId: 9001 },
    2: { characterId: 'C3', skillId: 9002 },
  });
  const { nextState } = commitTurn(state, preview);

  assert.equal(nextState.turnState.turnType, 'extra');
  assert.deepEqual(
    nextState.turnState.extraTurnState?.allowedCharacterIds,
    ['C1', 'C2', 'C3'],
    'AllyFront grant should mark current frontline members'
  );
  assert.deepEqual(
    nextState.party
      .filter((m) => m.isExtraActive)
      .map((m) => m.characterId)
      .sort(),
    ['C1', 'C2', 'C3']
  );
});

test('commitTurn applies OnAdditionalTurnStart passives when next state enters extra turn', () => {
  const members = Array.from({ length: 6 }, (_, idx) => {
    const extraRule =
      idx === 0
        ? {
            skillUsableInExtraTurn: true,
            additionalTurnGrantInExtraTurn: true,
            conditions: {
              requiresOverDrive: false,
              requiresReinforcedMode: false,
              excludesExtraTurnForSkillUse: false,
              excludesExtraTurnForAdditionalTurnGrant: false,
            },
            additionalTurnTargetTypes: ['AllyFront'],
          }
        : null;
    return new CharacterStyle({
      characterId: `CE${idx + 1}`,
      characterName: `CE${idx + 1}`,
      styleId: idx + 1,
      styleName: `CES${idx + 1}`,
      partyIndex: idx,
      position: idx,
      initialSP: 3,
      passives:
        idx === 1
          ? [
              {
                id: 31,
                name: 'アフターサービス',
                desc: '追加ターン開始時 自身のSP+1',
                timing: 'OnAdditionalTurnStart',
                condition: '',
                parts: [{ skill_type: 'HealSp', target_type: 'Self', power: [1, 0] }],
              },
            ]
          : [],
      skills: [
        {
          id: 29000 + idx,
          name: idx === 0 ? 'Grant Front Extra' : 'Normal',
          sp_cost: 0,
          additionalTurnRule: extraRule,
          parts: extraRule ? [{ skill_type: 'AdditionalTurn', target_type: 'AllyFront' }] : [],
        },
      ],
    });
  });
  const state = createBattleStateFromParty(new Party(members));

  const preview = previewTurn(state, {
    0: { characterId: 'CE1', skillId: 29000 },
    1: { characterId: 'CE2', skillId: 29001 },
    2: { characterId: 'CE3', skillId: 29002 },
  });
  const { nextState, committedRecord } = commitTurn(state, preview);

  assert.equal(nextState.turnState.turnType, 'extra');
  assert.equal(nextState.party.find((m) => m.characterId === 'CE2').sp.current, 6);
  assert.equal(nextState.turnState.passiveEventsLastApplied.length, 1);
  assert.equal(nextState.turnState.passiveEventsLastApplied[0].timing, 'OnAdditionalTurnStart');
  assert.equal(committedRecord.passiveEvents.length, 1);
  assert.equal(committedRecord.passiveEvents[0].passiveName, 'アフターサービス');
});

test('self-only additional turn in extra turn does not carry previous allowed members', () => {
  const members = Array.from({ length: 6 }, (_, idx) =>
    new CharacterStyle({
      characterId: `X${idx + 1}`,
      characterName: `X${idx + 1}`,
      styleId: idx + 1,
      styleName: `XS${idx + 1}`,
      partyIndex: idx,
      position: idx,
      initialSP: 10,
      skills: [
        {
          id: 11000 + idx,
          name: idx === 0 ? 'Self Extra' : 'Normal',
          sp_cost: 0,
          additionalTurnRule:
            idx === 0
              ? {
                  skillUsableInExtraTurn: true,
                  additionalTurnGrantInExtraTurn: true,
                  conditions: {
                    requiresOverDrive: false,
                    requiresReinforcedMode: false,
                    excludesExtraTurnForSkillUse: false,
                    excludesExtraTurnForAdditionalTurnGrant: false,
                  },
                  additionalTurnTargetTypes: ['Self'],
                }
              : null,
          parts: idx === 0 ? [{ skill_type: 'AdditionalTurn', target_type: 'Self' }] : [],
        },
      ],
    })
  );

  let state = createBattleStateFromParty(new Party(members));
  state = grantExtraTurn(state, ['X1', 'X2', 'X3']);

  const preview = previewTurn(state, {
    0: { characterId: 'X1', skillId: 11000 },
    1: { characterId: 'X2', skillId: 11001 },
    2: { characterId: 'X3', skillId: 11002 },
  });
  const { nextState } = commitTurn(state, preview);
  assert.equal(nextState.turnState.turnType, 'extra');
  assert.deepEqual(nextState.turnState.extraTurnState?.allowedCharacterIds, ['X1']);
});

test('additional turn AllySingleWithoutSelf respects selected targetCharacterId', () => {
  const members = Array.from({ length: 6 }, (_, idx) =>
    new CharacterStyle({
      characterId: `ATS${idx + 1}`,
      characterName: `ATS${idx + 1}`,
      styleId: idx + 1,
      styleName: `ATSS${idx + 1}`,
      partyIndex: idx,
      position: idx,
      initialSP: 10,
      skills: [
        {
          id: 54000 + idx,
          name: idx === 0 ? 'Single Extra' : 'Normal',
          sp_cost: 0,
          additionalTurnRule:
            idx === 0
              ? {
                  skillUsableInExtraTurn: true,
                  additionalTurnGrantInExtraTurn: true,
                  conditions: {
                    requiresOverDrive: false,
                    requiresReinforcedMode: false,
                  },
                  additionalTurnTargetTypes: ['AllySingleWithoutSelf'],
                }
              : null,
          parts:
            idx === 0
              ? [{ skill_type: 'AdditionalTurn', target_type: 'AllySingleWithoutSelf' }]
              : [],
        },
      ],
    })
  );

  const state = createBattleStateFromParty(new Party(members));
  const preview = previewTurn(state, {
    0: { characterId: 'ATS1', skillId: 54000, targetCharacterId: 'ATS3' },
    1: { characterId: 'ATS2', skillId: 54001 },
    2: { characterId: 'ATS3', skillId: 54002 },
  });
  const { nextState } = commitTurn(state, preview);

  assert.equal(nextState.turnState.turnType, 'extra');
  assert.deepEqual(nextState.turnState.extraTurnState?.allowedCharacterIds, ['ATS3']);
});

test('additional turn target_condition IsFront()==1 rejects backline target', () => {
  const members = Array.from({ length: 6 }, (_, idx) =>
    new CharacterStyle({
      characterId: `ATF${idx + 1}`,
      characterName: `ATF${idx + 1}`,
      styleId: idx + 1,
      styleName: `ATFS${idx + 1}`,
      partyIndex: idx,
      position: idx,
      initialSP: 10,
      skills: [
        {
          id: 54100 + idx,
          name: idx === 0 ? 'Front Only Extra' : 'Normal',
          sp_cost: 0,
          additionalTurnRule:
            idx === 0
              ? {
                  skillUsableInExtraTurn: true,
                  additionalTurnGrantInExtraTurn: true,
                  conditions: {
                    requiresOverDrive: false,
                    requiresReinforcedMode: false,
                  },
                  additionalTurnTargets: [
                    { targetType: 'AllySingleWithoutSelf', targetCondition: 'IsFront()==1' },
                  ],
                  additionalTurnTargetTypes: ['AllySingleWithoutSelf'],
                }
              : null,
          parts:
            idx === 0
              ? [{ skill_type: 'AdditionalTurn', target_type: 'AllySingleWithoutSelf', target_condition: 'IsFront()==1' }]
              : [],
        },
      ],
    })
  );

  const state = createBattleStateFromParty(new Party(members));
  const preview = previewTurn(state, {
    0: { characterId: 'ATF1', skillId: 54100, targetCharacterId: 'ATF5' },
    1: { characterId: 'ATF2', skillId: 54101 },
    2: { characterId: 'ATF3', skillId: 54102 },
  });
  const { nextState } = commitTurn(state, preview);

  assert.equal(nextState.turnState.turnType, 'normal');
  assert.equal(nextState.party.some((m) => m.isExtraActive), false);
});

test('OD turn resumes after extra turn (OD3-1 -> EX -> OD3-2)', () => {
  const members = Array.from({ length: 6 }, (_, idx) =>
    new CharacterStyle({
      characterId: `R${idx + 1}`,
      characterName: `R${idx + 1}`,
      styleId: idx + 1,
      styleName: `RS${idx + 1}`,
      partyIndex: idx,
      position: idx,
      initialSP: 10,
      skills: [
        {
          id: 12000 + idx,
          name: idx === 0 ? 'Grant Self Extra' : 'Normal',
          sp_cost: 0,
          additionalTurnRule:
            idx === 0
              ? {
                  skillUsableInExtraTurn: true,
                  additionalTurnGrantInExtraTurn: false,
                  conditions: {
                    requiresOverDrive: false,
                    requiresReinforcedMode: false,
                    excludesExtraTurnForSkillUse: false,
                    excludesExtraTurnForAdditionalTurnGrant: true,
                  },
                  additionalTurnTargetTypes: ['Self'],
                }
              : null,
          parts: idx === 0 ? [{ skill_type: 'AdditionalTurn', target_type: 'Self' }] : [],
        },
      ],
    })
  );

  let state = createBattleStateFromParty(new Party(members));
  state.turnState.odGauge = 300;
  state = activateOverdrive(state, 3, 'preemptive');
  assert.equal(state.turnState.turnLabel, 'OD3-1');

  // OD3-1 で追加ターン付与
  const previewOd = previewTurn(state, {
    0: { characterId: 'R1', skillId: 12000 },
    1: { characterId: 'R2', skillId: 12001 },
    2: { characterId: 'R3', skillId: 12002 },
  });
  state = commitTurn(state, previewOd).nextState;
  assert.equal(state.turnState.turnType, 'extra');
  assert.equal(state.turnState.odSuspended, true);
  assert.equal(state.turnState.remainingOdActions, 2);

  // EX終了後は OD3-2 へ復帰するべき
  const previewEx = previewTurn(state, {
    0: { characterId: 'R1', skillId: 12000 },
  });
  state = commitTurn(state, previewEx).nextState;
  assert.equal(state.turnState.turnType, 'od');
  assert.equal(state.turnState.turnLabel, 'OD3-2');
  assert.equal(state.turnState.remainingOdActions, 2);
  assert.equal(state.turnState.odSuspended, false);
});

test('OD SP recovery is granted once per OD activation (no repeated +20 on OD3-2 after EX)', () => {
  const members = Array.from({ length: 6 }, (_, idx) =>
    new CharacterStyle({
      characterId: `OR${idx + 1}`,
      characterName: `OR${idx + 1}`,
      styleId: idx + 1,
      styleName: `ORS${idx + 1}`,
      partyIndex: idx,
      position: idx,
      initialSP: 10,
      skills:
        idx === 0
          ? [
              {
                id: 12100,
                name: 'Grant Self Extra',
                sp_cost: 0,
                additionalTurnRule: {
                  skillUsableInExtraTurn: true,
                  additionalTurnGrantInExtraTurn: false,
                  conditions: {
                    requiresOverDrive: false,
                    requiresReinforcedMode: false,
                    excludesExtraTurnForSkillUse: false,
                    excludesExtraTurnForAdditionalTurnGrant: true,
                  },
                  additionalTurnTargetTypes: ['Self'],
                },
                parts: [{ skill_type: 'AdditionalTurn', target_type: 'Self' }],
              },
              {
                id: 12101,
                name: 'Normal',
                sp_cost: 0,
                parts: [{ skill_type: 'AttackSkill', target_type: 'Single' }],
              },
            ]
          : [{ id: 12110 + idx, name: 'Normal', sp_cost: 0, parts: [{ skill_type: 'AttackSkill' }] }],
    })
  );

  let state = createBattleStateFromParty(new Party(members));
  state.turnState.odGauge = 300;
  state = activateOverdrive(state, 3, 'preemptive');

  // OD3-1: +20 (OD) +2 (base) = +22
  let preview = previewTurn(state, {
    0: { characterId: 'OR1', skillId: 12100 },
    1: { characterId: 'OR2', skillId: 12111 },
    2: { characterId: 'OR3', skillId: 12112 },
  });
  state = commitTurn(state, preview).nextState;
  let actor = state.party.find((m) => m.characterId === 'OR1');
  assert.equal(actor.sp.current, 32);
  assert.equal(state.turnState.turnType, 'extra');

  // EX: base回復は freeze ルールで current(32) を維持（上乗せなし）
  preview = previewTurn(state, {
    0: { characterId: 'OR1', skillId: 12101 },
  });
  state = commitTurn(state, preview).nextState;
  actor = state.party.find((m) => m.characterId === 'OR1');
  assert.equal(actor.sp.current, 32);
  assert.equal(state.turnState.turnType, 'od');
  assert.equal(state.turnState.turnLabel, 'OD3-2');

  // OD3-2: OD回復(+20)は再発しない。SPは32維持。
  preview = previewTurn(state, {
    0: { characterId: 'OR1', skillId: 12101 },
    1: { characterId: 'OR2', skillId: 12111 },
    2: { characterId: 'OR3', skillId: 12112 },
  });
  state = commitTurn(state, preview).nextState;
  actor = state.party.find((m) => m.characterId === 'OR1');
  assert.equal(actor.sp.current, 32);
});

test('OD1 preemptive + single extra returns to T1 after extra ends', () => {
  const members = Array.from({ length: 6 }, (_, idx) =>
    new CharacterStyle({
      characterId: `O${idx + 1}`,
      characterName: `O${idx + 1}`,
      styleId: idx + 1,
      styleName: `OS${idx + 1}`,
      partyIndex: idx,
      position: idx,
      initialSP: 10,
      skills: [
        {
          id: 13000 + idx,
          name: idx === 0 ? 'Grant Self Extra Once' : 'Normal',
          sp_cost: 0,
          additionalTurnRule:
            idx === 0
              ? {
                  skillUsableInExtraTurn: true,
                  additionalTurnGrantInExtraTurn: false,
                  conditions: {
                    requiresOverDrive: false,
                    requiresReinforcedMode: false,
                    excludesExtraTurnForSkillUse: false,
                    excludesExtraTurnForAdditionalTurnGrant: true,
                  },
                  additionalTurnTargetTypes: ['Self'],
                }
              : null,
          parts: idx === 0 ? [{ skill_type: 'AdditionalTurn', target_type: 'Self' }] : [],
        },
      ],
    })
  );

  let state = createBattleStateFromParty(new Party(members));
  state.turnState.odGauge = 100;
  state = activateOverdrive(state, 1, 'preemptive');
  assert.equal(state.turnState.turnLabel, 'OD1-1');

  const odPreview = previewTurn(state, {
    0: { characterId: 'O1', skillId: 13000 },
    1: { characterId: 'O2', skillId: 13001 },
    2: { characterId: 'O3', skillId: 13002 },
  });
  let committed = commitTurn(state, odPreview);
  state = committed.nextState;
  assert.equal(state.turnState.turnType, 'extra');
  assert.equal(committed.committedRecord.odTurnLabelAtStart, 'OD1-1');

  const exPreview = previewTurn(state, {
    0: { characterId: 'O1', skillId: 13000 },
  });
  committed = commitTurn(state, exPreview);
  state = committed.nextState;
  assert.equal(committed.committedRecord.odTurnLabelAtStart, 'OD1-1');
  assert.equal(state.turnState.turnType, 'normal');
  assert.equal(state.turnState.turnLabel, 'T1');
  assert.equal(state.turnState.turnIndex, 1);
});

test('OD1 preemptive + chained extras returns to T1 after all extras end', () => {
  const members = Array.from({ length: 6 }, (_, idx) =>
    new CharacterStyle({
      characterId: `Z${idx + 1}`,
      characterName: `Z${idx + 1}`,
      styleId: idx + 1,
      styleName: `ZS${idx + 1}`,
      partyIndex: idx,
      position: idx,
      initialSP: 10,
      skills:
        idx === 0
          ? [
              {
                id: 14000,
                name: 'Chain Self Extra',
                sp_cost: 0,
                additionalTurnRule: {
                  skillUsableInExtraTurn: true,
                  additionalTurnGrantInExtraTurn: true,
                  conditions: {
                    requiresOverDrive: false,
                    requiresReinforcedMode: false,
                    excludesExtraTurnForSkillUse: false,
                    excludesExtraTurnForAdditionalTurnGrant: false,
                  },
                  additionalTurnTargetTypes: ['Self'],
                },
                parts: [{ skill_type: 'AdditionalTurn', target_type: 'Self' }],
              },
              {
                id: 14001,
                name: 'End Chain',
                sp_cost: 0,
                parts: [],
              },
            ]
          : [
              {
                id: 14000 + idx + 1,
                name: 'Normal',
                sp_cost: 0,
                parts: [],
              },
            ],
    })
  );

  let state = createBattleStateFromParty(new Party(members));
  state.turnState.odGauge = 100;
  state = activateOverdrive(state, 1, 'preemptive');

  const odPreview = previewTurn(state, {
    0: { characterId: 'Z1', skillId: 14000 },
    1: { characterId: 'Z2', skillId: 14002 },
    2: { characterId: 'Z3', skillId: 14003 },
  });
  state = commitTurn(state, odPreview).nextState;
  assert.equal(state.turnState.turnType, 'extra');

  // EX, EX, EX を継続
  for (let i = 0; i < 3; i += 1) {
    const exPreview = previewTurn(state, {
      0: { characterId: 'Z1', skillId: 14000 },
    });
    state = commitTurn(state, exPreview).nextState;
    assert.equal(state.turnState.turnType, 'extra');
  }

  // 最後のEXで連鎖を止める
  const exEndPreview = previewTurn(state, {
    0: { characterId: 'Z1', skillId: 14001 },
  });
  state = commitTurn(state, exEndPreview).nextState;

  assert.equal(state.turnState.turnType, 'normal');
  assert.equal(state.turnState.turnLabel, 'T1');
  assert.equal(state.turnState.turnIndex, 1);
});

test('extra turn disallows non-allowed members from acting', () => {
  const party = createManualExtraTurnParty();
  let state = createBattleStateFromParty(party);
  state = grantExtraTurn(state, ['C1']);

  assert.throws(
    () =>
      previewTurn(state, {
        1: { characterId: 'C2', skillId: 9001 },
      }),
    /not allowed to act in extra turn/
  );
});

test('Nanase supports parallel SP/EP and EP ceiling changes in OD', () => {
  const store = getStore();
  const nanaseStyleId = 1010204; // 約束は暁の彼方で (Admiral)
  const others = getSixUsableStyleIds(store).filter((id) => store.getStyleById(id)?.chara_label !== 'NNanase');
  const styleIds = [nanaseStyleId, ...others.slice(0, 5)];
  const party = store.buildPartyFromStyleIds(styleIds, { initialSP: 10 });

  let state = createBattleStateFromParty(party);
  const nanase = state.party.find((m) => m.characterId === 'NNanase');
  assert.ok(nanase);
  assert.equal(nanase.ep.current, 0);
  assert.equal(nanase.ep.max, 10);

  // 宿る想い (SP消費 + HealEp)
  const action = {
    [String(nanase.position)]: {
      characterId: nanase.characterId,
      skillId: 46041501,
    },
  };

  const preview = previewTurn(state, action);
  assert.equal(preview.actions[0].startEP, 0);
  assert.equal(preview.actions[0].endEP, 0, '宿る想いはEP消費ではない');
  const { nextState } = commitTurn(state, preview);
  const after = nextState.party.find((m) => m.characterId === 'NNanase');
  assert.equal(after.ep.current, 5, 'HealEp +3, Admiral turn gain +1, and 咲き誇る花 +1');

  // OD発動時の+5 and 上限20
  nextState.turnState.odGauge = 100;
  state = activateOverdrive(nextState, 1, 'preemptive');
  const odNanase = state.party.find((m) => m.characterId === 'NNanase');
  assert.equal(odNanase.ep.current, 10);

  // OD中はEP上限20として扱われるため、10を超えて増加できる
  const odPreview = previewTurn(state, {
    [String(odNanase.position)]: {
      characterId: odNanase.characterId,
      skillId: 46041501,
    },
  });
  const odCommitted = commitTurn(state, odPreview);
  const odAfter = odCommitted.nextState.party.find((m) => m.characterId === 'NNanase');
  assert.equal(odAfter.ep.current > 10, true, 'OD中はEP上限20として10超過が可能');
});

test('Nanase Rider uses external EP rule while Admiral uses passive-derived EP rule', () => {
  const store = getStore();
  const riderOnly = [1010203, ...getSixUsableStyleIds(store).filter((id) => store.getStyleById(id)?.chara_label !== 'NNanase').slice(0, 5)];
  let riderState = createBattleStateFromParty(store.buildPartyFromStyleIds(riderOnly, { initialSP: 10 }));
  const riderNanase = riderState.party.find((m) => m.characterId === 'NNanase');
  assert.equal(riderNanase.epRule?.turnStartEpDelta, 2);
  const riderPreview = previewTurn(riderState, {
    [String(riderNanase.position)]: { characterId: riderNanase.characterId, skillId: riderNanase.getActionSkills()[0].skillId },
  });
  const riderCommitted = commitTurn(riderState, riderPreview);
  const riderAfter = riderCommitted.nextState.party.find((m) => m.characterId === 'NNanase');
  assert.ok(riderAfter.ep.current >= 2, 'Rider turn-start EP gain should come from override rule');

  const admiralOnly = [1010204, ...getSixUsableStyleIds(store).filter((id) => store.getStyleById(id)?.chara_label !== 'NNanase').slice(0, 5)];
  const admiralState = createBattleStateFromParty(store.buildPartyFromStyleIds(admiralOnly, { initialSP: 10 }));
  const admiralNanase = admiralState.party.find((m) => m.characterId === 'NNanase');
  assert.equal(admiralNanase.epRule, null);
  const preview = previewTurn(admiralState, {
    [String(admiralNanase.position)]: { characterId: admiralNanase.characterId, skillId: 46041501 },
  });
  const committed = commitTurn(admiralState, preview);
  const admiralAfter = committed.nextState.party.find((m) => m.characterId === 'NNanase');
  assert.equal(admiralAfter.ep.current, 5, 'Admiral EP+1, 宿る想い HealEp+3, and 咲き誇る花 HealEp+1');
});

test('HealSp AllyFront increases SP for all frontline members', () => {
  const members = Array.from({ length: 6 }, (_, idx) =>
    new CharacterStyle({
      characterId: `HSF${idx + 1}`,
      characterName: `HSF${idx + 1}`,
      styleId: idx + 1,
      styleName: `HSFS${idx + 1}`,
      partyIndex: idx,
      position: idx,
      initialSP: 10,
      skills: [
        {
          id: 51000 + idx,
          name: idx === 0 ? 'Front SP Up' : 'Normal',
          sp_cost: 0,
          parts:
            idx === 0
              ? [{ skill_type: 'HealSp', target_type: 'AllyFront', power: [3, 0] }]
              : [{ skill_type: 'AttackSkill', target_type: 'Single' }],
        },
      ],
    })
  );

  const state = createBattleStateFromParty(new Party(members));
  const preview = previewTurn(state, {
    0: { characterId: 'HSF1', skillId: 51000 },
    1: { characterId: 'HSF2', skillId: 51001 },
    2: { characterId: 'HSF3', skillId: 51002 },
  });
  const { nextState } = commitTurn(state, preview);

  const m1 = nextState.party.find((m) => m.characterId === 'HSF1');
  const m2 = nextState.party.find((m) => m.characterId === 'HSF2');
  const m3 = nextState.party.find((m) => m.characterId === 'HSF3');
  const m4 = nextState.party.find((m) => m.characterId === 'HSF4');

  // frontline: +3 (skill) +2 (base)
  assert.equal(m1.sp.current, 15);
  assert.equal(m2.sp.current, 15);
  assert.equal(m3.sp.current, 15);
  // backline: +2 (base only)
  assert.equal(m4.sp.current, 12);
});

test('HealSp AllyAll increases SP for all party members', () => {
  const members = Array.from({ length: 6 }, (_, idx) =>
    new CharacterStyle({
      characterId: `HSA${idx + 1}`,
      characterName: `HSA${idx + 1}`,
      styleId: idx + 1,
      styleName: `HSAS${idx + 1}`,
      partyIndex: idx,
      position: idx,
      initialSP: 10,
      skills: [
        {
          id: 51500 + idx,
          name: idx === 0 ? 'All SP Up' : 'Normal',
          sp_cost: 0,
          parts:
            idx === 0
              ? [{ skill_type: 'HealSp', target_type: 'AllyAll', power: [3, 0] }]
              : [{ skill_type: 'AttackSkill', target_type: 'Single' }],
        },
      ],
    })
  );

  const state = createBattleStateFromParty(new Party(members));
  const preview = previewTurn(state, {
    0: { characterId: 'HSA1', skillId: 51500 },
    1: { characterId: 'HSA2', skillId: 51501 },
    2: { characterId: 'HSA3', skillId: 51502 },
  });
  const { nextState } = commitTurn(state, preview);

  for (const member of nextState.party) {
    assert.equal(member.sp.current, 15);
  }
});

test('HealSp AllyAllWithoutSelf excludes actor and affects all allies', () => {
  const members = Array.from({ length: 6 }, (_, idx) =>
    new CharacterStyle({
      characterId: `HSAS${idx + 1}`,
      characterName: `HSAS${idx + 1}`,
      styleId: idx + 1,
      styleName: `HSASS${idx + 1}`,
      partyIndex: idx,
      position: idx,
      initialSP: 10,
      skills: [
        {
          id: 51600 + idx,
          name: idx === 0 ? 'All Other SP Up' : 'Normal',
          sp_cost: 0,
          parts:
            idx === 0
              ? [{ skill_type: 'HealSp', target_type: 'AllyAllWithoutSelf', power: [3, 0] }]
              : [{ skill_type: 'AttackSkill', target_type: 'Single' }],
        },
      ],
    })
  );

  const state = createBattleStateFromParty(new Party(members));
  const preview = previewTurn(state, {
    0: { characterId: 'HSAS1', skillId: 51600 },
    1: { characterId: 'HSAS2', skillId: 51601 },
    2: { characterId: 'HSAS3', skillId: 51602 },
  });
  const { nextState } = commitTurn(state, preview);

  const actor = nextState.party.find((m) => m.characterId === 'HSAS1');
  assert.equal(actor.sp.current, 12);
  for (const member of nextState.party.filter((m) => m.characterId !== 'HSAS1')) {
    assert.equal(member.sp.current, 15);
  }
});

test('HealSp AllySingleWithoutSelf targets one ally and excludes self', () => {
  const members = Array.from({ length: 6 }, (_, idx) =>
    new CharacterStyle({
      characterId: `HSS${idx + 1}`,
      characterName: `HSS${idx + 1}`,
      styleId: idx + 1,
      styleName: `HSSS${idx + 1}`,
      partyIndex: idx,
      position: idx,
      initialSP: 10,
      skills: [
        {
          id: 52000 + idx,
          name: idx === 0 ? 'Single Other SP Up' : 'Normal',
          sp_cost: 0,
          parts:
            idx === 0
              ? [{ skill_type: 'HealSp', target_type: 'AllySingleWithoutSelf', power: [4, 0] }]
              : [{ skill_type: 'AttackSkill', target_type: 'Single' }],
        },
      ],
    })
  );

  const state = createBattleStateFromParty(new Party(members));
  const preview = previewTurn(state, {
    0: { characterId: 'HSS1', skillId: 52000 },
    1: { characterId: 'HSS2', skillId: 52001 },
    2: { characterId: 'HSS3', skillId: 52002 },
  });
  const { nextState } = commitTurn(state, preview);

  const actor = nextState.party.find((m) => m.characterId === 'HSS1');
  const ally = nextState.party.find((m) => m.characterId === 'HSS2');

  // actor: base only
  assert.equal(actor.sp.current, 12);
  // first non-self frontline ally gets +4 then base +2
  assert.equal(ally.sp.current, 16);
});

test('HealSp AllySingleWithoutSelf respects selected targetCharacterId', () => {
  const members = Array.from({ length: 6 }, (_, idx) =>
    new CharacterStyle({
      characterId: `HST${idx + 1}`,
      characterName: `HST${idx + 1}`,
      styleId: idx + 1,
      styleName: `HSTS${idx + 1}`,
      partyIndex: idx,
      position: idx,
      initialSP: 10,
      skills: [
        {
          id: 53000 + idx,
          name: idx === 0 ? 'Single Other SP Up' : 'Normal',
          sp_cost: 0,
          parts:
            idx === 0
              ? [{ skill_type: 'HealSp', target_type: 'AllySingleWithoutSelf', power: [4, 0] }]
              : [{ skill_type: 'AttackSkill', target_type: 'Single' }],
        },
      ],
    })
  );

  const state = createBattleStateFromParty(new Party(members));
  const preview = previewTurn(state, {
    0: { characterId: 'HST1', skillId: 53000, targetCharacterId: 'HST5' },
    1: { characterId: 'HST2', skillId: 53001 },
    2: { characterId: 'HST3', skillId: 53002 },
  });
  const { nextState } = commitTurn(state, preview);

  const actor = nextState.party.find((m) => m.characterId === 'HST1');
  const t2 = nextState.party.find((m) => m.characterId === 'HST2');
  const t3 = nextState.party.find((m) => m.characterId === 'HST3');
  const t5 = nextState.party.find((m) => m.characterId === 'HST5');

  assert.equal(actor.sp.current, 12);
  assert.equal(t2.sp.current, 12, 'non-selected frontline ally should get base only');
  assert.equal(t3.sp.current, 12, 'non-selected ally should get base only');
  assert.equal(t5.sp.current, 16, 'selected backline ally should receive HealSp');
});

test('normal attack guarantees minimum 7.5% OD gain even when hit count is below 3', () => {
  const members = Array.from({ length: 6 }, (_, idx) =>
    new CharacterStyle({
      characterId: `N${idx + 1}`,
      characterName: `N${idx + 1}`,
      styleId: idx + 1,
      styleName: `S${idx + 1}`,
      partyIndex: idx,
      position: idx,
      initialSP: 10,
      skills: [
        {
          id: 9100 + idx,
          label: `N${idx + 1}AttackNormal`,
          name: '通常攻撃',
          sp_cost: 0,
          hit_count: 1,
          parts: [{ skill_type: 'AttackSkill', target_type: 'Single' }],
        },
      ],
    })
  );
  const party = new Party(members);
  const state = createBattleStateFromParty(party);
  const preview = previewTurn(state, {
    0: { characterId: 'N1', skillId: 9100 },
  });
  const { nextState } = commitTurn(state, preview);

  assert.equal(nextState.turnState.odGauge, 7.5);
});

test('normal attack uses belt element in OD resistance check', () => {
  const members = Array.from({ length: 6 }, (_, idx) =>
    new CharacterStyle({
      characterId: `NAB${idx + 1}`,
      characterName: `NAB${idx + 1}`,
      styleId: idx + 1,
      styleName: `NABS${idx + 1}`,
      partyIndex: idx,
      position: idx,
      initialSP: 10,
      normalAttackElements: idx === 0 ? ['Fire'] : [],
      skills: [
        {
          id: 11600 + idx,
          name: '通常攻撃',
          label: `NABAttackNormal${idx + 1}`,
          sp_cost: 0,
          hit_count: 1,
          target_type: 'Single',
          parts: [{ skill_type: 'AttackNormal', target_type: 'Single', type: 'Slash' }],
        },
      ],
    })
  );
  const state = createBattleStateFromParty(new Party(members));

  state.turnState.enemyState = {
    enemyCount: 1,
    statuses: [],
    damageRatesByEnemy: {
      0: { Slash: 100, Fire: 50 },
    },
  };
  let preview = previewTurn(state, {
    0: { characterId: 'NAB1', skillId: 11600 },
  });
  let committed = commitTurn(state, preview);
  assert.equal(committed.nextState.turnState.odGauge, 0);

  state.turnState.enemyState.damageRatesByEnemy = {
    0: { Slash: 300, Fire: 50 },
  };
  preview = previewTurn(state, {
    0: { characterId: 'NAB1', skillId: 11600 },
  });
  committed = commitTurn(state, preview);
  assert.equal(committed.nextState.turnState.odGauge, 7.5);
});

test('skill attack increases OD gauge by hit_count * 2.5%', () => {
  const members = Array.from({ length: 6 }, (_, idx) =>
    new CharacterStyle({
      characterId: `A${idx + 1}`,
      characterName: `A${idx + 1}`,
      styleId: idx + 1,
      styleName: `S${idx + 1}`,
      partyIndex: idx,
      position: idx,
      initialSP: 10,
      skills: [
        {
          id: 9200 + idx,
          name: idx === 0 ? 'Hit5 Attack' : 'Buff',
          sp_cost: 1,
          hit_count: idx === 0 ? 5 : 0,
          parts:
            idx === 0
              ? [{ skill_type: 'AttackSkill', target_type: 'Single' }]
              : [{ skill_type: 'AttackUp', target_type: 'Self' }],
        },
      ],
    })
  );
  const party = new Party(members);
  const state = createBattleStateFromParty(party);
  const preview = previewTurn(state, {
    0: { characterId: 'A1', skillId: 9200 },
    1: { characterId: 'A2', skillId: 9201 },
  });
  const { nextState } = commitTurn(state, preview);

  assert.equal(nextState.turnState.odGauge, 12.5);
});

test('non-damaging debuff skill with hit_count does not increase OD gauge', () => {
  const members = Array.from({ length: 6 }, (_, idx) =>
    new CharacterStyle({
      characterId: `D${idx + 1}`,
      characterName: `D${idx + 1}`,
      styleId: idx + 1,
      styleName: `S${idx + 1}`,
      partyIndex: idx,
      position: idx,
      initialSP: 10,
      skills: [
        {
          id: 9300 + idx,
          name: idx === 0 ? 'Weaken-like' : 'Normal',
          sp_cost: 1,
          hit_count: 1,
          parts:
            idx === 0
              ? [
                  { skill_type: 'AttackDown', target_type: 'Single' },
                  { skill_type: 'RemoveBuff', target_type: 'Single' },
                ]
              : [{ skill_type: 'AttackSkill', target_type: 'Single' }],
        },
      ],
    })
  );
  const party = new Party(members);
  const state = createBattleStateFromParty(party);
  const preview = previewTurn(state, {
    0: { characterId: 'D1', skillId: 9300 },
  });
  const { nextState } = commitTurn(state, preview);

  assert.equal(nextState.turnState.odGauge, 0);
});

test('non-damaging skill-switch with hit_count does not increase OD gauge', () => {
  const members = Array.from({ length: 6 }, (_, idx) =>
    new CharacterStyle({
      characterId: `S${idx + 1}`,
      characterName: `S${idx + 1}`,
      styleId: idx + 1,
      styleName: `Style${idx + 1}`,
      partyIndex: idx,
      position: idx,
      initialSP: 10,
      skills: [
        {
          id: 9400 + idx,
          name: idx === 0 ? 'Aoharu-like' : 'Normal',
          sp_cost: 1,
          hit_count: 1,
          parts:
            idx === 0
              ? [
                  {
                    skill_type: 'SkillSwitch',
                    target_type: 'All',
                    strval: [
                      {
                        id: 994001,
                        name: 'Branch A',
                        hit_count: 1,
                        parts: [{ skill_type: 'AttackUp', target_type: 'AllyAll' }],
                      },
                      {
                        id: 994002,
                        name: 'Branch B',
                        hit_count: 1,
                        parts: [{ skill_type: 'CriticalRateUp', target_type: 'AllyAll' }],
                      },
                    ],
                  },
                ]
              : [{ skill_type: 'AttackSkill', target_type: 'Single' }],
        },
      ],
    })
  );
  const party = new Party(members);
  const state = createBattleStateFromParty(party);
  const preview = previewTurn(state, {
    0: { characterId: 'S1', skillId: 9400 },
  });
  const { nextState } = commitTurn(state, preview);

  assert.equal(nextState.turnState.odGauge, 0);
});

test('all-target attack scales OD gain by enemy count', () => {
  const members = Array.from({ length: 6 }, (_, idx) =>
    new CharacterStyle({
      characterId: `E${idx + 1}`,
      characterName: `E${idx + 1}`,
      styleId: idx + 1,
      styleName: `S${idx + 1}`,
      partyIndex: idx,
      position: idx,
      initialSP: 10,
      skills: [
        {
          id: 9500 + idx,
          name: idx === 0 ? 'AoE Attack' : 'Normal',
          sp_cost: 1,
          hit_count: 2,
          target_type: idx === 0 ? 'All' : 'Single',
          parts: [{ skill_type: 'AttackSkill', target_type: idx === 0 ? 'All' : 'Single' }],
        },
      ],
    })
  );
  const party = new Party(members);
  const state = createBattleStateFromParty(party);
  const preview = previewTurn(
    state,
    {
      0: { characterId: 'E1', skillId: 9500 },
    },
    null,
    3
  );
  const { nextState } = commitTurn(state, preview);

  assert.equal(nextState.turnState.odGauge, 15, '2 hits * 3 enemies * 2.5%');
});

test('all-target attack with drive uses per-hit truncation before total hit multiplication', () => {
  const members = Array.from({ length: 6 }, (_, idx) =>
    new CharacterStyle({
      characterId: `H${idx + 1}`,
      characterName: `H${idx + 1}`,
      styleId: idx + 1,
      styleName: `S${idx + 1}`,
      partyIndex: idx,
      position: idx,
      initialSP: 20,
      drivePiercePercent: idx === 0 ? 15 : 0,
      skills: [
        {
          id: 9700 + idx,
          name: idx === 0 ? 'Hit12 AoE Attack' : 'Normal',
          sp_cost: 1,
          hit_count: 12,
          target_type: 'All',
          parts: [{ skill_type: 'AttackSkill', target_type: 'All' }],
        },
      ],
    })
  );
  const party = new Party(members);
  let state = createBattleStateFromParty(party);

  for (let i = 0; i < 2; i += 1) {
    const preview = previewTurn(
      state,
      {
        0: { characterId: 'H1', skillId: 9700 },
      },
      null,
      3
    );
    state = commitTurn(state, preview).nextState;
  }

  // per-hit truncation model:
  // bonus(hit=12, drive15)=15%
  // per-hit = trunc2(2.5 * 1.15) = 2.87
  // one action (12hit * 3targets) = trunc2(2.87 * 36) = 103.32
  // two actions = 206.64 -> floor 206
  assert.equal(Math.floor(state.turnState.odGauge), 206);
});

test('single-target attack does not scale OD gain by enemy count', () => {
  const members = Array.from({ length: 6 }, (_, idx) =>
    new CharacterStyle({
      characterId: `F${idx + 1}`,
      characterName: `F${idx + 1}`,
      styleId: idx + 1,
      styleName: `S${idx + 1}`,
      partyIndex: idx,
      position: idx,
      initialSP: 10,
      skills: [
        {
          id: 9600 + idx,
          name: idx === 0 ? 'Single Attack' : 'Normal',
          sp_cost: 1,
          hit_count: 2,
          target_type: 'Single',
          parts: [{ skill_type: 'AttackSkill', target_type: 'Single' }],
        },
      ],
    })
  );
  const party = new Party(members);
  const state = createBattleStateFromParty(party);
  const preview = previewTurn(
    state,
    {
      0: { characterId: 'F1', skillId: 9600 },
    },
    null,
    3
  );
  const { nextState } = commitTurn(state, preview);

  assert.equal(nextState.turnState.odGauge, 5, 'single-target remains 2 hits * 2.5%');
});

test('single-target attack does not gain OD when combined damage rate is below 100%', () => {
  const members = Array.from({ length: 6 }, (_, idx) =>
    new CharacterStyle({
      characterId: `ODR${idx + 1}`,
      characterName: `ODR${idx + 1}`,
      styleId: idx + 1,
      styleName: `ODRS${idx + 1}`,
      partyIndex: idx,
      position: idx,
      initialSP: 10,
      skills: [
        {
          id: 14000 + idx,
          name: idx === 0 ? 'Resisted Slash' : 'Normal',
          label: idx === 0 ? 'ResistedSlash' : `ODRSkill${idx + 1}`,
          sp_cost: 0,
          hit_count: idx === 0 ? 2 : 0,
          target_type: 'Single',
          parts: idx === 0 ? [{ skill_type: 'AttackSkill', target_type: 'Single', type: 'Slash' }] : [],
        },
      ],
    })
  );
  const state = createBattleStateFromParty(new Party(members));
  state.turnState.enemyState = {
    enemyCount: 1,
    statuses: [],
    damageRatesByEnemy: {
      0: { Slash: 50 },
    },
  };

  const preview = previewTurn(state, {
    0: { characterId: 'ODR1', skillId: 14000 },
  });
  const { nextState } = commitTurn(state, preview);
  assert.equal(nextState.turnState.odGauge, 0);
});

test('single-target attack uses selected enemy target for OD resistance check', () => {
  const members = Array.from({ length: 6 }, (_, idx) =>
    new CharacterStyle({
      characterId: `ODT${idx + 1}`,
      characterName: `ODT${idx + 1}`,
      styleId: idx + 1,
      styleName: `ODTS${idx + 1}`,
      partyIndex: idx,
      position: idx,
      initialSP: 10,
      skills: [
        {
          id: 14050 + idx,
          name: idx === 0 ? 'Targeted Slash' : 'Normal',
          label: idx === 0 ? 'TargetedSlash' : `ODTSkill${idx + 1}`,
          sp_cost: 0,
          hit_count: idx === 0 ? 2 : 0,
          target_type: 'Single',
          parts: idx === 0 ? [{ skill_type: 'AttackSkill', target_type: 'Single', type: 'Slash' }] : [],
        },
      ],
    })
  );
  const state = createBattleStateFromParty(new Party(members));
  state.turnState.enemyState = {
    enemyCount: 2,
    statuses: [],
    damageRatesByEnemy: {
      0: { Slash: 50 },
      1: { Slash: 150 },
    },
  };

  const preview = previewTurn(
    state,
    {
      0: { characterId: 'ODT1', skillId: 14050, targetEnemyIndex: 1 },
    },
    null,
    2
  );
  const { nextState } = commitTurn(state, preview);
  assert.equal(nextState.turnState.odGauge, 5);
});

test('damage context keeps target enemy and effective rates for multi-enemy OD analysis', () => {
  const members = Array.from({ length: 6 }, (_, idx) =>
    new CharacterStyle({
      characterId: `CTX${idx + 1}`,
      characterName: `CTX${idx + 1}`,
      styleId: idx + 1,
      styleName: `CTXS${idx + 1}`,
      partyIndex: idx,
      position: idx,
      initialSP: 10,
      skills: [
        {
          id: 15050 + idx,
          name: idx === 0 ? 'Targeted Thunder Slash' : 'Normal',
          label: idx === 0 ? 'TargetedThunderSlash' : `CTXSkill${idx + 1}`,
          sp_cost: 0,
          hit_count: idx === 0 ? 2 : 0,
          target_type: 'Single',
          parts:
            idx === 0
              ? [{ skill_type: 'AttackSkill', target_type: 'Single', type: 'Slash', elements: ['Thunder'] }]
              : [],
        },
      ],
    })
  );
  const state = createBattleStateFromParty(new Party(members));
  state.turnState.enemyState = {
    enemyCount: 2,
    statuses: [],
    damageRatesByEnemy: {
      0: { Slash: 300, Thunder: 50 },
      1: { Slash: 50, Thunder: 50 },
    },
  };

  const preview = previewTurn(
    state,
    {
      0: { characterId: 'CTX1', skillId: 15050, targetEnemyIndex: 0 },
    },
    null,
    2
  );
  const { committedRecord } = commitTurn(state, preview);
  const damageContext = committedRecord.actions[0].damageContext;

  assert.ok(damageContext);
  assert.equal(damageContext.targetEnemyIndex, 0);
  assert.deepEqual(damageContext.eligibleEnemyIndexes, [0]);
  assert.equal(damageContext.effectiveDamageRatesByEnemy['0'], 150);
  assert.equal(damageContext.effectiveDamageRatesByEnemy['1'], undefined);
});

test('damage context keeps all-target enemy eligibility and effective rates', () => {
  const members = Array.from({ length: 6 }, (_, idx) =>
    new CharacterStyle({
      characterId: `CTXA${idx + 1}`,
      characterName: `CTXA${idx + 1}`,
      styleId: idx + 1,
      styleName: `CTXAS${idx + 1}`,
      partyIndex: idx,
      position: idx,
      initialSP: 10,
      skills: [
        {
          id: 15150 + idx,
          name: idx === 0 ? 'All Slash' : 'Normal',
          label: idx === 0 ? 'AllSlash' : `CTXASkill${idx + 1}`,
          sp_cost: 0,
          hit_count: idx === 0 ? 1 : 0,
          target_type: 'All',
          parts: idx === 0 ? [{ skill_type: 'AttackSkill', target_type: 'All', type: 'Slash' }] : [],
        },
      ],
    })
  );
  const state = createBattleStateFromParty(new Party(members));
  state.turnState.enemyState = {
    enemyCount: 3,
    statuses: [],
    damageRatesByEnemy: {
      0: { Slash: 50 },
      1: { Slash: 100 },
      2: { Slash: 150 },
    },
  };

  const preview = previewTurn(
    state,
    {
      0: { characterId: 'CTXA1', skillId: 15150 },
    },
    null,
    3
  );
  const { committedRecord } = commitTurn(state, preview);
  const damageContext = committedRecord.actions[0].damageContext;

  assert.ok(damageContext);
  assert.equal(damageContext.targetEnemyIndex, null);
  assert.deepEqual(damageContext.eligibleEnemyIndexes, [1, 2]);
  assert.equal(damageContext.effectiveDamageRatesByEnemy['0'], 50);
  assert.equal(damageContext.effectiveDamageRatesByEnemy['1'], 100);
  assert.equal(damageContext.effectiveDamageRatesByEnemy['2'], 150);
});

test('all-target attack gains OD only from enemies whose combined damage rate is at least 100%', () => {
  const members = Array.from({ length: 6 }, (_, idx) =>
    new CharacterStyle({
      characterId: `ODA${idx + 1}`,
      characterName: `ODA${idx + 1}`,
      styleId: idx + 1,
      styleName: `ODAS${idx + 1}`,
      partyIndex: idx,
      position: idx,
      initialSP: 10,
      skills: [
        {
          id: 14100 + idx,
          name: idx === 0 ? 'All Slash Fire' : 'Normal',
          label: idx === 0 ? 'AllSlashFire' : `ODASkill${idx + 1}`,
          sp_cost: 0,
          hit_count: idx === 0 ? 2 : 0,
          target_type: 'All',
          parts:
            idx === 0
              ? [{ skill_type: 'AttackSkill', target_type: 'All', type: 'Slash', elements: ['Fire'] }]
              : [],
        },
      ],
    })
  );
  const state = createBattleStateFromParty(new Party(members));
  state.turnState.enemyState = {
    enemyCount: 3,
    statuses: [],
    damageRatesByEnemy: {
      0: { Slash: 300, Fire: 50 },
      1: { Slash: 80, Fire: 100 },
      2: { Slash: 120, Fire: 100 },
    },
  };

  const preview = previewTurn(
    state,
    {
      0: { characterId: 'ODA1', skillId: 14100 },
    },
    null,
    3
  );
  const { nextState } = commitTurn(state, preview);
  assert.equal(nextState.turnState.odGauge, 10, '2 hits * 2 eligible enemies * 2.5%');
});

test('manual-compare case: Ruka Thunder Pulse vs 3 enemies with Drive Pierce 15% for 10 turns', () => {
  const store = getStore();
  const rukaStyleId = 1001107; // ナイトクルーズ・エスコート (サンダーパルス所持)
  const others = getSixUsableStyleIds(store).filter((id) => store.getStyleById(id)?.chara_label !== 'RKayamori');
  const styleIds = [rukaStyleId, ...others.slice(0, 5)];
  const party = store.buildPartyFromStyleIds(styleIds, {
    initialSP: 10,
    drivePierceByPartyIndex: { 0: 15 },
  });
  let state = createBattleStateFromParty(party);
  const ruka = state.party.find((m) => m.characterId === 'RKayamori');
  assert.ok(ruka);

  const flooredByTurn = [];
  for (let i = 0; i < 10; i += 1) {
    const preview = previewTurn(
      state,
      {
        [String(ruka.position)]: {
          characterId: ruka.characterId,
          skillId: 46001111, // サンダーパルス (2hit, All)
        },
      },
      null,
      3
    );
    state = commitTurn(state, preview).nextState;
    flooredByTurn.push(Math.floor(state.turnState.odGauge));
  }

  // 仕様:
  // - ODゲージは小数第2位まで保持し、第3位以下を切り捨て
  // - 攻撃ぶんODは1hitごとに計算し、小数第2位で切り捨てて合算
  // - サンダーパルス(2hit) + ドライブ15%(2hit=>+6.11%) の場合
  //   敵1体ぶん: trunc2(2 * 2.5 * 1.0611) = trunc2(5.3055) = 5.30
  //   敵3体合計: 15.90
  //   10ターン: 159.00
  assert.equal(state.turnState.odGauge, 159);
  assert.deepEqual(flooredByTurn.slice(0, 4), [15, 31, 47, 63]);
});

test('AttackSkill + OverDrivePointUp applies drive bonus and max self-parameter assumption', () => {
  const store = getStore();
  const cases = [
    // 実機確認値: 渾身銃撃=18, 海のギャング=71, サービス・エース=21
    { skillId: 46004504, expected: 18, breakHitCount: 0 },
    { skillId: 46005605, expected: 71, breakHitCount: 0 },
    { skillId: 46005502, expected: 21, breakHitCount: 0 },
  ];

  for (const c of cases) {
    const styleId = findStyleIdBySkillId(store, c.skillId);
    const others = getSixUsableStyleIds(store).filter((id) => id !== styleId);
    const styleIds = [styleId, ...others.slice(0, 5)];
    const party = store.buildPartyFromStyleIds(styleIds, {
      initialSP: 20,
      drivePierceByPartyIndex: { 0: 15 },
    });
    const actor = party.getByPosition(0);
    const state = createBattleStateFromParty(party);

    const preview = previewTurn(state, {
      0: {
        characterId: actor.characterId,
        skillId: c.skillId,
        breakHitCount: c.breakHitCount,
      },
    });
    const { nextState } = commitTurn(state, preview);
    assert.equal(
      Math.floor(nextState.turnState.odGauge),
      c.expected,
      `skillId=${c.skillId} should match confirmed OD integer`
    );
  }
});

test('OverDrivePointUp condition BreakHitCount()>0 is evaluated from action context', () => {
  const store = getStore();
  const skillId = 46005507; // 哀のスノードロップ
  const styleId = findStyleIdBySkillId(store, skillId);
  const others = getSixUsableStyleIds(store).filter((id) => id !== styleId);
  const styleIds = [styleId, ...others.slice(0, 5)];
  const party = store.buildPartyFromStyleIds(styleIds, {
    initialSP: 20,
    drivePierceByPartyIndex: { 0: 15 },
  });
  const actor = party.getByPosition(0);

  // 非ブレイク時: 攻撃ぶんのみ
  let state = createBattleStateFromParty(party);
  let preview = previewTurn(state, {
    0: { characterId: actor.characterId, skillId, breakHitCount: 0 },
  });
  let committed = commitTurn(state, preview);
  assert.equal(Math.floor(committed.nextState.turnState.odGauge), 5);

  // ブレイク時: OverDrivePointUp(+150%)を追加
  state = createBattleStateFromParty(party);
  preview = previewTurn(state, {
    0: { characterId: actor.characterId, skillId, breakHitCount: 1 },
  });
  committed = commitTurn(state, preview);
  assert.equal(Math.floor(committed.nextState.turnState.odGauge), 164);
});

test('non-damaging OD gain skill applies drive bonus and first-use branching (Compensation)', () => {
  const store = getStore();
  const skillId = 46005308; // コンペンセーション
  const styleId = findStyleIdBySkillId(store, skillId);
  const others = getSixUsableStyleIds(store).filter((id) => id !== styleId);
  const styleIds = [styleId, ...others.slice(0, 5)];
  const party = store.buildPartyFromStyleIds(styleIds, {
    initialSP: 20,
    drivePierceByPartyIndex: { 0: 0 },
  });
  const actor = party.getByPosition(0);

  // 1回目: 装備なしの素の状態ではスキル本体ぶん 75% のみ。
  // 究極のスリルは T2 開始条件なので、T1 の committed record には混ざらない。
  let state = createBattleStateFromParty(party);
  let preview = previewTurn(state, {
    0: { characterId: actor.characterId, skillId },
  });
  let committed = commitTurn(state, preview);
  assert.ok(Math.abs(committed.committedRecord.actions[0].odGaugeGain - 75) < 0.01);
  assert.equal(
    committed.committedRecord.passiveEvents.some(
      (event) =>
        event.characterId === actor.characterId &&
        event.passiveName === '究極のスリル'
    ),
    false
  );
  assert.equal(committed.nextState.party[0].dpState.currentDp, 1);

  // 2回目: 開始時点で DP50%未満なので、T2 の committed record には究極のスリルが現れる。
  // スキル本体は 25% 側に切り替わる。
  state = committed.nextState;
  preview = previewTurn(state, {
    0: { characterId: actor.characterId, skillId },
  });
  committed = commitTurn(state, preview);
  assert.ok(Math.abs(committed.committedRecord.actions[0].odGaugeGain - 25) < 0.01);
  assert.equal(committed.nextState.party[0].dpState.currentDp, 1);
  assert.ok(
    committed.committedRecord.passiveEvents.some(
      (event) =>
        event.characterId === actor.characterId &&
        event.passiveName === '究極のスリル' &&
        event.effectTypes.includes('OverDrivePointUp') &&
        Number(event.odGaugeDelta ?? 0) === 10
    )
  );
});

test('od gauge is capped at 300%', () => {
  const members = Array.from({ length: 6 }, (_, idx) =>
    new CharacterStyle({
      characterId: `C${idx + 1}`,
      characterName: `C${idx + 1}`,
      styleId: idx + 1,
      styleName: `S${idx + 1}`,
      partyIndex: idx,
      position: idx,
      initialSP: 20,
      drivePiercePercent: idx === 0 ? 15 : 0,
      skills: [
        {
          id: 9800 + idx,
          name: idx === 0 ? 'Big AoE' : 'Normal',
          sp_cost: 1,
          hit_count: 12,
          target_type: 'All',
          parts: [{ skill_type: 'AttackSkill', target_type: idx === 0 ? 'All' : 'Single' }],
        },
      ],
    })
  );

  const party = new Party(members);
  let state = createBattleStateFromParty(party);
  state.turnState.odGauge = 299.5;
  const preview = previewTurn(
    state,
    {
      0: { characterId: 'C1', skillId: 9800 },
    },
    null,
    3
  );
  const { nextState } = commitTurn(state, preview);
  assert.equal(nextState.turnState.odGauge, 300);
});

test('OverDrivePointDown reduces od gauge and lower bound is -999.99', () => {
  const members = Array.from({ length: 6 }, (_, idx) =>
    new CharacterStyle({
      characterId: `D${idx + 1}`,
      characterName: `D${idx + 1}`,
      styleId: idx + 1,
      styleName: `S${idx + 1}`,
      partyIndex: idx,
      position: idx,
      initialSP: 20,
      skills: [
        {
          id: 9900 + idx,
          name: idx === 0 ? 'Spend OD 50' : 'Normal',
          sp_cost: 0,
          hit_count: -1,
          target_type: 'Self',
          parts:
            idx === 0
              ? [{ skill_type: 'OverDrivePointDown', target_type: 'Self', power: [0.5, 0] }]
              : [{ skill_type: 'AttackSkill', target_type: 'Single' }],
        },
      ],
    })
  );

  const party = new Party(members);
  let state = createBattleStateFromParty(party);
  state.turnState.odGauge = 40;
  let preview = previewTurn(state, {
    0: { characterId: 'D1', skillId: 9900 },
  });
  let committed = commitTurn(state, preview);
  assert.equal(committed.nextState.turnState.odGauge, -10);

  state = createBattleStateFromParty(party);
  state.turnState.odGauge = 184.7;
  preview = previewTurn(state, {
    0: { characterId: 'D1', skillId: 9900 },
  });
  committed = commitTurn(state, preview);
  assert.equal(committed.nextState.turnState.odGauge, 134.7);

  state = createBattleStateFromParty(party);
  state.turnState.odGauge = -990;
  preview = previewTurn(state, {
    0: { characterId: 'D1', skillId: 9900 },
  });
  committed = commitTurn(state, preview);
  assert.equal(committed.nextState.turnState.odGauge, -999.99);
});

test('skill with IsOverDrive() condition is unusable outside OD and usable in OD', () => {
  const members = Array.from({ length: 6 }, (_, idx) =>
    new CharacterStyle({
      characterId: `OD${idx + 1}`,
      characterName: `OD${idx + 1}`,
      styleId: idx + 1,
      styleName: `ODS${idx + 1}`,
      partyIndex: idx,
      position: idx,
      initialSP: 10,
      skills: [
        {
          id: 10000 + idx,
          name: 'OD Only Skill',
          label: `ODOnly${idx + 1}`,
          sp_cost: 0,
          cond: 'IsOverDrive()',
          parts: [],
        },
      ],
    })
  );
  const party = new Party(members);
  let state = createBattleStateFromParty(party);

  assert.throws(
    () =>
      previewTurn(state, {
        0: { characterId: 'OD1', skillId: 10000 },
      }),
    /cannot be used because cond is not satisfied/
  );

  state.turnState.odGauge = 100;
  state = activateOverdrive(state, 1, 'preemptive');
  const preview = previewTurn(state, {
    0: { characterId: 'OD1', skillId: 10000 },
  });
  assert.equal(preview.actions.length, 1);
});

test('skill with IsOverDrive()==0 is unusable in OD and usable outside OD', () => {
  const members = Array.from({ length: 6 }, (_, idx) =>
    new CharacterStyle({
      characterId: `ODZ${idx + 1}`,
      characterName: `ODZ${idx + 1}`,
      styleId: idx + 1,
      styleName: `ODZS${idx + 1}`,
      partyIndex: idx,
      position: idx,
      initialSP: 10,
      skills: [
        {
          id: 10200 + idx,
          name: 'OD Forbidden Skill',
          label: `ODForbidden${idx + 1}`,
          sp_cost: 0,
          cond: 'IsOverDrive()==0',
          parts: [],
        },
      ],
    })
  );
  const party = new Party(members);
  let state = createBattleStateFromParty(party);

  const normalPreview = previewTurn(state, {
    0: { characterId: 'ODZ1', skillId: 10200 },
  });
  assert.equal(normalPreview.actions.length, 1);

  state.turnState.odGauge = 100;
  state = activateOverdrive(state, 1, 'preemptive');
  assert.throws(
    () =>
      previewTurn(state, {
        0: { characterId: 'ODZ1', skillId: 10200 },
      }),
    /cannot be used because cond is not satisfied/
  );
});

test('CountBC(...BreakDownTurn()>0) is evaluated from enemy down-turn state', () => {
  const members = Array.from({ length: 6 }, (_, idx) =>
    new CharacterStyle({
      characterId: `ED${idx + 1}`,
      characterName: `ED${idx + 1}`,
      styleId: idx + 1,
      styleName: `EDS${idx + 1}`,
      partyIndex: idx,
      position: idx,
      initialSP: 10,
      skills:
        idx === 0
          ? [
              {
                id: 18000,
                name: 'BreakDown Dependent',
                label: 'BreakDownDependent',
                sp_cost: 0,
                iuc_cond: 'CountBC(IsPlayer()==0&&IsDead()==0&&BreakDownTurn()>0)>0',
                parts: [],
              },
            ]
          : [{ id: 18000 + idx, name: 'Normal', label: `EDSkill${idx + 1}`, sp_cost: 0, parts: [] }],
    })
  );
  const party = new Party(members);
  const state = createBattleStateFromParty(party);

  assert.throws(
    () =>
      previewTurn(state, {
        0: { characterId: 'ED1', skillId: 18000 },
      }),
    /cannot be used/i
  );

  state.turnState.enemyState = {
    enemyCount: 1,
    statuses: [{ statusType: 'DownTurn', targetIndex: 0, remainingTurns: 1 }],
  };
  const preview = previewTurn(state, {
    0: { characterId: 'ED1', skillId: 18000 },
  });
  const { nextState } = commitTurn(state, preview);
  assert.equal(
    nextState.turnState.enemyState.statuses.length,
    0,
    'down turn should tick when base turn advances (enemy turn consumed)'
  );
});

test('CountBC(...IsBroken()==1) is evaluated from enemy break status', () => {
  const members = Array.from({ length: 6 }, (_, idx) =>
    new CharacterStyle({
      characterId: `EB${idx + 1}`,
      characterName: `EB${idx + 1}`,
      styleId: idx + 1,
      styleName: `EBS${idx + 1}`,
      partyIndex: idx,
      position: idx,
      initialSP: 10,
      skills:
        idx === 0
          ? [
              {
                id: 18100,
                name: 'Break Hunter',
                label: 'BreakHunter',
                sp_cost: 0,
                iuc_cond: 'CountBC(IsPlayer()==0 && IsDead()==0 && IsBroken()==1)>0',
                parts: [],
              },
            ]
          : [{ id: 18100 + idx, name: 'Normal', label: `EBSkill${idx + 1}`, sp_cost: 0, parts: [] }],
    })
  );
  const state = createBattleStateFromParty(new Party(members));

  assert.throws(
    () =>
      previewTurn(state, {
        0: { characterId: 'EB1', skillId: 18100 },
      }),
    /cannot be used/i
  );

  state.turnState.enemyState = {
    enemyCount: 2,
    statuses: [{ statusType: 'Break', targetIndex: 1, remainingTurns: 2 }],
  };
  const preview = previewTurn(state, {
    0: { characterId: 'EB1', skillId: 18100 },
  });
  assert.equal(preview.actions.length, 1);
});

test('SuperBreak only upgrades weak broken targets and records StrongBreak state', () => {
  const party = createSixMemberManualParty((idx) =>
    idx === 0
      ? {
          skills: [
            {
              id: 18120,
              name: '光輝の夜明け',
              sp_cost: 0,
              target_type: 'All',
              parts: [
                {
                  skill_type: 'SuperBreak',
                  target_type: 'All',
                  elements: ['Light'],
                  cond: 'IsHitWeak()',
                },
              ],
            },
          ],
        }
      : {}
  );
  const state = createBattleStateFromParty(party);
  state.turnState.enemyState = {
    enemyCount: 2,
    statuses: [
      { statusType: 'Break', targetIndex: 0, remainingTurns: 0 },
      { statusType: 'Break', targetIndex: 1, remainingTurns: 0 },
    ],
    damageRatesByEnemy: {
      0: { Light: 150 },
      1: { Light: 50 },
    },
    destructionRateByEnemy: {
      0: 180,
      1: 220,
    },
  };

  const preview = previewTurn(state, {
    0: { characterId: 'M1', skillId: 18120 },
  });
  const committed = commitTurn(state, preview);
  const action = committed.committedRecord.actions.find((entry) => entry.characterId === 'M1');
  const nextEnemyState = committed.nextState.turnState.enemyState;

  assert.equal(
    nextEnemyState.statuses.some((status) => status.statusType === 'StrongBreak' && status.targetIndex === 0),
    true
  );
  assert.equal(
    nextEnemyState.statuses.some((status) => status.statusType === 'StrongBreak' && status.targetIndex === 1),
    false
  );
  assert.equal(nextEnemyState.destructionRateCapByEnemy['0'], 600);
  assert.equal(nextEnemyState.destructionRateCapByEnemy['1'], undefined);
  assert.equal(action.enemyStatusChanges.length, 1);
  assert.equal(action.enemyStatusChanges[0].mode, 'StrongBreak');
  assert.equal(action.enemyStatusChanges[0].targetIndex, 0);
});

test('CountBC(...IsWeakElement(Fire)==1) is evaluated from enemy damage rates', () => {
  const members = Array.from({ length: 6 }, (_, idx) =>
    new CharacterStyle({
      characterId: `EW${idx + 1}`,
      characterName: `EW${idx + 1}`,
      styleId: idx + 1,
      styleName: `EWS${idx + 1}`,
      partyIndex: idx,
      position: idx,
      initialSP: 10,
      skills:
        idx === 0
          ? [
              {
                id: 18150,
                name: 'Weak Hunter',
                label: 'WeakHunter',
                sp_cost: 0,
                iuc_cond: 'CountBC(IsPlayer()==0 && IsDead()==0 && IsWeakElement(Fire)==1)>0',
                parts: [],
              },
            ]
          : [{ id: 18150 + idx, name: 'Normal', label: `EWSkill${idx + 1}`, sp_cost: 0, parts: [] }],
    })
  );
  const state = createBattleStateFromParty(new Party(members));

  assert.throws(
    () =>
      previewTurn(state, {
        0: { characterId: 'EW1', skillId: 18150 },
      }),
    /cannot be used/i
  );

  state.turnState.enemyState = {
    enemyCount: 2,
    statuses: [],
    damageRatesByEnemy: {
      0: { Fire: 120, Ice: 100 },
      1: { Fire: 100 },
    },
  };
  const preview = previewTurn(state, {
    0: { characterId: 'EW1', skillId: 18150 },
  });
  assert.equal(preview.actions.length, 1);
});

test('IsWeakElement defaults to false when enemy damage rate is not above 100%', () => {
  const members = Array.from({ length: 6 }, (_, idx) =>
    new CharacterStyle({
      characterId: `EWD${idx + 1}`,
      characterName: `EWD${idx + 1}`,
      styleId: idx + 1,
      styleName: `EWDS${idx + 1}`,
      partyIndex: idx,
      position: idx,
      initialSP: 10,
      skills:
        idx === 0
          ? [
              {
                id: 18180,
                name: 'Weak Hunter Default',
                label: 'WeakHunterDefault',
                sp_cost: 0,
                iuc_cond: 'CountBC(IsPlayer()==0 && IsDead()==0 && IsWeakElement(Ice)==1)>0',
                parts: [],
              },
            ]
          : [{ id: 18180 + idx, name: 'Normal', label: `EWDSkill${idx + 1}`, sp_cost: 0, parts: [] }],
    })
  );
  const state = createBattleStateFromParty(new Party(members));
  state.turnState.enemyState = {
    enemyCount: 2,
    statuses: [],
    damageRatesByEnemy: {
      0: { Ice: 100 },
      1: { Fire: 130 },
    },
  };

  assert.throws(
    () =>
      previewTurn(state, {
        0: { characterId: 'EWD1', skillId: 18180 },
      }),
    /cannot be used/i
  );
});

test('Zone skill applies zone state and IsZone condition becomes true on next turn', () => {
  const party = createSixMemberManualParty((idx) =>
    idx === 0
      ? {
          elements: ['Fire'],
          skills: [
            {
              id: 8101,
              name: '火フィールド',
              label: 'FireZoneSkill',
              sp_cost: 5,
              target_type: 'Field',
              parts: [
                {
                  skill_type: 'Zone',
                  target_type: 'Field',
                  elements: ['Fire'],
                  power: [1.8, 0],
                  effect: { exitCond: 'PlayerTurnEnd', exitVal: [8, 0] },
                },
              ],
            },
          ],
        }
      : {}
  );
  const state = createBattleStateFromParty(party);

  const preview = previewTurn(state, {
    0: { characterId: 'M1', skillId: 8101 },
  });
  const { nextState, committedRecord } = commitTurn(state, preview);

  assert.deepEqual(nextState.turnState.zoneState, {
    type: 'Fire',
    sourceSide: 'player',
    remainingTurns: 7,
    powerRate: 1.8,
  });
  assert.equal(committedRecord.actions[0].fieldStateApplied[0].kind, 'zone');
  assert.equal(committedRecord.actions[0].fieldStateApplied[0].type, 'Fire');

  const conditionalParty = createSixMemberManualParty((idx) =>
    idx === 0
      ? {
          passives: [
            {
              id: 90001,
              name: '火陣確認',
              timing: 'OnPlayerTurnStart',
              condition: 'IsZone(Fire)==1',
              parts: [
                {
                  skill_type: 'HealSp',
                  target_type: 'Self',
                  power: [2, 0],
                  effect: { exitCond: 'None', exitVal: [0, 0] },
                },
              ],
            },
          ],
        }
      : {}
  );
  const conditionalState = createBattleStateFromParty(conditionalParty, nextState.turnState);
  const result = applyPassiveTiming(conditionalState, 'OnPlayerTurnStart');

  assert.equal(result.spEvents.length, 1);
  assert.equal(result.spEvents[0].delta, 2);
});

test('ZoneUpEternal modifier makes deployed zone eternal', () => {
  const party = createSixMemberManualParty((idx) =>
    idx === 0
      ? {
          elements: ['Fire'],
          skills: [
            {
              id: 8102,
              name: '火フィールド',
              label: 'FireZoneSkill',
              sp_cost: 5,
              target_type: 'Field',
              parts: [
                {
                  skill_type: 'Zone',
                  target_type: 'Field',
                  elements: ['Fire'],
                  power: [1.8, 0],
                  effect: { exitCond: 'PlayerTurnEnd', exitVal: [8, 0] },
                },
              ],
            },
          ],
          passives: [
            {
              id: 90002,
              name: 'メディテーション',
              timing: 'OnFirstBattleStart',
              condition: '',
              parts: [
                {
                  skill_type: 'ZoneUpEternal',
                  target_type: 'Field',
                  effect: { exitCond: 'Eternal', exitVal: [0, 0] },
                },
              ],
            },
          ],
        }
      : {}
  );
  const state = createBattleStateFromParty(party);

  const preview = previewTurn(state, {
    0: { characterId: 'M1', skillId: 8102 },
  });
  const { nextState, committedRecord } = commitTurn(state, preview);

  assert.deepEqual(nextState.turnState.zoneState, {
    type: 'Fire',
    sourceSide: 'player',
    remainingTurns: null,
    powerRate: 1.95,
  });
  assert.equal(committedRecord.actions[0].fieldStateApplied[0].kind, 'zone');
  assert.equal(committedRecord.actions[0].fieldStateApplied[0].remainingTurns, null);
  assert.equal(committedRecord.actions[0].fieldStateApplied[0].powerRate, 1.95);
});

test('new field zone overwrites the previous active field zone', () => {
  const party = createSixMemberManualParty((idx) => {
    if (idx === 0) {
      return {
        skills: [
          {
            id: 81020,
            name: '火フィールド',
            sp_cost: 0,
            target_type: 'Field',
            parts: [
              {
                skill_type: 'Zone',
                target_type: 'Field',
                elements: ['Fire'],
                power: [1.8, 0],
                effect: { exitCond: 'PlayerTurnEnd', exitVal: [8, 0] },
              },
            ],
          },
          {
            id: 81022,
            name: 'プロテクション',
            sp_cost: 0,
            target_type: 'Self',
            parts: [{ skill_type: 'BuffDefence', target_type: 'Self', type: 'None' }],
          },
        ],
      };
    }
    if (idx === 1) {
      return {
        skills: [
          {
            id: 81021,
            name: '氷フィールド',
            sp_cost: 0,
            target_type: 'Field',
            parts: [
              {
                skill_type: 'Zone',
                target_type: 'Field',
                elements: ['Ice'],
                power: [1.8, 0],
                effect: { exitCond: 'PlayerTurnEnd', exitVal: [8, 0] },
              },
            ],
          },
          {
            id: 81023,
            name: 'プロテクション',
            sp_cost: 0,
            target_type: 'Self',
            parts: [{ skill_type: 'BuffDefence', target_type: 'Self', type: 'None' }],
          },
        ],
      };
    }
    if (idx === 2) {
      return {
        skills: [
          {
            id: 81024,
            name: 'プロテクション',
            sp_cost: 0,
            target_type: 'Self',
            parts: [{ skill_type: 'BuffDefence', target_type: 'Self', type: 'None' }],
          },
        ],
      };
    }
    return {};
  });
  const state = createBattleStateFromParty(party);

  const preview1 = previewTurn(state, {
    0: { characterId: 'M1', skillId: 81020 },
    1: { characterId: 'M2', skillId: 81023 },
    2: { characterId: 'M3', skillId: 81024 },
  });
  const commit1 = commitTurn(state, preview1);
  assert.deepEqual(commit1.nextState.turnState.zoneState, {
    type: 'Fire',
    sourceSide: 'player',
    remainingTurns: 7,
    powerRate: 1.8,
  });

  const preview2 = previewTurn(commit1.nextState, {
    0: { characterId: 'M1', skillId: 81022 },
    1: { characterId: 'M2', skillId: 81021 },
    2: { characterId: 'M3', skillId: 81024 },
  });
  const commit2 = commitTurn(commit1.nextState, preview2);

  assert.deepEqual(commit2.nextState.turnState.zoneState, {
    type: 'Ice',
    sourceSide: 'player',
    remainingTurns: 7,
    powerRate: 1.8,
  });
});

test('preview and damage context expose zone power for matching element skills', () => {
  const party = createSixMemberManualParty((idx) =>
    idx === 0
      ? {
          elements: ['Fire'],
          skills: [
            {
              id: 8103,
              name: '火属性攻撃',
              label: 'FireAttackSkill',
              sp_cost: 5,
              hit_count: 1,
              target_type: 'Single',
              parts: [
                {
                  skill_type: 'AttackSkill',
                  target_type: 'Single',
                  elements: ['Fire'],
                  power: [1.0, 0],
                },
              ],
            },
          ],
        }
      : {}
  );
  const state = createBattleStateFromParty(party, {
    zoneState: { type: 'Fire', sourceSide: 'player', remainingTurns: 8, powerRate: 1.8 },
  });

  const preview = previewTurn(state, {
    0: { characterId: 'M1', skillId: 8103 },
  });
  assert.equal(preview.actions[0].specialPassiveModifiers?.zonePowerRate, 1.8);

  const { committedRecord } = commitTurn(state, preview);
  assert.equal(committedRecord.actions[0].damageContext?.zoneType, 'Fire');
  assert.equal(committedRecord.actions[0].damageContext?.zonePowerRate, 1.8);
});

test('ReviveTerritory skill applies territory state and IsTerritory condition becomes true', () => {
  const party = createSixMemberManualParty((idx) =>
    idx === 0
      ? {
          skills: [
            {
              id: 8201,
              name: '再生の陣',
              label: 'ReviveTerritorySkill',
              sp_cost: 8,
              target_type: 'Field',
              parts: [
                {
                  skill_type: 'ReviveTerritory',
                  target_type: 'Field',
                  power: [0.5, 0],
                  effect: { exitCond: 'None', exitVal: [0, 0] },
                },
              ],
            },
          ],
        }
      : {}
  );
  const state = createBattleStateFromParty(party);
  const preview = previewTurn(state, {
    0: { characterId: 'M1', skillId: 8201 },
  });
  const { nextState, committedRecord } = commitTurn(state, preview);

  assert.deepEqual(nextState.turnState.territoryState, {
    type: 'ReviveTerritory',
    sourceSide: 'player',
    remainingTurns: null,
    powerRate: 0.5,
  });
  assert.equal(committedRecord.actions[0].fieldStateApplied[0].kind, 'territory');
  assert.equal(committedRecord.actions[0].fieldStateApplied[0].powerRate, 0.5);

  const conditionalParty = createSixMemberManualParty((idx) =>
    idx === 0
      ? {
          passives: [
            {
              id: 90002,
              name: '方円',
              timing: 'OnEveryTurn',
              condition: 'IsTerritory(ReviveTerritory)==1',
              parts: [
                {
                  skill_type: 'HealSp',
                  target_type: 'Self',
                  power: [1, 0],
                  effect: { exitCond: 'None', exitVal: [0, 0] },
                },
              ],
            },
          ],
        }
      : {}
  );
  const conditionalState = createBattleStateFromParty(conditionalParty, nextState.turnState);
  const result = applyPassiveTiming(conditionalState, 'OnEveryTurn');

  assert.equal(result.spEvents.length, 1);
  assert.equal(result.spEvents[0].delta, 1);
});

test('ReviveTerritory activates at turn start, heals all allies, and is consumed', () => {
  const party = createSixMemberManualParty((idx) => {
    if (idx <= 2) {
      return {
        dpState:
          idx === 0
            ? { baseMaxDp: 100, currentDp: 0 }
            : idx === 1
              ? { baseMaxDp: 100, currentDp: 20 }
              : { baseMaxDp: 100, currentDp: 60 },
        skills: [
          {
            id: 8210 + idx,
            name: 'プロテクション',
            sp_cost: 0,
            target_type: 'Self',
            parts: [{ skill_type: 'BuffDefence', target_type: 'Self', type: 'None' }],
          },
        ],
      };
    }
    return {
      dpState: { baseMaxDp: 100, currentDp: 40 },
    };
  });
  const state = createBattleStateFromParty(party, {
    territoryState: { type: 'ReviveTerritory', sourceSide: 'player', remainingTurns: null, powerRate: 0.5 },
  });

  const preview = previewTurn(state, {
    0: { characterId: 'M1', skillId: 8210 },
    1: { characterId: 'M2', skillId: 8211 },
    2: { characterId: 'M3', skillId: 8212 },
  });
  const { nextState, committedRecord } = commitTurn(state, preview);

  assert.equal(nextState.turnState.territoryState, null);
  assert.equal(nextState.party[0].dpState.currentDp, 50);
  assert.equal(nextState.party[1].dpState.currentDp, 70);
  assert.equal(nextState.party[2].dpState.currentDp, 100);
  assert.equal(nextState.party[3].dpState.currentDp, 90);
  assert.equal(
    committedRecord.dpEvents.some(
      (event) =>
        event.source === 'territory' &&
        event.triggerType === 'ReviveTerritory' &&
        event.characterId === 'M1'
    ),
    true
  );
});

test('enemy down-turn status does not tick during OD/EX chain without base-turn advance', () => {
  const members = Array.from({ length: 6 }, (_, idx) =>
    new CharacterStyle({
      characterId: `EDO${idx + 1}`,
      characterName: `EDO${idx + 1}`,
      styleId: idx + 1,
      styleName: `EDOS${idx + 1}`,
      partyIndex: idx,
      position: idx,
      initialSP: 10,
      skills: [{ id: 18200 + idx, name: 'Normal', label: `EDOSkill${idx + 1}`, sp_cost: 0, parts: [] }],
    })
  );
  const party = new Party(members);
  let state = createBattleStateFromParty(party);
  state.turnState.enemyState = {
    enemyCount: 1,
    statuses: [{ statusType: 'DownTurn', targetIndex: 0, remainingTurns: 1 }],
  };

  state = activateOverdrive(state, 1, 'preemptive', { forceActivation: true });
  const preview = previewTurn(state, {
    0: { characterId: 'EDO1', skillId: 18200 },
    1: { characterId: 'EDO2', skillId: 18201 },
    2: { characterId: 'EDO3', skillId: 18202 },
  });
  const { nextState } = commitTurn(state, preview);
  assert.equal(nextState.turnState.turnIndex, 1);
  assert.equal(nextState.turnState.enemyState.statuses.length, 1);
});

test('enemy down-turn status ticks when base turn advances (enemy turn consumed)', () => {
  const members = Array.from({ length: 6 }, (_, idx) =>
    new CharacterStyle({
      characterId: `EDX${idx + 1}`,
      characterName: `EDX${idx + 1}`,
      styleId: idx + 1,
      styleName: `EDXS${idx + 1}`,
      partyIndex: idx,
      position: idx,
      initialSP: 10,
      skills: [{ id: 18100 + idx, name: 'Normal', label: `EDXSkill${idx + 1}`, sp_cost: 0, parts: [] }],
    })
  );
  const party = new Party(members);
  const state = createBattleStateFromParty(party);
  state.turnState.enemyState = {
    enemyCount: 1,
    statuses: [{ statusType: 'DownTurn', targetIndex: 0, remainingTurns: 1 }],
  };

  const preview = previewTurn(state, {
    0: { characterId: 'EDX1', skillId: 18100 },
    1: { characterId: 'EDX2', skillId: 18101 },
    2: { characterId: 'EDX3', skillId: 18102 },
  });
  const { nextState } = commitTurn(state, preview);
  assert.equal(nextState.turnState.turnIndex, 2);
  assert.equal(nextState.turnState.enemyState.statuses.length, 0);
});

test('SuperBreakDown adds DownTurn event on fresh target and leaves Break state in next turn', () => {
  const party = createSixMemberManualParty((idx) =>
    idx === 0
      ? {
          skills: [
            {
              id: 18130,
              name: 'ナイトキルエッジ',
              sp_cost: 0,
              target_type: 'Single',
              parts: [{ skill_type: 'SuperBreakDown', target_type: 'Single' }],
            },
          ],
        }
      : {}
  );
  const state = createBattleStateFromParty(party);

  const preview = previewTurn(state, {
    0: { characterId: 'M1', skillId: 18130, targetEnemyIndex: 0 },
  });
  const committed = commitTurn(state, preview);
  const action = committed.committedRecord.actions.find((entry) => entry.characterId === 'M1');

  assert.equal(action.enemyStatusChanges.length, 1);
  assert.equal(action.enemyStatusChanges[0].mode, 'DownTurn');
  assert.equal(action.enemyStatusChanges[0].remainingTurns, 1);
  assert.equal(
    committed.nextState.turnState.enemyState.statuses.some(
      (status) => status.statusType === 'Break' && status.targetIndex === 0
    ),
    true
  );
  assert.equal(
    committed.nextState.turnState.enemyState.statuses.some(
      (status) => status.statusType === 'DownTurn' && status.targetIndex === 0
    ),
    false
  );
});

test('SuperBreakDown upgrades down-turn target to SuperDown and restores cap when down-turn ends', () => {
  const party = createSixMemberManualParty((idx) =>
    idx === 0
      ? {
          skills: [
            {
              id: 18131,
              name: 'ナイトキルエッジ',
              sp_cost: 0,
              target_type: 'Single',
              parts: [{ skill_type: 'SuperBreakDown', target_type: 'Single' }],
            },
          ],
        }
      : {}
  );
  let state = createBattleStateFromParty(party);
  state.turnState.enemyState = {
    enemyCount: 1,
    statuses: [{ statusType: 'DownTurn', targetIndex: 0, remainingTurns: 2 }],
    destructionRateByEnemy: { 0: 250 },
  };

  let preview = previewTurn(state, {
    0: { characterId: 'M1', skillId: 18131, targetEnemyIndex: 0 },
  });
  let committed = commitTurn(state, preview);
  let action = committed.committedRecord.actions.find((entry) => entry.characterId === 'M1');

  assert.equal(action.enemyStatusChanges.length, 1);
  assert.equal(action.enemyStatusChanges[0].mode, 'SuperDown');
  assert.equal(
    committed.nextState.turnState.enemyState.statuses.some(
      (status) => status.statusType === 'SuperDown' && status.targetIndex === 0
    ),
    true
  );
  assert.equal(
    committed.nextState.turnState.enemyState.statuses.find((status) => status.statusType === 'DownTurn')
      ?.remainingTurns,
    1
  );
  assert.equal(committed.nextState.turnState.enemyState.destructionRateByEnemy['0'], 300);
  assert.equal(committed.nextState.turnState.enemyState.destructionRateCapByEnemy['0'], 600);
  assert.equal(committed.nextState.turnState.enemyState.breakStateByEnemy['0'].superDown.preRate, 250);

  committed.nextState.turnState.enemyState.destructionRateByEnemy['0'] = 420;
  preview = previewTurn(committed.nextState, {
    0: { characterId: 'M1', skillId: 18131, targetEnemyIndex: 0 },
  });
  committed = commitTurn(committed.nextState, preview);

  assert.equal(
    committed.nextState.turnState.enemyState.statuses.some((status) => status.statusType === 'SuperDown'),
    false
  );
  assert.equal(committed.nextState.turnState.enemyState.destructionRateByEnemy['0'], 300);
  assert.deepEqual(committed.nextState.turnState.enemyState.destructionRateCapByEnemy, {});
  assert.deepEqual(committed.nextState.turnState.enemyState.breakStateByEnemy, {});
});

test('SkillCondition branch sp_cost is applied when BreakDownTurn condition matches', () => {
  const members = Array.from({ length: 6 }, (_, idx) =>
    new CharacterStyle({
      characterId: `BDSP${idx + 1}`,
      characterName: `BDSP${idx + 1}`,
      styleId: idx + 1,
      styleName: `BDSPS${idx + 1}`,
      partyIndex: idx,
      position: idx,
      initialSP: 20,
      skills:
        idx === 0
          ? [
              {
                id: 28000,
                name: 'BreakDown Cost Branch',
                label: 'BreakDownCostBranch',
                sp_cost: 16,
                parts: [
                  {
                    skill_type: 'SkillCondition',
                    cond: 'CountBC(IsDead()==0&&IsPlayer()==0&&BreakDownTurn()>0)>0',
                    strval: [
                      {
                        id: 28001,
                        name: 'BreakDown Cost Branch A',
                        label: 'BreakDownCostBranchA',
                        sp_cost: 0,
                        consume_type: 'Sp',
                        hit_count: 8,
                        target_type: 'Single',
                        parts: [{ skill_type: 'AttackSkill', target_type: 'Single', power: [1, 1] }],
                      },
                      {
                        id: 28002,
                        name: 'BreakDown Cost Branch B',
                        label: 'BreakDownCostBranchB',
                        sp_cost: 16,
                        consume_type: 'Sp',
                        hit_count: 8,
                        target_type: 'Single',
                        parts: [{ skill_type: 'AttackSkill', target_type: 'Single', power: [1, 1] }],
                      },
                    ],
                  },
                ],
              },
            ]
          : [{ id: 28010 + idx, name: 'Normal', label: `BDSPSkill${idx + 1}`, sp_cost: 0, parts: [] }],
    })
  );

  const party = new Party(members);
  const state = createBattleStateFromParty(party);

  // DownTurnなし: 16消費
  const previewNormal = previewTurn(state, {
    0: { characterId: 'BDSP1', skillId: 28000 },
  });
  assert.equal(previewNormal.actions[0].spCost, 16);
  assert.equal(previewNormal.actions[0].startSP, 20);
  assert.equal(previewNormal.actions[0].endSP, 4);

  // DownTurnあり: 0消費
  state.turnState.enemyState = {
    enemyCount: 1,
    statuses: [{ statusType: 'DownTurn', targetIndex: 0, remainingTurns: 1 }],
  };
  const previewDown = previewTurn(state, {
    0: { characterId: 'BDSP1', skillId: 28000 },
  });
  assert.equal(previewDown.actions[0].spCost, 0);
  assert.equal(previewDown.actions[0].startSP, 20);
  assert.equal(previewDown.actions[0].endSP, 20);

  const { nextState } = commitTurn(state, previewDown);
  const actor = nextState.party.find((m) => m.characterId === 'BDSP1');
  assert.equal(actor?.sp?.current, 20);
});

test('skill with SpecialStatusCountByType(20)==0 is blocked during extra turn', () => {
  const members = Array.from({ length: 6 }, (_, idx) =>
    new CharacterStyle({
      characterId: `EX${idx + 1}`,
      characterName: `EX${idx + 1}`,
      styleId: idx + 1,
      styleName: `EXS${idx + 1}`,
      partyIndex: idx,
      position: idx,
      initialSP: 10,
      skills: [
        {
          id: 10100 + idx,
          name: 'No Extra Skill',
          label: `NoExtra${idx + 1}`,
          sp_cost: 0,
          cond: 'SpecialStatusCountByType(20)==0',
          parts: [],
        },
      ],
    })
  );
  const party = new Party(members);
  let state = createBattleStateFromParty(party);
  state = grantExtraTurn(state, ['EX1']);

  assert.throws(
    () =>
      previewTurn(state, {
        0: { characterId: 'EX1', skillId: 10100 },
      }),
    /cannot be used because cond is not satisfied/
  );
});

test('od-suspended extra turn satisfies both OD and extra-turn conditions simultaneously', () => {
  const members = Array.from({ length: 6 }, (_, idx) =>
    new CharacterStyle({
      characterId: `OX${idx + 1}`,
      characterName: `OX${idx + 1}`,
      styleId: idx + 1,
      styleName: `OXS${idx + 1}`,
      partyIndex: idx,
      position: idx,
      initialSP: 10,
      skills:
        idx === 0
          ? [
              {
                id: 10150,
                name: 'OD Only',
                label: 'ODOnlyInExtra',
                sp_cost: 0,
                cond: 'IsOverDrive()==1',
                parts: [],
              },
              {
                id: 10151,
                name: 'OD Forbidden',
                label: 'ODForbiddenInExtra',
                sp_cost: 0,
                cond: 'IsOverDrive()==0',
                parts: [],
              },
              {
                id: 10152,
                name: 'No Extra',
                label: 'NoExtraInOd',
                sp_cost: 0,
                cond: 'SpecialStatusCountByType(20)==0',
                parts: [],
              },
            ]
          : [{ id: 10160 + idx, name: 'Normal', label: `OXSkill${idx + 1}`, sp_cost: 0, parts: [] }],
    })
  );

  let state = createBattleStateFromParty(new Party(members));
  state = grantExtraTurn(state, ['OX1']);
  state.turnState.odSuspended = true;
  state.turnState.odLevel = 3;
  state.turnState.remainingOdActions = 2;
  state.turnState.odContext = 'interrupt';

  const odOnlyPreview = previewTurn(state, {
    0: { characterId: 'OX1', skillId: 10150 },
  });
  assert.equal(odOnlyPreview.actions.length, 1, 'OD-only skill should be usable during OD-suspended EX');

  assert.throws(
    () =>
      previewTurn(state, {
        0: { characterId: 'OX1', skillId: 10151 },
      }),
    /cannot be used because cond is not satisfied/,
    'OD-forbidden skill should be blocked during OD-suspended EX'
  );

  assert.throws(
    () =>
      previewTurn(state, {
        0: { characterId: 'OX1', skillId: 10152 },
      }),
    /cannot be used because cond is not satisfied/,
    'extra-turn-forbidden skill should remain blocked during OD-suspended EX'
  );
});

test('condition aliases support bare IsFront() and resource predicates', () => {
  const members = Array.from({ length: 6 }, (_, idx) =>
    new CharacterStyle({
      characterId: `CA${idx + 1}`,
      characterName: `CA${idx + 1}`,
      styleId: idx + 1,
      styleName: `CAS${idx + 1}`,
      partyIndex: idx,
      position: idx,
      initialSP: idx === 0 ? 0 : 10,
      initialEP: idx === 0 ? 3 : 0,
      isBreak: idx === 0,
      skills: [
        idx === 0
          ? {
              id: 30001,
              name: '通常攻撃',
              label: 'AliasNormal',
              sp_cost: 0,
              cond: 'IsFront() && IsAttackNormal()==1 && ConsumeSp()==0 && Ep()>=3 && IsBroken()==1',
              parts: [{ skill_type: 'AttackSkill', target_type: 'Single' }],
            }
          : {
              id: 30002 + idx,
              name: 'Normal',
              label: `AliasSkill${idx + 1}`,
              sp_cost: 0,
              parts: [{ skill_type: 'AttackSkill', target_type: 'Single' }],
            },
      ],
    })
  );

  const state = createBattleStateFromParty(new Party(members));
  const preview = previewTurn(state, {
    0: { characterId: 'CA1', skillId: 30001 },
    1: { characterId: 'CA2', skillId: 30003 },
    2: { characterId: 'CA3', skillId: 30004 },
  });

  assert.equal(preview.actions.length, 3);
});

test('condition aliases block skills when bare/resource predicates are false', () => {
  const members = Array.from({ length: 6 }, (_, idx) =>
    new CharacterStyle({
      characterId: `CB${idx + 1}`,
      characterName: `CB${idx + 1}`,
      styleId: idx + 1,
      styleName: `CBS${idx + 1}`,
      partyIndex: idx,
      position: idx,
      initialSP: 10,
      initialEP: idx === 0 ? 2 : 0,
      skills: [
        idx === 0
          ? {
              id: 31001,
              name: 'Spell',
              label: 'AliasBlocked',
              sp_cost: 9,
              cond: 'IsFront() && IsAttackNormal()==0 && ConsumeSp()<=8 && Ep()>=3',
              parts: [{ skill_type: 'AttackSkill', target_type: 'Single' }],
            }
          : {
              id: 31002 + idx,
              name: 'Normal',
              label: `AliasBlockSkill${idx + 1}`,
              sp_cost: 0,
              parts: [{ skill_type: 'AttackSkill', target_type: 'Single' }],
            },
      ],
    })
  );

  const state = createBattleStateFromParty(new Party(members));
  assert.throws(
    () =>
      previewTurn(state, {
        0: { characterId: 'CB1', skillId: 31001 },
        1: { characterId: 'CB2', skillId: 31003 },
        2: { characterId: 'CB3', skillId: 31004 },
      }),
    /cannot be used because cond is not satisfied/
  );
});

test('IsNatureElement direct condition is evaluated from member style elements', () => {
  const members = Array.from({ length: 6 }, (_, idx) =>
    new CharacterStyle({
      characterId: `NE${idx + 1}`,
      characterName: `NE${idx + 1}`,
      styleId: idx + 1,
      styleName: `NES${idx + 1}`,
      partyIndex: idx,
      position: idx,
      initialSP: 10,
      elements: idx === 0 ? ['Fire'] : ['Ice'],
      skills: [
        {
          id: 32000 + idx,
          name: 'Nature Skill',
          label: `NatureSkill${idx + 1}`,
          sp_cost: 0,
          cond: 'IsNatureElement(Fire)==1',
          parts: [{ skill_type: 'AttackSkill', target_type: 'Single' }],
        },
      ],
    })
  );

  const state = createBattleStateFromParty(new Party(members));
  const preview = previewTurn(state, {
    0: { characterId: 'NE1', skillId: 32000 },
  });
  assert.equal(preview.actions.length, 1);
  assert.throws(
    () => previewTurn(state, { 1: { characterId: 'NE2', skillId: 32001 } }),
    /cannot be used because cond is not satisfied/
  );
});

test('CountBC(IsPlayer() && IsNatureElement(...)) is evaluated from party member elements', () => {
  const members = Array.from({ length: 6 }, (_, idx) =>
    new CharacterStyle({
      characterId: `NC${idx + 1}`,
      characterName: `NC${idx + 1}`,
      styleId: idx + 1,
      styleName: `NCS${idx + 1}`,
      partyIndex: idx,
      position: idx,
      initialSP: 10,
      elements: idx <= 2 ? ['Fire'] : ['Ice'],
      skills: [
        {
          id: 32100 + idx,
          name: 'Nature Count Skill',
          label: `NatureCount${idx + 1}`,
          sp_cost: 0,
          cond: 'CountBC(IsPlayer() && IsNatureElement(Fire)==1)>=3',
          parts: [{ skill_type: 'AttackSkill', target_type: 'Single' }],
        },
      ],
    })
  );

  const state = createBattleStateFromParty(new Party(members));
  const preview = previewTurn(state, {
    0: { characterId: 'NC1', skillId: 32100 },
  });
  assert.equal(preview.actions.length, 1);

  state.party[2].elements = Object.freeze(['Ice']);
  assert.throws(
    () => previewTurn(state, { 0: { characterId: 'NC1', skillId: 32100 } }),
    /cannot be used because cond is not satisfied/
  );
});

test('IsCharacter direct condition is evaluated from member identity', () => {
  const members = Array.from({ length: 6 }, (_, idx) =>
    new CharacterStyle({
      characterId: idx === 1 ? 'IIshii' : `IC${idx + 1}`,
      characterName: idx === 1 ? '石井 色葉' : `IC${idx + 1}`,
      styleId: idx + 1,
      styleName: `ICS${idx + 1}`,
      partyIndex: idx,
      position: idx,
      initialSP: 10,
      skills: [
        {
          id: 32200 + idx,
          name: 'Character Skill',
          label: `CharacterSkill${idx + 1}`,
          sp_cost: 0,
          cond: 'IsCharacter(IIshii)==1',
          parts: [{ skill_type: 'AttackSkill', target_type: 'Single' }],
        },
      ],
    })
  );

  const state = createBattleStateFromParty(new Party(members));
  const preview = previewTurn(state, {
    1: { characterId: 'IIshii', skillId: 32201 },
  });
  assert.equal(preview.actions.length, 1);

  assert.throws(
    () => previewTurn(state, { 0: { characterId: 'IC1', skillId: 32200 } }),
    /cannot be used because cond is not satisfied/
  );
});

test('ConquestBikeLevel condition uses fixed internal value 160', () => {
  const party = createSixMemberManualParty((idx) =>
    idx === 0
      ? {
          passives: [
            {
              id: 19001,
              name: '制圧戦常勝',
              timing: 'OnPlayerTurnStart',
              condition: 'ConquestBikeLevel()>=80',
              parts: [{ skill_type: 'HealSp', target_type: 'Self', power: [1, 0] }],
            },
          ],
        }
      : {}
  );
  const state = createBattleStateFromParty(party);

  const result = applyPassiveTiming(state, 'OnPlayerTurnStart');

  assert.equal(state.party[0].sp.current, 11);
  assert.equal(result.spEvents.length, 1);
  assert.equal(result.passiveEvents[0]?.passiveName, '制圧戦常勝');
});

test('DamageRate condition uses manual enemy destruction-rate state only', () => {
  const party = createSixMemberManualParty((idx) =>
    idx === 0
      ? {
          passives: [
            {
              id: 19021,
              name: '高破壊率警戒',
              timing: 'OnPlayerTurnStart',
              condition: 'CountBC(IsPlayer()==0&&IsDead()==0&&IsBroken()==1&&DamageRate()>=200.0)>0',
              parts: [{ skill_type: 'HealSp', target_type: 'Self', power: [1, 0] }],
            },
          ],
        }
      : {}
  );
  const state = createBattleStateFromParty(party);
  state.turnState.enemyState.enemyCount = 2;
  state.turnState.enemyState.statuses = [
    { statusType: 'Break', targetIndex: 0, remainingTurns: 0 },
    { statusType: 'Break', targetIndex: 1, remainingTurns: 0 },
  ];
  state.turnState.enemyState.destructionRateByEnemy = {
    '0': 199,
    '1': 200,
  };

  const result = applyPassiveTiming(state, 'OnPlayerTurnStart');

  assert.equal(state.party[0].sp.current, 11);
  assert.equal(result.spEvents.length, 1);
  assert.equal(result.passiveEvents[0]?.passiveName, '高破壊率警戒');
});

test('Random condition succeeds by default for A, S, SS, and SSR passives', () => {
  const party = createSixMemberManualParty((idx) =>
    idx === 0
      ? {
          passives: [
            {
              id: 19011,
              name: 'A Random',
              tier: 'A',
              timing: 'OnPlayerTurnStart',
              condition: 'Random()<0.3',
              parts: [{ skill_type: 'HealSp', target_type: 'Self', power: [1, 0] }],
            },
          ],
        }
      : idx === 1
        ? {
            passives: [
              {
                id: 19012,
                name: 'S Random',
                tier: 'S',
                timing: 'OnPlayerTurnStart',
                condition: 'Random()<0.3',
                parts: [{ skill_type: 'HealSp', target_type: 'Self', power: [1, 0] }],
              },
            ],
          }
        : idx === 2
          ? {
              passives: [
                {
                  id: 19013,
                  name: 'SS Random',
                  tier: 'SS',
                  timing: 'OnPlayerTurnStart',
                  condition: 'Random()<0.3',
                  parts: [{ skill_type: 'HealSp', target_type: 'Self', power: [1, 0] }],
                },
              ],
            }
          : idx === 3
            ? {
                passives: [
                  {
                    id: 19014,
                    name: 'SSR Random',
                    tier: 'SSR',
                    timing: 'OnPlayerTurnStart',
                    condition: 'Random()<0.3',
                    parts: [{ skill_type: 'HealSp', target_type: 'Self', power: [1, 0] }],
                  },
                ],
              }
          : {}
  );
  const state = createBattleStateFromParty(party);
  const result = applyPassiveTiming(state, 'OnPlayerTurnStart');

  assert.equal(state.party[0].sp.current, 11);
  assert.equal(state.party[1].sp.current, 11);
  assert.equal(state.party[2].sp.current, 11);
  assert.equal(state.party[3].sp.current, 11);
  assert.equal(result.spEvents.length, 4);
});

test('kishin state lasts 3 actionable turns then applies 1-turn action disable', () => {
  const members = Array.from({ length: 6 }, (_, idx) =>
    new CharacterStyle({
      characterId: idx === 0 ? 'STezuka' : `K${idx + 1}`,
      characterName: idx === 0 ? '手塚 咲' : `K${idx + 1}`,
      styleId: idx + 1,
      styleName: `KS${idx + 1}`,
      partyIndex: idx,
      position: idx,
      initialSP: 10,
      skills: [
        {
          id: 10300 + idx,
          name: idx === 0 ? '天駆の鉄槌' : 'Normal',
          label: idx === 0 ? 'STezukaSkill' : `KSkill${idx + 1}`,
          sp_cost: 1,
          parts: idx === 0 ? [{ skill_type: 'AttackSkill' }] : [],
        },
      ],
    })
  );
  const party = new Party(members);
  let state = createBattleStateFromParty(party);
  const tezuka = state.party.find((m) => m.characterId === 'STezuka');
  tezuka.activateReinforcedMode(3);

  for (let i = 0; i < 3; i += 1) {
    const preview = previewTurn(state, {
      0: { characterId: 'STezuka', skillId: 10300 },
      1: { characterId: 'K2', skillId: 10301 },
      2: { characterId: 'K3', skillId: 10302 },
    });
    state = commitTurn(state, preview).nextState;
  }

  const afterThree = state.party.find((m) => m.characterId === 'STezuka');
  assert.equal(afterThree.isReinforcedMode, false);
  assert.equal(afterThree.actionDisabledTurns, 1);
  const actionSkills = afterThree.getActionSkills();
  assert.equal(actionSkills.length, 1);
  assert.equal(actionSkills[0].skillId, 0);
  assert.equal(actionSkills[0].name, '行動なし');

  const previewDisabledTurn = previewTurn(state, {
    0: { characterId: 'STezuka', skillId: 0 },
    1: { characterId: 'K2', skillId: 10301 },
    2: { characterId: 'K3', skillId: 10302 },
  });
  state = commitTurn(state, previewDisabledTurn).nextState;
  const recovered = state.party.find((m) => m.characterId === 'STezuka');
  assert.equal(recovered.actionDisabledTurns, 0);
});

test('Tezuka kishin turn count advances on extra turn even when Tezuka is not in allowed extra members', () => {
  const members = Array.from({ length: 6 }, (_, idx) =>
    new CharacterStyle({
      characterId: idx === 0 ? 'STezuka' : `KX${idx + 1}`,
      characterName: idx === 0 ? '手塚 咲' : `KX${idx + 1}`,
      styleId: idx + 1,
      styleName: `KXS${idx + 1}`,
      partyIndex: idx,
      position: idx,
      initialSP: 10,
      skills: [
        {
          id: 18000 + idx,
          name: 'Normal',
          label: `KXSkill${idx + 1}`,
          sp_cost: 0,
          parts: [{ skill_type: 'AttackSkill', target_type: 'Single' }],
        },
      ],
    })
  );

  let state = createBattleStateFromParty(new Party(members));
  const tezuka = state.party.find((m) => m.characterId === 'STezuka');
  tezuka.activateReinforcedMode(3);

  state = grantExtraTurn(state, ['KX2']);
  const preview = previewTurn(state, {
    1: { characterId: 'KX2', skillId: 18001 },
  });
  state = commitTurn(state, preview).nextState;

  const after = state.party.find((m) => m.characterId === 'STezuka');
  assert.equal(after.reinforcedTurnsRemaining, 2);
});

test('kishin remaining 1 still allows Tezuka self-extra grant before expiring', () => {
  const members = Array.from({ length: 6 }, (_, idx) =>
    new CharacterStyle({
      characterId: idx === 0 ? 'STezuka' : `KR${idx + 1}`,
      characterName: idx === 0 ? '手塚 咲' : `KR${idx + 1}`,
      styleId: idx + 1,
      styleName: `KRS${idx + 1}`,
      partyIndex: idx,
      position: idx,
      initialSP: 10,
      skills: [
        {
          id: idx === 0 ? 10400 : 10400 + idx,
          name: idx === 0 ? '天駆の鉄槌' : 'Normal',
          label: idx === 0 ? 'STezukaTenku' : `KRSkill${idx + 1}`,
          sp_cost: 0,
          additionalTurnRule:
            idx === 0
              ? {
                  skillUsableInExtraTurn: true,
                  additionalTurnGrantInExtraTurn: true,
                  conditions: {
                    requiresOverDrive: false,
                    requiresReinforcedMode: true,
                    excludesExtraTurnForSkillUse: false,
                    excludesExtraTurnForAdditionalTurnGrant: false,
                  },
                  additionalTurnTargetTypes: ['Self'],
                }
              : null,
          parts:
            idx === 0
              ? [
                  { skill_type: 'AttackSkill', target_type: 'All' },
                  { skill_type: 'AdditionalTurn', target_type: 'Self' },
                ]
              : [],
        },
      ],
    })
  );

  let state = createBattleStateFromParty(new Party(members));
  const tezuka = state.party.find((m) => m.characterId === 'STezuka');
  tezuka.activateReinforcedMode(3);
  state = grantExtraTurn(state, ['STezuka']);

  for (let i = 0; i < 3; i += 1) {
    const preview = previewTurn(state, {
      0: { characterId: 'STezuka', skillId: 10400 },
    });
    state = commitTurn(state, preview).nextState;
    assert.equal(state.turnState.turnType, 'extra', `commit #${i + 1} should still be extra`);
  }

  const afterThird = state.party.find((m) => m.characterId === 'STezuka');
  assert.equal(afterThird.isReinforcedMode, false);
  assert.equal(afterThird.actionDisabledTurns, 1);

  const disabledSkills = afterThird.getActionSkills();
  assert.equal(disabledSkills.length, 1);
  assert.equal(disabledSkills[0].skillId, 0);

  const previewDisabled = previewTurn(state, {
    0: { characterId: 'STezuka', skillId: 0 },
  });
  state = commitTurn(state, previewDisabled).nextState;
  assert.equal(state.turnState.turnType, 'normal');
});

test('commitTurn imports Funnel effect values from skill parts into statusEffects', () => {
  const members = Array.from({ length: 6 }, (_, idx) =>
    new CharacterStyle({
      characterId: `FU${idx + 1}`,
      characterName: `FU${idx + 1}`,
      styleId: idx + 1,
      styleName: `FUS${idx + 1}`,
      partyIndex: idx,
      position: idx,
      initialSP: 10,
      skills: [
        {
          id: 21000 + idx,
          name: idx === 0 ? 'Funnel Self' : 'Normal',
          label: idx === 0 ? 'FunnelSelf' : `FUSkill${idx + 1}`,
          sp_cost: 0,
          parts:
            idx === 0
              ? [
                  {
                    skill_type: 'Funnel',
                    target_type: 'Self',
                    power: [5, 0],
                    value: [0.06, 0],
                    effect: { limitType: 'Default', exitCond: 'Count', exitVal: [1, 0] },
                  },
                ]
              : [],
        },
      ],
    })
  );

  let state = createBattleStateFromParty(new Party(members));
  const preview = previewTurn(state, {
    0: { characterId: 'FU1', skillId: 21000 },
  });
  state = commitTurn(state, preview).nextState;

  const actor = state.party.find((m) => m.characterId === 'FU1');
  const effects = actor.resolveEffectiveFunnelEffects();
  assert.equal(effects.length, 1);
  assert.equal(effects[0].power, 5);
  assert.equal(effects[0].limitType, 'Default');
  assert.equal(effects[0].exitCond, 'Count');
  assert.equal(effects[0].remaining, 1);
  assert.equal(effects[0].metadata?.damageBonus, 0.06);
});

test('commitTurn imports Funnel from SkillCondition resolved branch', () => {
  const members = Array.from({ length: 6 }, (_, idx) =>
    new CharacterStyle({
      characterId: `FC${idx + 1}`,
      characterName: `FC${idx + 1}`,
      styleId: idx + 1,
      styleName: `FCS${idx + 1}`,
      partyIndex: idx,
      position: idx,
      initialSP: 10,
      skills: [
        {
          id: 22000 + idx,
          name: idx === 0 ? 'Conditional Funnel' : 'Normal',
          label: idx === 0 ? 'ConditionalFunnel' : `FCSkill${idx + 1}`,
          sp_cost: 0,
          parts:
            idx === 0
              ? [
                  {
                    skill_type: 'SkillCondition',
                    cond: 'IsOverDrive()==1',
                    strval: [
                      {
                        id: 1,
                        parts: [
                          {
                            skill_type: 'Funnel',
                            target_type: 'Self',
                            power: [3, 0],
                            value: [0.5, 0],
                            effect: { limitType: 'Only', exitCond: 'PlayerTurnEnd', exitVal: [3, 0] },
                          },
                        ],
                      },
                      {
                        id: 2,
                        parts: [
                          {
                            skill_type: 'Funnel',
                            target_type: 'Self',
                            power: [5, 0],
                            value: [0.12, 0],
                            effect: { limitType: 'Default', exitCond: 'Count', exitVal: [1, 0] },
                          },
                        ],
                      },
                    ],
                  },
                ]
              : [],
        },
      ],
    })
  );

  // 非ODでは後段(branch #2)が選ばれる
  let state = createBattleStateFromParty(new Party(members));
  let preview = previewTurn(state, {
    0: { characterId: 'FC1', skillId: 22000 },
  });
  state = commitTurn(state, preview).nextState;
  let effects = state.party.find((m) => m.characterId === 'FC1').resolveEffectiveFunnelEffects();
  assert.equal(effects[0].power, 5);
  assert.equal(effects[0].metadata?.damageBonus, 0.12);

  // ODでは前段(branch #1)が選ばれる
  state.turnState.odGauge = 100;
  state = activateOverdrive(state, 1, 'preemptive');
  preview = previewTurn(state, {
    0: { characterId: 'FC1', skillId: 22000 },
  });
  state = commitTurn(state, preview).nextState;
  effects = state.party.find((m) => m.characterId === 'FC1').resolveEffectiveFunnelEffects();
  assert.equal(effects.some((item) => item.power === 3 && item.metadata?.damageBonus === 0.5), true);
});

test('OD gain uses Funnel hit bonus and consumes count-based Funnel on damage action', () => {
  const members = Array.from({ length: 6 }, (_, idx) =>
    new CharacterStyle({
      characterId: `FO${idx + 1}`,
      characterName: `FO${idx + 1}`,
      styleId: idx + 1,
      styleName: `FOS${idx + 1}`,
      partyIndex: idx,
      position: idx,
      initialSP: 10,
      skills: [
        {
          id: 23000 + idx,
          name: idx === 0 ? 'Attack + Funnel' : 'Normal',
          label: idx === 0 ? 'AttackFunnel' : `FOSkill${idx + 1}`,
          sp_cost: 0,
          hit_count: idx === 0 ? 1 : 0,
          target_type: 'Single',
          parts:
            idx === 0
              ? [
                  { skill_type: 'AttackSkill', target_type: 'Single' },
                  {
                    skill_type: 'Funnel',
                    target_type: 'Self',
                    power: [3, 0],
                    value: [0.25, 0],
                    effect: { limitType: 'Default', exitCond: 'Count', exitVal: [1, 0] },
                  },
                ]
              : [],
        },
      ],
    })
  );

  let state = createBattleStateFromParty(new Party(members));
  let preview = previewTurn(state, {
    0: { characterId: 'FO1', skillId: 23000 },
  });
  let committed = commitTurn(state, preview);
  state = committed.nextState;

  // base hit 1 + funnel +3 => 4 hits => 10.0%
  assert.equal(state.turnState.odGauge, 10);
  const odEvent = committed.committedRecord.actions[0].funnelApplied;
  assert.equal(Array.isArray(odEvent), true);
  const actor = state.party.find((m) => m.characterId === 'FO1');
  assert.equal(actor.resolveEffectiveFunnelEffects().length, 0, 'count-based funnel should be consumed');

  preview = previewTurn(state, {
    0: { characterId: 'FO1', skillId: 23000 },
  });
  committed = commitTurn(state, preview);
  state = committed.nextState;
  assert.equal(state.turnState.odGauge, 20, 'same action repeats same +10.0%');
});

test('PlayerTurnEnd status expiry is applied only to members who acted this turn', () => {
  const members = Array.from({ length: 6 }, (_, idx) =>
    new CharacterStyle({
      characterId: `TE${idx + 1}`,
      characterName: `TE${idx + 1}`,
      styleId: idx + 1,
      styleName: `TES${idx + 1}`,
      partyIndex: idx,
      position: idx,
      initialSP: 10,
      skills: [{ id: 24000 + idx, name: 'Normal', label: `TESkill${idx + 1}`, sp_cost: 0, parts: [] }],
    })
  );

  let state = createBattleStateFromParty(new Party(members));
  state = grantExtraTurn(state, ['TE1']);
  state.party.find((m) => m.characterId === 'TE1').addStatusEffect({
    statusType: 'Funnel',
    limitType: 'Only',
    exitCond: 'PlayerTurnEnd',
    remaining: 2,
    power: 3,
  });
  state.party.find((m) => m.characterId === 'TE2').addStatusEffect({
    statusType: 'Funnel',
    limitType: 'Only',
    exitCond: 'PlayerTurnEnd',
    remaining: 2,
    power: 3,
  });

  const preview = previewTurn(state, {
    0: { characterId: 'TE1', skillId: 24000 },
  });
  state = commitTurn(state, preview).nextState;

  const te1 = state.party.find((m) => m.characterId === 'TE1').resolveEffectiveFunnelEffects();
  const te2 = state.party.find((m) => m.characterId === 'TE2').resolveEffectiveFunnelEffects();
  assert.equal(te1[0].remaining, 1, 'acted member should tick PlayerTurnEnd');
  assert.equal(te2[0].remaining, 2, 'non-acting member should not tick PlayerTurnEnd');
});

test('count-based MindEye is consumed by damage action only', () => {
  const members = Array.from({ length: 6 }, (_, idx) =>
    new CharacterStyle({
      characterId: `ME${idx + 1}`,
      characterName: `ME${idx + 1}`,
      styleId: idx + 1,
      styleName: `MES${idx + 1}`,
      partyIndex: idx,
      position: idx,
      initialSP: 10,
      skills:
        idx === 0
          ? [
              {
                id: 25000,
                name: 'Damage',
                label: 'DamageSkill',
                sp_cost: 0,
                hit_count: 1,
                target_type: 'Single',
                parts: [{ skill_type: 'AttackSkill', target_type: 'Single' }],
              },
              {
                id: 25001,
                name: 'Buff',
                label: 'BuffSkill',
                sp_cost: 0,
                parts: [{ skill_type: 'AttackUp', target_type: 'Self' }],
              },
            ]
          : [{ id: 25000 + idx + 1, name: 'Normal', label: `MESkill${idx + 1}`, sp_cost: 0, parts: [] }],
    })
  );

  // Damage consumes Count mind-eye
  let state = createBattleStateFromParty(new Party(members));
  state.party.find((m) => m.characterId === 'ME1').addStatusEffect({
    statusType: 'MindEye',
    limitType: 'Default',
    exitCond: 'Count',
    remaining: 1,
    power: 1,
  });
  let preview = previewTurn(state, {
    0: { characterId: 'ME1', skillId: 25000 },
  });
  state = commitTurn(state, preview).nextState;
  assert.equal(state.party.find((m) => m.characterId === 'ME1').resolveEffectiveMindEyeEffects().length, 0);

  // Non-damage does not consume Count mind-eye
  state = createBattleStateFromParty(new Party(members));
  state.party.find((m) => m.characterId === 'ME1').addStatusEffect({
    statusType: 'MindEye',
    limitType: 'Default',
    exitCond: 'Count',
    remaining: 1,
    power: 1,
  });
  preview = previewTurn(state, {
    0: { characterId: 'ME1', skillId: 25001 },
  });
  state = commitTurn(state, preview).nextState;
  assert.equal(state.party.find((m) => m.characterId === 'ME1').resolveEffectiveMindEyeEffects().length, 1);
});

test('applyInitialPassiveState applies battle-start and turn-start SP passives', () => {
  const members = Array.from({ length: 6 }, (_, idx) =>
    new CharacterStyle({
      characterId: `IP${idx + 1}`,
      characterName: `IP${idx + 1}`,
      styleId: idx + 1,
      styleName: `IPS${idx + 1}`,
      partyIndex: idx,
      position: idx,
      initialSP: 3,
      passives:
        idx === 0
          ? [
              {
                id: 1,
                name: '閃光',
                desc: 'ターン開始時に前衛にいると自身のSP+1',
                timing: 'OnEveryTurn',
                condition: 'IsFront()',
                parts: [{ skill_type: 'HealSp', target_type: 'Self', power: [1, 0] }],
              },
            ]
          : idx === 1
            ? [
                {
                  id: 2,
                  name: '機敏',
                  desc: 'バトル開始時 前衛にいると自身のSP+2',
                  timing: 'OnBattleStart',
                  condition: 'IsFront()',
                  parts: [{ skill_type: 'HealSp', target_type: 'Self', power: [2, 0] }],
                },
              ]
            : idx === 2
              ? [
                  {
                    id: 3,
                    name: '号令',
                    desc: 'プレイヤーターン開始時 前衛にいると自身のSP+1',
                    timing: 'OnPlayerTurnStart',
                    condition: 'IsFront()',
                    parts: [{ skill_type: 'HealSp', target_type: 'Self', power: [1, 0] }],
                  },
                ]
              : idx === 3
                ? [
                    {
                      id: 4,
                      name: '閃光',
                      desc: 'ターン開始時に前衛にいると自身のSP+1',
                      timing: 'OnEveryTurn',
                      condition: 'IsFront()',
                      parts: [{ skill_type: 'HealSp', target_type: 'Self', power: [1, 0] }],
                    },
                  ]
                : idx === 4
                  ? [
                      {
                        id: 5,
                        name: '先陣',
                        desc: '初回バトル開始時 自身のSP+2',
                        timing: 'OnFirstBattleStart',
                        condition: '',
                        parts: [{ skill_type: 'HealSp', target_type: 'Self', power: [2, 0] }],
                      },
                    ]
                  : [],
      skills: [{ id: 26000 + idx, name: 'Wait', label: `IPSkill${idx + 1}`, sp_cost: 0, parts: [] }],
    })
  );
  const state = createBattleStateFromParty(new Party(members));

  applyInitialPassiveState(state);

  assert.equal(state.party.find((m) => m.characterId === 'IP1').sp.current, 4);
  assert.equal(state.party.find((m) => m.characterId === 'IP2').sp.current, 5);
  assert.equal(state.party.find((m) => m.characterId === 'IP3').sp.current, 4);
  assert.equal(state.party.find((m) => m.characterId === 'IP4').sp.current, 3);
  assert.equal(state.party.find((m) => m.characterId === 'IP5').sp.current, 5);
  assert.equal(state.turnState.passiveEventsLastApplied.length, 4);
  assert.equal(state.turnState.passiveEventsLastApplied.some((event) => event.timing === 'OnPlayerTurnStart'), true);
  assert.equal(state.turnState.passiveEventsLastApplied.some((event) => event.timing === 'OnFirstBattleStart'), true);
});

test('applyInitialPassiveState applies OnBattleStart Zone passive into zone state', () => {
  const party = createSixMemberManualParty((idx) =>
    idx === 0
      ? {
          passives: [
            {
              id: 91001,
              name: '灼熱の陣',
              timing: 'OnBattleStart',
              condition: 'IsFront()',
              parts: [
                {
                  skill_type: 'Zone',
                  target_type: 'Field',
                  elements: ['Fire'],
                  effect: { exitCond: 'Eternal', exitVal: [0, 0] },
                },
              ],
            },
          ],
        }
      : {}
  );
  const state = createBattleStateFromParty(party);

  applyInitialPassiveState(state);

  assert.deepEqual(state.turnState.zoneState, {
    type: 'Fire',
    sourceSide: 'player',
    remainingTurns: null,
  });
  assert.equal(state.turnState.passiveEventsLastApplied.some((event) => event.passiveName === '灼熱の陣'), true);
});

test('turn recovery applies 閃光 on every turn while frontline', () => {
  const members = Array.from({ length: 6 }, (_, idx) =>
    new CharacterStyle({
      characterId: `FS${idx + 1}`,
      characterName: `FS${idx + 1}`,
      styleId: idx + 1,
      styleName: `FSS${idx + 1}`,
      partyIndex: idx,
      position: idx,
      initialSP: 3,
      passives:
        idx === 0
          ? [
              {
                id: 10,
                name: '閃光',
                desc: 'ターン開始時に前衛にいると自身のSP+1',
                timing: 'OnEveryTurn',
                condition: 'IsFront()',
                parts: [{ skill_type: 'HealSp', target_type: 'Self', power: [1, 0] }],
              },
            ]
          : [],
      skills: [{ id: 26100 + idx, name: 'Wait', label: `FSSkill${idx + 1}`, sp_cost: 0, parts: [] }],
    })
  );

  let state = createBattleStateFromParty(new Party(members));
  applyInitialPassiveState(state);

  const preview = previewTurn(state, {
    0: { characterId: 'FS1', skillId: 26100 },
    1: { characterId: 'FS2', skillId: 26101 },
    2: { characterId: 'FS3', skillId: 26102 },
  });
  const { nextState, committedRecord } = commitTurn(state, preview);

  assert.equal(nextState.party.find((m) => m.characterId === 'FS1').sp.current, 7);
  assert.equal(nextState.party.find((m) => m.characterId === 'FS2').sp.current, 5);
  assert.equal(committedRecord.passiveEvents.some((event) => event.passiveName === '閃光'), true);
});

test('applyPassiveTiming applies OnPlayerTurnStart through exported timing API', () => {
  const members = Array.from({ length: 6 }, (_, idx) =>
    new CharacterStyle({
      characterId: `PT${idx + 1}`,
      characterName: `PT${idx + 1}`,
      styleId: idx + 1,
      styleName: `PTS${idx + 1}`,
      partyIndex: idx,
      position: idx,
      initialSP: 3,
      passives:
        idx === 0
          ? [
              {
                id: 11,
                name: '号令',
                desc: 'プレイヤーターン開始時 前衛にいると自身のSP+1',
                timing: 'OnPlayerTurnStart',
                condition: 'IsFront()',
                parts: [{ skill_type: 'HealSp', target_type: 'Self', power: [1, 0] }],
              },
            ]
          : [],
      skills: [{ id: 27000 + idx, name: 'Wait', label: `PTSkill${idx + 1}`, sp_cost: 0, parts: [] }],
    })
  );
  const state = createBattleStateFromParty(new Party(members));

  const result = applyPassiveTiming(state, 'OnPlayerTurnStart', {});

  assert.equal(state.party.find((m) => m.characterId === 'PT1').sp.current, 4);
  assert.equal(result.spEvents.length, 1);
  assert.equal(result.passiveEvents.length, 1);
  assert.equal(result.passiveEvents[0].timing, 'OnPlayerTurnStart');
});

test('grantExtraTurn applies OnAdditionalTurnStart SP passives when extra turn begins', () => {
  const members = Array.from({ length: 6 }, (_, idx) =>
    new CharacterStyle({
      characterId: `AT${idx + 1}`,
      characterName: `AT${idx + 1}`,
      styleId: idx + 1,
      styleName: `ATS${idx + 1}`,
      partyIndex: idx,
      position: idx,
      initialSP: 3,
      passives:
        idx === 0
          ? [
              {
                id: 21,
                name: 'アフターサービス',
                desc: '追加ターン開始時 自身のSP+1',
                timing: 'OnAdditionalTurnStart',
                condition: '',
                parts: [{ skill_type: 'HealSp', target_type: 'Self', power: [1, 0] }],
              },
            ]
          : idx === 1
            ? [
                {
                  id: 22,
                  name: '戦場の華',
                  desc: '追加ターン開始時 自分以外の味方のSP+2',
                  timing: 'OnAdditionalTurnStart',
                  condition: '',
                  parts: [{ skill_type: 'HealSp', target_type: 'AllyAllWithoutSelf', power: [2, 0] }],
                },
              ]
            : [],
      skills: [{ id: 28000 + idx, name: 'Wait', label: `ATSkill${idx + 1}`, sp_cost: 0, parts: [] }],
    })
  );
  let state = createBattleStateFromParty(new Party(members));

  state = grantExtraTurn(state, ['AT1']);

  assert.equal(state.turnState.turnType, 'extra');
  assert.equal(state.party.find((m) => m.characterId === 'AT1').sp.current, 6);
  assert.equal(state.party.find((m) => m.characterId === 'AT2').sp.current, 3);
  assert.equal(state.party.find((m) => m.characterId === 'AT3').sp.current, 5);
  assert.equal(state.turnState.passiveEventsLastApplied.length, 2);
  assert.deepEqual(
    state.turnState.passiveEventsLastApplied.map((event) => event.passiveName),
    ['アフターサービス', '戦場の華']
  );
});

test('commitTurn records OnEnemyTurnStart passive events when base turn advances', () => {
  const members = Array.from({ length: 6 }, (_, idx) =>
    new CharacterStyle({
      characterId: `EN${idx + 1}`,
      characterName: `EN${idx + 1}`,
      styleId: idx + 1,
      styleName: `ENS${idx + 1}`,
      partyIndex: idx,
      position: idx,
      initialSP: 3,
      passives:
        idx === 0
          ? [
              {
                id: 41,
                name: '銀氷の加護',
                desc: '敵行動開始時 氷属性弱点の敵の攻撃ステータスを50下げる',
                timing: 'OnEnemyTurnStart',
                condition: '',
                parts: [
                  {
                    skill_type: 'BorderRefPDownByAdmiral',
                    target_type: 'All',
                    target_condition: 'IsWeakElement(Ice)==1',
                    power: [0, 0],
                  },
                ],
              },
            ]
          : [],
      skills: [{ id: 28100 + idx, name: 'Wait', label: `ENSkill${idx + 1}`, sp_cost: 0, parts: [] }],
    })
  );
  let state = createBattleStateFromParty(new Party(members));
  state.turnState.enemyState = {
    ...(state.turnState.enemyState ?? {}),
    enemyCount: 1,
    damageRatesByEnemy: [{ Ice: 150 }],
  };

  const preview = previewTurn(state, {
    0: { characterId: 'EN1', skillId: 28100 },
  });
  const { nextState, committedRecord } = commitTurn(state, preview);

  assert.equal(nextState.turnState.turnIndex, 2);
  assert.equal(committedRecord.passiveEvents.length, 1);
  assert.equal(committedRecord.passiveEvents[0].timing, 'OnEnemyTurnStart');
  assert.equal(committedRecord.passiveEvents[0].passiveName, '銀氷の加護');
  assert.deepEqual(committedRecord.passiveEvents[0].unsupportedEffectTypes, ['BorderRefPDownByAdmiral']);
});

test('OnEveryTurnIncludeSpecial ReduceSp lowers self skill cost at action selection time', () => {
  const members = Array.from({ length: 6 }, (_, idx) =>
    new CharacterStyle({
      characterId: `RS${idx + 1}`,
      characterName: `RS${idx + 1}`,
      styleId: idx + 1,
      styleName: `RSS${idx + 1}`,
      partyIndex: idx,
      position: idx,
      initialSP: 20,
      passives:
        idx === 0
          ? [
              {
                id: 51,
                name: 'ポジショニング',
                desc: 'ダウンターン中の敵がいるとき 自身の消費SPが-2',
                timing: 'OnEveryTurnIncludeSpecial',
                condition: 'CountBC(IsDead()==0 && IsPlayer()==0&&BreakDownTurn()>0)>0',
                parts: [{ skill_type: 'ReduceSp', target_type: 'Self', power: [2, 0] }],
              },
            ]
          : [],
      skills: [{ id: 28200 + idx, name: 'Act', label: `RSSkill${idx + 1}`, sp_cost: idx === 0 ? 8 : 0, parts: [] }],
    })
  );
  const state = createBattleStateFromParty(new Party(members));
  state.turnState.enemyState = {
    ...(state.turnState.enemyState ?? {}),
    enemyCount: 1,
    statuses: [{ statusType: 'DownTurn', targetIndex: 0, remainingTurns: 1 }],
  };

  const preview = previewTurn(state, {
    0: { characterId: 'RS1', skillId: 28200 },
  });

  assert.equal(preview.actions[0].spCost, 6);
  assert.equal(preview.actions[0].startSP, 20);
  assert.equal(preview.actions[0].endSP, 14);
});

test('OnEveryTurnIncludeSpecial ReduceSp can target matching allies at action selection time', () => {
  const members = Array.from({ length: 6 }, (_, idx) =>
    new CharacterStyle({
      characterId: `RA${idx + 1}`,
      characterName: `RA${idx + 1}`,
      styleId: idx + 1,
      styleName: `RAS${idx + 1}`,
      partyIndex: idx,
      position: idx,
      initialSP: 20,
      passives:
        idx === 0
          ? [
              {
                id: 52,
                name: '勇姿',
                desc: 'ターン開始時 チャージ状態の味方の消費SP-1',
                timing: 'OnEveryTurnIncludeSpecial',
                condition: 'CountBC(IsPlayer() && SpecialStatusCountByType(20) > 0)>0',
                parts: [
                  {
                    skill_type: 'ReduceSp',
                    target_type: 'AllyAll',
                    target_condition: 'SpecialStatusCountByType(20)>0',
                    power: [1, 0],
                  },
                ],
              },
            ]
          : [],
      skills: [{ id: 28300 + idx, name: 'Act', label: `RASkill${idx + 1}`, sp_cost: idx === 1 ? 5 : 0, parts: [] }],
    })
  );
  let state = createBattleStateFromParty(new Party(members));
  state = grantExtraTurn(state, ['RA2']);

  const preview = previewTurn(state, {
    1: { characterId: 'RA2', skillId: 28301 },
  });

  assert.equal(preview.actions[0].spCost, 4);
  assert.equal(preview.actions[0].startSP, 20);
  assert.equal(preview.actions[0].endSP, 16);
});

test('OnEveryTurnIncludeSpecial AttackUp is exposed on preview action modifiers', () => {
  const members = Array.from({ length: 6 }, (_, idx) =>
    new CharacterStyle({
      characterId: `AP${idx + 1}`,
      characterName: `AP${idx + 1}`,
      styleId: idx + 1,
      styleName: `APS${idx + 1}`,
      partyIndex: idx,
      position: idx,
      initialSP: 10,
      initialEP: idx === 0 ? 10 : 0,
      passives:
        idx === 0
          ? [
              {
                id: 53,
                name: 'トルクマキシマム',
                desc: '行動選択時 自身のEPが10以上のとき 自身のスキル攻撃力+50%',
                timing: 'OnEveryTurnIncludeSpecial',
                condition: 'Ep()>=10',
                parts: [{ skill_type: 'AttackUp', target_type: 'Self', power: [0.5, 0] }],
              },
            ]
          : [],
      skills: [{ id: 28400 + idx, name: 'Act', label: `APSkill${idx + 1}`, sp_cost: idx === 0 ? 4 : 0, parts: [] }],
    })
  );
  const state = createBattleStateFromParty(new Party(members));

  const preview = previewTurn(state, {
    0: { characterId: 'AP1', skillId: 28400 },
  });

  assert.equal(preview.actions[0].specialPassiveModifiers?.attackUpRate, 0.5);
  assert.equal(preview.actions[0].specialPassiveEvents?.length, 1);
  assert.equal(preview.actions[0].specialPassiveEvents?.[0]?.passiveName, 'トルクマキシマム');
});

test('commitTurn applies OnBattleWin passives when all enemies are dead', () => {
  const members = Array.from({ length: 6 }, (_, idx) =>
    new CharacterStyle({
      characterId: `BW${idx + 1}`,
      characterName: `BW${idx + 1}`,
      styleId: idx + 1,
      styleName: `BWS${idx + 1}`,
      partyIndex: idx,
      position: idx,
      initialSP: 3,
      elements: idx === 0 ? ['Fire'] : [],
      passives:
        idx === 0
          ? [
              {
                id: 61,
                name: '実の父よりもシチーは飽きることがない',
                desc: 'バトル勝利時 味方全体の火属性スタイルのSP+3',
                timing: 'OnBattleWin',
                condition: '',
                parts: [
                  {
                    skill_type: 'HealSp',
                    target_type: 'AllyAll',
                    target_condition: 'IsNatureElement(Fire)',
                    power: [3, 0],
                  },
                ],
              },
            ]
          : [],
      skills: [{ id: 28500 + idx, name: 'Act', label: `BWSkill${idx + 1}`, sp_cost: 0, parts: [] }],
    })
  );
  let state = createBattleStateFromParty(new Party(members));
  state.turnState.enemyState = {
    ...(state.turnState.enemyState ?? {}),
    enemyCount: 1,
    statuses: [{ statusType: 'Dead', targetIndex: 0, remainingTurns: 0 }],
  };

  const preview = previewTurn(state, {
    0: { characterId: 'BW1', skillId: 28500 },
  });
  const { nextState, committedRecord } = commitTurn(state, preview);

  assert.equal(nextState.party.find((m) => m.characterId === 'BW1').sp.current, 8);
  assert.equal(committedRecord.passiveEvents.some((event) => event.timing === 'OnBattleWin'), true);
  assert.equal(committedRecord.passiveEvents.some((event) => event.passiveName === '実の父よりもシチーは飽きることがない'), true);
});

test('commitTurn applies OnBattleWin HealDpRate passive to matching allies', () => {
  const members = Array.from({ length: 6 }, (_, idx) =>
    new CharacterStyle({
      characterId: `BDP${idx + 1}`,
      characterName: `BDP${idx + 1}`,
      styleId: idx + 1,
      styleName: `BDPS${idx + 1}`,
      partyIndex: idx,
      position: idx,
      initialSP: 3,
      baseMaxDp: 70,
      currentDp: idx < 2 ? 0 : 35,
      elements: idx < 2 ? ['Fire'] : ['Ice'],
      passives:
        idx === 0
          ? [
              {
                id: 62,
                name: '愛情の料理',
                desc: 'バトル勝利時 味方全体の火属性スタイルのDP+100%',
                timing: 'OnBattleWin',
                condition: '',
                parts: [
                  {
                    skill_type: 'HealDpRate',
                    target_type: 'AllyAll',
                    target_condition: 'IsNatureElement(Fire)',
                    power: [1, 0],
                  },
                ],
              },
            ]
          : [],
      skills: [{ id: 28600 + idx, name: 'Act', label: `BDPSkill${idx + 1}`, sp_cost: 0, parts: [] }],
    })
  );
  let state = createBattleStateFromParty(new Party(members));
  state.turnState.enemyState = {
    ...(state.turnState.enemyState ?? {}),
    enemyCount: 1,
    statuses: [{ statusType: 'Dead', targetIndex: 0, remainingTurns: 0 }],
  };

  const preview = previewTurn(state, {
    0: { characterId: 'BDP1', skillId: 28600 },
  });
  const { nextState, committedRecord } = commitTurn(state, preview);

  assert.equal(nextState.party[0].dpState.currentDp, 70);
  assert.equal(nextState.party[1].dpState.currentDp, 70);
  assert.equal(nextState.party[2].dpState.currentDp, 35);
  assert.equal(committedRecord.passiveEvents.some((event) => event.passiveName === '愛情の料理'), true);
  assert.equal(
    committedRecord.dpEvents.some(
      (event) => event.source === 'dp_passive' && event.passiveName === '愛情の料理' && event.delta === 70
    ),
    true
  );
});

// C群: IceMarkLevel パッシブテスト
test('IceMarkLevel condition can trigger passives from current ice mark state', () => {
  const party = createSixMemberManualParty((idx) =>
    idx === 0
      ? {
          markStates: {
            Ice: { current: 6, min: 0, max: 6 },
          },
          passives: [
            {
              id: 18700,
              name: 'Ice Mark Passive',
              timing: 'OnEveryTurn',
              condition: 'IceMarkLevel()>=6',
              parts: [{ skill_type: 'HealSp', target_type: 'Self', power: [3, 0] }],
            },
          ],
        }
      : {}
  );
  const state = createBattleStateFromParty(party);
  const result = applyPassiveTiming(state, 'OnEveryTurn');

  assert.equal(result.spEvents.length, 1);
  assert.equal(result.spEvents[0]?.characterId, 'M1');
  assert.equal(result.spEvents[0]?.delta, 3);
});

test('IceMarkLevel condition does not trigger when ice mark is below threshold', () => {
  const party = createSixMemberManualParty((idx) =>
    idx === 0
      ? {
          markStates: {
            Ice: { current: 5, min: 0, max: 6 },
          },
          passives: [
            {
              id: 18701,
              name: 'Ice Mark Passive',
              timing: 'OnEveryTurn',
              condition: 'IceMarkLevel()>=6',
              parts: [{ skill_type: 'HealSp', target_type: 'Self', power: [3, 0] }],
            },
          ],
        }
      : {}
  );
  const state = createBattleStateFromParty(party);
  const result = applyPassiveTiming(state, 'OnEveryTurn');

  assert.equal(result.spEvents.length, 0, 'passive should not fire when ice mark < 6');
});

// C群: OnOverdriveStart タイミングテスト
test('OnOverdriveStart passive with IsFront condition fires for frontline members via applyPassiveTiming', () => {
  const party = createSixMemberManualParty((idx) =>
    idx === 0
      ? {
          passives: [
            {
              id: 18710,
              name: 'OD Start Passive',
              timing: 'OnOverdriveStart',
              condition: 'IsFront()',
              parts: [{ skill_type: 'HealSp', target_type: 'Self', power: [5, 0] }],
            },
          ],
        }
      : {}
  );
  const state = createBattleStateFromParty(party);

  // M1 は position=0（前衛）なので IsFront() が成立する
  const result = applyPassiveTiming(state, 'OnOverdriveStart');

  assert.equal(result.spEvents.length, 1, 'frontline member should gain SP');
  assert.equal(result.spEvents[0]?.characterId, 'M1');
  assert.equal(result.spEvents[0]?.delta, 5);
});

test('OnOverdriveStart passive does not fire for backline member with IsFront condition', () => {
  const party = createSixMemberManualParty((idx) =>
    idx === 3
      ? {
          passives: [
            {
              id: 18711,
              name: 'OD Start Passive',
              timing: 'OnOverdriveStart',
              condition: 'IsFront()',
              parts: [{ skill_type: 'HealSp', target_type: 'Self', power: [5, 0] }],
            },
          ],
        }
      : {}
  );
  const state = createBattleStateFromParty(party);

  // M4 は position=3（後衛）なので IsFront() が不成立
  const result = applyPassiveTiming(state, 'OnOverdriveStart');

  assert.equal(result.spEvents.length, 0, 'backline member should not gain SP with IsFront condition');
});

test('OnOverdriveStart passive does not fire on non-OD timing (OnPlayerTurnStart)', () => {
  const party = createSixMemberManualParty((idx) =>
    idx === 0
      ? {
          passives: [
            {
              id: 18712,
              name: 'OD Start Only Passive',
              timing: 'OnOverdriveStart',
              condition: '',
              parts: [{ skill_type: 'HealSp', target_type: 'Self', power: [3, 0] }],
            },
          ],
        }
      : {}
  );
  const state = createBattleStateFromParty(party);

  // OnPlayerTurnStart では OnOverdriveStart タイミングの passive は発動しない
  const result = applyPassiveTiming(state, 'OnPlayerTurnStart');

  assert.equal(result.spEvents.length, 0, 'OnOverdriveStart passive must not fire on OnPlayerTurnStart');
});
