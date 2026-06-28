import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { evaluateCondition, createEmptyContext } from '../src/cond-evaluator.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dump = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'distinct_conditions.json'), 'utf8'));

// 全式を空コンテキストで評価し、例外無く結果が返ることを検証
const ctx = createEmptyContext();
let total = 0;
let ok = 0;
let unknownCount = 0;
const crashes = [];

for (const [field, valueMap] of Object.entries(dump)) {
  for (const expr of Object.keys(valueMap)) {
    total++;
    try {
      const result = evaluateCondition(expr, ctx);
      if (result.ok) {
        ok++;
        if (result.unknownCount > 0) unknownCount++;
      } else {
        crashes.push({ field, expr, error: result.parseError });
      }
    } catch (e) {
      crashes.push({ field, expr, error: e.message });
    }
  }
}

console.log(`Evaluated ${ok}/${total} expressions without crash`);
console.log(`Fully resolved (unknownCount=0): ${total - unknownCount}/${total}`);
console.log(`Used safe-side fallback (unknownCount>0): ${unknownCount}/${total}`);
if (crashes.length > 0) {
  console.log('\n=== CRASHES ===');
  for (const c of crashes.slice(0, 20)) {
    console.log(`  [${c.field}] ${c.expr}\n    -> ${c.error}`);
  }
}
