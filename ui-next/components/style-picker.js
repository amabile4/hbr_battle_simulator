import { resolveStyleImageUrl, resolveStyleAssetUrl } from '../../src/ui/style-asset-url.js';

/**
 * chara フィールド（例: "茅森 月歌 — Ruka Kayamori — "）から日本語名を抽出する
 */
function extractCharaName(style) {
  const raw = String(style?.chara ?? '');
  const jpPart = raw.split('—')[0].trim();
  return jpPart || (style?.chara_label ?? '');
}

/** レアリティソート用の優先順位（A→S→SS=SSR、低いほど先） */
const TIER_ORDER = { A: 0, S: 1, SS: 2, SSR: 2 };
function tierOrder(style) {
  return TIER_ORDER[style.tier] ?? 99;
}

/**
 * styles 配列を team（"31A" 等）でグループ化し、team の出現順を維持した Map を返す
 * 各グループ内は「キャラ昇順 → レアリティ昇順(A→S→SS/SSR) → 実装順」でソートする
 * キャラ順は styles 配列内での chara_label 初回出現インデックスを使う
 */
function groupByTeam(styles) {
  // chara_label の初回出現順を記録（styles 配列の並び順 = 実装登場順）
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
      return 0; // 同レア内は元の配列順（stable sort）
    });
  }

  return map;
}

/**
 * 全画面 Style Picker
 * - overlay 要素に mount する
 * - open(currentStyle?) で表示、close() で非表示
 * - スタイル選択時に onSelect(style) を呼ぶ
 * - team ごとに区切りラベル行を挿入し、アイコン高密度グリッドで表示
 */
export class StylePickerController {
  #overlay;
  #styles;
  #onSelect;
  #showNames = false;
  #currentStyle = null;

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
            <span class="font-semibold text-gray-800 text-sm">スタイルを選ぶ</span>
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
      this.#renderBody(this.#currentStyle);
    });
  }

  open(currentStyle = null) {
    this.#currentStyle = currentStyle;
    this.#renderBody(currentStyle);
    this.#overlay.classList.remove('hidden');
  }

  close() {
    this.#overlay.classList.add('hidden');
  }

  #renderBody(currentStyle) {
    const body = this.#overlay.querySelector('#picker-body');
    const count = this.#overlay.querySelector('#picker-count');
    const selectedId = currentStyle?.id ?? null;

    if (count) count.textContent = `${this.#styles.length} 件`;

    const iconSize = this.#showNames ? 'w-14 h-14' : 'w-11 h-11';
    const minColWidth = this.#showNames ? '64px' : '50px';

    const grouped = groupByTeam(this.#styles);
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
