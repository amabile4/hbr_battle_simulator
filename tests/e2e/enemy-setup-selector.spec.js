import { test, expect } from '@playwright/test';

import { gotoUiNext } from './ui-next-helpers.js';

const KALEIDO_OUROBOROS_PRESET_ID = 13450815;
const KALEIDO_OUROBOROS_NAME = '変貌を重ねる不滅の円環';
const TEMPLATE_CATEGORY_LABEL = 'テンプレート';

test('Enemy Setup template category keeps the Eシールド sample preset available by default', async ({ page }) => {
  await gotoUiNext(page);

  await page.locator('[role="tab"][data-tab="enemy"]').click();

  const categorySelect = page.locator('#enemy-setup-root [data-action="select-enemy-category"]');
  const presetSelect = page.locator('#enemy-setup-root [data-action="select-enemy"]');
  await expect(categorySelect).toBeVisible({ timeout: 5000 });
  await expect(presetSelect).toBeVisible({ timeout: 5000 });

  const templateValue = await categorySelect.locator('option').evaluateAll((options, targetLabel) => {
    const match = options.find((option) => option.textContent?.trim() === targetLabel);
    return match?.value ?? null;
  }, TEMPLATE_CATEGORY_LABEL);
  expect(templateValue).not.toBeNull();
  await expect(categorySelect).toHaveValue(String(templateValue));
  await expect(presetSelect.locator(`option[value="${KALEIDO_OUROBOROS_PRESET_ID}"]`)).toHaveCount(1);

  await presetSelect.selectOption(String(KALEIDO_OUROBOROS_PRESET_ID));
  await expect(page.locator('[data-action="set-active-slot"][data-slot-index="0"]')).toContainText(
    KALEIDO_OUROBOROS_NAME,
    { timeout: 5000 }
  );
});

test('Enemy Setup manual edit shows prefilled Eシールド editor for the sample preset', async ({ page }) => {
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
  await expect(page.locator('[data-edit-eshield-field="count"]')).toHaveValue('30');
  await expect(page.locator('[data-edit-eshield-field="max"]')).toHaveValue('30');
  await expect(page.locator('[data-edit-eshield-field="def_up_rate"]')).toHaveValue('0');
  await expect(page.locator('[data-edit-eshield-stage-index]')).toHaveCount(3);
  await expect(page.locator('[data-edit-eshield-stage-index="0"]')).toHaveValue('30');
  await expect(page.locator('[data-edit-eshield-stages]')).toHaveCount(0);
  await expect(page.locator('[data-edit-eshield-element="Fire"]')).toBeChecked();
  await expect(page.locator('[data-edit-eshield-element="Ice"]')).toBeChecked();
});
