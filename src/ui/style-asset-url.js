const STYLE_ASSET_BASE_URL = '../../assets/styles/';

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
