# Morning brief — 2026-09-09 (final, 07:30Z / 3:30 AM ET — everything is LIVE)

## The headline

**Mirrored to main at 07:20Z: `d31202a2 → eebd5d25`.** The live site now has
the map features you asked for (working under real input), the wind-down
line, and four parser versions of data work — with one regression caught
and corrected BEFORE it ever reached the site.

## What went live, in one list

- **Map**: type "fl" or "florida" to select a state (zooms + highlights);
  click a state to do the same; click a dot to pull its plans into the
  table (single-plan dots open the report); wheel zoom; visible state
  borders. The first build's clicks were dead in real browsers
  (setPointerCapture retargeted them) — caught after your report, fixed,
  and the map test now drives real mouse input, proven by negative control.
- **Recoveries**: Compass Group (312,914 participants — 4i table was a
  JPEG; targeted OCR, v108), State Farm ($19.0B — "Portfolio" type-word,
  v109), Marriott Vacations (v107), the five three-fund Vanguard menus
  v110 briefly withdrew (v111).
- **Cleanups**: MetLife's letterhead-as-holdings fallback (v110), Premier
  Care's "Mutual Funds at 99.4%" (v111), and 15 more generic-category-
  dominant lineups — **audit-generic-names fell 208 → 171**, the largest
  cleanup of that residual since the class was defined; dominant-row held
  0 throughout. Confident lineups 59,600.
- **Wind-down line**: ~6,500 ended plans (Red Lobster class) now say so
  instead of implying a data gap.

## The night's two saves (docs/accuracy-log.md has both in full)

1. Run #223's diff showed MetLife — a pinned must-never-be-confident
   control — as a "gain". Reading gains against the controls before every
   mirror is now proven necessary: the stored lineup had the auditor's
   phone and fax numbers as $8.3M/$7.7M holdings.
2. v110's fix over-reached (five real three-fund menus withdrawn; the
   loss auto-triage missed them at n=3-4). v111 corrected both directions;
   the withdrawn menus are back.

## Waiting on the owner (unchanged)

- GitHub Pages must serve `main`; custom domain DNS.

## Continues next

- Queued frontend line for filed-aggregate plans (MetLife/Comcast class +
  the 15 newly withdrawn) — "the filing reports investments in aggregate".
- Consider lowering the loss-triage floor below n=5.
- Band-hi remainder = master-trust-opaque giants: trust linking or a label.
- `few` (~649) and live-`nohead` (528) sizing passes.
