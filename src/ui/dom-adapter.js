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
        const to = toInt(this.root.querySelector('[data-role="swap-to"]')?.value, 3);
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
    this.renderTurnStatus();
    this.renderRecordTable();
    this.writePreviewOutput('');
    this.writeCsvOutput('');
    this.setStatus('Battle initialized.');

    return this.state;
  }

  renderActionSelectors() {
    const container = this.root.querySelector('[data-role="action-slots"]');
    if (!container || !this.party) {
      return;
    }

    container.innerHTML = '';

    for (const member of this.party.getFrontline()) {
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
  }

  collectActionDictFromDom() {
    if (!this.party) {
      throw new Error('Party is not initialized.');
    }

    const actionDict = {};
    for (const member of this.party.getFrontline()) {
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
        return `<li>Pos ${member.position + 1} [${frontBack}] ${member.characterName} SP=${member.sp.current}</li>`;
      })
      .join('');

    container.innerHTML = rows;
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
