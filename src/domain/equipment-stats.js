export const EQUIPMENT_STAT_KEYS = Object.freeze(['str', 'dex', 'wis', 'spr', 'luk', 'con']);

const ABILITY_TYPE_TO_STAT = Object.freeze({
  Power: 'str',
  Dexterity: 'dex',
  Wisdom: 'wis',
  Spirit: 'spr',
  Luck: 'luk',
  Toughness: 'con',
});

function createZeroBonus() {
  return Object.fromEntries(EQUIPMENT_STAT_KEYS.map((k) => [k, 0]));
}

function addStatValue(bonus, abilityType, value) {
  const key = ABILITY_TYPE_TO_STAT[abilityType];
  if (key) bonus[key] += value;
}

function sumEffects(effects) {
  const bonus = createZeroBonus();
  for (const e of effects ?? []) {
    if (e?.category === 'Ability' && e?.skill == null && e?.value_type === 'RealNumber') {
      addStatValue(bonus, e.type, Number(e.value?.[0] ?? 0));
    }
  }
  return bonus;
}

function sumRngEffAtTier(rngEff, tier) {
  const bonus = createZeroBonus();
  for (const slot of rngEff ?? []) {
    const best = {};
    for (const e of slot ?? []) {
      if (e?.plus !== tier || e?.skill != null) continue;
      const key = ABILITY_TYPE_TO_STAT[e.type];
      if (!key) continue;
      const v = Number(e.value?.[0] ?? 0);
      if (best[key] === undefined || v > best[key]) best[key] = v;
    }
    for (const [k, v] of Object.entries(best)) bonus[k] += v;
  }
  return bonus;
}

function parseSoulAllStatPerLevel(soul) {
  const m = String(soul?.text ?? '').match(/全能力 \+(\d+)/);
  return m ? parseInt(m[1], 10) : 0;
}

function resolveSoulBonus(soulConfig, accessories) {
  if (!soulConfig) return createZeroBonus();
  const soulData = accessories?.find((a) => a.id === soulConfig.id);
  const perLevel = soulData ? parseSoulAllStatPerLevel(soulData) : 0;
  const allBonus = perLevel * (soulConfig.enhanceLevel ?? 0);
  const bonus = createZeroBonus();
  EQUIPMENT_STAT_KEYS.forEach((k) => (bonus[k] += allBonus));
  for (const se of soulConfig.slotEffects ?? []) {
    if (EQUIPMENT_STAT_KEYS.includes(se?.stat)) bonus[se.stat] += Number(se.value ?? 0);
  }
  return bonus;
}

function resolveBoosterBonus(boosterConfig, boosters) {
  if (!boosterConfig) return createZeroBonus();
  const data = boosters?.find((b) => b.id === boosterConfig.id);
  return sumEffects(data?.effects);
}

function resolveChipsBonus(chipsConfig, chips) {
  const bonus = createZeroBonus();
  for (const chipConfig of chipsConfig ?? []) {
    const data = chips?.find((c) => c.id === chipConfig.id);
    const cb = sumEffects(data?.effects);
    for (const k of EQUIPMENT_STAT_KEYS) bonus[k] += cb[k];
  }
  return bonus;
}

function resolveAccessoryBonus(accConfig, accessories) {
  const bonus = createZeroBonus();
  const data = accessories?.find((a) => a.id === accConfig.id);
  if (!data) return bonus;
  const fixed = sumEffects(data.effects);
  const rng = sumRngEffAtTier(data.rng_eff, accConfig.enhanceTier ?? 0);
  for (const k of EQUIPMENT_STAT_KEYS) bonus[k] += fixed[k] + rng[k];
  for (const se of accConfig.slotEffects ?? []) {
    if (EQUIPMENT_STAT_KEYS.includes(se?.stat)) bonus[se.stat] += Number(se.value ?? 0);
  }
  return bonus;
}

function resolveCharmsBonus(charmsConfig, accessories) {
  const bonus = createZeroBonus();
  for (const charmConfig of charmsConfig ?? []) {
    const data = accessories?.find((a) => a.id === charmConfig.id);
    const slot0 = data?.rng_eff?.[0] ?? [];
    const tier = charmConfig.enhanceTier ?? 0;
    const entries = slot0.filter((e) => e?.plus === tier && e?.skill == null);
    if (entries.length === 0) continue;
    const key = ABILITY_TYPE_TO_STAT[entries[0].type];
    if (!key) continue;
    const best = Math.max(...entries.map((e) => Number(e.value?.[0] ?? 0)));
    bonus[key] += best;
  }
  return bonus;
}

/**
 * 装備品による6能力フラットボーナスを算出する。
 * resolveCharacterStyleStats の結果に加算して最終ステータスを得る。
 *
 * @param {object|null} config - EquipmentConfig (null または空の場合は全0)
 * @param {{accessories: any[], boosters: any[], chips: any[]}} masterData
 * @returns {{str,dex,wis,spr,luk,con}}
 */
export function resolveEquipmentStatBonus(config, masterData) {
  const bonus = createZeroBonus();
  if (!config || !masterData) return bonus;
  const { accessories = [], boosters = [], chips = [] } = masterData;

  const parts = [
    resolveSoulBonus(config.soul, accessories),
    resolveBoosterBonus(config.booster, boosters),
    resolveChipsBonus(config.chips, chips),
    ...((config.accessories ?? []).map((a) => resolveAccessoryBonus(a, accessories))),
    resolveCharmsBonus(config.charms, accessories),
  ];
  for (const part of parts) {
    for (const k of EQUIPMENT_STAT_KEYS) bonus[k] += part[k];
  }
  return bonus;
}
