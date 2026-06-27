/**
 * special_status_type_map.md の本文テーブル部分を golden データから生成する。
 * 実行: node golden/tests/generate_special_status_doc.mjs
 * 出力: /tmp/ss_doc_table.md （docs に転記用）
 */
import { buildSpecialStatusCatalog } from '../src/special-status-types.js';
import fs from 'node:fs';

const catalog = buildSpecialStatusCatalog();

const lines = ['| ID | 名前 | カテゴリ | 主体 | 条件式出現 |', '|---|---|---|---|---|'];
for (const e of catalog) {
  lines.push(
    `| ${e.id} | \`${e.name}\` | ${e.category} | ${e.side} | ${e.usedInCondition ? '✅' : ''} |`
  );
}

const out = lines.join('\n') + '\n';
fs.writeFileSync('/tmp/ss_doc_table.md', out);
console.log(`generated ${catalog.length} rows`);
console.log('written to /tmp/ss_doc_table.md');
