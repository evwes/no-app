---
name: fund-facts
description: Get verified ticker, expense ratio and year-to-date return for one or more funds, each with a source and an as-of date, written to data/fund-facts.json by the fund-facts agent. Use on `/fund-facts <tickers | filed fund names | plan ack>`, on "what does this fund cost / return this year", or on "refresh the returns". Never guesses; a fund that cannot be verified is reported, not filled in.
---

# fund-facts — ticker, expense ratio, YTD return, with receipts

`/fund-facts <what>` where `<what>` is one of:

- a list of tickers: `/fund-facts VFIAX FXAIX VTTHX`
- a list of filed holding names (as they appear on a plan page)
- a plan ack (`20251007125615NAL0004795969001`): every published row of that
  lineup is resolved and looked up
- `refresh`: every entry in `data/fund-facts.json` whose `ytdAsOf` is older
  than 7 trading days is re-read

## Procedure

1. Spawn the `fund-facts` agent (Agent tool, `subagent_type: fund-facts`) with
   the list verbatim, in the background. It has the rules; do not restate
   them, do not widen its job.
2. When it reports, **verify before believing**: run
   `node scripts/fund-facts-check.mjs` yourself on the file it committed, and
   spot-check at least two figures against their cited source with WebFetch or
   WebSearch. A figure that does not match its own source is removed, not
   corrected from memory.
3. Report to the owner as a table — ticker, ER (as of), YTD (as of), source —
   followed by the funds that could not be verified and why. Every number in
   the reply carries its date.

## Boundaries

- This skill provides FACTS about funds. It does not change what a plan page
  shows; wiring `data/fund-facts.json` into the report is frontend work, done
  separately, with "as of <date>" beside every return.
- Spelling gaps (a filed name the table cannot resolve) go to the
  `funds-and-tickers` agent; comparables for trusts are that agent's call.
- Nothing from memory. The project stripped synthetic returns and fees on
  2026-07-18 and does not reintroduce them. A blank is honest.
