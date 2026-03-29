import test from 'node:test';
import assert from 'node:assert/strict';

import { buildPassiveDebugLogRows } from '../ui-next/utils/passive-debug-log.js';

test('buildPassiveDebugLogRows formats warning messages via formatMessage callback', () => {
  const rows = buildPassiveDebugLogRows({
    initialState: null,
    currentState: null,
    committedRecords: [],
    getStateBefore: () => null,
    replayDiagnostics: {
      setupWarnings: ['Skill 46002126 is not available for style 1002109.'],
      turnWarnings: [['skillId=46002126 styleId=1002109']],
    },
    formatMessage: (message) =>
      String(message)
        .replace(/46002126/g, '46002126(イノセントワイルド)')
        .replace(/1002109/g, '1002109(茅森月歌/夜空のShining Star)'),
  });

  const warningRows = rows.filter((row) => row.kind === 'warning').map((row) => row.text);
  assert.equal(warningRows.length, 2);
  assert.match(warningRows[0], /46002126\(イノセントワイルド\)/);
  assert.match(warningRows[0], /1002109\(茅森月歌\/夜空のShining Star\)/);
  assert.match(warningRows[1], /46002126\(イノセントワイルド\)/);
  assert.match(warningRows[1], /1002109\(茅森月歌\/夜空のShining Star\)/);
});
