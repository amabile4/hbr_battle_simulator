import { resolveUiAssetUrl } from '../../src/ui/style-asset-url.js';

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

const DEFAULT_OD_RATE    = 0;
const DEFAULT_MAX_D_RATE = 999;

function defaultElement() {
  return Object.fromEntries(ELEMENTS.map(e => [e.key, 0]));
}

function defaultManual() {
  return { od_rate: DEFAULT_OD_RATE, max_d_rate: DEFAULT_MAX_D_RATE, element: defaultElement() };
}

function enemyToManual(enemy) {
  if (!enemy) return defaultManual();
  return {
    od_rate:    enemy.od_rate    ?? DEFAULT_OD_RATE,
    max_d_rate: enemy.max_d_rate ?? DEFAULT_MAX_D_RATE,
    element:    Object.fromEntries(
      ELEMENTS.map(e => [e.key, enemy.resistances?.element?.[e.key] ?? 0])
    ),
  };
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
    selectedEnemyId: null,
    enemyCount: 1,
    isManual: false,
    manual: defaultManual(),
  };

  constructor({ root, enemies = [], onChange = null }) {
    this.#root    = root;
    this.#enemies = enemies;
    this.#onChange = onChange;
  }

  mount() {
    // デフォルト: 「希望を喰むもの」を自動選択（全耐性0 / max_d_rate 999 の標準敵）
    if (this.#state.selectedEnemyId === null) {
      const def = this.#enemies.find(e => e.name === '希望を喰むもの');
      if (def) this.#state.selectedEnemyId = def.id;
    }
    this.#render();

    this.#root.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-action]');
      if (!btn) return;

      if (btn.dataset.action === 'set-count') {
        this.#state.enemyCount = Number(btn.dataset.count);
        this.#onChange?.(this.getSnapshot());
        this.#render();
        return;
      }

      if (btn.dataset.action === 'toggle-edit') {
        if (!this.#state.isManual) {
          const enemy = this.#enemies.find(e => e.id === this.#state.selectedEnemyId);
          this.#state.manual = enemyToManual(enemy);
        }
        this.#state.isManual = !this.#state.isManual;
        this.#onChange?.(this.getSnapshot());
        this.#render();
      }
    });

    this.#root.addEventListener('change', (e) => {
      const t = e.target;

      if (t.dataset.action === 'select-enemy') {
        this.#state.selectedEnemyId = t.value ? Number(t.value) : null;
        this.#state.isManual = false;
        this.#onChange?.(this.getSnapshot());
        this.#render();
        return;
      }

      if (t.dataset.editField) {
        const val = Number(t.value);
        if (Number.isFinite(val)) {
          this.#state.manual[t.dataset.editField] = val;
          this.#onChange?.(this.getSnapshot());
        }
        return;
      }

      if (t.dataset.editElement) {
        const val = Number(t.value);
        if (Number.isFinite(val)) {
          this.#state.manual.element[t.dataset.editElement] = val;
          this.#onChange?.(this.getSnapshot());
        }
      }
    });
  }

  getSnapshot() {
    const vals = this.#getEffective();
    return {
      selectedEnemyId: this.#state.selectedEnemyId,
      enemyCount:      this.#state.enemyCount,
      od_rate:         vals.od_rate,
      max_d_rate:      vals.max_d_rate,
      resistances:     { element: { ...vals.element } },
    };
  }

  applySnapshot(snapshot = {}) {
    if (snapshot.enemyCount != null) {
      this.#state.enemyCount = Number(snapshot.enemyCount) || 1;
    }
    if (snapshot.selectedEnemyId != null) {
      this.#state.selectedEnemyId = Number(snapshot.selectedEnemyId);
      this.#state.isManual = false;
    }
    this.#render();
  }

  // ─── private ────────────────────────────────────────────

  #getEffective() {
    if (this.#state.isManual) return this.#state.manual;
    const enemy = this.#enemies.find(e => e.id === this.#state.selectedEnemyId);
    return enemyToManual(enemy);
  }

  #render() {
    const { enemyCount, selectedEnemyId, isManual } = this.#state;
    const vals     = this.#getEffective();
    const selected = this.#enemies.find(e => e.id === selectedEnemyId);

    // Dimension 番号でグループ化（降順）
    const groups = new Map();
    this.#enemies.forEach(e => {
      if (!groups.has(e.dimension)) groups.set(e.dimension, []);
      groups.get(e.dimension).push(e);
    });
    const groupsArr = [...groups.entries()].sort((a, b) => b[0] - a[0]);

    this.#root.innerHTML = `
      <div class="p-1.5 space-y-2">

        <!-- 敵数 -->
        <div>
          <div class="text-xs font-semibold text-gray-400 uppercase tracking-wide px-1 mb-0.5">敵数</div>
          <div class="flex gap-1">
            ${[1, 2, 3].map(n => `
              <button data-action="set-count" data-count="${n}"
                      class="flex-1 text-sm py-1 rounded-md font-medium border transition-colors
                             ${enemyCount === n
                               ? 'bg-blue-500 text-white border-blue-500'
                               : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}">
                ${n}
              </button>
            `).join('')}
          </div>
        </div>

        <!-- 敵プリセット選択 -->
        <div>
          <div class="text-xs font-semibold text-gray-400 uppercase tracking-wide px-1 mb-0.5">敵プリセット</div>
          <select data-action="select-enemy"
                  class="w-full text-xs rounded-md border border-gray-200 bg-white px-2 py-1.5
                         focus:outline-none focus:ring-1 focus:ring-blue-400">
            <option value="">── 選択なし ──</option>
            ${groupsArr.map(([dim, enemies]) => `
              <optgroup label="ディメンション${dim}">
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
        <div class="rounded-md border border-gray-200 bg-gray-50 overflow-hidden">
          <div class="flex items-center justify-between px-2 py-1 border-b border-gray-200 bg-white">
            <span class="text-xs font-medium text-gray-600 truncate min-w-0">
              ${isManual ? '手動編集モード' : (selected ? selected.name : '──')}
            </span>
            <button data-action="toggle-edit"
                    class="shrink-0 ml-1 text-xs px-2 py-0.5 rounded border transition-colors
                           ${isManual
                             ? 'bg-amber-100 text-amber-700 border-amber-300 hover:bg-amber-200'
                             : 'bg-white text-gray-500 border-gray-200 hover:bg-gray-100'}">
              ${isManual ? '✎ 編集中' : '✎ 編集'}
            </button>
          </div>

          <div class="p-2 space-y-2">
            <!-- OD速度 / Dゲージ上限 -->
            <div class="grid grid-cols-2 gap-1.5">
              ${this.#numFieldHtml('od_rate',    'OD速度',       vals.od_rate,    isManual)}
              ${this.#numFieldHtml('max_d_rate', 'Dゲージ上限', vals.max_d_rate, isManual)}
            </div>

            <!-- 属性耐性 -->
            <div>
              <div class="text-xs text-gray-400 mb-1">属性耐性</div>
              <div class="grid grid-cols-3 gap-0.5">
                ${ELEMENTS.map(el => this.#elemHtml(el, vals.element[el.key] ?? 0, isManual)).join('')}
              </div>
            </div>
          </div>
        </div>

      </div>
    `;
  }

  #numFieldHtml(key, label, value, editable) {
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
        <span class="text-xs font-mono font-medium ${value !== 0 ? 'text-blue-700' : 'text-gray-500'}">${value}</span>
      </div>`;
  }

  #elemHtml(el, value, editable) {
    const colorCls = value < 0 ? 'text-red-600' : value > 0 ? 'text-blue-600' : 'text-gray-400';
    const iconHtml = el.icon
      ? `<img src="${resolveUiAssetUrl(el.icon)}" alt="${el.label}"
              class="w-4 h-4 object-contain" />`
      : `<span class="w-4 h-4 flex items-center justify-center text-xs text-gray-400 leading-none">${el.label}</span>`;

    if (editable) {
      return `
        <div class="flex flex-col items-center gap-0.5">
          ${iconHtml}
          <input type="number" data-edit-element="${el.key}" value="${value}"
                 class="text-xs rounded border border-gray-300 text-center px-0 py-0 w-full
                        focus:outline-none focus:ring-1 focus:ring-blue-400" />
        </div>`;
    }
    const display = value > 0 ? `+${value}` : String(value);
    return `
      <div class="flex flex-col items-center gap-0.5 py-0.5">
        ${iconHtml}
        <span class="text-xs font-mono ${colorCls}">${display}</span>
      </div>`;
  }
}
