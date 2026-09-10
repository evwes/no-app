# Morning brief — 2026-09-10 (rewritten 04:10Z / 12:10 AM ET)

## The headline

**Three mirrors, +284 confident lineups, and two problems caught before they
reached the site.** Confident went 59,610 → **59,894** on main, all of it with
**zero losses in every mirrored run**. Then run #244 lost 31 stored lineups and
was NOT mirrored; the fix is running now. Looking into that turned up a second,
quieter problem in the same run — it never read a sixth of the filings, and no
check we had could see that.

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
not mean what I took it to mean. v118 fixes the trigger, and it is in the run
going now. Meta lands when that run comes back clean.

## The largest thing on the board is now open again

**1,943 live plans, 1,876,769 participants, $81.0B** have a lineup but no match
or vesting details. That class was filed under "not worth parser work" on a
measurement of whether the NEWEST filing has notes. The prior year is a
different question and had never been asked — the fallback only ever fired when
the newest filing had no LINEUP. Where it has been asked, the prior year
supplied the notes **92% of the time** (an upper bound, from a biased
population). **v119 widens it, and it is running now** — bundled into tonight's
run rather than held for a later one, so the real rate gets measured tonight.

## v121, built tonight: five small plans that had been publishing nothing

Small employers often attach the recordkeeper's own statement instead of a
statutory schedule, and the menu sits under a house title the parser had never
been taught. Five now publish — **$115.5M and 4,436 participants**, every value
verbatim in its filing:

| plan | people | assets | rows |
|---|---|---|---|
| Commercial Vehicle Group | 2,483 | $67.3M | 29 |
| Medical Device Components | 373 | $24.9M | 26 |
| MPB Hotel | 477 | $10.8M | 19 |
| Atrium Consulting | 937 | $7.7M | 16 |
| Innovative Cosmetic | 166 | $4.8M | 27 |

**The interesting part is the one I did not ship.** A sixth title, "Current
Plan Assets", was on the list because an earlier hand review of these filings
said it belonged there. Running it showed it is not a recordkeeper title at all
— it is a heading inside an *adviser's* pitch deck, printed in two columns with
a chart beside the holdings. The parser read the chart: it published **"0.0
Median Market Cap" as a $1,097,571 holding**, 46% of that plan's money, and the
totals still came out plausible. Only the nonsense *names* gave it away. It is
dropped, and pinned as a permanent test so it can never come back.

That same hand review was also wrong the other way — it had written off
Commercial Vehicle Group, the largest recovery in the group, as "not ours".
Reading a filing and running the parser over it are two different measurements,
and only the second one ships.

## A second thing #244 did, found overnight and now measured

**Run #244 never read a sixth of the universe, and nothing noticed.** 11,495 of
its downloads failed — 16.72% — against 63 (0.09%) in the run an hour earlier.
Those plans correctly kept their stored lineups, so **nothing was lost**; but
they were not re-read either, while the coverage line went up and every audit
check passed.

I had this filed as "the shards hit their time budget". They did not: all
thirteen finished in ~84 minutes against a 320-minute budget. A second theory —
disk exhaustion from OCR — was also wrong. The store answered it exactly once
asked: every one of those acks carries `e: "download"`.

**Whether v118 caused it is still open**, and I am not going to claim it did.
main's 0.09% was measured an hour before #244 ran, so "an S3 incident" fits the
evidence just as well as "the new code". Run #246 is the measurement that
separates them.

What is not open is that this was invisible. The pipeline measured whether
published data is right and never whether a run had actually read it — the same
blind spot that let cancelled run #239 commit a half-finished store. Both now
raise a HIGH: `partial-store` when the dominant parser version covers under 97%
of plans, `download-failures` when fetch failures pass 1%. Both are reasons not
to publish rather than errors, since some filings are withdrawn from the
government bucket permanently and always fail. Verified both ways — it fires on
#244's store, stays silent on the good one.

## Waiting on you

1. **GitHub Pages must serve `main`** (Settings → Pages) — still the blocker
   for "live".
2. **Custom domain DNS.**
3. Approval for the daily accuracy Routine. The hourly self-bind cycle is
   running and is what caught the #244 regression.

## Continuing overnight

Run #246 (v120) → verdict → loss triage → **download-failure rate**, which is
now the first question asked of it → mirror only if the store is at least as
complete as main's. v119 and v120 are both already IN that run, so its verdict
covers the features work too. (#246 started before the new check existed, so I
run it against its output by hand.) **v121 is built, gated and waiting to
dispatch the moment #246 lands.**
