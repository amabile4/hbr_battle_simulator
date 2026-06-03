import { test, expect } from '@playwright/test';

import { gotoUiNext } from './ui-next-helpers.js';

test.describe('Damage breakdown popup tab', () => {
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
    await expect(popup).toContainText('攻撃バフ枠');
    await expect(popup).toContainText('火属性耐性ダウン');
    await expect(popup).not.toContainText('属性耐性ダウン枠');
    await expect(popup).not.toContainText('落選バフ');
  });
});
