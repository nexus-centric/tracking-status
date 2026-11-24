// Study session timer page, the floating timer dock, and the save sheet shown when a session ends.
import { fmtDay, today } from '../core/dates.js';
import { fmtMinutes } from '../core/format.js';
import { formatClock, minutesToLog, normalizePomodoro, suggestedKind, viewAt, type TimerMode, type TimerSession } from '../core/timer.js';
import type { LogEntry, LogKind } from '../core/types.js';
import * as timer from '../session.js';
import { getTrack, newId, saveLog, state } from '../state.js';
import { esc, openModal, toast } from '../ui.js';
import { loggableTracks, openLogDialog } from './forms.js';
import { colorDot } from './parts.js';
import type { View } from './track.js';

const MODE_LABEL: Record<TimerMode, string> = { pomodoro: 'Pomodoro', countdown: 'Đếm ngược', stopwatch: 'Bấm giờ tự do' };
const MODE_HINT: Record<TimerMode, string> = {
  pomodoro: 'Tập trung và nghỉ xen kẽ, sau vài khoảng tập trung thì nghỉ dài. Chỉ thời gian tập trung được ghi vào buổi học.',
  countdown: 'Đặt trước thời lượng, đồng hồ báo khi đủ. Hợp với những ngày chỉ có 15 đến 30 phút.',
  stopwatch: 'Đếm lên từ 0, dừng khi bạn xong. Hợp với buổi học không đoán trước được độ dài.',
};
const PHASE_LABEL = { focus: 'Đang tập trung', break: 'Nghỉ ngắn', long: 'Nghỉ dài' } as const;
const TARGETS = [15, 25, 45, 60, 90];
const PRESETS: [string, { focus: number; brk: number; long: number; every: number }][] = [
  ['25 / 5', { focus: 25, brk: 5, long: 20, every: 4 }],
  ['50 / 10', { focus: 50, brk: 10, long: 20, every: 3 }],
  ['15 / 3', { focus: 15, brk: 3, long: 10, every: 4 }],
];

const RING_R = 100;

function ring(): string {
  return `<svg class="tm-ring" viewBox="0 0 240 240" aria-hidden="true">
    <defs>
      <linearGradient id="tmGrad" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="var(--flow-a)"/><stop offset=".55" stop-color="var(--flow-b)"/><stop offset="1" stop-color="var(--flow-c)"/></linearGradient>
    </defs>
    <circle class="tm-track" cx="120" cy="120" r="${RING_R}" />
    <circle class="tm-ticks" cx="120" cy="120" r="${RING_R + 12}" pathLength="60" />
    <circle class="tm-progress" cx="120" cy="120" r="${RING_R}" pathLength="100" stroke-dasharray="0 100" transform="rotate(-90 120 120)" />
    <g class="tm-comet"><circle cx="120" cy="120" r="${RING_R}" pathLength="100" stroke-dasharray="7 93" transform="rotate(-90 120 120)" /></g>
  </svg>`;
}

function subline(s: TimerSession): string {
  const v = viewAt(s, Date.now());
  if (s.status === 'stopped') return `Đã dừng · ${fmtMinutes(minutesToLog(s, Date.now())) || 'dưới 1 phút'}`;
  const paused = s.status === 'paused' ? 'Tạm dừng · ' : '';
  if (s.mode === 'pomodoro' && v.phase) return `${paused}${PHASE_LABEL[v.phase.kind]} · khoảng ${v.phase.focusBefore + (v.phase.kind === 'focus' ? 1 : 0)}`;
  if (s.mode === 'countdown') return v.finished ? 'Đã đủ thời gian' : `${paused}Còn lại trong ${s.targetMin} phút`;
  return `${paused}Đã học`;
}

/** Updates the live parts of the clock without re-rendering the page. */
export function paintTimer(root: ParentNode): void {
  const s = timer.getSession();
  const face = root.querySelector<HTMLElement>('.tm-face');
  if (face && s) {
    const v = viewAt(s, Date.now());
    face.querySelector('.tm-time')!.textContent = formatClock(v.displayMs);
    face.querySelector('.tm-sub')!.textContent = subline(s);
    face.querySelector('.tm-progress')!.setAttribute('stroke-dasharray', `${(Math.min(1, v.progress) * 100).toFixed(2)} 100`);
    face.dataset.status = s.status;
    face.dataset.phase = v.phase?.kind ?? (v.finished ? 'done' : 'focus');
    const fm = root.querySelector('[data-focus-min]');
    if (fm) fm.textContent = fmtMinutes(minutesToLog(s, Date.now())) || 'dưới 1 phút';
  }
  const dock = document.querySelector<HTMLElement>('.timer-dock');
  if (dock) {
    const onTimerPage = location.hash.startsWith('#/timer');
    dock.hidden = !s || onTimerPage;
    if (s) {
      const v = viewAt(s, Date.now());
      const t = getTrack(s.trackId);
      dock.dataset.status = s.status;
      dock.style.setProperty('--c', t?.color ?? 'var(--accent)');
      dock.querySelector('.td-time')!.textContent = formatClock(v.displayMs);
      dock.querySelector('.td-name')!.textContent = s.status === 'stopped' ? 'Chưa lưu buổi học' : t?.name ?? 'Buổi học';
    }
  }
}

export function timerDockHtml(): string {
  return `<a class="timer-dock" href="#/timer" hidden aria-label="Mở đồng hồ buổi học"><span class="td-dot"></span><span class="td-time">00:00</span><span class="td-name"></span></a>`;
}

function setupCard(preferredId: string | null): string {
  const p = timer.getTimerPrefs();
  const tracks = loggableTracks();
  const sel = tracks.find((t) => t.id === preferredId) ?? tracks.find((t) => t.id === p.trackId) ?? tracks[0];
  if (!sel) return `<section class="card"><h2>Chưa có topic nào</h2><p class="muted">Đồng hồ ghi thời gian vào một topic. Hãy thêm một topic trước.</p><a class="btn primary" href="#/new">Thêm topic học mới</a></section>`;
  const mode = p.mode;
  return `<section class="card tm-setup">
    <div class="field"><span>Học việc gì</span>
      <div class="row gap wrap">${tracks.map((t) => `<button type="button" class="chip${t.id === sel.id ? ' on' : ''}" data-tm-track="${t.id}">${colorDot(t)}${esc(t.name)}</button>`).join('')}</div>
    </div>
    <div class="field"><span>Cách bấm giờ</span>
      <div class="seg-inline">${(['pomodoro', 'countdown', 'stopwatch'] as TimerMode[]).map((m) => `<label><input type="radio" name="tm-mode" value="${m}" ${m === mode ? 'checked' : ''}><span>${MODE_LABEL[m]}</span></label>`).join('')}</div>
      <p class="small muted tm-hint">${MODE_HINT[mode]}</p>
    </div>
    <div class="field tm-opt" data-for="countdown" ${mode === 'countdown' ? '' : 'hidden'}><span>Thời lượng</span>
      <div class="row gap wrap">${TARGETS.map((m) => `<button type="button" class="chip${m === p.targetMin ? ' on' : ''}" data-tm-target="${m}">${m} phút</button>`).join('')}
      <input type="number" class="num" min="1" max="600" value="${p.targetMin}" name="tm-target" aria-label="Số phút"></div>
    </div>
    <div class="field tm-opt" data-for="pomodoro" ${mode === 'pomodoro' ? '' : 'hidden'}><span>Thời gian tập trung và nghỉ (phút)</span>
      <div class="row gap wrap">${PRESETS.map(([l, v]) => `<button type="button" class="chip${v.focus === p.pomo.focus && v.brk === p.pomo.brk ? ' on' : ''}" data-tm-preset='${JSON.stringify(v)}'>${l}</button>`).join('')}</div>
      <div class="pomo-grid">
        <label><span>Tập trung</span><input type="number" class="num" name="pomo-focus" min="1" max="180" value="${p.pomo.focus}"></label>
        <label><span>Nghỉ ngắn</span><input type="number" class="num" name="pomo-brk" min="1" max="60" value="${p.pomo.brk}"></label>
        <label><span>Nghỉ dài</span><input type="number" class="num" name="pomo-long" min="1" max="90" value="${p.pomo.long}"></label>
        <label><span>Nghỉ dài sau</span><input type="number" class="num" name="pomo-every" min="1" max="12" value="${p.pomo.every}"></label>
      </div>
    </div>
    <button class="btn primary big" data-tm="start" data-id="${sel.id}">Bắt đầu buổi học</button>
  </section>`;
}

function optionsCard(): string {
  const p = timer.getTimerPrefs();
  const n = timer.notificationState();
  return `<section class="card tm-options">
    <h2>Khi hết giờ</h2>
    <label class="toggle"><input type="checkbox" data-tm-pref="sound" ${p.sound ? 'checked' : ''}><span>Phát tiếng chuông ngắn</span></label>
    <label class="toggle"><input type="checkbox" data-tm-pref="wakeLock" ${p.wakeLock ? 'checked' : ''} ${timer.wakeLockSupported() ? '' : 'disabled'}><span>Giữ màn hình sáng khi đang học${timer.wakeLockSupported() ? '' : ' (trình duyệt này không hỗ trợ)'}</span></label>
    <div class="row gap wrap notif-row">${
      n === 'granted' ? '<span class="small ok-text">Đã bật thông báo của trình duyệt.</span>'
      : n === 'denied' ? '<span class="small muted">Thông báo đang bị chặn. Có thể bật lại trong cài đặt của trình duyệt.</span>'
      : n === 'unsupported' ? '<span class="small muted">Trình duyệt này không hỗ trợ thông báo.</span>'
      : '<button class="btn small" data-tm="notify">Bật thông báo khi hết giờ</button>'
    }</div>
    <p class="small muted">Đồng hồ tính theo giờ thực của máy, nên tải lại trang hay để tab ngủ cũng không lệch. Khi tab bị ẩn, trình duyệt có thể báo trễ vài giây đến khoảng một phút.</p>
  </section>`;
}

function activeView(s: TimerSession): string {
  const t = getTrack(s.trackId);
  const started = new Date(s.startedAt);
  const hhmm = `${String(started.getHours()).padStart(2, '0')}:${String(started.getMinutes()).padStart(2, '0')}`;
  const controls =
    s.status === 'running'
      ? `<button class="btn big" data-tm="pause">Tạm dừng</button><button class="btn primary big" data-tm="stop">Dừng và lưu</button>`
      : s.status === 'paused'
        ? `<button class="btn primary big" data-tm="resume">Học tiếp</button><button class="btn big" data-tm="stop">Dừng và lưu</button>`
        : `<button class="btn primary big" data-tm="save">Lưu buổi học</button><button class="btn big" data-tm="resume">Học tiếp</button>`;
  return `<section class="card tm-info" style="--c:${esc(t?.color ?? 'var(--accent)')}">
    <p class="eyebrow">Buổi học đang mở</p>
    <h2>${t ? colorDot(t) + esc(t.name) : 'Việc học đã bị xoá'}</h2>
    <dl class="tm-facts">
      <div><dt>Cách bấm giờ</dt><dd>${MODE_LABEL[s.mode]}${s.mode === 'pomodoro' ? ` ${s.pomo.focus}/${s.pomo.brk}` : s.mode === 'countdown' ? ` ${s.targetMin} phút` : ''}</dd></div>
      <div><dt>Bắt đầu lúc</dt><dd>${hhmm}${s.day !== today() ? `, ${fmtDay(s.day)}` : ''}</dd></div>
      <div><dt>Sẽ ghi vào buổi học</dt><dd data-focus-min>${fmtMinutes(minutesToLog(s, Date.now())) || 'dưới 1 phút'}</dd></div>
    </dl>
    ${s.mode === 'pomodoro' ? '<p class="small muted">Thời gian nghỉ không được tính vào buổi học.</p>' : ''}
    <div class="row gap wrap tm-controls">${controls}</div>
    <button class="btn small ghost danger" data-tm="discard">Bỏ buổi này, không lưu</button>
  </section>`;
}

export function timerView(params: URLSearchParams): View {
  const s = timer.getSession();
  const todayMin = state.logs.filter((l) => l.day === today()).reduce((a, l) => a + l.minutes, 0);
  const t = s ? getTrack(s.trackId) : undefined;
  const html = `<section class="week-head">
    <div><p class="eyebrow">Đồng hồ buổi học</p><h1>${s ? (s.status === 'stopped' ? 'Buổi học đã dừng, chờ lưu' : `Đang học: ${esc(t?.name ?? '')}`) : 'Bắt đầu buổi học hôm nay'}</h1>
    <p class="muted">Hôm nay đã ghi ${fmtMinutes(todayMin) || '0 phút'}. Khi dừng, đồng hồ điền sẵn một buổi học, giống như khi bạn ghi nhanh.</p></div>
  </section>
  <section class="tm-layout">
    <div class="card tm-clock">
      <div class="tm-face" data-status="${s?.status ?? 'idle'}" data-phase="focus">
        ${ring()}
        <div class="tm-readout"><span class="tm-time">${s ? formatClock(viewAt(s, Date.now()).displayMs) : formatClock((timer.getTimerPrefs().mode === 'countdown' ? timer.getTimerPrefs().targetMin : timer.getTimerPrefs().mode === 'pomodoro' ? timer.getTimerPrefs().pomo.focus : 0) * 60_000)}</span><span class="tm-sub">${s ? '' : 'Sẵn sàng'}</span></div>
      </div>
    </div>
    <div class="tm-side">${s ? activeView(s) : setupCard(params.get('t'))}${optionsCard()}</div>
  </section>`;
  return {
    title: 'Đồng hồ buổi học',
    html,
    mount(root) {
      paintTimer(root);
      const setup = root.querySelector<HTMLElement>('.tm-setup');
      if (!setup) return;
      const num = (n: string) => Number(setup.querySelector<HTMLInputElement>(`[name="${n}"]`)?.value);
      const readPomo = () => normalizePomodoro({ focus: num('pomo-focus'), brk: num('pomo-brk'), long: num('pomo-long'), every: num('pomo-every') });
      const preview = () => {
        const p = timer.getTimerPrefs();
        const mins = p.mode === 'countdown' ? p.targetMin : p.mode === 'pomodoro' ? p.pomo.focus : 0;
        root.querySelector('.tm-time')!.textContent = formatClock(mins * 60_000);
      };
      setup.addEventListener('click', (e) => {
        const el = (e.target as HTMLElement).closest<HTMLElement>('[data-tm-track], [data-tm-target], [data-tm-preset]');
        if (!el) return;
        if (el.dataset.tmTrack) {
          timer.setTimerPrefs({ trackId: el.dataset.tmTrack });
          setup.querySelectorAll<HTMLElement>('[data-tm-track]').forEach((b) => b.classList.toggle('on', b === el));
          setup.querySelector<HTMLElement>('[data-tm="start"]')!.dataset.id = el.dataset.tmTrack;
        } else if (el.dataset.tmTarget) {
          const m = Number(el.dataset.tmTarget);
          timer.setTimerPrefs({ targetMin: m });
          setup.querySelector<HTMLInputElement>('[name="tm-target"]')!.value = String(m);
          setup.querySelectorAll<HTMLElement>('[data-tm-target]').forEach((b) => b.classList.toggle('on', b === el));
        } else if (el.dataset.tmPreset) {
          const v = normalizePomodoro(JSON.parse(el.dataset.tmPreset));
          timer.setTimerPrefs({ pomo: v });
          (['focus', 'brk', 'long', 'every'] as const).forEach((k) => { setup.querySelector<HTMLInputElement>(`[name="pomo-${k}"]`)!.value = String(v[k]); });
          setup.querySelectorAll<HTMLElement>('[data-tm-preset]').forEach((b) => b.classList.toggle('on', b === el));
        }
        preview();
      });
      setup.addEventListener('change', (e) => {
        const el = e.target as HTMLInputElement;
        if (el.name === 'tm-mode') {
          const mode = el.value as TimerMode;
          timer.setTimerPrefs({ mode });
          setup.querySelectorAll<HTMLElement>('.tm-opt').forEach((o) => { o.hidden = o.dataset.for !== mode; });
          setup.querySelector('.tm-hint')!.textContent = MODE_HINT[mode];
        } else if (el.name === 'tm-target') {
          timer.setTimerPrefs({ targetMin: Math.max(1, Math.min(600, Math.round(Number(el.value) || 25))) });
          setup.querySelectorAll<HTMLElement>('[data-tm-target]').forEach((b) => b.classList.toggle('on', Number(b.dataset.tmTarget) === timer.getTimerPrefs().targetMin));
        } else if (el.name.startsWith('pomo-')) {
          timer.setTimerPrefs({ pomo: readPomo() });
          setup.querySelectorAll<HTMLElement>('[data-tm-preset]').forEach((b) => b.classList.remove('on'));
        }
        preview();
      });
    },
  };
}

/** Handles data-tm actions from anywhere in the app. Returns true when handled. */
export async function handleTimerAction(el: HTMLElement): Promise<boolean> {
  const act = el.dataset.tm;
  if (!act) return false;
  const s = timer.getSession();
  switch (act) {
    case 'start': {
      const p = timer.getTimerPrefs();
      const id = el.dataset.id ?? p.trackId;
      if (!getTrack(id)) { toast('Chọn một topic trước.'); return true; }
      timer.setTimerPrefs({ trackId: id });
      timer.start({ mode: p.mode, trackId: id, targetMin: p.targetMin });
      return true;
    }
    case 'quick-start': {
      // From a track card: start straight away with the last-used mode.
      const p = timer.getTimerPrefs();
      const id = el.dataset.id ?? '';
      if (s) { location.hash = '#/timer'; return true; }
      timer.setTimerPrefs({ trackId: id });
      timer.start({ mode: p.mode, trackId: id, targetMin: p.targetMin });
      location.hash = '#/timer';
      return true;
    }
    case 'pause': timer.pause(); return true;
    case 'resume': timer.resume(); return true;
    case 'stop': timer.stop(); openSaveSheet(); return true;
    case 'save': openSaveSheet(); return true;
    case 'discard':
      if (s && confirm('Bỏ buổi học này? Thời gian đã bấm sẽ không được lưu.')) { timer.clear(); toast('Đã bỏ buổi học.'); }
      return true;
    case 'notify': {
      const r = await timer.askNotifications();
      toast(r === 'granted' ? 'Đã bật thông báo.' : 'Chưa bật được thông báo.');
      location.hash.startsWith('#/timer') && window.dispatchEvent(new HashChangeEvent('hashchange'));
      return true;
    }
  }
  return false;
}

/** The sheet shown after stopping: pre-filled with the session, saves the same LogEntry type as quick log. */
export function openSaveSheet(): void {
  const s = timer.getSession();
  if (!s) return;
  const minutes = minutesToLog(s, Date.now());
  let kind: LogKind = suggestedKind(minutes);
  const tracks = loggableTracks(s.trackId);
  let trackId = getTrack(s.trackId) ? s.trackId : tracks[0]?.id ?? '';
  if (!trackId) { toast('Không còn topic nào để ghi buổi này.'); return; }
  const dlg = openModal(`<form class="quick-form" method="dialog" novalidate>
    <header class="modal-head"><h2>Lưu buổi học</h2><button type="button" class="link-btn" data-close>Để sau</button></header>
    <p class="muted small">${MODE_LABEL[s.mode]} · ${s.day === today() ? 'hôm nay' : fmtDay(s.day)}${s.mode === 'pomodoro' ? ' · chỉ tính thời gian tập trung' : ''}</p>
    <div class="field"><span>Việc học</span><div class="row gap wrap">${tracks.map((t) => `<button type="button" class="chip${t.id === trackId ? ' on' : ''}" data-pick="${t.id}">${colorDot(t)}${esc(t.name)}</button>`).join('')}</div></div>
    <div class="grid2">
      <label class="field"><span>Thời gian (phút)</span><input type="number" name="minutes" min="0" max="1440" class="num" value="${minutes}"></label>
      <fieldset class="seg-field"><legend>Loại</legend>
        <label><input type="radio" name="kind" value="tiny" ${kind === 'tiny' ? 'checked' : ''}><span>Bước nhỏ</span></label>
        <label><input type="radio" name="kind" value="full" ${kind === 'full' ? 'checked' : ''}><span>Buổi học đầy đủ</span></label>
      </fieldset>
    </div>
    <label class="field"><span>Đã làm được gì (không bắt buộc)</span><input type="text" name="note" placeholder="Một dòng là đủ"></label>
    <footer class="modal-foot">
      <button type="button" class="btn ghost" data-more>Thêm chi tiết</button>
      <button type="submit" class="btn primary">Lưu buổi học</button>
    </footer>
  </form>`, 'quick');
  const form = dlg.querySelector('form')!;
  const read = () => ({
    minutes: Math.max(0, Math.min(1440, Math.round(Number((form.elements.namedItem('minutes') as HTMLInputElement).value) || 0))),
    note: (form.elements.namedItem('note') as HTMLInputElement).value.trim(),
    kind: ((form.querySelector<HTMLInputElement>('[name="kind"]:checked')?.value ?? kind) as LogKind),
  });
  form.addEventListener('click', (e) => {
    const el = (e.target as HTMLElement).closest<HTMLElement>('[data-pick], [data-more]');
    if (!el) return;
    if (el.dataset.pick) {
      trackId = el.dataset.pick;
      form.querySelectorAll<HTMLElement>('[data-pick]').forEach((b) => b.classList.toggle('on', b === el));
    } else {
      const v = read();
      dlg.close();
      openLogDialog(trackId, { kind: v.kind, minutes: v.minutes, day: s.day, note: v.note, onSaved: () => timer.clear() });
    }
  });
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const v = read();
    kind = v.kind;
    const t = getTrack(trackId)!;
    const entry: LogEntry = {
      id: newId(), trackId, day: s.day, kind, minutes: v.minutes,
      note: v.note || (kind === 'tiny' ? t.tinyAction : ''), blocker: '', evidence: [], createdAt: new Date().toISOString(),
    };
    timer.clear();
    await saveLog(entry);
    dlg.close();
    toast(`Đã lưu buổi học ${fmtMinutes(v.minutes) || ''} vào "${t.name}".`);
  });
}
