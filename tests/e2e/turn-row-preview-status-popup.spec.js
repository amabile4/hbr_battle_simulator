import { test, expect } from '@playwright/test';

import {
  applyParty,
  fillPartySetupSlots,
  gotoUiNext,
} from './ui-next-helpers.js';

test.describe('Turn row preview status popup', () => {
  test('input row enemy detail popup shows preview section at top', async ({ page }) => {
    await gotoUiNext(page);
    await fillPartySetupSlots(page, [0, 1, 2, 3]);
    const inputRow = await applyParty(page);

    const trigger = inputRow.locator('[data-role="enemy-detail-trigger"]');
    await expect(trigger).toBeVisible({ timeout: 5000 });
    await trigger.click({ button: 'right' });

    const popup = page.locator('.enemy-detail-popup-container');
    await expect(popup).toBeVisible({ timeout: 5000 });
    await expect(popup).toContainText('プレビュー（コミット見込み）');
  });

  test('enemy detail popup talisman/disaster icon assets are browser-loadable', async ({ page }) => {
    await gotoUiNext(page);

    const results = await page.evaluate(async () => {
      async function loadImage(relativePath) {
        const src = new URL(relativePath, window.location.href).href;
        const image = new Image();
        image.src = src;

        try {
          await image.decode();
        } catch (error) {
          return {
            ok: false,
            src,
            error: String(error?.message ?? error ?? 'decode failed'),
            complete: image.complete,
            naturalWidth: image.naturalWidth,
            naturalHeight: image.naturalHeight,
          };
        }

        return {
          ok: image.complete && image.naturalWidth > 0 && image.naturalHeight > 0,
          src,
          complete: image.complete,
          naturalWidth: image.naturalWidth,
          naturalHeight: image.naturalHeight,
        };
      }

      return {
        talisman: await loadImage('../assets/skill_type/Talisman.webp'),
        disaster: await loadImage('../assets/skill_type/Disaster.webp'),
      };
    });

    expect(results.talisman.ok, JSON.stringify(results.talisman)).toBeTruthy();
    expect(results.disaster.ok, JSON.stringify(results.disaster)).toBeTruthy();
  });

  test('enemy detail popup renders talisman/disaster as compact status blocks', async ({ page }) => {
    await gotoUiNext(page);

    await page.evaluate(async () => {
      const { EnemyDetailPopup } = await import('/ui-next/components/enemy-detail-popup.js');
      new EnemyDetailPopup().show({
        enemies: [
          {
            occupied: true,
            name: 'Alpha',
            statuses: [],
            talismanState: { active: true, level: 3, maxLevel: 10 },
            disasterState: { active: true, level: 2, maxLevel: 10, penaltyPerLevel: 7 },
          },
        ],
        activeEnemyIndex: 0,
      });
    });

    const popup = page.locator('.enemy-detail-popup-container');
    const statusList = popup.locator(
      '[data-role="enemy-popup-column"][data-selected="true"] [data-role="enemy-popup-status-list"]'
    );

    await expect(statusList.locator('[data-role="enemy-popup-talisman-block"]')).toHaveCount(1);
    await expect(statusList.locator('[data-role="enemy-popup-disaster-block"]')).toHaveCount(1);
    await expect(popup.locator('[data-role="enemy-popup-talisman-section"]')).toHaveCount(0);
    await expect(popup.locator('[data-role="enemy-popup-disaster-section"]')).toHaveCount(0);
    await expect(statusList).toContainText('霊符');
    await expect(statusList).toContainText('Lv3/10');
    await expect(statusList).toContainText('全能力-30');
    await expect(statusList).toContainText('禍');
    await expect(statusList).toContainText('Lv2/10');
    await expect(statusList).toContainText('全能力-14');
  });
});
