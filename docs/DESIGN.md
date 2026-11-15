# The Study Hub: design notes

Status: v0.4, local only. Research accessed on 2026-11-15 (Asia/Saigon). Every source below was opened or
searched on that date; where only a secondary source was read, it is marked as such.

## 1. Problem

The owner learns side skills in bursts (video editing a few weeks ago, a DevOps lab that is now stalled) and
feels something is missing that keeps motivation going. His own framing: on many days there is no time to learn
much, but he wants to keep the rhythm ("1 ngày có thể không học được nhiều, nhưng làm sao vẫn giữ được nhịp độ").

Observation from his earlier projects (inference, not measured): side projects with a visible output and a clear
"done" point get finished; open-ended learning without a deadline, an artifact, or someone who looks at the
result tends to stall.

## 2. Name

The app is shown as "The Study Hub" (short name "Study Hub" for the installed PWA), with a small mono subtitle
`tracking-status`, the repository name (`nexus-centric/tracking-status`). Earlier versions used "Nhịp" and then
"Tiến độ học"; the owner chose the current name on 2026-11-15.

- The display name lives in one place, `src/core/brand.ts` (`APP_NAME`, `APP_SHORT_NAME`, `BACKUP_PREFIX`).
  `vite.config.ts` fills `%APP_NAME%` and `%APP_DESCRIPTION%` in `index.html` and generates
  `manifest.webmanifest` from the same module, so a rename is a one-file change.
- Internal identifiers keep `nhip` (IndexedDB database, backup `app` field, `localStorage` keys) so existing data
  and backups stay compatible; the repository and the Pages path stay `tracking-status`. The service worker cache
  is `tracking-status-v3`.
- The UI copy stays Vietnamese. Copy rules: full sentences addressed to "bạn", no slogans or gamified hype, the
  same term for the same thing everywhere ("buổi học", "bước nhỏ", "đợt học", "lộ trình", "mục", "độ đều đặn",
  "thành quả").

## 3. Research summary

Each item separates what the source reports (Evidence) from how this app uses it (Use). Uses are design
inferences, not findings from the sources.

### 3.1 Habit formation and missed days

- Lally, van Jaarsveld, Potts, Wardle (2010), "How are habits formed: Modelling habit formation in the real
  world", European Journal of Social Psychology 40(6). https://doi.org/10.1002/ejsp.674
  - Evidence: 96 volunteers repeated one chosen daily behaviour for 12 weeks; 82 gave enough data. Automaticity
    rose along an asymptotic curve. Modelled time to reach 95% of the plateau averaged 66 days, range 18 to 254.
    After a single missed opportunity automaticity dropped by 0.29 points on the SRHI subscale, a non-significant
    change, with no longer-term cost found. About half of participants did not perform the behaviour consistently
    enough to reach habit status.
  - Limits: simple eating, drinking and exercise behaviours, self-report measures, one sample. It does not show
    that learning a complex skill works the same way.
  - Use: a single missed day is never shown as a failure; the rhythm metrics are designed so one miss costs little.
    The app does not promise a "21 day" or "66 day" habit.

- James Clear, "Avoid the Second Mistake". https://jamesclear.com/second-mistake
  - Evidence: an essay, not research. It popularised "never miss twice": one miss is an outlier, two in a row is
    the start of a pattern; restart small instead of trying to make up for lost work. It cites the Lally study,
    and describes the finding more strongly than the paper does ("no impact").
  - Use: the "recover" state after one miss ("a tiny step today keeps it from being two in a row") and the
    "restart" state after two or more misses, which suggests the smallest step and explicitly says not to catch up.

### 3.2 Tiny actions and planning

- BJ Fogg, Tiny Habits method (workbook). https://tinyhabits.com/wp-content/uploads/2020/10/Tiny-Habits-Making-New-Habits-Stick.pdf
  - Evidence: a practitioner method, not a controlled study: an anchor (an existing routine), a tiny behaviour
    (around 30 seconds), and an immediate celebration.
  - Use: every track has a "smallest step that still counts", and one tap logs it as a full day of rhythm.
    The 30-second size is not enforced; for learning the examples use about 10 minutes.

- Gollwitzer and Sheeran (2006), "Implementation intentions and goal achievement: A meta-analysis of effects and
  processes", Advances in Experimental Social Psychology 38, 69-119.
  https://kops.uni-konstanz.de/entities/publication/2e749bfb-8533-437c-8203-7e788c910c5f
  - Evidence: 94 independent tests, 8,461 participants; if-then plans ("If situation Y, then I will do X") had a
    medium-to-large effect on goal attainment, d = 0.65 (95% CI 0.60 to 0.70).
  - Limits: effect sizes vary by domain; publication bias was tested in the paper but cannot be ruled out fully.
  - Use: each track has a "when and where" plan field with the prompt "Sau khi [việc quen thuộc], tôi sẽ
    [bước nhỏ] tại [nơi]", shown on the Today card.

### 3.3 Streaks, breaks and repair

- Silverman and Barasch (2023), "On or Off Track: How (Broken) Streaks Affect Consumer Decisions", Journal of
  Consumer Research 49(6), 1095-1117. https://doi.org/10.1093/jcr/ucac029
  (abstract at https://academic.oup.com/jcr/article-abstract/49/6/1095/6623414)
  - Evidence: across seven studies, highlighting an intact logged streak increased later engagement relative to
    highlighting a broken one, independent of actual past behaviour. The effect was stronger when people blamed
    themselves for the break and weaker when they could "repair" the streak.
  - Use: this cuts both ways. Streaks motivate, and a visible break demotivates. So the app avoids a fragile
    daily streak as the headline number. It uses weekly streaks (a missed day does not break them if the week
    target is met), counts rest and protected busy days as neutral, and frames a break as recoverable.

- Duolingo blog, "How Streaks keep Duolingo learners committed to their language goals" (Kai Herng Loh, 2017).
  https://blog.duolingo.com/how-streaks-keep-duolingo-learners-committed-to-their-language-goals/
  - Evidence: company A/B tests, not peer reviewed. Learners offered a "Weekend Amulet" (keep the streak over a
    weekend off) were 4% more likely to return a week later and 5% less likely to lose their streak; a streak
    wager raised day-7 retention by 14%. The post also says learners who binge are more likely to abandon.
  - Use: planned weekly rest days, and a small monthly allowance of "busy" days that do not count as misses.
    The default allowance of 2 per track per month is a design choice; no source tested this number for learning.

### 3.4 Progress and goals

- Amabile and Kramer (2011), "The Power of Small Wins", Harvard Business Review. https://hbr.org/2011/05/the-power-of-small-wins
  (also https://progressprinciple.com/portfolio-items/the-progress-principle-and-the-psychology-of-everyday-work-life/)
  - Evidence: from diaries of knowledge workers, making progress in meaningful work was the event most associated
    with positive emotions and motivation on a given day; small wins counted, and setbacks had a stronger negative
    effect than progress had a positive one.
  - Limits: workplace setting, correlational diary data.
  - Use: progress is shown as finished milestones toward a concrete deliverable, and every log can carry evidence
    (a commit link, a note, an image) that builds into an evidence log.

- Kivetz, Urminsky, Zheng (2006), "The Goal-Gradient Hypothesis Resurrected", Journal of Marketing Research 43(1),
  39-58. https://journals.sagepub.com/doi/10.1509/jmkr.43.1.39
  - Evidence: people accelerated effort as they got closer to a reward goal (coffee card, music ratings).
  - Use (inference): short 2-4 week sprints keep the finish line close; the sprint bar shows the time marker next
    to milestone progress so "how close" is visible.

- Dai, Milkman, Riis (2014), "The Fresh Start Effect: Temporal Landmarks Motivate Aspirational Behavior",
  Management Science 60(10). https://pubsonline.informs.org/doi/10.1287/mnsc.2014.1901
  - Evidence: aspirational behaviour (gym visits, goal-related searches, commitment contracts) rose after temporal
    landmarks such as the start of a week, month or year.
  - Use: a paused track offers "return today" or "return on Monday" (a scheduled resume), and the weekly review is
    built around the Monday-Sunday week.

### 3.5 Spacing

- Cepeda, Pashler, Vul, Wixted, Rohrer (2006), "Distributed practice in verbal recall tasks: A review and
  quantitative synthesis", Psychological Bulletin 132(3), 354-380. https://doi.org/10.1037/0033-2909.132.3.354
  - Evidence: 839 assessments from 317 experiments: spaced study beat massed study for retention; the best gap
    grows with the retention interval.
  - Limits: verbal recall tasks; transfer to procedural skills like video editing or cluster operations is plausible
    but not shown by this paper.
  - Use (inference): the rhythm metric rewards several short days per week over one long weekend session, which is
    also what the momentum score does. The app does not schedule spaced repetition of content.

### 3.6 Existing apps (UI patterns)

- Loop Habit Tracker (open source). FAQ: https://github.com/iSoron/uhabits/discussions/689
  - Evidence: the habit score is an exponential moving average of all repetitions, so a short break after a long
    run is easy to recover and repeated breaks hurt. Per the FAQ, a perfect daily habit reaches about 80% after one
    month and 96% after two. The exact multiplier `0.5 ^ (sqrt(frequency) / 13)` was read from secondary sources
    quoting `Score.kt` (https://stellarhabit.com/blog/loop-habit-tracker-review), not from the repository directly.
  - Use: the momentum score (section 4.4) uses the same multiplier and the same "share of target in the trailing
    window" input. Test `momentum rises with practice` checks that 30 perfect days land near 80.
- Beeminder help: https://help.beeminder.com/article/55-what-is-safety-buffer and
  https://help.beeminder.com/article/45-what-is-the-akrasia-horizon
  - Evidence: goals are a required-progress line with a visible "safety buffer"; changes that make a goal easier
    take effect only after seven days.
  - Use: the weekly bar shows how many more days are needed and whether the week is still reachable. Money stakes
    and the akrasia horizon were not adopted (single-user app, no payment).
- Streaks help, task days and frequency: https://streaks.app/help/task-frequency/
  - Evidence: tasks can be scheduled as N days per week or on specific weekdays.
  - Use: weekly target in days plus fixed rest weekdays.
- Habitica wiki, "Rest in the Inn": https://habitica.fandom.com/wiki/Rest_in_the_Inn
  - Evidence: users can pause damage so missed dailies do not hurt them or reset streaks.
  - Use: track pause that is neutral for every metric, without the game layer (no damage, no points).
- Atoms (James Clear): https://atoms.jamesclear.com/
  - Evidence (product page): small actions tied to identity, with time and place, habit stacking.
  - Use: the "why it matters" field and the plan field; identity framing is left to the user's own words.

## 4. Rhythm model

All dates are local calendar days (`YYYY-MM-DD`); arithmetic is done in UTC so daylight-saving changes cannot
shift a day. Code: `src/core/rhythm.ts`, tests: `tests/rhythm.test.ts`.

### 4.1 Day status

For a track and a day, in priority order:

1. `future` if after today.
2. `done` if any log exists that day (a log on a rest day still counts).
3. `before` if before the track start (the start moves back if older logs exist).
4. `paused` if inside a pause interval.
5. `busy` or `rest` if the day has an explicit mark.
6. `rest` if the weekday is a fixed rest day.
7. `open` if it is today.
8. `miss` otherwise.

`rest`, `busy` and `paused` are "off" days: never misses.

### 4.2 Weekly target

For a Monday-Sunday week: `eligible` = days on or after the start and not paused; `available` = days that are
done, missed, open, or future working days. `target = min(ceil(weeklyTarget * eligible / 7), available)`.
So a busy day lowers that week's target only when the week no longer has enough working days, and a track created
on a Thursday gets a prorated first week. A week is `met`, `missed`, `in-progress` (with a `reachable` flag), or
`paused` (target 0). The weekly streak counts consecutive met weeks; paused weeks are skipped and the current week
never breaks the run while it is in progress.

### 4.3 Never miss twice

`missRun` counts missed days before today, skipping off days, stopping at the last done day. Today state:
`done`, `rest`, `on-track` (run 0), `recover` (run 1), `restart` (run 2 or more), or `paused`.

### 4.4 Momentum score (0-100)

`score_t = score_{t-1} * m + p_t * (1 - m)`, `m = 0.5 ^ (sqrt(f) / 13)`, `f = weeklyTarget / 7`.
`p_t` is the done days in the trailing seven days divided by `min(weeklyTarget, available days in that window)`,
capped at 1. Off days and paused days are skipped (no update), and an open today is left out until logged, so
looking at the app in the morning never lowers the score.

### 4.5 Busy allowance

At most `busyPerMonth` busy marks per track per calendar month (default 2, adjustable 0-10). Fixed rest weekdays
are unlimited because they are planned in advance.

## 5. Sprints

Code: `src/core/sprint.ts`, tests: `tests/sprint.test.ts`. A sprint has a title, a concrete deliverable, a start
and end day, and milestones. Progress = finished milestones / total. Time = elapsed days / total days. Pace:
`ahead` if progress leads time by at least 15 points, `on-track` if it trails by at most 20 points, otherwise
`behind`; plus `not-started`, `overdue`, `done`, `dropped`, `no-milestones`. Sprints outside 14-28 days get a
warning, not a block. One active sprint per track; starting a new one closes the old one as dropped.

## 5a. Roadmap and sprint planning

Code: `src/core/roadmap-parse.ts`, `src/core/roadmap.ts`, `src/core/plan.ts`, views in `src/views/roadmap.ts`.
Tests: `tests/roadmap-parse.test.ts`, `tests/roadmap.test.ts`, `tests/plan.test.ts`.

Problem: with an existing syllabus (a 30-lesson course, a book) typing every milestone by hand was the main
friction, and there was no view of the whole path, only of the current sprint.

Model. Each track has an ordered list of roadmap items (`RoadmapItem`: title, optional phase, optional estimate
in minutes or sessions, optional link, done and doneOn). Sprint milestones may carry `itemId`; a linked milestone
and its item always share done state (`setItemDone`, `setMilestoneDone`). Sprints that are already closed (done
or dropped) are history and are not changed when an item is ticked later. Sprint status gains `planned` for
future sprints of a plan.

Import (paste box, file, or the optional box on the new-track form). Detection: text starting with `[` or `{` is
JSON (`[{title, phase?, minutes? | sessions?, link?, done?}]` or `{items: [...]}`); a first line with a separator
and a `title`/`tên` column is CSV; anything else is a Markdown-like outline:

- `# heading` starts a phase. If the text has any list markers (`-`, `*`, `+`, `1.`, `1)`, `a)`), an unindented
  line without a marker is also a phase; without any markers every line is an item.
- A list item with deeper-indented children is a group; its children get the phase `Phase · Group`.
- A trailing `(45m)`, `(45 phút)`, `(1h30)`, `(1,5 giờ)` is a minute estimate; `[2]`, `[2 buổi]`, `(2 buổi)` is
  a session estimate. A bare `(3)` is kept as part of the title because it is ambiguous.
- `- [x]` marks an item done (without a date, so it does not inflate the recent pace). Markdown links,
  `<url>` and a trailing bare URL become the item link. At most 500 items.

The preview shows counts, phases and the first 80 items, plus the plan summary; one confirm writes the items and
the sprints. Nothing is saved before that.

Effort. One item costs `minutes / sessionMinutes` sessions, or its session estimate, or `1 / itemsPerSession`
sessions when it has no estimate. Defaults: 45 minutes per session, 1 item per session; both are per track and
editable in the import and planner screens. Weekly capacity = `min(weeklyTarget, 7 - restDays)` sessions, one
session per active day. These are assumptions, not research findings.

Planner (`proposePlan`, `layoutPlan`). Items are filled in roadmap order into sprints of the chosen length
(2, 3 or 4 weeks; default 3) up to `weeks x capacity` sessions. An item larger than a whole sprint gets a sprint
of its own and a warning. A short tail (needing under 2 weeks) is folded into the previous sprint when that sprint
can grow to at most 4 weeks; otherwise the last sprint is shortened, never below 2 weeks (`SPRINT_MIN_DAYS`,
`SPRINT_MAX_DAYS`). Sprints follow each other without gaps. The user can change each sprint's length and title
and move items across a boundary before creating. Creating replaces earlier `planned` sprints of the track; the
active sprint is kept unless the user ticks "close and re-plan" (pre-ticked only when it is behind or overdue).
With no active sprint, the first new sprint is active and the rest are planned. A planned sprint starts only when
the user presses "Bắt đầu đợt này" or "Bắt đầu từ hôm nay" (the latter shifts it and later planned sprints by the
same number of days).

Progress. `% done` = done effort / total effort when at least one item has an estimate, otherwise done items /
items. Phase boundaries are ticks on the progress line; the line has the same moving beam as the sprint bar and
stops under reduced motion or a hidden tab.

Projection (`projectRoadmap`), shown as an estimate with the assumptions written out on screen:

- Window: the last 28 days, or fewer when the track (or its first record) is younger.
- Active day: a day with a log of the track or an item finished. Pace = effort of items finished in the window /
  active days in the window. Observed frequency = active days x 7 / window days.
- Recent-pace finish = today + ceil(remaining / pace x 7 / frequency) days.
- Target finish = today + ceil(remaining / weeklyTarget x 7) days, i.e. one session per active day at the target.
- Planned finish = the end of the last open sprint holding a remaining item, when every remaining item is planned.
- Confidence: `ok` with at least 14 days of window, 4 active days and 3 items; `low` with less; `none` with no
  finished item in the window (no recent-pace date is shown).
- Re-plan suggestion (never automatic): a linked active sprint is overdue, the recent-pace finish is more than
  7 days after the planned finish, or some remaining items are in no sprint. Dates change only when the user
  confirms a new plan.

## 6. Weekly review

Code: `src/core/summary.ts`, tests: `tests/summary.test.ts`. For the selected week, per track: days against
target and whether the week was met, minutes, full sessions versus tiny steps, milestones finished that week,
the sprint line, evidence (links, notes, image placeholders), blockers, and the next step. The user's own notes
(done, blockers, next week) are appended. The text starts with a short request for feedback so it can be pasted
directly to a bot or mentor. Images are not embedded; the summary says they are stored in the app.

## 7. Re-entry

Code: `src/core/reentry.ts`. For a paused or stalled track the app shows the last note, the smallest next step
(the step written when stopping, else "10 minutes on" the next milestone, else the tiny action), a lighter
first-week target (half the usual, rounded up), and a choice between returning today and returning next Monday.
The log dialog always asks for the next small step so it is ready after a break (design choice, untested).

## 8. Storage, backup and privacy

IndexedDB database `nhip`, schema version 2 (`src/core/schema.ts`): stores `tracks`, `sprints`, `roadmap`,
`logs`, `marks`, `reviews`, `settings`. Upgrades are incremental (`storesToCreate(oldVersion)`): a version 1
database keeps all its data and only gains the `roadmap` store. After every load `migrateData` renumbers roadmap
orders per track and drops milestone links to missing items, writing back only the records it changed. An open
tab with the old version closes its connection on `versionchange` so the new version can upgrade. Data never
leaves the browser and is not hardcoded; demo data is generated on demand and flagged.

Backup file (`src/core/bundle.ts`): `{ app: "nhip", version: 2, exportedAt, tracks, sprints, roadmap, logs, marks,
reviews, settings }`, named `study-hub-backup-YYYY-MM-DD.json` (older files were named
`tracking-status-backup-*.json`; the name does not matter for import).

- Version 1 files (and files without a version) import as version 2 with an empty roadmap.
- A non-integer or newer version is rejected with a message asking to update the app first.
- Validated: every record is normalized; invalid or orphaned records (unsafe link schemes, non-image data URLs,
  unknown tracks) are dropped and counted.
- Preview: the import dialog shows per-type counts in the file, in the browser, and what a merge would add.
- Merge (default) adds records whose id is new and never deletes; a rest or busy mark is skipped when that track
  already has one on that day; for weekly reviews the newer `updatedAt` wins; current settings are kept.
- Replace swaps everything and requires an explicit confirmation checkbox.
- Reminder: when the last export is 14 or more days old (or never) and there are at least 5 non-demo logs, Today
  shows a dismissible banner; Settings always shows "Lần sao lưu gần nhất cách đây N ngày". The last export time
  is stored in `localStorage` (`nhip:last-backup`), not in the backup itself.
- Settings shows whether the browser granted persistent storage and offers `navigator.storage.persist()`.
  MDN (StorageManager.persist, accessed 2026-11-15): the browser "may or may not honor the request"; persistent
  storage is not cleared except by explicit user action, best-effort storage may be cleared under pressure.

Cloud sync (S3 or similar) was considered and deliberately left out: it would need authentication and a backend,
and no long-lived credentials may live in the browser. A JSON file kept in a personal cloud drive covers the
owner's need for now.

Images are resized to at most 1280 px and stored as JPEG data URLs inside the log, so they are part of the backup.

## 9. Known limitations

- No sync between devices; moving data means export and import.
- Roadmap projections assume the recent pace continues and every session is the same length; they ignore planned
  pauses in the future. Estimates in the pasted text are taken as written. Reordering is by up/down buttons, no
  drag and drop yet.
- Timer notifications from a hidden tab can arrive late: MDN (setTimeout, accessed 2026-11-15) documents
  throttling of timers in inactive tabs (at least 1 s in Chrome, longer under intensive throttling). The elapsed
  time itself stays correct because it is recomputed from timestamps.
- Notifications use `ServiceWorkerRegistration.showNotification` when a service worker is active (required on
  Android Chrome, where the `Notification` constructor throws), else the constructor; the PWA service worker is
  only registered in production builds.
- Images live inside IndexedDB and the export file; many large images make the backup big.
- The research above mostly studies simple habits, consumer apps or workplaces. Whether these rules improve
  long-term learning of complex skills for this user is untested.
- No dark theme yet. No screen reader or automated accessibility audit has been run.

## 10. Visual language

Direction: "cool console", chosen to look clearly different from the owner's other app (Omni Feyn) and to borrow
the clarity of AI developer-tool sites. References viewed on 2026-11-15 (Asia/Saigon):

- harness.io: light grey-blue canvas, mono uppercase letter-spaced eyebrows, dashed connector lines with nodes,
  black pill buttons. A third-party teardown (pixlpin.com/d/harness, secondary source) describes "3D pipeline
  conduits, scroll-driven animations".
- deepseek.com/en/harness: atmospheric blue gradient, mono eyebrow label, clean sans headings.
- magicui.design "Animated Beam": a gradient beam travelling along a connector path between nodes.

What the app takes from them:

- Canvas `#f5f7fa` with a faint dot grid, white panels with 1 px hairline borders, 8-12 px radii, ink `#0d1321`
  primary buttons, mono (`ui-monospace`) eyebrows, numerals, pace tags and the timer readout.
- One flow gradient (blue `#3b5bfd` to `#2a8de0` to cyan `#14b8c6`) used only where something connects or
  progresses: the 7-day chain (nodes joined by links; an unbroken link carries a moving highlight), the weekly
  target bar (a highlight runs over the reached part), the sprint bar, the milestone rail (diamond nodes on a
  line filled to the share of milestones done), the Today header (dashed paths with travelling beams), and the
  timer ring (gradient progress plus a rotating comet while running).
- All flow animations are transform or stroke-dashoffset based, run only under
  `prefers-reduced-motion: no-preference`, and pause when the tab is hidden (`html.is-hidden`). With reduced
  motion the beams are removed and everything is static.

Layout (audited automatically at 360, 390, 768, 1024, 1280 and 1440 px for horizontal overflow):

- Up to 719 px: compact top brand, 5-item bottom tab bar (Hôm nay, Đồng hồ, Tuần, Thành quả, Cài đặt), round
  quick-log button, timer dock above the tab bar while a session is open, safe-area insets.
- 720-1099 px: top tab bar, two-column cards where they fit, labelled quick-log button.
- 1100 px and up: left side nav; timer page splits into a sticky clock and a settings column (from 960 px).
- 1400 px and up: wider content (up to 1380 px) and track cards that fill the row.

Logging speed is unchanged: one-tap "Đã làm bước nhỏ" on each Today card, "Ghi nhanh" (G) everywhere, and
"Bấm giờ học" on each card to start the timer for that track with the last-used mode.

## 11. Study session timer

Code: `src/core/timer.ts` (pure math, unit tested), `src/session.ts` (runtime), `src/views/timer.ts` (UI).

- Modes: stopwatch (counts up), countdown (fixed minutes, capped at the target), Pomodoro. Pomodoro defaults to
  25 minutes focus, 5 minutes short break, a 20 minute long break after every 4 focus blocks, following the usual
  description of the technique (Wikipedia, "Pomodoro Technique", accessed 2026-11-15: 25-minute intervals, short
  breaks, a 20-30 minute long break after four). All four values are configurable, with presets 25/5, 50/10 and
  15/3.
- State is a small JSON object in `localStorage` (`nhip:timer`): `startedAt`, `runStart` (null while paused),
  accumulated running time `accMs`, and the index of the last announced boundary. Elapsed time is always
  `accMs + (now - runStart)`, so reloads, sleeping tabs and other open tabs (via the `storage` event) agree. A
  clock that moves backwards never yields negative time.
- Ticking: a 1 s interval only while running and visible, plus one timeout at the next boundary (end of a
  countdown or a Pomodoro phase). Each boundary is announced once (chime, notification) even after a reload.
- Stop opens a save sheet with the track, minutes (Pomodoro counts focus minutes only), and a suggested type
  (15 minutes or more suggests a full session). It saves the same `LogEntry` as quick log; "Thêm chi tiết" opens
  the full log dialog pre-filled. Discard asks for confirmation.
- Optional extras: a short WebAudio chime (primed on a user gesture), browser notifications, and a screen wake
  lock that is re-acquired when the tab becomes visible again (the browser releases it when hidden; MDN Screen
  Wake Lock API, accessed 2026-11-15). Unsupported features are shown as unavailable instead of failing.
