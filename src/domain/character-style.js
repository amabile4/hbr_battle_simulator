import { applySpChange, getEventCeiling } from './sp.js';
import { createDpState, cloneDpState, getDpRate } from './dp-state.js';
import {
  DEFAULT_INITIAL_SP,
  DEFAULT_MARK_LEVEL_MAX,
  MARK_STATE_ELEMENTS,
} from '../config/battle-defaults.js';

export const MAX_PARTY_POSITION = 5;
export const SHREDDING_SP_MIN = -30;

// SpecialStatusCountByType の数値IDと statusEffects.statusType 文字列のマッピング
export const SPECIAL_STATUS_TYPE_NAMES = Object.freeze({
  25: 'BuffCharge',
  78: 'MindEye',
  79: 'ImprisonRandom',
  122: 'Dodge',
  124: 'EternalOath',
  125: 'ShadowClone',
  144: 'Diva',
  146: 'NegativeState',
  155: 'BIYamawakiServant',
  164: 'Makeup',
});

export function normalizePartyPosition(position) {
  const numericPosition = Number(position);
  if (!Number.isInteger(numericPosition) || numericPosition < 0 || numericPosition > MAX_PARTY_POSITION) {
    throw new Error(`Invalid position: ${position}`);
  }
  return numericPosition;
}

function normalizeSkill(skill, canonicalSkill) {
  const sourceType = String(skill.sourceType ?? 'style');
  const isPassive = Boolean(skill.passive && typeof skill.passive === 'object') || sourceType === 'passive';
  return {
    skillId: Number(skill.id ?? skill.skillId),
    label: String(skill.label ?? canonicalSkill?.label ?? ''),
    name: String(skill.name ?? ''),
    desc: String(skill.desc ?? canonicalSkill?.desc ?? ''),
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
    effect: String(skill.effect ?? canonicalSkill?.effect ?? ''),
    overwrite:
      skill.overwrite === undefined || skill.overwrite === null
        ? canonicalSkill?.overwrite ?? null
        : Number(skill.overwrite),
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
    effect: '',
    overwrite: null,
    additionalTurnRule: null,
    parts: [],
    passive: null,
  };
}

export function normalizeStatusEffect(effect, fallbackId = 1) {
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
  const elements = Array.isArray(effect?.elements)
    ? [...new Set(effect.elements.map((value) => String(value ?? '').trim()).filter(Boolean))]
    : [];
  // 単独発動仕様: 'skill'（アクティブスキル由来）と 'passive'（パッシブ由来）を区別する
  const sourceType = String(effect?.sourceType ?? 'skill');

  const normalized = {
    effectId: Number.isFinite(effectId) ? effectId : fallbackId,
    statusType,
    limitType,
    exitCond,
    remaining: Number.isFinite(remaining) ? remaining : 0,
    power: Number.isFinite(power) ? power : 0,
    sourceType,
    sourceSkillId: Number.isFinite(sourceSkillId) ? sourceSkillId : null,
    sourceSkillLabel: String(effect?.sourceSkillLabel ?? ''),
    sourceSkillName: String(effect?.sourceSkillName ?? ''),
    metadata:
      effect?.metadata && typeof effect.metadata === 'object' ? structuredClone(effect.metadata) : null,
  };
  if (elements.length > 0) {
    normalized.elements = elements;
  }
  return normalized;
}

function isActiveStatusEffect(effect) {
  // Eternal 状態は remaining に関わらず常にアクティブ
  if (String(effect?.exitCond ?? '') === 'Eternal') return true;
  return Number(effect?.remaining ?? 0) > 0;
}

function sortStatusEffectsByPriority(a, b) {
  const powerDelta = Number(b?.power ?? 0) - Number(a?.power ?? 0);
  if (powerDelta !== 0) {
    return powerDelta;
  }
  return Number(a?.effectId ?? 0) - Number(b?.effectId ?? 0);
}

function getStatusEffectOnlyGroupKey(effect) {
  const explicit = String(effect?.metadata?.onlyGroupKey ?? '').trim();
  if (explicit) {
    return explicit;
  }
  const effectName = String(effect?.metadata?.effectName ?? '').trim();
  const elements = Array.isArray(effect?.elements)
    ? [...new Set(effect.elements.map((value) => String(value ?? '').trim()).filter(Boolean))]
    : [];
  return `${effectName}|${elements.join(',')}`;
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

function buildDefaultMarkStates(input) {
  const rawMarkStates = input?.markStates && typeof input.markStates === 'object' ? input.markStates : {};
  return Object.fromEntries(
    MARK_STATE_ELEMENTS.map((element) => {
      const source = rawMarkStates[element] && typeof rawMarkStates[element] === 'object' ? rawMarkStates[element] : {};
      return [
        element,
        {
          current: Number(source.current ?? 0),
          min: Number(source.min ?? 0),
          max: Number(source.max ?? DEFAULT_MARK_LEVEL_MAX),
        },
      ];
    })
  );
}

function normalizePassive(passive) {
  return {
    passiveId: Number(passive.id ?? passive.passiveId),
    label: String(passive.label ?? ''),
    name: String(passive.name ?? ''),
    desc: String(passive.desc ?? ''),
    info: String(passive.info ?? ''),
    tier: String(passive.ct ?? passive.tier ?? ''),
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
    this.team = String(input.team ?? '');
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
    this.supportStyleId = input.supportStyleId != null ? Number(input.supportStyleId) : null;
    this.supportStyleLimitBreakLevel = Number(input.supportStyleLimitBreakLevel ?? 0);
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

    const rawDpState =
      input?.dpState && typeof input.dpState === 'object' ? input.dpState : input;
    this.dpState = createDpState({
      baseMaxDp: rawDpState.baseMaxDp,
      currentDp: rawDpState.currentDp ?? rawDpState.initialCurrentDp ?? rawDpState.initialDp,
      effectiveDpCap: rawDpState.effectiveDpCap,
    });

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

    this.motivationState = {
      current: Number(input.initialMotivation ?? 0),
      min: Number(input.motivationMin ?? 0),
      max: Number(input.motivationMax ?? 5),
    };
    this.markStates = buildDefaultMarkStates(input);

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
    this.shreddingTurnsRemaining = Number(input.shreddingTurnsRemaining ?? 0);

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

  hasSkillReference(skillRef) {
    const key = String(skillRef ?? '').trim();
    if (!key) {
      return false;
    }
    const numericId = Number(key);
    const matches = (skill) => {
      if (!skill || typeof skill !== 'object') {
        return false;
      }
      if (String(skill.label ?? '').trim() === key) {
        return true;
      }
      if (Number.isFinite(numericId) && Number(skill.skillId ?? skill.id ?? Number.NaN) === numericId) {
        return true;
      }
      return false;
    };
    return [...(this.skills ?? []), ...(this.triggeredSkills ?? [])].some(matches);
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
    const startMotivation = this.motivationState.current;
    const consumeType = String(skill.consumeType ?? 'Sp');
    let rawCost = Number(skill.spCost ?? 0);
    if (
      this.characterId === 'STezuka' &&
      this.isReinforcedMode &&
      consumeType !== 'Ep' &&
      consumeType !== 'Morale' &&
      consumeType !== 'Motivation' &&
      rawCost !== -1
    ) {
      rawCost = 0;
    }
    const cost = Math.abs(rawCost);

    let deltaSP =
      consumeType === 'Ep' ||
      consumeType === 'Token' ||
      consumeType === 'Morale' ||
      consumeType === 'Motivation'
        ? 0
        : -cost;
    let deltaEP = consumeType === 'Ep' ? -cost : 0;
    let deltaToken = consumeType === 'Token' ? -cost : 0;
    let deltaMorale = consumeType === 'Morale' ? -cost : 0;
    let deltaMotivation = consumeType === 'Motivation' ? -cost : 0;
    // HBR特殊値: sp_cost = -1 は「現在SPを全消費」。
    if (
      consumeType !== 'Ep' &&
      consumeType !== 'Token' &&
      consumeType !== 'Morale' &&
      consumeType !== 'Motivation' &&
      rawCost === -1
    ) {
      deltaSP = -startSP;
    }
    if (consumeType === 'Token' && rawCost === -1) {
      deltaToken = -startToken;
    }
    if (consumeType === 'Morale' && rawCost === -1) {
      deltaMorale = -startMorale;
    }
    if (consumeType === 'Motivation' && rawCost === -1) {
      deltaMotivation = -startMotivation;
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
    const endMotivation = applySpChange(
      startMotivation,
      deltaMotivation,
      this.motivationState.min,
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
      startMotivation,
      endMotivation,
      spDelta: endSP - startSP,
      epDelta: endEP - startEP,
      tokenDelta: endToken - startToken,
      moraleDelta: endMorale - startMorale,
      motivationDelta: endMotivation - startMotivation,
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
    if (Number.isFinite(Number(preview.endMotivation))) {
      this.motivationState.current = Number(preview.endMotivation);
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
      startMotivation: Number(preview.startMotivation ?? this.motivationState.current),
      endMotivation: this.motivationState.current,
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

  setDpState(nextState = {}) {
    const startDpState = cloneDpState(this.dpState);
    const endDpState = createDpState({
      ...this.dpState,
      ...(nextState && typeof nextState === 'object' ? nextState : {}),
    });
    this.dpState.baseMaxDp = endDpState.baseMaxDp;
    this.dpState.currentDp = endDpState.currentDp;
    this.dpState.effectiveDpCap = endDpState.effectiveDpCap;
    this.dpState.minDp = endDpState.minDp;
    this._revision += 1;

    return {
      startDpState,
      endDpState: cloneDpState(this.dpState),
      startDpRate: getDpRate(startDpState),
      endDpRate: getDpRate(this.dpState),
    };
  }

  getDpRate() {
    return getDpRate(this.dpState);
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

  applyMotivationDelta(delta, eventCeiling = this.motivationState.max) {
    const numericDelta = Number(delta);
    const startMotivation = this.motivationState.current;
    const ceiling = Number.isFinite(Number(eventCeiling))
      ? Number(eventCeiling)
      : Number(this.motivationState.max ?? 5);
    const endMotivation = applySpChange(
      startMotivation,
      numericDelta,
      this.motivationState.min,
      ceiling
    );
    this.motivationState.current = endMotivation;
    this._revision += 1;

    return {
      startMotivation,
      endMotivation,
      delta: endMotivation - startMotivation,
      eventCeiling: ceiling,
    };
  }

  getMarkState(element) {
    const key = String(element ?? '').trim();
    if (!key) {
      return null;
    }
    return this.markStates[key] ?? null;
  }

  setMarkLevel(element, level, eventCeiling = undefined) {
    const key = String(element ?? '').trim();
    const markState = this.getMarkState(key);
    if (!markState) {
      return null;
    }
    const startMark = markState.current;
    const targetLevel = Number(level);
    const ceiling = Number.isFinite(Number(eventCeiling))
      ? Number(eventCeiling)
      : Number(markState.max ?? DEFAULT_MARK_LEVEL_MAX);
    const endMark = applySpChange(0, targetLevel, markState.min, ceiling);
    markState.current = endMark;
    this._revision += 1;

    return {
      element: key,
      startMark,
      endMark,
      delta: endMark - startMark,
      eventCeiling: ceiling,
    };
  }

  setMotivationLevel(level) {
    const startMotivation = this.motivationState.current;
    const endMotivation = Math.max(
      Number(this.motivationState.min ?? 1),
      Math.min(
        Number(this.motivationState.max ?? 5),
        Number.isFinite(Number(level)) ? Number(level) : startMotivation
      )
    );
    this.motivationState.current = endMotivation;
    this._revision += 1;

    return {
      startMotivation,
      endMotivation,
      delta: endMotivation - startMotivation,
      eventCeiling: Number(this.motivationState.max ?? 5),
    };
  }

  recoverBaseSP(baseRecovery = 2) {
    const totalRecovery = Number(baseRecovery) + Number(this.sp.bonus);
    return this.applySpDelta(totalRecovery, 'base');
  }

  setPosition(position) {
    this.position = normalizePartyPosition(position);
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

  get isShredding() {
    return this.shreddingTurnsRemaining > 0;
  }

  applyShredding(turns) {
    const n = Math.max(1, Number(turns) || 1);
    this.shreddingTurnsRemaining = Math.max(this.shreddingTurnsRemaining, n);
    this.sp.min = Math.min(this.sp.min, SHREDDING_SP_MIN);
    this._revision += 1;
  }

  applySpecialStatus(typeId, remaining, exitCond, context = {}) {
    const id = Number(typeId);
    const statusType = SPECIAL_STATUS_TYPE_NAMES[id] ?? `SpecialStatus_${id}`;
    const cond = String(exitCond ?? 'Count');
    // Eternal 状態は remaining=0 でも isActiveStatusEffect が true を返す
    const effectiveRemaining = cond === 'Eternal' ? 0 : Math.max(1, Number(remaining) || 1);
    const skill = context?.skill ?? null;

    // 同一 typeId の既存エントリがあれば残りターン数を max 採用で更新
    const existing = this.statusEffects.find(
      (e) => Number(e.metadata?.specialStatusTypeId) === id
    );
    if (existing) {
      if (cond !== 'Eternal') {
        existing.remaining = Math.max(existing.remaining, effectiveRemaining);
      }
      this._revision += 1;
      return;
    }

    this.addStatusEffect({
      statusType,
      exitCond: cond,
      remaining: effectiveRemaining,
      sourceSkillId: skill?.skillId ?? null,
      sourceSkillLabel: String(skill?.label ?? ''),
      sourceSkillName: String(skill?.name ?? ''),
      metadata: { specialStatusTypeId: id },
    });
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
    const onlyCandidates = active.filter((effect) => String(effect.limitType) === 'Only');
    // 単独発動仕様: スキル由来とパッシブ由来は別枠のため、それぞれ最強の1枠を選ぶ
    const collectOnlyCandidates = (candidates) => {
      const grouped = new Map();
      for (const effect of candidates) {
        const key = getStatusEffectOnlyGroupKey(effect);
        const current = grouped.get(key) ?? null;
        if (!current || sortStatusEffectsByPriority(effect, current) < 0) {
          grouped.set(key, effect);
        }
      }
      return [...grouped.values()].sort(sortStatusEffectsByPriority);
    };
    const skillOnlyCandidates = collectOnlyCandidates(
      onlyCandidates.filter((effect) => String(effect.sourceType ?? 'skill') !== 'passive')
    );
    const passiveOnlyCandidates = collectOnlyCandidates(
      onlyCandidates.filter((effect) => String(effect.sourceType ?? 'skill') === 'passive')
    );
    defaults.push(...skillOnlyCandidates, ...passiveOnlyCandidates);
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

  tickStatusEffectsWhere(predicate) {
    if (typeof predicate !== 'function') {
      return [];
    }

    const ticked = [];
    let changed = false;
    for (const effect of this.statusEffects) {
      if (!isActiveStatusEffect(effect) || !predicate(effect)) {
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
        elements: Array.isArray(effect.elements) ? structuredClone(effect.elements) : [],
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

    return ticked.sort((a, b) => sortStatusEffectsByPriority(a, b));
  }

  removeStatusEffectsWhere(predicate, removeCount = Number.POSITIVE_INFINITY) {
    if (typeof predicate !== 'function') {
      return [];
    }

    let remainingRemovals = Math.max(0, Number(removeCount));
    const removed = [];
    const nextEffects = [];

    for (const effect of this.statusEffects) {
      const shouldRemove =
        remainingRemovals > 0 &&
        isActiveStatusEffect(effect) &&
        predicate(effect);
      if (shouldRemove) {
        removed.push(structuredClone(effect));
        remainingRemovals -= 1;
        continue;
      }
      nextEffects.push(effect);
    }

    if (removed.length > 0 || nextEffects.length !== this.statusEffects.length) {
      this.statusEffects = nextEffects.filter((effect) => isActiveStatusEffect(effect));
      this._revision += 1;
    }

    return removed;
  }

  // T05: specialStatusTypeId を持つ Count 型特殊状態のみをデクリメント
  // 既存の MindEye 等（consumeMindEyeEffects で管理）には影響しない
  tickSpecialStatusCountEffects() {
    let changed = false;
    for (const effect of this.statusEffects) {
      if (String(effect.exitCond) !== 'Count') continue;
      if (!isActiveStatusEffect(effect)) continue;
      if (effect.metadata?.specialStatusTypeId == null) continue;
      effect.remaining = Math.max(0, Number(effect.remaining) - 1);
      changed = true;
    }
    const beforeLen = this.statusEffects.length;
    this.statusEffects = this.statusEffects.filter((e) => isActiveStatusEffect(e));
    if (changed || this.statusEffects.length !== beforeLen) {
      this._revision += 1;
    }
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
      supportStyleId: this.supportStyleId,
      supportStyleLimitBreakLevel: this.supportStyleLimitBreakLevel,
      partyIndex: this.partyIndex,
      position: this.position,
      normalAttackElements: [...this.normalAttackElements],
      sp: { ...this.sp },
      ep: { ...this.ep },
      dpState: cloneDpState(this.dpState),
      tokenState: { ...this.tokenState },
      moraleState: { ...this.moraleState },
      motivationState: { ...this.motivationState },
      markStates: Object.fromEntries(
        Object.entries(this.markStates ?? {}).map(([element, state]) => [element, { ...state }])
      ),
      isAlive: this.isAlive,
      isBreak: this.isBreak,
      isExtraActive: this.isExtraActive,
      isReinforcedMode: this.isReinforcedMode,
      reinforcedTurnsRemaining: this.reinforcedTurnsRemaining,
      actionDisabledTurns: this.actionDisabledTurns,
      shreddingTurnsRemaining: this.shreddingTurnsRemaining,
      epRule: this.epRule ? structuredClone(this.epRule) : null,
      statusEffects: structuredClone(this.statusEffects),
      skillUseCounts: Object.fromEntries(this.skillUseCounts.entries()),
      revision: this._revision,
    };
  }
}
