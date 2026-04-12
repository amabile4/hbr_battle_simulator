#!/usr/bin/env node

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

function parseArgs(argv) {
  const args = {
    input: null,
    output: null,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === '--input') {
      args.input = argv[index + 1] ?? null;
      index += 1;
      continue;
    }
    if (token === '--output') {
      args.output = argv[index + 1] ?? null;
      index += 1;
      continue;
    }
  }

  if (!args.input) {
    throw new Error('Usage: node scripts/strip-session-override-entries.mjs --input <session.json> [--output <output.json>]');
  }

  return args;
}

function buildDefaultOutputPath(inputPath) {
  const baseName = path.basename(inputPath, path.extname(inputPath));
  return path.join(
    process.cwd(),
    'test-results',
    'override-entry-comparison',
    `${baseName}.without-override-entries.json`
  );
}

function stripOverrideEntries(session = {}) {
  const replayScript = session?.replayScript ?? {};
  const turns = Array.isArray(replayScript?.turns) ? replayScript.turns : [];

  let turnsWithOverrideEntries = 0;
  let removedOverrideEntryCount = 0;
  const removedOverrideEntriesByType = {};

  const strippedTurns = turns.map((turn) => {
    const nextTurn = structuredClone(turn);
    const overrideEntries = Array.isArray(nextTurn?.overrideEntries) ? nextTurn.overrideEntries : [];

    if (overrideEntries.length > 0) {
      turnsWithOverrideEntries += 1;
      removedOverrideEntryCount += overrideEntries.length;
      for (const entry of overrideEntries) {
        const type = String(entry?.type ?? 'Unknown');
        removedOverrideEntriesByType[type] = Number(removedOverrideEntriesByType[type] ?? 0) + 1;
      }
      delete nextTurn.overrideEntries;
    }

    return nextTurn;
  });

  const strippedSession = structuredClone(session);
  strippedSession.replayScript = {
    ...structuredClone(replayScript),
    turns: strippedTurns,
  };

  return {
    strippedSession,
    summary: {
      turnCount: turns.length,
      turnsWithOverrideEntries,
      removedOverrideEntryCount,
      removedOverrideEntriesByType,
    },
  };
}

async function main() {
  const { input, output } = parseArgs(process.argv.slice(2));
  const inputPath = path.resolve(input);
  const outputPath = path.resolve(output ?? buildDefaultOutputPath(inputPath));

  const raw = await readFile(inputPath, 'utf8');
  const session = JSON.parse(raw);
  const { strippedSession, summary } = stripOverrideEntries(session);

  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(strippedSession, null, 2)}\n`, 'utf8');

  process.stdout.write(`${JSON.stringify({
    inputPath,
    outputPath,
    ...summary,
  }, null, 2)}\n`);
}

main().catch((error) => {
  process.stderr.write(`${String(error?.stack ?? error ?? 'Unknown error')}\n`);
  process.exitCode = 1;
});
