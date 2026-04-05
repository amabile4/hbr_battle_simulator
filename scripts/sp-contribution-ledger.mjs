/**
 * sp-contribution-ledger.mjs
 *
 * セッションJSONを読み込み、ターンごとのSP増減を
 * 「スキル(=actions)」「パッシブ(=passiveEvents / action.spChanges.sp_passive)」に分解して表示する。
 *
 * Usage:
 *   node scripts/sp-contribution-ledger.mjs <session-json> [turn,turn,...]
 *   node scripts/sp-contribution-ledger.mjs <session-json> --csv=<output.csv>
 *   node scripts/sp-contribution-ledger.mjs <session-json> [turn,turn,...] --csv=<output.csv>
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
  const csvBody = rows.map((row) => toCsvLine(row)).join('\n');
  fs.writeFileSync(resolvedPath, `\uFEFF${csvBody}\n`, 'utf8');
  return resolvedPath;
}

const PRESTART_PASSIVE_TIMINGS = new Set([
  'OnFirstBattleStart',
  'OnBattleStart',
  'OnPlayerTurnStart',
  'OnEnemyTurnStart',
  'OnEveryTurn',
  'OnOverdriveStart',
  'OnAdditionalTurnStart',
]);

function buildPartySpMap(party = []) {
  return new Map(
    party.map((member) => [
      String(member?.characterId ?? ''),
      {
        characterName: String(member?.characterName ?? ''),
        currentSp: Number(member?.sp?.current ?? member?.spState?.current ?? member?.currentSp ?? 0),
      },
    ])
  );
}

function buildActionSkillEntries(actions = []) {
  return actions.flatMap((action) => {
    const spChanges = Array.isArray(action?.spChanges) ? action.spChanges : [];
    return spChanges
      .filter((change) => String(change?.source ?? '') === 'cost')
      .map((change) => ({
        characterId: String(action?.characterId ?? ''),
        characterName: String(action?.characterName ?? action?.characterId ?? '?'),
        skillName: String(action?.skillName ?? action?.skillId ?? '?'),
        changeType: String(change?.source ?? ''),
        delta: Number(change?.delta ?? 0),
        note: `pre=${fmt2(change?.preSP)} post=${fmt2(change?.postSP)}${
          Number.isFinite(Number(change?.eventCeiling)) ? ` ceiling=${fmt2(change.eventCeiling)}` : ''
        }`,
      }));
  });
}

function buildSkillDistributionEntries(skillSpEvents = []) {
  return skillSpEvents
    .map((event) => ({
      actorCharacterId: String(event?.actorCharacterId ?? ''),
      actorCharacterName: '',
      skillName: String(event?.skillName ?? event?.skillId ?? '?'),
      targetCharacterId: String(event?.characterId ?? ''),
      targetCharacterName: String(event?.characterName ?? event?.shortCharacterName ?? ''),
      targetType: String(event?.targetType ?? ''),
      delta: Number(event?.delta ?? 0),
      effectiveDelta: Number(event?.endSP ?? Number.NaN) - Number(event?.startSP ?? Number.NaN),
      note: `targetType=${String(event?.targetType ?? '')} pre=${fmt2(event?.startSP)} post=${fmt2(event?.endSP)}`,
      effectiveDelta: Number(event?.endSP ?? Number.NaN) - Number(event?.startSP ?? Number.NaN),
    }))
    .filter((entry) => Number.isFinite(entry.delta) && entry.delta !== 0);
}

function buildSelfActiveSkillEntries(skillSpEvents = []) {
  return skillSpEvents
    .map((event) => ({
      actorCharacterId: String(event?.actorCharacterId ?? ''),
      actorCharacterName: '',
      skillName: String(event?.skillName ?? event?.skillId ?? '?'),
      targetCharacterId: String(event?.characterId ?? ''),
      delta: Number(event?.delta ?? 0),
      note: `pre=${fmt2(event?.startSP)} post=${fmt2(event?.endSP)} targetType=${String(event?.targetType ?? '')}`,
    }))
    .filter(
      (entry) =>
        Number.isFinite(entry.delta) &&
        entry.delta !== 0 &&
        entry.actorCharacterId &&
        entry.actorCharacterId === entry.targetCharacterId
    )
    .map((entry) => ({
      characterId: entry.actorCharacterId,
      characterName: entry.actorCharacterName,
      skillName: entry.skillName,
      changeType: 'active',
      delta: entry.delta,
      note: entry.note,
    }));
}

function buildActionPassiveSpEntries(actions = []) {
  return actions.flatMap((action) => {
    const spChanges = Array.isArray(action?.spChanges) ? action.spChanges : [];
    return spChanges
      .filter((change) => String(change?.source ?? '') === 'sp_passive' && Number(change?.delta ?? 0) !== 0)
      .map((change) => ({
        characterId: String(action?.characterId ?? ''),
        characterName: String(action?.characterName ?? action?.characterId ?? '?'),
        passiveName: 'action-linked sp passive',
        timing: 'during-action',
        delta: Number(change?.delta ?? 0),
        note: `source=sp_passive pre=${fmt2(change?.preSP)} post=${fmt2(change?.postSP)}`,
      }));
  });
}

function buildBoundaryPassiveEntries(passiveEvents = []) {
  const entries = passiveEvents
    .map((event) => ({
      characterId: String(event?.characterId ?? ''),
      characterName: String(event?.characterName ?? event?.shortCharacterName ?? '?'),
      passiveName: String(event?.passiveName ?? '(unknown passive)'),
      passiveDesc: String(event?.passiveDesc ?? ''),
      timing: String(event?.timing ?? ''),
      delta: Number(event?.spDelta ?? 0),
      note: `source=${String(event?.source ?? 'passive')}`,
    }))
    .filter((event) => Number.isFinite(event.delta) && event.delta !== 0);

  const seen = new Set();
  return entries.filter((entry) => {
    const key = JSON.stringify([
      entry.characterId,
      entry.passiveName,
      entry.passiveDesc,
      entry.timing,
      entry.delta,
      entry.note,
    ]);
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function describePassiveSpDistribution(entry) {
  const desc = String(entry?.passiveDesc ?? '');
  const match = /SP\+(\d+)/.exec(desc);
  const unit = Number(match?.[1] ?? Number.NaN);
  const total = Number(entry?.delta ?? 0);
  if (!Number.isFinite(unit) || unit <= 0 || !Number.isFinite(total) || total === 0) {
    return entry.note;
  }
  const targetCount = total / unit;
  if (!Number.isInteger(targetCount) || targetCount <= 1) {
    return entry.note;
  }
  return `${entry.note} ${targetCount} targets x +${unit}`.trim();
}

function buildPassiveSpEntries(passiveSpEvents = []) {
  return passiveSpEvents
    .filter((event) => Number.isFinite(Number(event?.delta ?? Number.NaN)) && Number(event?.delta ?? 0) !== 0)
    .map((event) => ({
      characterId: String(event?.characterId ?? ''),
      characterName: String(event?.characterName ?? event?.shortCharacterName ?? ''),
      source: String(event?.source ?? 'base'),
      passiveName: String(event?.passiveName ?? ''),
      actorCharacterId: String(event?.actorCharacterId ?? ''),
      delta: Number(event?.delta ?? 0),
      startSP: Number(event?.startSP ?? Number.NaN),
      endSP: Number(event?.endSP ?? Number.NaN),
    }));
}

function buildSystemEntries(beforeMap, afterMap, skillEntries, passiveEntries, passiveSpEntries = [], distributionEntries = []) {
  const attributedByCharacter = new Map();
  const distributionAttribution = distributionEntries.map((e) => ({
    characterId: String(e?.targetCharacterId ?? ''),
    delta: Number.isFinite(Number(e?.effectiveDelta)) ? Number(e.effectiveDelta) : Number(e?.delta ?? 0),
  }));
  for (const entry of [...skillEntries, ...passiveEntries, ...passiveSpEntries, ...distributionAttribution]) {
    const key = String(entry?.characterId ?? '');
    const prev = Number(attributedByCharacter.get(key) ?? 0);
    attributedByCharacter.set(key, Number((prev + Number(entry?.delta ?? 0)).toFixed(2)));
  }

  const allCharacterIds = [...new Set([...beforeMap.keys(), ...afterMap.keys()])];
  return allCharacterIds
    .map((characterId) => {
      const start = Number(beforeMap.get(characterId)?.currentSp ?? 0);
      const end = Number(afterMap.get(characterId)?.currentSp ?? 0);
      const totalDelta = Number((end - start).toFixed(2));
      const attributed = Number(attributedByCharacter.get(characterId) ?? 0);
      const residual = Number((totalDelta - attributed).toFixed(2));
      if (Math.abs(residual) < 0.01) {
        return null;
      }
      return {
        characterId,
        characterName: String(afterMap.get(characterId)?.characterName ?? beforeMap.get(characterId)?.characterName ?? characterId),
        name: 'system recovery / boundary',
        timing: 'system',
        delta: residual,
        note: `start=${fmt2(start)} end=${fmt2(end)}`,
      };
    })
    .filter(Boolean);
}

function main() {
  const { inputPath, targetTurns, csvPath } = parseArgs(process.argv);
  if (!inputPath) {
    console.error(
      'Usage: node scripts/sp-contribution-ledger.mjs <session-json> [turn,turn,...] [--csv=<output.csv>]'
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

  const csvRows = [[
    'turn',
    'section',
    'kind',
    'character',
    'name',
    'timing',
    'sp_delta',
    'turn_start_sp',
    'turn_end_sp',
    'skill_sum',
    'passive_in_turn_sum',
    'passive_prestart_sum',
    'residual',
    'note',
  ]];

  let totalSkill = 0;
  let totalPassive = 0;
  let totalTurnDelta = 0;

  for (let i = 0; i < manager.computedRecords.length; i += 1) {
    const turnNo = i + 1;
    if (targetTurns && !targetTurns.has(turnNo)) {
      continue;
    }

    const record = manager.computedRecords[i] ?? {};
    const stateBeforeTurn = manager.getStateBefore(i);
    const stateAfterTurn = manager.computedStates?.[i] ?? null;
    const beforeMap = buildPartySpMap(stateBeforeTurn?.party ?? []);
    const afterMap = buildPartySpMap(stateAfterTurn?.party ?? []);
    const allCharacterIds = [...new Set([...beforeMap.keys(), ...afterMap.keys()])];

    const turnStartSp = Number(
      allCharacterIds.reduce((sum, id) => sum + Number(beforeMap.get(id)?.currentSp ?? 0), 0).toFixed(2)
    );
    const turnEndSp = Number(
      allCharacterIds.reduce((sum, id) => sum + Number(afterMap.get(id)?.currentSp ?? 0), 0).toFixed(2)
    );
    const turnDelta = Number((turnEndSp - turnStartSp).toFixed(2));

    const actions = Array.isArray(record.actions) ? record.actions : [];
    const passiveEvents = Array.isArray(record.passiveEvents) ? record.passiveEvents : [];
    const skillSpEvents = Array.isArray(record.skillSpEvents) ? record.skillSpEvents : [];
    const rawPassiveSpEvents = Array.isArray(record.passiveSpEvents) ? record.passiveSpEvents : [];

    const costEntries = buildActionSkillEntries(actions);
    const skillDistributionEntries = buildSkillDistributionEntries(skillSpEvents);
    const actionNameByCharacterId = new Map(
      actions.map((action) => [String(action?.characterId ?? ''), String(action?.characterName ?? action?.characterId ?? '?')])
    );
    const memberNameByCharacterId = new Map(
      [...beforeMap.entries()].map(([characterId, value]) => [characterId, String(value?.characterName ?? characterId)])
    );
    for (const entry of skillDistributionEntries) {
      entry.actorCharacterName = actionNameByCharacterId.get(entry.actorCharacterId) ?? entry.actorCharacterId;
      if (!entry.targetCharacterName) {
        entry.targetCharacterName = memberNameByCharacterId.get(entry.targetCharacterId) ?? entry.targetCharacterId;
      }
    }
    const selfActiveEntries = buildSelfActiveSkillEntries(skillSpEvents).map((entry) => ({
      ...entry,
      characterName: actionNameByCharacterId.get(entry.characterId) ?? entry.characterId,
    }));
    const skillEntries = [...costEntries, ...selfActiveEntries];
    const actionPassiveEntries = buildActionPassiveSpEntries(actions);
    const boundaryPassiveEntries = buildBoundaryPassiveEntries(passiveEvents);
    const allPassiveEntries = [...actionPassiveEntries, ...boundaryPassiveEntries];

    const passiveSpEntries = buildPassiveSpEntries(rawPassiveSpEvents).map((entry) => ({
      ...entry,
      characterName: entry.characterName || memberNameByCharacterId.get(entry.characterId) || entry.characterId,
      actorCharacterName: actionNameByCharacterId.get(entry.actorCharacterId) || memberNameByCharacterId.get(entry.actorCharacterId) || entry.actorCharacterId,
    }));

    const nonSelfDistributionEntries = skillDistributionEntries.filter(
      (entry) => entry.actorCharacterId !== entry.targetCharacterId
    );

    const prestartPassiveEntries = allPassiveEntries.filter(
      (event) => event.timing !== 'during-action' && PRESTART_PASSIVE_TIMINGS.has(String(event.timing ?? '').trim())
    );
    const inTurnPassiveEntries = allPassiveEntries.filter(
      (event) => event.timing === 'during-action' || !PRESTART_PASSIVE_TIMINGS.has(String(event.timing ?? '').trim())
    );

    const skillSum = Number(skillEntries.reduce((sum, entry) => sum + Number(entry.delta ?? 0), 0).toFixed(2));
    const passiveInTurnSum = Number(
      inTurnPassiveEntries.reduce((sum, entry) => sum + Number(entry.delta ?? 0), 0).toFixed(2)
    );
    const passivePrestartSum = Number(
      prestartPassiveEntries.reduce((sum, entry) => sum + Number(entry.delta ?? 0), 0).toFixed(2)
    );
    const distSum = Number(
      nonSelfDistributionEntries.reduce((sum, entry) => {
        const d = Number.isFinite(Number(entry?.effectiveDelta)) ? Number(entry.effectiveDelta) : Number(entry?.delta ?? 0);
        return sum + d;
      }, 0).toFixed(2)
    );
    const passiveSpSum = Number(
      passiveSpEntries.reduce((sum, entry) => {
        const d = Number.isFinite(Number(entry?.effectiveDelta)) ? Number(entry.effectiveDelta) : Number(entry?.delta ?? 0);
        return sum + d;
      }, 0).toFixed(2)
    );
    const systemEntries = buildSystemEntries(
      beforeMap,
      afterMap,
      skillEntries,
      inTurnPassiveEntries,
      passiveSpEntries,
      nonSelfDistributionEntries
    );
    const systemSum = Number(systemEntries.reduce((sum, entry) => sum + Number(entry.delta ?? 0), 0).toFixed(2));
    const residual = Number((turnDelta - skillSum - distSum - passiveInTurnSum - passiveSpSum - systemSum).toFixed(2));

    totalSkill = Number((totalSkill + skillSum).toFixed(2));
    totalPassive = Number((totalPassive + passiveInTurnSum).toFixed(2));
    totalTurnDelta = Number((totalTurnDelta + turnDelta).toFixed(2));

    csvRows.push([
      turnNo,
      'turn',
      'summary',
      '',
      '',
      '',
      fmt2(turnDelta),
      fmt2(turnStartSp),
      fmt2(turnEndSp),
      fmt2(skillSum),
      fmt2(passiveInTurnSum),
      fmt2(passivePrestartSum),
      fmt2(Number((systemSum + residual).toFixed(2))),
      '',
    ]);

    for (const entry of skillEntries) {
      csvRows.push([
        turnNo,
        'skill',
        entry.changeType,
        entry.characterName,
        entry.skillName,
        '',
        fmt2(entry.delta),
        '',
        '',
        '',
        '',
        '',
        '',
        entry.note,
      ]);
    }

    for (const entry of skillDistributionEntries.filter((entry) => entry.actorCharacterId !== entry.targetCharacterId)) {
      csvRows.push([
        turnNo,
        'skill',
        'distribution',
        entry.actorCharacterName,
        entry.skillName,
        '',
        fmt2(entry.delta),
        '',
        '',
        '',
        '',
        '',
        '',
        `${entry.targetCharacterName} ${entry.note}`,
      ]);
    }

    for (const entry of inTurnPassiveEntries) {
      csvRows.push([
        turnNo,
        'passive',
        entry.timing === 'during-action' ? 'in-turn-action-linked' : 'in-turn',
        entry.characterName,
        entry.passiveName,
        entry.timing,
        fmt2(entry.delta),
        '',
        '',
        '',
        '',
        '',
        '',
        entry.note,
      ]);
    }

    for (const entry of prestartPassiveEntries) {
      const note = describePassiveSpDistribution(entry);
      csvRows.push([
        turnNo,
        'passive',
        'pre-start',
        entry.characterName,
        entry.passiveName,
        entry.timing,
        fmt2(entry.delta),
        '',
        '',
        '',
        '',
        '',
        '',
        `${note} start SP includes this passive`.trim(),
      ]);
    }

    for (const entry of systemEntries) {
      csvRows.push([
        turnNo,
        'system',
        'boundary',
        entry.characterName,
        entry.name,
        entry.timing,
        fmt2(entry.delta),
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        entry.note,
      ]);
    }

    for (const entry of passiveSpEntries) {
      const kind = entry.source === 'base' ? 'base-recovery' : 'boundary-passive';
      const noteText = entry.source === 'base'
        ? `pre=${fmt2(entry.startSP)} post=${fmt2(entry.endSP)}`
        : `source=${entry.source} actor=${entry.actorCharacterName || entry.actorCharacterId} pre=${fmt2(entry.startSP)} post=${fmt2(entry.endSP)}`;
      csvRows.push([
        turnNo,
        'system',
        kind,
        entry.characterName,
        entry.source === 'base' ? 'base recovery' : entry.passiveName,
        '',
        fmt2(entry.delta),
        '',
        '',
        '',
        '',
        '',
        '',
        noteText,
      ]);
    }

    console.log('');
    console.log(`${'═'.repeat(78)}`);
    console.log(`Turn ${String(turnNo).padStart(2, '0')}`);
    console.log(`${'═'.repeat(78)}`);
    console.log(`SP: ${fmt2(turnStartSp)} -> ${fmt2(turnEndSp)}  delta=${sign2(turnDelta)}`);

    console.log('');
    console.log('  [スキルSP]');
    if (skillEntries.length === 0) {
      console.log('   (なし)');
    } else {
      skillEntries.forEach((entry, idx) => {
        const note = entry.note ? ` (${entry.note})` : '';
        console.log(
          `   ${String(idx + 1).padStart(2)}. ${entry.characterName} / ${entry.skillName} [${entry.changeType}]: ${sign2(entry.delta)}${note}`
        );
      });
    }

    if (nonSelfDistributionEntries.length > 0) {
      console.log('');
      console.log('  [スキルSP: 味方配布]');
      nonSelfDistributionEntries.forEach((entry, idx) => {
        console.log(
          `   ${String(idx + 1).padStart(2)}. ${entry.actorCharacterName} / ${entry.skillName} -> ${entry.targetCharacterName}: ${sign2(entry.delta)} (${entry.note})`
        );
      });
    }

    console.log('');
    console.log('  [パッシブSP: 行動中反映]');
    if (inTurnPassiveEntries.length === 0) {
      console.log('   (なし)');
    } else {
      inTurnPassiveEntries.forEach((entry, idx) => {
        const timing = entry.timing ? ` @${entry.timing}` : '';
        const note = entry.note ? ` (${entry.note})` : '';
        console.log(`   ${String(idx + 1).padStart(2)}. ${entry.characterName} / ${entry.passiveName}${timing}: ${sign2(entry.delta)}${note}`);
      });
    }

    if (prestartPassiveEntries.length > 0) {
      console.log('');
      console.log('  [パッシブSP: 開始時点に織り込み済み]');
      prestartPassiveEntries.forEach((entry, idx) => {
        const timing = entry.timing ? ` @${entry.timing}` : '';
        const noteText = describePassiveSpDistribution(entry);
        const note = noteText ? ` (${noteText})` : '';
        console.log(`   ${String(idx + 1).padStart(2)}. ${entry.characterName} / ${entry.passiveName}${timing}: ${sign2(entry.delta)}${note}`);
      });
    }

    if (passiveSpEntries.length > 0) {
      console.log('');
      console.log('  [システムSP: ターン回復内訳]');
      const baseEntries = passiveSpEntries.filter((e) => e.source === 'base');
      const boundaryPassiveSp = passiveSpEntries.filter((e) => e.source !== 'base');
      if (baseEntries.length > 0) {
        const baseTotal = Number(baseEntries.reduce((s, e) => s + e.delta, 0).toFixed(2));
        console.log(`    [自然回復] ${sign2(baseTotal)} (${baseEntries.length} 人 × +${sign2(baseEntries[0]?.delta ?? 0)})`);
      }
      boundaryPassiveSp.forEach((entry, idx) => {
        const actor = entry.actorCharacterName || entry.actorCharacterId;
        const actorPart = actor ? ` (by ${actor})` : '';
        console.log(
          `   ${String(idx + 1).padStart(2)}. ${entry.characterName} / ${entry.passiveName}${actorPart}: ${sign2(entry.delta)}`
        );
      });
    }

    if (systemEntries.length > 0) {
      console.log('');
      console.log('  [システムSP: 未配賦差分]');
      systemEntries.forEach((entry, idx) => {
        const note = entry.note ? ` (${entry.note})` : '';
        console.log(`   ${String(idx + 1).padStart(2)}. ${entry.characterName} / ${entry.name}: ${sign2(entry.delta)}${note}`);
      });
    }

    console.log('');
    console.log(
      `  [集計] skills=${sign2(skillSum)}  dist=${sign2(distSum)}  passives(in-turn)=${sign2(passiveInTurnSum)}  recovery=${sign2(passiveSpSum)}  system=${sign2(systemSum)}  residual=${sign2(residual)}  total=${sign2(turnDelta)}`
    );
    if (Math.abs(passivePrestartSum) >= 0.01) {
      console.log(`  [参考] passives(pre-start)=${sign2(passivePrestartSum)} ※ start SP に含まれる`);
    }
    if (Math.abs(residual) >= 0.01) {
      console.log('  ※ residual は未対応経路の可能性があります。');
    }
  }

  console.log('');
  console.log(`${'─'.repeat(78)}`);
  console.log(
    `TOTAL  skills=${sign2(totalSkill)}  passives=${sign2(totalPassive)}  combined=${sign2(Number((totalSkill + totalPassive).toFixed(2)))}  spDelta=${sign2(totalTurnDelta)}`
  );

  if (csvPath) {
    csvRows.push([
      'TOTAL',
      'summary',
      'aggregate',
      '',
      '',
      '',
      fmt2(totalTurnDelta),
      '',
      '',
      fmt2(totalSkill),
      fmt2(totalPassive),
      '',
      fmt2(Number((totalTurnDelta - totalSkill - totalPassive).toFixed(2))),
      '',
    ]);
    const writtenPath = writeCsvWithBom(csvPath, csvRows);
    console.log(`CSV written: ${writtenPath} (UTF-8 BOM)`);
  }
}

main();
