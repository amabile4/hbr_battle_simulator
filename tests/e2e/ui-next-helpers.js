import fs from 'node:fs';
import path from 'node:path';

import { expect } from '@playwright/test';

export const PAGE_URL = '/ui-next/index.html';
const UI_NEXT_READY_TIMEOUT_MS = 15000;
const OPEN_PICKER_VISIBLE_TIMEOUT_MS = 5000;
const DOWNLOADS_DIR = path.join(process.env.HOME ?? '', 'Downloads');
const UI_NEXT_SESSION_FILE_PATTERN = /^ui_next_session_.*\.json$/;

export function getLatestDownloadedSessionPath() {
  const latestEntry = fs
    .readdirSync(DOWNLOADS_DIR, { withFileTypes: true })
    .filter((entry) => entry.isFile() && UI_NEXT_SESSION_FILE_PATTERN.test(entry.name))
    .map((entry) => {
      const filePath = path.join(DOWNLOADS_DIR, entry.name);
      return {
        filePath,
        mtimeMs: fs.statSync(filePath).mtimeMs,
      };
    })
    .sort((left, right) => right.mtimeMs - left.mtimeMs)[0];

  if (!latestEntry) {
    throw new Error(`No ui-next session JSON found in ${DOWNLOADS_DIR}`);
  }

  return latestEntry.filePath;
}

async function collectStartupDiagnostics(page, phase, error) {
  let snapshot;
  try {
    snapshot = await page.evaluate(() => {
      const metrics = window.__UI_NEXT_BOOT_METRICS__ ?? null;
      const marks = Array.isArray(metrics?.marks)
        ? metrics.marks.map((mark, index) => {
            const prev = index > 0 ? metrics.marks[index - 1] : null;
            const delta = prev ? Number(mark.atMs) - Number(prev.atMs) : Number(mark.atMs);
            return {
              phase: String(mark.phase ?? ''),
              atMs: Number(mark.atMs ?? 0),
              deltaMs: Number(delta.toFixed(2)),
              note: String(mark.note ?? ''),
            };
          })
        : [];
      return {
        protocol: window.location.protocol,
        href: window.location.href,
        documentReadyState: document.readyState,
        uiNextReady: Boolean(window.__UI_NEXT_READY__),
        openPickerCount: document.querySelectorAll('[data-action="open-picker"]').length,
        bootMetrics: metrics
          ? {
              status: String(metrics.status ?? ''),
              totalMs: Number(metrics.totalMs ?? 0),
              marks,
              errorMessage: String(metrics.errorMessage ?? ''),
            }
          : null,
      };
    });
  } catch (snapshotError) {
    snapshot = {
      unavailable: true,
      reason: String(snapshotError?.message ?? snapshotError ?? 'failed to collect page snapshot'),
    };
  }

  return {
    phase,
    errorMessage: String(error?.message ?? error ?? 'unknown error'),
    snapshot,
  };
}

export async function gotoUiNext(page) {
  await page.addInitScript(() => {
    window.localStorage.clear();
  });
  await page.goto(PAGE_URL);
  await page.waitForLoadState('domcontentloaded');

  try {
    await page.waitForFunction(() => window.__UI_NEXT_READY__ === true, undefined, {
      timeout: UI_NEXT_READY_TIMEOUT_MS,
    });
  } catch (error) {
    const diagnostic = await collectStartupDiagnostics(page, 'waitForReadyFlag', error);
    // eslint-disable-next-line no-console
    console.error('[ui-next startup diagnostics]', JSON.stringify(diagnostic, null, 2));
    throw new Error(
      `ui-next startup timed out while waiting for ready flag: ${JSON.stringify(diagnostic, null, 2)}`
    );
  }

  try {
    await page.waitForSelector('[data-action="open-picker"]', {
      timeout: OPEN_PICKER_VISIBLE_TIMEOUT_MS,
    });
  } catch (error) {
    const diagnostic = await collectStartupDiagnostics(page, 'waitForOpenPicker', error);
    // eslint-disable-next-line no-console
    console.error('[ui-next startup diagnostics]', JSON.stringify(diagnostic, null, 2));
    throw new Error(
      `ui-next startup timed out while waiting for open-picker: ${JSON.stringify(diagnostic, null, 2)}`
    );
  }
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

export async function selectEnemyPresetForActiveSlot(page, enemyId) {
  const categorySelect = page.locator('#enemy-setup-root [data-action="select-enemy-category"]');
  const presetSelect = page.locator('#enemy-setup-root [data-action="select-enemy"]');
  await expect(categorySelect).toBeVisible({ timeout: 5000 });
  await expect(presetSelect).toBeVisible({ timeout: 5000 });

  const targetEnemyId = String(enemyId);
  const categoryValues = await categorySelect.locator('option').evaluateAll((options) =>
    options.map((option) => option.value)
  );

  for (const categoryValue of categoryValues) {
    await categorySelect.selectOption(categoryValue);
    const hasTargetOption = await page
      .waitForFunction(
        ({ selector, value }) =>
          Boolean(document.querySelector(`${selector} option[value="${value}"]`)),
        {
          selector: '#enemy-setup-root [data-action="select-enemy"]',
          value: targetEnemyId,
        },
        { timeout: 2000 }
      )
      .then(() => true, () => false);
    if (hasTargetOption) {
      await presetSelect.selectOption(targetEnemyId);
      return;
    }
  }

  throw new Error(`Enemy preset ${targetEnemyId} was not found in any category`);
}

export async function openEnemyPopupActionForRow(page, row, actionType, options = {}) {
  const enemyIndex = Number.isInteger(Number(options?.enemyIndex)) ? Number(options.enemyIndex) : null;
  const closeBehavior = String(options?.closeBehavior ?? 'stay');
  const trigger = row.locator('[data-role="enemy-detail-trigger"]');
  await expect(trigger).toBeVisible({ timeout: 5000 });
  await trigger.click();

  const popup = page.locator('.enemy-detail-popup-container');
  await expect(popup).toBeVisible({ timeout: 5000 });

  if (enemyIndex !== null) {
    const targetTab = popup.locator(
      `[data-role="enemy-popup-tab"][data-enemy-tab-index="${enemyIndex}"]`
    );
    await expect(targetTab).toBeVisible({ timeout: 5000 });
    await targetTab.click();
  }

  const actionButton = popup.locator(
    `[data-role="enemy-popup-action"][data-action-type="${actionType}"]`
  );
  await expect(actionButton).toBeVisible({ timeout: 5000 });
  await expect(actionButton).toBeEnabled({ timeout: 5000 });
  await actionButton.click();

  if (closeBehavior === 'close') {
    await expect(page.locator('.enemy-detail-popup-container')).toHaveCount(0, { timeout: 5000 });
  } else {
    await expect(page.locator('.enemy-detail-popup-container')).toHaveCount(1, { timeout: 5000 });
  }
  return row;
}

export async function queueSummonEnemyForLatestInputRow(page, enemyId) {
  const inputRow = page.locator('[data-turn-row][data-row-mode="input"]').last();
  await openEnemyPopupActionForRow(page, inputRow, 'summon');

  const editor = page.locator('[data-role="enemy-summon-editor"]');
  await expect(editor).toBeVisible({ timeout: 5000 });

  const select = editor.locator('[data-role="enemy-summon-select"]');
  await expect(select).toBeVisible({ timeout: 5000 });
  await select.selectOption(String(enemyId));

  const submit = editor.locator('[data-role="enemy-summon-submit"]');
  await expect(submit).toBeEnabled({ timeout: 5000 });
  await submit.click();

  await expect(inputRow.locator('[data-role="operation-chip"]')).toContainText('召喚', { timeout: 5000 });
  return inputRow;
}

export async function getPartySetupSlotState(page, slotIndex) {
  const alt = await page
    .locator(`[data-slot="${slotIndex}"] [data-role="party-slot-main-button"] img`)
    .getAttribute('alt');
  const lb = await page
    .locator(`select[data-field="lb"][data-slot-index="${slotIndex}"]`)
    .inputValue();
  const pierce = await page
    .locator(`select[data-field="pierce"][data-slot-index="${slotIndex}"]`)
    .inputValue();
  return {
    alt,
    lb,
    pierce,
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
