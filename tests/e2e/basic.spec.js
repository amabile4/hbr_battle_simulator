import { test, expect } from '@playwright/test';

const PAGE_URL = '/ui/index.html';

test.describe('HBR Battle Simulator Adapter Demo Core Features', () => {

    test('Page Load Test', async ({ page }) => {
        await page.goto(PAGE_URL);
        await expect(page).toHaveTitle('HBR Battle Simulator Adapter Demo');
    });

    test('Battle Initialization Test', async ({ page }) => {
        await page.goto(PAGE_URL);

        // キャラ・スタイルがロードされるのを待つ
        await page.waitForTimeout(3000); // 簡易的な待機（APIモックやセレクタのロード完了待機が望ましい）

        // Initialize Battleボタンをクリック
        const initButton = page.locator('button[data-action="initialize"]');
        await initButton.click();

        // Statusが更新されていることを確認
        const status = page.locator('[data-role="status"]');
        await expect(status).toHaveText(/Battle initialized/); // Adapterの実装に合わせて文言は要調整

        // Turn表示が初期化されているか確認
        const turnLabel = page.locator('[data-role="turn-label"]');
        await expect(turnLabel).not.toBeEmpty();
    });

    test('Turn Execution Test', async ({ page }) => {
        await page.goto(PAGE_URL);
        await page.waitForTimeout(3000);

        await page.locator('button[data-action="initialize"]').click();

        // 初期化完了を待つ (StatusがInitial状態になるなど)
        await expect(page.locator('[data-role="status"]')).toHaveText(/Battle initialized/);

        // Turn 1 をコミットする
        const commitButton = page.locator('button[data-action="commit"]');
        await commitButton.click();

        // Recordsテーブルに行が追加されたか確認
        const recordRows = page.locator('tbody[data-role="record-body"] tr');
        await expect(recordRows).toHaveCount(1);

        const turnIdCell = recordRows.first().locator('td').first();
        await expect(turnIdCell).toHaveText('1');
    });

    test('Character Swap Test', async ({ page }) => {
        await page.goto(PAGE_URL);
        await page.waitForTimeout(3000);

        await page.locator('button[data-action="initialize"]').click();
        await expect(page.locator('[data-role="status"]')).toHaveText(/Battle initialized/);

        // スワップ元のスロットIDなどを取得
        const partyStateItems = page.locator('ul[data-role="party-state"] li');
        const initialText = await partyStateItems.first().textContent(); // 前衛のPos 1

        // Edge Case: スワップ元と同じキャラクターは、スワップ先（Swap To）の選択肢に存在しない（無効である）ことを検証する
        await page.locator('select[data-role="swap-from"]').selectOption('0'); // Pos 1 (0-indexed)
        const swapToOptions = await page.locator('select[data-role="swap-to"] option').all();
        // swapToの全optionのvalue属性を取得し、"0" (Pos 1) が含まれていないことを確認
        const swapToValues = await Promise.all(swapToOptions.map(opt => opt.getAttribute('value')));
        expect(swapToValues).not.toContain('0');

        // 通常の正常系スワップ検証: Pos 1 と Pos 4 (後衛) を入れ替える
        await page.locator('select[data-role="swap-from"]').selectOption('0'); // Pos 1
        await page.locator('select[data-role="swap-to"]').selectOption('3');   // Pos 4
        await page.locator('button[data-action="swap"]').click();

        // スワップ後にUIのparty-state文字列が変わっていることを確認する
        const afterSwapText = await partyStateItems.first().textContent();
        expect(afterSwapText).not.toBe(initialText);

        // もう一度コミットして結果を見るか、UI表示が変更されているか確認
        // ここでは単純にコミットして動作確認とする
        await page.locator('button[data-action="commit"]').click();
    });
});
