import { test, expect } from '@playwright/test';

import {
  applyParty,
  fillPartySetupSlots,
  getTurnRowSlotAlt,
  gotoUiNext,
} from './ui-next-helpers.js';

test.describe('Turn row slot swap', () => {
  test.fixme(
    'icon-handle swap is covered in JSDOM and remains unstable in the current browser harness'
  );

  test('swaps a front slot with a back slot from the icon handle', async ({ page }) => {
    await gotoUiNext(page);
    await fillPartySetupSlots(page, [0, 1, 2, 3]);

    const inputRow = await applyParty(page);
    const beforeFrontAlt = await getTurnRowSlotAlt(inputRow, 0);
    const beforeBackAlt = await getTurnRowSlotAlt(inputRow, 3);

    await inputRow
      .locator('[data-turn-slot][data-position="0"] [data-role="turn-slot-drag-handle"]')
      .evaluate((element) => element.click());
    await inputRow
      .locator('[data-turn-slot][data-position="3"] [data-role="turn-slot-drag-handle"]')
      .evaluate((element) => element.click());

    await expect(
      inputRow.locator('[data-turn-slot][data-position="0"] [data-turn-slot-icon] img')
    ).toHaveAttribute('alt', beforeBackAlt ?? '');
    await expect(
      inputRow.locator('[data-turn-slot][data-position="3"] [data-turn-slot-icon] img')
    ).toHaveAttribute('alt', beforeFrontAlt ?? '');
  });
});
