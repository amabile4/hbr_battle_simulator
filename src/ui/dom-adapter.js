import {
  previewTurn,
  activateOverdrive,
  resolveEffectiveSkillForAction,
  analyzePassiveConditionSupport,
} from '../turn/turn-controller.js';
import { createBattleRecordStore, RecordEditor } from '../records/record-store.js';
import { buildPositionMap, cloneTurnState } from '../contracts/interfaces.js';
import { BattleAdapterFacade } from './battle-adapter-facade.js';
import { BattleDomView } from './dom-view.js';
import {
  START_SP_BASE,
  START_SP_FIXED_BONUS,
  DEFAULT_INITIAL_SP,
  DEFAULT_START_SP_EQUIP_BONUS,
  DEFAULT_ENEMY_COUNT,
  DRIVE_PIERCE_OPTIONS,
  OD_GAUGE_MIN_PERCENT,
  OD_GAUGE_MAX_PERCENT,
  OD_LEVELS,
  REINFORCED_MODE_OD_GAUGE_BONUS,
  clampEnemyCount,
  getOdGaugeRequirement,
} from '../config/battle-defaults.js';

function toInt(value, fallback = 0) {
  const n = Number.parseInt(String(value), 10);
  return Number.isFinite(n) ? n : fallback;
}

function normalizeName(name) {
  return String(name ?? '')
    .split('—')[0]
    .trim();
}

function toDateValue(value) {
  const t = new Date(String(value ?? '')).getTime();
  return Number.isFinite(t) ? t : Number.POSITIVE_INFINITY;
}

const TIER_ORDER = Object.freeze({
  A: 0,
  S: 1,
  SS: 2,
  SSR: 3,
});
const SELECTION_SAVE_SCHEMA_VERSION = 1;
const AUTO_SAVE_SLOT_INDEX = 0;
const MANUAL_SELECTION_SLOT_COUNT = 10;
const TOTAL_SELECTION_SLOT_COUNT = MANUAL_SELECTION_SLOT_COUNT + 1;
const SELECTION_SAVE_STORAGE_KEY = 'hbr.battle_simulator.selection_slots.v1';
const START_SP_EQUIP_OPTIONS = Object.freeze([
  { value: 0, label: '初期SP装備 +0' },
  { value: 1, label: '初期SP装備 +1' },
  { value: 2, label: '初期SP装備 +2' },
  { value: 3, label: '初期SP装備 +3' },
]);
const NORMAL_ATTACK_BELT_OPTIONS = Object.freeze([
  { value: '', label: '属性ベルト: なし' },
  { value: 'Fire', label: '属性ベルト: 火' },
  { value: 'Ice', label: '属性ベルト: 氷' },
  { value: 'Thunder', label: '属性ベルト: 雷' },
  { value: 'Dark', label: '属性ベルト: 闇' },
  { value: 'Light', label: '属性ベルト: 光' },
]);
const NORMAL_ATTACK_BELT_LABEL_BY_VALUE = Object.freeze(
  Object.fromEntries(NORMAL_ATTACK_BELT_OPTIONS.map((option) => [String(option.value), String(option.label).replace('属性ベルト: ', '')]))
);
const MOTIVATION_OPTIONS = Object.freeze([
  { value: 1, label: 'やる気: 絶不調(1)' },
  { value: 2, label: 'やる気: 不調(2)' },
  { value: 3, label: 'やる気: 普通(3)' },
  { value: 4, label: 'やる気: 好調(4)' },
  { value: 5, label: 'やる気: 絶好調(5)' },
]);
const MOTIVATION_LABEL_BY_VALUE = Object.freeze(
  Object.fromEntries(MOTIVATION_OPTIONS.map((option) => [String(option.value), String(option.label).replace(/^やる気:\s*/, '')]))
);
const START_SP_EQUIP_DEFAULT = DEFAULT_START_SP_EQUIP_BONUS;
const TEZUKA_CHARACTER_ID = 'STezuka';
const FORCE_RESOURCE_MIN = -999;
const ENEMY_STATUS_DOWN_TURN = 'DownTurn';
const ENEMY_STATUS_BREAK = 'Break';
const ENEMY_STATUS_DEAD = 'Dead';
const ENEMY_ZONE_TYPE_OPTIONS = Object.freeze([
  { value: 'Fire', label: '火' },
  { value: 'Ice', label: '氷' },
  { value: 'Thunder', label: '雷' },
  { value: 'Dark', label: '闇' },
  { value: 'Light', label: '光' },
]);

function isPersistentEnemyStatus(statusType) {
  return (
    String(statusType ?? '') === ENEMY_STATUS_BREAK ||
    String(statusType ?? '') === ENEMY_STATUS_DEAD
  );
}

function isEnemyStatusActive(status) {
  if (isPersistentEnemyStatus(status?.statusType)) {
    return true;
  }
  return Number(status?.remainingTurns ?? 0) > 0;
}

function normalizeEnemyStatusForUi(status) {
  const statusType = String(status?.statusType ?? ENEMY_STATUS_DOWN_TURN);
  const targetIndex = Number(status?.targetIndex ?? 0);
  const remainingTurns = isPersistentEnemyStatus(statusType)
    ? Number(status?.remainingTurns ?? 0)
    : Math.max(1, toInt(status?.remainingTurns, 1));
  return {
    statusType,
    targetIndex,
    remainingTurns,
  };
}

function normalizeEnemyDamageRatesByEnemy(value) {
  if (!value || typeof value !== 'object') {
    return {};
  }
  return Object.fromEntries(
    Object.entries(value).map(([targetIndex, rates]) => [
      String(targetIndex),
      rates && typeof rates === 'object' ? { ...rates } : {},
    ])
  );
}

function normalizeEnemyNamesByEnemy(value) {
  if (!value || typeof value !== 'object') {
    return {};
  }
  return Object.fromEntries(
    Object.entries(value).map(([targetIndex, name]) => [String(targetIndex), String(name ?? '')])
  );
}

function normalizeEnemyZoneConfigByEnemy(value) {
  if (!value || typeof value !== 'object') {
    return {};
  }
  return Object.fromEntries(
    Object.entries(value).map(([targetIndex, config]) => [
      String(targetIndex),
      {
        enabled: Boolean(config?.enabled),
        type: String(config?.type ?? ''),
        remainingTurns:
          config?.remainingTurns === null || config?.remainingTurns === undefined
            ? null
            : Number.isFinite(Number(config.remainingTurns))
              ? Number(config.remainingTurns)
              : 8,
      },
    ])
  );
}

function normalizeFieldStateForScenario(value) {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const type = String(value.type ?? '').trim();
  if (!type) {
    return null;
  }
  const rawRemaining = value.remainingTurns;
  return {
    type,
    sourceSide: String(value.sourceSide ?? ''),
    remainingTurns:
      rawRemaining === null || rawRemaining === undefined
        ? null
        : Number.isFinite(Number(rawRemaining))
          ? Number(rawRemaining)
          : null,
    ...(Number.isFinite(Number(value.powerRate)) ? { powerRate: Number(value.powerRate) } : {}),
  };
}

const ENEMY_DAMAGE_RATE_FIELDS = Object.freeze([
  { key: 'Slash', label: '斬' },
  { key: 'Stab', label: '突' },
  { key: 'Strike', label: '打' },
  { key: 'Fire', label: '火' },
  { key: 'Ice', label: '氷' },
  { key: 'Thunder', label: '雷' },
  { key: 'Dark', label: '闇' },
  { key: 'Light', label: '光' },
]);

const DEFAULT_ENEMY_DAMAGE_RATE_UI_VALUE = 100;

function isNormalAttackSkill(skill) {
  const name = String(skill?.name ?? '');
  const label = String(skill?.label ?? '');
  return name === '通常攻撃' || label.endsWith('AttackNormal');
}

function isAdmiralCommandSkill(skill) {
  const name = String(skill?.name ?? '');
  const role = String(skill?.role ?? '');
  return name === '指揮行動' && role === 'Admiral';
}

function isRequiredEquippedSkill(skill) {
  return isNormalAttackSkill(skill) || isAdmiralCommandSkill(skill);
}

function clampLimitBreak(level, max) {
  return Math.max(0, Math.min(Number(max), Number(level)));
}

function canSwapByExtraState(a, b, hasAnyExtra = false) {
  if (hasAnyExtra) {
    return Boolean(a?.isExtraActive) && Boolean(b?.isExtraActive);
  }
  return true;
}

function formatSwapMemberLabel(member) {
  const name = String(member?.characterName ?? member?.characterId ?? '');
  return `${name}${member?.isExtraActive ? ' [EX]' : ''}`;
}

function formatSkillCostLabel(skill, member = null, state = null) {
  const effectiveSkill =
    state && member ? resolveEffectiveSkillForAction(state, member, skill) : skill;
  const consumeType = String(effectiveSkill?.consumeType ?? effectiveSkill?.consume_type ?? 'Sp');
  const consumeTypeLower = consumeType.toLowerCase();
  const costRaw = Number(effectiveSkill?.spCost ?? effectiveSkill?.sp_cost ?? 0);
  if (
    member?.characterId === TEZUKA_CHARACTER_ID &&
    Boolean(member?.isReinforcedMode) &&
    consumeTypeLower !== 'ep' &&
    consumeTypeLower !== 'token' &&
    consumeTypeLower !== 'morale' &&
    costRaw !== -1
  ) {
    return 'SP 0';
  }
  if (consumeTypeLower === 'token') {
    return costRaw === -1 ? 'Token ALL' : `Token ${costRaw}`;
  }
  if (consumeTypeLower === 'morale') {
    return costRaw === -1 ? 'Morale ALL' : `Morale ${costRaw}`;
  }
  if (consumeTypeLower !== 'ep' && costRaw === -1) {
    return 'SP ALL';
  }
  return consumeTypeLower === 'ep' ? `EP ${costRaw}` : `SP ${costRaw}`;
}

function formatGaugePercent(value) {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n)) {
    return '000.00';
  }
  const absText = Math.abs(n).toFixed(2).padStart(6, '0');
  return n < 0 ? `-${absText}` : absText;
}

function formatTranscendencePercent(value) {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n)) {
    return '000';
  }
  const clamped = Math.max(0, Math.min(999, Math.floor(n)));
  return String(clamped).padStart(3, '0');
}

function formatPassiveLogLine(event) {
  const turnLabel = String(event?.turnLabel ?? '');
  const characterName = String(event?.characterName ?? event?.characterId ?? '');
  const passiveDesc = String(event?.passiveDesc ?? event?.passiveName ?? '');
  return `${turnLabel}：${characterName}：${passiveDesc}`;
}

function formatConditionSupportLine(label, values) {
  const list = Array.isArray(values) && values.length > 0 ? values.join(', ') : '-';
  return `${label}: ${list}`;
}

function formatFieldStateLabel(turnState) {
  const zoneState = turnState?.zoneState && typeof turnState.zoneState === 'object' ? turnState.zoneState : null;
  const territoryState =
    turnState?.territoryState && typeof turnState.territoryState === 'object' ? turnState.territoryState : null;
  const zoneText = zoneState?.type
    ? `Field=${zoneState.type}${zoneState.remainingTurns === null ? '' : `(${zoneState.remainingTurns})`}`
    : 'Field=-';
  const territoryText = territoryState?.type
    ? `Territory=${territoryState.type}${territoryState.remainingTurns === null ? '' : `(${territoryState.remainingTurns})`}`
    : 'Territory=-';
  return `${zoneText} | ${territoryText}`;
}

function hasTokenPassiveSupport(member) {
  return (member?.passives ?? []).some((passive) => {
    if (String(passive?.condition ?? '').includes('Token()')) {
      return true;
    }
    return (passive?.parts ?? []).some((part) => String(part?.skill_type ?? '').includes('Token'));
  });
}

function hasVisibleMoraleState(member) {
  return Number(member?.moraleState?.current ?? 0) > 0;
}

function formatMotivationLabel(value) {
  const key = String(Number(value));
  return MOTIVATION_LABEL_BY_VALUE[key] ?? `普通(3)`;
}

function deriveDisplayedOdTurn(turnState) {
  const type = String(turnState?.turnType ?? '');
  if (type === 'od') {
    return String(turnState?.turnLabel ?? '');
  }
  if (type !== 'extra' || !turnState?.odSuspended) {
    return '';
  }
  const level = Number(turnState?.odLevel ?? 0);
  const remaining = Number(turnState?.remainingOdActions ?? 0);
  if (level <= 0 || remaining < 0) {
    return '';
  }
  const step = Math.max(1, Math.min(level, level - remaining));
  return `OD${level}-${step}`;
}

function resolveFunnelHitBonus(member, maxStacks = 2) {
  if (!member || typeof member.resolveEffectiveFunnelEffects !== 'function') {
    return 0;
  }
  return member
    .resolveEffectiveFunnelEffects()
    .slice(0, Math.max(0, Number(maxStacks) || 0))
    .reduce((sum, effect) => sum + Math.max(0, Number(effect?.power ?? 0)), 0);
}

function formatSkillHitLabel(skill, member, state = null) {
  const effectiveSkill =
    state && member ? resolveEffectiveSkillForAction(state, member, skill) : skill;
  const baseHit = Number(effectiveSkill?.hitCount ?? 0);
  const validBase = Number.isFinite(baseHit) && baseHit > 0 ? baseHit : null;
  if (!validBase) {
    return '-';
  }

  const funnel =
    String(effectiveSkill?.type ?? '') === 'damage' ? resolveFunnelHitBonus(member, 2) : 0;
  if (funnel > 0) {
    return `${validBase}+${funnel}`;
  }
  return `${validBase}`;
}

const ELEMENT_BADGE_META = Object.freeze({
  Fire: { label: '火', className: 'attr-element-fire' },
  Ice: { label: '氷', className: 'attr-element-ice' },
  Thunder: { label: '雷', className: 'attr-element-thunder' },
  Light: { label: '光', className: 'attr-element-light' },
  Dark: { label: '闇', className: 'attr-element-dark' },
});

const WEAPON_BADGE_META = Object.freeze({
  Slash: { label: '斬', className: 'attr-weapon-slash' },
  Stab: { label: '突', className: 'attr-weapon-stab' },
  Strike: { label: '打', className: 'attr-weapon-strike' },
});

function toUniqueList(values) {
  return [...new Set(values.filter(Boolean))];
}

function formatNormalAttackBeltLabel(value) {
  return NORMAL_ATTACK_BELT_LABEL_BY_VALUE[String(value ?? '')] ?? 'なし';
}

function extractSkillAttributes(skill, options = {}) {
  const elements = new Set();
  const weaponTypes = new Set();

  const collectFromParts = (parts) => {
    for (const part of Array.isArray(parts) ? parts : []) {
      for (const element of Array.isArray(part?.elements) ? part.elements : []) {
        const value = String(element ?? '');
        if (value && value !== 'None') {
          elements.add(value);
        }
      }

      const type = String(part?.type ?? '');
      if (['Slash', 'Stab', 'Strike'].includes(type)) {
        weaponTypes.add(type);
      }

      // SkillSwitch などで variant が strval に入るため、再帰で拾う。
      for (const variant of Array.isArray(part?.strval) ? part.strval : []) {
        if (variant && typeof variant === 'object' && Array.isArray(variant.parts)) {
          collectFromParts(variant.parts);
        }
      }
    }
  };

  collectFromParts(skill?.parts);
  for (const element of Array.isArray(options.normalAttackElements) ? options.normalAttackElements : []) {
    const value = String(element ?? '');
    if (value && value !== 'None') {
      elements.add(value);
    }
  }

  return {
    elements: [...elements],
    weapon: [...weaponTypes][0] ?? null,
  };
}

function firstSixUniqueStyles(styles) {
  const out = [];
  const seen = new Set();

  for (const style of styles) {
    if (!Array.isArray(style.skills) || style.skills.length === 0) {
      continue;
    }

    const key = String(style.chara_label ?? style.chara ?? '');
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    out.push(style);

    if (out.length === 6) {
      break;
    }
  }

  return out;
}

export class BattleDomAdapter extends BattleAdapterFacade {
  constructor({ root, dataStore, initialSP = DEFAULT_INITIAL_SP }) {
    if (!root || !dataStore) {
      throw new Error('BattleDomAdapter requires root and dataStore.');
    }
    super({ dataStore, initialSP });

    this.root = root;
    this.doc = root.ownerDocument ?? globalThis.document;
    this.view = new BattleDomView({ root: this.root, doc: this.doc });

    this.lastActionSkillByPosition = new Map();
    this.lastActionTargetByPosition = new Map();
    this.turnPlanRecalcMode = 'strict';
    this.recordsSimpleMode = false;
    this.scenario = null;
    this.scenarioCursor = 0;
    this.scenarioStagedTurnIndex = null;
    this.scenarioSetupApplied = false;

    this.characterCandidates = this.dataStore.listCharacterCandidates();
    this.defaultSelections = this.buildDefaultSelections();

    this._bound = false;
  }

  mount() {
    this.renderPartySelectionSlots();
    this.initializeSelectionStorageUi();
    this.bindEvents();
    this.initializeBattle();
    this.renderScenarioStatus();
    return this;
  }

  runSafely(action, fallbackMessage = 'Operation failed.') {
    try {
      return action();
    } catch (error) {
      this.setStatus(`Error: ${error.message || fallbackMessage}`);
      return null;
    }
  }

  createAttributeBadge(text, className) {
    const badge = this.doc.createElement('span');
    badge.className = `attr-badge ${className}`;
    badge.textContent = text;
    return badge;
  }

  buildAttributeBadgeNodes({ elements = [], weapon = null } = {}) {
    const nodes = [];
    for (const element of elements) {
      const meta = ELEMENT_BADGE_META[element];
      if (!meta) {
        continue;
      }
      nodes.push(this.createAttributeBadge(meta.label, meta.className));
    }
    if (weapon) {
      const meta = WEAPON_BADGE_META[weapon];
      if (meta) {
        nodes.push(this.createAttributeBadge(meta.label, meta.className));
      }
    }
    return nodes;
  }

  renderBadgeContainer(container, attrs) {
    if (!container) {
      return;
    }
    container.innerHTML = '';
    for (const node of this.buildAttributeBadgeNodes(attrs)) {
      container.appendChild(node);
    }
  }

  bindEvents() {
    if (this._bound) {
      return;
    }

    this.root.querySelector('[data-action="initialize"]')?.addEventListener('click', () => {
      this.runSafely(() => this.initializeBattle());
    });

    this.root.querySelector('[data-action="preview"]')?.addEventListener('click', () => {
      this.runSafely(() => this.previewCurrentTurn());
    });

    this.root.querySelector('[data-action="commit"]')?.addEventListener('click', () => {
      this.runSafely(() => this.commitCurrentTurn());
    });

    this.root.querySelector('[data-action="open-od"]')?.addEventListener('click', () => {
      this.runSafely(() => this.openOdDialog('normal'));
    });
    this.root.querySelector('[data-action="kishinka"]')?.addEventListener('click', () => {
      this.runSafely(() => this.activateKishinka());
    });

    this.root.querySelector('[data-action="od-confirm"]')?.addEventListener('click', () => {
      this.runSafely(() => this.confirmOdDialog('normal'));
    });

    this.root.querySelector('[data-action="od-cancel"]')?.addEventListener('click', () => {
      this.runSafely(() => this.closeOdDialog('normal'));
    });

    this.root.querySelector('[data-action="open-interrupt-od"]')?.addEventListener('click', () => {
      this.runSafely(() => this.openOdDialog('interrupt'));
    });

    this.root.querySelector('[data-action="interrupt-od-confirm"]')?.addEventListener('click', () => {
      this.runSafely(() => this.confirmOdDialog('interrupt'));
    });

    this.root.querySelector('[data-action="interrupt-od-cancel"]')?.addEventListener('click', () => {
      this.runSafely(() => this.closeOdDialog('interrupt'));
    });

    this.root.querySelector('[data-action="swap"]')?.addEventListener('click', () => {
      this.runSafely(() => {
        const from = toInt(this.root.querySelector('[data-role="swap-from"]')?.value, 0);
        const to = toInt(this.root.querySelector('[data-role="swap-to"]')?.value, -1);
        this.queueSwap(from, to);
      });
    });

    this.root.querySelector('[data-action="export-csv"]')?.addEventListener('click', () => {
      this.runSafely(() => this.exportCsv());
    });
    this.root.querySelector('[data-action="export-records-json"]')?.addEventListener('click', () => {
      this.runSafely(() => this.exportRecordsJson());
    });
    this.root.querySelector('[data-action="enemy-status-apply"]')?.addEventListener('click', () => {
      this.runSafely(() => this.applyEnemyStatusFromDom());
    });
    this.root.querySelector('[data-action="enemy-status-clear"]')?.addEventListener('click', () => {
      this.runSafely(() => this.clearEnemyStatusFromDom());
    });
    this.root.querySelector('[data-action="enemy-zone-apply"]')?.addEventListener('click', () => {
      this.runSafely(() => this.applyEnemyZoneFromDom());
    });

    this.root.querySelector('[data-action="clear-records"]')?.addEventListener('click', () => {
      this.clearRecordsState();
      this.renderRecordTable();
      this.renderTurnPlanEditControls();
      this.writeRecordsJsonOutput('');
      this.writePassiveLogOutput('');
      this.setStatus('Records cleared.');
    });
    this.root.querySelector('[data-action="turn-plan-recalc"]')?.addEventListener('click', () => {
      this.runSafely(() => this.recalculateTurnPlans({ mode: this.getTurnPlanRecalcModeFromDom() }));
    });
    this.root.querySelector('[data-action="turn-plan-edit-save"]')?.addEventListener('click', () => {
      this.runSafely(() => this.saveTurnPlanEditFromDom());
    });
    this.root.querySelector('[data-action="turn-plan-edit-cancel"]')?.addEventListener('click', () => {
      this.runSafely(() => this.cancelTurnPlanEdit());
    });
    this.root.querySelector('[data-action="scenario-load"]')?.addEventListener('click', () => {
      this.runSafely(() => this.loadScenarioFromDom());
    });
    this.root.querySelector('[data-action="scenario-apply-setup"]')?.addEventListener('click', () => {
      this.runSafely(() => this.applyLoadedScenarioSetup());
    });
    this.root.querySelector('[data-action="scenario-run-next"]')?.addEventListener('click', () => {
      this.runSafely(() => this.runNextScenarioTurn());
    });
    this.root.querySelector('[data-action="scenario-stage-next"]')?.addEventListener('click', () => {
      this.runSafely(() => this.stageCurrentScenarioTurn());
    });
    this.root.querySelector('[data-action="scenario-run-all"]')?.addEventListener('click', () => {
      this.runSafely(() => this.runAllScenarioTurns());
    });

    this.root.querySelector('[data-action="save-selection"]')?.addEventListener('click', () => {
      this.runSafely(() => {
        const slot = this.getSelectedSelectionSlotIndex();
        const ok = this.askConfirm(
          `Selection ${this.getSelectionSlotLabel(slot)} に現在の選択を保存します。よろしいですか？`
        );
        if (!ok) {
          this.setStatus('Selection save canceled.');
          return null;
        }
        return this.saveSelectionToSlot(slot);
      });
    });

    this.root.querySelector('[data-action="load-selection"]')?.addEventListener('click', () => {
      this.runSafely(() => {
        const slot = this.getSelectedSelectionSlotIndex();
        const ok = this.askConfirm(
          '現在のキャラクターセレクションは上書きされます。読み込みを続行しますか？'
        );
        if (!ok) {
          this.setStatus('Selection load canceled.');
          return null;
        }
        return this.loadSelectionFromSlot(slot);
      });
    });

    this.root.querySelector('[data-action="clear-selection-slot"]')?.addEventListener('click', () => {
      this.runSafely(() => {
        const slot = this.getSelectedSelectionSlotIndex();
        this.clearSelectionSlot(slot);
      });
    });

    this.root.addEventListener('change', (event) => {
      const target = event.target;
      if (!(target instanceof this.doc.defaultView.HTMLElement)) {
        return;
      }

      if (target.matches('[data-role="turn-plan-recalc-mode"]')) {
        this.turnPlanRecalcMode = String(target.value || 'strict') === 'force' ? 'force' : 'strict';
        this.renderRecordTable();
      }

      if (target.matches('[data-role="records-simple-toggle"]')) {
        this.recordsSimpleMode = Boolean(target.checked);
        this.renderRecordTable();
      }

      if (target.matches('[data-role="character-select"]')) {
        const slot = toInt(target.getAttribute('data-slot'), 0);
        this.onCharacterSelectionChanged(slot, target.value);
      }

      if (target.matches('[data-role="style-select"]')) {
        const slot = toInt(target.getAttribute('data-slot'), 0);
        this.updateStyleAttributeBadges(slot, target.value);
        this.populateLimitBreakSelect(slot, target.value, null);
        this.populateSkillChecklist(slot, target.value);
        this.populatePassiveList(slot, target.value);
        this.updateSlotSummary(slot);
        this.renderSelectionSummary();
      }

      if (target.matches('[data-role="limit-break-select"]')) {
        const slot = toInt(target.getAttribute('data-slot'), 0);
        const styleSelect = this.root.querySelector(
          `[data-role="style-select"][data-slot="${slot}"]`
        );
        this.populatePassiveList(slot, styleSelect?.value ?? '');
        this.updateSlotSummary(slot);
      }

      if (target.matches('[data-role="skill-check"]')) {
        const slot = toInt(target.getAttribute('data-slot'), 0);
        this.updateSlotSummary(slot);
      }

      if (target.matches('[data-role="drive-pierce-select"]')) {
        const slot = toInt(target.getAttribute('data-slot'), 0);
        this.updateSlotSummary(slot);
      }

      if (target.matches('[data-role="start-sp-equip-select"]')) {
        const slot = toInt(target.getAttribute('data-slot'), 0);
        this.updateSlotSummary(slot);
      }

      if (target.matches('[data-role="normal-attack-belt-select"]')) {
        const slot = toInt(target.getAttribute('data-slot'), 0);
        this.updateSlotSummary(slot);
      }

      if (target.matches('[data-role="motivation-select"]')) {
        const slot = toInt(target.getAttribute('data-slot'), 0);
        this.updateSlotSummary(slot);
      }

      if (target.matches('[data-role="selection-slot-select"]')) {
        const slot = this.getSelectedSelectionSlotIndex();
        this.renderSelectionSlotPreview(slot);
      }

      if (target.matches('[data-role="swap-from"]')) {
        const from = toInt(target.value, 0);
        this.renderSwapToOptions(from);
      }

      if (target.matches('[data-role="enemy-count"]')) {
        this.syncEnemyStateFromDom();
        this.previewRecord = null;
        this.resetInterruptOdProjection({ clearReservation: true });
        this.writePreviewOutput('');
        this.renderActionSelectors();
        this.renderEnemyStatusControls();
        this.renderEnemyConfigControls();
        this.renderOdControls();
      }

      if (target.matches('[data-role="enemy-name-input"]')) {
        const targetIndex = toInt(target.getAttribute('data-enemy-index'), -1);
        if (targetIndex >= 0) {
          this.applyEnemyNameFromDom(targetIndex, String(target.value ?? ''));
        }
      }

      if (target.matches('[data-role="enemy-damage-rate-input"]')) {
        const targetIndex = toInt(target.getAttribute('data-enemy-index'), -1);
        const damageKey = String(target.getAttribute('data-damage-key') ?? '').trim();
        if (targetIndex >= 0 && damageKey) {
          this.applyEnemyDamageRateFromDom(targetIndex, damageKey, target.value);
        }
      }

      if (target.matches('[data-role="enemy-zone-enabled"]')) {
        const targetIndex = toInt(target.getAttribute('data-enemy-index'), -1);
        if (targetIndex >= 0) {
          this.applyEnemyZoneConfigFromDom(targetIndex, { enabled: Boolean(target.checked) });
        }
      }

      if (target.matches('[data-role="enemy-zone-type"]')) {
        const targetIndex = toInt(target.getAttribute('data-enemy-index'), -1);
        if (targetIndex >= 0) {
          this.applyEnemyZoneConfigFromDom(targetIndex, { type: String(target.value ?? '') });
        }
      }

      if (target.matches('[data-role="enemy-zone-turns"]')) {
        const targetIndex = toInt(target.getAttribute('data-enemy-index'), -1);
        if (targetIndex >= 0) {
          this.applyEnemyZoneConfigFromDom(targetIndex, { remainingTurns: target.value });
        }
      }

      if (target.matches('[data-role="token-debug-input"]')) {
        const characterId = String(target.getAttribute('data-character-id') ?? '').trim();
        if (characterId) {
          this.applyTokenDebugValueFromDom(characterId, target.value);
        }
      }

      if (target.matches('[data-action-slot]')) {
        const position = toInt(target.getAttribute('data-action-slot'), -1);
        if (position >= 0) {
          this.lastActionSkillByPosition.set(position, toInt(target.value, 0));
          this.updateActionSkillAttributeBadges(position, toInt(target.value, 0));
          this.updateActionTargetSelector(position, toInt(target.value, 0));
          this.previewRecord = null;
          this.resetInterruptOdProjection({ clearReservation: true });
          this.writePreviewOutput('');
          this.renderOdControls();
        }
      }

      if (target.matches('[data-action-target-slot]')) {
        const position = toInt(target.getAttribute('data-action-target-slot'), -1);
        if (position >= 0) {
          this.lastActionTargetByPosition.set(position, String(target.value));
          this.previewRecord = null;
          this.resetInterruptOdProjection({ clearReservation: true });
          this.writePreviewOutput('');
          this.renderOdControls();
        }
      }

      if (target.matches('[data-role="force-od-toggle"]')) {
        this.previewRecord = null;
        this.resetInterruptOdProjection({ clearReservation: true });
        this.writePreviewOutput('');
        this.renderOdControls();
      }
    });

    this.root.addEventListener('click', (event) => {
      const target = event.target;
      if (!(target instanceof this.doc.defaultView.HTMLElement)) {
        return;
      }
      const rowTurnId = toInt(target.getAttribute('data-turn-id'), 0);
      if (rowTurnId <= 0) {
        return;
      }

      if (target.matches('[data-action="turn-plan-edit-row"]')) {
        this.runSafely(() => this.startTurnPlanEdit(rowTurnId));
        return;
      }
      if (target.matches('[data-action="turn-plan-insert-before-row"]')) {
        this.runSafely(() => this.startTurnPlanInsert(rowTurnId, 'before'));
        return;
      }
      if (target.matches('[data-action="turn-plan-insert-after-row"]')) {
        this.runSafely(() => this.startTurnPlanInsert(rowTurnId, 'after'));
        return;
      }
      if (target.matches('[data-action="turn-plan-delete-row"]')) {
        this.runSafely(() => this.deleteTurnPlanRow(rowTurnId));
        return;
      }
      if (target.matches('[data-action="turn-plan-move-up-row"]')) {
        this.runSafely(() => this.moveTurnPlanRow(rowTurnId, -1));
        return;
      }
      if (target.matches('[data-action="turn-plan-move-down-row"]')) {
        this.runSafely(() => this.moveTurnPlanRow(rowTurnId, 1));
      }
    });

    this._bound = true;
  }

  populateSkillChecklist(slotIndex, styleId, preferredCheckedIds = null) {
    const container = this.root.querySelector(
      `[data-role="skill-checklist"][data-slot="${slotIndex}"]`
    );
    if (!container) return;

    const skills = this.dataStore.listEquipableSkillsByStyleId(styleId);
    const checkedSet = Array.isArray(preferredCheckedIds)
      ? new Set(preferredCheckedIds.map((id) => Number(id)))
      : null;
    container.innerHTML = '';

    for (const skill of skills) {
      const row = this.doc.createElement('label');
      row.className = 'skill-check-item';
      const checkbox = this.doc.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.setAttribute('data-role', 'skill-check');
      checkbox.setAttribute('data-slot', String(slotIndex));
      checkbox.value = String(skill.id);
      const required = isRequiredEquippedSkill(skill);
      checkbox.checked = required ? true : checkedSet ? checkedSet.has(Number(skill.id)) : true;
      if (required) {
        checkbox.disabled = true;
        checkbox.setAttribute('data-required-skill', 'true');
      }

      const sourceType = String(skill.sourceType ?? 'style');
      const sourceLabelByType = {
        style: '',
        master: 'マスター',
        orb: 'オーブ',
        passive: '',
      };
      const tags = [];
      const sourceLabel = sourceLabelByType[sourceType] ?? sourceType;
      if (sourceLabel) {
        tags.push(sourceLabel);
      }
      if (skill.passive && typeof skill.passive === 'object') {
        tags.push('パッシブ');
      }
      const sourceBadge = tags.length > 0 ? ` ${tags.map((t) => `[${t}]`).join('')}` : '';
      const costLabel = formatSkillCostLabel(skill);
      const attrs = extractSkillAttributes(skill);
      row.appendChild(checkbox);
      row.append(' ');
      for (const badge of this.buildAttributeBadgeNodes(attrs)) {
        row.appendChild(badge);
      }
      row.append(` ${skill.name} (${costLabel})${sourceBadge}`);
      container.appendChild(row);
    }
  }

  buildDefaultSelections() {
    const defaults = firstSixUniqueStyles(this.dataStore.styles);
    if (defaults.length < 6) {
      throw new Error('Not enough unique character styles to initialize six party slots.');
    }

    return defaults.map((style) => ({
      characterLabel: String(style.chara_label),
      styleId: Number(style.id),
    }));
  }

  getStylesForCharacter(characterLabel) {
    return this.dataStore
      .listStylesByCharacter(characterLabel)
      .filter((style) => Array.isArray(style.skills) && style.skills.length > 0)
      .sort((a, b) => {
        const tierA = TIER_ORDER[String(a.tier ?? '').toUpperCase()] ?? Number.POSITIVE_INFINITY;
        const tierB = TIER_ORDER[String(b.tier ?? '').toUpperCase()] ?? Number.POSITIVE_INFINITY;
        if (tierA !== tierB) {
          return tierA - tierB;
        }

        const dateDelta = toDateValue(a.in_date) - toDateValue(b.in_date);
        if (dateDelta !== 0) {
          return dateDelta;
        }

        return Number(a.id) - Number(b.id);
      });
  }

  renderPartySelectionSlots() {
    const container = this.root.querySelector('[data-role="style-slots"]');
    if (!container) {
      return;
    }

    container.innerHTML = '';

    for (let i = 0; i < 6; i += 1) {
      const initial = this.defaultSelections[i];
      const wrapper = this.doc.createElement('div');
      wrapper.className = 'party-slot';
      wrapper.setAttribute('data-slot', String(i));

      const slotTitle = this.doc.createElement('strong');
      slotTitle.textContent = `Slot ${i + 1}`;
      wrapper.appendChild(slotTitle);

      const characterSelect = this.doc.createElement('select');
      characterSelect.setAttribute('data-role', 'character-select');
      characterSelect.setAttribute('data-slot', String(i));

      for (const candidate of this.characterCandidates) {
        const option = this.doc.createElement('option');
        option.value = candidate.label;
        option.textContent = `${candidate.name} (${candidate.styleCount})`;
        if (candidate.label === initial.characterLabel) {
          option.selected = true;
        }
        characterSelect.appendChild(option);
      }

      const styleSelect = this.doc.createElement('select');
      styleSelect.setAttribute('data-role', 'style-select');
      styleSelect.setAttribute('data-slot', String(i));
      const styleAttrBadges = this.doc.createElement('div');
      styleAttrBadges.setAttribute('data-role', 'style-attr-badges');
      styleAttrBadges.setAttribute('data-slot', String(i));
      styleAttrBadges.className = 'attr-badge-row';

      const limitBreakSelect = this.doc.createElement('select');
      limitBreakSelect.setAttribute('data-role', 'limit-break-select');
      limitBreakSelect.setAttribute('data-slot', String(i));

      const drivePierceSelect = this.doc.createElement('select');
      drivePierceSelect.setAttribute('data-role', 'drive-pierce-select');
      drivePierceSelect.setAttribute('data-slot', String(i));
      for (const optionDef of DRIVE_PIERCE_OPTIONS) {
        const option = this.doc.createElement('option');
        option.value = String(optionDef.value);
        option.textContent = optionDef.label;
        if (Number(optionDef.value) === 0) {
          option.selected = true;
        }
        drivePierceSelect.appendChild(option);
      }
      const startSpEquipSelect = this.doc.createElement('select');
      startSpEquipSelect.setAttribute('data-role', 'start-sp-equip-select');
      startSpEquipSelect.setAttribute('data-slot', String(i));
      for (const optionDef of START_SP_EQUIP_OPTIONS) {
        const option = this.doc.createElement('option');
        option.value = String(optionDef.value);
        option.textContent = optionDef.label;
        if (Number(optionDef.value) === START_SP_EQUIP_DEFAULT) {
          option.selected = true;
        }
        startSpEquipSelect.appendChild(option);
      }
      const normalAttackBeltSelect = this.doc.createElement('select');
      normalAttackBeltSelect.setAttribute('data-role', 'normal-attack-belt-select');
      normalAttackBeltSelect.setAttribute('data-slot', String(i));
      for (const optionDef of NORMAL_ATTACK_BELT_OPTIONS) {
        const option = this.doc.createElement('option');
        option.value = String(optionDef.value);
        option.textContent = optionDef.label;
        if (optionDef.value === '') {
          option.selected = true;
        }
        normalAttackBeltSelect.appendChild(option);
      }
      const motivationSelect = this.doc.createElement('select');
      motivationSelect.setAttribute('data-role', 'motivation-select');
      motivationSelect.setAttribute('data-slot', String(i));
      for (const optionDef of MOTIVATION_OPTIONS) {
        const option = this.doc.createElement('option');
        option.value = String(optionDef.value);
        option.textContent = optionDef.label;
        if (Number(optionDef.value) === 3) {
          option.selected = true;
        }
        motivationSelect.appendChild(option);
      }

      const skillChecklist = this.doc.createElement('div');
      skillChecklist.setAttribute('data-role', 'skill-checklist');
      skillChecklist.setAttribute('data-slot', String(i));

      wrapper.appendChild(characterSelect);
      wrapper.appendChild(styleSelect);
      wrapper.appendChild(styleAttrBadges);
      wrapper.appendChild(limitBreakSelect);
      wrapper.appendChild(drivePierceSelect);
      wrapper.appendChild(startSpEquipSelect);
      wrapper.appendChild(normalAttackBeltSelect);
      wrapper.appendChild(motivationSelect);
      wrapper.appendChild(skillChecklist);

      const summary = this.doc.createElement('div');
      summary.setAttribute('data-role', 'slot-summary');
      summary.setAttribute('data-slot', String(i));
      wrapper.appendChild(summary);

      const passiveList = this.doc.createElement('div');
      passiveList.setAttribute('data-role', 'passive-list');
      passiveList.setAttribute('data-slot', String(i));
      wrapper.appendChild(passiveList);

      container.appendChild(wrapper);
      this.populateStyleSelect(i, initial.characterLabel, initial.styleId);
      this.updateStyleAttributeBadges(i, initial.styleId);
      this.populateLimitBreakSelect(i, initial.styleId, null);
      this.populateSkillChecklist(i, initial.styleId);
      this.populatePassiveList(i, initial.styleId);
      this.updateSlotSummary(i);
    }

    this.renderSelectionSummary();
  }

  initializeSelectionStorageUi() {
    const select = this.root.querySelector('[data-role="selection-slot-select"]');
    if (!select) {
      return;
    }

    select.innerHTML = '';
    for (let i = 1; i <= MANUAL_SELECTION_SLOT_COUNT; i += 1) {
      const option = this.doc.createElement('option');
      option.value = String(i);
      option.textContent = `Slot ${i}`;
      select.appendChild(option);
    }
    select.value = '1';
    this.refreshSelectionSlotOptions();
    this.renderSelectionSlotPreview(1);
  }

  askConfirm(message) {
    const fn = this.doc.defaultView?.confirm;
    if (typeof fn !== 'function') {
      return true;
    }
    try {
      return Boolean(fn.call(this.doc.defaultView, message));
    } catch {
      return true;
    }
  }

  getSelectionSlotLabel(slotIndex) {
    if (Number(slotIndex) === AUTO_SAVE_SLOT_INDEX) {
      return 'Auto Slot 0';
    }
    return `Slot ${slotIndex}`;
  }

  getSelectedSelectionSlotIndex() {
    const select = this.root.querySelector('[data-role="selection-slot-select"]');
    return Math.max(1, Math.min(MANUAL_SELECTION_SLOT_COUNT, toInt(select?.value, 1)));
  }

  assertManualSelectionSlotIndex(slotIndex) {
    if (slotIndex < 1 || slotIndex > MANUAL_SELECTION_SLOT_COUNT) {
      throw new Error(`Manual selection slot must be 1-${MANUAL_SELECTION_SLOT_COUNT}.`);
    }
  }

  readSelectionStore() {
    const storage = this.doc.defaultView?.localStorage;
    if (!storage) {
      return {
        schemaVersion: SELECTION_SAVE_SCHEMA_VERSION,
        slots: Array(TOTAL_SELECTION_SLOT_COUNT).fill(null),
      };
    }

    const raw = storage.getItem(SELECTION_SAVE_STORAGE_KEY);
    if (!raw) {
      return {
        schemaVersion: SELECTION_SAVE_SCHEMA_VERSION,
        slots: Array(TOTAL_SELECTION_SLOT_COUNT).fill(null),
      };
    }

    try {
      const parsed = JSON.parse(raw);
      if (
        !parsed ||
        parsed.schemaVersion !== SELECTION_SAVE_SCHEMA_VERSION ||
        !Array.isArray(parsed.slots)
      ) {
        return {
          schemaVersion: SELECTION_SAVE_SCHEMA_VERSION,
          slots: Array(TOTAL_SELECTION_SLOT_COUNT).fill(null),
        };
      }

      const slots = Array(TOTAL_SELECTION_SLOT_COUNT).fill(null);
      if (parsed.slots.length === MANUAL_SELECTION_SLOT_COUNT) {
        // Legacy format: slot 0-9 were manual slots 1-10.
        for (let i = 0; i < MANUAL_SELECTION_SLOT_COUNT; i += 1) {
          slots[i + 1] = parsed.slots[i] ?? null;
        }
      } else {
        for (let i = 0; i < TOTAL_SELECTION_SLOT_COUNT; i += 1) {
          slots[i] = parsed.slots[i] ?? null;
        }
      }
      return {
        schemaVersion: SELECTION_SAVE_SCHEMA_VERSION,
        slots,
      };
    } catch {
      return {
        schemaVersion: SELECTION_SAVE_SCHEMA_VERSION,
        slots: Array(TOTAL_SELECTION_SLOT_COUNT).fill(null),
      };
    }
  }

  writeSelectionStore(store) {
    const storage = this.doc.defaultView?.localStorage;
    if (!storage) {
      return;
    }
    storage.setItem(SELECTION_SAVE_STORAGE_KEY, JSON.stringify(store));
  }

  captureSelectionState() {
    const partySelections = [];
    for (let i = 0; i < 6; i += 1) {
      const charSelect = this.root.querySelector(
        `[data-role="character-select"][data-slot="${i}"]`
      );
      const styleSelect = this.root.querySelector(`[data-role="style-select"][data-slot="${i}"]`);
      const lbSelect = this.root.querySelector(
        `[data-role="limit-break-select"][data-slot="${i}"]`
      );
      const drivePierceSelect = this.root.querySelector(
        `[data-role="drive-pierce-select"][data-slot="${i}"]`
      );
      const startSpEquipSelect = this.root.querySelector(
        `[data-role="start-sp-equip-select"][data-slot="${i}"]`
      );
      const normalAttackBeltSelect = this.root.querySelector(
        `[data-role="normal-attack-belt-select"][data-slot="${i}"]`
      );
      const motivationSelect = this.root.querySelector(
        `[data-role="motivation-select"][data-slot="${i}"]`
      );
      const checkedSkillIds = this.getCheckedSkillIdsForSlot(i) ?? [];
      partySelections.push({
        characterLabel: String(charSelect?.value ?? ''),
        styleId: toInt(styleSelect?.value, this.defaultSelections[i].styleId),
        limitBreakLevel: toInt(lbSelect?.value, 0),
        drivePiercePercent: toInt(drivePierceSelect?.value, 0),
        startSpEquipBonus: toInt(startSpEquipSelect?.value, START_SP_EQUIP_DEFAULT),
        normalAttackBelt: String(normalAttackBeltSelect?.value ?? ''),
        initialMotivation: toInt(motivationSelect?.value, 3),
        checkedSkillIds,
      });
    }

    return {
      schemaVersion: SELECTION_SAVE_SCHEMA_VERSION,
      savedAt: new Date().toISOString(),
      partySelections,
      extras: {},
    };
  }

  applySelectionState(state) {
    const selections = Array.isArray(state?.partySelections) ? state.partySelections : [];
    let changedCount = 0;
    const warnings = [];
    for (let i = 0; i < 6; i += 1) {
      const row = selections[i];
      if (!row) {
        continue;
      }

      const characterSelect = this.root.querySelector(
        `[data-role="character-select"][data-slot="${i}"]`
      );
      if (!characterSelect) {
        continue;
      }

      const beforeCharacter = characterSelect.value;
      const requestedCharacter = String(row.characterLabel ?? '');
      if ([...characterSelect.options].some((opt) => opt.value === requestedCharacter)) {
        characterSelect.value = requestedCharacter;
      } else {
        warnings.push(`Slot ${i + 1}: character not found (${requestedCharacter})`);
      }
      this.onCharacterSelectionChanged(i, characterSelect.value);
      if (characterSelect.value !== beforeCharacter) {
        changedCount += 1;
      }

      const styleSelect = this.root.querySelector(`[data-role="style-select"][data-slot="${i}"]`);
      const beforeStyle = styleSelect?.value ?? '';
      const preferredStyleId = toInt(row.styleId, toInt(beforeStyle, 0));
      if (styleSelect && [...styleSelect.options].some((opt) => Number(opt.value) === preferredStyleId)) {
        styleSelect.value = String(preferredStyleId);
      } else if (styleSelect) {
        warnings.push(`Slot ${i + 1}: style not found (${row.styleId})`);
      }
      if ((styleSelect?.value ?? '') !== beforeStyle) {
        changedCount += 1;
      }

      const lbSelect = this.root.querySelector(`[data-role="limit-break-select"][data-slot="${i}"]`);
      const beforeLb = lbSelect?.value ?? '';
      this.populateLimitBreakSelect(i, styleSelect?.value ?? '', row.limitBreakLevel);
      if ((lbSelect?.value ?? '') !== beforeLb) {
        changedCount += 1;
      }

      const drivePierceSelect = this.root.querySelector(
        `[data-role="drive-pierce-select"][data-slot="${i}"]`
      );
      const beforeDrive = drivePierceSelect?.value ?? '';
      const requestedDrive = toInt(row.drivePiercePercent, 0);
      if (
        drivePierceSelect &&
        [...drivePierceSelect.options].some((opt) => Number(opt.value) === requestedDrive)
      ) {
        drivePierceSelect.value = String(requestedDrive);
      } else if (drivePierceSelect) {
        drivePierceSelect.value = '0';
      }
      if ((drivePierceSelect?.value ?? '') !== beforeDrive) {
        changedCount += 1;
      }
      const startSpEquipSelect = this.root.querySelector(
        `[data-role="start-sp-equip-select"][data-slot="${i}"]`
      );
      const beforeStartSpEquip = startSpEquipSelect?.value ?? '';
      const requestedStartSpEquip = toInt(row.startSpEquipBonus, START_SP_EQUIP_DEFAULT);
      if (
        startSpEquipSelect &&
        [...startSpEquipSelect.options].some((opt) => Number(opt.value) === requestedStartSpEquip)
      ) {
        startSpEquipSelect.value = String(requestedStartSpEquip);
      } else if (startSpEquipSelect) {
        startSpEquipSelect.value = String(START_SP_EQUIP_DEFAULT);
      }
      if ((startSpEquipSelect?.value ?? '') !== beforeStartSpEquip) {
        changedCount += 1;
      }
      const normalAttackBeltSelect = this.root.querySelector(
        `[data-role="normal-attack-belt-select"][data-slot="${i}"]`
      );
      const beforeNormalAttackBelt = normalAttackBeltSelect?.value ?? '';
      const requestedNormalAttackBelt = String(row.normalAttackBelt ?? '');
      if (
        normalAttackBeltSelect &&
        [...normalAttackBeltSelect.options].some((opt) => String(opt.value) === requestedNormalAttackBelt)
      ) {
        normalAttackBeltSelect.value = requestedNormalAttackBelt;
      } else if (normalAttackBeltSelect) {
        normalAttackBeltSelect.value = '';
      }
      if ((normalAttackBeltSelect?.value ?? '') !== beforeNormalAttackBelt) {
        changedCount += 1;
      }
      const motivationSelect = this.root.querySelector(
        `[data-role="motivation-select"][data-slot="${i}"]`
      );
      const beforeMotivation = motivationSelect?.value ?? '';
      const requestedMotivation = Math.max(1, Math.min(5, toInt(row.initialMotivation, 3)));
      if (
        motivationSelect &&
        [...motivationSelect.options].some((opt) => Number(opt.value) === requestedMotivation)
      ) {
        motivationSelect.value = String(requestedMotivation);
      } else if (motivationSelect) {
        motivationSelect.value = '3';
      }
      if ((motivationSelect?.value ?? '') !== beforeMotivation) {
        changedCount += 1;
      }

      this.populateSkillChecklist(i, styleSelect?.value ?? '', row.checkedSkillIds ?? []);
      this.populatePassiveList(i, styleSelect?.value ?? '');
      this.updateSlotSummary(i);
    }

    this.renderSelectionSummary();
    return { changedCount, warnings };
  }

  saveSelectionToSlot(slotIndex, options = {}) {
    const allowAutoSlot = options.allowAutoSlot === true;
    const silent = options.silent === true;
    if (!allowAutoSlot) {
      this.assertManualSelectionSlotIndex(slotIndex);
    }
    const store = this.readSelectionStore();
    store.slots[slotIndex] = this.captureSelectionState();
    this.writeSelectionStore(store);
    if (!silent) {
      this.refreshSelectionSlotOptions();
      this.renderSelectionSlotPreview(slotIndex);
      this.setStatus(`Selection saved to ${this.getSelectionSlotLabel(slotIndex)}.`);
    }
    return store.slots[slotIndex];
  }

  loadSelectionFromSlot(slotIndex) {
    this.assertManualSelectionSlotIndex(slotIndex);
    const store = this.readSelectionStore();
    const state = store.slots[slotIndex];
    if (!state) {
      this.setStatus(`Selection ${this.getSelectionSlotLabel(slotIndex)} is empty.`);
      return null;
    }

    const result = this.applySelectionState(state);
    this.refreshSelectionSlotOptions();
    this.renderSelectionSlotPreview(slotIndex);
    if (result.warnings.length > 0) {
      this.setStatus(
        `Selection loaded from ${this.getSelectionSlotLabel(slotIndex)} (changed=${result.changedCount}). Warnings: ${result.warnings.join('; ')}`
      );
    } else if (result.changedCount === 0) {
      this.setStatus(
        `Selection loaded from ${this.getSelectionSlotLabel(slotIndex)}. No visible changes (same as current selection).`
      );
    } else {
      this.setStatus(`Selection loaded from ${this.getSelectionSlotLabel(slotIndex)} (changed=${result.changedCount}).`);
    }
    return state;
  }

  clearSelectionSlot(slotIndex) {
    this.assertManualSelectionSlotIndex(slotIndex);
    const store = this.readSelectionStore();
    store.slots[slotIndex] = null;
    this.writeSelectionStore(store);
    this.refreshSelectionSlotOptions();
    this.renderSelectionSlotPreview(slotIndex);
    this.setStatus(`Selection ${this.getSelectionSlotLabel(slotIndex)} cleared.`);
  }

  refreshSelectionSlotOptions() {
    const select = this.root.querySelector('[data-role="selection-slot-select"]');
    if (!select) {
      return;
    }
    const store = this.readSelectionStore();
    for (let i = 1; i <= MANUAL_SELECTION_SLOT_COUNT; i += 1) {
      const option = select.querySelector(`option[value="${i}"]`);
      if (!option) {
        continue;
      }
      const hasData = Boolean(store.slots[i]);
      option.textContent = hasData ? `Slot ${i} (Saved)` : `Slot ${i}`;
    }
  }

  renderSelectionSlotPreview(slotIndex) {
    const output = this.root.querySelector('[data-role="selection-slot-preview"]');
    if (!output) {
      return;
    }
    const store = this.readSelectionStore();
    const state = store.slots[slotIndex];
    if (!state) {
      output.textContent =
        `${this.getSelectionSlotLabel(slotIndex)}: empty\n` +
        'localStorage保存のため、同じブラウザ/同じURLならリロード後も保持されます。';
      return;
    }

    const lines = [];
    lines.push(`${this.getSelectionSlotLabel(slotIndex)} savedAt: ${state.savedAt ?? '-'}`);
    const rows = Array.isArray(state.partySelections) ? state.partySelections : [];
    for (let i = 0; i < rows.length; i += 1) {
      const row = rows[i] ?? {};
      lines.push(
        `P${i + 1}: ${row.characterLabel ?? '-'} / style=${row.styleId ?? '-'} / ` +
        `LB=${row.limitBreakLevel ?? '-'} / Drive=${row.drivePiercePercent ?? 0}% / StartSP+${row.startSpEquipBonus ?? 0} / Belt=${formatNormalAttackBeltLabel(row.normalAttackBelt)} / Motivation=${formatMotivationLabel(row.initialMotivation ?? 3)} / skills=${Array.isArray(row.checkedSkillIds) ? row.checkedSkillIds.length : 0}`
      );
    }
    lines.push(
      'localStorage保存のため、同じブラウザ/同じURLならリロード後も保持されます。'
    );
    output.textContent = lines.join('\n');
  }

  populateStyleSelect(slotIndex, characterLabel, preferredStyleId = null) {
    const styleSelect = this.root.querySelector(
      `[data-role="style-select"][data-slot="${slotIndex}"]`
    );

    if (!styleSelect) {
      return;
    }

    const styles = this.getStylesForCharacter(characterLabel);
    styleSelect.innerHTML = '';

    for (const style of styles) {
      const option = this.doc.createElement('option');
      option.value = String(style.id);
      option.textContent = `${style.name} [${style.tier ?? '-'}]`;
      option.setAttribute('data-character-label', String(style.chara_label ?? ''));
      option.setAttribute('data-style-name', String(style.name ?? ''));
      if (preferredStyleId !== null && Number(style.id) === Number(preferredStyleId)) {
        option.selected = true;
      }
      styleSelect.appendChild(option);
    }

    if (styles.length > 0 && styleSelect.value === '') {
      styleSelect.value = String(styles[0].id);
    }
    this.updateStyleAttributeBadges(slotIndex, styleSelect.value);
  }

  updateStyleAttributeBadges(slotIndex, styleId) {
    const container = this.root.querySelector(
      `[data-role="style-attr-badges"][data-slot="${slotIndex}"]`
    );
    const style = this.dataStore.getStyleById(styleId);
    if (!style) {
      this.renderBadgeContainer(container, { elements: [], weapon: null });
      return;
    }
    const elements = toUniqueList(
      (Array.isArray(style.elements) ? style.elements : [])
        .map((v) => String(v))
        .filter((v) => v && v !== 'None')
    );
    const weapon = String(style.weapon ?? '');
    this.renderBadgeContainer(container, {
      elements,
      weapon: ['Slash', 'Stab', 'Strike'].includes(weapon) ? weapon : null,
    });
  }

  onCharacterSelectionChanged(slotIndex, characterLabel) {
    this.populateStyleSelect(slotIndex, characterLabel, null);
    const styleSelect = this.root.querySelector(
      `[data-role="style-select"][data-slot="${slotIndex}"]`
    );
    this.populateLimitBreakSelect(slotIndex, styleSelect?.value ?? '', null);
    this.populateSkillChecklist(slotIndex, styleSelect?.value ?? '');
    this.populatePassiveList(slotIndex, styleSelect?.value ?? '');
    this.updateSlotSummary(slotIndex);
    this.renderSelectionSummary();
  }

  populateLimitBreakSelect(slotIndex, styleId, preferredLevel = null) {
    const select = this.root.querySelector(
      `[data-role="limit-break-select"][data-slot="${slotIndex}"]`
    );
    if (!select) {
      return;
    }

    const style = this.dataStore.getStyleById(styleId);
    const max = this.dataStore.getStyleLimitBreakMax(style);
    const current = preferredLevel ?? select.value;
    const initial = Number.isFinite(Number(current)) ? clampLimitBreak(Number(current), max) : max;

    select.innerHTML = '';
    for (let level = 0; level <= max; level += 1) {
      const option = this.doc.createElement('option');
      option.value = String(level);
      option.textContent = `LB ${level}`;
      if (level === initial) {
        option.selected = true;
      }
      select.appendChild(option);
    }
  }

  populatePassiveList(slotIndex, styleId) {
    const container = this.root.querySelector(
      `[data-role="passive-list"][data-slot="${slotIndex}"]`
    );
    if (!container) {
      return;
    }

    const lbSelect = this.root.querySelector(
      `[data-role="limit-break-select"][data-slot="${slotIndex}"]`
    );
    const limitBreakLevel = toInt(lbSelect?.value, 0);
    const passives = this.dataStore.listPassivesByStyleId(styleId, { limitBreakLevel });
    if (passives.length === 0) {
      container.textContent = 'Passives: -';
      this.renderConditionSupportSummary(styleId, passives);
      return;
    }
    const analyzed = analyzePassiveConditionSupport(passives);
    container.textContent = `Passives: ${passives
      .map((p) => {
        const support = analyzed.perPassive.find((item) => Number(item.passiveId) === Number(p.passiveId));
        const pending = (support?.functions ?? []).filter((item) => item.tier !== 'implemented').map((item) => item.name);
        const suffix = pending.length > 0 ? ` [review: ${pending.join('/')}]` : '';
        return `${p.name}(LB${p.requiredLimitBreakLevel ?? 0})${suffix}`;
      })
      .join(', ')}`;
    this.renderConditionSupportSummary(styleId, passives);
  }

  renderConditionSupportSummary(styleId, passives = null) {
    const style = this.dataStore.getStyleById(styleId);
    const rows = [];
    const global = analyzePassiveConditionSupport(this.dataStore.passives ?? []);
    rows.push(`Global Passive Condition Support`);
    rows.push(formatConditionSupportLine('implemented', global.summary.implemented));
    rows.push(formatConditionSupportLine('ready_now', global.summary.ready_now));
    rows.push(formatConditionSupportLine('manual_state', global.summary.manual_state));
    rows.push(formatConditionSupportLine('stateful_future', global.summary.stateful_future));
    rows.push(formatConditionSupportLine('unknown', global.summary.unknown));

    const stylePassives = Array.isArray(passives)
      ? passives
      : this.dataStore.listPassivesByStyleId(styleId, { limitBreakLevel: 0 });
    const perStyle = analyzePassiveConditionSupport(stylePassives);
    rows.push('');
    rows.push(`Selected Style: ${String(style?.name ?? '-')}`);
    const reviewPassives = perStyle.perPassive.filter((item) => item.requiresReview);
    if (reviewPassives.length === 0) {
      rows.push('review_needed: -');
    } else {
      for (const item of reviewPassives) {
        const pending = item.functions
          .filter((entry) => entry.tier !== 'implemented')
          .map((entry) => `${entry.name}:${entry.tier}`);
        rows.push(`${item.passiveName}: ${pending.join(', ')}`);
      }
    }
    this.writeConditionSupportSummary(rows.join('\n'));
  }

  getCheckedSkillIdsForSlot(slotIndex) {
    const checkboxes = this.root.querySelectorAll(
      `[data-role="skill-check"][data-slot="${slotIndex}"]`
    );
    if (checkboxes.length === 0) {
      return null;
    }
    const out = [];
    for (const box of checkboxes) {
      const isRequired = box.getAttribute('data-required-skill') === 'true';
      if (!box.checked && !isRequired) {
        continue;
      }
      out.push(toInt(box.value, 0));
    }
    return out;
  }

  readSkillSetMapFromDom() {
    const out = {};
    for (let i = 0; i < 6; i += 1) {
      const selected = this.getCheckedSkillIdsForSlot(i);
      if (Array.isArray(selected)) {
        out[i] = selected;
      }
    }
    return out;
  }

  readLimitBreakMapFromDom() {
    const out = {};
    for (let i = 0; i < 6; i += 1) {
      const select = this.root.querySelector(`[data-role="limit-break-select"][data-slot="${i}"]`);
      out[i] = toInt(select?.value, START_SP_EQUIP_DEFAULT);
    }
    return out;
  }

  readDrivePierceMapFromDom() {
    const out = {};
    for (let i = 0; i < 6; i += 1) {
      const select = this.root.querySelector(`[data-role="drive-pierce-select"][data-slot="${i}"]`);
      out[i] = toInt(select?.value, 0);
    }
    return out;
  }

  readStartSpEquipMapFromDom() {
    const out = {};
    for (let i = 0; i < 6; i += 1) {
      const select = this.root.querySelector(
        `[data-role="start-sp-equip-select"][data-slot="${i}"]`
      );
      out[i] = toInt(select?.value, 0);
    }
    return out;
  }

  readNormalAttackElementsMapFromDom() {
    const out = {};
    for (let i = 0; i < 6; i += 1) {
      const select = this.root.querySelector(
        `[data-role="normal-attack-belt-select"][data-slot="${i}"]`
      );
      const value = String(select?.value ?? '').trim();
      out[i] = value ? [value] : [];
    }
    return out;
  }

  readInitialMotivationMapFromDom() {
    const out = {};
    for (let i = 0; i < 6; i += 1) {
      const select = this.root.querySelector(`[data-role="motivation-select"][data-slot="${i}"]`);
      out[i] = Math.max(1, Math.min(5, toInt(select?.value, 3)));
    }
    return out;
  }

  updateSlotSummary(slotIndex) {
    const summary = this.root.querySelector(`[data-role="slot-summary"][data-slot="${slotIndex}"]`);
    if (!summary) {
      return;
    }

    const charSelect = this.root.querySelector(
      `[data-role="character-select"][data-slot="${slotIndex}"]`
    );
    const styleSelect = this.root.querySelector(
      `[data-role="style-select"][data-slot="${slotIndex}"]`
    );
    const selectedCharacterLabel = charSelect?.value ?? '';
    const selectedStyleId = styleSelect?.value ?? '';
    const character = this.dataStore.getCharacterByLabel(selectedCharacterLabel);
    const style = this.dataStore.getStyleById(selectedStyleId);
    const selectedSkillIds = this.getCheckedSkillIdsForSlot(slotIndex) ?? [];
    const lbSelect = this.root.querySelector(
      `[data-role="limit-break-select"][data-slot="${slotIndex}"]`
    );
    const limitBreakLevel = toInt(lbSelect?.value, 0);
    const passives = this.dataStore.listPassivesByStyleId(selectedStyleId, { limitBreakLevel });
    const drivePierceSelect = this.root.querySelector(
      `[data-role="drive-pierce-select"][data-slot="${slotIndex}"]`
    );
    const drivePiercePercent = toInt(drivePierceSelect?.value, 0);
    const startSpEquipSelect = this.root.querySelector(
      `[data-role="start-sp-equip-select"][data-slot="${slotIndex}"]`
    );
    const startSpEquipBonus = toInt(startSpEquipSelect?.value, START_SP_EQUIP_DEFAULT);
    const normalAttackBeltSelect = this.root.querySelector(
      `[data-role="normal-attack-belt-select"][data-slot="${slotIndex}"]`
    );
    const normalAttackBelt = String(normalAttackBeltSelect?.value ?? '').trim();
    const motivationSelect = this.root.querySelector(
      `[data-role="motivation-select"][data-slot="${slotIndex}"]`
    );
    const initialMotivation = Math.max(1, Math.min(5, toInt(motivationSelect?.value, 3)));
    const startSp = START_SP_BASE + START_SP_FIXED_BONUS + startSpEquipBonus;

    const charName = normalizeName(character?.name ?? selectedCharacterLabel);
    summary.textContent =
      `Character: ${charName} / Style: ${style?.name ?? '-'} / ` +
      `LB: ${limitBreakLevel} / DrivePierce: ${drivePiercePercent}% / 通常攻撃属性: ${formatNormalAttackBeltLabel(normalAttackBelt)} / やる気初期値: ${formatMotivationLabel(initialMotivation)} / StartSP(base): ${startSp} (${START_SP_BASE}+${START_SP_FIXED_BONUS}+${startSpEquipBonus}, passive別反映) / Equipped Skills: ${selectedSkillIds.length} / Passives: ${passives.length}`;
  }

  renderSelectionSummary() {
    const container = this.root.querySelector('[data-role="selection-summary"]');
    if (!container) {
      return;
    }

    const lines = [];
    for (let i = 0; i < 6; i += 1) {
      const charSelect = this.root.querySelector(
        `[data-role="character-select"][data-slot="${i}"]`
      );
      const styleSelect = this.root.querySelector(`[data-role="style-select"][data-slot="${i}"]`);

      const character = this.dataStore.getCharacterByLabel(charSelect?.value ?? '');
      const style = this.dataStore.getStyleById(styleSelect?.value ?? '');
      const motivationSelect = this.root.querySelector(
        `[data-role="motivation-select"][data-slot="${i}"]`
      );
      const motivation = Math.max(1, Math.min(5, toInt(motivationSelect?.value, 3)));

      lines.push(
        `Slot ${i + 1}: ${normalizeName(character?.name ?? charSelect?.value)} / ${style?.name ?? '-'} / やる気=${formatMotivationLabel(motivation)}`
      );
    }

    container.textContent = lines.join(' | ');
  }

  readStyleIdsFromDom() {
    const ids = [];
    for (let i = 0; i < 6; i += 1) {
      const select = this.root.querySelector(`[data-role="style-select"][data-slot="${i}"]`);
      const fallback = this.defaultSelections[i].styleId;
      ids.push(toInt(select?.value, fallback));
    }
    return ids;
  }

  readInitialOdGaugeFromDom() {
    const input = this.root.querySelector('[data-role="initial-od-gauge"]');
    const raw = Number.parseFloat(String(input?.value ?? '0'));
    if (!Number.isFinite(raw)) {
      return 0;
    }
    return Math.max(OD_GAUGE_MIN_PERCENT, Math.min(OD_GAUGE_MAX_PERCENT, raw));
  }

  initializeBattle(styleIds = this.readStyleIdsFromDom(), options = {}) {
    const skillSetsByPartyIndex = options.skillSetsByPartyIndex ?? this.readSkillSetMapFromDom();
    const limitBreakLevelsByPartyIndex =
      options.limitBreakLevelsByPartyIndex ?? this.readLimitBreakMapFromDom();
    const drivePierceByPartyIndex =
      options.drivePierceByPartyIndex ?? this.readDrivePierceMapFromDom();
    const normalAttackElementsByPartyIndex =
      options.normalAttackElementsByPartyIndex ?? this.readNormalAttackElementsMapFromDom();
    const initialMotivationByPartyIndex =
      options.initialMotivationByPartyIndex ?? this.readInitialMotivationMapFromDom();
    const startSpEquipByPartyIndex =
      options.startSpEquipByPartyIndex ?? this.readStartSpEquipMapFromDom();
    const initialOdGauge =
      options.initialOdGauge ?? (options.skipInitialOdRead ? 0 : this.readInitialOdGaugeFromDom());
    const enemyNamesByEnemy =
      options.enemyNamesByEnemy ?? normalizeEnemyNamesByEnemy(this.state?.turnState?.enemyState?.enemyNamesByEnemy);
    const damageRatesByEnemy =
      options.damageRatesByEnemy ??
      normalizeEnemyDamageRatesByEnemy(this.state?.turnState?.enemyState?.damageRatesByEnemy);
    const enemyStatuses =
      options.enemyStatuses ??
      (Array.isArray(this.state?.turnState?.enemyState?.statuses)
        ? this.state.turnState.enemyState.statuses.map((status) => ({
            statusType: String(status?.statusType ?? ''),
            targetIndex: Number(status?.targetIndex ?? 0),
            remainingTurns: Number(status?.remainingTurns ?? 0),
          }))
        : []);
    const enemyZoneConfigByEnemy =
      options.enemyZoneConfigByEnemy ??
      normalizeEnemyZoneConfigByEnemy(this.state?.turnState?.enemyState?.zoneConfigByEnemy);
    const zoneState =
      options.zoneState ?? normalizeFieldStateForScenario(this.state?.turnState?.zoneState);
    const territoryState =
      options.territoryState ?? normalizeFieldStateForScenario(this.state?.turnState?.territoryState);
    const preserveTurnPlans = options.preserveTurnPlans === true;
    this.initializeBattleState({
      styleIds,
      skillSetsByPartyIndex,
      limitBreakLevelsByPartyIndex,
      drivePierceByPartyIndex,
      normalAttackElementsByPartyIndex,
      initialMotivationByPartyIndex,
      startSpEquipByPartyIndex,
      initialOdGauge,
      enemyCount: this.readEnemyCountFromDom(),
      enemyNamesByEnemy,
      damageRatesByEnemy,
      enemyStatuses,
      enemyZoneConfigByEnemy,
      zoneState,
      territoryState,
      preserveTurnPlans,
      forceOdToggle: this.isForceOdEnabled(),
    });

    this.renderActionSelectors();
    this.renderPartyState();
    this.renderSwapSelectors();
    this.renderTurnStatus();
    this.renderEnemyStatusControls();
    this.renderEnemyConfigControls();
    this.renderKishinkaControls();
    this.renderRecordTable();
    this.renderTurnPlanEditControls();
    this.writePreviewOutput('');
    this.writeConditionSupportSummary('');
    this.writeCsvOutput('');
    this.writeRecordsJsonOutput('');
    this.writePassiveLogOutput('');
    this.renderOdControls();
    this.renderScenarioStatus();
    if (!options.suppressAutoSave) {
      this.saveSelectionToSlot(AUTO_SAVE_SLOT_INDEX, { allowAutoSlot: true, silent: true });
    }
    if (!options.silent) {
      this.setStatus('Battle initialized. Selection auto-saved to Auto Slot 0.');
    }

    return this.state;
  }

  appendPassiveLogEvents(events = []) {
    const normalized = (Array.isArray(events) ? events : [])
      .filter((event) => event && typeof event === 'object')
      .map((event) => ({
        turnLabel: String(event.turnLabel ?? ''),
        characterName: String(event.characterName ?? event.characterId ?? ''),
        passiveDesc: String(event.passiveDesc ?? event.passiveName ?? ''),
      }))
      .filter((event) => event.turnLabel && event.characterName && event.passiveDesc);
    if (normalized.length === 0) {
      return;
    }
    this.passiveLogEntries.push(...normalized);
    this.writePassiveLogOutput(this.passiveLogEntries.map((event) => formatPassiveLogLine(event)).join('\n'));
  }

  renderActionSelectors() {
    const container = this.root.querySelector('[data-role="action-slots"]');
    if (!container || !this.party) {
      return;
    }

    const previousSelection = new Map(this.lastActionSkillByPosition);
    for (const oldSelect of container.querySelectorAll('[data-action-slot]')) {
      const position = toInt(oldSelect.getAttribute('data-action-slot'), -1);
      if (position >= 0) {
        previousSelection.set(position, toInt(oldSelect.value, 0));
      }
    }
    container.innerHTML = '';

    const actionableMembers = this.getActionableFrontlineMembers();
    for (const member of actionableMembers) {
      const wrapper = this.doc.createElement('label');
      wrapper.className = 'action-slot';
      wrapper.textContent = `Pos ${member.position + 1} (${member.characterName}) `;

      const select = this.doc.createElement('select');
      select.setAttribute('data-action-slot', String(member.position));

      if (member.skills.length === 0) {
        const option = this.doc.createElement('option');
        option.value = '';
        option.textContent = '(No equipped skills)';
        option.disabled = true;
        option.selected = true;
        select.appendChild(option);
      }

      for (const skill of member.getActionSkills()) {
        const option = this.doc.createElement('option');
        option.value = String(skill.skillId);
        const costLabel = formatSkillCostLabel(skill, member, this.state);
        const hitLabel = formatSkillHitLabel(skill, member, this.state);
        option.textContent = `${skill.name} (${costLabel} / Hit ${hitLabel})`;
        select.appendChild(option);
      }

      const preferredSkillId = previousSelection.get(member.position);
      if (
        Number.isFinite(Number(preferredSkillId)) &&
        [...select.options].some((option) => Number(option.value) === Number(preferredSkillId))
      ) {
        select.value = String(preferredSkillId);
      }
      this.lastActionSkillByPosition.set(member.position, toInt(select.value, 0));

      const targetSelect = this.doc.createElement('select');
      targetSelect.setAttribute('data-action-target-slot', String(member.position));
      targetSelect.style.display = 'none';

      const skillAttrBadges = this.doc.createElement('span');
      skillAttrBadges.setAttribute('data-role', 'action-skill-attr-badges');
      skillAttrBadges.setAttribute('data-position', String(member.position));
      skillAttrBadges.className = 'attr-badge-row';
      wrapper.appendChild(skillAttrBadges);
      wrapper.appendChild(select);
      wrapper.appendChild(targetSelect);
      container.appendChild(wrapper);
      this.updateActionSkillAttributeBadges(member.position, toInt(select.value, 0));
      this.updateActionTargetSelector(member.position, toInt(select.value, 0));
    }

    if (actionableMembers.length === 0) {
      const note = this.doc.createElement('div');
      note.textContent = 'No actionable front members in current turn state.';
      container.appendChild(note);
    }
  }

  updateActionSkillAttributeBadges(position, skillId) {
    const container = this.root.querySelector(
      `[data-role="action-skill-attr-badges"][data-position="${position}"]`
    );
    if (!container || !this.party) {
      return;
    }
    const member = this.party.getByPosition(position);
    const skill = member?.getSkill(skillId);
    if (!member || !skill) {
      this.renderBadgeContainer(container, { elements: [], weapon: null });
      return;
    }
    const effectiveSkill = resolveEffectiveSkillForAction(this.state, member, skill);
    const attrs = extractSkillAttributes(effectiveSkill, {
      normalAttackElements: isNormalAttackSkill(effectiveSkill) ? member.normalAttackElements : [],
    });
    this.renderBadgeContainer(container, attrs);
  }

  resolveActionTargetConfig(member, skill) {
    if (!member || !skill) {
      return null;
    }

    const parts = Array.isArray(skill.parts) ? skill.parts : [];
    for (const part of parts) {
      const targetType = String(part?.target_type ?? '');
      if (targetType !== 'AllySingle' && targetType !== 'AllySingleWithoutSelf') {
        continue;
      }

      const targetCondition = String(part?.target_condition ?? '').replace(/\s+/g, '');
      const allies = this.state?.party?.slice().sort((a, b) => a.position - b.position);
      const candidates = (allies ?? []).filter((candidate) =>
        (targetType === 'AllySingleWithoutSelf'
          ? candidate.characterId !== member.characterId
          : true) &&
        (targetCondition === 'IsFront()==1'
          ? candidate.position <= 2
          : targetCondition === 'IsFront()==0'
            ? candidate.position >= 3
            : true)
      );

      if (candidates.length === 0) {
        return null;
      }

      return { targetType, candidates, kind: 'ally' };
    }

    const enemyCount = this.readEnemyCountFromDom();
    if (enemyCount > 1 && String(skill?.targetType ?? '') === 'Single') {
      const parts = Array.isArray(skill.parts) ? skill.parts : [];
      const hasEnemySingleDamage = parts.some((part) => {
        const skillType = String(part?.skill_type ?? '');
        return (
          ['AttackNormal', 'AttackSkill', 'DamageRateChangeAttackSkill', 'PenetrationCriticalAttack'].includes(skillType) &&
          String(part?.target_type ?? skill?.targetType ?? '') === 'Single'
        );
      });
      if (hasEnemySingleDamage) {
        return {
          targetType: 'EnemySingle',
          kind: 'enemy',
          candidates: Array.from({ length: enemyCount }, (_, index) => ({
            targetEnemyIndex: index,
            label: `Target: Enemy ${index + 1}`,
          })),
        };
      }
    }

    return null;
  }

  updateActionTargetSelector(position, skillId) {
    const targetSelect = this.root.querySelector(`[data-action-target-slot="${position}"]`);
    if (!targetSelect || !this.party) {
      return;
    }

    const member = this.party.getByPosition(position);
    const skill = member?.getSkill(skillId);
    const effectiveSkill = resolveEffectiveSkillForAction(this.state, member, skill);
    const config = this.resolveActionTargetConfig(member, effectiveSkill);

    targetSelect.innerHTML = '';
    if (!config) {
      targetSelect.style.display = 'none';
      this.lastActionTargetByPosition.delete(position);
      return;
    }

    for (const candidate of config.candidates) {
      const option = this.doc.createElement('option');
      if (config.kind === 'enemy') {
        option.value = `enemy:${candidate.targetEnemyIndex}`;
        option.textContent = candidate.label;
      } else {
        option.value = `ally:${candidate.characterId}`;
        option.textContent = `Target: Pos ${candidate.position + 1} (${candidate.characterName})`;
      }
      targetSelect.appendChild(option);
    }

    const preferred = this.lastActionTargetByPosition.get(position);
    if (
      preferred &&
      [...targetSelect.options].some((option) => String(option.value) === String(preferred))
    ) {
      targetSelect.value = String(preferred);
    }
    this.lastActionTargetByPosition.set(position, String(targetSelect.value));
    targetSelect.style.display = '';
  }

  getActionableFrontlineMembers() {
    if (!this.party || !this.state) {
      return [];
    }

    const frontline = this.party.getFrontline();
    const turnState = this.state.turnState;
    if (turnState.turnType !== 'extra' || !turnState.extraTurnState) {
      return frontline;
    }

    const allowed = new Set(turnState.extraTurnState.allowedCharacterIds ?? []);
    return frontline.filter((member) => allowed.has(member.characterId));
  }

  collectActionDictFromDom() {
    if (!this.party) {
      throw new Error('Party is not initialized.');
    }

    const actionDict = {};
    for (const member of this.getActionableFrontlineMembers()) {
      const select = this.root.querySelector(`[data-action-slot="${member.position}"]`);
      const actionSkills = member.getActionSkills();
      const fallbackSkill = actionSkills[0];
      if (!fallbackSkill) {
        throw new Error(`No equipped skills for position ${member.position + 1}.`);
      }
      const skillId = toInt(select?.value, fallbackSkill?.skillId ?? 0);
      const targetSelect = this.root.querySelector(
        `[data-action-target-slot="${member.position}"]`
      );
      const targetValue =
        targetSelect && targetSelect.style.display !== 'none'
          ? String(targetSelect.value ?? '').trim()
          : '';
      const targetCharacterId = targetValue.startsWith('ally:') ? targetValue.slice('ally:'.length) : '';
      const targetEnemyIndex =
        targetValue.startsWith('enemy:') ? Math.max(0, toInt(targetValue.slice('enemy:'.length), 0)) : null;
      actionDict[String(member.position)] = {
        characterId: member.characterId,
        skillId,
        ...(targetCharacterId ? { targetCharacterId } : {}),
        ...(Number.isFinite(Number(targetEnemyIndex)) ? { targetEnemyIndex: Number(targetEnemyIndex) } : {}),
      };
    }

    return actionDict;
  }

  readEnemyCountFromDom() {
    const select = this.root.querySelector('[data-role="enemy-count"]');
    return clampEnemyCount(toInt(select?.value, DEFAULT_ENEMY_COUNT));
  }

  syncEnemyStateFromDom() {
    if (!this.state?.turnState) {
      return;
    }
    const enemyCount = this.readEnemyCountFromDom();
    const current = this.state.turnState.enemyState ?? {
      enemyCount: DEFAULT_ENEMY_COUNT,
      statuses: [],
      damageRatesByEnemy: {},
      enemyNamesByEnemy: {},
      zoneConfigByEnemy: {},
    };
    const statuses = Array.isArray(current.statuses)
      ? current.statuses
        .filter((status) => isEnemyStatusActive(status))
        .filter((status) => Number(status?.targetIndex ?? -1) >= 0)
        .filter((status) => Number(status?.targetIndex ?? -1) < enemyCount)
        .map((status) => normalizeEnemyStatusForUi(status))
      : [];
    const damageRatesByEnemy = normalizeEnemyDamageRatesByEnemy(current.damageRatesByEnemy);
    const enemyNamesByEnemy = normalizeEnemyNamesByEnemy(current.enemyNamesByEnemy);
    const zoneConfigByEnemy = normalizeEnemyZoneConfigByEnemy(current.zoneConfigByEnemy);
    this.state.turnState.enemyState = {
      enemyCount,
      statuses,
      damageRatesByEnemy,
      enemyNamesByEnemy,
      zoneConfigByEnemy,
    };
  }

  getEnemyStatuses() {
    const state = this.state?.turnState?.enemyState;
    return Array.isArray(state?.statuses) ? state.statuses : [];
  }

  getEnemyDisplayName(targetIndex, enemyNamesByEnemy = null) {
    const source =
      enemyNamesByEnemy && typeof enemyNamesByEnemy === 'object'
        ? enemyNamesByEnemy
        : this.state?.turnState?.enemyState?.enemyNamesByEnemy;
    const rawName = String(source?.[String(targetIndex)] ?? source?.[targetIndex] ?? '').trim();
    return rawName ? `Enemy ${targetIndex + 1} (${rawName})` : `Enemy ${targetIndex + 1}`;
  }

  renderEnemyConfigControls() {
    const container = this.root.querySelector('[data-role="enemy-config-list"]');
    if (!container) {
      return;
    }
    const enemyCount = this.readEnemyCountFromDom();
    const enemyNamesByEnemy = normalizeEnemyNamesByEnemy(this.state?.turnState?.enemyState?.enemyNamesByEnemy);
    const damageRatesByEnemy = normalizeEnemyDamageRatesByEnemy(this.state?.turnState?.enemyState?.damageRatesByEnemy);
    const zoneConfigByEnemy = normalizeEnemyZoneConfigByEnemy(this.state?.turnState?.enemyState?.zoneConfigByEnemy);
    container.innerHTML = '';

    for (let i = 0; i < enemyCount; i += 1) {
      const row = this.doc.createElement('div');
      row.className = 'row';

      const title = this.doc.createElement('strong');
      title.textContent = `Enemy ${i + 1}`;
      row.appendChild(title);

      const nameLabel = this.doc.createElement('label');
      nameLabel.textContent = '名前 ';
      const nameInput = this.doc.createElement('input');
      nameInput.type = 'text';
      nameInput.value = String(enemyNamesByEnemy[String(i)] ?? '');
      nameInput.setAttribute('data-role', 'enemy-name-input');
      nameInput.setAttribute('data-enemy-index', String(i));
      nameInput.placeholder = `Enemy ${i + 1}`;
      nameLabel.appendChild(nameInput);
      row.appendChild(nameLabel);

      const enemyRates = damageRatesByEnemy[String(i)] ?? {};
      const zoneConfig = zoneConfigByEnemy[String(i)] ?? { enabled: false, type: 'Fire', remainingTurns: 8 };
      for (const field of ENEMY_DAMAGE_RATE_FIELDS) {
        const label = this.doc.createElement('label');
        label.textContent = `${field.label} `;
        const input = this.doc.createElement('input');
        input.type = 'number';
        input.step = '1';
        input.min = '0';
        input.value = String(
          Number.isFinite(Number(enemyRates[field.key]))
            ? Number(enemyRates[field.key])
            : DEFAULT_ENEMY_DAMAGE_RATE_UI_VALUE
        );
        input.setAttribute('data-role', 'enemy-damage-rate-input');
        input.setAttribute('data-enemy-index', String(i));
        input.setAttribute('data-damage-key', field.key);
        label.appendChild(input);
        row.appendChild(label);
      }

      const zoneEnabledLabel = this.doc.createElement('label');
      const zoneEnabled = this.doc.createElement('input');
      zoneEnabled.type = 'checkbox';
      zoneEnabled.checked = Boolean(zoneConfig.enabled);
      zoneEnabled.setAttribute('data-role', 'enemy-zone-enabled');
      zoneEnabled.setAttribute('data-enemy-index', String(i));
      zoneEnabledLabel.appendChild(zoneEnabled);
      zoneEnabledLabel.append(' フィールド持ち');
      row.appendChild(zoneEnabledLabel);

      const zoneTypeLabel = this.doc.createElement('label');
      zoneTypeLabel.textContent = '属性 ';
      const zoneTypeSelect = this.doc.createElement('select');
      zoneTypeSelect.setAttribute('data-role', 'enemy-zone-type');
      zoneTypeSelect.setAttribute('data-enemy-index', String(i));
      for (const optionConfig of ENEMY_ZONE_TYPE_OPTIONS) {
        const option = this.doc.createElement('option');
        option.value = optionConfig.value;
        option.textContent = optionConfig.label;
        zoneTypeSelect.appendChild(option);
      }
      zoneTypeSelect.value = zoneConfig.type || 'Fire';
      zoneTypeLabel.appendChild(zoneTypeSelect);
      row.appendChild(zoneTypeLabel);

      const zoneTurnsLabel = this.doc.createElement('label');
      zoneTurnsLabel.textContent = 'T ';
      const zoneTurnsInput = this.doc.createElement('input');
      zoneTurnsInput.type = 'number';
      zoneTurnsInput.min = '1';
      zoneTurnsInput.step = '1';
      zoneTurnsInput.value = String(zoneConfig.remainingTurns === null ? 8 : Number(zoneConfig.remainingTurns ?? 8));
      zoneTurnsInput.setAttribute('data-role', 'enemy-zone-turns');
      zoneTurnsInput.setAttribute('data-enemy-index', String(i));
      zoneTurnsLabel.appendChild(zoneTurnsInput);
      row.appendChild(zoneTurnsLabel);

      container.appendChild(row);
    }
    this.renderEnemyZoneControls();
  }

  renderEnemyZoneControls() {
    const container = this.root.querySelector('[data-role="enemy-zone-controls"]');
    const sourceSelect = this.root.querySelector('[data-role="enemy-zone-source"]');
    if (!container || !sourceSelect) {
      return;
    }
    const zoneConfigByEnemy = normalizeEnemyZoneConfigByEnemy(this.state?.turnState?.enemyState?.zoneConfigByEnemy);
    const enabledEntries = Object.entries(zoneConfigByEnemy).filter(([, config]) => Boolean(config?.enabled));
    container.hidden = enabledEntries.length === 0;
    sourceSelect.innerHTML = '';
    for (const [targetIndex] of enabledEntries) {
      const option = this.doc.createElement('option');
      option.value = String(targetIndex);
      option.textContent = this.getEnemyDisplayName(Number(targetIndex));
      sourceSelect.appendChild(option);
    }
  }

  renderEnemyStatusControls() {
    const targetSelect = this.root.querySelector('[data-role="enemy-status-target"]');
    const list = this.root.querySelector('[data-role="enemy-status-list"]');
    const enemyCount = this.readEnemyCountFromDom();
    const enemyNamesByEnemy = normalizeEnemyNamesByEnemy(this.state?.turnState?.enemyState?.enemyNamesByEnemy);

    if (targetSelect) {
      const prev = String(targetSelect.value ?? '');
      targetSelect.innerHTML = '';
      for (let i = 0; i < enemyCount; i += 1) {
        const option = this.doc.createElement('option');
        option.value = String(i);
        option.textContent = this.getEnemyDisplayName(i, enemyNamesByEnemy);
        targetSelect.appendChild(option);
      }
      const hasPrev = [...targetSelect.options].some((option) => option.value === prev);
      targetSelect.value = hasPrev ? prev : '0';
    }

    if (list) {
      const statuses = this.getEnemyStatuses()
        .filter((status) => isEnemyStatusActive(status))
        .sort((a, b) => Number(a.targetIndex) - Number(b.targetIndex));
      if (statuses.length === 0) {
        list.textContent = 'Enemy Status: -';
      } else {
        const text = statuses
          .map((status) => {
            const suffix = isPersistentEnemyStatus(status.statusType)
              ? ''
              : `(${Number(status.remainingTurns)})`;
            return `${this.getEnemyDisplayName(Number(status.targetIndex), enemyNamesByEnemy)}: ${String(status.statusType)}${suffix}`;
          })
          .join(' | ');
        list.textContent = `Enemy Status: ${text}`;
      }
    }
  }

  applyEnemyNameFromDom(targetIndex, value) {
    if (!this.state?.turnState) {
      return;
    }
    this.syncEnemyStateFromDom();
    const enemyCount = this.readEnemyCountFromDom();
    if (targetIndex < 0 || targetIndex >= enemyCount) {
      return;
    }
    const next = normalizeEnemyNamesByEnemy(this.state.turnState.enemyState?.enemyNamesByEnemy);
    const trimmed = String(value ?? '').trim();
    if (trimmed) {
      next[String(targetIndex)] = trimmed;
    } else {
      delete next[String(targetIndex)];
    }
    this.state.turnState.enemyState = {
      enemyCount,
      statuses: Array.isArray(this.state.turnState.enemyState?.statuses) ? this.state.turnState.enemyState.statuses : [],
      damageRatesByEnemy: normalizeEnemyDamageRatesByEnemy(this.state.turnState.enemyState?.damageRatesByEnemy),
      enemyNamesByEnemy: next,
      zoneConfigByEnemy: normalizeEnemyZoneConfigByEnemy(this.state.turnState.enemyState?.zoneConfigByEnemy),
    };
    this.renderEnemyStatusControls();
    this.renderEnemyConfigControls();
    this.renderRecordTable();
  }

  applyEnemyDamageRateFromDom(targetIndex, damageKey, rawValue) {
    if (!this.state?.turnState) {
      return;
    }
    this.syncEnemyStateFromDom();
    const enemyCount = this.readEnemyCountFromDom();
    if (targetIndex < 0 || targetIndex >= enemyCount) {
      return;
    }
    const nextRates = normalizeEnemyDamageRatesByEnemy(this.state.turnState.enemyState?.damageRatesByEnemy);
    const enemyRates = { ...(nextRates[String(targetIndex)] ?? {}) };
    const parsed = Number(rawValue);
    enemyRates[String(damageKey)] = Number.isFinite(parsed) ? parsed : DEFAULT_ENEMY_DAMAGE_RATE_UI_VALUE;
    nextRates[String(targetIndex)] = enemyRates;
    this.state.turnState.enemyState = {
      enemyCount,
      statuses: Array.isArray(this.state.turnState.enemyState?.statuses) ? this.state.turnState.enemyState.statuses : [],
      damageRatesByEnemy: nextRates,
      enemyNamesByEnemy: normalizeEnemyNamesByEnemy(this.state.turnState.enemyState?.enemyNamesByEnemy),
      zoneConfigByEnemy: normalizeEnemyZoneConfigByEnemy(this.state.turnState.enemyState?.zoneConfigByEnemy),
    };
    this.previewRecord = null;
    this.resetInterruptOdProjection({ clearReservation: true });
    this.writePreviewOutput('');
    this.renderActionSelectors();
    this.renderEnemyStatusControls();
    this.renderEnemyConfigControls();
    this.renderOdControls();
  }

  applyEnemyStatusFromDom() {
    if (!this.state?.turnState) {
      throw new Error('State is not initialized.');
    }
    this.syncEnemyStateFromDom();

    const typeSelect = this.root.querySelector('[data-role="enemy-status-type"]');
    const turnsInput = this.root.querySelector('[data-role="enemy-status-turns"]');
    const targetSelect = this.root.querySelector('[data-role="enemy-status-target"]');
    const statusType = String(typeSelect?.value ?? ENEMY_STATUS_DOWN_TURN);
    const remainingTurns = Math.max(1, toInt(turnsInput?.value, 1));
    const targetIndex = Math.max(
      0,
      Math.min(this.readEnemyCountFromDom() - 1, toInt(targetSelect?.value, 0))
    );

    const nextStatuses = this.getEnemyStatuses()
      .filter((status) => {
        const currentType = String(status?.statusType ?? '');
        const currentTarget = Number(status?.targetIndex ?? -1);
        if (currentTarget !== targetIndex) {
          return true;
        }
        if (statusType === ENEMY_STATUS_DEAD) {
          return false;
        }
        if (statusType === ENEMY_STATUS_DOWN_TURN) {
          return currentType !== ENEMY_STATUS_DOWN_TURN && currentType !== ENEMY_STATUS_BREAK;
        }
        return currentType !== statusType;
      })
      .map((status) => normalizeEnemyStatusForUi(status));

    if (statusType === ENEMY_STATUS_DOWN_TURN) {
      nextStatuses.push({
        statusType: ENEMY_STATUS_BREAK,
        targetIndex,
        remainingTurns: 0,
      });
    }
    nextStatuses.push({
      statusType,
      targetIndex,
      remainingTurns: isPersistentEnemyStatus(statusType) ? 0 : remainingTurns,
    });
    this.state.turnState.enemyState = {
      enemyCount: this.readEnemyCountFromDom(),
      statuses: nextStatuses,
      damageRatesByEnemy: normalizeEnemyDamageRatesByEnemy(this.state.turnState.enemyState?.damageRatesByEnemy),
      enemyNamesByEnemy: normalizeEnemyNamesByEnemy(this.state.turnState.enemyState?.enemyNamesByEnemy),
      zoneConfigByEnemy: normalizeEnemyZoneConfigByEnemy(this.state.turnState.enemyState?.zoneConfigByEnemy),
    };
    this.previewRecord = null;
    this.resetInterruptOdProjection({ clearReservation: true });
    this.writePreviewOutput('');
    this.renderActionSelectors();
    this.renderEnemyStatusControls();
    this.renderOdControls();
    this.setStatus(`Enemy ${targetIndex + 1} に ${statusType}(${remainingTurns}) を付与しました。`);
  }

  clearEnemyStatusFromDom() {
    if (!this.state?.turnState) {
      throw new Error('State is not initialized.');
    }
    this.syncEnemyStateFromDom();

    const typeSelect = this.root.querySelector('[data-role="enemy-status-type"]');
    const targetSelect = this.root.querySelector('[data-role="enemy-status-target"]');
    const statusType = String(typeSelect?.value ?? ENEMY_STATUS_DOWN_TURN);
    const targetIndex = Math.max(
      0,
      Math.min(this.readEnemyCountFromDom() - 1, toInt(targetSelect?.value, 0))
    );

    const nextStatuses = this.getEnemyStatuses().filter(
      (status) => {
        const currentType = String(status?.statusType ?? '');
        const currentTarget = Number(status?.targetIndex ?? -1);
        if (currentTarget !== targetIndex) {
          return true;
        }
        if (statusType === ENEMY_STATUS_DEAD) {
          return currentType !== ENEMY_STATUS_DEAD;
        }
        if (statusType === ENEMY_STATUS_BREAK) {
          return currentType !== ENEMY_STATUS_BREAK && currentType !== ENEMY_STATUS_DOWN_TURN;
        }
        return currentType !== statusType;
      }
    );
    this.state.turnState.enemyState = {
      enemyCount: this.readEnemyCountFromDom(),
      statuses: nextStatuses,
      damageRatesByEnemy: normalizeEnemyDamageRatesByEnemy(this.state.turnState.enemyState?.damageRatesByEnemy),
      enemyNamesByEnemy: normalizeEnemyNamesByEnemy(this.state.turnState.enemyState?.enemyNamesByEnemy),
      zoneConfigByEnemy: normalizeEnemyZoneConfigByEnemy(this.state.turnState.enemyState?.zoneConfigByEnemy),
    };
    this.previewRecord = null;
    this.resetInterruptOdProjection({ clearReservation: true });
    this.writePreviewOutput('');
    this.renderActionSelectors();
    this.renderEnemyStatusControls();
    this.renderOdControls();
    this.renderEnemyZoneControls();
    this.setStatus(`Enemy ${targetIndex + 1} の ${statusType} を解除しました。`);
  }

  applyEnemyZoneConfigFromDom(targetIndex, patch = {}) {
    if (!this.state?.turnState) {
      return;
    }
    this.syncEnemyStateFromDom();
    const enemyCount = this.readEnemyCountFromDom();
    if (targetIndex < 0 || targetIndex >= enemyCount) {
      return;
    }
    const next = normalizeEnemyZoneConfigByEnemy(this.state.turnState.enemyState?.zoneConfigByEnemy);
    const current = next[String(targetIndex)] ?? { enabled: false, type: 'Fire', remainingTurns: 8 };
    next[String(targetIndex)] = {
      enabled: patch.enabled !== undefined ? Boolean(patch.enabled) : Boolean(current.enabled),
      type: patch.type !== undefined ? String(patch.type ?? '') : String(current.type ?? 'Fire'),
      remainingTurns:
        patch.remainingTurns !== undefined
          ? (patch.remainingTurns === null ? null : Math.max(1, toInt(patch.remainingTurns, 8)))
          : current.remainingTurns,
    };
    this.state.turnState.enemyState = {
      enemyCount,
      statuses: Array.isArray(this.state.turnState.enemyState?.statuses) ? this.state.turnState.enemyState.statuses : [],
      damageRatesByEnemy: normalizeEnemyDamageRatesByEnemy(this.state.turnState.enemyState?.damageRatesByEnemy),
      enemyNamesByEnemy: normalizeEnemyNamesByEnemy(this.state.turnState.enemyState?.enemyNamesByEnemy),
      zoneConfigByEnemy: next,
    };
    this.renderEnemyConfigControls();
    this.renderEnemyZoneControls();
  }

  applyEnemyZoneFromDom() {
    if (!this.state?.turnState) {
      throw new Error('State is not initialized.');
    }
    const sourceSelect = this.root.querySelector('[data-role="enemy-zone-source"]');
    const targetIndex = Math.max(0, toInt(sourceSelect?.value, 0));
    const zoneConfigByEnemy = normalizeEnemyZoneConfigByEnemy(this.state.turnState.enemyState?.zoneConfigByEnemy);
    const config = zoneConfigByEnemy[String(targetIndex)];
    if (!config?.enabled || !config?.type) {
      throw new Error('敵フィールド設定がありません。');
    }
    this.state.turnState.zoneState = {
      type: String(config.type),
      sourceSide: 'enemy',
      remainingTurns: config.remainingTurns === undefined ? 8 : config.remainingTurns,
    };
    this.previewRecord = null;
    this.resetInterruptOdProjection({ clearReservation: true });
    this.writePreviewOutput('');
    this.renderTurnStatus();
    this.setStatus(`${this.getEnemyDisplayName(targetIndex)} が ${config.type} フィールドを展開しました。`);
  }

  applyTokenDebugValueFromDom(characterId, rawValue) {
    if (!this.state?.party) {
      return;
    }
    const member = this.state.party.find((item) => String(item.characterId) === String(characterId));
    if (!member?.tokenState) {
      return;
    }
    const parsed = Number(rawValue);
    const min = Number(member.tokenState.min ?? 0);
    const max = Number(member.tokenState.max ?? 10);
    const normalized = Number.isFinite(parsed) ? Math.max(min, Math.min(max, Math.trunc(parsed))) : min;
    member.tokenState.current = normalized;
    this.previewRecord = null;
    this.resetInterruptOdProjection({ clearReservation: true });
    this.writePreviewOutput('');
    this.renderPartyState();
    this.setStatus(`${member.characterName} のトークンを ${normalized} に更新しました。`);
  }

  queueSwap(fromPositionIndex, toPositionIndex) {
    const result = this.queueSwapInState(fromPositionIndex, toPositionIndex);
    if (result?.skippedSamePosition) {
      this.setStatus('Swap skipped: same position.');
      return null;
    }
    this.resetInterruptOdProjection({ clearReservation: true });
    this.writePreviewOutput('');
    this.renderActionSelectors();
    this.renderPartyState();
    this.renderSwapSelectors();
    this.renderOdControls();
    this.setStatus(`Swap applied: ${result.outMember.characterName} <-> ${result.inMember.characterName}`);
    return result.event;
  }

  previewCurrentTurn(options = {}) {
    if (!this.state) {
      throw new Error('State is not initialized.');
    }

    const enemyAction = this.root.querySelector('[data-role="enemy-action"]')?.value ?? null;
    const enemyCount = this.readEnemyCountFromDom();
    this.syncEnemyStateFromDom();
    const actions = this.collectActionDictFromDom();

    this.previewCurrentTurnState({ actions, enemyAction, enemyCount, options });
    this.writePreviewOutput(JSON.stringify(this.previewRecord, null, 2));
    this.setStatus('Preview generated.');
    return this.previewRecord;
  }

  commitCurrentTurn(options = {}) {
    if (!this.state) {
      throw new Error('State is not initialized.');
    }
    const previewOptions =
      options.previewOptions && typeof options.previewOptions === 'object' ? options.previewOptions : {};
    const shouldCaptureTurnPlan = options.skipTurnPlanCapture !== true && !this.isReplayingTurnPlans;
    const capturedTurnPlan = shouldCaptureTurnPlan ? this.captureCurrentTurnPlanFromDom() : null;

    if (!this.previewRecord) {
      this.previewCurrentTurn(previewOptions);
    }

    const forceOdActivation =
      options.forceOdOverride !== undefined ? Boolean(options.forceOdOverride) : this.isForceOdEnabled();
    const forceResourceDeficit = Boolean(options.forceResourceDeficit ?? false);
    const committedRecord = this.commitCurrentTurnState({
      interruptOdLevel: Number(this.pendingInterruptOdLevel ?? 0),
      forceOdActivation,
      forceResourceDeficit,
      shouldCaptureTurnPlan,
      capturedTurnPlan,
    });
    this.appendPassiveLogEvents(committedRecord?.passiveEvents ?? []);
    if (
      this.scenario &&
      this.scenarioStagedTurnIndex !== null &&
      Number.isFinite(Number(this.scenarioStagedTurnIndex)) &&
      Number(this.scenarioStagedTurnIndex) === Number(this.scenarioCursor)
    ) {
      this.scenarioCursor += 1;
      this.scenarioStagedTurnIndex = null;
    }
    this.renderActionSelectors();
    this.renderPartyState();
    this.renderSwapSelectors();
    this.renderTurnStatus();
    this.renderEnemyStatusControls();
    this.renderKishinkaControls();
    this.renderRecordTable();
    this.writePreviewOutput('');
    this.renderOdControls();
    this.renderScenarioStatus();
    if (shouldCaptureTurnPlan && capturedTurnPlan) {
      this.renderTurnPlanEditControls();
    }
    this.setStatus('Turn committed.');

    return committedRecord;
  }

  exportCsv() {
    const csv = this.exportCsvState();
    this.writeCsvOutput(csv);
    this.setStatus('CSV exported.');
    return csv;
  }

  exportRecordsJson() {
    const json = this.exportRecordsJsonState();
    this.writeRecordsJsonOutput(json);
    const saved = this.saveRecordsJsonFile(json);
    this.setStatus(saved ? 'Records JSON saved.' : 'Records JSON exported.');
    return json;
  }

  saveRecordsJsonFile(text) {
    const view = this.doc?.defaultView ?? globalThis;
    const BlobCtor = view?.Blob ?? globalThis.Blob;
    const urlApi = view?.URL ?? globalThis.URL;

    if (
      !BlobCtor ||
      !urlApi ||
      typeof urlApi.createObjectURL !== 'function' ||
      typeof this.doc?.createElement !== 'function'
    ) {
      return false;
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `records_${timestamp}.json`;
    const blob = new BlobCtor([text], { type: 'application/json' });
    const objectUrl = urlApi.createObjectURL(blob);
    const link = this.doc.createElement('a');
    link.href = objectUrl;
    link.download = filename;
    link.style.display = 'none';
    this.doc.body?.appendChild(link);

    try {
      link.click();
    } finally {
      link.remove();
      if (typeof urlApi.revokeObjectURL === 'function') {
        urlApi.revokeObjectURL(objectUrl);
      }
    }

    return true;
  }

  writePreviewOutput(text) {
    this.view.writePreviewOutput(text);
  }

  writeConditionSupportSummary(text) {
    this.view.writeConditionSupportSummary(text);
  }

  writeCsvOutput(text) {
    this.view.writeCsvOutput(text);
  }

  writeRecordsJsonOutput(text) {
    this.view.writeRecordsJsonOutput(text);
  }

  writePassiveLogOutput(text) {
    this.view.writePassiveLogOutput(text);
  }

  renderScenarioStatus() {
    this.view.renderScenarioStatus({
      scenario: this.scenario,
      cursor: this.scenarioCursor,
      stagedTurnIndex: this.scenarioStagedTurnIndex,
    });
  }

  getScenarioJsonTextFromDom() {
    const area = this.root.querySelector('[data-role="scenario-json"]');
    return String(area?.value ?? '').trim();
  }

  setDomValue(selector, value) {
    this.view.setDomValue(selector, value);
  }

  parseCsvText(text) {
    const lines = String(text ?? '')
      .split(/\r?\n/)
      .filter((line) => line.length > 0);
    if (lines.length === 0) {
      return { header: [], rows: [] };
    }

    const parseLine = (line) => {
      const out = [];
      let cur = '';
      let quoted = false;
      for (let i = 0; i < line.length; i += 1) {
        const ch = line[i];
        if (ch === '"') {
          if (quoted && line[i + 1] === '"') {
            cur += '"';
            i += 1;
          } else {
            quoted = !quoted;
          }
          continue;
        }
        if (ch === ',' && !quoted) {
          out.push(cur);
          cur = '';
          continue;
        }
        cur += ch;
      }
      out.push(cur);
      return out;
    };

    const header = parseLine(lines[0]);
    const rows = lines.slice(1).map((line) => {
      const cols = parseLine(line);
      const row = {};
      for (let i = 0; i < header.length; i += 1) {
        row[header[i]] = cols[i] ?? '';
      }
      return row;
    });
    return { header, rows };
  }

  extractSkillNameFromActionCell(text) {
    const raw = String(text ?? '').trim();
    if (!raw || raw === '-') {
      return '';
    }
    const marker = raw.indexOf(' (');
    if (marker <= 0) {
      return raw;
    }
    return raw.slice(0, marker).trim();
  }

  extractOdLevelFromTurnLabel(odTurn) {
    const m = String(odTurn ?? '').match(/^OD([123])-[123]$/);
    return m ? Number(m[1]) : null;
  }

  convertCsvToScenario(csvText) {
    const { header, rows } = this.parseCsvText(csvText);
    if (header.length === 0 || rows.length === 0) {
      throw new Error('CSV is empty.');
    }
    if (!header.includes('seq') || !header.includes('turn') || !header.includes('od_turn')) {
      throw new Error('Unsupported CSV format: required columns seq/turn/od_turn are missing.');
    }

    const positionCols = header.filter((h) => h.endsWith('_position'));
    const actionCols = header.filter((h) => h.endsWith('_action'));
    const actorPrefixes = positionCols
      .map((col) => col.slice(0, -'_position'.length))
      .filter((prefix) => actionCols.includes(`${prefix}_action`));
    const actorOrder = [...actorPrefixes];

    const positionMaps = rows.map((row) => {
      const byCharacter = new Map();
      for (const prefix of actorOrder) {
        const pos = Number(row[`${prefix}_position`]);
        if (!Number.isFinite(pos) || pos < 1 || pos > 6) {
          continue;
        }
        byCharacter.set(prefix, pos);
      }
      return byCharacter;
    });

    const turns = rows.map((row) => {
      const turn = {};
      const enemyAction = String(row.enemyAction ?? '');
      if (enemyAction) {
        turn.enemyAction = enemyAction;
      }
      const actions = [];
      for (const prefix of actorPrefixes) {
        const actionCell = String(row[`${prefix}_action`] ?? '').trim();
        const skillName = this.extractSkillNameFromActionCell(actionCell);
        if (!skillName || skillName === '行動なし') {
          continue;
        }
        const posRaw = row[`${prefix}_position`];
        if (!Number.isFinite(Number(posRaw))) {
          continue;
        }
        actions.push({
          actorName: prefix,
          position: Number(posRaw),
          skillName,
        });
      }
      if (actions.length > 0) {
        turn.actions = actions;
      }
      const ex = String(row.ex ?? '').trim().toLowerCase();
      if (ex === 'ex') {
        turn.commit = true;
      }
      return turn;
    });

    const deriveSwapsFromPositions = (fromMap, toMap) => {
      const names = actorOrder.filter((name) => fromMap.has(name) && toMap.has(name));
      if (names.length === 0) {
        return [];
      }

      const currentPosByName = new Map(names.map((name) => [name, Number(fromMap.get(name))]));
      const targetPosByName = new Map(names.map((name) => [name, Number(toMap.get(name))]));
      const nameByCurrentPos = new Map(
        [...currentPosByName.entries()].map(([name, pos]) => [pos, name])
      );
      const swaps = [];

      for (const name of names) {
        while (Number(currentPosByName.get(name)) !== Number(targetPosByName.get(name))) {
          const from = Number(currentPosByName.get(name));
          const to = Number(targetPosByName.get(name));
          const counterpart = nameByCurrentPos.get(to);
          if (!counterpart || counterpart === name) {
            break;
          }

          swaps.push({ from, to });

          currentPosByName.set(name, to);
          currentPosByName.set(counterpart, from);
          nameByCurrentPos.set(from, counterpart);
          nameByCurrentPos.set(to, name);
        }
      }

      const deduped = [];
      for (const swap of swaps) {
        const prev = deduped[deduped.length - 1];
        if (prev && prev.from === swap.to && prev.to === swap.from) {
          continue;
        }
        deduped.push(swap);
      }
      return deduped;
    };

    // row i -> row i+1 の position 変化を、turns[i] の swap として復元する。
    for (let i = 0; i < rows.length - 1; i += 1) {
      const swaps = deriveSwapsFromPositions(positionMaps[i], positionMaps[i + 1]);
      if (swaps.length > 0) {
        turns[i].swaps = swaps;
      }
    }

    // ODコンテキスト復元:
    // - preemptive + ODx-1 は当該行で preemptive OD
    // - interrupt + ODx-1 は前行で interrupt 予約
    for (let i = 0; i < rows.length; i += 1) {
      const row = rows[i];
      const odTurn = String(row.od_turn ?? '').trim();
      const odContext = String(row.od_context ?? '').trim();
      const level = this.extractOdLevelFromTurnLabel(odTurn);
      const isStep1 = /-1$/.test(odTurn);
      if (!level || !isStep1) {
        continue;
      }
      if (odContext === 'preemptive') {
        turns[i].preemptiveOdLevel = level;
      } else if (odContext === 'interrupt') {
        if (i > 0) {
          turns[i - 1].interruptOdLevel = level;
        } else {
          turns[i].preemptiveOdLevel = level;
        }
      }
    }

    const firstRow = rows[0];
    const setup = {};
    const firstOd = Number.parseFloat(String(firstRow.od ?? '').replace('%', ''));
    if (Number.isFinite(firstOd)) {
      setup.initialOdGauge = firstOd;
    }
    if (setup.initialOdGauge !== undefined && setup.initialOdGauge < 100) {
      setup.forceOd = true;
    }
    const initialPositions = [];
    for (const prefix of actorOrder) {
      const raw = Number(firstRow[`${prefix}_position`]);
      if (!Number.isFinite(raw) || raw < 1 || raw > 6) {
        continue;
      }
      initialPositions.push({
        characterName: prefix,
        position: raw,
      });
    }
    if (initialPositions.length > 0) {
      setup.initialPositions = initialPositions;
    }

    return {
      version: 1,
      setup,
      turns,
    };
  }

  loadScenarioFromDom() {
    const text = this.getScenarioJsonTextFromDom();
    if (!text) {
      throw new Error('Scenario JSON is empty.');
    }
    let parsed = null;
    const looksLikeCsv = /^seq,/.test(text);
    if (looksLikeCsv) {
      parsed = this.convertCsvToScenario(text);
    } else {
      try {
        parsed = JSON.parse(text);
      } catch (error) {
        throw new Error(`Invalid scenario JSON: ${error.message}`);
      }
    }

    if (!parsed || typeof parsed !== 'object') {
      throw new Error('Scenario must be an object.');
    }

    const turns = Array.isArray(parsed.turns) ? parsed.turns : [];
    this.scenario = {
      version: Number(parsed.version ?? 1),
      setup: parsed.setup && typeof parsed.setup === 'object' ? parsed.setup : {},
      turns,
    };
    this.scenarioCursor = 0;
    this.scenarioStagedTurnIndex = null;
    this.scenarioSetupApplied = false;
    this.renderScenarioStatus();
    if (looksLikeCsv) {
      const area = this.root.querySelector('[data-role="scenario-json"]');
      if (area) {
        area.value = JSON.stringify(parsed, null, 2);
      }
    }
    this.setStatus(`Scenario loaded (${turns.length} turns).`);
    return this.scenario;
  }

  resolveScenarioPosition(rawPosition) {
    const n = Number(rawPosition);
    if (!Number.isFinite(n)) {
      throw new Error(`Invalid position: ${rawPosition}`);
    }
    if (n >= 1 && n <= 6) {
      return n - 1;
    }
    if (n >= 0 && n <= 5) {
      return n;
    }
    throw new Error(`Position out of range: ${rawPosition}`);
  }

  applyScenarioEnemyStatuses(statuses = []) {
    if (!this.state?.turnState) {
      return;
    }
    const enemyCount = this.readEnemyCountFromDom();
    const next = [];
    for (const status of statuses) {
      if (!status || typeof status !== 'object') {
        continue;
      }
      const statusType = String(status.statusType ?? ENEMY_STATUS_DOWN_TURN);
      const targetRaw = status.targetIndex ?? status.target ?? 0;
      const targetIndex = Math.max(0, Math.min(enemyCount - 1, toInt(targetRaw, 0)));
      const remainingTurns = isPersistentEnemyStatus(statusType)
        ? 0
        : Math.max(1, toInt(status.remainingTurns, 1));
      next.push({ statusType, targetIndex, remainingTurns });
    }
    this.state.turnState.enemyState = {
      enemyCount,
      statuses: next,
      damageRatesByEnemy: normalizeEnemyDamageRatesByEnemy(this.state.turnState.enemyState?.damageRatesByEnemy),
      enemyNamesByEnemy: normalizeEnemyNamesByEnemy(this.state.turnState.enemyState?.enemyNamesByEnemy),
      zoneConfigByEnemy: normalizeEnemyZoneConfigByEnemy(this.state.turnState.enemyState?.zoneConfigByEnemy),
    };
    this.renderEnemyStatusControls();
    this.renderEnemyConfigControls();
  }

  applyScenarioEnemyNames(enemyNames = {}) {
    if (!this.state?.turnState) {
      return;
    }
    const enemyCount = this.readEnemyCountFromDom();
    const next = {};
    if (Array.isArray(enemyNames)) {
      enemyNames.forEach((name, index) => {
        if (index < 0 || index >= enemyCount) {
          return;
        }
        next[String(index)] = String(name ?? '').trim();
      });
    } else if (enemyNames && typeof enemyNames === 'object') {
      for (const [targetIndex, name] of Object.entries(enemyNames)) {
        const normalizedIndex = Math.max(0, Math.min(enemyCount - 1, toInt(targetIndex, 0)));
        next[String(normalizedIndex)] = String(name ?? '').trim();
      }
    }
    this.state.turnState.enemyState = {
      enemyCount,
      statuses: Array.isArray(this.state.turnState.enemyState?.statuses)
        ? this.state.turnState.enemyState.statuses
        : [],
      damageRatesByEnemy: normalizeEnemyDamageRatesByEnemy(this.state.turnState.enemyState?.damageRatesByEnemy),
      enemyNamesByEnemy: normalizeEnemyNamesByEnemy(next),
      zoneConfigByEnemy: normalizeEnemyZoneConfigByEnemy(this.state.turnState.enemyState?.zoneConfigByEnemy),
    };
    this.renderEnemyStatusControls();
    this.renderEnemyConfigControls();
  }

  applyScenarioEnemyDamageRates(enemyDamageRates = {}) {
    if (!this.state?.turnState) {
      return;
    }
    const enemyCount = this.readEnemyCountFromDom();
    const next = {};
    const assignRates = (targetIndex, rates) => {
      if (targetIndex < 0 || targetIndex >= enemyCount || !rates || typeof rates !== 'object') {
        return;
      }
      next[String(targetIndex)] = Object.fromEntries(
        Object.entries(rates)
          .map(([key, value]) => [String(key), Number(value)])
          .filter(([, value]) => Number.isFinite(value))
      );
    };
    if (Array.isArray(enemyDamageRates)) {
      enemyDamageRates.forEach((rates, index) => assignRates(index, rates));
    } else if (enemyDamageRates && typeof enemyDamageRates === 'object') {
      for (const [targetIndex, rates] of Object.entries(enemyDamageRates)) {
        assignRates(Math.max(0, Math.min(enemyCount - 1, toInt(targetIndex, 0))), rates);
      }
    }
    this.state.turnState.enemyState = {
      enemyCount,
      statuses: Array.isArray(this.state.turnState.enemyState?.statuses)
        ? this.state.turnState.enemyState.statuses
        : [],
      damageRatesByEnemy: normalizeEnemyDamageRatesByEnemy(next),
      enemyNamesByEnemy: normalizeEnemyNamesByEnemy(this.state.turnState.enemyState?.enemyNamesByEnemy),
      zoneConfigByEnemy: normalizeEnemyZoneConfigByEnemy(this.state.turnState.enemyState?.zoneConfigByEnemy),
    };
    this.renderEnemyConfigControls();
  }

  applyLoadedScenarioSetup() {
    if (!this.scenario) {
      throw new Error('Scenario is not loaded.');
    }
    const setup = this.scenario.setup ?? {};
    const selections = this.captureSelectionState();
    const slots = Array.isArray(setup.slots) ? setup.slots : [];
    for (let i = 0; i < slots.length; i += 1) {
      const entry = slots[i];
      if (!entry || typeof entry !== 'object') {
        continue;
      }
      const slotIndex = Number.isFinite(Number(entry.slot))
        ? Math.max(0, Math.min(5, toInt(entry.slot, 0) - 1))
        : i;
      const current = selections.partySelections[slotIndex] ?? {};
      selections.partySelections[slotIndex] = {
        ...current,
        ...(entry.characterLabel ? { characterLabel: String(entry.characterLabel) } : {}),
        ...(Number.isFinite(Number(entry.styleId)) ? { styleId: Number(entry.styleId) } : {}),
        ...(Number.isFinite(Number(entry.limitBreakLevel))
          ? { limitBreakLevel: Number(entry.limitBreakLevel) }
          : {}),
        ...(Number.isFinite(Number(entry.drivePiercePercent))
          ? { drivePiercePercent: Number(entry.drivePiercePercent) }
          : {}),
        ...(typeof entry.normalAttackBelt === 'string'
          ? { normalAttackBelt: String(entry.normalAttackBelt) }
          : {}),
        ...(Number.isFinite(Number(entry.startSpEquipBonus))
          ? { startSpEquipBonus: Number(entry.startSpEquipBonus) }
          : {}),
        ...(Array.isArray(entry.checkedSkillIds)
          ? { checkedSkillIds: entry.checkedSkillIds.map((id) => Number(id)) }
          : {}),
      };
    }
    this.applySelectionState(selections);

    if (Number.isFinite(Number(setup.enemyCount))) {
      this.setDomValue('[data-role="enemy-count"]', clampEnemyCount(setup.enemyCount));
    }
    if (setup.enemyAction !== undefined) {
      this.setDomValue('[data-role="enemy-action"]', String(setup.enemyAction ?? ''));
    }
    if (Number.isFinite(Number(setup.initialOdGauge))) {
      this.setDomValue('[data-role="initial-od-gauge"]', Number(setup.initialOdGauge));
    }
    if (typeof setup.forceOd === 'boolean') {
      const toggle = this.root.querySelector('[data-role="force-od-toggle"]');
      if (toggle) {
        toggle.checked = setup.forceOd;
      }
    }

    this.initializeBattle(undefined, {
      enemyNamesByEnemy: normalizeEnemyNamesByEnemy(setup.enemyNames),
      damageRatesByEnemy: normalizeEnemyDamageRatesByEnemy(setup.enemyDamageRates),
      enemyStatuses: Array.isArray(setup.enemyStatuses)
        ? setup.enemyStatuses.map((status) => ({
            statusType: String(status?.statusType ?? ''),
            targetIndex: Number(status?.targetIndex ?? status?.target ?? 0),
            remainingTurns: Number(status?.remainingTurns ?? 0),
          }))
        : [],
      zoneState: normalizeFieldStateForScenario(setup.zoneState),
      territoryState: normalizeFieldStateForScenario(setup.territoryState),
    });
    if (Array.isArray(setup.initialPositions) && setup.initialPositions.length > 0) {
      this.applyScenarioInitialPositions(setup.initialPositions);
    }
    if (Array.isArray(setup.enemyNames) || (setup.enemyNames && typeof setup.enemyNames === 'object')) {
      this.applyScenarioEnemyNames(setup.enemyNames);
    }
    if (Array.isArray(setup.enemyDamageRates) || (setup.enemyDamageRates && typeof setup.enemyDamageRates === 'object')) {
      this.applyScenarioEnemyDamageRates(setup.enemyDamageRates);
    }
    if (Array.isArray(setup.enemyStatuses)) {
      this.applyScenarioEnemyStatuses(setup.enemyStatuses);
    }
    if (setup.zoneState && typeof setup.zoneState === 'object') {
      this.state.turnState.zoneState = normalizeFieldStateForScenario(setup.zoneState);
    }
    if (setup.territoryState && typeof setup.territoryState === 'object') {
      this.state.turnState.territoryState = normalizeFieldStateForScenario(setup.territoryState);
    }
    this.scenarioCursor = 0;
    this.scenarioStagedTurnIndex = null;
    this.scenarioSetupApplied = true;
    this.renderScenarioStatus();
    this.renderTurnStatus();
    this.setStatus('Scenario setup applied.');
  }

  ensureScenarioSetupApplied() {
    if (!this.scenario) {
      throw new Error('Scenario is not loaded.');
    }
    if (this.scenarioSetupApplied) {
      return;
    }
    this.applyLoadedScenarioSetup();
  }

  resolveScenarioSkillId(member, action) {
    if (!member) {
      throw new Error('Member not found for scenario action.');
    }
    if (Number.isFinite(Number(action?.skillId))) {
      return Number(action.skillId);
    }
    const skillName = String(action?.skillName ?? '').trim();
    if (!skillName) {
      throw new Error(`Scenario action requires skillId or skillName (member ${member.characterName}).`);
    }
    const skill =
      member
        .getActionSkills()
        .find((item) => String(item.name ?? '') === skillName || String(item.label ?? '') === skillName) ??
      null;
    if (!skill) {
      throw new Error(`Skill not found on ${member.characterName}: ${skillName}`);
    }
    return Number(skill.skillId);
  }

  resolveScenarioActorName(action) {
    return String(action?.actorName ?? action?.characterName ?? action?.characterId ?? '').trim();
  }

  findScenarioMemberByActorName(actorName) {
    const normalized = normalizeName(actorName);
    if (!normalized || !this.party) {
      return null;
    }
    return (
      this.party.members.find((member) => normalizeName(member.characterName) === normalized) ??
      this.party.members.find((member) => String(member.characterId) === actorName) ??
      this.party.members.find((member) => String(member.styleId) === actorName) ??
      this.party.members.find((member) => normalizeName(member.styleName) === normalized) ??
      null
    );
  }

  resolveScenarioActionMember(action) {
    const hasPositionIndex = Number.isFinite(Number(action?.positionIndex));
    if (hasPositionIndex) {
      const position = Math.max(0, Math.min(5, toInt(action.positionIndex, 0)));
      const member = this.party?.getByPosition(position);
      if (!member) {
        throw new Error(`No member at position ${position + 1}`);
      }
      return member;
    }
    const actorName = this.resolveScenarioActorName(action);
    if (actorName) {
      const byName = this.findScenarioMemberByActorName(actorName);
      if (byName) {
        return byName;
      }
    }
    const hasPosition = action?.position !== undefined && action?.position !== null;
    if (hasPosition) {
      const position = this.resolveScenarioPosition(action.position);
      const member = this.party?.getByPosition(position);
      if (!member) {
        throw new Error(`No member at position ${position + 1}`);
      }
      return member;
    }
    throw new Error(`Scenario action requires position or actorName: ${JSON.stringify(action ?? {})}`);
  }

  alignScenarioActionPositions(actions = [], options = {}) {
    if (!this.state || !this.party || !Array.isArray(actions) || actions.length === 0) {
      return;
    }
    const warn = typeof options.onWarning === 'function' ? options.onWarning : () => {};
    const isForceMode = Boolean(options.forceMode);
    let changed = false;
    for (const action of actions) {
      const hasPositionIndex = Number.isFinite(Number(action?.positionIndex));
      const hasPosition =
        action?.position !== undefined && action?.position !== null && String(action.position).trim() !== '';
      if (!hasPositionIndex && !hasPosition) {
        continue;
      }
      try {
        const targetPosition = hasPositionIndex
          ? Math.max(0, Math.min(5, toInt(action.positionIndex, 0)))
          : this.resolveScenarioPosition(action.position);
        const skillId = Number(action?.skillId ?? NaN);
        if (!Number.isFinite(skillId)) {
          continue;
        }
        const currentMember = this.party.getByPosition(targetPosition);
        if (!currentMember) {
          throw new Error(`No member at position ${targetPosition + 1} for position alignment.`);
        }
        if (currentMember.getSkill(skillId)) {
          continue;
        }

        const actorName = this.resolveScenarioActorName(action);
        const actor = actorName ? this.findScenarioMemberByActorName(actorName) : null;
        const skillCandidates = this.party.members.filter((member) => Boolean(member.getSkill(skillId)));
        const byActor = actor && actor.getSkill(skillId) ? actor : null;
        const preferred = byActor ?? (skillCandidates.length === 1 ? skillCandidates[0] : null);
        if (!preferred) {
          if (isForceMode) {
            warn(
              `position alignment skipped: cannot resolve actor for skill ${skillId} at Pos ${targetPosition + 1}`
            );
            continue;
          }
          throw new Error(
            `Cannot align action position: skill ${skillId} is not usable at Pos ${targetPosition + 1}.`
          );
        }
        if (Number(preferred.position) === targetPosition) {
          continue;
        }
        const fromPosition = Number(preferred.position);
        preferred.setPosition(targetPosition);
        currentMember.setPosition(fromPosition);
        changed = true;
      } catch (error) {
        if (isForceMode) {
          warn(`position alignment skipped: ${error.message}`);
          continue;
        }
        throw error;
      }
    }
    if (!changed) {
      return;
    }
    this.state.positionMap = buildPositionMap(this.state.party);
    this.previewRecord = null;
    this.writePreviewOutput('');
    this.renderActionSelectors();
    this.renderPartyState();
    this.renderSwapSelectors();
  }

  resolveScenarioSwapEndpointPosition(swap, side) {
    const key = side === 'from' ? 'from' : 'to';
    const explicitPosition = swap?.[key];
    if (explicitPosition !== undefined && explicitPosition !== null && String(explicitPosition).trim() !== '') {
      return this.resolveScenarioPosition(explicitPosition);
    }
    const characterIdKey = side === 'from' ? 'fromCharacterId' : 'toCharacterId';
    const characterNameKey = side === 'from' ? 'fromCharacterName' : 'toCharacterName';
    const styleIdKey = side === 'from' ? 'fromStyleId' : 'toStyleId';
    const styleNameKey = side === 'from' ? 'fromStyleName' : 'toStyleName';
    const actorName =
      [
        swap?.[characterIdKey],
        swap?.[characterNameKey],
        swap?.[styleIdKey],
        swap?.[styleNameKey],
      ]
        .map((value) => String(value ?? '').trim())
        .find((value) => value.length > 0) ?? '';
    if (!actorName) {
      throw new Error(`Scenario swap requires ${key} position or character reference.`);
    }
    const member = this.findScenarioMemberByActorName(actorName);
    if (!member) {
      throw new Error(`Scenario swap member not found (${key}=${actorName}).`);
    }
    return Number(member.position);
  }

  applyScenarioInitialPositions(initialPositions = []) {
    if (!this.party || !this.state || !Array.isArray(initialPositions) || initialPositions.length === 0) {
      return;
    }

    const targetPositionByMember = new Map(this.party.members.map((member) => [member, Number(member.position)]));
    const assignedMembers = new Set();

    for (const row of initialPositions) {
      if (!row || typeof row !== 'object') {
        continue;
      }
      const actorName = String(
        row.characterName ?? row.actorName ?? row.name ?? row.characterId ?? ''
      ).trim();
      if (!actorName) {
        continue;
      }
      const member = this.findScenarioMemberByActorName(actorName);
      if (!member) {
        continue;
      }
      if (assignedMembers.has(member)) {
        throw new Error(`Scenario initialPositions: duplicated member: ${actorName}`);
      }
      const targetPosition = this.resolveScenarioPosition(row.position ?? row.positionIndex ?? row.slot);
      targetPositionByMember.set(member, targetPosition);
      assignedMembers.add(member);
    }

    if (assignedMembers.size === 0) {
      return;
    }

    const values = [...targetPositionByMember.values()];
    const unique = new Set(values);
    if (values.length !== unique.size) {
      throw new Error('Scenario initialPositions create duplicate positions.');
    }
    if (values.some((pos) => !Number.isFinite(pos) || pos < 0 || pos > 5)) {
      throw new Error('Scenario initialPositions contain out-of-range position.');
    }

    for (const member of this.party.members) {
      member.setPosition(targetPositionByMember.get(member));
    }
    this.state.positionMap = buildPositionMap(this.state.party);
    this.renderActionSelectors();
    this.renderPartyState();
    this.renderSwapSelectors();
    this.renderTurnStatus();
  }

  setScenarioActionOnDom(action) {
    const member = this.resolveScenarioActionMember(action);
    const position = Number(member.position);
    const skillId = this.resolveScenarioSkillId(member, action);
    const select = this.root.querySelector(`[data-action-slot="${position}"]`);
    if (!select) {
      throw new Error(`Action slot is not available at position ${position + 1}`);
    }
    const hasOption = [...select.options].some((option) => Number(option.value) === Number(skillId));
    if (!hasOption) {
      throw new Error(
        `Skill ${skillId} cannot be selected at position ${position + 1} in current turn state.`
      );
    }
    select.value = String(skillId);
    this.lastActionSkillByPosition.set(position, skillId);
    this.updateActionSkillAttributeBadges(position, skillId);
    this.updateActionTargetSelector(position, skillId);

    const targetSelect = this.root.querySelector(`[data-action-target-slot="${position}"]`);
    if (targetSelect && targetSelect.style.display !== 'none') {
      const targetByCharacterId = String(action?.targetCharacterId ?? '').trim();
      if (targetByCharacterId) {
        const encodedValue = `ally:${targetByCharacterId}`;
        const can = [...targetSelect.options].some(
          (option) => String(option.value) === encodedValue
        );
        if (!can) {
          throw new Error(
            `Target character is not selectable at position ${position + 1}: ${targetByCharacterId}`
          );
        }
        targetSelect.value = encodedValue;
        this.lastActionTargetByPosition.set(position, encodedValue);
      } else if (Number.isFinite(Number(action?.targetEnemyIndex))) {
        const encodedValue = `enemy:${Math.max(0, toInt(action.targetEnemyIndex, 0))}`;
        const can = [...targetSelect.options].some(
          (option) => String(option.value) === encodedValue
        );
        if (!can) {
          throw new Error(
            `Target enemy is not selectable at position ${position + 1}: ${Number(action.targetEnemyIndex) + 1}`
          );
        }
        targetSelect.value = encodedValue;
        this.lastActionTargetByPosition.set(position, encodedValue);
      } else if (Number.isFinite(Number(action?.targetPosition))) {
        const targetPosition = this.resolveScenarioPosition(action.targetPosition);
        const targetMember = this.party?.getByPosition(targetPosition);
        if (!targetMember) {
          throw new Error(`Target member not found at position ${targetPosition + 1}`);
        }
        const targetCharacterId = String(targetMember.characterId);
        const can = [...targetSelect.options].some(
          (option) => String(option.value) === `ally:${targetCharacterId}`
        );
        if (!can) {
          throw new Error(
            `Target position is not selectable at position ${position + 1}: ${targetPosition + 1}`
          );
        }
        targetSelect.value = `ally:${targetCharacterId}`;
        this.lastActionTargetByPosition.set(position, `ally:${targetCharacterId}`);
      }
    }
  }

  applyScenarioTurn(turn = {}, options = {}) {
    const mode = String(options.mode ?? 'commit');
    const recalcMode = String(options.recalcMode ?? 'strict') === 'force' ? 'force' : 'strict';
    const isForceMode = recalcMode === 'force';
    const warn =
      typeof options.onWarning === 'function'
        ? options.onWarning
        : () => {};
    const commitOptions =
      options.commitOptions && typeof options.commitOptions === 'object' ? options.commitOptions : {};
    if (!this.state) {
      throw new Error('Battle state is not initialized.');
    }
    if (Number.isFinite(Number(turn.enemyCount))) {
      this.setDomValue('[data-role="enemy-count"]', clampEnemyCount(turn.enemyCount));
      this.syncEnemyStateFromDom();
      this.renderEnemyStatusControls();
      this.renderEnemyConfigControls();
    }
    if (turn.enemyAction !== undefined) {
      this.setDomValue('[data-role="enemy-action"]', String(turn.enemyAction ?? ''));
    }
    if (typeof turn.forceOd === 'boolean') {
      const toggle = this.root.querySelector('[data-role="force-od-toggle"]');
      if (toggle) {
        toggle.checked = turn.forceOd;
      }
      this.renderOdControls();
    }

    if (Array.isArray(turn.enemyStatuses)) {
      this.applyScenarioEnemyStatuses(turn.enemyStatuses);
    }
    if (turn.zoneState && typeof turn.zoneState === 'object') {
      this.state.turnState.zoneState = normalizeFieldStateForScenario(turn.zoneState);
    }
    if (turn.territoryState && typeof turn.territoryState === 'object') {
      this.state.turnState.territoryState = normalizeFieldStateForScenario(turn.territoryState);
    }
    if (Array.isArray(turn.enemyNames) || (turn.enemyNames && typeof turn.enemyNames === 'object')) {
      this.applyScenarioEnemyNames(turn.enemyNames);
    }
    if (Array.isArray(turn.enemyDamageRates) || (turn.enemyDamageRates && typeof turn.enemyDamageRates === 'object')) {
      this.applyScenarioEnemyDamageRates(turn.enemyDamageRates);
    }
    if (Array.isArray(turn.enemyStatusesApply)) {
      const merged = [...this.getEnemyStatuses()];
      for (const status of turn.enemyStatusesApply) {
        if (!status || typeof status !== 'object') {
          continue;
        }
        const statusType = String(status.statusType ?? ENEMY_STATUS_DOWN_TURN);
        const targetIndex = Math.max(
          0,
          Math.min(this.readEnemyCountFromDom() - 1, toInt(status.targetIndex ?? status.target, 0))
        );
        const remainingTurns = isPersistentEnemyStatus(statusType)
          ? 0
          : Math.max(1, toInt(status.remainingTurns, 1));
        const filtered = merged.filter((item) => {
          const currentType = String(item.statusType ?? '');
          const currentTarget = Number(item.targetIndex);
          if (currentTarget !== targetIndex) {
            return true;
          }
          if (statusType === ENEMY_STATUS_DOWN_TURN) {
            return currentType !== ENEMY_STATUS_DOWN_TURN && currentType !== ENEMY_STATUS_BREAK;
          }
          return currentType !== statusType;
        });
        if (statusType === ENEMY_STATUS_DOWN_TURN) {
          filtered.push({ statusType: ENEMY_STATUS_BREAK, targetIndex, remainingTurns: 0 });
        }
        filtered.push({ statusType, targetIndex, remainingTurns });
        merged.length = 0;
        merged.push(...filtered);
      }
      this.state.turnState.enemyState = {
        enemyCount: this.readEnemyCountFromDom(),
        statuses: merged,
        damageRatesByEnemy: normalizeEnemyDamageRatesByEnemy(this.state.turnState.enemyState?.damageRatesByEnemy),
        enemyNamesByEnemy: normalizeEnemyNamesByEnemy(this.state.turnState.enemyState?.enemyNamesByEnemy),
        zoneConfigByEnemy: normalizeEnemyZoneConfigByEnemy(this.state.turnState.enemyState?.zoneConfigByEnemy),
      };
      this.renderEnemyStatusControls();
      this.renderEnemyConfigControls();
    }
    if (Array.isArray(turn.enemyStatusesClear)) {
      let statuses = [...this.getEnemyStatuses()];
      for (const status of turn.enemyStatusesClear) {
        if (!status || typeof status !== 'object') {
          continue;
        }
        const statusType = String(status.statusType ?? ENEMY_STATUS_DOWN_TURN);
        const hasTarget =
          status.targetIndex !== undefined || status.target !== undefined || status.targetPosition !== undefined;
        if (!hasTarget) {
          statuses = statuses.filter((item) => String(item.statusType ?? '') !== statusType);
          continue;
        }
        const targetIndex = Math.max(
          0,
          Math.min(
            this.readEnemyCountFromDom() - 1,
            toInt(status.targetIndex ?? status.target ?? status.targetPosition, 0)
          )
        );
        statuses = statuses.filter(
          (item) => {
            const currentType = String(item.statusType ?? '');
            const currentTarget = Number(item.targetIndex);
            if (currentTarget !== targetIndex) {
              return true;
            }
            if (statusType === ENEMY_STATUS_BREAK) {
              return currentType !== ENEMY_STATUS_BREAK && currentType !== ENEMY_STATUS_DOWN_TURN;
            }
            return currentType !== statusType;
          }
        );
      }
      this.state.turnState.enemyState = {
        enemyCount: this.readEnemyCountFromDom(),
        statuses,
        damageRatesByEnemy: normalizeEnemyDamageRatesByEnemy(this.state.turnState.enemyState?.damageRatesByEnemy),
        enemyNamesByEnemy: normalizeEnemyNamesByEnemy(this.state.turnState.enemyState?.enemyNamesByEnemy),
        zoneConfigByEnemy: normalizeEnemyZoneConfigByEnemy(this.state.turnState.enemyState?.zoneConfigByEnemy),
      };
      this.renderEnemyStatusControls();
      this.renderEnemyConfigControls();
    }
    this.renderTurnStatus();

    if (Number.isFinite(Number(turn.preemptiveOdLevel))) {
      const canApplyPreemptiveOd = String(this.state.turnState?.turnType ?? 'normal') === 'normal';
      if (canApplyPreemptiveOd) {
        this.state = activateOverdrive(this.state, Number(turn.preemptiveOdLevel), 'preemptive', {
          forceActivation: this.isForceOdEnabled() || isForceMode,
          forceConsumeGauge: isForceMode,
        });
        this.appendPassiveLogEvents(this.state?.turnState?.passiveEventsLastApplied ?? []);
        this.previewRecord = null;
        this.pendingSwapEvents = [];
        this.resetInterruptOdProjection({ clearReservation: true });
        this.renderActionSelectors();
        this.renderPartyState();
        this.renderSwapSelectors();
        this.renderTurnStatus();
      } else if (isForceMode) {
        warn('preemptive OD was requested but current turn is not normal. skipped.');
      }
    }

    if (turn.kishinka) {
      if (isForceMode) {
        try {
          this.activateKishinka();
        } catch (error) {
          warn(`kishinka skipped: ${error.message}`);
        }
      } else {
        this.activateKishinka();
      }
    }

    if (Array.isArray(turn.swaps)) {
      for (const swap of turn.swaps) {
        if (isForceMode) {
          try {
            const from = this.resolveScenarioSwapEndpointPosition(swap, 'from');
            const to = this.resolveScenarioSwapEndpointPosition(swap, 'to');
            this.queueSwap(from, to);
          } catch (error) {
            warn(`swap skipped: ${error.message}`);
          }
        } else {
          const from = this.resolveScenarioSwapEndpointPosition(swap, 'from');
          const to = this.resolveScenarioSwapEndpointPosition(swap, 'to');
          this.queueSwap(from, to);
        }
      }
    }

    if (Array.isArray(turn.actions)) {
      this.alignScenarioActionPositions(turn.actions, {
        forceMode: isForceMode,
        onWarning: warn,
      });
      for (const action of turn.actions) {
        if (isForceMode) {
          try {
            this.setScenarioActionOnDom(action);
          } catch (error) {
            warn(`action override skipped: ${error.message}`);
          }
        } else {
          this.setScenarioActionOnDom(action);
        }
      }
    }

    if (Number.isFinite(Number(turn.interruptOdLevel))) {
      this.pendingInterruptOdLevel = Number(turn.interruptOdLevel);
      this.interruptOdProjection = null;
      this.renderOdControls();
    }

    if (mode === 'stage') {
      this.previewRecord = null;
      this.resetInterruptOdProjection({ clearReservation: false });
      this.writePreviewOutput('');
      return null;
    }

    const doCommit = mode === 'commit' ? turn.commit !== false : false;
    const effectiveCommitOptions = {
      ...commitOptions,
      previewOptions: {
        ...(isForceMode ? { skipSkillConditions: true } : {}),
        ...((commitOptions.previewOptions && typeof commitOptions.previewOptions === 'object')
          ? commitOptions.previewOptions
          : {}),
      },
      forceOdOverride:
        commitOptions.forceOdOverride !== undefined
          ? commitOptions.forceOdOverride
          : isForceMode,
      forceResourceDeficit:
        commitOptions.forceResourceDeficit !== undefined
          ? commitOptions.forceResourceDeficit
          : isForceMode,
    };
    if (!doCommit) {
      return this.previewCurrentTurn(effectiveCommitOptions.previewOptions);
    }
    return this.commitCurrentTurn(effectiveCommitOptions);
  }

  stageCurrentScenarioTurn() {
    this.ensureScenarioSetupApplied();
    const turns = Array.isArray(this.scenario.turns) ? this.scenario.turns : [];
    if (this.scenarioCursor >= turns.length) {
      this.setStatus('Scenario completed.');
      this.renderScenarioStatus();
      return null;
    }
    const turn = turns[this.scenarioCursor] ?? {};
    const result = this.applyScenarioTurn(turn, { mode: 'stage' });
    this.scenarioStagedTurnIndex = this.scenarioCursor;
    this.renderScenarioStatus();
    this.setStatus(
      `Scenario turn ${this.scenarioCursor + 1}/${turns.length} staged. Adjust controls, then Commit Turn.`
    );
    return result;
  }

  runNextScenarioTurn() {
    this.ensureScenarioSetupApplied();
    const turns = Array.isArray(this.scenario.turns) ? this.scenario.turns : [];
    if (this.scenarioCursor >= turns.length) {
      this.setStatus('Scenario completed.');
      this.renderScenarioStatus();
      return null;
    }
    const turn = turns[this.scenarioCursor] ?? {};
    const result = this.applyScenarioTurn(turn, { mode: 'commit' });
    this.scenarioCursor += 1;
    this.scenarioStagedTurnIndex = null;
    this.renderScenarioStatus();
    this.setStatus(`Scenario turn ${this.scenarioCursor}/${turns.length} executed.`);
    return result;
  }

  runAllScenarioTurns() {
    this.ensureScenarioSetupApplied();
    const turns = Array.isArray(this.scenario.turns) ? this.scenario.turns : [];
    while (this.scenarioCursor < turns.length) {
      this.runNextScenarioTurn();
    }
    this.setStatus(`Scenario completed (${turns.length} turns).`);
    this.renderScenarioStatus();
    return this.recordStore.records.length;
  }

  renderSwapSelectors() {
    if (!this.state) {
      return;
    }

    const fromSelect = this.root.querySelector('[data-role="swap-from"]');
    const toSelect = this.root.querySelector('[data-role="swap-to"]');
    if (!fromSelect || !toSelect) {
      return;
    }

    const allMembers = this.state.party.slice().sort((a, b) => a.position - b.position);
    const hasAnyExtra = allMembers.some((member) => Boolean(member?.isExtraActive));
    const members = hasAnyExtra
      ? allMembers.filter((member) => Boolean(member?.isExtraActive))
      : allMembers;
    const prevFrom = String(fromSelect.value ?? '');
    const prevTo = String(toSelect.value ?? '');

    fromSelect.innerHTML = '';
    for (const member of members) {
      const option = this.doc.createElement('option');
      option.value = String(member.position);
      option.textContent = formatSwapMemberLabel(member);
      fromSelect.appendChild(option);
    }

    const hasPrevFrom = [...fromSelect.options].some((option) => option.value === prevFrom);
    fromSelect.value = hasPrevFrom ? prevFrom : fromSelect.options[0]?.value ?? '0';
    this.renderSwapToOptions(toInt(fromSelect.value, 0), prevTo);
  }

  renderSwapToOptions(fromPositionIndex, preferredTo = null) {
    if (!this.state) {
      return;
    }

    const toSelect = this.root.querySelector('[data-role="swap-to"]');
    if (!toSelect) {
      return;
    }

    const fromMember = this.state.party.find((member) => member.position === fromPositionIndex) ?? null;
    if (!fromMember) {
      toSelect.innerHTML = '';
      return;
    }

    const hasAnyExtra = this.state.party.some((m) => m.isExtraActive);

    const candidates = this.state.party
      .slice()
      .sort((a, b) => a.position - b.position)
      .filter(
        (member) => member.position !== fromPositionIndex && canSwapByExtraState(fromMember, member, hasAnyExtra)
      );

    toSelect.innerHTML = '';
    if (candidates.length === 0) {
      const option = this.doc.createElement('option');
      option.value = '';
      option.textContent = '(No valid target)';
      option.selected = true;
      option.disabled = true;
      toSelect.appendChild(option);
      return;
    }

    for (const member of candidates) {
      const option = this.doc.createElement('option');
      option.value = String(member.position);
      option.textContent = formatSwapMemberLabel(member);
      toSelect.appendChild(option);
    }

    const desired = String(preferredTo ?? '');
    const hasPreferred = [...toSelect.options].some((option) => option.value === desired);
    toSelect.value = hasPreferred ? desired : toSelect.options[0]?.value ?? '';
  }

  renderTurnStatus() {
    if (!this.state) {
      return;
    }

    const turnLabel = this.root.querySelector('[data-role="turn-label"]');
    const fieldStateLabel = this.root.querySelector('[data-role="field-state-label"]');
    if (turnLabel) {
      const seq = String(Math.max(0, Number(this.state.turnState.sequenceId ?? 1))).padStart(2, '0');
      const baseTurn = `T${String(Math.max(0, Number(this.state.turnState.turnIndex ?? 1))).padStart(2, '0')}`;
      const odTurn = deriveDisplayedOdTurn(this.state.turnState);
      const exTurn = this.state.turnState.turnType === 'extra' ? 'EX' : '';
      const odGauge = Number(this.state.turnState.odGauge ?? 0);
      const transcendence = this.state.turnState.transcendence;
      const hasTranscendenceGauge = Boolean(transcendence?.active);
      const transcendenceValue = hasTranscendenceGauge
        ? `${formatTranscendencePercent(Number(transcendence?.gaugePercent ?? 0))}%`
        : '---';
      // 固定幅で見やすくする（列伸縮を抑える）
      const seqCol = seq.padStart(2, '0');
      const turnCol = baseTurn.padEnd(3, ' ');
      const odTurnCol = odTurn.padEnd(6, ' ');
      const exCol = exTurn.padEnd(2, ' ');
      turnLabel.textContent = `${seqCol} | ${turnCol} | ${odTurnCol} | ${exCol} | OD=${formatGaugePercent(odGauge)}% | 超越=${transcendenceValue}`;
    }
    if (fieldStateLabel) {
      fieldStateLabel.textContent = formatFieldStateLabel(this.state.turnState);
    }
    this.renderOdControls();
    this.renderKishinkaControls();
    this.renderEnemyStatusControls();
    this.renderEnemyConfigControls();
  }

  isForceOdEnabled() {
    const toggle = this.root.querySelector('[data-role="force-od-toggle"]');
    return Boolean(toggle?.checked);
  }

  createPreemptiveOdCheckpoint() {
    if (!this.state) {
      return null;
    }
    return {
      turnState: cloneTurnState(this.state.turnState),
      partySnapshots: this.state.party.map((member) => member.snapshot()),
      previewRecord: this.previewRecord ? structuredClone(this.previewRecord) : null,
      pendingSwapEvents: this.pendingSwapEvents.map((event) => ({ ...event })),
      pendingInterruptOdLevel: this.pendingInterruptOdLevel,
      interruptOdProjection: this.interruptOdProjection ? structuredClone(this.interruptOdProjection) : null,
    };
  }

  restorePreemptiveOdCheckpoint(checkpoint) {
    if (!this.state || !checkpoint) {
      return;
    }

    this.state.turnState = cloneTurnState(checkpoint.turnState);
    const byId = new Map(
      (Array.isArray(checkpoint.partySnapshots) ? checkpoint.partySnapshots : []).map((snap) => [
        String(snap?.characterId ?? ''),
        snap,
      ])
    );

    for (const member of this.state.party) {
      const snap = byId.get(String(member.characterId));
      if (!snap) {
        continue;
      }
      member.setPosition(Number(snap.position ?? member.position));
      member.sp.current = Number(snap.sp?.current ?? member.sp.current);
      member.sp.max = Number(snap.sp?.max ?? member.sp.max);
      member.ep.current = Number(snap.ep?.current ?? member.ep.current);
      member.ep.max = Number(snap.ep?.max ?? member.ep.max);
      member.tokenState.current = Number(snap.tokenState?.current ?? member.tokenState?.current ?? 0);
      member.tokenState.min = Number(snap.tokenState?.min ?? member.tokenState?.min ?? 0);
      member.tokenState.max = Number(snap.tokenState?.max ?? member.tokenState?.max ?? 10);
      member.moraleState.current = Number(snap.moraleState?.current ?? member.moraleState?.current ?? 0);
      member.moraleState.min = Number(snap.moraleState?.min ?? member.moraleState?.min ?? 0);
      member.moraleState.max = Number(snap.moraleState?.max ?? member.moraleState?.max ?? 10);
      member.motivationState.current = Number(snap.motivationState?.current ?? member.motivationState?.current ?? 3);
      member.motivationState.min = Number(snap.motivationState?.min ?? member.motivationState?.min ?? 1);
      member.motivationState.max = Number(snap.motivationState?.max ?? member.motivationState?.max ?? 5);
      member.isAlive = Boolean(snap.isAlive);
      member.isBreak = Boolean(snap.isBreak);
      member.isExtraActive = Boolean(snap.isExtraActive);
      member.isReinforcedMode = Boolean(snap.isReinforcedMode);
      member.normalAttackElements = Object.freeze(
        Array.isArray(snap.normalAttackElements)
          ? [...new Set(snap.normalAttackElements.map((element) => String(element ?? '')).filter(Boolean))]
          : []
      );
      member.reinforcedTurnsRemaining = Number(snap.reinforcedTurnsRemaining ?? member.reinforcedTurnsRemaining ?? 0);
      member.actionDisabledTurns = Number(snap.actionDisabledTurns ?? member.actionDisabledTurns ?? 0);
      member.statusEffects = structuredClone(snap.statusEffects ?? []);
      const rawCounts = snap.skillUseCounts ?? {};
      member.skillUseCounts = new Map(
        Object.entries(rawCounts).map(([label, count]) => [String(label), Number(count ?? 0)])
      );
      member._revision = Number(snap.revision ?? member.revision ?? 0);
    }

    this.state.positionMap = buildPositionMap(this.state.party);
    this.previewRecord = checkpoint.previewRecord ? structuredClone(checkpoint.previewRecord) : null;
    this.pendingSwapEvents = checkpoint.pendingSwapEvents.map((event) => ({ ...event }));
    this.pendingInterruptOdLevel = checkpoint.pendingInterruptOdLevel ?? null;
    this.interruptOdProjection = checkpoint.interruptOdProjection
      ? structuredClone(checkpoint.interruptOdProjection)
      : null;
  }

  resetInterruptOdProjection(options = {}) {
    const clearReservation = options.clearReservation !== false;
    const closeDialog = options.closeDialog !== false;
    this.interruptOdProjection = null;
    if (clearReservation) {
      this.pendingInterruptOdLevel = null;
    }
    if (closeDialog) {
      const dialog = this.root.querySelector('[data-role="interrupt-od-dialog"]');
      if (dialog) {
        dialog.hidden = true;
      }
    }
  }

  buildInterruptOdProjection() {
    if (!this.state) {
      throw new Error('State is not initialized.');
    }
    if (this.state.turnState.turnType === 'od') {
      throw new Error('ODターン中は割込ODを計算できません。');
    }

    const enemyAction = this.root.querySelector('[data-role="enemy-action"]')?.value ?? null;
    const enemyCount = this.readEnemyCountFromDom();
    this.syncEnemyStateFromDom();
    const actions = this.collectActionDictFromDom();
    const projectionRecord = previewTurn(this.state, actions, enemyAction, enemyCount);
    const projectedGaugeRaw = Number(
      projectionRecord?.projections?.odGaugeAtEnd ?? this.state.turnState.odGauge ?? 0
    );
    const projectedGauge = Number.isFinite(projectedGaugeRaw) ? projectedGaugeRaw : 0;
    const candidates = OD_LEVELS.filter((level) => this.canActivateOdLevel(level, projectedGauge));
    this.interruptOdProjection = {
      projectedGauge: Number(projectedGauge.toFixed(2)),
      candidates,
    };
    return this.interruptOdProjection;
  }

  canActivateOdLevel(level, gaugeOverride = null) {
    if (!this.state) {
      return false;
    }
    if (this.isForceOdEnabled()) {
      return true;
    }
    const numericLevel = Number(level);
    const hasGaugeOverride =
      gaugeOverride !== null && gaugeOverride !== undefined && Number.isFinite(Number(gaugeOverride));
    const gauge = hasGaugeOverride
      ? Number(gaugeOverride)
      : Number(this.state.turnState.odGauge ?? 0);
    return gauge >= getOdGaugeRequirement(numericLevel);
  }

  canShowInterruptOdButton() {
    return true;
  }

  renderOdControls() {
    const openOdButton = this.root.querySelector('[data-action="open-od"]');
    const openInterruptButton = this.root.querySelector('[data-action="open-interrupt-od"]');
    const interruptBadge = this.root.querySelector('[data-role="interrupt-od-badge"]');
    const interruptProjection = this.root.querySelector('[data-role="interrupt-od-projection"]');
    const normalDialog = this.root.querySelector('[data-role="od-dialog"]');
    const interruptDialog = this.root.querySelector('[data-role="interrupt-od-dialog"]');
    if (!this.state) {
      if (openOdButton) {
        openOdButton.disabled = true;
      }
      if (openInterruptButton) {
        openInterruptButton.hidden = false;
        openInterruptButton.disabled = true;
      }
      if (interruptBadge) {
        interruptBadge.textContent = '';
      }
      if (interruptProjection) {
        interruptProjection.textContent = '';
        interruptProjection.hidden = true;
      }
      return;
    }

    const isOdTurn = this.state.turnState.turnType === 'od';
    if (normalDialog) {
      normalDialog.hidden = false;
    }
    // ダイアログは「割込ODが有効な通常/EXターン」かつ「見込み計算が存在する」時のみ表示を許可。
    if (interruptDialog && (isOdTurn || !this.interruptOdProjection)) {
      interruptDialog.hidden = true;
    }
    const isInterruptDialogOpen = Boolean(interruptDialog && !interruptDialog.hidden);
    if (openOdButton) {
      openOdButton.disabled = isOdTurn;
    }
    if (openInterruptButton) {
      openInterruptButton.hidden = !this.canShowInterruptOdButton();
      openInterruptButton.disabled = isOdTurn;
    }
    if (interruptBadge) {
      interruptBadge.textContent =
        this.pendingInterruptOdLevel !== null
          ? `割込OD予約: OD${this.pendingInterruptOdLevel}`
          : '';
    }
    if (interruptProjection) {
      const projectedGauge = Number(this.interruptOdProjection?.projectedGauge ?? NaN);
      if (Number.isFinite(projectedGauge) && isInterruptDialogOpen) {
        const labels = Array.isArray(this.interruptOdProjection?.candidates)
          ? this.interruptOdProjection.candidates.map((level) => `OD${level}`).join(', ')
          : '';
        interruptProjection.textContent = `見込みOD: ${formatGaugePercent(projectedGauge)}%${
          labels ? ` / 候補: ${labels}` : ' / 候補なし'
        }`;
        interruptProjection.hidden = false;
      } else {
        interruptProjection.textContent = '';
        interruptProjection.hidden = true;
      }
    }
  }

  openOdDialog(mode) {
    const normalDialog = this.root.querySelector('[data-role="od-dialog"]');
    const interruptDialog = this.root.querySelector('[data-role="interrupt-od-dialog"]');
    if (interruptDialog) {
      interruptDialog.hidden = true;
    }
    if (mode === 'normal' && normalDialog) {
      normalDialog.hidden = false;
    }

    const dialog = this.root.querySelector(
      mode === 'interrupt' ? '[data-role="interrupt-od-dialog"]' : '[data-role="od-dialog"]'
    );
    const select = this.root.querySelector(
      mode === 'interrupt' ? '[data-role="interrupt-od-level"]' : '[data-role="od-level"]'
    );
    if (!dialog || !select) {
      return;
    }

    const candidates =
      mode === 'interrupt'
        ? this.buildInterruptOdProjection().candidates
        : OD_LEVELS.filter((level) => this.canActivateOdLevel(level));
    if (candidates.length === 0) {
      if (mode === 'interrupt') {
        const projected = Number(this.interruptOdProjection?.projectedGauge ?? 0);
        throw new Error(
          `見込みODが不足しているため割込ODを予約できません。(見込み ${formatGaugePercent(projected)}%)`
        );
      }
      throw new Error('ODゲージが不足しているため発動できません。');
    }

    select.innerHTML = '';
    for (const level of candidates) {
      const option = this.doc.createElement('option');
      option.value = String(level);
      option.textContent = `OD${level}`;
      select.appendChild(option);
    }
    if (
      mode === 'interrupt' &&
      Number.isFinite(Number(this.pendingInterruptOdLevel)) &&
      candidates.includes(Number(this.pendingInterruptOdLevel))
    ) {
      select.value = String(this.pendingInterruptOdLevel);
    }
    dialog.hidden = false;
    this.renderOdControls();
  }

  closeOdDialog(mode) {
    const dialog = this.root.querySelector(
      mode === 'interrupt' ? '[data-role="interrupt-od-dialog"]' : '[data-role="od-dialog"]'
    );
    if (dialog) {
      dialog.hidden = mode === 'interrupt';
    }
    if (mode === 'interrupt') {
      this.resetInterruptOdProjection({ clearReservation: true, closeDialog: false });
      this.renderOdControls();
    } else if (this.preemptiveOdCheckpoint) {
      this.restorePreemptiveOdCheckpoint(this.preemptiveOdCheckpoint);
      this.preemptiveOdCheckpoint = null;
      this.renderActionSelectors();
      this.renderPartyState();
      this.renderSwapSelectors();
      this.renderTurnStatus();
      this.renderOdControls();
    }
    this.setStatus(mode === 'interrupt' ? '割込OD設定をキャンセルしました。' : 'OD発動をキャンセルしました。');
  }

  confirmOdDialog(mode) {
    const select = this.root.querySelector(
      mode === 'interrupt' ? '[data-role="interrupt-od-level"]' : '[data-role="od-level"]'
    );
    const level = toInt(select?.value, 1);
    const interruptProjectedGauge = Number(this.interruptOdProjection?.projectedGauge ?? NaN);
    const gaugeForValidation =
      mode === 'interrupt' && Number.isFinite(interruptProjectedGauge) ? interruptProjectedGauge : null;
    if (!this.canActivateOdLevel(level, gaugeForValidation)) {
      throw new Error(`OD${level}を発動できません。`);
    }

    if (mode === 'interrupt') {
      if (!this.interruptOdProjection) {
        throw new Error('割込OD見込みが未計算です。割込ODボタンから再計算してください。');
      }
      if (!this.interruptOdProjection.candidates.includes(level) && !this.isForceOdEnabled()) {
        throw new Error(`見込みODでは OD${level} を予約できません。`);
      }
      this.pendingInterruptOdLevel = level;
      const dialog = this.root.querySelector('[data-role="interrupt-od-dialog"]');
      if (dialog) {
        dialog.hidden = true;
      }
      this.renderOdControls();
      this.setStatus(`割込ODを予約しました: OD${level}`);
      return;
    }

    this.preemptiveOdCheckpoint = this.createPreemptiveOdCheckpoint();
    this.state = activateOverdrive(this.state, level, 'preemptive', {
      forceActivation: this.isForceOdEnabled(),
    });
    this.appendPassiveLogEvents(this.state?.turnState?.passiveEventsLastApplied ?? []);
    const dialog = this.root.querySelector('[data-role="od-dialog"]');
    if (dialog) {
      dialog.hidden = false;
    }
    this.resetInterruptOdProjection({ clearReservation: true, closeDialog: false });
    this.previewRecord = null;
    this.pendingSwapEvents = [];
    this.writePreviewOutput('');
    this.renderActionSelectors();
    this.renderPartyState();
    this.renderSwapSelectors();
    this.renderTurnStatus();
    this.renderOdControls();
    this.setStatus(`OD${level}を発動しました。`);
  }

  findTezukaMember() {
    return this.state?.party?.find((member) => member.characterId === TEZUKA_CHARACTER_ID) ?? null;
  }

  renderKishinkaControls() {
    const button = this.root.querySelector('[data-action="kishinka"]');
    const badge = this.root.querySelector('[data-role="kishinka-state"]');
    if (!button || !badge) {
      return;
    }

    const tezuka = this.findTezukaMember();
    if (!tezuka) {
      button.hidden = true;
      badge.textContent = '';
      return;
    }

    button.hidden = false;
    button.disabled = Boolean(tezuka.isReinforcedMode) || Number(tezuka.actionDisabledTurns ?? 0) > 0;

    if (tezuka.isReinforcedMode) {
      badge.textContent = `鬼神化中: 残り${tezuka.reinforcedTurnsRemaining}ターン`;
      return;
    }

    if (Number(tezuka.actionDisabledTurns ?? 0) > 0) {
      badge.textContent = `行動不能: 残り${tezuka.actionDisabledTurns}ターン`;
      return;
    }

    badge.textContent = '鬼神化待機';
  }

  activateKishinka() {
    if (!this.state) {
      throw new Error('State is not initialized.');
    }
    const tezuka = this.findTezukaMember();
    if (!tezuka) {
      throw new Error('手塚 咲がパーティ内にいません。');
    }
    if (tezuka.isReinforcedMode) {
      throw new Error('すでに鬼神化中です。');
    }
    if (Number(tezuka.actionDisabledTurns ?? 0) > 0) {
      throw new Error('行動不能中は鬼神化できません。');
    }

    tezuka.activateReinforcedMode(3);
    const currentOd = Number(this.state.turnState.odGauge ?? 0);
    const nextOd = Math.min(OD_GAUGE_MAX_PERCENT, currentOd + REINFORCED_MODE_OD_GAUGE_BONUS);
    this.state.turnState.odGauge = Number(nextOd.toFixed(2));
    this.kishinkaActivatedThisTurn = true;
    this.previewRecord = null;
    this.resetInterruptOdProjection({ clearReservation: true });
    this.writePreviewOutput('');
    this.renderActionSelectors();
    this.renderPartyState();
    this.renderSwapSelectors();
    this.renderTurnStatus();
    this.setStatus('手塚 咲が鬼神化しました。OD+15%');
  }

  renderPartyState() {
    if (!this.state) {
      return;
    }

    const container = this.root.querySelector('[data-role="party-state"]');
    if (!container) {
      return;
    }

    const rows = this.state.party
      .slice()
      .sort((a, b) => a.position - b.position)
      .map((member) => {
        const frontBack = member.position <= 2 ? 'Front' : 'Back';
        const extraTag = member.isExtraActive ? ' [EX]' : '';
        const kishinTag = member.isReinforcedMode
          ? ` [鬼神化:${member.reinforcedTurnsRemaining}]`
          : Number(member.actionDisabledTurns ?? 0) > 0
            ? ` [行動不能:${member.actionDisabledTurns}]`
            : '';
        const tokenText = hasTokenPassiveSupport(member)
          ? ` / Token=${member.tokenState?.current ?? 0}`
          : '';
        const moraleText = hasVisibleMoraleState(member)
          ? ` / Morale=${member.moraleState?.current ?? 0}`
          : '';
        const motivationText = ` / Motivation=${formatMotivationLabel(member.motivationState?.current ?? 3)}`;
        if (String(member.characterId) === 'NNanase') {
          return `<li>Pos ${member.position + 1} [${frontBack}] ${member.characterName}${extraTag}${kishinTag} SP=${member.sp.current} / EP=${member.ep.current}${tokenText}${moraleText}${motivationText}</li>`;
        }
        return `<li>Pos ${member.position + 1} [${frontBack}] ${member.characterName}${extraTag}${kishinTag} SP=${member.sp.current}${tokenText}${moraleText}${motivationText}</li>`;
      })
      .join('');

    container.innerHTML = rows;
    this.renderTokenDebugControls();
    this.renderSwapSelectors();
  }

  renderTokenDebugControls() {
    const container = this.root.querySelector('[data-role="token-debug-list"]');
    if (!container) {
      return;
    }
    if (!this.state?.party) {
      container.innerHTML = '';
      return;
    }

    const rows = this.state.party
      .slice()
      .sort((a, b) => a.position - b.position)
      .filter((member) => hasTokenPassiveSupport(member))
      .map((member) => {
        const current = Number(member.tokenState?.current ?? 0);
        const max = Number(member.tokenState?.max ?? 10);
        return `
          <label class="style-slot">
            Token ${member.position + 1}:${member.characterName}
            <input
              data-role="token-debug-input"
              data-character-id="${member.characterId}"
              type="number"
              min="0"
              max="${max}"
              step="1"
              value="${current}"
            />
          </label>
        `;
      })
      .join('');
    container.innerHTML = rows;
  }

  getTurnPlanRecalcModeFromDom() {
    const select = this.root.querySelector('[data-role="turn-plan-recalc-mode"]');
    if (select && String(select.value ?? '') === 'force') {
      return 'force';
    }
    return 'strict';
  }

  renderTurnPlanEditControls() {
    const toolbar = this.root.querySelector('[data-role="turn-plan-edit-toolbar"]');
    const title = this.root.querySelector('[data-role="turn-plan-edit-title"]');
    if (!toolbar) {
      return;
    }
    const session = this.turnPlanEditSession;
    if (!session) {
      toolbar.hidden = true;
      if (title) {
        title.textContent = '';
      }
      return;
    }
    toolbar.hidden = false;
    if (!title) {
      return;
    }
    if (session.type === 'insert') {
      title.textContent = `Turn ${session.targetIndex + 1} に挿入編集中`;
      return;
    }
    title.textContent = `Turn ${session.targetIndex + 1} を編集中`;
  }

  renderTurnPlanRecalcStatus() {
    const node = this.root.querySelector('[data-role="turn-plan-recalc-status"]');
    if (!node) {
      return;
    }
    const warningCount = this.turnPlanReplayWarnings.reduce(
      (sum, list) => sum + (Array.isArray(list) ? list.length : 0),
      0
    );
    if (this.turnPlanReplayError) {
      node.textContent = `再計算: ${this.turnPlanRecalcMode} / Error@${this.turnPlanReplayError.index + 1}`;
      return;
    }
    if (warningCount > 0) {
      node.textContent = `再計算: ${this.turnPlanRecalcMode} / Warnings=${warningCount}`;
      return;
    }
    node.textContent = `再計算: ${this.turnPlanRecalcMode}`;
  }

  normalizeTurnPlan(plan = {}) {
    const setupDelta = plan.setupDelta && typeof plan.setupDelta === 'object' ? plan.setupDelta : {};
    const normalizedEnemyCount = clampEnemyCount(
      toInt(plan.enemyCount ?? setupDelta.enemyCount, DEFAULT_ENEMY_COUNT)
    );
    const enemyStatuses = Array.isArray(plan.enemyStatuses)
      ? plan.enemyStatuses
          .map((status) => ({
            statusType: String(status?.statusType ?? ENEMY_STATUS_DOWN_TURN),
            targetIndex: Math.max(0, Math.min(normalizedEnemyCount - 1, toInt(status?.targetIndex ?? status?.target, 0))),
            remainingTurns: isPersistentEnemyStatus(String(status?.statusType ?? ENEMY_STATUS_DOWN_TURN))
              ? 0
              : Math.max(1, toInt(status?.remainingTurns, 1)),
          }))
          .filter((status) => status.statusType.length > 0)
      : Array.isArray(setupDelta.enemyStatuses)
        ? setupDelta.enemyStatuses
          .map((status) => ({
            statusType: String(status?.statusType ?? ENEMY_STATUS_DOWN_TURN),
            targetIndex: Math.max(0, Math.min(normalizedEnemyCount - 1, toInt(status?.targetIndex ?? status?.target, 0))),
            remainingTurns: isPersistentEnemyStatus(String(status?.statusType ?? ENEMY_STATUS_DOWN_TURN))
              ? 0
              : Math.max(1, toInt(status?.remainingTurns, 1)),
          }))
          .filter((status) => status.statusType.length > 0)
        : [];
    const enemyNames = normalizeEnemyNamesByEnemy(
      plan.enemyNames ?? plan.enemyNamesByEnemy ?? setupDelta.enemyNames ?? setupDelta.enemyNamesByEnemy
    );
    const enemyDamageRates = normalizeEnemyDamageRatesByEnemy(
      plan.enemyDamageRates ?? plan.damageRatesByEnemy ?? setupDelta.enemyDamageRates ?? setupDelta.damageRatesByEnemy
    );
    const zoneState = normalizeFieldStateForScenario(plan.zoneState ?? setupDelta.zoneState);
    const territoryState = normalizeFieldStateForScenario(plan.territoryState ?? setupDelta.territoryState);
    const actions = Array.isArray(plan.actions)
      ? plan.actions
        .map((action) => ({
          positionIndex:
            Number.isFinite(Number(action?.positionIndex))
              ? Math.max(0, Math.min(5, toInt(action.positionIndex, 0)))
              : action?.position === undefined || action?.position === null || String(action.position).trim() === ''
                ? null
                : this.resolveScenarioPosition(action.position),
          characterId: String(action?.characterId ?? ''),
          characterName: String(action?.characterName ?? ''),
          skillId: Number(action?.skillId ?? 0),
          targetCharacterId: String(action?.targetCharacterId ?? ''),
          targetEnemyIndex:
            Number.isFinite(Number(action?.targetEnemyIndex)) ? Math.max(0, toInt(action.targetEnemyIndex, 0)) : null,
        }))
        .filter(
          (action) =>
            (Number.isFinite(Number(action.positionIndex)) || action.characterId || action.characterName) &&
            Number.isFinite(action.skillId)
        )
      : [];
    const swaps = Array.isArray(plan.swaps)
      ? plan.swaps
        .map((swap) => ({
          fromCharacterId: String(swap?.fromCharacterId ?? ''),
          fromCharacterName: String(swap?.fromCharacterName ?? ''),
          fromStyleId:
            swap?.fromStyleId === undefined || swap?.fromStyleId === null
              ? ''
              : String(swap.fromStyleId),
          fromStyleName: String(swap?.fromStyleName ?? ''),
          toCharacterId: String(swap?.toCharacterId ?? ''),
          toCharacterName: String(swap?.toCharacterName ?? ''),
          toStyleId:
            swap?.toStyleId === undefined || swap?.toStyleId === null ? '' : String(swap.toStyleId),
          toStyleName: String(swap?.toStyleName ?? ''),
        }))
        .filter(
          (swap) =>
            (swap.fromCharacterId || swap.fromCharacterName || swap.fromStyleId || swap.fromStyleName) &&
            (swap.toCharacterId || swap.toCharacterName || swap.toStyleId || swap.toStyleName)
        )
      : [];
    const preemptiveOdLevel = Number(plan.preemptiveOdLevel ?? 0);
    const interruptOdLevel = Number(plan.interruptOdLevel ?? 0);
    return {
      enemyAction: String(plan.enemyAction ?? ''),
      enemyCount: normalizedEnemyCount,
      setupDelta: {
        enemyCount: normalizedEnemyCount,
        enemyNames,
        enemyDamageRates,
        enemyStatuses,
        ...(zoneState ? { zoneState } : {}),
        ...(territoryState ? { territoryState } : {}),
      },
      actions,
      swaps,
      preemptiveOdLevel:
        Number.isFinite(preemptiveOdLevel) && preemptiveOdLevel >= 1 && preemptiveOdLevel <= 3
          ? preemptiveOdLevel
          : null,
      interruptOdLevel:
        Number.isFinite(interruptOdLevel) && interruptOdLevel >= 1 && interruptOdLevel <= 3
          ? interruptOdLevel
          : null,
      kishinka: Boolean(plan.kishinka),
      commit: true,
    };
  }

  captureCurrentTurnPlanFromDom() {
    if (!this.state) {
      throw new Error('State is not initialized.');
    }
    this.syncEnemyStateFromDom();
    const actionDict = this.collectActionDictFromDom();
    const actions = Object.entries(actionDict)
      .sort((a, b) => Number(a[0]) - Number(b[0]))
      .map(([, action]) => {
        const member = this.state.party.find((item) => item.characterId === String(action.characterId)) ?? null;
        return {
          positionIndex: Number(member?.position ?? -1),
          characterId: String(action.characterId),
          characterName: String(member?.characterName ?? ''),
          skillId: Number(action.skillId),
          targetCharacterId: String(action.targetCharacterId ?? ''),
          ...(Number.isFinite(Number(action.targetEnemyIndex))
            ? { targetEnemyIndex: Number(action.targetEnemyIndex) }
            : {}),
        };
      });
    const isPreemptiveOdStep1 =
      String(this.state.turnState.turnType ?? '') === 'od' &&
      String(this.state.turnState.odContext ?? '') === 'preemptive' &&
      Number(this.state.turnState.remainingOdActions ?? 0) === Number(this.state.turnState.odLevel ?? 0);
    const preemptiveOdLevel = isPreemptiveOdStep1 ? Number(this.state.turnState.odLevel ?? 0) : null;
    const swaps = this.pendingSwapEvents.map((event) => ({
      fromCharacterId: String(event.outCharacterId ?? ''),
      fromCharacterName: String(event.outCharacterName ?? ''),
      toCharacterId: String(event.inCharacterId ?? ''),
      toCharacterName: String(event.inCharacterName ?? ''),
    }));
    return this.normalizeTurnPlan({
      enemyAction: this.root.querySelector('[data-role="enemy-action"]')?.value ?? '',
      enemyCount: this.readEnemyCountFromDom(),
      enemyNames: normalizeEnemyNamesByEnemy(this.state.turnState.enemyState?.enemyNamesByEnemy),
      enemyDamageRates: normalizeEnemyDamageRatesByEnemy(this.state.turnState.enemyState?.damageRatesByEnemy),
      enemyStatuses: this.getEnemyStatuses().map((status) => ({
        statusType: String(status?.statusType ?? ''),
        targetIndex: Number(status?.targetIndex ?? 0),
        remainingTurns: Number(status?.remainingTurns ?? 0),
      })),
      zoneState: normalizeFieldStateForScenario(this.state.turnState?.zoneState),
      territoryState: normalizeFieldStateForScenario(this.state.turnState?.territoryState),
      actions,
      swaps,
      preemptiveOdLevel,
      interruptOdLevel: this.pendingInterruptOdLevel,
      kishinka: this.kishinkaActivatedThisTurn,
    });
  }

  toScenarioTurnFromTurnPlan(plan) {
    const normalized = this.normalizeTurnPlan(plan);
    const out = {
      enemyAction: normalized.enemyAction,
      enemyCount: normalized.setupDelta.enemyCount,
      commit: true,
    };
    if (Object.keys(normalized.setupDelta.enemyNames ?? {}).length > 0) {
      out.enemyNames = structuredClone(normalized.setupDelta.enemyNames);
    }
    if (Object.keys(normalized.setupDelta.enemyDamageRates ?? {}).length > 0) {
      out.enemyDamageRates = structuredClone(normalized.setupDelta.enemyDamageRates);
    }
    if (Array.isArray(normalized.setupDelta.enemyStatuses) && normalized.setupDelta.enemyStatuses.length > 0) {
      out.enemyStatuses = structuredClone(normalized.setupDelta.enemyStatuses);
    }
    if (normalized.setupDelta.zoneState) {
      out.zoneState = structuredClone(normalized.setupDelta.zoneState);
    }
    if (normalized.setupDelta.territoryState) {
      out.territoryState = structuredClone(normalized.setupDelta.territoryState);
    }
    if (normalized.preemptiveOdLevel !== null) {
      out.preemptiveOdLevel = normalized.preemptiveOdLevel;
    }
    if (normalized.interruptOdLevel !== null) {
      out.interruptOdLevel = normalized.interruptOdLevel;
    }
    if (normalized.kishinka) {
      out.kishinka = true;
    }
    if (normalized.actions.length > 0) {
      out.actions = normalized.actions.map((action) => ({
        ...(Number.isFinite(Number(action.positionIndex))
          ? { positionIndex: Number(action.positionIndex) }
          : {}),
        characterId: action.characterId,
        characterName: action.characterName,
        skillId: action.skillId,
        ...(action.targetCharacterId ? { targetCharacterId: action.targetCharacterId } : {}),
        ...(Number.isFinite(Number(action.targetEnemyIndex))
          ? { targetEnemyIndex: Number(action.targetEnemyIndex) }
          : {}),
      }));
    }
    if (normalized.swaps.length > 0) {
      out.swaps = normalized.swaps.map((swap) => ({
        fromCharacterId: swap.fromCharacterId,
        fromCharacterName: swap.fromCharacterName,
        fromStyleId: swap.fromStyleId,
        fromStyleName: swap.fromStyleName,
        toCharacterId: swap.toCharacterId,
        toCharacterName: swap.toCharacterName,
        toStyleId: swap.toStyleId,
        toStyleName: swap.toStyleName,
      }));
    }
    return out;
  }

  enableForceResourceDeficitMode() {
    if (!this.state?.party) {
      return;
    }
    for (const member of this.state.party) {
      member.sp.min = FORCE_RESOURCE_MIN;
    }
  }

  reinitializeFromTurnPlanBase({ forceMode = false } = {}) {
    if (!this.turnPlanBaseSetup) {
      throw new Error('TurnPlan replay base is not initialized. Please initialize battle first.');
    }
    const base = structuredClone(this.turnPlanBaseSetup);
    this.setDomValue('[data-role="enemy-count"]', Number(base.enemyCount ?? 1));
    const forceToggle = this.root.querySelector('[data-role="force-od-toggle"]');
    if (forceToggle && typeof base.forceOdToggle === 'boolean') {
      forceToggle.checked = Boolean(base.forceOdToggle);
    }
    this.initializeBattle(base.styleIds, {
      skillSetsByPartyIndex: base.skillSetsByPartyIndex,
      limitBreakLevelsByPartyIndex: base.limitBreakLevelsByPartyIndex,
      drivePierceByPartyIndex: base.drivePierceByPartyIndex,
      normalAttackElementsByPartyIndex: base.normalAttackElementsByPartyIndex,
      startSpEquipByPartyIndex: base.startSpEquipByPartyIndex,
      initialMotivationByPartyIndex: base.initialMotivationByPartyIndex,
      initialOdGauge: Number(base.initialOdGauge ?? 0),
      enemyNamesByEnemy: normalizeEnemyNamesByEnemy(base.enemyNamesByEnemy),
      damageRatesByEnemy: normalizeEnemyDamageRatesByEnemy(base.damageRatesByEnemy),
      enemyStatuses: Array.isArray(base.enemyStatuses) ? structuredClone(base.enemyStatuses) : [],
      zoneState: normalizeFieldStateForScenario(base.zoneState),
      territoryState: normalizeFieldStateForScenario(base.territoryState),
      skipInitialOdRead: true,
      preserveTurnPlans: true,
      suppressAutoSave: true,
      silent: true,
    });
    if (forceMode) {
      this.enableForceResourceDeficitMode();
    }
  }

  recalculateTurnPlans(options = {}) {
    const mode = String(options.mode ?? this.getTurnPlanRecalcModeFromDom()) === 'force' ? 'force' : 'strict';
    this.turnPlanRecalcMode = mode;
    if (!Array.isArray(this.turnPlans) || this.turnPlans.length === 0) {
      this.recordStore = createBattleRecordStore();
      this.turnPlanComputedRecords = [];
      this.turnPlanReplayError = null;
      this.turnPlanReplayWarnings = [];
      this.renderRecordTable();
      this.renderTurnPlanEditControls();
      this.setStatus('再計算対象のTurnPlanがありません。');
      return 0;
    }

    this.isReplayingTurnPlans = true;
    try {
      this.reinitializeFromTurnPlanBase({ forceMode: mode === 'force' });
      this.recordStore = createBattleRecordStore();
      this.turnPlanComputedRecords = [];
      this.turnPlanReplayError = null;
      this.turnPlanReplayWarnings = [];
      let applied = 0;
      for (let i = 0; i < this.turnPlans.length; i += 1) {
        const warnings = [];
        this.turnPlanReplayWarnings[i] = warnings;
        const turn = this.toScenarioTurnFromTurnPlan(this.turnPlans[i]);
        try {
          this.applyScenarioTurn(turn, {
            mode: 'commit',
            recalcMode: mode,
            onWarning: (message) => warnings.push(String(message)),
            commitOptions: {
              skipTurnPlanCapture: true,
              forceOdOverride: mode === 'force',
              forceResourceDeficit: mode === 'force',
              previewOptions: { skipSkillConditions: mode === 'force' },
            },
          });
          applied += 1;
        } catch (error) {
          this.turnPlanReplayError = { index: i, message: error.message, mode };
          if (mode === 'force') {
            warnings.push(`force fallback: ${error.message}`);
            try {
              this.pendingSwapEvents = [];
              this.pendingInterruptOdLevel = null;
              this.preemptiveOdCheckpoint = null;
              this.interruptOdProjection = null;
              this.previewRecord = null;
              this.commitCurrentTurn({
                skipTurnPlanCapture: true,
                forceOdOverride: true,
                forceResourceDeficit: true,
                previewOptions: { skipSkillConditions: true },
              });
              this.turnPlanReplayError = null;
              applied += 1;
              continue;
            } catch (fallbackError) {
              warnings.push(`force fallback failed: ${fallbackError.message}`);
              this.turnPlanReplayError = { index: i, message: fallbackError.message, mode };
            }
          }
          break;
        }
      }
      this.turnPlanComputedRecords = [...this.recordStore.records];
      if (this.turnPlanReplayError) {
        const turnId = this.turnPlanReplayError.index + 1;
        this.setStatus(`再計算停止: Turn ${turnId} / ${this.turnPlanReplayError.message}`);
      } else {
        const warningCount = this.turnPlanReplayWarnings.reduce(
          (sum, list) => sum + (Array.isArray(list) ? list.length : 0),
          0
        );
        this.setStatus(
          `再計算完了: ${applied}/${this.turnPlans.length} turns (${mode}${warningCount > 0 ? ` / warnings=${warningCount}` : ''})`
        );
      }
    } finally {
      this.isReplayingTurnPlans = false;
      this.renderActionSelectors();
      this.renderPartyState();
      this.renderSwapSelectors();
      this.renderTurnStatus();
      this.renderEnemyStatusControls();
      this.renderKishinkaControls();
      this.renderOdControls();
      this.renderRecordTable();
      this.renderTurnPlanEditControls();
    }
    return this.recordStore.records.length;
  }

  stageTurnPlanSession(session) {
    const mode = this.getTurnPlanRecalcModeFromDom();
    this.isReplayingTurnPlans = true;
    try {
      this.reinitializeFromTurnPlanBase({ forceMode: mode === 'force' });
      for (let i = 0; i < session.sourceIndex; i += 1) {
        const turn = this.toScenarioTurnFromTurnPlan(this.turnPlans[i]);
        this.applyScenarioTurn(turn, {
          mode: 'commit',
          recalcMode: mode,
          commitOptions: {
            skipTurnPlanCapture: true,
            forceOdOverride: mode === 'force',
            forceResourceDeficit: mode === 'force',
            previewOptions: { skipSkillConditions: mode === 'force' },
          },
        });
      }
      const sourceTurn = this.toScenarioTurnFromTurnPlan(this.turnPlans[session.sourceIndex]);
      this.applyScenarioTurn(sourceTurn, { mode: 'stage', recalcMode: mode });
      this.turnPlanEditSession = session;
      this.renderTurnPlanEditControls();
      this.renderRecordTable();
      if (session.type === 'insert') {
        this.setStatus(`Turn ${session.targetIndex + 1} に挿入する内容を編集中です。`);
      } else {
        this.setStatus(`Turn ${session.targetIndex + 1} を編集中です。`);
      }
    } finally {
      this.isReplayingTurnPlans = false;
    }
  }

  startTurnPlanEdit(turnId) {
    const index = Number(turnId) - 1;
    if (!Number.isInteger(index) || index < 0 || index >= this.turnPlans.length) {
      throw new Error(`TurnPlan not found: ${turnId}`);
    }
    this.stageTurnPlanSession({
      type: 'edit',
      sourceIndex: index,
      targetIndex: index,
    });
  }

  startTurnPlanInsert(turnId, direction = 'before') {
    const index = Number(turnId) - 1;
    if (!Number.isInteger(index) || index < 0 || index >= this.turnPlans.length) {
      throw new Error(`TurnPlan not found: ${turnId}`);
    }
    const targetIndex = direction === 'after' ? index + 1 : index;
    this.stageTurnPlanSession({
      type: 'insert',
      sourceIndex: index,
      targetIndex,
    });
  }

  saveTurnPlanEditFromDom() {
    const session = this.turnPlanEditSession;
    if (!session) {
      throw new Error('TurnPlan編集セッションがありません。');
    }
    const plan = this.captureCurrentTurnPlanFromDom();
    if (session.type === 'insert') {
      this.turnPlans.splice(session.targetIndex, 0, plan);
    } else {
      this.turnPlans[session.targetIndex] = plan;
    }
    this.turnPlanEditSession = null;
    this.kishinkaActivatedThisTurn = false;
    this.recalculateTurnPlans({ mode: this.getTurnPlanRecalcModeFromDom() });
  }

  cancelTurnPlanEdit() {
    if (!this.turnPlanEditSession) {
      return;
    }
    this.turnPlanEditSession = null;
    this.kishinkaActivatedThisTurn = false;
    this.recalculateTurnPlans({ mode: this.getTurnPlanRecalcModeFromDom() });
  }

  deleteTurnPlanRow(turnId) {
    const index = Number(turnId) - 1;
    if (!Number.isInteger(index) || index < 0 || index >= this.turnPlans.length) {
      throw new Error(`TurnPlan not found: ${turnId}`);
    }
    this.turnPlans.splice(index, 1);
    this.turnPlanEditSession = null;
    this.recalculateTurnPlans({ mode: this.getTurnPlanRecalcModeFromDom() });
  }

  moveTurnPlanRow(turnId, delta) {
    const index = Number(turnId) - 1;
    const nextIndex = index + Number(delta);
    if (
      !Number.isInteger(index) ||
      !Number.isInteger(nextIndex) ||
      index < 0 ||
      nextIndex < 0 ||
      index >= this.turnPlans.length ||
      nextIndex >= this.turnPlans.length
    ) {
      return;
    }
    const temp = this.turnPlans[index];
    this.turnPlans[index] = this.turnPlans[nextIndex];
    this.turnPlans[nextIndex] = temp;
    this.turnPlanEditSession = null;
    this.recalculateTurnPlans({ mode: this.getTurnPlanRecalcModeFromDom() });
  }

  serializeRecordField(value, fallback = '-') {
    if (value === undefined || value === null) {
      return fallback;
    }
    if (typeof value === 'string') {
      return value;
    }
    if (typeof value === 'number') {
      return Number.isFinite(value) ? String(value) : fallback;
    }
    if (typeof value === 'boolean') {
      return value ? 'true' : 'false';
    }
    try {
      return JSON.stringify(value);
    } catch (error) {
      return String(value);
    }
  }

  formatEnemyTargetLabel(action, enemyNamesByEnemy = {}) {
    const targetEnemyIndex = Number(action?.targetEnemyIndex);
    if (!Number.isFinite(targetEnemyIndex) || targetEnemyIndex < 0) {
      return '';
    }
    const defaultLabel = `Enemy ${targetEnemyIndex + 1}`;
    const rawName = String(
      enemyNamesByEnemy[String(targetEnemyIndex)] ?? enemyNamesByEnemy[targetEnemyIndex] ?? ''
    ).trim();
    return rawName ? `${defaultLabel} (${rawName})` : defaultLabel;
  }

  formatFrontlineCharacterSkillColumns(record, plan = null) {
    const actions = Array.isArray(record?.actions)
      ? record.actions
      : Array.isArray(plan?.actions)
        ? plan.actions
        : [];
    const enemyNamesByEnemy =
      record?.enemyNamesByEnemy && typeof record.enemyNamesByEnemy === 'object'
        ? record.enemyNamesByEnemy
        : this.state?.turnState?.enemyState?.enemyNamesByEnemy && typeof this.state.turnState.enemyState.enemyNamesByEnemy === 'object'
          ? this.state.turnState.enemyState.enemyNamesByEnemy
          : {};
    const slots = [
      { character: '-', skill: '-' },
      { character: '-', skill: '-' },
      { character: '-', skill: '-' },
    ];

    for (const action of actions) {
      const hasPositionIndex = Number.isFinite(Number(action?.positionIndex));
      const rawPosition = hasPositionIndex ? Number(action.positionIndex) : Number(action?.position);
      if (!Number.isFinite(rawPosition)) {
        continue;
      }
      const normalizedPosition = hasPositionIndex
        ? Math.trunc(rawPosition)
        : rawPosition >= 1 && rawPosition <= 6
          ? Math.trunc(rawPosition) - 1
          : Math.trunc(rawPosition);
      if (normalizedPosition < 0 || normalizedPosition > 2) {
        continue;
      }

      const character = String(action?.characterName ?? action?.characterId ?? '').trim() || '-';
      const skillName = String(action?.skillName ?? action?.skillLabel ?? '').trim();
      const skillId = Number(action?.skillId);
      const skillBase = skillName || (Number.isFinite(skillId) ? `skill:${skillId}` : '-');
      const enemyTargetLabel = this.formatEnemyTargetLabel(action, enemyNamesByEnemy);
      const skill = enemyTargetLabel ? `${skillBase} -> ${enemyTargetLabel}` : skillBase;
      slots[normalizedPosition] = { character, skill };
    }

    return [
      slots[0].character,
      slots[0].skill,
      slots[1].character,
      slots[1].skill,
      slots[2].character,
      slots[2].skill,
    ];
  }

  getRecordColumns(simpleMode = false) {
    const priority = [
      { key: 'turnId', label: 'turnId' },
      { key: 'ops', label: 'ops' },
      { key: 'turnLabel', label: 'turnLabel' },
      { key: 'odGaugeStart', label: 'odGaugeStart' },
      { key: 'frontPos1Char', label: '前衛POS1キャラ' },
      { key: 'frontPos1Skill', label: '前衛POS1スキル' },
      { key: 'frontPos2Char', label: '前衛POS2キャラ' },
      { key: 'frontPos2Skill', label: '前衛POS2スキル' },
      { key: 'frontPos3Char', label: '前衛POS3キャラ' },
      { key: 'frontPos3Skill', label: '前衛POS3スキル' },
    ];
    if (simpleMode) {
      return priority;
    }
    return [
      ...priority,
      { key: 'status', label: 'status' },
      { key: 'turnType', label: 'turnType' },
      { key: 'turnIndex', label: 'turnIndex' },
      { key: 'recordStatus', label: 'recordStatus' },
      { key: 'odTurnStart', label: 'odTurnStart' },
      { key: 'odContext', label: 'odContext' },
      { key: 'isExtraTurn', label: 'isExtraTurn' },
      { key: 'remainingOD', label: 'remainingOD' },
      { key: 'enemyCount', label: 'enemyCount' },
      { key: 'enemyNames', label: 'enemyNames' },
      { key: 'enemyAction', label: 'enemyAction' },
      { key: 'enemyStatus', label: 'enemyStatus' },
      { key: 'transcendence', label: 'transcendence' },
      { key: 'actions', label: 'actions' },
      { key: 'swapEvents', label: 'swapEvents' },
      { key: 'snapBefore', label: 'snapBefore' },
      { key: 'snapAfter', label: 'snapAfter' },
      { key: 'effectSnapshots', label: 'effectSnapshots' },
      { key: 'createdAt', label: 'createdAt' },
      { key: 'committedAt', label: 'committedAt' },
    ];
  }

  createRecordOpsCell(turnId, plan, rowIndex) {
    const ops = this.doc.createElement('td');
    ops.innerHTML =
      `<button type="button" data-action="turn-plan-edit-row" data-turn-id="${turnId}" ${plan ? '' : 'disabled'}>編集</button>` +
      `<button type="button" data-action="turn-plan-insert-before-row" data-turn-id="${turnId}" ${plan ? '' : 'disabled'}>+前</button>` +
      `<button type="button" data-action="turn-plan-insert-after-row" data-turn-id="${turnId}" ${plan ? '' : 'disabled'}>+後</button>` +
      `<button type="button" data-action="turn-plan-delete-row" data-turn-id="${turnId}" ${plan ? '' : 'disabled'}>削除</button>` +
      `<button type="button" data-action="turn-plan-move-up-row" data-turn-id="${turnId}" ${rowIndex <= 0 || !plan ? 'disabled' : ''}>↑</button>` +
      `<button type="button" data-action="turn-plan-move-down-row" data-turn-id="${turnId}" ${rowIndex >= this.turnPlans.length - 1 || !plan ? 'disabled' : ''}>↓</button>`;
    return ops;
  }

  renderRecordTable() {
    const tbody = this.root.querySelector('[data-role="record-body"]');
    if (!tbody) {
      return;
    }
    const recalcMode = this.root.querySelector('[data-role="turn-plan-recalc-mode"]');
    if (recalcMode) {
      recalcMode.value = this.turnPlanRecalcMode;
    }
    const simpleToggle = this.root.querySelector('[data-role="records-simple-toggle"]');
    if (simpleToggle) {
      this.recordsSimpleMode = Boolean(simpleToggle.checked);
    }
    this.renderTurnPlanRecalcStatus();

    const columns = this.getRecordColumns(this.recordsSimpleMode);
    const headerLabels = columns.map((column) => column.label);
    const headRow = this.root.querySelector('[data-role="record-head"]');
    if (headRow) {
      headRow.innerHTML = headerLabels.map((label) => `<th>${label}</th>`).join('');
    }

    tbody.innerHTML = '';
    const totalRows = Math.max(this.turnPlans.length, this.recordStore.records.length);
    for (let i = 0; i < totalRows; i += 1) {
      const turnId = i + 1;
      const plan = this.turnPlans[i] ?? null;
      const record = this.recordStore.records[i] ?? null;
      const warningList = Array.isArray(this.turnPlanReplayWarnings[i]) ? this.turnPlanReplayWarnings[i] : [];
      const isError = Number(this.turnPlanReplayError?.index) === i;
      const statusText = isError
        ? `Error: ${this.turnPlanReplayError?.message ?? ''}`
        : warningList.length > 0
          ? `Warn(${warningList.length})`
          : record
            ? 'OK'
            : '未確定';
      const tr = this.doc.createElement('tr');
      if (this.turnPlanEditSession && this.turnPlanEditSession.targetIndex === i) {
        tr.setAttribute('data-editing', 'true');
      }

      const turnLabel = record?.turnLabel ?? '未確定';
      const turnType = record?.turnType ?? '-';
      const turnIndex = this.serializeRecordField(record?.turnIndex, '-');
      const recordStatus = record?.recordStatus ?? (plan ? 'planned' : '-');
      const odTurnStart = this.serializeRecordField(record?.odTurnLabelAtStart, '-');
      const odContext = this.serializeRecordField(record?.odContext, '-');
      const isExtraTurn = this.serializeRecordField(record?.isExtraTurn, '-');
      const remainingOd = this.serializeRecordField(record?.remainingOdActionsAtStart, '-');
      const odGaugeStart =
        record && Number.isFinite(Number(record.odGaugeAtStart))
          ? `${formatGaugePercent(record.odGaugeAtStart)}%`
          : '-';
      const enemyCount = this.serializeRecordField(record?.enemyCount ?? plan?.enemyCount, '-');
      const enemyNames = this.serializeRecordField(record?.enemyNamesByEnemy, '-');
      const enemyAction = this.serializeRecordField(record?.enemyAction ?? plan?.enemyAction, '');
      const enemyStatus = this.serializeRecordField(record?.enemyStatusSummary, '-');
      const transcendence = this.serializeRecordField(record?.transcendence, '-');
      const frontlineColumns = this.formatFrontlineCharacterSkillColumns(record, plan);
      const actions = this.serializeRecordField(record?.actions ?? plan?.actions, '-');
      const swapEvents = this.serializeRecordField(record?.swapEvents ?? plan?.swaps, '-');
      const snapBefore = this.serializeRecordField(record?.snapBefore, '-');
      const snapAfter = this.serializeRecordField(record?.snapAfter, '-');
      const effectSnapshots = this.serializeRecordField(record?.effectSnapshots, '-');
      const createdAt = this.serializeRecordField(record?.createdAt, '-');
      const committedAt = this.serializeRecordField(record?.committedAt, '-');

      const valueMap = {
        turnId: String(turnId),
        turnLabel,
        turnType,
        turnIndex,
        recordStatus,
        odTurnStart,
        odContext,
        isExtraTurn,
        remainingOD: remainingOd,
        odGaugeStart,
        enemyCount,
        enemyNames,
        enemyAction,
        enemyStatus,
        transcendence,
        frontPos1Char: frontlineColumns[0],
        frontPos1Skill: frontlineColumns[1],
        frontPos2Char: frontlineColumns[2],
        frontPos2Skill: frontlineColumns[3],
        frontPos3Char: frontlineColumns[4],
        frontPos3Skill: frontlineColumns[5],
        actions,
        swapEvents,
        snapBefore,
        snapAfter,
        effectSnapshots,
        createdAt,
        committedAt,
        status: statusText,
      };
      for (const column of columns) {
        if (column.key === 'ops') {
          tr.appendChild(this.createRecordOpsCell(turnId, plan, i));
          continue;
        }
        const td = this.doc.createElement('td');
        td.textContent = String(valueMap[column.key] ?? '');
        tr.appendChild(td);
      }
      tbody.appendChild(tr);
    }
  }

  setStatus(message) {
    this.view.setStatus(message);
  }
}
