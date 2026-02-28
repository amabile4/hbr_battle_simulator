export function fromSnapshot(snapBefore, context, actions, swapEvents, sequenceId) {
  return {
    turnId: sequenceId,
    turnIndex: context.turnIndex,
    turnLabel: context.turnLabel,
    turnType: context.turnType,
    recordStatus: 'preview',
    odContext: context.odContext,
    isExtraTurn: context.isExtraTurn,
    remainingOdActionsAtStart: context.remainingOdActionsAtStart,
    snapBefore,
    snapAfter: null,
    enemyAction: context.enemyAction,
    actions,
    swapEvents,
    effectSnapshots: [],
    createdAt: new Date().toISOString(),
    committedAt: null,
  };
}

export function commitRecord(preview, snapAfter, swapEvents, committedAt = new Date().toISOString()) {
  return {
    ...preview,
    recordStatus: 'committed',
    snapAfter,
    swapEvents,
    committedAt,
  };
}

export function buildTurnContext(turnState, enemyAction = null) {
  return {
    turnIndex: turnState.turnIndex,
    turnLabel: turnState.turnLabel,
    turnType: turnState.turnType,
    odContext: turnState.odContext,
    isExtraTurn: turnState.turnType === 'extra',
    remainingOdActionsAtStart: turnState.remainingOdActions,
    enemyAction,
  };
}
