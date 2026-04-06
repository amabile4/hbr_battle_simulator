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
const POPUP_MULTI_LAYOUT_CLASS = 'enemy-detail-popup-multi-layout';
const POPUP_RESPONSIVE_BREAKPOINT_PX = 980;
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

/**
 * EnemyDetailPopup
 * - 敵の詳細情報（status, OD率, 耐性等）を表示
 * - status テーブルで敵バフ/デバフを表示
 */
export class EnemyDetailPopup {
  #root = null;
  #enemies = [];
  #activeEnemyIndex = 0;
  #previewActionFlow = [];
  #onClose = null;

  constructor(options = {}) {
    this.#onClose = typeof options.onClose === 'function' ? options.onClose : null;
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
    const requestedTabIndex = Number(payload?.activeEnemyIndex ?? activeEnemyIndex ?? 0);
    const maxTabIndex = Math.max(0, this.#enemies.length - 1);
    this.#activeEnemyIndex = Number.isInteger(requestedTabIndex)
      ? Math.min(maxTabIndex, Math.max(0, requestedTabIndex))
      : 0;
    this.#render();
  }

  /**
   * popup を閉じる
   */
  close() {
    if (this.#root) {
      this.#root.remove();
      this.#root = null;
      this.#onClose?.();
    }
  }

  #render() {
    // 既存の popup があれば削除
    this.close();

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
        if (!Number.isInteger(nextTabIndex) || nextTabIndex < 0 || nextTabIndex >= this.#enemies.length) {
          return;
        }
        this.#activeEnemyIndex = nextTabIndex;
        this.#render();
      });
    });

    // ESC キーで閉じる
    const handleEsc = (e) => {
      if (e.key === 'Escape') {
        this.close();
        document.removeEventListener('keydown', handleEsc);
      }
    };
    document.addEventListener('keydown', handleEsc);

    // DOM に追加
    document.body.appendChild(this.#root);
  }

  #buildHtml() {
    const enemies = Array.isArray(this.#enemies) ? this.#enemies : [];
    const isResponsiveMultiLayout = enemies.length >= 2;
    const panelColumns = Math.min(3, Math.max(2, enemies.length));
    const activeEnemy = enemies[this.#activeEnemyIndex] ?? enemies[0] ?? {};
    const titleText = isResponsiveMultiLayout
      ? '敵詳細'
      : String(activeEnemy.name ?? '').trim() || '敵詳細';
    const tabButtonsHtml = enemies.map((enemy, index) => {
      const label = String(enemy?.name ?? `E${index + 1}`).trim() || `E${index + 1}`;
      const isActive = index === this.#activeEnemyIndex;
      const deadBadge = enemy?.dead
        ? '<span style="margin-left: 6px; border-radius: 999px; background: #7f1d1d; color: #fecaca; padding: 1px 6px; font-size: 10px; font-weight: 700;">Dead</span>'
        : '';
      return `
        <button type="button"
                data-role="enemy-popup-tab"
                data-enemy-tab-index="${index}"
                style="
                  border: 1px solid ${isActive ? '#38bdf8' : '#475569'};
                  background: ${isActive ? '#334155' : '#0f172a'};
                  color: ${isActive ? '#38bdf8' : '#94a3b8'};
                  border-radius: 999px;
                  padding: 4px 10px;
                  font-size: 12px;
                  font-weight: 600;
                  cursor: pointer;
                ">
          ${escapeHtml(label)}
          ${deadBadge}
        </button>
      `;
    }).join('');

    const tabPanelsHtml = enemies.map((enemy, index) => {
      const hiddenAttr = index === this.#activeEnemyIndex ? '' : 'hidden';
      return `
        <div data-role="enemy-popup-tab-panel" data-enemy-tab-index="${index}" ${hiddenAttr}>
          ${this.#buildEnemyPanelHtml(enemy, index, { showPanelTitle: isResponsiveMultiLayout })}
        </div>
      `;
    }).join('');

    return `
      <div class="${POPUP_OVERLAY_CLASS}" style="
        position: fixed; top: 0; left: 0; right: 0; bottom: 0;
        background: rgba(0, 0, 0, 0.5); z-index: 999;
      "></div>

      <div class="${POPUP_CONTAINER_CLASS} ${isResponsiveMultiLayout ? POPUP_MULTI_LAYOUT_CLASS : ''}" style="
        position: fixed; inset: 10%;
        background: #1e293b; border-radius: 12px; box-shadow: 0 20px 60px rgba(0, 0, 0, 0.8);
        z-index: 1000; overflow-y: auto;
        padding: 16px; font-family: system-ui, sans-serif;
        border: 1px solid #475569; color: #e2e8f0;
        --enemy-panel-columns: ${panelColumns};
      ">
        <style>
          .${POPUP_MULTI_LAYOUT_CLASS} [data-role="enemy-popup-panels"] {
            display: grid;
            grid-template-columns: repeat(var(--enemy-panel-columns), minmax(260px, 1fr));
            gap: 12px;
          }
          .${POPUP_MULTI_LAYOUT_CLASS} [data-role="enemy-popup-tab-panel"][hidden] {
            display: block !important;
          }
          .${POPUP_MULTI_LAYOUT_CLASS} [data-role="enemy-popup-tabs"] {
            display: none;
          }
          .${POPUP_MULTI_LAYOUT_CLASS} [data-role="enemy-popup-panel-card"] {
            border: 1px solid #334155;
            border-radius: 10px;
            background: #0b1220;
            padding: 10px;
            min-width: 0;
          }
          @media (max-width: ${POPUP_RESPONSIVE_BREAKPOINT_PX}px) {
            .${POPUP_MULTI_LAYOUT_CLASS} [data-role="enemy-popup-tabs"] {
              display: flex;
            }
            .${POPUP_MULTI_LAYOUT_CLASS} [data-role="enemy-popup-panels"] {
              display: block;
            }
            .${POPUP_MULTI_LAYOUT_CLASS} [data-role="enemy-popup-tab-panel"][hidden] {
              display: none !important;
            }
            .${POPUP_MULTI_LAYOUT_CLASS} [data-role="enemy-popup-panel-card"] {
              border: none;
              border-radius: 0;
              background: transparent;
              padding: 0;
            }
          }
        </style>
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
          <h2 style="margin: 0; font-size: 18px; font-weight: bold; color: #f1f5f9;">
            ${escapeHtml(titleText)}
          </h2>
          <button data-role="popup-close" type="button" style="
            background: none; border: none; font-size: 20px; cursor: pointer;
            padding: 0; width: 24px; height: 24px; display: flex; align-items: center;
            justify-content: center; color: #94a3b8;
          " aria-label="Close">×</button>
        </div>

        <div data-role="enemy-popup-tabs" style="display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 12px;">
          ${tabButtonsHtml}
        </div>

        <div data-role="enemy-popup-panels">
          ${tabPanelsHtml}
        </div>
      </div>
    `;
  }

  #buildEnemyPanelHtml(enemy, enemyIndex = 0, options = {}) {
    const showPanelTitle = Boolean(options?.showPanelTitle);
    const statuses = Array.isArray(enemy?.statuses) ? enemy.statuses : [];
    const enemyTitle = String(enemy?.name ?? `E${Number(enemyIndex) + 1}`).trim() || `E${Number(enemyIndex) + 1}`;
    const deadBadgeHtml = enemy?.dead
      ? '<span style="margin-left: 8px; border-radius: 999px; background: #7f1d1d; color: #fecaca; padding: 2px 8px; font-size: 10px; font-weight: 700;">Dead</span>'
      : '';
    const previewHtml = this.#buildPreviewActionFlowHtml(enemyIndex);
    const statusTableHtml = buildEnemyStatusTableHtml(statuses);
    const statsHtml = this.#buildStatsHtml(enemy);
    return `
      <div data-role="enemy-popup-panel-card">
      ${previewHtml}
      ${showPanelTitle ? `
        <h3 style="display: flex; align-items: center; margin: 0 0 10px; font-size: 14px; font-weight: 700; color: #e2e8f0;">
          ${escapeHtml(enemyTitle)}
          ${deadBadgeHtml}
        </h3>
      ` : ''}
      ${statsHtml ? `
        <div style="margin-bottom: 16px;">
          <h3 style="margin: 0 0 8px; font-size: 14px; font-weight: bold; color: #94a3b8;">
            基本情報
          </h3>
          ${statsHtml}
        </div>
      ` : ''}

      <div>
        <h3 style="margin: 0 0 8px; font-size: 14px; font-weight: bold; color: #94a3b8;">
          状態異常 / バフ
        </h3>
        <div>
          ${statusTableHtml}
        </div>
      </div>
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
    const statusTableHtml = buildEnemyStatusTableHtml(previewStatuses);

    if (previewStatuses.length === 0) {
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
        <div>${statusTableHtml}</div>
      </div>
    `;
  }

  #buildStatsHtml(enemy) {
    const hp = Number(enemy.hp ?? 0);
    const maxHp = Number(enemy.maxHp ?? 0);
    const odRate = Number(enemy.od_rate ?? 1);
    const maxDRate = Number(enemy.max_d_rate ?? 999);
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

    if (hp <= 0 && maxHp <= 0 && odRate <= 0 && damageRateEntries.length === 0 && absorbElements.length === 0) {
      return ''; // 統計情報がない場合は非表示
    }

    const hpText = hp > 0 && maxHp > 0 ? `${hp} / ${maxHp}` : '-';
    const odText = odRate > 0 ? `×${odRate.toFixed(2)}` : '-';

    return `
      <div style="display: flex; flex-wrap: wrap; gap: 16px; font-size: 13px; padding: 8px; background: #0f172a; border-radius: 4px; border: 1px solid #334155;">
        ${hp > 0 || maxHp > 0 ? `
          <div>
            <span style="color: #999;">HP:</span>
            <span style="font-weight: 500;">${hpText}</span>
          </div>
        ` : ''}
        ${odRate > 0 ? `
          <div>
            <span style="color: #999;">OD率:</span>
            <span style="font-weight: 500;">${odText}</span>
          </div>
        ` : ''}
        ${maxDRate > 0 ? `
          <div>
            <span style="color: #999;">最大D率:</span>
            <span style="font-weight: 500;">${maxDRate}</span>
          </div>
        ` : ''}
        ${damageRateEntries.length > 0 ? `
          <div style="flex-basis: 100%;">
            <span style="color: #999;">耐性:</span>
            <span style="font-weight: 500;">${escapeHtml(damageRateEntries.join(' / '))}</span>
          </div>
        ` : ''}
        <div style="flex-basis: 100%;">
          <span style="color: #999;">吸収:</span>
          <span style="font-weight: 500;">${escapeHtml(absorbElements.length > 0 ? absorbElements.join(', ') : 'なし')}</span>
        </div>
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
export function openEnemyDetailPopup(event, payload, activeEnemyIndex = 0) {
  event?.stopPropagation?.();
  const popup = new EnemyDetailPopup();
  popup.show(payload, activeEnemyIndex);
}
