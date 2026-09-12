# Morning brief — 2026-09-12

## The headline

**Nothing on the site changed overnight. What changed is that the decision
you've been sitting on now has a third option, and it's the biggest one.**

I spent the night measuring rather than building, because four numbers in my
own notes turned out not to survive being re-derived. Two of them were badly
wrong in a way that matters to you.

## The decision, restated with every number now measured

| option | people affected | what it needs |
|---|---|---|
| **vesting** | **23.2M** | new pattern work — 11,838 live plans |
| match | 13.5M | new pattern work + one re-parse |
| short-form form codes | 7.35M | display only, data already in hand |
| fund menus | ~100 plans | parser work, and it's nearly exhausted |

Last night I told you the choice was menus versus match. **Vesting is larger
than both and I had it recorded at less than a quarter of its true size.**

## Where I was wrong, on the record

**The vesting gap was written down as 5,648. It is 11,838 live plans and
23,213,865 people.** The published figure — 52,825 plans with vesting shown —
agrees exactly with the pipeline's own metric, so the arithmetic was never in
doubt; the gap number had simply never been derived from it. Of those:

- **5,440 plans / 11.4M people**: the audited notes were read and never mention
  vesting at all (Microsoft, Boeing, IBM, Costco). Not ours.
- **4,834 plans / 10.4M people**: we hold a vesting sentence from the filing and
  publish nothing from it. This is the workable half.

I tested whether that 4,834 is a *bug* or *missing capability*, the same way I
tested match: feed each stored sentence to the parser on its own. **1 defect in
a random 120.** So it is new capability, which is why it stays your call rather
than something I start.

**And the recordkeeper gap was recorded as 4,577 — it's 1,419, and none of it
is ours.** 69% of that number was wind-down ghosts: plans already terminated,
counted in a column whose own heading says ghosts were removed. Of the live
remainder, **zero** have a Schedule C provider row we failed to read. I opened
eleven filings to check — eight drawn at random — and none named a provider we
missed. Icon Clinical Research is the type case: 16,374 people, $982,836 of
plan-paid expense, Schedule C filed, and every name field deliberately blank
under the exemption that covers fees netted from fund expense ratios. Lawful
silence. **Nothing shipped, because the page already says the true thing.**

## The fund-menu question is now closed

Every bucket has a measured reachable number for the first time:

| bucket | plans in it | actually reachable |
|---|---|---|
| fewer than 3 rows | 532 | ~70 |
| no heading found | 417 | 4 |
| statement, not a menu | 253 | **under 10** |
| holdings exceed plan assets | 128 | **17** |

**~101 plans out of 1,461.** The rest is documented absence, correct
suppression, or a filing too thin to publish from. I gave you "roughly a
hundred" last night as an estimate; it is now four measurements that happen to
agree with it. The two new cells are the ones that were guesses before.

## One thing I fixed in the machinery

Three weeks ago I widened a rescue that fills in a plan's features from its
prior-year filing, and wrote next to the code that "the run measures the real
rate." **It never did.** Every success was recorded; no attempt ever was, so
the rate had no denominator on any run ever made. That is the same shape as the
silent failures that cost eleven thousand filings in a single run last week —
found this time before it cost anything, because the promise to measure was
written down beside the code that didn't.

It's instrumented now and tested end-to-end on a crafted case. The rescue's
success side, which nobody had ever read off the store: **1,467 live plans,
1.22M people, served from a prior year's notes today** — larger than the gap
that remains.

## Three times a shortcut produced a wrong number, and the controls caught it

Worth recording because the pattern is the same each time and it is mine, not
the data's:

- I wrote my own "is this a real fund name" test and it returned **48 plans**;
  the project's own shipped version returns **17**. Mine was counting
  `"Ending Balance"`, `"Thereafter"` and `"YEAR"` as funds.
- I built a plan list by hand and got **327 plans / 1.4M people** where the
  real tool gives **253 / 142,545** — I'd swept in Kroger, Disney and
  Caterpillar. The implausible size was the tell.
- Five vesting sentences looked truncated, which would have made the gap *ours*
  and mine to fix. Running the same test on the sentences that parse fine
  killed it: the "defect" signal is **eight times more common in the healthy
  control** than in the gap.

All three were caught before anything was published. The rule earning its keep
is boring: reproduce the known count before classifying anything, and reach for
the shipped predicate instead of writing a new one.

## What continues

- Two plans publishing a menu covering half their money, and one master trust
  that will retry itself.
- The feature-fallback counters produce their first real numbers on the next
  full re-parse; they printed nothing on the incremental run, which is correct
  and is now written down so nobody reads it as a fault.

## Waiting on you

1. **GitHub Pages must serve `main`** (Settings → Pages) — still the last
   blocker on "live".
2. **Custom domain DNS.**
3. **Where to point parser effort**, now that all four options are measured
   rather than three measured and one guessed. Vesting is the largest by
   people; the short-form option is the cheapest by far, since the form codes
   are already in hand and only the page is missing. Menus are nearly done and
   what's left of them is small. I have deliberately not started any of these.
