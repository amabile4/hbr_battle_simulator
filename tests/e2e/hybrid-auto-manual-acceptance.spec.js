/**
 * hybrid_auto_manual_break 最終受け入れ E2E
 *
 * 代表シナリオ:
 * - 自動ガイドが #3 で DP ブレイクを提案する。
 * - ユーザー操作履歴として #4 に手動 Break を指定する。
 * - JSON 往復後も #4 の手動指定のみが保存され、#3 には手動指定が混入しない。
 * - replay JSON に派生値・警告状態は保存されない。
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
const ATTACK_SKILL_ID = 46002102;
const PROTECTION_SKILL_ID = 46300004;

async function waitForGuideRefresh(page) {
  await page.waitForTimeout(4500);
}

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
    name: 'hybrid_acceptance_session.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(sessionObject), 'utf-8'),
  });
  await expect(page.locator('[data-turn-row][data-row-mode="input"]')).toBeVisible({ timeout: 10000 });
}

async function commitFrontlineSkills(page, skillIdsByPosition) {
  for (const [positionText, skillId] of Object.entries(skillIdsByPosition)) {
    await selectSkillForPosition(page, Number(positionText), skillId);
  }
  return commitLatestInputRow(page);
}

async function commitProtectionTurn(page) {
  return commitFrontlineSkills(page, {
    0: PROTECTION_SKILL_ID,
    1: PROTECTION_SKILL_ID,
    2: PROTECTION_SKILL_ID,
  });
}

async function commitGuideAttackTurn(page) {
  return commitFrontlineSkills(page, {
    0: ATTACK_SKILL_ID,
    1: PROTECTION_SKILL_ID,
    2: PROTECTION_SKILL_ID,
  });
}

function replayJsonText(session) {
  return JSON.stringify(session.replayScript ?? {});
}

test.describe('hybrid auto/manual break acceptance', () => {
  test.setTimeout(120000);

  test('自動#3ガイドと手動#4指定がJSON往復後も分離され、派生値が保存されない', async ({ page }) => {
    await gotoUiNext(page);
    await page.locator('#session-load-input').setInputFiles(SESSION_FIXTURE_PATH);
    await expect(page.locator('[data-turn-row][data-row-mode="input"]')).toBeVisible({ timeout: 10000 });
    await waitForGuideRefresh(page);

    await commitProtectionTurn(page);
    await commitProtectionTurn(page);
    await commitGuideAttackTurn(page);
    await commitGuideAttackTurn(page);
    await waitForGuideRefresh(page);

    const guideRow = page.locator('[data-turn-row][data-row-mode="committed"]').nth(2);
    await expect(guideRow.locator('[data-role="dp-auto-break-chip"]').first()).toBeVisible({ timeout: 5000 });
    await expect(guideRow.locator('[data-role="dp-auto-break-chip"]').first()).toContainText('(DP)');

    const saved = await downloadSessionJson(page);
    // 手動敵の dp が保存JSONへ正しく往復することも受け入れ条件の一部（enemy差し替え禁止）
    expect(saved.enemy?.dp).toBe(1);
    expect(saved.replayScript?.turns?.length ?? 0).toBeGreaterThanOrEqual(4);
    saved.replayScript.turns = saved.replayScript.turns.map((turn) => ({
      turn: turn.turn,
      slots: turn.slots,
      operations: turn.operations ?? [],
      note: turn.note ?? '',
      actionOutcomeOverrides: [],
      followUpOverrides: turn.followUpOverrides ?? [],
      overrideEntries: [],
    }));
    saved.replayScript.turns[3].actionOutcomeOverrides = [
      { position: 0, outcome: 'Break', enemyIndexes: [0] },
    ];

    await loadSessionJson(page, saved);
    await waitForGuideRefresh(page);

    const committedRows = page.locator('[data-turn-row][data-row-mode="committed"]');
    await expect(committedRows).toHaveCount(4);
    const reloadedGuideRow = committedRows.nth(2);
    const manualRow = committedRows.nth(3);

    await expect(reloadedGuideRow.locator('[data-role="manual-break-chip"]')).toHaveCount(0);
    await expect(manualRow.locator('[data-role="manual-break-chip"]').first()).toBeVisible({ timeout: 5000 });

    // T8: 自動ガイド(#3)より後の手動指定(#4)ターンに差分警告が表示される
    const warningMessage = manualRow.locator('[data-role="turn-row-warning-message"]');
    await expect(warningMessage.first()).toBeVisible({ timeout: 5000 });
    await expect(warningMessage.first()).toContainText('自動ブレイクガイドは #3');
    await expect(
      reloadedGuideRow.locator('[data-role="turn-row-warning-message"]')
    ).toHaveCount(0);

    const afterReloadSave = await downloadSessionJson(page);
    expect(afterReloadSave.replayScript.turns[2].actionOutcomeOverrides).toEqual([]);
    expect(afterReloadSave.replayScript.turns[3].actionOutcomeOverrides).toEqual([
      { position: 0, outcome: 'Break', enemyIndexes: [0] },
    ]);

    const replayText = replayJsonText(afterReloadSave);
    expect(replayText).not.toMatch(/perHitDpDamage|remainingDp|guide|preview|cumulative|warning|turnWarnings/i);

    await loadSessionJson(page, afterReloadSave);
    await waitForGuideRefresh(page);

    const roundTripRows = page.locator('[data-turn-row][data-row-mode="committed"]');
    await expect(roundTripRows.nth(2).locator('[data-role="manual-break-chip"]')).toHaveCount(0);
    await expect(roundTripRows.nth(3).locator('[data-role="manual-break-chip"]').first()).toBeVisible({ timeout: 5000 });
  });
});
