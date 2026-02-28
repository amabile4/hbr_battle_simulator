import { describe, test, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

describe('スキルデータベース テスト', () => {
  let skillDatabase;

  beforeAll(async () => {
    const dbPath = join(process.cwd(), 'skillDatabase.json');
    const dbContent = readFileSync(dbPath, 'utf-8');
    skillDatabase = JSON.parse(dbContent);
  });

  test('データベースの基本構造が正しい', () => {
    expect(skillDatabase).toHaveProperty('metadata');
    expect(skillDatabase).toHaveProperty('characters');
    expect(skillDatabase.metadata).toHaveProperty('characterCount');
    expect(skillDatabase.metadata).toHaveProperty('totalSkills');
  });

  test('全キャラクターが通常攻撃を持つ', () => {
    const characters = skillDatabase.characters;
    
    Object.entries(characters).forEach(([charName, skills]) => {
      const normalAttack = skills.find(skill => 
        skill.name === '通常攻撃' && skill.cost === 0
      );
      
      expect(normalAttack).toBeTruthy(`${charName}が通常攻撃を持っていません`);
    });
  });

  test('通常攻撃の名前が統一されている', () => {
    const characters = skillDatabase.characters;
    
    Object.entries(characters).forEach(([charName, skills]) => {
      const normalAttacks = skills.filter(skill => skill.cost === 0);
      
      normalAttacks.forEach(attack => {
        expect(attack.name).toBe('通常攻撃', 
          `${charName}の通常攻撃名が「${attack.name}」になっています`);
      });
    });
  });

  test('スキルコストが妥当な範囲内', () => {
    const characters = skillDatabase.characters;
    
    Object.entries(characters).forEach(([charName, skills]) => {
      skills.forEach(skill => {
        expect(skill.cost).toBeGreaterThanOrEqual(0);
        expect(skill.cost).toBeLessThanOrEqual(20);
        expect(Number.isInteger(skill.cost)).toBe(true);
      });
    });
  });

  test('メタデータの整合性', () => {
    const characters = skillDatabase.characters;
    const actualCharCount = Object.keys(characters).length;
    const actualSkillCount = Object.values(characters)
      .flat()
      .length;

    expect(actualCharCount).toBe(skillDatabase.metadata.characterCount);
    expect(actualSkillCount).toBe(skillDatabase.metadata.totalSkills);
  });

  test('必須フィールドが存在する', () => {
    const characters = skillDatabase.characters;
    
    Object.entries(characters).forEach(([charName, skills]) => {
      skills.forEach((skill, index) => {
        expect(skill).toHaveProperty('name', 
          `${charName}のスキル${index}にnameがありません`);
        expect(skill).toHaveProperty('cost', 
          `${charName}のスキル${index}にcostがありません`);
        expect(skill).toHaveProperty('type', 
          `${charName}のスキル${index}にtypeがありません`);
      });
    });
  });
});