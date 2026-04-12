#!/usr/bin/env node

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { JSDOM } from 'jsdom';

import { HbrDataStore } from '../src/data/hbr-data-store.js';
import { BattleStateManager } from '../ui-next/engine/battle-state-manager.js';
import { TurnEngineManager } from '../ui-next/engine/turn-engine-manager.js';
import { normalizeSessionSnapshot } from '../ui-next/utils/session-snapshot.js';
import { buildEnemyStatusTableHtml } from '../ui-next/utils/enemy-status-display.js';

const DEFAULT_ROW_NUMBER = 19;

function parseArgs(argv) {
  const args = {
    original: null,
    stripped: null,
    row: DEFAULT_ROW_NUMBER,
    output: null,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === '--original') {
      args.original = argv[index + 1] ?? null;
      index += 1;
      continue;
    }
    if (token === '--stripped') {
      args.stripped = argv[index + 1] ?? null;
      index += 1;
      continue;
    }
    if (token === '--row') {
      args.row = Number(argv[index + 1] ?? DEFAULT_ROW_NUMBER);
      index += 1;
      continue;
    }
    if (token === '--output') {
      args.output = argv[index + 1] ?? null;
      index += 1;
      continue;
    }
  }

  if (!args.original || !args.stripped) {
    throw new Error(
      'Usage: node scripts/compare-session-enemy-popup-output.mjs --original <session.json> --stripped <session.json> [--row <n>] [--output <report.json>]'
    );
  }

  if (!Number.isInteger(args.row) || args.row <= 0) {
    throw new Error(`--row must be a positive integer. received=${args.row}`);
  }

  return args;
}

function buildDefaultOutputPath(originalPath) {
  const baseName = path.basename(originalPath, path.extname(originalPath));
  return path.join(
    process.cwd(),
    'test-results',
    'override-entry-comparison',
    `${baseName}.enemy-popup-comparison.json`
  );
}

function normalizeText(value) {
  return String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim();
}

function diffValues(left, right, pathLabel = 'root', differences = []) {
  const leftIsArray = Array.isArray(left);
  const rightIsArray = Array.isArray(right);
  if (leftIsArray || rightIsArray) {
    if (!(leftIsArray && rightIsArray)) {
      differences.push({ path: pathLabel, left, right });
      return differences;
    }
    const maxLength = Math.max(left.length, right.length);
    for (let index = 0; index < maxLength; index += 1) {
      diffValues(left[index], right[index], `${pathLabel}[${index}]`, differences);
    }
    return differences;
  }

  const leftIsObject = Boolean(left) && typeof left === 'object';
  const rightIsObject = Boolean(right) && typeof right === 'object';
  if (leftIsObject || rightIsObject) {
    if (!(leftIsObject && rightIsObject)) {
      differences.push({ path: pathLabel, left, right });
      return differences;
    }
    const keys = [...new Set([...Object.keys(left), ...Object.keys(right)])].sort();
    for (const key of keys) {
      diffValues(left[key], right[key], `${pathLabel}.${key}`, differences);
    }
    return differences;
  }

  if (left !== right) {
    differences.push({ path: pathLabel, left, right });
  }
  return differences;
}

function parseStatusBlocksFromHtml(html) {
  const dom = new JSDOM(`<!doctype html><body>${html}</body>`);
  const blocks = [...dom.window.document.querySelectorAll('.char-popup-buff-block')];
  return blocks.map((block) => ({
    title: normalizeText(block.querySelector('.char-popup-buff-title')?.textContent ?? ''),
    description: normalizeText(block.querySelector('.char-popup-buff-desc')?.textContent ?? ''),
    duration: normalizeText(block.querySelector('.char-popup-buff-duration')?.textContent ?? ''),
    text: normalizeText(block.textContent ?? ''),
  }));
}

function loadSessionFromText(text) {
  return normalizeSessionSnapshot(JSON.parse(text));
}

function buildManagerForSession(session, store) {
  const battleStateManager = new BattleStateManager({ store });
  const initialState = battleStateManager.buildFromSnapshot(session.setup, session.enemy ?? {});
  const manager = new TurnEngineManager();
  manager.loadReplayScript(initialState, session.replayScript, {
    validationPolicy: session.validationPolicy,
  });
  return { initialState, manager };
}

function collectEnemyPopupSnapshot(session, store, rowNumber) {
  const { manager } = buildManagerForSession(session, store);
  const turnIndex = rowNumber - 1;
  const stateBefore = manager.getStateBefore(turnIndex);
  const replayTurn = manager.getReplayTurn(turnIndex);
  const enemyState = stateBefore?.turnState?.enemyState ?? {};
  const enemyCount = Number(enemyState?.enemyCount ?? 0);
  const enemyNamesByEnemy =
    enemyState?.enemyNamesByEnemy && typeof enemyState.enemyNamesByEnemy === 'object'
      ? enemyState.enemyNamesByEnemy
      : {};
  const allStatuses = Array.isArray(enemyState?.statuses) ? enemyState.statuses : [];

  const enemyOutputs = [];
  for (let enemyIndex = 0; enemyIndex < enemyCount; enemyIndex += 1) {
    const statuses = allStatuses.filter((status) => Number(status?.targetIndex ?? -1) === enemyIndex);
    const statusHtml = buildEnemyStatusTableHtml(statuses, {
      resolveSkillDescription: (skillId) => store.resolveSkillDescription(skillId),
    });
    enemyOutputs.push({
      enemyIndex,
      enemyName: String(enemyNamesByEnemy[enemyIndex] ?? ''),
      statusCount: statuses.length,
      statusBlocks: parseStatusBlocksFromHtml(statusHtml),
      statusListText: normalizeText(new JSDOM(`<!doctype html><body>${statusHtml}</body>`).window.document.body.textContent ?? ''),
      statuses: statuses.map((status) => ({
        statusType: String(status?.statusType ?? ''),
        sourceSkillId: Number(status?.sourceSkillId ?? NaN),
        sourceSkillName: String(status?.sourceSkillName ?? ''),
        sourceSkillDesc: String(status?.sourceSkillDesc ?? ''),
        remaining: Number(status?.remaining ?? status?.remainingTurns ?? 0),
        exitCond: String(status?.exitCond ?? ''),
      })),
    });
  }

  return {
    committedRowCount: manager.computedRecords.length,
    targetRowIndex: rowNumber,
    replayTurnNumber: Number(replayTurn?.turn ?? rowNumber),
    enemyCount,
    enemyOutputs,
  };
}

async function main() {
  const { original, stripped, row, output } = parseArgs(process.argv.slice(2));
  const originalPath = path.resolve(original);
  const strippedPath = path.resolve(stripped);
  const outputPath = path.resolve(output ?? buildDefaultOutputPath(originalPath));

  const store = HbrDataStore.fromJsonDirectory('json');
  const originalSession = loadSessionFromText(await readFile(originalPath, 'utf8'));
  const strippedSession = loadSessionFromText(await readFile(strippedPath, 'utf8'));

  const originalSnapshot = collectEnemyPopupSnapshot(originalSession, store, row);
  const strippedSnapshot = collectEnemyPopupSnapshot(strippedSession, store, row);
  const differences = diffValues(originalSnapshot, strippedSnapshot);

  const report = {
    originalPath,
    strippedPath,
    targetRowIndex: row,
    identical: differences.length === 0,
    differenceCount: differences.length,
    differences,
    originalSnapshot,
    strippedSnapshot,
  };

  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

  process.stdout.write(`${JSON.stringify({
    outputPath,
    identical: report.identical,
    differenceCount: report.differenceCount,
  }, null, 2)}\n`);
}

main().catch((error) => {
  process.stderr.write(`${String(error?.stack ?? error ?? 'Unknown error')}\n`);
  process.exitCode = 1;
});
