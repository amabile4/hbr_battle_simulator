import { resolveStyleImageUrl } from '../../src/ui/style-asset-url.js';
import { DRIVE_PIERCE_OPTIONS } from '../../src/config/battle-defaults.js';
import { StylePickerController } from './style-picker.js';

// tier ごとの LB 上限（hbr-data-store.js の LIMIT_BREAK_MAX_BY_TIER と同値）
const LB_MAX = { A: 20, S: 10, SS: 4, SSR: 4 };

const BELT_OPTIONS = [
  { value: '', label: 'ベルトなし' },
  { value: 'Fire',    label: '火' },
  { value: 'Ice',     label: '氷' },
  { value: 'Thunder', label: '雷' },
  { value: 'Light',   label: '光' },
  { value: 'Dark',    label: '闇' },
];

const SP_EQUIP_OPTIONS = [
  { value: '', label: 'SP装備なし' },
  { value: '1', label: 'SP +1' },
  { value: '2', label: 'SP +2' },
  { value: '3', label: 'SP +3' },
];

const MORALE_OPTIONS = [
  { value: 'normal', label: '標準' },
];

function extractCharaName(style) {
  const raw = String(style?.chara ?? '');
  const jpPart = raw.split('—')[0].trim();
  return jpPart || (style?.chara_label ?? '');
}

function makeLbOptions(style) {
  if (!style) return [{ value: 0, label: '限突 0' }];
  const max = LB_MAX[style.tier] ?? 0;
  return Array.from({ length: max + 1 }, (_, i) => ({ value: i, label: `限突 ${i}` }));
}

function hasMoralePassive(style) {
  return (
    style?.passives?.some(
      (p) => p.label?.includes('Morale') || p.label?.includes('Motivation')
    ) ?? false
  );
}

function selectHtml(dataField, slotIndex, options, currentValue, cls = '') {
  return `
    <select data-field="${dataField}" data-slot-index="${slotIndex}"
            class="w-full text-xs bg-white border border-gray-200 rounded
                   px-1 py-0.5 leading-tight text-gray-700
                   focus:outline-none focus:ring-1 focus:ring-blue-300 ${cls}">
      ${options.map(o =>
        `<option value="${o.value}"${String(o.value) === String(currentValue) ? ' selected' : ''}>${o.label}</option>`
      ).join('')}
    </select>
  `;
}

/**
 * Party Setup パネル
 * - 6スロット（front 3 + back 3）
 * - 各スロット: main icon → listbox 群（LB/DP/SP装備/属性ベルト/やる気）→ support icon
 * - main/support icon クリックで Style Picker を開く
 */
export class PartySetupController {
  #slots;
  #root;
  #picker;
  #activeSlotIndex = null;
  #activeMode = 'main'; // 'main' | 'support'

  constructor({ root, pickerOverlay, store }) {
    this.#root = root;

    this.#slots = Array.from({ length: 6 }, () => ({
      styleId: null,
      style: null,
      lb: 0,
      drivePierce: 0,
      spEquipId: '',
      belt: '',
      morale: 'normal',
    }));

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
      <div class="p-2 space-y-2">
        <div>
          <div class="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1 px-1">前衛</div>
          <div class="grid grid-cols-3 gap-1">
            ${[0, 1, 2].map((i) => this.#slotHtml(i)).join('')}
          </div>
        </div>
        <div>
          <div class="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1 px-1">後衛</div>
          <div class="grid grid-cols-3 gap-1">
            ${[3, 4, 5].map((i) => this.#slotHtml(i)).join('')}
          </div>
        </div>
      </div>
    `;

    // main / support アイコンのクリック
    this.#root.querySelectorAll('[data-action="open-picker"]').forEach((el) => {
      el.addEventListener('click', () => {
        this.#activeSlotIndex = Number(el.dataset.slotIndex);
        this.#activeMode = el.dataset.mode;
        const current =
          this.#activeMode === 'main'
            ? (this.#slots[this.#activeSlotIndex]?.style ?? null)
            : null; // support は T08 で実装
        this.#picker.open(current);
      });
    });

    // listbox 変更
    this.#root.querySelectorAll('select[data-field]').forEach((el) => {
      el.addEventListener('change', () => {
        const idx = Number(el.dataset.slotIndex);
        const field = el.dataset.field;
        const val = el.value;
        if (field === 'lb') this.#slots[idx].lb = Number(val);
        else if (field === 'drivePierce') this.#slots[idx].drivePierce = Number(val);
        else if (field === 'spEquip') this.#slots[idx].spEquipId = val;
        else if (field === 'belt') this.#slots[idx].belt = val;
        else if (field === 'morale') this.#slots[idx].morale = val;
      });
    });
  }

  #slotHtml(index) {
    const slot = this.#slots[index];
    const style = slot.style;
    const imageUrl = style ? resolveStyleImageUrl(style) : '';
    const charaName = style ? extractCharaName(style) : null;
    const lbOptions = makeLbOptions(style);
    const moraleVisible = hasMoralePassive(style);

    return `
      <div class="flex flex-col rounded-lg border border-gray-200 bg-white overflow-hidden
                  text-xs shadow-sm">

        <!-- スロット番号 -->
        <div class="flex items-center justify-center bg-gray-50 border-b border-gray-100
                    py-0.5 text-gray-400 font-bold text-xs">${index + 1}</div>

        <!-- main icon -->
        <button data-action="open-picker" data-slot-index="${index}" data-mode="main"
                class="relative w-full aspect-square bg-gray-100 hover:opacity-80
                       transition-opacity cursor-pointer overflow-hidden group">
          ${imageUrl
            ? `<img src="${imageUrl}" alt="${style?.name ?? ''}"
                    class="w-full h-full object-cover" />`
            : `<div class="w-full h-full flex items-center justify-center
                          text-gray-300 text-2xl group-hover:text-blue-300 transition-colors">＋</div>`
          }
          ${charaName
            ? `<div class="absolute bottom-0 left-0 right-0 bg-black/50 text-white
                          text-center leading-tight px-0.5 py-0.5"
                    style="font-size:8px">${charaName}</div>`
            : ''
          }
        </button>

        <!-- listbox 群 -->
        <div class="flex flex-col gap-px px-1 py-1 bg-gray-50 border-y border-gray-100">
          ${selectHtml('lb', index, lbOptions, slot.lb)}
          ${selectHtml('drivePierce', index,
            DRIVE_PIERCE_OPTIONS.map(o => ({ value: o.value, label: o.label.replace('ドライブピアスなし', 'DPなし').replace('ドライブピアス +', 'DP +') })),
            slot.drivePierce
          )}
          ${selectHtml('spEquip', index, SP_EQUIP_OPTIONS, slot.spEquipId)}
          ${selectHtml('belt', index, BELT_OPTIONS, slot.belt)}
          ${moraleVisible ? selectHtml('morale', index, MORALE_OPTIONS, slot.morale) : ''}
        </div>

        <!-- support icon -->
        <button data-action="open-picker" data-slot-index="${index}" data-mode="support"
                class="w-full aspect-square bg-gray-50 hover:bg-blue-50
                       transition-colors cursor-pointer flex items-center justify-center
                       border-t border-gray-100 group">
          <div class="text-gray-300 text-xs group-hover:text-blue-300 transition-colors
                      flex flex-col items-center gap-0.5">
            <span class="text-lg leading-none">＋</span>
            <span style="font-size:8px">SUP</span>
          </div>
        </button>

      </div>
    `;
  }

  #onStyleSelected(style) {
    if (this.#activeSlotIndex == null) return;
    const slot = this.#slots[this.#activeSlotIndex];
    if (this.#activeMode === 'main') {
      slot.styleId = style.id;
      slot.style = style;
      slot.lb = 0; // style 変更時に LB をリセット
    }
    this.#activeSlotIndex = null;
    this.#render();
  }
}
