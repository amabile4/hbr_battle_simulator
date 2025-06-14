// テストデータ
export const testCharacters = {
  kayamori: {
    name: '茅森月歌',
    currentSP: 10,
    spBonus: 0,
    skills: [
      { name: '通常攻撃', cost: 0, type: 'damage' },
      { name: 'クロス斬り', cost: 6, type: 'damage' },
      { name: 'ノーブルウェッジ', cost: 8, type: 'damage' }
    ]
  },
  izumi: {
    name: '和泉ユキ',
    currentSP: 12,
    spBonus: 0,
    skills: [
      { name: '通常攻撃', cost: 0, type: 'damage' },
      { name: 'ヒール', cost: 4, type: 'support' },
      { name: 'グレートヒール', cost: 8, type: 'support' }
    ]
  }
};

export const testParty = [
  testCharacters.kayamori,
  testCharacters.izumi,
  null, null, null, null
];

export const testSkillActions = {
  normalAttack: {
    character: '茅森月歌',
    skill: { name: '通常攻撃', cost: 0, type: 'damage' },
    position: 0
  },
  crossSlash: {
    character: '茅森月歌',
    skill: { name: 'クロス斬り', cost: 6, type: 'damage' },
    position: 0
  }
};

export const testConfig = {
  MAX_CHARACTERS: 6,
  FRONT_POSITIONS: 3,
  FRONT_POSITIONS_ARRAY: [0, 1, 2],
  MAX_SP: 20,
  BASE_SP_RECOVERY: 2
};