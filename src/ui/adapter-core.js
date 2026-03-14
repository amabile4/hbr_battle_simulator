import {
  createBattleStateFromParty,
  previewTurn,
  commitTurn,
  applyInitialPassiveState,
} from '../turn/turn-controller.js';
import { createBattleRecordStore, RecordEditor, CsvExporter, JsonExporter } from '../records/record-store.js';
import { createInitialTurnState } from '../contracts/interfaces.js';
import { DEFAULT_MARK_LEVEL_MAX, MARK_STATE_ELEMENTS } from '../config/battle-defaults.js';
import { normalizeStatusEffect, SPECIAL_STATUS_TYPE_NAMES } from '../domain/character-style.js';

const DEFAULT_STATE_MIN = 0;
const DEFAULT_TOKEN_STATE_MAX = 10;
const DEFAULT_MORALE_STATE_MAX = 10;
const DEFAULT_MOTIVATION_STATE_MAX = 5;
const DEFAULT_MANUAL_STATUS_EXIT_COND = 'PlayerTurnEnd';
const SPECIAL_STATUS_TYPE_IDS_BY_NAME = Object.freeze(
  Object.fromEntries(
    Object.entries(SPECIAL_STATUS_TYPE_NAMES).map(([typeId, statusType]) => [String(statusType), Number(typeId)])
  )
);

function canSwapByExtraState(a, b, hasAnyExtra = false) {
  if (hasAnyExtra) {
    return Boolean(a?.isExtraActive) && Boolean(b?.isExtraActive);
  }
  return true;
}

function getPartyMembers(party) {
  if (Array.isArray(party)) {
    return party;
  }
  return Array.isArray(party?.members) ? party.members : [];
}

function normalizeBoundedState(rawState, fallbackState, fallbackMax) {
  const state = rawState && typeof rawState === 'object' ? rawState : {};
  const fallback = fallbackState && typeof fallbackState === 'object' ? fallbackState : {};
  const min = Number.isFinite(Number(state.min))
    ? Number(state.min)
    : Number.isFinite(Number(fallback.min))
      ? Number(fallback.min)
      : DEFAULT_STATE_MIN;
  const max = Number.isFinite(Number(state.max))
    ? Number(state.max)
    : Number.isFinite(Number(fallback.max))
      ? Number(fallback.max)
      : fallbackMax;
  const currentRaw = Number.isFinite(Number(state.current))
    ? Number(state.current)
    : Number.isFinite(Number(fallback.current))
      ? Number(fallback.current)
      : min;
  return {
    current: Math.max(min, Math.min(max, currentRaw)),
    min,
    max,
  };
}

function normalizeMarkStates(rawMarkStates, fallbackMarkStates) {
  const source = rawMarkStates && typeof rawMarkStates === 'object' ? rawMarkStates : {};
  const fallback = fallbackMarkStates && typeof fallbackMarkStates === 'object' ? fallbackMarkStates : {};
  return Object.fromEntries(
    MARK_STATE_ELEMENTS.map((element) => [
      element,
      normalizeBoundedState(source[element], fallback[element], DEFAULT_MARK_LEVEL_MAX),
    ])
  );
}

function normalizeEnemyStatusForSnapshot(status, enemyCount = 1) {
  if (!status || typeof status !== 'object') {
    return null;
  }
  const statusType = String(status?.statusType ?? status?.skill_type ?? '').trim();
  if (!statusType) {
    return null;
  }
  const normalizedEnemyCount = Math.max(1, Number(enemyCount ?? 1));
  const targetRaw = status?.targetIndex ?? status?.target ?? 0;
  const targetIndex = Math.max(
    0,
    Math.min(
      normalizedEnemyCount - 1,
      Number.isFinite(Number(targetRaw)) ? Number(targetRaw) : 0
    )
  );
  const normalized = {
    statusType,
    targetIndex,
    remainingTurns: Number(status?.remainingTurns ?? status?.remaining ?? 0),
  };
  const powerRaw = Array.isArray(status?.power) ? status.power[0] : status?.power;
  if (Number.isFinite(Number(powerRaw))) {
    normalized.power = Number(powerRaw);
  }
  if (Array.isArray(status?.elements)) {
    normalized.elements = [...new Set(status.elements.map((value) => String(value ?? '').trim()).filter(Boolean))];
  }
  const limitType = String(status?.limitType ?? '').trim();
  if (limitType) {
    normalized.limitType = limitType;
  }
  const exitCond = String(status?.exitCond ?? '').trim();
  if (exitCond) {
    normalized.exitCond = exitCond;
  }
  if (Number.isFinite(Number(status?.sourceSkillId))) {
    normalized.sourceSkillId = Number(status.sourceSkillId);
  }
  const sourceSkillName = String(status?.sourceSkillName ?? '').trim();
  if (sourceSkillName) {
    normalized.sourceSkillName = sourceSkillName;
  }
  const sourceSkillLabel = String(status?.sourceSkillLabel ?? '').trim();
  if (sourceSkillLabel) {
    normalized.sourceSkillLabel = sourceSkillLabel;
  }
  if (status?.metadata && typeof status.metadata === 'object') {
    normalized.metadata = structuredClone(status.metadata);
  }
  return normalized;
}

function isActiveStatusEffectForSnapshot(effect) {
  if (String(effect?.exitCond ?? '') === 'Eternal') {
    return true;
  }
  return Number(effect?.remaining ?? 0) > 0;
}

function normalizePlayerStatusEffectForSnapshot(effect, fallbackId = 1) {
  if (!effect || typeof effect !== 'object') {
    return null;
  }

  const hasStatusType =
    effect.statusType !== undefined ||
    effect.type !== undefined ||
    effect.skillType !== undefined ||
    effect.skill_type !== undefined;
  const explicitTypeId = Number(effect.specialStatusTypeId ?? effect.statusTypeId ?? effect.typeId);
  const rawStatusType = String(
    effect.statusType ?? effect.type ?? effect.skillType ?? effect.skill_type ?? ''
  ).trim();
  const inferredTypeId = SPECIAL_STATUS_TYPE_IDS_BY_NAME[rawStatusType];
  const shorthandTypeId = Number.isFinite(explicitTypeId) ? explicitTypeId : inferredTypeId;

  if (!hasStatusType && !Number.isFinite(shorthandTypeId)) {
    return null;
  }

  if (!hasStatusType) {
    const exitCond =
      String(effect.exitCond ?? DEFAULT_MANUAL_STATUS_EXIT_COND).trim() || DEFAULT_MANUAL_STATUS_EXIT_COND;
    const remaining =
      effect.remaining ??
      effect.remainingTurns ??
      effect.duration ??
      (exitCond === 'Eternal' ? 0 : 1);
    const metadata =
      effect.metadata && typeof effect.metadata === 'object' ? structuredClone(effect.metadata) : {};
    metadata.specialStatusTypeId = shorthandTypeId;
    return normalizeStatusEffect(
      {
        effectId: effect.effectId ?? effect.id ?? fallbackId,
        statusType: SPECIAL_STATUS_TYPE_NAMES[shorthandTypeId] ?? `SpecialStatus_${shorthandTypeId}`,
        limitType: String(effect.limitType ?? 'Default'),
        exitCond,
        remaining,
        power: Array.isArray(effect.power) ? effect.power[0] : effect.power ?? 0,
        elements: Array.isArray(effect.elements) ? effect.elements : [],
        sourceType: String(effect.sourceType ?? 'manual'),
        sourceSkillId: effect.sourceSkillId ?? null,
        sourceSkillLabel: String(effect.sourceSkillLabel ?? ''),
        sourceSkillName: String(effect.sourceSkillName ?? ''),
        metadata,
      },
      fallbackId
    );
  }

  const metadata =
    effect.metadata && typeof effect.metadata === 'object' ? structuredClone(effect.metadata) : {};
  if (Number.isFinite(shorthandTypeId) && metadata.specialStatusTypeId == null) {
    metadata.specialStatusTypeId = shorthandTypeId;
  }
  return normalizeStatusEffect(
    {
      ...effect,
      sourceType: String(effect.sourceType ?? 'manual'),
      metadata,
    },
    fallbackId
  );
}

export function normalizeStatusEffectsByPartyIndex(statusEffectsByPartyIndex = {}) {
  if (!statusEffectsByPartyIndex || typeof statusEffectsByPartyIndex !== 'object') {
    return {};
  }
  const out = {};
  for (const [partyIndex, effects] of Object.entries(statusEffectsByPartyIndex)) {
    if (!Number.isFinite(Number(partyIndex)) || !Array.isArray(effects)) {
      continue;
    }
    out[String(Number(partyIndex))] = effects
      .map((effect, idx) => normalizePlayerStatusEffectForSnapshot(effect, idx + 1))
      .filter(
        (effect) =>
          effect &&
          String(effect.statusType ?? '').trim().length > 0 &&
          isActiveStatusEffectForSnapshot(effect)
      );
  }
  return out;
}

export function replaceStatusEffectsByPartyIndex(party, statusEffectsByPartyIndex = {}) {
  const members = getPartyMembers(party);
  const normalized = normalizeStatusEffectsByPartyIndex(statusEffectsByPartyIndex);
  for (const [partyIndex, effects] of Object.entries(normalized)) {
    const member = members.find((item) => String(item.partyIndex) === String(partyIndex));
    if (!member) {
      continue;
    }
    member.statusEffects = effects.map((effect) => structuredClone(effect));
    member._nextStatusEffectId =
      member.statusEffects.reduce((max, effect) => Math.max(max, Number(effect?.effectId ?? 0)), 0) + 1;
    member._revision += 1;
  }
}

function applyInitialPartyStateOverrides(
  party,
  {
    tokenStateByPartyIndex = {},
    moraleStateByPartyIndex = {},
    motivationStateByPartyIndex = {},
    markStateByPartyIndex = {},
    statusEffectsByPartyIndex = {},
  } = {}
) {
  const members = getPartyMembers(party);
  for (const member of members) {
    const key = String(member.partyIndex);
    if (tokenStateByPartyIndex[key] && typeof tokenStateByPartyIndex[key] === 'object') {
      member.tokenState = normalizeBoundedState(
        tokenStateByPartyIndex[key],
        member.tokenState,
        DEFAULT_TOKEN_STATE_MAX
      );
    }
    if (moraleStateByPartyIndex[key] && typeof moraleStateByPartyIndex[key] === 'object') {
      member.moraleState = normalizeBoundedState(
        moraleStateByPartyIndex[key],
        member.moraleState,
        DEFAULT_MORALE_STATE_MAX
      );
    }
    if (motivationStateByPartyIndex[key] && typeof motivationStateByPartyIndex[key] === 'object') {
      member.motivationState = normalizeBoundedState(
        motivationStateByPartyIndex[key],
        member.motivationState,
        DEFAULT_MOTIVATION_STATE_MAX
      );
    }
    if (markStateByPartyIndex[key] && typeof markStateByPartyIndex[key] === 'object') {
      member.markStates = normalizeMarkStates(markStateByPartyIndex[key], member.markStates);
    }
  }
  replaceStatusEffectsByPartyIndex(party, statusEffectsByPartyIndex);
}

export function createInitializedBattleSnapshot({
  dataStore,
  initialSP,
  styleIds,
  skillSetsByPartyIndex,
  limitBreakLevelsByPartyIndex,
  drivePierceByPartyIndex,
  normalAttackElementsByPartyIndex,
  startSpEquipByPartyIndex,
  initialMotivationByPartyIndex = {},
  initialDpStateByPartyIndex = {},
  initialBreakByPartyIndex = {},
  tokenStateByPartyIndex = {},
  moraleStateByPartyIndex = {},
  motivationStateByPartyIndex = {},
  markStateByPartyIndex = {},
  statusEffectsByPartyIndex = {},
  supportStyleIdsByPartyIndex = {},
  supportLimitBreakLevelsByPartyIndex = {},
  initialOdGauge,
  enemyCount,
  enemyNamesByEnemy = {},
  damageRatesByEnemy = {},
  destructionRateByEnemy = {},
  destructionRateCapByEnemy = {},
  enemyStatuses = [],
  breakStateByEnemy = {},
  enemyZoneConfigByEnemy = {},
  zoneState = null,
  territoryState = null,
}) {
  const baseTurnState = createInitialTurnState();
  const initialSpByPartyIndex = Object.fromEntries(
    Object.entries(startSpEquipByPartyIndex).map(([index, bonus]) => [
      Number(index),
      Number(initialSP) + Number(bonus ?? 0),
    ])
  );

  const party = dataStore.buildPartyFromStyleIds(styleIds, {
    initialSP,
    initialSpByPartyIndex,
    initialMotivationByPartyIndex,
    initialDpStateByPartyIndex,
    initialBreakByPartyIndex,
    skillSetsByPartyIndex,
    limitBreakLevelsByPartyIndex,
    drivePierceByPartyIndex,
    normalAttackElementsByPartyIndex,
    supportStyleIdsByPartyIndex,
    supportLimitBreakLevelsByPartyIndex,
  });
  applyInitialPartyStateOverrides(party, {
    tokenStateByPartyIndex,
    moraleStateByPartyIndex,
    motivationStateByPartyIndex,
    markStateByPartyIndex,
    statusEffectsByPartyIndex,
  });

  const initialTurnState = {
    ...baseTurnState,
    odGauge: Number(initialOdGauge),
    enemyState: {
      enemyCount: Number(enemyCount),
      statuses: Array.isArray(enemyStatuses)
        ? enemyStatuses
            .map((status) => normalizeEnemyStatusForSnapshot(status, enemyCount))
            .filter(Boolean)
        : [],
      damageRatesByEnemy:
        damageRatesByEnemy && typeof damageRatesByEnemy === 'object' ? structuredClone(damageRatesByEnemy) : {},
      destructionRateByEnemy:
        destructionRateByEnemy && typeof destructionRateByEnemy === 'object'
          ? structuredClone(destructionRateByEnemy)
          : {},
      destructionRateCapByEnemy:
        destructionRateCapByEnemy && typeof destructionRateCapByEnemy === 'object'
          ? structuredClone(destructionRateCapByEnemy)
          : {},
      breakStateByEnemy:
        breakStateByEnemy && typeof breakStateByEnemy === 'object' ? structuredClone(breakStateByEnemy) : {},
      enemyNamesByEnemy:
        enemyNamesByEnemy && typeof enemyNamesByEnemy === 'object' ? structuredClone(enemyNamesByEnemy) : {},
      zoneConfigByEnemy:
        enemyZoneConfigByEnemy && typeof enemyZoneConfigByEnemy === 'object'
          ? structuredClone(enemyZoneConfigByEnemy)
          : {},
      talismanState: structuredClone(baseTurnState.enemyState?.talismanState ?? { active: false, level: 0, maxLevel: 10 }),
    },
    zoneState: zoneState && typeof zoneState === 'object' ? structuredClone(zoneState) : null,
    territoryState: territoryState && typeof territoryState === 'object' ? structuredClone(territoryState) : null,
  };

  const state = createBattleStateFromParty(party, initialTurnState);
  applyInitialPassiveState(state);

  return {
    party,
    state,
    turnPlanBaseSetup: {
      styleIds: [...styleIds].map((id) => Number(id)),
      skillSetsByPartyIndex: structuredClone(skillSetsByPartyIndex),
      limitBreakLevelsByPartyIndex: structuredClone(limitBreakLevelsByPartyIndex),
      drivePierceByPartyIndex: structuredClone(drivePierceByPartyIndex),
      normalAttackElementsByPartyIndex: structuredClone(normalAttackElementsByPartyIndex),
      startSpEquipByPartyIndex: structuredClone(startSpEquipByPartyIndex),
      initialMotivationByPartyIndex: structuredClone(initialMotivationByPartyIndex),
      initialDpStateByPartyIndex: structuredClone(initialDpStateByPartyIndex),
      initialBreakByPartyIndex: structuredClone(initialBreakByPartyIndex),
      tokenStateByPartyIndex: structuredClone(tokenStateByPartyIndex),
      moraleStateByPartyIndex: structuredClone(moraleStateByPartyIndex),
      motivationStateByPartyIndex: structuredClone(motivationStateByPartyIndex),
      markStateByPartyIndex: structuredClone(markStateByPartyIndex),
      statusEffectsByPartyIndex: structuredClone(normalizeStatusEffectsByPartyIndex(statusEffectsByPartyIndex)),
      initialOdGauge: Number(initialOdGauge),
      enemyCount: Number(enemyCount),
      enemyNamesByEnemy:
        enemyNamesByEnemy && typeof enemyNamesByEnemy === 'object' ? structuredClone(enemyNamesByEnemy) : {},
      damageRatesByEnemy:
        damageRatesByEnemy && typeof damageRatesByEnemy === 'object' ? structuredClone(damageRatesByEnemy) : {},
      destructionRateByEnemy:
        destructionRateByEnemy && typeof destructionRateByEnemy === 'object'
          ? structuredClone(destructionRateByEnemy)
          : {},
      destructionRateCapByEnemy:
        destructionRateCapByEnemy && typeof destructionRateCapByEnemy === 'object'
          ? structuredClone(destructionRateCapByEnemy)
          : {},
      enemyStatuses: Array.isArray(enemyStatuses)
        ? enemyStatuses
            .map((status) => normalizeEnemyStatusForSnapshot(status, enemyCount))
            .filter(Boolean)
        : [],
      breakStateByEnemy:
        breakStateByEnemy && typeof breakStateByEnemy === 'object' ? structuredClone(breakStateByEnemy) : {},
      enemyZoneConfigByEnemy:
        enemyZoneConfigByEnemy && typeof enemyZoneConfigByEnemy === 'object'
          ? structuredClone(enemyZoneConfigByEnemy)
          : {},
      zoneState: zoneState && typeof zoneState === 'object' ? structuredClone(zoneState) : null,
      territoryState: territoryState && typeof territoryState === 'object' ? structuredClone(territoryState) : null,
    },
  };
}

export function queueSwapState(state, pendingSwapEvents, fromPositionIndex, toPositionIndex) {
  if (!state) {
    throw new Error('State is not initialized.');
  }
  if (fromPositionIndex === toPositionIndex) {
    return { event: null, skippedSamePosition: true };
  }

  const outMember = state.party.find((member) => member.position === fromPositionIndex);
  const inMember = state.party.find((member) => member.position === toPositionIndex);
  if (!outMember || !inMember) {
    throw new Error('Swap target position not found.');
  }

  const hasAnyExtra = state.party.some((m) => m.isExtraActive);
  if (!canSwapByExtraState(outMember, inMember, hasAnyExtra)) {
    throw new Error('Swap is allowed only between [EX]<->[EX] during an Extra Turn.');
  }

  const event = {
    swapSequence: pendingSwapEvents.length + 1,
    fromPositionIndex,
    toPositionIndex,
    outCharacterId: outMember.characterId,
    outCharacterName: outMember.characterName,
    inCharacterId: inMember.characterId,
    inCharacterName: inMember.characterName,
  };

  const fromPos = outMember.position;
  const toPos = inMember.position;
  outMember.setPosition(toPos);
  inMember.setPosition(fromPos);
  pendingSwapEvents.push(event);

  return {
    event,
    outMember,
    inMember,
    skippedSamePosition: false,
  };
}

export function previewTurnRecord(state, actions, enemyAction, enemyCount, options = {}) {
  return previewTurn(state, actions, enemyAction, enemyCount, options);
}

export function commitTurnRecord(state, previewRecord, pendingSwapEvents, options = {}) {
  return commitTurn(state, previewRecord, pendingSwapEvents, {
    applySwapOnCommit: false,
    interruptOdLevel: Number(options.interruptOdLevel ?? 0),
    forceOdActivation: Boolean(options.forceOdActivation ?? false),
    forceResourceDeficit: Boolean(options.forceResourceDeficit ?? false),
    enemyAttackTargetCharacterIds: Array.isArray(options.enemyAttackTargetCharacterIds)
      ? structuredClone(options.enemyAttackTargetCharacterIds)
      : [],
  });
}

export function appendCommittedRecord(recordStore, committedRecord) {
  return RecordEditor.upsertRecord(recordStore, committedRecord);
}

export function resetRecordStore() {
  return createBattleRecordStore();
}

export function exportCsvText(recordStore, initialParty) {
  return CsvExporter.exportToCSV(recordStore, initialParty);
}

export function exportRecordsJsonText(recordStore) {
  return JsonExporter.exportToJSON(recordStore);
}
