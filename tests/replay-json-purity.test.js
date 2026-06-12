/**
 * リプレイ JSON 純度テスト
 *
 * 方針: リプレイJSONは操作イベントのみ保存し、計算結果・suppression・プレビュー値は保存しない。
 *
 * canonical キー集合の導出元:
 *   src/ui/lightweight-replay-script.js の normalizeLightweightReplayTurn (line 587-611):
 *     turn, slots, operations, note, actionOutcomeOverrides, followUpOverrides, overrideEntries
 *   normalizeReplayTurnSlot (line 568-580):
 *     styleId, skillId, target (条件付き)
 *   normalizeLightweightReplaySetup (line 613-625):
 *     styleIds, supportStyleIdsByPartyIndex, supportLimitBreakLevelsByPartyIndex,
 *     skillSetsByPartyIndex, limitBreakLevelsByPartyIndex, statsByPartyIndex,
 *     initialOdGauge, setupEntries
 *   normalizeLightweightReplayScript (line 627-635):
 *     version, setup, turns
 *
 * テスト内容:
 *   1. save→load→recalculate 一貫性: serialize → 別インスタンスにload → recalculate
 *      で computed 結果と serialize 済み JSON が往復一致する
 *   2. JSON 純度: serialize された replay turn の各キーが canonical キー集合の部分集合
 *   3. suppress/guide/preview/cumulative キーが再帰的に存在しないことのガード
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { CharacterStyle, Party, createBattleStateFromParty } from '../src/index.js';
import { TurnEngineManager } from '../ui-next/engine/turn-engine-manager.js';
import {
  REPLAY_OPERATION_TYPES,
  normalizeLightweightReplayScript,
  normalizeLightweightReplayTurn,
} from '../src/ui/lightweight-replay-script.js';
import {
  normalizeSessionSnapshot,
  serializeSessionSnapshot,
} from '../ui-next/utils/session-snapshot.js';
import { DEFAULT_SUMMON_SAMPLE_ENEMY } from '../src/data/enemy-sample-presets.js';

// ---------------------------------------------------------------------------
// canonical キー集合（normalizeLightweightReplayTurn の戻り値から導出）
// src/ui/lightweight-replay-script.js line 587-611
// ---------------------------------------------------------------------------
const CANONICAL_REPLAY_TURN_KEYS = new Set([
  'turn',
  'slots',
  'operations',
  'note',
  'actionOutcomeOverrides',
  'followUpOverrides',
  'overrideEntries',
]);

// canonical スロットキー（normalizeReplayTurnSlot の戻り値）
// src/ui/lightweight-replay-script.js line 568-580
const CANONICAL_SLOT_KEYS = new Set([
  'styleId',
  'skillId',
  'target',
]);

// ---------------------------------------------------------------------------
// ヘルパー
// ---------------------------------------------------------------------------

function createSkill({ id, name, targetType, parts, spCost = 0 }) {
  return {
    id,
    name,
    label: `${name}${id}`,
    sp_cost: spCost,
    cond: '',
    target_type: targetType,
    parts,
  };
}

/**
 * frontlineSkillArrays: position ごとのスキル配列を指定する。
 * 省略時はデフォルトの Protection スキル 1 つ。
 */
function createFrontlineInitialState(frontlineSkillArrays = [], enemyCount = 1) {
  const members = Array.from({ length: 6 }, (_, index) => {
    const defaultSkill = createSkill({
      id: 9200 + index,
      name: `Protection${index + 1}`,
      targetType: 'Self',
      parts: [{ skill_type: 'Protection', target_type: 'Self' }],
    });
    const skills = frontlineSkillArrays[index] ?? [defaultSkill];
    return new CharacterStyle({
      characterId: `TM${index + 1}`,
      characterName: `TM${index + 1}`,
      styleId: 9100 + index,
      styleName: `TS${index + 1}`,
      partyIndex: index,
      position: index,
      initialSP: 10,
      skills: Array.isArray(skills) ? skills : [skills],
      passives: [],
    });
  });
  const state = createBattleStateFromParty(new Party(members));
  state.turnState.enemyState.enemyCount = enemyCount;
  return state;
}

function createSummonEnemyOperation() {
  return {
    type: REPLAY_OPERATION_TYPES.SUMMON_ENEMY,
    payload: {
      enemyId: DEFAULT_SUMMON_SAMPLE_ENEMY.id,
      enemyName: DEFAULT_SUMMON_SAMPLE_ENEMY.name,
      od_rate: 0,
      max_d_rate: 350,
      resistances: {
        element: {
          slash: 100, stab: 100, strike: 100,
          fire: 250, ice: 250, thunder: 250, light: 250, dark: 250, nonelement: 100,
        },
      },
      absorbElementList: ['fire'],
    },
  };
}

function setupInitialEnemyState(state) {
  state.turnState.enemyState.enemyNamesByEnemy = { 0: 'Alpha' };
  state.turnState.enemyState.damageRatesByEnemy = {
    0: { Slash: 100, Stab: 100, Strike: 100, Fire: 100, Ice: 100, Thunder: 100, Light: 100, Dark: 100, Nonelement: 100 },
  };
  state.turnState.enemyState.absorbElementsByEnemy = { 0: [] };
  state.turnState.enemyState.odRateByEnemy = { 0: 0 };
  state.turnState.enemyState.destructionRateByEnemy = { 0: 100 };
  state.turnState.enemyState.destructionRateCapByEnemy = { 0: 300 };
  state.turnState.enemyState.breakStateByEnemy = {};
  state.turnState.enemyState.statuses = [];
  return state;
}

/**
 * オブジェクトを再帰走査して禁止パターンにマッチするキーを収集する。
 * @param {unknown} value
 * @param {RegExp[]} forbiddenPatterns
 * @param {string} path
 * @returns {string[]} マッチしたパス一覧
 */
function collectForbiddenKeys(value, forbiddenPatterns, path = '') {
  const found = [];
  if (!value || typeof value !== 'object') {
    return found;
  }
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      found.push(...collectForbiddenKeys(value[i], forbiddenPatterns, `${path}[${i}]`));
    }
    return found;
  }
  for (const key of Object.keys(value)) {
    const keyPath = path ? `${path}.${key}` : key;
    if (forbiddenPatterns.some((pattern) => pattern.test(key))) {
      found.push(keyPath);
    }
    found.push(...collectForbiddenKeys(value[key], forbiddenPatterns, keyPath));
  }
  return found;
}

// 禁止キーパターン: suppress / guide / preview / cumulative / total*Damage
const FORBIDDEN_KEY_PATTERNS = [
  /suppress/i,
  /guide/i,
  /preview/i,
  /cumulative/i,
  /^total.*Damage/i,
];

// ---------------------------------------------------------------------------
// テスト 1: save → load → recalculate 一貫性
// ---------------------------------------------------------------------------

test('replay JSON purity: serialize → load → recalculate produces identical replayScript JSON', () => {
  const attackSkill = createSkill({
    id: 9801,
    name: 'Attack',
    targetType: 'Single',
    parts: [{ skill_type: 'AttackSkill', target_type: 'Single', type: 'Slash' }],
  });
  const protectionSkill = createSkill({
    id: 9802,
    name: 'Protection',
    targetType: 'Self',
    parts: [{ skill_type: 'Protection', target_type: 'Self' }],
  });

  // position 0 に両スキルを持たせる
  const initialState = setupInitialEnemyState(
    createFrontlineInitialState([[attackSkill, protectionSkill]], 1)
  );
  const manager = new TurnEngineManager();
  manager.initialize(initialState, {});

  // ターン 0: 手動 kill
  manager.commitNextTurn(
    { 0: { skillId: 9801, target: { type: 'enemy', enemyIndex: 0 } } },
    {
      enemyCount: 1,
      note: 'kill',
      actionOutcomeOverrides: [{ position: 0, outcome: 'Kill', enemyIndexes: [0] }],
    }
  );

  // ターン 1: 召喚
  assert.equal(manager.addPendingSpecialOperation(createSummonEnemyOperation()), true);
  manager.commitNextTurn(
    { 0: { skillId: 9802 } },
    { enemyCount: 1, note: 'summon' }
  );

  // ターン 2: 通常
  manager.commitNextTurn(
    { 0: { skillId: 9802 } },
    { enemyCount: 2, note: 'normal' }
  );

  // serialize
  const serialized1 = JSON.stringify(manager.replayScript, null, 2);
  const parsedReplayScript1 = JSON.parse(serialized1);

  // 別インスタンスにロード
  const reloadState = setupInitialEnemyState(
    createFrontlineInitialState([[attackSkill, protectionSkill]], 1)
  );
  const reloadedManager = new TurnEngineManager();
  reloadedManager.loadReplayScript(reloadState, parsedReplayScript1, {});

  // ロード後の replayScript を再 serialize
  const serialized2 = JSON.stringify(reloadedManager.replayScript, null, 2);

  // replayScript JSON が往復で一致する
  assert.equal(
    serialized2,
    serialized1,
    'serialize → load → serialize で replayScript JSON が一致すること'
  );
});

// ---------------------------------------------------------------------------
// テスト 2: replayScript の normalize → serialize → parse → normalize が冪等
// ---------------------------------------------------------------------------

test('replay JSON purity: replayScript normalize → serialize round-trip is idempotent', () => {
  const attackSkill = createSkill({
    id: 9803,
    name: 'Attack',
    targetType: 'Single',
    parts: [{ skill_type: 'AttackSkill', target_type: 'Single', type: 'Slash' }],
  });
  const protectionSkill = createSkill({
    id: 9804,
    name: 'Protection',
    targetType: 'Self',
    parts: [{ skill_type: 'Protection', target_type: 'Self' }],
  });

  // position 0 に両スキルを持たせる
  const initialState = setupInitialEnemyState(
    createFrontlineInitialState([[attackSkill, protectionSkill]], 1)
  );
  const manager = new TurnEngineManager();
  manager.initialize(initialState, {});

  manager.commitNextTurn(
    { 0: { skillId: 9803, target: { type: 'enemy', enemyIndex: 0 } } },
    {
      enemyCount: 1,
      note: 'kill',
      actionOutcomeOverrides: [{ position: 0, outcome: 'Kill', enemyIndexes: [0] }],
    }
  );
  assert.equal(manager.addPendingSpecialOperation(createSummonEnemyOperation()), true);
  manager.commitNextTurn(
    { 0: { skillId: 9804 } },
    { enemyCount: 1, note: 'summon' }
  );

  // replayScript を normalize → serialize（1周目）
  // normalizeLightweightReplayScript はファイル先頭でインポート済み
  const normalized1 = normalizeLightweightReplayScript(manager.replayScript);
  const text1 = JSON.stringify(normalized1, null, 2);

  // parse → normalize → serialize（2周目）
  const parsed = JSON.parse(text1);
  const normalized2 = normalizeLightweightReplayScript(parsed);
  const text2 = JSON.stringify(normalized2, null, 2);

  // replayScript の normalize → serialize → parse → normalize が冪等であること
  assert.equal(text2, text1, 'replayScript の normalize → serialize が冪等であること（1周目 == 2周目）');

  // ターン数と主要フィールドが保持されること
  const script = JSON.parse(text1);
  assert.equal(script.turns.length, 2, '2ターンが存在すること');
  assert.equal(
    script.turns[0].actionOutcomeOverrides?.[0]?.outcome,
    'Kill',
    'killオーバーライドが保持されること'
  );
  assert.equal(
    script.turns[1].operations.some((op) => op.type === 'SummonEnemy'),
    true,
    'SummonEnemy operationが保持されること'
  );
});

// ---------------------------------------------------------------------------
// テスト 3: JSON 純度 — replay turn の各キーが canonical キー集合の部分集合
// ---------------------------------------------------------------------------

test('replay JSON purity: each serialized replay turn contains only canonical keys', () => {
  const protectionSkill = createSkill({
    id: 9805,
    name: 'Protection',
    targetType: 'Self',
    parts: [{ skill_type: 'Protection', target_type: 'Self' }],
  });

  const initialState = setupInitialEnemyState(createFrontlineInitialState([[protectionSkill]], 1));
  const manager = new TurnEngineManager();
  manager.initialize(initialState, {});

  // ターン 0: 召喚
  assert.equal(manager.addPendingSpecialOperation(createSummonEnemyOperation()), true);
  manager.commitNextTurn(
    { 0: { skillId: 9805 } },
    { enemyCount: 1, note: 'summon' }
  );

  // ターン 1: kill
  manager.commitNextTurn(
    { 0: { skillId: 9805 } },
    {
      enemyCount: 2,
      note: 'kill',
      actionOutcomeOverrides: [{ position: 0, outcome: 'Kill', enemyIndexes: [0] }],
    }
  );

  // ターン 2: 通常
  manager.commitNextTurn(
    { 0: { skillId: 9805 } },
    { enemyCount: 2, note: 'normal' }
  );

  const serializedJson = JSON.stringify(manager.replayScript);
  const parsed = JSON.parse(serializedJson);

  // normalizeLightweightReplayScript で normalize して canonical 形を確認
  const normalized = normalizeLightweightReplayScript(parsed);

  // 各ターンのトップレベルキーが canonical キー集合の部分集合であること
  for (let i = 0; i < normalized.turns.length; i++) {
    const turnKeys = Object.keys(normalized.turns[i]);
    const extraKeys = turnKeys.filter((key) => !CANONICAL_REPLAY_TURN_KEYS.has(key));
    assert.deepEqual(
      extraKeys,
      [],
      `ターン${i}に非canonical キーが存在しないこと。非canonical: ${extraKeys.join(', ')}`
    );
  }

  // 各スロットのキーが canonical キー集合の部分集合であること
  for (let i = 0; i < normalized.turns.length; i++) {
    for (let s = 0; s < normalized.turns[i].slots.length; s++) {
      const slotKeys = Object.keys(normalized.turns[i].slots[s]);
      const extraSlotKeys = slotKeys.filter((key) => !CANONICAL_SLOT_KEYS.has(key));
      assert.deepEqual(
        extraSlotKeys,
        [],
        `ターン${i} スロット${s}に非canonical キーが存在しないこと。非canonical: ${extraSlotKeys.join(', ')}`
      );
    }
  }
});

// ---------------------------------------------------------------------------
// テスト 4: 禁止キー(suppress/guide/preview/cumulative/total*Damage)が JSON に存在しない
// ---------------------------------------------------------------------------

test('replay JSON purity: no suppress/guide/preview/cumulative/total damage keys anywhere in serialized replayScript JSON', () => {
  const attackSkill = createSkill({
    id: 9806,
    name: 'Attack',
    targetType: 'Single',
    parts: [{ skill_type: 'AttackSkill', target_type: 'Single', type: 'Slash' }],
  });
  const protectionSkill = createSkill({
    id: 9807,
    name: 'Protection',
    targetType: 'Self',
    parts: [{ skill_type: 'Protection', target_type: 'Self' }],
  });

  // position 0 に両スキルを持たせる
  const initialState = setupInitialEnemyState(
    createFrontlineInitialState([[attackSkill, protectionSkill]], 2)
  );
  initialState.turnState.enemyState.enemyNamesByEnemy = { 0: 'Alpha', 1: 'Beta' };

  const manager = new TurnEngineManager();
  manager.initialize(initialState, {});

  // ターン 0: 通常攻撃
  manager.commitNextTurn(
    { 0: { skillId: 9806, target: { type: 'enemy', enemyIndex: 0 } } },
    { enemyCount: 2, note: 'attack' }
  );

  // ターン 1: 手動 kill
  manager.commitNextTurn(
    { 0: { skillId: 9806, target: { type: 'enemy', enemyIndex: 0 } } },
    {
      enemyCount: 2,
      note: 'kill',
      actionOutcomeOverrides: [{ position: 0, outcome: 'Kill', enemyIndexes: [0] }],
    }
  );

  // ターン 2: 召喚
  assert.equal(manager.addPendingSpecialOperation(createSummonEnemyOperation()), true);
  manager.commitNextTurn(
    { 0: { skillId: 9807 } },
    { enemyCount: 2, note: 'summon' }
  );

  // ターン 3: 通常
  manager.commitNextTurn(
    { 0: { skillId: 9807 } },
    { enemyCount: 2, note: 'normal' }
  );

  // serialize して再帰走査
  const serializedObj = JSON.parse(JSON.stringify(manager.replayScript));
  const forbiddenPaths = collectForbiddenKeys(serializedObj, FORBIDDEN_KEY_PATTERNS);

  assert.deepEqual(
    forbiddenPaths,
    [],
    `serialized replayScript に禁止キー(suppress/guide/preview/cumulative/total*Damage)が存在してはならない。検出パス: ${forbiddenPaths.join(', ')}`
  );
});

// ---------------------------------------------------------------------------
// テスト 5: session snapshot 全体の禁止キーガード
// ---------------------------------------------------------------------------

test('replay JSON purity: no suppress/guide/preview/cumulative/total damage keys in serialized session snapshot', () => {
  const attackSkill = createSkill({
    id: 9808,
    name: 'Attack',
    targetType: 'Single',
    parts: [{ skill_type: 'AttackSkill', target_type: 'Single', type: 'Slash' }],
  });
  const protectionSkill = createSkill({
    id: 9809,
    name: 'Protection',
    targetType: 'Self',
    parts: [{ skill_type: 'Protection', target_type: 'Self' }],
  });

  // position 0 に両スキルを持たせる
  const initialState = setupInitialEnemyState(
    createFrontlineInitialState([[attackSkill, protectionSkill]], 1)
  );
  const manager = new TurnEngineManager();
  manager.initialize(initialState, {});

  manager.commitNextTurn(
    { 0: { skillId: 9808, target: { type: 'enemy', enemyIndex: 0 } } },
    {
      enemyCount: 1,
      note: 'kill',
      actionOutcomeOverrides: [{ position: 0, outcome: 'Kill', enemyIndexes: [0] }],
    }
  );
  assert.equal(manager.addPendingSpecialOperation(createSummonEnemyOperation()), true);
  manager.commitNextTurn(
    { 0: { skillId: 9809 } },
    { enemyCount: 1, note: 'summon' }
  );

  const snapshot = {
    setup: {
      styleIds: [9100, 9101, 9102, null, null, null],
      supportStyleIds: [null, null, null, null, null, null],
    },
    replayScript: manager.replayScript,
  };

  const text = serializeSessionSnapshot(snapshot);
  const parsedSnapshot = JSON.parse(text);

  const forbiddenPaths = collectForbiddenKeys(parsedSnapshot, FORBIDDEN_KEY_PATTERNS);

  assert.deepEqual(
    forbiddenPaths,
    [],
    `serialized session snapshot に禁止キー(suppress/guide/preview/cumulative/total*Damage)が存在してはならない。検出パス: ${forbiddenPaths.join(', ')}`
  );
});

// ---------------------------------------------------------------------------
// テスト 6: normalizeLightweightReplayTurn の canonical キー集合の明示的な確認
// (定義変更が起きたときにこのテストが失敗し、purity テストの根拠を再確認させる)
// ---------------------------------------------------------------------------

test('replay JSON purity: normalizeLightweightReplayTurn produces exactly the canonical key set', () => {
  const turn = normalizeLightweightReplayTurn({
    turn: 1,
    slots: [{ styleId: 9100, skillId: 9801 }],
    operations: [],
    note: 'test',
    actionOutcomeOverrides: [],
    followUpOverrides: [],
    overrideEntries: [],
  });

  const actualKeys = new Set(Object.keys(turn));
  const expectedKeys = CANONICAL_REPLAY_TURN_KEYS;

  // 実際のキー集合が期待と一致すること
  for (const key of expectedKeys) {
    assert.ok(
      actualKeys.has(key),
      `canonical key '${key}' が normalizeLightweightReplayTurn の出力に存在すること`
    );
  }
  for (const key of actualKeys) {
    assert.ok(
      expectedKeys.has(key),
      `'${key}' は canonical キー集合に含まれること (src/ui/lightweight-replay-script.js line 602-610 参照)`
    );
  }
});
