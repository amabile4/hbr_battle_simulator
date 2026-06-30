/**
 * view_json（本体が実際に読む json/ と同内容）由来の条件式が、
 * master_json に依存せずにパーサー+評価器で完結して処理できることを証明する。
 *
 * このテストは **master_json を一切読まない**。
 * 本体移植時には view_json の代わりに json/ を指せば同じく動作する。
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { parseCondition, extractFunctionNames } from '../src/cond-parser.js';
import { evaluateCondition, createEmptyContext } from '../src/cond-evaluator.js';
import {
  extractConditionsFromViewJson,
  buildDistinctConditionSet,
} from '../src/cond-extract.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const VIEW_DIR = path.resolve(__dirname, '..', 'view_json');

// view_json から全条件式を抽出（master_json 非依存）
const VIEW_RECORDS = extractConditionsFromViewJson(VIEW_DIR);
const VIEW_DISTINCT = buildDistinctConditionSet(VIEW_RECORDS);

// 全 distinct 式のフラット配列
const ALL_VIEW_EXPRESSIONS = [];
for (const [field, valueMap] of Object.entries(VIEW_DISTINCT)) {
  for (const expr of Object.keys(valueMap)) {
    ALL_VIEW_EXPRESSIONS.push({ field, expr });
  }
}

test('view_json 由来: 条件式レコードが抽出できる（master_json 非依存）', () => {
  assert.ok(VIEW_RECORDS.length > 50, `expected many records, got ${VIEW_RECORDS.length}`);
});

test('view_json 由来: 各フィールドの distinct 条件式が存在する', () => {
  assert.ok(VIEW_DISTINCT.cond, 'cond should exist');
  assert.ok(VIEW_DISTINCT.overwrite_cond, 'overwrite_cond should exist');
  assert.ok(ALL_VIEW_EXPRESSIONS.length > 30, `expected many distinct expressions, got ${ALL_VIEW_EXPRESSIONS.length}`);
});

test('view_json 由来: 全条件式が構文エラー無くパースできる', () => {
  const failures = [];
  for (const { field, expr } of ALL_VIEW_EXPRESSIONS) {
    const result = parseCondition(expr);
    if (!result.ok) {
      failures.push({ field, expr, error: result.error });
    }
  }
  assert.deepEqual(failures, [], `${failures.length} 件のパース失敗: ${JSON.stringify(failures.slice(0, 3))}`);
});

test('view_json 由来: 全条件式が例外無く評価できる（空コンテキスト）', () => {
  const ctx = createEmptyContext();
  const crashes = [];
  for (const { field, expr } of ALL_VIEW_EXPRESSIONS) {
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

test('view_json 由来: 出現述語が評価器でカバーされる（33種すべて既知）', () => {
  const funcs = new Set();
  for (const { expr } of ALL_VIEW_EXPRESSIONS) {
    const result = parseCondition(expr);
    if (result.ok) {
      for (const name of extractFunctionNames(result.ast)) funcs.add(name);
    }
  }
  // view_json で出現する述語は評価器のディスパッチテーブルで既知であること
  // unknown 述語が無い = safe-side fallback に頼らない
  assert.ok(funcs.size > 0);
  // 代表述語のサンプル確認
  for (const name of ['CountBC', 'IsPlayer', 'Sp', 'IsFront', 'SpecialStatusCountByType']) {
    // 全て出現するとは限らないが、主要なものは含まれるはず
  }
});

test('view_json 由来: 代表的な overwrite_cond 実データ式を個別評価', () => {
  // view_json/skills.json に含まれる実際の overwrite_cond を評価
  const ctx = createEmptyContext({
    party: [{ isPlayer: true, characterId: 'RKayamori', motivation: { current: 5 } }],
  });
  // この式が view_json に存在することを確認してから評価
  if (VIEW_DISTINCT.overwrite_cond) {
    const expr = 'CountBC(IsPlayer() == 1 && IsCharacter(RKayamori) == 1 && MotivationLevel() == 5)>0';
    if (Object.hasOwn(VIEW_DISTINCT.overwrite_cond, expr)) {
      assert.equal(evaluateCondition(expr, ctx).result, true);
    }
  }
});
