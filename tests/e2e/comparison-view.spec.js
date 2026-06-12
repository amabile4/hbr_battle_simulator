/**
 * 一時比較ビュー（T7）E2E テスト
 *
 * シナリオ: 手動討伐指定入りセッションに対し、比較ビュートグルで
 * 手動指定が一時無効化された表示になり、OFF で復帰し、保存JSONが不変であること。
 *
 * フィクスチャ: ui_next_session_dp_damage_fixture.json をロードして1ターンコミットし、
 * 保存JSONへ手動 Kill override を注入して再ロードする（canonical 形は load 時の
 * normalize に委ねる）。
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { test, expect } from '@playwright/test';

import {
  commitLatestInputRow,
  gotoUiNext,
  selectSkillForPosition,
} from './ui-next-helpers.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SESSION_FIXTURE_PATH = path.resolve(
  __dirname,
  './fixtures/ui_next_session_dp_damage_fixture.json'
);
const SKULLFEATHER_SESSION_FIXTURE_PATH = path.resolve(
  __dirname,
  './fixtures/ui_next_session_skullfeather_repro.json'
);

async function downloadSessionJson(page) {
  const downloadPromise = page.waitForEvent('download');
  await page.locator('#session-save-btn').click();
  const download = await downloadPromise;
  const stream = await download.createReadStream();
  const chunks = [];
  for await (const chunk of stream) {
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf-8'));
}

async function loadSessionJson(page, sessionObject) {
  await page.locator('#session-load-input').setInputFiles({
    name: 'session.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(sessionObject), 'utf-8'),
  });
  await expect(page.locator('[data-turn-row][data-row-mode="input"]')).toBeVisible({ timeout: 10000 });
}

test.describe('一時比較ビュー', () => {
  test.setTimeout(90000);

  test('比較ビューONで手動killチップが消え、OFFで復帰し、保存JSONが不変', async ({ page }) => {
    // 1. dp fixture をロードして1ターンコミットし、保存JSONを得る
    await gotoUiNext(page);
    await page.locator('#session-load-input').setInputFiles(SESSION_FIXTURE_PATH);
    await expect(page.locator('[data-turn-row][data-row-mode="input"]')).toBeVisible({ timeout: 10000 });
    await page.waitForTimeout(2000);

    await selectSkillForPosition(page, 0, 46002102);
    await commitLatestInputRow(page);
    const savedSession = await downloadSessionJson(page);

    // 2. 手動 Kill override を注入して再ロード
    expect(savedSession.replayScript?.turns?.length ?? 0).toBeGreaterThan(0);
    savedSession.replayScript.turns[0].actionOutcomeOverrides = [
      { position: 0, outcome: 'Kill', enemyIndexes: [0] },
    ];
    await loadSessionJson(page, savedSession);
    await page.waitForTimeout(2000);

    // 3. 手動 kill チップが committed 行に表示されること
    const committedRow = page.locator('[data-turn-row][data-row-mode="committed"]').first();
    await expect(committedRow).toBeVisible({ timeout: 5000 });
    const killChip = committedRow.locator('[data-role="kill-chip"]');
    await expect(killChip.first()).toBeVisible({ timeout: 5000 });

    // 4. 比較ビュー ON: 手動 kill チップが消え、input 行が非表示（閲覧専用）になる
    const toggle = page.locator('#toggle-comparison-view');
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-pressed', 'true');
    const comparisonCommittedRow = page.locator('[data-turn-row][data-row-mode="committed"]').first();
    await expect(comparisonCommittedRow).toBeVisible({ timeout: 5000 });
    await expect(comparisonCommittedRow.locator('[data-role="kill-chip"]')).toHaveCount(0);
    await expect(page.locator('[data-turn-row][data-row-mode="input"]')).toHaveCount(0);

    // 5. 比較ビュー ON のまま保存しても JSON が不変（手動指定が維持され、比較状態が混入しない）
    const savedDuringComparison = await downloadSessionJson(page);
    expect(savedDuringComparison.replayScript.turns[0].actionOutcomeOverrides).toEqual([
      { position: 0, outcome: 'Kill', enemyIndexes: [0] },
    ]);
    const serializedDuringComparison = JSON.stringify(savedDuringComparison);
    expect(serializedDuringComparison).not.toMatch(/comparison/i);
    expect(JSON.stringify(savedDuringComparison.replayScript)).toEqual(
      JSON.stringify(savedSession.replayScript)
    );

    // 6. 比較ビュー OFF: 手動 kill チップと input 行が復帰する
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-pressed', 'false');
    const restoredRow = page.locator('[data-turn-row][data-row-mode="committed"]').first();
    await expect(restoredRow.locator('[data-role="kill-chip"]').first()).toBeVisible({ timeout: 5000 });
    await expect(page.locator('[data-turn-row][data-row-mode="input"]')).toBeVisible({ timeout: 5000 });
  });

  test('スカルフェザー実セッションの比較ビューでDB敵DPと入れ替え済み行動者を保つ', async ({ page }) => {
    await gotoUiNext(page);
    await page.waitForLoadState('networkidle');
    await page.locator('#session-load-input').setInputFiles(SKULLFEATHER_SESSION_FIXTURE_PATH);
    await expect(page.locator('[data-turn-row][data-row-mode="committed"]')).toHaveCount(8, {
      timeout: 10000,
    });

    const firstRow = page.locator('[data-turn-row][data-row-mode="committed"]').nth(0);
    await firstRow.locator('[data-role="enemy-detail-trigger"]').click();
    const popup = page.locator('.enemy-detail-popup-container');
    await expect(popup).toBeVisible({ timeout: 5000 });
    const dpRow = popup.locator('[data-role="enemy-popup-basic-info-row"]', { hasText: 'DP' });
    await expect(dpRow.locator('[data-role="enemy-popup-basic-info-value"]')).toContainText(
      '4550000',
      { timeout: 10000 }
    );
    await page.locator('.enemy-detail-popup-container [data-role="popup-close"]').click();

    const toggle = page.locator('#toggle-comparison-view');
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-pressed', 'true');

    const turn2 = page.locator('[data-turn-row][data-row-mode="committed"]').nth(1);
    await expect(turn2).toContainText('コードダクネス');
    await expect(turn2).toContainText('咲き昇る宵の幻');

    const turn3 = page.locator('[data-turn-row][data-row-mode="committed"]').nth(2);
    await expect(turn3.locator('[data-turn-slot][data-position="0"] [data-turn-slot-icon] > img')).toHaveAttribute(
      'alt',
      'Lead by Example'
    );
    const position0SkillName = await turn3
      .locator('[data-skill-select][data-position="0"]')
      .evaluate((select) => select.selectedOptions[0]?.textContent ?? '');
    expect(position0SkillName).toContain('ソフニング');
  });
});
