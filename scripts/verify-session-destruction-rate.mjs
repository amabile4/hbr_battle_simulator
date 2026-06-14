#!/usr/bin/env node
/**
 * 破壊率検証リプレイプレイヤー
 *
 * セッションJSONを読込み、各ターン・各アクションの破壊率推移を一覧表示する。
 * レコードの備考欄（note）に [行動者] [その時の破壊率] 形式でメモがあれば併記する。
 *
 * Usage:
 *   node scripts/verify-session-destruction-rate.mjs <session-json-path> [--verbose]
 *
 * --verbose: damageContext 内の破壊率関連レート詳細も表示
 */
import fs from 'node:fs';
import path from 'node:path';

import { HbrDataStore } from '../src/index.js';
import { BattleStateManager } from '../ui-next/engine/battle-state-manager.js';
import { TurnEngineManager } from '../ui-next/engine/turn-engine-manager.js';
import { normalizeSessionSnapshot } from '../ui-next/utils/session-snapshot.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fmt(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 'NaN';
  return n.toFixed(2);
}

function commify(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 'NaN';
  return n.toLocaleString('en-US', { maximumFractionDigits: 0 });
}

/**
 * note 内の [行動者] [破壊率] 形式のメモを抽出
 */
function extractDestructionNotes(noteText) {
  if (!noteText || typeof noteText !== 'string') return [];
  const lines = noteText.split('\n').filter((l) => l.trim());
  return lines;
}

/**
 * 破壊率関連レートの要約を生成（--verbose 用）
 */
function summarizeDestructionRates(ctx) {
  if (!ctx) return '';
  const parts = [];
  const push = (label, value, suffix = '') => {
    const n = Number(value);
    if (Number.isFinite(n) && n !== 0) {
      parts.push(`${label}=${fmt(n)}${suffix}`);
    }
  };
  push('attackUp', ctx.attackUpRate);
  push('defenseUp', ctx.defenseUpRate);
  push('critRateUp', ctx.criticalRateUpRate);
  push('critDmgUp', ctx.criticalDamageUpRate);
  push('markAtkUp', ctx.markAttackUpRate);
  push('markDmgTaken↓', ctx.markDamageTakenDownRate);
  push('markDestrBonus', ctx.markDestructionRateGainBonusRate);
  push('transAtkUp', ctx.transcendenceBurstAttackUpRate);
  push('transDestrBonus', ctx.transcendenceBurstDestructionRateGainBonusRate);
  push('foodAtkUp', ctx.foodBuffAttackUpRate);
  push('tokenRate', ctx.tokenAttackTotalRate);
  push('highBoost', ctx.highBoostSkillAtkRate);
  return parts.length > 0 ? parts.join(' ') : '(no rate modifiers)';
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function loadDamageCalculationData(jsonDir) {
  return {
    styles: JSON.parse(fs.readFileSync(path.join(jsonDir, 'styles.json'), 'utf8')),
    characters: JSON.parse(fs.readFileSync(path.join(jsonDir, 'characters.json'), 'utf8')),
    enemies: JSON.parse(fs.readFileSync(path.join(jsonDir, 'enemies.json'), 'utf8')),
    skills: JSON.parse(fs.readFileSync(path.join(jsonDir, 'skills.json'), 'utf8')),
  };
}

function main() {
  const args = process.argv.slice(2);
  const verbose = args.includes('--verbose') || args.includes('-v');
  const dumpBreakdown = args.includes('--dump-breakdown') || args.includes('--dump');
  const inputPath = args.find((a) => !a.startsWith('-'));

  if (!inputPath) {
    console.error('Usage: node scripts/verify-session-destruction-rate.mjs <session-json-path> [--verbose] [--dump-breakdown]');
    console.error('');
    console.error('Options:');
    console.error('  --verbose, -v       Show per-action damage rate breakdown');
    console.error('  --dump-breakdown    Dump calculateDestruction breakdown for each action');
    process.exit(1);
  }

  const sessionPath = path.resolve(inputPath);
  const text = fs.readFileSync(sessionPath, 'utf8');
  const raw = JSON.parse(text);
  const session = normalizeSessionSnapshot(raw);

  const jsonDir = path.resolve('json');
  const store = HbrDataStore.fromJsonDirectory(jsonDir);
  const battleStateManager = new BattleStateManager({ store });
  const initialState = battleStateManager.buildFromSnapshot(session.setup, session.enemy);

  // DPダメージガイド導出に必要な計算データ（styles/characters/enemies/skills）を準備
  const damageCalculationData = loadDamageCalculationData(jsonDir);

  const manager = new TurnEngineManager();
  manager.loadReplayScript(initialState, session.replayScript, {
    validationPolicy: session.validationPolicy,
    damageCalculationData,
  });

  const turns = manager.computedRecords;
  const replayTurns = session.replayScript?.turns ?? [];

  // 敵情報を最初のターンレコードとDataStoreから取得
  const firstRecord = turns[0] ?? {};
  const enemyCount = firstRecord.enemyCount ?? 1;
  const enemyNamesByEnemy = firstRecord.enemyNamesByEnemy ?? {};

  // DP/HP: DataStore から取得（敵の base_param が信頼できるソース）
  const enemyDpByEnemy = {};
  const enemyHpByEnemy = {};
  const selectedEnemyIds = session.enemy?.selectedEnemyIds ?? [];
  for (let ei = 0; ei < enemyCount; ei++) {
    const key = String(ei);
    const enemyId = selectedEnemyIds[ei];
    if (enemyId != null) {
      const enemy = store.enemiesById?.get(Number(enemyId))
        ?? store.enemies?.find(e => e.id === Number(enemyId));
      if (enemy) {
        if (enemy.base_param?.dp != null) enemyDpByEnemy[key] = enemy.base_param.dp;
        if (enemy.base_param?.hp != null) enemyHpByEnemy[key] = enemy.base_param.hp;
        if (!enemyNamesByEnemy[key]) {
          enemyNamesByEnemy[key] = enemy.name ?? `Enemy${ei}`;
        }
      }
    }
  }

  // 敵情報ヘッダ
  console.log('=== Enemy Info ===');
  for (let ei = 0; ei < enemyCount; ei++) {
    const key = String(ei);
    const name = enemyNamesByEnemy[key] ?? `Enemy${ei}`;
    const dp = enemyDpByEnemy[key] ?? 0;
    const hp = enemyHpByEnemy[key] ?? 0;
    console.log(`  E${ei + 1}: ${name}  DP=${commify(dp)}  HP=${commify(hp)}`);
  }
  console.log('');

  // 破壊率の初期値
  let prevDestructionRateByEnemy = {};
  for (let ei = 0; ei < enemyCount; ei++) {
    prevDestructionRateByEnemy[String(ei)] = 0;
  }

  for (let i = 0; i < turns.length; i += 1) {
    const record = turns[i];
    const replayTurn = replayTurns[i] ?? {};
    const note = String(replayTurn.note ?? '').trim();
    const noteLines = extractDestructionNotes(note);

    // ターン開始時の破壊率 = getStateBefore(i) の enemyState から取得（UI と同じ参照パス）
    const stateBefore = manager.getStateBefore(i);
    const enemyStateBefore = stateBefore?.turnState?.enemyState ?? {};
    const destructionRateBefore = {};
    for (let ei = 0; ei < enemyCount; ei++) {
      const key = String(ei);
      destructionRateBefore[key] = Number(
        enemyStateBefore.destructionRateByEnemy?.[key]
        ?? prevDestructionRateByEnemy[key]
        ?? 0
      );
    }

    // ターン終了時の破壊率 = computedStates[i] の enemyState から取得（正規の状態ソース）
    const stateAfter = manager.computedStates?.[i];
    const enemyStateAfter = stateAfter?.turnState?.enemyState ?? {};
    const destructionRateAfter = {};
    for (let ei = 0; ei < enemyCount; ei++) {
      const key = String(ei);
      destructionRateAfter[key] = Number(
        enemyStateAfter.destructionRateByEnemy?.[key]
        ?? destructionRateBefore[key]
        ?? 0
      );
    }

    // DP/HP 残量
    const dpBeforeByEnemy = enemyStateBefore.remainingDpByEnemy ?? {};
    const dpAfterByEnemy = enemyStateAfter.remainingDpByEnemy ?? {};
    const hpBeforeByEnemy = enemyStateBefore.remainingHpByEnemy ?? {};
    const hpAfterByEnemy = enemyStateAfter.remainingHpByEnemy ?? {};

    // Break 状態
    const statusesAfter = enemyStateAfter.statuses ?? [];
    const breakEnemyIndexes = new Set(
      statusesAfter
        .filter(s => String(s?.statusType ?? '') === 'Break' || String(s?.statusType ?? '') === 'DownTurn')
        .map(s => Number(s?.targetIndex ?? -1))
    );

    // 手動 override の有無
    const destrOverride = (replayTurn.overrideEntries ?? [])
      .filter(e => e.type === 'EnemyDestructionRates')
      .map(e => JSON.stringify(e.payload));
    const statusOverride = (replayTurn.overrideEntries ?? [])
      .filter(e => e.type === 'EnemyStatuses')
      .map(e => e.payload.some?.(s => s.statusType === 'Break') ?? false);

    const turnLabel = record.turnLabel ?? `T${i + 1}`;
    console.log(`=== Turn ${String(i + 1).padStart(2, '0')} (${turnLabel}) ===`);

    // 開始時の各敵の破壊率・DP・HP
    for (let ei = 0; ei < enemyCount; ei++) {
      const key = String(ei);
      const rateBefore = Number(destructionRateBefore[key] ?? 0);
      const rateAfter = Number(destructionRateAfter[key] ?? 0);
      const delta = rateAfter - rateBefore;
      const deltaStr = delta !== 0 ? ` (→${fmt(rateAfter)}% Δ${delta >= 0 ? '+' : ''}${fmt(delta)}%)` : '';
      const dpBefore = Number(dpBeforeByEnemy[key] ?? 0);
      const dpAfter = Number(dpAfterByEnemy[key] ?? 0);
      const hpAfter = Number(hpAfterByEnemy[key] ?? 0);
      const isBroken = breakEnemyIndexes.has(ei);
      const brokenStr = isBroken ? ' [BREAK]' : '';
      const dpStr = dpBefore > 0
        ? ` DP=${commify(dpBefore)}→${commify(dpAfter)}`
        : '';
      console.log(`  E${ei + 1}: 破壊率=${fmt(rateBefore)}%${deltaStr}${dpStr}${brokenStr}`);
    }

    if (destrOverride.length > 0) {
      console.log(`  ⚠ 手動Override: EnemyDestructionRates ${destrOverride.join('; ')}`);
    }
    if (statusOverride.some(v => v)) {
      console.log(`  ⚠ 手動Override: EnemyStatuses (Break強制)`);
    }

    // 備考欄（note）があれば表示
    if (noteLines.length > 0) {
      console.log(`  note: ${noteLines.join(' | ')}`);
    }

    // 各アクションの破壊率寄与
    let runningDestructionRate = { ...destructionRateBefore };
    for (const action of record.actions ?? []) {
      const name = String(action.characterName ?? '???');
      const skill = String(action.skillName ?? '???');
      const dc = action.damageContext;

      if (!dc) {
        // ダメージなしのアクション（バフ等）
        console.log(`  - ${name} / ${skill}: (no damage)`);
        continue;
      }

      // hit count
      const hitCount = Number(dc.effectiveHitCountPerEnemy ?? dc.baseHitCount ?? 0);
      const hitStr = hitCount > 0 ? ` hits=${hitCount}` : '';

      // 破壊率情報を取得
      const actionDestructionRate = dc.destructionRateByEnemy ?? {};
      const hasRateValue = Object.keys(actionDestructionRate).length > 0;

      // 各敵の攻撃前破壊率 → 攻撃後破壊率
      let destrLineParts = [];
      for (let ei = 0; ei < enemyCount; ei++) {
        const key = String(ei);
        const rateBeforeAction = Number(runningDestructionRate[key] ?? 0);
        const rateAfterAction = hasRateValue ? Number(actionDestructionRate[key] ?? rateBeforeAction) : rateBeforeAction;
        const delta = rateAfterAction - rateBeforeAction;
        const deltaStr = delta > 0.001 ? ` →${fmt(rateAfterAction)}% (+${fmt(delta)}%)` : '';
        destrLineParts.push(`E${ei + 1}=${fmt(rateBeforeAction)}%${deltaStr}`);
      }

      console.log(`  - ${name} / ${skill}:${hitStr} 破壊率=[${destrLineParts.join(', ')}]`);

      // runningDestructionRate を更新
      if (hasRateValue) {
        for (const [k, v] of Object.entries(actionDestructionRate)) {
          runningDestructionRate[k] = Number(v);
        }
      }

      // --verbose: レート詳細
      if (verbose) {
        const rates = summarizeDestructionRates(dc);
        console.log(`    rates: ${rates}`);

        // attackReferences (属性)
        if (dc.attackReferencesByEnemy) {
          for (const [ei, refs] of Object.entries(dc.attackReferencesByEnemy)) {
            if (Array.isArray(refs) && refs.length > 0) {
              console.log(`    E${Number(ei) + 1} refs: ${refs.join(', ')}`);
            }
          }
        }

        // affinity contributions
        if (dc.affinityContributionsByEnemy) {
          for (const [ei, contribs] of Object.entries(dc.affinityContributionsByEnemy)) {
            if (Array.isArray(contribs)) {
              const line = contribs.map((c) => `${c.label}×${fmt(c.multiplier)}`).join(', ');
              if (line) console.log(`    E${Number(ei) + 1} affinity: ${line}`);
            }
          }
        }

        // DP / HP / paramBorder
        if (dc.enemyDpByEnemy) {
          for (const [ei, dp] of Object.entries(dc.enemyDpByEnemy)) {
            if (Number(dp) > 0) {
              const border = Number(dc.enemyParamBorderByEnemy?.[ei] ?? 0);
              const dRate = Number(dc.effectiveDamageRatesByEnemy?.[ei] ?? 100);
              console.log(`    E${Number(ei) + 1}: DP=${commify(dp)} border=${border} dmgRate=${fmt(dRate)}%`);
            }
          }
        }
      }

      // --dump-breakdown: calculateDestruction の内訳を表示
      if (dumpBreakdown) {
        const breakdownByEnemy = action?.destructionBreakdownByEnemy;
        if (breakdownByEnemy) {
          for (const [enemyKey, info] of Object.entries(breakdownByEnemy)) {
            const bd = info?.breakdown;
            if (!bd) continue;
            const ei = Number(enemyKey);
            console.log(`    ┌── Breakdown E${ei + 1}: ${info.skillName} (${info.characterName})`);
            console.log(`    │ rateBefore=${fmt(info.rateBefore)}% → rateAfter=${fmt(info.rateAfter)}% (cap=${fmt(info.capPercent)}%)`);
            console.log(`    │ dr=${fmt(bd.dr)} destMult(d_rate)=${fmt(bd.destMult)} sp=${fmt(bd.sp)} isNormal=${bd.isNormalAttack} isPursuit=${bd.isPursuit}`);
            console.log(`    │ hitCount=${bd.hitCount} autoBreak=${info.useAutoBreak}`);
            const bdr = Number(bd.baseDestRate);
            console.log(`    │ baseDestRate=${fmt(bdr * 100)}% (= ${fmt(bd.dr)}×${bd.isNormalAttack ? '1' : '4'}×${fmt(bd.destMult)}/100)`);
            if (!bd.isNormalAttack) {
              console.log(`    │   × (1 + sRatio=${fmt(bd.sRatio)} + buffMult=${fmt(bd.buffMultiplier)} + flatBonus=${fmt(bd.flatDestructionBonus)})`);
              console.log(`    │   blasterCorrection=${fmt(bd.blasterCorrection)} accessory=${fmt(bd.accessoryBonus)}`);
              console.log(`    │   transcendenceBurstDestructionRateGainBonusRate=${fmt(bd.transcendenceBurstDestructionRateGainBonusRate)}`);
            }
            console.log(`    │ baseDestruction=${fmt(bd.baseDestruction * 100)}%`);
            console.log(`    │   × (1 - destResist=${fmt(bd.destResist)}) × (1 + resonance=${fmt(bd.resonanceBonus)})`);
            console.log(`    │ finalBaseDestruction=${fmt(bd.finalBaseDestruction * 100)}% (per-hit: +${fmt(bd.finalBaseDestruction / bd.hitCount * 100)}% × ${bd.hitCount}hits)`);
            console.log(`    │ destLimit=${fmt(bd.destLimit * 100)}% + limitExceedBonus=${fmt(bd.limitExceedBonus * 100)}% → finalDestLimit=${fmt(bd.finalDestLimit * 100)}%`);
            console.log(`    │ dpBeforeThisAction=${commify(info.dpBeforeThisAction)} perHitDpDamage=${commify(info.perHitDpDamage)} totalDpDamage=${commify(info.totalDpDamage)}`);
            console.log(`    └── finalDestructionRate=${fmt(bd.destructionRate * 100)}%`);
          }
        }
      }
    }

    // ターン終了時の最終破壊率
    const finalParts = [];
    for (let ei = 0; ei < enemyCount; ei++) {
      const key = String(ei);
      const rate = Number(destructionRateAfter[key] ?? 0);
      finalParts.push(`E${ei + 1}=${fmt(rate)}%`);
    }
    console.log(`  → turn end: [${finalParts.join(', ')}]`);

    // dpEvents があれば精算（敵対象のもののみ）
    const enemyDpEvents = (record.dpEvents ?? []).filter(evt => evt.targetType !== 'AllyFront');
    if (enemyDpEvents.length > 0) {
      console.log(`  dpEvents: ${enemyDpEvents.length} events`);
      for (const evt of enemyDpEvents) {
        const evtType = evt.type ?? evt.source ?? 'unknown';
        const target = evt.enemyIndex != null ? `E${evt.enemyIndex + 1}` : '?';
        const dpBefore = Number(evt.dpBefore ?? evt.currentDp ?? 0);
        const dpAfter = Number(evt.dpAfter ?? 0);
        console.log(`    ${target} ${evtType}: DP ${commify(dpBefore)} → ${commify(dpAfter)} (Δ${commify(dpAfter - dpBefore)})`);
      }
    }

    console.log('');
    prevDestructionRateByEnemy = { ...destructionRateAfter };
  }

  // サマリー
  console.log('=== Summary ===');
  if (turns.length > 0) {
    // 最終ターンの computedStates から破壊率を取得（エンジン計算値の正規ソース）
    const lastState = manager.computedStates?.[turns.length - 1];
    const lastEnemyState = lastState?.turnState?.enemyState ?? {};
    const finalDestruction = {};
    const finalDp = {};
    for (let ei = 0; ei < enemyCount; ei++) {
      const key = String(ei);
      finalDestruction[key] = Number(lastEnemyState.destructionRateByEnemy?.[key] ?? 0);
      finalDp[key] = Number(lastEnemyState.remainingDpByEnemy?.[key] ?? 0);
    }
    for (let ei = 0; ei < enemyCount; ei++) {
      const key = String(ei);
      const rate = Number(finalDestruction[key] ?? 0);
      const dp = finalDp[key] ?? enemyDpByEnemy[key] ?? 0;
      const hp = enemyHpByEnemy[key] ?? 0;
      const status = Number(finalDp[key]) > 0 ? 'Alive' : 'Broken';
      console.log(`  E${ei + 1}: 最終破壊率=${fmt(rate)}%  status=${status}  DP残=${commify(dp)}  HP=${commify(hp)}`);
    }
  }
  console.log(`Total turns: ${turns.length}`);
}

main();
