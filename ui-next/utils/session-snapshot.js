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
