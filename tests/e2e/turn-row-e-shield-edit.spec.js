import { test, expect } from '@playwright/test';

import {
  applyParty,
  commitLatestInputRow,
  fillPartySetupSlots,
  gotoUiNext,
  openEnemyPopupActionForRow,
  selectEnemyPresetForActiveSlot,
} from './ui-next-helpers.js';

const KALEIDO_OUROBOROS_PRESET_ID = 13450815;

test.describe('Turn row Eシールド edit', () => {
  test('popup editor restores depleted Eシールド and keeps it through commit and reload', async ({ page }) => {
    await page.setViewportSize({ width: 1360, height: 960 });
    await gotoUiNext(page);
    await fillPartySetupSlots(page, [0, 1, 2, 3]);

    await page.locator('[role="tab"][data-tab="enemy"]').click();
    await selectEnemyPresetForActiveSlot(page, KALEIDO_OUROBOROS_PRESET_ID);
    await page.locator('#enemy-setup-root [data-action="toggle-edit"]').click();

    const countInput = page.locator('#enemy-setup-root [data-edit-eshield-field="count"]');
    await expect(countInput).toHaveValue('30');
    await countInput.fill('0');
    await countInput.blur();
    await expect(countInput).toHaveValue('0');

    const inputRow = await applyParty(page);

    await openEnemyPopupActionForRow(page, inputRow, 'eshield', { enemyIndex: 0 });
    const popup = page.locator('.enemy-detail-popup-container');
    const editor = popup.locator('[data-role="enemy-popup-eshield-editor"]');
    await expect(editor).toBeVisible({ timeout: 5000 });

    const currentInput = editor.locator('[data-role="enemy-popup-eshield-current"]');
    const maxInput = editor.locator('[data-role="enemy-popup-eshield-max"]');
    await expect(currentInput).toHaveValue('0');
    await expect(maxInput).toHaveValue('30');

    await maxInput.fill('45');
    await editor.locator('[data-role="enemy-popup-eshield-fill-max"]').click();
    await expect(currentInput).toHaveValue('45');
    await editor.locator('[data-role="enemy-popup-eshield-apply"]').click();

    await expect(page.locator('.enemy-detail-popup-container')).toContainText('45/45', { timeout: 5000 });
    await expect(inputRow.locator('[data-role="operation-chip"]')).toContainText('Eシールド: E1 45/45', {
      timeout: 5000,
    });
    await expect(inputRow.locator('[data-role="turn-info-e-shield-strip"]')).toContainText('45', {
      timeout: 5000,
    });
    await popup.locator('[data-role="popup-close"]').click();

    const committedRow = await commitLatestInputRow(page);
    await committedRow.locator('[data-role="enemy-detail-trigger"]').click();
    const committedPopup = page.locator('.enemy-detail-popup-container');
    await expect(committedPopup).toContainText('45/45', { timeout: 5000 });
    await committedPopup.locator('[data-role="popup-close"]').click();

    const downloadPromise = page.waitForEvent('download');
    await page.locator('#session-save-btn').click();
    const download = await downloadPromise;
    const savedPath = await download.path();
    expect(savedPath).toBeTruthy();

    await gotoUiNext(page);
    await page.locator('#session-load-input').setInputFiles(String(savedPath));

    const reloadedCommittedRow = page.locator('[data-turn-row][data-row-mode="committed"]').first();
    await expect(reloadedCommittedRow).toBeVisible({ timeout: 5000 });
    await reloadedCommittedRow.locator('[data-role="enemy-detail-trigger"]').click();
    const reloadedPopup = page.locator('.enemy-detail-popup-container');
    await expect(reloadedPopup).toContainText('45/45', { timeout: 5000 });
    await expect(reloadedCommittedRow.locator('[data-role="operation-chip"]')).toContainText('Eシールド: E1 45/45', {
      timeout: 5000,
    });
  });
});
