import { test, expect } from '@playwright/test';
import { fileURLToPath } from 'node:url';

import { gotoUiNext, openPassiveLog } from './ui-next-helpers.js';

const STAGE_SETUP_FIXTURE_PATH = fileURLToPath(
  new URL('../fixtures/ui_next_session_stage_setup_turn_start_fixture.json', import.meta.url)
);

async function readDownloadedJson(download) {
  const stream = await download.createReadStream();
  const chunks = [];
  for await (const chunk of stream) {
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf-8'));
}

test('session load/save keeps Stage Setup T1/T2 SP turn-start values', async ({ page }) => {
  await gotoUiNext(page);
  await page.locator('#session-load-input').setInputFiles(STAGE_SETUP_FIXTURE_PATH);

  await expect(page.locator('[data-turn-row][data-row-mode="committed"]')).toHaveCount(2, {
    timeout: 10000,
  });
  await expect(page.locator('#session-save-btn')).toBeVisible();

  const downloadPromise = page.waitForEvent('download');
  await page.locator('#session-save-btn').click();
  const download = await downloadPromise;
  const savedJson = await readDownloadedJson(download);

  expect(savedJson.replayScript.turns[0].info.spAtTurnStartByName).toEqual({
    '朝倉 可憐': 8,
    '命 吹雪': 9,
    '白河 ユイナ': 11,
    '茅森 月歌': 7,
    '柳 美音': 7,
    '豊後 弥生': 8,
  });
  expect(savedJson.replayScript.turns[1].info.spAtTurnStartByName).toEqual({
    '朝倉 可憐': 12,
    '命 吹雪': 14,
    '白河 ユイナ': 16,
    '茅森 月歌': 10,
    '柳 美音': 10,
    '豊後 弥生': 12,
  });
});

test('session load shows Stage Setup turn-start rows in passive log', async ({ page }) => {
  await gotoUiNext(page);
  await page.locator('#session-load-input').setInputFiles(STAGE_SETUP_FIXTURE_PATH);

  await expect(page.locator('[data-turn-row][data-row-mode="committed"]')).toHaveCount(2, {
    timeout: 10000,
  });

  const pane = await openPassiveLog(page);
  await expect(pane.locator('[data-role="passive-log-row"]', { hasText: 'T1：Stage Setup : 毎ターン前衛のSP+1' })).toHaveCount(1);
  await expect(pane.locator('[data-role="passive-log-row"]', { hasText: 'T2：Stage Setup : 毎ターン前衛のSP+1' })).toHaveCount(1);
});
