import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { test, expect } from '@playwright/test';

import {
  commitLatestInputRow,
  gotoUiNext,
  selectSkillForPosition,
} from './ui-next-helpers.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const HP_KILL_FIXTURE_PATH = path.resolve(
  __dirname,
  './fixtures/ui_next_session_hp_kill_fixture.json'
);

async function waitForDeferredDamageGuide(page) {
  await page.waitForTimeout(2000);
}

async function loadHpKillFixture(page) {
  await gotoUiNext(page);
  await page.locator('#session-load-input').setInputFiles(HP_KILL_FIXTURE_PATH);
  await expect(page.locator('[data-turn-row][data-row-mode="input"]')).toBeVisible({ timeout: 10000 });
}

async function readHpFromRowEnemyPopup(row) {
  await row.locator('[data-role="enemy-detail-trigger"]').click();
  const popup = row.page().locator('.enemy-detail-popup-container');
  await expect(popup).toBeVisible({ timeout: 5000 });
  const hpRow = popup.locator('[data-role="enemy-popup-basic-info-row"]', { hasText: 'HP' });
  await expect(hpRow).toBeVisible({ timeout: 5000 });
  const value = await hpRow.locator('[data-role="enemy-popup-basic-info-value"]').textContent();
  await popup.locator('[data-role="popup-close"]').click();
  await expect(popup).not.toBeVisible({ timeout: 5000 });
  return value?.trim() ?? '';
}

test.describe('HP visibility', () => {
  test.setTimeout(60000);

  test('HP0 auto kill shows preview and committed HP kill chips without manual kill chip', async ({ page }) => {
    await loadHpKillFixture(page);
    await waitForDeferredDamageGuide(page);

    const inputRowBefore = page.locator('[data-turn-row][data-row-mode="input"]').last();
    await expect(await readHpFromRowEnemyPopup(inputRowBefore)).toMatch(/\/ 1$/);

    await selectSkillForPosition(page, 0, 46002102);
    await waitForDeferredDamageGuide(page);

    const inputRow = page.locator('[data-turn-row][data-row-mode="input"]').last();
    const previewChip = inputRow.locator('[data-role="hp-auto-kill-chip"][data-preview="true"]');
    await expect(previewChip.first()).toBeVisible({ timeout: 5000 });
    await expect(previewChip.first()).toContainText('予測:');
    await expect(previewChip.first()).toContainText('討伐 (HP)');

    const committedRow = await commitLatestInputRow(page);
    await waitForDeferredDamageGuide(page);

    await expect(committedRow.locator('[data-role="hp-auto-kill-chip"][data-preview="true"]')).toHaveCount(0);
    const committedChip = committedRow.locator('[data-role="hp-auto-kill-chip"]:not([data-preview])');
    await expect(committedChip.first()).toBeVisible({ timeout: 5000 });
    await expect(committedChip.first()).toContainText('討伐 (HP)');
    await expect(committedRow.locator('[data-role="kill-chip"]')).toHaveCount(0);

    const nextInputRow = page.locator('[data-turn-row][data-row-mode="input"]').last();
    await expect(await readHpFromRowEnemyPopup(nextInputRow)).toBe('0 / 1');
  });
});
