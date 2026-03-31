import { createEmptyPartySlots, renderPartySlotStrip } from '../utils/party-slot-strip.js';

const PRESET_COUNT = 20;
const LONG_PRESS_DURATION_MS = 420;
const POPOVER_MARGIN_PX = 8;
const CIRCLED_NUMBERS = Object.freeze(
  Array.from({ length: PRESET_COUNT }, (_, index) => String.fromCodePoint(0x2460 + index))
);

function normalizePresetName(name) {
  const normalized = String(name ?? '').trim();
  return normalized ? normalized : '';
}

function normalizePresetEntry(entry, index) {
  if (!entry || typeof entry !== 'object') {
    return {
      index,
      symbol: CIRCLED_NUMBERS[index],
      hasPreset: false,
      title: `プリセット ${index + 1}`,
      name: '',
      label: '',
      savedAt: '',
      slots: createEmptyPartySlots(),
    };
  }

  const name = normalizePresetName(entry.name);
  const label = String(entry.label ?? '').trim();
  return {
    index,
    symbol: CIRCLED_NUMBERS[index],
    hasPreset: true,
    title: name || label || `プリセット ${index + 1}`,
    name,
    label,
    savedAt: String(entry.savedAt ?? ''),
    slots: Array.isArray(entry.slots) ? entry.slots : createEmptyPartySlots(),
  };
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function formatPresetMeta(entry) {
  if (!entry.hasPreset) {
    return '未保存';
  }
  if (entry.name && entry.label) {
    return entry.label;
  }
  return entry.title;
}

function renderPreviewCard(entry) {
  const title = escapeHtml(entry.title);
  return `
    <div class="party-preset-toolbar__preview-card">
      <div class="party-preset-toolbar__preview-title">${title}</div>
      <div class="party-preset-toolbar__preview-meta">${escapeHtml(formatPresetMeta(entry))}</div>
      ${renderPartySlotStrip({ slots: entry.slots, variant: 'presetPreview' })}
    </div>
  `;
}

export class PartyPresetToolbarController {
  #root;
  #getPresetPreviews;
  #onLoadPreset;
  #onSavePreset;
  #onRenamePreset;
  #onClearPreset;
  #onError;
  #entries = [];
  #scroller = null;
  #overflowIndicator = null;
  #hoverPreview = null;
  #actionMenu = null;
  #actionState = null;
  #longPressTimer = null;
  #suppressClickIndex = null;
  #resizeObserver = null;

  constructor({
    root,
    getPresetPreviews,
    onLoadPreset,
    onSavePreset,
    onRenamePreset,
    onClearPreset,
    onError = null,
  }) {
    this.#root = root;
    this.#getPresetPreviews = getPresetPreviews;
    this.#onLoadPreset = onLoadPreset;
    this.#onSavePreset = onSavePreset;
    this.#onRenamePreset = onRenamePreset;
    this.#onClearPreset = onClearPreset;
    this.#onError = onError;
  }

  mount() {
    if (!this.#root) {
      return;
    }
    this.#root.innerHTML = `
      <div class="party-preset-toolbar__scroller" data-role="preset-scroller"></div>
      <div class="party-preset-toolbar__overflow-indicator" data-role="preset-overflow-indicator" hidden>…</div>
      <div class="party-preset-toolbar__hover-preview" data-role="preset-hover-preview" hidden></div>
      <div class="party-preset-toolbar__action-menu" data-role="preset-action-menu" hidden></div>
    `;

    this.#scroller = this.#root.querySelector('[data-role="preset-scroller"]');
    this.#overflowIndicator = this.#root.querySelector('[data-role="preset-overflow-indicator"]');
    this.#hoverPreview = this.#root.querySelector('[data-role="preset-hover-preview"]');
    this.#actionMenu = this.#root.querySelector('[data-role="preset-action-menu"]');

    this.#scroller?.addEventListener('scroll', () => {
      this.#syncOverflowIndicator();
      this.#hideHoverPreview();
    });
    document.addEventListener('mousedown', this.#handleDocumentMouseDown);
    document.addEventListener('keydown', this.#handleDocumentKeyDown);

    const ResizeObserverCtor = window.ResizeObserver ?? globalThis.ResizeObserver;
    if (ResizeObserverCtor && this.#scroller) {
      this.#resizeObserver = new ResizeObserverCtor(() => this.#syncOverflowIndicator());
      this.#resizeObserver.observe(this.#scroller);
    }

    this.sync();
  }

  unmount() {
    document.removeEventListener('mousedown', this.#handleDocumentMouseDown);
    document.removeEventListener('keydown', this.#handleDocumentKeyDown);
    this.#resizeObserver?.disconnect();
    this.#clearLongPressTimer();
  }

  sync(entries = this.#getPresetPreviews?.()) {
    this.#entries = Array.from({ length: PRESET_COUNT }, (_, index) =>
      normalizePresetEntry(entries?.[index] ?? null, index)
    );
    this.#renderButtons();
    this.#syncOverflowIndicator();

    if (this.#actionState) {
      this.#renderActionMenu();
    }
  }

  #handleDocumentMouseDown = (event) => {
    if (!this.#actionState || !this.#root) {
      return;
    }
    if (this.#root.contains(event.target)) {
      return;
    }
    this.#hideActionMenu();
  };

  #handleDocumentKeyDown = (event) => {
    if (event.key === 'Escape') {
      this.#hideActionMenu();
      this.#hideHoverPreview();
    }
  };

  #renderButtons() {
    if (!this.#scroller) {
      return;
    }
    this.#scroller.innerHTML = this.#entries.map((entry) => `
      <button type="button"
              data-role="party-preset-button"
              data-index="${entry.index}"
              data-filled="${entry.hasPreset ? 'true' : 'false'}"
              class="party-preset-toolbar__button"
              title="${escapeHtml(entry.title)}"
              aria-label="${escapeHtml(entry.title)}">
        ${entry.symbol}
      </button>
    `).join('');

    this.#scroller.querySelectorAll('[data-role="party-preset-button"]').forEach((button) => {
      const index = Number(button.dataset.index);
      button.addEventListener('mouseenter', () => this.#showHoverPreview(index, button));
      button.addEventListener('mouseleave', () => this.#hideHoverPreview());
      button.addEventListener('contextmenu', (event) => {
        event.preventDefault();
        this.#showActionMenu(index, button);
      });
      button.addEventListener('touchstart', () => this.#startLongPress(index, button), {
        passive: true,
      });
      button.addEventListener('touchmove', () => this.#clearLongPressTimer(), { passive: true });
      button.addEventListener('touchend', () => this.#clearLongPressTimer(), { passive: true });
      button.addEventListener('touchcancel', () => this.#clearLongPressTimer(), { passive: true });
      button.addEventListener('click', () => {
        if (this.#suppressClickIndex === index) {
          this.#suppressClickIndex = null;
          return;
        }
        void this.#handleLoad(index);
      });
    });
  }

  async #handleLoad(index) {
    const entry = this.#entries[index];
    if (!entry?.hasPreset) {
      return;
    }
    try {
      const loaded = await this.#onLoadPreset?.(index);
      if (loaded === false) {
        return;
      }
      this.#hideActionMenu();
      this.sync();
    } catch (error) {
      this.#onError?.(error);
    }
  }

  #startLongPress(index, button) {
    this.#clearLongPressTimer();
    this.#longPressTimer = window.setTimeout(() => {
      this.#suppressClickIndex = index;
      this.#showActionMenu(index, button);
    }, LONG_PRESS_DURATION_MS);
  }

  #clearLongPressTimer() {
    if (this.#longPressTimer !== null) {
      window.clearTimeout(this.#longPressTimer);
      this.#longPressTimer = null;
    }
  }

  #showHoverPreview(index, button) {
    const entry = this.#entries[index];
    if (!entry?.hasPreset || this.#actionState || !this.#hoverPreview) {
      return;
    }
    this.#hoverPreview.innerHTML = renderPreviewCard(entry);
    this.#hoverPreview.hidden = false;
    this.#positionPopover(this.#hoverPreview, button);
  }

  #hideHoverPreview() {
    if (this.#hoverPreview) {
      this.#hoverPreview.hidden = true;
    }
  }

  #showActionMenu(index, button) {
    this.#clearLongPressTimer();
    this.#hideHoverPreview();
    this.#actionState = {
      index,
      anchor: button,
      mode: 'menu',
      actionKind: null,
    };
    this.#renderActionMenu();
  }

  #hideActionMenu() {
    this.#actionState = null;
    if (this.#actionMenu) {
      this.#actionMenu.hidden = true;
    }
  }

  #renderActionMenu() {
    if (!this.#actionMenu || !this.#actionState) {
      return;
    }

    const entry = this.#entries[this.#actionState.index];
    const title = escapeHtml(entry.title);

    if (this.#actionState.mode === 'form') {
      const submitLabel = this.#actionState.actionKind === 'rename' ? '名前を更新' : 'この枠へ保存';
      this.#actionMenu.innerHTML = `
        <div class="party-preset-toolbar__menu-card">
          ${renderPreviewCard(entry)}
          <form data-role="preset-name-form" class="party-preset-toolbar__name-form">
            <label class="party-preset-toolbar__name-label" for="preset-name-input-${entry.index}">
              パーティー名
            </label>
            <input id="preset-name-input-${entry.index}"
                   data-role="preset-name-input"
                   class="party-preset-toolbar__name-input"
                   type="text"
                   maxlength="40"
                   value="${escapeHtml(entry.name)}"
                   placeholder="空欄なら名前を保存しない" />
            <p class="party-preset-toolbar__name-hint">空欄で保存すると名前なしのままにします。</p>
            <div class="party-preset-toolbar__menu-actions">
              <button type="submit" class="party-preset-toolbar__menu-button party-preset-toolbar__menu-button--primary">
                ${submitLabel}
              </button>
              <button type="button"
                      data-action="cancel-form"
                      class="party-preset-toolbar__menu-button">
                戻る
              </button>
            </div>
          </form>
        </div>
      `;
      this.#actionMenu.hidden = false;
      this.#positionPopover(this.#actionMenu, this.#actionState.anchor);
      this.#actionMenu
        .querySelector('[data-role="preset-name-form"]')
        ?.addEventListener('submit', (event) => {
          event.preventDefault();
          void this.#submitNameForm();
        });
      this.#actionMenu
        .querySelector('[data-action="cancel-form"]')
        ?.addEventListener('click', () => {
          this.#actionState = {
            ...this.#actionState,
            mode: 'menu',
            actionKind: null,
          };
          this.#renderActionMenu();
        });
      this.#actionMenu.querySelector('[data-role="preset-name-input"]')?.focus();
      return;
    }

    this.#actionMenu.innerHTML = `
      <div class="party-preset-toolbar__menu-card">
        <div class="party-preset-toolbar__menu-header">${entry.symbol} ${title}</div>
        ${entry.hasPreset ? renderPreviewCard(entry) : '<div class="party-preset-toolbar__empty-state">未保存のプリセットです。</div>'}
        <div class="party-preset-toolbar__menu-actions">
          <button type="button"
                  data-action="save"
                  class="party-preset-toolbar__menu-button party-preset-toolbar__menu-button--primary">
            保存
          </button>
          <button type="button"
                  data-action="rename"
                  class="party-preset-toolbar__menu-button"
                  ${entry.hasPreset ? '' : 'disabled'}>
            名前編集
          </button>
          <button type="button"
                  data-action="clear"
                  class="party-preset-toolbar__menu-button party-preset-toolbar__menu-button--danger"
                  ${entry.hasPreset ? '' : 'disabled'}>
            消去
          </button>
        </div>
      </div>
    `;
    this.#actionMenu.hidden = false;
    this.#positionPopover(this.#actionMenu, this.#actionState.anchor);
    this.#actionMenu.querySelectorAll('[data-action]').forEach((button) => {
      button.addEventListener('click', () => {
        void this.#handleMenuAction(button.dataset.action);
      });
    });
  }

  async #handleMenuAction(action) {
    const entry = this.#entries[this.#actionState.index];
    if (!entry) {
      return;
    }

    if (action === 'save' || action === 'rename') {
      this.#actionState = {
        ...this.#actionState,
        mode: 'form',
        actionKind: action,
      };
      this.#renderActionMenu();
      return;
    }

    if (action === 'clear') {
      try {
        const cleared = await this.#onClearPreset?.(entry.index);
        if (cleared === false) {
          return;
        }
        this.#hideActionMenu();
        this.sync();
      } catch (error) {
        this.#onError?.(error);
      }
    }
  }

  async #submitNameForm() {
    const input = this.#actionMenu?.querySelector('[data-role="preset-name-input"]');
    const name = normalizePresetName(input?.value ?? '');
    try {
      if (this.#actionState.actionKind === 'rename') {
        const renamed = await this.#onRenamePreset?.(this.#actionState.index, { name });
        if (renamed === false) {
          return;
        }
      } else {
        const saved = await this.#onSavePreset?.(this.#actionState.index, { name });
        if (saved === false) {
          return;
        }
      }
      this.#hideActionMenu();
      this.sync();
    } catch (error) {
      this.#onError?.(error);
    }
  }

  #positionPopover(popover, anchor) {
    if (!(popover instanceof HTMLElement) || !(anchor instanceof HTMLElement)) {
      return;
    }
    popover.style.left = '0px';
    popover.style.top = '0px';
    const anchorRect = anchor.getBoundingClientRect();
    const popoverRect = popover.getBoundingClientRect();
    const maxLeft = Math.max(POPOVER_MARGIN_PX, window.innerWidth - popoverRect.width - POPOVER_MARGIN_PX);
    const preferredTop = anchorRect.bottom + POPOVER_MARGIN_PX;
    const fallbackTop = anchorRect.top - popoverRect.height - POPOVER_MARGIN_PX;
    const left = Math.min(maxLeft, Math.max(POPOVER_MARGIN_PX, anchorRect.left));
    const top =
      preferredTop + popoverRect.height <= window.innerHeight - POPOVER_MARGIN_PX
        ? preferredTop
        : Math.max(POPOVER_MARGIN_PX, fallbackTop);
    popover.style.left = `${left}px`;
    popover.style.top = `${top}px`;
  }

  #syncOverflowIndicator() {
    if (!this.#scroller || !this.#overflowIndicator) {
      return;
    }
    const hasOverflow = this.#scroller.scrollWidth > this.#scroller.clientWidth + 1;
    const atEnd =
      this.#scroller.scrollLeft + this.#scroller.clientWidth >= this.#scroller.scrollWidth - 1;
    this.#root?.setAttribute('data-overflowing', hasOverflow ? 'true' : 'false');
    this.#scroller.setAttribute('data-overflowing', hasOverflow ? 'true' : 'false');
    this.#overflowIndicator.hidden = !(hasOverflow && !atEnd);
  }
}
