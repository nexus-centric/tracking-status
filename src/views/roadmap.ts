// Roadmap: overview card on the track page, the full roadmap page, paste-to-import and the sprint planner.
import { addDays, diffDays, fmtDay, today } from '../core/dates.js';
import { fmtMinutes } from '../core/format.js';
import { EDIT_MAX_WEEKS, itemsToPlan, layoutPlan, planChanges, planStart, proposePlan, setWeeks, type PlanLayout } from '../core/plan.js';
import type Sortable from 'sortablejs';
import { addSprint, chainDates, draftsFromSprints, dropItems, hasPhases, mergeWithNext, moveItems, moveSprint, moveWithin, proposeByPhase, removeSprint, renameSprint, saveChanges, setStart, splitSprint, unplacedIds, withKeys, type EditDraft } from '../core/plan-edit.js';
import { costPrefs, itemSessions, moveItem, plannedItemIds, projectRoadmap, renumber, roadmapProgress, type CostPrefs, type Projection, type RoadmapProgress } from '../core/roadmap.js';
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
  const li = (s: Sprint) => `<li><b>${esc(s.title)}</b><span class="small muted mono">${fmtDate(s.start)} - ${fmtDate(s.end)} · ${s.milestones.length} mục</span></li>`;
  const startBtns = hasActive ? '' : next.start === d
    ? `<button class="btn small primary" data-act="start-planned" data-id="${next.id}" data-shift="0">Bắt đầu sprint này</button>`
    : `<button class="btn small primary" data-act="start-planned" data-id="${next.id}" data-shift="1">Bắt đầu từ hôm nay</button><button class="btn small ghost" data-act="start-planned" data-id="${next.id}" data-shift="0">Giữ ngày ${fmtDate(next.start)}</button>`;
  return `<section class="card planned-card">
    <div class="row between wrap"><h2>Các sprint tiếp theo</h2><a class="btn small" href="#/t/${t.id}/plan">Sửa kế hoạch</a></div>
    ${hasActive ? '' : `<p class="small muted">Chưa có sprint nào đang chạy. ${next.start === d ? 'Sprint kế tiếp bắt đầu hôm nay.' : `Sprint kế tiếp dự kiến bắt đầu ${fmtDate(next.start)}. "Bắt đầu từ hôm nay" sẽ dời sprint này và các sprint sau theo cùng số ngày.`}</p><div class="row gap wrap">${startBtns}</div>`}
    <ol class="plan-list">${planned.slice(0, 4).map(li).join('')}</ol>
    ${planned.length > 4 ? `<details class="more-sprints"><summary class="btn xs ghost">Xem thêm ${planned.length - 4} sprint</summary><ol class="plan-list" start="5">${planned.slice(4).map(li).join('')}</ol></details>` : ''}
  </section>`;
}

// ---------------------------------------------------------------- Roadmap page

/** Per-topic UI state of the roadmap page, kept across re-renders (marking a lesson done re-renders the page). */
interface RoadmapUi { open: Set<string> | null; live?: string; q: string; status: 'all' | 'todo' | 'done'; sprint: string }
const rmUi = new Map<string, RoadmapUi>();
const uiOf = (id: string): RoadmapUi => rmUi.get(id) ?? rmUi.set(id, { open: null, q: '', status: 'all', sprint: '' }).get(id)!;

const ICON = {
  up: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 3.5 3.5 8h3v4.5h3V8h3z" fill="currentColor"/></svg>',
  down: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 12.5 12.5 8h-3V3.5h-3V8h-3z" fill="currentColor"/></svg>',
  edit: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M11.3 2.3a1.2 1.2 0 0 1 1.7 0l.7.7a1.2 1.2 0 0 1 0 1.7L6 12.4l-3 .6.6-3z" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/></svg>',
  del: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 4.5h10M6.5 4.5V3h3v1.5M4.5 4.5l.6 8.5h5.8l.6-8.5" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/></svg>',
  link: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M9 3h4v4M13 3 7.5 8.5M11 9.5V13H3V5h3.5" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>',
};

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
  const open = state.sprints.filter((s) => s.trackId === t.id && (s.status === 'active' || s.status === 'planned')).sort((a, b) => (a.start < b.start ? -1 : 1));
  for (const s of open) for (const m of s.milestones) if (m.itemId) where.set(m.itemId, s);
  const phases: { key: string; name: string; items: RoadmapItem[] }[] = [];
  for (const i of items) {
    const name = i.phase ?? '';
    if (!phases.length || phases[phases.length - 1].name !== name) phases.push({ key: `${phases.length}:${name}`, name, items: [] });
    phases[phases.length - 1].items.push(i);
  }
  const ui = uiOf(t.id);
  // Open the phase being studied (it holds the running sprint's next lesson), else the first unfinished one.
  // First visit: only that one. Later, when studying moves on to another phase, open that one too.
  const live = phases.find((ph) => ph.items.some((i) => !i.done && where.get(i.id)?.status === 'active')) ?? phases.find((ph) => ph.items.some((i) => !i.done)) ?? phases[0];
  if (!ui.open) ui.open = new Set([live.key]);
  else if (ui.live !== live.key) ui.open.add(live.key);
  ui.live = live.key;
  const itemRow = (i: RoadmapItem, k: number) => {
    const s = i.done ? undefined : where.get(i.id);
    const badge = s ? `<span class="pill ${s.status === 'active' ? 'live' : 'plan'}" title="${esc(s.title)}">${s.status === 'active' ? 'Sprint hiện tại' : `Sprint ${fmtDate(s.start)}`}</span>` : '';
    return `<li class="ri${i.done ? ' done' : ''}" data-id="${i.id}" data-title="${esc(`${i.title} ${i.phase ?? ''}`.toLowerCase())}" data-done="${i.done ? 1 : 0}" data-sprint="${s ? s.id : ''}" data-live="${s?.status === 'active' ? 1 : 0}">
      <label class="ri-check"><input type="checkbox" data-act="ri-done" data-id="${i.id}" ${i.done ? 'checked' : ''}><span class="ri-title">${esc(i.title)}</span></label>
      <span class="ri-meta">${i.estimate ? `<span class="est">${esc(estText(i.estimate))}</span>` : ''}${badge}${i.done && i.doneOn ? `<span class="small muted">xong ${fmtDate(i.doneOn)}</span>` : ''}</span>
      <span class="ri-acts">${i.link ? `<a href="${esc(i.link)}" target="_blank" rel="noopener noreferrer" class="icon-btn" aria-label="Mở link bài học" title="Mở link">${ICON.link}</a>` : ''}<button class="icon-btn" data-act="ri-up" data-id="${i.id}" aria-label="Đưa lên trên" title="Lên trên" ${k === 0 ? 'disabled' : ''}>${ICON.up}</button><button class="icon-btn" data-act="ri-down" data-id="${i.id}" aria-label="Đưa xuống dưới" title="Xuống dưới" ${k === items.length - 1 ? 'disabled' : ''}>${ICON.down}</button><button class="icon-btn" data-act="ri-edit" data-id="${i.id}" aria-label="Sửa bài" title="Sửa">${ICON.edit}</button><button class="icon-btn danger" data-act="ri-del" data-id="${i.id}" aria-label="Xoá bài" title="Xoá">${ICON.del}</button></span>
    </li>`;
  };
  let k = 0;
  const grouped = phases.length > 1 || !!phases[0].name;
  const html = `<section class="page-head">
    <div><a href="#/t/${t.id}" class="back">${esc(t.name)}</a><h1>Lộ trình</h1></div>
    <div class="row gap wrap"><a class="btn primary" href="#/t/${t.id}/plan">${state.sprints.some((s) => s.trackId === t.id && s.milestones.some((m) => m.itemId)) ? 'Kế hoạch sprint' : 'Chia thành các sprint'}</a><a class="btn" href="#/t/${t.id}/roadmap/import">Dán thêm bài</a></div>
  </section>
  <section class="card rm-overview" style="--c:${esc(t.color)}">
    <div class="rm-stats">
      <div><b class="mono">${nf.format(Math.round(prog.pct * 100))}%</b><span>đã hoàn thành${prog.weighted ? ', theo khối lượng' : ''}</span></div>
      <div><b class="mono">${prog.done}/${prog.total}</b><span>bài đã xong${grouped ? `, ${phases.length} phần` : ''}</span></div>
      <div><b class="mono">${sessionsText(prog.remainingSessions)}</b><span>còn lại, ${hoursText(prog.remainingSessions, p)}</span></div>
    </div>
    ${roadmapLine(prog, t.color, true)}
    ${projectionLines(t, pj, prog)}
    ${assumptions(t, pj, prog)}
    ${why ? `<div class="banner replan"><span>${esc(why)} Ngày tháng chỉ thay đổi khi bạn xác nhận.</span><a class="btn small" href="#/t/${t.id}/plan">Lập lại kế hoạch</a></div>` : ''}
  </section>
  <section class="rm-tools card" role="search">
    <input type="search" class="rm-q grow" placeholder="Tìm bài học hoặc phần…" value="${esc(ui.q)}" aria-label="Tìm trong lộ trình">
    <div class="segctl" role="group" aria-label="Lọc theo trạng thái">${([['all', 'Tất cả'], ['todo', 'Chưa xong'], ['done', 'Đã xong']] as const).map(([v, l]) => `<button type="button" class="seg-btn${ui.status === v ? ' on' : ''}" data-status="${v}" aria-pressed="${ui.status === v}">${l}</button>`).join('')}</div>
    <select class="rm-sprint" aria-label="Lọc theo sprint"><option value="">Mọi sprint</option><option value="live" ${ui.sprint === 'live' ? 'selected' : ''}>Sprint đang chạy</option><option value="none" ${ui.sprint === 'none' ? 'selected' : ''}>Chưa xếp vào sprint</option>${open.filter((s) => s.status === 'planned').map((s) => `<option value="${s.id}" ${ui.sprint === s.id ? 'selected' : ''}>${esc(s.title.slice(0, 50))} (${fmtDate(s.start)})</option>`).join('')}</select>
    ${grouped ? `<select class="rm-jump" aria-label="Đi tới phần"><option value="">Đi tới phần…</option>${phases.map((ph, n) => `<option value="${n}">${esc((ph.name || 'Chưa có phần').slice(0, 60))}</option>`).join('')}</select>
    <div class="row gap"><button type="button" class="btn xs ghost" data-rm-all="1">Mở tất cả</button><button type="button" class="btn xs ghost" data-rm-all="0">Thu gọn</button></div>` : ''}
    <p class="rm-count small muted" aria-live="polite"></p>
  </section>
  <div class="rphases">${phases.map((ph, n) => {
    const done = ph.items.filter((i) => i.done).length;
    const mins = ph.items.filter((i) => !i.done).reduce((a, i) => a + itemSessions(i, p) * p.sessionMinutes, 0);
    const live = ph.items.some((i) => !i.done && where.get(i.id)?.status === 'active');
    const pct = Math.round((done / ph.items.length) * 100);
    return `<details class="card rphase${done === ph.items.length ? ' complete' : ''}" data-key="${esc(ph.key)}" id="ph-${n}" ${grouped ? (ui.open!.has(ph.key) ? 'open' : '') : 'open'}>
      <summary><span class="chev" aria-hidden="true"></span><span class="ph-name">${esc(ph.name || (grouped ? 'Chưa có phần' : 'Tất cả bài học'))}</span>${live ? '<span class="pill live">Đang học</span>' : ''}
        <span class="ph-stats"><span class="mini-bar" style="--p:${pct}%"><i></i></span><span class="mono">${done}/${ph.items.length}</span>${mins ? `<span class="muted">${fmtMinutes(Math.round(mins))}</span>` : done === ph.items.length ? '<span class="ok-text">Xong</span>' : ''}</span></summary>
      <ul class="ri-list">${ph.items.map((i) => itemRow(i, k++)).join('')}</ul>
      <p class="ph-empty small muted" hidden>Không có bài nào khớp bộ lọc trong phần này.</p>
    </details>`;
  }).join('')}</div>
  <p class="rm-none card" hidden>Không tìm thấy bài nào. Thử từ khoá khác hoặc bỏ bớt bộ lọc.</p>
  <section class="card">
    <form class="ri-add row gap wrap" data-track="${t.id}"><input name="title" class="grow" maxlength="320" placeholder="Thêm một bài vào cuối, ví dụ: Bài 31: Tổng kết (40m)" aria-label="Thêm bài"><button class="btn small">Thêm</button></form>
    <p class="small muted">Bài mới nằm trong phần cuối cùng. Có thể ghi ước lượng ở cuối: (45m), (1h30) hoặc [2] buổi.</p>
  </section>`;
  return {
    title: `Lộ trình · ${t.name}`,
    html,
    mount(root) {
      const filtering = () => !!ui.q.trim() || ui.status !== 'all' || !!ui.sprint;
      const apply = () => {
        const ql = ui.q.trim().toLowerCase();
        let shown = 0;
        root.querySelectorAll<HTMLDetailsElement>('.rphase').forEach((det) => {
          let visible = 0;
          det.querySelectorAll<HTMLElement>('.ri').forEach((li) => {
            const ok = (!ql || li.dataset.title!.includes(ql))
              && (ui.status === 'all' || (ui.status === 'done') === (li.dataset.done === '1'))
              && (!ui.sprint || (ui.sprint === 'live' ? li.dataset.live === '1' : ui.sprint === 'none' ? !li.dataset.sprint && li.dataset.done === '0' : li.dataset.sprint === ui.sprint));
            li.hidden = !ok;
            if (ok) visible++;
          });
          shown += visible;
          det.hidden = filtering() && !visible;
          if (filtering() && visible) det.open = true;
          else if (!filtering() && grouped) det.open = ui.open!.has(det.dataset.key!);
        });
        root.querySelector<HTMLElement>('.rm-count')!.textContent = filtering() ? `Đang hiện ${shown}/${items.length} bài` : `${items.length} bài, ${phases.length} phần · bấm vào tên phần để mở hoặc thu gọn`;
        root.querySelector<HTMLElement>('.rm-none')!.hidden = shown > 0;
      };
      root.querySelector('.rphases')!.addEventListener('toggle', (e) => {
        const det = e.target as HTMLDetailsElement;
        if (!det.classList?.contains('rphase') || filtering() || !grouped) return;
        if (det.open) ui.open!.add(det.dataset.key!); else ui.open!.delete(det.dataset.key!);
      }, true);
      root.querySelector<HTMLInputElement>('.rm-q')!.addEventListener('input', (e) => { ui.q = (e.target as HTMLInputElement).value; apply(); });
      root.querySelector<HTMLSelectElement>('.rm-sprint')!.addEventListener('change', (e) => { ui.sprint = (e.target as HTMLSelectElement).value; apply(); });
      root.querySelector('.rm-tools')!.addEventListener('click', (e) => {
        const b = (e.target as HTMLElement).closest<HTMLElement>('[data-status],[data-rm-all]');
        if (!b) return;
        if (b.dataset.status) {
          ui.status = b.dataset.status as RoadmapUi['status'];
          root.querySelectorAll<HTMLElement>('[data-status]').forEach((x) => { x.classList.toggle('on', x === b); x.setAttribute('aria-pressed', String(x === b)); });
        } else {
          ui.open = b.dataset.rmAll === '1' ? new Set(phases.map((ph) => ph.key)) : new Set();
        }
        apply();
      });
      root.querySelector<HTMLSelectElement>('.rm-jump')?.addEventListener('change', (e) => {
        const n = (e.target as HTMLSelectElement).value;
        if (n === '') return;
        const det = root.querySelector<HTMLDetailsElement>(`#ph-${n}`)!;
        det.open = true;
        ui.open!.add(det.dataset.key!);
        det.scrollIntoView({ block: 'start', behavior: 'smooth' });
        (e.target as HTMLSelectElement).value = '';
      });
      apply();
    },
  };
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
 * Free-form sprint planner laid out as a board: the unplaced backlog on one side, collapsible sprint cards on the
 * other. Lessons move by drag and drop (SortableJS, mouse and touch), by the per-lesson "Chuyển tới…" menu
 * (keyboard friendly), or in bulk after ticking several. Presets only make a draft. Nothing is written until
 * "Lưu kế hoạch"; a change to the running sprint asks for confirmation first.
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
  const html = `<section class="rm-plan">
    <a href="#/t/${t.id}/roadmap" class="back">Lộ trình</a>
    <div class="page-head"><div><p class="eyebrow">${esc(t.name)}</p><h1>Kế hoạch sprint</h1>
      <p class="muted lead">Kéo thả bài học giữa các sprint, hoặc bấm <span class="kbd">⇄</span> ở mỗi bài để chuyển nhanh. Chưa có gì thay đổi cho đến khi bạn bấm <b>Lưu</b>.</p></div></div>
    <form class="plan-form card" novalidate>
      <div class="plan-presets"><span class="lbl">Chia nhanh</span>
        <div class="row gap wrap">${[2, 3, 4].map((w) => `<button type="button" class="btn small" data-preset="w${w}">${w} tuần / sprint</button>`).join('')}<button type="button" class="btn small" data-preset="phase" ${phased ? '' : 'disabled title="Lộ trình chưa chia phần"'}>Mỗi phần một sprint</button></div>
        <p class="small muted">Tạo bản nháp mới cho mọi bài chưa xong; sprint đang chạy nhận phần đầu và giữ ngày bắt đầu.</p></div>
      <details class="plan-settings"><summary>Thiết lập ngày và thời lượng</summary>
        <div class="grid3">
          <label class="field"><span>Sprint đầu bắt đầu từ</span><input type="date" name="start"></label>
          <label class="field"><span>Một buổi học (phút)</span><input type="number" name="sessionMinutes" min="5" max="480" value="${p0.sessionMinutes}" class="num"></label>
          <label class="field"><span>Bài không có ước lượng: số bài mỗi buổi</span><input type="number" name="itemsPerSession" min="0.1" max="20" step="0.5" value="${p0.itemsPerSession}" class="num"></label>
        </div></details>
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
      let q = '';
      const sel = new Set<string>();
      const open = new Set<string>();
      let sortables: Sortable[] = [];
      const byId = () => new Map(itemsOf(t.id).map((x) => [x.id, x]));
      const read = () => {
        const sm = Math.round(Math.max(5, Math.min(480, Number(f('sessionMinutes').value) || p0.sessionMinutes)));
        const ip = Math.round(Math.max(0.1, Math.min(20, Number(f('itemsPerSession').value) || p0.itemsPerSession)) * 10) / 10;
        const track: Track = { ...t, sessionMinutes: sm, itemsPerSession: ip };
        return { track, start: f('start').value || d };
      };
      const remaining = () => itemsOf(t.id).filter((i) => !i.done);
      const statusOf = (sid?: string) => state.sprints.find((s) => s.id === sid)?.status;
      const activeDraft = () => drafts.find((x) => statusOf(x.sprintId) === 'active');
      const applyPreset = (kind: string) => {
        const r = read();
        const keep = activeDraft();
        const fresh = withKeys(kind === 'phase' && phased ? proposeByPhase(remaining(), r.track) : proposePlan(remaining(), r.track, Number(kind.slice(1)) || 3));
        if (keep && fresh.length) fresh[0] = { ...fresh[0], key: keep.key, sprintId: keep.sprintId, start: keep.start, title: keep.title };
        drafts = keep && !fresh.length ? [{ ...keep, itemIds: [] }] : fresh;
        if (!keep) f('start').value = f('start').value || d;
        sel.clear();
        open.clear();
        if (drafts[0]) open.add(drafts[0].key);
        dirty = true;
        paint();
      };
      const load = () => {
        drafts = draftsFromSprints(state.sprints, itemsOf(t.id), t.id);
        f('start').value = drafts[0]?.start ?? planStart(state.sprints, t.id, d, false);
        sel.clear();
        open.clear();
        if (drafts[0]) open.add(drafts[0].key);
        dirty = false;
        paint();
      };
      /** Rows of one list. Consecutive lessons of the same phase get a header with a "select the group" box. */
      const rows = (ids: string[], list: number): string => {
        const m = byId();
        const its = ids.map((x) => m.get(x)).filter((x): x is RoadmapItem => !!x);
        const showGroups = its.some((x) => x.phase);
        let last: string | null = null;
        let gi = -1;
        const ql = q.toLowerCase();
        return its.map((it, k) => {
          const ph = it.phase ?? '';
          let head = '';
          if (showGroups && ph !== last) {
            gi++;
            const n = its.slice(k).findIndex((x) => (x.phase ?? '') !== ph);
            const group = its.slice(k, n < 0 ? undefined : k + n);
            head = `<li class="pi-group" data-group="${list}:${gi}"><label><input type="checkbox" data-selgroup="${list}:${gi}" ${group.every((x) => sel.has(x.id)) ? 'checked' : ''}><span>${esc(ph || 'Chưa có phần')}</span></label><span class="count">${group.length}</span></li>`;
          }
          last = ph;
          const hide = list < 0 && ql && !it.title.toLowerCase().includes(ql) && !ph.toLowerCase().includes(ql);
          return `${head}<li class="pi${sel.has(it.id) ? ' on' : ''}" data-id="${it.id}" ${hide ? 'hidden' : ''}>
            <span class="pi-handle" title="Kéo để di chuyển" aria-hidden="true">${GRIP}</span>
            <input type="checkbox" data-sel="${it.id}" ${sel.has(it.id) ? 'checked' : ''} aria-label="Chọn ${esc(it.title)}">
            <span class="pi-title">${esc(it.title)}</span>${it.estimate ? `<span class="est">${esc(estText(it.estimate))}</span>` : ''}
            <button type="button" class="icon-btn ghost" data-menu="${it.id}" aria-haspopup="menu" aria-label="Chuyển ${esc(it.title)} tới…" title="Chuyển tới… (Alt+↑/↓ để đổi thứ tự)">⇄</button>
          </li>`;
        }).join('');
      };
      const paint = () => {
        for (const s of sortables) s.destroy();
        sortables = [];
        const y = window.scrollY;
        const r = read();
        const L = layoutPlan(drafts, itemsOf(t.id), r.track, r.start);
        const pool = unplacedIds(drafts, remaining());
        const ch = saveChanges(L, r.track, state.sprints, itemsOf(t.id), d, () => 'x');
        const n = sel.size;
        const opts = L.sprints.map((s, i) => `<option value="${i}">S${i + 1} · ${esc(s.title.slice(0, 60))}</option>`).join('');
        out.innerHTML = `<div class="plan-board">
          <aside class="backlog card">
            <div class="col-head"><h2>Chưa xếp <span class="count">${pool.length}</span></h2>${pool.length ? `<button type="button" class="btn xs ghost" data-selall="-1">Chọn tất cả</button>` : ''}</div>
            ${pool.length > 8 ? `<input type="search" class="backlog-q" placeholder="Tìm bài hoặc phần…" value="${esc(q)}" aria-label="Tìm trong bài chưa xếp">` : ''}
            <ul class="pi-list" data-list="-1">${rows(pool, -1)}</ul>
            ${pool.length ? '' : '<div class="empty-mini"><b>Đã xếp hết</b><span>Kéo bài từ sprint về đây để bỏ khỏi sprint.</span></div>'}
          </aside>
          <div class="sprint-col">
            <div class="sel-bar${n ? ' on' : ''}" role="region" aria-label="Bài đã chọn">
              ${n ? `<span><b>${n}</b> bài đã chọn</span>
              <label class="small">Chuyển tới <select data-target>${opts}<option value="new">+ Sprint mới</option></select></label>
              <button type="button" class="btn small primary" data-move>Chuyển</button>
              <button type="button" class="btn small" data-unplace>Bỏ khỏi sprint</button>
              <button type="button" class="btn small ghost" data-clear>Bỏ chọn</button>` : `<span class="muted small">Mẹo: tick nhiều bài rồi kéo một bài là cả nhóm đi theo.</span>
              <span class="grow"></span><button type="button" class="btn xs ghost" data-openall>Mở tất cả</button><button type="button" class="btn xs ghost" data-closeall>Thu gọn</button>`}
            </div>
            ${L.sprints.length ? '' : `<div class="empty card"><b>Chưa có sprint nào</b><span>Tự tạo sprint trống rồi kéo bài vào, hoặc để app gợi ý một cách chia (bạn vẫn sửa được trước khi lưu).</span>
              <div class="row gap wrap center"><button type="button" class="btn small primary" data-add>+ Sprint trống</button>${phased ? '<button type="button" class="btn small" data-preset="phase">Mỗi phần một sprint</button>' : ''}<button type="button" class="btn small" data-preset="w3">Chia 3 tuần / sprint</button></div></div>`}
            <ol class="plan-sprints">${L.sprints.map((s, i) => {
          const dr = drafts[i];
          const st = statusOf(dr.sprintId);
          const isOpen = open.has(dr.key);
          const days = dr.days && dr.days % 7 ? dr.days : 0;
          const pct = Math.min(100, (s.sessions / s.capacity) * 100);
          return `<li class="ps card${s.over ? ' over' : ''}${st === 'active' ? ' live' : ''}${isOpen ? ' open' : ''}" data-key="${dr.key}">
            <div class="ps-top">
              <button type="button" class="icon-btn ghost ps-toggle" data-toggle="${i}" aria-expanded="${isOpen}" aria-label="${isOpen ? 'Thu gọn' : 'Mở'} sprint ${i + 1}">${isOpen ? '▾' : '▸'}</button>
              <span class="ps-no">S${i + 1}</span>
              <input class="ps-title" data-i="${i}" value="${esc(s.title)}" maxlength="200" aria-label="Tên sprint ${i + 1}">
              <span class="pill ${st === 'active' ? 'live' : st === 'planned' ? 'plan' : 'new'}">${st === 'active' ? 'Đang chạy' : st === 'planned' ? 'Đã lên lịch' : 'Mới'}</span>
            </div>
            <div class="ps-meta"><span class="mono">${fmtDate(s.start)} – ${fmtDate(s.end)}</span><span>${s.items.length} bài</span><span class="${s.over ? 'warn-text' : ''}">${sessionsText(s.sessions)} / ${nf.format(s.capacity)} buổi</span>${s.autoTitle ? '<span class="muted">tên tự đặt</span>' : ''}${s.overlap ? '<span class="warn-text">trùng ngày sprint trước</span>' : ''}</div>
            <div class="load" title="Khối lượng so với số buổi có thể học"><i style="width:${pct.toFixed(1)}%"></i></div>
            ${isOpen ? `<div class="ps-dates">
                <label class="small">Bắt đầu <input type="date" data-start="${i}" value="${s.start}"></label>
                <label class="small">Độ dài <select data-weeks="${i}">${days ? `<option value="d" selected>${days} ngày</option>` : ''}${Array.from({ length: EDIT_MAX_WEEKS }, (_, k) => k + 1).map((w) => `<option value="${w}" ${!days && w === s.weeks ? 'selected' : ''}>${w} tuần</option>`).join('')}</select></label>
                ${s.items.length ? `<button type="button" class="btn xs ghost" data-selall="${i}">Chọn tất cả</button>` : ''}
              </div>
              <ul class="pi-list" data-list="${i}">${rows(dr.itemIds, i)}</ul>
              ${s.items.length ? '' : '<p class="drop-hint">Kéo bài vào đây</p>'}
              <div class="ps-acts">
                ${n ? `<button type="button" class="btn small primary" data-here="${i}">Đưa ${n} bài đã chọn vào đây</button>` : ''}
                <button type="button" class="btn small ghost" data-sup="${i}" ${i === 0 ? 'disabled' : ''}>↑ Lên</button>
                <button type="button" class="btn small ghost" data-sdown="${i}" ${i === L.sprints.length - 1 ? 'disabled' : ''}>↓ Xuống</button>
                <button type="button" class="btn small ghost" data-split="${i}" ${s.items.length > 1 ? '' : 'disabled'} title="Tách tại bài đầu tiên đang chọn; không chọn bài nào thì chia đôi">Tách</button>
                <button type="button" class="btn small ghost" data-merge="${i}" ${i < L.sprints.length - 1 ? '' : 'disabled'}>Gộp với sprint sau</button>
                <span class="grow"></span>
                <button type="button" class="btn small ghost danger" data-del="${i}">Xoá sprint</button>
              </div>` : `<ul class="pi-list zone" data-list="${i}" aria-label="Thả bài vào sprint ${i + 1}"></ul>${n ? `<button type="button" class="btn xs primary here-mini" data-here="${i}">Đưa ${n} bài vào đây</button>` : ''}`}
          </li>`;
        }).join('')}</ol>
            <div class="row gap wrap"><button type="button" class="btn small" data-add>+ Thêm sprint trống</button><button type="button" class="btn small ghost" data-chain ${L.sprints.length > 1 ? '' : 'disabled'}>Xếp ngày nối tiếp</button></div>
          </div>
        </div>
        <section class="plan-foot card">
          <div><b>${L.sprints.length} sprint</b>${L.finish ? ` · dự kiến xong <b>${fmtDate(L.finish)}</b>` : ''} · học ${L.capacityPerWeek} ngày/tuần (${sessionsText(L.totalSessions)})${pool.length ? ` · <span class="warn-text">${pool.length} bài chưa xếp</span>` : ''}
            ${L.warnings.map((w) => `<p class="small warn-text">${esc(w)}</p>`).join('')}
            ${ch.active ? `<p class="small warn-text">${ch.active.closed ? `Sprint đang chạy "${esc(ch.active.title)}" sẽ được khép lại.` : `Sprint đang chạy "${esc(ch.active.title)}" sẽ thay đổi${ch.active.added ? `, thêm ${ch.active.added} bài` : ''}${ch.active.removed ? `, bớt ${ch.active.removed} bài` : ''}${ch.active.datesChanged ? ', đổi ngày' : ''}. App sẽ hỏi lại trước khi lưu.`}</p>` : ''}
            ${ch.remove.length ? `<p class="small muted">${ch.remove.length} sprint cũ sẽ bị xoá (chưa có bài nào hoàn thành).</p>` : ''}</div>
          <div class="row gap"><button type="button" class="btn ghost" data-reload ${dirty ? '' : 'disabled'}>Bỏ thay đổi</button><button type="button" class="btn primary" data-save ${(dirty || !existing) && (L.sprints.length || existing) ? '' : 'disabled'}>${existing ? 'Lưu kế hoạch' : `Tạo ${L.sprints.length} sprint`}</button></div>
        </section>`;
        window.scrollTo(0, y);
        if (SortableLib) attachDnd(); else loadSortable().then(() => { if (out.isConnected) attachDnd(); }).catch(() => { /* offline before first load: the ⇄ menu still works */ });
      };
      const attachDnd = () => {
        for (const s of sortables) s.destroy();
        sortables = [];
        out.querySelectorAll<HTMLElement>('.pi-list').forEach((el) => {
          sortables.push(SortableLib!.create(el, {
            group: 'plan', handle: '.pi-handle', draggable: '.pi', animation: 140, forceFallback: true, fallbackOnBody: true, fallbackTolerance: 3, delay: 120, delayOnTouchOnly: true,
            ghostClass: 'pi-ghost', chosenClass: 'pi-chosen', dragClass: 'pi-drag', emptyInsertThreshold: 24, scrollSensitivity: 90,
            // Badge set on choose, before the floating clone is made, so the clone shows "+N" too.
            onChoose: (e) => {
              const idd = (e.item as HTMLElement).dataset.id!;
              if (sel.has(idd) && sel.size > 1) e.item.setAttribute('data-count', `+${sel.size - 1}`);
            },
            onUnchoose: (e) => e.item.removeAttribute('data-count'),
            onStart: () => { document.body.classList.add('is-dragging'); window.getSelection()?.removeAllRanges(); },
            onEnd: (e) => {
              document.body.classList.remove('is-dragging');
              const idd = (e.item as HTMLElement).dataset.id!;
              const to = Number((e.to as HTMLElement).dataset.list);
              const from = Number((e.from as HTMLElement).dataset.list);
              if (from === to && e.oldIndex === e.newIndex) { paint(); return; }
              let nx = e.item.nextElementSibling;
              while (nx && !(nx as HTMLElement).classList.contains('pi')) nx = nx.nextElementSibling;
              const ids = sel.has(idd) && sel.size > 1 ? selected() : [idd];
              if (ids.length > 1) sel.clear();
              if (to >= 0) open.add(drafts[to].key);
              if (from < 0 && to < 0) { paint(); return; }
              set(dropItems(drafts, ids, to, (nx as HTMLElement | null)?.dataset.id ?? null));
            },
          }));
        });
      };
      const set = (next: EditDraft[]) => { if (next !== drafts) { drafts = next; dirty = true; } paint(); };
      const indexOf = (el: HTMLElement, attr: string) => Number(el.closest<HTMLElement>(`[data-${attr}]`)!.dataset[attr]);
      const selected = () => [...drafts.flatMap((x) => x.itemIds), ...unplacedIds(drafts, remaining())].filter((x) => sel.has(x));
      const listOf = (itemId: string) => drafts.findIndex((x) => x.itemIds.includes(itemId));
      const groupIds = (list: number, gi: number): string[] => {
        const ids = list < 0 ? unplacedIds(drafts, remaining()) : drafts[list].itemIds;
        const m = byId();
        const groups: string[][] = [];
        let last: string | null = null;
        for (const x of ids) { const ph = m.get(x)?.phase ?? ''; if (last === null || ph !== last) groups.push([]); groups[groups.length - 1].push(x); last = ph; }
        return groups[gi] ?? [];
      };
      // ---- "Chuyển tới…" menu (one shared popover; arrow keys move focus, Escape closes)
      const menu = document.createElement('div');
      menu.className = 'menu';
      menu.setAttribute('role', 'menu');
      menu.hidden = true;
      document.body.appendChild(menu);
      window.addEventListener('hashchange', () => menu.remove(), { once: true });
      let menuFor: string | null = null;
      let menuBtn: HTMLElement | null = null;
      const closeMenu = (focus = true) => { menu.hidden = true; menuFor = null; if (focus) menuBtn?.focus(); };
      const openMenu = (btn: HTMLElement, itemId: string) => {
        menuFor = itemId;
        menuBtn = btn;
        const cur = listOf(itemId);
        const many = sel.has(itemId) && sel.size > 1;
        const r = read();
        const L = layoutPlan(drafts, itemsOf(t.id), r.track, r.start);
        menu.innerHTML = `<p class="menu-head">${many ? `Chuyển ${sel.size} bài đã chọn tới` : 'Chuyển tới'}</p>
          ${L.sprints.map((s, i) => `<button type="button" role="menuitem" data-to="${i}" ${i === cur && !many ? 'aria-current="true"' : ''}><span class="ps-no">S${i + 1}</span><span class="menu-t">${esc(s.title)}</span><span class="count">${s.items.length}</span></button>`).join('')}
          <button type="button" role="menuitem" data-to="new"><span class="ps-no">+</span><span class="menu-t">Sprint mới ở cuối</span></button>
          ${cur >= 0 || many ? '<button type="button" role="menuitem" data-to="-1"><span class="ps-no">↩</span><span class="menu-t">Bỏ khỏi sprint (về Chưa xếp)</span></button>' : ''}`;
        menu.hidden = false;
        const b = btn.getBoundingClientRect();
        const w = Math.min(340, window.innerWidth - 16);
        menu.style.width = `${w}px`;
        menu.style.left = `${Math.max(8, Math.min(b.right - w, window.innerWidth - w - 8)) + window.scrollX}px`;
        const below = window.innerHeight - b.bottom > 280;
        menu.style.top = `${(below ? b.bottom + 4 : Math.max(8, b.top - Math.min(menu.offsetHeight, 360) - 4)) + window.scrollY}px`;
        (menu.querySelector<HTMLElement>('[aria-current]') ?? menu.querySelector<HTMLElement>('button'))?.focus();
      };
      menu.addEventListener('click', (e) => {
        const b = (e.target as HTMLElement).closest<HTMLElement>('[data-to]');
        if (!b || !menuFor) return;
        const ids = sel.has(menuFor) && sel.size > 1 ? selected() : [menuFor];
        const v = b.dataset.to!;
        const to = v === 'new' ? drafts.length : Number(v);
        if (ids.length > 1) sel.clear();
        closeMenu(false);
        const next = moveItems(drafts, ids, to);
        if (to >= 0) open.add(next[Math.min(to, next.length - 1)].key);
        set(next);
        toast(to < 0 ? `Đã bỏ ${ids.length} bài khỏi sprint.` : `Đã chuyển ${ids.length} bài tới S${Math.min(to, next.length - 1) + 1}.`);
      });
      menu.addEventListener('keydown', (e) => {
        const bs = [...menu.querySelectorAll<HTMLElement>('button')];
        const k = bs.indexOf(document.activeElement as HTMLElement);
        if (e.key === 'Escape') { e.preventDefault(); closeMenu(); }
        else if (e.key === 'ArrowDown') { e.preventDefault(); bs[(k + 1) % bs.length]?.focus(); }
        else if (e.key === 'ArrowUp') { e.preventDefault(); bs[(k - 1 + bs.length) % bs.length]?.focus(); }
        else if (e.key === 'Home') { e.preventDefault(); bs[0]?.focus(); }
        else if (e.key === 'End') { e.preventDefault(); bs[bs.length - 1]?.focus(); }
        else if (e.key === 'Tab') closeMenu(false);
      });
      document.addEventListener('pointerdown', (e) => { if (menu.isConnected && !menu.hidden && !menu.contains(e.target as Node) && !(e.target as HTMLElement).closest('[data-menu]')) closeMenu(false); });
      // ---- events
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
      out.addEventListener('click', (e) => {
        const b = (e.target as HTMLElement).closest<HTMLElement>('[data-preset]');
        if (b) applyPreset(b.dataset.preset!);
      });
      // Text selection must not start when a drag begins on the grip (fallback drag uses mouse events).
      out.addEventListener('mousedown', (e) => { if ((e.target as HTMLElement).closest('.pi-handle')) e.preventDefault(); });
      out.addEventListener('input', (e) => {
        const el = e.target as HTMLInputElement;
        if (el.classList.contains('ps-title')) { drafts = renameSprint(drafts, Number(el.dataset.i), el.value); dirty = true; out.querySelector<HTMLButtonElement>('[data-save]')!.disabled = false; out.querySelector<HTMLButtonElement>('[data-reload]')!.disabled = false; }
        if (el.classList.contains('backlog-q')) {
          q = el.value;
          const ql = q.toLowerCase();
          const m = byId();
          out.querySelectorAll<HTMLElement>('[data-list="-1"] .pi').forEach((li) => {
            const it = m.get(li.dataset.id!);
            li.hidden = !!ql && !!it && !it.title.toLowerCase().includes(ql) && !(it.phase ?? '').toLowerCase().includes(ql);
          });
        }
      });
      out.addEventListener('change', (e) => {
        const el = e.target as HTMLInputElement;
        if (el.dataset.sel) { if (el.checked) sel.add(el.dataset.sel); else sel.delete(el.dataset.sel); paint(); return; }
        if (el.dataset.selgroup) {
          const [l, gi] = el.dataset.selgroup.split(':').map(Number);
          for (const x of groupIds(l, gi)) if (el.checked) sel.add(x); else sel.delete(x);
          paint(); return;
        }
        if (el.dataset.weeks !== undefined && el.value !== 'd') { set(setWeeks(drafts, Number(el.dataset.weeks), Number(el.value))); return; }
        if (el.dataset.start !== undefined) { set(setStart(drafts, Number(el.dataset.start), el.value)); return; }
        if (el.classList.contains('ps-title')) paint();
      });
      out.addEventListener('keydown', (e) => {
        // Alt+↑/↓ on a lesson row reorders it inside its sprint (keyboard alternative to dragging).
        const row = (e.target as HTMLElement).closest<HTMLElement>('.pi');
        if (!row || !e.altKey || (e.key !== 'ArrowUp' && e.key !== 'ArrowDown')) return;
        const l = listOf(row.dataset.id!);
        if (l < 0) return;
        e.preventDefault();
        set(moveWithin(drafts, l, row.dataset.id!, e.key === 'ArrowUp' ? -1 : 1));
        out.querySelector<HTMLElement>(`.pi[data-id="${row.dataset.id}"] [data-menu]`)?.focus();
      });
      out.addEventListener('click', async (e) => {
        const el = e.target as HTMLElement;
        const has = (a: string) => !!el.closest(`[data-${a}]`);
        if (has('menu')) { const b = el.closest<HTMLElement>('[data-menu]')!; if (menuFor === b.dataset.menu) closeMenu(false); else openMenu(b, b.dataset.menu!); return; }
        if (has('toggle')) { const k = drafts[indexOf(el, 'toggle')].key; if (open.has(k)) open.delete(k); else open.add(k); paint(); return; }
        if (has('openall')) { drafts.forEach((x) => open.add(x.key)); paint(); return; }
        if (has('closeall')) { open.clear(); paint(); return; }
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
          const next = moveItems(drafts, ids, to);
          open.add(next[Math.min(to, next.length - 1)].key);
          set(next);
          return;
        }
        if (has('unplace')) { const ids = selected(); sel.clear(); set(moveItems(drafts, ids, -1)); return; }
        if (has('here')) { const i = indexOf(el, 'here'); const ids = selected(); sel.clear(); open.add(drafts[i].key); set(moveItems(drafts, ids, i)); return; }
        if (has('sup')) { set(moveSprint(drafts, indexOf(el, 'sup'), -1)); return; }
        if (has('sdown')) { set(moveSprint(drafts, indexOf(el, 'sdown'), 1)); return; }
        if (has('split')) {
          const i = indexOf(el, 'split');
          const ids = drafts[i].itemIds;
          const k = ids.findIndex((x) => sel.has(x));
          const next = splitSprint(drafts, i, k > 0 ? k : Math.ceil(ids.length / 2));
          if (next[i + 1]) open.add(next[i + 1].key);
          set(next);
          return;
        }
        if (has('merge')) { set(mergeWithNext(drafts, indexOf(el, 'merge'))); return; }
        if (has('del')) {
          const i = indexOf(el, 'del');
          const st = statusOf(drafts[i].sprintId);
          if (drafts[i].itemIds.length && !confirm(`Xoá sprint này? ${drafts[i].itemIds.length} bài của nó sẽ về cột "Chưa xếp", không bị xoá khỏi lộ trình.${st === 'active' ? ' Đây là sprint đang chạy: khi lưu, sprint sẽ được khép lại (giữ các milestone đã xong trong lịch sử).' : ''}`)) return;
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
              : `Sửa sprint đang chạy "${a.title}"${a.added ? `: thêm ${a.added} bài` : ''}${a.removed ? `${a.added ? ',' : ':'} bớt ${a.removed} bài` : ''}${a.datesChanged ? ', đổi ngày' : ''}. Tiến độ các bài đã xong không đổi. Tiếp tục?`;
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

// SortableJS is loaded only when the planner opens, so other pages do not pay for it.
let SortableLib: typeof Sortable | null = null;
async function loadSortable(): Promise<void> {
  if (!SortableLib) SortableLib = (await import('sortablejs')).default;
}

const GRIP = '<svg viewBox="0 0 10 16" width="10" height="16" aria-hidden="true"><g fill="currentColor"><circle cx="2.5" cy="3" r="1.4"/><circle cx="7.5" cy="3" r="1.4"/><circle cx="2.5" cy="8" r="1.4"/><circle cx="7.5" cy="8" r="1.4"/><circle cx="2.5" cy="13" r="1.4"/><circle cx="7.5" cy="13" r="1.4"/></g></svg>';

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

