import { createBattleStateFromParty, previewTurn, commitTurn } from '../turn/turn-controller.js';
import { createBattleRecordStore, RecordEditor, CsvExporter } from '../records/record-store.js';

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
const SELECTION_SAVE_SLOT_COUNT = 10;
const SELECTION_SAVE_STORAGE_KEY = 'hbr.battle_simulator.selection_slots.v1';

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

    this.characterCandidates = this.dataStore.listCharacterCandidates();
    this.defaultSelections = this.buildDefaultSelections();

    this._bound = false;
  }

  mount() {
    this.renderPartySelectionSlots();
    this.initializeSelectionStorageUi();
    this.bindEvents();
    this.initializeBattle();
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

    this.root.querySelector('[data-action="clear-records"]')?.addEventListener('click', () => {
      this.recordStore = createBattleRecordStore();
      this.renderRecordTable();
      this.setStatus('Records cleared.');
    });

    this.root.querySelector('[data-action="save-selection"]')?.addEventListener('click', () => {
      this.runSafely(() => {
        const slot = this.getSelectedSelectionSlotIndex();
        const ok = this.askConfirm(
          `Selection Slot ${slot + 1} に現在の選択を保存します。よろしいですか？`
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

      if (target.matches('[data-role="selection-slot-select"]')) {
        const slot = this.getSelectedSelectionSlotIndex();
        this.renderSelectionSlotPreview(slot);
      }

      if (target.matches('[data-role="swap-from"]')) {
        const from = toInt(target.value, 0);
        this.renderSwapToOptions(from);
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
      row.appendChild(checkbox);
      row.append(` ${skill.name} (SP ${skill.spCost ?? skill.sp_cost ?? '-'})${sourceBadge}`);
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

      const limitBreakSelect = this.doc.createElement('select');
      limitBreakSelect.setAttribute('data-role', 'limit-break-select');
      limitBreakSelect.setAttribute('data-slot', String(i));

      const skillChecklist = this.doc.createElement('div');
      skillChecklist.setAttribute('data-role', 'skill-checklist');
      skillChecklist.setAttribute('data-slot', String(i));

      wrapper.appendChild(characterSelect);
      wrapper.appendChild(styleSelect);
      wrapper.appendChild(limitBreakSelect);
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
    for (let i = 0; i < SELECTION_SAVE_SLOT_COUNT; i += 1) {
      const option = this.doc.createElement('option');
      option.value = String(i);
      option.textContent = `Slot ${i + 1}`;
      select.appendChild(option);
    }
    select.value = '0';
    this.refreshSelectionSlotOptions();
    this.renderSelectionSlotPreview(0);
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

  getSelectedSelectionSlotIndex() {
    const select = this.root.querySelector('[data-role="selection-slot-select"]');
    return Math.max(0, Math.min(SELECTION_SAVE_SLOT_COUNT - 1, toInt(select?.value, 0)));
  }

  readSelectionStore() {
    const storage = this.doc.defaultView?.localStorage;
    if (!storage) {
      return {
        schemaVersion: SELECTION_SAVE_SCHEMA_VERSION,
        slots: Array(SELECTION_SAVE_SLOT_COUNT).fill(null),
      };
    }

    const raw = storage.getItem(SELECTION_SAVE_STORAGE_KEY);
    if (!raw) {
      return {
        schemaVersion: SELECTION_SAVE_SCHEMA_VERSION,
        slots: Array(SELECTION_SAVE_SLOT_COUNT).fill(null),
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
          slots: Array(SELECTION_SAVE_SLOT_COUNT).fill(null),
        };
      }

      const slots = Array(SELECTION_SAVE_SLOT_COUNT).fill(null);
      for (let i = 0; i < SELECTION_SAVE_SLOT_COUNT; i += 1) {
        slots[i] = parsed.slots[i] ?? null;
      }
      return {
        schemaVersion: SELECTION_SAVE_SCHEMA_VERSION,
        slots,
      };
    } catch {
      return {
        schemaVersion: SELECTION_SAVE_SCHEMA_VERSION,
        slots: Array(SELECTION_SAVE_SLOT_COUNT).fill(null),
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
      const checkedSkillIds = this.getCheckedSkillIdsForSlot(i) ?? [];
      partySelections.push({
        characterLabel: String(charSelect?.value ?? ''),
        styleId: toInt(styleSelect?.value, this.defaultSelections[i].styleId),
        limitBreakLevel: toInt(lbSelect?.value, 0),
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
      this.populateSkillChecklist(i, styleSelect?.value ?? '', row.checkedSkillIds ?? []);
      this.populatePassiveList(i, styleSelect?.value ?? '');
      this.updateSlotSummary(i);
    }

    this.renderSelectionSummary();
    return { changedCount, warnings };
  }

  saveSelectionToSlot(slotIndex) {
    const store = this.readSelectionStore();
    store.slots[slotIndex] = this.captureSelectionState();
    this.writeSelectionStore(store);
    this.refreshSelectionSlotOptions();
    this.renderSelectionSlotPreview(slotIndex);
    this.setStatus(`Selection saved to Slot ${slotIndex + 1}.`);
    return store.slots[slotIndex];
  }

  loadSelectionFromSlot(slotIndex) {
    const store = this.readSelectionStore();
    const state = store.slots[slotIndex];
    if (!state) {
      this.setStatus(`Selection Slot ${slotIndex + 1} is empty.`);
      return null;
    }

    const result = this.applySelectionState(state);
    this.refreshSelectionSlotOptions();
    this.renderSelectionSlotPreview(slotIndex);
    if (result.warnings.length > 0) {
      this.setStatus(
        `Selection loaded from Slot ${slotIndex + 1} (changed=${result.changedCount}). Warnings: ${result.warnings.join('; ')}`
      );
    } else if (result.changedCount === 0) {
      this.setStatus(
        `Selection loaded from Slot ${slotIndex + 1}. No visible changes (same as current selection).`
      );
    } else {
      this.setStatus(`Selection loaded from Slot ${slotIndex + 1} (changed=${result.changedCount}).`);
    }
    return state;
  }

  clearSelectionSlot(slotIndex) {
    const store = this.readSelectionStore();
    store.slots[slotIndex] = null;
    this.writeSelectionStore(store);
    this.refreshSelectionSlotOptions();
    this.renderSelectionSlotPreview(slotIndex);
    this.setStatus(`Selection Slot ${slotIndex + 1} cleared.`);
  }

  refreshSelectionSlotOptions() {
    const select = this.root.querySelector('[data-role="selection-slot-select"]');
    if (!select) {
      return;
    }
    const store = this.readSelectionStore();
    for (let i = 0; i < SELECTION_SAVE_SLOT_COUNT; i += 1) {
      const option = select.querySelector(`option[value="${i}"]`);
      if (!option) {
        continue;
      }
      const hasData = Boolean(store.slots[i]);
      option.textContent = hasData ? `Slot ${i + 1} (Saved)` : `Slot ${i + 1}`;
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
        `Slot ${slotIndex + 1}: empty\n` +
        'localStorage保存のため、同じブラウザ/同じURLならリロード後も保持されます。';
      return;
    }

    const lines = [];
    lines.push(`Slot ${slotIndex + 1} savedAt: ${state.savedAt ?? '-'}`);
    const rows = Array.isArray(state.partySelections) ? state.partySelections : [];
    for (let i = 0; i < rows.length; i += 1) {
      const row = rows[i] ?? {};
      lines.push(
        `P${i + 1}: ${row.characterLabel ?? '-'} / style=${row.styleId ?? '-'} / ` +
          `LB=${row.limitBreakLevel ?? '-'} / skills=${Array.isArray(row.checkedSkillIds) ? row.checkedSkillIds.length : 0}`
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

    const charName = normalizeName(character?.name ?? selectedCharacterLabel);
    summary.textContent =
      `Character: ${charName} / Style: ${style?.name ?? '-'} / ` +
      `LB: ${limitBreakLevel} / Equipped Skills: ${selectedSkillIds.length} / Passives: ${passives.length}`;
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

  initializeBattle(styleIds = this.readStyleIdsFromDom(), options = {}) {
    const skillSetsByPartyIndex = options.skillSetsByPartyIndex ?? this.readSkillSetMapFromDom();
    const limitBreakLevelsByPartyIndex =
      options.limitBreakLevelsByPartyIndex ?? this.readLimitBreakMapFromDom();
    this.party = this.dataStore.buildPartyFromStyleIds(styleIds, {
      initialSP: this.initialSP,
      skillSetsByPartyIndex,
      limitBreakLevelsByPartyIndex,
    });
    this.state = createBattleStateFromParty(this.party);
    this.recordStore = createBattleRecordStore();
    this.previewRecord = null;
    this.pendingSwapEvents = [];

    this.renderActionSelectors();
    this.renderPartyState();
    this.renderSwapSelectors();
    this.renderTurnStatus();
    this.renderRecordTable();
    this.writePreviewOutput('');
    this.writeCsvOutput('');
    const saveSlot = options.autoSaveSlotIndex ?? this.getSelectedSelectionSlotIndex();
    this.saveSelectionToSlot(saveSlot);
    this.setStatus(`Battle initialized. Selection auto-saved to Slot ${saveSlot + 1}.`);

    return this.state;
  }

  renderActionSelectors() {
    const container = this.root.querySelector('[data-role="action-slots"]');
    if (!container || !this.party) {
      return;
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
        option.textContent = `${skill.name} (SP ${skill.spCost})`;
        select.appendChild(option);
      }

      wrapper.appendChild(select);
      container.appendChild(wrapper);
    }

    if (actionableMembers.length === 0) {
      const note = this.doc.createElement('div');
      note.textContent = 'No actionable front members in current turn state.';
      container.appendChild(note);
    }
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
      actionDict[String(member.position)] = {
        characterId: member.characterId,
        skillId,
      };
    }

    return actionDict;
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
    const actions = this.collectActionDictFromDom();

    this.previewRecord = previewTurn(this.state, actions, enemyAction);
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

    const { nextState, committedRecord } = commitTurn(
      this.state,
      this.previewRecord,
      this.pendingSwapEvents,
      { applySwapOnCommit: false }
    );

    this.state = nextState;
    this.recordStore = RecordEditor.upsertRecord(this.recordStore, committedRecord);
    this.previewRecord = null;
    this.pendingSwapEvents = [];

    this.renderActionSelectors();
    this.renderPartyState();
    this.renderSwapSelectors();
    this.renderTurnStatus();
    this.renderRecordTable();
    this.writePreviewOutput('');
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
      option.textContent = `Pos ${member.position + 1}${member.isExtraActive ? ' [EX]' : ''}`;
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
      option.textContent = `Pos ${member.position + 1}${member.isExtraActive ? ' [EX]' : ''}`;
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
      turnLabel.textContent = `${this.state.turnState.turnLabel} (seq=${this.state.turnState.sequenceId})`;
    }
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
        return `<li>Pos ${member.position + 1} [${frontBack}] ${member.characterName}${extraTag} SP=${member.sp.current}</li>`;
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
