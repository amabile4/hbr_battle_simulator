import { test, expect } from '@playwright/test';

import {
  applyParty,
  commitLatestInputRow,
  fillPartySetupSlots,
  gotoUiNext,
  openEnemyPopupActionForRow,
} from './ui-next-helpers.js';

test.describe('Turn edit manual break', () => {
  async function expectInViewport(locator, page) {
    const box = await locator.boundingBox();
    expect(box).toBeTruthy();
    const viewport = page.viewportSize();
    expect(viewport).toBeTruthy();
    expect(box.y).toBeGreaterThanOrEqual(0);
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.y + box.height).toBeLessThanOrEqual(viewport.height);
    expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
  }

  async function setupEditMode(page, { commitCount = 2, editCommittedIndex = 0 } = {}) {
    await gotoUiNext(page);
    await fillPartySetupSlots(page, [0, 1, 2, 3]);
    await applyParty(page);

    for (let i = 0; i < commitCount; i += 1) {
      await commitLatestInputRow(page);
    }

    const committedRow1 = page
      .locator('[data-turn-row][data-row-mode="committed"]')
      .nth(editCommittedIndex);
    await committedRow1.locator('[data-role="edit-btn"]').click();

    const editRow = page.locator('[data-turn-row][data-row-mode="edit"]');
    await expect(editRow).toBeVisible({ timeout: 5000 });
    return editRow;
  }

  test('can toggle direct enemy break from the popup and keep the selected slot after recommit', async ({ page }) => {
    const editRow = await setupEditMode(page);

    const toolsBox = editRow.locator('[data-role="enemy-tools-box"]');
    await expect(toolsBox).toBeVisible({ timeout: 5000 });
    await expect(toolsBox.locator('[data-role="enemy-detail-trigger"]')).toBeVisible({ timeout: 5000 });
    await openEnemyPopupActionForRow(page, editRow, 'break', { enemyIndex: 0 });
    await expect(editRow.locator('[data-role="operation-chip"]')).toContainText('E1 ブレイク', { timeout: 5000 });

    const recommitBtn = editRow.locator('[data-role="recommit-btn"]');
    await expect(recommitBtn).toBeVisible({ timeout: 5000 });
    await recommitBtn.click();

    await expect(page.locator('[data-turn-row][data-row-mode="edit"]')).toHaveCount(0, {
      timeout: 5000,
    });

    const committedRow1 = page
      .locator('[data-turn-row][data-row-mode="committed"]')
      .first();
    await committedRow1.locator('[data-role="edit-btn"]').click();

    const reopenedEditRow = page.locator('[data-turn-row][data-row-mode="edit"]');
    await expect(reopenedEditRow).toBeVisible({ timeout: 5000 });

    const reopenedToolsBox = reopenedEditRow.locator('[data-role="enemy-tools-box"]');
    await expect(reopenedToolsBox).toBeVisible({ timeout: 5000 });
    await expect(reopenedToolsBox.locator('[data-role="enemy-detail-trigger"]')).toBeVisible({ timeout: 5000 });
    await expect(reopenedEditRow.locator('[data-role="operation-chip"]')).toContainText('E1 ブレイク', { timeout: 5000 });
    await reopenedToolsBox.locator('[data-role="enemy-detail-trigger"]').click();
    const reopenedPopup = page.locator('.enemy-detail-popup-container');
    await expect(reopenedPopup).toBeVisible({ timeout: 5000 });
    const breakButton = reopenedPopup.locator('[data-role="enemy-popup-action"][data-action-type="break"]');
    await expect(breakButton).toBeEnabled({ timeout: 5000 });
  });

  test('popup direct break remains clickable on later turns (#4/#5 progression)', async ({ page }) => {
    const editRow = await setupEditMode(page, {
      commitCount: 5,
      editCommittedIndex: 4,
    });

    const toolsBox = editRow.locator('[data-role="enemy-tools-box"]');
    await expect(toolsBox).toBeVisible({ timeout: 5000 });
    await expect(toolsBox.locator('[data-role="enemy-detail-trigger"]')).toBeVisible({ timeout: 5000 });
    await openEnemyPopupActionForRow(page, editRow, 'break', { enemyIndex: 0 });
    await expect(editRow.locator('[data-role="operation-chip"]')).toContainText('E1 ブレイク', { timeout: 5000 });
  });
});
