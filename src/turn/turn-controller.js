import {
  createBattleState,
  cloneTurnState,
  snapshotPartyByPartyIndex,
  buildPositionMap,
} from '../contracts/interfaces.js';
import { fromSnapshot, commitRecord, buildTurnContext } from '../records/record-assembler.js';

export const BASE_SP_RECOVERY = 2;
const OD_RECOVERY_BY_LEVEL = Object.freeze({ 1: 5, 2: 12, 3: 20 });

function findMemberByCharacterId(state, characterId) {
  return state.party.find((member) => member.characterId === characterId) ?? null;
}

function validateActionDict(state, actions) {
  if (!actions || typeof actions !== 'object' || Array.isArray(actions)) {
    throw new Error('actions must be an object keyed by position index.');
  }

  const entries = Object.entries(actions).map(([positionKey, action]) => {
    const position = Number(positionKey);
    const member = state.party.find((item) => item.position === position) ?? null;

    if (!member) {
      throw new Error(`No member at position ${position}.`);
    }

    if (member.position > 2) {
      throw new Error(`Action is allowed only for front positions (0..2). got=${position}`);
    }

    if (action.characterId && action.characterId !== member.characterId) {
      throw new Error(`characterId mismatch at position ${position}`);
    }

    const skill = member.getSkill(action.skillId);
    if (!skill) {
      throw new Error(`Skill ${action.skillId} is not available for ${member.characterId}`);
    }

    return {
      position,
      member,
      skill,
      action,
    };
  });

  const phaseOf = (skillType) => (skillType === 'non_damage' ? 0 : 1);
  entries.sort((a, b) => {
    const p = phaseOf(a.skill.type) - phaseOf(b.skill.type);
    if (p !== 0) {
      return p;
    }

    return a.position - b.position;
  });

  return entries;
}

function previewActionEntries(state, sortedActions) {
  return sortedActions.map(({ member, position, skill }) => {
    const preview = member.previewSkillUse(skill.skillId);

    return {
      characterId: member.characterId,
      characterName: member.characterName,
      partyIndex: member.partyIndex,
      positionIndex: position,
      isExtraAction: state.turnState.turnType === 'extra',
      skillId: skill.skillId,
      skillName: skill.name,
      spCost: skill.spCost,
      spChanges: [
        {
          source: 'cost',
          delta: preview.spDelta,
          preSP: preview.startSP,
          postSP: preview.endSP,
          eventCeiling: Number.POSITIVE_INFINITY,
        },
      ],
      startSP: preview.startSP,
      endSP: preview.endSP,
      _baseRevision: preview.baseRevision,
    };
  });
}

function applyRecoveryPipeline(party, turnState) {
  const recoveryEvents = [];

  for (const member of party) {
    const base = member.recoverBaseSP(BASE_SP_RECOVERY);
    recoveryEvents.push({
      characterId: member.characterId,
      source: 'base',
      ...base,
    });
  }

  if (turnState.turnType === 'od' && turnState.odLevel > 0) {
    const odAmount = OD_RECOVERY_BY_LEVEL[turnState.odLevel] ?? 0;
    for (const member of party) {
      const od = member.applySpDelta(odAmount, 'od');
      recoveryEvents.push({
        characterId: member.characterId,
        source: 'od',
        ...od,
      });
    }
  }

  return recoveryEvents;
}

function applySwapEvents(state, swapEvents) {
  for (const swap of swapEvents) {
    const from = state.party.find((member) => member.position === swap.fromPositionIndex) ?? null;
    const to = state.party.find((member) => member.position === swap.toPositionIndex) ?? null;

    if (!from || !to) {
      throw new Error('Invalid swap event target positions.');
    }

    const fromPos = from.position;
    const toPos = to.position;
    from.setPosition(toPos);
    to.setPosition(fromPos);
  }
}

function computeNextTurnState(current) {
  const next = cloneTurnState(current);
  next.sequenceId += 1;

  if (current.turnType === 'od') {
    if (current.remainingOdActions > 1) {
      next.remainingOdActions = current.remainingOdActions - 1;
      next.turnType = 'od';
      next.turnLabel = `OD${current.odLevel}-${current.odLevel - next.remainingOdActions + 1}`;
      return next;
    }

    next.turnType = 'normal';
    next.turnIndex = current.turnIndex + 1;
    next.turnLabel = `T${next.turnIndex}`;
    next.odLevel = 0;
    next.remainingOdActions = 0;
    next.odContext = null;
    next.odSuspended = false;
    next.odPending = false;
    return next;
  }

  if (current.turnType === 'extra') {
    const extraState = current.extraTurnState;
    if (extraState && extraState.remainingActions > 1) {
      next.extraTurnState = {
        ...extraState,
        remainingActions: extraState.remainingActions - 1,
      };
      next.turnType = 'extra';
      next.turnLabel = 'EX';
      return next;
    }

    if (current.odPending) {
      const level = current.odLevel > 0 ? current.odLevel : 1;
      next.turnType = 'od';
      next.turnLabel = `OD${level}-1`;
      next.odContext = 'interrupt';
      next.odLevel = level;
      next.remainingOdActions = level;
      next.odPending = false;
      next.extraTurnState = null;
      return next;
    }

    next.turnType = 'normal';
    next.turnIndex = current.turnIndex + 1;
    next.turnLabel = `T${next.turnIndex}`;
    next.extraTurnState = null;
    return next;
  }

  next.turnType = 'normal';
  next.turnIndex = current.turnIndex + 1;
  next.turnLabel = `T${next.turnIndex}`;
  return next;
}

export function createBattleStateFromParty(party, turnState) {
  const members = Array.isArray(party) ? party : party.members;
  return createBattleState(members, turnState);
}

export function previewTurn(state, actions, enemyAction = null) {
  const sortedActions = validateActionDict(state, actions);
  const actionEntries = previewActionEntries(state, sortedActions);
  const snapBefore = snapshotPartyByPartyIndex(state.party);

  const record = fromSnapshot(
    snapBefore,
    buildTurnContext(state.turnState, enemyAction),
    actionEntries,
    [],
    state.turnState.sequenceId
  );

  return record;
}

export function commitTurn(state, previewRecord, swapEvents = [], options = {}) {
  if (!previewRecord || previewRecord.recordStatus !== 'preview') {
    throw new Error('commitTurn requires preview TurnRecord.');
  }
  const applySwapOnCommit = options.applySwapOnCommit !== false;

  for (const entry of previewRecord.actions) {
    const member = findMemberByCharacterId(state, entry.characterId);
    if (!member) {
      throw new Error(`Member not found: ${entry.characterId}`);
    }

    if (member.revision !== entry._baseRevision) {
      throw new Error(`State changed after preview for character ${entry.characterId}`);
    }
  }

  for (const entry of previewRecord.actions) {
    const member = findMemberByCharacterId(state, entry.characterId);
    member.commitSkillPreview({
      characterId: entry.characterId,
      skillId: entry.skillId,
      startSP: entry.startSP,
      endSP: entry.endSP,
      baseRevision: entry._baseRevision,
    });
  }

  const recoveryEvents = applyRecoveryPipeline(state.party, state.turnState);

  for (const entry of previewRecord.actions) {
    const member = findMemberByCharacterId(state, entry.characterId);
    entry.endSP = member.sp.current;

    const extraChanges = recoveryEvents
      .filter((ev) => ev.characterId === entry.characterId)
      .map((ev) => ({
        source: ev.source,
        delta: ev.delta,
        preSP: ev.startSP,
        postSP: ev.endSP,
        eventCeiling: ev.eventCeiling,
      }));

    entry.spChanges = [...entry.spChanges, ...extraChanges];
  }

  if (applySwapOnCommit) {
    applySwapEvents(state, swapEvents);
  }

  const snapAfter = snapshotPartyByPartyIndex(state.party);
  const committed = commitRecord(previewRecord, snapAfter, swapEvents);
  const nextTurnState = computeNextTurnState(state.turnState);

  const nextState = {
    ...state,
    party: [...state.party],
    positionMap: buildPositionMap(state.party),
    turnState: nextTurnState,
  };

  return {
    nextState,
    committedRecord: committed,
  };
}

export function activateOverdrive(state, level, context = 'preemptive') {
  const numericLevel = Number(level);
  if (numericLevel < 1 || numericLevel > 3) {
    throw new Error('OD level must be 1..3');
  }

  const nextTurnState = {
    ...cloneTurnState(state.turnState),
    turnType: 'od',
    turnLabel: `OD${numericLevel}-1`,
    odLevel: numericLevel,
    remainingOdActions: numericLevel,
    odContext: context,
    odSuspended: false,
  };

  return {
    ...state,
    turnState: nextTurnState,
  };
}

export function grantExtraTurn(state, allowedCharacterIds) {
  const ids = [...new Set(allowedCharacterIds ?? [])];
  const nextTurnState = {
    ...cloneTurnState(state.turnState),
    turnType: 'extra',
    turnLabel: 'EX',
    extraTurnState: {
      active: true,
      remainingActions: 1,
      allowedCharacterIds: ids,
      grantTurnIndex: state.turnState.turnIndex,
    },
  };

  return {
    ...state,
    turnState: nextTurnState,
  };
}
