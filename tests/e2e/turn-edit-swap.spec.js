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

  test('edit mode swap + recommit preserves swapped positions in committed row', async ({ page }) => {
    const editRow = await setupEditMode(page);

    const beforeFrontAlt = await getTurnRowSlotAlt(editRow, 0);
    const beforeBackAlt = await getTurnRowSlotAlt(editRow, 3);
    expect(beforeFrontAlt).not.toBe(beforeBackAlt);

    // tap-swap position 0 ↔ 3
    await editRow
      .locator('[data-turn-slot][data-position="0"] [data-turn-slot-icon]')
      .click();
    await editRow
      .locator('[data-turn-slot][data-position="3"] [data-turn-slot-icon]')
      .click();

    // icons swapped in edit row
    await expect(
      editRow.locator('[data-turn-slot][data-position="0"] [data-turn-slot-icon] img'),
    ).toHaveAttribute('alt', beforeBackAlt);

    // click recommit (save) button
    const recommitBtn = editRow.locator('[data-role="recommit-btn"]');
    await expect(recommitBtn).toBeVisible({ timeout: 3000 });
    await recommitBtn.click();

    // edit row should disappear, row reverts to committed
    await expect(page.locator('[data-turn-row][data-row-mode="edit"]')).toHaveCount(0, { timeout: 5000 });

    // committed row #1 should now reflect the swap
    const committedRow1 = page
      .locator('[data-turn-row][data-row-mode="committed"]')
      .first();
    await expect(committedRow1).toBeVisible();

    // the swapped positions should persist in the committed row
    await expect(
      committedRow1.locator('[data-turn-slot][data-position="0"] [data-turn-slot-icon] img'),
    ).toHaveAttribute('alt', beforeBackAlt);
    await expect(
      committedRow1.locator('[data-turn-slot][data-position="3"] [data-turn-slot-icon] img'),
    ).toHaveAttribute('alt', beforeFrontAlt);
  });

  test('edit mode D&D swap with 6 characters keeps 3+3 slot layout', async ({ page }) => {
    // コンソールエラーをキャプチャ
    const consoleErrors = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });
    page.on('pageerror', (err) => consoleErrors.push(err.message));

    // 6人セットアップ
    await gotoUiNext(page);
    await fillPartySetupSlots(page, [0, 1, 2, 3, 4, 5]);
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

    // Before swap: front group should have 3 slots, back group should have 3 slots
    const frontGroup = editRow.locator('[data-turn-front-group]');
    const backGroup = editRow.locator('[data-turn-back-group]');
    await expect(frontGroup.locator('[data-turn-slot]')).toHaveCount(3);
    await expect(backGroup.locator('[data-turn-slot]')).toHaveCount(3);

    // Measure group widths before swap
    const layoutBefore = await editRow.evaluate((row) => {
      const fg = row.querySelector('[data-turn-front-group]');
      const bg = row.querySelector('[data-turn-back-group]');
      const fSlots = [...fg.querySelectorAll('[data-turn-slot]')];
      const bSlots = [...bg.querySelectorAll('[data-turn-slot]')];
      return {
        frontGroupWidth: fg.getBoundingClientRect().width,
        backGroupWidth: bg.getBoundingClientRect().width,
        frontSlotWidths: fSlots.map(s => ({ pos: s.dataset.position, w: s.getBoundingClientRect().width })),
        backSlotWidths: bSlots.map(s => ({ pos: s.dataset.position, w: s.getBoundingClientRect().width })),
      };
    });

    // D&D swap position 0 ↔ 3
    const srcHandle = editRow.locator(
      '[data-turn-slot][data-position="0"] [data-role="turn-slot-drag-handle"]',
    );
    const dstSlot = editRow.locator('[data-turn-slot][data-position="3"]');
    await srcHandle.dragTo(dstSlot);

    // After swap: front group should STILL have 3 slots, back group should STILL have 3 slots
    await expect(frontGroup.locator('[data-turn-slot]')).toHaveCount(3);
    await expect(backGroup.locator('[data-turn-slot]')).toHaveCount(3);

    // Measure group widths after swap
    const layoutAfter = await editRow.evaluate((row) => {
      const fg = row.querySelector('[data-turn-front-group]');
      const bg = row.querySelector('[data-turn-back-group]');
      const fSlots = [...fg.querySelectorAll('[data-turn-slot]')];
      const bSlots = [...bg.querySelectorAll('[data-turn-slot]')];
      return {
        frontGroupWidth: fg.getBoundingClientRect().width,
        backGroupWidth: bg.getBoundingClientRect().width,
        frontSlotWidths: fSlots.map(s => ({ pos: s.dataset.position, w: s.getBoundingClientRect().width })),
        backSlotWidths: bSlots.map(s => ({ pos: s.dataset.position, w: s.getBoundingClientRect().width })),
      };
    });

    // Group widths should not change significantly (within 20%)
    const frontWidthRatio = layoutAfter.frontGroupWidth / layoutBefore.frontGroupWidth;
    const backWidthRatio = layoutAfter.backGroupWidth / layoutBefore.backGroupWidth;
    expect(frontWidthRatio).toBeGreaterThan(0.8);
    expect(frontWidthRatio).toBeLessThan(1.2);
    expect(backWidthRatio).toBeGreaterThan(0.8);
    expect(backWidthRatio).toBeLessThan(1.2);

    // No console errors during the swap
    expect(consoleErrors.filter((e) => !e.includes('favicon'))).toEqual([]);
  });

  test('edit mode repeated swaps with 6 characters keep 3+3 layout', async ({ page }) => {
    // 6人セットアップ
    await gotoUiNext(page);
    await fillPartySetupSlots(page, [0, 1, 2, 3, 4, 5]);
    await applyParty(page);

    // commit turn #1, #2
    for (let i = 0; i < 2; i++) {
      const btn = page
        .locator('[data-turn-row][data-row-mode="input"]')
        .last()
        .locator('[data-role="commit-btn"]');
      await expect(btn).toBeVisible({ timeout: 5000 });
      await btn.click();
      await expect(
        page.locator('[data-turn-row][data-row-mode="committed"]'),
      ).toHaveCount(i + 1, { timeout: 5000 });
    }

    // click edit on turn #1
    const committedRow1 = page
      .locator('[data-turn-row][data-row-mode="committed"]')
      .first();
    await committedRow1.locator('[data-role="edit-btn"]').click();
    const editRow = page.locator('[data-turn-row][data-row-mode="edit"]');
    await expect(editRow).toBeVisible({ timeout: 5000 });
    const frontGroup = editRow.locator('[data-turn-front-group]');
    const backGroup = editRow.locator('[data-turn-back-group]');

    // 1st swap: tap-swap 0 ↔ 3
    await editRow
      .locator('[data-turn-slot][data-position="0"] [data-turn-slot-icon]')
      .click();
    await editRow
      .locator('[data-turn-slot][data-position="3"] [data-turn-slot-icon]')
      .click();

    await expect(frontGroup.locator('[data-turn-slot]')).toHaveCount(3);
    await expect(backGroup.locator('[data-turn-slot]')).toHaveCount(3);

    // 2nd swap: tap-swap 1 ↔ 4
    await editRow
      .locator('[data-turn-slot][data-position="1"] [data-turn-slot-icon]')
      .click();
    await editRow
      .locator('[data-turn-slot][data-position="4"] [data-turn-slot-icon]')
      .click();

    await expect(frontGroup.locator('[data-turn-slot]')).toHaveCount(3);
    await expect(backGroup.locator('[data-turn-slot]')).toHaveCount(3);

    // 3rd swap: tap-swap 0 ↔ 3 again (undo first swap)
    await editRow
      .locator('[data-turn-slot][data-position="0"] [data-turn-slot-icon]')
      .click();
    await editRow
      .locator('[data-turn-slot][data-position="3"] [data-turn-slot-icon]')
      .click();

    await expect(frontGroup.locator('[data-turn-slot]')).toHaveCount(3);
    await expect(backGroup.locator('[data-turn-slot]')).toHaveCount(3);
  });
});
