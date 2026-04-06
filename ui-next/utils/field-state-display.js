const ELEMENT_LABEL_MAP = Object.freeze({
  Fire: '火',
  Ice: '氷',
  Thunder: '雷',
  Light: '光',
  Dark: '闇',
  RiceField: '稲穂',
});

const ELEMENT_TONE_MAP = Object.freeze({
  Fire: 'fire',
  Ice: 'ice',
  Thunder: 'thunder',
  Light: 'light',
  Dark: 'dark',
  RiceField: 'neutral',
});

const FIELD_LABELS = Object.freeze({
  zone: 'Zone',
  territory: 'Territory',
  talisman: '霊符状態',
});

function formatMultiplier(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return '';
  }
  return `x${numeric.toFixed(2)}`;
}

function resolveRemainingLabel(remainingTurns) {
  if (remainingTurns === null || remainingTurns === undefined) {
    return '永続';
  }
  const numeric = Number(remainingTurns);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return '';
  }
  return `${Math.floor(numeric)}T`;
}

function resolveElementLabel(type) {
  const key = String(type ?? '').trim();
  if (!key) {
    return '';
  }
  return ELEMENT_LABEL_MAP[key] ?? key;
}

function resolveElementTone(type) {
  const key = String(type ?? '').trim();
  if (!key) {
    return 'neutral';
  }
  return ELEMENT_TONE_MAP[key] ?? 'neutral';
}

function resolveChipDurationLabel(remainingTurns) {
  if (remainingTurns === null || remainingTurns === undefined) {
    return '永続';
  }
  const numeric = Number(remainingTurns);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return '';
  }
  return String(Math.floor(numeric));
}

function isActiveFieldState(fieldState) {
  if (!fieldState || typeof fieldState !== 'object') {
    return false;
  }
  const rawRemaining = fieldState.remainingTurns;
  if (rawRemaining === null || rawRemaining === undefined) {
    return true;
  }
  const remaining = Number(rawRemaining);
  return Number.isFinite(remaining) && remaining > 0;
}

function isDisplayableTalismanState(talismanState) {
  if (!talismanState || typeof talismanState !== 'object') {
    return false;
  }
  const active = Boolean(talismanState.active);
  const level = Number(talismanState.level ?? 0);
  const hasCustomText = Boolean(
    String(talismanState.talismanName ?? talismanState.name ?? '').trim() ||
      String(talismanState.desc ?? '').trim()
  );
  return active || level > 0 || hasCustomText;
}

function buildZoneEntry(zoneState) {
  if (!isActiveFieldState(zoneState)) {
    return null;
  }
  const elementLabel = resolveElementLabel(zoneState.type);
  const name = String(zoneState.zoneName ?? zoneState.name ?? (elementLabel ? `${elementLabel}ゾーン` : 'Zone')).trim();
  const desc = String(zoneState.zoneDesc ?? zoneState.desc ?? '').trim();
  const duration = resolveRemainingLabel(zoneState.remainingTurns);
  const chipDuration = resolveChipDurationLabel(zoneState.remainingTurns);
  const strength = formatMultiplier(zoneState.powerRate);
  const meta = [elementLabel, strength ? `倍率${strength}` : ''].filter(Boolean);
  const chipText = [
    `${elementLabel || '無属性'}フィールド`,
    strength,
    chipDuration ? `(${chipDuration})` : '',
  ].filter(Boolean).join(' / ');
  return {
    kind: 'zone',
    label: FIELD_LABELS.zone,
    name,
    duration,
    desc,
    meta,
    chipText,
    chipTone: resolveElementTone(zoneState.type),
  };
}

function buildTerritoryEntry(territoryState) {
  if (!isActiveFieldState(territoryState)) {
    return null;
  }
  const elementLabel = resolveElementLabel(territoryState.type);
  const name = String(
    territoryState.territoryName ?? territoryState.name ?? (elementLabel ? `${elementLabel}Territory` : 'Territory')
  ).trim();
  const desc = String(territoryState.desc ?? '').trim();
  const duration = resolveRemainingLabel(territoryState.remainingTurns);
  const chipDuration = resolveChipDurationLabel(territoryState.remainingTurns);
  const strength = formatMultiplier(territoryState.powerRate);
  const meta = [elementLabel, strength ? `倍率${strength}` : ''].filter(Boolean);
  const chipText = [
    `${elementLabel || '無属性'}フィールド`,
    strength,
    chipDuration ? `(${chipDuration})` : '',
  ].filter(Boolean).join(' / ');
  return {
    kind: 'territory',
    label: FIELD_LABELS.territory,
    name,
    duration,
    desc,
    meta,
    chipText,
    chipTone: resolveElementTone(territoryState.type),
  };
}

function buildTalismanEntry(talismanState) {
  if (!isDisplayableTalismanState(talismanState)) {
    return null;
  }
  const active = Boolean(talismanState?.active);
  const level = Number(talismanState?.level ?? 0);
  const maxLevel = Math.max(1, Number(talismanState?.maxLevel ?? 10));
  const duration = resolveRemainingLabel(talismanState?.remainingTurns);
  const name = String(talismanState?.talismanName ?? talismanState?.name ?? FIELD_LABELS.talisman).trim();
  const desc = String(talismanState?.desc ?? '').trim();
  const meta = [
    active ? '有効' : '待機',
    `Lv${Math.max(0, Math.floor(level))}/${Math.floor(maxLevel)}`,
  ].filter(Boolean);
  return {
    kind: 'talisman',
    label: FIELD_LABELS.talisman,
    name,
    duration,
    desc,
    meta,
    chipText: `${name} / Lv${Math.max(0, Math.floor(level))}`,
    chipTone: 'neutral',
  };
}

export function buildFieldDisplayEntries(stateOrRecord) {
  const entries = [];
  const zoneEntry = buildZoneEntry(stateOrRecord?.zoneState ?? null);
  const territoryEntry = buildTerritoryEntry(stateOrRecord?.territoryState ?? null);
  const talismanEntry = buildTalismanEntry(stateOrRecord?.talismanState ?? null);

  if (zoneEntry) {
    entries.push(zoneEntry);
  }
  if (territoryEntry) {
    entries.push(territoryEntry);
  }
  if (talismanEntry) {
    entries.push(talismanEntry);
  }

  return entries;
}

export { isDisplayableTalismanState };