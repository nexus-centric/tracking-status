import { test } from 'node:test';
import assert from 'node:assert/strict';
import { activeSprint, defaultEnd, lengthWarning, milestonesDoneBetween, sprintProgress } from '../src/core/sprint.js';
import type { Sprint } from '../src/core/types.js';

function sprint(over: Partial<Sprint> = {}): Sprint {
  return {
    id: 's1', trackId: 't1', title: 'GitOps', deliverable: 'Repo sync', start: '2026-11-02', end: '2026-11-22', status: 'active',
    milestones: [
      { id: 'a', text: 'Cluster', done: true, doneOn: '2026-11-03' },
      { id: 'b', text: 'Argo CD', done: true, doneOn: '2026-11-09' },
      { id: 'c', text: 'Sync', done: false },
      { id: 'd', text: 'README', done: false },
    ],
    ...over,
  };
}

test('progress by milestones vs elapsed time', () => {
  const p = sprintProgress(sprint(), '2026-11-12'); // day 11 of 21
  assert.equal(p.total, 4);
  assert.equal(p.done, 2);
  assert.equal(p.pct, 0.5);
  assert.equal(p.totalDays, 21);
  assert.equal(p.elapsed, 11);
  assert.equal(p.daysLeft, 10);
  assert.equal(p.pace, 'on-track');
  assert.equal(p.next?.id, 'c');
  assert.equal(p.expectedByNow, 2);
});

test('pace states', () => {
  assert.equal(sprintProgress(sprint(), '2026-11-03').pace, 'ahead');
  const none = sprint({ milestones: sprint().milestones.map((m) => ({ ...m, done: false, doneOn: undefined })) });
  assert.equal(sprintProgress(none, '2026-11-18').pace, 'behind');
  assert.equal(sprintProgress(none, '2026-11-01').pace, 'not-started');
  assert.equal(sprintProgress(none, '2026-11-23').pace, 'overdue');
  assert.equal(sprintProgress(sprint({ milestones: [] }), '2026-11-10').pace, 'no-milestones');
  assert.equal(sprintProgress(sprint({ status: 'dropped' }), '2026-11-10').pace, 'dropped');
  const all = sprint({ milestones: sprint().milestones.map((m) => ({ ...m, done: true })) });
  assert.equal(sprintProgress(all, '2026-11-10').pace, 'done');
});

test('elapsed is clamped to the sprint window', () => {
  assert.equal(sprintProgress(sprint(), '2026-10-01').elapsed, 0);
  assert.equal(sprintProgress(sprint(), '2026-12-30').elapsed, 21);
  assert.equal(sprintProgress(sprint(), '2026-12-30').daysLeft, 0);
});

test('length warnings outside 2-4 weeks', () => {
  assert.equal(lengthWarning('2026-11-02', defaultEnd('2026-11-02')), null);
  assert.equal(defaultEnd('2026-11-02'), '2026-11-22');
  assert.match(lengthWarning('2026-11-02', '2026-11-08') ?? '', /7 ngày/);
  assert.match(lengthWarning('2026-11-02', '2026-12-31') ?? '', /hai đợt/);
  assert.match(lengthWarning('2026-11-02', '2026-11-01') ?? '', /sau ngày bắt đầu/);
});

test('active sprint and milestones in a range', () => {
  const list = [sprint({ id: 'old', start: '2026-10-01', status: 'done' }), sprint({ id: 'a1', start: '2026-10-20' }), sprint({ id: 'a2', start: '2026-11-02' })];
  assert.equal(activeSprint(list, 't1')?.id, 'a2');
  assert.equal(activeSprint(list, 'tX'), undefined);
  assert.deepEqual(milestonesDoneBetween(sprint(), '2026-11-09', '2026-11-15').map((m) => m.id), ['b']);
});
