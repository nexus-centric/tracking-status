# The Study Hub (tracking-status)

A small browser app for keeping self-directed learning steady, even on busy days: a DevOps lab, video editing,
a technical book. The UI is in Vietnamese. The display name is "The Study Hub" (set in `src/core/brand.ts`); the
small subtitle `tracking-status` matches the repository name.

- Whole roadmap per track: paste a course outline, a book's table of contents, Markdown, JSON or CSV; preview;
  one confirm creates every item and splits the unfinished ones into 2-4 week sprints from the weekly target.
  Items and sprint milestones stay in sync. The roadmap page shows % done (weighted by estimates when given),
  finish dates at the recent pace, at the weekly target and per plan, with the assumptions spelled out, and
  suggests a re-plan when you fall behind. Edit, reorder and delete items any time. A new topic can start from
  just a list of lessons (text, links or JSON) and be planned later on a drag-and-drop sprint board.

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


## Import a lesson list (new topic)

This is separate from Settings backup import/export (which saves or restores the whole database). On
"Thêm topic học mới", the box "Nhập nhanh danh sách bài học" takes pasted text or a `.json`, `.txt`, `.md` or
`.csv` file. Only the lessons are needed; the topic name, phases, estimates, schedule and sprints are all
optional and can be set up later. The app shows a preview (lesson count, phases, the first lessons) and
"Điền vào form" fills the form. Nothing is saved until you click "Tạo topic", and you can edit the form first.
If the input has several topics, fill and submit them one at a time.

When creating a topic with lessons you choose how sprints are made: "Để tôi tự xếp sprint" (no sprint yet;
the sprint planner opens with every lesson in "Chưa xếp"), "Tự chia sprint 3 tuần" (default) or "Mỗi phần
một sprint". When the input or the form already describes a first sprint, that sprint is used instead.

Accepted inputs, from the smallest:

- Plain text, one lesson per line. A line that is only a URL becomes a lesson named after the link; a line with
  a URL keeps it as the lesson link. `# heading` lines are phases. Markdown lists, numbered lists, `(45m)`
  estimates and CSV with a `title`/`tên` column work as in the roadmap import.
- A JSON array of strings or of lesson objects:
  [docs/topic-import.minimal.json](docs/topic-import.minimal.json)

  ```json
  ["Bài 1: Tổng quan khoá học", "Bài 2: Cài đặt công cụ",
   { "title": "Bài 3: Bài tập đầu tiên", "url": "https://example.com/bai-3" },
   "https://example.com/bai-hoc/tong-ket"]
  ```

- `{ "lessons": [...] }` or `{ "title": "...", "lessons": [...] }`, optionally with nested phases:
  `{ "title": "...", "phases": [{ "title": "Phần 1", "lessons": ["...", "..."] }] }` (`sections`, `modules`
  work too).
- The full topic shape, a list of topics, or `{ "topics": [ ... ] }` (the format of earlier versions and of
  [docs/topic-import.sample.json](docs/topic-import.sample.json); still accepted unchanged):

```json
{
  "title": "Kubernetes căn bản",
  "description": "Optional; stored as the topic's why",
  "tinyAction": "optional smallest step that still counts",
  "plan": "optional when/where plan",
  "weeklyTarget": 4,
  "sprint": {
    "title": "Optional first sprint title",
    "deliverable": "optional concrete output",
    "weeks": 3,
    "milestones": ["optional milestone"]
  },
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

Aliases: topic `name` for `title`, `why` for `description`, `items` for `lessons`; lesson `name`/`text`/`label`
for `title`, `link`/`href` for `url`, `section`/`module`/`chapter` for `phase`, `minutes`/`duration` (minutes) or
`sessions` for `estimate`; `estimate` may also be a number of minutes. Optional sprint fields may be a `sprint`
object or top-level `sprintTitle`, `deliverable`, `start` (YYYY-MM-DD), `weeks` (2, 3 or 4) and `milestones`.
Links must be `http(s)`. A Settings backup (`app: "nhip"`) is rejected here with a pointer to Settings. Invalid
JSON, a lesson that is not text or an object, or an empty list get a Vietnamese error naming the place; the
form is not filled and nothing is saved.

## Roadmap and sprint planner

- Roadmap ("Lộ trình"): phases are collapsible; only the phase you are studying is open at first ("Mở tất cả" /
  "Thu gọn" toggle all). The sticky toolbar searches lesson and phase names, filters by status (Tất cả, Chưa xong,
  Đã xong) and sprint (running, a planned sprint, not in a sprint) and jumps to a phase.
- Sprint planner ("Kế hoạch sprint"): a board with "Chưa xếp" (lessons in no sprint) and collapsible sprint
  cards. Drag a lesson by its grip into any sprint, a collapsed sprint, or back to "Chưa xếp", and to reorder
  inside a sprint. Tick several lessons (or a phase group) and drag one: the whole selection moves. Without a
  mouse: the ⇄ button on each lesson opens "Chuyển tới…" (arrow keys, Enter, Escape), Alt+↑/↓ reorders the
  focused lesson, and the bar on top moves the selection. Presets (2/3/4 weeks per sprint, one sprint per phase)
  only produce a draft; nothing is saved until "Lưu kế hoạch".

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
docs/          design notes, topic import samples (full and minimal)
```

## Dependencies

One runtime dependency: [SortableJS](https://github.com/SortableJS/Sortable) 1.15.7 (MIT, no framework) for drag
and drop in the sprint planner. It is loaded on demand when the planner opens (a separate ~12.7 kB gzip chunk);
if it cannot load (offline before the first visit), the planner still works through the ⇄ menu and the
selection bar.

## License

MIT
