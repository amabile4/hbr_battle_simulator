import { test, expect, devices } from '@playwright/test';

import { getLatestDownloadedSessionPath, gotoUiNext } from './ui-next-helpers.js';

const MOBILE_DEVICE_NAMES = ['iPhone SE', 'iPhone 15 Pro'];
const PRIMARY_TURN_POSITION = 0;

for (const deviceName of MOBILE_DEVICE_NAMES) {
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
