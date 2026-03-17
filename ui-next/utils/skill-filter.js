const STORAGE_KEY = 'hbr.ui_next.skill_filter.v1';

/**
 * localStorage から除外 skillId の Set を取得する。
 * キーなし or styleId なし → 空 Set（除外なし = 全件表示）。
 * @param {number} styleId
 * @returns {Set<number>}
 */
export function getExcludedSkillIds(styleId) {
  if (!styleId) return new Set();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    const arr = parsed[styleId];
    return Array.isArray(arr) ? new Set(arr) : new Set();
  } catch {
    return new Set();
  }
}

/**
 * 除外 skillId Set を localStorage に保存する。
 * Set が空の場合は該当 styleId のキーを削除する（デフォルト状態に戻す）。
 * @param {number} styleId
 * @param {Set<number>} excludedSet
 */
export function setExcludedSkillIds(styleId, excludedSet) {
  if (!styleId) return;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    if (excludedSet.size === 0) {
      delete parsed[styleId];
    } else {
      parsed[styleId] = [...excludedSet];
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(parsed));
  } catch (e) {
    console.warn('skill-filter: failed to save filter', e);
  }
}

/**
 * スタイル変更時にそのスタイルのフィルタ設定をリセットする（全件表示に戻す）。
 * @param {number} styleId
 */
export function clearFilterForStyle(styleId) {
  if (!styleId) return;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    delete parsed[styleId];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(parsed));
  } catch (e) {
    console.warn('skill-filter: failed to clear filter', e);
  }
}
