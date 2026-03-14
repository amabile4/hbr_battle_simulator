function cloneStore(store) {
  return {
    records: [...store.records],
    nextSequenceId: store.nextSequenceId,
  };
}

function normalizeTurnIds(records) {
  return records.map((record, idx) => ({
    ...record,
    turnId: idx + 1,
  }));
}

function buildTurnLabel(turnType, turnIndex, odStep = 1) {
  if (turnType === 'normal') {
    return `T${turnIndex}`;
  }

  if (turnType === 'od') {
    return `OD${odStep}`;
  }

  return 'EX';
}

export function upsertRecord(store, record) {
  const next = cloneStore(store);
  const idx = next.records.findIndex((item) => item.turnId === record.turnId);

  if (idx >= 0) {
    next.records[idx] = record;
  } else {
    next.records.push(record);
    next.records.sort((a, b) => a.turnId - b.turnId);
  }

  next.nextSequenceId = Math.max(next.nextSequenceId, ...next.records.map((r) => r.turnId + 1));
  return next;
}

export function deleteRecord(store, turnId, opts = { cascade: false }) {
  const next = cloneStore(store);
  const target = next.records.find((record) => record.turnId === turnId);
  if (!target) {
    return next;
  }

  let filtered = next.records.filter((record) => record.turnId !== turnId);

  if (opts.cascade && (target.turnType === 'od' || target.turnType === 'extra')) {
    filtered = filtered.filter((record) => record.turnIndex !== target.turnIndex);
  }

  next.records = normalizeTurnIds(filtered);
  next.nextSequenceId = next.records.length + 1;
  return reindexTurnLabels(next);
}

export function insertBefore(store, targetTurnId, record) {
  const next = cloneStore(store);
  const idx = next.records.findIndex((item) => item.turnId === targetTurnId);
  if (idx < 0) {
    throw new Error(`Target turnId not found: ${targetTurnId}`);
  }

  next.records.splice(idx, 0, record);
  next.records = normalizeTurnIds(next.records);
  next.nextSequenceId = next.records.length + 1;
  return reindexTurnLabels(next);
}

export function reindexTurnLabels(store) {
  const next = cloneStore(store);
  let normalTurn = 0;
  let odStep = 0;

  next.records = next.records.map((record) => {
    if (record.turnType === 'normal') {
      normalTurn += 1;
      odStep = 0;
      return {
        ...record,
        turnIndex: normalTurn,
        turnLabel: buildTurnLabel('normal', normalTurn),
      };
    }

    if (record.turnType === 'od') {
      odStep += 1;
      return {
        ...record,
        turnIndex: normalTurn,
        turnLabel: buildTurnLabel('od', normalTurn, odStep),
      };
    }

    return {
      ...record,
      turnIndex: normalTurn,
      turnLabel: buildTurnLabel('extra', normalTurn),
    };
  });

  next.nextSequenceId = next.records.length + 1;
  return next;
}
