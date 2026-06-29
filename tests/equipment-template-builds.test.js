import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolveEquipmentStatBonus } from '../src/domain/equipment-stats.js';

const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'));
const fixture = readJson('tests/fixtures/equipment_template_builds.json');
const masterData = {
  accessories: readJson('json/accessories.json'),
  boosters: readJson('json/boosters.json'),
  chips: readJson('json/chips.json'),
};

test('no_equipment ビルドで全6能力ボーナスが0', () => {
  const build = fixture.builds.find((b) => b.name === 'no_equipment');
  const result = resolveEquipmentStatBonus(build.config, masterData);
  assert.deepEqual(result, build.expectedBonus);
});

test('resolveEquipmentStatBonus(null) で全6能力ボーナスが0', () => {
  const result = resolveEquipmentStatBonus(null, masterData);
  assert.deepEqual(result, { str: 0, dex: 0, wis: 0, spr: 0, luk: 0, con: 0 });
});

for (const build of fixture.builds.filter((b) => b.name !== 'no_equipment')) {
  test(`${build.name}: 装備ボーナス計算が expectedBonus と一致 (${build.description})`, () => {
    const result = resolveEquipmentStatBonus(build.config, masterData);
    assert.deepEqual(result, build.expectedBonus, build.name);
  });
}
