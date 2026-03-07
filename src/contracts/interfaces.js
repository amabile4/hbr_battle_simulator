import { DEFAULT_ENEMY_COUNT } from '../config/battle-defaults.js';

export const TURN_TYPES = Object.freeze(['normal', 'od', 'extra']);
export const OD_CONTEXTS = Object.freeze(['preemptive', 'interrupt', null]);
export const RECORD_STATUSES = Object.freeze(['preview', 'committed']);

export function buildPositionMap(partyMembers) {
  if (!Array.isArray(partyMembers) || partyMembers.length !== 6) {
    throw new Error('buildPositionMap requires 6 party members.');
  }

  const map = new Array(6).fill(-1);
  partyMembers.forEach((member, partyIdx) => {
    const pos = Number(member.position);
    if (pos < 0 || pos > 5 || map[pos] !== -1) {
      throw new Error(`Invalid party position mapping at position ${pos}.`);
    }
    map[pos] = partyIdx;
  });

  return Object.freeze(map);
}

export function toCharacterSnapshot(character) {
  return Object.freeze({
    characterId: character.characterId,
    characterName: character.characterName,
    partyIndex: character.partyIndex,
    positionIndex: character.position,
    isFront: character.position <= 2,
    normalAttackElements: Object.freeze([...(character.normalAttackElements ?? [])]),
    sp: Object.freeze({ ...character.sp }),
    ep: Object.freeze({ ...character.ep }),
    tokenState: Object.freeze({ ...(character.tokenState ?? { current: 0, min: 0, max: 10 }) }),
    moraleState: Object.freeze({ ...(character.moraleState ?? { current: 0, min: 0, max: 10 }) }),
    isAlive: Boolean(character.isAlive),
    isBreak: Boolean(character.isBreak),
    isExtraActive: Boolean(character.isExtraActive),
    isReinforcedMode: Boolean(character.isReinforcedMode),
    reinforcedTurnsRemaining: Number(character.reinforcedTurnsRemaining ?? 0),
    actionDisabledTurns: Number(character.actionDisabledTurns ?? 0),
    revision: Number(character.revision ?? 0),
  });
}

export function snapshotPartyByPartyIndex(partyMembers) {
  return [...partyMembers]
    .sort((a, b) => a.partyIndex - b.partyIndex)
    .map((member) => toCharacterSnapshot(member));
}

export function createInitialTurnState() {
  return Object.freeze({
    turnIndex: 1,
    sequenceId: 1,
    turnType: 'normal',
    turnLabel: 'T1',
    odGauge: 0,
    odLevel: 0,
    remainingOdActions: 0,
    odContext: null,
    odSuspended: false,
    odPending: false,
    enemyState: {
      enemyCount: DEFAULT_ENEMY_COUNT,
      statuses: [],
      damageRatesByEnemy: {},
      enemyNamesByEnemy: {},
      zoneConfigByEnemy: {},
    },
    zoneState: null,
    territoryState: null,
    transcendence: null,
    extraTurnState: null,
    passiveEventsLastApplied: [],
  });
}

export function cloneTurnState(turnState) {
  const enemyState =
    turnState?.enemyState && typeof turnState.enemyState === 'object'
      ? {
          enemyCount: Number(turnState.enemyState.enemyCount ?? 1),
          statuses: Array.isArray(turnState.enemyState.statuses)
            ? turnState.enemyState.statuses.map((status) => ({
                statusType: String(status?.statusType ?? ''),
                targetIndex: Number(status?.targetIndex ?? 0),
                remainingTurns: Number(status?.remainingTurns ?? 0),
              }))
            : [],
          damageRatesByEnemy:
            turnState.enemyState.damageRatesByEnemy &&
            typeof turnState.enemyState.damageRatesByEnemy === 'object'
              ? Object.fromEntries(
                  Object.entries(turnState.enemyState.damageRatesByEnemy).map(([targetIndex, rates]) => [
                    String(targetIndex),
                    rates && typeof rates === 'object' ? { ...rates } : {},
                  ])
                )
              : {},
          enemyNamesByEnemy:
            turnState.enemyState.enemyNamesByEnemy &&
            typeof turnState.enemyState.enemyNamesByEnemy === 'object'
              ? Object.fromEntries(
                  Object.entries(turnState.enemyState.enemyNamesByEnemy).map(([targetIndex, name]) => [
                    String(targetIndex),
                    String(name ?? ''),
                  ])
                )
              : {},
          zoneConfigByEnemy:
            turnState.enemyState.zoneConfigByEnemy &&
            typeof turnState.enemyState.zoneConfigByEnemy === 'object'
              ? Object.fromEntries(
                  Object.entries(turnState.enemyState.zoneConfigByEnemy).map(([targetIndex, config]) => [
                    String(targetIndex),
                    config && typeof config === 'object'
                      ? {
                          enabled: Boolean(config.enabled),
                          type: String(config.type ?? ''),
                          remainingTurns:
                            config.remainingTurns === null || config.remainingTurns === undefined
                              ? null
                              : Number(config.remainingTurns ?? 0),
                        }
                      : { enabled: false, type: '', remainingTurns: 8 },
                  ])
                )
              : {},
        }
      : {
          enemyCount: DEFAULT_ENEMY_COUNT,
          statuses: [],
          damageRatesByEnemy: {},
          enemyNamesByEnemy: {},
          zoneConfigByEnemy: {},
        };
  const zoneState =
    turnState?.zoneState && typeof turnState.zoneState === 'object'
      ? {
          type: String(turnState.zoneState.type ?? ''),
          sourceSide: String(turnState.zoneState.sourceSide ?? ''),
          remainingTurns:
            turnState.zoneState.remainingTurns === null || turnState.zoneState.remainingTurns === undefined
              ? null
              : Number(turnState.zoneState.remainingTurns ?? 0),
          ...(Number.isFinite(Number(turnState.zoneState.powerRate))
            ? { powerRate: Number(turnState.zoneState.powerRate) }
            : {}),
        }
      : null;
  const territoryState =
    turnState?.territoryState && typeof turnState.territoryState === 'object'
      ? {
          type: String(turnState.territoryState.type ?? ''),
          sourceSide: String(turnState.territoryState.sourceSide ?? ''),
          remainingTurns:
            turnState.territoryState.remainingTurns === null || turnState.territoryState.remainingTurns === undefined
              ? null
              : Number(turnState.territoryState.remainingTurns ?? 0),
          ...(Number.isFinite(Number(turnState.territoryState.powerRate))
            ? { powerRate: Number(turnState.territoryState.powerRate) }
            : {}),
        }
      : null;
  return {
    ...turnState,
    enemyState,
    zoneState,
    territoryState,
    transcendence: turnState.transcendence
      ? {
          ...turnState.transcendence,
        }
      : null,
    extraTurnState: turnState.extraTurnState
      ? {
          ...turnState.extraTurnState,
          allowedCharacterIds: [...turnState.extraTurnState.allowedCharacterIds],
        }
      : null,
    passiveEventsLastApplied: Array.isArray(turnState?.passiveEventsLastApplied)
      ? turnState.passiveEventsLastApplied.map((event) => ({ ...event }))
      : [],
  };
}

export function createBattleState(partyMembers, turnState = createInitialTurnState()) {
  if (!Array.isArray(partyMembers) || partyMembers.length !== 6) {
    throw new Error('createBattleState requires exactly 6 party members.');
  }

  const initialParty = snapshotPartyByPartyIndex(partyMembers);

  return {
    party: [...partyMembers],
    turnState: cloneTurnState(turnState),
    positionMap: buildPositionMap(partyMembers),
    initialParty,
  };
}
