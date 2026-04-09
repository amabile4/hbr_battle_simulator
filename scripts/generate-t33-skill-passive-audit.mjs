import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { HbrDataStore } from '../src/index.js';
import {
  classifyEnemyStatusPartRuntimeSupport,
  listUnsupportedConditionClausesByRuntimeSupport,
} from '../src/turn/turn-controller.js';

const SILENT_SKIP_ENEMY_STATUS_SKILL_TYPES = new Set(['BorderRefPDownByAdmiral']);

const MANUAL_LOGIC_GAP_RULES = Object.freeze([
  Object.freeze({
    key: 'stylePassive:57001275',
    entryKind: 'stylePassive',
    styleId: 1001710,
    sourceName: '恐怖の叫び',
    reason:
      'AdditionalHitOnExtraSkill trigger path still does not apply Talisman level-up, even though battle-start Talisman is already implemented.',
    expectedNextTask: 'T33-FU1',
    triggerType: 'AdditionalHitOnExtraSkill',
    effectType: 'Talisman',
    controlCaseKey: 'skillPassive:46401601',
    testReferences: Object.freeze([
      'tests/t33-skill-passive-audit.test.js',
      'tests/turn-state-transitions.test.js',
    ]),
  }),
]);

const STALE_DOC_FALSE_POSITIVE_RULES = Object.freeze([
  Object.freeze({
    key: 'stylePassive:57001121',
    entryKind: 'stylePassive',
    styleId: 1001208,
    sourceName: '浄化の喝采',
    reason:
      'AdditionalHitOnRemovingBuff + AttackUp already creates AttackUp status effects and is covered by turn-state-transitions tests.',
    docReferences: Object.freeze([
      'docs/active/stateful_passive_wbs.md',
      'docs/active/passive_test_coverage_audit.md',
    ]),
  }),
  Object.freeze({
    key: 'topic:additional-hit-on-breaking-attackup',
    reason:
      'AdditionalHitOnBreaking + AttackUp already creates AttackUp status effects and is covered by turn-state-transitions tests; the old "破砕の喝采" runtime-gap note is stale and the current live store no longer exposes that passive by name.',
    examples: Object.freeze([
      'tests/turn-state-transitions.test.js: AdditionalHitOnBreaking + AttackUp synthetic fixtures',
      'docs/active/stateful_passive_wbs.md stale mention: 破砕の喝采',
    ]),
    docReferences: Object.freeze([
      'docs/active/stateful_passive_wbs.md',
      'docs/active/passive_test_coverage_audit.md',
    ]),
  }),
  Object.freeze({
    key: 'stylePassive:57001147',
    entryKind: 'stylePassive',
    styleId: 1007404,
    sourceName: 'ライトプロテクション',
    reason:
      'AdditionalHitOnExtraSkill + DebuffGuard is implemented and covered by dedicated turn-state-transitions tests.',
    docReferences: Object.freeze([
      'docs/active/passive_test_coverage_audit.md',
      'docs/active/passive_implementation_tasklist.md',
    ]),
  }),
  Object.freeze({
    key: 'stylePassive:57001219',
    entryKind: 'stylePassive',
    styleId: 1007405,
    sourceName: '役者魂',
    reason:
      'AdditionalHitOnExtraSkill + BuffCharge is implemented and covered by dedicated turn-state-transitions tests.',
    docReferences: Object.freeze([
      'docs/active/passive_test_coverage_audit.md',
      'docs/active/passive_implementation_tasklist.md',
    ]),
  }),
  Object.freeze({
    key: 'topic:on-overdrive-start',
    reason:
      'OnOverdriveStart now runs through applyPassiveTimingInternal during activateOverdrive(), so the old runtime-gap note is stale.',
    examples: Object.freeze([
      '100260203:専心',
      '100510600:思考加速',
    ]),
    docReferences: Object.freeze([
      'docs/active/passive_timing_reference.md',
    ]),
  }),
]);

const OBSERVABILITY_GAP_RULES = Object.freeze([
  Object.freeze({
    key: 'topic:on-every-turn-include-special-passive-log',
    reason:
      'OnEveryTurnIncludeSpecial effects are resolved in preview/action-selection paths and are not appended to passiveEventsLastApplied, so Passive Log observability remains partial.',
    examples: Object.freeze([
      '100110903:絶唱',
      '100150800:ポジショニング',
      '101020304:トルクマキシマム',
    ]),
    docReferences: Object.freeze([
      'docs/active/passive_timing_reference.md',
      'docs/active/t33_skill_passive_audit_wbs.md',
    ]),
  }),
]);

const OUT_OF_SCOPE_RULES = Object.freeze([
  Object.freeze({
    key: 'task:pri-018-skill-usage-limits',
    reason:
      'use_count / HealSkillUsedCount is tracked under PRI-018 and is intentionally excluded from the T33 phase-1 audit.',
    ownerDoc: 'docs/active/skill_limit_implementation_tasklist.md',
  }),
  Object.freeze({
    key: 'task:conquest-bike-level-ui-override',
    reason:
      'ConquestBikeLevel UI override is a future input-surface enhancement, not a T33 correctness issue.',
    ownerDoc: 'docs/active/passive_implementation_tasklist.md',
  }),
  Object.freeze({
    key: 'task:mark-territory-visibility',
    reason:
      'Mark / Territory visibility expansion is a display enhancement backlog and is intentionally excluded from the audit wave.',
    ownerDoc: 'docs/active/passive_implementation_tasklist.md',
  }),
]);

function normalizeCharacterName(name) {
  return String(name ?? '')
    .split('—')[0]
    .trim();
}

function cloneArray(value) {
  return Array.isArray(value) ? [...value] : [];
}

function buildEntryBase(style, sourceId, sourceName, entryKind) {
  return {
    key: `${entryKind}:${Number(sourceId)}`,
    entryKind,
    styleId: Number(style?.id ?? 0),
    styleName: String(style?.name ?? ''),
    characterName: normalizeCharacterName(style?.chara),
    sourceId: Number(sourceId ?? 0),
    sourceName: String(sourceName ?? ''),
  };
}

function buildAuditEntries(store) {
  const skillEntries = [];
  const skillPassiveEntries = [];
  const stylePassiveEntries = [];

  for (const style of store.styles ?? []) {
    for (const skill of style.skills ?? []) {
      const hasPassiveMetadata = Boolean(skill?.passive && typeof skill.passive === 'object');
      if (!hasPassiveMetadata) {
        skillEntries.push({
          ...buildEntryBase(style, skill?.id, skill?.name, 'skill'),
          rootConditions: Object.freeze([
            Object.freeze({ path: 'cond', expression: String(skill?.cond ?? '') }),
            Object.freeze({ path: 'iuc_cond', expression: String(skill?.iuc_cond ?? '') }),
          ]),
          rootOverwrite: Object.freeze({
            path: 'overwrite_cond',
            expression: String(skill?.overwrite_cond ?? ''),
          }),
          parts: cloneArray(skill?.parts),
          isPassiveSource: false,
        });
        continue;
      }

      skillPassiveEntries.push({
        ...buildEntryBase(style, skill?.id, skill?.name, 'skillPassive'),
        timing: String(skill?.passive?.timing ?? ''),
        rootConditions: Object.freeze([
          Object.freeze({ path: 'passive.condition', expression: String(skill?.passive?.condition ?? '') }),
        ]),
        rootOverwrite: Object.freeze({ path: '', expression: '' }),
        parts: cloneArray(skill?.parts),
        isPassiveSource: true,
      });
    }

    for (const passive of style.passives ?? []) {
      stylePassiveEntries.push({
        ...buildEntryBase(style, passive?.id, passive?.name, 'stylePassive'),
        timing: String(passive?.timing ?? ''),
        rootConditions: Object.freeze([
          Object.freeze({ path: 'condition', expression: String(passive?.condition ?? '') }),
        ]),
        rootOverwrite: Object.freeze({ path: '', expression: '' }),
        parts: cloneArray(passive?.parts),
        isPassiveSource: true,
      });
    }
  }

  return { skillEntries, skillPassiveEntries, stylePassiveEntries };
}

function addConditionGapRows(rows, entry, path, expression, bucket) {
  const text = String(expression ?? '').trim();
  if (!text) {
    return;
  }
  const unsupportedClauses = listUnsupportedConditionClausesByRuntimeSupport(text);
  for (const clause of unsupportedClauses) {
    rows.push({
      key: `${entry.key}:${path}:${clause}`,
      entryKey: entry.key,
      entryKind: entry.entryKind,
      styleId: entry.styleId,
      styleName: entry.styleName,
      characterName: entry.characterName,
      sourceId: entry.sourceId,
      sourceName: entry.sourceName,
      timing: entry.timing ?? '',
      path,
      expression: text,
      unsupportedClause: clause,
      bucket,
    });
  }
}

function collectStructuralRows(entries) {
  const conditionRows = [];
  const overwriteRows = [];
  const enemyStatusRows = [];
  const silentSkipEnemyStatusRows = [];

  for (const entry of entries) {
    for (const condition of entry.rootConditions ?? []) {
      addConditionGapRows(
        conditionRows,
        entry,
        String(condition?.path ?? ''),
        String(condition?.expression ?? ''),
        'condition'
      );
    }

    addConditionGapRows(
      overwriteRows,
      entry,
      String(entry?.rootOverwrite?.path ?? ''),
      String(entry?.rootOverwrite?.expression ?? ''),
      'overwrite'
    );

    for (const [index, part] of (entry.parts ?? []).entries()) {
      addConditionGapRows(conditionRows, entry, `parts[${index}].cond`, String(part?.cond ?? ''), 'condition');
      addConditionGapRows(
        conditionRows,
        entry,
        `parts[${index}].hit_condition`,
        String(part?.hit_condition ?? ''),
        'condition'
      );
      addConditionGapRows(
        conditionRows,
        entry,
        `parts[${index}].target_condition`,
        String(part?.target_condition ?? ''),
        'condition'
      );
      addConditionGapRows(
        overwriteRows,
        entry,
        `parts[${index}].overwrite_cond`,
        String(part?.overwrite_cond ?? ''),
        'overwrite'
      );

      const support = classifyEnemyStatusPartRuntimeSupport(part, {
        isPassiveSource: Boolean(entry.isPassiveSource),
      });
      if (support.isEnemyStatusCandidate && !support.supported) {
        const row = {
          key: `${entry.key}:parts[${index}]`,
          entryKey: entry.key,
          entryKind: entry.entryKind,
          styleId: entry.styleId,
          styleName: entry.styleName,
          characterName: entry.characterName,
          sourceId: entry.sourceId,
          sourceName: entry.sourceName,
          timing: entry.timing ?? '',
          path: `parts[${index}]`,
          skillType: String(part?.skill_type ?? ''),
          targetType: String(part?.target_type ?? ''),
          exitCond: String(part?.effect?.exitCond ?? ''),
          limitType: String(part?.effect?.limitType ?? ''),
        };
        if (SILENT_SKIP_ENEMY_STATUS_SKILL_TYPES.has(row.skillType)) {
          silentSkipEnemyStatusRows.push(row);
          continue;
        }
        enemyStatusRows.push(row);
      }
    }
  }

  return {
    conditionRows,
    overwriteRows,
    enemyStatusRows,
    silentSkipEnemyStatusRows,
  };
}

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function computeEmbeddedPassiveOnlyCount(jsonDir) {
  const passivesPath = resolve(jsonDir, 'passives.json');
  const stylesPath = resolve(jsonDir, 'styles.json');
  const passives = readJson(passivesPath);
  const styles = readJson(stylesPath);
  const passiveIds = new Set((passives ?? []).map((item) => Number(item?.id ?? 0)).filter(Number.isFinite));
  const stylePassiveIds = new Set(
    (styles ?? [])
      .flatMap((style) => (Array.isArray(style?.passives) ? style.passives : []))
      .map((item) => Number(item?.id ?? 0))
      .filter(Number.isFinite)
  );
  let embeddedOnlyCount = 0;
  for (const id of stylePassiveIds) {
    if (!passiveIds.has(id)) {
      embeddedOnlyCount += 1;
    }
  }
  return embeddedOnlyCount;
}

function findEntryByRule(entries, rule) {
  const entryKind = String(rule.entryKind ?? '').trim();
  const sourceId = Number(rule.sourceId ?? Number.NaN);
  const styleId = Number(rule.styleId ?? Number.NaN);
  const sourceName = String(rule.sourceName ?? '').trim();
  const styleName = String(rule.styleName ?? '').trim();
  if (!entryKind) {
    return null;
  }
  return (
    entries.find((entry) => {
      if (String(entry.entryKind ?? '') !== entryKind) {
        return false;
      }
      if (Number.isFinite(sourceId) && Number(entry.sourceId ?? Number.NaN) !== sourceId) {
        return false;
      }
      if (Number.isFinite(styleId) && Number(entry.styleId ?? Number.NaN) !== styleId) {
        return false;
      }
      if (sourceName && String(entry.sourceName ?? '') !== sourceName) {
        return false;
      }
      if (styleName && String(entry.styleName ?? '') !== styleName) {
        return false;
      }
      return true;
    }) ?? null
  );
}

function materializeManualItems(rules, entries, options = {}) {
  const items = [];
  for (const rule of rules) {
    const entry = findEntryByRule(entries, rule);
    const base = entry
      ? {
          key: entry.key,
          entryKind: entry.entryKind,
          styleId: entry.styleId,
          styleName: entry.styleName,
          characterName: entry.characterName,
          sourceId: entry.sourceId,
          sourceName: entry.sourceName,
          timing: entry.timing ?? '',
        }
      : {
          key: String(rule.key),
          entryKind: String(rule.entryKind ?? 'topic'),
          styleId: 0,
          styleName: '',
          characterName: '',
          sourceId: Number(rule.id ?? 0),
          sourceName: String(rule.sourceName ?? ''),
          timing: '',
        };

    items.push({
      ...base,
      reason: String(rule.reason ?? ''),
      triggerType: String(rule.triggerType ?? ''),
      effectType: String(rule.effectType ?? ''),
      expectedNextTask: String(rule.expectedNextTask ?? ''),
      controlCaseKey: String(rule.controlCaseKey ?? ''),
      docReferences: cloneArray(rule.docReferences),
      testReferences: cloneArray(rule.testReferences),
      examples: cloneArray(rule.examples),
      ownerDoc: String(rule.ownerDoc ?? ''),
      ...(options.extraFields ?? {}),
    });
  }
  return items.sort((left, right) => String(left.key).localeCompare(String(right.key), 'ja'));
}

export function generateT33SkillPassiveAudit({ jsonDir = 'json' } = {}) {
  const store = HbrDataStore.fromJsonDirectory(jsonDir);
  const { skillEntries, skillPassiveEntries, stylePassiveEntries } = buildAuditEntries(store);
  const allEntries = [...skillEntries, ...skillPassiveEntries, ...stylePassiveEntries];
  const structuralRows = collectStructuralRows(allEntries);
  const embeddedPassiveOnlyCount = computeEmbeddedPassiveOnlyCount(jsonDir);

  const logicGaps = materializeManualItems(MANUAL_LOGIC_GAP_RULES, allEntries);
  const staleDocFalsePositives = materializeManualItems(STALE_DOC_FALSE_POSITIVE_RULES, allEntries);
  const observabilityGaps = materializeManualItems(OBSERVABILITY_GAP_RULES, allEntries).map((item) => {
    if (item.key === 'topic:on-every-turn-include-special-passive-log') {
      return {
        ...item,
        affectedTimingCount: 5,
      };
    }
    return item;
  });
  observabilityGaps.push({
    key: 'topic:style-embedded-passive-audit-surface',
    entryKind: 'topic',
    styleId: 0,
    styleName: '',
    characterName: '',
    sourceId: 0,
    sourceName: 'style-embedded-passives',
    timing: '',
    reason:
      'passives.json alone misses style-embedded passive definitions, so T33 audits must load HbrDataStore rather than the raw file directly.',
    triggerType: '',
    effectType: '',
    expectedNextTask: '',
    controlCaseKey: '',
    docReferences: ['docs/active/t33_skill_passive_audit_wbs.md'],
    testReferences: ['tests/t33-skill-passive-audit.test.js'],
    examples: [],
    ownerDoc: '',
    embeddedOnlyPassiveIds: embeddedPassiveOnlyCount,
  });
  observabilityGaps.sort((left, right) => String(left.key).localeCompare(String(right.key), 'ja'));

  const outOfScope = materializeManualItems(OUT_OF_SCOPE_RULES, allEntries);

  return {
    logicGaps,
    observabilityGaps,
    staleDocFalsePositives,
    outOfScope,
    counts: {
      styles: Number(store.styles?.length ?? 0),
      styleSkillEntries: skillEntries.length,
      skillPassiveEntries: skillPassiveEntries.length,
      stylePassiveEntries: stylePassiveEntries.length,
      scannedEntries: allEntries.length,
      embeddedOnlyPassiveIds: embeddedPassiveOnlyCount,
      structuralConditionGaps: structuralRows.conditionRows.length,
      structuralOverwriteGaps: structuralRows.overwriteRows.length,
      structuralEnemyStatusGaps: structuralRows.enemyStatusRows.length,
      silentSkipEnemyStatusCandidates: structuralRows.silentSkipEnemyStatusRows.length,
      logicGapCount: logicGaps.length,
      observabilityGapCount: observabilityGaps.length,
      staleDocFalsePositiveCount: staleDocFalsePositives.length,
      outOfScopeCount: outOfScope.length,
    },
  };
}

const currentFilePath = fileURLToPath(import.meta.url);

if (process.argv[1] && resolve(process.argv[1]) === currentFilePath) {
  const report = generateT33SkillPassiveAudit();
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}
