# Nhip: design notes

Status: v0.2, local only. Research accessed on 2026-11-15 (Asia/Saigon). Every source below was opened or
searched on that date; where only a secondary source was read, it is marked as such.

## 1. Problem

The owner learns side skills in bursts (video editing a few weeks ago, a DevOps lab that is now stalled) and
feels something is missing that keeps motivation going. His own framing: on many days there is no time to learn
much, but he wants to keep the rhythm ("1 ngày có thể không học được nhiều, nhưng làm sao vẫn giữ được nhịp độ").

Observation from his earlier projects (inference, not measured): side projects with a visible output and a clear
"done" point get finished; open-ended learning without a deadline, an artifact, or someone who looks at the
result tends to stall.

## 2. Name

`nhip`, shown in the UI as "Nhịp" (Vietnamese for beat, rhythm, pace).

- It is the word the owner used for the core need: keep the pace ("giữ được nhịp độ").
- One short word, ASCII-only in the repo name, readable by Vietnamese speakers without explanation.
- Follows the naming rule that app names must not use a `-lab` or `Lab` suffix.
- Alternatives considered: `giu-nhip` (clearer but longer), `steady` and `cadence` (English, generic, more
  name collisions).

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

## 8. Storage and privacy

IndexedDB database `nhip` with stores `tracks`, `sprints`, `logs`, `marks`, `reviews`, `settings`. Data never
leaves the browser. Export writes one JSON file (`app: "nhip", version: 1`); import validates and normalizes each
record, drops invalid or orphaned ones (unsafe link schemes, non-image data URLs, unknown tracks), and replaces the
current data after confirmation. Images are resized to at most 1280 px and stored as JPEG data URLs inside the log.

## 9. Known limitations

- No reminders or notifications: the app cannot nudge at the planned time.
- No sync between devices; moving data means export and import.
- Images live inside IndexedDB and the export file; many large images make the backup big.
- The research above mostly studies simple habits, consumer apps or workplaces. Whether these rules improve
  long-term learning of complex skills for this user is untested; the app should be judged after a few sprints.
- No dark theme yet. Form fields have labels and controls have visible focus outlines, but no screen reader or
  automated accessibility audit has been run. Motion is disabled when `prefers-reduced-motion: reduce` is set.

## 10. Visual language and logging speed

The UI is a warm paper surface (cream background, rounded cards, soft shadows) with a deep teal accent. The
intent is a notebook that feels easy to open, not a dashboard of metrics. Motion is used for orientation, not
score-chasing: page enters and staggered card rises, a short burst and ring fill when a tiny step is logged,
animated week segments and momentum rings, number count-up after a log, hover/press states, and a skeleton
while IndexedDB loads. Every animation is skipped when the user prefers reduced motion.

Layout:

- Narrow screens (around 390px): a compact top brand, a bottom tab bar with icons, a round "Ghi nhanh" button
  above the bar, and safe-area insets for notched phones.
- Mid widths (around 768px): a top tab bar, two-column track cards when space allows, and a labelled quick-log
  button.
- Wide screens (1100px and up): a left side nav and a multi-column dashboard, including a row of momentum rings
  in the Today header.

Because the user logs by hand, one-tap "Xong bước nhỏ" stays on the Today card, and a floating "Ghi nhanh"
button (keyboard shortcut G, with L as an alias) is available on every non-editor page. The sheet remembers
the last track, kind and duration in `localStorage` (`nhip:log-prefs`); these prefs are not part of the JSON
export, so backups stay compatible. One-tap "Xong bước nhỏ" is unchanged: it still stores 0 minutes and the
track's tiny-action text.
