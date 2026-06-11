/**
 * DPダメージガイド導出（T4スパイク）テスト
 *
 * 方針:
 * - TurnEngineManager に damageCalculationData を注入すると、commit/recalculate 時に
 *   各アクションへ perHitDpDamageByEnemy（派生値）が付与され、エンジン既存の
 *   applyDestructionRateFromActions が DP を累積消費し、DP0 で自動ブレイクする。
 * - データ未注入時は従来挙動（DP消費なし）を維持する。
 * - 派生値は replayScript（保存JSON）に混入しない。
 * - recalculateFrom(0) で同一結果が再導出される（決定性）。
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { CharacterStyle, Party, createBattleStateFromParty } from '../src/index.js';
import { TurnEngineManager } from '../ui-next/engine/turn-engine-manager.js';

// ---------------------------------------------------------------------------
// fixtures
// ---------------------------------------------------------------------------

const ATTACK_SKILL_ID = 9901;

function createAttackSkill() {
  return {
    id: ATTACK_SKILL_ID,
    name: 'SlashAttack',
    label: 'SlashAttack9901',
    sp_cost: 0,
    cond: '',
    target_type: 'Single',
    parts: [{ skill_type: 'AttackSkill', target_type: 'Single', type: 'Slash', power: [3000] }],
  };
}

function createProtectionSkill(id = 9902) {
  return {
    id,
    name: 'Protection',
    label: `Protection${id}`,
    sp_cost: 0,
    cond: '',
    target_type: 'Self',
    parts: [{ skill_type: 'Protection', target_type: 'Self' }],
  };
}

// calculateDamage が参照する最小データセット
const DAMAGE_DATA = {
  styles: [{ id: 9100, role: 'Attacker' }],
  characters: [],
  enemies: [],
  skills: [createAttackSkill()],
};

function createInitialState({ enemyDp = 1_000_000_000 } = {}) {
  const members = Array.from({ length: 6 }, (_, index) => {
    const skills = index === 0
      ? [createAttackSkill(), createProtectionSkill()]
      : [createProtectionSkill(9200 + index)];
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
  const enemyState = state.turnState.enemyState;
  enemyState.enemyCount = 1;
  enemyState.enemyNamesByEnemy = { 0: 'Alpha' };
  enemyState.damageRatesByEnemy = {
    0: { Slash: 100, Stab: 100, Strike: 100, Fire: 100, Ice: 100, Thunder: 100, Light: 100, Dark: 100, Nonelement: 100 },
  };
  enemyState.absorbElementsByEnemy = { 0: [] };
  enemyState.odRateByEnemy = { 0: 0 };
  enemyState.paramBorderByEnemy = { 0: 620 };
  enemyState.enemyDpByEnemy = { 0: enemyDp };
  enemyState.destructionRateByEnemy = { 0: 100 };
  enemyState.destructionRateCapByEnemy = { 0: 300 };
  enemyState.breakStateByEnemy = {};
  enemyState.statuses = [];
  return state;
}

function commitAttackTurn(manager) {
  return manager.commitNextTurn(
    { 0: { skillId: ATTACK_SKILL_ID, target: { type: 'enemy', enemyIndex: 0 } } },
    { enemyCount: 1, note: 'attack' }
  );
}

function getRemainingDp(manager, turnIndex, enemyKey = '0') {
  return manager.computedStates[turnIndex]?.turnState?.enemyState?.remainingDpByEnemy?.[enemyKey];
}

function enemyHasBreakStatus(manager, turnIndex, enemyIndex = 0) {
  const statuses = manager.computedStates[turnIndex]?.turnState?.enemyState?.statuses ?? [];
  return statuses.some(
    (status) =>
      Number(status?.targetIndex ?? status?.enemyIndex ?? -1) === enemyIndex &&
      /break|downturn/i.test(String(status?.statusType ?? ''))
  );
}

// ---------------------------------------------------------------------------
// テスト 1: データ注入時に DP がアクションで消費される
// ---------------------------------------------------------------------------

test('dp damage guide: injected damageCalculationData consumes enemy DP on commit', () => {
  const manager = new TurnEngineManager();
  manager.initialize(createInitialState(), {}, { damageCalculationData: DAMAGE_DATA });

  commitAttackTurn(manager);

  const remaining = getRemainingDp(manager, 0);
  assert.ok(Number.isFinite(remaining), 'remainingDpByEnemy[0] が数値であること');
  assert.ok(
    remaining < 1_000_000_000,
    `DPが消費されていること (remaining=${remaining})`
  );
  assert.ok(remaining > 0, '大DPの敵はこの1撃でブレイクしないこと');
});

// ---------------------------------------------------------------------------
// テスト 2: データ未注入時は従来挙動（DP消費なし）
// ---------------------------------------------------------------------------

test('dp damage guide: without damageCalculationData DP is not consumed (backward compat)', () => {
  const manager = new TurnEngineManager();
  manager.initialize(createInitialState(), {});

  commitAttackTurn(manager);

  const remaining = getRemainingDp(manager, 0);
  assert.equal(
    remaining,
    1_000_000_000,
    'データ未注入時は remainingDp が最大値のまま維持されること'
  );
});

// ---------------------------------------------------------------------------
// テスト 3: DP0 到達で自動ブレイク（source=auto）
// ---------------------------------------------------------------------------

test('dp damage guide: DP depletion triggers auto break', () => {
  const manager = new TurnEngineManager();
  manager.initialize(createInitialState({ enemyDp: 1 }), {}, { damageCalculationData: DAMAGE_DATA });

  commitAttackTurn(manager);

  const remaining = getRemainingDp(manager, 0);
  assert.equal(remaining, 0, 'DP1の敵は1撃でDP0になること');
  assert.ok(enemyHasBreakStatus(manager, 0), 'DP0到達で自動ブレイク状態が付与されること');
});

// ---------------------------------------------------------------------------
// テスト 4: recalculateFrom(0) の決定性
// ---------------------------------------------------------------------------

test('dp damage guide: recalculateFrom(0) reproduces identical DP consumption', () => {
  const manager = new TurnEngineManager();
  manager.initialize(createInitialState(), {}, { damageCalculationData: DAMAGE_DATA });

  commitAttackTurn(manager);
  commitAttackTurn(manager);

  const remainingTurn0 = getRemainingDp(manager, 0);
  const remainingTurn1 = getRemainingDp(manager, 1);
  assert.ok(remainingTurn1 < remainingTurn0, 'DP消費がターンをまたいで累積すること');

  manager.recalculateFrom(0);

  assert.equal(getRemainingDp(manager, 0), remainingTurn0, 'ターン0のDP残量が再計算で一致すること');
  assert.equal(getRemainingDp(manager, 1), remainingTurn1, 'ターン1のDP残量が再計算で一致すること');
});

// ---------------------------------------------------------------------------
// テスト 5: 派生値が replayScript（保存JSON）に混入しない
// ---------------------------------------------------------------------------

test('dp damage guide: perHitDpDamageByEnemy never leaks into serialized replayScript', () => {
  const manager = new TurnEngineManager();
  manager.initialize(createInitialState(), {}, { damageCalculationData: DAMAGE_DATA });

  commitAttackTurn(manager);
  commitAttackTurn(manager);

  const serialized = JSON.stringify(manager.replayScript);
  assert.equal(
    /perHitDpDamage/i.test(serialized),
    false,
    'replayScript に perHitDpDamageByEnemy が含まれないこと'
  );
  assert.equal(
    /remainingDp/i.test(serialized),
    false,
    'replayScript に remainingDpByEnemy（計算結果）が含まれないこと'
  );
});

// ---------------------------------------------------------------------------
// テスト 6: setDamageCalculationData 後の recalculate で有効化
// ---------------------------------------------------------------------------

test('dp damage guide: setDamageCalculationData then recalculateFrom enables consumption', () => {
  const manager = new TurnEngineManager();
  manager.initialize(createInitialState(), {});

  commitAttackTurn(manager);
  assert.equal(getRemainingDp(manager, 0), 1_000_000_000, '注入前はDP未消費');

  manager.setDamageCalculationData(DAMAGE_DATA);
  manager.recalculateFrom(0);

  const remaining = getRemainingDp(manager, 0);
  assert.ok(remaining < 1_000_000_000, `注入+再計算後はDPが消費されること (remaining=${remaining})`);
});
