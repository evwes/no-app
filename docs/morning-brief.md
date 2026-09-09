# Morning brief — 2026-09-09 (updated 02:15Z / 10:15 PM ET)

## Overnight, in order

- **v108 (run #222) LANDED AND VERDICTED: Compass Group recovered.** The
  312,914-participant plan — the largest live-plan lineup gap on the board —
  now has its confident 25-row menu, extracted by OCR-ing the JPEG its 4i
  table was filed as. Verdict: confident +27 (59,614), generic-named fell to
  202, dominant-row held 0, HIGHs = the 4 known baselines. J&J and Home
  Depot (master-trust-opaque decoys the detector touches) correctly refused.
- **v109 (run #223) IN FLIGHT, dispatched 02:10Z.** "Portfolio" joined the
  type vocabulary: State Farm's $19.0B / ~128k-participant menu was merging
  18 Vanguard trusts into one row because the description column "Common
  Collective Trust Portfolio" outranked the names. Gate has a State Farm
  specimen (n=20, exact sum); corpus diff showed State Farm as the ONLY
  change in 190 filings. Verdict + mirror when it lands (~03:30Z).
- **Map upgrades shipped (owner request, built while runs cooked):** typing
  a state name or code ("florida"/"fl") is an exclusive state filter that
  zooms and highlights the state; clicking a state types its code; clicking
  a dot pulls its plans into the table behind a clearable banner (single-
  plan dots open the report); wheel zoom toward the cursor; state borders
  now visible in every theme. Map test extended and its zoom checks proven
  to fire via negative control. Ajax Building's "wrong" dot was verified
  CORRECT (inside Florida's projected outline) — the invisible borders were
  the real bug.

## HELD and why

- **The mirror is HELD until run #223 lands** (~03:30Z): mirroring v109's
  scripts to main before the dev run finishes would let main's :23 cron
  start a duplicate full re-parse racing it. When #223 passes verdict, ONE
  mirror takes everything live together: v108+v109 data, the State Farm and
  Compass recoveries, and the map features.

## Waiting on the owner (unchanged)

- GitHub Pages must serve `main`; custom domain DNS.

## Continues next

- #223 verdict → mirror → gap census re-read (stmt should shrink by the
  State Farm class; band-hi by the Compass class).
- Band-hi remainder is master-trust-opaque giants (HCA/AT&T/J&J) — fix
  direction is trust linking or an honest frontend label, not parser work.
- `few` (660) and live-`nohead` (528) need their own sizing passes.
