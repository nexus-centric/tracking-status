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
  await page.fill('dialog [name="reflection"]', 'Chương 3 dài hơn dự kiến, sprint sau chia nhỏ hơn.');
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


// Roadmap: paste a syllabus, preview, one confirm creates the roadmap and its sprints; finish items over
// several (simulated) days with the clock moved forward; then the overview with projection and the planner.
// The outline below is a test fixture typed for this script, not data shipped with the app.
const SYLLABUS = `# Phần 1: Nền tảng container
- Bài 1: Container là gì (30m)
- Bài 2: Viết Dockerfile đầu tiên (45m)
- Bài 3: Image, layer và registry (45m)
- Bài 4: Docker Compose cho môi trường dev (1h)
- Thực hành: đóng gói một app Go [2]

# Phần 2: Kubernetes cơ bản
- Bài 5: Kiến trúc cluster (30m)
- Bài 6: Pod và vòng đời (45m)
- Bài 7: Deployment và ReplicaSet (45m)
- Bài 8: Service và DNS trong cluster (45m)
- Bài 9: ConfigMap và Secret (45m)
- Bài 10: Probe và rolling update (1h)
- Thực hành: deploy app lên k3d [2]

# Phần 3: Mạng và lưu trữ
- Bài 11: Ingress và TLS (1h)
- Bài 12: NetworkPolicy (45m)
- Bài 13: PersistentVolume và StorageClass (45m)
- Bài 14: StatefulSet (45m)
- Thực hành: Postgres trong cluster [2]

# Phần 4: Vận hành
- Bài 15: Helm chart (1h)
- Bài 16: Kustomize overlay (45m)
- Bài 17: GitOps với Argo CD (1h)
- Bài 18: Giám sát với Prometheus (1h)
- Bài 19: Log tập trung (45m)
- Bài 20: RBAC và ServiceAccount (45m)
- Bài 21: Autoscaling (45m)
- Bài 22: Backup và khôi phục (45m)
- Bài 23: Nâng cấp cluster (45m)
- Dự án cuối: một app hoàn chỉnh trên GitOps [4]
`;
const idb = (page, stores) => page.evaluate((stores) => new Promise((res) => {
  const r = indexedDB.open('nhip');
  r.onsuccess = () => {
    const db = r.result;
    const tx = db.transaction(stores, 'readonly');
    const out = { version: db.version, names: [...db.objectStoreNames] };
    for (const s of stores) { const q = tx.objectStore(s).getAll(); q.onsuccess = () => { out[s] = q.result; }; }
    tx.oncomplete = () => { db.close(); res(out); };
  };
}), stores);
let roadmapBackup = null;
{
  const days = ['2026-10-26', '2026-10-28', '2026-10-30', '2026-11-02', '2026-11-04', '2026-11-06', '2026-11-09', '2026-11-11', '2026-11-13'];
  const { ctx, page } = await session(1280, '2026-10-25');
  // Minimal track: only a name.
  await go(page, '#/new', '.track-form');
  await page.fill('[name="name"]', 'Kubernetes từ đầu');
  await page.click('.track-form button.primary');
  await page.waitForSelector('.roadmap-card.empty-rm');
  await page.click('.roadmap-card a.btn.primary');
  await page.waitForSelector('.rm-import-form');
  await page.fill('[name="src"]', SYLLABUS);
  await page.waitForSelector('.pv-sum');
  await page.waitForTimeout(250);
  checks.importPreview = (await page.textContent('.pv-sum')).trim();
  checks.importPlanSummary = (await page.textContent('.plan-sum')).replace(/\s+/g, ' ').trim();
  checks.importButton = (await page.textContent('.rm-import-form button[type="submit"]')).trim();
  await page.click('.rm-import-form button[type="submit"]');
  await page.waitForSelector('.rm-overview');
  let db = await idb(page, ['roadmap', 'sprints', 'tracks']);
  checks.roadmapItems = db.roadmap.length;
  checks.roadmapSprints = db.sprints.map((s) => [s.status, s.start, s.end, s.milestones.length]);
  checks.milestonesLinked = db.sprints.every((s) => s.milestones.every((m) => db.roadmap.some((i) => i.id === m.itemId)));
  const trackId = db.tracks[0].id;
  // Day by day: finish the next item, sometimes from the roadmap page, sometimes from the sprint milestone.
  for (const [k, d] of days.entries()) {
    await page.clock.setFixedTime(new Date(`${d}T20:00:00+07:00`));
    if (k % 3 === 2) {
      await go(page, `#/t/${trackId}`, '.sprint');
      await page.locator('.sprint .milestones input[type="checkbox"]:not(:checked)').first().check();
      await page.waitForTimeout(250);
      await page.click('.track-head [data-act="log"]');
      await page.waitForSelector('dialog.modal .log-form');
      await page.fill('dialog [name="minutes"]', '45');
      await page.click('dialog.modal button[type="submit"]');
      await page.waitForSelector('dialog.modal', { state: 'detached' });
    } else {
      await go(page, `#/t/${trackId}/roadmap`, '.ri-list');
      await page.locator('.ri input[data-act="ri-done"]:not(:checked)').first().check();
      await page.waitForSelector('.toast .link-btn');
      if (k === 0) checks.itemToast = (await page.textContent('.toast span')).trim();
      await page.click('.toast .link-btn');
      await page.waitForSelector('dialog.modal .log-form');
      await page.click('dialog.modal button[type="submit"]');
      await page.waitForSelector('dialog.modal', { state: 'detached' });
    }
  }
  db = await idb(page, ['roadmap', 'sprints', 'logs']);
  checks.itemsDone = db.roadmap.filter((i) => i.done).map((i) => i.doneOn);
  checks.syncMilestoneToItem = db.sprints.flatMap((s) => s.milestones).filter((m) => m.done).every((m) => db.roadmap.find((i) => i.id === m.itemId)?.done);
  checks.syncItemToMilestone = db.roadmap.filter((i) => i.done).every((i) => db.sprints.some((s) => s.milestones.some((m) => m.itemId === i.id && m.done)));
  checks.logs = db.logs.length;
  // Reorder and edit.
  await page.clock.setFixedTime(new Date('2026-11-15T20:00:00+07:00'));
  await go(page, `#/t/${trackId}/roadmap`, '.ri-list');
  const lastTitle = await page.locator('.ri .ri-title').last().textContent();
  await page.locator('.ri [data-act="ri-up"]').last().click();
  await page.waitForTimeout(250);
  checks.reorder = (await page.locator('.ri .ri-title').nth(-2).textContent()) === lastTitle;
  await page.locator('.ri [data-act="ri-down"]').nth(-2).click();
  await page.waitForTimeout(250);
  checks.reorderRestored = (await page.locator('.ri .ri-title').last().textContent()) === lastTitle;
  await page.fill('.ri-add [name="title"]', 'Ôn tập toàn khoá (1h)');
  await page.click('.ri-add button');
  await page.waitForTimeout(250);
  checks.addedItemEstimate = (await page.locator('.ri').last().textContent()).replace(/\s+/g, ' ').includes('1 giờ');
  await page.locator('.ri [data-act="ri-edit"]').last().click();
  await page.waitForSelector('dialog .ri-form');
  await page.fill('dialog [name="title"]', 'Ôn tập và tự kiểm tra');
  await page.click('dialog button[type="submit"]');
  await page.waitForSelector('dialog.modal', { state: 'detached' });
  await page.locator('.ri [data-act="ri-del"]').last().click();
  await page.waitForTimeout(250);
  checks.afterAddEditDelete = await page.locator('.ri').count();
  // Overview, track page, planner.
  checks.projection = (await page.locator('.rm-overview .proj li').allTextContents()).map((s) => s.replace(/\s+/g, ' ').trim());
  checks.replanBanner = await page.locator('.rm-overview .banner.replan').count() ? (await page.textContent('.rm-overview .banner.replan span')).trim() : null;
  await page.click('.assume summary');
  await shot(page, 'roadmap-overview-1280');
  await go(page, `#/t/${trackId}`, '.roadmap-card');
  await shot(page, 'roadmap-track-1280');
  await go(page, `#/t/${trackId}/plan`, '.plan-sprints');
  checks.planCloseActiveDefault = await page.isChecked('[name="closeActive"]');
  checks.planSprintsProposed = await page.locator('.plan-sprints > li').count();
  await page.click('.plan-sprints > li:first-child [data-push]');
  await page.waitForTimeout(150);
  checks.planFoot = (await page.textContent('.plan-foot p')).replace(/\s+/g, ' ').trim();
  await shot(page, 'plan-sprints-1280');
  await page.click('[data-create]');
  await page.waitForSelector('.track-head');
  db = await idb(page, ['sprints']);
  checks.afterReplan = db.sprints.map((s) => [s.status, s.start, s.end, s.milestones.length]);
  // Import page on an existing roadmap for the screenshot at the same width.
  await go(page, `#/t/${trackId}/roadmap/import`, '.rm-import-form');
  await page.fill('[name="src"]', SYLLABUS.split('\n').slice(0, 14).join('\n'));
  await page.waitForSelector('.pv-sum');
  await page.waitForTimeout(250);
  await shot(page, 'roadmap-import-1280');
  // Export (format 2) for the narrow screenshots and the import check.
  await go(page, '#/settings', 'h1');
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('[data-act="export"]')]);
  checks.exportFileName = dl.suggestedFilename();
  mkdirSync('tmp', { recursive: true });
  roadmapBackup = 'tmp/roadmap-export.json';
  await dl.saveAs(roadmapBackup);
  const ex = JSON.parse(readFileSync(roadmapBackup, 'utf8'));
  checks.exportVersion = ex.version;
  checks.exportRoadmap = ex.roadmap.length;
  await ctx.close();
}
{
  const { ctx, page } = await session(390, '2026-11-15');
  await go(page, '#/settings', 'h1');
  await page.setInputFiles('[data-act="import"]', roadmapBackup);
  await page.waitForSelector('dialog.modal .import-table');
  checks.importPreviewRoadmapRow = (await page.locator('.import-table tbody tr', { hasText: 'Mục lộ trình' }).textContent()).replace(/\s+/g, ' ').trim();
  await page.click('dialog.modal button[type="submit"]');
  await page.waitForSelector('.toast');
  checks.importToastRoadmap = await page.textContent('.toast span');
  const db = await idb(page, ['tracks']);
  const trackId = db.tracks[0].id;
  await go(page, `#/t/${trackId}/roadmap`, '.rm-overview');
  await shot(page, 'roadmap-overview-390');
  await go(page, `#/t/${trackId}/plan`, '.plan-sprints');
  await shot(page, 'plan-sprints-390');
  await go(page, `#/t/${trackId}/roadmap/import`, '.rm-import-form');
  await page.fill('[name="src"]', SYLLABUS.split('\n').slice(0, 14).join('\n'));
  await page.waitForSelector('.pv-sum');
  await page.waitForTimeout(250);
  await shot(page, 'roadmap-import-390');
  // Quick path: paste the outline while creating a track; one submit creates roadmap and sprints.
  await go(page, '#/new', '.track-form');
  await page.fill('[name="name"]', 'Sách Designing Data-Intensive Applications');
  await page.fill('[name="roadmap"]', '1. Chương 1\n2. Chương 2\n3. Chương 3\n4. Chương 4\n5. Chương 5\n6. Chương 6\n7. Chương 7\n8. Chương 8\n9. Chương 9\n10. Chương 10\n11. Chương 11\n12. Chương 12');
  await page.waitForTimeout(150);
  checks.quickPathSummary = (await page.textContent('.rm-quick-sum')).trim();
  checks.quickPathSprintHidden = await page.locator('.first-sprint').isHidden();
  await page.click('.track-form button.primary');
  await page.waitForSelector('.roadmap-card:not(.empty-rm)');
  checks.quickPathToast = await page.textContent('.toast span');
  await ctx.close();
}

// Migration: a database created by the previous version (IndexedDB v1, no roadmap store) opens with data intact.
{
  const { ctx, page } = await session(1280, '2026-11-15');
  // A blank same-origin page to create the old database before the app ever runs (no favicon request noise).
  await page.route('**/blank-for-migration', (r) => r.fulfill({ contentType: 'text/html', body: '<!doctype html><link rel="icon" href="data:,"><title>x</title>' }));
  await page.goto(BASE + 'blank-for-migration');
  await page.evaluate(() => new Promise((res) => {
    const r = indexedDB.open('nhip', 1);
    r.onupgradeneeded = () => {
      const db = r.result;
      for (const s of ['tracks', 'sprints', 'logs', 'marks']) db.createObjectStore(s, { keyPath: 'id' });
      db.createObjectStore('reviews', { keyPath: 'weekStart' });
      db.createObjectStore('settings');
    };
    r.onsuccess = () => {
      const db = r.result;
      const tx = db.transaction(['tracks', 'sprints', 'logs'], 'readwrite');
      tx.objectStore('tracks').put({ id: 'old', name: 'Việc học cũ', color: '#2f5bea', why: '', tinyAction: 'Đọc 10 phút', plan: '', weeklyTarget: 4, restDays: [], nextStep: '', pauses: [], archived: false, createdAt: '2026-11-01' });
      tx.objectStore('sprints').put({ id: 'olds', trackId: 'old', title: 'Sprint cũ', deliverable: '', start: '2026-11-03', end: '2026-11-23', status: 'active', milestones: [{ id: 'm', text: 'Milestone cũ', done: false }] });
      tx.objectStore('logs').put({ id: 'oldl', trackId: 'old', day: '2026-11-10', kind: 'full', minutes: 30, note: '', blocker: '', evidence: [], createdAt: '2026-11-10T12:00:00Z' });
      tx.oncomplete = () => { db.close(); res(); };
    };
  }));
  await page.goto(BASE + '#/t/old');
  await page.waitForSelector('.track-head');
  const db = await idb(page, ['tracks', 'sprints', 'logs', 'roadmap']);
  checks.migration = { version: db.version, hasRoadmapStore: db.names.includes('roadmap'), tracks: db.tracks.length, sprints: db.sprints.length, logs: db.logs.length, roadmap: db.roadmap.length, oldSprintVisible: (await page.textContent('.sprint h2')).trim() };
  if (db.version !== 2 || !db.names.includes('roadmap') || db.tracks.length !== 1 || db.logs.length !== 1) problems.push(`migration: ${JSON.stringify(checks.migration)}`);
  await ctx.close();
}

// Overflow audit: no horizontal scroll at common widths on every main screen.
{
  const { ctx, page } = await session(1280);
  await go(page, '', '.empty');
  await page.click('[data-act="load-demo"]');
  await page.waitForSelector('.card.track');
  await go(page, '#/t/demo-devops/roadmap/import', '.rm-import-form');
  await page.fill('[name="src"]', SYLLABUS);
  await page.waitForSelector('.pv-sum');
  await page.waitForTimeout(250);
  await page.click('.rm-import-form button[type="submit"]');
  await page.waitForSelector('.rm-overview');
  const routes = ['', '#/timer', '#/t/demo-devops', '#/t/demo-devops/roadmap', '#/t/demo-devops/plan', '#/t/demo-devops/roadmap/import', '#/week', '#/evidence', '#/settings', '#/new'];
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
