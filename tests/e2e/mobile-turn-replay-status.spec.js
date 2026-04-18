import { test, expect, devices } from '@playwright/test';

import {
  getLatestDownloadedSessionPath,
  gotoUiNext,
  openPassiveLog,
} from './ui-next-helpers.js';

test.use({
  ...devices['iPhone SE'],
});

async function loadSampleSession(page) {
  await gotoUiNext(page);
  await page.locator('#session-load-input').setInputFiles(getLatestDownloadedSessionPath());
  await page
    .locator('[data-turn-row][data-row-mode="committed"]')
    .first()
    .waitFor({ timeout: 15000 });
  const status = page.locator('[data-role="turn-replay-status"]');
  await expect(status).toBeVisible({ timeout: 5000 });
  await expect(status).toContainText('再計算完了');
  return status;
}

test.describe('Mobile turn replay status', () => {
  test('uses a front-weighted slot ratio for committed rows on mobile', async ({ page }) => {
    await loadSampleSession(page);

    const firstCommittedRow = page.locator('[data-turn-row][data-row-mode="committed"]').first();
    const widths = await firstCommittedRow.evaluate((row) => {
      const front = row.querySelector('[data-turn-front-group]')?.getBoundingClientRect().width ?? 0;
      const back = row.querySelector('[data-turn-back-group]')?.getBoundingClientRect().width ?? 0;
      return {
        front,
        back,
        ratio: back > 0 ? front / back : 0,
      };
    });

    expect(widths.front).toBeGreaterThan(widths.back);
    expect(widths.ratio).toBeGreaterThan(1.15);
  });

  test('keeps the input row within the mobile viewport', async ({ page }) => {
    await loadSampleSession(page);

    const inputRow = page.locator('[data-turn-row][data-row-mode="input"]').last();
    await expect(inputRow).toBeVisible();

    const metrics = await inputRow.evaluate((row) => {
      const buttons = row.querySelector('[data-turn-buttons]')?.getBoundingClientRect();
      const note = row.querySelector('[data-turn-note]')?.getBoundingClientRect();
      const info = row.querySelector('[data-turn-info]')?.getBoundingClientRect();
      const slots = row.querySelector('[data-turn-slots]')?.getBoundingClientRect();
      const rowRect = row.getBoundingClientRect();
      const maxChildRight = [...row.children].reduce((maxRight, child) => {
        const childRight = child.getBoundingClientRect().right;
        return Math.max(maxRight, childRight);
      }, rowRect.right);
      return {
        rowVisibleOverflow: Math.max(0, maxChildRight - rowRect.right),
        documentOverflow: Math.max(0, document.documentElement.scrollWidth - window.innerWidth),
        rowClientWidth: row.clientWidth,
        infoWidth: info?.width ?? 0,
        slotsWidth: slots?.width ?? 0,
        buttonsWidth: buttons?.width ?? 0,
        noteWidth: note?.width ?? 0,
      };
    });

    expect(metrics.rowVisibleOverflow, JSON.stringify(metrics)).toBeLessThanOrEqual(1);
    expect(metrics.documentOverflow, JSON.stringify(metrics)).toBeLessThanOrEqual(1);
  });

  test('keeps input-row controls contained on mobile', async ({ page }) => {
    await loadSampleSession(page);

    const inputRow = page.locator('[data-turn-row][data-row-mode="input"]').last();
    await expect(inputRow).toBeVisible();

    const metrics = await inputRow.evaluate((row) => {
      const rowRect = row.getBoundingClientRect();
      const buttons = row.querySelector('[data-turn-buttons]')?.getBoundingClientRect();
      const note = row.querySelector('[data-turn-note]')?.getBoundingClientRect();
      return {
        rowWidth: rowRect.width,
        buttonsRightGap: buttons ? rowRect.right - buttons.right : -1,
        buttonsWidth: buttons?.width ?? 0,
        noteWidth: note?.width ?? 0,
      };
    });

    expect(metrics.buttonsWidth).toBeGreaterThan(0);
    expect(metrics.noteWidth).toBeGreaterThan(0);
    expect(metrics.buttonsRightGap).toBeGreaterThanOrEqual(-1);
  });

  test('scales committed front icons larger than back icons on mobile', async ({ page }) => {
    await loadSampleSession(page);

    const firstCommittedRow = page.locator('[data-turn-row][data-row-mode="committed"]').first();
    const iconSizes = await firstCommittedRow.evaluate((row) => {
      const frontIcon = row.querySelector('[data-turn-front-group] [data-turn-slot-icon]');
      const backIcon = row.querySelector('[data-turn-back-group] [data-turn-slot-icon]');
      const frontRect = frontIcon?.getBoundingClientRect();
      const backRect = backIcon?.getBoundingClientRect();
      return {
        frontWidth: frontRect?.width ?? 0,
        frontHeight: frontRect?.height ?? 0,
        backWidth: backRect?.width ?? 0,
        backHeight: backRect?.height ?? 0,
        widthRatio: backRect && backRect.width > 0 ? (frontRect?.width ?? 0) / backRect.width : 0,
      };
    });

    expect(iconSizes.frontWidth).toBeGreaterThan(iconSizes.backWidth);
    expect(iconSizes.frontHeight).toBeGreaterThan(iconSizes.backHeight);
    expect(iconSizes.widthRatio).toBeGreaterThan(1.35);
  });

  test('keeps the enemy status button at the medium label on mobile', async ({ page }) => {
    await loadSampleSession(page);

    const label = page
      .locator('[data-turn-row][data-row-mode="committed"]')
      .first()
      .locator('.turn-info-enemy-button__label')
      .first();

    await expect(label.locator('.turn-info-enemy-button__label-text--full')).toBeHidden();
    await expect(label.locator('.turn-info-enemy-button__label-text--medium')).toBeVisible({ timeout: 5000 });
    await expect(label.locator('.turn-info-enemy-button__label-text--short')).toBeHidden();
  });

  test('moves the battle-end chip below the compact turn header on mobile', async ({ page }) => {
    await loadSampleSession(page);

    const battleEndRow = page
      .locator('[data-turn-row][data-row-mode="committed"][data-battle-ended="true"]')
      .first();
    await battleEndRow.scrollIntoViewIfNeeded();
    await expect(battleEndRow).toBeVisible();

    const layout = await battleEndRow.evaluate((row) => {
      const info = row.querySelector('[data-turn-info]')?.getBoundingClientRect();
      const stack = row.querySelector('[data-role="turn-info-stack"]')?.getBoundingClientRect();
      const chip = row.querySelector('[data-role="turn-info-battle-end"]')?.getBoundingClientRect();
      return {
        infoWidth: info?.width ?? 0,
        stackBottom: stack?.bottom ?? 0,
        chipTop: chip?.top ?? 0,
        chipWidth: chip?.width ?? 0,
      };
    });

    expect(layout.chipTop).toBeGreaterThan(layout.stackBottom - 1);
    expect(layout.chipWidth).toBeLessThan(layout.infoWidth);
  });

  test('keeps ally target labels off the character icon on mobile', async ({ page }) => {
    await loadSampleSession(page);

    const label = page
      .locator('[data-role="target-trigger-label"], [data-role="target-trigger"]')
      .filter({ hasText: '味方' })
      .first();
    await expect(label).toBeVisible();

    const layout = await label.evaluate((node) => {
      const slot = node.closest('[data-turn-slot]');
      const icon = slot?.querySelector('[data-turn-slot-icon]')?.getBoundingClientRect();
      const footer = slot?.querySelector('[data-role="slot-footer"]')?.getBoundingClientRect();
      const labelRect = node.getBoundingClientRect();
      return {
        iconBottom: icon?.bottom ?? 0,
        footerTop: footer?.top ?? 0,
        labelTop: labelRect.top,
        labelBottom: labelRect.bottom,
      };
    });

    expect(layout.labelTop).toBeGreaterThanOrEqual(layout.iconBottom - 1);
    expect(layout.labelBottom).toBeGreaterThan(layout.footerTop);
  });

  test('hides front-slot buff icons on mobile', async ({ page }) => {
    await loadSampleSession(page);

    const buffLists = page.locator('.buff-icon-list');
    await expect
      .poll(async () => buffLists.count(), { timeout: 15000 })
      .toBeGreaterThan(0);
    await expect
      .poll(
        async () =>
          buffLists.evaluateAll((nodes) =>
            nodes.filter((node) => getComputedStyle(node).display !== 'none').length
          ),
        { timeout: 5000 }
      )
      .toBe(0);
  });

  test('hides while the character detail popup is open', async ({ page }) => {
    const status = await loadSampleSession(page);

    const inputRow = page.locator('[data-turn-row][data-row-mode="input"]').last();
    await inputRow.scrollIntoViewIfNeeded();
    await inputRow.locator('[data-turn-slot-icon]').first().click({ button: 'right' });

    await expect(page.locator('#char-detail-popup.open')).toBeVisible({ timeout: 5000 });
    await expect(status).toBeHidden();
  });

  test('hides while the passive log pane is open on mobile', async ({ page }) => {
    const status = await loadSampleSession(page);

    await openPassiveLog(page);
    await expect(status).toBeHidden();
  });
});
