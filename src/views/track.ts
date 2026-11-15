// Track detail, track editor (new/edit) and sprint editor.
import { fmtDay, today, weekdayShort } from '../core/dates.js';
import { fmtMinutes } from '../core/format.js';
import { currentlyPaused, last7, momentum, weekStreak } from '../core/rhythm.js';
import { activeSprint, defaultEnd, lengthWarning, sprintProgress } from '../core/sprint.js';
import type { Milestone, Sprint, Track } from '../core/types.js';
import { ctxFor, getTrack, newId, saveSprint, saveTrack, state } from '../state.js';
import { esc, toast } from '../ui.js';
import { colorDot, dots7, heat, restDaysText, scoreRing, sprintBar, sprintMeta, weekBar } from './parts.js';
import { demoBanner } from './today.js';

export interface View { title: string; html: string; mount?: (root: HTMLElement) => void }

export const COLORS = ['#2f5bea', '#0e9f8f', '#7c5cff', '#d9480f', '#c2255c', '#0b7285'];

function evidenceHtml(l: { evidence: { kind: string; value: string; label?: string }[] }): string {
  if (!l.evidence.length) return '';
  return `<ul class="ev-inline">${l.evidence
    .map((e) =>
      e.kind === 'link'
        ? `<li><a href="${esc(e.value)}" target="_blank" rel="noopener noreferrer">${esc(e.label || e.value)}</a></li>`
        : e.kind === 'image'
          ? `<li><button class="thumb" data-act="img" data-src="${esc(e.value)}"><img src="${esc(e.value)}" alt="${esc(e.label || 'ảnh thành quả')}"></button></li>`
          : `<li class="ev-note">${esc(e.value)}</li>`,
    )
    .join('')}</ul>`;
}

export function trackView(id: string, params: URLSearchParams): View {
  const t = getTrack(id);
  if (!t) return { title: 'Không tìm thấy', html: `<section class="card"><p>Không tìm thấy việc học này. Có thể nó đã bị xoá.</p><a href="#/">Về trang Hôm nay</a></section>` };
  if (params.get('new-sprint')) return sprintEditor(t);
  const d = today();
  const ctx = ctxFor(t);
  const paused = currentlyPaused(t, d);
  const s = activeSprint(state.sprints, t.id);
  const past = state.sprints.filter((x) => x.trackId === t.id && x.status !== 'active').sort((a, b) => (a.start < b.start ? 1 : -1));
  const logs = state.logs.filter((l) => l.trackId === t.id).sort((a, b) => (a.day === b.day ? (a.createdAt < b.createdAt ? 1 : -1) : a.day < b.day ? 1 : -1));
  const total = logs.reduce((a, l) => a + l.minutes, 0);
  const l7 = last7(ctx);
  const html = `${demoBanner()}
  <section class="track-head" data-track="${t.id}" style="--c:${esc(t.color)}">
    <div>
      <a href="#/" class="back">Hôm nay</a>
      <h1>${colorDot(t)}${esc(t.name)}</h1>
      ${t.why ? `<p class="muted">${esc(t.why)}</p>` : ''}
    </div>
    <div class="row gap wrap">
      ${paused ? `<button class="btn primary" data-act="resume" data-id="${t.id}">Học lại từ hôm nay</button>` : `<button class="btn primary" data-tm="quick-start" data-id="${t.id}">Bấm giờ học</button><button class="btn" data-act="log" data-id="${t.id}">Ghi buổi học</button><button class="btn ghost" data-act="pause" data-id="${t.id}">Tạm dừng việc này</button>`}
      <a class="btn ghost" href="#/t/${t.id}/edit">Chỉnh sửa</a>
    </div>
  </section>
  <section class="stats">
    <div class="stat with-ring" style="--c:${esc(t.color)}">${scoreRing(momentum(ctx))}<div class="stat-copy"><span>Độ đều đặn</span></div></div>
    <div class="stat"><b>${l7.done}/7</b><span>Số ngày học trong 7 ngày qua${l7.off ? ` (${l7.off} ngày nghỉ)` : ''}</span></div>
    <div class="stat"><b data-count="${weekStreak(ctx)}">${weekStreak(ctx)}</b><span>Số tuần liên tiếp đạt mục tiêu</span></div>
    <div class="stat"><b>${fmtMinutes(total)}</b><span>Tổng thời gian, ${logs.length} buổi học</span></div>
  </section>
  <section class="card">
    <div class="row between wrap"><h2>Chuỗi ngày học</h2><span class="small muted">Mục tiêu ${t.weeklyTarget} ngày mỗi tuần · ${restDaysText(t)}</span></div>
    ${paused ? '<p class="state">Việc học này đang tạm dừng. Những ngày tạm dừng không làm đứt chuỗi ngày học.</p>' : `<div class="rhythm">${dots7(ctx)}${weekBar(ctx)}</div>`}
    ${heat(ctx, 16)}
    <div class="plan-box">
      <p><span class="lbl">Bước nhỏ</span>${esc(t.tinyAction || 'chưa đặt')}</p>
      <p><span class="lbl">Kế hoạch</span>${esc(t.plan || 'chưa đặt; bạn có thể thử mẫu "Sau khi ..., tôi sẽ ..."')}</p>
      <p><span class="lbl">Bước tiếp theo</span>${esc(t.nextStep || 'chưa ghi')}</p>
    </div>
  </section>
  ${s ? sprintCard(s) : `<section class="card"><h2>Đợt học</h2><p class="muted">Việc này chưa có đợt học nào đang chạy. Một đợt 2 đến 4 tuần, kết thúc bằng một sản phẩm cụ thể, giúp bạn biết rõ mình đang tiến tới đâu.</p><a class="btn primary" href="#/t/${t.id}?new-sprint=1">Đặt đợt học mới</a></section>`}
  <section class="card">
    <h2>Các buổi học đã ghi</h2>
    ${logs.length ? `<ol class="logs">${logs.slice(0, 60).map((l) => `<li class="log">
      <div class="log-day">${fmtDay(l.day, true)}</div>
      <div class="log-body">
        <p><span class="tag ${l.kind}">${l.kind === 'tiny' ? 'bước nhỏ' : 'buổi học'}</span>${l.minutes ? `<span class="muted small">${fmtMinutes(l.minutes)}</span>` : ''} ${esc(l.note)}</p>
        ${l.milestoneId ? `<p class="small ok-text">Hoàn thành mốc: ${esc(findMilestone(l.milestoneId)?.text ?? '')}</p>` : ''}
        ${l.blocker ? `<p class="small warn-text">Chỗ vướng: ${esc(l.blocker)}</p>` : ''}
        ${evidenceHtml(l)}
      </div>
      <div class="log-acts"><button class="link-btn" data-act="edit-log" data-id="${l.id}">Chỉnh sửa</button><button class="link-btn" data-act="del-log" data-id="${l.id}">Xoá</button></div>
    </li>`).join('')}</ol>${logs.length > 60 ? `<p class="small muted">Đang hiện 60 buổi gần nhất. Bản sao lưu JSON có đầy đủ mọi buổi học.</p>` : ''}` : '<p class="muted">Bạn chưa ghi buổi học nào. Một bước nhỏ đầu tiên là đủ để bắt đầu.</p>'}
  </section>
  ${past.length ? `<section class="card"><h2>Các đợt học trước</h2><ul class="past">${past.map((p) => `<li><b>${esc(p.title)}</b> <span class="small">${sprintMeta(p, d)}</span><br><span class="small muted">${fmtDay(p.start)} - ${fmtDay(p.end)} · ${esc(p.deliverable)}</span>${p.reflection ? `<p class="small">${esc(p.reflection)}</p>` : ''}</li>`).join('')}</ul></section>` : ''}`;
  return { title: t.name, html };
}

function findMilestone(id: string): Milestone | undefined {
  for (const s of state.sprints) for (const m of s.milestones) if (m.id === id) return m;
  return undefined;
}

function sprintCard(s: Sprint): string {
  const d = today();
  const p = sprintProgress(s, d);
  return `<section class="card sprint">
    <div class="row between wrap"><h2>${esc(s.title)}</h2><span class="small">${sprintMeta(s, d)}</span></div>
    <p class="deliverable"><span class="lbl">Sản phẩm cuối đợt</span>${esc(s.deliverable || 'chưa ghi')}</p>
    ${sprintBar(s, d)}
    <p class="small muted">${fmtDay(s.start)} - ${fmtDay(s.end)} · đã qua ${p.elapsed}/${p.totalDays} ngày${p.pace === 'behind' ? ' · bạn có thể bớt một mốc hoặc chia mốc nhỏ hơn' : ''}</p>
    <ul class="milestones ms-rail" style="--done:${s.milestones.length ? (s.milestones.filter((m) => m.done).length / s.milestones.length).toFixed(3) : 0}">${s.milestones
      .map((m) => `<li class="${m.done ? 'done' : ''}"><label><input type="checkbox" data-act="ms" data-sprint="${s.id}" data-ms="${m.id}" ${m.done ? 'checked' : ''}><span>${esc(m.text)}</span></label>${m.doneOn ? `<span class="small muted">${fmtDay(m.doneOn)}</span>` : ''}<button class="link-btn" data-act="ms-del" data-sprint="${s.id}" data-ms="${m.id}" aria-label="Xoá mốc">Xoá</button></li>`)
      .join('')}</ul>
    <form class="row gap ms-add" data-sprint="${s.id}"><input name="ms" placeholder="Thêm một mốc, ví dụ: viết README" class="grow" maxlength="300"><button class="btn small">Thêm mốc</button></form>
    <div class="row gap wrap"><a class="btn ghost small" href="#/t/${s.trackId}/sprint/${s.id}">Chỉnh sửa đợt</a><button class="btn small" data-act="finish-sprint" data-id="${s.id}">Kết thúc đợt học</button></div>
  </section>`;
}

export const TEMPLATES: Record<string, { name: string; tiny: string; plan: string; target: number; rest: number[]; sprint: string; deliverable: string; milestones: string[] }> = {
  video: {
    name: 'Dựng video', tiny: 'Mở project và cắt một đoạn 10 giây', plan: 'Sau khi ăn tối, tôi mở project dựng ngay tại bàn.', target: 3, rest: [],
    sprint: 'Video ngắn 60 giây', deliverable: 'Một video 60 giây hoàn chỉnh, xuất file 1080p',
    milestones: ['Chọn clip và dựng timeline thô', 'Cắt khớp theo nhạc', 'Chỉnh màu và âm thanh cơ bản', 'Thêm chữ, xuất bản 1080p'],
  },
  devops: {
    name: 'DevOps lab', tiny: 'Mở terminal, chạy một lệnh hoặc đọc một trang docs (10 phút)', plan: 'Sau khi tắm xong buổi tối, tôi mở laptop và làm bước nhỏ.', target: 5, rest: [0],
    sprint: 'Một bài lab chạy được', deliverable: 'Repo có README và lệnh dựng lại được toàn bộ lab',
    milestones: ['Dựng môi trường (cluster hoặc VM)', 'Làm phần chính của lab', 'Ghi lỗi gặp phải và cách sửa', 'Viết README, push repo'],
  },
  reading: {
    name: 'Đọc sách', tiny: 'Đọc hai trang và ghi một ý', plan: 'Khi lên giường, tôi đọc trước khi cầm điện thoại.', target: 4, rest: [],
    sprint: 'Đọc xong phần 1', deliverable: 'Ghi chú tóm tắt, mỗi chương một trang',
    milestones: ['Chương 1', 'Chương 2', 'Chương 3', 'Viết tóm tắt cả phần'],
  },
  language: {
    name: 'Tiếng Anh nói', tiny: 'Nghe 5 phút và nói lại 3 câu', plan: 'Trên đường đi làm, tôi nghe và nói lại trong xe.', target: 5, rest: [6],
    sprint: 'Nói 2 phút về công việc', deliverable: 'Bản ghi âm 2 phút giới thiệu công việc, không nhìn giấy',
    milestones: ['Viết dàn ý 5 ý', 'Thu âm bản nháp đầu', 'Sửa phát âm 10 từ khó', 'Thu âm bản cuối'],
  },
};

const TEMPLATE_LABEL: Record<string, string> = { video: 'Dựng video', devops: 'DevOps lab', reading: 'Đọc sách', language: 'Ngoại ngữ' };

function weekdayPicker(selected: number[]): string {
  return `<div class="wd-pick">${[1, 2, 3, 4, 5, 6, 0].map((n) => `<label><input type="checkbox" name="rest" value="${n}" ${selected.includes(n) ? 'checked' : ''}><span>${weekdayShort(n)}</span></label>`).join('')}</div>`;
}

export function trackEditor(id?: string): View {
  const t = id ? getTrack(id) : undefined;
  if (id && !t) return { title: 'Không tìm thấy', html: '<p>Không tìm thấy việc học này.</p>' };
  const d = today();
  const color = t?.color ?? COLORS[state.tracks.length % COLORS.length];
  const html = `<section class="editor">
    <a href="${t ? `#/t/${t.id}` : '#/'}" class="back">${t ? esc(t.name) : 'Hôm nay'}</a>
    <h1>${t ? 'Sửa việc học' : 'Thêm việc học'}</h1>
    ${t ? '' : `<div class="row gap wrap tpl"><span class="small muted">Bắt đầu nhanh:</span>${Object.keys(TEMPLATES).map((k) => `<button type="button" class="chip" data-tpl="${k}">${TEMPLATE_LABEL[k]}</button>`).join('')}</div>`}
    <form class="track-form" novalidate>
      <fieldset class="card"><legend>Học gì</legend>
        <label class="field"><span>Tên</span><input name="name" required maxlength="120" value="${esc(t?.name ?? '')}" placeholder="Ví dụ: DevOps lab, Dựng video"></label>
        <label class="field"><span>Vì sao việc này quan trọng với bạn</span><textarea name="why" rows="2" placeholder="Một câu là đủ. Khi chán, đọc lại câu này.">${esc(t?.why ?? '')}</textarea></label>
        <div class="field"><span>Màu</span><div class="colors">${COLORS.map((c) => `<label><input type="radio" name="color" value="${c}" ${c === color ? 'checked' : ''}><span style="background:${c}"></span></label>`).join('')}</div></div>
      </fieldset>
      <fieldset class="card"><legend>Học mỗi ngày như thế nào</legend>
        <label class="field"><span>Bước nhỏ nhất vẫn được tính</span><input name="tiny" maxlength="300" value="${esc(t?.tinyAction ?? '')}" placeholder="Nhỏ đến mức ngày mệt nhất vẫn làm được, ví dụ: mở docs đọc 10 phút"></label>
        <label class="field"><span>Kế hoạch khi nào, ở đâu</span><input name="plan" maxlength="300" value="${esc(t?.plan ?? '')}" placeholder="Sau khi [việc quen thuộc], tôi sẽ [bước nhỏ] tại [nơi]"></label>
        <div class="grid2">
          <label class="field"><span>Mục tiêu mỗi tuần</span><div class="row gap"><input type="number" name="target" min="1" max="7" value="${t?.weeklyTarget ?? 4}" class="num"><span class="muted">ngày</span></div></label>
          <div class="field"><span>Ngày nghỉ cố định</span>${weekdayPicker(t?.restDays ?? [])}</div>
        </div>
        <p class="small muted">Đạt mục tiêu tuần quan trọng hơn học liền mạch từng ngày. Ngày nghỉ cố định không bao giờ bị tính là bỏ lỡ.</p>
      </fieldset>
      ${t ? '' : `<fieldset class="card"><legend>Đợt học đầu tiên (2 đến 4 tuần)</legend>
        <label class="field"><span>Tên đợt</span><input name="sprint" maxlength="200" placeholder="Ví dụ: GitOps với Argo CD"></label>
        <label class="field"><span>Sản phẩm cụ thể ở cuối đợt</span><input name="deliverable" maxlength="500" placeholder="Thứ có thể cho người khác xem: repo, video, bản ghi âm, bài viết"></label>
        <div class="grid2">
          <label class="field"><span>Bắt đầu</span><input type="date" name="start" value="${d}"></label>
          <div class="field"><span>Độ dài</span><div class="seg-inline">${[2, 3, 4].map((w) => `<label><input type="radio" name="weeks" value="${w}" ${w === 3 ? 'checked' : ''}><span>${w} tuần</span></label>`).join('')}</div></div>
        </div>
        <label class="field"><span>Các mốc, mỗi dòng một mốc</span><textarea name="milestones" rows="4" placeholder="3-5 mốc, mỗi mốc ra được một thứ nhìn thấy được"></textarea></label>
        <p class="small muted">Bạn có thể bỏ trống phần này và đặt đợt học sau.</p>
      </fieldset>`}
      <p class="err" role="alert"></p>
      <div class="row gap between wrap">
        <div class="row gap">${t ? `<button type="button" class="btn ghost danger" data-act="archive" data-id="${t.id}">${t.archived ? 'Hiện lại' : 'Lưu trữ'}</button><button type="button" class="btn ghost danger" data-act="del-track" data-id="${t.id}">Xoá</button>` : ''}</div>
        <button class="btn primary">${t ? 'Lưu thay đổi' : 'Tạo việc học'}</button>
      </div>
    </form>
  </section>`;
  return {
    title: t ? 'Sửa việc học' : 'Thêm việc học',
    html,
    mount(root) {
      const form = root.querySelector<HTMLFormElement>('.track-form')!;
      const f = (n: string) => form.elements.namedItem(n) as HTMLInputElement | null;
      root.querySelectorAll<HTMLElement>('[data-tpl]').forEach((b) =>
        b.addEventListener('click', () => {
          const tp = TEMPLATES[b.dataset.tpl!];
          f('name')!.value = tp.name; f('tiny')!.value = tp.tiny; f('plan')!.value = tp.plan; f('target')!.value = String(tp.target);
          form.querySelectorAll<HTMLInputElement>('[name="rest"]').forEach((c) => (c.checked = tp.rest.includes(Number(c.value))));
          f('sprint')!.value = tp.sprint; f('deliverable')!.value = tp.deliverable;
          (form.elements.namedItem('milestones') as HTMLTextAreaElement).value = tp.milestones.join('\n');
        }),
      );
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const err = form.querySelector('.err')!;
        const name = f('name')!.value.trim();
        if (!name) { err.textContent = 'Hãy đặt tên cho việc học.'; f('name')!.focus(); return; }
        const rest = [...form.querySelectorAll<HTMLInputElement>('[name="rest"]:checked')].map((c) => Number(c.value));
        const target = Math.max(1, Math.min(7, Math.round(Number(f('target')!.value) || 4)));
        if (target > 7 - rest.length) { err.textContent = `Với ${rest.length} ngày nghỉ cố định, mục tiêu tối đa là ${7 - rest.length} ngày mỗi tuần.`; return; }
        const track: Track = {
          id: t?.id ?? newId(),
          name,
          color: (form.querySelector<HTMLInputElement>('[name="color"]:checked')?.value) ?? color,
          why: (form.elements.namedItem('why') as HTMLTextAreaElement).value.trim(),
          tinyAction: f('tiny')!.value.trim(),
          plan: f('plan')!.value.trim(),
          weeklyTarget: target,
          restDays: rest,
          nextStep: t?.nextStep ?? '',
          pauses: t?.pauses ?? [],
          archived: t?.archived ?? false,
          createdAt: t?.createdAt ?? d,
          demo: t?.demo,
        };
        let sprint: Sprint | null = null;
        if (!t) {
          const title = f('sprint')!.value.trim();
          const ms = (form.elements.namedItem('milestones') as HTMLTextAreaElement).value.split('\n').map((x) => x.trim()).filter(Boolean);
          if (title || ms.length) {
            const start = f('start')!.value || d;
            const weeks = Number(form.querySelector<HTMLInputElement>('[name="weeks"]:checked')?.value ?? 3);
            sprint = {
              id: newId(), trackId: track.id, title: title || 'Đợt đầu tiên', deliverable: f('deliverable')!.value.trim(), start, end: defaultEnd(start, weeks),
              milestones: ms.slice(0, 12).map((text) => ({ id: newId(), text, done: false })), status: 'active',
            };
          }
        }
        await saveTrack(track);
        if (sprint) await saveSprint(sprint);
        toast(t ? 'Đã lưu thay đổi.' : 'Đã tạo việc học. Bạn có thể làm bước nhỏ đầu tiên ngay hôm nay.');
        location.hash = `#/t/${track.id}`;
      });
    },
  };
}

export function sprintEditor(t: Track, sprintId?: string): View {
  const s = sprintId ? state.sprints.find((x) => x.id === sprintId) : undefined;
  const d = today();
  const start = s?.start ?? d;
  const end = s?.end ?? defaultEnd(d, 3);
  const html = `<section class="editor">
    <a href="#/t/${t.id}" class="back">${esc(t.name)}</a>
    <h1>${s ? 'Sửa đợt học' : 'Đợt học mới'}</h1>
    <form class="sprint-form card" novalidate>
      <label class="field"><span>Tên đợt</span><input name="title" required maxlength="200" value="${esc(s?.title ?? '')}" placeholder="Ví dụ: Helm chart cho app Go"></label>
      <label class="field"><span>Sản phẩm cụ thể ở cuối đợt</span><input name="deliverable" maxlength="500" value="${esc(s?.deliverable ?? '')}" placeholder="Thứ có thể cho người khác xem"></label>
      <div class="grid2">
        <label class="field"><span>Bắt đầu</span><input type="date" name="start" value="${start}"></label>
        <label class="field"><span>Kết thúc</span><input type="date" name="end" value="${end}"></label>
      </div>
      <div class="row gap wrap">${[2, 3, 4].map((w) => `<button type="button" class="chip" data-weeks="${w}">${w} tuần</button>`).join('')}</div>
      <p class="small warn-text len-warn">${esc(lengthWarning(start, end) ?? '')}</p>
      ${s ? '<p class="small muted">Bạn có thể sửa từng mốc ngay trên trang của việc học.</p>' : `<label class="field"><span>Các mốc, mỗi dòng một mốc</span><textarea name="milestones" rows="5" placeholder="3-5 mốc, mỗi mốc ra được một thứ nhìn thấy được"></textarea></label>`}
      <p class="err" role="alert"></p>
      <div class="row gap between wrap">
        <div>${s ? `<button type="button" class="btn ghost danger" data-act="del-sprint" data-id="${s.id}">Xoá đợt học</button>` : ''}</div>
        <button class="btn primary">${s ? 'Lưu thay đổi' : 'Bắt đầu đợt học'}</button>
      </div>
    </form>
  </section>`;
  return {
    title: s ? 'Sửa đợt học' : 'Đợt học mới',
    html,
    mount(root) {
      const form = root.querySelector<HTMLFormElement>('.sprint-form')!;
      const f = (n: string) => form.elements.namedItem(n) as HTMLInputElement;
      const warn = () => { root.querySelector('.len-warn')!.textContent = lengthWarning(f('start').value, f('end').value) ?? ''; };
      form.addEventListener('input', warn);
      root.querySelectorAll<HTMLElement>('[data-weeks]').forEach((b) => b.addEventListener('click', () => { f('end').value = defaultEnd(f('start').value || d, Number(b.dataset.weeks)); warn(); }));
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const err = form.querySelector('.err')!;
        const title = f('title').value.trim();
        const st = f('start').value;
        const en = f('end').value;
        if (!title) { err.textContent = 'Hãy đặt tên cho đợt học.'; return; }
        if (!st || !en || en < st) { err.textContent = 'Ngày kết thúc phải sau ngày bắt đầu.'; return; }
        const ms = s ? s.milestones : (form.elements.namedItem('milestones') as HTMLTextAreaElement).value.split('\n').map((x) => x.trim()).filter(Boolean).slice(0, 12).map((text) => ({ id: newId(), text, done: false }));
        const sprint: Sprint = { ...(s ?? { id: newId(), trackId: t.id, status: 'active' as const }), title, deliverable: f('deliverable').value.trim(), start: st, end: en, milestones: ms } as Sprint;
        if (!s) {
          // One active sprint per track: close the previous one as dropped if it is still open.
          const prev = activeSprint(state.sprints, t.id);
          if (prev) await saveSprint({ ...prev, status: 'dropped', closedOn: d });
        }
        await saveSprint(sprint);
        toast(s ? 'Đã lưu đợt học.' : 'Đã bắt đầu đợt học mới.');
        location.hash = `#/t/${t.id}`;
      });
    },
  };
}

export async function toggleMilestone(sprintId: string, msId: string, done: boolean): Promise<void> {
  const s = state.sprints.find((x) => x.id === sprintId);
  if (!s) return;
  await saveSprint({ ...s, milestones: s.milestones.map((m) => (m.id === msId ? { ...m, done, doneOn: done ? today() : undefined } : m)) });
}

export async function addMilestone(sprintId: string, text: string): Promise<void> {
  const s = state.sprints.find((x) => x.id === sprintId);
  if (!s || !text.trim()) return;
  await saveSprint({ ...s, milestones: [...s.milestones, { id: newId(), text: text.trim().slice(0, 300), done: false }] });
}

export async function removeMilestone(sprintId: string, msId: string): Promise<void> {
  const s = state.sprints.find((x) => x.id === sprintId);
  if (!s) return;
  await saveSprint({ ...s, milestones: s.milestones.filter((m) => m.id !== msId) });
}
