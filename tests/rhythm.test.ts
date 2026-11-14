import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addDays, weekStart, weekday, isDay, diffDays } from '../src/core/dates.js';
import { canUseBusy, dayStatus, heatmap, last7, makeCtx, missRun, momentum, todayState, weekResult, weekStreak } from '../src/core/rhythm.js';
import { log, mark, track } from './helpers.js';
import { DEFAULT_SETTINGS } from '../src/core/types.js';

// 2026-11-02 is a Monday.
test('date helpers', () => {
  assert.equal(weekday('2026-11-02'), 1);
  assert.equal(weekStart('2026-11-08'), '2026-11-02');
  assert.equal(weekStart('2026-11-02'), '2026-11-02');
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(diffDays('2026-03-30', '2026-03-28'), 2);
  assert.ok(isDay('2026-02-28'));
  assert.ok(!isDay('2026-02-30'));
});

test('day status priorities: log beats rest, pause beats miss, open today', () => {
  const t = track({ restDays: [0], pauses: [{ from: '2026-11-05', to: '2026-11-06' }] });
  const ctx = makeCtx({ track: t, logs: [log('2026-11-08'), log('2026-11-02')], marks: [mark('2026-11-04', 'busy')] }, '2026-11-10');
  assert.equal(dayStatus(ctx, '2026-11-01'), 'before');
  assert.equal(dayStatus(ctx, '2026-11-02'), 'done');
  assert.equal(dayStatus(ctx, '2026-11-03'), 'miss');
  assert.equal(dayStatus(ctx, '2026-11-04'), 'busy');
  assert.equal(dayStatus(ctx, '2026-11-05'), 'paused');
  assert.equal(dayStatus(ctx, '2026-11-08'), 'done'); // Sunday rest day, but logged
  assert.equal(dayStatus(ctx, '2026-11-09'), 'miss');
  assert.equal(dayStatus(ctx, '2026-11-10'), 'open');
  assert.equal(dayStatus(ctx, '2026-11-11'), 'future');
});

test('a log before createdAt moves the start back (backfill)', () => {
  const ctx = makeCtx({ track: track(), logs: [log('2026-10-30')], marks: [] }, '2026-11-02');
  assert.equal(ctx.start, '2026-10-30');
  assert.equal(dayStatus(ctx, '2026-10-31'), 'miss');
});

test('last7 counts done, off and missed days', () => {
  const t = track({ restDays: [6, 0] });
  const logs = ['2026-11-02', '2026-11-03', '2026-11-05', '2026-11-06'].map((d) => log(d));
  const r = last7(makeCtx({ track: t, logs, marks: [] }, '2026-11-08'));
  assert.deepEqual([r.done, r.off, r.missed], [4, 2, 1]);
});

test('weekly target is capped by available days and prorated for a mid-week start', () => {
  const t = track({ weeklyTarget: 5, restDays: [6, 0] });
  const logs = ['2026-11-02', '2026-11-03', '2026-11-05'].map((d) => log(d));
  const busy = [mark('2026-11-04', 'busy'), mark('2026-11-06', 'busy')];
  const w = weekResult(makeCtx({ track: t, logs, marks: busy }, '2026-11-09'), '2026-11-02');
  assert.equal(w.available, 3);
  assert.equal(w.target, 3);
  assert.equal(w.state, 'met');

  const late = track({ weeklyTarget: 5, createdAt: '2026-11-05' }); // Thursday start: 4 of 7 days eligible
  const w2 = weekResult(makeCtx({ track: late, logs: [], marks: [] }, '2026-11-05'), '2026-11-02');
  assert.equal(w2.target, 3); // ceil(5 * 4 / 7)
  assert.equal(w2.state, 'in-progress');
  assert.ok(w2.reachable);
});

test('in-progress week reports reachability', () => {
  const t = track({ weeklyTarget: 5 });
  const ctx = makeCtx({ track: t, logs: [log('2026-11-02')], marks: [] }, '2026-11-06'); // Friday, 1 done, 3 missed
  const w = weekResult(ctx, '2026-11-02');
  assert.equal(w.state, 'in-progress');
  assert.equal(w.remaining, 3); // Fri, Sat, Sun
  assert.ok(!w.reachable);
});

test('fully paused week is neutral for the week streak', () => {
  const t = track({ weeklyTarget: 2, createdAt: '2026-10-19', pauses: [{ from: '2026-10-26', to: '2026-11-01' }] });
  const logs = ['2026-10-20', '2026-10-22', '2026-11-03', '2026-11-04'].map((d) => log(d));
  const ctx = makeCtx({ track: t, logs, marks: [] }, '2026-11-05');
  assert.equal(weekResult(ctx, '2026-10-26').state, 'paused');
  assert.equal(weekStreak(ctx), 2);
});

test('week streak: current in-progress week does not break the run, a missed week does', () => {
  const t = track({ weeklyTarget: 2, createdAt: '2026-10-12' });
  const logs = ['2026-10-13', '2026-10-27', '2026-10-28', '2026-11-03', '2026-11-04'].map((d) => log(d));
  // week of 10-12 missed (1/2), 10-19 missed, 10-26 met, 11-02 met, 11-09 in progress
  const ctx = makeCtx({ track: t, logs, marks: [] }, '2026-11-10');
  assert.equal(weekStreak(ctx), 2);
});

test('never miss twice: miss run skips rest days and stops at a done day', () => {
  const t = track({ restDays: [0] });
  const logs = [log('2026-11-05')];
  // Fri 06 miss, Sat 07 miss, Sun 08 rest, Mon 09 today
  const ctx = makeCtx({ track: t, logs, marks: [] }, '2026-11-09');
  assert.equal(missRun(ctx), 2);
  assert.equal(todayState(ctx), 'restart');
  const one = makeCtx({ track: t, logs: [log('2026-11-07')], marks: [] }, '2026-11-09');
  assert.equal(missRun(one), 0); // Sunday rest between does not count
  assert.equal(todayState(one), 'on-track');
  const rec = makeCtx({ track: t, logs: [log('2026-11-06')], marks: [] }, '2026-11-09');
  assert.equal(todayState(rec), 'recover');
});

test('today state for done, rest and paused', () => {
  assert.equal(todayState(makeCtx({ track: track(), logs: [log('2026-11-04')], marks: [] }, '2026-11-04')), 'done');
  assert.equal(todayState(makeCtx({ track: track({ restDays: [3] }), logs: [], marks: [] }, '2026-11-04')), 'rest');
  assert.equal(todayState(makeCtx({ track: track(), logs: [], marks: [mark('2026-11-04', 'busy')] }, '2026-11-04')), 'rest');
  assert.equal(todayState(makeCtx({ track: track({ pauses: [{ from: '2026-11-03' }] }), logs: [], marks: [] }, '2026-11-04')), 'paused');
});

test('momentum rises with practice, ignores off days, and recovers after one miss', () => {
  const daily = track({ weeklyTarget: 7, createdAt: '2026-09-01' });
  const all: string[] = [];
  for (let d = '2026-09-01'; d <= '2026-11-29'; d = addDays(d, 1)) all.push(d);
  const full = momentum(makeCtx({ track: daily, logs: all.map((d) => log(d)), marks: [] }, '2026-11-29'));
  assert.ok(full >= 98, `90 perfect days should be near 100, got ${full}`);
  const month = momentum(makeCtx({ track: daily, logs: all.slice(0, 30).map((d) => log(d)), marks: [] }, '2026-09-30'));
  assert.ok(month > 70 && month < 90, `30 perfect days should be near 80, got ${month}`);

  const t = track({ weeklyTarget: 5, restDays: [6, 0], createdAt: '2026-09-07' });
  const weekdays = all.filter((d) => d >= '2026-09-07' && weekday(d) >= 1 && weekday(d) <= 5);
  const withRest = momentum(makeCtx({ track: t, logs: weekdays.map((d) => log(d)), marks: [] }, '2026-11-27'));
  assert.ok(withRest >= 90, `rest days must not lower the score, got ${withRest}`);
  const oneMiss = momentum(makeCtx({ track: t, logs: weekdays.filter((d) => d !== '2026-11-25').map((d) => log(d)), marks: [] }, '2026-11-27'));
  assert.ok(withRest - oneMiss <= 6, `a single miss should cost only a little (${withRest} -> ${oneMiss})`);
  const none = momentum(makeCtx({ track: t, logs: [], marks: [] }, '2026-11-27'));
  assert.equal(none, 0);
});

test('open today is not counted against momentum', () => {
  const t = track({ weeklyTarget: 7, createdAt: '2026-11-01' });
  const logs = ['2026-11-01', '2026-11-02', '2026-11-03'].map((d) => log(d));
  const a = momentum(makeCtx({ track: t, logs, marks: [] }, '2026-11-03'));
  const b = momentum(makeCtx({ track: t, logs, marks: [] }, '2026-11-04'));
  assert.equal(a, b);
});

test('busy protections are limited per calendar month', () => {
  const marks = [mark('2026-11-03', 'busy'), mark('2026-11-10', 'busy'), mark('2026-10-30', 'busy'), mark('2026-11-12', 'rest')];
  assert.ok(!canUseBusy(marks, 't1', '2026-11-20', DEFAULT_SETTINGS));
  assert.ok(canUseBusy(marks, 't1', '2026-12-01', DEFAULT_SETTINGS));
  assert.ok(canUseBusy(marks, 't2', '2026-11-20', DEFAULT_SETTINGS));
});

test('heatmap returns Monday-first columns ending this week', () => {
  const cols = heatmap(makeCtx({ track: track(), logs: [log('2026-11-04', { minutes: 40 })], marks: [] }, '2026-11-05'), 3);
  assert.equal(cols.length, 3);
  assert.equal(cols[2][0].day, '2026-11-02');
  assert.equal(cols[2][2].minutes, 40);
  assert.equal(cols[2][6].status, 'future');
});
