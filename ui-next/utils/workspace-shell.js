export function setToolbarButtonLabel(button, label) {
  if (!button) {
    return;
  }
  const normalizedLabel = String(label ?? '');
  const labelEl = button.querySelector?.('[data-role="toolbar-label"]');
  if (labelEl) {
    labelEl.textContent = normalizedLabel;
  } else {
    button.textContent = normalizedLabel;
  }
  button.setAttribute('aria-label', normalizedLabel);
}

export function applySetupOpenState({
  appRoot,
  setupArea,
  toggleButton,
  open,
}) {
  const normalized = Boolean(open);
  if (appRoot) {
    appRoot.dataset.setupOpen = normalized ? 'true' : 'false';
  }
  if (setupArea) {
    setupArea.hidden = !normalized;
  }
  if (toggleButton) {
    setToolbarButtonLabel(toggleButton, normalized ? '設定を隠す' : '設定を表示');
    toggleButton.title = normalized ? 'Initial Setup を隠す' : 'Initial Setup を表示';
    toggleButton.setAttribute('aria-expanded', String(normalized));
    toggleButton.setAttribute('aria-pressed', String(normalized));
    toggleButton.dataset.active = normalized ? 'true' : 'false';
  }
  return normalized;
}

export function applyPassiveLogOpenState({
  appRoot,
  paneRoot,
  toggleButton,
  open,
  hasRows,
}) {
  const available = Boolean(hasRows);
  const normalized = available && Boolean(open);
  if (appRoot) {
    appRoot.dataset.passiveLogAvailable = available ? 'true' : 'false';
    appRoot.dataset.passiveLogOpen = normalized ? 'true' : 'false';
  }
  if (paneRoot) {
    paneRoot.hidden = !normalized;
  }
  if (toggleButton) {
    toggleButton.disabled = !available;
    setToolbarButtonLabel(toggleButton, normalized ? 'ログを隠す' : 'ログを表示');
    toggleButton.title = available
      ? (normalized ? 'Passive Log を隠す' : 'Passive Log を表示')
      : 'Passive Log はまだありません';
    toggleButton.setAttribute('aria-expanded', String(normalized));
    toggleButton.setAttribute('aria-pressed', String(normalized));
    toggleButton.dataset.active = normalized ? 'true' : 'false';
  }
  return normalized;
}
