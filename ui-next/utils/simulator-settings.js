export const TARGET_SELECTION_MODES = Object.freeze({
  SIMPLE: 'simple',
  MANUAL: 'manual',
});

export const DEFAULT_SIMULATOR_SETTINGS = Object.freeze({
  targetSelection: Object.freeze({
    enemyMode: TARGET_SELECTION_MODES.SIMPLE,
    allyMode: TARGET_SELECTION_MODES.SIMPLE,
  }),
  captureUntilBattleEnd: true,
});

function normalizeTargetSelectionMode(mode) {
  return mode === TARGET_SELECTION_MODES.MANUAL
    ? TARGET_SELECTION_MODES.MANUAL
    : TARGET_SELECTION_MODES.SIMPLE;
}

export function normalizeSimulatorSettings(settings = {}) {
  const targetSelection =
    settings?.targetSelection && typeof settings.targetSelection === 'object'
      ? settings.targetSelection
      : {};

  return {
    targetSelection: {
      enemyMode: normalizeTargetSelectionMode(targetSelection.enemyMode),
      allyMode: normalizeTargetSelectionMode(targetSelection.allyMode),
    },
    captureUntilBattleEnd: Boolean(
      settings?.captureUntilBattleEnd ?? DEFAULT_SIMULATOR_SETTINGS.captureUntilBattleEnd
    ),
  };
}

export function areSimulatorSettingsEqual(left, right) {
  const normalizedLeft = normalizeSimulatorSettings(left);
  const normalizedRight = normalizeSimulatorSettings(right);
  return (
    normalizedLeft.targetSelection.enemyMode === normalizedRight.targetSelection.enemyMode &&
    normalizedLeft.targetSelection.allyMode === normalizedRight.targetSelection.allyMode &&
    normalizedLeft.captureUntilBattleEnd === normalizedRight.captureUntilBattleEnd
  );
}

export function isEnemyTargetSelectionManual(settings) {
  return (
    normalizeSimulatorSettings(settings).targetSelection.enemyMode === TARGET_SELECTION_MODES.MANUAL
  );
}

export function isAllyTargetSelectionManual(settings) {
  return (
    normalizeSimulatorSettings(settings).targetSelection.allyMode === TARGET_SELECTION_MODES.MANUAL
  );
}
