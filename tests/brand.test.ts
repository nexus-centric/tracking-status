import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { APP_NAME, APP_SHORT_NAME, BACKUP_PREFIX, manifest } from '../src/core/brand.js';

test('display name lives in one constant; html and manifest are generated from it', () => {
  assert.equal(APP_NAME, 'The Study Hub');
  assert.equal(manifest().name, APP_NAME);
  assert.equal(manifest().short_name, APP_SHORT_NAME);
  assert.match(BACKUP_PREFIX, /^[a-z0-9-]+$/);
  const html = readFileSync('index.html', 'utf8');
  assert.match(html, /<title>%APP_NAME%<\/title>/);
  assert.doesNotMatch(html, /Tiến độ học/);
});
