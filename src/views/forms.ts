// Dialogs and forms: log a session, pause a track, finish a sprint.
import { addDays, fmtDay, today } from '../core/dates.js';
import { defaultMinutes, durationChips, loadPrefs, mergePrefs, savePrefs } from '../core/prefs.js';
import { currentlyPaused, momentum, todayState } from '../core/rhythm.js';
import { activeSprint } from '../core/sprint.js';
import type { Evidence, LogEntry, LogKind, Track } from '../core/types.js';
import { clientCenter, queueCelebration } from '../motion.js';
import { ctxFor, getTrack, markMilestone, newId, saveLog, saveSprint, saveTrack, state } from '../state.js';
import { $, esc, imageToDataUrl, isHttpUrl, openModal, toast } from '../ui.js';
import { colorDot } from './parts.js';


function prefsStorage(): { getItem(key: string): string | null; setItem(key: string, value: string): void } | null {
  try { return localStorage; } catch { return null; }
}

function remember(patch: { trackId?: string; kind?: LogKind; minutes?: number }): void {
  const storage = prefsStorage();
  savePrefs(mergePrefs(loadPrefs(storage), patch), storage);
}

export function loggableTracks(includeId?: string): Track[] {
  const d = today();
  return state.tracks.filter((t) => !t.archived && (!currentlyPaused(t, d) || t.id === includeId));
}

function minuteChips(selected: number): string {
  return durationChips(selected)
    .map((m) => `<button type="button" class="chip${m === selected ? ' on' : ''}" data-min="${m}">${m === 0 ? 'Không' : m}</button>`)
    .join('');
}

function syncMinuteChips(root: ParentNode, value: number): void {
  root.querySelectorAll<HTMLElement>('[data-min]').forEach((el) => {
    el.classList.toggle('on', Number(el.dataset.min) === value);
  });
}

function celebrate(track: Track, origin?: { x: number; y: number }): void {
  queueCelebration({ trackId: track.id, fromScore: momentum(ctxFor(track)), origin, color: track.color });
}

function evidenceItem(e: Evidence, i: number): string {
  const body =
    e.kind === 'image'
      ? `<img src="${esc(e.value)}" alt="${esc(e.label || 'ảnh')}">`
      : e.kind === 'link'
        ? `<span class="ev-kind">Link</span><span class="ev-text">${esc(e.label ? e.label + ' - ' : '')}${esc(e.value)}</span>`
        : `<span class="ev-kind">Ghi chú</span><span class="ev-text">${esc(e.value)}</span>`;
  return `<li class="ev-item">${body}<button type="button" class="btn xs danger" data-rm="${i}" aria-label="Bỏ mục này">Bỏ</button></li>`;
}

export function openLogDialog(trackId: string, opts: { logId?: string; kind?: LogKind; day?: string; minutes?: number; note?: string; onSaved?: () => void } = {}): void {
  const existing = opts.logId ? state.logs.find((l) => l.id === opts.logId) : undefined;
  const d = today();
  let track = getTrack(existing?.trackId ?? trackId);
  if (!track) return;
  const evidence: Evidence[] = existing ? existing.evidence.map((e) => ({ ...e })) : [];
  const prefs = loadPrefs(prefsStorage());
  const kind: LogKind = existing?.kind ?? opts.kind ?? prefs.kind;
  const startMinutes = existing ? existing.minutes : (opts.minutes ?? defaultMinutes(prefs, kind));
  const choices = loggableTracks(track.id);

  const msOptions = (t: Track) => {
    const s = activeSprint(state.sprints, t.id);
    if (!s) return '';
    const list = s.milestones.filter((m) => !m.done || m.id === existing?.milestoneId);
    if (!list.length) return '';
    return `<label class="field"><span>Buổi này có hoàn thành milestone nào không?</span><select name="milestone"><option value="">Chưa</option>${list
      .map((m) => `<option value="${s.id}:${m.id}" ${m.id === existing?.milestoneId ? 'selected' : ''}>${esc(m.text)}</option>`)
      .join('')}</select></label>`;
  };

  const dlg = openModal(`<form class="log-form" method="dialog" novalidate>
    <header class="modal-head"><h2>${existing ? 'Chỉnh sửa buổi học' : 'Ghi buổi học'}</h2><button type="button" class="link-btn" data-close>Đóng</button></header>
    <div class="grid2">
      <label class="field"><span>Việc học</span><select name="track">${choices.map((t) => `<option value="${t.id}" ${t.id === track!.id ? 'selected' : ''}>${esc(t.name)}</option>`).join('')}</select></label>
      <label class="field"><span>Ngày</span><input type="date" name="day" value="${existing?.day ?? opts.day ?? d}" max="${d}" required></label>
    </div>
    <fieldset class="seg-field"><legend>Loại</legend>
      <label><input type="radio" name="kind" value="tiny" ${kind === 'tiny' ? 'checked' : ''}><span>Học một chút</span></label>
      <label><input type="radio" name="kind" value="full" ${kind === 'full' ? 'checked' : ''}><span>Buổi học đầy đủ</span></label>
    </fieldset>
    <div class="field"><span>Thời gian (phút, không bắt buộc)</span>
      <div class="row gap wrap"><input type="number" name="minutes" min="0" max="1440" inputmode="numeric" value="${startMinutes || ''}" class="num">
      ${minuteChips(startMinutes)}</div>
    </div>
    <label class="field"><span>Bạn đã làm được gì</span><textarea name="note" rows="2" placeholder="Ví dụ: cài Argo CD, đổi mật khẩu admin">${esc(existing?.note ?? opts.note ?? '')}</textarea></label>
    <div class="ms-slot">${msOptions(track)}</div>
    <div class="field"><span>Thành quả để xem lại (không bắt buộc)</span>
      <ul class="ev-list"></ul>
      <div class="ev-add">
        <div class="row gap wrap"><input type="url" name="evUrl" placeholder="https://github.com/.../commit/..." class="grow"><input type="text" name="evLabel" placeholder="Mô tả ngắn" class="grow"><button type="button" class="btn small" data-ev="link">Thêm link</button></div>
        <div class="row gap wrap"><input type="text" name="evNote" placeholder="Ghi chú: kết quả, điều bạn học được" class="grow"><button type="button" class="btn small" data-ev="note">Thêm ghi chú</button>
        <label class="btn small file-btn">Thêm ảnh<input type="file" accept="image/*" name="evImg" hidden></label></div>
      </div>
    </div>
    <label class="field"><span>Có chỗ nào còn vướng không</span><input type="text" name="blocker" value="${esc(existing?.blocker ?? '')}" placeholder="Để trống nếu không"></label>
    <label class="field"><span>Bước nhỏ tiếp theo</span><input type="text" name="nextStep" value="${esc(track.nextStep)}" placeholder="Ghi lại để lần sau bắt tay vào ngay, kể cả sau nhiều ngày nghỉ"></label>
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
    if (min !== undefined) { field('minutes').value = min === '0' ? '' : min; syncMinuteChips(form, Number(min)); }
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
    if (el.name === 'kind' && !existing) {
      const k = el.value as LogKind;
      const mins = defaultMinutes(loadPrefs(prefsStorage()), k);
      field('minutes').value = mins ? String(mins) : '';
      syncMinuteChips(form, mins);
    }
    if (el.name === 'minutes') syncMinuteChips(form, Number(el.value) || 0);
  });
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const day = field('day').value;
    if (!day || day > d) { err.textContent = 'Hãy chọn một ngày từ hôm nay trở về trước.'; return; }
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
    if (!existing) celebrate(track!, clientCenter(form.querySelector('button[type="submit"]') ?? form));
    remember({ trackId: track!.id, kind: k, minutes: entry.minutes });
    await saveLog(entry);
    if (sprintId && msId) {
      await markMilestone(sprintId, msId, true, day);
    }
    const next = field('nextStep').value.trim();
    if (next !== track!.nextStep) await saveTrack({ ...track!, nextStep: next });
    opts.onSaved?.();
    dlg.close();
    toast(existing ? 'Đã cập nhật buổi học.' : `Đã ghi ${k === 'tiny' ? 'lần học ngắn' : 'buổi học'} ${day === d ? 'hôm nay' : 'ngày ' + fmtDay(day)}.`);
  });
}


export function openQuickLog(preferredId?: string): void {
  const d = today();
  const choices = loggableTracks();
  if (!choices.length) {
    toast('Chưa có topic nào để ghi. Hãy thêm một topic, hoặc mở lại topic đang tạm dừng.');
    return;
  }
  const prefs = loadPrefs(prefsStorage());
  const needed = (t: Track) => {
    const st = todayState(ctxFor(t));
    return st !== 'done' && st !== 'rest' && st !== 'paused';
  };
  let track = choices.find((t) => t.id === preferredId) ?? choices.find((t) => t.id === prefs.trackId) ?? choices.find(needed) ?? choices[0]!;
  let kind: LogKind = prefs.kind;
  let minutes = defaultMinutes(prefs, kind);

  const labelFor = () => (kind === 'tiny' ? 'Lưu lần học ngắn' : 'Lưu buổi học');

  const dlg = openModal(`<form class="quick-form" method="dialog" novalidate>
    <header class="modal-head"><h2>Ghi nhanh</h2><button type="button" class="link-btn" data-close>Đóng</button></header>
    <div class="field"><span>Việc học</span>
      <div class="row gap wrap track-picks">${choices.map((t) => `<button type="button" class="chip${t.id === track.id ? ' on' : ''}" data-pick="${t.id}">${colorDot(t)}${esc(t.name)}</button>`).join('')}</div>
    </div>
    <fieldset class="seg-field"><legend>Loại</legend>
      <label><input type="radio" name="kind" value="tiny" ${kind === 'tiny' ? 'checked' : ''}><span>Học một chút</span></label>
      <label><input type="radio" name="kind" value="full" ${kind === 'full' ? 'checked' : ''}><span>Buổi học đầy đủ</span></label>
    </fieldset>
    <div class="field"><span>Thời gian (phút, không bắt buộc)</span>
      <div class="row gap wrap min-picks">${minuteChips(minutes)}</div>
    </div>
    <label class="field"><span>Bạn đã làm được gì (không bắt buộc)</span><input type="text" name="note" placeholder="Để trống cũng được"></label>
    <p class="small muted quick-hint">Lần sau app sẽ nhớ lựa chọn này. Phím G mở nhanh khung ghi, phím T mở đồng hồ buổi học.</p>
    <footer class="modal-foot">
      <button type="button" class="btn ghost" data-full>Thêm chi tiết</button>
      <button type="submit" class="btn primary save-quick">${labelFor()}</button>
    </footer>
  </form>`, 'quick');

  const form = dlg.querySelector('form')!;
  const saveBtn = () => form.querySelector<HTMLElement>('.save-quick')!;
  const picks = () => form.querySelector('.min-picks')!;

  const refreshMinutes = () => {
    picks().innerHTML = minuteChips(minutes);
  };

  form.addEventListener('click', (e) => {
    const el = (e.target as HTMLElement).closest<HTMLElement>('[data-pick], [data-min], [data-full]');
    if (!el) return;
    if (el.dataset.pick) {
      track = getTrack(el.dataset.pick) ?? track;
      form.querySelectorAll<HTMLElement>('[data-pick]').forEach((b) => b.classList.toggle('on', b.dataset.pick === track.id));
    }
    if (el.dataset.min !== undefined) {
      minutes = Number(el.dataset.min) || 0;
      syncMinuteChips(form, minutes);
    }
    if (el.dataset.full !== undefined) {
      dlg.close();
      openLogDialog(track.id, { kind, minutes, day: d });
    }
  });
  form.addEventListener('change', (e) => {
    const el = e.target as HTMLInputElement;
    if (el.name === 'kind') {
      kind = el.value as LogKind;
      minutes = defaultMinutes(loadPrefs(prefsStorage()), kind);
      refreshMinutes();
      saveBtn().textContent = labelFor();
    }
  });
  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const note = (form.elements.namedItem('note') as HTMLInputElement).value.trim();
    celebrate(track, clientCenter(saveBtn()));
    remember({ trackId: track.id, kind, minutes });
    const entry: LogEntry = {
      id: newId(),
      trackId: track.id,
      day: d,
      kind,
      minutes,
      note: note || (kind === 'tiny' ? track.tinyAction : ''),
      blocker: '',
      evidence: [],
      createdAt: new Date().toISOString(),
    };
    await saveLog(entry);
    dlg.close();
    toast(`Đã ghi ${kind === 'tiny' ? 'lần học ngắn' : 'buổi học'} của hôm nay.`);
  });
}

export function openPauseDialog(t: Track): void {
  const dlg = openModal(`<form method="dialog">
    <header class="modal-head"><h2>Tạm dừng topic "${esc(t.name)}"</h2><button type="button" class="link-btn" data-close>Đóng</button></header>
    <p class="muted">Những ngày tạm dừng không bị tính là bỏ lỡ và không làm giảm độ đều đặn. Bạn có thể quay lại bất cứ lúc nào.</p>
    <label class="field"><span>Lý do (không bắt buộc)</span><input name="note" placeholder="Ví dụ: dồn sức cho việc khác trong tháng này"></label>
    <label class="field"><span>Bước nhỏ nhất để bắt đầu lại</span><input name="next" value="${esc(t.nextStep)}" placeholder="Ví dụ: mở file values.yaml và đọc lại 10 dòng đầu"></label>
    <footer class="modal-foot"><button type="button" class="btn ghost" data-close>Huỷ</button><button type="submit" class="btn primary">Tạm dừng</button></footer>
  </form>`);
  dlg.querySelector('form')!.addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.target as HTMLFormElement;
    const note = (f.elements.namedItem('note') as HTMLInputElement).value.trim();
    const next = (f.elements.namedItem('next') as HTMLInputElement).value.trim();
    await saveTrack({ ...t, nextStep: next, pauses: [...t.pauses, { from: today(), note: note || undefined }] });
    dlg.close();
    toast('Đã tạm dừng. Bước tiếp theo đã được lưu để lần sau bạn bắt tay vào ngay.');
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
  toast(start === d ? 'Chào mừng bạn quay lại. Hôm nay chỉ cần học một chút là đủ.' : `Đã hẹn quay lại vào ngày ${fmtDay(start)}.`);
}

export function openFinishSprint(sprintId: string): void {
  const s = state.sprints.find((x) => x.id === sprintId);
  if (!s) return;
  const done = s.milestones.filter((m) => m.done).length;
  const dlg = openModal(`<form method="dialog">
    <header class="modal-head"><h2>Kết thúc sprint "${esc(s.title)}"</h2><button type="button" class="link-btn" data-close>Đóng</button></header>
    <p class="muted">Bạn đã xong ${done}/${s.milestones.length} milestone. Sản phẩm dự kiến: ${esc(s.deliverable || 'chưa ghi')}</p>
    <fieldset class="seg-field"><legend>Kết quả</legend>
      <label><input type="radio" name="status" value="done" checked><span>Hoàn thành</span></label>
      <label><input type="radio" name="status" value="dropped"><span>Dừng sprint này</span></label>
    </fieldset>
    <label class="field"><span>Nhìn lại: điều gì hiệu quả, lần sau bạn muốn đổi gì</span><textarea name="reflection" rows="3">${esc(s.reflection ?? '')}</textarea></label>
    <footer class="modal-foot"><button type="button" class="btn ghost" data-close>Huỷ</button><button type="submit" class="btn primary">Lưu</button></footer>
  </form>`);
  dlg.querySelector('form')!.addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.target as HTMLFormElement;
    const status = (f.querySelector<HTMLInputElement>('[name="status"]:checked')?.value ?? 'done') as 'done' | 'dropped';
    await saveSprint({ ...s, status, closedOn: today(), reflection: (f.elements.namedItem('reflection') as HTMLTextAreaElement).value.trim() || undefined });
    dlg.close();
    const nextPlanned = state.sprints.some((x) => x.trackId === s.trackId && x.status === 'planned');
    toast(nextPlanned ? 'Đã kết thúc sprint. Sprint kế tiếp trong kế hoạch đang chờ bạn bắt đầu.' : status === 'done' ? 'Đã kết thúc sprint. Hãy đặt sprint tiếp theo khi bạn sẵn sàng.' : 'Đã dừng sprint. Không sao cả, lần sau hãy đặt một sprint nhỏ hơn.');
    location.hash = `#/t/${s.trackId}`;
  });
}

export function field(form: HTMLElement, name: string): HTMLInputElement {
  return $(`[name="${name}"]`, form) as HTMLInputElement;
}
