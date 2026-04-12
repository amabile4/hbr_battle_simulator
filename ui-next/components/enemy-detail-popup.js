/**
 * enemy-detail-popup.js
 *
 * 敵の詳細情報popup（敵statusを含む）
 * turn-row / enemy-panel から起動可能な詳細表示モーダル
 *
 * WBS-3c: 敵statusをテーブル形式で表示（必須deliverable）
 */

import {
  buildEnemyStatusTableHtml,
} from '../utils/enemy-status-display.js';
import { resolveUiAssetUrl, resolveSkillTypeAssetUrl } from '../../src/ui/style-asset-url.js';

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const POPUP_CLASS = 'enemy-detail-popup';
const POPUP_OVERLAY_CLASS = 'enemy-detail-popup-overlay';
const POPUP_CONTAINER_CLASS = 'enemy-detail-popup-container';
const SUMMON_BUTTON_ICON_URL = resolveUiAssetUrl('Summon.webp');
const BREAK_BUTTON_ICON_URL = resolveUiAssetUrl('Break.webp');
const KILL_BUTTON_ICON_URL = resolveUiAssetUrl('defeat.webp');
const TALISMAN_ICON_URL = resolveSkillTypeAssetUrl('Talisman.webp');
const DISASTER_ICON_URL = resolveSkillTypeAssetUrl('Disaster.webp');
const ENEMY_POPUP_STATUS_ICON_SIZE_PX = 28;
const ENEMY_POPUP_VIEWPORT_INSET_PERCENT = 10;
const ENEMY_POPUP_CONTAINER_PADDING_PX = 16;
const ENEMY_POPUP_LAYOUT_COLUMN_GAP_PX = 12;
const MIN_MULTI_COLUMN_PANEL_WIDTH_PX = 320;
const ENEMY_POPUP_MULTI_COLUMN_MIN_CONTENT_WIDTH_PX =
  (MIN_MULTI_COLUMN_PANEL_WIDTH_PX * 3) + (ENEMY_POPUP_LAYOUT_COLUMN_GAP_PX * 2);
const BASIC_INFO_EXPANDED_ICON = '▲';
const BASIC_INFO_COLLAPSED_ICON = '▼';
const TALISMAN_PENALTY_PER_LEVEL = 10;
const DISASTER_PENALTY_PER_LEVEL = 7;
const DAMAGE_RATE_DISPLAY_ORDER = Object.freeze([
  ['Slash', '斬'],
  ['Stab', '突'],
  ['Strike', '打'],
  ['Fire', '火'],
  ['Ice', '氷'],
  ['Thunder', '雷'],
  ['Light', '光'],
  ['Dark', '闇'],
  ['Nonelement', '無'],
]);

function normalizeTalismanState(talismanState) {
  const state = talismanState && typeof talismanState === 'object' ? talismanState : {};
  return {
    active: Boolean(state.active),
    level: Math.max(0, Math.floor(Number(state.level ?? 0))),
    maxLevel: Math.max(1, Math.floor(Number(state.maxLevel ?? 10))),
    penaltyPerLevel: Math.max(0, Math.floor(Number(state.penaltyPerLevel ?? TALISMAN_PENALTY_PER_LEVEL))),
  };
}

function formatTalismanPenalty(level) {
  return `全能力-${Math.max(0, Math.floor(Number(level) || 0)) * TALISMAN_PENALTY_PER_LEVEL}`;
}

function normalizeDisasterState(disasterState) {
  const state = disasterState && typeof disasterState === 'object' ? disasterState : {};
  return {
    active: Boolean(state.active),
    level: Math.max(0, Math.floor(Number(state.level ?? 0))),
    maxLevel: Math.max(1, Math.floor(Number(state.maxLevel ?? 10))),
    penaltyPerLevel: Math.max(0, Math.floor(Number(state.penaltyPerLevel ?? DISASTER_PENALTY_PER_LEVEL))),
  };
}

function formatDisasterPenalty(level) {
  return `全能力-${Math.max(0, Math.floor(Number(level) || 0)) * DISASTER_PENALTY_PER_LEVEL}`;
}

function isDisplayableEnemyFieldState(state) {
  if (!state || typeof state !== 'object') {
    return false;
  }
  const active = Boolean(state.active);
  const level = Number(state.level ?? 0);
  return active || level > 0;
}

/**
 * EnemyDetailPopup
 * - 敵の詳細情報（status, OD率, 耐性等）を表示
 * - status テーブルで敵バフ/デバフを表示
 */
export class EnemyDetailPopup {
  #root = null;
  #enemies = [];
  #activeEnemyIndex = 0;
  #collapsedBasicInfoEnemyIndexes = new Set();
  #previewActionFlow = [];
  #toolActions = {};
  #onClose = null;
  #onActiveEnemyIndexChange = null;
  #resolveSkillDescription = null;
  #handleEscKeyDown = null;
  #handleResize = null;
  #layoutPreference = null;

  constructor(options = {}) {
    this.#onClose = typeof options.onClose === 'function' ? options.onClose : null;
    this.#onActiveEnemyIndexChange =
      typeof options.onActiveEnemyIndexChange === 'function'
        ? options.onActiveEnemyIndexChange
        : null;
    this.#resolveSkillDescription =
      typeof options.resolveSkillDescription === 'function'
        ? options.resolveSkillDescription
        : null;
  }

  /**
   * popup を DOM に追加
   * @param {Object} payload - { enemies: Enemy[], activeEnemyIndex?: number } または単体 Enemy
   * @param {number} activeEnemyIndex - 表示開始タブ index（後方互換）
   */
  show(payload, activeEnemyIndex = 0) {
    if (!payload) return;

    const enemies = Array.isArray(payload?.enemies)
      ? payload.enemies
      : [payload];
    this.#enemies = enemies.map((enemy) => structuredClone(enemy));
    this.#previewActionFlow = Array.isArray(payload?.previewActionFlow)
      ? structuredClone(payload.previewActionFlow)
      : [];
    this.#toolActions =
      payload?.toolActions && typeof payload.toolActions === 'object'
        ? payload.toolActions
        : {};
    this.#onActiveEnemyIndexChange =
      typeof payload?.onActiveEnemyIndexChange === 'function'
        ? payload.onActiveEnemyIndexChange
        : this.#onActiveEnemyIndexChange;
    const requestedTabIndex = Number(payload?.activeEnemyIndex ?? activeEnemyIndex ?? 0);
    const maxTabIndex = Math.max(0, this.#enemies.length - 1);
    this.#activeEnemyIndex = Number.isInteger(requestedTabIndex)
      ? Math.min(maxTabIndex, Math.max(0, requestedTabIndex))
      : 0;
    this.#collapsedBasicInfoEnemyIndexes = new Set(
      this.#enemies
        .map((enemy, index) => (enemy?.occupied ? null : index))
        .filter((index) => Number.isInteger(index))
    );
    this.#render();
    return this;
  }

  /**
   * popup を閉じる
   */
  close(options = {}) {
    const shouldNotifyClose = options?.notify !== false;
    if (this.#handleEscKeyDown) {
      document.removeEventListener('keydown', this.#handleEscKeyDown);
      this.#handleEscKeyDown = null;
    }
    if (this.#handleResize) {
      window.removeEventListener('resize', this.#handleResize);
      this.#handleResize = null;
    }
    if (this.#root) {
      this.#root.remove();
      this.#root = null;
      if (shouldNotifyClose) {
        this.#onClose?.();
      }
    }
  }

  getActiveEnemyIndex() {
    return this.#activeEnemyIndex;
  }

  getRootElement() {
    return this.#root;
  }

  #render() {
    // 既存の popup があれば削除
    this.close({ notify: false });

    const html = this.#buildHtml();
    this.#root = document.createElement('div');
    this.#root.className = POPUP_CLASS;
    this.#root.innerHTML = html;

    // オーバーレイクリックで閉じる
    const overlay = this.#root.querySelector(`.${POPUP_OVERLAY_CLASS}`);
    if (overlay) {
      overlay.addEventListener('click', () => this.close());
    }

    // close button クリックで閉じる
    const closeBtn = this.#root.querySelector('[data-role="popup-close"]');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => this.close());
    }

    this.#root.querySelectorAll('[data-role="enemy-popup-tab"]').forEach((tabButton) => {
      tabButton.addEventListener('click', () => {
        const nextTabIndex = Number(tabButton.dataset.enemyTabIndex);
        if (!Number.isInteger(nextTabIndex) || nextTabIndex < 0 || nextTabIndex >= 3) {
          return;
        }
        const handledExternally =
          this.#onActiveEnemyIndexChange?.({
            activeEnemyIndex: nextTabIndex,
            previousEnemyIndex: this.#activeEnemyIndex,
          }) === false;
        if (handledExternally) {
          return;
        }
        this.#activeEnemyIndex = nextTabIndex;
        this.#render();
      });
    });

    this.#root.querySelectorAll('[data-role="enemy-popup-layout-option"]').forEach((toggleButton) => {
      toggleButton.addEventListener('click', () => {
        if (toggleButton.disabled) {
          return;
        }
        const requestedLayout = String(toggleButton.dataset.layoutPreference ?? '').trim();
        if (requestedLayout !== 'wide' && requestedLayout !== 'narrow') {
          return;
        }
        this.#layoutPreference = requestedLayout;
        this.#render();
      });
    });

    this.#root.querySelectorAll('[data-role="enemy-popup-basic-toggle"]').forEach((toggleButton) => {
      toggleButton.addEventListener('click', () => {
        const enemyIndex = Number(toggleButton.dataset.enemyIndex);
        if (!Number.isInteger(enemyIndex) || enemyIndex < 0 || enemyIndex >= 3) {
          return;
        }
        if (this.#collapsedBasicInfoEnemyIndexes.has(enemyIndex)) {
          this.#collapsedBasicInfoEnemyIndexes.delete(enemyIndex);
        } else {
          this.#collapsedBasicInfoEnemyIndexes.add(enemyIndex);
        }
        this.#render();
      });
    });

    this.#root.querySelectorAll('[data-role="enemy-popup-action"]').forEach((actionButton) => {
      actionButton.addEventListener('click', () => {
        if (actionButton.disabled) {
          return;
        }
        const actionType = String(actionButton.dataset.actionType ?? '').trim();
        const callback = this.#toolActions?.[actionType];
        if (typeof callback !== 'function') {
          return;
        }
        const enemyIndex = Number(actionButton.dataset.enemyIndex);
        const result = callback({
          enemyIndex: Number.isInteger(enemyIndex) ? enemyIndex : this.#activeEnemyIndex,
          activeEnemyIndex: this.#activeEnemyIndex,
        });
        if (result?.closePopup === true) {
          this.close();
        }
      });
    });

    // ESC キーで閉じる
    this.#handleEscKeyDown = (e) => {
      if (e.key === 'Escape') {
        this.close();
      }
    };
    document.addEventListener('keydown', this.#handleEscKeyDown);
    this.#handleResize = () => {
      if (!this.#root) {
        return;
      }
      const nextLayoutState = this.#resolveLayoutState(this.#buildEnemyEntries());
      const container = this.#root.querySelector(`.${POPUP_CONTAINER_CLASS}`);
      const currentLayout = String(container?.dataset.layoutMode ?? '');
      const currentForcedNarrow = String(container?.dataset.forcedNarrow ?? '');
      if (
        nextLayoutState.mode !== currentLayout ||
        String(nextLayoutState.forcedNarrow) !== currentForcedNarrow
      ) {
        this.#render();
      }
    };
    window.addEventListener('resize', this.#handleResize);

    // DOM に追加
    document.body.appendChild(this.#root);
  }

  #getPopupContentWidthPx() {
    const existingContainer = this.#root?.querySelector(`.${POPUP_CONTAINER_CLASS}`);
    if (existingContainer) {
      const measuredWidth = Number(existingContainer.getBoundingClientRect().width ?? 0);
      if (Number.isFinite(measuredWidth) && measuredWidth > 0) {
        return Math.max(
          0,
          measuredWidth - (ENEMY_POPUP_CONTAINER_PADDING_PX * 2)
        );
      }
    }
    const viewportWidth = Number(window?.innerWidth ?? 0);
    if (!Number.isFinite(viewportWidth) || viewportWidth <= 0) {
      return 0;
    }
    const insetPx = viewportWidth * (ENEMY_POPUP_VIEWPORT_INSET_PERCENT / 100);
    return Math.max(
      0,
      viewportWidth - (insetPx * 2) - (ENEMY_POPUP_CONTAINER_PADDING_PX * 2)
    );
  }

  #shouldForceNarrowLayout() {
    return this.#getPopupContentWidthPx() < ENEMY_POPUP_MULTI_COLUMN_MIN_CONTENT_WIDTH_PX;
  }

  #resolveAutoLayoutMode(enemies = []) {
    const occupiedCount = enemies.filter((enemy) => enemy?.occupied).length;
    return occupiedCount >= 2 ? 'wide' : 'narrow';
  }

  #resolveLayoutState(enemies = []) {
    const forcedNarrow = this.#shouldForceNarrowLayout();
    if (forcedNarrow) {
      return {
        mode: 'narrow',
        forcedNarrow: true,
      };
    }
    if (this.#layoutPreference === 'wide' || this.#layoutPreference === 'narrow') {
      return {
        mode: this.#layoutPreference,
        forcedNarrow: false,
      };
    }
    return {
      mode: this.#resolveAutoLayoutMode(enemies),
      forcedNarrow: false,
    };
  }

  #buildEnemyEntries() {
    return Array.from({ length: 3 }, (_, index) => {
      const enemy = this.#enemies[index] ?? {};
      const occupied = Boolean(enemy?.occupied);
      return {
        enemyIndex: index,
        name: String(enemy?.name ?? (occupied ? `E${index + 1}` : `E${index + 1} 未使用`)).trim() || `E${index + 1}`,
        statuses: Array.isArray(enemy?.statuses)
          ? structuredClone(enemy.statuses)
          : [],
        ...(enemy?.talismanState ? { talismanState: structuredClone(enemy.talismanState) } : {}),
        ...(enemy?.disasterState ? { disasterState: structuredClone(enemy.disasterState) } : {}),
        occupied,
        alive: Boolean(enemy?.alive),
        broken: Boolean(enemy?.broken),
        dead: Boolean(enemy?.dead),
        canSummon: Boolean(enemy?.canSummon),
        canBreak: Boolean(enemy?.canBreak),
        canKill: Boolean(enemy?.canKill),
        hasPendingBreakOperation: Boolean(enemy?.hasPendingBreakOperation),
        hasPendingKillOperation: Boolean(enemy?.hasPendingKillOperation),
        popupEditorHtml: String(enemy?.popupEditorHtml ?? ''),
        ...(enemy?.od_rate !== undefined ? { od_rate: enemy.od_rate } : {}),
        ...(enemy?.max_d_rate !== undefined ? { max_d_rate: enemy.max_d_rate } : {}),
        ...(enemy?.damageRates ? { damageRates: structuredClone(enemy.damageRates) } : {}),
        ...(enemy?.absorbElements ? { absorbElements: structuredClone(enemy.absorbElements) } : {}),
        ...(enemy?.hp !== undefined ? { hp: enemy.hp } : {}),
        ...(enemy?.maxHp !== undefined ? { maxHp: enemy.maxHp } : {}),
      };
    });
  }

  #buildHtml() {
    const enemies = this.#buildEnemyEntries();
    const layoutState = this.#resolveLayoutState(enemies);
    const layoutMode = layoutState.mode;
    const forcedNarrow = layoutState.forcedNarrow;
    const tabButtonsHtml = enemies.map((enemy, index) => {
      const isActive = index === this.#activeEnemyIndex;
      const stateClass = enemy.dead ? 'is-dead' : enemy.occupied ? 'is-occupied' : 'is-empty';
      return `
        <button type="button"
                data-role="enemy-popup-tab"
                data-enemy-tab-index="${index}"
                class="char-popup-tab ${stateClass} ${isActive ? 'active' : ''}">
          E${index + 1}
        </button>
      `;
    }).join('');
    const layoutToggleHtml = this.#buildLayoutToggleHtml(layoutMode, forcedNarrow);
    const contentHtml = layoutMode === 'wide'
      ? this.#buildWideContentHtml(enemies)
      : this.#buildNarrowContentHtml(enemies);

    return `
      <div class="${POPUP_OVERLAY_CLASS}" style="
        position: fixed; top: 0; left: 0; right: 0; bottom: 0;
        background: rgba(0, 0, 0, 0.5); z-index: 999;
      "></div>

      <div class="${POPUP_CONTAINER_CLASS}" style="
        position: fixed; inset: ${ENEMY_POPUP_VIEWPORT_INSET_PERCENT}%;
        background: #1e293b; border-radius: 12px; box-shadow: 0 20px 60px rgba(0, 0, 0, 0.8);
        z-index: 1000; overflow-y: auto;
        padding: ${ENEMY_POPUP_CONTAINER_PADDING_PX}px; font-family: system-ui, sans-serif;
        border: 1px solid #475569; color: #e2e8f0;
      " data-layout-mode="${layoutMode}" data-forced-narrow="${forcedNarrow ? 'true' : 'false'}">
        <style>
          .${POPUP_CONTAINER_CLASS} [data-role="enemy-popup-tabs"] {
            display: grid;
            grid-template-columns: repeat(3, minmax(0, 1fr));
            gap: 8px;
            flex-shrink: 0;
          }
          .${POPUP_CONTAINER_CLASS} [data-role="enemy-popup-header"] {
            position: relative;
            min-height: 24px;
            margin-bottom: 12px;
          }
          .${POPUP_CONTAINER_CLASS} [data-role="enemy-popup-content"] {
            overflow-y: auto;
            flex: 1;
            padding: 2px 0 0;
          }
          .${POPUP_CONTAINER_CLASS} [data-role="enemy-popup-layout"][data-layout-mode="wide"] {
            display: grid;
            grid-template-columns: repeat(3, minmax(${MIN_MULTI_COLUMN_PANEL_WIDTH_PX}px, 1fr));
            gap: ${ENEMY_POPUP_LAYOUT_COLUMN_GAP_PX}px;
            align-items: start;
          }
          .${POPUP_CONTAINER_CLASS} [data-role="enemy-popup-layout"][data-layout-mode="narrow"] {
            display: flex;
            flex-direction: column;
            gap: ${ENEMY_POPUP_LAYOUT_COLUMN_GAP_PX}px;
          }
          .${POPUP_CONTAINER_CLASS} [data-role="enemy-popup-column"] {
            display: flex;
            flex-direction: column;
            min-width: 0;
          }
          .${POPUP_CONTAINER_CLASS} [data-role="enemy-popup-layout-toggle"] {
            display: inline-flex;
            align-items: center;
            gap: 8px;
            margin: 0 0 12px;
            padding: 4px;
            border: 1px solid #334155;
            border-radius: 999px;
            background: rgba(15, 23, 42, 0.72);
          }
          .${POPUP_CONTAINER_CLASS} [data-role="enemy-popup-layout-option"] {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            min-width: 68px;
            min-height: 30px;
            padding: 0 12px;
            border: none;
            border-radius: 999px;
            background: transparent;
            color: #94a3b8;
            font-size: 12px;
            font-weight: 700;
            cursor: pointer;
          }
          .${POPUP_CONTAINER_CLASS} [data-role="enemy-popup-layout-option"][aria-pressed="true"] {
            background: #dbeafe;
            color: #0f172a;
          }
          .${POPUP_CONTAINER_CLASS} [data-role="enemy-popup-layout-option"]:disabled {
            cursor: not-allowed;
            opacity: 0.45;
          }
          .${POPUP_CONTAINER_CLASS} [data-role="enemy-popup-column"][data-selected="true"] {
            transform: translateY(-1px);
          }
          .${POPUP_CONTAINER_CLASS} [data-role="enemy-popup-action-row"] {
            display: flex;
            align-items: center;
            gap: 10px;
            flex-wrap: wrap;
            min-height: ${ENEMY_POPUP_STATUS_ICON_SIZE_PX + 12}px;
            margin-bottom: 12px;
          }
          .${POPUP_CONTAINER_CLASS} [data-role="enemy-popup-action"] {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            gap: 6px;
            min-height: ${ENEMY_POPUP_STATUS_ICON_SIZE_PX + 10}px;
            border-radius: 10px;
            border: 1px solid rgba(148, 163, 184, 0.22);
            background: rgba(15, 23, 42, 0.08);
            color: #f8fafc;
            font-size: 12px;
            font-weight: 700;
            cursor: pointer;
            padding: 5px 10px;
            box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.08);
          }
          .${POPUP_CONTAINER_CLASS} [data-role="enemy-popup-action"][data-pending="true"] {
            border-color: rgba(251, 191, 36, 0.52);
            background: rgba(251, 191, 36, 0.14);
          }
          .${POPUP_CONTAINER_CLASS} [data-role="enemy-popup-action"][data-action-type="kill"][data-pending="true"] {
            border-color: rgba(251, 113, 133, 0.54);
            background: rgba(251, 113, 133, 0.16);
          }
          .${POPUP_CONTAINER_CLASS} [data-role="enemy-popup-action"]:hover:not(:disabled) {
            background: rgba(255, 255, 255, 0.08);
            border-color: rgba(191, 219, 254, 0.4);
          }
          .${POPUP_CONTAINER_CLASS} [data-role="enemy-popup-action"]:disabled {
            cursor: not-allowed;
            opacity: 0.55;
            border-color: rgba(148, 163, 184, 0.18);
            background: rgba(100, 116, 139, 0.12);
          }
          .${POPUP_CONTAINER_CLASS} [data-role="enemy-popup-action-icon"] {
            width: ${ENEMY_POPUP_STATUS_ICON_SIZE_PX}px;
            height: ${ENEMY_POPUP_STATUS_ICON_SIZE_PX}px;
            object-fit: contain;
            flex-shrink: 0;
            display: block;
            opacity: 1;
            filter: saturate(1.18) brightness(1.1);
          }
          .${POPUP_CONTAINER_CLASS} [data-role="enemy-popup-action"]:disabled [data-role="enemy-popup-action-icon"] {
            filter: grayscale(1) brightness(0.72);
          }
          .${POPUP_CONTAINER_CLASS} [data-role="enemy-popup-action"] span {
            text-shadow: 0 0 8px rgba(15, 23, 42, 0.25);
          }
          .${POPUP_CONTAINER_CLASS} [data-role="enemy-popup-tab"] {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            width: 100%;
            min-width: 0;
          }
          .${POPUP_CONTAINER_CLASS} [data-role="enemy-popup-tab"].is-empty {
            opacity: 0.72;
          }
          .${POPUP_CONTAINER_CLASS} [data-role="enemy-popup-tab"].is-dead {
            box-shadow: inset 0 -2px 0 rgba(248, 113, 113, 0.55);
          }
          .${POPUP_CONTAINER_CLASS} [data-role="enemy-popup-section-title"] {
            margin: 0 0 8px;
            font-size: 14px;
            font-weight: bold;
            color: #94a3b8;
          }
          .${POPUP_CONTAINER_CLASS} [data-role="enemy-popup-basic-toggle"] {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 10px;
            width: 100%;
            margin: 0 0 8px;
            padding: 0;
            border: none;
            background: none;
            text-align: left;
            cursor: pointer;
          }
          .${POPUP_CONTAINER_CLASS} [data-role="enemy-popup-basic-toggle-copy"] {
            display: flex;
            align-items: baseline;
            gap: 8px;
            min-width: 0;
          }
          .${POPUP_CONTAINER_CLASS} [data-role="enemy-popup-basic-toggle-label"] {
            font-size: 14px;
            font-weight: 700;
            color: #94a3b8;
            flex-shrink: 0;
          }
          .${POPUP_CONTAINER_CLASS} [data-role="enemy-popup-basic-toggle-name"] {
            font-size: 13px;
            font-weight: 700;
            color: #f8fafc;
            min-width: 0;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
          }
          .${POPUP_CONTAINER_CLASS} [data-role="enemy-popup-basic-toggle-icon"] {
            color: #cbd5e1;
            font-size: 12px;
            font-weight: 700;
            flex-shrink: 0;
          }
          .${POPUP_CONTAINER_CLASS} [data-role="enemy-popup-panel-card"] {
            display: flex;
            flex-direction: column;
            gap: 12px;
            min-height: 100%;
            padding: 12px;
            border: 1px solid #334155;
            border-radius: 12px;
            background: linear-gradient(180deg, rgba(15, 23, 42, 0.88), rgba(2, 6, 23, 0.92));
          }
          .${POPUP_CONTAINER_CLASS} [data-role="enemy-popup-basic-info"] {
            display: flex;
            flex-direction: column;
            gap: 8px;
            padding: 10px;
            border-radius: 10px;
            border: 1px solid #334155;
            background: rgba(15, 23, 42, 0.88);
          }
          .${POPUP_CONTAINER_CLASS} [data-role="enemy-popup-basic-info-row"] {
            display: flex;
            flex-wrap: wrap;
            gap: 6px 10px;
            font-size: 12px;
            line-height: 1.45;
          }
          .${POPUP_CONTAINER_CLASS} [data-role="enemy-popup-basic-info-label"] {
            min-width: 56px;
            color: #94a3b8;
            font-weight: 700;
          }
          .${POPUP_CONTAINER_CLASS} [data-role="enemy-popup-basic-info-value"] {
            color: #f8fafc;
            font-weight: 600;
            word-break: break-word;
          }
          .${POPUP_CONTAINER_CLASS} [data-role="enemy-popup-state-badge"] {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            border-radius: 999px;
            padding: 2px 8px;
            font-size: 10px;
            font-weight: 800;
            letter-spacing: 0.04em;
          }
          .${POPUP_CONTAINER_CLASS} [data-role="enemy-popup-state-badge"][data-state="alive"] {
            background: rgba(16, 185, 129, 0.18);
            color: #bbf7d0;
          }
          .${POPUP_CONTAINER_CLASS} [data-role="enemy-popup-state-badge"][data-state="broken"] {
            background: rgba(245, 158, 11, 0.2);
            color: #fde68a;
          }
          .${POPUP_CONTAINER_CLASS} [data-role="enemy-popup-state-badge"][data-state="dead"] {
            background: rgba(127, 29, 29, 0.9);
            color: #fecaca;
          }
          .${POPUP_CONTAINER_CLASS} [data-role="enemy-popup-state-badge"][data-state="empty"] {
            background: rgba(71, 85, 105, 0.6);
            color: #cbd5e1;
          }
          .${POPUP_CONTAINER_CLASS} [data-role="enemy-popup-status-list"] {
            display: flex;
            flex-direction: column;
            gap: 6px;
          }
        </style>
        <div data-role="enemy-popup-header">
          <div data-role="enemy-popup-tabs">
            ${tabButtonsHtml}
          </div>
          <button data-role="popup-close" type="button" style="
            position: absolute; top: 50%; right: 0; transform: translateY(-50%);
            background: none; border: none; font-size: 20px; cursor: pointer;
            padding: 0; width: 24px; height: 24px; display: flex; align-items: center;
            justify-content: center; color: #94a3b8; z-index: 1;
          " aria-label="Close">×</button>
        </div>

        ${layoutToggleHtml}
        <div data-role="enemy-popup-content">
          ${contentHtml}
        </div>
      </div>
    `;
  }

  #buildLayoutToggleHtml(layoutMode, forcedNarrow = false) {
    const options = [
      ['wide', '3表示'],
      ['narrow', '1表示'],
    ];
    return `
      <div data-role="enemy-popup-layout-toggle" aria-label="敵詳細表示モード">
        ${options.map(([mode, label]) => `
          <button type="button"
                  data-role="enemy-popup-layout-option"
                  data-layout-preference="${mode}"
                  aria-pressed="${layoutMode === mode ? 'true' : 'false'}"
                  ${forcedNarrow && mode === 'wide' ? 'disabled title="狭幅のため3表示は利用できません"' : ''}>
            ${label}
          </button>
        `).join('')}
      </div>
    `;
  }

  #buildWideContentHtml(enemies = []) {
    return `
      <div data-role="enemy-popup-layout" data-layout-mode="wide">
        ${enemies.map((enemy, index) => `
          <div data-role="enemy-popup-column"
               data-enemy-tab-index="${index}"
               data-selected="${index === this.#activeEnemyIndex ? 'true' : 'false'}">
            ${this.#buildEnemyPanelHtml(enemy, index, { showActions: index === this.#activeEnemyIndex })}
          </div>
        `).join('')}
      </div>
    `;
  }

  #buildNarrowContentHtml(enemies = []) {
    const activeEnemy = enemies[this.#activeEnemyIndex] ?? enemies[0] ?? null;
    if (!activeEnemy) {
      return '';
    }
    return `
      <div data-role="enemy-popup-layout" data-layout-mode="narrow">
        <div data-role="enemy-popup-column"
             data-enemy-tab-index="${this.#activeEnemyIndex}"
             data-selected="true">
          ${this.#buildEnemyPanelHtml(activeEnemy, this.#activeEnemyIndex, { showActions: true })}
        </div>
      </div>
    `;
  }

  #buildEnemyPanelHtml(enemy, enemyIndex = 0, options = {}) {
    const showActions = Boolean(options?.showActions);
    const previewHtml = this.#buildPreviewActionFlowHtml(enemyIndex);
    return `
      <div data-role="enemy-popup-panel-card">
        ${showActions ? this.#buildActionButtonsHtml(enemy, enemyIndex) : ''}
        ${showActions && enemy?.popupEditorHtml ? enemy.popupEditorHtml : ''}
        ${this.#buildBasicInfoSectionHtml(enemy, enemyIndex)}
        ${previewHtml}
        ${this.#buildStatusSectionHtml(enemy)}
      </div>
    `;
  }

  #buildActionButtonsHtml(enemy, enemyIndex) {
    const actionButtons = [
      ['summon', '召喚', SUMMON_BUTTON_ICON_URL, Boolean(enemy?.canSummon), false],
      ['break', 'ブレイク付与', BREAK_BUTTON_ICON_URL, Boolean(enemy?.canBreak), Boolean(enemy?.hasPendingBreakOperation)],
      ['kill', '討伐', KILL_BUTTON_ICON_URL, Boolean(enemy?.canKill), Boolean(enemy?.hasPendingKillOperation)],
    ];
    return `
      <div data-role="enemy-popup-action-row">
        ${actionButtons.map(([actionType, label, iconUrl, enabledByState, isPending]) => {
          const enabled = enabledByState && typeof this.#toolActions?.[actionType] === 'function';
          const titleText = actionType === 'summon'
            ? label
            : `E${enemyIndex + 1} ${label}`;
          return `
            <button type="button"
                    data-role="enemy-popup-action"
                    data-action-type="${actionType}"
                    data-enemy-index="${enemyIndex}"
                    data-pending="${isPending ? 'true' : 'false'}"
                    title="${escapeHtml(titleText)}"
                    ${enabled ? '' : 'disabled'}>
              <img src="${iconUrl}" alt="${escapeHtml(label)}" data-role="enemy-popup-action-icon" />
              <span>${escapeHtml(label)}</span>
            </button>
          `;
        }).join('')}
      </div>
    `;
  }

  #buildBasicInfoHtml(enemy, enemyIndex = 0) {
    const damageRates = enemy?.damageRates && typeof enemy.damageRates === 'object'
      ? enemy.damageRates
      : {};
    const absorbElements = Array.isArray(enemy?.absorbElements) ? enemy.absorbElements : [];
    const damageRateEntries = DAMAGE_RATE_DISPLAY_ORDER
      .map(([key, label]) => {
        const numeric = Number(damageRates?.[key]);
        return Number.isFinite(numeric) ? `${label}${numeric}` : null;
      })
      .filter(Boolean);
    const stateLabel = enemy?.occupied
      ? (enemy?.dead ? 'Dead' : enemy?.broken ? 'BREAK' : 'Alive')
      : '未使用';
    const stateKey = enemy?.occupied
      ? (enemy?.dead ? 'dead' : enemy?.broken ? 'broken' : 'alive')
      : 'empty';
    const infoRows = [
      ['状態', `<span data-role="enemy-popup-state-badge" data-state="${stateKey}">${escapeHtml(stateLabel)}</span>`],
      ['OD率', escapeHtml(Number.isFinite(Number(enemy?.od_rate)) ? `×${Number(enemy.od_rate).toFixed(2)}` : '-'), true],
      ['最大D率', escapeHtml(Number.isFinite(Number(enemy?.max_d_rate)) ? Number(enemy.max_d_rate) : '-'), true],
      ['耐性', escapeHtml(damageRateEntries.length > 0 ? damageRateEntries.join(' / ') : '未設定'), true],
      ['吸収', escapeHtml(absorbElements.length > 0 ? absorbElements.join(', ') : 'なし'), true],
    ];
    return `
      <div data-role="enemy-popup-basic-info">
        ${infoRows.map(([label, value]) => `
          <div data-role="enemy-popup-basic-info-row">
            <span data-role="enemy-popup-basic-info-label">${escapeHtml(label)}</span>
            <span data-role="enemy-popup-basic-info-value">${value}</span>
          </div>
        `).join('')}
      </div>
    `;
  }

  #buildCompactEnemyFieldStateBlockHtml(options = {}) {
    const label = String(options?.label ?? '').trim();
    const iconUrl = String(options?.iconUrl ?? '').trim();
    const description = String(options?.description ?? '').trim();
    const rolePrefix = String(options?.rolePrefix ?? '').trim();

    if (!label || !iconUrl || !description || !rolePrefix) {
      return '';
    }

    return `
      <div class="char-popup-buff-block" data-role="${rolePrefix}-block">
        <div class="char-popup-buff-icon has-icon">
          <img src="${escapeHtml(iconUrl)}" alt="${escapeHtml(label)}" data-role="${rolePrefix}-icon" />
        </div>
        <div class="char-popup-buff-center">
          <div class="char-popup-buff-title">${escapeHtml(label)}</div>
          <div class="char-popup-buff-desc">${escapeHtml(description)}</div>
        </div>
        <div class="char-popup-buff-duration" aria-hidden="true"></div>
      </div>
    `;
  }

  #buildTalismanStatusBlockHtml(enemy) {
    const talisman = normalizeTalismanState(enemy?.talismanState);
    if (!isDisplayableEnemyFieldState(talisman)) {
      return '';
    }
    return this.#buildCompactEnemyFieldStateBlockHtml({
      label: '霊符',
      iconUrl: TALISMAN_ICON_URL,
      description: `Lv${talisman.level}/${talisman.maxLevel} / ${formatTalismanPenalty(talisman.level)}`,
      rolePrefix: 'enemy-popup-talisman',
    });
  }

  #buildDisasterStatusBlockHtml(enemy) {
    const disaster = normalizeDisasterState(enemy?.disasterState);
    if (!isDisplayableEnemyFieldState(disaster)) {
      return '';
    }
    return this.#buildCompactEnemyFieldStateBlockHtml({
      label: '禍',
      iconUrl: DISASTER_ICON_URL,
      description: `Lv${disaster.level}/${disaster.maxLevel} / ${formatDisasterPenalty(disaster.level)}`,
      rolePrefix: 'enemy-popup-disaster',
    });
  }

  #buildStatusSectionHtml(enemy) {
    const statusTableHtml = buildEnemyStatusTableHtml(enemy?.statuses ?? [], {
      resolveSkillDescription: this.#resolveSkillDescription,
    });
    const fieldStateBlocksHtml = enemy?.occupied
      ? [
          this.#buildTalismanStatusBlockHtml(enemy),
          this.#buildDisasterStatusBlockHtml(enemy),
        ].filter(Boolean).join('')
      : '';
    const shouldSuppressEmptyStatusMessage =
      Boolean(fieldStateBlocksHtml) && statusTableHtml.includes('char-popup-empty');
    const contentHtml = [
      fieldStateBlocksHtml,
      shouldSuppressEmptyStatusMessage ? '' : statusTableHtml,
    ].filter(Boolean).join('');

    return `
      <div>
        <h3 data-role="enemy-popup-section-title">状態異常 / バフ</h3>
        <div data-role="enemy-popup-status-list">${contentHtml || '<p class="char-popup-empty">状態異常なし</p>'}</div>
      </div>
    `;
  }

  #buildBasicInfoSectionHtml(enemy, enemyIndex = 0) {
    const isCollapsed = this.#collapsedBasicInfoEnemyIndexes.has(enemyIndex);
    const toggleIcon = isCollapsed ? BASIC_INFO_COLLAPSED_ICON : BASIC_INFO_EXPANDED_ICON;
    const summaryName = String(enemy?.name ?? `E${enemyIndex + 1}`).trim() || `E${enemyIndex + 1}`;
    const slotLabel = `E${enemyIndex + 1}`;
    const summaryText = summaryName.startsWith(`${slotLabel} `)
      ? summaryName
      : `${slotLabel} ${summaryName}`;
    return `
      <div>
        <button type="button"
                data-role="enemy-popup-basic-toggle"
                data-enemy-index="${enemyIndex}"
                aria-expanded="${isCollapsed ? 'false' : 'true'}">
          <span data-role="enemy-popup-basic-toggle-copy">
            <span data-role="enemy-popup-basic-toggle-label">名称</span>
            <span data-role="enemy-popup-basic-toggle-name">${escapeHtml(summaryText)}</span>
          </span>
          <span data-role="enemy-popup-basic-toggle-icon">${toggleIcon}</span>
        </button>
        ${isCollapsed ? '' : this.#buildBasicInfoHtml(enemy, enemyIndex)}
      </div>
    `;
  }

  #buildPreviewActionFlowHtml(enemyIndex = 0) {
    const source = Array.isArray(this.#previewActionFlow) ? this.#previewActionFlow : [];
    const previewStatuses = source
      .flatMap((action) => (Array.isArray(action?.enemyStatusChanges) ? action.enemyStatusChanges : []))
      .filter((change) => Number(change?.targetIndex ?? -1) === Number(enemyIndex))
      .map((change) => ({
        statusType: String(change?.statusType ?? '').trim(),
        remaining: Number(change?.remaining ?? change?.remainingTurns ?? 0),
        exitCond: String(change?.exitCond ?? 'Turn'),
        power: Number(change?.power ?? 0),
        elements: Array.isArray(change?.elements) ? [...change.elements] : [],
        sourceSkillName: String(change?.sourceSkillName ?? '').trim(),
        sourceCharacterName: String(change?.sourceCharacterName ?? '').trim(),
      }))
      .filter((status) => Boolean(status.statusType));
    const talismanChanges = source
      .flatMap((action) =>
        (Array.isArray(action?.fieldStateApplied) ? action.fieldStateApplied : [])
          .filter((change) => String(change?.kind ?? '') === 'talisman')
          .map((change) => ({
            actorCharacterName: String(action?.actorCharacterName ?? '').trim(),
            skillName: String(action?.skillName ?? '').trim(),
            activeBefore: Boolean(change?.activeBefore),
            activeAfter: Boolean(change?.activeAfter),
            levelBefore: Number(change?.levelBefore ?? 0),
            levelAfter: Number(change?.levelAfter ?? 0),
            levelDelta: Number(change?.levelDelta ?? 0),
          }))
      );
    const disasterChanges = source
      .flatMap((action) =>
        (Array.isArray(action?.fieldStateApplied) ? action.fieldStateApplied : [])
          .filter((change) => String(change?.kind ?? '') === 'disaster')
          .map((change) => ({
            actorCharacterName: String(action?.actorCharacterName ?? '').trim(),
            skillName: String(action?.skillName ?? '').trim(),
            activeBefore: Boolean(change?.activeBefore),
            activeAfter: Boolean(change?.activeAfter),
            levelBefore: Number(change?.levelBefore ?? 0),
            levelAfter: Number(change?.levelAfter ?? 0),
            levelDelta: Number(change?.levelDelta ?? 0),
          }))
      );
    const statusTableHtml = buildEnemyStatusTableHtml(previewStatuses, {
      resolveSkillDescription: this.#resolveSkillDescription,
    });
    const talismanHtml = talismanChanges.length > 0
      ? `
        <div data-role="enemy-popup-preview-talisman" style="display: grid; gap: 6px; margin-bottom: ${previewStatuses.length > 0 ? '10px' : '0'};">
          <div style="font-size: 11px; font-weight: 700; color: #f8fafc;">霊符変化</div>
          ${talismanChanges.map((change) => {
            const sourceText = [change.actorCharacterName, change.skillName].filter(Boolean).join(' / ');
            const summary = !change.activeBefore && change.activeAfter
              ? `付与: Lv${change.levelAfter}`
              : `Lv${change.levelBefore} → ${change.levelAfter}${change.levelDelta > 0 ? ` (+${change.levelDelta})` : ''}`;
            return `
              <div data-role="enemy-popup-preview-talisman-change" style="
                border: 1px solid #334155;
                border-radius: 8px;
                padding: 6px 8px;
                background: #111827;
              ">
                <div style="font-size: 11px; color: #e5e7eb;">${escapeHtml(summary)}</div>
                <div style="font-size: 10px; color: #94a3b8;">${escapeHtml(sourceText || '霊符')}</div>
              </div>
            `;
          }).join('')}
        </div>
      `
      : '';
    const disasterHtml = disasterChanges.length > 0
      ? `
        <div data-role="enemy-popup-preview-disaster" style="display: grid; gap: 6px; margin-bottom: ${previewStatuses.length > 0 ? '10px' : '0'};">
          <div style="font-size: 11px; font-weight: 700; color: #f8fafc;">禍変化</div>
          ${disasterChanges.map((change) => {
            const sourceText = [change.actorCharacterName, change.skillName].filter(Boolean).join(' / ');
            const summary = !change.activeBefore && change.activeAfter
              ? `付与: Lv${change.levelAfter}`
              : `Lv${change.levelBefore} → ${change.levelAfter}${change.levelDelta > 0 ? ` (+${change.levelDelta})` : ''}`;
            return `
              <div data-role="enemy-popup-preview-disaster-change" style="
                border: 1px solid #334155;
                border-radius: 8px;
                padding: 6px 8px;
                background: #111827;
              ">
                <div style="font-size: 11px; color: #e5e7eb;">${escapeHtml(summary)}</div>
                <div style="font-size: 10px; color: #94a3b8;">${escapeHtml(sourceText || '禍')}</div>
              </div>
            `;
          }).join('')}
        </div>
      `
      : '';

    if (previewStatuses.length === 0 && talismanChanges.length === 0 && disasterChanges.length === 0) {
      return `
        <div style="margin: 0 0 12px; padding: 8px; border: 1px dashed #334155; border-radius: 8px; background: #0b1220;">
          <div style="font-size: 12px; font-weight: 700; color: #f8fafc;">プレビュー（コミット見込み）</div>
          <div style="font-size: 11px; color: #94a3b8; margin-top: 4px;">このターンで付与される状態変化なし</div>
        </div>
      `;
    }

    return `
      <div style="margin: 0 0 12px; padding: 8px; border: 1px solid #1d4ed8; border-radius: 8px; background: #0b1220;">
        <div style="font-size: 12px; font-weight: 700; color: #bfdbfe; margin-bottom: 6px;">プレビュー（コミット見込み）</div>
        ${talismanHtml}
        ${disasterHtml}
        ${previewStatuses.length > 0 ? `<div>${statusTableHtml}</div>` : ''}
      </div>
    `;
  }
}

/**
 * Turn row / enemy panel から敵detail popup を起動する helper
 * @param {Event} event - click event
 * @param {Object} payload - { enemies: Enemy[], activeEnemyIndex?: number } または単体 Enemy
 * @param {number} activeEnemyIndex - 表示開始タブ index
 */
export function openEnemyDetailPopup(event, payload, activeEnemyIndex = 0, options = {}) {
  event?.stopPropagation?.();
  const popup = new EnemyDetailPopup(options);
  return popup.show(payload, activeEnemyIndex);
}
