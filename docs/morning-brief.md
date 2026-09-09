# Morning brief — 2026-09-09 (updated 14:35Z / 10:35 AM ET)

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

### Done since (all mirrored except v113, which is mid-run)

- **Filed-in-aggregate line SHIPPED** (bit 4096, 405 plans).
- **Loss-triage floor lowered** to n>=3 in-band, aggregate cleanups exempt.
- **v112** recovered 10 menus hidden behind fair-value notes (projected 125 —
  the projection was wrong, see the sampling corollary now in CLAUDE.md).
- **v113 IN FLIGHT (run #232, lands ~14:50Z):** records the DOCUMENT's shape
  (`ds`) at parse time. A RANDOM 30-filing sample of live-`nohead` measured
  **93% permanently not ours** (77% no attachment published at all), ~7%
  parser gaps on tiny plans. So nohead is not a parser project; the win is
  telling those ~420 plans' readers the true reason.

### Queue, re-ordered by what the evidence now says

1. **`band-hi` (212 plans) — DIAGNOSED, fix designed, not yet built.** The
   old note in this brief said "master-trust-opaque giants"; that was WRONG.
   Those giants are already trust-linked and excluded. The real 212 are
   mid-size plans (largest: Conagra, 28,863 participants) whose menus parse
   correctly but whose fair-value SECTION SUBTOTALS are counted as holdings
   beside them — Vandalia 2.71x, Nuvance 3.27x, 95 of 212 carrying 20+ rows.
   Fix = structural subtotal detection (a row equal to the sum of the run
   that follows it), NOT more vocabulary.
2. Frontend line for the `ds` codes, once #232 populates the field.
3. `few` remainder and the trust-pointer label.
