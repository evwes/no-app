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
      **STATUS 02:4xZ 2026-09-19 (b): draw (seed 20260920, v143 store)
      13/15 real menus; NRECA (80,475 ppl) publishes its table of contents
      (`Common collective trusts (pages 165-166)` 49%) — the only
      page-reference name in the store, queue (o), one plan; Paramount's
      category labels are (h). #381 in flight.
      **STATUS 02:4xZ 2026-09-19: #380 (v143) PASSED — pv 143 99.85%,
      +0/−0, HIGH 4, overshoot 354, 2,224 rows / 271 plans / 286k ppl
      renamed code → fund, Lulus/Fusion on readable regions; MIRRORED
      `7d2349b1` unforced. **#381 dispatched 02:36Z = v144 + v145 + v146
      in one run** (in flight; mirror HELD until it lands). Coded residue
      1,103 rows / 238 plans (930 non-ticker codes; 10 plans on a path
      without the legend step). Next wake: verdict #381 against `old8`
      (v143 shards) — fold/tail (Boeing 6,937 positions), duplicates
      (R&L), trust pointers (Energy Transfer, Sunoco), two-column wraps
      (Rush Copley), doubled house (238 plans) — then mirror, draw, (n).
      `docs/accuracy-log.md` 2026-09-19 (02:4xZ).
      **STATUS 02:3xZ 2026-09-19 (b): v146 PART 2 committed `[skip ci]` —
      (f) A1's parser half: a lone footnote letter in column (a) pushed
      the house into the description and the double-render dedup kept
      the doubled name (`JP Morgan JP Morgan Mid Cap Growth Fund N/R`,
      238 plans / 486k ppl); the letter is stripped like `*`, and `N/R`
      joins the trailing-column stripper. Gate green; corpus diff 0/0/0
      (rename-only; `rename-ms` after the run measures it). #380 (v143)
      still in flight. Next wake: verdict #380, mirror, dispatch v144 +
      v145 + v146 in ONE run.
      **STATUS 02:3xZ 2026-09-19: v146 (queue item k, second member)
      gated and committed `[skip ci]` — when both 4i columns wrap with
      the value on the second line, each cell continues the cell above;
      Rush Copley's $109M `Fund Institutional Shares` unfolds into three
      Vanguard funds (11 → 19 rows). Gate green, corpus diff 0/0/0 with 2
      row moves. (k) residue: Avi Systems (ESOP share-count wrap, 1
      plan). #380 (v143) still in flight. Next wake: verdict #380, mirror,
      dispatch v144 + v145 + v146 in ONE run (predictions disjoint:
      fold/tail, duplicates, trust pointers, two-column wraps).
      `docs/accuracy-log.md` 2026-09-19 (02:2xZ v146).
      **STATUS 02:2xZ 2026-09-19: v145 PART 2 committed `[skip ci]` — (k)'s
      largest member: SKIP_ROW's unanchored `transfers?` matched the
      sponsor's own name, so Energy Transfer (16,426 ppl) published its
      master-trust interest as a 77.9% holding named `Trust`; the arm is
      statement phrasing only, Energy Transfer and Sunoco GP now read as
      trust pointers. The same narrowing for `contribution` /
      `distribution` was measured (Exelon, Morgan Stanley statement lines
      leaked) and REVERTED. Gate green (Peterson +2 folded bonds), corpus
      diff: 1 designed loss, 3 row moves. (k) residue 15 plans / ~11k ppl.
      #380 (v143) in flight. Next wake: verdict #380, mirror, dispatch v144
      + v145 (one run; predictions disjoint). `docs/accuracy-log.md`
      2026-09-19 (02:2xZ).
      **STATUS 01:5xZ 2026-09-19: v145 (queue item i) gated and committed
      `[skip ci]` behind v144 — a stem dedup collapses a schedule's two
      renders with wording drift (R&L Carriers 32 → 31 rows, ratio 1.029
      → 0.957; Pamar's ten duplicate target-date rows); 277 lineups /
      488k ppl / $0.68B counted twice store-wide; gate green with Plexsys
      moved on purpose (31 → 30, a glued-digit twin); corpus diff 0/0/0,
      7 row moves read. #380 (v143) still in flight. Dispatch order after
      its verdict: v144, then v145 (or both in one run if the hour is
      tight — their predictions are disjoint: fold/tail vs duplicates).
      Next: (n) class subtotal beside its itemisation (parse-time
      arithmetic, post-selection), (k), (f) C.
      `docs/accuracy-log.md` 2026-09-19 (01:5xZ v145).
      **STATUS 01:4xZ 2026-09-19: draw (seed 20260919) 15/15 real menus;
      Waupaca Foundry's 100-row bond sleeve is v144's class (predict 120
      → ~20); NEW queue item (n): a class subtotal beside its own
      itemisation (Marriott `COMMON STOCKS` $4.41B at 47.5% totals the
      securities listed after it — published sum double counts, honest
      ratio ~0.4); (f) C now 6 plans. #380 (v143) in flight.
      `docs/accuracy-log.md` 2026-09-19 (01:4xZ draw).
      **STATUS 01:5xZ 2026-09-19: #378 (v142) PASSED — pv 142 99.85%,
      +0/−0, HIGH 4, overshoot 356, Hill Brothers 60 rows, caption rows
      gone from 17 plans, 18 EIN rows removed; MIRRORED `3dde8717`
      (`--force` over main's no-op #379, 0/0 measured). **v143 dispatched
      as #380 (01:40Z, in flight).** v144 (queue item l, both halves:
      fold before the cap + untyped securities by name) gated and
      committed `[skip ci]` — Boeing 6,937 positions fold ($19.8B, 27%),
      corpus diff 0/0/0 with 43 row moves read one by one, U.S. Bancorp
      pinned as a NEGATIVE control after a brokerage-heading rule
      swallowed its $11B menu and was withdrawn. Next wake: verdict #380,
      mirror, dispatch v144; morning brief before 11:00Z; then (f) C,
      (k), (i), the AmEx/Jones Walker window-fund ambiguity.
      `docs/accuracy-log.md` 2026-09-19 (01:4xZ, 01:5xZ).
      **STATUS 00:5xZ 2026-09-19: v143 PART 2 (queue item m) folded in
      and committed `[skip ci]` — a readability term decides near-equal
      region contests (Lulus 19 code rows → 23 names; Fusion Medical's
      kerned rendition → clean statement); floored at a fifth of the
      names after it moved HPE within one region; upper bound 295 plans
      / 488k ppl; gate green, corpus diff exactly Lulus 19 → 23, both
      pinned. #378 (v142) still in flight; site-test #80 queued behind
      it. Next: verdict #378, mirror, dispatch v143; then (f) C, (l), (k).
      `docs/accuracy-log.md` 2026-09-19 (00:5xZ).
      **STATUS 00:4xZ 2026-09-19: v143 gated and committed `[skip ci]`
      — a legend-less coded row (`1FXAIX`) is named from the SEC class
      index when its code is a mutual-fund ticker; 2,166 rows / 261
      plans / 270,296 ppl resolve, Children's Hospital Colorado 25 of 29
      rows named on a primary-parse trace; gate green, diff 0/0/0,
      smoke OK, J & S Kidswear pinned. #378 (v142) still in flight —
      verdict, mirror, THEN dispatch v143. Next: (f) C, (m), (l), (k).
      `docs/accuracy-log.md` 2026-09-19 (00:4xZ).
      **STATUS 00:3xZ 2026-09-19: v142 dispatched as #378 (00:20Z, in
      flight; mirror HELD — code ahead of store). (f) A2 CLOSED: 11 of 12
      random names are filed verbatim (platform-branded sub-advised
      products), not a parser defect. Next: the 226 Empower plans whose
      LEGEND was not found (1,348 coded rows), (f) C, (m), (l).
      `docs/accuracy-log.md` 2026-09-19 (00:3xZ).
      **STATUS 00:2xZ 2026-09-19: v142 gated and committed `[skip ci]`
      (despaced caption + cover-page captions; Hill Brothers 38 → 60
      rows, gate green, diff 0/0/0, pinned) — dispatched when #377 lands.
      (f) C two-line colon-less issuer now 5 plans and the next kerned
      item. `docs/accuracy-log.md` 2026-09-19 (00:2xZ).
      **STATUS 00:1xZ 2026-09-19: #376 no-op mirrored (`f25b41c8`), #377
      dispatched 00:09Z; draw 15/15 real, only known shapes (Apple (i),
      PwC doubled house, Parker `( )`, Outrigger plural type prefix (j),
      Amalgamated Transit OCR generic row). Nothing shipped this hour.
      Next parser work at **142**: despaced `HEADER_FRAG_LINE` (Hill
      Brothers' kerned caption row), (m) readable-name tie-break (Lulus,
      Fusion Medical), (f) A2 trustee-before-house. **Owner's four
      questions still open; hold stands.** `docs/accuracy-log.md`
      2026-09-19 (00:1xZ).
      **STATUS 23:3xZ 2026-09-18 (run #374 verdict): v141 is LIVE on main
      (`218641f0`).** Kerned type-label merges gone (Hill Brothers 86% row →
      37 real rows; Nelnet 30 rows + one brokerage fold); +1/−0, HIGH 4.
      Costs recorded: Hill Brothers lost 23 tiny brokerage rows (~2%) and
      gained a KERNED caption row at 17% (v142: despaced `HEADER_FRAG_LINE`);
      Fusion Medical (4,182 ppl) swapped to its kerned region — (m) now 2
      plans. Prediction mis-specified (letter-spaced NAMES rose 20 → 28
      lineups by construction; the merge shape fell to 0). **Display
      de-spacer shipped** (336 rows / 88 lineups, +184 tickers / 0 lost /
      0 flipped, 45/45 fixtures). Draw 23:1xZ 15/15 real (Cargill trustee
      glue (f) A2, Kaleida doubled house, Oshkosh bare `Putnam`). **Owner's
      four questions still open; hold stands.** `docs/accuracy-log.md`
      2026-09-18 (23:3xZ).
      **STATUS 22:3xZ 2026-09-18 (run #373 verdict): v140 is LIVE on main
      (`118e7a24`, Pages #505).** 14,946 coded rows / 680 plans / 603,114
      ppl renamed code → legend name; LEAD residue 2,466 rows (OCR "I"
      mismatches + 226 Empower plans whose legend was not found — next in
      this class); confident +0/−0, HIGH 4, dl 103 (both 403). **v141
      shipped + dispatched:** kerned-font type labels (Nelnet 6 → 30 rows;
      20 lineups mostly letter-spaced) and `fbo <person>` rows folded into
      the brokerage aggregate. Follow-ups: display de-spacer for kerned
      names; (m) Lulus; (f) A2. **Owner's four questions still open; hold
      stands.** `docs/accuracy-log.md` 2026-09-18 (22:2xZ).
      **STATUS 21:3xZ 2026-09-18: #372 no-op mirrored (`a18d4ad9`,
      tkShare 24.03 = the hash-sample step). **v140 shipped**: Empower's
      coded 4i schedule (`1VFIAX`) takes its names from the filing's own
      LEGEND — 742 plans / 709,129 ppl / 14,802 rows published codes and
      resolved 0 tickers; found by the sizer meant to bound (m). Gate
      green, diff 0/0/0, Berger Rental pinned. Dispatched after this
      commit; verdict must show LEAD rows 14,802 → ~2,900 and the exact
      ticker count rising. (m) Lulus stays open (1 plan). **Owner's four
      questions still open; hold stands.** `docs/accuracy-log.md`
      2026-09-18 (21:3xZ).
      **STATUS 21:1xZ 2026-09-18: #371 no-op mirrored (`cbfea546`), #372
      dispatched 21:08Z; site-test #78 success; draw 15/15 real, only
      known shapes plus one new small one — the ® glyph read as "b"
      (`FreedombIndex`, `Fund b b b`), 94 plans / 174,831 ppl / 540 rows,
      recorded under (j). Owner's usage limit reset mid-cycle; loop
      continuous. **Owner's four questions still open; hold stands.**
      `docs/accuracy-log.md` 2026-09-18 (21:1xZ).
      **STATUS 20:2xZ 2026-09-18: #371 dispatched 20:08Z via REST (GitHub
      MCP down since 19:32Z; `GITHUB_TOKEN` + curl work); Pages #500/#501
      built `eb25b24f`/`caa5ac7a` success. Draw 15/15 real. **(f) SIZED:**
      A1 doubled house 239 plans / 486k ppl (display strip SHIPPED, 34/34
      fixtures, 73/0/0 tickers), A2 trustee-before-house 789 / 1.34M
      (parser), B trustee suffix or bare trustee row 1,252 / 3.48M (two
      populations, separate first), C 4 plans. Audit ticker sample now
      keyed on the ack hash (trail steps ~22.8 → ~24.0 once, by design).
      Next parser work at **140**: (m) Lulus tie-break, (f) A2, (l) fold
      before cap. **Owner's four questions still open; hold stands.**
      `docs/accuracy-log.md` 2026-09-18 (20:2xZ).
      **STATUS 19:5xZ 2026-09-18: v139 run #369 PASSED and is LIVE
      (`eb25b24f`, pv 139 at 99.85%, +3/−0, HIGH 4, overshoot 360, aggRow
      56). Whole-store multiset diff: 820 caption-prefix rows / 756 plans
      fixed (480 predicted + the Empower "ISSUER … VALUE" family), 300 junk
      or duplicate rows removed, ONE regression — Lulus Fashion Lounge (22
      rows, full names → 10-char codes on an exact score tie at 0.1047),
      NEW queue item (m). `tkShare` dip is sampling-phase noise (exact
      count +5). `--force` git check over main's no-op `82f3ec0f`. Pages
      build unconfirmed (GitHub MCP down). **Owner asked for specific
      questions; four posed in chat 19:1xZ; hold stands.**
      `docs/accuracy-log.md` 2026-09-18 (run #369 verdict).
      **STATUS 19:1xZ 2026-09-18: v139 run #369 in flight (45 min at the
      wake); mirror HELD (code ahead of store); draw 15/15 real, only the
      (f) issuer-glue shape (Duke University `Fidelity Vanguard Inst Index
      Plus`, Compass `Fidelity TRIM 2030 Trust Company`). Verdict check-in
      armed 19:32Z. **Owner asked for specific questions; four posed in
      chat 19:1xZ (recordkeeper fix, match/vesting coverage, wam spawning,
      fund-facts source); hold stands until answered.**
      `docs/accuracy-log.md` 2026-09-18 (19:1xZ).
      **STATUS 18:2xZ 2026-09-18: #367 and #368 no-ops (mirrored `07c187fb`,
      `6d5411d8`); main's :23 cron missed 17:23; draw 15/15 real, ONE NEW
      CLASS: the 4i caption's wrapped tail glued to a page's first holding
      (Nebraska Medicine's largest fund published as `of Investment Cost
      Value EMPOWER…`) — 478 plans / 409,634 ppl / 480 rows, 440 of them
      `maturity date <fund>`. **v139 shipped** (line-stage caption-only
      lines cleared; v70 row strip names the four leaked shapes), gate
      green, diff 0/0/0 (Mix Talent loses a cover-page address row), pinned;
      display strip for the v138 store shipped (27/27 fixtures, 73/0/0
      tickers — unchanged, the strip is cosmetic for lookup). Dispatched
      after this commit. (f) issuer glue seen again on the same row.
      **Owner's wam question still open; hold stands.**
      `docs/accuracy-log.md` 2026-09-18 (18:1xZ).
      **STATUS 17:1xZ 2026-09-18: #365 no-op (branch `780cbf4b`), main's
      :23 cron #366 committed `7c198bcd` (measured 0/0, byte-identical —
      `--force` git check only), #367 dispatched 17:10Z; draw 15/15 real,
      only known shapes (Old Republic's 31% managed-account fold, a
      value-column caption glued into a GIC name at Teamsters — sized 4
      plans / 170,867 ppl, recorded under (j)). Nothing shipped this hour.
      **Owner's wam question still open; hold stands.**
      `docs/accuracy-log.md` 2026-09-18 (17:1xZ).
      **STATUS 16:1xZ 2026-09-18: #364 no-op (mirrored `ff55a6d1`), #365
      dispatched 16:09Z, site-test #76 green; draw 15/15 real, only known
      shapes (NRECA (h), Apple (i), a same-value `Fixed annuities`
      duplicate at Hospital Español (i)). Nothing shipped this hour. The
      (j) display half is now four strips deep; the remaining (j) work is
      store-side (`Vanguard Treasury` truncation, value fragments in
      names) and goes with the next PARSER_VERSION bump. **Owner's wam
      question still open; hold stands.** `docs/accuracy-log.md`
      2026-09-18 (16:1xZ).
      **STATUS 15:2xZ 2026-09-18: #363 no-op (mirrored `a7380710`), #364
      dispatched 15:12Z, site-test #75 green; draw 15/15 real.** (j)
      display half widened a third time: trailing footnote markers `(1)`
      (560 plans / 1.95M ppl / 7,503 rows — FMR's whole 119-row menu) and
      an OCR column bar repaired to a class `I` (743 / 683k / 1,723 rows);
      flip list GAINED 73 / LOST 0 / FLIPPED 0; 46,480 rows / 5,799
      lineups now cleaned at display. Abbott's section-header glue
      (`Common stock - employer securities ABBOTT …`) into (f). Main's
      hourly cron missed 14:23Z as well as 12:23Z today. **Owner's
      question on wam still unanswered; hold stands.**
      `docs/accuracy-log.md` 2026-09-18 (15:2xZ).
      **STATUS 14:2xZ 2026-09-18: #362 no-op (mirrored `8a31285d`), #363
      dispatched 14:14Z; draw 15/15 real.** (j) display half widened
      again: trailing OCR glyphs (674 plans / 1.08M ppl / 4,454 rows) and
      footnote fragments after a class token (881 / 839k / 6,383 rows)
      stripped in `cleanFiledName`; flip list GAINED 58 / LOST 0 /
      FLIPPED 0. `Vanguard Treasury` truncation seen a third time
      (Mercedes-Benz) — store-side, stays queued. **Owner asked 13:5xZ why
      wam is not running continuously; answered: my usage hold after three
      kills, plus the owner-gated items (match/vesting coverage,
      recordkeeper source, fund-facts source). Awaiting the owner's word;
      the hold stands until then.** `docs/accuracy-log.md` 2026-09-18
      (14:2xZ).
      **STATUS 13:2xZ 2026-09-18: #361 no-op (mirrored `06dde2c9`), #362
      dispatched 13:16Z, site-test #73 green; draw 15/15 real.** (j) gains
      its FRONT variant, shipped at display: the type column glued before
      the name with a separator (`Mutual Fund - Fidelity 500 Index Fund`,
      Texas Health 34,090 ppl) — 733 plans / 1,464,661 ppl / 3,191 rows;
      `TYPE_PREFIX` in `cleanFiledName`, flip list GAINED 53 / LOST 0 /
      FLIPPED 0. New (f)/(j) spelling: a sub-table's column-header words
      welded to a name (IUOE Local 4 `ISSUER INTEREST RATE COST ** VALUE
      MASSMUTUAL STABLE VALUE C`). `docs/accuracy-log.md` 2026-09-18
      (13:2xZ).
      **STATUS 12:3xZ 2026-09-18 (run #359 verdict): v138 is LIVE on main
      (`05a9d93a`).** Confident +0/−0 exactly as predicted; HIGH 4;
      dominant-row 0; 191 lineups at the new 120 cap, 414 entries carry
      `cut`; aggRow 50 → 56 = six small plans whose fold now sees more
      positions (mechanism, under the 60 baseline). **Boeing's page
      positive control PASSED** (local render: "7,551 smaller holdings
      are not shown … about 19% of the plan"); thousands separators added
      to the counts. Main's cron commit byte-identical (`--force` git
      check). #361 dispatched 12:23Z (incremental). Draw 14/15 clean; GM
      is (h). Next parser work goes in at **139**: (l) fold before the
      cap (Boeing's 7,551-row tail) is the largest by people among the
      reachable items. `docs/accuracy-log.md` 2026-09-18 (12:3xZ).
      **STATUS 11:2xZ 2026-09-18: #359 (v138) still in flight, mirror
      held; site-test #72 success; draw 15/15 clean.** Into (i): a filed
      brokerage AGGREGATE beside the parser's brokerage FOLD under one
      header — Apple (145,428 ppl) `[BROKERGE ACCOUNT] Various Accounts`
      7.5% + `Participant brokerage holdings (55 positions)` 6.7%; 6 plans
      / ~169k ppl (State Street 21,533). Sizer: scratchpad
      `brok-double.mjs` (add `BROKERGE` to its regex).
      `docs/accuracy-log.md` 2026-09-18 (11:1xZ).
      **STATUS 10:4xZ 2026-09-18: v138 DISPATCHED — the 80-row DISPLAY CAP.**
      The 10:1xZ draw (JPMorgan at exactly 80 rows) exposed that `parseRows`
      sliced `funds` at 80 while `totalValue` counted every row: confidence
      judged the whole schedule, readers saw a prefix, and the page's
      coverage sentence called the rest "not itemised". Measured on v137:
      386 lineups at the cap; hidden ≥15% of the plan in **12 plans /
      481,363 ppl / $27.6B** (Boeing 217,061 ppl 21% = $15.5B, Goldman
      61%, Marriott 17%, NXP 39%), 5–15% in 26 more / 379,865. v138:
      `ROW_CAP` 120, `cut: {n, v}` recorded at every slice point and on the
      entry, `app.js` discloses "N smaller holdings are not shown … $X —
      about P% of the plan". Gate: Costco/Peterson expectations updated
      (the fold sees 120 rows now); diff 0/0/0, rows up on 59; Boeing
      pinned. **Verdict test: confident and overshoot UNCHANGED; Boeing's
      entry >80 rows with `cut` n=7,551 ≈ $13.95B; then open Boeing's live
      page — the sentence's first positive control is that page.**
      **NEW (l): fold BEFORE capping.** Boeing's 7,551 cut rows and
      Goldman's 875 are per-security floods the `smaKind` fold (~2774)
      would roll into one aggregate row, except the fold runs on the
      capped list. Real fix for the class; v138's disclosure is honest
      meanwhile. Also from the draw: Convergeone-shape split aggregates in
      ≤5-row lineups, ~7 real plans / ~19k ppl (Cape Cod Healthcare 6,814)
      — folded into (h); JPMorgan's `SEP ACCT 2,271,585,2` value fragment
      in a name (j). Main's 09:23 cron commit was byte-identical (mirrored
      `--force` on the git check, data gate +0/−0). #358 (incremental)
      success 10:18Z. `docs/accuracy-log.md` 2026-09-18 (10:2xZ).
      **STATUS 09:3xZ 2026-09-18 (run #355 verdict): v137 is LIVE on main
      (`78ff7aad`, Pages #480).** Confident −2 = two master trusts with a
      92–94% `COMMON/COLLECTIVE TRUSTS` row (designed); HIGH 4; dominant-row
      0; generic-names 128; overshoot 361 unchanged; dl 78 → 99, all 99
      re-probed 403. ATH Holding's refused statement was replaced by its
      2023 filing's REAL 29-row menu via the fallback (94,427 ppl gain);
      Docomo Pacific's fallback published broken-font noise names (476
      ppl, one plan, recorded). `fc67076c` [skip ci]: the fallback
      disclosure now names the true reason the newest filing was passed
      over (text only, next bump). #356 dispatched 09:21Z (incremental).
      **NEW (k) FROM THE 09:2xZ DRAW — a LEADING share-class / vehicle
      fragment as the whole row name: Rush Copley `Fund Institutional
      Shares` $109M at 35%; Energy Transfer LP (16,426 ppl) `Trust` at
      78%, Sunoco GP `Trust` 76% — a wrapped master-trust name as a
      holding, the v105 shape below the 90% floor. Sized: ≥30% of menu 18
      plans / 29,785 ppl / $2.82B; 10–30% 28 / 51,092; <10% 237 / 483,887
      ppl / 278 rows.** Sizer: scratchpad `frag-lead.mjs`. Also: ADP's
      names doubled with a caps twin (27 rows), Walmart `Investments`
      caption glued to its stock row, `Vanguard Fed` truncated (second
      sighting of the shape). `docs/accuracy-log.md` 2026-09-18 (09:2xZ).
      **STATUS 08:1xZ 2026-09-18: #355 (v137) still in flight, mirror
      held; draw 15/15 clean.** Two more (f) issuer-glue specimens: Orlando
      Health `[Unallocated Contracts ^]` (section header + footnote caret
      as issuer), Hathaway Brown `[College Retirement Equities Fund
      variable annuities]` on all 57 rows; Anheuser-Busch `Vanguard
      Treasury` truncated before `Money Market Fund` (a (j) note).
      `docs/accuracy-log.md` 2026-09-18 (08:1xZ).
      **STATUS 07:3xZ 2026-09-18: v137 DISPATCHED** — the 07:12Z draw found
      ATH Holding / Elevance (94,427 ppl, $12.11B) publishing `Collective
      investment trusts` at 91.7%: the v105 dominant-row shape, live,
      because `GENERIC_TYPE_NAME`'s trust arms were singular only. v137
      pluralizes them (2 plans / 94,903 ppl become `stmt` by design — ATH
      is OCR-path, Docomo Pacific is the text-layer pin). **Verdict test:
      ATH `20251010144903NAL0008344193001` non-confident `dx=stmt`,
      confident −2 exactly, `audit-generic-names` 108 → ~132 (measurement:
      24 plans it could not see before, under the 230 threshold),
      overshoot unchanged.** Also from the draw, into (h): NRECA (80,880
      ppl, ratio 1.134) `Common collective trusts (pages 165-166)` 48.6% +
      `Corporate stocks (pages 56-155)` 25.9% — class subtotals carrying
      PAGE REFERENCES, plus bare codes `NJ7B`/`NJ8B`; Nucor `Fidelity
      Investments` $403M bare house row at 4.4%. Queued small:
      `audit-dominant-row.mjs` hand-rolls its own `NOT_FUND` regex instead
      of importing the shipped pair. `docs/accuracy-log.md` 2026-09-18
      (07:1xZ).
      **STATUS 06:0xZ 2026-09-18 (run #353 verdict): v136 is LIVE** —
      Dominion Energy back (16 rows), First American's page names the
      trust (bits 65536+131072), statement lines gone (47 plans / 340,403
      ppl); Citgo the one designed loss. Next parser work goes in at
      **137**. Open, by people: (h) class subtotals 98 plans / 336,152 ppl
      (Morgan Stanley); (i) duplicate rows 262 / 450,981; (j) cosmetic
      strips 1,237 / 4.42M (a display strip in app.js needs no re-parse);
      (f) issuer glue; the remaining 100 plans of (g); Lehigh Valley's
      OCR-path answer (198 ppl, unread). **No agent spawn until the owner's
      usage picture is clearer** — three agents were killed by limits in 24h.
      **STATUS 02:2xZ 2026-09-18 (run #352 verdict): v135 parts 1-2 are
      LIVE** (trust-pointer reading; prose is not a holding — item (g)
      halved: 171 → 100 plans at ≥10%). **NEW TOP ITEM — Dominion Energy
      (18,747 ppl, `20260702105125NAL0012952931001`) REGRESSED under v135:
      16 real rows (`Dominion Energy Common Stock`, `Target Retirement 2030
      Trust Plus` …) → `band-hi`, no lineup**; Lehigh Valley Imaging (212
      ppl, `20260806083440NAL0004256851001`) 12 rows → `few`. Trace both
      with `--vs 789f589e` to find which of parts 1-2 moved them; a rule
      aimed at junk took a real menu, the same shape as First American under
      v133. **First American (17,155)** is now `tp=1` but `dx=stmt`, and the
      plans-index bits 65536/131072 are NOT set (4460), so the page still
      does not say "held in the master trust" — finish part 1's prediction
      (`dx=trust` + bits; check merge-4i's bit logic keys on `dx` or `tp`).
      Item 2 (statement lines, e) and the rest of (g)'s 100 plans remain;
      the killed agent's part-3 draft is in scratchpad `wam5-partial.patch`
      for reference only. Next parser work goes in at **136**.
      **STATUS 20:1xZ:** v134 (part 5) is LIVE, overshoot 390 → 364. A
      wam agent restarted at 20:0xZ on First American + (e) + (g) toward
      v135 after the first attempt was killed by the session usage limit
      mid-edit (edits reset, not adopted — see the #348 verdict entry).
      **STATUS 16:4xZ (run #347 verdict):** wam's five v133 items are DONE
      and live (a-d in the queue above: CUSIP-as-value, managed-account
      fold, degraded swaps, units marker; part 5 fair-value totals runs in
      v134). **NEW TOP ITEM — First American Financial (17,155 ppl,
      `20260701092321NAL0013498049001`) REGRESSED under v133:** its 29-row
      2023 fallback (`Fidelity 500 Index Fund – Institutional`, `Vanguard
      Target 2030 Trust I` …, ratio ~0.9) is gone and the plan publishes
      nothing (`dx=band-lo`, no `fb`). The newest filing's region now scores
      band-lo, which is "readable" enough to block the prior-year fallback
      that served a correct menu. Trace with `--vs b13e5640`; the fix is
      either the fallback firing when the primary's best region is band-lo
      (with the ratio test deciding), or the region not being seeded at all
      there. Control: Producers Rice Mill and the five escapees wam measured
      in part 3 must not move.
      **(g) FROM THE 16:0xZ DRAW — a LOWERCASE-FIRST-WORD row name (a fund
      description's wrapped tail, or a sentence fragment) published as the
      holding: 2,054 plans / 3,249,572 ppl / 2,238 rows; 171 plans /
      315,474 ppl where the junk carries >= 10% of the menu.** Headline
      specimens: **BJC Health System (43,409 ppl) is 100% junk** — `for
      benefits` 84.4% + `assets available for benefits` 15.0%, confident,
      published, under the 90% dominant-row bar; Board of Trustees of the
      Deferred Comp plan (33,824) 82% `investment contracts, at fair value`;
      **National Medical Care (72,950, traced)** 33% — `the S&P 500® Index
      by investing in stocks that make up the index.` $755M is the LAST LINE
      of the option's description carrying the value, and the region runs
      on into `NET ADDITIONS` $402M. Fix: reattach a lowercase-start row to
      the nearest preceding capitalized name line in the block (the v130
      rule extended from names to descriptions) or drop it and re-judge the
      ratio; ship with (e). Controls: Publix `Common stock of Publix Super
      Markets, Inc.` (72%, real) and G&A `VITSX - Vanguard Total Stock
      Market Index In` must not move. Sizer: scratchpad `prose-name.mjs`.
      `docs/accuracy-log.md` 2026-09-17 (16:0xZ draw).

      **SHIPPED FROM THIS ITEM, v130 (2026-09-17, committed `[skip ci]`, NOT
      yet parsed — it is a fabrication repair, not new coverage): a wrapped
      line is now attributed to the COLUMN IT SITS UNDER.** WALMART's
      `Lendable Fund` $3,547,236,088 is gone and its three BlackRock funds are
      named (39 -> 41 rows, ratio unchanged 0.954); Owens Corning's twelve
      Fidelity Freedom Blend vintages come out of `Fund, Class S` (15 -> 25
      rows on both plans); Intermountain's `Trust` / `Class` / `Trust Class D`
      / `Institutional Class` ($1.35B of $6.83B) resolve to real funds; and the
      LOAN-ROW class partly goes with it (Ramos, Google `to August 2035`
      $120.9M, Amazon, Lumentum, Beyond Finance) because `classify()` now sees
      the row reunited. Uniform random draw of PUBLISHED lineups: **21 of 229
      change (9.2%), 0 lose confidence**; counted floor **37 plans / 4,900,191
      participants**; projection ~5,500 plans, stated as a projection. Gate
      green (Ramos expectation moved 27 -> 26 on purpose, reason beside it),
      `diff-lineups` FABRICATED INTRODUCED 0, one justified CONFIDENCE LOST
      (Pacific Maritime, a fair-value note published as four asset-class
      labels; its real 4i pages are blank in the public copy).
      **`overshoot` will NOT fall from this — a merge never changed the sum**,
      which is exactly why no arithmetic guard ever saw the class; it must not
      RISE either. `docs/accuracy-log.md` 2026-09-17 (v130).
      **AND v131 (2026-09-17, `[skip ci]`, not yet parsed): the LOAN-ROW class,
      which is the largest half of this item by people.** The v70 guard is
      anchored at the start of the name and the population is not — **7,052
      rows / 6,970 PUBLISHED plans / 12,750,205 participants / $9.60B**, read
      whole from the store with the exported `isLoanNoteName` (the recorded
      283 plans / 534,790 ppl was an undercount by a factor of 24). Haddad
      published a rate sentence at 96.5% of its plan and now shows its ten real
      Vanguard funds (11 rows -> 21 at 0.961). Random draw: 21 of 229 published
      plans change, 0 lose confidence. Four gate expectations moved one row
      each, all loan rows, quoted in place. `docs/accuracy-log.md` 2026-09-17
      (v131). **Verdict test: re-run `isLoanNoteName` over the new store — the
      7,052 must be near zero.**

      **AND v132 (2026-09-17, `[skip ci]`, not yet parsed): the two sub-classes
      above, both closed, and the "roster" half was NOT what the queue said.**
      (a) **A SCHEDULE C page read as the menu.** Delta is not a roster:
      `WAMPO_TRACE=cands` shows the 4i region running past a ONE-ROW 4i table
      into page after page of `SCHEDULE C SUPPLEMENTAL REPORT / PART I, LINE 3
      - INFORMATION ON SERVICE PROVIDERS`, whose provider column parsed as
      holdings and whose EIN/ADDRESS column parsed as dollars — `782,514,321`
      is Fidelity Institutional Operations Company's ZIP+4, published four
      times over on each Delta plan. A 4i region now ends at another statutory
      schedule's caption. **Counted: 7 plans / 243,036 participants** (store-side floor over the
      whole universe: 20 published plans / 228,813 ppl), both
      Delta plans stop publishing (correct — master trust), **Allina Health
      37,552 gains its real 22-fund menu** (a $1.35B phantom at 50.3% gone),
      Duke Energy 35,803 loses a $2.90B phantom at 78.5%, HP/Carroll/Children's
      lose address and provider rows. Control: **735 corpus filings carry a
      line the stop matches and exactly 7 parse differently.**
      (b) **The bare house-name merge.** 133 published plans / 83,051 ppl whose
      largest row is a bare house name (shipped `isHouseName`, now exported;
      48 plans at >=90% of the menu, 85 at 50-90%); **all 133 re-parsed both
      ways: 100 change, 65,218 participants, 12 GAIN confidence, 0 lose.**
      Bell Nursery 3 rows -> 21 at ratio 1.000, Northeast Georgia Health System
      (14,317) resolves `Vanguard` $301.8M and `Dodge & Cox` $39.1M into eleven
      named funds, Ataraxis Peo 2 aggregate rows -> 30. Gate green with NO
      expectation moved. **Three self-inflicted defects were caught by
      re-measuring after each change and each is now a control**: Producers
      Rice's source-split page beating its auditor schedule (`isSourceSplit`),
      a -0.35 draft of that demotion destroying Hospice of Muskegon's 38-fund
      menu (now a POST-selection swap), and the repair itself MERGING
      `Pioneer Fundamental Growth A` + `Victory S&P 500 A` into one `Victory`
      row at Hoosier Motor Club (now a house-share score term counting
      `PROVIDER_TOTAL_RE` only, after an `isHouseName` draft cost RCB Bank its
      menu; plus v112's generic-top-row swap extended past its 4-row cap after
      that term promoted `Registered investment companies` at 79% on Northeast
      Georgia). Uniform draw of 200 published lineups from the shipped v131
      store: **5 change (2.5%), 0 lose confidence, 1 gains.** Corpus (939
      filings): 16 gained, 1 lost (Delta PN 014), FABRICATED INTRODUCED 1 —
      Progressive Tractor, 2 rows before and after, below the 3-row floor, and
      its published lineup comes from a fallback ack that parses identically.
      `docs/accuracy-log.md` 2026-09-17 (v132 parts 1 and 2).
      **Verdict tests:** `confident` flat to slightly up; `overshoot` should
      FALL a little (unlike v130/v131 this one does change sums); re-run the
      house-name sizer — the 49 plans at >=90% must be near zero.
      **UPMC is CLOSED and was already closed by v128** — both plans publish no
      plan-level lineup, `trustLineup` bit 2048 is set, and their trust has a
      confident 27-row Vanguard/JPM menu: 205,732 readers already see it. The
      genuine roster residue is ~2 plans / ~1,500 ppl (Unique Staff Leasing
      906, Triple J Enterprises 558) and is NOT worth a guard — a roster test
      collides with employer stock and brokerage rows.

      Still open in this item and verified UNCHANGED by v130/v131/v132: the
      code-column class, DocuSign watermarks, and the 446 overshoots.
      **NEW, found while working v132 and sized, not fixed: 20 confident
      MASTER-TRUST lineups are published to 35 member plans / 934,060
      participants with a non-fund largest row** — HCA's trust (379,101 ppl)
      leads with `CUSIP:` at 27%, Verizon's (146,572) with `COMMON/COLLECTIVE
      TRUST` at 42% — and that is a FLOOR, because the Delta DC master trust
      publishes `------------------- VALUE OF INTEREST IN` at $21.06B = 72.3%
      and matches neither `NOT_FUND_SHAPED` nor `AGG_DISCLOSURE` (leading
      dashes defeat the anchor). **Every sizing script here joins lineups to
      plans-all by ack, and a trust ack is not a plan, so trust lineups have
      been invisible to all of them.** Also: Delta PN 004's Schedule D link
      points at the DELTA PILOTS MEDICAL TRUST while its notes name the DC
      master trust we already hold confidently — 112,713 participants will see
      no menu although the right one is in the store (trust-selection defect,
      not a parser one).

      **The design note this bump should carry, from UPMC:** a ratio near 1.0
      is evidence for a menu only among tables that are CANDIDATE menus. Any
      table that apportions the plan — an employer roster, a fair-value
      hierarchy note, a statement of net assets — scores 1.0 for free, and
      three of the five largest fabrication classes on record are
      apportionment tables. The guard meant to reject fabrications SELECTED
      one here.
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
