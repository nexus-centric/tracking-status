import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DB_VERSION, migrateData, storesToCreate } from '../src/core/schema.js';
import type { Sprint } from '../src/core/types.js';
import { items } from './roadmap-helpers.js';

test('IndexedDB upgrade creates only the stores added since the old version', () => {
  assert.equal(DB_VERSION, 2);
  assert.deepEqual(storesToCreate(0).map((s) => s.name), ['tracks', 'sprints', 'logs', 'marks', 'reviews', 'settings', 'roadmap']);
  assert.deepEqual(storesToCreate(1), [{ name: 'roadmap', keyPath: 'id' }], 'v1 data is kept, roadmap is added');
  assert.deepEqual(storesToCreate(2), []);
});

test('migrating version 1 data adds an empty roadmap and changes nothing else', () => {
  const sprint: Sprint = { id: 's', trackId: 't1', title: 'A', deliverable: '', start: '2026-11-01', end: '2026-11-21', status: 'active', milestones: [{ id: 'm', text: 'x', done: true, doneOn: '2026-11-05' }] };
  const v1 = { tracks: [], sprints: [sprint], logs: [] };
  const m = migrateData(v1);
  assert.deepEqual(m.data.roadmap, []);
  assert.equal(m.data.sprints[0], sprint, 'untouched records keep identity');
  assert.equal(m.changedItems.length + m.changedSprints.length, 0);
});

test('migration renumbers orders per track and drops dangling milestone links', () => {
  const list = items(3, (i) => ({ order: [10, 5, 5][i] }));
  const other = { ...items(1)[0], id: 'x', trackId: 't2', order: 7 };
  const sprint: Sprint = { id: 's', trackId: 't1', title: 'A', deliverable: '', start: '2026-11-01', end: '2026-11-21', status: 'active', milestones: [{ id: 'm1', text: 'a', done: false, itemId: 'i1' }, { id: 'm2', text: 'b', done: false, itemId: 'gone' }] };
  const m = migrateData({ sprints: [sprint], roadmap: [...list, other] });
  const order = (id: string) => m.data.roadmap.find((i) => i.id === id)!.order;
  assert.deepEqual([order('i2'), order('i3'), order('i1'), order('x')], [0, 1, 2, 0], 'stable by old order, then by position');
  assert.equal(m.changedItems.length, 4);
  assert.equal(m.data.sprints[0].milestones[0].itemId, 'i1');
  assert.equal(m.data.sprints[0].milestones[1].itemId, undefined);
  assert.equal(m.changedSprints.length, 1);
});
