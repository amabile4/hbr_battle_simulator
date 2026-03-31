import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { test, expect } from '@playwright/test';

import { gotoUiNext } from './ui-next-helpers.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SESSION_FIXTURE_PATH = path.resolve(
  __dirname,
  './fixtures/ui_next_session_2026-03-30T07-28-15.502Z.json'
);

test.describe('Kokushipmusoujou additional-turn regression', () => {
  test('国士無双実行後に次の入力行はEXになる', async ({ page }) => {
    await gotoUiNext(page);

    const sessionInput = page.locator('#session-load-input');
    await sessionInput.setInputFiles(SESSION_FIXTURE_PATH);

    const committedRows = page.locator('[data-turn-row][data-row-mode="committed"]');
    await expect(committedRows).toHaveCount(4, { timeout: 10000 });

    const lastCommittedRow = committedRows.nth(3);
    await expect(lastCommittedRow).toContainText('国士無双');

    const currentInputRow = page.locator('[data-turn-row][data-row-mode="input"]').last();
    await expect(currentInputRow.locator('.turn-info-marker-ex')).toHaveText('EX');
  });
});
