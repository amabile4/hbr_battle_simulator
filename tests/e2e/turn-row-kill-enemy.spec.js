import { test, expect } from '@playwright/test';

import {
  applyParty,
  commitLatestInputRow,
  fillPartySetupSlots,
  gotoUiNext,
  openEnemyPopupActionForRow,
} from './ui-next-helpers.js';

test.describe('Turn row kill enemy', () => {
  test('popup direct kill on E1 adds a chip and shows Dead after commit', async ({ page }) => {
    await page.setViewportSize({ width: 1360, height: 960 });
    await gotoUiNext(page);
    await fillPartySetupSlots(page, [0, 1, 2, 3]);
    const inputRow = await applyParty(page);

    const toolsBox = inputRow.locator('[data-role="enemy-tools-box"]');
    await expect(toolsBox).toBeVisible({ timeout: 5000 });
    await expect(toolsBox.locator('[data-role="enemy-detail-trigger"]')).toBeVisible({ timeout: 5000 });
    await openEnemyPopupActionForRow(page, inputRow, 'kill', { enemyIndex: 0 });

    const committedRow = await commitLatestInputRow(page);
    const killChip = committedRow.locator('[data-role="operation-chip"]').filter({ hasText: 'E1 討伐' });
    await expect(killChip).toBeVisible({ timeout: 5000 });

    const committedTrigger = committedRow.locator('[data-role="enemy-detail-trigger"]');
    await expect(committedTrigger).toBeVisible({ timeout: 5000 });
    await committedTrigger.click();

    const committedPopup = page.locator('.enemy-detail-popup-container');
    await expect(committedPopup).toBeVisible({ timeout: 5000 });
    await expect(committedPopup).toContainText('Dead');
  });
});
