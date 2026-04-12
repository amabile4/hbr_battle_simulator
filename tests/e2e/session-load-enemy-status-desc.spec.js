import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { test, expect } from '@playwright/test';

import { gotoUiNext } from './ui-next-helpers.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SESSION_FIXTURE_PATH = path.resolve(
  __dirname,
  './fixtures/ui_next_session_enemy_status_desc_fixture.json'
);
const HIT_CHART_DESC_FRAGMENT = '敵の防御力と闇属性防御力を下げ';
const SOFTENING_DESC_FRAGMENT = '敵の防御力を下げる';

test.describe('Session JSON enemy status description', () => {
  test('JSON読込後の committed row #19 enemy detail popup で resolver fallback の desc を表示する', async ({ page }) => {
    await page.setViewportSize({ width: 1360, height: 960 });
    await gotoUiNext(page);

    await page.locator('#session-load-input').setInputFiles(SESSION_FIXTURE_PATH);

    const committedRows = page.locator('[data-turn-row][data-row-mode="committed"]');
    await expect(committedRows).toHaveCount(19, { timeout: 10000 });

    const committedRow19 = committedRows.nth(18);
    await expect(committedRow19).toBeVisible({ timeout: 10000 });

    await committedRow19.locator('[data-role="enemy-detail-trigger"]').click();

    const popup = page.locator('.enemy-detail-popup-container');
    await expect(popup).toBeVisible({ timeout: 5000 });

    const selectedColumn = popup.locator('[data-role="enemy-popup-column"][data-selected="true"]');
    await expect(selectedColumn.locator('.char-popup-buff-desc').first()).toBeVisible({ timeout: 5000 });
    await expect(selectedColumn).toContainText('今宵、快楽ナイトメア');
    await expect(selectedColumn).toContainText(HIT_CHART_DESC_FRAGMENT);

    await popup.locator('[data-role="enemy-popup-tab"][data-enemy-tab-index="1"]').click();

    const enemy2Column = popup.locator('[data-role="enemy-popup-column"][data-selected="true"]');
    await expect(enemy2Column).toContainText('ソフニング');
    await expect(enemy2Column).toContainText(SOFTENING_DESC_FRAGMENT);
  });
});
