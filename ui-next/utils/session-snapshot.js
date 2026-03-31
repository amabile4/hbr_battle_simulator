import { normalizeLightweightReplayScript } from '../../src/ui/lightweight-replay-script.js';
import { normalizeSimulatorSettings } from './simulator-settings.js';
import { normalizeValidationPolicy } from './validation-policy.js';

export const SESSION_SNAPSHOT_VERSION = 1;
const PARTY_SIZE = 6;

function toOptionalNumber(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function toOptionalStyleId(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return null;
  }
  return numeric;
}

function normalizeIndexedObject(source = {}, fallbackValue = 0) {
  const normalized = {};
  for (let index = 0; index < PARTY_SIZE; index += 1) {
    const key = String(index);
    const numeric = Number(source?.[key] ?? source?.[index] ?? fallbackValue);
    normalized[key] = Number.isFinite(numeric) ? numeric : fallbackValue;
  }
  return normalized;
}

function normalizeSkillSetsByPartyIndex(source = {}) {
  const normalized = {};
  for (let index = 0; index < PARTY_SIZE; index += 1) {
    const raw =
      source?.[index] ??
      source?.[String(index)] ??
      null;
    if (!Array.isArray(raw)) {
      continue;
    }
    normalized[String(index)] = [...new Set(
      raw
        .map((value) => Number(value))
        .filter((value) => Number.isFinite(value))
    )];
  }
  return normalized;
}

export function normalizePartySetupSnapshot(snapshot = {}) {
  const styleIds = Array.from({ length: PARTY_SIZE }, (_, index) =>
    toOptionalStyleId(snapshot?.styleIds?.[index])
  );
  const supportStyleIds = Array.from({ length: PARTY_SIZE }, (_, index) =>
    toOptionalStyleId(snapshot?.supportStyleIds?.[index])
  );
  return {
    isFrontFilled: styleIds.slice(0, 3).every((styleId) => styleId !== null),
    styleIds,
    supportStyleIds,
    limitBreakLevelsByPartyIndex: normalizeIndexedObject(snapshot?.limitBreakLevelsByPartyIndex, 0),
    supportLimitBreakLevelsByPartyIndex: normalizeIndexedObject(
      snapshot?.supportLimitBreakLevelsByPartyIndex,
      0
    ),
    drivePierceByPartyIndex: normalizeIndexedObject(snapshot?.drivePierceByPartyIndex, 0),
    startSpEquipByPartyIndex: normalizeIndexedObject(snapshot?.startSpEquipByPartyIndex, 0),
    skillSetsByPartyIndex: normalizeSkillSetsByPartyIndex(snapshot?.skillSetsByPartyIndex),
  };
}

export function normalizeSessionSnapshot(snapshot = {}) {
  return {
    version: SESSION_SNAPSHOT_VERSION,
    setup: normalizePartySetupSnapshot(snapshot?.setup),
    simulatorSettings: normalizeSimulatorSettings(snapshot?.simulatorSettings),
    validationPolicy: normalizeValidationPolicy(snapshot?.validationPolicy),
    replayScript: normalizeLightweightReplayScript(snapshot?.replayScript),
  };
}

export function serializeSessionSnapshot(snapshot = {}) {
  return JSON.stringify(normalizeSessionSnapshot(snapshot), null, 2);
}

function resolveOptionalName(resolver, id) {
  if (!Number.isFinite(Number(id)) || typeof resolver !== 'function') {
    return null;
  }
  const name = resolver(Number(id));
  const normalized = String(name ?? '').trim();
  return normalized || null;
}

function buildSkillNamesByPartyIndex(skillSetsByPartyIndex = {}, resolveSkillName = null) {
  const namesByPartyIndex = {};
  for (let index = 0; index < PARTY_SIZE; index += 1) {
    const key = String(index);
    const skillIds =
      skillSetsByPartyIndex?.[key] ??
      skillSetsByPartyIndex?.[index] ??
      null;
    if (!Array.isArray(skillIds)) {
      continue;
    }
    namesByPartyIndex[key] = skillIds.map((skillId) => resolveOptionalName(resolveSkillName, skillId));
  }
  return namesByPartyIndex;
}

function buildResolvedNameList(ids = [], resolver = null) {
  return ids.map((id) => resolveOptionalName(resolver, id));
}

function buildIndexedResolvedNameMap(indexedValues = {}, resolver = null) {
  const result = {};
  for (let index = 0; index < PARTY_SIZE; index += 1) {
    const key = String(index);
    const value = indexedValues?.[key] ?? indexedValues?.[index] ?? null;
    result[key] = resolveOptionalName(resolver, value);
  }
  return result;
}

function normalizeSpMap(values = {}) {
  const result = {};
  if (!values || typeof values !== 'object') {
    return result;
  }
  for (const [styleId, value] of Object.entries(values)) {
    const numericStyleId = Number(styleId);
    const numericSp = Number(value);
    if (!Number.isFinite(numericStyleId) || !Number.isFinite(numericSp)) {
      continue;
    }
    result[String(numericStyleId)] = numericSp;
  }
  return result;
}

function buildSpMapByCharacterName(spByStyleId = {}, styleIds = [], characterNames = []) {
  const result = {};
  const styleIdToCharacterName = new Map();
  const safeStyleIds = Array.isArray(styleIds) ? styleIds : [];
  const safeCharacterNames = Array.isArray(characterNames) ? characterNames : [];

  for (let index = 0; index < PARTY_SIZE; index += 1) {
    const styleId = Number(safeStyleIds[index]);
    const characterName = String(safeCharacterNames[index] ?? '').trim();
    if (!Number.isFinite(styleId) || !characterName) {
      continue;
    }
    styleIdToCharacterName.set(String(styleId), characterName);
  }

  for (const [styleId, sp] of Object.entries(spByStyleId)) {
    const characterName = styleIdToCharacterName.get(String(styleId));
    const numericSp = Number(sp);
    if (!characterName || !Number.isFinite(numericSp)) {
      continue;
    }
    result[characterName] = numericSp;
  }

  return result;
}

/**
 * 保存JSON向けに人間可読の補助情報を付与する。
 * 読み込み処理は normalizeSessionSnapshot が既知フィールドのみを採用するため、
 * この関数が追加するフィールドは完全に無視される。
 */
export function decorateSessionSnapshotForHumans(snapshot = {}, options = {}) {
  const normalized = normalizeSessionSnapshot(snapshot);
  const resolveStyleName = options.resolveStyleName ?? null;
  const resolveCharacterName = options.resolveCharacterName ?? null;
  const resolveSkillName = options.resolveSkillName ?? null;
  const getTurnStartSpByStyleId = options.getTurnStartSpByStyleId ?? (() => ({}));
  const getTurnPostSkillSpByStyleId = options.getTurnPostSkillSpByStyleId ?? (() => ({}));

  const decorated = structuredClone(normalized);
  decorated.setup.styleNames = buildResolvedNameList(decorated.setup.styleIds, resolveStyleName);
  decorated.setup.characterNames = buildResolvedNameList(decorated.setup.styleIds, resolveCharacterName);
  decorated.setup.supportStyleNames = buildResolvedNameList(
    decorated.setup.supportStyleIds,
    resolveStyleName
  );
  decorated.setup.supportCharacterNames = buildResolvedNameList(
    decorated.setup.supportStyleIds,
    resolveCharacterName
  );
  decorated.setup.skillNamesByPartyIndex = buildSkillNamesByPartyIndex(
    decorated.setup.skillSetsByPartyIndex,
    resolveSkillName
  );

  decorated.replayScript.setup.styleNames = buildResolvedNameList(
    decorated.replayScript.setup.styleIds,
    resolveStyleName
  );
  decorated.replayScript.setup.characterNames = buildResolvedNameList(
    decorated.replayScript.setup.styleIds,
    resolveCharacterName
  );
  decorated.replayScript.setup.supportStyleNamesByPartyIndex = buildIndexedResolvedNameMap(
    decorated.replayScript.setup.supportStyleIdsByPartyIndex,
    resolveStyleName
  );
  decorated.replayScript.setup.supportCharacterNamesByPartyIndex = buildIndexedResolvedNameMap(
    decorated.replayScript.setup.supportStyleIdsByPartyIndex,
    resolveCharacterName
  );
  decorated.replayScript.setup.skillNamesByPartyIndex = buildSkillNamesByPartyIndex(
    decorated.replayScript.setup.skillSetsByPartyIndex,
    resolveSkillName
  );

  decorated.replayScript.turns = decorated.replayScript.turns.map((turn, turnIndex) => {
    const spAtTurnStartByStyleId = normalizeSpMap(getTurnStartSpByStyleId(turnIndex));
    const spAtActionStartByStyleId = normalizeSpMap(getTurnPostSkillSpByStyleId(turnIndex));
    const spAtTurnStartByName = buildSpMapByCharacterName(
      spAtTurnStartByStyleId,
      decorated.replayScript.setup.styleIds,
      decorated.replayScript.setup.characterNames
    );
    const spAtActionStartByName = buildSpMapByCharacterName(
      spAtActionStartByStyleId,
      decorated.replayScript.setup.styleIds,
      decorated.replayScript.setup.characterNames
    );
    const slots = (Array.isArray(turn.slots) ? turn.slots : []).map((slot) => {
      const styleId = Number(slot?.styleId);
      const skillId = Number(slot?.skillId);
      const styleName = resolveOptionalName(resolveStyleName, styleId);
      const characterName = resolveOptionalName(resolveCharacterName, styleId);
      const skillName = resolveOptionalName(resolveSkillName, skillId);
      const key = Number.isFinite(styleId) ? String(styleId) : null;
      return {
        ...slot,
        styleName,
        characterName,
        skillName,
        spAtTurnStart: key ? (spAtTurnStartByStyleId[key] ?? null) : null,
        spAtActionStart: key ? (spAtActionStartByStyleId[key] ?? null) : null,
      };
    });
    return {
      ...turn,
      turn: turnIndex + 1,
      slots,
      info: {
        spAtTurnStartByStyleId,
        spAtActionStartByStyleId,
        spAtTurnStartByName,
        spAtActionStartByName,
      },
    };
  });

  return decorated;
}
