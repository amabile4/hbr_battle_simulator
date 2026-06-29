import {
  CHARACTER_STAT_KEYS,
  normalizeCharacterStats,
} from '../../src/domain/character-stats.js';

const STAT_LABELS = Object.freeze({
  str: 'STR',
  dex: 'DEX',
  wis: 'WIS',
  spr: 'SPR',
  luk: 'LUK',
  con: 'CON',
});

export class StatsSettingsPanel {
  #panelEl = null;
  #currentSlotIndex = null;
  #currentMode = 'main';
  #currentAnchorEl = null;
  #outsideClickHandler = null;
  #resolveSlot = null;
  #resolveDefaults = null;
  #onChange = null;

  constructor({ resolveSlot = null, resolveDefaultStats: resolveDefaults = null, onChange = null } = {}) {
    this.#resolveSlot = resolveSlot;
    this.#resolveDefaults = resolveDefaults;
    this.#onChange = onChange;
  }

  mount(containerEl) {
    const el = document.createElement('div');
    el.id = 'stats-settings-panel';
    el.className = 'party-stats-panel';
    el.style.display = 'none';
    containerEl.appendChild(el);
    this.#panelEl = el;
  }

  open(slotIndex, mode, anchorEl) {
    const panel = this.#panelEl;
    if (!panel) return;
    this.#currentSlotIndex = Number(slotIndex);
    this.#currentMode = mode === 'support' ? 'support' : 'main';
    this.#currentAnchorEl = anchorEl;
    this.#render();
    panel.style.display = 'block';
    this.#positionPanel();
    this.#bindOutsideClick();
  }

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

  #resolveDefaultStats() {
    return normalizeCharacterStats(
      this.#resolveDefaults?.(this.#currentSlotIndex, this.#currentMode)
    );
  }

  #resolveCurrentStats() {
    const slot = this.#getCurrentSlot();
    const value = this.#currentMode === 'support' ? slot?.supportStats : slot?.stats;
    return normalizeCharacterStats(value) ?? this.#resolveDefaultStats();
  }

  #render() {
    const panel = this.#panelEl;
    const slot = this.#getCurrentSlot();
    const style = this.#currentMode === 'support' ? slot?.supportStyle : slot?.style;
    if (!panel || !style) {
      this.close();
      return;
    }
    const stats = this.#resolveCurrentStats();
    if (!stats) {
      this.close();
      return;
    }
    panel.innerHTML = `
      <div class="party-stats-panel__header">
        <div>
          <strong>${this.#currentMode === 'support' ? 'サポート' : 'メイン'}ステータス</strong>
          <span>${String(style.name ?? '')}</span>
        </div>
        <button type="button" data-action="close-stats" title="閉じる">×</button>
      </div>
      <div class="party-stats-panel__grid">
        ${CHARACTER_STAT_KEYS.map((key) => `
          <label>
            <span>${STAT_LABELS[key]}</span>
            <input type="number" step="1" data-stat="${key}" value="${stats[key]}">
          </label>
        `).join('')}
      </div>
      <div class="party-stats-panel__actions">
        <button type="button" data-action="reset-stats">デフォルトに戻す</button>
        <button type="button" data-action="apply-stats">適用</button>
      </div>
    `;
    panel.querySelector('[data-action="close-stats"]')?.addEventListener('click', () => this.close());
    panel.querySelector('[data-action="reset-stats"]')?.addEventListener('click', () => {
      this.#onChange?.(this.#currentSlotIndex, this.#currentMode, null);
      this.close();
    });
    panel.querySelector('[data-action="apply-stats"]')?.addEventListener('click', () => {
      const value = Object.fromEntries(
        [...panel.querySelectorAll('[data-stat]')].map((input) => [input.dataset.stat, Number(input.value)])
      );
      const normalized = normalizeCharacterStats(value);
      if (!normalized) return;
      this.#onChange?.(this.#currentSlotIndex, this.#currentMode, normalized);
      this.close();
    });
  }

  #positionPanel() {
    const panel = this.#panelEl;
    const anchor = this.#currentAnchorEl;
    if (!panel || !anchor) return;
    const rect = anchor.getBoundingClientRect();
    const width = panel.offsetWidth || 320;
    const left = Math.min(Math.max(8, rect.left), Math.max(8, window.innerWidth - width - 8));
    panel.style.left = `${left}px`;
    const top = Math.min(rect.bottom + 6, window.innerHeight - (panel.offsetHeight || 280) - 8);
    panel.style.top = `${Math.max(8, top)}px`;
  }

  #bindOutsideClick() {
    if (this.#outsideClickHandler) {
      document.removeEventListener('click', this.#outsideClickHandler, true);
    }
    this.#outsideClickHandler = (event) => {
      if (this.#panelEl?.contains(event.target) || this.#currentAnchorEl?.contains(event.target)) {
        return;
      }
      this.close();
    };
    document.addEventListener('click', this.#outsideClickHandler, true);
  }
}
