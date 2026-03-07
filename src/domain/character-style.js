import { applySpChange, getEventCeiling } from './sp.js';
import { DEFAULT_INITIAL_SP } from '../config/battle-defaults.js';

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
    isRestricted: Number(skill.is_restricted ?? skill.isRestricted ?? canonicalSkill?.isRestricted ?? 0) === 1,
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

function createNoActionSkill() {
  return {
    skillId: 0,
    label: 'NoAction',
    name: '行動なし',
    targetType: 'Self',
    spCost: 0,
    sourceType: 'system',
    isPassive: false,
    type: 'non_damage',
    consumeType: 'Sp',
    hitCount: 0,
    hits: [],
    maxLevel: null,
    spRecoveryCeiling: undefined,
    cond: '',
    iucCond: '',
    overwriteCond: '',
    additionalTurnRule: null,
    parts: [],
    passive: null,
  };
}

function normalizeStatusEffect(effect, fallbackId = 1) {
  const effectId = Number(effect?.effectId ?? effect?.id ?? fallbackId);
  const statusType = String(
    effect?.statusType ?? effect?.type ?? effect?.skillType ?? effect?.skill_type ?? ''
  );
  const limitType = String(effect?.limitType ?? effect?.effect?.limitType ?? 'Default');
  const exitCond = String(effect?.exitCond ?? effect?.effect?.exitCond ?? 'Count');
  const remainingFromExitVal = Array.isArray(effect?.effect?.exitVal)
    ? Number(effect.effect.exitVal[0] ?? 0)
    : undefined;
  const remaining = Number(effect?.remaining ?? remainingFromExitVal ?? 1);
  const powerRaw = Array.isArray(effect?.power) ? effect.power[0] : effect?.power;
  const power = Number(powerRaw ?? 0);
  const sourceSkillId =
    effect?.sourceSkillId === undefined || effect?.sourceSkillId === null
      ? null
      : Number(effect.sourceSkillId);

  return {
    effectId: Number.isFinite(effectId) ? effectId : fallbackId,
    statusType,
    limitType,
    exitCond,
    remaining: Number.isFinite(remaining) ? remaining : 0,
    power: Number.isFinite(power) ? power : 0,
    sourceSkillId: Number.isFinite(sourceSkillId) ? sourceSkillId : null,
    sourceSkillLabel: String(effect?.sourceSkillLabel ?? ''),
    sourceSkillName: String(effect?.sourceSkillName ?? ''),
    metadata:
      effect?.metadata && typeof effect.metadata === 'object' ? structuredClone(effect.metadata) : null,
  };
}

function isActiveStatusEffect(effect) {
  return Number(effect?.remaining ?? 0) > 0;
}

function sortStatusEffectsByPriority(a, b) {
  const powerDelta = Number(b?.power ?? 0) - Number(a?.power ?? 0);
  if (powerDelta !== 0) {
    return powerDelta;
  }
  return Number(a?.effectId ?? 0) - Number(b?.effectId ?? 0);
}

function createReinforcedModeFunnelEffect() {
  return {
    statusType: 'Funnel',
    limitType: 'Only',
    exitCond: 'PlayerTurnEnd',
    remaining: 3,
    power: 3,
    sourceSkillLabel: 'STezukaKishin',
    sourceSkillName: '鬼神化',
    metadata: {
      effectName: 'FunnelUp',
      damageTier: 'large',
      multiHit: 3,
    },
  };
}

function createReinforcedModeMindEyeEffect() {
  return {
    statusType: 'MindEye',
    limitType: 'Only',
    exitCond: 'PlayerTurnEnd',
    remaining: 3,
    power: 1,
    sourceSkillLabel: 'STezukaKishin',
    sourceSkillName: '鬼神化',
    metadata: {
      effectName: 'MindEye',
      singleTrigger: true,
    },
  };
}

function normalizePassive(passive) {
  return {
    passiveId: Number(passive.id ?? passive.passiveId),
    label: String(passive.label ?? ''),
    name: String(passive.name ?? ''),
    desc: String(passive.desc ?? ''),
    info: String(passive.info ?? ''),
    timing: String(passive.timing ?? ''),
    condition: String(passive.condition ?? ''),
    effect: String(passive.effect ?? ''),
    activRate: Number(passive.activ_rate ?? passive.activRate ?? 0),
    autoType: String(passive.auto_type ?? passive.autoType ?? ''),
    limit: Number(passive.limit ?? 0),
    requiredLimitBreakLevel: Number(passive.requiredLimitBreakLevel ?? passive.lb ?? 0),
    sourceType: String(passive.sourceType ?? 'style'),
    sourceMeta:
      passive.sourceMeta && typeof passive.sourceMeta === 'object'
        ? structuredClone(passive.sourceMeta)
        : null,
    labels: Array.isArray(passive.labels) ? structuredClone(passive.labels) : null,
    parts: Array.isArray(passive.parts) ? structuredClone(passive.parts) : [],
  };
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
    this.elements = Object.freeze(
      Array.isArray(input.elements)
        ? [...new Set(input.elements.map((element) => String(element ?? '')).filter(Boolean))]
        : []
    );
    this.weaponType = String(input.weaponType ?? '');
    this.transcendenceRule =
      input.transcendenceRule && typeof input.transcendenceRule === 'object'
        ? structuredClone(input.transcendenceRule)
        : null;
    this.limitBreakLevel = Number(input.limitBreakLevel ?? 0);
    this.drivePiercePercent = Number(input.drivePiercePercent ?? 0);
    this.normalAttackElements = Object.freeze(
      Array.isArray(input.normalAttackElements)
        ? [...new Set(input.normalAttackElements.map((element) => String(element ?? '')).filter(Boolean))]
        : []
    );
    this.partyIndex = partyIndex;
    this.position = position;

    this.sp = {
      current: Number(input.initialSP ?? DEFAULT_INITIAL_SP),
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

    this.tokenState = {
      current: Number(input.initialToken ?? 0),
      min: Number(input.tokenMin ?? 0),
      max: Number(input.tokenMax ?? 10),
    };

    this.moraleState = {
      current: Number(input.initialMorale ?? 0),
      min: Number(input.moraleMin ?? 0),
      max: Number(input.moraleMax ?? 10),
    };

    this.isAlive = input.isAlive ?? true;
    this.isBreak = input.isBreak ?? false;
    this.isExtraActive = input.isExtraActive ?? false;
    this.isReinforcedMode = input.isReinforcedMode ?? false;
    this.epRule = input.epRule && typeof input.epRule === 'object' ? structuredClone(input.epRule) : null;
    this.effects = Array.isArray(input.effects) ? structuredClone(input.effects) : [];
    this.statusEffects = Array.isArray(input.statusEffects)
      ? input.statusEffects.map((effect, idx) => normalizeStatusEffect(effect, idx + 1))
      : [];
    this._nextStatusEffectId =
      this.statusEffects.reduce((max, effect) => Math.max(max, Number(effect.effectId ?? 0)), 0) + 1;
    this.reinforcedTurnsRemaining = Number(input.reinforcedTurnsRemaining ?? 0);
    this.actionDisabledTurns = Number(input.actionDisabledTurns ?? 0);

    this.skills = Object.freeze(
      (input.skills ?? []).map((skill) => normalizeSkill(skill, skill.canonicalSkill))
    );
    this.triggeredSkills = Object.freeze(
      (input.triggeredSkills ?? []).map((skill) => normalizeSkill(skill, skill.canonicalSkill))
    );
    this.passives = Object.freeze((input.passives ?? []).map((passive) => normalizePassive(passive)));
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
    if (this.actionDisabledTurns > 0) {
      if (id === 0) {
        return createNoActionSkill();
      }
      return null;
    }
    return this.skills.find((skill) => skill.skillId === id && !skill.isPassive) ?? null;
  }

  getActionSkills() {
    if (this.actionDisabledTurns > 0) {
      return [createNoActionSkill()];
    }
    return this.skills.filter((skill) => !skill.isPassive);
  }

  previewSkillUse(skillId) {
    const skill = this.getSkill(skillId);
    if (!skill) {
      throw new Error(`Skill ${skillId} is not available for style ${this.styleId}.`);
    }

    return this.previewSkillUseResolved(skill);
  }

  previewSkillUseResolved(skillLike) {
    const skill = skillLike;
    if (!skill || typeof skill !== 'object') {
      throw new Error(`Skill is not available for style ${this.styleId}.`);
    }

    const startSP = this.sp.current;
    const startEP = this.ep.current;
    const startToken = this.tokenState.current;
    const startMorale = this.moraleState.current;
    const consumeType = String(skill.consumeType ?? 'Sp');
    let rawCost = Number(skill.spCost ?? 0);
    if (
      this.characterId === 'STezuka' &&
      this.isReinforcedMode &&
      consumeType !== 'Ep' &&
      consumeType !== 'Morale' &&
      rawCost !== -1
    ) {
      rawCost = 0;
    }
    const cost = Math.abs(rawCost);

    let deltaSP = consumeType === 'Ep' || consumeType === 'Token' || consumeType === 'Morale' ? 0 : -cost;
    let deltaEP = consumeType === 'Ep' ? -cost : 0;
    let deltaToken = consumeType === 'Token' ? -cost : 0;
    let deltaMorale = consumeType === 'Morale' ? -cost : 0;
    // HBR特殊値: sp_cost = -1 は「現在SPを全消費」。
    if (consumeType !== 'Ep' && consumeType !== 'Token' && consumeType !== 'Morale' && rawCost === -1) {
      deltaSP = -startSP;
    }
    if (consumeType === 'Token' && rawCost === -1) {
      deltaToken = -startToken;
    }
    if (consumeType === 'Morale' && rawCost === -1) {
      deltaMorale = -startMorale;
    }
    const endSP = applySpChange(startSP, deltaSP, this.sp.min, Number.POSITIVE_INFINITY);
    const endEP = applySpChange(startEP, deltaEP, this.ep.min, Number.POSITIVE_INFINITY);
    const endToken = applySpChange(
      startToken,
      deltaToken,
      this.tokenState.min,
      Number.POSITIVE_INFINITY
    );
    const endMorale = applySpChange(
      startMorale,
      deltaMorale,
      this.moraleState.min,
      Number.POSITIVE_INFINITY
    );

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
      startToken,
      endToken,
      startMorale,
      endMorale,
      spDelta: endSP - startSP,
      epDelta: endEP - startEP,
      tokenDelta: endToken - startToken,
      moraleDelta: endMorale - startMorale,
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
    if (Number.isFinite(Number(preview.endToken))) {
      this.tokenState.current = Number(preview.endToken);
    }
    if (Number.isFinite(Number(preview.endMorale))) {
      this.moraleState.current = Number(preview.endMorale);
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
      startToken: Number(preview.startToken ?? this.tokenState.current),
      endToken: this.tokenState.current,
      startMorale: Number(preview.startMorale ?? this.moraleState.current),
      endMorale: this.moraleState.current,
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

  applyTokenDelta(delta, eventCeiling = this.tokenState.max) {
    const numericDelta = Number(delta);
    const startToken = this.tokenState.current;
    const ceiling = Number.isFinite(Number(eventCeiling))
      ? Number(eventCeiling)
      : Number(this.tokenState.max ?? 10);
    const endToken = applySpChange(startToken, numericDelta, this.tokenState.min, ceiling);
    this.tokenState.current = endToken;
    this._revision += 1;

    return {
      startToken,
      endToken,
      delta: endToken - startToken,
      eventCeiling: ceiling,
    };
  }

  applyMoraleDelta(delta, eventCeiling = this.moraleState.max) {
    const numericDelta = Number(delta);
    const startMorale = this.moraleState.current;
    const ceiling = Number.isFinite(Number(eventCeiling))
      ? Number(eventCeiling)
      : Number(this.moraleState.max ?? 10);
    const endMorale = applySpChange(startMorale, numericDelta, this.moraleState.min, ceiling);
    this.moraleState.current = endMorale;
    this._revision += 1;

    return {
      startMorale,
      endMorale,
      delta: endMorale - startMorale,
      eventCeiling: ceiling,
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

  activateReinforcedMode(duration = 3) {
    const turns = Math.max(1, Number(duration) || 3);
    this.isReinforcedMode = true;
    this.reinforcedTurnsRemaining = turns;
    this.addStatusEffect(createReinforcedModeFunnelEffect());
    this.addStatusEffect(createReinforcedModeMindEyeEffect());
    this._revision += 1;
  }

  tickReinforcedModeTurnIfActionable(isActionable, options = {}) {
    if (!isActionable) {
      return;
    }
    const shouldTickPlayerTurnEndStatuses = options.tickPlayerTurnEndStatuses !== false;

    if (this.isReinforcedMode && this.reinforcedTurnsRemaining > 0) {
      this.reinforcedTurnsRemaining -= 1;
      if (shouldTickPlayerTurnEndStatuses) {
        this.tickStatusEffectsByExitCond('PlayerTurnEnd');
      }
      if (this.reinforcedTurnsRemaining <= 0) {
        this.isReinforcedMode = false;
        this.reinforcedTurnsRemaining = 0;
        this.actionDisabledTurns = Math.max(this.actionDisabledTurns, 1);
      }
      this._revision += 1;
      return;
    }

    if (this.actionDisabledTurns > 0) {
      this.actionDisabledTurns -= 1;
      this._revision += 1;
    }
  }

  setBreakState(isBreak) {
    this.isBreak = Boolean(isBreak);
    this._revision += 1;
  }

  setAliveState(isAlive) {
    this.isAlive = Boolean(isAlive);
    this._revision += 1;
  }

  addStatusEffect(effect) {
    const normalized = normalizeStatusEffect(effect, this._nextStatusEffectId);
    this._nextStatusEffectId = Math.max(this._nextStatusEffectId + 1, normalized.effectId + 1);
    this.statusEffects.push(normalized);
    this._revision += 1;
    return structuredClone(normalized);
  }

  getStatusEffectsByType(statusType, options = {}) {
    const key = String(statusType ?? '');
    const activeOnly = options.activeOnly !== false;
    return this.statusEffects
      .filter((effect) => String(effect.statusType) === key)
      .filter((effect) => (activeOnly ? isActiveStatusEffect(effect) : true))
      .map((effect) => structuredClone(effect));
  }

  resolveEffectiveStatusEffects(statusType) {
    const active = this.getStatusEffectsByType(statusType, { activeOnly: true });
    const defaults = active.filter((effect) => String(effect.limitType) !== 'Only');
    const onlyCandidates = active
      .filter((effect) => String(effect.limitType) === 'Only')
      .sort(sortStatusEffectsByPriority);
    if (onlyCandidates.length > 0) {
      defaults.push(onlyCandidates[0]);
    }
    return defaults.sort(sortStatusEffectsByPriority);
  }

  consumeStatusEffectsByType(statusType, consumeCount = 1) {
    const count = Math.max(0, Number(consumeCount) || 0);
    if (count <= 0) {
      return [];
    }

    const effective = this.resolveEffectiveStatusEffects(statusType).filter(
      (effect) => String(effect.exitCond) === 'Count'
    );
    const picked = effective.slice(0, count);
    if (picked.length === 0) {
      return [];
    }

    const idSet = new Set(picked.map((effect) => Number(effect.effectId)));
    const consumed = [];
    let changed = false;

    for (const effect of this.statusEffects) {
      if (!idSet.has(Number(effect.effectId))) {
        continue;
      }
      if (!isActiveStatusEffect(effect)) {
        continue;
      }
      const before = Number(effect.remaining);
      effect.remaining = Math.max(0, before - 1);
      consumed.push({
        effectId: effect.effectId,
        statusType: effect.statusType,
        limitType: effect.limitType,
        exitCond: effect.exitCond,
        power: effect.power,
        remainingBefore: before,
        remainingAfter: effect.remaining,
      });
      changed = true;
    }

    const beforeLen = this.statusEffects.length;
    this.statusEffects = this.statusEffects.filter((effect) => isActiveStatusEffect(effect));
    if (this.statusEffects.length !== beforeLen) {
      changed = true;
    }

    if (changed) {
      this._revision += 1;
    }

    return consumed.sort((a, b) => sortStatusEffectsByPriority(a, b));
  }

  tickStatusEffectsByExitCond(exitCond) {
    const cond = String(exitCond ?? '');
    if (!cond) {
      return [];
    }

    const ticked = [];
    let changed = false;
    for (const effect of this.statusEffects) {
      if (String(effect.exitCond) !== cond || !isActiveStatusEffect(effect)) {
        continue;
      }
      const before = Number(effect.remaining);
      effect.remaining = Math.max(0, before - 1);
      ticked.push({
        effectId: effect.effectId,
        statusType: effect.statusType,
        limitType: effect.limitType,
        exitCond: effect.exitCond,
        power: effect.power,
        remainingBefore: before,
        remainingAfter: effect.remaining,
      });
      changed = true;
    }

    const beforeLen = this.statusEffects.length;
    this.statusEffects = this.statusEffects.filter((effect) => isActiveStatusEffect(effect));
    if (this.statusEffects.length !== beforeLen) {
      changed = true;
    }

    if (changed) {
      this._revision += 1;
    }

    return ticked;
  }

  getFunnelEffects(options = {}) {
    return this.getStatusEffectsByType('Funnel', options);
  }

  resolveEffectiveFunnelEffects() {
    return this.resolveEffectiveStatusEffects('Funnel');
  }

  consumeFunnelEffects(consumeCount = 2) {
    return this.consumeStatusEffectsByType('Funnel', consumeCount);
  }

  getMindEyeEffects(options = {}) {
    return this.getStatusEffectsByType('MindEye', options);
  }

  resolveEffectiveMindEyeEffects() {
    return this.resolveEffectiveStatusEffects('MindEye');
  }

  consumeMindEyeEffects(consumeCount = 1) {
    return this.consumeStatusEffectsByType('MindEye', consumeCount);
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
      normalAttackElements: [...this.normalAttackElements],
      sp: { ...this.sp },
      ep: { ...this.ep },
      tokenState: { ...this.tokenState },
      moraleState: { ...this.moraleState },
      isAlive: this.isAlive,
      isBreak: this.isBreak,
      isExtraActive: this.isExtraActive,
      isReinforcedMode: this.isReinforcedMode,
      reinforcedTurnsRemaining: this.reinforcedTurnsRemaining,
      actionDisabledTurns: this.actionDisabledTurns,
      epRule: this.epRule ? structuredClone(this.epRule) : null,
      statusEffects: structuredClone(this.statusEffects),
      skillUseCounts: Object.fromEntries(this.skillUseCounts.entries()),
      revision: this._revision,
    };
  }
}
