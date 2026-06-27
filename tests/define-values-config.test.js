import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildMarkEffectsFromDefineValues,
  buildHighBoostDefaultsFromDefineValues,
  INTRINSIC_MARK_EFFECTS_BY_ELEMENT,
} from '../src/config/battle-defaults.js';
import { HbrDataStore, createBattleStateFromParty } from '../src/index.js';
import { getStore, getSixUsableStyleIds } from './helpers.js';

// ─── buildMarkEffectsFromDefineValues ────────────────────────────────────────

test('buildMarkEffectsFromDefineValues: 実際の define_values raw 値から比率変換が正しい', () => {
  const dv = {
    FIRE_MARK_ATTACK_UP: 3000,
    FIRE_MARK_DAMAGE_RATE_UP: 1000,
    FIRE_MARK_DEFENCE_UP: 1000,
    FIRE_MARK_CRITICAL_RATE_UP: 30,
    FIRE_MARK_CRITICAL_DAMAGE_UP: 3000,
    FIRE_MARK_HEAL_SP: 1,
  };

  const config = buildMarkEffectsFromDefineValues(dv);

  // スケール変換を検証
  assert.equal(config.Fire.skillDamageUpRateAtLevel1, 0.3);          // 3000/10000
  assert.equal(config.Fire.damageTakenDownRateAtLevel2, 0.1);        // 1000/10000
  assert.equal(config.Fire.destructionRateGainBonusRateAtLevel3, 0.1); // 1000/10000
  assert.equal(config.Fire.criticalRateUpAtLevel4, 0.3);             // 30/100
  assert.equal(config.Fire.criticalDamageUpAtLevel5, 0.3);           // 3000/10000
  assert.equal(config.Fire.extraFrontSpAtTurnStartAtLevel6, 1);      // raw integer
});

test('buildMarkEffectsFromDefineValues: Fire/Ice/Thunder/Dark は同値', () => {
  const dv = { FIRE_MARK_ATTACK_UP: 3000, FIRE_MARK_CRITICAL_RATE_UP: 30 };
  const config = buildMarkEffectsFromDefineValues(dv);

  assert.deepEqual(config.Ice, config.Fire);
  assert.deepEqual(config.Thunder, config.Fire);
  assert.deepEqual(config.Dark, config.Fire);
});

test('buildMarkEffectsFromDefineValues: define_values なしの場合はハードコード値にフォールバック', () => {
  const config = buildMarkEffectsFromDefineValues({});

  assert.equal(config.Fire.skillDamageUpRateAtLevel1, INTRINSIC_MARK_EFFECTS_BY_ELEMENT.Fire.skillDamageUpRateAtLevel1);
  assert.equal(config.Fire.criticalRateUpAtLevel4, INTRINSIC_MARK_EFFECTS_BY_ELEMENT.Fire.criticalRateUpAtLevel4);
  assert.equal(config.Fire.extraFrontSpAtTurnStartAtLevel6, INTRINSIC_MARK_EFFECTS_BY_ELEMENT.Fire.extraFrontSpAtTurnStartAtLevel6);
});

test('buildMarkEffectsFromDefineValues: null/undefined でもハードコード値にフォールバック', () => {
  const configNull = buildMarkEffectsFromDefineValues(null);
  const configUndef = buildMarkEffectsFromDefineValues(undefined);

  assert.equal(configNull.Fire.skillDamageUpRateAtLevel1, 0.3);
  assert.equal(configUndef.Fire.skillDamageUpRateAtLevel1, 0.3);
});

test('buildMarkEffectsFromDefineValues: Light Mark は LIGHT_MARK_* がなければ FIRE_MARK_* フォールバック', () => {
  const dv = { FIRE_MARK_ATTACK_UP: 4000 }; // 0.4 に変えて確認
  const config = buildMarkEffectsFromDefineValues(dv);

  // LIGHT_MARK_ATTACK_UP がないので FIRE_MARK_ATTACK_UP フォールバック
  assert.equal(config.Light.skillDamageUpRateAtLevel1, 0.4);
});

test('buildMarkEffectsFromDefineValues: LIGHT_MARK_* が存在する場合はそれを使用', () => {
  const dv = {
    FIRE_MARK_ATTACK_UP: 3000,
    LIGHT_MARK_ATTACK_UP: 5000, // Light のみ異なる値
    FIRE_MARK_CRITICAL_RATE_UP: 30,
  };
  const config = buildMarkEffectsFromDefineValues(dv);

  assert.equal(config.Fire.skillDamageUpRateAtLevel1, 0.3);
  assert.equal(config.Light.skillDamageUpRateAtLevel1, 0.5); // LIGHT_MARK_ATTACK_UP = 5000/10000
});

// ─── buildHighBoostDefaultsFromDefineValues ───────────────────────────────────

test('buildHighBoostDefaultsFromDefineValues: raw 値から multiplier 変換が正しい', () => {
  const dv = {
    HIGH_BOOST_INCREASE_SP: 2,
    HIGH_BOOST_GIVE_ATTACK_BUFF_UP: 2000,
    HIGH_BOOST_GIVE_DEBUFF_UP: 2000,
    HIGH_BOOST_GIVE_HEAL_UP: 5000,
  };

  const defaults = buildHighBoostDefaultsFromDefineValues(dv);

  assert.equal(defaults.spCostIncrease, 2);             // raw integer
  assert.equal(defaults.attackBuffMultiplier, 1.2);     // 1.0 + 2000/10000
  assert.equal(defaults.debuffMultiplier, 1.2);         // 1.0 + 2000/10000
  assert.equal(defaults.dpHealMultiplier, 1.5);         // 1.0 + 5000/10000
  assert.equal(defaults.skillAtkRate, 1.8);             // effect.power 由来のため固定
});

test('buildHighBoostDefaultsFromDefineValues: define_values なしの場合はデフォルト値', () => {
  const defaults = buildHighBoostDefaultsFromDefineValues({});

  assert.equal(defaults.spCostIncrease, 2);
  assert.equal(defaults.attackBuffMultiplier, 1.2);
  assert.equal(defaults.debuffMultiplier, 1.2);
  assert.equal(defaults.dpHealMultiplier, 1.5);
  assert.equal(defaults.skillAtkRate, 1.8);
});

test('buildHighBoostDefaultsFromDefineValues: 異なる raw 値で変換を検証', () => {
  const dv = {
    HIGH_BOOST_INCREASE_SP: 3,
    HIGH_BOOST_GIVE_ATTACK_BUFF_UP: 3000, // → 1.3
    HIGH_BOOST_GIVE_DEBUFF_UP: 1000,      // → 1.1
    HIGH_BOOST_GIVE_HEAL_UP: 10000,       // → 2.0
  };
  const defaults = buildHighBoostDefaultsFromDefineValues(dv);

  assert.equal(defaults.spCostIncrease, 3);
  assert.equal(defaults.attackBuffMultiplier, 1.3);
  assert.equal(defaults.debuffMultiplier, 1.1);
  assert.equal(defaults.dpHealMultiplier, 2.0);
});

// ─── HbrDataStore.fromJsonDirectory による define_values 読み込み ────────────

test('HbrDataStore は define_values.json から defineValues を読み込む', () => {
  const store = HbrDataStore.fromJsonDirectory('json');

  assert.ok(store.defineValues && typeof store.defineValues === 'object', 'defineValues が存在する');
  assert.equal(typeof store.defineValues.FIRE_MARK_ATTACK_UP, 'number', 'FIRE_MARK_ATTACK_UP が数値');
  assert.equal(store.defineValues.FIRE_MARK_ATTACK_UP, 3000, 'raw 値は 3000');
  assert.equal(store.defineValues.HIGH_BOOST_GIVE_ATTACK_BUFF_UP, 2000, 'HIGH_BOOST raw 値は 2000');
  assert.equal(store.defineValues.TALISMAN_REF_PARAM_DOWN, 10, 'TALISMAN raw 値は 10');
});

test('HbrDataStore は markEffectsConfig を define_values から計算する', () => {
  const store = HbrDataStore.fromJsonDirectory('json');

  assert.ok(store.markEffectsConfig, 'markEffectsConfig が存在する');
  // 3000/10000 = 0.3
  assert.equal(store.markEffectsConfig.Fire.skillDamageUpRateAtLevel1, 0.3);
  // 30/100 = 0.3
  assert.equal(store.markEffectsConfig.Fire.criticalRateUpAtLevel4, 0.3);
  // raw 1
  assert.equal(store.markEffectsConfig.Fire.extraFrontSpAtTurnStartAtLevel6, 1);
  // LIGHT_MARK_* 未収録 → FIRE_MARK_* フォールバック
  assert.equal(store.markEffectsConfig.Light.skillDamageUpRateAtLevel1, 0.3);
});

test('HbrDataStore は highBoostDefaults を define_values から計算する', () => {
  const store = HbrDataStore.fromJsonDirectory('json');

  assert.ok(store.highBoostDefaults, 'highBoostDefaults が存在する');
  assert.equal(store.highBoostDefaults.spCostIncrease, 2);
  assert.equal(store.highBoostDefaults.attackBuffMultiplier, 1.2);
  assert.equal(store.highBoostDefaults.debuffMultiplier, 1.2);
  assert.equal(store.highBoostDefaults.dpHealMultiplier, 1.5);
  assert.equal(store.highBoostDefaults.skillAtkRate, 1.8);
});

test('HbrDataStore.fromRawData は defineValues を受け付け markEffectsConfig を計算する', () => {
  const store = HbrDataStore.fromRawData({
    characters: [],
    styles: [],
    skills: [],
    passives: [],
    accessories: [],
    skillRuleOverrides: [],
    epRuleOverrides: [],
    transcendenceRuleOverrides: [],
    defineValues: { FIRE_MARK_ATTACK_UP: 4000 },
  });

  assert.equal(store.defineValues.FIRE_MARK_ATTACK_UP, 4000);
  assert.equal(store.markEffectsConfig.Fire.skillDamageUpRateAtLevel1, 0.4); // 4000/10000
});

test('HbrDataStore.fromRawData で defineValues 省略時は空 dict で初期化される', () => {
  const store = HbrDataStore.fromRawData({
    characters: [],
    styles: [],
    skills: [],
    passives: [],
    accessories: [],
    skillRuleOverrides: [],
    epRuleOverrides: [],
    transcendenceRuleOverrides: [],
  });

  assert.deepEqual(store.defineValues, {});
  // フォールバック値が使われる
  assert.equal(store.markEffectsConfig.Fire.skillDamageUpRateAtLevel1, 0.3);
});

// ─── createBattleStateFromParty の gameConfig 伝播 ───────────────────────────

test('createBattleStateFromParty は gameConfig を state に保持する', () => {
  const store = getStore();
  const styleIds = getSixUsableStyleIds(store);
  const party = store.buildPartyFromStyleIds(styleIds, { initialSP: 10 });

  const gameConfig = {
    markEffectsConfig: { Fire: { skillDamageUpRateAtLevel1: 0.5 } },
    highBoostDefaults: { spCostIncrease: 3 },
  };
  const state = createBattleStateFromParty(party, undefined, gameConfig);

  assert.deepEqual(state.gameConfig.markEffectsConfig, gameConfig.markEffectsConfig);
  assert.deepEqual(state.gameConfig.highBoostDefaults, gameConfig.highBoostDefaults);
});

test('createBattleStateFromParty は gameConfig 省略時 null を保持する', () => {
  const store = getStore();
  const styleIds = getSixUsableStyleIds(store);
  const party = store.buildPartyFromStyleIds(styleIds, { initialSP: 10 });

  const state = createBattleStateFromParty(party);

  assert.equal(state.gameConfig, null);
});
