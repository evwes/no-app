# wampo

Look up any company's 401(k) — a better 401k.live.

Search a company and see its plan at a glance:

- **Plan provider** (Fidelity, Vanguard, Empower, …)
- **Participants** and plan assets (from public Form 5500 figures)
- **Company match** — the formula and what it's effectively worth
- **Vesting schedule** (immediate, cliff, graded)
- **Contribution types** — pre-tax, Roth, after-tax, and whether the mega
  backdoor Roth (in-plan conversion) is supported
- **Self-directed brokerage window** — BrokerageLink, Schwab PCRA, or none

Plus filters (brokerage window / mega backdoor / after-tax / immediate
vesting / provider) and sorting by size.

## Data

`data.js` holds the dataset — currently ~20 large employers of
community-sourced sample data. **Every entry needs verification against the
plan's official documents before being presented as fact.** To add or fix a
company, edit `data.js` (the schema is self-evident) or open an issue.

## Running it

Static page, no build step:

```sh
python3 -m http.server 8000
# open http://localhost:8000
```

Hosted via GitHub Pages from this repo.

## Disclaimer

Informational only; may be outdated or wrong; not financial, tax, or legal
advice.
