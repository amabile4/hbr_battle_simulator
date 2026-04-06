import { resolveStyleImageUrl, resolveUiAssetUrl } from '../../src/ui/style-asset-url.js';
import { clampEnemyCount, DEFAULT_ENEMY_COUNT } from '../../src/config/battle-defaults.js';
import { formatSkillCostLabel, getElementHintForDuplicateNamedSkill } from '../utils/skill-label.js';
import { resolveEffectiveSkillForAction } from '../../src/turn/turn-controller.js';
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
  getActionOutcomeOverridesFromOverrideEntries,
  getBreakEnemyIndexesForPosition,
  getKillEnemyIndexesForPosition,
  normalizeActionOutcomeOverrides,
  setBreakEnemyIndexesForPosition,
  setKillEnemyIndexesForPosition,
} from '../utils/action-outcome-overrides.js';
import {
  buildManualBreakChipModels,
  buildManualKillChipModels,
  resolveManualBreakActorLabel,
} from '../utils/manual-break-presentation.js';
import { buildFollowUpChipModels } from '../utils/follow-up-presentation.js';
import {
  getFollowUpOverridesFromOverrideEntries,
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
const ENEMY_DETAIL_LONG_PRESS_MS = 520;

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
  #isFollowUpEditorOpen = false;
  #isEnemyDetailEditorOpen = false;
  #draftBreakEnemyIndexesByPartyIndex = {};
  #draftKillEnemyIndexesByPartyIndex = {};
  #draftFollowUpEnemyIndexByPartyIndex = {};
  #previewResourceState = null;
  #previewActionFlow = [];
  // Simulator Settings パラメータ
  #simulatorSettings = null;

  constructor({
    root,
    store,
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
    this.#draftFollowUpEnemyIndexByPartyIndex = {};
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
      this.#isFollowUpEditorOpen = false;
      this.#isEnemyDetailEditorOpen = false;
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
    this.#isFollowUpEditorOpen = this.#isFollowUpEditorOpen && this.#isDraftMode();
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
      this.#draftEnemyCount = clampEnemyCount(this.#draftEnemyCount ?? this.#resolveDraftEnemyCount());
      this.#syncDraftSelections();
    }
    this.#root.innerHTML = this.#buildHtml();
    this.#bindEvents();
    // 再描画後に選択ビジュアルを復元
    if (this.#selectedSlotPosition !== null) this.#updateSelectionVisual();
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

  #getBreakSelectionContext({ member, isCommitted, enemyCount }) {
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
      breakEnabled: rawBreakEnemyIndexes.length > 0,
      isEnemyTargetSelectionManual: isEnemyTargetSelectionManual(this.#simulatorSettings),
    };
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
        enemyIndexes = selectionContext.rawBreakEnemyIndexes;
      } else if (
        selectionContext.breakAttributionMode === TURN_BREAK_ATTRIBUTION_MODES.SINGLE &&
        selectionContext.breakEnabled &&
        selectionContext.currentReplayTarget.type === 'enemy'
      ) {
        enemyIndexes = [Number(selectionContext.currentReplayTarget.enemyIndex)];
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
      const killEnemyIndexes = (this.#draftKillEnemyIndexesByPartyIndex[member.partyIndex] ?? []).filter(
        (idx) => idx < enemyCount
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
    return `
      <div data-role="operation-chip-list" class="flex flex-wrap gap-1 pb-1">
        ${this.#operations.map((operation, index) => `
          <span data-role="operation-chip"
                data-operation-index="${index}"
                class="inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-semibold leading-tight ${getReplayOperationTone(operation)}">
            <span>${getReplayOperationDisplayLabel(operation)}</span>
            ${canRemove
              ? `
                <button type="button"
                        data-role="operation-chip-remove"
                        data-operation-index="${index}"
                        class="inline-flex h-4 w-4 items-center justify-center rounded-full bg-white/80 text-[11px] leading-none hover:bg-white"
                        aria-label="${getReplayOperationDisplayLabel(operation)} を削除">×</button>
              `
              : ''}
          </span>
        `).join('')}
      </div>
    `;
  }

  #buildFieldChipsHtml() {
    const entries = buildFieldDisplayEntries({
      zoneState: this.#stateBefore?.turnState?.zoneState ?? null,
      territoryState: this.#stateBefore?.turnState?.territoryState ?? null,
      talismanState: this.#stateBefore?.turnState?.enemyState?.talismanState ?? null,
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
      return { key: 'minus', label: '-' };
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
    return getActionOutcomeOverridesFromOverrideEntries(
      this.#replayTurn?.overrideEntries ?? [],
      enemyCount
    );
  }

  #getReplayTurnFollowUpOverrides(enemyCount = this.#getCurrentReplayTurnEnemyCount()) {
    return getFollowUpOverridesFromOverrideEntries(
      this.#replayTurn?.overrideEntries ?? [],
      enemyCount
    );
  }

  #getEnemyNamesByEnemy() {
    return this.#stateBefore?.turnState?.enemyState?.enemyNamesByEnemy &&
      typeof this.#stateBefore.turnState.enemyState.enemyNamesByEnemy === 'object'
      ? this.#stateBefore.turnState.enemyState.enemyNamesByEnemy
      : {};
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
    const chipModels = buildManualBreakChipModels({
      overrides: this.#getCurrentActionOutcomeOverridesForDisplay(isCommitted),
      members: this.#getMembersInPositionOrder().filter((member) => member.position <= 2),
      store: this.#store,
      enemyNamesByEnemy: this.#getEnemyNamesByEnemy(),
    });
    if (chipModels.length === 0) {
      return '';
    }
    return `
      <div data-role="manual-break-chip-list" class="flex flex-wrap gap-1 pb-1">
        ${chipModels.map((chip) => `
          <span data-role="manual-break-chip"
                title="${chip.label}"
                class="inline-flex max-w-full items-center rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-semibold leading-tight text-amber-700">
            <span class="max-w-full break-all">${chip.label}</span>
          </span>
        `).join('')}
      </div>
    `;
  }

  #buildKillChipsHtml(isCommitted) {
    const currentOverrides = isCommitted
      ? getActionOutcomeOverridesFromOverrideEntries(
          this.#replayTurn?.overrideEntries ?? [],
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

  getCurrentFollowUpOverrides() {
    const enemyCount = this.getCurrentEnemyCount();
    const members = this.#getMembersInPositionOrder().filter((member) => member.position >= 3);
    const overrides = [];
    for (const member of members) {
      const enemyIndex = Number(this.#draftFollowUpEnemyIndexByPartyIndex?.[member.partyIndex]);
      if (!Number.isInteger(enemyIndex) || enemyIndex < 0 || enemyIndex >= enemyCount) {
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
      const pursuitSkill = (member.getActionSkills?.() ?? []).find((skill) => isPursuitOnlySkill(skill));
      if (pursuitSkill) {
        result[member.position] = String(pursuitSkill.name ?? '追撃');
      }
    }
    return result;
  }

  #buildFollowUpChipsHtml(isCommitted) {
    const chipModels = buildFollowUpChipModels({
      overrides: this.#getCurrentFollowUpOverridesForDisplay(isCommitted),
      members: this.#getMembersInPositionOrder().filter((member) => member.position >= 3),
      store: this.#store,
      enemyNamesByEnemy: this.#getEnemyNamesByEnemy(),
      resolvedSkillNameByPosition: this.#resolveFollowUpSkillNameByPosition(),
    });
    if (chipModels.length === 0) {
      return '';
    }
    return `
      <div data-role="follow-up-chip-list" class="flex flex-wrap gap-1 pb-1">
        ${chipModels.map((chip) => `
          <span data-role="follow-up-chip"
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
                        class="target-chip inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold transition-colors
                               ${selected
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

  #buildEnemyDetailPopupPayload(isCommitted = false, activeEnemyIndex = 0) {
    const sourceState = this.#stateBefore ?? this.#stateAfter;
    const enemyState = sourceState?.turnState?.enemyState ?? {};
    const enemyNamesByEnemy = this.#getEnemyNamesByEnemy();
    const enemyCount = isCommitted
      ? this.#getCurrentReplayTurnEnemyCount()
      : this.getCurrentEnemyCount();
    const enemies = Array.from({ length: enemyCount }, (_, enemyIndex) => {
      const enemyName = String(
        enemyNamesByEnemy[String(enemyIndex)] ?? enemyNamesByEnemy[enemyIndex] ?? ''
      ).trim();
      const displayName = enemyName ? `E${enemyIndex + 1} ${enemyName}` : `E${enemyIndex + 1}`;
      const statuses = (Array.isArray(enemyState.statuses) ? enemyState.statuses : [])
        .filter((status) => Number(status?.targetIndex ?? -1) === enemyIndex)
        .map((status) => ({
          ...status,
          remaining: Number(status?.remaining ?? status?.remainingTurns ?? 0),
        }));
      const enemyKey = String(enemyIndex);
      const od_rate = enemyState.odRateByEnemy?.[enemyKey] ?? null;
      const max_d_rate = enemyState.destructionRateCapByEnemy?.[enemyKey] ?? null;
      return {
        name: displayName,
        statuses,
        ...(od_rate !== null ? { od_rate } : {}),
        ...(max_d_rate !== null ? { max_d_rate } : {}),
      };
    });

    const normalizedActiveIndex = Number.isInteger(Number(activeEnemyIndex))
      ? Math.min(Math.max(Number(activeEnemyIndex), 0), Math.max(0, enemies.length - 1))
      : 0;
    const actionFlow = isCommitted
      ? this.#buildCommittedActionFlow()
      : (Array.isArray(this.#previewActionFlow) ? structuredClone(this.#previewActionFlow) : []);
    return {
      enemies,
      activeEnemyIndex: normalizedActiveIndex,
      previewActionFlow: actionFlow,
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
    const currentActionOutcomeOverrides = isCommitted
      ? getActionOutcomeOverridesFromOverrideEntries(
          this.#replayTurn?.overrideEntries ?? [],
          enemyCount
        )
      : this.getCurrentActionOutcomeOverrides();
    const members = this.#getMembersInPositionOrder().filter((member) => member.position <= 2);
    return `
      <div data-role="manual-break-editor"
           data-popover-kind="manual-break"
          class="target-popover absolute right-0 top-[calc(100%+4px)] z-30 w-[min(720px,calc(100vw-16px))] rounded-xl border border-gray-200 bg-white p-2.5 shadow-xl overflow-x-hidden"
           ${this.#isBreakEditorOpen ? '' : 'hidden'}>
        <div class="text-[11px] font-semibold text-gray-700 pb-2">討伐・ブレイクを編集</div>
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
                        class="target-chip inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold transition-colors
                               ${isKilled
                                 ? 'border-green-500 bg-green-500 text-white'
                                 : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-100'}">
                  ${label}
                </button>
              `;
            }).join('');
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
      selectionContext.breakEnabled &&
      selectionContext.currentReplayTarget.type === 'enemy'
    ) {
      return [Number(selectionContext.currentReplayTarget.enemyIndex)];
    }
    if (selectionContext.breakAttributionMode === TURN_BREAK_ATTRIBUTION_MODES.ALL) {
      return selectionContext.rawBreakEnemyIndexes;
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
              const isSelected = selectionContext.rawBreakEnemyIndexes.includes(enemyIndex);
              const enemyName = String(
                enemyNamesByEnemy[String(enemyIndex)] ?? enemyNamesByEnemy[enemyIndex] ?? ''
              ).trim();
              const label = enemyName ? `E${enemyIndex + 1} ${enemyName}` : `E${enemyIndex + 1}`;
              return `
                <button type="button"
                        data-role="manual-break-candidate"
                        data-party-index="${selectionContext.member.partyIndex}"
                        data-enemy-index="${enemyIndex}"
                        class="target-chip inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-colors
                               ${isSelected
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
                  return `
                    <button type="button"
                            data-role="manual-break-target-candidate"
                            data-party-index="${selectionContext.member.partyIndex}"
                            data-enemy-index="${candidate.enemyIndex}"
                            class="target-chip inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-colors
                                   ${isSelected
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
                class="target-chip inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-colors
                       ${selectionContext.breakEnabled
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
                    class="target-chip inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-colors
                           ${isSelected
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
    const killChipsHtml = this.#buildKillChipsHtml(isCommitted);
    const followUpChipsHtml = this.#buildFollowUpChipsHtml(isCommitted);
    const operationChipsHtml = this.#buildOperationChipsHtml();
    const noteHtml = `
      <div data-turn-note class="flex flex-col self-stretch min-h-0 flex-shrink-0 w-36 gap-1">
        ${fieldChipsHtml}
        ${manualBreakChipsHtml}
        ${killChipsHtml}
        ${followUpChipsHtml}
        ${operationChipsHtml}
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
      const odGaugeBefore = formatOdGauge(turnState?.odGauge);
      const enemyCountControl = `
        <div class="turn-info-enemy-row relative">
          <button type="button"
                  data-role="enemy-detail-trigger"
              title="左クリック/右クリック/長押しで敵状態詳細を表示"
                  class="turn-info-enemy-button">
            <span class="turn-info-enemy-button__label"
                  data-label-full="敵状態確認"
                  data-label-medium="敵状態"
                  data-label-short="敵">敵状態確認</span>
          </button>
        </div>`;

      return `
        <div data-turn-info class="turn-info-panel flex-shrink-0 w-[108px] flex flex-col items-start justify-start
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
            ${enemyCountControl}
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
    const odGaugeBefore = formatOdGauge(odGaugeAtStart);
    const odGaugeAfter  = formatOdGauge(odGaugeAtEnd);
    const isExtraTurn   = Boolean(rec?.isExtraTurn ?? String(fallbackTurnState?.turnType ?? '') === 'extra');
    const odLevelLabel = resolveOdMarkerLabel(rec?.odTurnLabelAtStart ?? fallbackTurnState?.turnLabel ?? '');
    // OD文脈 = ODレベルラベルあり（コミット済みではodSuspendedをodTurnLabelAtStartで兼用）
    const inOd = !!odLevelLabel;
    const inEx = isExtraTurn;
    const enemyCountControl = `
      <div class="turn-info-enemy-row relative">
        <button type="button"
                data-role="enemy-detail-trigger"
          title="左クリック/右クリック/長押しで敵状態詳細を表示"
                class="turn-info-enemy-button">
          <span class="turn-info-enemy-button__label"
                data-label-full="敵状態確認"
                data-label-medium="敵状態"
                data-label-short="敵">敵状態確認</span>
        </button>
      </div>`;

    const allEnemiesDefeated = Boolean(this.#stateAfter?.turnState?.enemyState?.allEnemiesDefeated);
    return `
      <div data-turn-info class="turn-info-panel flex-shrink-0 w-[108px] flex flex-col items-start justify-start
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
          ${enemyCountControl}
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
    const rawStyle = this.#store?.getStyleById?.(member.styleId);
    return rawStyle ? resolveStyleImageUrl(rawStyle) : '';
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
             class="flex justify-end items-start">
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
                ? `<img src="${imageUrl}" alt="${member.styleName ?? ''}" draggable="false"
                        class="w-full h-full object-cover" />`
                : `<div class="w-full h-full flex items-center justify-center text-gray-300">？</div>`
              }
              <div data-sp-badge class="absolute -top-0.5 -right-0.5 font-bold leading-none text-center px-1 py-0.5 min-w-[20px]"
                   style="color:${spColor};text-shadow:-1px -1px 0 #000,1px -1px 0 #000,-1px 1px 0 #000,1px 1px 0 #000,0 0 4px rgba(0,0,0,0.9);">
                ${spDisplay}
              </div>
            </div>
            <!-- バフ/デバフ・状態異常アイコンスペース兼 target trigger 置き場 -->
            <div data-slot-info-space data-position="${member.position}" class="flex-1 min-w-0">
              ${buffListHtml}${targetControlAnchorHtml}
            </div>
          </div>
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
                ? `<img src="${imageUrl}" alt="${member.styleName ?? ''}" draggable="false"
                        class="w-full h-full object-cover opacity-40" />`
                : `<div class="w-full h-full flex items-center justify-center text-gray-200">？</div>`
              }
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
                ? `<img src="${imageUrl}" alt="${member.styleName ?? ''}" draggable="false"
                        class="w-full h-full object-cover opacity-60" />`
                : `<div class="w-full h-full flex items-center justify-center text-gray-200">？</div>`
              }
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
    const manualBreakControlHtml = `
      <div class="col-span-2 relative">
        <button data-role="manual-break-toggle"
                class="w-full text-[10px] py-0.5 rounded border border-amber-300 bg-amber-50 font-semibold text-amber-700 hover:bg-amber-100 transition-colors">
          ブレイク
        </button>
        ${this.#buildManualBreakEditorHtml(isCommitted)}
      </div>
    `;

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
          class="w-full h-full text-[9px] leading-tight rounded px-0.5 py-0.5 border font-semibold
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
        class="w-full h-full text-[9px] leading-tight rounded px-0.5 py-0.5 border font-semibold
               ${makai.available
                 ? 'bg-white text-rose-700 border-rose-400 hover:bg-rose-50'
                 : 'bg-rose-100 text-rose-300 border-rose-200 cursor-not-allowed'}">
        騎兵起動<br>残${makai.remainingUses}
      </button>`;
    }

    return `
      <div data-turn-buttons class="flex-shrink-0 w-[110px] grid grid-cols-2 gap-0.5 px-1 py-1 auto-rows-[minmax(24px,auto)]">
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
        ${manualBreakControlHtml}
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
          this.#openTargetPickerPartyIndex = null;
          this.#isBreakEditorOpen = false;
          this.#isFollowUpEditorOpen = false;
          this.#isEnemyDetailEditorOpen = false;
          this.#rerenderDraftMode();
          this.#emitPreviewRequest();
        });
      });
    }

    this.#root.querySelectorAll('[data-role="target-trigger"]').forEach((btn) => {
      btn.addEventListener('click', (event) => {
        event.stopPropagation();
        const partyIndex = Number(btn.dataset.partyIndex);
        this.#isBreakEditorOpen = false;
        this.#isFollowUpEditorOpen = false;
        this.#isEnemyDetailEditorOpen = false;
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
        this.#isFollowUpEditorOpen = false;
        this.#isEnemyDetailEditorOpen = false;
        this.#draftTargets = {
          ...this.#draftTargets,
          [actorPartyIndex]: target,
        };
        this.#rerenderDraftMode();
        this.#emitPreviewRequest();
      });
    });

    this.#root.querySelectorAll('[data-role="manual-break-toggle"]').forEach((btn) => {
      btn.addEventListener('click', (event) => {
        event.stopPropagation();
        this.#openTargetPickerPartyIndex = null;
        this.#isBreakEditorOpen = !this.#isBreakEditorOpen;
        this.#isFollowUpEditorOpen = false;
        this.#isEnemyDetailEditorOpen = false;
        if (this.#isDraftMode()) {
          this.#rerenderDraftMode();
          this.#emitPreviewRequest();
        }
      });
    });

    this.#root.querySelectorAll('[data-role="follow-up-toggle"]').forEach((btn) => {
      btn.addEventListener('click', (event) => {
        event.stopPropagation();
        this.#openTargetPickerPartyIndex = null;
        this.#isBreakEditorOpen = false;
        this.#isFollowUpEditorOpen = !this.#isFollowUpEditorOpen;
        this.#isEnemyDetailEditorOpen = false;
        if (this.#isDraftMode()) {
          this.#rerenderDraftMode();
          this.#emitPreviewRequest();
        }
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
        this.#openTargetPickerPartyIndex = null;
        this.#isBreakEditorOpen = false;
        this.#isFollowUpEditorOpen = false;
        this.#isEnemyDetailEditorOpen = false;
        const payload = this.#buildEnemyDetailPopupPayload(this.#isCommittedDisplayMode(), 0);
        if (!payload || !Array.isArray(payload.enemies) || payload.enemies.length === 0) {
          return;
        }
        openEnemyDetailPopup(eventLike, payload);
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

    this.#root.querySelectorAll('[data-role="manual-break-target-reset"]').forEach((btn) => {
      btn.addEventListener('click', (event) => {
        event.stopPropagation();
        if (!this.#isDraftMode()) {
          return;
        }
        const partyIndex = Number(btn.dataset.partyIndex);
        if (!Number.isFinite(partyIndex)) {
          return;
        }
        this.#isBreakEditorOpen = true;
        delete this.#draftTargets[partyIndex];
        this.#rerenderDraftMode();
        this.#emitPreviewRequest();
      });
    });

    this.#root.querySelectorAll('[data-role="manual-break-target-candidate"]').forEach((btn) => {
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
        this.#isBreakEditorOpen = true;
        this.#draftTargets = {
          ...this.#draftTargets,
          [partyIndex]: normalizeTurnReplayTarget({
            type: 'enemy',
            enemyIndex,
          }),
        };
        this.#rerenderDraftMode();
        this.#emitPreviewRequest();
      });
    });

    this.#root.querySelectorAll('[data-role="manual-break-single-toggle"]').forEach((btn) => {
      btn.addEventListener('click', (event) => {
        event.stopPropagation();
        const partyIndex = Number(btn.dataset.partyIndex);
        const member =
          this.#stateBefore?.party?.find((candidate) => Number(candidate?.partyIndex) === partyIndex) ?? null;
        if (!member) {
          return;
        }
        const enemyCount =
          this.#isDraftMode() ? this.getCurrentEnemyCount() : this.#getCurrentReplayTurnEnemyCount();
        const selectionContext = this.#getBreakSelectionContext({
          member,
          isCommitted: this.#isCommittedDisplayMode(),
          enemyCount,
        });
        if (!selectionContext) {
          return;
        }
        const nextEnemyIndexes = selectionContext.breakEnabled
          ? []
          : selectionContext.currentReplayTarget.type === 'enemy'
            ? [Number(selectionContext.currentReplayTarget.enemyIndex)]
            : [];

        this.#isBreakEditorOpen = true;
        if (this.#isDraftMode()) {
          if (nextEnemyIndexes.length === 0) {
            delete this.#draftBreakEnemyIndexesByPartyIndex[partyIndex];
          } else {
            this.#draftBreakEnemyIndexesByPartyIndex = {
              ...this.#draftBreakEnemyIndexesByPartyIndex,
              [partyIndex]: nextEnemyIndexes,
            };
          }
          this.#rerenderDraftMode();
          this.#emitPreviewRequest();
        }
      });
    });

    this.#root.querySelectorAll('[data-role="manual-break-candidate"]').forEach((btn) => {
      btn.addEventListener('click', (event) => {
        event.stopPropagation();
        const partyIndex = Number(btn.dataset.partyIndex);
        const enemyIndex = Number(btn.dataset.enemyIndex);
        const member =
          this.#stateBefore?.party?.find((candidate) => Number(candidate?.partyIndex) === partyIndex) ?? null;
        if (!member) {
          return;
        }
        const enemyCount =
          this.#isDraftMode() ? this.getCurrentEnemyCount() : this.#getCurrentReplayTurnEnemyCount();
        const currentEnemyIndexes = this.#getCurrentBreakEnemyIndexes({
          member,
          isCommitted: this.#isCommittedDisplayMode(),
          enemyCount,
        });
        const nextEnemyIndexes = currentEnemyIndexes.includes(enemyIndex)
          ? currentEnemyIndexes.filter((candidate) => candidate !== enemyIndex)
          : [...currentEnemyIndexes, enemyIndex];

        this.#isBreakEditorOpen = true;
        if (this.#isDraftMode()) {
          this.#draftBreakEnemyIndexesByPartyIndex = {
            ...this.#draftBreakEnemyIndexesByPartyIndex,
            [partyIndex]: [...new Set(nextEnemyIndexes)].sort((left, right) => left - right),
          };
          if (this.#draftBreakEnemyIndexesByPartyIndex[partyIndex]?.length === 0) {
            delete this.#draftBreakEnemyIndexesByPartyIndex[partyIndex];
          }
          this.#rerenderDraftMode();
          this.#emitPreviewRequest();
        }
      });
    });

    this.#root.querySelectorAll('[data-role="kill-enemy-candidate"]').forEach((btn) => {
      btn.addEventListener('click', (event) => {
        event.stopPropagation();
        const enemyIndex = Number(btn.dataset.enemyIndex);
        if (!Number.isInteger(enemyIndex) || enemyIndex < 0) return;
        const partyIndex = Number(btn.dataset.partyIndex);
        const position = Number(btn.dataset.position);

        const enemyCount = this.#isDraftMode()
          ? this.getCurrentEnemyCount()
          : this.#getCurrentReplayTurnEnemyCount();

        this.#isBreakEditorOpen = true;

        if (this.#isDraftMode()) {
          const current = this.#draftKillEnemyIndexesByPartyIndex[partyIndex] ?? [];
          const next = current.includes(enemyIndex)
            ? current.filter((i) => i !== enemyIndex)
            : [...current, enemyIndex];
          this.#draftKillEnemyIndexesByPartyIndex[partyIndex] = next.filter(
            (i) => i < enemyCount
          );
          this.#rerenderDraftMode();
          this.#emitPreviewRequest();
        }
      });
    });

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
          },
          { x: e.clientX, y: e.clientY, isCommitted: this.#isCommittedDisplayMode() }
        );
      });
    });
  }

  /**
   * 表示中の .target-popover がビューポート外にはみ出す場合、
   * translate と maxHeight で画面内に収める。
   */
  #adjustPopoverPositions() {
    const viewportPadding = 8;
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

      if (String(popover.dataset.popoverKind ?? '') === 'manual-break') {
        const host = popover.closest('.relative');
        const toggle = host?.querySelector?.('[data-role="manual-break-toggle"]') ?? null;
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
