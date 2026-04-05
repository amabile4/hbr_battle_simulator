import test from 'node:test';
import assert from 'node:assert/strict';

import {
  resolveNotFoundRedirectPath,
  resolveNotFoundRedirectUrl,
  shouldRedirectFromNotFound,
} from '../404-redirect.js';

test('resolveNotFoundRedirectPath points nested GitHub Pages 404s to repo-root ui-next entry', () => {
  const redirectPath = resolveNotFoundRedirectPath({
    host: 'amabile4.github.io',
    pathname: '/hbr_battle_simulator/ui/',
  });

  assert.equal(redirectPath, '/hbr_battle_simulator/ui-next/index.html');
});

test('resolveNotFoundRedirectPath keeps localhost redirects rooted at /ui-next', () => {
  const redirectPath = resolveNotFoundRedirectPath({
    host: 'localhost:4173',
    pathname: '/ui/',
  });

  assert.equal(redirectPath, '/ui-next/index.html');
});

test('shouldRedirectFromNotFound stops redirecting when already on the ui-next entry', () => {
  const shouldRedirect = shouldRedirectFromNotFound({
    host: 'amabile4.github.io',
    pathname: '/hbr_battle_simulator/ui-next/index.html',
  });

  assert.equal(shouldRedirect, false);
});

test('resolveNotFoundRedirectUrl builds an absolute URL when origin is available', () => {
  const redirectUrl = resolveNotFoundRedirectUrl({
    origin: 'https://amabile4.github.io',
    host: 'amabile4.github.io',
    pathname: '/hbr_battle_simulator/ui/',
  });

  assert.equal(redirectUrl, 'https://amabile4.github.io/hbr_battle_simulator/ui-next/index.html');
});
