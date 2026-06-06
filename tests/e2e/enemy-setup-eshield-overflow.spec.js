import { test, expect } from '@playwright/test';

import { gotoUiNext } from './ui-next-helpers.js';

const KALEIDO_OUROBOROS_PRESET_ID = 13450815;

async function openEShieldEditorForKaleidoPreset(page) {
  await gotoUiNext(page);
  await page.locator('[role="tab"][data-tab="enemy"]').click();

  const presetSelect = page.locator('#enemy-setup-root [data-action="select-enemy"]');
  await expect(presetSelect).toBeVisible({ timeout: 5000 });
  await presetSelect.selectOption(String(KALEIDO_OUROBOROS_PRESET_ID));

  const editButton = page.locator('#enemy-setup-root [data-action="toggle-edit"]');
  await expect(editButton).toBeVisible({ timeout: 5000 });
  await editButton.click();

  const editor = page.locator('#enemy-setup-root [data-role="enemy-e-shield-editor"]');
  await expect(editor).toBeVisible({ timeout: 5000 });
}

test.describe('Enemy Setup Eシールド staged max handling', () => {
  test('段階別最大値がある敵では max を段階1から派生し count を max 以下に保つ', async ({ page }) => {
    await openEShieldEditorForKaleidoPreset(page);

    const countInput = page.locator('[data-edit-eshield-field="count"]');
    const maxInput = page.locator('[data-edit-eshield-field="max"]');

    // 初期値は count=30 / max=30
    await expect(countInput).toHaveValue('30');
    await expect(maxInput).toHaveValue('30');
    await expect(maxInput).toBeDisabled();

    // count を 45 に変更（max を超える値）
    await countInput.fill('45');
    await countInput.blur();

    // max は段階1由来のまま、count は max 以下に戻る
    await expect(maxInput).toHaveValue('30');
    await expect(countInput).toHaveValue('30');
  });

  test('段階1を変えると disabled の max 表示も同期する', async ({ page }) => {
    await openEShieldEditorForKaleidoPreset(page);

    const countInput = page.locator('[data-edit-eshield-field="count"]');
    const maxInput = page.locator('[data-edit-eshield-field="max"]');
    const stage1Input = page.locator('[data-edit-eshield-stage-index="0"]');

    await expect(maxInput).toBeDisabled();

    // 段階1を 50 に上げる
    await stage1Input.fill('50');
    await stage1Input.blur();
    await expect(maxInput).toHaveValue('50');

    // count を 25 に下げる（max 以下）
    await countInput.fill('25');
    await countInput.blur();

    // max は変わらず 50 のまま
    await expect(maxInput).toHaveValue('50');
    await expect(countInput).toHaveValue('25');
  });
});
