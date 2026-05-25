import { REPLAY_OPERATION_TYPES } from '../../src/ui/lightweight-replay-script.js';

const OPERATION_LABELS = Object.freeze({
  [REPLAY_OPERATION_TYPES.CHANGE_FORM]: 'フォーム',
  [REPLAY_OPERATION_TYPES.ACTIVATE_KISHINKA]: '鬼神化',
  [REPLAY_OPERATION_TYPES.ACTIVATE_MAKAI_KIHEI]: '騎兵起動',
  [REPLAY_OPERATION_TYPES.ACTIVATE_ALL_OUT_ATTACK]: '総攻撃',
  [REPLAY_OPERATION_TYPES.ACTIVATE_PREEMPTIVE_OD]: '先制OD',
  [REPLAY_OPERATION_TYPES.RESERVE_INTERRUPT_OD]: '割込OD',
  [REPLAY_OPERATION_TYPES.SUMMON_ENEMY]: '召喚',
  [REPLAY_OPERATION_TYPES.SET_ENEMY_E_SHIELD]: 'Eシールド',
});

const OD_LEVEL_LABEL_OPERATION_TYPES = new Set([
  REPLAY_OPERATION_TYPES.ACTIVATE_PREEMPTIVE_OD,
  REPLAY_OPERATION_TYPES.RESERVE_INTERRUPT_OD,
]);

export function getReplayOperationDisplayLabel(operation = {}) {
  const type = String(operation?.type ?? '').trim();
  const baseLabel = OPERATION_LABELS[type] ?? (type || 'UnknownOperation');
  const enemyIndex = Number(
    operation?.payload?.targetEnemyIndex ??
    operation?.payload?.enemyIndex ??
    NaN
  );
  const enemySlotLabel = Number.isInteger(enemyIndex) && enemyIndex >= 0 ? `E${enemyIndex + 1}` : '';
  if (OD_LEVEL_LABEL_OPERATION_TYPES.has(type)) {
    const level = Number(operation?.payload?.level ?? operation?.level ?? NaN);
    if (Number.isFinite(level) && level >= 1 && level <= 3) {
      return `${baseLabel}${level}`;
    }
  }
  if (type === REPLAY_OPERATION_TYPES.CHANGE_FORM) {
    const displayName = String(operation?.payload?.displayName ?? '').trim();
    if (displayName) {
      return `${baseLabel}: ${displayName}`;
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
  if (type === REPLAY_OPERATION_TYPES.SET_ENEMY_E_SHIELD) {
    const eShieldState = operation?.payload?.eShieldState ?? null;
    if (!eShieldState) {
      return enemySlotLabel ? `Eシールド解除: ${enemySlotLabel}` : 'Eシールド解除';
    }
    const gaugeLabel = `${Number(eShieldState.current ?? 0)}/${Number(eShieldState.max ?? 0)}`;
    if (enemySlotLabel) {
      return `${baseLabel}: ${enemySlotLabel} ${gaugeLabel}`;
    }
    return `${baseLabel}: ${gaugeLabel}`;
  }
  return baseLabel;
}

export function getReplayOperationTone(operation = {}) {
  const type = String(operation?.type ?? '');
  if (type === REPLAY_OPERATION_TYPES.ACTIVATE_KISHINKA) {
    return 'border-purple-200 bg-purple-50 text-purple-700';
  }
  if (type === REPLAY_OPERATION_TYPES.CHANGE_FORM) {
    return 'border-fuchsia-200 bg-fuchsia-50 text-fuchsia-700';
  }
  if (type === REPLAY_OPERATION_TYPES.ACTIVATE_MAKAI_KIHEI) {
    return 'border-rose-200 bg-rose-50 text-rose-700';
  }
  if (type === REPLAY_OPERATION_TYPES.ACTIVATE_ALL_OUT_ATTACK) {
    return 'border-amber-200 bg-amber-50 text-amber-700';
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
  if (type === REPLAY_OPERATION_TYPES.SET_ENEMY_E_SHIELD) {
    return 'border-sky-200 bg-sky-50 text-sky-700';
  }
  return 'border-gray-200 bg-gray-50 text-gray-600';
}
