import { test, expect } from '@playwright/test';

import {
  applyParty,
  commitLatestInputRow,
  fillPartySetupSlotsWithStyleIds,
  gotoUiNext,
  selectSkillForPosition,
} from './ui-next-helpers.js';

const FILLER_STYLE_IDS = [1001101, 1001202, 1001301];
const SUMOMO_STYLE_IDS = [1002307, ...FILLER_STYLE_IDS];
const KAREN_STYLE_IDS = [1001507, ...FILLER_STYLE_IDS];

const SUMOMO_EX_SKILL_ID = 46002310;
const KAREN_BUFF_SKILL_ID = 46001511;
const KAREN_EX_SKILL_ID = 46001512;

test.describe('DoubleActionExtraSkill browser regression', () => {
  test('Sumomo LB3 keeps EX double-cast active on the next EX as well', async ({ page }) => {
    await gotoUiNext(page);
    await fillPartySetupSlotsWithStyleIds(page, SUMOMO_STYLE_IDS);
    await page.locator('select[data-field="lb"][data-slot-index="0"]').selectOption('3');
    await applyParty(page);

    await selectSkillForPosition(page, 0, SUMOMO_EX_SKILL_ID);
    const committedRow1 = await commitLatestInputRow(page);
    await expect(
      committedRow1.locator('[data-turn-slot][data-position="0"] [data-role="repeat-indicator"]')
    ).toHaveText('x2');

    await selectSkillForPosition(page, 0, SUMOMO_EX_SKILL_ID);
    const committedRow2 = await commitLatestInputRow(page);
    await expect(
      committedRow2.locator('[data-turn-slot][data-position="0"] [data-role="repeat-indicator"]')
    ).toHaveText('x2');
  });

  test('Karen self-buff enables the next EX double-cast in ui-next', async ({ page }) => {
    await gotoUiNext(page);
    await fillPartySetupSlotsWithStyleIds(page, KAREN_STYLE_IDS);
    await applyParty(page);

    await selectSkillForPosition(page, 0, KAREN_BUFF_SKILL_ID);
    await commitLatestInputRow(page);

    await selectSkillForPosition(page, 0, KAREN_EX_SKILL_ID);
    const committedRow = await commitLatestInputRow(page);
    await expect(
      committedRow.locator('[data-turn-slot][data-position="0"] [data-role="repeat-indicator"]')
    ).toHaveText('x2');
  });
});
