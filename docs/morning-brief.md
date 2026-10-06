# wampo brief — WORK PAUSED by owner directive, 2026-10-05 03:0xZ

**All wampo work is paused until the weekly reset, Thursday 2026-10-08 7:00 PM
ET.** This file is overwritten nightly in normal operation; it is deliberately
*not* a log of the last cycle, because the only thing a reader needs from it
right now is the pause and the state the pause froze.

## Everything is concluded, committed, pushed and mirrored

Working tree clean. Local, `claude/wampo-401k-live-nx1t4o` and `main` are all
at **`63dc1542`**, 0 ahead and 0 behind in both directions. `PARSER_VERSION`
**202**, store dominant per-ack **pv 202 at 99.9%**, **HIGH 4** (the recorded
baseline), warn 556. **Nothing is mid-flight, half-shipped, or pre-registered
for a run that has not merged.**

## What the three paused hours delivered, in numbers

- **SHIPPED and live on main** — a published quote that opens on the
  attachment's page number and running header: **1,890 quotes / 1,887 acks /
  6,096,337 readers**, 188 crawlable pages, **0 quotes grew and 0 stopped being
  publishable**. Walmart (1,996,659 participants, the largest plan in the
  universe) stops publishing `6 Table of Contents Vesting Participants are
  immediately vested…` as its whole vesting answer; Starbucks now reads
  *"Vesting All participant and Company matching contributions are immediately
  100% vested."* site-test #173 green on that SHA.
- **v202's verdict** — the named set held exactly (WITHHELD 34 → 32, both
  Polsinelli acks, 0 joined, 0 lost, **0 vesting labels moved anywhere**), and
  one registered figure was wrong: it delivered **103 plans / 93,512 ppl**
  gaining a quote where the registration said 2, because I reused v201's safety
  argument on a mechanism it does not describe. Direction checked both ways —
  12 of 12 ranked and **14 of 14 on a uniform draw** are genuine.
- **SIZED, not shipped** — the accelerated-vesting exception class: **69 plans
  / 53,298 ppl**, narrowed 115 → 73 → 69 by reading members.

## The one thing on this list that needs your judgement when work resumes

**The remedy the queue prescribed for that last class would make the majority
of it worse, and only reading the filings could show it.** Six of the largest
members were downloaded and read: Smith And Nephew (8,883 ppl), Woodgrain
(5,558), Hankey (4,292) and U.S. Fire (3,511) state **no vesting schedule
anywhere in the attachment**, Ram Partners (2,405) only an amendment mentioning
one, and only Aaron Thomas (2,239) files a real table the extractor missed.

So a demotion or ranking — the queued fix — can only promote a sentence that
exists. On five of six it would withdraw the only vesting fact the filing
states and publish *"not stated in the audited notes"* about a filing that did
state something. ***A guard that withdraws a true answer because it is
incomplete makes the page less honest, not more.*** The two halves need
different changes and I shipped neither: a display LABEL for the majority (a
new sentence, so the guard and the claim it licenses are one change), and
parser selection for the minority.

## Prepared during the pause, ready to build on Thursday

The owner asked for the agentic rebuild to be *prepared* rather than started,
and asked specifically which source should supply YTD / 1YR / 5YR / 10YR fund
performance. **That decision is made and written up in
`docs/performance-source.md`** — read it before touching the returns column.

Three things in it change what the rebuild should do first:

- **The returns column has never shipped because its only attempted source
  blocks us by IP range.** `fund-facts.yml`'s schedule has been disabled since
  2026-09-18 with the reason in the file — Yahoo returned HTTP 429 on *every*
  call from a GitHub runner — which is why `data/fund-facts.json` holds 0
  entries. *Before adding a source, ask what the pipeline already tried.*
- **The ruling is SEC EDGAR**, because for a registered fund the standardized
  return is the fund's own legally-required filing rather than a third party's
  computation: 1/5/10YR from the Risk/Return Summary Inline XBRL (per share
  class, calendar-year-end, so it must be labelled with that date), monthly
  returns from N-PORT Item B.5(a). Issuer pages are used for month-end YTD
  only, where filings lag. Morningstar is deferred, not assumed away: it is the
  only aggregator covering collective trusts and the owner would have to pay.
- **The key that path needs is already parsed and thrown away.**
  `fetch-sec-funds.mjs` reads CIK, Series ID and Class ID and line 250 keeps
  only `[name, ticker, kind, className]` — and N-PORT and the RR XBRL are
  addressed by CIK + class. One line, in a `workflow_dispatch`-only script, no
  `PARSER_VERSION` bump.

**And the measurement says the returns feed is probably not the first thing to
build.** Participant-weighted over 600 published menus: only **47.4%** of a
typical participant's menu value sits in a row the page has identified by
symbol, and **32.0% of draws are under 25%** (Kroger, AT&T and Morgan Stanley
all draw at 0.0%). Of the 52.6% with no symbol, **42.7% is named collective
trusts concentrated in seven managers — BlackRock 53.8%, Northern Trust 13.7%,
Fidelity, State Street, Vanguard, JPMorgan, Prudential, 96% between them** —
and they are mostly INDEX CITs whose index is named in the row, where a
comparable is unambiguous and `fund-er.js` is the instrument. That is worth
more published cells than any returns source and needs no new source at all.
A further **20.0%** of the no-symbol money is managed-account aggregates and
brokerage windows where `NA` is the accurate answer, not a gap.

## What continues during the pause, and what does not

**The GitHub Actions pipeline keeps running and should.** It is the durable
layer: it ingests new filings, runs the audit, and maintains the HIGH-findings
issue on its own schedule with no session involved. Its data commits will
accumulate on `main` while nothing adopts them — that is normal and
`scripts/mirror-gate.mjs` settles it automatically whenever a session returns.

**Three Routines are DISABLED**, so the pause is enforced rather than
advisory: the hourly cycle (`trig_017vdX5dSSYh5v68Cwe6EUBu`), the daily sweep
(`trig_01X6KxJQfanGsm3tcHkCtwt3`) and the weekly status
(`trig_01P9LK37jGLKc5FSAMerRZ7C`). Each is re-enabled with one
`update_trigger(enabled=true)` call; none lost its run history.

## Before resuming, delete the pause key

`docs/cadence-state.json` carries a `PAUSED` key with an explicit expiry of
**2026-10-08T23:00Z**. After that it is stale and must be deleted rather than
obeyed. This project's own record is why the key says so: a
`partialDataWarning: "ACTIVE … DO NOT MIRROR"` once sat there for two weeks
describing a run cancelled in August while the branch held a complete store.
*A stale state file does not merely go unread; it blocks correct action.*

The queue itself is in `CLAUDE.md`'s Open list and `docs/accuracy-log.md`
(703 dated entries), both current as of `63dc1542`.
