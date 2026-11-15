# Nhip (tracking-status)

Keep a steady learning rhythm, even on busy days. Nhip ("Nhịp", Vietnamese for rhythm or pace) is a small
browser app for tracking self-directed learning such as a DevOps lab or video editing. The UI is in Vietnamese.

- Learning tracks with 2-4 week sprints, each ending in a concrete deliverable and a few milestones.
- A smallest step that still counts: one tap on Today logs it, and a Ghi nhanh button (or the G key) logs from any screen with one more tap. Duration and type chips remember the last values, so most days need no typing.
- Rhythm metrics that tolerate real life: days done in the last 7, a weekly target, weekly streaks,
  fixed rest days, a small monthly allowance of busy days, and a momentum score that a single missed day
  barely moves.
- Never miss twice: after one missed day the app asks for a tiny step today; after more, it offers a
  gentle restart without catching up.
- Optional evidence per session (links, notes, images) collected into an evidence log.
- Weekly review: an automatic summary (done, blockers, next step) with a copy button, ready to paste to a
  mentor or a bot for feedback.
- Pause and resume a track without penalties, with a suggested first step and an optional Monday restart.
- Local only: IndexedDB, JSON export and import, installable as a PWA. No account, no server.

Design rationale, research sources and the exact formulas are in [docs/DESIGN.md](docs/DESIGN.md).

## Run locally

Requires Node.js 20.19 or newer (CI uses Node 24).

```bash
npm ci
npm run dev        # http://localhost:5173
npm test           # unit tests (rhythm math, sprint progress, weekly summary, import/export)
npm run build      # type check and production build into dist/
npm run preview    # serve dist/
```

Screenshots (390, 768 and 1280 px) and an end-to-end smoke test (needs a local Chrome or Chromium; set
`CHROME_PATH` if it is not at `/usr/bin/google-chrome`). A short `tap-to-log` clip is written alongside the PNGs:

```bash
npm run build && npm run screenshots
```

The script writes PNG files and `checks.json` to `screenshots/`.

## Demo data

Settings > "Thêm dữ liệu mẫu" (or "Xem dữ liệu mẫu" on the empty start page) adds three example tracks with
about six weeks of history, generated relative to today. Every demo record is flagged, a banner says demo data
is shown, and "Xoá dữ liệu mẫu" removes only those records. Demo links point to public documentation or
example.com.

## Deploy

`.github/workflows/pages.yml` builds and deploys to GitHub Pages on push to `main`, with actions pinned by
commit SHA, Node 24, and `VITE_BASE=/<repo-name>/`. The repository is
[nexus-centric/tracking-status](https://github.com/nexus-centric/tracking-status), served at
https://nexus-centric.github.io/tracking-status/ once Pages uses GitHub Actions as its source. Dependabot checks npm and GitHub Actions weekly.

## Project layout

```
src/core/      pure logic: dates, rhythm, sprint, summary, re-entry, import/export, demo data
src/views/     page and dialog rendering
src/db.ts      IndexedDB persistence
src/state.ts   in-memory state with write-through saves
tests/         node:test unit tests
scripts/       screenshot and smoke test script
docs/          design notes
```

## License

MIT
