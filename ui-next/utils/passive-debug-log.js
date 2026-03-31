const ROW_KIND_MARKER = 'marker';
const ROW_KIND_PASSIVE = 'passive';
const ROW_KIND_WARNING = 'warning';
const UNKNOWN_TIMING_LABEL = 'UnknownTiming';

const TURN_START_TIMINGS = Object.freeze([
  'OnEveryTurn',
  'OnEveryTurnIncludeSpecial',
  'OnPlayerTurnStart',
]);
const BATTLE_START_TIMINGS = Object.freeze(['OnBattleStart', 'OnFirstBattleStart']);
// OnAdditionalTurnStart はエンジン側で boundaryPassiveEvents として処理されるため境界扱い
const BOUNDARY_TIMINGS = Object.freeze(['OnEnemyTurnStart', 'OnBattleWin', 'OnAdditionalTurnStart']);

function normalizeInlineText(value, fallback = '') {
  return String(value ?? fallback)
    .replace(/\s*\n+\s*/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function resolveStateTurnLabel(state) {
  return normalizeInlineText(state?.turnState?.turnLabel ?? '');
}


function normalizePassiveEvents(events, stateContext = null, fallbackTurnLabel = '') {
  return (Array.isArray(events) ? events : [])
    .filter((event) => event && typeof event === 'object')
    .map((event) => {
      const characterId = normalizeInlineText(event.characterId ?? '');
      const characterName = normalizeInlineText(event.shortCharacterName ?? event.characterName ?? event.characterId ?? '');
      const passiveName = normalizeInlineText(event.passiveName ?? '');
      const passiveDesc =
        normalizeInlineText(event.passiveDesc ?? event.desc ?? '') || passiveName;
      const turnLabel =
        normalizeInlineText(event.turnLabel ?? '') || normalizeInlineText(fallbackTurnLabel) || resolveStateTurnLabel(stateContext);
      if (!characterName || !passiveName || !turnLabel) {
        return null;
      }
      const timing = normalizeInlineText(event.timing ?? '') || UNKNOWN_TIMING_LABEL;
      const sourceType = normalizeInlineText(event.sourceType ?? '');
      const suffix = passiveDesc ? ` ${passiveDesc}` : '';
      // サポートパッシブの場合はキャラクター名にサポート由来の識別子を付与
      const displayName = sourceType === 'support' ? `${characterName}[共鳴]` : characterName;
      return {
        kind: ROW_KIND_PASSIVE,
        turnLabel,
        characterName,
        passiveName,
        passiveDesc,
        timing,
        sourceType,
        source: normalizeInlineText(event.source ?? ''),
        text: `${turnLabel}：${displayName} : [${passiveName}]${suffix}`,
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

function appendReplayWarnings(rows, replayDiagnostics = null, formatMessage = null) {
  const normalizeMessage = (message) => {
    const formatted =
      typeof formatMessage === 'function'
        ? formatMessage(message)
        : message;
    return normalizeInlineText(formatted);
  };
  const setupWarnings = Array.isArray(replayDiagnostics?.setupWarnings)
    ? replayDiagnostics.setupWarnings.map((warning) => normalizeMessage(warning)).filter(Boolean)
    : [];
  const turnWarnings = Array.isArray(replayDiagnostics?.turnWarnings)
    ? replayDiagnostics.turnWarnings
    : [];

  const normalizedTurnWarnings = [];
  for (let turnIndex = 0; turnIndex < turnWarnings.length; turnIndex += 1) {
    const warnings = Array.isArray(turnWarnings[turnIndex]) ? turnWarnings[turnIndex] : [];
    for (const warning of warnings) {
      const message = normalizeMessage(warning);
      if (!message) {
        continue;
      }
      normalizedTurnWarnings.push({
        turnIndex,
        message,
      });
    }
  }

  if (setupWarnings.length === 0 && normalizedTurnWarnings.length === 0) {
    return;
  }

  rows.push(createSectionMarker('=== Warning ==='));
  for (const warning of setupWarnings) {
    rows.push({
      kind: ROW_KIND_WARNING,
      text: `[Setup] ${warning}`,
    });
  }
  for (const warning of normalizedTurnWarnings) {
    rows.push({
      kind: ROW_KIND_WARNING,
      text: `[#${warning.turnIndex + 1}] ${warning.message}`,
    });
  }
}

export function buildPassiveDebugLogRows({
  initialState = null,
  currentState = null,
  committedRecords = [],
  getStateBefore = () => null,
  replayDiagnostics = null,
  formatMessage = null,
} = {}) {
  const rows = [];
  const stateFallback = currentState ?? initialState ?? null;

  // 「戦闘開始」セクション: OnBattleStart / OnFirstBattleStart のみ
  const initialEvents = normalizePassiveEvents(
    initialState?.turnState?.passiveEventsLastApplied ?? [],
    initialState
  );
  const battleStartEvents = initialEvents.filter((e) => BATTLE_START_TIMINGS.includes(e.timing));
  appendEventSection(rows, battleStartEvents, '戦闘開始');

  const records = Array.isArray(committedRecords) ? committedRecords : [];
  let prevBoundaryCount = 0; // 前ターンで表示済みの境界パッシブ数

  for (let index = 0; index < records.length; index += 1) {
    const record = records[index];
    if (!record || typeof record !== 'object' || !Array.isArray(record.passiveEvents)) {
      continue;
    }
    const stateBefore = getStateBefore(index) ?? stateFallback;
    const turnLabel =
      normalizeInlineText(record.turnLabel ?? '') || resolveStateTurnLabel(stateBefore);

    const allEvents = normalizePassiveEvents(record.passiveEvents, stateBefore, turnLabel);

    // timing フィールドで分類
    const turnStartEvents = allEvents.filter((e) => TURN_START_TIMINGS.includes(e.timing));
    const actionEvents = allEvents.filter((e) => e.source === 'passive_trigger');
    const allBoundaryEvents = allEvents.filter((e) => BOUNDARY_TIMINGS.includes(e.timing));

    // currentTurnPassiveEvents 経由で引き継がれた前ターンの境界パッシブ重複を除外
    const boundaryEvents = allBoundaryEvents.slice(prevBoundaryCount);

    appendEventSection(rows, turnStartEvents, turnLabel ? `${turnLabel}開始` : '開始');
    appendEventSection(rows, actionEvents, turnLabel ? `${turnLabel}実行` : '実行');
    appendBoundarySections(rows, boundaryEvents);

    prevBoundaryCount = boundaryEvents.length;
  }

  // 未コミットの現在ターンの開始パッシブを表示
  // currentState.turnState.passiveEventsLastApplied の TURN_START_TIMINGS
  const pendingEventsRaw = currentState?.turnState?.passiveEventsLastApplied ?? [];
  const pendingTurnLabel = resolveStateTurnLabel(currentState) || `T${records.length + 1}`;
  const pendingTurnStartEvents = normalizePassiveEvents(
    pendingEventsRaw,
    currentState ?? stateFallback,
    pendingTurnLabel
  ).filter((e) => TURN_START_TIMINGS.includes(e.timing));
  appendEventSection(rows, pendingTurnStartEvents, `${pendingTurnLabel}開始`);

  appendReplayWarnings(rows, replayDiagnostics, formatMessage);

  return rows;
}
