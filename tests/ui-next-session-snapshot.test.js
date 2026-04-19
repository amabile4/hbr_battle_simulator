import test from 'node:test';
import assert from 'node:assert/strict';

import {
  decorateSessionSnapshotForHumans,
  normalizeSessionSnapshot,
  serializeSessionSnapshot,
  SESSION_SNAPSHOT_VERSION,
} from '../ui-next/utils/session-snapshot.js';
import { TARGET_SELECTION_MODES } from '../ui-next/utils/simulator-settings.js';
import { REPLAY_OVERRIDE_ENTRY_TYPES, REPLAY_SETUP_ENTRY_TYPES } from '../src/ui/lightweight-replay-script.js';

test('normalizeSessionSnapshot fills defaults and preserves replay override entries', () => {
  const snapshot = normalizeSessionSnapshot({
    setup: {
      styleIds: [1001, 1002, 1003, null, null, null],
      supportStyleIds: [null, null, null, null, null, null],
      limitBreakLevelsByPartyIndex: { 0: 4, 1: 3, 2: 2 },
      skillSetsByPartyIndex: { 0: ['46000001', 46400001] },
    },
    enemy: {
      selectedEnemyIds: [7001, null, null],
      enemySlots: [
        {
          slotIndex: 0,
          selectedEnemyId: 7001,
          selectedEnemyName: '敵A',
          od_rate: 8500,
          max_d_rate: 700,
          e_shield: {
            count: 10,
            max: 10,
            elements: ['Light', 'Dark'],
            def_up_rate: 5000,
            dmg_limit: 0,
          },
          resistances: {
            element: { fire: 130 },
          },
          absorbElementList: ['fire'],
        },
      ],
      preemptiveField: 'fire',
    },
    simulatorSettings: {
      targetSelection: {
        enemyMode: TARGET_SELECTION_MODES.MANUAL,
      },
      captureUntilBattleEnd: true,
    },
    replayScript: {
      turns: [
        {
          turn: 1,
          slots: [{ styleId: 1001, skillId: 2001 }],
          overrideEntries: [
            {
              type: REPLAY_OVERRIDE_ENTRY_TYPES.ACTION_OUTCOME_OVERRIDES,
              payload: [{ position: 0, outcome: 'Break', enemyIndexes: [0, 1] }],
            },
          ],
        },
      ],
    },
  });

  assert.equal(snapshot.version, SESSION_SNAPSHOT_VERSION);
  assert.equal(snapshot.setup.isFrontFilled, true);
  assert.equal(snapshot.simulatorSettings.targetSelection.enemyMode, TARGET_SELECTION_MODES.MANUAL);
  assert.equal(snapshot.simulatorSettings.captureUntilBattleEnd, true);
  assert.equal(snapshot.validationPolicy.allowUseCountOverflow, true);
  assert.deepEqual(snapshot.setup.skillSetsByPartyIndex['0'], [46000001, 46400001]);
  assert.equal(snapshot.enemy.enemySlots[0].selectedEnemyId, 7001);
  assert.equal(snapshot.enemy.enemySlots[0].selectedEnemyName, '敵A');
  assert.equal(snapshot.enemy.enemySlots[0].od_rate, 0.85);
  assert.equal(snapshot.enemy.enemySlots[0].max_d_rate, 700);
  assert.deepEqual(snapshot.enemy.enemySlots[0].e_shield, {
    count: 10,
    max: 10,
    elements: ['Light', 'Dark'],
    def_up_rate: 5000,
    dmg_limit: 0,
  });
  assert.equal(snapshot.enemy.enemySlots[0].resistances.element.fire, 130);
  assert.deepEqual(snapshot.enemy.enemySlots[0].absorbElementList, ['fire']);
  assert.equal(snapshot.enemy.preemptiveField, 'fire');
  assert.deepEqual(
    snapshot.replayScript.turns[0].overrideEntries.find(
      (entry) => entry.type === REPLAY_OVERRIDE_ENTRY_TYPES.ACTION_OUTCOME_OVERRIDES
    )?.payload,
    [{ position: 0, outcome: 'Break', enemyIndexes: [0, 1] }]
  );
});

test('serializeSessionSnapshot writes a round-trippable JSON payload', () => {
  const text = serializeSessionSnapshot({
    setup: {
      styleIds: [1001, 1002, 1003, null, null, null],
      supportStyleIds: [null, null, null, null, null, null],
      normalAttackElementsByPartyIndex: {
        0: ['Ice'],
      },
    },
    enemy: {
      selectedEnemyId: 7001,
      selectedEnemyName: '敵A',
      od_rate: 1,
      max_d_rate: 700,
      resistances: {
        element: { fire: 150 },
      },
      absorbElementList: ['fire'],
    },
    replayScript: {
      turns: [],
    },
  });

  const parsed = JSON.parse(text);
  assert.equal(parsed.version, SESSION_SNAPSHOT_VERSION);
  assert.equal(parsed.validationPolicy.allowInsufficientSp, true);
  assert.equal(parsed.simulatorSettings.captureUntilBattleEnd, true);
  assert.deepEqual(parsed.setup.styleIds.slice(0, 3), [1001, 1002, 1003]);
  assert.deepEqual(parsed.setup.normalAttackElementsByPartyIndex, { 0: ['Ice'] });
  assert.deepEqual(parsed.setup.skillSetsByPartyIndex, {});
  assert.equal(parsed.enemy.selectedEnemyId, 7001);
  assert.equal(parsed.enemy.od_rate, 1);
  assert.equal(parsed.enemy.resistances.element.fire, 150);
});

test('normalizeSessionSnapshot keeps only valid single-value normalAttackElementsByPartyIndex entries', () => {
  const snapshot = normalizeSessionSnapshot({
    setup: {
      styleIds: [1001, 1002, 1003, null, null, null],
      supportStyleIds: [null, null, null, null, null, null],
      normalAttackElementsByPartyIndex: {
        0: ['Light'],
        1: ['Fire', 'Ice'],
        2: ['Void'],
      },
    },
  });

  assert.deepEqual(snapshot.setup.normalAttackElementsByPartyIndex, {
    0: ['Light'],
  });
});

test('normalizeSessionSnapshot canonicalizes replay setup bracelet legacy fields into setupEntries', () => {
  const snapshot = normalizeSessionSnapshot({
    replayScript: {
      setup: {
        styleIds: [1001, 1002, 1003, null, null, null],
        normalAttackElementsByPartyIndex: {
          0: ['Dark'],
          1: ['Fire', 'Ice'],
        },
      },
      turns: [],
    },
  });

  assert.equal(Object.hasOwn(snapshot.replayScript.setup, 'normalAttackElementsByPartyIndex'), false);
  assert.deepEqual(
    snapshot.replayScript.setup.setupEntries.find(
      (entry) => entry.type === REPLAY_SETUP_ENTRY_TYPES.NORMAL_ATTACK_ELEMENTS_BY_PARTY_INDEX
    ),
    {
      type: REPLAY_SETUP_ENTRY_TYPES.NORMAL_ATTACK_ELEMENTS_BY_PARTY_INDEX,
      payload: { 0: ['Dark'] },
    }
  );
});

test('normalizeSessionSnapshot preserves manual Eシールド edits in enemy setup snapshots', () => {
  const snapshot = normalizeSessionSnapshot({
    enemy: {
      selectedEnemyId: 13450815,
      selectedEnemyName: '変貌を重ねる不滅の円環',
      isManual: true,
      manual: {
        od_rate: 1,
        max_d_rate: 999,
        element: {
          fire: 100,
          ice: 100,
        },
        absorbElementList: [],
        e_shield: {
          count: 9,
          max: 15,
          elements: ['Fire', 'Thunder'],
          def_up_rate: 3200,
          dmg_limit: 180000,
        },
      },
    },
  });

  assert.equal(snapshot.enemy.isManual, true);
  assert.deepEqual(snapshot.enemy.manual.e_shield, {
    count: 9,
    max: 15,
    elements: ['Fire', 'Thunder'],
    def_up_rate: 3200,
    dmg_limit: 180000,
  });
  assert.deepEqual(snapshot.enemy.enemySlots[0].manual.e_shield, {
    count: 9,
    max: 15,
    elements: ['Fire', 'Thunder'],
    def_up_rate: 3200,
    dmg_limit: 180000,
  });
  assert.deepEqual(snapshot.enemy.e_shield, {
    count: 9,
    max: 15,
    elements: ['Fire', 'Thunder'],
    def_up_rate: 3200,
    dmg_limit: 180000,
  });
});

test('decorateSessionSnapshotForHumans adds names and turn/action SP metadata', () => {
  const decorated = decorateSessionSnapshotForHumans(
    {
      setup: {
        styleIds: [1001, 1002, 1003, null, null, null],
        supportStyleIds: [2001, null, null, null, null, null],
        skillSetsByPartyIndex: {
          0: [3001, 3002],
        },
      },
      replayScript: {
        setup: {
          styleIds: [1001, 1002, 1003],
          supportStyleIdsByPartyIndex: { 0: 2001 },
          skillSetsByPartyIndex: { 0: [3001, 3002] },
        },
        turns: [
          {
            turn: 1,
            slots: [
              { styleId: 1001, skillId: 3001 },
              { styleId: 1002, skillId: null },
            ],
          },
        ],
      },
    },
    {
      resolveStyleName: (styleId) => ({ 1001: '茅森月歌', 1002: '和泉ユキ', 1003: '逢川めぐみ', 2001: 'サポートA' }[styleId] ?? null),
      resolveCharacterName: (styleId) => ({ 1001: '茅森 月歌', 1002: '和泉 ユキ', 1003: '逢川 めぐみ', 2001: 'サポート役A' }[styleId] ?? null),
      resolveSkillName: (skillId) => ({ 3001: 'プロテクション', 3002: '通常攻撃' }[skillId] ?? null),
      getTurnStartSpByStyleId: () => ({ 1001: 12, 1002: 9 }),
      getTurnPostSkillSpByStyleId: () => ({ 1001: 4 }),
      getTurnActionOrderByStyleId: () => [1002, 1001],
    }
  );

  assert.deepEqual(decorated.setup.styleNames.slice(0, 3), ['茅森月歌', '和泉ユキ', '逢川めぐみ']);
  assert.deepEqual(decorated.setup.characterNames.slice(0, 3), ['茅森 月歌', '和泉 ユキ', '逢川 めぐみ']);
  assert.equal(decorated.setup.supportStyleNames[0], 'サポートA');
  assert.equal(decorated.setup.supportCharacterNames[0], 'サポート役A');
  assert.deepEqual(decorated.setup.skillNamesByPartyIndex['0'], ['プロテクション', '通常攻撃']);
  assert.deepEqual(decorated.replayScript.setup.characterNames.slice(0, 3), ['茅森 月歌', '和泉 ユキ', '逢川 めぐみ']);
  assert.equal(decorated.replayScript.setup.supportCharacterNamesByPartyIndex['0'], 'サポート役A');
  assert.equal(decorated.replayScript.turns[0].slots[0].styleName, '茅森月歌');
  assert.equal(decorated.replayScript.turns[0].slots[0].characterName, '茅森 月歌');
  assert.equal(decorated.replayScript.turns[0].slots[0].skillName, 'プロテクション');
  assert.equal(decorated.replayScript.turns[0].turn, 1);
  assert.equal(decorated.replayScript.turns[0].slots[0].spAtTurnStart, 12);
  assert.equal(decorated.replayScript.turns[0].slots[0].spAtActionStart, 4);
  assert.equal(decorated.replayScript.turns[0].slots[1].spAtTurnStart, 9);
  assert.equal(decorated.replayScript.turns[0].slots[1].spAtActionStart, null);
  assert.deepEqual(decorated.replayScript.turns[0].info.spAtTurnStartByStyleId, { '1001': 12, '1002': 9 });
  assert.deepEqual(decorated.replayScript.turns[0].info.spAtActionStartByStyleId, { '1001': 4 });
  assert.deepEqual(decorated.replayScript.turns[0].info.spAtTurnStartByName, {
    '茅森 月歌': 12,
    '和泉 ユキ': 9,
  });
  assert.deepEqual(decorated.replayScript.turns[0].info.spAtActionStartByName, {
    '茅森 月歌': 4,
  });
  assert.deepEqual(decorated.replayScript.turns[0].info.actionOrder, ['和泉 ユキ', '茅森 月歌']);
});

test('normalizeSessionSnapshot ignores additional human-readable fields', () => {
  const normalized = normalizeSessionSnapshot({
    version: 1,
    setup: {
      styleIds: [1001, 1002, 1003, null, null, null],
      styleNames: ['A', 'B', 'C', null, null, null],
      characterNames: ['CA', 'CB', 'CC', null, null, null],
      skillNamesByPartyIndex: { 0: ['X'] },
    },
    replayScript: {
      setup: {
        styleIds: [1001, 1002, 1003, null, null, null],
        characterNames: ['CA', 'CB', 'CC', null, null, null],
        supportCharacterNamesByPartyIndex: { 0: 'SUP' },
      },
      turns: [
        {
          turn: 1,
          slots: [
            {
              styleId: 1001,
              skillId: 3001,
              styleName: 'A',
              characterName: 'CA',
              skillName: 'X',
              spAtTurnStart: 10,
              spAtActionStart: 9,
            },
          ],
          info: {
            spAtTurnStartByStyleId: { 1001: 10 },
            spAtActionStartByStyleId: { 1001: 9 },
          },
        },
      ],
    },
  });

  assert.equal(Object.hasOwn(normalized.setup, 'styleNames'), false);
  assert.equal(Object.hasOwn(normalized.setup, 'characterNames'), false);
  assert.equal(Object.hasOwn(normalized.setup, 'skillNamesByPartyIndex'), false);
  assert.equal(Object.hasOwn(normalized.replayScript.setup, 'characterNames'), false);
  assert.equal(Object.hasOwn(normalized.replayScript.setup, 'supportCharacterNamesByPartyIndex'), false);
  assert.equal(Object.hasOwn(normalized.replayScript.turns[0].slots[0], 'styleName'), false);
  assert.equal(Object.hasOwn(normalized.replayScript.turns[0].slots[0], 'characterName'), false);
  assert.equal(Object.hasOwn(normalized.replayScript.turns[0].slots[0], 'skillName'), false);
  assert.equal(Object.hasOwn(normalized.replayScript.turns[0].slots[0], 'spAtTurnStart'), false);
  assert.equal(Object.hasOwn(normalized.replayScript.turns[0].slots[0], 'spAtActionStart'), false);
  assert.equal(Object.hasOwn(normalized.replayScript.turns[0], 'info'), false);
});

test('normalizeSessionSnapshot converts legacy enemy od_rate basis points into direct multiplier', () => {
  const normalized = normalizeSessionSnapshot({
    enemy: {
      selectedEnemyId: 9001,
      selectedEnemyName: '敵テスト',
      od_rate: 8500,
      max_d_rate: 650,
    },
  });

  assert.equal(normalized.enemy.od_rate, 0.85);
  assert.equal(normalized.enemy.enemySlots[0].od_rate, 0.85);
});

test('normalizeSessionSnapshot converts legacy 0 style placeholders into null', () => {
  const normalized = normalizeSessionSnapshot({
    setup: {
      styleIds: [1004603, 1001101, 1001201, 0, 0, 0],
      supportStyleIds: [0, 0, 0, 0, 0, 0],
    },
  });

  assert.deepEqual(normalized.setup.styleIds, [1004603, 1001101, 1001201, null, null, null]);
  assert.deepEqual(normalized.setup.supportStyleIds, [null, null, null, null, null, null]);
  assert.equal(normalized.setup.isFrontFilled, true);
});

test('normalizeSessionSnapshot preserves stageSetup fields with defaults', () => {
  const normalized = normalizeSessionSnapshot({
    setup: {
      styleIds: [1001, 1002, 1003, null, null, null],
      supportStyleIds: [null, null, null, null, null, null],
      stageSetup: {
        initialOdGauge: -300,
        initialSpBonusAll: 5,
        selectedDimensionBattleId: 191000004,
        initialStatusEffects: [
          {
            scope: 'all',
            statusType: 'DefenseUp',
            power: 0.3,
            remaining: 3,
            exitCond: 'PlayerTurnEnd',
          },
          {
            scope: 'partyIndex',
            partyIndex: 1,
            statusType: 'DebuffGuard',
            remaining: 1,
            limitType: 'Count',
            exitCond: 'Count',
          },
        ],
      },
    },
  });

  assert.equal(normalized.setup.stageSetup.initialOdGauge, -300);
  assert.equal(normalized.setup.stageSetup.initialSpBonusAll, 5);
  assert.equal(normalized.setup.stageSetup.selectedDimensionBattleId, 191000004);
  assert.equal(normalized.setup.stageSetup.initialStatusEffects.length, 2);
  assert.equal(normalized.setup.stageSetup.initialStatusEffects[0].statusType, 'DefenseUp');
  assert.equal(normalized.setup.stageSetup.initialStatusEffects[1].scope, 'partyIndex');
});
