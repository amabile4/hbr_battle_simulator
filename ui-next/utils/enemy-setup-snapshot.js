import { cloneEnemyEShieldState } from '../../src/domain/enemy-e-shield.js';
import { cloneEnemyExtraHpGaugeState } from '../../src/domain/enemy-extra-hp-gauge.js';

const ENEMY_SLOT_COUNT = 3;
const REQUIRED_SLOT_INDEX = 0;
const DEFAULT_PREEMPTIVE_FIELD = 'none';
const DEFAULT_ENEMY_NAME = '';
const DEFAULT_ENEMY_RESISTANCE_RATE_PERCENT = 100;
const DEFAULT_MAX_D_RATE = 999;
const DEFAULT_OD_RATE_MULTIPLIER = 1;
const DEFAULT_CURRENT_DESTRUCTION_RATE = 1;
export const DEFAULT_ENEMY_PARAM_BORDER = 770;
const ENEMY_ELEMENT_KEYS = Object.freeze([
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

function toOptionalEnemyId(value) {
  if (value === null || value === undefined || value === '') {
    return null;
  }
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : null;
}

function normalizeActiveSlotIndex(value) {
  const numeric = Number(value);
  if (!Number.isInteger(numeric)) {
    return REQUIRED_SLOT_INDEX;
  }
  return Math.max(0, Math.min(ENEMY_SLOT_COUNT - 1, numeric));
}

function normalizeEnemyName(value) {
  return String(value ?? '').trim();
}

function normalizeElementRatePercent(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : DEFAULT_ENEMY_RESISTANCE_RATE_PERCENT;
}

function normalizeDestructionRate(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : DEFAULT_CURRENT_DESTRUCTION_RATE;
}

function normalizeAbsorbElementList(list = []) {
  if (!Array.isArray(list)) {
    return [];
  }
  return [...new Set(
    list
      .map((value) => String(value ?? '').trim().toLowerCase())
      .filter((value) => ENEMY_ELEMENT_KEYS.includes(value))
  )];
}

function normalizeEnemyEShield(source = null) {
  const normalized = cloneEnemyEShieldState(source);
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
}

function normalizeEnemyExtraHpGauge(source = null) {
  return cloneEnemyExtraHpGaugeState(source);
}

export function normalizeEnemyOdRateMultiplier(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return DEFAULT_OD_RATE_MULTIPLIER;
  }
  if (numeric === 0) {
    return DEFAULT_OD_RATE_MULTIPLIER;
  }
  if (Math.abs(numeric) > 10) {
    return numeric / 10000;
  }
  return numeric;
}

function normalizeEnemyManual(manual = {}) {
  const eShield = normalizeEnemyEShield(manual?.e_shield ?? manual?.eShield);
  const extraHpGauge = normalizeEnemyExtraHpGauge(manual?.extra_hp_gauge ?? manual?.extraHpGauge);
  return {
    od_rate: normalizeEnemyOdRateMultiplier(manual?.od_rate),
    max_d_rate: Number.isFinite(Number(manual?.max_d_rate))
      ? Number(manual.max_d_rate)
      : DEFAULT_MAX_D_RATE,
    destructionRate: normalizeDestructionRate(manual?.destructionRate),
    element: Object.fromEntries(
      ENEMY_ELEMENT_KEYS.map((key) => [key, normalizeElementRatePercent(manual?.element?.[key])])
    ),
    absorbElementList: normalizeAbsorbElementList(manual?.absorbElementList),
    ...(eShield ? { e_shield: eShield } : {}),
    ...(extraHpGauge ? { extra_hp_gauge: extraHpGauge } : {}),
  };
}

function normalizeEnemySlot(source = {}, slotIndex = REQUIRED_SLOT_INDEX) {
  const manual = normalizeEnemyManual(source?.manual ?? source);
  const eShield = normalizeEnemyEShield(source?.e_shield ?? source?.eShield ?? manual.e_shield);
  const extraHpGauge = normalizeEnemyExtraHpGauge(
    source?.extra_hp_gauge ?? source?.extraHpGauge ?? manual.extra_hp_gauge
  );
  const effectiveElementSource = source?.resistances?.element ?? source?.element ?? manual.element;
  const resistances = {
    element: Object.fromEntries(
      ENEMY_ELEMENT_KEYS.map((key) => [key, normalizeElementRatePercent(effectiveElementSource?.[key])])
    ),
  };
  const absorbElementList = normalizeAbsorbElementList(
    source?.absorbElementList ?? source?.resistances?.element?.absorb_element_list ?? manual.absorbElementList
  );
  const dpRaw = Number(source?.dp);
  return {
    slotIndex,
    selectedEnemyId: toOptionalEnemyId(source?.selectedEnemyId),
    selectedEnemyName: normalizeEnemyName(source?.selectedEnemyName),
    param_border: Number.isFinite(Number(source?.param_border)) && Number(source.param_border) > 0
      ? Number(source.param_border)
      : DEFAULT_ENEMY_PARAM_BORDER,
    // dp は選択済み敵またはフィクスチャから引き継ぐ。存在しない場合は省略して
    // BattleStateManager が enemies.json から解決できるようにする。
    ...(Number.isFinite(dpRaw) && dpRaw >= 0 ? { dp: dpRaw } : {}),
    isManual: Boolean(source?.isManual),
    manual,
    od_rate: normalizeEnemyOdRateMultiplier(source?.od_rate ?? manual.od_rate),
    max_d_rate: Number.isFinite(Number(source?.max_d_rate)) ? Number(source.max_d_rate) : manual.max_d_rate,
    destructionRate: normalizeDestructionRate(source?.destructionRate ?? manual.destructionRate),
    resistances,
    absorbElementList,
    ...(eShield ? { e_shield: eShield } : {}),
    ...(extraHpGauge ? { extra_hp_gauge: extraHpGauge } : {}),
  };
}

function buildLegacySlot(snapshot = {}) {
  return normalizeEnemySlot(snapshot, REQUIRED_SLOT_INDEX);
}

export function normalizeEnemySetupSnapshot(snapshot = {}) {
  const selectedEnemyIds = Array.from({ length: ENEMY_SLOT_COUNT }, (_, slotIndex) =>
    toOptionalEnemyId(snapshot?.selectedEnemyIds?.[slotIndex])
  );
  const normalizedSlots = Array.from({ length: ENEMY_SLOT_COUNT }, (_, slotIndex) => {
    const sourceSlot = Array.isArray(snapshot?.enemySlots)
      ? snapshot.enemySlots.find((slot) => Number(slot?.slotIndex) === slotIndex)
      : null;
    return normalizeEnemySlot(sourceSlot ?? {}, slotIndex);
  });

  if (selectedEnemyIds.every((enemyId) => enemyId === null)) {
    normalizedSlots[REQUIRED_SLOT_INDEX] = buildLegacySlot(snapshot);
    selectedEnemyIds[REQUIRED_SLOT_INDEX] = normalizedSlots[REQUIRED_SLOT_INDEX].selectedEnemyId;
  }

  for (let slotIndex = 0; slotIndex < ENEMY_SLOT_COUNT; slotIndex += 1) {
    if (selectedEnemyIds[slotIndex] != null) {
      normalizedSlots[slotIndex].selectedEnemyId = selectedEnemyIds[slotIndex];
    } else {
      selectedEnemyIds[slotIndex] = normalizedSlots[slotIndex].selectedEnemyId;
    }
  }

  const enemyCount = selectedEnemyIds.filter((enemyId) => enemyId !== null).length || 1;
  const slot0 = normalizedSlots[REQUIRED_SLOT_INDEX];

  return {
    selectedEnemyIds,
    activeSlotIndex: normalizeActiveSlotIndex(snapshot?.activeSlotIndex),
    enemySlots: normalizedSlots,
    preemptiveField: String(snapshot?.preemptiveField ?? DEFAULT_PREEMPTIVE_FIELD).trim().toLowerCase() || DEFAULT_PREEMPTIVE_FIELD,
    selectedEnemyId: slot0.selectedEnemyId,
    selectedEnemyName: slot0.selectedEnemyName || DEFAULT_ENEMY_NAME,
    enemyCount,
    isManual: slot0.isManual,
    manual: slot0.manual,
    od_rate: slot0.od_rate,
    max_d_rate: slot0.max_d_rate,
    destructionRate: slot0.destructionRate,
    resistances: slot0.resistances,
    absorbElementList: slot0.absorbElementList,
    // dp は敵のDPゲージ初期値。選択した敵またはフィクスチャから引き継ぐ。
    ...(slot0.dp != null ? { dp: slot0.dp } : {}),
    ...(slot0.e_shield ? { e_shield: structuredClone(slot0.e_shield) } : {}),
    ...(slot0.extra_hp_gauge ? { extra_hp_gauge: structuredClone(slot0.extra_hp_gauge) } : {}),
  };
}

export function formatEnemyOdRatePercent(value) {
  const numeric = normalizeEnemyOdRateMultiplier(value) * 100;
  const truncated = numeric >= 0
    ? Math.floor((numeric + 1e-9) * 100) / 100
    : Math.ceil((numeric - 1e-9) * 100) / 100;
  return `${truncated}%`;
}
