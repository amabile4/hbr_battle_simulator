import { test, expect, devices } from '@playwright/test';

import { getLatestDownloadedSessionPath, gotoUiNext } from './ui-next-helpers.js';

const MOBILE_DEVICE_NAMES = ['iPhone SE', 'iPhone 15 Pro'];
const IOS_TAP_TARGET_MIN_PX = 44;
const TAP_TARGET_TOLERANCE_PX = 0.5;

async function collectVisibleMinHeight(page, selector) {
  return page.evaluate((currentSelector) => {
    const nodes = [...document.querySelectorAll(currentSelector)].filter((node) => {
      if (!(node instanceof HTMLElement)) {
        return false;
      }
      const rect = node.getBoundingClientRect();
      const style = window.getComputedStyle(node);
      return !node.hidden && style.display !== 'none' && style.visibility !== 'hidden' && rect.height > 0;
    });

    const heights = nodes
      .map((node) => {
        const rect = node.getBoundingClientRect();
        return {
          label:
            node.getAttribute('aria-label') ??
            node.getAttribute('title') ??
            node.textContent?.trim() ??
            node.tagName,
          height: rect.height,
          width: rect.width,
        };
      })
      .sort((left, right) => left.height - right.height);

    return {
      count: heights.length,
      min: heights[0] ?? null,
    };
  }, selector);
}

for (const deviceName of MOBILE_DEVICE_NAMES) {
  test(`keeps setup controls at or above the iOS tap target (${deviceName})`, async ({ browser }) => {
    const context = await browser.newContext(devices[deviceName]);
    const page = await context.newPage();

    try {
      await gotoUiNext(page);

      const partyMetrics = {
        toolbar: await collectVisibleMinHeight(page, '.workspace-toolbar__button'),
        tabs: await collectVisibleMinHeight(page, '#initial-setup-root [role="tab"]'),
        apply: await collectVisibleMinHeight(page, '#initial-setup-root [data-role="apply-btn"]'),
        partyHandles: await collectVisibleMinHeight(
          page,
          '#party-setup-root [data-role="party-slot-drag-handle"]'
        ),
        partySelects: await collectVisibleMinHeight(page, '#party-setup-root select'),
      };

      await page.getByRole('tab', { name: 'Enemy' }).click();
      const enemyMetrics = {
        buttons: await collectVisibleMinHeight(page, '#enemy-setup-root button'),
        selects: await collectVisibleMinHeight(page, '#enemy-setup-root select'),
      };

      await page.getByRole('tab', { name: 'Stage' }).click();
      const stageMetrics = {
        buttons: await collectVisibleMinHeight(page, '#stage-setup-root button'),
        inputs: await collectVisibleMinHeight(page, '#stage-setup-root input[type="number"]'),
        selects: await collectVisibleMinHeight(page, '#stage-setup-root select'),
      };

      const groups = {
        ...partyMetrics,
        enemyButtons: enemyMetrics.buttons,
        enemySelects: enemyMetrics.selects,
        stageButtons: stageMetrics.buttons,
        stageInputs: stageMetrics.inputs,
        stageSelects: stageMetrics.selects,
      };

      for (const [name, metrics] of Object.entries(groups)) {
        expect(metrics.count, `${deviceName} ${name}`).toBeGreaterThan(0);
        expect(metrics.min?.height ?? 0, JSON.stringify({ deviceName, name, metrics })).toBeGreaterThanOrEqual(
          IOS_TAP_TARGET_MIN_PX - TAP_TARGET_TOLERANCE_PX
        );
      }
    } finally {
      await context.close();
    }
  });

  test(`keeps input-row touch controls at or above the iOS tap target (${deviceName})`, async ({ browser }) => {
    const context = await browser.newContext(devices[deviceName]);
    const page = await context.newPage();

    try {
      await gotoUiNext(page);
      await page.locator('#session-load-input').setInputFiles(getLatestDownloadedSessionPath());
      const inputRow = page.locator('[data-turn-row][data-row-mode="input"]').last();
      await expect(inputRow).toBeVisible();

      const groups = {
        turnSelects: await collectVisibleMinHeight(
          page,
          '[data-turn-row][data-row-mode="input"] [data-skill-select]'
        ),
        turnButtons: await collectVisibleMinHeight(
          page,
          '[data-turn-row][data-row-mode="input"] [data-turn-buttons] button'
        ),
        enemyTrigger: await collectVisibleMinHeight(
          page,
          '[data-turn-row][data-row-mode="input"] [data-role="enemy-detail-trigger"]'
        ),
      };

      for (const [name, metrics] of Object.entries(groups)) {
        expect(metrics.count, `${deviceName} ${name}`).toBeGreaterThan(0);
        expect(metrics.min?.height ?? 0, JSON.stringify({ deviceName, name, metrics })).toBeGreaterThanOrEqual(
          IOS_TAP_TARGET_MIN_PX - TAP_TARGET_TOLERANCE_PX
        );
      }
    } finally {
      await context.close();
    }
  });
}
