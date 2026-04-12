import { test, expect } from '@playwright/test';

import { DEFAULT_SUMMON_SAMPLE_ENEMY } from '../../src/data/enemy-sample-presets.js';
import {
  applyParty,
  commitLatestInputRow,
  fillPartySetupSlots,
  gotoUiNext,
  openEnemyPopupActionForRow,
} from './ui-next-helpers.js';

test.describe('Turn row summon enemy', () => {
  test('desktop keeps the full enemy info label and equal-width popup tabs', async ({ page }) => {
    await page.setViewportSize({ width: 1360, height: 960 });
    await gotoUiNext(page);
    await fillPartySetupSlots(page, [0, 1, 2, 3]);
    const inputRow = await applyParty(page);

    const label = inputRow.locator('.turn-info-enemy-button__label').first();
    await expect
      .poll(
        async () =>
          label.evaluate((node) =>
            getComputedStyle(node, '::before').content.replace(/^["']|["']$/g, '')
          ),
        { timeout: 5000 }
      )
      .toBe('敵情報確認');

    const triggerWidth = await inputRow
      .locator('[data-role="enemy-detail-trigger"]')
      .evaluate((node) => node.getBoundingClientRect().width);
    expect(triggerWidth).toBeGreaterThan(80);
    expect(triggerWidth).toBeLessThan(110);

    await inputRow.locator('[data-role="enemy-detail-trigger"]').click();
    const popup = page.locator('.enemy-detail-popup-container');
    await expect(popup).toBeVisible({ timeout: 5000 });
    await expect(popup.locator('[data-role="enemy-popup-layout"][data-layout-mode="narrow"]')).toBeVisible({ timeout: 5000 });
    await popup.locator('[data-role="enemy-popup-layout-option"][data-layout-preference="wide"]').click();
    await expect(popup.locator('[data-role="enemy-popup-layout"][data-layout-mode="wide"]')).toBeVisible({ timeout: 5000 });
    await expect(popup.locator('[data-role="enemy-popup-column"]')).toHaveCount(3);

    const tabWidths = await popup.locator('[data-role="enemy-popup-tab"]').evaluateAll((nodes) =>
      nodes.map((node) => node.getBoundingClientRect().width)
    );
    expect(tabWidths).toHaveLength(3);
    expect(Math.abs(tabWidths[0] - tabWidths[1])).toBeLessThan(2);
    expect(Math.abs(tabWidths[1] - tabWidths[2])).toBeLessThan(2);
  });

  test('manual summon adds the selected enemy to the committed enemy detail popup', async ({ page }) => {
    await page.setViewportSize({ width: 1360, height: 960 });
    await gotoUiNext(page);
    await fillPartySetupSlots(page, [0, 1, 2, 3]);
    const inputRow = await applyParty(page);

    const toolsBox = inputRow.locator('[data-role="enemy-tools-box"]');
    await expect(toolsBox).toBeVisible({ timeout: 5000 });
    const trigger = toolsBox.locator('[data-role="enemy-detail-trigger"]');
    await expect(trigger).toBeVisible({ timeout: 5000 });
    await trigger.click();

    const popup = page.locator('.enemy-detail-popup-container');
    await expect(popup).toBeVisible({ timeout: 5000 });
    await expect(popup.locator('[data-role="enemy-popup-layout"][data-layout-mode="narrow"]')).toBeVisible({ timeout: 5000 });
    await expect(popup.locator('[data-role="enemy-popup-column"]')).toHaveCount(1);
    // E1 is occupied — summon button must be disabled there
    const e1Summon = popup.locator('[data-role="enemy-popup-action"][data-action-type="summon"]');
    await expect(e1Summon).toBeVisible({ timeout: 5000 });
    await expect(e1Summon).toBeDisabled();
    // Switch to E2 tab (empty slot) where summon is allowed
    await popup.locator('[data-role="enemy-popup-tab"][data-enemy-tab-index="1"]').click();
    const summonAction = popup.locator('[data-role="enemy-popup-action"][data-action-type="summon"]');
    await expect(summonAction).toBeVisible({ timeout: 5000 });
    await expect(summonAction).toBeEnabled();
    await summonAction.click();

    const editor = inputRow.locator('[data-role="enemy-summon-editor"]');
    await expect(editor).toBeVisible({ timeout: 5000 });
    await expect(popup).toBeVisible({ timeout: 5000 });
    const popupBackground = await popup.evaluate((node) => getComputedStyle(node).backgroundColor);
    const editorBackground = await editor.evaluate((node) => getComputedStyle(node).backgroundColor);
    expect(editorBackground).toBe(popupBackground);
    await editor.locator('[data-role="enemy-summon-select"]').selectOption(String(DEFAULT_SUMMON_SAMPLE_ENEMY.id));
    await editor.locator('[data-role="enemy-summon-submit"]').click();
    await expect(inputRow.locator('[data-role="operation-chip"]')).toContainText('召喚', { timeout: 5000 });

    const committedRow = await commitLatestInputRow(page);

    const committedTrigger = committedRow.locator('[data-role="enemy-detail-trigger"]');
    await expect(committedTrigger).toBeVisible({ timeout: 5000 });
    await committedTrigger.click();

    const committedPopup = page.locator('.enemy-detail-popup-container');
    await expect(committedPopup).toBeVisible({ timeout: 5000 });
    await expect(committedPopup.locator('[data-role="enemy-popup-layout"][data-layout-mode="wide"]')).toBeVisible({ timeout: 5000 });
    await committedPopup.locator('[data-role="enemy-popup-layout-option"][data-layout-preference="narrow"]').click();
    await expect(committedPopup.locator('[data-role="enemy-popup-layout"][data-layout-mode="narrow"]')).toBeVisible({ timeout: 5000 });
    await committedPopup.locator('[data-role="enemy-popup-tab"][data-enemy-tab-index="1"]').click();
    const selectedColumn = committedPopup.locator('[data-role="enemy-popup-column"][data-selected="true"]');
    await expect(selectedColumn).toContainText(DEFAULT_SUMMON_SAMPLE_ENEMY.name);
    await expect(selectedColumn).not.toContainText('E2 未使用');
    await expect(selectedColumn).toContainText('耐性');
  });

  test('manual summon from a dead E1 keeps the summoned enemy in E1 on the next turn', async ({ page }) => {
    await page.setViewportSize({ width: 1360, height: 960 });
    await gotoUiNext(page);
    await fillPartySetupSlots(page, [0, 1, 2, 3]);
    const inputRow = await applyParty(page);

    await openEnemyPopupActionForRow(page, inputRow, 'kill', { enemyIndex: 0 });
    const killPopup = page.locator('.enemy-detail-popup-container');
    await expect(killPopup).toBeVisible({ timeout: 5000 });
    const singleToggle = killPopup.locator('[data-role="popup-kill-single-toggle"]').first();
    const multiToggle = killPopup.locator('[data-role="kill-enemy-candidate"]').first();
    if (await singleToggle.count()) {
      await singleToggle.click();
    } else {
      await multiToggle.click();
    }
    await expect(inputRow.locator('[data-role="kill-chip"]')).toContainText('討伐', { timeout: 5000 });
    await killPopup.locator('[data-role="popup-close"]').click();

    await commitLatestInputRow(page);
    const nextInputRow = page.locator('[data-turn-row][data-row-mode="input"]').last();
    await expect(nextInputRow).toBeVisible({ timeout: 5000 });

    await nextInputRow.locator('[data-role="enemy-detail-trigger"]').click();
    const summonPopup = page.locator('.enemy-detail-popup-container');
    await expect(summonPopup).toBeVisible({ timeout: 5000 });
    const summonAction = summonPopup.locator('[data-role="enemy-popup-action"][data-action-type="summon"]');
    await expect(summonAction).toBeVisible({ timeout: 5000 });
    await expect(summonAction).toBeEnabled();
    await summonAction.click();

    const editor = nextInputRow.locator('[data-role="enemy-summon-editor"]');
    await expect(editor).toBeVisible({ timeout: 5000 });
    await expect(editor).toContainText('配置先: E1');
    await editor.locator('[data-role="enemy-summon-select"]').selectOption(String(DEFAULT_SUMMON_SAMPLE_ENEMY.id));
    await editor.locator('[data-role="enemy-summon-submit"]').click();
    await expect(nextInputRow.locator('[data-role="operation-chip"]')).toContainText('召喚', { timeout: 5000 });

    const committedRow = await commitLatestInputRow(page);
    await committedRow.locator('[data-role="enemy-detail-trigger"]').click();
    const committedPopup = page.locator('.enemy-detail-popup-container');
    await expect(committedPopup).toBeVisible({ timeout: 5000 });
    await expect(committedPopup.locator('[data-role="enemy-popup-layout"][data-layout-mode="narrow"]')).toBeVisible({ timeout: 5000 });
    await expect(committedPopup.locator('[data-role="enemy-popup-column"][data-selected="true"]')).toContainText(
      DEFAULT_SUMMON_SAMPLE_ENEMY.name
    );
    await committedPopup.locator('[data-role="enemy-popup-tab"][data-enemy-tab-index="1"]').click();
    await expect(committedPopup.locator('[data-role="enemy-popup-column"][data-selected="true"]')).toContainText('E2 未使用');
  });

  test('enemy detail popup collapses to one selected column on narrow viewport', async ({ page }) => {
    await page.setViewportSize({ width: 720, height: 900 });
    await gotoUiNext(page);
    await fillPartySetupSlots(page, [0, 1, 2, 3]);
    const inputRow = await applyParty(page);

    await inputRow.locator('[data-role="enemy-detail-trigger"]').click();
    const popup = page.locator('.enemy-detail-popup-container');
    await expect(popup).toBeVisible({ timeout: 5000 });
    await expect(popup.locator('[data-role="enemy-popup-layout"][data-layout-mode="narrow"]')).toBeVisible({ timeout: 5000 });
    await expect(popup.locator('[data-role="enemy-popup-column"]')).toHaveCount(1);
    await expect(popup.locator('[data-role="enemy-popup-tab"]')).toHaveCount(3);
  });

  test('enemy detail popup forces one-column mode near the multi-column threshold even after summon', async ({ page }) => {
    await page.setViewportSize({ width: 1240, height: 900 });
    await gotoUiNext(page);
    await fillPartySetupSlots(page, [0, 1, 2, 3]);
    const inputRow = await applyParty(page);

    await inputRow.locator('[data-role="enemy-detail-trigger"]').click();
    const popup = page.locator('.enemy-detail-popup-container');
    await expect(popup).toBeVisible({ timeout: 5000 });
    await popup.locator('[data-role="enemy-popup-tab"][data-enemy-tab-index="1"]').click();
    await popup.locator('[data-role="enemy-popup-action"][data-action-type="summon"]').click();

    const editor = inputRow.locator('[data-role="enemy-summon-editor"]');
    await expect(editor).toBeVisible({ timeout: 5000 });
    await editor.locator('[data-role="enemy-summon-select"]').selectOption(String(DEFAULT_SUMMON_SAMPLE_ENEMY.id));
    await editor.locator('[data-role="enemy-summon-submit"]').click();
    const committedRow = await commitLatestInputRow(page);

    await committedRow.locator('[data-role="enemy-detail-trigger"]').click();
    const committedPopup = page.locator('.enemy-detail-popup-container');
    await expect(committedPopup).toBeVisible({ timeout: 5000 });
    await expect(committedPopup.locator('[data-role="enemy-popup-layout"][data-layout-mode="narrow"]')).toBeVisible({ timeout: 5000 });
    await expect(
      committedPopup.locator('[data-role="enemy-popup-layout-option"][data-layout-preference="wide"]')
    ).toBeDisabled();

    await committedPopup.locator('[data-role="enemy-popup-tab"][data-enemy-tab-index="1"]').click();
    await expect(committedPopup.locator('[data-role="enemy-popup-column"][data-selected="true"]')).toContainText(
      DEFAULT_SUMMON_SAMPLE_ENEMY.name
    );
  });
});
