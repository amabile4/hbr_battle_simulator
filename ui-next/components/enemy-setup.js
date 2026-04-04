import { resolveUiAssetUrl } from '../../src/ui/style-asset-url.js';
import {
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

const DEFAULT_OD_RATE    = 1;
const DEFAULT_MAX_D_RATE = 999;
const DEFAULT_ENEMY_RESISTANCE_RATE_PERCENT = 100;
const ENEMY_SLOT_COUNT = 3;
const REQUIRED_SLOT_INDEX = 0;
const DEFAULT_PREEMPTIVE_FIELD = 'none';
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

function cloneManual(manual = {}) {
  return {
    od_rate: normalizeEnemyOdRateMultiplier(manual.od_rate ?? DEFAULT_OD_RATE),
    max_d_rate: Number(manual.max_d_rate ?? DEFAULT_MAX_D_RATE),
    element: Object.fromEntries(
      ELEMENTS.map((element) => [element.key, normalizeElementRatePercent(manual.element?.[element.key])])
    ),
    absorbElementList: normalizeAbsorbElementList(manual.absorbElementList),
  };
}

function defaultElement() {
  return Object.fromEntries(ELEMENTS.map((element) => [element.key, DEFAULT_ENEMY_RESISTANCE_RATE_PERCENT]));
}

function defaultManual() {
  return {
    od_rate: DEFAULT_OD_RATE,
    max_d_rate: DEFAULT_MAX_D_RATE,
    element: defaultElement(),
    absorbElementList: [],
  };
}

function enemyToManual(enemy) {
  if (!enemy) return defaultManual();
  return cloneManual({
    od_rate: normalizeEnemyOdRateMultiplier(enemy.od_rate ?? DEFAULT_OD_RATE),
    max_d_rate: enemy.max_d_rate ?? DEFAULT_MAX_D_RATE,
    element: Object.fromEntries(
      ELEMENTS.map((element) => [
        element.key,
        enemy.resistances?.element?.[element.key] ?? DEFAULT_ENEMY_RESISTANCE_RATE_PERCENT,
      ])
    ),
    absorbElementList: enemy.absorbElementList ?? enemy.resistances?.element?.absorb_element_list ?? [],
  });
}

function snapshotToManual(snapshot = {}) {
  if (snapshot.manual && typeof snapshot.manual === 'object') {
    return cloneManual(snapshot.manual);
  }
  return cloneManual({
    od_rate: normalizeEnemyOdRateMultiplier(snapshot.od_rate),
    max_d_rate: snapshot.max_d_rate,
    element: snapshot.resistances?.element,
    absorbElementList: snapshot.absorbElementList,
  });
}

function createDefaultSelectedEnemyIds() {
  return Array.from({ length: ENEMY_SLOT_COUNT }, () => null);
}

function createDefaultManualBySlot() {
  return Array.from({ length: ENEMY_SLOT_COUNT }, () => defaultManual());
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
    activeSlotIndex: REQUIRED_SLOT_INDEX,
    preemptiveField: DEFAULT_PREEMPTIVE_FIELD,
    isManualBySlot: createDefaultManualFlags(),
    manualBySlot: createDefaultManualBySlot(),
  };

  constructor({ root, enemies = [], onChange = null }) {
    this.#root    = root;
    this.#enemies = enemies;
    this.#onChange = onChange;
  }

  mount() {
    this.#ensureRequiredSlotSelected();
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
        if (this.#state.activeSlotIndex === slotIndex) {
          this.#state.activeSlotIndex = REQUIRED_SLOT_INDEX;
        }
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
          this.#state.selectedEnemyIds[slotIndex] = this.#resolveDefaultEnemyId();
          this.#state.isManualBySlot[slotIndex] = false;
        }
        this.#state.activeSlotIndex = slotIndex;
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

      if (t.dataset.action === 'select-enemy') {
        const slotIndex = this.#state.activeSlotIndex;
        const selectedEnemyId = normalizeSelectedEnemyId(t.value);
        if (slotIndex === REQUIRED_SLOT_INDEX) {
          this.#state.selectedEnemyIds[slotIndex] = selectedEnemyId ?? this.#resolveDefaultEnemyId();
        } else {
          this.#state.selectedEnemyIds[slotIndex] = selectedEnemyId;
        }
        this.#state.isManualBySlot[slotIndex] = false;
        this.#ensureRequiredSlotSelected();
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
      }
    });
  }

  getSnapshot() {
    const selectedEnemyIds = this.#state.selectedEnemyIds.map((enemyId) => normalizeSelectedEnemyId(enemyId));
    const enemySlots = Array.from({ length: ENEMY_SLOT_COUNT }, (_, slotIndex) => {
      const selectedEnemyId = selectedEnemyIds[slotIndex];
      const selectedEnemy = this.#enemies.find((enemy) => enemy.id === selectedEnemyId) ?? null;
      const effective = cloneManual(this.#getEffectiveBySlot(slotIndex));
      return {
        slotIndex,
        selectedEnemyId,
        selectedEnemyName: selectedEnemy?.name ?? '',
        isManual: Boolean(this.#state.isManualBySlot[slotIndex]),
        manual: cloneManual(this.#state.manualBySlot[slotIndex]),
        od_rate: effective.od_rate,
        max_d_rate: effective.max_d_rate,
        resistances: { element: { ...effective.element } },
        absorbElementList: [...effective.absorbElementList],
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
      isManual: slot0.isManual,
      manual: cloneManual(slot0.manual),
      od_rate: slot0.od_rate,
      max_d_rate: slot0.max_d_rate,
      resistances: { element: { ...slot0.resistances.element } },
      absorbElementList: [...slot0.absorbElementList],
    };
  }

  applySnapshot(snapshot = {}) {
    const nextSelectedEnemyIds = createDefaultSelectedEnemyIds();
    const nextIsManualBySlot = createDefaultManualFlags();
    const nextManualBySlot = createDefaultManualBySlot();

    if (Array.isArray(snapshot.enemySlots)) {
      for (const slot of snapshot.enemySlots) {
        const slotIndex = normalizeSlotIndex(slot?.slotIndex, -1);
        if (slotIndex < 0) {
          continue;
        }
        nextSelectedEnemyIds[slotIndex] = normalizeSelectedEnemyId(slot?.selectedEnemyId);
        const hasManualState =
          (slot?.manual && typeof slot.manual === 'object') ||
          slot?.od_rate != null ||
          slot?.max_d_rate != null ||
          (slot?.resistances && typeof slot.resistances === 'object') ||
          Array.isArray(slot?.absorbElementList);
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
      (snapshot.resistances && typeof snapshot.resistances === 'object') ||
      Array.isArray(snapshot.absorbElementList)
    ) {
      nextSelectedEnemyIds[REQUIRED_SLOT_INDEX] = normalizeSelectedEnemyId(snapshot.selectedEnemyId);
      nextManualBySlot[REQUIRED_SLOT_INDEX] = snapshotToManual(snapshot);
      if (snapshot.isManual != null) {
        nextIsManualBySlot[REQUIRED_SLOT_INDEX] = Boolean(snapshot.isManual);
      }
    }

    this.#state.selectedEnemyIds = nextSelectedEnemyIds;
    this.#state.isManualBySlot = nextIsManualBySlot;
    this.#state.manualBySlot = nextManualBySlot;

    if (snapshot.preemptiveField != null) {
      this.#state.preemptiveField = normalizePreemptiveField(snapshot.preemptiveField);
    }
    if (snapshot.activeSlotIndex != null) {
      this.#state.activeSlotIndex = normalizeSlotIndex(snapshot.activeSlotIndex, REQUIRED_SLOT_INDEX);
    }
    this.#ensureRequiredSlotSelected();
    this.#render();
  }

  setEnemies(enemies = []) {
    this.#enemies = Array.isArray(enemies) ? enemies : [];
    this.#ensureRequiredSlotSelected();
    this.#render();
  }

  resetToDefaults() {
    this.#state = {
      selectedEnemyIds: createDefaultSelectedEnemyIds(),
      activeSlotIndex: REQUIRED_SLOT_INDEX,
      preemptiveField: DEFAULT_PREEMPTIVE_FIELD,
      isManualBySlot: createDefaultManualFlags(),
      manualBySlot: createDefaultManualBySlot(),
    };
    this.#ensureRequiredSlotSelected();
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

  #ensureRequiredSlotSelected() {
    if (this.#state.selectedEnemyIds[REQUIRED_SLOT_INDEX] == null) {
      this.#state.selectedEnemyIds[REQUIRED_SLOT_INDEX] = this.#resolveDefaultEnemyId();
    }
    this.#state.activeSlotIndex = normalizeSlotIndex(this.#state.activeSlotIndex, REQUIRED_SLOT_INDEX);
  }

  #getSelectedEnemyBySlot(slotIndex) {
    const selectedEnemyId = this.#state.selectedEnemyIds[slotIndex];
    return this.#enemies.find((enemy) => enemy.id === selectedEnemyId) ?? null;
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
    const isManual = this.#state.isManualBySlot[activeSlotIndex];
    const hasSelectedEnemy = selectedEnemyId !== null;

    // YYYYMM キーを表示ラベルに変換  null → "テンプレート"
    const formatGroupLabel = (key) => {
      if (key === null || key === undefined) return 'テンプレート';
      const year = Math.floor(key / 100);
      const month = key % 100;
      return `${year}年${month}月`;
    };

    // グループ化（null=テンプレートを先頭、次いで YYYYMM 降順）
    const groups = new Map();
    this.#enemies.forEach(e => {
      const key = e.dimension;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(e);
    });
    const groupsArr = [...groups.entries()].sort((a, b) => {
      if (a[0] === null) return -1;
      if (b[0] === null) return 1;
      return b[0] - a[0];
    });

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
          <select data-action="select-enemy"
                  class="w-full text-xs rounded-md border border-gray-200 bg-white px-2 py-1.5
                         focus:outline-none focus:ring-1 focus:ring-blue-400">
            ${activeSlotIndex > REQUIRED_SLOT_INDEX ? '<option value="">── 選択なし ──</option>' : ''}
            ${groupsArr.map(([dim, enemies]) => `
              <optgroup label="${formatGroupLabel(dim)}">
                ${enemies.map(e => `
                  <option value="${e.id}" ${e.id === selectedEnemyId ? 'selected' : ''}>
                    ${e.name}
                  </option>
                `).join('')}
              </optgroup>
            `).join('')}
          </select>
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
            <!-- オーバードライブ上昇量 / 最大破壊率 -->
            <div class="grid grid-cols-2 gap-1.5">
              ${this.#numFieldHtml('od_rate',    'オーバードライブ上昇量', vals.od_rate,    isManual,
                (v) => formatEnemyOdRatePercent(v))}
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
          </div>
        </div>

      </div>
    `;
  }

  #numFieldHtml(key, label, value, editable, formatter = null) {
    if (editable) {
      return `
        <label class="flex flex-col gap-0.5">
          <span class="text-xs text-gray-500">${label}</span>
          <input type="number" data-edit-field="${key}" value="${value}"
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
}
