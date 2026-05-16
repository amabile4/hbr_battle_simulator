import { applySpChange, getEventCeiling } from './sp.js';
import { createDpState, cloneDpState, getDpRate } from './dp-state.js';
import { resolveShortCharacterName } from './character-name.js';
import {
  getAlternateFormInfo,
  getCurrentFormInfo,
  getCurrentFormKey,
  normalizeFormChange,
  resolveRequiredFormKey,
  toggleFormKey,
} from './form-change.js';
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
  313: 'Mocktail',
});

const STACKABLE_COUNT_SPECIAL_STATUS_TYPE_IDS = new Set([78]);
const MANUAL_CONSUMPTION_SPECIAL_STATUS_TYPE_IDS = new Set([78]);

export function normalizePartyPosition(position) {
  const numericPosition = Number(position);
  if (!Number.isInteger(numericPosition) || numericPosition < 0 || numericPosition > MAX_PARTY_POSITION) {
    throw new Error(`Invalid position: ${position}`);
  }
  return numericPosition;
}

function normalizeSkill(skill) {
  const sourceType = String(skill.sourceType ?? 'style');
  const isPassive = Boolean(skill.passive && typeof skill.passive === 'object') || sourceType === 'passive';
  const legacySkillIds = Array.isArray(skill.legacySkillIds)
    ? [...new Set(skill.legacySkillIds.map((id) => Number(id)).filter((id) => Number.isFinite(id)))]
    : [];
  return {
    skillId: Number(skill.id ?? skill.skillId),
    label: String(skill.label ?? ''),
    name: String(skill.name ?? ''),
    desc: String(skill.desc ?? ''),
    targetType: String(skill.target_type ?? skill.targetType ?? ''),
    spCost: Number(skill.sp_cost ?? skill.spCost ?? 0),
    sourceType,
    isPassive,
    type: resolveSkillType(skill),
    consumeType: skill.consume_type ?? skill.consumeType ?? null,
    hitCount: Number(skill.hit_count ?? skill.hitCount ?? 0),
    isRestricted: Number(skill.is_restricted ?? skill.isRestricted ?? 0) === 1,
    cardForm: String(skill.card_form ?? skill.cardForm ?? ''),
    hits: Array.isArray(skill.hits) ? structuredClone(skill.hits) : [],
    maxLevel: skill.max_level ?? skill.maxLevel ?? null,
    spRecoveryCeiling:
      typeof skill.spRecoveryCeiling === 'number' ? skill.spRecoveryCeiling : undefined,
    cond: String(skill.cond ?? ''),
    iucCond: String(skill.iuc_cond ?? skill.iucCond ?? ''),
    overwriteCond: String(skill.overwrite_cond ?? skill.overwriteCond ?? ''),
    effect: String(skill.effect ?? ''),
    overwrite:
      skill.overwrite === undefined || skill.overwrite === null ? null : Number(skill.overwrite),
    legacySkillIds,
    usage:
      skill?.usage && typeof skill.usage === 'object' ? structuredClone(skill.usage) : null,
    additionalTurnRule:
      skill.additionalTurnRule && typeof skill.additionalTurnRule === 'object'
        ? structuredClone(skill.additionalTurnRule)
        : null,
    parts: Array.isArray(skill.parts) ? structuredClone(skill.parts) : [],
    passive: skill.passive && typeof skill.passive === 'object' ? structuredClone(skill.passive) : null,
  };
}

function partHasDamage(part) {
  const skillType = String(part?.skill_type ?? '').toLowerCase();
  if (
    skillType.includes('attack') ||
    skillType.includes('damage') ||
    skillType.includes('break')
  ) {
    return true;
  }

  if (Array.isArray(part?.strval)) {
    for (const nested of part.strval) {
      if (nested && typeof nested === 'object' && hasDamageInParts(nested.parts)) {
        return true;
      }
    }
  }

  return false;
}

function hasDamageInParts(parts) {
  return (parts ?? []).some((part) => partHasDamage(part));
}

function inferSkillType(skill) {
  const parts = Array.isArray(skill.parts) ? skill.parts : [];
  const hasDamage = hasDamageInParts(parts);

  return hasDamage ? 'damage' : 'non_damage';
}

function resolveSkillType(skill) {
  const inferredType = inferSkillType(skill);
  if (inferredType === 'damage') {
    return 'damage';
  }
  return inferredType;
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
    usage: null,
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
    sourceCharacterId: String(effect?.sourceCharacterId ?? ''),
    sourceCharacterName: String(effect?.sourceCharacterName ?? ''),
    sourceSkillDesc: String(effect?.sourceSkillDesc ?? ''),
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
    cardForm: String(passive.card_form ?? passive.cardForm ?? ''),
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
    this.shortName = String(input.shortName ?? resolveShortCharacterName(input.characterName, String(input.characterId ?? '')));
    this.styleId = Number(input.styleId);
    this.styleName = String(input.styleName);
    this.team = String(input.team ?? '');
    this.role = String(input.role ?? '');
    this.formChange = normalizeFormChange(input.formChange);
    if (this.formChange) {
      const currentFormInfo = getCurrentFormInfo(this.formChange);
      if (currentFormInfo?.role) {
        this.role = String(currentFormInfo.role);
      }
    }
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
      (input.skills ?? []).map((skill) => normalizeSkill(skill))
    );
    this.triggeredSkills = Object.freeze(
      (input.triggeredSkills ?? []).map((skill) => normalizeSkill(skill))
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
    return (
      this.skills.find(
        (skill) =>
          !skill.isPassive &&
          (skill.skillId === id || skill.legacySkillIds?.includes?.(id))
      ) ?? null
    );
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
      if (
        Number.isFinite(numericId) &&
        Array.isArray(skill.legacySkillIds) &&
        skill.legacySkillIds.includes(numericId)
      ) {
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

    // HbrDataStore で is_adv=true && sp_cost > 0 に cond: "Sp()>=0" が付与されている
    // しかし、skill.cond が empty な場合もあるので、getSkill の結果から再度読み込む
    const skillFromRegistry = this.getSkill(skill.skillId);
    const effectiveCond = String(skill.cond ?? skillFromRegistry?.cond ?? '');
    
    const hasSpGreaterOrEqualZeroCondition = /(^|&&)\s*Sp\(\)\s*>=\s*0(\s*|&&|$)/.test(effectiveCond);
    const isSpConsumeSkill =
      consumeType !== 'Ep' &&
      consumeType !== 'Token' &&
      consumeType !== 'Morale' &&
      consumeType !== 'Motivation' &&
      rawCost > 0;

    let insufficientSpWarning = null;
    if (isSpConsumeSkill) {
      // 通常スキル：currentSP >= spCost が必要。不足時は warning を記録
      // Sp()>=0 条件付きスキル：currentSP >= 0 なら使用可能。不足時は warning なし
      // 速弾き中：currentSP >= 0 なら使用可能。不足時は warning なし
      if (this.isShredding || hasSpGreaterOrEqualZeroCondition) {
        if (startSP < 0) {
          insufficientSpWarning = `Skill ${skill.skillId} requires SP >= 0 (Sp()>=0 condition or Shredding). current=${startSP}`;
        }
      } else if (startSP < cost) {
        insufficientSpWarning = `Skill ${skill.skillId} requires SP >= ${cost} (normal skill). current=${startSP}`;
      }
    }

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
    // シミュレーター方針: SP は常にマイナスを許容する（下限なし）。
    // ユーザーが編集でSPが不足しても、マイナス値をそのまま表示してユーザーが判断する。
    const endSP = applySpChange(startSP, deltaSP, Number.NEGATIVE_INFINITY, Number.POSITIVE_INFINITY);
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
      insufficientSpWarning,
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
    // シミュレーター方針: SP は常にマイナスを許容する（下限なし）。
    // SP=-10 で回復+5 → -5（0 にクランプしない）。
    const endSP = applySpChange(startSP, numericDelta, Number.NEGATIVE_INFINITY, eventCeiling);
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

  hasFormChange() {
    return this.formChange != null;
  }

  getCurrentFormKey() {
    return getCurrentFormKey(this.formChange);
  }

  getCurrentFormInfo() {
    return getCurrentFormInfo(this.formChange);
  }

  getAlternateFormInfo() {
    return getAlternateFormInfo(this.formChange);
  }

  resolveRequiredFormKey(cardForm = '') {
    return resolveRequiredFormKey(this.formChange, cardForm);
  }

  setCurrentForm(formKey) {
    if (!this.formChange) {
      return false;
    }
    const normalizedFormKey = String(formKey ?? '').trim();
    const currentFormKey = this.getCurrentFormKey();
    if (!normalizedFormKey || !this.formChange.forms?.[normalizedFormKey]) {
      return false;
    }
    if (currentFormKey === normalizedFormKey) {
      return false;
    }
    this.formChange.currentFormKey = normalizedFormKey;
    const currentFormInfo = this.getCurrentFormInfo();
    if (currentFormInfo?.role) {
      this.role = String(currentFormInfo.role);
    }
    this._revision += 1;
    return true;
  }

  toggleCurrentForm() {
    if (!this.formChange) {
      return false;
    }
    const nextFormKey = toggleFormKey(this.formChange);
    return this.setCurrentForm(nextFormKey);
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
    const power = Number(context?.power);
    const metadata =
      context?.metadata && typeof context.metadata === 'object'
        ? structuredClone(context.metadata)
        : {};

    const sourceCharacterId = String(context?.actor?.characterId ?? '');
    const sourceCharacterName = String(context?.actor?.characterName ?? '');
    // Count でスタックする特殊状態（例: MindEye）は重複エントリを保持する。
    const canMergeExisting = !(cond === 'Count' && STACKABLE_COUNT_SPECIAL_STATUS_TYPE_IDS.has(id));
    if (canMergeExisting) {
      // 同一 typeId の既存エントリがあれば残りターン数を max 採用で更新
      const existing = this.statusEffects.find(
        (e) => Number(e.metadata?.specialStatusTypeId) === id
      );
      if (existing) {
        if (cond !== 'Eternal') {
          existing.remaining = Math.max(existing.remaining, effectiveRemaining);
        }
        if (Number.isFinite(power)) {
          existing.power = Math.max(Number(existing.power ?? 0), power);
        }
        existing.sourceSkillId = skill?.skillId ?? null;
        existing.sourceSkillLabel = String(skill?.label ?? '');
        existing.sourceSkillName = String(skill?.name ?? '');
        existing.sourceSkillDesc = String(skill?.desc ?? '');
        existing.sourceCharacterId = sourceCharacterId;
        existing.sourceCharacterName = sourceCharacterName;
        existing.metadata = {
          ...(existing.metadata && typeof existing.metadata === 'object' ? existing.metadata : {}),
          ...metadata,
          specialStatusTypeId: id,
        };
        this._revision += 1;
        return;
      }
    }

    this.addStatusEffect({
      statusType,
      exitCond: cond,
      remaining: effectiveRemaining,
      sourceSkillId: skill?.skillId ?? null,
      sourceSkillLabel: String(skill?.label ?? ''),
      sourceSkillName: String(skill?.name ?? ''),
      sourceSkillDesc: String(skill?.desc ?? ''),
      sourceCharacterId,
      sourceCharacterName,
      power: Number.isFinite(power) ? power : 0,
      metadata: { specialStatusTypeId: id, ...metadata },
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
      const specialStatusTypeId = Number(effect.metadata?.specialStatusTypeId);
      if (!Number.isFinite(specialStatusTypeId)) continue;
      if (MANUAL_CONSUMPTION_SPECIAL_STATUS_TYPE_IDS.has(specialStatusTypeId)) continue;
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

  getDoubleActionExtraSkillEffects(options = {}) {
    return this.getStatusEffectsByType('DoubleActionExtraSkill', options);
  }

  resolveEffectiveDoubleActionExtraSkillEffects() {
    return this.getDoubleActionExtraSkillEffects({ activeOnly: true }).sort(sortStatusEffectsByPriority).slice(0, 1);
  }

  consumeDoubleActionExtraSkillEffects(consumeCount = 1) {
    return this.consumeDoubleActionStatusEffects('DoubleActionExtraSkill', consumeCount);
  }

  getByakkoDoubleActionAttackSkillEffects(options = {}) {
    return this.getStatusEffectsByType('ByakkoDoubleActionAttackSkill', options);
  }

  resolveEffectiveByakkoDoubleActionAttackSkillEffects() {
    return this.getByakkoDoubleActionAttackSkillEffects({ activeOnly: true }).sort(sortStatusEffectsByPriority).slice(0, 1);
  }

  consumeByakkoDoubleActionAttackSkillEffects(consumeCount = 1) {
    return this.consumeDoubleActionStatusEffects('ByakkoDoubleActionAttackSkill', consumeCount);
  }

  consumeDoubleActionStatusEffects(statusType, consumeCount = 1) {
    const count = Math.max(0, Number(consumeCount) || 0);
    if (count <= 0) {
      return [];
    }

    const normalizedStatusType = String(statusType ?? '').trim();
    if (!normalizedStatusType) {
      return [];
    }

    const picked = this.getStatusEffectsByType(normalizedStatusType, { activeOnly: true })
      .sort(sortStatusEffectsByPriority)
      .slice(0, count);
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

  /**
   * このインスタンスの完全な独立コピーを返す。
   * snapshot() と同じコピー戦略を使い、全 mutable フィールドを独立させる。
   * commitTurnRecord が nextState を生成する際に party メンバーの共有参照を防ぐために使用する。
   */
  clone() {
    const c = Object.create(CharacterStyle.prototype);
    // immutable フィールド（参照コピー）
    c.characterId = this.characterId;
    c.characterName = this.characterName;
    c.shortName = this.shortName;
    c.styleId = this.styleId;
    c.styleName = this.styleName;
    c.team = this.team;
    c.role = this.role;
    c.formChange = this.formChange ? structuredClone(this.formChange) : null;
    c.weaponType = this.weaponType;
    c.elements = this.elements;
    c.normalAttackElements = this.normalAttackElements;
    c.transcendenceRule = this.transcendenceRule;
    c.limitBreakLevel = this.limitBreakLevel;
    c.supportStyleId = this.supportStyleId;
    c.supportStyleLimitBreakLevel = this.supportStyleLimitBreakLevel;
    c.drivePiercePercent = this.drivePiercePercent;
    c.partyIndex = this.partyIndex;
    c.skills = this.skills;
    c.triggeredSkills = this.triggeredSkills;
    c.passives = this.passives;
    c.effects = this.effects;
    // mutable primitive
    c.position = this.position;
    c.isAlive = this.isAlive;
    c.isBreak = this.isBreak;
    c.isExtraActive = this.isExtraActive;
    c.isReinforcedMode = this.isReinforcedMode;
    c.reinforcedTurnsRemaining = this.reinforcedTurnsRemaining;
    c.actionDisabledTurns = this.actionDisabledTurns;
    c.shreddingTurnsRemaining = this.shreddingTurnsRemaining;
    c._nextStatusEffectId = this._nextStatusEffectId;
    c._revision = this._revision;
    // mutable object（snapshot() と同じ戦略）
    c.sp = { ...this.sp };
    c.ep = { ...this.ep };
    c.dpState = cloneDpState(this.dpState);
    c.tokenState = { ...this.tokenState };
    c.moraleState = { ...this.moraleState };
    c.motivationState = { ...this.motivationState };
    c.markStates = Object.fromEntries(
      Object.entries(this.markStates ?? {}).map(([k, v]) => [k, { ...v }])
    );
    c.epRule = this.epRule ? structuredClone(this.epRule) : null;
    c.statusEffects = structuredClone(this.statusEffects);
    c.skillUseCounts = new Map(this.skillUseCounts);
    return c;
  }

  snapshot() {
    return {
      characterId: this.characterId,
      characterName: this.characterName,
      shortName: this.shortName,
      styleId: this.styleId,
      styleName: this.styleName,
      role: this.role,
      limitBreakLevel: this.limitBreakLevel,
      formChange: this.formChange ? structuredClone(this.formChange) : null,
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

/**
 * バフ消費判定の統一オーケストレータ（Phase 2実装）
 * 
 * このセクションは、現在分散しているバフ消費ロジックを一元化するための新関数群です。
 * shouldConsume() が核となり、すべてのバフ消費判定がこれを経由するよう設計されています。
 * 
 * マイグレーション方針:
 * - Phase 2: 新関数の実装（このセクション）
 * - Phase 3: 既存呼び出し側を段階的に新関数へ寄せる
 * - Phase 5: 旧関数の削除
 */

/**
 * バフ消費判定の中核関数
 * 
 * @param {StatusEffect} effect - 判定対象のバフ
 * @param {ActionContext} actionContext - 現在のアクション情報
 * @param {Object} options - オプション
 * @returns {Object} { shouldConsume, reason, consumeAmount }
 */
export function shouldConsume(effect, actionContext, options = {}) {
  if (!effect || typeof effect !== 'object') {
    return {
      shouldConsume: false,
      reason: 'Invalid effect',
      consumeAmount: 0,
    };
  }

  const { excludeEternal = false } = options;
  const exitCond = String(effect.exitCond ?? '');
  const remaining = Number(effect.remaining ?? 0);

  // 1. アクティブ性チェック
  if (exitCond !== 'Eternal' && remaining <= 0) {
    return {
      shouldConsume: false,
      reason: `Effect is inactive (remaining=${remaining})`,
      consumeAmount: 0,
    };
  }

  // 2. Eternalチェック
  if (exitCond === 'Eternal' && excludeEternal) {
    return {
      shouldConsume: false,
      reason: 'Eternal effects excluded by option',
      consumeAmount: 0,
    };
  }

  // 3. アクションコンテキストが null の場合
  if (!actionContext || typeof actionContext !== 'object') {
    return {
      shouldConsume: false,
      reason: 'Invalid action context',
      consumeAmount: 0,
    };
  }

  // 4. exitCond による判定
  switch (exitCond) {
    case 'Count':
      return shouldConsumeCountType(effect, actionContext);
    case 'PlayerTurnEnd':
      return shouldConsumePlayerTurnEndType(actionContext);
    case 'EnemyTurnEnd':
      return shouldConsumeEnemyTurnEndType(actionContext);
    case 'Eternal':
      return shouldConsumeEternalType(actionContext);
    default:
      // 未知の exitCond については消費しない（安全側）
      return {
        shouldConsume: false,
        reason: `Unknown exitCond: ${exitCond}`,
        consumeAmount: 0,
      };
  }
}

/**
 * Count型バフの消費判定
 * トリガー: DamageDealt, NormalAttack, Pursuit, Manual, SpecialStatus
 */
function shouldConsumeCountType(effect, actionContext) {
  const actionType = String(actionContext.actionType ?? '');
  const hasDamage = Boolean(actionContext.hasDamage);

  // Count型の消費条件: ダメージを与える行動、または Manual
  if (actionType === 'Manual') {
    // 手動消費は常に許可
    return {
      shouldConsume: true,
      reason: 'Manual consumption',
      consumeAmount: effect.metadata?.consumeAmount ?? 1,
    };
  }

  if (!hasDamage) {
    // ダメージがない行動では Count型は消費しない
    return {
      shouldConsume: false,
      reason: `Count-type effect requires damage (actionType=${actionType}, hasDamage=${hasDamage})`,
      consumeAmount: 0,
    };
  }

  // ダメージありの行動 (NormalAttack, Skill, Pursuit, AdditionalTurn)
  if (['NormalAttack', 'Skill', 'Pursuit', 'AdditionalTurn'].includes(actionType)) {
    return {
      shouldConsume: true,
      reason: `Count-type matches damage action (${actionType})`,
      consumeAmount: effect.metadata?.consumeAmount ?? 1,
    };
  }

  // その他の actionType
  return {
    shouldConsume: false,
    reason: `Count-type does not match actionType: ${actionType}`,
    consumeAmount: 0,
  };
}

/**
 * PlayerTurnEnd型バフの消費判定
 * これらは自動的にターン終了フェーズでのみ消費される
 */
function shouldConsumePlayerTurnEndType(actionContext) {
  const actionType = String(actionContext.actionType ?? '');
  const turnPhase = String(actionContext.turnPhase ?? '');

  if (actionType === 'TurnEnd' && turnPhase === 'PlayerTurnEnd') {
    return {
      shouldConsume: true,
      reason: 'PlayerTurnEnd phase match',
      consumeAmount: 1,
    };
  }

  return {
    shouldConsume: false,
    reason: `PlayerTurnEnd requires TurnEnd action in PlayerTurnEnd phase (got ${actionType}/${turnPhase})`,
    consumeAmount: 0,
  };
}

/**
 * EnemyTurnEnd型バフの消費判定
 */
function shouldConsumeEnemyTurnEndType(actionContext) {
  const actionType = String(actionContext.actionType ?? '');
  const turnPhase = String(actionContext.turnPhase ?? '');

  if (actionType === 'TurnEnd' && turnPhase === 'EnemyTurnEnd') {
    return {
      shouldConsume: true,
      reason: 'EnemyTurnEnd phase match',
      consumeAmount: 1,
    };
  }

  return {
    shouldConsume: false,
    reason: `EnemyTurnEnd requires TurnEnd action in EnemyTurnEnd phase (got ${actionType}/${turnPhase})`,
    consumeAmount: 0,
  };
}

/**
 * Eternal型バフの消費判定
 * 手動消費またはスキル内で明示的に指定された場合のみ
 */
function shouldConsumeEternalType(actionContext) {
  const actionType = String(actionContext.actionType ?? '');

  if (actionType === 'Manual') {
    return {
      shouldConsume: true,
      reason: 'Eternal type: manual consumption',
      consumeAmount: 1,
    };
  }

  // Eternal は ターン進行では消費しない
  return {
    shouldConsume: false,
    reason: 'Eternal type: only consumed by manual action',
    consumeAmount: 0,
  };
}

/**
 * バフメタデータの整合性バリデーション
 * 
 * @param {StatusEffect} effect - 検証対象のバフ
 * @returns {string[]} エラーメッセージの配列（空配列 = OK）
 */
export function validateBuffMetadata(effect) {
  if (!effect || typeof effect !== 'object') {
    return ['Effect is not an object'];
  }

  const errors = [];
  const exitCond = String(effect.exitCond ?? '');
  const limitType = String(effect.limitType ?? '');
  const metadata = effect.metadata ?? {};

  // exitCond のバリデーション
  const validExitConds = ['Count', 'PlayerTurnEnd', 'EnemyTurnEnd', 'Eternal'];
  if (!validExitConds.includes(exitCond)) {
    errors.push(`Invalid exitCond: ${exitCond} (must be one of: ${validExitConds.join(', ')})`);
  }

  // limitType のバリデーション
  const validLimitTypes = ['Default', 'Only', 'Special'];
  if (!validLimitTypes.includes(limitType)) {
    errors.push(`Invalid limitType: ${limitType} (must be one of: ${validLimitTypes.join(', ')})`);
  }

  // 矛盾チェック: Eternal は limitType=Only
  if (exitCond === 'Eternal' && limitType !== 'Only') {
    errors.push('Eternal effects should have limitType=Only');
  }

  // metadata.consumeTrigger のバリデーション
  if (typeof metadata.consumeTrigger !== 'undefined') {
    const validTriggers = ['DamageDealt', 'NormalAttack', 'Pursuit', 'TurnEnd', 'Manual', 'SpecialStatus'];
    if (!validTriggers.includes(metadata.consumeTrigger)) {
      errors.push(`Invalid consumeTrigger: ${metadata.consumeTrigger}`);
    }
  }

  // Count型なのに consumeTrigger が無い場合は warning でなくログ記録程度で許可
  // （既存バフは metadata が sparse なため）

  return errors;
}
