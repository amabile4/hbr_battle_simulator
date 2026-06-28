import test from 'node:test';
import assert from 'node:assert/strict';

import {
  MASTER_CONDITION_FIELD_MAP,
  DEFAULT_CONDITION_SOURCE_FILES,
  VIEW_CONDITION_FIELDS,
  DEFAULT_VIEW_SOURCE_FILES,
  extractConditionsFromFile,
  extractAllConditions,
  extractConditionsFromViewFile,
  extractConditionsFromViewJson,
  buildDistinctConditionSet,
} from '../src/cond-extract.js';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const GOLDEN_ROOT = path.resolve(__dirname, '..');
const MASTER_DIR = path.join(GOLDEN_ROOT, 'master_json');
const VIEW_DIR = path.join(GOLDEN_ROOT, 'view_json');

test('MASTER_CONDITION_FIELD_MAP: master -> view/json の4フィールド対応', () => {
  assert.equal(MASTER_CONDITION_FIELD_MAP.condition, 'cond');
  assert.equal(MASTER_CONDITION_FIELD_MAP.overwriteSpCondition, 'overwrite_cond');
  assert.equal(MASTER_CONDITION_FIELD_MAP.targetCondition, 'target_condition');
  assert.equal(MASTER_CONDITION_FIELD_MAP.hitCondition, 'hit_condition');
});

test('DEFAULT_CONDITION_SOURCE_FILES: 主要マスターファイルを含む', () => {
  assert.ok(DEFAULT_CONDITION_SOURCE_FILES.includes('MasterSkill.json'));
  assert.ok(DEFAULT_CONDITION_SOURCE_FILES.includes('MasterSkillPart.json'));
  assert.ok(DEFAULT_CONDITION_SOURCE_FILES.includes('MasterPassiveSkill.json'));
});

test('extractConditionsFromFile: 存在しないファイルは空配列', () => {
  assert.deepEqual(extractConditionsFromFile('/nonexistent/file.json'), []);
});

test('extractConditionsFromFile: 不正 JSON は空配列', () => {
  const tmp = path.join(__dirname, 'fixtures', '_tmp_invalid.json');
  fs.writeFileSync(tmp, '{ not valid json');
  try {
    assert.deepEqual(extractConditionsFromFile(tmp), []);
  } finally {
    fs.unlinkSync(tmp);
  }
});

test('extractConditionsFromFile: ネストした condition を収集する', () => {
  const tmp = path.join(__dirname, 'fixtures', '_tmp_nested.json');
  fs.writeFileSync(
    tmp,
    JSON.stringify({
      items: [
        { id: 1, condition: 'IsFront()', parts: [{ id: 11, condition: 'Sp()>5' }] },
        { id: 2, overwriteSpCondition: 'IsOverDrive()', parts: [] },
        { id: 3, condition: '', parts: [{ id: 31, targetCondition: 'IsNatureElement(Fire)==1' }] },
      ],
    })
  );
  try {
    const records = extractConditionsFromFile(tmp);
    // 空文字は除外されるので IsFront, Sp()>5, IsOverDrive, IsNatureElement(Fire)==1 の 4 件
    assert.equal(records.length, 4);
    const fields = records.map((r) => r.field).sort();
    assert.deepEqual(fields, ['cond', 'cond', 'overwrite_cond', 'target_condition']);
  } finally {
    fs.unlinkSync(tmp);
  }
});

test('extractAllConditions: master_json 全体から条件式を抽出', () => {
  const records = extractAllConditions(MASTER_DIR);
  assert.ok(records.length > 100, `expected many records, got ${records.length}`);
  // 各レコードが file/field/expression を持つ
  for (const r of records.slice(0, 50)) {
    assert.ok(r.file);
    assert.ok(r.field);
    assert.ok(r.expression);
    assert.equal(typeof r.expression, 'string');
  }
});

test('buildDistinctConditionSet: フィールド別 distinct カウント', () => {
  const records = extractAllConditions(MASTER_DIR);
  const distinct = buildDistinctConditionSet(records);
  // 実データ基準の最低件数
  assert.ok(Object.keys(distinct.cond).length >= 150, 'cond should have >=150 distinct');
  assert.ok(Object.keys(distinct.overwrite_cond).length >= 30, 'overwrite_cond should have >=30 distinct');
  assert.ok(Object.keys(distinct.target_condition).length >= 50, 'target_condition should have >=50 distinct');
  assert.ok(Object.keys(distinct.hit_condition).length >= 5, 'hit_condition should have >=5 distinct');
});

test('buildDistinctConditionSet: フィールド別 distinct カウント', () => {
  const records = extractAllConditions(MASTER_DIR);
  const distinct = buildDistinctConditionSet(records);
  // 実データ基準の最低件数
  assert.ok(Object.keys(distinct.cond).length >= 150, 'cond should have >=150 distinct');
  assert.ok(Object.keys(distinct.overwrite_cond).length >= 30, 'overwrite_cond should have >=30 distinct');
  assert.ok(Object.keys(distinct.target_condition).length >= 50, 'target_condition should have >=50 distinct');
  assert.ok(Object.keys(distinct.hit_condition).length >= 5, 'hit_condition should have >=5 distinct');
});

// ===========================================================================
// view/json 用 API（本体移植時に使用）
// ===========================================================================

test('VIEW_CONDITION_FIELDS: 本体が使う正規フィールド名5種', () => {
  assert.deepEqual([...VIEW_CONDITION_FIELDS].sort(), [
    'cond', 'hit_condition', 'iuc_cond', 'overwrite_cond', 'target_condition',
  ]);
});

test('DEFAULT_VIEW_SOURCE_FILES: json/ と同名の6ファイル', () => {
  assert.ok(DEFAULT_VIEW_SOURCE_FILES.includes('skills.json'));
  assert.ok(DEFAULT_VIEW_SOURCE_FILES.includes('styles.json'));
  assert.ok(DEFAULT_VIEW_SOURCE_FILES.includes('passives.json'));
  assert.ok(DEFAULT_VIEW_SOURCE_FILES.includes('characters.json'));
});

test('extractConditionsFromViewFile: 存在しないファイルは空配列', () => {
  assert.deepEqual(extractConditionsFromViewFile('/nonexistent/file.json'), []);
});

test('extractConditionsFromViewFile: view_json/skills.json から cond/overwrite_cond を抽出（リネーム無し）', () => {
  const records = extractConditionsFromViewFile(path.join(VIEW_DIR, 'skills.json'));
  assert.ok(records.length > 10, `expected many records, got ${records.length}`);
  // フィールド名はそのまま（master の condition -> cond リネームは不要）
  const fields = new Set(records.map((r) => r.field));
  assert.ok(fields.has('cond') || fields.has('overwrite_cond') || fields.has('iuc_cond'));
  // master 用フィールド名（condition/overwriteSpCondition）は出現しない
  assert.ok(!fields.has('condition'));
  assert.ok(!fields.has('overwriteSpCondition'));
});

test('extractConditionsFromViewJson: view_json 全体から条件式を抽出', () => {
  const records = extractConditionsFromViewJson(VIEW_DIR);
  assert.ok(records.length > 50, `expected many records, got ${records.length}`);
  // 各レコードが file/field/expression を持つ
  for (const r of records.slice(0, 30)) {
    assert.ok(r.file);
    assert.ok(r.field);
    assert.ok(r.expression);
  }
  // ファイル名は view/json 形式（skills.json 等）。Master*.json は出現しない
  const fileNames = new Set(records.map((r) => r.file));
  assert.ok(fileNames.has('skills.json') || fileNames.has('styles.json'));
});

test('extractConditionsFromViewJson: フィールド別 distinct カウント（本体運用データ基準）', () => {
  const records = extractConditionsFromViewJson(VIEW_DIR);
  const distinct = buildDistinctConditionSet(records);
  // view_json は master の抜粋だが、主要フィールドは含まれる
  assert.ok(distinct.cond, 'should have cond');
  assert.ok(distinct.overwrite_cond, 'should have overwrite_cond');
});
