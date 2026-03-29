import { isNormalAttackSkill, isAdmiralCommandSkill } from '../../src/domain/skill-classifiers.js';
import { getElementHintForDuplicateNamedSkill } from '../utils/skill-label.js';

const PANEL_WIDTH_PX = 320;
const PANEL_MIN_BOTTOM_SPACE_PX = 200;
const SOURCE_TYPE_LABELS = Object.freeze({
  master: 'マスター',
  orb: 'オーブ',
});

/**
 * 生スキルデータからコストラベルを生成する（エンジン状態なし・フォールバック）。
 * @param {object} skill
 * @returns {string}
 */
export function formatSkillSettingCostLabel(skill) {
  const consumeType = String(skill.consume_type ?? skill.consumeType ?? 'Sp').toLowerCase();
  const cost = Number(skill.sp_cost ?? skill.spCost ?? 0);
  const n = cost === -1 ? '*' : String(cost);
  if (consumeType === 'token') return `T(${n})`;
  if (consumeType === 'morale') return `M(${n})`;
  if (consumeType === 'ep') return `E(${n})`;
  return `(${n})`;
}

export function isRequiredSkillSetting(skill) {
  return isNormalAttackSkill(skill) || isAdmiralCommandSkill(skill);
}

export function buildSkillSettingTagLabels(skill) {
  const tags = [];
  const sourceTypeLabel = SOURCE_TYPE_LABELS[String(skill?.sourceType ?? 'style')];
  if (sourceTypeLabel) {
    tags.push(sourceTypeLabel);
  }
  if (skill?.passive && typeof skill.passive === 'object') {
    tags.push('パッシブ');
  }
  return tags;
}



function dedupeNumericIds(ids = []) {
  return [...new Set(
    ids
      .map((id) => Number(id))
      .filter((id) => Number.isFinite(id))
  )];
}

/**
 * スキル設定フローティングパネル（シングルトン）。
 *
 * slot 単位の装備済み skill 集合を編集し、Party Setup 側の state を更新する。
 */
export class SkillSettingsPanel {
  #panelEl = null;
  #currentSlotIndex = null;
  #currentAnchorEl = null;
  #outsideClickHandler = null;
  #store = null;
  #resolveSlot = null;
  #onSelectionChange = null;
  #onSelectAll = null;
  #onClearAll = null;
  #hasActiveBattle = false;
  #hasRecords = false;

  constructor({
    store = null,
    resolveSlot = null,
    onSelectionChange = null,
    onSelectAll = null,
    onClearAll = null,
  } = {}) {
    this.#store = store;
    this.#resolveSlot = resolveSlot;
    this.#onSelectionChange = onSelectionChange;
    this.#onSelectAll = onSelectAll;
    this.#onClearAll = onClearAll;
  }

  /**
   * コンテナに fixed パネル DOM を追加する（初期は非表示）。
   * @param {HTMLElement} containerEl
   */
  mount(containerEl) {
    const el = document.createElement('div');
    el.id = 'skill-settings-panel';
    el.className =
      'fixed z-50 bg-white border border-gray-200 rounded-lg shadow-lg p-3 w-80';
    el.style.display = 'none';
    containerEl.appendChild(el);
    this.#panelEl = el;
  }

  /**
   * パネルをアンカー要素の近くに表示してスキル設定を描画する。
   * @param {number} slotIndex
   * @param {HTMLElement} anchorEl
   * @param {{ hasActiveBattle?: boolean, hasRecords?: boolean }} options
   */
  open(slotIndex, anchorEl, options = {}) {
    const panel = this.#panelEl;
    if (!panel) return;

    this.#currentSlotIndex = Number(slotIndex);
    this.#currentAnchorEl = anchorEl;
    this.updateContext(options);
    this.#render();
    panel.style.display = 'block';
    this.#positionPanel();
    this.#bindOutsideClick();
  }

  updateContext({
    hasActiveBattle = this.#hasActiveBattle,
    hasRecords = this.#hasRecords,
  } = {}) {
    this.#hasActiveBattle = Boolean(hasActiveBattle);
    this.#hasRecords = Boolean(hasRecords);
    this.refresh();
  }

  refresh() {
    if (!this.#panelEl || this.#currentSlotIndex == null || this.#panelEl.style.display === 'none') {
      return;
    }
    this.#render();
  }

  /** パネルを非表示にする。 */
  close() {
    if (!this.#panelEl) return;
    this.#panelEl.style.display = 'none';
    if (this.#outsideClickHandler) {
      document.removeEventListener('click', this.#outsideClickHandler, true);
      this.#outsideClickHandler = null;
    }
    this.#currentSlotIndex = null;
    this.#currentAnchorEl = null;
  }

  #getCurrentSlot() {
    return this.#resolveSlot?.(this.#currentSlotIndex) ?? null;
  }

  #getSkillsForCurrentSlot() {
    const slot = this.#getCurrentSlot();
    if (!slot?.styleId) {
      return [];
    }
    return this.#store?.listEquipableSkillsByStyleId(slot.styleId) ?? [];
  }

  #render() {
    const panel = this.#panelEl;
    const slot = this.#getCurrentSlot();
    if (!panel || !slot?.styleId) {
      this.close();
      return;
    }

    const selectedIds = new Set(dedupeNumericIds(slot.equippedSkillIds ?? []));
    const skills = this.#getSkillsForCurrentSlot();
    const hasLockedRemoval = this.#hasActiveBattle && this.#hasRecords;
    const canSelectAll = skills.some((skill) => {
      const skillId = Number(skill.id ?? skill.skillId);
      return Number.isFinite(skillId) && !selectedIds.has(skillId);
    });
    const canClearAll = !hasLockedRemoval && skills.some((skill) => {
      const skillId = Number(skill.id ?? skill.skillId);
      return Number.isFinite(skillId) && !isRequiredSkillSetting(skill) && selectedIds.has(skillId);
    });
    const noteHtml = hasLockedRemoval
      ? '<p class="mt-2 text-[10px] leading-4 text-amber-600">記録中はスキル解除できません。追加すると 1 ターン目から自動再計算されます。</p>'
      : this.#hasActiveBattle
        ? '<p class="mt-2 text-[10px] leading-4 text-sky-600">変更は 1 ターン目から自動再計算されます。</p>'
        : '';

    panel.innerHTML = `
      <div class="flex items-center justify-between gap-2 mb-2">
        <span class="text-xs font-bold text-gray-700">スキル設定</span>
        <div class="flex gap-1">
          <button data-action="select-all"
                  ${canSelectAll ? '' : 'disabled'}
                  class="text-xs px-1.5 py-0.5 rounded bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors disabled:opacity-40 disabled:cursor-not-allowed">全選択</button>
          <button data-action="clear-all"
                  ${canClearAll ? '' : 'disabled'}
                  class="text-xs px-1.5 py-0.5 rounded bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors disabled:opacity-40 disabled:cursor-not-allowed">全解除</button>
          <button data-action="close"
                  class="text-xs px-1.5 py-0.5 rounded bg-gray-100 text-gray-400 hover:bg-gray-200 transition-colors">✕</button>
        </div>
      </div>
      <div data-role="skill-settings-list" data-slot="${this.#currentSlotIndex}"
           class="flex flex-col gap-1 max-h-72 overflow-y-auto">
        ${skills.map((skill) => {
          const skillId = Number(skill.id ?? skill.skillId);
          const required = isRequiredSkillSetting(skill);
          const checked = required || selectedIds.has(skillId);
          const lockedRemoval = !required && hasLockedRemoval && checked;
          const disabled = required || lockedRemoval;
          const tagLabels = buildSkillSettingTagLabels(skill);
          const elementHint = getElementHintForDuplicateNamedSkill(skill, skills);
          return `
            <label class="flex gap-1.5 rounded px-1 py-1 text-xs leading-tight ${disabled ? 'text-gray-400' : 'text-gray-700 hover:bg-gray-50 cursor-pointer'}">
              <input type="checkbox"
                     data-field="skill-setting"
                     data-slot-index="${this.#currentSlotIndex}"
                     value="${skillId}"
                     class="mt-0.5 shrink-0"
                     ${checked ? 'checked' : ''}
                     ${disabled ? 'disabled' : ''} />
              <span class="min-w-0 flex-1">
                <span class="text-gray-400">${formatSkillSettingCostLabel(skill)}</span>
                ${elementHint ? `<span class="ml-1 inline-flex rounded-full border border-blue-200 bg-blue-50 px-1 py-px text-[9px] text-blue-600">${elementHint}</span>` : ''}
                <span class="ml-1">${String(skill.name ?? '')}</span>
                ${tagLabels.map((tag) => `
                  <span class="ml-1 inline-flex rounded-full border border-gray-200 bg-white px-1 py-px text-[9px] text-gray-500">${tag}</span>
                `).join('')}
                ${lockedRemoval ? '<span class="ml-1 inline-flex rounded-full border border-amber-200 bg-amber-50 px-1 py-px text-[9px] text-amber-600">解除不可</span>' : ''}
              </span>
            </label>
          `;
        }).join('')}
      </div>
      ${noteHtml}
    `;

    panel.querySelector('[data-action="close"]')?.addEventListener('click', () => this.close());
    panel.querySelector('[data-action="select-all"]')?.addEventListener('click', () => {
      this.#onSelectAll?.(this.#currentSlotIndex);
      this.refresh();
    });
    panel.querySelector('[data-action="clear-all"]')?.addEventListener('click', () => {
      this.#onClearAll?.(this.#currentSlotIndex);
      this.refresh();
    });
    panel.querySelectorAll('input[data-field="skill-setting"]').forEach((checkbox) => {
      checkbox.addEventListener('change', () => {
        this.#onSelectionChange?.(this.#currentSlotIndex, Number(checkbox.value), checkbox.checked);
        this.refresh();
      });
    });
  }

  #positionPanel() {
    const panel = this.#panelEl;
    const anchorEl = this.#currentAnchorEl;
    if (!panel || !anchorEl) {
      return;
    }
    const rect = anchorEl.getBoundingClientRect();
    const panelH = panel.offsetHeight || 320;
    const spaceBelow = window.innerHeight - rect.bottom;
    if (spaceBelow >= panelH || spaceBelow >= PANEL_MIN_BOTTOM_SPACE_PX) {
      panel.style.top = `${rect.bottom + 4}px`;
    } else {
      panel.style.top = `${Math.max(4, rect.top - panelH - 4)}px`;
    }
    const left = Math.min(rect.left, window.innerWidth - PANEL_WIDTH_PX - 4);
    panel.style.left = `${Math.max(4, left)}px`;
  }

  #bindOutsideClick() {
    const panel = this.#panelEl;
    const anchorEl = this.#currentAnchorEl;
    if (!panel) {
      return;
    }
    if (this.#outsideClickHandler) {
      document.removeEventListener('click', this.#outsideClickHandler, true);
    }
    this.#outsideClickHandler = (e) => {
      if (!panel.contains(e.target) && e.target !== anchorEl) {
        this.close();
      }
    };
    document.addEventListener('click', this.#outsideClickHandler, true);
  }
}
