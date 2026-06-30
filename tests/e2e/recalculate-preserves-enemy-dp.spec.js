import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { test, expect } from '@playwright/test';

import { gotoUiNext } from './ui-next-helpers.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * フィクスチャ: 敵 ID 13420081（異時層 スカルフェザー 最終形態）
 * enemies.json の base_param.dp = 4550000
 * セッション JSON には dp 値を直書きしていない（ID → enemies.json で解決する仕様）
 */
const SESSION_FIXTURE_PATH = path.resolve(
  __dirname,
  './fixtures/ui_next_session_skullfether_dp_fixture.json'
);

const EXPECTED_DP = '- / 4550000';
const COMMITTED_TURN_COUNT = 8;

async function readDpFromEnemyPopup(page, row) {
  await row.locator('[data-role="enemy-detail-trigger"]').click();
  const popup = page.locator('.enemy-detail-popup-container');
  await expect(popup).toBeVisible({ timeout: 5000 });
  const dpRow = popup.locator('[data-role="enemy-popup-basic-info-row"]', { hasText: 'DP' });
  await expect(dpRow).toBeVisible({ timeout: 5000 });
  const value = await dpRow.locator('[data-role="enemy-popup-basic-info-value"]').textContent();
  await popup.locator('[data-role="popup-close"]').click();
  await expect(popup).not.toBeVisible({ timeout: 5000 });
  return value?.trim() ?? '';
}

async function ensureSetupVisible(page) {
  const applyButton = page.locator('[data-role="apply-btn"]');
  if (await applyButton.isVisible()) return;
  await page.locator('#toggle-setup').click();
  await expect(applyButton).toBeVisible({ timeout: 5000 });
}

test.describe('「↺ 設定を反映」後の敵 DP 保持', () => {
  test.setTimeout(60000);

  test('「↺ 設定を反映」後も committed row の DP が 4550000 のまま保持される', async ({ page }) => {
    await page.setViewportSize({ width: 1240, height: 960 });
    await gotoUiNext(page);

    await page.locator('#session-load-input').setInputFiles(SESSION_FIXTURE_PATH);

    const committedRows = page.locator('[data-turn-row][data-row-mode="committed"]');
    await expect(committedRows).toHaveCount(COMMITTED_TURN_COUNT, { timeout: 10000 });

    // enemies.json の遅延ロード（deferred task）が完了するまで待機
    await page.waitForTimeout(2000);

    // 設定を反映「前」: committed row #1 の DP を確認
    const dpBefore = await readDpFromEnemyPopup(page, committedRows.first());
    expect(dpBefore).toBe(EXPECTED_DP);

    // 設定パネルを開く
    await ensureSetupVisible(page);

    // 「↺ 設定を反映」ボタンが表示・有効であることを確認してクリック
    const recalcBtn = page.locator('[data-role="recalc-btn"]');
    await expect(recalcBtn).toBeVisible({ timeout: 5000 });
    await expect(recalcBtn).not.toBeDisabled({ timeout: 5000 });
    await recalcBtn.click();

    // 設定パネルが閉じるまで待機（onRecalculate が collapseSetup を呼ぶ）
    await expect(page.locator('[data-role="apply-btn"]')).not.toBeVisible({ timeout: 5000 });

    // 設定を反映「後」: committed row #1 の DP が保持されていることを確認
    const committedRowsAfter = page.locator('[data-turn-row][data-row-mode="committed"]');
    await expect(committedRowsAfter.first()).toBeVisible({ timeout: 5000 });
    const dpAfter = await readDpFromEnemyPopup(page, committedRowsAfter.first());
    expect(dpAfter).toBe(EXPECTED_DP);
  });
});
