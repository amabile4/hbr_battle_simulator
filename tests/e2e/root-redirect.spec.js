import { test, expect } from '@playwright/test';

test('root path redirects to ui-next entry', async ({ page }) => {
  await page.goto('/');
  await page.waitForURL('**/ui-next/index.html', { timeout: 10000 });
  await expect(page).toHaveURL(/\/ui-next\/index\.html$/);
  await expect(page.locator('[data-action="open-picker"]').first()).toBeVisible({ timeout: 10000 });
});

test('legacy ui path 404 redirects once to ui-next entry', async ({ page }) => {
  await page.goto('/ui/');
  await page.waitForURL('**/ui-next/index.html', { timeout: 10000 });
  await expect(page).toHaveURL(/\/ui-next\/index\.html$/);
  await expect(page.locator('[data-action="open-picker"]').first()).toBeVisible({ timeout: 10000 });
});
