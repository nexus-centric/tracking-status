import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  boundaryIndex, elapsedMs, focusMsAt, formatClock, minutesToLog, nextBoundaryAt, parseSession, parseTimerPrefs,
  pauseSession, phaseAt, resumeSession, startSession, stopSession, suggestedKind, viewAt, DEFAULT_POMODORO,
} from '../src/core/timer.js';

const M = 60_000;
const T0 = Date.UTC(2026, 10, 15, 13, 0, 0);
const base = { trackId: 't1', day: '2026-11-15' };

test('stopwatch counts wall-clock time and excludes paused stretches', () => {
  let s = startSession({ ...base, mode: 'stopwatch' }, T0);
  assert.equal(elapsedMs(s, T0 + 10 * M), 10 * M);
  s = pauseSession(s, T0 + 10 * M);
  assert.equal(elapsedMs(s, T0 + 50 * M), 10 * M, 'paused time does not count');
  s = resumeSession(s, T0 + 50 * M);
  assert.equal(elapsedMs(s, T0 + 55 * M), 15 * M);
  s = stopSession(s, T0 + 57 * M);
  assert.equal(s.status, 'stopped');
  assert.equal(elapsedMs(s, T0 + 999 * M), 17 * M, 'stopped time is frozen');
  assert.equal(minutesToLog(s, T0 + 999 * M), 17);
});

test('pause and resume are idempotent', () => {
  const s = startSession({ ...base, mode: 'stopwatch' }, T0);
  const p = pauseSession(s, T0 + M);
  assert.equal(pauseSession(p, T0 + 5 * M), p);
  const r = resumeSession(p, T0 + 2 * M);
  assert.equal(resumeSession(r, T0 + 3 * M), r);
});

test('a reload in the middle restores the same elapsed time from timestamps', () => {
  const s = startSession({ ...base, mode: 'stopwatch' }, T0);
  const restored = parseSession(JSON.stringify(s));
  assert.ok(restored);
  // e.g. the tab slept for 40 minutes: time is computed, not counted.
  assert.equal(elapsedMs(restored, T0 + 40 * M), 40 * M);
});

test('clock going backwards never yields negative time', () => {
  const s = startSession({ ...base, mode: 'stopwatch' }, T0);
  assert.equal(elapsedMs(s, T0 - 5 * M), 0);
});

test('countdown caps at the target and reports finished', () => {
  const s = startSession({ ...base, mode: 'countdown', targetMin: 30 }, T0);
  const v = viewAt(s, T0 + 12 * M);
  assert.equal(v.displayMs, 18 * M);
  assert.equal(v.finished, false);
  assert.equal(nextBoundaryAt(s, T0 + 12 * M), T0 + 30 * M);
  const done = viewAt(s, T0 + 45 * M);
  assert.equal(done.finished, true);
  assert.equal(done.displayMs, 0);
  assert.equal(minutesToLog(s, T0 + 45 * M), 30);
  assert.equal(nextBoundaryAt(s, T0 + 45 * M), null);
  assert.equal(boundaryIndex(s, T0 + 10 * M), 0);
  assert.equal(boundaryIndex(s, T0 + 31 * M), 1);
});

test('pomodoro sequence: focus, break x3, long break after 4 focus blocks', () => {
  const p = DEFAULT_POMODORO; // 25/5, long 20 every 4
  const kinds = [0, 25, 30, 55, 60, 85, 90, 115, 135].map((m) => phaseAt(p, m * M).kind);
  assert.deepEqual(kinds, ['focus', 'break', 'focus', 'break', 'focus', 'break', 'focus', 'long', 'focus']);
  const cycle = 4 * 25 + 3 * 5 + 20; // 135 minutes
  assert.equal(phaseAt(p, cycle * M).index, 8);
  assert.equal(phaseAt(p, cycle * M).focusBefore, 4);
  assert.equal(phaseAt(p, (cycle - 1) * M).kind, 'long');
});

test('pomodoro logs focus minutes only', () => {
  const p = DEFAULT_POMODORO;
  assert.equal(focusMsAt(p, 27 * M), 25 * M, 'inside the first break');
  assert.equal(focusMsAt(p, 40 * M), 35 * M, '25 + 10 into the second focus');
  const s = startSession({ ...base, mode: 'pomodoro' }, T0);
  assert.equal(minutesToLog(s, T0 + 60 * M), 50);
  const v = viewAt(s, T0 + 27 * M);
  assert.equal(v.phase?.kind, 'break');
  assert.equal(v.displayMs, 3 * M);
  assert.equal(nextBoundaryAt(s, T0 + 27 * M), T0 + 30 * M);
});

test('pomodoro respects a custom configuration', () => {
  const s = startSession({ ...base, mode: 'pomodoro', pomo: { focus: 50, brk: 10, long: 20, every: 2 } }, T0);
  assert.equal(viewAt(s, T0 + 55 * M).phase?.kind, 'break');
  assert.equal(viewAt(s, T0 + 115 * M).phase?.kind, 'long');
  assert.equal(viewAt(s, T0 + 130 * M).phase?.kind, 'focus');
  assert.equal(boundaryIndex(s, T0 + 130 * M), 4);
});

test('paused sessions have no pending boundary', () => {
  const s = pauseSession(startSession({ ...base, mode: 'pomodoro' }, T0), T0 + M);
  assert.equal(nextBoundaryAt(s, T0 + 2 * M), null);
});

test('parseSession rejects malformed values and clamps numbers', () => {
  assert.equal(parseSession(null), null);
  assert.equal(parseSession('not json'), null);
  assert.equal(parseSession('{"v":2}'), null);
  assert.equal(parseSession(JSON.stringify({ ...startSession({ ...base, mode: 'stopwatch' }, T0), runStart: null })), null, 'running without a start time');
  const ok = parseSession(JSON.stringify({ ...startSession({ ...base, mode: 'pomodoro' }, T0), pomo: { focus: 9999, brk: -3 } }));
  assert.ok(ok);
  assert.equal(ok.pomo.focus, 180);
  assert.equal(ok.pomo.brk, 1);
});

test('timer prefs fall back to defaults', () => {
  assert.equal(parseTimerPrefs(null).mode, 'pomodoro');
  assert.equal(parseTimerPrefs('{"mode":"countdown","targetMin":45,"sound":false}').targetMin, 45);
  assert.equal(parseTimerPrefs('{"sound":false}').sound, false);
  assert.equal(parseTimerPrefs('garbage').targetMin, 25);
});

test('formatting and suggested kind', () => {
  assert.equal(formatClock(0), '00:00');
  assert.equal(formatClock(25 * M), '25:00');
  assert.equal(formatClock(61 * M + 5000), '1:01:05');
  assert.equal(suggestedKind(10), 'tiny');
  assert.equal(suggestedKind(15), 'full');
});
