import { test, expect } from '@playwright/test';

import { gotoUiNext } from './ui-next-helpers.js';

async function selectCategoryByLabel(categorySelect, label) {
  const readValue = () =>
    categorySelect.locator('option').evaluateAll((options, targetLabel) => {
      const match = options.find((option) => option.textContent?.trim() === targetLabel);
      return match?.value ?? null;
    }, label);
  await expect.poll(readValue, { timeout: 15000 }).not.toBeNull();
  const value = await readValue();
  await categorySelect.selectOption(String(value));
}

test('Enemy Setup shows the score attack difficulty (1-40) selector only when a score attack enemy is selected', async ({ page }) => {
  await gotoUiNext(page);

  await page.locator('[role="tab"][data-tab="enemy"]').click();

  const gradeSelect = page.locator('#enemy-setup-root [data-action="select-score-attack-grade"]');
  // 通常の敵(既定選択)では難易度セレクタは表示されない
  await expect(gradeSelect).toHaveCount(0);

  // 「スコアアタック」カテゴリから敵を選ぶと、難易度セレクタが現れる
  const categorySelect = page.locator('#enemy-setup-root [data-action="select-enemy-category"]');
  await selectCategoryByLabel(categorySelect, 'スコアアタック');

  const presetSelect = page.locator('#enemy-setup-root [data-action="select-enemy"]');
  await expect.poll(() => presetSelect.locator('option').count(), { timeout: 15000 }).toBeGreaterThan(0);
  const firstOptionValue = await presetSelect.locator('option').first().getAttribute('value');
  await presetSelect.selectOption(firstOptionValue);

  await expect(gradeSelect).toBeVisible({ timeout: 5000 });
  await expect(gradeSelect.locator('option')).toHaveCount(40);
  await expect(gradeSelect).toHaveValue('40');

  await gradeSelect.selectOption('1');
  await expect(gradeSelect).toHaveValue('1');
});

test('Enemy Setup exposes score attack events as a single "スコアアタック" category (no duplicate selector)', async ({ page }) => {
  await gotoUiNext(page);

  await page.locator('[role="tab"][data-tab="enemy"]').click();

  // 敵プリセット欄と二重になる専用のイベント選択欄は存在しない
  await expect(page.locator('#enemy-setup-root [data-action="select-score-attack-event"]')).toHaveCount(0);

  const categorySelect = page.locator('#enemy-setup-root [data-action="select-enemy-category"]');
  await selectCategoryByLabel(categorySelect, 'スコアアタック');

  const presetSelect = page.locator('#enemy-setup-root [data-action="select-enemy"]');
  // score_attack.json は遅延fetchされるため、選択肢が populate されるまで待つ
  await expect.poll(() => presetSelect.locator('option').count(), { timeout: 15000 }).toBeGreaterThan(0);

  // データ更新でイベント数は増減しうるため、件数を固定せずイベント番号の並び順のみ確認する
  const optionLabels = await presetSelect.locator('option').allTextContents();
  const eventNumbers = optionLabels
    .map((label) => Number(label.match(/#(\d+)/)?.[1]))
    .filter((n) => Number.isFinite(n));
  expect(eventNumbers.length).toBeGreaterThan(0);
  const sortedDescending = [...eventNumbers].sort((a, b) => b - a);
  expect(eventNumbers).toEqual(sortedDescending);

  // 先頭(最新)イベントを選択すると、アクティブスロットに反映されること
  const firstOptionValue = await presetSelect.locator('option').first().getAttribute('value');
  await presetSelect.selectOption(firstOptionValue);

  const slot1Button = page.locator('[data-action="set-active-slot"][data-slot-index="0"]');
  await expect(slot1Button).not.toContainText('-', { timeout: 5000 });
});
