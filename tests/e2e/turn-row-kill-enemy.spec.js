import { test, expect } from '@playwright/test';

import {
  applyParty,
  commitLatestInputRow,
  fillPartySetupSlots,
  gotoUiNext,
  openEnemyPopupActionForRow,
} from './ui-next-helpers.js';

test.describe('Turn row kill enemy', () => {
  test('popup kill on E1 keeps the popup open and records actor-based kill attribution', async ({ page }) => {
    await page.setViewportSize({ width: 1360, height: 960 });
    await gotoUiNext(page);
    await fillPartySetupSlots(page, [0, 1, 2, 3]);
    const inputRow = await applyParty(page);

    const toolsBox = inputRow.locator('[data-role="enemy-tools-box"]');
    await expect(toolsBox).toBeVisible({ timeout: 5000 });
    await expect(toolsBox.locator('[data-role="enemy-detail-trigger"]')).toBeVisible({ timeout: 5000 });
    await openEnemyPopupActionForRow(page, inputRow, 'kill', { enemyIndex: 0 });
    const popup = page.locator('.enemy-detail-popup-container');
    await expect(popup).toBeVisible({ timeout: 5000 });
    const singleToggle = popup.locator('[data-role="popup-kill-single-toggle"]').first();
    const multiToggle = popup.locator('[data-role="kill-enemy-candidate"]').first();
    if (await singleToggle.count()) {
      await singleToggle.click();
    } else {
      await multiToggle.click();
    }
    await expect(inputRow.locator('[data-role="kill-chip"]')).toHaveCount(1, { timeout: 5000 });
    await expect(inputRow.locator('[data-role="kill-chip"]')).toContainText('討伐', { timeout: 5000 });
    await popup.locator('[data-role="popup-close"]').click();

    const committedRow = await commitLatestInputRow(page);
    const killChip = committedRow.locator('[data-role="kill-chip"]');
    await expect(killChip).toBeVisible({ timeout: 5000 });

    const committedTrigger = committedRow.locator('[data-role="enemy-detail-trigger"]');
    await expect(committedTrigger).toBeVisible({ timeout: 5000 });
    await committedTrigger.click();

    const committedPopup = page.locator('.enemy-detail-popup-container');
    await expect(committedPopup).toBeVisible({ timeout: 5000 });
    await expect(committedPopup).toContainText('Dead');
  });
});
