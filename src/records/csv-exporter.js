function csvEscape(value) {
  const text = String(value ?? '');
  if (text.includes(',') || text.includes('"') || text.includes('\n')) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function getSnapshotByPartyIndex(snapshots) {
  const map = new Map();
  for (const snap of snapshots ?? []) {
    map.set(Number(snap.partyIndex), snap);
  }
  return map;
}

function getActionContext(record) {
  const turnType = String(record?.turnType ?? '');
  if (turnType === 'od') {
    return 'od';
  }
  if (turnType === 'extra') {
    return Number(record?.remainingOdActionsAtStart ?? 0) > 0 ? 'od_extra' : 'extra';
  }
  return 'normal';
}

function formatOdGaugePercent(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) {
    return '0.00%';
  }
  return `${n.toFixed(2)}%`;
}

function formatTranscendencePercent(record) {
  const start = Number(record?.transcendence?.startGaugePercent ?? 0);
  if (!Number.isFinite(start)) {
    return '0%';
  }
  return `${Math.max(0, Math.floor(start))}%`;
}

function formatActionCell(action) {
  if (!action) {
    return '-';
  }
  const name = String(action.skillName ?? '-');
  const consumeType = String(action.consumeType ?? 'Sp').toLowerCase();
  const costSpEvent = Array.isArray(action.spChanges)
    ? action.spChanges.find((entry) => String(entry?.source ?? '') === 'cost')
    : null;
  const spDelta = Math.abs(Number(costSpEvent?.delta ?? 0));
  const epDelta = Math.abs(Number(action.startEP ?? 0) - Number(action.endEP ?? 0));
  let costLabel = consumeType === 'ep' ? `EP ${epDelta}` : `SP ${spDelta}`;
  if (consumeType !== 'ep' && Number(action.spCost) === -1 && spDelta > 0) {
    costLabel = 'SP ALL';
  }
  const target = String(action.skillTargetType ?? '');
  const hit = Number(action.skillHitCount ?? 0);
  const baseHit = Number(action.skillBaseHitCount ?? 0);
  const funnelHit = Number(action.skillFunnelHitBonus ?? 0);
  const targetLabel = target || '?';
  let hitLabel = '-hit';
  if (Number.isFinite(hit) && hit > 0) {
    if (Number.isFinite(baseHit) && baseHit > 0 && Number.isFinite(funnelHit) && funnelHit > 0) {
      hitLabel = `${hit}hit (${baseHit}+${funnelHit})`;
    } else {
      hitLabel = `${hit}hit`;
    }
  }
  return `${name} (${costLabel}) [${targetLabel},${hitLabel}]`;
}

export function recordToRow(record, initialParty) {
  const sortedParty = [...initialParty].sort((a, b) => a.partyIndex - b.partyIndex);
  const beforeMap = getSnapshotByPartyIndex(record.snapBefore);
  const afterMap = getSnapshotByPartyIndex(record.snapAfter ?? record.snapBefore);
  const turnType = String(record?.turnType ?? '');
  const odTurn = String(record?.odTurnLabelAtStart ?? '');
  const odContext = String(record?.odContext ?? '');
  const ex = turnType === 'extra' ? 'ex' : '';

  const row = [
    Number(record.turnId),
    Number(record.turnIndex ?? 0),
    odTurn,
    odContext,
    ex,
    formatOdGaugePercent(record?.odGaugeAtStart ?? 0),
    formatTranscendencePercent(record),
    record.enemyAction ?? '',
  ];

  for (const member of sortedParty) {
    const partyIndex = Number(member.partyIndex);
    const action = record.actions.find((item) => Number(item.partyIndex) === partyIndex) ?? null;
    const before = beforeMap.get(partyIndex);
    const after = afterMap.get(partyIndex);

    row.push(before ? before.sp.current : '');
    row.push(before ? Number(before.positionIndex) + 1 : '');
    row.push(formatActionCell(action));
    row.push(after ? after.sp.current : before ? before.sp.current : '');
  }

  return row;
}

export function exportToCSV(store, initialParty) {
  const sortedParty = [...initialParty].sort((a, b) => a.partyIndex - b.partyIndex);
  const header = ['seq', 'turn', 'od_turn', 'od_context', 'ex', 'od', 'transcendence', 'enemyAction'];

  for (const member of sortedParty) {
    header.push(`${member.characterName}_startSP`);
    header.push(`${member.characterName}_position`);
    header.push(`${member.characterName}_action`);
    header.push(`${member.characterName}_endSP`);
  }

  const rows = [header];
  for (const record of store.records) {
    rows.push(recordToRow(record, sortedParty));
  }

  return rows.map((row) => row.map(csvEscape).join(',')).join('\n');
}
