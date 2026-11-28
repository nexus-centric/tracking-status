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
  assert.doesNotThrow(() => parseBundle('{"app":"nhip","version":2}'));
  assert.throws(() => parseBundle('{"app":"nhip","version":3}'), /mới hơn/);
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

test('version 1 backups still import, with an empty roadmap', () => {
  const v1 = { app: 'nhip', version: 1, exportedAt: '2026-11-01T00:00:00Z', tracks: [{ id: 't1', name: 'A', createdAt: '2026-11-01' }], sprints: [{ id: 's', trackId: 't1', start: '2026-11-01', end: '2026-11-21', status: 'active', milestones: [{ id: 'm', text: 'x' }] }], logs: [], marks: [], reviews: [], roadmap: [{ id: 'ignored', trackId: 't1', title: 'not part of v1' }] };
  const { bundle } = parseBundle(JSON.stringify(v1));
  assert.equal(bundle.version, 2);
  assert.deepEqual(bundle.roadmap, []);
  assert.equal(bundle.sprints.length, 1);
  assert.equal(countBundle(bundle).roadmap, 0);
});

test('version 2 round-trip keeps roadmap, planned sprints and milestone links; validates items', () => {
  const data = {
    tracks: [{ id: 't1', name: 'A', color: '#2f6f62', why: '', tinyAction: '', plan: '', weeklyTarget: 5, restDays: [], nextStep: '', pauses: [], archived: false, createdAt: '2026-11-01', sessionMinutes: 60, itemsPerSession: 1.5 }],
    sprints: [{ id: 's', trackId: 't1', title: 'Sprint 2', deliverable: '', start: '2026-12-01', end: '2026-12-14', status: 'planned' as const, milestones: [{ id: 'm', text: 'Bài 1', done: false, itemId: 'i1' }, { id: 'm2', text: 'Bài x', done: false, itemId: 'missing' }] }],
    roadmap: [
      { id: 'i1', trackId: 't1', order: 0, title: 'Bài 1', phase: 'P1', estimate: { unit: 'min' as const, value: 30 }, link: 'https://e.example', done: true, doneOn: '2026-11-10' },
      { id: 'i2', trackId: 'ghost', order: 1, title: 'orphan', done: false },
    ],
    logs: [], marks: [], reviews: [], settings: { busyPerMonth: 2 },
  };
  const raw = JSON.parse(JSON.stringify(makeBundle(data)));
  raw.roadmap.push({ id: 'i3', trackId: 't1', title: 'x', estimate: { unit: 'week', value: 2 }, link: 'javascript:1', done: 'yes', doneOn: '2026-11-10' }, { id: 'i4', trackId: 't1', title: '   ' });
  const { bundle, dropped } = parseBundle(JSON.stringify(raw));
  assert.equal(bundle.version, 2);
  assert.equal(bundle.roadmap.length, 2);
  assert.deepEqual(bundle.roadmap[0], { ...data.roadmap[0], demo: undefined });
  assert.deepEqual(bundle.roadmap[1], { id: 'i3', trackId: 't1', order: 0, title: 'x', phase: undefined, estimate: undefined, link: undefined, done: false, doneOn: undefined, demo: undefined });
  assert.equal(dropped, 2, 'the orphan and the untitled item');
  assert.equal(bundle.sprints[0].status, 'planned');
  assert.equal(bundle.sprints[0].milestones[0].itemId, 'i1');
  assert.equal(bundle.sprints[0].milestones[1].itemId, undefined, 'a link to a missing item is dropped');
  assert.equal(bundle.tracks[0].sessionMinutes, 60);
  assert.equal(bundle.tracks[0].itemsPerSession, 1.5);
  const c = countBundle(bundle);
  assert.equal(c.roadmap, 2);
  const merged = mergeData({ ...bundle, roadmap: [bundle.roadmap[0]] }, bundle);
  assert.equal(merged.added.roadmap, 1);
  assert.equal(merged.data.roadmap.length, 2);
});

test('sessionNote survives export and import; older logs without it still load', () => {
  const demo = demoBundle('2026-11-15');
  const withNote = { ...demo.logs[0], sessionNote: 'Công thức quan trọng:\n\n- E = mc^2\n- kubectl get pods', evidence: [{ kind: 'note' as const, value: 'Kết quả:\n- app Synced' }] };
  const data = { ...demo, logs: [withNote, ...demo.logs.slice(1)] };
  const { bundle, dropped } = parseBundle(JSON.stringify(makeBundle(data)));
  assert.equal(dropped, 0);
  assert.equal(bundle.logs[0].sessionNote, withNote.sessionNote);
  assert.equal(bundle.logs[0].evidence[0].value, 'Kết quả:\n- app Synced');
  const old = { app: 'nhip', version: 2, tracks: demo.tracks, sprints: demo.sprints, logs: [{ id: 'old', trackId: demo.tracks[0].id, day: '2026-11-02', kind: 'full', minutes: 20, note: 'chỉ có note cũ', blocker: '', evidence: [], createdAt: '2026-11-02T10:00:00Z' }], marks: [], reviews: [], roadmap: [] };
  const loaded = parseBundle(JSON.stringify(old)).bundle;
  assert.equal(loaded.logs[0].note, 'chỉ có note cũ');
  assert.equal(loaded.logs[0].sessionNote, undefined);
  const long = 'x'.repeat(9000);
  const clipped = parseBundle(JSON.stringify({ ...old, logs: [{ ...old.logs[0], sessionNote: long }] })).bundle;
  assert.equal(clipped.logs[0].sessionNote?.length, 8000);
});
