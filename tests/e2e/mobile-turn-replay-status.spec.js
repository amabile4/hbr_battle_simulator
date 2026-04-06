import { test, expect, devices } from '@playwright/test';

import {
  getLatestDownloadedSessionPath,
  gotoUiNext,
  openPassiveLog,
} from './ui-next-helpers.js';

test.use({
  ...devices['iPhone SE'],
});

async function loadSampleSession(page) {
  await gotoUiNext(page);
  await page.locator('#session-load-input').setInputFiles(getLatestDownloadedSessionPath());
  await page
    .locator('[data-turn-row][data-row-mode="committed"]')
    .first()
    .waitFor({ timeout: 15000 });
  const status = page.locator('[data-role="turn-replay-status"]');
  await expect(status).toBeVisible({ timeout: 5000 });
  await expect(status).toContainText('再計算完了');
  return status;
}

test.describe('Mobile turn replay status', () => {
  test('hides while the character detail popup is open', async ({ page }) => {
    const status = await loadSampleSession(page);

    const inputRow = page.locator('[data-turn-row][data-row-mode="input"]').last();
    await inputRow.scrollIntoViewIfNeeded();
    await inputRow.locator('[data-turn-slot-icon]').first().click({ button: 'right' });

    await expect(page.locator('#char-detail-popup.open')).toBeVisible({ timeout: 5000 });
    await expect(status).toBeHidden();
  });

  test('hides while the passive log pane is open on mobile', async ({ page }) => {
    const status = await loadSampleSession(page);

    await openPassiveLog(page);
    await expect(status).toBeHidden();
  });
});
