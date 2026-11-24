import { test } from 'node:test';
import assert from 'node:assert/strict';
import { layoutPlan, proposePlan } from '../src/core/plan.js';
import {
  addSprint, chainDates, draftsFromSprints, dropItems, hasPhases, mergeWithNext, moveItems, moveSprint, moveWithin, proposeByPhase,
  removeSprint, renameSprint, saveChanges, setStart, splitSprint, unplacedIds, withKeys,
} from '../src/core/plan-edit.js';
import type { Sprint } from '../src/core/types.js';
import { track } from './helpers.js';
import { items } from './roadmap-helpers.js';

const phased = () => items(10, (i) => ({ phase: i < 2 ? 'Chặng 1: Biết mình' : i < 6 ? 'Chặng 2: Thuế' : 'Chặng 3: Tín dụng' }));
let n = 0;
const newId = () => `n${++n}`;

test('phase preset: one sprint per phase, named after the phase, length from the effort', () => {
  const t = track({ weeklyTarget: 2 });
  const list = phased();
  const d = proposeByPhase(list, t);
  assert.deepEqual(d.map((x) => x.itemIds.length), [2, 4, 4]);
  assert.deepEqual(d.map((x) => x.weeks), [1, 2, 2]);
  const L = layoutPlan(d, list, t, '2026-11-24');
  assert.deepEqual(L.sprints.map((s) => s.title), ['Chặng 1: Biết mình', 'Chặng 2: Thuế', 'Chặng 3: Tín dụng']);
  assert.equal(L.sprints[1].start, '2026-12-01');
});

test('topics without phases: phase preset is a single run, weeks preset still splits', () => {
  const list = items(12);
  assert.equal(hasPhases(list), false);
  assert.equal(proposeByPhase(list, track()).length, 1);
  assert.ok(proposePlan(list, track({ weeklyTarget: 2 }), 2).length > 1);
  const L = layoutPlan(withKeys([{ weeks: 2, itemIds: ['i1', 'i2'] }]), list, track(), '2026-11-24');
  assert.equal(L.sprints[0].title, 'Sprint 1');
});

test('free-form moves: any items, from several sprints, to any sprint, a new sprint, or back to the pool', () => {
  const list = phased();
  let d = withKeys(proposeByPhase(list, track({ weeklyTarget: 2 })));
  d = moveItems(d, ['i9', 'i1'], 1); // pick from sprint 3 and sprint 1, append to sprint 2 in the given order
  assert.deepEqual(d.map((x) => x.itemIds), [['i2'], ['i3', 'i4', 'i5', 'i6', 'i9', 'i1'], ['i7', 'i8', 'i10']]);
  d = moveItems(d, ['i2'], d.length); // to a new sprint at the end; sprint 1 is now empty but kept
  assert.equal(d.length, 4);
  assert.deepEqual(d[3].itemIds, ['i2']);
  assert.deepEqual(d[0].itemIds, []);
  d = moveItems(d, ['i3', 'i4'], -1);
  assert.deepEqual(unplacedIds(d, list), ['i3', 'i4']);
  d = moveWithin(d, 1, 'i1', -1);
  assert.deepEqual(d[1].itemIds.slice(-2), ['i1', 'i9']);
  assert.equal(moveWithin(d, 1, 'i5', -1), d, 'first item cannot move up');
});

test('split, merge, add, delete, reorder, rename and dates', () => {
  const list = items(6);
  let d = withKeys([{ weeks: 3, itemIds: ['i1', 'i2', 'i3', 'i4'] }, { weeks: 2, itemIds: ['i5', 'i6'] }]);
  d = splitSprint(d, 0, 1);
  assert.deepEqual(d.map((x) => x.itemIds), [['i1'], ['i2', 'i3', 'i4'], ['i5', 'i6']]);
  d = mergeWithNext(d, 1);
  assert.deepEqual(d.map((x) => x.itemIds), [['i1'], ['i2', 'i3', 'i4', 'i5', 'i6']]);
  assert.equal(d[1].weeks, 5);
  d = addSprint(d, 1);
  assert.deepEqual(d.map((x) => x.itemIds.length), [1, 0, 5]);
  d = moveSprint(d, 2, -1);
  assert.deepEqual(d.map((x) => x.itemIds.length), [1, 5, 0]);
  d = removeSprint(d, 0);
  assert.deepEqual(unplacedIds(d, list), ['i1'], 'items of a deleted sprint go back to the pool, not out of the roadmap');
  d = renameSprint(d, 0, 'Tuỳ chọn');
  d = setStart(d, 1, '2027-03-01');
  const L = layoutPlan(d, list, track(), '2026-11-24');
  assert.equal(L.sprints[0].title, 'Tuỳ chọn');
  assert.equal(L.sprints[1].start, '2027-03-01');
  assert.equal(L.sprints[1].title, 'Sprint 2', 'an empty sprint is kept with a default name');
  const chained = layoutPlan(chainDates(d, false), list, track(), '2026-11-24');
  assert.equal(chained.sprints[1].start, '2026-12-29');
});

const sprint = (over: Partial<Sprint>): Sprint => ({ id: 's1', trackId: 't1', title: '', deliverable: '', start: '2026-11-24', end: '2026-12-07', milestones: [], status: 'active', ...over });

test('editing the running sprint keeps finished and plain milestones and reuses milestone ids', () => {
  const list = phased().map((i) => (i.id === 'i1' ? { ...i, done: true, doneOn: '2026-11-24' } : i));
  const active = sprint({
    title: 'Chặng 1: Biết mình → Chặng 2: Thuế',
    deliverable: 'Hoàn thành 4 mục, từ "Bài 1" đến "Bài 4"',
    milestones: [
      { id: 'm1', text: 'Bài 1', done: true, doneOn: '2026-11-24', itemId: 'i1' },
      { id: 'm2', text: 'Bài 2', done: false, itemId: 'i2' },
      { id: 'm3', text: 'Bài 3', done: false, itemId: 'i3' },
      { id: 'm4', text: 'Bài 4', done: false, itemId: 'i4' },
      { id: 'mx', text: 'Viết ghi chú', done: false },
    ],
  });
  const planned = sprint({ id: 's2', status: 'planned', title: 'Kế tiếp', start: '2026-12-08', end: '2026-12-21', milestones: [{ id: 'm5', text: 'Bài 5', done: false, itemId: 'i5' }] });
  const t = track();
  let d = draftsFromSprints([planned, active], list, 't1');
  assert.deepEqual(d.map((x) => x.sprintId), ['s1', 's2'], 'running sprint first');
  assert.deepEqual(d[0].itemIds, ['i2', 'i3', 'i4'], 'finished items are not editable');
  assert.equal(d[0].title, undefined, 'automatic title follows the items');
  assert.equal(d[1].title, 'Kế tiếp');
  d = moveItems(d, ['i3', 'i4'], 1); // shrink the running sprint to Chặng 1 only
  const L = layoutPlan(d, list, t, '2026-11-24');
  assert.equal(L.sprints[0].title, 'Chặng 1: Biết mình');
  assert.equal(L.sprints[0].end, '2026-12-07', 'exact dates are kept');
  const ch = saveChanges(L, t, [active, planned], list, '2026-11-24', newId);
  assert.deepEqual(ch.active, { title: active.title, added: 0, removed: 2, closed: false, datesChanged: false });
  const a = ch.save.find((s) => s.id === 's1')!;
  assert.deepEqual(a.milestones.map((m) => m.id), ['m1', 'mx', 'm2']);
  assert.equal(a.title, 'Chặng 1: Biết mình');
  assert.equal(a.status, 'active');
  const p = ch.save.find((s) => s.id === 's2')!;
  assert.deepEqual(p.milestones.map((m) => m.itemId), ['i5', 'i3', 'i4']);
  assert.equal(p.milestones[0].id, 'm5');
  assert.deepEqual(ch.remove, []);
});

test('deleting sprints: untouched ones are removed, the running one with progress is closed as done', () => {
  const list = items(4, (i) => (i === 0 ? { done: true, doneOn: '2026-11-24' } : {}));
  const active = sprint({ milestones: [{ id: 'm1', text: 'Bài 1', done: true, doneOn: '2026-11-24', itemId: 'i1' }, { id: 'm2', text: 'Bài 2', done: false, itemId: 'i2' }] });
  const planned = sprint({ id: 's2', status: 'planned', start: '2026-12-08', end: '2026-12-21', milestones: [{ id: 'm3', text: 'Bài 3', done: false, itemId: 'i3' }] });
  const t = track();
  const d = removeSprint(removeSprint(draftsFromSprints([active, planned], list, 't1'), 1), 0);
  const fresh = moveItems(d, ['i2', 'i3', 'i4'], 0);
  const L = layoutPlan(fresh, list, t, '2026-11-25');
  const ch = saveChanges(L, t, [active, planned], list, '2026-11-25', newId);
  assert.deepEqual(ch.remove, ['s2']);
  const closed = ch.save.find((s) => s.id === 's1')!;
  assert.equal(closed.status, 'done');
  assert.deepEqual(closed.milestones.map((m) => m.id), ['m1'], 'only finished work stays in history');
  const created = ch.save.filter((s) => s.id !== 's1');
  assert.equal(created.length, 1);
  assert.equal(created[0].status, 'active', 'with nothing running, the first new sprint starts');
  assert.equal(ch.active?.closed, true);
});

test('a brand-new plan makes its first sprint active; kept planned sprints are not auto-started', () => {
  const list = items(4);
  const t = track();
  const L = layoutPlan(withKeys([{ weeks: 2, itemIds: ['i1', 'i2'] }, { weeks: 2, itemIds: ['i3', 'i4'] }]), list, t, '2026-11-24');
  const ch = saveChanges(L, t, [], list, '2026-11-24', newId);
  assert.deepEqual(ch.save.map((s) => s.status), ['active', 'planned']);
  const planned = sprint({ id: 's2', status: 'planned', start: '2026-12-01', end: '2026-12-14', milestones: [{ id: 'm', text: 'Bài 1', done: false, itemId: 'i1' }] });
  const d = addSprint(draftsFromSprints([planned], list, 't1'));
  const L2 = layoutPlan(moveItems(d, ['i2'], 1), list, t, '2026-11-24');
  const ch2 = saveChanges(L2, t, [planned], list, '2026-11-24', newId);
  assert.ok(ch2.save.every((s) => s.status === 'planned'));
  const unchanged = saveChanges(layoutPlan(draftsFromSprints([planned], list, 't1'), list, t, '2026-11-24'), t, [planned], list, '2026-11-24', newId);
  assert.deepEqual(unchanged.save, [], 'loading and saving without edits writes nothing');
});

test('drag and drop: one item or a selected group, before an anchor, across sprints, back to the pool', () => {
  const list = items(8);
  let d = withKeys([{ weeks: 2, itemIds: ['i1', 'i2', 'i3'] }, { weeks: 2, itemIds: ['i4', 'i5', 'i6'] }]);
  d = dropItems(d, ['i2'], 1, 'i5'); // drag i2 between i4 and i5
  assert.deepEqual(d.map((x) => x.itemIds), [['i1', 'i3'], ['i4', 'i2', 'i5', 'i6']]);
  d = dropItems(d, ['i6'], 1, 'i4'); // reorder inside a sprint: i6 to the top
  assert.deepEqual(d[1].itemIds, ['i6', 'i4', 'i2', 'i5']);
  d = dropItems(d, ['i1', 'i7', 'i8'], 0, null); // a group from a sprint and the pool, dropped at the end
  assert.deepEqual(d[0].itemIds, ['i3', 'i1', 'i7', 'i8']);
  d = dropItems(d, ['i4', 'i2'], 1, 'i4'); // anchor inside the moved group: next unmoved item is the anchor
  assert.deepEqual(d[1].itemIds, ['i6', 'i4', 'i2', 'i5']);
  d = dropItems(d, ['i3'], -1, null);
  assert.deepEqual(unplacedIds(d, list), ['i3']);
  d = dropItems(d, ['i3'], 2, null); // past the last sprint: a new sprint
  assert.equal(d.length, 3);
  assert.deepEqual(d[2].itemIds, ['i3']);
  assert.equal(dropItems(d, [], 0, null), d);
});
