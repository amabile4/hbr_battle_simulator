import { resolveStyleImageUrl, resolveStyleAssetUrl } from '../../src/ui/style-asset-url.js';

function extractCharaName(style) {
  const raw = String(style?.chara ?? '');
  const jpPart = raw.split('—')[0].trim();
  return jpPart || (style?.chara_label ?? '');
}

/** レアリティソート順（A→S→SS=SSR） */
const TIER_ORDER = { A: 0, S: 1, SS: 2, SSR: 2 };
function tierOrder(style) {
  return TIER_ORDER[style.tier] ?? 99;
}

/**
 * styles 配列を team でグループ化し、team 出現順を維持した Map を返す
 * 各グループ内は「キャラ昇順 → レアリティ昇順 → 実装順」でソートする
 */
function groupByTeam(styles) {
  const charaOrder = new Map();
  for (const style of styles) {
    if (!charaOrder.has(style.chara_label)) {
      charaOrder.set(style.chara_label, charaOrder.size);
    }
  }

  const map = new Map();
  for (const style of styles) {
    const team = style.team ?? '';
    if (!map.has(team)) map.set(team, []);
    map.get(team).push(style);
  }

  for (const arr of map.values()) {
    arr.sort((a, b) => {
      const charaDiff =
        (charaOrder.get(a.chara_label) ?? 999) -
        (charaOrder.get(b.chara_label) ?? 999);
      if (charaDiff !== 0) return charaDiff;
      const tierDiff = tierOrder(a) - tierOrder(b);
      if (tierDiff !== 0) return tierDiff;
      return 0;
    });
  }

  return map;
}

// ---- フィルタ定義 ----

const TIER_OPTIONS = ['A', 'S', 'SS', 'SSR'];

const ELEMENT_OPTIONS = [
  { value: '',        label: '無' },
  { value: 'Fire',    label: '火' },
  { value: 'Ice',     label: '氷' },
  { value: 'Thunder', label: '雷' },
  { value: 'Light',   label: '光' },
  { value: 'Dark',    label: '闇' },
];

const WEAPON_OPTIONS = [
  { value: 'Sword',       label: '剣' },
  { value: 'DoubleSword', label: '双剣' },
  { value: 'LargeSword',  label: '大剣' },
  { value: 'Lance',       label: '槍' },
  { value: 'Scythe',      label: '鎌' },
  { value: 'Cannon',      label: '砲' },
  { value: 'Gun',         label: '銃' },
  { value: 'Claw',        label: '爪' },
  { value: 'Shield',      label: '盾' },
  { value: 'Bike',        label: 'バイク' },
];

const ROLE_OPTIONS = [
  { value: 'Attacker', label: 'ATK' },
  { value: 'Blaster',  label: 'BLS' },
  { value: 'Breaker',  label: 'BRK' },
  { value: 'Buffer',   label: 'BUF' },
  { value: 'Debuffer', label: 'DEB' },
  { value: 'Defender', label: 'DEF' },
  { value: 'Healer',   label: 'HLR' },
  { value: 'Rider',    label: 'RDR' },
  { value: 'Admiral',  label: '司令' },
];

/** フィルタカテゴリ文字列 → #filters のキー */
const FILTER_KEY = { tier: 'tiers', weapon: 'weapons', element: 'elements', role: 'roles' };

function filterBarHtml() {
  const row = (label, btns) => `
    <div class="flex items-center gap-1.5">
      <span class="text-xs text-gray-400 shrink-0 w-7">${label}</span>
      <div class="flex gap-0.5 flex-wrap">${btns}</div>
    </div>`;
  const btn = (type, value, label) =>
    `<button data-filter-type="${type}" data-filter-value="${value}"
             class="text-xs px-1.5 py-0.5 rounded border border-gray-200
                    text-gray-500 hover:bg-gray-50 transition-colors leading-tight"
     >${label}</button>`;

  return `
    <div id="picker-filter-bar"
         class="px-3 py-2 border-b border-gray-100 shrink-0 flex flex-col gap-1">
      ${row('レア', TIER_OPTIONS.map((t) => btn('tier', t, t)).join(''))}
      ${row('属性', ELEMENT_OPTIONS.map((e) => btn('element', e.value, e.label)).join(''))}
      ${row('武器', WEAPON_OPTIONS.map((w) => btn('weapon', w.value, w.label)).join(''))}
      ${row('役割', ROLE_OPTIONS.map((r) => btn('role', r.value, r.label)).join(''))}
      <div class="flex justify-end">
        <button id="picker-reset-filters"
                class="text-xs text-gray-400 hover:text-gray-600 underline leading-none">
          フィルタ解除
        </button>
      </div>
    </div>
  `;
}

/**
 * 全画面 Style Picker
 * - overlay 要素に mount する
 * - open(currentStyle?, mode?) で表示、close() で非表示
 * - スタイル選択時に onSelect(style) を呼ぶ
 * - filter bar: tier / 属性 / 武器 / 役割（同一カテゴリ内 OR、カテゴリ間 AND）
 * - scroll 位置・filter 状態は open をまたいで保持する
 */
export class StylePickerController {
  #overlay;
  #styles;
  #onSelect;
  #showNames = false;
  #currentStyle = null;
  #mode = 'main'; // 'main' | 'support'
  #filters = { tiers: new Set(), weapons: new Set(), elements: new Set(), roles: new Set() };

  constructor({ overlay, styles, onSelect }) {
    this.#overlay = overlay;
    this.#styles = styles;
    this.#onSelect = onSelect;
  }

  mount() {
    this.#overlay.innerHTML = `
      <div id="picker-backdrop"
           class="fixed inset-0 bg-black/60 flex items-start justify-center pt-8 px-4 pb-4">
        <div class="bg-white rounded-2xl shadow-2xl w-full max-w-6xl max-h-[90vh] flex flex-col">
          <header class="flex items-center gap-3 px-4 py-2.5 border-b border-gray-200 shrink-0">
            <span id="picker-mode-label" class="font-semibold text-gray-800 text-sm">スタイルを選ぶ</span>
            <span id="picker-count" class="text-xs text-gray-400"></span>
            <div class="ml-auto flex items-center gap-2">
              <button id="picker-toggle-names"
                      class="text-xs px-2.5 py-1 rounded-md border border-gray-200
                             text-gray-500 hover:bg-gray-50 transition-colors">
                名前を表示
              </button>
              <button id="picker-close"
                      class="text-gray-400 hover:text-gray-700 text-lg leading-none px-1.5">✕</button>
            </div>
          </header>
          ${filterBarHtml()}
          <div id="picker-body" class="overflow-y-auto p-3 flex flex-col gap-3"></div>
        </div>
      </div>
    `;

    this.#overlay.querySelector('#picker-close').addEventListener('click', () => this.close());
    this.#overlay.querySelector('#picker-backdrop').addEventListener('click', (e) => {
      if (e.target === e.currentTarget) this.close();
    });

    this.#overlay.querySelector('#picker-toggle-names').addEventListener('click', () => {
      this.#showNames = !this.#showNames;
      const btn = this.#overlay.querySelector('#picker-toggle-names');
      btn.textContent = this.#showNames ? '名前を隠す' : '名前を表示';
      btn.classList.toggle('bg-blue-50', this.#showNames);
      btn.classList.toggle('border-blue-300', this.#showNames);
      btn.classList.toggle('text-blue-600', this.#showNames);
      this.#renderBody();
    });

    // フィルタボタン
    this.#overlay.querySelectorAll('[data-filter-type]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const set = this.#filters[FILTER_KEY[btn.dataset.filterType]];
        const val = btn.dataset.filterValue;
        if (set.has(val)) set.delete(val); else set.add(val);
        this.#syncFilterButtons();
        this.#renderBody();
      });
    });

    // フィルタ解除
    this.#overlay.querySelector('#picker-reset-filters').addEventListener('click', () => {
      Object.values(this.#filters).forEach((s) => s.clear());
      this.#syncFilterButtons();
      this.#renderBody();
    });
  }

  open(currentStyle = null, mode = 'main') {
    this.#currentStyle = currentStyle;
    this.#mode = mode;
    const modeLabel = this.#overlay.querySelector('#picker-mode-label');
    if (modeLabel) {
      modeLabel.textContent = mode === 'support' ? 'サポートスタイルを選ぶ' : 'メインスタイルを選ぶ';
    }
    this.#renderBody();
    this.#overlay.classList.remove('hidden');
  }

  close() {
    this.#overlay.classList.add('hidden');
  }

  // ---- private ----

  #filteredStyles() {
    const { tiers, weapons, elements, roles } = this.#filters;
    return this.#styles.filter((style) => {
      if (tiers.size > 0 && !tiers.has(style.tier)) return false;
      if (weapons.size > 0 && !weapons.has(style.weapon?.type)) return false;
      if (elements.size > 0) {
        const els = style.elements ?? [];
        const match = [...elements].some((e) => (e === '' ? els.length === 0 : els.includes(e)));
        if (!match) return false;
      }
      if (roles.size > 0 && !roles.has(style.role)) return false;
      return true;
    });
  }

  #syncFilterButtons() {
    this.#overlay.querySelectorAll('[data-filter-type]').forEach((btn) => {
      const set = this.#filters[FILTER_KEY[btn.dataset.filterType]];
      const active = set.has(btn.dataset.filterValue);
      btn.classList.toggle('border-blue-400', active);
      btn.classList.toggle('bg-blue-50', active);
      btn.classList.toggle('text-blue-600', active);
      btn.classList.toggle('border-gray-200', !active);
      btn.classList.toggle('text-gray-500', !active);
    });
  }

  #renderBody() {
    const body = this.#overlay.querySelector('#picker-body');
    const count = this.#overlay.querySelector('#picker-count');
    const prevScrollTop = body?.scrollTop ?? 0;
    const selectedId = this.#currentStyle?.id ?? null;

    const filtered = this.#filteredStyles();
    if (count) count.textContent = `${filtered.length} / ${this.#styles.length} 件`;

    const iconSize = this.#showNames ? 'w-14 h-14' : 'w-11 h-11';
    const minColWidth = this.#showNames ? '64px' : '50px';

    const grouped = groupByTeam(filtered);
    const sections = [];

    for (const [team, styles] of grouped) {
      const firstStyle = styles[0];
      const charaIconUrl = firstStyle?.chara_icon
        ? resolveStyleAssetUrl(firstStyle.chara_icon)
        : '';

      const cards = styles.map((style) => {
        const imageUrl = resolveStyleImageUrl(style);
        const isSelected = style.id === selectedId;
        const ringClass = isSelected
          ? 'ring-2 ring-blue-500 bg-blue-50'
          : 'hover:ring-1 hover:ring-blue-300 hover:bg-blue-50';
        const charaName = extractCharaName(style);
        const titleAttr = `[${style.name}] ${charaName}`;

        const nameHtml = this.#showNames
          ? `<span class="text-gray-500 text-center w-full block px-0.5"
                 style="font-size:9px;line-height:1.3;display:-webkit-box;
                        -webkit-box-orient:vertical;-webkit-line-clamp:2;
                        overflow:hidden;word-break:break-all">${style.name}</span>`
          : '';

        return `
          <button data-style-id="${style.id}" title="${titleAttr}"
                  class="flex flex-col items-center rounded-lg p-0.5 cursor-pointer
                         transition-all shrink-0 ${ringClass}">
            ${imageUrl
              ? `<img src="${imageUrl}" alt=""
                      class="${iconSize} object-cover rounded-md bg-gray-100 block" loading="lazy" />`
              : `<div class="${iconSize} rounded-md bg-gray-100 flex items-center justify-center
                            text-gray-300 text-lg">?</div>`
            }
            ${nameHtml}
          </button>
        `;
      }).join('');

      sections.push(`
        <div class="team-section">
          <div class="flex items-center gap-2 mb-1.5">
            ${charaIconUrl
              ? `<img src="${charaIconUrl}" alt="${team}"
                      class="w-5 h-5 rounded-full object-cover bg-gray-100 shrink-0" />`
              : ''
            }
            <span class="text-xs font-bold text-gray-400 tracking-wide">${team}</span>
            <div class="flex-1 border-t border-gray-100"></div>
          </div>
          <div class="grid"
               style="grid-template-columns: repeat(auto-fill, minmax(${minColWidth}, 1fr))">
            ${cards}
          </div>
        </div>
      `);
    }

    body.innerHTML = sections.join('');
    body.scrollTop = prevScrollTop;

    body.querySelectorAll('[data-style-id]').forEach((el) => {
      el.addEventListener('click', () => {
        const styleId = Number(el.dataset.styleId);
        const style = this.#styles.find((s) => s.id === styleId);
        if (style) {
          this.#onSelect(style);
          this.close();
        }
      });
    });
  }
}
