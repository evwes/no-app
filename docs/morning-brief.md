# Morning brief — 2026-09-10 (rewritten 04:10Z / 12:10 AM ET)

## The headline

**Three mirrors, +284 confident lineups, and one regression caught before it
reached the site.** Confident went 59,610 → **59,894** on main, all of it with
**zero losses in every mirrored run**. Then run #244 lost 31 stored lineups and
was NOT mirrored; the fix is running now.

*(This replaces the 23:15Z version, which said v117 was running and Meta would
land. v117 landed and was mirrored; Meta did not — see below.)*

## What is live on main right now

`c130d250` — the complete **v117** store, 59,894 confident lineups, HIGH at the
known baseline of 4.

- **v114 + v115** (+123, 0 lost): the statutory column caption now seeds a
  region, and the same seed runs for `band-hi` so the fair-value note stops
  being summed beside the real menu. Nuvance $1.2B, CMFG Life $1.1B, Maritime
  Assoc. $1.0B, Vandalia $853M, SRI International $787M.
- **v116** (+1, 0 lost): Paychex — $2.3B, 19,991 participants — whose schedule
  is headed "(Dollars, Units, and Shares in Thousands)", a phrasing every
  scale-marker arm missed. Predicted 1 and no losses; delivered exactly that.
- **v117** (+160, 0 lost): $4.9B and 66,108 participants, from every diagnosis
  bucket at once. Projected ~39.
- Plans whose Schedule D names an unlinkable master trust now **name the
  trust** instead of blaming our reading; 64 more plans say "filed in
  aggregate" where that is true of the filing.

## What went wrong, and what it cost

**Run #244 (v118) lost 31 stored lineups — $18.1B, 361,761 participants —
including Lowe's at 318,750 people.** It is not mirrored. The audit caught it:
HIGH went 4 → 25 while the coverage line was *rising*, which is the whole
reason the loss auto-triage exists.

Every lost plan had its lineup from the PRIOR-YEAR filing. Lowe's 2023 fallback,
re-run by hand under the same code, still gives its real 31-fund menu at ratio
0.945 — so neither the parser nor the gates rejected it. 975 other plans kept
their fallback, so the input file was present. About 3% of fallback attempts
failed to load, which is what transient S3 errors look like under v118's much
heavier request load — **and a bare `catch` threw the reason away**, leaving
"keep the primary outcome" as the policy even when the primary outcome is worse
than what is already stored.

**v120 (running now, run #246)** gives the fallback path the protection the
primary-download path has had since v37: a fallback that cannot be READ keeps
the stored lineup and retries next run. A fallback that loads and is merely
judged worse is untouched, so a bad lineup can still be withdrawn on the merits.

**I also cost a run earlier in the evening** by pushing a `scripts/**` commit
without `[skip ci]` — about 32 minutes — and then reported the near-miss as
caught when it was not. Both the original claim and the correction are in
`docs/accuracy-log.md`.

## Meta Platforms: found, understood, not yet landed

$22.4B and 84,993 participants, currently showing nothing. Its 214-page
attachment is entirely a substituted-font cipher; OCR reads it perfectly and
the schedule parses to a **21-fund menu at ratio 1.000**. v117 widened which
OCR results may be adopted and Meta still did not move, because the OCR block
never ran for it at all — I had asserted it did, from a status field that does
not mean what I took it to mean. v118 fixes the trigger and v119 is queued
behind it. Meta lands when those run clean.

## The largest thing on the board is now open again

**1,943 live plans, 1,876,769 participants, $81.0B** have a lineup but no match
or vesting details. That class was filed under "not worth parser work" on a
measurement of whether the NEWEST filing has notes. The prior year is a
different question and had never been asked — the fallback only ever fired when
the newest filing had no LINEUP. Where it has been asked, the prior year
supplied the notes **92% of the time** (an upper bound, from a biased
population). **v119** widens it; the run measures the real rate.

## Waiting on you

1. **GitHub Pages must serve `main`** (Settings → Pages) — still the blocker
   for "live".
2. **Custom domain DNS.**
3. Approval for the daily accuracy Routine. The hourly self-bind cycle is
   running and is what caught the #244 regression.

## Continuing overnight

Run #246 (v120) → verdict → loss triage → mirror only if the pv distribution on
the branch is at least as complete as main's, then v119 dispatches. Queued and
measured but unbuilt: six `nohead/unread` plans under recordkeeper headings, and
the OCR cost of v118 — #244 hit its shard time budget and left 11,432 acks
unparsed, so the widening needs its waste trimmed.
