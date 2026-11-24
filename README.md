# The Study Hub (tracking-status)

A small browser app for keeping self-directed learning steady, even on busy days: a DevOps lab, video editing,
a technical book. The UI is in Vietnamese. The display name is "The Study Hub" (set in `src/core/brand.ts`); the
small subtitle `tracking-status` matches the repository name.

- Whole roadmap per track: paste a course outline, a book's table of contents, Markdown, JSON or CSV; preview;
  one confirm creates every item and splits the unfinished ones into 2-4 week sprints from the weekly target.
  Items and sprint milestones stay in sync. The roadmap page shows % done (weighted by estimates when given),
  finish dates at the recent pace, at the weekly target and per plan, with the assumptions spelled out, and
  suggests a re-plan when you fall behind. Edit, reorder and delete items any time.

- Learning tracks with 2-4 week sprints, each ending in a concrete deliverable and a few milestones.
- A smallest step that still counts: one tap on Today logs it, and the "Ghi nhanh" button (or the G key) logs
  from any screen. Duration and type chips remember the last values, so most days need no typing.
- Study session timer ("Đồng hồ buổi học", key T): stopwatch, countdown, or Pomodoro with configurable focus,
  short break, long break and "long break every N". Pause, resume and stop; stopping pre-fills the same log
  entry that quick log creates. Time is derived from wall-clock timestamps, so reloads and sleeping tabs do not
  drift. Optional chime, browser notification and screen wake lock, each degrading gracefully.
- Consistency metrics that tolerate real life: days done in the last 7, a weekly target, weekly streaks,
  fixed rest days, a small monthly allowance of busy days, and a 0-100 consistency score ("Độ đều đặn").
- Never miss twice: after one missed day the app asks for a tiny step today; after more, it offers a gentle
  restart without catching up.
- Optional results per session (links, notes, images) collected on the "Thành quả" page.
- Weekly review with an automatic summary to paste to a mentor or an assistant.
- Pause and resume a track without penalties.
- Local only: IndexedDB in this browser, versioned JSON backup with import preview (merge or replace), a gentle
  backup reminder, installable as a PWA. No account, no server, no cloud sync.

Design rationale, research sources and formulas are in [docs/DESIGN.md](docs/DESIGN.md).

## Where the data lives

Nothing is hardcoded. Everything you enter is saved in IndexedDB database `nhip` in the current browser profile
(schema version 2, stores `tracks`, `sprints`, `roadmap`, `logs`, `marks`, `reviews`, `settings`; older
databases are upgraded in place), loaded into memory at start and written
through on every save. Small preferences and the running timer live in `localStorage` (`nhip:log-prefs`,
`nhip:timer`, `nhip:timer-prefs`, `nhip:last-backup`, `nhip:backup-snooze`). The internal name `nhip` is kept so
existing data and backups stay compatible.

Data does not sync between devices or browsers, and clearing site data deletes it. Use Settings > "Tải bản sao
lưu (JSON)" regularly; restore with "Khôi phục từ file", which shows counts first and lets you merge or replace
(replace needs an extra confirmation). Today shows a reminder when the last export is 14 or more days old and
there are at least 5 real logs.

Demo data is generated on demand by `src/core/demo.ts` relative to today, flagged `demo: true`, and removable
from Settings without touching real records. It is used for trying the app and for screenshots.


## Import topics from JSON

This is separate from Settings backup import/export (which saves or restores the whole database). On
"Thêm topic học mới" you can paste JSON or choose a `.json` file that describes one topic or a list of topics,
each with a lesson list. The form previews the counts, then creates the topics (and 3-week sprints when there
are lessons). A sample file is at [docs/topic-import.sample.json](docs/topic-import.sample.json).

Accepted shapes: a single topic object, an array of topics, or `{ "topics": [ ... ] }`.

```json
{
  "title": "Kubernetes căn bản",
  "description": "Optional; stored as the topic's why",
  "tinyAction": "optional smallest step that still counts",
  "plan": "optional when/where plan",
  "weeklyTarget": 4,
  "lessons": [
    {
      "title": "Tổng quan kiến trúc",
      "url": "https://kubernetes.io/docs/concepts/overview/",
      "phase": "optional section name",
      "estimate": { "unit": "min", "value": 45 }
    }
  ]
}
```

Aliases: `name` for `title`, `why` for `description`, `items` for `lessons`, `link` for `url`. `estimate` may
also be a number of minutes. A Settings backup (`app: "nhip"`) is rejected here with a pointer to Settings.
Invalid JSON and missing titles get a Vietnamese error before anything is saved.

## Run locally

Requires Node.js 20.19 or newer (CI uses Node 24).

```bash
npm ci
npm run dev        # http://localhost:5173
npm test           # unit tests (rhythm, sprints, roadmap parser, planner, projection, migration, backup, timer)
npm run build      # type check and production build into dist/
npm run preview    # serve dist/
```

Screenshots, an end-to-end smoke test, and an overflow audit at 360, 390, 768, 1024, 1280 and 1440 px (needs a
local Chrome or Chromium; set `CHROME_PATH` if it is not at `/usr/bin/google-chrome`):

```bash
npm run build && npm run screenshots
```

The script writes PNG files, `flow-and-timer.gif` and `checks.json` to `screenshots/`, and always stops the
preview server it starts.

## Deploy

`.github/workflows/pages.yml` builds and deploys to GitHub Pages on push to `main`, with actions pinned by
commit SHA, Node 24, and `VITE_BASE=/<repo-name>/`. The repository is
[nexus-centric/tracking-status](https://github.com/nexus-centric/tracking-status), served at
https://nexus-centric.github.io/tracking-status/. Dependabot checks npm and GitHub Actions weekly.

## Project layout

```
src/core/      pure logic: dates, rhythm, sprint, roadmap parser/progress/planner, schema, summary, re-entry,
               backup bundle, timer math, brand, demo data, topic JSON import
src/views/     page and dialog rendering (Today, timer, track, roadmap, planner, week, results, settings)
src/session.ts timer runtime: persistence, ticking, notifications, chime, wake lock
src/db.ts      IndexedDB persistence
src/state.ts   in-memory state with write-through saves, import preview and merge/replace
tests/         node:test unit tests
scripts/       screenshot, smoke test and overflow audit script
docs/          design notes
```

## License

MIT
