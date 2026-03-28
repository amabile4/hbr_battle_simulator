import { test, expect } from '@playwright/test';

import {
  fillPartySetupSlots,
  getPartySetupSlotState,
  gotoUiNext,
} from './ui-next-helpers.js';

test.describe('Party Setup drag and drop', () => {
  test('swaps front and back slots and keeps slot settings attached', async ({ page }) => {
    await gotoUiNext(page);
    await fillPartySetupSlots(page, [0, 1, 2, 3]);

    await page.locator('select[data-field="lb"][data-slot-index="0"]').selectOption('4');
    await page.locator('select[data-field="drivePierce"][data-slot-index="0"]').selectOption('10');
    await page.locator('select[data-field="lb"][data-slot-index="3"]').selectOption('2');
    await page.locator('select[data-field="drivePierce"][data-slot-index="3"]').selectOption('15');

    const beforeFront = await getPartySetupSlotState(page, 0);
    const beforeBack = await getPartySetupSlotState(page, 3);

    await page
      .locator('[data-slot="0"] [data-role="party-slot-drag-handle"]')
      .dragTo(page.locator('[data-slot="3"] [data-role="party-slot-main-button"]'));

    await expect(
      page.locator('[data-slot="0"] [data-role="party-slot-main-button"] img')
    ).toHaveAttribute('alt', beforeBack.alt ?? '');
    await expect(
      page.locator('[data-slot="3"] [data-role="party-slot-main-button"] img')
    ).toHaveAttribute('alt', beforeFront.alt ?? '');
    await expect(
      page.locator('select[data-field="lb"][data-slot-index="0"]')
    ).toHaveValue(beforeBack.lb);
    await expect(
      page.locator('select[data-field="drivePierce"][data-slot-index="0"]')
    ).toHaveValue(beforeBack.drivePierce);
    await expect(
      page.locator('select[data-field="lb"][data-slot-index="3"]')
    ).toHaveValue(beforeFront.lb);
    await expect(
      page.locator('select[data-field="drivePierce"][data-slot-index="3"]')
    ).toHaveValue(beforeFront.drivePierce);
  });
});
