/**
 * スキルコストラベル表示 E2E テスト
 *
 * 確認内容:
 * 1. Apply 後の未コミット行のスキル select option が "SP N" 形式（スペース区切り）で表示される
 * 2. 旧形式の "SP0" や "SP" のみ（数値なし）が混入していない
 * 3. EP / Token 消費スキルが正しく "EP N" / "Token N" 形式で表示される（該当スタイルがある場合）
 *
 * 前提: ui-next/index.html を使用する。
 * テストは最初のスロットに任意のスタイルを選択して Apply した後の状態で検証する。
 */
import { test, expect } from '@playwright/test';

const PAGE_URL = '/ui-next/index.html';

/**
 * Apply までの共通セットアップ: 最初の 3 スロットにスタイルを選択して Apply を押す。
 * ui-next のスタイルピッカーを使う簡易版（最初のスタイルを順に選ぶ）。
 */
async function applyParty(page) {
  await page.goto(PAGE_URL);
  // データ読み込みを待つ
  await page.waitForSelector('[data-action="open-picker"]', { timeout: 10000 });

  // 前衛スロット 0〜2 の main open-picker ボタンをクリックしてピッカーを開き、
  // 最初のスタイルカードを選択する
  for (let i = 0; i < 3; i++) {
    const openBtn = page.locator(`[data-action="open-picker"][data-slot-index="${i}"][data-mode="main"]`).first();
    if (!(await openBtn.isVisible())) continue;
    await openBtn.click();

    // ピッカーオーバーレイが表示されるのを待つ
    await page.waitForSelector('#style-picker-overlay:not(.hidden)', { timeout: 5000 });

    // i 番目のキャラクターグループの最初のスタイルカードをクリック
    // （同じキャラクターを複数スロットに選ぶと前スロットがクリアされてしまうため）
    const targetSection = page.locator('#picker-body .team-section').nth(i);
    await targetSection.waitFor({ timeout: 5000 });
    const firstCard = targetSection.locator('[data-style-id]').first();
    await firstCard.click();

    // ピッカーが閉じるのを待つ（overlay に .hidden が付く）
    await page.waitForSelector('#style-picker-overlay.hidden', { timeout: 3000 }).catch(() => {});
  }

  // Apply ボタンを押す
  const applyBtn = page.locator('[data-role="apply-btn"]');
  await expect(applyBtn).toBeEnabled({ timeout: 5000 });
  await applyBtn.click();

  // スキル select が表示されるのを待つ
  await page.waitForSelector('select[data-skill-select]', { timeout: 5000 });
}

test.describe('スキルコストラベル表示', () => {
  test('Apply 後のスキル select option が "SP N" 形式（スペース区切り）で表示される', async ({ page }) => {
    await applyParty(page);

    // スキル select を取得（Apply 直後は全て未コミット行）
    const skillSelects = page.locator('select[data-skill-select]');
    const count = await skillSelects.count();
    expect(count).toBeGreaterThan(0);

    // 全 select の全 option テキストを収集
    const allOptionTexts = [];
    for (let i = 0; i < count; i++) {
      const select = skillSelects.nth(i);
      const options = await select.locator('option').allTextContents();
      allOptionTexts.push(...options.filter((t) => t.trim() && !t.includes('スキル選択')));
    }

    expect(allOptionTexts.length).toBeGreaterThan(0);

    for (const text of allOptionTexts) {
      const trimmed = text.trim();
      // SP コスト付き option は "SP N " で始まるはず（N は 0 以上の整数）
      // "SP0 " のような旧形式（スペースなし）が混入していないことを確認
      if (trimmed.startsWith('SP')) {
        expect(trimmed).toMatch(
          /^SP (\d+|ALL)\s/,
          `option "${trimmed}" が "SP N " 形式でない（旧形式 "SP0" や "SP" のみを含む可能性）`
        );
      }
      // EP コスト付き option
      if (trimmed.startsWith('EP')) {
        expect(trimmed).toMatch(/^EP \d+\s/);
      }
      // Token コスト付き option
      if (trimmed.startsWith('Token')) {
        expect(trimmed).toMatch(/^Token (\d+|ALL)\s/);
      }
    }
  });

  test('少なくとも 1 つの option が "SP " で始まる（スキルコストが表示されている）', async ({ page }) => {
    await applyParty(page);

    const skillSelects = page.locator('select[data-skill-select]');
    const count = await skillSelects.count();
    expect(count).toBeGreaterThan(0);

    let foundSpOption = false;
    for (let i = 0; i < count; i++) {
      const options = await skillSelects.nth(i).locator('option').allTextContents();
      if (options.some((t) => t.trim().startsWith('SP '))) {
        foundSpOption = true;
        break;
      }
    }

    expect(foundSpOption).toBe(true);
  });
});
