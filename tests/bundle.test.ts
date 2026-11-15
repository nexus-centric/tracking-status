import { test } from 'node:test';
import assert from 'node:assert/strict';
import { countBundle, makeBundle, mergeData, parseBundle } from '../src/core/bundle.js';
import { demoBundle } from '../src/core/demo.js';
import { makeCtx, todayState, momentum } from '../src/core/rhythm.js';
import { sprintProgress } from '../src/core/sprint.js';

test('demo bundle round-trips through export and import unchanged', () => {
  const demo = demoBundle('2026-11-15');
  const text = JSON.stringify(makeBundle(demo));
  const { bundle, dropped } = parseBundle(text);
  assert.equal(dropped, 0);
  const j = (v: unknown) => JSON.parse(JSON.stringify(v));
  assert.deepEqual(j(bundle.tracks), j(demo.tracks));
  assert.deepEqual(j(bundle.logs), j(demo.logs));
  assert.deepEqual(j(bundle.sprints), j(demo.sprints));
  assert.deepEqual(j(bundle.marks), j(demo.marks));
  assert.ok(bundle.tracks.every((t) => t.demo) && bundle.logs.every((l) => l.demo));
});

test('demo data looks plausible on any weekday', () => {
  for (const day of ['2026-11-15', '2026-11-18', '2026-11-21']) {
    const demo = demoBundle(day);
    const video = demo.tracks.find((t) => t.id === 'demo-video')!;
    assert.equal(todayState(makeCtx({ track: video, logs: demo.logs, marks: demo.marks }, day)), 'paused');
    const dev = demo.tracks.find((t) => t.id === 'demo-devops')!;
    assert.ok(momentum(makeCtx({ track: dev, logs: demo.logs, marks: demo.marks }, day)) > 40);
    assert.equal(sprintProgress(demo.sprints[1], day).pace, 'on-track');
  }
});

test('import rejects foreign files and drops invalid or orphaned records', () => {
  assert.throws(() => parseBundle('nope'), /JSON/);
  assert.throws(() => parseBundle('{"app":"other"}'), /không phải/);
  const raw = {
    app: 'nhip', version: 1,
    tracks: [{ id: 't1', name: 'A', createdAt: '2026-11-01', weeklyTarget: 99, restDays: [0, 0, 9] }, { id: '', name: 'bad' }],
    sprints: [{ id: 's', trackId: 't1', start: '2026-11-05', end: '2026-11-01' }],
    logs: [
      { id: 'l1', trackId: 't1', day: '2026-11-02', evidence: [{ kind: 'link', value: 'javascript:alert(1)' }, { kind: 'image', value: 'data:text/html,x' }, { kind: 'link', value: 'https://ok.example' }] },
      { id: 'l2', trackId: 'ghost', day: '2026-11-02' },
    ],
    marks: [{ id: 'k', trackId: 't1', day: '2026-11-03', kind: 'freeze' }],
  };
  const { bundle, dropped } = parseBundle(JSON.stringify(raw));
  assert.equal(bundle.tracks.length, 1);
  assert.equal(bundle.tracks[0].weeklyTarget, 7);
  assert.deepEqual(bundle.tracks[0].restDays, [0]);
  assert.equal(bundle.sprints.length, 0);
  assert.equal(bundle.logs.length, 1);
  assert.deepEqual(bundle.logs[0].evidence, [{ kind: 'link', value: 'https://ok.example', label: undefined }]);
  assert.equal(bundle.marks.length, 0);
  assert.equal(dropped, 4);
  assert.equal(bundle.settings.busyPerMonth, 2);
});

test('import checks the schema version', () => {
  assert.doesNotThrow(() => parseBundle('{"app":"nhip"}'), 'a missing version is read as version 1');
  assert.throws(() => parseBundle('{"app":"nhip","version":2}'), /mới hơn/);
  assert.throws(() => parseBundle('{"app":"nhip","version":"1"}'), /phiên bản/);
});

test('merge adds missing records and keeps existing ones', () => {
  const demo = demoBundle('2026-11-15');
  const current = { ...demo, logs: demo.logs.slice(0, 10), reviews: [{ weekStart: '2026-11-09', wins: 'cũ', blockers: '', next: '', updatedAt: '2026-11-10T00:00:00Z' }] };
  const edited = { ...demo.logs[0], note: 'sửa trong file' };
  const incoming = {
    ...demo,
    logs: [edited, ...demo.logs.slice(1)],
    marks: [...demo.marks, { id: 'dup', trackId: demo.marks[0].trackId, day: demo.marks[0].day, kind: 'busy' as const }],
    reviews: [{ weekStart: '2026-11-09', wins: 'mới', blockers: '', next: '', updatedAt: '2026-11-12T00:00:00Z' }, { weekStart: '2026-11-02', wins: 'x', blockers: '', next: '', updatedAt: '' }],
  };
  const { data, added } = mergeData(current, incoming);
  assert.equal(data.logs.length, demo.logs.length);
  assert.equal(added.logs, demo.logs.length - 10);
  assert.equal(data.logs[0].note, demo.logs[0].note, 'existing record is kept');
  assert.equal(added.marks, 0, 'a second mark on the same day is skipped');
  assert.equal(added.tracks, 0);
  assert.equal(added.reviews, 1);
  assert.equal(data.reviews.find((r) => r.weekStart === '2026-11-09')!.wins, 'mới', 'newer review wins');
  const c = countBundle(data);
  assert.equal(c.logs, demo.logs.length);
  assert.ok(c.minutes > 0);
});
