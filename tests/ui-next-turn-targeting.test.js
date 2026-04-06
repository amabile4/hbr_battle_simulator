import test from 'node:test';
import assert from 'node:assert/strict';

import { formatTurnTargetLabel } from '../ui-next/utils/turn-targeting.js';

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
