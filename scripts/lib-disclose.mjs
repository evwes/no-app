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

/* THE FROZEN CONTRADICTION. `frozen` means "the filing states contributions
 * have been discontinued", and the report renders it as a warning banner.
 * Measured 2026-09-10 over the whole full-form universe: 1,378 plans carry the
 * flag and **830 of them (60%) reported employer contributions that same year**
 * — 1,101,268 participants and $2.46B. Honeywell's page warned 63,466 people
 * that contributions had stopped, beside $235.7M of employer money in the very
 * filing the warning was read from.
 *
 * The extractor defect is real and fixed separately, but a store already
 * carries the bad flags and a re-parse takes hours. This is the cross-check
 * that does not need one: **a filing cannot both report employer contributions
 * and say they have ceased.** Where the two disagree, the money is the harder
 * fact — it is a filed dollar figure on Schedule H, not a sentence matched by
 * a regex — so the warning is withheld.
 *
 * Deliberately NOT symmetric: $0 employer money does not confirm a freeze
 * (a plan can simply have made no discretionary contribution that year), so
 * this only ever suppresses, never asserts. */
export function frozenClaimOk(frozen, employerContributions) {
  if (!frozen) return false;
  if (typeof employerContributions === "number" && employerContributions > 0) return false;
  return true;
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

  const froz = [
    [true, 235700000, false, "Honeywell: flag set, $235.7M contributed — withhold"],
    [true, 0, true, "flag set, no employer money — the claim stands"],
    [true, undefined, true, "flag set, contributions unknown — nothing contradicts it"],
    [true, null, true, "flag set, contributions null — nothing contradicts it"],
    [false, 0, false, "no flag, nothing to say"],
    [false, 100, false, "no flag, nothing to say"],
    [true, 1, false, "even a dollar contradicts 'contributions have ceased'"],
  ];
  for (const [f, er, want, why] of froz) {
    const got = frozenClaimOk(f, er);
    if (got !== want) { bad++; console.log(`FAIL frozen: want ${want} got ${got} — ${why}`); }
  }
  console.log(bad ? `\n${bad} disclosure cases FAILED` : `all ${cases.length + 2 + froz.length} disclosure cases pass`);
  process.exit(bad ? 1 : 0);
}
