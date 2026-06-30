// CharacterStyle.clone() の独立性テスト
// 全 mutable フィールドが元インスタンスと独立していること、
// immutable フィールドは同一参照であることを検証する。

import test from 'node:test';
import assert from 'node:assert/strict';
import { CharacterStyle } from '../src/index.js';

function buildMember(overrides = {}) {
  return new CharacterStyle({
    characterId: 'C1',
    characterName: 'Char1',
    styleId: 1001,
    styleName: 'Style1',
    partyIndex: 0,
    position: 0,
    initialSP: 10,
    spMin: 0,
    spMax: 20,
    initialEP: 5,
    skills: [{ id: 1, name: 'スキル1', sp_cost: 3, parts: [] }],
    passives: [],
    statusEffects: [
      { effectId: 1, statusType: 'HpUp', limitType: 'none', remaining: 3, power: 10 },
    ],
    markStates: { Fire: { current: 2, min: 0, max: 5 } },
    ...overrides,
  });
}

test('clone: sp.current の変更が元インスタンスに影響しない', () => {
  const orig = buildMember();
  const cloned = orig.clone();
  cloned.sp.current = 99;
  assert.equal(orig.sp.current, 10, 'original sp.current は変わらない');
  assert.equal(cloned.sp.current, 99);
});

test('clone: position の変更が独立している', () => {
  const orig = buildMember({ position: 0 });
  const cloned = orig.clone();
  cloned.position = 5;
  assert.equal(orig.position, 0);
  assert.equal(cloned.position, 5);
});

test('clone: statusEffects[0].remaining の変更が元に影響しない', () => {
  const orig = buildMember();
  const cloned = orig.clone();
  cloned.statusEffects[0].remaining = 99;
  assert.equal(orig.statusEffects[0].remaining, 3, 'original は変わらない');
  assert.equal(cloned.statusEffects[0].remaining, 99);
});

test('clone: statusEffects の push が元に影響しない', () => {
  const orig = buildMember();
  const cloned = orig.clone();
  cloned.statusEffects.push({ effectId: 2, statusType: 'SpUp', remaining: 1, power: 5 });
  assert.equal(orig.statusEffects.length, 1, 'original は変わらない');
  assert.equal(cloned.statusEffects.length, 2);
});

test('clone: markStates が独立している', () => {
  const orig = buildMember();
  const cloned = orig.clone();
  cloned.markStates.Fire.current = 99;
  assert.equal(orig.markStates.Fire.current, 2, 'original は変わらない');
  assert.equal(cloned.markStates.Fire.current, 99);
});

test('clone: skillUseCounts の更新が独立している', () => {
  const orig = buildMember();
  orig.skillUseCounts.set('スキル1', 3);
  const cloned = orig.clone();
  cloned.skillUseCounts.set('スキル1', 99);
  assert.equal(orig.skillUseCounts.get('スキル1'), 3, 'original は変わらない');
  assert.equal(cloned.skillUseCounts.get('スキル1'), 99);
});

test('clone: skillLastUsedTurns の更新が独立している', () => {
  const orig = buildMember({ skillLastUsedTurns: { 'スキル1': 3 } });
  const cloned = orig.clone();
  cloned.skillLastUsedTurns.set('スキル1', 9);
  assert.equal(orig.skillLastUsedTurns.get('スキル1'), 3, 'original は変わらない');
  assert.equal(cloned.skillLastUsedTurns.get('スキル1'), 9);
});

test('clone: _revision が独立している', () => {
  const orig = buildMember();
  const cloned = orig.clone();
  cloned._revision = 99;
  assert.equal(orig._revision, 0, 'original は変わらない');
  assert.equal(cloned._revision, 99);
});

test('clone: isAlive / isBreak など boolean が独立している', () => {
  const orig = buildMember();
  const cloned = orig.clone();
  cloned.isAlive = false;
  cloned.isBreak = true;
  assert.equal(orig.isAlive, true);
  assert.equal(orig.isBreak, false);
});

test('clone: skills / passives / elements は同一参照（immutable）', () => {
  const orig = buildMember();
  const cloned = orig.clone();
  assert.strictEqual(cloned.skills, orig.skills, 'skills は同一参照');
  assert.strictEqual(cloned.passives, orig.passives, 'passives は同一参照');
  assert.strictEqual(cloned.elements, orig.elements, 'elements は同一参照');
});

test('clone: clone() が CharacterStyle インスタンスを返す', () => {
  const orig = buildMember();
  const cloned = orig.clone();
  assert.ok(cloned instanceof CharacterStyle, 'cloned は CharacterStyle インスタンス');
  assert.notStrictEqual(cloned, orig, '元インスタンスとは別オブジェクト');
});

test('clone: stats and supportStats are independent', () => {
  const original = buildMember({
    stats: { str: 650, dex: 650, wis: 650, spr: 650, luk: 650, con: 650 },
    supportStats: { str: 10, dex: 10, wis: 10, spr: 10, luk: 10, con: 10 },
  });
  const cloned = original.clone();

  cloned.stats.str = 700;
  cloned.supportStats.str = 20;

  assert.equal(original.stats.str, 650);
  assert.equal(original.supportStats.str, 10);
});
