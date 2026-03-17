import { getExcludedSkillIds, setExcludedSkillIds } from '../utils/skill-filter.js';

/**
 * 生スタイルデータからアクションスキル（非パッシブ）を抽出する。
 * CharacterStyle.getActionSkills() と同等の判定を raw オブジェクトで行う。
 * @param {object} style  store.getStyleById() が返す生スタイルオブジェクト
 * @returns {object[]}
 */
function getActionSkillsFromRaw(style) {
  return (style?.skills ?? []).filter(
    (s) => !(s.passive && typeof s.passive === 'object') && s.sourceType !== 'passive',
  );
}

/**
 * 生スキルデータからコストラベルを生成する（エンジン状態なし・フォールバック）。
 * formatSkillCostLabel と同等の表示形式だが state/member 不要版。
 * @param {object} skill
 * @returns {string}
 */
function rawCostLabel(skill) {
  const consumeType = String(skill.consume_type ?? skill.consumeType ?? 'Sp').toLowerCase();
  const cost = Number(skill.sp_cost ?? skill.spCost ?? 0);
  const n = cost === -1 ? '*' : String(cost);
  if (consumeType === 'token') return `T(${n})`;
  if (consumeType === 'morale') return `M(${n})`;
  if (consumeType === 'ep') return `E(${n})`;
  return `(${n})`;
}

/**
 * スキル絞込フローティングパネル（シングルトン）。
 *
 * mount(containerEl) で DOM を生成し、open(style, anchorEl) で表示・close() で非表示。
 * チェックボックス変更時に localStorage を更新し、
 * `hbr:skill-filter-changed` CustomEvent を dispatch する。
 */
export class SkillFilterPanel {
  #panelEl = null;
  #currentStyle = null;
  #outsideClickHandler = null;

  /**
   * コンテナに fixed パネル DOM を追加する（初期は非表示）。
   * @param {HTMLElement} containerEl
   */
  mount(containerEl) {
    const el = document.createElement('div');
    el.id = 'skill-filter-panel';
    el.className =
      'fixed z-50 bg-white border border-gray-200 rounded-lg shadow-lg p-3 w-64';
    el.style.display = 'none';
    containerEl.appendChild(el);
    this.#panelEl = el;
  }

  /**
   * パネルをアンカー要素の近くに表示してスタイルのスキルリストを描画する。
   * @param {object} style     store.getStyleById() が返す生スタイルオブジェクト
   * @param {HTMLElement} anchorEl  🔧 ボタン要素
   */
  open(style, anchorEl) {
    const panel = this.#panelEl;
    if (!panel) return;

    this.#currentStyle = style;
    const styleId = style?.id;
    const excludedSet = getExcludedSkillIds(styleId);
    const skills = getActionSkillsFromRaw(style);

    panel.innerHTML = `
      <div class="flex justify-between items-center mb-2">
        <span class="text-xs font-bold text-gray-700">スキル絞込</span>
        <div class="flex gap-1">
          <button data-action="select-all"
                  class="text-xs px-1.5 py-0.5 rounded bg-gray-100 text-gray-600
                         hover:bg-gray-200 transition-colors">全選択</button>
          <button data-action="clear-all"
                  class="text-xs px-1.5 py-0.5 rounded bg-gray-100 text-gray-600
                         hover:bg-gray-200 transition-colors">全解除</button>
          <button data-action="close"
                  class="text-xs px-1.5 py-0.5 rounded bg-gray-100 text-gray-400
                         hover:bg-gray-200 transition-colors">✕</button>
        </div>
      </div>
      <div class="flex flex-col gap-1 max-h-64 overflow-y-auto">
        ${skills.map((s) => {
          const skillId = Number(s.id ?? s.skillId);
          const checked = !excludedSet.has(skillId) ? 'checked' : '';
          const cost = rawCostLabel(s);
          const name = String(s.name ?? '');
          return `
            <label class="flex items-center gap-1 text-xs cursor-pointer
                          hover:bg-gray-50 rounded px-1 py-0.5">
              <input type="checkbox" value="${skillId}" ${checked}
                     class="cursor-pointer flex-shrink-0">
              <span class="text-gray-400 flex-shrink-0">${cost}</span>
              <span class="text-gray-700 truncate">${name}</span>
            </label>`;
        }).join('')}
      </div>
    `;

    // パネルを表示してからアンカー位置を計算（offsetHeight が確定してから）
    panel.style.display = 'block';
    const rect = anchorEl.getBoundingClientRect();
    const panelH = panel.offsetHeight || 320;
    const spaceBelow = window.innerHeight - rect.bottom;
    if (spaceBelow >= panelH || spaceBelow >= 200) {
      panel.style.top = `${rect.bottom + 4}px`;
    } else {
      panel.style.top = `${Math.max(4, rect.top - panelH - 4)}px`;
    }
    const left = Math.min(rect.left, window.innerWidth - 264 - 4);
    panel.style.left = `${Math.max(4, left)}px`;

    // イベント登録
    panel.querySelector('[data-action="close"]')?.addEventListener('click', () => this.close());
    panel.querySelector('[data-action="select-all"]')?.addEventListener('click', () => this.#onSelectAll());
    panel.querySelector('[data-action="clear-all"]')?.addEventListener('click', () => this.#onClearAll());
    panel.querySelectorAll('input[type="checkbox"]').forEach((cb) => {
      cb.addEventListener('change', () => this.#onCheckboxChange(Number(cb.value), cb.checked));
    });

    // パネル外クリックで閉じる（現在のクリックイベントが終わってから登録）
    if (this.#outsideClickHandler) {
      document.removeEventListener('click', this.#outsideClickHandler, true);
    }
    this.#outsideClickHandler = (e) => {
      if (!panel.contains(e.target) && e.target !== anchorEl) {
        this.close();
      }
    };
    setTimeout(() => {
      document.addEventListener('click', this.#outsideClickHandler, true);
    }, 0);
  }

  /** パネルを非表示にする。 */
  close() {
    if (!this.#panelEl) return;
    this.#panelEl.style.display = 'none';
    if (this.#outsideClickHandler) {
      document.removeEventListener('click', this.#outsideClickHandler, true);
      this.#outsideClickHandler = null;
    }
    this.#currentStyle = null;
  }

  #onCheckboxChange(skillId, checked) {
    const styleId = this.#currentStyle?.id;
    if (!styleId) return;
    const excludedSet = getExcludedSkillIds(styleId);
    if (checked) {
      excludedSet.delete(skillId);
    } else {
      excludedSet.add(skillId);
    }
    setExcludedSkillIds(styleId, excludedSet);
    document.dispatchEvent(new CustomEvent('hbr:skill-filter-changed', { detail: { styleId } }));
  }

  #onSelectAll() {
    const styleId = this.#currentStyle?.id;
    if (!styleId) return;
    // 全選択 = 除外なし
    setExcludedSkillIds(styleId, new Set());
    this.#panelEl.querySelectorAll('input[type="checkbox"]').forEach((cb) => {
      cb.checked = true;
    });
    document.dispatchEvent(new CustomEvent('hbr:skill-filter-changed', { detail: { styleId } }));
  }

  #onClearAll() {
    const styleId = this.#currentStyle?.id;
    if (!styleId) return;
    const skills = getActionSkillsFromRaw(this.#currentStyle);
    const allIds = new Set(skills.map((s) => Number(s.id ?? s.skillId)));
    setExcludedSkillIds(styleId, allIds);
    this.#panelEl.querySelectorAll('input[type="checkbox"]').forEach((cb) => {
      cb.checked = false;
    });
    document.dispatchEvent(new CustomEvent('hbr:skill-filter-changed', { detail: { styleId } }));
  }
}
