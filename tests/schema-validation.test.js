import test from 'node:test';
import assert from 'node:assert/strict';
import { getStore } from './helpers.js';
import { validateDocument } from '../src/index.js';

test('new_skill_database.draft.json can be validated and returns diagnostics', () => {
  const store = getStore();
  const result = store.validateSkillDatabaseDraft();

  assert.equal(typeof result.valid, 'boolean');
  assert.ok(Array.isArray(result.errors));
  assert.ok(result.errors.length > 0);
  assert.ok(result.errors.some((error) => error.includes('consumeAllSp')));
});

test('schema validator accepts a minimal valid document', () => {
  const store = getStore();
  const sample = {
    version: '1.0.0',
    counts: {
      characters: 1,
      normalizedCharacters: 1,
      styles: 1,
      skills: 1,
      passives: 1,
      legacyCompatibleSkillRows: 1,
      conflictRows: 0,
    },
    legacyCompatible: {
      metadata: {
        sourceVersion: 'sample',
        generatedAt: '2026-02-28T00:00:00Z',
        characterCount: 1,
        totalSkills: 1,
      },
      characters: {
        Test: [
          {
            name: 'Sample Skill',
            cost: 1,
            type: 'non_damage',
            sourceSkillIds: [1],
            variantCount: 1,
            hasConflict: false,
          },
        ],
      },
    },
    canonicalSkills: [
      {
        skillId: 1,
        name: 'Sample Skill',
        normalizedNameKey: 'sample-skill',
        chara: 'Sample Character',
        rawChara: 'Sample Character',
        styleName: 'Sample Style',
        styleId: 1,
        team: '31A',
        role: null,
        spCost: 1,
        type: 'non_damage',
        consumeType: 'Sp',
        maxLevel: 1,
        isRestricted: 0,
        source: {
          from: 'skills.json',
          inDate: null,
          label: null,
        },
      },
    ],
  };

  const result = validateDocument(store.skillDbSchema, sample);
  assert.equal(result.valid, true);
  assert.equal(result.errors.length, 0);
});

test('schema validator reports missing required property', () => {
  const store = getStore();

  const invalid = {
    version: '1.0.0',
    counts: store.skillDbDraft.counts,
    canonicalSkills: store.skillDbDraft.canonicalSkills,
  };

  const result = validateDocument(store.skillDbSchema, invalid);

  assert.equal(result.valid, false);
  assert.ok(result.errors.some((error) => error.includes('legacyCompatible')));
});
