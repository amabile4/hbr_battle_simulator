import { ALWAYS_VISIBLE_ENEMY_PRESET_IDS } from '../../src/data/enemy-sample-presets.js';
import { normalizeEnemyEShieldState } from '../../src/domain/enemy-e-shield.js';
import { cloneEnemyExtraHpGaugeState } from '../../src/domain/enemy-extra-hp-gauge.js';

const ALWAYS_SHOW_ENEMY_IDS = new Set(ALWAYS_VISIBLE_ENEMY_PRESET_IDS);
const DEFAULT_ENEMY_RESISTANCE_RATE_PERCENT = 100;
const RECENT_MONTH_WINDOW_COUNT = 3;
const ENEMY_PRESET_MONTH_CATEGORY_PREFIX = 'month:';
export const ENEMY_PRESET_TEMPLATE_CATEGORY_KEY = 'template';
export const ENEMY_PRESET_TEMPLATE_CATEGORY_LABEL = 'テンプレート';
const ENEMY_PRESET_ELEMENT_KEYS = Object.freeze([
  'slash',
  'stab',
  'strike',
  'fire',
  'ice',
  'thunder',
  'light',
  'dark',
  'nonelement',
]);
const DIMENSION_X_NORMAL_ENEMY_PATTERN = /^Dimension_\d+_X_/;
const SUMMON_ENEMY_LABEL_SUFFIX = '_Summon';
const NORMAL_ENEMY_CATEGORY_DEFINITIONS = Object.freeze([
  Object.freeze({
    key: 'normal:stellar-sweepfront',
    label: '恒星掃戦線',
    match(enemy) {
      const label = String(enemy?.label ?? '');
      return DIMENSION_X_NORMAL_ENEMY_PATTERN.test(label) && !label.endsWith(SUMMON_ENEMY_LABEL_SUFFIX);
    },
  }),
]);

export function formatEnemyPresetMonthCategoryLabel(yyyymm) {
  const numeric = Number(yyyymm);
  if (!Number.isInteger(numeric)) {
    return ENEMY_PRESET_TEMPLATE_CATEGORY_LABEL;
  }
  const year = Math.floor(numeric / 100);
  const month = numeric % 100;
  return `${year}年${month}月`;
}

export function buildEnemyPresetMonthCategoryKey(yyyymm) {
  return `${ENEMY_PRESET_MONTH_CATEGORY_PREFIX}${yyyymm}`;
}

export function getEnemyPresetCategoryMetadata(enemy = {}) {
  const categoryKey = typeof enemy?.categoryKey === 'string' ? enemy.categoryKey.trim() : '';
  const categoryLabel = typeof enemy?.categoryLabel === 'string' ? enemy.categoryLabel.trim() : '';
  if (categoryKey && categoryLabel) {
    return {
      key: categoryKey,
      label: categoryLabel,
    };
  }

  const dimension = Number(enemy?.dimension);
  if (Number.isInteger(dimension)) {
    return {
      key: buildEnemyPresetMonthCategoryKey(dimension),
      label: formatEnemyPresetMonthCategoryLabel(dimension),
    };
  }

  return {
    key: ENEMY_PRESET_TEMPLATE_CATEGORY_KEY,
    label: ENEMY_PRESET_TEMPLATE_CATEGORY_LABEL,
  };
}

export function buildEnemyList(rawEnemies, today = new Date()) {
  const normalizeEnemyResistanceRatePercent = (value) => {
    const numeric = Number(value);
    return Number.isFinite(numeric)
      ? DEFAULT_ENEMY_RESISTANCE_RATE_PERCENT - numeric
      : DEFAULT_ENEMY_RESISTANCE_RATE_PERCENT;
  };
  const normalizeAbsorbElementList = (list = []) => {
    if (!Array.isArray(list)) {
      return [];
    }
    return [...new Set(list.map((value) => String(value ?? '').trim().toLowerCase()).filter(Boolean))];
  };
  const normalizeEnemyEShield = (enemy) => {
    const rawShield = enemy?.extra_gauge?.eshield;
    const normalized = normalizeEnemyEShieldState(rawShield, {
      count: enemy?.extra_gauge?.esp,
      max: enemy?.extra_gauge?.esp,
    });
    return normalized
      ? {
          count: normalized.current,
          max: normalized.max,
          elements: [...normalized.elements],
          def_up_rate: normalized.defUpRate,
          dmg_limit: normalized.damageLimit,
        }
      : null;
  };
  const normalizeEnemyExtraHpGauge = (enemy) =>
    cloneEnemyExtraHpGaugeState(enemy?.extra_gauge?.hp);
  if (!Array.isArray(rawEnemies)) return [];

  const currentMonthIndex = today.getFullYear() * 12 + today.getMonth();
  const isWithinRecentThreeMonths = (enemy) => {
    if (!enemy.in_date) return false;
    const date = new Date(enemy.in_date);
    if (Number.isNaN(date.getTime())) return false;
    const enemyMonthIndex = date.getFullYear() * 12 + date.getMonth();
    const monthDelta = currentMonthIndex - enemyMonthIndex;
    return monthDelta >= 0 && monthDelta < RECENT_MONTH_WINDOW_COUNT;
  };
  const toYYYYMM = (inDate) => {
    const date = new Date(inDate);
    if (Number.isNaN(date.getTime())) {
      return null;
    }
    return date.getFullYear() * 100 + (date.getMonth() + 1);
  };
  const dedupeEnemiesByNameKeepingHighestId = (enemies = []) => {
    const byName = new Map();
    enemies.forEach((enemy) => {
      const normalizedName = String(enemy?.name ?? '').trim();
      const dedupeKey = normalizedName || `id:${enemy?.id ?? ''}`;
      const previous = byName.get(dedupeKey);
      if (!previous || Number(enemy?.id ?? 0) > Number(previous?.id ?? 0)) {
        byName.set(dedupeKey, enemy);
      }
    });
    return [...byName.values()];
  };
  const compareByMonthThenName = (left, right) => {
    const leftMonth = toYYYYMM(left?.in_date) ?? 0;
    const rightMonth = toYYYYMM(right?.in_date) ?? 0;
    if (rightMonth !== leftMonth) {
      return rightMonth - leftMonth;
    }
    return (left?.name ?? '').localeCompare(right?.name ?? '', 'ja');
  };

  const alwaysEntries = [];
  for (const id of ALWAYS_SHOW_ENEMY_IDS) {
    const found = rawEnemies.find((enemy) => enemy.id === id);
    if (found) alwaysEntries.push(found);
  }

  const consumedEnemyIds = new Set(alwaysEntries.map((enemy) => enemy.id));
  const mapEnemy = (enemy, categoryKey, categoryLabel) => {
    const eShield = normalizeEnemyEShield(enemy);
    const extraHpGauge = normalizeEnemyExtraHpGauge(enemy);
    const dimension = categoryKey === ENEMY_PRESET_TEMPLATE_CATEGORY_KEY
      ? null
      : toYYYYMM(enemy?.in_date);
    return {
      id: enemy.id,
      name: enemy.name,
      dimension,
      categoryKey,
      categoryLabel,
      od_rate: enemy.base_param?.od_rate ?? 0,
      max_d_rate: enemy.base_param?.max_d_rate ?? 999,
      resistances: {
        element: Object.fromEntries(
          ENEMY_PRESET_ELEMENT_KEYS.map((key) => [
            key,
            normalizeEnemyResistanceRatePercent(enemy.resistances?.element?.[key]),
          ])
        ),
      },
      absorbElementList: normalizeAbsorbElementList(enemy.resistances?.element?.absorb_element_list),
      ...(eShield ? { e_shield: eShield } : {}),
      ...(extraHpGauge ? { extra_hp_gauge: extraHpGauge } : {}),
    };
  };

  const alwaysList = alwaysEntries.map((enemy) =>
    mapEnemy(enemy, ENEMY_PRESET_TEMPLATE_CATEGORY_KEY, ENEMY_PRESET_TEMPLATE_CATEGORY_LABEL)
  );

  const normalCategoryList = [];
  for (const definition of NORMAL_ENEMY_CATEGORY_DEFINITIONS) {
    const categoryEnemies = dedupeEnemiesByNameKeepingHighestId(
      rawEnemies.filter((enemy) => !consumedEnemyIds.has(enemy.id) && definition.match(enemy))
    ).sort(compareByMonthThenName);
    categoryEnemies.forEach((enemy) => consumedEnemyIds.add(enemy.id));
    normalCategoryList.push(
      ...categoryEnemies.map((enemy) => mapEnemy(enemy, definition.key, definition.label))
    );
  }

  const recentBosses = dedupeEnemiesByNameKeepingHighestId(
    rawEnemies.filter(
      (enemy) =>
        !consumedEnemyIds.has(enemy.id) &&
        enemy.flags &&
        enemy.flags.is_boss === true &&
        isWithinRecentThreeMonths(enemy)
    )
  ).sort(compareByMonthThenName);
  const recentList = recentBosses.map((enemy) => {
    const dimension = toYYYYMM(enemy?.in_date);
    return mapEnemy(
      enemy,
      buildEnemyPresetMonthCategoryKey(dimension),
      formatEnemyPresetMonthCategoryLabel(dimension)
    );
  });

  return [...alwaysList, ...normalCategoryList, ...recentList];
}
