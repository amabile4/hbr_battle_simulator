import { REPLAY_OPERATION_TYPES } from '../../src/ui/lightweight-replay-script.js';

const OPERATION_LABELS = Object.freeze({
  [REPLAY_OPERATION_TYPES.ACTIVATE_KISHINKA]: '鬼神化',
  [REPLAY_OPERATION_TYPES.ACTIVATE_MAKAI_KIHEI]: '騎兵起動',
  [REPLAY_OPERATION_TYPES.ACTIVATE_PREEMPTIVE_OD]: '先制OD',
  [REPLAY_OPERATION_TYPES.RESERVE_INTERRUPT_OD]: '割込OD',
  [REPLAY_OPERATION_TYPES.SUMMON_ENEMY]: '召喚',
});

const OD_LEVEL_LABEL_OPERATION_TYPES = new Set([
  REPLAY_OPERATION_TYPES.ACTIVATE_PREEMPTIVE_OD,
  REPLAY_OPERATION_TYPES.RESERVE_INTERRUPT_OD,
]);

export function getReplayOperationDisplayLabel(operation = {}) {
  const type = String(operation?.type ?? '').trim();
  const baseLabel = OPERATION_LABELS[type] ?? (type || 'UnknownOperation');
  if (OD_LEVEL_LABEL_OPERATION_TYPES.has(type)) {
    const level = Number(operation?.payload?.level ?? operation?.level ?? NaN);
    if (Number.isFinite(level) && level >= 1 && level <= 3) {
      return `${baseLabel}${level}`;
    }
  }
  if (type === REPLAY_OPERATION_TYPES.SUMMON_ENEMY) {
    const enemyName = String(
      operation?.payload?.enemyName ??
      operation?.payload?.name ??
      ''
    ).trim();
    if (enemyName) {
      return `${baseLabel}: ${enemyName}`;
    }
  }
  return baseLabel;
}

export function getReplayOperationTone(operation = {}) {
  const type = String(operation?.type ?? '');
  if (type === REPLAY_OPERATION_TYPES.ACTIVATE_KISHINKA) {
    return 'border-purple-200 bg-purple-50 text-purple-700';
  }
  if (type === REPLAY_OPERATION_TYPES.ACTIVATE_MAKAI_KIHEI) {
    return 'border-rose-200 bg-rose-50 text-rose-700';
  }
  if (type === REPLAY_OPERATION_TYPES.ACTIVATE_PREEMPTIVE_OD) {
    return 'border-indigo-200 bg-indigo-50 text-indigo-700';
  }
  if (type === REPLAY_OPERATION_TYPES.RESERVE_INTERRUPT_OD) {
    return 'border-orange-200 bg-orange-50 text-orange-700';
  }
  if (type === REPLAY_OPERATION_TYPES.SUMMON_ENEMY) {
    return 'border-emerald-200 bg-emerald-50 text-emerald-700';
  }
  return 'border-gray-200 bg-gray-50 text-gray-600';
}
