import { test, expect, devices } from '@playwright/test';

import { gotoUiNext } from './ui-next-helpers.js';

const MOBILE_DEVICE_NAMES = ['iPhone SE', 'iPhone 15 Pro'];
const MOBILE_TAB_LABELS = ['Party', 'Enemy', 'Stage', 'Global'];
const MAX_HORIZONTAL_OVERFLOW_PX = 1;
const MAX_SETUP_HEIGHT_RATIO = 0.52;
const MIN_SCROLL_DELTA_PX = 40;
for (const deviceName of MOBILE_DEVICE_NAMES) {
  test(`keeps setup tabs within the mobile viewport (${deviceName})`, async ({ browser }) => {
    const context = await browser.newContext(devices[deviceName]);
    const page = await context.newPage();

    try {
      await gotoUiNext(page);

      for (const label of MOBILE_TAB_LABELS) {
        await page.getByRole('tab', { name: label }).click();

        const metrics = await page.evaluate(() => {
          const setupArea = document.querySelector('#setup-area');
          const activePanel = document.querySelector('[data-tab-content]:not([hidden])');
          return {
            documentOverflow: Math.max(0, document.documentElement.scrollWidth - window.innerWidth),
            setupOverflow: Math.max(
              0,
              (setupArea?.scrollWidth ?? 0) - (setupArea?.clientWidth ?? 0)
            ),
            panelOverflow: Math.max(
              0,
              (activePanel?.scrollWidth ?? 0) - (activePanel?.clientWidth ?? 0)
            ),
          };
        });

        expect(metrics.documentOverflow).toBeLessThanOrEqual(MAX_HORIZONTAL_OVERFLOW_PX);
        expect(metrics.setupOverflow).toBeLessThanOrEqual(MAX_HORIZONTAL_OVERFLOW_PX);
        expect(metrics.panelOverflow).toBeLessThanOrEqual(MAX_HORIZONTAL_OVERFLOW_PX);
      }
    } finally {
      await context.close();
    }
  });

  test(`keeps setup-area capped and preserves independent scrolling on mobile (${deviceName})`, async ({ browser }) => {
    const context = await browser.newContext(devices[deviceName]);
    const page = await context.newPage();

    try {
      await gotoUiNext(page);
      await page.getByRole('tab', { name: 'Global' }).click();

      await page.evaluate(() => {
        const turnArea = document.querySelector('#turn-area');
        const setupPanel = document.querySelector('[data-tab-content="simulator"]');
        if (!turnArea || !setupPanel) {
          return;
        }

        if (!turnArea.querySelector('[data-role="mobile-scroll-filler"]')) {
          const filler = document.createElement('div');
          filler.dataset.role = 'mobile-scroll-filler';
          filler.style.height = '1600px';
          filler.style.pointerEvents = 'none';
          filler.style.opacity = '0';
          turnArea.appendChild(filler);
        }

        if (!setupPanel.querySelector('[data-role="mobile-setup-scroll-filler"]')) {
          const filler = document.createElement('div');
          filler.dataset.role = 'mobile-setup-scroll-filler';
          filler.style.height = '600px';
          filler.style.pointerEvents = 'none';
          filler.style.opacity = '0';
          setupPanel.appendChild(filler);
        }
      });

      const heightMetrics = await page.evaluate(() => {
        const setupArea = document.querySelector('#setup-area');
        const setupPanel = document.querySelector('[data-tab-content="simulator"]');
        const turnArea = document.querySelector('#turn-area');
        return {
          viewportHeight: window.innerHeight,
          setupClientHeight: setupArea?.clientHeight ?? 0,
          setupPanelClientHeight: setupPanel?.clientHeight ?? 0,
          setupPanelScrollHeight: setupPanel?.scrollHeight ?? 0,
          turnClientHeight: turnArea?.clientHeight ?? 0,
          turnScrollHeight: turnArea?.scrollHeight ?? 0,
        };
      });

      expect(heightMetrics.setupClientHeight).toBeLessThanOrEqual(
        heightMetrics.viewportHeight * MAX_SETUP_HEIGHT_RATIO
      );
      expect(heightMetrics.setupPanelScrollHeight).toBeGreaterThan(heightMetrics.setupPanelClientHeight);
      expect(heightMetrics.turnScrollHeight).toBeGreaterThan(heightMetrics.turnClientHeight);

      const scrollMetrics = await page.evaluate((minDelta) => {
        const setupPanel = document.querySelector('[data-tab-content="simulator"]');
        const turnArea = document.querySelector('#turn-area');
        if (!setupPanel || !turnArea) {
          return {
            setupDelta: 0,
            turnDelta: 0,
            turnPreserved: false,
            setupPanelPreserved: false,
          };
        }

        setupPanel.scrollTop = 0;
        turnArea.scrollTop = 0;

        setupPanel.scrollTop = minDelta;
        const setupAfterSetupScroll = setupPanel.scrollTop;
        const turnAfterSetupScroll = turnArea.scrollTop;

        turnArea.scrollTop = minDelta * 2;

        return {
          setupDelta: setupAfterSetupScroll,
          turnDelta: turnArea.scrollTop,
          turnPreserved: turnAfterSetupScroll === 0,
          setupPanelPreserved: Math.abs(setupPanel.scrollTop - setupAfterSetupScroll) <= 1,
        };
      }, MIN_SCROLL_DELTA_PX);

      expect(scrollMetrics.setupDelta).toBeGreaterThanOrEqual(MIN_SCROLL_DELTA_PX);
      expect(scrollMetrics.turnDelta).toBeGreaterThanOrEqual(MIN_SCROLL_DELTA_PX);
      expect(scrollMetrics.turnPreserved).toBe(true);
      expect(scrollMetrics.setupPanelPreserved).toBe(true);
    } finally {
      await context.close().catch(() => {});
    }
  });
}
