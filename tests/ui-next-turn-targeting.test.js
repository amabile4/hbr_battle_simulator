import test from 'node:test';
import assert from 'node:assert/strict';

import { formatTurnTargetLabel, resolveTurnTargetConfig } from '../ui-next/utils/turn-targeting.js';

function createStore(charactersByLabel = {}) {
  return {
    getCharacterByLabel(label) {
      return charactersByLabel[String(label ?? '')] ?? null;
    },
  };
}

test('formatTurnTargetLabel uses the shortest ally character label from store metadata', () => {
  const config = {
    kind: 'ally',
    candidates: [
      {
        partyIndex: 4,
        styleId: 1001,
        characterId: 'RKayamori',
        characterName: '茅森 月歌',
        position: 4,
        disabled: false,
      },
    ],
  };

  const label = formatTurnTargetLabel(
    config,
    { type: 'ally', styleId: 1001, characterId: 'RKayamori' },
    {
      store: createStore({
        RKayamori: {
          label: 'RKayamori',
          name: '茅森 月歌 — Ruka Kayamori',
        },
      }),
    }
  );

  assert.equal(label, '月歌');
});

test('formatTurnTargetLabel falls back to the shortest available ally name when store metadata is absent', () => {
  const config = {
    kind: 'ally',
    candidates: [
      {
        partyIndex: 2,
        styleId: 2002,
        characterId: 'UIIzumi',
        characterName: '和泉 ユキ',
        position: 2,
        disabled: false,
      },
    ],
  };

  const label = formatTurnTargetLabel(
    config,
    { type: 'ally', styleId: 2002, characterId: 'UIIzumi' }
  );

  assert.equal(label, 'ユキ');
});

test('resolveTurnTargetConfig disables dead enemy slots while keeping occupied slots visible', () => {
  const config = resolveTurnTargetConfig({
    member: { characterId: 'UI1' },
    effectiveSkill: {
      targetType: 'Single',
      parts: [{ skill_type: 'AttackSkill', target_type: 'Single', type: 'Slash' }],
    },
    state: {
      party: [],
      turnState: {
        enemyState: {
          enemyCount: 3,
          statuses: [
            {
              statusType: 'Dead',
              targetIndex: 1,
              remainingTurns: 0,
              exitCond: 'Eternal',
            },
          ],
        },
      },
    },
    enemyCount: 3,
  });

  assert.equal(config?.kind, 'enemy');
  assert.deepEqual(
    config?.candidates?.map((candidate) => ({
      enemyIndex: candidate.enemyIndex,
      disabled: candidate.disabled,
    })),
    [
      { enemyIndex: 0, disabled: false },
      { enemyIndex: 1, disabled: true },
      { enemyIndex: 2, disabled: false },
    ]
  );
});
