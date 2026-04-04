import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { test, expect } from '@playwright/test';

import { gotoUiNext } from './ui-next-helpers.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const COUNT_WINS_FIXTURE_PATH = path.resolve(
  __dirname,
  './fixtures/ui_next_session_defenseup_count_only_fixture.json'
);
const ONLY_WINS_FIXTURE_PATH = path.resolve(
  __dirname,
  './fixtures/ui_next_session_defenseup_only_wins_fixture.json'
);

test.describe('DefenseUp Count/Only icon regression', () => {
  test('ui-next: fixture load shows two DefenseUp icons when Count sum beats Only', async ({ page }) => {
    await gotoUiNext(page);

    const sessionInput = page.locator('#session-load-input');
    await sessionInput.setInputFiles(COUNT_WINS_FIXTURE_PATH);

    const inputRow = page.locator('[data-turn-row][data-row-mode="input"]').last();
    await expect(inputRow).toBeVisible({ timeout: 10000 });

    const defenseUpIcons = inputRow.locator(
      '[data-turn-slot][data-position="0"] .buff-icon-list img[alt="DefenseUp"]'
    );
    await expect(defenseUpIcons).toHaveCount(2);
  });

  test('ui-next: fixture load shows one DefenseUp icon when Only is stronger than Count sum', async ({ page }) => {
    await gotoUiNext(page);

    const sessionInput = page.locator('#session-load-input');
    await sessionInput.setInputFiles(ONLY_WINS_FIXTURE_PATH);

    const inputRow = page.locator('[data-turn-row][data-row-mode="input"]').last();
    await expect(inputRow).toBeVisible({ timeout: 10000 });

    const defenseUpIcons = inputRow.locator(
      '[data-turn-slot][data-position="0"] .buff-icon-list img[alt="DefenseUp"]'
    );
    await expect(defenseUpIcons).toHaveCount(1);
  });
});
