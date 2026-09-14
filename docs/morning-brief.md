# Morning brief — 2026-09-14

## The headline

**Second quiet day in a row, and it means the same thing it meant yesterday:
the work queue is empty except for the three things only you can decide.**
Nothing shipped, nothing broke, nothing regressed.

The pipeline ran through the weekend. Five data commits since midday Saturday,
every one of them timestamps only — no new filings arrived, so **coverage is
byte-identical across all of them: 60,089 fund menus, four audit findings at
the long-standing baseline, 99.9% of filings read.** Today's coverage line is a
single distinct value, which is the correct shape for a weekend.

## Waiting on you — the entire queue

1. **GitHub Pages must serve `main`** (Settings → Pages). Still the last
   blocker on "live", and it has been the last blocker for a while now.
2. **Custom domain DNS.**
3. **Where to point parser effort.** Measured, unchanged from yesterday:

| option | people affected | what it needs |
|---|---|---|
| **vesting** | **23.2M** | new pattern work — 11,838 live plans |
| match | 13.5M | new pattern work + one re-parse |
| short-form form codes | 7.35M | **display only** — data already in hand |
| fund menus | ~86 plans | parser work, and it is nearly exhausted |

My recommendation is unchanged and I'll keep making it until you rule on it:
**the third row is the cheapest thing that helps the most people.** 7.35 million
people on short-form filings see headline numbers and nothing else today, while
the characteristic codes they actually filed — 83% of them report a
match-or-after-tax code — are already in our data. That is a page, not a
pipeline, and it needs no re-parse.

## Why I have not just started one of these

The first two are settings I cannot reach. The third I deliberately have not
picked for you: the tests say vesting and match are **new coverage, not
repairs** — 0 of 120 sampled match sentences and 1 of 120 vesting sentences
were defects in our parsing. Under the standing accuracy directive I fix
defects without asking. Building new coverage is a direction, and directions
are yours.

## What runs today without you

Monday, so the weekly sweep fires on top of the hourly cron. GitHub's scheduled
start times drift by hours on free runners, so a late weekly run is not a
dropped one — don't read one before about noon UTC as a failure. The audit and
the auto-managed findings issue run with it.

Nothing is blocked on anything except the three items above.
