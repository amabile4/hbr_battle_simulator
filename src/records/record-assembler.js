export function fromSnapshot(snapBefore, context, actions, swapEvents, sequenceId) {
  return {
    turnId: sequenceId,
    turnIndex: context.turnIndex,
    turnLabel: context.turnLabel,
    turnType: context.turnType,
    recordStatus: 'preview',
    odContext: context.odContext,
    odTurnLabelAtStart: context.odTurnLabelAtStart,
    isExtraTurn: context.isExtraTurn,
    remainingOdActionsAtStart: context.remainingOdActionsAtStart,
    odGaugeAtStart: context.odGaugeAtStart,
    snapBefore,
    snapAfter: null,
    enemyAction: context.enemyAction,
    enemyStatusSummary: context.enemyStatusSummary,
    enemyCount: context.enemyCount,
    actions,
    swapEvents,
    effectSnapshots: [],
    createdAt: new Date().toISOString(),
    committedAt: null,
  };
}

function formatEnemyStatusSummary(turnState) {
  const statuses = Array.isArray(turnState?.enemyState?.statuses) ? turnState.enemyState.statuses : [];
  const active = statuses
    .filter((s) => Number(s?.remainingTurns ?? 0) > 0)
    .map((s) => ({
      statusType: String(s?.statusType ?? ''),
      targetIndex: Number(s?.targetIndex ?? -1),
      remainingTurns: Number(s?.remainingTurns ?? 0),
    }))
    .filter((s) => s.statusType && Number.isFinite(s.targetIndex) && s.targetIndex >= 0)
    .sort((a, b) => a.targetIndex - b.targetIndex || a.statusType.localeCompare(b.statusType));
  if (active.length === 0) {
    return '';
  }
  return active
    .map((s) => `${s.statusType}:E${s.targetIndex + 1}(${s.remainingTurns})`)
    .join('|');
}

export function commitRecord(preview, snapAfter, swapEvents, committedAt = new Date().toISOString()) {
  const actions = preview.actions.map((entry) => {
    const { _baseRevision, ...safeEntry } = entry;
    return safeEntry;
  });

  return {
    ...preview,
    actions,
    recordStatus: 'committed',
    snapAfter,
    swapEvents,
    committedAt,
  };
}

function deriveOdTurnLabel(turnState) {
  const turnType = String(turnState?.turnType ?? '');
  if (turnType === 'od') {
    return String(turnState?.turnLabel ?? '');
  }

  const isSuspendedOdExtra = turnType === 'extra' && Boolean(turnState?.odSuspended);
  if (!isSuspendedOdExtra) {
    return '';
  }

  const level = Number(turnState?.odLevel ?? 0);
  const remaining = Number(turnState?.remainingOdActions ?? 0);
  if (level <= 0 || remaining < 0) {
    return '';
  }

  // EX中にODが中断された場合、remaining は「未消化のOD行動数」なので
  // 現在のEXがどのOD行動から派生したかは (level - remaining) で求められる。
  const step = Math.max(1, Math.min(level, level - remaining));
  return `OD${level}-${step}`;
}

export function buildTurnContext(turnState, enemyAction = null, enemyCount = 1) {
  return {
    turnIndex: turnState.turnIndex,
    turnLabel: turnState.turnLabel,
    turnType: turnState.turnType,
    odContext: turnState.odContext,
    odTurnLabelAtStart: deriveOdTurnLabel(turnState),
    isExtraTurn: turnState.turnType === 'extra',
    remainingOdActionsAtStart: turnState.remainingOdActions,
    odGaugeAtStart: Number(turnState.odGauge ?? 0),
    enemyAction,
    enemyStatusSummary: formatEnemyStatusSummary(turnState),
    enemyCount: Number(enemyCount),
  };
}
