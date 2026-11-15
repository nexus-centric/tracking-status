import { test } from 'node:test';
import assert from 'node:assert/strict';
import { backupDue, daysSince } from '../src/core/backup.js';

const now = Date.UTC(2026, 10, 15);
const ago = (d: number) => new Date(now - d * 86_400_000).toISOString();

test('no reminder while there is little real data', () => {
  assert.equal(backupDue({ lastBackup: null, snoozeUntil: null, realLogs: 2, now }), false);
});

test('reminds when never backed up or the last backup is 14+ days old', () => {
  assert.equal(backupDue({ lastBackup: null, snoozeUntil: null, realLogs: 8, now }), true);
  assert.equal(backupDue({ lastBackup: ago(3), snoozeUntil: null, realLogs: 8, now }), false);
  assert.equal(backupDue({ lastBackup: ago(14), snoozeUntil: null, realLogs: 8, now }), true);
});

test('snooze hides the reminder until it expires', () => {
  assert.equal(backupDue({ lastBackup: null, snoozeUntil: ago(-2), realLogs: 8, now }), false);
  assert.equal(backupDue({ lastBackup: null, snoozeUntil: ago(1), realLogs: 8, now }), true);
});

test('daysSince handles missing and invalid values', () => {
  assert.equal(daysSince(null, now), null);
  assert.equal(daysSince('nope', now), null);
  assert.equal(daysSince(ago(5), now), 5);
});
