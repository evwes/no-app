/* wampo — shared DISCLOSURE decisions: the judgements about what a table
 * means, as opposed to what it contains.
 *
 * WHY THIS FILE EXISTS. Three times on 2026-09-10 a rule was found living in
 * app.js and missing from scripts/build-seo-pages.mjs: the "withdrawn from the
 * EFAST2 bucket" wording, the match-quote guard, and now the holdings-coverage
 * note. The static pages are not a lesser surface — they are the crawlable
 * ones, the growth engine, and the copy a search engine shows. A caveat the
 * interactive report considers necessary is necessary there too.
 *
 * THE COVERAGE NOTE. A plan's schedule of assets frequently itemises less than
 * the plan holds: the rest sits in a master trust, a pooled account, a general
 * account, or simply is not broken out. Measured 2026-09-10 across the 5,000
 * published static pages, 533 of them showed a fund table the interactive
 * report would have caveated and the static page did not — 12,736,363
 * participants, and the largest employers in the country among them:
 * Walmart at 93%, Amazon 91%, Boeing 78%, and JPMorgan Chase at 66%, whose
 * page listed $34.91B of holdings for a $52.91B plan with nothing to say that
 * $18B was missing from it.
 *
 * Bands, not a bare percentage: the sum is display-precision against a filed
 * total, so a small difference is noise and only a material gap earns a
 * reader's attention. 95-105% is treated as reconciled and says nothing.
 *
 * MASTER-TRUST LINEUPS ARE EXCLUDED, and that is not an oversight: a trust's
 * holdings are a different pool from one member plan's assets, so the ratio is
 * meaningless and a note built on it would be false.
 */

/**
 * Decide whether a holdings table needs a coverage caveat.
 * @param {number} total       sum of the FILED lineup (not the displayed subset)
 * @param {number} planAssets  Schedule H end-of-year assets
 * @param {boolean} fromTrust  lineup came from a master trust — never caveat
 * @returns {null | {kind: "under"|"over", pct: number, severe: boolean}}
 */
export function coverageBand(total, planAssets, fromTrust = false) {
  if (fromTrust) return null;
  if (!total || !planAssets || total <= 0 || planAssets <= 0) return null;
  const pct = (total / planAssets) * 100;
  if (pct >= 95 && pct <= 105) return null;
  return { kind: pct < 95 ? "under" : "over", pct, severe: pct < 50 };
}

if (process.argv[1] && process.argv[1].endsWith("lib-disclose.mjs") && process.argv.includes("--selftest")) {
  const cases = [
    // [total, assets, fromTrust, expected kind or null, why]
    [95, 100, false, null, "95% exactly is the band edge and reconciled"],
    [100, 100, false, null, "exact match says nothing"],
    [949, 1000, false, "under", "94.9% is below the band"],
    [950, 1000, false, null, "95.0% is the band edge and reconciled"],
    [1050, 1000, false, null, "105.0% is the band edge and reconciled"],
    [1051, 1000, false, "over", "above 105% is unreconciled"],
    [499, 1000, false, "under", "under half"],
    [3491, 5291, false, "under", "JPMorgan Chase: 66% of the plan"],
    [4713, 5079, false, "under", "Walmart: 93%"],
    [1000, 1000, true, null, "a master trust pool is never compared to one member plan"],
    [0, 1000, false, null, "no holdings — nothing to caveat"],
    [1000, 0, false, null, "no filed assets — the ratio is undefined, say nothing"],
  ];
  let bad = 0;
  for (const [t, a, tr, want, why] of cases) {
    const got = coverageBand(t, a, tr);
    const k = got ? got.kind : null;
    if (k !== want) { bad++; console.log(`FAIL want ${want} got ${k} — ${why}`); }
  }
  // the severe flag changes the wording, so pin it too
  const sev = coverageBand(400, 1000, false);
  if (!sev || !sev.severe) { bad++; console.log("FAIL 40% should be flagged severe"); }
  const mild = coverageBand(900, 1000, false);
  if (!mild || mild.severe) { bad++; console.log("FAIL 90% should NOT be flagged severe"); }
  console.log(bad ? `\n${bad} coverage-band cases FAILED` : `all ${cases.length + 2} coverage-band cases pass`);
  process.exit(bad ? 1 : 0);
}
