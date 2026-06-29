import { test, expect } from '@playwright/test';

import {
  applyParty,
  commitLatestInputRow,
  fillPartySetupSlots,
  fillPartySetupSlotsWithStyleIds,
  gotoUiNext,
  openEnemyPopupActionForRow,
} from './ui-next-helpers.js';

const REPLAY_SETUP_ENTRY_TYPE_NORMAL_ATTACK_ELEMENTS = 'NormalAttackElementsByPartyIndex';

function getReplaySetupEntryPayload(json, type) {
  return (json?.replayScript?.setup?.setupEntries ?? []).find((entry) => entry?.type === type)?.payload ?? null;
}

async function readDownloadedJson(download) {
  const stream = await download.createReadStream();
  const chunks = [];
  for await (const chunk of stream) {
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf-8'));
}

async function ensureSetupVisible(page) {
  const applyButton = page.locator('[data-role="apply-btn"]');
  if (await applyButton.isVisible()) {
    return;
  }
  await page.locator('#toggle-setup').click();
  await expect(applyButton).toBeVisible({ timeout: 5000 });
}

test.describe('Session JSON save', () => {
  test('automatic template stats follow LB, preserve manual input, and freeze resolved replay values', async ({ page }) => {
    await gotoUiNext(page);
    await fillPartySetupSlotsWithStyleIds(page, [1001104, 1002103, 1003103]);

    const openMainStats = async () => {
      await page.locator('[data-action="open-stats-settings"][data-slot-index="0"][data-mode="main"]').click();
      const panel = page.locator('#stats-settings-panel');
      await expect(panel).toBeVisible();
      return panel;
    };
    let panel = await openMainStats();
    await expect(panel.locator('[data-stat="str"]')).toHaveValue('439');
    await panel.locator('[data-action="close-stats"]').click();

    const limitBreakSelect = page.locator('select[data-field="lb"][data-slot-index="0"]');
    await limitBreakSelect.selectOption('4');
    panel = await openMainStats();
    await expect(panel.locator('[data-stat="str"]')).toHaveValue('533');
    await panel.locator('[data-stat="str"]').fill('700');
    await panel.locator('[data-action="apply-stats"]').click();

    await limitBreakSelect.selectOption('0');
    panel = await openMainStats();
    await expect(panel.locator('[data-stat="str"]')).toHaveValue('700');
    await panel.locator('[data-action="reset-stats"]').click();
    panel = await openMainStats();
    await expect(panel.locator('[data-stat="str"]')).toHaveValue('439');
    await panel.locator('[data-action="close-stats"]').click();

    await limitBreakSelect.selectOption('4');
    await applyParty(page);
    const downloadPromise = page.waitForEvent('download');
    await page.locator('#session-save-btn').click();
    const savedJson = await readDownloadedJson(await downloadPromise);

    expect(savedJson.setup.statsByPartyIndex['0']).toBeUndefined();
    expect(savedJson.replayScript.setup.statsByPartyIndex['0'].stats.str).toBe(533);
  });

  test('Party stats edit drives damage calculator and survives session save/load', async ({ page }) => {
    await gotoUiNext(page);
    await fillPartySetupSlots(page, [0, 1, 2]);

    await page.locator('[data-action="open-stats-settings"][data-slot-index="0"][data-mode="main"]').click();
    const statsPanel = page.locator('#stats-settings-panel');
    await expect(statsPanel).toBeVisible();
    await statsPanel.locator('[data-stat="str"]').fill('700');
    await statsPanel.locator('[data-stat="dex"]').fill('710');
    await statsPanel.locator('[data-action="apply-stats"]').click();

    const inputRow = await applyParty(page);
    await inputRow.locator('[data-turn-slot-icon]').first().click({ button: 'right' });
    const charPopup = page.locator('#char-detail-popup');
    await expect(charPopup).toBeVisible();
    await charPopup.locator('.char-popup-tab[data-tab="damage"]').click();
    await expect(charPopup.locator('[data-role="damage-calc-stat-base"][data-stat="str"]').first()).toHaveText('700');
    await charPopup.locator('[data-role="char-popup-backdrop"]').click({ position: { x: 4, y: 4 } });
    await expect(charPopup).not.toHaveClass(/open/);

    const downloadPromise = page.waitForEvent('download');
    await page.locator('#session-save-btn').click();
    const download = await downloadPromise;
    const savedPath = await download.path();
    const savedJson = await readDownloadedJson(download);
    expect(savedJson.setup.statsByPartyIndex['0'].stats.str).toBe(700);
    expect(savedJson.replayScript.setup.statsByPartyIndex['0'].stats.dex).toBe(710);

    await gotoUiNext(page);
    await page.locator('#session-load-input').setInputFiles(String(savedPath));
    await ensureSetupVisible(page);
    await page.locator('[role="tab"][data-tab="party"]').click();
    await page.locator('[data-action="open-stats-settings"][data-slot-index="0"][data-mode="main"]').click();
    await expect(page.locator('#stats-settings-panel [data-stat="str"]')).toHaveValue('700');
    await expect(page.locator('#stats-settings-panel [data-stat="dex"]')).toHaveValue('710');
  });

  test('stage setup preset enchant summary persists across session save/load', async ({ page }) => {
    await gotoUiNext(page);
    await ensureSetupVisible(page);
    await fillPartySetupSlots(page, [0, 1, 2]);

    await page.locator('[role="tab"][data-tab="stage"]').click();
    const dimensionSelect = page.locator('[data-role="stage-dimension-battle"]');
    await expect(dimensionSelect).toBeEnabled({ timeout: 10000 });
    await dimensionSelect.selectOption('191000002');

    const satellite = page.locator('[data-role="stage-satellite-checkbox"]').nth(3);
    await satellite.check();
    await expect(page.locator('[data-role="stage-enchant-summary"] li')).toHaveText(['ODゲージ上昇量+20%']);

    await page.locator('[role="tab"][data-tab="party"]').click();
    await applyParty(page);

    const downloadPromise = page.waitForEvent('download');
    await page.locator('#session-save-btn').click();
    const download = await downloadPromise;
    const savedPath = await download.path();
    expect(savedPath).toBeTruthy();

    await gotoUiNext(page);
    await page.locator('#session-load-input').setInputFiles(String(savedPath));
    await ensureSetupVisible(page);
    await page.locator('[role="tab"][data-tab="stage"]').click();
    await expect(page.locator('[data-role="stage-dimension-battle"]')).toHaveValue('191000002');
    await expect(page.locator('[data-role="stage-enchant-summary"] li')).toHaveText(['ODゲージ上昇量+20%']);
  });

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
    const json = await readDownloadedJson(download);

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

  test('saves bracelet selection into both top-level setup and replayScript.setup entries', async ({ page }) => {
    await gotoUiNext(page);
    await fillPartySetupSlots(page, [0, 1, 2]);
    await page.locator('select[data-field="belt"][data-slot-index="0"]').selectOption('Ice');
    await applyParty(page);

    const downloadPromise = page.waitForEvent('download');
    await page.locator('#session-save-btn').click();
    const download = await downloadPromise;
    const json = await readDownloadedJson(download);

    expect(json.setup.normalAttackElementsByPartyIndex).toEqual({ 0: ['Ice'] });
    expect(getReplaySetupEntryPayload(json, REPLAY_SETUP_ENTRY_TYPE_NORMAL_ATTACK_ELEMENTS)).toEqual({
      0: ['Ice'],
    });
  });

  test('re-saving after party setup bracelet changes keeps replay setup entry synced to current setup', async ({ page }) => {
    await gotoUiNext(page);
    await fillPartySetupSlots(page, [0, 1, 2]);
    await page.locator('select[data-field="belt"][data-slot-index="0"]').selectOption('Fire');
    await applyParty(page);
    await commitLatestInputRow(page);

    await ensureSetupVisible(page);
    await page.locator('select[data-field="belt"][data-slot-index="0"]').selectOption('Dark');
    await applyParty(page);

    const downloadPromise = page.waitForEvent('download');
    await page.locator('#session-save-btn').click();
    const download = await downloadPromise;
    const json = await readDownloadedJson(download);

    expect(json.setup.normalAttackElementsByPartyIndex).toEqual({ 0: ['Dark'] });
    expect(getReplaySetupEntryPayload(json, REPLAY_SETUP_ENTRY_TYPE_NORMAL_ATTACK_ELEMENTS)).toEqual({
      0: ['Dark'],
    });
  });

  test('saves canonical replay action input fields and reloads them without legacy overrideEntries', async ({ page }) => {
    await gotoUiNext(page);
    await fillPartySetupSlots(page, [0, 1, 2, 3]);
    const inputRow = await applyParty(page);

    await inputRow.locator('[data-role="follow-up-toggle"]').click();
    await expect(inputRow.locator('[data-role="follow-up-editor"]')).toBeVisible({ timeout: 5000 });
    await inputRow.locator('[data-role="follow-up-enemy-candidate"]').first().click();

    await openEnemyPopupActionForRow(page, inputRow, 'break', { enemyIndex: 0 });
    const popup = page.locator('.enemy-detail-popup-container');
    const singleToggle = popup.locator('[data-role="manual-break-single-toggle"]').first();
    if (await singleToggle.count()) {
      await singleToggle.click();
    } else {
      await popup.locator('[data-role="manual-break-candidate"]').first().click();
    }
    await popup.locator('[data-role="popup-close"]').click();

    const committedRow = await commitLatestInputRow(page);
    await expect(committedRow.locator('[data-role="manual-break-chip"]')).toHaveCount(1, { timeout: 5000 });
    await expect(committedRow.locator('[data-role="follow-up-chip"]')).toHaveCount(1, { timeout: 5000 });

    const downloadPromise = page.waitForEvent('download');
    await page.locator('#session-save-btn').click();
    const download = await downloadPromise;
    const savedJson = await readDownloadedJson(download);
    const savedPath = await download.path();
    expect(savedPath).toBeTruthy();

    expect(savedJson.replayScript.turns[0].actionOutcomeOverrides).toEqual([
      { position: 0, outcome: 'Break', enemyIndexes: [0] },
    ]);
    expect(savedJson.replayScript.turns[0].followUpOverrides).toEqual([
      { position: 3, enemyIndex: 0 },
    ]);
    expect(
      (savedJson.replayScript.turns[0].overrideEntries ?? []).map((entry) => entry.type)
    ).not.toContain('ActionOutcomeOverrides');
    expect(
      (savedJson.replayScript.turns[0].overrideEntries ?? []).map((entry) => entry.type)
    ).not.toContain('FollowUpOverrides');

    await gotoUiNext(page);
    await page.locator('#session-load-input').setInputFiles(savedPath);
    const reloadedCommittedRow = page.locator('[data-turn-row][data-row-mode="committed"]').first();
    await expect(reloadedCommittedRow).toBeVisible({ timeout: 5000 });
    await expect(reloadedCommittedRow.locator('[data-role="manual-break-chip"]')).toHaveCount(1, {
      timeout: 5000,
    });
    await expect(reloadedCommittedRow.locator('[data-role="follow-up-chip"]')).toHaveCount(1, {
      timeout: 5000,
    });
  });
});
