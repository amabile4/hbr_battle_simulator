import { test, expect } from '@playwright/test';

import { DEFAULT_SUMMON_SAMPLE_ENEMY } from '../../src/data/enemy-sample-presets.js';
import {
  applyParty,
  commitLatestInputRow,
  fillPartySetupSlots,
  gotoUiNext,
  queueSummonEnemyForLatestInputRow,
} from './ui-next-helpers.js';

test.describe('Turn row summon enemy', () => {
  test('manual summon adds the selected enemy to the committed enemy detail popup', async ({ page }) => {
    await gotoUiNext(page);
    await fillPartySetupSlots(page, [0, 1, 2, 3]);
    await applyParty(page);

    await queueSummonEnemyForLatestInputRow(page, DEFAULT_SUMMON_SAMPLE_ENEMY.id);
    const committedRow = await commitLatestInputRow(page);

    const trigger = committedRow.locator('[data-role="enemy-detail-trigger"]');
    await expect(trigger).toBeVisible({ timeout: 5000 });
    await trigger.click();

    const popup = page.locator('.enemy-detail-popup-container');
    await expect(popup).toBeVisible({ timeout: 5000 });
    await expect(popup).toContainText(DEFAULT_SUMMON_SAMPLE_ENEMY.name);
    await expect(popup).toContainText('耐性');
  });
});
