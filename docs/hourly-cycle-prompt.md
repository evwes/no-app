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
      **STATUS 07:3xZ 2026-09-21. IN FLIGHT: #421 (v177), dispatched 07:25Z,
      start verified. LIVE ON MAIN: the v176 store.**
      **FIRST ACTION NEXT CYCLE: #421's verdict against its FOUR
      pre-registered tests**, then `store-diff`, then mirror.
      **v177 is one arm on one regex and its entry is mostly about a reasoning
      error.** I deferred this fix three days ago saying the `NOT_FUND_SHAPED`
      arm is SHARED with `AGG_DISCLOSURE`, citing v137. **They are independent
      literals** — neither derived from the other, editing one cannot affect
      the other, checked in one command. v137's danger was real but specific to
      `GENERIC_TYPE_ANY`, which IS derived from `GENERIC_TYPE_NAME.source`.
      **A cited precedent is not a finished argument**, and a live fabrication
      stayed on a page three days longer for it.
      Sized whole-store before the edit: of **1,720,394 published rows the new
      arm matches EXACTLY ONE** — Pechanga's `Net position available for
      benefits`, $189,711,769 = 63.7% of a 14-row menu, 4,520 ppl. Gate green;
      corpus diff 1,004 filings all zeros.
      **LOCAL VERIFICATION WAS IMPOSSIBLE and the run is the verification.**
      Pechanga's entry is a 2023 prior-year fallback, so `trace-filing` returns
      NOT FOUND (it parses the newest filing) and the plan is not in the
      corpus. Pre-registered: (1) the row is gone; (2) 14 rows → 13; (3) ratio
      1.327 → ~0.48, and **if it instead drops below the 0.45 floor and stops
      publishing that is the BETTER outcome, not a failure**; (4)
      generic-names and dominant-row must not move by more than one.
      **ALSO THE FIRST RUN THAT CAN VERIFY THE AUDIT-REPORTING FIX** — #418
      could not, because a quiet run has no triage findings and both orderings
      print identical numbers. Check: printed `== HIGH (n)` / `== WARN (n)`
      must equal the coverage line's `high` / `warn`, and `== READ BEFORE
      MIRRORING` must name any flagged plans.
      **STATE OF THE RESIDUALS: every number re-derived against v176 and both
      unknowns closed.** 1,354 live plans. `trust` 44 → 48 is reclassification
      (Conagra, `rw:1`); the 403 residue re-probed WHOLE at **104/104**; `few`
      re-tested — name quality 13% → 33% but reachable-and-material is 2 of 30
      (~7%), all behind a three-row floor this file has twice declined to lower.
      **QUEUE:** (1) #421 verdict → mirror; (2) SDBA fold, 269 plans / 630,032
      ppl, owner question 5; (3) type-then-firm issuers, ~22 rows / ~11k ppl,
      recorded and judged too small for a bump of its own.
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
