import fs from 'node:fs';
import path from 'node:path';

import { HbrDataStore } from '../src/index.js';
import { BattleStateManager } from '../ui-next/engine/battle-state-manager.js';
import { TurnEngineManager } from '../ui-next/engine/turn-engine-manager.js';
import { normalizeSessionSnapshot } from '../ui-next/utils/session-snapshot.js';

function truncDisplay(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return n >= 0 ? Math.floor(n) : Math.ceil(n);
}

function format2(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 'NaN';
  return n.toFixed(2);
}

function main() {
  const inputPath = process.argv[2];
  if (!inputPath) {
    console.error('Usage: node scripts/verify-session-od.mjs <session-json-path>');
    process.exit(1);
  }

  const sessionPath = path.resolve(inputPath);
  const text = fs.readFileSync(sessionPath, 'utf8');
  const raw = JSON.parse(text);
  const session = normalizeSessionSnapshot(raw);

  const store = HbrDataStore.fromJsonDirectory('json');
  const battleStateManager = new BattleStateManager({ store });
  const initialState = battleStateManager.buildFromSnapshot(session.setup, session.enemy);

  const manager = new TurnEngineManager();
  manager.loadReplayScript(initialState, session.replayScript, {
    validationPolicy: session.validationPolicy,
  });

  const turns = manager.computedRecords;
  for (let i = 0; i < turns.length; i += 1) {
    const record = turns[i];
    const note = String(session.replayScript?.turns?.[i]?.note ?? '').replace(/\n/g, ' | ');
    const start = Number(record?.odGaugeAtStart ?? 0);
    const end = Number(record?.projections?.odGaugeAtEnd ?? start);
    const transBonus = Number(record?.transcendence?.odGaugeBonusPercent ?? 0);

    console.log(`Turn ${String(i + 1).padStart(2, '0')}: start=${format2(start)} (${truncDisplay(start)}%) end=${format2(end)} (${truncDisplay(end)}%) transBonus=${format2(transBonus)}`);
    if (note.trim()) {
      console.log(`  note: ${note}`);
    }

    let running = start;
    for (const action of record?.actions ?? []) {
      const gain = Number(action?.odGaugeGain ?? 0);
      running = Number((running + gain).toFixed(2));
      const name = String(action?.characterName ?? action?.characterId ?? 'Unknown');
      const skill = String(action?.skillName ?? action?.skillId ?? 'UnknownSkill');
      console.log(`  - ${name} / ${skill}: gain=${format2(gain)} after=${format2(running)} (${truncDisplay(running)}%)`);
    }

    console.log('');
  }
}

main();
