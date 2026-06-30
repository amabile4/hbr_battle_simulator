import { resolveStyleImageUrl, resolveStyleAssetUrl, resolveUiAssetUrl } from '../../src/ui/style-asset-url.js';
import {
  readStyleOwnership,
  writeStyleOwnership,
  resolveOwnershipState,
  cycleOwnershipState,
} from '../utils/style-ownership-store.js';

const TIERS = ['A', 'S', 'SS', 'SSR'];

function extractCharaName(style) {
  const raw = String(style?.chara ?? '');
  const jpPart = raw.split('—')[0].trim();
  return jpPart || (style?.chara_label ?? '');
}

function groupByTeam(styles) {
  const charaOrder = new Map();
  for (const style of styles) {
    if (!charaOrder.has(style.chara_label)) {
      charaOrder.set(style.chara_label, charaOrder.size);
    }
  }
  const map = new Map();
  for (const style of styles) {
    const team = style.team ?? '';
    if (!map.has(team)) map.set(team, []);
    map.get(team).push(style);
  }
  const TIER_ORDER = { A: 0, S: 1, SS: 2, SSR: 2 };
  for (const arr of map.values()) {
    arr.sort((a, b) => {
      const diff = (charaOrder.get(a.chara_label) ?? 999) - (charaOrder.get(b.chara_label) ?? 999);
      return diff !== 0 ? diff : (TIER_ORDER[a.tier] ?? 99) - (TIER_ORDER[b.tier] ?? 99);
    });
  }
  return map;
}

function chipClass(state, lbMax) {
  if (state === null) return 'sop-card__chip--unowned';
  if (state === 0) return 'sop-card__chip--lb0';
  if (state >= lbMax) return 'sop-card__chip--lbmax';
  return 'sop-card__chip';
}

function chipLabel(state) {
  return state === null ? '未所持' : `限突 ${state}`;
}

export class StyleOwnershipPanel {
  #overlayEl = null;
  #store = null;
  #entries = {};
  #filters = new Set(TIERS);

  #onChanged = null;

  constructor({ store, onChanged = null }) {
    this.#store = store;
    this.#onChanged = onChanged;
  }

  mount(containerEl) {
    const el = document.createElement('div');
    el.className = 'sop-overlay';
    el.style.display = 'none';
    containerEl.appendChild(el);
    this.#overlayEl = el;
  }

  open() {
    this.#entries = readStyleOwnership();
    this.#render();
    this.#overlayEl.style.display = 'flex';
  }

  close() {
    this.#overlayEl.style.display = 'none';
    this.#overlayEl.innerHTML = '';
  }

  #getActiveBulkTier() {
    const f = [...this.#filters];
    if (f.length === 1) return f[0];
    if (f.length === 2 && f.includes('SS') && f.includes('SSR')) return 'SS+SSR';
    return null;
  }

  #getFilteredStyles() {
    return (this.#store.styles ?? []).filter((s) => this.#filters.has(s.tier));
  }

  #render() {
    const bulkActive = this.#getActiveBulkTier() !== null;
    const tierButtons = TIERS.map((t) => {
      const active = this.#filters.has(t);
      const iconUrl = resolveUiAssetUrl(`IconRarity${t}.webp`);
      return `<button class="sop-tier-btn${active ? ' sop-tier-btn--active' : ''}" data-sop-tier="${t}" title="${t}">
        <img src="${iconUrl}" alt="${t}" style="width:28px;height:28px;object-fit:contain">
      </button>`;
    }).join('');

    const bulkDisabled = bulkActive ? '' : 'disabled';
    const bulkLabel = this.#getActiveBulkTier() ? `（${this.#getActiveBulkTier()}）` : '';

    this.#overlayEl.innerHTML = `
      <div class="sop-dialog">
        <div class="sop-header">
          <span style="font-weight:700;font-size:13px">スタイル所持状況</span>
          <div style="display:flex;gap:4px;align-items:center;margin-left:8px">
            ${tierButtons}
          </div>
          <span style="flex:1"></span>
          <button class="sop-close-btn" data-sop-action="close"
                  style="width:28px;height:28px;border-radius:6px;border:1px solid #e2e8f0;
                         background:#fff;font-size:14px;cursor:pointer">×</button>
        </div>
        <div class="sop-toolbar">
          <span style="font-size:11px;color:#64748b">一括操作${bulkLabel}：</span>
          <button data-sop-bulk="unowned" ${bulkDisabled}
                  style="font-size:11px;padding:3px 10px;border:1px solid #e2e8f0;border-radius:6px;
                         background:#fff;color:#475569;cursor:pointer;
                         ${bulkActive ? '' : 'opacity:0.4;cursor:not-allowed'}">
            全未所持
          </button>
          <button data-sop-bulk="lb0" ${bulkDisabled}
                  style="font-size:11px;padding:3px 10px;border:1px solid #e2e8f0;border-radius:6px;
                         background:#fff;color:#475569;cursor:pointer;
                         ${bulkActive ? '' : 'opacity:0.4;cursor:not-allowed'}">
            全所持・限突0
          </button>
          <button data-sop-bulk="lbmax" ${bulkDisabled}
                  style="font-size:11px;padding:3px 10px;border:1px solid #e2e8f0;border-radius:6px;
                         background:#fff;color:#475569;cursor:pointer;
                         ${bulkActive ? '' : 'opacity:0.4;cursor:not-allowed'}">
            全所持・限突最大
          </button>
        </div>
        <div class="sop-body" id="sop-body">
          ${this.#renderBody()}
        </div>
      </div>
    `;

    this.#bindEvents();
  }

  #renderBody() {
    const filtered = this.#getFilteredStyles();
    if (filtered.length === 0) {
      return '<p style="font-size:12px;color:#94a3b8;padding:16px">フィルターを選択してください</p>';
    }
    const grouped = groupByTeam(filtered);
    const parts = [];
    for (const [team, styles] of grouped) {
      const firstStyle = styles[0];
      const charaName = extractCharaName(firstStyle);
      const charaIconUrl = firstStyle?.chara_icon ? resolveStyleAssetUrl(firstStyle.chara_icon) : '';
      const charaImgHtml = charaIconUrl
        ? `<img src="${charaIconUrl}" alt="${charaName}" style="width:20px;height:20px;border-radius:50%;object-fit:cover;background:#e2e8f0">`
        : '';
      const cards = styles.map((style) => this.#renderCard(style)).join('');
      parts.push(`
        <div class="sop-team-section">
          <div class="sop-team-header">
            ${charaImgHtml}
            <span>${team}</span>
            <span style="color:#94a3b8;font-weight:400">${charaName}</span>
          </div>
          <div class="sop-cards-row">${cards}</div>
        </div>
      `);
    }
    return parts.join('');
  }

  #renderCard(style) {
    const state = resolveOwnershipState(this.#entries, style, this.#store);
    const lbMax = this.#store.getLimitBreakMaxByTier(style.tier);
    const imageUrl = resolveStyleImageUrl(style);
    const imgHtml = imageUrl
      ? `<img class="sop-card__icon" src="${imageUrl}" alt="" loading="lazy">`
      : `<div class="sop-card__icon" style="background:#e2e8f0"></div>`;
    const cls = chipClass(state, lbMax);
    const unownedClass = state === null ? ' sop-card--unowned' : '';
    return `
      <button class="sop-card${unownedClass}" data-sop-style-id="${style.id}"
              title="${style.name} (${style.tier})">
        ${imgHtml}
        <span class="sop-card__name">${style.name}</span>
        <span class="sop-card__chip ${cls}">${chipLabel(state)}</span>
      </button>
    `;
  }

  #updateCardEl(styleId) {
    const btn = this.#overlayEl.querySelector(`[data-sop-style-id="${styleId}"]`);
    if (!btn) return;
    const style = this.#store.getStyleById(Number(styleId));
    if (!style) return;
    const state = resolveOwnershipState(this.#entries, style, this.#store);
    const lbMax = this.#store.getLimitBreakMaxByTier(style.tier);
    const chip = btn.querySelector('.sop-card__chip');
    if (chip) {
      chip.className = `sop-card__chip ${chipClass(state, lbMax)}`;
      chip.textContent = chipLabel(state);
    }
    if (state === null) {
      btn.classList.add('sop-card--unowned');
    } else {
      btn.classList.remove('sop-card--unowned');
    }
  }

  #updateToolbar() {
    const bulkActive = this.#getActiveBulkTier() !== null;
    const bulkLabel = this.#getActiveBulkTier() ? `（${this.#getActiveBulkTier()}）` : '';
    const labelEl = this.#overlayEl.querySelector('.sop-toolbar span');
    if (labelEl) labelEl.textContent = `一括操作${bulkLabel}：`;
    this.#overlayEl.querySelectorAll('[data-sop-bulk]').forEach((btn) => {
      btn.disabled = !bulkActive;
      btn.style.opacity = bulkActive ? '' : '0.4';
      btn.style.cursor = bulkActive ? 'pointer' : 'not-allowed';
    });
  }

  #bindEvents() {
    const overlay = this.#overlayEl;

    // 閉じるボタン
    overlay.querySelector('[data-sop-action="close"]')?.addEventListener('click', () => this.close());

    // オーバーレイ背景クリック
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) this.close();
    });

    // レアリティフィルター
    overlay.querySelectorAll('[data-sop-tier]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const tier = btn.dataset.sopTier;
        if (this.#filters.has(tier)) {
          this.#filters.delete(tier);
          btn.classList.remove('sop-tier-btn--active');
        } else {
          this.#filters.add(tier);
          btn.classList.add('sop-tier-btn--active');
        }
        // ボディ再描画
        const body = overlay.querySelector('#sop-body');
        if (body) body.innerHTML = this.#renderBody();
        this.#updateToolbar();
        // カードイベント再バインド
        this.#bindCardEvents();
      });
    });

    // バルク操作
    overlay.querySelectorAll('[data-sop-bulk]').forEach((btn) => {
      btn.addEventListener('click', () => {
        if (btn.disabled) return;
        const op = btn.dataset.sopBulk;
        const styles = this.#getFilteredStyles();
        for (const style of styles) {
          const lbMax = this.#store.getLimitBreakMaxByTier(style.tier);
          const key = String(style.id);
          if (op === 'unowned') this.#entries[key] = null;
          else if (op === 'lb0') this.#entries[key] = 0;
          else if (op === 'lbmax') this.#entries[key] = lbMax;
        }
        writeStyleOwnership(this.#entries);
        this.#onChanged?.();
        // ボディ再描画
        const body = overlay.querySelector('#sop-body');
        if (body) body.innerHTML = this.#renderBody();
        this.#bindCardEvents();
      });
    });

    this.#bindCardEvents();
  }

  #bindCardEvents() {
    this.#overlayEl.querySelectorAll('[data-sop-style-id]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const styleId = btn.dataset.sopStyleId;
        const style = this.#store.getStyleById(Number(styleId));
        if (!style) return;
        const lbMax = this.#store.getLimitBreakMaxByTier(style.tier);
        const current = resolveOwnershipState(this.#entries, style, this.#store);
        this.#entries[String(styleId)] = cycleOwnershipState(current, lbMax);
        writeStyleOwnership(this.#entries);
        this.#onChanged?.();
        this.#updateCardEl(styleId);
      });
    });
  }
}
