import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { CharacterStyle } from '../domain/character-style.js';
import { Party } from '../domain/party.js';
import { validateDocument } from './schema-validator.js';

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function normalizeCharacterName(name) {
  return String(name ?? '')
    .split('—')[0]
    .trim();
}

function toDateValue(value) {
  const t = new Date(String(value ?? '')).getTime();
  return Number.isFinite(t) ? t : Number.POSITIVE_INFINITY;
}

export class HbrDataStore {
  constructor(payload) {
    this.characters = payload.characters;
    this.styles = payload.styles;
    this.skills = payload.skills;
    this.passives = payload.passives;
    this.accessories = payload.accessories ?? [];

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
    this.canonicalSkillById = new Map(
      (this.skillDbDraft.canonicalSkills ?? []).map((row) => [Number(row.skillId), row])
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

  static fromJsonDirectory(baseDir = 'json') {
    const dir = resolve(baseDir);
    return new HbrDataStore({
      characters: readJson(resolve(dir, 'characters.json')),
      styles: readJson(resolve(dir, 'styles.json')),
      skills: readJson(resolve(dir, 'skills.json')),
      passives: readJson(resolve(dir, 'passives.json')),
      accessories: readJson(resolve(dir, 'accessories.json')),
      skillDbSchema: readJson(resolve(dir, 'new_skill_database.schema.json')),
      skillDbDraft: readJson(resolve(dir, 'reports/migration/new_skill_database.draft.json')),
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
      skillDbSchema: payload.skillDbSchema ?? {},
      skillDbDraft: payload.skillDbDraft ?? {},
      skillAvailability: payload.skillAvailability ?? {},
    });
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
    return this.skillsById.get(Number(skillId)) ?? null;
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

    const name = String(skill.name ?? '');
    const label = String(skill.label ?? '');
    const desc = String(skill.desc ?? '');

    if (name === '追撃') {
      return false;
    }

    if (label.endsWith('Skill91')) {
      return false;
    }

    if (desc.includes('追撃でのみ発動可能')) {
      return false;
    }

    return true;
  }

  cloneSkillWithSource(skill, sourceType, sourceMeta = {}) {
    return {
      ...structuredClone(skill),
      sourceType,
      sourceMeta,
    };
  }

  isAdmiralCommandSkill(skill) {
    return String(skill?.name ?? '') === '指揮行動' && String(skill?.role ?? '') === 'Admiral';
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
    return skill && typeof skill === 'object' ? skill : null;
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
          ...skill,
          sourceAccessoryId: Number(accessory.id),
          sourceAccessoryLabel: String(accessory.label ?? ''),
          sourceAccessoryName: String(accessory.name ?? ''),
        });
      }
    }

    out.sort((a, b) => Number(a.id) - Number(b.id));
    return out;
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
    const skill =
      typeof skillIdOrSkill === 'object' && skillIdOrSkill !== null
        ? skillIdOrSkill
        : this.getSkillById(skillIdOrSkill);

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

    return out;
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

  buildCharacterStyle({ styleId, partyIndex, initialSP = 4, spBonus = 0, equippedSkillIds = null }) {
    const style = this.getStyleById(styleId);
    if (!style) {
      throw new Error(`Style not found: ${styleId}`);
    }

    const character =
      this.characters.find((row) => String(row.label) === String(style.chara_label)) ?? null;

    if (!character) {
      throw new Error(`Character not found for style.chara_label=${style.chara_label}`);
    }

    const allStyleSkills = this.listSkillsByStyleId(style.id)
      .map((skill) => {
        const canonical = this.canonicalSkillById.get(Number(skill.id));
        return {
          ...skill,
          canonicalSkill: canonical ?? null,
          usage: this.resolveSkillUseCount(skill.use_count, 'max'),
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

    return new CharacterStyle({
      characterId: String(character.label),
      characterName: normalizeCharacterName(character.name),
      styleId: Number(style.id),
      styleName: String(style.name),
      partyIndex: Number(partyIndex),
      position: Number(partyIndex),
      initialSP: Number(initialSP),
      spBonus: Number(spBonus),
      spMin: 0,
      spMax: 20,
      skills: styleSkills,
      triggeredSkills,
    });
  }

  buildPartyFromStyleIds(styleIds, options = {}) {
    if (!Array.isArray(styleIds) || styleIds.length !== 6) {
      throw new Error('buildPartyFromStyleIds requires exactly 6 style IDs.');
    }

    const initialSP = options.initialSP ?? 4;
    const spBonusMap = options.spBonusMap ?? {};
    const skillSetsByPartyIndex = options.skillSetsByPartyIndex ?? {};

    const members = styleIds.map((styleId, index) =>
      this.buildCharacterStyle({
        styleId,
        partyIndex: index,
        initialSP,
        spBonus: Number(spBonusMap[index] ?? 0),
        equippedSkillIds: Array.isArray(skillSetsByPartyIndex[index])
          ? skillSetsByPartyIndex[index]
          : null,
      })
    );

    const uniqueCharacters = new Set(members.map((member) => member.characterId));
    if (uniqueCharacters.size !== members.length) {
      throw new Error('Party requires 6 unique characters (duplicate character detected).');
    }

    return new Party(members);
  }
}
