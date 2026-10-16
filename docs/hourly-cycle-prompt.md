# Hourly cycle prompt


**The durable scheduler EXISTS — self-bind since 2026-09-08.** MCP Routine
`trig_017vdX5dSSYh5v68Cwe6EUBu` ("wampo hourly cycle (self-bind)", cron
`7 * * * *`) wakes the MAIN WEB SESSION every hour. Its predecessor
(`trig_01XBJTunkpj2T8bLKHzdsKsA`, created 2026-09-06, fresh-session mode)
fired ~40 times and committed NOTHING — see the diagnosis below. The Routine
mechanism itself survives
container restarts, which the in-memory `CronCreate` job never did — that job
died **nine times**, and the price of relying on it was two days (2026-09-05/06)
in which the pipeline ran but no agent work happened at all. `create_trigger`
had refused ten times; the whole `claude-code-remote` MCP server was
unapproved, `.claude/settings.json` allowlisted it on 2026-09-02, and the first
container that actually restarted with that file in place created the Routine
on the first try.

**Roles now:** the Routine is the mechanism. `CronCreate` is the fallback ONLY
if `list_triggers` shows the Routine gone or repeatedly FAILED. The GitHub
Actions schedule (hourly at :23 + daily 05:12Z, on main) keeps parsing and the
audit running with no session anywhere, and its merge job fast-forwards the dev
branch after committing to main, so pure data commits no longer strand main
ahead.

**Why ~40 firings committed nothing (diagnosed 2026-09-08).** The original
Routine stored `sources: []` and `mcp_connections: []`: every fired session
started with NO repository attached and NO MCP tools — no push credential and
no `add_repo` to obtain one. Each session did 15–20 minutes of work that could
never land, and reported "SUCCEEDED" because delivery, not outcome, is what
last_run records. The 19:17Z diagnostic probe confirmed it by construction:
50k output tokens of work, zero commits on any branch, its report trapped in
its own transcript because reporting required the push it lacked.

**The repair paths, in the order they were closed or taken:** granting fired
sessions the `Claude_Code_Remote` connector (so they could `add_repo` with
push access) is refused — `create_trigger`'s connectors parameter "is not
available for this organization". So the Routine was recreated as a
**SELF-BIND**: it fires hourly INTO the main web session
(`session_01EhZqtGepgDtE1DhzXJu3A9`), which has the repo attached with push
credentials; a wake re-provisions the container with the repo when it was
reclaimed, exactly as `send_later` reminders already demonstrably do. This
also puts the hourly work where the owner looks. If that session is ever
archived and wakes start failing (list_triggers shows non-SUCCEEDED
last_run), the fallback is a fresh web session: attach the repo, run
`create_trigger` self-bind again from it, delete the stale trigger, and
update the ID below.

---

wampo hourly cycle. Work, report, continue — never delay finished work for a clock. Repo evwes/no-app, dev branch claude/wampo-401k-live-nx1t4o. **The procedure is packaged as the `wampo-cycle` skill (`.claude/skills/wampo-cycle/SKILL.md`, `/wampo-cycle`; `/wampo-cycle install` recreates the Routine) and the `wampo-cycle` agent (`.claude/agents/wampo-cycle.md`, spawnable from any session with the MCP tools) — added 2026-09-17 at the owner's direction so the loop can be taken over by a fresh session in one command. This block below remains the queue and the record; the skill is the procedure.**

BOOTSTRAP (each wake, before anything else): `git fetch origin main claude/wampo-401k-live-nx1t4o` and reconcile — the container may have been reprovisioned since the last wake, and the pipeline commits data hourly. Verify push works EARLY in the first wake after any reprovision: append a line `<UTC timestamp> alive` to docs/routine-heartbeat.log, commit with [skip ci], push. If the push is denied, report the exact error to the owner and stop — that diagnosis is worth more than silent work that cannot land. If a previous cycle in this session left work mid-flight, continue it rather than starting anew.

Read CLAUDE.md first — especially "The gap method (2026-09-03)" and "Current state (2026-09-03)". Do not rediscover what is written there.

FIRST: confirm via `mcp__Claude_Code_Remote__list_triggers` that Routine trig_017vdX5dSSYh5v68Cwe6EUBu ("wampo hourly cycle (self-bind)") is enabled with a recent SUCCEEDED last_run — no more than once per session, not on every wake. Do not create CronCreate jobs unless the Routine is confirmed gone.

SERIALISATION: pushing scripts/build-data.mjs, fetch-4i.mjs, lib-4i.mjs, merge-4i.mjs, scripts/.kick or the workflow while a run is in flight CANCELS it — use [skip ci]. Actions minutes are free (measured). GitHub cron start times are fiction (4-8h late, measured) — dispatch with workflow_dispatch. The daily schedule commits data straight to MAIN, so check `git log origin/main --not origin/<branch>` and bring its commit into the branch (usually a plain fast-forward) BEFORE any mirror; mirror ONLY via `bash scripts/mirror.sh`.

Order of business:
1. RUN IN FLIGHT? (Without MCP tools, infer from git: an "Update filed plan data" commit or a .kick push on either ref in the last 90 minutes means assume one is.) Non-pipeline work only; pipeline commits [skip ci]. When you cannot rule a run out, EVERY commit is [skip ci] and kicks are limited to one per cycle.
2. NO RUN IN FLIGHT? **DISPATCH build-data.yml ON THE DEV BRANCH — EVERY HOUR, whether or not a gated change is waiting.** This step used to fire only when "a gated change is unshipped", and that is why the pipeline was not actually running hourly (owner, 2026-09-15): the GitHub cron `23 * * * *` is the ONLY thing that dispatched on a quiet hour, and GitHub de-prioritises cron on free public runners. Measured 2026-09-15: scheduled runs fired at 10:00, 13:38 and 18:16Z — gaps of 3.5 and 4.5 hours, not one. The Routine at `:07`, by contrast, has fired on the minute every hour. **So the reliable clock was waking a cycle that then declined to dispatch, while the unreliable clock was the only one parsing new filings.** Dispatching costs effectively nothing — Actions minutes are free (measured at zero), a no-op hour exits without committing, and the whole work list on a quiet hour is the ~78 permanently-403 acks. The purpose of the hourly run is to FIND new gaps, holes and incorrect filings as they are filed; a 4-hour gap is 4 hours of filings unexamined. Use `mcp__github__actions_run_trigger` (method `run_workflow`, ref = the dev branch); WITHOUT MCP tools, push a commit whose only change is `date > scripts/.kick` — the documented kick, and the push event is the dispatch. **Verify it started in the run listing before believing it** — the push trigger is intermittent and the dispatch is not. Keep the GitHub cron as the backstop for hours when no session exists; do not remove it.
3. RUN JUST FINISHED? Verdict: pv distribution (one dominant pv, small tail); coverage line in docs/coverage-history.jsonl; `node scripts/diff-lineups.mjs <prev-ref>` (every CONFIDENCE LOST must be a justified fabrication, FABRICATED INTRODUCED must be 0); `node scripts/audit-generic-names.mjs` (baseline 208/threshold 230) and `node scripts/audit-dominant-row.mjs` (holds at 0 — any nonzero is a regression, stop and diagnose; NOTE this audit covers ONE shape and the fabricated class as a whole is NOT closed, see docs/accuracy-log.md 2026-09-15); then mirror via scripts/mirror.sh.
4. OTHERWISE take the next queue item and FINISH it — **and the agent that
   finishes it is `wam`** (`.claude/agents/wam.md`, owner directive
   2026-09-15). Spawn it with the item, its current size in participants, and
   where the evidence is. wam works DEFECTS first and COVERAGE second, ranks
   within each by people affected, and must return an item in one of exactly
   two states: FIXED (shipped, gated, measured, logged) or DOCUMENTED AS
   UNREACHABLE (cause named from evidence, and the PAGE says the true thing).
   "Unknown" is not a state it may leave an item in. Anything needing a
   `PARSER_VERSION` bump plus a full re-parse, or that is NEW COVERAGE rather
   than a repair, comes back as a proposal with its size — it is the owner's
   call, not wam's.

   **Every finding from this cycle goes INTO that queue rather than into prose
   alone.** A defect described in `docs/accuracy-log.md` and nowhere else is
   how three classes sat unworked; the log is the permanent record, not the
   worklist.

   **DO NOT READ A QUEUE OUT OF THIS FILE. The list that used to sit here was
   from 2026-09-03 and every number in it had been superseded** — it said
   `noregion` 1,099 plans (now 6), `band-hi` 270 (now 128), recordkeeper
   missing 4,568 (now 1,419 blank + 1,509 publishing a WRONG NAME), State Farm
   still broken (it publishes 20 Vanguard rows), and — worst — **"the
   fabricated-lineup class is CLOSED at 0", which was corrected on 2026-09-15
   when an owner-sent filing showed it publishing merged holdings.** A stale
   queue in the file that drives every cycle is the "copying a line forward is
   asserting it again" hazard aimed at the work itself. Removed 2026-09-15.

   **The live sources, in order:**
   - `CLAUDE.md` → "Known residuals" table, and read its `reachable` column,
     not the raw size column. Regenerate with `node scripts/gap-census.mjs`
     and reproduce the shipped count before classifying anything.
   - `CLAUDE.md` → "FIELD COVERAGE" (lineups are NOT the largest gap; match
     and vesting are, by people).
   - `docs/accuracy-log.md` → the newest entries are the open defects.
   - `docs/coverage-history.jsonl` → `overshoot` must FALL from 471.

   **Open queue as of 2026-09-16, all owner-gated except where noted:**
   1. Fabricated/unusable published holdings, one `PARSER_VERSION` bump:
      **WALMART — 1,970,230 participants, the largest plan in the country,
      publishes `Lendable Fund` at $3,547,236,088 = the exact sum of three
      wrapped BlackRock names, one of them a $2.86B international index fund;
      plus `US) Value Equity Fund` at $1.83B** (`docs/accuracy-log.md`
      2026-09-16 cycle 12:2xZ). Wrapped continuation fragments generally
      (Owens Corning `Fund, Class S`; the recorded floor of 149 plans /
      753,693 ppl understates by >1.97M in Walmart alone, because the
      anchored predicate only matches names BEGINNING with a generic noun).
      **UPMC — 112,002 participants: the whole menu is the filing's
      `Multiple-Employer Plan Participating Employer Information` roster,
      hospitals and EINs, because the real 4i in the same PDF is a $54.5M
      legacy TIAA slice at ratio 0.011 and the roster scores 0.87.** Plus
      loan-rate text as a name (283 plans), the 471 overshoots (PepsiCo
      `Trust` at 50% of its menu), Form 5500 ID fields as holdings (174
      plans — `JUNK_NAME_RE` matches 0 of them), duplicate rows (160),
      **DocuSign watermarks as holdings (27 plans / 51,497 ppl)**, **the bare
      house-name merge — `Vanguard` at 95% because the fund name sits on a
      description line separated by BLANK lines and `nameBuf` resets: 49
      plans / 27,970 ppl at >=90%, 81 / 55,353 at 50-90%, 6 of 6 specimens
      OURS (`docs/accuracy-log.md` 2026-09-16 cycle 19:0xZ; specimen Bell
      Nursery 20251006135118NAL0006541792001)**,
      and the CODE-COLUMN class (**720 plans / 687,851 ppl** at >=1 such row,
      **670 / 621,794** at >=3 — both correct, the threshold is part of the
      number; `docs/accuracy-log.md` 2026-09-16, publishing
      `1VTTHX` where the same PDF prints a legend giving the fund name).

      **SHIPPED FROM THIS ITEM, v128 (2026-09-16 21:xxZ, not owner-gated —
      it is a fabrication guard, not new coverage): the prior-year fallback
      no longer publishes a plan-level lineup for a master-trust plan whose
      newest schedule is a trust pointer / statement / one >=85% line, or
      whose linked trust has its own confident lineup.** 87 plans /
      2,379,942 ppl were in that shape (Walgreen, Macy's, PepsiCo, Comcast,
      Charter, Northrop, Medtronic, UPMC x2); predicted 82 refused, 5 kept —
      three real menus (Norfolk Southern, Mars 001, Xcel) and two junk ones
      that belong to OTHER classes here: **Delta Air Lines 112,027 ppl is the
      UPMC roster shape** and Mars 003 is the fair-value note. Check
      `fb-skipped-trust` in the run's tally against 82 before mirroring.
      `docs/accuracy-log.md` 2026-09-16 (v128). **VERIFIED on run #334
      (21:19Z): confident −82 exactly, 0 gained, all 82 losses are the
      refusal set, 6 remain (the 5 named + one whose newest filing is a
      403).** Mirror held for the v129 store (see CLAUDE.md state bullet).
      **TWO REGRESSIONS FROM #340 (v130+v131), sized, queued 2026-09-17
      12:5xZ:** (a) **9 small plans / ~5,600 ppl ENTERED overshoot** with a
      generic winner (`Mutual fund, due on demand` 1.16, `See attachment`
      1.17, `companies` 1.21, Bank of Bridger 1.48, Sames 1.59) after v130's
      column attribution changed which region wins; 4 left. (b) **First
      American Financial (17,155 ppl) regained its 2023 fallback that v128
      refused**: with the loan rows gone its newest filing's winning region
      is the fair-value note at ratio 0.003 (`CCT funds measured at NAV (1)`
      60%, **`(in thousands)` as a row NAME** 32%), neither stmt nor
      trustPtr, so the v128 guard did not fire. The guard is
      region-dependent; make it hold when the linked trust's assets cover
      most of the plan (mtias assets vs plan assets — arithmetic) or when
      ANY candidate region was a trust pointer; and a units marker must never
      be a row name. `docs/accuracy-log.md` 2026-09-17 (run #340 verdict).
      **v132 LANDED AND IS LIVE (run #344, mirrored 14:0xZ):** Delta's
      ZIP+4 phantom gone (both Delta plans now correctly non-confident),
      Allina 22 real rows, house sizer ≥90% 48 → 5, overshoot 451 → 390,
      generic-names 121. **TWO MORE ITEMS FROM THE #344 VERDICT, queued
      2026-09-17 14:1xZ, both for wam:** (c) **8 DEGRADED SWAPS / 6,910
      ppl** — plans whose own 2024 filing now clears the floor at 0.48–0.63
      where a 2023 fallback stood at 0.80–1.06 (Printpack 3,249 ppl 26 → 11
      rows of bare tickers; Robert Walters 37 → 5; Fam LLC 39 → 16 with
      `Lord Abbett`/`Oakmark` house rows; Putnam 41 @ 0.95 → 41 @ 0.63;
      acks in the run #344 merge log and the accuracy-log entry). Trace two:
      is the v132 caption stop cutting a real schedule short, or is the
      house merge promoting a half-menu? (d) **MENU FUNDS FOLDED INTO
      `Managed account holdings (N positions)` — 56 plans / 158,541 ppl at
      ≥30% of the menu** (Duke Energy 35,031 ppl: 16 white-label
      target-date/index funds under an `Institutional Funds` header
      published as one $5.58B row = 49.5%; H&R Block 27,766 ppl at 97% under
      25 positions; TE Connectivity 66% under 3). The `smaKind` classifier
      is taking a section of core menu funds as itemized SMA innards. Read
      the top filings before touching it — a real 75-security sleeve (Estee
      Lauder?) must stay folded — and add the aggregate-row share to the
      audit beside `audit-overshoot`. Sizer:
      scratchpad `sma-agg.mjs` (store-only). `docs/accuracy-log.md`
      2026-09-17 (run #344 verdict).
      **FROM THE 14:2xZ DRAW (first on the v132 store):** (e) **a
      STATEMENT-OF-CHANGES line as a holding — FMR LLC (Fidelity's own
      plan, 90,445 ppl) publishes `Employer, net of forfeitures` $1.29B
      (3.8%)**; predicate hits 110 plans / 429,853 ppl, reachable ~40 /
      ~250k once `Forfeiture Account` rows (real cash positions, ~30 plans)
      are excluded — AutoNation, Bloomberg, Marsh & McLennan `Net
      appreciation…` at 7%, IRB `Rollover, participants`. Fix = the v132
      caption stop extended to the statement captions; forfeiture accounts
      are the control. (f) **TYPE HEADER as issuer — 375 plans / 716,341 ppl
      / 810 rows**, `[Registered investment company shares Fidelity
      Investments] 500 Index Fund` (Ulta 70k, Vanderbilt 82k, TD Bank
      `[Common Collective Trust (continued)]`): strip `GENERIC_TYPE_NAME`
      vocabulary and `(continued)` from the v126-promoted issuer. Sizer:
      scratchpad `draw-size-14z.mjs`. `docs/accuracy-log.md` 2026-09-17
      (14:2xZ draw). **Same family, 15:2xZ draw: a SHARE-CLASS fragment of
      the previous row promoted to the issuer — `[Retirement Fund Class R-6
      American Funds]` (Cava), `[Class R6 Fidelity Investments]`
      (Consolidated Electrical 15,402 ppl), `[Admiral Vanguard]`: 357 plans
      / 757,319 ppl / 1,117 rows.** One fix for both: strip type vocabulary,
      share-class tokens and `(continued)` from the promoted issuer.
      (` N/R` on 1,431 plans / 2.57M ppl is NOT queued — `app.js` ~404
      already strips it for display and lookup.)
      **(h) FROM THE 20:0xZ DRAW — the filing's CLASS SUBTOTAL published as
      a holding, and the vocabulary audit's blind spots.** Toyota (52,368
      ppl) publishes `M ut ual fund` at $811M (6.4%): letter-spaced by the
      text layer, so no vocabulary test matches it — **68 rows / 42 plans /
      123,497 ppl** in that shape. The audited class (`GENERIC_TYPE_NAME`
      rows) split by menu share: **>= 30%: 98 plans / 336,152 ppl** —
      Marriott (152,118) `COMMON STOCKS` 49%, both GM plans `Common
      collective trusts` 64-66%, Cisco 12%; `audit-generic-names` counts
      only the >= 25% band (107) against a 230 threshold and so never
      fires. Fix shape: arithmetic — a row whose value equals the sum of a
      run of following rows, or a type label with itemized rows of that
      type beneath it, is a subtotal, not a holding; strip spaces before
      any generic-name test (parser and audit); give the audit a dollar
      floor beside the share floor. Sizer: scratchpad `spaced-type.mjs`.
      `docs/accuracy-log.md` 2026-09-17 (20:0xZ draw). **Headline
      specimen from the 21:0xZ draw: Morgan Stanley Domestic Holdings
      (81,090 ppl, $22.18B, `20251010150034NAL0004732579001`) — ALL ten
      rows are asset classes (`Collective Trust Funds` 62%, `Corporate
      equities` 28% …), published confident.**
      **(i) FROM THE 21:0xZ DRAW — a holding published TWICE under two
      spellings, both carrying the full value: R&L Carriers (21,438 ppl)
      `Morley Stable Value Fund` = `Morley Stable Value` $33,954,030 each
      (7% double-counted, ratio 1.029). Sized tight (same value, same name
      stem after filler words): 262 plans / 450,981 ppl / 467 rows / $0.53B**
      (Kwik Trip, Penske, Boston Consulting). Fix: same-value/same-stem merge
      in `parseRows`; control: Goldman's repo lots at equal rate and value
      may be two genuine lots. Sizer: scratchpad `dup-rows.mjs`.
      **(j) cosmetic strips, sized:** names ending in `,;:` 268 plans /
      1,004,405 ppl (two of them FORM FIELDS as rows: PPG `Plan No:`,
      Eurofins `Employer I.D.#:`); a share count glued in (`, 416,228
      shares`) 84 plans / 191,052 ppl / 797 rows; **the TYPE column glued
      to the END of the name (`… MUTUAL FUND SHARES`, `… Pooled Separate
      Account`) 1,237 plans / 4,418,181 ppl / 17,033 rows** (03:1xZ draw;
      Walmart, CVS — which also carries a share count at the FRONT —
      Compass Group, Intermountain, Hy-Vee). **DISPLAY HALF SHIPPED
      06:4xZ 2026-09-18** (`app.js` `cleanFiledName`, raw-first lookup:
      21,502 rows / 2,106 lineups cleaned, +37 tickers, 0 lost, 0 flipped);
      the parser-side strip stays queued for the next version. `docs/accuracy-log.md`
      2026-09-17 (21:0xZ draw).
      **STATUS 14:4xZ 2026-09-21. NOTHING IN FLIGHT** (#427 success 13:36Z on
      the dev branch, #428 — main's cron — success 14:24Z).
      **#427 PASSED ALL FOUR PRE-REGISTERED TESTS.** Residue 361 -> 248 =
      **113 rows stripped, the prediction to the row**; CHS publishes
      `Principal Life Insurance Company` on 13 rows and KEEPS `Master Trust
      CHS/Community Health Systems, Inc.` on 2; all four negative controls
      untouched; **CONFIDENCE DIFF +0 / -0** with the coverage line
      byte-identical. **MIRRORED 14:3xZ `b6271274 -> 8196414b`, DATA GATE
      UNFORCED at +0 / -0** (second consecutive); `--force` on the GIT check
      alone over main's one cron commit, measured first at 0 acks / 0 plans
      lacked, plans array byte-identical, 0 confident on main the branch
      lacks. Held ~10 min because #428 was in flight ON MAIN — dispatching on
      the dev branch would have been safe (concurrency is per-ref), mirroring
      onto main was not.
      **METHOD, from the USC control:** addressed by a REMEMBERED ack it
      returned "no entry", indistinguishable from the control failing.
      Addressed by VALUE it resolved at once. **Address a negative control by
      a property it has, not an identifier you recall.**
      **STATUS 17:3xZ 2026-09-21. IN FLIGHT: #429**, dispatched 17:08Z on
      `bb8b2aaa`, dev branch, start verified — an INCREMENTAL run (no version
      bump), dispatched because main's cron had not fired since 14:17Z.
      **COMPASS GROUP DIAGNOSED FROM THE FILING, not fixed.** Page 104 read at
      220dpi: column (b) is `Fidelity TRIM 2020`, column (c) is `Trust
      Company`, and we publish the concatenation — six rows, **64% of a
      263,796-participant menu**. The row below it is clean because its
      description reads `Common collective trust fund`, which the parser
      recognises as a TYPE and refuses; `Trust Company` is not in that
      vocabulary, and `Common collective trust fund, at contract value` fails
      `GENERIC_TYPE_NAME`'s `$` anchor because the filing wraps it over two
      lines. **So the fix target is recognising two more TYPE labels, NOT
      stripping a suffix off the name** — the suffix cannot discriminate,
      since `Putnam Fiduciary Trust Company` (a firm) and `Fidelity TRIM 2030
      Trust Company` (a fund) share it.
      **BLOCKED NEXT STEP — do not repeat it:** `trace-filing.mjs` on this ack
      traces the TEXT LAYER (`121 pages, statutory 4i header ABSENT`, zero TRIM
      rows) while the stored entry came from the OCR path. It looks like a
      clean run and answers a different question. An OCR-aware trace is needed
      before the glue site can be named.
      **My sizing splitter for this class is CONTAMINATED — do not reuse
      "157 rows / 1,210,535 ppl".** It called `SEI Trust Company` glued because
      "SEI" matched a class-letter heuristic.
      **SUPERSEDED: SHIPPED: the share-class flip.** 161 rows /
      77 plans / **51,655 ppl** stop seeing the INVESTOR class's expense ratio
      beside a name that already reads "Class I" -- `T. Rowe Price Overseas
      Stock |` was TROSX where the answer is TROIX, Blue Chip Growth TRBCX ->
      TBCIX, New Horizons PRNHX -> PRJIX. One narrow exception to
      `lookupTicker`'s raw-first order, keyed to the single case where the raw
      name is KNOWN corrupt (it ends in the OCR bar, which is in no pattern).
      Controlled whole-store: **0 tickers lost, all 161 base -> I-class,
      NEGATIVE CONTROL 0.** Both guards green. Mirrored `8fdffa39 -> 2bf29256`
      UNFORCED; site-test dispatched, READ ITS CONCLUSION.
      **BLOCKED WITH AN EXACT COST — the comparable-fallback variant** (the
      largest open item, 9,835 rows / 5,864,346 ppl). Split by type AND
      direction it falsely demotes **1,544 rows / 470 plans / 951,157 ppl**:
      Sutter Health's `Fidelity 500 Index` would read FXAIX* "comparable fund"
      when the plan holds exactly that fund. **The mechanism is ORDERING, not
      scope** -- `lookupTicker` tries the ISSUER-PREFIXED name first, the
      issuer carries a trust word, so the variant makes that attempt succeed as
      a comparable and short-circuits the correct bare-name attempt. Any retry
      must run the fallback only on the bare-name attempt, or refuse it when
      the type column says `Mutual fund`.
      **NEXT: Compass Group's welded names** (263,796 ppl, **64% of its menu**)
      -- six rows reading `Fidelity TRIM 2030 Trust Company` where the TRUSTEE
      is welded on, plus `... Common collective trust fund, at` with the type
      column welded on and truncated. CONFIRMED by rendering the page.
      **Do NOT size it by vocabulary:** all three candidate shapes dissolved --
      Walmart's `Fiera Asset Management USA Collective Trust` is a REAL fund
      name, CVS's `GOLDMAN SACHS GROUP INC/THE` is Bloomberg security naming.
      Use the empirical test the issuer strip used this morning: does the
      remainder appear as a complete value on other published rows?
      **SUPERSEDED: THE UPS GATE IS FIXED AND SMOKE IS GREEN.**
      `app.js` `fundTable` had every honest explanation nested inside
      `if (!plan.funds)`, so a curated `data.js` entry suppressed all of them.
      UPS PN 004 (145,125 ppl) was shown a 22-fund SYNTHETIC menu with
      estimated ERs while its filing reports investments in aggregate.
      Only the FILED-FACT branches were promoted above that gate; the docShape
      and generic endings stay gated and are now explicitly guarded. Sized
      whole-store first: **2 plans / 145,246 ppl masked**, the other 21 curated
      entries return further up. Controls both ways (UPS gains the sentence and
      loses the menu; Lumen unchanged), **full smoke test GREEN across all six
      page shapes** — the first green run since the assertion began failing.
      **AND THE GUARD DIAGNOSIS WAS CORRECTED:** site-test ALREADY has a push
      trigger, including the data paths. It is suppressed by two other things —
      the pipeline pushes with `GITHUB_TOKEN`, which by GitHub's anti-recursion
      rule cannot start a run (so the data paths the workflow's own comment
      calls deliberate have NEVER been able to fire), and my commits carry
      `[skip ci]` on the head commit. Confirmed live: the `app.js` push here
      carried no `[skip ci]` and DID fire it. **Owner decision worth naming:
      whether the data-path intent is worth a deploy key or PAT.**
      **NEXT CYCLE:** nothing is owed; take queue work. The 7-row raw-first
      share-class flip and the SDBA fold (owner question 5) are the live items.
      **SUPERSEDED — kept for the reasoning only: the UPS / filed-in-aggregate
      gate.** `scripts/smoke-test.mjs`
      FAILS its `filed-in-aggregate` assertion (controlled: it fails
      identically on a clean tree, so it is not from this cycle's changes).
      UPS PN 004, deep link `#plan=95-1732075|004|UPS`, 145,125 ppl, bit 4096
      set, publishes **"FUND HOLDINGS — 22 OPTIONS / Representative fund menu
      (community-sourced fund names)"** with estimated ERs and NEVER says the
      filing reports its investments in aggregate. 283 full-form plans /
      507,331 ppl carry that bit. Mechanism: `app.js:1690` reads
      `if (plan.filedAggregate && !(menu && menu.length))` — `menu` is the
      NOTES-extracted investment menu, so a plan that filed in aggregate but
      whose notes name funds silently gets the menu instead of the sentence.
      The master-trust branch directly above carries no such gate.
      **ESTABLISH FIRST, BEFORE TOUCHING THE BRANCH:** is the rendered menu the
      NOTES menu or the curated `data.js` overlay? That decides whether the
      "community-sourced" LABEL is also false, and therefore what the fix is.
      v172 and v179 are both on the record as fixes shipped one step ahead of
      the evidence.
      **AND THE GUARD ITSELF: `site-test.yml` has 80 runs, the newest
      2026-09-19 00:32Z, every one a manual dispatch.** It has not executed
      across ~40 parser versions and several frontend changes. Give it a push
      trigger on the frontend files — a guard that is never invoked fails more
      quietly than a red one, because a red run at least exists to be read.
      **SHIPPED THIS CYCLE (frontend, no re-parse):** `fund-er.js:1068` now
      reads all five non-registered values of the filing's 13-value type
      vocabulary, so **878 rows / 207 plans / 311,893 ppl** stop publishing a
      mutual-fund ticker with `comparable:false` against a `Separate account`.
      454 rows keep the ticker with the "comparable fund" asterisk, 424 go
      blank. Negative control 0 of 976,564 `Mutual fund` rows; regressions 0.
      **The wider variant is measured and NOT shipped** — FUND_TICKER fallback
      inside the pooled branch would move **9,835 rows / 3,334 plans /
      5,864,346 ppl** and touch 1,782 `Mutual fund` rows, breaking that
      control. It needs its own cycle.
      **(2) RE-DERIVED AND CORRECTED TWICE — the OCR-substitution item was
      OVERSTATED, and its shippable half ALREADY SHIPPED.** `app.js` has
      carried `s.replace(/\s+\|+\s*$/, " I")` since 2026-09-18 (743 plans /
      683k ppl there), so readers already see `Class I`; only the STORE holds
      the pipe. What remains is 7 rows where `lookupTicker` tries the RAW name
      first, so `... Class |` matches the base fund and publishes **TRBCX (the
      investor class)** while the displayed name says Class I and the correct
      answer is **TBCIX** — the FTBFX shape again, small.
      Do not reuse "165 rows / 68 plans / 95,501 ppl, four
      shapes": the `0`-in-word shape is **0 rows**, the `1`-in-word shape is
      **429 rows of EMPOWER LEGEND CODES** (a different class swept in by
      shape), the `5/8` shape is **2 rows** of mush, and the survivor was two
      defects sharing a regex. REAL AND CONFIRMED BY READING THE FILING: a
      trailing `|` in a share-class slot is the letter `I` — **298 rows / 181
      plans / 157,849 ppl**; Cradlepoint `20241219154849NAL0007738912001`
      rasterised at 240dpi plainly reads `T.Rowe Price Retirement 2035 Class
      I`, nine rows, vehicle column `Common Collective Trust`. The `!`-for-`I`
      shape is **7 rows / 7 plans** and a naive rewrite is WRONG on 4 of them
      (`Metrop!tn`, `Smal!Cap` want lowercase `l`) — so fix the `Class |` half
      and leave the bang alone. Pin Cradlepoint as the specimen.
      **AND THE TRAP UNDERNEATH, which cost more than the item is worth:** a
      follow-on sizing of "a collective-trust row published with a mutual-fund
      ticker" came out at **28,339 rows / 14,018,680 ppl / $381.5B** and is
      **an artifact of the harness**. `fundTickerInfo(name, type)` takes a
      SECOND argument; `fund-er.js:1068` already demotes such a row to a
      labelled comparable from the filing's own vehicle column, and
      `app.js:591-592` passes `f.type` on every call. **Transcribe
      `lookupTicker` from app.js for any measurement over `fund-er.js`** —
      reaching for the shipped predicate is not enough, it has to be called
      the way the site calls it.
      **#425 PASSED, ALL FOUR TESTS PASSED, MIRRORED.** Dove Schools back at
      `c:1` with 28 rows and every unit price intact; confident +1, the
      designed direction; True Organic holds 25 rows so the $300,645
      double-count did not return; whole-store collision test **0**.
      **THE THREE-VERSION ARC IS ONE DEFECT AND ONE LESSON:** v179 put a
      correct strip in the wrong place (`cleanDesc`, one string) and rebuilt
      the v100/Amgen shape; the triage caught it on a run I had predicted
      would be byte-identical; v180 moved the same strip to the dedup stage
      and reused v174's own guard. **The fix never changed — only where it
      could see enough to be safe.**
      **SHIPPED: the issuer section-caption strip, in `merge-4i`, NOT a parser
      version.** The test is empirical — *does the remainder appear as a
      COMPLETE issuer on other published rows?* CHS's `Principal Life
      Insurance Company` stands alone 16,457x; USC's `Account (CREF)` never
      does, so TIAA's real fund is protected. **Store-wide evidence, so
      neither lib-4i (one filing) nor the dedup stage (one row set) can decide
      it — the merge can.** Third placement call in this family settled by
      *where can the evidence be seen?* 113 rows / 42 plans, verified on the
      real merge both directions, CONFIDENCE DIFF +0 / -0.
      **QUEUE:** (1) #427 verdict -> mirror; (2) OCR character substitution,
      165 rows / 68 plans / 95,501 ppl, FOUR shapes, 59,752 behind ONE row --
      care, not speed; (3) Pechanga re-queued, v177 did NOT fix it and any fix
      must suppress at 63.7%, which `NOT_FUND_SHAPED` structurally cannot do;
      (4) SDBA fold, 269 plans / 630,032 ppl, owner question 5.
      **STATUS 11:4xZ 2026-09-21. IN FLIGHT: #425 (v180), dispatched 11:42Z on
      `2e67d180`, start verified. LIVE ON MAIN: the v179 store, MIRRORED
      11:3xZ (`58f30c52 -> ab115834`).**
      **FIRST ACTION NEXT CYCLE: #425's verdict.** Pre-registered: (1) Dove
      Schools `20250903142228NAL0015277825001` comes back **confident with 28
      rows @ ~0.987** (it is `c:0` with 2 rows on the live store, so this is a
      **+1** and the direction is the test); (2) CHS
      `20250926144818NAL0013938530001` still publishes fifteen rows with no
      `$0.00`; (3) True Organic `20260120092622NAL0003030065001` stays at 25
      rows — the $300,645 double-count must NOT come back; (4) the whole-store
      collision test returns **0 plans**.
      **#423's VERDICT IS THE ONE TO READ. MY PREDICTION WAS WRONG AND THE
      MACHINERY CAUGHT IT.** I registered "byte-identical except dl/tkSampled"
      for a name-only change; confident moved -1. **`== READ BEFORE MIRRORING
      (3)` named all three plans and `rows-dropped.txt` fired on real findings
      for the first time since it shipped** -- a check that had only ever
      printed 0. Two flags were the fix working (HS Government Partners losing
      a `all outstanding notes. $0` loan row; **True Organic's $300,645
      double-count removed**, an undesigned win); one was a real regression.
      **THE REGRESSION WAS MINE AND IT REBUILT THE v100/AMGEN SHAPE.** Dove
      Schools files 28 annuities distinguished ONLY by unit price. v179's strip
      lived in `cleanDesc`, **which sees one string**, so all 28 became
      `Annuities, @` and the dedup summed them into a $5,561,543 holding that
      does not exist. Contained ONLY by the three-row floor -- luck, not
      design. Whole-store collision test: exactly ONE plan, non-confident,
      which is what made the mirror safe.
      **WHY THE SIZING MISSED IT, and this is the third form of the same error
      in three cycles: I counted RENAMES (1,763) and read all 1,595 distinct
      ones for a name that loses meaning -- none does, ALONE. I never asked
      whether two renames in the SAME PLAN produce the SAME STRING. A rename is
      a CONDITION; a collision is the OUTCOME.**
      **v180 moves the strip to the DEDUP STAGE and reuses v174's guard rather
      than inventing a second one** -- v174's comment directly above the new
      block already states the rule v179 broke. v174's `unmarked` refusal is
      deliberately NOT copied, because blocking that collision hands True
      Organic's double-count back: **reusing a guard means reusing the parts
      that apply, not the block.** Controls both ways; gate green; corpus diff
      0/0/0/0 over 1,007.
      **TOOLING FACT WORTH KEEPING, it has now cost two doubts: a newly pinned
      specimen is NOT compared until the NEXT `diff-lineups` run.** It prints
      `(fetched 1 pinned defect specimen(s))` and still reports 0 for it. Same
      with Marsh two cycles ago. **On the pinning run the TRACE is the positive
      control; the corpus diff is only the negative one.**
      **QUEUE:** (1) #425 verdict -> mirror; (2) **SIZED AND SPLIT 12:3xZ,
      READY TO BUILD AFTER #425** -- the section-header-in-issuer class.
      Condition: 361 rows / 112 plans / 617,829 ppl. **Not one class**: USC's
      `Real Estate Account (CREF)` is TIAA's REAL fund and Sony's `Corporate
      Stock - Common` is a type label, so a blanket strip destroys names. The
      discriminating test is empirical -- *does the REMAINDER stand alone as a
      complete issuer elsewhere?* -- and splits it **GLUE 114 rows / 43 plans
      / 275,782 ppl** (CHS's `Principal Life Insurance Company` stands alone
      16,457x) from **KEEP 247 / 75 / 445,935** (`Account (CREF)` and
      `- Common` never do). **The evidence is STORE-WIDE, so this is a
      `merge-4i` normalisation, NOT a parser change -- no version bump, no
      re-parse.** NOT committed while #425 was in flight: a merge-4i commit is
      NOT deferred by `[skip ci]` (merge checks out the latest branch state,
      measured on #309), so it would have altered the merge of the run whose
      verdict comes next;
      (3) OCR character substitution, 165 rows / 68 plans / 95,501 ppl, FOUR
      shapes, 59,752 behind one row -- care, not speed; (4) Pechanga re-queued,
      v177 did NOT fix it and any fix must suppress at 63.7%, which
      `NOT_FUND_SHAPED` structurally cannot do; (5) SDBA fold, owner question 5.
      **STATUS 10:3xZ 2026-09-21. IN FLIGHT: #423 (v179), dispatched 10:15Z on
      `9756661f`, start verified. LIVE ON MAIN: the v178 store, MIRRORED
      10:1xZ (`dd2aa45d -> 9756661f`).**
      **FIRST ACTION NEXT CYCLE: #423's verdict.** v179 is a NAME-ONLY change,
      so expect the coverage line byte-identical except `dl`/`tkSampled` —
      **that is the right answer, not a stall**, for the same reason v172-v174
      were. The check that settles it is reading CHS
      (`20250926144818NAL0013938530001`) out of the store: all fifteen rows
      must read `Ret Target NNNN Sept Acct` with no `$0.00`, and the top row
      `CHS Stable Value Fund Master Trust Inv estment Account` with no trailing
      `$`. Both Emory plans lose `$917.217600`. **Issuers must be UNCHANGED**
      (`Master Trust Principal Life Insurance Company` intact) — that is the
      negative control for the placement v179 deliberately reverted.
      **#422 PASSED, ALL FOUR TESTS PASSED, MIRRORED.** confident 60,115
      (**−2, the design**), HIGH 7 = 5 + 2 self-clearing. Both Marsh acks came
      back `c:0` with `dx:"trust"`; the linked trust is confident; the 52-plan
      negative control still publishes. 49,784 participants stop seeing the
      master-trust pointer printed twice as their menu and get the trust's real
      eleven holdings. Recorded cost: the sister plan gives up a genuine
      company-stock row, 8.5% / $118,353,516.
      **THE AUDIT-REPORTING FIX IS VERIFIED at last** — third attempt, first
      run with triage findings to order. `== HIGH (7)` / `== WARN (543)` equal
      the coverage line, and **`== READ BEFORE MIRRORING (2)` named both Marsh
      acks at the top** rather than at positions 544-546 under 543 routine
      lines.
      **AND THE BIG ONE, A DEFECT IN THE ACCURACY MACHINERY ITSELF: THE RANDOM
      DRAW WAS NOT RANDOM.** `draw-weighted.mjs` hardcoded
      `let s = 0x9e3779b9 ^ 20260916200;` and **never read `argv[2]`**. Every
      invocation returned the same draw while each cycle labelled it with a
      different seed — two cycles of the required hands-on review were the SAME
      twelve plans, and the seed labels in this file and the accuracy log were
      fiction. Caught by arithmetic, not by eye: nine of twelve repeated when
      Amazon alone is ~1.5% per pick. **Fixed; it now prints the seed it used**,
      controlled both ways. Findings from those draws stand; **RATES from them
      do not.** Third measurement defect in two cycles and all three share a
      shape — the script ran, looked plausible, was believed.
      **FIRST GENUINELY SEEDED DRAW (921640):** Amazon, Teamsters National
      (164,679), O'Reilly, Aya Healthcare, Acosta, Waste Management read clean
      — O'Reilly's and Waste Management's sponsor-named top rows are the real
      company stock fund, not the sponsor-as-holding defect.
      **QUEUE:** (1) #423 verdict -> mirror; (2) **the issuer side effect v179
      declined to ship blind** — `stripTrailingColumns` runs before
      `splitNameDesc`, so fixing the cost strip there also un-glues a section
      header from the issuer (`Master Trust Principal Life Insurance Company`
      -> `Principal Life Insurance Company`). Probably right, needs its own
      sizing via corpus diff + traced specimens, not the store; (3) **OCR
      character substitution in published names, 165 rows / 68 plans / 95,501
      ppl — RECORDED, four shapes not one**: `NUVEEN LIFECYCLE !NDEX 2060 INST`
      (Aya, 13% of menu, 59,752 ppl), leading pipes, pure garbage (Bankers
      Healthcare 14 of 27 rows), and a **Voya family where OCR read the table
      BORDERS as content**. A character map eats real names and 59,752 of the
      95,501 sit behind ONE row, so this needs care, not speed; (4) Pechanga
      re-queued — v177 did NOT fix it, and any fix must suppress at 63.7%,
      which `NOT_FUND_SHAPED` structurally cannot do; (5) SDBA fold, 269 plans
      / 630,032 ppl, owner question 5.
      **STATUS 09:3xZ 2026-09-21. IN FLIGHT: #422 (v178), dispatched 08:28Z,
      start verified, ~65 min in at this writing. v179 committed `[skip ci]`
      behind it on `24584c9d` — VERIFIED the push created no run — and
      dispatches the moment #422 lands. LIVE ON MAIN: still the v176 store;
      the mirror is held on purpose (see the previous STATUS).**
      **v179: THE COST COLUMN WELDED INTO THE FUND NAME.** CHS/Community
      Health (**91,940 ppl**) published all fifteen rows as `Ret Target 2035
      Sept Acct $0.00`, top row `CHS Stable Value Fund Master Trust Inv estment
      Account $`. The filing is a clean five-column layout and the VALUE is
      read correctly — the description cell keeps the COST.
      `stripTrailingColumns` has stripped trailing cost columns since v70 and
      **none of its five arms can match `$0.00`**: the comma-group arm needs a
      comma, the plain-number arms have no `$`, so the dollar sign sits between
      the required space and the digits. Sized whole-store with all 1,595
      distinct renames printed and read: **1,763 rows / 295 plans / 560,053
      ppl**; par value protected by design (19 rows).
      **PLACEMENT IS THE LESSON AND IT IS THE REUSABLE PART.** Fixed first in
      `stripTrailingColumns`, where that function's own docstring says it
      belongs, and **reverted**: it runs BEFORE `splitNameDesc`, so it also
      moved the ISSUER column (`Master Trust Principal Life Insurance Company`
      -> `Principal Life Insurance Company`). Very likely an improvement,
      definitely unmeasured, and v126 leaked a `*` into 3,224 issuers as
      exactly that kind of side effect. Shipped narrowly in `cleanDesc`.
      **When a fix works in two places, prefer the one whose effect you have
      measured.** Gate green; corpus diff 0/0/0/0 over 1,006 filings — for a
      name-only change that is a NEGATIVE control and is stated as one, the
      positive control being the CHS trace with issuers byte-identical.
      **TWO OF MY OWN MEASUREMENTS WERE WRONG BEFORE THE FIX WAS.** (1) The
      queue entry proposing this said these names "cannot match the ticker
      table, so those rows render a blank fee cell" — **false**: 236 of the
      1,763 ALREADY resolve with the suffix attached and stripping gains
      **2 rows / 604 ppl**. It is a readability fix for 560,053 people, not a
      fee fix. (2) The script that produced that correction first returned
      **0 gained / 0 kept / 0 lost / 1,763 unidentified** — a uniform sweep,
      which this project's corollary rule says is a report on the QUERY. It
      was: `fundTickerInfo` returns `{tk, comparable}` and I read `r.ticker`.
      A positive control on six known names (`Fidelity 500 Index Fund` ->
      FXAIX) exposed it in one command. **Two measurement defects in two
      cycles — this and the NaN comparator — one caught by arithmetic that
      disagreed with a list, one by a control, neither by eye.**
      **NEXT QUEUE ITEM, opened by v179 and deliberately not shipped with it:**
      the issuer side effect above. A section header gluing into the issuer is
      a named defect in CLAUDE.md's own invariants, so the wide placement is
      probably right — it just has to be sized on its own, and a parse-time
      issuer change cannot be sized from the store. Instrument is the corpus
      diff plus traced specimens.
      **STATUS 08:4xZ 2026-09-21. IN FLIGHT: #422 (v178), dispatched 08:28Z
      on `c105a50e`, start verified. LIVE ON MAIN: the v176 store — MIRROR
      HELD ON PURPOSE, see below.**
      **FIRST ACTION NEXT CYCLE: #422's verdict against its pre-registered
      tests**, then `store-diff`, then mirror.
      **#421 PASSED AS A RUN AND v177 FAILED ITS OWN FIRST TEST — READ THIS
      BEFORE WIDENING ANY REFUSAL LIST.** pv 177 at 99.85%, confident 60,117
      (+0 / −0), HIGH 5, WARN 543, overshoot 332, dl 105 — byte-identical, and
      the byte-identity IS the failure. Pechanga still publishes `Net position
      available for benefits` at 63.7% of a 14-row menu. **`NOT_FUND_SHAPED`
      DOES NOT DROP ROWS.** It is a classifier — region scoring, managed-account
      inheritance, security shape, the audits — and its only suppressing
      consumer is v105's `aggOnly`, which needs the top row at **≥90%**. At
      63.7% nothing could reach it. The sizing counted *rows the arm matches*
      (a CONDITION) and I read it as *rows removed* (an OUTCOME), the error
      this file already records against `band-hi`. **Name the code path that
      will act on the match, and check it can reach the case, BEFORE counting
      strings.** v177 is inert and harmless; the defect is still live and back
      in the queue. Specimen #109 amended in place to say so.
      **v178 (in flight) is one arm on `isTrustPointerRow`.** Marsh & McLennan's
      two plans (**35,907 + 13,877 ppl, $8.9B**) publish the master-trust
      pointer AS their menu — the same pointer printed twice under two
      captions. The predicate reaches a trust named at the START or END of a
      row; this filing names it in the MIDDLE, so the pointer measured 51.8%
      against a 0.6 gate. **The gate was fed half its evidence; it is not set
      too high** — lowering it would have reached the right outcome for the
      wrong reason and cost the negative control. Sized by OUTCOME (flags that
      flip, not rows that match): 2 plans / 49,784 ppl, zero collateral against
      **52 plans / 2,921,909 ppl that carry a pointer BESIDE a real menu** and
      must keep publishing. Verified locally (`trustPtr=true,
      CONFIDENT=false`, ratios 0.964 / 0.917), gate green, and corpus diff
      with the specimen pinned: **CONFIDENCE LOST 1, nothing else moved over
      1,006 filings.** Both plans link to a confident trust, so the refusal
      serves a real 11-row SSGA/GIC menu. Recorded cost: the sister plan also
      gives up a real `Marsh & McLennan Companies Stock Fund` row, 8.5% /
      $118,353,516.
      **Pre-registered for #422:** (1) both Marsh acks
      (`20251006144237NAL0003603617001`, `20251006144317NAL0003820225001`) come
      back NOT confident; (2) confident falls by exactly 2 — **a −2 here is the
      designed outcome, not a regression**; (3) both plans' pages serve the
      TRUST menu (their `mtiaAck` `20251006164519NAL0006985280001` is
      confident); (4) the 52-plan negative control still publishes — spot-check
      FedEx `20251014165436NAL0006873746001` stays confident.
      **#422 IS ALSO THE FIRST RUN THAT CAN VERIFY THE AUDIT-REPORTING FIX.**
      #418 and #421 both could not: a run with zero triage findings prints
      identical numbers under the broken ordering and the fixed one, and v177
      being inert made #421 quiet too. v178 REMOVES two confident lineups, so
      `reparse-loss` findings must appear. Check: printed `== HIGH (n)` /
      `== WARN (n)` equal the coverage line's `high` / `warn`, and **`== READ
      BEFORE MIRRORING` names both Marsh plans**.
      **MIRROR HELD 08:3xZ and that is the right call, recorded as required:**
      the v177 store is +0 / −0, so mirroring delivers readers **nothing**
      while force-pushing over main's two cron commits (`dd2aa45d`,
      `3457deef`). v178's store lands within the hour and is worth a mirror —
      one force-push instead of two.
      **DRAW (seed 921521, participant-weighted, 12 plans):** ten clean —
      Amazon 1,343,800 @ 0.91, Intel, Whole Foods, Mayo, MSK, PNC, ODP,
      Drexel, Red Lobster, Plan Professionals. **NEW CLASS SIZED: a PRICE or
      UNIT-VALUE column welded into the holding NAME — 1,336 rows / 51 plans /
      207,238 ppl.** CHS/Community Health (**91,940 ppl**) carries `$0.00` on
      all 15 rows; Emory Healthcare (36,426) and Emory University (35,748)
      `QCSTIX CREF Stock R3 $917.217600` on 37/80 and 38/82; Loyola Chicago
      8,646; Harmon City `Collective Trust Fund, , $37.46/unit` on 29/31.
      Disjoint from three neighbours a single "currency in the name" regex
      would sweep up: prose-as-holding (57 rows / 55 plans / 137,148 ppl,
      known), loan-rate rows (21/21/56,880, known), and **par value, which is
      LEGITIMATE — `Common Stock, par value $0.01`, 86 rows / 22 plans — and
      must never be touched.**
      **AND A MEASUREMENT BUG WORTH THE SPACE: guard every comparator against
      undefined.** The first cut of that sizing ranked by `(a,b) => b.ppl -
      a.ppl`; a lineup ack that is a MASTER TRUST has no plans-all row, so
      `ppl` is `undefined`, the comparator returns **NaN**, and V8's sort
      scrambles the array rather than misplacing those rows. **Both largest
      members were missing from the table** (UnitedHealth 274,906 and CHS
      91,940) while the totals were correct. The tell was arithmetic: a bucket
      summing to 102,280 ppl while no listed plan exceeded 36,426.
      **STATE OF THE RESIDUALS: every number re-derived against v176 and both
      unknowns closed.** 1,354 live plans. `trust` 44 → 48 is reclassification
      (Conagra, `rw:1`); the 403 residue re-probed WHOLE at **104/104**; `few`
      re-tested — name quality 13% → 33% but reachable-and-material is 2 of 30
      (~7%), all behind a three-row floor this file has twice declined to lower.
      **QUEUE:** (1) #422 verdict → mirror; (2) **DONE as v179** — the cost column
      welded into fund names, re-sized at **1,763 rows / 295 plans / 560,053
      ppl**. **The fee-cell claim in the previous version of this line was
      FALSE**: measured with the shipped `fundTickerInfo`, 236 of those rows
      already resolve to a ticker WITH the suffix attached and stripping gains
      2 rows / 604 ppl. It is a readability fix, not a fee-coverage fix; (3) **Pechanga re-queued — v177 did NOT fix it**
      and any fix must suppress at 63.7%, which `NOT_FUND_SHAPED` cannot do;
      (4) SDBA fold, 269 plans / 630,032 ppl, owner question 5; (5)
      type-then-firm issuers, ~22 rows / ~11k ppl, too small for its own bump;
      (6) Mack Trucks (4,484 ppl) publishes a 57% `Plan's Interest in Master
      Trust` beside `Mutual Funds` and `Employee 401(k) Deferrals & Roth` —
      below v178's 0.6 gate and junk by a different mechanism, left alone
      deliberately.
   2. Recordkeeper wrong name: 1,509 plans / 1.48M ppl. Prefer service
      codes 15/64, then the line-1b platform or Schedule A carrier, then
      top-fee; never publish a provider coded 10 or 29.
   3. Discretionary match shown as a standing "Formula" (~4,469 pages) —
      display only, no re-parse.
   4. Schedule A carrier as a recordkeeper source (`build-data.mjs:624`
      resolves it and never reads it).
   5. NEC + eligibility extraction — NEW COVERAGE, owner's call.
   6. **LIVE 2026-09-17 00:1xZ (data from run #335: 5,851 plans carry an
      alias; the split line-4 sponsor / line-4 plan / older-filing is in
      #335's prep log and has not been read — 5,851 is aliases, not renames).**
      Prior sponsor / plan name as a search alias
      (Form 5500 line 4 `LAST_RPT_SPONS_NAME` / `LAST_RPT_PLAN_NAME` on both
      forms, PLUS the older filings' sponsor names per EIN|PN). Prep writes
      `alias` / `plans-list.al` / detail-shard `alias`; app.js searches it
      and prints "Previously filed as". **The cycle that sees the first prep
      run with it must read the prep log line `former names: N plans carry
      an alias` — if it prints NONE, the EFAST2 column headers did not
      resolve (they were written from the layout, unverified in-sandbox) and
      the fix is the column name, printed right above it.** Then confirm
      "shiel sexton" finds Structure Man on the mirrored site.
      `docs/accuracy-log.md` 2026-09-16 (former names).
      SIZED 2026-09-16 from 60 random filings: line 4 filled ~7% (4/60), one
      true sponsor rename (Beyond New Horizons <- National Aerospace
      Solutions). Distinct from the 301-plan / 307,583-ppl holding-entity
      shape (Sevita, DraftKings, Disney, GE Vernova/Ropcor), which is
      findable today and is a display question, not this item.

   **EVERY CYCLE, alongside the queue item: draw randomly from PUBLISHED
   lineups and read the rows.** Not from the worst bucket — that draw answers
   "what are we missing" and only this one answers "what are we getting
   wrong". Its first run (2026-09-15, 40 plans) found three unnamed classes
   totalling ~1.1M participants; 36 of 40 were clean, so expect a low rate and
   look anyway.

   **ALTERNATE THE FRAME, and say which one you used (2026-09-16).** The first
   three draws were all UNIFORM OVER PLANS. 52k of the 59k published lineups
   are small plans, so a uniform draw mostly reads plans almost nobody is in.
   A PARTICIPANT-WEIGHTED draw — selection proportional to participant count —
   answers "what does a randomly chosen READER see", and its first run found
   two verified defects in its first four plans: Walmart's $3.55B merged row
   and UPMC's roster-as-a-menu. Neither is subtle; they were simply never in
   the frame. A rate from a weighted draw is a rate PER PARTICIPANT and must
   never be quoted as a rate per plan. **A sampling frame is a claim about
   which population matters; running one frame three times asserts that claim
   without stating it.**

**A ZERO IS A RESULT ONLY IF THE INSTRUMENT COULD HAVE RETURNED NON-ZERO
(2026-09-16).** Two outcome measures returned 0 in one cycle and the zeros meant
opposite things: one class really was harmless, the other's 0 came from a broken
de-spacer that could not have matched anything. They were indistinguishable in
the output. **Run a positive control on the instrument in the SAME run that
produces the number** — the mirror of "print the members" for a non-zero.

Accuracy protocol: SIZE before fixing, RE-SIZE after (v101 was projected at 65%, delivered 2.5% in-bucket). INSTRUMENT before believing a cause — `WAMPO_TRACE=rows|cands node scripts/trace-filing.mjs <ack>` prints the parser's working. A measuring script is code and earns the same suspicion (size-features.mjs reported 30% where the truth was 7%; gap-verify's table detector fired on Statements of Changes until it required rows that NAME PRODUCTS). Prove a new guard FIRES with a negative control. Read stores through scripts/lib-schema.mjs. Parser changes: parser-gate green + a specimen + a decoy + an entry in docs/defect-specimens.json. Frontend changes: smoke-test.mjs AND map-test.mjs, bump ?v= stamps together. Log every accuracy defect permanently in docs/accuracy-log.md.

Before 7:00 AM Eastern, docs/morning-brief.md current and committed — decision-shaped, HELD-and-why first.

If there is genuinely nothing to do, say so briefly and stop. Do not invent work. No model identifier in commits, PR bodies, or code comments.

### REFUTED 2026-10-16 05:1xZ — the caption-weld STRIP (408 rows / 730,427 ppl / $2.3B). DO NOT REBUILD IT.

**The prescription below was mine, written from the member list alone, and the
differential killed it: the caption is LOAD-BEARING.** Priced through
`renderRow` over all 408 candidate rows, strip vs as-filed: `tk` **0**, row
membership **0** — and `er` moves on **77 rows, every one `null -> 0.35`** (the
owner-gated FABRICATED stable-value fee) while `shownType` moves on **103, every
one `Investment contract` -> `Mutual fund`**. `isInvestmentContractRow` reads
the FILED NAME (TRUE on 101 as filed, 0 after), so the caption is the witness
that earns the correct vehicle label and sits in the gate withholding the fee
resolver; `app.js:4230` already records that population. **So the 408 rows are
HONEST as published and the item CLOSES.** Both the welded form and its other
caption spelling are now must-KEEP pins in `lib-disclose`, so a future widening
throws by name. Three conditions the entry named were refuted too: the
bare-HOUSE refusal reaches 2 of 14 (`LEADING_HOUSE` is a FUND-house list and
these are INSURERS), token count cannot separate firm from product (`Empower
Annuity Insurance Company of America` x18 is six tokens of pure firm name), and
the attestation witness is SELF-LICENSING (that string is attested 216x as a
whole filed name, identical to `Lincoln Stable Value Account`, because the
bare-HOUSE class attests it; `fund` 30x). `docs/accuracy-log.md` 2026-10-16
(05:1xZ).

**ORIGINAL ENTRY, kept because it is what was predicted:**

### 2026-10-16 02:07 draw — the caption-weld STRIP (408 rows / 730,427 ppl / $2.3B)

**SIZED, NOT SHIPPED.** The 2026-10-12 09:4xZ withdrawal-terms ship qualifies a
caption-ONLY row; **408 published+served rows / 405 plans / 730,427 ppl /
$2,298,860,472 weld that caption in FRONT of a real product name** and so are
outside it by construction. Remedy is a **STRIP**, never a label — the remainder
names a genuine stable-value product on all 228 distinct spellings read
(`Principal Fixed Income Guaranteed Option` ×20, `Key Guaranteed Portfolio
Fund` ×18, `Voya Fixed Account` ×13, `Lincoln Stable Value Account` ×10).
**Two conditions it needs, both from its own member list:** refuse a remainder
that is a bare HOUSE (`Empower` ×10, `Lincoln` ×5 — the recorded bare-house
class), and leave `TIAA Traditional Benefit Responsive` ×7 alone (an existing
must-KEEP pin). **Control already measured: LABEL 0** — no caption-only spelling
escapes the shipped predicate, so its vocabulary is complete and this residue is
entirely the welded shape. `docs/accuracy-log.md` 2026-10-16 (03:3xZ).

### and the leading class designation — SPLIT FIRST, do not ship a number

761 published+served rows / 376 plans / 1,146,444 ppl / $8,946,670,771 survive
`cleanFiledName`'s own leading-class strip with a class designation still in
front, **0 qualified by anything shipped** — but it is THREE populations with
three remedies: bare designations naming nothing (`Class I shares` ×19, `Class T
shares` ×13, `Institutional Class shares` ×9), rotations of a real fund name
(`Class R6 Fidelity Mid Cap Index Fund`, `Institutional Class Invesco Developing
Markets Fund Class R6`), and **real names that must be spared** (`Class B Common
Stock` ×5 — employer stock's own class). Split before any arm.

### SHIPPED 2026-10-16 06:5xZ — the contract designation as an ACRONYM (223 rows / 683,649 ppl / $2.96B)

`annuityFeeIsGuaranteeOnly`'s gate was the literal word `contract`, and a GIC
is a Guaranteed Investment **Contract** while a SAGIC is a Separate Account GIC
— so `SAGIC Diversified Bond II` states the designation and was not being
asked. One disjunct (`GIC_ACRONYM`). **FEE WITHDRAWN 223 rows / 216 plans /
683,649 ppl / $2,959,846,571; gained 0, changed 0; `tk`/`star`/`shownType`/
`name` all 0; 103 rows at >=10% of their own menu; 0 withdrawals publish a
ticker; control 20,737 non-candidates differing on 0.** Internal witness: the
same product filed 304 ways, the 118 rows whose filer TYPED the vehicle already
published no fee and the 186 blank-typed published 0.35 — the eighth blank-type
instance. In scope by the owner-gated item's own stated boundary (rows carrying
the filing's own word `contract` are "the condition the project already decided
on"). `docs/accuracy-log.md` 2026-10-16 (06:5xZ).

**Named residue, none of it a gap in this arm:** the 319 candidate rows that
keep their fee are the residue test working; the 5 rows whose RAW name says
`contract` and whose CLEANED name does not stay unreachable by any NAME
condition; and **two OCR-damaged rows (`V anguard A trate gic Sm all-Cap Equity
Fund`, `Lazard Inte rnational Strate gic Equity Fund`) want a NAME repair** —
a space inside `strategic` MANUFACTURES the token, and the 0.35 they publish
today is an accident of the same damage.

### 2026-10-16 05:3xZ — the fabricated stable-value fee, RE-SIZED for the decision (OWNER-GATED)

**The acronym class is CLOSED: no sibling designation exists.** Measured as the
fee gate's whole residue — rows the page prices, priced ONLY by a guarantee
word, and not admitted by `annuityFeeIsGuaranteeOnly` — over all 1,721,920
published+served rows, candidate set a superset by construction:
**6,567 rows / 1,850 distinct names / 6,367 plans / 10,083,769 ppl /
$36,129,478,831**, of which **4 publish a ticker**, 0 are asterisked, 1,147 are
at >=10% of their own menu, 5,716 are BLANK-TYPED, and the fee is 0.35 on
6,472 / 0.3 on 54 / 0.4 on 41. All 40 commonest names and the 12 largest by
dollars were read: every one is a stable-value or guaranteed-option product
carrying NO contract designation in any form, so there is no further acronym to
admit.
**The decision-relevant fact is the ticker column: a withdrawal costs 4
identifications and nothing else.** Do NOT carry the recorded 4,669 rows /
7,389,704 ppl as this figure — different definition, not growth.
`docs/accuracy-log.md` 2026-10-16 (05:3xZ).

### 2026-10-16 06:4xZ — the leading-CUSIP class: RE-SCOPED, and it belongs at MERGE stage

**NOT the independent legibility item the register describes.** Corrected screen
(a CUSIP's 9th character is a CHECK DIGIT; `^[0-9A-Z]{9}\s` also matches
`BLACKROCK`/`ALLSPRING`/`NEUBERGER` and would delete the HOUSE from 3,894 rows)
reproduces the recorded class at **263 rows / 23 plans / 515,346 ppl / $48.0B**,
and both recorded risks measure ZERO: tk/er/star/shownType 0 and `ID_ONLY` row
membership 0.
**Two reasons it still must not ship, neither in the register:** (1) **82 rows /
292,418 ppl / $8.4B COLLIDE with a sibling row once stripped** — four
`US TREASURY NOTE` rows distinguished only by their CUSIPs — so for those the
identifier IS the identity and stripping MERGES distinct holdings; (2) it flips
`employerStockSymbolOk` on **exactly 1 row, AT&T's own stock (203,226 ppl /
$3.86B)**, which is the owner-gated employer-stock relaxation reached from
another file.
**THE STAGE IS THE FINDING: it cannot live in `cleanFiledName`**, because the
collision test needs the row's SIBLINGS and the stock refusal needs the plan's
sponsor and ticker, and the cleaner receives a STRING. It belongs in `merge-4i`
beside `wrapRepair`/`nounRepair`. Next cycle: merge-side arm, refuse a colliding
remainder and the sponsor's own stock, differential merge run. ~180 rows /
~509,900 readers. `docs/accuracy-log.md` 2026-10-16 (06:4xZ).

### and a new mechanism from the 06:07 draw — the SINGULAR house plus a REORDERED vintage

The Broad Institute (4,155 ppl) publishes ten `American Fund Target Date
<vintage> R6` rows with no ticker and no fee (60% of its menu). Probed one token
at a time: as filed resolves nothing; `American Funds` (plural) gives the FEE
0.32 and still no symbol; plural AND `2050 Target Date` (registry order) gives
RFITX and 0.32. So TWO independent tokens block it. A synthetic probe cannot
reach `sec-tickers.js` (keyed on `(issuer, nameRaw)`), so the draw's real rows
are the authority. UNSIZED store-wide — size it before any arm.

### SHIPPED 2026-10-16 08:0xZ — the leading security identifier (225 reader-facing rows / 509,902 ppl)

`cusipRepair` in `merge-4i.mjs`, the seventh arm in that chain. 651 stored rows
/ 225 published+served / 19 plans / 509,902 ppl / $62,908,343,338, **name the
only published cell that moves** (tk/er/star/shownType 0, row membership 0),
`confident` 60,182 unchanged, CONFIDENCE DIFF +0/-0. Three refusals, each a
measured population: a remainder colliding with a sibling row (82 rows / 292,418
ppl — four `US TREASURY NOTE` rows in one menu), the sponsor's own stock (2 rows),
and a row `sec-tickers.js` is keyed on (4 published symbols).
**NEW GAP IN A SHIPPED GUARD, applying to all six arms above it:**
`sec-tickers-stamp-test` fingerprints the apppath slice and `merge-4i.mjs` is not
in it, so a merge-side NAME repair invalidates table keys with nothing going red
— *our own repair is the drift*. Worth its own cycle: either add the repair arms
to the fingerprint, or have the merge report how many keys its repairs
invalidated. `docs/accuracy-log.md` 2026-10-16 (08:0xZ).

### SHIPPED 2026-10-16 08:4xZ — the merge reports its own ticker-key invalidations

The queued gap, closed with a number rather than a wider fingerprint. Each of
`merge-4i`'s ten repair arms now reports how many repairs landed on a row
`sec-tickers.js` was keyed on; the identifier arm declines those, so it reports
0 by construction. Live store: **NONE** on every arm (a fact about today's store,
not a property of the arms). Positive control: neutering refusal (3) makes the
tally read **`cus 7`**. Convergence: three merges repair 16, then 0, then 0.
`docs/accuracy-log.md` 2026-10-16 (08:4xZ).

### and the 08:07 draw — the wrong-share-class item's sharpest witness

Lifestance Health (12,474 ppl) states `Investor Shares` on two adjacent rows:
`Total Stock Market Index Investor Shares` publishes **VTSAX** (Admiral) as FACT
where the registry says **VTSMX**, while `Growth Index Investor Shares` publishes
**VIGRX** correctly. A third row, `Information Tech Index Adm Shares`, publishes
no ticker at all where **VITAX** is registered. One menu, one house, the class
stated every time, three outcomes — so the discriminator is which arm
`fund-er.js` carries for that series, not the class word. Owner-gated.

### 2026-10-16 09:4xZ — the contraction families MEASURED, and one wrong fix refuted

Measured through the page, six families / 57,586 published+served rows: the
shipped abbreviation arms reach **two thirds** of their own families
(`AMERFUNDS` 64.7%, `AMF` 72.6%, `VANG`-contracted 69.8%, Vanguard contracted
product 52.7%, `FID` 49.4%) and the worst by rate is **`American Fund`
SINGULAR at 24.2% — 603 unresolved rows / 325,394 ppl**, whose two blockers are
the singular house AND a reordered vintage.
**NOT a gap:** the 458-row `AMERFUNDS 2010/2015/2020/2025` miss is a PINNED
abstention and the ship's reason is right — the registry carries those four as
`… Target Date Retirement **INCOME** Fund`, and the filing omits `Income`.
**REFUTED, do not rebuild:** adding `retirement` to `NOISE_WORDS` does NOT
resolve `AMF 2050 TARGET DATE R2E` (that list applies to the FILED tokens, not
the series words), and the vintage-uniqueness safety argument is FALSE — 3
series carry `Retirement` with no vintage. The real change is a structural
relaxation letting TRAILING series words go unconsumed, which carries the
recorded cross-fund exposure. `docs/accuracy-log.md` 2026-10-16 (09:4xZ).

### 2026-10-16 10:4xZ — NEXT BUILD, briefed: the Fidelity Freedom class-token contraction

**ASSERTABLE population: 15,763 published+served rows / 2,161 plans /
2,802,386 ppl / $45,220,661,920** — Freedom ladder rows that STATE a class, are
not pooled-typed, and publish no symbol (15,268 of them publish a FEE, so this
is coverage, not a false claim).
**The gap is a CLASS TOKEN and nothing else**, proved by the 10:07 draw: Wand
Newco 3 publishes `Fidelity Freedom Index 2050 **Premier**` -> FRLPX correctly,
while `FID FDM IDX 2050 IPR` resolves nothing. Destinations verified in
`sec-funds.json` (FFOPX Institutional Premium, FRLPX Premier, FNSBX Class K,
FZTKX K6).
**Tokens:** IPR 5,774 · K 4,988 · PRM 549 · K6 489 · PREMIE 275 · INV 250 ·
INSTP 185. **They are NOT interchangeable:** IPR/INSTP = Institutional Premium
(FFOPX), PRM/PREMIE = Premier (FRLPX) — conflating them publishes the wrong
class as fact on ~6,000 rows.
**Three hazards, all visible in the data:** `Freedom BLEND` is a third ladder and
a collective trust (the whole pooled bucket, correctly blank); `Fidelity ADVISOR
Freedom` is a separate series sharing a bare `K6`, so that token must abstain;
and the registry's class column holds a SERIES NAME on one row.
**Also corrected:** last hour's "FID family 36,684 rows / 49.4%" is the
CONTRACTED spellings only — `/^FID\b/` excludes `FIDELITY`, and the house is
202,459 rows. `docs/accuracy-log.md` 2026-10-16 (10:4xZ).

### 2026-10-16 11:4xZ — the Fidelity Freedom arm: SPECIFIED, every premise verified

**The relation GENERALISES** — `abbreviates` accepts all four Fidelity series
spellings (`FID FDM IDX 2050`, `FID FREEDOM 2050`, `FID FRDM IDX 2050`, spelled
out) against the registered series names, so no new relation is needed.
**The blocker is the CLASS, matched by normalised EQUALITY not by the relation:**
`classKey("Institutional Premium Class")` = `institutionalpremium` vs a filed
`IPR`. Capital Group's classes are CODES that survive normalisation; Fidelity's
are WORDS filers contract. Under the relation the tokens resolve and STAY
DISTINCT (IPR -> FFOPX, PRM -> FRLPX, and IPR does NOT reach Premier), so the
conflation hazard is absent by construction rather than needing a guard.
**Family marker verified: `Class K6` — 4 registrants, 0 not Fidelity-named,
207 series-class rows, and all three Freedom ladders inside it.** (`Premier
Class` and `Class K` are NOT markers: 3 and 23 foreign registrants.)
**CORRECTION to the 10:4xZ entry: `Fidelity Freedom BLEND` IS registered, with
nine class rows.** Its blank is right because of the TYPE CELL and the per-row
pooled gate, not because the product is unregistered — so an arm reaching it
would assert a real fund's symbol on a trust.
**BUILD:** generalise `buildAfIndex` to take a family marker set (wrapper kept,
never a second copy), add a relation fallback for the class where equality
fails, require a UNIQUE class match, assert the new family. Reach **15,763 rows
/ 2,161 plans / 2,802,386 ppl / $45.2B**. Needs a 20-minute regen + key diff +
tether. `docs/accuracy-log.md` 2026-10-16 (11:4xZ).

### 2026-10-16 14:0xZ — SHIPPED: the Fidelity class contraction, 2,184,395 participants

**13,183 published+served rows / 2,935 keys / 1,436 acks / 1,447 plans /
2,184,395 ppl / $40,035,844,309 gain an ASSERTED symbol** — the largest coverage
ship on this record by participants. `FID FDM IDX 2050 IPR` published nothing
while `Fidelity Freedom Index 2050 Premier` resolved two rows away.
`lib-af-abbrev.mjs` is now parameterised by a FAMILY (registry marker, house
phrase, skippable series words, class-by-relation) with `buildAfIndex` kept as a
thin wrapper; Capital Group preserved at **0 differences over 644,064 distinct
strings**. Ticker lost 0 / swapped 0, asterisk 0, FEE 0, name 0, shownType 0,
control 20,726 rows differing on 0; table ADDED 2,935 / REMOVED 0 / CHANGED 0,
all attributed, zero drift. `site-test` #223 success on `2a5b30a1`.
**PRE-REGISTERED: `tkExact` 40.23 -> 40.96, nothing else on the 35-key line** —
measured by running `audit-data` itself against the new table and diffing its
computed line key by key.
**STILL OPEN from it:** 6,510 of the arm's 6,572 `K`-class rows reach a
COMPARABLE from the base matcher, dropped at the call site before this arm runs.
Promoting a comparable is a different claim from filling a blank (the Admiral
arm's 383-cell boundary) and is asserted as an ABSENCE in the tether.
**NEXT, by participants and ungated:** the `American Fund` SINGULAR house, 603
unresolved rows / 325,394 ppl, blocked by two things at once (the singular house
and a reordered vintage); then the opaque-issuer-code class (166 rows / 597,335
ppl, screen contaminated — re-key it before sizing).
`docs/accuracy-log.md` 2026-10-16 (14:0xZ).

### 2026-10-16 15:0xZ — SHIPPED: the vintage may sit anywhere, 621 rows / 89,935 ppl

**621 published+served rows / 404 keys / 90 plans / 89,935 ppl / $1,278,441,686
gain an ASSERTED symbol** — 593 to the Capital Group family, 28 to Fidelity's.
`American Funds Trgt Date Ret 2050 R6` published nothing where `… 2050 Target
Date Retirement R6` resolved RFITX, because the registry puts the year in the
MIDDLE and `abbreviates` consumes series words in order. One token may now sit
out of position — a four-digit year, identical on both sides, remainder still
ordered.
***THE QUEUE ENTRY'S "blocked by the SINGULAR house AND a reordered vintage" IS
HALF REFUTED:*** `houseRun` reads 2 for `American Fund` and `American Funds`
alike and both resolve identically, so the singular house blocks nothing — the
vintage blocks the plural spelling just as hard.
Ticker lost 0 / swapped 0, asterisk 0, FEE 0, name 0, shownType 0; control
20,895 rows differing on 0; table ADDED 404 / REMOVED 0 / CHANGED 0, all
attributed, zero drift.
**PRE-REGISTERED, SUPERSEDING the 14:0xZ figure: `tkExact` 40.23 -> 41.02** and
nothing else on the 35-key line — both ships are in the same table, so 40.96 can
no longer occur.
**DO NOT CARRY my own sizing of 267 rows / 34,935 ppl** — it asked the Capital
Group family alone and under-predicted by 2.3x.
***THE "NEXT" THIS ENTRY ORIGINALLY NAMED IS A NON-GAP, CORRECTED TEN MINUTES
LATER BY ASKING THE PAGE INSTEAD OF ONE ARM.*** I queued the EuroPacific/EUPAC
half because `afAbbrevAsk` abstains on `American Fund EuroPacific Growth R6` —
and `renderRow` resolves **RERGX on all six spellings**, singular house
included, through `fund-er.js`'s own October EUPAC push. *There are two
resolvers, and an abstention from one is not a gap on the page*: the trap this
record names in capitals, met inside my own queue entry one hour after shipping
an arm whose whole subject is that distinction, and in the opposite direction to
this morning's 10:4xZ instance. **Before queuing an item from a probe, render
the row.**
**What that probe DID find is an existing class with a sharper witness:** the one
resolved symbol publishes FOUR fees by spelling — `er` **null / 0.46 / 0.4 /
null** — a fourth named witness for the owner-gated one-ticker-two-fees item and
the first where one of the two answers is a BLANK rather than a different number.
**NEXT, re-derived:** the opaque-issuer-code class (166 rows / 597,335 ppl,
screen contaminated — re-key before sizing), then the `American Fund` singular
residue measured through the PAGE rather than through one arm.
`docs/accuracy-log.md` 2026-10-16 (15:0xZ).

### 2026-10-16 16:0xZ — SHIPPED: the sponsor's own fund code as the issuer, 521,345 ppl

**117 published+served rows / 96 distinct cells / 10 acks / 18 plans / 521,345
ppl / $46,046,694,713 stop leading with an opaque code**, and 7 crawlable pages
/ 68 rows read as a per-page SET DIFFERENCE with the row count identical both
sides. AT&T's 192,505-participant trust published `TEAF50020002 · Bgi Equity
Index Fund F`; also Howmet `ALCF…`, Alcoa `RN2F…`, Boehringer `BOEF…`, General
Mills `GMTF…`, ITW's synthetic-GIC contract number, Capital One `MDA01269TR-00`.
A second DISJUNCT inside `isNonIssuerCell` (not a widening of its furniture run)
so it reaches both surfaces and the smoke test's twin cross-check through the one
function the call sites already ask.
***THE RECORDED SCREEN WAS CONTAMINATED AND THE RE-KEY IS THE VALUE:*** "no
three-letter word" could not tell `TEAF50020002` from `RET2030 I`, a target-date
CLASS designation, and read 166 rows / 597,335 ppl. Re-keyed structurally — ONE
token, >=8 chars, >=4 digits, >=1 letter — and **all 96 cells READ with ZERO
decoys**, which is the only honest test of a shape screen.
**My own must-NOT-fire control fired and the CONTROL was wrong:** a bare CUSIP in
the ISSUER cell names nothing a reader can use either, so it is a must-FIRE. An
ALL-DIGIT cell is deliberately left alone (a security identifier, another arm).
**The staleness gate fired on the way out, correctly, costing a 30-minute
regeneration — which came back ADDED 0 / REMOVED 0 / CHANGED 0.** `PARSER_VERSION`
stays 203; no coverage key can move, so nothing is pre-registered beyond the
41.02 already standing.
**NEXT:** move the `sec-tickers.js` regeneration into the Actions pipeline. It is
30 minutes of CPU and this container grants a background process CPU only while a
turn is active, so one ship costs 15+ polling turns; runners here are free and
unlimited (measured `billable.UBUNTU.total_ms = 0`). That is the single biggest
constraint on this loop's throughput.
`docs/accuracy-log.md` 2026-10-16 (15:5xZ).

### 2026-10-16 16:2xZ — the Capital Group residue, re-measured THROUGH THE PAGE and SPLIT

**134,789 house rows reach readers; 74,341 (55.2%) publish a symbol, 60,448
publish NONE — 14,540 plans / 18,045,367 ppl / $142.7B.** Split by whether the
filed name states a class at all:
- **states a class — THIS ARM'S COVERAGE: 15,235 rows / 4,898 plans /
  4,652,034 ppl / $25.2B.** Shapes: `<vintage> t date r6` ×1,008, `<vintage>
  trgt dte rtm r6 fd` ×665, `<vintage> targ dateret r6` ×513, `<vintage> target
  date r6` ×511, `<vintage> tar ret r6` ×502, `trgtdt <vintage> r6` ×419.
- **states NONE — the OWNER-GATED comparable decision: 45,213 rows / 10,344
  plans / 14,341,395 ppl / $117.5B.** `<vintage> target date retirement fund`
  ×6,649, `new world fund` ×1,252, `europacific growth fund` ×1,175 — the fund
  named correctly with the class left out, where the honest answer is an
  asterisk and this table ships assertions only.
**So 79% of the readers behind the biggest house's blanks are waiting on one
product decision, not on code.** *A residue can be large and still be nobody's
bug.*
**NEXT, and the protocol requires it in this order:** attribute each open shape
to a CAUSE (the two already recorded are a filer omitting a series word, and the
2010-2025 Income rename) BEFORE touching the relation. The widening these shapes
point at — trailing series words unconsumed — is the one carrying the recorded
cross-fund exposure, and a 4.65M-reader prize does not change the evidence it
needs.
`docs/accuracy-log.md` 2026-10-16 (16:2xZ).

### 2026-10-16 16:4xZ — the open shapes are DIAGNOSED, and my own 15,235 over-counts

Each of the seven open shapes through the shipped arm, one thing varied at a
time, first-refusing-condition reported:
- **FIVE shapes, ONE cause, 2,868 rows:** `<vintage> t date r6` ×1,008,
  `<vintage> target date r6` ×511, `<vintage> tar ret r6` ×502, `trgtdt
  <vintage> r6` ×419, `<vintage> trgt date retire` ×428 — **the filer OMITS a
  series word** (`retirement`/`target`/`date`), so the ordered relation cannot
  match. That is the recorded structural relaxation with cross-fund exposure.
- ***TWO shapes RESOLVE already*** (`<vintage> trgt dte rtm r6 fd` ×665,
  `<vintage> targ dateret r6` ×513 -> RFKTX), so their 1,178 residue rows have a
  DIFFERENT cause and my 15,235 over-counts. Check in this order: the per-row
  POOLED gate (Capital Group's target-date CIT ladder, correctly blank), the
  COMPARABLE precedence at the generator's call site (the boundary that eats
  6,510 of the Fidelity arm's `K` rows), or a house spelling my synthetic probe
  did not reproduce.
**NEXT:** carry the real rows out of the store rather than reconstructing their
names — *a shape histogram groups by what the name looks like, and a blank's
cause lives in the ROW.* Only then is the omitted-series-word relaxation worth
pricing, and it is worth at most 2,868 rows rather than 15,235.
`docs/accuracy-log.md` 2026-10-16 (16:4xZ).

### 2026-10-16 17:0xZ — every blank of the biggest house's residue has a NAMED cause

Carried the real rows out of the store and asked the generator's own stages in
the generator's own order. Nothing rests as unknown: **the ARM abstains 9,215
rows / 3,644,235 ppl · a POOLED vehicle, correctly blank 5,050 / 981,718 · the
COMPARABLE precedence 932 / 130,418 · a render gate 38 / 9,246.**
***THE ORDER IS THE MEASUREMENT AND MY FIRST RUN HAD IT WRONG TWICE*** — the
table's key map ahead of the vehicle question read 1,404 rows as a mystery (every
example typed `Pooled separate account`, the render-time gate working, the key
written by a non-pooled SIBLING — the recorded "a key cannot carry the vehicle"
class, now numbered), and the arm ahead of `resolveHolding` read 265 as
UNEXPLAINED where `secAsk` asks the registry FIRST. Re-ordered, **both residual
buckets go to ZERO.**
***THE 16:4xZ "two shapes resolve already" IS REFUTED AND SO ARE ALL THREE
QUEUED CAUSES: all 39 abstaining spellings of those two shapes are a 2010 / 2015
/ 2020 / 2025 vintage***, i.e. the Income rename already on the record, while
2030-2060 resolve. **A SHAPE GENERALISES A TOKEN, SO PROBING ONE VALUE OF IT
ANSWERS FOR THAT VALUE ALONE** — the probe used 2050. The relation-blocked
population stays at 2,868 rows.
**SHIPPED FROM IT (pending the regeneration's key diff): the precedence.** An
arm that names the STATED class now outranks a hedged registry answer —
**7,332 rows / 784 plans / 963,321 ppl / $23.5B, every one BLANK today**,
Fidelity's Freedom `K` ladder being 7,021 of it (`Fidelity Freedom 2030 K Fund`
hedges FFFEX, the INVESTOR class, where the arm asserts FSNQX, Class K). A
PRECEDENCE and not a widening: a comparable is never shipped, so a blank can
only become a symbol and never one symbol another. `classStated` refuses the one
row of 7,333 whose class the filing does not state.
**NEXT:** read the regen's key diff, run `audit-data.mjs` against the new table
and SUPERSEDE the standing 41.02 registration — three ships now sit in one table
and no merge has reflected any of them (the trail still reads 40.23).
`docs/accuracy-log.md` 2026-10-16 (17:0xZ).

### 2026-10-16 18:5xZ — SHIPPED and MIRRORED: the precedence, 963,321 readers

**7,332 published+served rows / 784 plans / 963,321 ppl / $23.5B gain an
ASSERTED symbol, every one BLANK today** — Fidelity's Freedom `K` ladder is
7,021 of it (hedged FFFEX, the INVESTOR class; asserted FSNQX, Class K), Capital
Group 311. A PRECEDENCE, not a widening: `secAsk` asks `resolveHolding` first
and reached the arms only on `!out`, and a comparable is never shipped, so a
blank can only become a symbol. Table **15,747 -> 16,963 keys, ADDED 1,216 /
REMOVED 0 / CHANGED 0.** `classStated` refuses the one row of 7,333 whose class
the filing does not state. Mirrored `48ec8aa8 -> f5fdb563`, mirror-gate 0 plans
/ 0 participants.
**THE STANDING 41.02 REGISTRATION DELIVERED AND HELD DEAD ON ITS POINT ESTIMATE
— #680 appended `tkExact` **41.02**, 34 other keys unchanged.** My first
measurement of the new ship said "40.23 -> 41.32, no merge has reflected any of
them" and was wrong: #680 ran on MAIN, which already carried the first two
ships' table, while I was dispatching regenerations on dev. Re-measured against
#680's own line: **41.02 -> 41.32, exactly one of 35 keys.** #681 dispatched on
dev to settle it.
**FOUR DISPATCHES OF THE REGEN WORKFLOW, TWO OF THEM MY OWN DEFECTS, AND BOTH
WORTH THE TIME.** Run 2 was stopped by the absence pin that asserted
`Fidelity Freedom 2050 K Fund` resolves nothing — *an absence pin on a generated
asset is not merely a regression guard, it is what forces the measurement to
exist* — and run 3 regenerated for 23 minutes and could not push, for want of
`permissions: contents: write`. **The 16:1xZ verification run could not have
caught that: its key diff was 0/0/0, so `git diff --quiet` short-circuited and
the push path never ran.** *A workflow verified only on a no-op has not had its
writing step tested.*
**AND THE JOB LOG IS READABLE AFTER ALL** — `mcp__github__get_job_logs` with
`return_content: true`, where `gh api …/logs` refuses the blob redirect. The
16:1xZ limitation was a property of one client, not of the container.
**NEXT:** #681's verdict against the 41.32 registration; then the
omitted-series-word relaxation (2,868 rows, cross-fund exposure, carry the real
rows out of the store), or the 1,178 Income-rename rows, which need a SOURCED
rename and not a relaxation.
`docs/accuracy-log.md` 2026-10-16 (18:3xZ).

### 2026-10-16 19:3xZ — VERDICT: #681 delivered 41.32 exactly, and the cycle's work is live

**`tkExact` 41.02 -> 41.32, exactly ONE of 35 keys moved**, compared against the
line attributed by the COMMIT that introduced it (`840e6455`, which appended one
line and rewrote none). Second registration of the day to land dead on its point
estimate — 41.02 on #680 and 41.32 on #681, both derived by RUNNING
`audit-data.mjs` over the committed store with the new asset rather than
reasoning about it. **NOTHING IS PRE-REGISTERED AND PENDING.** Mirrored
`f5fdb563 -> ba333a4a`, mirror-gate 0 plans / 0 participants.
**THE DRAW (seed 16102026) found one thing and it is SIZED, NOT SHIPPED: a
benefit-responsive CAPTION welded in front of a real name — 449 rows / 445 plans
/ 951,311 ppl / $2.86B, 0 publishing a ticker and 2 a fee.** Lowe Enterprises
publishes `Fully benefit-responsive investment contract Lincoln Stable Value
Account` at 28.6% of its own menu. It is the INVERSE of this morning's 09:4xZ
ship (there the caption IS the whole name and gets a label; here it is a PREFIX,
so the remedy is a STRIP and a label would be false) — **and it is three classes:
the remainder names a VEHICLE on 305 rows / $1.67B (strip), an ENTITY on 85 /
$511M (the trustee-weld family), and the BASIS caption `at contract value` on 59
/ $681M, where a strip must leave a string the shipped predicates still reach or
it turns a nameless row into one that reads as a name.** `FULLY
BENEFIT-RESPONSIVE INVESTMENT CONTRACT, AT CONTRACT VALUE T. Rowe Price
Associates` (45,556 ppl) carries all three and is the case any arm must be tested
against. Salesforce (57,193 ppl) drew clean — every collective trust correctly
unpriced.
**NEXT, in order:** (1) the welded caption above, whose measurement is the
COMPOSITION with `isContractBasisCaption`/`isGenericTypeName` and not a wider
pattern; (2) the omitted-series-word relaxation, worth **at most 2,868 rows**,
carrying the recorded cross-fund exposure; (3) the 1,178 Income-rename rows,
which need a SOURCED rename via `fund-facts` and not a relaxation.
**STILL WITH THE OWNER, unchanged and each worth millions of cells:** may a fee
be WITHDRAWN where it cannot be sourced; a bulk per-ticker expense-ratio file or
outbound `sec.gov` access (measured today: `CONNECT tunnel failed, 403`); and the
asterisk/comparable decision, 188,846 rows / ~49M readers.
`docs/accuracy-log.md` 2026-10-16 (19:1xZ).

### 2026-10-16 19:3xZ — REFUTED: the benefit-responsive caption strip, and the caption is the witness

The queue's own next item, worked and **not shipped.** The composition it asked
about came back clean — the shipped bare-whitespace caption arm's `at` furniture
already refuses the whole BASIS bucket (59 rows, the class's largest member by
dollars), its four-token floor refuses the bare `VALIC`, and one scoped
condition splits the ENTITY bucket at SHIP 104 distinct / 149 rows vs HOLD 18 /
36, **all 122 read and the 18 held bare legal names 18 of 18.**
***THEN THE DIFFERENTIAL KILLED IT, on two columns the sizing never asked
about: 55 rows newly publish the owner-gated fabricated 0.35 on $199,219,334,
and 25 rows go from a true `Investment contract` to a false `Mutual fund`.***
The caption is what keeps `fund-er.js`'s stable-value pattern off the row and
the only evidence the page has for the vehicle. Ticker 0, asterisk 0, row
membership 0, control 17,705 non-candidates differing on 0, twin agreeing on all
4,616 candidate rows — *so a strip can be net harmful while moving none of the
three cells this record already says to check.* Both files reverted.
**WHAT REPLACES IT is a DISPLAY change, not a name one:** the vehicle is already
in the type column, so the caption wants CONSUMING into the label it already
produces (`Investment contract · Lincoln Stable Value Account`) rather than
deleting. That is a change to what the row prints.
**NEXT:** (1) that display form, if it is worth it; (2) the omitted-series-word
relaxation, at most 2,868 rows with the recorded cross-fund exposure; (3) the
1,178 Income-rename rows, which need a SOURCED rename via `fund-facts`.
`docs/accuracy-log.md` 2026-10-16 (19:3xZ).

**20:07 — THE CONSUME FORM IS WORKED AND REFUSED BY A PIN THAT ALREADY
CONSIDERED IT. Item (1) above is CLOSED; nothing shipped but the price of the
refusal.** The census of all 4,616 caption-bearing published+served rows is in
the log; the strip's reachable population splits CONSUME 69 rows / 118,473 ppl
/ HOLD 36 / 73,301 / LEAVE ALONE 28 / 28,711, and the bucket we already label
`Investment contract` (118 rows) is DISJOINT from the reached one, so "pure
legibility where a label is already printed" is an empty population.
**WHAT THE CENSUS HANDED BACK IS BETTER THAN THE PRESCRIPTION: the TYPE RULE IS
NARROWER THAN ITS OWN FEE GATE.** `annuityFeeIsGuaranteeOnly` is asked
`(f.name, fundER)` and reads NO type, while `isInvestmentContractRow` opens
`if (!/^mutual fund/i.test(type)) return false;` — so on a BLANK type cell one
half of one shipped rule fires and the other declines. Relaxing that one gate
reaches 823 rows: **683 / 637 plans / 1,213,651 ppl / $7,371,212,924 gain the
label**, 139 keep `Filing names no specific fund` (the arm ORDER already decides
that), 1 is held by the remainder test — and it moves the **TYPE CELL ALONE**,
because the fee gate already covers them (0 of 823 publish a fee, 0 a ticker).
***REFUSED BECAUSE `gen-generic-twin.mjs` ALREADY PINS
`{ name: "Fully Benefit-Responsive Investment Contract VALIC", type: "" }` AS
MUST-KEEP*** — the blank cell, explicitly, under "the type is already honest",
which is app.js's own recorded position. Filling an empty cell from a claim the
NAME COLUMN already prints is a display-policy reversal over 1.2M readers:
**the owner's call, and the pin wins.** The rule, already on this record in the
right order: *before acting on a queued prescription, grep the fixtures for the
CONDITION it touches* — here the grep came after three whole-store
measurements, and for a predicate the thing to read is its must-NOT-fire list.
SHIPPED: the pin duplicated from the live store (67 rows) with the figures
beside it, in **`smoke-test.mjs` as well as the generator**, because the
generator is not run in CI and a pin living only there is exercised only when
someone regenerates. app.js unchanged → no restamp, no regeneration owed.
**NAMED RESIDUE:** `app.js`'s generated twin of `OPAQUE_ID_CELL` carries a
shorter COMMENT than its canonical (43 lines, all comments, behaviour
byte-identical). Deliberately not adopted — the re-slice lands inside the
fingerprinted region, so it would move `SEC_TICKERS_CODE` and the stamp and cost
a 30-minute regeneration spent on a comment. The next ship there adopts it free.
**NEXT:** (1) the owner decision above, one line, measurement ready; (2) the
omitted-series-word relaxation, at most 2,868 rows with the recorded cross-fund
exposure, whose next measurement must carry the real rows out of the store;
(3) the 1,178 Income-rename rows, which need a SOURCED rename via `fund-facts`.
`docs/accuracy-log.md` 2026-10-16 (20:4xZ).
