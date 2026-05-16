/**
 * status-sort-order.js
 *
 * char-popup-panel / enemy-detail-popup 共通の statusType ソート定義。
 *
 * ソートアルゴリズム（§2.5 + §3.2 準拠）:
 *   0th: 特殊ステータス      Reinforce, ActionDisabled（§3.2 最優先）
 *   1st: 属性バリアント分類  (1)a → (1)b → (2)
 *   2nd: UNIFIED_STATUS_TYPE_ID_MAP の ID 昇順
 *   3rd: 属性順              Fire → Ice → Thunder → Light → Dark
 *   4th: 期間グループ        Eternal → Turn系 → Count
 *   5th: power 降順
 *   6th: remaining 降順
 *   7th (char のみ): effectId 昇順
 *
 * ID が未定義の statusType は、各パネル固有のフォールバック順序（10000+ オフセット）に従う。
 * フォールバック順序にも未登録の statusType は末尾（20000）に配置される。
 *
 * --- 未解決事項（暫定ソート順 v1 scope-out）---
 * [SORT-TODO-1] ID=264 に BreakDownTurnUp (char) と DownTurn (enemy) が重複割当
 * [SORT-TODO-2] 味方/敵で statusType 名が異なる組 (ConfusionRandom/Confusion 等)
 * [SORT-TODO-3] フォールバック順の思想差（char=カテゴリ別, enemy=debuff優先）統一是非
 */

import { ELEMENT_PREFIXED_STATUS_TYPES } from './element-status-constants.js';

/**
 * 統合 statusType → ソート ID マップ。
 *
 * char-detail-popup.js の STATUS_TAB_SKILL_TYPE_ID_MAP と
 * enemy-status-display.js の ENEMY_STATUS_TYPE_ID_MAP を統合したもの。
 * 片方にしか存在しなかったエントリにはコメントで出自を明示。
 */
export const UNIFIED_STATUS_TYPE_ID_MAP = Object.freeze({
  // --- 特殊状態（char 専用の擬似ステータス） ---
  Reinforce:            -2,   // char only
  ActionDisabled:       -1,   // char only

  // --- SP / HP 回復 ---
  HealDp:               20,   // char only
  HealSp:               22,   // char only

  // --- 攻撃 / 防御 ---
  AttackUp:              30,
  AttackDown:            32,
  DefenseDown:           34,
  DefenseUp:             36,

  // --- 状態異常（気絶 char / enemy で名前差あり → SORT-TODO-2） ---
  StunRandom:            41,   // char only (enemy 側は Stun だが ID 未登録)

  // --- 特殊バフ ---
  Funnel:                50,   // char only
  Provoke:               54,   // char only
  Invincible:            56,   // char only

  // --- クリティカル ---
  CriticalRateUp:        70,
  CriticalRateDown:      72,
  CriticalDamageUp:      74,
  CriticalDamageDown:    76,

  // --- OD ゲージ ---
  OverDrivePointUp:      80,

  // --- 耐性 ---
  ResistUp:             100,
  ResistDown:           102,
  Fragile:              104,

  // --- 混乱 / 束縛（enemy 側の正規名 → SORT-TODO-2） ---
  Confusion:            106,   // enemy only
  ConfusionRandom:      107,   // char only
  Imprison:             109,   // enemy only
  ImprisonRandom:       110,   // char only

  // --- チャージ ---
  BuffCharge:           111,   // char only

  // --- OD ダウン ---
  OverDrivePointDown:   123,

  // --- 反動（enemy 側の正規名 → SORT-TODO-2） ---
  Recoil:               128,   // enemy only
  RecoilRandom:         129,   // char only

  // --- 回復ダウン ---
  HealDown:             146,

  // --- 防御系バフ ---
  Cover:                162,   // char only
  Misfortune:           164,
  Undermine:            166,   // enemy only

  // --- 特殊状態 ---
  MindEye:              187,   // char only
  SelfDamage:           192,

  // --- ブレイク ---
  SuperBreak:           221,
  DebuffGuard:          226,   // char only
  BreakGuard:           231,   // char only
  RemoveBuff:           235,

  // --- 回避 ---
  Dodge:                243,   // char only

  // --- ダウンターン系 (ID=264 重複 → SORT-TODO-1) ---
  BreakDownTurnUp:      264,   // char uses this key
  DownTurn:             264,   // enemy uses this key — 同一 ID

  // --- 回復アップ / デバフ解除 ---
  HealUp:               291,   // enemy only
  RemoveDebuff:         301,   // char only
  SuperBreakDown:       302,
  Mocktail:             313,   // char only

  // --- バリア ---
  Barrier:              321,   // enemy only
});

/**
 * statusType の統合ソート ID を取得する。
 *
 * @param {string} statusType
 * @returns {number|undefined} 登録済みなら ID 数値、未登録なら undefined
 */
export function getUnifiedStatusTypeId(statusType) {
  const key = String(statusType ?? '').trim();
  if (!key) return undefined;
  const id = UNIFIED_STATUS_TYPE_ID_MAP[key];
  return Number.isFinite(id) ? id : undefined;
}

/**
 * USE_UNIFIED_ID_ORDER フラグ。
 * true: UNIFIED_STATUS_TYPE_ID_MAP の ID 昇順を優先
 * false: 各パネル固有のフォールバック順序のみ使用
 *
 * 暫定ソート順 v1 では true 固定。元に戻したい場合はこの値を false にする。
 */
export const USE_UNIFIED_ID_ORDER = true;

/**
 * ID 未定義 statusType のフォールバックオフセット。
 * パネル固有の表示順序 index にこの値を加算して、
 * ID 定義済みの statusType より後ろに配置する。
 */
export const FALLBACK_ORDER_OFFSET = 10000;

/**
 * パネル固有フォールバック順序にも未登録の statusType に使用するソート値。
 */
export const UNKNOWN_ORDER_VALUE = 20000;

/**
 * 属性の副ソート順。
 * 同一カテゴリ・同一 statusType 内で属性付きエフェクトを並べる。
 */
export const ELEMENT_SORT_ORDER = Object.freeze({
  Fire:      1,
  Ice:       2,
  Thunder:   3,
  Light:     4,
  Dark:      5,
});

/**
 * エフェクトの先頭属性からソート値を取得する。
 * 属性なしは 0（カテゴリ (1)b 判定後に呼ばれるため先頭配置でよい）。
 * @param {Array|undefined} elements
 * @returns {number}
 */
export function getElementSortValue(elements) {
  const first = String(Array.isArray(elements) ? (elements[0] ?? '') : '').trim();
  if (!first) return 0;
  const value = ELEMENT_SORT_ORDER[first];
  return Number.isFinite(value) ? value : 99;
}

/**
 * 同一 statusType / 同一属性内の期間グループ副ソート値。
 *
 * 表示仕様:
 *   0: Eternal
 *   1: Turn 系（TurnEnd / PlayerTurnEnd / EnemyTurnEnd など Count 以外の有限）
 *   2: Count
 *
 * @param {object} status
 * @returns {number}
 */
export function getStatusDurationSortValue(status) {
  const exitCond = String(status?.exitCond ?? '').trim();
  if (exitCond === 'Eternal') {
    return 0;
  }
  if (exitCond === 'Count') {
    return 2;
  }
  return 1;
}

// ============================================================
// 属性バリアント分類 — §2.2 (1)a / (1)b / (2)
// ============================================================

const ELEMENT_PREFIXES = Object.freeze(['Fire', 'Ice', 'Thunder', 'Light', 'Dark']);

/**
 * ELEMENT_PREFIXED_STATUS_TYPES から「属性バリアントが存在しうる基底 statusType」を自動抽出。
 * 例: FireAttackUp, IceAttackUp → AttackUp が属性バリアント種別
 */
const HAS_ELEMENT_VARIANT_BASE_TYPES = Object.freeze(
  new Set(
    [...ELEMENT_PREFIXED_STATUS_TYPES]
      .map((composite) => {
        for (const prefix of ELEMENT_PREFIXES) {
          if (composite.startsWith(prefix)) {
            return composite.slice(prefix.length);
          }
        }
        return null;
      })
      .filter(Boolean)
  )
);

/**
 * 属性バリアント分類カテゴリ値。
 *
 * §3.2 特殊状態（Reinforce, ActionDisabled）は最優先表示。
 * §2.2 表示順: (1)a → (1)b → (2)
 *   SPECIAL = -1: 特殊ステータス（統合ID < 0）— 最優先
 *   (1)a = 0: 属性バリアント存在しうる種別 かつ 属性付き効果
 *   (1)b = 1: 属性バリアント存在しうる種別 かつ 属性なし効果
 *   (2)  = 2: 属性バリアントが存在しない種別
 */
export const VARIANT_CATEGORY_SPECIAL = -1;
export const VARIANT_CATEGORY_1A = 0;
export const VARIANT_CATEGORY_1B = 1;
export const VARIANT_CATEGORY_2  = 2;

/**
 * エフェクトの属性バリアントカテゴリを判定する。
 *
 * @param {string} statusType
 * @param {Array|undefined} elements
 * @returns {number} VARIANT_CATEGORY_1A | VARIANT_CATEGORY_1B | VARIANT_CATEGORY_2
 */
export function getElementVariantCategory(statusType, elements) {
  const base = String(statusType ?? '').trim();
  if (!base) return VARIANT_CATEGORY_2;

  // §3.2 特殊ステータス（統合ID < 0: Reinforce, ActionDisabled）は最優先
  const id = UNIFIED_STATUS_TYPE_ID_MAP[base];
  if (Number.isFinite(id) && id < 0) {
    return VARIANT_CATEGORY_SPECIAL;
  }

  if (!HAS_ELEMENT_VARIANT_BASE_TYPES.has(base)) {
    return VARIANT_CATEGORY_2;
  }

  const firstElement = String(Array.isArray(elements) ? (elements[0] ?? '') : '').trim();
  return firstElement ? VARIANT_CATEGORY_1A : VARIANT_CATEGORY_1B;
}
