export class BattleDomView {
  constructor({ root, doc }) {
    this.root = root;
    this.doc = doc;
  }

  query(selector) {
    return this.root.querySelector(selector);
  }

  writeText(selector, text) {
    const node = this.query(selector);
    if (node) {
      node.textContent = String(text ?? '');
    }
  }

  writeValueOrText(selector, text) {
    const node = this.query(selector);
    if (!node) {
      return;
    }
    if ('value' in node) {
      node.value = String(text ?? '');
      return;
    }
    node.textContent = String(text ?? '');
  }

  setStatus(message) {
    this.writeText('[data-role="status"]', message);
  }

  writePreviewOutput(text) {
    this.writeText('[data-role="preview-output"]', text);
  }

  writeConditionSupportSummary(text) {
    this.writeValueOrText('[data-role="condition-support-summary"]', text);
  }

  writeCsvOutput(text) {
    this.writeValueOrText('[data-role="csv-output"]', text);
  }

  writeRecordsJsonOutput(text) {
    this.writeValueOrText('[data-role="records-json-output"]', text);
  }

  writePassiveLogOutput(text) {
    this.writeValueOrText('[data-role="passive-log-output"]', text);
  }

  renderScenarioStatus({ scenario, cursor, stagedTurnIndex }) {
    const node = this.query('[data-role="scenario-status"]');
    if (!node) {
      return;
    }
    if (!scenario) {
      node.textContent = 'Not loaded';
      return;
    }
    const total = Array.isArray(scenario.turns) ? scenario.turns.length : 0;
    const isStaged =
      stagedTurnIndex !== null &&
      Number.isFinite(Number(stagedTurnIndex)) &&
      Number(stagedTurnIndex) === Number(cursor);
    node.textContent = `Loaded (turns ${cursor}/${total}${isStaged ? ' staged' : ''})`;
  }

  setDomValue(selector, value) {
    const node = this.query(selector);
    if (!node) {
      return;
    }
    if ('value' in node) {
      node.value = String(value);
    }
  }
}
