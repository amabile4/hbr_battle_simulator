import { previewTurnRecord, commitTurnRecord } from '../../src/ui/adapter-core.js';
import {
  applyEnemyStateOverrideSnapshot,
  buildEnemyStateOverrideSnapshot,
  countAliveEnemies,
  evaluateConditionExpression,
  isEnemyAlive,
  resolveEffectiveSkillForAction,
  syncByakkoRushStateWithDpCondition,
} from '../../src/turn/turn-controller.js';
import { sortTurnActionExecutionEntries } from '../../src/turn/action-execution-order.js';
import {
  clampEnemyCount,
  DEFAULT_ENEMY_COUNT,
  getOdGaugeRequirement,
} from '../../src/config/battle-defaults.js';
import {
  applyBeforeCommitOperations,
  canActivateKishinka,
  getActivatablePreemptiveOdLevels as resolveActivatablePreemptiveOdLevels,
  MAKAI_KIHEI_MAX_USES,
  TEZUKA_CHARACTER_ID,
  resolveAllOutAttackAvailability,
  resolveMakaiKiheiAvailability,
} from '../../src/turn/turn-operations.js';
import {
  applyReplayOverrideEntriesToScenarioTurn,
  createEmptyLightweightReplayScript,
  normalizeLightweightReplayScript,
  normalizeLightweightReplayTurn,
  REPLAY_OPERATION_TYPES,
  REPLAY_OVERRIDE_ENTRY_TYPES,
  replayOperationRegistry,
  syncReplaySetupNormalAttackElements,
} from '../../src/ui/lightweight-replay-script.js';
import {
  getActionOutcomeOverridesFromReplayTurn,
  getFollowUpOverridesFromReplayTurn,
} from '../../src/domain/replay-turn-overrides.js';
import {
  normalizeTurnReplayTarget,
  resolveTurnBreakAttributionMode,
  TURN_BREAK_ATTRIBUTION_MODES,
} from '../utils/turn-targeting.js';
import {
  ACTION_OUTCOME_TYPES,
  getBreakEnemyIndexesForPosition,
  getHpBreakEnemyIndexesForPosition,
  getKillEnemyIndexesForPosition,
  normalizeActionOutcomeOverrides,
} from '../utils/action-outcome-overrides.js';
import { canEnemyHpBreak } from '../../src/domain/enemy-extra-hp-gauge.js';
import {
  normalizeFollowUpOverrides,
} from '../utils/follow-up-overrides.js';
import { normalizeValidationPolicy } from '../utils/validation-policy.js';
import { isPursuitOnlySkill } from '../../src/domain/skill-classifiers.js';
import { buildActionFlowFromRecord } from '../utils/action-flow-builder.js';
import { resolvePerHitDpDamageByEnemy } from '../../src/domain/action-dp-damage.js';
import { resolvePerHitHpDamageByEnemy } from '../../src/domain/action-hp-damage.js';
import { normalizeCharacterStats, resolveStatsWithSupport } from '../../src/domain/character-stats.js';
import { resolveDefaultStats } from '../../src/domain/damage-calculator-input-builder.js';

function createEmptyReplayDiagnostics() {
  return {
    setupWarnings: [],
    turnWarnings: [],
    error: null,
    appliedTurnCount: 0,
  };
}

function formatEnemySlotLabels(enemyIndexes = []) {
  return (Array.isArray(enemyIndexes) ? enemyIndexes : [])
    .map((enemyIndex) => `E${Number(enemyIndex) + 1}`)
    .join(', ');
}

const ENEMY_SNAPSHOT_OVERRIDE_FIELD_TO_TYPE = Object.freeze({
  enemyNames: REPLAY_OVERRIDE_ENTRY_TYPES.ENEMY_NAMES,
  enemyDamageRates: REPLAY_OVERRIDE_ENTRY_TYPES.ENEMY_DAMAGE_RATES,
  enemyDestructionRates: REPLAY_OVERRIDE_ENTRY_TYPES.ENEMY_DESTRUCTION_RATES,
  enemyDestructionRateCaps: REPLAY_OVERRIDE_ENTRY_TYPES.ENEMY_DESTRUCTION_RATE_CAPS,
  enemyOdRates: REPLAY_OVERRIDE_ENTRY_TYPES.ENEMY_OD_RATES,
  enemyEShields: REPLAY_OVERRIDE_ENTRY_TYPES.ENEMY_E_SHIELDS,
  enemyExtraHpGauges: REPLAY_OVERRIDE_ENTRY_TYPES.ENEMY_EXTRA_HP_GAUGES,
  enemyAbsorbElements: REPLAY_OVERRIDE_ENTRY_TYPES.ENEMY_ABSORB_ELEMENTS,
  enemyBreakStates: REPLAY_OVERRIDE_ENTRY_TYPES.ENEMY_BREAK_STATES,
  enemyStatuses: REPLAY_OVERRIDE_ENTRY_TYPES.ENEMY_STATUSES,
});
const ENEMY_SNAPSHOT_OVERRIDE_TYPES = new Set(Object.values(ENEMY_SNAPSHOT_OVERRIDE_FIELD_TO_TYPE));
const TURN_EDIT_PRESERVED_OVERRIDE_EXCLUDED_TYPES = new Set([
  REPLAY_OVERRIDE_ENTRY_TYPES.ENEMY_COUNT,
  REPLAY_OVERRIDE_ENTRY_TYPES.ACTION_OUTCOME_OVERRIDES,
  REPLAY_OVERRIDE_ENTRY_TYPES.FOLLOW_UP_OVERRIDES,
  ...ENEMY_SNAPSHOT_OVERRIDE_TYPES,
]);
const SCENARIO_SNAPSHOT_ONLY_OPERATION_TYPES = new Set([
  REPLAY_OPERATION_TYPES.SUMMON_ENEMY,
  REPLAY_OPERATION_TYPES.SET_ENEMY_E_SHIELD,
]);
const ENEMY_SINGLE_TARGET_TYPES = new Set(['Single', 'EnemySingle']);
const ENEMY_ALL_TARGET_TYPES = new Set(['All', 'EnemyAll']);

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function areDeepEqual(left, right) {
  if (Object.is(left, right)) {
    return true;
  }
  if (Array.isArray(left) && Array.isArray(right)) {
    if (left.length !== right.length) {
      return false;
    }
    return left.every((entry, index) => areDeepEqual(entry, right[index]));
  }
  if (isPlainObject(left) && isPlainObject(right)) {
    const leftKeys = Object.keys(left);
    const rightKeys = Object.keys(right);
    if (leftKeys.length !== rightKeys.length) {
      return false;
    }
    return leftKeys.every((key) => Object.prototype.hasOwnProperty.call(right, key) && areDeepEqual(left[key], right[key]));
  }
  return false;
}

function cloneReplayDiagnostics(diagnostics = {}) {
  return {
    setupWarnings: Array.isArray(diagnostics?.setupWarnings)
      ? diagnostics.setupWarnings.map((warning) => String(warning))
      : [],
    turnWarnings: Array.isArray(diagnostics?.turnWarnings)
      ? diagnostics.turnWarnings.map((warnings) =>
          Array.isArray(warnings) ? warnings.map((warning) => String(warning)) : []
        )
      : [],
    error: diagnostics?.error
      ? {
          index: Number(diagnostics.error.index),
          message: String(diagnostics.error.message ?? ''),
        }
      : null,
    appliedTurnCount: Number(diagnostics?.appliedTurnCount ?? 0),
  };
}

const PURSUIT_TRANSFORMED_SKILL_NAME = 'ネコジェット・シャテキ';
const PURSUIT_TRANSFORMED_SKILL_SP_COST = 10;
const PURSUIT_HIT_COUNT_BY_WEAPON_TYPE = Object.freeze({
  DoubleSword: 2,
  LargeSword: 2,
  Cannon: 3,
  Shield: 3,
  Claw: 3,
  Sword: 4,
  Gun: 1,
  Scythe: 4,
});
const PURSUIT_HIT_COUNT_EXCEPTIONS_BY_CHARACTER_ID = Object.freeze({
  IMinase: 2,
  BIYamawaki: 3,
});
const FOLLOW_UP_MAX_TRIGGERS_PER_ACTION = 1;
const AUTOMATIC_FOLLOW_UP_TRIGGER_SOURCE = 'auto';
const FOLLOW_UP_TRIGGER_SOURCE_MANUAL = 'manual';
const AUTOMATIC_FOLLOW_UP_PASSIVE_SKILL_TYPE = 'PursuitConfirmed';
const AUTOMATIC_FOLLOW_UP_AUTO_TYPE = 'Pursuit';
const FRONT_POSITION_MAX = 2;
const BACK_POSITION_MIN = 3;
const BACK_POSITION_MAX = 5;
const AUTOMATIC_FOLLOW_UP_ATTACK_SKILL_TYPES = new Set([
  'AttackSkill',
  'DamageRateChangeAttackSkill',
  'PenetrationCriticalAttack',
  'AttackByOwnDpRate',
  'AttackBySp',
  'TokenAttack',
  'FixedHpDamageRateAttack',
]);

function resolvePursuitSourceForMember(member, state = null) {
  const pursuitCandidates = [
    ...(member?.getActionSkills?.() ?? []),
    ...(Array.isArray(member?.triggeredSkills) ? member.triggeredSkills : []),
    ...(member?.getSupportSkills?.() ?? []),
  ];

  const transformed = pursuitCandidates.find(
    (skill) => String(skill?.name ?? '') === PURSUIT_TRANSFORMED_SKILL_NAME
  );
  const transformedEffective =
    transformed && state
      ? resolveEffectiveSkillForAction(state, member, transformed) ?? transformed
      : transformed;
  const rawTransformedSpCost = Number(
    transformedEffective?.spCost ??
      transformedEffective?.sp_cost ??
      transformed?.spCost ??
      transformed?.sp_cost ??
      PURSUIT_TRANSFORMED_SKILL_SP_COST
  );
  const transformedSpCost =
    Number.isFinite(rawTransformedSpCost) && rawTransformedSpCost > 0
      ? rawTransformedSpCost
      : PURSUIT_TRANSFORMED_SKILL_SP_COST;
  if (transformed && Number(member?.sp?.current ?? 0) >= transformedSpCost) {
    const transformedHitCount = Number(transformed?.hitCount ?? transformed?.hit_count ?? 0);
    return {
      skill: transformedEffective,
      hitCount: Number.isFinite(transformedHitCount) && transformedHitCount > 0 ? transformedHitCount : 5,
      spCost: transformedSpCost,
    };
  }

  return resolveNormalPursuitSourceForMember(member, pursuitCandidates);
}

function resolveNormalPursuitSourceForMember(member, pursuitCandidates = null) {
  const candidates = Array.isArray(pursuitCandidates)
    ? pursuitCandidates
    : [
        ...(member?.getActionSkills?.() ?? []),
        ...(Array.isArray(member?.triggeredSkills) ? member.triggeredSkills : []),
        ...(member?.getSupportSkills?.() ?? []),
      ];
  const pursuitSkill = candidates.find((skill) => isPursuitOnlySkill(skill));
  const explicitHitCount = Number(pursuitSkill?.hitCount ?? pursuitSkill?.hit_count ?? 0);
  if (Number.isFinite(explicitHitCount) && explicitHitCount > 0) {
    return {
      skill: pursuitSkill ?? null,
      hitCount: explicitHitCount,
      spCost: 0,
    };
  }

  const characterId = String(member?.characterId ?? '');
  if (Object.hasOwn(PURSUIT_HIT_COUNT_EXCEPTIONS_BY_CHARACTER_ID, characterId)) {
    return {
      skill: pursuitSkill ?? null,
      hitCount: Number(PURSUIT_HIT_COUNT_EXCEPTIONS_BY_CHARACTER_ID[characterId]),
      spCost: 0,
    };
  }

  const weaponType = String(member?.weaponType ?? '');
  if (Object.hasOwn(PURSUIT_HIT_COUNT_BY_WEAPON_TYPE, weaponType)) {
    return {
      skill: pursuitSkill ?? null,
      hitCount: Number(PURSUIT_HIT_COUNT_BY_WEAPON_TYPE[weaponType]),
      spCost: 0,
    };
  }

  return {
    skill: pursuitSkill ?? null,
    hitCount: 1,
    spCost: 0,
  };
}

function isAutomaticFollowUpPassive(passive) {
  if (!passive || typeof passive !== 'object') {
    return false;
  }
  if (String(passive?.auto_type ?? '').trim() === AUTOMATIC_FOLLOW_UP_AUTO_TYPE) {
    return true;
  }
  if (String(passive?.label ?? '').includes(AUTOMATIC_FOLLOW_UP_PASSIVE_SKILL_TYPE)) {
    return true;
  }
  return (passive?.parts ?? []).some(
    (part) => String(part?.skill_type ?? '').trim() === AUTOMATIC_FOLLOW_UP_PASSIVE_SKILL_TYPE
  );
}

function getAutomaticFollowUpPassives(member) {
  return (member?.passives ?? []).filter((passive) => isAutomaticFollowUpPassive(passive));
}

function hasAutomaticFollowUpPassive(member) {
  return getAutomaticFollowUpPassives(member).length > 0;
}

function evaluateAutomaticFollowUpPassiveCondition(passive, state, actor, effectiveSkill, action, consumeSp) {
  const expression = String(passive?.condition ?? passive?.cond ?? '').trim();
  if (!expression) {
    return true;
  }
  const skillForCondition = {
    ...(effectiveSkill ?? {}),
    spCost: consumeSp,
    sp_cost: consumeSp,
  };
  const evaluated = evaluateConditionExpression(expression, state, actor, skillForCondition, action);
  return evaluated.result === true && Number(evaluated.unknownCount ?? 0) === 0;
}

function skillHasAttackPart(skill) {
  for (const part of skill?.parts ?? []) {
    if (AUTOMATIC_FOLLOW_UP_ATTACK_SKILL_TYPES.has(String(part?.skill_type ?? '').trim())) {
      return true;
    }
    if (Array.isArray(part?.strval)) {
      for (const nested of part.strval) {
        if (nested && typeof nested === 'object' && skillHasAttackPart(nested)) {
          return true;
        }
      }
    }
  }
  return false;
}

function resolveSkillPreviewCost(member, effectiveSkill) {
  if (typeof member?.previewSkillUseResolved !== 'function') {
    return Number(effectiveSkill?.spCost ?? effectiveSkill?.sp_cost ?? 0);
  }
  const preview = member.previewSkillUseResolved(effectiveSkill);
  if (Number.isFinite(Number(preview?.delta)) && Number(preview.delta) < 0) {
    return Math.abs(Number(preview.delta));
  }
  return Number(effectiveSkill?.spCost ?? effectiveSkill?.sp_cost ?? 0);
}

/**
 * LightweightReplayScript を正本として保持し、previewTurn/commitTurn を透過的に管理するクラス。
 *
 * - GUI は position キーのスロット操作だけを渡す
 * - 内部で previewTurn → commitTurn の 2段階を処理する
 * - 過去ターンのスロット変更は recalculateFrom() で該当ターン以降を再計算する
 *
 * ✅ engine 修正済み（PR #4）:
 *   commitTurn() が party: state.party.map(m => m.clone()) で deep copy するため、
 *   各ターンの CharacterStyle インスタンスは独立している。
 *   recalculateFrom() は #alignPositionsToSlots で各ターンの position を slots から復元する。
 */
export class TurnEngineManager {
  #initialState = null;
  #replayScript = null;
  #computedStates = [];   // [i] = turn i の commit 後 state
  #computedRecords = [];  // [i] = turn i の committedRecord（null = エラーで停止）

  // 未コミット行の OD 予約（commit 時にクリア）
  #pendingPreemptiveOdLevel = null;  // number | null
  #pendingInterruptOdLevel = null;   // number | null
  #pendingSpecialOperations = [];    // ReplayOperation[]
  #validationPolicy = normalizeValidationPolicy();
  #replayDiagnostics = createEmptyReplayDiagnostics();
  // DPダメージガイド導出用の計算データ（{styles, characters, enemies, skills}）。
  // 未設定の場合は enrichment を行わず従来挙動を維持する。派生値専用で保存対象外。
  #damageCalculationData = null;

  get replayScript() { return this.#replayScript; }
  get computedRecords() { return this.#computedRecords; }
  get computedStates() { return this.#computedStates; }
  get initialState() { return this.#initialState; }
  get pendingPreemptiveOdLevel() { return this.#pendingPreemptiveOdLevel; }
  get pendingInterruptOdLevel() { return this.#pendingInterruptOdLevel; }
  get pendingSpecialOperations() {
    return this.#pendingSpecialOperations.map((operation) => structuredClone(operation));
  }
  get validationPolicy() {
    return structuredClone(this.#validationPolicy);
  }
  get replayDiagnostics() {
    return this.getReplayDiagnostics();
  }

  /** Apply 後に呼ぶ。初期 BattleState と空の ReplayScript を設定する。*/
  get currentState() {
    return this.#computedStates.at(-1) ?? this.#initialState;
  }

  /**
   * pending な鬼神化・先制OD を適用した表示用 state を返す（未コミット行のスキルコスト表示用）。
   * 鬼神化 pending 中は isReinforcedMode === true の state を返すため、
   * TurnRowController のスキルコスト計算で SP が 0 表示になる。
   */
  get currentStateWithPending() {
    return this.getCurrentStateWithPending();
  }

  getCurrentStateWithPending(enemyCount = null) {
    try {
      return applyBeforeCommitOperations(
        this.#cloneWorkingState(this.currentState),
        this.#buildPendingBeforeCommitOperations(),
        { enemyCount }
      );
    } catch {
      return this.currentState;
    }
  }

  get committedTurnCount() {
    return this.#replayScript?.turns.length ?? 0;
  }

  /**
   * Apply 後に呼ぶ。初期 BattleState と空の ReplayScript を設定する。
   * @param {object} initialState BattleState
   * @param {object} replaySetup  LightweightReplaySetup（setup のみ）
   */
  initialize(initialState, replaySetup = {}, options = {}) {
    this.#initialState = initialState;
    this.#replayScript = createEmptyLightweightReplayScript(replaySetup);
    this.#syncReplaySetupWithBaseState();
    this.#computedStates = [];
    this.#computedRecords = [];
    this.#pendingPreemptiveOdLevel = null;
    this.#pendingInterruptOdLevel = null;
    this.#pendingSpecialOperations = [];
    this.#validationPolicy = normalizeValidationPolicy(options.validationPolicy);
    this.#replayDiagnostics = createEmptyReplayDiagnostics();
    if ('damageCalculationData' in options) {
      this.#damageCalculationData = options.damageCalculationData ?? null;
    }
  }

  /**
   * DPダメージガイド導出に使う計算データ（{styles, characters, enemies, skills}）を設定する。
   * 設定後の commit / recalculate から enrichment が有効になる。
   * 既存ターンへ反映するには呼び出し側で recalculateFrom(0) を実行すること。
   */
  setDamageCalculationData(data) {
    this.#damageCalculationData = data ?? null;
  }

  #appendReplayWarnings(turnIndex, warnings = []) {
    const normalized = (Array.isArray(warnings) ? warnings : [])
      .map((warning) => String(warning))
      .filter(Boolean);
    if (normalized.length === 0 || !Number.isInteger(turnIndex) || turnIndex < 0) {
      return;
    }
    const nextWarnings = Array.isArray(this.#replayDiagnostics.turnWarnings[turnIndex])
      ? [...this.#replayDiagnostics.turnWarnings[turnIndex]]
      : [];
    const seen = new Set(nextWarnings);
    for (const warning of normalized) {
      if (seen.has(warning)) {
        continue;
      }
      nextWarnings.push(warning);
      seen.add(warning);
    }
    this.#replayDiagnostics.turnWarnings[turnIndex] = nextWarnings;
  }

  loadReplayScript(initialState, replayScript = {}, options = {}) {
    this.#initialState = initialState;
    this.#replayScript = normalizeLightweightReplayScript(replayScript);
    this.#syncReplaySetupWithBaseState();
    this.#computedStates = [];
    this.#computedRecords = [];
    this.#pendingPreemptiveOdLevel = null;
    this.#pendingInterruptOdLevel = null;
    this.#pendingSpecialOperations = [];
    this.#validationPolicy = normalizeValidationPolicy(options.validationPolicy);
    if ('damageCalculationData' in options) {
      this.#damageCalculationData = options.damageCalculationData ?? null;
    }
    this.#recalculateAllBestEffort({
      strictExtraTurnTurnIndexes: new Set(),
    });
  }

  /**
   * 現在の最終 state に 1ターン追加してコミットする。
   * pending な先制OD があれば commit 前に activateOverdrive を実行する。
   * pending な割込OD があれば interruptOdLevel として commit に渡す。
   * @param {Object<number, {skillId: number|null, target?: object}>} slotActions
   * @param {object} options
   * @param {number} [options.interruptOdLevel=0]
   * @param {string} [options.note='']
   * @returns {object} committedRecord
   */
  commitNextTurn(slotActions = {}, options = {}) {
    const operations = this.#buildCommittedOperations();
    const directInterruptLevel = Number(options.interruptOdLevel);
    if (
      Number.isFinite(directInterruptLevel) &&
      directInterruptLevel >= 1 &&
      directInterruptLevel <= 3 &&
      this.#pendingInterruptOdLevel == null
    ) {
      operations.push({
        type: REPLAY_OPERATION_TYPES.RESERVE_INTERRUPT_OD,
        payload: { level: directInterruptLevel },
      });
    }
    const warnings = [];
    const scenarioTurn = this.#buildScenarioTurnFromOverrideEntries(options.overrideEntries ?? [], warnings);
    const enemyCount = clampEnemyCount(
      options.enemyCount ?? scenarioTurn.enemyCount ?? this.currentState?.turnState?.enemyState?.enemyCount
    );
    let state = this.#cloneWorkingState(this.currentState);
    this.#applyScenarioTurnPlayerOverrides(state, scenarioTurn);
    this.#applyScenarioTurnEnemyOverrides(state, scenarioTurn);
    const operationFreeStateBefore = this.#cloneWorkingState(state);
    const replayEnemySnapshotState = this.#applySnapshotOnlyOperationsForReplay(
      operationFreeStateBefore,
      operations,
      enemyCount,
      warnings
    );
    state = applyBeforeCommitOperations(
      state,
      operations,
      {
        enemyCount,
        allowInsufficientOd: this.#validationPolicy.allowInsufficientOd,
        onWarning: (message) => warnings.push(String(message)),
      }
    );
    const effectiveEnemyCount = this.#resolveEffectiveEnemyCount(state, enemyCount);
    const resolvedSlotActions = this.#resolveInputRowSlotActions(state, slotActions);
    const actionOutcomeOverrides = this.#normalizeActionOutcomeOverridesForState(
      state,
      resolvedSlotActions,
      options.actionOutcomeOverrides,
      effectiveEnemyCount,
      {
        onWarning: (message) => warnings.push(String(message)),
      }
    );
    const manualFollowUpOverrides = this.#normalizeFollowUpOverridesForState(
      state,
      options.followUpOverrides,
      effectiveEnemyCount
    );
    const automaticFollowUpOverrides = this.#resolveAutomaticFollowUpOverrides(
      state,
      resolvedSlotActions,
      effectiveEnemyCount
    );
    const followUpOverrides = this.#mergeFollowUpOverrides(
      manualFollowUpOverrides,
      automaticFollowUpOverrides,
      effectiveEnemyCount
    );

    const actions = this.#buildActionsDict(
      state,
      resolvedSlotActions,
      actionOutcomeOverrides,
      manualFollowUpOverrides,
      automaticFollowUpOverrides
    );
    const previewRecord = previewTurnRecord(
      state,
      actions,
      options.enemyAction ?? null,
      effectiveEnemyCount,
      {
        allowUseCountOverflow: this.#validationPolicy.allowUseCountOverflow,
        allowSkillConditionMismatch: this.#validationPolicy.allowSkillConditionMismatch,
        onWarning: (message) => warnings.push(String(message)),
      }
    );
    this.#appendPreviewResourceWarnings(previewRecord, warnings);
    this.#enrichPreviewRecordWithDpDamage(state, previewRecord);

    const interruptLevel = options.interruptOdLevel ?? this.#pendingInterruptOdLevel ?? 0;
    const requiredInterruptGauge = interruptLevel > 0 ? getOdGaugeRequirement(interruptLevel) : 0;
    const odGaugeAfter = Number(
      previewRecord?.projections?.odGaugeAtEnd ?? state.turnState?.odGauge ?? 0
    );
    const forceInterruptOd =
      interruptLevel > 0 &&
      odGaugeAfter < requiredInterruptGauge &&
      this.#validationPolicy.allowInsufficientOd;
    if (forceInterruptOd) {
      warnings.push(
        `insufficient OD allowed: OD${interruptLevel} requires ${requiredInterruptGauge}% gauge. current=${odGaugeAfter.toFixed(2)}%`
      );
    }

    // commitTurn は state.party メンバーを in-place 変更する（updateReinforcedModeStateAfterTurn 等）。
    // #applyKishinkaToState や activateOverdrive を経ていない場合、state は computedStates[N-1] の
    // 直接参照となり、commitTurnRecord 後に computedStates[N-1].party が汚染される。
    // getStateBefore(N) = computedStates[N-1] を参照する committed 行の stateBefore が
    // 変異した state を返してしまい、getActionSkills() が誤った結果を返すバグの原因となる。
    // → party をクローンした作業用 state を commitTurnRecord に渡すことで汚染を防ぐ。
    const stateForCommit = this.#cloneWorkingState(state);

    const { nextState } = commitTurnRecord(stateForCommit, previewRecord, [], {
      interruptOdLevel: interruptLevel,
      forceOdActivation: forceInterruptOd,
      forceResourceDeficit: forceInterruptOd,
      enemyAttackTargetCharacterIds: scenarioTurn.enemyAttackTargetCharacterIds ?? [],
    });

    // slotActions は currentState（先制OD 適用前）の position を基準に記録
    const replayTurn = this.#buildReplayTurn(
      state,
      resolvedSlotActions,
      options.note ?? '',
      operations,
      effectiveEnemyCount,
      actionOutcomeOverrides,
      followUpOverrides,
      options.overrideEntries ?? [],
      { enemyOverrideState: replayEnemySnapshotState }
    );
    this.#replayScript.turns.push(replayTurn);
    // pending をリセット
    this.#pendingPreemptiveOdLevel = null;
    this.#pendingInterruptOdLevel = null;
    this.#pendingSpecialOperations = [];

    this.#computedStates.push(this.#patchNextStateForKills(nextState, actionOutcomeOverrides, effectiveEnemyCount));
    this.#computedRecords.push(null);
    this.#recalculateAllBestEffort();
    this.#appendReplayWarnings(this.#replayScript.turns.length - 1, warnings);
    return this.#computedRecords.at(-1) ?? null;
  }

  /**
   * 初期 BattleState を差し替えて全ターンを再計算する。
   * ReplayScript の turns は保持したまま、state だけを更新する。
   * Party Setup 変更後の全再計算に使用。
   * @param {object} newInitialState 新しい初期 BattleState
   */
  recalculateAll(newInitialState) {
    this.#initialState = newInitialState;
    if (this.#replayScript) {
      this.#syncReplaySetupWithBaseState();
      this.#recalculateAllBestEffort();
    }
  }

  /**
   * 比較ビュー用: 手動ブレイク/討伐指定（actionOutcomeOverrides）を一括無効化した
   * 「自動計算のみ」の推移を別バッファで再計算して返す（read-only API）。
   *
   * - replayScript / computedStates / computedRecords / pending には一切影響しない
   *   （クローンに差し替えて recalculateFrom(0) を流用し、finally で必ず復元する）。
   * - 戻り値はビュー状態であり、保存JSONには含めない。
   * - replayScript 未ロード時は null。
   *
   * @returns {{ states: object[], records: (object|null)[] } | null}
   */
  buildComparisonComputedStates() {
    if (!this.#replayScript) {
      return null;
    }
    const savedReplayScript = this.#replayScript;
    const savedComputedStates = this.#computedStates;
    const savedComputedRecords = this.#computedRecords;
    const savedPendingPreemptiveOdLevel = this.#pendingPreemptiveOdLevel;
    const savedPendingInterruptOdLevel = this.#pendingInterruptOdLevel;
    const savedPendingSpecialOperations = this.#pendingSpecialOperations;
    try {
      const comparisonScript = structuredClone(savedReplayScript);
      for (const turn of comparisonScript.turns ?? []) {
        if (turn && typeof turn === 'object') {
          turn.actionOutcomeOverrides = [];
        }
      }
      this.#replayScript = comparisonScript;
      this.#computedStates = [];
      this.#computedRecords = [];
      this.recalculateFrom(0);
      return { states: this.#computedStates, records: this.#computedRecords };
    } catch (err) {
      console.warn('TurnEngineManager.buildComparisonComputedStates failed:', err.message);
      return null;
    } finally {
      this.#replayScript = savedReplayScript;
      this.#computedStates = savedComputedStates;
      this.#computedRecords = savedComputedRecords;
      this.#pendingPreemptiveOdLevel = savedPendingPreemptiveOdLevel;
      this.#pendingInterruptOdLevel = savedPendingInterruptOdLevel;
      this.#pendingSpecialOperations = savedPendingSpecialOperations;
    }
  }

  /**
   * fromIndex ターン以降を再計算する。
   * fromIndex 以降の computedStates / computedRecords を破棄して再実行。
   * OD operations（ACTIVATE_PREEMPTIVE_OD / RESERVE_INTERRUPT_OD）も再現する。
   * @param {number} fromIndex
   */
  recalculateFrom(fromIndex) {
    this.#computedStates.splice(fromIndex);
    this.#computedRecords.splice(fromIndex);
    // 過去ターンを再計算するため、未コミット pending は無効化する
    this.#pendingPreemptiveOdLevel = null;
    this.#pendingInterruptOdLevel = null;
    this.#pendingSpecialOperations = [];

    const baseState = fromIndex === 0
      ? this.#initialState
      : this.#computedStates[fromIndex - 1];

    // baseState の party を clone して作業用コピーを作る。
    // #alignPositionsToSlots が position を書き換えるため、permanent state を汚染しないよう独立させる。
    let state = this.#cloneWorkingState(baseState);
    const turns = this.#replayScript.turns;

    for (let i = fromIndex; i < turns.length; i++) {
      const turn = turns[i];
      // replayTurn.slots[i].styleId に記録された配置に従い、各メンバーの position を復元する。
      // commitTurnRecord は state.party メンバーを in-place 変更するため、
      // state が computedStates[i-1] を参照している場合は汚染が発生する。
      // → 各イテレーション先頭で party をクローンして作業用コピーを確保する。
      state = this.#cloneWorkingState(state);
      this.#alignPositionsToSlots(state, turn);
      const scenarioTurn = this.#buildScenarioTurnFromOverrideEntries(turn?.overrideEntries ?? [], []);
      this.#applyScenarioTurnPlayerOverrides(state, scenarioTurn);
      this.#applyScenarioTurnEnemyOverrides(state, scenarioTurn);
      const slotActions = this.#slotActionsFromReplayTurn(turn);
      const enemyCount = this.#resolveReplayTurnEnemyCount(turn, state);
      const actionOutcomeOverrides = this.#resolveReplayTurnActionOutcomeOverrides(
        turn,
        enemyCount,
        state,
        slotActions
      );
      const replayFollowUpOverrides = this.#resolveReplayTurnFollowUpOverrides(
        turn,
        enemyCount,
        state
      );
      const automaticFollowUpOverrides = this.#resolveAutomaticFollowUpOverrides(
        state,
        slotActions,
        enemyCount
      );
      const manualFollowUpOverrides = this.#subtractAutomaticFollowUpOverrides(
        replayFollowUpOverrides,
        automaticFollowUpOverrides,
        enemyCount
      );
      const followUpOverrides = this.#mergeFollowUpOverrides(
        manualFollowUpOverrides,
        automaticFollowUpOverrides,
        enemyCount
      );
      this.#replaceReplayTurnActionOutcomeOverrides(turn, actionOutcomeOverrides, enemyCount);
      this.#replaceReplayTurnFollowUpOverrides(turn, followUpOverrides, enemyCount);
      try {
        state = applyBeforeCommitOperations(
          state,
          this.#filterScenarioManagedOperations(turn.operations),
          { enemyCount }
        );
      } catch (err) {
        console.warn(`TurnEngineManager.recalculateFrom: before-commit operations failed at turn ${i}:`, err.message);
        this.#computedStates.push(state);
        this.#computedRecords.push(null);
        break;
      }
      const effectiveEnemyCount = this.#resolveEffectiveEnemyCount(state, enemyCount);

      const actions = this.#buildActionsDict(
        state,
        slotActions,
        actionOutcomeOverrides,
        manualFollowUpOverrides,
        automaticFollowUpOverrides
      );

      // 割込OD operation を再現
      const interruptLevel = this.#extractOperationLevel(
        turn.operations, REPLAY_OPERATION_TYPES.RESERVE_INTERRUPT_OD
      );

      try {
        const previewRecord = previewTurnRecord(state, actions, null, effectiveEnemyCount);
        this.#enrichPreviewRecordWithDpDamage(state, previewRecord);
        const { nextState, committedRecord } = commitTurnRecord(state, previewRecord, [], {
          interruptOdLevel: interruptLevel ?? 0,
          enemyAttackTargetCharacterIds: scenarioTurn.enemyAttackTargetCharacterIds ?? [],
        });
        const patchedNextState = this.#patchNextStateForKills(
          nextState,
          actionOutcomeOverrides,
          effectiveEnemyCount
        );
        this.#computedStates.push(patchedNextState);
        this.#computedRecords.push(committedRecord);
        state = patchedNextState;
      } catch (err) {
        // force モード相当: エラーを記録して以降をスキップ
        console.warn(`TurnEngineManager.recalculateFrom: turn ${i} failed:`, err.message);
        this.#computedStates.push(state);
        this.#computedRecords.push(null);
        break;
      }
    }
  }

  /**
   * 未コミット行のスキル選択に基づいて現在ターンをプレビューし、表示用の予測値を返す。
   * pending な先制OD がある場合は activateOverdrive 後の state でプレビューする。
   * state は変更しない。
   *
   * @param {Object<number, {skillId: number|null}>} slotActions position キー
   * @returns {{ odGaugeAfter: number, activatableInterrupt: number[] } | null}
   */
  previewCurrentTurn(slotActions = {}, options = {}) {
    const enemyCount = clampEnemyCount(
      options.enemyCount ?? this.currentState?.turnState?.enemyState?.enemyCount
    );
    let state = this.#cloneWorkingState(this.currentState);
    try {
      state = applyBeforeCommitOperations(
        state,
        this.#buildPendingBeforeCommitOperations(),
        {
          enemyCount,
          allowInsufficientOd: this.#validationPolicy.allowInsufficientOd,
        }
      );
    } catch {
      return null;
    }
    const effectiveEnemyCount = this.#resolveEffectiveEnemyCount(state, enemyCount);
    const actionOutcomeOverrides = this.#normalizeActionOutcomeOverridesForState(
      state,
      slotActions,
      options.actionOutcomeOverrides,
      effectiveEnemyCount
    );
    const followUpOverrides = this.#normalizeFollowUpOverridesForState(
      state,
      options.followUpOverrides,
      effectiveEnemyCount
    );

    return this.#previewResolvedTurn(
      state,
      slotActions,
      effectiveEnemyCount,
      actionOutcomeOverrides,
      followUpOverrides
    );
  }

  buildInputRowSnapshot({
    slotActions = {},
    enemyCount = null,
    actionOutcomeOverrides = [],
    followUpOverrides = [],
    overrideEntries = [],
  } = {}) {
    const warnings = [];
    const scenarioTurn = this.#buildScenarioTurnFromOverrideEntries(overrideEntries, warnings);
    const normalizedEnemyCount = clampEnemyCount(
      enemyCount ?? scenarioTurn.enemyCount ?? this.currentState?.turnState?.enemyState?.enemyCount
    );
    let stateBefore = this.#cloneWorkingState(this.currentState);
    try {
      this.#applyScenarioTurnPlayerOverrides(stateBefore, scenarioTurn);
      this.#applyScenarioTurnEnemyOverrides(stateBefore, scenarioTurn);
      stateBefore = applyBeforeCommitOperations(
        stateBefore,
        this.#buildPendingBeforeCommitOperations(),
        {
          enemyCount: normalizedEnemyCount,
          onWarning: (message) => warnings.push(String(message)),
        }
      );
    } catch {
      stateBefore = this.#cloneWorkingState(this.currentState);
    }
    const effectiveEnemyCount = this.#resolveEffectiveEnemyCount(stateBefore, normalizedEnemyCount);

    const resolvedSlotActions = this.#resolveInputRowSlotActions(
      stateBefore,
      slotActions,
      effectiveEnemyCount
    );
    const normalizedActionOutcomeOverrides = this.#normalizeActionOutcomeOverridesForState(
      stateBefore,
      resolvedSlotActions,
      actionOutcomeOverrides,
      effectiveEnemyCount,
      {
        onWarning: (message) => warnings.push(String(message)),
      }
    );
    const normalizedFollowUpOverrides = this.#normalizeFollowUpOverridesForState(
      stateBefore,
      followUpOverrides,
      effectiveEnemyCount
    );
    const preview = this.#previewResolvedTurn(
      stateBefore,
      resolvedSlotActions,
      effectiveEnemyCount,
      normalizedActionOutcomeOverrides,
      normalizedFollowUpOverrides,
      {
        warnings,
      }
    );

    return {
      stateBefore,
      stateAfter: preview?.projectedState ?? null,
      slotActions: resolvedSlotActions,
      odGaugeAfter: preview?.odGaugeAfter ?? null,
      previewResourceState: preview?.previewResourceState ?? { spAfterByPartyIndex: {} },
      previewActionFlow: preview?.previewActionFlow ?? [],
      activatablePreemptive: resolveActivatablePreemptiveOdLevels(stateBefore),
      activatableInterrupt: preview?.activatableInterrupt ?? [],
      operationState: {
        kishinkaStatus: this.getKishinkaStatus(),
        makaiKiheiStatus: this.getMakaiKiheiStatus(),
        allOutAttackStatus: this.getAllOutAttackStatus(),
      },
      warnings,
    };
  }

  /**
   * 先制OD の予約を設定/解除する。
   * null で解除。変更後は previewCurrentTurn を呼び直すこと。
   * @param {number|null} level
   */
  setPendingPreemptiveOd(level) {
    this.#pendingPreemptiveOdLevel = level != null ? Number(level) : null;
  }

  /**
   * 割込OD の予約を設定/解除する。
   * null で解除。
   * @param {number|null} level
   */
  setPendingInterruptOd(level) {
    this.#pendingInterruptOdLevel = level != null ? Number(level) : null;
  }

  addPendingSpecialOperation(operation) {
    const normalized = this.#normalizeReplayOperation(operation);
    if (!normalized) {
      return false;
    }
    if (normalized.type === REPLAY_OPERATION_TYPES.CHANGE_FORM) {
      return this.#upsertPendingFormChangeOperation(normalized);
    }
    if (normalized.type === REPLAY_OPERATION_TYPES.SET_ENEMY_E_SHIELD) {
      return this.#upsertPendingEnemyEShieldOperation(normalized);
    }
    const definition = replayOperationRegistry.get(normalized.type);
    if (definition?.allowMultiple === false) {
      const alreadyQueued = this.#pendingSpecialOperations.some((entry) => entry?.type === normalized.type);
      if (alreadyQueued) {
        return false;
      }
    }
    if (
      normalized.type === REPLAY_OPERATION_TYPES.ACTIVATE_KISHINKA &&
      !this.isKishinkaAvailable()
    ) {
      return false;
    }
    if (
      normalized.type === REPLAY_OPERATION_TYPES.ACTIVATE_MAKAI_KIHEI &&
      !this.getMakaiKiheiStatus().available
    ) {
      return false;
    }
    if (
      normalized.type === REPLAY_OPERATION_TYPES.ACTIVATE_ALL_OUT_ATTACK &&
      !this.getAllOutAttackStatus().available
    ) {
      return false;
    }
    this.#pendingSpecialOperations.push(normalized);
    return true;
  }

  removePendingSpecialOperation(index) {
    const numericIndex = Number(index);
    if (!Number.isInteger(numericIndex) || numericIndex < 0 || numericIndex >= this.#pendingSpecialOperations.length) {
      return false;
    }
    this.#pendingSpecialOperations.splice(numericIndex, 1);
    return true;
  }

  /**
   * 現在 state で鬼神化が発動可能かを返す。
   * 手塚咲がパーティにいて、鬼神化中でも行動不能中でもない場合に true。
   * @returns {boolean}
   */
  isKishinkaAvailable() {
    return canActivateKishinka(this.currentState);
  }

  /**
   * 鬼神化の UI 表示用ステータスを返す。
   * @returns {{ hasTezuka: boolean, available?: boolean, activePending?: boolean, isActive?: boolean, turnsRemaining?: number, actionDisabledTurns?: number }}
   */
  getKishinkaStatus() {
    const tezuka = this.currentState?.party?.find((m) => m.characterId === TEZUKA_CHARACTER_ID);
    if (!tezuka) return { hasTezuka: false };
    return {
      hasTezuka: true,
      available: this.isKishinkaAvailable(),
      activePending: this.#pendingSpecialOperations.some(
        (operation) => operation?.type === REPLAY_OPERATION_TYPES.ACTIVATE_KISHINKA
      ),
      isActive: Boolean(tezuka.isReinforcedMode),
      turnsRemaining: Number(tezuka.reinforcedTurnsRemaining ?? 0),
      actionDisabledTurns: Number(tezuka.actionDisabledTurns ?? 0),
    };
  }

  getMakaiKiheiStatus() {
    const availability = resolveMakaiKiheiAvailability(this.currentState);
    if (!availability.availableInState) {
      return {
        hasYamawaki: false,
        available: false,
        remainingUses: 0,
        pendingCount: 0,
        maxUses: MAKAI_KIHEI_MAX_USES,
      };
    }
    const committedCount = this.#countReplayOperations(
      this.#replayScript?.turns?.flatMap((turn) => turn?.operations ?? []) ?? [],
      REPLAY_OPERATION_TYPES.ACTIVATE_MAKAI_KIHEI
    );
    const pendingCount = this.#countReplayOperations(
      this.#pendingSpecialOperations,
      REPLAY_OPERATION_TYPES.ACTIVATE_MAKAI_KIHEI
    );
    const remainingUses = Math.max(
      0,
      MAKAI_KIHEI_MAX_USES - committedCount - pendingCount
    );
    return {
      hasYamawaki: availability.hasYamawaki,
      available: remainingUses > 0,
      remainingUses,
      pendingCount,
      maxUses: MAKAI_KIHEI_MAX_USES,
    };
  }

  getAllOutAttackStatus() {
    const availability = resolveAllOutAttackAvailability(this.currentState);
    const activePending = this.#pendingSpecialOperations.some(
      (operation) => operation?.type === REPLAY_OPERATION_TYPES.ACTIVATE_ALL_OUT_ATTACK
    );
    return {
      ...availability,
      activePending,
      available: availability.available && !activePending,
    };
  }

  /**
   * 現在 state で発動可能な先制OD レベル一覧を返す。
   * @returns {number[]} 発動可能なレベルのリスト（例: [1, 2]）
   */
  getActivatablePreemptiveOdLevels(enemyCount = null) {
    const state = applyBeforeCommitOperations(
      this.currentState,
      this.#pendingSpecialOperations,
      { enemyCount }
    );
    return resolveActivatablePreemptiveOdLevels(state);
  }

  /**
   * ターン・OD状態・追加状態の三軸を見て、OD発動が可能な文脈かどうかを判定する。
   *
   * (1) ターン種別 (turnType): 'normal' / 'od' / 'extra'
   * (2) OD状態: odSuspended（EX割込中でOD一時停止）/ odPending（EX後にOD発動予約）
   * (3) 追加状態: extraTurnState（EXターンの行動可能キャラ情報）
   *
   * 先制OD (canPreemptive): 通常ターンかつ OD/EX 文脈でない場合のみ可能
   * 割込OD (canInterrupt) : OD 文脈でなければ可能（単独EXターンは許可）
   *
   * @param {object} turnState
   * @returns {{ canPreemptive: boolean, canInterrupt: boolean }}
   */
  #getOdActivationStatus(turnState) {
    // (1) ターン種別
    const turnType = String(turnState?.turnType ?? '');
    const isOdTurn    = turnType === 'od';
    const isExtraTurn = turnType === 'extra';

    // (2) OD状態: 一時停止中（OD中のEX）/ 発動予約中（EX後にOD）
    const odSuspended = Boolean(turnState?.odSuspended);
    const odPending   = Boolean(turnState?.odPending);

    // (3) 追加状態: EXターンの行動許可情報が存在するか
    const hasExtraState = turnState?.extraTurnState != null;

    // OD文脈: 直接OD中 / OD一時停止中のEX / OD発動待機中のEX
    const inOdContext = isOdTurn || odSuspended || odPending;

    // 追加ターン文脈: turnType または extraTurnState で判定
    const inExtraContext = isExtraTurn || hasExtraState;

    return {
      canPreemptive: !inOdContext && !inExtraContext,
      canInterrupt:  !inOdContext,
    };
  }

  /**
   * 指定ターンのスロットを更新して recalculateFrom を実行する。
   * コミット済みターンの過去編集に使用。
   * @param {number} turnIndex
   * @param {number} position  0-5（前衛 0-2 のみ skillId が有効）
   * @param {{skillId: number|null, target?: object}} action
   */
  updateSlot(turnIndex, position, action) {
    const turn = this.#replayScript?.turns[turnIndex];
    if (!turn) return;
    turn.slots[position] = {
      ...turn.slots[position],
      skillId: action.skillId ?? null,
      ...(action.target != null ? { target: action.target } : {}),
    };
    this.recalculateFrom(turnIndex);
  }

  updateOperations(turnIndex, operations) {
    const turn = this.#replayScript?.turns[turnIndex];
    if (!turn) return;
    turn.operations = (Array.isArray(operations) ? operations : [])
      .map((operation) => this.#normalizeReplayOperation(operation))
      .filter(Boolean);
    this.recalculateFrom(turnIndex);
  }

  updateEnemyCount(turnIndex, enemyCount) {
    const turn = this.#replayScript?.turns[turnIndex];
    if (!turn) return;
    const normalizedEnemyCount = clampEnemyCount(enemyCount);
    this.#replaceReplayOverrideEntry(turn, REPLAY_OVERRIDE_ENTRY_TYPES.ENEMY_COUNT, normalizedEnemyCount);
    const stateBefore = this.getStateBefore(turnIndex);
    const slotActions = this.#slotActionsFromReplayTurn(turn);
    const actionOutcomeOverrides = this.#normalizeActionOutcomeOverridesForState(
      stateBefore,
      slotActions,
      this.#resolveReplayTurnActionOutcomeOverrides(turn, normalizedEnemyCount),
      normalizedEnemyCount
    );
    this.#replaceReplayTurnActionOutcomeOverrides(turn, actionOutcomeOverrides, normalizedEnemyCount);
    const followUpOverrides = this.#normalizeFollowUpOverridesForState(
      stateBefore,
      this.#resolveReplayTurnFollowUpOverrides(turn, normalizedEnemyCount),
      normalizedEnemyCount
    );
    this.#replaceReplayTurnFollowUpOverrides(turn, followUpOverrides, normalizedEnemyCount);
    this.recalculateFrom(turnIndex);
  }

  updateActionOutcomeOverrides(turnIndex, actionOutcomeOverrides) {
    const turn = this.#replayScript?.turns[turnIndex];
    if (!turn) return;
    const stateBefore = this.getStateBefore(turnIndex);
    const enemyCount = this.#resolveReplayTurnEnemyCount(turn, stateBefore);
    const slotActions = this.#slotActionsFromReplayTurn(turn);
    const normalized = this.#normalizeActionOutcomeOverridesForState(
      stateBefore,
      slotActions,
      actionOutcomeOverrides,
      enemyCount
    );
    this.#replaceReplayTurnActionOutcomeOverrides(turn, normalized, enemyCount);
    this.recalculateFrom(turnIndex);
  }

  updateFollowUpOverrides(turnIndex, followUpOverrides) {
    const turn = this.#replayScript?.turns[turnIndex];
    if (!turn) return;
    const stateBefore = this.getStateBefore(turnIndex);
    const enemyCount = this.#resolveReplayTurnEnemyCount(turn, stateBefore);
    const normalized = this.#normalizeFollowUpOverridesForState(
      stateBefore,
      followUpOverrides,
      enemyCount
    );
    this.#replaceReplayTurnFollowUpOverrides(turn, normalized, enemyCount);
    this.recalculateFrom(turnIndex);
  }

  getReplayTurn(turnIndex) {
    return this.#replayScript?.turns?.[turnIndex] ?? null;
  }

  getReplayDiagnostics() {
    return cloneReplayDiagnostics(this.#replayDiagnostics);
  }

  buildTurnEditDraft(turnIndex) {
    const turn = this.#replayScript?.turns?.[turnIndex] ?? null;
    if (!turn) {
      return null;
    }
    return structuredClone(this.#normalizeTurnEditDraft(turnIndex, {
      slots: turn.slots,
      operations: turn.operations,
      note: turn.note,
      enemyCount: this.#resolveReplayTurnEnemyCount(turn, this.#getBaseStateBefore(turnIndex)),
      actionOutcomeOverrides: this.#resolveReplayTurnActionOutcomeOverrides(
        turn,
        this.#resolveReplayTurnEnemyCount(turn, this.#getBaseStateBefore(turnIndex)),
        this.getStateBefore(turnIndex),
        this.#slotActionsFromReplayTurn(turn)
      ),
      followUpOverrides: this.#resolveReplayTurnFollowUpOverrides(
        turn,
        this.#resolveReplayTurnEnemyCount(turn, this.#getBaseStateBefore(turnIndex)),
        this.getStateBefore(turnIndex)
      ),
    }));
  }

  buildTurnEditSnapshot(turnIndex, draft = null) {
    const normalizedDraft = this.#normalizeTurnEditDraft(turnIndex, draft ?? this.buildTurnEditDraft(turnIndex));
    if (!normalizedDraft) {
      return null;
    }
    return this.#buildTurnEditSnapshotInternal(turnIndex, normalizedDraft);
  }

  replaceCommittedTurn(turnIndex, draft = null) {
    const normalizedDraft = this.#normalizeTurnEditDraft(turnIndex, draft);
    if (!normalizedDraft || !this.#replayScript?.turns?.[turnIndex]) {
      return null;
    }
    const draftWarnings = [];
    const draftStateBefore = this.#buildDraftStateBefore(
      turnIndex,
      normalizedDraft.slots,
      normalizedDraft.operations,
      normalizedDraft.enemyCount,
      draftWarnings,
      normalizedDraft.overrideEntries
    );
    const previousComputedStates = [...this.#computedStates];
    this.#replayScript.turns[turnIndex] = this.#buildReplayTurnFromDraft(normalizedDraft, draftStateBefore, turnIndex);
    this.#recalculateAllBestEffort({
      strictExtraTurnTurnIndexes: new Set([turnIndex]),
    });

    const compactionWarning = this.#compactStaleSpecialTurnsIfSafe(turnIndex, previousComputedStates);
    if (compactionWarning) {
      this.#recalculateAllBestEffort({
        strictExtraTurnTurnIndexes: new Set([turnIndex]),
      });
      this.#appendReplayWarnings(turnIndex, [compactionWarning]);
    }
    this.#appendReplayWarnings(turnIndex, draftWarnings);

    return this.#computedRecords[turnIndex] ?? null;
  }

  popLastCommittedTurnToDraft() {
    const lastIndex = this.committedTurnCount - 1;
    if (lastIndex < 0) {
      return null;
    }
    const draft = this.buildTurnEditDraft(lastIndex);
    if (!draft) {
      return null;
    }
    this.#replayScript.turns.pop();
    this.#computedStates.pop();
    this.#computedRecords.pop();
    this.#pendingPreemptiveOdLevel = null;
    this.#pendingInterruptOdLevel = null;
    this.#pendingSpecialOperations = [];
    this.#replayDiagnostics = createEmptyReplayDiagnostics();
    return {
      turnIndex: lastIndex,
      draft,
    };
  }

  /**
   * 未コミット行の入力対象となる現在 state でポジションを入れ替える。
   * D&D によるコミット前のパーティー順変更に使用。
   * @param {number} srcPosition
   * @param {number} dstPosition
   */
  swapCurrentPositions(srcPosition, dstPosition) {
    const state = this.currentState;
    if (!state?.party) return;
    const src = state.party.find((m) => m.position === srcPosition);
    const dst = state.party.find((m) => m.position === dstPosition);
    if (!src || !dst) return;
    src.position = dstPosition;
    dst.position = srcPosition;
  }

  /**
   * ターンのメモを更新する（再計算不要）。
   * @param {number} turnIndex
   * @param {string} note
   */
  updateNote(turnIndex, note) {
    const turn = this.#replayScript?.turns[turnIndex];
    if (turn) turn.note = String(note ?? '');
  }

  /**
   * 指定ターンのコミット済み行に渡す stateBefore を返す。
   * 鬼神化 operation（ACTIVATE_KISHINKA）がある場合は適用済み state を返す。
   * これにより、鬼神化後にコミットした SP0 スキルが再描画時も正しく選択状態を保持する。
   * @param {number} turnIndex 0始まりのターンインデックス
   * @returns {object} BattleState
   */
  getStateBefore(turnIndex) {
    const rawBefore = this.#getBaseStateBefore(turnIndex);
    const turn = this.#replayScript?.turns?.[turnIndex];

    const hasSlots = Array.isArray(turn?.slots) && turn.slots.some((s) => s?.styleId != null);
    const hasOperations = Array.isArray(turn?.operations) && turn.operations.length > 0;

    if (!rawBefore?.party) {
      return null;
    }

    if (!hasSlots && !hasOperations) {
      return this.#cloneWorkingState(rawBefore);
    }

    // party を clone して stored state を汚染しないよう独立させる。
    // #alignPositionsToSlots が position を書き換えるため、rawBefore をそのまま渡すと
    // computedStates / initialState が破壊される。
    let state = this.#cloneWorkingState(rawBefore);

    // turn.slots の styleId に基づいて各メンバーの position を復元する。
    // JSON 読み込み時は recalculateFrom がワーキングコピーにのみ alignPositionsToSlots を
    // 適用するため、computedStates にはスワップ前の positions が残ったままになる。
    // ここで同様の復元を行うことで、表示用 stateBefore がスワップ後の配置を正しく反映する。
    if (hasSlots) {
      this.#alignPositionsToSlots(state, turn);
    }

    const warnings = [];
    const scenarioTurn = this.#buildScenarioTurnFromOverrideEntries(turn?.overrideEntries ?? [], warnings);
    this.#applyScenarioTurnPlayerOverrides(state, scenarioTurn);
    this.#applyScenarioTurnEnemyOverrides(state, scenarioTurn);
    if (hasOperations) {
      try {
        const enemyCount = clampEnemyCount(
          scenarioTurn.enemyCount ?? state?.turnState?.enemyState?.enemyCount ?? DEFAULT_ENEMY_COUNT
        );
        state = applyBeforeCommitOperations(
          state,
          this.#filterScenarioManagedOperations(turn.operations),
          { enemyCount }
        );
      } catch {
        return state;
      }
    }

    return state;
  }

  // ---- private ----

  #getBaseStateBefore(turnIndex) {
    if (turnIndex === 0) {
      return this.#initialState;
    }
    const directState = this.#computedStates[turnIndex - 1];
    if (directState?.party) {
      return directState;
    }
    const latestState = this.#computedStates.at(-1);
    if (latestState?.party) {
      return latestState;
    }
    return this.#initialState;
  }

  #cloneWorkingState(sourceState) {
    if (!sourceState || typeof sourceState !== 'object') {
      return sourceState;
    }
    return {
      ...sourceState,
      party: Array.isArray(sourceState.party)
        ? sourceState.party.map((member) => member.clone())
        : [],
      turnState:
        sourceState.turnState && typeof sourceState.turnState === 'object'
          ? structuredClone(sourceState.turnState)
          : sourceState.turnState ?? null,
    };
  }

  #syncReplaySetupWithBaseState() {
    const baseSetup = this.#initialState?.turnPlanBaseSetup;
    if (!this.#replayScript || !baseSetup || typeof baseSetup !== 'object') {
      return;
    }
    this.#replayScript.setup = syncReplaySetupNormalAttackElements(
      this.#replayScript.setup,
      baseSetup.normalAttackElementsByPartyIndex ?? {}
    );
  }

  #buildScenarioEnemyOverrideSnapshot(scenarioTurn = {}) {
    return {
      ...(Object.prototype.hasOwnProperty.call(scenarioTurn, 'enemyCount')
        ? { enemyCount: scenarioTurn.enemyCount }
        : {}),
      ...(Object.prototype.hasOwnProperty.call(scenarioTurn, 'enemyNames')
        ? { enemyNames: scenarioTurn.enemyNames }
        : {}),
      ...(Object.prototype.hasOwnProperty.call(scenarioTurn, 'enemyDamageRates')
        ? { enemyDamageRates: scenarioTurn.enemyDamageRates }
        : {}),
      ...(Object.prototype.hasOwnProperty.call(scenarioTurn, 'enemyDestructionRates')
        ? { enemyDestructionRates: scenarioTurn.enemyDestructionRates }
        : {}),
      ...(Object.prototype.hasOwnProperty.call(scenarioTurn, 'enemyDestructionRateCaps')
        ? { enemyDestructionRateCaps: scenarioTurn.enemyDestructionRateCaps }
        : {}),
      ...(Object.prototype.hasOwnProperty.call(scenarioTurn, 'enemyDestructionMultipliers')
        ? { enemyDestructionMultipliers: scenarioTurn.enemyDestructionMultipliers }
        : {}),
      ...(Object.prototype.hasOwnProperty.call(scenarioTurn, 'enemyOdRates')
        ? { enemyOdRates: scenarioTurn.enemyOdRates }
        : {}),
      ...(Object.prototype.hasOwnProperty.call(scenarioTurn, 'enemyEShields')
        ? { enemyEShields: scenarioTurn.enemyEShields }
        : {}),
      ...(Object.prototype.hasOwnProperty.call(scenarioTurn, 'enemyExtraHpGauges')
        ? { enemyExtraHpGauges: scenarioTurn.enemyExtraHpGauges }
        : {}),
      ...(Object.prototype.hasOwnProperty.call(scenarioTurn, 'enemyAbsorbElements')
        ? { enemyAbsorbElements: scenarioTurn.enemyAbsorbElements }
        : {}),
      ...(Object.prototype.hasOwnProperty.call(scenarioTurn, 'enemyBreakStates')
        ? { enemyBreakStates: scenarioTurn.enemyBreakStates }
        : {}),
      ...(Object.prototype.hasOwnProperty.call(scenarioTurn, 'enemyStatuses')
        ? { enemyStatuses: scenarioTurn.enemyStatuses }
        : {}),
    };
  }

  #buildEnemyReplayOverrideEntriesFromSnapshots(snapshot = {}, baselineSnapshot = {}) {
    const entries = [];
    for (const [fieldName, type] of Object.entries(ENEMY_SNAPSHOT_OVERRIDE_FIELD_TO_TYPE)) {
      const hasSnapshotField = Object.prototype.hasOwnProperty.call(snapshot, fieldName);
      if (!hasSnapshotField) {
        continue;
      }
      const nextPayload = structuredClone(snapshot[fieldName]);
      const baselinePayload = Object.prototype.hasOwnProperty.call(baselineSnapshot, fieldName)
        ? baselineSnapshot[fieldName]
        : undefined;
      if (areDeepEqual(nextPayload, baselinePayload)) {
        continue;
      }
      entries.push({
        type,
        payload: nextPayload,
      });
    }
    return entries;
  }

  #buildTurnStartEnemyOverrideEntries(state) {
    const snapshot = buildEnemyStateOverrideSnapshot(state?.turnState);
    const baselineSnapshot = buildEnemyStateOverrideSnapshot(this.#initialState?.turnState);
    return this.#buildEnemyReplayOverrideEntriesFromSnapshots(snapshot, baselineSnapshot);
  }

  #applyScenarioTurnEnemyOverrides(state, scenarioTurn = {}) {
    if (!state?.turnState) {
      return state;
    }
    const snapshot = this.#buildScenarioEnemyOverrideSnapshot(scenarioTurn);
    if (Object.keys(snapshot).length === 0) {
      return state;
    }
    applyEnemyStateOverrideSnapshot(state.turnState, snapshot);
    return state;
  }

  #applyScenarioTurnPlayerOverrides(state, scenarioTurn = {}) {
    if (!state?.party || !isPlainObject(scenarioTurn?.dpStateByPartyIndex)) {
      return state;
    }
    for (const [partyIndexKey, dpState] of Object.entries(scenarioTurn.dpStateByPartyIndex)) {
      const partyIndex = Number(partyIndexKey);
      if (!Number.isInteger(partyIndex)) {
        continue;
      }
      const member = state.party.find((candidate) => Number(candidate?.partyIndex) === partyIndex);
      if (!member || !isPlainObject(dpState) || typeof member.setDpState !== 'function') {
        continue;
      }
      member.setDpState(structuredClone(dpState));
    }
    syncByakkoRushStateWithDpCondition(state);
    return state;
  }

  #buildScenarioTurnFromOverrideEntries(overrideEntries = [], warnings = []) {
    return applyReplayOverrideEntriesToScenarioTurn(overrideEntries, {}, warnings);
  }

  #resolveEffectiveEnemyCount(state, fallback = DEFAULT_ENEMY_COUNT) {
    return clampEnemyCount(
      state?.turnState?.enemyState?.enemyCount ?? fallback
    );
  }

  #filterReplayOverrideEntries(baseOverrideEntries = [], excludedTypes = new Set()) {
    return (Array.isArray(baseOverrideEntries) ? baseOverrideEntries : [])
      .filter((entry) => !excludedTypes.has(String(entry?.type ?? '')))
      .map((entry) => structuredClone(entry));
  }

  #filterScenarioManagedOperations(operations = []) {
    return (Array.isArray(operations) ? operations : [])
      .filter((operation) => !SCENARIO_SNAPSHOT_ONLY_OPERATION_TYPES.has(String(operation?.type ?? '')))
      .map((operation) => structuredClone(operation));
  }

  #filterSnapshotOnlyOperations(operations = []) {
    return (Array.isArray(operations) ? operations : [])
      .filter((operation) => SCENARIO_SNAPSHOT_ONLY_OPERATION_TYPES.has(String(operation?.type ?? '')))
      .map((operation) => structuredClone(operation));
  }

  #applySnapshotOnlyOperationsForReplay(state, operations = [], enemyCount = DEFAULT_ENEMY_COUNT, warnings = []) {
    const snapshotOnlyOperations = this.#filterSnapshotOnlyOperations(operations);
    if (snapshotOnlyOperations.length === 0) {
      return this.#cloneWorkingState(state);
    }
    return applyBeforeCommitOperations(
      this.#cloneWorkingState(state),
      snapshotOnlyOperations,
      {
        enemyCount,
        allowInsufficientOd: this.#validationPolicy.allowInsufficientOd,
        onWarning: (message) => warnings.push(String(message)),
      }
    );
  }

  #mergeReplayTurnOverrideEntries(
    baseOverrideEntries = [],
    enemyCount,
    enemyOverrideEntries = []
  ) {
    const preservedEntries = this.#filterReplayOverrideEntries(
      baseOverrideEntries,
      new Set([
        REPLAY_OVERRIDE_ENTRY_TYPES.ENEMY_COUNT,
        ...ENEMY_SNAPSHOT_OVERRIDE_TYPES,
      ])
    );
    const nextOverrideEntries = [
      {
        type: REPLAY_OVERRIDE_ENTRY_TYPES.ENEMY_COUNT,
        payload: clampEnemyCount(enemyCount),
      },
      ...(Array.isArray(enemyOverrideEntries) ? enemyOverrideEntries.map((entry) => structuredClone(entry)) : []),
      ...preservedEntries,
    ];
    return nextOverrideEntries;
  }

  #buildReplayTurnFromDraft(draft, stateBefore, turnIndex = 0) {
    const effectiveEnemyCount = this.#resolveEffectiveEnemyCount(stateBefore, draft.enemyCount);
    const operationFreeStateBefore = this.#buildDraftStateBefore(
      turnIndex,
      draft.slots,
      [],
      null,
      [],
      draft.overrideEntries
    );
    const replayEnemySnapshotState = this.#applySnapshotOnlyOperationsForReplay(
      operationFreeStateBefore,
      draft.operations,
      draft.enemyCount
    );
    const enemyOverrideEntries = this.#buildTurnStartEnemyOverrideEntries(replayEnemySnapshotState);
    return normalizeLightweightReplayTurn({
      turn: draft.turn,
      slots: draft.slots,
      operations: draft.operations,
      note: draft.note,
      actionOutcomeOverrides: draft.actionOutcomeOverrides,
      followUpOverrides: draft.followUpOverrides,
      overrideEntries: this.#mergeReplayTurnOverrideEntries(
        draft.overrideEntries,
        effectiveEnemyCount,
        enemyOverrideEntries
      ),
    });
  }

  #normalizeTurnEditDraft(turnIndex, draft = null) {
    const sourceTurn = this.#replayScript?.turns?.[turnIndex] ?? null;
    if (!sourceTurn && !draft) {
      return null;
    }
    const normalizedTurn = normalizeLightweightReplayTurn({
      turn: draft?.turn ?? sourceTurn?.turn ?? turnIndex + 1,
      slots: draft?.slots ?? sourceTurn?.slots ?? [],
      operations: draft?.operations ?? sourceTurn?.operations ?? [],
      note: draft?.note ?? sourceTurn?.note ?? '',
    });
    const baseState = this.#getBaseStateBefore(turnIndex);
    const preservedOverrideEntries = this.#filterReplayOverrideEntries(
      draft?.overrideEntries ?? sourceTurn?.overrideEntries ?? [],
      TURN_EDIT_PRESERVED_OVERRIDE_EXCLUDED_TYPES
    );
    const seededEnemyCount = clampEnemyCount(
      draft?.enemyCount ?? this.#resolveReplayTurnEnemyCount(sourceTurn ?? normalizedTurn, baseState)
    );
    const stateBefore = this.#buildDraftStateBefore(
      turnIndex,
      normalizedTurn.slots,
      normalizedTurn.operations,
      seededEnemyCount,
      [],
      preservedOverrideEntries
    );
    const enemyCount = seededEnemyCount;
    const slotActions = this.#slotActionsFromReplaySlots(normalizedTurn.slots);
    const actionOutcomeOverrides = this.#normalizeActionOutcomeOverridesForState(
      stateBefore,
      slotActions,
      draft?.actionOutcomeOverrides ??
        this.#resolveReplayTurnActionOutcomeOverrides(
          sourceTurn ?? normalizedTurn,
          enemyCount,
          stateBefore,
          slotActions
        ),
      enemyCount
    );
    const followUpOverrides = this.#normalizeFollowUpOverridesForState(
      stateBefore,
      draft?.followUpOverrides ??
        this.#resolveReplayTurnFollowUpOverrides(sourceTurn ?? normalizedTurn, enemyCount, stateBefore),
      enemyCount
    );
    return {
      turn: normalizedTurn.turn,
      slots: normalizedTurn.slots,
      operations: normalizedTurn.operations,
      note: normalizedTurn.note,
      overrideEntries: preservedOverrideEntries,
      enemyCount,
      actionOutcomeOverrides,
      followUpOverrides,
    };
  }

  #buildDraftStateBefore(
    turnIndex,
    slots = [],
    operations = [],
    enemyCount = null,
    warnings = [],
    overrideEntries = []
  ) {
    const rawBefore = this.#getBaseStateBefore(turnIndex);
    if (!rawBefore?.party) {
      throw new Error(`Turn state before ${turnIndex + 1} is not available.`);
    }
    let state = this.#cloneWorkingState(rawBefore);
    this.#alignPositionsToSlots(state, { slots });
    const scenarioTurn = this.#buildScenarioTurnFromOverrideEntries(overrideEntries, warnings);
    this.#applyScenarioTurnPlayerOverrides(state, scenarioTurn);
    this.#applyScenarioTurnEnemyOverrides(state, scenarioTurn);
    return applyBeforeCommitOperations(state, operations, {
      enemyCount,
      allowInsufficientOd: this.#validationPolicy.allowInsufficientOd,
      onWarning: (message) => warnings.push(String(message)),
    });
  }

  #buildTurnEditSnapshotInternal(turnIndex, draft) {
    const warnings = [];
    const stateBefore = this.#buildDraftStateBefore(
      turnIndex,
      draft.slots,
      draft.operations,
      draft.enemyCount,
      warnings,
      draft.overrideEntries
    );
    const slotActions = this.#slotActionsFromReplaySlots(draft.slots);
    const actionOutcomeOverrides = this.#normalizeActionOutcomeOverridesForState(
      stateBefore,
      slotActions,
      draft.actionOutcomeOverrides,
      draft.enemyCount,
      {
        onWarning: (message) => warnings.push(String(message)),
      }
    );
    const followUpOverrides = this.#normalizeFollowUpOverridesForState(
      stateBefore,
      draft.followUpOverrides,
      draft.enemyCount
    );
    const preview = this.#previewResolvedTurn(
      stateBefore,
      slotActions,
      draft.enemyCount,
      actionOutcomeOverrides,
      followUpOverrides,
      {
        warnings,
      }
    );
    return {
      draft: structuredClone({
        ...draft,
        actionOutcomeOverrides,
        followUpOverrides,
      }),
      stateBefore,
      stateAfter: preview?.projectedState ?? null,
      previewResourceState: preview?.previewResourceState ?? { spAfterByPartyIndex: {} },
      previewActionFlow: preview?.previewActionFlow ?? [],
      odState: {
        preemptiveOdLevel: this.#extractOperationLevel(
          draft.operations,
          REPLAY_OPERATION_TYPES.ACTIVATE_PREEMPTIVE_OD
        ),
        interruptOdLevel: this.#extractOperationLevel(
          draft.operations,
          REPLAY_OPERATION_TYPES.RESERVE_INTERRUPT_OD
        ),
        activatablePreemptive: resolveActivatablePreemptiveOdLevels(stateBefore),
        activatableInterrupt: preview?.activatableInterrupt ?? [],
      },
      operationState: this.#buildTurnEditOperationState(turnIndex, draft.operations, stateBefore),
      warnings,
    };
  }

  #buildTurnEditOperationState(turnIndex, operations = [], stateBefore) {
    const tezuka = stateBefore?.party?.find((member) => member.characterId === TEZUKA_CHARACTER_ID) ?? null;
    const kishinkaPending = (Array.isArray(operations) ? operations : []).some(
      (operation) => operation?.type === REPLAY_OPERATION_TYPES.ACTIVATE_KISHINKA
    );
    const availability = resolveMakaiKiheiAvailability(stateBefore);
    const committedCount = this.#countReplayOperationsExcludingTurn(
      turnIndex,
      REPLAY_OPERATION_TYPES.ACTIVATE_MAKAI_KIHEI
    );
    const pendingCount = this.#countReplayOperations(operations, REPLAY_OPERATION_TYPES.ACTIVATE_MAKAI_KIHEI);
    const remainingUses = Math.max(
      0,
      MAKAI_KIHEI_MAX_USES - committedCount - pendingCount
    );
    const allOutAttackPending = (Array.isArray(operations) ? operations : []).some(
      (operation) => operation?.type === REPLAY_OPERATION_TYPES.ACTIVATE_ALL_OUT_ATTACK
    );
    const allOutAttackAvailability = resolveAllOutAttackAvailability(stateBefore);
    return {
      kishinkaStatus: tezuka
        ? {
            hasTezuka: true,
            available: canActivateKishinka(stateBefore) && !kishinkaPending,
            activePending: kishinkaPending,
            isActive: Boolean(tezuka.isReinforcedMode),
            turnsRemaining: Number(tezuka.reinforcedTurnsRemaining ?? 0),
            actionDisabledTurns: Number(tezuka.actionDisabledTurns ?? 0),
          }
        : { hasTezuka: false },
      makaiKiheiStatus: {
        hasYamawaki: availability.hasYamawaki,
        available: Boolean(availability.availableInState) && remainingUses > 0,
        remainingUses,
        pendingCount,
        maxUses: MAKAI_KIHEI_MAX_USES,
      },
      allOutAttackStatus: {
        ...allOutAttackAvailability,
        activePending: allOutAttackPending,
        available: allOutAttackAvailability.available && !allOutAttackPending,
      },
    };
  }

  #countReplayOperationsExcludingTurn(turnIndex, type) {
    return (this.#replayScript?.turns ?? [])
      .filter((_, index) => index !== turnIndex)
      .reduce((sum, turn) => sum + this.#countReplayOperations(turn?.operations ?? [], type), 0);
  }

  #recalculateAllBestEffort(options = {}) {
    this.#computedStates = [];
    this.#computedRecords = [];
    this.#pendingPreemptiveOdLevel = null;
    this.#pendingInterruptOdLevel = null;
    this.#pendingSpecialOperations = [];
    this.#replayDiagnostics = createEmptyReplayDiagnostics();

    if (!this.#initialState?.party || !this.#replayScript) {
      return this.#replayDiagnostics;
    }

    let state = this.#cloneWorkingState(this.#initialState);
    const strictExtraTurnTurnIndexes =
      options.strictExtraTurnTurnIndexes instanceof Set
        ? options.strictExtraTurnTurnIndexes
        : new Set();
    for (let i = 0; i < this.#replayScript.turns.length; i += 1) {
      const result = this.#replayTurnBestEffort(i, state, {
        strictExtraTurnActors: strictExtraTurnTurnIndexes.has(i),
      });
      this.#replayDiagnostics.turnWarnings[i] = result.warnings;
      if (result.error) {
        this.#computedStates.push(state);
        this.#computedRecords.push(null);
        this.#replayDiagnostics.error = result.error;
        break;
      }
      this.#computedStates.push(result.nextState);
      this.#computedRecords.push(result.committedRecord);
      state = result.nextState;
      this.#replayDiagnostics.appliedTurnCount = i + 1;
    }

    return this.#replayDiagnostics;
  }

  #replayTurnBestEffort(turnIndex, incomingState, options = {}) {
    const warnings = [];
    const turn = this.#replayScript?.turns?.[turnIndex] ?? null;
    if (!turn) {
      return {
        warnings,
        error: { index: turnIndex, message: `ReplayScript turn not found: ${turnIndex + 1}` },
      };
    }

    let state = this.#cloneWorkingState(incomingState);
    const scenarioTurn = this.#buildScenarioTurnFromOverrideEntries(turn.overrideEntries ?? [], warnings);

    try {
      this.#alignPositionsToSlots(state, turn);
      this.#applyScenarioTurnPlayerOverrides(state, scenarioTurn);
      this.#applyScenarioTurnEnemyOverrides(state, scenarioTurn);
      const enemyCount = clampEnemyCount(
        scenarioTurn.enemyCount ?? state?.turnState?.enemyState?.enemyCount ?? DEFAULT_ENEMY_COUNT
      );
      state = applyBeforeCommitOperations(state, this.#filterScenarioManagedOperations(turn.operations), {
        enemyCount,
        allowInsufficientOd: this.#validationPolicy.allowInsufficientOd,
        onWarning: (message) => warnings.push(String(message)),
      });
      const effectiveEnemyCount = this.#resolveEffectiveEnemyCount(state, enemyCount);

      const interruptLevel = this.#extractOperationLevel(
        turn.operations,
        REPLAY_OPERATION_TYPES.RESERVE_INTERRUPT_OD
      );
      if (interruptLevel != null && !this.#getOdActivationStatus(state.turnState).canInterrupt) {
        throw new Error('Interrupt OD cannot be activated in current OD context.');
      }

      let slotActions = this.#slotActionsFromReplayTurn(turn);
      if (!options.strictExtraTurnActors) {
        slotActions = this.#sanitizeReplayTurnExtraActors(turn, state, slotActions);
      }
      const actionOutcomeOverrides = this.#resolveReplayTurnActionOutcomeOverrides(
        turn,
        effectiveEnemyCount,
        state,
        slotActions,
        {
          onWarning: (message) => warnings.push(String(message)),
        }
      );
      const replayFollowUpOverrides = this.#resolveReplayTurnFollowUpOverrides(
        turn,
        effectiveEnemyCount,
        state
      );
      const automaticFollowUpOverrides = this.#resolveAutomaticFollowUpOverrides(
        state,
        slotActions,
        effectiveEnemyCount
      );
      const manualFollowUpOverrides = this.#subtractAutomaticFollowUpOverrides(
        replayFollowUpOverrides,
        automaticFollowUpOverrides,
        effectiveEnemyCount
      );
      const followUpOverrides = this.#mergeFollowUpOverrides(
        manualFollowUpOverrides,
        automaticFollowUpOverrides,
        effectiveEnemyCount
      );
      this.#replaceReplayTurnActionOutcomeOverrides(turn, actionOutcomeOverrides, effectiveEnemyCount);
      this.#replaceReplayTurnFollowUpOverrides(turn, followUpOverrides, effectiveEnemyCount);

      const actions = this.#buildActionsDict(
        state,
        slotActions,
        actionOutcomeOverrides,
        manualFollowUpOverrides,
        automaticFollowUpOverrides
      );
      const previewRecord = previewTurnRecord(state, actions, null, effectiveEnemyCount, {
        allowUseCountOverflow: this.#validationPolicy.allowUseCountOverflow,
        allowSkillConditionMismatch: this.#validationPolicy.allowSkillConditionMismatch,
        onWarning: (message) => warnings.push(String(message)),
      });
      this.#appendPreviewResourceWarnings(previewRecord, warnings);
      this.#enrichPreviewRecordWithDpDamage(state, previewRecord);

      const odGaugeAfter = Number(previewRecord?.projections?.odGaugeAtEnd ?? state.turnState?.odGauge ?? 0);
      const requiredInterruptGauge = interruptLevel != null ? getOdGaugeRequirement(interruptLevel) : 0;
      const forceInterruptOd =
        interruptLevel != null &&
        odGaugeAfter < requiredInterruptGauge &&
        this.#validationPolicy.allowInsufficientOd;
      if (forceInterruptOd) {
        warnings.push(
          `insufficient OD allowed: OD${interruptLevel} requires ${requiredInterruptGauge}% gauge. current=${odGaugeAfter.toFixed(2)}%`
        );
      }

      const { nextState, committedRecord } = commitTurnRecord(state, previewRecord, [], {
        interruptOdLevel: interruptLevel ?? 0,
        forceOdActivation: forceInterruptOd,
        forceResourceDeficit: forceInterruptOd,
        enemyAttackTargetCharacterIds: scenarioTurn.enemyAttackTargetCharacterIds ?? [],
      });
      return {
        warnings,
        nextState: this.#patchNextStateForKills(nextState, actionOutcomeOverrides, effectiveEnemyCount),
        committedRecord,
      };
    } catch (error) {
      return {
        warnings,
        error: {
          index: turnIndex,
          message: String(error?.message ?? error ?? ''),
        },
      };
    }
  }

  #appendPreviewResourceWarnings(previewRecord, warnings = []) {
    for (const action of previewRecord?.actions ?? []) {
      const insufficientSpWarning = String(action?.insufficientSpWarning ?? '').trim();
      const endSP = Number(action?.endSP);
      const spCost = Number(action?.spCost ?? 0);
      const hasSpGreaterOrEqualZeroCondition = Boolean(action?.hasSpGreaterOrEqualZeroCondition);
      
      // insufficientSpWarning がある場合、その内容から判断
      if (insufficientSpWarning) {
        // 通常スキル（SP不足）: "requires SP >= N (normal skill)" → warning 出力（使用許可）
        if (insufficientSpWarning.includes('(normal skill)')) {
          warnings.push(`insufficient SP allowed: ${insufficientSpWarning}`);
          continue;
        }
        // Sp()>=0 条件またはShredding中（SP < 0）: "requires SP >= 0 (Sp()>=0 condition or Shredding)" 
        // → warning 出力なし（使用許可、仕様通り）
        if (insufficientSpWarning.includes('(Sp()>=0 condition or Shredding)')) {
          // warning なし、ただしオプション確認
          if (!this.#validationPolicy.allowInsufficientSp) {
            throw new Error(`Skill ${action?.skillId ?? '?'} requires SP >= 0 under special condition.`);
          }
          // warning なしで使用許可
          continue;
        }
      }

      // 古い形式のデータ（insufficientSpWarning なし）でも処理
      // endSP < 0 の場合、新しい形式で warning を出力
      if (!Number.isFinite(endSP) || endSP >= 0) {
        continue;
      }
      
      if (!this.#validationPolicy.allowInsufficientSp) {
        throw new Error(`Skill ${action?.skillId ?? '?'} requires more SP than available.`);
      }
      
      // insufficientSpWarning がない場合は、hasSpGreaterOrEqualZeroCondition フィールドを使用して warning を判定
      if (!insufficientSpWarning) {
        // sp_cost > 0 のみ warning 対象
        if (spCost <= 0) {
          continue;
        }
        
        // Sp()>=0 条件付きスキルは warning なし
        if (hasSpGreaterOrEqualZeroCondition) {
          continue;
        }
        
        // 通常スキルとして warning を出力
        const startSP = Number(action?.startSP ?? 0);
        warnings.push(`insufficient SP allowed: Skill ${action?.skillId ?? '?'} requires SP >= ${Math.abs(spCost)} (normal skill). current=${startSP}`);
      } else {
        // 従来の形式（古い JSON との互換性）
        warnings.push(`negative SP allowed: ${action?.characterId ?? 'unknown'} endSP=${endSP}`);
      }
    }
  }

  #countSpecialContinuation(states = [], turnIndex) {
    let count = 0;
    for (let i = turnIndex; i < states.length; i += 1) {
      const turnType = String(states[i]?.turnState?.turnType ?? '');
      if (turnType !== 'od' && turnType !== 'extra') {
        break;
      }
      count += 1;
    }
    return count;
  }

  #compactStaleSpecialTurnsIfSafe(turnIndex, previousComputedStates = []) {
    const oldContinuationCount = this.#countSpecialContinuation(previousComputedStates, turnIndex);
    if (oldContinuationCount === 0) {
      return null;
    }
    const newContinuationCount = this.#countSpecialContinuation(this.#computedStates, turnIndex);
    if (newContinuationCount !== 0) {
      return null;
    }
    const currentTurnType = String(this.#computedStates[turnIndex]?.turnState?.turnType ?? '');
    if (currentTurnType !== 'normal') {
      return null;
    }
    const dropCount = oldContinuationCount - newContinuationCount;
    if (dropCount <= 0) {
      return null;
    }
    const removedTurns = this.#replayScript.turns.splice(turnIndex + 1, dropCount);
    if (removedTurns.length === 0) {
      return null;
    }
    return `stale special turns compacted: removed ${removedTurns.length} turn(s) after T${turnIndex + 1}`;
  }

  #normalizeReplayOperation(operation = {}) {
    if (!operation || typeof operation !== 'object') {
      return null;
    }
    const type = String(operation.type ?? '').trim();
    if (!type) {
      return null;
    }
    const definition = replayOperationRegistry.get(type);
    if (!definition) {
      return null;
    }
    const normalized = { type };
    const payload = operation.payload && typeof operation.payload === 'object'
      ? structuredClone(operation.payload)
      : {};
    if (typeof definition.normalizePayload === 'function') {
      const normalizedPayload = definition.normalizePayload(payload);
      if (normalizedPayload == null) {
        return null;
      }
      if (Array.isArray(normalizedPayload) ? normalizedPayload.length > 0 : Object.keys(normalizedPayload).length > 0) {
        normalized.payload = structuredClone(normalizedPayload);
      }
      return normalized;
    }
    if (Object.keys(payload).length > 0) {
      normalized.payload = payload;
    }
    return normalized;
  }

  #upsertPendingFormChangeOperation(normalized) {
    const characterId = String(normalized?.payload?.characterId ?? '').trim();
    const formKey = String(normalized?.payload?.formKey ?? '').trim();
    if (!characterId || !formKey) {
      return false;
    }
    const member = this.currentState?.party?.find(
      (entry) => String(entry?.characterId ?? '') === characterId
    ) ?? null;
    if (!member?.hasFormChange?.()) {
      return false;
    }
    const existingIndex = this.#pendingSpecialOperations.findIndex(
      (entry) =>
        String(entry?.type ?? '') === REPLAY_OPERATION_TYPES.CHANGE_FORM &&
        String(entry?.payload?.characterId ?? '') === characterId
    );
    const currentFormKey = String(member?.getCurrentFormKey?.() ?? '').trim();
    if (formKey === currentFormKey) {
      if (existingIndex >= 0) {
        this.#pendingSpecialOperations.splice(existingIndex, 1);
        return true;
      }
      return false;
    }
    if (existingIndex >= 0) {
      this.#pendingSpecialOperations.splice(existingIndex, 1, normalized);
      return true;
    }
    this.#pendingSpecialOperations.push(normalized);
    return true;
  }

  #upsertPendingEnemyEShieldOperation(normalized) {
    const targetEnemyIndex = Number(normalized?.payload?.targetEnemyIndex);
    if (!Number.isInteger(targetEnemyIndex) || targetEnemyIndex < 0) {
      return false;
    }
    const existingIndex = this.#pendingSpecialOperations.findIndex(
      (entry) =>
        String(entry?.type ?? '') === REPLAY_OPERATION_TYPES.SET_ENEMY_E_SHIELD &&
        Number(entry?.payload?.targetEnemyIndex) === targetEnemyIndex
    );
    if (existingIndex >= 0) {
      this.#pendingSpecialOperations.splice(existingIndex, 1, normalized);
      return true;
    }
    this.#pendingSpecialOperations.push(normalized);
    return true;
  }

  #buildPendingBeforeCommitOperations() {
    const operations = this.#pendingSpecialOperations.map((operation) => structuredClone(operation));
    if (this.#pendingPreemptiveOdLevel != null) {
      operations.push({
        type: REPLAY_OPERATION_TYPES.ACTIVATE_PREEMPTIVE_OD,
        payload: { level: this.#pendingPreemptiveOdLevel },
      });
    }
    return operations;
  }

  #buildCommittedOperations() {
    const operations = this.#buildPendingBeforeCommitOperations();
    if (this.#pendingInterruptOdLevel != null) {
      operations.push({
        type: REPLAY_OPERATION_TYPES.RESERVE_INTERRUPT_OD,
        payload: { level: this.#pendingInterruptOdLevel },
      });
    }
    return operations;
  }

  #buildAttackerInputForMember(member) {
    const role = String(member?.role ?? 'Attacker');
    const limitBreakCount = Number(member?.limitBreakLevel ?? 0);
    const stats =
      normalizeCharacterStats(member?.stats)
      ?? resolveStatsWithSupport(resolveDefaultStats(role, limitBreakCount), member?.supportStats);
    return { role, limitBreakCount, ...stats };
  }

  /**
   * previewRecord.actions に per-hit DP/HPダメージ（ガイド導出値）を付与する。
   *
   * damageContext は commit 計算内でのみ構築されるため、クローン状態への probe commit で取得する。
   * 計算データ未設定・対象ゲージ敵なし・probe 失敗時は何もせず従来挙動を維持する。
   * 付与値は派生値であり、replayScript（保存JSON）には書き込まれない。
   * DP（perHitDpDamageByEnemy: 破壊率乗算除外）と HP（perHitHpDamageByEnemy: 破壊率乗算）を
   * 同一 probe から導出することで、probe commit のコストを1回に抑える。
   */
  #enrichPreviewRecordWithDpDamage(state, previewRecord) {
    const data = this.#damageCalculationData;
    const actions = previewRecord?.actions;
    if (!data || !Array.isArray(actions) || actions.length === 0) {
      return;
    }
    const enemyDpByEnemy = state?.turnState?.enemyState?.enemyDpByEnemy ?? {};
    const enemyHpByEnemy = state?.turnState?.enemyState?.enemyHpByEnemy ?? {};
    const hasDpGauge = Object.values(enemyDpByEnemy).some((value) => Number(value) > 0);
    const hasHpTracking = Object.values(enemyHpByEnemy).some((value) => Number(value) > 0);
    if (!hasDpGauge && !hasHpTracking) {
      return;
    }
    let probeActions = null;
    try {
      const probe = commitTurnRecord(
        this.#cloneWorkingState(state),
        structuredClone(previewRecord),
        [],
        { interruptOdLevel: 0 }
      );
      probeActions = probe?.committedRecord?.actions ?? null;
    } catch {
      return;
    }
    if (!Array.isArray(probeActions)) {
      return;
    }
    for (let i = 0; i < actions.length; i++) {
      const action = actions[i];
      // 明示的に指定済みの perHit*DamageByEnemy は尊重する
      if (!action || (action.perHitDpDamageByEnemy && action.perHitHpDamageByEnemy)) {
        continue;
      }
      const probeAction = probeActions[i];
      if (
        !probeAction?.damageContext ||
        String(probeAction.characterId ?? '') !== String(action.characterId ?? '') ||
        Number(probeAction.skillId ?? 0) !== Number(action.skillId ?? 0)
      ) {
        continue;
      }
      const member = (state?.party ?? []).find(
        (candidate) => String(candidate?.characterId ?? '') === String(action.characterId ?? '')
      );
      if (!member) {
        continue;
      }
      const attackerInput = this.#buildAttackerInputForMember(member);
      const hitCount = Number(probeAction.skillHitCount ?? 0) || null;
      if (hasDpGauge && !action.perHitDpDamageByEnemy) {
        const perHitDpDamageByEnemy = resolvePerHitDpDamageByEnemy({
          damageContext: probeAction.damageContext,
          attackerInput,
          enemyDpByEnemy,
          hitCount,
          data,
        });
        if (perHitDpDamageByEnemy) {
          action.perHitDpDamageByEnemy = perHitDpDamageByEnemy;
        }
      }
      if (hasHpTracking && !action.perHitHpDamageByEnemy) {
        const perHitHpDamageByEnemy = resolvePerHitHpDamageByEnemy({
          damageContext: probeAction.damageContext,
          attackerInput,
          enemyHpByEnemy,
          hitCount,
          data,
        });
        if (perHitHpDamageByEnemy) {
          action.perHitHpDamageByEnemy = perHitHpDamageByEnemy;
        }
      }
    }
  }

  #previewResolvedTurn(
    state,
    slotActions = {},
    enemyCount,
    actionOutcomeOverrides = [],
    followUpOverrides = [],
    options = {}
  ) {
    const warnings = Array.isArray(options.warnings) ? options.warnings : [];
    const automaticFollowUpOverrides = this.#resolveAutomaticFollowUpOverrides(
      state,
      slotActions,
      enemyCount
    );
    const actions = this.#buildActionsDict(
      state,
      slotActions,
      actionOutcomeOverrides,
      followUpOverrides,
      automaticFollowUpOverrides
    );
    try {
      const previewRecord = previewTurnRecord(state, actions, null, enemyCount, {
        allowUseCountOverflow: this.#validationPolicy.allowUseCountOverflow,
        allowSkillConditionMismatch: this.#validationPolicy.allowSkillConditionMismatch,
        onWarning: (message) => warnings.push(String(message)),
      });
      this.#enrichPreviewRecordWithDpDamage(state, previewRecord);
      let previewActionFlowRecord = previewRecord;
      let projectedState = null;
      try {
        // previewTurnRecord だけでは action の状態変化イベントが不足するため、
        // クローン状態で commit 相当の計算を行い、表示用イベントを取得する。
        const committedPreview = commitTurnRecord(
          this.#cloneWorkingState(state),
          previewRecord,
          [],
          {
            interruptOdLevel: 0,
          }
        );
        if (committedPreview?.record) {
          previewActionFlowRecord = committedPreview.record;
        }
        if (committedPreview?.nextState) {
          projectedState = committedPreview.nextState;
        }
      } catch {
        // preview 表示に必要な action flow 生成が失敗した場合は、
        // 既存 previewRecord をフォールバックとして使用する。
      }
      this.#appendPreviewResourceWarnings(previewRecord, warnings);
      const odGaugeAfter = Number(previewRecord.projections?.odGaugeAtEnd ?? state.turnState?.odGauge ?? 0);
      const { canInterrupt } = this.#getOdActivationStatus(state.turnState);
      const activatableInterrupt = canInterrupt
        ? [1, 2, 3].filter((level) => odGaugeAfter >= getOdGaugeRequirement(level))
        : [];
      return {
        odGaugeAfter,
        activatableInterrupt,
        projectedState,
        previewResourceState: this.#buildPreviewResourceState(previewRecord),
        previewActionFlow: this.#buildPreviewActionFlow(previewActionFlowRecord),
      };
    } catch {
      return null;
    }
  }

  #buildPreviewActionFlow(previewRecord) {
    return buildActionFlowFromRecord(previewRecord);
  }

  #buildPreviewResourceState(previewRecord) {
    // snapBefore からターン開始SPを取得し、cost delta のみ加算して表示用SPを算出する。
    // projections.spAfterActionByPartyIndex は HealSp 等の効果反映済み値を含むため
    // プレビュー表示には使用しない（実機では「ターン開始SP − スキルコスト」で表示される）。
    const snapBefore = Array.isArray(previewRecord?.snapBefore) ? previewRecord.snapBefore : [];
    const turnStartSpByPartyIndex = {};
    for (const snap of snapBefore) {
      const pi = Number(snap?.partyIndex);
      const sp = Number(snap?.sp?.current);
      if (Number.isInteger(pi) && Number.isFinite(sp)) {
        turnStartSpByPartyIndex[pi] = sp;
      }
    }

    // 行動キャラのコストデルタを集計
    const costDeltaByPartyIndex = {};
    for (const action of previewRecord?.actions ?? []) {
      const pi = Number(action?.partyIndex);
      if (!Number.isInteger(pi)) continue;
      const costDelta = Array.isArray(action?.spChanges)
        ? action.spChanges
            .filter((c) => c?.source === 'cost' && Number.isFinite(Number(c?.delta)))
            .reduce((sum, c) => sum + Number(c.delta), 0)
        : 0;
      costDeltaByPartyIndex[pi] = (costDeltaByPartyIndex[pi] ?? 0) + costDelta;
    }

    const spAfterByPartyIndex = {};
    for (const [piStr, turnStartSp] of Object.entries(turnStartSpByPartyIndex)) {
      const pi = Number(piStr);
      const delta = costDeltaByPartyIndex[pi] ?? 0;
      spAfterByPartyIndex[pi] = turnStartSp + delta;
    }
    return { spAfterByPartyIndex };
  }

  #resolveInputRowSlotActions(state, slotActions = {}) {
    const resolvedSlotActions = {};
    for (const [slotKey, action] of Object.entries(slotActions)) {
      if (!action || action.skillId == null) {
        continue;
      }
      const partyIndex = Number(action.partyIndex ?? slotKey);
      const position = Number(action.position);
      const member = Number.isFinite(partyIndex)
        ? state?.party?.find((item) => Number(item?.partyIndex) === partyIndex) ?? null
        : Number.isFinite(position)
          ? state?.party?.find((item) => Number(item?.position) === position) ?? null
          : null;
      if (!member || member.position > 2) {
        continue;
      }
      resolvedSlotActions[member.position] = {
        skillId: action.skillId,
        styleId: member.styleId ?? action.styleId ?? null,
        target: normalizeTurnReplayTarget(action.target),
      };
    }
    return resolvedSlotActions;
  }

  #countReplayOperations(operations = [], type) {
    return (Array.isArray(operations) ? operations : []).filter(
      (operation) => String(operation?.type ?? '') === String(type)
    ).length;
  }

  /**
   * GUI の slotActions（position キー）を previewTurn 用 actions dict に変換する。
   * action.styleId が指定されている場合は styleId でメンバーを検索する。
   */
  #buildActionsDict(
    state,
    slotActions,
    actionOutcomeOverrides = [],
    followUpOverrides = [],
    automaticFollowUpOverrides = []
  ) {
    const actions = {};
    const normalizedEnemyCount = clampEnemyCount(
      state?.turnState?.enemyState?.enemyCount ?? DEFAULT_ENEMY_COUNT
    );
    const normalizedActionOutcomeOverrides = this.#normalizeActionOutcomeOverridesForState(
      state,
      slotActions,
      actionOutcomeOverrides,
      normalizedEnemyCount
    );
    const normalizedFollowUpOverrides = this.#normalizeFollowUpOverridesForState(
      state,
      followUpOverrides,
      normalizedEnemyCount
    );
    const normalizedAutomaticFollowUpOverrides = this.#normalizeFollowUpOverridesForState(
      state,
      automaticFollowUpOverrides,
      normalizedEnemyCount
    ).map((override) => ({
      ...override,
      triggerSource: AUTOMATIC_FOLLOW_UP_TRIGGER_SOURCE,
    }));
    const pursuitSourceByBackPosition = new Map();
    const transformedPursuitUsedBackPositions = new Set();
    const frontActionPositions = [];
    for (const override of [...normalizedFollowUpOverrides, ...normalizedAutomaticFollowUpOverrides]) {
      const backPosition = Number(override?.position);
      if (!Number.isInteger(backPosition) || backPosition < BACK_POSITION_MIN || backPosition > BACK_POSITION_MAX) {
        continue;
      }
      const backMember = state.party.find((candidate) => Number(candidate?.position) === backPosition);
      if (!backMember) {
        continue;
      }
      pursuitSourceByBackPosition.set(backPosition, resolvePursuitSourceForMember(backMember, state));
    }
    for (const [posStr, action] of Object.entries(slotActions)) {
      const slotPosition = Number(posStr);
      if (!Number.isFinite(slotPosition) || action?.skillId == null) {
        continue;
      }
      const member = action.styleId != null
        ? state.party.find((candidate) => candidate.styleId === action.styleId)
        : state.party.find((candidate) => candidate.position === slotPosition);
      if (!member || member.position > FRONT_POSITION_MAX) {
        continue;
      }
      frontActionPositions.push(Number(member.position));
    }
    const singleExtraActionFollowUpOverride =
      String(state?.turnState?.turnType ?? '') === 'extra' &&
      frontActionPositions.length === FOLLOW_UP_MAX_TRIGGERS_PER_ACTION
        ? (
            // HBR の追撃は EX 非対象の後衛でも発動しうるため、
            // 単独 EX 行動では列固定ではなく、その唯一の行動へ追撃を載せる。
            normalizedFollowUpOverrides.find(
              (override) => Number(override?.position) === frontActionPositions[0] + 3
            ) ??
            normalizedFollowUpOverrides[0] ??
            null
          )
        : null;
    for (const [posStr, action] of Object.entries(slotActions)) {
      const slotPosition = Number(posStr);
      if (!Number.isFinite(slotPosition)) continue;
      if (action?.skillId == null) continue;

      const member = action.styleId != null
        ? state.party.find((m) => m.styleId === action.styleId)
        : state.party.find((m) => m.position === slotPosition);
      if (!member) {
        throw new Error(`No member resolved for action at position ${slotPosition}.`);
      }

      // 後衛にいるメンバーはスキルを使えない
      if (member.position > FRONT_POSITION_MAX) {
        throw new Error(`Action is allowed only for front positions (0..2). got=${member.position}`);
      }

      // EX ターン: allowedCharacterIds に含まれないメンバーのアクションは除外する
      if (state.turnState?.turnType === 'extra') {
        const allowed = state.turnState.extraTurnState?.allowedCharacterIds ?? [];
        if (!allowed.includes(member.characterId)) {
          throw new Error(`Character ${member.characterId} is not allowed to act in extra turn.`);
        }
      }
      const skill = member.getSkill(action.skillId);
      if (!skill) {
        throw new Error(`Skill ${action.skillId} is not available for ${member.characterId}`);
      }

      let materializedTarget = this.#materializeActionTarget(state, action.target);
      if (this.#isEnemySingleTargetSkill(state, member, skill)) {
        materializedTarget = {
          ...materializedTarget,
          targetEnemyIndex: this.#normalizeSingleTargetEnemyIndex(
            materializedTarget?.targetEnemyIndex,
            normalizedEnemyCount,
            state
          ),
        };
      }
      const breakEnemyIndexes = getBreakEnemyIndexesForPosition(
        normalizedActionOutcomeOverrides,
        member.position
      );
      const hpBreakEnemyIndexesForMember = getHpBreakEnemyIndexesForPosition(
        normalizedActionOutcomeOverrides,
        member.position
      );
      const killEnemyIndexesForMember = getKillEnemyIndexesForPosition(
        normalizedActionOutcomeOverrides,
        member.position
      );
      const resolvedFollowUpOverride =
        singleExtraActionFollowUpOverride && frontActionPositions[0] === Number(member.position)
          ? {
              ...singleExtraActionFollowUpOverride,
              triggerSource: FOLLOW_UP_TRIGGER_SOURCE_MANUAL,
            }
          : normalizedFollowUpOverrides.find(
              (override) => Number(override?.position) === Number(member.position) + 3
            ) != null
            ? {
                ...normalizedFollowUpOverrides.find(
                  (override) => Number(override?.position) === Number(member.position) + 3
                ),
                triggerSource: FOLLOW_UP_TRIGGER_SOURCE_MANUAL,
              }
            : normalizedAutomaticFollowUpOverrides.find((override) =>
                this.#isAutomaticFollowUpEligibleForAction(state, member, skill, action, override)
              ) ?? null;

      // 追撃は前衛行動とは独立して管理し、後衛側の追撃定義のみから hit 数を解決する。
      let resolvedPursuedHitCount = 0;
      const followUpEnemyIndex =
        resolvedFollowUpOverride != null &&
        String(resolvedFollowUpOverride.triggerSource ?? '') === AUTOMATIC_FOLLOW_UP_TRIGGER_SOURCE &&
        Number.isFinite(Number(materializedTarget?.targetEnemyIndex))
          ? Number(materializedTarget.targetEnemyIndex)
          : (resolvedFollowUpOverride != null ? Number(resolvedFollowUpOverride.enemyIndex) : null);
      const followUpSourceMember =
        resolvedFollowUpOverride != null
          ? state.party.find(
              (candidate) => Number(candidate?.position) === Number(resolvedFollowUpOverride.position)
            ) ?? null
          : null;
      const followUpSourcePosition = Number(resolvedFollowUpOverride?.position);
      let pursuitSource = followUpSourceMember
        ? pursuitSourceByBackPosition.get(followUpSourcePosition) ?? resolvePursuitSourceForMember(followUpSourceMember, state)
        : null;
      if (
        pursuitSource &&
        transformedPursuitUsedBackPositions.has(followUpSourcePosition) &&
        String(pursuitSource?.skill?.name ?? '') === PURSUIT_TRANSFORMED_SKILL_NAME
      ) {
        pursuitSource = resolveNormalPursuitSourceForMember(followUpSourceMember);
      }
      const followUpSourceSkill = pursuitSource?.skill ?? null;
      if (followUpEnemyIndex !== null && followUpEnemyIndex !== undefined) {
        resolvedPursuedHitCount = Number(pursuitSource?.hitCount ?? 1);
      }
      if (String(followUpSourceSkill?.name ?? '') === PURSUIT_TRANSFORMED_SKILL_NAME) {
        transformedPursuitUsedBackPositions.add(followUpSourcePosition);
      }

      actions[member.position] = {
        skillId: action.skillId,
        ...materializedTarget,
        ...(breakEnemyIndexes.length > 0
          ? {
              breakHitCount: breakEnemyIndexes.length,
              manualBreakEnemyIndexes: breakEnemyIndexes,
            }
          : {}),
        ...(hpBreakEnemyIndexesForMember.length > 0
          ? {
              hpBreakCount: hpBreakEnemyIndexesForMember.length,
              manualHpBreakEnemyIndexes: [...hpBreakEnemyIndexesForMember],
            }
          : {}),
        ...(killEnemyIndexesForMember.length > 0 ? { killCount: killEnemyIndexesForMember.length } : {}),
        ...(killEnemyIndexesForMember.length > 0
          ? {
              manualKillEnemyIndexes: [...killEnemyIndexesForMember],
            }
          : {}),
        ...(resolvedPursuedHitCount > 0
          ? {
              pursuedHitCount: resolvedPursuedHitCount,
              pursuedTargetEnemyIndex: Number(followUpEnemyIndex),
              pursuitSourceCharacterId: String(followUpSourceMember?.characterId ?? ''),
              pursuitSourcePosition: Number(resolvedFollowUpOverride.position),
              pursuitSourceSkillId: Number(followUpSourceSkill?.skillId ?? followUpSourceSkill?.id ?? 0),
              pursuitSourceSkillName: String(followUpSourceSkill?.name ?? '追撃'),
              pursuitSourceSpCost: Math.max(0, Number(pursuitSource?.spCost ?? 0)),
              pursuitTriggerSource: String(resolvedFollowUpOverride.triggerSource ?? FOLLOW_UP_TRIGGER_SOURCE_MANUAL),
            }
          : {}),
      };
    }
    return actions;
  }

  /** ReplayTurn の slots から slotActions を復元する。styleId も保持して再計算時の検索に使う */
  #slotActionsFromReplayTurn(replayTurn) {
    const slotActions = {};
    replayTurn.slots.forEach((slot, position) => {
      if (slot?.skillId != null) {
        slotActions[position] = {
          skillId: slot.skillId,
          styleId: slot.styleId ?? null,
          target: normalizeTurnReplayTarget(slot.target),
        };
      }
    });
    return slotActions;
  }

  #slotActionsFromReplaySlots(slots = []) {
    return this.#slotActionsFromReplayTurn({ slots });
  }

  #sanitizeReplayTurnExtraActors(turn, state, slotActions = {}) {
    if (state?.turnState?.turnType !== 'extra') {
      return slotActions;
    }
    const allowed = new Set(state?.turnState?.extraTurnState?.allowedCharacterIds ?? []);
    if (allowed.size === 0) {
      return slotActions;
    }
    const sanitizedActions = {};
    for (const [positionKey, action] of Object.entries(slotActions)) {
      const slotPosition = Number(positionKey);
      const member = action?.styleId != null
        ? state.party.find((item) => item.styleId === action.styleId)
        : state.party.find((item) => item.position === slotPosition);
      if (member && !allowed.has(member.characterId)) {
        const currentSlot = turn?.slots?.[slotPosition] ?? {};
        turn.slots[slotPosition] = {
          styleId: currentSlot.styleId ?? member.styleId ?? null,
          skillId: null,
        };
        continue;
      }
      sanitizedActions[positionKey] = action;
    }
    return sanitizedActions;
  }

  /** commit 時点の state + slotActions から LightweightReplayTurn を生成する */
  #buildReplayTurn(
    state,
    slotActions,
    note = '',
    operations = [],
    enemyCount = DEFAULT_ENEMY_COUNT,
    actionOutcomeOverrides = [],
    followUpOverrides = [],
    baseOverrideEntries = [],
    options = {}
  ) {
    const slots = Array.from({ length: 6 }, (_, position) => {
      const member = state.party.find((m) => m.position === position);
      const action = slotActions[position];
      return {
        styleId: member?.styleId ?? null,
        skillId: action?.skillId ?? null,
        ...(action?.target != null ? { target: action.target } : {}),
      };
    });
    const normalizedEnemyCount = clampEnemyCount(enemyCount);
    const enemyOverrideEntries = this.#buildTurnStartEnemyOverrideEntries(options.enemyOverrideState ?? state);
    const normalizedActionOutcomeOverrides = this.#normalizeActionOutcomeOverridesForState(
      state,
      slotActions,
      actionOutcomeOverrides,
      normalizedEnemyCount
    );
    const sequentialTurnNumber = (this.#replayScript?.turns?.length ?? 0) + 1;
    return normalizeLightweightReplayTurn({
      turn: sequentialTurnNumber,
      slots,
      note,
      operations,
      actionOutcomeOverrides: normalizedActionOutcomeOverrides,
      followUpOverrides,
      overrideEntries: this.#mergeReplayTurnOverrideEntries(
        baseOverrideEntries,
        normalizedEnemyCount,
        enemyOverrideEntries
      ),
    });
  }

  #resolveReplayTurnEnemyCount(replayTurn, state) {
    const scenarioTurn = this.#buildScenarioTurnFromOverrideEntries(replayTurn?.overrideEntries ?? [], []);
    return clampEnemyCount(
      scenarioTurn.enemyCount ?? state?.turnState?.enemyState?.enemyCount ?? DEFAULT_ENEMY_COUNT
    );
  }

  #patchNextStateForKills(nextState, actionOutcomeOverrides, turnEnemyCount) {
    if (!nextState?.turnState?.enemyState) {
      return nextState;
    }
    const current = clampEnemyCount(
      nextState.turnState.enemyState.enemyCount ?? DEFAULT_ENEMY_COUNT
    );
    const allDefeated = current > 0 && countAliveEnemies(nextState.turnState) === 0;
    return {
      ...nextState,
      turnState: {
        ...nextState.turnState,
        enemyState: {
          ...nextState.turnState.enemyState,
          allEnemiesDefeated: allDefeated,
        },
      },
    };
  }

  #resolveReplayTurnActionOutcomeOverrides(replayTurn, enemyCount, state = null, slotActions = null, options = {}) {
    const normalized = getActionOutcomeOverridesFromReplayTurn(replayTurn, enemyCount);
    if (!state || !slotActions) {
      return normalized;
    }
    return this.#normalizeActionOutcomeOverridesForState(
      state,
      slotActions,
      normalized,
      enemyCount,
      options
    );
  }

  #resolveReplayTurnFollowUpOverrides(replayTurn, enemyCount, state = null) {
    const normalized = getFollowUpOverridesFromReplayTurn(replayTurn, enemyCount);
    if (!state) {
      return normalized;
    }
    return this.#normalizeFollowUpOverridesForState(state, normalized, enemyCount);
  }

  #replaceReplayTurnActionOutcomeOverrides(turn, overrides, enemyCount) {
    if (!turn || typeof turn !== 'object') {
      return;
    }
    turn.actionOutcomeOverrides = normalizeActionOutcomeOverrides(overrides, enemyCount);
    this.#replaceReplayOverrideEntry(turn, REPLAY_OVERRIDE_ENTRY_TYPES.ACTION_OUTCOME_OVERRIDES, null);
  }

  #replaceReplayTurnFollowUpOverrides(turn, overrides, enemyCount) {
    if (!turn || typeof turn !== 'object') {
      return;
    }
    turn.followUpOverrides = normalizeFollowUpOverrides(overrides, enemyCount);
    this.#replaceReplayOverrideEntry(turn, REPLAY_OVERRIDE_ENTRY_TYPES.FOLLOW_UP_OVERRIDES, null);
  }

  #replaceReplayOverrideEntry(turn, type, payload) {
    const nextOverrideEntries = (Array.isArray(turn?.overrideEntries) ? turn.overrideEntries : [])
      .filter((entry) => String(entry?.type ?? '') !== String(type))
      .map((entry) => structuredClone(entry));
    const hasPayload =
      payload !== null &&
      payload !== undefined &&
      (!Array.isArray(payload) || payload.length > 0);
    if (hasPayload) {
      nextOverrideEntries.push({
        type,
        payload: structuredClone(payload),
      });
    }
    turn.overrideEntries = nextOverrideEntries;
  }

  #materializeActionTarget(state, target) {
    const normalizedTarget = normalizeTurnReplayTarget(target);
    if (normalizedTarget.type === 'enemy') {
      const enemyIndex = Number(normalizedTarget.enemyIndex);
      if (Number.isFinite(enemyIndex) && enemyIndex >= 0) {
        return { targetEnemyIndex: enemyIndex };
      }
      return {};
    }
    if (normalizedTarget.type === 'ally') {
      const styleId = Number(normalizedTarget.styleId);
      if (Number.isFinite(styleId)) {
        const targetMember =
          state?.party?.find((member) => Number(member?.styleId) === styleId) ?? null;
        if (targetMember?.characterId) {
          return { targetCharacterId: String(targetMember.characterId) };
        }
      }
      const characterId = String(normalizedTarget.characterId ?? '').trim();
      if (characterId) {
        const targetMember =
          state?.party?.find((member) => String(member?.characterId) === characterId) ?? null;
        if (targetMember?.characterId) {
          return { targetCharacterId: String(targetMember.characterId) };
        }
      }
    }
    return {};
  }

  #isEnemySingleTargetSkill(state, member, skill) {
    let effectiveSkill = skill;
    try {
      effectiveSkill = resolveEffectiveSkillForAction(state, member, skill) ?? skill;
    } catch {
      effectiveSkill = skill;
    }
    const skillTargetType = String(
      effectiveSkill?.targetType ?? effectiveSkill?.target_type ?? skill?.targetType ?? skill?.target_type ?? ''
    ).trim();
    const effectiveParts = Array.isArray(effectiveSkill?.parts) ? effectiveSkill.parts : [];
    if (effectiveParts.some((part) =>
      ENEMY_ALL_TARGET_TYPES.has(String(part?.target_type ?? skillTargetType).trim())
    )) {
      return false;
    }
    if (effectiveParts.some((part) =>
      ENEMY_SINGLE_TARGET_TYPES.has(String(part?.target_type ?? skillTargetType).trim())
    )) {
      return true;
    }
    return ENEMY_SINGLE_TARGET_TYPES.has(skillTargetType);
  }

  #normalizeSingleTargetEnemyIndex(targetEnemyIndex, enemyCount, state = null) {
    const normalizedEnemyCount = clampEnemyCount(enemyCount);
    const numericTargetEnemyIndex = Number(targetEnemyIndex);
    if (
      Number.isInteger(numericTargetEnemyIndex) &&
      numericTargetEnemyIndex >= 0 &&
      numericTargetEnemyIndex < normalizedEnemyCount &&
      (!state || isEnemyAlive(state?.turnState, numericTargetEnemyIndex))
    ) {
      return numericTargetEnemyIndex;
    }
    if (state?.turnState) {
      for (let enemyIndex = 0; enemyIndex < normalizedEnemyCount; enemyIndex += 1) {
        if (isEnemyAlive(state.turnState, enemyIndex)) {
          return enemyIndex;
        }
      }
    }
    return 0;
  }

  #normalizeActionOutcomeOverridesForState(
    state,
    slotActions = {},
    actionOutcomeOverrides = [],
    enemyCount,
    options = {}
  ) {
    const normalizedEnemyCount = clampEnemyCount(
      enemyCount ?? state?.turnState?.enemyState?.enemyCount ?? DEFAULT_ENEMY_COUNT
    );
    const onWarning = typeof options.onWarning === 'function' ? options.onWarning : null;
    const normalizedOverrides = normalizeActionOutcomeOverrides(
      actionOutcomeOverrides,
      normalizedEnemyCount
    );
    if (normalizedOverrides.length === 0) {
      return [];
    }

    const nextOverrides = [];
    const pendingBreakOverrides = [];
    const pendingHpBreakOverrides = [];
    for (const override of normalizedOverrides) {
      const position = Number(override?.position);
      if (!Number.isInteger(position)) {
        continue;
      }
      const aliveEnemyIndexes = override.enemyIndexes.filter((enemyIndex) =>
        isEnemyAlive(state?.turnState, enemyIndex)
      );
      if (aliveEnemyIndexes.length === 0) {
        continue;
      }

      if (
        override.outcome === ACTION_OUTCOME_TYPES.KILL ||
        override.outcome === ACTION_OUTCOME_TYPES.HP_BREAK
      ) {
        const eligibleEnemyIndexes = aliveEnemyIndexes.filter((enemyIndex) => {
          const extraHpGaugeState =
            state?.turnState?.enemyState?.extraHpGaugeStateByEnemy?.[String(enemyIndex)] ?? null;
          const canHpBreakEnemy = canEnemyHpBreak(extraHpGaugeState);
          return override.outcome === ACTION_OUTCOME_TYPES.HP_BREAK
            ? canHpBreakEnemy
            : !canHpBreakEnemy;
        });
        if (eligibleEnemyIndexes.length === 0) {
          continue;
        }
        if (override.outcome === ACTION_OUTCOME_TYPES.HP_BREAK) {
          pendingHpBreakOverrides.push({
            position,
            enemyIndexes: eligibleEnemyIndexes,
          });
          continue;
        }
        nextOverrides.push({
          ...override,
          enemyIndexes: eligibleEnemyIndexes,
        });
        continue;
      }

      const action = slotActions?.[position];
      if (!action || action.skillId == null) {
        continue;
      }
      const member = action.styleId != null
        ? state?.party?.find((candidate) => candidate.styleId === action.styleId) ?? null
        : state?.party?.find((candidate) => candidate.position === position) ?? null;
      if (!member) {
        continue;
      }
      const skill = member.getSkill(action.skillId);
      if (!skill) {
        continue;
      }

      let effectiveSkill = skill;
      try {
        effectiveSkill = resolveEffectiveSkillForAction(state, member, skill) ?? skill;
      } catch {
        effectiveSkill = skill;
      }
      const breakAttributionMode = resolveTurnBreakAttributionMode({ skill, effectiveSkill });
      if (breakAttributionMode === TURN_BREAK_ATTRIBUTION_MODES.NONE) {
        continue;
      }
      if (breakAttributionMode === TURN_BREAK_ATTRIBUTION_MODES.ALL) {
        pendingBreakOverrides.push({
          position,
          enemyIndexes: [...aliveEnemyIndexes],
          skill,
        });
        continue;
      }
      if (aliveEnemyIndexes.length === 0) {
        continue;
      }
      const materializedTarget = this.#materializeActionTarget(state, action.target);
      const normalizedEnemyIndex = this.#normalizeSingleTargetEnemyIndex(
        materializedTarget?.targetEnemyIndex,
        normalizedEnemyCount,
        state
      );
      if (
        aliveEnemyIndexes.length > 0 &&
        !aliveEnemyIndexes.includes(normalizedEnemyIndex)
      ) {
        onWarning?.(
          `manual break target normalized at position ${position}: ${aliveEnemyIndexes.join(',')} -> ${normalizedEnemyIndex}`
        );
      }
      pendingBreakOverrides.push({
        position,
        enemyIndexes: [normalizedEnemyIndex],
        skill,
      });
    }

    const claimedBreakEnemyIndexes = new Set();
    for (const override of sortTurnActionExecutionEntries(pendingBreakOverrides)) {
      const duplicateEnemyIndexes = override.enemyIndexes.filter((enemyIndex) =>
        claimedBreakEnemyIndexes.has(enemyIndex)
      );
      if (duplicateEnemyIndexes.length > 0) {
        onWarning?.(
          `duplicate manual break removed at position ${override.position}: ${formatEnemySlotLabels(duplicateEnemyIndexes)}`
        );
      }
      const availableEnemyIndexes = override.enemyIndexes.filter((enemyIndex) =>
        !claimedBreakEnemyIndexes.has(enemyIndex)
      );
      if (availableEnemyIndexes.length === 0) {
        continue;
      }
      availableEnemyIndexes.forEach((enemyIndex) => claimedBreakEnemyIndexes.add(enemyIndex));
      nextOverrides.push({
        position: override.position,
        outcome: ACTION_OUTCOME_TYPES.BREAK,
        enemyIndexes: availableEnemyIndexes,
      });
    }

    const sortedHpBreakOverrides = sortTurnActionExecutionEntries(pendingHpBreakOverrides);
    const firstHpBreakOverride = sortedHpBreakOverrides[0] ?? null;
    if (firstHpBreakOverride) {
      nextOverrides.push({
        position: firstHpBreakOverride.position,
        outcome: ACTION_OUTCOME_TYPES.HP_BREAK,
        enemyIndexes: [...firstHpBreakOverride.enemyIndexes],
      });
    }
    if (sortedHpBreakOverrides.length > 1) {
      const droppedPositions = sortedHpBreakOverrides
        .slice(1)
        .map((override) => Number(override.position) + 1)
        .filter((position) => Number.isInteger(position));
      if (droppedPositions.length > 0) {
        onWarning?.(`manual HP break removed for later actors: P${droppedPositions.join(', P')}`);
      }
    }

    return normalizeActionOutcomeOverrides(nextOverrides, normalizedEnemyCount);
  }

  #normalizeFollowUpOverridesForState(state, followUpOverrides = [], enemyCount) {
    const normalizedEnemyCount = clampEnemyCount(
      enemyCount ?? state?.turnState?.enemyState?.enemyCount ?? DEFAULT_ENEMY_COUNT
    );
    const normalized = normalizeFollowUpOverrides(followUpOverrides, normalizedEnemyCount);
    if (normalized.length === 0) {
      return [];
    }
    const next = [];
    for (const override of normalized) {
      const position = Number(override?.position);
      if (!Number.isInteger(position) || position < 3 || position > 5) {
        continue;
      }
      const member = state?.party?.find((candidate) => Number(candidate?.position) === position) ?? null;
      if (!member) {
        continue;
      }
      if (!isEnemyAlive(state?.turnState, override.enemyIndex)) {
        continue;
      }
      next.push({
        position,
        enemyIndex: Number(override.enemyIndex),
      });
    }
    return normalizeFollowUpOverrides(next, normalizedEnemyCount);
  }

  #mergeFollowUpOverrides(manualFollowUpOverrides = [], automaticFollowUpOverrides = [], enemyCount = DEFAULT_ENEMY_COUNT) {
    const normalizedEnemyCount = clampEnemyCount(enemyCount);
    return normalizeFollowUpOverrides(
      [...manualFollowUpOverrides, ...automaticFollowUpOverrides],
      normalizedEnemyCount
    );
  }

  #subtractAutomaticFollowUpOverrides(
    followUpOverrides = [],
    automaticFollowUpOverrides = [],
    enemyCount = DEFAULT_ENEMY_COUNT
  ) {
    const normalizedEnemyCount = clampEnemyCount(enemyCount);
    const automaticKeys = new Set(
      normalizeFollowUpOverrides(automaticFollowUpOverrides, normalizedEnemyCount)
        .map((override) => `${Number(override.position)}:${Number(override.enemyIndex)}`)
    );
    return normalizeFollowUpOverrides(followUpOverrides, normalizedEnemyCount).filter(
      (override) => !automaticKeys.has(`${Number(override.position)}:${Number(override.enemyIndex)}`)
    );
  }

  #resolveAutomaticFollowUpOverrides(state, slotActions = {}, enemyCount = DEFAULT_ENEMY_COUNT) {
    const normalizedEnemyCount = clampEnemyCount(
      enemyCount ?? state?.turnState?.enemyState?.enemyCount ?? DEFAULT_ENEMY_COUNT
    );
    const sources = (state?.party ?? [])
      .filter((member) => {
        const position = Number(member?.position);
        return (
          Number.isInteger(position) &&
          position >= BACK_POSITION_MIN &&
          position <= BACK_POSITION_MAX &&
          hasAutomaticFollowUpPassive(member)
        );
      })
      .sort((a, b) => Number(a.position) - Number(b.position));
    if (sources.length === 0) {
      return [];
    }

    const hasEligibleAction = sources.some((source) =>
      Object.entries(slotActions ?? {}).some(([positionKey, action]) => {
        if (action?.skillId == null) {
          return false;
        }
        const slotPosition = Number(positionKey);
        const member = action.styleId != null
          ? state.party.find((candidate) => candidate.styleId === action.styleId)
          : state.party.find((candidate) => Number(candidate.position) === slotPosition);
        const actor = member ?? state.party.find((candidate) => Number(candidate?.position) === slotPosition);
        if (!actor || Number(actor.position) > FRONT_POSITION_MAX) {
          return false;
        }
        const skill = actor.getSkill(action.skillId);
        return this.#isAutomaticFollowUpEligibleForAction(state, actor, skill, action, {
          position: Number(source.position),
          enemyIndex: 0,
        });
      })
    );
    if (!hasEligibleAction) {
      return [];
    }

    const enemyIndex = this.#resolveDefaultFollowUpEnemyIndex(state, normalizedEnemyCount);
    return this.#normalizeFollowUpOverridesForState(
      state,
      sources.map((source) => ({
        position: Number(source.position),
        enemyIndex,
      })),
      normalizedEnemyCount
    );
  }

  #resolveDefaultFollowUpEnemyIndex(state, enemyCount = DEFAULT_ENEMY_COUNT) {
    const normalizedEnemyCount = clampEnemyCount(enemyCount);
    for (let enemyIndex = 0; enemyIndex < normalizedEnemyCount; enemyIndex += 1) {
      if (isEnemyAlive(state?.turnState, enemyIndex)) {
        return enemyIndex;
      }
    }
    return 0;
  }

  #isAutomaticFollowUpEligibleForAction(state, member, skill, action, override) {
    if (!override || !member || !skill) {
      return false;
    }
    if (!skillHasAttackPart(skill)) {
      return false;
    }
    const sourceMember = state?.party?.find(
      (candidate) => Number(candidate?.position) === Number(override.position)
    ) ?? null;
    if (!sourceMember || !hasAutomaticFollowUpPassive(sourceMember)) {
      return false;
    }
    const effectiveSkill = resolveEffectiveSkillForAction(state, member, skill);
    const consumeSp = resolveSkillPreviewCost(member, effectiveSkill);
    if (!Number.isFinite(consumeSp)) {
      return false;
    }
    const triggerPassives = getAutomaticFollowUpPassives(sourceMember);
    const hasMatchingPassive = triggerPassives.some((passive) =>
      evaluateAutomaticFollowUpPassiveCondition(passive, state, member, effectiveSkill, action, consumeSp)
    );
    if (!hasMatchingPassive) {
      return false;
    }
    const targetEnemyIndex = Number(action?.target?.enemyIndex ?? action?.targetEnemyIndex ?? override.enemyIndex);
    return isEnemyAlive(state?.turnState, Number.isFinite(targetEnemyIndex) ? targetEnemyIndex : override.enemyIndex);
  }

  /**
   * ReplayTurn の operations から特定タイプの OD レベルを取り出す。
   * @param {Array} operations
   * @param {string} type REPLAY_OPERATION_TYPES の値
   * @returns {number|null}
   */
  #extractOperationLevel(operations, type) {
    if (!Array.isArray(operations)) return null;
    const op = operations.find((o) => o?.type === type);
    if (!op) return null;
    const level = Number(op.payload?.level ?? op.level);
    return Number.isFinite(level) && level >= 1 && level <= 3 ? level : null;
  }

  /**
   * replayTurn.slots[i].styleId に基づいて state.party の各メンバーの position を復元する。
   * D&D ポジション変更を recalculateFrom で正確に再現するために使用する。
   * commitTurnRecord が party を deep copy するため、この mutation は次のターン以降の state に影響しない。
   * @param {object} state BattleState（作業用コピー）
   * @param {object} replayTurn LightweightReplayTurn
   */
  #alignPositionsToSlots(state, replayTurn) {
    for (let i = 0; i < replayTurn.slots.length; i++) {
      const slot = replayTurn.slots[i];
      if (slot?.styleId == null) continue;
      const member = state.party.find((m) => m.styleId === slot.styleId);
      if (member) member.position = i;
    }
  }
}
