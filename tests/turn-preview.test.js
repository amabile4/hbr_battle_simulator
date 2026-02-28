import test from 'node:test';
import assert from 'node:assert/strict';
import { commitTurn, previewTurn } from '../src/index.js';
import { getStore, getSixUsableStyleIds } from './helpers.js';

test('turn preview and commit work with revision guard', () => {
  const store = getStore();
  const styleIds = getSixUsableStyleIds(store);
  const party = store.buildPartyFromStyleIds(styleIds, { initialSP: 15 });

  const actionPlan = party
    .getFrontline()
    .map((member) => {
      const skill = member.skills.find((item) => item.spCost > 0) ?? member.skills[0];
      return {
        position: member.position,
        skillId: skill.skillId,
      };
    });

  const preview = previewTurn(party, actionPlan);

  assert.equal(preview.status, 'preview');
  assert.equal(preview.entries.length, 3);

  const committed = commitTurn(party, preview);
  assert.equal(committed.status, 'committed');
  assert.equal(committed.applied.length, 3);

  assert.throws(() => commitTurn(party, preview), /State changed after preview/);
});
