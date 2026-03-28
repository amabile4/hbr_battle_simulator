import { test, expect } from '@playwright/test';

import {
  applyParty,
  fillPartySetupSlots,
  getTurnRowSlotAlt,
  gotoUiNext,
} from './ui-next-helpers.js';

test.describe('Turn edit D&D swap', () => {
  /** 共通セットアップ: 4人設定 → #1,#2 コミット → #1 を編集モードにして editRow を返す */
  async function setupEditMode(page) {
    await gotoUiNext(page);
    await fillPartySetupSlots(page, [0, 1, 2, 3]);
    await applyParty(page);

    // commit turn #1
    const commitBtn1 = page
      .locator('[data-turn-row][data-row-mode="input"]')
      .last()
      .locator('[data-role="commit-btn"]');
    await expect(commitBtn1).toBeVisible({ timeout: 5000 });
    await commitBtn1.click();
    await expect(
      page.locator('[data-turn-row][data-row-mode="committed"]'),
    ).toHaveCount(1, { timeout: 5000 });

    // commit turn #2
    const commitBtn2 = page
      .locator('[data-turn-row][data-row-mode="input"]')
      .last()
      .locator('[data-role="commit-btn"]');
    await expect(commitBtn2).toBeVisible({ timeout: 5000 });
    await commitBtn2.click();
    await expect(
      page.locator('[data-turn-row][data-row-mode="committed"]'),
    ).toHaveCount(2, { timeout: 5000 });

    // click edit on turn #1
    const committedRow1 = page
      .locator('[data-turn-row][data-row-mode="committed"]')
      .first();
    await committedRow1.locator('[data-role="edit-btn"]').click();

    const editRow = page.locator('[data-turn-row][data-row-mode="edit"]');
    await expect(editRow).toBeVisible({ timeout: 5000 });
    return editRow;
  }

  test('edit mode D&D swap front ↔ back', async ({ page }) => {
    const editRow = await setupEditMode(page);

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

  test('edit mode tap-swap front ↔ back via icon click', async ({ page }) => {
    const editRow = await setupEditMode(page);

    const beforeFrontAlt = await getTurnRowSlotAlt(editRow, 0);
    const beforeBackAlt = await getTurnRowSlotAlt(editRow, 3);
    expect(beforeFrontAlt).toBeTruthy();
    expect(beforeBackAlt).toBeTruthy();
    expect(beforeFrontAlt).not.toBe(beforeBackAlt);

    // 1st click: select source
    const srcIcon = editRow.locator(
      '[data-turn-slot][data-position="0"] [data-turn-slot-icon]',
    );
    await srcIcon.click();
    await expect(srcIcon).toHaveClass(/ring-amber-400/);

    // 2nd click: select destination → triggers swap
    const dstIcon = editRow.locator(
      '[data-turn-slot][data-position="3"] [data-turn-slot-icon]',
    );
    await dstIcon.click();

    await expect(
      editRow.locator('[data-turn-slot][data-position="0"] [data-turn-slot-icon] img'),
    ).toHaveAttribute('alt', beforeBackAlt);
    await expect(
      editRow.locator('[data-turn-slot][data-position="3"] [data-turn-slot-icon] img'),
    ).toHaveAttribute('alt', beforeFrontAlt);
  });

  test('edit mode tap-swap front ↔ front via icon click', async ({ page }) => {
    const editRow = await setupEditMode(page);

    const beforeAlt0 = await getTurnRowSlotAlt(editRow, 0);
    const beforeAlt1 = await getTurnRowSlotAlt(editRow, 1);
    expect(beforeAlt0).toBeTruthy();
    expect(beforeAlt1).toBeTruthy();
    expect(beforeAlt0).not.toBe(beforeAlt1);

    await editRow
      .locator('[data-turn-slot][data-position="0"] [data-turn-slot-icon]')
      .click();
    await editRow
      .locator('[data-turn-slot][data-position="1"] [data-turn-slot-icon]')
      .click();

    await expect(
      editRow.locator('[data-turn-slot][data-position="0"] [data-turn-slot-icon] img'),
    ).toHaveAttribute('alt', beforeAlt1);
    await expect(
      editRow.locator('[data-turn-slot][data-position="1"] [data-turn-slot-icon] img'),
    ).toHaveAttribute('alt', beforeAlt0);
  });
});
