import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

import { test, expect } from '@playwright/test';

import { loadUiNextSession } from './ui-next-helpers.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SESSION_FIXTURE_PATH = path.resolve(
  __dirname,
  './fixtures/ui_next_session_destruction_preview_2026-06-14.json'
);
const HP_GAUGE_SESSION_PATH = '/Users/ram4/Downloads/ui_next_session_2026-06-05T21-24-36.194+09-00.json';

function parsePercentText(text) {
  return Number(String(text ?? '').replace('%', '').trim());
}

async function openDamagePopupForSlot(page, turnIndex, position) {
  const row = page.locator('[data-turn-row][data-row-mode="committed"]').nth(turnIndex);
  await expect(row).toBeVisible({ timeout: 5000 });
  const icon = row.locator(`[data-turn-slot][data-position="${position}"] [data-turn-slot-icon]`);
  await expect(icon).toBeVisible({ timeout: 5000 });
  await icon.click({ button: 'right' });

  const popup = page.locator('#char-detail-popup');
  await expect(popup).toHaveClass(/open/, { timeout: 5000 });
  await popup.locator('[data-tab="damage"]').click();
  await expect(popup.locator('[data-tab-panel="damage"]')).toBeVisible({ timeout: 5000 });
  await expect(popup.locator('[data-role="damage-calc-pane"]').first()).toBeVisible({ timeout: 5000 });
  return popup;
}

async function readDestructionPreview(page, { turnIndex, position, expectedSkillName }) {
  const popup = await openDamagePopupForSlot(page, turnIndex, position);
  if (expectedSkillName) {
    await expect(popup.locator('[data-role="char-popup-damage-action"]').first()).toContainText(expectedSkillName);
  }
  const pane = popup.locator('[data-role="damage-calc-pane"]').first();
  const actionEl = popup.locator('[data-role="char-popup-damage-action"]').first();
  const rateBefore = await actionEl.getAttribute('data-destruction-rate-before');
  const rateAfter = await actionEl.getAttribute('data-destruction-rate-after');
  const inputValue = Number(await pane.locator('[data-role="destruction-rate-input"]').inputValue());
  const afterText = await pane.locator('[data-role="destruction-rate-after"]').textContent();
  const afterValue = parsePercentText(afterText);
  const hitSummary = (await pane.locator('[data-role="destruction-hit-summary"]').textContent()) ?? '';
  await popup.locator('[data-role="char-popup-close"]').click();
  await expect(page.locator('#char-detail-popup')).not.toHaveClass(/open/);
  return { inputValue, afterValue, rateBefore, rateAfter, hitSummary };
}

async function readDamageCalculatorPane(page, { turnIndex, position, expectedSkillName }) {
  const popup = await openDamagePopupForSlot(page, turnIndex, position);
  await expect(popup.locator('[data-role="char-popup-damage-action"]').first()).toContainText(expectedSkillName);
  const pane = popup.locator('[data-role="damage-calc-pane"]').first();
  await expect(pane.locator('[data-role="damage-calc-normal-hp-expected"]')).not.toHaveText('-', { timeout: 5000 });
  const hpStatus = (await pane.locator('[data-role="damage-calc-hp-status"]').textContent()) ?? '';
  const hpExpected = (await pane.locator('[data-role="damage-calc-normal-hp-expected"]').textContent()) ?? '';
  const destructionRate = (await pane.locator('[data-role="damage-calc-destruction-rate"]').textContent()) ?? '';
  const hpWidths = await pane.locator('[data-role="damage-calc-hp-gauge"] .char-popup-enemy-gauge__bar--hp')
    .evaluateAll((nodes) => nodes.map((node) => Number.parseFloat(node.style.width || '0')));
  const hpRows = await pane.locator('[data-role="damage-calc-hp-gauge"] .char-popup-enemy-gauge__row')
    .evaluateAll((nodes) => nodes.map((node) => ({
      text: node.textContent?.trim() ?? '',
      width: Number.parseFloat(node.querySelector('.char-popup-enemy-gauge__bar--hp')?.style.width || '0'),
    })));
  await popup.locator('[data-role="char-popup-close"]').click();
  await expect(page.locator('#char-detail-popup')).not.toHaveClass(/open/);
  return { hpStatus, hpExpected, destructionRate, hpWidths, hpRows };
}

test.describe('destruction preview session regression', () => {
  test('damage detail tab uses action-before destruction rate and DP-aware preview', async ({ page }) => {
    await loadUiNextSession(page, SESSION_FIXTURE_PATH);

    const turn1Miya = await readDestructionPreview(page, {
      turnIndex: 0,
      position: 0,
      expectedSkillName: '咲き昇る宵の幻',
    });
    expect(turn1Miya.inputValue).toBeCloseTo(100, 2);
    expect(turn1Miya.afterValue).toBeCloseTo(100, 2);

    const turn1Yuki = await readDestructionPreview(page, {
      turnIndex: 0,
      position: 1,
      expectedSkillName: '通常攻撃',
    });
    expect(turn1Yuki.inputValue).toBeCloseTo(100, 2);
    expect(turn1Yuki.afterValue).toBeCloseTo(turn1Yuki.inputValue, 2);

    const turn2Yuki = await readDestructionPreview(page, {
      turnIndex: 1,
      position: 0,
      expectedSkillName: 'コードダクネス',
    });
    expect(turn2Yuki.rateBefore).toBe('100.00');
    expect(turn2Yuki.rateAfter).toBe('132.63');
    expect(turn2Yuki.inputValue).toBeCloseTo(100, 2);
    expect(turn2Yuki.afterValue).toBeCloseTo(132.63, 2);
    expect(turn2Yuki.hitSummary).toContain('接触hit 9');
    expect(turn2Yuki.hitSummary).toContain('計算hit 9');
    expect(turn2Yuki.hitSummary).toContain('base 6');
    expect(turn2Yuki.hitSummary).toContain('連撃 +3');
    expect(turn2Yuki.hitSummary).toContain('破壊率連撃 +3');
    expect(turn2Yuki.hitSummary).toContain('連撃倍率 x1.75');
    expect(turn2Yuki.hitSummary).toContain('hit ratio [0.1,0.1,0.1,0.2,0.2,0.3,0.25,0.25,0.25]');
    expect(turn2Yuki.hitSummary).toContain('Break hit 7');
    expect(turn2Yuki.hitSummary).toContain('破壊率weight 0.75/1.75');
    expect(turn2Yuki.hitSummary).toContain('DP 6,621,276');
    expect(turn2Yuki.hitSummary).toContain('HP 3,310,638');
    expect(turn2Yuki.hitSummary).toContain('破壊率 +32.63%');
    expect(turn2Yuki.hitSummary).toContain('funnel');
    expect(turn2Yuki.hitSummary).toContain('174,165');
    expect(turn2Yuki.hitSummary).toContain('121.75%');
    expect(turn2Yuki.hitSummary).toContain('575,815');

    const turn2Miya = await readDestructionPreview(page, {
      turnIndex: 1,
      position: 1,
      expectedSkillName: '咲き昇る宵の幻',
    });
    expect(turn2Miya.rateBefore).toBe('132.63');
    expect(turn2Miya.rateAfter).toBe('717.34');
    expect(turn2Miya.inputValue).toBeCloseTo(132.63, 2);
    expect(turn2Miya.afterValue).toBeCloseTo(717.34, 2);
    expect(turn2Miya.afterValue - turn2Miya.inputValue).toBeCloseTo(584.71, 1);
  });

  test('real multi HP gauge session keeps HP damage display and temporary SuperBreakDown cap lifecycle', async ({ page }) => {
    test.skip(!fs.existsSync(HP_GAUGE_SESSION_PATH), `fixture not found: ${HP_GAUGE_SESSION_PATH}`);
    await loadUiNextSession(page, HP_GAUGE_SESSION_PATH);

    const symmetry = await readDamageCalculatorPane(page, {
      turnIndex: 3,
      position: 1,
      expectedSkillName: 'シンメトリー・リベレーション',
    });
    expect(symmetry.hpExpected).not.toBe('-');
    expect(symmetry.hpStatus).toMatch(/\/\s*[\d,]+ \(\d+\/\d+\)/);
    expect(symmetry.hpWidths.some((width) => width > 0 && width < 100)).toBe(true);

    const megaDestroyer = await readDamageCalculatorPane(page, {
      turnIndex: 3,
      position: 2,
      expectedSkillName: 'メガデストロイヤー',
    });
    expect(megaDestroyer.hpStatus).toBe('0 / 75,000,000 (3/3)');
    expect(megaDestroyer.hpRows).toEqual([
      { text: '0 / 75,000,000', width: 0 },
      { text: '150,000,000 / 150,000,000', width: 100 },
      { text: '200,000,000 / 200,000,000', width: 100 },
    ]);

    const nightKill = await readDamageCalculatorPane(page, {
      turnIndex: 5,
      position: 0,
      expectedSkillName: 'ナイトキルエッジ',
    });
    expect(nightKill.hpExpected).not.toBe('-');
    expect(nightKill.hpStatus).toMatch(/\/\s*[\d,]+ \(\d+\/\d+\)/);
    expect(nightKill.hpWidths.some((width) => width > 0 && width < 100)).toBe(true);

    const mikoto = await readDamageCalculatorPane(page, {
      turnIndex: 5,
      position: 1,
      expectedSkillName: '破滅でおやすみ+',
    });
    expect(mikoto.hpExpected).not.toBe('-');
    expect(mikoto.hpWidths.some((width) => width > 0 && width < 100)).toBe(true);

    const harvest = await readDamageCalculatorPane(page, {
      turnIndex: 5,
      position: 2,
      expectedSkillName: '収穫祭+',
    });
    expect(harvest.hpExpected).not.toBe('-');
    expect(harvest.hpWidths.some((width) => width > 0 && width < 100)).toBe(true);

    const gigaBigBang = await readDamageCalculatorPane(page, {
      turnIndex: 7,
      position: 1,
      expectedSkillName: 'ギガビッグバン',
    });
    expect(gigaBigBang.destructionRate).toContain('/ 999.00%');

    const bloodyDance = await readDamageCalculatorPane(page, {
      turnIndex: 7,
      position: 2,
      expectedSkillName: 'ブラッディ・ダンス+',
    });
    expect(bloodyDance.destructionRate).toContain('/ 999.00%');

    const nightKillOd3 = await readDamageCalculatorPane(page, {
      turnIndex: 8,
      position: 2,
      expectedSkillName: 'ナイトキルエッジ',
    });
    expect(nightKillOd3.destructionRate).toContain('/ 1299.00%');
  });
});
