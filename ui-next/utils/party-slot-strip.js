import { resolveStyleImageUrl } from '../../src/ui/style-asset-url.js';

export const PARTY_SLOT_COUNT = 6;
export const PARTY_SLOT_ROW_MODES = Object.freeze({
  MAIN: 'main',
  SUPPORT: 'support',
});

const STRIP_VARIANTS = Object.freeze({
  picker: Object.freeze({
    interactive: true,
    wrapperClass: 'flex flex-col gap-1 px-2 py-1.5',
    rowClass: 'flex items-center gap-1',
    labelClass: 'text-xs text-gray-400 font-bold shrink-0 leading-none',
    labelWidth: '14px',
    dividerClass: 'w-px h-5 bg-gray-300 mx-0.5 shrink-0',
    baseCellClass:
      'w-10 h-10 rounded overflow-hidden shrink-0 bg-gray-100 flex items-center justify-center',
    placeholderClass: 'text-xs font-bold',
    activeRingClass: 'ring-2 ring-red-500',
    glowRingClass: 'ring-2 ring-purple-400 hover:ring-purple-300 transition-all',
    defaultRingClass: 'ring-1 ring-gray-200 hover:ring-2 hover:ring-blue-300 transition-all',
    disabledClass: 'opacity-30 cursor-not-allowed',
    enabledClass: 'cursor-pointer',
  }),
  presetPreview: Object.freeze({
    interactive: false,
    wrapperClass: 'flex flex-col gap-1',
    rowClass: 'flex items-center gap-1',
    labelClass: 'text-[10px] text-gray-400 font-bold shrink-0 leading-none',
    labelWidth: '12px',
    dividerClass: 'w-px h-4 bg-gray-300 mx-0.5 shrink-0',
    baseCellClass:
      'w-7 h-7 rounded-md overflow-hidden shrink-0 bg-gray-100 flex items-center justify-center',
    placeholderClass: 'text-[10px] font-bold',
    activeRingClass: 'ring-2 ring-red-500',
    glowRingClass: 'ring-1 ring-purple-300',
    defaultRingClass: 'ring-1 ring-gray-200',
    disabledClass: 'opacity-30',
    enabledClass: '',
  }),
});

function normalizeVariant(variant) {
  return STRIP_VARIANTS[variant] ?? STRIP_VARIANTS.picker;
}

function renderStripCell({
  slot,
  slotIndex,
  rowMode,
  activeSlotIndex,
  activeMode,
  variantConfig,
}) {
  const style = rowMode === PARTY_SLOT_ROW_MODES.MAIN ? slot?.style : slot?.supportStyle;
  const imageUrl = style ? resolveStyleImageUrl(style) : '';
  const isActive = slotIndex === activeSlotIndex && rowMode === activeMode;
  const supportUnavailable =
    rowMode === PARTY_SLOT_ROW_MODES.SUPPORT && !(slot?.style?.tier === 'SS' || slot?.style?.tier === 'SSR');

  const ssrGlow =
    rowMode === PARTY_SLOT_ROW_MODES.MAIN
      ? slot?.style?.tier === 'SSR'
      : slot?.style?.tier === 'SSR' && Boolean(slot?.supportStyle?.resonance);

  const ringClass = isActive
    ? variantConfig.activeRingClass
    : ssrGlow
    ? variantConfig.glowRingClass
    : variantConfig.defaultRingClass;
  const stateClass = supportUnavailable ? variantConfig.disabledClass : variantConfig.enabledClass;
  const placeholderClass = `${variantConfig.placeholderClass} ${
    isActive ? 'text-red-500' : 'text-gray-300'
  }`;
  const commonClass = `${variantConfig.baseCellClass} ${ringClass} ${stateClass}`.trim();

  if (variantConfig.interactive) {
    return `
      <button data-strip-slot="${slotIndex}" data-strip-mode="${rowMode}"
              ${supportUnavailable ? 'disabled' : ''}
              title="スロット${slotIndex + 1} ${rowMode === PARTY_SLOT_ROW_MODES.MAIN ? 'メイン' : 'サポート'}${isActive ? '（編集中）' : ''}"
              class="${commonClass}">
        ${
          imageUrl
            ? `<img src="${imageUrl}" alt="" class="w-full h-full object-cover" />`
            : `<span class="${placeholderClass}">${slotIndex + 1}</span>`
        }
      </button>
    `;
  }

  return `
    <div class="${commonClass}">
      ${
        imageUrl
          ? `<img src="${imageUrl}" alt="" class="w-full h-full object-cover" />`
          : `<span class="${placeholderClass}">${slotIndex + 1}</span>`
      }
    </div>
  `;
}

function renderStripRow({
  slots,
  rowMode,
  labelText,
  activeSlotIndex,
  activeMode,
  variantConfig,
}) {
  return `
    <div class="${variantConfig.rowClass}">
      <span class="${variantConfig.labelClass}" style="width:${variantConfig.labelWidth}">${labelText}</span>
      ${slots.slice(0, 3).map((slot, index) => renderStripCell({
        slot,
        slotIndex: index,
        rowMode,
        activeSlotIndex,
        activeMode,
        variantConfig,
      })).join('')}
      <div class="${variantConfig.dividerClass}"></div>
      ${slots.slice(3, PARTY_SLOT_COUNT).map((slot, index) => renderStripCell({
        slot,
        slotIndex: index + 3,
        rowMode,
        activeSlotIndex,
        activeMode,
        variantConfig,
      })).join('')}
    </div>
  `;
}

export function createEmptyPartySlots() {
  return Array.from({ length: PARTY_SLOT_COUNT }, () => ({
    style: null,
    supportStyle: null,
  }));
}

export function renderPartySlotStrip({
  slots = createEmptyPartySlots(),
  activeSlotIndex = null,
  activeMode = null,
  variant = 'picker',
} = {}) {
  const normalizedSlots = Array.from({ length: PARTY_SLOT_COUNT }, (_, index) => ({
    style: slots?.[index]?.style ?? null,
    supportStyle: slots?.[index]?.supportStyle ?? null,
  }));
  const variantConfig = normalizeVariant(variant);

  return `
    <div data-role="party-slot-strip" data-variant="${variant}" class="${variantConfig.wrapperClass}">
      ${renderStripRow({
        slots: normalizedSlots,
        rowMode: PARTY_SLOT_ROW_MODES.MAIN,
        labelText: 'M',
        activeSlotIndex,
        activeMode,
        variantConfig,
      })}
      ${renderStripRow({
        slots: normalizedSlots,
        rowMode: PARTY_SLOT_ROW_MODES.SUPPORT,
        labelText: 'S',
        activeSlotIndex,
        activeMode,
        variantConfig,
      })}
    </div>
  `;
}
