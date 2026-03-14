import { test, expect } from '@playwright/test';

const PAGE_URL = '/ui/index.html';

// ユーティリティ: キャラクター選択をより確実に行う
async function selectCharacterAndStyle(page, slot, characterName, styleValue, spEquipValue = '3') {
    const charSelect = page.locator(`select[data-role="character-select"][data-slot="${slot}"]`);
    const options = await charSelect.locator('option').all();
    let targetValue = null;
    for (const opt of options) {
        const text = await opt.textContent();
        if (text.includes(characterName)) {
            targetValue = await opt.getAttribute('value');
            break;
        }
    }
    if (targetValue) {
        await charSelect.selectOption(targetValue);
    }

    // スタイル選択
    const styleSelect = page.locator(`select[data-role="style-select"][data-slot="${slot}"]`);
    await styleSelect.selectOption(styleValue);

    // SP装備
    const spEquipSelect = page.locator(`select[data-role="start-sp-equip-select"][data-slot="${slot}"]`);
    await spEquipSelect.selectOption(spEquipValue);
}

test.describe('Extra Turn Mechanics', () => {

    test('1 Member Extra Turn Swap Restriction Test (ごきげんダンス)', async ({ page }) => {
        await page.goto(PAGE_URL);
        await page.waitForTimeout(1000);

        // スロット0 (Pos 1) に山脇・ボン・イヴァール (誇り高き魔王の凱旋 -> 1003108) をセット, SP初期値+3
        await selectCharacterAndStyle(page, 0, '山脇・ボン・イヴァール', '1003108', '3');

        await page.locator('button[data-action="initialize"]').click();
        await expect(page.locator('[data-role="status"]')).toHaveText(/Battle initialized/);

        // Pos 1 にごきげんダンス(46003115)をセット
        const actionSelect = page.locator('select[data-action-slot="0"]');
        await actionSelect.selectOption('46003115');

        await page.locator('button[data-action="commit"]').click();

        // ターンがEXになり、Pos 1 のみに[EX]がついていることの確認
        await expect(page.locator('[data-role="turn-label"]')).toContainText('EX');

        const partyStateItems = page.locator('ul[data-role="party-state"] li');
        expect(await partyStateItems.nth(0).textContent()).toContain('[EX]');
        expect(await partyStateItems.nth(1).textContent()).not.toContain('[EX]');

        // Pos 1 (EX持ち) のスワップ先には誰も選べない
        const swapFromSelect = page.locator('select[data-role="swap-from"]');
        await swapFromSelect.selectOption('0');

        const swapToOptions = await page.locator('select[data-role="swap-to"] option').all();
        const swapToValues = await Promise.all(swapToOptions.map(opt => opt.getAttribute('value')));
        const validTargets = swapToValues.filter(val => val !== '' && val !== '0');
        expect(validTargets.length).toBe(0);
    });

    test('2 Members Extra Turn Swap Restriction Test (謀略)', async ({ page }) => {
        await page.goto(PAGE_URL);
        await page.waitForTimeout(1000);

        // Pos 1: 山脇 (我が道を行く など適当、SPは不要なのでデフォ)
        await selectCharacterAndStyle(page, 0, '山脇・ボン・イヴァール', '1003101', '0');
        // Pos 2: 佐月マリ (魔王に仕えし混沌の謀臣 -> 1003607), SP初期値+3
        await selectCharacterAndStyle(page, 1, '佐月 マリ', '1003607', '3');

        await page.locator('button[data-action="initialize"]').click();
        await expect(page.locator('[data-role="status"]')).toHaveText(/Battle initialized/);

        // Pos 2 の佐月マリが「謀略」(46003626) を選択し、対象を Pos 1 (スロット0) にする
        const actionSelect = page.locator('select[data-action-slot="1"]');
        await actionSelect.selectOption('46003626');

        const actionTargetSelect = page.locator('select[data-action-target-slot="1"]');
        await actionTargetSelect.waitFor({ state: 'visible', timeout: 3000 });
        const targetOptions = await actionTargetSelect.locator('option').allTextContents();
        const targetIndex = targetOptions.findIndex(opt => opt.includes('山脇'));
        if (targetIndex >= 0) {
            const val = await actionTargetSelect.locator('option').nth(targetIndex).getAttribute('value');
            await actionTargetSelect.selectOption(val);
        }

        await page.locator('button[data-action="commit"]').click();

        // EXターン確認 & 2人のみに [EX] がついていること
        await expect(page.locator('[data-role="turn-label"]')).toContainText('EX');
        const partyStateItems = page.locator('ul[data-role="party-state"] li');
        expect(await partyStateItems.nth(0).textContent()).toContain('[EX]'); // 山脇
        expect(await partyStateItems.nth(1).textContent()).toContain('[EX]'); // 佐月
        expect(await partyStateItems.nth(2).textContent()).not.toContain('[EX]'); // それ以外

        // Pos 1スワップ検証 -> Pos 2 のみ選べる
        const swapFromSelect = page.locator('select[data-role="swap-from"]');
        await swapFromSelect.selectOption('0');

        // playwrightのpage.locatorの動作安定のため、valueが変わるのを少し待つ
        await page.waitForTimeout(200);

        let swapToOptions = await page.locator('select[data-role="swap-to"] option').all();
        let swapToValues = await Promise.all(swapToOptions.map(opt => opt.getAttribute('value')));
        let validTargets = swapToValues.filter(val => val !== '' && val !== '0');
        expect(validTargets).toEqual(['1']); // Pos 2のみ

        // Pos 2スワップ検証 -> Pos 1 のみ選べる
        await swapFromSelect.selectOption('1');
        await page.waitForTimeout(200);

        swapToOptions = await page.locator('select[data-role="swap-to"] option').all();
        swapToValues = await Promise.all(swapToOptions.map(opt => opt.getAttribute('value')));
        validTargets = swapToValues.filter(val => val !== '' && val !== '1');
        expect(validTargets).toEqual(['0']); // Pos 1のみ

        // ---------------------------------------------------------------------------------
        // 【追加修正】Pos 3 (非EXメンバー) スワップ検証 -> そもそも選べない
        // Fromから操作し始めた時のケース: そもそもFromの選択肢に非EXメンバーが存在しないことを確認
        let swapFromOptions = await page.locator('select[data-role="swap-from"] option').all();
        let swapFromValues = await Promise.all(swapFromOptions.map(opt => opt.getAttribute('value')));
        expect(swapFromValues).not.toContain('2'); // Pos 3 (非EX) はFromの選択肢にない

        // Toから操作し始めた時のケース (すでにFromがEXメンバーである場合、Toには非EXメンバーが含まれないことを確認)
        await swapFromSelect.selectOption('0');
        await page.waitForTimeout(200);
        swapToOptions = await page.locator('select[data-role="swap-to"] option').all();
        const textContents = await Promise.all(swapToOptions.map(opt => opt.textContent()));
        const hasNonExTarget = textContents.some(t => t.includes('Pos 3') || (t !== '(No valid target)' && !t.includes('[EX]')));
        expect(hasNonExTarget).toBeFalsy();
    });

    test('3 Members Extra Turn Swap Restriction Test (ごきげんダンス + 謀略)', async ({ page }) => {
        await page.goto(PAGE_URL);
        await page.waitForTimeout(1000);

        // Pos 1: 山脇 (誇り高き魔王の凱旋 -> 1003108), SP初期値+3
        await selectCharacterAndStyle(page, 0, '山脇・ボン・イヴァール', '1003108', '3');
        // Pos 2: 佐月マリ (魔王に仕えし混沌の謀臣 -> 1003607), SP初期値+3
        await selectCharacterAndStyle(page, 1, '佐月 マリ', '1003607', '3');
        // Pos 3: デフォルトのままでOK

        await page.locator('button[data-action="initialize"]').click();
        await expect(page.locator('[data-role="status"]')).toHaveText(/Battle initialized/);

        // Pos 1: ごきげんダンス(46003115)
        const actionSelect1 = page.locator('select[data-action-slot="0"]');
        await actionSelect1.selectOption('46003115');

        // Pos 2: 佐月マリ「謀略」(46003626)、対象は Pos 3 (スロット2)
        const actionSelect2 = page.locator('select[data-action-slot="1"]');
        await actionSelect2.selectOption('46003626');

        const actionTargetSelect = page.locator('select[data-action-target-slot="1"]');
        await actionTargetSelect.waitFor({ state: 'visible', timeout: 3000 });
        const targetOptions = await actionTargetSelect.locator('option').all();
        // 明示的に Pos 3 をアクション対象として選ぶ
        let foundValue = null;
        for (const opt of targetOptions) {
            const text = await opt.textContent();
            if (text.includes('Pos 3')) {
                foundValue = await opt.getAttribute('value');
                break;
            }
        }
        if (foundValue) {
            await actionTargetSelect.selectOption(foundValue);
        }

        await page.locator('button[data-action="commit"]').click();

        // 3人に [EX] がついていること
        await expect(page.locator('[data-role="turn-label"]')).toContainText('EX');
        const partyStateItems = page.locator('ul[data-role="party-state"] li');
        expect(await partyStateItems.nth(0).textContent()).toContain('[EX]'); // 山脇
        expect(await partyStateItems.nth(1).textContent()).toContain('[EX]'); // 佐月
        expect(await partyStateItems.nth(2).textContent()).toContain('[EX]'); // Pos 3
        expect(await partyStateItems.nth(3).textContent()).not.toContain('[EX]'); // 後衛など

        // Pos 1スワップ検証 -> Pos 2 と Pos 3 のみ選べる
        const swapFromSelect = page.locator('select[data-role="swap-from"]');
        await swapFromSelect.selectOption('0');
        await page.waitForTimeout(200);

        let swapToOptions = await page.locator('select[data-role="swap-to"] option').all();
        let swapToValues = await Promise.all(swapToOptions.map(opt => opt.getAttribute('value')));
        let validTargets = swapToValues.filter(val => val !== '' && val !== '0');

        // 順番は問わないが、1(Pos 2)と2(Pos 3)が含まれていること
        expect(validTargets.sort()).toEqual(['1', '2']);

        // Pos 3スワップ検証 -> Pos 1 と Pos 2 のみ選べる
        await swapFromSelect.selectOption('2');
        await page.waitForTimeout(200);

        swapToOptions = await page.locator('select[data-role="swap-to"] option').all();
        swapToValues = await Promise.all(swapToOptions.map(opt => opt.getAttribute('value')));
        validTargets = swapToValues.filter(val => val !== '' && val !== '2');
        expect(validTargets.sort()).toEqual(['0', '1']);
    });

});
