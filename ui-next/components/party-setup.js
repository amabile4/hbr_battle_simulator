import { resolveStyleImageUrl } from '../../src/ui/style-asset-url.js';
import { DRIVE_PIERCE_OPTIONS } from '../../src/config/battle-defaults.js';
import { StylePickerController } from './style-picker.js';
import {
  isRequiredSkillSetting,
  SkillSettingsPanel,
} from './skill-filter-panel.js';

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
const PRESET_COUNT = 20;
const PARTY_SLOT_COUNT = 6;
const FRONTLINE_SLOT_COUNT = 3;
const DEFAULT_SP_EQUIP_ID = '3';
const EMPTY_SP_EQUIP_ID = '';

function createEmptySlotState() {
  return {
    styleId: null,
    style: null,
    supportStyleId: null,
    supportStyle: null,
    lb: 0,
    supportLb: 0,
    drivePierce: 0,
    spEquipId: DEFAULT_SP_EQUIP_ID,
    belt: '',
    morale: 'normal',
    equippedSkillIds: [],
  };
}

function normalizePresetName(name) {
  const normalized = String(name ?? '').trim();
  return normalized ? normalized : undefined;
}

function extractCharaName(style) {
  const raw = String(style?.chara ?? '');
  const jpPart = raw.split('—')[0].trim();
  return jpPart || (style?.chara_label ?? '');
}

function dedupeNumericIds(ids = []) {
  return [...new Set(
    ids
      .map((id) => Number(id))
      .filter((id) => Number.isFinite(id))
  )];
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

function resolveSnapshotSpEquipId(snapshot = {}, index) {
  const startSpEquipByPartyIndex = snapshot?.startSpEquipByPartyIndex;
  if (
    startSpEquipByPartyIndex &&
    typeof startSpEquipByPartyIndex === 'object' &&
    Object.prototype.hasOwnProperty.call(startSpEquipByPartyIndex, index)
  ) {
    const bonus = Number(startSpEquipByPartyIndex[index] ?? 0);
    return bonus > 0 ? String(bonus) : EMPTY_SP_EQUIP_ID;
  }
  return DEFAULT_SP_EQUIP_ID;
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
  #skillSettingsPanel;
  #onChange;
  #activeSlotIndex = null;
  #activeMode = 'main'; // 'main' | 'support'
  #dragSrcIndex = null;
  #tapReorderSrcIndex = null;
  #hasActiveBattle = false;
  #hasRecords = false;

  constructor({ root, pickerOverlay, store, onChange = null }) {
    this.#onChange = onChange;
    this.#root = root;
    this.#store = store;

    this.#slots = Array.from({ length: PARTY_SLOT_COUNT }, () => createEmptySlotState());

    this.#picker = new StylePickerController({
      overlay: pickerOverlay,
      styles: store.styles,
      store: store,
      onSelect: (style) => this.#onStyleSelected(style),
      onDisband: () => this.#disbandParty(),
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
    this.#skillSettingsPanel = new SkillSettingsPanel({
      store: this.#store,
      resolveSlot: (slotIndex) => this.#slots[slotIndex] ?? null,
      onSelectionChange: (slotIndex, skillId, checked) => {
        this.#toggleSkillForSlot(slotIndex, skillId, checked);
      },
      onSelectAll: (slotIndex) => {
        this.#selectAllSkillsForSlot(slotIndex);
      },
      onClearAll: (slotIndex) => {
        this.#clearSkillsForSlot(slotIndex);
      },
    });
    this.#skillSettingsPanel.mount(document.body);
    this.#skillSettingsPanel.updateContext({
      hasActiveBattle: this.#hasActiveBattle,
      hasRecords: this.#hasRecords,
    });
    this.#bindDragAndDropDelegation();
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
    const isFrontFilled = styleIds.slice(0, FRONTLINE_SLOT_COUNT).every((id) => id !== null);
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
        this.#slots.map((s, i) => [i, s.spEquipId === EMPTY_SP_EQUIP_ID ? 0 : Number(s.spEquipId)])
      ),
      skillSetsByPartyIndex: Object.fromEntries(
        this.#slots
          .map((slot, index) => (
            slot.styleId
              ? [index, this.#resolveEquippedSkillIdsForStyle(slot.styleId, slot.equippedSkillIds)]
              : null
          ))
          .filter(Boolean)
      ),
    };
  }

  setBattleState({
    hasActiveBattle = this.#hasActiveBattle,
    hasRecords = this.#hasRecords,
  } = {}) {
    this.#hasActiveBattle = Boolean(hasActiveBattle);
    this.#hasRecords = Boolean(hasRecords);
    this.#skillSettingsPanel?.updateContext({
      hasActiveBattle: this.#hasActiveBattle,
      hasRecords: this.#hasRecords,
    });
  }

  applySnapshot(snapshot = {}) {
    this.#tapReorderSrcIndex = null;
    this.#slots = Array.from({ length: PARTY_SLOT_COUNT }, (_, index) => {
      const styleId = snapshot?.styleIds?.[index] ?? null;
      const supportStyleId = snapshot?.supportStyleIds?.[index] ?? null;
      const style = styleId ? (this.#store.getStyleById(styleId) ?? null) : null;
      const supportStyle = supportStyleId ? (this.#store.getStyleById(supportStyleId) ?? null) : null;
      return {
        styleId: style ? Number(styleId) : null,
        style,
        supportStyleId: style && supportStyle ? Number(supportStyleId) : null,
        supportStyle: style ? supportStyle : null,
        lb: Number(snapshot?.limitBreakLevelsByPartyIndex?.[index] ?? 0),
        supportLb: Number(snapshot?.supportLimitBreakLevelsByPartyIndex?.[index] ?? 0),
        drivePierce: Number(snapshot?.drivePierceByPartyIndex?.[index] ?? 0),
        spEquipId: resolveSnapshotSpEquipId(snapshot, index),
        belt: '',
        morale: 'normal',
        equippedSkillIds: style
          ? this.#resolveEquippedSkillIdsForStyle(
              Number(styleId),
              snapshot?.skillSetsByPartyIndex?.[index] ?? snapshot?.skillSetsByPartyIndex?.[String(index)] ?? null
            )
          : [],
      };
    });
    this.#render();
    this.#notifyChange();
  }

  getPresetPreviews() {
    return this.#readPresets().map((preset) => {
      if (!preset) {
        return null;
      }
      return {
        name: preset.name,
        label: preset.label,
        savedAt: preset.savedAt,
        slots: this.#resolvePreviewSlotsFromPreset(preset),
      };
    });
  }

  savePreset(index, { name = '' } = {}) {
    return this.#savePreset(index, { name });
  }

  loadPreset(index) {
    return this.#loadPreset(index);
  }

  renamePreset(index, { name = '' } = {}) {
    const presets = this.#readPresets();
    const preset = presets[index];
    if (!preset) {
      return false;
    }
    const normalizedName = normalizePresetName(name);
    presets[index] = {
      ...preset,
      ...(normalizedName ? { name: normalizedName } : {}),
    };
    if (!normalizedName) {
      delete presets[index].name;
    }
    this.#writePresets(presets);
    return true;
  }

  clearPreset(index) {
    const presets = this.#readPresets();
    if (!presets[index]) {
      return false;
    }
    const ok = window.confirm?.(`プリセット ${index + 1} を削除しますか？`) ?? true;
    if (!ok) {
      return false;
    }
    presets[index] = null;
    this.#writePresets(presets);
    return true;
  }

  // ---- private ----

  // ---- preset ----

  #readPresets() {
    try {
      const raw = localStorage.getItem(PRESET_STORAGE_KEY);
      if (!raw) return Array(PRESET_COUNT).fill(null);
      const parsed = JSON.parse(raw);
      const { presets, shouldRewrite } = this.#normalizeStoredPresets(parsed);
      if (shouldRewrite) {
        this.#writePresets(presets);
      }
      return presets;
    } catch {
      const emptyPresets = Array(PRESET_COUNT).fill(null);
      this.#writePresets(emptyPresets);
      return emptyPresets;
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

  #normalizeStoredPresets(parsed) {
    const source = Array.isArray(parsed) ? parsed : [];
    let shouldRewrite = !Array.isArray(parsed) || source.length !== PRESET_COUNT;
    const presets = Array.from({ length: PRESET_COUNT }, (_, index) => {
      const rawPreset = source[index] ?? null;
      const normalizedPreset = this.#normalizeStoredPreset(rawPreset);
      if (rawPreset !== null && normalizedPreset === null) {
        shouldRewrite = true;
      }
      return normalizedPreset;
    });
    return { presets, shouldRewrite };
  }

  #normalizeStoredPreset(preset) {
    if (!preset || typeof preset !== 'object' || !Array.isArray(preset.slots)) {
      return null;
    }
    const isCompatiblePreset = Array.from({ length: PARTY_SLOT_COUNT }, (_, index) => {
      const slot = preset.slots[index];
      return slot && typeof slot === 'object' && Object.prototype.hasOwnProperty.call(slot, 'equippedSkillIds');
    }).every(Boolean);
    if (!isCompatiblePreset) {
      return null;
    }
    return {
      ...(normalizePresetName(preset.name) ? { name: normalizePresetName(preset.name) } : {}),
      label: String(preset.label ?? '').trim() || this.#buildPresetLabelFromSlotEntries(preset.slots),
      savedAt: String(preset.savedAt ?? ''),
      slots: Array.from({ length: PARTY_SLOT_COUNT }, (_, index) => {
        const slot = preset.slots[index] ?? {};
        const styleId = Number.isFinite(Number(slot.styleId)) ? Number(slot.styleId) : null;
        const supportStyleId = styleId && Number.isFinite(Number(slot.supportStyleId))
          ? Number(slot.supportStyleId)
          : null;
        return {
          styleId,
          supportStyleId,
          lb: Number(slot.lb ?? 0),
          supportLb: Number(slot.supportLb ?? 0),
          drivePierce: Number(slot.drivePierce ?? 0),
          spEquipId: String(slot.spEquipId ?? DEFAULT_SP_EQUIP_ID),
          belt: String(slot.belt ?? ''),
          morale: String(slot.morale ?? 'normal'),
          equippedSkillIds: dedupeNumericIds(slot.equippedSkillIds ?? []),
        };
      }),
    };
  }

  #buildPresetLabelFromSlotEntries(slots) {
    const names = slots
      .slice(0, FRONTLINE_SLOT_COUNT)
      .map((slot) => this.#store.getStyleById(slot?.styleId))
      .filter(Boolean)
      .map((style) => extractCharaName(style));
    return names.length > 0 ? names.join('・') : '（空）';
  }

  #resolvePreviewSlotsFromPreset(preset) {
    return Array.from({ length: PARTY_SLOT_COUNT }, (_, index) => {
      const slot = preset.slots[index] ?? {};
      const style = this.#store.getStyleById(slot.styleId) ?? null;
      return {
        style,
        supportStyle: style ? (this.#store.getStyleById(slot.supportStyleId) ?? null) : null,
      };
    });
  }

  #savePreset(index, { name = '' } = {}) {
    const presets = this.#readPresets();
    if (index < 0 || index >= PRESET_COUNT) {
      return false;
    }
    if (presets[index]) {
      const ok = window.confirm?.(`プリセット ${index + 1} を上書きしますか？`) ?? true;
      if (!ok) {
        return false;
      }
    }
    const normalizedName = normalizePresetName(name);
    presets[index] = {
      ...(normalizedName ? { name: normalizedName } : {}),
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
        equippedSkillIds: [...(s.equippedSkillIds ?? [])],
      })),
    };
    this.#writePresets(presets);
    return true;
  }

  #loadPreset(index) {
    const preset = this.#readPresets()[index];
    if (!preset) return false;
    this.#tapReorderSrcIndex = null;
    this.#slots = preset.slots.map((s) => {
      const style = s.styleId ? (this.#store.getStyleById(s.styleId) ?? null) : null;
      const supportStyle =
        style && s.supportStyleId
          ? (this.#store.getStyleById(s.supportStyleId) ?? null)
          : null;
      return {
        styleId: style ? s.styleId : null,
        style,
        supportStyleId: supportStyle ? s.supportStyleId : null,
        supportStyle,
        lb: s.lb ?? 0,
        supportLb: s.supportLb ?? 0,
        drivePierce: s.drivePierce ?? 0,
        spEquipId: s.spEquipId ?? DEFAULT_SP_EQUIP_ID,
        belt: s.belt ?? '',
        morale: s.morale ?? 'normal',
        equippedSkillIds: style
          ? this.#resolveEquippedSkillIdsForStyle(
              Number(s.styleId),
              Array.isArray(s.equippedSkillIds) ? s.equippedSkillIds : null
            )
          : [],
      };
    });
    this.#render();
    this.#notifyChange();
    return true;
  }

  // ---- /preset ----

  #normalizeChangeMeta(meta = {}) {
    return {
      slotIndex: Number.isInteger(meta.slotIndex) ? meta.slotIndex : null,
      addedSkillIds: dedupeNumericIds(meta.addedSkillIds ?? []),
      removedSkillIds: dedupeNumericIds(meta.removedSkillIds ?? []),
      hasSkillSetDelta: Boolean(meta.hasSkillSetDelta),
    };
  }

  #notifyChange(meta = {}) {
    this.#onChange?.(this.getSnapshot(), this.#normalizeChangeMeta(meta));
  }

  #hasPartySelections() {
    return this.#slots.some((slot) => slot.styleId !== null || slot.supportStyleId !== null);
  }

  #disbandParty() {
    if (!this.#hasPartySelections()) {
      return;
    }
    this.#tapReorderSrcIndex = null;
    this.#slots = Array.from({ length: PARTY_SLOT_COUNT }, () => createEmptySlotState());
    this.#activeSlotIndex = null;
    this.#activeMode = 'main';
    this.#picker.close();
    this.#render();
    this.#notifyChange();
  }

  #getEquipableSkillsForStyle(styleId) {
    if (!styleId) {
      return [];
    }
    return this.#store.listEquipableSkillsByStyleId(styleId);
  }

  #resolveEquippedSkillIdsForStyle(styleId, preferredIds = null) {
    const skills = this.#getEquipableSkillsForStyle(styleId);
    if (skills.length === 0) {
      return [];
    }

    const availableIds = new Set(skills.map((skill) => Number(skill.id)));
    const requiredIds = skills
      .filter((skill) => isRequiredSkillSetting(skill))
      .map((skill) => Number(skill.id));
    const selectedIds = Array.isArray(preferredIds)
      ? dedupeNumericIds(preferredIds).filter((skillId) => availableIds.has(skillId))
      : skills.map((skill) => Number(skill.id));

    return dedupeNumericIds([...requiredIds, ...selectedIds]);
  }

  #updateEquippedSkillIds(slotIndex, preferredIds) {
    const slot = this.#slots[slotIndex];
    if (!slot?.styleId) {
      return;
    }
    const previousIds = this.#resolveEquippedSkillIdsForStyle(slot.styleId, slot.equippedSkillIds);
    const nextIds = this.#resolveEquippedSkillIdsForStyle(slot.styleId, preferredIds);
    const previousSet = new Set(previousIds);
    const nextSet = new Set(nextIds);
    const addedSkillIds = nextIds.filter((skillId) => !previousSet.has(skillId));
    const removedSkillIds = previousIds.filter((skillId) => !nextSet.has(skillId));
    if (addedSkillIds.length === 0 && removedSkillIds.length === 0) {
      return;
    }
    slot.equippedSkillIds = nextIds;
    this.#notifyChange({
      slotIndex,
      addedSkillIds,
      removedSkillIds,
      hasSkillSetDelta: true,
    });
  }

  #toggleSkillForSlot(slotIndex, skillId, checked) {
    const slot = this.#slots[slotIndex];
    if (!slot?.styleId) {
      return;
    }
    const selectedIds = new Set(
      this.#resolveEquippedSkillIdsForStyle(slot.styleId, slot.equippedSkillIds)
    );
    if (checked) {
      selectedIds.add(Number(skillId));
    } else {
      selectedIds.delete(Number(skillId));
    }
    this.#updateEquippedSkillIds(slotIndex, [...selectedIds]);
  }

  #selectAllSkillsForSlot(slotIndex) {
    const slot = this.#slots[slotIndex];
    if (!slot?.styleId) {
      return;
    }
    const allSkillIds = this.#getEquipableSkillsForStyle(slot.styleId).map((skill) => Number(skill.id));
    this.#updateEquippedSkillIds(slotIndex, allSkillIds);
  }

  #clearSkillsForSlot(slotIndex) {
    const slot = this.#slots[slotIndex];
    if (!slot?.styleId) {
      return;
    }
    const requiredIds = this.#getEquipableSkillsForStyle(slot.styleId)
      .filter((skill) => isRequiredSkillSetting(skill))
      .map((skill) => Number(skill.id));
    this.#updateEquippedSkillIds(slotIndex, requiredIds);
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
      for (let i = start; i < PARTY_SLOT_COUNT; i++) {
        if (!this.#slots[i].style) return { slotIndex: i, mode: 'main' };
      }
      // メインが埋まったらサポートの空き（スロット0から）を探す
      for (let i = 0; i < PARTY_SLOT_COUNT; i++) {
        const slot = this.#slots[i];
        const enabled = slot.style?.tier === 'SS' || slot.style?.tier === 'SSR';
        if (enabled && !slot.supportStyle) return { slotIndex: i, mode: 'support' };
      }
    } else {
      // support モード: 残りのサポート空きスロットのみ
      for (let i = start; i < PARTY_SLOT_COUNT; i++) {
        const slot = this.#slots[i];
        const enabled = slot.style?.tier === 'SS' || slot.style?.tier === 'SSR';
        if (enabled && !slot.supportStyle) return { slotIndex: i, mode: 'support' };
      }
    }

    return null;
  }

  #swapSlots(srcIndex, dstIndex) {
    if (!Number.isInteger(srcIndex) || !Number.isInteger(dstIndex) || srcIndex === dstIndex) {
      return false;
    }
    const tmp = this.#slots[srcIndex];
    this.#slots[srcIndex] = this.#slots[dstIndex];
    this.#slots[dstIndex] = tmp;
    return true;
  }

  #handleTapReorder(slotIndex) {
    if (!Number.isInteger(slotIndex)) {
      return;
    }
    if (this.#tapReorderSrcIndex === slotIndex) {
      this.#tapReorderSrcIndex = null;
      this.#render();
      return;
    }
    if (this.#tapReorderSrcIndex === null) {
      this.#tapReorderSrcIndex = slotIndex;
      this.#render();
      return;
    }

    const srcIndex = this.#tapReorderSrcIndex;
    this.#tapReorderSrcIndex = null;
    if (this.#swapSlots(srcIndex, slotIndex)) {
      this.#render();
      this.#notifyChange();
      return;
    }
    this.#render();
  }

  #clearDragHighlights() {
    this.#root
      ?.querySelectorAll('[data-slot]')
      .forEach((slot) => slot.classList.remove('ring-2', 'ring-inset', 'ring-blue-400'));
  }

  #resolveSlotElement(target) {
    if (!target || typeof target.closest !== 'function') {
      return null;
    }
    const slotElement = target.closest('[data-slot]');
    return this.#root?.contains(slotElement) ? slotElement : null;
  }

  #bindDragAndDropDelegation() {
    this.#root.addEventListener('dragover', (event) => {
      if (this.#dragSrcIndex === null) {
        return;
      }
      const slotElement = this.#resolveSlotElement(event.target);
      if (!slotElement) {
        this.#clearDragHighlights();
        return;
      }
      event.preventDefault();
      event.dataTransfer.dropEffect = 'move';
      this.#clearDragHighlights();
      const dst = Number(slotElement.dataset.slot);
      if (dst !== this.#dragSrcIndex) {
        slotElement.classList.add('ring-2', 'ring-inset', 'ring-blue-400');
      }
    });

    this.#root.addEventListener('drop', (event) => {
      if (this.#dragSrcIndex === null) {
        return;
      }
      const slotElement = this.#resolveSlotElement(event.target);
      event.preventDefault();
      this.#clearDragHighlights();
      if (!slotElement) {
        this.#dragSrcIndex = null;
        return;
      }
      const dst = Number(slotElement.dataset.slot);
      if (this.#swapSlots(this.#dragSrcIndex, dst)) {
        this.#render();
        this.#notifyChange();
      }
      this.#dragSrcIndex = null;
    });
  }

  #render() {
    this.#skillSettingsPanel?.close();
    // やる気パッシブ持ちが1人でもいれば全スロットにやる気 select を表示
    const moraleVisible = this.#slots.some((s) => hasMoralePassive(s.style));
    const canDisband = this.#hasPartySelections();

    this.#root.innerHTML = `
      <div class="p-1.5 space-y-1.5">
        <div class="flex justify-end px-0.5">
          <button data-action="disband-party"
                  type="button"
                  ${canDisband ? '' : 'disabled'}
                  class="text-xs px-2 py-1 rounded-md border border-rose-200 bg-rose-50
                         text-rose-600 hover:bg-rose-100 transition-colors
                         disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-rose-50">
            PT解散
          </button>
        </div>
        <!-- 前衛 -->
        <div>
          <div class="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-0.5 px-1">前衛</div>
          <div class="grid grid-cols-3 gap-1">
            ${[0, 1, 2].map((i) => this.#slotHtml(i, moraleVisible)).join('')}
          </div>
        </div>
        <!-- 後衛 -->
        <div>
          <div class="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-0.5 px-1">後衛</div>
          <div class="grid grid-cols-3 gap-1">
            ${[3, 4, 5].map((i) => this.#slotHtml(i, moraleVisible)).join('')}
          </div>
        </div>
      </div>
    `;

    // main / support アイコンのクリック
    this.#root.querySelectorAll('[data-action="open-picker"]').forEach((el) => {
      el.addEventListener('click', () => {
        this.#tapReorderSrcIndex = null;
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
        this.#tapReorderSrcIndex = null;
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

    this.#root.querySelector('[data-action="disband-party"]')?.addEventListener('click', () => {
      this.#disbandParty();
    });

    // スキル設定ボタン
    this.#root.querySelectorAll('[data-action="open-skill-settings"]').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.#tapReorderSrcIndex = null;
        const idx = Number(btn.dataset.slotIndex);
        if (this.#slots[idx]?.styleId) {
          this.#skillSettingsPanel.open(idx, btn, {
            hasActiveBattle: this.#hasActiveBattle,
            hasRecords: this.#hasRecords,
          });
        }
      });
    });

    this.#root.querySelectorAll('[data-action="select-reorder-slot"]').forEach((button) => {
      button.addEventListener('click', () => {
        this.#handleTapReorder(Number(button.dataset.slotIndex));
      });
      button.addEventListener('keydown', (event) => {
        if (event.key !== 'Enter' && event.key !== ' ') {
          return;
        }
        event.preventDefault();
        this.#handleTapReorder(Number(button.dataset.slotIndex));
      });
      button.addEventListener('dragstart', (event) => {
        const slotElement = button.closest('[data-slot]');
        if (!slotElement) {
          return;
        }
        this.#tapReorderSrcIndex = null;
        this.#dragSrcIndex = Number(button.dataset.slotIndex);
        event.dataTransfer.effectAllowed = 'move';
        event.dataTransfer.setData('text/plain', '');
        const requestNextFrame = window.requestAnimationFrame ?? ((callback) => window.setTimeout(callback, 0));
        requestNextFrame(() => slotElement.classList.add('opacity-40'));
      });
      button.addEventListener('dragend', () => {
        const slotElement = button.closest('[data-slot]');
        if (slotElement) {
          slotElement.classList.remove('opacity-40');
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
    const reorderSelected = this.#tapReorderSrcIndex === index;
    const reorderButtonClass = reorderSelected
      ? 'bg-blue-50 text-blue-600 ring-1 ring-inset ring-blue-300'
      : 'bg-gray-50 text-gray-400';

    return `
      <div data-slot="${index}"
           class="flex flex-col rounded-lg border border-gray-200 bg-white overflow-hidden
                  text-xs shadow-sm transition-opacity">

        <!-- スロット番号（ドラッグハンドル） -->
        <div data-action="select-reorder-slot"
             data-slot-index="${index}"
             data-selected="${reorderSelected ? 'true' : 'false'}"
             aria-pressed="${reorderSelected ? 'true' : 'false'}"
             role="button"
             tabindex="0"
             draggable="true"
             title="ドラッグで入れ替え / タップで入れ替え元を選択"
             class="flex items-center justify-center border-b border-gray-100 py-0.5
                    font-bold text-xs cursor-grab active:cursor-grabbing select-none
                    transition-colors ${reorderButtonClass}">
          ${index + 1}
        </div>

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

        <!-- スキル設定ボタン -->
        <button data-action="open-skill-settings" data-slot-index="${index}"
                class="text-xs text-gray-400 hover:text-gray-600 px-1 py-px w-full
                       transition-colors ${slot.style ? '' : 'invisible'}">
          スキル設定
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
    this.#tapReorderSrcIndex = null;

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
      this.#slots[idx].equippedSkillIds = this.#resolveEquippedSkillIdsForStyle(style.id, null);
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
