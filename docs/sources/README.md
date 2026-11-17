# Source documents, committed so a figure can cite the exact bytes it came from

`data/fund-facts.json` requires every figure to carry an `https://` source URL
and an as-of date, and `fund-facts-check.mjs` enforces it (`isUrl` refuses
anything that is not `http(s)://`). That rule exists so a reader can check a
number, and it is the reason a document the owner supplies by hand cannot
simply be cited as a local path.

So an owner-supplied truth source is COMMITTED HERE and cited by its raw URL on
this public repository. The precedent is `docs/form5500-instructions-2025.txt`,
which the project already treats as a truth source the owner uploaded. The
citation then names the exact bytes the figures were read from, and anyone can
fetch them.

| file | what it is | as of |
|---|---|---|
| `schwab-ctf-monthly-performance-2026-10-31.xlsx` | Schwab's own month-end performance workbook for its collective trust funds — SMRT (Schwab Managed Retirement Trusts), SIRT (Schwab Indexed Retirement Trusts) and ITF (Schwab Institutional Trusts). Per UNIT CLASS: expense ratio, 1/3/6-month, YTD and 1/3/5/10-year annualised returns net of fees, and an inception date. | 2026-10-31 |

**Why this one is not fetched live.** `www.schwabassetmanagement.com` is on the
environment's allowlist and the tunnel reaches it, but the site answers **403
with a real body** — it rejects this client, which is the "site refusing after
the proxy allowed it" shape the project record describes. The owner's copy is
therefore the only copy obtainable, and committing it is what makes the figures
citable rather than unsourced.

`scripts/schwab-ctf-extract.py` reads this workbook without openpyxl (it is a
zip of XML) and prints one record per unit class. It is the reviewable step
between the document and anything written to `data/fund-facts.json` — which is
still written ONLY by the `fund-facts` agent, with each figure's source and
date.
