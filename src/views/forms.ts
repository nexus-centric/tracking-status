// Dialogs and forms: log a session, pause a track, finish a sprint.
import { addDays, fmtDay, today } from '../core/dates.js';
import { currentlyPaused } from '../core/rhythm.js';
import { activeSprint } from '../core/sprint.js';
import type { Evidence, LogEntry, LogKind, Track } from '../core/types.js';
import { getTrack, newId, saveLog, saveSprint, saveTrack, state } from '../state.js';
import { $, esc, imageToDataUrl, isHttpUrl, openModal, toast } from '../ui.js';

function evidenceItem(e: Evidence, i: number): string {
  const body =
    e.kind === 'image'
      ? `<img src="${esc(e.value)}" alt="${esc(e.label || 'ảnh')}">`
      : e.kind === 'link'
        ? `<span class="ev-kind">Link</span><span class="ev-text">${esc(e.label ? e.label + ' - ' : '')}${esc(e.value)}</span>`
        : `<span class="ev-kind">Ghi chú</span><span class="ev-text">${esc(e.value)}</span>`;
  return `<li class="ev-item">${body}<button type="button" class="link-btn" data-rm="${i}" aria-label="Bỏ bằng chứng">Bỏ</button></li>`;
}

export function openLogDialog(trackId: string, opts: { logId?: string; kind?: LogKind; day?: string } = {}): void {
  const existing = opts.logId ? state.logs.find((l) => l.id === opts.logId) : undefined;
  const d = today();
  let track = getTrack(existing?.trackId ?? trackId);
  if (!track) return;
  const evidence: Evidence[] = existing ? existing.evidence.map((e) => ({ ...e })) : [];
  const kind: LogKind = existing?.kind ?? opts.kind ?? 'full';
  const choices = state.tracks.filter((t) => !t.archived && (!currentlyPaused(t, d) || t.id === track!.id));

  const msOptions = (t: Track) => {
    const s = activeSprint(state.sprints, t.id);
    if (!s) return '';
    const list = s.milestones.filter((m) => !m.done || m.id === existing?.milestoneId);
    if (!list.length) return '';
    return `<label class="field"><span>Xong một mốc?</span><select name="milestone"><option value="">Không</option>${list
      .map((m) => `<option value="${s.id}:${m.id}" ${m.id === existing?.milestoneId ? 'selected' : ''}>${esc(m.text)}</option>`)
      .join('')}</select></label>`;
  };

  const dlg = openModal(`<form class="log-form" method="dialog" novalidate>
    <header class="modal-head"><h2>${existing ? 'Sửa buổi học' : 'Ghi buổi học'}</h2><button type="button" class="link-btn" data-close>Đóng</button></header>
    <div class="grid2">
      <label class="field"><span>Việc học</span><select name="track">${choices.map((t) => `<option value="${t.id}" ${t.id === track!.id ? 'selected' : ''}>${esc(t.name)}</option>`).join('')}</select></label>
      <label class="field"><span>Ngày</span><input type="date" name="day" value="${existing?.day ?? opts.day ?? d}" max="${d}" required></label>
    </div>
    <fieldset class="seg-field"><legend>Loại</legend>
      <label><input type="radio" name="kind" value="tiny" ${kind === 'tiny' ? 'checked' : ''}><span>Bước nhỏ</span></label>
      <label><input type="radio" name="kind" value="full" ${kind === 'full' ? 'checked' : ''}><span>Phiên đầy đủ</span></label>
    </fieldset>
    <div class="field"><span>Thời gian (phút, không bắt buộc)</span>
      <div class="row gap wrap"><input type="number" name="minutes" min="0" max="1440" inputmode="numeric" value="${existing ? existing.minutes || '' : kind === 'tiny' ? 10 : 30}" class="num">
      ${[10, 25, 45, 60, 90].map((m) => `<button type="button" class="chip" data-min="${m}">${m}</button>`).join('')}</div>
    </div>
    <label class="field"><span>Đã làm gì</span><textarea name="note" rows="2" placeholder="Ví dụ: cài Argo CD, đổi mật khẩu admin">${esc(existing?.note ?? '')}</textarea></label>
    <div class="ms-slot">${msOptions(track)}</div>
    <div class="field"><span>Bằng chứng (không bắt buộc)</span>
      <ul class="ev-list"></ul>
      <div class="ev-add">
        <div class="row gap wrap"><input type="url" name="evUrl" placeholder="https://github.com/.../commit/..." class="grow"><input type="text" name="evLabel" placeholder="Mô tả ngắn" class="grow"><button type="button" class="btn small" data-ev="link">Thêm link</button></div>
        <div class="row gap wrap"><input type="text" name="evNote" placeholder="Ghi chú: kết quả, điều học được" class="grow"><button type="button" class="btn small" data-ev="note">Thêm ghi chú</button>
        <label class="btn small file-btn">Thêm ảnh<input type="file" accept="image/*" name="evImg" hidden></label></div>
      </div>
    </div>
    <label class="field"><span>Có gì vướng không</span><input type="text" name="blocker" value="${esc(existing?.blocker ?? '')}" placeholder="Để trống nếu không"></label>
    <label class="field"><span>Bước nhỏ tiếp theo</span><input type="text" name="nextStep" value="${esc(track.nextStep)}" placeholder="Ghi lại để lần sau vào việc ngay, kể cả sau nhiều ngày nghỉ"></label>
    <p class="err small" role="alert"></p>
    <footer class="modal-foot"><button type="button" class="btn ghost" data-close>Huỷ</button><button type="submit" class="btn primary">Lưu</button></footer>
  </form>`);

  const form = dlg.querySelector('form')!;
  const list = form.querySelector('.ev-list')!;
  const err = form.querySelector('.err')!;
  const renderEv = () => {
    list.innerHTML = evidence.map(evidenceItem).join('');
  };
  renderEv();
  const field = <T extends HTMLElement = HTMLInputElement>(n: string) => form.querySelector<T>(`[name="${n}"]`)!;

  form.addEventListener('click', (e) => {
    const el = e.target as HTMLElement;
    const min = el.closest<HTMLElement>('[data-min]')?.dataset.min;
    if (min) field('minutes').value = min;
    const rm = el.closest<HTMLElement>('[data-rm]')?.dataset.rm;
    if (rm !== undefined) { evidence.splice(Number(rm), 1); renderEv(); }
    const ev = el.closest<HTMLElement>('[data-ev]')?.dataset.ev;
    if (ev === 'link') {
      const url = field('evUrl').value.trim();
      if (!isHttpUrl(url)) { err.textContent = 'Link cần bắt đầu bằng http:// hoặc https://'; return; }
      evidence.push({ kind: 'link', value: url, label: field('evLabel').value.trim() || undefined });
      field('evUrl').value = ''; field('evLabel').value = ''; err.textContent = ''; renderEv();
    } else if (ev === 'note') {
      const v = field('evNote').value.trim();
      if (!v) return;
      evidence.push({ kind: 'note', value: v });
      field('evNote').value = ''; renderEv();
    }
  });
  form.addEventListener('change', async (e) => {
    const el = e.target as HTMLInputElement;
    if (el.name === 'evImg' && el.files?.[0]) {
      try {
        const file = el.files[0];
        evidence.push({ kind: 'image', value: await imageToDataUrl(file), label: file.name.replace(/\.[^.]+$/, '') });
        renderEv();
      } catch (x) { err.textContent = (x as Error).message; }
      el.value = '';
    }
    if (el.name === 'track') {
      track = getTrack(el.value)!;
      form.querySelector('.ms-slot')!.innerHTML = msOptions(track);
      field('nextStep').value = track.nextStep;
    }
    if (el.name === 'kind' && !existing) field('minutes').value = el.value === 'tiny' ? '10' : '30';
  });
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const day = field('day').value;
    if (!day || day > d) { err.textContent = 'Chọn một ngày từ hôm nay trở về trước.'; return; }
    // Keep a pending link the user typed but did not add.
    const pending = field('evUrl').value.trim();
    if (pending) {
      if (!isHttpUrl(pending)) { err.textContent = 'Link cần bắt đầu bằng http:// hoặc https://'; return; }
      evidence.push({ kind: 'link', value: pending, label: field('evLabel').value.trim() || undefined });
    }
    const pendingNote = field('evNote').value.trim();
    if (pendingNote) evidence.push({ kind: 'note', value: pendingNote });
    const ms = field<HTMLSelectElement>('milestone')?.value ?? '';
    const [sprintId, msId] = ms ? ms.split(':') : ['', ''];
    const k = (form.querySelector<HTMLInputElement>('[name="kind"]:checked')?.value ?? 'full') as LogKind;
    const entry: LogEntry = {
      id: existing?.id ?? newId(),
      trackId: track!.id,
      day,
      kind: k,
      minutes: Math.max(0, Math.min(1440, Math.round(Number(field('minutes').value) || 0))),
      note: field<HTMLTextAreaElement>('note').value.trim(),
      blocker: field('blocker').value.trim(),
      milestoneId: msId || existing?.milestoneId,
      evidence,
      createdAt: existing?.createdAt ?? new Date().toISOString(),
      demo: existing?.demo,
    };
    await saveLog(entry);
    if (sprintId && msId) {
      const s = state.sprints.find((x) => x.id === sprintId);
      if (s) await saveSprint({ ...s, milestones: s.milestones.map((m) => (m.id === msId ? { ...m, done: true, doneOn: m.doneOn ?? day } : m)) });
    }
    const next = field('nextStep').value.trim();
    if (next !== track!.nextStep) await saveTrack({ ...track!, nextStep: next });
    dlg.close();
    toast(existing ? 'Đã cập nhật buổi học.' : `Đã ghi ${k === 'tiny' ? 'bước nhỏ' : 'buổi học'} ${day === d ? 'hôm nay' : fmtDay(day)}.`);
  });
}

export function openPauseDialog(t: Track): void {
  const dlg = openModal(`<form method="dialog">
    <header class="modal-head"><h2>Tạm dừng "${esc(t.name)}"</h2><button type="button" class="link-btn" data-close>Đóng</button></header>
    <p class="muted">Những ngày tạm dừng không tính là lỡ và không làm giảm điểm nhịp. Có thể quay lại bất cứ lúc nào.</p>
    <label class="field"><span>Lý do (không bắt buộc)</span><input name="note" placeholder="Ví dụ: dồn sức cho việc khác trong tháng này"></label>
    <label class="field"><span>Bước nhỏ nhất khi quay lại</span><input name="next" value="${esc(t.nextStep)}" placeholder="Ví dụ: mở file values.yaml và đọc lại 10 dòng đầu"></label>
    <footer class="modal-foot"><button type="button" class="btn ghost" data-close>Huỷ</button><button type="submit" class="btn primary">Tạm dừng</button></footer>
  </form>`);
  dlg.querySelector('form')!.addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.target as HTMLFormElement;
    const note = (f.elements.namedItem('note') as HTMLInputElement).value.trim();
    const next = (f.elements.namedItem('next') as HTMLInputElement).value.trim();
    await saveTrack({ ...t, nextStep: next, pauses: [...t.pauses, { from: today(), note: note || undefined }] });
    dlg.close();
    toast('Đã tạm dừng. Bước tiếp theo đã được lưu để lần sau vào việc ngay.');
  });
}

/** Ends the open pause. With `day`, the track stays paused until the day before. */
export async function resumeTrack(t: Track, day?: string): Promise<void> {
  const d = today();
  const start = day && day > d ? day : d;
  const pauses = t.pauses
    .map((p) => (p.to === undefined || p.to >= d ? { ...p, to: addDays(start, -1) } : p))
    .filter((p) => p.to === undefined || p.to >= p.from);
  await saveTrack({ ...t, pauses });
  toast(start === d ? 'Chào mừng quay lại. Hôm nay chỉ cần một bước nhỏ.' : `Đã hẹn quay lại ngày ${fmtDay(start)}.`);
}

export function openFinishSprint(sprintId: string): void {
  const s = state.sprints.find((x) => x.id === sprintId);
  if (!s) return;
  const done = s.milestones.filter((m) => m.done).length;
  const dlg = openModal(`<form method="dialog">
    <header class="modal-head"><h2>Kết thúc đợt "${esc(s.title)}"</h2><button type="button" class="link-btn" data-close>Đóng</button></header>
    <p class="muted">Đã xong ${done}/${s.milestones.length} mốc. Sản phẩm dự kiến: ${esc(s.deliverable || 'chưa ghi')}</p>
    <fieldset class="seg-field"><legend>Kết quả</legend>
      <label><input type="radio" name="status" value="done" checked><span>Hoàn thành</span></label>
      <label><input type="radio" name="status" value="dropped"><span>Dừng đợt này</span></label>
    </fieldset>
    <label class="field"><span>Nhìn lại: điều gì hiệu quả, lần sau đổi gì</span><textarea name="reflection" rows="3">${esc(s.reflection ?? '')}</textarea></label>
    <footer class="modal-foot"><button type="button" class="btn ghost" data-close>Huỷ</button><button type="submit" class="btn primary">Lưu</button></footer>
  </form>`);
  dlg.querySelector('form')!.addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.target as HTMLFormElement;
    const status = (f.querySelector<HTMLInputElement>('[name="status"]:checked')?.value ?? 'done') as 'done' | 'dropped';
    await saveSprint({ ...s, status, closedOn: today(), reflection: (f.elements.namedItem('reflection') as HTMLTextAreaElement).value.trim() || undefined });
    dlg.close();
    toast(status === 'done' ? 'Đã đóng đợt. Đặt đợt tiếp theo khi bạn sẵn sàng.' : 'Đã dừng đợt. Không sao, đặt đợt nhỏ hơn lần sau.');
    location.hash = `#/t/${s.trackId}`;
  });
}

export function field(form: HTMLElement, name: string): HTMLInputElement {
  return $(`[name="${name}"]`, form) as HTMLInputElement;
}
