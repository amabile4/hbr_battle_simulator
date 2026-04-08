import { test, expect } from '@playwright/test';

import { DEFAULT_SUMMON_SAMPLE_ENEMY } from '../../src/data/enemy-sample-presets.js';
import {
  applyParty,
  commitLatestInputRow,
  fillPartySetupSlots,
  gotoUiNext,
} from './ui-next-helpers.js';

test.describe('Turn row summon enemy', () => {
  test('desktop keeps the full enemy info label and equal-width popup tabs', async ({ page }) => {
    await page.setViewportSize({ width: 1360, height: 960 });
    await gotoUiNext(page);
    await fillPartySetupSlots(page, [0, 1, 2, 3]);
    const inputRow = await applyParty(page);

    const label = inputRow.locator('.turn-info-enemy-button__label').first();
    await expect
      .poll(
        async () =>
          label.evaluate((node) =>
            getComputedStyle(node, '::before').content.replace(/^["']|["']$/g, '')
          ),
        { timeout: 5000 }
      )
      .toBe('敵情報確認');

    const triggerWidth = await inputRow
      .locator('[data-role="enemy-detail-trigger"]')
      .evaluate((node) => node.getBoundingClientRect().width);
    expect(triggerWidth).toBeGreaterThan(80);
    expect(triggerWidth).toBeLessThan(110);

    await inputRow.locator('[data-role="enemy-detail-trigger"]').click();
    const popup = page.locator('.enemy-detail-popup-container');
    await expect(popup).toBeVisible({ timeout: 5000 });

    const tabWidths = await popup.locator('[data-role="enemy-popup-tab"]').evaluateAll((nodes) =>
      nodes.map((node) => node.getBoundingClientRect().width)
    );
    expect(tabWidths).toHaveLength(3);
    expect(Math.abs(tabWidths[0] - tabWidths[1])).toBeLessThan(2);
    expect(Math.abs(tabWidths[1] - tabWidths[2])).toBeLessThan(2);
  });

  test('manual summon adds the selected enemy to the committed enemy detail popup', async ({ page }) => {
    await page.setViewportSize({ width: 1360, height: 960 });
    await gotoUiNext(page);
    await fillPartySetupSlots(page, [0, 1, 2, 3]);
    const inputRow = await applyParty(page);

    const toolsBox = inputRow.locator('[data-role="enemy-tools-box"]');
    await expect(toolsBox).toBeVisible({ timeout: 5000 });
    const trigger = toolsBox.locator('[data-role="enemy-detail-trigger"]');
    await expect(trigger).toBeVisible({ timeout: 5000 });
    await trigger.click();

    const popup = page.locator('.enemy-detail-popup-container');
    await expect(popup).toBeVisible({ timeout: 5000 });
    await expect(popup.locator('[data-role="enemy-popup-layout"][data-layout-mode="wide"]')).toBeVisible({ timeout: 5000 });
    await expect(popup.locator('[data-role="enemy-popup-column"]')).toHaveCount(3);
    // E1 is occupied — summon button must be disabled there
    const e1Summon = popup.locator('[data-role="enemy-popup-action"][data-action-type="summon"]');
    await expect(e1Summon).toBeVisible({ timeout: 5000 });
    await expect(e1Summon).toBeDisabled();
    // Switch to E2 tab (empty slot) where summon is allowed
    await popup.locator('[data-role="enemy-popup-tab"][data-enemy-tab-index="1"]').click();
    const summonAction = popup.locator('[data-role="enemy-popup-action"][data-action-type="summon"]');
    await expect(summonAction).toBeVisible({ timeout: 5000 });
    await expect(summonAction).toBeEnabled();
    await summonAction.click();

    const editor = inputRow.locator('[data-role="enemy-summon-editor"]');
    await expect(editor).toBeVisible({ timeout: 5000 });
    await editor.locator('[data-role="enemy-summon-select"]').selectOption(String(DEFAULT_SUMMON_SAMPLE_ENEMY.id));
    await editor.locator('[data-role="enemy-summon-submit"]').click();
    await expect(inputRow.locator('[data-role="operation-chip"]')).toContainText('召喚', { timeout: 5000 });

    const committedRow = await commitLatestInputRow(page);

    const committedTrigger = committedRow.locator('[data-role="enemy-detail-trigger"]');
    await expect(committedTrigger).toBeVisible({ timeout: 5000 });
    await committedTrigger.click();

    const committedPopup = page.locator('.enemy-detail-popup-container');
    await expect(committedPopup).toBeVisible({ timeout: 5000 });
    const e2Column = committedPopup.locator('[data-role="enemy-popup-column"][data-enemy-tab-index="1"]');
    await expect(e2Column).toContainText(DEFAULT_SUMMON_SAMPLE_ENEMY.name);
    await expect(e2Column).not.toContainText('E2 未使用');
    await expect(e2Column).toContainText('耐性');
  });

  test('enemy detail popup collapses to one selected column on narrow viewport', async ({ page }) => {
    await page.setViewportSize({ width: 720, height: 900 });
    await gotoUiNext(page);
    await fillPartySetupSlots(page, [0, 1, 2, 3]);
    const inputRow = await applyParty(page);

    await inputRow.locator('[data-role="enemy-detail-trigger"]').click();
    const popup = page.locator('.enemy-detail-popup-container');
    await expect(popup).toBeVisible({ timeout: 5000 });
    await expect(popup.locator('[data-role="enemy-popup-layout"][data-layout-mode="narrow"]')).toBeVisible({ timeout: 5000 });
    await expect(popup.locator('[data-role="enemy-popup-column"]')).toHaveCount(1);
    await expect(popup.locator('[data-role="enemy-popup-tab"]')).toHaveCount(3);
  });
});
