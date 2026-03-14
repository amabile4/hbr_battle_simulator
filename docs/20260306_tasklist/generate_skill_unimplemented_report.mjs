import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { listUnsupportedConditionClausesByRuntimeSupport } from '../../src/turn/turn-controller.js';

const OUTPUT_DIR = resolve('docs/20260306_tasklist');
const SKILLS_PATH = resolve('json/skills.json');

const CONDITION_CATEGORY = 'state_condition_unimplemented';
const ENEMY_STATUS_CATEGORY = 'enemy_status_unimplemented';
const OVERWRITE_CATEGORY = 'overwrite_cond_unresolved';
const EFFECT_CATEGORY = 'effect_unresolved';
const IGNORED_TOP_LEVEL_EFFECT_LABELS = new Set([
  'ChargeBuff',
  'CriticalBuff_Up',
  'DarkBuff_Up',
  'DefaultDebuff',
  'FireBuff_Up',
  'FunnelUp',
  'HealDp_Buff',
  'HealSp',
  'IceBuff_Up',
  'LightBuff_Up',
  'MindEyeBuff',
  'NormalBuff_Up',
  'OverDriveUp',
  'ProtectBuff',
  'ThunderBuff_Up',
  'TokenUp',
]);

const ENEMY_STATUS_SKILL_TYPE_KEYWORDS =
  /(Down|Fragile|Stun|Confusion|Imprison|Misfortune|Hacking|Talisman|Cover|Poison|Paralyze|Seal|Curse|Burn|Freeze|Sleep|Bind|Silence)/i;
const ENEMY_TARGET_TYPES = new Set(['Single', 'All', 'EnemySingle', 'EnemyAll']);

function splitTopLevel(expression, separator) {
  const text = String(expression ?? '');
  const out = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (ch === '(') {
      depth += 1;
      continue;
    }
    if (ch === ')') {
      depth = Math.max(0, depth - 1);
      continue;
    }
    if (depth !== 0) {
      continue;
    }
    if (text.slice(i, i + separator.length) === separator) {
      out.push(text.slice(start, i).trim());
      start = i + separator.length;
      i += separator.length - 1;
    }
  }
  out.push(text.slice(start).trim());
  return out.filter(Boolean);
}

function normalizeInnerCondition(innerExpression) {
  return String(innerExpression ?? '').replace(/\s+/g, '');
}

function isSupportedCountBCInnerExpression(innerExpression) {
  const inner = normalizeInnerCondition(innerExpression);
  if (!inner) {
    return false;
  }

  if (
    inner === 'IsPlayer()' ||
    inner === 'IsFront()==0&&IsPlayer()' ||
    inner === 'IsPlayer()==1&&SpecialStatusCountByType(20)>0' ||
    inner === 'IsPlayer()==1&&SpecialStatusCountByType(20)>=1' ||
    inner === 'IsPlayer()==1&&SpecialStatusCountByType(20)==0' ||
    inner === 'PlayedSkillCount(FMikotoSkill04)>0'
  ) {
    return true;
  }

  const clauses = inner.split('&&').filter(Boolean);
  const hasAllDownTurnEnemyClauses =
    clauses.length === 3 &&
    clauses.includes('IsPlayer()==0') &&
    clauses.includes('IsDead()==0') &&
    clauses.includes('BreakDownTurn()>0');
  return hasAllDownTurnEnemyClauses;
}

function isSupportedConditionClause(clause) {
  const text = String(clause ?? '').trim();
  if (!text) {
    return true;
  }

  if (text === 'IsOverDrive()' || text === 'IsReinforcedMode()') {
    return true;
  }

  if (/^PlayedSkillCount\(([^)]*)\)\s*(==|!=|>=|<=|>|<)\s*(-?\d+)$/.test(text)) {
    return true;
  }
  if (/^BreakHitCount\(\)\s*(==|!=|>=|<=|>|<)\s*(-?\d+)$/.test(text)) {
    return true;
  }
  if (/^SpecialStatusCountByType\(20\)\s*(==|!=|>=|<=|>|<)\s*(-?\d+)$/.test(text)) {
    return true;
  }
  if (/^OverDriveGauge\(\)\s*(==|!=|>=|<=|>|<)\s*(-?\d+(?:\.\d+)?)$/.test(text)) {
    return true;
  }
  if (/^Sp\(\)\s*(==|!=|>=|<=|>|<)\s*(-?\d+(?:\.\d+)?)$/.test(text)) {
    return true;
  }
  if (/^IsOverDrive\(\)\s*(==|!=|>=|<=|>|<)\s*(-?\d+)$/.test(text)) {
    return true;
  }
  if (/^IsReinforcedMode\(\)\s*(==|!=|>=|<=|>|<)\s*(-?\d+)$/.test(text)) {
    return true;
  }

  {
    const m = text.match(/^CountBC\((.+)\)\s*(==|!=|>=|<=|>|<)\s*(-?\d+)$/);
    if (m) {
      return isSupportedCountBCInnerExpression(m[1]);
    }
  }

  return false;
}

function listUnsupportedConditionClauses(expression) {
  const text = String(expression ?? '').trim();
  if (!text) {
    return [];
  }

  const clauses = new Set();
  const orClauses = splitTopLevel(text, '||');
  for (const orClause of orClauses) {
    const andClauses = splitTopLevel(orClause, '&&');
    for (const clause of andClauses) {
      const normalized = String(clause ?? '').trim();
      if (!normalized) {
        continue;
      }
      if (!isSupportedConditionClause(normalized)) {
        clauses.add(normalized);
      }
    }
  }
  return [...clauses];
}

function normalizeCharacterName(charaText) {
  return String(charaText ?? '')
    .split('—')[0]
    .trim();
}

function csvEscape(value) {
  const text = String(value ?? '');
  if (text.includes(',') || text.includes('"') || text.includes('\n')) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function toCsv(rows, columns) {
  const lines = [columns.map(csvEscape).join(',')];
  for (const row of rows) {
    lines.push(columns.map((column) => csvEscape(row[column] ?? '')).join(','));
  }
  return lines.join('\n');
}

function buildOccurrenceRow(base, overrides = {}) {
  return {
    category: '',
    item_key: '',
    field_path: '',
    condition_expression: '',
    unsupported_clause: '',
    part_skill_type: '',
    target_type: '',
    effect_exit_cond: '',
    effect_limit_type: '',
    note: '',
    skill_id: '',
    character_name: '',
    style_name: '',
    skill_name: '',
    skill_desc: '',
    ...base,
    ...overrides,
  };
}

function addOccurrencesFromConditionField(rows, baseMeta, fieldPath, expression) {
  const expr = String(expression ?? '').trim();
  if (!expr) {
    return;
  }
  const unsupportedClauses = listUnsupportedConditionClausesByRuntimeSupport(expr);
  for (const clause of unsupportedClauses) {
    rows.push(
      buildOccurrenceRow(baseMeta, {
        category: CONDITION_CATEGORY,
        item_key: clause,
        field_path: fieldPath,
        condition_expression: expr,
        unsupported_clause: clause,
      })
    );
  }
}

function isEnemyStatusCandidatePart(part) {
  const targetType = String(part?.target_type ?? '').trim();
  if (!ENEMY_TARGET_TYPES.has(targetType)) {
    return false;
  }

  const skillType = String(part?.skill_type ?? '').trim();
  const exitCond = String(part?.effect?.exitCond ?? '').trim();
  const limitType = String(part?.effect?.limitType ?? '').trim();
  const hasTimedEffect = (exitCond && exitCond !== 'None') || (limitType && limitType !== 'None');
  const hasStatusKeyword = ENEMY_STATUS_SKILL_TYPE_KEYWORDS.test(skillType);
  return hasTimedEffect || hasStatusKeyword;
}

function shouldReportTopLevelEffect(effectLabel) {
  const normalized = String(effectLabel ?? '').trim();
  if (!normalized) {
    return false;
  }
  return !IGNORED_TOP_LEVEL_EFFECT_LABELS.has(normalized);
}

function collectSkillLikeFields(rows, topSkill, skillLike, fieldPath) {
  const baseMeta = {
    skill_id: Number(topSkill?.id ?? ''),
    character_name: normalizeCharacterName(topSkill?.chara),
    style_name: String(topSkill?.style ?? ''),
    skill_name: String(topSkill?.name ?? ''),
    skill_desc: String(topSkill?.desc ?? ''),
  };

  addOccurrencesFromConditionField(rows, baseMeta, `${fieldPath}.cond`, skillLike?.cond);
  addOccurrencesFromConditionField(rows, baseMeta, `${fieldPath}.iuc_cond`, skillLike?.iuc_cond);

  const overwriteCond = String(skillLike?.overwrite_cond ?? skillLike?.overwriteCond ?? '').trim();
  if (overwriteCond) {
    const unsupportedClauses = listUnsupportedConditionClausesByRuntimeSupport(overwriteCond);
    for (const clause of unsupportedClauses) {
      rows.push(
        buildOccurrenceRow(baseMeta, {
          category: OVERWRITE_CATEGORY,
          item_key: clause,
          field_path: `${fieldPath}.overwrite_cond`,
          condition_expression: overwriteCond,
          unsupported_clause: clause,
          note: 'overwrite_cond に未対応 clause が残っている',
        })
      );
    }
  }

  const effect = String(skillLike?.effect ?? '').trim();
  if (shouldReportTopLevelEffect(effect)) {
    rows.push(
      buildOccurrenceRow(baseMeta, {
        category: EFFECT_CATEGORY,
        item_key: effect,
        field_path: `${fieldPath}.effect`,
        note: 'top-level effect は実行ロジック未接続',
      })
    );
  }

  const parts = Array.isArray(skillLike?.parts) ? skillLike.parts : [];
  for (let i = 0; i < parts.length; i += 1) {
    const part = parts[i];
    const partPath = `${fieldPath}.parts[${i}]`;

    addOccurrencesFromConditionField(rows, baseMeta, `${partPath}.cond`, part?.cond);
    addOccurrencesFromConditionField(rows, baseMeta, `${partPath}.hit_condition`, part?.hit_condition);
    addOccurrencesFromConditionField(
      rows,
      baseMeta,
      `${partPath}.target_condition`,
      part?.target_condition
    );

    const partOverwriteCond = String(part?.overwrite_cond ?? '').trim();
    if (partOverwriteCond) {
      const unsupportedClauses = listUnsupportedConditionClausesByRuntimeSupport(partOverwriteCond);
      for (const clause of unsupportedClauses) {
        rows.push(
          buildOccurrenceRow(baseMeta, {
            category: OVERWRITE_CATEGORY,
            item_key: clause,
            field_path: `${partPath}.overwrite_cond`,
            condition_expression: partOverwriteCond,
            unsupported_clause: clause,
            part_skill_type: String(part?.skill_type ?? ''),
            target_type: String(part?.target_type ?? ''),
            note: 'part.overwrite_cond に未対応 clause が残っている',
          })
        );
      }
    }

    if (isEnemyStatusCandidatePart(part)) {
      rows.push(
        buildOccurrenceRow(baseMeta, {
          category: ENEMY_STATUS_CATEGORY,
          item_key: String(part?.skill_type ?? ''),
          field_path: partPath,
          part_skill_type: String(part?.skill_type ?? ''),
          target_type: String(part?.target_type ?? ''),
          effect_exit_cond: String(part?.effect?.exitCond ?? ''),
          effect_limit_type: String(part?.effect?.limitType ?? ''),
          note: '敵状態異常付与の適用処理は turn-controller に未実装',
        })
      );
    }

    const variants = Array.isArray(part?.strval) ? part.strval : [];
    for (let j = 0; j < variants.length; j += 1) {
      const variant = variants[j];
      if (!variant || typeof variant !== 'object') {
        continue;
      }
      collectSkillLikeFields(rows, topSkill, variant, `${partPath}.strval[${j}]`);
    }
  }
}

function buildCatalogRows(occurrenceRows) {
  const grouped = new Map();
  for (const row of occurrenceRows) {
    const groupKey = `${row.category}||${row.item_key}`;
    if (!grouped.has(groupKey)) {
      grouped.set(groupKey, {
        ...row,
        occurrences: 0,
      });
    }
    const group = grouped.get(groupKey);
    group.occurrences += 1;
  }

  return [...grouped.values()].sort((a, b) => {
    const categoryCmp = String(a.category).localeCompare(String(b.category), 'ja');
    if (categoryCmp !== 0) {
      return categoryCmp;
    }
    const occurrenceDelta = Number(b.occurrences) - Number(a.occurrences);
    if (occurrenceDelta !== 0) {
      return occurrenceDelta;
    }
    return String(a.item_key).localeCompare(String(b.item_key), 'ja');
  });
}

function buildSummaryMarkdown(catalogRows, occurrenceRows) {
  const countsByCategory = new Map();
  for (const row of occurrenceRows) {
    const current = countsByCategory.get(row.category) ?? 0;
    countsByCategory.set(row.category, current + 1);
  }
  const uniqueByCategory = new Map();
  for (const row of catalogRows) {
    const current = uniqueByCategory.get(row.category) ?? 0;
    uniqueByCategory.set(row.category, current + 1);
  }

  const lines = [];
  lines.push('# Skills 未対応項目調査 (2026-03-06)');
  lines.push('');
  lines.push('- 対象データ: `json/skills.json`');
  lines.push('- 判定基準: `src/turn/turn-controller.js` / `src/data/hbr-data-store.js` の実装に基づく');
  lines.push('- 生成物:');
  lines.push('  - `skills_unimplemented_occurrences.csv` (全出現行)');
  lines.push('  - `skills_unimplemented_catalog.csv` (キー単位の集約)');
  lines.push('');
  lines.push('## 集計');
  lines.push('');
  lines.push('| category | unique_keys | occurrences |');
  lines.push('|---|---:|---:|');
  const categories = [
    CONDITION_CATEGORY,
    ENEMY_STATUS_CATEGORY,
    OVERWRITE_CATEGORY,
    EFFECT_CATEGORY,
  ];
  for (const category of categories) {
    lines.push(
      `| ${category} | ${uniqueByCategory.get(category) ?? 0} | ${countsByCategory.get(category) ?? 0} |`
    );
  }
  lines.push('');
  lines.push('## 条件式パーサーで実装済みの主な条件');
  lines.push('');
  lines.push('- `PlayedSkillCount(...)` 比較');
  lines.push('- `BreakHitCount()` 比較');
  lines.push('- `SpecialStatusCountByType(...)` 比較（tracked special status のみ）');
  lines.push('- `OverDriveGauge()` / `Sp()` / `Ep()` / `DpRate()` 比較');
  lines.push('- `IsOverDrive()` / `IsReinforcedMode()` / `IsCharging()` / `IsFront()` / `HasSkill()` / `TargetBreakDownTurn()` / `RemoveDebuffCount()`');
  lines.push('- `IsNatureElement(...)` / `IsCharacter(...)` / `IsTeam(...)` / `IsWeakElement(...)` / `IsZone(...)` / `IsTerritory(...)`');
  lines.push('- `CountBC(...)` は runtime evaluator と同じ nested clause だけ対応');
  lines.push('');
  lines.push('## 補足');
  lines.push('');
  lines.push('- `overwrite_cond` は、expression 全体ではなく未対応 clause のみを集計する。');
  lines.push(
    `- top-level \`effect\` は、metadata-only / active-buff吸収済み label (${IGNORED_TOP_LEVEL_EFFECT_LABELS.size}種) を除外し、追加 runtime 接続が必要な label のみ \`effect_unresolved\` に残す。`
  );
  lines.push('- 敵状態異常は `skills.json` 上の候補パーツを抽出し、`turn-controller` に適用ロジックが無いものを未実装として列挙。');
  lines.push('');

  return lines.join('\n');
}

function main() {
  mkdirSync(OUTPUT_DIR, { recursive: true });
  const skills = JSON.parse(readFileSync(SKILLS_PATH, 'utf8'));

  const occurrenceRows = [];
  for (let i = 0; i < skills.length; i += 1) {
    const skill = skills[i];
    collectSkillLikeFields(occurrenceRows, skill, skill, `skills[${i}]`);
  }

  const catalogRows = buildCatalogRows(occurrenceRows);

  const occurrenceColumns = [
    'category',
    'item_key',
    'field_path',
    'condition_expression',
    'unsupported_clause',
    'part_skill_type',
    'target_type',
    'effect_exit_cond',
    'effect_limit_type',
    'note',
    'skill_id',
    'character_name',
    'style_name',
    'skill_name',
    'skill_desc',
  ];
  const catalogColumns = [
    'category',
    'item_key',
    'occurrences',
    'field_path',
    'condition_expression',
    'unsupported_clause',
    'part_skill_type',
    'target_type',
    'effect_exit_cond',
    'effect_limit_type',
    'note',
    'skill_id',
    'character_name',
    'style_name',
    'skill_name',
    'skill_desc',
  ];

  writeFileSync(resolve(OUTPUT_DIR, 'skills_unimplemented_occurrences.csv'), toCsv(occurrenceRows, occurrenceColumns));
  writeFileSync(resolve(OUTPUT_DIR, 'skills_unimplemented_catalog.csv'), toCsv(catalogRows, catalogColumns));
  writeFileSync(resolve(OUTPUT_DIR, 'unsupported_matrix.csv'), toCsv(catalogRows, catalogColumns));
  writeFileSync(
    resolve(OUTPUT_DIR, 'skills_unimplemented_summary.md'),
    buildSummaryMarkdown(catalogRows, occurrenceRows)
  );

  const categoryStats = {};
  for (const row of occurrenceRows) {
    categoryStats[row.category] = (categoryStats[row.category] ?? 0) + 1;
  }
  console.log('Generated:', {
    occurrenceRows: occurrenceRows.length,
    catalogRows: catalogRows.length,
    categoryStats,
  });
}

main();
