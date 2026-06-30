import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { test, expect, devices } from '@playwright/test';

import {
  applyParty,
  fillPartySetupSlots,
  gotoUiNext,
} from './ui-next-helpers.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SESSION_FIXTURE_PATH = path.resolve(
  __dirname,
  './fixtures/ui_next_session_enemy_status_desc_fixture.json'
);

test.use({
  ...devices['Pixel 5'],
});

test.describe('Mobile preset and target popovers', () => {
  test('preset long press keeps the button non-selectable and shows a viewport-safe menu above turn UI', async ({ page }) => {
    await gotoUiNext(page);
    await fillPartySetupSlots(page, [0, 1, 2, 3]);
    await applyParty(page);

    const button = page.locator('[data-role="party-preset-button"]').first();
    const buttonStyles = await button.evaluate((node) => ({
      userSelect:
        getComputedStyle(node).userSelect ||
        getComputedStyle(node).webkitUserSelect ||
        getComputedStyle(node).getPropertyValue('user-select') ||
        getComputedStyle(node).getPropertyValue('-webkit-user-select'),
      touchAction:
        getComputedStyle(node).touchAction ||
        getComputedStyle(node).getPropertyValue('touch-action'),
    }));

    expect(buttonStyles.userSelect).toBe('none');
    expect(buttonStyles.touchAction).toBe('manipulation');

    await button.dispatchEvent('touchstart');
    await page.waitForTimeout(460);

    const menu = page.locator('[data-role="preset-action-menu"]');
    await expect(menu).toBeVisible({ timeout: 5000 });

    const menuMetrics = await menu.evaluate((node) => {
      const rect = node.getBoundingClientRect();
      return {
        zIndex: Number.parseInt(getComputedStyle(node).zIndex, 10),
        top: rect.top,
        bottom: rect.bottom,
        left: rect.left,
        right: rect.right,
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight,
      };
    });

    expect(menuMetrics.zIndex).toBeGreaterThanOrEqual(200);
    expect(menuMetrics.top).toBeGreaterThanOrEqual(0);
    expect(menuMetrics.left).toBeGreaterThanOrEqual(0);
    expect(menuMetrics.right).toBeLessThanOrEqual(menuMetrics.viewportWidth);
    expect(menuMetrics.bottom).toBeLessThanOrEqual(menuMetrics.viewportHeight);
  });

  test('ally target popover keeps P1-P6 visible inside the mobile viewport while editing a committed row', async ({ page }) => {
    await gotoUiNext(page);
    await page.locator('#session-load-input').setInputFiles(SESSION_FIXTURE_PATH);

    const committedRows = page.locator('[data-turn-row][data-row-mode="committed"]');
    await expect(committedRows).toHaveCount(19, { timeout: 10000 });

    const firstCommittedRow = committedRows.first();
    await firstCommittedRow.locator('[data-role="edit-btn"]').click();

    const editRow = page.locator('[data-turn-row][data-row-mode="edit"]');
    await expect(editRow).toBeVisible({ timeout: 5000 });

    const trigger = editRow.locator('[data-role="target-trigger"][data-target-kind="ally"]').first();
    await expect(trigger).toBeVisible({ timeout: 5000 });
    await page.waitForTimeout(200);
    await trigger.click();

    const popover = editRow.locator('[data-role="target-popover"][data-target-kind="ally"]').first();
    await expect(popover).toBeVisible({ timeout: 5000 });
    await expect(popover.locator('[data-role="target-candidate"]')).toHaveCount(6);
    await expect(popover.locator('[data-role="target-candidate"]', { hasText: 'P6' })).toBeVisible({ timeout: 5000 });

    const popoverMetrics = await popover.evaluate((node) => {
      const rect = node.getBoundingClientRect();
      const candidates = [...node.querySelectorAll('[data-role="target-candidate"]')].map((button) => {
        const candidateRect = button.getBoundingClientRect();
        return {
          text: button.textContent?.trim() ?? '',
          top: candidateRect.top,
          bottom: candidateRect.bottom,
          left: candidateRect.left,
          right: candidateRect.right,
          hidden: getComputedStyle(button).display === 'none' || getComputedStyle(button).visibility === 'hidden',
        };
      });
      return {
        position: getComputedStyle(node).position,
        top: rect.top,
        bottom: rect.bottom,
        left: rect.left,
        right: rect.right,
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight,
        candidates,
      };
    });

    expect(popoverMetrics.position).toBe('fixed');
    expect(popoverMetrics.top).toBeGreaterThanOrEqual(0);
    expect(popoverMetrics.left).toBeGreaterThanOrEqual(0);
    expect(popoverMetrics.right).toBeLessThanOrEqual(popoverMetrics.viewportWidth);
    expect(popoverMetrics.bottom).toBeLessThanOrEqual(popoverMetrics.viewportHeight);
    expect(popoverMetrics.candidates.map((candidate) => candidate.text)).toEqual([
      'P1',
      'P2',
      'P3',
      'P4',
      'P5',
      'P6',
    ]);
    popoverMetrics.candidates.forEach((candidate) => {
      expect(candidate.hidden).toBe(false);
      expect(candidate.top).toBeGreaterThanOrEqual(0);
      expect(candidate.left).toBeGreaterThanOrEqual(0);
      expect(candidate.right).toBeLessThanOrEqual(popoverMetrics.viewportWidth);
      expect(candidate.bottom).toBeLessThanOrEqual(popoverMetrics.viewportHeight);
    });
  });
});
