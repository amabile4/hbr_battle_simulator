import test from 'node:test';
import assert from 'node:assert/strict';

import { buildAutoBreakDestructionHits } from '../src/turn/turn-controller.js';
import { calculateDestruction } from '../src/domain/destruction-calculator.js';

test('buildAutoBreakDestructionHits: 端数は最終ヒットへ加算され合計が exact total と一致する', () => {
  const hits = buildAutoBreakDestructionHits(3, 33, 100);
  assert.deepEqual(hits.map((hit) => hit.damage), [33, 33, 34]);
  assert.equal(hits.reduce((sum, hit) => sum + hit.damage, 0), 100);
});

test('buildAutoBreakDestructionHits: total 未提供時は perHit × hitCount にフォールバックする', () => {
  const hits = buildAutoBreakDestructionHits(3, 33, NaN);
  assert.deepEqual(hits.map((hit) => hit.damage), [33, 33, 33]);
});

test('buildAutoBreakDestructionHits: total が perHit 合計より小さくても負のヒットを作らない', () => {
  const hits = buildAutoBreakDestructionHits(3, 40, 100);
  assert.deepEqual(hits.map((hit) => hit.damage), [40, 40, 20]);
  const degenerate = buildAutoBreakDestructionHits(3, 60, 100);
  assert.deepEqual(degenerate.map((hit) => hit.damage), [60, 60, 0]);
});

test('buildAutoBreakDestructionHits: hitCount 1 / 0 以下のガード', () => {
  assert.deepEqual(buildAutoBreakDestructionHits(1, 33, 100), [{ damage: 100 }]);
  assert.deepEqual(buildAutoBreakDestructionHits(0, 33, 100), [{ damage: 100 }]);
});

test('autoBreak: 割り切れない合計でもブレイクヒットが検出され破壊率が加算される', () => {
  // DP100 の敵に合計100ダメージ・3ヒット（perHit切り捨て33）。
  // 旧実装は 33×3=99 < 100 でブレイク未検出 → 破壊率加算 0 だった。
  const data = { skills: [], enemies: [], styles: [] };
  const buildInput = (hits) => ({
    attacker: { styleId: 0, role: 'Attacker', statusEffects: [] },
    defender: {
      enemyId: null,
      destructionRate: 1.0,
      destructionLimit: 3.0,
      destructionMultiplier: 1.0,
      dp: 100,
    },
    skill: { skillId: 0, name: 'テストスキル', isNormalAttack: false },
    hits,
    autoBreak: true,
  });

  const truncated = calculateDestruction(
    buildInput(Array.from({ length: 3 }, () => ({ damage: 33 }))),
    data
  );
  assert.equal(truncated.destructionRate, 1.0, '旧実装相当: 99<100 で加算されない（前提確認）');

  const exact = calculateDestruction(buildInput(buildAutoBreakDestructionHits(3, 33, 100)), data);
  assert.ok(
    exact.destructionRate > 1.0,
    `exact total ではブレイクヒットが検出され破壊率が増える: ${exact.destructionRate}`
  );
});
