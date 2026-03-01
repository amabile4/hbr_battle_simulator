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

export function recordToRow(record, initialParty) {
  const sortedParty = [...initialParty].sort((a, b) => a.partyIndex - b.partyIndex);
  const beforeMap = getSnapshotByPartyIndex(record.snapBefore);
  const afterMap = getSnapshotByPartyIndex(record.snapAfter ?? record.snapBefore);

  const row = [
    Number(record.turnId),
    record.turnLabel,
    getActionContext(record),
    record.enemyAction ?? '',
  ];

  for (const member of sortedParty) {
    const partyIndex = Number(member.partyIndex);
    const action = record.actions.find((item) => Number(item.partyIndex) === partyIndex) ?? null;
    const before = beforeMap.get(partyIndex);
    const after = afterMap.get(partyIndex);

    row.push(before ? before.sp.current : '');
    row.push(before ? Number(before.positionIndex) + 1 : '');
    row.push(action ? action.skillName : '-');
    row.push(after ? after.sp.current : before ? before.sp.current : '');
  }

  return row;
}

export function exportToCSV(store, initialParty) {
  const sortedParty = [...initialParty].sort((a, b) => a.partyIndex - b.partyIndex);
  const header = ['seq', 'turnLabel', 'actionContext', 'enemyAction'];

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
