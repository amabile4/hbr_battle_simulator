import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildJsonDataCacheName,
  createJsonDataCacheContext,
  fetchJsonWithCache,
} from '../ui-next/utils/json-cache.js';

function jsonResponse(payload, init = {}) {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });
}

function createMemoryCaches(initialNames = []) {
  const stores = new Map(initialNames.map((name) => [name, new Map()]));
  return {
    async keys() {
      return [...stores.keys()];
    },
    async delete(name) {
      return stores.delete(name);
    },
    async open(name) {
      if (!stores.has(name)) {
        stores.set(name, new Map());
      }
      const store = stores.get(name);
      return {
        async match(url) {
          return store.get(String(url)) ?? null;
        },
        async put(url, response) {
          store.set(String(url), response);
        },
      };
    },
    stores,
  };
}

test('buildJsonDataCacheName changes when sync metadata generated_at changes', () => {
  const before = buildJsonDataCacheName({
    generated_at: '2026-05-01T19:35:56+09:00',
  });
  const after = buildJsonDataCacheName({
    generated_at: '2026-05-31T02:46:33.547768+09:00',
  });

  assert.notEqual(before, after);
  assert.equal(after, 'hbr-data-v2-2026-05-31T02-46-33.547768-09-00');
});

test('createJsonDataCacheContext fetches metadata without Cache API and deletes stale data caches', async () => {
  const staleCacheName = buildJsonDataCacheName({
    generated_at: '2026-05-01T19:35:56+09:00',
  });
  const caches = createMemoryCaches([staleCacheName, 'unrelated-cache']);
  const fetchCalls = [];
  const fetchImpl = async (url, options) => {
    fetchCalls.push({ url, options });
    return jsonResponse({
      generated_at: '2026-05-31T02:46:33.547768+09:00',
      datasets: {
        'enemies.json': {
          sha256: '3a0a',
        },
      },
    });
  };

  const context = await createJsonDataCacheContext({
    locationHref: 'https://example.test/ui-next/',
    fetchImpl,
    cachesImpl: caches,
  });

  assert.equal(context.cacheName, 'hbr-data-v2-2026-05-31T02-46-33.547768-09-00');
  assert.deepEqual(fetchCalls, [
    {
      url: 'https://example.test/json/_sync_metadata.json',
      options: { cache: 'no-store' },
    },
  ]);
  assert.deepEqual(await caches.keys(), ['unrelated-cache']);
});

test('fetchJsonWithCache uses the metadata-derived cache name for JSON payloads', async () => {
  const caches = createMemoryCaches();
  const fetchCalls = [];
  const fetchImpl = async (url) => {
    fetchCalls.push(url);
    return jsonResponse({ source: 'network', url });
  };
  const cacheName = buildJsonDataCacheName({
    generated_at: '2026-05-31T02:46:33.547768+09:00',
  });

  const first = await fetchJsonWithCache('../json/enemies.json', {
    cacheName,
    locationHref: 'https://example.test/ui-next/',
    fetchImpl,
    cachesImpl: caches,
  });
  const second = await fetchJsonWithCache('../json/enemies.json', {
    cacheName,
    locationHref: 'https://example.test/ui-next/',
    fetchImpl,
    cachesImpl: caches,
  });

  assert.deepEqual(first, {
    source: 'network',
    url: 'https://example.test/json/enemies.json',
  });
  assert.deepEqual(second, first);
  assert.deepEqual(fetchCalls, ['https://example.test/json/enemies.json']);
  assert.equal(caches.stores.get(cacheName).size, 1);
});
