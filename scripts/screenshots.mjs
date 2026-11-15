// End-to-end smoke test, screenshots at 1280, 768 and 390 px, and overflow checks at 360-1440 px.
// Requires `npm run build` first. The vite preview server is always killed on exit.
// Uses an installed Chrome/Chromium (CHROME_PATH, default /usr/bin/google-chrome) via playwright-core.
// Still frames use prefers-reduced-motion so captures are not mid-animation.
// A short clip of the flow effects and the running timer is recorded with motion enabled.
import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync, readFileSync, readdirSync, existsSync, unlinkSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';

const PORT = 4192;
const BASE = `http://localhost:${PORT}/`;
const OUT = 'screenshots';
mkdirSync(OUT, { recursive: true });

const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { stdio: 'ignore', detached: true });
const stop = () => { try { process.kill(-server.pid); } catch {} };
process.on('exit', stop);
for (let i = 0; i < 40; i++) {
  try { if ((await fetch(BASE)).ok) break; } catch {}
  await new Promise((r) => setTimeout(r, 250));
}

const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome', args: ['--no-sandbox'] });
const problems = [];
const checks = {};

async function session(width, fixedDay, extra = {}) {
  const height = width >= 1100 ? 900 : width >= 720 ? 1024 : 844;
  const motion = !!extra.motion;
  const { motion: _m, ...ctxExtra } = extra;
  const ctx = await browser.newContext({
    viewport: { width, height },
    deviceScaleFactor: width > 600 ? 1 : 2,
    timezoneId: 'Asia/Saigon',
    locale: 'vi-VN',
    permissions: ['clipboard-read', 'clipboard-write'],
    acceptDownloads: true,
    ...ctxExtra,
  });
  const page = await ctx.newPage();
  if (!motion) await page.emulateMedia({ reducedMotion: 'reduce' });
  if (fixedDay) await page.clock.setFixedTime(new Date(`${fixedDay}T20:00:00+07:00`));
  page.on('console', (m) => { if (m.type() === 'error') problems.push(`[${width}] console: ${m.text()}`); });
  page.on('pageerror', (e) => problems.push(`[${width}] pageerror: ${e.message}`));
  return { ctx, page };
}

const shot = async (page, name, mode = 'page') => {
  await page.evaluate(() => { window.scrollTo(0, 0); document.querySelectorAll('.toast').forEach((t) => t.remove()); });
  await page.waitForTimeout(150);
  if (mode === 'viewport') {
    await page.screenshot({ path: `${OUT}/${name}.png` });
    return;
  }
  const vp = page.viewportSize();
  const height = await page.evaluate(() => {
    const main = document.querySelector('.main');
    const bottom = main ? main.getBoundingClientRect().bottom + window.scrollY : 0;
    return Math.ceil(Math.max(document.documentElement.scrollHeight, document.body.scrollHeight, bottom + 8));
  });
  const tall = Math.max(vp.height, height);
  if (tall !== vp.height) await page.setViewportSize({ width: vp.width, height: tall });
  await page.waitForTimeout(80);
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true });
  if (tall !== vp.height) await page.setViewportSize(vp);
};
const go = async (page, hash, sel) => { await page.goto(BASE + hash); await page.waitForSelector(sel); };

for (const width of [1280, 768, 390]) {
  const { ctx, page } = await session(width);
  await go(page, '', '.empty');
  await shot(page, `empty-${width}`);
  await page.click('[data-act="load-demo"]');
  await page.waitForSelector('.card.track');
  await shot(page, `today-${width}`);

  // Quick tiny step on the first active card that is not done yet.
  const tiny = page.locator('.card.track [data-act="tiny"]').first();
  if (await tiny.count()) {
    await tiny.click();
    await page.waitForSelector('.toast');
    checks[`tinyToast-${width}`] = await page.textContent('.toast span');
  }

  // Full session with link, note and image evidence.
  await page.locator('.card.track [data-act="log"]').first().click();
  await page.waitForSelector('dialog.modal .log-form');
  await page.fill('[name="note"]', 'Viết Kustomize base cho app guestbook');
  await page.fill('[name="evUrl"]', 'https://example.com/gitops-demo/commit/9f8e7d6');
  await page.fill('[name="evLabel"]', 'Kustomize base (ví dụ)');
  await page.click('[data-ev="link"]');
  const img = await page.screenshot({ clip: { x: 0, y: 0, width: 320, height: 200 } });
  await page.setInputFiles('[name="evImg"]', { name: 'argocd-sync.png', mimeType: 'image/png', buffer: img });
  await page.waitForSelector('.ev-item img');
  await page.fill('[name="blocker"]', 'Chưa rõ cách tách patch cho prod');
  await page.fill('[name="nextStep"]', 'Tạo thư mục overlays/prod và copy patch replicas');
  await page.screenshot({ path: `${OUT}/log-dialog-${width}.png` });
  await page.click('dialog.modal button[type="submit"]');
  await page.waitForSelector('dialog.modal', { state: 'detached' });
  await shot(page, `today-after-log-${width}`);

  await page.click('.fab');
  await page.waitForSelector('dialog.modal .quick-form');
  await shot(page, `quick-log-${width}`, 'viewport');
  await page.click('dialog.modal [data-close]');
  await page.waitForSelector('dialog.modal', { state: 'detached' });

  await go(page, '#/t/demo-devops', '.track-head');
  await shot(page, `track-${width}`);
  checks[`trackStats-${width}`] = (await page.locator('.stat').allTextContents()).map((s) => s.replace(/\s+/g, ' ').trim());

  await go(page, '#/t/demo-video', '.track-head');
  await shot(page, `track-paused-${width}`);

  await go(page, '#/week', '.summary');
  await page.fill('[name="wins"]', 'Sync được app mẫu bằng Argo CD');
  await page.fill('[name="next"]', 'Thêm overlay prod và viết README');
  await page.waitForTimeout(600);
  await page.click('[data-act="copy-summary"]');
  await page.waitForTimeout(200);
  const clip = await page.evaluate(() => navigator.clipboard.readText().catch(() => ''));
  checks[`clipboardHasSummary-${width}`] = clip.includes('Tóm tắt tuần') && clip.includes('Sync được app mẫu');
  if (width === 1280) writeFileSync(`${OUT}/week-summary-sample.txt`, clip);
  await shot(page, `week-${width}`);

  await go(page, '#/evidence', '.week-head');
  await shot(page, `evidence-${width}`);
  await go(page, '#/settings', 'h1');
  await shot(page, `settings-${width}`);
  await go(page, '#/new', '.track-form');
  await page.click('[data-tpl="devops"]');
  await shot(page, `new-track-${width}`);

  // Timer: idle setup, a running Pomodoro 11 minutes in (simulated by moving the stored
  // wall-clock start back, then reloading, which also proves reload survival), the save sheet.
  await go(page, '#/timer', '.tm-face');
  await shot(page, `timer-idle-${width}`);
  await page.check('[name="tm-mode"][value="pomodoro"]', { force: true });
  await page.click('[data-tm="start"]');
  await page.waitForSelector('.tm-info');
  await page.evaluate(() => {
    const s = JSON.parse(localStorage.getItem('nhip:timer'));
    const back = 11 * 60_000 + 23_000;
    s.startedAt -= back; s.runStart -= back;
    localStorage.setItem('nhip:timer', JSON.stringify(s));
  });
  await page.reload();
  await page.waitForSelector('.tm-info');
  await page.waitForTimeout(1200);
  checks[`timerAfterReload-${width}`] = (await page.textContent('.tm-time')).trim();
  await shot(page, `timer-running-${width}`);
  await go(page, '', '.session-strip.live');
  checks[`dockVisible-${width}`] = await page.locator('.timer-dock').isVisible();
  await go(page, '#/timer', '.tm-info');
  await page.click('[data-tm="stop"]');
  await page.waitForSelector('dialog.modal .quick-form');
  checks[`timerSaveMinutes-${width}`] = await page.inputValue('dialog [name="minutes"]');
  await page.screenshot({ path: `${OUT}/timer-save-${width}.png` });
  const logsBefore = await page.evaluate(() => new Promise((res) => { const r = indexedDB.open('nhip'); r.onsuccess = () => { const q = r.result.transaction('logs').objectStore('logs').count(); q.onsuccess = () => res(q.result); }; }));
  await page.click('dialog.modal button[type="submit"]');
  await page.waitForSelector('dialog.modal', { state: 'detached' });
  await page.waitForTimeout(300);
  const logsAfter = await page.evaluate(() => new Promise((res) => { const r = indexedDB.open('nhip'); r.onsuccess = () => { const q = r.result.transaction('logs').objectStore('logs').count(); q.onsuccess = () => res(q.result); }; }));
  checks[`timerSavedLog-${width}`] = logsAfter === logsBefore + 1;
  checks[`timerCleared-${width}`] = await page.evaluate(() => localStorage.getItem('nhip:timer') === null);

  if (width === 1280) {
    // Export, then import into a fresh profile and compare.
    await go(page, '#/settings', 'h1');
    const [dl] = await Promise.all([page.waitForEvent('download'), page.click('[data-act="export"]')]);
    const path = `${OUT}/../tmp/export.json`;
    mkdirSync('tmp', { recursive: true });
    await dl.saveAs(path);
    const exported = JSON.parse(readFileSync(path, 'utf8'));
    const fresh = await session(1280);
    await go(fresh.page, '#/settings', 'h1');
    await fresh.page.setInputFiles('[data-act="import"]', path);
    await fresh.page.waitForSelector('dialog.modal .import-table');
    checks.importPreviewRows = (await fresh.page.locator('.import-table tbody tr').allTextContents()).map((s) => s.replace(/\s+/g, ' ').trim());
    await fresh.page.screenshot({ path: `${OUT}/import-preview-1280.png` });
    await fresh.page.click('dialog.modal button[type="submit"]');
    await fresh.page.waitForSelector('.toast');
    checks.importToast = await fresh.page.textContent('.toast span');
    const counts = await fresh.page.evaluate(() => new Promise((res) => {
      const r = indexedDB.open('nhip');
      r.onsuccess = () => {
        const tx = r.result.transaction(['tracks', 'logs'], 'readonly');
        const a = tx.objectStore('tracks').count();
        const b = tx.objectStore('logs').count();
        tx.oncomplete = () => res([a.result, b.result]);
      };
    }));
    checks.roundTrip = counts[0] === exported.tracks.length && counts[1] === exported.logs.length;
    await fresh.ctx.close();
  }
  await ctx.close();
}

// Mid-week view (fixed clock) to show the recover / on-track states.
{
  const { ctx, page } = await session(1280, '2026-11-18');
  await go(page, '', '.empty');
  await page.click('[data-act="load-demo"]');
  await page.waitForSelector('.card.track');
  await shot(page, 'today-midweek-1280');
  checks.midweekStates = await page.locator('.card .state').allTextContents();

  // Schedule a return for the paused track on next Monday.
  await page.click('.card.paused [data-act="resume-on"]');
  await page.waitForTimeout(300);
  checks.scheduledReturn = (await page.textContent('.card.paused')).includes('hẹn quay lại');

  // Pause a track with a next step, then resume it.
  await go(page, '#/t/demo-reading', '.track-head');
  await page.click('[data-act="pause"]');
  await page.fill('dialog [name="next"]', 'Đọc lại mục SSTables 2 trang');
  await page.click('dialog button[type="submit"]');
  await page.waitForSelector('dialog.modal', { state: 'detached' });
  await go(page, '', '.card');
  checks.pausedCards = await page.locator('.card.paused .track-name').allTextContents();
  await page.locator('.card.paused', { hasText: 'Designing' }).locator('[data-act="resume"]').click();
  await page.waitForTimeout(300);
  checks.resumedActive = (await page.locator('.card.track .track-name').allTextContents()).some((t) => t.includes('Designing'));

  // Finish a sprint, then start a new one.
  await go(page, '#/t/demo-reading', '.sprint');
  await page.click('[data-act="finish-sprint"]');
  await page.fill('dialog [name="reflection"]', 'Chương 3 dài hơn dự kiến, đợt sau chia nhỏ hơn.');
  await page.click('dialog button[type="submit"]');
  await page.waitForSelector('.past');
  await go(page, '#/t/demo-reading?new-sprint=1', '.sprint-form');
  await page.fill('[name="title"]', 'Phần II: Distributed Data');
  await page.fill('[name="deliverable"]', 'Ghi chú chương 5-6');
  await page.fill('[name="milestones"]', 'Chương 5: Replication\nChương 6: Partitioning');
  await page.click('.sprint-form button.primary');
  await page.waitForSelector('.sprint');
  checks.newSprint = await page.textContent('.sprint h2');
  await page.fill('.ms-add [name="ms"]', 'Viết tóm tắt');
  await page.click('.ms-add button');
  await page.waitForTimeout(300);
  checks.milestonesAfterAdd = await page.locator('.milestones li').count();
  await shot(page, 'track-new-sprint-1280');
  await ctx.close();
}

// Overflow audit: no horizontal scroll at common widths on every main screen.
{
  const { ctx, page } = await session(1280);
  await go(page, '', '.empty');
  await page.click('[data-act="load-demo"]');
  await page.waitForSelector('.card.track');
  const routes = ['', '#/timer', '#/t/demo-devops', '#/week', '#/evidence', '#/settings', '#/new'];
  const overflow = [];
  for (const w of [360, 390, 768, 1024, 1280, 1440]) {
    await page.setViewportSize({ width: w, height: 900 });
    for (const r of routes) {
      await page.goto(BASE + r);
      await page.waitForSelector('.main > *');
      await page.waitForTimeout(120);
      const o = await page.evaluate(() => {
        const vw = document.documentElement.clientWidth;
        const wide = [...document.querySelectorAll('.main *')].filter((el) => {
          const b = el.getBoundingClientRect();
          return b.width > 0 && b.right > vw + 1 && !el.closest('.heat-wrap, .hero-flow');
        }).slice(0, 3).map((el) => el.className || el.tagName);
        return { sw: document.documentElement.scrollWidth, vw, wide };
      });
      if (o.sw > o.vw || o.wide.length) overflow.push({ w, route: r || '#/', ...o });
    }
    if (w === 1440) { await page.goto(BASE); await page.waitForSelector('.card.track'); await shot(page, 'today-1440'); }
    if (w === 360) { await page.goto(BASE); await page.waitForSelector('.card.track'); await shot(page, 'today-360'); }
  }
  checks.overflow = overflow;
  if (overflow.length) problems.push(`overflow: ${JSON.stringify(overflow)}`);
  await ctx.close();
}

// Motion clip: flowing chain, week bar and header lines on Today, then the running timer ring.
{
  const dir = 'tmp/frames';
  mkdirSync(dir, { recursive: true });
  for (const f of readdirSync(dir)) if (f.endsWith('.png')) unlinkSync(join(dir, f));
  const { ctx, page } = await session(390, null, { motion: true, deviceScaleFactor: 1 });
  await go(page, '', '.empty');
  await page.click('[data-act="load-demo"]');
  await page.waitForSelector('.card.track');
  await page.evaluate(() => document.querySelectorAll('.toast').forEach((el) => el.remove()));
  await page.waitForTimeout(600);
  let n = 0;
  const frame = async () => {
    await page.screenshot({ path: join(dir, `f${String(n).padStart(3, '0')}.png`), animations: 'allow' });
    n += 1;
  };
  await page.evaluate(() => window.scrollTo(0, 120));
  for (let i = 0; i < 26; i++) { await frame(); await page.waitForTimeout(60); }
  await page.locator('.card.track [data-tm="quick-start"]').first().click();
  await page.waitForSelector('.tm-info');
  await page.evaluate(() => {
    const s = JSON.parse(localStorage.getItem('nhip:timer'));
    const back = 9 * 60_000;
    s.startedAt -= back; s.runStart -= back;
    localStorage.setItem('nhip:timer', JSON.stringify(s));
  });
  await page.reload();
  await page.waitForSelector('.tm-info');
  await page.waitForTimeout(400);
  for (let i = 0; i < 30; i++) { await frame(); await page.waitForTimeout(60); }
  await ctx.close();
  for (const old of ['tap-to-log.gif', 'tap-to-log.webm']) if (existsSync(join(OUT, old))) unlinkSync(join(OUT, old));
  const gif = join(OUT, 'flow-and-timer.gif');
  try {
    execFileSync('ffmpeg', [
      '-y', '-framerate', '10', '-i', join(dir, 'f%03d.png'),
      '-vf', 'fps=10,scale=390:-1:flags=lanczos,split[s0][s1];[s0]palettegen=max_colors=96[p];[s1][p]paletteuse=dither=bayer',
      '-loop', '0', gif,
    ], { stdio: 'ignore' });
    checks.flowClip = existsSync(gif);
    checks.flowClipFrames = n;
  } catch (err) {
    problems.push(`ffmpeg clip: ${(err && err.message) || err}`);
    checks.flowClip = false;
  }
}

await browser.close();
stop();
writeFileSync(`${OUT}/checks.json`, JSON.stringify({ checks, problems }, null, 2));
console.log(JSON.stringify({ checks, problems }, null, 2));
if (problems.length) process.exit(1);
