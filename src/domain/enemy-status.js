export const ENEMY_STATUS_BREAK = 'Break';
export const ENEMY_STATUS_SUPER_BREAK = 'SuperBreak';
export const ENEMY_STATUS_SUPER_BREAK_DOWN = 'SuperBreakDown';
export const ENEMY_STATUS_DEAD = 'Dead';

const LEGACY_ENEMY_STATUS_TYPE_ALIASES = Object.freeze({
  StrongBreak: ENEMY_STATUS_SUPER_BREAK,
  SuperDown: ENEMY_STATUS_SUPER_BREAK_DOWN,
});

const PERSISTENT_ENEMY_STATUS_TYPES = Object.freeze(
  new Set([
    ENEMY_STATUS_BREAK,
    ENEMY_STATUS_SUPER_BREAK,
    ENEMY_STATUS_SUPER_BREAK_DOWN,
    ENEMY_STATUS_DEAD,
  ])
);

export function normalizeEnemyStatusType(statusType) {
  const normalized = String(statusType ?? '').trim();
  if (!normalized) {
    return '';
  }
  return LEGACY_ENEMY_STATUS_TYPE_ALIASES[normalized] ?? normalized;
}

export function isPersistentEnemyStatusType(statusType) {
  return PERSISTENT_ENEMY_STATUS_TYPES.has(normalizeEnemyStatusType(statusType));
}
