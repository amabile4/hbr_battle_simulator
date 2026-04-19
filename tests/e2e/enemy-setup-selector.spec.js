import { test, expect } from '@playwright/test';

import {
  gotoUiNext,
  selectEnemyPresetForActiveSlot,
} from './ui-next-helpers.js';

const KALEIDO_OUROBOROS_PRESET_ID = 13450815;
const KALEIDO_OUROBOROS_NAME = '変貌を重ねる不滅の円環';
const STELLAR_SWEEPFRONT_CATEGORY_LABEL = '恒星掃戦線';
const DUPLICATED_STELLAR_SWEEPFRONT_NAME = '峡谷に棲まう幽鬼';

test('Enemy Setup category selector reaches 恒星掃戦線 presets and dedupes same-name entries', async ({ page }) => {
  await gotoUiNext(page);

  await page.locator('[role="tab"][data-tab="enemy"]').click();

  const categorySelect = page.locator('#enemy-setup-root [data-action="select-enemy-category"]');
  const presetSelect = page.locator('#enemy-setup-root [data-action="select-enemy"]');
  await expect(categorySelect).toBeVisible({ timeout: 5000 });
  await expect(presetSelect).toBeVisible({ timeout: 5000 });

  const stellarSweepfrontValue = await categorySelect.locator('option').evaluateAll((options, targetLabel) => {
    const match = options.find((option) => option.textContent?.trim() === targetLabel);
    return match?.value ?? null;
  }, STELLAR_SWEEPFRONT_CATEGORY_LABEL);
  expect(stellarSweepfrontValue).not.toBeNull();

  await categorySelect.selectOption(String(stellarSweepfrontValue));
  await expect(
    presetSelect.locator(`option:has-text("${DUPLICATED_STELLAR_SWEEPFRONT_NAME}")`)
  ).toHaveCount(1);

  await selectEnemyPresetForActiveSlot(page, KALEIDO_OUROBOROS_PRESET_ID);
  await expect(page.locator('[data-action="set-active-slot"][data-slot-index="0"]')).toContainText(
    KALEIDO_OUROBOROS_NAME,
    { timeout: 5000 }
  );
  await expect(categorySelect).toHaveValue(String(stellarSweepfrontValue));
});
