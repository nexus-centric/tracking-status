// Roadmap: overview card on the track page, the full roadmap page, paste-to-import and the sprint planner.
import { addDays, diffDays, fmtDay, today } from '../core/dates.js';
import { fmtMinutes } from '../core/format.js';
import { EDIT_MAX_WEEKS, itemsToPlan, layoutPlan, planChanges, planStart, proposePlan, setWeeks, type PlanLayout } from '../core/plan.js';
import { addSprint, chainDates, draftsFromSprints, hasPhases, mergeWithNext, moveItems, moveSprint, moveWithin, proposeByPhase, removeSprint, renameSprint, saveChanges, setStart, splitSprint, unplacedIds, withKeys, type EditDraft } from '../core/plan-edit.js';
import { costPrefs, moveItem, plannedItemIds, projectRoadmap, renumber, roadmapProgress, type CostPrefs, type Projection, type RoadmapProgress } from '../core/roadmap.js';
import { parseRoadmapInput, type DraftItem, type ParseOutcome } from '../core/roadmap-parse.js';
import { activeSprint, sprintProgress } from '../core/sprint.js';
import type { Day, Estimate, RoadmapItem, Sprint, Track } from '../core/types.js';
import { commit, deleteItems, getTrack, itemsOf, newId, saveTrack, state } from '../state.js';
import { esc, isHttpUrl, openModal, toast } from '../ui.js';
import type { View } from './track.js';

const nf = new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 1 });

export function fmtDate(d: Day, ref: Day = today()): string {
  return d.slice(0, 4) === ref.slice(0, 4) ? fmtDay(d) : `${fmtDay(d)}/${d.slice(0, 4)}`;
}

export function estText(e?: Estimate): string {
  if (!e) return '';
  return e.unit === 'min' ? fmtMinutes(e.value) : `${nf.format(e.value)} buổi`;
}

function sessionsText(n: number): string {
  const r = Math.round(n * 10) / 10;
  return `${nf.format(r)} buổi`;
}

function hoursText(sessions: number, p: CostPrefs): string {
  const mins = Math.round(sessions * p.sessionMinutes);
  return mins >= 60 ? `khoảng ${nf.format(Math.round(mins / 6) / 10)} giờ` : `khoảng ${mins} phút`;
}

/** Progress line with a flowing beam and a tick at each phase boundary. */
export function roadmapLine(prog: RoadmapProgress, color: string, big = false): string {
  const pct = Math.round(prog.pct * 1000) / 10;
  const total = prog.weighted ? prog.totalSessions : prog.total;
  let acc = 0;
  const ticks = prog.phases.slice(0, -1).map((ph) => {
    acc += prog.weighted ? ph.sessions : ph.total;
    return total ? `<span class="rl-tick" style="left:${((acc / total) * 100).toFixed(2)}%" title="${esc(ph.name || 'Chưa có phần')}"></span>` : '';
  }).join('');
  return `<div class="rline${big ? ' big' : ''}${prog.done ? ' flowing' : ''}" style="--c:${esc(color)}" role="img" aria-label="Đã xong ${nf.format(pct)}% lộ trình">
    <div class="rl-track">${ticks}<div class="rl-fill" style="width:${pct}%"><i class="beam" aria-hidden="true"></i></div>${prog.done && prog.done < prog.total ? `<span class="rl-head" style="left:${pct}%" aria-hidden="true"></span>` : ''}</div>
  </div>`;
}

function projectionLines(t: Track, pj: Projection, prog: RoadmapProgress): string {
  if (prog.total && prog.done === prog.total) return '<p class="ok-text">Bạn đã đi hết lộ trình này.</p>';
  const lines: string[] = [];
  if (pj.recentFinish) {
    const low = pj.confidence === 'low' ? ' <span class="muted">(còn ít dữ liệu nên con số sẽ dao động)</span>' : '';
    lines.push(`<li><span class="lbl">Theo tốc độ gần đây</span><b>${fmtDate(pj.recentFinish)}</b>${low}</li>`);
  } else {
    lines.push('<li><span class="lbl">Theo tốc độ gần đây</span><span class="muted">chưa đủ dữ liệu; hoàn thành vài mục là có ước tính</span></li>');
  }
  if (pj.targetFinish) lines.push(`<li><span class="lbl">Nếu học đủ ${t.weeklyTarget} ngày mỗi tuần</span><b>${fmtDate(pj.targetFinish)}</b></li>`);
  if (pj.plannedFinish) lines.push(`<li><span class="lbl">Theo kế hoạch các sprint</span><b>${fmtDate(pj.plannedFinish)}</b></li>`);
  return `<ul class="proj">${lines.join('')}</ul>`;
}

function assumptions(t: Track, pj: Projection, prog: RoadmapProgress): string {
  const p = costPrefs(t);
  return `<details class="assume"><summary>Cách tính các con số này</summary>
    <ul class="small muted">
      <li>Phần trăm hoàn thành ${prog.weighted ? 'tính theo khối lượng ước lượng của từng mục; mục chưa có ước lượng được tính như ' + sessionsText(1 / p.itemsPerSession) : 'tính theo số mục, vì chưa mục nào có ước lượng thời gian'}.</li>
      <li>Một buổi học được coi là ${p.sessionMinutes} phút. Mỗi ngày có học tính là một buổi.</li>
      <li>Tốc độ gần đây: trong ${pj.windowDays} ngày qua bạn xong ${pj.itemsInWindow} mục (${sessionsText(pj.sessionsInWindow)}) trong ${pj.activeDays} ngày có học, tức khoảng ${nf.format(Math.round(pj.activePerWeek * 10) / 10)} ngày học mỗi tuần.</li>
      <li>Ngày dự kiến giả định bạn giữ đúng tốc độ đó cho phần còn lại (${sessionsText(pj.remainingSessions)}, ${hoursText(pj.remainingSessions, p)}). Đây là ước tính, không phải hạn chót.</li>
      <li>Những ngày tạm dừng, nghỉ hoặc bận trong quá khứ làm tốc độ gần đây thấp hơn; sau khi học lại đều, con số sẽ tự cập nhật.</li>
    </ul>
  </details>`;
}

/** Why a re-plan is suggested, or null. Never changes anything by itself. */
export function replanReason(t: Track, items: RoadmapItem[], pj: Projection): string | null {
  const remaining = items.filter((i) => !i.done);
  if (!remaining.length) return null;
  const planned = plannedItemIds(state.sprints, t.id);
  const unplanned = remaining.filter((i) => !planned.has(i.id)).length;
  const s = activeSprint(state.sprints, t.id);
  const linked = s?.milestones.some((m) => m.itemId);
  if (s && linked && sprintProgress(s, today()).pace === 'overdue') return `Sprint "${s.title}" đã quá hạn mà còn mục chưa xong.`;
  if (pj.behindDays !== undefined && pj.behindDays > 7 && pj.confidence !== 'none' && pj.plannedFinish) return `Theo tốc độ gần đây, bạn sẽ xong muộn hơn kế hoạch khoảng ${pj.behindDays} ngày.`;
  if (unplanned && planned.size) return `${unplanned} mục chưa nằm trong sprint nào.`;
  return null;
}

export function roadmapCard(t: Track): string {
  const items = itemsOf(t.id);
  if (!items.length) {
    return `<section class="card roadmap-card empty-rm">
      <div class="row between wrap"><h2>Lộ trình</h2></div>
      <p class="muted">Có sẵn giáo trình hay danh sách bài học? Dán vào là app tự tách thành từng mục, chia thành các sprint 2 đến 4 tuần và tính tiến độ cho cả lộ trình.</p>
      <a class="btn primary" href="#/t/${t.id}/roadmap/import">Dán lộ trình</a>
    </section>`;
  }
  const p = costPrefs(t);
  const prog = roadmapProgress(items, p);
  const pj = projectRoadmap({ track: t, items, logs: state.logs, sprints: state.sprints, today: today() });
  const why = replanReason(t, items, pj);
  return `<section class="card roadmap-card">
    <div class="row between wrap"><h2>Lộ trình</h2><span class="small muted mono">${prog.done}/${prog.total} mục · ${nf.format(Math.round(prog.pct * 100))}%</span></div>
    ${roadmapLine(prog, t.color)}
    ${projectionLines(t, pj, prog)}
    ${why ? `<div class="banner replan"><span>${esc(why)} Bạn có muốn xếp lại các sprint? Ngày tháng chỉ thay đổi khi bạn xác nhận.</span><a class="btn small" href="#/t/${t.id}/plan">Lập lại kế hoạch</a></div>` : ''}
    <div class="row gap wrap"><a class="btn small" href="#/t/${t.id}/roadmap">Xem toàn bộ lộ trình</a>${why ? '' : `<a class="btn small ghost" href="#/t/${t.id}/plan">Kế hoạch sprint</a>`}</div>
  </section>`;
}

/** Planned (future) sprints on the track page, with an explicit start button for the next one. */
export function plannedCard(t: Track): string {
  const planned = state.sprints.filter((s) => s.trackId === t.id && s.status === 'planned').sort((a, b) => (a.start < b.start ? -1 : 1));
  if (!planned.length) return '';
  const d = today();
  const hasActive = !!activeSprint(state.sprints, t.id);
  const next = planned[0];
  const startBtns = hasActive ? '' : next.start === d
    ? `<button class="btn small primary" data-act="start-planned" data-id="${next.id}" data-shift="0">Bắt đầu sprint này</button>`
    : `<button class="btn small primary" data-act="start-planned" data-id="${next.id}" data-shift="1">Bắt đầu từ hôm nay</button><button class="btn small ghost" data-act="start-planned" data-id="${next.id}" data-shift="0">Giữ ngày ${fmtDate(next.start)}</button>`;
  return `<section class="card planned-card">
    <div class="row between wrap"><h2>Các sprint tiếp theo</h2><a class="btn small" href="#/t/${t.id}/plan">Sửa kế hoạch</a></div>
    ${hasActive ? '' : `<p class="small muted">Chưa có sprint nào đang chạy. ${next.start === d ? 'Sprint kế tiếp bắt đầu hôm nay.' : `Sprint kế tiếp dự kiến bắt đầu ${fmtDate(next.start)}. "Bắt đầu từ hôm nay" sẽ dời sprint này và các sprint sau theo cùng số ngày.`}</p><div class="row gap wrap">${startBtns}</div>`}
    <ol class="plan-list">${planned.map((s) => `<li><b>${esc(s.title)}</b><span class="small muted mono">${fmtDate(s.start)} - ${fmtDate(s.end)} · ${s.milestones.length} mục</span></li>`).join('')}</ol>
  </section>`;
}

// ---------------------------------------------------------------- Roadmap page

export function roadmapView(id: string): View {
  const t = getTrack(id);
  if (!t) return { title: 'Không tìm thấy', html: '<section class="card"><p>Không tìm thấy topic này.</p><a class="btn small" href="#/">Về trang Hôm nay</a></section>' };
  const items = itemsOf(t.id);
  if (!items.length) return importView(id);
  const d = today();
  const p = costPrefs(t);
  const prog = roadmapProgress(items, p);
  const pj = projectRoadmap({ track: t, items, logs: state.logs, sprints: state.sprints, today: d });
  const why = replanReason(t, items, pj);
  const where = new Map<string, Sprint>();
  for (const s of state.sprints) if (s.trackId === t.id && (s.status === 'active' || s.status === 'planned')) for (const m of s.milestones) if (m.itemId) where.set(m.itemId, s);
  const phases: { name: string; items: RoadmapItem[] }[] = [];
  for (const i of items) {
    const name = i.phase ?? '';
    if (!phases.length || phases[phases.length - 1].name !== name) phases.push({ name, items: [] });
    phases[phases.length - 1].items.push(i);
  }
  const itemRow = (i: RoadmapItem, k: number) => {
    const s = i.done ? undefined : where.get(i.id);
    const badge = s ? `<span class="badge${s.status === 'active' ? ' on' : ''}">${s.status === 'active' ? 'sprint hiện tại' : `sprint từ ${fmtDate(s.start)}`}</span>` : '';
    return `<li class="ri${i.done ? ' done' : ''}" data-id="${i.id}">
      <label class="ri-check"><input type="checkbox" data-act="ri-done" data-id="${i.id}" ${i.done ? 'checked' : ''}><span class="ri-title">${esc(i.title)}</span></label>
      <span class="ri-meta">${i.estimate ? `<span class="est">${esc(estText(i.estimate))}</span>` : ''}${badge}${i.done && i.doneOn ? `<span class="small muted">xong ${fmtDate(i.doneOn)}</span>` : ''}${i.link ? `<a href="${esc(i.link)}" target="_blank" rel="noopener noreferrer" class="btn xs">Mở link ↗</a>` : ''}</span>
      <span class="ri-acts"><button class="icon-btn" data-act="ri-up" data-id="${i.id}" aria-label="Lên trên" ${k === 0 ? 'disabled' : ''}>↑</button><button class="icon-btn" data-act="ri-down" data-id="${i.id}" aria-label="Xuống dưới" ${k === items.length - 1 ? 'disabled' : ''}>↓</button><button class="btn xs" data-act="ri-edit" data-id="${i.id}">Sửa</button><button class="btn xs danger" data-act="ri-del" data-id="${i.id}">Xoá</button></span>
    </li>`;
  };
  let k = 0;
  const html = `<section class="editor-head">
    <a href="#/t/${t.id}" class="back">${esc(t.name)}</a>
    <h1>Lộ trình</h1>
  </section>
  <section class="card rm-overview" style="--c:${esc(t.color)}">
    <div class="rm-stats">
      <div><b class="mono">${nf.format(Math.round(prog.pct * 100))}%</b><span>đã hoàn thành${prog.weighted ? ', tính theo khối lượng' : ''}</span></div>
      <div><b class="mono">${prog.done}/${prog.total}</b><span>mục đã xong, ${phases.length > 1 || phases[0].name ? `${phases.length} phần` : 'chưa chia phần'}</span></div>
      <div><b class="mono">${sessionsText(prog.remainingSessions)}</b><span>còn lại, ${hoursText(prog.remainingSessions, p)}</span></div>
    </div>
    ${roadmapLine(prog, t.color, true)}
    ${projectionLines(t, pj, prog)}
    ${assumptions(t, pj, prog)}
    ${why ? `<div class="banner replan"><span>${esc(why)} Ngày tháng chỉ thay đổi khi bạn xác nhận.</span><a class="btn small" href="#/t/${t.id}/plan">Lập lại kế hoạch</a></div>` : ''}
    <div class="row gap wrap"><a class="btn small primary" href="#/t/${t.id}/plan">${state.sprints.some((s) => s.trackId === t.id && s.milestones.some((m) => m.itemId)) ? 'Kế hoạch sprint' : 'Chia thành các sprint'}</a><a class="btn small" href="#/t/${t.id}/roadmap/import">Dán thêm mục</a></div>
  </section>
  ${phases.map((ph) => {
    const done = ph.items.filter((i) => i.done).length;
    return `<section class="card rphase">
      <div class="row between wrap"><h2>${esc(ph.name || 'Chưa có phần')}</h2><span class="small muted mono">${done}/${ph.items.length}</span></div>
      <ul class="ri-list ms-rail" style="--done:${(done / ph.items.length).toFixed(3)}">${ph.items.map((i) => itemRow(i, k++)).join('')}</ul>
    </section>`;
  }).join('')}
  <section class="card">
    <form class="ri-add row gap wrap" data-track="${t.id}"><input name="title" class="grow" maxlength="320" placeholder="Thêm một mục vào cuối, ví dụ: Bài 31: Tổng kết (40m)" aria-label="Thêm mục"><button class="btn small">Thêm</button></form>
    <p class="small muted">Mục mới nằm trong phần cuối cùng. Bạn có thể ghi ước lượng ở cuối: (45m), (1h30) hoặc [2] buổi.</p>
  </section>`;
  return { title: `Lộ trình · ${t.name}`, html };
}

export async function addItemFromText(trackId: string, text: string): Promise<void> {
  const r = parseRoadmapInput(text.trim());
  const d = r.items[0];
  if (!d) return;
  const items = itemsOf(trackId);
  const last = items[items.length - 1];
  await commit([{ id: newId(), trackId, order: (last?.order ?? -1) + 1, title: d.title, phase: d.phase ?? last?.phase, estimate: d.estimate, link: d.link, done: false }]);
}

export async function moveRoadmapItem(id: string, dir: -1 | 1): Promise<void> {
  const it = state.roadmap.find((x) => x.id === id);
  if (!it) return;
  const before = itemsOf(it.trackId);
  const list = renumber(before);
  const changed = new Map(moveItem(list, id, dir).map((x) => [x.id, x]));
  if (!changed.size) return;
  const next = list.map((x) => changed.get(x.id) ?? x);
  await commit(next.filter((x, i) => x !== before[i]));
}

export async function removeRoadmapItem(id: string): Promise<void> {
  const it = state.roadmap.find((x) => x.id === id);
  if (!it) return;
  const links = state.sprints.filter((s) => s.milestones.some((m) => m.itemId === id));
  await deleteItems([id]);
  toast(`Đã xoá "${it.title}".`, { label: 'Hoàn tác', run: () => void commit([it], links) });
}

export function openItemEditor(id: string): void {
  const it = state.roadmap.find((x) => x.id === id);
  if (!it) return;
  const phases = [...new Set(itemsOf(it.trackId).map((i) => i.phase).filter((p): p is string => !!p))];
  const dlg = openModal(`<form class="ri-form" method="dialog" novalidate>
    <header class="modal-head"><h2>Sửa mục lộ trình</h2><button type="button" class="link-btn" data-close>Đóng</button></header>
    <label class="field"><span>Tên mục</span><input name="title" required maxlength="300" value="${esc(it.title)}"></label>
    <label class="field"><span>Thuộc phần</span><input name="phase" maxlength="200" list="phase-list" value="${esc(it.phase ?? '')}" placeholder="Để trống nếu không chia phần"><datalist id="phase-list">${phases.map((p) => `<option value="${esc(p)}">`).join('')}</datalist></label>
    <div class="field"><span>Ước lượng (không bắt buộc)</span><div class="row gap wrap"><input type="number" name="est" min="0" step="any" class="num" value="${it.estimate ? it.estimate.value : ''}"><div class="seg-inline">
      <label><input type="radio" name="unit" value="min" ${it.estimate?.unit !== 'session' ? 'checked' : ''}><span>phút</span></label>
      <label><input type="radio" name="unit" value="session" ${it.estimate?.unit === 'session' ? 'checked' : ''}><span>buổi</span></label></div></div></div>
    <label class="field"><span>Link tài liệu (không bắt buộc)</span><input type="url" name="link" value="${esc(it.link ?? '')}" placeholder="https://..."></label>
    <label class="toggle"><input type="checkbox" name="done" ${it.done ? 'checked' : ''}><span>Đã xong</span></label>
    <p class="err small" role="alert"></p>
    <footer class="modal-foot"><button type="button" class="btn ghost" data-close>Huỷ</button><button type="submit" class="btn primary">Lưu</button></footer>
  </form>`);
  const form = dlg.querySelector('form')!;
  const f = (n: string) => form.elements.namedItem(n) as HTMLInputElement;
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const err = form.querySelector('.err')!;
    const title = f('title').value.trim();
    if (!title) { err.textContent = 'Mục cần có tên.'; return; }
    const link = f('link').value.trim();
    if (link && !isHttpUrl(link)) { err.textContent = 'Link cần bắt đầu bằng http:// hoặc https://'; return; }
    const v = Number(f('est').value);
    const unit = (form.querySelector<HTMLInputElement>('[name="unit"]:checked')?.value ?? 'min') as Estimate['unit'];
    const estimate: Estimate | undefined = v > 0 ? (unit === 'min' ? { unit, value: Math.min(1440, Math.round(v)) } : { unit, value: Math.min(100, Math.round(v * 10) / 10) }) : undefined;
    const done = f('done').checked;
    const next: RoadmapItem = { ...it, title, phase: f('phase').value.trim() || undefined, estimate, link: link || undefined, done, doneOn: done ? (it.doneOn ?? today()) : undefined };
    // Keep linked milestones in step with the item's name and status.
    const sprints = state.sprints.filter((s) => s.milestones.some((m) => m.itemId === it.id)).map((s) => ({
      ...s, milestones: s.milestones.map((m) => (m.itemId === it.id ? { ...m, text: title, done, doneOn: done ? (m.doneOn ?? next.doneOn) : undefined } : m)),
    }));
    await commit([next], sprints);
    dlg.close();
    toast('Đã lưu mục lộ trình.');
  });
}

// ---------------------------------------------------------------- Import (paste)

export const SAMPLES: { key: string; label: string; text: string }[] = [
  { key: 'course', label: 'Khoá học chia phần', text: '# Phần 1: Tên phần\n- Bài 1: Tên bài (30m)\n- Bài 2: Tên bài (45m)\n- Bài thực hành [2]\n\n# Phần 2: Tên phần\n- Bài 3: Tên bài (1h)\n- Bài 4: Tên bài https://example.com/bai-4\n' },
  { key: 'book', label: 'Sách theo chương', text: '1. Chương 1: Tên chương\n2. Chương 2: Tên chương\n3. Chương 3: Tên chương\n4. Viết tóm tắt cả cuốn [2]\n' },
  { key: 'csv', label: 'Bảng CSV', text: 'title,phase,minutes,link\nBài 1: Tên bài,Phần 1,30,\nBài 2: Tên bài,Phần 1,45,https://example.com/bai-2\nBài 3: Tên bài,Phần 2,60,\n' },
];

interface ImportOpts { weeks: number; plan: boolean; replace: boolean; sessionMinutes: number; itemsPerSession: number }

function draftsToItems(drafts: DraftItem[], trackId: string, startOrder: number): RoadmapItem[] {
  return drafts.map((d, k) => ({ id: newId(), trackId, order: startOrder + k, title: d.title, phase: d.phase, estimate: d.estimate, link: d.link, done: !!d.done }));
}

/** Everything a confirmed import will write, computed from the current state (also used for the live preview). */
export function importChanges(t: Track, parsed: ParseOutcome, o: ImportOpts, d: Day = today()) {
  const existing = itemsOf(t.id);
  const removeIds = o.replace ? existing.map((i) => i.id) : [];
  const keep = o.replace ? [] : existing;
  const startOrder = keep.length ? keep[keep.length - 1].order + 1 : 0;
  const newItems = draftsToItems(parsed.items, t.id, startOrder);
  const track: Track = { ...t, sessionMinutes: o.sessionMinutes, itemsPerSession: o.itemsPerSession };
  const all = [...keep, ...newItems];
  // Sprints as they will be after unlinking deleted items.
  const rm = new Set(removeIds);
  const sprints = state.sprints.map((s) => (s.milestones.some((m) => m.itemId && rm.has(m.itemId)) ? { ...s, milestones: s.milestones.map((m) => (m.itemId && rm.has(m.itemId) ? { ...m, itemId: undefined } : m)) } : s));
  let layout: PlanLayout | null = null;
  let start = d;
  if (o.plan && all.some((i) => !i.done)) {
    const toPlan = itemsToPlan(all, sprints, t.id, false);
    start = planStart(sprints, t.id, d, false);
    layout = layoutPlan(proposePlan(toPlan, track, o.weeks), all, track, start);
  }
  const changes = layout ? planChanges(layout, track, sprints, d, newId) : null;
  return { track, newItems, removeIds, sprints, layout, changes, start, all };
}

function previewHtml(parsed: ParseOutcome | null, error: string | null): string {
  if (error) return `<p class="err">${esc(error)}</p>`;
  if (!parsed || !parsed.items.length) return '<p class="muted small">Dán nội dung vào ô bên cạnh, phần xem trước sẽ hiện ở đây.</p>';
  const withEst = parsed.items.filter((i) => i.estimate).length;
  const groups: { name: string; items: DraftItem[] }[] = [];
  for (const i of parsed.items) {
    const n = i.phase ?? '';
    if (!groups.length || groups[groups.length - 1].name !== n) groups.push({ name: n, items: [] });
    groups[groups.length - 1].items.push(i);
  }
  let shown = 0;
  const LIMIT = 80;
  return `<p class="pv-sum"><b>${parsed.items.length} mục</b>${parsed.phases.length ? ` trong ${parsed.phases.length} phần` : ''}${withEst ? ` · ${withEst} mục có ước lượng` : ''}${parsed.items.some((i) => i.done) ? ` · ${parsed.items.filter((i) => i.done).length} mục đánh dấu đã xong` : ''}${parsed.skipped ? ` · bỏ qua ${parsed.skipped} dòng` : ''}</p>
    ${parsed.warnings.map((w) => `<p class="small warn-text">${esc(w)}</p>`).join('')}
    <div class="pv-list">${groups.map((g) => {
      if (shown >= LIMIT) return '';
      const rows = g.items.slice(0, Math.max(0, LIMIT - shown));
      shown += rows.length;
      return `<div class="pv-group">${g.name ? `<p class="pv-phase">${esc(g.name)}</p>` : ''}<ol>${rows.map((i) => `<li${i.done ? ' class="done"' : ''}><span>${esc(i.title)}</span>${i.estimate ? `<span class="est">${esc(estText(i.estimate))}</span>` : ''}${i.link ? '<span class="small muted">link</span>' : ''}</li>`).join('')}</ol></div>`;
    }).join('')}${parsed.items.length > LIMIT ? `<p class="small muted">và ${parsed.items.length - LIMIT} mục nữa.</p>` : ''}</div>`;
}

function planSummary(t: Track, x: ReturnType<typeof importChanges> | null, plan: boolean): string {
  if (!x || !x.newItems.length) return '';
  if (!plan) return '<p class="small muted">Chỉ tạo lộ trình. Bạn có thể chia thành các sprint sau.</p>';
  if (!x.layout || !x.layout.sprints.length) return '<p class="small muted">Không còn mục nào cần lên kế hoạch.</p>';
  const L = x.layout;
  const first = L.sprints[0];
  const active = activeSprint(x.sprints, t.id);
  const keepNote = active ? `<p class="small muted">Sprint "${esc(active.title)}" đang chạy được giữ nguyên; các sprint mới bắt đầu từ ${fmtDate(x.start)}.</p>` : '';
  return `<div class="pv-plan">
    <p><b>${L.sprints.length} sprint</b>, sprint đầu ${fmtDate(first.start)} - ${fmtDate(first.end)} với ${first.items.length} mục${active ? '' : ' (bắt đầu ngay)'}.</p>
    <p class="small muted">Dự kiến xong ${L.finish ? fmtDate(L.finish) : ''} nếu học ${L.capacityPerWeek} ngày mỗi tuần, mỗi ngày một buổi. Tổng khối lượng ${sessionsText(L.totalSessions)}.</p>
    ${keepNote}${L.warnings.map((w) => `<p class="small warn-text">${esc(w)}</p>`).join('')}
  </div>`;
}

export function importView(id: string): View {
  const t = getTrack(id);
  if (!t) return { title: 'Không tìm thấy', html: '<p>Không tìm thấy topic này.</p>' };
  const existing = itemsOf(t.id);
  const p = costPrefs(t);
  const hasLinkedPlan = state.sprints.some((s) => s.trackId === t.id && (s.status === 'planned' || s.status === 'active') && s.milestones.some((m) => m.itemId));
  const html = `<section class="editor rm-import">
    <a href="#/t/${t.id}${existing.length ? '/roadmap' : ''}" class="back">${esc(existing.length ? 'Lộ trình' : t.name)}</a>
    <h1>${existing.length ? 'Dán thêm vào lộ trình' : 'Dán lộ trình'}</h1>
    <p class="muted">Dán mục lục khoá học, danh sách bài, mục lục sách hoặc ghi chú Markdown. Mỗi dòng là một mục. Xem trước bên dưới, bấm một nút là xong.</p>
    <form class="rm-import-form" novalidate>
      <div class="imp-grid">
        <div class="card imp-src">
          <div class="row between wrap"><span class="lbl">Nội dung</span><label class="link-btn file-btn">Mở file .txt, .md, .csv, .json<input type="file" name="file" accept=".txt,.md,.markdown,.csv,.json,text/plain,text/markdown,text/csv,application/json" hidden></label></div>
          <textarea name="src" rows="14" spellcheck="false" placeholder="# Phần 1: Nhập môn&#10;- Bài 1: Giới thiệu (20m)&#10;- Bài 2: Cài đặt môi trường (45m)&#10;# Phần 2: ...&#10;- Bài 3: ..."></textarea>
          <div class="row gap wrap samples"><span class="small muted">Mẫu định dạng:</span>${SAMPLES.map((s) => `<button type="button" class="chip" data-sample="${s.key}">${esc(s.label)}</button>`).join('')}</div>
          <details class="assume"><summary>Cách viết</summary><ul class="small muted">
            <li><code># Tên phần</code> bắt đầu một phần. Khi có gạch đầu dòng, dòng không có gạch ở lề trái cũng được coi là tên phần.</li>
            <li><code>- mục</code>, <code>* mục</code>, <code>1. mục</code> đều được. Mục có các mục con thụt vào trong sẽ thành nhóm, mục con mang tên nhóm.</li>
            <li>Ước lượng ở cuối dòng: <code>(45m)</code>, <code>(1h30)</code>, <code>(2 giờ)</code> hoặc <code>[2]</code> buổi. Không ghi cũng được.</li>
            <li><code>- [x] mục</code> là mục đã xong. Link trong dòng được giữ lại.</li>
            <li>JSON: danh sách <code>{"title", "phase", "minutes" hoặc "sessions", "link", "done"}</code>. CSV: dòng đầu là tên cột, cần cột <code>title</code> hoặc <code>tên</code>.</li>
          </ul></details>
        </div>
        <div class="card imp-preview" aria-live="polite"><span class="lbl">Xem trước</span><div class="pv">${previewHtml(null, null)}</div></div>
      </div>
      <div class="card imp-opts">
        ${existing.length ? `<fieldset class="choice"><legend>Lộ trình hiện có ${existing.length} mục</legend>
          <label class="toggle"><input type="radio" name="mode" value="append" checked><span><b>Thêm vào cuối.</b> Giữ nguyên các mục hiện có.</span></label>
          <label class="toggle"><input type="radio" name="mode" value="replace"><span><b>Thay toàn bộ lộ trình.</b> Các mục cũ, kể cả mục đã xong, bị xoá; các milestone đã liên kết vẫn được giữ.</span></label>
        </fieldset>` : ''}
        <label class="toggle"><input type="checkbox" name="plan" checked><span><b>Chia luôn thành các sprint.</b> ${hasLinkedPlan ? 'Các sprint đã lên kế hoạch trước đó sẽ được xếp lại; sprint đang chạy giữ nguyên.' : 'Sprint đầu bắt đầu ngay, các sprint sau nối tiếp.'}</span></label>
        <div class="row gap wrap plan-opts"><span class="small muted">Mỗi sprint</span><div class="seg-inline">${[2, 3, 4].map((w) => `<label><input type="radio" name="weeks" value="${w}" ${w === 3 ? 'checked' : ''}><span>${w} tuần</span></label>`).join('')}</div></div>
        <details class="assume"><summary>Ước lượng thời gian (mặc định ${p.sessionMinutes} phút mỗi buổi, ${nf.format(p.itemsPerSession)} mục mỗi buổi)</summary>
          <div class="grid2">
            <label class="field"><span>Một buổi học dài (phút)</span><input type="number" name="sessionMinutes" min="5" max="480" value="${p.sessionMinutes}" class="num"></label>
            <label class="field"><span>Mục không có ước lượng: số mục mỗi buổi</span><input type="number" name="itemsPerSession" min="0.1" max="20" step="0.5" value="${p.itemsPerSession}" class="num"></label>
          </div>
          <p class="small muted">Mục tiêu hiện tại: ${t.weeklyTarget} ngày học mỗi tuần. Đổi ở trang chỉnh sửa topic.</p>
        </details>
        <div class="plan-sum"></div>
        <label class="toggle confirm-replace" hidden><input type="checkbox" name="sure"><span>Tôi hiểu các mục cũ sẽ bị xoá. Nên tải một bản sao lưu trước.</span></label>
        <p class="err" role="alert"></p>
        <div class="row gap between wrap"><a class="btn ghost" href="#/t/${t.id}">Huỷ</a><button class="btn primary" type="submit" disabled>Tạo lộ trình</button></div>
      </div>
    </form>
  </section>`;
  return {
    title: 'Dán lộ trình',
    html,
    mount(root) {
      const form = root.querySelector<HTMLFormElement>('.rm-import-form')!;
      const ta = form.elements.namedItem('src') as HTMLTextAreaElement;
      const btn = form.querySelector<HTMLButtonElement>('button[type="submit"]')!;
      const err = form.querySelector('.err')!;
      let parsed: ParseOutcome | null = null;
      let timer = 0;
      const opts = (): ImportOpts => {
        const num = (n: string, lo: number, hi: number, dflt: number) => { const v = Number((form.elements.namedItem(n) as HTMLInputElement).value); return Number.isFinite(v) && v > 0 ? Math.max(lo, Math.min(hi, v)) : dflt; };
        return {
          weeks: Number(form.querySelector<HTMLInputElement>('[name="weeks"]:checked')?.value ?? 3),
          plan: (form.elements.namedItem('plan') as HTMLInputElement).checked,
          replace: form.querySelector<HTMLInputElement>('[name="mode"]:checked')?.value === 'replace',
          sessionMinutes: Math.round(num('sessionMinutes', 5, 480, p.sessionMinutes)),
          itemsPerSession: Math.round(num('itemsPerSession', 0.1, 20, p.itemsPerSession) * 10) / 10,
        };
      };
      const refresh = () => {
        let error: string | null = null;
        try { parsed = parseRoadmapInput(ta.value); } catch (x) { parsed = null; error = (x as Error).message; }
        root.querySelector('.pv')!.innerHTML = previewHtml(parsed, error);
        const o = opts();
        const x = parsed && parsed.items.length ? importChanges(t, parsed, o) : null;
        root.querySelector('.plan-sum')!.innerHTML = planSummary(t, x, o.plan);
        form.querySelector<HTMLElement>('.plan-opts')!.hidden = !o.plan;
        form.querySelector<HTMLElement>('.confirm-replace')!.hidden = !o.replace;
        const n = parsed?.items.length ?? 0;
        btn.disabled = !n;
        const sprints = x?.layout?.sprints.length ?? 0;
        btn.textContent = !n ? 'Tạo lộ trình' : `${existing.length && !o.replace ? `Thêm ${n} mục` : `Tạo lộ trình ${n} mục`}${o.plan && sprints ? ` và ${sprints} sprint` : ''}`;
        err.textContent = '';
      };
      const later = () => { clearTimeout(timer); timer = window.setTimeout(refresh, 120); };
      ta.addEventListener('input', later);
      form.addEventListener('change', async (e) => {
        const el = e.target as HTMLInputElement;
        if (el.name === 'file' && el.files?.[0]) { ta.value = await el.files[0].text(); el.value = ''; }
        refresh();
      });
      form.addEventListener('input', (e) => { if ((e.target as HTMLElement) !== ta) later(); });
      root.querySelectorAll<HTMLElement>('[data-sample]').forEach((b) => b.addEventListener('click', () => {
        const s = SAMPLES.find((x) => x.key === b.dataset.sample)!;
        if (ta.value.trim() && !confirm('Thay nội dung đang có bằng mẫu định dạng?')) return;
        ta.value = s.text; refresh(); ta.focus();
      }));
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        refresh();
        if (!parsed || !parsed.items.length) return;
        const o = opts();
        if (o.replace && !(form.elements.namedItem('sure') as HTMLInputElement).checked) { err.textContent = 'Hãy đánh dấu xác nhận trước khi thay toàn bộ lộ trình.'; return; }
        const x = importChanges(t, parsed, o);
        btn.disabled = true;
        if (x.track.sessionMinutes !== t.sessionMinutes || x.track.itemsPerSession !== t.itemsPerSession) await saveTrack(x.track);
        const changedSprints = x.sprints.filter((s, i) => s !== state.sprints[i]);
        const sprints = [...changedSprints.filter((s) => !x.changes?.remove.includes(s.id)), ...(x.changes?.create ?? [])];
        await commit(x.newItems, sprints, { deleteItems: x.removeIds, deleteSprints: x.changes?.remove ?? [] });
        const ns = x.changes?.create.length ?? 0;
        toast(ns ? `Đã tạo lộ trình ${x.newItems.length} mục và ${ns} sprint.` : `Đã thêm ${x.newItems.length} mục vào lộ trình.`);
        location.hash = `#/t/${t.id}/roadmap`;
      });
      refresh();
      ta.focus();
    },
  };
}

// ---------------------------------------------------------------- Planner

/**
 * Free-form sprint planner. Opens on the current open sprints (running + planned) when there are any, otherwise
 * on a preset split. Any sprint can hold any items in any order; presets only give a starting point. Nothing is
 * written until "Lưu kế hoạch"; a change to the running sprint asks for confirmation first.
 */
export function planView(id: string): View {
  const t = getTrack(id);
  if (!t) return { title: 'Không tìm thấy', html: '<p>Không tìm thấy topic này.</p>' };
  const items = itemsOf(t.id);
  if (!items.length) return importView(id);
  const d = today();
  const p0 = costPrefs(t);
  const phased = hasPhases(items);
  const existing = state.sprints.some((s) => s.trackId === t.id && (s.status === 'active' || s.status === 'planned'));
  const html = `<section class="editor rm-plan">
    <a href="#/t/${t.id}/roadmap" class="back">Lộ trình</a>
    <h1>Kế hoạch sprint</h1>
    <p class="muted">Sprint nào cũng chứa được bất kỳ mục nào, theo thứ tự bạn muốn. Chọn một cách chia nhanh để có bản nháp, rồi thêm, xoá, đổi tên, đổi ngày, tách, gộp hoặc chuyển mục giữa các sprint. Chưa có gì thay đổi cho đến khi bạn bấm Lưu.</p>
    <form class="plan-form card" novalidate>
      <div class="grid2">
        <label class="field"><span>Sprint đầu bắt đầu từ</span><input type="date" name="start"></label>
        <label class="field"><span>Một buổi học dài (phút)</span><input type="number" name="sessionMinutes" min="5" max="480" value="${p0.sessionMinutes}" class="num"></label>
        <label class="field"><span>Mục không có ước lượng: số mục mỗi buổi</span><input type="number" name="itemsPerSession" min="0.1" max="20" step="0.5" value="${p0.itemsPerSession}" class="num"></label>
      </div>
      <div class="field"><span>Chia nhanh: tạo bản nháp mới cho mọi mục chưa xong (sprint đang chạy nhận phần đầu tiên và giữ ngày bắt đầu). Sau đó bạn vẫn sửa tự do</span>
        <div class="row gap wrap preset">${[2, 3, 4].map((w) => `<button type="button" class="btn small" data-preset="w${w}">Mỗi sprint ${w} tuần</button>`).join('')}<button type="button" class="btn small" data-preset="phase" ${phased ? '' : 'disabled title="Lộ trình chưa chia phần"'}>Mỗi phần một sprint</button></div>
      </div>
    </form>
    <div class="plan-out"></div>
  </section>`;
  return {
    title: 'Kế hoạch sprint',
    html,
    mount(root) {
      const form = root.querySelector<HTMLFormElement>('.plan-form')!;
      const out = root.querySelector<HTMLElement>('.plan-out')!;
      const f = (n: string) => form.elements.namedItem(n) as HTMLInputElement;
      let drafts: EditDraft[] = [];
      let dirty = false;
      const sel = new Set<string>();
      const open = new Set<string>();
      const read = () => {
        const sm = Math.round(Math.max(5, Math.min(480, Number(f('sessionMinutes').value) || p0.sessionMinutes)));
        const ip = Math.round(Math.max(0.1, Math.min(20, Number(f('itemsPerSession').value) || p0.itemsPerSession)) * 10) / 10;
        const track: Track = { ...t, sessionMinutes: sm, itemsPerSession: ip };
        return { track, start: f('start').value || d };
      };
      const remaining = () => itemsOf(t.id).filter((i) => !i.done);
      const activeDraft = () => drafts.find((x) => x.sprintId && state.sprints.find((s) => s.id === x.sprintId)?.status === 'active');
      const applyPreset = (kind: string) => {
        const r = read();
        const keep = activeDraft();
        const fresh = withKeys(kind === 'phase' && phased ? proposeByPhase(remaining(), r.track) : proposePlan(remaining(), r.track, Number(kind.slice(1)) || 3));
        // The running sprint keeps its identity and start day but takes the first part of the new split.
        if (keep && fresh.length) fresh[0] = { ...fresh[0], key: keep.key, sprintId: keep.sprintId, start: keep.start, title: keep.title };
        drafts = keep && !fresh.length ? [{ ...keep, itemIds: [] }] : fresh;
        if (!keep) f('start').value = f('start').value || d;
        sel.clear();
        dirty = true;
        paint();
      };
      const load = () => {
        drafts = draftsFromSprints(state.sprints, itemsOf(t.id), t.id);
        f('start').value = drafts[0]?.start ?? planStart(state.sprints, t.id, d, false);
        dirty = false;
        sel.clear();
        if (!drafts.length) { applyPreset(phased ? 'phase' : 'w3'); dirty = false; paint(); return; }
        paint();
      };
      const itemList = (ids: string[], i: number | null) => {
        const byId = new Map(itemsOf(t.id).map((x) => [x.id, x]));
        const list = ids.map((x) => byId.get(x)).filter((x): x is RoadmapItem => !!x);
        const groups: { name: string; items: RoadmapItem[] }[] = [];
        for (const it of list) {
          const n = it.phase ?? '';
          if (!groups.length || groups[groups.length - 1].name !== n) groups.push({ name: n, items: [] });
          groups[groups.length - 1].items.push(it);
        }
        const showGroups = groups.some((g) => g.name);
        let k = 0;
        return `<ul class="pi-list">${groups.map((g, gi) => `${showGroups ? `<li class="pi-group"><label><input type="checkbox" data-selgroup="${i ?? -1}:${gi}" ${g.items.every((x) => sel.has(x.id)) ? 'checked' : ''}><span>${esc(g.name || 'Chưa có phần')}</span></label><span class="small muted mono">${g.items.length} mục</span></li>` : ''}${g.items.map((it) => {
          const pos = k++;
          return `<li class="pi${sel.has(it.id) ? ' on' : ''}"><label><input type="checkbox" data-sel="${it.id}" ${sel.has(it.id) ? 'checked' : ''}><span>${esc(it.title)}</span>${it.estimate ? ` <span class="est">${esc(estText(it.estimate))}</span>` : ''}</label>${i === null ? '' : `<span class="pi-acts"><button type="button" class="icon-btn" data-up="${i}" data-id="${it.id}" aria-label="Lên trên trong sprint" ${pos === 0 ? 'disabled' : ''}>↑</button><button type="button" class="icon-btn" data-down="${i}" data-id="${it.id}" aria-label="Xuống dưới trong sprint" ${pos === list.length - 1 ? 'disabled' : ''}>↓</button></span>`}</li>`;
        }).join('')}`).join('')}</ul>`;
      };
      const groupIds = (i: number, gi: number): string[] => {
        const ids = i < 0 ? unplacedIds(drafts, remaining()) : drafts[i].itemIds;
        const byId = new Map(itemsOf(t.id).map((x) => [x.id, x]));
        const groups: string[][] = [];
        let last: string | null = null;
        for (const x of ids) {
          const n = byId.get(x)?.phase ?? '';
          if (last === null || n !== last) groups.push([]);
          groups[groups.length - 1].push(x);
          last = n;
        }
        return groups[gi] ?? [];
      };
      const paint = () => {
        const y = window.scrollY;
        const r = read();
        const L = layoutPlan(drafts, itemsOf(t.id), r.track, r.start);
        const pool = unplacedIds(drafts, remaining());
        const ch = saveChanges(L, r.track, state.sprints, itemsOf(t.id), d, () => 'x');
        const statusOf = (sid?: string) => state.sprints.find((s) => s.id === sid)?.status;
        const n = sel.size;
        const opts = L.sprints.map((s, i) => `<option value="${i}">Sprint ${i + 1}: ${esc(s.title.slice(0, 60))}</option>`).join('');
        out.innerHTML = `<div class="sel-bar card" role="region" aria-label="Mục đã chọn">
            <span class="small"><b>${n}</b> mục đã chọn</span>
            <label class="small">Chuyển tới <select data-target>${opts}<option value="new">Sprint mới ở cuối</option></select></label>
            <button type="button" class="btn small primary" data-move ${n ? '' : 'disabled'}>Chuyển</button>
            <button type="button" class="btn small" data-unplace ${n ? '' : 'disabled'}>Bỏ khỏi sprint</button>
            <button type="button" class="btn small ghost" data-clear ${n ? '' : 'disabled'}>Bỏ chọn</button>
          </div>
          ${L.sprints.length ? '' : '<section class="card"><p class="muted">Chưa có sprint nào. Chọn một cách chia nhanh ở trên hoặc thêm sprint trống.</p></section>'}
          <ol class="plan-sprints">${L.sprints.map((s, i) => {
          const dr = drafts[i];
          const st = statusOf(dr.sprintId);
          const isOpen = open.has(dr.key);
          const days = dr.days && dr.days % 7 ? dr.days : 0;
          const hereSel = dr.itemIds.filter((x) => sel.has(x)).length;
          return `<li class="card ps${s.over ? ' over' : ''}${st === 'active' ? ' first' : ''}" data-key="${dr.key}">
          <div class="ps-head"><span class="ps-no mono">Sprint ${i + 1}</span><span class="badge${st === 'active' ? ' on' : ''}">${st === 'active' ? 'đang chạy' : st === 'planned' ? 'đã lên lịch' : 'mới'}</span>${s.autoTitle ? '<span class="small muted">tên tự đặt theo nội dung</span>' : ''}</div>
          <input class="ps-title" data-i="${i}" value="${esc(s.title)}" maxlength="200" aria-label="Tên sprint ${i + 1}">
          <div class="ps-dates">
            <label class="small">Bắt đầu <input type="date" data-start="${i}" value="${s.start}"></label>
            <label class="small">Độ dài <select data-weeks="${i}">${days ? `<option value="d" selected>${days} ngày</option>` : ''}${Array.from({ length: EDIT_MAX_WEEKS }, (_, k) => k + 1).map((w) => `<option value="${w}" ${!days && w === s.weeks ? 'selected' : ''}>${w} tuần</option>`).join('')}</select></label>
            <span class="small muted mono">${fmtDate(s.start)} - ${fmtDate(s.end)}</span>
            <span class="small ${s.over ? 'warn-text' : 'muted'}">${sessionsText(s.sessions)} / ${nf.format(s.capacity)} buổi</span>
          </div>
          ${s.overlap ? '<p class="small warn-text">Sprint này bắt đầu trước khi sprint liền trước kết thúc.</p>' : ''}
          <div class="load"><i style="width:${Math.min(100, (s.sessions / s.capacity) * 100).toFixed(1)}%"></i></div>
          <details data-key="${dr.key}" ${isOpen ? 'open' : ''}><summary>${s.items.length ? `${s.items.length} mục: ${esc(s.items[0].title)}${s.items.length > 1 ? ` … ${esc(s.items[s.items.length - 1].title)}` : ''}` : 'Chưa có mục nào'}</summary>
            ${s.items.length ? `<div class="row gap wrap pi-tools"><button type="button" class="btn xs" data-selall="${i}">Chọn tất cả</button>${hereSel ? `<span class="small muted">${hereSel} mục trong sprint này đang được chọn</span>` : ''}</div>${itemList(dr.itemIds, i)}` : '<p class="small muted">Chọn mục ở sprint khác hoặc ở danh sách chưa xếp, rồi bấm "Chuyển vào đây".</p>'}
          </details>
          <div class="ps-acts">
            <button type="button" class="btn small primary" data-here="${i}" ${n && hereSel < n ? '' : 'disabled'}>Chuyển ${n || ''} mục đã chọn vào đây</button>
            <button type="button" class="btn small" data-sup="${i}" ${i === 0 ? 'disabled' : ''} aria-label="Đưa sprint lên trước">↑ Lên</button>
            <button type="button" class="btn small" data-sdown="${i}" ${i === L.sprints.length - 1 ? 'disabled' : ''} aria-label="Đưa sprint xuống sau">↓ Xuống</button>
            <button type="button" class="btn small" data-split="${i}" ${s.items.length > 1 ? '' : 'disabled'} title="Tách tại mục đầu tiên đang chọn trong sprint này; không chọn mục nào thì chia đôi">Tách sprint</button>
            <button type="button" class="btn small" data-merge="${i}" ${i < L.sprints.length - 1 ? '' : 'disabled'}>Gộp với sprint sau</button>
            <button type="button" class="btn small danger" data-del="${i}">Xoá sprint</button>
          </div>
        </li>`;
        }).join('')}</ol>
          <section class="card pool${pool.length ? '' : ' empty'}">
            <div class="row between wrap"><h2>Chưa xếp vào sprint nào</h2><span class="small muted mono">${pool.length} mục</span></div>
            ${pool.length ? `<details data-key="pool" ${open.has('pool') ? 'open' : ''}><summary>Xem danh sách</summary><div class="row gap wrap pi-tools"><button type="button" class="btn xs" data-selall="-1">Chọn tất cả</button></div>${itemList(pool, null)}</details>` : '<p class="small muted">Mọi mục chưa xong đều đã nằm trong một sprint.</p>'}
          </section>
          <div class="row gap wrap"><button type="button" class="btn small" data-add>+ Thêm sprint trống</button><button type="button" class="btn small" data-chain ${L.sprints.length > 1 ? '' : 'disabled'}>Xếp ngày nối tiếp</button></div>
          <section class="card plan-foot">
            <p><b>${L.sprints.length} sprint</b>${L.finish ? `, dự kiến xong <b>${fmtDate(L.finish)}</b>` : ''} nếu học ${L.capacityPerWeek} ngày mỗi tuần (${sessionsText(L.totalSessions)}).</p>
            ${L.warnings.map((w) => `<p class="small warn-text">${esc(w)}</p>`).join('')}
            ${ch.active ? `<p class="small warn-text">${ch.active.closed ? `Sprint đang chạy "${esc(ch.active.title)}" sẽ được khép lại.` : `Sprint đang chạy "${esc(ch.active.title)}" sẽ thay đổi${ch.active.added ? `, thêm ${ch.active.added} mục` : ''}${ch.active.removed ? `, bớt ${ch.active.removed} mục` : ''}${ch.active.datesChanged ? ', đổi ngày' : ''}.`} App sẽ hỏi lại trước khi lưu.</p>` : ''}
            ${ch.remove.length ? `<p class="small muted">${ch.remove.length} sprint cũ sẽ bị xoá (chưa có mục nào hoàn thành).</p>` : ''}
            <div class="row gap between wrap"><button type="button" class="btn ghost" data-reload ${dirty ? '' : 'disabled'}>Bỏ các thay đổi</button><button type="button" class="btn primary" data-save ${dirty || !existing ? '' : 'disabled'}>${existing ? 'Lưu kế hoạch' : `Tạo ${L.sprints.length} sprint`}</button></div>
          </section>`;
        window.scrollTo(0, y);
      };
      const set = (next: EditDraft[]) => { if (next !== drafts) { drafts = next; dirty = true; } paint(); };
      const indexOf = (el: HTMLElement, attr: string) => Number(el.closest<HTMLElement>(`[data-${attr}]`)!.dataset[attr]);
      form.addEventListener('change', (e) => {
        const el = e.target as HTMLInputElement;
        if (el.name === 'start' && drafts[0]) { drafts = setStart(drafts, 0, el.value); dirty = true; }
        paint();
      });
      form.addEventListener('click', (e) => {
        const b = (e.target as HTMLElement).closest<HTMLElement>('[data-preset]');
        if (!b) return;
        if ((dirty || existing) && !confirm('Chia lại sẽ thay bản nháp hiện tại. Sprint đang chạy nhận phần đầu tiên của cách chia mới; chưa có gì được lưu cho đến khi bạn bấm Lưu. Tiếp tục?')) return;
        applyPreset(b.dataset.preset!);
      });
      out.addEventListener('toggle', (e) => {
        const el = e.target as HTMLDetailsElement;
        if (el.tagName !== 'DETAILS' || !el.dataset.key) return;
        if (el.open) open.add(el.dataset.key); else open.delete(el.dataset.key);
      }, true);
      out.addEventListener('input', (e) => {
        const el = e.target as HTMLInputElement;
        if (el.classList.contains('ps-title')) { drafts = renameSprint(drafts, Number(el.dataset.i), el.value); dirty = true; out.querySelector<HTMLButtonElement>('[data-save]')!.disabled = false; out.querySelector<HTMLButtonElement>('[data-reload]')!.disabled = false; }
      });
      out.addEventListener('change', (e) => {
        const el = e.target as HTMLInputElement;
        if (el.dataset.sel) { if (el.checked) sel.add(el.dataset.sel); else sel.delete(el.dataset.sel); paint(); return; }
        if (el.dataset.selgroup) {
          const [i, gi] = el.dataset.selgroup.split(':').map(Number);
          for (const x of groupIds(i, gi)) if (el.checked) sel.add(x); else sel.delete(x);
          paint(); return;
        }
        if (el.dataset.weeks !== undefined && el.value !== 'd') { set(setWeeks(drafts, Number(el.dataset.weeks), Number(el.value))); return; }
        if (el.dataset.start !== undefined) { set(setStart(drafts, Number(el.dataset.start), el.value)); return; }
        if (el.classList.contains('ps-title')) paint();
      });
      const selected = () => {
        const order = [...drafts.flatMap((x) => x.itemIds), ...unplacedIds(drafts, remaining())];
        return order.filter((x) => sel.has(x));
      };
      out.addEventListener('click', async (e) => {
        const el = e.target as HTMLElement;
        const has = (a: string) => !!el.closest(`[data-${a}]`);
        if (has('selall')) {
          const i = indexOf(el, 'selall');
          const ids = i < 0 ? unplacedIds(drafts, remaining()) : drafts[i].itemIds;
          const all = ids.every((x) => sel.has(x));
          for (const x of ids) if (all) sel.delete(x); else sel.add(x);
          paint(); return;
        }
        if (has('clear')) { sel.clear(); paint(); return; }
        if (has('move')) {
          const v = out.querySelector<HTMLSelectElement>('[data-target]')!.value;
          const to = v === 'new' ? drafts.length : Number(v);
          const ids = selected();
          sel.clear();
          set(moveItems(drafts, ids, to));
          if (v === 'new') open.add(drafts[drafts.length - 1].key);
          return;
        }
        if (has('unplace')) { const ids = selected(); sel.clear(); open.add('pool'); set(moveItems(drafts, ids, -1)); return; }
        if (has('here')) { const i = indexOf(el, 'here'); const ids = selected(); sel.clear(); open.add(drafts[i].key); set(moveItems(drafts, ids, i)); return; }
        if (has('up')) { set(moveWithin(drafts, indexOf(el, 'up'), el.closest<HTMLElement>('[data-id]')!.dataset.id!, -1)); return; }
        if (has('down')) { set(moveWithin(drafts, indexOf(el, 'down'), el.closest<HTMLElement>('[data-id]')!.dataset.id!, 1)); return; }
        if (has('sup')) { set(moveSprint(drafts, indexOf(el, 'sup'), -1)); return; }
        if (has('sdown')) { set(moveSprint(drafts, indexOf(el, 'sdown'), 1)); return; }
        if (has('split')) {
          const i = indexOf(el, 'split');
          const ids = drafts[i].itemIds;
          const k = ids.findIndex((x) => sel.has(x));
          set(splitSprint(drafts, i, k > 0 ? k : Math.ceil(ids.length / 2)));
          return;
        }
        if (has('merge')) { set(mergeWithNext(drafts, indexOf(el, 'merge'))); return; }
        if (has('del')) {
          const i = indexOf(el, 'del');
          const st = state.sprints.find((s) => s.id === drafts[i].sprintId)?.status;
          if (drafts[i].itemIds.length && !confirm(`Xoá sprint này? ${drafts[i].itemIds.length} mục của nó sẽ về danh sách "Chưa xếp vào sprint nào", không bị xoá khỏi lộ trình.${st === 'active' ? ' Đây là sprint đang chạy: khi lưu, sprint sẽ được khép lại (giữ các milestone đã xong trong lịch sử).' : ''}`)) return;
          if (drafts[i].itemIds.length) open.add('pool');
          set(removeSprint(drafts, i));
          return;
        }
        if (has('add')) { const next = addSprint(drafts); open.add(next[next.length - 1].key); set(next); return; }
        if (has('chain')) { set(chainDates(drafts, true)); return; }
        if (has('reload')) { if (confirm('Bỏ mọi thay đổi chưa lưu?')) load(); return; }
        if (has('save')) {
          const r = read();
          const L = layoutPlan(drafts, itemsOf(t.id), r.track, r.start);
          const ch = saveChanges(L, r.track, state.sprints, itemsOf(t.id), d, newId);
          if (ch.active) {
            const a = ch.active;
            const msg = a.closed
              ? `Khép sprint đang chạy "${a.title}"? Các milestone đã xong vẫn được giữ trong lịch sử.`
              : `Sửa sprint đang chạy "${a.title}"${a.added ? `: thêm ${a.added} mục` : ''}${a.removed ? `${a.added ? ',' : ':'} bớt ${a.removed} mục` : ''}${a.datesChanged ? ', đổi ngày' : ''}. Tiến độ các mục đã xong không đổi. Tiếp tục?`;
            if (!confirm(msg)) return;
          }
          if (r.track.sessionMinutes !== t.sessionMinutes || r.track.itemsPerSession !== t.itemsPerSession) await saveTrack(r.track);
          await commit([], ch.save, { deleteSprints: ch.remove });
          toast(existing ? 'Đã lưu kế hoạch sprint.' : `Đã tạo ${L.sprints.length} sprint.`);
          location.hash = `#/t/${t.id}`;
        }
      });
      load();
    },
  };
}

/** Starts the next planned sprint. With shift, it and every later planned sprint move by the same number of days. */
export async function startPlanned(id: string, shift: boolean): Promise<void> {
  const s = state.sprints.find((x) => x.id === id);
  if (!s || s.status !== 'planned') return;
  const d = today();
  const delta = shift ? diffDays(d, s.start) : 0;
  const move = (x: Sprint): Sprint => (delta ? { ...x, start: addDays(x.start, delta), end: addDays(x.end, delta) } : x);
  const later = state.sprints.filter((x) => x.trackId === s.trackId && x.status === 'planned' && x.id !== s.id && x.start >= s.start).map(move);
  await commit([], [{ ...move(s), status: 'active' }, ...later]);
  toast(delta ? `Đã bắt đầu sprint "${s.title}" từ hôm nay; các sprint sau dời ${Math.abs(delta)} ngày.` : `Đã bắt đầu sprint "${s.title}".`);
}

