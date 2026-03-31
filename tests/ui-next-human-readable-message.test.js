import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createHumanReadableMessageFormatter,
  formatHumanReadableMessage,
} from '../ui-next/utils/human-readable-message.js';

function createMockStore() {
  return {
    getStyleById(styleId) {
      const map = {
        1002109: { id: 1002109, chara: '茅森月歌', name: '夜空のShining Star' },
      };
      return map[styleId] ?? null;
    },
    getSkillById(skillId) {
      const map = {
        46002126: { id: 46002126, name: 'イノセントワイルド' },
      };
      return map[skillId] ?? null;
    },
    getCharacterById(characterId) {
      const map = {
        31: { id: 31, name: '茅森月歌' },
      };
      return map[characterId] ?? null;
    },
  };
}

test('formatHumanReadableMessage appends style and skill names when message contains IDs', () => {
  const store = createMockStore();
  const message = 'Skill 46002126 is not available for style 1002109.';
  const formatted = formatHumanReadableMessage(message, { store });

  assert.match(formatted, /46002126\(イノセントワイルド\)/);
  assert.match(formatted, /1002109\(茅森月歌\/夜空のShining Star\)/);
});

test('createHumanReadableMessageFormatter returns reusable formatter', () => {
  const formatter = createHumanReadableMessageFormatter({ store: createMockStore() });
  const formatted = formatter('skillId=46002126 styleId=1002109 characterId=31');

  assert.match(formatted, /skillId=46002126\(イノセントワイルド\)/);
  assert.match(formatted, /styleId=1002109\(茅森月歌\/夜空のShining Star\)/);
  assert.match(formatted, /characterId=31\(茅森月歌\)/);
});
