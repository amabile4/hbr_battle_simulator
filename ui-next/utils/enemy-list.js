import { ALWAYS_VISIBLE_ENEMY_PRESET_IDS } from '../../src/data/enemy-sample-presets.js';

const ALWAYS_SHOW_ENEMY_IDS = new Set(ALWAYS_VISIBLE_ENEMY_PRESET_IDS);

export function buildEnemyList(rawEnemies, today = new Date()) {
  const DEFAULT_ENEMY_RESISTANCE_RATE_PERCENT = 100;
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
    if (!rawShield || typeof rawShield !== 'object') {
      return null;
    }
    const count = Number(enemy?.extra_gauge?.esp ?? 0);
    const defUpRate = Number(rawShield.def_up_rate ?? 0);
    const damageLimit = Number(rawShield.dmg_limit ?? 0);
    return {
      count: Number.isFinite(count) ? Math.max(0, Math.floor(count)) : 0,
      max: Number.isFinite(count) ? Math.max(0, Math.floor(count)) : 0,
      elements: Array.isArray(rawShield.ele_list)
        ? [...new Set(rawShield.ele_list.map((value) => String(value ?? '').trim()).filter(Boolean))]
        : [],
      def_up_rate: Number.isFinite(defUpRate) ? defUpRate : 0,
      dmg_limit: Number.isFinite(damageLimit) ? damageLimit : 0,
    };
  };
  if (!Array.isArray(rawEnemies)) return [];

  const currentMonthIndex = today.getFullYear() * 12 + today.getMonth();
  const isWithinRecentThreeMonths = (enemy) => {
    if (!enemy.in_date) return false;
    const date = new Date(enemy.in_date);
    if (Number.isNaN(date.getTime())) return false;
    const enemyMonthIndex = date.getFullYear() * 12 + date.getMonth();
    const monthDelta = currentMonthIndex - enemyMonthIndex;
    return monthDelta >= 0 && monthDelta < 3;
  };
  const toYYYYMM = (inDate) => {
    const date = new Date(inDate);
    return date.getFullYear() * 100 + (date.getMonth() + 1);
  };

  const alwaysEntries = [];
  for (const id of ALWAYS_SHOW_ENEMY_IDS) {
    const found = rawEnemies.find((enemy) => enemy.id === id);
    if (found) alwaysEntries.push(found);
  }

  const recentBosses = rawEnemies.filter(
    (enemy) =>
      !ALWAYS_SHOW_ENEMY_IDS.has(enemy.id) &&
      enemy.flags &&
      enemy.flags.is_boss === true &&
      isWithinRecentThreeMonths(enemy)
  );
  const byName = new Map();
  recentBosses.forEach((enemy) => {
    const previous = byName.get(enemy.name);
    if (!previous || enemy.id > previous.id) {
      byName.set(enemy.name, enemy);
    }
  });
  const mapEnemy = (enemy, dimension) => {
    const eShield = normalizeEnemyEShield(enemy);
    return {
      id: enemy.id,
      name: enemy.name,
      dimension,
      od_rate: enemy.base_param?.od_rate ?? 0,
      max_d_rate: enemy.base_param?.max_d_rate ?? 999,
      resistances: {
        element: Object.fromEntries(
          ['slash', 'stab', 'strike', 'fire', 'ice', 'thunder', 'light', 'dark', 'nonelement'].map((key) => [
            key,
            normalizeEnemyResistanceRatePercent(enemy.resistances?.element?.[key]),
          ])
        ),
      },
      absorbElementList: normalizeAbsorbElementList(enemy.resistances?.element?.absorb_element_list),
      ...(eShield ? { e_shield: eShield } : {}),
    };
  };

  const alwaysList = alwaysEntries.map((enemy) => mapEnemy(enemy, null));
  const recentList = [...byName.values()]
    .map((enemy) => mapEnemy(enemy, toYYYYMM(enemy.in_date)))
    .sort((a, b) =>
      b.dimension !== a.dimension
        ? b.dimension - a.dimension
        : (a.name ?? '').localeCompare(b.name ?? '', 'ja')
    );

  return [...alwaysList, ...recentList];
}
