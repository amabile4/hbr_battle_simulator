import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { test, expect } from '@playwright/test';

import { gotoUiNext } from './ui-next-helpers.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SESSION_FIXTURE_PATH = path.resolve(
  __dirname,
  './fixtures/ui_next_session_2026-04-01T15-30-26.076Z.json'
);

test.describe('Yuki Code Darkness SP order regression', () => {
  test('JSON読込後の#4行で和泉ユキSP表示がpost-costの7を維持し、再保存でも値が変質しない', async ({ page }) => {
    await gotoUiNext(page);

    const sessionInput = page.locator('#session-load-input');
    await sessionInput.setInputFiles(SESSION_FIXTURE_PATH);

    const committedRows = page.locator('[data-turn-row][data-row-mode="committed"]');
    await expect(committedRows).toHaveCount(6, { timeout: 10000 });

    const row4 = committedRows.nth(3);
    const yukiSlotInRow4 = row4.locator('[data-turn-slot]:has(img[alt="傍らのプリンセス"])');
    await expect(yukiSlotInRow4.locator('[data-sp-badge]')).toHaveText('7');

    const downloadPromise = page.waitForEvent('download');
    await page.locator('#session-save-btn').click();
    const download = await downloadPromise;

    const stream = await download.createReadStream();
    const chunks = [];
    for await (const chunk of stream) {
      chunks.push(chunk);
    }
    const json = JSON.parse(Buffer.concat(chunks).toString('utf-8'));

    const turn4 = json?.replayScript?.turns?.[3];
    const turn5 = json?.replayScript?.turns?.[4];

    expect(turn4?.info?.spAtTurnStartByName?.['和泉 ユキ']).toBe(21);
    expect(turn4?.info?.spAtActionStartByName?.['和泉 ユキ']).toBe(7);
    expect(turn5?.info?.spAtTurnStartByName?.['和泉 ユキ']).toBe(16);
  });
});
