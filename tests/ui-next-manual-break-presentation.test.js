import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildAutoBreakChipModels,
  buildDpAutoBreakChipModels,
  buildHpAutoKillChipModels,
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

test('buildAutoBreakChipModels picks up actions with autoBreakEnemyIndexes', () => {
  const chipModels = buildAutoBreakChipModels({
    actions: [
      {
        characterId: 'BIYamawaki',
        actorCharacterId: 'BIYamawaki',
        positionIndex: 0,
        skillId: 1234,
        autoBreakEnemyIndexes: [0, 1],
      },
    ],
    members: [
      { position: 0, characterId: 'BIYamawaki', characterName: '山脇・ボン・イヴァール' },
    ],
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
    ['ワッキー→ワイバーン ブレイク (自動)', 'ワッキー→E2 ブレイク (自動)']
  );
});

test('buildAutoBreakChipModels skips actions without autoBreakEnemyIndexes', () => {
  const chipModels = buildAutoBreakChipModels({
    actions: [
      { characterId: 'X', positionIndex: 0, skillId: 1, autoBreakEnemyIndexes: [] },
      { characterId: 'X', positionIndex: 0, skillId: 2 },
    ],
    members: [{ position: 0, characterId: 'X', characterName: 'カレン' }],
    store: createStore(),
    enemyNamesByEnemy: {},
  });
  assert.equal(chipModels.length, 0);
});

test('buildAutoBreakChipModels deduplicates same actor+skill+enemy combinations', () => {
  const chipModels = buildAutoBreakChipModels({
    actions: [
      { characterId: 'X', positionIndex: 0, skillId: 5, autoBreakEnemyIndexes: [0] },
      { characterId: 'X', positionIndex: 0, skillId: 5, autoBreakEnemyIndexes: [0] },
    ],
    members: [{ position: 0, characterId: 'X', characterName: 'カレン' }],
    store: createStore(),
    enemyNamesByEnemy: {},
  });
  assert.equal(chipModels.length, 1);
  assert.equal(chipModels[0].label, 'カレン→E1 ブレイク (自動)');
});

test('buildAutoBreakChipModels falls back to position when characterId is missing', () => {
  const chipModels = buildAutoBreakChipModels({
    actions: [
      { positionIndex: 1, skillId: 9, autoBreakEnemyIndexes: [2] },
    ],
    members: [{ position: 1, characterId: 'Y', characterName: 'ユキ' }],
    store: createStore(),
    enemyNamesByEnemy: {},
  });
  assert.equal(chipModels.length, 1);
  assert.equal(chipModels[0].label, 'ユキ→E3 ブレイク (自動)');
});

// ---------------------------------------------------------------------------
// buildDpAutoBreakChipModels
// ---------------------------------------------------------------------------

test('buildDpAutoBreakChipModels generates DP break chip from enemyStatusChanges source:auto', () => {
  const chipModels = buildDpAutoBreakChipModels({
    actions: [
      {
        characterId: 'BIYamawaki',
        actorCharacterId: 'BIYamawaki',
        positionIndex: 0,
        skillId: 1234,
        autoBreakEnemyIndexes: [],
        enemyStatusChanges: [
          { mode: 'DownTurn', source: 'auto', targetIndex: 0 },
        ],
      },
    ],
    members: [{ position: 0, characterId: 'BIYamawaki', characterName: 'ワッキー' }],
    store: createStore(),
    enemyNamesByEnemy: { 0: 'ワイバーン' },
  });

  assert.equal(chipModels.length, 1);
  assert.equal(chipModels[0].label, 'ワッキー→ワイバーン ブレイク (DP)');
  assert.equal(chipModels[0].enemyIndex, 0);
});

test('buildDpAutoBreakChipModels skips changes with source:manual', () => {
  const chipModels = buildDpAutoBreakChipModels({
    actions: [
      {
        characterId: 'X',
        positionIndex: 0,
        skillId: 1,
        autoBreakEnemyIndexes: [],
        enemyStatusChanges: [
          { mode: 'DownTurn', source: 'manual', targetIndex: 0 },
        ],
      },
    ],
    members: [{ position: 0, characterId: 'X', characterName: 'カレン' }],
    store: createStore(),
    enemyNamesByEnemy: {},
  });
  assert.equal(chipModels.length, 0);
});

test('buildDpAutoBreakChipModels skips enemies already in autoBreakEnemyIndexes', () => {
  const chipModels = buildDpAutoBreakChipModels({
    actions: [
      {
        characterId: 'X',
        positionIndex: 0,
        skillId: 1,
        autoBreakEnemyIndexes: [0],
        enemyStatusChanges: [
          { mode: 'DownTurn', source: 'auto', targetIndex: 0 },
        ],
      },
    ],
    members: [{ position: 0, characterId: 'X', characterName: 'カレン' }],
    store: createStore(),
    enemyNamesByEnemy: {},
  });
  assert.equal(chipModels.length, 0);
});

test('buildDpAutoBreakChipModels deduplicates same actor+skill+enemy combination', () => {
  const action = {
    characterId: 'X',
    positionIndex: 0,
    skillId: 5,
    autoBreakEnemyIndexes: [],
    enemyStatusChanges: [
      { mode: 'DownTurn', source: 'auto', targetIndex: 1 },
      { mode: 'DownTurn', source: 'auto', targetIndex: 1 },
    ],
  };
  const chipModels = buildDpAutoBreakChipModels({
    actions: [action],
    members: [{ position: 0, characterId: 'X', characterName: 'ユキ' }],
    store: createStore(),
    enemyNamesByEnemy: {},
  });
  assert.equal(chipModels.length, 1);
  assert.equal(chipModels[0].label, 'ユキ→E2 ブレイク (DP)');
});

// ---------------------------------------------------------------------------
// buildHpAutoKillChipModels
// ---------------------------------------------------------------------------

test('buildHpAutoKillChipModels generates HP kill chip from enemyStatusChanges source:auto Dead', () => {
  const chipModels = buildHpAutoKillChipModels({
    actions: [
      {
        characterId: 'BIYamawaki',
        actorCharacterId: 'BIYamawaki',
        positionIndex: 0,
        skillId: 1234,
        enemyStatusChanges: [
          { statusType: 'Dead', mode: 'Dead', source: 'auto', targetIndex: 0 },
        ],
      },
    ],
    members: [{ position: 0, characterId: 'BIYamawaki', characterName: 'ワッキー' }],
    store: createStore(),
    enemyNamesByEnemy: { 0: 'ワイバーン' },
  });

  assert.equal(chipModels.length, 1);
  assert.equal(chipModels[0].label, 'ワッキー→ワイバーン 討伐 (HP)');
  assert.equal(chipModels[0].enemyIndex, 0);
});

test('buildHpAutoKillChipModels skips manual Dead changes', () => {
  const chipModels = buildHpAutoKillChipModels({
    actions: [
      {
        characterId: 'X',
        positionIndex: 0,
        skillId: 1,
        enemyStatusChanges: [
          { statusType: 'Dead', mode: 'Dead', source: 'manual', targetIndex: 0 },
        ],
      },
    ],
    members: [{ position: 0, characterId: 'X', characterName: 'カレン' }],
    store: createStore(),
    enemyNamesByEnemy: {},
  });
  assert.equal(chipModels.length, 0);
});

test('buildHpAutoKillChipModels deduplicates same actor+skill+enemy combination', () => {
  const action = {
    characterId: 'X',
    positionIndex: 0,
    skillId: 5,
    enemyStatusChanges: [
      { statusType: 'Dead', source: 'auto', targetIndex: 1 },
      { mode: 'Dead', source: 'auto', enemyIndex: 1 },
    ],
  };
  const chipModels = buildHpAutoKillChipModels({
    actions: [action],
    members: [{ position: 0, characterId: 'X', characterName: 'ユキ' }],
    store: createStore(),
    enemyNamesByEnemy: {},
  });
  assert.equal(chipModels.length, 1);
  assert.equal(chipModels[0].label, 'ユキ→E2 討伐 (HP)');
});
