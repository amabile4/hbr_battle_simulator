import { test, expect } from '@playwright/test';

import { gotoUiNext } from './ui-next-helpers.js';

test('ui-next loads title badge ranks from json without golden runtime requests', async ({ page }) => {
  const requestedUrls = [];
  page.on('request', (request) => requestedUrls.push(request.url()));

  await gotoUiNext(page);

  expect(requestedUrls.some((url) => url.endsWith('/json/title_badge_rank.json'))).toBe(true);
  expect(requestedUrls.some((url) => url.includes('/golden/'))).toBe(false);
});
