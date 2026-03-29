import { test, expect } from '@playwright/test';

import {
  applyParty,
  commitLatestInputRow,
  fillPartySetupSlotsWithStyleIds,
  gotoUiNext,
  selectSkillForPosition,
} from './ui-next-helpers.js';

const TOJO_STYLE_IDS = [1001405, 1001101, 1001202, 1001301];
const TOJO_ATTACK_UP_SKILL_ID = 46001408;
const TOJO_ATTACK_SKILL_ID = 46001409;

test.describe('Count/Only buff consumption browser regression', () => {
  test('ui-next: Count型AttackUpが実操作で付与され、ダメージスキル実行後に消費される', async ({ page }) => {
    await gotoUiNext(page);
    await fillPartySetupSlotsWithStyleIds(page, TOJO_STYLE_IDS);
    await applyParty(page);

    await selectSkillForPosition(page, 0, TOJO_ATTACK_UP_SKILL_ID);
    await commitLatestInputRow(page);

    const rowAfterBuff = page.locator('[data-turn-row][data-row-mode="input"]').last();
    const buffIconsAfterBuff = rowAfterBuff.locator(
      '[data-turn-slot][data-position="0"] .buff-icon-list img[alt="AttackUp"]'
    );
    await expect
      .poll(async () => buffIconsAfterBuff.count(), { timeout: 5000 })
      .toBeGreaterThan(0);

    await selectSkillForPosition(page, 0, TOJO_ATTACK_SKILL_ID);
    await commitLatestInputRow(page);

    const rowAfterAttack = page.locator('[data-turn-row][data-row-mode="input"]').last();
    const buffIconsAfterAttack = rowAfterAttack.locator(
      '[data-turn-slot][data-position="0"] .buff-icon-list img[alt="AttackUp"]'
    );
    await expect(buffIconsAfterAttack).toHaveCount(0);
  });
});
