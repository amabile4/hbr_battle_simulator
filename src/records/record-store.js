import { upsertRecord, deleteRecord, insertBefore, reindexTurnLabels } from './record-editor.js';
import { exportToCSV, recordToRow } from './csv-exporter.js';

export function createBattleRecordStore() {
  return {
    records: [],
    nextSequenceId: 1,
  };
}

export const RecordEditor = Object.freeze({
  upsertRecord,
  deleteRecord,
  insertBefore,
  reindexTurnLabels,
});

export const CsvExporter = Object.freeze({
  exportToCSV,
  recordToRow,
});
