import { createInitializedBattleSnapshot } from '../../src/ui/adapter-core.js';
import {
  DEFAULT_INITIAL_SP,
  DEFAULT_ENEMY_COUNT,
} from '../../src/config/battle-defaults.js';
import { cloneEnemyEShieldState } from '../../src/domain/enemy-e-shield.js';
import { cloneEnemyExtraHpGaugeState } from '../../src/domain/enemy-extra-hp-gauge.js';
import { getNormalAttackElementsForPartyIndex } from '../../src/domain/normal-attack-elements.js';
import { normalizeStageSetupEnchantEffects } from '../../src/domain/stage-setup-enchants.js';
import {
  applyStageSetupTurnStartEffects,
  buildStageSetupBattleStartPassiveEvents,
} from '../../src/turn/turn-controller.js';
import { DEFAULT_ENEMY_PARAM_BORDER } from '../utils/enemy-setup-snapshot.js';

const PREEMPTIVE_FIELD_TO_ZONE_TYPE = Object.freeze({
  fire: 'Fire',
  ice: 'Ice',
  thunder: 'Thunder',
  light: 'Light',
  dark: 'Dark',
});
const UI_TO_ENGINE_ELEMENT_KEY = Object.freeze({
  slash: 'Slash',
  stab: 'Stab',
  strike: 'Strike',
  fire: 'Fire',
  ice: 'Ice',
  thunder: 'Thunder',
  light: 'Light',
  dark: 'Dark',
  nonelement: 'Nonelement',
});
const DEFAULT_ENEMY_RESISTANCE_RATE_PERCENT = 100;
const DEFAULT_MAX_D_RATE = 999;
const ENEMY_OD_RATE_NO_CORRECTION = 0;
const DEFAULT_ENEMY_NAME = '';
const MIN_ENEMY_COUNT = 1;
const MAX_ENEMY_COUNT = 3;
const DEFAULT_STAGE_SETUP = Object.freeze({
  initialOdGauge: 0,
  initialSpBonusAll: 0,
  initialStatusEffects: Object.freeze([]),
  enchantEffects: Object.freeze([]),
  turnlyOdGauge: 0,
  turnlySpAll: 0,
  turnlySpFront: 0,
  turnlySpBack: 0,
});
const STAGE_SETUP_EFFECT_SCOPE_ALL = 'all';
const STAGE_SETUP_EFFECT_SCOPE_FRONT = 'front';
const STAGE_SETUP_EFFECT_SCOPE_BACK = 'back';
const STAGE_SETUP_EFFECT_SCOPE_PARTY_INDEX = 'partyIndex';

function normalizeStageStatusEffect(effect = {}) {
  if (!effect || typeof effect !== 'object') {
    return null;
  }

  const statusType = String(effect?.statusType ?? '').trim();
  if (!statusType) {
    return null;
  }

  const scopeRaw = String(effect?.scope ?? STAGE_SETUP_EFFECT_SCOPE_ALL).trim();
  const scope =
    scopeRaw === STAGE_SETUP_EFFECT_SCOPE_FRONT ||
    scopeRaw === STAGE_SETUP_EFFECT_SCOPE_BACK ||
    scopeRaw === STAGE_SETUP_EFFECT_SCOPE_PARTY_INDEX
      ? scopeRaw
      : STAGE_SETUP_EFFECT_SCOPE_ALL;

  const normalized = {
    scope,
    statusType,
  };

  if (scope === STAGE_SETUP_EFFECT_SCOPE_PARTY_INDEX) {
    const partyIndex = Number(effect?.partyIndex);
    if (!Number.isInteger(partyIndex) || partyIndex < 0 || partyIndex > 5) {
      return null;
    }
    normalized.partyIndex = partyIndex;
  }

  if (Number.isFinite(Number(effect?.power))) {
    normalized.power = Number(effect.power);
  }
  if (Number.isFinite(Number(effect?.remaining))) {
    normalized.remaining = Number(effect.remaining);
  }
  if (effect?.elements != null) {
    normalized.elements = Array.isArray(effect.elements)
      ? [...new Set(effect.elements.map((value) => String(value ?? '').trim()).filter(Boolean))]
      : [];
  }
  if (String(effect?.limitType ?? '').trim()) {
    normalized.limitType = String(effect.limitType).trim();
  }
  if (String(effect?.exitCond ?? '').trim()) {
    normalized.exitCond = String(effect.exitCond).trim();
  }
  if (effect?.metadata && typeof effect.metadata === 'object') {
    normalized.metadata = structuredClone(effect.metadata);
  }

  return normalized;
}

function normalizeStageSetup(stageSetup = {}) {
  if (!stageSetup || typeof stageSetup !== 'object') {
    return {
      ...DEFAULT_STAGE_SETUP,
      initialStatusEffects: [],
    };
  }

  const initialOdGauge = Number(stageSetup?.initialOdGauge);
  const initialSpBonusAll = Number(stageSetup?.initialSpBonusAll);
  const turnlyOdGauge = Number(stageSetup?.turnlyOdGauge);
  const turnlySpAll = Number(stageSetup?.turnlySpAll);
  const turnlySpFront = Number(stageSetup?.turnlySpFront);
  const turnlySpBack = Number(stageSetup?.turnlySpBack);
  const enchantEffects = normalizeStageSetupEnchantEffects(stageSetup?.enchantEffects);
  const initialStatusEffects = Array.isArray(stageSetup?.initialStatusEffects)
    ? stageSetup.initialStatusEffects.map((effect) => normalizeStageStatusEffect(effect)).filter(Boolean)
    : [];

  return {
    initialOdGauge: Number.isFinite(initialOdGauge) ? initialOdGauge : DEFAULT_STAGE_SETUP.initialOdGauge,
    initialSpBonusAll: Number.isFinite(initialSpBonusAll)
      ? initialSpBonusAll
      : DEFAULT_STAGE_SETUP.initialSpBonusAll,
    enchantEffects,
    turnlyOdGauge: Number.isFinite(turnlyOdGauge) ? turnlyOdGauge : DEFAULT_STAGE_SETUP.turnlyOdGauge,
    turnlySpAll: Number.isFinite(turnlySpAll) ? turnlySpAll : DEFAULT_STAGE_SETUP.turnlySpAll,
    turnlySpFront: Number.isFinite(turnlySpFront) ? turnlySpFront : DEFAULT_STAGE_SETUP.turnlySpFront,
    turnlySpBack: Number.isFinite(turnlySpBack) ? turnlySpBack : DEFAULT_STAGE_SETUP.turnlySpBack,
    initialStatusEffects,
  };
}

function resolveTargetSourceIndexesForStageEffect(effect) {
  const scope = String(effect?.scope ?? STAGE_SETUP_EFFECT_SCOPE_ALL).trim();
  if (scope === STAGE_SETUP_EFFECT_SCOPE_FRONT) {
    return [0, 1, 2];
  }
  if (scope === STAGE_SETUP_EFFECT_SCOPE_BACK) {
    return [3, 4, 5];
  }
  if (scope === STAGE_SETUP_EFFECT_SCOPE_PARTY_INDEX) {
    return [Number(effect?.partyIndex ?? -1)].filter((index) => Number.isInteger(index) && index >= 0 && index <= 5);
  }
  return [0, 1, 2, 3, 4, 5];
}

function buildStageStatusEffectsByPartyIndex(stageSetup, compactIndexBySourceIndex) {
  const effectsByPartyIndex = {};

  for (const effect of stageSetup.initialStatusEffects ?? []) {
    const targetSourceIndexes = resolveTargetSourceIndexesForStageEffect(effect);
    for (const sourceIndex of targetSourceIndexes) {
      const compactIndex = compactIndexBySourceIndex.get(sourceIndex);
      if (!Number.isInteger(compactIndex)) {
        continue;
      }
      const key = String(compactIndex);
      if (!Array.isArray(effectsByPartyIndex[key])) {
        effectsByPartyIndex[key] = [];
      }

      const statusEffect = {
        statusType: String(effect.statusType),
        ...(Number.isFinite(Number(effect.power)) ? { power: Number(effect.power) } : {}),
        ...(Number.isFinite(Number(effect.remaining)) ? { remaining: Number(effect.remaining) } : {}),
        ...(Array.isArray(effect.elements) ? { elements: [...effect.elements] } : {}),
        ...(String(effect.limitType ?? '').trim() ? { limitType: String(effect.limitType).trim() } : {}),
        ...(String(effect.exitCond ?? '').trim() ? { exitCond: String(effect.exitCond).trim() } : {}),
        ...(effect.metadata && typeof effect.metadata === 'object'
          ? { metadata: structuredClone(effect.metadata) }
          : {}),
      };
      effectsByPartyIndex[key].push(statusEffect);
    }
  }

  return effectsByPartyIndex;
}

function buildEnemyDamageRates(source = {}) {
  const elementRates = source?.resistances?.element ?? source?.element;
  return Object.fromEntries(
    Object.entries(UI_TO_ENGINE_ELEMENT_KEY).map(([uiKey, engineKey]) => [
      engineKey,
      Number.isFinite(Number(elementRates?.[uiKey]))
        ? Number(elementRates[uiKey])
        : DEFAULT_ENEMY_RESISTANCE_RATE_PERCENT,
    ])
  );
}

function buildEnemyAbsorbElements(source = {}) {
  const list = Array.isArray(source?.absorbElementList) ? source.absorbElementList : [];
  return [...new Set(list.map((value) => String(value ?? '').trim().toLowerCase()).filter(Boolean))];
}

function buildEnemyEShieldState(source = {}) {
  return cloneEnemyEShieldState(source?.e_shield);
}

function buildEnemyExtraHpGaugeState(source = {}) {
  return cloneEnemyExtraHpGaugeState(source?.extra_hp_gauge);
}

function normalizeEnemyCount(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return MIN_ENEMY_COUNT;
  }
  return Math.min(MAX_ENEMY_COUNT, Math.max(MIN_ENEMY_COUNT, Math.trunc(numeric)));
}

function resolveNormalAttackElementsForPartyIndex(snapshot = {}, index) {
  return getNormalAttackElementsForPartyIndex(snapshot?.normalAttackElementsByPartyIndex, index);
}

function buildLegacyEnemySlot(enemySetup = {}) {
  return {
    selectedEnemyId: enemySetup?.selectedEnemyId ?? null,
    selectedEnemyName: enemySetup?.selectedEnemyName ?? DEFAULT_ENEMY_NAME,
    param_border: enemySetup?.param_border,
    dp: enemySetup?.dp,
    hp: enemySetup?.hp,
    od_rate: enemySetup?.od_rate,
    max_d_rate: enemySetup?.max_d_rate,
    d_rate: enemySetup?.d_rate,
    resistances: enemySetup?.resistances,
    absorbElementList: enemySetup?.absorbElementList,
    e_shield: enemySetup?.e_shield,
    extra_hp_gauge: cloneEnemyExtraHpGaugeState(enemySetup?.extra_hp_gauge),
  };
}

function resolveEnemySlots(enemySetup = {}) {
  if (Array.isArray(enemySetup?.enemySlots)) {
    const selectedSlots = enemySetup.enemySlots.filter((slot) => slot?.selectedEnemyId != null);
    if (selectedSlots.length > 0) {
      return selectedSlots;
    }
  }

  const fallbackSlot = buildLegacyEnemySlot(enemySetup);
  if (fallbackSlot.selectedEnemyId != null) {
    return [fallbackSlot];
  }

  const legacyCount = normalizeEnemyCount(enemySetup?.enemyCount ?? DEFAULT_ENEMY_COUNT);
  return Array.from({ length: legacyCount }, () => ({ ...fallbackSlot }));
}

function resolveEnemySlotDp(slot = {}, dataStore = null) {
  const direct = Number(slot?.dp);
  if (Number.isFinite(direct) && direct >= 0) {
    return direct;
  }
  const selectedEnemyId = Number(slot?.selectedEnemyId);
  const enemy = resolveEnemyById(dataStore, selectedEnemyId);
  const baseDp = Number(enemy?.base_param?.dp ?? enemy?.dp);
  return Number.isFinite(baseDp) && baseDp >= 0 ? baseDp : 0;
}

// maxHP は保存対象外（操作イベント正本の方針）。slot 直接値またはenemies.json から再導出する。
function resolveEnemySlotHp(slot = {}, dataStore = null) {
  const direct = Number(slot?.hp);
  if (Number.isFinite(direct) && direct >= 0) {
    return direct;
  }
  const selectedEnemyId = Number(slot?.selectedEnemyId);
  const enemy = resolveEnemyById(dataStore, selectedEnemyId);
  const baseHp = Number(enemy?.base_param?.hp ?? enemy?.hp);
  return Number.isFinite(baseHp) && baseHp >= 0 ? baseHp : 0;
}

function resolveEnemyById(dataStore = null, selectedEnemyId = null) {
  if (!Number.isFinite(selectedEnemyId)) {
    return null;
  }
  if (typeof dataStore?.enemiesById?.get === 'function') {
    const found = dataStore.enemiesById.get(selectedEnemyId);
    if (found) return found;
  }
  if (Array.isArray(dataStore?.enemies)) {
    return dataStore.enemies.find((candidate) => Number(candidate?.id) === selectedEnemyId) ?? null;
  }
  return null;
}

function buildEnemyStateOverrides(enemySetup = {}, dataStore = null) {
  const resolvedSlots = resolveEnemySlots(enemySetup);
  const enemyCount = normalizeEnemyCount(resolvedSlots.length);
  const slots = resolvedSlots.length > 0
    ? resolvedSlots.slice(0, MAX_ENEMY_COUNT)
    : [buildLegacyEnemySlot(enemySetup)];

  const slotStates = slots.map((slot) => {
    const enemyName = String(slot?.selectedEnemyName ?? DEFAULT_ENEMY_NAME).trim();
    const maxDestructionRate = Number.isFinite(Number(slot?.max_d_rate))
      ? Number(slot.max_d_rate)
      : DEFAULT_MAX_D_RATE;
    const rawOdRate = Number.isFinite(Number(slot?.od_rate))
      ? Number(slot.od_rate)
      : ENEMY_OD_RATE_NO_CORRECTION;
    const rawDestructionMultiplier = Number.isFinite(Number(slot?.d_rate))
      ? Number(slot.d_rate)
      : 100;
    return {
      enemyName,
      paramBorder: Number.isFinite(Number(slot?.param_border)) && Number(slot.param_border) > 0
        ? Number(slot.param_border)
        : DEFAULT_ENEMY_PARAM_BORDER,
      dp: resolveEnemySlotDp(slot, dataStore),
      hp: resolveEnemySlotHp(slot, dataStore),
      rates: buildEnemyDamageRates(slot),
      absorbElements: buildEnemyAbsorbElements(slot),
      maxDestructionRate,
      rawDestructionMultiplier,
      rawOdRate,
      eShieldState: buildEnemyEShieldState(slot),
      extraHpGaugeState: buildEnemyExtraHpGaugeState(slot),
    };
  });

  return {
    enemyCount: normalizeEnemyCount(enemyCount),
    enemyNamesByEnemy: Object.fromEntries(
      slotStates.map((slotState, index) => [String(index), slotState.enemyName])
    ),
    paramBorderByEnemy: Object.fromEntries(
      slotStates.map((slotState, index) => [String(index), slotState.paramBorder])
    ),
    enemyDpByEnemy: Object.fromEntries(
      slotStates.map((slotState, index) => [String(index), slotState.dp])
    ),
    enemyHpByEnemy: Object.fromEntries(
      slotStates.map((slotState, index) => [String(index), slotState.hp])
    ),
    damageRatesByEnemy: Object.fromEntries(
      slotStates.map((slotState, index) => [String(index), { ...slotState.rates }])
    ),
    destructionRateCapByEnemy: Object.fromEntries(
      slotStates.map((slotState, index) => [String(index), slotState.maxDestructionRate])
    ),
    destructionMultiplierByEnemy: Object.fromEntries(
      slotStates.map((slotState, index) => [String(index), slotState.rawDestructionMultiplier])
    ),
    absorbElementsByEnemy: Object.fromEntries(
      slotStates.map((slotState, index) => [String(index), [...slotState.absorbElements]])
    ),
    odRateByEnemy: Object.fromEntries(
      slotStates.map((slotState, index) => [String(index), slotState.rawOdRate])
    ),
    eShieldStateByEnemy: Object.fromEntries(
      slotStates
        .map((slotState, index) => [index, slotState.eShieldState])
        .filter(([, eShieldState]) => Boolean(eShieldState))
        .map(([index, eShieldState]) => [String(index), structuredClone(eShieldState)])
    ),
    extraHpGaugeStateByEnemy: Object.fromEntries(
      slotStates
        .map((slotState, index) => [index, slotState.extraHpGaugeState])
        .filter(([, extraHpGaugeState]) => Boolean(extraHpGaugeState))
        .map(([index, extraHpGaugeState]) => [String(index), structuredClone(extraHpGaugeState)])
    ),
  };
}

function buildPreemptiveZoneState(enemySetup) {
  const key = String(enemySetup?.preemptiveField ?? '').trim().toLowerCase();
  const zoneType = PREEMPTIVE_FIELD_TO_ZONE_TYPE[key] ?? null;
  if (!zoneType) {
    return null;
  }
  return {
    type: zoneType,
    sourceSide: 'enemy',
    remainingTurns: null,
  };
}

/**
 * slot snapshot から BattleState を生成・保持するクラス。
 * - 後衛の空きスロットは左詰めでエンジンに渡す
 * - isDirty フラグで「Apply 前に変更あり」状態を管理する
 */
export class BattleStateManager {
  #store;
  #enemyCatalog = [];
  #enemyCatalogById = new Map();
  #state = null;
  #party = null;
  #isDirty = false;

  constructor({ store }) {
    this.#store = store;
  }

  get state() { return this.#state; }
  get party() { return this.#party; }
  get isDirty() { return this.#isDirty; }
  get isInitialized() { return this.#state !== null; }

  markDirty() {
    this.#isDirty = true;
  }

  setEnemyCatalog(enemies = []) {
    this.#enemyCatalog = Array.isArray(enemies) ? enemies : [];
    this.#enemyCatalogById = new Map(
      this.#enemyCatalog.map((enemy) => [Number(enemy?.id), enemy])
    );
  }

  #getEnemyDataSource() {
    if (this.#enemyCatalog.length === 0) {
      return this.#store;
    }
    return {
      ...this.#store,
      enemies: this.#enemyCatalog,
      enemiesById: this.#enemyCatalogById,
    };
  }

  /**
   * PartySetupController.getSnapshot() の戻り値から BattleState を生成する。
   * 後衛の空きスロット（null）は左詰めで compaction してエンジンに渡す。
   *
   * @param {ReturnType<import('../components/party-setup.js').PartySetupController['getSnapshot']>} snapshot
   * @returns {object} BattleState
   */
  buildFromSnapshot(snapshot, enemySetup = {}) {
    if (!snapshot.isFrontFilled) {
      throw new Error('前衛3スロットを設定してください。');
    }

    // 後衛空きを左詰め: null を除いた非 null スロットのみ compact にする
    const filledIndices = snapshot.styleIds
      .map((id, i) => (id !== null ? i : null))
      .filter((i) => i !== null);
    const compactIndexBySourceIndex = new Map(
      filledIndices.map((sourceIndex, compactIndex) => [sourceIndex, compactIndex])
    );
    const stageSetup = normalizeStageSetup(snapshot?.stageSetup);

    const styleIds = filledIndices.map((i) => snapshot.styleIds[i]);

    const supportStyleIdsByPartyIndex = Object.fromEntries(
      filledIndices
        .map((srcIdx, newIdx) => [newIdx, snapshot.supportStyleIds[srcIdx]])
        .filter(([, id]) => id !== null)
    );
    const limitBreakLevelsByPartyIndex = Object.fromEntries(
      filledIndices.map((srcIdx, newIdx) => [newIdx, snapshot.limitBreakLevelsByPartyIndex[srcIdx] ?? 0])
    );
    const supportLimitBreakLevelsByPartyIndex = Object.fromEntries(
      filledIndices
        .map((srcIdx, newIdx) => [newIdx, snapshot.supportLimitBreakLevelsByPartyIndex?.[srcIdx] ?? 0])
        .filter(([, level]) => level > 0)
    );
    const statsByPartyIndex = Object.fromEntries(
      filledIndices
        .map((srcIdx, newIdx) => {
          const value = snapshot.statsByPartyIndex?.[srcIdx] ?? snapshot.statsByPartyIndex?.[String(srcIdx)] ?? null;
          return value && typeof value === 'object' ? [newIdx, structuredClone(value)] : null;
        })
        .filter(Boolean)
    );
    const drivePierceByPartyIndex = Object.fromEntries(
      filledIndices.map((srcIdx, newIdx) => [newIdx, snapshot.drivePierceByPartyIndex[srcIdx] ?? 0])
    );
    const pierceByPartyIndex = Object.fromEntries(
      filledIndices.map((srcIdx, newIdx) => {
        const entry =
          snapshot.pierceByPartyIndex?.[srcIdx] ??
          snapshot.pierceByPartyIndex?.[String(srcIdx)] ??
          null;
        if (entry && typeof entry === 'object') {
          return [newIdx, { type: String(entry.type ?? 'none'), percent: Number(entry.percent ?? 0) }];
        }
        // 旧 snapshot 互換: drivePierce のみの場合はドライブピアスとして扱う
        const drivePierce = Number(snapshot.drivePierceByPartyIndex?.[srcIdx] ?? 0);
        return [newIdx, drivePierce > 0 ? { type: 'drive', percent: drivePierce } : { type: 'none', percent: 0 }];
      })
    );
    const startSpEquipByPartyIndex = Object.fromEntries(
      filledIndices.map((srcIdx, newIdx) => [
        newIdx,
        Number(snapshot.startSpEquipByPartyIndex[srcIdx] ?? 0) + Number(stageSetup.initialSpBonusAll ?? 0),
      ])
    );
    const normalAttackElementsByPartyIndex = Object.fromEntries(
      filledIndices
        .map((srcIdx, newIdx) => {
          const elements = resolveNormalAttackElementsForPartyIndex(snapshot, srcIdx);
          return elements ? [newIdx, elements] : null;
        })
        .filter(Boolean)
    );
    const stageStatusEffectsByPartyIndex = buildStageStatusEffectsByPartyIndex(
      stageSetup,
      compactIndexBySourceIndex
    );
    const skillSetsByPartyIndex = Object.fromEntries(
      filledIndices
        .map((srcIdx, newIdx) => {
          const equippedSkillIds =
            snapshot.skillSetsByPartyIndex?.[srcIdx] ??
            snapshot.skillSetsByPartyIndex?.[String(srcIdx)] ??
            null;
          return Array.isArray(equippedSkillIds)
            ? [newIdx, structuredClone(equippedSkillIds)]
            : null;
        })
        .filter(Boolean)
    );

    const preemptiveZoneState = buildPreemptiveZoneState(enemySetup);
    const enemyStateOverrides = buildEnemyStateOverrides(enemySetup, this.#getEnemyDataSource());

    const result = createInitializedBattleSnapshot({
      dataStore: this.#store,
      initialSP: DEFAULT_INITIAL_SP,
      styleIds,
      limitBreakLevelsByPartyIndex,
      drivePierceByPartyIndex,
      pierceByPartyIndex,
      startSpEquipByPartyIndex,
      supportStyleIdsByPartyIndex,
      supportLimitBreakLevelsByPartyIndex,
      statsByPartyIndex,
      skillSetsByPartyIndex,
      normalAttackElementsByPartyIndex,
      initialMotivationByPartyIndex: {},
      initialDpStateByPartyIndex: {},
      initialBreakByPartyIndex: {},
      tokenStateByPartyIndex: {},
      moraleStateByPartyIndex: {},
      motivationStateByPartyIndex: {},
      markStateByPartyIndex: {},
      statusEffectsByPartyIndex: stageStatusEffectsByPartyIndex,
      initialOdGauge: Number(stageSetup.initialOdGauge ?? 0),
      enemyCount: enemyStateOverrides.enemyCount,
      enemyNamesByEnemy: enemyStateOverrides.enemyNamesByEnemy,
      paramBorderByEnemy: enemyStateOverrides.paramBorderByEnemy,
      enemyDpByEnemy: enemyStateOverrides.enemyDpByEnemy,
      enemyHpByEnemy: enemyStateOverrides.enemyHpByEnemy,
      damageRatesByEnemy: enemyStateOverrides.damageRatesByEnemy,
      destructionRateByEnemy: {},
      destructionRateCapByEnemy: enemyStateOverrides.destructionRateCapByEnemy,
      destructionMultiplierByEnemy: enemyStateOverrides.destructionMultiplierByEnemy,
      absorbElementsByEnemy: enemyStateOverrides.absorbElementsByEnemy,
      odRateByEnemy: enemyStateOverrides.odRateByEnemy,
      eShieldStateByEnemy: enemyStateOverrides.eShieldStateByEnemy,
      extraHpGaugeStateByEnemy: enemyStateOverrides.extraHpGaugeStateByEnemy,
      enemyStatuses: [],
      breakStateByEnemy: {},
      enemyZoneConfigByEnemy: {},
      zoneState: preemptiveZoneState,
      territoryState: null,
    });

    this.#party = result.party;
    this.#state = result.state;
    this.#isDirty = false;

    // Stage Setup 毎ターン SP ギミック情報を state に保存
    if (this.#state) {
      this.#state.stageSetupTurnly = {
        odGauge: stageSetup.turnlyOdGauge ?? 0,
        spAll: stageSetup.turnlySpAll ?? 0,
        spFront: stageSetup.turnlySpFront ?? 0,
        spBack: stageSetup.turnlySpBack ?? 0,
      };
      this.#state.stageSetupEnchantEffects = structuredClone(stageSetup.enchantEffects ?? []);
      const stageSetupPassiveEvents = buildStageSetupBattleStartPassiveEvents(
        this.#state.turnState,
        stageSetup,
        this.#state.party
      );
      applyStageSetupTurnStartEffects(this.#state, [], stageSetupPassiveEvents);
      this.#state.turnState.passiveEventsLastApplied = [
        ...(Array.isArray(this.#state.turnState.passiveEventsLastApplied)
          ? this.#state.turnState.passiveEventsLastApplied
          : []),
        ...stageSetupPassiveEvents,
      ];
    }

    return result.state;
  }
}
