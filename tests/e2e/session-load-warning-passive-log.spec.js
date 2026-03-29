import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { test, expect } from '@playwright/test';

import { gotoUiNext, openPassiveLog } from './ui-next-helpers.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SESSION_FIXTURE_PATH = path.resolve(
  __dirname,
  './fixtures/ui_next_session_2026-03-29T04-34-22.739Z.json'
);

const EXPECTED_WARNING =
  'skill condition mismatch allowed: Skill 46001716 cannot be used because iuc_cond is not satisfied.';

test.describe('Session JSON load warning visibility', () => {
  test('JSON読込後にiuc_cond不一致WarningはPassiveLogへ表示しない', async ({ page }) => {
    await gotoUiNext(page);

    const sessionInput = page.locator('#session-load-input');
    await sessionInput.setInputFiles(SESSION_FIXTURE_PATH);

    await expect
      .poll(async () => page.locator('[data-turn-row][data-row-mode="committed"]').count(), {
        timeout: 10000,
      })
      .toBeGreaterThan(0);

    const pane = await openPassiveLog(page);
    const warningRows = pane.locator('[data-role="passive-log-row"][data-row-kind="warning"]');
    await expect(warningRows).toHaveCount(0);
    await expect(pane.locator('[data-role="passive-log-row"]', { hasText: EXPECTED_WARNING })).toHaveCount(0);
  });
});
