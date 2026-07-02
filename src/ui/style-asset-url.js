const STYLE_ASSET_BASE_URL = '../../assets/styles/';
const UI_ASSET_BASE_URL = '../../assets/ui/';
const UI_CUSTOM_ASSET_BASE_URL = '../../assets/ui_custom/';
const SKILL_TYPE_ASSET_BASE_URL = '../../assets/skill_type/';
const SKILL_TYPE_CUSTOM_ASSET_BASE_URL = '../../assets/skill_type_custom/';

// 対応表に正規ファイルが存在せず、シミュレータ独自に用意された画像。
// assets/ui_custom/ ・ assets/skill_type_custom/ に隔離し、正規ファイルと混在させない。
// 詳細は docs/active/assets_custom_files_migration_plan.md を参照。
const UI_CUSTOM_FILE_NAMES = new Set([
  'Break.webp',
  'dead.webp',
  'defeat.webp',
  'Reinforce.webp',
  'Summon.webp',
  'TokenSet.webp',
]);
const SKILL_TYPE_CUSTOM_FILE_NAMES = new Set([
  'IceSuperBreak.webp',
  'LightSuperBreak.webp',
  'SuperBreakDown.webp',
  'TokenSet.webp',
  'ZoneUpEternal.webp',
]);

export function resolveStyleAssetUrl(fileName) {
  const normalizedFileName = String(fileName ?? '').trim();
  if (!normalizedFileName) {
    return '';
  }
  return new URL(`${STYLE_ASSET_BASE_URL}${encodeURIComponent(normalizedFileName)}`, import.meta.url).href;
}

export function resolveStyleImageUrl(style) {
  return resolveStyleAssetUrl(style?.image);
}

export function resolveUiAssetUrl(fileName) {
  const normalizedFileName = String(fileName ?? '').trim();
  if (!normalizedFileName) return '';
  const base = UI_CUSTOM_FILE_NAMES.has(normalizedFileName) ? UI_CUSTOM_ASSET_BASE_URL : UI_ASSET_BASE_URL;
  return new URL(`${base}${encodeURIComponent(normalizedFileName)}`, import.meta.url).href;
}

export function resolveSkillTypeAssetUrl(fileName) {
  const normalizedFileName = String(fileName ?? '').trim();
  if (!normalizedFileName) return '';
  const base = SKILL_TYPE_CUSTOM_FILE_NAMES.has(normalizedFileName)
    ? SKILL_TYPE_CUSTOM_ASSET_BASE_URL
    : SKILL_TYPE_ASSET_BASE_URL;
  return new URL(`${base}${encodeURIComponent(normalizedFileName)}`, import.meta.url).href;
}
