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
    toggleButton.textContent = normalized ? '設定を隠す' : '設定を表示';
    toggleButton.title = normalized ? 'Initial Setup を隠す' : 'Initial Setup を表示';
    toggleButton.setAttribute('aria-expanded', String(normalized));
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
    toggleButton.textContent = normalized ? 'ログを隠す' : 'ログを表示';
    toggleButton.title = available
      ? (normalized ? 'Passive Log を隠す' : 'Passive Log を表示')
      : 'Passive Log はまだありません';
    toggleButton.setAttribute('aria-expanded', String(normalized));
  }
  return normalized;
}
