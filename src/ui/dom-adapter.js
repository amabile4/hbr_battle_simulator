import { createBattleStateFromParty, previewTurn, commitTurn } from '../turn/turn-controller.js';
import { createBattleRecordStore, RecordEditor, CsvExporter } from '../records/record-store.js';

function toInt(value, fallback = 0) {
  const n = Number.parseInt(String(value), 10);
  return Number.isFinite(n) ? n : fallback;
}

function uniqueStyleCandidates(styles) {
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

    this.styleCandidates = uniqueStyleCandidates(this.dataStore.styles);
    this._bound = false;
  }

  mount() {
    this.renderStyleSelectors();
    this.bindEvents();
    this.initializeBattle();
    return this;
  }

  bindEvents() {
    if (this._bound) {
      return;
    }

    this.root.querySelector('[data-action="initialize"]')?.addEventListener('click', () => {
      this.initializeBattle();
    });

    this.root.querySelector('[data-action="preview"]')?.addEventListener('click', () => {
      this.previewCurrentTurn();
    });

    this.root.querySelector('[data-action="commit"]')?.addEventListener('click', () => {
      this.commitCurrentTurn();
    });

    this.root.querySelector('[data-action="swap"]')?.addEventListener('click', () => {
      const from = toInt(this.root.querySelector('[data-role="swap-from"]')?.value, 0);
      const to = toInt(this.root.querySelector('[data-role="swap-to"]')?.value, 3);
      this.queueSwap(from, to);
    });

    this.root.querySelector('[data-action="export-csv"]')?.addEventListener('click', () => {
      this.exportCsv();
    });

    this.root.querySelector('[data-action="clear-records"]')?.addEventListener('click', () => {
      this.recordStore = createBattleRecordStore();
      this.renderRecordTable();
      this.setStatus('Records cleared.');
    });

    this._bound = true;
  }

  getDefaultStyleIds() {
    const defaultStyles = this.styleCandidates.slice(0, 6);
    if (defaultStyles.length < 6) {
      throw new Error('Not enough styles to build a 6-member party.');
    }

    return defaultStyles.map((style) => Number(style.id));
  }

  renderStyleSelectors() {
    const container = this.root.querySelector('[data-role="style-slots"]');
    if (!container) {
      return;
    }

    container.innerHTML = '';
    const defaults = this.getDefaultStyleIds();

    for (let i = 0; i < 6; i += 1) {
      const wrapper = this.doc.createElement('label');
      wrapper.className = 'style-slot';
      wrapper.textContent = `Slot ${i + 1} `;

      const select = this.doc.createElement('select');
      select.setAttribute('data-style-slot', String(i));

      for (const style of this.styleCandidates) {
        const option = this.doc.createElement('option');
        option.value = String(style.id);
        option.textContent = `${style.name} / ${style.chara_label}`;
        if (Number(style.id) === defaults[i]) {
          option.selected = true;
        }
        select.appendChild(option);
      }

      wrapper.appendChild(select);
      container.appendChild(wrapper);
    }
  }

  readStyleIdsFromDom() {
    const ids = [];
    for (let i = 0; i < 6; i += 1) {
      const select = this.root.querySelector(`[data-style-slot="${i}"]`);
      ids.push(toInt(select?.value, this.getDefaultStyleIds()[i]));
    }
    return ids;
  }

  initializeBattle(styleIds = this.readStyleIdsFromDom()) {
    this.party = this.dataStore.buildPartyFromStyleIds(styleIds, { initialSP: this.initialSP });
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

      for (const skill of member.skills) {
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
      const fallbackSkill = member.skills[0];
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

    this.pendingSwapEvents.push(event);
    this.setStatus(`Swap queued: ${outMember.characterName} <-> ${inMember.characterName}`);
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
      this.pendingSwapEvents
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
