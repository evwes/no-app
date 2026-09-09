# Morning brief — 2026-09-10 (written 2026-09-09 23:15Z / 7:15 PM ET)

## The headline

**Two mirrors to main today, and the second-largest single recovery the
project has found is one run away from landing.** Confident lineups went
59,610 → 59,764 with **zero losses in either mirrored run**. Meta Platforms —
**$22.4B, 84,993 participants**, currently showing nothing — has been verified
locally to parse as a 21-fund menu at ratio 1.000 and is waiting on run #242.

## What went live

**Mirror 1 — `c2f58da7` (v114 + v115).** +123 confident lineups, **0 lost**;
$8.3B and 100,550 participants of newly published menus.

- **v114** — a schedule page that prints only the Form 5500's prescribed
  column caption ("Identity of issue, borrower, lessor…") and no page title
  used to read as "no heading anywhere". All 32 live plans in that bucket were
  opened rather than sampled; 28 now publish a real menu.
- **v115** — the same caption seed, allowed to run for `band-hi`, where the
  fair-value hierarchy note was being summed beside the real menu. Nuvance
  $1.2B, CMFG Life $1.1B, Maritime Assoc. $1.0B, Vandalia $853M, SRI
  International $787M, F.N.B. $603M. Every published value across the sampled
  recoveries appears verbatim in its own filing.

**Mirror 2 — `120765b4` (v116).** +1 confident: **Paychex, $2.3B, 19,991
participants**, whose schedule is headed "(Dollars, Units, and Shares in
Thousands)" — a phrasing every scale-marker arm missed, so a real 39-fund menu
summed to 0.23% of the plan. Predicted 1 and no losses; delivered exactly that.

**Also live:** plans whose Schedule D names a master trust we cannot link now
**name the trust** instead of blaming our reading (Genentech's $14.3B sits
behind ROCHE US DC PLANS MASTER TRUST, which files no MTIA with EFAST2).

## What is HELD, and why

**v117 is written, gated and running — not mirrored.** The branch currently
carries a **partial** store (44,466 acks at pv=116 beside 24,237 at pv=117)
and must not be mirrored until run #242 completes and the pv distribution
shows one dominant version. That is the standing pre-mirror check.

**v117 is the Meta fix.** Its 214-page attachment is entirely a
substituted-font cipher; OCR reads it perfectly, but the OCR'd schedule was
being thrown away because the cipher text had yielded one junk row — so the
parse "succeeded" and the combined-text branch (gated on image-table pages)
never ran. Adoption now fires for any non-confident text parse and requires
the combined parse to be confident **and menu-shaped (≥7 rows)**. That second
clause is the whole safety margin: without it, a random 30-filing draw gave
five "gains" of which **four were OCR debris** — the sponsor's own name as an
$827k holding, "@ Total non", "J Other Wiabilities eee eee teee". Projected
~39 plans plus Meta.

**Also landing with it:** 64 plans stop being told "we could not read it" when
their filing reports the whole plan on one line (Master Pooled Separate
Account, 403(b) annuity contracts, and similar) — bit 4096 extended, verified
by a local merge at 398 → 462.

## What was found wrong today, and it was mine

**I destroyed run #239 — about 32 minutes of parse wall clock.** I pushed a
`scripts/**` commit without `[skip ci]` because I had concluded, from three
kick pushes that produced no run, that the push trigger was dead. It is
**intermittent**, and it fired. Worse, I then reported the near-miss as caught:
I cancelled the offending run and saw #239 still reading `in_progress`, which
lags its already-issued cancellation. It did not survive.

Nothing was published wrongly and no data was corrupted — the partial store is
internally consistent and is being completed now — but the reporting error is
recorded in `docs/accuracy-log.md` next to the original claim, unedited, along
with the two rules: `status` is not `conclusion`, and the pv distribution is
the completeness test that cannot lie.

## Waiting on you

1. **GitHub Pages must serve `main`** (Settings → Pages) — still the blocker
   for "live".
2. **Custom domain DNS.**
3. Approval for the daily accuracy Routine (the hourly self-bind cycle is
   running and healthy).

## What continues overnight

- Run #242 finishes v117 → verdict → loss triage → mirror, then the next
  queued parser change dispatches immediately.
- Queued and measured, not yet built: the **prior-year feature fallback**
  (27 plans lost a displayed match/vesting formula this morning purely because
  their newest filing now parses its own schedule — a dated "as filed for plan
  year N−1" label would keep those visible), and the `nohead/unread` bucket
  (11 live plans, $178M, table-shaped pages under a heading we do not know).
