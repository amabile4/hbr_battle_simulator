import { test, expect } from '@playwright/test';

import {
  applyParty,
  commitLatestInputRow,
  fillPartySetupSlots,
  gotoUiNext,
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

  test('can open break menu and keep selected break enemy after recommit', async ({ page }) => {
    const editRow = await setupEditMode(page);

    const breakToggle = editRow.locator('[data-role="manual-break-toggle"]');
    await expect(breakToggle).toBeVisible({ timeout: 5000 });
    await breakToggle.click();

    const breakEditor = editRow.locator('[data-role="manual-break-editor"]');
    await expect(breakEditor).toBeVisible({ timeout: 5000 });
    await expectInViewport(breakEditor, page);

    const singleBreakToggle = breakEditor.locator('[data-role="manual-break-single-toggle"]').first();
    const multiBreakCandidate = breakEditor.locator('[data-role="manual-break-candidate"]').first();

    const hasSingleBreak = (await breakEditor.locator('[data-role="manual-break-single-toggle"]').count()) > 0;

    if (hasSingleBreak) {
      await singleBreakToggle.click();
      await expect(singleBreakToggle).toHaveClass(/amber-500/);
    } else {
      await expect(multiBreakCandidate).toBeVisible({ timeout: 5000 });
      await multiBreakCandidate.click();
      await expect(multiBreakCandidate).toHaveClass(/amber-500/);
    }

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

    const reopenedBreakToggle = reopenedEditRow.locator('[data-role="manual-break-toggle"]');
    await expect(reopenedBreakToggle).toBeVisible({ timeout: 5000 });
    await reopenedBreakToggle.click();

    const reopenedBreakEditor = reopenedEditRow.locator('[data-role="manual-break-editor"]');
    await expect(reopenedBreakEditor).toBeVisible({ timeout: 5000 });

    const selectedSingleBreak = reopenedBreakEditor
      .locator('[data-role="manual-break-single-toggle"].border-amber-500, [data-role="manual-break-single-toggle"].bg-amber-500');
    const selectedMultiBreak = reopenedBreakEditor
      .locator('[data-role="manual-break-candidate"].border-amber-500, [data-role="manual-break-candidate"].bg-amber-500');

    const selectedCount =
      (await selectedSingleBreak.count()) + (await selectedMultiBreak.count());
    expect(selectedCount).toBeGreaterThan(0);
  });

  test('manual break menu remains clickable on later turns (#4/#5 progression)', async ({ page }) => {
    const editRow = await setupEditMode(page, {
      commitCount: 5,
      editCommittedIndex: 4,
    });

    const breakToggle = editRow.locator('[data-role="manual-break-toggle"]');
    await expect(breakToggle).toBeVisible({ timeout: 5000 });
    await breakToggle.click();

    const breakEditor = editRow.locator('[data-role="manual-break-editor"]');
    await expect(breakEditor).toBeVisible({ timeout: 5000 });
    await expectInViewport(breakEditor, page);

    const singleBreakToggle = breakEditor.locator('[data-role="manual-break-single-toggle"]').first();
    const multiBreakCandidate = breakEditor.locator('[data-role="manual-break-candidate"]').first();
    const hasSingleBreak = (await breakEditor.locator('[data-role="manual-break-single-toggle"]').count()) > 0;

    if (hasSingleBreak) {
      await expect(singleBreakToggle).toBeVisible({ timeout: 5000 });
      await singleBreakToggle.click();
      await expect(singleBreakToggle).toHaveClass(/amber-500/);
      return;
    }

    await expect(multiBreakCandidate).toBeVisible({ timeout: 5000 });
    await multiBreakCandidate.click();
    await expect(multiBreakCandidate).toHaveClass(/amber-500/);
  });
});
