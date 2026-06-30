import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  CHARACTER_STAT_KEYS,
  getTemplateStyleLimitBreakMax,
  normalizeCharacterStats,
  normalizeStatsByPartyIndex,
  resolveStatsWithSupport,
  resolveTemplateCharacterStats,
} from '../src/domain/character-stats.js';

const MAIN_STATS = Object.freeze({
  str: 650,
  dex: 660,
  wis: 670,
  spr: 680,
  luk: 690,
  con: 700,
});

test('resolveStatsWithSupport adds 10% of each support stat', () => {
  const supportStats = {
    str: 101,
    dex: 111,
    wis: 121,
    spr: 131,
    luk: 141,
    con: 151,
  };

  assert.deepEqual(resolveStatsWithSupport(MAIN_STATS, supportStats), {
    str: 661,
    dex: 672,
    wis: 683,
    spr: 694,
    luk: 705,
    con: 716,
  });
});

test('resolveStatsWithSupport returns main stats without support and rejects incomplete main stats', () => {
  assert.deepEqual(resolveStatsWithSupport(MAIN_STATS), MAIN_STATS);
  assert.equal(resolveStatsWithSupport({ str: 650 }), null);
});

test('normalizers reject incomplete stats and preserve valid slot entries', () => {
  assert.equal(normalizeCharacterStats({ str: 650 }), null);
  assert.equal(normalizeCharacterStats({ ...MAIN_STATS, dex: 0 }), null);
  assert.equal(normalizeCharacterStats({ ...MAIN_STATS, wis: null }), null);
  assert.deepEqual(normalizeStatsByPartyIndex({
    0: { stats: MAIN_STATS },
    1: { supportStats: MAIN_STATS },
    2: { stats: { str: 650 } },
  }), {
    0: { stats: MAIN_STATS },
    1: { supportStats: MAIN_STATS },
  });
});

test('template ① resolves RKayamori04 real-data stats at LB0 and LB4', () => {
  const characters = JSON.parse(readFileSync('json/characters.json', 'utf8'));
  const styles = JSON.parse(readFileSync('json/styles.json', 'utf8'));
  const style = styles.find((candidate) => Number(candidate.id) === 1001104);
  const character = characters.find((candidate) => candidate.label === style.chara_label);

  assert.deepEqual(resolveTemplateCharacterStats({ character, style, styles, limitBreakLevel: 0 }), {
    str: 439,
    dex: 342,
    wis: 368,
    spr: 386,
    luk: 372,
    con: 404,
  });
  assert.deepEqual(resolveTemplateCharacterStats({ character, style, styles, limitBreakLevel: 4 }), {
    str: 533,
    dex: 430,
    wis: 457,
    spr: 476,
    luk: 459,
    con: 495,
  });
});

test('template ① resolves finite integer stats for every real style at LB0 and max LB', () => {
  const characters = JSON.parse(readFileSync('json/characters.json', 'utf8'));
  const styles = JSON.parse(readFileSync('json/styles.json', 'utf8'));
  const charactersByLabel = new Map(characters.map((character) => [character.label, character]));

  for (const style of styles) {
    const character = charactersByLabel.get(style.chara_label);
    for (const limitBreakLevel of [0, getTemplateStyleLimitBreakMax(style)]) {
      const stats = resolveTemplateCharacterStats({
        character,
        style,
        styles,
        limitBreakLevel,
      });
      assert.ok(stats, `style ${style.id} LB${limitBreakLevel}`);
      assert.ok(
        CHARACTER_STAT_KEYS.every((key) => Number.isInteger(stats[key])),
        `style ${style.id} LB${limitBreakLevel}: ${JSON.stringify(stats)}`
      );
    }
  }
});

test('template ① applies reincarnation, board values, shared values, other-card LB and explicit LB overrides', () => {
  const character = {
    label: 'TestCharacter',
    base_param: {
      level: [1, 200],
      str: [1, 100], dex: [1, 100], wis: [1, 100],
      spr: [1, 100], luk: [1, 100], con: [1, 100],
    },
  };
  const ability = (type, valueType, value, isExclusive = true) => ({
    category: 'Ability',
    type,
    value_type: valueType,
    value: [value, 0],
    is_exclusive: isExclusive,
  });
  const selectedStyle = {
    id: 1,
    chara_label: character.label,
    tier: 'SS',
    base_param: { str: 20, dex: 0, wis: 0, spr: 0, luk: 0, con: 0 },
    ability_tree: [{ ability_list: [
      ability('Power', 'Addition', 4),
      ability('Dexterity', 'Ratio', 10),
    ] }],
    limit_break: { stat_up_per_level: 5, bonus_per_level: [] },
  };
  const otherStyle = {
    id: 2,
    chara_label: character.label,
    tier: 'SS',
    base_param: {},
    ability_tree: [{ ability_list: [ability('Power', 'RealNumber', 3, false)] }],
    limit_break: {
      stat_up_per_level: 0,
      bonus_per_level: [{
        step: 4,
        bonus: [
          ability('Wisdom', 'RealNumber', 2, false),
          ability('ParamAllOtherCard', 'Ratio', 10, false),
        ],
      }],
    },
  };
  const styles = [selectedStyle, otherStyle];

  assert.deepEqual(resolveTemplateCharacterStats({
    character,
    style: selectedStyle,
    styles,
    limitBreakLevel: 2,
  }), {
    str: 156,
    dex: 137,
    wis: 129,
    spr: 126,
    luk: 126,
    con: 126,
  });

  assert.deepEqual(resolveTemplateCharacterStats({
    character,
    style: selectedStyle,
    styles,
    limitBreakLevel: 2,
    limitBreakLevelsByStyleId: { 2: 0 },
  }), {
    str: 145,
    dex: 126,
    wis: 116,
    spr: 116,
    luk: 116,
    con: 116,
  });
});
