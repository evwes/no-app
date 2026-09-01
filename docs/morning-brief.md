# Morning brief — 2026-09-01

*Overwritten nightly. Written 06:20 ET, after run #189's verdict was read.*

## Mirrored to the live site overnight — what readers now see

| change | scale |
|---|---|
| **T. Rowe Price trusts priced as trusts** | 794 names / 1,431 rows / **$15.84B** had been showing a *mutual fund's* fee for a collective trust |
| **Vanguard: trusts stopped claiming fund tickers** | 308 rows / **$13.1B** stopped asserting a ticker for a vehicle the plan doesn't hold; expense-ratio coverage 899,948 → **906,176** rows |
| **Two vesting labels corrected** (v96/v97) | both read against the filings before shipping |
| **Participant count labelled** | headline said 105.0M with nothing saying *which* count; now reads "at plan year end" |
| **Map rebuilt, and placement improved** | 95.87% → **99.65%** of full-form filers placed |

## What was found wrong

- **The map was drawing 23% of its dots on the wrong plan.** `map-points.json`
  is positional and was built against a 110,555-plan universe while the data had
  grown to 111,782. Nothing looked broken — right dot count, plausible totals,
  passing test. Fixed, and made structurally impossible to repeat: the generator
  runs inside the merge job, the file carries a `universe` fingerprint, the page
  refuses to draw on mismatch, and the test asserts alignment *before* waiting
  for dots. Proven with a negative control.
- **The audit cried wolf 4,737 times.** Run #186 raised 4,741 HIGH findings;
  four were real. The triage compared ack-to-ack and never asked whether the
  *plan* had moved to a newer filing. **Fixed and now live** — HIGH is back at
  the baseline of 4.
- **v96 freed one money type and called a whole plan vested.** A plan whose 2026
  amendment freed only its *nonelective* money — while the discretionary
  **match** kept a three-year cliff — was relabelled "Immediate". That tells a
  participant their match is theirs today when it isn't. Caught by the label
  diff **before mirroring**, fixed as v97.

## What was HELD, and why it matters

**Run #188 was held and never mirrored.** Its counts were immaculate: coverage
line byte-identical, HIGH at the baseline of 4, **0 gained, 0 lost, 0 quotes
suppressed**, and only 3 changed labels — exactly the class predicted. Every
count-based check said ship it. Reading the three filings found one wrong.

Run #189 (v97) then produced **2 relabels instead of 3** — the false positive
reverted on its own, which is the fix confirming itself. Those two were each
read against their filings. **That** is what was mirrored.

Twice in two days the label diff caught what every count passed. Its value
isn't the numbers; it's that the numbers stay small enough to read every one.

## Waiting on you

1. **GitHub Pages must serve `main`** (Settings → Pages → `main` → `/ (root)`).
   Still the only thing between green data and a usable site. I can't verify the
   current state — this sandbox can't reach `evwes.github.io`.
2. **The hourly Routine.** `create_trigger` has returned "requires approval"
   six times, including after you replied "approved". **No recurring automation
   exists** — last night ran on hand-armed one-shots, and they're now spent.
3. Custom domain DNS (no `CNAME` in the repo).

## Continuing today

The prior-year fallback that cost 250 plans their lineups · ~$15B of
non-Retirement T. Rowe trusts still priced as funds (needs researched CIT fees —
will not be invented) · the 3,700 filings that OCR to nothing on every re-parse.

## Worth knowing

**A full re-parse costs ~75 minutes, not 4.5 hours.** Runs #188 and #189 each
re-parsed the whole universe in about 75 minutes because the OCR text cache
holds across a `PARSER_VERSION` bump. The 4.5h figure came from runs that also
moved `OCR_VERSION`. Only an OCR bump is genuinely expensive — which is why work
no longer waits for an overnight window.
