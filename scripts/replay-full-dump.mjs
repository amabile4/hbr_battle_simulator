/**
 * replay-full-dump.mjs
 *
 * セッション JSON リプレイファイルを読み込み、内部状態を極力すべて JSON として出力する
 * 「フルダンプ型 JSON プレイヤー」。両バージョン間での挙動差確認に使用。
 *
 * Usage:
 *   node scripts/replay-full-dump.mjs <session-json> [--output=<out.json>] [--verbose]
 *
 * 引数:
 *   <session-json>      リプレイセッション JSON のパス
 *   --output=<path>     出力先 JSON (省略時は stdout)
 *   --verbose           各ターンのサマリを stderr に出力
 */
import fs from 'node:fs';
import path from 'node:path';

import { HbrDataStore } from '../src/index.js';
import { evaluateConditionExpression } from '../src/turn/turn-controller.js';
import { BattleStateManager } from '../ui-next/engine/battle-state-manager.js';
import { TurnEngineManager } from '../ui-next/engine/turn-engine-manager.js';
import { normalizeSessionSnapshot } from '../ui-next/utils/session-snapshot.js';

function parseArgs(argv) {
  const args = { input: null, output: null, verbose: false };
  for (const token of argv) {
    if (token === '--verbose') {
      args.verbose = true;
      continue;
    }
    if (token.startsWith('--output=')) {
      args.output = token.slice(9);
      continue;
    }
    if (!token.startsWith('--')) {
      args.input = token;
    }
  }
  if (!args.input) {
    console.error('Usage: node scripts/replay-full-dump.mjs <session-json> [--output=<out.json>] [--verbose]');
    process.exit(1);
  }
  return args;
}

function collectPassiveConds(store, member) {
  const styleId = member?.styleId ?? member?.id;
  if (!styleId) return [];
  const passives = store.listPassivesByStyleId(styleId) ?? [];
  const result = [];
  for (const passive of passives) {
    const id = passive?.id ?? '?';
    const label = passive?.label ?? '';
    const cond = String(passive?.condition ?? passive?.cond ?? '').trim();
    if (cond) result.push({ id, label, cond });
    for (const part of passive?.parts ?? []) {
      const partCond = String(part?.cond ?? '').trim();
      if (partCond) result.push({ id, label, cond: partCond, isPart: true });
    }
  }
  return result;
}

function dumpPartyBefore(state) {
  return (state?.party ?? []).map((member, partyIndex) => ({
    partyIndex,
    characterId: member?.characterId ?? '',
    styleId: member?.styleId ?? member?.id ?? '',
    position: Number(member?.position ?? -1),
    sp: {
      current: Number(member?.sp?.current ?? 0),
      min: Number(member?.sp?.min ?? 0),
      max: Number(member?.sp?.max ?? 0),
      bonus: Number(member?.sp?.bonus ?? 0),
    },
    isActionDisabled: Boolean(member?.isActionDisabled ?? false),
    actionDisabledTurns: Number(member?.actionDisabledTurns ?? 0),
    isReinforcedMode: Boolean(member?.isReinforcedMode ?? false),
    reinforcedTurnsRemaining: Number(member?.reinforcedTurnsRemaining ?? 0),
    passiveCount: (member?.passives ?? []).length,
  }));
}

function dumpEnemiesBefore(state) {
  // 正しいパス: state.turnState.enemyState
  const enemyState = state?.turnState?.enemyState ?? {};
  const enemyCount = Number(enemyState?.enemyCount ?? 0);
  const enemyNamesByEnemy =
    enemyState?.enemyNamesByEnemy && typeof enemyState.enemyNamesByEnemy === 'object'
      ? enemyState.enemyNamesByEnemy
      : {};
  const allStatuses = Array.isArray(enemyState?.statuses) ? enemyState.statuses : [];

  const result = [];
  for (let ei = 0; ei < enemyCount; ei += 1) {
    const damageRates = enemyState?.damageRatesByEnemy?.[ei] ?? null;
    const destructionRate = enemyState?.destructionRateByEnemy?.[ei] ?? null;
    const odRate = enemyState?.odRateByEnemy?.[ei] ?? null;
    const breakState = enemyState?.breakStateByEnemy?.[ei] ?? null;
    const eShieldState = enemyState?.eShieldStateByEnemy?.[ei] ?? null;
    const extraHpGauge = enemyState?.extraHpGaugeStateByEnemy?.[ei] ?? null;

    const statuses = allStatuses
      .filter((s) => Number(s?.targetIndex ?? -1) === ei)
      .map((s) => ({
        statusType: String(s?.statusType ?? ''),
        remainingTurns: Number(s?.remainingTurns ?? s?.remaining ?? 0),
        ...(s?.resolvedPower != null ? { resolvedPower: Number(s.resolvedPower) } : {}),
        ...(s?.sourceSkillId != null ? { sourceSkillId: Number(s.sourceSkillId) } : {}),
        ...(s?.sourceSkillName ? { sourceSkillName: String(s.sourceSkillName) } : {}),
      }));

    result.push({
      enemyIndex: ei,
      enemyName: String(enemyNamesByEnemy[ei] ?? ''),
      ...(damageRates != null ? { damageRatesByEnemy: damageRates } : {}),
      ...(destructionRate != null ? { destructionRateByEnemy: destructionRate } : {}),
      ...(odRate != null ? { odRateByEnemy: odRate } : {}),
      ...(breakState != null ? { breakStateByEnemy: breakState } : {}),
      ...(eShieldState != null ? { eShieldStateByEnemy: eShieldState } : {}),
      ...(extraHpGauge != null ? { extraHpGaugeStateByEnemy: extraHpGauge } : {}),
      statusCount: statuses.length,
      statuses,
    });
  }
  return result;
}

function dumpPassiveConditions(store, stateBefore) {
  const party = stateBefore?.party ?? [];
  const results = [];
  for (const member of party) {
    const styleId = member?.styleId ?? member?.id ?? '';
    if (!styleId) continue;
    const condList = collectPassiveConds(store, member);
    for (const { id, label, cond, isPart } of condList) {
      const evaled = evaluateConditionExpression(cond, stateBefore, member, null, null);
      results.push({
        styleId,
        passiveId: id,
        label,
        condition: cond,
        ...(isPart ? { isPart: true } : {}),
        result: evaled.result,
        knownCount: Number(evaled.knownCount ?? 0),
        unknownCount: Number(evaled.unknownCount ?? 0),
        ...(evaled.parseError ? { parseError: evaled.parseError } : {}),
      });
    }
  }
  return results;
}

const ATTACK_PART_TYPE_SET = new Set([
  'AttackNormal', 'AttackSkill', 'DamageRateChangeAttackSkill',
  'PenetrationCriticalAttack', 'PenetrationNormalAttack', 'PenetrationSkill',
  'TokenAttack', 'AttackBySp', 'AttackByOwnDpRate', 'FixedHpDamageRateAttack',
]);

function findAttackPowerInParts(parts) {
  for (const part of (Array.isArray(parts) ? parts : [])) {
    if (ATTACK_PART_TYPE_SET.has(String(part?.skill_type ?? '').trim()) && part.power != null) {
      return part.power;
    }
    if (Array.isArray(part?.strval)) {
      const nested = findAttackPowerInParts(part.strval.filter((v) => v && typeof v === 'object'));
      if (nested != null) return nested;
    }
  }
  return null;
}

function getSkillAttackPower(store, skillId) {
  const skill = store.getSkillById(Number(skillId));
  if (!skill) return null;
  return findAttackPowerInParts(skill.parts ?? []);
}

function dumpDamageInfo(action, store) {
  const skillBasePower = getSkillAttackPower(store, action?.skillId);

  const pm = action?.specialPassiveModifiers;
  const passiveModifiers = pm ? {
    attackUpRate: Number(pm.attackUpRate ?? 0),
    defenseUpRate: Number(pm.defenseUpRate ?? 0),
    criticalRateUpRate: Number(pm.criticalRateUpRate ?? 0),
    criticalDamageUpRate: Number(pm.criticalDamageUpRate ?? 0),
    ...(Number(pm.markAttackUpRate ?? 0) !== 0 ? { markAttackUpRate: Number(pm.markAttackUpRate) } : {}),
    ...(Number(pm.markCriticalRateUp ?? 0) !== 0 ? { markCriticalRateUp: Number(pm.markCriticalRateUp) } : {}),
    ...(Number(pm.markCriticalDamageUp ?? 0) !== 0 ? { markCriticalDamageUp: Number(pm.markCriticalDamageUp) } : {}),
    ...(Number(pm.zonePowerRate ?? 0) !== 0 ? { zonePowerRate: Number(pm.zonePowerRate) } : {}),
    ...(Number(pm.tokenAttackContext?.totalRate ?? action?.tokenAttackContext?.totalRate ?? 0) !== 0
      ? { tokenAttackTotalRate: Number(action?.tokenAttackContext?.totalRate ?? 0) } : {}),
  } : null;

  const dc = action?.damageContext;
  let damageByEnemy = null;
  if (dc) {
    const targetBreakdowns = dc?.damageBreakdown?.targetBreakdowns ?? [];
    if (targetBreakdowns.length > 0) {
      damageByEnemy = targetBreakdowns.map((tb) => ({
        enemyIndex: Number(tb.targetEnemyIndex ?? 0),
        finalMultiplier: Number(tb.finalMultiplier ?? 0),
        increasePercent: Number(tb.increasePercent ?? 0),
        ...(dc.effectiveDamageRatesByEnemy?.[String(tb.targetEnemyIndex)] != null
          ? { effectiveDamageRate: Number(dc.effectiveDamageRatesByEnemy[String(tb.targetEnemyIndex)]) }
          : {}),
      }));
    }
  }

  return {
    ...(skillBasePower != null ? { skillBasePower } : {}),
    ...(passiveModifiers != null ? { passiveModifiers } : {}),
    ...(damageByEnemy != null ? { damageByEnemy } : {}),
  };
}

function dumpAction(action, store) {
  const followUps = Array.isArray(action?.followUps) && action.followUps.length > 0
    ? action.followUps.map((fu) => ({
        characterId: String(fu?.characterId ?? ''),
        characterName: String(fu?.characterName ?? ''),
        skillId: String(fu?.skillId ?? ''),
        skillName: String(fu?.skillName ?? ''),
        spCost: Number(fu?.spCost ?? 0),
        odGaugeGain: Number(fu?.odGaugeGain ?? 0),
      }))
    : undefined;

  return {
    characterId: String(action?.characterId ?? ''),
    characterName: String(action?.characterName ?? ''),
    skillId: String(action?.skillId ?? ''),
    skillName: String(action?.skillName ?? ''),
    spCost: Number(action?.spCost ?? 0),
    odGaugeGain: Number(action?.odGaugeGain ?? 0),
    skillHitCount: Number(action?.skillHitCount ?? 0),
    skillBaseHitCount: Number(action?.skillBaseHitCount ?? 0),
    ...dumpDamageInfo(action, store),
    ...(action?.dpDamageByEnemy != null ? { dpDamageByEnemy: action.dpDamageByEnemy } : {}),
    ...(followUps ? { followUps } : {}),
  };
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

  const records = manager.computedRecords;
  const diagnostics = manager.replayDiagnostics;

  const turnDumps = [];

  for (let i = 0; i < records.length; i += 1) {
    const record = records[i];
    const stateBefore = manager.getStateBefore(i);
    const replayTurn = manager.getReplayTurn(i);

    if (!stateBefore) continue;

    const note = String(replayTurn?.note ?? '').trim();
    const warnings = Array.isArray(diagnostics?.turnWarnings?.[i])
      ? diagnostics.turnWarnings[i]
      : [];

    const odGaugeAtStart = Number(record?.odGaugeAtStart ?? 0);
    const odGaugeAtEnd = Number(record?.projections?.odGaugeAtEnd ?? odGaugeAtStart);
    const turnType = String(record?.turnType ?? 'normal');
    const odLevel = Number(record?.odLevel ?? 0);

    const partyBefore = dumpPartyBefore(stateBefore);
    const enemiesBefore = dumpEnemiesBefore(stateBefore);
    const passiveConditions = dumpPassiveConditions(store, stateBefore);
    const actions = (record?.actions ?? []).map((a) => dumpAction(a, store));

    const turnDump = {
      turnIndex: i,
      turnType,
      ...(odLevel > 0 ? { odLevel } : {}),
      odGaugeAtStart,
      odGaugeAtEnd,
      ...(note ? { note } : {}),
      ...(warnings.length > 0 ? { warnings } : {}),
      partyBefore,
      enemiesBefore,
      passiveConditions: passiveConditions.length > 0 ? passiveConditions : [],
      actions: actions.length > 0 ? actions : [],
      ...(record == null ? { error: 'commitFailed' } : {}),
    };

    turnDumps.push(turnDump);

    if (args.verbose) {
      const unknownConds = passiveConditions.filter((c) => c.unknownCount > 0 || c.parseError);
      process.stderr.write(
        `Turn ${String(i + 1).padStart(2)} | type=${turnType} | ` +
        `od=${odGaugeAtStart.toFixed(1)}→${odGaugeAtEnd.toFixed(1)}% | ` +
        `actions=${actions.length} | condEvals=${passiveConditions.length}` +
        (unknownConds.length > 0 ? ` | ⚠ unknownConds=${unknownConds.length}` : '') +
        (warnings.length > 0 ? ` | warnings=${warnings.length}` : '') +
        '\n'
      );
    }
  }

  const output = {
    sessionPath,
    committedTurnCount: records.length,
    replayDiagnostics: {
      setupWarnings: diagnostics?.setupWarnings ?? [],
      ...(diagnostics?.error ? { error: diagnostics.error } : {}),
      appliedTurnCount: diagnostics?.appliedTurnCount ?? records.length,
    },
    turns: turnDumps,
  };

  const jsonString = JSON.stringify(output, null, 2) + '\n';

  if (args.output) {
    const outputPath = path.resolve(args.output);
    fs.writeFileSync(outputPath, jsonString, 'utf8');
    if (args.verbose) {
      process.stderr.write(`\n出力: ${outputPath}\n`);
    }
  } else {
    process.stdout.write(jsonString);
  }
}

main();
