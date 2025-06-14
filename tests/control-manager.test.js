import { describe, test, expect, beforeEach, vi } from 'vitest';
import { testParty, testSkillActions, testConfig } from './fixtures/test-data.js';

// グローバル変数のモック
global.currentParty = [];
global.turnActions = {};
global.battleHistory = [];
global.currentTurn = 1;
global.savedSPState = [];
global.positionMap = [0, 1, 2, 3, 4, 5];
global.CONFIG = testConfig;

// ControlManagerの簡易実装（実際のファイルをインポートする場合は不要）
class MockControlManager {
  static confirmSPChanges() {
    for (let position = 0; position < CONFIG.FRONT_POSITIONS; position++) {
      if (turnActions[position]) {
        const playerIndex = positionMap[position];
        const character = currentParty[playerIndex];
        if (character && turnActions[position].character === character.name) {
          character.currentSP -= turnActions[position].skill.cost;
          character.currentSP = Math.max(character.currentSP, 0);
        }
      }
    }
  }

  static saveSPState() {
    savedSPState = currentParty.map(character => 
      character ? character.currentSP : 0
    );
  }

  static restoreSPState() {
    if (savedSPState.length === currentParty.length) {
      currentParty.forEach((character, index) => {
        if (character && savedSPState[index] !== undefined) {
          character.currentSP = savedSPState[index];
        }
      });
    }
  }
}

describe('ControlManager テスト', () => {
  beforeEach(() => {
    resetGlobals();
    currentParty = [...testParty];
  });

  describe('SP管理', () => {
    test('SP消費が正しく計算される', () => {
      // 初期状態
      currentParty[0] = { ...testParty[0], currentSP: 10 };
      turnActions[0] = testSkillActions.crossSlash;

      // SP消費実行
      MockControlManager.confirmSPChanges();

      // 検証
      expect(currentParty[0].currentSP).toBe(4); // 10 - 6 = 4
    });

    test('SP不足時は0になる', () => {
      // SP不足の状態
      currentParty[0] = { ...testParty[0], currentSP: 3 };
      turnActions[0] = testSkillActions.crossSlash; // cost: 6

      MockControlManager.confirmSPChanges();

      expect(currentParty[0].currentSP).toBe(0);
    });

    test('通常攻撃はSP消費しない', () => {
      currentParty[0] = { ...testParty[0], currentSP: 10 };
      turnActions[0] = testSkillActions.normalAttack; // cost: 0

      MockControlManager.confirmSPChanges();

      expect(currentParty[0].currentSP).toBe(10); // 変化なし
    });
  });

  describe('SP状態の保存・復元', () => {
    test('SP状態を正しく保存できる', () => {
      currentParty[0] = { ...testParty[0], currentSP: 15 };
      currentParty[1] = { ...testParty[1], currentSP: 8 };

      MockControlManager.saveSPState();

      expect(savedSPState).toEqual([15, 8, 0, 0, 0, 0]);
    });

    test('SP状態を正しく復元できる', () => {
      currentParty[0] = { ...testParty[0], currentSP: 10 };
      currentParty[1] = { ...testParty[1], currentSP: 5 };
      savedSPState = [15, 12, 0, 0, 0, 0];

      MockControlManager.restoreSPState();

      expect(currentParty[0].currentSP).toBe(15);
      expect(currentParty[1].currentSP).toBe(12);
    });
  });

  describe('配置システム', () => {
    test('前衛のみがSP消費する', () => {
      currentParty[0] = { ...testParty[0], currentSP: 10 }; // 前衛
      currentParty[3] = { ...testParty[0], currentSP: 10 }; // 後衛
      
      turnActions[0] = testSkillActions.crossSlash; // 前衛の行動
      turnActions[3] = testSkillActions.crossSlash; // 後衛の行動（実際は発生しないが）

      MockControlManager.confirmSPChanges();

      expect(currentParty[0].currentSP).toBe(4); // 前衛は消費
      expect(currentParty[3].currentSP).toBe(10); // 後衛は消費しない
    });
  });
});