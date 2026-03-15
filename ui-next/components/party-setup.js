import { resolveStyleImageUrl } from '../../src/ui/style-asset-url.js';
import { StylePickerController } from './style-picker.js';

function extractCharaName(style) {
  const raw = String(style?.chara ?? '');
  const jpPart = raw.split('—')[0].trim();
  return jpPart || (style?.chara_label ?? '');
}

/**
 * Party Setup パネル
 * - 6スロット（front 3 + back 3）
 * - 各スロットをクリックで Style Picker を開く
 * - スタイル選択後にサムネイル画像を表示
 */
export class PartySetupController {
  /** @type {Array<{styleId: number, style: object} | null>} */
  #slots = Array(6).fill(null);
  #root;
  #picker;
  #activeSlotIndex = null;

  constructor({ root, pickerOverlay, store }) {
    this.#root = root;

    this.#picker = new StylePickerController({
      overlay: pickerOverlay,
      styles: store.styles,
      onSelect: (style) => this.#onStyleSelected(style),
    });
  }

  mount() {
    this.#picker.mount();
    this.#render();
  }

  #render() {
    this.#root.innerHTML = `
      <div class="space-y-4 p-3">
        <div>
          <div class="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">前衛</div>
          <div class="grid grid-cols-3 gap-2" data-row="front">
            ${[0, 1, 2].map((i) => this.#slotHtml(i)).join('')}
          </div>
        </div>
        <div>
          <div class="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">後衛</div>
          <div class="grid grid-cols-3 gap-2" data-row="back">
            ${[3, 4, 5].map((i) => this.#slotHtml(i)).join('')}
          </div>
        </div>
      </div>
    `;

    this.#root.querySelectorAll('[data-slot-index]').forEach((el) => {
      el.addEventListener('click', () => {
        this.#activeSlotIndex = Number(el.dataset.slotIndex);
        this.#picker.open(this.#slots[this.#activeSlotIndex]?.style ?? null);
      });
    });
  }

  #slotHtml(index) {
    const slot = this.#slots[index];
    const imageUrl = slot ? resolveStyleImageUrl(slot.style) : '';
    const name = slot?.style?.name ?? null;
    const charaLabel = slot ? extractCharaName(slot.style) : null;

    return `
      <button data-slot-index="${index}"
              class="relative flex flex-col items-center rounded-xl border-2 border-dashed
                     border-gray-200 hover:border-blue-300 bg-white hover:bg-blue-50
                     transition-all cursor-pointer overflow-hidden group
                     ${slot ? 'border-solid border-gray-300' : ''}">
        ${imageUrl
          ? `<img src="${imageUrl}" alt="${name}"
                  class="w-full aspect-square object-cover" />`
          : `<div class="w-full aspect-square flex items-center justify-center
                        text-3xl text-gray-300 group-hover:text-blue-300 transition-colors">+</div>`
        }
        <div class="w-full px-1 py-1 bg-white border-t border-gray-100 min-h-[2.5rem]
                    flex flex-col items-center justify-center gap-0.5">
          ${name
            ? `<span class="text-xs font-medium text-gray-700 leading-tight text-center
                           line-clamp-1 w-full">${name}</span>
               <span class="text-xs text-gray-400 leading-none">${charaLabel}</span>`
            : `<span class="text-xs text-gray-400">未選択</span>`
          }
        </div>
        <span class="absolute top-1 left-1 bg-black/40 text-white text-xs font-bold
                     w-5 h-5 rounded-full flex items-center justify-center leading-none">
          ${index + 1}
        </span>
      </button>
    `;
  }

  #onStyleSelected(style) {
    if (this.#activeSlotIndex == null) return;
    this.#slots[this.#activeSlotIndex] = { styleId: style.id, style };
    this.#activeSlotIndex = null;
    this.#render();
  }
}
