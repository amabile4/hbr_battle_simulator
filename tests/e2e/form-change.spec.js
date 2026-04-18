import { test, expect } from '@playwright/test';

import {
  applyParty,
  commitLatestInputRow,
  fillPartySetupSlotsWithStyleIds,
  gotoUiNext,
} from './ui-next-helpers.js';

const FORM_CHANGE_STYLE_IDS = [1001509, 1001101, 1001202, 1001301];
const KAREN_SKILL_ID = 46001522;
const KAREI_SKILL_ID = 46001523;

function leadIconFor(row) {
  return row.locator('[data-turn-slot][data-position="0"] [data-turn-slot-icon] img');
}

test.describe('Form change browser regression', () => {
  test('turn row keeps form icon and operation state in sync across toggles and commit', async ({ page }) => {
    await gotoUiNext(page);
    await fillPartySetupSlotsWithStyleIds(page, FORM_CHANGE_STYLE_IDS);
    await page.locator('select[data-field="lb"][data-slot-index="0"]').selectOption('4');
    await applyParty(page);

    let inputRow = page.locator('[data-turn-row][data-row-mode="input"]').last();
    await expect(leadIconFor(inputRow)).toHaveAttribute('src', /KAsakuraTwins_R3_Thumbnail\.webp$/);

    await inputRow.locator('[data-role="form-change-btn"][data-party-index="0"]').click();
    inputRow = page.locator('[data-turn-row][data-row-mode="input"]').last();
    await expect(leadIconFor(inputRow)).toHaveAttribute('src', /KAsakuraTwinsAnother_R3_Thumbnail\.webp$/);
    await expect(inputRow.locator('[data-role="operation-chip"]')).toContainText('フォーム: カレン');

    await inputRow.locator('[data-skill-select][data-position="0"]').selectOption(String(KAREI_SKILL_ID));
    inputRow = page.locator('[data-turn-row][data-row-mode="input"]').last();
    await expect(leadIconFor(inputRow)).toHaveAttribute('src', /KAsakuraTwins_R3_Thumbnail\.webp$/);
    await expect(inputRow.locator('[data-role="operation-chip"]')).toHaveCount(0);

    await inputRow.locator('[data-skill-select][data-position="0"]').selectOption(String(KAREN_SKILL_ID));
    inputRow = page.locator('[data-turn-row][data-row-mode="input"]').last();
    await expect(leadIconFor(inputRow)).toHaveAttribute('src', /KAsakuraTwinsAnother_R3_Thumbnail\.webp$/);
    await expect(inputRow.locator('[data-role="operation-chip"]')).toContainText('フォーム: カレン');

    const committedRow = await commitLatestInputRow(page);
    await expect(leadIconFor(committedRow)).toHaveAttribute('src', /KAsakuraTwinsAnother_R3_Thumbnail\.webp$/);

    inputRow = page.locator('[data-turn-row][data-row-mode="input"]').last();
    await expect(leadIconFor(inputRow)).toHaveAttribute('src', /KAsakuraTwinsAnother_R3_Thumbnail\.webp$/);

    await inputRow.locator('[data-skill-select][data-position="0"]').selectOption(String(KAREI_SKILL_ID));
    inputRow = page.locator('[data-turn-row][data-row-mode="input"]').last();
    await expect(leadIconFor(inputRow)).toHaveAttribute('src', /KAsakuraTwins_R3_Thumbnail\.webp$/);
  });

  test('char detail popup reflects current form in ability and passive tabs', async ({ page }) => {
    await gotoUiNext(page);
    await fillPartySetupSlotsWithStyleIds(page, FORM_CHANGE_STYLE_IDS);
    await page.locator('select[data-field="lb"][data-slot-index="0"]').selectOption('4');
    await applyParty(page);

    let inputRow = page.locator('[data-turn-row][data-row-mode="input"]').last();
    await inputRow.locator('[data-role="form-change-btn"][data-party-index="0"]').click();
    inputRow = page.locator('[data-turn-row][data-row-mode="input"]').last();

    const leadIcon = leadIconFor(inputRow);
    await expect(leadIcon).toBeVisible({ timeout: 5000 });
    await leadIcon.click({ button: 'right' });

    const popup = page.locator('#char-detail-popup');
    await expect(popup).toHaveClass(/open/);
    await expect(popup.locator('[data-role="char-popup-form-chip"]')).toContainText('フォーム: カレン');

    await popup.locator('.char-popup-tab[data-tab="ability"]').click();
    await expect(
      popup.locator('[data-role="char-popup-ability-entry"][data-passive-active="true"]').filter({
        hasText: '無差別な殺人鬼【カレン 専用】',
      })
    ).toHaveCount(1);
    await expect(
      popup.locator('[data-role="char-popup-ability-entry"][data-passive-active="false"]').filter({
        hasText: '仲間と共に【朝倉可憐 専用】',
      })
    ).toHaveCount(1);
    await expect(popup).toContainText('閃光');
    await expect(popup).not.toContainText('[Overdrive]');

    await popup.locator('.char-popup-tab[data-tab="passive"]').click();
    const passivePanel = popup.locator('[data-tab-panel="passive"]');
    await expect(passivePanel).toContainText('無差別な殺人鬼【カレン 専用】');
    await expect(passivePanel).toContainText('閃光');
    await expect(passivePanel).toContainText('貴様に託した【カレン 専用】');
    await expect(passivePanel).not.toContainText('仲間と共に【朝倉可憐 専用】');
  });
});
