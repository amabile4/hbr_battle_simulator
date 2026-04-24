import { test, expect } from '@playwright/test';

import {
  applyParty,
  fillPartySetupSlots,
  gotoUiNext,
} from './ui-next-helpers.js';

async function mountSyntheticEShieldRow(page) {
  await page.evaluate(async () => {
    const existing = document.querySelector('[data-test-id="synthetic-eshield-row"]');
    existing?.remove();

    const { TurnRowController } = await import('/ui-next/components/turn-row.js');
    const { CharacterStyle, Party, createBattleStateFromParty } = await import('/src/index.js');

    function createSkill(id, name) {
      return {
        skill_id: id,
        skillId: id,
        id,
        name,
        target_type: 'Self',
        targetType: 'Self',
        parts: [{ skill_type: 'Protection', target_type: 'Self' }],
      };
    }

    function createParty() {
      const members = Array.from({ length: 6 }, (_, index) =>
        new CharacterStyle({
          characterId: `E2E${index + 1}`,
          characterName: `E2E${index + 1}`,
          styleId: 9300 + index,
          styleName: `E2E${index + 1}`,
          partyIndex: index,
          position: index,
          initialSP: 10,
          skills: [createSkill(9900 + index, index === 0 ? 'Synthetic Slash' : `Protection${index + 1}`)],
          passives: [],
        })
      );
      return new Party(members);
    }

    function createState(eShieldStateByEnemy) {
      const state = createBattleStateFromParty(createParty());
      state.turnState.enemyState.enemyCount = 3;
      state.turnState.enemyState.enemyNamesByEnemy = {
        0: 'Alpha',
        1: 'Beta',
        2: 'Gamma',
      };
      state.turnState.enemyState.eShieldStateByEnemy = eShieldStateByEnemy;
      return state;
    }

    const stateBefore = createState({
      0: { current: 10, max: 10, elements: ['Fire'] },
      1: { current: 10, max: 10, elements: ['Light', 'Dark'] },
      2: { current: 10, max: 10, elements: ['Fire', 'Ice', 'Thunder'] },
    });
    const stateAfter = createState({
      0: { current: 7, max: 10, elements: ['Fire'] },
      1: { current: 4, max: 10, elements: ['Light', 'Dark'] },
      2: { current: 0, max: 10, elements: ['Fire', 'Ice', 'Thunder'] },
    });

    const host = document.createElement('div');
    host.setAttribute('data-test-id', 'synthetic-eshield-row');
    host.style.margin = '24px 0';
    document.body.appendChild(host);

    const row = new TurnRowController({
      root: host,
      store: {
        getStyleById() {
          return null;
        },
        getCharacterByLabel() {
          return null;
        },
      },
      enemyPresets: [],
      turnIndex: 0,
      rowMode: 'input',
      rowDiagnostics: { warnings: [], error: null },
      record: null,
      replayTurn: null,
      operations: [],
      operationState: {
        kishinkaStatus: { hasTezuka: false },
        makaiKiheiStatus: { hasYamawaki: false, available: false, remainingUses: 0 },
      },
      stateBefore,
      stateAfter,
      previewActionFlow: [],
      simulatorSettings: {
        targetSelection: { enemyMode: 'simple', allyMode: 'simple' },
        captureUntilBattleEnd: false,
      },
      odState: {
        preemptiveOdLevel: null,
        interruptOdLevel: null,
        activatablePreemptive: [],
        activatableInterrupt: [],
      },
      onSlotChange() {},
      onCommit() {},
      onNoteChange() {},
      onPreviewRequest() {},
      onOdChange() {},
      onOperationAdd() {},
      onOperationRemove() {},
    });
    row.mount();
  });
}

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

  test('enemy detail popup talisman/disaster/undermine icon assets are browser-loadable', async ({ page }) => {
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
        undermine: await loadImage('../assets/skill_type/Undermine.webp'),
      };
    });

    expect(results.talisman.ok, JSON.stringify(results.talisman)).toBeTruthy();
    expect(results.disaster.ok, JSON.stringify(results.disaster)).toBeTruthy();
    expect(results.undermine.ok, JSON.stringify(results.undermine)).toBeTruthy();
  });

  test('enemy detail popup renders Undermine preview status with 蝕 label and icon', async ({ page }) => {
    await gotoUiNext(page);

    await page.evaluate(async () => {
      const { EnemyDetailPopup } = await import('/ui-next/components/enemy-detail-popup.js');
      new EnemyDetailPopup().show({
        enemies: [
          {
            occupied: true,
            name: 'Alpha',
            statuses: [
              {
                statusType: 'Undermine',
                targetIndex: 0,
                remaining: 2,
                exitCond: 'EnemyTurnEnd',
                sourceSkillName: '黒蝶霹靂制裁',
                sourceSkillDesc: '2ターンの間 敵全体の攻撃力と防御力を下げ 蝕状態にし 雷属性攻撃',
              },
            ],
          },
        ],
        activeEnemyIndex: 0,
      });
    });

    const popup = page.locator('.enemy-detail-popup-container');
    const statusList = popup.locator(
      '[data-role="enemy-popup-column"][data-selected="true"] [data-role="enemy-popup-status-list"]'
    );

    await expect(statusList).toContainText('蝕');
    await expect(statusList).toContainText('2T');
    await expect(statusList).toContainText('黒蝶霹靂制裁');
    await expect(statusList.locator('img[src*="Undermine.webp"]')).toHaveCount(1);
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

  test('enemy detail popup preview renders source skill desc when preview enemy status includes it', async ({ page }) => {
    await gotoUiNext(page);

    await page.evaluate(async () => {
      const { EnemyDetailPopup } = await import('/ui-next/components/enemy-detail-popup.js');
      new EnemyDetailPopup().show({
        enemies: [
          {
            occupied: true,
            name: 'Alpha',
            statuses: [],
          },
        ],
        activeEnemyIndex: 0,
        previewActionFlow: [
          {
            order: 1,
            skillId: 46001311,
            skillName: 'ヒットチャートからの一閃',
            enemyStatusChanges: [
              {
                statusType: 'DefenseDown',
                targetIndex: 0,
                remaining: 2,
                exitCond: 'EnemyTurnEnd',
                sourceSkillName: 'ヒットチャートからの一閃',
                sourceSkillDesc: '敵の防御力と闇属性防御力を下げる',
              },
            ],
          },
        ],
      });
    });

    const popup = page.locator('.enemy-detail-popup-container');
    await expect(popup).toContainText('プレビュー（コミット見込み）');
    await expect(popup).toContainText('ヒットチャートからの一閃');
    await expect(popup).toContainText('敵の防御力と闇属性防御力を下げる');
  });

  test('enemy detail popup omits source skill desc for Dead preview status', async ({ page }) => {
    await gotoUiNext(page);

    await page.evaluate(async () => {
      const { EnemyDetailPopup } = await import('/ui-next/components/enemy-detail-popup.js');
      new EnemyDetailPopup().show({
        enemies: [
          {
            occupied: true,
            name: 'Alpha',
            statuses: [],
          },
          {
            occupied: true,
            dead: true,
            name: 'Beta',
            statuses: [],
          },
        ],
        activeEnemyIndex: 1,
        previewActionFlow: [
          {
            order: 1,
            skillId: 46009999,
            skillName: 'トドメの一撃',
            enemyStatusChanges: [
              {
                statusType: 'Dead',
                targetIndex: 1,
                remaining: 0,
                exitCond: 'Eternal',
                sourceSkillName: 'トドメの一撃',
                sourceSkillDesc: '敵全体に大ダメージを与え戦闘不能にする',
              },
            ],
          },
        ],
      });
    });

    const popup = page.locator('.enemy-detail-popup-container');
    await expect(popup).toContainText('E2 Beta');
    await expect(popup).toContainText('Dead');
    await expect(popup).toContainText('プレビュー（コミット見込み）');
    await expect(popup).toContainText('トドメの一撃');
    await expect(popup).not.toContainText('敵全体に大ダメージを与え戦闘不能にする');
  });

  test('turn row Eシールド strip stays between the enemy trigger and OD gauge', async ({ page }) => {
    await gotoUiNext(page);
    await mountSyntheticEShieldRow(page);

    const row = page.locator('[data-test-id="synthetic-eshield-row"]');
    const strip = row.locator('[data-role="turn-info-e-shield-strip"]');
    const trigger = row.locator('[data-role="enemy-detail-trigger"]');
    const gauge = row.locator('[data-turn-od-gauge]');

    await expect(strip).toBeVisible();
    await expect(strip.locator('[data-role="turn-info-e-shield-badge"]')).toHaveCount(3);
    await expect(
      strip.locator('[data-role="turn-info-e-shield-badge"][data-eshield-depleted="true"]')
    ).toHaveCount(1);

    const triggerBox = await trigger.boundingBox();
    const stripBox = await strip.boundingBox();
    const gaugeBox = await gauge.boundingBox();

    expect(triggerBox).toBeTruthy();
    expect(stripBox).toBeTruthy();
    expect(gaugeBox).toBeTruthy();
    expect(stripBox.y).toBeGreaterThan(triggerBox.y);
    expect(gaugeBox.y).toBeGreaterThan(stripBox.y);
    expect(stripBox.height).toBeLessThan(92);
  });

  test('turn row enemy popup reuses the resolved Eシールド badge and value', async ({ page }) => {
    await gotoUiNext(page);
    await mountSyntheticEShieldRow(page);

    const row = page.locator('[data-test-id="synthetic-eshield-row"]');
    await row.locator('[data-role="enemy-detail-trigger"]').click();

    const popup = page.locator('.enemy-detail-popup-container');
    await expect(popup).toBeVisible();
    const e1Column = popup.locator('[data-role="enemy-popup-column"][data-enemy-tab-index="0"]');
    await expect(e1Column.locator('[data-role="enemy-popup-e-shield-summary"]')).toHaveCount(1);
    await expect(e1Column.locator('[data-role="enemy-popup-e-shield-badge"]')).toHaveCount(1);
    await expect(e1Column).toContainText('7/10');
    await expect(e1Column).not.toContainText('10/10');

    await popup.locator('[data-role="enemy-popup-tab"][data-enemy-tab-index="2"]').click();
    const e3Column = popup.locator('[data-role="enemy-popup-column"][data-enemy-tab-index="2"]');
    const depletedBadge = e3Column.locator(
      '[data-role="enemy-popup-e-shield-badge"][data-eshield-depleted="true"]'
    );
    await expect(depletedBadge).toHaveCount(1);
    await expect(e3Column).toContainText('0/10');
  });
});
