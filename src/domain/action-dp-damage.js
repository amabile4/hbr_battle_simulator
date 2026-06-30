import { buildDamageCalculationInput } from './damage-calculator-input-builder.js';
import { calculateDamage } from './damage-calculator.js';

const MIN_HIT_COUNT = 1;

function shouldUseCriticalExpected(damageContext) {
  const breakdown = damageContext?.criticalRateBreakdown;
  return (
    breakdown?.isCriticalGuaranteed === true ||
    Number(breakdown?.criticalRatePercent ?? 0) >= 100
  );
}

/**
 * 1アクションの damageContext から、敵ごとの per-hit DPダメージ（ガイド導出値）を計算する。
 *
 * - 戻り値は再計算のたびに導出される派生値であり、replay JSON へ保存してはならない。
 * - DPゲージ非搭載敵（enemyDpByEnemy 未設定 or 0）は対象外。
 * - data（styles/characters/enemies/skills）が不足して計算できない敵はスキップし、
 *   1件も計算できない場合は null を返す（呼び出し側は enrichment を行わず従来挙動を維持する）。
 *
 * @param {object} params
 * @param {object|null} params.damageContext - commit pipeline が構築した action 単位の damageContext
 * @param {object} params.attackerInput - { role, limitBreakCount, ...stats }
 * @param {object} params.enemyDpByEnemy - 敵ごとの最大DP（DPゲージ有無の判定に使用）
 * @param {number} [params.hitCount] - 消費側が乗算する hit 数。省略時は damageContext.effectiveHitCountPerEnemy
 * @param {object|null} params.data - { styles, characters, enemies, skills }
 * @returns {{perHitDpDamageByEnemy: Object<string, number>, totalDpDamageByEnemy: Object<string, number>}|null}
 *   enemyKey -> per-hit DPダメージ / exact total DPダメージ（正の整数）
 */
export function resolvePerHitDpDamageByEnemy({
  damageContext = null,
  attackerInput = {},
  enemyDpByEnemy = {},
  hitCount = null,
  data = null,
} = {}) {
  if (!damageContext || typeof damageContext !== 'object' || !data || typeof data !== 'object') {
    return null;
  }

  const eligible = Array.isArray(damageContext.eligibleEnemyIndexes)
    ? damageContext.eligibleEnemyIndexes
    : [];
  const targetIndexes = eligible.length > 0 ? eligible : [damageContext.targetEnemyIndex];

  const contextHitCount = Number(damageContext.effectiveHitCountPerEnemy ?? 0);
  const resolvedHitCount = Math.max(
    MIN_HIT_COUNT,
    Number.isFinite(Number(hitCount)) && Number(hitCount) > 0
      ? Number(hitCount)
      : contextHitCount
  );

  const perHitDpDamageByEnemy = {};
  const totalDpDamageByEnemy = {};
  for (const rawIndex of targetIndexes) {
    const targetEnemyIndex = Number(rawIndex);
    if (!Number.isInteger(targetEnemyIndex) || targetEnemyIndex < 0) {
      continue;
    }
    const enemyKey = String(targetEnemyIndex);
    const maxDp = Number(enemyDpByEnemy?.[enemyKey] ?? 0);
    if (!(maxDp > 0)) {
      continue;
    }
    const paramBorder = Number(damageContext.enemyParamBorderByEnemy?.[enemyKey]);
    try {
      const input = buildDamageCalculationInput(damageContext, attackerInput, {
        targetEnemyIndex,
        ...(Number.isFinite(paramBorder) && paramBorder > 0 ? { paramBorder } : {}),
        isHpTarget: false,
      });
      const damageResult = calculateDamage(input, data);
      const expectedSource = shouldUseCriticalExpected(damageContext)
        ? damageResult?.critical
        : damageResult?.normal;
      const expectedTotal = Number(expectedSource?.expected ?? 0);
      if (!Number.isFinite(expectedTotal) || expectedTotal <= 0) {
        continue;
      }
      const perHit = Math.floor(expectedTotal / resolvedHitCount);
      if (perHit > 0) {
        perHitDpDamageByEnemy[enemyKey] = perHit;
        totalDpDamageByEnemy[enemyKey] = Math.floor(expectedTotal);
      }
    } catch {
      // 計算データ不足などで失敗した敵はスキップ（enrichment なし = 従来挙動）
    }
  }

  return Object.keys(perHitDpDamageByEnemy).length > 0
    ? { perHitDpDamageByEnemy, totalDpDamageByEnemy }
    : null;
}
