import { applySpChange, getEventCeiling } from './sp.js';

function normalizeSkill(skill, canonicalSkill) {
  return {
    skillId: Number(skill.id ?? skill.skillId),
    name: String(skill.name ?? ''),
    spCost: Number(skill.sp_cost ?? skill.spCost ?? canonicalSkill?.spCost ?? 0),
    type: canonicalSkill?.type ?? inferSkillType(skill),
    consumeType: skill.consume_type ?? skill.consumeType ?? canonicalSkill?.consumeType ?? null,
    maxLevel: skill.max_level ?? skill.maxLevel ?? canonicalSkill?.maxLevel ?? null,
    spRecoveryCeiling:
      typeof skill.spRecoveryCeiling === 'number' ? skill.spRecoveryCeiling : undefined,
  };
}

function inferSkillType(skill) {
  const parts = Array.isArray(skill.parts) ? skill.parts : [];
  const hasDamage = parts.some((part) => {
    const skillType = String(part.skill_type ?? '').toLowerCase();
    return (
      skillType.includes('attack') ||
      skillType.includes('damage') ||
      skillType.includes('break')
    );
  });

  return hasDamage ? 'damage' : 'non_damage';
}

export function canSwapWith(a, b, isExtraActive, allowedCharacterIds = []) {
  if (!a || !b) {
    return false;
  }

  if (!isExtraActive) {
    return true;
  }

  const allowed = new Set(allowedCharacterIds);
  return allowed.has(a.characterId) && allowed.has(b.characterId);
}

export class CharacterStyle {
  constructor(input) {
    if (!input) {
      throw new Error('CharacterStyle input is required.');
    }

    const partyIndex = Number(input.partyIndex);
    const position = Number(input.position ?? partyIndex);

    this.characterId = String(input.characterId);
    this.characterName = String(input.characterName);
    this.styleId = Number(input.styleId);
    this.styleName = String(input.styleName);
    this.partyIndex = partyIndex;
    this.position = position;

    this.sp = {
      current: Number(input.initialSP ?? 4),
      min: Number(input.spMin ?? 0),
      max: Number(input.spMax ?? 20),
      bonus: Number(input.spBonus ?? 0),
    };

    this.isAlive = input.isAlive ?? true;
    this.isBreak = input.isBreak ?? false;
    this.isExtraActive = input.isExtraActive ?? false;
    this.effects = Array.isArray(input.effects) ? structuredClone(input.effects) : [];

    this.skills = Object.freeze(
      (input.skills ?? []).map((skill) => normalizeSkill(skill, skill.canonicalSkill))
    );

    this._revision = 0;
  }

  get revision() {
    return this._revision;
  }

  isFront() {
    return this.position >= 0 && this.position <= 2;
  }

  getSkill(skillId) {
    const id = Number(skillId);
    return this.skills.find((skill) => skill.skillId === id) ?? null;
  }

  previewSkillUse(skillId) {
    const skill = this.getSkill(skillId);
    if (!skill) {
      throw new Error(`Skill ${skillId} is not available for style ${this.styleId}.`);
    }

    const startSP = this.sp.current;
    const delta = -Math.abs(skill.spCost);
    const endSP = applySpChange(startSP, delta, this.sp.min, Number.POSITIVE_INFINITY);

    return {
      characterId: this.characterId,
      styleId: this.styleId,
      skillId: skill.skillId,
      skillName: skill.name,
      source: 'cost',
      baseRevision: this._revision,
      startSP,
      endSP,
      spDelta: endSP - startSP,
    };
  }

  /**
   * Q-S001/A方針: preview結果をそのまま採用し、commitでは再計算しない。
   */
  commitSkillPreview(preview) {
    if (!preview || preview.characterId !== this.characterId) {
      throw new Error('Preview target does not match this character.');
    }

    if (preview.baseRevision !== this._revision) {
      throw new Error(
        `Stale preview: expected revision ${this._revision}, got ${preview.baseRevision}.`
      );
    }

    this.sp.current = Number(preview.endSP);
    this._revision += 1;

    return {
      characterId: this.characterId,
      skillId: preview.skillId,
      appliedFromPreview: true,
      startSP: Number(preview.startSP),
      endSP: this.sp.current,
      revision: this._revision,
    };
  }

  applySpDelta(delta, source = 'active', skillCeiling) {
    const numericDelta = Number(delta);
    const startSP = this.sp.current;
    const eventCeiling = getEventCeiling(source, this.sp.max, skillCeiling);
    const endSP = applySpChange(startSP, numericDelta, this.sp.min, eventCeiling);
    this.sp.current = endSP;
    this._revision += 1;

    return {
      source,
      delta: numericDelta,
      eventCeiling,
      startSP,
      endSP,
    };
  }

  recoverBaseSP(baseRecovery = 2) {
    const totalRecovery = Number(baseRecovery) + Number(this.sp.bonus);
    return this.applySpDelta(totalRecovery, 'base');
  }

  setPosition(position) {
    const numericPosition = Number(position);
    if (numericPosition < 0 || numericPosition > 5) {
      throw new Error(`Invalid position: ${position}`);
    }

    this.position = numericPosition;
    this._revision += 1;
    return this.position;
  }

  setExtraActive(active) {
    this.isExtraActive = Boolean(active);
    this._revision += 1;
  }

  setBreakState(isBreak) {
    this.isBreak = Boolean(isBreak);
    this._revision += 1;
  }

  setAliveState(isAlive) {
    this.isAlive = Boolean(isAlive);
    this._revision += 1;
  }

  snapshot() {
    return {
      characterId: this.characterId,
      characterName: this.characterName,
      styleId: this.styleId,
      styleName: this.styleName,
      partyIndex: this.partyIndex,
      position: this.position,
      sp: { ...this.sp },
      isAlive: this.isAlive,
      isBreak: this.isBreak,
      isExtraActive: this.isExtraActive,
      revision: this._revision,
    };
  }
}
