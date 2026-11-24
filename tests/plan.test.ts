import { test } from 'node:test';
import assert from 'node:assert/strict';
import { itemsToPlan, layoutPlan, planChanges, planStart, proposePlan, setWeeks, shiftBoundary, weeklyCapacity } from '../src/core/plan.js';
import { diffDays } from '../src/core/dates.js';
import { SPRINT_MAX_DAYS, SPRINT_MIN_DAYS } from '../src/core/sprint.js';
import type { Sprint } from '../src/core/types.js';
import { track } from './helpers.js';
import { items } from './roadmap-helpers.js';

const len = (s: { start: string; end: string }) => diffDays(s.end, s.start) + 1;

test('weekly capacity is the weekly target, capped by rest days', () => {
  assert.equal(weeklyCapacity(track({ weeklyTarget: 5, restDays: [] })), 5);
  assert.equal(weeklyCapacity(track({ weeklyTarget: 7, restDays: [0, 6] })), 5);
});

test('30 lessons, 5 days a week, 3-week sprints: 15 + 15', () => {
  const t = track({ weeklyTarget: 5 });
  const list = items(30);
  const drafts = proposePlan(list, t, 3);
  assert.deepEqual(drafts.map((d) => d.itemIds.length), [15, 15]);
  const L = layoutPlan(drafts, list, t, '2026-11-16');
  assert.deepEqual(L.sprints.map((s) => [s.start, s.end]), [['2026-11-16', '2026-12-06'], ['2026-12-07', '2026-12-27']]);
  assert.equal(L.finish, '2026-12-27');
  assert.equal(L.totalSessions, 30);
  assert.ok(L.sprints.every((s) => !s.over && len(s) >= SPRINT_MIN_DAYS && len(s) <= SPRINT_MAX_DAYS));
});

test('a short tail is folded into the previous sprint (up to 4 weeks) or gets a 2-week sprint', () => {
  const t = track({ weeklyTarget: 5 });
  // 17 sessions: 15 + 2 -> fold into one 4-week sprint (capacity 20).
  const folded = proposePlan(items(17), t, 3);
  assert.deepEqual(folded.map((d) => [d.itemIds.length, d.weeks]), [[17, 4]]);
  // 26 sessions: 15 + 11 -> second sprint stays 3 weeks (needs 3 weeks of 5).
  assert.deepEqual(proposePlan(items(26), t, 3).map((d) => [d.itemIds.length, d.weeks]), [[15, 3], [11, 3]]);
  // 33: 15 + 15 + 3 -> the tail of 3 folds into the second sprint (18 <= 20), which grows to 4 weeks.
  assert.deepEqual(proposePlan(items(33), t, 3).map((d) => [d.itemIds.length, d.weeks]), [[15, 3], [18, 4]]);
  // 4-week sprints cannot grow: a tail of 2 gets a 2-week sprint.
  assert.deepEqual(proposePlan(items(22), t, 4).map((d) => [d.itemIds.length, d.weeks]), [[20, 4], [2, 2]]);
  // Fewer items than one sprint: shortened, never below 2 weeks.
  assert.deepEqual(proposePlan(items(3), t, 3).map((d) => [d.itemIds.length, d.weeks]), [[3, 2]]);
});

test('estimates drive the split; an item bigger than a sprint gets its own sprint and a warning', () => {
  const t = track({ weeklyTarget: 3, sessionMinutes: 60 });
  const list = items(4, (i) => (i === 1 ? { estimate: { unit: 'session', value: 12 } } : { estimate: { unit: 'min', value: 90 } }));
  const drafts = proposePlan(list, t, 2); // capacity 6 sessions per sprint
  assert.deepEqual(drafts.map((d) => d.itemIds), [['i1'], ['i2'], ['i3', 'i4']]);
  const L = layoutPlan(drafts, list, t, '2026-11-16');
  assert.equal(L.sprints[1].over, true);
  assert.equal(L.sprints[0].sessions, 1.5);
  assert.equal(L.warnings.length, 1);
});

test('items per session for unestimated items', () => {
  const t = track({ weeklyTarget: 5, itemsPerSession: 2 });
  assert.deepEqual(proposePlan(items(30), t, 3).map((d) => d.itemIds.length), [30], '15 sessions, one 3-week sprint');
});

test('user adjustments: move items across a boundary and change a sprint length', () => {
  const t = track({ weeklyTarget: 5 });
  const list = items(30);
  let d = proposePlan(list, t, 3);
  d = shiftBoundary(d, 0, 1);
  assert.deepEqual(d.map((x) => x.itemIds.length), [14, 16]);
  assert.equal(d[1].itemIds[0], 'i15');
  d = shiftBoundary(d, 0, -1);
  assert.deepEqual(d.map((x) => x.itemIds.length), [15, 15]);
  d = shiftBoundary(d, 1, 1); // pushing from the last sprint creates a new 2-week sprint
  assert.deepEqual(d.map((x) => [x.itemIds.length, x.weeks]), [[15, 3], [14, 3], [1, 2]]);
  d = shiftBoundary(d, 1, -1); // pulling the only item back removes the empty sprint
  assert.equal(d.length, 2);
  d = setWeeks(d, 0, 12);
  assert.equal(d[0].weeks, 8, 'hand-set lengths are clamped to 1-8 weeks');
  d = setWeeks(d, 0, 4);
  const L = layoutPlan(d, list, t, '2026-11-16');
  assert.equal(L.sprints[1].start, '2026-12-14', 'later sprints follow the changed length');
});

test('plan only places unfinished items outside the kept active sprint; start after it', () => {
  const list = items(6, (i) => (i === 0 ? { done: true, doneOn: '2026-11-10' } : {}));
  const active: Sprint = { id: 's1', trackId: 't1', title: 'A', deliverable: '', start: '2026-11-02', end: '2026-11-22', status: 'active', milestones: [{ id: 'm1', text: 'Bài 2', done: false, itemId: 'i2' }] };
  assert.deepEqual(itemsToPlan(list, [active], 't1', false).map((i) => i.id), ['i3', 'i4', 'i5', 'i6']);
  assert.deepEqual(itemsToPlan(list, [active], 't1', true).map((i) => i.id), ['i2', 'i3', 'i4', 'i5', 'i6']);
  assert.equal(planStart([active], 't1', '2026-11-15', false), '2026-11-23');
  assert.equal(planStart([active], 't1', '2026-11-15', true), '2026-11-15');
  assert.equal(planStart([{ ...active, end: '2026-11-10' }], 't1', '2026-11-15', false), '2026-11-15', 'an overdue sprint does not push the start into the past');
});

test('plan changes: first sprint active, rest planned, old planned replaced, active kept unless closed', () => {
  const t = track({ weeklyTarget: 5 });
  const list = items(30);
  const L = layoutPlan(proposePlan(list, t, 3), list, t, '2026-11-16');
  let n = 0;
  const id = () => `new${++n}`;
  const old: Sprint = { id: 'p-old', trackId: 't1', title: 'old', deliverable: '', start: '2027-01-01', end: '2027-01-14', status: 'planned', milestones: [] };
  const c = planChanges(L, t, [old], '2026-11-15', id);
  assert.deepEqual(c.create.map((s) => s.status), ['active', 'planned']);
  assert.deepEqual(c.remove, ['p-old']);
  assert.equal(c.close, undefined);
  assert.equal(c.create[0].milestones.length, 15);
  assert.ok(c.create[0].milestones.every((m, i) => m.itemId === `i${i + 1}` && m.text === `Bài ${i + 1}` && !m.done));
  assert.equal(c.create[0].start, '2026-11-16', 'dates are exactly the previewed ones');
  const active: Sprint = { ...old, id: 'a', status: 'active', start: '2026-10-20', end: '2026-11-09' };
  assert.deepEqual(planChanges(L, t, [active], '2026-11-15', id).create.map((s) => s.status), ['planned', 'planned']);
  const closed = planChanges(L, t, [active], '2026-11-15', id, true);
  assert.equal(closed.close?.status, 'done');
  assert.equal(closed.close?.closedOn, '2026-11-15');
  assert.equal(closed.create[0].status, 'active');
});
