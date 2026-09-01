# Hourly cycle prompt

**Why this file exists.** The hourly agent cadence runs as a `CronCreate` job,
which is **session-scoped**: it lives in memory, is never written to disk, and
**dies whenever the container restarts** — which happened at 08:40 ET on
2026-09-01, roughly two hours after it was created. Re-typing the prompt from
memory each time would let it drift, so it lives here.

**Any session that finds no hourly job must re-create it.** Check with
`CronList`. If it returns "No scheduled jobs", create one with `CronCreate`
using `cron: "7 * * * *"`, `recurring: true`, and the prompt below verbatim.

This is a workaround, not a fix. The durable options are the MCP Routine
(`create_trigger`, still returning "requires approval") and the daily GitHub
Actions schedule in `build-data.yml`, which survives everything but can only run
the pipeline — not the judgement work (reading a filing to decide whether a
label is true).

---

wampo hourly cycle. Work, report, continue — never delay finished work for a clock. Repo evwes/no-app, dev branch claude/wampo-401k-live-nx1t4o.

Read CLAUDE.md and docs/cadence-state.json first — the rules, the queue, and what earlier cycles learned. Do not rediscover what is written there.

FIRST: run `CronList`. If it reports no scheduled jobs, the container restarted and killed the hourly cadence — re-create it from docs/hourly-cycle-prompt.md before anything else.

THE ONLY SERIALISATION CONSTRAINT: pushing to scripts/build-data.mjs, fetch-4i.mjs, lib-4i.mjs, merge-4i.mjs, scripts/.kick or .github/workflows/build-data.yml while a build-data run is in flight CANCELS it. Not about cost — Actions minutes are free here (measured: run #186, 15 jobs, billable_ms 0, public repo). A full PARSER_VERSION re-parse costs only ~75 minutes because the OCR cache holds; only an OCR_VERSION bump is expensive.

Decide what this hour is for, in order:
1. RUN IN FLIGHT? Don't push pipeline scripts, don't poll in a loop. Do non-pipeline work (frontend with smoke+map tests, fund-er.js research, filing review, sizing, docs). Commit pipeline work with [skip ci] so it lands without cancelling the run. If a run just finished, go to 3.
2. NO RUN, AND A GATED PIPELINE CHANGE IS UNSHIPPED? Dispatch build-data.yml on the DEV BRANCH (never main — GitHub cron only runs on the default branch and would commit data straight to main). VERIFY it started within a minute, then move on — don't wait.
3. VERDICT: (a) any shard stop on TIME_BUDGET_MIN? then PARTIAL — no verdict, no mirror, re-kick. Confirm one dominant pv plus a ~23-row tail. (b) merge log tail: verdict, confidence diff, HIGH findings, coverage line. (c) triage losses by CAUSE — the supersession filter is live, so surviving findings should be few and real; thousands reappearing means that filter regressed. (d) RUN THE LABEL DIFF BEFORE MIRRORING and READ every changed label against its FILING — this caught wrong answers on runs #186 and #188 that every count-based check passed. (e) map-points.json: universe == plans-all rows, ~99% placement. (f) fetch origin main, check for data-bot commits main has that the dev branch lacks (the daily 05:12 UTC schedule commits to main, so this is now a DAILY necessity), prove superset, then mirror with git push --force-with-lease=main origin claude/wampo-401k-live-nx1t4o:main. Hold and say why if anything regressed.
4. OTHERWISE take the NEXT queue item from docs/cadence-state.json and FINISH it. Record which one you took. Queue: the prior-year fallback that cost 250 plans their lineups (Garmin 20260727072454NAL0014832323002, Zimmer Biomet 20260813104222NAL0011201873001); ~$15B of non-Retirement T. Rowe trusts still priced as their mutual funds (needs researched CIT fees — NEVER invent a number); the 3,700 filings that OCR to nothing on every re-parse.

Accuracy protocol: SIZE a class before fixing it, in rows and dollars. Verify against the FILING, not the stored quote. Parser changes keep `node scripts/parser-gate.mjs` green and add a specimen plus decoy controls that must NOT change. Frontend changes pass smoke-test.mjs AND map-test.mjs, and bump the ?v= stamps in index.html and about.html together. Prove a new guard fires with a negative control. Log every accuracy defect permanently in docs/accuracy-log.md. Update docs/cadence-state.json.

Before 7:00 AM Eastern, make sure docs/morning-brief.md is current and committed — decision-shaped, with what was HELD and why as the most important line.

If there is genuinely nothing to do, say so briefly and stop. Do not invent work. No model identifier in commits, PR bodies, or code comments.
