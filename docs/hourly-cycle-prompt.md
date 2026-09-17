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
