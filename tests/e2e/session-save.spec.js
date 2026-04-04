import { test, expect } from '@playwright/test';

import {
  applyParty,
  fillPartySetupSlots,
  gotoUiNext,
} from './ui-next-helpers.js';

test.describe('Session JSON save', () => {
  test('saves JSON with 4 selected characters after apply', async ({ page }) => {
    await gotoUiNext(page);
    await fillPartySetupSlots(page, [0, 1, 2, 3]);
    await applyParty(page);

    // intercept the download triggered by the save button
    const downloadPromise = page.waitForEvent('download');
    await page.locator('#session-save-btn').click();
    const download = await downloadPromise;

    // verify filename pattern
    expect(download.suggestedFilename()).toMatch(
      /^ui_next_session_\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}\.\d{3}\+09-00\.json$/
    );

    // read and parse the downloaded JSON
    const stream = await download.createReadStream();
    const chunks = [];
    for await (const chunk of stream) {
      chunks.push(chunk);
    }
    const json = JSON.parse(Buffer.concat(chunks).toString('utf-8'));

    // verify structure
    expect(json).toHaveProperty('version', 1);
    expect(json).toHaveProperty('setup');
    expect(json.setup).toHaveProperty('styleIds');
    expect(json.setup.styleIds).toHaveLength(6);

    // first 4 slots should have non-null styleIds (characters were selected)
    for (let i = 0; i < 4; i++) {
      expect(json.setup.styleIds[i], `slot ${i} should have a styleId`).not.toBeNull();
      expect(typeof json.setup.styleIds[i]).toBe('number');
    }
    // all 4 should be distinct characters
    const filledIds = json.setup.styleIds.slice(0, 4);
    expect(new Set(filledIds).size).toBe(4);

    // slots 4-5 should not be filled (null or 0)
    for (let i = 4; i < 6; i++) {
      expect(json.setup.styleIds[i] || null, `slot ${i} should not have a character`).toBeNull();
    }

    // replay script should be present with setup referencing the same styleIds
    expect(json).toHaveProperty('replayScript');
    expect(json.replayScript).toHaveProperty('setup');
    const replayStyleIds = json.replayScript.setup.styleIds;
    for (let i = 0; i < 4; i++) {
      expect(replayStyleIds[i]).toBe(json.setup.styleIds[i]);
    }
  });
});
