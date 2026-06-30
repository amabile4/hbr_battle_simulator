import {
  normalizeCharacterStats,
} from '../../src/domain/character-stats.js';

const STAT_LABELS = Object.freeze({
  str: '力',
  dex: '器用さ',
  wis: '知性',
  spr: '精神',
  luk: '運',
  con: '体力',
});
const STATS_PANEL_DISPLAY_ORDER = Object.freeze(['str', 'dex', 'con', 'spr', 'wis', 'luk']);

const STAT_DISPLAY_ORDER = Object.freeze(['str', 'dex', 'con', 'spr', 'wis', 'luk']);

export class StatsSettingsPanel {
  #panelEl = null;
  #currentSlotIndex = null;
  #currentMode = 'main';
  #currentAnchorEl = null;
  #currentCharacterLevel = 180;
  #currentStyleLevel = 20;
  #outsideClickHandler = null;
  #resolveSlot = null;
  #resolveDefaults = null;
  #resolveBuildStats = null;
  #buildTemplates = [];
  #onChange = null;

  constructor({
    resolveSlot = null,
    resolveDefaultStats: resolveDefaults = null,
    resolveBuildStats = null,
    buildTemplates = [],
    onChange = null,
  } = {}) {
    this.#resolveSlot = resolveSlot;
    this.#resolveDefaults = resolveDefaults;
    this.#resolveBuildStats = resolveBuildStats;
    this.#buildTemplates = buildTemplates;
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
    const slot = this.#resolveSlot?.(this.#currentSlotIndex);
    this.#currentCharacterLevel = slot?.characterLevel ?? 180;
    this.#currentStyleLevel = slot?.styleLevel ?? 20;
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
    if (this.#resolveDefaults) {
      return normalizeCharacterStats(
        this.#resolveDefaults(this.#currentSlotIndex, this.#currentMode)
      );
    }
    const slot = this.#getCurrentSlot();
    const isSupport = this.#currentMode === 'support';
    const style = isSupport ? slot?.supportStyle : slot?.style;
    const lb = isSupport ? slot?.supportLb : slot?.lb;
    const defaults = normalizeCharacterStats(isSupport ? slot?.supportDefaultStats : slot?.defaultStats)
      ?? resolveDefaultStats(style?.role, lb);
    return isSupport
      ? defaults
      : resolveStatsWithSupport(defaults, slot?.supportStats);
  }

  #resolveCurrentStats() {
    const slot = this.#getCurrentSlot();
    const value = this.#currentMode === 'support' ? slot?.supportStats : slot?.stats;
    return normalizeCharacterStats(value) ?? this.#resolveDefaultStats();
  }

  #fillInputsFromStats(stats) {
    const panel = this.#panelEl;
    if (!panel || !stats) return;
    for (const key of STAT_DISPLAY_ORDER) {
      const input = panel.querySelector(`[data-stat="${key}"]`);
      if (input) input.value = stats[key];
    }
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
    const isMain = this.#currentMode !== 'support';
    const charLevel = this.#currentCharacterLevel;
    const styleLevel = this.#currentStyleLevel;
    const buildOptions = isMain
      ? this.#buildTemplates
          .map((t) => `<option value="${t.value}">${t.label}</option>`)
          .join('')
      : '';

    panel.innerHTML = `
      <div class="party-stats-panel__header">
        <div>
          <strong>${isMain ? 'メイン' : 'サポート'}ステータス</strong>
          <span>${String(style.name ?? '')}</span>
        </div>
        <span class="party-stats-panel__assumptions">転生5・称号12</span>
        <button type="button" class="party-stats-panel__info-btn"
          title="転生5回・称号ランク12として計算しています（装備なし時がデフォルト値）">?</button>
        <button type="button" data-action="close-stats" title="閉じる">×</button>
      </div>
      ${isMain ? `
      <div class="party-stats-panel__build-row">
        <label>キャラLv
          <input type="number" min="1" max="180" data-field="character-level" value="${charLevel}">
        </label>
        <label>スタイルLv
          <input type="number" min="0" max="20" data-field="style-level" value="${styleLevel}">
        </label>
        <label class="party-stats-panel__build-label">テンプレート
          <select data-action="build-template">
            <option value="">-- 選択 --</option>
            ${buildOptions}
          </select>
        </label>
      </div>` : ''}
      <div class="party-stats-panel__grid">
        ${STATS_PANEL_DISPLAY_ORDER.map((key) => `
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
      this.#onChange?.(this.#currentSlotIndex, this.#currentMode, normalized, this.#currentCharacterLevel, this.#currentStyleLevel);
      this.close();
    });

    if (isMain) {
      const levelInput = panel.querySelector('[data-field="character-level"]');
      const buildSelect = panel.querySelector('[data-action="build-template"]');

      const styleLevelInput = panel.querySelector('[data-field="style-level"]');

      const triggerBuildRecalc = (buildId) => {
        const newStats = this.#resolveBuildStats?.(buildId, this.#currentSlotIndex, this.#currentMode, this.#currentCharacterLevel, this.#currentStyleLevel);
        if (newStats) this.#fillInputsFromStats(newStats);
      };

      levelInput?.addEventListener('change', (e) => {
        const v = Math.max(1, Math.min(180, Number(e.target.value) || 180));
        this.#currentCharacterLevel = v;
        e.target.value = v;
        if (buildSelect?.value) triggerBuildRecalc(buildSelect.value);
      });

      styleLevelInput?.addEventListener('change', (e) => {
        const v = Math.max(0, Math.min(20, Number(e.target.value) || 0));
        this.#currentStyleLevel = v;
        e.target.value = v;
        if (buildSelect?.value) triggerBuildRecalc(buildSelect.value);
      });

      buildSelect?.addEventListener('change', (e) => {
        const buildId = e.target.value;
        if (!buildId) return;
        triggerBuildRecalc(buildId);
      });
    }
  }

  #positionPanel() {
    const panel = this.#panelEl;
    const anchor = this.#currentAnchorEl;
    if (!panel || !anchor) return;
    const rect = anchor.getBoundingClientRect();
    const width = panel.offsetWidth || 360;
    const left = Math.min(Math.max(8, rect.left), Math.max(8, window.innerWidth - width - 8));
    panel.style.left = `${left}px`;
    const top = Math.min(rect.bottom + 6, window.innerHeight - (panel.offsetHeight || 320) - 8);
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
