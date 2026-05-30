const JSON_DATA_CACHE_PREFIX = 'hbr-data';
const JSON_DATA_CACHE_SCHEMA_VERSION = 'v2';
const JSON_DATA_CACHE_FALLBACK_TOKEN = 'legacy';
const SYNC_METADATA_PATH = '../json/_sync_metadata.json';
const CACHE_TOKEN_SAFE_CHARS = /[^a-zA-Z0-9._-]+/g;

function resolveGlobalWindow() {
  return typeof window !== 'undefined' ? window : null;
}

function resolveLocationHref(locationHref) {
  if (locationHref) {
    return locationHref;
  }
  const win = resolveGlobalWindow();
  return win?.location?.href ?? 'http://localhost/';
}

function resolveFetch(fetchImpl) {
  if (fetchImpl) {
    return fetchImpl;
  }
  const win = resolveGlobalWindow();
  return win?.fetch?.bind(win) ?? globalThis.fetch?.bind(globalThis) ?? null;
}

function resolveCaches(cachesImpl) {
  if (cachesImpl) {
    return cachesImpl;
  }
  const win = resolveGlobalWindow();
  return win?.caches ?? globalThis.caches ?? null;
}

function normalizeCacheToken(value) {
  const token = String(value ?? '').trim().replace(CACHE_TOKEN_SAFE_CHARS, '-');
  return token || JSON_DATA_CACHE_FALLBACK_TOKEN;
}

export function resolveSyncMetadataCacheToken(metadata) {
  const generatedAt = typeof metadata?.generated_at === 'string'
    ? metadata.generated_at.trim()
    : '';
  if (generatedAt) {
    return normalizeCacheToken(generatedAt);
  }
  return JSON_DATA_CACHE_FALLBACK_TOKEN;
}

export function buildJsonDataCacheName(metadata = null) {
  return [
    JSON_DATA_CACHE_PREFIX,
    JSON_DATA_CACHE_SCHEMA_VERSION,
    resolveSyncMetadataCacheToken(metadata),
  ].join('-');
}

export async function fetchSyncMetadata({
  metadataPath = SYNC_METADATA_PATH,
  locationHref = undefined,
  fetchImpl = undefined,
} = {}) {
  const href = resolveLocationHref(locationHref);
  if (new URL(href).protocol === 'file:') {
    return null;
  }

  const fetchJson = resolveFetch(fetchImpl);
  if (!fetchJson) {
    return null;
  }

  const url = new URL(metadataPath, href).href;
  try {
    const response = await fetchJson(url, { cache: 'no-store' });
    if (!response.ok) {
      return null;
    }
    return response.json();
  } catch (error) {
    console.warn('Failed to fetch JSON sync metadata; using legacy data cache.', error);
    return null;
  }
}

export async function cleanupStaleJsonDataCaches(activeCacheName, {
  cachesImpl = undefined,
} = {}) {
  const cacheStorage = resolveCaches(cachesImpl);
  if (!cacheStorage?.keys || !cacheStorage?.delete) {
    return [];
  }

  const deleted = [];
  const cacheNames = await cacheStorage.keys();
  await Promise.all(
    cacheNames.map(async (cacheName) => {
      const isJsonDataCache = cacheName.startsWith(`${JSON_DATA_CACHE_PREFIX}-`);
      if (!isJsonDataCache || cacheName === activeCacheName) {
        return;
      }
      const didDelete = await cacheStorage.delete(cacheName);
      if (didDelete) {
        deleted.push(cacheName);
      }
    })
  );
  return deleted;
}

export async function createJsonDataCacheContext({
  metadataPath = SYNC_METADATA_PATH,
  locationHref = undefined,
  fetchImpl = undefined,
  cachesImpl = undefined,
} = {}) {
  const metadata = await fetchSyncMetadata({
    metadataPath,
    locationHref,
    fetchImpl,
  });
  const cacheName = buildJsonDataCacheName(metadata);
  await cleanupStaleJsonDataCaches(cacheName, { cachesImpl });
  return { cacheName, metadata };
}

export async function fetchJsonWithCache(path, {
  cacheName,
  locationHref = undefined,
  fetchImpl = undefined,
  cachesImpl = undefined,
} = {}) {
  const href = resolveLocationHref(locationHref);
  if (new URL(href).protocol === 'file:') {
    const url = new URL(path, href).href;
    const module = await import(url, { with: { type: 'json' } });
    return module.default;
  }

  const fetchJson = resolveFetch(fetchImpl);
  if (!fetchJson) {
    throw new Error(`Failed to fetch ${path}: fetch is unavailable`);
  }

  const url = new URL(path, href).href;
  const cacheStorage = resolveCaches(cachesImpl);
  if (cacheStorage?.open && cacheName) {
    const cache = await cacheStorage.open(cacheName);
    const cached = await cache.match(url);
    if (cached) return cached.json();
    const response = await fetchJson(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch ${path}: ${response.status}`);
    }
    await cache.put(url, response.clone());
    return response.json();
  }

  const response = await fetchJson(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch ${path}: ${response.status}`);
  }
  return response.json();
}
