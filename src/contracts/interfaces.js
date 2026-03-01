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
    sp: Object.freeze({ ...character.sp }),
    isAlive: Boolean(character.isAlive),
    isBreak: Boolean(character.isBreak),
    isExtraActive: Boolean(character.isExtraActive),
    isReinforcedMode: Boolean(character.isReinforcedMode),
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
    odLevel: 0,
    remainingOdActions: 0,
    odContext: null,
    odSuspended: false,
    odPending: false,
    extraTurnState: null,
  });
}

export function cloneTurnState(turnState) {
  return {
    ...turnState,
    extraTurnState: turnState.extraTurnState
      ? {
          ...turnState.extraTurnState,
          allowedCharacterIds: [...turnState.extraTurnState.allowedCharacterIds],
        }
      : null,
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
