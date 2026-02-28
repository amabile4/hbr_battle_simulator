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

export class HbrDataStore {
  constructor(payload) {
    this.characters = payload.characters;
    this.styles = payload.styles;
    this.skills = payload.skills;
    this.passives = payload.passives;

    this.skillDbSchema = payload.skillDbSchema;
    this.skillDbDraft = payload.skillDbDraft;

    this.charactersById = new Map(this.characters.map((row) => [Number(row.id), row]));
    this.stylesById = new Map(this.styles.map((row) => [Number(row.id), row]));
    this.skillsById = new Map(this.skills.map((row) => [Number(row.id), row]));
    this.canonicalSkillById = new Map(
      (this.skillDbDraft.canonicalSkills ?? []).map((row) => [Number(row.skillId), row])
    );
  }

  static fromJsonDirectory(baseDir = 'json') {
    const dir = resolve(baseDir);
    return new HbrDataStore({
      characters: readJson(resolve(dir, 'characters.json')),
      styles: readJson(resolve(dir, 'styles.json')),
      skills: readJson(resolve(dir, 'skills.json')),
      passives: readJson(resolve(dir, 'passives.json')),
      skillDbSchema: readJson(resolve(dir, 'new_skill_database.schema.json')),
      skillDbDraft: readJson(resolve(dir, 'reports/migration/new_skill_database.draft.json')),
    });
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

  listSkillsByStyleId(styleId) {
    const style = this.getStyleById(styleId);
    if (!style) {
      return [];
    }

    return (style.skills ?? [])
      .map((row) => this.getSkillById(row.id))
      .filter(Boolean);
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

  buildCharacterStyle({ styleId, partyIndex, initialSP = 4, spBonus = 0 }) {
    const style = this.getStyleById(styleId);
    if (!style) {
      throw new Error(`Style not found: ${styleId}`);
    }

    const character =
      this.characters.find((row) => String(row.label) === String(style.chara_label)) ?? null;

    if (!character) {
      throw new Error(`Character not found for style.chara_label=${style.chara_label}`);
    }

    const styleSkills = (style.skills ?? [])
      .map((skillRef) => this.getSkillById(skillRef.id))
      .filter(Boolean)
      .map((skill) => {
        const canonical = this.canonicalSkillById.get(Number(skill.id));
        return {
          ...skill,
          canonicalSkill: canonical ?? null,
        };
      });

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
    });
  }

  buildPartyFromStyleIds(styleIds, options = {}) {
    if (!Array.isArray(styleIds) || styleIds.length !== 6) {
      throw new Error('buildPartyFromStyleIds requires exactly 6 style IDs.');
    }

    const initialSP = options.initialSP ?? 4;
    const spBonusMap = options.spBonusMap ?? {};

    const members = styleIds.map((styleId, index) =>
      this.buildCharacterStyle({
        styleId,
        partyIndex: index,
        initialSP,
        spBonus: Number(spBonusMap[index] ?? 0),
      })
    );

    const uniqueCharacters = new Set(members.map((member) => member.characterId));
    if (uniqueCharacters.size !== members.length) {
      throw new Error('Party requires 6 unique characters (duplicate character detected).');
    }

    return new Party(members);
  }
}
