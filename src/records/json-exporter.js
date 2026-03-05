const RECORD_EXPORT_SCHEMA_VERSION = 1;

function jsonReplacer(_key, value) {
  if (typeof value !== 'number' || Number.isFinite(value)) {
    return value;
  }
  if (Number.isNaN(value)) {
    return 'NaN';
  }
  return value > 0 ? 'Infinity' : '-Infinity';
}

function normalizeRecordStore(store) {
  if (!store || typeof store !== 'object') {
    return {
      records: [],
      nextSequenceId: 1,
    };
  }

  const records = Array.isArray(store.records) ? store.records : [];
  const nextSequenceId = Number(store.nextSequenceId);
  return {
    ...store,
    records,
    nextSequenceId: Number.isFinite(nextSequenceId) ? nextSequenceId : records.length + 1,
  };
}

export function buildRecordExportPayload(store, exportedAt = new Date().toISOString()) {
  return {
    schemaVersion: RECORD_EXPORT_SCHEMA_VERSION,
    exportedAt: String(exportedAt),
    recordStore: normalizeRecordStore(store),
  };
}

export function exportToJSON(store, options = {}) {
  const payload = buildRecordExportPayload(store, options.exportedAt ?? new Date().toISOString());
  const space = Number.isInteger(options.space) ? options.space : 2;
  return JSON.stringify(payload, jsonReplacer, space);
}
