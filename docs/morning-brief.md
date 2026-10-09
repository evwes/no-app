# wampo brief — 2026-10-09, 07:0xZ

Overwritten nightly. Decision-shaped: what shipped and what it changed in
numbers, what was found wrong, what is in flight, what is waiting on the owner.

## The headline is a near miss, and the gate is what caught it

**Run #604 — the v203 full re-parse — downloaded 68,865 filings, read ZERO of
them, and reported 99.7% coverage.** prep succeeded, all twenty parse shards
succeeded in normal wall clock, and the completeness line said *"0.07% download
failures"*. The only instrument that saw it was the merge job's publish gate:

```
confident -60033, match -43211, vesting -52994, lineups -59684  ⚠ REGRESSED
```

**Nothing was committed and no reader ever saw a wrong number.** But the run
cost 4h20m of wall clock and an hour of wrongly suspecting v203, which is
innocent — `trace-filing` parses Amgen under v203 at 33 rows / ratio 0.995 /
CONFIDENT.

**The cause was one missing line.** Both apt steps ran
`apt-get install -y -q poppler-utils tesseract-ocr >/dev/null 2>&1 || true`
with **no `apt-get update`**. `apt-get install` is atomic, so prep (one package)
succeeded while parse (two) installed **neither** — `pdftotext` was absent on
every shard. The redirect ate the reason, `|| true` ate the exit code, and the
only trace in the log named the *OCR* binaries, because the OCR probe was the
only toolchain check anyone had written.

**Two instruments were also wrong and are also fixed:** `fetch-4i`'s `pdftotext`
branch was the only error path that destroyed a stored entry and incremented no
counter (the shard tally read `download=5` while 3,448 filings were wiped), and
`audit-data`'s completeness line knew two `e` codes where the store carried
three.

## What shipped

| | |
|---|---|
| **`29b04aca`** — pushed, `[skip ci]` | `apt-get update`, un-redirected install, no `\|\| true`, and a version probe of every binary each job calls. A missing toolchain now fails the job in its first 30 seconds. |
| same commit | the missing `failCounts["pdftotext"]`, so a destroyed entry is countable |
| same commit | `extraction-failures` as a HIGH at **0.1%** — deliberately a tenth of the download threshold, because a 403 **preserves** the stored entry and an extraction failure **destroys** it |
| **`09982a6c`** (earlier, mirrored) | the accelerated-vesting exception note: **59 plans / 51,205 ppl** on the report, 5 crawlable pages, display-only |
| **`6ce9946e`** | `send_later` removed from the cycle skill — it was the source of the permission dialog the owner was shown |

**Both controls on the new HIGH were run**, because a check that prints 0 on a
quiet store has not been tested: negative — healthy store reads `0 UNREADABLE
(0.00%)`, HIGH stays at the baseline 4; positive — in a detached worktree with
99.74% of acks marked `e:"pdftotext"` to replay #604 exactly, the flag **FIRES**
and HIGH goes to 5.

## In flight

**#605, dispatched 06:56Z on `29b04aca`** — v203 again, now with a toolchain
that cannot fail silently. Pre-registered, unchanged from #604's registration:
`vesting` **falls 82–94** (the fall *is* the improvement, inside the −150
tolerance), `vestQuote` **rises by the same** 5,281 → 5,363–5,375, **exactly
123** labels stop saying `Immediate`, 29–41 gain the real schedule from the same
filing, WITHHELD stays 32, **0 quotes lost**, `pv` 202 → 203 at ~99.9%. Anything
else moving on the coverage line is the thing to investigate.

**A background agent is wiring the SEC asserted tickers** and still holds
`scripts/match-sec-tickers.mjs`, `scripts/gen-sec-tickers.mjs` and
`sec-tickers.js`. Not committed, not shipped.

## Two published figures of mine were wrong and are corrected in CLAUDE.md

- **The SEC asserted-half size: 9,189,637 ppl, published four times, wrong by
  43%.** Re-measured through the tracked `apppath` harness with the serving
  condition and the publish gate applied: **20,332 rows / 5,296 plans /
  6,436,341 ppl.** The original screen asked the resolvers of every *stored*
  row. *A measurement of what a page publishes must apply every condition the
  page applies, in order* — the fifth instance on this record, and this time it
  cost the headline of the only half of the item I had called shippable.
- **"Nothing a reader sees consumes the SEC file" — false.** `merge-4i` already
  writes `ftk` on 2,823 rows and `lookupTicker` reads it **first**. This
  inverted the safety argument: a merge-time write can take a correct symbol
  AWAY, where a render-time fallback cannot.

## Held, and why

- **No mirror.** The branch carries `PARSER_VERSION` 203 above a store at 202,
  so code and data disagree until #605 merges. `mirror.sh` is the only path and
  it will be run after the verdict.
- **No second dispatch.** One re-parse in flight at a time.

## Waiting on the owner

Unchanged from yesterday, and all of it moves millions of published cells: the
share-class symbol/fee population (5,929 rows / 11.1M ppl, errs both ways), our
own store contradicting our own page (5,692 rows / 8.2M ppl, one-directional on
every row read), the fee pre-emption (40,229 rows / 13.3M ppl), stable-value
fabricated ERs (4,669 rows / 7.4M ppl), the American Funds no-share-class fee
(10.5M ppl), and the **comparable** half of the SEC wiring — 224,201 new
asterisked approximations on pages read by 59.3M people, which is a decision
about how much hedged content the page should carry, not a cleanup.

**One thing the owner can fix in one click:** the permission dialogs come from
the session's mode dropdown being on *Accept edits*. **Auto** runs non-file
tool calls unattended. No session can set that for itself.

## Continues today

#605's verdict and loss triage, then mirror; the SEC agent's asserted half,
sized through the tracked harness with gains, swaps and losses kept apart; the
hourly participant-weighted draw; and `trace-filing.mjs --vs`, which is broken
(it copies `lib-4i.mjs` to a temp dir without `lib-quote.mjs`, so every v201–v203
comparison throws `ERR_MODULE_NOT_FOUND` — the fix must pull `lib-quote` from
the same ref, since all three versions turn on its guards).
