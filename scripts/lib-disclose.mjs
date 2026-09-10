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

/* THE FROZEN CLAIM. `frozen` means "the filing states contributions have been
 * discontinued", and the report renders it as a warning banner. 1,378 plans
 * carry it and some of those warnings are false.
 *
 * A CORRECTION TO MY OWN FIRST ATTEMPT, ON THE RECORD. The first version of
 * this guard suppressed the warning whenever the plan reported employer
 * contributions, reasoning that a filing cannot both pay and say it has
 * stopped. **That reasoning was wrong.** A plan terminated in June contributes
 * January to June and files a final-year return showing both — paying and
 * terminating are not contradictory, they are the ordinary shape of a
 * final-year filing. Measured: that guard hid 830 plans of which **750 were
 * genuine terminations** (637,268 participants) to catch 80 false ones. It
 * traded one wrong statement for nine suppressed true ones.
 *
 * WHAT ACTUALLY SEPARATES THEM IS THE TEXT, and specifically WHICH PLAN IS THE
 * SUBJECT of the verb. Two shapes are false:
 *   - CONDITIONAL. "in the event the Company terminates or permanently
 *     discontinues contributions" is the boilerplate ERISA vesting clause in
 *     nearly every plan document, describing nothing that happened.
 *   - A DIFFERENT PLAN IS THE SUBJECT. Comcast's notes say "The Solar Energy
 *     World 401k plan was frozen"; Leggett & Platt's say "the Hanes Retirement
 *     Plan was frozen" — while Hanes Companies' OWN filing says "the Plan was
 *     frozen" and is kept, which is the distinction working.
 *
 * Tying the name to the VERB rather than to the sentence matters: "the Plan
 * was frozen, and employees became eligible to participate in the Cayuga
 * Health 401(k)" mentions another plan as the DESTINATION while this plan is
 * what froze. Judging the sentence got 3 of 6 sampled wrong; judging the
 * subject got 22 of 22 right.
 *
 * Measured: rejects 60 (482,259 participants), keeps 1,318. Sampled 12
 * rejections and 10 keeps at random — all 22 correct. */
const FROZEN_CONDITIONAL = /\b(?:in the event|if the (?:plan|company|employer|sponsor)\b|should the (?:plan|company|employer)\b|were the plan\b|reserves the right|although it has not expressed|may (?:be |elect to )?(?:freeze|terminate))/i;
const FROZEN_ARTICLES = new Set(["the", "this", "a", "an", "its", "such", "and", "that", "said"]);

/** The proper name qualifying the plan that froze, or null when it is "the Plan". */
export function frozenSubjectName(text, sponsorName = "") {
  const t = String(text || "").replace(/\s+/g, " ");
  const sponsorWords = new Set(String(sponsorName || "").toUpperCase().replace(/[^A-Z0-9 ]/g, " ")
    .split(/\s+/).filter((w) => w.length > 3));
  const re = /((?:[A-Za-z0-9&.'’()-]+\s+){0,5})((?:401\(?k\)?|403\(?b\)?|Retirement|Savings|Pension|Thrift)?\s*[Pp]lan)\s+(?:was|were|has been|have been|is|are)\s+(?:frozen|terminated)/g;
  let m, best = null;
  while ((m = re.exec(t))) {
    const pre = m[1].trim().split(/\s+/).filter(Boolean);
    const names = [];
    for (let i = pre.length - 1; i >= 0; i--) {
      const w = pre[i];
      if (FROZEN_ARTICLES.has(w.toLowerCase())) break;
      if (!/^[A-Z0-9]/.test(w)) break;              // a lowercase word ends the name
      names.unshift(w);
    }
    const proper = names.filter((w) => /^[A-Z][a-z]|^[A-Z]{2,}/.test(w) && !sponsorWords.has(w.toUpperCase()));
    if (proper.length) best = proper.join(" ");
    else return null;   // an unqualified "the Plan" anywhere: THIS plan froze
  }
  return best;
}

/** True when the frozen warning may be shown to a reader. Suppresses only. */
export function frozenClaimOk(frozen, frozenText, sponsorName = "") {
  if (!frozen) return false;
  const t = String(frozenText || "");
  if (!t.trim()) return true;              // flag with no quote: nothing to disqualify it
  if (FROZEN_CONDITIONAL.test(t)) return false;
  return frozenSubjectName(t, sponsorName) === null;
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

  /* Every sentence below is verbatim from a real filing in the live store. */
  const froz = [
    [true, "The Plan was terminated effective December 31, 2023, and all assets of the Plan were fully distributed as of April 30, 2024.", "Capital Region Medical", true,
      "unqualified 'the Plan' — this plan really was terminated"],
    [true, "As amended on December 31, 2024, the Plan was frozen and all participants of the Plan became fully vested in their Plan accounts.", "Hanes Companies, Inc.", true,
      "Hanes' OWN filing: kept"],
    [true, "As of December 31, 2024, the Hanes Retirement Plan was frozen and all participants of the Hanes Retirement Plan became fully vested.", "Leggett & Platt, Incorporated", false,
      "the SAME freeze quoted in another sponsor's filing: rejected"],
    [true, "The Solar Energy World 401k plan was frozen to new contributions as of January 31, 2025.", "Comcast Corporation", false,
      "a different named plan is the subject"],
    [true, "The TDA Plan was frozen December 31, 2008 and no further contributions were made subsequent to that date.", "St. Ambrose University", false,
      "the sponsor's OTHER plan (a tax-deferred annuity)"],
    [true, "A participant will also become 100 percent vested in any Company contributions in the event the Company terminates or permanently discontinues contributions to the Plan.", "Honeywell International Inc", false,
      "the boilerplate ERISA vesting clause — hypothetical"],
    [true, "If the Plan is frozen, the assets will be retained by the Plan for distribution.", "Mms Usa Holdings, Inc.", false,
      "explicit conditional"],
    [true, "As of January 1, 2025, the Plan was frozen, and the Organization's employees became eligible to participate in the Cayuga Health 401(k).", "Cayuga Medical Associates", true,
      "another plan is the DESTINATION, not the subject — judging the sentence got this wrong"],
    [true, "Rieck Construction 401(k) Profit Sharing Plan was frozen on January 1, 2025 prior to the merger.", "Bcts Intermediate, Llc", false,
      "acquired plan named as the subject"],
    [true, "", "Anyone", true, "flag with no stored quote: nothing to disqualify it"],
    [false, "The Plan was terminated effective July 31, 2024.", "Macatawa Bank", false, "no flag, nothing to say"],
  ];
  for (const [f, t, sp, want, why] of froz) {
    const got = frozenClaimOk(f, t, sp);
    if (got !== want) { bad++; console.log(`FAIL frozen: want ${want} got ${got} — ${why}\n     "${String(t).slice(0, 110)}"`); }
  }
  console.log(bad ? `\n${bad} disclosure cases FAILED` : `all ${cases.length + 2 + froz.length} disclosure cases pass`);
  process.exit(bad ? 1 : 0);
}
