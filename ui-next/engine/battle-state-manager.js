import { createInitializedBattleSnapshot } from '../../src/ui/adapter-core.js';
import { DEFAULT_INITIAL_SP, DEFAULT_ENEMY_COUNT } from '../../src/config/battle-defaults.js';

const PREEMPTIVE_FIELD_TO_ZONE_TYPE = Object.freeze({
  fire: 'Fire',
  ice: 'Ice',
  thunder: 'Thunder',
  light: 'Light',
  dark: 'Dark',
});

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
    const drivePierceByPartyIndex = Object.fromEntries(
      filledIndices.map((srcIdx, newIdx) => [newIdx, snapshot.drivePierceByPartyIndex[srcIdx] ?? 0])
    );
    const startSpEquipByPartyIndex = Object.fromEntries(
      filledIndices.map((srcIdx, newIdx) => [newIdx, snapshot.startSpEquipByPartyIndex[srcIdx] ?? 0])
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

    const result = createInitializedBattleSnapshot({
      dataStore: this.#store,
      initialSP: DEFAULT_INITIAL_SP,
      styleIds,
      limitBreakLevelsByPartyIndex,
      drivePierceByPartyIndex,
      startSpEquipByPartyIndex,
      supportStyleIdsByPartyIndex,
      supportLimitBreakLevelsByPartyIndex,
      skillSetsByPartyIndex,
      normalAttackElementsByPartyIndex: {},
      initialMotivationByPartyIndex: {},
      initialDpStateByPartyIndex: {},
      initialBreakByPartyIndex: {},
      tokenStateByPartyIndex: {},
      moraleStateByPartyIndex: {},
      motivationStateByPartyIndex: {},
      markStateByPartyIndex: {},
      statusEffectsByPartyIndex: {},
      initialOdGauge: 0,
      enemyCount: enemySetup.enemyCount != null
        ? Number(enemySetup.enemyCount) || DEFAULT_ENEMY_COUNT
        : DEFAULT_ENEMY_COUNT,
      enemyNamesByEnemy: {},
      damageRatesByEnemy: {},
      destructionRateByEnemy: {},
      destructionRateCapByEnemy: {},
      enemyStatuses: [],
      breakStateByEnemy: {},
      enemyZoneConfigByEnemy: {},
      zoneState: preemptiveZoneState,
      territoryState: null,
    });

    this.#party = result.party;
    this.#state = result.state;
    this.#isDirty = false;
    return result.state;
  }
}
