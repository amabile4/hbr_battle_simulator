import { clampEnemyCount, DEFAULT_ENEMY_COUNT } from '../../src/config/battle-defaults.js';
import { resolveShortCharacterName } from '../../src/domain/character-name.js';
import { REPLAY_TARGET_TYPES, normalizeReplayTarget } from '../../src/ui/lightweight-replay-script.js';
import {
  DEFAULT_SIMULATOR_SETTINGS,
  isAllyTargetSelectionManual,
  isEnemyTargetSelectionManual,
} from './simulator-settings.js';

const ALLY_SINGLE_TARGET_TYPES = new Set(['AllySingle', 'AllySingleWithoutSelf']);
const ENEMY_ALL_TARGET_TYPES = new Set(['All', 'EnemyAll']);
const ENEMY_SINGLE_TARGET_TYPES = new Set(['Single', 'EnemySingle']);
const TARGET_CONDITION_FRONT_ONLY = 'IsFront()==1';
const TARGET_CONDITION_BACK_ONLY = 'IsFront()==0';
const FRONTLINE_LAST_POSITION = 2;

export const TURN_BREAK_ATTRIBUTION_MODES = Object.freeze({
  NONE: 'none',
  SINGLE: 'single',
  ALL: 'all',
});

function normalizeTargetCondition(targetCondition) {
  return String(targetCondition ?? '').replace(/\s+/g, '');
}

function buildEnemyCandidates(enemyCount) {
  const normalizedEnemyCount = clampEnemyCount(enemyCount);
  return Array.from({ length: normalizedEnemyCount }, (_, enemyIndex) => ({
    enemyIndex,
    disabled: false,
  }));
}

function buildAllyCandidates(state, actorMember, targetType, targetCondition) {
  const members = Array.isArray(state?.party) ? state.party.slice().sort((a, b) => a.position - b.position) : [];
  return members.map((member) => {
    let disabled = false;
    if (targetType === 'AllySingleWithoutSelf' && member.characterId === actorMember.characterId) {
      disabled = true;
    }
    if (targetCondition === TARGET_CONDITION_FRONT_ONLY && member.position > FRONTLINE_LAST_POSITION) {
      disabled = true;
    }
    if (targetCondition === TARGET_CONDITION_BACK_ONLY && member.position <= FRONTLINE_LAST_POSITION) {
      disabled = true;
    }
    return {
      partyIndex: Number(member.partyIndex),
      styleId: Number(member.styleId),
      characterId: String(member.characterId ?? ''),
      characterName: String(member.characterName ?? ''),
      position: Number(member.position),
      disabled,
    };
  });
}

function resolveEnemySingleTarget(parts, effectiveSkill) {
  return resolveTurnBreakAttributionMode({ parts, effectiveSkill }) === TURN_BREAK_ATTRIBUTION_MODES.SINGLE;
}

export function resolveTurnBreakAttributionMode({ skill = null, effectiveSkill = skill, parts = null } = {}) {
  const effectiveParts = Array.isArray(parts)
    ? parts
    : (Array.isArray(effectiveSkill?.parts) ? effectiveSkill.parts : []);
  const skillTargetType = String(
    effectiveSkill?.targetType ?? effectiveSkill?.target_type ?? skill?.targetType ?? skill?.target_type ?? ''
  ).trim();
  if (effectiveParts.length === 0) {
    if (ENEMY_ALL_TARGET_TYPES.has(skillTargetType)) {
      return TURN_BREAK_ATTRIBUTION_MODES.ALL;
    }
    if (ENEMY_SINGLE_TARGET_TYPES.has(skillTargetType)) {
      return TURN_BREAK_ATTRIBUTION_MODES.SINGLE;
    }
    return TURN_BREAK_ATTRIBUTION_MODES.NONE;
  }
  if (effectiveParts.some((part) =>
    ENEMY_ALL_TARGET_TYPES.has(String(part?.target_type ?? skillTargetType).trim())
  )) {
    return TURN_BREAK_ATTRIBUTION_MODES.ALL;
  }
  if (effectiveParts.some((part) =>
    ENEMY_SINGLE_TARGET_TYPES.has(String(part?.target_type ?? skillTargetType).trim())
  )) {
    return TURN_BREAK_ATTRIBUTION_MODES.SINGLE;
  }
  return TURN_BREAK_ATTRIBUTION_MODES.NONE;
}

export function resolveTurnTargetConfig({
  member,
  skill,
  effectiveSkill = skill,
  state,
  enemyCount = DEFAULT_ENEMY_COUNT,
} = {}) {
  if (!member || !effectiveSkill || !state) {
    return null;
  }
  const effectiveParts = Array.isArray(effectiveSkill?.parts) ? effectiveSkill.parts : [];
  const allyTargetPart = effectiveParts.find((part) =>
    ALLY_SINGLE_TARGET_TYPES.has(String(part?.target_type ?? '').trim())
  );
  if (allyTargetPart) {
    const targetType = String(allyTargetPart?.target_type ?? '').trim();
    const targetCondition = normalizeTargetCondition(allyTargetPart?.target_condition);
    const candidates = buildAllyCandidates(state, member, targetType, targetCondition);
    if (candidates.every((candidate) => candidate.disabled)) {
      return null;
    }
    return {
      kind: 'ally',
      targetType,
      targetCondition,
      candidates,
    };
  }
  if (!resolveEnemySingleTarget(effectiveParts, effectiveSkill)) {
    return null;
  }
  return {
    kind: 'enemy',
    targetType: 'Single',
    candidates: buildEnemyCandidates(enemyCount),
  };
}

function findTargetCandidate(config, target) {
  if (!config || !target || typeof target !== 'object') {
    return null;
  }
  if (config.kind === 'enemy') {
    const enemyIndex = Number(target.enemyIndex);
    return config.candidates.find((candidate) => candidate.enemyIndex === enemyIndex) ?? null;
  }
  const styleId = Number(target.styleId);
  if (Number.isFinite(styleId)) {
    return config.candidates.find((candidate) => Number(candidate.styleId) === styleId) ?? null;
  }
  const characterId = String(target.characterId ?? '').trim();
  if (!characterId) {
    return null;
  }
  return config.candidates.find((candidate) => String(candidate.characterId) === characterId) ?? null;
}

function findFirstEnabledCandidate(config) {
  return config?.candidates?.find((candidate) => candidate.disabled !== true) ?? null;
}

function resolveAllyTargetLabel(candidate, options = {}) {
  if (!candidate || typeof candidate !== 'object') {
    return '';
  }
  const characterId = String(candidate.characterId ?? '').trim();
  const rawCharacter =
    characterId && typeof options.store?.getCharacterByLabel === 'function'
      ? options.store.getCharacterByLabel(characterId)
      : null;
  if (rawCharacter?.name) {
    return resolveShortCharacterName(String(rawCharacter.name).trim(), characterId);
  }
  if (candidate.shortName) {
    return String(candidate.shortName).trim();
  }
  return resolveShortCharacterName(String(candidate.characterName ?? characterId).trim(), characterId);
}

function hasExplicitTargetForConfig(config, target) {
  const normalizedTarget = normalizeTurnReplayTarget(target);
  if (config?.kind === 'enemy') {
    return normalizedTarget.type === REPLAY_TARGET_TYPES.ENEMY;
  }
  if (config?.kind === 'ally') {
    return normalizedTarget.type === REPLAY_TARGET_TYPES.ALLY;
  }
  return false;
}

export function normalizeTurnReplayTarget(target) {
  return normalizeReplayTarget(target) ?? { type: REPLAY_TARGET_TYPES.NONE };
}

export function areTurnReplayTargetsEqual(left, right) {
  const normalizedLeft = normalizeTurnReplayTarget(left);
  const normalizedRight = normalizeTurnReplayTarget(right);
  if (normalizedLeft.type !== normalizedRight.type) {
    return false;
  }
  if (normalizedLeft.type === REPLAY_TARGET_TYPES.ENEMY) {
    return Number(normalizedLeft.enemyIndex) === Number(normalizedRight.enemyIndex);
  }
  if (normalizedLeft.type === REPLAY_TARGET_TYPES.ALLY) {
    return (
      Number(normalizedLeft.styleId) === Number(normalizedRight.styleId) &&
      String(normalizedLeft.characterId ?? '') === String(normalizedRight.characterId ?? '')
    );
  }
  return true;
}

export function resolveTurnManualTargetConfig({
  member,
  skill,
  effectiveSkill = skill,
  state,
  enemyCount = DEFAULT_ENEMY_COUNT,
  simulatorSettings = DEFAULT_SIMULATOR_SETTINGS,
  explicitTarget = null,
  preserveExplicitTarget = false,
} = {}) {
  const config = resolveTurnTargetConfig({
    member,
    skill,
    effectiveSkill,
    state,
    enemyCount,
  });
  if (!config) {
    return null;
  }

  const manualEnabled = config.kind === 'enemy'
    ? clampEnemyCount(enemyCount) > DEFAULT_ENEMY_COUNT && isEnemyTargetSelectionManual(simulatorSettings)
    : isAllyTargetSelectionManual(simulatorSettings);
  if (manualEnabled) {
    return config;
  }
  if (preserveExplicitTarget && hasExplicitTargetForConfig(config, explicitTarget)) {
    return config;
  }
  return null;
}

export function coerceTurnReplayTarget(config, target) {
  const normalizedTarget = normalizeTurnReplayTarget(target);
  if (!config) {
    return { type: REPLAY_TARGET_TYPES.NONE };
  }

  const candidate = findTargetCandidate(config, normalizedTarget);
  if (candidate && candidate.disabled !== true) {
    if (config.kind === 'enemy') {
      return {
        type: REPLAY_TARGET_TYPES.ENEMY,
        enemyIndex: Number(candidate.enemyIndex),
      };
    }
    return {
      type: REPLAY_TARGET_TYPES.ALLY,
      styleId: Number(candidate.styleId),
    };
  }

  const fallback = findFirstEnabledCandidate(config);
  if (!fallback) {
    return { type: REPLAY_TARGET_TYPES.NONE };
  }
  if (config.kind === 'enemy') {
    return {
      type: REPLAY_TARGET_TYPES.ENEMY,
      enemyIndex: Number(fallback.enemyIndex),
    };
  }
  return {
    type: REPLAY_TARGET_TYPES.ALLY,
    styleId: Number(fallback.styleId),
  };
}

export function formatTurnTargetLabel(config, target, options = {}) {
  if (!config) {
    return '';
  }

  const normalizedTarget = coerceTurnReplayTarget(config, target);
  if (config.kind === 'enemy') {
    const enemyIndex = Number(normalizedTarget.enemyIndex);
    if (!Number.isFinite(enemyIndex) || enemyIndex < 0) {
      return '敵を選択';
    }
    const enemyNamesByEnemy =
      options.enemyNamesByEnemy && typeof options.enemyNamesByEnemy === 'object'
        ? options.enemyNamesByEnemy
        : {};
    const rawName = String(
      enemyNamesByEnemy[String(enemyIndex)] ?? enemyNamesByEnemy[enemyIndex] ?? ''
    ).trim();
    return rawName ? `E${enemyIndex + 1} ${rawName}` : `E${enemyIndex + 1}`;
  }

  const candidate = findTargetCandidate(config, normalizedTarget);
  if (!candidate) {
    if (
      normalizedTarget.type === REPLAY_TARGET_TYPES.ALLY &&
      typeof options.store?.getCharacterByLabel === 'function'
    ) {
      const fallbackLabel = resolveAllyTargetLabel(
        {
          characterId: normalizedTarget.characterId,
          characterName: '',
        },
        options
      );
      if (fallbackLabel) {
        return fallbackLabel;
      }
    }
    return '味方を選択';
  }
  return resolveAllyTargetLabel(candidate, options);
}
