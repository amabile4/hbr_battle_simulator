import test from 'node:test';
import assert from 'node:assert/strict';

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { parseCondition, extractFunctionNames } from '../src/cond-parser.js';
import { evaluateCondition, createEmptyContext } from '../src/cond-evaluator.js';
import { getSpecialStatusName, DEFAULT_SPECIAL_STATUS_TYPES } from '../src/special-status-types.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = path.join(__dirname, 'fixtures');
const DISTINCT = JSON.parse(fs.readFileSync(path.join(FIXTURES_DIR, 'distinct_conditions.json'), 'utf8'));

// 全 distinct 条件式のフラット配列を構築
const ALL_EXPRESSIONS = [];
for (const [field, valueMap] of Object.entries(DISTINCT)) {
  for (const expr of Object.keys(valueMap)) {
    ALL_EXPRESSIONS.push({ field, expr });
  }
}

test('golden fixture: 318 distinct 条件式が存在する', () => {
  assert.equal(ALL_EXPRESSIONS.length, 318);
});

test('golden fixture: 各フィールドの distinct 件数が期待通り', () => {
  assert.equal(Object.keys(DISTINCT.cond).length, 193);
  assert.equal(Object.keys(DISTINCT.overwrite_cond).length, 41);
  assert.equal(Object.keys(DISTINCT.target_condition).length, 75);
  assert.equal(Object.keys(DISTINCT.hit_condition).length, 9);
});

test('golden fixture: 全318式が構文エラー無くパースできる', () => {
  const failures = [];
  for (const { field, expr } of ALL_EXPRESSIONS) {
    const result = parseCondition(expr);
    if (!result.ok) {
      failures.push({ field, expr, error: result.error });
    }
  }
  assert.deepEqual(failures, [], `${failures.length} 件のパース失敗: ${JSON.stringify(failures.slice(0, 3))}`);
});

test('golden fixture: 全318式が例外無く評価できる（空コンテキスト）', () => {
  const ctx = createEmptyContext();
  const crashes = [];
  for (const { field, expr } of ALL_EXPRESSIONS) {
    try {
      const result = evaluateCondition(expr, ctx);
      if (!result.ok && result.parseError) {
        crashes.push({ field, expr, error: result.parseError });
      }
    } catch (e) {
      crashes.push({ field, expr, error: e.message });
    }
  }
  assert.deepEqual(crashes, [], `${crashes.length} 件の評価クラッシュ`);
});
test('golden fixture: 全318式が例外無く評価できる（空コンテキスト）', () => {
  const ctx = createEmptyContext();
  const crashes = [];
  for (const { field, expr } of ALL_EXPRESSIONS) {
    try {
      const result = evaluateCondition(expr, ctx);
      if (!result.ok && result.parseError) {
        crashes.push({ field, expr, error: result.parseError });
      }
    } catch (e) {
      crashes.push({ field, expr, error: e.message });
    }
  }
  assert.deepEqual(crashes, [], `${crashes.length} 件の評価クラッシュ`);
});

test('golden fixture: 条件式に出現する51述語すべてが抽出される', () => {
  const funcs = new Set();
  for (const { expr } of ALL_EXPRESSIONS) {
    const result = parseCondition(expr);
    if (result.ok) {
      for (const name of extractFunctionNames(result.ast)) funcs.add(name);
    }
  }
  // 主要述語が全て含まれる
  const expected = [
    'CountBC', 'IsPlayer', 'SpecialStatusCountByType', 'IsCharacter', 'IsFront',
    'IsNatureElement', 'IsZone', 'DpRate', 'IsDead', 'Token', 'IsTeam',
    'MotivationLevel', 'ConsumeSp', 'Sp', 'IsCharging', 'PlayedSkillCount',
  ];
  for (const name of expected) {
    assert.ok(funcs.has(name), `expected predicate ${name} in golden fixture`);
  }
});

test('golden fixture: 条件式に出現する SpecialStatus ID が全て名前解決される', () => {
  const usedIds = new Set();
  for (const { expr } of ALL_EXPRESSIONS) {
    const m = expr.matchAll(/SpecialStatusCountByType\(\s*(\d+)\s*\)/g);
    for (const match of m) {
      usedIds.add(Number(match[1]));
    }
  }
  for (const id of usedIds) {
    // 全ての使用 ID が DEFAULT_SPECIAL_STATUS_TYPES に定義されているか
    assert.ok(
      Object.hasOwn(DEFAULT_SPECIAL_STATUS_TYPES, id),
      `SpecialStatus ID ${id} (${getSpecialStatusName(id)}) should be defined`
    );
  }
});

test('golden fixture: 代表的な overwrite_cond 実データ式を個別評価', () => {
  const ctx = createEmptyContext({
    party: [
      { isPlayer: true, characterId: 'RKayamori', motivation: { current: 5 } },
    ],
  });
  // MotivationLevel==5 の RKayamori が1人 -> count=1 > 0 = true
  const expr = 'CountBC(IsPlayer() == 1 && IsCharacter(RKayamori) == 1 && MotivationLevel() == 5)>0';
  assert.equal(evaluateCondition(expr, ctx).result, true);
});

test('golden fixture: generate_fixtures.mjs の再現性（レコード件数整合）', () => {
  const allConditions = JSON.parse(
    fs.readFileSync(path.join(FIXTURES_DIR, 'all_conditions.json'), 'utf8')
  );
  assert.ok(Array.isArray(allConditions));
  assert.ok(allConditions.length > 100);
  // 各レコードが必須フィールドを持つ
  const sample = allConditions[0];
  assert.ok(sample.file);
  assert.ok(sample.field);
  assert.ok(sample.expression);
});

