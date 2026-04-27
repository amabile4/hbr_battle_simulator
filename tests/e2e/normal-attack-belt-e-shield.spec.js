import { test, expect } from '@playwright/test';

import {
  applyParty,
  fillPartySetupSlots,
  gotoUiNext,
  selectEnemyPresetForActiveSlot,
} from './ui-next-helpers.js';

const KALEIDO_OUROBOROS_PRESET_ID = 13450815;
const MATCHING_BELT_VALUE = 'Fire';
const NON_MATCHING_BELT_VALUE = 'Thunder';

async function configureBraceletSampleSetup(page, beltValue) {
  await gotoUiNext(page);
  await fillPartySetupSlots(page, [0, 1, 2]);
  await page.locator('select[data-field="belt"][data-slot-index="0"]').selectOption(beltValue);

  await page.locator('[role="tab"][data-tab="enemy"]').click();
  await selectEnemyPresetForActiveSlot(page, KALEIDO_OUROBOROS_PRESET_ID);
  await page.locator('[role="tab"][data-tab="party"]').click();
}

async function readSelectedEnemyEShieldGauge(page, row) {
  await row.locator('[data-role="enemy-detail-trigger"]').click();

  const popup = page.locator('.enemy-detail-popup-container');
  await expect(popup).toBeVisible({ timeout: 5000 });

  const selectedColumn = popup.locator('[data-role="enemy-popup-column"][data-selected="true"]');
  const summary = selectedColumn.locator('[data-role="enemy-popup-e-shield-summary"]');
  await expect(summary).toHaveCount(1, { timeout: 5000 });

  const text = await summary.innerText();
  const match = text.match(/(\d+)\s*\/\s*(\d+)/);
  expect(match, `failed to parse E-shield gauge from: ${text}`).not.toBeNull();

  await popup.locator('[data-role="popup-close"]').click();
  await expect(popup).toHaveCount(0, { timeout: 5000 });

  return {
    current: Number(match[1]),
    max: Number(match[2]),
  };
}

async function ensureSetupVisible(page) {
  const applyButton = page.locator('[data-role="apply-btn"]');
  if (await applyButton.isVisible()) {
    return;
  }
  await page.locator('#toggle-setup').click();
  await expect(applyButton).toBeVisible({ timeout: 5000 });
}

test.describe('Normal attack bracelet Eシールド integration', () => {
  test('matching bracelet element makes normal attack consume Eシールド in preview', async ({ page }) => {
    await configureBraceletSampleSetup(page, MATCHING_BELT_VALUE);
    const inputRow = await applyParty(page);

    const previewGauge = await readSelectedEnemyEShieldGauge(page, inputRow);
    expect(previewGauge.max).toBe(30);
    expect(previewGauge.current).toBeLessThan(30);
  });

  test('non-matching bracelet element keeps Eシールド unchanged in preview', async ({ page }) => {
    await configureBraceletSampleSetup(page, NON_MATCHING_BELT_VALUE);
    const inputRow = await applyParty(page);

    const previewGauge = await readSelectedEnemyEShieldGauge(page, inputRow);
    expect(previewGauge).toEqual({ current: 30, max: 30 });
  });

  test('session save/load restores bracelet selector and keeps Eシールド preview behavior', async ({ page }) => {
    await configureBraceletSampleSetup(page, MATCHING_BELT_VALUE);

    const downloadPromise = page.waitForEvent('download');
    await page.locator('#session-save-btn').click();
    const download = await downloadPromise;
    const sessionPath = await download.path();
    expect(sessionPath).not.toBeNull();

    await gotoUiNext(page);
    await page.locator('#session-load-input').setInputFiles(String(sessionPath));
    await expect(page.locator('select[data-field="belt"][data-slot-index="0"]')).toHaveValue(MATCHING_BELT_VALUE);
    await ensureSetupVisible(page);

    const inputRow = await applyParty(page);
    const previewGauge = await readSelectedEnemyEShieldGauge(page, inputRow);
    expect(previewGauge.current).toBeLessThan(30);
  });
});
