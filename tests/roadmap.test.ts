import { test } from 'node:test';
import assert from 'node:assert/strict';
import { costPrefs, itemSessions, moveItem, planEnd, projectRoadmap, roadmapProgress, setItemDone, setMilestoneDone } from '../src/core/roadmap.js';
import type { RoadmapItem, Sprint } from '../src/core/types.js';
import { log, track } from './helpers.js';
import { items } from './roadmap-helpers.js';

const P = { sessionMinutes: 45, itemsPerSession: 1 };

test('item cost in sessions', () => {
  assert.equal(itemSessions({ estimate: { unit: 'min', value: 90 } }, P), 2);
  assert.equal(itemSessions({ estimate: { unit: 'session', value: 1.5 } }, P), 1.5);
  assert.equal(itemSessions({}, P), 1);
  assert.equal(itemSessions({}, { sessionMinutes: 45, itemsPerSession: 2 }), 0.5);
  assert.deepEqual(costPrefs(track({})), { sessionMinutes: 45, itemsPerSession: 1 });
});

test('progress by count without estimates, by effort with estimates', () => {
  const plain = items(10, (i) => ({ done: i < 3 }));
  const p1 = roadmapProgress(plain, P);
  assert.equal(p1.weighted, false);
  assert.equal(p1.pct, 0.3);
  assert.equal(p1.remainingSessions, 7);
  // One 4.5-hour item (6 sessions) done out of 6 + 4 x 1 = 10 sessions -> 60%, although only 1 of 5 items.
  const w = items(5, (i) => (i === 0 ? { done: true, estimate: { unit: 'min', value: 270 } } : {}));
  const p2 = roadmapProgress(w, P);
  assert.equal(p2.weighted, true);
  assert.equal(p2.done, 1);
  assert.ok(Math.abs(p2.pct - 0.6) < 1e-9);
});

test('phases are grouped in order with their own counts', () => {
  const list = items(5, (i) => ({ phase: i < 2 ? 'A' : 'B', done: i === 0 }));
  const p = roadmapProgress(list, P);
  assert.deepEqual(p.phases.map((x) => [x.name, x.done, x.total]), [['A', 1, 2], ['B', 0, 3]]);
});

test('projection: recent pace over 28 days vs weekly target', () => {
  const t = track({ createdAt: '2026-09-01', weeklyTarget: 5 });
  // 30 items; in the last 28 days 8 items done on 8 active days (logs on the same days), 10 done earlier.
  const doneDays = ['2026-10-20', '2026-10-22', '2026-10-25', '2026-10-29', '2026-11-02', '2026-11-06', '2026-11-10', '2026-11-14'];
  const list = items(30, (i) => (i < 10 ? { done: true, doneOn: '2026-09-15' } : i < 18 ? { done: true, doneOn: doneDays[i - 10] } : {}));
  const logs = doneDays.map((d) => log(d));
  const pj = projectRoadmap({ track: t, items: list, logs, sprints: [], today: '2026-11-15' });
  assert.equal(pj.windowDays, 28);
  assert.equal(pj.activeDays, 8);
  assert.equal(pj.itemsInWindow, 8);
  assert.equal(pj.pacePerActiveDay, 1);
  assert.equal(pj.activePerWeek, 2);
  assert.equal(pj.confidence, 'ok');
  assert.equal(pj.remainingSessions, 12);
  // 12 sessions at 1 per active day = 12 active days at 2 per week = 42 calendar days.
  assert.equal(pj.recentFinish, '2026-12-27');
  // At the target: 12 sessions / 5 per week = 2.4 weeks = 16.8 -> 17 days.
  assert.equal(pj.targetFinish, '2026-12-02');
  assert.equal(pj.plannedFinish, undefined);
  assert.equal(pj.behindDays, 25, 'compared with the target when there is no plan');
});

test('projection: active days count logs and finished items; low confidence for a young track', () => {
  const t = track({ createdAt: '2026-11-10', weeklyTarget: 4 });
  const list = items(10, (i) => (i < 2 ? { done: true, doneOn: '2026-11-12' } : {}));
  const pj = projectRoadmap({ track: t, items: list, logs: [log('2026-11-11'), log('2026-11-14', { trackId: 'other' })], sprints: [], today: '2026-11-15' });
  assert.equal(pj.windowDays, 6);
  assert.equal(pj.activeDays, 2, 'the log of another track is ignored');
  assert.equal(pj.confidence, 'low');
  assert.ok(pj.recentFinish);
});

test('projection: no data, nothing left', () => {
  const t = track({});
  const none = projectRoadmap({ track: t, items: items(5), logs: [log('2026-11-14')], sprints: [], today: '2026-11-15' });
  assert.equal(none.confidence, 'none');
  assert.equal(none.recentFinish, undefined);
  assert.equal(none.behindDays, undefined);
  assert.ok(none.targetFinish);
  const done = projectRoadmap({ track: t, items: items(2, () => ({ done: true, doneOn: '2026-11-14' })), logs: [], sprints: [], today: '2026-11-15' });
  assert.equal(done.targetFinish, null);
  assert.equal(done.recentFinish, undefined);
});

test('planned finish only when every remaining item sits in an open sprint', () => {
  const list = items(3, (i) => ({ done: i === 0 }));
  const s = (id: string, end: string, ids: string[], status: Sprint['status'] = 'planned'): Sprint => ({ id, trackId: 't1', title: id, deliverable: '', start: '2026-11-01', end, status, milestones: ids.map((x) => ({ id: `m-${x}`, text: x, done: false, itemId: x })) });
  assert.equal(planEnd(list, [s('a', '2026-11-30', ['i2'], 'active')], 't1'), undefined);
  assert.equal(planEnd(list, [s('a', '2026-11-30', ['i2'], 'active'), s('b', '2026-12-20', ['i3'])], 't1'), '2026-12-20');
  assert.equal(planEnd(list, [s('a', '2026-11-30', ['i2'], 'active'), s('b', '2026-12-20', ['i3'], 'dropped')], 't1'), undefined);
});

test('completing a milestone completes its item and the reverse', () => {
  const list: RoadmapItem[] = items(2);
  const sp: Sprint = { id: 's1', trackId: 't1', title: 'A', deliverable: '', start: '2026-11-01', end: '2026-11-21', status: 'active', milestones: [{ id: 'm1', text: 'Bài 1', done: false, itemId: 'i1' }, { id: 'm2', text: 'tự viết', done: false }] };
  const a = setMilestoneDone(list, [sp], 's1', 'm1', true, '2026-11-15');
  assert.equal(a.item?.done, true);
  assert.equal(a.item?.doneOn, '2026-11-15');
  assert.equal(a.sprints.length, 1);
  assert.equal(a.sprints[0].milestones[0].done, true);
  const b = setItemDone([a.item!, list[1]], a.sprints, 'i1', false, '2026-11-16');
  assert.equal(b.item?.done, false);
  assert.equal(b.item?.doneOn, undefined);
  assert.equal(b.sprints[0].milestones[0].done, false);
  assert.equal(b.sprints[0].milestones[0].doneOn, undefined);
  const plain = setMilestoneDone(list, [sp], 's1', 'm2', true, '2026-11-15');
  assert.equal(plain.item, undefined, 'an unlinked milestone touches no item');
  assert.equal(plain.sprints[0].milestones[1].done, true);
  const again = setItemDone([{ ...list[0], done: true, doneOn: '2026-11-01' }], [], 'i1', true, '2026-11-20');
  assert.equal(again.item?.doneOn, '2026-11-01', 'marking done again keeps the first date');
  const closed = setItemDone(list, [{ ...sp, status: 'done' }], 'i1', true, '2026-11-20');
  assert.equal(closed.sprints.length, 0, 'a closed sprint keeps its history');
});

test('moving an item swaps order and adopts the neighbour phase at a boundary', () => {
  const list = items(3, (i) => ({ phase: i < 2 ? 'A' : 'B' }));
  const r = moveItem(list, 'i2', 1);
  assert.deepEqual(r.map((x) => [x.id, x.order, x.phase]), [['i2', 2, 'B'], ['i3', 1, 'B']]);
  assert.deepEqual(moveItem(list, 'i1', -1), []);
});
