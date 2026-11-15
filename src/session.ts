// Runtime for the study session timer: persistence, ticking, announcements, wake lock and sound.
// All timing comes from src/core/timer.ts, which derives time from wall-clock timestamps.
import { today } from './core/dates.js';
import {
  boundaryIndex, nextBoundaryAt, parseSession, parseTimerPrefs, pauseSession, resumeSession, startSession, stopSession,
  viewAt, TIMER_KEY, TIMER_PREFS_KEY, type TimerMode, type TimerPrefs, type TimerSession,
} from './core/timer.js';

function storage(): Storage | null {
  try { return localStorage; } catch { return null; }
}

let session: TimerSession | null = parseSession(storage()?.getItem(TIMER_KEY));
let prefs: TimerPrefs = parseTimerPrefs(storage()?.getItem(TIMER_PREFS_KEY));

type Fn = () => void;
const changeFns: Fn[] = [];
const tickFns: Fn[] = [];
export const onSessionChange = (f: Fn) => { changeFns.push(f); };
export const onTick = (f: Fn) => { tickFns.push(f); };

export const getSession = () => session;
export const getTimerPrefs = () => prefs;

export function setTimerPrefs(patch: Partial<TimerPrefs>): TimerPrefs {
  prefs = { ...prefs, ...patch, pomo: { ...prefs.pomo, ...(patch.pomo ?? {}) } };
  try { storage()?.setItem(TIMER_PREFS_KEY, JSON.stringify(prefs)); } catch { /* quota or private mode */ }
  void syncWakeLock();
  return prefs;
}

function persist(): void {
  const st = storage();
  try {
    if (session) st?.setItem(TIMER_KEY, JSON.stringify(session));
    else st?.removeItem(TIMER_KEY);
  } catch { /* in-memory session still works for this tab */ }
}

function set(s: TimerSession | null): void {
  session = s;
  persist();
  schedule();
  void syncWakeLock();
  changeFns.forEach((f) => f());
}

export function start(opts: { mode: TimerMode; trackId: string; targetMin?: number }): void {
  primeAudio();
  set(startSession({ ...opts, day: today(), pomo: prefs.pomo }, Date.now()));
}
export function pause(): void { if (session) set(pauseSession(session, Date.now())); }
export function resume(): void { primeAudio(); if (session) set(resumeSession(session, Date.now())); }
export function stop(): void { if (session) set(stopSession(session, Date.now())); }
export function clear(): void { set(null); }
/** Re-reads the session written by another tab. */
export function reload(): void { session = parseSession(storage()?.getItem(TIMER_KEY)); schedule(); changeFns.forEach((f) => f()); }

// Ticking: one 1 s interval, only while a session runs and the page is visible.
// Hidden tabs rely on a single timeout at the next boundary plus a re-check on visibilitychange.
let interval = 0;
let boundaryTimer = 0;

function check(): void {
  if (!session) return;
  const idx = boundaryIndex(session, Date.now());
  if (idx > session.announced) {
    session = { ...session, announced: idx };
    persist();
    void announce(session, idx);
  }
}

function tick(): void {
  check();
  tickFns.forEach((f) => f());
}

function schedule(): void {
  clearInterval(interval);
  clearTimeout(boundaryTimer);
  interval = 0;
  if (!session || session.status !== 'running') return;
  if (document.visibilityState === 'visible') interval = window.setInterval(tick, 1000);
  const at = nextBoundaryAt(session, Date.now());
  if (at !== null) boundaryTimer = window.setTimeout(() => { tick(); schedule(); }, Math.max(0, at - Date.now()) + 50);
}

document.addEventListener('visibilitychange', () => {
  schedule();
  tick();
  void syncWakeLock();
});
window.addEventListener('storage', (e) => { if (e.key === TIMER_KEY) reload(); });

// Sound: a short two-tone chime through Web Audio. The context is created on a user gesture (start/resume),
// as browsers require for audio.
let audio: AudioContext | null = null;
function primeAudio(): void {
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    audio ??= new Ctx();
    if (audio.state === 'suspended') void audio.resume();
  } catch { audio = null; }
}

export function chime(): void {
  if (!audio || !prefs.sound) return;
  try {
    const t0 = audio.currentTime;
    [0, 0.22].forEach((delay, i) => {
      const o = audio!.createOscillator();
      const g = audio!.createGain();
      o.type = 'sine';
      o.frequency.value = i ? 880 : 660;
      g.gain.setValueAtTime(0.0001, t0 + delay);
      g.gain.exponentialRampToValueAtTime(0.18, t0 + delay + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + delay + 0.35);
      o.connect(g).connect(audio!.destination);
      o.start(t0 + delay);
      o.stop(t0 + delay + 0.4);
    });
  } catch { /* audio is optional */ }
}

// Notifications: only when the user granted permission. Android Chrome and iOS only allow notifications from a
// service worker registration (MDN browser-compat-data), so try that first and fall back to the constructor.
export function notificationState(): NotificationPermission | 'unsupported' {
  return typeof Notification === 'undefined' ? 'unsupported' : Notification.permission;
}

export async function askNotifications(): Promise<NotificationPermission | 'unsupported'> {
  if (typeof Notification === 'undefined') return 'unsupported';
  try { return await Notification.requestPermission(); } catch { return Notification.permission; }
}

export function announcementText(s: TimerSession): { title: string; body: string } {
  if (s.mode === 'countdown') return { title: 'Đã đủ thời gian bạn đặt ra', body: 'Dừng đồng hồ để lưu buổi học, hoặc học thêm nếu còn hứng.' };
  const v = viewAt(s, Date.now());
  const kind = v.phase?.kind ?? 'focus';
  if (kind === 'focus') return { title: 'Hết giờ nghỉ', body: 'Bắt đầu khoảng tập trung tiếp theo.' };
  if (kind === 'long') return { title: 'Đến lúc nghỉ dài', body: `Bạn đã xong ${v.phase?.focusBefore ?? 0} khoảng tập trung. Đứng dậy đi lại vài phút nhé.` };
  return { title: 'Xong một khoảng tập trung', body: `Nghỉ ${s.pomo.brk} phút rồi quay lại.` };
}

const announceFns: ((s: TimerSession) => void)[] = [];
export const onAnnounce = (f: (s: TimerSession) => void) => { announceFns.push(f); };

async function announce(s: TimerSession, _idx: number): Promise<void> {
  chime();
  announceFns.forEach((f) => f(s));
  if (notificationState() !== 'granted') return;
  const { title, body } = announcementText(s);
  const opts: NotificationOptions = { body, tag: 'tracking-status-timer', icon: `${import.meta.env.BASE_URL}icon.svg` };
  try {
    const reg = 'serviceWorker' in navigator ? await navigator.serviceWorker.getRegistration() : undefined;
    if (reg) { await reg.showNotification(title, opts); return; }
  } catch { /* fall through */ }
  try { new Notification(title, opts); } catch { /* not allowed on this platform */ }
}

// Screen Wake Lock: optional, only while a session runs and the page is visible.
// The browser releases the lock when the tab is hidden; it is requested again on visibilitychange (MDN).
let lock: WakeLockSentinel | null = null;
export const wakeLockSupported = () => 'wakeLock' in navigator;

async function syncWakeLock(): Promise<void> {
  const want = prefs.wakeLock && session?.status === 'running' && document.visibilityState === 'visible' && wakeLockSupported();
  try {
    if (want && !lock) {
      lock = await navigator.wakeLock.request('screen');
      lock.addEventListener('release', () => { lock = null; });
    } else if (!want && lock) {
      await lock.release();
      lock = null;
    }
  } catch { lock = null; }
}

// Restore after reload: announce anything that passed while the page was closed, then resume ticking.
schedule();
check();
