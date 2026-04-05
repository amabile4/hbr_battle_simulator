/**
 * od-contribution-ledger.mjs
 *
 * セッションJSONを読み込み、ターンごとのOD増減を
 * 「スキル(=actions)」「パッシブ(=passiveEvents)」に分解して表示する。
 *
 * Usage:
 *   node scripts/od-contribution-ledger.mjs <session-json> [turn,turn,...]
 *   node scripts/od-contribution-ledger.mjs <session-json> --csv=<output.csv>
 *   node scripts/od-contribution-ledger.mjs <session-json> [turn,turn,...] --csv=<output.csv>
 */
import fs from 'node:fs';
import path from 'node:path';

import { HbrDataStore } from '../src/index.js';
import { BattleStateManager } from '../ui-next/engine/battle-state-manager.js';
import { TurnEngineManager } from '../ui-next/engine/turn-engine-manager.js';
import { normalizeSessionSnapshot } from '../ui-next/utils/session-snapshot.js';

function fmt2(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n.toFixed(2) : 'NaN';
}

function truncDisplay(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) {
    return 'NaN';
  }
  return n >= 0 ? Math.floor(n) : Math.ceil(n);
}

function sign2(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) {
    return 'NaN';
  }
  return n >= 0 ? `+${n.toFixed(2)}` : n.toFixed(2);
}

function parseTargetTurns(raw) {
  if (!raw) {
    return null;
  }
  const turns = raw
    .split(',')
    .map((v) => Number(v.trim()))
    .filter((v) => Number.isFinite(v) && v > 0);
  return turns.length > 0 ? new Set(turns) : null;
}

function parseArgs(argv) {
  const rawArgs = argv.slice(2);
  const inputPath = rawArgs[0];
  const options = {
    targetTurns: null,
    csvPath: null,
  };

  for (const arg of rawArgs.slice(1)) {
    if (String(arg).startsWith('--csv=')) {
      const value = String(arg).slice('--csv='.length).trim();
      if (value) {
        options.csvPath = value;
      }
      continue;
    }
    if (String(arg).startsWith('--turns=')) {
      options.targetTurns = parseTargetTurns(String(arg).slice('--turns='.length));
      continue;
    }
    if (String(arg).startsWith('--')) {
      continue;
    }

    // 互換: 第2引数の "7,10,16" 形式
    options.targetTurns = parseTargetTurns(arg);
  }

  return {
    inputPath,
    ...options,
  };
}

function csvEscape(value) {
  const text = String(value ?? '');
  if (text.includes(',') || text.includes('"') || text.includes('\n')) {
    return `"${text.replaceAll('"', '""')}"`;
  }
  return text;
}

function toCsvLine(values) {
  return values.map((value) => csvEscape(value)).join(',');
}

function writeCsvWithBom(csvPath, rows) {
  const resolvedPath = path.resolve(csvPath);
  fs.mkdirSync(path.dirname(resolvedPath), { recursive: true });
  const lines = rows.map((row) => toCsvLine(row));
  const csvBody = lines.join('\n');
  const withBom = `\uFEFF${csvBody}\n`;
  fs.writeFileSync(resolvedPath, withBom, 'utf8');
  return resolvedPath;
}

const PRESTART_PASSIVE_TIMINGS = new Set([
  'OnFirstBattleStart',
  'OnBattleStart',
  'OnPlayerTurnStart',
  'OnEnemyTurnStart',
  'OnEveryTurn',
]);

const BREAK_TRIGGER_PASSIVE_SOURCE = 'od_passive_breaking';

function main() {
  const { inputPath, targetTurns, csvPath } = parseArgs(process.argv);
  if (!inputPath) {
    console.error(
      'Usage: node scripts/od-contribution-ledger.mjs <session-json> [turn,turn,...] [--csv=<output.csv>]'
    );
    process.exit(1);
  }

  const sessionPath = path.resolve(inputPath);
  const raw = JSON.parse(fs.readFileSync(sessionPath, 'utf8'));
  const session = normalizeSessionSnapshot(raw);

  const store = HbrDataStore.fromJsonDirectory('json');
  const battleStateManager = new BattleStateManager({ store });
  const initialState = battleStateManager.buildFromSnapshot(session.setup, session.enemy);

  const manager = new TurnEngineManager();
  manager.loadReplayScript(initialState, session.replayScript, {
    validationPolicy: session.validationPolicy,
  });

  let totalAction = 0;
  let totalPassive = 0;
  let totalDelta = 0;
  const csvRows = [
    [
      'turn',
      'section',
      'kind',
      'character',
      'name',
      'timing',
      'od_percent',
      'od_start',
      'od_end',
      'od_delta',
      'action_sum',
      'passive_in_turn_sum',
      'passive_prestart_sum',
      'residual',
      'note',
    ],
  ];

  for (let i = 0; i < manager.computedRecords.length; i += 1) {
    const turnNo = i + 1;
    if (targetTurns && !targetTurns.has(turnNo)) {
      continue;
    }

    const record = manager.computedRecords[i] ?? {};
    const actions = Array.isArray(record.actions) ? record.actions : [];
    const passiveEvents = Array.isArray(record.passiveEvents) ? record.passiveEvents : [];

    const start = Number(record?.odGaugeAtStart ?? 0);
    const end = Number(record?.projections?.odGaugeAtEnd ?? start);
    const delta = Number((end - start).toFixed(2));

    const actionSum = Number(
      actions.reduce((sum, action) => sum + Number(action?.odGaugeGain ?? 0), 0).toFixed(2)
    );

    const passiveEntries = passiveEvents
      .map((event) => ({
        characterName: String(event?.characterName ?? event?.shortCharacterName ?? ''),
        passiveName: String(event?.passiveName ?? '(unknown passive)'),
        timing: String(event?.timing ?? ''),
        od: Number(event?.odGaugeDelta ?? event?.odGain ?? 0),
        source: String(event?.source ?? ''),
        metadata: event?.metadata && typeof event.metadata === 'object' ? event.metadata : null,
      }))
      .filter((event) => Number.isFinite(event.od) && event.od !== 0);

    const prestartPassiveEntries = passiveEntries.filter(
      (event) =>
        event.source !== BREAK_TRIGGER_PASSIVE_SOURCE &&
        PRESTART_PASSIVE_TIMINGS.has(String(event.timing ?? '').trim())
    );
    const inTurnPassiveEntries = passiveEntries.filter(
      (event) =>
        event.source === BREAK_TRIGGER_PASSIVE_SOURCE ||
        !PRESTART_PASSIVE_TIMINGS.has(String(event.timing ?? '').trim())
    );

    const prestartPassiveSum = Number(
      prestartPassiveEntries.reduce((sum, event) => sum + Number(event.od ?? 0), 0).toFixed(2)
    );
    const passiveSum = Number(
      inTurnPassiveEntries.reduce((sum, event) => sum + Number(event.od ?? 0), 0).toFixed(2)
    );

    const residual = Number((delta - actionSum - passiveSum).toFixed(2));

    csvRows.push([
      turnNo,
      'turn',
      'summary',
      '',
      '',
      '',
      '',
      fmt2(start),
      fmt2(end),
      fmt2(delta),
      fmt2(actionSum),
      fmt2(passiveSum),
      fmt2(prestartPassiveSum),
      fmt2(residual),
      '',
    ]);

    for (const action of actions) {
      const name = String(action?.characterName ?? action?.characterId ?? '?');
      const skill = String(action?.skillName ?? action?.skillId ?? '?');
      const gain = Number(action?.odGaugeGain ?? 0);
      const pursued = Number(action?.pursuedHitCount ?? 0);
      const broken = Number(action?.breakHitCount ?? 0);
      const tags = [];
      if (pursued > 0) tags.push(`PURSUITx${pursued}`);
      if (broken > 0) tags.push(`BREAKx${broken}`);
      const tagText = tags.length > 0 ? tags.join(' ') : '';
      csvRows.push([
        turnNo,
        'skill',
        'action',
        name,
        skill,
        '',
        fmt2(gain),
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        tagText,
      ]);
    }

    for (const event of inTurnPassiveEntries) {
      const owner = event.characterName || '?';
      csvRows.push([
        turnNo,
        'passive',
        event.source === BREAK_TRIGGER_PASSIVE_SOURCE ? 'in-turn-break-trigger' : 'in-turn',
        owner,
        event.passiveName,
        event.timing,
        fmt2(event.od),
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        event.source === BREAK_TRIGGER_PASSIVE_SOURCE
          ? `source=${event.source}${
              Number.isFinite(Number(event?.metadata?.drivePierceBonusPercent))
                ? ` drivePierce=${Number(event.metadata.drivePierceBonusPercent).toFixed(4)}%`
                : ''
            }`
          : '',
      ]);
    }

    for (const event of prestartPassiveEntries) {
      const owner = event.characterName || '?';
      csvRows.push([
        turnNo,
        'passive',
        'pre-start',
        owner,
        event.passiveName,
        event.timing,
        fmt2(event.od),
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        'start OD includes this passive',
      ]);
    }

    totalAction = Number((totalAction + actionSum).toFixed(2));
    totalPassive = Number((totalPassive + passiveSum).toFixed(2));
    totalDelta = Number((totalDelta + delta).toFixed(2));

    console.log('');
    console.log(`${'═'.repeat(78)}`);
    console.log(`Turn ${String(turnNo).padStart(2, '0')}`);
    console.log(`${'═'.repeat(78)}`);
    console.log(
      `OD: ${fmt2(start)} (${truncDisplay(start)}%) -> ${fmt2(end)} (${truncDisplay(end)}%)  delta=${sign2(delta)}`
    );

    console.log('');
    console.log('  [スキルOD]');
    if (actions.length === 0) {
      console.log('   (なし)');
    } else {
      actions.forEach((action, idx) => {
        const name = String(action?.characterName ?? action?.characterId ?? '?');
        const skill = String(action?.skillName ?? action?.skillId ?? '?');
        const gain = Number(action?.odGaugeGain ?? 0);
        const pursued = Number(action?.pursuedHitCount ?? 0);
        const broken = Number(action?.breakHitCount ?? 0);
        const tags = [];
        if (pursued > 0) tags.push(`PURSUITx${pursued}`);
        if (broken > 0) tags.push(`BREAKx${broken}`);
        const tagText = tags.length > 0 ? ` [${tags.join(' ')}]` : '';
        console.log(`   ${String(idx + 1).padStart(2)}. ${name} / ${skill}${tagText}: ${sign2(gain)}%`);
      });
    }

    console.log('');
    console.log('  [パッシブOD: 行動中反映]');
    if (inTurnPassiveEntries.length === 0) {
      console.log('   (なし)');
    } else {
      inTurnPassiveEntries.forEach((event, idx) => {
        const owner = event.characterName || '?';
        const timing = event.timing ? ` @${event.timing}` : '';
        const breakMark = event.source === BREAK_TRIGGER_PASSIVE_SOURCE ? ' [break-trigger]' : '';
        const driveInfo =
          event.source === BREAK_TRIGGER_PASSIVE_SOURCE &&
          Number.isFinite(Number(event?.metadata?.drivePierceBonusPercent))
            ? ` (drivePierce=${Number(event.metadata.drivePierceBonusPercent).toFixed(4)}%)`
            : '';
        console.log(
          `   ${String(idx + 1).padStart(2)}. ${owner} / ${event.passiveName}${timing}${breakMark}${driveInfo}: ${sign2(event.od)}%`
        );
      });
    }

    if (prestartPassiveEntries.length > 0) {
      console.log('');
      console.log('  [パッシブOD: 開始時点に織り込み済み]');
      prestartPassiveEntries.forEach((event, idx) => {
        const owner = event.characterName || '?';
        const timing = event.timing ? ` @${event.timing}` : '';
        console.log(
          `   ${String(idx + 1).padStart(2)}. ${owner} / ${event.passiveName}${timing}: ${sign2(event.od)}%`
        );
      });
    }

    console.log('');
    console.log(
      `  [集計] skills=${sign2(actionSum)}  passives(in-turn)=${sign2(passiveSum)}  residual=${sign2(residual)}  total=${sign2(delta)}`
    );
    if (Math.abs(prestartPassiveSum) >= 0.01) {
      console.log(`  [参考] passives(pre-start)=${sign2(prestartPassiveSum)} ※ start OD に含まれる`);
    }
    if (Math.abs(residual) >= 0.01) {
      console.log('  ※ residual はゲージ上限クランプやその他経路の影響の可能性があります。');
    }
  }

  console.log('');
  console.log(`${'─'.repeat(78)}`);
  console.log(
    `TOTAL  skills=${sign2(totalAction)}  passives=${sign2(totalPassive)}  combined=${sign2(
      Number((totalAction + totalPassive).toFixed(2))
    )}  odDelta=${sign2(totalDelta)}`
  );

  if (csvPath) {
    csvRows.push([
      'TOTAL',
      'summary',
      'aggregate',
      '',
      '',
      '',
      '',
      '',
      '',
      fmt2(totalDelta),
      fmt2(totalAction),
      fmt2(totalPassive),
      '',
      fmt2(Number((totalDelta - totalAction - totalPassive).toFixed(2))),
      '',
    ]);

    const writtenPath = writeCsvWithBom(csvPath, csvRows);
    console.log(`CSV written: ${writtenPath} (UTF-8 BOM)`);
  }
}

main();
