/**
 * 一時プレビュー入力（T6）E2E テスト
 *
 * char-detail-popup の威力詳細タブで現DP/現HPを一時入力すると
 * 「このスキル後」残量が表示され、敵タブを往復しても入力が維持されること
 * （ビュー専用・popup 内の再描画では消えない）を確認する。
 */
import { test, expect } from '@playwright/test';

import { gotoUiNext } from './ui-next-helpers.js';

function parseDamageText(value) {
  const numeric = Number(String(value ?? '').replace(/,/g, ''));
  return Number.isFinite(numeric) ? numeric : 0;
}

async function openCalcPopup(page) {
  await page.evaluate(async () => {
    const { openCharDetailPopup } = await import('/ui-next/utils/char-detail-popup.js');
    const baseGroups = [
      { dataGroup: 'buff', title: '攻撃バフ枠', multiplier: 1.5, formula: '1.50x', contributions: [] },
      { dataGroup: 'crit-mindeye', title: 'クリティカル枠', multiplier: 1.2, formula: '1.20x', contributions: [] },
      { dataGroup: 'funnel', title: '連撃バフ枠', multiplier: 1, formula: '1.00x', contributions: [] },
      { dataGroup: 'token-passive', title: 'トークン・固有枠', multiplier: 1, formula: '1.00x', contributions: [] },
      { dataGroup: 'debuff', title: '敵デバフ・脆弱枠', multiplier: 1.3, formula: '1.30x', contributions: [] },
      { dataGroup: 'affinity', title: '基本相性枠', multiplier: 1, formula: '1.00x', contributions: [] },
    ];
    openCharDetailPopup(
      {
        characterId: 'PREVIEW_INPUT_E2E',
        characterName: '一時入力テスト',
        styleName: 'テストスタイル',
        role: 'Attacker',
        elements: ['Fire'],
        weaponType: 'Slash',
        statusEffects: [],
        passives: [],
      },
      {
        previewActionFlow: [
          {
            actorCharacterId: 'PREVIEW_INPUT_E2E',
            actorStyleId: 20202020,
            skillId: 202020200,
            skillName: 'テストスキル',
            damageContext: {
              actorCharacterId: 'PREVIEW_INPUT_E2E',
              actorStyleId: 20202020,
              skillId: 202020200,
              skillName: 'テストスキル',
              isNormalAttack: false,
              effectiveDamageRatesByEnemy: { 0: 100, 1: 150 },
              enemyParamBorderByEnemy: { 0: 812, 1: 923 },
              destructionRateByEnemy: { 0: 100, 1: 100 },
              criticalRateBreakdown: {
                criticalRatePercent: 100,
                isCriticalGuaranteed: true,
                contributions: [],
              },
              damageBreakdown: {
                version: 1,
                mode: 'critical',
                targetBreakdowns: [
                  {
                    targetEnemyIndex: 0,
                    targetLabel: 'E1',
                    finalMultiplier: 1.95,
                    increasePercent: 95,
                    formula: '1.50x * 1.30x',
                    groups: baseGroups,
                  },
                  {
                    targetEnemyIndex: 1,
                    targetLabel: 'E2',
                    finalMultiplier: 2.93,
                    increasePercent: 193,
                    formula: '1.50x * 1.30x * 1.50x',
                    groups: baseGroups,
                  },
                ],
              },
            },
          },
        ],
      },
      { isCommitted: false }
    );
  });
  const popup = page.locator('#char-detail-popup');
  await expect(popup).toBeVisible();
  await popup.locator('.char-popup-tab[data-tab="damage"]').click();
  const pane = popup.locator('[data-role="damage-calc-pane"]').first();
  await expect(pane).toBeVisible();
  await expect(pane.locator('[data-role="damage-calc-normal-expected"]')).not.toHaveText('-', { timeout: 5000 });
  return { popup, pane };
}

test.describe('一時プレビュー入力', () => {
  test('現DP/現HPの入力でスキル後残量が表示され、敵タブ往復でも維持される', async ({ page }) => {
    await gotoUiNext(page);
    const { pane } = await openCalcPopup(page);

    // 期待ダメージ（dataset）を注入して表示配線を検証する
    // （合成 damageContext では calculateDamage 用の実データが揃わないため）
    await pane.evaluate((el) => {
      el.dataset.dpExpected = '1500';
      el.dataset.hpExpected = '3000';
    });

    // 期待DPダメージより大きい現DPを入力 → 残量が表示される
    const currentDp = 2000;
    await pane.locator('[data-role="current-dp-input"]').fill(String(currentDp));
    await expect(pane.locator('[data-role="current-dp-after"]')).toHaveText(/^\d/);
    const dpAfter = parseDamageText(
      await pane.locator('[data-role="current-dp-after"]').textContent()
    );
    expect(dpAfter).toBe(currentDp - 1500);

    // 期待HPダメージ以下の現HPを入力 → 「0 (討伐!)」表示
    await pane.locator('[data-role="current-hp-input"]').fill('1');
    await expect(pane.locator('[data-role="current-hp-after"]')).toContainText('討伐!');

    // 敵タブを往復しても敵0の入力値が維持される（popup内再描画では消えない）
    const enemyTabs = pane.locator('[data-role="damage-calc-enemy-tab"]');
    await enemyTabs.nth(1).click();
    await expect(pane.locator('[data-role="current-dp-input"]')).toHaveValue('', { timeout: 5000 });
    await enemyTabs.nth(0).click();
    await expect(pane.locator('[data-role="current-dp-input"]')).toHaveValue(String(currentDp), { timeout: 5000 });
    await expect(pane.locator('[data-role="current-hp-input"]')).toHaveValue('1');

    // 破壊率入力もタブ往復で維持される
    await pane.locator('[data-role="destruction-rate-input"]').fill('222.50');
    await enemyTabs.nth(1).click();
    await enemyTabs.nth(0).click();
    await expect(pane.locator('[data-role="destruction-rate-input"]')).toHaveValue('222.50');
  });
});
