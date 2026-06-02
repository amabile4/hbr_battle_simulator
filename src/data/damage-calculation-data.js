import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

export function loadDamageCalculationData(rootDir = process.cwd()) {
  const jsonDir = resolve(rootDir, 'json');
  return {
    styles: readJson(resolve(jsonDir, 'styles.json')),
    characters: readJson(resolve(jsonDir, 'characters.json')),
    enemies: readJson(resolve(jsonDir, 'enemies.json')),
    skills: readJson(resolve(jsonDir, 'skills.json')),
  };
}
