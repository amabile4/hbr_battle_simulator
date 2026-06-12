import { test, expect } from '@playwright/test';

import {
  fillPartySetupSlots,
  getPartySetupSlotState,
  gotoUiNext,
} from './ui-next-helpers.js';

test.describe('Party Setup drag and drop', () => {
  test('D&D swaps front and back slots and keeps slot settings attached', async ({ page }) => {
    await gotoUiNext(page);
    await fillPartySetupSlots(page, [0, 1, 2, 3]);
    await page.getByRole('button', { name: /並替 OFF/ }).click();

    await page.locator('select[data-field="lb"][data-slot-index="0"]').selectOption('4');
    await page.locator('select[data-field="pierce"][data-slot-index="0"]').selectOption('drive:10');
    await page.locator('select[data-field="lb"][data-slot-index="3"]').selectOption('2');
    await page.locator('select[data-field="pierce"][data-slot-index="3"]').selectOption('drive:15');

    const beforeFront = await getPartySetupSlotState(page, 0);
    const beforeBack = await getPartySetupSlotState(page, 3);

    await page
      .locator('[data-slot="0"] [data-role="party-slot-main-button"]')
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
      page.locator('select[data-field="pierce"][data-slot-index="0"]')
    ).toHaveValue(beforeBack.pierce);
    await expect(
      page.locator('select[data-field="lb"][data-slot-index="3"]')
    ).toHaveValue(beforeFront.lb);
    await expect(
      page.locator('select[data-field="pierce"][data-slot-index="3"]')
    ).toHaveValue(beforeFront.pierce);
  });

  test('tap-to-swap: front ↔ back via main icon click in reorder mode', async ({ page }) => {
    await gotoUiNext(page);
    await fillPartySetupSlots(page, [0, 1, 2, 3]);
    await page.getByRole('button', { name: /並替 OFF/ }).click();

    await page.locator('select[data-field="lb"][data-slot-index="0"]').selectOption('4');
    await page.locator('select[data-field="lb"][data-slot-index="3"]').selectOption('2');

    const beforeFront = await getPartySetupSlotState(page, 0);
    const beforeBack = await getPartySetupSlotState(page, 3);

    // 1st click: select source
    const srcHandle = page.locator('[data-slot="0"] [data-role="party-slot-main-button"]');
    await srcHandle.click();
    await expect(srcHandle).toHaveAttribute('data-reorder-source', 'true');

    // 2nd click: select destination → triggers swap
    const dstHandle = page.locator('[data-slot="3"] [data-role="party-slot-main-button"]');
    await dstHandle.click();

    // images should have exchanged
    await expect(
      page.locator('[data-slot="0"] [data-role="party-slot-main-button"] img')
    ).toHaveAttribute('alt', beforeBack.alt ?? '');
    await expect(
      page.locator('[data-slot="3"] [data-role="party-slot-main-button"] img')
    ).toHaveAttribute('alt', beforeFront.alt ?? '');

    // settings should move with the slot
    await expect(
      page.locator('select[data-field="lb"][data-slot-index="0"]')
    ).toHaveValue(beforeBack.lb);
    await expect(
      page.locator('select[data-field="lb"][data-slot-index="3"]')
    ).toHaveValue(beforeFront.lb);

    // selection state should be cleared
    await expect(srcHandle).toHaveAttribute('data-reorder-source', 'false');
    await expect(dstHandle).toHaveAttribute('data-reorder-source', 'false');
  });

  test('D&D swaps front ↔ front slots', async ({ page }) => {
    await gotoUiNext(page);
    await fillPartySetupSlots(page, [0, 1, 2]);
    await page.getByRole('button', { name: /並替 OFF/ }).click();

    const before0 = await getPartySetupSlotState(page, 0);
    const before1 = await getPartySetupSlotState(page, 1);

    await page
      .locator('[data-slot="0"] [data-role="party-slot-main-button"]')
      .dragTo(page.locator('[data-slot="1"] [data-role="party-slot-main-button"]'));

    await expect(
      page.locator('[data-slot="0"] [data-role="party-slot-main-button"] img')
    ).toHaveAttribute('alt', before1.alt ?? '');
    await expect(
      page.locator('[data-slot="1"] [data-role="party-slot-main-button"] img')
    ).toHaveAttribute('alt', before0.alt ?? '');
  });
});
