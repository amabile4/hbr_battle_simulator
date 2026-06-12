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

test.describe('HP visibility', () => {
  test.setTimeout(60000);

  test('HP0 auto kill shows preview and committed HP kill chips without manual kill chip', async ({ page }) => {
    await loadHpKillFixture(page);
    await waitForDeferredDamageGuide(page);

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
  });
});
