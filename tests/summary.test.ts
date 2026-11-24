import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildWeekSummary, REVIEW_PROMPT } from '../src/core/summary.js';
import { reentry } from '../src/core/reentry.js';
import type { Sprint } from '../src/core/types.js';
import { log, track } from './helpers.js';

const sprint: Sprint = {
  id: 's1', trackId: 't1', title: 'GitOps', deliverable: 'Repo sync', start: '2026-11-02', end: '2026-11-22', status: 'active',
  milestones: [
    { id: 'a', text: 'Dựng cluster', done: true, doneOn: '2026-11-04' },
    { id: 'b', text: 'Cài Argo CD', done: false },
  ],
};

test('weekly summary aggregates rhythm, minutes, milestones, evidence and blockers', () => {
  const t = track({ weeklyTarget: 3 });
  const paused = track({ id: 't2', name: 'Video', pauses: [{ from: '2026-10-20' }], nextStep: 'Cắt 10 giây đầu' });
  const logs = [
    log('2026-11-02', { minutes: 40, evidence: [{ kind: 'link', value: 'https://example.com/c/1', label: 'commit' }] }),
    log('2026-11-04', { kind: 'tiny', minutes: 10, blocker: 'Port-forward bị ngắt', milestoneId: 'a' }),
    log('2026-11-06', { minutes: 50, evidence: [{ kind: 'note', value: 'Ghi chú kiến trúc' }] }),
    log('2026-11-10', { minutes: 99 }), // next week, excluded
  ];
  const s = buildWeekSummary({
    weekStart: '2026-11-05', today: '2026-11-12', tracks: [t, paused], sprints: [sprint], logs, marks: [],
    review: { weekStart: '2026-11-02', wins: 'Giữ được nhịp', blockers: '', next: 'Cài Argo CD', updatedAt: '' },
  });
  assert.equal(s.weekStart, '2026-11-02');
  assert.equal(s.weekEnd, '2026-11-08');
  assert.equal(s.totalMinutes, 100);
  assert.equal(s.activeDays, 3);
  const main = s.tracks.find((x) => x.track.id === 't1')!;
  assert.equal(main.week.state, 'met');
  assert.deepEqual([main.full, main.tiny], [2, 1]);
  assert.deepEqual(main.milestones, ['Dựng cluster']);
  assert.equal(main.evidence.length, 2);
  assert.equal(main.nextStep, 'Cài Argo CD');
  assert.ok(s.text.startsWith(REVIEW_PROMPT));
  assert.match(s.text, /Tóm tắt tuần 2\/11 - 8\/11\/2026/);
  assert.match(s.text, /## Test: 3\/3 ngày mục tiêu, đạt/);
  assert.match(s.text, /1 giờ 40 phút/);
  assert.match(s.text, /2\/11: commit - https:\/\/example.com\/c\/1/);
  assert.match(s.text, /Vướng:\n  - 4\/11: Port-forward bị ngắt/);
  assert.match(s.text, /## Video: tạm dừng\n- Việc nhỏ nhất khi quay lại: Cắt 10 giây đầu/);
  assert.match(s.text, /## Tự nhận xét\n- Làm được: Giữ được nhịp\n- Tuần sau: Cài Argo CD/);
  assert.doesNotMatch(s.text, /Vướng: $/m);
});

test('summary skips tracks created after the week and archived tracks', () => {
  const s = buildWeekSummary({
    weekStart: '2026-11-02', today: '2026-11-20', sprints: [], logs: [], marks: [],
    tracks: [track({ createdAt: '2026-11-15' }), track({ id: 't3', archived: true })],
  });
  assert.equal(s.tracks.length, 0);
  assert.match(s.text, /Tổng: 0 ngày có học, 0 phút\./);
});

test('in-progress week says whether the target is still reachable', () => {
  const s = buildWeekSummary({ weekStart: '2026-11-02', today: '2026-11-04', tracks: [track({ weeklyTarget: 3 })], sprints: [], logs: [log('2026-11-02')], marks: [] });
  assert.match(s.text, /1\/3 ngày mục tiêu, tuần đang diễn ra, vẫn kịp/);
});

test('re-entry suggests the written next step, else the next milestone, and a lighter target', () => {
  const t = track({ weeklyTarget: 5, pauses: [{ from: '2026-10-20' }] });
  const logs = [log('2026-10-18', { note: 'Dừng ở bước cài Argo CD' }), log('2026-10-10')];
  const r = reentry(t, [sprint], logs, '2026-11-04'); // Wednesday
  assert.equal(r.daysAway, 17);
  assert.equal(r.lastNote, 'Dừng ở bước cài Argo CD');
  assert.equal(r.step, 'Làm 10 phút đầu tiên cho milestone: Cài Argo CD');
  assert.equal(r.nextMonday, '2026-11-09');
  assert.equal(r.lighterTarget, 3);
  assert.equal(reentry({ ...t, nextStep: 'Mở file values.yaml' }, [sprint], logs, '2026-11-09').step, 'Mở file values.yaml');
  assert.equal(reentry(t, [], [], '2026-11-09').nextMonday, '2026-11-16');
  assert.equal(reentry(t, [], [], '2026-11-08').nextMonday, '2026-11-09');
  assert.equal(reentry(t, [], [], '2026-11-08').daysAway, null);
  assert.equal(reentry(t, [], [], '2026-11-08').step, 'Mở docs 10 phút');
});
