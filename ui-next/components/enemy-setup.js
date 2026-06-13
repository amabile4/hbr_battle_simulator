import { resolveUiAssetUrl } from '../../src/ui/style-asset-url.js';
import { cloneEnemyEShieldState } from '../../src/domain/enemy-e-shield.js';
import { cloneEnemyExtraHpGaugeState } from '../../src/domain/enemy-extra-hp-gauge.js';
import {
  ENEMY_PRESET_TEMPLATE_CATEGORY_KEY,
  getEnemyPresetCategoryMetadata,
} from '../utils/enemy-list.js';
import {
  DEFAULT_ENEMY_PARAM_BORDER,
  formatEnemyOdRatePercent,
  normalizeEnemyOdRateMultiplier,
} from '../utils/enemy-setup-snapshot.js';

// 属性一覧（物理3種 → 魔法5種 → 無）
const ELEMENTS = [
  { key: 'slash',      label: '斬', icon: 'Slash.webp'   },
  { key: 'stab',       label: '突', icon: 'Stab.webp'    },
  { key: 'strike',     label: '打', icon: 'Strike.webp'  },
  { key: 'fire',       label: '火', icon: 'Fire.webp'    },
  { key: 'ice',        label: '氷', icon: 'Ice.webp'     },
  { key: 'thunder',    label: '雷', icon: 'Thunder.webp' },
  { key: 'light',      label: '光', icon: 'Light.webp'   },
  { key: 'dark',       label: '闇', icon: 'Dark.webp'    },
  { key: 'nonelement', label: '無', icon: null           },
];
const ELEMENT_KEY_SET = new Set(ELEMENTS.map((element) => element.key));
const E_SHIELD_ELEMENT_OPTIONS = Object.freeze(
  ELEMENTS
    .filter((element) => ['fire', 'ice', 'thunder', 'light', 'dark'].includes(element.key))
    .map((element) => Object.freeze({
      ...element,
      eShieldValue: element.key.charAt(0).toUpperCase() + element.key.slice(1),
    }))
);
const E_SHIELD_ELEMENT_VALUE_SET = new Set(
  E_SHIELD_ELEMENT_OPTIONS.map((element) => element.eShieldValue)
);

const DEFAULT_OD_RATE    = 1;
const DEFAULT_MAX_D_RATE = 999;
const DEFAULT_D_RATE_RAW = 5;
const DEFAULT_CURRENT_DESTRUCTION_RATE = 1;
const DESTRUCTION_RATE_PERCENT_SCALE = 100;
const DEFAULT_ENEMY_RESISTANCE_RATE_PERCENT = 100;
const DEFAULT_E_SHIELD_EDITOR_VALUE = 0;
const ENEMY_SLOT_COUNT = 3;
const REQUIRED_SLOT_INDEX = 0;
const DEFAULT_PREEMPTIVE_FIELD = 'none';
const EMPTY_ENEMY_SELECT_VALUE = '';
const EMPTY_ENEMY_SELECT_LABEL = '── 選択なし ──';
const PREEMPTIVE_FIELD_OPTIONS = [
  { value: 'none', label: 'なし' },
  { value: 'fire', label: '火' },
  { value: 'ice', label: '氷' },
  { value: 'thunder', label: '雷' },
  { value: 'light', label: '光' },
  { value: 'dark', label: '闇' },
];
const PREEMPTIVE_FIELD_VALUE_SET = new Set(PREEMPTIVE_FIELD_OPTIONS.map((option) => option.value));

function normalizePreemptiveField(value) {
  const normalized = typeof value === 'string' ? value.trim().toLowerCase() : '';
  return PREEMPTIVE_FIELD_VALUE_SET.has(normalized)
    ? normalized
    : DEFAULT_PREEMPTIVE_FIELD;
}

function normalizeElementRatePercent(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : DEFAULT_ENEMY_RESISTANCE_RATE_PERCENT;
}

function normalizeDestructionRate(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : DEFAULT_CURRENT_DESTRUCTION_RATE;
}

function normalizeDestructionMultiplierRaw(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : DEFAULT_D_RATE_RAW;
}

function resolveEnemyParamBorder(enemy = null) {
  const direct = Number(enemy?.param_border);
  if (Number.isFinite(direct) && direct > 0) {
    return direct;
  }
  const baseParam = Number(enemy?.base_param?.param_border);
  return Number.isFinite(baseParam) && baseParam > 0
    ? baseParam
    : DEFAULT_ENEMY_PARAM_BORDER;
}

function resolveEnemyDp(enemy = null) {
  const direct = Number(enemy?.dp);
  if (Number.isFinite(direct) && direct >= 0) {
    return direct;
  }
  const baseParam = Number(enemy?.base_param?.dp);
  return Number.isFinite(baseParam) && baseParam >= 0 ? baseParam : 0;
}

function formatDestructionRatePercent(value) {
  return `${(normalizeDestructionRate(value) * DESTRUCTION_RATE_PERCENT_SCALE).toFixed(2)}%`;
}

function normalizeAbsorbElementKey(value) {
  const normalized = String(value ?? '').trim().toLowerCase();
  return ELEMENT_KEY_SET.has(normalized) ? normalized : null;
}

function normalizeAbsorbElementList(list = []) {
  if (!Array.isArray(list)) {
    return [];
  }
  return [...new Set(list.map((value) => normalizeAbsorbElementKey(value)).filter(Boolean))];
}

function normalizeEnemyEShield(eShield = null) {
  const normalized = cloneEnemyEShieldState(eShield);
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

function cloneEnemyEShield(eShield = null) {
  const normalized = normalizeEnemyEShield(eShield);
  return normalized
    ? {
        ...normalized,
        elements: [...normalized.elements],
      }
    : null;
}

function cloneEnemyExtraHpGauge(extraHpGauge = null) {
  const normalized = cloneEnemyExtraHpGaugeState(extraHpGauge);
  return normalized
    ? {
        ...normalized,
        values: [...normalized.values],
      }
    : null;
}

function normalizeEnemyEShieldEditorNumber(value, fallback = DEFAULT_E_SHIELD_EDITOR_VALUE) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return Math.max(DEFAULT_E_SHIELD_EDITOR_VALUE, Math.floor(Number(fallback) || 0));
  }
  return Math.max(DEFAULT_E_SHIELD_EDITOR_VALUE, Math.floor(numeric));
}

function normalizeEnemyEShieldEditorElements(elements = []) {
  if (!Array.isArray(elements)) {
    return [];
  }
  return [...new Set(
    elements
      .map((value) => String(value ?? '').trim())
      .filter((value) => E_SHIELD_ELEMENT_VALUE_SET.has(value))
  )];
}

function normalizeEnemyEShieldEditorMaxByStage(value = []) {
  const source = Array.isArray(value)
    ? value
    : String(value ?? '').split(',');
  return source
    .map((entry) => normalizeEnemyEShieldEditorNumber(String(entry).trim(), 0))
    .filter((entry) => entry > 0);
}

function formatEnemyEShieldEditorMaxByStage(value = []) {
  return normalizeEnemyEShieldEditorMaxByStage(value).join(',');
}

function normalizeEnemyEShieldStageCount(value) {
  const numeric = Number(value);
  return Number.isInteger(numeric) && numeric >= 2 ? numeric : 0;
}

function resolveEnemyEShieldEditorStageCount(extraHpGauge = null) {
  const normalized = cloneEnemyExtraHpGauge(extraHpGauge);
  return normalizeEnemyEShieldStageCount(normalized?.total ?? normalized?.values?.length);
}

function normalizeEnemyEShieldStageIndex(value, stageCount) {
  const numeric = Number(value);
  if (!Number.isInteger(numeric) || numeric < 0 || numeric >= stageCount) {
    return null;
  }
  return numeric;
}

function buildEnemyEShieldEditorStageValues(eShield, stageCount) {
  const count = normalizeEnemyEShieldStageCount(stageCount);
  if (count === 0) {
    return [];
  }
  const fallbackMax = normalizeEnemyEShieldEditorNumber(eShield?.max, 0);
  return Array.from({ length: count }, (_, index) => {
    const stagedMax = normalizeEnemyEShieldEditorNumber(eShield?.maxByStage?.[index], 0);
    return stagedMax > 0 ? stagedMax : fallbackMax;
  });
}

function resolveEnemyEShieldEditorMax(eShield, stageCount) {
  const stageValues = buildEnemyEShieldEditorStageValues(eShield, stageCount);
  return stageValues[0] ?? normalizeEnemyEShieldEditorNumber(eShield?.max, 0);
}

function createEmptyEnemyEShieldDraft() {
  return {
    count: DEFAULT_E_SHIELD_EDITOR_VALUE,
    max: DEFAULT_E_SHIELD_EDITOR_VALUE,
    elements: [],
    def_up_rate: DEFAULT_E_SHIELD_EDITOR_VALUE,
    dmg_limit: DEFAULT_E_SHIELD_EDITOR_VALUE,
    maxByStage: [],
  };
}

function cloneEnemyEShieldDraft(eShield = null) {
  const normalized = cloneEnemyEShield(eShield);
  if (normalized) {
    return normalized;
  }
  if (!eShield || typeof eShield !== 'object') {
    return createEmptyEnemyEShieldDraft();
  }
  return {
    count: normalizeEnemyEShieldEditorNumber(eShield.count ?? eShield.current),
    max: normalizeEnemyEShieldEditorNumber(
      eShield.max ?? eShield.initial ?? eShield.count ?? eShield.current
    ),
    elements: normalizeEnemyEShieldEditorElements(eShield.elements ?? eShield.ele_list ?? []),
    def_up_rate: normalizeEnemyEShieldEditorNumber(eShield.def_up_rate ?? eShield.defUpRate),
    dmg_limit: normalizeEnemyEShieldEditorNumber(eShield.dmg_limit ?? eShield.damageLimit),
    maxByStage: normalizeEnemyEShieldEditorMaxByStage(
      eShield.maxByStage ?? eShield.max_by_stage ?? eShield.espByStage ?? eShield.esp_by_stage
    ),
  };
}

function cloneManual(manual = {}) {
  const eShield = cloneEnemyEShield(manual.e_shield);
  const extraHpGauge = cloneEnemyExtraHpGauge(manual.extra_hp_gauge);
  return {
    od_rate: normalizeEnemyOdRateMultiplier(manual.od_rate ?? DEFAULT_OD_RATE),
    max_d_rate: Number(manual.max_d_rate ?? DEFAULT_MAX_D_RATE),
    d_rate: normalizeDestructionMultiplierRaw(manual.d_rate),
    destructionRate: normalizeDestructionRate(manual.destructionRate),
    element: Object.fromEntries(
      ELEMENTS.map((element) => [element.key, normalizeElementRatePercent(manual.element?.[element.key])])
    ),
    absorbElementList: normalizeAbsorbElementList(manual.absorbElementList),
    ...(eShield ? { e_shield: eShield } : {}),
    ...(extraHpGauge ? { extra_hp_gauge: extraHpGauge } : {}),
  };
}

function defaultElement() {
  return Object.fromEntries(ELEMENTS.map((element) => [element.key, DEFAULT_ENEMY_RESISTANCE_RATE_PERCENT]));
}

function defaultManual() {
  return {
    od_rate: DEFAULT_OD_RATE,
    max_d_rate: DEFAULT_MAX_D_RATE,
    d_rate: DEFAULT_D_RATE_RAW,
    destructionRate: DEFAULT_CURRENT_DESTRUCTION_RATE,
    element: defaultElement(),
    absorbElementList: [],
  };
}

function enemyToManual(enemy) {
  if (!enemy) return defaultManual();
  const eShield = cloneEnemyEShield(enemy.e_shield);
  const extraHpGauge = cloneEnemyExtraHpGauge(enemy.extra_hp_gauge);
  return cloneManual({
    od_rate: normalizeEnemyOdRateMultiplier(enemy.od_rate ?? enemy.base_param?.od_rate ?? DEFAULT_OD_RATE),
    max_d_rate: enemy.max_d_rate ?? enemy.base_param?.max_d_rate ?? DEFAULT_MAX_D_RATE,
    d_rate: enemy.d_rate ?? enemy.base_param?.d_rate ?? DEFAULT_D_RATE_RAW,
    destructionRate: DEFAULT_CURRENT_DESTRUCTION_RATE,
    element: Object.fromEntries(
      ELEMENTS.map((element) => [
        element.key,
        enemy.resistances?.element?.[element.key] ?? DEFAULT_ENEMY_RESISTANCE_RATE_PERCENT,
      ])
    ),
    absorbElementList: enemy.absorbElementList ?? enemy.resistances?.element?.absorb_element_list ?? [],
    ...(eShield ? { e_shield: eShield } : {}),
    ...(extraHpGauge ? { extra_hp_gauge: extraHpGauge } : {}),
  });
}

function snapshotToManual(snapshot = {}) {
  const eShield = cloneEnemyEShield(snapshot.e_shield ?? snapshot.manual?.e_shield);
  const extraHpGauge = cloneEnemyExtraHpGauge(
    snapshot.extra_hp_gauge ?? snapshot.manual?.extra_hp_gauge
  );
  if (snapshot.manual && typeof snapshot.manual === 'object') {
    return cloneManual({
      ...snapshot.manual,
      ...(eShield ? { e_shield: eShield } : {}),
      ...(extraHpGauge ? { extra_hp_gauge: extraHpGauge } : {}),
    });
  }
  return cloneManual({
    od_rate: normalizeEnemyOdRateMultiplier(snapshot.od_rate),
    max_d_rate: snapshot.max_d_rate,
    d_rate: snapshot.d_rate,
    destructionRate: snapshot.destructionRate,
    element: snapshot.resistances?.element,
    absorbElementList: snapshot.absorbElementList,
    ...(eShield ? { e_shield: eShield } : {}),
    ...(extraHpGauge ? { extra_hp_gauge: extraHpGauge } : {}),
  });
}

function createDefaultSelectedEnemyIds() {
  return Array.from({ length: ENEMY_SLOT_COUNT }, () => null);
}

function createDefaultSelectedCategoryKeys() {
  return Array.from({ length: ENEMY_SLOT_COUNT }, () => null);
}

function createDefaultManualBySlot() {
  return Array.from({ length: ENEMY_SLOT_COUNT }, () => defaultManual());
}

function createDefaultGaugeOverrides() {
  return Array.from({ length: ENEMY_SLOT_COUNT }, () => null);
}

// snapshot 直書きの dp/hp を取り込む（手動敵・フィクスチャ用）。どちらも無ければ null
function gaugeOverrideFromSnapshot(source = {}) {
  const dp = Number(source?.dp);
  const hp = Number(source?.hp);
  const override = {
    ...(Number.isFinite(dp) && dp >= 0 ? { dp } : {}),
    ...(Number.isFinite(hp) && hp >= 0 ? { hp } : {}),
  };
  return Object.keys(override).length > 0 ? override : null;
}

function createDefaultManualFlags() {
  return Array.from({ length: ENEMY_SLOT_COUNT }, () => false);
}

function normalizeSlotIndex(value, fallback = REQUIRED_SLOT_INDEX) {
  const numeric = Number(value);
  if (!Number.isInteger(numeric)) {
    return fallback;
  }
  if (numeric < 0 || numeric >= ENEMY_SLOT_COUNT) {
    return fallback;
  }
  return numeric;
}

function normalizeSelectedEnemyId(value) {
  if (value === null || value === undefined || value === '') {
    return null;
  }
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function buildEnemyCategoryOptions(enemies = []) {
  const categories = new Map();
  for (const enemy of enemies) {
    const metadata = getEnemyPresetCategoryMetadata(enemy);
    if (!categories.has(metadata.key)) {
      categories.set(metadata.key, metadata.label);
    }
  }
  return [...categories.entries()].map(([key, label]) => ({ key, label }));
}

function normalizeSelectedCategoryKey(value, categoryOptions = [], fallbackKey = ENEMY_PRESET_TEMPLATE_CATEGORY_KEY) {
  const normalized = typeof value === 'string' ? value.trim() : '';
  if (normalized && categoryOptions.some((category) => category.key === normalized)) {
    return normalized;
  }
  return categoryOptions[0]?.key ?? fallbackKey;
}

/**
 * Enemy Setup タブコンポーネント
 *
 * enemies: { id, name, dimension, od_rate, max_d_rate, resistances }[]
 */
export class EnemySetupController {
  #root;
  #enemies;
  #onChange;
  #state = {
    selectedEnemyIds: createDefaultSelectedEnemyIds(),
    selectedCategoryKeys: createDefaultSelectedCategoryKeys(),
    activeSlotIndex: REQUIRED_SLOT_INDEX,
    preemptiveField: DEFAULT_PREEMPTIVE_FIELD,
    isManualBySlot: createDefaultManualFlags(),
    manualBySlot: createDefaultManualBySlot(),
    // snapshot 直書きの dp/hp（手動敵・フィクスチャ用）。敵を選び直すとクリアされ、
    // 選択敵からの再導出に戻る。保存JSONの dp/hp 往復維持に必要
    gaugeOverridesBySlot: createDefaultGaugeOverrides(),
  };

  constructor({ root, enemies = [], onChange = null }) {
    this.#root    = root;
    this.#enemies = enemies;
    this.#onChange = onChange;
  }

  mount() {
    this.#ensureRequiredSlotSelected();
    this.#syncSelectedCategories();
    this.#render();

    this.#root.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-action]');
      if (!btn) return;

      if (btn.dataset.action === 'set-active-slot') {
        this.#state.activeSlotIndex = normalizeSlotIndex(btn.dataset.slotIndex, this.#state.activeSlotIndex);
        this.#render();
        return;
      }

      if (btn.dataset.action === 'clear-slot') {
        const slotIndex = normalizeSlotIndex(btn.dataset.slotIndex, -1);
        if (slotIndex <= REQUIRED_SLOT_INDEX) {
          return;
        }
        this.#state.selectedEnemyIds[slotIndex] = null;
        this.#state.isManualBySlot[slotIndex] = false;
        this.#state.manualBySlot[slotIndex] = defaultManual();
        this.#state.gaugeOverridesBySlot[slotIndex] = null;
        if (this.#state.activeSlotIndex === slotIndex) {
          this.#state.activeSlotIndex = REQUIRED_SLOT_INDEX;
        }
        this.#syncSelectedCategories();
        this.#onChange?.(this.getSnapshot());
        this.#render();
        return;
      }

      if (btn.dataset.action === 'activate-slot-with-default') {
        const slotIndex = normalizeSlotIndex(btn.dataset.slotIndex, -1);
        if (slotIndex <= REQUIRED_SLOT_INDEX) {
          return;
        }
        if (this.#state.selectedEnemyIds[slotIndex] === null) {
          this.#state.selectedEnemyIds[slotIndex] = this.#resolveDefaultEnemyIdForSlot(slotIndex);
          this.#state.isManualBySlot[slotIndex] = false;
        }
        this.#state.activeSlotIndex = slotIndex;
        this.#syncSelectedCategories();
        this.#onChange?.(this.getSnapshot());
        this.#render();
        return;
      }

      if (btn.dataset.action === 'toggle-edit') {
        const slotIndex = this.#state.activeSlotIndex;
        const selectedEnemyId = this.#state.selectedEnemyIds[slotIndex];
        if (selectedEnemyId === null) {
          return;
        }
        if (!this.#state.isManualBySlot[slotIndex]) {
          const enemy = this.#enemies.find(e => e.id === selectedEnemyId);
          this.#state.manualBySlot[slotIndex] = enemyToManual(enemy);
        }
        this.#state.isManualBySlot[slotIndex] = !this.#state.isManualBySlot[slotIndex];
        this.#onChange?.(this.getSnapshot());
        this.#render();
      }
    });

    this.#root.addEventListener('change', (e) => {
      const t = e.target;

      if (t.dataset.action === 'select-enemy-category') {
        const slotIndex = this.#state.activeSlotIndex;
        const nextCategoryKey = this.#normalizeCategoryKeyForSlot(slotIndex, t.value);
        const previousEnemyId = this.#state.selectedEnemyIds[slotIndex];

        this.#state.selectedCategoryKeys[slotIndex] = nextCategoryKey;
        if (slotIndex === REQUIRED_SLOT_INDEX || previousEnemyId !== null) {
          this.#state.selectedEnemyIds[slotIndex] = this.#resolveDefaultEnemyIdForSlot(slotIndex, nextCategoryKey);
        }
        this.#state.isManualBySlot[slotIndex] = false;
        this.#state.gaugeOverridesBySlot[slotIndex] = null;
        this.#ensureRequiredSlotSelected();
        this.#syncSelectedCategories();
        this.#onChange?.(this.getSnapshot());
        this.#render();
        return;
      }

      if (t.dataset.action === 'select-enemy') {
        const slotIndex = this.#state.activeSlotIndex;
        const selectedEnemyId = normalizeSelectedEnemyId(t.value);
        if (slotIndex === REQUIRED_SLOT_INDEX) {
          this.#state.selectedEnemyIds[slotIndex] = selectedEnemyId ?? this.#resolveDefaultEnemyIdForSlot(slotIndex);
        } else {
          this.#state.selectedEnemyIds[slotIndex] = selectedEnemyId;
        }
        const selectedEnemy = this.#findEnemyById(this.#state.selectedEnemyIds[slotIndex]);
        if (selectedEnemy) {
          this.#state.selectedCategoryKeys[slotIndex] = getEnemyPresetCategoryMetadata(selectedEnemy).key;
        }
        this.#state.isManualBySlot[slotIndex] = false;
        this.#state.gaugeOverridesBySlot[slotIndex] = null;
        this.#ensureRequiredSlotSelected();
        this.#syncSelectedCategories();
        this.#onChange?.(this.getSnapshot());
        this.#render();
        return;
      }

      if (t.dataset.action === 'select-preemptive-field') {
        this.#state.preemptiveField = normalizePreemptiveField(t.value);
        this.#onChange?.(this.getSnapshot());
        this.#render();
        return;
      }

      if (t.dataset.editField) {
        const val = Number(t.value);
        if (Number.isFinite(val)) {
          const slotIndex = this.#state.activeSlotIndex;
          this.#state.manualBySlot[slotIndex][t.dataset.editField] = val;
          this.#onChange?.(this.getSnapshot());
        }
        return;
      }

      if (t.dataset.editElement) {
        const val = Number(t.value);
        if (Number.isFinite(val)) {
          const slotIndex = this.#state.activeSlotIndex;
          this.#state.manualBySlot[slotIndex].element[t.dataset.editElement] = val;
          this.#onChange?.(this.getSnapshot());
        }
        return;
      }

      if (t.dataset.editAbsorb) {
        const key = normalizeAbsorbElementKey(t.dataset.editAbsorb);
        if (!key) {
          return;
        }
        const slotIndex = this.#state.activeSlotIndex;
        const next = new Set(this.#state.manualBySlot[slotIndex].absorbElementList);
        if (t.checked) {
          next.add(key);
        } else {
          next.delete(key);
        }
        this.#state.manualBySlot[slotIndex].absorbElementList = [...next];
        this.#onChange?.(this.getSnapshot());
        return;
      }

      if (t.dataset.editEshieldField) {
        const slotIndex = this.#state.activeSlotIndex;
        const key = String(t.dataset.editEshieldField).trim();
        if (!['count', 'max', 'def_up_rate', 'dmg_limit'].includes(key)) {
          return;
        }
        const value = Number(t.value);
        if (!Number.isFinite(value)) {
          return;
        }
        const stageCount = resolveEnemyEShieldEditorStageCount(this.#getEffectiveBySlot(slotIndex).extra_hp_gauge);
        if (stageCount >= 2 && key === 'max') {
          return;
        }
        const currentDraft = cloneEnemyEShieldDraft(this.#state.manualBySlot[slotIndex].e_shield);
        const previousMax = Number(currentDraft.max);
        currentDraft[key] = normalizeEnemyEShieldEditorNumber(value, currentDraft[key]);
        if (stageCount >= 2) {
          currentDraft.max = resolveEnemyEShieldEditorMax(currentDraft, stageCount);
          if (key === 'count' && Number(currentDraft.count) > Number(currentDraft.max)) {
            currentDraft.count = currentDraft.max;
          }
          this.#state.manualBySlot[slotIndex].e_shield = currentDraft;
          this.#onChange?.(this.getSnapshot());
          if (key === 'count' && Number(value) > Number(currentDraft.max)) {
            this.#render();
          }
          return;
        }
        // count が max を超えた場合、max を count に追従させる
        let maxFollowed = false;
        if (key === 'count' && Number(currentDraft.count) > Number(currentDraft.max)) {
          currentDraft.max = currentDraft.count;
          maxFollowed = Number(currentDraft.max) !== previousMax;
        }
        this.#state.manualBySlot[slotIndex].e_shield = currentDraft;
        this.#onChange?.(this.getSnapshot());
        // max を自動引き上げした場合は input value を反映するため再レンダリング
        if (maxFollowed) {
          this.#render();
        }
        return;
      }

      if (t.dataset.editEshieldStages != null) {
        const slotIndex = this.#state.activeSlotIndex;
        const currentDraft = cloneEnemyEShieldDraft(this.#state.manualBySlot[slotIndex].e_shield);
        currentDraft.maxByStage = normalizeEnemyEShieldEditorMaxByStage(t.value);
        this.#state.manualBySlot[slotIndex].e_shield = currentDraft;
        this.#onChange?.(this.getSnapshot());
        return;
      }

      if (t.dataset.editEshieldStageIndex != null) {
        const slotIndex = this.#state.activeSlotIndex;
        const stageCount = normalizeEnemyEShieldStageCount(t.dataset.editEshieldStageCount);
        const stageIndex = normalizeEnemyEShieldStageIndex(t.dataset.editEshieldStageIndex, stageCount);
        const value = Number(t.value);
        if (stageIndex === null || !Number.isFinite(value)) {
          return;
        }
        const currentDraft = cloneEnemyEShieldDraft(this.#state.manualBySlot[slotIndex].e_shield);
        const nextValues = buildEnemyEShieldEditorStageValues(currentDraft, stageCount);
        nextValues[stageIndex] = normalizeEnemyEShieldEditorNumber(value, nextValues[stageIndex]);
        currentDraft.maxByStage = nextValues;
        currentDraft.max = nextValues[0];
        if (Number(currentDraft.count) > Number(currentDraft.max)) {
          currentDraft.count = currentDraft.max;
        }
        this.#state.manualBySlot[slotIndex].e_shield = currentDraft;
        this.#onChange?.(this.getSnapshot());
        this.#render();
        return;
      }

      if (t.dataset.editEshieldElement) {
        const slotIndex = this.#state.activeSlotIndex;
        const elementValue = String(t.dataset.editEshieldElement).trim();
        if (!E_SHIELD_ELEMENT_VALUE_SET.has(elementValue)) {
          return;
        }
        const currentDraft = cloneEnemyEShieldDraft(this.#state.manualBySlot[slotIndex].e_shield);
        const next = new Set(currentDraft.elements);
        if (t.checked) {
          next.add(elementValue);
        } else {
          next.delete(elementValue);
        }
        currentDraft.elements = [...next];
        this.#state.manualBySlot[slotIndex].e_shield = currentDraft;
        this.#onChange?.(this.getSnapshot());
      }
    });
  }

  getSnapshot() {
    const selectedEnemyIds = this.#state.selectedEnemyIds.map((enemyId) => normalizeSelectedEnemyId(enemyId));
    const enemySlots = Array.from({ length: ENEMY_SLOT_COUNT }, (_, slotIndex) => {
      const selectedEnemyId = selectedEnemyIds[slotIndex];
      const selectedEnemy = this.#enemies.find((enemy) => enemy.id === selectedEnemyId) ?? null;
      const effective = cloneManual(this.#getEffectiveBySlot(slotIndex));
      const effectiveEShield = cloneEnemyEShield(effective.e_shield);
      const effectiveExtraHpGauge = cloneEnemyExtraHpGauge(
        selectedEnemy?.extra_hp_gauge ?? effective.extra_hp_gauge
      );
      const gaugeOverride = this.#state.gaugeOverridesBySlot[slotIndex];
      return {
        slotIndex,
        selectedEnemyId,
        selectedEnemyName: selectedEnemy?.name ?? '',
        param_border: resolveEnemyParamBorder(selectedEnemy),
        // snapshot 直書きの dp/hp（手動敵）を優先し、なければ選択敵から導出
        dp: gaugeOverride?.dp ?? resolveEnemyDp(selectedEnemy),
        ...(gaugeOverride?.hp != null ? { hp: gaugeOverride.hp } : {}),
        isManual: Boolean(this.#state.isManualBySlot[slotIndex]),
        manual: cloneManual(this.#state.manualBySlot[slotIndex]),
        od_rate: effective.od_rate,
        max_d_rate: effective.max_d_rate,
        d_rate: effective.d_rate,
        destructionRate: normalizeDestructionRate(effective.destructionRate),
        resistances: { element: { ...effective.element } },
        absorbElementList: [...effective.absorbElementList],
        ...(effectiveEShield ? { e_shield: effectiveEShield } : {}),
        ...(effectiveExtraHpGauge ? { extra_hp_gauge: effectiveExtraHpGauge } : {}),
      };
    });
    const selectedCount = selectedEnemyIds.filter((enemyId) => enemyId !== null).length;
    const slot0 = enemySlots[REQUIRED_SLOT_INDEX];
    return {
      selectedEnemyIds,
      activeSlotIndex: this.#state.activeSlotIndex,
      enemySlots,
      preemptiveField: this.#state.preemptiveField,

      // Legacy-compatible flat fields (slot 1)
      selectedEnemyId: slot0.selectedEnemyId,
      selectedEnemyName: slot0.selectedEnemyName,
      enemyCount: selectedCount > 0 ? selectedCount : 1,
      dp: slot0.dp,
      ...(slot0.hp != null ? { hp: slot0.hp } : {}),
      isManual: slot0.isManual,
      manual: cloneManual(slot0.manual),
      od_rate: slot0.od_rate,
      max_d_rate: slot0.max_d_rate,
      d_rate: slot0.d_rate,
      destructionRate: slot0.destructionRate,
      resistances: { element: { ...slot0.resistances.element } },
      absorbElementList: [...slot0.absorbElementList],
      ...(slot0.e_shield ? { e_shield: cloneEnemyEShield(slot0.e_shield) } : {}),
      ...(slot0.extra_hp_gauge ? { extra_hp_gauge: cloneEnemyExtraHpGauge(slot0.extra_hp_gauge) } : {}),
    };
  }

  applySnapshot(snapshot = {}) {
    const nextSelectedEnemyIds = createDefaultSelectedEnemyIds();
    const nextSelectedCategoryKeys = createDefaultSelectedCategoryKeys();
    const nextIsManualBySlot = createDefaultManualFlags();
    const nextManualBySlot = createDefaultManualBySlot();
    const nextGaugeOverridesBySlot = createDefaultGaugeOverrides();

    if (Array.isArray(snapshot.enemySlots)) {
      for (const slot of snapshot.enemySlots) {
        const slotIndex = normalizeSlotIndex(slot?.slotIndex, -1);
        if (slotIndex < 0) {
          continue;
        }
        nextSelectedEnemyIds[slotIndex] = normalizeSelectedEnemyId(slot?.selectedEnemyId);
        nextGaugeOverridesBySlot[slotIndex] = gaugeOverrideFromSnapshot(slot);
        const hasManualState =
          (slot?.manual && typeof slot.manual === 'object') ||
          slot?.od_rate != null ||
          slot?.max_d_rate != null ||
          slot?.d_rate != null ||
          (slot?.resistances && typeof slot.resistances === 'object') ||
          Array.isArray(slot?.absorbElementList) ||
          (slot?.e_shield && typeof slot.e_shield === 'object') ||
          (slot?.extra_hp_gauge && typeof slot.extra_hp_gauge === 'object');
        if (hasManualState) {
          nextManualBySlot[slotIndex] = snapshotToManual(slot);
        }
        if (slot?.isManual != null) {
          nextIsManualBySlot[slotIndex] = Boolean(slot.isManual);
        }
      }
    }

    if (Array.isArray(snapshot.selectedEnemyIds)) {
      snapshot.selectedEnemyIds.forEach((enemyId, slotIndex) => {
        if (slotIndex < ENEMY_SLOT_COUNT) {
          nextSelectedEnemyIds[slotIndex] = normalizeSelectedEnemyId(enemyId);
        }
      });
    }

    // Legacy snapshot compatibility
    if (
      snapshot.selectedEnemyId != null ||
      snapshot.isManual != null ||
      (snapshot.manual && typeof snapshot.manual === 'object') ||
      snapshot.od_rate != null ||
      snapshot.max_d_rate != null ||
      snapshot.d_rate != null ||
      (snapshot.resistances && typeof snapshot.resistances === 'object') ||
      Array.isArray(snapshot.absorbElementList) ||
      (snapshot?.e_shield && typeof snapshot.e_shield === 'object')
    ) {
      nextSelectedEnemyIds[REQUIRED_SLOT_INDEX] = normalizeSelectedEnemyId(snapshot.selectedEnemyId);
      nextManualBySlot[REQUIRED_SLOT_INDEX] = snapshotToManual(snapshot);
      if (snapshot.isManual != null) {
        nextIsManualBySlot[REQUIRED_SLOT_INDEX] = Boolean(snapshot.isManual);
      }
      if (!nextGaugeOverridesBySlot[REQUIRED_SLOT_INDEX]) {
        nextGaugeOverridesBySlot[REQUIRED_SLOT_INDEX] = gaugeOverrideFromSnapshot(snapshot);
      }
    }

    this.#state.selectedEnemyIds = nextSelectedEnemyIds;
    this.#state.selectedCategoryKeys = nextSelectedCategoryKeys;
    this.#state.isManualBySlot = nextIsManualBySlot;
    this.#state.manualBySlot = nextManualBySlot;
    this.#state.gaugeOverridesBySlot = nextGaugeOverridesBySlot;

    if (snapshot.preemptiveField != null) {
      this.#state.preemptiveField = normalizePreemptiveField(snapshot.preemptiveField);
    }
    if (snapshot.activeSlotIndex != null) {
      this.#state.activeSlotIndex = normalizeSlotIndex(snapshot.activeSlotIndex, REQUIRED_SLOT_INDEX);
    }
    this.#ensureRequiredSlotSelected();
    this.#syncSelectedCategories();
    this.#render();
  }

  setEnemies(enemies = []) {
    this.#enemies = Array.isArray(enemies) ? enemies : [];
    this.#ensureRequiredSlotSelected();
    this.#syncSelectedCategories();
    this.#render();
  }

  resetToDefaults() {
    this.#state = {
      selectedEnemyIds: createDefaultSelectedEnemyIds(),
      selectedCategoryKeys: createDefaultSelectedCategoryKeys(),
      activeSlotIndex: REQUIRED_SLOT_INDEX,
      preemptiveField: DEFAULT_PREEMPTIVE_FIELD,
      isManualBySlot: createDefaultManualFlags(),
      manualBySlot: createDefaultManualBySlot(),
      gaugeOverridesBySlot: createDefaultGaugeOverrides(),
    };
    this.#ensureRequiredSlotSelected();
    this.#syncSelectedCategories();
    this.#onChange?.(this.getSnapshot());
    this.#render();
  }

  // ─── private ────────────────────────────────────────────

  #resolveDefaultEnemyId() {
    const preferred = this.#enemies.find((enemy) => enemy.name === '希望を喰むもの');
    if (preferred) {
      return preferred.id;
    }
    return this.#enemies[0]?.id ?? null;
  }

  #getCategoryOptions() {
    return buildEnemyCategoryOptions(this.#enemies);
  }

  #getCategoryFallbackKey() {
    return this.#getCategoryOptions()[0]?.key ?? ENEMY_PRESET_TEMPLATE_CATEGORY_KEY;
  }

  #normalizeCategoryKeyForSlot(slotIndex, value = null) {
    return normalizeSelectedCategoryKey(
      value ?? this.#state.selectedCategoryKeys[slotIndex],
      this.#getCategoryOptions(),
      this.#getCategoryFallbackKey()
    );
  }

  #syncSelectedCategories() {
    const categoryOptions = this.#getCategoryOptions();
    const fallbackKey = categoryOptions[0]?.key ?? ENEMY_PRESET_TEMPLATE_CATEGORY_KEY;
    this.#state.selectedCategoryKeys = this.#state.selectedCategoryKeys.map((currentKey, slotIndex) => {
      const selectedEnemy = this.#getSelectedEnemyBySlot(slotIndex);
      if (selectedEnemy) {
        return getEnemyPresetCategoryMetadata(selectedEnemy).key;
      }
      return normalizeSelectedCategoryKey(currentKey, categoryOptions, fallbackKey);
    });
  }

  #getEnemiesForCategory(categoryKey) {
    const normalizedCategoryKey = normalizeSelectedCategoryKey(
      categoryKey,
      this.#getCategoryOptions(),
      this.#getCategoryFallbackKey()
    );
    return this.#enemies.filter((enemy) => getEnemyPresetCategoryMetadata(enemy).key === normalizedCategoryKey);
  }

  #resolveDefaultEnemyIdForSlot(slotIndex, preferredCategoryKey = null) {
    const normalizedSlotIndex = normalizeSlotIndex(slotIndex, REQUIRED_SLOT_INDEX);
    const normalizedCategoryKey = this.#normalizeCategoryKeyForSlot(normalizedSlotIndex, preferredCategoryKey);
    const categoryEnemies = this.#getEnemiesForCategory(normalizedCategoryKey);
    if (normalizedSlotIndex === REQUIRED_SLOT_INDEX) {
      const preferred = categoryEnemies.find((enemy) => enemy.name === '希望を喰むもの');
      if (preferred) {
        return preferred.id;
      }
    }
    if (categoryEnemies[0]) {
      return categoryEnemies[0].id;
    }
    return this.#resolveDefaultEnemyId();
  }

  #ensureRequiredSlotSelected() {
    if (this.#state.selectedEnemyIds[REQUIRED_SLOT_INDEX] == null) {
      this.#state.selectedEnemyIds[REQUIRED_SLOT_INDEX] = this.#resolveDefaultEnemyIdForSlot(REQUIRED_SLOT_INDEX);
    }
    this.#state.activeSlotIndex = normalizeSlotIndex(this.#state.activeSlotIndex, REQUIRED_SLOT_INDEX);
  }

  #findEnemyById(enemyId) {
    const normalizedEnemyId = normalizeSelectedEnemyId(enemyId);
    if (normalizedEnemyId === null) {
      return null;
    }
    return this.#enemies.find((enemy) => enemy.id === normalizedEnemyId) ?? null;
  }

  #getSelectedEnemyBySlot(slotIndex) {
    return this.#findEnemyById(this.#state.selectedEnemyIds[slotIndex]);
  }

  #getEffectiveBySlot(slotIndex) {
    if (this.#state.isManualBySlot[slotIndex]) {
      return this.#state.manualBySlot[slotIndex];
    }
    return enemyToManual(this.#getSelectedEnemyBySlot(slotIndex));
  }

  #render() {
    const { selectedEnemyIds, activeSlotIndex, preemptiveField } = this.#state;
    const selectedEnemyId = selectedEnemyIds[activeSlotIndex];
    const selected = this.#getSelectedEnemyBySlot(activeSlotIndex);
    const vals = this.#getEffectiveBySlot(activeSlotIndex);
    const currentDestructionRate = normalizeDestructionRate(vals.destructionRate);
    const isManual = this.#state.isManualBySlot[activeSlotIndex];
    const hasSelectedEnemy = selectedEnemyId !== null;
    const categoryOptions = this.#getCategoryOptions();
    const selectedCategoryKey = this.#normalizeCategoryKeyForSlot(activeSlotIndex);
    const categoryEnemies = this.#getEnemiesForCategory(selectedCategoryKey);
    const eShieldDraft = cloneEnemyEShieldDraft(vals.e_shield);
    const eShieldStageCount = resolveEnemyEShieldEditorStageCount(vals.extra_hp_gauge);
    const hasEShield = Boolean(cloneEnemyEShield(vals.e_shield));

    this.#root.innerHTML = `
      <div class="p-1.5 space-y-2">

        <!-- 敵スロット -->
        <div>
          <div class="text-xs font-semibold text-gray-400 uppercase tracking-wide px-1 mb-0.5">敵スロット</div>
          <div class="space-y-1">
            ${Array.from({ length: ENEMY_SLOT_COUNT }, (_, slotIndex) => {
              const selectedEnemy = this.#getSelectedEnemyBySlot(slotIndex);
              const isActive = activeSlotIndex === slotIndex;
              const isEmpty = !selectedEnemy;
              const canClear = slotIndex > REQUIRED_SLOT_INDEX;
              return `
                <div class="flex items-center gap-1">
                  <button data-action="set-active-slot" data-slot-index="${slotIndex}"
                          class="flex-1 text-xs py-1 rounded-md font-medium border text-left px-2 transition-colors
                                 ${isActive
                                   ? 'bg-blue-500 text-white border-blue-500'
                                   : isEmpty
                                     ? 'bg-gray-50 text-gray-400 border-gray-200 hover:bg-gray-100'
                                     : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}">
                    [${slotIndex + 1}] ${selectedEnemy ? selectedEnemy.name : '-'}
                  </button>
                  ${canClear
                    ? `<button data-action="clear-slot" data-slot-index="${slotIndex}"
                               class="text-[11px] px-2 py-1 rounded-md border transition-colors
                                      ${isEmpty
                                        ? 'bg-gray-50 text-gray-300 border-gray-200'
                                        : 'bg-white text-red-500 border-red-200 hover:bg-red-50'}"
                               ${isEmpty ? 'disabled' : ''}>
                         削除
                       </button>`
                    : ''}
                </div>
              `;
            }).join('')}
          </div>
        </div>

        ${activeSlotIndex > REQUIRED_SLOT_INDEX && !hasSelectedEnemy
          ? `<button data-action="activate-slot-with-default" data-slot-index="${activeSlotIndex}"
                    class="w-full text-xs py-1 rounded-md border border-blue-200 text-blue-600 bg-blue-50 hover:bg-blue-100 transition-colors">
               [${activeSlotIndex + 1}] に敵を追加
             </button>`
          : ''}

        <div class="rounded-md border border-blue-100 bg-blue-50/50 p-2 space-y-1.5">
          <div class="text-xs font-semibold text-blue-700">Turn0(先制攻撃)</div>
          <label class="block text-xs text-gray-600" for="enemy-preemptive-field-select">開幕フィールド</label>
          <select id="enemy-preemptive-field-select"
                  data-action="select-preemptive-field"
                  class="w-full text-xs rounded-md border border-blue-200 bg-white px-2 py-1.5
                         focus:outline-none focus:ring-1 focus:ring-blue-400">
            ${PREEMPTIVE_FIELD_OPTIONS.map((option) => `
              <option value="${option.value}" ${option.value === preemptiveField ? 'selected' : ''}>
                ${option.label}
              </option>
            `).join('')}
          </select>
        </div>

        <!-- 敵プリセット選択 -->
        <div>
          <div class="text-xs font-semibold text-gray-400 uppercase tracking-wide px-1 mb-0.5">敵プリセット</div>
          <div class="grid grid-cols-2 gap-1.5">
            <label class="flex flex-col gap-0.5">
              <span class="text-xs text-gray-500">カテゴリ</span>
              <select data-action="select-enemy-category"
                      data-role="enemy-category-select"
                      class="w-full text-xs rounded-md border border-gray-200 bg-white px-2 py-1.5
                             focus:outline-none focus:ring-1 focus:ring-blue-400">
                ${categoryOptions.length > 0
                  ? categoryOptions.map((category) => `
                      <option value="${category.key}" ${category.key === selectedCategoryKey ? 'selected' : ''}>
                        ${category.label}
                      </option>
                    `).join('')
                  : `<option value="${ENEMY_PRESET_TEMPLATE_CATEGORY_KEY}" selected>${EMPTY_ENEMY_SELECT_LABEL}</option>`}
              </select>
            </label>
            <label class="flex flex-col gap-0.5">
              <span class="text-xs text-gray-500">敵</span>
              <select data-action="select-enemy"
                      data-role="enemy-preset-select"
                      class="w-full text-xs rounded-md border border-gray-200 bg-white px-2 py-1.5
                             focus:outline-none focus:ring-1 focus:ring-blue-400">
                ${activeSlotIndex > REQUIRED_SLOT_INDEX ? `<option value="${EMPTY_ENEMY_SELECT_VALUE}">${EMPTY_ENEMY_SELECT_LABEL}</option>` : ''}
                ${categoryEnemies.map((enemy) => `
                  <option value="${enemy.id}" ${enemy.id === selectedEnemyId ? 'selected' : ''}>
                    ${enemy.name}
                  </option>
                `).join('')}
              </select>
            </label>
          </div>
        </div>

        <!-- パラメータ表示 / 編集 -->
        <div class="rounded-md border border-gray-200 bg-gray-50 overflow-hidden ${hasSelectedEnemy ? '' : 'opacity-45'}">
          <div class="flex items-center justify-between px-2 py-1 border-b border-gray-200 bg-white">
            <span class="text-xs font-medium text-gray-600 truncate min-w-0">
              [${activeSlotIndex + 1}] ${isManual ? '手動編集モード' : (selected ? selected.name : '──')}
            </span>
            <button data-action="toggle-edit"
                    class="shrink-0 ml-1 text-xs px-2 py-0.5 rounded border transition-colors
                           ${isManual
                             ? 'bg-amber-100 text-amber-700 border-amber-300 hover:bg-amber-200'
                             : 'bg-white text-gray-500 border-gray-200 hover:bg-gray-100'}"
                    ${hasSelectedEnemy ? '' : 'disabled'}>
              ${isManual ? '✎ 編集中' : '✎ 編集'}
            </button>
          </div>

          <div class="p-2 space-y-2 ${hasSelectedEnemy ? '' : 'pointer-events-none'}">
            <!-- オーバードライブ上昇量 / 破壊率上昇率 / 現在破壊率 / 最大破壊率 -->
            <div class="grid grid-cols-2 gap-1.5">
              ${this.#numFieldHtml('od_rate',    'オーバードライブ上昇量', vals.od_rate,    isManual,
                (v) => formatEnemyOdRatePercent(v))}
              ${this.#numFieldHtml('d_rate',     '破壊率上昇率',         vals.d_rate,     isManual,
                (v) => `${v}%`)}
              ${this.#readOnlyFieldHtml('現在破壊率', formatDestructionRatePercent(currentDestructionRate), 'enemy-current-destruction-rate')}
              ${this.#numFieldHtml('max_d_rate', '最大破壊率',             vals.max_d_rate, isManual,
                (v) => `${v}%`)}
            </div>

            <!-- 属性耐性 -->
            <div>
              <div class="text-xs text-gray-400 mb-1">属性耐性</div>
              <div class="grid grid-cols-3 gap-0.5">
                ${ELEMENTS.map(el => this.#elemHtml(el, vals.element[el.key] ?? 0, isManual)).join('')}
              </div>
            </div>

            <div>
              <div class="text-xs text-gray-400 mb-1">吸収属性</div>
              <div class="grid grid-cols-3 gap-0.5">
                ${ELEMENTS.map((el) => this.#absorbHtml(el, vals.absorbElementList.includes(el.key), isManual)).join('')}
              </div>
            </div>

            ${this.#eShieldHtml(eShieldDraft, hasEShield, isManual, eShieldStageCount)}
          </div>
        </div>

      </div>
    `;
  }

  #numFieldHtml(key, label, value, editable, formatter = null, inputDataAttribute = 'data-edit-field') {
    if (editable) {
      return `
        <label class="flex flex-col gap-0.5">
          <span class="text-xs text-gray-500">${label}</span>
          <input type="number" ${inputDataAttribute}="${key}" value="${value}"
                 class="text-xs rounded border border-gray-300 px-1 py-0.5 w-full
                        focus:outline-none focus:ring-1 focus:ring-blue-400" />
        </label>`;
    }
    return `
      <div class="flex flex-col gap-0.5">
        <span class="text-xs text-gray-500">${label}</span>
        <span class="text-xs font-mono font-medium ${value !== 0 ? 'text-blue-700' : 'text-gray-500'}">${formatter ? formatter(value) : value}</span>
      </div>`;
  }

  #readOnlyFieldHtml(label, value, role = '') {
    return `
      <div class="flex flex-col gap-0.5" ${role ? `data-role="${role}"` : ''}>
        <span class="text-xs text-gray-500">${label}</span>
        <span class="text-xs font-mono font-medium text-blue-700">${value}</span>
      </div>`;
  }

  #elemHtml(el, value, editable) {
    const numericValue = normalizeElementRatePercent(value);
    const colorCls = numericValue > DEFAULT_ENEMY_RESISTANCE_RATE_PERCENT
      ? 'text-red-600'
      : numericValue < DEFAULT_ENEMY_RESISTANCE_RATE_PERCENT
        ? 'text-blue-600'
        : 'text-gray-400';
    const iconHtml = el.icon
      ? `<img src="${resolveUiAssetUrl(el.icon)}" alt="${el.label}"
              class="w-4 h-4 object-contain" />`
      : `<span class="w-4 h-4 flex items-center justify-center text-xs text-gray-400 leading-none">${el.label}</span>`;

    if (editable) {
      return `
        <div class="flex flex-col items-center gap-0.5">
          ${iconHtml}
          <input type="number" data-edit-element="${el.key}" value="${numericValue}"
                 class="text-xs rounded border border-gray-300 text-center px-0 py-0 w-full
                        focus:outline-none focus:ring-1 focus:ring-blue-400" />
        </div>`;
    }
    return `
      <div class="flex flex-col items-center gap-0.5 py-0.5">
        ${iconHtml}
        <span class="text-xs font-mono ${colorCls}">${numericValue}%</span>
      </div>`;
  }

  #absorbHtml(el, checked, editable) {
    const iconHtml = el.icon
      ? `<img src="${resolveUiAssetUrl(el.icon)}" alt="${el.label}"
              class="w-4 h-4 object-contain" />`
      : `<span class="w-4 h-4 flex items-center justify-center text-xs text-gray-400 leading-none">${el.label}</span>`;
    if (editable) {
      return `
        <label class="flex flex-col items-center gap-0.5 py-0.5 cursor-pointer">
          ${iconHtml}
          <input type="checkbox" data-edit-absorb="${el.key}" ${checked ? 'checked' : ''}
                 class="h-3.5 w-3.5 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500" />
        </label>`;
    }
    return `
      <div class="flex flex-col items-center gap-0.5 py-0.5">
        ${iconHtml}
        <span class="text-[10px] font-medium ${checked ? 'text-emerald-600' : 'text-gray-300'}">${checked ? '吸収' : '---'}</span>
      </div>`;
  }

  #eShieldHtml(eShield, hasEShield, editable, stageCount = 0) {
    const displayEShield = normalizeEnemyEShieldStageCount(stageCount) >= 2
      ? {
          ...eShield,
          max: resolveEnemyEShieldEditorMax(eShield, stageCount),
        }
      : eShield;
    if (editable) {
      return `
        <div data-role="enemy-e-shield-editor" class="rounded-md border border-violet-200 bg-violet-50/70 p-2 space-y-1.5">
          <div class="flex items-center justify-between gap-2">
            <div class="text-xs font-semibold text-violet-700">Eシールド</div>
            <div class="text-[10px] text-violet-500">max=0 または属性未選択で未設定扱い</div>
          </div>
          <div class="grid grid-cols-2 gap-1.5">
            ${this.#numFieldHtml('count', '現在値', displayEShield.count, true, null, 'data-edit-eshield-field')}
            ${this.#eShieldMaxFieldHtml(displayEShield, stageCount)}
          </div>
          <div class="grid grid-cols-2 gap-1.5">
            ${this.#numFieldHtml('def_up_rate', '防御UP', displayEShield.def_up_rate, true, null, 'data-edit-eshield-field')}
            ${this.#numFieldHtml('dmg_limit', 'ダメージ上限', displayEShield.dmg_limit, true, null, 'data-edit-eshield-field')}
          </div>
          ${this.#eShieldStageEditorHtml(displayEShield, stageCount)}
          <div>
            <div class="text-xs text-violet-500 mb-1">対応属性</div>
            <div class="grid grid-cols-5 gap-0.5">
              ${E_SHIELD_ELEMENT_OPTIONS.map((element) => this.#eShieldElementHtml(
                element,
                displayEShield.elements.includes(element.eShieldValue)
              )).join('')}
            </div>
          </div>
        </div>
      `;
    }

    if (!hasEShield) {
      return `
        <div data-role="enemy-e-shield-summary" class="rounded-md border border-violet-100 bg-violet-50/40 p-2">
          <div class="text-xs font-semibold text-violet-700 mb-1">Eシールド</div>
          <div class="text-xs text-gray-500">なし</div>
        </div>
      `;
    }

    return `
      <div data-role="enemy-e-shield-summary" class="rounded-md border border-violet-100 bg-violet-50/40 p-2 space-y-1.5">
        <div class="text-xs font-semibold text-violet-700">Eシールド</div>
        <div class="grid grid-cols-2 gap-1.5">
          ${this.#numFieldHtml('count', '現在値', eShield.count, false)}
          ${this.#numFieldHtml('max', '最大値', eShield.max, false)}
        </div>
        <div>
          <div class="text-xs text-violet-500 mb-1">対応属性</div>
          <div class="flex flex-wrap gap-1">
            ${E_SHIELD_ELEMENT_OPTIONS
              .filter((element) => eShield.elements.includes(element.eShieldValue))
              .map((element) => this.#eShieldElementChipHtml(element))
              .join('')}
          </div>
        </div>
        <div class="grid grid-cols-2 gap-1.5">
          ${this.#numFieldHtml('def_up_rate', '防御UP', eShield.def_up_rate, false)}
          ${this.#numFieldHtml('dmg_limit', 'ダメージ上限', eShield.dmg_limit, false)}
        </div>
        ${Array.isArray(eShield.maxByStage) && eShield.maxByStage.length > 0
          ? `<div class="text-xs text-violet-600">段階別最大値: ${formatEnemyEShieldEditorMaxByStage(eShield.maxByStage)}</div>`
          : ''}
      </div>
    `;
  }

  #eShieldMaxFieldHtml(eShield, stageCount = 0) {
    if (normalizeEnemyEShieldStageCount(stageCount) < 2) {
      return this.#numFieldHtml('max', '最大値', eShield.max, true, null, 'data-edit-eshield-field');
    }
    return `
      <label class="flex flex-col gap-0.5">
        <span class="text-xs text-gray-500">最大値</span>
        <input type="number"
               data-edit-eshield-field="max"
               value="${eShield.max}"
               disabled
               class="text-xs rounded border border-gray-200 bg-gray-100 px-1 py-0.5 w-full text-gray-500" />
      </label>`;
  }

  #eShieldStageEditorHtml(eShield, stageCount = 0) {
    const count = normalizeEnemyEShieldStageCount(stageCount);
    if (count >= 2) {
      const stageValues = buildEnemyEShieldEditorStageValues(eShield, count);
      return `
        <div class="space-y-1">
          <div class="text-xs text-violet-500">段階別最大値</div>
          <div class="grid grid-cols-3 gap-1.5">
            ${stageValues.map((value, index) => `
              <label class="flex flex-col gap-0.5">
                <span class="text-[10px] text-violet-500">段階${index + 1}</span>
                <input type="number"
                       data-edit-eshield-stage-index="${index}"
                       data-edit-eshield-stage-count="${count}"
                       value="${value}"
                       class="text-xs rounded border border-violet-200 px-1 py-0.5 w-full
                              focus:outline-none focus:ring-1 focus:ring-violet-400" />
              </label>
            `).join('')}
          </div>
        </div>
      `;
    }
    const stageText = formatEnemyEShieldEditorMaxByStage(eShield.maxByStage);
    return stageText
      ? `<div class="text-xs text-violet-600">段階別最大値: ${stageText}</div>`
      : '';
  }

  #eShieldElementHtml(element, checked) {
    const iconHtml = element.icon
      ? `<img src="${resolveUiAssetUrl(element.icon)}" alt="${element.label}"
              class="w-4 h-4 object-contain" />`
      : `<span class="w-4 h-4 flex items-center justify-center text-xs text-gray-400 leading-none">${element.label}</span>`;
    return `
      <label class="flex flex-col items-center gap-0.5 py-0.5 cursor-pointer rounded border ${checked ? 'border-violet-300 bg-white' : 'border-violet-100 bg-white/70'}">
        ${iconHtml}
        <input type="checkbox"
               data-edit-eshield-element="${element.eShieldValue}"
               ${checked ? 'checked' : ''}
               class="h-3.5 w-3.5 rounded border-violet-300 text-violet-600 focus:ring-violet-500" />
      </label>
    `;
  }

  #eShieldElementChipHtml(element) {
    const iconHtml = element.icon
      ? `<img src="${resolveUiAssetUrl(element.icon)}" alt="${element.label}"
              class="w-3.5 h-3.5 object-contain" />`
      : `<span class="w-3.5 h-3.5 flex items-center justify-center text-[10px] text-violet-500 leading-none">${element.label}</span>`;
    return `
      <span class="inline-flex items-center gap-1 rounded-full border border-violet-200 bg-white px-2 py-0.5 text-[10px] text-violet-700">
        ${iconHtml}
        ${element.label}
      </span>
    `;
  }
}
