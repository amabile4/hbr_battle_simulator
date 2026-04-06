import { resolveStyleImageUrl, resolveStyleAssetUrl, resolveUiAssetUrl } from '../../src/ui/style-asset-url.js';
import { renderPartySlotStrip } from '../utils/party-slot-strip.js';

function extractCharaName(style) {
  const raw = String(style?.chara ?? '');
  const jpPart = raw.split('—')[0].trim();
  return jpPart || (style?.chara_label ?? '');
}

/** レアリティソート順（A→S→SS=SSR） */
const TIER_ORDER = { A: 0, S: 1, SS: 2, SSR: 2 };
function tierOrder(style) {
  return TIER_ORDER[style.tier] ?? 99;
}

/**
 * styles 配列を team でグループ化し、team 出現順を維持した Map を返す
 * 各グループ内は「キャラ昇順 → レアリティ昇順 → 実装順」でソートする
 */
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
  for (const arr of map.values()) {
    arr.sort((a, b) => {
      const charaDiff =
        (charaOrder.get(a.chara_label) ?? 999) -
        (charaOrder.get(b.chara_label) ?? 999);
      if (charaDiff !== 0) return charaDiff;
      return tierOrder(a) - tierOrder(b);
    });
  }
  return map;
}

// ---- フィルタ定義 ----

const TIER_OPTIONS = ['A', 'S', 'SS', 'SSR'];

const ELEMENT_OPTIONS = [
  { value: '',        label: '無' },
  { value: 'Fire',    label: '火' },
  { value: 'Ice',     label: '氷' },
  { value: 'Thunder', label: '雷' },
  { value: 'Light',   label: '光' },
  { value: 'Dark',    label: '闇' },
];

const WEAPON_TYPE_OPTIONS = [
  { value: 'Slash',  label: '斬' },
  { value: 'Stab',   label: '突' },
  { value: 'Strike', label: '打' },
];

const ROLE_OPTIONS = [
  { value: 'Attacker', short: 'ATK' },
  { value: 'Blaster',  short: 'BLS' },
  { value: 'Breaker',  short: 'BRK' },
  { value: 'Buffer',   short: 'BUF' },
  { value: 'Debuffer', short: 'DEB' },
  { value: 'Defender', short: 'DEF' },
  { value: 'Healer',   short: 'HLR' },
  { value: 'Rider',    short: 'RDR' },
  { value: 'Admiral',  short: 'ADM' },
];

/** フィルタカテゴリ文字列 → #filters のキー */
const FILTER_KEY = { tier: 'tiers', type: 'types', element: 'elements', role: 'roles' };

const ELEMENT_LABEL = { Fire: '火', Ice: '氷', Thunder: '雷', Light: '光', Dark: '闇' };
const DEFAULT_CONTINUOUS_MODE = true;

function filterBarHtml() {
  const ELEMENT_CSS = {
    Fire: 'attr-element-fire', Ice: 'attr-element-ice', Thunder: 'attr-element-thunder',
    Light: 'attr-element-light', Dark: 'attr-element-dark', '': 'attr-element-none',
  };
  const TYPE_CSS = {
    Slash: 'attr-weapon-slash', Stab: 'attr-weapon-stab', Strike: 'attr-weapon-strike',
  };

  const tierBtn = (t) =>
    `<button data-filter-type="tier" data-filter-value="${t}" title="${t}"
             class="w-10 h-10 rounded border border-gray-200 bg-white
                    hover:bg-gray-50 transition-colors flex items-center justify-center shrink-0">
       <img src="${resolveUiAssetUrl(`IconRarity${t}.webp`)}" alt="${t}" class="w-8 h-8 object-contain" />
     </button>`;

  const badgeBtn = (filterType, value, label, cssClass) =>
    `<button data-filter-type="${filterType}" data-filter-value="${value}"
             title="${label}" class="attr-badge ${cssClass}">${label}</button>`;

  const typeBtns = WEAPON_TYPE_OPTIONS
    .map((w) => badgeBtn('type', w.value, w.label, TYPE_CSS[w.value])).join('');
  const elementBtns = ELEMENT_OPTIONS
    .map((e) => badgeBtn('element', e.value, e.label, ELEMENT_CSS[e.value])).join('');

  const roleBtn = (r) =>
    `<button data-filter-type="role" data-filter-value="${r.value}"
             class="text-xs px-2 py-1 rounded border border-gray-200
                    text-gray-600 hover:bg-gray-50 transition-colors leading-tight shrink-0">
       <span class="sm:hidden">${r.short}</span>
       <span class="hidden sm:inline">${r.value}</span>
     </button>`;

  return `
    <div id="picker-filter-bar"
         class="px-3 pt-2 pb-1 flex flex-col gap-1.5">
      <!-- 行1: レアリティ（中央）+ 解除（右端） -->
      <div class="flex items-center">
        <div class="flex-1"></div>
        <div class="flex gap-1.5">
          ${TIER_OPTIONS.map(tierBtn).join('')}
        </div>
        <div class="flex-1 flex justify-end">
          <button id="picker-reset-filters"
                  class="text-xs text-gray-400 hover:text-gray-600 underline leading-none">
            解除
          </button>
        </div>
      </div>
      <!-- 行2: 種別グループ + 属性グループ（support モード時は種別を非表示） -->
      <div class="flex gap-1.5 flex-wrap justify-center items-center">
        <div id="picker-filter-weapon-group" class="flex gap-1.5 shrink-0 items-center">
          ${typeBtns}
        </div>
        <div id="picker-filter-weapon-sep" class="w-px h-5 bg-gray-200 shrink-0"></div>
        <div class="flex gap-1.5 shrink-0 items-center">
          ${elementBtns}
        </div>
      </div>
      <!-- 行3: ロール（support モード時は非表示） -->
      <div id="picker-filter-role-row" class="flex gap-1 flex-wrap justify-center items-center">
        ${ROLE_OPTIONS.map(roleBtn).join('')}
      </div>
    </div>
  `;
}

/**
 * 全画面 Style Picker
 * - overlay 要素に mount する
 * - open(currentStyle?, mode?, mainStyle?, partyContext?) で表示、close() で非表示
 * - main モード: 1クリックで確定
 * - support モード: hover でプレビュー、1クリックで固定、同カードへ2クリック目で確定
 * - 続けて選ぶモード: 確定後に次の空きスロットへ自動進行
 * - slot strip: 現在の選択状態を表示、クリックでスロット切替
 * - support モード: メインの属性でフィルタを自動適用、武器種・ロールフィルタを非表示
 * - 共鳴アビリティ持ちカードに has-resonance クラスで縁取り
 */
export class StylePickerController {
  #overlay;
  #styles;
  #store;
  #onSelect;
  #onDisband;
  #onSlotSwitch; // (slotIndex: number) => void
  #showNames = false;
  #currentStyle = null;
  #mode = 'main'; // 'main' | 'support'
  #filters = { tiers: new Set(), types: new Set(), elements: new Set(), roles: new Set() };
  #supportElementFilter = null; // null | string[]
  #supportResonanceFilter = 'all'; // 'all' | 'has' | 'none'
  #pressedStyleId = null;
  #partyContext = null; // { slots: [{style, supportStyle}], slotIndex, mode }
  #continuousMode = DEFAULT_CONTINUOUS_MODE;
  #lastMainTouchCommitAtMs = 0;

  constructor({ overlay, styles, store = null, onSelect, onDisband = null, onSlotSwitch = null }) {
    this.#overlay = overlay;
    this.#styles = styles;
    this.#store = store;
    this.#onSelect = onSelect;
    this.#onDisband = onDisband;
    this.#onSlotSwitch = onSlotSwitch;
  }

  get isContinuousMode() { return this.#continuousMode; }

  mount() {
    this.#overlay.innerHTML = `
      <div id="picker-backdrop"
           class="fixed inset-0 bg-black/60 flex items-start justify-center pt-8 px-4 pb-4">
        <div class="picker-dialog bg-white rounded-2xl shadow-2xl w-full max-w-6xl flex flex-col">
          <header class="flex items-center gap-3 px-4 py-2.5 border-b border-gray-200 shrink-0">
            <div class="flex items-center gap-2 min-w-0">
              <span id="picker-mode-label" class="font-semibold text-gray-800 text-sm">スタイルを選ぶ</span>
              <button id="picker-disband-party"
                      type="button"
                      class="shrink-0 text-xs px-2 py-1 rounded-md border border-rose-200
                             bg-rose-50 text-rose-600 hover:bg-rose-100 transition-colors
                             disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-rose-50">
                PT解散
              </button>
              <span id="picker-count" class="text-xs text-gray-400 shrink-0"></span>
            </div>
            <div class="ml-auto flex items-center gap-2">
              <button id="picker-continuous-toggle"
                      class="text-xs px-2.5 py-1 rounded-md border border-gray-200
                             text-gray-500 hover:bg-gray-50 transition-colors">
                続けて選ぶ
              </button>
              <button id="picker-toggle-names"
                      class="text-xs px-2.5 py-1 rounded-md border border-gray-200
                             text-gray-500 hover:bg-gray-50 transition-colors">
                名前を表示
              </button>
              <button id="picker-close"
                      class="text-gray-400 hover:text-gray-700 text-lg leading-none px-1.5">✕</button>
            </div>
          </header>
          <!-- 広い画面: strip 左固定 + filter 全幅真中（3カラム grid）/ 狭い画面: 縦積み -->
          <div class="picker-strip-filter-row">
            <div id="picker-slot-strip"
                 class="hidden bg-gray-50 border-r border-gray-100 self-stretch"></div>
            ${filterBarHtml()}
            <div class="picker-strip-filter-balance"></div>
          </div>
          <!-- support モード用詳細パネル（固定高さ必須 — 可変にするとグリッドがシフトしてホバーイベントがループする） -->
          <div id="picker-support-panel"
               class="hidden shrink-0 border-b border-purple-100 ssr-resonance-bg-subtle px-3 py-1.5 flex flex-col gap-1"
               style="height:112px">
            <div class="flex gap-1 shrink-0">
              <button data-resonance-filter="all"
                      class="text-xs px-2 py-0.5 rounded border transition-colors bg-blue-500 text-white border-blue-500">すべて</button>
              <button data-resonance-filter="has"
                      class="text-xs px-2 py-0.5 rounded border transition-colors bg-white text-gray-500 border-gray-200 hover:bg-gray-50">★ 共鳴あり</button>
              <button data-resonance-filter="none"
                      class="text-xs px-2 py-0.5 rounded border transition-colors bg-white text-gray-500 border-gray-200 hover:bg-gray-50">共鳴なし</button>
            </div>
            <div id="picker-support-detail"
                 class="text-xs text-gray-400 italic overflow-y-auto flex-1">
              スタイルにカーソルを合わせると共鳴アビリティを確認できます
            </div>
          </div>
          <div id="picker-body" class="overflow-y-auto flex-1 min-h-0 p-3 flex flex-col gap-3"></div>
        </div>
      </div>
    `;

    this.#overlay.querySelector('#picker-close').addEventListener('click', () => this.close());
    this.#overlay.querySelector('#picker-backdrop').addEventListener('click', (e) => {
      if (e.target === e.currentTarget) this.close();
    });

    this.#overlay.querySelector('#picker-toggle-names').addEventListener('click', () => {
      this.#showNames = !this.#showNames;
      const btn = this.#overlay.querySelector('#picker-toggle-names');
      btn.textContent = this.#showNames ? '名前を隠す' : '名前を表示';
      btn.classList.toggle('bg-blue-50', this.#showNames);
      btn.classList.toggle('border-blue-300', this.#showNames);
      btn.classList.toggle('text-blue-600', this.#showNames);
      this.#renderBody();
    });

    this.#overlay.querySelector('#picker-continuous-toggle').addEventListener('click', () => {
      this.#continuousMode = !this.#continuousMode;
      this.#syncContinuousButton();
    });
    this.#overlay.querySelector('#picker-disband-party').addEventListener('click', () => {
      const button = this.#overlay.querySelector('#picker-disband-party');
      if (button?.disabled) {
        return;
      }
      this.#onDisband?.();
    });
    this.#syncContinuousButton();

    // フィルタボタン
    this.#overlay.querySelectorAll('[data-filter-type]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const set = this.#filters[FILTER_KEY[btn.dataset.filterType]];
        const val = btn.dataset.filterValue;
        if (set.has(val)) set.delete(val); else set.add(val);
        this.#syncFilterButtons();
        this.#renderBody();
      });
    });

    // フィルタ解除
    this.#overlay.querySelector('#picker-reset-filters').addEventListener('click', () => {
      Object.values(this.#filters).forEach((s) => s.clear());
      this.#syncFilterButtons();
      this.#renderBody();
    });

    // 共鳴フィルタートグル
    this.#overlay.querySelectorAll('[data-resonance-filter]').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.#supportResonanceFilter = btn.dataset.resonanceFilter;
        this.#syncResonanceFilterButtons();
        this.#renderBody();
      });
    });

    // slot strip: イベント委譲（re-render をまたいで有効）
    const slotStrip = this.#overlay.querySelector('#picker-slot-strip');
    slotStrip.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-strip-slot]');
      if (!btn || btn.disabled) return;
      const idx = Number(btn.dataset.stripSlot);
      const btnMode = btn.dataset.stripMode;
      const isSameCell =
        idx === this.#partyContext?.slotIndex && btnMode === this.#partyContext?.mode;
      if (!isSameCell && this.#onSlotSwitch) {
        this.#onSlotSwitch(idx, btnMode);
      }
    });

    // body: イベント委譲
    const body = this.#overlay.querySelector('#picker-body');
    const resolveStyleFromButton = (button) => {
      if (!button || button.dataset.disabled) {
        return null;
      }
      return this.#styles.find((style) => style.id === Number(button.dataset.styleId)) ?? null;
    };
    const commitMainStyleSelection = (button) => {
      if (this.#mode !== 'main') {
        return false;
      }
      const style = resolveStyleFromButton(button);
      if (!style) {
        return false;
      }
      this.#onSelect(style);
      if (!this.#continuousMode) {
        this.close();
      }
      return true;
    };

    // メインモード: クリックで即確定
    body.addEventListener('click', (e) => {
      if (Date.now() - this.#lastMainTouchCommitAtMs < 400) {
        return;
      }
      commitMainStyleSelection(e.target.closest('[data-style-id]'));
    });

    // メインモード: touchend でも即確定
    body.addEventListener('touchend', (e) => {
      if (this.#mode !== 'main') return;
      const touch = e.changedTouches[0];
      const target = touch ? document.elementFromPoint(touch.clientX, touch.clientY) : e.target;
      const button = target?.closest?.('[data-style-id]') ?? e.target.closest?.('[data-style-id]');
      if (commitMainStyleSelection(button)) {
        this.#lastMainTouchCommitAtMs = Date.now();
      }
    }, { passive: true });

    // サポートモード: hover でプレビュー
    body.addEventListener('mouseover', (e) => {
      if (this.#mode !== 'support' || this.#pressedStyleId !== null) return;
      const btn = e.target.closest('[data-style-id]');
      if (!btn || btn.dataset.disabled) return;
      const style = this.#styles.find((s) => s.id === Number(btn.dataset.styleId));
      if (style) this.#showSupportDetail(style, false);
    });

    body.addEventListener('mouseleave', () => {
      if (this.#mode !== 'support' || this.#pressedStyleId !== null) return;
      this.#clearSupportDetail();
    });

    // サポートモード: mousedown でプレビュー固定 → mouseup で確定
    body.addEventListener('mousedown', (e) => {
      if (this.#mode !== 'support') return;
      const btn = e.target.closest('[data-style-id]');
      if (!btn || btn.dataset.disabled) return;
      const styleId = Number(btn.dataset.styleId);
      const style = this.#styles.find((s) => s.id === styleId);
      if (!style) return;
      this.#pressedStyleId = styleId;
      this.#showSupportDetail(style, true);
      this.#renderBody();
    });

    body.addEventListener('mouseup', (e) => {
      if (this.#mode !== 'support' || this.#pressedStyleId === null) return;
      const btn = e.target.closest('[data-style-id]');
      const styleId = btn ? Number(btn.dataset.styleId) : null;
      const pressedId = this.#pressedStyleId;
      this.#pressedStyleId = null;
      if (styleId === pressedId) {
        const style = this.#styles.find((s) => s.id === styleId);
        if (style) {
          this.#onSelect(style);
          if (!this.#continuousMode) this.close();
          return;
        }
      }
      this.#renderBody();
    });

    // サポートモード: touchstart でプレビュー固定 → touchend で確定
    // iOS Safari: touchstart 内で #renderBody() を呼ぶと touch target 要素が DOM から
    // 破棄されて touchcancel が発火し、#pressedStyleId がリセットされてしまう。
    // 代わりに直接 classList 操作で amber ring を付与し、DOM 再構築を避ける。
    body.addEventListener('touchstart', (e) => {
      if (this.#mode !== 'support') return;
      const btn = e.target.closest('[data-style-id]');
      if (!btn || btn.dataset.disabled) return;
      const styleId = Number(btn.dataset.styleId);
      const style = this.#styles.find((s) => s.id === styleId);
      if (!style) return;
      this.#pressedStyleId = styleId;
      this.#showSupportDetail(style, true);
      // #renderBody() を呼ばず直接 DOM を更新（iOS touchcancel 防止）
      btn.classList.add('ring-2', 'ring-amber-400', 'bg-amber-50');
    }, { passive: true });

    body.addEventListener('touchend', (e) => {
      if (this.#mode !== 'support' || this.#pressedStyleId === null) return;
      const touch = e.changedTouches[0];
      const target = document.elementFromPoint(touch.clientX, touch.clientY);
      const btn = target?.closest('[data-style-id]');
      const styleId = btn ? Number(btn.dataset.styleId) : null;
      const pressedId = this.#pressedStyleId;
      this.#pressedStyleId = null;
      if (styleId === pressedId) {
        const style = this.#styles.find((s) => s.id === styleId);
        if (style) {
          this.#onSelect(style);
          if (!this.#continuousMode) this.close();
          else this.#renderBody();
          return;
        }
      }
      this.#clearSupportDetail();
      this.#renderBody();
    }, { passive: true });

    body.addEventListener('touchcancel', () => {
      this.#pressedStyleId = null;
      this.#clearSupportDetail();
      this.#renderBody();
    }, { passive: true });
  }

  open(currentStyle = null, mode = 'main', mainStyle = null, partyContext = null) {
    this.#currentStyle = currentStyle;
    this.#mode = mode;
    this.#pressedStyleId = null;
    this.#partyContext = partyContext;

    if (mode === 'support') {
      this.#supportElementFilter = mainStyle?.elements ?? null;
    } else {
      this.#supportElementFilter = null;
    }

    // ヘッダー: スロット番号 + モード表示
    const modeLabel = this.#overlay.querySelector('#picker-mode-label');
    if (modeLabel) {
      const slotText = partyContext != null ? `スロット${partyContext.slotIndex + 1} ` : '';
      if (mode === 'support') {
        const mainEls = this.#supportElementFilter;
        const elText = mainEls && mainEls.length > 0
          ? ` [${mainEls.map((e) => ELEMENT_LABEL[e] ?? e).join('・')}属性]`
          : mainEls !== null ? ' [無属性]' : '';
        modeLabel.textContent = `${slotText}サポートスタイルを選ぶ${elText}`;
      } else {
        modeLabel.textContent = `${slotText}メインスタイルを選ぶ`;
      }
    }

    // slot strip
    this.#renderSlotStrip();
    this.#syncDisbandButton();

    // support パネル
    const supportPanel = this.#overlay.querySelector('#picker-support-panel');
    if (supportPanel) {
      supportPanel.classList.toggle('hidden', mode !== 'support');
    }
    if (mode === 'support') {
      this.#supportResonanceFilter = 'all';
      this.#syncResonanceFilterButtons();
      this.#clearSupportDetail();
    }

    // support モード: 武器種・ロールフィルタを非表示
    const isSupport = mode === 'support';
    ['picker-filter-weapon-group', 'picker-filter-weapon-sep', 'picker-filter-role-row'].forEach((id) => {
      this.#overlay.querySelector(`#${id}`)?.classList.toggle('hidden', isSupport);
    });

    this.#renderBody();
    this.#overlay.classList.remove('hidden');
  }

  close() {
    this.#overlay.classList.add('hidden');
  }

  // ---- private ----

  #renderSlotStrip() {
    const strip = this.#overlay.querySelector('#picker-slot-strip');
    if (!strip) return;

    if (!this.#partyContext) {
      strip.classList.add('hidden');
      return;
    }

    strip.classList.remove('hidden');
    const { slots, slotIndex, mode } = this.#partyContext;
    strip.innerHTML = renderPartySlotStrip({
      slots,
      activeSlotIndex: slotIndex,
      activeMode: mode,
      variant: 'picker',
    });
  }

  #syncContinuousButton() {
    const btn = this.#overlay.querySelector('#picker-continuous-toggle');
    if (!btn) return;
    btn.classList.toggle('bg-green-50', this.#continuousMode);
    btn.classList.toggle('border-green-400', this.#continuousMode);
    btn.classList.toggle('text-green-700', this.#continuousMode);
    btn.classList.toggle('text-gray-500', !this.#continuousMode);
    btn.classList.toggle('border-gray-200', !this.#continuousMode);
  }

  #syncDisbandButton() {
    const btn = this.#overlay.querySelector('#picker-disband-party');
    if (!btn) return;
    const hasSelections = (this.#partyContext?.slots ?? []).some(
      (slot) => Boolean(slot?.style || slot?.supportStyle)
    );
    btn.disabled = !hasSelections;
  }

  #filteredStyles() {
    const { tiers, types, elements, roles } = this.#filters;
    return this.#styles.filter((style) => {
      // support モードの属性制約（メインスタイルの属性と一致するもののみ）
      if (this.#supportElementFilter !== null) {
        const mainEls = this.#supportElementFilter;
        const styleEls = style.elements ?? [];
        if (mainEls.length === 0) {
          if (styleEls.length !== 0) return false;
        } else {
          if (!mainEls.some((e) => styleEls.includes(e))) return false;
        }
      }
      // 共鳴フィルター（support モード時のみ）
      if (this.#mode === 'support' && this.#supportResonanceFilter !== 'all') {
        const hasResonance = !!(style.resonance);
        if (this.#supportResonanceFilter === 'has' && !hasResonance) return false;
        if (this.#supportResonanceFilter === 'none' && hasResonance) return false;
      }
      if (tiers.size > 0 && !tiers.has(style.tier)) return false;
      if (types.size > 0 && !types.has(style.type)) return false;
      if (elements.size > 0) {
        const els = style.elements ?? [];
        const match = [...elements].some((e) => (e === '' ? els.length === 0 : els.includes(e)));
        if (!match) return false;
      }
      if (roles.size > 0 && !roles.has(style.role)) return false;
      return true;
    });
  }

  #syncFilterButtons() {
    this.#overlay.querySelectorAll('[data-filter-type]').forEach((btn) => {
      const set = this.#filters[FILTER_KEY[btn.dataset.filterType]];
      const active = set.has(btn.dataset.filterValue);
      if (btn.classList.contains('attr-badge')) {
        btn.classList.toggle('active', active);
      } else {
        btn.classList.toggle('ring-2', active);
        btn.classList.toggle('ring-blue-400', active);
        btn.classList.toggle('ring-inset', active);
      }
    });
  }

  #syncResonanceFilterButtons() {
    this.#overlay.querySelectorAll('[data-resonance-filter]').forEach((btn) => {
      const active = btn.dataset.resonanceFilter === this.#supportResonanceFilter;
      btn.className = [
        'text-xs px-2 py-0.5 rounded border transition-colors',
        active
          ? 'bg-blue-500 text-white border-blue-500'
          : 'bg-white text-gray-500 border-gray-200 hover:bg-gray-50',
      ].join(' ');
    });
  }

  #renderBody() {
    const body = this.#overlay.querySelector('#picker-body');
    const count = this.#overlay.querySelector('#picker-count');
    const prevScrollTop = body?.scrollTop ?? 0;
    const selectedId = this.#currentStyle?.id ?? null;
    const pressedId = this.#pressedStyleId;
    // サポートモード: すでにメインにセット済みのスタイルは選択不可
    const mainStyleIds = this.#mode === 'support'
      ? new Set((this.#partyContext?.slots ?? []).map((s) => s.style?.id).filter(Boolean))
      : new Set();

    const filtered = this.#filteredStyles();
    if (count) count.textContent = `${filtered.length} / ${this.#styles.length} 件`;

    const iconSize = this.#showNames ? 'w-14 h-14' : 'w-11 h-11';
    const minColWidth = this.#showNames ? '64px' : '50px';

    const grouped = groupByTeam(filtered);
    const sections = [];

    for (const [team, styles] of grouped) {
      const firstStyle = styles[0];
      const charaIconUrl = firstStyle?.chara_icon
        ? resolveStyleAssetUrl(firstStyle.chara_icon)
        : '';

      const cards = styles.map((style) => {
        const imageUrl = resolveStyleImageUrl(style);
        const isPressed = style.id === pressedId;
        const isSelected = style.id === selectedId;
        // サポートモード: メインにセット済みは選択不可（グレーアウト）
        const isDisabled = mainStyleIds.has(style.id);
        const ringClass = isDisabled
          ? 'opacity-30 cursor-not-allowed'
          : isPressed
          ? 'ring-2 ring-amber-400 bg-amber-50'
          : isSelected
          ? 'ring-2 ring-blue-500 bg-blue-50'
          : 'hover:ring-1 hover:ring-blue-300 hover:bg-blue-50 cursor-pointer';
        // 共鳴アビリティ持ちは outline で縁取り（ring と衝突しない）
        const resonanceCls = (this.#mode === 'support' && style.resonance && !isDisabled) ? 'has-resonance' : '';
        const charaName = extractCharaName(style);
        const disabledTitle = isDisabled ? '（メインにセット済み）' : '';
        const titleAttr = `[${style.name}] ${charaName}${disabledTitle}`;

        const nameHtml = this.#showNames
          ? `<span class="text-gray-500 text-center w-full block px-0.5"
                 style="font-size:9px;line-height:1.3;display:-webkit-box;
                        -webkit-box-orient:vertical;-webkit-line-clamp:2;
                        overflow:hidden;word-break:break-all">${style.name}</span>`
          : '';

        return `
          <button data-style-id="${style.id}" title="${titleAttr}"
                  ${isDisabled ? 'data-disabled="true"' : ''}
                  class="flex flex-col items-center rounded-lg p-0.5
                         transition-all shrink-0 ${ringClass} ${resonanceCls}">
            ${imageUrl
              ? `<img src="${imageUrl}" alt=""
                      class="${iconSize} object-cover rounded-md bg-gray-100 block" loading="lazy" />`
              : `<div class="${iconSize} rounded-md bg-gray-100 flex items-center justify-center
                            text-gray-300 text-lg">?</div>`
            }
            ${nameHtml}
          </button>
        `;
      }).join('');

      sections.push(`
        <div class="team-section flex gap-2 items-start">
          <!-- ラベル固定列: アイコンの折り返し時もここには入らない -->
          <div class="shrink-0 flex flex-col items-center gap-0.5 pt-1" style="width:40px">
            ${charaIconUrl
              ? `<img src="${charaIconUrl}" alt="${team}"
                      class="w-6 h-6 rounded-full object-cover bg-gray-100" />`
              : ''
            }
            <span class="font-bold text-gray-400 tracking-wide text-center leading-tight"
                  style="font-size:10px">${team}</span>
          </div>
          <!-- アイコン列: 折り返してもラベル列に食い込まない -->
          <div class="flex flex-wrap gap-1 min-w-0 flex-1">
            ${cards}
          </div>
        </div>
      `);
    }

    body.innerHTML = sections.join('');
    body.scrollTop = prevScrollTop;
  }

  #showSupportDetail(style, pinned) {
    const detail = this.#overlay.querySelector('#picker-support-detail');
    if (!detail) return;

    const charaName = extractCharaName(style);
    const group = this.#store?.getSupportGroupByLabel(style.resonance);
    const maxEntry = group ? group.list[group.list.length - 1] : null;

    const resonanceHtml = maxEntry?.passive
      ? `<div class="mt-0.5">
           <span class="font-semibold text-purple-700">${maxEntry.passive.name}</span>
           <span class="text-gray-400 ml-1">（LB${maxEntry.lb_lv} MAX）</span>
           <div class="text-gray-600 mt-0.5 whitespace-pre-wrap leading-snug">${maxEntry.passive.desc}</div>
         </div>`
      : `<span class="text-gray-400 ml-1">（共鳴アビリティなし）</span>`;

    const hintHtml = pinned
      ? `<div class="mt-1 text-amber-600 font-semibold">▶ もう一度クリックで選択確定</div>`
      : `<div class="mt-0.5 text-gray-400">クリックで固定 → もう一度クリックで確定</div>`;

    detail.className = 'text-xs overflow-y-auto flex-1';
    detail.innerHTML = `
      <div>
        <span class="font-medium text-gray-700">${style.name}</span>
        <span class="text-gray-400 ml-1">${charaName}</span>
        ${resonanceHtml}
        ${hintHtml}
      </div>
    `;
  }

  #clearSupportDetail() {
    const detail = this.#overlay.querySelector('#picker-support-detail');
    if (detail) {
      detail.className = 'text-xs text-gray-400 italic overflow-y-auto flex-1';
      detail.innerHTML = 'スタイルにカーソルを合わせると共鳴アビリティを確認できます';
    }
  }
}
