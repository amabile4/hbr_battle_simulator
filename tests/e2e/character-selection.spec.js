import { test, expect } from '@playwright/test';

const PAGE_URL = '/ui/index.html';

test.describe('キャラクター選択画面 M1受け入れ基準', () => {
  test('6スロットが存在する', async ({ page }) => {
    await page.goto(PAGE_URL);
    await page.waitForTimeout(3000);
    const slotContainers = await page.locator('.party-slot').all();
    expect(slotContainers.length).toBeGreaterThanOrEqual(6);
  });

  test('各スロットにキャラ/スタイル/LB/ドライブピアス/スキルセット選択がある', async ({ page }) => {
    await page.goto(PAGE_URL);
    await page.waitForTimeout(3000);
    for (let i = 0; i < 6; i++) {
      await expect(page.locator(`[data-role="character-select"][data-slot="${i}"]`)).toBeVisible();
      await expect(page.locator(`[data-role="style-select"][data-slot="${i}"]`)).toBeVisible();
      await expect(page.locator(`[data-role="limit-break-select"][data-slot="${i}"]`)).toBeVisible();
      await expect(page.locator(`[data-role="drive-pierce-select"][data-slot="${i}"]`)).toBeVisible();
      await expect(page.locator(`[data-role="skill-checklist"][data-slot="${i}"]`)).toBeVisible();
    }
  });

  test('キャラクター変更でスタイル候補が更新される', async ({ page }) => {
    await page.goto(PAGE_URL);
    await page.waitForTimeout(3000);
    const charSelect = page.locator('[data-role="character-select"][data-slot="0"]');
    const styleSelect = page.locator('[data-role="style-select"][data-slot="0"]');
    const options = await charSelect.locator('option').all();
    expect(options.length).toBeGreaterThan(1);
    const secondCharValue = await options[1].getAttribute('value');
    await charSelect.selectOption(secondCharValue);
    const styleOptions = await styleSelect.locator('option').all();
    expect(styleOptions.length).toBeGreaterThan(0);
    for (const opt of styleOptions) {
      const charLabel = await opt.getAttribute('data-character-label');
      expect(charLabel).toBe(secondCharValue);
    }
  });

  test('スタイル変更でスキルセット候補が更新される', async ({ page }) => {
    await page.goto(PAGE_URL);
    await page.waitForTimeout(3000);
    const styleSelect = page.locator('[data-role="style-select"][data-slot="0"]');
    const skillChecklist = page.locator('[data-role="skill-checklist"][data-slot="0"]');
    const styleOptions = await styleSelect.locator('option').all();
    if (styleOptions.length > 1) {
      const secondStyleValue = await styleOptions[1].getAttribute('value');
      await styleSelect.selectOption(secondStyleValue);
    }
    const skillChecks = await skillChecklist.locator('[data-role="skill-check"]').all();
    expect(skillChecks.length).toBeGreaterThan(0);
  });

  test('選択サマリが表示される', async ({ page }) => {
    await page.goto(PAGE_URL);
    await page.waitForTimeout(3000);
    const summary = page.locator('[data-role="selection-summary"]');
    const text = await summary.textContent();
    expect(text).toContain('Slot 1:');
    expect(text).toContain('Slot 6:');
  });
});
