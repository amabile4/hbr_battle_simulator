/**
 * enemy-detail-popup.js
 *
 * 敵の詳細情報popup（敵statusを含む）
 * turn-row / enemy-panel から起動可能な詳細表示モーダル
 *
 * WBS-3c: 敵statusをテーブル形式で表示（必須deliverable）
 */

import {
  getActiveEnemyStatusesSorted,
  buildEnemyStatusTableHtml,
  getEnemyStatusLabel,
} from '../utils/enemy-status-display.js';
import { escapeHtml } from '../../src/utils/escape-html.js';

const POPUP_CLASS = 'enemy-detail-popup';
const POPUP_OVERLAY_CLASS = 'enemy-detail-popup-overlay';
const POPUP_CONTAINER_CLASS = 'enemy-detail-popup-container';

/**
 * EnemyDetailPopup
 * - 敵の詳細情報（status, OD率, 耐性等）を表示
 * - status テーブルで敵バフ/デバフを表示
 */
export class EnemyDetailPopup {
  #root = null;
  #enemy = null;
  #enemyIndex = null;
  #onClose = null;

  constructor(options = {}) {
    this.#onClose = typeof options.onClose === 'function' ? options.onClose : null;
  }

  /**
   * popup を DOM に追加
   * @param {Object} enemy - 敵オブジェクト (敵state に statuses 配列を含む)
   * @param {number} enemyIndex - 敵インデックス（表示用）
   */
  show(enemy, enemyIndex = 0) {
    if (!enemy) return;

    this.#enemy = structuredClone(enemy);
    this.#enemyIndex = Number(enemyIndex) || 0;
    this.#render();
  }

  /**
   * popup を閉じる
   */
  close() {
    if (this.#root) {
      this.#root.remove();
      this.#root = null;
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

    // onClose コールバック
    this.#onClose?.();
  }

  #buildHtml() {
    const enemy = this.#enemy || {};
    const enemyName = String(enemy.name ?? `Enemy #${this.#enemyIndex}`);
    const statuses = Array.isArray(enemy.statuses) ? enemy.statuses : [];

    const statusTableHtml = buildEnemyStatusTableHtml(statuses);

    const statsHtml = this.#buildStatsHtml(enemy);

    return `
      <div class="${POPUP_OVERLAY_CLASS}" style="
        position: fixed; top: 0; left: 0; right: 0; bottom: 0;
        background: rgba(0, 0, 0, 0.5); z-index: 999;
      "></div>

      <div class="${POPUP_CONTAINER_CLASS}" style="
        position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%);
        background: white; border-radius: 8px; box-shadow: 0 4px 16px rgba(0, 0, 0, 0.15);
        z-index: 1000; max-width: 600px; max-height: 80vh; overflow-y: auto;
        padding: 16px; font-family: system-ui, sans-serif;
      ">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
          <h2 style="margin: 0; font-size: 18px; font-weight: bold;">
            ${escapeHtml(enemyName)} ${this.#enemyIndex > 0 ? `#${this.#enemyIndex}` : ''}
          </h2>
          <button data-role="popup-close" type="button" style="
            background: none; border: none; font-size: 20px; cursor: pointer;
            padding: 0; width: 24px; height: 24px; display: flex; align-items: center;
            justify-content: center;
          " aria-label="Close">×</button>
        </div>

        ${statsHtml ? `
          <div style="margin-bottom: 16px;">
            <h3 style="margin: 0 0 8px; font-size: 14px; font-weight: bold; color: #666;">
              基本情報
            </h3>
            ${statsHtml}
          </div>
        ` : ''}

        <div>
          <h3 style="margin: 0 0 8px; font-size: 14px; font-weight: bold; color: #666;">
            状態異常 / バフ
          </h3>
          <table style="
            width: 100%; border-collapse: collapse; font-size: 13px;
            border: 1px solid #e5e7eb;
          ">
            <thead>
              <tr style="background: #f9fafb; border-bottom: 1px solid #e5e7eb;">
                <th style="padding: 8px 12px; text-align: left; font-weight: 600;">ステータス</th>
                <th style="padding: 8px 12px; text-align: center; font-weight: 600;">効力</th>
                <th style="padding: 8px 12px; text-align: center; font-weight: 600;">残り</th>
              </tr>
            </thead>
            <tbody>
              ${statusTableHtml}
            </tbody>
          </table>
        </div>
      </div>
    `;
  }

  #buildStatsHtml(enemy) {
    const hp = Number(enemy.hp ?? 0);
    const maxHp = Number(enemy.maxHp ?? 0);
    const odRate = Number(enemy.od_rate ?? 1);
    const maxDRate = Number(enemy.max_d_rate ?? 999);

    if (hp <= 0 && maxHp <= 0 && odRate <= 0) {
      return ''; // 統計情報がない場合は非表示
    }

    const hpText = hp > 0 && maxHp > 0 ? `${hp} / ${maxHp}` : '-';
    const odText = odRate > 0 ? `×${odRate.toFixed(2)}` : '-';

    return `
      <div style="display: flex; gap: 16px; font-size: 13px; padding: 8px; background: #f9fafb; border-radius: 4px;">
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
      </div>
    `;
  }
}

/**
 * Turn row / enemy panel から敵detail popup を起動する helper
 * @param {Event} event - click event
 * @param {Object} enemy - 敵オブジェクト
 * @param {number} enemyIndex - 敵インデックス
 */
export function openEnemyDetailPopup(event, enemy, enemyIndex = 0) {
  event?.stopPropagation?.();
  const popup = new EnemyDetailPopup();
  popup.show(enemy, enemyIndex);
}
