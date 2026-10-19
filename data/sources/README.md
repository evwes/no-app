# Provider fund lists — how to put one on file

**What this is for.** Half of every expense ratio wampo prints is a *pattern
estimate keyed on the fund's name* — 49.9% of published fee cells, $254B of menu
value — and tens of thousands of rows carry no fee at all. `data/fund-facts.json`
is the only place a sourced figure may live, and it was empty from 2026-09-24
until the first capture landed here, because **nothing in the build container can
reach a fund company**: `principalam.com` and `sec.gov` both fail to resolve
(`ENOTFOUND`, and `000 / 0 bytes` over curl). The data has to come in from
outside. This folder is how.

Biggest single gap measured 2026-10-19, to show the shape of the prize:

| provider rows published | plans | participants | carrying no symbol **and** no fee |
|---|---|---|---|
| 61,453 naming Principal | 10,565 | 15,180,866 | **54,013 rows / $111.9B** |

Same shape for State Street, Galliard, Great Gray, the Fidelity Freedom CITs and
the Vanguard target-date trusts. One capture per provider closes one of them.

---

## The three steps

### 1. Capture the provider's own table

Open the provider's fund finder — for Principal that is
<https://www.principalam.com/us/fund-finder?starttab=cit#tab=cit> with the CIT
tab selected — and get it into a CSV. Most providers offer an **Export** or
**Download** button; if not, select the table and paste it into a spreadsheet,
then *Save as CSV*. Excel's BOM is handled.

**Keep the expense-ratio column the provider published.** Do not round it, do not
convert it, do not fill a blank. A blank fee and a zero fee are different claims
and the ingest refuses to conflate them.

### 2. Drop the file here

Name it `<provider>-<what>-<YYYY-MM-DD>.csv`, e.g.
`principal-cit-2026-10-19.csv`, and put it in this folder (`data/sources/`).

Any of these work, in order of least effort:

- **GitHub web UI** — open `data/sources/` on github.com, *Add file → Upload
  files*, drag the CSV in, commit. It is then on file permanently and every
  future session can read it.
- **Attach it to the conversation** and say which provider and URL it came from;
  I will commit it here with its provenance.
- **Paste the table into chat** for anything under a few hundred rows.

The container is wiped between sessions, so a file that is not committed to the
repo is not "on file". That is why the folder is the destination rather than a
chat message.

### 3. Tell me the provenance, or run it yourself

One command, and it is safe to run twice:

```sh
node scripts/fund-facts-ingest.mjs data/sources/principal-cit-2026-10-19.csv \
  --provider "Principal Asset Management" \
  --source   "https://www.principalam.com/us/fund-finder?starttab=cit#tab=cit" \
  --as-of    2026-10-19 \
  --dry-run

node scripts/fund-facts-check.mjs
```

`--dry-run` prints exactly what it would write and what it is skipping, and
writes nothing. Drop the flag to commit the figures to
`data/fund-facts.json`. `--as-of` is the date the provider's page was current —
**not** today's date, if the capture is older.

---

## What the CSV needs

A header row and two columns. The header spelling is matched loosely, so a
provider's own export usually needs no editing at all:

| column | accepted headings |
|---|---|
| fund name *(required)* | `name`, `fund`, `fund name`, `marketing name`, `investment`, `option` |
| expense ratio *(required)* | `er`, `expense ratio`, `expense`, `total annual operating expense(s)`, `total expense ratio`, `ter`, `net expense`, `gross expense ratio` |
| ticker *(optional)* | `ticker`, `symbol` — a row with a real ticker is filed as a fund rather than a vehicle |
| vehicle kind *(optional)* | `kind`, `vehicle`, `type`, `asset type` |
| share class *(optional)* | `share class`, `class` |

A heading may carry footnote markers and units — `Total Annual Operating Expense
(%)`, `Expense Ratio 1` — and still match. Values may be `0.28`, `0.28%`,
`28 bps`, or `0,28`.

A row is **skipped and reported**, never written as zero, when its fee is blank,
`n/a`, `--`, or outside 0–3%. The last of those catches a units mistake: a `47.5`
in an expense column is a performance figure in the wrong column, and the ingest
says so rather than publishing a 47.5% fee.

---

## What happens to the figures, and what does not

Each entry is written with its **source URL** and **as-of date** attached, and
`scripts/fund-facts-check.mjs` refuses any entry missing either — along with a
future date, an implausible number, or an unknown field. Seven negative controls
cover those refusals.

**A vehicle's fee is recorded as the vehicle's, not the plan's.** Every vehicle
entry carries `erBasis`, which is `vehicle-stated` for a figure read off the
provider's page. A collective trust's cost is commonly negotiated per plan, so
the provider's published number is the *fund's* stated total annual operating
expense and may not be what a given plan pays. The field exists so that no page
can ever print a provider's figure as the plan's price. That distinction has to
survive into the display wording when these are wired up.

**Wiring is a separate, measured step and is deliberately not automatic.**
Landing a figure in this file publishes nothing. Matching a filed holding name
(`Prin LifeTime Hybr 2040 CIT Z`) to a provider's marketing name
(`Principal LifeTime Hybrid 2040 CIT`) is its own problem, and it gets the same
treatment as every other display change: a differential through both copies of
the renderer over every published row, a seeded draw read by hand, and a count of
what moved — before a single cell changes.

**Two things a capture cannot fix**, so that the file is not asked to do the
impossible:

- A **guaranteed option** has no expense ratio in this sense.
  `Principal Guaranteed Option` is 340 published rows showing a fabricated 0.35
  on $1.27B; the honest answer there is to withdraw the number, not to source it.
- A fee that is genuinely **plan-specific** is not on any public page. Where only
  a plan's own Schedule C or Schedule H discloses it, that is filed data and
  belongs in the pipeline, not here.
