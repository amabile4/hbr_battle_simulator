const STORAGE_KEY = 'hbr.ui_next.style_ownership.v1';

/**
 * localStorage からスタイル所持データを読む。
 * @returns {{ [styleId: string]: number | null }}  null=未所持、数値=LBレベル
 */
export function readStyleOwnership() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return {};
    return parsed;
  } catch {
    return {};
  }
}

/**
 * スタイル所持データを localStorage に書く。
 */
export function writeStyleOwnership(entries) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  } catch (e) {
    console.warn('[StyleOwnershipStore] save failed:', e);
  }
}

/**
 * 指定スタイルの所持状態を返す。
 * entries に存在しない場合はデフォルト（A/S → lbMax、SS/SSR → 0）。
 * @returns {number | null}  null=未所持、数値=LBレベル
 */
export function resolveOwnershipState(entries, style, store) {
  const key = String(style.id);
  if (key in entries) return entries[key];
  const tier = (style?.tier ?? '').toUpperCase();
  return (tier === 'A' || tier === 'S') ? store.getLimitBreakMaxByTier(tier) : 0;
}

/**
 * クリック時のサイクル: 未所持 → 0 → 1 → ... → lbMax → 未所持
 */
export function cycleOwnershipState(current, lbMax) {
  if (current === null) return 0;
  if (current >= lbMax) return null;
  return current + 1;
}
