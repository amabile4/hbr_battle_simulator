import {
  createBattleStateFromParty,
  previewTurn,
  commitTurn,
  activateOverdrive,
} from '../turn/turn-controller.js';
import { createBattleRecordStore, RecordEditor, CsvExporter } from '../records/record-store.js';
import { createInitialTurnState } from '../contracts/interfaces.js';

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
const DRIVE_PIERCE_OPTIONS = Object.freeze([
  { value: 0, label: 'ドライブピアスなし' },
  { value: 10, label: 'ドライブピアス +10%' },
  { value: 12, label: 'ドライブピアス +12%' },
  { value: 15, label: 'ドライブピアス +15%' },
]);
const START_SP_BASE = 1;
const START_SP_LEVEL_BONUS = 3;
const START_SP_EQUIP_OPTIONS = Object.freeze([
  { value: 0, label: '初期SP装備 +0' },
  { value: 1, label: '初期SP装備 +1' },
  { value: 2, label: '初期SP装備 +2' },
  { value: 3, label: '初期SP装備 +3' },
]);
const START_SP_EQUIP_DEFAULT = 3;
const TEZUKA_CHARACTER_ID = 'STezuka';
const OD_GAUGE_MIN_PERCENT = -999.99;
const OD_GAUGE_MAX_PERCENT = 300;
const ENEMY_STATUS_DOWN_TURN = 'DownTurn';

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

function canSwapByExtraState(a, b) {
  return Boolean(a?.isExtraActive) === Boolean(b?.isExtraActive);
}

function formatSwapMemberLabel(member) {
  const name = String(member?.characterName ?? member?.characterId ?? '');
  return `${name}${member?.isExtraActive ? ' [EX]' : ''}`;
}

function formatSkillCostLabel(skill, member = null) {
  const consumeType = String(skill?.consumeType ?? skill?.consume_type ?? 'Sp');
  const costRaw = Number(skill?.spCost ?? skill?.sp_cost ?? 0);
  if (
    member?.characterId === TEZUKA_CHARACTER_ID &&
    Boolean(member?.isReinforcedMode) &&
    consumeType.toLowerCase() !== 'ep' &&
    costRaw !== -1
  ) {
    return 'SP 0';
  }
  if (consumeType.toLowerCase() !== 'ep' && costRaw === -1) {
    return 'SP ALL';
  }
  return consumeType.toLowerCase() === 'ep' ? `EP ${costRaw}` : `SP ${costRaw}`;
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

function formatSkillHitLabel(skill, member) {
  const baseHit = Number(skill?.hitCount ?? 0);
  const validBase = Number.isFinite(baseHit) && baseHit > 0 ? baseHit : null;
  if (!validBase) {
    return '-';
  }

  const funnel = String(skill?.type ?? '') === 'damage' ? resolveFunnelHitBonus(member, 2) : 0;
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

function extractSkillAttributes(skill) {
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

export class BattleDomAdapter {
  constructor({ root, dataStore, initialSP = 4 }) {
    if (!root || !dataStore) {
      throw new Error('BattleDomAdapter requires root and dataStore.');
    }

    this.root = root;
    this.doc = root.ownerDocument ?? globalThis.document;
    this.dataStore = dataStore;
    this.initialSP = initialSP;

    this.party = null;
    this.state = null;
    this.recordStore = createBattleRecordStore();
    this.previewRecord = null;
    this.pendingSwapEvents = [];
    this.lastActionSkillByPosition = new Map();
    this.lastActionTargetByPosition = new Map();
    this.pendingInterruptOdLevel = null;
    this.scenario = null;
    this.scenarioCursor = 0;

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
    this.root.querySelector('[data-action="enemy-status-apply"]')?.addEventListener('click', () => {
      this.runSafely(() => this.applyEnemyStatusFromDom());
    });
    this.root.querySelector('[data-action="enemy-status-clear"]')?.addEventListener('click', () => {
      this.runSafely(() => this.clearEnemyStatusFromDom());
    });

    this.root.querySelector('[data-action="clear-records"]')?.addEventListener('click', () => {
      this.recordStore = createBattleRecordStore();
      this.renderRecordTable();
      this.setStatus('Records cleared.');
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
        this.renderEnemyStatusControls();
      }

      if (target.matches('[data-action-slot]')) {
        const position = toInt(target.getAttribute('data-action-slot'), -1);
        if (position >= 0) {
          this.lastActionSkillByPosition.set(position, toInt(target.value, 0));
          this.updateActionSkillAttributeBadges(position, toInt(target.value, 0));
          this.updateActionTargetSelector(position, toInt(target.value, 0));
        }
      }

      if (target.matches('[data-action-target-slot]')) {
        const position = toInt(target.getAttribute('data-action-target-slot'), -1);
        if (position >= 0) {
          this.lastActionTargetByPosition.set(position, String(target.value));
        }
      }

      if (target.matches('[data-role="force-od-toggle"]')) {
        this.renderOdControls();
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

      const skillChecklist = this.doc.createElement('div');
      skillChecklist.setAttribute('data-role', 'skill-checklist');
      skillChecklist.setAttribute('data-slot', String(i));

      wrapper.appendChild(characterSelect);
      wrapper.appendChild(styleSelect);
      wrapper.appendChild(styleAttrBadges);
      wrapper.appendChild(limitBreakSelect);
      wrapper.appendChild(drivePierceSelect);
      wrapper.appendChild(startSpEquipSelect);
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
      const checkedSkillIds = this.getCheckedSkillIdsForSlot(i) ?? [];
      partySelections.push({
        characterLabel: String(charSelect?.value ?? ''),
        styleId: toInt(styleSelect?.value, this.defaultSelections[i].styleId),
        limitBreakLevel: toInt(lbSelect?.value, 0),
        drivePiercePercent: toInt(drivePierceSelect?.value, 0),
        startSpEquipBonus: toInt(startSpEquipSelect?.value, START_SP_EQUIP_DEFAULT),
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
          `LB=${row.limitBreakLevel ?? '-'} / Drive=${row.drivePiercePercent ?? 0}% / StartSP+${row.startSpEquipBonus ?? 0} / skills=${Array.isArray(row.checkedSkillIds) ? row.checkedSkillIds.length : 0}`
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
      return;
    }

    container.textContent = `Passives: ${passives
      .map((p) => `${p.name}(LB${p.requiredLimitBreakLevel ?? 0})`)
      .join(', ')}`;
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
    const startSp = START_SP_BASE + START_SP_LEVEL_BONUS + startSpEquipBonus;

    const charName = normalizeName(character?.name ?? selectedCharacterLabel);
    summary.textContent =
      `Character: ${charName} / Style: ${style?.name ?? '-'} / ` +
      `LB: ${limitBreakLevel} / DrivePierce: ${drivePiercePercent}% / StartSP: ${startSp} (1+3+${startSpEquipBonus}) / Equipped Skills: ${selectedSkillIds.length} / Passives: ${passives.length}`;
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

      lines.push(
        `Slot ${i + 1}: ${normalizeName(character?.name ?? charSelect?.value)} / ${style?.name ?? '-'}`
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
    const startSpEquipByPartyIndex =
      options.startSpEquipByPartyIndex ?? this.readStartSpEquipMapFromDom();
    const initialSpByPartyIndex = Object.fromEntries(
      Object.entries(startSpEquipByPartyIndex).map(([index, bonus]) => [
        Number(index),
        Number(this.initialSP) + Number(bonus ?? 0),
      ])
    );
    this.party = this.dataStore.buildPartyFromStyleIds(styleIds, {
      initialSP: this.initialSP,
      initialSpByPartyIndex,
      skillSetsByPartyIndex,
      limitBreakLevelsByPartyIndex,
      drivePierceByPartyIndex,
    });
    const initialOdGauge =
      options.initialOdGauge ?? (options.skipInitialOdRead ? 0 : this.readInitialOdGaugeFromDom());
    const initialTurnState = {
      ...createInitialTurnState(),
      odGauge: Number(initialOdGauge),
    };
    initialTurnState.enemyState = {
      enemyCount: this.readEnemyCountFromDom(),
      statuses: [],
    };
    this.state = createBattleStateFromParty(this.party, initialTurnState);
    this.recordStore = createBattleRecordStore();
    this.previewRecord = null;
    this.pendingSwapEvents = [];
    this.pendingInterruptOdLevel = null;

    this.renderActionSelectors();
    this.renderPartyState();
    this.renderSwapSelectors();
    this.renderTurnStatus();
    this.renderEnemyStatusControls();
    this.renderKishinkaControls();
    this.renderRecordTable();
    this.writePreviewOutput('');
    this.writeCsvOutput('');
    this.renderOdControls();
    this.renderScenarioStatus();
    this.saveSelectionToSlot(AUTO_SAVE_SLOT_INDEX, { allowAutoSlot: true, silent: true });
    this.setStatus('Battle initialized. Selection auto-saved to Auto Slot 0.');

    return this.state;
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
        const costLabel = formatSkillCostLabel(skill, member);
        const hitLabel = formatSkillHitLabel(skill, member);
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
    const attrs = extractSkillAttributes(skill);
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

      return { targetType, candidates };
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
    const config = this.resolveActionTargetConfig(member, skill);

    targetSelect.innerHTML = '';
    if (!config) {
      targetSelect.style.display = 'none';
      this.lastActionTargetByPosition.delete(position);
      return;
    }

    for (const candidate of config.candidates) {
      const option = this.doc.createElement('option');
      option.value = String(candidate.characterId);
      option.textContent = `Target: Pos ${candidate.position + 1} (${candidate.characterName})`;
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
      const targetCharacterId =
        targetSelect && targetSelect.style.display !== 'none'
          ? String(targetSelect.value ?? '').trim()
          : '';
      actionDict[String(member.position)] = {
        characterId: member.characterId,
        skillId,
        ...(targetCharacterId ? { targetCharacterId } : {}),
      };
    }

    return actionDict;
  }

  readEnemyCountFromDom() {
    const select = this.root.querySelector('[data-role="enemy-count"]');
    const n = toInt(select?.value, 1);
    return Math.max(1, Math.min(3, n));
  }

  syncEnemyStateFromDom() {
    if (!this.state?.turnState) {
      return;
    }
    const enemyCount = this.readEnemyCountFromDom();
    const current = this.state.turnState.enemyState ?? { enemyCount: 1, statuses: [] };
    const statuses = Array.isArray(current.statuses)
      ? current.statuses
          .filter((status) => Number(status?.remainingTurns ?? 0) > 0)
          .filter((status) => Number(status?.targetIndex ?? -1) >= 0)
          .filter((status) => Number(status?.targetIndex ?? -1) < enemyCount)
          .map((status) => ({
            statusType: String(status?.statusType ?? ''),
            targetIndex: Number(status?.targetIndex ?? 0),
            remainingTurns: Number(status?.remainingTurns ?? 0),
          }))
      : [];
    this.state.turnState.enemyState = {
      enemyCount,
      statuses,
    };
  }

  getEnemyStatuses() {
    const state = this.state?.turnState?.enemyState;
    return Array.isArray(state?.statuses) ? state.statuses : [];
  }

  renderEnemyStatusControls() {
    const targetSelect = this.root.querySelector('[data-role="enemy-status-target"]');
    const list = this.root.querySelector('[data-role="enemy-status-list"]');
    const enemyCount = this.readEnemyCountFromDom();

    if (targetSelect) {
      const prev = String(targetSelect.value ?? '');
      targetSelect.innerHTML = '';
      for (let i = 0; i < enemyCount; i += 1) {
        const option = this.doc.createElement('option');
        option.value = String(i);
        option.textContent = `Enemy ${i + 1}`;
        targetSelect.appendChild(option);
      }
      const hasPrev = [...targetSelect.options].some((option) => option.value === prev);
      targetSelect.value = hasPrev ? prev : '0';
    }

    if (list) {
      const statuses = this.getEnemyStatuses()
        .filter((status) => Number(status?.remainingTurns ?? 0) > 0)
        .sort((a, b) => Number(a.targetIndex) - Number(b.targetIndex));
      if (statuses.length === 0) {
        list.textContent = 'Enemy Status: -';
      } else {
        const text = statuses
          .map(
            (status) =>
              `Enemy ${Number(status.targetIndex) + 1}: ${String(status.statusType)}(${Number(
                status.remainingTurns
              )})`
          )
          .join(' | ');
        list.textContent = `Enemy Status: ${text}`;
      }
    }
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
      .filter(
        (status) =>
          !(
            String(status?.statusType ?? '') === statusType &&
            Number(status?.targetIndex ?? -1) === targetIndex
          )
      )
      .map((status) => ({
        statusType: String(status?.statusType ?? ''),
        targetIndex: Number(status?.targetIndex ?? 0),
        remainingTurns: Number(status?.remainingTurns ?? 0),
      }));
    nextStatuses.push({
      statusType,
      targetIndex,
      remainingTurns,
    });
    this.state.turnState.enemyState = {
      enemyCount: this.readEnemyCountFromDom(),
      statuses: nextStatuses,
    };
    this.previewRecord = null;
    this.writePreviewOutput('');
    this.renderEnemyStatusControls();
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
      (status) =>
        !(
          String(status?.statusType ?? '') === statusType &&
          Number(status?.targetIndex ?? -1) === targetIndex
        )
    );
    this.state.turnState.enemyState = {
      enemyCount: this.readEnemyCountFromDom(),
      statuses: nextStatuses,
    };
    this.previewRecord = null;
    this.writePreviewOutput('');
    this.renderEnemyStatusControls();
    this.setStatus(`Enemy ${targetIndex + 1} の ${statusType} を解除しました。`);
  }

  queueSwap(fromPositionIndex, toPositionIndex) {
    if (!this.state) {
      throw new Error('State is not initialized.');
    }

    if (fromPositionIndex === toPositionIndex) {
      this.setStatus('Swap skipped: same position.');
      return null;
    }

    const outMember = this.state.party.find((member) => member.position === fromPositionIndex);
    const inMember = this.state.party.find((member) => member.position === toPositionIndex);

    if (!outMember || !inMember) {
      throw new Error('Swap target position not found.');
    }
    if (!canSwapByExtraState(outMember, inMember)) {
      throw new Error('Swap is allowed only between [EX]<->[EX] or normal<->normal.');
    }

    const event = {
      swapSequence: this.pendingSwapEvents.length + 1,
      fromPositionIndex,
      toPositionIndex,
      outCharacterId: outMember.characterId,
      outCharacterName: outMember.characterName,
      inCharacterId: inMember.characterId,
      inCharacterName: inMember.characterName,
    };

    const fromPos = outMember.position;
    const toPos = inMember.position;
    outMember.setPosition(toPos);
    inMember.setPosition(fromPos);

    this.pendingSwapEvents.push(event);
    this.previewRecord = null;
    this.writePreviewOutput('');
    this.renderActionSelectors();
    this.renderPartyState();
    this.renderSwapSelectors();
    this.setStatus(`Swap applied: ${outMember.characterName} <-> ${inMember.characterName}`);
    return event;
  }

  previewCurrentTurn() {
    if (!this.state) {
      throw new Error('State is not initialized.');
    }

    const enemyAction = this.root.querySelector('[data-role="enemy-action"]')?.value ?? null;
    const enemyCount = this.readEnemyCountFromDom();
    this.syncEnemyStateFromDom();
    const actions = this.collectActionDictFromDom();

    this.previewRecord = previewTurn(this.state, actions, enemyAction, enemyCount);
    this.writePreviewOutput(JSON.stringify(this.previewRecord, null, 2));
    this.setStatus('Preview generated.');
    return this.previewRecord;
  }

  commitCurrentTurn() {
    if (!this.state) {
      throw new Error('State is not initialized.');
    }

    if (!this.previewRecord) {
      this.previewCurrentTurn();
    }

    const interruptOdLevel = Number(this.pendingInterruptOdLevel ?? 0);
    const forceOdActivation = this.isForceOdEnabled();
    const { nextState, committedRecord } = commitTurn(
      this.state,
      this.previewRecord,
      this.pendingSwapEvents,
      {
        applySwapOnCommit: false,
        interruptOdLevel,
        forceOdActivation,
      }
    );

    this.state = nextState;
    this.recordStore = RecordEditor.upsertRecord(this.recordStore, committedRecord);
    this.previewRecord = null;
    this.pendingSwapEvents = [];
    this.pendingInterruptOdLevel = null;

    this.renderActionSelectors();
    this.renderPartyState();
    this.renderSwapSelectors();
    this.renderTurnStatus();
    this.renderEnemyStatusControls();
    this.renderKishinkaControls();
    this.renderRecordTable();
    this.writePreviewOutput('');
    this.renderOdControls();
    this.setStatus('Turn committed.');

    return committedRecord;
  }

  exportCsv() {
    if (!this.state) {
      throw new Error('State is not initialized.');
    }

    const csv = CsvExporter.exportToCSV(this.recordStore, this.state.initialParty);
    this.writeCsvOutput(csv);
    this.setStatus('CSV exported.');
    return csv;
  }

  writePreviewOutput(text) {
    const output = this.root.querySelector('[data-role="preview-output"]');
    if (output) {
      output.textContent = text;
    }
  }

  writeCsvOutput(text) {
    const output = this.root.querySelector('[data-role="csv-output"]');
    if (output) {
      if ('value' in output) {
        output.value = text;
      } else {
        output.textContent = text;
      }
    }
  }

  renderScenarioStatus() {
    const node = this.root.querySelector('[data-role="scenario-status"]');
    if (!node) {
      return;
    }
    if (!this.scenario) {
      node.textContent = 'Not loaded';
      return;
    }
    const total = Array.isArray(this.scenario.turns) ? this.scenario.turns.length : 0;
    node.textContent = `Loaded (turns ${this.scenarioCursor}/${total})`;
  }

  getScenarioJsonTextFromDom() {
    const area = this.root.querySelector('[data-role="scenario-json"]');
    return String(area?.value ?? '').trim();
  }

  setDomValue(selector, value) {
    const node = this.root.querySelector(selector);
    if (!node) {
      return;
    }
    if ('value' in node) {
      node.value = String(value);
    }
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
      const remainingTurns = Math.max(1, toInt(status.remainingTurns, 1));
      next.push({ statusType, targetIndex, remainingTurns });
    }
    this.state.turnState.enemyState = {
      enemyCount,
      statuses: next,
    };
    this.renderEnemyStatusControls();
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
      this.setDomValue('[data-role="enemy-count"]', Math.max(1, Math.min(3, Number(setup.enemyCount))));
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

    this.initializeBattle();
    if (Array.isArray(setup.enemyStatuses)) {
      this.applyScenarioEnemyStatuses(setup.enemyStatuses);
    }
    this.scenarioCursor = 0;
    this.renderScenarioStatus();
    this.setStatus('Scenario setup applied.');
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

  setScenarioActionOnDom(action) {
    const position = this.resolveScenarioPosition(action?.position);
    const member = this.party?.getByPosition(position);
    if (!member) {
      throw new Error(`No member at position ${position + 1}`);
    }
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
        const can = [...targetSelect.options].some(
          (option) => String(option.value) === targetByCharacterId
        );
        if (!can) {
          throw new Error(
            `Target character is not selectable at position ${position + 1}: ${targetByCharacterId}`
          );
        }
        targetSelect.value = targetByCharacterId;
        this.lastActionTargetByPosition.set(position, targetByCharacterId);
      } else if (Number.isFinite(Number(action?.targetPosition))) {
        const targetPosition = this.resolveScenarioPosition(action.targetPosition);
        const targetMember = this.party?.getByPosition(targetPosition);
        if (!targetMember) {
          throw new Error(`Target member not found at position ${targetPosition + 1}`);
        }
        const targetCharacterId = String(targetMember.characterId);
        const can = [...targetSelect.options].some(
          (option) => String(option.value) === targetCharacterId
        );
        if (!can) {
          throw new Error(
            `Target position is not selectable at position ${position + 1}: ${targetPosition + 1}`
          );
        }
        targetSelect.value = targetCharacterId;
        this.lastActionTargetByPosition.set(position, targetCharacterId);
      }
    }
  }

  applyScenarioTurn(turn = {}) {
    if (!this.state) {
      throw new Error('Battle state is not initialized.');
    }
    if (Number.isFinite(Number(turn.enemyCount))) {
      this.setDomValue('[data-role="enemy-count"]', Math.max(1, Math.min(3, Number(turn.enemyCount))));
      this.syncEnemyStateFromDom();
      this.renderEnemyStatusControls();
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
        const remainingTurns = Math.max(1, toInt(status.remainingTurns, 1));
        const filtered = merged.filter(
          (item) =>
            !(String(item.statusType ?? '') === statusType && Number(item.targetIndex) === targetIndex)
        );
        filtered.push({ statusType, targetIndex, remainingTurns });
        merged.length = 0;
        merged.push(...filtered);
      }
      this.state.turnState.enemyState = {
        enemyCount: this.readEnemyCountFromDom(),
        statuses: merged,
      };
      this.renderEnemyStatusControls();
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
          (item) =>
            !(String(item.statusType ?? '') === statusType && Number(item.targetIndex) === targetIndex)
        );
      }
      this.state.turnState.enemyState = {
        enemyCount: this.readEnemyCountFromDom(),
        statuses,
      };
      this.renderEnemyStatusControls();
    }

    if (Number.isFinite(Number(turn.preemptiveOdLevel))) {
      this.state = activateOverdrive(this.state, Number(turn.preemptiveOdLevel), 'preemptive', {
        forceActivation: this.isForceOdEnabled(),
      });
      this.previewRecord = null;
      this.pendingSwapEvents = [];
      this.renderActionSelectors();
      this.renderPartyState();
      this.renderSwapSelectors();
      this.renderTurnStatus();
    }

    if (turn.kishinka) {
      this.activateKishinka();
    }

    if (Array.isArray(turn.swaps)) {
      for (const swap of turn.swaps) {
        const from = this.resolveScenarioPosition(swap?.from);
        const to = this.resolveScenarioPosition(swap?.to);
        this.queueSwap(from, to);
      }
    }

    if (Array.isArray(turn.actions)) {
      for (const action of turn.actions) {
        this.setScenarioActionOnDom(action);
      }
    }

    if (Number.isFinite(Number(turn.interruptOdLevel))) {
      this.pendingInterruptOdLevel = Number(turn.interruptOdLevel);
      this.renderOdControls();
    }

    const doCommit = turn.commit !== false;
    if (!doCommit) {
      return this.previewCurrentTurn();
    }
    return this.commitCurrentTurn();
  }

  runNextScenarioTurn() {
    if (!this.scenario) {
      throw new Error('Scenario is not loaded.');
    }
    const turns = Array.isArray(this.scenario.turns) ? this.scenario.turns : [];
    if (this.scenarioCursor >= turns.length) {
      this.setStatus('Scenario completed.');
      this.renderScenarioStatus();
      return null;
    }
    const turn = turns[this.scenarioCursor] ?? {};
    const result = this.applyScenarioTurn(turn);
    this.scenarioCursor += 1;
    this.renderScenarioStatus();
    this.setStatus(`Scenario turn ${this.scenarioCursor}/${turns.length} executed.`);
    return result;
  }

  runAllScenarioTurns() {
    if (!this.scenario) {
      throw new Error('Scenario is not loaded.');
    }
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

    const members = this.state.party.slice().sort((a, b) => a.position - b.position);
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

    const candidates = this.state.party
      .slice()
      .sort((a, b) => a.position - b.position)
      .filter(
        (member) => member.position !== fromPositionIndex && canSwapByExtraState(fromMember, member)
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
    this.renderOdControls();
    this.renderKishinkaControls();
    this.renderEnemyStatusControls();
  }

  isForceOdEnabled() {
    const toggle = this.root.querySelector('[data-role="force-od-toggle"]');
    return Boolean(toggle?.checked);
  }

  canActivateOdLevel(level) {
    if (!this.state) {
      return false;
    }
    if (this.isForceOdEnabled()) {
      return true;
    }
    const numericLevel = Number(level);
    const gauge = Number(this.state.turnState.odGauge ?? 0);
    return gauge >= numericLevel * 100;
  }

  canShowInterruptOdButton() {
    if (!this.state) {
      return false;
    }
    if (this.state.turnState.turnType === 'od') {
      return false;
    }
    if (this.isForceOdEnabled()) {
      return true;
    }
    const gauge = Number(this.state.turnState.odGauge ?? 0);
    return gauge >= 100;
  }

  renderOdControls() {
    const openOdButton = this.root.querySelector('[data-action="open-od"]');
    const openInterruptButton = this.root.querySelector('[data-action="open-interrupt-od"]');
    const interruptBadge = this.root.querySelector('[data-role="interrupt-od-badge"]');
    if (!this.state) {
      if (openOdButton) {
        openOdButton.disabled = true;
      }
      if (openInterruptButton) {
        openInterruptButton.hidden = true;
      }
      if (interruptBadge) {
        interruptBadge.textContent = '';
      }
      return;
    }

    const isOdTurn = this.state.turnState.turnType === 'od';
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
  }

  openOdDialog(mode) {
    // 片方だけ開く: 以前のダイアログ表示を必ず閉じる
    const normalDialog = this.root.querySelector('[data-role="od-dialog"]');
    const interruptDialog = this.root.querySelector('[data-role="interrupt-od-dialog"]');
    if (normalDialog) {
      normalDialog.hidden = true;
    }
    if (interruptDialog) {
      interruptDialog.hidden = true;
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

    const candidates = [1, 2, 3].filter((level) => this.canActivateOdLevel(level));
    if (candidates.length === 0) {
      throw new Error('ODゲージが不足しているため発動できません。');
    }

    select.innerHTML = '';
    for (const level of candidates) {
      const option = this.doc.createElement('option');
      option.value = String(level);
      option.textContent = `OD${level}`;
      select.appendChild(option);
    }
    dialog.hidden = false;
  }

  closeOdDialog(mode) {
    const dialog = this.root.querySelector(
      mode === 'interrupt' ? '[data-role="interrupt-od-dialog"]' : '[data-role="od-dialog"]'
    );
    if (dialog) {
      dialog.hidden = true;
    }
    if (mode === 'interrupt') {
      this.pendingInterruptOdLevel = null;
      this.renderOdControls();
    }
    this.setStatus(mode === 'interrupt' ? '割込OD設定をキャンセルしました。' : 'OD発動をキャンセルしました。');
  }

  confirmOdDialog(mode) {
    const select = this.root.querySelector(
      mode === 'interrupt' ? '[data-role="interrupt-od-level"]' : '[data-role="od-level"]'
    );
    const level = toInt(select?.value, 1);
    if (!this.canActivateOdLevel(level)) {
      throw new Error(`OD${level}を発動できません。`);
    }

    if (mode === 'interrupt') {
      this.pendingInterruptOdLevel = level;
      const dialog = this.root.querySelector('[data-role="interrupt-od-dialog"]');
      if (dialog) {
        dialog.hidden = true;
      }
      this.renderOdControls();
      this.setStatus(`割込ODを予約しました: OD${level}`);
      return;
    }

    this.state = activateOverdrive(this.state, level, 'preemptive', {
      forceActivation: this.isForceOdEnabled(),
    });
    const dialog = this.root.querySelector('[data-role="od-dialog"]');
    if (dialog) {
      dialog.hidden = true;
    }
    this.pendingInterruptOdLevel = null;
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
    const nextOd = Math.min(OD_GAUGE_MAX_PERCENT, currentOd + 15);
    this.state.turnState.odGauge = Number(nextOd.toFixed(2));
    this.previewRecord = null;
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
        if (String(member.characterId) === 'NNanase') {
          return `<li>Pos ${member.position + 1} [${frontBack}] ${member.characterName}${extraTag}${kishinTag} SP=${member.sp.current} / EP=${member.ep.current}</li>`;
        }
        return `<li>Pos ${member.position + 1} [${frontBack}] ${member.characterName}${extraTag}${kishinTag} SP=${member.sp.current}</li>`;
      })
      .join('');

    container.innerHTML = rows;
    this.renderSwapSelectors();
  }

  renderRecordTable() {
    const tbody = this.root.querySelector('[data-role="record-body"]');
    if (!tbody) {
      return;
    }

    tbody.innerHTML = '';
    for (const record of this.recordStore.records) {
      const tr = this.doc.createElement('tr');
      tr.innerHTML = `<td>${record.turnId}</td><td>${record.turnLabel}</td><td>${record.turnType}</td><td>${record.actions.length}</td>`;
      tbody.appendChild(tr);
    }
  }

  setStatus(message) {
    const status = this.root.querySelector('[data-role="status"]');
    if (status) {
      status.textContent = message;
    }
  }
}
