import { test, expect } from '@playwright/test';

import {
  applyParty,
  fillPartySetupSlots,
  gotoUiNext,
} from './ui-next-helpers.js';

test.describe('Turn row preview status popup', () => {
  test('input row enemy detail popup shows preview section at top', async ({ page }) => {
    await gotoUiNext(page);
    await fillPartySetupSlots(page, [0, 1, 2, 3]);
    const inputRow = await applyParty(page);

    const trigger = inputRow.locator('[data-role="enemy-detail-trigger"]');
    await expect(trigger).toBeVisible({ timeout: 5000 });
    await trigger.click({ button: 'right' });

    const popup = page.locator('.enemy-detail-popup-container');
    await expect(popup).toBeVisible({ timeout: 5000 });
    await expect(popup).toContainText('プレビュー（コミット見込み）');
  });
});
