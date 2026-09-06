# Hourly cycle prompt

**The durable scheduler EXISTS as of 2026-09-06.** MCP Routine
`trig_01XBJTunkpj2T8bLKHzdsKsA` ("wampo hourly cycle", cron `7 * * * *`) fires
a FRESH session every hour with a push notification on completion. It survives
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

**Routine-fired sessions have NO MCP connector tools** (no `mcp__github__*`) —
the trigger stores no connectors. Everything below has a git-only fallback:
run state is read from commits, and a run is started by pushing, not by API.

---

wampo hourly cycle. Work, report, continue — never delay finished work for a clock. Repo evwes/no-app, dev branch claude/wampo-401k-live-nx1t4o.

Read CLAUDE.md first — especially "The gap method (2026-09-03)" and "Current state (2026-09-03)". Do not rediscover what is written there.

FIRST: if `mcp__Claude_Code_Remote__list_triggers` is available, confirm the Routine trig_01XBJTunkpj2T8bLKHzdsKsA is enabled and its last_run SUCCEEDED; if the tool is unavailable (Routine-fired sessions carry no MCP connectors) skip this check — you ARE the Routine firing. Do not create CronCreate jobs unless the Routine is confirmed gone.

SERIALISATION: pushing scripts/build-data.mjs, fetch-4i.mjs, lib-4i.mjs, merge-4i.mjs, scripts/.kick or the workflow while a run is in flight CANCELS it — use [skip ci]. Actions minutes are free (measured). GitHub cron start times are fiction (4-8h late, measured) — dispatch with workflow_dispatch. The daily schedule commits data straight to MAIN, so check `git log origin/main --not origin/<branch>` and bring its commit into the branch (usually a plain fast-forward) BEFORE any mirror; mirror ONLY via `bash scripts/mirror.sh`.

Order of business:
1. RUN IN FLIGHT? (Without MCP tools, infer from git: an "Update filed plan data" commit or a .kick push on either ref in the last 90 minutes means assume one is.) Non-pipeline work only; pipeline commits [skip ci]. When you cannot rule a run out, EVERY commit is [skip ci] and kicks are limited to one per cycle.
2. NO RUN AND A GATED CHANGE UNSHIPPED? Dispatch build-data.yml on the DEV branch (via mcp__github__actions_run_trigger when available; WITHOUT MCP tools, push a commit whose only change is `date > scripts/.kick` — the documented kick, and the push event is the dispatch). Verify it started when you can query runs; without MCP, the data commit arriving on the branch within ~2h is the observable.
3. RUN JUST FINISHED? Verdict: pv distribution (one dominant pv, small tail); coverage line in docs/coverage-history.jsonl; `node scripts/diff-lineups.mjs <prev-ref>` (every CONFIDENCE LOST must be a justified fabrication, FABRICATED INTRODUCED must be 0); `node scripts/audit-generic-names.mjs` (baseline 208/threshold 230) and `node scripts/audit-dominant-row.mjs` (fabricated class is CLOSED at 0 — any nonzero is a regression, stop and diagnose); then mirror via scripts/mirror.sh.
4. OTHERWISE take the next queue item and FINISH it. Queue, from the EXACT census (`node scripts/gap-census.mjs`, powered by dx since v106 — pull acks straight from dx, no sampling):
   - A-noregion: 1,099 plans, 678,195 participants. Headings fire, nothing scores as a table. UNDIAGNOSED at document level — size it first with scripts/gap-verify.mjs (upgraded ladder) before any parser work.
   - A-band-hi: 270 plans, 684,737 participants, $33.1B. Largest: Compass Group USA (312,914 participants, $2.5B), then UPS ($14.2B). Ratios ~1.9-3.9 = something counted twice; trace with WAMPO_TRACE=cands via scripts/trace-filing.mjs.
   - A-stmt: 326 plans incl. State Farm 20251010104106NAL0007965633001 (real 55-fund menu loses region scoring to a Statement of Net Assets page).
   - A-few (660) and A-band-lo (57): size before fixing.
   - The 319 dominated-but-fund-shaped lineups ($34.6B): confirm honest single-holding plans, not a sixth merge cause.
   - Frontend: plans whose lineup was withdrawn as a filed AGGREGATE (Comcast, MetLife, Albertsons class) now show no lineup — the page should say the filing reports investments in aggregate rather than showing a bare gap. Same for "schedule explicitly omitted" (STS class).
   - Recordkeeper missing: 4,568 plans, 2.19M participants.
   NOT worth parser work, all MEASURED: A-nohead (5,966 plans — 50/50 sample: 56% no attachment, 36% attachment without schedule, 6% explicitly omitted, ~0 fixable); features-missing-though-lineup-parsed (~7% ours); the fabricated-lineup class (v100-v105, CLOSED at 0, audits hold it).

Accuracy protocol: SIZE before fixing, RE-SIZE after (v101 was projected at 65%, delivered 2.5% in-bucket). INSTRUMENT before believing a cause — `WAMPO_TRACE=rows|cands node scripts/trace-filing.mjs <ack>` prints the parser's working. A measuring script is code and earns the same suspicion (size-features.mjs reported 30% where the truth was 7%; gap-verify's table detector fired on Statements of Changes until it required rows that NAME PRODUCTS). Prove a new guard FIRES with a negative control. Read stores through scripts/lib-schema.mjs. Parser changes: parser-gate green + a specimen + a decoy + an entry in docs/defect-specimens.json. Frontend changes: smoke-test.mjs AND map-test.mjs, bump ?v= stamps together. Log every accuracy defect permanently in docs/accuracy-log.md.

Before 7:00 AM Eastern, docs/morning-brief.md current and committed — decision-shaped, HELD-and-why first.

If there is genuinely nothing to do, say so briefly and stop. Do not invent work. No model identifier in commits, PR bodies, or code comments.
