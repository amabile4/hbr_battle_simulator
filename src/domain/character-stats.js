export const CHARACTER_STAT_KEYS = Object.freeze(['str', 'dex', 'wis', 'spr', 'luk', 'con']);
export const SUPPORT_STAT_CONTRIBUTION_RATE = 0.1;

export const TEMPLATE_CHARACTER_LEVEL = 200;
export const TEMPLATE_REINCARNATION_COUNT = 5;

const SUPPORT_STAT_CONTRIBUTION_DIVISOR = 10;
const PERCENT_DIVISOR = 100;
const PARAM_ALL_ABILITY_TYPE = 'ParamAll';
const PARAM_ALL_OTHER_CARD_ABILITY_TYPE = 'ParamAllOtherCard';
const TEMPLATE_LIMIT_BREAK_MAX_BY_TIER = Object.freeze({ A: 20, S: 10, SS: 4, SSR: 4 });
const STAT_ABILITY_TYPE_BY_KEY = Object.freeze({
  str: 'Power',
  dex: 'Dexterity',
  wis: 'Wisdom',
  spr: 'Spirit',
  luk: 'Luck',
  con: 'Toughness',
});

function getAbilityValue(ability) {
  const rawValue = Array.isArray(ability?.value) ? ability.value[0] : ability?.value;
  const value = Number(rawValue);
  return Number.isFinite(value) ? value : 0;
}

function addAbilityValue(target, abilityType, value) {
  if (abilityType === PARAM_ALL_ABILITY_TYPE || abilityType === PARAM_ALL_OTHER_CARD_ABILITY_TYPE) {
    for (const key of CHARACTER_STAT_KEYS) {
      target[key] += value;
    }
    return;
  }
  const key = CHARACTER_STAT_KEYS.find(
    (candidate) => STAT_ABILITY_TYPE_BY_KEY[candidate] === abilityType
  );
  if (key) {
    target[key] += value;
  }
}

function createZeroStats() {
  return Object.fromEntries(CHARACTER_STAT_KEYS.map((key) => [key, 0]));
}

function listStyleAbilities(style) {
  return (style?.ability_tree ?? []).flatMap((tree) => tree?.ability_list ?? []);
}

function resolveExplicitLimitBreak(limitBreakLevelsByStyleId, styleId) {
  if (limitBreakLevelsByStyleId instanceof Map) {
    return limitBreakLevelsByStyleId.has(Number(styleId))
      ? limitBreakLevelsByStyleId.get(Number(styleId))
      : null;
  }
  if (!limitBreakLevelsByStyleId || typeof limitBreakLevelsByStyleId !== 'object') {
    return null;
  }
  const key = String(styleId);
  return Object.prototype.hasOwnProperty.call(limitBreakLevelsByStyleId, key)
    ? limitBreakLevelsByStyleId[key]
    : null;
}

export function getTemplateStyleLimitBreakMax(style) {
  return TEMPLATE_LIMIT_BREAK_MAX_BY_TIER[String(style?.tier ?? '').toUpperCase()] ?? 0;
}

function normalizeStyleLimitBreak(style, value, fallback = getTemplateStyleLimitBreakMax(style)) {
  const numeric = value == null ? Number.NaN : Number(value);
  const normalized = Number.isFinite(numeric) ? Math.trunc(numeric) : fallback;
  return Math.max(0, Math.min(getTemplateStyleLimitBreakMax(style), normalized));
}

function listReachedLimitBreakAbilities(style, limitBreakLevel) {
  return (style?.limit_break?.bonus_per_level ?? [])
    .filter((entry) => Number(entry?.step ?? 0) <= limitBreakLevel)
    .flatMap((entry) => entry?.bonus ?? [])
    .filter((bonus) => bonus?.category === 'Ability');
}

/**
 * テンプレート①（Lv200・転生5回・能力ボード最大・装備なし）の6能力を算出する。
 * 明示されていない同キャラのスタイルは完凸として共有能力を反映する。
 */
export function resolveTemplateCharacterStats({
  character,
  style,
  styles = [],
  limitBreakLevel = 0,
  limitBreakLevelsByStyleId = {},
} = {}) {
  if (!character || !style) {
    return null;
  }
  const levelValues = Array.isArray(character?.base_param?.level)
    ? character.base_param.level
    : [];
  const levelIndex = levelValues.findIndex((value) => Number(value) === TEMPLATE_CHARACTER_LEVEL);
  if (levelIndex < 0) {
    return null;
  }

  const characterStyles = styles.filter(
    (candidate) => String(candidate?.chara_label ?? '') === String(style.chara_label ?? '')
  );
  if (!characterStyles.some((candidate) => Number(candidate?.id) === Number(style.id))) {
    characterStyles.push(style);
  }

  const selectedLimitBreak = normalizeStyleLimitBreak(style, limitBreakLevel, 0);
  const sharedFixed = createZeroStats();
  const percentBonus = createZeroStats();
  const selectedFixed = createZeroStats();

  for (const candidate of characterStyles) {
    for (const ability of listStyleAbilities(candidate)) {
      if (ability?.is_exclusive !== true && ability?.value_type === 'RealNumber') {
        addAbilityValue(sharedFixed, ability.type, getAbilityValue(ability));
      }
    }

    const explicitLimitBreak = Number(candidate?.id) === Number(style.id)
      ? selectedLimitBreak
      : resolveExplicitLimitBreak(limitBreakLevelsByStyleId, candidate?.id);
    const effectiveLimitBreak = normalizeStyleLimitBreak(candidate, explicitLimitBreak);
    for (const ability of listReachedLimitBreakAbilities(candidate, effectiveLimitBreak)) {
      if (ability?.value_type === 'RealNumber') {
        addAbilityValue(sharedFixed, ability.type, getAbilityValue(ability));
      } else if (
        Number(candidate?.id) !== Number(style.id) &&
        ability?.type === PARAM_ALL_OTHER_CARD_ABILITY_TYPE &&
        ability?.value_type === 'Ratio'
      ) {
        addAbilityValue(percentBonus, ability.type, getAbilityValue(ability));
      }
    }
  }

  for (const ability of listStyleAbilities(style)) {
    if (ability?.is_exclusive !== true) {
      continue;
    }
    if (ability?.value_type === 'Addition') {
      addAbilityValue(selectedFixed, ability.type, getAbilityValue(ability));
    } else if (ability?.value_type === 'Ratio') {
      addAbilityValue(percentBonus, ability.type, getAbilityValue(ability));
    }
  }

  const limitBreakStatPercent =
    selectedLimitBreak * Number(style?.limit_break?.stat_up_per_level ?? style?.stat_up_per_level ?? 0);

  const resolved = Object.fromEntries(
    CHARACTER_STAT_KEYS.map((key) => {
      const baseValue = Number(character?.base_param?.[key]?.[levelIndex]);
      const stylePercent = Number(style?.base_param?.[key] ?? 0);
      const totalPercent = stylePercent + percentBonus[key] + limitBreakStatPercent;
      const value = Math.ceil(
        (
          (baseValue + TEMPLATE_REINCARNATION_COUNT + sharedFixed[key]) *
            (PERCENT_DIVISOR + totalPercent) +
          selectedFixed[key] * PERCENT_DIVISOR
        ) / PERCENT_DIVISOR
      );
      return [key, value];
    })
  );

  return CHARACTER_STAT_KEYS.every((key) => Number.isFinite(resolved[key])) ? resolved : null;
}

export function normalizeCharacterStats(source = null) {
  if (!source || typeof source !== 'object') {
    return null;
  }
  const entries = CHARACTER_STAT_KEYS.map((key) => [key, Number(source[key])]);
  return entries.every(
    ([key, value]) => source[key] !== null && source[key] !== undefined && Number.isFinite(value) && value > 0
  )
    ? Object.fromEntries(entries)
    : null;
}

export function normalizeStatsByPartyIndex(source = {}) {
  if (!source || typeof source !== 'object') {
    return {};
  }
  return Object.fromEntries(
    Object.entries(source)
      .map(([partyIndex, value]) => {
        const stats = normalizeCharacterStats(value?.stats);
        const supportStats = normalizeCharacterStats(value?.supportStats);
        return stats || supportStats
          ? [String(partyIndex), {
              ...(stats ? { stats } : {}),
              ...(supportStats ? { supportStats } : {}),
            }]
          : null;
      })
      .filter(Boolean)
  );
}

export function resolveStatsWithSupport(stats, supportStats = null) {
  const main = normalizeCharacterStats(stats);
  if (!main) {
    return null;
  }
  const support = normalizeCharacterStats(supportStats);
  return support
    ? Object.fromEntries(
        CHARACTER_STAT_KEYS.map((key) => [
          key,
          main[key] + Math.ceil(support[key] / SUPPORT_STAT_CONTRIBUTION_DIVISOR),
        ])
      )
    : main;
}
