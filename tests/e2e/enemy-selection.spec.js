/**
 * Enemy Selection UI E2E Test
 *
 * 確認内容 (Verify):
 * 1. Enemy Setup configuration mode toggle (Simple vs Detailed).
 * 2. Enemy Count generic selector (1-3) appears in the Turn Row (uncommitted).
 * 3. Individual skill target selector (1-3) appears next to attack skills when Detailed Mode is ON,
 *    and does not appear when Simple Mode is ON.
 */
import { test, expect } from '@playwright/test';

const PAGE_URL = '/ui-next/index.html';

/**
 * Helper to setup the party and press "Apply" (戦闘開始)
 */
async function setupPartyAndStart(page) {
  // Wait for the open-picker buttons
  await page.waitForSelector('[data-action="open-picker"]', { timeout: 10000 });

  // Select the first style for the first 3 front slots
  for (let i = 0; i < 3; i++) {
    const openBtn = page.locator(`[data-action="open-picker"][data-slot-index="${i}"][data-mode="main"]`).first();
    if (!(await openBtn.isVisible())) continue;
    await openBtn.click();
    await page.waitForSelector('#style-picker-overlay:not(.hidden)', { timeout: 5000 });
    const targetSection = page.locator('#picker-body .team-section').nth(i);
    await targetSection.waitFor({ timeout: 5000 });
    const firstCard = targetSection.locator('[data-style-id]').first();
    await firstCard.click();
    await page.waitForSelector('#style-picker-overlay.hidden', { timeout: 3000 }).catch(() => {});
  }

  // Click Apply Button
  const applyBtn = page.locator('[data-role="apply-btn"]');
  await expect(applyBtn).toBeEnabled({ timeout: 5000 });
  await applyBtn.click();

  // Wait for Turn Area to appear
  await page.waitForSelector('select[data-skill-select]', { timeout: 5000 });
}

test.describe('Enemy Selection UI', () => {

  test.beforeEach(async ({ page }) => {
    await page.goto(PAGE_URL);
  });

  test('Target selection mode toggle exists in Enemy Setup tab', async ({ page }) => {
    // Click on Enemy Setup tab
    const enemyTab = page.locator('button[data-tab="enemy"]');
    await enemyTab.click();

    // Verify toggle for target selection mode (Detailed vs Simple) exists
    // The implementation should provide a checkbox/radio/select with data-role="enemy-selection-mode"
    const targetModeToggle = page.locator('[data-role="enemy-selection-mode"]');
    await expect(targetModeToggle).toBeVisible();
  });

  test('Turn row includes Enemy Count selector (1 to 3)', async ({ page }) => {
    await setupPartyAndStart(page);

    // After applying party, the uncommitted turn row should show Enemy Count
    // Implementation should provide a select with data-role="enemy-count"
    const enemyCountSelect = page.locator('[data-role="enemy-count"]');
    await expect(enemyCountSelect).toBeVisible();
    
    // Default should be 1
    await expect(enemyCountSelect).toHaveValue('1');

    // Should contain options 1, 2, 3
    const options = await enemyCountSelect.locator('option').allTextContents();
    expect(options).toContain('1');
    expect(options).toContain('2');
    expect(options).toContain('3');

    // Change to 3
    await enemyCountSelect.selectOption('3');
    await expect(enemyCountSelect).toHaveValue('3');

    // Commit turn and verify next turn inherits '3'
    const commitBtn = page.locator('button[data-role="commit-btn"]').last();
    await commitBtn.click();
    
    // Wait for the new uncommitted row (T2)
    await page.waitForSelector('select[data-role="enemy-count"]:not([disabled])', { timeout: 5000 });
    const nextEnemyCountSelect = page.locator('select[data-role="enemy-count"]').last();
    await expect(nextEnemyCountSelect).toBeVisible();
    await expect(nextEnemyCountSelect).toHaveValue('3');
  });

  test('Detailed Mode: Attack skill allows selecting target (1-3)', async ({ page }) => {
    // 1. Go to Enemy Setup, toggle to Detailed Mode
    const enemyTab = page.locator('button[data-tab="enemy"]');
    await enemyTab.click();
    
    const targetModeToggle = page.locator('[data-role="enemy-selection-mode"]');
    // Assuming it's a checkbox or radio to enable Detailed mode. 
    // Wait for Codex implementation convention, but let's assert checking/selecting 'detailed'
    // If it's a select:
    if (await targetModeToggle.evaluate(el => el.tagName === 'SELECT')) {
      await targetModeToggle.selectOption('detailed');
    } else {
      // Checkbox case
      await targetModeToggle.check();
    }

    // 2. Setup party and start
    // Need to go back to Party tab to apply, or setupPartyAndStart will click through
    const partyTab = page.locator('button[data-tab="party"]');
    await partyTab.click();
    await setupPartyAndStart(page);

    // 3. Set Enemy Count to 3
    const enemyCountSelect = page.locator('[data-role="enemy-count"]');
    await enemyCountSelect.selectOption('3');

    // 4. Select an attack skill and verify target selector appears
    // We assume the first character's first skill is an attack skill or can select one.
    const skillSelect = page.locator('select[data-skill-select]').first();
    
    // There should be a target selector next to it: data-role="target-select"
    // Since we are targeting position 0:
    const targetSelect = page.locator('[data-role="target-select"][data-position="0"]');
    await expect(targetSelect).toBeVisible();

    // The target options should be 1, 2, 3 (since enemy count is 3)
    const options = await targetSelect.locator('option').allTextContents();
    // Assuming UI display text is like "1", "2", "3" or "Enemy 1"...
    // We just check that there are 3 valid target options
    expect(options.length).toBeGreaterThanOrEqual(3);
    
    // Select target 2 (index 1 is value '1' for Enemy 2)
    await targetSelect.selectOption({ index: 1 }); // 2nd option
    await expect(targetSelect).toHaveValue('1');
  });

  test('Simple Mode: Attack skill does NOT show target selector', async ({ page }) => {
    // 1. Go to Enemy Setup, toggle to Simple Mode (should be default or set it explicitly)
    const enemyTab = page.locator('button[data-tab="enemy"]');
    await enemyTab.click();
    
    const targetModeToggle = page.locator('[data-role="enemy-selection-mode"]');
    if (await targetModeToggle.evaluate(el => el.tagName === 'SELECT')) {
      await targetModeToggle.selectOption('simple');
    } else {
      // Checkbox case
      await targetModeToggle.uncheck();
    }

    const partyTab = page.locator('button[data-tab="party"]');
    await partyTab.click();
    await setupPartyAndStart(page);

    // Change enemy count to 3
    const enemyCountSelect = page.locator('[data-role="enemy-count"]');
    if (await enemyCountSelect.isVisible()) {
      await enemyCountSelect.selectOption('3');
    }

    // Even if enemy count > 1, in Simple Mode, target selector should not be visible
    const targetSelect = page.locator('[data-role="target-select"][data-position="0"]');
    await expect(targetSelect).toBeHidden();
  });
});
