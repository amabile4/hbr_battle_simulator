import { calculateDamage, flattenSkillParts } from './damage-calculator.js';
import { resolveDefaultStats } from './damage-calculator-input-builder.js';

export const ALL_OUT_ATTACK_SKILL_ID = 46041001;
export const SPECIAL_COMMAND_DESTRUCTION_EQUIVALENT_SP_COST = 30;

const DEFAULT_ENEMY_PARAM_BORDER = 770;
const DEFAULT_ENEMY_RESISTANCE_RATE_PERCENT = 100;
const DEFAULT_DESTRUCTION_RATE_PERCENT = 100;
const PENETRATION_DEFAULT_WEAKNESS_MULTIPLIER = 3;
const DAMAGE_STAT_KEYS = Object.freeze(['str', 'dex', 'wis', 'spr', 'luk', 'con']);
const DAMAGE_PART_TYPES = new Set([
  'AttackNormal',
  'AttackSkill',
  'DamageRateChangeAttackSkill',
  'PenetrationCriticalAttack',
  'PenetrationNormalAttack',
  'PenetrationSkill',
  'TokenAttack',
  'AttackBySp',
  'AttackByOwnDpRate',
  'FixedHpDamageRateAttack',
]);
const BROKEN_ENEMY_STATUS_TYPES = new Set(['Break', 'DownTurn', 'SuperBreak', 'SuperDown']);

function toFiniteNumber(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function getAttackPart(skill = {}) {
  return flattenSkillParts(skill.parts ?? []).find((part) =>
    DAMAGE_PART_TYPES.has(String(part?.skill_type ?? ''))
  ) ?? null;
}

function resolveMemberStats(member = {}) {
  const defaults = resolveDefaultStats(member.role, member.limitBreakLevel);
  return Object.fromEntries(
    DAMAGE_STAT_KEYS.map((key) => [key, toFiniteNumber(member?.stats?.[key], defaults[key])])
  );
}

export function resolvePartyAverageDamageStats(party = []) {
  const members = Array.isArray(party) ? party.filter(Boolean) : [];
  if (members.length === 0) {
    return resolveDefaultStats('Attacker', 0);
  }
  const totals = Object.fromEntries(DAMAGE_STAT_KEYS.map((key) => [key, 0]));
  for (const member of members) {
    const stats = resolveMemberStats(member);
    for (const key of DAMAGE_STAT_KEYS) {
      totals[key] += stats[key];
    }
  }
  return Object.fromEntries(DAMAGE_STAT_KEYS.map((key) => [key, totals[key] / members.length]));
}

function normalizeStatusPowerPercent(value) {
  const numeric = toFiniteNumber(value, 0);
  return Math.abs(numeric) <= 10 ? numeric * 100 : numeric;
}

function buildDefenderStatusEffects(enemyState = {}, targetEnemyIndex) {
  const targetIndex = Number(targetEnemyIndex);
  return (Array.isArray(enemyState.statuses) ? enemyState.statuses : [])
    .filter((status) => Number(status?.targetIndex) === targetIndex)
    .flatMap((status) => {
      const statusType = String(status?.statusType ?? '');
      if (statusType === 'DefenseDown') {
        return [{ statusType: 'DefenseDown', power: normalizeStatusPowerPercent(status.power) }];
      }
      if (statusType === 'Fragile') {
        return [{ statusType: 'Fragile', power: normalizeStatusPowerPercent(status.power) }];
      }
      return [];
    });
}

export function isEnemyBrokenForSpecialOperation(turnState = {}, targetEnemyIndex) {
  const enemyState = turnState?.enemyState ?? {};
  const key = String(Number(targetEnemyIndex));
  if (enemyState.breakStateByEnemy?.[key]) {
    return true;
  }
  return (Array.isArray(enemyState.statuses) ? enemyState.statuses : []).some(
    (status) =>
      Number(status?.targetIndex) === Number(targetEnemyIndex) &&
      BROKEN_ENEMY_STATUS_TYPES.has(String(status?.statusType ?? ''))
  );
}

function resolvePenetrationAffinityMultiplier(enemyState = {}, targetEnemyIndex, attackPart = {}) {
  const key = String(Number(targetEnemyIndex));
  const weaponType = String(attackPart?.type ?? 'Slash');
  const originalRate = toFiniteNumber(
    enemyState.damageRatesByEnemy?.[key]?.[weaponType],
    DEFAULT_ENEMY_RESISTANCE_RATE_PERCENT
  ) / 100;
  const configuredWeakness = toFiniteNumber(
    attackPart?.value?.[0],
    PENETRATION_DEFAULT_WEAKNESS_MULTIPLIER
  );
  return Math.max(originalRate, configuredWeakness);
}

function buildHitDamages(skill = {}, totalDamage) {
  const hits = Array.isArray(skill.hits) ? skill.hits : [];
  if (hits.length === 0) {
    return [totalDamage];
  }
  return hits.map((hit) => totalDamage * toFiniteNumber(hit?.power_ratio, 0));
}

export function calculateSpecialOperationDamageEvents({
  state,
  skill,
  operationType,
  targetEnemyIndexes,
} = {}) {
  const attackPart = getAttackPart(skill);
  if (!state?.turnState?.enemyState || !attackPart || !skill) {
    return [];
  }
  const enemyState = state.turnState.enemyState;
  const partyStats = resolvePartyAverageDamageStats(state.party);
  const referenceStat = (partyStats.str + partyStats.dex) / 2;

  return (Array.isArray(targetEnemyIndexes) ? targetEnemyIndexes : []).map((targetEnemyIndex) => {
    const key = String(Number(targetEnemyIndex));
    const isHpTarget = isEnemyBrokenForSpecialOperation(state.turnState, targetEnemyIndex);
    const destructionRatePercent = toFiniteNumber(
      enemyState.destructionRateByEnemy?.[key],
      DEFAULT_DESTRUCTION_RATE_PERCENT
    );
    const affinityMultiplier = resolvePenetrationAffinityMultiplier(
      enemyState,
      targetEnemyIndex,
      attackPart
    );
    const result = calculateDamage(
      {
        attacker: {
          characterId: '',
          styleId: 0,
          stats: partyStats,
          statusEffects: [],
        },
        defender: {
          paramBorder: toFiniteNumber(
            enemyState.paramBorderByEnemy?.[key],
            DEFAULT_ENEMY_PARAM_BORDER
          ),
          isHpTarget,
          destructionRate: isHpTarget ? destructionRatePercent / 100 : 1,
          resistances: { Slash: affinityMultiplier },
          statusEffects: buildDefenderStatusEffects(enemyState, targetEnemyIndex),
        },
        skill: {
          skillId: Number(skill.id ?? 0),
          name: String(skill.name ?? ''),
          level: 1,
        },
        activeZone: 'None',
      },
      { styles: [], enemies: [], skills: [skill] }
    );
    const damage = toFiniteNumber(result?.critical?.expected, 0);
    return {
      operationType: String(operationType ?? ''),
      skillId: Number(skill.id ?? 0),
      skillLabel: String(skill.label ?? ''),
      skillName: String(skill.name ?? ''),
      targetEnemyIndex: Number(targetEnemyIndex),
      damage,
      hitDamages: buildHitDamages(skill, damage),
      isCritical: true,
      isHpTarget,
      affinityMultiplier,
      destructionRatePercentAtAttack: isHpTarget ? destructionRatePercent : DEFAULT_DESTRUCTION_RATE_PERCENT,
      partyAverageStats: partyStats,
      referenceStat,
      calculatorBreakdown: result.breakdown,
    };
  });
}

export function resolveSpecialCommandDestructionGainPercent(skill = {}) {
  const attackPart = getAttackPart(skill);
  const damageRateRate = toFiniteNumber(attackPart?.multipliers?.dr, 0);
  return damageRateRate * SPECIAL_COMMAND_DESTRUCTION_EQUIVALENT_SP_COST;
}
