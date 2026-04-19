import { MAX_PARTY_SIZE } from './party.js';

export const VALID_NORMAL_ATTACK_ELEMENTS = Object.freeze(['Fire', 'Ice', 'Thunder', 'Light', 'Dark']);
const VALID_NORMAL_ATTACK_ELEMENT_SET = new Set(VALID_NORMAL_ATTACK_ELEMENTS);

export function normalizeSingleNormalAttackElement(value) {
  const normalized = String(value ?? '').trim();
  return VALID_NORMAL_ATTACK_ELEMENT_SET.has(normalized) ? normalized : null;
}

export function getNormalAttackElementsForPartyIndex(source = {}, index) {
  const raw = source?.[index] ?? source?.[String(index)] ?? null;
  if (!Array.isArray(raw) || raw.length !== 1) {
    return null;
  }
  const element = normalizeSingleNormalAttackElement(raw[0]);
  return element ? [element] : null;
}

export function normalizeNormalAttackElementsByPartyIndex(source = {}, partySize = MAX_PARTY_SIZE) {
  const normalized = {};
  for (let index = 0; index < partySize; index += 1) {
    const elements = getNormalAttackElementsForPartyIndex(source, index);
    if (!elements) {
      continue;
    }
    normalized[String(index)] = elements;
  }
  return normalized;
}
