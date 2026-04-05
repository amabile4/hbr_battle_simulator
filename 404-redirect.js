const UI_NEXT_INDEX_PATH = '/ui-next/index.html';
const GITHUB_PAGES_HOST_SUFFIX = '.github.io';

function normalizePathname(pathname = '/') {
  const normalized = String(pathname ?? '').trim();
  if (!normalized) {
    return '/';
  }
  return normalized.startsWith('/') ? normalized : `/${normalized}`;
}

function resolveRepoBasePath(locationLike = {}) {
  const host = String(locationLike?.host ?? locationLike?.hostname ?? '').trim().toLowerCase();
  const pathname = normalizePathname(locationLike?.pathname);
  if (!host.endsWith(GITHUB_PAGES_HOST_SUFFIX)) {
    return '';
  }

  const segments = pathname.split('/').filter(Boolean);
  return segments.length > 0 ? `/${segments[0]}` : '';
}

export function resolveNotFoundRedirectPath(locationLike = {}) {
  return `${resolveRepoBasePath(locationLike)}${UI_NEXT_INDEX_PATH}`;
}

export function shouldRedirectFromNotFound(locationLike = {}) {
  return normalizePathname(locationLike?.pathname) !== resolveNotFoundRedirectPath(locationLike);
}

export function resolveNotFoundRedirectUrl(locationLike = {}) {
  const origin = String(locationLike?.origin ?? '').trim();
  const path = resolveNotFoundRedirectPath(locationLike);
  return origin ? `${origin}${path}` : path;
}
