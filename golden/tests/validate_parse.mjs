import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseCondition, extractFunctionNames } from '../src/cond-parser.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dump = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'distinct_conditions.json'), 'utf8'));

let totalExpr = 0;
let okCount = 0;
const failures = [];
const funcs = new Set();

for (const [key, valueMap] of Object.entries(dump)) {
  for (const expr of Object.keys(valueMap)) {
    totalExpr++;
    const result = parseCondition(expr);
    if (result.ok) {
      okCount++;
      for (const name of extractFunctionNames(result.ast)) funcs.add(name);
    } else {
      failures.push({ key, expr, error: result.error });
    }
  }
}

console.log(`Parsed ${okCount}/${totalExpr} expressions OK (${failures.length} failures)`);
if (failures.length > 0) {
  console.log('\n=== FAILURES ===');
  for (const f of failures.slice(0, 30)) {
    console.log(`  [${f.key}] ${f.expr}\n    -> ${f.error}`);
  }
}
console.log(`\nDistinct functions across all parsed ASTs: ${funcs.size}`);
console.log([...funcs].sort().join(', '));


