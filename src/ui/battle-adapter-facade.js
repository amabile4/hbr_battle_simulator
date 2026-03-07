import { createBattleRecordStore } from '../records/record-store.js';
import { DEFAULT_INITIAL_SP } from '../config/battle-defaults.js';
import {
  createInitializedBattleSnapshot,
  queueSwapState,
  previewTurnRecord,
  commitTurnRecord,
  appendCommittedRecord,
  resetRecordStore,
  exportCsvText,
  exportRecordsJsonText,
} from './adapter-core.js';

export class BattleAdapterFacade {
  constructor({ dataStore, initialSP = DEFAULT_INITIAL_SP }) {
    this.dataStore = dataStore;
    this.initialSP = initialSP;

    this.party = null;
    this.state = null;
    this.recordStore = createBattleRecordStore();
    this.previewRecord = null;
    this.pendingSwapEvents = [];
    this.pendingInterruptOdLevel = null;
    this.interruptOdProjection = null;
    this.preemptiveOdCheckpoint = null;
    this.kishinkaActivatedThisTurn = false;
    this.passiveLogEntries = [];

    this.turnPlans = [];
    this.turnPlanComputedRecords = [];
    this.turnPlanReplayError = null;
    this.turnPlanReplayWarnings = [];
    this.turnPlanEditSession = null;
    this.turnPlanBaseSetup = null;
    this.isReplayingTurnPlans = false;
  }

  initializeBattleState(options = {}) {
    const snapshot = createInitializedBattleSnapshot({
      dataStore: this.dataStore,
      initialSP: this.initialSP,
      styleIds: options.styleIds,
      skillSetsByPartyIndex: options.skillSetsByPartyIndex,
      limitBreakLevelsByPartyIndex: options.limitBreakLevelsByPartyIndex,
      drivePierceByPartyIndex: options.drivePierceByPartyIndex,
      normalAttackElementsByPartyIndex: options.normalAttackElementsByPartyIndex,
      startSpEquipByPartyIndex: options.startSpEquipByPartyIndex,
      initialOdGauge: options.initialOdGauge,
      enemyCount: options.enemyCount,
      enemyNamesByEnemy: options.enemyNamesByEnemy,
      damageRatesByEnemy: options.damageRatesByEnemy,
      enemyStatuses: options.enemyStatuses,
      enemyZoneConfigByEnemy: options.enemyZoneConfigByEnemy,
      zoneState: options.zoneState,
      territoryState: options.territoryState,
    });

    this.party = snapshot.party;
    this.state = snapshot.state;
    this.recordStore = resetRecordStore();
    this.previewRecord = null;
    this.pendingSwapEvents = [];
    this.pendingInterruptOdLevel = null;
    this.interruptOdProjection = null;
    this.preemptiveOdCheckpoint = null;
    this.kishinkaActivatedThisTurn = false;
    this.passiveLogEntries = [];

    if (!options.preserveTurnPlans) {
      this.turnPlans = [];
      this.turnPlanComputedRecords = [];
      this.turnPlanReplayError = null;
      this.turnPlanReplayWarnings = [];
      this.turnPlanEditSession = null;
    }

    this.turnPlanBaseSetup = {
      ...snapshot.turnPlanBaseSetup,
      forceOdToggle: Boolean(options.forceOdToggle ?? false),
    };

    return this.state;
  }

  queueSwapInState(fromPositionIndex, toPositionIndex) {
    const result = queueSwapState(this.state, this.pendingSwapEvents, fromPositionIndex, toPositionIndex);
    this.previewRecord = null;
    this.interruptOdProjection = null;
    return result;
  }

  previewCurrentTurnState({ actions, enemyAction = null, enemyCount = 1, options = {} }) {
    if (!this.state) {
      throw new Error('State is not initialized.');
    }
    this.previewRecord = previewTurnRecord(this.state, actions, enemyAction, enemyCount, options);
    return this.previewRecord;
  }

  commitCurrentTurnState(options = {}) {
    if (!this.state) {
      throw new Error('State is not initialized.');
    }
    if (!this.previewRecord) {
      throw new Error('Preview record is not initialized.');
    }

    const { nextState, committedRecord } = commitTurnRecord(this.state, this.previewRecord, this.pendingSwapEvents, {
      interruptOdLevel: Number(options.interruptOdLevel ?? 0),
      forceOdActivation: Boolean(options.forceOdActivation ?? false),
      forceResourceDeficit: Boolean(options.forceResourceDeficit ?? false),
    });

    this.state = nextState;
    this.recordStore = appendCommittedRecord(this.recordStore, committedRecord);
    this.previewRecord = null;
    this.pendingSwapEvents = [];
    this.pendingInterruptOdLevel = null;
    this.interruptOdProjection = null;
    this.preemptiveOdCheckpoint = null;
    this.kishinkaActivatedThisTurn = false;

    if (options.shouldCaptureTurnPlan && options.capturedTurnPlan) {
      this.turnPlans.push(options.capturedTurnPlan);
      this.turnPlanComputedRecords = [...this.recordStore.records];
      this.turnPlanReplayError = null;
      this.turnPlanReplayWarnings = [];
      this.turnPlanEditSession = null;
    }

    return committedRecord;
  }

  clearRecordsState() {
    this.recordStore = resetRecordStore();
    this.passiveLogEntries = [];
    this.turnPlans = [];
    this.turnPlanComputedRecords = [];
    this.turnPlanReplayError = null;
    this.turnPlanReplayWarnings = [];
    this.turnPlanEditSession = null;
  }

  exportCsvState() {
    if (!this.state) {
      throw new Error('State is not initialized.');
    }
    return exportCsvText(this.recordStore, this.state.initialParty);
  }

  exportRecordsJsonState() {
    return exportRecordsJsonText(this.recordStore);
  }
}
