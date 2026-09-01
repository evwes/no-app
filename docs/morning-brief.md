# Morning brief — 2026-09-01

*Overwritten nightly. Written 05:00 ET; run #189 was still parsing, so its
verdict is marked pending rather than guessed.*

## What shipped to the live site overnight

| change | effect |
|---|---|
| **T. Rowe Price trusts priced as trusts** | 794 names / 1,431 rows / **$15.84B** were showing a *mutual fund's* fee for a collective trust. Fixed, mirrored. |
| **Participant basis labelled** | The headline said 105.0M with nothing saying *which* count. Now reads "at plan year end" on the hero and the plan card. |
| **Map rebuilt and made self-healing** | See below — it was drawing 23% of dots on the wrong plan. |
| **Vanguard trust/ticker fixes** (earlier) | 308 rows / $13.1B stopped claiming a mutual-fund ticker for a trust; ER coverage 899,948 → 906,176 rows. |

## What was found wrong

- **The map was drawing 23% of its dots on the wrong plan.** `map-points.json`
  is positional and was built against a 110,555-plan universe while the data
  had grown to 111,782. Nothing looked broken — right dot count, plausible
  totals, passing test. **Fixed and made structurally impossible to repeat:**
  the generator now runs inside the merge job, the file carries a `universe`
  fingerprint, the page refuses to draw on mismatch, and the map test asserts
  alignment *before* waiting for dots. Verified with a negative control.
- **The audit cried wolf 4,737 times.** Run #186 raised 4,741 HIGH findings;
  four were real. The triage compared ack-to-ack and never asked whether the
  *plan* had moved to a newer filing. Fixed; ships in run #189.
- **v96 freed one money type and called a whole plan vested.** Caught by the
  label diff **before mirroring**. A plan whose 2026 amendment freed only its
  nonelective money — while the discretionary *match* kept a three-year cliff —
  was relabelled "Immediate". That tells a participant their match is theirs
  today when it is not. Fixed as v97; gate green at 55 specimens.

## HELD — nothing from run #188 was mirrored

**Run #188's data is correct on 2 of 3 changed labels and wrong on the third**,
so it was held rather than published. The live site still shows the correct
"3-year cliff" for that plan. Run #189 (v97) is re-parsing now and will be
mirrored once its label diff is read.

This is the second time in two days the label diff caught something every
count-based check passed. Run #188's counts were *immaculate*: coverage line
byte-identical, HIGH back to the baseline of 4, zero losses, zero suppressed
quotes.

## Waiting on you

1. **GitHub Pages must serve `main`** (Settings → Pages → `main` → `/ (root)`).
   Still the only thing between green data and a usable site. I cannot verify
   the current state — this sandbox cannot reach `evwes.github.io`.
2. **The hourly Routine.** `create_trigger` has returned "requires approval"
   six times, including after you replied "approved" — so **no recurring
   automation exists.** Tonight ran on explicitly-armed one-shots. After this
   morning, nothing is scheduled.
3. Custom domain DNS (no `CNAME` in the repo).

## Continuing today

Run #189 verdict and mirror · the prior-year fallback that cost 250 plans their
lineups · ~$15B of non-Retirement T. Rowe trusts still priced as funds (needs
researched CIT fees — will not be invented) · the 3,700 filings that OCR to
nothing on every re-parse.

## Worth knowing

A **`PARSER_VERSION`-only re-parse costs ~75 minutes, not 4.5 hours.** Run #188
did the full universe in 74 minutes because the OCR text cache held across the
bump. The 4.5h figure came from runs that also moved `OCR_VERSION` and forced
re-rasterisation. Full re-parses are much cheaper than assumed — which is why
work no longer waits for a window.
