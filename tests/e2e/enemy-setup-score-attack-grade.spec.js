import { test, expect } from '@playwright/test';

import { gotoUiNext } from './ui-next-helpers.js';

test('Enemy Setup exposes a score attack difficulty (1-40) selector defaulting to 40', async ({ page }) => {
  await gotoUiNext(page);

  await page.locator('[role="tab"][data-tab="enemy"]').click();

  const gradeSelect = page.locator('#enemy-setup-root [data-action="select-score-attack-grade"]');
  await expect(gradeSelect).toBeVisible({ timeout: 5000 });
  await expect(gradeSelect.locator('option')).toHaveCount(40);
  await expect(gradeSelect).toHaveValue('40');

  await gradeSelect.selectOption('1');
  await expect(gradeSelect).toHaveValue('1');
});

test('Enemy Setup exposes a score attack event selector (newest first) that fills the active slot', async ({ page }) => {
  await gotoUiNext(page);

  await page.locator('[role="tab"][data-tab="enemy"]').click();

  const eventSelect = page.locator('#enemy-setup-root [data-action="select-score-attack-event"]');
  await expect(eventSelect).toBeVisible({ timeout: 5000 });

  // score_attack.json は遅延fetchされるため、選択肢が populate されるまで待つ
  await expect.poll(
    () => eventSelect.locator('option').count(),
    { timeout: 15000 },
  ).toBeGreaterThan(1);

  // データ更新でイベント数は増減しうるため、件数を固定せず「選択なし」+ 1件以上であることのみ確認する
  const optionLabels = await eventSelect.locator('option').allTextContents();
  expect(optionLabels.length).toBeGreaterThan(1);
  expect(optionLabels[0].trim()).toContain('選択なし');

  // イベント番号(#NN)が新しい順(降順)に並んでいることを確認する
  const eventNumbers = optionLabels
    .slice(1)
    .map((label) => Number(label.match(/#(\d+)/)?.[1]))
    .filter((n) => Number.isFinite(n));
  expect(eventNumbers.length).toBeGreaterThan(0);
  const sortedDescending = [...eventNumbers].sort((a, b) => b - a);
  expect(eventNumbers).toEqual(sortedDescending);

  // 先頭(最新)イベントを選択すると、アクティブスロットに反映されること
  const firstRealOption = eventSelect.locator('option').nth(1);
  const firstRealValue = await firstRealOption.getAttribute('value');
  await eventSelect.selectOption(firstRealValue);

  const slot1Button = page.locator('[data-action="set-active-slot"][data-slot-index="0"]');
  await expect(slot1Button).not.toContainText('-', { timeout: 5000 });
});
