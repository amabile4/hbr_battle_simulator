import { test, expect } from '@playwright/test';

import {
  applyParty,
  fillPartySetupSlotsWithStyleIds,
  gotoUiNext,
  openPassiveLog,
} from './ui-next-helpers.js';

const PASSIVE_LOG_STYLE_IDS = [1001101, 1001202, 1001301, 1001403];

test.describe('Passive log pane resize', () => {
  test('desktop drag resizes the pane and keeps the height across close/reopen', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await gotoUiNext(page);
    await fillPartySetupSlotsWithStyleIds(page, PASSIVE_LOG_STYLE_IDS);
    await applyParty(page);

    const pane = await openPassiveLog(page);
    const handle = page.locator('[data-role="passive-log-resize-handle"]');
    await expect(handle).toBeVisible();

    const turnArea = page.locator('#turn-area');
    const beforePaneBox = await pane.boundingBox();
    const beforeTurnAreaBox = await turnArea.boundingBox();
    const handleBox = await handle.boundingBox();

    expect(beforePaneBox).toBeTruthy();
    expect(beforeTurnAreaBox).toBeTruthy();
    expect(handleBox).toBeTruthy();

    await page.mouse.move(
      handleBox.x + handleBox.width / 2,
      handleBox.y + handleBox.height / 2,
    );
    await page.mouse.down();
    await page.mouse.move(
      handleBox.x + handleBox.width / 2,
      handleBox.y + handleBox.height / 2 - 120,
      { steps: 8 },
    );
    await page.mouse.up();

    const afterPaneBox = await pane.boundingBox();
    const afterTurnAreaBox = await turnArea.boundingBox();
    expect(afterPaneBox).toBeTruthy();
    expect(afterTurnAreaBox).toBeTruthy();
    expect(afterPaneBox.height).toBeGreaterThan(beforePaneBox.height + 40);
    expect(afterTurnAreaBox.height).toBeLessThan(beforeTurnAreaBox.height - 20);

    const toggle = page.locator('#toggle-passive-log');
    await toggle.click();
    await expect(pane).toBeHidden();
    await toggle.click();
    await expect(pane).toBeVisible();

    const reopenedPaneBox = await pane.boundingBox();
    expect(reopenedPaneBox).toBeTruthy();
    expect(Math.abs(reopenedPaneBox.height - afterPaneBox.height)).toBeLessThan(4);
  });

  test('mobile keeps the fixed pane behavior and hides the resize handle', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await gotoUiNext(page);
    await fillPartySetupSlotsWithStyleIds(page, PASSIVE_LOG_STYLE_IDS);
    await applyParty(page);

    const pane = await openPassiveLog(page);
    const handle = page.locator('[data-role="passive-log-resize-handle"]');

    await expect(handle).toBeHidden();
    await expect(pane).toBeVisible();
    await expect(pane).not.toHaveAttribute('data-passive-log-resize-enabled', 'true');
    expect(await pane.evaluate((element) => element.style.height)).toBe('');
  });
});
