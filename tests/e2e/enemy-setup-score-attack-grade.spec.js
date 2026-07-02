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
