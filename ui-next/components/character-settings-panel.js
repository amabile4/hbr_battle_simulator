import { resolveStyleAssetUrl } from '../../src/ui/style-asset-url.js';
import {
  readCharacterSettings,
  writeCharacterSettings,
  resolveTitleRank,
  resolveReincarnation,
  DEFAULT_TITLE_RANK,
  DEFAULT_REINCARNATION,
  MAX_TITLE_RANK,
  MAX_REINCARNATION,
} from '../utils/character-settings-store.js';

function extractCharaName(character) {
  const raw = String(character?.name ?? '');
  return raw.split('—')[0].trim() || String(character?.label ?? '');
}

/** styles から chara_label → chara_icon のマップを構築 */
function buildIconMap(styles) {
  const map = new Map();
  for (const style of styles ?? []) {
    if (!map.has(style.chara_label) && style.chara_icon) {
      map.set(style.chara_label, style.chara_icon);
    }
  }
  return map;
}

function clampInt(value, min, max) {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, n));
}

export class CharacterSettingsPanel {
  #overlayEl = null;
  #store = null;
  #settings = {};
  #iconMap = null;

  #onChanged = null;

  constructor({ store, onChanged = null }) {
    this.#store = store;
    this.#onChanged = onChanged;
  }

  mount(containerEl) {
    const el = document.createElement('div');
    el.className = 'csp-overlay';
    el.style.display = 'none';
    containerEl.appendChild(el);
    this.#overlayEl = el;
    this.#iconMap = buildIconMap(this.#store.styles);
  }

  open() {
    this.#settings = readCharacterSettings();
    this.#render();
    this.#overlayEl.style.display = 'flex';
  }

  close() {
    this.#overlayEl.style.display = 'none';
    this.#overlayEl.innerHTML = '';
  }

  #render() {
    const characters = this.#store.characters ?? [];
    const rows = characters.map((c) => this.#renderRow(c)).join('');

    this.#overlayEl.innerHTML = `
      <div class="csp-dialog">
        <div class="csp-header">
          <span style="font-weight:700;font-size:13px">キャラクター設定（転生・称号）</span>
          <span style="flex:1"></span>
          <button data-csp-action="close"
                  style="width:28px;height:28px;border-radius:6px;border:1px solid #e2e8f0;
                         background:#fff;font-size:14px;cursor:pointer">×</button>
        </div>

        <div class="csp-bulk-row">
          <span class="csp-bulk-label">全員一括変更：</span>
          <label class="csp-bulk-field">
            <span>称号レベル</span>
            <input type="number" min="0" max="${MAX_TITLE_RANK}" step="1"
                   data-csp-bulk="titleRank" placeholder="${DEFAULT_TITLE_RANK}"
                   class="csp-number-input">
          </label>
          <label class="csp-bulk-field">
            <span>転生</span>
            <input type="number" min="0" max="${MAX_REINCARNATION}" step="1"
                   data-csp-bulk="reincarnation" placeholder="${DEFAULT_REINCARNATION}"
                   class="csp-number-input">
          </label>
          <button data-csp-action="apply-bulk" class="csp-apply-btn">適用</button>
        </div>

        <div class="csp-body">
          <div class="csp-table-header">
            <span class="csp-col-chara">キャラクター</span>
            <span class="csp-col-title">称号レベル <span class="csp-range">0〜${MAX_TITLE_RANK}</span></span>
            <span class="csp-col-reinc">転生 <span class="csp-range">0〜${MAX_REINCARNATION}</span></span>
          </div>
          ${rows}
        </div>
      </div>
    `;

    this.#bindEvents();
  }

  #renderRow(character) {
    const label = String(character.label ?? '');
    const name = extractCharaName(character);
    const iconFile = this.#iconMap?.get(label) ?? '';
    const iconUrl = iconFile ? resolveStyleAssetUrl(iconFile) : '';
    const titleRank = resolveTitleRank(this.#settings, label);
    const reincarnation = resolveReincarnation(this.#settings, label);
    const isDefault = !(label in this.#settings);
    const defaultClass = isDefault ? ' csp-row--default' : '';

    const iconHtml = iconUrl
      ? `<img src="${iconUrl}" alt="${name}" class="csp-chara-icon">`
      : `<span class="csp-chara-icon csp-chara-icon--placeholder"></span>`;

    return `
      <div class="csp-row${defaultClass}" data-csp-chara="${label}">
        <span class="csp-col-chara">
          ${iconHtml}
          <span class="csp-chara-name">${name}</span>
        </span>
        <span class="csp-col-title">
          <input type="number" min="0" max="${MAX_TITLE_RANK}" step="1"
                 value="${titleRank}" data-csp-field="titleRank"
                 class="csp-number-input${isDefault ? ' csp-input--default' : ''}">
        </span>
        <span class="csp-col-reinc">
          <input type="number" min="0" max="${MAX_REINCARNATION}" step="1"
                 value="${reincarnation}" data-csp-field="reincarnation"
                 class="csp-number-input${isDefault ? ' csp-input--default' : ''}">
        </span>
      </div>
    `;
  }

  #bindEvents() {
    const overlay = this.#overlayEl;

    overlay.querySelector('[data-csp-action="close"]')?.addEventListener('click', () => this.close());
    overlay.addEventListener('click', (e) => { if (e.target === overlay) this.close(); });

    // 一括適用
    overlay.querySelector('[data-csp-action="apply-bulk"]')?.addEventListener('click', () => {
      const bulkTitle = overlay.querySelector('[data-csp-bulk="titleRank"]');
      const bulkReinc = overlay.querySelector('[data-csp-bulk="reincarnation"]');
      const hasTitleValue = bulkTitle?.value !== '';
      const hasReincValue = bulkReinc?.value !== '';
      if (!hasTitleValue && !hasReincValue) return;

      const titleVal = hasTitleValue ? clampInt(bulkTitle.value, 0, MAX_TITLE_RANK) : null;
      const reincVal = hasReincValue ? clampInt(bulkReinc.value, 0, MAX_REINCARNATION) : null;

      for (const character of this.#store.characters ?? []) {
        const label = String(character.label ?? '');
        const existing = this.#settings[label] ?? {
          titleRank: DEFAULT_TITLE_RANK,
          reincarnation: DEFAULT_REINCARNATION,
        };
        this.#settings[label] = {
          titleRank: titleVal !== null ? titleVal : existing.titleRank,
          reincarnation: reincVal !== null ? reincVal : existing.reincarnation,
        };
      }
      writeCharacterSettings(this.#settings);
      this.#onChanged?.();

      // 入力欄を更新（再レンダリングなしで個別更新）
      for (const row of overlay.querySelectorAll('[data-csp-chara]')) {
        const label = row.dataset.cspChara;
        const titleInput = row.querySelector('[data-csp-field="titleRank"]');
        const reincInput = row.querySelector('[data-csp-field="reincarnation"]');
        const s = this.#settings[label];
        if (titleInput && s) titleInput.value = s.titleRank;
        if (reincInput && s) reincInput.value = s.reincarnation;
        row.classList.remove('csp-row--default');
        titleInput?.classList.remove('csp-input--default');
        reincInput?.classList.remove('csp-input--default');
      }
      // 一括入力欄をリセット
      if (bulkTitle) bulkTitle.value = '';
      if (bulkReinc) bulkReinc.value = '';
    });

    // 個別行の入力（change イベント）
    overlay.querySelectorAll('[data-csp-chara]').forEach((row) => {
      const label = row.dataset.cspChara;
      const titleInput = row.querySelector('[data-csp-field="titleRank"]');
      const reincInput = row.querySelector('[data-csp-field="reincarnation"]');

      const save = () => {
        const titleVal = clampInt(titleInput?.value, 0, MAX_TITLE_RANK);
        const reincVal = clampInt(reincInput?.value, 0, MAX_REINCARNATION);
        if (titleInput) titleInput.value = titleVal;
        if (reincInput) reincInput.value = reincVal;
        this.#settings[label] = { titleRank: titleVal, reincarnation: reincVal };
        writeCharacterSettings(this.#settings);
        this.#onChanged?.();
        row.classList.remove('csp-row--default');
        titleInput?.classList.remove('csp-input--default');
        reincInput?.classList.remove('csp-input--default');
      };

      titleInput?.addEventListener('change', save);
      reincInput?.addEventListener('change', save);

      // 非数字キーを弾く（入力中）
      [titleInput, reincInput].forEach((input) => {
        if (!input) return;
        input.addEventListener('keydown', (e) => {
          const allowed = ['Backspace','Delete','Tab','Enter','ArrowLeft','ArrowRight','ArrowUp','ArrowDown'];
          if (allowed.includes(e.key)) return;
          if (!/^\d$/.test(e.key)) e.preventDefault();
        });
      });
    });
  }
}
