import fs from 'fs';
import path from 'path';

const ROOT = '/Users/ram4/git/hbr_battle_simulator';
const JSON_DIR = path.join(ROOT, 'json');

function readJson(relPath) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, relPath), 'utf8'));
}

function normalizeCharaName(name) {
  return String(name || '').split(' — ')[0].trim();
}

function isDamageSkill(skill) {
  const parts = Array.isArray(skill.parts) ? skill.parts : [];
  return parts.some((part) => {
    const skillType = String(part?.skill_type || '');
    if (skillType.includes('Attack')) return true;

    const multipliers = part?.multipliers || {};
    const dp = Number(multipliers.dp || 0);
    const hp = Number(multipliers.hp || 0);
    const dr = Number(multipliers.dr || 0);
    const hasDamageMultiplier = dp > 0 || hp > 0 || dr > 0;

    const power = Array.isArray(part?.power) ? part.power : [];
    const maxPower = Math.max(0, ...power.map((v) => Number(v || 0)));

    return hasDamageMultiplier && maxPower > 0;
  });
}

function groupBy(items, keyFn) {
  const map = new Map();
  for (const item of items) {
    const key = keyFn(item);
    const arr = map.get(key) || [];
    arr.push(item);
    map.set(key, arr);
  }
  return map;
}

const skillDatabase = readJson('skillDatabase.json');
const characters = readJson('json/characters.json');
const styles = readJson('json/styles.json');
const skills = readJson('json/skills.json');
const passives = readJson('json/passives.json');

const styleByName = new Map(styles.map((s) => [s.name, s]));
const styleById = new Map(styles.map((s) => [s.id, s]));
const charByNormalizedName = new Map(characters.map((c) => [normalizeCharaName(c.name), c]));

const normalizedSkillRecords = skills.map((skill) => {
  const normalizedChara = normalizeCharaName(skill.chara);
  const style = styleByName.get(skill.style);
  const damage = isDamageSkill(skill);

  return {
    skillId: skill.id,
    name: skill.name,
    normalizedNameKey: `${normalizedChara}::${skill.name}`,
    chara: normalizedChara,
    rawChara: skill.chara,
    styleName: skill.style || null,
    styleId: style?.id ?? null,
    team: skill.team || style?.team || null,
    role: skill.role || style?.role || null,
    spCost: Number.isFinite(Number(skill.sp_cost)) ? Number(skill.sp_cost) : null,
    type: damage ? 'damage' : 'non_damage',
    consumeType: skill.consume_type || null,
    maxLevel: Number.isFinite(Number(skill.max_level)) ? Number(skill.max_level) : null,
    isRestricted: Number.isFinite(Number(skill.is_restricted)) ? Number(skill.is_restricted) : null,
    source: {
      from: 'skills.json',
      inDate: skill.in_date || null,
      label: skill.label || null
    }
  };
});

const byCharacterName = groupBy(normalizedSkillRecords, (r) => r.chara);
const byCharacterAndName = groupBy(normalizedSkillRecords, (r) => `${r.chara}::${r.name}`);

const legacyCompatibleCharacters = {};
const mergedVariants = [];

for (const [key, records] of byCharacterAndName.entries()) {
  const [chara, name] = key.split('::');
  const costSet = [...new Set(records.map((r) => r.spCost))];
  const typeSet = [...new Set(records.map((r) => r.type))];

  const representative = records
    .slice()
    .sort((a, b) => {
      if ((a.styleId ?? 10 ** 12) !== (b.styleId ?? 10 ** 12)) return (a.styleId ?? 10 ** 12) - (b.styleId ?? 10 ** 12);
      return a.skillId - b.skillId;
    })[0];

  const merged = {
    chara,
    name,
    cost: representative.spCost,
    type: representative.type,
    sourceSkillIds: records.map((r) => r.skillId).sort((a, b) => a - b),
    variantCount: records.length,
    hasCostConflict: costSet.length > 1,
    hasTypeConflict: typeSet.length > 1
  };

  mergedVariants.push(merged);
  if (!legacyCompatibleCharacters[chara]) legacyCompatibleCharacters[chara] = [];
  legacyCompatibleCharacters[chara].push({
    name: merged.name,
    cost: merged.cost,
    type: merged.type,
    sourceSkillIds: merged.sourceSkillIds,
    variantCount: merged.variantCount,
    hasConflict: merged.hasCostConflict || merged.hasTypeConflict
  });
}

for (const chara of Object.keys(legacyCompatibleCharacters)) {
  legacyCompatibleCharacters[chara].sort((a, b) => {
    if ((a.cost ?? 10 ** 6) !== (b.cost ?? 10 ** 6)) return (a.cost ?? 10 ** 6) - (b.cost ?? 10 ** 6);
    return a.name.localeCompare(b.name, 'ja');
  });
}

const legacyRows = [];
for (const [chara, arr] of Object.entries(skillDatabase.characters)) {
  for (const row of arr) {
    legacyRows.push({
      chara,
      name: row.name,
      cost: row.cost,
      type: row.type
    });
  }
}

const candidateRows = mergedVariants.map((v) => ({
  chara: v.chara,
  name: v.name,
  cost: v.cost,
  type: v.type,
  variantCount: v.variantCount,
  hasConflict: v.hasCostConflict || v.hasTypeConflict
}));

const candidateByName = groupBy(candidateRows, (r) => `${r.chara}::${r.name}`);
const candidateByFull = groupBy(candidateRows, (r) => `${r.chara}::${r.name}::${r.cost}::${r.type}`);

let exactMatch = 0;
let nameMatch = 0;
let noMatch = 0;
let costMismatch = 0;
let typeMismatch = 0;

for (const row of legacyRows) {
  const nameKey = `${row.chara}::${row.name}`;
  const fullKey = `${row.chara}::${row.name}::${row.cost}::${row.type}`;
  const nameCandidates = candidateByName.get(nameKey) || [];
  const fullCandidates = candidateByFull.get(fullKey) || [];

  if (fullCandidates.length > 0) {
    exactMatch++;
    continue;
  }

  if (nameCandidates.length > 0) {
    nameMatch++;
    const sameCost = nameCandidates.some((c) => c.cost === row.cost);
    const sameType = nameCandidates.some((c) => c.type === row.type);
    if (!sameCost) costMismatch++;
    if (!sameType) typeMismatch++;
  } else {
    noMatch++;
  }
}

const legacyFullKeys = new Set(legacyRows.map((r) => `${r.chara}::${r.name}::${r.cost}::${r.type}`));
const newOnlyRows = candidateRows.filter((r) => !legacyFullKeys.has(`${r.chara}::${r.name}::${r.cost}::${r.type}`));

const oldMissingJoinFields = legacyRows.length * 2;
const newMissingJoinFields = normalizedSkillRecords.filter((r) => r.skillId == null || r.styleId == null).length;

const coverage = {
  legacyRowCount: legacyRows.length,
  candidateDistinctNameRowCount: candidateRows.length,
  candidateRawSkillCount: normalizedSkillRecords.length,
  exactMatch,
  nameMatchOnly: nameMatch,
  unmatchedLegacyRows: noMatch,
  exactMatchRate: legacyRows.length ? exactMatch / legacyRows.length : 0,
  nameLevelCoverage: legacyRows.length ? (exactMatch + nameMatch) / legacyRows.length : 0,
  mismatchRate: legacyRows.length ? (nameMatch + noMatch) / legacyRows.length : 0,
  costMismatch,
  typeMismatch,
  candidateRowsNotInLegacy: newOnlyRows.length,
  missingFieldImprovementRate: oldMissingJoinFields
    ? (oldMissingJoinFields - newMissingJoinFields) / oldMissingJoinFields
    : 0
};

const semanticDiffs = [
  {
    field: 'type',
    legacyMeaning: 'damage/non_damageの2値。由来ルールが不明。',
    newMeaning: 'partsから推定した攻撃有無。将来はskill_typeベース判定に置換予定。',
    impact: '同名スキルで一部分類差が発生しうる。'
  },
  {
    field: 'name',
    legacyMeaning: 'キャラ内で名称一意として扱う。',
    newMeaning: 'skillIdを主キーにし、同名別IDを許容。',
    impact: '衝突を解消できるが、UI側で表示統合方針が必要。'
  },
  {
    field: 'chara',
    legacyMeaning: '日本語名のみ。',
    newMeaning: 'rawCharaとnormalizedCharaを併存。',
    impact: '多言語/別名表記でも参照整合が保てる。'
  }
];

const replacementClassification = {
  replaceable: legacyRows.length - noMatch,
  needAdditionalImplementation: noMatch + nameMatch,
  nonReplaceable: noMatch
};

const artifacts = {
  generatedAt: new Date().toISOString(),
  sourcePriority: 'json/* as source of truth',
  sourceFiles: ['characters.json', 'styles.json', 'skills.json', 'passives.json', 'adoption_candidates.csv'],
  candidateDatabase: {
    version: '2.0.0-draft',
    counts: {
      characters: byCharacterName.size,
      normalizedCharacters: Object.keys(legacyCompatibleCharacters).length,
      styles: styles.length,
      skills: normalizedSkillRecords.length,
      passives: passives.length,
      legacyCompatibleSkillRows: candidateRows.length,
      conflictRows: mergedVariants.filter((v) => v.hasCostConflict || v.hasTypeConflict).length
    },
    legacyCompatible: {
      metadata: {
        sourceVersion: 'json-raw',
        generatedAt: new Date().toISOString(),
        characterCount: Object.keys(legacyCompatibleCharacters).length,
        totalSkills: candidateRows.length
      },
      characters: legacyCompatibleCharacters
    },
    canonicalSkills: normalizedSkillRecords
  },
  comparison: {
    coverage,
    replacementClassification,
    semanticDiffs,
    samples: {
      unmatchedLegacyRows: legacyRows
        .filter((r) => !candidateByName.has(`${r.chara}::${r.name}`))
        .slice(0, 30),
      conflictRows: mergedVariants
        .filter((v) => v.hasCostConflict || v.hasTypeConflict)
        .slice(0, 30),
      newOnlyRows: newOnlyRows.slice(0, 30)
    }
  }
};

fs.writeFileSync(path.join(JSON_DIR, 'migration_artifacts.json'), JSON.stringify(artifacts, null, 2));
fs.writeFileSync(path.join(JSON_DIR, 'new_skill_database.draft.json'), JSON.stringify(artifacts.candidateDatabase, null, 2));
fs.writeFileSync(path.join(JSON_DIR, 'migration_metrics.json'), JSON.stringify(artifacts.comparison, null, 2));

console.log(JSON.stringify({
  output: ['json/migration_artifacts.json', 'json/new_skill_database.draft.json', 'json/migration_metrics.json'],
  coverage,
  replacementClassification
}, null, 2));
