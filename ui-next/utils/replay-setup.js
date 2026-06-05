import {
  syncReplaySetupNormalAttackElements,
} from '../../src/ui/lightweight-replay-script.js';
import { getNormalAttackElementsForPartyIndex } from '../../src/domain/normal-attack-elements.js';

function compactFilledIndices(styleIds = []) {
  return styleIds
    .map((styleId, index) => (styleId !== null ? index : null))
    .filter((index) => index !== null);
}

function buildNormalAttackElementsByPartyIndex(snapshot = {}, filledIndices = []) {
  return Object.fromEntries(
    filledIndices
      .map((sourceIndex, compactIndex) => {
        const elements = getNormalAttackElementsForPartyIndex(snapshot?.normalAttackElementsByPartyIndex, sourceIndex);
        return elements ? [compactIndex, elements] : null;
      })
      .filter(Boolean)
  );
}

export function buildReplaySetupFromPartySnapshot(snapshot = {}) {
  const filledIndices = compactFilledIndices(snapshot?.styleIds ?? []);
  const setup = {
    styleIds: filledIndices.map((index) => snapshot.styleIds[index]),
    supportStyleIdsByPartyIndex: Object.fromEntries(
      filledIndices
        .map((sourceIndex, compactIndex) => [compactIndex, snapshot.supportStyleIds?.[sourceIndex] ?? null])
        .filter(([, styleId]) => styleId !== null)
    ),
    limitBreakLevelsByPartyIndex: Object.fromEntries(
      filledIndices.map((sourceIndex, compactIndex) => [
        compactIndex,
        snapshot.limitBreakLevelsByPartyIndex[sourceIndex] ?? 0,
      ])
    ),
    statsByPartyIndex: Object.fromEntries(
      filledIndices
        .map((sourceIndex, compactIndex) => {
          const value = snapshot.statsByPartyIndex?.[sourceIndex] ?? snapshot.statsByPartyIndex?.[String(sourceIndex)] ?? null;
          return value && typeof value === 'object' ? [compactIndex, structuredClone(value)] : null;
        })
        .filter(Boolean)
    ),
    skillSetsByPartyIndex: Object.fromEntries(
      filledIndices
        .map((sourceIndex, compactIndex) => {
          const equippedSkillIds =
            snapshot.skillSetsByPartyIndex?.[sourceIndex] ??
            snapshot.skillSetsByPartyIndex?.[String(sourceIndex)] ??
            null;
          return Array.isArray(equippedSkillIds)
            ? [compactIndex, structuredClone(equippedSkillIds)]
            : null;
        })
        .filter(Boolean)
    ),
    setupEntries: [],
  };
  return syncReplaySetupNormalAttackElements(
    setup,
    buildNormalAttackElementsByPartyIndex(snapshot, filledIndices)
  );
}
