/**
 * golden/master_json から全条件式を抽出し、golden/tests/fixtures/ に保存する。
 * 生成物: all_conditions.json, distinct_conditions.json, special_status_map.json
 *
 * 実行: node golden/tests/generate_fixtures.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { extractAllConditions, buildDistinctConditionSet } from '../src/cond-extract.js';
import { buildSpecialStatusTypeMap } from '../src/special-status-types.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const GOLDEN_ROOT = path.resolve(__dirname, '..');
const MASTER_DIR = path.join(GOLDEN_ROOT, 'master_json');
const FIXTURES_DIR = path.join(GOLDEN_ROOT, 'tests', 'fixtures');

fs.mkdirSync(FIXTURES_DIR, { recursive: true });

// 1. 全条件式レコードを抽出
const allRecords = extractAllConditions(MASTER_DIR);
fs.writeFileSync(
  path.join(FIXTURES_DIR, 'all_conditions.json'),
  JSON.stringify(allRecords, null, 2)
);

// 2. distinct セット
const distinct = buildDistinctConditionSet(allRecords);
fs.writeFileSync(
  path.join(FIXTURES_DIR, 'distinct_conditions.json'),
  JSON.stringify(distinct, null, 2)
);

// 3. SpecialStatusType 正本マップ
const ssRaw = JSON.parse(fs.readFileSync(path.join(MASTER_DIR, 'MasterSpecialStatus.json'), 'utf8'));
const ssMap = buildSpecialStatusTypeMap(ssRaw);
const ssObj = Object.fromEntries([...ssMap].map(([id, name]) => [id, name]));
fs.writeFileSync(
  path.join(FIXTURES_DIR, 'special_status_map.json'),
  JSON.stringify(ssObj, null, 2)
);

// サマリー
const summary = {
  totalRecords: allRecords.length,
  distinctByField: Object.fromEntries(
    Object.entries(distinct).map(([k, v]) => [k, Object.keys(v).length])
  ),
  specialStatusTypeCount: ssObj && Object.keys(ssObj).length,
};
console.log('Fixture generation complete:');
console.log(JSON.stringify(summary, null, 2));
