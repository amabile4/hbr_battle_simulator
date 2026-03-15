import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveStyleAssetUrl, resolveStyleImageUrl } from '../src/ui/style-asset-url.js';

test('resolveStyleAssetUrl points to assets/styles for style image filenames', () => {
  const url = resolveStyleAssetUrl('RKayamoriDefault_R1_Thumbnail.webp');

  assert.match(url, /assets\/styles\/RKayamoriDefault_R1_Thumbnail\.webp$/);
});

test('resolveStyleImageUrl reads styles.json-style image fields directly', () => {
  const url = resolveStyleImageUrl({
    id: 1001101,
    image: 'RKayamoriDefault_R1_Thumbnail.webp',
  });

  assert.match(url, /assets\/styles\/RKayamoriDefault_R1_Thumbnail\.webp$/);
});

test('resolveStyleAssetUrl returns empty string for blank filenames', () => {
  assert.equal(resolveStyleAssetUrl(''), '');
  assert.equal(resolveStyleImageUrl({ image: null }), '');
});
