import { resolveStyleImageUrl } from '../../src/ui/style-asset-url.js';
import { DRIVE_PIERCE_OPTIONS } from '../../src/config/battle-defaults.js';
import { StylePickerController } from './style-picker.js';
import { SkillFilterPanel } from './skill-filter-panel.js';
import { clearFilterForStyle } from '../utils/skill-filter.js';

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

const PRESET_STORAGE_KEY = 'hbr.ui_next.party_presets.v1';
const PRESET_COUNT = 3;

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
  return style?.passives?.some((p) => p.label?.includes('Motivation')) ?? false;
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
 * - 重複排除ルール:
 *   - メイン同士: 同一キャラクター不可 → 既存をクリア
 *   - メイン↔サポート / サポート同士: 同一スタイル不可 → 既存をクリア
 */
export class PartySetupController {
  #slots;
  #root;
  #store;
  #picker;
  #filterPanel;
  #onChange;
  #activeSlotIndex = null;
  #activeMode = 'main'; // 'main' | 'support'
  #dragSrcIndex = null;
  #presetExpanded = false;

  constructor({ root, pickerOverlay, store, onChange = null }) {
    this.#onChange = onChange;
    this.#root = root;
    this.#store = store;

    this.#slots = Array.from({ length: 6 }, () => ({
      styleId: null,
      style: null,
      supportStyleId: null,
      supportStyle: null,
      lb: 0,
      supportLb: 0,
      drivePierce: 0,
      spEquipId: '',
      belt: '',
      morale: 'normal',
    }));

    this.#picker = new StylePickerController({
      overlay: pickerOverlay,
      styles: store.styles,
      store: store,
      onSelect: (style) => this.#onStyleSelected(style),
      onSlotSwitch: (slotIndex, mode) => {
        this.#activeSlotIndex = slotIndex;
        this.#activeMode = mode;
        const slot = this.#slots[slotIndex];
        const current =
          mode === 'main' ? (slot.style ?? null) : (slot.supportStyle ?? null);
        const mainStyle = mode === 'support' ? (slot.style ?? null) : null;
        this.#picker.open(current, mode, mainStyle, this.#getPartyContext());
      },
    });
  }

  mount() {
    this.#picker.mount();
    this.#filterPanel = new SkillFilterPanel({ store: this.#store });
    this.#filterPanel.mount(document.body);
    this.#render();
  }

  // ---- public ----

  /**
   * 現在のスロット状態のスナップショットを返す。
   * null 含む 6 要素の raw 状態（左詰めは BattleStateManager が行う）。
   * @returns {{ isFrontFilled: boolean, styleIds: (number|null)[], ... }}
   */
  getSnapshot() {
    const styleIds = this.#slots.map((s) => s.styleId ?? null);
    const isFrontFilled = styleIds.slice(0, 3).every((id) => id !== null);
    return {
      isFrontFilled,
      styleIds,
      supportStyleIds: this.#slots.map((s) => s.supportStyleId ?? null),
      limitBreakLevelsByPartyIndex: Object.fromEntries(
        this.#slots.map((s, i) => [i, s.lb])
      ),
      supportLimitBreakLevelsByPartyIndex: Object.fromEntries(
        this.#slots.map((s, i) => [i, s.supportLb ?? 0])
      ),
      drivePierceByPartyIndex: Object.fromEntries(
        this.#slots.map((s, i) => [i, s.drivePierce])
      ),
      // '' = SP装備なし → bonus 0、'1'/'2'/'3' → 数値変換
      startSpEquipByPartyIndex: Object.fromEntries(
        this.#slots.map((s, i) => [i, s.spEquipId === '' ? 0 : Number(s.spEquipId)])
      ),
    };
  }

  // ---- private ----

  // ---- preset ----

  #readPresets() {
    try {
      const raw = localStorage.getItem(PRESET_STORAGE_KEY);
      if (!raw) return Array(PRESET_COUNT).fill(null);
      const parsed = JSON.parse(raw);
      return Array.from({ length: PRESET_COUNT }, (_, i) => parsed[i] ?? null);
    } catch {
      return Array(PRESET_COUNT).fill(null);
    }
  }

  #writePresets(presets) {
    try {
      localStorage.setItem(PRESET_STORAGE_KEY, JSON.stringify(presets));
    } catch (e) {
      console.warn('PartySetupController: failed to save presets', e);
    }
  }

  #makePresetLabel() {
    const names = this.#slots
      .slice(0, 3)
      .filter((s) => s.style)
      .map((s) => extractCharaName(s.style));
    return names.length > 0 ? names.join('・') : '（空）';
  }

  #savePreset(index) {
    const presets = this.#readPresets();
    presets[index] = {
      label: this.#makePresetLabel(),
      savedAt: new Date().toISOString(),
      slots: this.#slots.map((s) => ({
        styleId: s.styleId ?? null,
        supportStyleId: s.supportStyleId ?? null,
        lb: s.lb,
        supportLb: s.supportLb ?? 0,
        drivePierce: s.drivePierce,
        spEquipId: s.spEquipId,
        belt: s.belt,
        morale: s.morale,
      })),
    };
    this.#writePresets(presets);
    this.#render();
  }

  #loadPreset(index) {
    const preset = this.#readPresets()[index];
    if (!preset) return;
    this.#slots = preset.slots.map((s) => {
      const style = s.styleId ? (this.#store.getStyleById(s.styleId) ?? null) : null;
      const supportStyle = s.supportStyleId ? (this.#store.getStyleById(s.supportStyleId) ?? null) : null;
      return {
        styleId: style ? s.styleId : null,
        style,
        supportStyleId: supportStyle ? s.supportStyleId : null,
        supportStyle,
        lb: s.lb ?? 0,
        supportLb: s.supportLb ?? 0,
        drivePierce: s.drivePierce ?? 0,
        spEquipId: s.spEquipId ?? '',
        belt: s.belt ?? '',
        morale: s.morale ?? 'normal',
      };
    });
    this.#render();
    this.#notifyChange();
  }

  // ---- /preset ----

  #notifyChange() {
    this.#onChange?.(this.getSnapshot());
  }

  #getPartyContext() {
    return {
      slots: this.#slots.map((s) => ({ style: s.style, supportStyle: s.supportStyle })),
      slotIndex: this.#activeSlotIndex ?? 0,
      mode: this.#activeMode,
    };
  }

  /**
   * 連続選択での次の空きスロットを返す
   * - main モード中: 残りのメイン空きスロット → なければサポート空きスロット（スロット0から）
   * - support モード中: 残りのサポート空きスロットのみ
   * @returns {{ slotIndex: number, mode: string } | null}
   */
  #findNextEmptySlot() {
    const start = (this.#activeSlotIndex ?? 0) + 1;

    if (this.#activeMode === 'main') {
      // まずメインの残り空きを探す
      for (let i = start; i < 6; i++) {
        if (!this.#slots[i].style) return { slotIndex: i, mode: 'main' };
      }
      // メインが埋まったらサポートの空き（スロット0から）を探す
      for (let i = 0; i < 6; i++) {
        const slot = this.#slots[i];
        const enabled = slot.style?.tier === 'SS' || slot.style?.tier === 'SSR';
        if (enabled && !slot.supportStyle) return { slotIndex: i, mode: 'support' };
      }
    } else {
      // support モード: 残りのサポート空きスロットのみ
      for (let i = start; i < 6; i++) {
        const slot = this.#slots[i];
        const enabled = slot.style?.tier === 'SS' || slot.style?.tier === 'SSR';
        if (enabled && !slot.supportStyle) return { slotIndex: i, mode: 'support' };
      }
    }

    return null;
  }

  #render() {
    // やる気パッシブ持ちが1人でもいれば全スロットにやる気 select を表示
    const moraleVisible = this.#slots.some((s) => hasMoralePassive(s.style));
    const presets = this.#readPresets();

    this.#root.innerHTML = `
      <div class="p-2 space-y-2">
        <!-- プリセット（折りたたみ） -->
        <div class="border border-gray-100 rounded">
          <button data-action="toggle-preset"
                  class="w-full flex items-center gap-1 px-2 py-1 text-xs text-gray-400
                         hover:text-gray-600 hover:bg-gray-50 transition-colors select-none">
            <span>${this.#presetExpanded ? '▼' : '▶'}</span>
            <span class="font-semibold uppercase tracking-wide">プリセット</span>
            ${!this.#presetExpanded ? `<span class="ml-auto flex gap-1">
              ${presets.map((p, i) => `<span class="w-2 h-2 rounded-full ${p ? 'bg-blue-400' : 'bg-gray-200'}"></span>`).join('')}
            </span>` : ''}
          </button>
          ${this.#presetExpanded ? `
            <div class="flex gap-1 px-1.5 pb-1.5">
              ${presets.map((p, i) => `
                <div class="flex items-center gap-0.5 flex-1">
                  <span class="text-xs font-bold text-gray-300 w-3 text-center leading-none">${i + 1}</span>
                  <button data-action="save-preset" data-preset-index="${i}"
                          class="flex-1 text-xs py-0.5 rounded bg-gray-100 text-gray-500
                                 border border-gray-200 hover:bg-gray-200 transition-colors
                                 leading-none">保</button>
                  <button data-action="load-preset" data-preset-index="${i}"
                          ${!p ? 'disabled' : ''}
                          class="flex-1 text-xs py-0.5 rounded bg-blue-50 text-blue-600
                                 border border-blue-200 hover:bg-blue-100 transition-colors
                                 disabled:opacity-30 disabled:cursor-not-allowed
                                 leading-none">読</button>
                </div>
              `).join('')}
            </div>
          ` : ''}
        </div>
        <!-- 前衛 -->
        <div>
          <div class="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1 px-1">前衛</div>
          <div class="grid grid-cols-3 gap-1">
            ${[0, 1, 2].map((i) => this.#slotHtml(i, moraleVisible)).join('')}
          </div>
        </div>
        <!-- 後衛 -->
        <div>
          <div class="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1 px-1">後衛</div>
          <div class="grid grid-cols-3 gap-1">
            ${[3, 4, 5].map((i) => this.#slotHtml(i, moraleVisible)).join('')}
          </div>
        </div>
      </div>
    `;

    // main / support アイコンのクリック
    this.#root.querySelectorAll('[data-action="open-picker"]').forEach((el) => {
      el.addEventListener('click', () => {
        this.#activeSlotIndex = Number(el.dataset.slotIndex);
        this.#activeMode = el.dataset.mode;
        const slot = this.#slots[this.#activeSlotIndex];
        const current =
          this.#activeMode === 'main'
            ? (slot?.style ?? null)
            : (slot?.supportStyle ?? null);
        const mainStyle = this.#activeMode === 'support' ? (slot?.style ?? null) : null;
        this.#picker.open(current, this.#activeMode, mainStyle, this.#getPartyContext());
      });
    });

    // listbox 変更
    this.#root.querySelectorAll('select[data-field]').forEach((el) => {
      el.addEventListener('change', () => {
        const idx = Number(el.dataset.slotIndex);
        const field = el.dataset.field;
        const val = el.value;
        if (field === 'lb') this.#slots[idx].lb = Number(val);
        else if (field === 'supportLb') this.#slots[idx].supportLb = Number(val);
        else if (field === 'drivePierce') this.#slots[idx].drivePierce = Number(val);
        else if (field === 'spEquip') this.#slots[idx].spEquipId = val;
        else if (field === 'belt') this.#slots[idx].belt = val;
        else if (field === 'morale') this.#slots[idx].morale = val;
        this.#notifyChange();
      });
    });

    // プリセット折りたたみトグル
    this.#root.querySelector('[data-action="toggle-preset"]')?.addEventListener('click', () => {
      this.#presetExpanded = !this.#presetExpanded;
      this.#render();
    });

    // プリセット保存・読込
    this.#root.querySelectorAll('[data-action="save-preset"]').forEach((el) => {
      el.addEventListener('click', () => this.#savePreset(Number(el.dataset.presetIndex)));
    });
    this.#root.querySelectorAll('[data-action="load-preset"]').forEach((el) => {
      el.addEventListener('click', () => this.#loadPreset(Number(el.dataset.presetIndex)));
    });

    // スキル絞込ボタン
    this.#root.querySelectorAll('[data-action="open-filter"]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const idx = Number(btn.dataset.slotIndex);
        const style = this.#slots[idx]?.style;
        if (style) this.#filterPanel.open(style, btn);
      });
    });

    // D&D によるスロット入れ替え
    this.#root.querySelectorAll('[data-slot]').forEach((el) => {
      el.addEventListener('dragstart', (e) => {
        this.#dragSrcIndex = Number(el.dataset.slot);
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', '');
        requestAnimationFrame(() => el.classList.add('opacity-40'));
      });

      el.addEventListener('dragend', () => {
        el.classList.remove('opacity-40');
        this.#dragSrcIndex = null;
      });

      el.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
      });

      el.addEventListener('dragenter', (e) => {
        e.preventDefault();
        if (this.#dragSrcIndex !== null && this.#dragSrcIndex !== Number(el.dataset.slot)) {
          el.classList.add('ring-2', 'ring-inset', 'ring-blue-400');
        }
      });

      el.addEventListener('dragleave', (e) => {
        if (!el.contains(e.relatedTarget)) {
          el.classList.remove('ring-2', 'ring-inset', 'ring-blue-400');
        }
      });

      el.addEventListener('drop', (e) => {
        e.preventDefault();
        el.classList.remove('ring-2', 'ring-inset', 'ring-blue-400');
        const dst = Number(el.dataset.slot);
        if (this.#dragSrcIndex !== null && this.#dragSrcIndex !== dst) {
          const tmp = this.#slots[this.#dragSrcIndex];
          this.#slots[this.#dragSrcIndex] = this.#slots[dst];
          this.#slots[dst] = tmp;
          this.#render();
          this.#notifyChange();
        }
        this.#dragSrcIndex = null;
      });
    });
  }

  #slotHtml(index, moraleVisible) {
    const slot = this.#slots[index];
    const style = slot.style;
    const imageUrl = style ? resolveStyleImageUrl(style) : '';
    const charaName = style ? extractCharaName(style) : null;
    const lbOptions = makeLbOptions(style);

    const supportStyle = slot.supportStyle;
    const supportImageUrl = supportStyle ? resolveStyleImageUrl(supportStyle) : '';
    const supportCharaName = supportStyle ? extractCharaName(supportStyle) : null;
    // SS/SSR のみサポート枠が有効
    const supportEnabled = style?.tier === 'SS' || style?.tier === 'SSR';
    // メインが SSR → 煌めき
    const mainSsr  = style?.tier === 'SSR';
    const mainRing = mainSsr ? 'ring-2 ring-purple-400' : '';
    // メインが SSR かつサポートが共鳴アビリティ持ち → 共鳴アビリティ発動 → 煌めき
    // （属性一致チェックは StylePicker 側で済んでいるためここでは不要）
    const supportSsr = mainSsr && !!supportStyle?.resonance;
    const supportRing = supportSsr ? 'ring-2 ring-purple-400' : '';

    return `
      <div draggable="true" data-slot="${index}"
           class="flex flex-col rounded-lg border border-gray-200 bg-white overflow-hidden
                  text-xs shadow-sm transition-opacity">

        <!-- スロット番号（ドラッグハンドル） -->
        <div class="flex items-center justify-center bg-gray-50 border-b border-gray-100
                    py-0.5 text-gray-400 font-bold text-xs cursor-grab active:cursor-grabbing
                    select-none">${index + 1}</div>

        <!-- main icon -->
        <button data-action="open-picker" data-slot-index="${index}" data-mode="main"
                class="relative w-full aspect-square hover:opacity-80
                       transition-opacity cursor-pointer overflow-hidden group ${mainRing}
                       ${mainSsr ? 'ssr-resonance-bg-subtle' : 'bg-gray-100'}">
          ${imageUrl
            ? `<img src="${imageUrl}" alt="${style?.name ?? ''}" draggable="false"
                    class="w-full h-full object-cover" />
               ${mainSsr ? '<div class="absolute inset-0 pointer-events-none ssr-resonance-overlay"></div>' : ''}`
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

        <!-- スキル絞込ボタン -->
        <button data-action="open-filter" data-slot-index="${index}"
                class="text-xs text-gray-400 hover:text-gray-600 px-1 py-px w-full
                       transition-colors ${slot.style ? '' : 'invisible'}">
          🔧 スキル絞込
        </button>

        <!-- support section: flex-row（アイコン左固定 w-14 + LB select 右） -->
        <div class="border-t border-gray-100">
          ${supportEnabled ? `
            <div class="flex items-stretch">
              <button data-action="open-picker" data-slot-index="${index}" data-mode="support"
                      class="relative w-14 flex-shrink-0 overflow-hidden group ${supportRing}
                             ${supportSsr ? 'ssr-resonance-bg-subtle' : 'bg-gray-50'}
                             cursor-pointer hover:opacity-80 transition-opacity">
                ${supportImageUrl
                  ? `<img src="${supportImageUrl}" alt="${supportStyle?.name ?? ''}" draggable="false"
                          class="w-full h-full object-cover" />
                     ${supportSsr ? '<div class="absolute inset-0 pointer-events-none ssr-resonance-overlay"></div>' : ''}`
                  : `<div class="w-full h-full flex items-center justify-center
                                ${!supportSsr ? 'bg-gray-50' : ''}
                                flex-col gap-0.5">
                       <span class="text-sm leading-none text-gray-300 group-hover:text-blue-300 transition-colors">＋</span>
                       <span style="font-size:7px" class="text-gray-400">SUP</span>
                     </div>`
                }
                ${supportCharaName
                  ? `<div class="absolute bottom-0 left-0 right-0 bg-black/50 text-white
                                text-center leading-tight px-0.5 py-0.5"
                          style="font-size:6px">${supportCharaName}</div>`
                  : ''
                }
                <div class="absolute top-0.5 left-0.5 bg-black/40 text-white rounded px-0.5 leading-none"
                     style="font-size:7px">SUP</div>
              </button>
              <div class="flex items-center flex-1 px-1 bg-gray-50">
                ${supportStyle
                  ? selectHtml('supportLb', index, makeLbOptions(supportStyle).map(o => ({ value: o.value, label: String(o.value) })), slot.supportLb)
                  : `<span class="text-[9px] text-gray-300 w-full text-center">LB設定</span>`
                }
              </div>
            </div>
          ` : `
            <div class="h-7 flex items-center justify-center opacity-30 bg-gray-50">
              <span style="font-size:9px" class="text-gray-400">SUP 非対応</span>
            </div>
          `}
        </div>

      </div>
    `;
  }

  #onStyleSelected(style) {
    if (this.#activeSlotIndex == null) return;
    const idx = this.#activeSlotIndex;
    const mode = this.#activeMode;

    // スタイル変更時: 旧スタイルのフィルタ設定をリセット（新スタイルは全件表示）
    if (mode === 'main') {
      const oldStyleId = this.#slots[idx]?.styleId;
      if (oldStyleId && oldStyleId !== style.id) {
        clearFilterForStyle(oldStyleId);
      }
    }

    if (mode === 'main') {
      // メイン同士: 同一キャラクター不可 → 既存をクリア
      this.#slots.forEach((s, i) => {
        if (i !== idx && s.style?.chara_label === style.chara_label) {
          s.style = null;
          s.styleId = null;
        }
      });
      // メイン↔サポート: 同一スタイル不可 → 既存サポートをクリア
      this.#slots.forEach((s) => {
        if (s.supportStyle?.id === style.id) {
          s.supportStyle = null;
          s.supportStyleId = null;
        }
      });
      this.#slots[idx].style = style;
      this.#slots[idx].styleId = style.id;
      this.#slots[idx].lb = 0;
    } else {
      // サポート同士: 同一スタイル不可 → 既存サポートをクリア
      // ※ メインにセット済みのスタイルは picker 側でグレーアウト済みのため到達しない
      this.#slots.forEach((s, i) => {
        if (i !== idx && s.supportStyle?.id === style.id) {
          s.supportStyle = null;
          s.supportStyleId = null;
        }
      });
      this.#slots[idx].supportStyle = style;
      this.#slots[idx].supportStyleId = style.id;
    }

    this.#render();
    this.#notifyChange();

    // 続けて選ぶモード: 次の空きスロットへ自動進行
    if (this.#picker.isContinuousMode) {
      const next = this.#findNextEmptySlot();
      if (next !== null) {
        this.#activeSlotIndex = next.slotIndex;
        this.#activeMode = next.mode;
        const slot = this.#slots[next.slotIndex];
        const current = next.mode === 'main' ? slot.style : slot.supportStyle;
        const mainStyle = next.mode === 'support' ? slot.style : null;
        this.#picker.open(current, next.mode, mainStyle, this.#getPartyContext());
        return; // activeSlotIndex をリセットしない
      }
      // 空きがなくなったら閉じる
      this.#picker.close();
    }

    this.#activeSlotIndex = null;
  }
}
