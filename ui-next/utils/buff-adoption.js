/**
 * buff-adoption.js
 *
 * バフ/デバフの採用判定（重ねがけ競合解決）の共有ロジック。
 * buff-display.js / char-detail-popup.js / enemy-status-display.js が共通で使用。
 *
 * §1.2 / §4 準拠:
 *   競合グループキー = statusType × elements × 期間グループ（無限/有限）
 *
 *   グループ内の採用ルール:
 *     グループ内を 2 つのバケットに分ける:
 *       - Only バケット   : limitType='Only' の効果（最大 1 件、power 最大）
 *       - 非Only バケット : それ以外の効果（Default/Count/Once/Inf/None）
 *                          （最大 2 件、power 上位2件）
 *
 *     両バケットの power 合計を比較し、合計が大きい側を採用する。
 *     合計が同値の場合は Only(Turn) 側を採用する
 *     （有効ターン中は消費されないため Count 系より有利）。
 *
 *   重要:
 *     「Default だから全件採用」という数え方は存在しない。
 *     Eternal でも Only でなければ 2 件まで重なり、
 *     Eternal かつ Only なら 1 件しか採用されない。
 *     Fragile は Eternal 2 件 + 有限 2 件 = 最大 4 件有効になりうる。
 */

// ============================================================
// 効果値読み取り
// ============================================================

export function readEffectPower(effect) {
  const numeric = Number(effect?.power ?? 0);
  return Number.isFinite(numeric) ? numeric : 0;
}

// ============================================================
// 効果ソート（power 降順 → remaining 降順 → effectId 昇順）
// ============================================================

export function compareByPowerDesc(a, b) {
  const powerA = readEffectPower(a);
  const powerB = readEffectPower(b);
  if (powerA !== powerB) return powerB - powerA;

  const remainingA = Number(a?.remaining ?? 0);
  const remainingB = Number(b?.remaining ?? 0);
  if (remainingA !== remainingB) return remainingB - remainingA;

  const idA = Number(a?.effectId ?? 0);
  const idB = Number(b?.effectId ?? 0);
  return idA - idB;
}

function pickTopByPower(effects, limit) {
  const max = Math.max(0, Number(limit) || 0);
  if (max <= 0) return [];
  return effects.slice().sort(compareByPowerDesc).slice(0, max);
}

// ============================================================
// 競合グループキー
// ============================================================

/**
 * 期間グループ: 'eternal' (Eternal) / 'finite' (Turn, Count, その他)
 */
function getDurationGroup(effect) {
  return String(effect?.exitCond ?? '').trim() === 'Eternal'
    ? 'eternal'
    : 'finite';
}

/**
 * 競合グループキーを生成。
 * statusType × elements × 期間グループ の組み合わせ。
 *
 * @param {object} effect
 * @returns {string} e.g. "DefenseDown|Dark|finite", "AttackUp||eternal"
 */
export function buildCompetitionGroupKey(effect) {
  const statusType = String(effect?.statusType ?? '').trim();
  const elements = Array.isArray(effect?.elements)
    ? [...new Set(effect.elements.map((e) => String(e ?? '').trim()).filter(Boolean))]
        .sort()
        .join(',')
    : '';
  const duration = getDurationGroup(effect);
  return `${statusType}|${elements}|${duration}`;
}

// ============================================================
// グループ内採用判定
// ============================================================

function sumPower(effects) {
  return effects.reduce((sum, e) => sum + readEffectPower(e), 0);
}

/**
 * 単一競合グループ内の effects から採用される effects を選択する。
 *
 * ルール:
 *   1. Only バケット (limitType='Only') から power 最大の 1 件を取得
 *   2. 非Only バケット（それ以外）から power 上位 2 件を取得
 *   3. それぞれの power 合計を比較:
 *        - 非Only 合計 > Only 合計 → 非Only 側（最大2件）を採用
 *        - Only 合計 > 非Only 合計 → Only 側（1件）を採用
 *        - 同値 → Only 側を採用（Turn は消費されないため有利）
 *
 * @param {Array} effects - 同一競合グループ内の効果リスト
 * @returns {Set<object>} 採用された effect オブジェクトの参照セット
 */
function resolveAdoptionWithinGroup(effects) {
  const onlyBucket = effects.filter(
    (e) => String(e?.limitType ?? '') === 'Only',
  );
  const nonOnlyBucket = effects.filter(
    (e) => String(e?.limitType ?? '') !== 'Only',
  );

  const bestOnly = pickTopByPower(onlyBucket, 1); // 最大 1 件
  const topNonOnly = pickTopByPower(nonOnlyBucket, 2); // 最大 2 件

  if (bestOnly.length === 0 && topNonOnly.length === 0) {
    return new Set();
  }
  if (bestOnly.length === 0) return new Set(topNonOnly);
  if (topNonOnly.length === 0) return new Set(bestOnly);

  const onlyPower = sumPower(bestOnly);
  const nonOnlyPower = sumPower(topNonOnly);

  // 同値は Only(Turn) 側を優先
  if (onlyPower >= nonOnlyPower) {
    return new Set(bestOnly);
  }
  return new Set(topNonOnly);
}

// ============================================================
// Public API
// ============================================================

/**
 * 効果リストの各要素に採用/非採用フラグ (_adopted) を付与して返す。
 *
 * 入力の effect オブジェクト自体は変更せず、スプレッドコピーに _adopted を追加。
 *
 * @param {Array} effects - アクティブ効果リスト
 * @returns {Array<object>} 各要素に _adopted: boolean を追加した新配列
 */
export function resolveAdoptionStatus(effects) {
  if (!Array.isArray(effects) || effects.length === 0) return [];

  const groups = new Map();
  for (const effect of effects) {
    const key = buildCompetitionGroupKey(effect);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(effect);
  }

  const adoptedSet = new Set();
  for (const groupEffects of groups.values()) {
    for (const e of resolveAdoptionWithinGroup(groupEffects)) {
      adoptedSet.add(e);
    }
  }

  return effects.map((effect) => ({
    ...effect,
    _adopted: adoptedSet.has(effect),
  }));
}

/**
 * 採用された効果のみを返す（buff-icon-list 等、非採用を表示しない箇所向け）。
 *
 * @param {Array} effects - アクティブ効果リスト
 * @returns {Array} 採用された効果のみ（_adopted プロパティ付き）
 */
export function selectAdoptedEffects(effects) {
  return resolveAdoptionStatus(effects).filter((e) => e._adopted);
}
