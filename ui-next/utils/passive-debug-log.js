const ROW_KIND_MARKER = 'marker';
const ROW_KIND_PASSIVE = 'passive';
const UNKNOWN_TIMING_LABEL = 'UnknownTiming';

function normalizeInlineText(value, fallback = '') {
  return String(value ?? fallback)
    .replace(/\s*\n+\s*/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function resolveStateTurnLabel(state) {
  return normalizeInlineText(state?.turnState?.turnLabel ?? '');
}

function resolveStyleNameFromState(state, characterId, fallbackCharacterName) {
  const normalizedCharacterId = normalizeInlineText(characterId);
  const party = Array.isArray(state?.party) ? state.party : [];
  const member = party.find((item) => normalizeInlineText(item?.characterId) === normalizedCharacterId) ?? null;
  const styleName = normalizeInlineText(member?.styleName ?? '');
  return styleName || normalizeInlineText(fallbackCharacterName);
}

function normalizePassiveEvents(events, stateContext = null, fallbackTurnLabel = '') {
  return (Array.isArray(events) ? events : [])
    .filter((event) => event && typeof event === 'object')
    .map((event) => {
      const characterId = normalizeInlineText(event.characterId ?? '');
      const characterName = normalizeInlineText(event.characterName ?? event.characterId ?? '');
      const passiveName = normalizeInlineText(event.passiveName ?? '');
      const passiveDesc =
        normalizeInlineText(event.passiveDesc ?? event.desc ?? '') || passiveName;
      const turnLabel =
        normalizeInlineText(event.turnLabel ?? '') || normalizeInlineText(fallbackTurnLabel) || resolveStateTurnLabel(stateContext);
      if (!characterName || !passiveName || !turnLabel) {
        return null;
      }
      const styleName = resolveStyleNameFromState(stateContext, characterId, characterName);
      const timing = normalizeInlineText(event.timing ?? '') || UNKNOWN_TIMING_LABEL;
      const suffix = passiveDesc ? ` ${passiveDesc}` : '';
      return {
        kind: ROW_KIND_PASSIVE,
        turnLabel,
        styleName,
        characterName,
        passiveName,
        passiveDesc,
        timing,
        source: normalizeInlineText(event.source ?? ''),
        text: `${turnLabel}：${styleName} / ${characterName} : [${passiveName}]${suffix}`,
      };
    })
    .filter(Boolean);
}

function createSectionMarker(text) {
  return {
    kind: ROW_KIND_MARKER,
    markerType: 'section',
    text,
  };
}

function createTimingMarker(text) {
  return {
    kind: ROW_KIND_MARKER,
    markerType: 'timing',
    text,
  };
}

function appendEventSection(rows, events, sectionLabel) {
  if (!Array.isArray(events) || events.length === 0) {
    return;
  }
  rows.push(createSectionMarker(`=== ${sectionLabel} ===`));
  let currentTiming = null;
  for (const event of events) {
    if (event.timing !== currentTiming) {
      rows.push(createTimingMarker(`--- ${event.timing} ---`));
      currentTiming = event.timing;
    }
    rows.push(event);
  }
}

function appendBoundarySections(rows, events) {
  if (!Array.isArray(events) || events.length === 0) {
    return;
  }
  let index = 0;
  while (index < events.length) {
    const turnLabel = normalizeInlineText(events[index]?.turnLabel ?? '');
    let end = index + 1;
    while (end < events.length && normalizeInlineText(events[end]?.turnLabel ?? '') === turnLabel) {
      end += 1;
    }
    appendEventSection(rows, events.slice(index, end), turnLabel ? `${turnLabel}開始` : '開始');
    index = end;
  }
}

export function buildPassiveDebugLogRows({
  initialState = null,
  currentState = null,
  committedRecords = [],
  getStateBefore = () => null,
} = {}) {
  const rows = [];
  const stateFallback = currentState ?? initialState ?? null;

  appendEventSection(
    rows,
    normalizePassiveEvents(initialState?.turnState?.passiveEventsLastApplied ?? [], initialState),
    '戦闘開始'
  );

  const records = Array.isArray(committedRecords) ? committedRecords : [];
  for (let index = 0; index < records.length; index += 1) {
    const record = records[index];
    if (!record || typeof record !== 'object' || !Array.isArray(record.passiveEvents)) {
      continue;
    }
    const stateBefore = getStateBefore(index) ?? stateFallback;
    const duplicateCount = Array.isArray(stateBefore?.turnState?.passiveEventsLastApplied)
      ? stateBefore.turnState.passiveEventsLastApplied.length
      : 0;
    const nextEvents = normalizePassiveEvents(
      record.passiveEvents.slice(Math.min(duplicateCount, record.passiveEvents.length)),
      stateBefore,
      normalizeInlineText(record.turnLabel ?? '')
    );
    const actionEvents = nextEvents.filter((event) => event.source === 'passive_trigger');
    const boundaryEvents = nextEvents.filter((event) => event.source !== 'passive_trigger');
    const executionTurnLabel =
      normalizeInlineText(actionEvents[0]?.turnLabel ?? '') ||
      normalizeInlineText(record.turnLabel ?? '') ||
      resolveStateTurnLabel(stateBefore);

    appendEventSection(rows, actionEvents, executionTurnLabel ? `${executionTurnLabel}実行` : '実行');
    appendBoundarySections(rows, boundaryEvents);
  }

  return rows;
}
