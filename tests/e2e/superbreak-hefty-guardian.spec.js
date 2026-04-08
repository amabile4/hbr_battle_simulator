import { test, expect } from '@playwright/test';

import {
  applyParty,
  commitLatestInputRow,
  fillPartySetupSlotsWithStyleIds,
  gotoUiNext,
  openEnemyPopupActionForRow,
  selectSkillForPosition,
} from './ui-next-helpers.js';

const DESKTOP_VIEWPORT = Object.freeze({ width: 1360, height: 960 });
const HEFTY_GUARDIAN_PRESET_ID = 13490231;
const SUPERBREAK_STYLE_IDS = [1001101, 1001207, 1001501, 1001301];
const RUKA_NORMAL_ATTACK_SKILL_ID = 46001101;
const RUKA_BREAK_SKILL_ID = 46001102;
const YUKI_NORMAL_ATTACK_SKILL_ID = 46001201;
const YUKI_SUPERBREAK_SKILL_ID = 46001212;
const KAREN_NORMAL_ATTACK_SKILL_ID = 46001501;

async function configureEnemyPreset(page, enemyId) {
  await page.locator('[role="tab"][data-tab="enemy"]').click();
  const presetSelect = page.locator('#enemy-setup-root [data-action="select-enemy"]');
  await expect(presetSelect).toBeVisible({ timeout: 5000 });
  await presetSelect.selectOption(String(enemyId));
  await page.locator('[role="tab"][data-tab="party"]').click();
}

async function commitTurn(page, skillIdsByPosition) {
  for (const [position, skillId] of skillIdsByPosition.entries()) {
    await selectSkillForPosition(page, position, skillId);
  }
  return commitLatestInputRow(page);
}

async function queueManualBreakForLatestInputRow(page, { enemyIndex = 0, partyIndex = 0 } = {}) {
  const inputRow = page.locator('[data-turn-row][data-row-mode="input"]').last();
  await openEnemyPopupActionForRow(page, inputRow, 'break', { enemyIndex });

  const popup = page.locator('.enemy-detail-popup-container');
  await expect(popup).toBeVisible({ timeout: 5000 });

  const singleToggle = popup.locator(
    `[data-role="manual-break-single-toggle"][data-party-index="${partyIndex}"]`
  );
  const multiToggle = popup.locator(
    `[data-role="manual-break-candidate"][data-party-index="${partyIndex}"]`
  );

  if (await singleToggle.count()) {
    await expect(singleToggle).toBeVisible({ timeout: 5000 });
    await singleToggle.click();
  } else {
    await expect(multiToggle).toBeVisible({ timeout: 5000 });
    await multiToggle.click();
  }

  await expect(inputRow.locator('[data-role="manual-break-chip"]')).toContainText('ブレイク', {
    timeout: 5000,
  });
  await popup.locator('[data-role="popup-close"]').click();
  await expect(page.locator('.enemy-detail-popup-container')).toHaveCount(0, { timeout: 5000 });
  return inputRow;
}

async function openEnemyPopupForRow(page, row, enemyIndex = 0) {
  const trigger = row.locator('[data-role="enemy-detail-trigger"]');
  await expect(trigger).toBeVisible({ timeout: 5000 });
  await trigger.click();

  const popup = page.locator('.enemy-detail-popup-container');
  await expect(popup).toBeVisible({ timeout: 5000 });

  if (enemyIndex > 0) {
    const targetTab = popup.locator(
      `[data-role="enemy-popup-tab"][data-enemy-tab-index="${enemyIndex}"]`
    );
    await expect(targetTab).toBeVisible({ timeout: 5000 });
    await targetTab.click();
  }

  return popup;
}

function getEnemyPopupColumn(popup, enemyIndex = 0) {
  return popup.locator(`[data-role="enemy-popup-column"][data-enemy-tab-index="${enemyIndex}"]`);
}

async function expectEnemyMaxDRate(popup, enemyIndex, expectedValue) {
  const column = getEnemyPopupColumn(popup, enemyIndex);
  const row = column
    .locator('[data-role="enemy-popup-basic-info-row"]')
    .filter({ hasText: '最大D率' });
  await expect(row).toContainText(String(expectedValue), { timeout: 5000 });
}

async function expectSuperBreakStatus(popup, enemyIndex, expectedVisible) {
  const superBreak = getEnemyPopupColumn(popup, enemyIndex).locator(
    '[data-status-type="SuperBreak"]'
  );
  if (expectedVisible) {
    await expect(superBreak).toBeVisible({ timeout: 5000 });
    await expect(superBreak).toContainText('強ブレイク', { timeout: 5000 });
    await expect(superBreak.locator('img')).toHaveAttribute('src', /LightSuperBreak\.webp/, {
      timeout: 5000,
    });
    await expect(getEnemyPopupColumn(popup, enemyIndex)).not.toContainText('StrongBreak');
  } else {
    await expect(superBreak).toHaveCount(0);
  }
}

async function expectBreakPopupSemantics(popup, enemyIndex, { broken }) {
  const column = getEnemyPopupColumn(popup, enemyIndex);
  const stateRow = column
    .locator('[data-role="enemy-popup-basic-info-row"]')
    .filter({ hasText: '状態' });
  await expect(stateRow).toContainText(broken ? 'BREAK' : 'Alive', { timeout: 5000 });
  await expect(column.locator('[data-status-type="Break"]')).toHaveCount(0);
  await expect(
    column.locator('[data-role="enemy-popup-action"][data-action-type="break"]')
  ).toContainText('ブレイク付与', { timeout: 5000 });
}

async function closeEnemyPopup(page) {
  await page.locator('.enemy-detail-popup-container [data-role="popup-close"]').click();
  await expect(page.locator('.enemy-detail-popup-container')).toHaveCount(0, { timeout: 5000 });
}

async function setupHeftyGuardianBattle(page) {
  await page.setViewportSize(DESKTOP_VIEWPORT);
  await gotoUiNext(page);
  await configureEnemyPreset(page, HEFTY_GUARDIAN_PRESET_ID);
  await fillPartySetupSlotsWithStyleIds(page, SUPERBREAK_STYLE_IDS);
  return applyParty(page);
}

test.describe('SuperBreak on Hefty Guardian', () => {
  test('Break on turn 1 lets 光輝の夜明け upgrade the same enemy on turn 2', async ({ page }) => {
    await setupHeftyGuardianBattle(page);

    await queueManualBreakForLatestInputRow(page, { enemyIndex: 0, partyIndex: 0 });
    const turn1Row = await commitTurn(page, [
      RUKA_BREAK_SKILL_ID,
      YUKI_NORMAL_ATTACK_SKILL_ID,
      KAREN_NORMAL_ATTACK_SKILL_ID,
    ]);

    const turn1Popup = await openEnemyPopupForRow(page, turn1Row, 0);
    await expectSuperBreakStatus(turn1Popup, 0, false);
    await expectBreakPopupSemantics(turn1Popup, 0, { broken: true });
    await closeEnemyPopup(page);

    const turn2InputRow = page.locator('[data-turn-row][data-row-mode="input"]').last();
    const turn2InputPopup = await openEnemyPopupForRow(page, turn2InputRow, 0);
    await expectEnemyMaxDRate(turn2InputPopup, 0, 300);
    await expectSuperBreakStatus(turn2InputPopup, 0, false);
    await expectBreakPopupSemantics(turn2InputPopup, 0, { broken: true });
    await closeEnemyPopup(page);

    const turn2Row = await commitTurn(page, [
      RUKA_BREAK_SKILL_ID,
      YUKI_SUPERBREAK_SKILL_ID,
      KAREN_NORMAL_ATTACK_SKILL_ID,
    ]);

    const turn2Popup = await openEnemyPopupForRow(page, turn2Row, 0);
    await expectSuperBreakStatus(turn2Popup, 0, true);
    await expectBreakPopupSemantics(turn2Popup, 0, { broken: true });
    await closeEnemyPopup(page);

    const turn3InputRow = page.locator('[data-turn-row][data-row-mode="input"]').last();
    const turn3InputPopup = await openEnemyPopupForRow(page, turn3InputRow, 0);
    await expectEnemyMaxDRate(turn3InputPopup, 0, 600);
    await expectSuperBreakStatus(turn3InputPopup, 0, true);
    await expectBreakPopupSemantics(turn3InputPopup, 0, { broken: true });
  });

  test('Break and 光輝の夜明け in the same turn immediately produce SuperBreak', async ({ page }) => {
    await setupHeftyGuardianBattle(page);

    await queueManualBreakForLatestInputRow(page, { enemyIndex: 0, partyIndex: 0 });
    const turn1Row = await commitTurn(page, [
      RUKA_BREAK_SKILL_ID,
      YUKI_SUPERBREAK_SKILL_ID,
      KAREN_NORMAL_ATTACK_SKILL_ID,
    ]);

    const turn1Popup = await openEnemyPopupForRow(page, turn1Row, 0);
    await expectSuperBreakStatus(turn1Popup, 0, true);
    await expectBreakPopupSemantics(turn1Popup, 0, { broken: true });
    await closeEnemyPopup(page);

    const turn2InputRow = page.locator('[data-turn-row][data-row-mode="input"]').last();
    const turn2InputPopup = await openEnemyPopupForRow(page, turn2InputRow, 0);
    await expectEnemyMaxDRate(turn2InputPopup, 0, 600);
    await expectSuperBreakStatus(turn2InputPopup, 0, true);
    await expectBreakPopupSemantics(turn2InputPopup, 0, { broken: true });
  });

  test('光輝の夜明け immediately produces SuperBreak when the same action is marked as Break', async ({ page }) => {
    await setupHeftyGuardianBattle(page);
    await selectSkillForPosition(page, 0, RUKA_NORMAL_ATTACK_SKILL_ID);
    await selectSkillForPosition(page, 1, YUKI_SUPERBREAK_SKILL_ID);
    await selectSkillForPosition(page, 2, KAREN_NORMAL_ATTACK_SKILL_ID);
    await queueManualBreakForLatestInputRow(page, { enemyIndex: 0, partyIndex: 1 });

    const turn1Row = await commitLatestInputRow(page);

    const turn1Popup = await openEnemyPopupForRow(page, turn1Row, 0);
    await expectSuperBreakStatus(turn1Popup, 0, true);
    await expectBreakPopupSemantics(turn1Popup, 0, { broken: true });
    await closeEnemyPopup(page);

    const turn2InputRow = page.locator('[data-turn-row][data-row-mode="input"]').last();
    const turn2InputPopup = await openEnemyPopupForRow(page, turn2InputRow, 0);
    await expectEnemyMaxDRate(turn2InputPopup, 0, 600);
    await expectSuperBreakStatus(turn2InputPopup, 0, true);
    await expectBreakPopupSemantics(turn2InputPopup, 0, { broken: true });
  });
});
