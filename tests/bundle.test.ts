import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeBundle, parseBundle } from '../src/core/bundle.js';
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
