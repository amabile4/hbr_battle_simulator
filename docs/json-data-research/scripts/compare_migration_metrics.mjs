import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

const ROOT = '/Users/ram4/git/hbr_battle_simulator';
const CURRENT_METRICS_PATH = path.join(ROOT, 'json', 'reports', 'migration', 'migration_metrics.json');
const OUTPUT_REPORT_PATH = path.join(ROOT, 'json', 'reports', 'migration', 'migration_increment_report.json');

function readJsonFile(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function readHeadJson(relPath) {
  const cmd = `git show HEAD:${relPath} 2>/dev/null`;
  const text = execSync(cmd, { cwd: ROOT, encoding: 'utf8' });
  return JSON.parse(text);
}

function toNumber(v) {
  return Number.isFinite(Number(v)) ? Number(v) : 0;
}

function formatDelta(v, digits = 0) {
  const n = Number(v.toFixed(digits));
  return `${n >= 0 ? '+' : ''}${n}`;
}

const current = readJsonFile(CURRENT_METRICS_PATH);

let base;
let baseRef = 'HEAD:json/reports/migration/migration_metrics.json';
try {
  base = readHeadJson('json/reports/migration/migration_metrics.json');
} catch (err) {
  // Backward compatibility: HEAD may still have metrics at the old path before migration.
  try {
    baseRef = 'HEAD:json/migration_metrics.json';
    base = readHeadJson('json/migration_metrics.json');
  } catch (fallbackErr) {
    console.error('baseline read failed:', fallbackErr.message);
    process.exit(1);
  }
}

const keys = [
  'legacyRowCount',
  'candidateDistinctNameRowCount',
  'candidateRawSkillCount',
  'exactMatch',
  'nameMatchOnly',
  'unmatchedLegacyRows',
  'costMismatch',
  'typeMismatch',
  'candidateRowsNotInLegacy'
];

const rateKeys = ['exactMatchRate', 'nameLevelCoverage', 'mismatchRate', 'missingFieldImprovementRate'];

const comparison = {
  generatedAt: new Date().toISOString(),
  baseline: baseRef,
  delta: {}
};

for (const key of keys) {
  const before = toNumber(base.coverage?.[key]);
  const after = toNumber(current.coverage?.[key]);
  comparison.delta[key] = {
    before,
    after,
    diff: after - before
  };
}

for (const key of rateKeys) {
  const before = toNumber(base.coverage?.[key]);
  const after = toNumber(current.coverage?.[key]);
  comparison.delta[key] = {
    before,
    after,
    diff: after - before,
    diffPercentagePoint: (after - before) * 100
  };
}

const rcKeys = ['replaceable', 'needAdditionalImplementation', 'nonReplaceable'];
comparison.delta.replacementClassification = {};
for (const key of rcKeys) {
  const before = toNumber(base.replacementClassification?.[key]);
  const after = toNumber(current.replacementClassification?.[key]);
  comparison.delta.replacementClassification[key] = {
    before,
    after,
    diff: after - before
  };
}

fs.writeFileSync(OUTPUT_REPORT_PATH, JSON.stringify(comparison, null, 2));

console.log('baseline:', baseRef);
for (const key of keys) {
  const row = comparison.delta[key];
  console.log(`${key}: ${row.before} -> ${row.after} (${formatDelta(row.diff)})`);
}
for (const key of rateKeys) {
  const row = comparison.delta[key];
  console.log(
    `${key}: ${row.before.toFixed(6)} -> ${row.after.toFixed(6)} (${formatDelta(row.diffPercentagePoint, 3)} pt)`
  );
}
for (const key of rcKeys) {
  const row = comparison.delta.replacementClassification[key];
  console.log(`replacementClassification.${key}: ${row.before} -> ${row.after} (${formatDelta(row.diff)})`);
}
console.log('report:', path.relative(ROOT, OUTPUT_REPORT_PATH));
