// Free-form sprint plan editing. A plan is an ordered list of drafts; any draft may hold any roadmap items in any
// order. Presets (by weeks, one sprint per phase) only produce a starting point; every operation below is pure and
// returns a new list, so the editor can preview before anything is saved.
import { diffDays } from './dates.js';
import { costPrefs, itemSessions } from './roadmap.js';
import { autoDeliverable, autoTitle, EDIT_MAX_WEEKS, EDIT_MIN_WEEKS, weeklyCapacity, type DraftSprint, type PlanLayout } from './plan.js';
import type { Day, Milestone, RoadmapItem, Sprint, SprintStatus, Track } from './types.js';

export type EditDraft = DraftSprint & { key: string; status?: SprintStatus; locked?: boolean };

/** Closed sprints are history: shown in the planner, not rewritten when the plan is saved. */
export const isClosed = (s: { status?: SprintStatus; locked?: boolean }): boolean =>
  !!s.locked || s.status === 'done' || s.status === 'dropped';


let seq = 0;
export const draftKey = (): string => `d${Date.now().toString(36)}${(seq++).toString(36)}`;

const copy = (ds: EditDraft[]): EditDraft[] => ds.map((d) => ({ ...d, itemIds: [...d.itemIds] }));
export const withKeys = (ds: DraftSprint[]): EditDraft[] => ds.map((d) => ({ ...d, itemIds: [...d.itemIds], key: d.key ?? draftKey() }));

/** True when the roadmap has at least one named phase. */
export function hasPhases(items: RoadmapItem[]): boolean {
  return items.some((i) => !!i.phase);
}

/**
 * Preset: one sprint per run of consecutive items with the same phase (items without a phase form their own run).
 * Length is the effort at the weekly target, rounded up to whole weeks (1-8). Without any phase there is
 * nothing to split by, so the caller should fall back to the weeks preset.
 */
export function proposeByPhase(items: RoadmapItem[], track: Track): DraftSprint[] {
  const p = costPrefs(track);
  const perWeek = weeklyCapacity(track);
  const out: { phase: string; itemIds: string[]; sessions: number }[] = [];
  for (const it of items) {
    const ph = it.phase ?? '';
    let cur = out[out.length - 1];
    if (!cur || cur.phase !== ph) { cur = { phase: ph, itemIds: [], sessions: 0 }; out.push(cur); }
    cur.itemIds.push(it.id);
    cur.sessions += itemSessions(it, p);
  }
  return out.map((g) => ({ itemIds: g.itemIds, weeks: Math.max(EDIT_MIN_WEEKS, Math.min(EDIT_MAX_WEEKS, Math.ceil(g.sessions / perWeek - 1e-9))) }));
}

/** Items of `pool` that are in no draft, in pool order. Finished lessons are never offered as unassigned. */
export function unplacedIds(drafts: DraftSprint[], pool: RoadmapItem[]): string[] {
  const used = new Set(drafts.flatMap((d) => d.itemIds));
  return pool.filter((i) => !i.done && !used.has(i.id)).map((i) => i.id);
}

/**
 * Moves items (from any sprints, in the order given) to the end of draft `to`. `to` = -1 only removes them
 * (they go back to the unplaced list); `to` = drafts.length appends a new sprint holding them.
 */
export function moveItems(drafts: EditDraft[], ids: string[], to: number, weeks = 2): EditDraft[] {
  const set = new Set(ids);
  if (!set.size) return drafts;
  const next = copy(drafts).map((d) => ({ ...d, itemIds: d.itemIds.filter((x) => !set.has(x)) }));
  if (to < 0) return next;
  if (to >= next.length) next.push({ key: draftKey(), weeks, itemIds: [] });
  next[Math.min(to, next.length - 1)].itemIds.push(...ids.filter((x, k) => ids.indexOf(x) === k));
  return next;
}

/** Moves one item up or down inside its sprint. */
export function moveWithin(drafts: EditDraft[], i: number, id: string, dir: -1 | 1): EditDraft[] {
  const d = drafts[i];
  const k = d?.itemIds.indexOf(id) ?? -1;
  const j = k + dir;
  if (k < 0 || j < 0 || j >= d.itemIds.length) return drafts;
  const next = copy(drafts);
  const list = next[i].itemIds;
  [list[k], list[j]] = [list[j], list[k]];
  return next;
}

/** Moves a whole sprint up or down in the plan. */
export function moveSprint(drafts: EditDraft[], i: number, dir: -1 | 1): EditDraft[] {
  const j = i + dir;
  if (i < 0 || j < 0 || i >= drafts.length || j >= drafts.length) return drafts;
  const next = copy(drafts);
  [next[i], next[j]] = [next[j], next[i]];
  return next;
}

/** Splits draft i before item index `at` (1..n-1); the second half becomes a new sprint right after it. */
export function splitSprint(drafts: EditDraft[], i: number, at: number): EditDraft[] {
  const d = drafts[i];
  if (!d || at <= 0 || at >= d.itemIds.length) return drafts;
  const next = copy(drafts);
  const tail = next[i].itemIds.splice(at);
  next.splice(i + 1, 0, { key: draftKey(), weeks: d.weeks, itemIds: tail });
  return next;
}

/** Merges draft i+1 into draft i (items appended). The merged sprint keeps the first one's identity and dates. */
export function mergeWithNext(drafts: EditDraft[], i: number): EditDraft[] {
  if (i < 0 || i + 1 >= drafts.length) return drafts;
  const next = copy(drafts);
  const b = next.splice(i + 1, 1)[0];
  next[i].itemIds.push(...b.itemIds);
  next[i].weeks = Math.min(EDIT_MAX_WEEKS, next[i].weeks + b.weeks);
  next[i].days = undefined;
  return next;
}

/** Inserts an empty sprint at position `at` (default: the end). */
export function addSprint(drafts: EditDraft[], at = drafts.length, weeks = 2): EditDraft[] {
  const next = copy(drafts);
  next.splice(Math.max(0, Math.min(at, next.length)), 0, { key: draftKey(), weeks, itemIds: [] });
  return next;
}

/** Removes draft i. Its items are not deleted from the roadmap: they return to the unplaced list. */
export function removeSprint(drafts: EditDraft[], i: number): EditDraft[] {
  if (i < 0 || i >= drafts.length) return drafts;
  return copy(drafts).filter((_, k) => k !== i);
}

export function renameSprint(drafts: EditDraft[], i: number, title: string): EditDraft[] {
  return drafts.map((d, k) => (k === i ? { ...d, title: title.slice(0, 200) } : d));
}

/** Sets an explicit first day for draft i (empty string clears it so the sprint follows the previous one). */
export function setStart(drafts: EditDraft[], i: number, start: Day | ''): EditDraft[] {
  if (isClosed(drafts[i] ?? {})) return drafts;
  return drafts.map((d, k) => (k === i ? { ...d, start: start || undefined } : d));
}

/** Drops every explicit start except the first sprint's, so sprints follow each other from the plan start. Closed sprints keep their dates. */
export function chainDates(drafts: EditDraft[], keepFirst: boolean): EditDraft[] {
  return drafts.map((d, k) => (isClosed(d) || (k === 0 && keepFirst) ? d : { ...d, start: undefined }));
}

// ---------------------------------------------------------------- Existing sprints <-> drafts

const isOpen = (s: Sprint) => s.status === 'active' || s.status === 'planned';

const statusRank = (s: Sprint): number => (s.status === 'active' ? 0 : s.status === 'planned' ? 1 : 2);

/**
 * Every sprint of a track (open ones, then closed history) as drafts that keep their exact dates and every
 * linked lesson, including finished ones. Closed sprints are marked `locked` so a later save will not rewrite
 * them. A title that equals the automatic title of its items is treated as automatic, so it follows the items.
 */
export function draftsFromSprints(sprints: Sprint[], items: RoadmapItem[], trackId: string): EditDraft[] {
  const byId = new Map(items.map((i) => [i.id, i]));
  const own = sprints.filter((s) => s.trackId === trackId)
    .sort((a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : statusRank(a) - statusRank(b)));
  const seen = new Set<string>();
  return own.map((s, k) => {
    const ids = s.milestones.map((m) => m.itemId).filter((x): x is string => !!x && !!byId.get(x) && !seen.has(x));
    ids.forEach((x) => seen.add(x));
    const linked = ids.map((id) => byId.get(id)!);
    const days = diffDays(s.end, s.start) + 1;
    const auto = s.title === autoTitle(linked, k + 1);
    const locked = isClosed(s);
    return { key: s.id, sprintId: s.id, itemIds: ids, title: auto ? undefined : s.title, start: s.start, days, weeks: Math.max(1, Math.round(days / 7)), status: s.status, locked };
  });
}

export interface SaveChanges {
  save: Sprint[]; // new and changed sprints
  remove: string[]; // sprint ids deleted outright
  active?: { title: string; added: number; removed: number; closed: boolean; datesChanged: boolean }; // what happens to the running sprint
}

/**
 * Turns the edited plan into sprint records.
 * - A draft with `sprintId` updates that open sprint: items follow the draft (including finished lessons);
 *   plain milestones and finished linked milestones missing from the draft are kept. A milestone id is reused.
 *   Closed (done/dropped) sprints in the layout are left untouched; they are never recreated or reset to planned.
 * - A new draft creates a sprint. When no sprint is running and no planned sprint is kept, the first sprint of the
 *   plan becomes active (same as creating a plan for the first time).
 * - An open sprint missing from the drafts is deleted when nothing in it was finished; otherwise it is closed
 *   ('done' for the running sprint, so its finished milestones stay in history; 'dropped' for a planned one).
 */
export function saveChanges(layout: PlanLayout, track: Track, sprints: Sprint[], items: RoadmapItem[], today: Day, newId: () => string): SaveChanges {
  const byItem = new Map(items.map((i) => [i.id, i]));
  const own = sprints.filter((s) => s.trackId === track.id && isOpen(s));
  const closedIds = new Set(sprints.filter((s) => s.trackId === track.id && !isOpen(s)).map((s) => s.id));
  const byId = new Map(own.map((s) => [s.id, s]));
  const keptIds = new Set(layout.sprints.map((s) => s.sprintId).filter((x): x is string => !!x && byId.has(x)));
  const save: Sprint[] = [];
  const remove: string[] = [];
  let active: SaveChanges['active'];
  for (const s of own) {
    if (keptIds.has(s.id)) continue;
    const anyDone = s.milestones.some((m) => m.done);
    if (s.status === 'active') active = { title: s.title, added: 0, removed: s.milestones.filter((m) => !m.done).length, closed: true, datesChanged: false };
    if (!anyDone) remove.push(s.id);
    else save.push({ ...s, status: s.status === 'active' ? 'done' : 'dropped', closedOn: today, reflection: s.reflection ?? 'Khép lại khi sửa kế hoạch sprint.', milestones: s.milestones.filter((m) => m.done || !m.itemId) });
  }
  const activeKept = own.some((s) => s.status === 'active' && keptIds.has(s.id));
  // With nothing running, the first sprint of a brand-new plan starts now. Kept planned sprints wait for the
  // explicit "Bắt đầu" button on the topic page, as before.
  const plannedKept = own.some((s) => s.status === 'planned' && keptIds.has(s.id));
  let needActive = !activeKept && !plannedKept;
  for (const L of layout.sprints) {
    if (L.sprintId && closedIds.has(L.sprintId)) continue;
    const old = L.sprintId ? byId.get(L.sprintId) : undefined;
    const want = L.items.map((i) => i.id);
    if (old) {
      const reuse = new Map(old.milestones.filter((m) => m.itemId).map((m) => [m.itemId!, m]));
      const used = new Set<string>();
      const linked: Milestone[] = [];
      for (const id of want) {
        const item = byItem.get(id);
        if (!item) continue;
        const prev = reuse.get(id);
        if (prev) { linked.push(prev); used.add(prev.id); }
        else linked.push({ id: newId(), text: item.title, done: !!item.done, doneOn: item.doneOn, itemId: id });
      }
      // Finished linked milestones and plain ones missing from the draft stay on the sprint; they are never dropped.
      const leftover = old.milestones.filter((m) => !used.has(m.id) && (!m.itemId || !byItem.has(m.itemId) || byItem.get(m.itemId)!.done || m.done));
      const milestones = [...linked, ...leftover];
      const oldOpen = old.milestones.filter((m) => m.itemId && !m.done && !byItem.get(m.itemId)?.done).map((m) => m.itemId!);
      const wantOpen = want.filter((id) => !byItem.get(id)?.done);
      const itemsChanged = oldOpen.join() !== wantOpen.join();
      const oldAutoDeliverable = old.deliverable === '' || /^Hoàn thành/.test(old.deliverable);
      const deliverable = itemsChanged && oldAutoDeliverable ? autoDeliverable(L.items) : old.deliverable;
      const title = L.autoTitle && !itemsChanged ? old.title : L.title;
      const next: Sprint = { ...old, title, deliverable, start: L.start, end: L.end, milestones };
      if (old.status === 'active') {
        const before = new Set(oldOpen);
        const after = new Set(wantOpen);
        active = { title: old.title, added: wantOpen.filter((x) => !before.has(x)).length, removed: oldOpen.filter((x) => !after.has(x)).length, closed: false, datesChanged: old.start !== L.start || old.end !== L.end };
      }
      if (JSON.stringify(next) !== JSON.stringify(old)) save.push(next);
    } else {
      const status = needActive && L.index === 0 ? 'active' : 'planned';
      if (status === 'active') needActive = false;
      save.push({
        id: newId(), trackId: track.id, title: L.title, deliverable: L.deliverable, start: L.start, end: L.end, status,
        milestones: L.items.map((i) => ({ id: newId(), text: i.title, done: !!i.done, doneOn: i.doneOn, itemId: i.id })),
      });
    }
  }
  if (active && !active.closed && !active.added && !active.removed && !active.datesChanged) active = undefined;
  return { save, remove, active };
}

/**
 * Drag and drop result: puts `ids` (one dragged item, or every selected item in plan order) into draft `to`
 * right before item `before` (null = at the end). `to` = -1 drops them back to the unplaced list.
 * Dropping an item before itself or inside the moved group keeps the position stable.
 */
export function dropItems(drafts: EditDraft[], ids: string[], to: number, before: string | null): EditDraft[] {
  const uniq = ids.filter((x, k) => ids.indexOf(x) === k);
  if (!uniq.length) return drafts;
  if (to < 0) return moveItems(drafts, uniq, -1);
  if (to >= drafts.length) return moveItems(drafts, uniq, drafts.length);
  const set = new Set(uniq);
  // Anchor on the first item after `before` that is not being moved.
  let anchor = before;
  if (anchor && set.has(anchor)) {
    const list = drafts[to].itemIds;
    const k = list.indexOf(anchor);
    anchor = k < 0 ? null : list.slice(k).find((x) => !set.has(x)) ?? null;
  }
  const next = copy(drafts).map((d) => ({ ...d, itemIds: d.itemIds.filter((x) => !set.has(x)) }));
  const target = next[to].itemIds;
  const at = anchor ? target.indexOf(anchor) : -1;
  target.splice(at < 0 ? target.length : at, 0, ...uniq);
  return next;
}
