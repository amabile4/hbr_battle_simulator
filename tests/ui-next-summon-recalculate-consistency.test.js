/**
 * 連戦召喚整合テスト
 *
 * リプレイJSONは操作イベントのみ保存し、計算結果・suppression・プレビュー値は保存しない。
 * 「再計算で操作意図（特に召喚タイミング）が崩れない」ことを回帰固定する。
 *
 * 参考: tests/ui-next-turn-engine-manager.test.js のパターンを踏襲。
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { CharacterStyle, Party, createBattleStateFromParty } from '../src/index.js';
import { TurnEngineManager } from '../ui-next/engine/turn-engine-manager.js';
import {
  REPLAY_OPERATION_TYPES,
  REPLAY_OVERRIDE_ENTRY_TYPES,
} from '../src/ui/lightweight-replay-script.js';
import { DEFAULT_SUMMON_SAMPLE_ENEMY } from '../src/data/enemy-sample-presets.js';

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
 * frontlineSkillArrays: position ごとのスキル配列（または単一スキル）を指定する。
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
    const raw = frontlineSkillArrays[index];
    const skills = Array.isArray(raw) ? raw : (raw != null ? [raw] : [defaultSkill]);
    return new CharacterStyle({
      characterId: `TM${index + 1}`,
      characterName: `TM${index + 1}`,
      styleId: 9100 + index,
      styleName: `TS${index + 1}`,
      partyIndex: index,
      position: index,
      initialSP: 10,
      skills,
      passives: [],
    });
  });
  const state = createBattleStateFromParty(new Party(members));
  state.turnState.enemyState.enemyCount = enemyCount;
  return state;
}

function createSummonEnemyOperation({
  enemyId = DEFAULT_SUMMON_SAMPLE_ENEMY.id,
  enemyName = DEFAULT_SUMMON_SAMPLE_ENEMY.name,
  maxDRate = 350,
  fireRate = 250,
  targetEnemyIndex = null,
} = {}) {
  return {
    type: REPLAY_OPERATION_TYPES.SUMMON_ENEMY,
    payload: {
      enemyId,
      enemyName,
      od_rate: 0,
      max_d_rate: maxDRate,
      resistances: {
        element: {
          slash: 100,
          stab: 100,
          strike: 100,
          fire: fireRate,
          ice: 250,
          thunder: 250,
          light: 250,
          dark: 250,
          nonelement: 100,
        },
      },
      absorbElementList: ['fire'],
      ...(Number.isInteger(targetEnemyIndex) ? { targetEnemyIndex } : {}),
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

// ---------------------------------------------------------------------------
// テスト 1: 手動kill → 次ターン召喚 → recalculateFrom(0) で構造が変わらない
// ---------------------------------------------------------------------------

test('summon recalculate consistency: summonEnemy operation stays in the same turn index after recalculateFrom(0)', () => {
  const attackSkill = createSkill({
    id: 9901,
    name: 'SlashAttack',
    targetType: 'Single',
    parts: [{ skill_type: 'AttackSkill', target_type: 'Single', type: 'Slash' }],
  });
  const defenseSkill = createSkill({
    id: 9902,
    name: 'Protection',
    targetType: 'Self',
    parts: [{ skill_type: 'Protection', target_type: 'Self' }],
  });

  // position 0 に両スキルを持たせる
  const initialState = setupInitialEnemyState(createFrontlineInitialState([[attackSkill, defenseSkill]], 1));

  const manager = new TurnEngineManager();
  manager.initialize(initialState, {});

  // ターン 0: 敵#0 を手動 kill
  manager.commitNextTurn(
    {
      0: { skillId: 9901, target: { type: 'enemy', enemyIndex: 0 } },
    },
    {
      enemyCount: 1,
      note: 'kill turn',
      actionOutcomeOverrides: [{ position: 0, outcome: 'Kill', enemyIndexes: [0] }],
    }
  );

  // ターン 1: SUMMON_ENEMY operation を追加して commit
  assert.equal(manager.addPendingSpecialOperation(createSummonEnemyOperation()), true);
  manager.commitNextTurn(
    {
      0: { skillId: 9902 },
    },
    {
      enemyCount: 1,
      note: 'summon turn',
    }
  );

  // 状態確認（再計算前）
  const turnsBeforeRecalculate = manager.replayScript.turns.length;
  const summonOpTurnIndexBefore = manager.replayScript.turns.findIndex(
    (turn) => turn.operations.some((op) => op.type === REPLAY_OPERATION_TYPES.SUMMON_ENEMY)
  );
  const killOverrideTurnIndexBefore = manager.replayScript.turns.findIndex(
    (turn) =>
      Array.isArray(turn.actionOutcomeOverrides) &&
      turn.actionOutcomeOverrides.some((override) => override.outcome === 'Kill')
  );

  assert.equal(turnsBeforeRecalculate, 2, '2ターンcommitされていること');
  assert.equal(summonOpTurnIndexBefore, 1, 'summon operationはターン1にあること');
  assert.equal(killOverrideTurnIndexBefore, 0, 'kill overrideはターン0にあること');

  // ターン 1 の summonEnemy による enemyCount 増加を確認（再計算前）
  const enemyCountAfterSummonBefore = manager.computedRecords[1]?.enemyCount;

  // recalculateFrom(0) を実行
  manager.recalculateFrom(0);

  // ターン数が変わっていないこと
  assert.equal(
    manager.replayScript.turns.length,
    turnsBeforeRecalculate,
    'recalculate 後もターン数が変わらないこと'
  );

  // summonEnemy operation が同じターンindex(1)に留まっていること
  const summonOpTurnIndexAfter = manager.replayScript.turns.findIndex(
    (turn) => turn.operations.some((op) => op.type === REPLAY_OPERATION_TYPES.SUMMON_ENEMY)
  );
  assert.equal(
    summonOpTurnIndexAfter,
    summonOpTurnIndexBefore,
    'recalculate 後も summonEnemy operation は同じターンindexにあること'
  );

  // kill override が同じターンindex(0)に保持されていること
  const killOverrideTurnIndexAfter = manager.replayScript.turns.findIndex(
    (turn) =>
      Array.isArray(turn.actionOutcomeOverrides) &&
      turn.actionOutcomeOverrides.some((override) => override.outcome === 'Kill')
  );
  assert.equal(
    killOverrideTurnIndexAfter,
    killOverrideTurnIndexBefore,
    'recalculate 後も kill override は同じターンindexにあること'
  );

  // 各ターンの operations 構成が再計算前後で不変
  assert.equal(
    manager.replayScript.turns[0].operations.length,
    0,
    'ターン0はoperationsなし'
  );
  assert.equal(
    manager.replayScript.turns[1].operations.some((op) => op.type === REPLAY_OPERATION_TYPES.SUMMON_ENEMY),
    true,
    'ターン1に SUMMON_ENEMY operation が存在すること'
  );

  // 召喚による enemyCount 増加が同じターン境界で発生していること
  const enemyCountAfterSummonAfter = manager.computedRecords[1]?.enemyCount;
  assert.equal(
    enemyCountAfterSummonAfter,
    enemyCountAfterSummonBefore,
    'recalculate 後も summonEnemy によるenemyCount増加が同じターンで発生すること'
  );
});

// ---------------------------------------------------------------------------
// テスト 2: 複数ターン + 召喚 + recalculateFrom(0) — operations と overrideEntries の完全一致
// ---------------------------------------------------------------------------

test('summon recalculate consistency: replayScript.turns operations and overrideEntries are identical before and after recalculateFrom', () => {
  const protectionSkill = createSkill({
    id: 9903,
    name: 'Protection',
    targetType: 'Self',
    parts: [{ skill_type: 'Protection', target_type: 'Self' }],
  });
  const attackSkill = createSkill({
    id: 9904,
    name: 'SlashAll',
    targetType: 'All',
    parts: [{ skill_type: 'AttackSkill', target_type: 'All', type: 'Slash' }],
  });

  // position 0 に両スキルを持たせる
  const initialState = setupInitialEnemyState(createFrontlineInitialState([[protectionSkill, attackSkill]], 2));
  initialState.turnState.enemyState.enemyNamesByEnemy = { 0: 'Alpha', 1: 'Beta' };

  const manager = new TurnEngineManager();
  manager.initialize(initialState, {});

  // ターン 0: 通常行動
  manager.commitNextTurn(
    { 0: { skillId: 9904 } },
    { enemyCount: 2, note: 'turn0' }
  );

  // ターン 1: 敵#0 を手動 kill
  manager.commitNextTurn(
    { 0: { skillId: 9904 } },
    {
      enemyCount: 2,
      note: 'kill-turn',
      actionOutcomeOverrides: [{ position: 0, outcome: 'Kill', enemyIndexes: [0] }],
    }
  );

  // ターン 2: 召喚 operation
  assert.equal(manager.addPendingSpecialOperation(createSummonEnemyOperation()), true);
  manager.commitNextTurn(
    { 0: { skillId: 9903 } },
    { enemyCount: 2, note: 'summon-turn' }
  );

  // ターン 3: 通常行動
  manager.commitNextTurn(
    { 0: { skillId: 9903 } },
    { enemyCount: 2, note: 'turn3' }
  );

  // 再計算前のスナップショット（deep clone）
  const snapshotBefore = structuredClone(manager.replayScript.turns);

  // recalculateFrom(0)
  manager.recalculateFrom(0);

  // ターン数が同じ
  assert.equal(
    manager.replayScript.turns.length,
    snapshotBefore.length,
    'ターン数が変わらないこと'
  );

  // 各ターンの operations と overrideEntries と actionOutcomeOverrides が一致
  for (let i = 0; i < snapshotBefore.length; i++) {
    assert.deepEqual(
      manager.replayScript.turns[i].operations,
      snapshotBefore[i].operations,
      `ターン${i}の operations が再計算前後で一致すること`
    );
    assert.deepEqual(
      manager.replayScript.turns[i].overrideEntries,
      snapshotBefore[i].overrideEntries,
      `ターン${i}の overrideEntries が再計算前後で一致すること`
    );
    assert.deepEqual(
      manager.replayScript.turns[i].actionOutcomeOverrides,
      snapshotBefore[i].actionOutcomeOverrides,
      `ターン${i}の actionOutcomeOverrides が再計算前後で一致すること`
    );
  }

  // computedRecords が全て存在する（再計算が完走した）
  for (let i = 0; i < snapshotBefore.length; i++) {
    assert.ok(
      manager.computedRecords[i] != null,
      `computedRecords[${i}] が null でないこと`
    );
  }
});

// ---------------------------------------------------------------------------
// テスト 3: loadReplayScript → recalculateFrom(0) でも召喚タイミングが保たれる
// ---------------------------------------------------------------------------

test('summon recalculate consistency: loadReplayScript then recalculateFrom preserves summon turn index', () => {
  const protectionSkill = createSkill({
    id: 9905,
    name: 'Protection',
    targetType: 'Self',
    parts: [{ skill_type: 'Protection', target_type: 'Self' }],
  });

  const initialState = setupInitialEnemyState(createFrontlineInitialState([protectionSkill], 1));
  const manager = new TurnEngineManager();
  manager.initialize(initialState, {});

  // ターン 0: 手動 kill
  manager.commitNextTurn(
    { 0: { skillId: 9905 } },
    {
      enemyCount: 1,
      note: 'kill',
      actionOutcomeOverrides: [{ position: 0, outcome: 'Kill', enemyIndexes: [0] }],
    }
  );

  // ターン 1: 召喚
  assert.equal(manager.addPendingSpecialOperation(createSummonEnemyOperation()), true);
  manager.commitNextTurn(
    { 0: { skillId: 9905 } },
    { enemyCount: 1, note: 'summon' }
  );

  // replayScript をシリアライズして別インスタンスにロード
  const savedReplayScript = structuredClone(manager.replayScript);

  const reloadState = setupInitialEnemyState(createFrontlineInitialState([protectionSkill], 1));
  const reloadedManager = new TurnEngineManager();
  reloadedManager.loadReplayScript(reloadState, savedReplayScript, {});

  // ロード後の構造確認
  assert.equal(reloadedManager.replayScript.turns.length, 2, 'ロード後も2ターン存在すること');
  assert.equal(
    reloadedManager.replayScript.turns[1].operations.some(
      (op) => op.type === REPLAY_OPERATION_TYPES.SUMMON_ENEMY
    ),
    true,
    'ロード後も summonEnemy はターン1にあること'
  );
  assert.ok(
    reloadedManager.replayScript.turns[0].actionOutcomeOverrides.some(
      (override) => override.outcome === 'Kill'
    ),
    'ロード後も kill override はターン0にあること'
  );

  // recalculateFrom(0) を実行
  reloadedManager.recalculateFrom(0);

  // 再計算後も構造が保たれる
  assert.equal(reloadedManager.replayScript.turns.length, 2, '再計算後も2ターン存在すること');
  assert.equal(
    reloadedManager.replayScript.turns[1].operations.some(
      (op) => op.type === REPLAY_OPERATION_TYPES.SUMMON_ENEMY
    ),
    true,
    '再計算後も summonEnemy はターン1にあること'
  );

  // kill override がターン0に保持
  assert.ok(
    reloadedManager.replayScript.turns[0].actionOutcomeOverrides.some(
      (override) => override.outcome === 'Kill'
    ),
    '再計算後も kill override はターン0にあること'
  );

  // ENEMY_COUNT override が正しいターン（ターン1）に記録されている
  const hasEnemyCountInSummonTurn = reloadedManager.replayScript.turns[1].overrideEntries.some(
    (entry) => entry.type === REPLAY_OVERRIDE_ENTRY_TYPES.ENEMY_COUNT
  );
  assert.equal(
    hasEnemyCountInSummonTurn,
    true,
    '召喚ターン(1)に ENEMY_COUNT override が存在すること'
  );
});

// ---------------------------------------------------------------------------
// テスト 4: 召喚後 enemyCount の計算結果が recalculateFrom 前後で一致する
// ---------------------------------------------------------------------------

test('summon recalculate consistency: enemyCount in computedRecords matches before and after recalculateFrom', () => {
  const protectionSkill = createSkill({
    id: 9906,
    name: 'Protection',
    targetType: 'Self',
    parts: [{ skill_type: 'Protection', target_type: 'Self' }],
  });

  const initialState = setupInitialEnemyState(createFrontlineInitialState([protectionSkill], 1));
  const manager = new TurnEngineManager();
  manager.initialize(initialState, {});

  // ターン 0: 召喚
  assert.equal(manager.addPendingSpecialOperation(createSummonEnemyOperation()), true);
  manager.commitNextTurn(
    { 0: { skillId: 9906 } },
    { enemyCount: 1, note: 'summon' }
  );

  // ターン 1: 通常
  manager.commitNextTurn(
    { 0: { skillId: 9906 } },
    { enemyCount: 2, note: 'after-summon' }
  );

  // 再計算前の enemyCount スナップショット
  const enemyCountTurn0Before = manager.computedRecords[0]?.enemyCount;
  const enemyCountTurn1Before = manager.computedRecords[1]?.enemyCount;

  // recalculateFrom(0)
  manager.recalculateFrom(0);

  // 再計算後の enemyCount が一致
  assert.equal(
    manager.computedRecords[0]?.enemyCount,
    enemyCountTurn0Before,
    'ターン0の enemyCount が再計算前後で一致すること'
  );
  assert.equal(
    manager.computedRecords[1]?.enemyCount,
    enemyCountTurn1Before,
    'ターン1の enemyCount が再計算前後で一致すること'
  );

  // 召喚によって enemyCount が増加していること（ターン0 = 2、ターン1 = 2）
  assert.equal(
    manager.computedRecords[0]?.enemyCount,
    2,
    '召喚後のターン0は enemyCount=2 であること'
  );
});
