import { test, expect, devices } from '@playwright/test';

import { getLatestDownloadedSessionPath, gotoUiNext } from './ui-next-helpers.js';

const MOBILE_DEVICE_NAMES = ['iPhone SE', 'iPhone 15 Pro'];
const PRIMARY_TURN_POSITION = 0;

async function pickDistinctMainStylesWithTap(page, slotCount) {
  const overlay = page.locator('#style-picker-overlay');
  const pickerBody = page.locator('#picker-body');
  const modeLabel = page.locator('#picker-mode-label');

  for (let slotIndex = 0; slotIndex < slotCount; slotIndex += 1) {
    if (slotIndex === 0) {
      await page
        .locator(`[data-action="open-picker"][data-slot-index="${slotIndex}"][data-mode="main"]`)
        .tap();
      await expect(overlay).toBeVisible({ timeout: 5000 });
      await expect(modeLabel).toContainText(`スロット${slotIndex + 1}`);
    }

    const section = pickerBody.locator('.team-section').nth(slotIndex);
    await expect(section).toBeVisible({ timeout: 5000 });
    const card = section.locator('[data-style-id]').first();
    await expect(card).toBeVisible({ timeout: 5000 });
    await card.evaluate((node) => node.scrollIntoView({ block: 'center', inline: 'nearest' }));
    await page.waitForTimeout(100);
    await card.dispatchEvent('pointerdown', {
      bubbles: true,
      pointerType: 'touch',
      isPrimary: true,
    });
    await card.dispatchEvent('pointerup', {
      bubbles: true,
      pointerType: 'touch',
      isPrimary: true,
    });

    if (slotIndex < slotCount - 1) {
      await expect(modeLabel).toContainText(`スロット${slotIndex + 2}`, { timeout: 5000 });
    }
  }
}

for (const deviceName of MOBILE_DEVICE_NAMES) {
  test(`supports touch-only party setup into battle start (${deviceName})`, async ({ browser }) => {
    const context = await browser.newContext(devices[deviceName]);
    const page = await context.newPage();

    try {
      await gotoUiNext(page);
      await pickDistinctMainStylesWithTap(page, 3);

      const pickerClose = page.locator('#picker-close');
      await expect(pickerClose).toBeVisible({ timeout: 5000 });
      await pickerClose.tap();
      await expect(page.locator('#style-picker-overlay.hidden')).toHaveCount(1);

      const applyButton = page.locator('[data-role="apply-btn"]');
      await expect(applyButton).toBeEnabled({ timeout: 5000 });
      await applyButton.tap();

      const inputRow = page.locator('[data-turn-row][data-row-mode="input"]').last();
      await expect(inputRow).toBeVisible({ timeout: 5000 });

      const frontIcons = inputRow.locator('[data-turn-front-group] [data-turn-slot-icon] img');
      await expect(frontIcons).toHaveCount(3);
    } finally {
      await context.close();
    }
  });

  test(`supports tap-driven turn editing on mobile (${deviceName})`, async ({ browser }) => {
    const context = await browser.newContext(devices[deviceName]);
    const page = await context.newPage();

    try {
      await gotoUiNext(page);
      await page.locator('#session-load-input').setInputFiles(getLatestDownloadedSessionPath());

      const inputRow = page.locator('[data-turn-row][data-row-mode="input"]').last();
      await expect(inputRow).toBeVisible({ timeout: 15000 });

      const skillSelect = inputRow.locator(
        `[data-skill-select][data-position="${PRIMARY_TURN_POSITION}"]`
      );
      await expect(skillSelect).toBeVisible({ timeout: 5000 });
      await skillSelect.tap();
      await expect(skillSelect).toBeFocused();
      await expect(page.locator('#char-detail-popup.open')).toHaveCount(0);
      await expect(inputRow.locator('.ring-amber-400')).toHaveCount(0);

      const skillValue = await skillSelect.evaluate((select) => {
        const options = [...select.options].filter((option) => option.value && !option.disabled);
        return options[0]?.value ?? '';
      });
      expect(skillValue).not.toBe('');
      await skillSelect.selectOption(skillValue);

      const committedRows = page.locator('[data-turn-row][data-row-mode="committed"]');
      const committedBefore = await committedRows.count();
      await inputRow.locator('[data-role="commit-btn"]').tap();
      await expect(committedRows).toHaveCount(committedBefore + 1, { timeout: 5000 });

      const nextInputRow = page.locator('[data-turn-row][data-row-mode="input"]').last();
      const enemyTrigger = nextInputRow.locator('[data-role="enemy-detail-trigger"]');
      await expect(enemyTrigger).toBeVisible({ timeout: 5000 });
      await enemyTrigger.tap();

      const enemyPopup = page.locator('.enemy-detail-popup-container');
      await expect(enemyPopup).toBeVisible({ timeout: 5000 });
      await page.locator('[data-role="popup-close"]').tap();
      await expect(enemyPopup).toHaveCount(0);

      const usedSkillsToggle = page.locator('#toggle-used-skills');
      await expect(usedSkillsToggle).toBeEnabled({ timeout: 5000 });
      await usedSkillsToggle.tap();
      await expect(page.locator('#used-skills-overlay:not(.hidden)')).toBeVisible({ timeout: 5000 });
      await page.locator('[data-role="used-skills-close"]').tap();
      await expect(page.locator('#used-skills-overlay:not(.hidden)')).toHaveCount(0);
    } finally {
      await context.close();
    }
  });
}
