import test from 'node:test';
import assert from 'node:assert/strict';

import {
  CharacterStyle,
  Party,
  createBattleStateFromParty,
  previewTurn,
  commitTurn,
} from '../src/index.js';

function createSixMembers() {
  return Array.from({ length: 6 }, (_, idx) =>
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
                id: 31001,
                name: 'BuffOnly',
                label: 'BuffOnly',
                desc: 'No damage action',
                sp_cost: 0,
                parts: [{ skill_type: 'AttackUp', target_type: 'Self' }],
              },
            ]
          : [
              {
                id: 32000 + idx,
                name: 'Normal',
                label: `Normal${idx}`,
                sp_cost: 0,
                parts: [],
              },
            ],
    })
  );
}

test('MindEye special status stacks and keeps source desc', () => {
  const member = createSixMembers()[0];
  const skill = { skillId: 46001714, label: 'TKunimiSkill55', name: 'オープン・ザ・ロード', desc: '心眼を付与する' };
  const actor = { characterId: 'TKunimi', characterName: '國見 タマ' };

  member.applySpecialStatus(78, 1, 'Count', { skill, actor });
  member.applySpecialStatus(78, 1, 'Count', { skill, actor });

  const mindEyes = member.getMindEyeEffects({ activeOnly: true });
  assert.equal(mindEyes.length, 2);
  assert.equal(mindEyes.every((effect) => effect.sourceSkillDesc === '心眼を付与する'), true);
  assert.equal(mindEyes.every((effect) => effect.sourceCharacterName === '國見 タマ'), true);
});

test('MindEye special status is not consumed by non-damage action', () => {
  const members = createSixMembers();
  const actor = members[0];
  const skill = { skillId: 46001714, label: 'TKunimiSkill55', name: 'オープン・ザ・ロード', desc: '心眼を付与する' };

  actor.applySpecialStatus(78, 1, 'Count', { skill, actor: { characterId: 'TKunimi', characterName: '國見 タマ' } });
  actor.applySpecialStatus(78, 1, 'Count', { skill, actor: { characterId: 'TKunimi', characterName: '國見 タマ' } });

  let state = createBattleStateFromParty(new Party(members));
  const preview = previewTurn(state, {
    0: { characterId: 'ME1', skillId: 31001 },
  });
  state = commitTurn(state, preview).nextState;

  const remaining = state.party.find((m) => m.characterId === 'ME1').getMindEyeEffects({ activeOnly: true });
  assert.equal(remaining.length, 2);
});
