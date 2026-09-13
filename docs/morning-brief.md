# Morning brief — 2026-09-13

## The headline

**Nothing changed yesterday after mid-morning, and that is the correct
outcome rather than a stall.** Everything I could measure or repair without a
decision from you is done. What is left needs you to pick a direction, and
picking it for you would be the wrong call.

The pipeline ran every hour overnight, ingested no new filings, and committed
nothing but timestamps. Coverage is flat on purpose: **60,089 fund menus, four
audit findings at the long-standing baseline, 99.9% of filings read.**

## Waiting on you — unchanged, and now the whole queue

1. **GitHub Pages must serve `main`** (Settings → Pages). Still the last
   blocker on "live".
2. **Custom domain DNS.**
3. **Where to point parser effort.** All four options are measured now, which
   they were not two days ago:

| option | people affected | what it needs |
|---|---|---|
| **vesting** | **23.2M** | new pattern work — 11,838 live plans |
| match | 13.5M | new pattern work + one re-parse |
| short-form form codes | 7.35M | **display only** — the data is already in hand |
| fund menus | ~86 plans | parser work, and it is nearly exhausted |

If you want the cheapest thing that helps the most people, it is the third row:
7.35 million people on short-form filings currently see headline numbers and
nothing else, while the form codes they filed — 83% of them report a
match-or-after-tax code — are already sitting in our data. That is a page, not
a pipeline.

## What shipped the previous morning, now settled and live

- **A regression of mine, found and undone.** Eight plans — Genentech 36,458
  people, Conagra 28,863, A.O. Smith and five smaller — had been downgraded
  from naming their master trust to a vaguer sentence. They name it again.
  CI green, mirrored.
- **A diagnosis that divided by almost nothing.** 28 plans with under $1M in
  assets were being labelled "holdings exceed plan assets" on ratios as absurd
  as 1.68 billion percent. They now get an honest label and no ratio at all.
  Positive- and negative-controlled. It takes effect on the next full re-parse,
  which is noted where someone would otherwise read the flat census as failure.

## What continues without you

The hourly pipeline, the audit, and the auto-managed findings issue all run
whether or not anyone is watching. Two small plans publish menus covering about
half their money, flagged and visible; one master trust will retry itself.

Nothing here is blocked on anything except the three items above.
