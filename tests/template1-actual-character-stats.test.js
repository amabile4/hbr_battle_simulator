import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  CHARACTER_STAT_KEYS,
  getTemplateStyleLimitBreakMax,
  resolveCharacterBaseStats,
  UNOWNED_STYLE_LIMIT_BREAK,
} from '../src/domain/character-stats.js';

const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'));
const fixture = readJson('tests/fixtures/template1_actual_character_stats_20260629.json');
const characters = readJson('json/characters.json');
const styles = readJson('json/styles.json');
const titleBadgeRanks = readJson('golden/master_json/MasterTitleBadgeRank.json');

function createFixtureLimitBreakMap() {
  return new Map([
    ...fixture.styleLimitBreaks.map(({ styleId, limitBreakLevel }) => [styleId, limitBreakLevel]),
    ...Object.entries(fixture.assumptions.specialLimitBreakOverrides)
      .map(([styleId, limitBreakLevel]) => [Number(styleId), limitBreakLevel]),
  ]);
}

test('実機fixtureの58キャラクターで装備・サポートなし共有能力が全件一致する', () => {
  const charactersByLabel = new Map(characters.map((character) => [character.label, character]));
  const limitBreakLevelsByStyleId = createFixtureLimitBreakMap();

  assert.equal(fixture.characters.length, 58);
  for (const entry of fixture.characters) {
    const actual = resolveCharacterBaseStats({
      character: charactersByLabel.get(entry.characterLabel),
      styles,
      level: entry.level,
      reincarnationCount: entry.reincarnationCount,
      titleRank: entry.titleRank,
      titleBadgeRanks,
      limitBreakLevelsByStyleId,
    });
    assert.deepEqual(actual, entry.expectedStats, entry.characterName);
  }
});

test('実機fixtureの所持条件が全360スタイルを網羅する', () => {
  const limitBreakLevelsByStyleId = createFixtureLimitBreakMap();

  assert.equal(styles.length, 360);
  for (const style of styles) {
    const explicit = limitBreakLevelsByStyleId.get(Number(style.id));
    if (['A', 'S'].includes(String(style.tier).toUpperCase())) {
      const expected = Number(style.id) === 1002507 ? 6 : getTemplateStyleLimitBreakMax(style);
      assert.equal(explicit ?? getTemplateStyleLimitBreakMax(style), expected, `${style.id} ${style.name}`);
    } else {
      assert.notEqual(explicit, undefined, `${style.id} ${style.name}`);
      assert.ok(
        explicit === UNOWNED_STYLE_LIMIT_BREAK || Number.isInteger(explicit),
        `${style.id} ${style.name}: ${explicit}`
      );
    }
  }
});

test('キャラクター部分はLv補間、転生、累積称号、共有ボード、共有LBを個別加算する', () => {
  const character = {
    label: 'TestCharacter',
    base_param: {
      level: [1, 200],
      str: [10, 210], dex: [10, 210], wis: [10, 210],
      spr: [10, 210], luk: [10, 210], con: [10, 210],
    },
  };
  const ability = (value) => ({
    category: 'Ability',
    type: 'ParamAll',
    value_type: 'RealNumber',
    value: [value, 0],
    is_exclusive: false,
  });
  const ownedStyle = {
    id: 1,
    chara_label: character.label,
    tier: 'SS',
    ability_tree: [{ ability_list: [ability(2)] }],
    limit_break: {
      bonus_per_level: [{ step: 2, bonus: [ability(1)] }],
    },
  };
  const unownedStyle = {
    id: 2,
    chara_label: character.label,
    tier: 'SS',
    ability_tree: [{ ability_list: [ability(100)] }],
    limit_break: { bonus_per_level: [] },
  };
  const titleRanks = { items: [
    { rank: 1, abilityEffectLabel: null },
    { rank: 2, abilityEffectLabel: ['ParamAll_RealNumber_1'] },
    { rank: 3, abilityEffectLabel: ['ParamAll_RealNumber_1'] },
  ] };

  const actual = resolveCharacterBaseStats({
    character,
    styles: [ownedStyle, unownedStyle],
    level: 180,
    reincarnationCount: 5,
    titleRank: 3,
    titleBadgeRanks: titleRanks,
    limitBreakLevelsByStyleId: { 1: 2, 2: UNOWNED_STYLE_LIMIT_BREAK },
  });

  assert.deepEqual(actual, Object.fromEntries(CHARACTER_STAT_KEYS.map((key) => [key, 200])));
});
