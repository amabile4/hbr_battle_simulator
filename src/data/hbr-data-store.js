import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { CharacterStyle } from '../domain/character-style.js';
import { Party } from '../domain/party.js';
import {
  isAdmiralCommandSkill as isAdmiralCommandSkillClassifier,
  isNormalAttackSkill as isNormalAttackSkillClassifier,
  isPursuitOnlySkill as isPursuitOnlySkillClassifier,
} from '../domain/skill-classifiers.js';
import { DEFAULT_INITIAL_SP } from '../config/battle-defaults.js';
import { validateDocument } from './schema-validator.js';
import {
  resolveSupportPassiveEntry,
  buildSupportPassive,
} from '../domain/support-skills-resolver.js';

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function readJsonOrFallback(path, fallbackFactory) {
  try {
    return readJson(path);
  } catch (error) {
    if (error?.code !== 'ENOENT') {
      throw error;
    }
    return typeof fallbackFactory === 'function' ? fallbackFactory() : fallbackFactory;
  }
}

function normalizeCharacterName(name) {
  return String(name ?? '')
    .split('—')[0]
    .trim();
}

function normalizeCharaText(name) {
  return String(name ?? '')
    .split('—')[0]
    .trim()
    .replace(/\s+/g, '');
}

function toDateValue(value) {
  const t = new Date(String(value ?? '')).getTime();
  return Number.isFinite(t) ? t : Number.POSITIVE_INFINITY;
}

const LIMIT_BREAK_MAX_BY_TIER = Object.freeze({
  A: 20,
  S: 10,
  SS: 4,
  SSR: 4,
});

const EXTRA_TURN_BLOCK_PATTERN = /SpecialStatusCountByType\(20\)\s*==\s*0/;
const OVERDRIVE_PATTERN = /IsOverDrive\(\)/;
const REINFORCED_PATTERN = /IsReinforcedMode\(\)/;

function parseConditionFlags(expression) {
  const text = String(expression ?? '');
  return {
    excludesExtraTurn: EXTRA_TURN_BLOCK_PATTERN.test(text),
    requiresOverDrive: OVERDRIVE_PATTERN.test(text),
    requiresReinforcedMode: REINFORCED_PATTERN.test(text),
  };
}

function mergeConditionFlags(...flagsList) {
  return flagsList.reduce(
    (acc, flags) => ({
      excludesExtraTurn: acc.excludesExtraTurn || Boolean(flags?.excludesExtraTurn),
      requiresOverDrive: acc.requiresOverDrive || Boolean(flags?.requiresOverDrive),
      requiresReinforcedMode: acc.requiresReinforcedMode || Boolean(flags?.requiresReinforcedMode),
    }),
    {
      excludesExtraTurn: false,
      requiresOverDrive: false,
      requiresReinforcedMode: false,
    }
  );
}

function mergeSkillVariant(baseVariant, overrideVariant) {
  if (baseVariant && overrideVariant && typeof baseVariant === 'object' && typeof overrideVariant === 'object') {
    const merged = {
      ...structuredClone(baseVariant),
      ...structuredClone(overrideVariant),
    };
    if (Array.isArray(baseVariant.parts) && Array.isArray(overrideVariant.parts)) {
      const parts = [];
      const maxLen = Math.max(baseVariant.parts.length, overrideVariant.parts.length);
      for (let i = 0; i < maxLen; i += 1) {
        const b = baseVariant.parts[i];
        const o = overrideVariant.parts[i];
        if (b && o) {
          parts.push({
            ...structuredClone(b),
            ...structuredClone(o),
          });
        } else if (o) {
          parts.push(structuredClone(o));
        } else if (b) {
          parts.push(structuredClone(b));
        }
      }
      merged.parts = parts;
    }
    return merged;
  }
  return overrideVariant ?? baseVariant;
}

function mergeSkillPart(basePart, overridePart) {
  const merged = {
    ...structuredClone(basePart ?? {}),
    ...structuredClone(overridePart ?? {}),
  };

  if (Array.isArray(basePart?.strval) && Array.isArray(overridePart?.strval)) {
    const strval = [];
    const maxLen = Math.max(basePart.strval.length, overridePart.strval.length);
    for (let i = 0; i < maxLen; i += 1) {
      const b = basePart.strval[i];
      const o = overridePart.strval[i];
      if (b && o) {
        strval.push(mergeSkillVariant(b, o));
      } else if (o !== undefined) {
        strval.push(structuredClone(o));
      } else {
        strval.push(structuredClone(b));
      }
    }
    merged.strval = strval;
  }

  return merged;
}

function createPassiveMeaningKey(passive) {
  return JSON.stringify({
    label: String(passive?.label ?? ''),
    name: String(passive?.name ?? ''),
    desc: String(passive?.desc ?? ''),
    info: String(passive?.info ?? ''),
    timing: String(passive?.timing ?? ''),
    condition: String(passive?.condition ?? ''),
    effect: String(passive?.effect ?? ''),
    activRate: Number(passive?.activ_rate ?? passive?.activRate ?? 0),
    autoType: String(passive?.auto_type ?? passive?.autoType ?? ''),
    limit: Number(passive?.limit ?? 0),
    requiredLimitBreakLevel: Number(passive?.requiredLimitBreakLevel ?? passive?.lb ?? 0),
    parts: Array.isArray(passive?.parts) ? passive.parts : [],
  });
}

function clonePassiveWithSource(passive, sourceType, sourceMeta = {}) {
  return {
    ...structuredClone(passive),
    tier: String(passive?.ct ?? passive?.tier ?? ''),
    sourceType: String(sourceType ?? 'style'),
    sourceMeta: structuredClone(sourceMeta),
    requiredLimitBreakLevel: Number.isFinite(Number(passive?.lb))
      ? Number(passive.lb)
      : Number(passive?.requiredLimitBreakLevel ?? 0),
  };
}

export class HbrDataStore {
  constructor(payload) {
    this.characters = payload.characters;
    this.styles = payload.styles;
    this.skills = (payload.skills ?? []).map((skill) => {
      // is_adv: true かつ sp_cost > 0 のスキルは「SP0以上であれば使用可能」条件を持つ（仕組みB）
      if (skill.is_adv === true && Number(skill.sp_cost ?? 0) > 0) {
        const existingCond = String(skill.cond ?? '').trim();
        const addedCond = 'Sp()>=0';
        return {
          ...skill,
          cond: existingCond ? `${existingCond}&&${addedCond}` : addedCond,
        };
      }
      return skill;
    });
    this.passives = payload.passives;
    this.accessories = payload.accessories ?? [];
    this.skillRuleOverrides = payload.skillRuleOverrides ?? [];
    this.epRuleOverrides = payload.epRuleOverrides ?? [];
    this.transcendenceRuleOverrides = payload.transcendenceRuleOverrides ?? [];
    this.supportSkills = payload.supportSkills ?? [];

    this.skillDbSchema = payload.skillDbSchema;
    this.skillDbDraft = payload.skillDbDraft;
    this.skillAvailability = {
      includeMasterSkills: payload.skillAvailability?.includeMasterSkills ?? true,
      includeOrbSkills: payload.skillAvailability?.includeOrbSkills ?? true,
    };

    this.charactersById = new Map(this.characters.map((row) => [Number(row.id), row]));
    this.charactersByLabel = new Map(
      this.characters.map((row) => [String(row.label ?? ''), row])
    );
    this.characterSortMetaByLabel = this.buildCharacterSortMetaByLabel(this.characters);
    this.stylesById = new Map(this.styles.map((row) => [Number(row.id), row]));
    this.skillsById = new Map(this.skills.map((row) => [Number(row.id), row]));
    this.skillRuleOverridesById = new Map(
      this.skillRuleOverrides.map((row) => [Number(row.id), row])
    );
    this.canonicalSkillById = new Map(
      (this.skillDbDraft.canonicalSkills ?? []).map((row) => [Number(row.skillId), row])
    );
    this.supportSkillsByLabel = new Map(
      this.supportSkills.map((g) => [String(g.label ?? ''), g])
    );
  }

  buildCharacterSortMetaByLabel(characters) {
    const teamOrder = new Map();
    const sortMeta = new Map();
    let nextTeamOrder = 0;

    for (let i = 0; i < characters.length; i += 1) {
      const row = characters[i];
      const label = String(row.label ?? '');
      if (!label || sortMeta.has(label)) {
        continue;
      }

      const teamRaw = row.team;
      const team = teamRaw === undefined || teamRaw === null ? '' : String(teamRaw);

      if (team && !teamOrder.has(team)) {
        teamOrder.set(team, nextTeamOrder);
        nextTeamOrder += 1;
      }

      sortMeta.set(label, {
        team,
        teamOrder: team ? teamOrder.get(team) : Number.POSITIVE_INFINITY,
        characterOrder: i,
      });
    }

    return sortMeta;
  }

  getEpRuleForStyle(style, character) {
    if (!style || !character) {
      return null;
    }

    const styleId = Number(style.id);
    const characterId = String(character.label ?? '');
    const role = String(style.role ?? '');

    const byStyle = this.epRuleOverrides.find((row) => Number(row.styleId) === styleId) ?? null;
    if (byStyle) {
      return structuredClone(byStyle);
    }

    const byCharacterRole =
      this.epRuleOverrides.find(
        (row) =>
          String(row.characterId ?? '') === characterId &&
          String(row.role ?? '') === role
      ) ?? null;
    return byCharacterRole ? structuredClone(byCharacterRole) : null;
  }

  static fromJsonDirectory(baseDir = 'json') {
    const dir = resolve(baseDir);
    return new HbrDataStore({
      characters: readJson(resolve(dir, 'characters.json')),
      styles: readJson(resolve(dir, 'styles.json')),
      skills: readJson(resolve(dir, 'skills.json')),
      passives: readJson(resolve(dir, 'passives.json')),
      accessories: readJson(resolve(dir, 'accessories.json')),
      skillRuleOverrides: readJson(resolve(dir, 'skill_rule_overrides.json')),
      epRuleOverrides: readJson(resolve(dir, 'ep_rule_overrides.json')),
      transcendenceRuleOverrides: readJson(resolve(dir, 'transcendence_rule_overrides.json')),
      skillDbSchema: readJson(resolve(dir, 'new_skill_database.schema.json')),
      skillDbDraft: readJsonOrFallback(resolve(dir, 'reports/migration/new_skill_database.draft.json'), {}),
      supportSkills: readJsonOrFallback(resolve(dir, 'support_skills.json'), []),
    });
  }

  static fromRawData(payload) {
    if (!payload || typeof payload !== 'object') {
      throw new Error('fromRawData requires a payload object.');
    }

    return new HbrDataStore({
      characters: payload.characters ?? [],
      styles: payload.styles ?? [],
      skills: payload.skills ?? [],
      passives: payload.passives ?? [],
      accessories: payload.accessories ?? [],
      skillRuleOverrides: payload.skillRuleOverrides ?? [],
      epRuleOverrides: payload.epRuleOverrides ?? [],
      transcendenceRuleOverrides: payload.transcendenceRuleOverrides ?? [],
      skillDbSchema: payload.skillDbSchema ?? {},
      skillDbDraft: payload.skillDbDraft ?? {},
      skillAvailability: payload.skillAvailability ?? {},
      supportSkills: payload.supportSkills ?? [],
    });
  }

  getSupportGroupByLabel(resonanceLabel) {
    return this.supportSkillsByLabel.get(String(resonanceLabel ?? '')) ?? null;
  }

  listSupportStyleCandidates(mainStyleId) {
    const mainStyle = this.getStyleById(mainStyleId);
    if (!mainStyle) return [];
    const mainTier = String(mainStyle.tier ?? '').toUpperCase();
    if (!['SS', 'SSR'].includes(mainTier)) return [];
    // 'None' 文字列と空配列はどちらも「無属性」として扱い、有効属性のみ抽出する
    const toEffective = (elements) =>
      (Array.isArray(elements) ? elements : []).filter((el) => el && String(el) !== 'None');
    const mainEffective = toEffective(mainStyle.elements);
    const mainIsNone = mainEffective.length === 0;
    const mainElementSet = new Set(mainEffective);
    return this.styles.filter((s) => {
      if (Number(s.id) === Number(mainStyleId)) return false;
      const tier = String(s.tier ?? '').toUpperCase();
      if (!['SS', 'SSR'].includes(tier)) return false;
      const sEffective = toEffective(s.elements);
      if (mainIsNone) {
        // 無属性メインは、無属性（有効属性なし）の候補のみとマッチ
        return sEffective.length === 0;
      }
      // 通常属性メインは、有効属性が一致する候補とマッチ（'None' は無視）
      return sEffective.some((el) => mainElementSet.has(el));
    });
  }

  resolveSupportSkillPassive(supportStyleId, limitBreakLevel) {
    const supportStyle = this.getStyleById(supportStyleId);
    if (!supportStyle) return null;
    const resonance = supportStyle.resonance;
    if (!resonance) return null;
    const group = this.getSupportGroupByLabel(resonance);
    if (!group) return null;
    const entry = resolveSupportPassiveEntry(group, Number(limitBreakLevel ?? 0));
    if (!entry?.passive) return null;
    return buildSupportPassive(entry.passive, {
      supportGroupLabel: String(resonance),
      supportStyleId: Number(supportStyleId),
      limitBreakLevel: Number(limitBreakLevel ?? 0),
    });
  }

  getTranscendenceRuleByStyleId(styleId) {
    const id = Number(styleId);
    return (
      this.transcendenceRuleOverrides.find((rule) => Number(rule.styleId) === id) ?? null
    );
  }

  listTranscendenceRules() {
    return this.transcendenceRuleOverrides.map((rule) => structuredClone(rule));
  }

  setSkillAvailability(next = {}) {
    this.skillAvailability = {
      ...this.skillAvailability,
      ...next,
    };
  }

  validateSkillDatabaseDraft() {
    return validateDocument(this.skillDbSchema, this.skillDbDraft);
  }

  assertSkillDatabaseDraftValid() {
    const result = this.validateSkillDatabaseDraft();
    if (!result.valid) {
      const preview = result.errors.slice(0, 10).join('\n');
      throw new Error(`new_skill_database.draft.json failed validation:\n${preview}`);
    }
  }

  mergeSkillWithOverride(skill) {
    if (!skill || typeof skill !== 'object') {
      return null;
    }

    const id = Number(skill.id);
    const override = this.skillRuleOverridesById.get(id);
    if (!override) {
      return structuredClone(skill);
    }

    const merged = {
      ...structuredClone(skill),
      ...structuredClone(override),
    };

    if (Array.isArray(skill.parts) && Array.isArray(override.parts)) {
      const parts = [];
      const maxLen = Math.max(skill.parts.length, override.parts.length);
      for (let i = 0; i < maxLen; i += 1) {
        const basePart = skill.parts[i];
        const overridePart = override.parts[i];
        if (basePart && overridePart) {
          parts.push(mergeSkillPart(basePart, overridePart));
        } else if (overridePart) {
          parts.push(structuredClone(overridePart));
        } else if (basePart) {
          parts.push(structuredClone(basePart));
        }
      }
      merged.parts = parts;
    }

    return merged;
  }

  getCharacterById(characterId) {
    return this.charactersById.get(Number(characterId)) ?? null;
  }

  getCharacterByLabel(characterLabel) {
    return this.charactersByLabel.get(String(characterLabel ?? '')) ?? null;
  }

  getStyleById(styleId) {
    return this.stylesById.get(Number(styleId)) ?? null;
  }

  getSkillById(skillId) {
    const raw = this.skillsById.get(Number(skillId)) ?? null;
    return this.mergeSkillWithOverride(raw);
  }

  getLimitBreakMaxByTier(tier) {
    const key = String(tier ?? '').toUpperCase();
    return LIMIT_BREAK_MAX_BY_TIER[key] ?? 0;
  }

  getStyleLimitBreakMax(styleIdOrStyle) {
    const style =
      typeof styleIdOrStyle === 'object' && styleIdOrStyle !== null
        ? styleIdOrStyle
        : this.getStyleById(styleIdOrStyle);
    if (!style) {
      return 0;
    }
    return this.getLimitBreakMaxByTier(style.tier);
  }

  listStylesByCharacter(characterLabelOrName) {
    const key = String(characterLabelOrName ?? '').trim();
    return this.styles.filter((style) => {
      const label = String(style.chara_label ?? '').trim();
      const normalized = normalizeCharacterName(style.chara);
      return label === key || normalized === key;
    });
  }

  isRestrictedSkill(skill) {
    return Number(skill?.is_restricted ?? 0) === 1;
  }

  isCommandSelectableSkill(skill) {
    if (!skill) {
      return false;
    }

    if (this.isPassiveSkill(skill)) {
      return false;
    }

    if (isPursuitOnlySkillClassifier(skill)) {
      return false;
    }

    return true;
  }

  isPassiveSkill(skill) {
    if (!skill || typeof skill !== 'object') {
      return false;
    }

    if (skill.passive && typeof skill.passive === 'object') {
      return true;
    }

    const label = String(skill.label ?? '');
    return label.includes('PassiveSkill');
  }

  cloneSkillWithSource(skill, sourceType, sourceMeta = {}) {
    return {
      ...structuredClone(skill),
      sourceType,
      sourceMeta,
    };
  }

  isAdmiralCommandSkill(skill) {
    return isAdmiralCommandSkillClassifier(skill);
  }

  getBasicCandidateStylesByCharacter(characterLabelOrName) {
    const styles = this.listStylesByCharacter(characterLabelOrName).filter((style) =>
      ['SS', 'SSR'].includes(String(style.tier ?? ''))
    );
    if (styles.length === 0) {
      return [];
    }

    const minDate = Math.min(...styles.map((style) => toDateValue(style.in_date)));
    return styles.filter((style) => toDateValue(style.in_date) === minDate);
  }

  isGeneralizedTransferableSkill(characterLabel, skillId) {
    const id = Number(skillId);
    const candidateIds = new Set(
      this.getBasicCandidateStylesByCharacter(characterLabel).map((style) => Number(style.id))
    );

    if (candidateIds.size === 0) {
      return false;
    }

    for (const style of this.listStylesByCharacter(characterLabel)) {
      if (!candidateIds.has(Number(style.id)) || !style.generalize) {
        continue;
      }

      const hasSkill = (style.skills ?? []).some((row) => Number(row.id) === id);
      if (hasSkill) {
        return true;
      }
    }

    return false;
  }

  canStyleUseSkill(style, skill) {
    if (!style || !skill) {
      return false;
    }

    if (String(style.role ?? '') === 'Admiral' && isNormalAttackSkillClassifier(skill)) {
      return false;
    }

    if (this.isAdmiralCommandSkill(skill) && String(style.role ?? '') !== 'Admiral') {
      return false;
    }

    if (!this.isRestrictedSkill(skill)) {
      return true;
    }

    const styleHasSkill = (style.skills ?? []).some((row) => Number(row.id) === Number(skill.id));
    if (styleHasSkill) {
      return true;
    }

    return this.isGeneralizedTransferableSkill(style.chara_label, skill.id);
  }

  getMasterSkillByCharacterLabel(characterLabel) {
    const character = this.getCharacterByLabel(characterLabel);
    const skill = character?.masterly?.skill ?? null;
    return skill && typeof skill === 'object' ? this.mergeSkillWithOverride(skill) : null;
  }

  listOrbSkills() {
    const out = [];
    const seen = new Set();

    for (const accessory of this.accessories) {
      const skills = Array.isArray(accessory.skill) ? accessory.skill : [];
      for (const skill of skills) {
        const id = Number(skill?.id);
        if (!Number.isFinite(id) || seen.has(id)) {
          continue;
        }
        seen.add(id);
        out.push({
          ...this.mergeSkillWithOverride(skill),
          sourceAccessoryId: Number(accessory.id),
          sourceAccessoryLabel: String(accessory.label ?? ''),
          sourceAccessoryName: String(accessory.name ?? ''),
        });
      }
    }

    const deduped = [];
    const uniqueByMeaning = new Set();
    for (const passive of out) {
      const key = [
        String(passive.label ?? ''),
        String(passive.name ?? ''),
      ].join('|');
      if (uniqueByMeaning.has(key)) {
        continue;
      }
      uniqueByMeaning.add(key);
      deduped.push(passive);
    }

    deduped.sort((a, b) => Number(a.id) - Number(b.id));
    return deduped;
  }

  resolveSkillUseCount(useCount, policy = 'max') {
    if (typeof useCount === 'number') {
      if (useCount < 0) {
        return {
          mode: 'unlimited',
          displayUses: null,
          maxUses: null,
          minUses: null,
          expandable: true,
        };
      }

      return {
        mode: 'fixed',
        displayUses: useCount,
        maxUses: useCount,
        minUses: useCount,
        expandable: true,
      };
    }

    if (!Array.isArray(useCount) || useCount.length === 0) {
      return {
        mode: 'unknown',
        displayUses: null,
        maxUses: null,
        minUses: null,
        expandable: false,
      };
    }

    const numeric = useCount.map((v) => Number(v)).filter((v) => Number.isFinite(v));
    if (numeric.length === 1 && numeric[0] < 0) {
      const fixed = Math.abs(numeric[0]);
      return {
        mode: 'fixed_limited',
        displayUses: fixed,
        maxUses: fixed,
        minUses: fixed,
        expandable: false,
      };
    }

    const positives = numeric.filter((v) => v >= 0);
    if (positives.length === 0) {
      return {
        mode: 'unknown',
        displayUses: null,
        maxUses: null,
        minUses: null,
        expandable: false,
      };
    }

    const minUses = Math.min(...positives);
    const maxUses = Math.max(...positives);
    return {
      mode: 'range',
      displayUses: policy === 'min' ? minUses : maxUses,
      maxUses,
      minUses,
      expandable: true,
    };
  }

  getSkillUsageRule(skillIdOrSkill, policy = 'max') {
    const skillRaw =
      typeof skillIdOrSkill === 'object' && skillIdOrSkill !== null
        ? skillIdOrSkill
        : this.getSkillById(skillIdOrSkill);
    const skill = this.mergeSkillWithOverride(skillRaw);

    if (!skill) {
      return null;
    }

    return this.resolveSkillUseCount(skill.use_count, policy);
  }

  listSkillsByStyleId(styleId) {
    const style = this.getStyleById(styleId);
    if (!style) {
      return [];
    }

    const styles = this.listStylesByCharacter(style.chara_label).sort(
      (a, b) => toDateValue(a.in_date) - toDateValue(b.in_date)
    );

    const out = [];
    const seen = new Set();

    for (const rowStyle of styles) {
      for (const skillRef of rowStyle.skills ?? []) {
        const skill = this.getSkillById(skillRef.id);
        if (!skill || seen.has(Number(skill.id))) {
          continue;
        }

        if (!this.canStyleUseSkill(style, skill)) {
          continue;
        }

        if (!this.isCommandSelectableSkill(skill)) {
          continue;
        }

        seen.add(Number(skill.id));
        out.push(
          this.cloneSkillWithSource(skill, 'style', {
            sourceStyleId: Number(rowStyle.id),
            sourceStyleName: String(rowStyle.name ?? ''),
          })
        );
      }
    }

    if (this.skillAvailability.includeMasterSkills) {
      const masterSkill = this.getMasterSkillByCharacterLabel(style.chara_label);
      const masterId = Number(masterSkill?.id);
      if (masterSkill && Number.isFinite(masterId) && !seen.has(masterId)) {
        seen.add(masterId);
        out.push(
          this.cloneSkillWithSource(masterSkill, 'master', {
            sourceCharacterLabel: String(style.chara_label ?? ''),
          })
        );
      }
    }

    if (this.skillAvailability.includeOrbSkills) {
      for (const orbSkill of this.listOrbSkills()) {
        const id = Number(orbSkill.id);
        if (seen.has(id)) {
          continue;
        }
        seen.add(id);
        out.push(
          this.cloneSkillWithSource(orbSkill, 'orb', {
            sourceAccessoryId: Number(orbSkill.sourceAccessoryId),
            sourceAccessoryName: String(orbSkill.sourceAccessoryName ?? ''),
          })
        );
      }
    }

    if (String(style.role ?? '') === 'Admiral') {
      out.sort((a, b) => {
        const aCmd = this.isAdmiralCommandSkill(a) ? 0 : 1;
        const bCmd = this.isAdmiralCommandSkill(b) ? 0 : 1;
        if (aCmd !== bCmd) {
          return aCmd - bCmd;
        }
        return Number(a.id) - Number(b.id);
      });
    }

    return out;
  }

  listEquipableSkillsByStyleId(styleId) {
    const style = this.getStyleById(styleId);
    if (!style) {
      return [];
    }

    const commandSkills = this.listSkillsByStyleId(styleId);
    const out = [...commandSkills];
    const seen = new Set(commandSkills.map((skill) => Number(skill.id)));

    const styles = this.listStylesByCharacter(style.chara_label).sort(
      (a, b) => toDateValue(a.in_date) - toDateValue(b.in_date)
    );

    for (const rowStyle of styles) {
      for (const skillRef of rowStyle.skills ?? []) {
        const skill = this.getSkillById(skillRef.id);
        const id = Number(skill?.id);
        if (!skill || !Number.isFinite(id) || seen.has(id)) {
          continue;
        }
        if (!this.canStyleUseSkill(style, skill)) {
          continue;
        }
        if (!this.isPassiveSkill(skill)) {
          continue;
        }

        seen.add(id);
        out.push(
          this.cloneSkillWithSource(skill, 'passive', {
            sourceStyleId: Number(rowStyle.id),
            sourceStyleName: String(rowStyle.name ?? ''),
          })
        );
      }
    }

    if (this.skillAvailability.includeMasterSkills) {
      const masterSkill = this.getMasterSkillByCharacterLabel(style.chara_label);
      const masterId = Number(masterSkill?.id);
      if (
        masterSkill &&
        Number.isFinite(masterId) &&
        !seen.has(masterId) &&
        this.isPassiveSkill(masterSkill)
      ) {
        seen.add(masterId);
        out.push(
          this.cloneSkillWithSource(masterSkill, 'master', {
            sourceCharacterLabel: String(style.chara_label ?? ''),
          })
        );
      }
    }

    if (this.skillAvailability.includeOrbSkills) {
      for (const orbSkill of this.listOrbSkills()) {
        const id = Number(orbSkill.id);
        if (seen.has(id) || !this.isPassiveSkill(orbSkill)) {
          continue;
        }
        seen.add(id);
        out.push(
          this.cloneSkillWithSource(orbSkill, 'orb', {
            sourceAccessoryId: Number(orbSkill.sourceAccessoryId),
            sourceAccessoryName: String(orbSkill.sourceAccessoryName ?? ''),
          })
        );
      }
    }

    return out;
  }

  getAdditionalTurnRule(skillIdOrSkill) {
    const skillRaw =
      typeof skillIdOrSkill === 'object' && skillIdOrSkill !== null
        ? skillIdOrSkill
        : this.getSkillById(skillIdOrSkill);
    const skill = this.mergeSkillWithOverride(skillRaw);
    if (!skill) {
      return null;
    }

    const hasAdditionalTurnPart = (skill.parts ?? []).some(
      (part) => String(part.skill_type ?? '') === 'AdditionalTurn'
    );
    if (!hasAdditionalTurnPart) {
      return null;
    }

    const skillConditionFlags = mergeConditionFlags(
      parseConditionFlags(skill.cond),
      parseConditionFlags(skill.iuc_cond)
    );
    const additionalTurnParts = (skill.parts ?? []).filter(
      (part) => String(part.skill_type ?? '') === 'AdditionalTurn'
    );
    const partConditionFlags = additionalTurnParts.map((part) =>
      mergeConditionFlags(
        parseConditionFlags(part.cond),
        parseConditionFlags(part.hit_condition),
        parseConditionFlags(part.target_condition)
      )
    );
    const aggregatePartFlags = mergeConditionFlags(...partConditionFlags);

    const defaultSkillUsableInExtraTurn = !skillConditionFlags.excludesExtraTurn;
    const defaultAdditionalTurnGrantInExtraTurn =
      defaultSkillUsableInExtraTurn && !aggregatePartFlags.excludesExtraTurn;
    const overrideRules = skill.extra_turn_rules ?? {};
    const hasGrantOverride = overrideRules.additional_turn_grant_in_extra_turn !== undefined;
    const hasUsableOverride = overrideRules.skill_usable_in_extra_turn !== undefined;
    const additionalTurnTargets = additionalTurnParts.map((part) => ({
      targetType: String(part.target_type ?? ''),
      targetCondition: String(part.target_condition ?? ''),
    }));
    const additionalTurnTargetTypes = additionalTurnTargets.map((item) => item.targetType);

    return {
      skillId: Number(skill.id),
      skillUsableInExtraTurn:
        overrideRules.skill_usable_in_extra_turn ?? defaultSkillUsableInExtraTurn,
      additionalTurnGrantInExtraTurn:
        overrideRules.additional_turn_grant_in_extra_turn ?? defaultAdditionalTurnGrantInExtraTurn,
      conditions: {
        requiresOverDrive:
          skillConditionFlags.requiresOverDrive || aggregatePartFlags.requiresOverDrive,
        requiresReinforcedMode:
          skillConditionFlags.requiresReinforcedMode || aggregatePartFlags.requiresReinforcedMode,
        excludesExtraTurnForSkillUse: skillConditionFlags.excludesExtraTurn,
        excludesExtraTurnForAdditionalTurnGrant: aggregatePartFlags.excludesExtraTurn,
      },
      additionalTurnTargets,
      additionalTurnTargetTypes,
      source: hasGrantOverride || hasUsableOverride ? 'override' : 'derived',
    };
  }

  listTriggeredSkillsByStyleId(styleId) {
    const style = this.getStyleById(styleId);
    if (!style) {
      return [];
    }

    const styles = this.listStylesByCharacter(style.chara_label).sort(
      (a, b) => toDateValue(a.in_date) - toDateValue(b.in_date)
    );

    const out = [];
    const seen = new Set();
    for (const rowStyle of styles) {
      for (const skillRef of rowStyle.skills ?? []) {
        const skill = this.getSkillById(skillRef.id);
        if (!skill || seen.has(Number(skill.id))) {
          continue;
        }

        if (!this.canStyleUseSkill(style, skill)) {
          continue;
        }

        if (this.isCommandSelectableSkill(skill)) {
          continue;
        }

        seen.add(Number(skill.id));
        out.push(
          this.cloneSkillWithSource(skill, 'triggered', {
            sourceStyleId: Number(rowStyle.id),
            sourceStyleName: String(rowStyle.name ?? ''),
          })
        );
      }
    }

    return out;
  }

  listPassivesByStyleId(styleId, options = {}) {
    const style = this.getStyleById(styleId);
    if (!style) {
      return [];
    }
    const maxLimitBreak = this.getStyleLimitBreakMax(style);
    const limitBreakLevelRaw = options.limitBreakLevel;
    const limitBreakLevel = Number.isFinite(Number(limitBreakLevelRaw))
      ? Math.max(0, Math.min(maxLimitBreak, Number(limitBreakLevelRaw)))
      : maxLimitBreak;

    const out = [];
    const seen = new Set();

    for (const passive of style.passives ?? []) {
      const id = Number(passive?.id);
      if (!Number.isFinite(id) || seen.has(id)) {
        continue;
      }
      seen.add(id);
      out.push(
        clonePassiveWithSource(passive, 'style', {
          sourceStyleId: Number(style.id),
          sourceStyleName: String(style.name ?? ''),
          sourceCharacterId: String(style.chara_label ?? ''),
          sourceCharacterName: normalizeCharacterName(style.chara),
        })
      );
    }

    const styleName = String(style.name ?? '');
    const styleTier = String(style.tier ?? '');
    const styleCharaNorm = normalizeCharaText(style.chara);
    for (const passive of this.passives ?? []) {
      const id = Number(passive?.id);
      if (!Number.isFinite(id) || seen.has(id)) {
        continue;
      }

      const sameStyleName = String(passive.style ?? '') === styleName;
      const sameTier = !passive.ct || String(passive.ct) === styleTier;
      const passiveCharaNorm = normalizeCharaText(passive.chara);
      const sameCharacter = !passive.chara || passiveCharaNorm === styleCharaNorm;
      if (!sameStyleName || !sameTier || !sameCharacter) {
        continue;
      }

      seen.add(id);
      out.push(
        clonePassiveWithSource(passive, 'database', {
          sourceStyleId: Number(style.id),
          sourceStyleName: String(style.name ?? ''),
          sourceCharacterId: String(style.chara_label ?? ''),
          sourceCharacterName: normalizeCharacterName(style.chara),
        })
      );
    }

    const deduped = [];
    const uniqueByMeaning = new Set();
    for (const passive of out) {
      const key = createPassiveMeaningKey(passive);
      if (uniqueByMeaning.has(key)) {
        continue;
      }
      uniqueByMeaning.add(key);
      deduped.push(passive);
    }

    const acquired = deduped.filter(
      (passive) => Number(passive.requiredLimitBreakLevel ?? 0) <= limitBreakLevel
    );

    acquired.sort((a, b) => {
      const lbDelta =
        Number(a.requiredLimitBreakLevel ?? 0) - Number(b.requiredLimitBreakLevel ?? 0);
      if (lbDelta !== 0) {
        return lbDelta;
      }
      return Number(a.id) - Number(b.id);
    });
    return acquired;
  }

  listCharacterCandidates() {
    const styleCounts = new Map();

    for (const style of this.styles) {
      if (!Array.isArray(style.skills) || style.skills.length === 0) {
        continue;
      }

      const label = String(style.chara_label ?? '');
      styleCounts.set(label, (styleCounts.get(label) ?? 0) + 1);
    }

    const out = [];
    for (const [label, styleCount] of styleCounts.entries()) {
      const character = this.getCharacterByLabel(label);
      const name = normalizeCharacterName(character?.name ?? label);
      const sortMeta = this.characterSortMetaByLabel.get(label) ?? null;
      out.push({
        label,
        name,
        styleCount,
        team: sortMeta?.team ?? '',
        teamOrder: sortMeta?.teamOrder ?? Number.POSITIVE_INFINITY,
        characterOrder: sortMeta?.characterOrder ?? Number.POSITIVE_INFINITY,
      });
    }

    out.sort((a, b) => {
      const teamDelta = a.teamOrder - b.teamOrder;
      if (teamDelta !== 0) {
        return teamDelta;
      }

      const characterDelta = a.characterOrder - b.characterOrder;
      if (characterDelta !== 0) {
        return characterDelta;
      }

      const nameDelta = a.name.localeCompare(b.name, 'ja');
      if (nameDelta !== 0) {
        return nameDelta;
      }

      return String(a.label).localeCompare(String(b.label), 'ja');
    });
    return out;
  }

  putCharacter(character) {
    const row = structuredClone(character);
    this.charactersById.set(Number(row.id), row);
    this.characters = [...this.charactersById.values()];
    return row;
  }

  putStyle(style) {
    const row = structuredClone(style);
    this.stylesById.set(Number(row.id), row);
    this.styles = [...this.stylesById.values()];
    return row;
  }

  putSkill(skill) {
    const row = structuredClone(skill);
    this.skillsById.set(Number(row.id), row);
    this.skills = [...this.skillsById.values()];
    return row;
  }

  assignSkillToStyle(styleId, skillId) {
    const style = this.getStyleById(styleId);
    const skill = this.getSkillById(skillId);

    if (!style || !skill) {
      throw new Error(`Style or skill not found. styleId=${styleId}, skillId=${skillId}`);
    }

    const current = Array.isArray(style.skills) ? [...style.skills] : [];
    if (!current.some((entry) => Number(entry.id) === Number(skillId))) {
      current.push({ id: Number(skillId) });
    }

    const nextStyle = { ...style, skills: current };
    this.putStyle(nextStyle);
    return nextStyle;
  }

  buildCharacterStyle({
    styleId,
    partyIndex,
    initialSP = DEFAULT_INITIAL_SP,
    initialMotivation = 0,
    initialDpState = null,
    initialBreak = false,
    spBonus = 0,
    drivePiercePercent = 0,
    normalAttackElements = [],
    equippedSkillIds = null,
    limitBreakLevel = null,
    supportStyleId = null,
    supportStyleLimitBreakLevel = 0,
  }) {
    const style = this.getStyleById(styleId);
    if (!style) {
      throw new Error(`Style not found: ${styleId}`);
    }

    const character =
      this.characters.find((row) => String(row.label) === String(style.chara_label)) ?? null;

    if (!character) {
      throw new Error(`Character not found for style.chara_label=${style.chara_label}`);
    }

    const allStyleSkills = this.listEquipableSkillsByStyleId(style.id)
      .map((skill) => {
        const canonical = this.canonicalSkillById.get(Number(skill.id));
        const additionalTurnRule = this.getAdditionalTurnRule(skill);
        return {
          ...skill,
          canonicalSkill: canonical ?? null,
          usage: this.resolveSkillUseCount(skill.use_count, 'max'),
          additionalTurnRule,
        };
      });
    const equippedSet = Array.isArray(equippedSkillIds)
      ? new Set(equippedSkillIds.map((id) => Number(id)))
      : null;
    const styleSkills = equippedSet
      ? allStyleSkills.filter((skill) => equippedSet.has(Number(skill.id)))
      : allStyleSkills;
    const triggeredSkills = this.listTriggeredSkillsByStyleId(style.id).map((skill) => ({
      ...skill,
      usage: this.resolveSkillUseCount(skill.use_count, 'max'),
    }));
    const maxLimitBreak = this.getStyleLimitBreakMax(style);
    const normalizedLimitBreak = Number.isFinite(Number(limitBreakLevel))
      ? Math.max(0, Math.min(maxLimitBreak, Number(limitBreakLevel)))
      : maxLimitBreak;
    const mainPassives = this.listPassivesByStyleId(style.id, { limitBreakLevel: normalizedLimitBreak });
    const supportPassive =
      supportStyleId != null
        ? this.resolveSupportSkillPassive(Number(supportStyleId), Number(supportStyleLimitBreakLevel))
        : null;
    const passives = supportPassive ? [...mainPassives, supportPassive] : mainPassives;
    const epRule = this.getEpRuleForStyle(style, character);
    const ep = epRule?.ep ?? {};
    const hasEpRelatedSkill = allStyleSkills.some((skill) => {
      const consumeType = String(skill.consume_type ?? skill.consumeType ?? '');
      if (consumeType === 'Ep') {
        return true;
      }
      return (skill.parts ?? []).some((part) => String(part.skill_type ?? '') === 'HealEp');
    });
    const inferredEpMax = hasEpRelatedSkill ? 10 : 0;
    const epMax = Number.isFinite(Number(ep.max)) ? Number(ep.max) : inferredEpMax;
    const epOdMax = Number.isFinite(Number(ep.odMax)) ? Number(ep.odMax) : epMax;
    const styleBaseMaxDp = Number(style.base_param?.dp ?? 0);

    return new CharacterStyle({
      characterId: String(character.label),
      characterName: normalizeCharacterName(character.name),
      styleId: Number(style.id),
      styleName: String(style.name),
      role: String(style.role ?? ''),
      elements: Array.isArray(style.elements) ? [...style.elements] : [],
      weaponType: String(style.type ?? ''),
      transcendenceRule: this.getTranscendenceRuleByStyleId(style.id),
      partyIndex: Number(partyIndex),
      position: Number(partyIndex),
      drivePiercePercent: Number(drivePiercePercent),
      normalAttackElements: Array.isArray(normalAttackElements) ? [...normalAttackElements] : [],
      initialSP: Number(initialSP),
      initialMotivation: Number(initialMotivation),
      baseMaxDp: Number(initialDpState?.baseMaxDp ?? styleBaseMaxDp),
      currentDp: initialDpState?.currentDp,
      effectiveDpCap: initialDpState?.effectiveDpCap,
      isBreak: Boolean(initialBreak),
      initialEP: Number(ep.initial ?? 0),
      spBonus: Number(spBonus),
      spMin: 0,
      spMax: 20,
      epMin: Number(ep.min ?? 0),
      epMax,
      epOdMax,
      epRule,
      limitBreakLevel: normalizedLimitBreak,
      supportStyleId: supportStyleId != null ? Number(supportStyleId) : null,
      supportStyleLimitBreakLevel: Number(supportStyleLimitBreakLevel ?? 0),
      skills: styleSkills,
      triggeredSkills,
      passives,
    });
  }

  buildPartyFromStyleIds(styleIds, options = {}) {
    if (!Array.isArray(styleIds) || styleIds.length !== 6) {
      throw new Error('buildPartyFromStyleIds requires exactly 6 style IDs.');
    }

    const initialSP = options.initialSP ?? DEFAULT_INITIAL_SP;
    const initialSpByPartyIndex = options.initialSpByPartyIndex ?? {};
    const spBonusMap = options.spBonusMap ?? {};
    const initialMotivationByPartyIndex = options.initialMotivationByPartyIndex ?? {};
    const initialDpStateByPartyIndex = options.initialDpStateByPartyIndex ?? {};
    const initialBreakByPartyIndex = options.initialBreakByPartyIndex ?? {};
    const drivePierceByPartyIndex = options.drivePierceByPartyIndex ?? {};
    const normalAttackElementsByPartyIndex = options.normalAttackElementsByPartyIndex ?? {};
    const skillSetsByPartyIndex = options.skillSetsByPartyIndex ?? {};
    const limitBreakLevelsByPartyIndex = options.limitBreakLevelsByPartyIndex ?? {};
    const supportStyleIdsByPartyIndex = options.supportStyleIdsByPartyIndex ?? {};
    const supportLimitBreakLevelsByPartyIndex = options.supportLimitBreakLevelsByPartyIndex ?? {};

    const members = styleIds.map((styleId, index) =>
      this.buildCharacterStyle({
        styleId,
        partyIndex: index,
        initialSP: Number(initialSpByPartyIndex[index] ?? initialSP),
        initialMotivation: Number(initialMotivationByPartyIndex[index] ?? 0),
        initialDpState:
          initialDpStateByPartyIndex[index] && typeof initialDpStateByPartyIndex[index] === 'object'
            ? initialDpStateByPartyIndex[index]
            : null,
        initialBreak: Boolean(initialBreakByPartyIndex[index]),
        spBonus: Number(spBonusMap[index] ?? 0),
        drivePiercePercent: Number(drivePierceByPartyIndex[index] ?? 0),
        normalAttackElements: Array.isArray(normalAttackElementsByPartyIndex[index])
          ? normalAttackElementsByPartyIndex[index]
          : [],
        equippedSkillIds: Array.isArray(skillSetsByPartyIndex[index])
          ? skillSetsByPartyIndex[index]
          : null,
        limitBreakLevel: Number(limitBreakLevelsByPartyIndex[index]),
        supportStyleId: supportStyleIdsByPartyIndex[index] ?? null,
        supportStyleLimitBreakLevel: Number(supportLimitBreakLevelsByPartyIndex[index] ?? 0),
      })
    );

    const uniqueCharacters = new Set(members.map((member) => member.characterId));
    if (uniqueCharacters.size !== members.length) {
      throw new Error('Party requires 6 unique characters (duplicate character detected).');
    }

    const admiralCount = members.filter((member) => String(member.role ?? '') === 'Admiral').length;
    if (admiralCount > 1) {
      throw new Error('Party can include at most one Admiral role member.');
    }

    return new Party(members);
  }
}
