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
  getStatusLabel,
} from './char-detail-popup.js';
import {
  ENEMY_STATUS_BREAK,
  ENEMY_STATUS_SUPER_BREAK,
  isPersistentEnemyStatusType,
  normalizeEnemyStatusType,
} from '../../src/domain/enemy-status.js';
import { ELEMENT_KANJI, ELEMENT_PREFIXED_STATUS_TYPES } from './element-status-constants.js';
import {
  getUnifiedStatusTypeId,
  getElementSortValue,
  getElementVariantCategory,
  getStatusDurationSortValue,
  USE_UNIFIED_ID_ORDER,
  FALLBACK_ORDER_OFFSET,
  UNKNOWN_ORDER_VALUE,
} from './status-sort-order.js';
import { resolveSourceSkillDescription } from './source-skill-description.js';
import { resolveAdoptionStatus } from './buff-adoption.js';

// 敵状態表示の最大アイコン数（overflow対応）
const MAX_ENEMY_STATUS_ICONS = 5;
const SHOW_OVERFLOW_COUNT_IF_EXCEED = true;

// 敵向けの表示優先順（debuff優先）— ID 未定義 statusType のフォールバック順序
const ENEMY_STATUS_TYPE_DISPLAY_ORDER = [
  // Debuffs first (what we want to highlight for enemy)
  'AttackDown',
  'DefenseDown',
  'CriticalRateDown',
  'CriticalDamageDown',
  'ResistDown',
  'Fragile',
  'Hacking',
  'Undermine',
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

// ソート ID は status-sort-order.js の UNIFIED_STATUS_TYPE_ID_MAP に統合済み。


const ENEMY_STATUS_ICON_FALLBACK = Object.freeze({
  DownTurn: 'BreakDownTurnUp',
  Break: '',
});

const ENEMY_STATUS_TYPES_WITHOUT_GENERIC_ICON = Object.freeze(
  new Set([ENEMY_STATUS_BREAK, ENEMY_STATUS_SUPER_BREAK])
);
const ENEMY_STATUS_TYPES_HIDDEN_FROM_TABLE = Object.freeze(
  new Set([ENEMY_STATUS_BREAK])
);
const ENEMY_STATUS_TYPES_WITHOUT_SOURCE_SKILL_DESC = Object.freeze(
  new Set(['Dead'])
);

/**
 * elements[0] が有効で element-prefixed icon が存在する場合は、そちらの URL を返す。
 * （例: statusType='DefenseDown', elements=['Ice'] → IceDefenseDown.webp）
 * @param {string} statusType
 * @param {Array} elements
 * @returns {string} iconUrl
 */
function resolveElementalIconUrl(statusType, elements) {
  const normalizedStatusType = normalizeEnemyStatusType(statusType);
  const firstElement = String(Array.isArray(elements) ? (elements[0] ?? '') : '').trim();
  if (firstElement) {
    const compositeType = `${firstElement}${normalizedStatusType}`;
    if (ELEMENT_PREFIXED_STATUS_TYPES.has(compositeType)) {
      return resolveSkillTypeIconUrl(compositeType);
    }
  }
  const fallbackIconType = ENEMY_STATUS_ICON_FALLBACK[normalizedStatusType] ?? normalizedStatusType;
  if (!fallbackIconType || ENEMY_STATUS_TYPES_WITHOUT_GENERIC_ICON.has(normalizedStatusType)) {
    return '';
  }
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
  const normalizedStatusType = normalizeEnemyStatusType(statusType);
  const firstElement = String(Array.isArray(elements) ? (elements[0] ?? '') : '').trim();
  if (firstElement) {
    const compositeType = `${firstElement}${normalizedStatusType}`;
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
  if (isPersistentEnemyStatusType(status?.statusType)) return true;
  const remaining = Number(status?.remaining ?? status?.remainingTurns ?? 0);
  // DownTurn は remaining=0 も grace として active 扱い (engine 側の isEnemyStatusActive と一致)
  if (normalizeEnemyStatusType(status?.statusType) === 'DownTurn') {
    return remaining >= 0;
  }
  return remaining > 0;
}

/**
 * 敵状態の表示優先度インデックスを取得
 * @param {Object} status - 敵status object
 * @returns {number}
 */
function getEnemyStatusPriorityIndex(status) {
  const statusType = normalizeEnemyStatusType(status?.statusType);
  const index = ENEMY_DISPLAY_ORDER_INDEX.get(statusType);

  if (USE_UNIFIED_ID_ORDER) {
    const id = getUnifiedStatusTypeId(statusType);
    if (id !== undefined) {
      return id;
    }
    // ID未定義タイプは旧来優先順を維持しつつ、ID定義タイプの後ろに並べる。
    if (index !== undefined) {
      return FALLBACK_ORDER_OFFSET + index;
    }
    return UNKNOWN_ORDER_VALUE;
  }

  // 優先テーブルにない場合は末尾扱い
  return index !== undefined ? index : ENEMY_STATUS_TYPE_DISPLAY_ORDER.length + FALLBACK_ORDER_OFFSET;
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
  // §2.2 属性バリアント分類: (1)a → (1)b → (2)
  const catA = getElementVariantCategory(
    normalizeEnemyStatusType(a?.statusType), a?.elements);
  const catB = getElementVariantCategory(
    normalizeEnemyStatusType(b?.statusType), b?.elements);
  if (catA !== catB) {
    return catA - catB;
  }

  // §2.3 種別ID順
  const priorityA = getEnemyStatusPriorityIndex(a);
  const priorityB = getEnemyStatusPriorityIndex(b);
  if (priorityA !== priorityB) {
    return priorityA - priorityB;
  }
  // same priority: sort by element
  const elemA = getElementSortValue(a?.elements);
  const elemB = getElementSortValue(b?.elements);
  if (elemA !== elemB) {
    return elemA - elemB;
  }
  // same type/element: Eternal → Turn系 → Count
  const durationA = getStatusDurationSortValue(a);
  const durationB = getStatusDurationSortValue(b);
  if (durationA !== durationB) {
    return durationA - durationB;
  }
  // same element: sort by power descending
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
  
  const statusType = normalizeEnemyStatusType(status?.statusType) || 'Unknown';
  const remaining = Number(status?.remaining ?? status?.remainingTurns ?? 0);
  const exitCond = String(status?.exitCond ?? '').trim();
  const displayLabel = getStatusLabel(statusType);
  
  // Eternal の場合
  if (exitCond === 'Eternal') {
    return `${displayLabel} (永続)`;
  }
  
  if (isPersistentEnemyStatusType(statusType)) {
    return displayLabel;
  }

  // 残ターン表示
  if (remaining > 0) {
    const label = remaining === 1 ? '1ターン' : `${remaining}ターン`;
    return `${displayLabel} ×${label}`;
  }
  
  // デフォルト
  return displayLabel;
}

/**
 * 敵status一覧をブロック形式で表示（詳細popup用、char-popup-buff-block スタイルに準拠）
 * @param {Array} statuses - enemy.statuses 配列
 * @param {Object} options
 * @param {(skillId: number) => string | null} [options.resolveSkillDescription]
 * @returns {string} HTML ブロック要素のテキスト
 */
export function buildEnemyStatusTableHtml(statuses, options = {}) {
  const resolveSkillDescription =
    typeof options?.resolveSkillDescription === 'function'
      ? options.resolveSkillDescription
      : null;
  const sorted = getActiveEnemyStatusesSorted(statuses).filter(
    (status) => !ENEMY_STATUS_TYPES_HIDDEN_FROM_TABLE.has(normalizeEnemyStatusType(status?.statusType))
  );

  if (sorted.length === 0) {
    return '<p class="char-popup-empty">状態異常なし</p>';
  }

  const withAdoption = resolveAdoptionStatus(sorted);

  return withAdoption
    .map((status, index) => {
      const statusType = normalizeEnemyStatusType(status?.statusType) || 'Unknown';
      const elements = Array.isArray(status?.elements) ? status.elements : [];
      const label = resolveElementalLabel(getStatusLabel(statusType), statusType, elements);
      const power = readEnemyStatusPower(status);
      const remaining = Number(status?.remaining ?? status?.remainingTurns ?? 0);
      const exitCond = String(status?.exitCond ?? '').trim();
      const sourceSkillName = String(status?.sourceSkillName ?? '').trim();
      const sourceCharacterName = String(status?.sourceCharacterName ?? '').trim();
      const sourceSkillDesc = resolveSourceSkillDescription(status, resolveSkillDescription);
      const shouldShowSourceSkillDesc =
        Boolean(sourceSkillDesc) && !ENEMY_STATUS_TYPES_WITHOUT_SOURCE_SKILL_DESC.has(statusType);

      const powerStr =
        Number.isFinite(power) && power !== 0
          ? `${power > 0 ? '+' : ''}${Math.round(power * 100)}%`
          : '';

      const remainingStr =
        exitCond === 'Eternal'
          ? '\u221e'
          : isPersistentEnemyStatusType(statusType)
          ? ''
          : exitCond === 'Count'
          ? `${remaining}\u56de`
          : `${remaining}T`;

      const iconUrl = resolveElementalIconUrl(statusType, elements);
      const isAdopted = status._adopted !== false;
      const dimmedClass = isAdopted ? '' : ' dimmed';
      const esc = (str) =>
        String(str ?? '')
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;');

      return (
        `<div class="char-popup-buff-block${dimmedClass}" data-status-index="${index}" data-status-type="${esc(statusType)}" data-adopted="${isAdopted}">` +
        `<div class="char-popup-buff-icon${iconUrl ? ' has-icon' : ''}">` +
        (iconUrl ? `<img src="${esc(iconUrl)}" alt="${esc(statusType)}" />` : '') +
        `</div>` +
        `<div class="char-popup-buff-center">` +
        `<div class="char-popup-buff-title">${esc(label)}` +
        (powerStr ? `<span class="char-popup-buff-power">${esc(powerStr)}</span>` : '') +
        (sourceSkillName ? `<span class="char-popup-buff-skill">[${esc(sourceSkillName)}]</span>` : '') +
        (sourceCharacterName ? `<span class="char-popup-buff-from">${esc(sourceCharacterName)}</span>` : '') +
        `</div>` +
        (shouldShowSourceSkillDesc ? `<div class="char-popup-buff-desc line-clamp-2">${esc(sourceSkillDesc)}</div>` : '') +
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
    const normalizedStatusType = normalizeEnemyStatusType(status?.statusType);
    const remaining = Number(status?.remaining ?? status?.remainingTurns ?? 0);
    if (remaining > 0) {
      return `${remaining}`;
    }
    return getStatusLabel(normalizedStatusType).substring(0, 3);
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
    const statusType = normalizeEnemyStatusType(status?.statusType) || 'Unknown';
    const elements = Array.isArray(status?.elements) ? status.elements : [];
    const remaining = Number(status?.remaining ?? status?.remainingTurns ?? 0);
    const iconUrl = resolveElementalIconUrl(statusType, elements);
    const displayLabel = resolveElementalLabel(getStatusLabel(statusType), statusType, elements);
    
    const title =
      remaining > 0 && !isPersistentEnemyStatusType(statusType)
        ? `${displayLabel} (残り${remaining}ターン)`
        : displayLabel;

    if (!iconUrl) {
      return '';
    }
    
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
    statusType: normalizeEnemyStatusType(status.statusType),
    remaining: Number(status.remaining ?? status.remainingTurns ?? 0),
    power: readEnemyStatusPower(status),
    elements: Array.isArray(status.elements) ? status.elements : [],
    exitCond: String(status.exitCond ?? '').trim(),
    source: String(status.source ?? '').trim(),
    effectId: Number(status.effectId ?? 0),
    metadata: status.metadata ?? {},
    isActive: isActiveEnemyStatus(status),
  };
}
