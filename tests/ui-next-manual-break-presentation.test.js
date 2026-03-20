import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildManualBreakChipModels,
  resolveManualBreakActorLabel,
  resolveManualBreakEnemyLabel,
} from '../ui-next/utils/manual-break-presentation.js';

function createStore(charactersByLabel = {}) {
  return {
    getCharacterByLabel(label) {
      return charactersByLabel[String(label ?? '')] ?? null;
    },
  };
}

test('resolveManualBreakActorLabel chooses the shortest label among nickname, given name, and full name', () => {
  const store = createStore({
    BIYamawaki: {
      label: 'BIYamawaki',
      name: '山脇・ボン・イヴァール — Ivar Bon Yamawaki — ワッキー Wakkii',
    },
    IcOhshima: {
      label: 'IcOhshima',
      name: '大島 一千子 — Ichiko Ohshima — いっちー Icchii',
    },
  });

  assert.equal(
    resolveManualBreakActorLabel(
      { characterId: 'BIYamawaki', characterName: '山脇・ボン・イヴァール' },
      store
    ),
    'ワッキー'
  );
  assert.equal(
    resolveManualBreakActorLabel(
      { characterId: 'IcOhshima', characterName: '大島 一千子' },
      store
    ),
    '一千子'
  );
});

test('resolveManualBreakActorLabel falls back to the shortest available label when nickname is missing', () => {
  const store = createStore({
    RKayamori: {
      label: 'RKayamori',
      name: '茅森 月歌 — Ruka Kayamori',
    },
    UIIzumi: {
      label: 'UIIzumi',
      name: '和泉 ユキ — Yuki Izumi',
    },
  });

  assert.equal(
    resolveManualBreakActorLabel({ characterId: 'RKayamori', characterName: '茅森 月歌' }, store),
    '月歌'
  );
  assert.equal(
    resolveManualBreakActorLabel({ characterId: 'UIIzumi', characterName: '和泉 ユキ' }, store),
    'ユキ'
  );
});

test('resolveManualBreakActorLabel keeps a single token name as-is', () => {
  assert.equal(resolveManualBreakActorLabel({ characterName: 'カレン' }, createStore()), 'カレン');
});

test('buildManualBreakChipModels renders actor and enemy labels per enemy', () => {
  const chipModels = buildManualBreakChipModels({
    overrides: [{ position: 0, outcome: 'Break', enemyIndexes: [0, 2] }],
    members: [{ position: 0, characterId: 'BIYamawaki', characterName: '山脇・ボン・イヴァール' }],
    store: createStore({
      BIYamawaki: {
        label: 'BIYamawaki',
        name: '山脇・ボン・イヴァール — Ivar Bon Yamawaki — ワッキー Wakkii',
      },
    }),
    enemyNamesByEnemy: { 0: 'ワイバーン' },
  });

  assert.deepEqual(
    chipModels.map((chip) => chip.label),
    ['ワッキー→ワイバーン ブレイク', 'ワッキー→E3 ブレイク']
  );
  assert.equal(resolveManualBreakEnemyLabel(1, {}), 'E2');
});
