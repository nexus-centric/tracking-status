// End-to-end smoke test and screenshots at 1280 and 390 px. Requires `npm run build` first.
// Uses an installed Chrome/Chromium (CHROME_PATH, default /usr/bin/google-chrome) via playwright-core.
import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';

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

async function session(width, fixedDay) {
  const ctx = await browser.newContext({ viewport: { width, height: width > 600 ? 900 : 844 }, deviceScaleFactor: width > 600 ? 1 : 2, timezoneId: 'Asia/Saigon', locale: 'vi-VN', permissions: ['clipboard-read', 'clipboard-write'], acceptDownloads: true });
  const page = await ctx.newPage();
  if (fixedDay) await page.clock.setFixedTime(new Date(`${fixedDay}T20:00:00+07:00`));
  page.on('console', (m) => { if (m.type() === 'error') problems.push(`[${width}] console: ${m.text()}`); });
  page.on('pageerror', (e) => problems.push(`[${width}] pageerror: ${e.message}`));
  return { ctx, page };
}

const shot = async (page, name) => {
  await page.evaluate(() => { document.querySelectorAll('.toast').forEach((t) => t.remove()); });
  await page.waitForTimeout(250);
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true });
};
const go = async (page, hash, sel) => { await page.goto(BASE + hash); await page.waitForSelector(sel); };

for (const width of [1280, 390]) {
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
  await go(page, '#/settings', '.week-head');
  await shot(page, `settings-${width}`);
  await go(page, '#/new', '.track-form');
  await page.click('[data-tpl="devops"]');
  await shot(page, `new-track-${width}`);

  if (width === 1280) {
    // Export, then import into a fresh profile and compare.
    await go(page, '#/settings', '.week-head');
    const [dl] = await Promise.all([page.waitForEvent('download'), page.click('[data-act="export"]')]);
    const path = `${OUT}/../tmp/export.json`;
    mkdirSync('tmp', { recursive: true });
    await dl.saveAs(path);
    const exported = JSON.parse(readFileSync(path, 'utf8'));
    const fresh = await session(1280);
    await go(fresh.page, '#/settings', '.week-head');
    fresh.page.on('dialog', (d) => d.accept());
    await fresh.page.setInputFiles('[data-act="import"]', path);
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
  checks.scheduledReturn = (await page.textContent('.card.paused')).includes('Đã hẹn quay lại');

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

await browser.close();
stop();
writeFileSync(`${OUT}/checks.json`, JSON.stringify({ checks, problems }, null, 2));
console.log(JSON.stringify({ checks, problems }, null, 2));
if (problems.length) process.exit(1);
