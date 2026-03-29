import { normalizeLightweightReplayScript } from '../../src/ui/lightweight-replay-script.js';
import { normalizeSimulatorSettings } from './simulator-settings.js';
import { normalizeValidationPolicy } from './validation-policy.js';

export const SESSION_SNAPSHOT_VERSION = 1;
const PARTY_SIZE = 6;

function toOptionalNumber(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
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
    toOptionalNumber(snapshot?.styleIds?.[index])
  );
  const supportStyleIds = Array.from({ length: PARTY_SIZE }, (_, index) =>
    toOptionalNumber(snapshot?.supportStyleIds?.[index])
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

function buildIndexedStyleNameMap(indexedStyleIds = {}, resolveStyleName = null) {
  const result = {};
  for (let index = 0; index < PARTY_SIZE; index += 1) {
    const key = String(index);
    const styleId = indexedStyleIds?.[key] ?? indexedStyleIds?.[index] ?? null;
    result[key] = resolveOptionalName(resolveStyleName, styleId);
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

/**
 * 保存JSON向けに人間可読の補助情報を付与する。
 * 読み込み処理は normalizeSessionSnapshot が既知フィールドのみを採用するため、
 * この関数が追加するフィールドは完全に無視される。
 */
export function decorateSessionSnapshotForHumans(snapshot = {}, options = {}) {
  const normalized = normalizeSessionSnapshot(snapshot);
  const resolveStyleName = options.resolveStyleName ?? null;
  const resolveSkillName = options.resolveSkillName ?? null;
  const getTurnStartSpByStyleId = options.getTurnStartSpByStyleId ?? (() => ({}));
  const getTurnActionSpByStyleId = options.getTurnActionSpByStyleId ?? (() => ({}));

  const decorated = structuredClone(normalized);
  decorated.setup.styleNames = decorated.setup.styleIds.map((styleId) =>
    resolveOptionalName(resolveStyleName, styleId)
  );
  decorated.setup.supportStyleNames = decorated.setup.supportStyleIds.map((styleId) =>
    resolveOptionalName(resolveStyleName, styleId)
  );
  decorated.setup.skillNamesByPartyIndex = buildSkillNamesByPartyIndex(
    decorated.setup.skillSetsByPartyIndex,
    resolveSkillName
  );

  decorated.replayScript.setup.styleNames = decorated.replayScript.setup.styleIds.map((styleId) =>
    resolveOptionalName(resolveStyleName, styleId)
  );
  decorated.replayScript.setup.supportStyleNamesByPartyIndex = buildIndexedStyleNameMap(
    decorated.replayScript.setup.supportStyleIdsByPartyIndex,
    resolveStyleName
  );
  decorated.replayScript.setup.skillNamesByPartyIndex = buildSkillNamesByPartyIndex(
    decorated.replayScript.setup.skillSetsByPartyIndex,
    resolveSkillName
  );

  decorated.replayScript.turns = decorated.replayScript.turns.map((turn, turnIndex) => {
    const spAtTurnStartByStyleId = normalizeSpMap(getTurnStartSpByStyleId(turnIndex));
    const spAtActionStartByStyleId = normalizeSpMap(getTurnActionSpByStyleId(turnIndex));
    const slots = (Array.isArray(turn.slots) ? turn.slots : []).map((slot) => {
      const styleId = Number(slot?.styleId);
      const skillId = Number(slot?.skillId);
      const styleName = resolveOptionalName(resolveStyleName, styleId);
      const skillName = resolveOptionalName(resolveSkillName, skillId);
      const key = Number.isFinite(styleId) ? String(styleId) : null;
      return {
        ...slot,
        styleName,
        skillName,
        spAtTurnStart: key ? (spAtTurnStartByStyleId[key] ?? null) : null,
        spAtActionStart: key ? (spAtActionStartByStyleId[key] ?? null) : null,
      };
    });
    return {
      ...turn,
      slots,
      info: {
        spAtTurnStartByStyleId,
        spAtActionStartByStyleId,
      },
    };
  });

  return decorated;
}
