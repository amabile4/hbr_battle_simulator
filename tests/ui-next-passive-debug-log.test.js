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

test('buildPassiveDebugLogRows renders OnEveryTurnIncludeSpecial as action-selection section', () => {
  const rows = buildPassiveDebugLogRows({
    committedRecords: [
      {
        turnLabel: 'T1',
        passiveEvents: [
          {
            characterId: 'AP1',
            characterName: 'AP1',
            passiveName: 'トルクマキシマム',
            passiveDesc: '行動選択時 自身のスキル攻撃力+50%',
            timing: 'OnEveryTurnIncludeSpecial',
            source: 'action_selection',
          },
        ],
      },
    ],
  });

  const texts = rows.map((row) => row.text);
  assert.ok(texts.includes('=== T1行動選択 ==='));
  assert.ok(texts.includes('--- OnEveryTurnIncludeSpecial ---'));
  assert.ok(texts.some((text) => /T1：AP1 : \[トルクマキシマム\]/.test(text)));
  assert.equal(texts.includes('=== T1開始 ==='), false);
});
