import { ALWAYS_VISIBLE_ENEMY_PRESET_IDS } from '../../src/data/enemy-sample-presets.js';
import { normalizeEnemyEShieldState } from '../../src/domain/enemy-e-shield.js';
import { cloneEnemyExtraHpGaugeState } from '../../src/domain/enemy-extra-hp-gauge.js';

const ALWAYS_SHOW_ENEMY_IDS = new Set(ALWAYS_VISIBLE_ENEMY_PRESET_IDS);
const DEFAULT_ENEMY_RESISTANCE_RATE_PERCENT = 100;
const DEFAULT_D_RATE_RAW = 5;
const RECENT_MONTH_WINDOW_COUNT = 3;
const ENEMY_PRESET_MONTH_CATEGORY_PREFIX = 'month:';
export const ENEMY_PRESET_TEMPLATE_CATEGORY_KEY = 'template';
export const ENEMY_PRESET_TEMPLATE_CATEGORY_LABEL = 'テンプレート';
const ENEMY_PRESET_ORB_BOSS_CATEGORY_KEY = 'normal:orb-boss';
const ENEMY_PRESET_ORB_BOSS_CATEGORY_LABEL = 'オーブボス';
const ORB_BOSS_LEVEL4_LABELS = Object.freeze([
  'ExoWatcherDefault01_04',
  'DiamondEyeballRectusDefault01_04',
  'DiamondEyeballSinisterDefault01_04',
  'BigotryGateAmonDefault01_04',
]);
const ORB_BOSS_LEVEL4_LABEL_SET = new Set(ORB_BOSS_LEVEL4_LABELS);
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
const DIMENSION_EX_ENEMY_PATTERN = /^Ex_/;
const DIMENSION_HARD_ENEMY_PATTERN = /^Hard_/;
const ENEMY_PRESET_DISPLAY_NAME_BY_LABEL = Object.freeze({
  Hard_DeathSlug1st: '異時層 デススラッグ 第一形態',
  Hard_DeathSlug2nd: '異時層 デススラッグ 第二形態',
  Hard_RotaryMole_1st: '異時層 ロータリーモール 第一形態',
  Hard_RotaryMole_2nd: '異時層 ロータリーモール 第二形態',
  Hard_RedCrimson: '異時層 レッドクリムゾン',
  Hard_Feeler: '異時層 フィーラー',
  Hard_FlatHand1st: '異時層 フラットハンド 第一形態',
  Hard_FlatHand2nd: '異時層 フラットハンド 第二形態',
  Hard_FlatHand3rd: '異時層 フラットハンド 第三形態',
  Hard_FlatHandChild: '異時層 フィーラー',
  Hard_UltimateFeeler: '異時層 アルティメットフィーラー',
  Hard_UltimateHand3rd_MC04: '異時層 フラットハンド 最終形態',
  Hard_DesertDendron_MC04B: '異時層 デザートデンドロン',
  Hard_SkullFeatherHead1st_MC04BDay14: '異時層 スカルフェザー[Head] 第一形態',
  Hard_SkullFeatherTail_MC04BDay14: '異時層 スカルフェザー[Tail]',
  Ex_DeathSlug1st: 'デススラッグEX 第一形態',
  Ex_DeathSlug2nd: 'デススラッグEX 第二形態',
  Hard_SkullFeatherHead2nd_MC04BDay14: '異時層 スカルフェザー 最終形態',
});
const SUMMON_ENEMY_LABEL_SUFFIX = '_Summon';
const NORMAL_ENEMY_CATEGORY_DEFINITIONS = Object.freeze([
  Object.freeze({
    key: 'normal:dimension-hard',
    label: '異時層',
    dedupeByName: false,
    sortOrder: 'firstSeenDateAsc',
    match(enemy) {
      const label = String(enemy?.label ?? '');
      return DIMENSION_HARD_ENEMY_PATTERN.test(label);
    },
  }),
  Object.freeze({
    key: 'normal:dimension-ex',
    label: '異時層EX',
    dedupeByName: false,
    sortOrder: 'firstSeenDateAsc',
    match(enemy) {
      const label = String(enemy?.label ?? '');
      return DIMENSION_EX_ENEMY_PATTERN.test(label);
    },
  }),
  Object.freeze({
    key: 'normal:stellar-sweepfront',
    label: '恒星掃戦線',
    match(enemy) {
      const label = String(enemy?.label ?? '');
      return DIMENSION_X_NORMAL_ENEMY_PATTERN.test(label) && !label.endsWith(SUMMON_ENEMY_LABEL_SUFFIX);
    },
  }),
]);

function buildBattleEnemyPresetId(battleId, enemyIndex) {
  const normalizedBattleId = Number(battleId);
  const normalizedEnemyIndex = Number(enemyIndex);
  if (!Number.isFinite(normalizedBattleId) || !Number.isFinite(normalizedEnemyIndex)) {
    return null;
  }
  return -((Math.trunc(normalizedBattleId) * 10) + Math.trunc(normalizedEnemyIndex) + 1);
}

function buildBattleEnemyResistanceMap(resist = []) {
  const entries = Array.isArray(resist) ? resist : [];
  const rawByKey = new Map(
    entries.map(([key, value]) => [String(key ?? '').trim().toLowerCase(), value])
  );
  const absorbElementList = rawByKey.get('absorbelementlist');
  return {
    element: {
      slash: Number(rawByKey.get('slash') ?? 0),
      stab: Number(rawByKey.get('stab') ?? 0),
      strike: Number(rawByKey.get('strike') ?? 0),
      fire: Number(rawByKey.get('fire') ?? 0),
      ice: Number(rawByKey.get('ice') ?? 0),
      thunder: Number(rawByKey.get('thunder') ?? 0),
      light: Number(rawByKey.get('light') ?? 0),
      dark: Number(rawByKey.get('dark') ?? 0),
      nonelement: Number(rawByKey.get('nonelement') ?? 0),
      absorb_element_list: Array.isArray(absorbElementList) ? absorbElementList : [],
    },
  };
}

function buildOrbBossLevel4Enemies(battles = []) {
  if (!Array.isArray(battles)) {
    return [];
  }
  const entries = [];
  const seenLabels = new Set();
  for (const battle of battles) {
    const battleId = Number(battle?.id ?? battle?.battle_id);
    for (const [enemyIndex, enemy] of (battle?.enemy_list ?? []).entries()) {
      const label = String(enemy?.label ?? '');
      if (!ORB_BOSS_LEVEL4_LABEL_SET.has(label) || seenLabels.has(label)) {
        continue;
      }
      const presetId = buildBattleEnemyPresetId(battleId, enemyIndex);
      if (presetId === null) {
        continue;
      }
      seenLabels.add(label);
      entries.push({
        id: presetId,
        name: enemy?.name ?? label,
        label,
        in_date: battle?.in_date ?? null,
        flags: { is_boss: true },
        base_param: {
          dp: enemy?.base_param?.dp ?? 0,
          od_rate: enemy?.base_param?.od_rate ?? 0,
          max_d_rate: enemy?.base_param?.max_d_rate ?? 999,
          d_rate: enemy?.base_param?.d_rate ?? DEFAULT_D_RATE_RAW,
          param_border: enemy?.base_param?.param_border ?? 0,
          param_def: enemy?.base_param?.param_def ?? 0,
        },
        resistances: buildBattleEnemyResistanceMap(enemy?.resist),
      });
    }
  }
  return ORB_BOSS_LEVEL4_LABELS
    .map((label) => entries.find((enemy) => enemy.label === label))
    .filter(Boolean);
}

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

function normalizeEnemyEShieldOverrideMap(overrides = []) {
  const map = new Map();
  if (!Array.isArray(overrides)) {
    return map;
  }
  for (const override of overrides) {
    const enemyId = Number(override?.enemyId ?? override?.id);
    if (!Number.isFinite(enemyId)) {
      continue;
    }
    const normalized = normalizeEnemyEShieldState({
      count: 1,
      max: 1,
      elements: ['Fire'],
      maxByStage: override?.espByStage ?? override?.esp_by_stage ?? override?.maxByStage,
    });
    if (Array.isArray(normalized?.maxByStage)) {
      map.set(enemyId, [...normalized.maxByStage]);
    }
  }
  return map;
}

function normalizeForceVisibleEnemyIds(value) {
  if (!Array.isArray(value)) {
    return new Set();
  }
  return new Set(
    value
      .map((id) => Number(id))
      .filter((id) => Number.isInteger(id))
  );
}

export function buildEnemyList(rawEnemies, today = new Date(), options = {}) {
  const eShieldOverrideByEnemyId = normalizeEnemyEShieldOverrideMap(options?.enemyEShieldOverrides);
  const forceVisibleEnemyIdSet = normalizeForceVisibleEnemyIds(options?.forceVisibleEnemyIds);
  // テスト用途: 直近3ヶ月フィルタを完全に無効化し、全てのボスを選択可能にする。
  // 本番では未設定のため実挙動は変わらない。
  const disableRecentMonthsFilter = Boolean(options?.disableRecentMonthsFilter);
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
    const overrideMaxByStage = eShieldOverrideByEnemyId.get(Number(enemy?.id));
    const normalized = normalizeEnemyEShieldState(rawShield, {
      count: enemy?.extra_gauge?.esp,
      max: enemy?.extra_gauge?.esp,
      maxByStage: overrideMaxByStage ?? enemy?.extra_gauge?.esp_by_stage,
    });
    return normalized
      ? {
          count: normalized.current,
          max: normalized.max,
          elements: [...normalized.elements],
          def_up_rate: normalized.defUpRate,
          dmg_limit: normalized.damageLimit,
          ...(Array.isArray(normalized.maxByStage) ? { maxByStage: [...normalized.maxByStage] } : {}),
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
  const compareByFirstSeenDateThenId = (left, right) => {
    const leftTime = new Date(left?.in_date ?? '').getTime();
    const rightTime = new Date(right?.in_date ?? '').getTime();
    const normalizedLeftTime = Number.isNaN(leftTime) ? Number.POSITIVE_INFINITY : leftTime;
    const normalizedRightTime = Number.isNaN(rightTime) ? Number.POSITIVE_INFINITY : rightTime;
    if (normalizedLeftTime !== normalizedRightTime) {
      return normalizedLeftTime - normalizedRightTime;
    }
    return Number(left?.id ?? 0) - Number(right?.id ?? 0);
  };
  const resolveDisplayEnemyName = (enemy) =>
    ENEMY_PRESET_DISPLAY_NAME_BY_LABEL[String(enemy?.label ?? '')] ?? enemy.name;

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
    const paramDef = Number(enemy.base_param?.param_def);
    const paramBorderRaw = Number(enemy.base_param?.param_border);
    const paramBorder = Number.isFinite(paramDef) && paramDef > 0 ? paramDef : paramBorderRaw;
    return {
      id: enemy.id,
      name: resolveDisplayEnemyName(enemy),
      base_param: enemy?.base_param && typeof enemy.base_param === 'object'
        ? { ...enemy.base_param }
        : {},
      dimension,
      categoryKey,
      categoryLabel,
      param_border: Number.isFinite(paramBorder) && paramBorder > 0 ? paramBorder : 0,
      dp: Number(enemy.base_param?.dp ?? 0),
      od_rate: enemy.base_param?.od_rate ?? 0,
      max_d_rate: enemy.base_param?.max_d_rate ?? 999,
      d_rate: enemy.base_param?.d_rate ?? DEFAULT_D_RATE_RAW,
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
    const matchedEnemies = rawEnemies.filter(
      (enemy) => !consumedEnemyIds.has(enemy.id) && definition.match(enemy)
    );
    const categoryEnemies = (definition.dedupeByName === false
      ? matchedEnemies
      : dedupeEnemiesByNameKeepingHighestId(matchedEnemies)
    ).sort(
      definition.sortOrder === 'firstSeenDateAsc'
        ? compareByFirstSeenDateThenId
        : compareByMonthThenName
    );
    categoryEnemies.forEach((enemy) => consumedEnemyIds.add(enemy.id));
    normalCategoryList.push(
      ...categoryEnemies.map((enemy) => mapEnemy(enemy, definition.key, definition.label))
    );
  }

  const orbBossList = buildOrbBossLevel4Enemies(options?.battles).map((enemy) =>
    mapEnemy(enemy, ENEMY_PRESET_ORB_BOSS_CATEGORY_KEY, ENEMY_PRESET_ORB_BOSS_CATEGORY_LABEL)
  );

  const isRecentBossOrForceVisible = (enemy) => {
    if (!enemy.flags || enemy.flags.is_boss !== true) {
      return false;
    }
    if (disableRecentMonthsFilter) {
      return true;
    }
    return forceVisibleEnemyIdSet.has(enemy.id) || isWithinRecentThreeMonths(enemy);
  };
  const recentBosses = dedupeEnemiesByNameKeepingHighestId(
    rawEnemies.filter(
      (enemy) => !consumedEnemyIds.has(enemy.id) && isRecentBossOrForceVisible(enemy)
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

  return [...alwaysList, ...normalCategoryList, ...orbBossList, ...recentList];
}
