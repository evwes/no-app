# Morning brief — 2026-09-09 (updated 05:30Z / 1:30 AM ET)

## The headline

A dense night: three parser versions shipped (v109/v110/v111), one
regression was caught by the mirror gate BEFORE it reached the live site,
and the owner's map features are built, fixed against real input, and
waiting on the final verdict to go live. **Nothing wrong has been
published.** The mirror has been held all night for exactly the reasons the
protocol exists.

## Shipped and verdicted

- **v108 — Compass Group recovered** (312,914 participants; its 4i table
  was a JPEG under a text title page; targeted OCR). Confident +27.
- **v109 — State Farm recovered** ($19.0B, ~128k participants; the
  description column "Common Collective Trust Portfolio" outranked 18 real
  Vanguard names; "Portfolio" joined the type vocabulary). Plus MetLife's
  aggregate-filed plan appeared as a second "gain" — see below.
- **Map features (owner request): state selection by typing ("fl" /
  "florida") or clicking, wheel zoom, clickable dots that pull plans into
  the table.** First version shipped with every click DEAD in a real
  browser — setPointerCapture retargeted clicks to the svg; the synthetic-
  event test couldn't see it; the owner was the detector. Fixed, and the
  map test now drives real mouse input (proven by negative control).

## The catch of the night — reading gains against the pinned controls

Run #223's diff showed MetLife Group gaining confidence. MetLife is a
pinned control that must NEVER be confident (it files investments in
aggregate). The stored "lineup" was its 2023 fallback filing: two
aggregates + the auditor's PHONE, FAX and Suite number as $8.3M/$7.7M/$3.6M
holdings. **v110** fixed that (split-aggregate test + letterhead
condemnation) — and run #224 then revealed v110's own over-reach: five
honest three-fund Vanguard menus ("Total Stock Market Index" etc.)
withdrawn because the split test borrowed a vocabulary whose `total…` arm
reads those names as subtotals, and one NEW junk gain ("Mutual Funds" at
99.4% promoted into band by the very cleanup). **v111** narrows the split
vocabulary to unambiguous accounting phrasing and condemns generic-type
dominant rows. Gate green with four new pinned specimens; corpus diff:
zero changes across 192 filings. All in docs/accuracy-log.md.

## IN FLIGHT / HELD

- **Run #226 (v111) dispatched 05:22Z, lands ~06:45Z.** Expected diff vs
  #224 data: the five three-fund menus REGAINED, Premier Care's junk gain
  reversed, MetLife stays honest.
- **The mirror is HELD until #226 passes verdict** — it then takes
  everything live at once: v108–v111 data, Compass + State Farm
  recoveries, the wind-down line, and the map features.

## Waiting on the owner (unchanged)

- GitHub Pages must serve `main`; custom domain DNS.

## Continues next

- #226 verdict → mirror → census re-read (stmt fell 324→~317, band-hi
  230→227 so far).
- Loss auto-triage misses n≤4 menus (the five withdrawn ones sailed under
  its n≥5 threshold) — reading the raw CONFIDENCE DIFF every run is the
  actual check; consider lowering the triage floor.
- Band-hi remainder = master-trust-opaque giants (HCA/AT&T/J&J): trust
  linking or an honest frontend label, not parser work.
- `few` (649) and live-`nohead` (528) need their own sizing passes.
