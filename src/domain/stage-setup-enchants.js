export const STAGE_SETUP_ENCHANT_EFFECT_TYPES = Object.freeze({
  OD_GAUGE_GAIN_BONUS_PERCENT: 'odGaugeGainBonusPercent',
  TURN_START_SP_IF_ENEMY_DOWN: 'turnStartSpIfEnemyDown',
  TURN_START_SP_IF_NEGATIVE_SP: 'turnStartSpIfNegativeSp',
  SP_ON_ENEMY_KILL: 'spOnEnemyKill',
});

export const STAGE_SETUP_ENCHANT_EFFECT_SCOPES = Object.freeze({
  ALL: 'all',
  FRONT: 'front',
  BACK: 'back',
});

const STAGE_SETUP_ENCHANT_EFFECT_ORDER = Object.freeze([
  STAGE_SETUP_ENCHANT_EFFECT_TYPES.OD_GAUGE_GAIN_BONUS_PERCENT,
  STAGE_SETUP_ENCHANT_EFFECT_TYPES.TURN_START_SP_IF_ENEMY_DOWN,
  STAGE_SETUP_ENCHANT_EFFECT_TYPES.TURN_START_SP_IF_NEGATIVE_SP,
  STAGE_SETUP_ENCHANT_EFFECT_TYPES.SP_ON_ENEMY_KILL,
]);

const STAGE_SETUP_ENCHANT_SCOPE_ORDER = Object.freeze([
  STAGE_SETUP_ENCHANT_EFFECT_SCOPES.ALL,
  STAGE_SETUP_ENCHANT_EFFECT_SCOPES.FRONT,
  STAGE_SETUP_ENCHANT_EFFECT_SCOPES.BACK,
]);

function formatSignedNumber(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return '+0';
  }
  return numeric >= 0 ? `+${numeric}` : String(numeric);
}

function formatSignedPercent(value) {
  return `${formatSignedNumber(value)}%`;
}

function getScopeLabel(scope) {
  if (scope === STAGE_SETUP_ENCHANT_EFFECT_SCOPES.FRONT) {
    return '前衛';
  }
  if (scope === STAGE_SETUP_ENCHANT_EFFECT_SCOPES.BACK) {
    return '後衛';
  }
  return '味方全体';
}

export function normalizeStageSetupEnchantEffect(effect = {}) {
  if (!effect || typeof effect !== 'object') {
    return null;
  }

  const effectType = String(effect?.effectType ?? '').trim();
  const amount = Number(effect?.amount);
  if (!Number.isFinite(amount) || amount === 0) {
    return null;
  }

  if (effectType === STAGE_SETUP_ENCHANT_EFFECT_TYPES.OD_GAUGE_GAIN_BONUS_PERCENT) {
    return { effectType, amount };
  }

  if (effectType === STAGE_SETUP_ENCHANT_EFFECT_TYPES.TURN_START_SP_IF_ENEMY_DOWN) {
    return {
      effectType,
      scope: STAGE_SETUP_ENCHANT_EFFECT_SCOPES.ALL,
      amount,
    };
  }

  if (effectType === STAGE_SETUP_ENCHANT_EFFECT_TYPES.SP_ON_ENEMY_KILL) {
    return {
      effectType,
      scope: STAGE_SETUP_ENCHANT_EFFECT_SCOPES.ALL,
      amount,
    };
  }

  if (effectType === STAGE_SETUP_ENCHANT_EFFECT_TYPES.TURN_START_SP_IF_NEGATIVE_SP) {
    const scope = String(effect?.scope ?? '').trim();
    if (
      scope !== STAGE_SETUP_ENCHANT_EFFECT_SCOPES.FRONT &&
      scope !== STAGE_SETUP_ENCHANT_EFFECT_SCOPES.BACK
    ) {
      return null;
    }
    return {
      effectType,
      scope,
      amount,
    };
  }

  return null;
}

export function normalizeStageSetupEnchantEffects(effects = []) {
  if (!Array.isArray(effects)) {
    return [];
  }

  const normalizedByKey = new Map();
  for (const effect of effects) {
    const normalized = normalizeStageSetupEnchantEffect(effect);
    if (!normalized) {
      continue;
    }
    const key = `${normalized.effectType}:${normalized.scope ?? ''}`;
    if (!normalizedByKey.has(key)) {
      normalizedByKey.set(key, normalized);
      continue;
    }
    const current = normalizedByKey.get(key);
    normalizedByKey.set(key, {
      ...current,
      amount: Number(current.amount ?? 0) + Number(normalized.amount ?? 0),
    });
  }

  return [...normalizedByKey.values()]
    .filter((effect) => Number(effect.amount) !== 0)
    .sort((left, right) => {
      const leftEffectIndex = STAGE_SETUP_ENCHANT_EFFECT_ORDER.indexOf(String(left?.effectType ?? ''));
      const rightEffectIndex = STAGE_SETUP_ENCHANT_EFFECT_ORDER.indexOf(String(right?.effectType ?? ''));
      if (leftEffectIndex !== rightEffectIndex) {
        return leftEffectIndex - rightEffectIndex;
      }
      const leftScopeIndex = STAGE_SETUP_ENCHANT_SCOPE_ORDER.indexOf(String(left?.scope ?? ''));
      const rightScopeIndex = STAGE_SETUP_ENCHANT_SCOPE_ORDER.indexOf(String(right?.scope ?? ''));
      return leftScopeIndex - rightScopeIndex;
    });
}

export function buildStageSetupEnchantEffectLabel(effect = {}) {
  const normalized = normalizeStageSetupEnchantEffect(effect);
  if (!normalized) {
    return '';
  }

  if (normalized.effectType === STAGE_SETUP_ENCHANT_EFFECT_TYPES.OD_GAUGE_GAIN_BONUS_PERCENT) {
    return `ODゲージ上昇量${formatSignedPercent(normalized.amount)}`;
  }

  if (normalized.effectType === STAGE_SETUP_ENCHANT_EFFECT_TYPES.TURN_START_SP_IF_ENEMY_DOWN) {
    return `ターン開始時ダウンターン中の敵がいるとSP${formatSignedNumber(normalized.amount)}`;
  }

  if (normalized.effectType === STAGE_SETUP_ENCHANT_EFFECT_TYPES.TURN_START_SP_IF_NEGATIVE_SP) {
    return `ターン開始時SP0未満の${getScopeLabel(normalized.scope)}の味方のSP${formatSignedNumber(normalized.amount)}`;
  }

  if (normalized.effectType === STAGE_SETUP_ENCHANT_EFFECT_TYPES.SP_ON_ENEMY_KILL) {
    return `敵を倒したとき敵1体につき味方全体のSP${formatSignedNumber(normalized.amount)}`;
  }

  return '';
}

export function buildStageSetupEnchantEffectLabels(effects = []) {
  return normalizeStageSetupEnchantEffects(effects)
    .map((effect) => buildStageSetupEnchantEffectLabel(effect))
    .filter(Boolean);
}
