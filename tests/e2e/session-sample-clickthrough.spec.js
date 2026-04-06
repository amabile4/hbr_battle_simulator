import { test, expect } from '@playwright/test';

import { getLatestDownloadedSessionPath, gotoUiNext } from './ui-next-helpers.js';

test.describe('Session sample clickthrough', () => {
  test('loads the sample session and opens enemy/character detail popups', async ({ page }) => {
    await gotoUiNext(page);

    const input = page.locator('#session-load-input');
    await expect(input).toHaveCount(1);
    await input.setInputFiles(getLatestDownloadedSessionPath());

    await expect
      .poll(async () => page.locator('[data-turn-row][data-row-mode="committed"]').count(), {
        timeout: 15000,
      })
      .toBeGreaterThan(0);

    const inputRow = page.locator('[data-turn-row][data-row-mode="input"]').last();
    await expect(inputRow).toBeVisible({ timeout: 10000 });

    const enemyTrigger = inputRow.locator('[data-role="enemy-detail-trigger"]');
    await expect(enemyTrigger).toBeVisible({ timeout: 5000 });
    await enemyTrigger.click({ button: 'right' });

    const enemyPopup = page.locator('.enemy-detail-popup-container');
    await expect(enemyPopup).toBeVisible({ timeout: 5000 });
    await expect(enemyPopup).toContainText('プレビュー（コミット見込み）');
    await page.screenshot({ path: 'test-results/session-sample-enemy-popup.png', fullPage: true });

    await page.locator('[data-role="popup-close"]').click();
    await expect(enemyPopup).toHaveCount(0);

    const firstSlotIcon = inputRow.locator('[data-turn-slot-icon]').first();
    await expect(firstSlotIcon).toBeVisible({ timeout: 5000 });
    await firstSlotIcon.click({ button: 'right' });

    const charPopup = page.locator('#char-detail-popup');
    await expect(charPopup).toHaveClass(/open/);
    await expect(charPopup).toContainText('プレビュー（コミット見込み）');
    await page.screenshot({ path: 'test-results/session-sample-char-popup.png', fullPage: true });
  });
});
