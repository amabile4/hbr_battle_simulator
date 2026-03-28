import { test, expect } from '@playwright/test';

import {
  applyParty,
  fillPartySetupSlots,
  getTurnRowSlotAlt,
  gotoUiNext,
} from './ui-next-helpers.js';

test.describe('Turn edit D&D swap', () => {
  test('edit committed turn #1 at turn #3 and D&D swap front ↔ back', async ({ page }) => {
    await gotoUiNext(page);
    await fillPartySetupSlots(page, [0, 1, 2, 3]);
    await applyParty(page);

    // --- commit turn #1 (default skills) ---
    const commitBtn1 = page
      .locator('[data-turn-row][data-row-mode="input"]')
      .last()
      .locator('[data-role="commit-btn"]');
    await expect(commitBtn1).toBeVisible({ timeout: 5000 });
    await commitBtn1.click();
    await expect(
      page.locator('[data-turn-row][data-row-mode="committed"]'),
    ).toHaveCount(1, { timeout: 5000 });

    // --- commit turn #2 (default skills) ---
    const commitBtn2 = page
      .locator('[data-turn-row][data-row-mode="input"]')
      .last()
      .locator('[data-role="commit-btn"]');
    await expect(commitBtn2).toBeVisible({ timeout: 5000 });
    await commitBtn2.click();
    await expect(
      page.locator('[data-turn-row][data-row-mode="committed"]'),
    ).toHaveCount(2, { timeout: 5000 });

    // now at turn #3 input row — verify 2 committed + 1 input
    await expect(
      page.locator('[data-turn-row][data-row-mode="input"]'),
    ).toHaveCount(1);

    // --- click edit on turn #1 (first committed row) ---
    const committedRow1 = page
      .locator('[data-turn-row][data-row-mode="committed"]')
      .first();
    await committedRow1.locator('[data-role="edit-btn"]').click();

    // the row should switch to edit mode
    const editRow = page.locator('[data-turn-row][data-row-mode="edit"]');
    await expect(editRow).toBeVisible({ timeout: 5000 });

    // record the character icons before D&D swap
    const beforeFrontAlt = await getTurnRowSlotAlt(editRow, 0);
    const beforeBackAlt = await getTurnRowSlotAlt(editRow, 3);
    expect(beforeFrontAlt).toBeTruthy();
    expect(beforeBackAlt).toBeTruthy();
    expect(beforeFrontAlt).not.toBe(beforeBackAlt);

    // --- D&D: drag position 0 handle → drop on position 3 slot ---
    const srcHandle = editRow.locator(
      '[data-turn-slot][data-position="0"] [data-role="turn-slot-drag-handle"]',
    );
    const dstSlot = editRow.locator('[data-turn-slot][data-position="3"]');
    await srcHandle.dragTo(dstSlot);

    // verify the icons have swapped
    await expect(
      editRow.locator('[data-turn-slot][data-position="0"] [data-turn-slot-icon] img'),
    ).toHaveAttribute('alt', beforeBackAlt);
    await expect(
      editRow.locator('[data-turn-slot][data-position="3"] [data-turn-slot-icon] img'),
    ).toHaveAttribute('alt', beforeFrontAlt);
  });
});
