import { applySpChange, getEventCeiling } from './sp.js';

function normalizeSkill(skill, canonicalSkill) {
  const sourceType = String(skill.sourceType ?? 'style');
  const isPassive = Boolean(skill.passive && typeof skill.passive === 'object') || sourceType === 'passive';
  return {
    skillId: Number(skill.id ?? skill.skillId),
    label: String(skill.label ?? canonicalSkill?.label ?? ''),
    name: String(skill.name ?? ''),
    targetType: String(skill.target_type ?? skill.targetType ?? canonicalSkill?.targetType ?? ''),
    spCost: Number(skill.sp_cost ?? skill.spCost ?? canonicalSkill?.spCost ?? 0),
    sourceType,
    isPassive,
    type: canonicalSkill?.type ?? inferSkillType(skill),
    consumeType: skill.consume_type ?? skill.consumeType ?? canonicalSkill?.consumeType ?? null,
    hitCount: Number(skill.hit_count ?? skill.hitCount ?? canonicalSkill?.hitCount ?? 0),
    hits: Array.isArray(skill.hits) ? structuredClone(skill.hits) : [],
    maxLevel: skill.max_level ?? skill.maxLevel ?? canonicalSkill?.maxLevel ?? null,
    spRecoveryCeiling:
      typeof skill.spRecoveryCeiling === 'number' ? skill.spRecoveryCeiling : undefined,
    cond: String(skill.cond ?? ''),
    iucCond: String(skill.iuc_cond ?? skill.iucCond ?? ''),
    overwriteCond: String(skill.overwrite_cond ?? skill.overwriteCond ?? ''),
    additionalTurnRule:
      skill.additionalTurnRule && typeof skill.additionalTurnRule === 'object'
        ? structuredClone(skill.additionalTurnRule)
        : null,
    parts: Array.isArray(skill.parts) ? structuredClone(skill.parts) : [],
    passive: skill.passive && typeof skill.passive === 'object' ? structuredClone(skill.passive) : null,
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
    this.role = String(input.role ?? '');
    this.limitBreakLevel = Number(input.limitBreakLevel ?? 0);
    this.drivePiercePercent = Number(input.drivePiercePercent ?? 0);
    this.partyIndex = partyIndex;
    this.position = position;

    this.sp = {
      current: Number(input.initialSP ?? 4),
      min: Number(input.spMin ?? 0),
      max: Number(input.spMax ?? 20),
      bonus: Number(input.spBonus ?? 0),
    };

    this.ep = {
      current: Number(input.initialEP ?? 0),
      min: Number(input.epMin ?? 0),
      max: Number(input.epMax ?? 10),
      odMax: Number(input.epOdMax ?? 20),
    };

    this.isAlive = input.isAlive ?? true;
    this.isBreak = input.isBreak ?? false;
    this.isExtraActive = input.isExtraActive ?? false;
    this.isReinforcedMode = input.isReinforcedMode ?? false;
    this.epRule = input.epRule && typeof input.epRule === 'object' ? structuredClone(input.epRule) : null;
    this.effects = Array.isArray(input.effects) ? structuredClone(input.effects) : [];

    this.skills = Object.freeze(
      (input.skills ?? []).map((skill) => normalizeSkill(skill, skill.canonicalSkill))
    );
    this.triggeredSkills = Object.freeze(
      (input.triggeredSkills ?? []).map((skill) => normalizeSkill(skill, skill.canonicalSkill))
    );
    this.passives = Object.freeze(
      (input.passives ?? []).map((passive) => ({
        passiveId: Number(passive.id ?? passive.passiveId),
        label: String(passive.label ?? ''),
        name: String(passive.name ?? ''),
        desc: String(passive.desc ?? ''),
        timing: String(passive.timing ?? ''),
        condition: String(passive.condition ?? ''),
        parts: Array.isArray(passive.parts) ? structuredClone(passive.parts) : [],
      }))
    );
    const skillUseCountsInput =
      input.skillUseCounts && typeof input.skillUseCounts === 'object' ? input.skillUseCounts : {};
    this.skillUseCounts = new Map(
      Object.entries(skillUseCountsInput).map(([k, v]) => [String(k), Number(v)])
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
    return this.skills.find((skill) => skill.skillId === id && !skill.isPassive) ?? null;
  }

  getActionSkills() {
    return this.skills.filter((skill) => !skill.isPassive);
  }

  previewSkillUse(skillId) {
    const skill = this.getSkill(skillId);
    if (!skill) {
      throw new Error(`Skill ${skillId} is not available for style ${this.styleId}.`);
    }

    const startSP = this.sp.current;
    const startEP = this.ep.current;
    const consumeType = String(skill.consumeType ?? 'Sp');
    const cost = Math.abs(Number(skill.spCost ?? 0));

    const deltaSP = consumeType === 'Ep' ? 0 : -cost;
    const deltaEP = consumeType === 'Ep' ? -cost : 0;
    const endSP = applySpChange(startSP, deltaSP, this.sp.min, Number.POSITIVE_INFINITY);
    const endEP = applySpChange(startEP, deltaEP, this.ep.min, Number.POSITIVE_INFINITY);

    return {
      characterId: this.characterId,
      styleId: this.styleId,
      skillId: skill.skillId,
      skillName: skill.name,
      source: 'cost',
      consumeType,
      baseRevision: this._revision,
      startSP,
      endSP,
      startEP,
      endEP,
      spDelta: endSP - startSP,
      epDelta: endEP - startEP,
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
    if (Number.isFinite(Number(preview.endEP))) {
      this.ep.current = Number(preview.endEP);
    }
    this._revision += 1;

    return {
      characterId: this.characterId,
      skillId: preview.skillId,
      appliedFromPreview: true,
      startSP: Number(preview.startSP),
      endSP: this.sp.current,
      startEP: Number(preview.startEP ?? this.ep.current),
      endEP: this.ep.current,
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

  applyEpDelta(delta, eventCeiling = this.ep.max) {
    const numericDelta = Number(delta);
    const startEP = this.ep.current;
    const endEP = applySpChange(startEP, numericDelta, this.ep.min, eventCeiling);
    this.ep.current = endEP;
    this._revision += 1;

    return {
      delta: numericDelta,
      startEP,
      endEP,
      eventCeiling,
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

  setReinforcedMode(active) {
    this.isReinforcedMode = Boolean(active);
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

  getSkillUseCountByLabel(label) {
    const key = String(label ?? '').trim();
    if (!key) {
      return 0;
    }
    return Number(this.skillUseCounts.get(key) ?? 0);
  }

  incrementSkillUseByLabel(label) {
    const key = String(label ?? '').trim();
    if (!key) {
      return;
    }
    const current = this.getSkillUseCountByLabel(key);
    this.skillUseCounts.set(key, current + 1);
    this._revision += 1;
  }

  incrementSkillUseById(skillId) {
    const skill = this.getSkill(skillId);
    const key = String(skill?.label ?? '').trim();
    if (!key) {
      return;
    }
    this.incrementSkillUseByLabel(key);
  }

  snapshot() {
    return {
      characterId: this.characterId,
      characterName: this.characterName,
      styleId: this.styleId,
      styleName: this.styleName,
      limitBreakLevel: this.limitBreakLevel,
      partyIndex: this.partyIndex,
      position: this.position,
      sp: { ...this.sp },
      ep: { ...this.ep },
      isAlive: this.isAlive,
      isBreak: this.isBreak,
      isExtraActive: this.isExtraActive,
      isReinforcedMode: this.isReinforcedMode,
      epRule: this.epRule ? structuredClone(this.epRule) : null,
      skillUseCounts: Object.fromEntries(this.skillUseCounts.entries()),
      revision: this._revision,
    };
  }
}
