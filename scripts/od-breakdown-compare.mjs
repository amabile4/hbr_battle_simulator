/**
 * od-breakdown-compare.mjs
 *
 * 特定ターンを対象に、NoteベースのOD増加ステップと
 * 計算（record.actions）ベースのOD増加ステップを行動単位で並列比較する。
 *
 * Usage:
 *   node scripts/od-breakdown-compare.mjs <session-json> [turn,turn,...]
 *   node scripts/od-breakdown-compare.mjs <session-json>  # → デフォルト 5,7,10,16
 */
import fs from 'node:fs';
import path from 'node:path';

import { HbrDataStore } from '../src/index.js';
import { BattleStateManager } from '../ui-next/engine/battle-state-manager.js';
import { TurnEngineManager } from '../ui-next/engine/turn-engine-manager.js';
import { normalizeSessionSnapshot } from '../ui-next/utils/session-snapshot.js';

// ─── helpers ──────────────────────────────────────────────────────────────────

function truncDisplay(v) {
  const n = Number(v);
  return Number.isFinite(n) ? (n >= 0 ? Math.floor(n) : Math.ceil(n)) : NaN;
}

function fmt2(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n.toFixed(2) : 'NaN';
}

function sign(v) {
  return v >= 0 ? `+${v.toFixed(2)}` : v.toFixed(2);
}

const START_MARKER_RE = /変化なし|割り込みOD|前衛にいるパッシブ/;

/**
 * Noteの改行（または|）区切り文字列を解析してステップリストを返す。
 * 複合トークン例: "ユキ=78(ブレイク)→100" → 最終値100を使用
 * @returns { steps: { label, value, inc: number|null, isMarker: bool, raw: string }[], finalValue: number|null }
 */
function parseNoteSteps(note, prevEnd) {
  const tokens = String(note ?? '')
    .split(/\n|\|/)
    .map((s) => s.trim())
    .filter(Boolean);

  const steps = [];
  let prev = prevEnd;

  for (const token of tokens) {
    // トークン内の全数値を抽出（+N は増加量なのでスキップ）
    // 1) 区切り付き形式: "ユキ=78→100", "あおい→85"
    const reSep = /[=→]\s*(\+?)(\d+(?:\.\d+)?)/g;
    const matches = [];
    let m;
    while ((m = reSep.exec(token)) !== null) {
      if (m[1] === '+') continue;
      matches.push(Number(m[2]));
    }
    // 2) 区切りなし形式: "山脇19", "あおい85", "超越201", "騎兵起動40"
    if (matches.length === 0) {
      const bareM = /^(.+?)(\d+(?:\.\d+)?)\s*$/.exec(token);
      if (bareM) {
        matches.push(Number(bareM[2]));
      }
    }
    if (matches.length === 0) continue;

    // ラベル: 最初の = か → より前の部分、なければ数値より前の部分
    const labelM = /^(.+?)\s*[=→]/.exec(token);
    const bareLabel = /^(.+?)\s*\d+(?:\.\d+)?\s*$/.exec(token);
    const label = labelM ? labelM[1].trim() : bareLabel ? bareLabel[1].trim() : token.trim();

    // 最終値が「このステップ完了後のOD値」
    const value = matches[matches.length - 1];
    const isMarker = START_MARKER_RE.test(label);

    if (isMarker) {
      steps.push({ label, value, inc: 0, isMarker: true, raw: token });
      prev = value;
    } else {
      const inc = prev != null ? value - prev : null;
      steps.push({ label, value, inc, isMarker: false, raw: token });
      prev = value;
    }
  }

  return { steps, finalValue: prev };
}

/**
 * record.actions を行動ステップに変換する。
 * 追撃付き行動は1エントリとして扱う（内訳をラベルに付与）。
 */
function buildCalcSteps(record, startOd) {
  const steps = [];
  let running = startOd;

  for (const action of record?.actions ?? []) {
    const gain = Number(action?.odGaugeGain ?? 0);
    running = running + gain;

    const name = String(action?.characterName ?? action?.characterId ?? '?');
    const skill = String(action?.skillName ?? action?.skillId ?? '?');
    const bh = Number(action?.breakHitCount ?? 0);
    const ph = Number(action?.pursuedHitCount ?? 0);

    const tags = [];
    if (bh > 0) tags.push(`BREAK×${bh}`);
    if (ph > 0) tags.push(`PURSUIT×${ph}`);
    const tagStr = tags.length > 0 ? ` [${tags.join(' ')}]` : '';

    steps.push({
      label: `${name} / ${skill}${tagStr}`,
      gain,
      after: running,
      afterDisplay: truncDisplay(running),
    });
  }

  return steps;
}

/**
 * リプレイスクリプトのターン内容（slots / overrideEntries）を表示用に整形する。
 */
function buildScriptSteps(turn) {
  const slots = (turn?.slots ?? []).filter((s) => s.skillId != null);
  const followUpOverrides = (turn?.overrideEntries ?? [])
    .filter((e) => e.type === 'FollowUpOverrides')
    .flatMap((e) => e.payload ?? []);
  const actionOutcomes = (turn?.overrideEntries ?? [])
    .filter((e) => e.type === 'ActionOutcomeOverrides')
    .flatMap((e) => e.payload ?? []);

  return slots.map((slot, slotIdx) => {
    const tags = [];
    const fups = followUpOverrides.filter((f) => Number(f.position) === slotIdx);
    if (fups.length > 0) tags.push(`followUp×${fups.length}`);
    const outcomes = actionOutcomes.filter((o) => Number(o.position) === slotIdx);
    if (outcomes.length > 0) tags.push(outcomes.map((o) => `outcome=${o.outcome}`).join(','));
    return `styleId=${slot.styleId} skillId=${slot.skillId}${tags.length ? ' [' + tags.join(' ') + ']' : ''}`;
  });
}

// ─── main ─────────────────────────────────────────────────────────────────────

function main() {
  const inputPath = process.argv[2];
  if (!inputPath) {
    console.error('Usage: node scripts/od-breakdown-compare.mjs <session-json> [turn,turn,...]');
    process.exit(1);
  }

  const targetTurns = process.argv[3]
    ? process.argv[3].split(',').map(Number).filter((n) => Number.isFinite(n) && n > 0)
    : null;

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

  // prevNoteEnd: 前ターンNote最終値（整数）
  let prevNoteEnd = null;

  // 全ターンを順に処理して prevNoteEnd を維持しつつ、対象ターンだけ詳細表示
  for (let i = 0; i < manager.computedRecords.length; i++) {
    const turnNo = i + 1;
    const record = manager.computedRecords[i];
    const scriptTurn = session.replayScript?.turns?.[i] ?? {};
    const note = String(scriptTurn?.note ?? '');
    const { steps: noteSteps, finalValue: noteEnd } = parseNoteSteps(note, prevNoteEnd);

    if (targetTurns && !targetTurns.includes(turnNo)) {
      // prevNoteEnd の更新のみ行い詳細表示はスキップ
      if (noteEnd != null) prevNoteEnd = noteEnd;
      continue;
    }

    const startOd = Number(record?.odGaugeAtStart ?? 0);
    const endOd = Number(record?.projections?.odGaugeAtEnd ?? startOd);

    // ── Note 側の開始値を特定
    let noteStart = null;
    const firstToken = (note.split('|')[0] ?? '').trim();
    if (noteSteps.length >= 1 && START_MARKER_RE.test(firstToken)) {
      noteStart = noteSteps[0].value;
    } else if (prevNoteEnd != null) {
      noteStart = prevNoteEnd;
    } else if (noteSteps.length >= 1) {
      noteStart = noteSteps[0].value;
    }
    const noteEndVal = noteSteps.length > 0 ? noteSteps[noteSteps.length - 1].value : null;
    const noteTotal = noteStart != null && noteEndVal != null ? noteEndVal - noteStart : null;
    const calcTotal = truncDisplay(endOd) - truncDisplay(startOd);

    console.log('');
    console.log(`${'═'.repeat(70)}`);
    console.log(`  Turn ${String(turnNo).padStart(2, '0')}`);
    console.log(`${'═'.repeat(70)}`);
    console.log(`  CALC  start=${fmt2(startOd)} (${truncDisplay(startOd)}%)  end=${fmt2(endOd)} (${truncDisplay(endOd)}%)`);
    console.log(`  NOTE  start=${noteStart}  end=${noteEndVal}`);
    console.log(`  DIFF  note=${noteTotal != null ? `+${noteTotal}` : '?'}  calc=+${calcTotal}  Δ=${noteTotal != null ? noteTotal - calcTotal : '?'}`);

    // ── リプレイスクリプト行動 ──
    const scriptSteps = buildScriptSteps(scriptTurn);
    console.log('');
    console.log('  [SCRIPT actions]');
    if (scriptSteps.length === 0) {
      console.log('    (none)');
    } else {
      scriptSteps.forEach((s, idx) => console.log(`    ${String(idx + 1).padStart(2)}: ${s}`));
    }

    // ── Note ステップ ──
    console.log('');
    console.log('  [NOTE steps]');
    let prevNoteVal = noteStart;
    noteSteps.forEach((step, idx) => {
      const incStr = step.isMarker
        ? '(開始値)'
        : step.inc != null
          ? sign(step.inc).padStart(8)
          : '   (N/A)';
      const marker = step.isMarker ? '★' : ' ';
      console.log(
        `  ${marker} ${String(idx + 1).padStart(2)}: ${String(step.label).padEnd(20)} val=${String(step.value).padStart(5)}  inc=${incStr}`
      );
      prevNoteVal = step.value;
    });
    if (noteSteps.length === 0) {
      console.log('    (Noteなし)');
    }

    // ── Calc ステップ ──
    const calcSteps = buildCalcSteps(record, startOd);
    console.log('');
    console.log('  [CALC steps]');
    calcSteps.forEach((step, idx) => {
      console.log(
        `    ${String(idx + 1).padStart(2)}: ${String(step.label).padEnd(50)} gain=${sign(step.gain).padStart(8)}  after=${fmt2(step.after)} (${String(step.afterDisplay).padStart(3)}%)`
      );
    });
    if (calcSteps.length === 0) {
      console.log('    (なし)');
    }

    // ── passiveEvents (OD関連) ──
    const passiveOdEvents = (record?.passiveEvents ?? []).filter((e) => {
      const types = e.effectTypes ?? [];
      return (
        types.some((t) => String(t).includes('OverDrive')) ||
        Number(e.odGaugeDelta ?? e.odGain ?? 0) !== 0
      );
    });
    if (passiveOdEvents.length > 0) {
      console.log('');
      console.log('  [passiveEvents OD関連]');
      for (const e of passiveOdEvents) {
        const od = e.odGaugeDelta ?? e.odGain ?? 0;
        console.log(
          `    name=${String(e.passiveName ?? '').padEnd(20)} effectTypes=${JSON.stringify(e.effectTypes)}  od=${od}`
        );
      }
    }

    // ── ステップ対応表 (Note vs Calc 並列) ──
    console.log('');
    console.log('  [STEP 対応表]  (行数が一致しない場合は手動で対応させて確認)');
    const maxLen = Math.max(noteSteps.length, calcSteps.length);
    console.log(
      `  ${'#'.padEnd(3)}  ${'NOTE label (inc)'.padEnd(38)}  ${'CALC label (gain)'.padEnd(56)}  MATCH?`
    );
    console.log(`  ${'-'.repeat(110)}`);
    for (let j = 0; j < maxLen; j++) {
      const ns = noteSteps[j];
      const cs = calcSteps[j];

      const noteCol =
        ns != null
          ? `${String(ns.label).padEnd(20)} (inc=${ns.inc != null ? sign(ns.inc) : '  N/A'})`
          : '---'.padEnd(38);
      const calcCol =
        cs != null
          ? `${String(cs.label).padEnd(44)} gain=${sign(cs.gain)}`
          : '---'.padEnd(56);

      let match = '';
      if (ns != null && cs != null && !ns.isMarker) {
        const noteInc = ns.inc ?? 0;
        const calcGain = cs.gain;
        const diff = noteInc - calcGain;
        if (Math.abs(diff) < 0.005) {
          match = ' ✓';
        } else {
          match = ` ✗ Δ=${sign(diff)}`;
        }
      }

      console.log(`  ${String(j + 1).padEnd(3)}  ${noteCol.padEnd(38)}  ${calcCol.padEnd(56)}  ${match}`);
    }

    console.log('');

    if (noteEnd != null) prevNoteEnd = noteEnd;
  }
}

main();
