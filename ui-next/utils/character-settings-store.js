const STORAGE_KEY = 'hbr.ui_next.character_settings.v1';

export const DEFAULT_TITLE_RANK = 12;
export const DEFAULT_REINCARNATION = 5;
export const MAX_TITLE_RANK = 12;
export const MAX_REINCARNATION = 5;

/**
 * localStorage からキャラクター設定を読む。
 * @returns {{ [charaLabel: string]: { titleRank: number, reincarnation: number } }}
 */
export function readCharacterSettings() {
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
 * キャラクター設定を localStorage に書く。
 */
export function writeCharacterSettings(settings) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch (e) {
    console.warn('[CharacterSettingsStore] save failed:', e);
  }
}

/**
 * 指定キャラクターの称号レベルを返す。未設定ならデフォルト値。
 */
export function resolveTitleRank(settings, charaLabel) {
  return settings[String(charaLabel)]?.titleRank ?? DEFAULT_TITLE_RANK;
}

/**
 * 指定キャラクターの転生回数を返す。未設定ならデフォルト値。
 */
export function resolveReincarnation(settings, charaLabel) {
  return settings[String(charaLabel)]?.reincarnation ?? DEFAULT_REINCARNATION;
}
