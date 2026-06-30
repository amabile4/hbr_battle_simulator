/**
 * verify-session-cond.mjs
 *
 * セッション JSON をリプレイし、パーティーメンバーのパッシブ条件式を
 * 新 AST 評価器で評価してギャップ（unknown述語）を検出する。
 *
 * Usage:
 *   node scripts/verify-session-cond.mjs <session-json>
 *   node scripts/verify-session-cond.mjs <session-json> --verbose
 *   node scripts/verify-session-cond.mjs <session-json> --csv=<output.csv>
 *
 * 出力:
 *   - 各ターンでパッシブが持つ条件式を評価し unknownCount > 0 のものを報告
 *   - 全て known なら "PASS" を表示
 *   - --verbose: 条件式ごとの評価結果をすべて表示
 */
import fs from 'node:fs';
import { createWriteStream } from 'node:fs';
import path from 'node:path';

import { HbrDataStore } from '../src/index.js';
import { evaluateConditionExpression } from '../src/turn/turn-controller.js';
import { BattleStateManager } from '../ui-next/engine/battle-state-manager.js';
import { TurnEngineManager } from '../ui-next/engine/turn-engine-manager.js';
import { normalizeSessionSnapshot } from '../ui-next/utils/session-snapshot.js';

function parseArgs(argv) {
  const args = { input: null, verbose: false, csv: null };
  for (const token of argv) {
    if (token === '--verbose') { args.verbose = true; continue; }
    if (token.startsWith('--csv=')) { args.csv = token.slice(6); continue; }
    if (!token.startsWith('--')) args.input = token;
  }
  if (!args.input) {
    console.error('Usage: node scripts/verify-session-cond.mjs <session-json> [--verbose] [--csv=<output.csv>]');
    process.exit(1);
  }
  return args;
}

function collectPassiveConds(store, styleId) {
  const passives = store.listPassivesByStyleId(styleId) ?? [];
  const conds = [];
  for (const passive of passives) {
    const cond = String(passive?.condition ?? passive?.cond ?? '').trim();
    if (cond) conds.push({ passiveId: passive.id ?? '?', label: passive.label ?? '', cond });
    for (const part of passive?.parts ?? []) {
      const partCond = String(part?.cond ?? '').trim();
      if (partCond) conds.push({ passiveId: passive.id ?? '?', label: passive.label ?? '', cond: partCond, isPart: true });
    }
  }
  return conds;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const sessionPath = path.resolve(args.input);
  const raw = JSON.parse(fs.readFileSync(sessionPath, 'utf8'));
  const session = normalizeSessionSnapshot(raw);

  const store = HbrDataStore.fromJsonDirectory('json');
  const battleStateManager = new BattleStateManager({ store });
  const initialState = battleStateManager.buildFromSnapshot(session.setup, session.enemy);

  const manager = new TurnEngineManager();
  manager.loadReplayScript(initialState, session.replayScript, {
    validationPolicy: session.validationPolicy ?? 'warn',
  });

  const turns = manager.computedRecords;
  const computedStates = manager.computedStates ?? [];

  const gaps = [];
  const csvRows = [['turn', 'styleId', 'passiveId', 'label', 'cond', 'result', 'knownCount', 'unknownCount', 'parseError']];

  let totalEvals = 0;
  let totalGaps = 0;

  for (let i = 0; i < turns.length; i += 1) {
    const state = computedStates[i];
    if (!state) continue;
    const party = state.party ?? [];

    for (const member of party) {
      const styleId = member.styleId ?? member.id;
      if (!styleId) continue;
      const condList = collectPassiveConds(store, styleId);

      for (const { passiveId, label, cond, isPart } of condList) {
        const evaled = evaluateConditionExpression(cond, state, member, null, null);
        totalEvals += 1;

        const isGap = (evaled.unknownCount ?? 0) > 0 || evaled.parseError;
        if (isGap) {
          totalGaps += 1;
          gaps.push({ turn: i + 1, styleId, passiveId, label, cond, result: evaled.result, unknownCount: evaled.unknownCount, parseError: evaled.parseError ?? null });
        }

        if (args.verbose || isGap) {
          const flag = isGap ? ' ⚠ UNKNOWN' : '';
          const partMark = isPart ? ' [part]' : '';
          console.log(`Turn ${String(i + 1).padStart(2)} | ${styleId} | ${passiveId}${partMark} | ${label || cond}${flag}`);
          if (args.verbose || isGap) {
            console.log(`  cond: ${cond}`);
            console.log(`  → result=${evaled.result} known=${evaled.knownCount} unknown=${evaled.unknownCount}${evaled.parseError ? ` parseError=${evaled.parseError}` : ''}`);
          }
        }

        csvRows.push([i + 1, styleId, passiveId, label, cond, evaled.result, evaled.knownCount ?? 0, evaled.unknownCount ?? 0, evaled.parseError ?? '']);
      }
    }
  }

  console.log('');
  console.log(`評価数: ${totalEvals}件 | ギャップ(unknown述語あり): ${totalGaps}件`);

  if (totalGaps === 0) {
    console.log('PASS — すべての条件式が AST 評価器で既知述語のみで評価されました');
  } else {
    console.log('');
    console.log('=== ギャップ一覧 ===');
    for (const g of gaps) {
      console.log(`Turn ${g.turn} | ${g.styleId} | ${g.passiveId} | ${g.cond}`);
      console.log(`  unknown=${g.unknownCount}${g.parseError ? ` parseError=${g.parseError}` : ''}`);
    }
  }

  if (args.csv) {
    const csvPath = path.resolve(args.csv);
    const out = createWriteStream(csvPath, 'utf8');
    for (const row of csvRows) {
      out.write(row.map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',') + '\n');
    }
    out.end();
    console.log(`\nCSV 出力: ${csvPath}`);
  }
}

main();
