import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

const dataCache = new Map();

export function loadDamageCalculationData(rootDir = process.cwd()) {
  const cacheKey = resolve(rootDir);
  if (dataCache.has(cacheKey)) {
    return dataCache.get(cacheKey);
  }
  const jsonDir = resolve(rootDir, 'json');
  const data = {
    styles: readJson(resolve(jsonDir, 'styles.json')),
    characters: readJson(resolve(jsonDir, 'characters.json')),
    enemies: readJson(resolve(jsonDir, 'enemies.json')),
    skills: readJson(resolve(jsonDir, 'skills.json')),
  };
  dataCache.set(cacheKey, data);
  return data;
}
