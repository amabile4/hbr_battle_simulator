/**
 * buff-adoption.js
 *
 * バフ/デバフの採用判定（重ねがけ競合解決）の共有ロジック。
 * buff-display.js / char-detail-popup.js / enemy-status-display.js が共通で使用。
 *
 * §1.2 準拠:
 *   グループキー = statusType × elements × 期間グループ（無限/有限）
 *   グループ内の採用上限は limitType で決定:
 *     Default: 全て採用
 *     Only:    1個（power 最大）
 *     Count:   2個（power 上位2個）
 *     Only vs Count: 効果値合計が大きい方を採用（同値なら Count 側）
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
// limitType 判定
// ============================================================

function isCountLikeEffect(effect) {
  if (String(effect?.limitType ?? '') === 'Only') return false;
  return (
    String(effect?.exitCond ?? '') === 'Count' ||
    String(effect?.limitType ?? '') === 'Count'
  );
}

// ============================================================
// 競合グループキー
// ============================================================

/**
 * 期間グループ: 'eternal' (Eternal) / 'finite' (Turn, Count, etc.)
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

/**
 * 単一競合グループ内の effects から採用される effects を選択する。
 *
 * @param {Array} effects - 同一競合グループ内の効果リスト
 * @returns {Set<object>} 採用された effect オブジェクトの参照セット
 */
function resolveAdoptionWithinGroup(effects) {
  const defaults = effects.filter(
    (e) =>
      String(e?.limitType ?? '') !== 'Only' && !isCountLikeEffect(e),
  );
  const onlyCandidates = effects.filter(
    (e) => String(e?.limitType ?? '') === 'Only',
  );
  const countCandidates = effects.filter((e) => isCountLikeEffect(e));

  const bestOnly = pickTopByPower(onlyCandidates, 1)[0] ?? null;
  const topCount = pickTopByPower(countCandidates, 2);
  const onlyPower = bestOnly ? readEffectPower(bestOnly) : 0;
  const countPower = topCount.reduce(
    (sum, e) => sum + readEffectPower(e),
    0,
  );
  const competitive =
    countPower >= onlyPower
      ? topCount
      : bestOnly
        ? [bestOnly]
        : [];

  return new Set([...defaults, ...competitive]);
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
