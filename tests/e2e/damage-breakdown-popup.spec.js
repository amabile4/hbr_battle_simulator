import { test, expect } from '@playwright/test';

import { gotoUiNext } from './ui-next-helpers.js';

test.describe('Damage breakdown popup tab', () => {
  function parseDamageText(value) {
    const numeric = Number(String(value ?? '').replace(/,/g, ''));
    return Number.isFinite(numeric) ? numeric : 0;
  }

  test('character detail popup renders damage breakdown summary, critical rate and official categories', async ({ page }) => {
    await gotoUiNext(page);

    await page.evaluate(async () => {
      const { openCharDetailPopup } = await import('/ui-next/utils/char-detail-popup.js');
      const groups = [
        ['buff', '攻撃バフ枠', 2.1, [{ label: '攻撃力アップ', value: 0.5, iconStatusType: 'AttackUp', sourceSkillName: '攻撃支援' }]],
        ['crit-mindeye', 'クリティカル枠', 2.25, [{ label: 'クリティカル基礎倍率', value: 1.5, iconStatusType: 'CriticalDamageUp' }]],
        ['funnel', '連撃バフ枠', 1.5, [{ label: '連撃数アップ', value: 0.5, iconStatusType: 'Funnel', sourceSkillName: '連撃支援' }]],
        ['token-passive', 'トークン・固有枠', 1.8, [{ label: 'トークン攻撃倍率', value: 0.8, iconStatusType: 'TokenSet' }]],
        ['debuff', '敵デバフ・脆弱枠', 1.9, [
          { label: '防御力ダウン', value: 0.7, iconStatusType: 'DefenseDown' },
          { label: '火属性耐性ダウン', value: 0.2, iconStatusType: 'ResistDown', elements: ['Fire'] },
        ]],
        ['affinity', '基本相性枠', 1.5, [{ label: '斬相性', value: 1.5, iconStatusType: 'Slash' }]],
      ].map(([dataGroup, title, multiplier, contributions], index) => ({
        id: `g${index}`,
        dataGroup,
        title,
        multiplier,
        formula: `式: ${multiplier}`,
        contributions,
      }));
      openCharDetailPopup(
        {
          characterId: 'DAMAGE_E2E',
          characterName: '茅森 月歌',
          styleName: 'テストスタイル',
          elements: ['Fire'],
          weaponType: 'Slash',
          statusEffects: [],
          passives: [],
        },
        {
          previewActionFlow: [
            {
              actorCharacterId: 'DAMAGE_E2E',
              skillName: '星火燎原',
              damageContext: {
                criticalRateBreakdown: {
                  criticalRatePercent: 135,
                  isCriticalGuaranteed: true,
                  contributions: [
                    { label: 'クリティカル確率アップ', value: 1.35, iconStatusType: 'CriticalRateUp' },
                  ],
                },
                damageBreakdown: {
                  version: 1,
                  mode: 'critical',
                  randomMultiplier: 1,
                  targetBreakdowns: [
                    {
                      targetEnemyIndex: 0,
                      targetLabel: 'E1',
                      finalMultiplier: 32.32,
                      increasePercent: 3132,
                      formula: '2.10x * 2.25x * 1.50x * 1.80x * 1.90x * 1.50x',
                      groups,
                    },
                    {
                      targetEnemyIndex: 1,
                      targetLabel: 'E2',
                      finalMultiplier: 10.77,
                      increasePercent: 977,
                      formula: '2.10x * 2.25x * 1.50x * 1.80x * 1.90x * 0.50x',
                      groups: groups.map((group) =>
                        group.dataGroup === 'affinity'
                          ? {
                              ...group,
                              multiplier: 0.5,
                              contributions: [{ label: '斬相性', value: 0.5, iconStatusType: 'Slash' }],
                            }
                          : group
                      ),
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

    await expect(popup).toContainText('威力詳細');
    await expect(popup).toContainText('星火燎原');
    await expect(popup).toContainText('32.32x');
    await expect(popup).toContainText('クリティカル発生率: 135%');
    await expect(popup).toContainText('クリティカル確定');
    await expect(popup.locator('[data-role="char-popup-damage-target"]')).toHaveCount(2);
    await expect(popup.locator('[data-role="char-popup-damage-target"]').first().locator('[data-role="char-popup-damage-row"]')).toHaveCount(6);
    await expect(popup.locator('[data-role="damage-calc-enemy-border"]').first()).toHaveText('770');
    await expect(popup).toContainText('攻撃バフ枠');
    await expect(popup).toContainText('火属性耐性ダウン');
    await expect(popup).not.toContainText('属性耐性ダウン枠');
    await expect(popup).not.toContainText('落選バフ');
  });

  test('damage calculator pane recalculates by enemy tab and keeps attacker stats', async ({ page }) => {
    await gotoUiNext(page);

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
          characterId: 'DAMAGE_CALC_E2E',
          characterName: '計算テスト',
          styleName: 'テストスタイル',
          role: 'Buffer',
          limitBreakLevel: 2,
          stats: { str: 700, dex: 710, wis: 720, spr: 730, luk: 740, con: 750 },
          supportStats: { str: 100, dex: 100, wis: 100, spr: 100, luk: 100, con: 100 },
          elements: ['Fire'],
          weaponType: 'Slash',
          statusEffects: [],
          passives: [],
        },
        {
          previewActionFlow: [
            {
              actorCharacterId: 'DAMAGE_CALC_E2E',
              actorStyleId: 10101010,
              skillId: 101010100,
              skillName: '誤った表示名',
              damageContext: {
                actorCharacterId: 'DAMAGE_CALC_E2E',
                actorStyleId: 10101010,
                skillId: 101010100,
                skillName: '星火燎原',
                isNormalAttack: false,
                effectiveDamageRatesByEnemy: { 0: 100, 1: 150 },
                enemyParamBorderByEnemy: { 0: 812, 1: 923 },
                destructionRateByEnemy: { 0: 120, 1: 150 },
                enemyAllAbilityDownByEnemy: { 0: 50, 1: 70 },
                zoneType: 'Fire',
                zonePowerRate: 50,
                tokenAttackTokenCount: 0,
                chargeEffects: [],
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
                      finalMultiplier: 2.34,
                      increasePercent: 134,
                      formula: '1.50x * 1.20x * 1.30x',
                      groups: baseGroups,
                    },
                    {
                      targetEnemyIndex: 1,
                      targetLabel: '強敵ベータ',
                      finalMultiplier: 3.51,
                      increasePercent: 251,
                      formula: '1.50x * 1.20x * 1.30x * 1.50x',
                      groups: baseGroups.map((group) =>
                        group.dataGroup === 'affinity'
                          ? { ...group, multiplier: 1.5, formula: '1.50x' }
                          : group
                      ),
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
    await expect(pane.locator('[data-role="damage-calc-enemy-tab"]')).toHaveCount(2);
    await expect(pane.locator('[data-role="damage-calc-normal-expected"]')).not.toHaveText('-', { timeout: 5000 });
    await expect(pane.locator('[data-role="damage-calc-stat-input"]')).toHaveCount(0);
    await expect(pane.locator('[data-role="damage-calc-role"]')).toHaveCount(0);
    await expect(pane.locator('[data-role="damage-calc-limit-break"]')).toHaveCount(0);
    await expect(popup).toContainText('星火燎原');
    await expect(popup).not.toContainText('誤った表示名');
    await expect(pane.locator('[data-role="damage-calc-stat-base"][data-stat="str"]').first()).toHaveText('700');
    await expect(pane.locator('[data-role="damage-calc-stat-resolved"][data-stat="str"]').first()).toHaveText('700');
    await expect(pane.locator('[data-role="damage-calc-result"]')).toContainText('非クリ DP');
    await expect(pane.locator('[data-role="damage-calc-result"]')).toContainText('クリティカル DP');
    await expect(pane.locator('[data-role="damage-calc-result"]')).toContainText('非クリ HP');
    await expect(pane.locator('[data-role="damage-calc-result"]')).toContainText('クリティカル HP');
    await expect(pane.locator('[data-role="damage-calc-result"]')).toContainText('現在破壊率');
    await expect(pane.locator('[data-role="damage-calc-normal-hp-expected"]')).not.toHaveText('-');
    await expect.poll(async () => {
      const hp = parseDamageText(await pane.locator('[data-role="damage-calc-critical-hp-expected"]').textContent());
      const dp = parseDamageText(await pane.locator('[data-role="damage-calc-critical-expected"]').textContent());
      return hp > dp;
    }).toBe(true);
    await expect(pane.locator('[data-role="damage-calc-destruction-rate"]')).toHaveText('120.00%');
    await expect(pane.locator('[data-role="damage-calc-enemy-border"]')).toHaveText('812');
    await expect(
      pane.locator('[data-role="damage-calc-enemy-stats"] [data-role="damage-calc-stat-delta"][data-stat="str"]')
    ).toHaveText('-50');
    await expect(
      pane.locator('[data-role="damage-calc-enemy-stats"] [data-role="damage-calc-stat-resolved"][data-stat="str"]')
    ).toHaveText('762');

    await pane.locator('[data-role="damage-calc-enemy-tab"][data-target-enemy-index="1"]').click();
    await expect(pane.locator('[data-role="damage-calc-enemy-name"]')).toHaveText('強敵ベータ');
    await expect(pane.locator('[data-role="damage-calc-enemy-border"]')).toHaveText('923');
    await expect(pane.locator('[data-role="damage-calc-affinity"]')).toHaveText('1.50x');
    await expect(pane.locator('[data-role="damage-calc-destruction-rate"]')).toHaveText('150.00%');
    await expect(pane.locator('[data-role="damage-calc-stat-base"][data-stat="str"]').first()).toHaveText('700');
    await expect(
      pane.locator('[data-role="damage-calc-enemy-stats"] [data-role="damage-calc-stat-delta"][data-stat="str"]')
    ).toHaveText('-70');
    await expect(
      pane.locator('[data-role="damage-calc-enemy-stats"] [data-role="damage-calc-stat-resolved"][data-stat="str"]')
    ).toHaveText('853');
  });

  test('damage calculator pane uses default plus support stats when main stats are absent', async ({ page }) => {
    await gotoUiNext(page);

    await page.evaluate(async () => {
      const { openCharDetailPopup } = await import('/ui-next/utils/char-detail-popup.js');
      openCharDetailPopup(
        {
          characterId: 'DAMAGE_CALC_DEFAULT_E2E',
          characterName: 'デフォルト計算テスト',
          styleName: 'テストスタイル',
          role: 'Buffer',
          limitBreakLevel: 2,
          stats: null,
          supportStats: { str: 100, dex: 100, wis: 100, spr: 100, luk: 100, con: 100 },
          elements: ['Fire'],
          weaponType: 'Slash',
          statusEffects: [],
          passives: [],
        },
        {
          previewActionFlow: [{
            actorCharacterId: 'DAMAGE_CALC_DEFAULT_E2E',
            skillName: 'デフォルト威力詳細',
            damageContext: {
              effectiveDamageRatesByEnemy: { 0: 100 },
              enemyParamBorderByEnemy: { 0: 812 },
              damageBreakdown: {
                targetBreakdowns: [{
                  targetEnemyIndex: 0,
                  targetLabel: 'E1',
                  finalMultiplier: 1,
                  increasePercent: 0,
                  formula: '1.00x',
                  groups: [],
                }],
              },
            },
          }],
        },
        { isCommitted: false }
      );
    });

    const popup = page.locator('#char-detail-popup');
    await popup.locator('.char-popup-tab[data-tab="damage"]').click();
    const pane = popup.locator('[data-role="damage-calc-pane"]').first();

    await expect(pane.locator('[data-role="damage-calc-stat-base"][data-stat="str"]').first()).toHaveText('650');
  });
});
