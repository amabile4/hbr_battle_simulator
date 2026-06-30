#!/usr/bin/env node
/**
 * char-detail-popup.js と同等のダメージ計算をNodeで再現し、
 * 実機値との乖離を検証するスクリプト。
 *
 * Usage: node scripts/verify-damage-calc.mjs <session-json-path> [--turn <n>] [--action <i>]
 */

import fs from 'node:fs';
import path from 'node:path';

import { HbrDataStore } from '../src/index.js';
import { BattleStateManager } from '../ui-next/engine/battle-state-manager.js';
import { TurnEngineManager } from '../ui-next/engine/turn-engine-manager.js';
import { normalizeSessionSnapshot } from '../ui-next/utils/session-snapshot.js';
import { calculateDamage } from '../src/domain/damage-calculator.js';
import {
  buildDamageCalculationInput,
  resolveDefaultStats,
} from '../src/domain/damage-calculator-input-builder.js';
import { normalizeCharacterStats, resolveStatsWithSupport } from '../src/domain/character-stats.js';

function main() {
  let inputPath = null;
  let targetTurn = 2;
  let targetAction = 0;

  for (let i = 2; i < process.argv.length; i++) {
    if (process.argv[i] === '--turn') targetTurn = Number(process.argv[++i]);
    else if (process.argv[i] === '--action') targetAction = Number(process.argv[++i]);
    else inputPath = process.argv[i];
  }

  if (!inputPath) {
    console.error('Usage: node scripts/verify-damage-calc.mjs <session-json-path> [--turn <n>] [--action <i>]');
    process.exit(1);
  }

  const text = fs.readFileSync(path.resolve(inputPath), 'utf8');
  const session = normalizeSessionSnapshot(JSON.parse(text));

  const store = HbrDataStore.fromJsonDirectory('json');
  const bsm = new BattleStateManager({ store });
  const initialState = bsm.buildFromSnapshot(session.setup, session.enemy);

  const manager = new TurnEngineManager();
  manager.loadReplayScript(initialState, session.replayScript, {
    validationPolicy: session.validationPolicy,
  });

  const record = manager.computedRecords[targetTurn - 1];
  const action = record?.actions?.[targetAction];
  if (!action) {
    console.error(`Turn ${targetTurn} action index ${targetAction} not found`);
    process.exit(1);
  }

  const skillName = action.skillName ?? action.skillId;
  const charName = action.characterName ?? action.characterId;
  console.log(`\n=== Turn ${targetTurn} / Action ${targetAction}: [${charName}] ${skillName} ===\n`);

  const ctx = action.damageContext;
  if (!ctx) {
    console.log('damagContextなし（非ダメージアクション）');
    return;
  }

  // ターン開始時の状態からユキのステータスを取得
  const stateBefore = manager.computedStates[targetTurn - 2]; // T1後 = T2前
  const member = stateBefore?.party?.find?.(m => m.characterId === action.characterId);

  const role = String(member?.role ?? 'Attacker');
  const limitBreakCount = Number(member?.limitBreakLevel ?? member?.limitBreakCount ?? 0);

  const stats = (
    normalizeCharacterStats(member?.stats)
    ?? resolveStatsWithSupport(resolveDefaultStats(role, limitBreakCount), member?.supportStats)
  );

  console.log(`=== キャラ情報 ===`);
  console.log(`  role=${role}, limitBreakCount=${limitBreakCount}`);
  console.log(`  stats: str=${stats.str}, dex=${stats.dex}, wis=${stats.wis}`);
  console.log(`  効果的攻撃倍率: attackUpRate=${ctx.attackUpRate}`);
  console.log(`  超越バースト: attackUp=${ctx.transcendenceBurstAttackUpRate}, critDmgUp=${ctx.transcendenceBurstCriticalDamageUpRate}`);
  console.log(`  effectiveDamageRatesByEnemy: ${JSON.stringify(ctx.effectiveDamageRatesByEnemy)}`);
  console.log('');

  const attackerInput = { role, limitBreakCount, ...stats };

  // 敵情報（ターン開始状態から取得）
  const enemyState = stateBefore?.turnState?.enemyState;
  const targetEnemyIndex = Number(ctx.targetEnemyIndex ?? 0);
  const paramBorderByEnemy = enemyState?.paramBorderByEnemy ?? {};
  const paramBorder = Number(paramBorderByEnemy[String(targetEnemyIndex)] ?? 770);
  const destructionRateByEnemy = enemyState?.destructionRateByEnemy ?? {};
  const destructionRatePercent = Number(destructionRateByEnemy[String(targetEnemyIndex)] ?? 100);

  // スカルフェザーの名前をコンテキストから取得
  const enemyName = String(ctx.enemyNamesByEnemy?.[String(targetEnemyIndex)] ?? `E${targetEnemyIndex + 1}`);

  const enemyAdapter = {
    targetEnemyIndex,
    enemyName,
    paramBorder,
    destructionRate: destructionRatePercent / 100,
    destructionRatePercent,
  };

  console.log(`=== 敵情報 ===`);
  console.log(`  enemy: ${enemyName}`);
  console.log(`  paramBorder: ${paramBorder}`);
  console.log(`  destructionRate: ${destructionRatePercent}%`);
  console.log('');

  // DP向け計算
  const dpInput = buildDamageCalculationInput(ctx, attackerInput, { ...enemyAdapter, isHpTarget: false });

  console.log(`=== calculateDamage 入力（DP） ===`);
  console.log(`  defender.resistances: ${JSON.stringify(dpInput.defender.resistances)}`);
  console.log(`  attacker.statusEffects: ${JSON.stringify(dpInput.attacker.statusEffects)}`);
  console.log(`  attacker.stats: str=${dpInput.attacker.stats.str}, dex=${dpInput.attacker.stats.dex}`);
  console.log('');

  const data = { styles: store.styles, enemies: store.enemies, skills: store.skills, spMapping: {} };
  const dpResult = calculateDamage(dpInput, data);

  console.log(`=== ダメージ計算結果（対DP）===`);
  console.log(`  normal.expected: ${Math.round(dpResult.normal.expected).toLocaleString()}`);
  console.log(`  critical.expected: ${Math.round(dpResult.critical.expected).toLocaleString()}`);
  console.log(`  normal range: [${Math.round(dpResult.normal.min).toLocaleString()} - ${Math.round(dpResult.normal.max).toLocaleString()}]`);
  console.log(`  critical range: [${Math.round(dpResult.critical.min).toLocaleString()} - ${Math.round(dpResult.critical.max).toLocaleString()}]`);
  console.log('');
  console.log(`  breakdown:`);
  const bd = dpResult.breakdown;
  console.log(`    buffMultiplier=${bd.buffMultiplier.toFixed(4)}`);
  console.log(`    critMindeyeMultiplier=${bd.critMindeyeMultiplier.toFixed(4)}`);
  console.log(`    debuffMultiplier=${bd.debuffMultiplier.toFixed(4)}`);
  console.log(`    affinityMultiplier=${bd.affinityMultiplier.toFixed(4)}`);
  console.log(`    funnelMultiplier=${bd.funnelMultiplier.toFixed(4)}`);
  console.log(`    tokenMultiplier=${bd.tokenMultiplier.toFixed(4)}`);
  const finalMult = bd.buffMultiplier * bd.critMindeyeMultiplier * bd.debuffMultiplier * bd.affinityMultiplier * bd.funnelMultiplier * bd.tokenMultiplier;
  console.log(`    → finalMultiplier=${finalMult.toFixed(4)}`);
  console.log('');

  const sessionNote = session.replayScript?.turns?.[targetTurn - 1]?.note ?? '';
  const match = sessionNote.match(/(\d[\d,]+)/);
  if (match) {
    const realDamage = Number(match[1].replace(/,/g, ''));
    console.log(`=== 実機値との比較 ===`);
    console.log(`  実機ダメージ: ${realDamage.toLocaleString()}`);
    console.log(`  計算値(critical): ${Math.round(dpResult.critical.expected).toLocaleString()}`);
    const ratio = realDamage / dpResult.critical.expected;
    console.log(`  比率(実機/計算): ${ratio.toFixed(4)}x`);
  }
}

main();
