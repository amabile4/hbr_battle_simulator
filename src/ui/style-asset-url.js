const STYLE_ASSET_BASE_URL = '../../assets/styles/';
const UI_ASSET_BASE_URL = '../../assets/ui/';
const SKILL_TYPE_ASSET_BASE_URL = '../../assets/skill_type/';

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
  return new URL(`${UI_ASSET_BASE_URL}${encodeURIComponent(normalizedFileName)}`, import.meta.url).href;
}

export function resolveSkillTypeAssetUrl(fileName) {
  const normalizedFileName = String(fileName ?? '').trim();
  if (!normalizedFileName) return '';
  return new URL(`${SKILL_TYPE_ASSET_BASE_URL}${encodeURIComponent(normalizedFileName)}`, import.meta.url).href;
}
