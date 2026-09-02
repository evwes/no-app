# Process review — 2026-09-02

Written in response to: *"review your processes. there is a large gap in
efficiency and your operations that need fixed/improved immediately."*

Not a status report. Each finding is a thing that went wrong more than once,
with the evidence, and what now stops it. Where the fix is a rule rather than a
mechanism, that is stated plainly — rules are the weak kind and I have already
broken several of mine.

---

## 1. The 18-hour gap. What actually causes it.

**The complaint:** *"why has nothing been done in 18 hrs? no additional parses,
nothing."*

**The honest answer:** I do not run between your messages. There is no process
of mine that ticks while you are away. Everything that happens unattended
happens because something *else* — GitHub, or a scheduler — starts it. So the
question "why was nothing done" is really "why did the unattended layer not
cover it," and there the answer is specific:

| Layer | Durability | Status |
|---|---|---|
| `build-data.yml` schedule | survives everything | **working** — run #194 fired unattended |
| Hourly agent cycle (`CronCreate`) | in-memory, dies with the container | **died 4×** — dead again at the start of this session |
| MCP Routine (`create_trigger`) | durable, the actual fix | **refused 7×** — "requires approval" |

The pipeline layer did its job overnight. The judgement layer — reading a
filing to decide whether a label is *true*, which is what caught the wrong
answers on runs #186 and #188 that every count-based check passed — has no
durable home. `CronCreate` is a workaround that has now failed four times for
the same reason each time.

**Changed today:** `.claude/hooks/session-start.sh` now prints the operating
state into every new session before it acts — whether main is ahead, whether
commits are unpushed, and an explicit instruction to run `CronList` and
re-create the job. Hook output is the only channel that reaches a session
*before* it does anything, so this is the one place a restart cannot erase.
The cron is restored (`535ef6c4`).

**Still needs you, and it is the highest-value thing on this list:** approve
the MCP Routine, *or* add an API key as a repo secret so a GitHub Action can
run the judgement cycle. Either makes the hourly cadence survive restarts. Until
then it will keep dying, and I will keep finding it dead.

## 2. The nightly window is not the window. (New — measured today.)

`build-data.yml` is scheduled `12 5 * * *` — 1:12 AM ET, chosen to put heavy
work inside the 1–7 AM window you asked for. Measured against when GitHub
actually started those runs:

```
run #194  cron 05:12Z  ->  fired 09:31Z   late by 4h20m   (landed 5:31 AM ET)
run #185  cron 05:12Z  ->  fired 13:18Z   late by 8h06m   (landed 9:18 AM ET)
```

GitHub does not honour scheduled start times on free public runners, and the
lateness is not a constant you can subtract — it ranged from 4 to 8 hours
across two samples. So the nightly sweep has been landing at the *end* of your
window or well past it, and the 7 AM brief has been written against results
that sometimes did not exist yet. Nothing in the logs would have shown this;
the runs all say "success."

**The fix is to stop relying on the schedule for timing.** `workflow_dispatch`
starts within seconds. The hourly cycle should dispatch the sweep itself when
it sees the window open and no run in flight; the GitHub schedule stays as the
backstop that runs when no session exists, and its *stated* time is now
documented as fiction. Recorded in `CLAUDE.md` and the hourly prompt.

## 3. Three wrong numbers from three guessed field names.

All in one working session, all the same shape — type a plausible field name,
get `undefined`, publish the number:

- `plan.provider` (the field is `recordkeeper`) — every plan read as missing a
  recordkeeper. The gap list inflated from 611 plans to 15,024 and led with
  Microsoft, Boeing, Bank of America and IBM.
- `trust.confident` — `mtias.json` trust objects carry only `ack, name,
  planYear, assetsEOY`. Confidence lives in `lineups-status.json`. **$826.5B**
  filed under the wrong heading.
- The plan's `assetsEOY` handed to a harness parsing the *trust* — right field,
  wrong record. `parse4i` returned `found=false` and three "experiments"
  measured nothing at all.

Every one was caught by a smell — a bucket that should not have been empty, a
population too uniform to be real — and not one by the code objecting. That is
the same failure the whole site exists to avoid: an absence that is really a
typo, presented as a fact.

**Changed today:** `scripts/lib-schema.mjs`. Field names are checked against
each store's own header; an unknown name throws and names the real fields. All
three historical bugs are its self-test (`node scripts/lib-schema.mjs
--selftest`), and `gap-list.mjs` / `gap-report.mjs` — the scripts that produced
the bad lists — now read through it. Output verified identical.

**The rule that generalises:** a number that comes out suspiciously round,
uniform, or exactly zero is reporting on the query, not on the data. Check the
query first, every time.

## 4. Mirroring destroyed a data commit and got away with it.

I ran the main-ahead check, it printed `3a42d77`, and I force-pushed over it
anyway — because I followed the check with an unconditional `echo "(nothing
above = main has nothing the branch lacks)"` and read my own reassurance
instead of the output. Nothing was lost only because the scheduled run had
found no new filings that night. That is luck, not process. Separately, on
another mirror a commit was still unpushed and only a stop-hook caught it.

**Changed:** `scripts/mirror.sh` refuses both cases — main ahead, and local
disagreeing with origin — prints exactly what would be destroyed, and exits
non-zero. `--force` exists and requires a deliberate decision. Both refusals
verified with negative controls. **The hand-rolled `git push
--force-with-lease` is retired**; the hourly prompt now names the script.

## 5. Reading one filing before sizing its class.

The Medtronic column-layout investigation consumed a large share of a session
before the class was measured. When the US Foods heading defect was finally
sized *first*, it recovered **0** of the 30 target filings — a fix worth
writing, but not worth the day it would have cost if I had started by reading
the document.

**The rule, now in the hourly prompt:** size the class in rows and dollars
before opening a filing. The measurement script is usually ten lines, and it
either points at the deep dive or cancels it.

## 6. Shell quoting, repeatedly.

Backticks and parentheses inside heredocs and `node -e` triggered command
substitution: two commit messages were mangled and one report script broke
mid-run. My own recorded rule is to write scripts to a file. I violated it
repeatedly, in the same session in which I wrote it down. No mechanism fixes
this; it is discipline, and it is recorded here because a rule broken four
times deserves to be visible rather than restated quietly.

---

## What I am not fixing, and why

- **The 3,700 filings that OCR to nothing** on every re-parse — a real waste,
  but the cost it imposes is runner time, which is free here (measured:
  `billable.UBUNTU.total_ms = 0`). It is queued behind work that affects
  correctness.
- **Polling for run completion** — already forbidden and already cheap to obey.
  Dispatch, verify it started, move on.

## Waiting on you

1. **Approve the MCP Routine, or add an API key secret.** This is the whole of
   finding 1 and the reason the environment goes quiet.
2. **Point GitHub Pages at `main`** (Settings → Pages).
3. **Custom domain DNS.**
