/**
 * 一時プレビュー入力ストア（T6）の寿命テスト
 *
 * 仕様:
 * - 設定→取得が一致（ポップアップ内の再描画相当では維持される）
 * - clearAllPreviewInputs（= ターン移動・再計算・コミット・セッションロードの行再描画）で消える
 * - 永続化なし（モジュール内メモリのみ → リロードで消える）
 * - null / 空入力は削除として扱う
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  clearAllPreviewInputs,
  getPreviewInputValue,
  previewInputCount,
  setPreviewInputValue,
} from '../ui-next/utils/preview-input-store.js';

test('preview input store: set then get returns the same value per scope and field', () => {
  clearAllPreviewInputs();
  setPreviewInputValue('action1:0', 'destructionRatePercent', 150.25);
  setPreviewInputValue('action1:0', 'currentDp', 1200);
  setPreviewInputValue('action1:1', 'currentDp', 800);
  setPreviewInputValue('action2:0', 'currentHp', 50000);

  assert.equal(getPreviewInputValue('action1:0', 'destructionRatePercent'), 150.25);
  assert.equal(getPreviewInputValue('action1:0', 'currentDp'), 1200);
  assert.equal(getPreviewInputValue('action1:1', 'currentDp'), 800, '敵スコープが分離されること');
  assert.equal(getPreviewInputValue('action2:0', 'currentHp'), 50000, 'アクションスコープが分離されること');
  assert.equal(getPreviewInputValue('action2:0', 'currentDp'), null, '未設定フィールドは null');
});

test('preview input store: clearAllPreviewInputs discards everything (turn move / recalc / commit / load)', () => {
  clearAllPreviewInputs();
  setPreviewInputValue('action1:0', 'currentDp', 100);
  setPreviewInputValue('action1:0', 'currentHp', 200);
  assert.equal(previewInputCount(), 2);

  clearAllPreviewInputs();

  assert.equal(previewInputCount(), 0);
  assert.equal(getPreviewInputValue('action1:0', 'currentDp'), null);
  assert.equal(getPreviewInputValue('action1:0', 'currentHp'), null);
});

test('preview input store: null / non-finite values delete the entry (empty input)', () => {
  clearAllPreviewInputs();
  setPreviewInputValue('action1:0', 'currentDp', 100);
  setPreviewInputValue('action1:0', 'currentDp', null);
  assert.equal(getPreviewInputValue('action1:0', 'currentDp'), null);

  setPreviewInputValue('action1:0', 'currentHp', 100);
  setPreviewInputValue('action1:0', 'currentHp', Number.NaN);
  assert.equal(getPreviewInputValue('action1:0', 'currentHp'), null);
  assert.equal(previewInputCount(), 0);
});

test('preview input store: values are numbers only (no objects persisted)', () => {
  clearAllPreviewInputs();
  setPreviewInputValue('action1:0', 'currentDp', '123');
  assert.equal(getPreviewInputValue('action1:0', 'currentDp'), 123, '数値化されて保持されること');
  clearAllPreviewInputs();
});
