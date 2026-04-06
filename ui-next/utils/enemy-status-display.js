/**
 * enemy-status-display.js
 *
 * 敵の statusEffects 配列から敵状態を抽出し、UI表示用HTML/データに変換するユーティリティ。
 * turn-row / enemy-detail-popup / enemy-panel での敵バフ/デバフ表示に使用。
 *
 * NOTE: player 側の buff-display.js と異なり、敵statusはenemyState.statusesで
 * 直接管理されており、フィールド構造が異なる。
 */

import {
  resolveSkillTypeIconUrl,
  STATUS_TYPE_DISPLAY_ORDER,
  getStatusLabel,
} from './char-detail-popup.js';
import { ELEMENT_KANJI, ELEMENT_PREFIXED_STATUS_TYPES } from './element-status-constants.js';

// 敵状態表示の最大アイコン数（overflow対応）
const MAX_ENEMY_STATUS_ICONS = 5;
const SHOW_OVERFLOW_COUNT_IF_EXCEED = true;

// true: json/skill_types.json の ID 昇順を優先
// false: 旧来の debuff優先順を使用
// すぐ元に戻したい場合はこの1行だけ false に変更する。
const USE_SKILL_TYPE_ID_ASC_ORDER = true;

// 敵向けの表示優先順（debuff優先）
const ENEMY_STATUS_TYPE_DISPLAY_ORDER = [
  // Debuffs first (what we want to highlight for enemy)
  'AttackDown',
  'DefenseDown',
  'CriticalRateDown',
  'CriticalDamageDown',
  'ResistDown',
  'Fragile',
  'DownTurn',
  'HealDown',
  'OverDrivePointDown',
  'Stun',
  'Confusion',
  'Imprison',
  'Recoil',
  'Misfortune',
  'SelfDamage',
  'RemoveBuff',
  // Then buffs (lower priority for enemy display)
  'AttackUp',
  'DefenseUp',
  'CriticalRateUp',
  'CriticalDamageUp',
  'ResistUp',
  'RecoveryUp',
  'SkillDamageUp',
  'SpecialDamageUp',
  'HealUp',
  'OverDrivePointUp',
  'Counter',
  'Reflect',
  'BarrierContinue',
  'Barrier',
  'Revive',
];

const ENEMY_DISPLAY_ORDER_INDEX = new Map(
  ENEMY_STATUS_TYPE_DISPLAY_ORDER.map((statusType, index) => [statusType, index])
);

// json/skill_types.json の ID（必要な statusType のみ）
// 未登録 statusType は旧来の優先順へフォールバックする。
const ENEMY_STATUS_TYPE_ID_MAP = Object.freeze({
  AttackUp: 30,
  AttackDown: 32,
  DefenseDown: 34,
  DefenseUp: 36,
  CriticalRateUp: 70,
  CriticalRateDown: 72,
  CriticalDamageUp: 74,
  CriticalDamageDown: 76,
  OverDrivePointUp: 80,
  ResistUp: 100,
  ResistDown: 102,
  Fragile: 104,
  DownTurn: 264,
  Confusion: 106,
  Imprison: 109,
  OverDrivePointDown: 123,
  Recoil: 128,
  HealDown: 146,
  Misfortune: 164,
  SelfDamage: 192,
  RemoveBuff: 235,
  HealUp: 291,
  Barrier: 321,
});


const ENEMY_STATUS_ICON_FALLBACK = Object.freeze({
  DownTurn: 'BreakDownTurnUp',
});

/**
 * elements[0] が有効で element-prefixed icon が存在する場合は、そちらの URL を返す。
 * （例: statusType='DefenseDown', elements=['Ice'] → IceDefenseDown.webp）
 * @param {string} statusType
 * @param {Array} elements
 * @returns {string} iconUrl
 */
function resolveElementalIconUrl(statusType, elements) {
  const firstElement = String(Array.isArray(elements) ? (elements[0] ?? '') : '').trim();
  if (firstElement) {
    const compositeType = `${firstElement}${statusType}`;
    if (ELEMENT_PREFIXED_STATUS_TYPES.has(compositeType)) {
      return resolveSkillTypeIconUrl(compositeType);
    }
  }
  const fallbackIconType = ENEMY_STATUS_ICON_FALLBACK[String(statusType ?? '').trim()] ?? statusType;
  return resolveSkillTypeIconUrl(fallbackIconType);
}

/**
 * elements[0] が有効で element-prefixed icon が存在する場合は、ラベルに属性漢字を付加する。
 * （例: baseLabel='防御力ダウン', statusType='DefenseDown', elements=['Ice'] → '氷防御力ダウン'）
 * @param {string} baseLabel
 * @param {string} statusType
 * @param {Array} elements
 * @returns {string} label
 */
function resolveElementalLabel(baseLabel, statusType, elements) {
  const firstElement = String(Array.isArray(elements) ? (elements[0] ?? '') : '').trim();
  if (firstElement) {
    const compositeType = `${firstElement}${statusType}`;
    if (ELEMENT_PREFIXED_STATUS_TYPES.has(compositeType)) {
      return `${ELEMENT_KANJI[firstElement] ?? ''}${baseLabel}`;
    }
  }
  return baseLabel;
}

/**
 * 敵状態がアクティブ（表示対象）かを判定
 * @param {Object} status - 敵status object
 * @returns {boolean}
 */
export function isActiveEnemyStatus(status) {
  if (!status) return false;
  // Eternal ケース
  if (String(status?.exitCond ?? '') === 'Eternal') return true;
  // 残ターン > 0
  return Number(status?.remaining ?? 0) > 0;
}

/**
 * 敵状態の表示優先度インデックスを取得
 * @param {Object} status - 敵status object
 * @returns {number}
 */
function getEnemyStatusPriorityIndex(status) {
  const statusType = String(status?.statusType ?? '').trim();
  const index = ENEMY_DISPLAY_ORDER_INDEX.get(statusType);

  if (USE_SKILL_TYPE_ID_ASC_ORDER) {
    const id = ENEMY_STATUS_TYPE_ID_MAP[statusType];
    if (Number.isFinite(id)) {
      return id;
    }
    // ID未定義タイプは旧来優先順を維持しつつ、ID定義タイプの後ろに並べる。
    if (index !== undefined) {
      return 10000 + index;
    }
    return 20000;
  }

  // 優先テーブルにない場合は末尾扱い
  return index !== undefined ? index : ENEMY_STATUS_TYPE_DISPLAY_ORDER.length + 10000;
}

/**
 * 敵状態のpower値を読み出す
 * @param {Object} status - 敵status object
 * @returns {number}
 */
function readEnemyStatusPower(status) {
  const numeric = Number(status?.power ?? 0);
  if (!Number.isFinite(numeric)) {
    return 0;
  }
  return numeric;
}

/**
 * 敵statusを優先度順にソート（優先度 -> power降順 -> remaining降順）
 * @param {Object} a
 * @param {Object} b
 * @returns {number}
 */
function compareEnemyStatusForDisplay(a, b) {
  const priorityA = getEnemyStatusPriorityIndex(a);
  const priorityB = getEnemyStatusPriorityIndex(b);
  if (priorityA !== priorityB) {
    return priorityA - priorityB;
  }
  // same priority: sort by power descending
  const powerA = readEnemyStatusPower(a);
  const powerB = readEnemyStatusPower(b);
  if (powerA !== powerB) {
    return powerB - powerA;
  }
  // same power: sort by remaining descending
  const remainingA = Number(a?.remaining ?? 0);
  const remainingB = Number(b?.remaining ?? 0);
  return remainingB - remainingA;
}

function collapseDisplayDuplicates(statuses) {
  if (!Array.isArray(statuses) || statuses.length === 0) {
    return [];
  }

  const merged = [];
  let bestDownTurn = null;
  const selectPreferredDownTurn = (current, candidate) => {
    if (!current) {
      return candidate;
    }
    const currentRemaining = Number(current?.remaining ?? current?.remainingTurns ?? 0);
    const candidateRemaining = Number(candidate?.remaining ?? candidate?.remainingTurns ?? 0);
    if (candidateRemaining > currentRemaining) {
      return candidate;
    }
    if (candidateRemaining < currentRemaining) {
      return current;
    }
    const currentPower = readEnemyStatusPower(current);
    const candidatePower = readEnemyStatusPower(candidate);
    if (candidatePower > currentPower) {
      return candidate;
    }
    return current;
  };

  for (const status of statuses) {
    const statusType = String(status?.statusType ?? '').trim();
    if (statusType === 'DownTurn') {
      bestDownTurn = selectPreferredDownTurn(bestDownTurn, status);
      continue;
    }
    merged.push(status);
  }

  if (bestDownTurn) {
    merged.push(bestDownTurn);
  }
  return merged;
}

/**
 * アクティブな敵statusを取得し、優先度順でソート
 * @param {Array} statuses - enemy.statuses 配列 (元の順に次のデータを保持)
 *   - statusType, remaining, power, elements, exitCond, source, metadata等
 * @returns {Array} ソート済みのアクティブ敵status
 */
export function getActiveEnemyStatusesSorted(statuses) {
  if (!Array.isArray(statuses)) {
    return [];
  }
  return collapseDisplayDuplicates(
    statuses.filter(isActiveEnemyStatus)
  )
    .sort(compareEnemyStatusForDisplay);
}

/**
 * 表示対象の敵statusを制限数まで取得（超過分はカウント）
 * @param {Array} statuses - enemy.statuses 配列
 * @param {Object} options - { limit?: number }
 * @returns { visible: Array, overflowCount: number }
 */
export function pickEnemyStatusesForDisplay(statuses, options = {}) {
  const limit = Math.max(0, Number(options.limit) || MAX_ENEMY_STATUS_ICONS);
  const sorted = getActiveEnemyStatusesSorted(statuses);
  
  if (limit <= 0) {
    return { visible: [], overflowCount: sorted.length };
  }
  
  return {
    visible: sorted.slice(0, limit),
    overflowCount: Math.max(0, sorted.length - limit),
  };
}

/**
 * 敵statusの表示ラベルを取得（残ターン付き）
 * @param {Object} status - 敵status object
 * @returns {string} e.g. "AttackDown ×3ターン" or "Barrier (永続)"
 */
export function getEnemyStatusLabel(status) {
  if (!status) return '';
  
  const statusType = String(status?.statusType ?? '').trim() || 'Unknown';
  const remaining = Number(status?.remaining ?? 0);
  const exitCond = String(status?.exitCond ?? '').trim();
  
  // Eternal の場合
  if (exitCond === 'Eternal') {
    return `${statusType} (永続)`;
  }
  
  // 残ターン表示
  if (remaining > 0) {
    const label = remaining === 1 ? '1ターン' : `${remaining}ターン`;
    return `${statusType} ×${label}`;
  }
  
  // デフォルト
  return statusType;
}

/**
 * 敵status一覧をブロック形式で表示（詳細popup用、char-popup-buff-block スタイルに準拠）
 * @param {Array} statuses - enemy.statuses 配列
 * @returns {string} HTML ブロック要素のテキスト
 */
export function buildEnemyStatusTableHtml(statuses) {
  const sorted = getActiveEnemyStatusesSorted(statuses);

  if (sorted.length === 0) {
    return '<p class="char-popup-empty">状態異常なし</p>';
  }

  return sorted
    .map((status, index) => {
      const statusType = String(status?.statusType ?? '').trim() || 'Unknown';
      const elements = Array.isArray(status?.elements) ? status.elements : [];
      const label = resolveElementalLabel(getStatusLabel(statusType), statusType, elements);
      const power = readEnemyStatusPower(status);
      const remaining = Number(status?.remaining ?? status?.remainingTurns ?? 0);
      const exitCond = String(status?.exitCond ?? '').trim();
      const sourceSkillName = String(status?.sourceSkillName ?? '').trim();
      const sourceCharacterName = String(status?.sourceCharacterName ?? '').trim();

      const powerStr =
        Number.isFinite(power) && power !== 0
          ? `${power > 0 ? '+' : ''}${Math.round(power * 100)}%`
          : '';

      const remainingStr =
        exitCond === 'Eternal'
          ? '\u221e'
          : exitCond === 'Count'
          ? `${remaining}\u56de`
          : `${remaining}T`;

      const iconUrl = resolveElementalIconUrl(statusType, elements);
      const esc = (str) =>
        String(str ?? '')
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;');

      return (
        `<div class="char-popup-buff-block" data-status-index="${index}" data-status-type="${esc(statusType)}">` +
        `<div class="char-popup-buff-icon${iconUrl ? ' has-icon' : ''}">` +
        (iconUrl ? `<img src="${esc(iconUrl)}" alt="${esc(statusType)}" />` : '') +
        `</div>` +
        `<div class="char-popup-buff-center">` +
        `<div class="char-popup-buff-title">${esc(label)}` +
        (powerStr ? `<span class="char-popup-buff-power">${esc(powerStr)}</span>` : '') +
        (sourceSkillName ? `<span class="char-popup-buff-skill">[${esc(sourceSkillName)}]</span>` : '') +
        (sourceCharacterName ? `<span class="char-popup-buff-from">${esc(sourceCharacterName)}</span>` : '') +
        `</div>` +
        `</div>` +
        `<div class="char-popup-buff-duration">${esc(remainingStr)}</div>` +
        `</div>`
      );
    })
    .join('');
}

/**
 * 敵status要約をテキスト表示（turn-row compact用）
 * optionで表示制限可能
 * @param {Array} statuses - enemy.statuses 配列
 * @param {Object} options - { limit?: number }
 * @returns {string}
 */
export function buildEnemyStatusCompactText(statuses, options = {}) {
  const { visible, overflowCount } = pickEnemyStatusesForDisplay(statuses, options);
  
  if (visible.length === 0 && overflowCount === 0) {
    return '';
  }
  
  const labels = visible.map(status => {
    const remaining = Number(status?.remaining ?? 0);
    if (remaining > 0) {
      return `${remaining}`;
    }
    return String(status?.statusType ?? '').substring(0, 3);
  });
  
  let text = labels.join(', ');
  if (overflowCount > 0 && SHOW_OVERFLOW_COUNT_IF_EXCEED) {
    text += ` (+${overflowCount})`;
  }
  
  return text;
}

/**
 * 敵statusアイコンをHTML要素で生成（turn-row / popup用）
 * @param {Array} statuses - enemy.statuses 配列
 * @param {Object} options
 *   - limit?: number (デフォルト MAX_ENEMY_STATUS_ICONS)
 *   - showOverflow?: boolean (デフォルト true)
 *   - size?: string (e.g., '16px', '20px', デフォルト '20px')
 * @returns {string} HTML fragment
 */
export function buildEnemyStatusIconsHtml(statuses, options = {}) {
  const limit = Math.max(0, Number(options.limit) || MAX_ENEMY_STATUS_ICONS);
  const showOverflow = options.showOverflow !== false;
  const size = String(options.size ?? '20px').trim();
  
  const { visible, overflowCount } = pickEnemyStatusesForDisplay(statuses, { limit });
  
  if (visible.length === 0 && overflowCount === 0) {
    return '';
  }
  
  const iconHtmls = visible.map((status, index) => {
    const statusType = String(status?.statusType ?? '').trim() || 'Unknown';
    const elements = Array.isArray(status?.elements) ? status.elements : [];
    const remaining = Number(status?.remaining ?? 0);
    const iconUrl = resolveElementalIconUrl(statusType, elements);
    const displayLabel = resolveElementalLabel(getStatusLabel(statusType), statusType, elements);
    
    const title =
      remaining > 0
        ? `${displayLabel} (残り${remaining}ターン)`
        : displayLabel;
    
    return `
      <img
        src="${iconUrl}"
        alt="${displayLabel}"
        title="${title}"
        style="width: ${size}; height: ${size}; margin-right: 2px; display: inline-block;"
      />
    `.trim();
  });
  
  // overflowカウント表示
  if (showOverflow && overflowCount > 0) {
    const overflowText = `+${overflowCount}`;
    iconHtmls.push(
      `<span style="font-size: 12px; font-weight: bold; margin-left: 2px;">${overflowText}</span>`
    );
  }
  
  return iconHtmls.join('');
}

/**
 * 敵statusオブジェクトのメタデータ抽出（source/effectId検証用）
 * @param {Object} status - 敵status
 * @returns {Object}
 */
export function getEnemyStatusMetadata(status) {
  if (!status) return {};
  
  return {
    statusType: String(status.statusType ?? '').trim(),
    remaining: Number(status.remaining ?? 0),
    power: readEnemyStatusPower(status),
    elements: Array.isArray(status.elements) ? status.elements : [],
    exitCond: String(status.exitCond ?? '').trim(),
    source: String(status.source ?? '').trim(),
    effectId: Number(status.effectId ?? 0),
    metadata: status.metadata ?? {},
    isActive: isActiveEnemyStatus(status),
  };
}
