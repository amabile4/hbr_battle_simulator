import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  CHARACTER_STAT_KEYS,
  getTemplateStyleLimitBreakMax,
  resolveCharacterBaseStats,
  resolveCharacterStyleStats,
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

test('実機fixture条件で全360スタイルの装備・サポートなし能力が有限整数になる', () => {
  const charactersByLabel = new Map(characters.map((character) => [character.label, character]));
  const fixtureByCharacterLabel = new Map(
    fixture.characters.map((entry) => [entry.characterLabel, entry])
  );
  const limitBreakLevelsByStyleId = createFixtureLimitBreakMap();
  const missingCharacterLabels = new Set();
  let resolvedStyleCount = 0;

  for (const style of styles) {
    const entry = fixtureByCharacterLabel.get(style.chara_label);
    if (!entry) {
      missingCharacterLabels.add(style.chara_label);
      continue;
    }
    const explicitLimitBreak = limitBreakLevelsByStyleId.get(Number(style.id));
    const limitBreakLevel = explicitLimitBreak === UNOWNED_STYLE_LIMIT_BREAK
      ? 0
      : explicitLimitBreak ?? getTemplateStyleLimitBreakMax(style);
    const stats = resolveCharacterStyleStats({
      character: charactersByLabel.get(style.chara_label),
      style,
      styles,
      level: entry.level,
      reincarnationCount: entry.reincarnationCount,
      titleRank: entry.titleRank,
      titleBadgeRanks,
      limitBreakLevel,
      limitBreakLevelsByStyleId,
    });

    assert.ok(stats, `${style.id} ${style.name}`);
    assert.ok(
      CHARACTER_STAT_KEYS.every((key) => Number.isInteger(stats[key])),
      `${style.id} ${style.name}: ${JSON.stringify(stats)}`
    );
    resolvedStyleCount += 1;
  }

  assert.equal(resolvedStyleCount, 358);
  assert.deepEqual([...missingCharacterLabels].sort(), ['BiancaA', 'CathyA']);
});

test('スタイル能力はキャラクター部分、選択スタイル補正、他スタイル共有LBを合成する', () => {
  const character = {
    label: 'TestCharacter',
    base_param: {
      level: [1, 200],
      str: [100, 200], dex: [100, 200], wis: [100, 200],
      spr: [100, 200], luk: [100, 200], con: [100, 200],
    },
  };
  const ability = (type, valueType, value, isExclusive = false) => ({
    category: 'Ability', type, value_type: valueType, value: [value, 0], is_exclusive: isExclusive,
  });
  const selectedStyle = {
    id: 1,
    chara_label: character.label,
    tier: 'SS',
    base_param: { str: 20, dex: 0, wis: 0, spr: 0, luk: 0, con: 0 },
    ability_tree: [{ ability_list: [
      ability('ParamAll', 'RealNumber', 3),
      ability('Power', 'Addition', 4, true),
      ability('Dexterity', 'Ratio', 10, true),
    ] }],
    limit_break: { stat_up_per_level: 5, bonus_per_level: [] },
  };
  const otherStyle = {
    id: 2,
    chara_label: character.label,
    tier: 'SS',
    base_param: {},
    ability_tree: [{ ability_list: [ability('ParamAll', 'RealNumber', 2)] }],
    limit_break: { stat_up_per_level: 0, bonus_per_level: [{
      step: 4,
      bonus: [
        ability('ParamAll', 'RealNumber', 1),
        ability('ParamAllOtherCard', 'Ratio', 10),
      ],
    }] },
  };
  const titleRanks = { items: [
    { rank: 1, abilityEffectLabel: null },
    { rank: 2, abilityEffectLabel: ['ParamAll_RealNumber_1'] },
  ] };

  assert.deepEqual(resolveCharacterStyleStats({
    character,
    style: selectedStyle,
    styles: [selectedStyle, otherStyle],
    level: 100,
    reincarnationCount: 2,
    titleRank: 2,
    titleBadgeRanks: titleRanks,
    limitBreakLevel: 2,
    limitBreakLevelsByStyleId: { 2: 4 },
  }), {
    str: 227,
    dex: 207,
    wis: 191,
    spr: 191,
    luk: 191,
    con: 191,
  });
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
