import { expect } from '@playwright/test';

export const PAGE_URL = '/ui-next/index.html';

export async function gotoUiNext(page) {
  await page.addInitScript(() => {
    window.localStorage.clear();
  });
  await page.goto(PAGE_URL);
  await page.waitForLoadState('domcontentloaded');
  await page.waitForSelector('[data-action="open-picker"]', { timeout: 10000 });
}

export async function fillPartySetupSlots(page, slotIndexes = [0, 1, 2, 3]) {
  const overlay = page.locator('#style-picker-overlay');

  for (const slotIndex of slotIndexes) {
    await page
      .locator(`[data-action="open-picker"][data-slot-index="${slotIndex}"][data-mode="main"]`)
      .click();
    await expect(overlay).toBeVisible({ timeout: 5000 });

    const section = page.locator('#picker-body .team-section').nth(slotIndex);
    await expect(section).toBeVisible({ timeout: 5000 });
    await section.locator('[data-style-id]').first().click();

    if (await overlay.isVisible()) {
      await page.locator('#picker-close').click();
      await expect(overlay).toBeHidden({ timeout: 5000 });
    }

    await expect(
      page.locator(`[data-slot="${slotIndex}"] [data-role="party-slot-main-button"] img`)
    ).toBeVisible({ timeout: 5000 });
  }
}

export async function fillPartySetupSlotsWithStyleIds(page, styleIds = []) {
  const overlay = page.locator('#style-picker-overlay');

  for (const [slotIndex, styleId] of styleIds.entries()) {
    await page
      .locator(`[data-action="open-picker"][data-slot-index="${slotIndex}"][data-mode="main"]`)
      .click();
    await expect(overlay).toBeVisible({ timeout: 5000 });

    const target = page.locator(`#picker-body [data-style-id="${styleId}"]`).first();
    await expect(target).toBeVisible({ timeout: 5000 });
    await target.click();

    if (await overlay.isVisible()) {
      await page.locator('#picker-close').click();
      await expect(overlay).toBeHidden({ timeout: 5000 });
    }

    await expect(
      page.locator(`[data-slot="${slotIndex}"] [data-role="party-slot-main-button"] img`)
    ).toBeVisible({ timeout: 5000 });
  }
}

export async function applyParty(page) {
  const applyButton = page.locator('[data-role="apply-btn"]');
  await expect(applyButton).toBeEnabled({ timeout: 5000 });
  await applyButton.click();

  const inputRow = page.locator('[data-turn-row][data-row-mode="input"]').last();
  await expect(inputRow).toBeVisible({ timeout: 5000 });
  return inputRow;
}

export async function selectSkillForPosition(page, position, skillId) {
  const inputRow = page.locator('[data-turn-row][data-row-mode="input"]').last();
  const select = inputRow.locator(`[data-skill-select][data-position="${position}"]`);
  await expect(select).toBeVisible({ timeout: 5000 });
  await select.selectOption(String(skillId));
  return inputRow;
}

export async function commitLatestInputRow(page) {
  const committedRows = page.locator('[data-turn-row][data-row-mode="committed"]');
  const committedBefore = await committedRows.count();
  const inputRow = page.locator('[data-turn-row][data-row-mode="input"]').last();
  const commitButton = inputRow.locator('[data-role="commit-btn"]');
  await expect(commitButton).toBeVisible({ timeout: 5000 });
  await commitButton.click();

  await expect(committedRows).toHaveCount(committedBefore + 1, { timeout: 5000 });
  await expect(page.locator('[data-turn-row][data-row-mode="input"]').last()).toBeVisible({ timeout: 5000 });
  return committedRows.last();
}

export async function getPartySetupSlotState(page, slotIndex) {
  const alt = await page
    .locator(`[data-slot="${slotIndex}"] [data-role="party-slot-main-button"] img`)
    .getAttribute('alt');
  const lb = await page
    .locator(`select[data-field="lb"][data-slot-index="${slotIndex}"]`)
    .inputValue();
  const drivePierce = await page
    .locator(`select[data-field="drivePierce"][data-slot-index="${slotIndex}"]`)
    .inputValue();
  return {
    alt,
    lb,
    drivePierce,
  };
}

export async function getTurnRowSlotAlt(row, position) {
  return row
    .locator(`[data-turn-slot][data-position="${position}"] [data-turn-slot-icon] img`)
    .getAttribute('alt');
}

export async function openPassiveLog(page) {
  const toggle = page.locator('#toggle-passive-log');
  await expect(toggle).toBeEnabled({ timeout: 10000 });
  await toggle.click();

  const pane = page.locator('#passive-log-pane');
  await expect(pane).toBeVisible({ timeout: 10000 });
  return pane;
}
