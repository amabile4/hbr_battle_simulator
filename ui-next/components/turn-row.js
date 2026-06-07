import { resolveStyleAssetUrl, resolveStyleImageUrl, resolveUiAssetUrl } from '../../src/ui/style-asset-url.js';
import {
  clampEnemyCount,
  DEFAULT_ENEMY_COUNT,
  MAX_ENEMY_COUNT,
} from '../../src/config/battle-defaults.js';
import { formatSkillCostLabel, getElementHintForDuplicateNamedSkill } from '../utils/skill-label.js';
import { isEnemyAlive, isEnemyBroken, resolveEffectiveSkillForAction } from '../../src/turn/turn-controller.js';
import {
  REPLAY_OPERATION_TYPES,
  REPLAY_OVERRIDE_ENTRY_TYPES,
  replayOperationRegistry,
} from '../../src/ui/lightweight-replay-script.js';
import {
  coerceTurnReplayTarget,
  formatTurnTargetLabel,
  normalizeTurnReplayTarget,
  resolveTurnBreakAttributionMode,
  resolveTurnManualTargetConfig,
  resolveTurnTargetConfig,
  TURN_BREAK_ATTRIBUTION_MODES,
} from '../utils/turn-targeting.js';
import {
  getReplayOperationDisplayLabel,
  getReplayOperationTone,
} from '../utils/replay-operation-presentation.js';
import { buildBuffListHtmlWithExtras, buildActionDisabledIconEntry } from '../utils/buff-display.js';
import { openCharDetailPopup } from '../utils/char-detail-popup.js';
import { openEnemyDetailPopup } from './enemy-detail-popup.js';
import {
  ACTION_OUTCOME_TYPES,
  getActionOutcomeOverridesFromReplayTurn,
  getBreakEnemyIndexesForPosition,
  getKillEnemyIndexesForPosition,
  normalizeActionOutcomeOverrides,
} from '../utils/action-outcome-overrides.js';
import {
  buildAutoBreakChipModels,
  buildManualHpBreakChipModels,
  buildManualBreakChipModels,
  buildManualKillChipModels,
  resolveManualBreakActorLabel,
} from '../utils/manual-break-presentation.js';
import {
  buildAutomaticFollowUpChipModelsFromActions,
  buildFollowUpChipModels,
} from '../utils/follow-up-presentation.js';
import {
  getFollowUpOverridesFromReplayTurn,
  normalizeFollowUpOverrides,
} from '../utils/follow-up-overrides.js';
import {
  areSimulatorSettingsEqual,
  isEnemyTargetSelectionManual,
  normalizeSimulatorSettings,
} from '../utils/simulator-settings.js';
import { buildFieldDisplayEntries } from '../utils/field-state-display.js';
import { isPursuitOnlySkill } from '../../src/domain/skill-classifiers.js';
import { buildActionFlowFromRecord } from '../utils/action-flow-builder.js';
import { sortTurnActionExecutionEntries } from '../../src/turn/action-execution-order.js';
import {
  buildEnemyEShieldBadgeHtml,
  isDisplayableEnemyEShieldState,
  normalizeEnemyEShieldDisplayState,
} from '../utils/e-shield-display.js';
import {
  cloneEnemyEShieldState,
  normalizeEnemyEShieldElements,
} from '../../src/domain/enemy-e-shield.js';
import {
  canEnemyHpBreak,
  cloneEnemyExtraHpGaugeState,
} from '../../src/domain/enemy-extra-hp-gauge.js';

// select 幅の閾値（px）：スキル名の可読性を維持できる幅を下回ったら
// 属性/武器種バッジと SP コストを段階的に隠す。
const BADGE_MIN_SELECT_WIDTH = 108;
const COST_MIN_SELECT_WIDTH  = 88;
const WIDTH_VISIBILITY_HYSTERESIS_PX = 8;
const BADGE_SHOW_MIN_SELECT_WIDTH = BADGE_MIN_SELECT_WIDTH + WIDTH_VISIBILITY_HYSTERESIS_PX;
const BADGE_HIDE_MIN_SELECT_WIDTH = BADGE_MIN_SELECT_WIDTH - WIDTH_VISIBILITY_HYSTERESIS_PX;
const COST_SHOW_MIN_SELECT_WIDTH = COST_MIN_SELECT_WIDTH + WIDTH_VISIBILITY_HYSTERESIS_PX;
const COST_HIDE_MIN_SELECT_WIDTH = COST_MIN_SELECT_WIDTH - WIDTH_VISIBILITY_HYSTERESIS_PX;
const RESPONSIVE_BADGE_ICON_SIZE_FALLBACK_PX = 20;
const RESPONSIVE_BADGE_COLUMN_GAP_FALLBACK_PX = 1;
const OD_GAUGE_BAR_MIN = 0;
const OD_GAUGE_BAR_MAX = 300;
const OD_GAUGE_BAND_SIZE = 100;
const OD_GAUGE_STAGE_LABEL_MAX = Math.trunc(OD_GAUGE_BAR_MAX / OD_GAUGE_BAND_SIZE);
const ENEMY_DETAIL_LONG_PRESS_MS = 520;
const ENEMY_SUMMON_MAX_VISIBLE_OPTIONS = 8;
const ENEMY_SUMMON_EDITOR_Z_INDEX = 1010;
const TARGET_POPOVER_VIEWPORT_PADDING_PX = 8;
const TARGET_POPOVER_MIN_VIEWPORT_HEIGHT_PX = 120;
const TARGET_POPOVER_Z_INDEX = 120;
const ALLY_TARGET_POPOVER_MIN_WIDTH_PX = 220;
const ALLY_TARGET_POPOVER_MAX_WIDTH_PX = 360;
const ENEMY_TARGET_POPOVER_MIN_WIDTH_PX = 180;
const ENEMY_TARGET_POPOVER_MAX_WIDTH_PX = 280;
const TURN_INFO_PANEL_WIDTH_CLASS = 'w-[108px]';
const ENEMY_STATUS_BREAK = 'Break';
const PURSUIT_TRANSFORMED_SKILL_NAME = 'ネコジェット・シャテキ';
const PURSUIT_TRANSFORMED_SKILL_SP_COST = 10;
const ENEMY_E_SHIELD_EDITOR_MIN_VALUE = 0;
const ENEMY_E_SHIELD_EDITOR_ELEMENT_OPTIONS = Object.freeze([
  ['Fire', '火'],
  ['Ice', '氷'],
  ['Thunder', '雷'],
  ['Light', '光'],
  ['Dark', '闇'],
]);
const SUMMON_ENEMY_RESISTANCE_LABELS = Object.freeze([
  ['slash', '斬'],
  ['stab', '突'],
  ['strike', '打'],
  ['fire', '火'],
  ['ice', '氷'],
  ['thunder', '雷'],
  ['light', '光'],
  ['dark', '闇'],
  ['nonelement', '無'],
]);

const ATTACK_TYPE_MAP = {
  Slash:  { img: resolveUiAssetUrl('Slash.webp'),  alt: '斬' },
  Stab:   { img: resolveUiAssetUrl('Stab.webp'),   alt: '突' },
  Strike: { img: resolveUiAssetUrl('Strike.webp'), alt: '打' },
};

const ELEMENT_MAP = {
  Fire:    { img: resolveUiAssetUrl('Fire.webp'),    alt: '火' },
  Ice:     { img: resolveUiAssetUrl('Ice.webp'),     alt: '氷' },
  Thunder: { img: resolveUiAssetUrl('Thunder.webp'), alt: '雷' },
  Dark:    { img: resolveUiAssetUrl('Dark.webp'),    alt: '闇' },
  Light:   { img: resolveUiAssetUrl('Light.webp'),   alt: '光' },
};

const TURN_ROW_MODES = Object.freeze({
  INPUT: 'input',
  COMMITTED: 'committed',
  EDIT: 'edit',
});

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function normalizeNonNegativeInteger(value, fallback = 0) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return Math.max(ENEMY_E_SHIELD_EDITOR_MIN_VALUE, Math.floor(Number(fallback) || 0));
  }
  return Math.max(ENEMY_E_SHIELD_EDITOR_MIN_VALUE, Math.floor(numeric));
}

function normalizeFiniteNumber(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function normalizeRowDiagnostics(diagnostics = {}) {
  return {
    warnings: Array.isArray(diagnostics?.warnings)
      ? diagnostics.warnings.map((warning) => String(warning))
      : [],
    error: diagnostics?.error ? String(diagnostics.error) : null,
  };
}

function resolveRepeatCastCount(action) {
  const castCount = Number(action?.castCount ?? 1);
  return Number.isFinite(castCount) && castCount > 1 ? castCount : 1;
}

/**
 * OD ゲージ値を "000.00%" 形式にフォーマットする。
 * 負の値は "-000.00%" 形式（符号の後ろをゼロ埋め）。
 * エンジン仕様の範囲は [-999.99, 300]。
 */
function formatOdGauge(value) {
  const num = Number(value ?? 0);
  if (num < 0) {
    return '-' + Math.abs(num).toFixed(2).padStart(6, '0') + '%';
  }
  return num.toFixed(2).padStart(6, '0') + '%';
}

function normalizeOdGaugeNumber(value, fallback = 0) {
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? numericValue : fallback;
}

function resolveNegativeOdGaugeStageLabel(value) {
  const numericValue = Math.abs(normalizeOdGaugeNumber(value));
  return String(Math.min(OD_GAUGE_STAGE_LABEL_MAX, Math.floor(numericValue / OD_GAUGE_BAND_SIZE)));
}

export function resolveOdMarkerLabel(turnLabel, { fallback = '' } = {}) {
  const label = String(turnLabel ?? '');
  const subTurnMatch = label.match(/^OD\d+-(\d+)$/);
  if (subTurnMatch) {
    return `OD${subTurnMatch[1]}`;
  }
  const levelMatch = label.match(/^(OD\d+)/);
  if (levelMatch) {
    return levelMatch[1];
  }
  return fallback;
}

/**
 * 1ターン分の横長コンテナ UI
 *
 * - 未コミット行: record=null、stateBefore のみ（スキル選択 + Commit ボタン表示）
 * - SP バッジ: 未コミット行は preview 後の残量、コミット済み行は action の endSP を表示
 * - スロットは commit 時点の position 順で表示
 */
export class TurnRowController {
  #root;
  #store;
  #enemyPresets = [];
  #turnIndex;
  #rowMode = TURN_ROW_MODES.INPUT;
  #rowDiagnostics = normalizeRowDiagnostics();
  #record;
  #replayTurn;
  #operations;
  #stateBefore;
  #stateAfter;
  #previewOdGaugeAfter = null;
  #onSlotChange;
  #onCommit;
  #onEditStart;
  #onEditCancel;
  #onRecommit;
  #onNoteChange;
  #onPreviewRequest;
  #onOdChange;
  #onOperationAdd;
  #onOperationRemove;
  #onEnemyCountChange;
  #onActionOutcomeChange;
  // OD 選択状態（未コミット行のみ使用）
  #odState = null;  // { preemptiveOdLevel, interruptOdLevel, activatablePreemptive, activatableInterrupt }
  #operationState = null; // { kishinkaStatus, makaiKiheiStatus }

  // D&D 用
  #dragSrcPosition = null;
  #isDragDelegationBound = false;
  // タップ swap 用（iOS 代替操作・クリック swap 兼用）
  #selectedSlotPosition = null;
  #draftSlotSkills = {};
  #draftTargets = {};
  #draftEnemyCount = DEFAULT_ENEMY_COUNT;
  #draftNote = '';
  #openTargetPickerPartyIndex = null;
  #isBreakEditorOpen = false;
  #isKillEditorOpen = false;
  #isFollowUpEditorOpen = false;
  #isEnemySummonEditorOpen = false;
  #draftSummonEnemyId = null;
  #requestedEnemySummonIndex = null;
  #draftBreakEnemyIndexesByPartyIndex = {};
  #draftKillEnemyIndexesByPartyIndex = {};
  #draftHpBreakEnemyIndexesByPartyIndex = {};
  #draftFollowUpEnemyIndexByPartyIndex = {};
  #draftEnemyAttackTargetCharacterIds = [];
  #draftDpStateByPartyIndex = {};
  #isPartyStateControlOpen = false;
  #enemyDetailPopup = null;
  #popupOutcomeRequest = null;
  #popupEShieldEditorRequest = null;
  #previewResourceState = null;
  #previewActionFlow = [];
  // Simulator Settings パラメータ
  #simulatorSettings = null;

  constructor({
    root,
    store,
    enemyPresets = [],
    turnIndex,
    rowMode = TURN_ROW_MODES.INPUT,
    rowDiagnostics = null,
    record,
    replayTurn = null,
    operations = [],
    operationState = null,
    stateBefore,
    stateAfter,
    previewResourceState = null,
    previewActionFlow = [],
    previewOdGaugeAfter = null,
    onSlotChange,
    onCommit,
    onEditStart = null,
    onEditCancel = null,
    onRecommit = null,
    onNoteChange,
    onPreviewRequest,
    onOdChange,
    onOperationAdd,
    onOperationRemove,
    onEnemyCountChange,
    onActionOutcomeChange,
    odState = null,
    simulatorSettings = null,
    editDraft = null,
  }) {
    this.#root = root;
    this.#store = store;
    this.#enemyPresets = Array.isArray(enemyPresets)
      ? enemyPresets.map((preset) => structuredClone(preset))
      : [];
    this.#turnIndex = turnIndex;
    this.#rowMode = Object.values(TURN_ROW_MODES).includes(rowMode)
      ? rowMode
      : (record == null ? TURN_ROW_MODES.INPUT : TURN_ROW_MODES.COMMITTED);
    this.#rowDiagnostics = normalizeRowDiagnostics(rowDiagnostics);
    this.#record = record;
    this.#replayTurn = replayTurn;
    this.#operations = Array.isArray(operations) ? operations.map((operation) => structuredClone(operation)) : [];
    this.#operationState = operationState && typeof operationState === 'object'
      ? structuredClone(operationState)
      : null;
    this.#stateBefore = stateBefore;
    this.#stateAfter = stateAfter;
    this.#previewResourceState = previewResourceState && typeof previewResourceState === 'object'
      ? structuredClone(previewResourceState)
      : null;
    this.#previewActionFlow = Array.isArray(previewActionFlow)
      ? structuredClone(previewActionFlow)
      : [];
    this.#previewOdGaugeAfter = Number.isFinite(Number(previewOdGaugeAfter))
      ? Number(previewOdGaugeAfter)
      : null;
    this.#onSlotChange = onSlotChange;
    this.#onCommit = onCommit;
    this.#onEditStart = onEditStart;
    this.#onEditCancel = onEditCancel;
    this.#onRecommit = onRecommit;
    this.#onNoteChange = onNoteChange;
    this.#onPreviewRequest = onPreviewRequest;
    this.#onOdChange = onOdChange;
    this.#onOperationAdd = onOperationAdd;
    this.#onOperationRemove = onOperationRemove;
    this.#onEnemyCountChange = onEnemyCountChange;
    this.#onActionOutcomeChange = onActionOutcomeChange;
    this.#odState = odState;
    this.#simulatorSettings = normalizeSimulatorSettings(simulatorSettings);
    this.#initializeDraftState(editDraft);
    this.#syncEnemySummonSelection();
  }

  mount() {
    this.#root.innerHTML = this.#buildHtml();
    this.#bindEvents();
  }

  get turnIndex() {
    return this.#turnIndex;
  }

  get rowMode() {
    return this.#rowMode;
  }

  #isCommittedDisplayMode() {
    return this.#rowMode === TURN_ROW_MODES.COMMITTED;
  }

  #isDraftMode() {
    return this.#rowMode !== TURN_ROW_MODES.COMMITTED;
  }

  #isEditMode() {
    return this.#rowMode === TURN_ROW_MODES.EDIT;
  }

  #isInputMode() {
    return this.#rowMode === TURN_ROW_MODES.INPUT;
  }

  #initializeDraftState(editDraft = null) {
    if (this.#isCommittedDisplayMode()) {
      this.#draftNote = String(this.#replayTurn?.note ?? '');
      return;
    }
    if (editDraft && typeof editDraft === 'object') {
      this.#applyEditDraft(editDraft);
      return;
    }
    this.#draftNote = String(this.#draftNote ?? '');
    this.#draftEnemyCount = this.#resolveDraftEnemyCount();
    this.#draftEnemyAttackTargetCharacterIds = [];
    this.#draftDpStateByPartyIndex = {};
    this.#syncDraftSelections();
  }

  #applyEditDraft(editDraft = {}) {
    const slots = Array.isArray(editDraft?.slots) ? editDraft.slots : [];
    this.#draftNote = String(editDraft?.note ?? this.#replayTurn?.note ?? '');
    this.#draftEnemyCount = clampEnemyCount(
      editDraft?.enemyCount ?? this.#resolveDraftEnemyCount()
    );
    this.#draftSlotSkills = {};
    this.#draftTargets = {};
    for (const [positionKey, slot] of slots.entries()) {
      const position = Number(positionKey);
      const member = this.#stateBefore?.party?.find((candidate) => Number(candidate?.position) === position) ?? null;
      if (!member) {
        continue;
      }
      if (position <= 2 && slot?.skillId != null) {
        this.#draftSlotSkills[member.partyIndex] = {
          partyIndex: member.partyIndex,
          skillId: Number(slot.skillId),
        };
      }
      const target = normalizeTurnReplayTarget(slot?.target);
      if (target.type !== 'none') {
        this.#draftTargets[member.partyIndex] = target;
      }
    }
    this.#draftBreakEnemyIndexesByPartyIndex = {};
    this.#draftKillEnemyIndexesByPartyIndex = {};
    this.#draftHpBreakEnemyIndexesByPartyIndex = {};
    this.#draftFollowUpEnemyIndexByPartyIndex = {};
    this.#draftEnemyAttackTargetCharacterIds =
      this.#extractEnemyAttackTargetCharacterIdsFromOverrideEntries(editDraft?.overrideEntries ?? []);
    this.#draftDpStateByPartyIndex =
      this.#extractDpStateByPartyIndexFromOverrideEntries(editDraft?.overrideEntries ?? []);
    const normalizedOverrides = normalizeActionOutcomeOverrides(
      editDraft?.actionOutcomeOverrides ?? [],
      this.#draftEnemyCount
    );
    for (const override of normalizedOverrides) {
      const member =
        this.#stateBefore?.party?.find((candidate) => Number(candidate?.position) === Number(override?.position)) ?? null;
      if (!member) {
        continue;
      }
      if (override.outcome === ACTION_OUTCOME_TYPES.BREAK) {
        this.#draftBreakEnemyIndexesByPartyIndex[member.partyIndex] = [...override.enemyIndexes];
      }
      if (override.outcome === ACTION_OUTCOME_TYPES.KILL) {
        this.#draftKillEnemyIndexesByPartyIndex[member.partyIndex] = [...override.enemyIndexes];
      }
      if (override.outcome === ACTION_OUTCOME_TYPES.HP_BREAK) {
        this.#draftHpBreakEnemyIndexesByPartyIndex[member.partyIndex] = [...override.enemyIndexes];
      }
    }
    const normalizedFollowUps = normalizeFollowUpOverrides(
      editDraft?.followUpOverrides ?? [],
      this.#draftEnemyCount
    );
    for (const override of normalizedFollowUps) {
      const member =
        this.#stateBefore?.party?.find((candidate) => Number(candidate?.position) === Number(override?.position)) ?? null;
      if (!member) {
        continue;
      }
      this.#draftFollowUpEnemyIndexByPartyIndex[member.partyIndex] = Number(override.enemyIndex);
    }
    this.#syncDraftSelections();
  }

  #resolveDraftEnemyCount() {
    const stateEnemyCount = this.#stateBefore?.turnState?.enemyState?.enemyCount;
    if (Number.isFinite(stateEnemyCount)) {
      return clampEnemyCount(stateEnemyCount);
    }
    return DEFAULT_ENEMY_COUNT;
  }

  #getVisibleSkills(member) {
    return member?.getActionSkills ? member.getActionSkills() : [];
  }

  #resolveDraftSkillId(member, candidateSkillId = null) {
    const visibleSkills = this.#getVisibleSkills(member);
    if (visibleSkills.length === 0) {
      return null;
    }
    if (candidateSkillId != null && visibleSkills.some((skill) => skill.skillId === candidateSkillId)) {
      return candidateSkillId;
    }
    return visibleSkills[0]?.skillId ?? null;
  }

  #syncDraftSelections() {
    if (!this.#isDraftMode()) {
      return;
    }
    const nextDraftSlotSkills = {};
    const members = this.#getMembersInPositionOrder().filter((member) => member.position <= 2);
    for (const member of members) {
      if (this.#isExtraTurn() && !this.#isActionable(member)) {
        continue;
      }
      const currentDraftSkillId = this.#draftSlotSkills?.[member.partyIndex]?.skillId ?? null;
      const resolvedSkillId = this.#resolveDraftSkillId(member, currentDraftSkillId);
      if (resolvedSkillId != null) {
        nextDraftSlotSkills[member.partyIndex] = {
          partyIndex: member.partyIndex,
          skillId: resolvedSkillId,
        };
      }
    }
    this.#draftSlotSkills = nextDraftSlotSkills;
    this.#draftEnemyCount = clampEnemyCount(this.#draftEnemyCount ?? this.#resolveDraftEnemyCount());
    const nextDraftBreakEnemyIndexesByPartyIndex = {};
    for (const member of members) {
      const enemyIndexes = (this.#draftBreakEnemyIndexesByPartyIndex?.[member.partyIndex] ?? [])
        .map((enemyIndex) => Number(enemyIndex))
        .filter(
          (enemyIndex) =>
            Number.isInteger(enemyIndex) && enemyIndex >= 0 && enemyIndex < this.#draftEnemyCount
        );
      if (enemyIndexes.length > 0) {
        nextDraftBreakEnemyIndexesByPartyIndex[member.partyIndex] = [...new Set(enemyIndexes)].sort(
          (left, right) => left - right
        );
      }
    }
    this.#draftBreakEnemyIndexesByPartyIndex = nextDraftBreakEnemyIndexesByPartyIndex;
    const nextDraftFollowUpEnemyIndexByPartyIndex = {};
    const backMembers = this.#getMembersInPositionOrder().filter((member) => member.position >= 3);
    for (const member of backMembers) {
      const enemyIndex = Number(this.#draftFollowUpEnemyIndexByPartyIndex?.[member.partyIndex]);
      if (Number.isInteger(enemyIndex) && enemyIndex >= 0 && enemyIndex < this.#draftEnemyCount) {
        nextDraftFollowUpEnemyIndexByPartyIndex[member.partyIndex] = enemyIndex;
      }
    }
    this.#draftFollowUpEnemyIndexByPartyIndex = nextDraftFollowUpEnemyIndexByPartyIndex;
    for (const partyIndex of Object.keys(this.#draftKillEnemyIndexesByPartyIndex)) {
      this.#draftKillEnemyIndexesByPartyIndex[partyIndex] =
        (this.#draftKillEnemyIndexesByPartyIndex[partyIndex] ?? []).filter(
          (idx) => idx < this.#draftEnemyCount
        );
    }
    for (const partyIndex of Object.keys(this.#draftHpBreakEnemyIndexesByPartyIndex)) {
      this.#draftHpBreakEnemyIndexesByPartyIndex[partyIndex] =
        (this.#draftHpBreakEnemyIndexesByPartyIndex[partyIndex] ?? []).filter(
          (idx) => idx < this.#draftEnemyCount
        );
    }
  }

  /**
   * フロントスロットの skill select の innerHTML のみを差し替える軽量更新メソッド。
   */
  refreshSkillSelects() {
    const members = this.#getMembersInPositionOrder();
    const isCommitted = this.#isCommittedDisplayMode();
    const stateForCost = this.#stateBefore ?? null;

    for (const member of members.filter((m) => m.position <= 2)) {
      const sel = this.#root.querySelector(
        `[data-skill-select][data-position="${member.position}"]`,
      );
      if (!sel) continue;

      const skills = member.getActionSkills ? member.getActionSkills() : [];
      const visibleSkills = this.#getVisibleSkills(member);

      const replaySlot = isCommitted
        ? (this.#record?.actions?.find?.((a) => a.positionIndex === member.position) ?? null)
        : null;
      const selectedSkillId = isCommitted
        ? (replaySlot?.skillId ?? null)
        : (this.#draftSlotSkills?.[member.partyIndex]?.skillId ?? null);
      const effectiveSelectedId = this.#resolveDraftSkillId(member, selectedSkillId);
      if (!isCommitted && effectiveSelectedId != null) {
        this.#draftSlotSkills[member.partyIndex] = {
          partyIndex: member.partyIndex,
          skillId: effectiveSelectedId,
        };
      }
      sel.innerHTML = visibleSkills.map((s) => {
        const isSelected = s.skillId === effectiveSelectedId;
        const costLabel = formatSkillCostLabel(s, member, stateForCost);
        const elementHint = getElementHintForDuplicateNamedSkill(s, visibleSkills);
        const elementPrefix = elementHint ? `(${elementHint})` : '';
        return `<option value="${s.skillId}" data-cost-label="${costLabel}" data-element-prefix="${elementPrefix}" data-skill-name="${s.name}"${isSelected ? ' selected' : ''}>${costLabel}${elementPrefix}${s.name}</option>`;
      }).join('');
      this.#applyWidthBasedVisibility(sel);

      const badgeEl = this.#root.querySelector(`[data-skill-badges][data-position="${member.position}"]`);
      if (badgeEl) {
        const badgeSkill = effectiveSelectedId != null ? skills.find((s) => s.skillId === effectiveSelectedId) ?? null : null;
        badgeEl.innerHTML = this.#buildSkillBadgesHtml(badgeSkill, member, stateForCost);
      }
    }
  }

  update({
    rowMode = undefined,
    rowDiagnostics = undefined,
    record,
    replayTurn = undefined,
    operations = undefined,
    operationState = undefined,
    enemyPresets = undefined,
    stateBefore,
    stateAfter,
    previewResourceState = undefined,
    previewActionFlow = undefined,
    previewOdGaugeAfter = undefined,
    odState = undefined,
    simulatorSettings = undefined,
    openTargetPickerPartyIndex = null,
    isBreakEditorOpen = undefined,
    editDraft = undefined,
  }) {
    const previousDraftMode = this.#isDraftMode();
    const nextRowMode = rowMode === undefined
      ? this.#rowMode
      : (Object.values(TURN_ROW_MODES).includes(rowMode) ? rowMode : this.#rowMode);
    const nextSimulatorSettings =
      simulatorSettings === undefined
        ? this.#simulatorSettings
        : normalizeSimulatorSettings(simulatorSettings);
    const simulatorSettingsChanged = !areSimulatorSettingsEqual(
      this.#simulatorSettings,
      nextSimulatorSettings,
    );
    if (previousDraftMode && nextRowMode !== TURN_ROW_MODES.COMMITTED && simulatorSettingsChanged) {
      this.#draftTargets = {};
      this.#openTargetPickerPartyIndex = null;
      this.#isBreakEditorOpen = false;
      this.#isKillEditorOpen = false;
      this.#isFollowUpEditorOpen = false;
      this.#closeEnemySummonEditor();
    }
    if (rowDiagnostics !== undefined) {
      this.#rowDiagnostics = normalizeRowDiagnostics(rowDiagnostics);
    }
    this.#rowMode = nextRowMode;
    if (this.#isCommittedDisplayMode()) {
      this.#selectedSlotPosition = null;
    }
    this.#openTargetPickerPartyIndex = openTargetPickerPartyIndex;
    if (isBreakEditorOpen !== undefined) {
      this.#isBreakEditorOpen = Boolean(isBreakEditorOpen);
    }
    this.#isKillEditorOpen = this.#isKillEditorOpen && this.#isDraftMode();
    this.#isFollowUpEditorOpen = this.#isFollowUpEditorOpen && this.#isDraftMode();
    if (!(this.#isEnemySummonEditorOpen && this.#isDraftMode())) {
      this.#closeEnemySummonEditor();
    }
    this.#record = record;
    if (replayTurn !== undefined) this.#replayTurn = replayTurn;
    if (operations !== undefined) {
      this.#operations = Array.isArray(operations)
        ? operations.map((operation) => structuredClone(operation))
        : [];
    }
    if (operationState !== undefined) {
      this.#operationState = operationState && typeof operationState === 'object'
        ? structuredClone(operationState)
        : null;
    }
    if (enemyPresets !== undefined) {
      this.#enemyPresets = Array.isArray(enemyPresets)
        ? enemyPresets.map((preset) => structuredClone(preset))
        : [];
    }
    this.#stateBefore = stateBefore;
    this.#stateAfter = stateAfter;
    if (previewResourceState !== undefined) {
      this.#previewResourceState = previewResourceState && typeof previewResourceState === 'object'
        ? structuredClone(previewResourceState)
        : null;
    }
    if (previewActionFlow !== undefined) {
      this.#previewActionFlow = Array.isArray(previewActionFlow)
        ? structuredClone(previewActionFlow)
        : [];
    }
    if (previewOdGaugeAfter !== undefined) {
      this.#previewOdGaugeAfter = Number.isFinite(Number(previewOdGaugeAfter))
        ? Number(previewOdGaugeAfter)
        : null;
    }
    if (odState !== undefined) this.#odState = odState;
    if (simulatorSettings !== undefined) this.#simulatorSettings = nextSimulatorSettings;
    if (this.#isCommittedDisplayMode()) {
      this.#draftNote = String(this.#replayTurn?.note ?? '');
    } else if (editDraft !== undefined) {
      this.#applyEditDraft(editDraft);
    } else {
      this.#draftEnemyCount = this.#resolveDraftEnemyCount();
      this.#syncDraftSelections();
    }
    this.#syncEnemySummonSelection();
    this.#root.innerHTML = this.#buildHtml();
    this.#bindEvents();
    // 再描画後に選択ビジュアルを復元
    if (this.#selectedSlotPosition !== null) this.#updateSelectionVisual();
    if (this.#enemyDetailPopup) {
      this.#refreshEnemyDetailPopup();
    }
  }

  /**
   * 割込OD 発動可能候補を部分更新する（全再描画なし）。
   * スキル変更のたびに previewCurrentTurn が返す候補を反映する。
   * @param {number[]} candidates 発動可能レベルの配列（例: [1, 2]）
   */
  updateInterruptOdCandidates(candidates) {
    const sel = this.#root.querySelector('[data-od-type="interrupt"]');
    if (!sel) return;
    [...sel.options].forEach((opt) => {
      const lv = Number(opt.value);
      if (lv >= 1 && lv <= 3) {
        opt.disabled = !candidates.includes(lv);
      }
    });
    // 選択中レベルが候補から外れた場合はリセット
    const currentLv = Number(sel.value);
    if (currentLv >= 1 && !candidates.includes(currentLv)) {
      sel.value = '';
      if (this.#isEditMode()) {
        this.#setDraftOdSelection('interrupt', null);
        return;
      }
      this.#onOdChange?.(this.#turnIndex, 'interrupt', null);
    }
  }

  getCurrentEnemyCount() {
    return clampEnemyCount(this.#draftEnemyCount ?? this.#resolveDraftEnemyCount());
  }

  #closeEnemySummonEditor() {
    this.#isEnemySummonEditorOpen = false;
    this.#requestedEnemySummonIndex = null;
  }

  #openEnemySummonEditor(requestedEnemyIndex = null) {
    this.#isEnemySummonEditorOpen = true;
    const normalizedEnemyIndex = Number(requestedEnemyIndex);
    this.#requestedEnemySummonIndex =
      Number.isInteger(normalizedEnemyIndex) &&
      normalizedEnemyIndex >= 0 &&
      normalizedEnemyIndex < MAX_ENEMY_COUNT
        ? normalizedEnemyIndex
        : null;
  }

  #getEnemySummonPresets() {
    return Array.isArray(this.#enemyPresets) ? this.#enemyPresets : [];
  }

  #syncEnemySummonSelection() {
    const presets = this.#getEnemySummonPresets();
    if (presets.length === 0) {
      this.#draftSummonEnemyId = null;
      this.#closeEnemySummonEditor();
      return;
    }
    const currentId = Number(this.#draftSummonEnemyId);
    const hasCurrentSelection = presets.some((preset) => Number(preset?.id) === currentId);
    if (!hasCurrentSelection) {
      this.#draftSummonEnemyId = Number(presets[0]?.id ?? null);
    }
  }

  #findEnemySummonPresetById(enemyId) {
    const numericEnemyId = Number(enemyId);
    if (!Number.isFinite(numericEnemyId)) {
      return null;
    }
    return this.#getEnemySummonPresets().find((preset) => Number(preset?.id) === numericEnemyId) ?? null;
  }

  #resolveEnemySummonTargetSlotIndex(state = this.#stateBefore, requestedEnemyIndex = this.#requestedEnemySummonIndex) {
    const enemyCount = clampEnemyCount(state?.turnState?.enemyState?.enemyCount ?? DEFAULT_ENEMY_COUNT);
    const normalizedRequestedEnemyIndex = Number(requestedEnemyIndex);
    if (
      Number.isInteger(normalizedRequestedEnemyIndex) &&
      normalizedRequestedEnemyIndex >= 0 &&
      normalizedRequestedEnemyIndex < MAX_ENEMY_COUNT
    ) {
      if (normalizedRequestedEnemyIndex < enemyCount) {
        if (!this.#isEnemySlotAlive(normalizedRequestedEnemyIndex, state)) {
          return normalizedRequestedEnemyIndex;
        }
      } else if (normalizedRequestedEnemyIndex === enemyCount) {
        return normalizedRequestedEnemyIndex;
      }
    }
    if (enemyCount < MAX_ENEMY_COUNT) {
      return enemyCount;
    }
    for (let enemyIndex = 0; enemyIndex < enemyCount; enemyIndex += 1) {
      if (!this.#isEnemySlotAlive(enemyIndex, state)) {
        return enemyIndex;
      }
    }
    return null;
  }

  #buildEnemySummonOperation(preset) {
    if (!preset || typeof preset !== 'object') {
      return null;
    }
    const targetEnemyIndex = this.#resolveEnemySummonTargetSlotIndex();
    return {
      type: REPLAY_OPERATION_TYPES.SUMMON_ENEMY,
      payload: {
        enemyId: Number(preset.id),
        enemyName: String(preset.name ?? '').trim(),
        od_rate: Number(preset.od_rate ?? 0),
        max_d_rate: Number(preset.max_d_rate ?? 999),
        resistances: structuredClone(preset.resistances ?? {}),
        absorbElementList: Array.isArray(preset.absorbElementList)
          ? [...preset.absorbElementList]
          : [],
        ...(preset?.e_shield ? { e_shield: structuredClone(preset.e_shield) } : {}),
        ...(Number.isInteger(targetEnemyIndex) ? { targetEnemyIndex } : {}),
      },
    };
  }

  #buildProjectedEnemyPopupState() {
    return this.#stateBefore ?? this.#stateAfter;
  }

  #getEnemyDetailPopupActiveEnemyIndex(fallback = 0) {
    const popupActiveEnemyIndex = Number(this.#enemyDetailPopup?.getActiveEnemyIndex?.());
    if (Number.isInteger(popupActiveEnemyIndex) && popupActiveEnemyIndex >= 0 && popupActiveEnemyIndex < MAX_ENEMY_COUNT) {
      return popupActiveEnemyIndex;
    }
    const normalizedFallback = Number(fallback);
    return Number.isInteger(normalizedFallback) && normalizedFallback >= 0 && normalizedFallback < MAX_ENEMY_COUNT
      ? normalizedFallback
      : 0;
  }

  #clearPopupOutcomeRequest() {
    this.#popupOutcomeRequest = null;
  }

  #clearPopupEShieldEditorRequest() {
    this.#popupEShieldEditorRequest = null;
  }

  #clearPopupInlineEditorRequests() {
    this.#clearPopupOutcomeRequest();
    this.#clearPopupEShieldEditorRequest();
  }

  #setPopupOutcomeRequest(outcome, enemyIndex) {
    this.#clearPopupEShieldEditorRequest();
    const normalizedEnemyIndex = Number(enemyIndex);
    if (
      !Number.isInteger(normalizedEnemyIndex) ||
      normalizedEnemyIndex < 0 ||
      normalizedEnemyIndex >= MAX_ENEMY_COUNT
    ) {
      this.#popupOutcomeRequest = null;
      return;
    }
    const normalizedOutcome = String(outcome ?? '').trim();
    if (
      normalizedOutcome !== ACTION_OUTCOME_TYPES.BREAK &&
      normalizedOutcome !== ACTION_OUTCOME_TYPES.KILL &&
      normalizedOutcome !== ACTION_OUTCOME_TYPES.HP_BREAK
    ) {
      this.#popupOutcomeRequest = null;
      return;
    }
    this.#popupOutcomeRequest = {
      outcome: normalizedOutcome,
      enemyIndex: normalizedEnemyIndex,
    };
  }

  #setPopupEShieldEditorRequest(enemyIndex) {
    const normalizedEnemyIndex = Number(enemyIndex);
    if (
      !Number.isInteger(normalizedEnemyIndex) ||
      normalizedEnemyIndex < 0 ||
      normalizedEnemyIndex >= MAX_ENEMY_COUNT
    ) {
      this.#popupEShieldEditorRequest = null;
      return;
    }
    this.#clearPopupOutcomeRequest();
    this.#popupEShieldEditorRequest = {
      enemyIndex: normalizedEnemyIndex,
    };
  }

  #getPartyMemberByPartyIndex(partyIndex) {
    const normalizedPartyIndex = Number(partyIndex);
    if (!Number.isFinite(normalizedPartyIndex)) {
      return null;
    }
    return this.#stateBefore?.party?.find((candidate) => Number(candidate?.partyIndex) === normalizedPartyIndex) ?? null;
  }

  #setDraftEnemyTarget(partyIndex, enemyIndex = null) {
    if (!this.#isDraftMode()) {
      return false;
    }
    const normalizedPartyIndex = Number(partyIndex);
    if (!Number.isFinite(normalizedPartyIndex)) {
      return false;
    }
    if (!Number.isInteger(Number(enemyIndex)) || Number(enemyIndex) < 0) {
      if (!Object.hasOwn(this.#draftTargets ?? {}, normalizedPartyIndex)) {
        return false;
      }
      delete this.#draftTargets[normalizedPartyIndex];
      return true;
    }
    this.#draftTargets = {
      ...this.#draftTargets,
      [normalizedPartyIndex]: normalizeTurnReplayTarget({
        type: 'enemy',
        enemyIndex: Number(enemyIndex),
      }),
    };
    return true;
  }

  #setDraftBreakEnemyIndexes(partyIndex, enemyIndexes = []) {
    if (!this.#isDraftMode()) {
      return false;
    }
    const normalizedPartyIndex = Number(partyIndex);
    if (!Number.isFinite(normalizedPartyIndex)) {
      return false;
    }
    const enemyCount = this.getCurrentEnemyCount();
    const normalizedEnemyIndexes = [...new Set((Array.isArray(enemyIndexes) ? enemyIndexes : [])
      .map((enemyIndex) => Number(enemyIndex))
      .filter((enemyIndex) => Number.isInteger(enemyIndex) && enemyIndex >= 0 && enemyIndex < enemyCount))]
      .sort((left, right) => left - right);
    if (normalizedEnemyIndexes.length === 0) {
      delete this.#draftBreakEnemyIndexesByPartyIndex[normalizedPartyIndex];
      return true;
    }
    this.#draftBreakEnemyIndexesByPartyIndex = {
      ...this.#draftBreakEnemyIndexesByPartyIndex,
      [normalizedPartyIndex]: normalizedEnemyIndexes,
    };
    return true;
  }

  #setDraftKillEnemyIndexes(partyIndex, enemyIndexes = []) {
    if (!this.#isDraftMode()) {
      return false;
    }
    const normalizedPartyIndex = Number(partyIndex);
    if (!Number.isFinite(normalizedPartyIndex)) {
      return false;
    }
    const enemyCount = this.getCurrentEnemyCount();
    const normalizedEnemyIndexes = [...new Set((Array.isArray(enemyIndexes) ? enemyIndexes : [])
      .map((enemyIndex) => Number(enemyIndex))
      .filter((enemyIndex) => Number.isInteger(enemyIndex) && enemyIndex >= 0 && enemyIndex < enemyCount))]
      .sort((left, right) => left - right);
    if (normalizedEnemyIndexes.length === 0) {
      delete this.#draftKillEnemyIndexesByPartyIndex[normalizedPartyIndex];
      return true;
    }
    this.#draftKillEnemyIndexesByPartyIndex = {
      ...this.#draftKillEnemyIndexesByPartyIndex,
      [normalizedPartyIndex]: normalizedEnemyIndexes,
    };
    return true;
  }

  #setDraftHpBreakEnemyIndexes(partyIndex, enemyIndexes = []) {
    if (!this.#isDraftMode()) {
      return false;
    }
    const normalizedPartyIndex = Number(partyIndex);
    if (!Number.isFinite(normalizedPartyIndex)) {
      return false;
    }
    const enemyCount = this.getCurrentEnemyCount();
    const normalizedEnemyIndexes = [...new Set((Array.isArray(enemyIndexes) ? enemyIndexes : [])
      .map((enemyIndex) => Number(enemyIndex))
      .filter((enemyIndex) => Number.isInteger(enemyIndex) && enemyIndex >= 0 && enemyIndex < enemyCount))]
      .sort((left, right) => left - right);
    if (normalizedEnemyIndexes.length === 0) {
      delete this.#draftHpBreakEnemyIndexesByPartyIndex[normalizedPartyIndex];
      return true;
    }
    this.#draftHpBreakEnemyIndexesByPartyIndex = {
      ...this.#draftHpBreakEnemyIndexesByPartyIndex,
      [normalizedPartyIndex]: normalizedEnemyIndexes,
    };
    return true;
  }

  #refreshEnemyDetailPopup(activeEnemyIndex = this.#getEnemyDetailPopupActiveEnemyIndex()) {
    if (!this.#enemyDetailPopup) {
      return;
    }
    const payload = this.#buildEnemyDetailPopupPayload(this.#isCommittedDisplayMode(), activeEnemyIndex);
    this.#enemyDetailPopup.show(payload, activeEnemyIndex);
    this.#bindEnemyDetailPopupEditorEvents();
    if (this.#isEnemySummonEditorOpen) {
      this.#adjustPopoverPositions();
    }
  }

  #handleEnemyDetailPopupClosed() {
    this.#enemyDetailPopup = null;
    this.#clearPopupInlineEditorRequests();
    if (this.#isEnemySummonEditorOpen && this.#isDraftMode()) {
      this.#closeEnemySummonEditor();
      this.#rerenderDraftMode();
    }
  }

  #closeEnemyDetailPopup() {
    const popup = this.#enemyDetailPopup;
    if (!popup) {
      return;
    }
    this.#enemyDetailPopup = null;
    popup.close();
  }

  #handleEnemyDetailPopupTabChange(activeEnemyIndex) {
    const normalizedEnemyIndex = Number(activeEnemyIndex);
    const hasPopupInlineEditor = Boolean(this.#popupOutcomeRequest || this.#popupEShieldEditorRequest);
    if (!hasPopupInlineEditor) {
      return true;
    }
    if (
      !Number.isInteger(normalizedEnemyIndex) ||
      normalizedEnemyIndex < 0 ||
      normalizedEnemyIndex >= MAX_ENEMY_COUNT ||
      normalizedEnemyIndex === Number(
        this.#popupEShieldEditorRequest?.enemyIndex ?? this.#popupOutcomeRequest?.enemyIndex
      )
    ) {
      return true;
    }
    this.#clearPopupInlineEditorRequests();
    this.#refreshEnemyDetailPopup(normalizedEnemyIndex);
    return false;
  }

  #openEnemyDetailPopupPanel(eventLike, activeEnemyIndex = 0) {
    this.#openTargetPickerPartyIndex = null;
    this.#isBreakEditorOpen = false;
    this.#isKillEditorOpen = false;
    this.#isFollowUpEditorOpen = false;
    this.#closeEnemySummonEditor();
    this.#clearPopupInlineEditorRequests();
    const payload = this.#buildEnemyDetailPopupPayload(this.#isCommittedDisplayMode(), activeEnemyIndex);
    if (!payload || !Array.isArray(payload.enemies) || payload.enemies.length === 0) {
      return null;
    }
    this.#closeEnemyDetailPopup();
    this.#enemyDetailPopup = openEnemyDetailPopup(
      eventLike,
      payload,
      activeEnemyIndex,
      {
        onClose: () => this.#handleEnemyDetailPopupClosed(),
        onActiveEnemyIndexChange: ({ activeEnemyIndex: nextEnemyIndex }) =>
          this.#handleEnemyDetailPopupTabChange(nextEnemyIndex),
        resolveSkillDescription:
          typeof this.#store?.resolveSkillDescription === 'function'
            ? (skillId) => this.#store.resolveSkillDescription(skillId)
            : null,
      }
    );
    this.#bindEnemyDetailPopupEditorEvents();
    return this.#enemyDetailPopup;
  }

  #applyDraftAttributionMutation({ clearPopupOutcomeRequest = true } = {}) {
    if (clearPopupOutcomeRequest) {
      this.#clearPopupOutcomeRequest();
    }
    this.#rerenderDraftMode();
    this.#emitPreviewRequest();
  }

  #getDraftReplayTarget(partyIndex) {
    return normalizeTurnReplayTarget(this.#draftTargets?.[partyIndex]);
  }

  #getManualTargetConfigForMember({
    member,
    skill,
    effectiveSkill,
    enemyCount,
    explicitTarget = null,
    isCommitted = false,
  }) {
    const normalizedExplicitTarget = normalizeTurnReplayTarget(explicitTarget);
    return resolveTurnManualTargetConfig({
      member,
      skill,
      effectiveSkill,
      state: this.#stateBefore,
      enemyCount,
      simulatorSettings: this.#simulatorSettings,
      explicitTarget: normalizedExplicitTarget,
      preserveExplicitTarget: isCommitted || normalizedExplicitTarget.type !== 'none',
    });
  }

  #buildBreakSelectionContextBase({ member, isCommitted, enemyCount }) {
    if (!member) {
      return null;
    }
    const replaySlot = isCommitted
      ? (this.#record?.actions?.find?.((action) => action.positionIndex === member.position) ?? null)
      : null;
    const skillId = isCommitted
      ? (replaySlot?.skillId ?? null)
      : this.#resolveDraftSkillId(
          member,
          this.#draftSlotSkills?.[member.partyIndex]?.skillId ?? null
        );
    const skill = skillId != null ? member?.getSkill?.(skillId) ?? null : null;
    const effectiveSkill = this.#resolveEffectiveSkill(member, skill, this.#stateBefore);
    const breakAttributionMode = resolveTurnBreakAttributionMode({ skill, effectiveSkill });
    const explicitTarget = isCommitted
      ? this.#getRecordActionReplayTarget(replaySlot)
      : this.#getDraftReplayTarget(member.partyIndex);
    const singleTargetConfig = breakAttributionMode === TURN_BREAK_ATTRIBUTION_MODES.SINGLE
      ? resolveTurnTargetConfig({
          member,
          skill,
          effectiveSkill,
          state: this.#stateBefore,
          enemyCount,
        })
      : null;
    const currentReplayTarget = this.#getCurrentReplayTarget({
      partyIndex: member.partyIndex,
      targetConfig: singleTargetConfig,
      recordAction: replaySlot,
    });
    const currentTargetLabel =
      singleTargetConfig && currentReplayTarget.type === 'enemy'
        ? formatTurnTargetLabel(singleTargetConfig, currentReplayTarget, {
          enemyNamesByEnemy: this.#getEnemyNamesByEnemy(),
          store: this.#store,
          })
        : '';
    const rawBreakEnemyIndexes = isCommitted
      ? getBreakEnemyIndexesForPosition(
          this.#getReplayTurnActionOutcomeOverrides(enemyCount),
          member.position
        )
      : [...(this.#draftBreakEnemyIndexesByPartyIndex?.[member.partyIndex] ?? [])]
          .map((enemyIndex) => Number(enemyIndex))
          .filter(
            (enemyIndex) =>
              Number.isInteger(enemyIndex) && enemyIndex >= 0 && enemyIndex < enemyCount
          )
          .sort((left, right) => left - right);

    return {
      member,
      replaySlot,
      skill,
      effectiveSkill,
      breakAttributionMode,
      explicitTarget,
      singleTargetConfig,
      currentReplayTarget,
      currentTargetLabel,
      rawBreakEnemyIndexes,
      rawBreakEnabled: rawBreakEnemyIndexes.length > 0,
      claimedBreakEnemyIndexesBeforeSelf: [],
      blockedBreakEnemyIndexes: [],
      effectiveBreakEnemyIndexes: [],
      breakEnabled: false,
      isEnemyTargetSelectionManual: isEnemyTargetSelectionManual(this.#simulatorSettings),
    };
  }

  #resolveBreakSelectionContextMap({ isCommitted, enemyCount }) {
    const members = this.#getMembersInPositionOrder()
      .filter((member) => member.position <= 2)
      .filter((member) => !(this.#isExtraTurn() && !this.#isActionable(member)));
    const baseContexts = members
      .map((member) => this.#buildBreakSelectionContextBase({ member, isCommitted, enemyCount }))
      .filter(Boolean);
    const contextsByPartyIndex = new Map(
      baseContexts.map((context) => [Number(context.member.partyIndex), context])
    );
    const claimedBreakEnemyIndexes = new Set();
    const orderedContexts = sortTurnActionExecutionEntries(
      baseContexts.map((context) => ({
        position: context.member.position,
        skill: context.skill,
        context,
      }))
    );
    for (const entry of orderedContexts) {
      const context = entry.context;
      const claimedBefore = [...claimedBreakEnemyIndexes];
      const aliveRequestedEnemyIndexes = context.rawBreakEnemyIndexes.filter((enemyIndex) =>
        this.#isEnemySlotAlive(enemyIndex)
      );
      const blockedBreakEnemyIndexes = aliveRequestedEnemyIndexes.filter((enemyIndex) =>
        claimedBreakEnemyIndexes.has(enemyIndex)
      );
      let effectiveBreakEnemyIndexes = [];
      if (context.breakAttributionMode === TURN_BREAK_ATTRIBUTION_MODES.ALL) {
        effectiveBreakEnemyIndexes = aliveRequestedEnemyIndexes.filter(
          (enemyIndex) => !claimedBreakEnemyIndexes.has(enemyIndex)
        );
      } else if (
        context.breakAttributionMode === TURN_BREAK_ATTRIBUTION_MODES.SINGLE &&
        context.rawBreakEnabled &&
        context.currentReplayTarget.type === 'enemy'
      ) {
        const targetEnemyIndex = Number(context.currentReplayTarget.enemyIndex);
        if (
          Number.isInteger(targetEnemyIndex) &&
          this.#isEnemySlotAlive(targetEnemyIndex) &&
          !claimedBreakEnemyIndexes.has(targetEnemyIndex)
        ) {
          effectiveBreakEnemyIndexes = [targetEnemyIndex];
        }
      }
      effectiveBreakEnemyIndexes.forEach((enemyIndex) => claimedBreakEnemyIndexes.add(enemyIndex));
      contextsByPartyIndex.set(Number(context.member.partyIndex), {
        ...context,
        claimedBreakEnemyIndexesBeforeSelf: claimedBefore,
        blockedBreakEnemyIndexes,
        effectiveBreakEnemyIndexes,
        breakEnabled: effectiveBreakEnemyIndexes.length > 0,
      });
    }
    return contextsByPartyIndex;
  }

  #getBreakSelectionContext({ member, isCommitted, enemyCount }) {
    if (!member) {
      return null;
    }
    const contextsByPartyIndex = this.#resolveBreakSelectionContextMap({ isCommitted, enemyCount });
    return (
      contextsByPartyIndex.get(Number(member.partyIndex)) ??
      this.#buildBreakSelectionContextBase({ member, isCommitted, enemyCount })
    );
  }

  #isBreakEnemyClaimedForSelection(selectionContext, enemyIndex) {
    const normalizedEnemyIndex = Number(enemyIndex);
    if (!selectionContext || !Number.isInteger(normalizedEnemyIndex) || normalizedEnemyIndex < 0) {
      return false;
    }
    return selectionContext.claimedBreakEnemyIndexesBeforeSelf.includes(normalizedEnemyIndex);
  }

  #getPopupOutcomeCandidateContexts(enemyIndex, isCommitted = this.#isCommittedDisplayMode()) {
    const normalizedEnemyIndex = Number(enemyIndex);
    if (!Number.isInteger(normalizedEnemyIndex) || normalizedEnemyIndex < 0) {
      return [];
    }
    const enemyCount = isCommitted
      ? this.#getCurrentReplayTurnEnemyCount()
      : this.getCurrentEnemyCount();
    const members = this.#getMembersInPositionOrder().filter((member) => member.position <= 2);
    return members
      .filter((member) => !(this.#isExtraTurn() && !this.#isActionable(member)))
      .map((member) => {
        const selectionContext = this.#getBreakSelectionContext({
          member,
          isCommitted,
          enemyCount,
        });
        if (!selectionContext?.skill) {
          return {
            member,
            selectionContext,
            isCandidate: false,
            currentTargetMatches: false,
            canRetargetToRequestedEnemy: false,
          };
        }
        const requestedEnemyClaimed = this.#isBreakEnemyClaimedForSelection(
          selectionContext,
          normalizedEnemyIndex
        );
        if (selectionContext.breakAttributionMode === TURN_BREAK_ATTRIBUTION_MODES.ALL) {
          return {
            member,
            selectionContext,
            isCandidate: !requestedEnemyClaimed,
            currentTargetMatches: false,
            canRetargetToRequestedEnemy: !requestedEnemyClaimed,
          };
        }
        if (selectionContext.breakAttributionMode !== TURN_BREAK_ATTRIBUTION_MODES.SINGLE) {
          return {
            member,
            selectionContext,
            isCandidate: false,
            currentTargetMatches: false,
            canRetargetToRequestedEnemy: false,
          };
        }
        const currentTargetMatches =
          selectionContext.currentReplayTarget.type === 'enemy' &&
          Number(selectionContext.currentReplayTarget.enemyIndex) === normalizedEnemyIndex &&
          !requestedEnemyClaimed;
        const canRetargetToRequestedEnemy =
          !selectionContext.isEnemyTargetSelectionManual &&
          selectionContext.singleTargetConfig?.kind === 'enemy' &&
          (selectionContext.singleTargetConfig?.candidates ?? []).some(
            (candidate) =>
              Number(candidate?.enemyIndex) === normalizedEnemyIndex &&
              candidate?.disabled !== true
          ) &&
          !requestedEnemyClaimed;
        return {
          member,
          selectionContext,
          isCandidate: currentTargetMatches || canRetargetToRequestedEnemy,
          currentTargetMatches,
          canRetargetToRequestedEnemy,
        };
      })
      .filter(Boolean);
  }

  #resolvePopupImmediateOutcomeCandidate(enemyIndex) {
    const candidates = this.#getPopupOutcomeCandidateContexts(enemyIndex, false)
      .filter((candidate) => candidate.isCandidate);
    if (candidates.length !== 1) {
      return null;
    }
    const [candidate] = candidates;
    if (
      candidate.selectionContext?.breakAttributionMode !== TURN_BREAK_ATTRIBUTION_MODES.SINGLE ||
      candidate.currentTargetMatches !== true
    ) {
      return null;
    }
    return candidate;
  }

  #toggleBreakSingleSelectionForPartyIndex(partyIndex, requestedEnemyIndex = null, options = {}) {
    if (!this.#isDraftMode()) {
      return false;
    }
    const member = this.#getPartyMemberByPartyIndex(partyIndex);
    if (!member) {
      return false;
    }
    const enemyCount = this.getCurrentEnemyCount();
    const normalizedRequestedEnemyIndex = Number(requestedEnemyIndex);
    const previousTarget = this.#getDraftReplayTarget(partyIndex);
    const previousTargetEnemyIndex =
      previousTarget.type === 'enemy'
        ? Number(previousTarget.enemyIndex)
        : null;
    if (Number.isInteger(normalizedRequestedEnemyIndex) && normalizedRequestedEnemyIndex >= 0) {
      this.#setDraftEnemyTarget(partyIndex, normalizedRequestedEnemyIndex);
    }
    const selectionContext = this.#getBreakSelectionContext({
      member,
      isCommitted: false,
      enemyCount,
    });
    if (!selectionContext) {
      return false;
    }
    const targetEnemyIndex =
      Number.isInteger(normalizedRequestedEnemyIndex) && normalizedRequestedEnemyIndex >= 0
        ? normalizedRequestedEnemyIndex
        : selectionContext.currentReplayTarget.type === 'enemy'
          ? Number(selectionContext.currentReplayTarget.enemyIndex)
          : null;
    if (!Number.isInteger(targetEnemyIndex) || targetEnemyIndex < 0 || targetEnemyIndex >= enemyCount) {
      if (Number.isInteger(normalizedRequestedEnemyIndex) && normalizedRequestedEnemyIndex >= 0) {
        this.#setDraftEnemyTarget(partyIndex, previousTargetEnemyIndex);
      }
      return false;
    }
    if (this.#isBreakEnemyClaimedForSelection(selectionContext, targetEnemyIndex)) {
      if (Number.isInteger(normalizedRequestedEnemyIndex) && normalizedRequestedEnemyIndex >= 0) {
        this.#setDraftEnemyTarget(partyIndex, previousTargetEnemyIndex);
      }
      return false;
    }
    const nextEnemyIndexes = selectionContext.breakEnabled ? [] : [targetEnemyIndex];
    this.#setDraftBreakEnemyIndexes(partyIndex, nextEnemyIndexes);
    this.#applyDraftAttributionMutation({
      clearPopupOutcomeRequest: options?.clearPopupOutcomeRequest !== false,
    });
    return true;
  }

  #toggleBreakMultiSelectionForPartyIndex(partyIndex, enemyIndex) {
    if (!this.#isDraftMode()) {
      return false;
    }
    const member = this.#getPartyMemberByPartyIndex(partyIndex);
    if (!member) {
      return false;
    }
    const enemyCount = this.getCurrentEnemyCount();
    const currentEnemyIndexes = this.#getCurrentBreakEnemyIndexes({
      member,
      isCommitted: false,
      enemyCount,
    });
    const normalizedEnemyIndex = Number(enemyIndex);
    if (
      !Number.isInteger(normalizedEnemyIndex) ||
      normalizedEnemyIndex < 0 ||
      normalizedEnemyIndex >= enemyCount ||
      !this.#isEnemySlotAlive(normalizedEnemyIndex)
    ) {
      return false;
    }
    const selectionContext = this.#getBreakSelectionContext({
      member,
      isCommitted: false,
      enemyCount,
    });
    if (
      !currentEnemyIndexes.includes(normalizedEnemyIndex) &&
      this.#isBreakEnemyClaimedForSelection(selectionContext, normalizedEnemyIndex)
    ) {
      return false;
    }
    const nextEnemyIndexes = currentEnemyIndexes.includes(normalizedEnemyIndex)
      ? currentEnemyIndexes.filter((candidate) => candidate !== normalizedEnemyIndex)
      : [...currentEnemyIndexes, normalizedEnemyIndex];
    this.#setDraftBreakEnemyIndexes(partyIndex, nextEnemyIndexes);
    this.#applyDraftAttributionMutation({ clearPopupOutcomeRequest: false });
    return true;
  }

  #toggleKillSelectionForPartyIndex(partyIndex, enemyIndex) {
    if (!this.#isDraftMode()) {
      return false;
    }
    const normalizedEnemyIndex = Number(enemyIndex);
    if (
      !Number.isInteger(normalizedEnemyIndex) ||
      normalizedEnemyIndex < 0 ||
      this.#canEnemySlotHpBreak(normalizedEnemyIndex)
    ) {
      return false;
    }
    const currentEnemyIndexes = [
      ...(this.#draftKillEnemyIndexesByPartyIndex?.[partyIndex] ?? []),
    ].filter((candidate) => Number.isInteger(candidate) && candidate >= 0);
    const nextEnemyIndexes = currentEnemyIndexes.includes(normalizedEnemyIndex)
      ? currentEnemyIndexes.filter((candidate) => candidate !== normalizedEnemyIndex)
      : [...currentEnemyIndexes, normalizedEnemyIndex];
    this.#setDraftKillEnemyIndexes(partyIndex, nextEnemyIndexes);
    this.#applyDraftAttributionMutation({ clearPopupOutcomeRequest: false });
    return true;
  }

  #toggleKillSingleSelectionForPartyIndex(partyIndex, requestedEnemyIndex = null, options = {}) {
    if (!this.#isDraftMode()) {
      return false;
    }
    const member = this.#getPartyMemberByPartyIndex(partyIndex);
    if (!member) {
      return false;
    }
    const enemyCount = this.getCurrentEnemyCount();
    const normalizedRequestedEnemyIndex = Number(requestedEnemyIndex);
    if (Number.isInteger(normalizedRequestedEnemyIndex) && normalizedRequestedEnemyIndex >= 0) {
      this.#setDraftEnemyTarget(partyIndex, normalizedRequestedEnemyIndex);
    }
    const selectionContext = this.#getBreakSelectionContext({
      member,
      isCommitted: false,
      enemyCount,
    });
    if (!selectionContext) {
      return false;
    }
    const targetEnemyIndex =
      Number.isInteger(normalizedRequestedEnemyIndex) && normalizedRequestedEnemyIndex >= 0
        ? normalizedRequestedEnemyIndex
        : selectionContext.currentReplayTarget.type === 'enemy'
          ? Number(selectionContext.currentReplayTarget.enemyIndex)
          : null;
    if (
      !Number.isInteger(targetEnemyIndex) ||
      targetEnemyIndex < 0 ||
      targetEnemyIndex >= enemyCount ||
      this.#canEnemySlotHpBreak(targetEnemyIndex)
    ) {
      return false;
    }
    const currentEnemyIndexes = [
      ...(this.#draftKillEnemyIndexesByPartyIndex?.[partyIndex] ?? []),
    ].filter((candidate) => Number.isInteger(candidate) && candidate >= 0 && candidate < enemyCount);
    const nextEnemyIndexes = currentEnemyIndexes.includes(targetEnemyIndex)
      ? currentEnemyIndexes.filter((candidate) => candidate !== targetEnemyIndex)
      : [...currentEnemyIndexes, targetEnemyIndex];
    this.#setDraftKillEnemyIndexes(partyIndex, nextEnemyIndexes);
    this.#applyDraftAttributionMutation({
      clearPopupOutcomeRequest: options?.clearPopupOutcomeRequest !== false,
    });
    return true;
  }

  #toggleHpBreakSelectionForPartyIndex(partyIndex, enemyIndex) {
    if (!this.#isDraftMode()) {
      return false;
    }
    const normalizedEnemyIndex = Number(enemyIndex);
    if (
      !Number.isInteger(normalizedEnemyIndex) ||
      normalizedEnemyIndex < 0 ||
      !this.#canEnemySlotHpBreak(normalizedEnemyIndex)
    ) {
      return false;
    }
    const currentEnemyIndexes = [
      ...(this.#draftHpBreakEnemyIndexesByPartyIndex?.[partyIndex] ?? []),
    ].filter((candidate) => Number.isInteger(candidate) && candidate >= 0);
    const nextEnemyIndexes = currentEnemyIndexes.includes(normalizedEnemyIndex)
      ? currentEnemyIndexes.filter((candidate) => candidate !== normalizedEnemyIndex)
      : [...currentEnemyIndexes, normalizedEnemyIndex];
    this.#setDraftHpBreakEnemyIndexes(partyIndex, nextEnemyIndexes);
    this.#applyDraftAttributionMutation({ clearPopupOutcomeRequest: false });
    return true;
  }

  #toggleHpBreakSingleSelectionForPartyIndex(partyIndex, requestedEnemyIndex = null, options = {}) {
    if (!this.#isDraftMode()) {
      return false;
    }
    const member = this.#getPartyMemberByPartyIndex(partyIndex);
    if (!member) {
      return false;
    }
    const enemyCount = this.getCurrentEnemyCount();
    const normalizedRequestedEnemyIndex = Number(requestedEnemyIndex);
    if (Number.isInteger(normalizedRequestedEnemyIndex) && normalizedRequestedEnemyIndex >= 0) {
      this.#setDraftEnemyTarget(partyIndex, normalizedRequestedEnemyIndex);
    }
    const selectionContext = this.#getBreakSelectionContext({
      member,
      isCommitted: false,
      enemyCount,
    });
    if (!selectionContext) {
      return false;
    }
    const targetEnemyIndex =
      Number.isInteger(normalizedRequestedEnemyIndex) && normalizedRequestedEnemyIndex >= 0
        ? normalizedRequestedEnemyIndex
        : selectionContext.currentReplayTarget.type === 'enemy'
          ? Number(selectionContext.currentReplayTarget.enemyIndex)
          : null;
    if (
      !Number.isInteger(targetEnemyIndex) ||
      targetEnemyIndex < 0 ||
      targetEnemyIndex >= enemyCount ||
      !this.#canEnemySlotHpBreak(targetEnemyIndex)
    ) {
      return false;
    }
    const currentEnemyIndexes = [
      ...(this.#draftHpBreakEnemyIndexesByPartyIndex?.[partyIndex] ?? []),
    ].filter((candidate) => Number.isInteger(candidate) && candidate >= 0 && candidate < enemyCount);
    const nextEnemyIndexes = currentEnemyIndexes.includes(targetEnemyIndex)
      ? currentEnemyIndexes.filter((candidate) => candidate !== targetEnemyIndex)
      : [...currentEnemyIndexes, targetEnemyIndex];
    this.#setDraftHpBreakEnemyIndexes(partyIndex, nextEnemyIndexes);
    this.#applyDraftAttributionMutation({
      clearPopupOutcomeRequest: options?.clearPopupOutcomeRequest !== false,
    });
    return true;
  }

  #handleEnemyPopupOutcomeAction(outcome, enemyIndex, activeEnemyIndex = enemyIndex) {
    if (!this.#isDraftMode()) {
      return { closePopup: false };
    }
    this.#closeEnemySummonEditor();
    this.#clearPopupEShieldEditorRequest();
    this.#isBreakEditorOpen = false;
    this.#isKillEditorOpen = false;
    const normalizedEnemyIndex = Number(enemyIndex);
    const immediateCandidate = outcome === ACTION_OUTCOME_TYPES.HP_BREAK
      ? null
      : this.#resolvePopupImmediateOutcomeCandidate(normalizedEnemyIndex);
    if (immediateCandidate) {
      if (outcome === ACTION_OUTCOME_TYPES.BREAK) {
        this.#toggleBreakSingleSelectionForPartyIndex(
          immediateCandidate.member.partyIndex,
          normalizedEnemyIndex
        );
      } else if (outcome === ACTION_OUTCOME_TYPES.HP_BREAK) {
        this.#toggleHpBreakSingleSelectionForPartyIndex(
          immediateCandidate.member.partyIndex,
          normalizedEnemyIndex
        );
      } else {
        this.#toggleKillSingleSelectionForPartyIndex(
          immediateCandidate.member.partyIndex,
          normalizedEnemyIndex
        );
      }
      return { closePopup: false };
    }
    this.#setPopupOutcomeRequest(outcome, normalizedEnemyIndex);
    this.#refreshEnemyDetailPopup(activeEnemyIndex);
    return { closePopup: false };
  }

  /** コミットボタン押下時に呼ばれる前に TurnAreaController が現在のスロット選択を収集するため */
  getCurrentSlotActions() {
    const actions = {};
    const enemyCount = this.getCurrentEnemyCount();
    const members = this.#getMembersInPositionOrder().filter((member) => member.position <= 2);
    for (const member of members) {
      if (this.#isExtraTurn() && !this.#isActionable(member)) {
        continue;
      }
      const skillId = this.#resolveDraftSkillId(
        member,
        this.#draftSlotSkills?.[member.partyIndex]?.skillId ?? null
      );
      if (skillId == null) {
        continue;
      }
      const skill = member?.getSkill?.(skillId) ?? null;
      const effectiveSkill = this.#resolveEffectiveSkill(member, skill, this.#stateBefore);
      const explicitTarget = this.#getDraftReplayTarget(member.partyIndex);
      const manualTargetConfig = this.#getManualTargetConfigForMember({
        member,
        skill,
        effectiveSkill,
        enemyCount,
        explicitTarget,
      });
      const target = this.#getCurrentReplayTarget({
        partyIndex: member.partyIndex,
        targetConfig: manualTargetConfig,
        recordAction: null,
      });
      actions[member.partyIndex] = {
        partyIndex: member.partyIndex,
        skillId,
        target,
      };
    }
    return actions;
  }

  getCurrentNote() {
    return String(this.#draftNote ?? '');
  }

  #extractEnemyAttackTargetCharacterIdsFromOverrideEntries(overrideEntries = []) {
    const entry = (Array.isArray(overrideEntries) ? overrideEntries : []).find(
      (candidate) =>
        String(candidate?.type ?? '') === REPLAY_OVERRIDE_ENTRY_TYPES.ENEMY_ATTACK_TARGET_CHARACTER_IDS
    );
    return [...new Set(
      (Array.isArray(entry?.payload) ? entry.payload : [])
        .map((characterId) => String(characterId ?? '').trim())
        .filter(Boolean)
    )];
  }

  #extractDpStateByPartyIndexFromOverrideEntries(overrideEntries = []) {
    const entry = (Array.isArray(overrideEntries) ? overrideEntries : []).find(
      (candidate) => String(candidate?.type ?? '') === REPLAY_OVERRIDE_ENTRY_TYPES.DP_STATE_BY_PARTY_INDEX
    );
    const payload = entry?.payload && typeof entry.payload === 'object' && !Array.isArray(entry.payload)
      ? entry.payload
      : {};
    return Object.fromEntries(
      Object.entries(payload)
        .map(([partyIndex, state]) => {
          const numericPartyIndex = Number(partyIndex);
          if (!Number.isInteger(numericPartyIndex) || !state || typeof state !== 'object' || Array.isArray(state)) {
            return null;
          }
          return [String(numericPartyIndex), structuredClone(state)];
        })
        .filter(Boolean)
    );
  }

  getCurrentOverrideEntries() {
    const entries = [];
    const attackedIds = [...new Set(
      (Array.isArray(this.#draftEnemyAttackTargetCharacterIds) ? this.#draftEnemyAttackTargetCharacterIds : [])
        .map((characterId) => String(characterId ?? '').trim())
        .filter(Boolean)
    )];
    if (attackedIds.length > 0) {
      entries.push({
        type: REPLAY_OVERRIDE_ENTRY_TYPES.ENEMY_ATTACK_TARGET_CHARACTER_IDS,
        payload: attackedIds,
      });
    }
    const dpStateByPartyIndex = Object.fromEntries(
      Object.entries(this.#draftDpStateByPartyIndex ?? {})
        .filter(([, state]) => state && typeof state === 'object' && !Array.isArray(state))
        .map(([partyIndex, state]) => [String(Number(partyIndex)), structuredClone(state)])
        .filter(([partyIndex]) => Number.isInteger(Number(partyIndex)))
    );
    if (Object.keys(dpStateByPartyIndex).length > 0) {
      entries.push({
        type: REPLAY_OVERRIDE_ENTRY_TYPES.DP_STATE_BY_PARTY_INDEX,
        payload: dpStateByPartyIndex,
      });
    }
    return entries;
  }

  getCurrentActionOutcomeOverrides() {
    const enemyCount = this.getCurrentEnemyCount();
    const overrides = [];
    const members = this.#getMembersInPositionOrder().filter((member) => member.position <= 2);
    for (const member of members) {
      if (this.#isExtraTurn() && !this.#isActionable(member)) {
        continue;
      }
      const selectionContext = this.#getBreakSelectionContext({
        member,
        isCommitted: false,
        enemyCount,
      });
      if (!selectionContext) {
        continue;
      }
      let enemyIndexes = [];
      if (selectionContext.breakAttributionMode === TURN_BREAK_ATTRIBUTION_MODES.ALL) {
        enemyIndexes = selectionContext.effectiveBreakEnemyIndexes;
      } else if (
        selectionContext.breakAttributionMode === TURN_BREAK_ATTRIBUTION_MODES.SINGLE &&
        selectionContext.breakEnabled
      ) {
        enemyIndexes = selectionContext.effectiveBreakEnemyIndexes;
      }
      if (enemyIndexes.length === 0) {
        continue;
      }
      overrides.push({
        position: member.position,
        outcome: ACTION_OUTCOME_TYPES.BREAK,
        enemyIndexes,
      });
    }
    // Kill エントリ（未コミット行のみ）
    for (const member of members) {
      if (this.#isExtraTurn() && !this.#isActionable(member)) {
        continue;
      }
      const hpBreakEnemyIndexes = (this.#draftHpBreakEnemyIndexesByPartyIndex[member.partyIndex] ?? []).filter(
        (idx) => idx < enemyCount && this.#isEnemySlotAlive(idx) && this.#canEnemySlotHpBreak(idx)
      );
      if (hpBreakEnemyIndexes.length === 0) continue;
      overrides.push({
        position: member.position,
        outcome: ACTION_OUTCOME_TYPES.HP_BREAK,
        enemyIndexes: hpBreakEnemyIndexes,
      });
    }
    for (const member of members) {
      if (this.#isExtraTurn() && !this.#isActionable(member)) {
        continue;
      }
      const killEnemyIndexes = (this.#draftKillEnemyIndexesByPartyIndex[member.partyIndex] ?? []).filter(
        (idx) => idx < enemyCount && this.#isEnemySlotAlive(idx) && !this.#canEnemySlotHpBreak(idx)
      );
      if (killEnemyIndexes.length === 0) continue;
      overrides.push({
        position: member.position,
        outcome: ACTION_OUTCOME_TYPES.KILL,
        enemyIndexes: killEnemyIndexes,
      });
    }
    return normalizeActionOutcomeOverrides(overrides, enemyCount);
  }

  getCurrentTurnEditDraft() {
    const slotActions = this.getCurrentSlotActions();
    const slots = Array.from({ length: 6 }, (_, position) => {
      const member =
        this.#stateBefore?.party?.find((candidate) => Number(candidate?.position) === position) ?? null;
      const action = member ? slotActions[member.partyIndex] : null;
      return {
        styleId: member?.styleId ?? null,
        skillId: action?.skillId ?? null,
        ...(action?.target?.type && action.target.type !== 'none'
          ? { target: normalizeTurnReplayTarget(action.target) }
          : {}),
      };
    });
    return {
      slots,
      operations: Array.isArray(this.#operations)
        ? this.#operations.map((operation) => structuredClone(operation))
        : [],
      note: this.getCurrentNote(),
      enemyCount: this.getCurrentEnemyCount(),
      overrideEntries: this.getCurrentOverrideEntries(),
      actionOutcomeOverrides: this.getCurrentActionOutcomeOverrides(),
      followUpOverrides: this.getCurrentFollowUpOverrides(),
    };
  }

  #rerenderDraftMode() {
    this.update({
      rowMode: this.#rowMode,
      rowDiagnostics: this.#rowDiagnostics,
      record: null,
      replayTurn: this.#replayTurn,
      operations: this.#operations,
      operationState: this.#operationState,
      enemyPresets: this.#enemyPresets,
      stateBefore: this.#stateBefore,
      stateAfter: this.#stateAfter,
      previewResourceState: this.#previewResourceState,
      previewActionFlow: this.#previewActionFlow,
      previewOdGaugeAfter: this.#previewOdGaugeAfter,
      odState: this.#odState,
      simulatorSettings: this.#simulatorSettings,
      openTargetPickerPartyIndex: this.#openTargetPickerPartyIndex,
      isBreakEditorOpen: this.#isBreakEditorOpen,
    });
  }

  #emitPreviewRequest() {
    this.#onPreviewRequest?.(
      this.#turnIndex,
      this.#isEditMode() ? this.getCurrentTurnEditDraft() : this.getCurrentSlotActions()
    );
  }

  #replaceDraftOperationByType(type, nextOperation = null) {
    this.#operations = (Array.isArray(this.#operations) ? this.#operations : [])
      .filter((operation) => String(operation?.type ?? '') !== String(type));
    if (nextOperation) {
      this.#operations.push(structuredClone(nextOperation));
    }
  }

  #findEnemyEShieldOperationForEnemyIndex(enemyIndex, operations = this.#operations) {
    const normalizedEnemyIndex = Number(enemyIndex);
    if (!Number.isInteger(normalizedEnemyIndex) || normalizedEnemyIndex < 0) {
      return null;
    }
    return (Array.isArray(operations) ? operations : []).find(
      (operation) =>
        String(operation?.type ?? '') === REPLAY_OPERATION_TYPES.SET_ENEMY_E_SHIELD &&
        Number(operation?.payload?.targetEnemyIndex) === normalizedEnemyIndex
    ) ?? null;
  }

  #createEnemyEShieldOperation(enemyIndex, eShieldState = null) {
    const normalizedEnemyIndex = Number(enemyIndex);
    if (!Number.isInteger(normalizedEnemyIndex) || normalizedEnemyIndex < 0 || normalizedEnemyIndex >= MAX_ENEMY_COUNT) {
      return null;
    }
    return {
      type: REPLAY_OPERATION_TYPES.SET_ENEMY_E_SHIELD,
      payload: {
        targetEnemyIndex: normalizedEnemyIndex,
        eShieldState: eShieldState ? structuredClone(eShieldState) : null,
      },
    };
  }

  #buildDpOverrideState(member, mode) {
    const dpState = member?.dpState ?? {};
    const baseMaxDp = Number(dpState.baseMaxDp ?? 0);
    const effectiveDpCap = Number(dpState.effectiveDpCap ?? baseMaxDp);
    const cap = Number.isFinite(effectiveDpCap) && effectiveDpCap > 0
      ? effectiveDpCap
      : baseMaxDp;
    if (!Number.isFinite(cap) || cap <= 0) {
      return null;
    }
    const currentDp = String(mode) === '99' ? Math.max(1, cap - 1) : cap;
    return {
      baseMaxDp: Number.isFinite(baseMaxDp) && baseMaxDp > 0 ? baseMaxDp : cap,
      currentDp,
      effectiveDpCap: cap,
      minDp: Number(dpState.minDp ?? 0),
    };
  }

  #replaceDraftEnemyEShieldOperation(enemyIndex, nextOperation = null) {
    const normalizedEnemyIndex = Number(enemyIndex);
    if (!Number.isInteger(normalizedEnemyIndex) || normalizedEnemyIndex < 0) {
      return false;
    }
    const nextOperations = [];
    let replaced = false;
    for (const operation of Array.isArray(this.#operations) ? this.#operations : []) {
      if (
        String(operation?.type ?? '') === REPLAY_OPERATION_TYPES.SET_ENEMY_E_SHIELD &&
        Number(operation?.payload?.targetEnemyIndex) === normalizedEnemyIndex
      ) {
        if (!replaced && nextOperation) {
          nextOperations.push(structuredClone(nextOperation));
          replaced = true;
        }
        continue;
      }
      nextOperations.push(structuredClone(operation));
    }
    if (!replaced && nextOperation) {
      nextOperations.push(structuredClone(nextOperation));
    }
    this.#operations = nextOperations;
    return true;
  }

  #createFormChangeOperation(member, formKey) {
    if (!member?.hasFormChange?.()) {
      return null;
    }
    const normalizedFormKey = String(formKey ?? '').trim();
    const formInfo = member?.formChange?.forms?.[normalizedFormKey] ?? null;
    if (!normalizedFormKey || !formInfo) {
      return null;
    }
    return {
      type: REPLAY_OPERATION_TYPES.CHANGE_FORM,
      payload: {
        characterId: String(member.characterId ?? ''),
        formKey: normalizedFormKey,
        displayName: String(formInfo.displayName ?? ''),
      },
    };
  }

  #upsertDraftFormChangeOperation(member, formKey) {
    const operation = this.#createFormChangeOperation(member, formKey);
    if (!operation) {
      return false;
    }
    const characterId = String(member?.characterId ?? '');
    const currentFormKey = String(member?.getCurrentFormKey?.() ?? '').trim();
    const nextFormKey = String(formKey ?? '').trim();
    const existingOperations = Array.isArray(this.#operations) ? this.#operations : [];
    const nextOperations = existingOperations.filter(
      (entry) =>
        String(entry?.type ?? '') !== REPLAY_OPERATION_TYPES.CHANGE_FORM ||
        String(entry?.payload?.characterId ?? '') !== characterId
    );
    if (nextFormKey !== currentFormKey) {
      nextOperations.push(operation);
    }
    const changed =
      JSON.stringify(existingOperations) !== JSON.stringify(nextOperations);
    if (!changed) {
      return false;
    }
    this.#operations = nextOperations.map((entry) => structuredClone(entry));
    return true;
  }

  #requestFormChange(member, formKey) {
    if (!member?.hasFormChange?.()) {
      return false;
    }
    const operation = this.#createFormChangeOperation(member, formKey);
    if (!operation) {
      return false;
    }
    if (this.#isEditMode()) {
      return this.#upsertDraftFormChangeOperation(member, formKey);
    }
    return Boolean(this.#onOperationAdd?.(this.#turnIndex, operation));
  }

  #syncFormChangeForSkill(member, skillId) {
    const skill = member?.getSkill?.(skillId) ?? null;
    const requiredFormKey = member?.resolveRequiredFormKey?.(skill?.cardForm ?? '') ?? null;
    if (!requiredFormKey) {
      return false;
    }
    return this.#requestFormChange(member, requiredFormKey);
  }

  #setDraftOdSelection(odType, level) {
    const normalizedLevel =
      Number.isFinite(Number(level)) && Number(level) >= 1 && Number(level) <= 3
        ? Number(level)
        : null;
    if (odType === 'preemptive') {
      this.#replaceDraftOperationByType(
        REPLAY_OPERATION_TYPES.ACTIVATE_PREEMPTIVE_OD,
        normalizedLevel == null
          ? null
          : {
              type: REPLAY_OPERATION_TYPES.ACTIVATE_PREEMPTIVE_OD,
              payload: { level: normalizedLevel },
            }
      );
      return;
    }
    if (odType === 'interrupt') {
      this.#replaceDraftOperationByType(
        REPLAY_OPERATION_TYPES.RESERVE_INTERRUPT_OD,
        normalizedLevel == null
          ? null
          : {
              type: REPLAY_OPERATION_TYPES.RESERVE_INTERRUPT_OD,
              payload: { level: normalizedLevel },
            }
      );
    }
  }

  #addDraftOperation(operation) {
    const type = String(operation?.type ?? '').trim();
    if (!type) {
      return false;
    }
    const definition = replayOperationRegistry.get(type);
    if (!definition) {
      return false;
    }
    if (definition.allowMultiple === false) {
      const alreadyQueued = (this.#operations ?? []).some((entry) => entry?.type === type);
      if (alreadyQueued) {
        return false;
      }
    }
    this.#operations = [...(this.#operations ?? []), structuredClone(operation)];
    return true;
  }

  #buildEnemyEShieldStateFromEditorValues({
    current = 0,
    max = 0,
    elements = [],
    defUpRate = 0,
    damageLimit = 0,
  } = {}) {
    const normalizedCurrent = normalizeNonNegativeInteger(current);
    const normalizedMaxInput = normalizeNonNegativeInteger(max);
    const normalizedMax = Math.max(normalizedCurrent, normalizedMaxInput);
    return cloneEnemyEShieldState({
      current: normalizedCurrent,
      max: normalizedMax,
      elements: normalizeEnemyEShieldElements(elements),
      defUpRate: normalizeFiniteNumber(defUpRate),
      damageLimit: normalizeFiniteNumber(damageLimit),
    });
  }

  #syncEnemyEShieldEditorCountInputs(editorRoot) {
    const currentInput = editorRoot?.querySelector('[data-role="enemy-popup-eshield-current"]');
    const maxInput = editorRoot?.querySelector('[data-role="enemy-popup-eshield-max"]');
    if (!currentInput || !maxInput) {
      return;
    }
    const normalizedCurrent = normalizeNonNegativeInteger(currentInput.value);
    const normalizedMax = normalizeNonNegativeInteger(maxInput.value);
    if (normalizedCurrent > normalizedMax) {
      maxInput.value = String(normalizedCurrent);
    }
  }

  #buildEnemyEShieldStateFromEditor(editorRoot) {
    const currentInput = editorRoot?.querySelector('[data-role="enemy-popup-eshield-current"]');
    const maxInput = editorRoot?.querySelector('[data-role="enemy-popup-eshield-max"]');
    const defUpRateInput = editorRoot?.querySelector('[data-role="enemy-popup-eshield-def-up-rate"]');
    const damageLimitInput = editorRoot?.querySelector('[data-role="enemy-popup-eshield-damage-limit"]');
    if (!currentInput || !maxInput || !defUpRateInput || !damageLimitInput) {
      return null;
    }
    const elements = [...editorRoot.querySelectorAll('[data-role="enemy-popup-eshield-element-toggle"]')]
      .filter((input) => input.checked)
      .map((input) => String(input.dataset.element ?? '').trim())
      .filter(Boolean);
    return this.#buildEnemyEShieldStateFromEditorValues({
      current: currentInput.value,
      max: maxInput.value,
      elements,
      defUpRate: defUpRateInput.value,
      damageLimit: damageLimitInput.value,
    });
  }

  #applyEnemyPopupEShieldEditor(editorRoot) {
    if (!this.#isDraftMode()) {
      return false;
    }
    const targetEnemyIndex = Number(editorRoot?.dataset.enemyIndex);
    if (!Number.isInteger(targetEnemyIndex) || targetEnemyIndex < 0 || targetEnemyIndex >= MAX_ENEMY_COUNT) {
      return false;
    }
    this.#syncEnemyEShieldEditorCountInputs(editorRoot);
    const eShieldState = this.#buildEnemyEShieldStateFromEditor(editorRoot);
    const operation = this.#createEnemyEShieldOperation(targetEnemyIndex, eShieldState);
    if (!operation) {
      return false;
    }
    if (this.#isEditMode()) {
      if (!this.#replaceDraftEnemyEShieldOperation(targetEnemyIndex, operation)) {
        return false;
      }
      this.#rerenderDraftMode();
      this.#emitPreviewRequest();
      return true;
    }
    return Boolean(this.#onOperationAdd?.(this.#turnIndex, operation));
  }

  #removeDraftOperation(operationIndex) {
    const numericIndex = Number(operationIndex);
    if (
      !Number.isInteger(numericIndex) ||
      numericIndex < 0 ||
      numericIndex >= (this.#operations?.length ?? 0)
    ) {
      return false;
    }
    this.#operations = this.#operations.filter((_, index) => index !== numericIndex);
    return true;
  }

  #buildOperationChipsHtml() {
    if (!Array.isArray(this.#operations) || this.#operations.length === 0) {
      return '';
    }
    const canRemove = this.#isDraftMode();
    const chipHtml = this.#operations.map((operation, index) => {
      const label = getReplayOperationDisplayLabel(operation);
      const removeButtonHtml = canRemove
        ? `<button type="button" data-role="operation-chip-remove" data-operation-index="${index}" class="inline-flex h-4 w-4 items-center justify-center rounded-full bg-white/80 text-[11px] leading-none hover:bg-white" aria-label="${escapeHtml(label)} を削除">×</button>`
        : '';
      return `<span data-role="operation-chip" data-operation-index="${index}" class="inline-flex shrink-0 items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-semibold leading-tight whitespace-nowrap ${getReplayOperationTone(operation)}"><span class="whitespace-nowrap">${escapeHtml(label)}</span>${removeButtonHtml}</span>`;
    }).join('');
    return `<div data-role="operation-chip-list" class="flex flex-wrap gap-1 pb-1">${chipHtml}</div>`;
  }

  #buildFieldChipsHtml() {
    const entries = buildFieldDisplayEntries({
      zoneState: this.#stateBefore?.turnState?.zoneState ?? null,
      territoryState: this.#stateBefore?.turnState?.territoryState ?? null,
      talismanState: this.#stateBefore?.turnState?.enemyState?.talismanState ?? null,
      disasterState: this.#stateBefore?.turnState?.enemyState?.disasterState ?? null,
    });
    if (entries.length === 0) {
      return '';
    }
    return `
      <div data-role="field-chip-list" class="flex flex-wrap gap-1 pb-1">
        ${entries
          .map((entry) => {
            const toneClass = `turn-field-chip-${String(entry.chipTone ?? 'neutral')}`;
            const labelText = String(entry.chipText ?? `${entry.label}: ${entry.name}`);
            const title = [entry.label, entry.name, entry.duration, ...(entry.meta ?? []), entry.desc]
              .filter(Boolean)
              .join(' / ');
            return `<span class="turn-field-chip ${escapeHtml(toneClass)}" title="${escapeHtml(title)}">${escapeHtml(labelText)}</span>`;
          })
          .join('')}
      </div>
    `;
  }

  /**
   * 未コミット行の OD After 表示をリアルタイム更新する。
   * TurnAreaController から previewCurrentTurn の結果を受けて呼ばれる。
   * @param {number|null} odGaugeAfter null の場合は "→ —" に戻す
   */
  updateOdPreview(odGaugeAfter) {
    this.#previewOdGaugeAfter = Number.isFinite(Number(odGaugeAfter)) ? Number(odGaugeAfter) : null;
    const valueEl = this.#root.querySelector('[data-od-gauge-row="end"] [data-role="turn-od-gauge-value"]');
    if (valueEl) {
      valueEl.textContent = odGaugeAfter != null ? formatOdGauge(odGaugeAfter) : '—';
    }
    this.#syncOdGaugeGraph(odGaugeAfter);
  }

  // ---- private ----

  /**
   * トークン表示 HTML を生成する。
   * 5×2 グリッドに白丸を並べ、active 個数 = current 値。
   * current が 0 かつ max が 0 以下なら空文字を返す（非表示）。
   * @param {number} current
   * @param {number} max
   */
  #buildTokenHtml(current, max) {
    const cur = Number(current);
    const mx  = Number(max);
    if (!Number.isFinite(cur) || cur <= 0 || !Number.isFinite(mx) || mx <= 0) return '';
    const effective = Math.min(cur, mx);
    const total = Math.max(mx, 10);
    const dots = Array.from({ length: total }, (_, i) => {
      if (i < effective) return '<span class="token-dot active"></span>';
      if (i === effective) return '<span class="token-dot afterglow"></span>';
      return '<span class="token-dot"></span>';
    });
    return `<div class="token-grid">${dots.join('')}</div>`;
  }

  /**
   * 士気（Morale）表示 HTML を生成する。
   * 大丸（5px）= 2 士気、小丸（3px）= 1 士気として組み合わせ表示。
   * current が 0 なら空文字を返す（非表示）。
   * @param {number} current
   */
  #buildMoraleHtml(current) {
    const cur = Number(current);
    if (!Number.isFinite(cur) || cur <= 0) return '';
    // 白丸1個=5士気、赤丸1個=1士気
    const whiteDots = Math.floor(cur / 5);
    const redDots   = cur % 5;
    const dots = [
      ...Array.from({ length: whiteDots }, () => '<span class="morale-dot-white"></span>'),
      ...Array.from({ length: redDots   }, () => '<span class="morale-dot-red"></span>'),
    ].join('');
    return `<div class="morale-display">
      <img src="${resolveUiAssetUrl('Morale.webp')}" class="morale-icon" alt="士気" />
      <div class="morale-dots">${dots}</div>
    </div>`;
  }

  #buildSkillBadgesHtml(skill, member, state) {
    if (!skill) return '';
    let effective = skill;
    if (state && member) {
      try { effective = resolveEffectiveSkillForAction(state, member, skill) ?? skill; } catch { /* noop */ }
    }
    const parts = effective.parts ?? [];
    const types = [...new Set(parts.map((p) => p.type).filter((t) => t && t in ATTACK_TYPE_MAP))];
    const elems = [...new Set(
      parts.flatMap((p) => (Array.isArray(p.elements) ? p.elements : [])).filter((e) => e in ELEMENT_MAP)
    )];
    if (types.length === 0 && elems.length === 0) return '';
    return [
      ...elems.map((e) => `<img src="${ELEMENT_MAP[e].img}" alt="${ELEMENT_MAP[e].alt}" class="turn-skill-badge-icon object-contain" />`),
      ...types.map((t) => `<img src="${ATTACK_TYPE_MAP[t].img}" alt="${ATTACK_TYPE_MAP[t].alt}" class="turn-skill-badge-icon object-contain" />`),
    ].join('');
  }

  #resolveOdGaugeStage(value) {
    const numericValue = normalizeOdGaugeNumber(value);
    if (numericValue < 0) {
      return { key: 'minus', label: resolveNegativeOdGaugeStageLabel(numericValue) };
    }
    if (numericValue < OD_GAUGE_BAND_SIZE) {
      return { key: 'od0', label: '0' };
    }
    if (numericValue < OD_GAUGE_BAND_SIZE * 2) {
      return { key: 'od1', label: '1' };
    }
    if (numericValue < OD_GAUGE_BAR_MAX) {
      return { key: 'od2', label: '2' };
    }
    return { key: 'od3', label: '3' };
  }

  #computeFoldedOdGaugeFillPercent(value) {
    const numericValue = normalizeOdGaugeNumber(value);
    if (numericValue >= 0) {
      const clampedValue = Math.min(OD_GAUGE_BAR_MAX, numericValue);
      if (clampedValue === 0) {
        return 0;
      }
      if (clampedValue === OD_GAUGE_BAR_MAX) {
        return 100;
      }
      const bandProgress = clampedValue % OD_GAUGE_BAND_SIZE;
      return bandProgress === 0 ? 100 : (bandProgress / OD_GAUGE_BAND_SIZE) * 100;
    }
    return (Math.min(Math.abs(numericValue), OD_GAUGE_BAND_SIZE) / OD_GAUGE_BAND_SIZE) * 100;
  }

  #buildSingleOdGaugeGraphRowHtml({ role, value }) {
    const numericValue = normalizeOdGaugeNumber(value);
    const fillPercent = this.#computeFoldedOdGaugeFillPercent(numericValue);
    const stage = this.#resolveOdGaugeStage(numericValue);
    const displayValue = formatOdGauge(numericValue);
    return `
      <div data-role="turn-od-gauge-row"
           data-od-gauge-row="${role}"
           data-value="${numericValue}"
           class="turn-od-gauge-row">
        <div class="turn-od-gauge-row-value-line">
          <span data-role="turn-od-gauge-value" class="turn-od-gauge-value">${displayValue}</span>
        </div>
        <div class="turn-od-gauge-visual">
          <div data-role="turn-od-gauge-track"
               class="turn-od-gauge-track turn-od-gauge-track-${stage.key}">
            <div data-role="turn-od-gauge-fill"
                 class="turn-od-gauge-fill turn-od-gauge-fill-${stage.key}"
                 style="width:${fillPercent}%"></div>
          </div>
          <div data-role="turn-od-stage-badge"
               data-stage="${stage.key}"
               class="turn-od-stage-badge turn-od-stage-${stage.key}">${stage.label}</div>
        </div>
      </div>
    `;
  }

  #buildOdGaugeGraphHtml({ beforeValue, afterValue }) {
    const beforeNumeric = normalizeOdGaugeNumber(beforeValue);
    const afterNumeric = normalizeOdGaugeNumber(afterValue, beforeNumeric);
    return `
      <div data-turn-od-gauge class="turn-od-gauge-stack">
        ${this.#buildSingleOdGaugeGraphRowHtml({ role: 'start', value: beforeNumeric })}
        <div class="turn-od-gauge-arrow" aria-hidden="true"></div>
        ${this.#buildSingleOdGaugeGraphRowHtml({ role: 'end', value: afterNumeric })}
      </div>
    `;
  }

  #syncOdGaugeGraph(odGaugeAfter = null) {
    const rowEl = this.#root.querySelector('[data-od-gauge-row="end"]');
    if (!rowEl) {
      return;
    }
    const startRowEl = this.#root.querySelector('[data-od-gauge-row="start"]');
    const startValue = normalizeOdGaugeNumber(startRowEl?.dataset.value, 0);
    const effectiveAfterValue = Number.isFinite(Number(odGaugeAfter)) ? Number(odGaugeAfter) : startValue;
    const fillPercent = this.#computeFoldedOdGaugeFillPercent(effectiveAfterValue);
    const fillEl = rowEl.querySelector('[data-role="turn-od-gauge-fill"]');
    const trackEl = rowEl.querySelector('[data-role="turn-od-gauge-track"]');
    if (fillEl) {
      fillEl.style.width = `${fillPercent}%`;
      const stage = this.#resolveOdGaugeStage(effectiveAfterValue);
      fillEl.className = `turn-od-gauge-fill turn-od-gauge-fill-${stage.key}`;
      if (trackEl) {
        trackEl.className = `turn-od-gauge-track turn-od-gauge-track-${stage.key}`;
      }
    }
    rowEl.dataset.value = String(effectiveAfterValue);
    const stageBadgeEl = rowEl.querySelector('[data-role="turn-od-stage-badge"]');
    if (stageBadgeEl) {
      const stage = this.#resolveOdGaugeStage(effectiveAfterValue);
      stageBadgeEl.dataset.stage = stage.key;
      stageBadgeEl.className = `turn-od-stage-badge turn-od-stage-${stage.key}`;
      stageBadgeEl.textContent = stage.label;
    }
  }

  #resolveEffectiveSkill(member, skill, state = this.#stateBefore) {
    if (!skill) {
      return null;
    }
    if (state && member) {
      try {
        return resolveEffectiveSkillForAction(state, member, skill) ?? skill;
      } catch {
        return skill;
      }
    }
    return skill;
  }

  #getRecordActionReplayTarget(action = null) {
    if (!action || typeof action !== 'object') {
      return normalizeTurnReplayTarget(null);
    }

    const rawTargetEnemyIndex = action.targetEnemyIndex;
    const targetEnemyIndex = Number(rawTargetEnemyIndex);
    if (
      rawTargetEnemyIndex !== null &&
      rawTargetEnemyIndex !== undefined &&
      rawTargetEnemyIndex !== '' &&
      Number.isFinite(targetEnemyIndex) &&
      targetEnemyIndex >= 0
    ) {
      return normalizeTurnReplayTarget({ type: 'enemy', enemyIndex: targetEnemyIndex });
    }

    const targetCharacterId = String(action.targetCharacterId ?? '').trim();
    if (targetCharacterId) {
      const targetMember =
        this.#stateBefore?.party?.find((member) => String(member?.characterId) === targetCharacterId) ?? null;
      if (Number.isFinite(Number(targetMember?.styleId))) {
        return normalizeTurnReplayTarget({ type: 'ally', styleId: Number(targetMember.styleId) });
      }
      return normalizeTurnReplayTarget({ type: 'ally', characterId: targetCharacterId });
    }

    return normalizeTurnReplayTarget(null);
  }

  #getCurrentReplayTarget({ partyIndex, targetConfig, recordAction = null }) {
    const baseTarget =
      recordAction != null
        ? this.#getRecordActionReplayTarget(recordAction)
        : this.#getDraftReplayTarget(partyIndex);
    return coerceTurnReplayTarget(targetConfig, baseTarget);
  }

  #getCurrentReplayTurnEnemyCount() {
    const replayEnemyCount = Number(
      this.#replayTurn?.overrideEntries?.find?.(
        (entry) => String(entry?.type ?? '') === REPLAY_OVERRIDE_ENTRY_TYPES.ENEMY_COUNT
      )?.payload
    );
    if (Number.isFinite(replayEnemyCount)) {
      return clampEnemyCount(replayEnemyCount);
    }
    if (Number.isFinite(Number(this.#record?.enemyCount))) {
      return clampEnemyCount(this.#record.enemyCount);
    }
    return clampEnemyCount(this.#stateBefore?.turnState?.enemyState?.enemyCount ?? DEFAULT_ENEMY_COUNT);
  }

  #getReplayTurnActionOutcomeOverrides(enemyCount = this.#getCurrentReplayTurnEnemyCount()) {
    return getActionOutcomeOverridesFromReplayTurn(this.#replayTurn, enemyCount);
  }

  #getReplayTurnFollowUpOverrides(enemyCount = this.#getCurrentReplayTurnEnemyCount()) {
    return getFollowUpOverridesFromReplayTurn(this.#replayTurn, enemyCount);
  }

  #getEnemyNamesByEnemy() {
    return this.#stateBefore?.turnState?.enemyState?.enemyNamesByEnemy &&
      typeof this.#stateBefore.turnState.enemyState.enemyNamesByEnemy === 'object'
      ? this.#stateBefore.turnState.enemyState.enemyNamesByEnemy
      : {};
  }

  #getEnemyExtraHpGaugeState(enemyIndex, state = this.#stateBefore ?? this.#stateAfter) {
    const enemyKey = String(Number(enemyIndex));
    return cloneEnemyExtraHpGaugeState(
      state?.turnState?.enemyState?.extraHpGaugeStateByEnemy?.[enemyKey] ?? null
    );
  }

  #canEnemySlotHpBreak(enemyIndex, state = this.#stateBefore ?? this.#stateAfter) {
    return canEnemyHpBreak(this.#getEnemyExtraHpGaugeState(enemyIndex, state));
  }

  #isEnemySlotAlive(enemyIndex, state = this.#stateBefore ?? this.#stateAfter) {
    return isEnemyAlive(state?.turnState, enemyIndex);
  }

  #isEnemySlotBroken(enemyIndex, state = this.#stateBefore ?? this.#stateAfter) {
    return isEnemyBroken(state?.turnState, enemyIndex);
  }

  #getCurrentActionOutcomeOverridesForDisplay(isCommitted) {
    const enemyCount = isCommitted
      ? this.#getCurrentReplayTurnEnemyCount()
      : this.getCurrentEnemyCount();
    if (isCommitted) {
      return this.#getReplayTurnActionOutcomeOverrides(enemyCount);
    }
    return this.getCurrentActionOutcomeOverrides();
  }

  #buildManualBreakChipsHtml(isCommitted) {
    const members = this.#getMembersInPositionOrder().filter((member) => member.position <= 2);
    const enemyNamesByEnemy = this.#getEnemyNamesByEnemy();
    const manualChipModels = buildManualBreakChipModels({
      overrides: this.#getCurrentActionOutcomeOverridesForDisplay(isCommitted),
      members,
      store: this.#store,
      enemyNamesByEnemy,
    });
    const autoChipModels = buildAutoBreakChipModels({
      actions: this.#getActionsForAutoBreakChips(isCommitted),
      members,
      store: this.#store,
      enemyNamesByEnemy,
    });
    if (manualChipModels.length === 0 && autoChipModels.length === 0) {
      return '';
    }
    const manualHtml = manualChipModels.map((chip) => `
          <span data-role="manual-break-chip"
                title="${chip.label}"
                class="inline-flex max-w-full items-center rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-semibold leading-tight text-amber-700">
            <span class="max-w-full break-all">${chip.label}</span>
          </span>
        `).join('');
    const autoHtml = autoChipModels.map((chip) => `
          <span data-role="auto-break-chip"
                title="${chip.label}"
                class="inline-flex max-w-full items-center rounded-full border border-violet-200 bg-violet-50 px-2.5 py-1 text-xs font-semibold leading-tight text-violet-700">
            <span class="max-w-full break-all">${chip.label}</span>
          </span>
        `).join('');
    return `
      <div data-role="manual-break-chip-list" class="flex flex-wrap gap-1 pb-1">
        ${manualHtml}${autoHtml}
      </div>
    `;
  }

  #getActionsForAutoBreakChips(isCommitted) {
    if (isCommitted) {
      return Array.isArray(this.#record?.actions) ? this.#record.actions : [];
    }
    return Array.isArray(this.#previewActionFlow) ? this.#previewActionFlow : [];
  }

  #buildKillChipsHtml(isCommitted) {
    const currentOverrides = isCommitted
      ? getActionOutcomeOverridesFromReplayTurn(
          this.#replayTurn,
          this.#getCurrentReplayTurnEnemyCount()
        )
      : this.getCurrentActionOutcomeOverrides();
    const chipModels = buildManualKillChipModels({
      overrides: currentOverrides,
      members: this.#getMembersInPositionOrder().filter((member) => member.position <= 2),
      store: this.#store,
      enemyNamesByEnemy: this.#getEnemyNamesByEnemy(),
    });
    if (chipModels.length === 0) return '';
    return `
      <div data-role="kill-chip-list" class="flex flex-wrap gap-1 pb-1">
        ${chipModels.map((chip) => `
          <span data-role="kill-chip"
                title="${chip.label}"
                class="inline-flex max-w-full items-center rounded-full border border-green-200 bg-green-50 px-2.5 py-1 text-xs font-semibold leading-tight text-green-700">
            <span class="max-w-full break-all">${chip.label}</span>
          </span>
        `).join('')}
      </div>
    `;
  }

  #buildHpBreakChipsHtml(isCommitted) {
    const currentOverrides = isCommitted
      ? getActionOutcomeOverridesFromReplayTurn(
          this.#replayTurn,
          this.#getCurrentReplayTurnEnemyCount()
        )
      : this.getCurrentActionOutcomeOverrides();
    const chipModels = buildManualHpBreakChipModels({
      overrides: currentOverrides,
      members: this.#getMembersInPositionOrder().filter((member) => member.position <= 2),
      store: this.#store,
      enemyNamesByEnemy: this.#getEnemyNamesByEnemy(),
    });
    if (chipModels.length === 0) return '';
    return `
      <div data-role="hp-break-chip-list" class="flex flex-wrap gap-1 pb-1">
        ${chipModels.map((chip) => `
          <span data-role="hp-break-chip"
                title="${chip.label}"
                class="inline-flex max-w-full items-center rounded-full border border-rose-200 bg-rose-50 px-2.5 py-1 text-xs font-semibold leading-tight text-rose-700">
            <span class="max-w-full break-all">${chip.label}</span>
          </span>
        `).join('')}
      </div>
    `;
  }

  getCurrentFollowUpOverrides() {
    const enemyCount = this.getCurrentEnemyCount();
    const members = this.#getMembersInPositionOrder().filter((member) => member.position >= 3);
    const overrides = [];
    for (const member of members) {
      const enemyIndex = Number(this.#draftFollowUpEnemyIndexByPartyIndex?.[member.partyIndex]);
      if (
        !Number.isInteger(enemyIndex) ||
        enemyIndex < 0 ||
        enemyIndex >= enemyCount ||
        !this.#isEnemySlotAlive(enemyIndex)
      ) {
        continue;
      }
      overrides.push({
        position: member.position,
        enemyIndex,
      });
    }
    return normalizeFollowUpOverrides(overrides, enemyCount);
  }

  #getCurrentFollowUpOverridesForDisplay(isCommitted) {
    const enemyCount = isCommitted
      ? this.#getCurrentReplayTurnEnemyCount()
      : this.getCurrentEnemyCount();
    if (isCommitted) {
      return this.#getReplayTurnFollowUpOverrides(enemyCount);
    }
    return this.getCurrentFollowUpOverrides();
  }

  #resolveFollowUpSkillNameByPosition() {
    const result = {};
    const members = this.#getMembersInPositionOrder().filter((member) => member.position >= 3);
    for (const member of members) {
      const pursuitSkill = [
        ...(member.getActionSkills?.() ?? []),
        ...(Array.isArray(member.triggeredSkills) ? member.triggeredSkills : []),
      ].find((skill) => {
        if (String(skill?.name ?? '') === PURSUIT_TRANSFORMED_SKILL_NAME) {
          const effectiveSkill = this.#resolveEffectiveSkill(member, skill, this.#stateBefore) ?? skill;
          const rawEffectiveSpCost = Number(
            effectiveSkill?.spCost ??
              effectiveSkill?.sp_cost ??
              skill?.spCost ??
              skill?.sp_cost ??
              PURSUIT_TRANSFORMED_SKILL_SP_COST
          );
          const effectiveSpCost =
            Number.isFinite(rawEffectiveSpCost) && rawEffectiveSpCost > 0
              ? rawEffectiveSpCost
              : PURSUIT_TRANSFORMED_SKILL_SP_COST;
          return Number(member?.sp?.current ?? 0) >= effectiveSpCost;
        }
        return isPursuitOnlySkill(skill);
      });
      if (pursuitSkill) {
        result[member.position] = String(pursuitSkill.name ?? '追撃');
      }
    }
    return result;
  }

  #buildFollowUpChipsHtml(isCommitted) {
    const members = this.#getMembersInPositionOrder().filter((member) => member.position >= 3);
    const autoChipModels = isCommitted
      ? buildAutomaticFollowUpChipModelsFromActions({
          actions: this.#record?.actions ?? [],
          members,
          store: this.#store,
          enemyNamesByEnemy: this.#getEnemyNamesByEnemy(),
        })
      : [];
    const autoChipPositions = new Set(autoChipModels.map((chip) => Number(chip.position)));
    const chipModels = buildFollowUpChipModels({
      overrides: this.#getCurrentFollowUpOverridesForDisplay(isCommitted),
      members,
      store: this.#store,
      enemyNamesByEnemy: this.#getEnemyNamesByEnemy(),
      resolvedSkillNameByPosition: this.#resolveFollowUpSkillNameByPosition(),
    }).filter((chip) => !autoChipPositions.has(Number(chip.position)));
    const allChipModels = [...chipModels, ...autoChipModels];
    if (allChipModels.length === 0) {
      return '';
    }
    return `
      <div data-role="follow-up-chip-list" class="flex flex-wrap gap-1 pb-1">
        ${allChipModels.map((chip) => `
          <span data-role="${String(chip.key ?? '').startsWith('auto:') ? 'automatic-follow-up-chip' : 'follow-up-chip'}"
                title="${chip.label}"
                class="inline-flex max-w-full items-center rounded-full border border-cyan-200 bg-cyan-50 px-2.5 py-1 text-xs font-semibold leading-tight text-cyan-700">
            <span class="max-w-full break-all">${chip.label}</span>
          </span>
        `).join('')}
      </div>
    `;
  }

  #buildFollowUpEditorHtml(isCommitted) {
    const enemyCount = isCommitted
      ? this.#getCurrentReplayTurnEnemyCount()
      : this.getCurrentEnemyCount();
    const overrides = this.#getCurrentFollowUpOverridesForDisplay(isCommitted);
    const enemyNamesByEnemy = this.#getEnemyNamesByEnemy();
    const members = this.#getMembersInPositionOrder().filter((member) => member.position >= 3);
    return `
      <div data-role="follow-up-editor"
           data-popover-kind="follow-up"
           class="target-popover absolute right-0 top-[calc(100%+4px)] z-30 w-[min(720px,calc(100vw-16px))] rounded-xl border border-gray-200 bg-white p-2.5 shadow-xl overflow-x-hidden"
           ${this.#isFollowUpEditorOpen ? '' : 'hidden'}>
        <div class="text-[11px] font-semibold text-gray-700 pb-2">追撃を編集</div>
        <div class="grid gap-2" style="grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));">
          ${members.map((member) => {
            const actorLabel = resolveManualBreakActorLabel(member, this.#store);
            const selectedEnemyIndex = Number(
              overrides.find((entry) => Number(entry.position) === Number(member.position))?.enemyIndex
            );
            const buttonsHtml = Array.from({ length: enemyCount }, (_, enemyIndex) => {
              const isAlive = this.#isEnemySlotAlive(enemyIndex);
              const enemyName = String(
                enemyNamesByEnemy[String(enemyIndex)] ?? enemyNamesByEnemy[enemyIndex] ?? ''
              ).trim();
              const label = enemyName ? `E${enemyIndex + 1} ${enemyName}` : `E${enemyIndex + 1}`;
              const selected = selectedEnemyIndex === enemyIndex;
              return `
                <button type="button"
                        data-role="follow-up-enemy-candidate"
                        data-party-index="${member.partyIndex}"
                        data-position="${member.position}"
                        data-enemy-index="${enemyIndex}"
                        ${isAlive ? '' : 'disabled'}
                        class="target-chip inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold transition-colors
                               ${!isAlive
                                 ? 'cursor-not-allowed border-gray-200 bg-gray-100 text-gray-400'
                                 : selected
                                 ? 'border-cyan-500 bg-cyan-500 text-white'
                                 : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-100'}">
                  ${label}
                </button>
              `;
            }).join('');
            return `
              <div class="rounded-lg border border-gray-100 bg-gray-50 px-2 py-1.5">
                <div class="pb-1 text-[10px] font-semibold text-gray-700">${actorLabel}</div>
                <div class="flex flex-wrap gap-1">${buttonsHtml}</div>
              </div>
            `;
          }).join('')}
        </div>
        ${isCommitted
          ? '<div class="pt-2 text-[10px] text-gray-400">変更するとこのターンから再計算されます。</div>'
          : ''}
      </div>
    `;
  }

  #formatEnemySummonOptionLabel(preset = {}) {
    const enemyName = String(preset?.name ?? '').trim() || '名称未設定';
    const enemyId = Number(preset?.id);
    return Number.isFinite(enemyId) ? `${enemyName} (#${enemyId})` : enemyName;
  }

  #buildEnemySummonPresetSummaryHtml(preset = null) {
    if (!preset) {
      return '<div class="text-[10px] text-slate-400">召喚対象を選択してください。</div>';
    }
    const odRate = Number(preset?.od_rate ?? 0);
    const maxDRate = Number(preset?.max_d_rate ?? 999);
    const resistancePairs = SUMMON_ENEMY_RESISTANCE_LABELS
      .map(([key, label]) => {
        const numeric = Number(preset?.resistances?.element?.[key]);
        return Number.isFinite(numeric) ? `${label}${numeric}` : null;
      })
      .filter(Boolean);
    const absorbElements = Array.isArray(preset?.absorbElementList) && preset.absorbElementList.length > 0
      ? preset.absorbElementList.join(', ')
      : 'なし';
    return `
      <div class="rounded-lg border border-slate-600 bg-slate-950 px-2 py-1.5 text-[10px] leading-tight text-slate-100">
        <div class="font-semibold">${escapeHtml(this.#formatEnemySummonOptionLabel(preset))}</div>
        <div class="pt-1 text-slate-300">OD率 ${Number.isFinite(odRate) ? odRate : 0} / 最大D率 ${Number.isFinite(maxDRate) ? maxDRate : 999}</div>
        <div class="pt-1 text-slate-300">耐性 ${escapeHtml(resistancePairs.join(' / ') || '未設定')}</div>
        <div class="pt-1 text-slate-300">吸収 ${escapeHtml(absorbElements)}</div>
      </div>
    `;
  }

  #buildEnemySummonEditorHtml() {
    const presets = this.#getEnemySummonPresets();
    const targetEnemyIndex = this.#resolveEnemySummonTargetSlotIndex();
    const selectedPreset = this.#findEnemySummonPresetById(this.#draftSummonEnemyId) ?? presets[0] ?? null;
    const size = Math.max(3, Math.min(ENEMY_SUMMON_MAX_VISIBLE_OPTIONS, presets.length || 1));
    const targetLabel = Number.isInteger(targetEnemyIndex)
      ? `配置先: E${targetEnemyIndex + 1}`
      : '配置先がありません';
    return `
      <div data-role="enemy-summon-editor"
           data-popover-kind="enemy-summon"
           class="target-popover absolute right-0 top-[calc(100%+4px)] w-[min(360px,calc(100vw-16px))] rounded-xl border border-slate-600 bg-slate-800 p-2.5 text-slate-100 shadow-xl"
           style="z-index: ${ENEMY_SUMMON_EDITOR_Z_INDEX};"
           ${this.#isEnemySummonEditorOpen ? '' : 'hidden'}>
        <div class="pb-2 text-[11px] font-semibold text-slate-100">敵を召喚</div>
        <div class="pb-2 text-[10px] text-slate-400">${escapeHtml(targetLabel)}</div>
        <select data-role="enemy-summon-select"
                size="${size}"
                class="h-auto w-full rounded-lg border border-slate-600 bg-slate-950 px-2 py-1 text-xs text-slate-100 focus:outline-none focus:ring-1 focus:ring-sky-400"
                ${presets.length > 0 ? '' : 'disabled'}>
          ${presets.map((preset) => {
            const selected = Number(preset?.id) === Number(selectedPreset?.id) ? 'selected' : '';
            return `<option value="${Number(preset?.id)}" ${selected}>${escapeHtml(this.#formatEnemySummonOptionLabel(preset))}</option>`;
          }).join('')}
        </select>
        <div class="pt-2">
          ${this.#buildEnemySummonPresetSummaryHtml(selectedPreset)}
        </div>
        <button type="button"
                data-role="enemy-summon-submit"
                class="mt-2 w-full rounded-lg border border-sky-400/40 bg-sky-500/15 px-2 py-1 text-xs font-semibold text-sky-100 transition-colors hover:bg-sky-500/25 disabled:cursor-not-allowed disabled:border-slate-600 disabled:bg-slate-700/60 disabled:text-slate-400"
                ${(selectedPreset && Number.isInteger(targetEnemyIndex)) ? '' : 'disabled'}>
          召喚
        </button>
      </div>
    `;
  }

  #buildEnemyStatusTriggerHtml() {
    return `
      <button type="button"
              data-role="enemy-detail-trigger"
              title="左クリック/右クリック/長押しで敵情報詳細を表示"
              aria-label="敵情報確認"
              class="turn-info-enemy-button">
        <span class="turn-info-enemy-button__label" aria-hidden="true">
          <span class="turn-info-enemy-button__label-text turn-info-enemy-button__label-text--full">敵情報確認</span>
          <span class="turn-info-enemy-button__label-text turn-info-enemy-button__label-text--medium">敵情報</span>
          <span class="turn-info-enemy-button__label-text turn-info-enemy-button__label-text--short">敵</span>
        </span>
      </button>
    `;
  }

  #resolveEnemyPopupEnemyLabel(enemyIndex, enemyNamesByEnemy = {}) {
    const normalizedEnemyIndex = Number(enemyIndex);
    const enemyName = String(
      enemyNamesByEnemy[String(normalizedEnemyIndex)] ?? enemyNamesByEnemy[normalizedEnemyIndex] ?? ''
    ).trim();
    return enemyName ? `E${normalizedEnemyIndex + 1} ${enemyName}` : `E${normalizedEnemyIndex + 1}`;
  }

  #resolvePopupRequestedEnemyTargetIndex(selectionContext, requestedEnemyIndex) {
    const normalizedRequestedEnemyIndex = Number(requestedEnemyIndex);
    if (!Number.isInteger(normalizedRequestedEnemyIndex) || normalizedRequestedEnemyIndex < 0) {
      return null;
    }
    if (selectionContext?.breakAttributionMode === TURN_BREAK_ATTRIBUTION_MODES.ALL) {
      return normalizedRequestedEnemyIndex;
    }
    if (selectionContext?.breakAttributionMode !== TURN_BREAK_ATTRIBUTION_MODES.SINGLE) {
      return null;
    }
    if (
      selectionContext.currentReplayTarget.type === 'enemy' &&
      Number(selectionContext.currentReplayTarget.enemyIndex) === normalizedRequestedEnemyIndex
    ) {
      return normalizedRequestedEnemyIndex;
    }
    const matchingCandidate = (selectionContext.singleTargetConfig?.candidates ?? []).find(
      (candidate) =>
        Number(candidate?.enemyIndex) === normalizedRequestedEnemyIndex &&
        candidate?.disabled !== true
    );
    return matchingCandidate ? normalizedRequestedEnemyIndex : null;
  }

  #buildEnemyPopupSingleTargetControls({
    selectionContext,
    enemyNamesByEnemy,
    requestedEnemyIndex,
    outcome,
    toggleRole,
    enabled,
  }) {
    if (!selectionContext) {
      return '<div class="text-[10px] text-gray-400">スキル未選択</div>';
    }
    const defaultTargetLabel = selectionContext.singleTargetConfig
      ? formatTurnTargetLabel(
          selectionContext.singleTargetConfig,
          normalizeTurnReplayTarget(null),
          { enemyNamesByEnemy }
        )
      : 'E1';
    const explicitTargetEnemyIndex =
      selectionContext.explicitTarget.type === 'enemy'
        ? Number(selectionContext.explicitTarget.enemyIndex)
        : null;
    const requestedTargetEnemyIndex =
      Number.isInteger(explicitTargetEnemyIndex)
        ? null
        : this.#resolvePopupRequestedEnemyTargetIndex(
          selectionContext,
          requestedEnemyIndex
        );
    const displayTargetEnemyIndex =
      Number.isInteger(explicitTargetEnemyIndex)
        ? explicitTargetEnemyIndex
        : Number.isInteger(requestedTargetEnemyIndex)
        ? requestedTargetEnemyIndex
        : selectionContext.currentReplayTarget.type === 'enemy'
          ? Number(selectionContext.currentReplayTarget.enemyIndex)
          : null;
    const displayTargetLabel =
      Number.isInteger(displayTargetEnemyIndex)
        ? this.#resolveEnemyPopupEnemyLabel(displayTargetEnemyIndex, enemyNamesByEnemy)
        : (selectionContext.currentTargetLabel || defaultTargetLabel);
    const showLocalTargetOverrideControls =
      this.#isDraftMode() &&
      !selectionContext.isEnemyTargetSelectionManual &&
      selectionContext.singleTargetConfig?.kind === 'enemy' &&
      Number(selectionContext.singleTargetConfig?.candidates?.length ?? 0) > 1;
    const isBreakOutcome = outcome === ACTION_OUTCOME_TYPES.BREAK;
    const isHpBreakOutcome = outcome === ACTION_OUTCOME_TYPES.HP_BREAK;
    const targetClaimedByEarlierActor =
      isBreakOutcome &&
      Number.isInteger(displayTargetEnemyIndex) &&
      this.#isBreakEnemyClaimedForSelection(selectionContext, displayTargetEnemyIndex);
    const actualSelectionActive = isBreakOutcome
      ? selectionContext.breakEnabled &&
        selectionContext.currentReplayTarget.type === 'enemy' &&
        Number(selectionContext.currentReplayTarget.enemyIndex) === displayTargetEnemyIndex &&
        selectionContext.effectiveBreakEnemyIndexes.includes(displayTargetEnemyIndex)
      : isHpBreakOutcome
        ? (this.#draftHpBreakEnemyIndexesByPartyIndex?.[selectionContext.member.partyIndex] ?? [])
            .includes(displayTargetEnemyIndex)
      : (this.#draftKillEnemyIndexesByPartyIndex?.[selectionContext.member.partyIndex] ?? [])
          .includes(displayTargetEnemyIndex);
    const accentButtonClasses = isBreakOutcome
      ? 'border-amber-500 bg-amber-500 text-white'
      : 'border-rose-500 bg-rose-500 text-white';
    const accentHeadingClass = isBreakOutcome ? 'text-green-700' : 'text-rose-700';
    const targetMatchesOutcome =
      !Number.isInteger(displayTargetEnemyIndex)
        ? false
        : isBreakOutcome
          ? this.#isEnemySlotAlive(displayTargetEnemyIndex)
          : isHpBreakOutcome
            ? this.#canEnemySlotHpBreak(displayTargetEnemyIndex)
            : this.#isEnemySlotAlive(displayTargetEnemyIndex) && !this.#canEnemySlotHpBreak(displayTargetEnemyIndex);
    const isToggleEnabled =
      enabled &&
      Number.isInteger(displayTargetEnemyIndex) &&
      targetMatchesOutcome &&
      (!isBreakOutcome || !targetClaimedByEarlierActor) &&
      (!isBreakOutcome || this.#isEnemySlotAlive(displayTargetEnemyIndex));

    return `
      <div class="mb-1 space-y-1">
        <div class="text-[9px] font-semibold ${accentHeadingClass} pb-0.5">${escapeHtml(
          isBreakOutcome ? 'ブレイク' : (isHpBreakOutcome ? 'HP破壊' : '討伐')
        )}</div>
        ${showLocalTargetOverrideControls
          ? `
            <div class="flex flex-wrap gap-1.5">
              <button type="button"
                      data-role="manual-break-target-reset"
                      data-party-index="${selectionContext.member.partyIndex}"
                      class="target-chip inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-colors
                             ${Number.isInteger(displayTargetEnemyIndex)
                               ? 'border-gray-200 bg-white text-gray-700 hover:bg-gray-100'
                               : 'border-sky-500 bg-sky-500 text-white'}">
                自動(${escapeHtml(defaultTargetLabel)})
              </button>
              ${selectionContext.singleTargetConfig.candidates.map((candidate) => {
                const label = this.#resolveEnemyPopupEnemyLabel(candidate.enemyIndex, enemyNamesByEnemy);
                const isSelected = Number(displayTargetEnemyIndex) === Number(candidate.enemyIndex);
                const candidateClaimedByEarlierActor =
                  isBreakOutcome &&
                  this.#isBreakEnemyClaimedForSelection(selectionContext, candidate.enemyIndex);
                const candidateMatchesOutcome = isBreakOutcome
                  ? this.#isEnemySlotAlive(candidate.enemyIndex)
                  : isHpBreakOutcome
                    ? this.#canEnemySlotHpBreak(candidate.enemyIndex)
                    : this.#isEnemySlotAlive(candidate.enemyIndex) && !this.#canEnemySlotHpBreak(candidate.enemyIndex);
                const candidateDisabled =
                  candidate.disabled ||
                  candidateClaimedByEarlierActor ||
                  !candidateMatchesOutcome;
                return `
                  <button type="button"
                          data-role="manual-break-target-candidate"
                          data-party-index="${selectionContext.member.partyIndex}"
                          data-enemy-index="${candidate.enemyIndex}"
                          ${candidateDisabled ? 'disabled' : ''}
                          class="target-chip inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-colors
                                 ${candidateDisabled
                                   ? 'cursor-not-allowed border-gray-200 bg-gray-100 text-gray-400'
                                   : isSelected
                                   ? 'border-sky-500 bg-sky-500 text-white'
                                   : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-100'}">
                    ${escapeHtml(label)}
                  </button>
                `;
              }).join('')}
            </div>
          `
          : ''}
        <button type="button"
                data-role="${toggleRole}"
                data-party-index="${selectionContext.member.partyIndex}"
                ${Number.isInteger(displayTargetEnemyIndex) && displayTargetEnemyIndex >= 0
                  ? `data-requested-enemy-index="${displayTargetEnemyIndex}"`
                  : ''}
                ${isToggleEnabled ? '' : 'disabled'}
                class="target-chip inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-colors
                       ${!isToggleEnabled
                         ? 'cursor-not-allowed border-gray-200 bg-gray-100 text-gray-400'
                         : actualSelectionActive
                         ? accentButtonClasses
                         : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-100'}">
          ${escapeHtml(displayTargetLabel)}
        </button>
      </div>
    `;
  }

  #buildEnemyPopupBreakEditorControls({ selectionContext, enemyCount, enemyNamesByEnemy, requestedEnemyIndex }) {
    if (!selectionContext || !selectionContext.skill) {
      return '<div class="text-[10px] text-gray-400">スキル未選択</div>';
    }
    if (selectionContext.breakAttributionMode === TURN_BREAK_ATTRIBUTION_MODES.NONE) {
      return '<div class="text-[10px] text-gray-400">敵を攻撃しないため指定なし</div>';
    }
    if (selectionContext.breakAttributionMode === TURN_BREAK_ATTRIBUTION_MODES.ALL) {
      return `
        <div class="mb-1">
          <div class="text-[9px] font-semibold text-green-700 pb-0.5">ブレイク</div>
          <div class="flex flex-wrap gap-1.5">
            ${Array.from({ length: enemyCount }, (_, enemyIndex) => {
              const isAlive = this.#isEnemySlotAlive(enemyIndex);
              const isSelected = selectionContext.effectiveBreakEnemyIndexes.includes(enemyIndex);
              const isClaimedByEarlierActor = this.#isBreakEnemyClaimedForSelection(
                selectionContext,
                enemyIndex
              );
              const isRequested =
                !isSelected &&
                !isClaimedByEarlierActor &&
                Number(requestedEnemyIndex) === enemyIndex;
              const label = this.#resolveEnemyPopupEnemyLabel(enemyIndex, enemyNamesByEnemy);
              return `
                <button type="button"
                        data-role="manual-break-candidate"
                        data-party-index="${selectionContext.member.partyIndex}"
                        data-enemy-index="${enemyIndex}"
                        ${isAlive && !isClaimedByEarlierActor ? '' : 'disabled'}
                        class="target-chip inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-colors
                               ${!isAlive || isClaimedByEarlierActor
                                 ? 'cursor-not-allowed border-gray-200 bg-gray-100 text-gray-400'
                                 : isSelected
                                 ? 'border-amber-500 bg-amber-500 text-white'
                                 : isRequested
                                 ? 'border-amber-300 bg-amber-50 text-amber-700'
                                 : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-100'}">
                  ${escapeHtml(label)}
                </button>
              `;
            }).join('')}
          </div>
        </div>
      `;
    }
    return this.#buildEnemyPopupSingleTargetControls({
      selectionContext,
      enemyNamesByEnemy,
      requestedEnemyIndex,
      outcome: ACTION_OUTCOME_TYPES.BREAK,
      toggleRole: 'manual-break-single-toggle',
      enabled: true,
    });
  }

  #buildEnemyPopupKillEditorControls({ selectionContext, enemyCount, enemyNamesByEnemy, requestedEnemyIndex }) {
    if (!selectionContext || !selectionContext.skill) {
      return '<div class="text-[10px] text-gray-400">スキル未選択</div>';
    }
    if (selectionContext.breakAttributionMode === TURN_BREAK_ATTRIBUTION_MODES.NONE) {
      return '<div class="text-[10px] text-gray-400">敵を攻撃しないため指定なし</div>';
    }
    if (selectionContext.breakAttributionMode === TURN_BREAK_ATTRIBUTION_MODES.ALL) {
      const currentKillEnemyIndexes = [
        ...(this.#draftKillEnemyIndexesByPartyIndex?.[selectionContext.member.partyIndex] ?? []),
      ];
      return `
        <div class="mb-1">
          <div class="text-[9px] font-semibold text-rose-700 pb-0.5">討伐</div>
          <div class="flex flex-wrap gap-1">
            ${Array.from({ length: enemyCount }, (_, enemyIndex) => {
              const isAlive = this.#isEnemySlotAlive(enemyIndex) && !this.#canEnemySlotHpBreak(enemyIndex);
              const isSelected = currentKillEnemyIndexes.includes(enemyIndex);
              const isRequested = !isSelected && Number(requestedEnemyIndex) === enemyIndex;
              const label = this.#resolveEnemyPopupEnemyLabel(enemyIndex, enemyNamesByEnemy);
              return `
                <button type="button"
                        data-role="kill-enemy-candidate"
                        data-position="${selectionContext.member.position}"
                        data-party-index="${selectionContext.member.partyIndex}"
                        data-enemy-index="${enemyIndex}"
                        ${isAlive ? '' : 'disabled'}
                        class="target-chip inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold transition-colors
                               ${!isAlive
                                 ? 'cursor-not-allowed border-gray-200 bg-gray-100 text-gray-400'
                                 : isSelected
                                 ? 'border-rose-500 bg-rose-500 text-white'
                                 : isRequested
                                 ? 'border-rose-300 bg-rose-50 text-rose-700'
                                 : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-100'}">
                  ${escapeHtml(label)}
                </button>
              `;
            }).join('')}
          </div>
        </div>
      `;
    }
    return this.#buildEnemyPopupSingleTargetControls({
      selectionContext,
      enemyNamesByEnemy,
      requestedEnemyIndex,
      outcome: ACTION_OUTCOME_TYPES.KILL,
      toggleRole: 'popup-kill-single-toggle',
      enabled: true,
    });
  }

  #buildEnemyPopupHpBreakEditorControls({ selectionContext, enemyCount, enemyNamesByEnemy, requestedEnemyIndex }) {
    if (!selectionContext || !selectionContext.skill) {
      return '<div class="text-[10px] text-gray-400">スキル未選択</div>';
    }
    if (selectionContext.breakAttributionMode === TURN_BREAK_ATTRIBUTION_MODES.NONE) {
      return '<div class="text-[10px] text-gray-400">敵を攻撃しないため指定なし</div>';
    }
    if (selectionContext.breakAttributionMode === TURN_BREAK_ATTRIBUTION_MODES.ALL) {
      const currentHpBreakEnemyIndexes = [
        ...(this.#draftHpBreakEnemyIndexesByPartyIndex?.[selectionContext.member.partyIndex] ?? []),
      ];
      return `
        <div class="mb-1">
          <div class="text-[9px] font-semibold text-rose-700 pb-0.5">HP破壊</div>
          <div class="flex flex-wrap gap-1">
            ${Array.from({ length: enemyCount }, (_, enemyIndex) => {
              const isAlive = this.#isEnemySlotAlive(enemyIndex) && this.#canEnemySlotHpBreak(enemyIndex);
              const isSelected = currentHpBreakEnemyIndexes.includes(enemyIndex);
              const isRequested = !isSelected && Number(requestedEnemyIndex) === enemyIndex;
              const label = this.#resolveEnemyPopupEnemyLabel(enemyIndex, enemyNamesByEnemy);
              return `
                <button type="button"
                        data-role="hp-break-enemy-candidate"
                        data-position="${selectionContext.member.position}"
                        data-party-index="${selectionContext.member.partyIndex}"
                        data-enemy-index="${enemyIndex}"
                        ${isAlive ? '' : 'disabled'}
                        class="target-chip inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold transition-colors
                               ${!isAlive
                                 ? 'cursor-not-allowed border-gray-200 bg-gray-100 text-gray-400'
                                 : isSelected
                                 ? 'border-rose-500 bg-rose-500 text-white'
                                 : isRequested
                                 ? 'border-rose-300 bg-rose-50 text-rose-700'
                                 : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-100'}">
                  ${escapeHtml(label)}
                </button>
              `;
            }).join('')}
          </div>
        </div>
      `;
    }
    return this.#buildEnemyPopupSingleTargetControls({
      selectionContext,
      enemyNamesByEnemy,
      requestedEnemyIndex,
      outcome: ACTION_OUTCOME_TYPES.HP_BREAK,
      toggleRole: 'popup-hp-break-single-toggle',
      enabled: true,
    });
  }

  #resolveEnemyPopupEShieldEditorState(enemyIndex) {
    const enemyKey = String(enemyIndex);
    const displayedStateByEnemy = this.#resolveDisplayedEnemyEShieldStateByEnemy();
    if (Object.prototype.hasOwnProperty.call(displayedStateByEnemy, enemyKey)) {
      return normalizeEnemyEShieldDisplayState(displayedStateByEnemy[enemyKey]);
    }
    return normalizeEnemyEShieldDisplayState(
      this.#buildProjectedEnemyPopupState()?.turnState?.enemyState?.eShieldStateByEnemy?.[enemyKey] ?? null
    );
  }

  #buildEnemyPopupEShieldEditorHtml({ enemyIndex }) {
    const request = this.#popupEShieldEditorRequest;
    if (!this.#isDraftMode() || !request || Number(request.enemyIndex) !== Number(enemyIndex)) {
      return '';
    }
    const eShieldState = this.#resolveEnemyPopupEShieldEditorState(enemyIndex);
    const current = Number(eShieldState?.current ?? 0);
    const max = Number(eShieldState?.max ?? 0);
    const defUpRate = Number(eShieldState?.defUpRate ?? 0);
    const damageLimit = Number(eShieldState?.damageLimit ?? 0);
    const selectedElements = new Set(Array.isArray(eShieldState?.elements) ? eShieldState.elements : []);

    return `
      <div data-role="enemy-popup-eshield-editor"
           data-enemy-index="${enemyIndex}"
           class="rounded-lg border border-sky-400/35 bg-slate-950/65 p-2">
        <div class="flex flex-wrap items-center justify-between gap-2 pb-2">
          <div class="text-[11px] font-semibold text-sky-100">Eシールドを編集</div>
          <button type="button"
                  data-role="enemy-popup-eshield-fill-max"
                  class="rounded-md border border-sky-300/70 bg-sky-500/20 px-2 py-1 text-[10px] font-semibold text-sky-100 hover:bg-sky-500/30">
            最大値で回復
          </button>
        </div>
        <div class="grid gap-2 sm:grid-cols-2">
          <label class="grid gap-1 text-[10px] font-semibold text-slate-200">
            <span>現在値</span>
            <input type="number"
                   min="${ENEMY_E_SHIELD_EDITOR_MIN_VALUE}"
                   value="${escapeHtml(current)}"
                   data-role="enemy-popup-eshield-current"
                   class="rounded-md border border-slate-600 bg-slate-900 px-2 py-1 text-[12px] text-slate-100" />
          </label>
          <label class="grid gap-1 text-[10px] font-semibold text-slate-200">
            <span>最大値</span>
            <input type="number"
                   min="${ENEMY_E_SHIELD_EDITOR_MIN_VALUE}"
                   value="${escapeHtml(max)}"
                   data-role="enemy-popup-eshield-max"
                   class="rounded-md border border-slate-600 bg-slate-900 px-2 py-1 text-[12px] text-slate-100" />
          </label>
          <label class="grid gap-1 text-[10px] font-semibold text-slate-200">
            <span>防御UP</span>
            <input type="number"
                   value="${escapeHtml(defUpRate)}"
                   data-role="enemy-popup-eshield-def-up-rate"
                   class="rounded-md border border-slate-600 bg-slate-900 px-2 py-1 text-[12px] text-slate-100" />
          </label>
          <label class="grid gap-1 text-[10px] font-semibold text-slate-200">
            <span>ダメージ上限</span>
            <input type="number"
                   value="${escapeHtml(damageLimit)}"
                   data-role="enemy-popup-eshield-damage-limit"
                   class="rounded-md border border-slate-600 bg-slate-900 px-2 py-1 text-[12px] text-slate-100" />
          </label>
        </div>
        <div class="pt-2">
          <div class="pb-1 text-[10px] font-semibold text-slate-200">属性</div>
          <div class="flex flex-wrap gap-1.5">
            ${ENEMY_E_SHIELD_EDITOR_ELEMENT_OPTIONS.map(([element, label]) => {
              const checked = selectedElements.has(element);
              return `
                <label class="inline-flex cursor-pointer items-center gap-1 rounded-full border px-2 py-1 text-[10px] font-semibold transition-colors
                              ${checked
                                ? 'border-sky-300 bg-sky-500/25 text-sky-50'
                                : 'border-slate-600 bg-slate-900/80 text-slate-300 hover:bg-slate-800'}">
                  <input type="checkbox"
                         data-role="enemy-popup-eshield-element-toggle"
                         data-element="${element}"
                         ${checked ? 'checked' : ''}
                         class="h-3 w-3 accent-sky-400" />
                  <span>${label}</span>
                </label>
              `;
            }).join('')}
          </div>
          <div class="pt-2 text-[10px] text-slate-400">属性未選択、または最大値が 0 以下なら Eシールド解除として保存されます。</div>
        </div>
        <div class="pt-2 flex justify-end">
          <button type="button"
                  data-role="enemy-popup-eshield-apply"
                  data-enemy-index="${enemyIndex}"
                  class="rounded-md border border-sky-300/70 bg-sky-500 px-3 py-1 text-[11px] font-bold text-slate-950 hover:bg-sky-400">
            適用
          </button>
        </div>
      </div>
    `;
  }

  #buildEnemyPopupOutcomeEditorHtml({ enemyIndex, enemyCount, enemyNamesByEnemy, isCommitted }) {
    const request = this.#popupOutcomeRequest;
    if (!this.#isDraftMode() || !request || Number(request.enemyIndex) !== Number(enemyIndex)) {
      return '';
    }
    const requestedEnemyIndex = Number(request.enemyIndex);
    const requestedOutcome = String(request.outcome ?? '').trim();
    const heading = requestedOutcome === ACTION_OUTCOME_TYPES.KILL
      ? '討伐した前衛を選択'
      : requestedOutcome === ACTION_OUTCOME_TYPES.HP_BREAK
        ? 'HP破壊した前衛を選択'
        : 'ブレイクした前衛を選択';
    const members = this.#getMembersInPositionOrder().filter((member) => member.position <= 2);
    const confirmLabel = requestedOutcome === ACTION_OUTCOME_TYPES.KILL
      ? '討伐を確定して閉じる'
      : requestedOutcome === ACTION_OUTCOME_TYPES.HP_BREAK
        ? 'HP破壊を確定して閉じる'
        : 'ブレイクを確定して閉じる';
    return `
      <div data-role="enemy-popup-editor"
           data-outcome="${escapeHtml(requestedOutcome)}"
           class="rounded-lg border border-slate-600/80 bg-slate-950/60 p-2">
        <div class="pb-2 text-[11px] font-semibold text-slate-200">${escapeHtml(heading)}</div>
        <div class="grid gap-2">
          ${members.map((member) => {
            const actorLabel = resolveManualBreakActorLabel(member, this.#store);
            const selectionContext = this.#getBreakSelectionContext({
              member,
              isCommitted,
              enemyCount,
            });
            const controlsHtml = requestedOutcome === ACTION_OUTCOME_TYPES.KILL
              ? this.#buildEnemyPopupKillEditorControls({
                selectionContext,
                enemyCount,
                enemyNamesByEnemy,
                requestedEnemyIndex,
              })
              : requestedOutcome === ACTION_OUTCOME_TYPES.HP_BREAK
                ? this.#buildEnemyPopupHpBreakEditorControls({
                  selectionContext,
                  enemyCount,
                  enemyNamesByEnemy,
                  requestedEnemyIndex,
                })
              : this.#buildEnemyPopupBreakEditorControls({
                selectionContext,
                enemyCount,
                enemyNamesByEnemy,
                requestedEnemyIndex,
              });
            return `
              <div data-role="enemy-popup-editor-actor"
                   data-party-index="${member.partyIndex}"
                   class="rounded-lg border border-slate-700 bg-slate-900/80 px-2 py-1.5">
                <div class="pb-1 text-[10px] font-semibold text-slate-200">${escapeHtml(actorLabel)}</div>
                ${controlsHtml}
              </div>
            `;
          }).join('')}
        </div>
        <div class="pt-2 flex justify-end">
          <button type="button"
                  data-role="enemy-popup-outcome-confirm"
                  data-enemy-index="${requestedEnemyIndex}"
                  class="rounded-md border border-blue-400/70 bg-blue-600 px-3 py-1 text-[11px] font-bold text-white hover:bg-blue-500">
            ${escapeHtml(confirmLabel)}
          </button>
        </div>
      </div>
    `;
  }

  #buildKillEditorHtml(isCommitted) {
    const enemyCount = isCommitted
      ? this.#getCurrentReplayTurnEnemyCount()
      : this.getCurrentEnemyCount();
    const enemyNamesByEnemy = this.#getEnemyNamesByEnemy();
    const currentActionOutcomeOverrides = isCommitted
      ? getActionOutcomeOverridesFromReplayTurn(this.#replayTurn, enemyCount)
      : this.getCurrentActionOutcomeOverrides();
    const members = this.#getMembersInPositionOrder().filter((member) => member.position <= 2);
    return `
      <div data-role="kill-editor"
           data-popover-kind="kill"
           class="target-popover absolute right-0 top-[calc(100%+4px)] z-30 w-[min(720px,calc(100vw-16px))] rounded-xl border border-gray-200 bg-white p-2.5 shadow-xl overflow-x-hidden"
           ${this.#isKillEditorOpen ? '' : 'hidden'}>
        <div class="text-[11px] font-semibold text-gray-700 pb-2">討伐を編集</div>
        <div class="grid gap-2" style="grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));">
          ${members.map((member) => {
            const actorLabel = resolveManualBreakActorLabel(member, this.#store);
            const selectionContext = this.#getBreakSelectionContext({
              member,
              isCommitted,
              enemyCount,
            });
            if (!selectionContext) {
              return '';
            }
            const memberKillEnemyIndexes = getKillEnemyIndexesForPosition(
              currentActionOutcomeOverrides,
              member.position
            );
            const killButtonsHtml = Array.from({ length: enemyCount }, (_, enemyIndex) => {
              const isAlive = this.#isEnemySlotAlive(enemyIndex) && !this.#canEnemySlotHpBreak(enemyIndex);
              const isKilled = memberKillEnemyIndexes.includes(enemyIndex);
              const enemyName = String(
                enemyNamesByEnemy[String(enemyIndex)] ?? enemyNamesByEnemy[enemyIndex] ?? ''
              ).trim();
              const label = enemyName ? `E${enemyIndex + 1} ${enemyName}` : `E${enemyIndex + 1}`;
              return `
                <button type="button"
                        data-role="kill-enemy-candidate"
                        data-enemy-index="${enemyIndex}"
                        data-position="${member.position}"
                        data-party-index="${member.partyIndex}"
                        ${isAlive ? '' : 'disabled'}
                        class="target-chip inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold transition-colors
                               ${!isAlive
                                 ? 'cursor-not-allowed border-gray-200 bg-gray-100 text-gray-400'
                                 : isKilled
                                 ? 'border-green-500 bg-green-500 text-white'
                                 : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-100'}">
                  ${label}
                </button>
              `;
            }).join('');
            return `
              <div data-role="kill-actor"
                   data-party-index="${member.partyIndex}"
                   class="rounded-lg border border-gray-100 bg-gray-50 px-2 py-1.5">
                <div class="pb-1 text-[10px] font-semibold text-gray-700">${actorLabel}</div>
                <div class="mb-1">
                  <div class="text-[9px] font-semibold text-green-700 pb-0.5">討伐</div>
                  <div class="flex flex-wrap gap-1">${killButtonsHtml}</div>
                </div>
              </div>
            `;
          }).join('')}
        </div>
        ${isCommitted
          ? '<div class="pt-2 text-[10px] text-gray-400">変更するとこのターンから再計算されます。</div>'
          : ''}
      </div>
    `;
  }

  #buildEnemyToolsBoxHtml(isCommitted) {
    return `
      <div data-role="enemy-tools-box" class="turn-info-enemy-row w-full rounded-lg border border-gray-200 bg-gray-50 p-1">
        <div class="relative w-full">
          ${this.#buildEnemyStatusTriggerHtml()}
          ${isCommitted ? '' : this.#buildEnemySummonEditorHtml()}
          ${isCommitted ? '' : this.#buildManualBreakEditorHtml(false)}
          ${isCommitted ? '' : this.#buildKillEditorHtml(false)}
        </div>
      </div>
    `;
  }

  #resolveDisplayedEnemyEShieldStateByEnemy() {
    const next = {};
    const hpBreakEnemyIndexes = new Set();
    if (!this.#isDraftMode()) {
      const enemyCount = this.#getCurrentReplayTurnEnemyCount();
      for (const override of normalizeActionOutcomeOverrides(
        this.#getReplayTurnActionOutcomeOverrides(enemyCount),
        enemyCount
      )) {
        if (override.outcome !== ACTION_OUTCOME_TYPES.HP_BREAK) {
          continue;
        }
        for (const enemyIndex of override.enemyIndexes) {
          hpBreakEnemyIndexes.add(String(enemyIndex));
        }
      }
    }
    if (this.#isDraftMode()) {
      for (const operation of Array.isArray(this.#operations) ? this.#operations : []) {
        if (String(operation?.type ?? '') !== REPLAY_OPERATION_TYPES.SET_ENEMY_E_SHIELD) {
          continue;
        }
        const enemyIndex = Number(operation?.payload?.targetEnemyIndex);
        if (!Number.isInteger(enemyIndex) || enemyIndex < 0 || enemyIndex >= MAX_ENEMY_COUNT) {
          continue;
        }
        if (operation?.payload?.eShieldState == null) {
          next[String(enemyIndex)] = null;
        }
      }
    }
    const maps = hpBreakEnemyIndexes.size > 0
      ? [
          { source: this.#stateBefore?.turnState?.enemyState?.eShieldStateByEnemy, onlyKeys: hpBreakEnemyIndexes },
          { source: this.#stateAfter?.turnState?.enemyState?.eShieldStateByEnemy, onlyKeys: null },
          { source: this.#stateBefore?.turnState?.enemyState?.eShieldStateByEnemy, onlyKeys: null },
        ]
      : [
          { source: this.#stateAfter?.turnState?.enemyState?.eShieldStateByEnemy, onlyKeys: null },
          { source: this.#stateBefore?.turnState?.enemyState?.eShieldStateByEnemy, onlyKeys: null },
        ];
    for (const { source, onlyKeys } of maps) {
      if (!source || typeof source !== 'object') {
        continue;
      }
      for (const [enemyKey, shieldState] of Object.entries(source)) {
        if (Object.prototype.hasOwnProperty.call(next, enemyKey)) {
          continue;
        }
        if (onlyKeys && !onlyKeys.has(String(enemyKey))) {
          continue;
        }
        const normalized = normalizeEnemyEShieldDisplayState(shieldState);
        if (normalized) {
          next[String(enemyKey)] = normalized;
        }
      }
    }
    return next;
  }

  #buildEnemyEShieldStripHtml() {
    const displayedStateByEnemy = this.#resolveDisplayedEnemyEShieldStateByEnemy();
    const enemyCount = clampEnemyCount(
      this.#stateAfter?.turnState?.enemyState?.enemyCount ??
      this.#stateBefore?.turnState?.enemyState?.enemyCount ??
      DEFAULT_ENEMY_COUNT
    );
    const itemHtml = Array.from({ length: enemyCount }, (_, enemyIndex) => {
      const eShieldState = displayedStateByEnemy[String(enemyIndex)] ?? null;
      if (!isDisplayableEnemyEShieldState(eShieldState)) {
        return '';
      }
      return `
        <div class="turn-info-e-shield-item" data-role="turn-info-e-shield-item" data-enemy-index="${enemyIndex}">
          ${buildEnemyEShieldBadgeHtml(eShieldState, {
            enemyIndex,
            mode: 'row',
            dataRole: 'turn-info-e-shield-badge',
            showSlotMarker: true,
          })}
        </div>
      `;
    }).filter(Boolean);

    if (itemHtml.length === 0) {
      return '';
    }

    return `
      <div class="turn-info-e-shield-strip" data-role="turn-info-e-shield-strip">
        ${itemHtml.join('')}
      </div>
    `;
  }

  #canOpenEnemyPopupSummonAction() {
    return this.#isDraftMode() && this.#getEnemySummonPresets().length > 0;
  }

  #canOpenEnemyPopupEditorAction() {
    return this.#isDraftMode();
  }

  #openEnemyPopupEditor(actionType, requestedEnemyIndex = null) {
    if (!this.#isDraftMode()) {
      return false;
    }
    this.#openTargetPickerPartyIndex = null;
    this.#isFollowUpEditorOpen = false;
    this.#clearPopupInlineEditorRequests();
    if (actionType === 'summon') {
      this.#openEnemySummonEditor(requestedEnemyIndex);
    } else {
      this.#closeEnemySummonEditor();
    }
    if (actionType === 'eshield') {
      this.#isBreakEditorOpen = false;
      this.#isKillEditorOpen = false;
      this.#setPopupEShieldEditorRequest(requestedEnemyIndex);
      this.#refreshEnemyDetailPopup(this.#getEnemyDetailPopupActiveEnemyIndex(requestedEnemyIndex));
      return true;
    }
    this.#isBreakEditorOpen = actionType === 'break';
    this.#isKillEditorOpen = actionType === 'kill';
    this.#rerenderDraftMode();
    if (actionType === 'break' || actionType === 'kill') {
      this.#emitPreviewRequest();
    }
    return true;
  }

  #buildEnemyDetailPopupToolActions() {
    return {
      summon: this.#canOpenEnemyPopupSummonAction()
        ? ({ enemyIndex, activeEnemyIndex }) => {
          this.#openEnemyPopupEditor('summon', enemyIndex);
          return {
            closePopup: false,
            activeEnemyIndex,
          };
        }
        : null,
      eshield: this.#canOpenEnemyPopupEditorAction()
        ? ({ enemyIndex, activeEnemyIndex }) => {
          this.#openEnemyPopupEditor('eshield', enemyIndex);
          return {
            closePopup: false,
            activeEnemyIndex,
          };
        }
        : null,
      break: this.#canOpenEnemyPopupEditorAction()
        ? ({ enemyIndex, activeEnemyIndex }) =>
          this.#handleEnemyPopupOutcomeAction(ACTION_OUTCOME_TYPES.BREAK, enemyIndex, activeEnemyIndex)
        : null,
      hpbreak: this.#canOpenEnemyPopupEditorAction()
        ? ({ enemyIndex, activeEnemyIndex }) =>
          this.#handleEnemyPopupOutcomeAction(ACTION_OUTCOME_TYPES.HP_BREAK, enemyIndex, activeEnemyIndex)
        : null,
      kill: this.#canOpenEnemyPopupEditorAction()
        ? ({ enemyIndex, activeEnemyIndex }) =>
          this.#handleEnemyPopupOutcomeAction(ACTION_OUTCOME_TYPES.KILL, enemyIndex, activeEnemyIndex)
        : null,
    };
  }

  #buildEnemyDetailPopupPayload(isCommitted = false, activeEnemyIndex = 0) {
    const sourceState = this.#buildProjectedEnemyPopupState();
    const enemyState = sourceState?.turnState?.enemyState ?? {};
    const displayedEShieldStateByEnemy = this.#resolveDisplayedEnemyEShieldStateByEnemy();
    const enemyNamesByEnemy = enemyState?.enemyNamesByEnemy && typeof enemyState.enemyNamesByEnemy === 'object'
      ? enemyState.enemyNamesByEnemy
      : {};
    const enemyCount = clampEnemyCount(
      sourceState?.turnState?.enemyState?.enemyCount ??
      (isCommitted ? this.#getCurrentReplayTurnEnemyCount() : this.getCurrentEnemyCount())
    );
    const actionOutcomeOverrides = this.#getCurrentActionOutcomeOverridesForDisplay(isCommitted);
    const breakEnemyIndexes = new Set(
      normalizeActionOutcomeOverrides(actionOutcomeOverrides, enemyCount)
        .filter((override) => override.outcome === ACTION_OUTCOME_TYPES.BREAK)
        .flatMap((override) => override.enemyIndexes)
        .map((enemyIndex) => Number(enemyIndex))
        .filter((enemyIndex) => Number.isInteger(enemyIndex) && enemyIndex >= 0)
    );
    const killEnemyIndexes = new Set(
      normalizeActionOutcomeOverrides(actionOutcomeOverrides, enemyCount)
        .filter((override) => override.outcome === ACTION_OUTCOME_TYPES.KILL)
        .flatMap((override) => override.enemyIndexes)
        .map((enemyIndex) => Number(enemyIndex))
        .filter((enemyIndex) => Number.isInteger(enemyIndex) && enemyIndex >= 0)
    );
    const hpBreakEnemyIndexes = new Set(
      normalizeActionOutcomeOverrides(actionOutcomeOverrides, enemyCount)
        .filter((override) => override.outcome === ACTION_OUTCOME_TYPES.HP_BREAK)
        .flatMap((override) => override.enemyIndexes)
        .map((enemyIndex) => Number(enemyIndex))
        .filter((enemyIndex) => Number.isInteger(enemyIndex) && enemyIndex >= 0)
    );
    const canSummonGlobal = this.#isDraftMode() && this.#getEnemySummonPresets().length > 0;
    const enemies = Array.from({ length: MAX_ENEMY_COUNT }, (_, enemyIndex) => {
      const occupied = enemyIndex < enemyCount;
      const killedByAttribution = killEnemyIndexes.has(enemyIndex);
      const alive = occupied && !killedByAttribution && this.#isEnemySlotAlive(enemyIndex, sourceState);
      const enemyName = String(
        enemyNamesByEnemy[String(enemyIndex)] ?? enemyNamesByEnemy[enemyIndex] ?? ''
      ).trim();
      const displayName = occupied
        ? (enemyName ? `E${enemyIndex + 1} ${enemyName}` : `E${enemyIndex + 1}`)
        : `E${enemyIndex + 1} 未使用`;
      const statuses = (Array.isArray(enemyState.statuses) ? enemyState.statuses : [])
        .filter((status) => Number(status?.targetIndex ?? -1) === enemyIndex)
        .map((status) => ({
          ...status,
          remaining: Number(status?.remaining ?? status?.remainingTurns ?? 0),
        }));
      const broken =
        breakEnemyIndexes.has(enemyIndex) ||
        this.#isEnemySlotBroken(enemyIndex, sourceState) ||
        statuses.some((status) => String(status?.statusType ?? '') === ENEMY_STATUS_BREAK);
      const enemyKey = String(enemyIndex);
      const od_rate = enemyState.odRateByEnemy?.[enemyKey] ?? null;
      const max_d_rate = enemyState.destructionRateCapByEnemy?.[enemyKey] ?? null;
      const damageRates = enemyState.damageRatesByEnemy?.[enemyKey] ?? null;
      const absorbElements = enemyState.absorbElementsByEnemy?.[enemyKey] ?? null;
      const hasDisplayedEShieldState = Object.prototype.hasOwnProperty.call(displayedEShieldStateByEnemy, enemyKey);
      const eShieldState = hasDisplayedEShieldState
        ? displayedEShieldStateByEnemy[enemyKey]
        : (enemyState.eShieldStateByEnemy?.[enemyKey] ?? null);
      const extraHpGaugeState = enemyState.extraHpGaugeStateByEnemy?.[enemyKey] ?? null;
      const canHpBreak = this.#isDraftMode() && occupied && alive && canEnemyHpBreak(extraHpGaugeState);
      const talismanState = enemyState.talismanState ?? null;
      const disasterState = enemyState.disasterState ?? null;
      return {
        enemyIndex,
        name: displayName,
        occupied,
        alive,
        broken,
        dead: occupied && !alive,
        canSummon:
          canSummonGlobal &&
          ((enemyIndex < enemyCount && !alive) || (enemyIndex === enemyCount && enemyCount < MAX_ENEMY_COUNT)),
        canBreak:
          this.#isDraftMode() &&
          occupied &&
          !killedByAttribution &&
          (breakEnemyIndexes.has(enemyIndex) || (alive && !broken)),
        canEditEShield: this.#isDraftMode() && occupied && alive,
        canHpBreak: canHpBreak || hpBreakEnemyIndexes.has(enemyIndex),
        canKill:
          !canHpBreak &&
          this.#isDraftMode() &&
          occupied &&
          (alive || killEnemyIndexes.has(enemyIndex)),
        hasPendingEShieldOperation:
          this.#isDraftMode() && Boolean(this.#findEnemyEShieldOperationForEnemyIndex(enemyIndex)),
        hasPendingBreakOperation: breakEnemyIndexes.has(enemyIndex),
        hasPendingHpBreakOperation: hpBreakEnemyIndexes.has(enemyIndex),
        hasPendingKillOperation: killEnemyIndexes.has(enemyIndex),
        popupEditorHtml:
          this.#buildEnemyPopupEShieldEditorHtml({ enemyIndex }) ||
          this.#buildEnemyPopupOutcomeEditorHtml({
            enemyIndex,
            enemyCount,
            enemyNamesByEnemy,
            isCommitted,
          }),
        statuses,
        ...(talismanState ? { talismanState: structuredClone(talismanState) } : {}),
        ...(disasterState ? { disasterState: structuredClone(disasterState) } : {}),
        ...(od_rate !== null ? { od_rate } : {}),
        ...(max_d_rate !== null ? { max_d_rate } : {}),
        ...(damageRates ? { damageRates: structuredClone(damageRates) } : {}),
        ...(absorbElements ? { absorbElements: structuredClone(absorbElements) } : {}),
        ...(eShieldState ? { eShieldState: structuredClone(eShieldState) } : {}),
        ...(extraHpGaugeState ? { extraHpGaugeState: structuredClone(extraHpGaugeState) } : {}),
      };
    });

    const normalizedActiveIndex = Number.isInteger(Number(activeEnemyIndex))
      ? Math.min(Math.max(Number(activeEnemyIndex), 0), MAX_ENEMY_COUNT - 1)
      : 0;
    const actionFlow = isCommitted
      ? this.#buildCommittedActionFlow()
      : (Array.isArray(this.#previewActionFlow) ? structuredClone(this.#previewActionFlow) : []);
    return {
      enemies,
      activeEnemyIndex: normalizedActiveIndex,
      previewActionFlow: actionFlow,
      toolActions: this.#buildEnemyDetailPopupToolActions(),
      onActiveEnemyIndexChange: ({ activeEnemyIndex: nextEnemyIndex }) =>
        this.#handleEnemyDetailPopupTabChange(nextEnemyIndex),
    };
  }

  #buildCommittedActionFlow() {
    return buildActionFlowFromRecord(this.#record);
  }

  #buildCharacterPreviewActionFlow(member, isCommitted) {
    if (!member) {
      return [];
    }
    const characterId = String(member.characterId ?? '').trim();
    if (!characterId) {
      return [];
    }
    const source = isCommitted
      ? this.#buildCommittedActionFlow()
      : (Array.isArray(this.#previewActionFlow) ? this.#previewActionFlow : []);
    const memberPartyIndex = Number(member.partyIndex);
    const matchesMember = (event, action) => {
      const eventCharacterId = String(event?.characterId ?? '').trim();
      const targetCharacterId = String(event?.targetCharacterId ?? '').trim();
      const eventPartyIndex = Number(event?.partyIndex ?? event?.targetPartyIndex);
      if (eventCharacterId && eventCharacterId === characterId) {
        return true;
      }
      if (targetCharacterId && targetCharacterId === characterId) {
        return true;
      }
      if (Number.isInteger(memberPartyIndex) && Number.isFinite(eventPartyIndex) && eventPartyIndex === memberPartyIndex) {
        return true;
      }
      const hasTargetKey = Boolean(eventCharacterId || targetCharacterId || Number.isFinite(eventPartyIndex));
      return !hasTargetKey && String(action?.actorCharacterId ?? '').trim() === characterId;
    };
    return source
      .map((action) => {
        const statusEffectsApplied = Array.isArray(action?.statusEffectsApplied)
          ? action.statusEffectsApplied.filter(
              (event) => matchesMember(event, action)
            )
          : [];
        const statusEffectsRemoved = Array.isArray(action?.statusEffectsRemoved)
          ? action.statusEffectsRemoved.filter(
              (event) => matchesMember(event, action)
            )
          : [];
        const funnelApplied = Array.isArray(action?.funnelApplied)
          ? action.funnelApplied.filter(
              (event) => matchesMember(event, action)
            )
          : [];
        return {
          ...action,
          funnelApplied,
          statusEffectsApplied,
          statusEffectsRemoved,
          enemyStatusChanges: [],
        };
      });
  }

  #buildManualBreakEditorHtml(isCommitted) {
    const enemyCount = isCommitted
      ? this.#getCurrentReplayTurnEnemyCount()
      : this.getCurrentEnemyCount();
    const enemyNamesByEnemy = this.#getEnemyNamesByEnemy();
    const members = this.#getMembersInPositionOrder().filter((member) => member.position <= 2);
    return `
      <div data-role="manual-break-editor"
           data-popover-kind="manual-break"
          class="target-popover absolute right-0 top-[calc(100%+4px)] z-30 w-[min(720px,calc(100vw-16px))] rounded-xl border border-gray-200 bg-white p-2.5 shadow-xl overflow-x-hidden"
           ${this.#isBreakEditorOpen ? '' : 'hidden'}>
        <div class="text-[11px] font-semibold text-gray-700 pb-2">ブレイクを編集</div>
        <div class="grid gap-2" style="grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));">
          ${members.map((member) => {
            const actorLabel = resolveManualBreakActorLabel(member, this.#store);
            const selectionContext = this.#getBreakSelectionContext({
              member,
              isCommitted,
              enemyCount,
            });
            if (!selectionContext) {
              return '';
            }
            return `
              <div data-role="manual-break-actor"
                   data-party-index="${member.partyIndex}"
                   class="rounded-lg border border-gray-100 bg-gray-50 px-2 py-1.5">
                <div class="pb-1 text-[10px] font-semibold text-gray-700">${actorLabel}</div>
                ${this.#buildManualBreakEditorControls({
                  selectionContext,
                  enemyCount,
                  enemyNamesByEnemy,
                })}
              </div>
            `;
          }).join('')}
        </div>
        ${isCommitted
          ? '<div class="pt-2 text-[10px] text-gray-400">変更するとこのターンから再計算されます。</div>'
          : ''}
      </div>
    `;
  }

  #getRecordSnapEntry(partyIndex) {
    return this.#record?.snapBefore?.find((entry) => entry.partyIndex === partyIndex) ?? null;
  }

  #resolveDisplayedSpFromAction(recordAction, member) {
    // committed 行の行動キャラ表示は、preview と同じく
    // 「ターン開始SP + コスト差分合計」を使う。
    // HealSp 等のスキル効果後最終SPは committed 行バッジには混ぜない。
    const changes = Array.isArray(recordAction?.spChanges) ? recordAction.spChanges : [];
    const partyIndex = Number(member?.partyIndex);
    const snapEntry = Number.isInteger(partyIndex) ? this.#getRecordSnapEntry(partyIndex) : null;
    const turnStartSp = Number(snapEntry?.sp?.current);
    const costDeltaSum = changes
      .filter((change) => change?.source === 'cost' && Number.isFinite(Number(change?.delta)))
      .reduce((sum, change) => sum + Number(change.delta), 0);
    if (Number.isFinite(turnStartSp)) {
      return turnStartSp + costDeltaSum;
    }

    const costChange = changes.find(
      (change) => change?.source === 'cost' && Number.isFinite(Number(change?.postSP))
    );
    const costPostSp = Number(costChange?.postSP);
    if (Number.isFinite(costPostSp)) {
      return costPostSp;
    }
    const lastChange = changes.filter((change) => Number.isFinite(Number(change?.postSP))).at(-1);
    if (lastChange) {
      return Number(lastChange.postSP);
    }
    const endSP = Number(recordAction?.endSP);
    return Number.isFinite(endSP) ? endSP : null;
  }

  #resolveDisplayedSpValue({ member, isCommitted, recordAction = null }) {
    if (!member) {
      return '—';
    }

    if (isCommitted) {
      // 行動キャラ: turnStartSP + cost delta を優先して取得
      const displayedSp = this.#resolveDisplayedSpFromAction(recordAction, member);
      if (Number.isFinite(displayedSp)) {
        return displayedSp;
      }
      // 非行動キャラ: projections があれば HealSp 等の効果反映済みSPを使用
      const projectedSp = Number(this.#record?.projections?.spAfterActionByPartyIndex?.[member.partyIndex]);
      if (Number.isFinite(projectedSp)) {
        return projectedSp;
      }
      return this.#getRecordSnapEntry(member.partyIndex)?.sp?.current ?? '—';
    }

    const previewSp = Number(this.#previewResourceState?.spAfterByPartyIndex?.[member.partyIndex]);
    if (Number.isFinite(previewSp)) {
      return previewSp;
    }
    return member.sp?.current ?? '—';
  }

  #getCurrentBreakEnemyIndexes({ member, isCommitted, enemyCount }) {
    if (!member) {
      return [];
    }
    const selectionContext = this.#getBreakSelectionContext({
      member,
      isCommitted,
      enemyCount,
    });
    if (!selectionContext) {
      return [];
    }
    if (
      selectionContext.breakAttributionMode === TURN_BREAK_ATTRIBUTION_MODES.SINGLE &&
      selectionContext.breakEnabled
    ) {
      return selectionContext.effectiveBreakEnemyIndexes;
    }
    if (selectionContext.breakAttributionMode === TURN_BREAK_ATTRIBUTION_MODES.ALL) {
      return selectionContext.effectiveBreakEnemyIndexes;
    }
    return [];
  }

  #buildManualBreakEditorControls({ selectionContext, enemyCount, enemyNamesByEnemy }) {
    if (!selectionContext || !selectionContext.skill) {
      return '<div class="text-[10px] text-gray-400">スキル未選択</div>';
    }

    if (selectionContext.breakAttributionMode === TURN_BREAK_ATTRIBUTION_MODES.NONE) {
      return '<div class="text-[10px] text-gray-400">敵を攻撃しないため指定なし</div>';
    }

    if (selectionContext.breakAttributionMode === TURN_BREAK_ATTRIBUTION_MODES.ALL) {
      return `
        <div class="mb-1">
          <div class="text-[9px] font-semibold text-green-700 pb-0.5">ブレイク</div>
          <div class="flex flex-wrap gap-1.5">
            ${Array.from({ length: enemyCount }, (_, enemyIndex) => {
              const isAlive = this.#isEnemySlotAlive(enemyIndex);
              const isSelected = selectionContext.effectiveBreakEnemyIndexes.includes(enemyIndex);
              const isClaimedByEarlierActor = this.#isBreakEnemyClaimedForSelection(
                selectionContext,
                enemyIndex
              );
              const enemyName = String(
                enemyNamesByEnemy[String(enemyIndex)] ?? enemyNamesByEnemy[enemyIndex] ?? ''
              ).trim();
              const label = enemyName ? `E${enemyIndex + 1} ${enemyName}` : `E${enemyIndex + 1}`;
              return `
                <button type="button"
                        data-role="manual-break-candidate"
                        data-party-index="${selectionContext.member.partyIndex}"
                        data-enemy-index="${enemyIndex}"
                        ${isAlive && !isClaimedByEarlierActor ? '' : 'disabled'}
                        class="target-chip inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-colors
                               ${!isAlive || isClaimedByEarlierActor
                                 ? 'cursor-not-allowed border-gray-200 bg-gray-100 text-gray-400'
                                 : isSelected
                                 ? 'border-amber-500 bg-amber-500 text-white'
                                 : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-100'}">
                  ${label}
                </button>
              `;
            }).join('')}
          </div>
        </div>
      `;
    }

    const selectedTargetEnemyIndex =
      selectionContext.currentReplayTarget.type === 'enemy'
        ? Number(selectionContext.currentReplayTarget.enemyIndex)
        : 0;
    const defaultTargetLabel = selectionContext.singleTargetConfig
      ? formatTurnTargetLabel(
          selectionContext.singleTargetConfig,
          normalizeTurnReplayTarget(null),
          { enemyNamesByEnemy }
        )
      : 'E1';
    const showLocalTargetOverrideControls =
      this.#isDraftMode() &&
      !selectionContext.isEnemyTargetSelectionManual &&
      selectionContext.singleTargetConfig?.kind === 'enemy' &&
      Number(selectionContext.singleTargetConfig?.candidates?.length ?? 0) > 1;
    const singleTargetClaimedByEarlierActor =
      selectionContext.currentReplayTarget.type === 'enemy' &&
      this.#isBreakEnemyClaimedForSelection(
        selectionContext,
        selectionContext.currentReplayTarget.enemyIndex
      );

    return `
      <div class="mb-1 space-y-1">
        <div class="text-[9px] font-semibold text-green-700 pb-0.5">ブレイク</div>
        ${showLocalTargetOverrideControls
          ? `
            <div class="flex flex-wrap gap-1.5">
                <button type="button"
                        data-role="manual-break-target-reset"
                        data-party-index="${selectionContext.member.partyIndex}"
                        class="target-chip inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-colors
                               ${selectionContext.explicitTarget.type === 'enemy'
                                 ? 'border-gray-200 bg-white text-gray-700 hover:bg-gray-100'
                                 : 'border-sky-500 bg-sky-500 text-white'}">
                  自動(${defaultTargetLabel})
                </button>
                ${selectionContext.singleTargetConfig.candidates.map((candidate) => {
                  const enemyName = String(
                    enemyNamesByEnemy[String(candidate.enemyIndex)] ?? enemyNamesByEnemy[candidate.enemyIndex] ?? ''
                  ).trim();
                  const label = enemyName ? `E${candidate.enemyIndex + 1} ${enemyName}` : `E${candidate.enemyIndex + 1}`;
                  const isSelected =
                    selectionContext.explicitTarget.type === 'enemy' &&
                    Number(selectionContext.explicitTarget.enemyIndex) === Number(candidate.enemyIndex);
                  const candidateClaimedByEarlierActor = this.#isBreakEnemyClaimedForSelection(
                    selectionContext,
                    candidate.enemyIndex
                  );
                  const candidateDisabled = candidate.disabled || candidateClaimedByEarlierActor;
                  return `
                    <button type="button"
                            data-role="manual-break-target-candidate"
                            data-party-index="${selectionContext.member.partyIndex}"
                            data-enemy-index="${candidate.enemyIndex}"
                            ${candidateDisabled ? 'disabled' : ''}
                            class="target-chip inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-colors
                                   ${candidateDisabled
                                     ? 'cursor-not-allowed border-gray-200 bg-gray-100 text-gray-400'
                                     : isSelected
                                     ? 'border-sky-500 bg-sky-500 text-white'
                                     : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-100'}">
                      ${label}
                    </button>
                  `;
                }).join('')}
            </div>
          `
          : ''}
        <button type="button"
                data-role="manual-break-single-toggle"
                data-party-index="${selectionContext.member.partyIndex}"
                ${singleTargetClaimedByEarlierActor ? 'disabled' : ''}
                class="target-chip inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-colors
                       ${singleTargetClaimedByEarlierActor
                         ? 'cursor-not-allowed border-gray-200 bg-gray-100 text-gray-400'
                         : selectionContext.breakEnabled
                         ? 'border-amber-500 bg-amber-500 text-white'
                         : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-100'}">
          ${selectionContext.currentTargetLabel || defaultTargetLabel}
        </button>
      </div>
    `;
  }

  #buildTargetControlHtml({
    member,
    manualTargetConfig,
    currentReplayTarget,
    isCommitted,
    isEditable = true,
  }) {
    const enemyNamesByEnemy =
      this.#stateBefore?.turnState?.enemyState?.enemyNamesByEnemy &&
      typeof this.#stateBefore.turnState.enemyState.enemyNamesByEnemy === 'object'
        ? this.#stateBefore.turnState.enemyState.enemyNamesByEnemy
        : {};
    if (!manualTargetConfig) {
      if (!isCommitted || currentReplayTarget?.type === 'none') {
        return '';
      }
      const fallbackKindLabel = currentReplayTarget?.type === 'ally' ? '味方' : '敵';
      const fallbackSummaryLabel = formatTurnTargetLabel(
        {
          kind: currentReplayTarget?.type === 'ally' ? 'ally' : 'enemy',
          candidates: [],
        },
        currentReplayTarget,
        { enemyNamesByEnemy, store: this.#store }
      );
      return `
        <div data-role="target-trigger-label"
             class="shrink-0 text-[10px] leading-none px-2 py-1 rounded-full border border-gray-200 bg-gray-50 text-gray-500">
          ${fallbackKindLabel}: ${fallbackSummaryLabel}
        </div>
      `;
    }
    const summaryLabel = formatTurnTargetLabel(manualTargetConfig, currentReplayTarget, {
      enemyNamesByEnemy,
      store: this.#store,
    });
    const kindLabel = manualTargetConfig.kind === 'enemy' ? '敵' : '味方';
    if (!isEditable) {
      return `
        <div data-role="target-trigger-label"
             class="shrink-0 text-[10px] leading-none px-2 py-1 rounded-full border border-gray-200 bg-gray-50 text-gray-500">
          ${kindLabel}: ${summaryLabel}
        </div>
      `;
    }
    const isOpen = this.#openTargetPickerPartyIndex === member.partyIndex;
    const popoverHtml =
      manualTargetConfig.kind === 'enemy'
        ? this.#buildEnemyTargetPopoverHtml(manualTargetConfig, currentReplayTarget, enemyNamesByEnemy, member.partyIndex)
        : this.#buildAllyTargetPopoverHtml(manualTargetConfig, currentReplayTarget, member.partyIndex);

    return `
      <div class="relative shrink-0">
        <button type="button"
                data-role="target-trigger"
                data-party-index="${member.partyIndex}"
                data-target-kind="${manualTargetConfig.kind}"
                class="target-trigger inline-flex items-center gap-1 text-[10px] leading-none px-2 py-1 rounded-full border border-sky-200 bg-sky-50 text-sky-700 hover:bg-sky-100 transition-colors">
          <span class="font-semibold">${kindLabel}</span>
          <span>${summaryLabel}</span>
        </button>
        <div data-role="target-popover"
             data-party-index="${member.partyIndex}"
             data-target-kind="${manualTargetConfig.kind}"
             class="target-popover absolute right-0 top-[calc(100%+4px)] z-20 min-w-[180px] rounded-xl border border-gray-200 bg-white p-2 shadow-xl"
             ${isOpen ? '' : 'hidden'}>
          ${popoverHtml}
        </div>
      </div>
    `;
  }

  #buildEnemyTargetPopoverHtml(manualTargetConfig, currentReplayTarget, enemyNamesByEnemy, actorPartyIndex) {
    const selectedTarget = coerceTurnReplayTarget(manualTargetConfig, currentReplayTarget);
    return `
      <div class="flex flex-wrap gap-1.5">
        ${manualTargetConfig.candidates.map((candidate) => {
          const isSelected = Number(selectedTarget.enemyIndex) === Number(candidate.enemyIndex);
          const enemyName = String(
            enemyNamesByEnemy[String(candidate.enemyIndex)] ?? enemyNamesByEnemy[candidate.enemyIndex] ?? ''
          ).trim();
          const label = enemyName ? `E${candidate.enemyIndex + 1} ${enemyName}` : `E${candidate.enemyIndex + 1}`;
          return `
            <button type="button"
                    data-role="target-candidate"
                    data-actor-party-index="${actorPartyIndex}"
                    data-target-kind="enemy"
                    data-enemy-index="${candidate.enemyIndex}"
                    ${candidate.disabled ? 'disabled' : ''}
                    class="target-chip inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-colors
                           ${candidate.disabled
                             ? 'cursor-not-allowed border-gray-200 bg-gray-100 text-gray-400'
                             : isSelected
                             ? 'border-sky-500 bg-sky-500 text-white'
                             : 'border-gray-200 bg-gray-50 text-gray-700 hover:bg-gray-100'}">
              ${label}
            </button>
          `;
        }).join('')}
      </div>
    `;
  }

  #buildAllyTargetPopoverHtml(manualTargetConfig, currentReplayTarget, actorPartyIndex) {
    const selectedTarget = coerceTurnReplayTarget(manualTargetConfig, currentReplayTarget);
    return `
      <div class="grid grid-cols-3 gap-2">
        ${manualTargetConfig.candidates.map((candidate) => {
          const rawStyle = this.#store?.getStyleById?.(candidate.styleId) ?? null;
          const imageUrl = rawStyle ? resolveStyleImageUrl(rawStyle) : '';
          const isSelected = Number(selectedTarget.styleId) === Number(candidate.styleId);
          const isDisabled = candidate.disabled === true;
          return `
            <button type="button"
                    data-role="target-candidate"
                    data-actor-party-index="${actorPartyIndex}"
                    data-target-kind="ally"
                    data-style-id="${candidate.styleId}"
                    ${isDisabled ? 'disabled' : ''}
                    class="target-ally-option flex flex-col items-center gap-1 rounded-xl border p-1.5 text-[10px] transition-colors
                           ${isSelected
                             ? 'border-emerald-500 bg-emerald-50 text-emerald-700'
                             : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50'}
                           ${isDisabled ? 'opacity-35 grayscale cursor-not-allowed' : ''}"
                    title="Pos ${candidate.position + 1} ${candidate.characterName}">
              <span class="relative flex h-10 w-10 items-center justify-center overflow-hidden rounded-lg bg-gray-100">
                ${imageUrl
                  ? `<img src="${imageUrl}" alt="${candidate.characterName}" class="h-full w-full object-cover" />`
                  : '<span class="text-gray-300">？</span>'}
              </span>
              <span class="block w-full truncate text-center">P${candidate.position + 1}</span>
            </button>
          `;
        }).join('')}
      </div>
    `;
  }

  /** commit 済みターンの position 順メンバーリスト（snapBefore ベース） */
  #getMembersInPositionOrder() {
    const state = this.#stateBefore;
    if (!state?.party) return [];
    return [...state.party].sort((a, b) => a.position - b.position);
  }

  #buildHtml() {
    const isCommitted = this.#isCommittedDisplayMode();
    const isEditMode = this.#isEditMode();
    const members = this.#getMembersInPositionOrder();

    // ターン情報
    const turnInfoHtml = this.#buildTurnInfoHtml({ isCommitted, isEditMode });

    // スロット（前衛 position 0-2）
    const frontSlots = members
      .filter((m) => m.position <= 2)
      .map((m) => this.#buildFrontSlotHtml(m, isCommitted))
      .join('');

    // スロット（後衛 position 3-5）
    const backSlots = members
      .filter((m) => m.position >= 3)
      .map((m) => this.#buildBackSlotHtml(m, isCommitted))
      .join('');

    // ボタン列
    const buttonHtml = this.#buildButtonHtml({ isCommitted, isEditMode });

    // メモ欄
    const noteValue = this.getCurrentNote();
    const fieldChipsHtml = this.#buildFieldChipsHtml();
    const manualBreakChipsHtml = this.#buildManualBreakChipsHtml(isCommitted);
    const hpBreakChipsHtml = this.#buildHpBreakChipsHtml(isCommitted);
    const killChipsHtml = this.#buildKillChipsHtml(isCommitted);
    const followUpChipsHtml = this.#buildFollowUpChipsHtml(isCommitted);
    const operationChipsHtml = this.#buildOperationChipsHtml();
    const partyStateControlHtml = this.#buildPartyStateControlHtml(isCommitted);
    const noteHtml = `
      <div data-turn-note class="flex flex-col self-stretch min-h-0 flex-shrink-0 w-36 gap-1">
        ${fieldChipsHtml}
        ${manualBreakChipsHtml}
        ${hpBreakChipsHtml}
        ${killChipsHtml}
        ${followUpChipsHtml}
        ${operationChipsHtml}
        ${partyStateControlHtml}
        <textarea data-role="note" rows="2"
                  class="w-full min-h-[52px] flex-1 text-xs border border-gray-200 rounded px-1 py-0.5
                         resize-none focus:outline-none focus:ring-1 focus:ring-blue-300
                         ${isCommitted ? 'bg-gray-50' : 'bg-white'}"
                  ${isCommitted ? 'readonly' : ''}>${noteValue}</textarea>
      </div>`;

    const rowToneClass = this.#rowDiagnostics.error
      ? 'bg-red-50/60'
      : isEditMode
        ? 'bg-amber-50/40'
        : isCommitted
          ? ''
          : 'bg-blue-50/30';
    const battleEnded = isCommitted && Boolean(this.#stateAfter?.turnState?.enemyState?.allEnemiesDefeated);

    return `
      <div data-turn-row data-row-mode="${this.#rowMode}" data-battle-ended="${battleEnded}" class="flex items-stretch gap-px border-b border-gray-200 bg-white
                  hover:bg-gray-50 transition-colors ${rowToneClass}">
        ${turnInfoHtml}
        <div data-turn-slots class="flex gap-px flex-1 min-w-0">
          <div data-turn-front-group class="flex flex-1 gap-px min-w-0">
            ${frontSlots}
          </div>
          <div class="w-px bg-gray-200 self-stretch mx-0.5 flex-shrink-0"></div>
          <div data-turn-back-group class="flex flex-1 gap-px min-w-0">
            ${backSlots}
          </div>
        </div>
        ${buttonHtml}
        ${noteHtml}
      </div>`;
  }

  #getDisplayEnemyAttackTargetCharacterIds(isCommitted) {
    return isCommitted
      ? this.#extractEnemyAttackTargetCharacterIdsFromOverrideEntries(this.#replayTurn?.overrideEntries ?? [])
      : [...(this.#draftEnemyAttackTargetCharacterIds ?? [])];
  }

  #getDisplayDpStateByPartyIndex(isCommitted) {
    return isCommitted
      ? this.#extractDpStateByPartyIndexFromOverrideEntries(this.#replayTurn?.overrideEntries ?? [])
      : structuredClone(this.#draftDpStateByPartyIndex ?? {});
  }

  #resolveDpOverrideMode(member, dpStateByPartyIndex = {}) {
    const override = dpStateByPartyIndex?.[String(member?.partyIndex)] ?? dpStateByPartyIndex?.[member?.partyIndex] ?? null;
    if (!override) {
      return '';
    }
    const currentDp = Number(override.currentDp);
    const cap = Number(override.effectiveDpCap ?? override.baseMaxDp ?? member?.dpState?.effectiveDpCap ?? member?.dpState?.baseMaxDp ?? 0);
    if (!Number.isFinite(currentDp) || !Number.isFinite(cap) || cap <= 0) {
      return '';
    }
    if (currentDp >= cap) {
      return '100';
    }
    if (currentDp === Math.max(1, cap - 1)) {
      return '99';
    }
    return '';
  }

  #buildPartyStateControlHtml(isCommitted) {
    const members = this.#getMembersInPositionOrder();
    if (members.length === 0) {
      return '';
    }
    const attackedIds = new Set(this.#getDisplayEnemyAttackTargetCharacterIds(isCommitted));
    const dpStateByPartyIndex = this.#getDisplayDpStateByPartyIndex(isCommitted);
    const attackedCount = attackedIds.size;
    const dpOverrideCount = Object.keys(dpStateByPartyIndex ?? {}).length;
    const hasOverride = attackedCount > 0 || dpOverrideCount > 0;
    if (isCommitted && !hasOverride) {
      return '';
    }
    const summaryParts = [
      attackedCount > 0 ? `被弾${attackedCount}` : '',
      dpOverrideCount > 0 ? `DP${dpOverrideCount}` : '',
    ].filter(Boolean);
    const summaryLabel = summaryParts.length > 0 ? summaryParts.join(' ') : '';
    const toggleTone = hasOverride
      ? 'border-rose-200 bg-rose-50 text-rose-700'
      : 'border-gray-200 bg-white text-gray-600';
    const toggleHtml = `
      <button type="button"
              data-role="party-state-toggle"
              class="inline-flex h-6 w-full items-center justify-center gap-1 rounded border px-1 text-[10px] font-semibold ${toggleTone}"
              title="敵行動による被弾とDP調整">
        <span>${this.#isPartyStateControlOpen ? '閉じる' : '敵行動'}</span>
        ${summaryLabel ? `<span class="truncate text-[9px] opacity-80">${escapeHtml(summaryLabel)}</span>` : ''}
      </button>`;
    if (!this.#isPartyStateControlOpen) {
      return `<div data-role="party-state-control-collapsed" class="flex flex-col gap-0.5">${toggleHtml}</div>`;
    }
    const rows = members.map((member) => {
      const label = String(member?.characterName ?? member?.characterId ?? `P${Number(member?.position ?? 0) + 1}`);
      const shortLabel = label.length > 4 ? label.slice(0, 4) : label;
      const isAttacked = attackedIds.has(String(member?.characterId ?? ''));
      const dpMode = this.#resolveDpOverrideMode(member, dpStateByPartyIndex);
      const disabled = isCommitted ? ' disabled' : '';
      return `
        <div class="flex items-center gap-1">
          <span class="min-w-0 flex-1 truncate text-[10px] font-semibold text-gray-500" title="${escapeHtml(label)}">${escapeHtml(shortLabel)}</span>
          <button type="button" data-role="ally-hit-toggle" data-character-id="${escapeHtml(member.characterId)}"
                  class="h-5 w-9 rounded border text-[10px] font-semibold ${isAttacked ? 'border-rose-300 bg-rose-50 text-rose-700' : 'border-gray-200 bg-white text-gray-500'}"
                  title="${escapeHtml(label)} 被弾"${disabled}>被弾</button>
          <button type="button" data-role="ally-dp-set" data-party-index="${member.partyIndex}" data-dp-mode="100"
                  class="h-5 w-9 rounded border text-[10px] font-semibold ${dpMode === '100' ? 'border-emerald-300 bg-emerald-50 text-emerald-700' : 'border-gray-200 bg-white text-gray-500'}"
                  title="${escapeHtml(label)} DP 100%にする"${disabled}>100</button>
          <button type="button" data-role="ally-dp-set" data-party-index="${member.partyIndex}" data-dp-mode="99"
                  class="h-5 w-8 rounded border text-[10px] font-semibold ${dpMode === '99' ? 'border-amber-300 bg-amber-50 text-amber-700' : 'border-gray-200 bg-white text-gray-500'}"
                  title="${escapeHtml(label)} DP 99%にする"${disabled}>99</button>
        </div>`;
    }).join('');
    return `
      <div data-role="party-state-control" class="flex flex-col gap-1 rounded border border-gray-100 bg-gray-50/70 p-1">
        ${toggleHtml}
        ${rows}
      </div>`;
  }

  #bindOutcomeEditorInteractionEvents(container, { popupScoped = false } = {}) {
    if (!container) {
      return;
    }

    container.querySelectorAll('[data-role="manual-break-target-reset"]').forEach((btn) => {
      btn.addEventListener('click', (event) => {
        event.stopPropagation();
        if (!this.#isDraftMode()) {
          return;
        }
        const partyIndex = Number(btn.dataset.partyIndex);
        if (!Number.isFinite(partyIndex)) {
          return;
        }
        this.#isBreakEditorOpen = !popupScoped;
        this.#setDraftEnemyTarget(partyIndex, null);
        this.#applyDraftAttributionMutation({ clearPopupOutcomeRequest: !popupScoped });
      });
    });

    container.querySelectorAll('[data-role="manual-break-target-candidate"]').forEach((btn) => {
      btn.addEventListener('click', (event) => {
        event.stopPropagation();
        if (!this.#isDraftMode()) {
          return;
        }
        const partyIndex = Number(btn.dataset.partyIndex);
        const enemyIndex = Number(btn.dataset.enemyIndex);
        if (!Number.isFinite(partyIndex) || !Number.isInteger(enemyIndex) || enemyIndex < 0) {
          return;
        }
        const member = this.#getPartyMemberByPartyIndex(partyIndex);
        const selectionContext = this.#getBreakSelectionContext({
          member,
          isCommitted: false,
          enemyCount: this.getCurrentEnemyCount(),
        });
        if (this.#isBreakEnemyClaimedForSelection(selectionContext, enemyIndex)) {
          return;
        }
        this.#isBreakEditorOpen = !popupScoped;
        this.#setDraftEnemyTarget(partyIndex, enemyIndex);
        this.#applyDraftAttributionMutation({ clearPopupOutcomeRequest: !popupScoped });
      });
    });

    container.querySelectorAll('[data-role="manual-break-single-toggle"]').forEach((btn) => {
      btn.addEventListener('click', (event) => {
        event.stopPropagation();
        const partyIndex = Number(btn.dataset.partyIndex);
        const requestedEnemyIndex = btn.dataset.requestedEnemyIndex ?? null;
        this.#isBreakEditorOpen = !popupScoped;
        this.#toggleBreakSingleSelectionForPartyIndex(partyIndex, requestedEnemyIndex, {
          clearPopupOutcomeRequest: !popupScoped,
        });
      });
    });

    container.querySelectorAll('[data-role="manual-break-candidate"]').forEach((btn) => {
      btn.addEventListener('click', (event) => {
        event.stopPropagation();
        const partyIndex = Number(btn.dataset.partyIndex);
        const enemyIndex = Number(btn.dataset.enemyIndex);
        this.#isBreakEditorOpen = !popupScoped;
        this.#toggleBreakMultiSelectionForPartyIndex(partyIndex, enemyIndex);
      });
    });

    container.querySelectorAll('[data-role="kill-enemy-candidate"]').forEach((btn) => {
      btn.addEventListener('click', (event) => {
        event.stopPropagation();
        const partyIndex = Number(btn.dataset.partyIndex);
        const enemyIndex = Number(btn.dataset.enemyIndex);
        this.#isBreakEditorOpen = false;
        this.#isKillEditorOpen = !popupScoped;
        this.#toggleKillSelectionForPartyIndex(partyIndex, enemyIndex);
      });
    });

    container.querySelectorAll('[data-role="popup-kill-single-toggle"]').forEach((btn) => {
      btn.addEventListener('click', (event) => {
        event.stopPropagation();
        const partyIndex = Number(btn.dataset.partyIndex);
        const requestedEnemyIndex = btn.dataset.requestedEnemyIndex ?? null;
        this.#isBreakEditorOpen = false;
        this.#isKillEditorOpen = !popupScoped;
        this.#toggleKillSingleSelectionForPartyIndex(partyIndex, requestedEnemyIndex, {
          clearPopupOutcomeRequest: !popupScoped,
        });
      });
    });

    container.querySelectorAll('[data-role="hp-break-enemy-candidate"]').forEach((btn) => {
      btn.addEventListener('click', (event) => {
        event.stopPropagation();
        const partyIndex = Number(btn.dataset.partyIndex);
        const enemyIndex = Number(btn.dataset.enemyIndex);
        this.#isBreakEditorOpen = false;
        this.#isKillEditorOpen = !popupScoped;
        this.#toggleHpBreakSelectionForPartyIndex(partyIndex, enemyIndex);
      });
    });

    container.querySelectorAll('[data-role="popup-hp-break-single-toggle"]').forEach((btn) => {
      btn.addEventListener('click', (event) => {
        event.stopPropagation();
        const partyIndex = Number(btn.dataset.partyIndex);
        const requestedEnemyIndex = btn.dataset.requestedEnemyIndex ?? null;
        this.#isBreakEditorOpen = false;
        this.#isKillEditorOpen = !popupScoped;
        this.#toggleHpBreakSingleSelectionForPartyIndex(partyIndex, requestedEnemyIndex, {
          clearPopupOutcomeRequest: !popupScoped,
        });
      });
    });
  }

  #bindEnemyDetailPopupEditorEvents() {
    const popupRoot = this.#enemyDetailPopup?.getRootElement?.();
    if (!popupRoot) {
      return;
    }
    this.#bindOutcomeEditorInteractionEvents(popupRoot, { popupScoped: true });

    popupRoot.querySelectorAll('[data-role="enemy-popup-outcome-confirm"]').forEach((btn) => {
      btn.addEventListener('click', (event) => {
        event.stopPropagation();
        if (!this.#isDraftMode()) {
          return;
        }
        const enemyIndex = Number(btn.dataset.enemyIndex);
        const fallbackIndex = Number.isInteger(enemyIndex) && enemyIndex >= 0
          ? enemyIndex
          : this.#getEnemyDetailPopupActiveEnemyIndex();
        this.#clearPopupOutcomeRequest();
        this.#refreshEnemyDetailPopup(fallbackIndex);
      });
    });

    popupRoot.querySelectorAll('[data-role="enemy-popup-eshield-editor"]').forEach((editorRoot) => {
      const syncCounts = () => this.#syncEnemyEShieldEditorCountInputs(editorRoot);
      editorRoot.querySelectorAll(
        '[data-role="enemy-popup-eshield-current"], [data-role="enemy-popup-eshield-max"]'
      ).forEach((input) => {
        input.addEventListener('input', syncCounts);
        input.addEventListener('blur', syncCounts);
      });
    });

    popupRoot.querySelectorAll('[data-role="enemy-popup-eshield-fill-max"]').forEach((button) => {
      button.addEventListener('click', (event) => {
        event.stopPropagation();
        const editorRoot = button.closest('[data-role="enemy-popup-eshield-editor"]');
        const currentInput = editorRoot?.querySelector('[data-role="enemy-popup-eshield-current"]');
        const maxInput = editorRoot?.querySelector('[data-role="enemy-popup-eshield-max"]');
        if (!currentInput || !maxInput) {
          return;
        }
        currentInput.value = String(normalizeNonNegativeInteger(maxInput.value));
      });
    });

    popupRoot.querySelectorAll('[data-role="enemy-popup-eshield-apply"]').forEach((button) => {
      button.addEventListener('click', (event) => {
        event.stopPropagation();
        const editorRoot = button.closest('[data-role="enemy-popup-eshield-editor"]');
        this.#applyEnemyPopupEShieldEditor(editorRoot);
      });
    });
  }

  #buildTurnInfoHtml({ isCommitted, isEditMode }) {
    const warningCount = this.#rowDiagnostics.warnings.length;
    const errorBadgeHtml = this.#rowDiagnostics.error
      ? '<span class="turn-info-status-chip turn-info-status-chip-error">Error</span>'
      : '';
    const warningBadgeHtml = warningCount > 0
      ? `<span class="turn-info-status-chip turn-info-status-chip-warning">Warn(${warningCount})</span>`
      : '';
    const editBadgeHtml = isEditMode
      ? '<span class="turn-info-status-chip turn-info-status-chip-edit">編集中</span>'
      : '';

    if (!isCommitted) {
      // 未コミット行: stateBefore の turnState から OD / EX 状態を先読みする
      const turnState = this.#stateBefore?.turnState;
      const nextTurnNo = isEditMode
        ? Number(this.#replayTurn?.turn ?? turnState?.turnIndex ?? this.#turnIndex + 1)
        : (turnState?.turnIndex ?? 1);
      const turnType   = String(turnState?.turnType ?? '');
      const isOdTurn     = turnType === 'od';
      const isExtraTurn  = turnType === 'extra';
      const odSuspended  = Boolean(turnState?.odSuspended);
      // OD文脈 = ODターン or OD一時停止中（EX中のOD）
      const inOd = isOdTurn || odSuspended;
      const inEx = isExtraTurn;
      // ODレベルラベル: turnLabel から "OD1" 等を抽出
      const odTurnLabel = String(turnState?.turnLabel ?? '');
      const odLevelLabel = inOd ? resolveOdMarkerLabel(odTurnLabel, { fallback: 'OD' }) : '';
      const sequenceLabel = isEditMode
        ? `#${this.#record?.turnId ?? this.#turnIndex + 1}`
        : null;
      return `
        <div data-turn-info class="turn-info-panel flex-shrink-0 ${TURN_INFO_PANEL_WIDTH_CLASS} flex flex-col items-start justify-start
                    gap-0.5 px-1 py-0.5 border-r border-gray-200">
          <div data-role="turn-info-stack" class="turn-info-stack">
            <div class="turn-info-header">
              ${sequenceLabel ? `<span class="turn-info-sequence">${sequenceLabel}</span>` : ''}
              <span>T${nextTurnNo}</span>
              ${odLevelLabel ? `<span class="turn-info-marker turn-info-marker-od">${odLevelLabel}</span>` : ''}
              ${inEx ? `<span class="turn-info-marker turn-info-marker-ex">EX</span>` : ''}
              ${editBadgeHtml}
              ${warningBadgeHtml}
              ${errorBadgeHtml}
            </div>
            ${this.#buildEnemyToolsBoxHtml(false)}
            ${this.#buildEnemyEShieldStripHtml()}
            ${this.#buildOdGaugeGraphHtml({
              beforeValue: turnState?.odGauge,
              afterValue: turnState?.odGauge,
            })}
          </div>
          ${this.#rowDiagnostics.error
            ? `<div class="pt-0.5 text-[9px] font-semibold text-red-700 leading-tight">${this.#rowDiagnostics.error}</div>`
            : ''}
        </div>`;
    }

    const rec = this.#record;
    const fallbackTurnState = this.#stateBefore?.turnState ?? {};
    const turnNo = rec?.turnIndex ?? this.#replayTurn?.turn ?? this.#turnIndex + 1;
    const seqId  = rec?.turnId ?? this.#turnIndex + 1;
    const odGaugeAtStart = rec?.odGaugeAtStart ?? fallbackTurnState?.odGauge ?? 0;
    const odGaugeAtEnd = rec?.projections?.odGaugeAtEnd ?? odGaugeAtStart;
    const isExtraTurn   = Boolean(rec?.isExtraTurn ?? String(fallbackTurnState?.turnType ?? '') === 'extra');
    const odLevelLabel = resolveOdMarkerLabel(rec?.odTurnLabelAtStart ?? fallbackTurnState?.turnLabel ?? '');
    // OD文脈 = ODレベルラベルあり（コミット済みではodSuspendedをodTurnLabelAtStartで兼用）
    const inOd = !!odLevelLabel;
    const inEx = isExtraTurn;

    const allEnemiesDefeated = Boolean(this.#stateAfter?.turnState?.enemyState?.allEnemiesDefeated);
    return `
      <div data-turn-info class="turn-info-panel flex-shrink-0 ${TURN_INFO_PANEL_WIDTH_CLASS} flex flex-col items-start justify-start
                  gap-0.5 px-1 py-0.5 border-r border-gray-200">
        <div data-role="turn-info-stack" class="turn-info-stack">
          <div class="turn-info-header">
            <span class="turn-info-sequence">#${seqId}</span>
            <span>T${turnNo}</span>
            ${inOd ? `<span class="turn-info-marker turn-info-marker-od">${odLevelLabel}</span>` : ''}
            ${inEx ? `<span class="turn-info-marker turn-info-marker-ex">EX</span>` : ''}
            ${warningBadgeHtml}
            ${errorBadgeHtml}
          </div>
          ${this.#buildEnemyToolsBoxHtml(!isEditMode)}
          ${this.#buildEnemyEShieldStripHtml()}
          ${this.#buildOdGaugeGraphHtml({
            beforeValue: odGaugeAtStart,
            afterValue: odGaugeAtEnd,
          })}
        </div>
        ${this.#rowDiagnostics.error
          ? `<div class="pt-0.5 text-[9px] font-semibold text-red-700 leading-tight">${this.#rowDiagnostics.error}</div>`
          : ''}
        ${allEnemiesDefeated
          ? `<div data-role="turn-info-battle-end-row" class="w-full">
               <div data-role="turn-info-battle-end"
                    class="text-[9px] font-bold text-red-600 bg-red-50 rounded px-1 py-px border border-red-200 w-full text-center">
                 バトル終了
               </div>
             </div>`
          : ''}
      </div>`;
  }

  /** member.styleId から raw style 経由で画像 URL を取得する */
  #resolveImageUrl(member) {
    const currentFormInfo = member?.getCurrentFormInfo?.() ?? null;
    if (currentFormInfo?.image) {
      return resolveStyleAssetUrl(currentFormInfo.image);
    }
    const rawStyle = this.#store?.getStyleById?.(member.styleId);
    return rawStyle ? resolveStyleImageUrl(rawStyle) : '';
  }

  #resolveImageAlt(member) {
    const currentFormInfo = member?.getCurrentFormInfo?.() ?? null;
    if (currentFormInfo?.displayName) {
      return String(currentFormInfo.displayName);
    }
    return String(member?.styleName ?? '');
  }

  #buildFormChangeButtonHtml(member) {
    if (!this.#isDraftMode() || !member?.hasFormChange?.()) {
      return '';
    }
    const nextFormInfo = member?.getAlternateFormInfo?.() ?? null;
    const currentFormInfo = member?.getCurrentFormInfo?.() ?? null;
    if (!nextFormInfo?.key) {
      return '';
    }
    const title = [currentFormInfo?.displayName, nextFormInfo?.displayName]
      .filter(Boolean)
      .join(' → ');
    return `
      <button type="button"
              data-role="form-change-btn"
              data-party-index="${member.partyIndex}"
              data-form-key="${nextFormInfo.key}"
              title="${escapeHtml(title || 'フォームチェンジ')}"
              class="absolute left-0.5 bottom-0.5 rounded-full border border-fuchsia-200 bg-fuchsia-600/90 px-1.5 py-[1px] text-[8px] font-bold leading-none tracking-[0.08em] text-white shadow-sm hover:bg-fuchsia-500">
        CHANGE
      </button>
    `;
  }

  /** EX ターン中かどうかを判定する（未コミット行専用）。*/
  #isExtraTurn() {
    return this.#stateBefore?.turnState?.turnType === 'extra';
  }

  /**
   * EX ターンでこのメンバーが行動可能かを判定する。
   * エンジンの isMemberActionableInCurrentTurn と同じロジック。
   * 未コミット行でのみ使用（コミット済み行は record に結果が確定している）。
   */
  #isActionable(member) {
    const turnState = this.#stateBefore?.turnState;
    if (turnState?.turnType !== 'extra') return true;
    const allowed = turnState.extraTurnState?.allowedCharacterIds ?? [];
    return allowed.includes(member.characterId);
  }

  /**
   * D&D によるポジション入れ替えが許可されているかを判定する。
   * ドメイン層の canSwapWith() と同じロジック。
   * EX ターン中: 両方のメンバーが allowedCharacterIds に含まれる場合のみ許可。
   */
  #isSwapAllowed(srcPosition, dstPosition) {
    if (!this.#isExtraTurn()) return true;
    const party = this.#stateBefore?.party;
    const src = party?.find((m) => m.position === srcPosition);
    const dst = party?.find((m) => m.position === dstPosition);
    const allowed = new Set(this.#stateBefore?.turnState?.extraTurnState?.allowedCharacterIds ?? []);
    return allowed.has(src?.characterId) && allowed.has(dst?.characterId);
  }

  #buildFrontSlotHtml(member, isCommitted) {
    const imageUrl = this.#resolveImageUrl(member);
    const imageAlt = this.#resolveImageAlt(member);
    const formChangeButtonHtml = this.#buildFormChangeButtonHtml(member);

    // スキル選択肢（replaySlot は inactive 判定でも必要なため先に算出）
    const skills = member.getActionSkills ? member.getActionSkills() : [];
    const replaySlot = isCommitted
      ? (this.#record?.actions?.find?.(a => a.positionIndex === member.position) ?? null)
      : null;
    const repeatCastCount = isCommitted ? resolveRepeatCastCount(replaySlot) : 1;
    const repeatIndicatorHtml = repeatCastCount > 1
      ? `<span data-role="repeat-indicator"
               data-cast-count="${repeatCastCount}"
               class="inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-1.5 py-px text-[10px] font-semibold leading-none text-amber-700"
               title="同じスキルを${repeatCastCount}回連続で実行">
           x${repeatCastCount}
         </span>`
      : '';

    // EX ターンで行動しなかったメンバーは inactive スロット表示にする。
    //   - 未コミット行: allowedCharacterIds に含まれない → EX待機
    //   - コミット済み行: EX ターンで action が null → EX待機（コミット後も同様に表示）
    if (!isCommitted && !this.#isActionable(member)) {
      return this.#buildInactiveSlotHtml(member, imageUrl, isCommitted);
    }
    if (isCommitted && this.#record?.isExtraTurn && replaySlot === null) {
      return this.#buildInactiveSlotHtml(member, imageUrl, isCommitted);
    }

    const snapEntry = isCommitted ? this.#getRecordSnapEntry(member.partyIndex) : null;
    const spDisplay = this.#resolveDisplayedSpValue({
      member,
      isCommitted,
      recordAction: replaySlot,
    });
    // トークン・士気・バフ（ターン開始前の値）
    const tokenCurrent  = isCommitted ? (snapEntry?.tokenState?.current  ?? 0) : (member.tokenState?.current  ?? 0);
    const tokenMax      = isCommitted ? (snapEntry?.tokenState?.max      ?? 10) : (member.tokenState?.max      ?? 10);
    const moraleCurrent = isCommitted ? (snapEntry?.moraleState?.current ?? 0) : (member.moraleState?.current ?? 0);
    const statusEffectsDisplay = isCommitted ? (snapEntry?.statusEffects ?? []) : (member.statusEffects ?? []);
    const isReinforcedModeDisplay = isCommitted ? Boolean(snapEntry?.isReinforcedMode) : Boolean(member.isReinforcedMode);
    const reinforcedTurnsRemainingDisplay = isCommitted
      ? Number(snapEntry?.reinforcedTurnsRemaining ?? 0)
      : Number(member.reinforcedTurnsRemaining ?? 0);
    const actionDisabledTurnsDisplay = isCommitted ? (snapEntry?.actionDisabledTurns ?? 0) : (member.actionDisabledTurns ?? 0);
    const actionDisabledIconEntry = buildActionDisabledIconEntry(actionDisabledTurnsDisplay);
    const extraStatusIcons = [
      ...(isReinforcedModeDisplay
        ? [{
            iconUrl: resolveUiAssetUrl('Reinforce.webp'),
            alt: '鬼神化中',
            title: `鬼神化中: 残${reinforcedTurnsRemainingDisplay}T`,
          }]
        : []),
      ...(actionDisabledIconEntry
        ? [actionDisabledIconEntry]
        : []),
    ];
    const buffListHtml = buildBuffListHtmlWithExtras(statusEffectsDisplay, {
      prependIcons: extraStatusIcons,
    });
    const spColor = typeof spDisplay === 'number' && spDisplay < 0 ? '#ef4444' : '#ffffff';
    // コミット済み: record から復元 / 未コミット: D&D 後の保存値（partyIndex キー）→ なければ先頭スキル
    // TODO: skills[0] が通常攻撃/指揮行動であることは JSON 挿入順への暗黙依存。
    //       CharacterStyle.getDefaultActionSkillId() が追加されたらそちらに移行する。
    const selectedSkillId = isCommitted
      ? (replaySlot?.skillId ?? null)
      : (this.#draftSlotSkills?.[member.partyIndex]?.skillId ?? null);

    // this.#stateBefore が null の場合は formatSkillCostLabel が raw spCost をフォールバック表示する。
    const stateForCost = this.#stateBefore ?? null;

    const visibleSkills = skills;

    // 選択中スキルが無効になった場合は先頭スキルにフォールバック
    const hasSelection = selectedSkillId != null && visibleSkills.some((s) => s.skillId === selectedSkillId);
    const effectiveSelectedId = hasSelection ? selectedSkillId : (visibleSkills[0]?.skillId ?? null);
    const selectedSkill = effectiveSelectedId != null
      ? (skills.find((s) => s.skillId === effectiveSelectedId) ?? null)
      : null;
    const skillOptions = visibleSkills.map((s) => {
      const isSelected = s.skillId === effectiveSelectedId;
      const costLabel = formatSkillCostLabel(s, member, stateForCost);
      const elementHint = getElementHintForDuplicateNamedSkill(s, visibleSkills);
      const elementPrefix = elementHint ? `(${elementHint})` : '';
      return `<option value="${s.skillId}" data-cost-label="${costLabel}" data-element-prefix="${elementPrefix}" data-skill-name="${s.name}"${isSelected ? ' selected' : ''}>${costLabel}${elementPrefix}${s.name}</option>`;
    }).join('');

    const selectDisabled = isCommitted ? 'disabled' : '';
    const currentEnemyCount = isCommitted
      ? this.#getCurrentReplayTurnEnemyCount()
      : this.getCurrentEnemyCount();
    const effectiveSelectedSkill = this.#resolveEffectiveSkill(member, selectedSkill, stateForCost);
    const explicitTarget = isCommitted
      ? this.#getRecordActionReplayTarget(replaySlot)
      : this.#getDraftReplayTarget(member.partyIndex);
    const manualTargetConfig = this.#getManualTargetConfigForMember({
      member,
      skill: selectedSkill,
      effectiveSkill: effectiveSelectedSkill,
      enemyCount: currentEnemyCount,
      explicitTarget,
      isCommitted,
    });
    const currentReplayTarget = this.#getCurrentReplayTarget({
      partyIndex: member.partyIndex,
      targetConfig: manualTargetConfig,
      recordAction: replaySlot,
    });
    const isTargetEditable =
      manualTargetConfig?.kind === 'enemy'
        ? this.#simulatorSettings?.targetSelection?.enemyMode === 'manual'
        : this.#simulatorSettings?.targetSelection?.allyMode === 'manual';
    const targetControlHtml = this.#buildTargetControlHtml({
      member,
      manualTargetConfig,
      currentReplayTarget,
      isCommitted,
      isEditable: isTargetEditable,
    });

    // EX ターン: 非行動可能メンバーは #buildInactiveSlotHtml で早期 return 済みのため、
    // ここに到達するメンバーは全員 allowedCharacterIds に含まれる。draggable に EX 制限不要。
    const draggable = this.#isDraftMode();
    const dragHandleAttributes = draggable
      ? 'data-role="turn-slot-drag-handle" draggable="true" title="ドラッグで入れ替え"'
      : 'data-role="turn-slot-drag-handle"';
    const targetControlAnchorHtml = targetControlHtml
      ? `
        <div data-role="slot-target-anchor" data-position="${member.position}"
             class="flex justify-end items-start px-0.5">
          ${targetControlHtml}
        </div>
      `
      : '';

    return `
      <div data-turn-slot data-position="${member.position}" data-repeat-cast-count="${repeatCastCount}"
           class="flex flex-col flex-1 min-w-0 border-r border-gray-100 last:border-r-0 select-none">
        <!-- 属性バッジ（左）＋ スキル select（右）。target trigger は別領域に分離して幅発振を防ぐ -->
        <div data-role="slot-select-row" data-position="${member.position}" class="flex items-center gap-0.5 px-0.5 pt-0.5">
          <div data-skill-badges data-position="${member.position}"
               class="grid grid-cols-2 gap-px flex-shrink-0 self-stretch">
            ${this.#buildSkillBadgesHtml(selectedSkill, member, stateForCost)}
          </div>
          <select data-skill-select data-position="${member.position}" data-party-index="${member.partyIndex}" ${selectDisabled}
                  class="flex-1 min-w-0 text-xs border border-gray-200 rounded px-0.5 py-px
                         ${isCommitted ? 'bg-gray-50 text-gray-500' : 'bg-white'}
                         focus:outline-none focus:ring-1 focus:ring-blue-300">
            ${skillOptions}
          </select>
          ${repeatIndicatorHtml}
        </div>
        <!-- アイコン（固定サイズ）＋ 情報スペース ＋ アイコン直下トークン/士気 -->
        <div data-role="slot-body" class="flex flex-col p-0.5 gap-0.5">
          <div class="flex items-start gap-1">
            <div data-turn-slot-icon ${dragHandleAttributes}
                 class="relative flex-shrink-0 overflow-hidden rounded-sm bg-gray-100
                        ${draggable ? 'cursor-grab active:cursor-grabbing' : ''}">
              ${imageUrl
                ? `<img src="${imageUrl}" alt="${imageAlt}" draggable="false"
                        class="w-full h-full object-cover" />`
                : `<div class="w-full h-full flex items-center justify-center text-gray-300">？</div>`
              }
              ${formChangeButtonHtml}
              <div data-sp-badge class="absolute -top-0.5 -right-0.5 font-bold leading-none text-center px-1 py-0.5 min-w-[20px]"
                   style="color:${spColor};text-shadow:-1px -1px 0 #000,1px -1px 0 #000,-1px 1px 0 #000,1px 1px 0 #000,0 0 4px rgba(0,0,0,0.9);">
                ${spDisplay}
              </div>
            </div>
            <!-- バフ/デバフ・状態異常アイコンスペース兼 target trigger 置き場 -->
            <div data-slot-info-space data-position="${member.position}" class="flex-1 min-w-0">
              ${buffListHtml}
            </div>
          </div>
          ${targetControlAnchorHtml}
          <!-- アイコン直下: トークン・士気 -->
          <div data-role="slot-footer" class="flex items-center gap-1.5 flex-wrap px-0.5">
            ${this.#buildTokenHtml(tokenCurrent, tokenMax)}
            ${this.#buildMoraleHtml(moraleCurrent)}
          </div>
        </div>
      </div>`;
  }

  /** EX ターンで行動しなかった前衛メンバー用スロット（スキル select なし）。
   *  未コミット行: amber 色で「EX待機」表示。
   *  コミット済み行: gray 色で「EX待機」表示（後衛スロットと同トーン）。
   */
  #buildInactiveSlotHtml(member, imageUrl, isCommitted) {
    const imageAlt = this.#resolveImageAlt(member);
    const formChangeButtonHtml = this.#buildFormChangeButtonHtml(member);
    const inactiveSnap = isCommitted ? this.#getRecordSnapEntry(member.partyIndex) : null;
    const sp = this.#resolveDisplayedSpValue({ member, isCommitted });
    const tokenCurrent  = isCommitted ? (inactiveSnap?.tokenState?.current  ?? 0) : (member.tokenState?.current  ?? 0);
    const tokenMax      = isCommitted ? (inactiveSnap?.tokenState?.max      ?? 10) : (member.tokenState?.max      ?? 10);
    const moraleCurrent = isCommitted ? (inactiveSnap?.moraleState?.current ?? 0) : (member.moraleState?.current ?? 0);
    const spColor = typeof sp === 'number' && sp < 0 ? '#ef4444' : '#ffffff';
    const labelClass = isCommitted
      ? 'text-gray-300 border-gray-100 bg-gray-50'
      : 'text-amber-400 border-amber-100 bg-amber-50';
    return `
      <div data-turn-slot data-position="${member.position}"
           class="flex flex-col flex-1 min-w-0 border-r border-gray-100 last:border-r-0 select-none">
        <div class="px-0.5 pt-0.5">
          <div data-role="slot-state-label" class="w-full text-xs rounded px-0.5 py-px border ${labelClass}">EX待機</div>
        </div>
        <div data-role="slot-body" class="flex flex-col p-0.5 gap-0.5 opacity-50">
          <div class="flex items-start gap-1">
            <div data-turn-slot-icon class="relative flex-shrink-0 overflow-hidden rounded-sm bg-gray-50">
              ${imageUrl
                ? `<img src="${imageUrl}" alt="${imageAlt}" draggable="false"
                        class="w-full h-full object-cover opacity-40" />`
                : `<div class="w-full h-full flex items-center justify-center text-gray-200">？</div>`
              }
              ${formChangeButtonHtml}
              <div data-sp-badge class="absolute -top-0.5 -right-0.5 font-bold leading-none text-center px-1 py-0.5 min-w-[20px]"
                   style="color:${spColor};text-shadow:-1px -1px 0 #000,1px -1px 0 #000,-1px 1px 0 #000,1px 1px 0 #000,0 0 4px rgba(0,0,0,0.7);">
                ${sp}
              </div>
            </div>
            <div data-slot-info-space class="flex-1 min-w-0"></div>
          </div>
          <div data-role="slot-footer" class="flex items-center gap-1.5 flex-wrap px-0.5">
            ${this.#buildTokenHtml(tokenCurrent, tokenMax)}
            ${this.#buildMoraleHtml(moraleCurrent)}
          </div>
        </div>
      </div>`;
  }

  #buildBackSlotHtml(member, isCommitted) {
    const imageUrl = this.#resolveImageUrl(member);
    const imageAlt = this.#resolveImageAlt(member);
    const formChangeButtonHtml = this.#buildFormChangeButtonHtml(member);
    const backSnap = isCommitted ? this.#getRecordSnapEntry(member.partyIndex) : null;
    const sp = this.#resolveDisplayedSpValue({ member, isCommitted });
    const tokenCurrent  = isCommitted ? (backSnap?.tokenState?.current  ?? 0) : (member.tokenState?.current  ?? 0);
    const tokenMax      = isCommitted ? (backSnap?.tokenState?.max      ?? 10) : (member.tokenState?.max      ?? 10);
    const moraleCurrent = isCommitted ? (backSnap?.moraleState?.current ?? 0) : (member.moraleState?.current ?? 0);
    const spColor = typeof sp === 'number' && sp < 0 ? '#ef4444' : '#ffffff';

    // EX ターン: allowedCharacterIds に含まれない後衛メンバーはドラッグ不可
    const draggable = this.#isDraftMode() && (!this.#isExtraTurn() || this.#isActionable(member));
    const dragHandleAttributes = draggable
      ? 'data-role="turn-slot-drag-handle" draggable="true" title="ドラッグで入れ替え"'
      : 'data-role="turn-slot-drag-handle"';
    return `
      <div data-turn-slot data-position="${member.position}"
           class="flex flex-col flex-1 min-w-0 border-r border-gray-100 last:border-r-0 select-none">
        <!-- スキル select プレースホルダー（高さ揃え用） -->
        <div class="px-0.5 pt-0.5">
          <div data-role="slot-state-label" class="w-full text-xs text-gray-300 border border-gray-100 rounded px-0.5 py-px
                      bg-gray-50">後衛</div>
        </div>
        <!-- アイコン（固定サイズ）＋ 情報スペース ＋ アイコン直下トークン/士気 -->
        <div data-role="slot-body" class="flex flex-col p-0.5 gap-0.5 opacity-70">
          <div class="flex items-start gap-1">
            <div data-turn-slot-icon ${dragHandleAttributes}
                 class="relative flex-shrink-0 overflow-hidden rounded-sm bg-gray-50
                        ${draggable ? 'cursor-grab active:cursor-grabbing' : ''}">
              ${imageUrl
                ? `<img src="${imageUrl}" alt="${imageAlt}" draggable="false"
                        class="w-full h-full object-cover opacity-60" />`
                : `<div class="w-full h-full flex items-center justify-center text-gray-200">？</div>`
              }
              ${formChangeButtonHtml}
              <div data-sp-badge class="absolute -top-0.5 -right-0.5 font-bold leading-none text-center px-1 py-0.5 min-w-[20px] opacity-80"
                   style="color:${spColor};text-shadow:-1px -1px 0 #000,1px -1px 0 #000,-1px 1px 0 #000,1px 1px 0 #000,0 0 4px rgba(0,0,0,0.7);">
                ${sp}
              </div>
            </div>
            <!-- 将来のバフ/デバフ・状態異常アイコンスペース -->
            <div data-slot-info-space class="flex-1 min-w-0"></div>
          </div>
          <!-- アイコン直下: トークン・士気（後衛） -->
          <div data-role="slot-footer" class="flex items-center gap-1.5 flex-wrap px-0.5">
            ${this.#buildTokenHtml(tokenCurrent, tokenMax)}
            ${this.#buildMoraleHtml(moraleCurrent)}
          </div>
        </div>
      </div>`;
  }

  #buildButtonHtml({ isCommitted, isEditMode }) {
    const followUpControlHtml = `
      <div class="col-span-2 relative">
        <button data-role="follow-up-toggle"
                class="w-full text-[10px] py-0.5 rounded border border-cyan-300 bg-cyan-50 font-semibold text-cyan-700 hover:bg-cyan-100 transition-colors">
          追撃
        </button>
        ${this.#buildFollowUpEditorHtml(isCommitted)}
      </div>
    `;

    if (isCommitted) {
      return `
        <div data-turn-buttons class="flex-shrink-0 w-[110px] px-1 py-1">
          <button data-role="edit-btn"
                  class="w-full text-xs py-1 rounded border border-blue-300 bg-blue-50 text-blue-700 font-semibold hover:bg-blue-100 transition-colors">
            編集
          </button>
        </div>`;
    }

    const od = this.#odState;
    const preemptiveLevel = od?.preemptiveOdLevel ?? null;
    const interruptLevel  = od?.interruptOdLevel  ?? null;
    const canPreemptive   = od?.activatablePreemptive ?? [];
    const canInterrupt    = od?.activatableInterrupt  ?? [];

    const preemptiveOptions = [
      `<option value="">先制—</option>`,
      ...[1, 2, 3].map((lv) => {
        const disabled  = !canPreemptive.includes(lv) ? 'disabled' : '';
        const selected  = preemptiveLevel === lv ? 'selected' : '';
        return `<option value="${lv}" ${disabled} ${selected}>OD${lv}</option>`;
      }),
    ].join('');

    const interruptOptions = [
      `<option value="">割込—</option>`,
      ...[1, 2, 3].map((lv) => {
        const disabled  = !canInterrupt.includes(lv) ? 'disabled' : '';
        const selected  = interruptLevel === lv ? 'selected' : '';
        return `<option value="${lv}" ${disabled} ${selected}>OD${lv}</option>`;
      }),
    ].join('');

    const preemptiveActive = preemptiveLevel != null;
    const interruptActive  = interruptLevel  != null;

    const operationState = this.#operationState ?? {};
    const ks = operationState.kishinkaStatus ?? { hasTezuka: false };
    const makai = operationState.makaiKiheiStatus ?? { hasYamawaki: false };
    const allOut = operationState.allOutAttackStatus ?? { hasAbility: false };
    const specialButtonCount = [
      ks.hasTezuka && !ks.isActive && !(ks.actionDisabledTurns > 0),
      makai.hasYamawaki,
      allOut.hasAbility,
    ].filter(Boolean).length;
    const compactSpecialButtons = specialButtonCount >= 3;
    const specialButtonClass = compactSpecialButtons
      ? 'w-full h-full text-[8px] leading-[0.85rem] rounded px-0.5 py-0 border font-semibold'
      : 'w-full h-full text-[9px] leading-tight rounded px-0.5 py-0.5 border font-semibold';
    const turnButtonRowClass = compactSpecialButtons
      ? 'auto-rows-[minmax(20px,auto)]'
      : 'auto-rows-[minmax(24px,auto)]';
    let kishinkaHtml = '';
    if (ks.hasTezuka) {
      if (ks.isActive) {
        // 鬼神化中表示は slot-info-space の通常状態変化エリアへ統一する。
        kishinkaHtml = '';
      } else if (ks.actionDisabledTurns > 0) {
        // 行動不能表示は slot-info-space の通常状態変化エリアへ統一する。
        kishinkaHtml = '';
      } else {
        const kActive = Boolean(ks.activePending);
        kishinkaHtml = `<button data-role="kishinka-btn"
          title="${kActive ? '鬼神化は操作タグから取り消せます' : '鬼神化を操作タグに追加（OD+15%）'}"
          ${kActive ? 'disabled' : ''}
          class="${specialButtonClass}
                   ${kActive
                     ? 'bg-purple-200 text-purple-700 border-purple-300 cursor-not-allowed'
                     : 'bg-white text-purple-700 border-purple-400 hover:bg-purple-50'}">
          ${kActive ? '鬼神化待機' : '鬼神化'}
        </button>`;
      }
    }

    let makaiHtml = '';
    if (makai.hasYamawaki) {
      makaiHtml = `<button data-role="makai-kihei-btn"
        title="騎兵起動を操作タグに追加"
        ${makai.available ? '' : 'disabled'}
        class="${specialButtonClass}
               ${makai.available
                 ? 'bg-white text-rose-700 border-rose-400 hover:bg-rose-50'
                 : 'bg-rose-100 text-rose-300 border-rose-200 cursor-not-allowed'}">
        騎兵起動<br>残${makai.remainingUses}
      </button>`;
    }

    let allOutHtml = '';
    if (allOut.hasAbility) {
      const allOutActive = Boolean(allOut.activePending);
      allOutHtml = `<button data-role="all-out-attack-btn"
        title="${allOutActive ? '総攻撃は操作タグから取り消せます' : '総攻撃を操作タグに追加'}"
        ${allOut.available ? '' : 'disabled'}
        class="${specialButtonClass}
               ${allOut.available
                 ? 'bg-white text-amber-700 border-amber-400 hover:bg-amber-50'
                 : allOutActive
                   ? 'bg-amber-200 text-amber-700 border-amber-300 cursor-not-allowed'
                   : 'bg-amber-100 text-amber-300 border-amber-200 cursor-not-allowed'}">
        ${allOutActive ? '総攻撃待機' : '総攻撃'}
      </button>`;
    }

    return `
      <div data-turn-buttons class="flex-shrink-0 w-[110px] grid grid-cols-2 gap-0.5 px-1 py-1 ${turnButtonRowClass}">
        ${isEditMode
          ? `
            <button data-role="recommit-btn"
                    class="text-xs py-0.5 rounded bg-blue-500 text-white font-medium
                           hover:bg-blue-600 active:bg-blue-700 transition-colors">
              再コミット
            </button>
            <button data-role="edit-cancel-btn"
                    class="text-xs py-0.5 rounded border border-gray-300 bg-white text-gray-700 font-medium
                           hover:bg-gray-50 transition-colors">
              キャンセル
            </button>
          `
          : `
            <button data-role="commit-btn"
                    class="col-span-2 text-xs py-0.5 rounded bg-blue-500 text-white font-medium
                           hover:bg-blue-600 active:bg-blue-700 transition-colors">
              実行
            </button>
          `}
        <select data-od-type="preemptive" title="先制OD"
                class="w-full text-[10px] border rounded px-0.5 py-px focus:outline-none focus:ring-1
                       ${preemptiveActive
                         ? 'border-purple-400 bg-purple-100 text-purple-700 font-semibold focus:ring-purple-300'
                         : 'border-gray-200 bg-white text-gray-400 focus:ring-gray-300'}">
          ${preemptiveOptions}
        </select>
        <select data-od-type="interrupt" title="割込OD"
                class="w-full text-[10px] border rounded px-0.5 py-px focus:outline-none focus:ring-1
                       ${interruptActive
                         ? 'border-orange-400 bg-orange-100 text-orange-700 font-semibold focus:ring-orange-300'
                         : 'border-gray-200 bg-white text-gray-400 focus:ring-gray-300'}">
          ${interruptOptions}
        </select>
        ${kishinkaHtml}
        ${makaiHtml}
        ${allOutHtml}
        ${followUpControlHtml}
      </div>`;
  }

  #bindEvents() {
    if (this.#isDraftMode()) {
      this.#root.querySelectorAll('[data-skill-select]').forEach((sel) => {
        sel.addEventListener('change', () => {
          const partyIndex = Number(sel.dataset.partyIndex);
          const skillId = sel.value === '' ? null : Number(sel.value);
          if (Number.isFinite(partyIndex) && skillId != null) {
            this.#draftSlotSkills[partyIndex] = { partyIndex, skillId };
          }
          const member = this.#getPartyMemberByPartyIndex(partyIndex);
          const formChanged = member && skillId != null
            ? this.#syncFormChangeForSkill(member, skillId)
            : false;
          this.#openTargetPickerPartyIndex = null;
          this.#isBreakEditorOpen = false;
          this.#isKillEditorOpen = false;
          this.#isFollowUpEditorOpen = false;
          this.#closeEnemySummonEditor();
          if (this.#isEditMode()) {
            this.#rerenderDraftMode();
            this.#emitPreviewRequest();
            return;
          }
          if (!formChanged) {
            this.#rerenderDraftMode();
            this.#emitPreviewRequest();
          }
        });
      });
    }

    this.#root.querySelectorAll('[data-role="target-trigger"]').forEach((btn) => {
      btn.addEventListener('click', (event) => {
        event.stopPropagation();
        const partyIndex = Number(btn.dataset.partyIndex);
        this.#isBreakEditorOpen = false;
        this.#isKillEditorOpen = false;
        this.#isFollowUpEditorOpen = false;
        this.#closeEnemySummonEditor();
        this.#openTargetPickerPartyIndex =
          this.#openTargetPickerPartyIndex === partyIndex ? null : partyIndex;
        if (this.#isDraftMode()) {
          this.#rerenderDraftMode();
        }
      });
    });

    this.#root.querySelectorAll('[data-role="target-candidate"]').forEach((btn) => {
      btn.addEventListener('click', (event) => {
        event.stopPropagation();
        if (!this.#isDraftMode()) {
          return;
        }
        if (btn.disabled) {
          return;
        }

        const actorPartyIndex = Number(btn.dataset.actorPartyIndex);
        const member =
          this.#stateBefore?.party?.find((candidate) => Number(candidate?.partyIndex) === actorPartyIndex) ?? null;
        if (!member) {
          return;
        }
        const targetKind = String(btn.dataset.targetKind ?? '');
        let target = normalizeTurnReplayTarget(null);
        if (targetKind === 'enemy') {
          target = normalizeTurnReplayTarget({
            type: 'enemy',
            enemyIndex: Number(btn.dataset.enemyIndex),
          });
        } else if (targetKind === 'ally') {
          target = normalizeTurnReplayTarget({
            type: 'ally',
            styleId: Number(btn.dataset.styleId),
          });
        }

        this.#openTargetPickerPartyIndex = null;
        this.#isBreakEditorOpen = false;
        this.#isKillEditorOpen = false;
        this.#isFollowUpEditorOpen = false;
        this.#closeEnemySummonEditor();
        this.#draftTargets = {
          ...this.#draftTargets,
          [actorPartyIndex]: target,
        };
        this.#rerenderDraftMode();
        this.#emitPreviewRequest();
      });
    });

    this.#root.querySelectorAll('[data-role="party-state-toggle"]').forEach((btn) => {
      btn.addEventListener('click', (event) => {
        event.stopPropagation();
        this.#isPartyStateControlOpen = !this.#isPartyStateControlOpen;
        if (this.#isDraftMode()) {
          this.#rerenderDraftMode();
          return;
        }
        this.update({
          rowMode: this.#rowMode,
          rowDiagnostics: this.#rowDiagnostics,
          record: this.#record,
          replayTurn: this.#replayTurn,
          operations: this.#operations,
          operationState: this.#operationState,
          enemyPresets: this.#enemyPresets,
          stateBefore: this.#stateBefore,
          stateAfter: this.#stateAfter,
          previewResourceState: this.#previewResourceState,
          previewActionFlow: this.#previewActionFlow,
          previewOdGaugeAfter: this.#previewOdGaugeAfter,
          odState: this.#odState,
          simulatorSettings: this.#simulatorSettings,
          openTargetPickerPartyIndex: this.#openTargetPickerPartyIndex,
          isBreakEditorOpen: this.#isBreakEditorOpen,
        });
      });
    });

    if (this.#isDraftMode()) {
      this.#root.querySelectorAll('[data-role="ally-hit-toggle"]').forEach((btn) => {
        btn.addEventListener('click', (event) => {
          event.stopPropagation();
          const characterId = String(btn.dataset.characterId ?? '').trim();
          if (!characterId) {
            return;
          }
          const currentIds = new Set(this.#draftEnemyAttackTargetCharacterIds ?? []);
          if (currentIds.has(characterId)) {
            currentIds.delete(characterId);
          } else {
            currentIds.add(characterId);
          }
          this.#draftEnemyAttackTargetCharacterIds = [...currentIds];
          this.#rerenderDraftMode();
          this.#emitPreviewRequest();
        });
      });

      this.#root.querySelectorAll('[data-role="ally-dp-set"]').forEach((btn) => {
        btn.addEventListener('click', (event) => {
          event.stopPropagation();
          const partyIndex = Number(btn.dataset.partyIndex);
          const mode = String(btn.dataset.dpMode ?? '');
          const member = this.#getPartyMemberByPartyIndex(partyIndex);
          if (!member || (mode !== '100' && mode !== '99')) {
            return;
          }
          const key = String(partyIndex);
          const currentMode = this.#resolveDpOverrideMode(member, this.#draftDpStateByPartyIndex);
          if (currentMode === mode) {
            delete this.#draftDpStateByPartyIndex[key];
          } else {
            const nextState = this.#buildDpOverrideState(member, mode);
            if (!nextState) {
              return;
            }
            this.#draftDpStateByPartyIndex = {
              ...this.#draftDpStateByPartyIndex,
              [key]: nextState,
            };
          }
          this.#rerenderDraftMode();
          this.#emitPreviewRequest();
        });
      });
    }

    this.#root.querySelectorAll('[data-role="follow-up-toggle"]').forEach((btn) => {
      btn.addEventListener('click', (event) => {
        event.stopPropagation();
        this.#openTargetPickerPartyIndex = null;
        this.#isBreakEditorOpen = false;
        this.#isKillEditorOpen = false;
        this.#isFollowUpEditorOpen = !this.#isFollowUpEditorOpen;
        this.#closeEnemySummonEditor();
        if (this.#isDraftMode()) {
          this.#rerenderDraftMode();
          this.#emitPreviewRequest();
        }
      });
    });

    this.#root.querySelectorAll('[data-role="enemy-summon-select"]').forEach((select) => {
      select.addEventListener('change', (event) => {
        event.stopPropagation();
        this.#draftSummonEnemyId = Number(select.value);
        this.#openEnemySummonEditor(this.#requestedEnemySummonIndex);
        this.#rerenderDraftMode();
      });
    });

    this.#root.querySelectorAll('[data-role="enemy-summon-submit"]').forEach((button) => {
      button.addEventListener('click', (event) => {
        event.stopPropagation();
        const preset = this.#findEnemySummonPresetById(this.#draftSummonEnemyId);
        const operation = this.#buildEnemySummonOperation(preset);
        if (!operation) {
          return;
        }
        this.#closeEnemySummonEditor();
        if (this.#isEditMode()) {
          if (!this.#addDraftOperation(operation)) {
            return;
          }
          this.#rerenderDraftMode();
          this.#emitPreviewRequest();
          this.#closeEnemyDetailPopup();
          return;
        }
        this.#onOperationAdd?.(this.#turnIndex, operation);
        this.#closeEnemyDetailPopup();
      });
    });

    this.#root.querySelectorAll('[data-role="enemy-detail-trigger"]').forEach((label) => {
      let longPressTimerId = null;
      const clearLongPressTimer = () => {
        if (longPressTimerId === null) {
          return;
        }
        window.clearTimeout(longPressTimerId);
        longPressTimerId = null;
      };
      const openEnemyDetail = (eventLike) => {
        this.#openEnemyDetailPopupPanel(eventLike, 0);
      };

      label.addEventListener('contextmenu', (event) => {
        event.stopPropagation();
        event.preventDefault();
        clearLongPressTimer();
        openEnemyDetail(event);
      });

      label.addEventListener('click', (event) => {
        event.stopPropagation();
        clearLongPressTimer();
        openEnemyDetail(event);
      });

      label.addEventListener('touchstart', () => {
        clearLongPressTimer();
        longPressTimerId = window.setTimeout(() => {
          clearLongPressTimer();
          openEnemyDetail({
            stopPropagation: () => {},
            preventDefault: () => {},
          });
        }, ENEMY_DETAIL_LONG_PRESS_MS);
      }, { passive: true });

      label.addEventListener('touchmove', clearLongPressTimer, { passive: true });
      label.addEventListener('touchend', clearLongPressTimer, { passive: true });
      label.addEventListener('touchcancel', clearLongPressTimer, { passive: true });
    });

    this.#bindOutcomeEditorInteractionEvents(this.#root);

    this.#root.querySelectorAll('[data-role="follow-up-enemy-candidate"]').forEach((btn) => {
      btn.addEventListener('click', (event) => {
        event.stopPropagation();
        const enemyIndex = Number(btn.dataset.enemyIndex);
        if (!Number.isInteger(enemyIndex) || enemyIndex < 0) return;
        const partyIndex = Number(btn.dataset.partyIndex);

        const enemyCount = this.#isDraftMode()
          ? this.getCurrentEnemyCount()
          : this.#getCurrentReplayTurnEnemyCount();

        if (this.#isDraftMode()) {
          const current = this.#draftFollowUpEnemyIndexByPartyIndex[partyIndex] ?? null;
          const next = current === enemyIndex ? null : enemyIndex;
          if (next === null) {
            delete this.#draftFollowUpEnemyIndexByPartyIndex[partyIndex];
          } else if (next < enemyCount) {
            this.#draftFollowUpEnemyIndexByPartyIndex[partyIndex] = next;
          }
          this.#rerenderDraftMode();
          this.#emitPreviewRequest();
        }
      });
    });

    // Commit ボタン
    const commitBtn = this.#root.querySelector('[data-role="commit-btn"]');
    commitBtn?.addEventListener('click', () => {
      this.#onCommit?.(this.#turnIndex);
    });
    const recommitBtn = this.#root.querySelector('[data-role="recommit-btn"]');
    recommitBtn?.addEventListener('click', () => {
      this.#onRecommit?.(this.#turnIndex);
    });
    const editCancelBtn = this.#root.querySelector('[data-role="edit-cancel-btn"]');
    editCancelBtn?.addEventListener('click', () => {
      this.#onEditCancel?.(this.#turnIndex);
    });
    const editBtn = this.#root.querySelector('[data-role="edit-btn"]');
    editBtn?.addEventListener('click', () => {
      this.#onEditStart?.(this.#turnIndex);
    });

    // メモ欄
    const noteEl = this.#root.querySelector('[data-role="note"]');
    noteEl?.addEventListener('input', () => {
      this.#draftNote = noteEl.value;
      if (this.#isInputMode()) {
        this.#onNoteChange?.(this.#turnIndex, noteEl.value);
      }
    });

    this.#root.querySelectorAll('[data-role="operation-chip-remove"]').forEach((button) => {
      button.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        const operationIndex = Number(button.dataset.operationIndex);
        if (this.#isEditMode()) {
          if (!this.#removeDraftOperation(operationIndex)) {
            return;
          }
          this.#rerenderDraftMode();
          this.#emitPreviewRequest();
          return;
        }
        this.#onOperationRemove?.(this.#turnIndex, operationIndex);
      });
    });

    if (this.#isDraftMode()) {
      this.#root.querySelectorAll('[data-od-type]').forEach((sel) => {
        sel.addEventListener('change', () => {
          const odType = sel.dataset.odType;  // 'preemptive' | 'interrupt'
          const level = sel.value === '' ? null : Number(sel.value);
          if (this.#isEditMode()) {
            this.#setDraftOdSelection(odType, level);
            this.#rerenderDraftMode();
            this.#emitPreviewRequest();
            return;
          }
          this.#onOdChange?.(this.#turnIndex, odType, level);
        });
      });
    }

    if (this.#isDraftMode()) {
      const kishinkaBtn = this.#root.querySelector('[data-role="kishinka-btn"]');
      kishinkaBtn?.addEventListener('click', () => {
        if (this.#isEditMode()) {
          if (!this.#addDraftOperation({ type: REPLAY_OPERATION_TYPES.ACTIVATE_KISHINKA })) {
            return;
          }
          this.#rerenderDraftMode();
          this.#emitPreviewRequest();
          return;
        }
        this.#onOperationAdd?.(this.#turnIndex, { type: REPLAY_OPERATION_TYPES.ACTIVATE_KISHINKA });
      });
      const makaiBtn = this.#root.querySelector('[data-role="makai-kihei-btn"]');
      makaiBtn?.addEventListener('click', () => {
        if (this.#isEditMode()) {
          if (!this.#addDraftOperation({ type: REPLAY_OPERATION_TYPES.ACTIVATE_MAKAI_KIHEI })) {
            return;
          }
          this.#rerenderDraftMode();
          this.#emitPreviewRequest();
          return;
        }
        this.#onOperationAdd?.(this.#turnIndex, { type: REPLAY_OPERATION_TYPES.ACTIVATE_MAKAI_KIHEI });
      });
      const allOutBtn = this.#root.querySelector('[data-role="all-out-attack-btn"]');
      allOutBtn?.addEventListener('click', () => {
        if (this.#isEditMode()) {
          if (!this.#addDraftOperation({ type: REPLAY_OPERATION_TYPES.ACTIVATE_ALL_OUT_ATTACK })) {
            return;
          }
          this.#rerenderDraftMode();
          this.#emitPreviewRequest();
          return;
        }
        this.#onOperationAdd?.(this.#turnIndex, { type: REPLAY_OPERATION_TYPES.ACTIVATE_ALL_OUT_ATTACK });
      });
    }

    if (this.#isDraftMode()) {
      this.#root.querySelectorAll('[data-role="form-change-btn"]').forEach((button) => {
        button.addEventListener('click', (event) => {
          event.preventDefault();
          event.stopPropagation();
          const partyIndex = Number(button.dataset.partyIndex);
          const formKey = String(button.dataset.formKey ?? '').trim();
          const member = this.#getPartyMemberByPartyIndex(partyIndex);
          if (!member || !formKey) {
            return;
          }
          const changed = this.#requestFormChange(member, formKey);
          if (this.#isEditMode()) {
            if (!changed) {
              return;
            }
            this.#rerenderDraftMode();
            this.#emitPreviewRequest();
          }
        });
      });
    }

    if (this.#isDraftMode()) {
      this.#root.querySelectorAll('[data-turn-slot-icon]').forEach((icon) => {
        icon.style.cursor = 'pointer';
        icon.addEventListener('click', (e) => {
          // スキル select の誤検知を防ぐ（click が icon 内から来た場合のみ）
          e.stopPropagation();
          const slotEl = icon.closest('[data-turn-slot]');
          if (!slotEl) return;
          const position = Number(slotEl.dataset.position);
          this.#handleIconTap(position);
        });
      });
    }

    if (this.#isDraftMode()) {
      this.#bindDragAndDrop();
    }

    // select 幅監視（バッジ・SPコスト表示切り替え）
    this.#bindResizeObserver();

    // ポップオーバーのビューポート外はみ出し補正
    this.#adjustPopoverPositions();

    // キャラクター詳細ポップアップ（右クリック / 長押し）
    this.#root.querySelectorAll('[data-turn-slot-icon]').forEach((icon) => {
      icon.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const slotEl = icon.closest('[data-turn-slot]');
        if (!slotEl) return;
        const position = Number(slotEl.dataset.position);
        const member = this.#stateBefore?.party?.find((m) => m.position === position) ?? null;
        if (!member) return;
        const snapEntry = this.#isCommittedDisplayMode() && this.#record
          ? (this.#record.snapBefore?.find((s) => s.partyIndex === member.partyIndex) ?? null)
          : null;
        openCharDetailPopup(
          member,
          {
            statusEffects: snapEntry?.statusEffects ?? member.statusEffects ?? [],
            isReinforcedMode: snapEntry?.isReinforcedMode ?? member.isReinforcedMode ?? false,
            reinforcedTurnsRemaining: snapEntry?.reinforcedTurnsRemaining ?? member.reinforcedTurnsRemaining ?? 0,
            actionDisabledTurns: snapEntry?.actionDisabledTurns ?? member.actionDisabledTurns ?? 0,
            previewActionFlow: this.#buildCharacterPreviewActionFlow(member, this.#isCommittedDisplayMode()),
            passiveEvents:
              this.#record?.passiveEvents ??
              this.#stateBefore?.turnState?.passiveEventsLastApplied ??
              [],
            zoneState: this.#stateBefore?.turnState?.zoneState ?? null,
            territoryState: this.#stateBefore?.turnState?.territoryState ?? null,
            talismanState: this.#stateBefore?.turnState?.enemyState?.talismanState ?? null,
            disasterState: this.#stateBefore?.turnState?.enemyState?.disasterState ?? null,
          },
          {
            x: e.clientX,
            y: e.clientY,
            isCommitted: this.#isCommittedDisplayMode(),
            resolveSkillDescription:
              typeof this.#store?.resolveSkillDescription === 'function'
                ? (skillId) => this.#store.resolveSkillDescription(skillId)
                : null,
            enemyDestructionState: {
              destructionRateByEnemy: this.#stateAfter?.turnState?.enemyState?.destructionRateByEnemy ?? {},
              destructionRateCapByEnemy: this.#stateAfter?.turnState?.enemyState?.destructionRateCapByEnemy ?? {},
            },
          }
        );
      });
    });
  }

  /**
   * 表示中の .target-popover がビューポート外にはみ出す場合、
   * translate と maxHeight で画面内に収める。
   */
  #adjustPopoverPositions() {
    const viewportPadding = TARGET_POPOVER_VIEWPORT_PADDING_PX;
    const viewportWidth = Number(window?.innerWidth ?? 0);
    const viewportHeight = Number(window?.innerHeight ?? 0);
    this.#root.querySelectorAll('.target-popover').forEach((popover) => {
      if (popover.hasAttribute('hidden')) return;
      popover.style.position = '';
      popover.style.top = '';
      popover.style.bottom = '';
      popover.style.left = '';
      popover.style.right = '';
      popover.style.width = '';
      popover.style.transform = '';
      popover.style.maxHeight = '';
      popover.style.overflowY = '';
      popover.style.zIndex = '';

      if (String(popover.dataset.popoverKind ?? '') === 'enemy-summon') {
        const host = popover.closest('.relative');
        const popupSummonAction = this.#enemyDetailPopup?.getRootElement?.()
          ?.querySelector?.(
            '[data-role="enemy-popup-column"][data-selected="true"] [data-role="enemy-popup-action"][data-action-type="summon"]'
          ) ?? null;
        const toggle = popupSummonAction ?? host?.querySelector?.('[data-role="enemy-detail-trigger"]') ?? null;
        if (toggle) {
          const toggleRect = toggle.getBoundingClientRect();
          const resolvedWidth = viewportWidth > 0
            ? Math.max(260, Math.min(360, viewportWidth - viewportPadding * 2))
            : 360;
          const left = viewportWidth > 0
            ? Math.max(
                viewportPadding,
                Math.min(toggleRect.left, viewportWidth - viewportPadding - resolvedWidth)
              )
            : Math.max(0, toggleRect.left);

          popover.style.position = 'fixed';
          popover.style.zIndex = String(ENEMY_SUMMON_EDITOR_Z_INDEX);
          popover.style.width = `${resolvedWidth}px`;
          popover.style.left = `${left}px`;
          popover.style.top = `${Math.max(viewportPadding, toggleRect.bottom + 4)}px`;

          let fixedRect = popover.getBoundingClientRect();
          if (viewportHeight > 0) {
            const spaceBelow = viewportHeight - viewportPadding - (toggleRect.bottom + 4);
            const spaceAbove = toggleRect.top - viewportPadding - 4;
            const shouldOpenAbove = fixedRect.bottom > viewportHeight - viewportPadding && spaceAbove > spaceBelow;
            if (shouldOpenAbove) {
              popover.style.top = `${Math.max(viewportPadding, toggleRect.top - 4 - fixedRect.height)}px`;
              fixedRect = popover.getBoundingClientRect();
            }

            const availableHeight = shouldOpenAbove
              ? Math.max(120, Math.floor(spaceAbove))
              : Math.max(120, Math.floor(spaceBelow));
            if (fixedRect.height > availableHeight) {
              popover.style.maxHeight = `${availableHeight}px`;
              popover.style.overflowY = 'auto';
            }
          }
          return;
        }
      }

      if (popover.matches('[data-role="target-popover"][data-target-kind]')) {
        const host = popover.closest('.relative');
        const toggle = host?.querySelector?.('[data-role="target-trigger"]') ?? null;
        const targetKind = String(popover.dataset.targetKind ?? '');
        if (toggle) {
          const toggleRect = toggle.getBoundingClientRect();
          const resolvedWidth = viewportWidth > 0
            ? targetKind === 'ally'
              ? Math.max(
                  ALLY_TARGET_POPOVER_MIN_WIDTH_PX,
                  Math.min(ALLY_TARGET_POPOVER_MAX_WIDTH_PX, viewportWidth - viewportPadding * 2)
                )
              : Math.max(
                  ENEMY_TARGET_POPOVER_MIN_WIDTH_PX,
                  Math.min(ENEMY_TARGET_POPOVER_MAX_WIDTH_PX, viewportWidth - viewportPadding * 2)
                )
            : targetKind === 'ally'
              ? ALLY_TARGET_POPOVER_MAX_WIDTH_PX
              : ENEMY_TARGET_POPOVER_MAX_WIDTH_PX;
          const left = viewportWidth > 0
            ? Math.max(
                viewportPadding,
                Math.min(toggleRect.left, viewportWidth - viewportPadding - resolvedWidth)
              )
            : Math.max(0, toggleRect.left);

          popover.style.position = 'fixed';
          popover.style.zIndex = String(TARGET_POPOVER_Z_INDEX);
          popover.style.width = `${resolvedWidth}px`;
          popover.style.left = `${left}px`;
          popover.style.top = `${Math.max(viewportPadding, toggleRect.bottom + 4)}px`;

          let fixedRect = popover.getBoundingClientRect();
          if (viewportHeight > 0) {
            const spaceBelow = viewportHeight - viewportPadding - (toggleRect.bottom + 4);
            const spaceAbove = toggleRect.top - viewportPadding - 4;
            const shouldOpenAbove = fixedRect.bottom > viewportHeight - viewportPadding && spaceAbove > spaceBelow;
            if (shouldOpenAbove) {
              popover.style.top = `${Math.max(viewportPadding, toggleRect.top - 4 - fixedRect.height)}px`;
              fixedRect = popover.getBoundingClientRect();
            }

            const availableHeight = shouldOpenAbove
              ? Math.max(TARGET_POPOVER_MIN_VIEWPORT_HEIGHT_PX, Math.floor(spaceAbove))
              : Math.max(TARGET_POPOVER_MIN_VIEWPORT_HEIGHT_PX, Math.floor(spaceBelow));
            if (fixedRect.height > availableHeight) {
              popover.style.maxHeight = `${availableHeight}px`;
              popover.style.overflowY = 'auto';
            }
          }
          return;
        }
      }

      if (String(popover.dataset.popoverKind ?? '') === 'manual-break') {
        const host = popover.closest('.relative');
        const toggle = host?.querySelector?.('[data-role="enemy-detail-trigger"]') ?? null;
        if (toggle) {
          const toggleRect = toggle.getBoundingClientRect();
          const resolvedWidth = viewportWidth > 0
            ? Math.max(280, Math.min(560, viewportWidth - viewportPadding * 2))
            : 560;
          const left = viewportWidth > 0
            ? Math.max(
                viewportPadding,
                Math.min(toggleRect.left, viewportWidth - viewportPadding - resolvedWidth)
              )
            : Math.max(0, toggleRect.left);

          popover.style.position = 'fixed';
          popover.style.width = `${resolvedWidth}px`;
          popover.style.left = `${left}px`;
          popover.style.top = `${Math.max(viewportPadding, toggleRect.bottom + 4)}px`;

          let fixedRect = popover.getBoundingClientRect();
          if (viewportHeight > 0) {
            const spaceBelow = viewportHeight - viewportPadding - (toggleRect.bottom + 4);
            const spaceAbove = toggleRect.top - viewportPadding - 4;
            const shouldOpenAbove = fixedRect.bottom > viewportHeight - viewportPadding && spaceAbove > spaceBelow;
            if (shouldOpenAbove) {
              popover.style.top = `${Math.max(viewportPadding, toggleRect.top - 4 - fixedRect.height)}px`;
              fixedRect = popover.getBoundingClientRect();
            }

            const availableHeight = shouldOpenAbove
              ? Math.max(120, Math.floor(spaceAbove))
              : Math.max(120, Math.floor(spaceBelow));
            if (fixedRect.height > availableHeight) {
              popover.style.maxHeight = `${availableHeight}px`;
              popover.style.overflowY = 'auto';
            }
          }
          return;
        }
      }

      if (String(popover.dataset.popoverKind ?? '') === 'kill') {
        const host = popover.closest('.relative');
        const toggle = host?.querySelector?.('[data-role="enemy-detail-trigger"]') ?? null;
        if (toggle) {
          const toggleRect = toggle.getBoundingClientRect();
          const resolvedWidth = viewportWidth > 0
            ? Math.max(280, Math.min(560, viewportWidth - viewportPadding * 2))
            : 560;
          const left = viewportWidth > 0
            ? Math.max(
                viewportPadding,
                Math.min(toggleRect.left, viewportWidth - viewportPadding - resolvedWidth)
              )
            : Math.max(0, toggleRect.left);

          popover.style.position = 'fixed';
          popover.style.width = `${resolvedWidth}px`;
          popover.style.left = `${left}px`;
          popover.style.top = `${Math.max(viewportPadding, toggleRect.bottom + 4)}px`;

          let fixedRect = popover.getBoundingClientRect();
          if (viewportHeight > 0) {
            const spaceBelow = viewportHeight - viewportPadding - (toggleRect.bottom + 4);
            const spaceAbove = toggleRect.top - viewportPadding - 4;
            const shouldOpenAbove = fixedRect.bottom > viewportHeight - viewportPadding && spaceAbove > spaceBelow;
            if (shouldOpenAbove) {
              popover.style.top = `${Math.max(viewportPadding, toggleRect.top - 4 - fixedRect.height)}px`;
              fixedRect = popover.getBoundingClientRect();
            }

            const availableHeight = shouldOpenAbove
              ? Math.max(120, Math.floor(spaceAbove))
              : Math.max(120, Math.floor(spaceBelow));
            if (fixedRect.height > availableHeight) {
              popover.style.maxHeight = `${availableHeight}px`;
              popover.style.overflowY = 'auto';
            }
          }
          return;
        }
      }

      if (String(popover.dataset.popoverKind ?? '') === 'follow-up') {
        const host = popover.closest('.relative');
        const toggle = host?.querySelector?.('[data-role="follow-up-toggle"]') ?? null;
        if (toggle) {
          const toggleRect = toggle.getBoundingClientRect();
          const resolvedWidth = viewportWidth > 0
            ? Math.max(280, Math.min(720, viewportWidth - viewportPadding * 2))
            : 720;
          const left = viewportWidth > 0
            ? Math.max(
                viewportPadding,
                Math.min(toggleRect.left, viewportWidth - viewportPadding - resolvedWidth)
              )
            : Math.max(0, toggleRect.left);

          popover.style.position = 'fixed';
          popover.style.width = `${resolvedWidth}px`;
          popover.style.left = `${left}px`;
          popover.style.top = `${Math.max(viewportPadding, toggleRect.bottom + 4)}px`;

          let fixedRect = popover.getBoundingClientRect();
          if (viewportHeight > 0) {
            const spaceBelow = viewportHeight - viewportPadding - (toggleRect.bottom + 4);
            const spaceAbove = toggleRect.top - viewportPadding - 4;
            const shouldOpenAbove = fixedRect.bottom > viewportHeight - viewportPadding && spaceAbove > spaceBelow;
            if (shouldOpenAbove) {
              popover.style.top = `${Math.max(viewportPadding, toggleRect.top - 4 - fixedRect.height)}px`;
              fixedRect = popover.getBoundingClientRect();
            }

            const availableHeight = shouldOpenAbove
              ? Math.max(120, Math.floor(spaceAbove))
              : Math.max(120, Math.floor(spaceBelow));
            if (fixedRect.height > availableHeight) {
              popover.style.maxHeight = `${availableHeight}px`;
              popover.style.overflowY = 'auto';
            }
          }
          return;
        }
      }

      let rect = popover.getBoundingClientRect();

      if (viewportHeight > 0) {
        const availableBelow = viewportHeight - viewportPadding - rect.top;
        const availableAbove = rect.bottom - viewportPadding;
        if (rect.bottom > viewportHeight - viewportPadding && availableAbove > availableBelow) {
          // 下側に収まりきらない場合は、トリガーの上側に展開する。
          popover.style.top = 'auto';
          popover.style.bottom = 'calc(100% + 4px)';
          rect = popover.getBoundingClientRect();
        }

        const availableHeight = Math.max(
          120,
          Math.floor(
            Math.min(
              viewportHeight - viewportPadding - rect.top,
              rect.bottom - viewportPadding
            )
          )
        );
        if (rect.height > availableHeight) {
          popover.style.maxHeight = `${availableHeight}px`;
          popover.style.overflowY = 'auto';
          rect = popover.getBoundingClientRect();
        }
      }

      let offsetX = 0;
      let offsetY = 0;

      if (viewportWidth > 0) {
        const maxRight = viewportWidth - viewportPadding;
        if (rect.right > maxRight) {
          offsetX -= rect.right - maxRight;
        }
        if (rect.left + offsetX < viewportPadding) {
          offsetX += viewportPadding - (rect.left + offsetX);
        }
      }

      if (viewportHeight > 0) {
        const maxBottom = viewportHeight - viewportPadding;
        if (rect.bottom > maxBottom) {
          offsetY -= rect.bottom - maxBottom;
        }
        if (rect.top + offsetY < viewportPadding) {
          offsetY += viewportPadding - (rect.top + offsetY);
        }
      }

      if (offsetX !== 0 || offsetY !== 0) {
        popover.style.transform = `translate(${offsetX}px, ${offsetY}px)`;
      }
    });
  }

  /**
   * アイコンタップ時の swap 処理。
   * 1回目: 選択状態にしてアンバーリングを表示。
   * 2回目（同じ）: 選択解除。
   * 2回目（別スロット）: 2スロットを入れ替え。
   * @param {number} position
   */
  #handleIconTap(position) {
    if (this.#selectedSlotPosition === null) {
      this.#selectedSlotPosition = position;
      this.#updateSelectionVisual();
    } else if (this.#selectedSlotPosition === position) {
      this.#selectedSlotPosition = null;
      this.#updateSelectionVisual();
    } else {
      const srcPos = this.#selectedSlotPosition;
      // EX ターン制約チェック（D&D と同じルール）
      if (!this.#isSwapAllowed(srcPos, position)) {
        this.#selectedSlotPosition = null;
        this.#updateSelectionVisual();
        return;
      }
      this.#selectedSlotPosition = null;  // swap 前にリセット
      this.#onSlotChange?.(this.#turnIndex, srcPos, { swapWith: position });
    }
  }

  /** 選択中スロットのアイコンにアンバーリングを付ける（DOM 直接操作）。 */
  #updateSelectionVisual() {
    this.#root.querySelectorAll('[data-turn-slot]').forEach((slotEl) => {
      const pos = Number(slotEl.dataset.position);
      const iconEl = slotEl.querySelector('[data-turn-slot-icon]');
      if (!iconEl) return;
      if (pos === this.#selectedSlotPosition) {
        iconEl.classList.add('ring-2', 'ring-amber-400', 'bg-amber-50');
      } else {
        iconEl.classList.remove('ring-2', 'ring-amber-400', 'bg-amber-50');
      }
    });
  }

  #updateSkillBadges(position, skillId) {
    const badgeEl = this.#root.querySelector(`[data-skill-badges][data-position="${position}"]`);
    if (!badgeEl) return;
    const member = this.#stateBefore?.party?.find((m) => m.position === position);
    const skill = skillId != null ? (member?.getSkill?.(skillId) ?? null) : null;
    badgeEl.innerHTML = this.#buildSkillBadgesHtml(skill, member, this.#stateBefore);
  }

  #resolveResponsiveVisibility({
    width,
    previousState = null,
    baseMinWidth,
    showMinWidth,
    hideMinWidth,
  }) {
    if (previousState === true) {
      return width >= hideMinWidth;
    }
    if (previousState === false) {
      return width >= showMinWidth;
    }
    return width >= baseMinWidth;
  }

  #measureBadgeReservedWidth(badgeEl) {
    if (!badgeEl) {
      return 0;
    }
    const iconCount = badgeEl.querySelectorAll('.turn-skill-badge-icon').length;
    if (iconCount <= 0) {
      delete badgeEl.dataset.responsiveReservedWidth;
      delete badgeEl.dataset.responsiveIconCount;
      return 0;
    }

    const measuredWidth = Math.ceil(
      Number(badgeEl.getBoundingClientRect?.().width ?? 0) || Number(badgeEl.scrollWidth ?? 0)
    );
    if (measuredWidth > 0) {
      badgeEl.dataset.responsiveReservedWidth = String(measuredWidth);
      badgeEl.dataset.responsiveIconCount = String(iconCount);
      return measuredWidth;
    }

    const cachedWidth = Number(badgeEl.dataset.responsiveReservedWidth ?? 0);
    const cachedIconCount = Number(badgeEl.dataset.responsiveIconCount ?? 0);
    if (cachedWidth > 0 && cachedIconCount === iconCount) {
      return cachedWidth;
    }

    const computedStyle =
      typeof window !== 'undefined' && typeof window.getComputedStyle === 'function'
        ? window.getComputedStyle(badgeEl)
        : null;
    const iconSize = Number.parseFloat(
      computedStyle?.getPropertyValue('--turn-skill-badge-icon-size') ?? ''
    );
    const columnGap = Number.parseFloat(computedStyle?.columnGap ?? computedStyle?.gap ?? '');
    const visibleColumns = Math.min(iconCount, 2);
    const estimatedWidth = Math.ceil(
      Math.max(
        0,
        visibleColumns *
          (Number.isFinite(iconSize) ? iconSize : RESPONSIVE_BADGE_ICON_SIZE_FALLBACK_PX)
      ) +
        Math.max(0, visibleColumns - 1) *
          (Number.isFinite(columnGap) ? columnGap : RESPONSIVE_BADGE_COLUMN_GAP_FALLBACK_PX)
    );
    if (estimatedWidth > 0) {
      badgeEl.dataset.responsiveReservedWidth = String(estimatedWidth);
      badgeEl.dataset.responsiveIconCount = String(iconCount);
    }
    return estimatedWidth;
  }

  /**
   * 親行の幅に応じてバッジ表示・SPコスト表示を切り替える。
   * ResizeObserver コールバックおよび refreshSkillSelects() から呼ばれる。
   */
  #applyWidthBasedVisibility(selectEl) {
    const position = Number(selectEl.dataset.position);
    const selectRow = selectEl.closest('[data-role="slot-select-row"]');

    // バッジ表示制御
    const badgeEl = this.#root.querySelector(`[data-skill-badges][data-position="${position}"]`);
    const rowWidth = Math.ceil(
      Number(selectRow?.getBoundingClientRect?.().width ?? 0) ||
      Number(selectRow?.offsetWidth ?? 0) ||
      Number(selectEl.offsetWidth ?? 0)
    );
    const badgeReservedWidth = this.#measureBadgeReservedWidth(badgeEl);
    const predictedSelectWidthWithBadge = Math.max(0, rowWidth - badgeReservedWidth);
    let nextBadgeVisible = false;
    if (badgeEl) {
      const previousBadgeVisible =
        badgeEl.dataset.responsiveVisible === 'true'
          ? true
          : badgeEl.dataset.responsiveVisible === 'false'
            ? false
            : null;
      nextBadgeVisible = this.#resolveResponsiveVisibility({
        width: predictedSelectWidthWithBadge,
        previousState: previousBadgeVisible,
        baseMinWidth: BADGE_MIN_SELECT_WIDTH,
        showMinWidth: BADGE_SHOW_MIN_SELECT_WIDTH,
        hideMinWidth: BADGE_HIDE_MIN_SELECT_WIDTH,
      });
      badgeEl.style.display = nextBadgeVisible ? '' : 'none';
      badgeEl.dataset.responsiveVisible = String(nextBadgeVisible);
    }

    // SPコスト表示制御（option.textContent を直接更新、value は維持）
    const predictedSelectWidth = nextBadgeVisible
      ? predictedSelectWidthWithBadge
      : rowWidth;
    const previousShowCost =
      selectEl.dataset.showCost === 'true'
        ? true
        : selectEl.dataset.showCost === 'false'
          ? false
          : null;
    const showCost = this.#resolveResponsiveVisibility({
      width: predictedSelectWidth,
      previousState: previousShowCost,
      baseMinWidth: COST_MIN_SELECT_WIDTH,
      showMinWidth: COST_SHOW_MIN_SELECT_WIDTH,
      hideMinWidth: COST_HIDE_MIN_SELECT_WIDTH,
    });
    selectEl.dataset.showCost = String(showCost);
    Array.from(selectEl.options).forEach((opt) => {
      const cost = opt.dataset.costLabel ?? '';
      const elementPrefix = opt.dataset.elementPrefix ?? '';
      const name = opt.dataset.skillName ?? '';
      if (cost || name) {
        opt.textContent = showCost ? `${cost}${elementPrefix}${name}` : `${elementPrefix}${name}`;
      }
    });
  }

  /**
   * 前衛スロットの select 幅を監視し、幅変化時にバッジ・SPコストを更新する。
   */
  #bindResizeObserver() {
    const selects = this.#root.querySelectorAll('[data-skill-select]');
    if (!selects.length) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        this.#applyWidthBasedVisibility(entry.target);
      }
    });
    selects.forEach((sel) => {
      observer.observe(sel);
      // ResizeObserver は初回コールバックが非同期のため即時も適用
      this.#applyWidthBasedVisibility(sel);
    });
  }

  #bindDragAndDrop() {
    this.#root.querySelectorAll('[data-role="turn-slot-drag-handle"]').forEach((handle) => {
      const slot = handle.closest('[data-turn-slot]');
      if (!slot) {
        return;
      }

      handle.addEventListener('dragstart', (event) => {
        this.#dragSrcPosition = Number(slot.dataset.position);
        if (event.dataTransfer) {
          event.dataTransfer.effectAllowed = 'move';
          event.dataTransfer.setData('text/plain', '');
        }
        slot.classList.add('opacity-40');
      });

      handle.addEventListener('dragend', () => {
        slot.classList.remove('opacity-40');
        this.#dragSrcPosition = null;
        this.#clearDragHighlights();
      });
    });

    if (this.#isDragDelegationBound) {
      return;
    }
    this.#isDragDelegationBound = true;

    this.#root.addEventListener('dragover', (event) => {
      if (this.#dragSrcPosition === null) {
        return;
      }
      event.preventDefault();
      if (event.dataTransfer) {
        event.dataTransfer.dropEffect = 'move';
      }
      const slot = this.#resolveDragSlot(event.target);
      if (!slot) {
        this.#clearDragHighlights();
        return;
      }
      const dst = Number(slot.dataset.position);
      if (!this.#isSwapAllowed(this.#dragSrcPosition, dst)) {
        this.#clearDragHighlights();
        return;
      }
      this.#clearDragHighlights();
      if (dst !== this.#dragSrcPosition) {
        slot.classList.add('ring-2', 'ring-blue-400');
      }
    });

    this.#root.addEventListener('drop', (event) => {
      if (this.#dragSrcPosition === null) {
        return;
      }
      const slot = this.#resolveDragSlot(event.target);
      event.preventDefault();
      this.#clearDragHighlights();
      const src = this.#dragSrcPosition;
      this.#dragSrcPosition = null;
      if (!slot) {
        return;
      }
      const dst = Number(slot.dataset.position);
      if (src !== dst && this.#isSwapAllowed(src, dst)) {
        this.#onSlotChange?.(this.#turnIndex, src, { swapWith: dst });
      }
    });
  }

  #clearDragHighlights() {
    this.#root
      .querySelectorAll('[data-turn-slot]')
      .forEach((slot) => slot.classList.remove('ring-2', 'ring-blue-400'));
  }

  #resolveDragSlot(target) {
    if (!target || typeof target.closest !== 'function') {
      return null;
    }
    const slot = target.closest('[data-turn-slot]');
    return this.#root.contains(slot) ? slot : null;
  }
}
