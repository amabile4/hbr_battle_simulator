import { HbrDataStore } from '../src/index.js';

let storeCache = null;

export function getStore() {
  if (!storeCache) {
    storeCache = HbrDataStore.fromJsonDirectory('json');
  }
  return storeCache;
}

export function getSixUsableStyleIds(store) {
  const picked = [];
  const seenCharacters = new Set();

  for (const style of store.styles) {
    if (!Array.isArray(style.skills) || style.skills.length === 0) {
      continue;
    }

    const key = String(style.chara_label ?? style.chara ?? '');
    if (seenCharacters.has(key)) {
      continue;
    }

    seenCharacters.add(key);
    picked.push(Number(style.id));

    if (picked.length === 6) {
      break;
    }
  }

  if (picked.length !== 6) {
    throw new Error('Could not find 6 unique characters with at least one skill.');
  }

  return picked;
}
