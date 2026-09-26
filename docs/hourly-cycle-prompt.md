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
