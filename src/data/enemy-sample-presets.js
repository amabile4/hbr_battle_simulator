export const PINNED_INITIAL_SETUP_ENEMY = Object.freeze({
  id: 13450045,
  label: 'Dimension_01_X_RedCrimson',
  name: '希望を喰むもの',
});

export const DEATH_SLUG_WHITE_SAMPLE_ENEMY = Object.freeze({
  id: 13450251,
  label: 'Dimension_03_C_DeathSlugWhite',
  name: '終焉を告げる邂逅',
});

export const DEATH_SLUG_WHITE_BIT_SAMPLE_ENEMY = Object.freeze({
  id: 13450256,
  label: 'Dimension_03_C1_DeathSlugWhiteBit',
  name: 'エネルギーピットε',
});

export const ENERGY_PIT_PINK_E_SAMPLE_ENEMY = Object.freeze({
  id: 13450259,
  label: 'Dimension_03_C1_EnergyPit_Pink_e',
  name: 'エネルギーピットδ',
});

export const SUMMON_SAMPLE_ENEMIES = Object.freeze([
  DEATH_SLUG_WHITE_SAMPLE_ENEMY,
  DEATH_SLUG_WHITE_BIT_SAMPLE_ENEMY,
  ENERGY_PIT_PINK_E_SAMPLE_ENEMY,
]);

export const DEFAULT_SUMMON_SAMPLE_ENEMY = DEATH_SLUG_WHITE_BIT_SAMPLE_ENEMY;

export const ALWAYS_VISIBLE_ENEMY_PRESET_IDS = Object.freeze([
  PINNED_INITIAL_SETUP_ENEMY.id,
  ...SUMMON_SAMPLE_ENEMIES.map((enemy) => enemy.id),
]);
