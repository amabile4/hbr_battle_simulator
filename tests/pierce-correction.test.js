import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  resolveAttackOrBreakPierceBonusPercent,
  resolveBlastOrDrivePierceBonusPercent,
} from '../src/domain/pierce-correction.js';

// 仕様書の期待値テーブル（小数第4位まで、toFixed(4) 準拠）
// 減衰型: bonus = p - ((p - 5) / 9) * (clampedHit - 1)
const DECAY_EXPECTED = {
  15: [15, 13.8889, 12.7778, 11.6667, 10.5556, 9.4444, 8.3333, 7.2222, 6.1111, 5],
  12: [12, 11.2222, 10.4444, 9.6667, 8.8889, 8.1111, 7.3333, 6.5556, 5.7778, 5],
  10: [10, 9.4444, 8.8889, 8.3333, 7.7778, 7.2222, 6.6667, 6.1111, 5.5556, 5],
};

// 上昇型: bonus = 5 + ((p - 5) / 9) * (clampedHit - 1)
const ASCEND_EXPECTED = {
  15: [5, 6.1111, 7.2222, 8.3333, 9.4444, 10.5556, 11.6667, 12.7778, 13.8889, 15],
  12: [5, 5.7778, 6.5556, 7.3333, 8.1111, 8.8889, 9.6667, 10.4444, 11.2222, 12],
  10: [5, 5.5556, 6.1111, 6.6667, 7.2222, 7.7778, 8.3333, 8.8889, 9.4444, 10],
};

test('減衰型（アタック/ブレイクピアス）: ヒット1〜10の期待値テーブル', () => {
  for (const [percent, expected] of Object.entries(DECAY_EXPECTED)) {
    for (let hit = 1; hit <= 10; hit += 1) {
      assert.equal(
        resolveAttackOrBreakPierceBonusPercent(hit, Number(percent)),
        expected[hit - 1],
        `decay p=${percent} hit=${hit}`
      );
    }
  }
});

test('上昇型（ブラスト/ドライブピアス）: ヒット1〜10の期待値テーブル', () => {
  for (const [percent, expected] of Object.entries(ASCEND_EXPECTED)) {
    for (let hit = 1; hit <= 10; hit += 1) {
      assert.equal(
        resolveBlastOrDrivePierceBonusPercent(hit, Number(percent)),
        expected[hit - 1],
        `ascend p=${percent} hit=${hit}`
      );
    }
  }
});

test('ヒット数クランプ: 10超は10扱い、0以下/未指定は1扱い', () => {
  assert.equal(resolveAttackOrBreakPierceBonusPercent(11, 15), 5);
  assert.equal(resolveAttackOrBreakPierceBonusPercent(99, 12), 5);
  assert.equal(resolveBlastOrDrivePierceBonusPercent(11, 15), 15);
  assert.equal(resolveBlastOrDrivePierceBonusPercent(0, 15), 5);
  assert.equal(resolveBlastOrDrivePierceBonusPercent(undefined, 15), 5);
  assert.equal(resolveAttackOrBreakPierceBonusPercent(-3, 15), 15);
});

test('不正な倍率は0を返す（許容値: 0/10/12/15）', () => {
  for (const fn of [resolveAttackOrBreakPierceBonusPercent, resolveBlastOrDrivePierceBonusPercent]) {
    assert.equal(fn(5, 0), 0);
    assert.equal(fn(5, 7), 0);
    assert.equal(fn(5, null), 0);
    assert.equal(fn(5, undefined), 0);
  }
});

test('文字列数値は数値として解釈される', () => {
  assert.equal(resolveBlastOrDrivePierceBonusPercent(10, '15'), 15);
  assert.equal(resolveAttackOrBreakPierceBonusPercent(1, '12'), 12);
});
