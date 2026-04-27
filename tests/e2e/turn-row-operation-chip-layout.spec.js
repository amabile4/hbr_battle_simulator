import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { test, expect } from '@playwright/test';

import { gotoUiNext } from './ui-next-helpers.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SESSION_FIXTURE_PATH = path.resolve(
  __dirname,
  './fixtures/ui_next_session_enemy_status_desc_fixture.json'
);

function collectChipMetrics(row) {
  const chips = [...row.querySelectorAll('[data-role="operation-chip"]')];
  return chips.map((node) => {
    return {
      text: node.textContent?.replace('×', '').trim() ?? '',
      hasLineBreak: /\n/.test(node.innerText),
      height: node.getBoundingClientRect().height,
      clientRectCount: node.getClientRects().length,
    };
  });
}

test.describe('Turn row operation chip layout', () => {
  test('keeps Makai Kihei and preemptive OD chips on a single line in committed rows', async ({ page }) => {
    await page.setViewportSize({ width: 1100, height: 900 });
    await gotoUiNext(page);
    await page.locator('#session-load-input').setInputFiles(SESSION_FIXTURE_PATH);

    const committedRows = page.locator('[data-turn-row][data-row-mode="committed"]');
    await expect(committedRows).toHaveCount(19, { timeout: 10000 });

    const firstCommittedRow = committedRows.nth(0);
    await firstCommittedRow.scrollIntoViewIfNeeded();
    await expect(firstCommittedRow.locator('[data-role="operation-chip"]').first()).toBeVisible();
    const makaiChipMetrics = await firstCommittedRow.evaluate(collectChipMetrics);
    expect(makaiChipMetrics.map((metric) => metric.text)).toEqual(['騎兵起動', '騎兵起動']);
    makaiChipMetrics.forEach((metric) => {
      expect(metric.hasLineBreak).toBe(false);
      expect(metric.clientRectCount).toBe(1);
      expect(metric.height).toBeLessThan(32);
    });

    const preemptiveOdRow = committedRows.nth(6);
    await preemptiveOdRow.scrollIntoViewIfNeeded();
    await expect(preemptiveOdRow.locator('[data-role="operation-chip"]').first()).toBeVisible();
    const preemptiveChipMetrics = await preemptiveOdRow.evaluate(collectChipMetrics);
    expect(preemptiveChipMetrics.map((metric) => metric.text)).toEqual(['先制OD1']);
    preemptiveChipMetrics.forEach((metric) => {
      expect(metric.hasLineBreak).toBe(false);
      expect(metric.clientRectCount).toBe(1);
      expect(metric.height).toBeLessThan(32);
    });
  });
});
