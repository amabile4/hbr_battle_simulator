#!/usr/bin/env node
/**
 * 超越バースト（Transcendence Burst）がリプレイ計算に正しく適用されているか検証するスクリプト。
 *
 * Usage: node scripts/verify-transcendence-burst.mjs <session-json-path> [--turn <n>]
 */

import fs from 'node:fs';
import path from 'node:path';

import { HbrDataStore } from '../src/index.js';
import { BattleStateManager } from '../ui-next/engine/battle-state-manager.js';
import { TurnEngineManager } from '../ui-next/engine/turn-engine-manager.js';
import { normalizeSessionSnapshot } from '../ui-next/utils/session-snapshot.js';

function fmt2(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n.toFixed(2) : 'NaN';
}

function pct(v) {
  const n = Number(v);
  return Number.isFinite(n) ? `${(n * 100).toFixed(1)}%` : 'NaN';
}

function main() {
  let inputPath = null;
  let targetTurn = null;

  for (let i = 2; i < process.argv.length; i++) {
    if (process.argv[i] === '--turn') {
      targetTurn = Number(process.argv[++i]);
    } else {
      inputPath = process.argv[i];
    }
  }

  if (!inputPath) {
    console.error('Usage: node scripts/verify-transcendence-burst.mjs <session-json-path> [--turn <n>]');
    process.exit(1);
  }

  const text = fs.readFileSync(path.resolve(inputPath), 'utf8');
  const session = normalizeSessionSnapshot(JSON.parse(text));

  const store = HbrDataStore.fromJsonDirectory('json');
  const battleStateManager = new BattleStateManager({ store });
  const initialState = battleStateManager.buildFromSnapshot(session.setup, session.enemy);

  // 初期超越状態を表示
  const initTrans = initialState?.turnState?.transcendence;
  if (initTrans) {
    console.log('=== 初期超越状態 ===');
    console.log(`  active=${initTrans.active}, element=${initTrans.gaugeElement}`);
    console.log(`  gaugePercent=${fmt2(initTrans.gaugePercent)}%`);
    console.log(`  maxGaugePercent=${fmt2(initTrans.maxGaugePercent)}%`);
    console.log(`  gainPercentPerAction=${fmt2(initTrans.gainPercentPerAction)}%`);
    console.log(`  burstTriggered=${initTrans.burstTriggered}`);
    if (initTrans.burst) {
      console.log(`  burst.enabled=${initTrans.burst.enabled}, attackUpPercent=${initTrans.burst.attackUpPercent}%`);
      console.log(`  burst.criticalGuaranteed=${initTrans.burst.criticalGuaranteed}, criticalDamageUpPercent=${initTrans.burst.criticalDamageUpPercent}%`);
    }
    console.log('');
  } else {
    console.log('=== 超越状態なし（超越持ちスタイル未編成）===\n');
  }

  const manager = new TurnEngineManager();
  manager.loadReplayScript(initialState, session.replayScript, {
    validationPolicy: session.validationPolicy,
  });

  const turns = manager.computedRecords;
  const states = manager.computedStates;

  for (let i = 0; i < turns.length; i++) {
    if (targetTurn !== null && i + 1 !== targetTurn) continue;

    const record = turns[i];
    const stateAfter = states[i];
    const note = String(session.replayScript?.turns?.[i]?.note ?? '').replace(/\n/g, ' | ');

    // ターン後の超越状態
    const transAfter = stateAfter?.turnState?.transcendence;
    const burstAfter = transAfter?.burstTriggered;

    console.log(`=== Turn ${i + 1} ===`);
    if (note.trim()) console.log(`  note: ${note}`);

    if (transAfter) {
      console.log(`  超越ゲージ(ターン後): ${fmt2(transAfter.gaugePercent)}% / ${fmt2(transAfter.maxGaugePercent)}%`);
      console.log(`  burstTriggered(ターン後): ${burstAfter}`);
    }

    const transSummary = record?.transcendence;
    if (transSummary) {
      console.log(`  transcendence summary: start=${fmt2(transSummary.startGaugePercent)}% end=${fmt2(transSummary.endGaugePercent)}% reachedMax=${transSummary.reachedMaxThisTurn} odBonus=${fmt2(transSummary.odGaugeBonusPercent)}%`);
    }
    console.log('');

    for (const action of record?.actions ?? []) {
      const name = String(action?.characterName ?? action?.characterId ?? 'Unknown');
      const skill = String(action?.skillName ?? action?.skillId ?? '?');
      const ctx = action?.damageContext;

      if (!ctx) {
        console.log(`  [${name}] ${skill}: (ダメージなし)`);
        continue;
      }

      console.log(`  [${name}] ${skill}:`);
      console.log(`    attackUpRate=${fmt2(ctx.attackUpRate)} (transcendenceBurst分=${fmt2(ctx.transcendenceBurstAttackUpRate)})`);
      console.log(`    criticalDamageUpRate=${fmt2(ctx.criticalDamageUpRate)} (burst分=${fmt2(ctx.transcendenceBurstCriticalDamageUpRate)})`);
      console.log(`    criticalGuaranteedByBurst=${ctx.criticalGuaranteed ?? false}`);

      if (ctx.damageSources && ctx.damageSources.length > 0) {
        let totalDmg = 0;
        for (const src of ctx.damageSources) {
          totalDmg += Number(src.damage ?? 0);
        }
        console.log(`    totalDamage(sim)=${totalDmg.toLocaleString()}`);
      } else if (Number.isFinite(Number(ctx.totalDamage))) {
        console.log(`    totalDamage(sim)=${Number(ctx.totalDamage).toLocaleString()}`);
      }
    }
    console.log('');
  }
}

main();
