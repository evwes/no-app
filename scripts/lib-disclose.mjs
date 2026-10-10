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
/* The one shared question about whether a name identifies a fund at all.
 * Imported rather than copied: app.js carries a GENERATED twin of it, kept
 * honest by gen-generic-twin.mjs and the smoke tether, and a third hand-typed
 * copy is how the match-quote guard once published a false heading on 615
 * pages. build-seo-pages.mjs already imports the same symbol, and lib-4i
 * imports nothing from this file, so there is no cycle. */
import { isGenericTypeName } from "./lib-4i.mjs";

/* HOW MUCH OF THIS PLAN IS EVEN IN THE TRUST — 2026-10-04 (14:4xZ).
 *
 * `coverageBand` below returns null for a trust lineup, and its comment says
 * why, correctly: *a trust's holdings are a different pool from one member
 * plan's assets, so the ratio is meaningless and a note built on it would be
 * false.* That is right about the pair IT compares — the trust's MENU total
 * against one plan's assets. **But the guard that suppressed the meaningless
 * ratio also left the meaningful one unwritten**, and it is the reader's actual
 * question.
 *
 * The meaningful pair is two WHOLE-ENTITY Schedule H totals: the trust's own
 * year-end assets against this plan's own. Both are filed figures for a whole
 * pool, so the comparison is sound, and because a master trust is SHARED the
 * plan's interest in it is at most the entire trust:
 *
 *     this plan's assets held through the trust  <=  trustAssets / planAssets
 *
 * So the note is an UPPER BOUND and must say so. Measured over all 633 plans
 * the page serves a trust menu to:
 *
 *   under 5%   13 plans /   625,572 ppl   the trust is a SLIVER of the plan
 *   5-25%      22 plans /   942,532 ppl
 *   25-50%     28 plans /   490,841 ppl
 *   50-90%     36 plans / 1,217,104 ppl
 *   90-110%   109 plans / 4,738,277 ppl   the trust IS essentially the plan
 *   over 110% 425 plans / 3,580,507 ppl   shared trust bigger than this plan
 *
 * **IBM's trust holds $14,615,628 against a $64,476,933,873 plan — 0.02% — and
 * the page serves its three-row menu as IBM's fund lineup to 144,897 readers.**
 * FedEx 1.7% on a $25.4B plan, GE 0.1%, Sherwin-Williams 1.4%, CHS 1.4%.
 * Grand Trunk / Canadian National, the case the hourly draw surfaced, is 16.7%.
 *
 * THE 90% CUT COMES FROM THAT DISTRIBUTION, not from taste: above it the trust
 * is essentially the whole plan and the sentence would be noise on 534 plans /
 * 8.3M participants, and above 110% the bound is vacuous. Named cost of the
 * cut: the 50-90% band is included, so a plan at 88% gains a marginal note.
 * Returning DATA rather than a sentence, like `trustScheduleDMenu`, because the
 * two surfaces word it differently and app.js carries `money()` where
 * `build-seo-pages` carries `usdB()`.
 * docs/accuracy-log.md 2026-10-04 (14:4xZ). */
export function trustShareBound(trustAssets, planAssets) {
  const t = Number(trustAssets), p = Number(planAssets);
  if (!(t > 0) || !(p > 0)) return null;
  const pct = (t / p) * 100;
  if (pct >= 90) return null;        /* the trust is essentially the plan, or larger */
  /* THE PERCENTAGE'S OWN FLOOR IS PART OF THE CLAIM, so it is formatted HERE
   * rather than at each surface. IBM's bound is 0.0227%, which `toFixed(0)`
   * renders as **"0%"** — the identical defect to `money()`'s "$0K" for a
   * nonzero amount, shipped as a fix four hours before this function was
   * written, and it would have reappeared in my own new sentence. A bound that
   * is real but tiny says "less than 1%", never "0%"; and a single decimal is
   * kept below 10% so 1.7% does not round to 2%. */
  const pctText = pct < 1 ? "less than 1%" : pct < 10 ? pct.toFixed(1) + "%" : pct.toFixed(0) + "%";
  return { pct, severe: pct < 50, pctText };
}
/* Asserted at import, both directions, each must-KEEP a case where the named
 * condition is the only protection. */
for (const [t, p, why] of [
  [14615628, 64476933873, "IBM — 0.02%, three rows served to 144,897 readers"],
  [430067751, 25378065969, "FedEx — 1.7% on a $25.4B plan"],
  [128134058, 767383565, "Grand Trunk — 16.7%, the case the draw surfaced"],
  [8451913312, 18488465000, "Abbott — 45.7%, the severe boundary's upper side"],
  [1, 2, "50% exactly — informative and NOT severe"],
]) if (!trustShareBound(t, p)) {
  throw new Error(`lib-disclose: trustShareBound no longer fires for ${why} — the arm is inert`);
}
for (const [t, p, why] of [
  [1000, 1000, "the trust IS the plan — the 90% cut is the only protection"],
  [1100, 1000, "a shared trust LARGER than this plan — the bound is vacuous"],
  [900, 1000, "90% exactly — the cut is inclusive at the top"],
  [0, 1000, "no trust assets stored — nothing to claim"],
  [1000, 0, "no plan assets — division by zero"],
]) if (trustShareBound(t, p)) {
  throw new Error(`lib-disclose: trustShareBound would publish a bound for ${why} — fix the predicate rather than the control`);
}
if (trustShareBound(1, 2).severe !== false) throw new Error("lib-disclose: 50% must NOT be severe");
if (trustShareBound(49, 100).severe !== true) throw new Error("lib-disclose: 49% must be severe");
/* and the FLOOR, pinned in both directions because "0%" for a real bound is
 * the same false claim as "$0K" for a real amount */
for (const [t, p, want, why] of [
  [14615628, 64476933873, "less than 1%", "IBM \u2014 0.0227% must NOT print as 0%"],
  [430067751, 25378065969, "1.7%", "FedEx \u2014 one decimal below 10%, not 2%"],
  [128134058, 767383565, "17%", "Grand Trunk \u2014 no decimal at or above 10%"],
  [1, 100, "1.0%", "EXACTLY 1% is not LESS than 1% \u2014 my own fixture expected the floor text here and was wrong; the predicate was right"],
  [99, 10000, "less than 1%", "0.99% \u2014 genuinely below the floor"],
  [10, 100, "10%", "exactly 10% takes the no-decimal form"],
]) {
  const got = trustShareBound(t, p).pctText;
  if (got !== want) throw new Error(`lib-disclose: trustShareBound pctText = ${JSON.stringify(got)}, want ${JSON.stringify(want)} (${why})`);
}

export function coverageBand(total, planAssets, fromTrust = false) {
  if (fromTrust) return null;
  if (!total || !planAssets || total <= 0 || planAssets <= 0) return null;
  const pct = (total / planAssets) * 100;
  if (pct >= 95 && pct <= 105) return null;
  return { kind: pct < 95 ? "under" : "over", pct, severe: pct < 50 };
}

/* THE FILED UNIT OF ACCOUNT — a precision we assert and the filing never gave.
 *
 * Many audited schedules of assets are printed in thousands or millions under
 * their own caption. PPG's 4i page is headed `($ in millions)` and prints
 * `BlackRock Equity Index Fund ... 671`. `parse4i` detects that caption and
 * multiplies up, which is correct and is why the parse reconciles (PPG's menu
 * sums to 93.2% of its Schedule H assets). But the product carries trailing
 * zeros that were never digits in the filing, and the STATIC PAGE printed the
 * product to the dollar: `$671,000,000`.
 *
 * Measured 2026-09-27 against the v184 store: 157 published static pages /
 * 5,616,080 participants print holding values to the dollar for a schedule
 * filed in rounded units. Amazon (1,336,478 participants) shows
 * `$4,619,443,000`; PPG shows `$671,000,000` for a figure filed as `671`, and
 * a `$2,000,000` row on that page means only "between $1.5M and $2.5M".
 * No digit is fabricated — the zeros are the filing's own declared scaling —
 * but the page implies a figure known to the dollar, and two rows a million
 * apart on a millions-filed schedule are not distinguishable at all.
 *
 * THE INTERACTIVE REPORT DOES NOT HAVE THIS DEFECT, which is why the note is
 * added here and not mirrored into app.js: `money()` renders at most three or
 * four significant figures (`$671.0M`, `$4.6B`), so it asserts nothing the
 * filing did not state. The usual direction of travel in this file is a
 * qualifier the report applies and the static page omits; this is the reverse —
 * a claim the static page makes and the report does not — so the fix belongs
 * where the claim is, and one copy of the rule is better than two.
 *
 * THE FILING'S OWN DECLARATION IS WHAT LICENCES THE SENTENCE, NOT AN INFERENCE
 * FROM ROUND NUMBERS. `parse4i` records `thousands: best.scale > 1` on every
 * entry it scales — a filed fact that has been written to every lineup shard
 * and READ BY NOTHING: not merge-4i, not audit-data, not app.js, not this
 * generator. That is the computed-and-discarded shape this project keeps
 * paying for, so the flag is the gate here. Inferring "filed in thousands"
 * from "every value is a multiple of 1,000" would be an inference, and it is
 * wrong at least once: Fifth Third Bancorp's 31-row menu has no value that is
 * a multiple of 1,000 yet one confident plan in the store is all-round without
 * any units caption.
 *
 * The flag is a BOOLEAN and does not say WHICH unit (scale is 1,000 or
 * 1,000,000 — see `variants` in lib-4i). The granularity is therefore read off
 * the values, which is safe because it is a statement about OUR OWN published
 * figures rather than about the filing, and because it was checked over the
 * entire flagged population: 219 entries carry the flag, all 219 are wholly
 * $1,000 multiples, 10 are wholly $1,000,000 multiples, and ZERO are neither —
 * so this never returns null for a flagged entry and never has to guess. All
 * ten millions members were read one by one (Dow, Regions, PPG, Comerica,
 * Trinity, Louisiana-Pacific and one trust among the confident ones) and every
 * one files two-to-four-digit figures under a millions caption. */
export function filedUnit(entry) {
  if (!entry || !entry.thousands) return null;
  const vals = (entry.funds || []).map((f) => +(f && f.value) || 0).filter((v) => v > 0);
  if (!vals.length) return null;
  // largest declared unit the published figures are wholly consistent with;
  // >= 3 rows before millions, so one row cannot carry the stronger claim
  if (vals.length >= 3 && vals.every((v) => v % 1e6 === 0)) return { unit: 1e6, word: "millions", money: "$1,000,000" };
  if (vals.every((v) => v % 1e3 === 0)) return { unit: 1e3, word: "thousands", money: "$1,000" };
  return null;
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

/* ────────────────────────────────────────────────────────────────────────────
 * THE FILED-NAME CLEANER, AND WHY IT IS HERE (2026-09-27).
 *
 * `build-seo-pages.mjs:185` rendered `titleCase(f.name)` — the RAW stored name
 * — so NOT ONE arm of this function had ever reached a crawlable page. Measured
 * on the v188 store across the 4,952 published pages that carry a lineup:
 * **2,790 of 162,717 rows print a name the report reader never sees, on pages
 * serving 9,689,129 participants.** Every repair this project has shipped at
 * display time was invisible there — the leading CUSIP ("922908371 VANGUARD EXT
 * MKT INDX-INST+"), the `(1)` footnote (1.95M ppl), the OCR bar read as a
 * share-class I (683k), the kerned de-spacer, the UnitedHealth address strip
 * (274,906), the doubled house prefix (486k), TYPE_PREFIX and TYPE_SUFFIX.
 *
 * This is the SECOND TIME in one day that two display paths diverged: the
 * false-precision defect was recorded as affecting the report and was only ever
 * on these same static pages. The rule earned twice: **there are TWO display
 * paths and a claim about readers must name which.**
 *
 * app.js keeps its own copy because it is a plain browser script with no module
 * system — the established shape for `frozenClaimOk` and `coverageBand` — and
 * the copies are TETHERED: `smoke-test.mjs` runs the BROWSER copy against this
 * module on filed names taken from the real store and fails on any drift. Three
 * untethered copies of one rule is how the match-quote guard published a false
 * heading on 615 pages.
 *
 * The body below is EXTRACTED VERBATIM from app.js rather than retyped, because
 * a transcribed copy of a shipped rule has produced a wrong answer three times
 * on this record. */
/* WIDENED 2026-09-28, and for the third time the diagnosis is the same one:
 * the MECHANISM was right, the guard below was already right, and only the
 * VOCABULARY was narrow. Two gaps, both found by asking this function directly
 * rather than by reasoning about it:
 *
 *   - `collective (?:investment )?trusts?` allowed no trailing ` funds`, so
 *     Waste Management's nine `PIMCO RealPath Blend 2030 Collective Trust
 *     Funds` rows (47,426 ppl) came back unchanged, while the `common/`-led
 *     arm beside it had carried `(?: funds?)?` all along;
 *   - only `pooled separate account` was listed, so the BARE form escaped —
 *     `BLACKROCK SP 500 IDX (IS) Separate Account`, `ALL WORLD EX-US STOCK
 *     INDEX FUND Separate Account`.
 *
 * `MASTER TRUST` IS DELIBERATELY ABSENT and that is the load-bearing decision
 * here. It reads like the others and is not: a master trust is a meaningful
 * DESIGNATION, not a column caption, so stripping it destroys meaning rather
 * than restoring it — `Investment in BNSF 401(k) Plans Master Trust`
 * ($3,521,680,000) would become `Investment in BNSF 401(k) Plans`, and
 * `Korn Ferry Master Trust` would become `Korn Ferry`, which is the v167
 * bare-house defect verbatim. Both are pinned controls.
 *
 * The trailing optional groups are safe against the v-BDO backtracking trap —
 * an optional group before an anchor is a silent second anchor position only
 * when the anchor is a LOOKAHEAD that can fail; here it is `\s*$`, so giving
 * back ` funds` leaves it unconsumed and the match fails rather than
 * succeeding one word early. Verified on `… Collective Trust Funds (Continued)`,
 * which correctly does not match at all. */
const TYPE_SUFFIX = /\s+(?:mutual funds?(?: shares?)?|common(?:[\/ ]|\s+and\s+)?collective trusts?(?: funds?)?|collective (?:investment )?trusts?(?: funds?)?|registered investment compan(?:y|ies)(?: shares?)?|(?:pooled )?separate accounts?|units? of participation)\s*$/i;
/* A REMAINDER MAY NOT END IN A CONNECTIVE, and this guard exists because the
 * widening above produced exactly that before it shipped. `Retirement 2055
 * Common and Collective Trust Fund` was cut to `Retirement 2055 Common and`.
 *
 * The existing screen asks whether ANY token identifies something, and
 * `Retirement` and `2055` both do, so it passed a name ending in `and`. The
 * two questions are different: "does anything survive" and "does the survivor
 * END cleanly". The root cause was a narrower bug in the vocabulary — the
 * `common/collective` arm allowed a SLASH but not a SPACE, so `Common
 * Collective Trust Fund` was never matched whole and only its tail was cut —
 * and that is now fixed above, which turns those rows into correct strips
 * rather than dangling ones. This stays as the backstop, because the next
 * caption to be added will not have its space handled either. */
/* CASE-SENSITIVE, LOWERCASE ONLY, and that is not fastidiousness — the first
 * draft was `/i` and it REFUSED strips it should have made. `Global A Pooled
 * separate accounts` stopped stripping because the trailing `A` is a SHARE
 * CLASS and the pattern read it as an article; `VOYINTLHIDIVLOW VOL PORT IN
 * MUTUAL FUND SHARES` stopped for the same reason on `IN`. This is the v188
 * Affinity Plus decoy exactly — *a capital `A` may be a real designation and
 * case is the only signal* — arriving from the opposite direction, where the
 * cost is a refused repair rather than a damaged name.
 *
 * A genuine dangling connective in a filed name is lowercase (`Common and`,
 * `Shares of`); an all-caps tail is a designation. `Shares of registered
 * investment companies` in either case is still caught by the `keeps` screen
 * above, which was written for it. */
const DANGLING_TAIL = /\b(?:and|or|of|the|a|an|in|for|with|at|to|from|on|by|&)$/;
/* A share-class designation at the very front, and the same one at the very
 * end. Both are deliberately narrow: the code is 1-2 letters (optionally with
 * a digit, so "K6" and "IS" and "A1" are reachable), a 1-2 digit number, or an
 * R-code, and a bare single letter only counts when the word "Class" or "Cl"
 * introduces it — otherwise "T. Rowe Price …" would read its own initial as a
 * class. The head must be followed by a LETTER, so a name that is nothing but
 * a designation cannot match. */
/* WHICH FUND HOUSE DOES THIS STRING LEAD WITH? Used ONLY to detect a
 * CONTRADICTION between a holding's own name and its 4i identity cell — never
 * to find a house inside a name, which is where a house list goes wrong
 * (`Vanguard Wellington Admiral Fund` carries its SUB-ADVISER, and this record
 * has a measurement spoiled by exactly that). Anchored `^` on both sides for
 * the same reason.
 *
 * A trustee or platform LEADS with its own firm — `Fidelity Management Trust
 * Company`, `Voya Retirement Insurance and Annuity Company` — and that is
 * wanted: where such a cell sits in front of a rival house's fund, the prefix
 * is dragging the lookup to the wrong answer either way.
 *
 * The list is not a claim to completeness. A house it omits simply leaves the
 * row as it is today, so growing it can only ever be additive, and every row
 * the current list touches was read before it shipped. */
export const LEADING_HOUSE = [
  ["american funds", /^(?:the\s+)?american funds\b/i],
  ["american century", /^american century\b/i],
  ["tiaa", /^tiaa[- ]?cref\b|^tiaa\b/i],
  ["nuveen", /^nuveen\b/i],
  ["vanguard", /^vanguard\b|^vangaurd\b/i],
  ["fidelity", /^fidelity\b|^fid\b/i],
  ["t rowe price", /^t\.?\s*rowe\s+price\b/i],
  ["blackrock", /^blackrock\b/i],
  ["pimco", /^pimco\b/i],
  ["mfs", /^mfs\b/i],
  ["jpmorgan", /^jp\s?morgan\b|^jpmorgan\b/i],
  ["invesco", /^invesco\b/i],
  ["janus", /^janus\b/i],
  ["franklin", /^franklin\b/i],
  ["dodge & cox", /^dodge\s*&?\s*cox\b/i],
  ["putnam", /^putnam\b/i],
  ["allspring", /^allspring\b/i],
  ["pgim", /^pgim\b/i],
  ["schwab", /^(?:charles\s+)?schwab\b/i],
  ["state street", /^state street\b|^ssga\b/i],
  ["dimensional", /^dimensional\b|^dfa\b/i],
  ["columbia", /^columbia\b/i],
  ["hartford", /^(?:the\s+)?hartford\b/i],
  ["voya", /^voya\b/i],
  ["principal", /^principal\b/i],
  ["lord abbett", /^lord abbett\b/i],
  ["neuberger", /^neuberger\b/i],
  ["goldman", /^goldman\b/i],
  ["federated", /^federated\b/i],
  ["victory", /^victory\b/i],
  ["macquarie", /^macquarie\b/i],
  ["transamerica", /^transamerica\b/i],
  ["eaton vance", /^eaton vance\b/i],
  ["metwest", /^metropolitan west\b|^metwest\b/i],
  ["western asset", /^western asset\b/i],
];
export function leadingHouse(s) {
  const t = String(s || "").replace(/\*+/g, " ").replace(/\s+/g, " ").trim();
  if (!t) return null;
  for (const [k, re] of LEADING_HOUSE) if (re.test(t)) return k;
  return null;
}

/* A TRUSTEE'S CORPORATE STYLE, at either end of a welded name. See the arm in
 * cleanFiledName for the measurement and for why the remainder must keep its
 * house. Built from string fragments, so it is exercised on fixtures before it
 * is believed: a regex assembled from concatenated strings has no syntax check
 * until it runs.
 *
 * A HOUSE TOKEN IS REQUIRED IN FRONT OF THE DESIGNATOR. Without one the
 * designator alone matches the tail of real fund names — `… Collective
 * Investment Trust`, `… Group Trust` — and a bare `Trust` is a vehicle word
 * every CIT carries. The firm's name is what makes it a corporate style.
 *
 * The charter abbreviations (`FSB`, `N.A.`, `NA`, `FA`) are consumed as part of
 * the entity, because an earlier gate that stopped at the designator left `FSB`
 * standing in front of the fund. */
const ENTITY_STYLE_SRC = "(?:"
  + "(?:fiduciary|management|investment|institutional|national|savings|personal)?\\s*"
  + "(?:bank(?:ing)?(?:\\s*(?:&|and)\\s*trust)?|trust)\\s+(?:compan(?:y|ies)|co\\.?|n\\.?a\\.?)"
  + "|trust\\s+compan(?:y|ies)"
  + "|(?:investment\\s+)?(?:advisors?|advisers?|management|mgmt)\\s*,?\\s*(?:l\\.?l\\.?c\\.?|inc\\.?|llp|lp|ltd\\.?|plc)"
  + "|(?:insurance|annuity)\\s+(?:and\\s+annuity\\s+)?compan(?:y|ies)"
  + "|life\\s+insurance\\s+compan(?:y|ies)"
  + ")";
const ENTITY_TRAIL = "(?:\\s*,?\\s*(?:f\\.?s\\.?b\\.?|n\\.?a\\.?|f\\.?a\\.?))?";
/* THE STYLE ALONE, found anywhere; the SPAN is then grown leftward to a start
 * where `leadingHouse` answers. That is deliberate and replaces a single
 * assembled pattern whose firm clause was a 1-to-5-token wildcard: with the `i`
 * flag its `[A-Z]` matched lowercase too, so on `Fidelity 500 Index Fund
 * Fidelity Management Trust Company` the leftmost match ate `Index Fund` and
 * published `Fidelity 500`. A pin caught it.
 *
 * SO THE CONDITION IS SYMMETRIC: the entity span must LEAD with a house and
 * the remainder must LEAD with a house. The same shipped, anchored predicate
 * answers both, and requiring the firm's own name is what distinguishes a
 * trustee's corporate style from a CIT's vehicle words (`… Collective
 * Investment Trust`, `… Group Trust`). */
const ENTITY_STYLE_AT = new RegExp("\\b" + ENTITY_STYLE_SRC + ENTITY_TRAIL + "(?=\\s|$|[,;:.])", "gi");
const WORD_START = /(?:^|\s)\S/g;
/* LEADING WITH A HOUSE IS NOT THE SAME AS NAMING A FUND, and the whole-store
 * diff is what found the difference. Blue Cross Blue Shield (8,058 ppl) files
 * `Geode Capital Management Trust Company Fidelity Investments`, and stripping
 * the trustee leaves `Fidelity Investments` — a bare firm, which passes
 * `leadingHouse`, carries no fund, and dropped the row's 0.05. Linklaters' two
 * rows leave `Charles Schwab Investment` the same way. No shipped predicate
 * separates these: `hasNoFundIdentity` answers false on all of them, because
 * its filler vocabulary was built for rows with no house at all.
 *
 * So: beyond its own house the remainder must keep at least one word that is
 * not firm boilerplate. `VANGUARD FEDERAL` keeps `FEDERAL`, a product word, and
 * is a real fund (=VMFXX); `Fidelity Investments` keeps only `Investments`.
 * The vocabulary is deliberately tiny and closed — a wider one would start
 * refusing product words — and its live population is 3 rows / 8,390 ppl, all
 * of them real fee losses this arm would otherwise cause. */
/* `fiduciary` IS BOILERPLATE AND ONLY THE PAGE SAID SO. Every other gate
 * passed — 16 pins, five measured guards, a whole-store diff reading 0 tickers
 * lost and 0 swapped, the twin agreeing on all 1.73M rows, smoke-test green —
 * and regenerating the crawlable pages showed one row publishing `Vanguard
 * Fiduciary` on $70,452,841 where the filing says `Vanguard Fiduciary Vanguard
 * Retirement Savings Trust Company`. That row is ITSELF a welded name, so the
 * arm removed the trailing entity and left the leading fragment of one.
 * `Fiduciary` is a word no fund is named after. A diff cannot tell a wanted
 * change from an unwanted one; only reading the output can. */
const FIRM_GENERIC = /^(?:investments?|advisors?|advisers?|management|mgmt|fiduciary|capital|group|company|co|companies|trust|trustee|asset|assets|financial|services|service|institutional|inc|llc|na|fsb|the|of|and|&)$/i;
function beyondHouse(rest) {
  const t = String(rest || "").replace(/\*+/g, " ").replace(/\s+/g, " ").trim();
  for (const [, re] of LEADING_HOUSE) {
    const m = re.exec(t);
    if (!m) continue;
    return t.slice(m[0].length).split(/[\s,;:.()\-–—/]+/).filter(Boolean).some((w) => !FIRM_GENERIC.test(w));
  }
  return false;
}
const DOUBLED_CLASS_HEAD = /^(?:(?:class(?:es)?|cl)\b[\s.\-]*([a-z]{1,2}\d?|\d{1,2}|r-?[1-9])|(r-?[1-9]))\b[\s.,()\-]+(?=[A-Za-z])/i;
const DOUBLED_CLASS_TAIL = /(?:\b(?:class(?:es)?|cl)\b[\s.\-]*([a-z]{1,2}\d?|\d{1,2}|r-?[1-9])|\b(r-?[1-9]))\s*$/i;
const classCode = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
/* A PUBLISHED NAME THAT CONTAINS ITSELF TWICE — 2026-10-04.
 *
 * Automatic Data Processing (46,258 participants) publishes `Northern Trust
 * S&P 500 Index Fund NORTHERN TRUST S&P 500 INDEX FUND` on $1,512,757,156,
 * 21.3% of its menu, and six more rows of the same shape; Illinois Auto Truck
 * publishes `Vanguard Target Retirement 2045 Vanguard Target Retirement 2045`.
 * The auditor's schedule carries the holding's name in two columns and the
 * parser reads the row as one string.
 *
 * THIS IS MORE THAN LEGIBILITY, which is why it is a repair and not a shrug:
 * the resolvers read the NAME, so which half they reach decides the published
 * share class. Redlands Christian's `T. Rowe Price Retirement 2030 Fund T. Rowe
 * Price Retirement 2030 Fund-I Class` publishes TRFHX, the I class, out of the
 * second copy, while Giorgio Armani's identically-shaped 2045 row publishes
 * ~TRRKX — a COMPARABLE of the investor class — out of the first. One filed
 * shape, two answers, one of them an approximation where the filing states the
 * class exactly.
 *
 * THE CONDITION IS SELF-EVIDENCE AND NOTHING ELSE: the name must OPEN on a
 * phrase whose normalised form is a prefix of everything after it. No
 * vocabulary, no resolver, no registry. Three protections, each with a case
 * where it is the only one:
 *   - at least THREE words and TEN normalised characters, so `Class A Class A
 *     Shares` and a repeated single word are refused;
 *   - the repeat runs FORWARD from the start of the remainder, so two members
 *     of one series cannot match — the vintage or class characters fall inside
 *     the compared span (`…2045` vs `…2050`), which is what keeps `Mfo Depot
 *     Lifepath 2030 Mfo Depot Lifepath 2045` intact;
 *   - the longest candidate is tried first, so the split lands between the two
 *     copies rather than inside one.
 * A PREFIX TEST IS THE SHAPE THIS RECORD WAS BURNED BY ONCE (it read 7,315
 * artifacts as the same-menu orientation witness). What is different here is
 * that both halves are inside ONE name: the evidence is not drawn from a
 * sibling row that the same damage could have produced.
 *
 * WHICH COPY SURVIVES IS DECIDED BY EVIDENCE, NOT BY POSITION. When the
 * boundary falls INSIDE a token the second copy carries more characters than
 * the first, so it is the more specific spelling and it wins — that is the
 * T. Rowe `Fund-I Class` case, and taking the first copy there would publish
 * the investor class's comparable in place of the stated class. When the
 * boundary is clean and exactly one copy is ALL CAPS, the mixed-case copy wins,
 * because the schedule's second column is upper-cased boilerplate — that is
 * ADP, where keeping the second copy would shout `NORTHERN TRUST S&P 500 INDEX
 * FUND` at 46,258 readers. Otherwise the second copy plus whatever trails it
 * wins, which is where a share class sits when one is present.
 *
 * ACCEPTED RESIDUE, named rather than rounded away: an INTERLEAVED duplication
 * (`State Street Global All Cap State Street Global All Cap Equity Equity`,
 * Lubrizol) collapses its leading phrase and leaves `Equity Equity`, because
 * the trailing repeat is below the three-word floor. Lowering the floor to
 * reach it is a separate measurement, not a free widening.
 *
 * MEASURED whole-store before shipping, through the page's own renderer: 224
 * rows / 129 plans / 232,595 participants / $5,036,058,631, with ticker,
 * asterisk and fee moving on ZERO rows and the shown type on one. */
const REPEAT_NORM = (t) => String(t).toLowerCase().replace(/[^a-z0-9]+/g, "");
const ALL_CAPS = (t) => /[A-Z]/.test(t) && t === t.toUpperCase();
export function collapseSelfRepeat(name) {
  const s = String(name == null ? "" : name).trim();
  const w = s.split(/\s+/).filter(Boolean);
  for (let k = Math.floor(w.length / 2); k >= 3; k--) {
    const first = w.slice(0, k).join(" ");
    const a = REPEAT_NORM(first);
    if (a.length < 10) continue;
    const rest = w.slice(k);
    if (!REPEAT_NORM(rest.join(" ")).startsWith(a)) continue;
    let acc = 0, j = 0;
    for (; j < rest.length; j++) {
      const n = REPEAT_NORM(rest[j]);
      if (acc + n.length > a.length) break;
      acc += n.length;
      if (acc === a.length) { j++; break; }
    }
    if (acc !== a.length) return rest.join(" ");
    const second = rest.slice(0, j).join(" ");
    const trail = rest.slice(j).join(" ");
    const keep = ALL_CAPS(second) && !ALL_CAPS(first) ? first : second;
    return (keep + (trail ? " " + trail : "")).trim();
  }
  return null;
}
/* A PAGE BREAK'S CAPTION, THE LEADING POSITION — 2026-10-01.
 *
 * The auditor repeats a caption at the top of the next page and the first
 * holding under it absorbs the whole line, so the fund's name arrives wearing
 * a word no fund is named: `continued Vanguard Target Retirement Fund 2045`,
 * `Continued Fidelity Freedom Index 2030 Fund Investor Class`, `(Continuation)
 * PIMCO RealPath Blend 2055 INST`, `Continued from previous page Principal
 * LifeTime Hybrid 2035 Fund`.
 *
 * The 2026-09-28 fix closed this class in the TRAILING position (the `contM`
 * arm below, `^.*?\(continued\)`), and the leading-parenthetical arm requires
 * the string to OPEN with a vehicle TYPE. Both are blind to these rows BY
 * CONSTRUCTION, not by oversight — *a fix for one POSITION of a class is not a
 * fix for the class*, which this record has now met at the trailing OCR
 * residue, the issuer column and here.
 *
 * NO VOCABULARY BEYOND THE CAPTION WORD. Every leading token in the whole
 * population was counted rather than imagined: `Continued` 16, `continued` 14,
 * `Continuation` 2, `Cont'd` 1. A bare `Cont.` is DELIBERATELY ABSENT and the
 * store says why — `NYL INSURANCE IPG GRP ANNUITY CONT.` is a group annuity
 * CONTRACT at 42.7% of its menu, so that abbreviation collides with a real
 * word. `continucd`, the OCR spelling the trailing arm carries, leads 0 rows
 * and is left out for the same reason a guard that cannot fire is decoration.
 *
 * THE PAGE REFERENCE IS STRIPPED IN A SECOND, SEPARATE STEP AND THAT IS NOT
 * STYLE. Written as one regex with the reference optional, the engine
 * BACKTRACKS when the lookahead fails at the end of `Continued from page 10`:
 * it gives the reference back, matches the caption word alone and publishes
 * `from page 10` as the holding's name. That is this record's own
 * "an optional group at the end of an anchored alternation is a silent SECOND
 * anchor position", and sequential replaces have no such second position. */
export const PAGE_BREAK_LEAD = /^\(?\s*(?:continu(?:ed|ation|ing)|cont['’]d)\b/i;
const PAGE_BREAK_SEP = /^\s*\)?\s*(?:[-–—:,;.]\s*)?/;
const PAGE_BREAK_REF = /^(?:from|on)\s+(?:the\s+)?(?:previous|preceding|prior|last|next)?\s*pages?(?:\s+\d{1,3})?\s*\)?\s*(?:[-–—:,;.]\s*)?/i;
/* A PAGE-CARRY SUBTOTAL LINE. `lib-4i.mjs:3021` already drops these at parse
 * time — `/^(balance |carried |brought )?forwards?(\s+(from|to)\b.*)?$/` — and
 * that rule's own comment records what it is for: "the same-name dedup SUMS
 * the distinct per-page values into a fake nine-figure fund". It is anchored
 * on the carry word coming FIRST, so the three-word spelling `Balance Brought
 * Forward` is outside it and survives into the store. This is the same fact
 * asked the other way round — the carry word LAST, with at most two tokens in
 * front of it — which is exact on this store: over all 1,724,078 published
 * rows the phrase `brought forward` / `carried forward` appears 10 times and
 * not one of the ten is a fund. No leading vocabulary is needed and none is
 * carried, which is why `Assets- Brought Forward` and `Mutual Funds Brought
 * Forward` are reached without naming either noun. */
export const CARRIED_FORWARD = /^(?:\S+\s+){0,2}(?:brought|carried)\s+forwards?(?:\s+(?:from|to)\s+(?:the\s+)?(?:previous|preceding|prior|next)?\s*pages?(?:\s+\d{1,3})?)?$/i;
/* The same column glued to the FRONT with a separator — "Mutual Fund -
 * Fidelity 500 Index Fund", "Separate Account - JPMorgan Equity Income
 * Fund R6" (Texas Health Resources, 13:1xZ draw 2026-09-18). Sized on the
 * v138 store: 733 plans / 1,464,661 ppl / 3,191 rows; the separator is
 * required so "Stable Value Fund" alone is never touched.
 *
 * WIDENED 2026-09-27, and the diagnosis is v188's one level up: the
 * VOCABULARY was right and the CONNECTIVE was the hole. Only `- – :` were
 * allowed, so the three forms the store actually uses all escaped —
 * "MUTUAL FUNDS SHARES / UNITS Fidelity 500 Index" (the column caption, no
 * separator at all), "Mutual Funds, at Fair Value Schwab S&P 500 Index" (a
 * measurement basis) and "Money Market SHARES Fidelity Government Money
 * Market Fund". Measured through this function on the v188 store: 169 rows /
 * 139 plans / 174,852 participants read better, 0 rows gain a ticker and
 * 0 LOSE one, so it is an honesty fix and not a fee-coverage one.
 *
 * `invested in` was in the first draft and is DELIBERATELY ABSENT: it wins
 * one row ("Pooled Separate Account invested in Amerfds 2030 Trgt Date")
 * and DAMAGES three, where the filed name really is "Index Fund invested in
 * stocks included in the S&P 500" and the vehicle word is part of it.
 * Printing every distinct before/after is what showed that; a count would
 * have shipped it.
 *
 * Named residue, measured not guessed: 1 row keeps a doubled caption
 * ("MUTUAL FUNDS, AT FAIR VALUE SHARES / UNITS Vanguard Target Ret 2030
 * Inst" → "SHARES / UNITS Vanguard …", because the remainder no longer
 * STARTS with a type word) and 5 keep a leading accounting parenthetical
 * ("(Net Asset Value Practical Expedient) MetLife Stabl"). Both are strictly
 * better than before and neither is widened for without its own measurement.
 * The `I` in the shares/units alternation is OCR's reading of the slash. */
const TYPE_PREFIX = /^(?:mutual funds?|common[\/ ]?collective (?:trust )?funds?|collective (?:investment )?trusts?(?: funds?)?|common[\/ ]?collective trusts?|pooled separate accounts?|separate accounts?|registered investment compan(?:y|ies)|stable value(?: funds?)?|money market(?: funds?)?|guaranteed (?:investment|interest) contracts?|target date funds?|index funds?)(?:\s*[-–:]\s+|[,;]?\s*(?:at\s+)?fair value[,;]?\s+|\s*(?:shares?|units?)(?:\s*[\/&I]\s*(?:shares?|units?))*\s*[-–:,]?\s+)(?=\S)/i;
const KERN_WORDS = new Set(("vanguard fidelity blackrock schwab invesco pimco putnam principal prudential nuveen tiaa cref dodge cox american funds franklin templeton mfs jpmorgan jp morgan jpmcb wellington wells fargo allspring columbia janus henderson federated hermes goldman sachs galliard artisan harbor oakmark loomis sayles neuberger berman dimensional dfa ishares spdr state street ssga northern trust voya empower lincoln transamerica john hancock massmutual nationwide metlife great west securian tiaa-cref " +
  "target retirement trust trusts fund funds index institutional instl inst admiral adm investor inv shares share class cl plus select premium growth value blend core total stock market mkt intl international global emerging markets developed world equity equities bond bonds fixed income high yield short term intermediate long treasury government govt inflation protected securities tips real estate reit mid cap small large extended balanced moderate conservative aggressive money mutual common collective commingled pooled separate account accounts stable capital preservation guaranteed interest contract contracts insurance company general portfolio portfolios lifepath lifecycle freedom smartretirement retire strategic allocation dividend appreciation opportunities opportunity health sciences technology sector explorer windsor primecap wellesley star " +
  "interests option options unit units series contributions participant participants loans notes receivable " +
  "us u.s. ii iii iv r6 r5 r4 r3 r2 r1 k6 k a b c d e f g h i j l m n o p q r s t u v w x y z z6 z3 cit cits ret rtmt idx fd tr blnd").split(/\s+/));
export function despaceKerned(name) {
  const toks = name.trim().split(/\s+/);
  // the kerning signature is a word broken INSIDE: a lowercase-initial
  // fragment after the first token ("V an", "Targe t", "Fu nd"). Real names
  // start their words with capitals, apart from a few connectives.
  const STOP = /^(?:of|and|the|ex|at|in|for|to|on|by|de|du|la|le|von|van|di|del|der|et|a|an)$/;
  const fragList = toks.slice(1).filter((t) => /^[a-z]{1,7}$/.test(t) && !STOP.test(t));
  const frags = fragList.length;
  // a lowercase-initial token that is itself a whole word ("Fidelity mid cap
  // index") is a lowercase filing, not a kerned one; at least one fragment
  // must be a piece of nothing
  const broken = fragList.filter((t) => !KERN_WORDS.has(t)).length;
  const short = toks.filter((t) => /^[A-Za-z]{1,2}$/.test(t)).length;
  if (toks.length < 3 || broken < 1 || frags < 2 && short < 3) return name;
  const flat = name.replace(/\s+/g, "");
  const lower = flat.toLowerCase();
  const out = []; let i = 0; let shortSegs = 0;
  while (i < lower.length) {
    let best = 0;
    for (let len = Math.min(18, lower.length - i); len >= 1; len--) {
      const w = lower.slice(i, i + len);
      if (KERN_WORDS.has(w) || /^(?:19|20)\d\d$/.test(w) || (len >= 2 && /^\d+$/.test(w) && !/^\d/.test(lower[i + len] || ""))) { best = len; break; }
    }
    if (!best) return name;
    if (best <= 2 && !/^\d+$/.test(lower.slice(i, i + best))) shortSegs++;
    out.push(flat.slice(i, i + best)); i += best;
  }
  if (shortSegs > Math.max(2, out.length * 0.25)) return name;
  // two single letters in a row ("L L", "A L") is a share-class fragment
  // the word list could not read, never a repaired word
  for (let k = 1; k < out.length; k++) if (out[k].length === 1 && out[k - 1].length === 1 && !/\d/.test(out[k] + out[k - 1])) return name;
  return out.map((w) => /^[a-z]/.test(w) ? w[0].toUpperCase() + w.slice(1) : w).join(" ");
}
export function cleanFiledName(name) {
  let s = String(name).trim();
  /* A CONTROL CHARACTER WHERE A SPACE BELONGS — 2026-10-01 (14:0xZ).
   *
   * A broken PDF font shifts its whole text run by +29, so the SPACE (0x20)
   * arrives as 0x03. The browser renders NOTHING for a control character, so
   * the reader sees `VanguardTargetRet2065` where the filing says `Vanguard
   * Target Ret 2065` — 128 rows / 32 plans / 139,537 participants, Fiserv
   * (39,782), Philips (29,491), Arthur J. Gallagher (29,477), Lifespan /
   * Brown University Health (19,490).
   *
   * THIS IS NOT A DECODE AND MAKES NO CLAIM, and my first predicate's own
   * refusals are what said so. The LETTERS in these rows were usually never
   * shifted: of 114 rows carrying the shifted space, 100 are ordinary legible
   * names (`Fidelity<0x03>Investments<0x03>Money<0x03>Market`) whose spaces
   * alone came through as 0x03, and decoding the whole string gives
   * `cidelity fnvestments joney j~rket`. So the repair is the one the SHAPE
   * licenses on its own — a control character is not part of a name — and
   * restoring the ciphered WORDS is a separate claim needing a whole-store
   * witness.
   *
   * THE ONE THING THAT COULD GO WRONG IS A CONTROL CHARACTER INSIDE A WORD,
   * where a space SPLITS what should be WELDED (v519's shape), AND IT DOES
   * NOT HAPPEN HERE — asked of the whole population rather than by eye: of
   * 217 control characters with a letter on BOTH sides, the joined form is a
   * published word while the left fragment is not on 0. The test fires on a
   * crafted `Vangua<0x03>rd`, so the zero is the data's and not the query's.
   *
   * The class is every C0 character and DEL, not the +29 image of a space,
   * because the shift varies (`Vanguard Target Retirement Fund<0x02>2050`
   * is the same defect one code point along) and because a control character
   * cannot be part of a name whatever produced it. On this store that reaches
   * 0x03 (539), 0x11 (519, the ciphered `.` of a dot leader), 0x02, the
   * ciphered digits 0x13-0x1c, and nothing else; tab, newline and carriage
   * return occur 0 times and are folded in for the same reason.
   *
   * It runs FIRST, because every arm below reasons about word boundaries and
   * a control character hides one. The composition is where it pays: a
   * trailing `Collective Trust<0x03>` becomes a suffix `TYPE_SUFFIX` already
   * knows, and `… Fund<0x02>2050 Mutual funds` loses its vehicle caption. */
  s = s.replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s{2,}/g, " ").trim();
  s = s.replace(/^[—–-]+\s*/, "");
  /* AN EMPTY PARENTHETICAL — a column that held nothing, captured as bare
   * parens and welded to the name. 2026-10-03 (05:3xZ draw).
   *
   * Parker Hannifin (42,434 ppl) publishes `Parker Stock Match Fund ( )` at
   * 23.4% of its menu — $2,054,809,000 — and `Parker Stock Fund ( )` at 7.3%.
   * Zions Bancorporation (14,957 ppl) carries it on fourteen rows at once:
   * `500 INDEX INSTITUTIONAL ( )`, `TARGET RETIREMENT 2040 ( )`. Whole class:
   * 1,161 rows / 63 plans / 138,083 participants / $8,915,691,142.
   *
   * PURELY LEGIBILITY, AND PRICED AS SUCH: measured through
   * fundTickerInfo(name, type) and fundER(name) — the calls app.js:1897 makes —
   * stripping it gains 0 tickers, loses 0, changes 0, and the same three zeros
   * for fees, across all 1,161 rows. The resolvers already normalise the
   * punctuation away, so the parens were never the reason these rows carry no
   * symbol; the abbreviated names are. The row reads as a fund instead of as
   * something broken, and nothing else about it moves.
   *
   * THE PRICE TOOK THREE ATTEMPTS AND EVERY ONE REPORTED ON THE QUERY, which
   * is why the control is written into the harness rather than trusted:
   * `lookupTicker(name)` with one argument returns null for EVERY name,
   * `Fidelity 500 Index Fund` included; then the field was read as `.ticker`
   * where fundTickerInfo returns `{tk}`. Both produced a tidy 0/0/0 that meant
   * nothing. A positive control that PRINTS what it got — `{"tk":"FXAIX"}`,
   * `0.015` — is what caught both. */
  s = s.replace(/\s*\(\s*\)\s*/g, " ").replace(/\s{2,}/g, " ").trim();
  /* A CROSS-REFERENCE TO ANOTHER PAGE OF THE FILING, PUBLISHED INSIDE THE FUND
   * NAME — 2026-10-10, found by narrowing the 09:07 draw's em-dash class.
   *
   * International Business Machines publishes `Expanded Choice - Select Funds
   * (refer to Exhibit A - investments)` at 15.5% of its menu —
   * $9,855,559,291 — and `Total Stock Market Index (refer to Exhibit P -
   * investments)` at 15.4%, `Total International Stock Market Index` at 9.5%,
   * `Small/Mid-Cap Stock Index`, `Inflation Protected Bond`, `Total Bond
   * Market`. Whole class: 32 published+served rows / 8 plans / 206,458
   * participants / $40,951,582,144 — the largest display defect by dollars on
   * this record, and 31 of the 32 publish no ticker and no fee.
   *
   * The parenthetical is DOCUMENT FURNITURE: it points at an exhibit the
   * reader of this page cannot see, so it carries no information here and is
   * the same family as the page numbers and running headers `quoteTrim`
   * already strips from a published quote. The NAME around it is real, which
   * is why this is a strip and not a qualification — *a row that names nothing
   * and a row carrying furniture beside its name are two classes.*
   *
   * ANCHORED ON THE REFERRING VERB, never on a bare parenthetical: an
   * ordinary parenthetical is the shape of almost every correct fund name
   * (`PIMCO International Bond Fund (U.S. Dollar-Hedged) Ins`), and this
   * record has already discarded a 2,720-row class for keying on "a closing
   * paren with two words after it". So the vocabulary is `refer to`, `see`,
   * `as shown in`, `as described in` — a pointer to elsewhere in the document.
   *
   * THE ONE PRICED ROW IS CHECKED RATHER THAN ASSUMED: Farmers Group's
   * `Farmers Active Stable Value Fund (See Detail)` publishes 0.35 on
   * $238,423,816 — itself a named instance of the owner-gated fabricated
   * stable-value fee — and the strip must leave that fee exactly where it is,
   * because withdrawing it is the OWNER's decision and not this arm's. */
  s = s.replace(/\s*\((?:please\s+)?(?:refer\s+to|see|as\s+(?:shown|described)\s+in)\b[^)]*\)/gi, " ")
    .replace(/\s{2,}/g, " ").trim();
  // OCR noise glued to the END: stray quote / trademark glyphs ("Trust II
  // CIT ”", "R6 ™", "…Fund®" — 674 plans / 1.08M ppl / 4,454 rows on the
  // v138 store) and a footnote letter or fragment after a share-class or
  // vintage token ("CREF Stock R1 a", "Trust Il CIT ial" — 881 plans /
  // 839k ppl / 6,383 rows). 14:1xZ draw 2026-09-18 (Weis Markets, Mutual
  // Trading). The fragment strip needs the class token before it, so a
  // real name's last word is never taken.
  s = s.replace(/[\s\-–]*[”“"'’‘™®©]+\s*$/, "").trim();
  // the recordkeeper's PROVIDER-DIRECTORY fields welded onto the fund name:
  // an expense ratio or unit price, then a literal ADDRESS label and the
  // firm's street address. UnitedHealth Group (274,906 participants) is the
  // whole of it on the v184 store — 92 of its 95 rows read
  // "AMERICAN NEW PERSPECTIVE CLASS F1 0.37% USADDRESS 3500 WISEMAN BLVD SAN
  // ANTONIO TX 7825143". Anchored on the ADDRESS LABEL, never on the number:
  // a bare percentage in a holding name is usually a real COUPON ("REPUBLIC
  // OF COLOMBIA 7.75%", "GNMAII POOL MA5878 5.0%", 266 rows / 122 plans that
  // must not be touched), and a bare dollar figure is usually a real par
  // value ("EQUINIX INC COM PAR $0.001"). 2026-09-27.
  const am = s.match(/\s*(?:\$\s?\d[\d,]*(?:\.\d+)?|\d{1,3}(?:\.\d+)?\s*%)?\s*\b[A-Z]{0,3}ADDRESS\b[\s\S]*$/);
  if (am) { const rest = s.slice(0, am.index).trim(); if (rest.split(/\s+/).length >= 2 && /[A-Za-z]{3}/.test(rest)) s = rest; }
  // a stray double-quote glyph the scan left in the name. Two arms, both
  // anchored so a REAL quoted share class survives — Vanguard's
  // "Institutional \"Plus\" Shares" (FMC Corporation) is the control, and it
  // is untouched because the last quote there is followed by a whole word.
  // (a) a LEADING quote: "“Vanguard Federal", "\"EQ/GAMCO Small Company
  // Value" — 56 rows. (b) a quote near the END followed only by OCR crumbs
  // that are not a word: "Fidelity 500 Index “«", "…2065 Trust IX ”",
  // "…Index Plus “x", "BNY Mellon Bond Market Index Shares ” i" — the
  // trailing strip above only reaches the ones with nothing after them.
  // SINGLE quotes belong in (a) too, added 2026-09-29. The arm read `[”“"]`
  // — double quotes only — while the TRAILING strip seven lines above has
  // always carried the wider `[”“"'’‘™®©]`. One character class, one arm, and
  // its own sibling disagreed with it. 229 published rows / 143 plans /
  // 138,737 participants / $474,878,302 reached readers with a leading `‘`
  // or `'` glued to a real fund name: `‘Vanguard 500 Index Fund Admiral
  // Shares`, `'VANGUARD EXPLORER ADM`, `‘American Funds New Perspective R6`.
  // All 205 distinct transformations were read and not one removes anything
  // but the quote. (The store count is 282; 50 were already repaired here,
  // which is why the reader-facing number is the smaller one.)
  const qlead = s.replace(/^[”“"'’‘`´]+\s*/, "").trim();
  // …unless a CLOSING quote follows with more name after it — that is a
  // balanced quoted term the filer meant ("\"Brokerage\" Account"), the same
  // shape as the FMC control, and it is left exactly as filed.
  // THE BALANCED TEST STAYS ON DOUBLE QUOTES ONLY, and that is deliberate
  // rather than an oversight: an interior apostrophe is ordinary inside a
  // real name, so asking it of single quotes would refuse correct repairs —
  // `‘TIAA Access Lifecycle 2050 T'4` is the pinned case, and it keeps its
  // interior `'` because this strip is anchored `^`. Measured whole-store:
  // no filed name opens a BALANCED single-quoted term, while the residue's
  // two balanced cases are both double-quoted and both still refused.
  if (qlead !== s && !/["”].*\S/.test(qlead) &&
      qlead.split(/\s+/).length >= 2 && /[A-Za-z]{3}/.test(qlead)) s = qlead;
  for (let pass = 0; pass < 2; pass++) {
    const qi = Math.max(s.lastIndexOf("“"), s.lastIndexOf("”"), s.lastIndexOf('"'));
    if (qi <= 0) break;
    const tail = s.slice(qi + 1);
    // crumbs only: at most three characters, and NO CAPITAL — an uppercase
    // tail can be a real share class ("Hotchkis Wiley High yield \"Z") and
    // those rows are left exactly as filed rather than guessed at.
    if (tail.length > 3 || /[A-Z]/.test(tail) || /[a-z]{4}/.test(tail)) break;
    const rest = s.slice(0, qi).replace(/[\s\-–]+$/, "").trim();
    if (!(rest.split(/\s+/).length >= 2 && /[A-Za-z]{3}/.test(rest))) break;
    s = rest;
  }
  s = s.replace(/\b(R\d|[A-Z]|I{1,3}|CIT|Adm|Inv|Instl?|Fund|Trust|Class)\s+[a-z]{1,3}$/, "$1");
  // a trailing footnote marker "(1)" (FMR's whole 119-row menu, 560 plans /
  // 1.95M ppl / 7,503 rows) and a trailing column bar, which is OCR's
  // reading of a share-class "I" ("PGI CIT US REIT Tier |", "TRP BLUE CIP
  // GRTH |" — 743 plans / 683k ppl / 1,723 rows), repaired to the letter
  // rather than deleted so the class survives. 15:1xZ draw 2026-09-18.
  /* GREEDY as of 2026-10-03, because a filing can carry TWO markers and
   * stripping one leaves the other reading as a SHARE CLASS. Procter & Gamble
   * (42,915 ppl, $364,753,511, 6.7% of its menu) files
   * `… Russell 2000 Index SMA(2)(4)` and the page published `… SMA(2)`;
   * Santander (19,451 ppl, $131,882,823, 10.3%) files
   * `… Common Class Q(2)(3)` and published `… Class Q(2)`, which is
   * indistinguishable from a designation. *One of two markers is worse than
   * none or both.*
   * Whole-store population of published names still ending in a marker after
   * the full clean: THREE. The third is George Industries' `) (1)` (154 ppl),
   * already qualified by `hasNoFundIdentity` as naming no specific fund, so
   * the shippable set is those two. */
  s = s.replace(/(?:\s*\(\s*\d{1,2}\s*\))+\s*$/, "").trim();
  /* a trailing footnote marker spelled with a PLUS, optionally carrying the
   * footnote's letter — `Vanguard Extended Market Idx | +e`, `Vngrd Wlsly Inc
   * Adml +`, `Fidelity 500 Index +a`. Found by the 23:5xZ participant-weighted
   * draw on Mercy Health (12,559 ppl), 9 of whose 61 otherwise-immaculate rows
   * carry it. 233 rows / 132 plans / 98,067 ppl with a space before the plus,
   * and all 35 distinct names beyond `+e` were read — every one a real fund
   * name plus a footnote letter.
   *
   * TWO ARMS, because the SPACE is load-bearing and a store-wide test said
   * otherwise. `\S+$` (no space) covers 710 further rows, and the shipped
   * "does the remainder stand ALONE elsewhere?" discriminator returned **388 of
   * 388** for them — false unanimity, the 2026-09-28 "a gate fed by its own
   * mistakes" trap in the name column, because a stem stands alone only because
   * another row carries the same damage. Reading the residue settles it: a
   * trailing plus with no space is often REAL — `VANGUARD EXT MKT INDX-INST+`
   * is Institutional **Plus**, a different and cheaper share class than
   * `-INST`; `iShares TR 20+` is the 20+ Year Treasury ETF; `Target Date 2065+`
   * and `GOVERNMENT NAT MTG AS REMIC PT SOFR30A+` likewise. So the no-space arm
   * fires only after a POSITIVE vocabulary of what the plus may FOLLOW — a
   * vehicle noun — which reaches 635 rows / 153 plans / 95,032 ppl (the
   * Principal `Sep Acct+` / `... R6 Fund+` family) and refuses 75, of which the
   * four named above are the ones that matter. The ~65 refused markers
   * (`Vngrd Fin Indx Adml+`, `Gabelli Gold Inst+`) are left exactly as filed:
   * no purely syntactic rule separates them from `INST+`, and a wrong share
   * class is worse than a visible marker.
   *
   * BOTH ARMS RUN BEFORE THE COLUMN-BAR REPAIR BELOW, and the order is
   * load-bearing: with the plus stripped afterwards, `Vanguard Extended Market
   * Idx | +e` ended at `Vanguard Extended Market Idx |` — the bar arm could not
   * match a string ending in `+e`, and stripping the marker then left the bar
   * with nothing to repair it. Stripped first, the same row recovers its share
   * class as `Vanguard Extended Market Idx I`. Caught by probing the arm rather
   * than by any count: 861 rows changed and this one was inside them. */
  s = s.replace(/\s+\+{1,3}\s*[a-z]?\s*$/i, "").trim();
  s = s.replace(/((?:sep(?:arate)?\s*acc?t|separate\s+accounts?|\bSA|funds?|trusts?|accounts?|portfolios?))\+{1,3}\s*$/i, "$1").trim();
  /* THE COLUMN RULE, WITNESSED BY THE TYPE LABEL BEHIND IT — 2026-10-03.
   *
   * The arm below reads a TRAILING bar as the letter I and publishes a share
   * class. It cannot reach a bar that has a vehicle type label behind it, so
   * 126 rows / 74 plans / 47,289 participants / $156,499,306 publish the bar
   * itself: `T.Rowe Blue Chip Growth | Fund`, `Principal LargeCap Growth |
   * Separate Account-Z`, `DFA US Targeted Value | Fund`.
   *
   * I FIRST GUESSED THE SHIPPED ARM WAS INVENTING SHARE CLASSES HERE, AND
   * READING ITS OWN POPULATION REFUTED THAT. Of the 1,737 rows where its " I"
   * reaches the page, 1,444 have no designation word before the bar — and they
   * are overwhelmingly REAL bare-`I` classes: `THE VANGUARD TARGET RETIRE 2045
   * TRUST I` (a genuine CIT series name), `Dodge & Cox Stock Fund - I`,
   * `MassMutual Mid Cap Growth I`, `EV Small Cap Fund I`, `T. Rowe Price US
   * Equity Research Fund I`. Houses do name a class bare. So the arm stays and
   * this one does not widen its claim.
   *
   * WHAT THIS POPULATION HAS THAT THE ARM'S DOES NOT IS A POSITIONAL WITNESS.
   * The 4i schedule is a TABLE; a bar with the TYPE column's own label behind
   * it is the rule between the two columns, not a glyph in the name. So the
   * bar becomes a SPACE and the tail is left for TYPE_SUFFIX below to judge
   * with its own tested vocabulary — using the shipped guard rather than
   * duplicating its judgement.
   *
   * JOIN, NOT TRUNCATE, AND THE DATA CHOSE IT: 87 of the 126 tails are the
   * single word `Fund`, which is the FUND'S OWN last word (`JPMorgan US Equity
   * Fund`, `DFA US Targeted Value Fund`), and cutting at the bar would have
   * taken it. Four more carry `Separate Account-Z`, where `-Z` is the share
   * class. *A dangling remainder is worse than the name it replaced.*
   *
   * NAME-ONLY, measured through renderRow on all 126 with the argument the page
   * passes: 0 tickers and 0 fees move under either candidate. (The first run of
   * that measurement passed tab `"all"` where the page passes `"menu"`, which
   * gates the resolver, so every row read `tk —` — a both-sided zero across a
   * whole population, caught by a positive control and not by the count.)
   *
   * The two rows whose head ENDS in a designation word keep the letter reading,
   * because that is what the arm below already does for the 293 rows of that
   * exact shape it can reach (`Dodge & Cox Stock Fund Class I`): Mubea's
   * `Fidelity Advisor Strategic Income Fund Class | Mutual fund` would
   * otherwise clean to a dangling `... Fund Class`.
   *
   * EXACTLY ONE BAR, AND THE SECOND BAR IS WHY — caught after this shipped, by
   * regenerating the crawlable pages and reading a row the diff had not
   * flagged. A column rule is ONE vertical line. A DOUBLED bar is the Roman
   * numeral **II**: Lacroix Precision Optics files `9,186.596 shares Vanguard
   * Windsor || Fund` and the greedy version published `Vanguard Windsor Fund` —
   * VWNDX, where the filing says Windsor **II**, VWNFX, a DIFFERENT FUND. Seven
   * Windsor rows in this store carry `||` or `I|` for that numeral, and the
   * discriminator is witnessed by our own data: `Variable Annuity Life
   * Insurance Co. | Vanguard Windsor II` has a SINGLE bar as the genuine column
   * rule and spells the `II` out. Requiring one bar keeps 123 of the 128 rows
   * and leaves 5 (4 plans / 6,697 ppl / $1,448,016) exactly as filed — still
   * showing a bar, which is visibly an artifact rather than a false fund name.
   * Reading those five AS `II` is an inference, not a sourced fact, so it is
   * queued for a registry witness and not taken here. *A floor of one lets a
   * single damaged row license the same damage elsewhere* — here a greedy
   * quantifier would have licensed a wrong fund name. */
  {
    const cr = s.match(new RegExp("^([\\s\\S]*[A-Za-z0-9)])\\s*\\|\\s*((?:"
      + "(?:pooled\\s+)?(?:common[\\s/]*)?(?:collective\\s+)?(?:investment\\s+)?"
      + "(?:trusts?|funds?|accounts?|compan(?:y|ies))"
      + "|mutual\\s+funds?(?:\\s+shares?)?|(?:pooled\\s+)?separate\\s+accounts?"
      + "|common[\\s/]*collective\\s+trusts?|collective\\s+(?:investment\\s+)?trusts?"
      + "|registered\\s+investment\\s+compan(?:y|ies)|variable\\s+annuity\\s+contracts?"
      + "|money\\s+market\\s+funds?|stable\\s+value\\s+funds?|insurance\\s+general\\s+accounts?"
      + "|guaranteed\\s+investment\\s+contracts?|common\\s*/"
      + ")(?:[\\s\\-–]*[A-Za-z0-9™“”]{1,3})?)\\s*$", "i"));
    if (cr) {
      const head = cr[1].trim();
      s = (/\b(?:class|cl|cls|series)$/i.test(head) ? head + " I " : head + " ") + cr[2].trim();
    }
  }
  s = s.replace(/\s+\|+\s*$/, " I");
  // the 4i column caption's wrapped tail glued to the FRONT of a page's
  // first holding ("maturity date American Funds EuroPacific R6", "Par or
  // Maturity Value Vanguard Total Stock Mkt Idx Adm", "of Investment Cost
  // Value EMPOWER …") — 478 plans / 409,634 ppl / 480 rows on the v138
  // store, 440 of them "maturity date". 18:1xZ draw 2026-09-18 (Nebraska
  // Medicine). The parser drops the caption line from v139; this covers
  // the store until that re-parse lands.
  const hm = s.match(/^(?:\(?[a-e]\)\s*)?(?:(?:including\s+)?maturity date|par,?\s+or\s+maturity value|(?:description\s+)?of investment(?:\s+cost)?(?:\s+value)?|identity of issuer?,?|rate of interest|collateral,?\s+par)[\s,]*/i);
  if (hm) { const rest = s.slice(hm[0].length).trim(); if (rest.split(/\s+/).length >= 2 && /[A-Za-z]{3}/.test(rest)) s = rest; }
  // a KERNED font that pdftotext split into fragments — "V an gu ard Targe t
  // Re tire m e nt 2045 Tru st II" (Nelnet, 11,248 ppl; 167 plans / 559k
  // ppl carry such a row, 20 lineups are mostly such rows). Rejoin the
  // fragments and re-segment against a fund-vocabulary word list; the
  // repair is used only when EVERY character segments into a known word
  // (numbers and roman numerals pass), so a name that merely has short
  // tokens ("AB US Lg Cp Grw CIT W Sr P1") is left exactly as filed.
  // 23:1xZ 2026-09-18, the display half of v141.
  s = despaceKerned(s);
  // the identity column's house glued in front of a description that
  // already names it — "JP Morgan JP Morgan Mid Cap Growth Fund", "Dodge &
  // Cox Dodge & Cox Global Bond Fund": the first 1-3 words repeated
  // verbatim. 239 plans / 486,173 ppl / 1,183 rows on the v139 store
  // (queue item f, the doubled-house half). 20:1xZ 2026-09-18. A trustee
  // before a DIFFERENT house ("Empower T. Rowe Price …") is left alone —
  // "BlackRock iShares …" is a real name.
  s = s.replace(/^((?:\S+\s+){0,2}\S+)\s+\1(?=\s+\S)/i, "$1");
  /* A SHARE CLASS STATED AT BOTH ENDS OF ONE NAME IS STATED ONCE, 2026-09-30.
   * "Class K Fidelity Contrafund Class K", "Class R-6 EuroPacific Growth Fund
   * Class R-6", "R6 American Funds Wash Mutual R6". 57 rows / 47 plans /
   * 77,331 ppl / $188,195,155 on the pv-196 store, all 52 distinct
   * transformations read, every one a real fund name.
   *
   * THE ARGUMENT IS INTERNAL AND THAT IS WHY IT NEEDS NO STORE. The same
   * designation appears twice in one string, so removing one copy cannot
   * change which fund is named — unlike the issuer strip and the OCR tail
   * strip, whose safety rests on a whole-store attestation only merge-4i can
   * ask. This one is self-evident per row, so it lives at display and reaches
   * both surfaces at once.
   *
   * THE ARM SITS BESIDE THE DOUBLED-HOUSE PREFIX ABOVE AND CANNOT REACH THIS
   * SHAPE: that one requires the repeat to be ADJACENT, and here the fund's
   * whole name sits between the two copies.
   *
   * TWO NEIGHBOURING POPULATIONS ARE REFUSED, both measured and both larger
   * than what ships:
   *
   *   331 rows / 170 plans / 334,922 ppl lead with a class the remainder
   *   NEVER repeats ("Class R6 Fidelity Global ex U.S. Index Fund"). That is
   *   not damage — it is the filer writing the class first, and the block
   *   structure proves it: the row above is "Class R6 American Funds 2035
   *   Target Date Retirement Fund" and the one above that "…2040", a whole
   *   menu in class-first style. Stripping there DESTROYS the only statement
   *   of the share class.
   *
   *   80 rows / 58 plans / 171,594 ppl state two DIFFERENT classes ("Class R1
   *   Macquarie Mid Cap Growth R6", "Class H Invesco Stable Value Trust Class
   *   A1"). One of them is wrong and nothing in the string says which, so
   *   picking the trailing one would be a guess wearing a repair's clothes.
   *
   * AND THE ROW THAT FOUND IT IS IN THE REFUSED HALF. Innovative Employee
   * Solutions (5,856 ppl) publishes "II Class R1 Blackrock LifePath Index
   * 2030 Fund S", whose lead is the previous row's tail ("Small Cap Value
   * Fund II Fee Class R1") and whose classes disagree. It is left as filed.
   *
   * A GENERIC REMAINDER IS REFUSED BY isGenericTypeName BEFORE ANY OF THIS —
   * QuikTrip (16,054 ppl) files "Class E Common Stock" at $3,535,256,080 and
   * Moog "Class B Common Stock" at $369,929,005, where the letter is a real
   * designation of the employer's own stock and the remainder names no fund.
   * Those four rows are 69% of the candidate population BY VALUE, and a
   * shipped predicate refuses them with no new vocabulary.
   *
   * Outcome: +0 tickers, -0 lost, 0 flipped, +0 fees, -0 lost, 0 changed.
   * An HONESTY fix and not a coverage fix, and here that holds by
   * construction rather than by measurement: lookupTicker tries the RAW name
   * FIRST, and `stk` is a STORED field a display arm cannot reach. */
  {
    const h = DOUBLED_CLASS_HEAD.exec(s);
    if (h) {
      const hc = classCode(h[1] || h[2]);
      const rest = s.slice(h[0].length).trim();
      const t = hc && rest.length >= 12 && rest.split(/\s+/).length >= 2
        ? DOUBLED_CLASS_TAIL.exec(rest) : null;
      if (t && hc === classCode(t[1] || t[2]) && !isGenericTypeName(rest)) s = rest;
    }
  }
  /* A TRUSTEE'S CORPORATE STYLE WELDED ONTO A FUND NAME, 2026-10-03.
   *
   * Target Corporation (495,482 participants) publishes `State Street Bank &
   * Trust Company SSGA S+P 500 INDEX SER A S+P 500 FLAGSHIP NON LENDING` at
   * 21.1% of its menu; Helen of Troy `Fidelity Management Trust Company FID
   * FDM IDX 2045 IPR`; JetBlue `VANGUARD FIDUCIARY TRUST COMPANY VANGUARD
   * FEDERAL`. The 4i identity column holds the TRUSTEE and the parser welds it
   * to the description column's fund name. 5,168 rows / 1,348 plans /
   * 3,744,810 ppl on the pv-199 store.
   *
   * THE SCREEN IS A CORPORATE ENTITY DESIGNATION, NOT A SECOND HOUSE. A
   * sub-advised fund legitimately names two firms (`Principal/BlackRock S&P
   * 500 Index Fund`, `Empower Columbia Dividend Value Fund`), so a two-house
   * screen reads 6,059 rows that are mostly CORRECT AS FILED. What no fund's
   * registered name carries is the trustee's corporate style — `Trust
   * Company`, `Fiduciary Trust Company`, `Bank & Trust Company`, `Advisors,
   * LLC`, `Investment Management Inc.`
   *
   * THE GATE IS THE FEE, AND IT IS WHY A PREVIOUS VERSION OF THIS ARM WAS
   * REVERTED RATHER THAN SHIPPED. `fundER` is a NAME-pattern table, so the
   * house token inside the trustee's name is part of what priced the row. The
   * reverted arm's ticker outcome was ideal — 308 rows gained a symbol, 0 lost,
   * 0 swapped — beside 23 rows / 41,582 ppl LOSING a fee and 42 / 18,480
   * SWAPPING one. Reading the losses named the mechanism exactly: every one
   * leaves a remainder with NO HOUSE IN IT. D.R. Horton (17,416 ppl) files
   * `JP Morgan Investment Management Large Cap Growth`, and `Large Cap Growth`
   * alone is a bare strategy label that prices to nothing.
   *
   * SO THE CONDITION IS THAT THE REMAINDER MUST STILL LEAD WITH A HOUSE.
   * `leadingHouse` is the shipped, anchored test for exactly that, and it is
   * the fee's own witness: keep the house and the fee that was matched on the
   * house survives the strip. It is NOT "the two houses must differ" — that
   * version would refuse JetBlue's `VANGUARD FIDUCIARY TRUST COMPANY VANGUARD
   * FEDERAL`, whose remainder keeps Vanguard and whose =VMFXX gain is real.
   * And the condition earns its place twice over, because a remainder with no
   * house is a WORSE published name than the verbose one it replaced: `Large
   * Cap Growth` tells a reader less than `JP Morgan … Large Cap Growth` does.
   *
   * ORIENTATION IS SETTLED FOR THIS FAMILY AND UNSETTLED FOR ITS NEIGHBOUR.
   * Here the entity side is stray by construction — a corporate style is never
   * part of a fund's name — and Helen of Troy's menu witnesses it directly, in
   * one plan, by publishing `FID FDM IDX 2035 IPR` bare beside `Fidelity
   * Management Trust Company FID FDM IDX 2045 IPR`. The mid-name-HOUSE class is
   * a different problem with three orientations and no such witness, and this
   * arm must not be widened toward it.
   *
   * `FSB`, `N.A.` AND THE OTHER CHARTER ABBREVIATIONS ARE PART OF THE ENTITY.
   * An earlier gate anchored on the first character after the designation, and
   * `Nationwide Trust Company, FSB Vanguard …` satisfied it while leaving
   * `FSB` behind — a residue of the same defect wearing the repair's clothes. */
  {
    /* FOUR CONDITIONS WERE REMOVED HERE BECAUSE THE STORE SAID THEY WERE
     * SUBSUMED, not because they looked redundant. `beyondHouse` runs
     * LEADING_HOUSE itself and returns false when no house matches, so it
     * implies `leadingHouse(rest)`; and a remainder that keeps a
     * non-boilerplate word beyond its house necessarily has two tokens and
     * three letters. Measured one at a time against all 1.73M rows, each of
     * `leadingHouse(rest)`, the two-token floor and the three-letter test
     * blocked ZERO rows that `beyondHouse` did not already block — and a
     * condition that can never be the only protection proves nothing, which is
     * the same trap as a fixture protected twice, met here at store scale.
     * `isGenericTypeName` is kept and labelled: its live population is also 0,
     * but it is the display's own composition at the two render call sites and
     * costs one call. */
    const ok = (rest) => rest && beyondHouse(rest) && !isGenericTypeName(rest);
    ENTITY_STYLE_AT.lastIndex = 0;
    let m;
    while ((m = ENTITY_STYLE_AT.exec(s))) {
      const styleEnd = m.index + m[0].length;
      const firmLen = (a, b) => s.slice(a, b).split(/\s+/).filter((t) => /[A-Za-z]{2}/.test(t)).length;
      /* THE FIRM'S BOUNDARY NEEDS A DIFFERENT WITNESS IN EACH POSITION, and
       * each position supplies one. Two earlier versions failed here and the
       * arm's own printed loop state is what settled it, not a theory:
       *
       *   LEAD — there is no boundary question at all. The firm is everything
       *     before the style, so the span starts at 0. `Nationwide Trust
       *     Company, FSB` works here and would fail any house test, because a
       *     BANK trustee is not a fund house, and bank trustees (Reliance,
       *     Matrix, Great Gray, Wells Fargo N.A.) are much of the class.
       *
       *   TAIL — the boundary is genuinely ambiguous and `leadingHouse` is the
       *     only thing that locates it. On `Fidelity 500 Index Fund Fidelity
       *     Management Trust Company` a nearest-token rule takes `Street`-style
       *     fragments and published `Fidelity 500`; the nearest start at which
       *     a HOUSE begins is the second `Fidelity`, which is right.
       *
       * A candidate start must also lie strictly before the style's own first
       * token — including it gave an EMPTY firm span and chose the boundary one
       * word into the firm (`State Street …` → span `Street Bank & Trust
       * Company`, remainder `State`). */
      let rest = null;
      if (m.index > 0 && firmLen(0, m.index) >= 1 && firmLen(0, m.index) <= 4) {
        rest = s.slice(styleEnd).replace(/^[\s,;:.\-–—]+/, "").trim();
        if (!ok(rest)) rest = null;
      }
      if (rest === null && styleEnd >= s.trimEnd().length) {
        const starts = [];
        WORD_START.lastIndex = 0;
        let w;
        while ((w = WORD_START.exec(s))) {
          const p = w.index === 0 ? 0 : w.index + 1;
          if (p >= m.index) break;
          starts.push(p);
        }
        const p = starts.reverse().find((q) => leadingHouse(s.slice(q, m.index)) && firmLen(q, m.index) <= 4);
        if (p !== undefined && p > 0) {
          const cand = s.slice(0, p).trim();
          if (ok(cand)) rest = cand;
        }
      }
      if (rest !== null) s = rest;
      break;
    }
  }
  const pm = s.match(TYPE_PREFIX);
  if (pm) { const rest = s.slice(pm[0].length).trim(); if (rest.split(/\s+/).length >= 2 && /[A-Za-z]{3}/.test(rest)) s = rest; }
  /* THE OCR'd `N/A` COLUMN TRAILING A REAL FUND NAME, 2026-10-01.
   *
   * Chimes International (3,791 ppl, OCR'd) names its Vanguard target-date rows
   * `Mutual fund NIA 391,719 (eb)`; elsewhere the debris trails a name that is
   * entirely real — `Principal LifeTime 2035 RS Fund NIA`, `American Funds
   * Fundamental Investors R3 Fund NIA`, `PIMCO Total Return RFund NIA`, `Total
   * Bond Market NIA`. 363 rows / 56 plans / 133,681 participants, and this is a
   * COVERAGE defect and not only an honesty one: 303 of them publish NO ticker
   * and 277 no fee, because the welded debris breaks every lookup.
   *
   * `bwNoise` above already knows `NIA` and cannot reach these, because it is a
   * REFUSAL inside the leading-caption arm — it declines to strip a caption whose
   * remainder is noise, and never strips noise that TRAILS a name. *A fix for one
   * position of a class is not a fix for the class*, the `(continued)` shape
   * again, closed in the issuer column and left open in the name column.
   *
   * The rule drops tokens from the END and needs no vocabulary of funds: an OCR'd
   * `N/A`, a bare figure, or short OCR bracket noise. What makes it THIS class
   * rather than a general trailing-junk strip is that **at least one of the
   * dropped tokens must be an N/A** — `NIA` is the OCR of a column header the
   * filer left blank, and no registered fund is named NIA. A head of two real
   * words must survive, so the strip can never leave a fragment. */
  {
    const toks = s.split(/\s+/);
    const isNA = (t) => /^n[il1y]a$/i.test(t.replace(/[^A-Za-z]/g, ""));
    const droppable = (t) => isNA(t) || /^[\d.,]{3,}$/.test(t)
      || /^[^A-Za-z]*[a-z]{0,3}[^A-Za-z]*$/.test(t);   // OCR bracket noise, or pure punctuation
    let k = toks.length, sawNA = false;
    while (k > 0 && droppable(toks[k - 1])) { if (isNA(toks[k - 1])) sawNA = true; k--; }
    const head = toks.slice(0, k);
    if (sawNA && head.filter((t) => /[A-Za-z]{3}/.test(t)).length >= 2) s = head.join(" ");
  }
  /* THE COMMA FAMILY, 2026-09-28. A comma after a COMPLETE vehicle type is a
   * caption separator, not part of a fund name: "Mutual Fund, Freedom Index
   * 2030", "Pooled Separate Account, TIAA Real Estate", "Money market fund,
   * Fidelity Govt Money Market Fund". 1,077 rows / 595 distinct names on the
   * v188 store. It needs its own arm rather than a comma in TYPE_PREFIX
   * because the remainder has to be SCREENED, and the screen is what the
   * members taught:
   *
   *   120 rows would be DAMAGED and are excluded — a measurement BASIS ("at
   *   contract value", "at fair value"), a bare CLASS or SERIES designation
   *   ("Stable Value Fund, Class M" -> "Class M"), and a UNIT PRICE with no
   *   letters at all ("Mutual Funds, @ $688.090000").
   *
   * `the` was in the first draft of that screen and came OUT, because it
   * flagged three real funds — "Mutual Fund, The Growth Fund of America",
   * "The Investment Company of America", "The Bond Fund of America". A leading
   * "The" is ordinary in a fund name. Printing the suspects is what showed it;
   * the screen was written to catch damage and its first version caused some. */
  const cm = s.match(/^(?:common\/?collective trusts?(?: funds?)?|collective investment trusts?(?: funds?)?|registered investment compan(?:y|ies)|pooled separate accounts?|separate accounts?|mutual funds?|money market funds?|stable value funds?|guaranteed (?:investment|interest) contracts?|index funds?|target date funds?)\s*,\s+(?=\S)/i);
  if (cm) {
    const rest = s.slice(cm[0].length).trim();
    const notAName = /^(?:at|of|in|on|for|and|as|to|with|per|net|@)\b|^(?:fee\s+)?class\b|^series\b|^unit/i;
    if (/[A-Za-z]{3}/.test(rest) && !notAName.test(rest)) s = rest;
  }
  /* THE BARE-WHITESPACE FAMILY, 2026-09-28 — caption class B's largest arm.
   * A vehicle type followed by nothing but a space: "Registered Investment
   * Company Vanguard Inter-Term Bnd Index Fd Adm", "Common/Collective Trust
   * Prin LifeTime Hybr 2035 CIT Z". Refused twice before, and the refusals
   * were right both times: a blanket strip turns "Stable Value Fund Fee Class
   * R1" into "Fee Class R1", and an outcome gate (strip only where the
   * remainder resolves through fund-er.js) reached 19 rows because that table
   * cannot name a Principal separate account or a CIT BY DESIGN.
   *
   * The last handoff proposed a HOUSE LIST and named its own weakness. It is
   * not needed: printing every distinct remainder split the family at FOUR
   * TOKENS. Below that sit `Shares`, `Fee Class R1`, `and`, `Omitted`, `III`,
   * `at fair value`; at or above it sit `Fidelity Freedom Index 2030`,
   * `T. Rowe Price Overseas`, `PGIM Ttl Ret Bond R2 Fund`, `Am Fds
   * EuroPacific Grth R6 Fd` — the last two exactly the names a typed house
   * list missed. LENGTH is the discriminator; the data said so, not me.
   *
   * Length alone is not enough — "Stable Value Fund Class 25 - I" is four
   * tokens of pure designation — so the remainder must also OPEN with a token
   * that carries naming content. Each exclusion below was earned by reading a
   * suspect, and one of them is the v188 pinned DECOY: `Separate Account A,
   * at fair value` survives only because the comma is stripped before `A` is
   * judged a bare code. GICs leave the vocabulary entirely, because a GIC's
   * filed name really is the type plus a CONTRACT NUMBER (`GA 29013 DTD
   * 04/28/11`). The participles are what saved the OTHER pinned control:
   * `Index Fund invested in stocks included in the S&P 500` was being cut to
   * `invested in stocks…` until `invested` joined the furniture — a control
   * written last cycle caught this cycle's draft, which is what controls are
   * for. 2,369 rows / 237 plans / 305,540 ppl, +10 tickers, 0 lost.
   *
   * THE FLOOR WAS MEASURED ON 2026-09-29 AND DELIBERATELY NOT MOVED. Every
   * remainder it refuses was read — 474 rows / 223 plans / 460,163 ppl — and
   * the read says three different things at the three lengths:
   *
   *   ONE token — all 32 distinct read, NOT ONE publishable. Bare houses
   *     (`Putnam`, `Dreyfus`, `Metlife`), bare designations (`Admiral`,
   *     `Investor`, `MMF-R3`), OCR mush (`ial`, `e7igi8`, `baie`) and asset
   *     words (`Equity`, `Guaranteed`). The floor is simply right here.
   *   TWO tokens — about half junk, and the junk is not a family that can be
   *     screened: `Sch N`, `Select S`, `Prudential GA-`, `Brought Forward`,
   *     `CTF A` sit beside `MFS Utilities`, `Fidelity Contrafund` and
   *     `Vanguard 500`. Left refused.
   *   THREE tokens — 237 distinct, overwhelmingly real fund names, and the
   *     junk is five NAMED families rather than a spectrum, which is what
   *     makes the level shippable at all.
   *
   * Four of those five families are now screened anyway, because they also
   * occur ABOVE the floor where the arm already ships: `bwNoise` for the
   * share-count and N/A-column families, and `measure`/`that`/`investing` in
   * the furniture. Those screens are this cycle's actual shipped work and
   * they are worth more than the floor drop would have been, because they
   * repair rows readers see TODAY.
   *
   * WHAT BLOCKS THE FIFTH FAMILY IS A PINNED CONTROL FROM THE PREVIOUS
   * CYCLE, and it is the reason the level did not move: the draft stripped
   * `Stable Value Fund Standard Insurance Company` to a bare ISSUER, which
   * the tether below pins as a must-KEEP. About eight rows do that
   * (`Investments T. Rowe Price`, `Mutual funds DODGE & COX`), and they feed
   * the bare-house-as-a-holding class this project already has open. No
   * clean screen exists for it: a corporate suffix cannot tell `Standard
   * Insurance Company` from `Fidelity Growth Company`, which is a real fund.
   * So the three-token level stays refused until that class is settled, and
   * the ~248 real fund names sitting in it stay unreached. Named, not
   * waved at. */
  /* ONE remainder screen, asked by both the bare-whitespace arm and the
   * parenthetical arm below. A second copy of a shipped predicate has
   * produced a wrong answer on this record at least four times, so the two
   * arms share this rather than each carrying their own. */
  const bwOpensWithAName = (t0) => {
    const furniture = /^(?:class(?:es)?|cl|fee|fees|series|ser|shares?|sh|units?|tier|lot|level|at|of|in|on|for|and|or|as|to|with|per|net|the|a|an|value|values|fair|contract|market|cost|book|nav|bps|no|not|required|omitted|available|na|none|total|subtotal|held|directed|participant|participants|self|various|other|misc|continued|cont|certified|uncertified|approx|approximate|number|amount|wrapper|cit|gac|invested|issued|managed|measured|measure|valued|using|that|investing|consisting|comprised|including|investments|funds?|trusts?|accounts?|compan(?:y|ies)|portfolios?)$/i;
    const code = /^(?:[ivxl]{1,4}|[a-z]|[a-z]?\d{1,6}[a-z]?|[a-z]{1,2}\d{1,4}|\d+bps)$/i;
    return !!t0 && !furniture.test(t0) && !code.test(t0);
  };
  /* AN INITIAL IS NOT A SHARE-CLASS CODE, 2026-09-29. `bwOpensWithAName`
   * strips punctuation before judging, so `T. Rowe Price Overseas` arrived as
   * the bare `T` and was refused by the one-letter `code` arm — leaving
   * `Registered Investment Company T. Rowe Price Overseas` published whole on
   * 129 rows / 38 plans / 62,598 participants. This project's record already
   * carries `t` from T. Rowe Price as a trap in the matcher's manager
   * vocabulary; it is the same letter defeating a different predicate.
   * The discriminator is the PERIOD, which the punctuation strip threw away:
   * a single letter followed by a full stop is an initial, and a filed share
   * class is never written that way (`Class A`, never `A.`). */
  const bwInitial = (raw) => /^[A-Za-z]\.$/.test(raw);
  /* TWO THINGS THE t0 SCREEN STRUCTURALLY CANNOT SEE, 2026-09-29, both found
   * by measuring what the four-token floor was refusing rather than by
   * reading a page.
   *
   * A SHARE COUNT is not a name. `bwOpensWithAName`'s `code` arm caps at six
   * digits, so `Mutual Fund 99,566.045 shs` strips to the eight-digit
   * `99566045` and passes — a share-COUNT column read as a holding name.
   *
   * A CONTROL I WROTE FOR THIS WAS DECORATIVE, and running it is what said
   * so. I pinned `Mutual Fund 2045 Retirement Trust Select` as must-be-
   * unchanged, expecting a bare `is this numeric` test to eat a target-date
   * VINTAGE — the trap the leading-count strip a hundred lines below already
   * carries a comment about, recording that its own draft "took 13,000
   * vintage-led rows with it". It cannot happen here: `code` refuses any
   * lead of six digits or fewer BEFORE this screen is reached, so `2045` was
   * already refused and the pin asserted a behaviour the change never
   * touched. The narrowing it prompted was therefore reverted as redundant,
   * and the pin moved to the case that actually discriminates — a SEVEN
   * digit lead, which `code`'s cap lets through and this catches.
   *
   * `NIA` / `nla` is OCR of the `N/A` column, never part of a fund name —
   * `Pooled separate accounts NIA NIA qQ`. Anchored per token so a real name
   * containing the letters cannot be reached. */
  const bwNoise = (toks) =>
    /^[\d.,]+$/.test(toks[0]) || toks.some((t) => /^n[il]a$/i.test(t.replace(/[^A-Za-z]/g, "")));
  /* `investments` PLURAL ONLY, and the singular is the whole reason this is
   * spelled out rather than written `investments?`. Measured 2026-09-29 over
   * the whole caption bucket: allowing the bare singular `investment` would
   * have withdrawn a resolution from 34 rows, and every one of them is a real
   * fund whose own name STARTS with the word — `INVESTMENT CO OF AMERICA
   * Class R-4` (RICEX), `Investment Grade Bond R6` (JIGEX), `Investment Grade
   * Bond Fund - Class A` (LIGRX). Every row the plural gains is a genuine
   * caption. The data chose the split, as length chose this arm's floor.
   * 418 rows / 344 plans / 2,599,053 participants. */
  const bwTYPE = /^(?:common\/?collective trusts?(?: funds?)?|collective investment trusts?(?: funds?)?|registered investment compan(?:y|ies)|pooled separate accounts?|separate accounts?|mutual funds?|money market funds?|stable value funds?|index funds?|target date funds?|investments)/i;
  const bm = s.match(new RegExp(bwTYPE.source + "\\s+(?=[A-Za-z0-9])", "i"));
  if (bm) {
    const rest = s.slice(bm[0].length).trim();
    const toks = rest.split(/\s+/);
    const t0 = toks[0].replace(/[^A-Za-z0-9&]/g, "");
    if (toks.length >= 4 && !bwNoise(toks) && (bwOpensWithAName(t0) || bwInitial(toks[0]))
        && !bwTYPE.test(rest) && /[A-Za-z]{3}/.test(rest)) s = rest;
  }
  /* THE LEADING-PARENTHETICAL FAMILY, 2026-09-28. All 125 distinct members
   * were READ, not sampled — 132 rows / 118 plans / 363,990 ppl — and the
   * split is structural rather than lexical: does anything survive the
   * parenthetical?
   *
   *   98 rows / 236,197 ppl have a real fund name after it, almost always
   *      behind a page break's `(continued)` — `Mutual funds (continued)
   *      Dodge & Cox International Stock Fund`.
   *   34 rows / 127,793 ppl ARE the parenthetical — `Stable Value Fund (i)`,
   *      `(at fair value)`, `(NAV)`, `(Class R1)`, `(75 BPS)`. Stripping any
   *      of those leaves a bare vehicle type, which is strictly WORSE than
   *      what is published today, so they are refused by construction: the
   *      remainder screen below requires a name to follow.
   *
   * The parenthetical must be NON-IDENTIFYING, and that is an allowlist
   * rather than a blocklist because three members of the strippable half
   * would be damaged by a blanket rule and each carries real information a
   * blocklist would have to anticipate: `(TIAA-CREF, not certified)` holds
   * the HOUSE, `(Stable Value Fund)` and `(Group Annuity Contract)` hold a
   * vehicle designation the remainder never repeats. An allowlist refuses all
   * three without naming them. */
  const pm2 = s.match(new RegExp(bwTYPE.source + "\\s*\\(([^)]*)\\)\\s*(?=[A-Za-z0-9])", "i"));
  if (pm2) {
    const inner = pm2[1].trim();
    const nonIdentifying = /^(?:continued|continucd|cont\.?|certified|participant[- ]?directed|nonparticipant[- ]?directed|(?:at\s+)?fair value|net asset value practical expedient|nav|held by .+)$/i;
    const rest = s.slice(pm2[0].length).trim();
    const toks = rest.split(/\s+/);
    const t0 = toks[0].replace(/[^A-Za-z0-9&]/g, "");
    if (nonIdentifying.test(inner) && toks.length >= 2 && bwOpensWithAName(t0)
        && /[A-Za-z]{3}/.test(rest)) s = rest;
  }
  /* A PAGE BREAK'S `(continued)` MARKER, AND WHATEVER CAPTION CARRIES IT.
   *
   * Found by the 09:0xZ participant-weighted draw: Trustees of the University
   * of Pennsylvania (45,173 participants) publishes a clean 31-row Vanguard
   * menu with two rows reading `Fidelity Management Trust Company (continued)
   * VANG SM CP IDX IS PL`. The auditor repeats the section caption at the top
   * of the next page and the first holding under it absorbs the whole line.
   *
   * v173 closed this class in the ISSUER column and this record calls it
   * closed. It is closed THERE. The same words in the NAME column were never
   * touched by that fix: 100 rows / 83 plans / 476,960 participants.
   *
   * THE ARM ABOVE CANNOT REACH THEM because it requires the string to OPEN
   * with a vehicle type, and these captions open with a firm (`Fidelity
   * Management Trust Company`), a heading (`Exchange Traded Funds:`), a model
   * portfolio (`Renasant Moderate Growth Model -`) or nothing at all. What
   * makes a wider cut safe here is the marker itself: no fund is named
   * "(continued)", so everything before it is caption by construction — which
   * is exactly what caption class B's bare captions cannot claim.
   *
   * OUTCOME TEST: +1 ticker, 0 LOST. So this is an HONESTY fix for 476,960
   * readers, not a fee-coverage one, whatever the row count suggests.
   *
   * THE ARTICLE IS WHY THE REMAINDER SCREEN IS RELAXED HERE, and the two rows
   * that forced it are the same shape that damaged the comma family's first
   * draft: `John Hancock sub-accounts (continued) The Growth Fund of America`
   * and `Renasant Growth Model Fund - (Continued) The Hartford Dividend and
   * Growth Fund` were both REFUSED, because `the` is furniture in the shared
   * screen. It is furniture when a remainder has to prove it is a name; it is
   * not when `(continued)` has already proved it. So the article is skipped
   * for the screen and KEPT in the name. */
  const contM = s.match(/^.*?\((?:continued|continucd|cont\.?)\)\s*[-–—:,]?\s*(?=\S)/i);
  if (contM) {
    const rest = s.slice(contM[0].length).trim();
    const toks = rest.split(/\s+/);
    const probe = (/^(?:the|a|an)$/i.test(toks[0]) && toks.length >= 3 ? toks[1] : toks[0] || "")
      .replace(/[^A-Za-z0-9&]/g, "");
    if (toks.length >= 2 && /[A-Za-z]{3}/.test(rest) && bwOpensWithAName(probe)) s = rest;
  }
  // the leading-dash strip at the top of this function runs BEFORE the type
  // prefix above, so "Stable Value Fund- — John Hancock Life Insurance
  // Company" (Empower Electric) came out still wearing the dash. Re-run it
  // once the prefix is gone. Exactly 1 row on the v184 store — the other
  // 1,992 em-dash rows the census counts were already clean at display.
  const dl = s.replace(/^[—–-]+\s*/, "").trim();
  if (dl !== s && /[A-Za-z]{3}/.test(dl)) s = dl;
  /* ...AND THE SAME CAPTION WITH NO BRACKETS TO MARK IT, which the `contM` arm
   * further up cannot reach because it requires the marker to be
   * parenthesised. 29 rows / 27 entries / 27 plans / 13,256 participants /
   * $24,675,085 on the pv-196 store, and ALL 29 DISTINCT TRANSFORMATIONS WERE
   * READ: every remainder is either a real fund name (`Fidelity Freedom Index
   * 2030 Fund Investor Class`, `PIMCO RealPath Blend 2055 INST`, `Vanguard
   * Wellesley Income Admiral Class Fund`) or, twice, participant-loan prose —
   * see below, where the strip is what hands those two rows to a guard that
   * was blind to them.
   *
   * IT SITS HERE, AFTER THE LEADING-DASH RE-RUN, AND THAT IS MEASURED RATHER
   * THAN STYLISTIC. Placed beside `contM` it refused two rows while every gate
   * passed: `Mutual Funds, at Fair Value - Continued Vanguard Target
   * Retirement 2040 Fund` arrives with the caption behind its own vehicle
   * prefix, `TYPE_PREFIX` removes the prefix and LEAVES THE DASH, so at the
   * earlier position the string began `- ` and an anchored rule cannot match.
   * Same shape as the comment immediately above this one, which exists because
   * the dash strip itself ran too early; both are pinned in the tether.
   *
   * What makes a cut this wide safe is the marker itself rather than any
   * screen: no fund is named `Continued`, so everything up to it is caption BY
   * CONSTRUCTION. The remainder is still screened by `bwOpensWithAName`, and
   * that is NOT belt-and-braces — it is the only thing standing between the
   * reader and a holding named `from page 10`.
   *
   * THE ARTICLE RELAXATION AND `bwInitial` ARE BOTH TAKEN FROM THE `contM` ARM
   * and BOTH ARE DECORATIVE on this store, which is worth naming rather than
   * hiding: no remainder here opens with `The`, and none opens with a bare
   * initial, so both conditions reach 0 rows. They are carried because the
   * sibling's own two refusals (`John Hancock sub-accounts (continued) The
   * Growth Fund of America`; the `T. Rowe Price` initial, which still costs
   * `contM` four rows) are the shapes this arm will meet next, and because
   * dropping them cannot ADD a row — it can only refuse a repair.
   *
   * TWO FURTHER CONDITIONS ARE DECORATIVE AND SAYING SO IS THE POINT. The `\b`
   * after the caption word reaches 0 rows either way, because the alternation
   * already spells complete suffixes — nothing can match `continu` followed by
   * anything but `ed`, `ation` or `ing`. And a bare `Cont.` is ABSENT from the
   * vocabulary although admitting it would change 0 rows today: no stored row
   * LEADS with that abbreviation, and the refusal is precautionary, its
   * evidence being `NYL INSURANCE IPG GRP ANNUITY CONT.` — a group annuity
   * CONTRACT at 42.7% of its menu, which the `^` anchor is what protects.
   *
   * COST NAMED, 1 row / 172 participants: `Continued Total Intl Stock Index
   * Adm` (Town Center Orthopaedic Associates) keeps its caption, because
   * `Total` is furniture in the shared screen. Nothing else is lost — the row
   * already publishes VTIAX at 0.06% through its `Vanguard` issuer cell — so
   * the only cost is a caption word a reader can see, and refusing a repair is
   * the safe direction.
   *
   * THE CARRIED-FORWARD REFUSAL IS WHAT KEEPS A NON-NAME FROM BECOMING THE
   * NAME. `Continued Balance Brought Forward` is 52.8% of Wilson Bank &
   * Trust's published menu ($46,880,875) and stripping the caption would leave
   * `Balance Brought Forward` standing as the holding — strictly worse, because
   * the caption word is the one thing telling the reader it is a page artefact.
   * That row, and the two whose whole name is caption, are typed instead by
   * `isPageBreakCaptionRow` below: THE THREE PURE-CAPTION MEMBERS ARE TYPED,
   * NOT STRIPPED.
   *
   * AND THE TWO LOAN ROWS GAIN A TYPING THEY DO NOT HAVE TODAY, which corrects
   * what this item was queued believing. `continued- Loans Participants
   * Interest rates ranging from 10.00% to 10.50% with various m` (Verge Mobile,
   * 2,628 ppl) publishes today as `Pooled separate account`, and its sibling at
   * Arborworks (1,038 ppl) as `—`: `isLoanDescriptionRow` and
   * `isLoanVocabularyRow` are anchored on the name beginning with loan words,
   * so the leading caption put both rows OUTSIDE every loan guard. Asked of the
   * stripped remainder both answer TRUE. The queue entry said these two "must
   * keep their loan typing"; they had none, and the strip is what gives it. */
  {
    const cl = PAGE_BREAK_LEAD.exec(s);
    if (cl) {
      const rest = s.slice(cl[0].length).replace(PAGE_BREAK_SEP, "")
        .replace(PAGE_BREAK_REF, "").trim();
      const toks = rest.split(/\s+/).filter(Boolean);
      const lead = /^(?:the|a|an)$/i.test(toks[0] || "") && toks.length >= 3 ? toks[1] : (toks[0] || "");
      const probe = lead.replace(/[^A-Za-z0-9&]/g, "");
      if (toks.length >= 2 && /[A-Za-z]{3}/.test(rest) && !CARRIED_FORWARD.test(rest)
          && (bwOpensWithAName(probe) || bwInitial(lead))) s = rest;
    }
  }
  s = s.replace(/[,;:]+$/, "").trim();
  // a share COUNT is thousands or more (1,234 / 12345…); "Class R6 Shares"
  // is a share CLASS and must survive — the first draft of this cut it to
  // "Class R", measured as 26 lost tickers before it shipped
  s = s.replace(/(?:^|[\s,(-])[\s,(-]*(?:\d{1,3}(?:,\d{3})+|\d{4,})\s+shares?\)?\s*$/i, "").trim();
  /* AND THE SAME COUNT BEFORE `units`, WHICH THE LINE ABOVE WAS ONE NOUN SHORT
   * OF — 330 rows / 33 plans / 528,207 participants / $12,760,648,303.
   * JPMorgan Chase's own plan (300,272 ppl) publishes `JPMCINTERMEDT AGGREGATE
   * SEP ACCT — SEPARATE ACCT 2,271,585,254 UNITS` at 6.0% of its menu; Ford
   * Motor (140,681) does it on thirteen rows, every one a real fund wearing a
   * count (`BlackRock MSCI ACWI Ex-US IMI Index, 92,383,792 units`).
   *
   * IT IS A SEPARATE LINE WITH A HIGHER DIGIT FLOOR, AND THAT ASYMMETRY IS
   * MEASURED RATHER THAN cautious. The line above accepts a bare `\d{4,}`,
   * which at the TAIL is the VINTAGE exposure the LEADING-count arm below
   * already records ("a four-digit lead is a target-date VINTAGE and stays —
   * the first draft took 13,000 vintage-led rows"). Before `shares` that
   * exposure is live on **0 rows**, so the shipped line is clean and stays as
   * it is. Before `units` it is live on **NINE**, and all nine are the hazard:
   * HD Supply (14,491 ppl) files `Mfo Depot Lifepath 2030 Unit` and six more
   * vintages, $376,844,450, which a `\d{4,}` form would publish as `Mfo Depot
   * Lifepath` — the ladder collapsed to one name repeated seven times.
   *
   * So a unit count must be comma-grouped or seven digits. The cost of the
   * floor is 2 rows / 345 ppl / $694,054 of real bare counts left in place
   * (`Lifestyle Fund Aggressive Portfolio (3897 units)`, `Common Trust Fund;
   * 10381 units`) — 7 vintages against 2 counts, and $376.8M against $0.7M. */
  s = s.replace(/(?:^|[\s,(-])[\s,(-]*(?:\d{1,3}(?:,\d{3})+|\d{7,})\s+units?\)?\s*$/i, "").trim();
  // a leading count is comma-grouped or five-plus digits; a four-digit lead
  // is a target-date VINTAGE ("2045 Fund") and stays — the first draft took
  // 13,000 vintage-led rows with it, caught by the store-wide count
  const lead = s.replace(/^(?:\d{1,3}(?:,\d{3})+|\d{5,})\s+(?=[A-Za-z].*\s\S)/, "").trim();
  if (lead !== s && /[A-Za-z]{3}/.test(lead)) s = lead;
  const m = s.match(TYPE_SUFFIX);
  /* A DANGLING REMAINDER IS WORSE THAN THE NAME IT REPLACED. `Shares of
   * registered investment companies` was being cut to **"Shares of"** — a
   * holding named after a preposition. 70 rows / 63 plans / 94,634
   * participants / $2,160,606,167 displayed as such a fragment on the v188
   * store, and roughly half of those were this arm's doing rather than the
   * filing's (the rest were already fragments when parsed, which is a
   * separate item).
   *
   * The two-token floor did not catch it because "Shares of" IS two tokens.
   * What makes a remainder useless is not its length but that every token is
   * a function word, so the test is the shared `bwOpensWithAName` screen
   * asked of EVERY token: if not one identifying word survives, keep the
   * filed name.
   *
   * The first draft of this asked it of the LAST token and a spot-check
   * caught the regression before it shipped — `Vanguard Institutional Index
   * Fund Mutual Fund` stopped stripping, because `fund` is furniture and
   * almost every fund name ends in it. "Does anything identifying remain"
   * and "is the last word identifying" are different questions, and only the
   * first one is the one that matters here. Restoring `Shares of registered investment companies` is honest —
   * it is what the filing says — and it also returns those rows to
   * `audit-generic-names`, which reads the stored name and had been flagging
   * them for a reason the page no longer showed. */
  if (m) {
    const rest = s.slice(0, m.index).trim();
    const tk = rest.split(/\s+/);
    const keeps = tk.some((t) => bwOpensWithAName(t.replace(/[^A-Za-z0-9&]/g, "")));
    if (tk.length >= 2 && /[A-Za-z]{3}/.test(rest) && keeps && !DANGLING_TAIL.test(rest)) s = rest;
  }
  /* AN UNCLOSED PARENTHETICAL IS A TRUNCATION — 2026-09-30 (17:3xZ).
   *
   * Found by the 17:1xZ draw on Hawai'i Pacific Health (10,929 ppl), whose
   * 42-row menu publishes `Charles Schwab Institutional – Personal Choice
   * Retirement Account (comprising of common st` at $78,619,557: the column
   * width cut the parenthetical mid-word. A filer does not open a bracket and
   * never close it, so an unclosed `(` is evidence about OUR read.
   *
   * THE NAIVE RULE WAS CONVICTED BY ITS OWN OUTCOME TEST AND THIS IS THE
   * NARROWED ONE. Stripping every unclosed tail reaches 339 rows and the fee
   * path loses 12 answers — because an unclosed `(` is OFTEN AN OCR'D LETTER
   * OR DIGIT, and then the real fund name sits AFTER it, not before:
   * `Vanguard Real (state Index Admiral` is Real ESTATE, `American Funds 206(
   * Target Date R6` is 2060, `John Hancock Trust Com(!anlr'. …` is Company,
   * and `Fund Non-Lending (Tier III Northern Trust S&P 500 Index Fund
   * Non-Lending` carries the whole fund inside the bracket. Two conditions
   * refuse all of them, and neither needs a vocabulary:
   *   (1) a SPACE before the bracket, so an OCR'd letter inside a word cannot
   *       match (`206(`, `Com(`, `r(`);
   *   (2) the surviving HEAD longer than the tail it drops, so a bracket
   *       carrying the fund name is refused (`PSA (investing in American Funds
   *       2065 - TD`, the Tier III row).
   * Narrowed it reaches 260 rows / 141 entries / 455,663 participants /
   * $2,429,129,653, and through app.js's own `lookupTicker` and `fundERRow`
   * it is **0 tickers gained, 0 lost, 0 flipped, 0 fees gained, 0 lost, 0
   * changed** — an HONESTY fix, with the positive control ({Vanguard} `500
   * Index Fund` → VFIAX, 0.03) proving both arms reachable.
   *
   * MEASURE IT THROUGH THIS FUNCTION AND NOT OVER THE RAW STORED NAME. A
   * raw-name proxy reads 263 rows / 247 distinct, because the arm runs on the
   * PARTIALLY-CLEANED string and because `cleanFiledName` ends by returning
   * the RAW name when the result holds no three consecutive letters — which
   * is what keeps one all-numeric OCR row (1,003 ppl) out of the count. The
   * honest figures are the 260 / 141 / 244-distinct above.
   *
   * All 244 distinct transformations read: six TIAA Access rows recovering a
   * clean fund name from a cut description, share counts dropping off (`…
   * Admiral Shares (2,176.30`), the LVIP Macquarie rename note (`(WAS
   * DELAWARE`). ACCEPTED COST, named rather than rounded away: FIVE rows
   * across four names carry a share class INSIDE the bracket (`Templeton
   * Global Bond Fund (R6}`, `… Washington Mutual Investors Fund (R` ×2, `…
   * Core Equity Portfolio (Institutional`, `… Conservative Long-term (Class`)
   * and become less specific, and Iona University's two TIAA rows lose the
   * CONTRACT type the same way (`Traditional, Non-Benefit Responsive (Ra`,
   * `Traditional, Benefit Responsive (Sra, Tiaa` — RA and SRA are different
   * TIAA contracts). They lose no ticker and no fee — the outcome test is
   * what says so — and a true shorter name beats a broken bracket.
   *
   * SURFACE: 11 crawlable pages / 102,983 participants, every changed cell
   * read (Sony 26,151, PayPal 15,948, Zions 14,506, Ametek 12,312, Hawai'i
   * Pacific Health 10,929). */
  {
    const open = (s.match(/\(/g) || []).length, close = (s.match(/\)/g) || []).length;
    if (open > close) {
      const i = s.lastIndexOf("(");
      if (i > 0 && /\s/.test(s[i - 1]) && !/[()]/.test(s.slice(i + 1))) {
        const head = s.replace(/\s*\([^()]*$/, "").trim();
        if (head && head.length > s.length - i && head.split(/\s+/).length >= 3) s = head;
      }
    }
  }
  /* THE SELF-REPEAT COLLAPSE RUNS LAST and runs to a FIXED POINT. Last,
   * because every arm above it may change the string and a repeat is only
   * visible once both copies are in their final spelling; to a fixed point
   * because an interleaved duplication needs more than one pass, and this
   * record's own non-idempotence item is the standing warning that one pass is
   * a proxy for the question rather than the question. The bound is four
   * passes, which is three more than any live row needs. */
  for (let pass = 0; pass < 4; pass++) {
    const c = collapseSelfRepeat(s);
    if (c === null || c === s) break;
    s = c;
  }
  s = s.replace(/[\s\-–,;:]+$/, "").trim();
  return /[A-Za-z]{3}/.test(s) ? s : String(name).trim();
}

/* PARTICIPANT LOANS ARE NOT A MENU CHOICE — canonical copy, 2026-09-28.
 * Schedule H line 4i lists participant loans because they ARE plan assets, but
 * nobody can pick `LOAN FUND` off a menu. 482 published menus carry one, and
 * 18 crawlable pages / 282,081 participants list it under a column headed
 * "Fund" with no type column to qualify it.
 *
 * app.js keeps a twin because it is a plain browser script with no module
 * system; `smoke-test.mjs` runs the BROWSER copy against this one and fails on
 * drift. The regex below is EXTRACTED VERBATIM from app.js by script, never
 * retyped — a transcribed copy of a shipped rule has produced a wrong answer
 * on this record at least four times.
 *
 * ANCHORED, which is what keeps real funds safe: `Bank Loan Fund`, `Floating
 * Rate Loan Fund`, `Senior Loan Portfolio` and J&J's real `Loans Secured By
 * Mtges-Resid.` are all refused, and all four are pinned controls.
 *
 * THE LARGEST SHAPE IN THE CLASS WAS AN APOSTROPHE — 2026-10-01 (12:1xZ).
 * `Participant Loan Account` matched and `Participant's Loan Account` did not:
 * the lead was `participant[- ]?`, so after the noun the pattern met `'s` where
 * it wanted `loans?`. 1,234 rows / 1,234 plans / 674,947 participants, and that
 * one-row-per-plan ratio is itself corroboration — a plan files ONE
 * participant-loan line. All 13 distinct names read and every one is a
 * possessive or a plural of a shape this arm already accepts:
 * `Participant's Loan Account` (1,075), `Participants Loans` (101),
 * `Participants’ loans`, `PARTICIPANT'S LOAN`. 0 publish a ticker and 0 a fee.
 *
 * THE ANCHOR IS UNTOUCHED AND IS STILL THE WHOLE SAFETY ARGUMENT: a bank-loan
 * mutual fund does not open with the word "Participant". */
export const LOAN_ROW = /^(?:participants?['’]?s?[- ]?)?loans?(?:\s*(?:fund|receivable|to participants?|account))?\b[\s.,;:()%\d-]*$|^(?:notes? receivable from |loans? to )participants?\b|^participant notes?\b/i;
export function isParticipantLoanRow(name) {
  return LOAN_ROW.test(String(name || "").trim());
}

/* A LOAN DESCRIPTION'S CONTINUATION LINE PUBLISHED AS A HOLDING NAME.
 *
 * Nissan North America (22,188 participants) publishes `at rates of interest
 * ranging from 4.25% to` carrying $63,385,312 as though it were a fund. The
 * filed line is `Participant loans, at rates of interest ranging from 4.25% to
 * 9.50%`, wrapped over two lines, and the parse took the SECOND line.
 *
 * `LOAN_ROW` above is ANCHORED on the name BEGINNING with loan words, which is
 * what keeps `Bank Loan Fund` safe — so it cannot reach a fragment that never
 * says "loan" at all. A fix for one phrasing of a class is not a fix for the
 * class, which is the lesson `LOAN_ROW`'s own comment records, arriving one
 * level down.
 *
 * TWO CONDITIONS, BOTH REQUIRED, and neither is a list of fund names:
 *
 *   1. THE RATE IS QUOTED AS A RANGE. A plan's loans carry a range of rates; a
 *      GIC or a short-term account carries one. That alone separates Nissan's
 *      truncated `ranging from 4.25% to` from `Interest rate 1.75%`, `Short
 *      term investment fund (interest rate 4.4393%)` and `Fixed annuity at
 *      1.41% interest rate` — all real holdings, all refused, all pinned.
 *
 *   2. NOTHING IS LEFT. Strip the loan description — rates, maturities, dates,
 *      the loan vocabulary — and the remainder must not still name something.
 *      `General Account (interest at 3.05%)` leaves `General Account` and is
 *      KEPT. This is the residue idiom the merge's caption strip and the
 *      bare-whitespace family already use: ask what REMAINS rather than
 *      enumerate what must not.
 *
 * IT UNDER-REACHES ON PURPOSE. A loan row with a fund-shaped trailer
 * (`rates ranging from 4.25% - 4.75%. GuideStone Financial Resources total
 * assets held`) is refused, because typing a real fund as a loan is the
 * expensive error and leaving a loan untyped is merely the status quo. 270
 * distinct names are refused and every one was read.
 *
 * `principal` IS DELIBERATELY ABSENT FROM THE VOCABULARY, and its absence cost
 * a correction. It was there for the phrase `principal residence`, and it
 * deleted a HOUSE NAME: Griswold Industries publishes `Interest Rate of 0.15%
 * to 0.62% (Maturing in 2023) Principal`, which is a wrapped
 * `Principal Guaranteed Interest Account` crediting rate, not a loan — 0.15%
 * is no participant-loan rate, and the plan's whole menu is Principal separate
 * accounts. One token carrying two meanings, caught by READING the accepted
 * names rather than counting them. Both rows are pinned controls.
 *
 * `of` JOINS THE DANGLING-RANGE ARM AND NOT THE CONNECTIVE LIST — 2026-10-01
 * (12:2xZ). `rates of 4.25% to` states a range this predicate could not see,
 * because the only preposition the dangling arm names is `from`. The obvious
 * repair is to add `of` to the rang/between/vary/from alternation in the FIRST
 * arm, and it was measured and REFUSED: that arm needs no second number, so it
 * reaches `Fixed rate of 3.00%`, `Guaranteed rate of 2.25%` and `Stable Value
 * Fund crediting rate of 3.11%` — ordinary crediting rates with no range at
 * all — and this predicate REPLACES the displayed name rather than qualifying
 * it. What ships is one token inside the arm that already exists for the
 * sibling preposition, so `of` must still be followed by `N%` and a `to`. */
const LOAN_DESC_RANGE = /\brates?\b[^.;]{0,40}?\b(?:rang(?:e|es|ing)|between|vary|varying|from)\b|\b\d+(?:\.\d+)?\s*%?\s*(?:to|[-–—])\s*\d+(?:\.\d+)?\s*%|\b(?:from|of)\s+\d+(?:\.\d+)?\s*%\s*(?:to|[-–—])/i;
const LOAN_DESC_WORDS = /\b(?:participants?|participation|loans?|notes?|promissory|receivable|outstanding|balances?|interest|rates?|ranging|range|ranges|rang|between|varying|various|vary|varies|bearing|earning|carrying|accruing|maturing|maturity|maturities|due|payable|dated?|dates|through|until|to|from|at|with|of|and|or|the|a|an|per|annum|annually|percent|pct|secured|collateralized|collateral|by|vested|terms?|years?|months?|less|more|than|generally|stated|fixed|variable|cost|no|later|amounts?|extending|into|repayment|plan|in|on|all|up)\b/gi;
const LOAN_DESC_MONTHS = /\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\b/gi;

/* A TRUNCATED WORD IS NOT A SURVIVING FUND NAME — 2026-09-30.
 *
 * The residue test above is load-bearing and must stay: it is what keeps
 * Griswold's `Interest Rate of 0.15% to 0.62% … Principal` GIC, where the
 * surviving `Principal` is a house name. But thirteen rows survive it on a
 * residue that is not a name at all — it is one of the words this rule ALREADY
 * STRIPS, cut mid-token by the filing's column width. Aimbridge Parent (53,606
 * participants) publishes `with varying maturity dates through August 2034,
 * bearing interest at 4.25% to 9.50% per an` at $6,206,114; the residue is
 * `mat`, `thr`, `dat`, `matu`, `Bear`, `balan`, `partic`, `Ap`, `Col`, `bear`,
 * `par`, `matur`, `rangi` — every one a proper prefix of a stripped word.
 *
 * So the discriminator is structural and needs no new vocabulary: a residue
 * token that is a PROPER PREFIX of a word this rule strips is that word, and
 * the vocabulary is DERIVED from the two regexes above rather than retyped, so
 * a later widening of either cannot leave this arm behind. Month names are
 * spelled out because `LOAN_DESC_MONTHS` matches `apr[a-z]*` and therefore
 * strips `April` whole while leaving `Ap`.
 *
 * The risk is named rather than rounded away: `bear` could open `Bear Stearns`
 * and `Col` could open `Columbia`. What contains it is that this test is asked
 * ONLY of a row whose name already states a rate RANGE (`LOAN_DESC_RANGE`), and
 * every flagged row was read. */
const LOAN_DESC_PREFIXABLE = (() => {
  const src = LOAN_DESC_WORDS.source.replace(/^\\b\(\?:/, "").replace(/\)\\b$/, "");
  if (src === LOAN_DESC_WORDS.source) {
    throw new Error("lib-disclose: LOAN_DESC_WORDS no longer has the \\b(?:…)\\b shape its prefix vocabulary is derived from — fix the derivation rather than shipping a quiet guard");
  }
  const out = new Set();
  for (const alt of src.split("|")) {
    const w = alt.trim();
    if (!w) continue;
    if (/^[a-z]+\?$/i.test(w)) { out.add(w.slice(0, -2)); out.add(w.slice(0, -1)); }
    else if (/^[a-z]+$/i.test(w)) out.add(w);
  }
  for (const m of ["january", "february", "march", "april", "may", "june", "july",
    "august", "september", "october", "november", "december"]) out.add(m);
  if (!out.has("maturing") || !out.has("through") || !out.has("april") || !out.has("date")) {
    throw new Error("lib-disclose: the loan-word prefix vocabulary lost an entry the shipped cases depend on — the derivation is broken");
  }
  return [...out];
})();
function isTruncatedLoanWord(tok) {
  const t = tok.toLowerCase();
  return LOAN_DESC_PREFIXABLE.some((w) => w.length > t.length && w.startsWith(t));
}
export function loanDescriptionResidue(name) {
  return String(name || "")
    .replace(/\d+(?:\.\d+)?\s*%/g, " ")
    .replace(/\b(?:19|20)\d{2}\b/g, " ")
    .replace(/\b\d+(?:\.\d+)?\b/g, " ")
    .replace(LOAN_DESC_MONTHS, " ")
    .replace(LOAN_DESC_WORDS, " ")
    .replace(/[^A-Za-z]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter((t) => t.length >= 2 && !isTruncatedLoanWord(t));
}
export function isLoanDescriptionRow(name) {
  const s = String(name || "").trim();
  if (!s || !/\d/.test(s) || !LOAN_DESC_RANGE.test(s)) return false;
  return loanDescriptionResidue(s).length === 0;
}

/* A NAME THAT IS NOTHING BUT LOAN VOCABULARY IS THE LOAN ROW — 2026-10-01
 * (12:2xZ). The fourth member of the family, and the one the anchor cannot
 * reach: `LOAN_ROW` requires the name to BEGIN with the loan word, which is
 * exactly what keeps `Bank Loan Fund` safe — so `OUTSTANDING LOAN BALANCE`
 * (81 rows), `Outstanding Plan Loans`, `Loans to Plan Participants` and
 * `Loans with` sit outside it BY CONSTRUCTION, the leading word being an
 * ordinary adjective. A missing entry in an anchored list hiding a class, for
 * the seventh recorded time; here the missing entry is a leading adjective,
 * so no list can be widened and the test has to be structural.
 *
 * IT NEEDS NO VOCABULARY OF ITS OWN. `loanDescriptionResidue` already strips
 * the loan words, and `fund`, `trust`, `portfolio` and `etf` are DELIBERATELY
 * ABSENT from that list — which is why every real holding keeps a residue and
 * is refused without a single fund name being enumerated:
 *
 *   `Bank Loan Fund`                  -> bank, fund
 *   `Floating Rate Loan Fund`         -> floating, fund
 *   `Senior Loan Portfolio`           -> senior, portfolio
 *   `Loan Participation Fund`         -> fund
 *   `Invesco Senior Loan ETF`         -> invesco, senior, etf
 *   `LOANS SECURED BY MTGES-RESID.`   -> mtges, resid     (J&J's real mortgage)
 *   `VOLKSWAGEN AUTO LOAN ENHANCED TRUST`, `FEDERAL HOME LOAN BANK OF BOSTON`,
 *   `Freddie Mac Whole Loan Securities Trust`  — all refused the same way.
 *
 * A `NOTE` IS A SECURITY BEFORE IT IS A LOAN, and the draft's own output is
 * what said so: a first version asking only for a loan-or-note word caught 37
 * rows of `Note @ 1.500% Maturing 2/15/2030` and `Note 3.150% due 03/15/2027`
 * — Treasury and corporate notes in a real bond sleeve, every one of which
 * empties the residue. So `loan` stands alone and `note`/`promissory` must be
 * accompanied by a participant or receivable marker, each of which is already
 * in the strip vocabulary. COST NAMED, 6 rows: `Notes with`, `Notes with
 * various`, `Notes with varying`, `Secured Notes`, `all outstanding notes` and
 * `9.50% on all outstanding notes` are genuine loan fragments refused with the
 * bonds — refusing a repair is the safe direction.
 *
 * 376 rows / 353 plans / 629,481 participants / $1,472,918,683 before the
 * possessive arm above takes its share. All 83 distinct names read, not one a
 * fund; 1 publishes a ticker and 0 a fee, so the harm is the CLAIM alone.
 * COST NAMED, 1 row: Northeast Community Bank (177 ppl) files `Participation
 * Loans` at 1.74%, which is a bank's idiom for a shared loan as readily as for
 * its own participants' — and a shared loan is not a menu choice either.
 *
 * TYPED, NOT DROPPED (v181): the value is the plan's loan balance, so it stays
 * in the denominator and no other row's published percentage moves. */
const LOAN_NOTE_MARKER = /\b(?:participants?|receivable|rec|promissory)\b/i;
export function isLoanVocabularyRow(name) {
  const s = String(name || "").trim();
  if (!s) return false;
  const hasLoan = /\bloans?\b/i.test(s);
  const hasNote = /\bnotes?\b|\bpromissory\b/i.test(s);
  if (!hasLoan && !(hasNote && LOAN_NOTE_MARKER.test(s))) return false;
  return loanDescriptionResidue(s).length === 0;
}

/* THE CUSTODIAN'S COUNTRY ROLL-UP CAPTION, AND THE RECORDKEEPER'S LOAN
 * ACCOUNTING LINE — the FIFTH member of this family, 2026-10-09.
 *
 * THE LABEL IS THE FILING'S OWN SECTION HEADING, which is why this is a repair
 * and not a judgement about shape. Northern Trust's `5500 Supplemental
 * Schedules` export nests its Schedule of Assets as
 * `<asset class> / <country> - <currency> / <row>`, and four filings were read
 * to settle it:
 *
 *   Packaging Corp     `Participant Loans` / `United States - USD` /
 *                      `&&&PACKAGING CORP. HOURLY PLAN   LOAN ASSET` $47,205,065
 *   Kohl's             `Participant Loans` / `United States - USD` /
 *                      `KOHL'S LOAN ACCOUNT` $44,362,425   (no `&&&` at all)
 *   The Kroger Co.     `Other` / `United States - USD` / `&&&KROGER LOAN ASSET`
 *                      $142,816,695, par == cost == value, CUSIP 000877001
 *   KPH Healthcare     `Participant Loans` / `EMPLOYEE LOANS` whose description
 *                      column reads `interest rates from 3.25% to 8.50%`
 *
 * Par equal to cost equal to current value is a loan receivable and not a
 * security; the CUSIPs are the custodian's placeholders. Our parse keeps the
 * COUNTRY caption and drops the section heading, so the reader is shown
 * `Other United States - USD &&&KROGER LOAN ASSET` as a fund in a menu.
 *
 * THE OTHER HALF IS THE RECORDKEEPER'S OWN ACCOUNTING SUB-ACCOUNT, same label
 * and the same filings' evidence: TIAA's `Plan Loan Default Fund` (194 rows)
 * is the bucket a DEFAULTED participant loan sits in — University of Puget
 * Sound files it in the description column of a `College Retirement Equities
 * Fund variable annuities` line at $27,154, two rows above its own
 * `Participant loans` entry — and `Loan Collateral Fund` / `Loan Escrow Fund`
 * are the accounts holding the collateral. Nobody can pick any of them.
 *
 * WHY `LOAN_ROW` AND ITS THREE SIBLINGS CANNOT REACH THESE. Every one is
 * anchored on the name BEGINNING with the loan word, which is exactly what
 * keeps `Bank Loan Fund` safe, and `isLoanVocabularyRow`'s residue test
 * deliberately holds no `fund`, `asset` or `account` — so `Plan Loan Default
 * Fund` keeps a residue and is refused. *A fix for one phrasing of a class is
 * not a fix for the class*, met here on a PREFIX and on an account noun.
 *
 * TWO ARMS, each measured necessary over all 2,651 published-and-served rows
 * carrying a loan word:
 *
 *   ARM A — the custodian's statement furniture (`&&&`, or a country/currency
 *     caption at the head) plus an account head. 10 rows / 1,336,126
 *     participants / $375,339,585, and it is the ONLY arm that reaches any of
 *     them: the plan's own name sits in the residue (`KROGER`, `HD SUPPLY`,
 *     `SUNCHEM`, `PAINEWEBBER INC., SAVINGS INVESTMENT PLAN`) and no residue
 *     test can be asked to know a sponsor from a fund house.
 *   ARM B — the residue test, with the account-line nouns added to the strip.
 *     361 rows / 1,064,407 participants / $162,908,913.
 *
 * ARM A TAKES THE PLACE OF A SPONSOR-NAME STRIP, DELIBERATELY. A first draft
 * stripped the plan sponsor's own tokens from the residue, which reached the
 * same rows — and made the verdict depend on WHICH plan is being viewed, so a
 * trust row would have been labelled on one member plan's page and left a
 * fund on another's. The custodian caption is the better witness anyway: it is
 * evidence about the DOCUMENT rather than about the name.
 *
 * EVERY CONDITION WAS PRICED BY LEAVE-ONE-OUT OVER THE LIVE STORE AND FOUR
 * WERE DELETED FOR BLOCKING NOTHING — a CUSIP/ISIN identifier strip, a
 * corporate-entity-word strip (`inc`, `ltd`, `limited`), a caption strip
 * inside ARM B, and ten of twenty-five candidate account nouns (`assets`,
 * `collateral`, `balance`, `balances`, `various`, `maturity`, `maturities`,
 * `reserves`, `totaling`, `employees` — the first four because
 * `LOAN_DESC_WORDS` already strips them, the rest because nothing in the store
 * needs them). *An exclusion that blocks nothing measurable is not a
 * protection.* The fifteen that survive are each necessary for at least one
 * row and most for a named handful: `account` 3 (`Plan Loan Collateral
 * Account`), `accounts` 1, `funds` 6, `reserve` 6, `defaulted` 3, `pldf` 6
 * (`PLDF# Plan Loan Default Fund`), `unitized` 2, `pooled` 1 (`Pooled Loan
 * Default Fund`), `issued` 3 (`Loans Issued at`), `other` 4, `asset` 2,
 * `escrow` 24, `employee` 12, `default` 219, `fund` 321.
 *
 * THE PARENTHESIS REFUSAL HAS A MEASURED SINGLE-PROTECTION CASE and it is the
 * only thing standing between this rule and a real holding: Ki Bois Community
 * Action's `Interest Account (Loan Collateral)` (351 participants,
 * $289,560) names MetLife's fixed interest account and states the loan
 * portion as an aside. Dropping the refusal admits exactly that one row. The
 * same shape protects four larger rows that ARM B already refuses on their
 * residue — `Fidelity VIP ContraFund Portfolio (includes loan collateral
 * fund)` carries ticker FCNTX, and `TIAA Traditional Annuity Contracts FBR
 * (GSRA, SRA, RCP, and Plan Loan Default)` is a real annuity — so the
 * fixtures below pin the one case where it is the ONLY protection.
 *
 * THE ASSET-CLASS REFUSAL IS NAMED AS INERT RATHER THAN CLAIMED. `senior`,
 * `participation`, `syndicated`, `leveraged` and `obligation` block ZERO live
 * rows, because ARM B's residue already refuses every real member in the store
 * (`Invesco Senior Loan ETF` -> invesco, senior, etf; `Senior Loan Portfolio`
 * -> senior, portfolio; `Collateralized Loan Obligation` -> obligation). It is
 * kept because ARM A has NO residue test of its own, so a future
 * `… - USD MFO INVESCO SENIOR LOAN FUND` would otherwise be relabelled, and it
 * is the only guard that could refuse it. Its pin below is labelled a SHAPE
 * pin and proves no single protection.
 *
 * READER-FACING SIZE, with the serving condition applied (both surfaces serve
 * a trust's menu only where the plan's own lineup is unusable, so each row is
 * credited only to the member plans actually shown it): 371 rows / 339 served
 * menus / 2,400,533 participants / $538,248,498. **0 publish a ticker and 0 a
 * fee**, measured through the page's own renderer, so the harm was the CLAIM
 * alone and nothing is withdrawn but a false one. All 57 distinct names were
 * read. TYPED, NOT DROPPED: the value stays in the denominator, so no other
 * row's published percentage moves.
 *
 * NAMED RESIDUE, left alone and conservative: a recordkeeper BRAND in front of
 * the same account line keeps its residue and so keeps reading as a fund —
 * `VALIC Loan Collateral Fund` (11 rows), `TIAA Plan Loan Default Fund` (10),
 * `Transamerica LOAN FUND` (3), `CHARLES SCHWAB LOAN FUND` (4). Reaching them
 * needs a recordkeeper-brand witness, which is a different class with its own
 * machinery. */
const LOAN_ACCT_CAPTION =
  /^(?:(?:other|international|emerging\s+markets)\s+)*[a-z][a-z .,'()-]{2,40}?\s*-\s*(?:USD|EUR|GBP|CAD|JPY|CHF|AUD|SEK|DKK|NOK)\b/i;
const LOAN_ACCT_DELIM = /&&&/;
const LOAN_ACCT_NOUN = /\b(?:asset|account|accounts|fund|funds|reserve|escrow|default|defaulted|pldf|unitized|pooled|issued|employee|other)\b/gi;
const LOAN_ACCT_HEAD = /\b(?:asset|assets|account|accounts|fund|funds)\b/i;
const LOAN_ACCT_CLASS = /\b(?:senior|participation|syndicated|leveraged|securitized|securitised|obligation|obligations|whole)\b/i;
const LOAN_ACCT_PARENS = /\([^)]*\)/g;
export function isLoanAccountRow(name) {
  const s = String(name || "").trim();
  if (!s) return false;
  if (!/\bloans?\b/i.test(s)) return false;
  if (LOAN_ACCT_CLASS.test(s)) return false;
  /* the loan words must not be an ASIDE on a named holding: whatever sits
   * outside the parentheses has to be the loan line itself */
  if (!/\bloans?\b/i.test(s.replace(LOAN_ACCT_PARENS, " "))) return false;
  if ((LOAN_ACCT_DELIM.test(s) || LOAN_ACCT_CAPTION.test(s)) && LOAN_ACCT_HEAD.test(s)) return true;
  return loanDescriptionResidue(s.replace(/&&&/g, " ").replace(LOAN_ACCT_NOUN, " ")).length === 0;
}
/* Asserted at import, both directions. Every must-SEE case is a real filed
 * string from the live store; every must-KEEP case is either a measured
 * single-protection case or is labelled as a shape pin. */
for (const [s, why] of [
  ["Other United States - USD &&&KROGER LOAN ASSET", "the motivating row — $142,816,695, 2.2% of the trust's menu, 674,716 participants across its member plans"],
  ["United States - USD KOHL'S LOAN ACCOUNT", "$44,362,425 — the one member with NO `&&&`, so the caption half of ARM A is its only route"],
  ["United States - USD &&&HD SUPPLY LOAN ASSET", "The Home Depot's trust, 468,817 participants"],
  ["MCDONALD'S LOAN ASSETS McDonald’s Loan Asset&&& (4.25-9.50%, 2024-2029)", "the loan word is outside the parentheses, so the aside refusal must not fire"],
  ["United States - USD &&&PAINEWEBBER INC., SAVINGS INVESTMENT PLAN LOAN ASSET CUSIP : 999982", "the identifier run and a plan name in the residue"],
  ["United States - USD &&&SCHLUMBERGER LIMITED LOAN FUND", "an entity word in the residue"],
  ["Other United States - USD &&& COCA COLA LOAN ASSET", "a space after the delimiter"],
  ["Other United States - USD &&& WK KELLOGG CO LOAN ASSET", ""],
  ["United States - USD &&&SUNCHEM PART. LOAN FUND", "an ABBREVIATED sponsor, which no sponsor-token strip would have reached"],
  ["Other United States - USD &&&UBS PR LOAN ASSET CUSIP : 000810283", ""],
  ["PLAN LOAN ASSET", "Packaging Corp's salaried plan, $14,870,723 — ARM B, no caption at all"],
  ["LOAN ASSET", "Packaging Corp's hourly plan, $47,205,065"],
  ["Plan Loan Default Fund", "194 rows — the commonest member, so a regression to 0 would look quiet"],
  ["Loan Collateral Fund", "50 rows"],
  ["LOAN ESCROW FUND", "7 rows — `escrow` is necessary for 24"],
  ["EMPLOYEE LOANS", "10 rows — `employee` is necessary for 12"],
  ["PLDF# Plan Loan Default Fund", "6 rows — `pldf` is necessary for exactly these"],
  ["Pooled Loan Default Fund", "1 row — `pooled` is necessary for exactly this one"],
  ["Loans Issued at", "`issued` is necessary for 3"],
  ["Other - Loan Reserve", "`other` and `reserve`, 3 rows"],
]) if (!isLoanAccountRow(s)) {
  throw new Error(`lib-disclose: isLoanAccountRow no longer reaches ${JSON.stringify(s)} (${why}) — the arm is inert, fix it rather than shipping a quiet guard`);
}
for (const [s, why] of [
  ["Interest Account (Loan Collateral)", "351 ppl / $289,560 — MetLife's real fixed interest account; the PARENTHESIS refusal is the ONLY protection, measured"],
  ["Bank Loan Fund", "a real bank-loan fund — `bank` in the residue is the only protection"],
  ["Floating Rate Loan Fund", "likewise, `floating`"],
  ["Invesco Senior Loan ETF", "a registered ETF"],
  ["First Trust Senior Loan ETF", "likewise"],
  ["Senior Loan Portfolio", "a real portfolio"],
  ["Loan Participation Fund", "SHAPE PIN for the asset-class refusal — out of population, proves no single protection"],
  ["United States - USD &&&MFO INVESCO SENIOR LOAN FUND", "SHAPE PIN: the constructed case ARM A would otherwise relabel, and the asset-class refusal is its only guard"],
  ["Collateralized Loan Obligation", "Nuvance Health, $177,637 — a real security class"],
  ["LOANS SECURED BY MTGES-RESID.", "Johnson & Johnson's real mortgage holding, $76,510,398"],
  ["LOANS SECURED BY MTGES-COM'L", "likewise, $19,057,019"],
  ["FEDERAL HOME LOAN BANK OF BOSTON", "Pentegra, $115,744,176 — an agency bond"],
  ["Federal Home Loan Bank of Chicago", "likewise"],
  ["WINDSOR FEDERAL SAVINGS & LOAN ASSOC", "a bank, $16,118,681"],
  ["VOLKSWAGEN AUTO LOAN ENHANCED TRUST", "a securitisation"],
  ["Federal Home Loan Mortgage Corp", "Freddie Mac"],
  ["Toyota Auto Loan Extended Note Trust 2024-1", "Wells Fargo's synthetic GIC collateral"],
  ["CCRR PARENT, INC. TERM LOAN", "HCA, a real term loan held in a bond sleeve"],
  ["BEACH POINT LOAN FUND LTD", "Stoel Rives, $16,855,055 — a real fund"],
  ["Fidelity VIP ContraFund Portfolio (includes loan collateral fund)", "carries ticker FCNTX — the residue refuses it and the aside refusal does too"],
  ["Fixed Account - Lincoln National Life (and Loan Reserve)", "a real fixed account"],
  ["MetLife Guaranteed Fixed Account & Loan Collateral", "a real guaranteed account"],
  ["TIAA Traditional Annuity Contracts FBR (GSRA, SRA, RCP, and Plan Loan Default)", "a real annuity contract, $6,295,859"],
  ["contract loan reserves Lincoln Fin. Group Trust Co., Inc. Lincoln Stable Value Account", "names a real stable value account, $89,900,705"],
  ["VALIC Loan Collateral Fund", "NAMED RESIDUE, left alone on purpose: a recordkeeper brand keeps its residue"],
]) if (isLoanAccountRow(s)) {
  throw new Error(`lib-disclose: isLoanAccountRow would relabel ${JSON.stringify(s)} (${why}) — it names a holding, fix the predicate rather than the control`);
}

/* THE FILING NAMED NO FUND — one decision, asked by both display paths.
 *
 * A row whose whole name is a bare vehicle type (`Mutual funds`,
 * `Common/collective trust funds`, decorated variants such as `Sub-total:
 * Registered Investment Companies`) identifies nothing. The report can say so
 * in its type column; the static page has no type column and must say it in
 * the name. Either way the same four shapes must be EXCLUDED, and each
 * exclusion is load-bearing rather than cosmetic:
 *
 *   - employer stock — `COMMON STOCK` is 110 of these rows store-wide and both
 *     surfaces already carry the PLAN'S OWN ticker for it, so the filing does
 *     identify the holding and "no specific fund" would be false;
 *   - a row the FILING calls a subtotal (v181, 2 rows) and one typed as a
 *     brokerage window — both already say what they are.
 *
 * THERE IS NO LOAN ARM AND NO BROKERAGE-BY-NAME ARM, and their absence is
 * measured rather than an oversight. Both were written, and the negative
 * control on the second FAILED TO FAIL: removing it left every test green.
 * The reason is structural — a name must be a bare vehicle type before any
 * exclusion is reached, and `Participant loans` and `Self-Directed Brokerage
 * Account` are not vehicle types, so neither arm can ever be asked. Measured
 * across all 912 published rows whose cleaned name is generic: subtotal 2,
 * employer stock 110, brokerage-by-type 0, brokerage-by-name 0, loans 0. The
 * two that cannot fire are gone; carrying unreachable code as though it were
 * protecting someone is how a guard's absence gets mistaken for its presence.
 *
 * THE ISSUER IS NOT AN EXCLUSION HERE, and that is the correction this
 * function exists to make. app.js excluded any row carrying an issuer because
 * app.js PRINTS the issuer before the name, so `Vanguard · Mutual Fund Shares`
 * reads as a named holding. The static generator printed the name alone, so
 * the same row was nameless there — the exclusion was sound for one surface
 * and wrong for the other. The generator now prints the issuer too, which is
 * what makes one shared rule correct for both.
 *
 * Takes the row and its already-cleaned display name, because the two callers
 * clean at different points. app.js keeps a twin (browser script, no modules);
 * `smoke-test.mjs` runs the browser copy against this one and fails on drift. */
/* A NAME WITH NO FUND IDENTITY IN IT AT ALL — 2026-10-03 (06:2xZ).
 *
 * Found by the 04:2xZ draw and sized through the shipped guard's own
 * conditions. `isGenericTypeName` is a CLOSED vocabulary of Schedule H type
 * labels — "registered investment company", "collective trust", "mutual
 * funds", "pooled separate accounts" — so it reaches a row named
 * `Collective investment trusts` and is blind to one named `shares`, `Fund`,
 * `UNIT`, `Institutional Class` or `E.I.N. 23-`. Those are not type labels,
 * they are FRAGMENTS, and no guard reaches them.
 *
 * WIDENING `GENERIC_TYPE_NAME` IS THE WRONG FIX AND ITS OWN COMMENT SAYS SO:
 * the parser's region selection and the dominant-row audit read that constant,
 * and widening it made 3M's fair-value note CONFIDENT by deleting its $18.4B
 * `Common/collective trusts` row and moved Lam Research's sum by $453M. So
 * this is a DISPLAY-ONLY predicate, composed into `isNamelessFundRow`'s
 * injected name test at the two render call sites and nowhere else. No
 * re-parse, no effect on which region wins.
 *
 * SIZE, measured with the issuer gate and the already-qualified set removed,
 * because the shipped call site imposes both: **486 rows / 325 plans /
 * 1,131,917 participants / $5,934,254,604** would be newly qualified. A
 * further 343 rows / 820,836 ppl carry an ISSUER and are deliberately left
 * alone (`Vanguard Target Retirement 2030 · Mutual Fund Shares` reads as a
 * named holding), and 103 rows / 565,787 ppl are already qualified today.
 *
 * These are small plans where the unnamed row is the MAJORITY of the menu:
 * Behavioral Connections publishes `Portfolio` at 96.0%, Hui Manufacturing
 * `Fund` at 80.8%, Avi Systems `shares` at 69.4% of a $303,975,100 menu,
 * Eldercare of Minnesota `E.I.N. 20-` at 87.6% — an employer-identification
 * number published as a holding. All 309 distinct names were read: not one
 * identifies a fund.
 *
 * IT TESTS THE CLEANED FORM TOO, AND THAT IS NOT BELT-AND-BRACES. app.js:3148
 * passes `f.name` (RAW) into the parameter the definition calls `cleanedName`,
 * while build-seo-pages.mjs:257 passes the cleaned string. Measured: the two
 * agree on 467 rows and differ on 16, and in all 16 it is the CLEANED name
 * that has no identity (`Mutual fund, 102,311.9 shares` cleans to
 * `102,311.9 shares`) — 0 go the other way. Testing both forms makes the
 * report and the crawlable pages agree without changing what either passes,
 * which would move the EXISTING guard's population and needs its own
 * measurement. */
const NO_IDENTITY_FILLER = /\b(?:class|cl|cls|series|ser|unit|units|share|shares|shs|institutional|instl|inst|investor|inv|adv|advisor|advisors|retirement|r[1-6]|[a-z]|\d{1,3}|common|collective|trust|trusts|fund|funds|the|at|nav|portfolio)\b/gi;
const stripsToNothing = (s) =>
  String(s).replace(NO_IDENTITY_FILLER, " ").replace(/[^A-Za-z0-9]+/g, " ").trim().length === 0;
/* An EMPLOYER-IDENTIFICATION NUMBER published as a holding. `E.I.N. 20-` is
 * caught by the filler strip, but the OCR'd I/L variant `E.LN. 81-` is NOT —
 * "LN" survives as a two-letter token and reads as an identity. Three rows /
 * 559 participants (The Alexander Group, St Henry Tile, Bblbc at 56.5% of its
 * own menu), and a form-field fragment is never a fund under any spelling. */
const EIN_FRAGMENT = /^e\.?\s?[il]\.?\s?n\.?\s*[\d\s\-‐–—]*$/i;
export function hasNoFundIdentity(name) {
  const s = String(name || "").trim();
  if (!s) return false;              /* an empty name is a different case */
  if (EIN_FRAGMENT.test(s)) return true;
  return stripsToNothing(s) || stripsToNothing(cleanFiledName(s));
}

/* A NAME BUILT ENTIRELY OF TYPE-LABEL WORDS — canonical copy, 2026-10-04.
 *
 * 152 rows / 132 plans / 1,232,895 participants / $42,859,386,021, across 43
 * distinct names, EVERY ONE OF WHICH WAS READ rather than sampled. Providence
 * Health publishes `Registered investment company funds` at 48.0% of one
 * plan's menu ($12,474,349,571) and on three more plans; Trinet HR III and IV
 * publish `Registed Investment Co.` to 280,299 readers ($1,239,771,549); 3M
 * publishes a bare `companies` on 25 rows totalling $14,372,175,818; Ford
 * publishes `Separate Account`; Cigna a bare `account` on 15 rows.
 *
 * WHY `isGenericTypeName` CANNOT REACH THEM, and why the vocabulary must not be
 * widened to try: GENERIC_TYPE_NAME is a CLOSED list of Schedule H type labels
 * anchored `^...$`, so it answers `registered investment companies` and not
 * `registered investment company funds` — one trailing noun away. Its own
 * comment refuses widening because the PARSER reads it: `isClassLabel` ->
 * `isStatement` -> the region contest, which is what cost v196 two whole
 * lineups on a +0/-0 registration. And `hasNoFundIdentity` cannot reach them
 * either: its filler list holds `common|collective|trust|fund|the|at|nav` but
 * not `regist*`, `investment`, `company` or `account`, which is exactly why
 * `Collective trust fund` is already covered and these are not.
 *
 * SO THIS IS A THIRD DISPLAY-ONLY PREDICATE, kept OUT of both of those for a
 * measured reason rather than a stylistic one: `merge-4i.mjs:1394` guards its
 * share-count repair with `isGenericTypeName(head) || hasNoFundIdentity(head)`,
 * so widening either would make more heads read as generic and SILENTLY REFUSE
 * MORE NAME REPAIRS — a legibility fix priced against a guard that reads names.
 * Being a separate export, it bounds the blast radius to the two display call
 * sites BY CONSTRUCTION.
 *
 * THE INSTRUMENT WAS NARROWED TWICE BY READING ITS OWN OUTPUT, and that is the
 * whole of the safety argument. The queue sized this class at 88 rows inside a
 * `/regist/` screen — a count keyed on a vocabulary, which measures the
 * vocabulary. The general form of the discriminator ("remove the leading run of
 * label words and ask whether anything of substance remains") reads 611 rows /
 * 1,991,593 ppl, and reading THAT refused it as one class: it merges genuine
 * label-only names with four other remedies. So the shipped form demands that
 * EVERY word be a label word, with one tolerated exception.
 *
 * BOTH CONDITIONS HAVE A LIVE BLOCKING POPULATION, measured by neutering each
 * one separately over all 1,730,670 published rows:
 *
 *   - THE PAGE-REFERENCE TOLERANCE ADDS 2 rows / 80,475 ppl, both National
 *     Rural Electric's and both on its one crawlable page. A pointer into the
 *     filing is not a fund, and without this arm both rows are missed.
 *     ITS PLURAL/RANGE SPELLING WAS FOUND BY READING THE PAGE AND NOT BY A
 *     COUNT. The first version took a singular `(page 166)` only, so the
 *     regenerated page qualified `Registered Investment Companies (Page 166)`
 *     ($225,158,578) and left `Common Collective Trusts (Pages 165-166)` —
 *     **$9,284,475,171, 48.6% of that plan's menu and the LARGEST row on the
 *     page** — reading as a named holding two rows above it. The argument for
 *     the wider spelling is not symmetry but consistency with a predicate
 *     already shipped: `isGenericTypeName("Common Collective Trusts")` is
 *     TRUE, so the bare caption is qualified already and only the page pointer
 *     defeated it. Measured: the widening adds exactly that one row, and
 *     `Corporate Stocks (Pages 56-155)`, `U.S. Government Securities (Pages
 *     23-27)` and `Managed Account Holdings (985 Positions)` on the same page
 *     all stay out — the first two by the LABEL condition (`Stocks`,
 *     `Securities`) and the third because a POSITION count is not a pointer.
 *     *The page is the artifact: a diff of 13 files showed both halves of one
 *     caption family and a row count could not.*
 *   - REQUIRING EVERY WORD TO BE A LABEL BLOCKS 57 rows / 174,038 ppl, and all
 *     43 blocked names were read: each is a DIFFERENT remedy. A welded VINTAGE
 *     is identifying information (`Fund 2030` through `Fund 2065`, a whole
 *     Capital Manor ladder; `Investments VG 2030`); a real designation must
 *     stand (`SEPARATE ACCOUNT II`, `Separate Account - Z`); OCR debris is the
 *     welded-count class's business (`Pooled Separate Acct Ae`, `Company ba`,
 *     `Mutual fund ae`); and a trailing joiner is the truncated-name class
 *     (`Investment in`, `Shares in`).
 *
 * THE v188 PIN IS NOW RESPECTED BY CONSTRUCTION RATHER THAN BY EXCEPTION.
 * lib-4i deliberately leaves `Separate Account A` uncaught because a capital
 * `A` may be a real separate-account designation and case is the only signal —
 * Four Seasons Heating publishes it at 91.5% of its menu. `A` is not a label
 * word, so this predicate spares it without being told to, and that is a
 * single-protection negative control rather than a hand-written exemption.
 *
 * SEVEN ROWS IT REACHES ARE EMPLOYER STOCK, and the COMPOSITION is the only
 * thing that protects them — measured, not supposed. This predicate is
 * INJECTED INTO `isNamelessFundRow` as part of its generic-name test, never
 * added as a parallel disjunct at the call site, so all three of that
 * function's early returns — subtotal, brokerage window, employer stock —
 * guard the new arm. As a sibling disjunct it would have told readers that
 * these seven rows name no specific fund:
 *
 *     Altria Client Services  `Shares`      $1,456,691,207  26.6%  ticker MO
 *     Sealed Air Corporation  `Shares of`   $  136,743,941   9.0%
 *     Ford Motor Company x2   `Separate Account`             0.6% / 0.3%
 *     Gardiner Service Co.    `REGISTERED COMPANIES`         3.9%
 *     Integrated Mill Systems `Registered Companies`         1.0%
 *     Manganaro North America `Shares`                       0.2%
 *
 * Every one is typed `Company stock`, and Altria's carries a correct symbol on
 * $1.46B in front of 11,893 readers. *Where a predicate is composed decides
 * what protects it* — and the flat screen that sized this class counted six of
 * these seven, so the renderer diff reading 146 where the screen read 152 is
 * the protection working rather than a number to reconcile away.
 *
 * The ISSUER half of the call-site gate is left on the narrower
 * `isGenericName` on purpose: whether a label-only string in the ISSUER cell
 * should also stop a row reading as named is a separate measurement, recorded
 * rather than assumed. docs/accuracy-log.md 2026-10-04. */
const LABEL_ONLY_WORD = /^(?:regist\w*|inv\s?estment|investments?|compan(?:y|ies)|co\.?|funds?|fds?\.?|mutual|common|collective|pooled|separate|sep\.?|account|accounts?|acct\.?s?|trust|trusts?|tr\.?|shares?|of|the|at|nav|[\(\)\[\],.:;-]+)$/i;
const LABEL_ONLY_PAGE_REF = /^\(?(?:pages?|pgs?\.?|pp\.?|p\.?|notes?|lines?|items?)\s*\d+\s*(?:(?:[-–—]|to)\s*\d+\s*)?\)?$/i;
export function isLabelOnlyName(name) {
  const w = String(name == null ? "" : name).trim().split(/\s+/).filter(Boolean);
  if (!w.length) return false;
  let i = 0;
  while (i < w.length && LABEL_ONLY_WORD.test(w[i])) i++;
  if (!i) return false;                      /* does not even START with a label */
  const rest = w.slice(i).join(" ");
  return !rest || LABEL_ONLY_PAGE_REF.test(rest);
}
/* ASSERTED AT IMPORT, in this file's own style and for this file's own reason:
 * a predicate whose patterns stop matching answers false and reports nothing,
 * so the arm would go inert while every count built on it kept printing a
 * plausible number — and a BROKEN arm and an INERT arm read the same zero.
 * Both directions are pinned, and each must-KEEP is a case where the named
 * condition is the ONLY protection. */
for (const [s, why] of [
  ["Registered investment company funds", "Providence Health, 48.0% of its menu"],
  ["Registed Investment Co.", "Trinet HR III/IV, 280,299 readers"],
  ["Registered investment companies (page 166)", "National Rural Electric, $225,158,578"],
  ["Common Collective Trusts (Pages 165-166)", "the SAME page's largest row, $9,284,475,171 at 48.6% — the plural/range spelling"],
  ["companies", "3M, 25 rows / $14.37B — a one-word label"],
  ["Separate Account", "Ford Motor"],
  ["shares of", "American Financial Group, 23 rows"],
]) if (!isLabelOnlyName(s)) {
  throw new Error(`lib-disclose: isLabelOnlyName no longer reaches ${JSON.stringify(s)} (${why}) — the arm is inert, fix it rather than shipping a quiet guard`);
}
for (const [s, why] of [
  ["Separate Account A", "the v188 pin — a single capital is the ONLY protection"],
  ["The Investment Company of America", "a real fund — the place name is the ONLY protection"],
  ["New York registry shares", "Pfizer — `registry` is not `registered`"],
  ["Fund 2030", "a welded vintage — the digits are the ONLY protection"],
  ["SEPARATE ACCOUNT II", "a real designation"],
  ["Pooled Separate Acct ia", "OCR debris — a different remedy"],
  ["Investment in", "a trailing joiner — the truncated-name class"],
  ["Corporate Stocks (Pages 56-155)", "same page, same pointer — `Stocks` identifies a vehicle"],
  ["Managed Account Holdings (985 Positions)", "a POSITION count is not a page pointer"],
  ["Vanguard Total Stock Market Index Fund", "a real fund"],
  ["Costco Wholesale Corporation", "employer stock"],
  /* A TRAILING BARE NUMBER MUST NOT JOIN `LABEL_ONLY_PAGE_REF` — REFUSED
   * 2026-10-09, and the queue entry that asked for it was wrong about its own
   * named member twice over.
   *
   * The register recorded a residue of "163 rows / 37 plans / 155,819 ppl"
   * whose mechanism was "a trailing NUMBER defeats the end-anchor", named
   * through Touro's `… companies 693`. Both halves fail:
   *
   *   THE BARE STRING IS ALREADY QUALIFIED. `isGenericTypeName("Registered
   *     investment companies 693")` is TRUE — the parser's own closed
   *     vocabulary tolerates the trailing number — so there was never anything
   *     for this predicate to reach.
   *   THE ROW AS FILED IS DEFEATED AT THE START, NOT AT THE END. Touro files
   *     `FID SEL UTILITIES Registered investment companies 693`, and `FID` is
   *     not a label word, so the leading-run test returns false before the
   *     remainder is ever examined. That row is a WELDED real fund name
   *     (Fidelity Select Utilities), which is a different recorded class and
   *     the opposite remedy.
   *   The entry's other named member, True Mfg's parenthesised `(Registered
   *     Investment Company)`, is the same shape: all 27 rows carrying that
   *     parenthetical name a real fund (`500 Index Fund (Registered Investment
   *     Company)`, issuer `Fidelity`, publishing FXAIX at 0.03 on $36,299,009).
   *
   * MEASURED over the 1,721,920 published-and-served rows: a shown name that
   * would be label-only but for a trailing number is **28 rows / 13 acks /
   * 95,561 ppl**, and the widening gains NOTHING — 8 of the 28 (NYU and NYU
   * Langone's `Mutual funds 3`, `Pooled separate accounts 2`) are already
   * qualified by `isGenericTypeName`, and the rest are a welded SHARE COUNT
   * whose issuer cell names the fund (`Mutual Fund 129,979` / iss `Fidelity
   * Global Ex US Index`) or Capital Manor's target-date ladder, which this
   * predicate's own pin below already refuses. *A count keyed on a character
   * measures the character.*
   *
   * AND THE PIN THAT WOULD HAVE STOPPED IT WAS ALREADY HERE: `Fund 2030`, "the
   * digits are the ONLY protection". One grep of the fixtures for the
   * motivating shape settles this entry without a measurement. */
  ["Registered investment companies 693", "Touro's trailing number — ALREADY qualified by isGenericTypeName, so this predicate has nothing to gain and widening it would reach Capital Manor's vintages"],
  ["Mutual Fund 129,979", "TDK-Lambda — a welded SHARE COUNT whose issuer cell reads `Fidelity Global Ex US Index`"],
]) if (isLabelOnlyName(s)) {
  throw new Error(`lib-disclose: isLabelOnlyName would qualify ${JSON.stringify(s)} (${why}) — it names something, fix the predicate rather than the control`);
}

/* A SENTENCE IS NOT A NAME — 2026-10-04 (12:2xZ).
 *
 * 53 published rows / 54 plans / 484,457 participants / $9,498,704,315 publish,
 * as a holding's name, a SENTENCE ABOUT the holding or a caption listing an
 * account's contents. American Airlines (132,820 ppl) publishes `Separately
 * managed account which includes: Corporate Common Stocks, Registered
 * Investment` on **$9,448,603,045, 38.2% of its $24.76B menu**; Kaiser
 * Foundation Health Plan publishes `Loan Repayments are included` on two plans
 * holding 288,416 people between them; Lerner Corporation publishes `The
 * accompanying notes are an integral part of this schedule. LERNER
 * CORPORATION…` — the attachment's own footer — at 2.1% of its menu.
 *
 * THE REGISTER RECORDED THIS CLASS AS "2 rows / 288,416 ppl, and the honest
 * size is two", together with an explicit refusal to build a name-shape
 * predicate for a two-member class. That refusal was right about its own
 * evidence and wrong about the class, and the reason is the instrument: the
 * screen that sized it keyed on a VOCABULARY (`\bis\b`) and matched **`IS`,
 * the abbreviation for Institutional Shares**, so it read 3,328 rows whose top
 * members were correct abbreviated names (Cigna's `BLACKROCK SP 500 IDX (IS)`,
 * $3.4B, 91,385 readers) and the real members had to be dug out by hand.
 *
 * SO THIS SCREEN IS NOT KEYED ON A VOCABULARY. It requires a FINITE VERB
 * followed by a function word — a PREDICATE, which is the grammatical thing
 * that makes a string a sentence about the holding rather than a name for it.
 * `IS` the share class cannot match, because a share class is never followed
 * by `included`, `of`, `a` or `the`. Measured over all 1,724,192 published
 * rows: **53 match, and all 53 were read.** There is no false-positive
 * population to trade off, which is why this ships where the vocabulary
 * version could not.
 *
 * THE CLAIM IS DELIBERATELY THE WEAKER ONE. ~40 of the 53 are loan-repayment
 * notes carrying real dollars, and "Participant loans" would be a more
 * informative label — but the filed string is a NOTE, often a checkbox answer
 * (`Repayments are Included Yes`, `repayments are included : X`, `Loan
 * Repayments are included: @`), and whether the dollars beside it ARE the
 * loans or are merely noted as included elsewhere is not stated. Qualifying
 * the row says only that the filing names no specific fund, which is
 * unarguably true of every one of the 53. *A weaker claim that is certainly
 * true beats a stronger one that is probably true.*
 *
 * ONE ROW GAINS MORE THAN A LABEL: Indeed, Inc.'s `consisting of Cash, Money
 * Market and` publishes a fabricated **0.2%** expense ratio, because the fee
 * comes from a NAME-pattern table that priced a caption. `namelessRow` joins
 * the fee suppressors (app.js), so qualifying the row withdraws the fee too.
 *
 * DISPLAY-ONLY, and composed into `isNamelessFundRow` rather than added beside
 * it, for the reason that function's early returns exist: employer stock and
 * brokerage windows must be spared. None of the 53 is stock today — the
 * composition is what keeps that true of the 54th.
 * docs/accuracy-log.md 2026-10-04 (12:2xZ). */
const SENTENCE_PREDICATE = /\b(?:are|were|was|includes?|represents?|consists?|contains?|holds?|comprises?)\s+(?:included|a|an|the|of|in|by)\b/i;
const CONTENTS_CAPTION = /\b(?:which\s+includes?|consist(?:s|ing)\s+of|compris(?:ed|ing)\s+of|made\s+up\s+of|invested\s+in\s+the\s+following)\b/i;
export function isSentenceRow(name) {
  const s = String(name == null ? "" : name);
  return SENTENCE_PREDICATE.test(s) || CONTENTS_CAPTION.test(s);
}
/* Asserted at import, both directions, each must-KEEP a case where the named
 * condition is the ONLY protection. The must-SEE cases are the real filed
 * strings, because an arm that is broken and an arm that is inert read the
 * same zero — and the whole-store count here is 53, small enough that a silent
 * regression to 0 would look like a quiet store rather than a dead predicate. */
for (const [s, why] of [
  ["Separately managed account which includes: Corporate Common Stocks, Registered Investment",
    "American Airlines, $9,448,603,045 at 38.2% of its menu, 132,820 readers"],
  ["Loan Repayments are included", "Kaiser Foundation Health Plan ×2, 288,416 ppl"],
  ["Repayments are Included Yes", "a checkbox answer, 8 plans"],
  ["repayments are included : X", "Access Clinical Partners"],
  ["The accompanying notes are an integral part of this schedule. LERNER CORPORATION",
    "Lerner Corporation — the attachment's own footer"],
  ["Consists of short term investments", "W.R. Berkley"],
  ["consisting of Cash, Money Market and", "Indeed, Inc. — the one member publishing a fabricated 0.2 fee"],
  ["are Included", "Imagine Schools, $2,644,172 at 2.4%"],
]) if (!isSentenceRow(s)) {
  throw new Error(`lib-disclose: isSentenceRow no longer reaches ${JSON.stringify(s)} (${why}) — the arm is inert, fix it rather than shipping a quiet guard`);
}
for (const [s, why] of [
  ["BLACKROCK SP 500 IDX (IS)", "Cigna, $3.4B / 91,385 readers — `IS` is Institutional Shares; the FUNCTION WORD is the only protection"],
  ["VANG FTSE SOC IDX IS", "Amazon, $873,714,000 — same abbreviation, no following function word"],
  ["VANG IS TL STK MK IP", "Mayo, $1.6B at 10.68% of its menu — `IS` in the MIDDLE"],
  ["Income Fund", "a bare product name — no verb at all"],
  ["American Funds The Income Fund of America R6", "`of` follows a NOUN, not a verb — the verb list is the only protection"],
  ["Vanguard Institutional Index Fund", "a real fund"],
  ["Holdings in Transition", "`in` follows a noun"],
  ["T. Rowe Price Retirement Balanced Fund", "a real fund"],
  ["Hold Co A Stock Fund", "`Hold` is not `holds`/`held` as a finite verb here — `Co` follows, not a function word"],
  ["Separately Managed Account", "the bare vehicle name, with no contents listed, is a different class and a different remedy"],
]) if (isSentenceRow(s)) {
  throw new Error(`lib-disclose: isSentenceRow would qualify ${JSON.stringify(s)} (${why}) — it names something, fix the predicate rather than the control`);
}

/* A DANGLING PREPOSITION IS NOT AN ISSUER — 2026-10-04 (13:4xZ).
 *
 * The page composes a holding as `issuer · name`, so the 4i identity column is
 * published as an attribution. **422 published rows / 41 plans / 167,240
 * participants / $1,111,872,870 attribute their holding to a fragment** —
 * Ashland publishes `Shares of · VANG WINDSOR II ADM` on $98,806,045, 6.6% of
 * its menu, where the row's own ticker (VWNAX) and fee are both correct;
 * United Health Services on seven rows; Henry Schein on $89,744,575. **259 of
 * the 422 publish a ticker**, which is the proof that the NAME is a real fund
 * and only the attribution is noise.
 *
 * Seven distinct strings of the store's **15,683**: `Shares of` 366,
 * `SHARES OF` 26, `Investments in shares of` 26, `Shares in` 12, `Investments
 * in` 9, `Investment in` 8, `Interests in` 8. Each is a 4i identity column
 * describing the FORM of the holding, with its continuation in the description
 * column — so suppressing the cell loses nothing and the name keeps the fund.
 *
 * THIS IS A PRINT-SITE SUPPRESSION AND NOTHING ELSE, which is why ticker and
 * fee cannot move. `lookupTicker` reads `f.iss` at its own call site
 * (app.js:2471) and prepends it before asking the resolver; this predicate is
 * applied only where the issuer SPAN is composed, so resolution sees exactly
 * what it saw before. Ticker, fee, asterisk, name, type and the nameless
 * verdict are all unchanged BY CONSTRUCTION.
 *
 * ANCHORED AT BOTH ENDS, which is the whole safety: a run of holding furniture
 * joined by prepositions and ending on one, with no room for a proper name.
 * Exercised against **every distinct issuer string in the store** — 7 reached,
 * and the 264 strings that also end on a joiner are all KEPT, because they
 * name an entity: `Alerus Financial, N.A.` 274, `Wilmington Trust, N.A.` 224,
 * `John Hancock U.S.A.` 210, `JPMorgan Chase Bank, N.A.` 49.
 *
 * THE QUEUE ASKED A DIFFERENT QUESTION AND THE ANSWER TO THAT ONE IS NO. It
 * asked whether a label-only issuer should stop a row reading as NAMED, i.e.
 * whether to widen the call-site gate's issuer disjunct. Measured as a superset
 * by construction: **396 candidate rows / 36 plans / 47,885 ppl, and the
 * verdict moves on 0** — because wherever the issuer is empty of meaning the
 * NAME is a real fund, so the name test correctly refuses. The gate stays on
 * the narrower `isGenericName`, now by measurement rather than by deferral.
 * *Reading the rows a NO answer leaves behind is what found the real defect.*
 *
 * AND MY FIRST SCREEN FOR THIS READ 1,199 ROWS, inflated by the exact trap
 * `DANGLING_TAIL` above documents. I wrote the trailing-joiner test `/i`, so a
 * trailing capital `A` counted as the article: `Leidos Stable Value, A`
 * ($650,763,893), `SSGA S+P 500 INDEX SER A` (=SSSYX, $606,941,903),
 * `Corebridge Separate Account A` and `Wilmington Trust, N.A` are a share
 * class, a series letter, a separate-account designation and a trustee. *The
 * shipped code already knew the discriminator and I did not read it.*
 * **But case is the wrong guard for THIS predicate, and a fixture is what
 * showed that too:** `SHARES OF` fails a lowercase test while being incapable
 * of naming anything, because the case rule protects a trailing capital AFTER
 * A REAL NAME and here the whole string is furniture with no name for a
 * designation to attach to. So this one is case-insensitive and anchored
 * instead. docs/accuracy-log.md 2026-10-04 (13:4xZ). */
const NON_ISSUER_FURNITURE = "(?:shares?|units?|interests?|holdings?|investments?|amounts?|balances?|participations?|value)";
const NON_ISSUER_CELL = new RegExp("^" + NON_ISSUER_FURNITURE
  + "(?:\\s+(?:of|in)\\s+" + NON_ISSUER_FURNITURE + ")*\\s+(?:of|in)[\\s.,;:]*$", "i");
export function isNonIssuerCell(iss) {
  return NON_ISSUER_CELL.test(String(iss == null ? "" : iss).trim());
}
/* Asserted at import, both directions. The must-KEEP list is weighted toward
 * the `N.A.` family on purpose: those 264 strings are the live population this
 * predicate must never reach, and three of them were false positives of my own
 * first screen. */
for (const [s, why] of [
  ["Shares of", "366 rows — Ashland's $98,806,045 VWNAX row among them"],
  ["SHARES OF", "26 rows — an all-caps filing, where case carries no signal"],
  ["Investments in shares of", "26 rows — a THREE-word furniture run"],
  ["Shares in", "12 rows"], ["Investments in", "9 rows"],
  ["Investment in", "8 rows — also the named residue of the label-only ship"],
  ["Interests in", "8 rows"],
]) if (!isNonIssuerCell(s)) {
  throw new Error(`lib-disclose: isNonIssuerCell no longer reaches ${JSON.stringify(s)} (${why}) — the arm is inert, fix it rather than shipping a quiet guard`);
}
for (const [s, why] of [
  ["Wilmington Trust, N.A.", "224 rows — a real trustee; the ANCHOR is the only protection"],
  ["Alerus Financial, N.A.", "274 rows — the largest kept string in the store"],
  ["JPMorgan Chase Bank, N.A.", "49 rows"],
  ["John Hancock U.S.A.", "210 rows"],
  ["Voya Retirement Insurance and", "59 rows — TRUNCATED, so suppressing it would LOSE an identifiable insurer"],
  ["Capital Bank and", "50 rows — likewise truncated"],
  ["The Vanguard Group of", "truncated; the row publishes =VIIIX on $232,941,827"],
  ["Leidos Stable Value, A", "$650,763,893 — a trailing capital is a SHARE CLASS, the `/i` false positive"],
  ["SSGA S+P 500 INDEX SER A", "=SSSYX on $606,941,903 — a SERIES letter"],
  ["Corebridge Separate Account A", "41 rows — a separate-account designation"],
  ["Shares of registered investment companies", "a TYPE LABEL, a different class with a different remedy"],
  ["Investments measured at NAV", "the NAV-caption family, handled by the issuer GATE not by suppression"],
  ["Shares", "no preposition — a bare furniture word is not this class"],
  ["Investments", "likewise"],
  ["Dodge & Cox", "a real house"],
]) if (isNonIssuerCell(s)) {
  throw new Error(`lib-disclose: isNonIssuerCell would suppress ${JSON.stringify(s)} (${why}) — it names something, fix the predicate rather than the control`);
}

/* A SCHEDULE H ASSET-CLASS CAPTION WITH NO TYPE CELL TO DESCRIBE IT — canonical
 * copy, 2026-10-04 (16:5xZ).
 *
 * Found by the 15:07 draw. Verizon Communications (146,572 participants)
 * publishes a twelve-row CATEGORY TABLE as its fund menu, and the shipped
 * guards split it down the middle:
 *
 *   `COMMON/COLLECTIVE TRUST`   41.9%  $16,315,773,219  QUALIFIED
 *   `CORPORATE STOCK - COMMON`  24.9%  $ 9,699,087,087  NOT qualified, type `—`
 *
 * THE MECHANISM: `isGenericTypeName` reaches `CORPORATE STOCK`, `COMMON STOCK`
 * and `CORPORATE STOCKS` — and not `CORPORATE STOCK - COMMON`. It is a CLOSED,
 * WHOLE-STRING vocabulary, so a COMPOUND of two captions it already knows
 * escapes it. *A fix for one phrasing of a class is not a fix for the class*,
 * met on a hyphen. Widening it is refused by its own comment, because the
 * PARSER reads it for region selection and `audit-dominant-row` reads it too —
 * widening it once moved Lam Research by $453M. Hence a FOURTH display-only
 * predicate rather than a wider vocabulary.
 *
 * 767 rows / 780 plans / 4,977,804 participants / $33,050,283,650, across 140
 * distinct strings, EVERY ONE OF WHICH WAS READ. Largest:
 *
 *   Johnson & Johnson  `CORPORATE STOCKS - COMMON`  41.6%  $9,996,789,597  80,884 ppl
 *   Verizon            `CORPORATE STOCK - COMMON`   24.9%  $9,699,087,087 146,572 ppl
 *   Exelon             `Corporate stock - common`   44.5%  $2,335,879,293
 *   Eaton / PepsiCo / Comcast / Unilever / Becton Dickinson / Deere, same shape
 *   Continental Automotive `Government Bond`        50.0% of its whole menu
 *
 * THE VOCABULARY IS SCHEDULE H'S OWN CAPTION WORDS and nothing else — what a
 * filer is copying when they file the form's categories as a menu. Every token
 * of the name must come from it, which is what makes a real fund unreachable:
 * a product name carries a house, a series or a vehicle word that the form
 * never uses. EVERY EXCLUSION BELOW IS PRICED, measured as the set of published
 * names that are caption vocabulary except for exactly ONE token — so that
 * token is the only thing keeping the row named:
 *
 *   `fund`/`funds`  `Real Estate Securities Fund` =DFREX 581,803 ppl; `Stock Fund`
 *   `index`         `US Bond Index` 947,172 ppl / 488 rows
 *   `assets`        `OTHER ASSETS` 317,547 ppl / $2,575,635,840
 *   `employer`      `Employer Common Stock` 38,114 ppl / $230,268,669
 *   `total`         `Total Bond` 141,814 ppl — possibly a truncated `Total Bond Market`
 *   `general`/`account`/`insurance`  the insurer's general account, a different
 *                   class with its own recorded machinery
 *   `loan`/`loans`/`mortgage`  the loan label is appended by a DIFFERENT arm on
 *                   the same cell, so including them would double-label a row
 *   `income`/`equity`/`fixed`/`stable`  `Wellesley Income`, `Stable Value` 171,652 ppl
 *   the article `a`  41 rows ending in a capital `A`, which is a SHARE CLASS or
 *                   SERIES letter — `Government Bond A` $74,802,818 (Toll Bros).
 *                   This is the DANGLING_TAIL trap forty lines above, and it is
 *                   conservatism rather than a correction: none of the 41 carries
 *                   a ticker.
 *
 * Houses are outside by construction and that is measured too: `Fidelity
 * Government` (3,420,361 ppl, 2,123 rows) is protected by one token.
 *
 * NO TYPE CELL IS THE SECOND CONDITION, and it is the measurement rather than a
 * caveat. A caption whose TYPE column describes it is not a false fund claim —
 * Verizon's `INTEREST-BEARING CASH` at $1,767,488,802 is typed
 * `Cash / short-term`, so the reader is shown a category labelled as one. 1,294
 * caption-shaped rows are typed that way (Verizon's `CORPORATE DEBT INSTRUMENTS
 * - ALL OTHER` $1,060,409,593 typed `Corporate debt`; Exelon's and Delta's
 * `U.S. GOVERNMENT SECURITIES` typed `Government securities`) and are left alone.
 *
 * NAMED RESIDUE, because this condition is a property of ONE surface: the
 * crawlable pages have no type column, so those 1,294 rows print there with
 * nothing describing them. The predicate is deliberately not split per surface
 * — two copies of a rule is how two surfaces drift — so the typed rows stay
 * unqualified on both. Also left out: `Other Assets` (the token exclusion
 * above), and the Schedule H CAPTION sub-family that carries an ISSUER, which
 * the call-site gate decides and which the owner-gated category-table item
 * covers (Cisco's `Collective Trusts(1) at NAV`, $25,144,872,000).
 *
 * DISPLAY-ONLY, and INJECTED INTO `isNamelessFundRow` rather than placed beside
 * it, for the reason that function's early returns exist: `Corporate common
 * stock` is typed `Company stock` at Capital One ($601,782,789) and
 * `Corporate Stock : Common` is 84.2% of one plan's menu. Reading the type cell
 * from `f` inside the shared function is also why the static generator needs no
 * change at all. docs/accuracy-log.md 2026-10-04 (16:5xZ). */
/* THE ABBREVIATION WITH A SPACE INSIDE IT, added 2026-10-09 and found by
 * READING a page this ship had just changed rather than by a screen. Verizon's
 * trust files `U. S. GOVERNMENT SECURITIES` — a space after the first period —
 * two rows above `INTEREST-BEARING CASH` and `CORPORATE DEBT INSTRUMENTS`,
 * which the caption arm reaches; the token was spelled `u\.?s\.?a?`, so the
 * space leaves a bare `S` that no alternative matches and the predicate missed
 * it. $2,765,872,513 served to FOUR member plans / 153,901 participants, from
 * the same twelve rows as two captions already labelled: *one of two spellings
 * of a caption family is worse than neither*, the National Rural Electric
 * lesson, met on a space instead of a plural.
 *
 * PRICED AS A SUPERSET BY CONSTRUCTION — adding an alternative can only make
 * the regex match MORE — over all 1,730,931 stored lineup rows: ONE name moves,
 * and it is that one. Nothing UNTYPED moves, so the report's nameless label
 * cannot change; the only consumer of the new verdict is the crawlable pages'
 * asset-type descriptor. The ten other spaced-abbreviation names in the store
 * are already blocked by the whole-string requirement and stay blocked —
 * `U S TREASURY NOTE` (`treasury` is absent from this vocabulary while `note`
 * is in it, so that one token is its ONLY protection), `U S TREASURY REPO`,
 * `Cohen & Steers U S Realty CIT Class A`, `iShares U. S. Aggregate Bond Index
 * K`. *A count keyed on a character measures the character*: a screen for the
 * spaced form alone reads 14 rows / $12.5B and 10 of them are real securities. */
const CAPTION_WORD = "(?:interest|interests|bearing|cash|equivalent|equivalents|u\\.?\\s*s\\.?a?|united|states"
  + "|government|governmental|securities|security|corporate|corporation|debt|instrument|instruments"
  + "|preferred|common|stock|stocks|share|shares|partnership|partnerships|joint|venture|ventures"
  + "|real|estate|properties|property|buildings|municipal|bond|bonds|note|notes|collective|trust|trusts"
  + "|pooled|separate|master|registered|investment|investments|company|companies|nav"
  /* THE FILER'S OWN ABBREVIATIONS AND ONE ACRONYM, added 2026-10-04 (18:3xZ).
   * The vocabulary above spells Schedule H's captions out in full, so a filer
   * who abbreviated escaped it — found by READING Johnson & Johnson's own page
   * after the first ship, where three untyped rows stayed unqualified two lines
   * under rows that had just been fixed. 23 published rows / 30 plans / 601,843
   * participants / $24,345,240,501, with ZERO tickers and ZERO fees on any of
   * them, so this is a pure qualification:
   *   `INTEREST IN CCT`  9 rows / 320,657 ppl / $23,480,896,904 — 60.6% of
   *       Novartis's menu, 93.1% of Alcon's, 91.3% of Mondelez's, 66.8% of
   *       Unilever's, 47.5% of Becton Dickinson's. CCT = common/collective trust
   *   `CORP. DEBT INSTR. - PREFERRED`  Henkel, 50.3% of its whole menu
   *   `CORP. DEBT INSTR. - ALL OTHER`  Johnson & Johnson, the motivating rows
   *   `CORP DEBT INSTRUMENTS; ALL OTHER` / `; PREFERRED`  PepsiCo
   *   `CCTs`, `Real Estate SEC`, `Real Estate Secs`
   *
   * FOUR TOKENS SHIP AND SEVEN CANDIDATES WERE REFUSED, chosen by measurement
   * rather than by plausibility, and the two tests are different questions:
   *   SUFFICIENCY — what does a token reach ON ITS OWN?
   *   NECESSITY   — what is LOST if it is removed from the full set?
   * `instr` is sufficient for NOTHING and necessary for THREE rows, because
   * `CORP. DEBT INSTR. - ALL OTHER` needs `corp` AND `instr` together. A
   * token-alone test would have dropped it. ***A token-alone test detects an
   * INERT arm; a LEAVE-ONE-OUT is what decides whether an arm ships.***
   * Refused as inert (necessary for 0 rows each): `govt`, `pfd`, `equiv`,
   * `mtge`, `resid`, `coml` — all plausible abbreviations of captions this
   * vocabulary knows, none of them filed anywhere in the store. `mtges` is
   * doubly blocked: `LOANS SECURED BY MTGES-RESID.` still fails on the
   * deliberate `loan` exclusion. *An arm real in principle and inert on the
   * data is untested machinery.*
   * AND `cit` IS LEFT OUT AS INERT, NOT AS A PROTECTION — it was excluded on
   * instinct (CIT is a bank, and `Voya Stable Value Fund 20 CIT` is a real
   * collective trust) and then measured at 0 rows necessary, like the other
   * six. Both of those names are blocked by tokens OUTSIDE this vocabulary
   * anyway, so the instinct bought nothing it can be credited for. */
  + "|cct|ccts|corp|corps|instr|instrs|sec|secs"
  + "|value|other|all|and|or|the|at|of|in)";
const CAPTION_SEP = "[\\s\\-\\u2010-\\u2015\\/,.:;()&*]+";
/* NOTE the non-capturing wrappers on the optional leading and trailing
 * separator. `CAPTION_SEP + "?"` turns the character class's own `+` into a
 * LAZY `+?` and so REQUIRES a separator at both ends, which makes the predicate
 * miss its own motivating row. A regex assembled from string fragments has no
 * syntax check until it runs, and none at all for a quantifier that is merely
 * wrong — the positive fixtures below are what caught it. */
const SCHEDULE_H_CAPTION = new RegExp("^(?:" + CAPTION_SEP + ")?" + CAPTION_WORD
  + "(?:" + CAPTION_SEP + CAPTION_WORD + ")*(?:" + CAPTION_SEP + ")?$", "i");
export function isScheduleHCaption(name) {
  return SCHEDULE_H_CAPTION.test(String(name == null ? "" : name));
}
/* Asserted at import, both directions. The must-SEE cases are real filed
 * strings, because an arm that is BROKEN and an arm that is INERT report the
 * same zero; the must-KEEP cases are each a measured SINGLE-PROTECTION case,
 * found by asking the live store which published names are caption vocabulary
 * except for exactly one token rather than by listing the ones that came to
 * mind. */
for (const [s, why] of [
  ["CORPORATE STOCK - COMMON", "Verizon, $9,699,087,087 at 24.9% of its menu, 146,572 ppl — the motivating row"],
  ["CORPORATE STOCKS - COMMON", "Johnson & Johnson, $9,996,789,597 at 41.6%, 80,884 ppl"],
  ["CORPORATE STOCKS COMMON", "Comcast / Unilever / Becton Dickinson / Deere, 9 rows / 445,027 ppl"],
  ["Corporate stock - common", "Exelon, 44.5% of its menu"],
  ["Government Bond", "Continental Automotive, 50.0% of its whole menu"],
  ["PARTNERSHIP/JOINT VENTURE INTEREST", "$2,263,409,173 at 13.5%"],
  ["OTHER INVESTMENTS", "Verizon again, $941,840,374"],
  ["CASH", "77 rows / 762,812 ppl — the commonest member, so a regression to 0 would look quiet"],
  ["Real Estate", "65 rows"],
  ["Corporate Stock : Common", "84.2% of one plan's menu — a colon is a separator, not a word"],
  ["INTEREST IN CCT", "9 rows / 320,657 ppl / $23,480,896,904 — 60.6% of Novartis's menu, the largest single string in the class"],
  ["CCTs", "Roper Technologies — the plural"],
  ["CORP. DEBT INSTR. - PREFERRED", "Henkel Of America, 50.3% of its whole menu"],
  ["CORP. DEBT INSTR. - ALL OTHER", "Johnson & Johnson — needs `corp` AND `instr`, which is why a token-alone test is the wrong test"],
  ["CORP DEBT INSTRUMENTS; ALL OTHER", "PepsiCo — a semicolon is a separator"],
  ["Real Estate Secs", "Sterling Computers — the `sec` abbreviation"],
  ["U. S. GOVERNMENT SECURITIES", "Verizon's trust, $2,765,872,513 on 4 member plans / 153,901 ppl — the SPACED abbreviation, sitting in the same twelve rows as two captions already reached"],
]) if (!isScheduleHCaption(s)) {
  throw new Error(`lib-disclose: isScheduleHCaption no longer reaches ${JSON.stringify(s)} (${why}) — the arm is inert, fix it rather than shipping a quiet guard`);
}
for (const [s, why] of [
  ["Real Estate Securities Fund", "=DFREX, 433 rows / 581,803 ppl — `fund` is the ONLY protection"],
  ["Real Estate Fund", "115 rows / 233,881 ppl — likewise"],
  ["US Bond Index", "488 rows / 947,172 ppl — `index` is the ONLY protection"],
  ["OTHER ASSETS", "100 rows / 317,547 ppl / $2,575,635,840 — `assets` is the ONLY protection"],
  ["Employer Common Stock", "12 rows / 38,114 ppl / $230,268,669 — `employer` is the ONLY protection"],
  ["Total Bond", "95 rows / 141,814 ppl — `total` is the ONLY protection, and this may be a truncated `Total Bond Market`"],
  ["Stable Value", "54 rows / 171,652 ppl — `stable` is the ONLY protection"],
  ["Real Estate Securities R6", "=PFRSX — the share class is the ONLY protection"],
  ["Government Bond A", "$74,802,818 at Toll Bros. — a trailing capital is a SERIES letter; excluding the article `a` is the ONLY protection"],
  ["Investment Company of America", "254 rows / 110,724 ppl — a REAL FUND; `America` is the ONLY protection"],
  ["Fidelity Government", "2,123 rows / 3,420,361 ppl — the house token is the ONLY protection"],
  ["Cash Surrender Value", "an insurance figure, not a caption — `surrender` is the ONLY protection"],
  ["Vanguard Institutional Index Plus", "a real fund"],
  ["Principal Real Estate Securities Fund", "a real fund that is four caption words plus a house and a vehicle word"],
  ["General Motors Common Stock", "employer stock wearing three caption words"],
  /* SHAPE PINS for the four new tokens, and labelled as such: each of these
   * carries MORE than one non-caption token, so none proves a single
   * protection — *a case protected twice proves neither.* The measured safety
   * claim for these tokens is not a fixture at all, it is that they newly
   * reach exactly 23 published rows store-wide and all 23 were read. */
  ["Costco Wholesale Corp", "=COST, $18.3B of EMPLOYER STOCK ending in the new `corp` token"],
  ["CIT Group Inc", "a real company, and `cit` is deliberately NOT in the vocabulary"],
  ["Voya Stable Value Fund 20 CIT", "a real collective trust"],
  ["Sec Lending Collateral Fund", "a securities-lending vehicle, not a caption"],
  ["U S TREASURY NOTE", "a REAL security wearing the spaced abbreviation — `note` IS in this vocabulary, so the absence of `treasury` is the ONLY protection"],
  ["Cohen & Steers U S Realty CIT Class A", "likewise, a real collective trust"],
  /* THE `103-12 investment entities` CAPTION — REFUSED 2026-10-09 BY READING
   * THE FILINGS, and the refusal is not about the vocabulary at all.
   *
   * The register carried this as a coverage residue of THIS predicate: 10 rows
   * / 6 crawlable pages, needing "the vocabulary to accept a NUMERIC token".
   * Re-measured over the 1,721,920 published-and-served rows
   * (`scripts/size-caption-numeric.mjs`), the widening that reaches Schedule H
   * line 1c(12)'s own caption moves **8 rows / 8 acks / 405,863 participants /
   * $709,305,843**, and it needs TWO additions rather than one: `entit(y|ies)`
   * is absent from this vocabulary too, so the numeric token ALONE reaches 0
   * rows and `entity` ALONE reaches 0 — all 8 need BOTH. *The register named
   * half the mechanism.*
   *
   * THEN THE FILINGS WERE INSTRUMENTED AND THE CLASS IS NOT A CAPTION CLASS.
   * FIVE of the eight rows are VERIFIED to be N REAL NAMED FUNDS welded into
   * one (two more, Thompson Coburn and HomeServices of America, share the
   * signature and are UNMEASURED), because the parser took the DESCRIPTION
   * column — which holds Schedule H's own item caption — over the IDENTITY
   * column, which names the fund:
   *
   *   Deere & Company (26,538 ppl, $187,030,545) files four rows
   *     `HARBOURVEST HIPEP IX`, `HIPEP VII PTNRSP FEEDER FD LP`,
   *     `HIPEP VIII PTNRSP FEEDER FD LP`, `ALL WEATHER@12% LTD.`, each with
   *     `103-12 INVESTMENT ENTITIES` in column (b). 31,204,681 + 44,526,222 +
   *     51,603,849 + 59,695,793 = 187,030,545 EXACTLY.
   *   RTX Corporation (214,241 ppl, $264,534,462) files
   *     `INVESCO BALANCED RISK ALLOCATION MUTUAL FUND` and `RTX BRIDGEWATER
   *     NAV`: 132,292,232 + 132,242,230 = 264,534,462 EXACTLY.
   *   Roofers Local 54 (912 ppl, $4,640,355) files `Washington Capital JMT
   *     Mortgage Income Fund` and `Washington Capital JMT Real Estate Equity
   *     Fund`: 3,100,544 + 1,539,811 = 4,640,355 EXACTLY.
   *   Propio LS (257 ppl, 60.3% of its menu) files one 4i row whose identity
   *     column reads `Retirement Income Security Plan`.
   *   MidAmerican Energy (8,969 ppl) files a `Goldman Sachs Term Fund 2026 /
   *     2027 / 2028 …` ladder with the caption in column (b) on every row.
   *
   * So "the filing names no specific fund" would be FALSE for Deere, Roofers
   * and Propio — 27,707 participants — to gain ONE true qualification, for
   * Verizon (146,572 ppl, $164,190,569), whose trust really does file the 1c
   * captions value for value.
   *
   * AND NO NAME-LEVEL PREDICATE CAN DECIDE IT, which is why this is a pin and
   * not a to-do: **Verizon files `103-12 INVESTMENT ENTITY` and Roofers files
   * `103-12 Investment Entity`** — the same string, and this predicate is
   * case-insensitive. One is a genuine category caption and the other is two
   * real funds we welded. *A row that names nothing and a row whose name we
   * dropped are two classes, and here they are spelled identically.*
   * The remedy is a PARSER change — prefer the identity column when the
   * description column is a Schedule H ITEM caption, which `lib-4i`'s own
   * `SCHED_H_ITEM` already recognises including `103-12` — and that needs a
   * `PARSER_VERSION` bump and a full re-parse.
   *
   * THE WIDE FORM IS REFUSED SEPARATELY AND ITS PRICE IS MEASURED. `CAPTION_SEP`
   * contains `-`, so `103-12` tokenises as `103` + sep + `12` and a bare digit
   * run would admit any name made of digits plus caption words: a `\d{1,4}`
   * alternative adds 15 rows / 9,058 ppl over the narrow literal, across four
   * unrelated classes — `Common stock (234,055 shares and` publishing ADTN,
   * Stellar Industrial's `469,421 Shares` at 25.0% of its menu, Ross & Yerger's
   * `1,356.9400 shares`, Sioux City Foundry's `Note 3`. Only Howard Memorial's
   * `Investments - Notes 2, 3 and 4` (73.5% of its menu) is a true gain, and
   * that belongs to the note-table class.
   *
   * The register's companion residue — `isLabelOnlyName` and a TRAILING number
   * — is NOT the same mechanism and is refuted at that predicate's own pins. */
  ["103-12 INVESTMENT ENTITIES", "Deere, $187,030,545 — FOUR named HarbourVest/All Weather funds welded; the caption is in column (b) and the funds are in column (a)"],
  ["103-12 Investment Entity", "Roofers Local 54 — two Washington Capital JMT funds welded, and THE SAME STRING as Verizon's genuine caption row"],
  ["103-12 ENTITIES", "RTX, $264,534,462 — `INVESCO BALANCED RISK ALLOCATION MUTUAL FUND` + `RTX BRIDGEWATER NAV`"],
  ["Interest in 103-12 investment entities", "Propio LS — its one 4i row names `Retirement Income Security Plan` in column (a)"],
]) if (isScheduleHCaption(s)) {
  throw new Error(`lib-disclose: isScheduleHCaption would qualify ${JSON.stringify(s)} (${why}) — it names something, fix the predicate rather than the control`);
}

/* THE ATTACHMENT'S OWN DATE HEADER, PUBLISHED AS A HOLDING WITH A FABRICATED
 * VALUE — 2026-10-10, found by the 19:08 draw.
 *
 * 62 published-and-served rows / 62 plans / 47,749 participants / $19,205,495.
 * G4s Secure Solutions (Guam) publishes `December` at **27.90% of its whole
 * menu**, Tnn Guam at 18.86%, United Cerebral Palsy of Southern Arizona at
 * 14.43%, and Community Media Group's copy is typed `Mutual fund`.
 *
 * WHAT MAKES IT UNARGUABLE IS NOT THE NAME, IT IS THE VALUE. All 63 stored
 * bare-`December` rows carry **$312,024 ± 1 — the same figure in 63 unrelated
 * filings**, which no holding can be, and the amount TRACKS THE FILING YEAR:
 * plan year 2023 -> $312,023, 2024 -> $312,024 ×48, 2025 -> $312,025 ×8. So the
 * cell is `December 31, 2024` with the day welded to the year as a
 * comma-grouped amount and the month read as the holding's name. Three entries
 * were read in full context and each sits in the middle of an ordinary menu —
 * Maria College's row 8 between `TIAA Real Estate` and `CREF Bond Market R1`.
 *
 * THE PREDICATE TAKES NO EXTERNAL INPUT, WHICH IS THE WHOLE SAFETY. It does not
 * look the plan year up: the VALUE must itself spell a date, some day 1-31
 * concatenated with a plausible four-digit year equalling the amount exactly
 * (`"31" + "2024" === "312024"`). A harness that needed the plan year would be
 * reading a field this function is never given, and the recorded rule is that a
 * guard must be keyed on a witness it can actually see.
 *
 * BOTH CONDITIONS ARE LOAD-BEARING, by leave-one-out over the whole store
 * rather than by argument. The VALUE SHAPE ALONE reaches real holdings whose
 * amount happens to read as a date — `Vanguard Target Retirement 2065` at
 * $252,179 (= 25/2179), `FID FDM IDX 2060 IPR` at $62,009, `Schwab Target 2055
 * Fund` at $72,095, `Fidelity Freedom Index 2015 Fund` at $32,093 — so a
 * value-only arm would withdraw genuine target-date rows. The MONTH NAME ALONE
 * over-reaches by exactly 2 rows whose value is not a date (The Elkin Company
 * $342,024, Randall Reilly Talent $624,049), and those two are REFUSED because
 * their cause is unread: a month-named row is not thereby a date row.
 *
 * FULL MONTH NAMES ONLY, DELIBERATELY. The live population is `December` ×63,
 * `August` ×2, `September` ×1 and no abbreviation; adding `Dec`/`Aug` would be
 * an unmeasured widening onto three-letter tokens that are also share-class and
 * ticker fragments. *An arm real in principle and inert on the data is untested
 * machinery.*
 *
 * NOTHING IS SUPPRESSED BEYOND THE LABEL, and that is measured rather than
 * conservative: all 62 rows publish NO ticker and NO fee today, so adding this
 * to the fee or symbol gates would be machinery with an empty population. The
 * VALUE stays printed and keeps counting toward the menu total, exactly as a
 * `subtotal (not a holding)` row does — withdrawing it moves every percentage
 * on the page and is a second change. */
const MONTH_NAME = /^(?:january|february|march|april|may|june|july|august|september|october|november|december)$/i;
export function dateHeaderDate(name, value) {
  if (!MONTH_NAME.test(String(name == null ? "" : name).trim())) return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  /* a real amount may carry cents; a welded `<day><year>` never does */
  if (Math.abs(n - Math.round(n)) > 0.004) return null;
  const s = String(Math.round(n));
  for (let day = 1; day <= 31; day++) {
    const ds = String(day);
    if (!s.startsWith(ds)) continue;
    const ys = s.slice(ds.length);
    if (!/^(?:19|20|21)\d\d$/.test(ys)) continue;
    return { day, year: Number(ys) };
  }
  return null;
}
export function isDateHeaderRow(name, value) {
  return !!dateHeaderDate(name, value);
}
/* Asserted at import, both directions, and the must-SEE cases are real filed
 * pairs because an arm that is BROKEN and an arm that is INERT report the same
 * zero. Every must-KEEP case is a measured SINGLE-PROTECTION case: the first
 * four are real rows the VALUE condition is the only thing refusing, the next
 * two are real rows the MONTH condition is the only thing refusing. */
for (const [nm, v, why] of [
  ["DECEMBER", 312024, "Guam Xray — the row read in full context, 9.41% of its menu"],
  ["December", 312024, "G4s Secure Solutions (Guam) at 27.90% of its whole menu, and 47 more"],
  ["December", 312023, "a plan year 2023 filing — the year TRACKS, which is the diagnosis"],
  ["December", 312025, "a plan year 2025 filing, 8 rows"],
  ["August", 172026, "the one non-December member whose value is date-shaped"],
]) if (!isDateHeaderRow(nm, v)) {
  throw new Error(`lib-disclose: isDateHeaderRow no longer reaches ${JSON.stringify(nm)} @ ${v} (${why}) — the arm is inert, fix it rather than shipping a quiet guard`);
}
for (const [nm, v, why] of [
  ["Vanguard Target Retirement 2065", 252179, "= 25/2179 — a REAL holding; the month condition is the ONLY protection"],
  ["FID FDM IDX 2060 IPR", 62009, "= 6/2009 — likewise"],
  ["Schwab Target 2055 Fund", 72095, "= 7/2095 — likewise"],
  ["Fidelity Freedom Index 2015 Fund", 32093, "= 3/2093 — likewise"],
  ["December", 342024, "The Elkin Company — a month name whose value is NOT a date; the value condition is the ONLY protection"],
  ["DECEMBER", 624049, "Randall Reilly Talent — likewise, and its cause is unread so it is refused"],
  ["December", 312024.37, "cents — a welded day and year cannot carry them"],
  ["December", 0, "a zero-value row says nothing"],
  ["December Street Partners Fund", 312024, "a real name that merely STARTS with a month"],
  ["Dec", 312024, "the abbreviation is deliberately out of the vocabulary — unmeasured"],
]) if (isDateHeaderRow(nm, v)) {
  throw new Error(`lib-disclose: isDateHeaderRow would qualify ${JSON.stringify(nm)} @ ${v} (${why}) — fix the predicate rather than the control`);
}

export function isNamelessFundRow(f, cleanedName, isGenericName) {
  const type = String((f && f.type) || "");
  const name = String(cleanedName || (f && f.name) || "");
  if (/^subtotal \(not a holding\)$/i.test(type)) return false;
  if (/brokerage window/i.test(type)) return false;
  if (/company stock|employer (security|stock)/i.test(type + " " + name)) return false;
  /* ...or the row is a SCHEDULE H ASSET-CLASS CAPTION with no type cell to
   * describe it. Injected here rather than into the caller's `isGenericName`
   * composition because the condition is a property of the ROW and not of the
   * name: the type cell is what decides it, and reading `f.type` inside the
   * shared function is what lets the static generator inherit this unchanged. */
  if (!type.trim() && isScheduleHCaption(name)) return true;
  return !!isGenericName(name);
}
/* and the two conditions the predicate itself cannot express, asserted through
 * the function that owns them with a stub `isGenericName` that never fires —
 * so a true verdict can only have come from the new arm. */
for (const [f, name, want, why] of [
  [{ type: "" }, "CORPORATE STOCK - COMMON", true, "the arm fires on its own, with nothing else returning true"],
  [{ type: "Cash / short-term" }, "INTEREST-BEARING CASH (CASH & CASH EQUIVALENT)", false,
    "Verizon, $1,767,488,802 — the TYPE CELL is the ONLY protection"],
  [{ type: "Corporate debt" }, "CORPORATE DEBT INSTRUMENTS - ALL OTHER", false,
    "Verizon, $1,060,409,593 — likewise, and it is the same filing as the row above"],
  [{ type: "Government securities" }, "U.S. GOVERNMENT SECURITIES", false,
    "Exelon / Delta / Johnson & Johnson / Hallmark — likewise"],
  [{ type: "" }, "Company Stock", false,
    "the EMPLOYER-STOCK early return, asked with no type so it is the only protection. Live population 0: all 25 caption-shaped rows it catches are typed `Company stock`, so it blocks nothing the no-type condition does not already block. Kept and labelled, because where a predicate is COMPOSED decides what protects it and the 26th row may file no type"],
  [{ type: "subtotal (not a holding)" }, "CORPORATE STOCK - COMMON", false, "a subtotal is not a holding"],
  [{ type: "Brokerage window" }, "CASH", false, "a brokerage window is a real choice"],
]) if (isNamelessFundRow(f, name, () => false) !== want) {
  throw new Error(`lib-disclose: isNamelessFundRow(${JSON.stringify(f.type)}, ${JSON.stringify(name)}) should be ${want} (${why})`);
}

/* THE TYPE CELL IS THE ONLY PROTECTION, AND ONE SURFACE DOES NOT HAVE IT —
 * 2026-10-09.
 *
 * `isNamelessFundRow`'s caption arm is gated on `!type.trim()`, and its own
 * import-time control above pins Verizon's `INTEREST-BEARING CASH (CASH & CASH
 * EQUIVALENT)` typed `Cash / short-term` as a must-NOT-fire case: on the REPORT
 * a Type column tells the reader the row is a category, so nothing false is
 * published. That gate is a property of ONE SURFACE and the comment above says
 * so. The CRAWLABLE PAGES have two columns — `build-seo-pages.mjs` emits
 * `<th>Fund</th><th>Value</th>` — so the cell that protects the row on the
 * report does not exist there, and the page prints the caption under a header
 * saying "Fund".
 *
 * 70 rows / 54 pages / 801,791 participants / $26,711,989,748 on the v202
 * store, measured through the GENERATOR's own selection (stored order,
 * `slice(0, 5000)`, the plan's own confident entry else the trust's, first 12
 * rows) and excluding every row its existing arms already label.
 *
 * THE REMEDY IS A TRANSCRIPTION, NOT THE NAMELESS LABEL, and reading the
 * filings is what decided that — the class is TWO populations and only one of
 * them names nothing:
 *
 *   A GENUINE ASSET-CATEGORY TABLE. Verizon's trust files the Schedule H `1c`
 *     captions as its 4i schedule, value for value ($1,767,488,802 IS line
 *     1c(1)); Hallmark's table header is literally `ASSET CATEGORY`; Exelon and
 *     Johnson & Johnson the same shape.
 *   A REAL HOLDING WHOSE NAME WE TRUNCATED. Altria's `Shares` is the
 *     description column — the filing names `Altria Group, Inc` in the identity
 *     column our parse dropped, on $1,456,691,207 of employer stock. Williams
 *     College's `Real Estate` is `TIAA | Real Estate` under the heading `Pooled
 *     Separate Accounts`: the TIAA Real Estate Account, a real participant
 *     option. Honda's `Shares of interest` and Sealed Air's `Shares of` are a
 *     shares-count line and a cut-off `Sealed Air common stock`.
 *
 * So "the filing names no specific fund" is FALSE for Williams and misleading
 * for Altria — *a row that names nothing and a row whose name we cut in half
 * are two classes, and one label cannot serve both*, which this file already
 * records from the `Investment in` pin. The filed TYPE is true of both, is a
 * filed fact, and is exactly what the report's own Type column prints for these
 * rows (`shownType` falls through to `filedType`, app.js:3967). The precedent is
 * twenty lines from the call site: the loan-description arm says the row has to
 * say what it IS in the only cell it has.
 *
 * NOT EXTENDED TO EVERY TYPED ROW, deliberately. On `Vanguard 500 Index Fund
 * Admiral Shares` the type adds nothing the name does not already give and
 * would put a parenthetical on tens of thousands of rows; on a caption it is the
 * only thing standing between the row and reading as a fund.
 *
 * THE ISSUER ARGUMENT IS THE CALLER'S, and it is the same gate the nameless arm
 * uses at the same call site, for the same reason: `issuer · name` already names
 * the holding. It BLOCKS 18 rows / 16 pages / 108,165 participants, and all 18
 * issuers were read — `UBC Russell 3000 Index Trust`, `Longview Core Bond
 * Fund`, `Dodge & Cox Fund`, `Harbor Capital Appreciation Investment`,
 * `Fidelity Select Technology`, `Skyworks Solutions, Inc.`, `Glacier Bancorp`,
 * `Teachers Insurance and Annuity Association (TIAA)` — every one of them names
 * a fund, an employer or an insurer. That is the owner-gated caption-with-an-
 * issuer sub-family this file already names, left alone.
 *
 * Returns the type string to print, or "" when the row must be left alone. The
 * WORDING lives at the call site, because only that surface needs a sentence
 * where the report has a column. */
export function captionFiledType(f, cleanedName, issuerNames) {
  const type = String((f && f.type) || "").trim();
  if (!type) return "";
  if (issuerNames) return "";
  if (!isScheduleHCaption(String(cleanedName == null ? "" : cleanedName))) return "";
  return type;
}
/* Asserted at import, both directions, every case drawn FROM the measured
 * population and every one a SINGLE protection — a case protected twice proves
 * neither, which this file has paid for. */
for (const [f, name, iss, want, why] of [
  [{ type: "Cash / short-term" }, "INTEREST-BEARING CASH (CASH & CASH EQUIVALENT)", false, "Cash / short-term",
    "Verizon's trust, $1,767,488,802 on 4 member plans / 153,901 ppl — the SAME row `isNamelessFundRow` must NOT fire on, and the opposite verdict here is the whole point"],
  [{ type: "Company stock" }, "Shares", false, "Company stock",
    "Altria, $1,456,691,207 at 26.6% of the menu — the filing names `Altria Group, Inc` in a column we dropped, so the nameless label would be FALSE"],
  [{ type: "Pooled separate account" }, "Real Estate", false, "Pooled separate account",
    "Williams College — `TIAA | Real Estate` under `Pooled Separate Accounts`, a real option; 14 rows across TIAA 403(b) plans"],
  [{ type: "Government securities" }, "U.S. GOVERNMENT SECURITIES", false, "Government securities",
    "Hallmark, 48.6% of its menu, from a table whose own header reads ASSET CATEGORY"],
  [{ type: "" }, "CORPORATE STOCK - COMMON", false, "",
    "NO TYPE CELL is the only protection: `isNamelessFundRow` already qualifies this row on both surfaces, and a second descriptor would be the same phrase twice"],
  [{ type: "Collective trust" }, "Common collective trust", true, "",
    "THE ISSUER is the only protection — Southern District's $720,038,195 row, whose issuer cell reads `UBC Russell 3000 Index Trust`"],
  [{ type: "Mutual fund" }, "Vanguard 500 Index Fund Admiral Shares", false, "",
    "THE CAPTION TEST is the only protection: a named fund is typed too, and 50,000 rows must not grow a parenthetical"],
  [{ type: "Cash / short-term" }, "Fidelity Government", false, "",
    "likewise, and this is the caption predicate's own single-token case — 2,123 rows / 3,420,361 ppl"],
]) {
  const got = captionFiledType(f, name, iss);
  if (got !== want) throw new Error(`lib-disclose: captionFiledType(${JSON.stringify(f.type)}, ${JSON.stringify(name)}, iss=${iss}) returned ${JSON.stringify(got)}, want ${JSON.stringify(want)} (${why})`);
}

/* AN INSURANCE ANNUITY CONTRACT TYPED `Mutual fund` — canonical copy, 2026-09-29.
 *
 * v190 (`Master Trust`) and v192 (`Preferred stock`) both stopped a NAME making
 * a false claim. This is the same shape one COLUMN along: the name is fine and
 * the TYPE cell is the claim. American University (7,009 participants) files
 * `Traditional Fixed Annuity Contracts - Non-Fully Benefit Responsive` as its
 * largest holding, 13.5% of the menu, and the row is typed `Mutual fund` — so
 * the page tells 7,009 people their biggest holding is a registered mutual fund
 * when the filing says it is an insurance contract with TIAA.
 *
 * 186 rows / 153 plans / 216,782 participants / $2,084,149,902.
 *
 * THE DISCRIMINATOR IS THE FILING'S OWN WORDS AND IT IS ANCHORED ON A PHRASE,
 * not on a vocabulary of products. `\bannuity contracts?\b` is what the filer
 * typed; nothing is inferred from a house name or an issuer. The safety
 * argument is measured from two independent directions:
 *
 *   - ALL 146 distinct flagged names were read, one by one. Every one is an
 *     insurance product: TIAA Traditional, CREF variable, Empower and PRIAC
 *     group annuities, Lincoln stable value accounts, SAGIC and EI fixed
 *     accounts. NOT ONE is a registered fund. The 34 that carry a fund-shaped
 *     word were read separately for exactly this reason — `Group Annuity
 *     Contract PRIAC Guaranteed Income Fund` and `Group Annuity Contracts Key
 *     Guaranteed Portfolio Fund` are insurance separate accounts whose BRAND
 *     ends in "Fund", not registered funds.
 *   - Of the 29,406 SEC-registered share classes in `sec-funds.json`, ZERO have
 *     `annuity contract` anywhere in the registrant, series or class name, and
 *     exactly ONE registrant contains the bare word "annuity" at all (SCHWAB
 *     ANNUITY PORTFOLIOS, whose series is `Schwab Government Money Market
 *     Portfolio` and so cannot match this phrase). A registered fund is not
 *     named "annuity contract" — the phrase is a legal category, not a brand.
 *
 * IT DOES NOT FIRE ON THE NAME ALONE, and that restriction is deliberate. 1,219
 * further rows say "annuity contract" and are typed `Collective trust`, `Pooled
 * separate account`, `Stable value / GIC`, `Cash / short-term` or nothing at
 * all. Those types are either more specific than this one or already honest, and
 * 934 of them are blank — filling a blank is NEW COVERAGE and a different claim.
 * What is repaired here is the one type string that asserts something false. The
 * store holds exactly ONE such string, `Mutual fund`, on 976,193 rows; the
 * anchor is a PREFIX so a future variant still could not assert it.
 *
 * THE FALSE TYPE WAS ALSO BUYING A FABRICATED FEE, which the queue item did not
 * know and a stored-field check could not see. `fundERFiled` is called on the
 * NAME, and `fund-er.js`'s last generic fallback prices anything matching
 * /stable value|managed income|guaranteed|gic\b/ at 0.35%. 34 of the 186 rows
 * (33 plans / 77,264 participants / $153,841,087) therefore publish an estimated
 * expense ratio on an insurance contract. The site ALREADY refuses that number
 * for every row typed `Stable value / GIC` — `gicRow` suppresses it — so the
 * wrong type was the only reason the fee escaped. Callers must suppress the fee
 * and the ticker here for the same reason they do for a GIC: an annuity's cost
 * sits inside the crediting rate and is not a fund expense ratio.
 *
 * THE ROW IS TYPED, NEVER DROPPED — v181's treatment. The value and the
 * percentage are untouched, so the money stays accounted for and no other row's
 * published share moves.
 *
 * app.js keeps a twin because it is a plain browser script with no module
 * system; `scripts/gen-generic-twin.mjs` extracts this VERBATIM and
 * `smoke-test.mjs` runs the browser copy against this one and fails on drift. */
export const ANNUITY_CONTRACT_NAME = /\bannuity contracts?\b/i;
export function isAnnuityContractRow(f, cleanedName) {
  const type = String((f && f.type) || "");
  if (!/^mutual fund/i.test(type)) return false;
  return ANNUITY_CONTRACT_NAME.test(String(cleanedName || (f && f.name) || ""));
}

/* THE LOAN-REPAYMENT ANSWER LINE — 2026-09-30, and it is v194's own cost.
 *
 * `Loan Repayments are included:` is a recordkeeper-report ANSWER line whose
 * value is the plan's participant-loan balance. 23 published rows / 23 plans /
 * 33,695 participants carry one; Keysight Technologies' is **$4,160,976**.
 *
 * TWO SPELLINGS, because v194 created the second. SKIP_ROW is anchored `^` and
 * this family WRAPS across two lines, so v194's `loan repayments?` arm skipped
 * `Loan Repayments are`, cleared the name buffer, and left the continuation
 * `included: 240,932` to name the row. Every one of those 23 rows now reads
 * **`included`**, and Northwood Investors' reads **`Yes`**. v195 reverts the
 * parser arm, so this predicate has to answer for BOTH the restored phrase and
 * the remnant still in the store — a reader is served either way, before and
 * after the re-parse.
 *
 * TYPED AND NOT DROPPED, per v181: the value is real plan money, so it stays in
 * the denominator and every other row's published percentage is unchanged. What
 * it loses is the ticker and the fee, neither of which a loan balance has.
 *
 * The remnant arm is anchored on the WHOLE name and the vocabulary cannot name a
 * fund: measured over all 1,720,026 published rows, `included` / `Included` /
 * `Yes` as a COMPLETE holding name occur 24 times and every one is this family.
 * A bare `no` is included for symmetry and matches 0 rows today — the same
 * reasoning as v191's singular `statement`, where the anchor is what makes an
 * unused arm safe. */
/* WIDENED 2026-09-30 (02:5xZ) BY #513's OWN VERDICT, and the residue is a second
 * mechanism rather than a missed spelling. v195 predicted the remnant rows would
 * go to 0 and SEVEN survived; reading them showed why — where the layout gives
 * each fragment its OWN VALUE, `Loan Repayments are` and `included:` are two
 * ROWS, not one wrapped name, so no line-joining rule can reunite them.
 * Kentucky Rebuild Corporation (159 ppl) is the proof: it publishes `Included:`
 * at $210,579 AND `Repayments are` at $205,396, two rows, two figures. The
 * leading `Loan` lands on the row above.
 *
 * 60 rows / 60 plans / 78,071 participants / $9,385,509, 13 distinct names, all
 * read, not one a fund, 0 publishing a ticker or a fee, largest 9.1% of a menu.
 * The `are` is load-bearing: `repayment schedules through August 2029 with
 * interest rates ranging from…` is the loan-DESCRIPTION family, a separate
 * queued item, and must not be reached from here. */
export const LOAN_ANSWER_PHRASE = /^(?:loan\s+)?repayments?\s+are\b|^loan\s+repayments?\s*:/i;
export const LOAN_ANSWER_REMNANT = /^(?:included|yes|no)[.:]?$/i;
export function isLoanAnswerRow(name) {
  const s = String(name || "").trim();
  return LOAN_ANSWER_PHRASE.test(s) || LOAN_ANSWER_REMNANT.test(s);
}

/* A SCHEDULE H PARTICIPANT-DIRECTION CAPTION IS NOT A HOLDING — 2026-09-30
 * (14:4xZ). Found by the 14:3xZ participant-weighted draw on MICROSOFT
 * (183,509 participants, $77.9B), whose 50-row BlackRock/Vanguard/Fidelity
 * menu is otherwise immaculate and whose THIRD-LARGEST row is named
 * `Participant-directed` at $6,602,388,247 = 8.6% of the menu, with a blank
 * type cell.
 *
 * "Participant-directed" and "non-participant-directed" are the statutory
 * split Schedule H line 4i is reported under — a COLUMN CAPTION, not a fund.
 * The money is real and correctly counted (Microsoft's menu sums to 0.98 of
 * plan assets, so this is a distinct bucket and not a subtotal of the rows
 * around it), so the row is TYPED and never dropped, on v181's pattern: the
 * value stays in the denominator and no other row's percentage moves.
 *
 * 16 rows / 16 plans / 294,238 participants / $6,813,553,902. All 18
 * candidate names read, not one a fund, and 0 publish a ticker — so the harm
 * is the CLAIM alone.
 *
 * THE DOMINANT NEIGHBOUR IS NOT A DEFECT AND MUST NOT BE TOUCHED, which is
 * most of the value of having measured it: 174 rows / 851,690 participants /
 * $7,529,381,895 read `Participant-Directed Brokerage Accounts`, and a
 * participant-directed brokerage account is a REAL self-directed window —
 * exactly the aggregate this site already types as one. The raw count of 192
 * is two mechanisms and the bigger one is correct.
 *
 * SO THE TAIL IS A POSITIVE VOCABULARY OF WHAT MAY FOLLOW, never a blocklist:
 * nothing, `investments`, `accounts` or `assets`. `brokerage accounts` is
 * outside that list, so the brokerage family is refused BY CONSTRUCTION rather
 * than by a rule that has to know the word — and the `^…$` ANCHOR is the other
 * half of the same refusal. The controls say so precisely: removing EITHER the
 * tail vocabulary or the anchor convicts exactly the same five names, the four
 * brokerage windows plus `Participant Directed Retirement Fund`. An earlier
 * draft of this comment credited only the vocabulary; they are joint, and
 * either alone would do the work.
 *
 * AND THE NO-ISSUER GATE IS LOAD-BEARING, exactly as it is for
 * `isNamelessFundRow`: two of the eighteen carry an IDENTITY column that names
 * a real fund — `{Vangaurd Target Retirement 2045 Fd I}` (the filer's own
 * recorded misspelling) and a kerned `{M anaged Income Portfolio CL 2}` — so
 * there the caption is in the name column and the fund is in the other one.
 * Declaring those two nameless would withdraw a name the filing supplies. */
export const DIRECTION_CAPTION =
  /^(?:non-?\s?)?participant[-\s]?directed(?:\s+(?:investments?|accounts?|assets))?$/i;
export function isDirectionCaptionRow(name) {
  return DIRECTION_CAPTION.test(String(name || "").trim());
}

/* AN AUDIT FIRM'S OFFICE LIST IS NOT A HOLDING — 2026-09-30 (16:3xZ).
 *
 * Found by the 16:1xZ participant-weighted draw on CHEWY (20,339 ppl), whose
 * OCR'd 23-row Vanguard menu ends in
 *   `Boca Raton, Florida 33431 Fort Myers, Florida 33907 Naples, Florida 34108
 *    Orlando, Florida`
 * at $32,801 — the auditor's letterhead, read off the bottom of a scanned page.
 *
 * THE WHOLE POPULATION IS SEVEN ROWS AND ONE STRING, every one read: the same
 * Florida firm's letterhead in seven unrelated filings (Chewy, Fontainebleau
 * Development 5,245, Fontainebleau Hospitality, Turnberry Hospitality ×2,
 * Flightstar, Vertical Bridge) — 28,677 participants, $229,607, 0 publishing a
 * ticker, all seven with a BLANK issuer and a BLANK type. An arm whose whole
 * population is one name is read by reading it.
 *
 * THE TEST IS STRUCTURAL AND NEEDS NO VOCABULARY OF PLACES: TWO OR MORE
 * `<City>, <State> <ZIP>` groups in one name. ONE such group is deliberately
 * not enough — a single address can sit inside a real entity's filed name, and
 * this record already carries General Motors publishing `One Kennedy Square`
 * beside `Ernst & Young LLP`. Two is a LIST of offices, and no fund has one.
 * The ZIP is required so that an ordinary `Kansas City, Missouri` pair inside a
 * sponsor's name cannot reach the rule twice by accident.
 *
 * TYPED, NOT DROPPED (v181), THOUGH THE VALUE IS NOT PLAN MONEY. All seven rows
 * carry the IDENTICAL $32,801, in seven plans with nothing else in common,
 * which is what says the figure is an artifact of reading that page rather than
 * a holding. Dropping it would move sums, ratios and confidence, so that is a
 * PARSER-side change and is queued as one; this arm only stops the row claiming
 * to be a fund. */
export const OFFICE_GROUP = new RegExp(
  ",\\s*(?:Alabama|Alaska|Arizona|Arkansas|California|Colorado|Connecticut" +
    "|Delaware|Florida|Georgia|Hawaii|Idaho|Illinois|Indiana|Iowa|Kansas" +
    "|Kentucky|Louisiana|Maine|Maryland|Massachusetts|Michigan|Minnesota" +
    "|Mississippi|Missouri|Montana|Nebraska|Nevada|New Hampshire|New Jersey" +
    "|New Mexico|New York|North Carolina|North Dakota|Ohio|Oklahoma|Oregon" +
    "|Pennsylvania|Rhode Island|South Carolina|South Dakota|Tennessee|Texas" +
    "|Utah|Vermont|Virginia|Washington|West Virginia|Wisconsin|Wyoming)" +
    "\\s+\\d{5}\\b",
  "gi");
export function isOfficeListRow(name) {
  const s = String(name || "");
  return (s.match(OFFICE_GROUP) || []).length >= 2;
}

/* A ROW WHOSE WHOLE NAME IS A PAGE BREAK'S CAPTION — 2026-10-01.
 *
 * The other half of the leading-caption class, and the half that may never be
 * stripped: there is nothing behind the caption to strip TO. 12 rows / 11
 * entries / 10 plans / 12,055 participants directly, PLUS 16,567 through a
 * master trust (below) / $1,328,090,246 — more money than every other arm in
 * this family put together, because a page-carry subtotal is by definition the
 * sum of everything above it.
 *
 * ALL TWELVE READ, NOT ONE A FUND, and the largest is the whole point:
 *
 *   Leonardo DRS (8,846 ppl)   `Balance Brought Forward`  88.2% / $1,135,067,959
 *   H & P Technologies (205)   `Continued from page 10`   91.7% / $19,396,062
 *   Wilson Bank & Trust (739)  `Continued Balance Brought Forward`
 *                                                          52.8% / $46,880,875
 *   Animal Medical Center (695) `Mutual Funds Brought Forward` 45.6%, and
 *                               `(continued)`                  13.2%
 *   Manco Abbott (186)         `Balance brought forward`  82.1%
 *   Stratford Academy (252)    `Assets- Brought Forward`  65.9%
 *   Powell Electronics (260)   `Balance carried forward from page 15` 64.3%
 *   Moorestown VNA (201)       `Balance carried forward`  53.3%
 *   Brentwood Academy (198)    `Balance Brought Forward`  46.4%
 *   Grain & Feed of Illinois (473) `Balance brought forward` 20.9%
 *
 * AND THE TWELFTH IS OWNED BY NO PLAN, which is the fifth-plus instance of a
 * count keyed on plans being blind to a trust: `BALANCES CARRIED FORWARD`,
 * $35,654,252, sits in ENTERGY CORPORATION QUALIFIED PLAN MASTER TRUST. All
 * THREE Entergy plans read `c=0` against the trust's `c=1`, so 16,567
 * participants are served that menu and none of them was in the plan-keyed
 * figure. An ack owned by no plan is resolved through its MEMBER PLANS.
 *
 * TYPED, NOT DROPPED (v181): the value stays in the denominator, so no other
 * row's published percentage moves, and the page says the true thing in the
 * cell that was otherwise repeating the name or empty. Two of the twelve are
 * typed `Mutual fund` today, which is a false claim about $65.9M; the other
 * ten publish `—`.
 *
 * THE CAPTION WORD IS NOT REQUIRED, and that is deliberate rather than a
 * widening for its own sake. Nine of the twelve carry NO continuation word at
 * all — the filer wrote only the carry line — so requiring one would be the
 * "fix for one phrasing" error this record has now paid for eight times, and
 * it would leave the largest row in the family (88.2% of a 8,846-participant
 * plan) publishing as a holding. `CARRIED_FORWARD`'s own safety is measured on
 * the whole store: the phrase occurs 10 times in 1,724,078 published rows.
 *
 * 0 of the twelve publish a ticker and `fundER` prices 0 of them, so the harm
 * is the CLAIM alone and nothing is withdrawn that a reader has today. */
export function isPageBreakCaptionRow(name) {
  let s = String(name || "").trim();
  if (!s) return false;
  const m = PAGE_BREAK_LEAD.exec(s);
  if (m) {
    s = s.slice(m[0].length).replace(PAGE_BREAK_SEP, "").replace(PAGE_BREAK_REF, "")
      .replace(/^\s*\)?\s*$/, "").trim();
    if (!s) return true;
  }
  return CARRIED_FORWARD.test(s);
}

/* A BARE MATURITY DATE IS THE PARTICIPANT-LOAN ROW — 2026-09-30 (07:3xZ).
 *
 * The third member of the wrapped-loan-description family, and the one the
 * other two cannot reach. `isLoanDescriptionRow` needs the loan RANGE words in
 * the name; `isLoanAnswerRow` needs the answer words. Here the description
 * wraps over THREE lines and the VALUE sits on the third, so the row is named
 * by a fragment that carries neither — just a month and a year.
 *
 * 68 rows / 67 plans / 135,334 participants / $153,709,833. All 50 distinct
 * names read and every one is a bare month-year: `November 2029` (5 rows),
 * `December 2034` (2), `March, 2032)`, `October 2054).`, `December-30`.
 * Not one is a fund, 0 publish a ticker and `fundER` prices 0 — so the harm is
 * the CLAIM alone, exactly as in the answer-line family.
 *
 * THE CAUSE WAS READ IN THREE FILINGS, NOT INFERRED, and all three agree that
 * the identity column holds the real name:
 *
 *   Kodak (8,020 ppl)   `* Participant Loans | (Interest Rates ranging from
 *                        3.25% to 9.25% with / Maturity Dates ranging from
 *                        January, 2025 to / March, 2032)      2,463,992`
 *   Baylor Scott &      `* Notes receivable from participants of … |
 *   White (57,248)       Interest rates ranging from 4.25% to 9.50% due
 *                        through / December 2034        $ 58,243` (thousands)
 *   TotalEnergies       `* Participant Loans | Interest rate range: 4.25% to
 *   (3,097)              9.50% / Maturities through: / November 2039
 *                                                         ** 10,053,521`
 *
 * Kodak's own statement of net assets carries the identical figure as `Notes
 * Receivable from Participants 2,463,992`, which is independent confirmation
 * that the value is the loan balance and not a holding.
 *
 * AND THE POPULATION CORROBORATES IT WITHOUT A SINGLE DOWNLOAD: of the 68 rows,
 * **68 sit in a menu with NO loan row at all** and 0 sit beside one. A plan
 * whose 4i schedule itemises participant loans and appears to have none is a
 * plan whose loan row lost its name — so the missing sibling is the evidence,
 * and it is what makes the claim safe to publish for all 68 rather than the 3
 * that were read.
 *
 * TYPED, NOT DROPPED (v181): the value is the plan's loan balance, so it stays
 * in the denominator and no other row's published percentage moves; it loses
 * the ticker and the fee, neither of which a loan balance has.
 *
 * THE ANCHOR IS THE WHOLE SAFETY ARGUMENT. It is `^…$` on a name that is
 * NOTHING BUT a date, so a real fund carrying a vintage cannot be reached:
 * `Target Retirement 2030`, `Fidelity Freedom 2035`, `LifePath Index 2040` all
 * lead with words. The year is bounded to four digits and the month must be a
 * real month name, so `2030` alone and `Class 2029` are both outside it — and
 * a bare year IS deliberately excluded, because `2065` as a whole name is a
 * target-date vintage far more often than a maturity. Trailing `)`/`.`/`,` and
 * a leading `(` are taken along because the wrap cuts mid-parenthetical. */
export const BARE_MATURITY_DATE =
  /^[\s(,.-]*(?:\d{1,2}[\s,/-]*)?(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\.?[\s,/-]*\d{1,4}[\s)\.,-]*$/i;
export function isLoanMaturityRow(name) {
  return BARE_MATURITY_DATE.test(String(name || "").trim());
}

/* A COLLECTIVE TRUST NAMED IN THE ROW'S OWN NAME — 2026-09-30.
 *
 * `noPublicPrice` in app.js reads `f.cit` and the TYPE cell and never the NAME,
 * so a row whose filed name states a collective-trust unit class publishes an
 * estimated RETAIL fee whenever the type is blank or wrong. A Trust II unit
 * class is normally CHEAPER than the registered fund the pattern table prices,
 * so the number is wrong in the direction that flatters.
 *
 * 48 rows / 20 plans / 30,432 participants / $691,004,818, and ALL 47 distinct
 * names were read: BlackRock LifePath Index CIT, Vanguard (Group) Target
 * Retirement … Trust II, Invesco Stable Value Trust I/III/V, Voya Stable Value
 * CIT, Wells Fargo Core Bond CIT. Not one is a registered fund.
 *
 * THE VOCABULARY IS DELIBERATELY NARROW, AND THE TWO ARMS IT REFUSES ARE THE
 * FINDING — the queue had this item at 214 reader-facing rows and that number
 * counted REGISTERED FUNDS WHOSE NAMES END IN "TRUST":
 *
 *   - a BARE terminal `Trust` reaches 201 rows and is dominated by
 *     `American Funds American High-Income Trust` (60+ rows), a registered
 *     mutual fund whose own name ends in that word — inseparable from the real
 *     `Target Retirement 2035 Trust` beside it by any syntactic test;
 *   - `Trust Class …` reaches 81 and is worse, because **`Trust Class` is
 *     Neuberger Berman's RETAIL share-class name** (`Neuberger Berman Genesis
 *     Fund Trust Class`) and `American Funds American High-Income Trust Class
 *     R-6` is that fund's R-6 class. Only 6 of the 81 are collective trusts.
 *
 * So the test demands either an explicit vehicle phrase (`collective trust`,
 * `collective investment trust`, `common collective trust`, a terminal `CIT`)
 * or a terminal ROMAN-NUMERAL unit class, which a registered fund never carries.
 * `\bcit\b` is anchored terminal so `CIT Group` — the lender — cannot match.
 * A registrant's SERIES trust is excluded by the same anchor: it puts the trust
 * words at the FRONT (`MFS Series Trust II - MFS Growth Fund`, `SPDR Series
 * Trust`, `AIM Counselor Series Trust Fund`).
 *
 * It suppresses a FEE only. The row keeps its name, its value, its percentage
 * and any labelled comparable ticker — the 493 rows / 830,385 ppl that publish
 * a comparable behind the 2026-09-21 asterisk are untouched by construction,
 * because app.js reaches this test only when `star` is false. */
export const CIT_VEHICLE_NAME =
  /\b(?:collective(?:\s+investment)?\s+trusts?|common\s+collective\s+trusts?)\b|\bcits?\s*$|\btrust\s+(?:i{1,3}|iv|vi{0,3})\s*$/i;
export const CIT_SERIES_TRUST = /\bseries\s+trust\b|\btrust\s+(?:i{1,3}|\d)\s*[-–—:]\s*\S/i;
export function isCollectiveTrustName(name) {
  const s = String(name || "");
  if (CIT_SERIES_TRUST.test(s)) return false;
  return CIT_VEHICLE_NAME.test(s);
}

/* THE SAME FABRICATED FEE, ON THE ROWS THE TYPE GATE CANNOT REACH — 2026-09-29.
 *
 * The rule above fires only when the TYPE cell says `Mutual fund`, because that
 * is the one string that asserts something false. It was never a fee rule, and
 * the fee it happened to remove was a side effect. 144 further rows say
 * `annuity contract` in their filed name, carry a type that asserts nothing
 * (blank on 118, `Cash / short-term`, `Separate account`, ETF, `Corporate
 * debt`), escape `gicRow` because that reads the TYPE too, and still publish an
 * estimated expense ratio of exactly 0.35% — `fund-er.js`'s last generic
 * fallback, /stable value|managed income|guaranteed|gic\b/. An annuity's cost
 * sits inside the crediting rate of the contract; it is not a fund expense
 * ratio, and 0.35% here is a number nobody filed.
 *
 * A BLANKET NAME-BASED SUPPRESSION WOULD BE WRONG, which is the whole
 * difficulty. 40 published rows name a REAL insurance-dedicated fund held
 * THROUGH a group annuity contract — `Vanguard VIF Real Estate Index Portfolio
 * GROUP ANNUITY CONTRACT`, `Neuberger Berman AMT Sustainable Equity Portfolio
 * GROUP ANNUITY CONTRACT`, `Mutual of America Group Annuity Contract Equity
 * Index Fund` — and their fee is fund-specific (0.03-0.7) and plausibly right.
 * One count, two classes.
 *
 * SO THE DISCRIMINATOR IS WHAT THE NAME STILL SAYS ONCE THE GUARANTEE IS TAKEN
 * OUT OF IT. Remove the words the fee table actually prices a guarantee on and
 * ask the SAME table again: if the fee disappears, the only thing that priced
 * the row was the fact that it is a guaranteed insurance contract. That is a
 * statement about the NAME, and it is deliberately NOT the test used to size
 * the class — the class was separated by `er === 0.35`, which works only
 * because 0.35 is today's fallback value and would silently stop working the
 * day that constant moves. A rule keyed on a magic number is not a rule.
 *
 * THE VOCABULARY IS THE MINIMAL ONE AND THAT IS MEASURED, not chosen. Three
 * nested vocabularies were tried — this one, this one plus the annuity phrase
 * itself, and a wide one adding `fixed`/`unallocated`/`general account`/
 * `benefit responsive` — and ALL THREE give the identical 144/0 split, so the
 * shortest is what ships. Every extra word is a word the rule would delete
 * from a real fund's name if one ever arrived. The gic arm covers SAGIC
 * because fund-er prices it, and `(?:sa?)?` covers the bare GIC and SGIC for
 * the same reason — see the 2026-10-02 reading below. (This sentence used to
 * justify `sa?gic` by saying "fund-er's own pattern is `/gic\b/` with no
 * leading boundary, so it prices `SAGIC …` on a substring accident". That was
 * true when written and stopped being true on 2026-09-29, when the missing
 * leading boundary was itself shipped as a defect — and the stale half of it
 * is exactly where the 24-row gap sat for three days.) *A justification that
 * cites another file's source is a measurement and goes stale like one.*
 *
 * MEASURED BOTH WAYS OVER THE WHOLE LIVE STORE, every distinct name read:
 *   - 144 of 144 rows priced at the generic fallback are flagged; all 83
 *     distinct names were read one by one and every one is an insurance
 *     guarantee product — TIAA Traditional, SAGIC, Key Guaranteed Portfolio
 *     Fund, Empower Guaranteed, Principal Fixed Income Guaranteed Option,
 *     Lincoln / AUL / MassMutual / NY Life / Brighthouse / Transamerica /
 *     CMFG stable-value accounts. Not one names a registered fund.
 *   - 0 of 40 rows priced from a fund's own name are flagged, and the reason
 *     is structural rather than lucky: for all 20 of their distinct names the
 *     strip is a NO-OP. They contain no guarantee word at all, so there is
 *     nothing for this rule to remove and nothing it can change.
 *
 * IT SUPPRESSES THE FEE AND NOT THE TICKER, unlike its sibling above, because
 * the narrower claim is the one the evidence supports: 1,361 published rows
 * are flagged store-wide and 0 of them publish a ticker, so the ticker half
 * would be an unmeasurable no-op dressed up as a guard.
 *
 * `priceOf` is injected rather than imported — this module has no dependency
 * on `fund-er.js`, which is a plain browser script. Both callers pass the bare
 * fee table `fundER`, NOT app.js's `fundERFiled`: the house-misspelling repair
 * is a lookup repair for a string believed to be a fund's name, and the
 * remainder here is explicitly not one. Measured before choosing: the two
 * disagree on 0 of the 1,405 rows this gate can reach.
 *
 * app.js keeps a twin (browser script, no module system); the generator
 * extracts this VERBATIM and `smoke-test.mjs` runs the browser copy against
 * this one on pinned names and fails on drift. */
/* AND THE STRIP AND THE PRICER DISAGREED ABOUT ONE ABBREVIATION — 2026-10-02,
 * found by the C2 negative control of the widening recorded below, which is
 * the point of writing a control per condition: C2's job is to name the rows
 * the residue test KEEPS, and reading its list showed the gate keeping rows it
 * was written for.
 *
 * `\bsa?gic\b` matches `sgic` and `sagic` and NOT the bare `GIC`, while
 * `fund-er.js`'s own guarantee fallback is `\b(?:sa)?gic\b` — {gic, sagic}.
 * Two patterns for one concept, differing on the commonest spelling of it, so
 * on `GIC METLIFE CONTRACT #GAC 32226` ($280,882,048) the strip leaves `GIC`
 * standing, `priceOf(rest)` returns the generic 0.35, the second condition is
 * false and THE GATE REFUSES A ROW IT WAS WRITTEN FOR. 24 published rows / 10
 * plans / 145,237 participants / $1,087,454,960, every one at 0.35. The two
 * sets are not even nested: `sgic` is stripped and never priced, `gic` is
 * priced and never stripped.
 *
 * `\b(?:sa?)?gic\b` is one arm covering all three spellings and is provably
 * WIDER than both — {gic, sgic, sagic} ⊇ {sgic, sagic} and ⊇ {gic, sagic} —
 * and `\bsa?gic\b` is NOT subsumed by a bare `\bgic\b`, which is why the arm
 * is widened rather than a second one added: a leading `s`/`sa` kills the
 * leading boundary, so `SAGIC Group Annuity Contract 21016` needs the optional
 * group and its control fails by name without it.
 *
 * ALL 23 DISTINCT NAMES READ, the whole population: MetLife, Pacific Life,
 * Prudential, Metropolitan Tower Life, Transamerica Premier Life, Lincoln
 * National, Jackson National, United of Omaha, Principal Life, Minnesota Life
 * — every one a guaranteed investment contract carrying the insurer's own
 * contract number (`GIC PRUDENTIAL CONTRACT #GA-63216`, `GIC Contract GA
 * 29022, 2.65% Yield`). Not one names a registered fund, and 0 of the 24
 * publish a ticker.
 *
 * THE SHARED CONSTANT IS WIDENED AND A FEE-GATE-LOCAL SECOND STRIP WAS BUILT
 * AND PRICED FIRST, because the handoff named the shared blast radius as this
 * item's blocker: *widening the shared constant moves the TYPE rule across its
 * whole 2,915-row population.* **MEASURED, IT MOVES 0 OF THEM**, and the
 * reason is structural rather than lucky — `isInvestmentContractRow` demands
 * `investment|insurance contract` in the name AND a `^mutual fund` type, and
 * across all 1,724,078 published rows only TWO such rows contain `gic` at all,
 * both spelling it `SAGIC`, which the old arm already stripped. The strip's
 * third consumer, `mistypedStockFeeIsGuaranteeOnly`, reaches 0 `gic` rows.
 * Both variants were rendered whole-store and their outcomes diffed MEMBER BY
 * MEMBER, not compared as counts: 24 rows each, 0 only in one. *A blocker
 * stated as a population is still a prediction*, and this one priced at zero.
 * So the choice fell to prevention, where the local strip is strictly worse:
 * the defect IS two patterns for one concept, and a third would add a new
 * surface for them to disagree on — and the assertion below could no longer be
 * written against one constant.
 *
 * NOT DONE, and named rather than rounded away: the sibling asymmetry recorded
 * at `isInvestmentContractRow` — `Stable Val`, where `fund-er.js`'s VARIANT
 * EXPANSION reads `Val` as `Value` and prices a name the literal
 * `\bstable value\b` cannot match (1 row / 537 participants). That one is not
 * a pattern-level disagreement, so the derived assertion below cannot see it
 * and widening this constant cannot fix it. */
export const GUARANTEE_PRICED_WORDS =
  /\bstable value\b|\bmanaged income\b|\bguarantee(?:d|s)?\b|\b(?:sa?)?gic\b/gi;
/* THE FILING'S OWN WORD, AND NOT A LIST OF THE WORDINGS IT APPEARS IN —
 * 2026-10-02. See the reading in annuityFeeIsGuaranteeOnly below: a vocabulary
 * is the wrong SHAPE for this gate, and the gate's own second condition was
 * the safety all along. Declared here rather than beside its phrase-level
 * siblings so it travels INSIDE the generator's slice, which runs from
 * GUARANTEE_PRICED_WORDS to the end of the function. */
export const CONTRACT_WORD = /\bcontracts?\b/i;
export function annuityFeeIsGuaranteeOnly(cleanedName, priceOf) {
  const s = String(cleanedName || "");
  /* THE GATE READS ALL THREE CONTRACT WORDINGS AS OF 2026-10-01 (14:2xZ), AND
   * UNTIL NOW IT READ ONE — the eighth recorded instance of a fix for one
   * PHRASING of a class not being a fix for the class, and this time both
   * halves shipped in the SAME commit with different reach. On 2026-09-29 the
   * TYPE rule below was written for `investment contract` AND `insurance
   * contract` BECAUSE shipping only the phrase an item was filed under is a
   * recorded mistake; this FEE rule, four lines up, kept the annuity-only gate
   * and so was outside that class by construction.
   *
   * 117 rows / 117 plans / 191,275 participants / $749,120,771, EVERY ONE at
   * 0.35 — `fund-er.js`'s generic `/stable value|guaranteed|gic/` fallback,
   * the same number withdrawn from 89 rows on 2026-09-29 and refused again by
   * v196. `Fully benefit-responsive investment contract Principal Fixed Income
   * Guaranteed Option`, `… Key Guaranteed Portfolio Fund`, `Guaranteed
   * insurance contract`. Found by the 14:0xZ draw on Bob Evans Restaurants
   * (15,749 ppl), whose `Unallocated investment contract - Guaranteed Income
   * Fund` is 15.9% of its menu.
   *
   * THE PREDICATE IS REUSED AND NOT RETYPED: `CONTRACT_DESIGNATION_NAME` is the
   * TYPE rule's own constant, so the two halves cannot drift apart again — and
   * `ANNUITY_CONTRACT_NAME` stays separate because `isAnnuityContractRow` uses
   * it to TYPE a row `Annuity contract`, which an investment contract is not.
   *
   * IT IS NOT THE OWNER-GATED STABLE-VALUE ITEM AND MUST NOT BE READ AS A BITE
   * OUT OF IT. That one (4,669 rows / 7.39M ppl, re-derived the same cycle) is
   * a policy call about rows whose name says only `stable value`; these 117
   * additionally carry the filing's OWN word `contract`, which is the condition
   * the project already decided on. 0 of the 117 publish a ticker, so the whole
   * effect is the withdrawal of one fabricated number.
   *
   * AND THE FIRST NARROWING I PROPOSED WAS INERT, measured before it was
   * written up: feeding `namesAFund` a guarantee-only screen reaches 0 rows,
   * because this function answers FALSE on every one of them for the gate
   * reason above. The circularity is real — `fundER("Guaranteed Income Fund")`
   * is 0.35 with no ticker, so `namesAFund` is true on the fee alone — but the
   * tool for it was unreachable, not absent.
   *
   * ============================================================
   * AND THE NINTH INSTANCE ARRIVED ONE DAY LATER AND ENDED THE VOCABULARY —
   * 2026-10-02. Three wordings were still three, and the filings write 67.
   * `TIAA Stable Value Contract`, `Guaranteed Income Contract`, `Guaranteed
   * Interest Balance Contract`, `Key Guaranteed Portfolio Fund, at contract
   * value`: 226 published rows / 223 plans / 459,254 participants /
   * $2,453,384,524 publish the exact fabricated 0.35 this gate exists to
   * withhold, 225 of them at 0.35. Found by the 03:1xZ draw on Walsh
   * University (690 ppl), whose row is typed `Mutual fund` as well as priced.
   *
   * SO THE FIRST CONDITION IS NOW THE FILING'S OWN WORD, AND THE REASON IS
   * MEASURED RATHER THAN TIDY. Over the newly-reached names the phrase
   * immediately preceding `contract` takes **67 distinct forms**, and the word
   * `investment` is MISSPELLED SEVEN WAYS inside them — `Investement`,
   * `Invest`, `INVESTMNT`, `Intvestment`, `Investm ent`, `Inves tment`, plus
   * `annity` for `annuity` on 4 rows. *A vocabulary is defeated by a
   * keystroke*, and this one was defeated by seven of them: every widened list
   * would have shipped already one wording short of the next filing.
   *
   * WHAT MAKES THE BARE WORD SAFE IS THE SECOND CONDITION, WHICH WAS THE RULE
   * ALL ALONG — and that is a measurement, not an argument. 2026-09-29
   * deliberately refused the bare word for the TYPE rule below, having read
   * 103 names and found them "overwhelmingly REAL FUNDS wearing a caption"
   * (`at contract value Fidelity 500 Index`). That reading still holds and the
   * residue test absorbs them: with this condition widened, the gate REACHES
   * 86 such rows and REFUSES 30 of the 30 that publish a fee, because
   * `Fidelity International Index`, `Vanguard Value Index Fund Adm`, `MFS
   * Value R6`, `T. Rowe Price Retirement 2045 Fund` and `JPMorgan
   * SmartRetirement 2040 Fund R5` all still price once the guarantee words
   * come out. The caption is not what the gate reads; the remainder is.
   *
   * ALL 183 DISTINCT NEWLY-FLAGGED NAMES WERE READ and 182 are an insurance
   * guarantee, a stable-value contract, a bare legal designation or a filer's
   * table line welded into a name (`Change in contract value versus fair value
   * in Morley Stable Value Fund`, `259,569.72 Guaranteed Income Contract`).
   * NOT ONE names a registered fund. The 183rd is `Contract BlackRock Russell
   * 1000 Growth CIT` — a real collective trust publishing IWF's 0.18 as a
   * labelled comparable — and the CALL SITE keeps it, because this predicate
   * is purely about the NAME and app.js ANDs it with `!tk`, exactly as
   * `isBankDepositRow` is. Measured both halves before adding that: the
   * SHIPPED gate flags 2,915 published rows and **0 of them publish a
   * ticker**, so `!tk` moves no shipped verdict and is load-bearing on exactly
   * that one row. *A condition that changes one verdict is named as changing
   * one verdict.*
   *
   * THE DEFECT CANNOT RECUR IN THIS DIRECTION, and that is structural rather
   * than remembered: `CONTRACT_WORD` is provably WIDER than both phrase
   * regexes — every string either of them matches contains ` contract` with a
   * trailing word boundary — which is a stronger guarantee than the shared
   * constant it replaces. The import assertion below `isInvestmentContractRow`
   * checks that derivation on every load rather than trusting this sentence.
   *
   * WHAT IT STILL CANNOT REACH, named rather than rounded away: 5 rows whose
   * RAW filed name says `contract` and whose CLEANED name does not, because
   * the unclosed-parenthetical strip (2026-09-30) or a leading caption took
   * the word off the end — `Guaranteed Income Fund - Empower Annuity Insurance
   * Company (contract Insurance Company Gen`. The gate reads the cleaned name,
   * so no widening of a NAME condition can reach them; they are rows whose
   * name says only `guaranteed`, i.e. the owner-gated stable-value item, and
   * they are deliberately left there. */
  if (!CONTRACT_WORD.test(s)) return false;
  const rest = s.replace(GUARANTEE_PRICED_WORDS, " ").replace(/\s+/g, " ").trim();
  return priceOf(rest) == null;
}

/* AN INVESTMENT CONTRACT TYPED `Mutual fund` — canonical copy, 2026-09-29.
 *
 * THE ANNUITY RULE ABOVE, ONE LEGAL NOUN ALONG, AND LARGER. Where that one
 * reads `annuity contract`, a filer describing the same kind of holding under
 * ASC 962-325 usually writes `investment contract` or `insurance contract`:
 *   `Fully benefit responsive investment contracts American General Life
 *    Insurance`  (Bmo Financial Corp., 30,897 participants)
 *   `Unallocated Insurance Contracts`                (34,051 participants)
 *   `Investment contract - Empower Guaranteed Income Fund`
 * Each is typed `Mutual fund`, so the page tells those readers their holding is
 * a registered mutual fund when the filing says it is a contract with an
 * insurer. The name is faithful; the TYPE is the false claim, which is why no
 * name-based guard — the dominance guard, `audit-generic-names`, `diff-lineups`
 * — could ever have seen it.
 *
 * RE-DERIVED AGAINST THE LIVE v192 STORE, through the PUBLICATION gate
 * (`lineups-status.c`), never a stored-entry count:
 *   `investment contract`  222 rows / 219 plans / 300,684 ppl / $1,447,457,131
 *   `insurance contract`    50 rows /  50 plans /  93,306 ppl / $  259,507,434
 * The queue entry this item was filed under said 223 / 220 / 330,533 for the
 * first of those; the store has taken two data commits since and one plan of
 * 29,849 participants has left the class. A number is asserted every time it is
 * copied forward.
 *
 * BOTH PHRASES SHIP AS ONE RULE, and that is a measured decision rather than a
 * tidy one. All 47 distinct `insurance contract` names were read and not one
 * names a registered fund — they are the same TIAA / Lincoln / Principal /
 * VALIC / Key Guaranteed products in the other word. Shipping only the phrase
 * the item was filed under would be this record's own v131 mistake: a fix for
 * one phrasing of a class is not a fix for the class.
 *
 * THE BARE WORD `contract` IS DELIBERATELY NOT IN THE VOCABULARY, and the
 * evidence is a third bucket that was measured before the choice: 117 further
 * `Mutual fund` rows carry the word without either phrase, and reading all 103
 * distinct names they are overwhelmingly REAL FUNDS wearing a caption —
 * `at contract value Fidelity 500 Index`, `Contract Vanguard Value Index Fund
 * Adm`, `Contract T. Rowe Price Retirement 2045 Fund`, `Contract MFS Value R6`.
 * `contract value` is a measurement basis, not a vehicle. Those rows are a
 * caption defect and belong to that family, not to this one.
 *
 * THE STRUCTURAL EVIDENCE THAT THE PHRASE IS A CATEGORY AND NOT A BRAND, run
 * the same way v192's was: of the 29,406 SEC-registered share classes in
 * `sec-funds.json`, ZERO contain `investment contract`, ZERO contain
 * `insurance contract`, and ZERO contain the word `contract` at all — against
 * 22,224 that contain `Fund`, which is the sanity count that makes the zero
 * readable. (The first run of that probe also returned zero and was a HARNESS
 * artefact: the entries are ARRAYS and it read `c.registrant`. A zero reports
 * on the query until something implausible in the same run says otherwise.)
 *
 * BUT ONE COUNT IS TWO CLASSES, WHICH IS THE WHOLE DIFFICULTY, and unlike the
 * annuity rule this one needs an escape hatch on the evidence. Five published
 * rows say `investment contract` and ALSO name a fund:
 *   `investment contract Dodge & Cox Income Fund Class X`   DODIX, 0.41%
 *   `Investment Contract American Funds Europacific GR R6`  RERGX, 0.46%
 *   `Responsive Investment Contract American Funds The Bond Fund of America`
 * On those the contract words are a section caption our parse welded on, the
 * type `Mutual fund` is TRUE, and typing them `Investment contract` would
 * destroy a correct answer and a correct fee.
 *
 * SO THE DISCRIMINATOR IS WHAT THE NAME STILL SAYS ONCE THE CONTRACT
 * DESIGNATION IS TAKEN OUT OF IT — the sibling rule's structure, asked of
 * IDENTITY rather than of price. Remove the contract phrase and the guarantee
 * vocabulary the fee table prices a guarantee on, then ask whether anything the
 * site can identify is left. It is deliberately NOT keyed on a constant: the
 * class was FOUND with `er === 0.35`, and a rule keyed on today's fallback
 * value stops working in silence the day that value moves.
 *
 * `namesAFund` is injected for the same reason `priceOf` is above — this module
 * has no dependency on `fund-er.js`, a plain browser script. Both callers pass
 * `(n) => fundER(n) != null || !!fundTickerInfo(n)`: BOTH halves are needed and
 * that is measured, not belt-and-braces. `American Funds The Bond Fund of
 * America` resolves to no ticker and IS priced by name, while a hypothetical
 * ticker-only test would flag it and delete a real fund's fee.
 * `fundTickerInfo` is called WITHOUT the row's type on purpose: the type is the
 * very thing in dispute, so it cannot also be the evidence.
 *
 * THE VOCABULARY IS THE MINIMAL ONE AND THAT IS MEASURED. Three nested strip
 * vocabularies were tried — the contract phrase alone; plus
 * `benefit-responsive`/`unallocated`; plus `at contract value`/`with an
 * insurance company` — and ALL THREE give the identical 267 / 5 split, so the
 * shortest ships. Every extra word is a word the rule would delete from a real
 * fund's name the day one arrives carrying it.
 *
 * MEASURED BOTH WAYS OVER THE WHOLE LIVE STORE, every distinct name read:
 *   - 267 rows flagged across 234 distinct names, all 234 read one by one.
 *     Every one is an insurance guarantee or stable-value contract, a bare
 *     legal designation (`Unallocated Insurance Contracts`, `Insurance
 *     contracts`), or — on exactly 2 rows / 400 participants — a Schedule H
 *     table line our parse welded into a name. Not one names a registered fund.
 *   - 5 rows are kept, and all five were printed IN FULL rather than truncated,
 *     because a truncated print is a different string and this record carries
 *     the cost of learning that.
 *
 * IT SUPPRESSES THE FEE AND THE TICKER, like its annuity sibling and for the
 * same reason `gicRow` does: an investment contract's cost sits inside the
 * crediting rate and is not a fund expense ratio. 89 of the flagged rows
 * publish exactly 0.35% today — `fund-er.js`'s last generic fallback,
 * /stable value|managed income|guaranteed|gic\b/ — on a holding the filing
 * names as a contract with an insurance company. 0 publish a ticker, so the
 * ticker half is future-proofing and is named as such.
 *
 * THE ROW IS TYPED, NEVER DROPPED — v181's treatment. Value and percentage are
 * untouched, so the money stays accounted for and no other row's share moves.
 *
 * ONE LABEL FOR BOTH PHRASINGS, and it is the filings' own: 24 of the 234 names
 * read `Investment contract(s) with insurance company/companies` verbatim, and
 * `investment contract` is what ASC 962-325 calls this whole category. So an
 * unallocated INSURANCE contract typed `Investment contract` is the category
 * name, not a second claim — and one label means one vocabulary, where a second
 * regex to choose between two labels is a derived pattern waiting to drift.
 *
 * KNOWN RESIDUAL, NAMED RATHER THAN ROUNDED AWAY — 1 row / 537 participants.
 * `Fully Benefit-Responsive Investment Contract American United Life Insurance
 * AUL Stable Val` is an insurance product that SHOULD be flagged and is kept,
 * because the stored name is truncated to `Stable Val`: the literal
 * `\bstable value\b` in the strip cannot match it while `fund-er.js`'s own
 * variant expansion reads `Val` as `Value` and prices it at 0.35%. The strip
 * and the pricer disagree about an abbreviation.
 *
 * AND THAT SENTENCE NAMED A CLASS WHOSE SECOND MEMBER COST 24 ROWS — corrected
 * 2026-10-02. This note read "widening the shared `GUARANTEE_PRICED_WORDS` to
 * chase it would change the annuity rule's measured 144/0 split for one row,
 * which is a worse trade than the row", and the trade was priced for `Stable
 * Val` alone. The same disagreement in the `gic` arm was withholding nothing
 * from 24 rows / 145,237 participants, and nothing looked for it, because the
 * general statement — *the strip and the pricer disagree about an
 * abbreviation* — was filed as one row's footnote rather than sized as a
 * class. The `gic` half is fixed above, with a derived assertion that fires on
 * any future pattern-level divergence. *A defect described in general and
 * priced in particular is a class nobody has counted.*
 *
 * `Stable Val` REMAINS, and its reason is now narrower and worth the
 * distinction: it is not a pattern-level disagreement at all — the pricer
 * matches through its own ABBREVIATION EXPANSION, which no comparison of the
 * two sources can see, so the assertion above is silent on it by construction
 * and widening this constant cannot reach it.
 *
 * app.js keeps a twin (browser script, no module system); the generator
 * extracts this VERBATIM and `smoke-test.mjs` runs the browser copy against
 * this one on pinned names and fails on drift. */
export const CONTRACT_DESIGNATION_NAME = /\b(?:investment|insurance) contracts?\b/i;
const CONTRACT_DESIGNATION_WORDS = /\b(?:investment|insurance) contracts?\b/gi;
export function isInvestmentContractRow(f, cleanedName, namesAFund) {
  const type = String((f && f.type) || "");
  if (!/^mutual fund/i.test(type)) return false;
  const s = String(cleanedName || (f && f.name) || "");
  if (!CONTRACT_DESIGNATION_NAME.test(s)) return false;
  const rest = s.replace(CONTRACT_DESIGNATION_WORDS, " ")
    .replace(GUARANTEE_PRICED_WORDS, " ").replace(/\s+/g, " ").trim();
  return !namesAFund(rest);
}

/* THE FEE GATE MUST NEVER AGAIN BE NARROWER THAN THE TYPE RULE — 2026-10-02.
 *
 * `annuityFeeIsGuaranteeOnly` reached ONE wording while the TYPE rule read
 * three (the eighth recorded instance of a fix for one phrasing not being a
 * fix for the class), was widened to those same three, and was then found a
 * day later to be short of 67. It now reads the bare `CONTRACT_WORD`, which is
 * provably wider than both phrase regexes — but "provably" is a claim about
 * these strings, so it is CHECKED rather than asserted in prose.
 *
 * The derivation: a match of either phrase regex ends in `contract` or
 * `contracts` with a trailing word boundary AND has a space immediately before
 * it, so the matched text necessarily contains `\bcontracts?\b`. Both halves
 * of that are tested — the source's shape, and a live witness, because a test
 * on `.source` is a claim about a STRING and not about what the regex does.
 *
 * It lives here rather than beside the fee gate for two reasons, both
 * measured: `CONTRACT_DESIGNATION_NAME` is declared below the gate, so an
 * assertion placed there reads it in its temporal dead zone; and the
 * generator's slices end at these two functions' closing braces, so an
 * assertion inside one would be copied into app.js, where a module-load throw
 * breaks every row on every plan page rather than failing a gate. */
for (const [n, re] of [["ANNUITY_CONTRACT_NAME", ANNUITY_CONTRACT_NAME],
  ["CONTRACT_DESIGNATION_NAME", CONTRACT_DESIGNATION_NAME]]) {
  if (!/ contracts\?\\b$/.test(re.source))
    throw new Error(`lib-disclose: ${n} no longer ends in " contracts?\\b", so CONTRACT_WORD can no longer`
      + " be derived to be wider than it — the fee gate could silently narrow below the TYPE rule again"
      + " (2026-10-02). Re-derive the relation rather than shipping a quiet guard.");
  for (const probe of ["annuity contract", "annuity contracts", "an investment contract",
    "unallocated insurance contracts"]) {
    if (re.test(probe) && !CONTRACT_WORD.test(probe))
      throw new Error(`lib-disclose: CONTRACT_WORD misses ${JSON.stringify(probe)}, which ${n} matches`);
  }
}

/* AN FDIC-INSURED BANK DEPOSIT HAS NO EXPENSE RATIO — canonical copy, 2026-10-01.
 *
 * THE CLAIM. 110 rows / 106 entries / 106 plans / 138,550 participants /
 * $104,180,290 publish an estimated expense ratio on a holding whose own filed
 * name says it is a BANK DEPOSIT ACCOUNT: `Money Market Deposit Account` at
 * Schwab Bank Savings, Charles Schwab Trust Bank, TD Bank USA N.A., First Bank &
 * Trust, Banc of California, Alerus, DB&T FDIC Insured, the Merrill Lynch Bank
 * Deposit Program, the Raymond James Bank Deposit Program, `Wells Fargo Bank,
 * N.A.-Bank Deposit Sweep`. A deposit pays interest and charges no fund
 * expenses, so there is no expense ratio to estimate — the number is not
 * imprecise, it describes a cost that does not exist. 103 of the 110 print
 * exactly 0.2, `fund-er.js`'s generic unattributed money-market fallback.
 *
 * Surfaced by the 2026-10-01 read of the fee pre-emption, where `{Schwab
 * Savings} Money Market Deposit Account` publishes 0.2 and the issuer-specific
 * answer is 0.26 — and the finding was that BOTH are wrong, which no comparison
 * of the two could have shown. *A row whose correct answer is BLANK cannot be
 * fixed by choosing between two numbers.*
 *
 * WHY THE GATE IS THE ROW'S OWN TICKER, AND NOT `namesAFund`, AND NOT A SECOND
 * RESOLVER. The sibling rule above asks whether anything identifiable survives
 * the designation, through `namesAFund` — and that predicate is
 * `fundER(n) != null || !!fundTickerInfo(n)`, whose first arm answers 0.2 for ANY
 * money-market-ish remainder. So it is true of every row in this class by
 * construction and cannot discriminate: the same trap the fee pre-emption is made
 * of. What distinguishes them is whether the row resolves to a registered fund,
 * and of the 110 exactly THREE do — each a real fund WELDED onto the deposit
 * caption: `Money Market Deposit Account VANGUARD FEDERAL MONEY MARKET INV`
 * (VMFXX), `{Vanguard Fed Money Market Fund Invest Share} Money Market Deposit
 * Account` (VMFXX) and `Banc Master Deposit Account A 4 shares 4 Vanguard 500
 * Index Admiral` (VFIAX). Those keep their fee; the other 107 lose it.
 *
 * AND MY FIRST DRAFT ASKED THE WRONG STRING, which cost the third of those three.
 * It called `fundTickerInfo` on the NAME, where `lookupTicker` prepends the
 * ISSUER — so the Vanguard row whose fund lives only in the identity column
 * resolved VMFXX on the page and failed the gate, publishing a symbol with no
 * price beside it. *Measure through the function the page calls, with the
 * argument the page passes* — and the fix is to stop asking a second resolver at
 * all: this predicate is now purely about the NAME, and the call site ANDs it
 * with `!tk`, the ticker the page has already resolved. One question, asked once,
 * by the code that owns the answer.
 *
 * ALL 78 DISTINCT NAMES READ, and the one accepted cost is named rather than
 * rounded away: `{Gabelli Funds} Money Market Deposit Accounts Gabelli U.S.
 * Treasury Money Market Fund Class AAA` names a real fund in words, resolves to
 * no ticker, and so loses a fee. What it loses is the GENERIC 0.2 and not
 * Gabelli's own figure, so the row stops publishing a guess rather than losing a
 * fact — and refusing a fee is the safe direction.
 *
 * ONE ROW IS DELIBERATELY LEFT TO ANOTHER RULE: `{Ameritas Life Insurance
 * Company} Guaranteed deposit account` prints 0.35, the guarantee fallback, and
 * belongs to the owner-gated stable-value item rather than here — it is an
 * insurer's guaranteed account, not a bank deposit, and this rule reaching it is
 * incidental.
 *
 * FEE ONLY. The ticker is left alone: the three rows that publish one are
 * precisely the three that should, and suppressing it would withdraw a correct
 * identification to fix a fee.
 *
 * THE VOCABULARY IS TWO ARMS AND WAS FOUR, which the per-arm control is what
 * caught. `\bdeposit acct\b` is already covered by `acc(?:oun)?ts?` — that group
 * matches acct, accts, account and accounts alike — and `\bdemand deposit\b`
 * reaches 0 rows in the store AND is subsumed by the first arm on every spelling
 * a filing uses (`Demand deposit account`), so no pinned case could depend on
 * either of them. Both were removed rather than carried: *a guard that cannot
 * fire is decoration*, and here the tether is what proved it, since dropping an
 * arm changed no verdict.
 *
 * app.js keeps a twin (browser script, no module system); the generator extracts
 * this VERBATIM and `smoke-test.mjs` runs the browser copy against this one on
 * pinned names and fails on drift.
 *
 * ===========================================================================
 * WIDENED 2026-10-02 — THE RULE ABOVE WAS A FIX FOR TWO WORDINGS OF THE CLASS,
 * AND 61 ROWS OF ONE PROGRAM SURVIVED IT.
 *
 * THE RESIDUE, re-derived rather than inherited: **61 rows / 61 entries / 61
 * plans / 50,024 participants / $123,676,563** still published a fabricated
 * expense ratio on an FDIC-insured deposit, and 60 of them are ONE product —
 * Charles Schwab Bank Savings, the sweep Schwab's retirement plans hold cash
 * in. It matched on NEITHER column: `Schwab Bank Savings` contains no `deposit
 * account` and no `bank deposit`, so `isBankDepositRow("Schwab Bank Savings")`
 * was false, and the 61st is `{DB&T FDIC-Insured Investment Account} Money
 * Market Depsoit Account`, where the vocabulary word itself is misspelled.
 * (The previous cycle recorded this as a COLUMN gap — the bank in the issuer
 * cell where the predicate reads the name — and that was WRONG; a positive
 * control written on that premise printed `false` for the bare program name
 * and refuted it. It is both: the wording is outside the vocabulary AND the
 * program name sits in the issuer cell for 36 of the 61 rows. A screen built
 * on the column premise alone reads 3 rows, i.e. it measures the premise.)
 *
 * WHY A LONGER LIST OF WORDINGS IS NOT THE ANSWER, and what replaced it. The
 * 01:5xZ pruning note above says its vocabulary was cut from four arms to two
 * because two reached 0 rows — but it asked those arms against the names the
 * gate ALREADY REACHED, so it could never have seen a wording outside all
 * four. *A per-arm control measures the arms against the population the gate
 * already has, not against the class.* So this version asks the opposite
 * question of the WHOLE published store (1,724,201 rows), one candidate arm at
 * a time, and takes the filing's own NOUN rather than the phrases it appears
 * in: `\bdep(?:os|so)its?\b` subsumes both removed arms by construction and
 * reaches 311 further rows. The trailing `\b` is load-bearing — it is what
 * keeps `SPDR S&P 500 Depository Receipt` and `...in depository receipts` out.
 *
 * THE FOUR CONDITIONS, each measured against the whole store and each read:
 *   1. `deposit`/`deposits` as a NOUN (+ the one live misspelling `depsoit`):
 *      311 new rows, 26 of which publish a fee. All 238 distinct strings read:
 *      certificates of deposit, demand deposits, deposit management programs,
 *      bank deposit programs, insurer deposit administration contracts. Not
 *      one is a registered fund.
 *   2. `savings account` — a savings account IS a deposit. 32 rows, 21
 *      strings, 1 unique fee row (`Wells Fargo Savings Account`, 2,206
 *      readers, 0.45).
 *   3. `bank savings` / `money market savings` as ADJACENT words: the deposit
 *      PROGRAM's own name. 402 rows, 60 of which publish a fee, and all 21
 *      distinct strings are Charles Schwab Bank Savings. The ORDER is the
 *      discriminator and it is why this is not a `bank` rule: `bank savings`
 *      is a product, `savings bank` is an institution, and 1,585 rows carry
 *      `bank` inside a TRUSTEE's name (`{Charles Schwab Trust Bank} Schwab
 *      S&P 500 Index Fund`, `{Capital Bank and Trust Company} American Funds
 *      2030 Target Date Retirement Fund`) whose fees are correct.
 *   4. `money market account` AND a `bank` word — the only CONJUNCTION,
 *      because the two halves are each false alone. 9 rows, every one read,
 *      and 8 are unarguably a bank's deposit account (`El Dorado Savings
 *      Bank`, `Alliance Bank`, `Paragon Bank`, `Andover Bank`, `Amalgamated
 *      Bank Enhanced Money Market`). The ninth, `{Charles Schwab Trust Bank}
 *      Charles Schwab Money Market Account` (134 ppl), could be Schwab's
 *      retail money FUND rather than the deposit — it is named here as
 *      ambiguous and withdrawn anyway, because the fee it publishes is
 *      fund-er.js's Schwab house pattern under either reading and withdrawal
 *      is the safe direction.
 *
 * TWO CANDIDATE ARMS WERE REFUSED AND THE MEASUREMENT IS WHY, not a judgement:
 *   - `sweep` and `fdic` each reach rows (58 and 65) but **0 that publish a
 *     fee**, and the single fee row `fdic` touches is already taken by the
 *     misspelling arm. A guard that cannot fire is decoration — and this time
 *     the question was asked of the whole store rather than of the gate's own
 *     population, which is the correction to the 01:5xZ pruning.
 *   - bare `money market account`, asked WITHOUT the bank conjunct, reaches
 *     **189 fee-publishing rows / 486,616 participants** and would be a
 *     catastrophe: 41 of them are `CREF Money Market Account` (197,268
 *     readers), TIAA's variable-annuity account, plus `Vanguard Prime Money
 *     Market Account`, `Prudential Government Money Market Account` and `Voya
 *     Government Money Market Account`. `Account` is the filer's loose word
 *     for a fund position; those vehicles have real expense ratios. *A fix for
 *     one phrasing of a class is not a fix for the class — and a phrasing that
 *     looks like the class can belong to a different one.*
 *
 * IT READS THE ROW, NOT THE NAME. A filing splits one program's name across
 * the issuer and name cells at an arbitrary point — `{Schwab Bank Savings}
 * Money Market / Cash Equivalent` (36 rows, 27,542 readers), `{Schwab Bank}
 * Savings Money Market Fund`, `{} MMKT - Schwab Bank Savings`, `{MONEY MARKET
 * DEPOSIT ACCOUNT} Money Market / Cash Equivalent` — so a rule reading either
 * cell alone sees a fragment. The string tested is the one the page PRINTS,
 * `issuer · name`, and the name-only control loses 5 of the 48 distinct pairs
 * including the largest. Both display paths print the issuer before the name.
 *
 * AND IT NORMALISES CONTROL CHARACTERS, which is `cleanFiledName`'s own
 * treatment and not a new idea: one live row files its issuer as
 * `Schwab\u0003Bank\u0003Savings`, where 0x03 is a broken font's space. `\s`
 * does not match it, so `bank\s*savings` fails on the program's own name. The
 * NAME column already gets this normalisation inside `cleanFiledName`; the
 * ISSUER column never passes through that function, so it is applied here.
 * Measured after normalising: a LOOSE `bank\s*savings` (no leading `\b`,
 * which would also catch an institution called `Burbank Savings`) and the
 * tight `\bbank\s*savings\b` disagree on 0 of the store's rows, so the tight
 * form ships.
 *
 * WHAT MOVED, measured through app.js's whole `er` expression (all eleven
 * suppressors, both sides pinned by path, the before side on the HEAD copy of
 * this file): **90 rows / 90 entries / 90 plans / 81,444 participants /
 * $179,762,762** stop publishing a fee — 75 at the generic 0.2, 10 at 0.26, 4
 * at the guarantee 0.35, 1 at 0.45. **0 fees gained, 0 fees changed, 0
 * tickers, 0 asterisks, 0 shown types, 0 cleaned names**: FEE ONLY, measured
 * rather than asserted. The predicate's FLAG moves on 714 rows / 1,004,969
 * participants, and the gap between 714 and 90 is the point — 624 of those
 * rows were already suppressed by `gicRow`, `annuityRow`, `contractRow` or
 * `namelessRow`, or were never priced. *A count of a condition is not a
 * measure of a defect.* All 48 distinct (issuer, name) pairs losing a fee were
 * read; not one names a registered fund.
 *
 * COSTS NAMED, in both directions:
 *   - 4 insurer rows / 1,411 readers are reached incidentally and lose the
 *     fabricated 0.35: two `Deposits in guaranteed interest accounts`
 *     (Principal Life), `{Guaranteed deposit fund Empower} Guaranteed Deposit
 *     Fund`, and `{Deposit Administration Contract "} SAGIC Diversified Bond
 *     II`. They belong to the owner-gated stable-value item, not here — the
 *     same relationship the Ameritas row above already records — and the
 *     withdrawal is in the same safe direction, so they are named rather than
 *     engineered around.
 *   - `Eaton Vance Floating Rate Deposit R` (292 readers) is the one string in
 *     238 that might be a garbled real fund. It publishes NO fee, so nothing
 *     a reader sees changes; it is recorded because a future fee would.
 *   - `Retirement Savings Account` (10,159 readers) is a caption rather than a
 *     bank product and arm 2 claims it. Also publishes no fee.
 *   - ONE PINNED EXPECTATION MOVED ON PURPOSE: `smoke-test.mjs` held
 *     `Fidelity Certificate of Deposit Portfolio Vanguard 500 Index Admiral`
 *     in its must-be-FALSE half, pinned as "a certificate of deposit inside a
 *     fund's name". A certificate of deposit IS a bank deposit with no fund
 *     expenses, so the noun arm calls it one and the case moved to the welded
 *     group, where `!tk` keeps its fee. Priced first: 0 of the 90 withdrawals
 *     publish a ticker.
 *
 * THE RESIDUE IS NAMED AND IS A DIFFERENT CLASS: **112 rows / 110 plans /
 * 135,146 participants** still publish a pattern fee where a BANK word sits
 * beside a bare `money market` — `{} TD BANK INSTITUTIONAL MONEY MARKET`,
 * `{} Peoples Bank Special Money Market`, `{} Webster Bank Money Market`. It
 * cannot be split by name: those sit in the same population as `{Charles
 * Schwab Trust Bank} Schwab Government Money Fund`, `{State Street Bank &
 * Trust Co.} State Street Instl US Govt Money Market Premier` and `{Capital
 * Bank and Trust Company} American Funds U.S. Government Money Market Fund`,
 * which are REGISTERED money funds with real expense ratios. Telling them
 * apart needs a witness from outside this store (a registry lookup on the
 * fund name), not a wider vocabulary, so it is left as a sized item.
 *
 * Every arm has a negative control written out IN FULL, each required to
 * disagree with this rule on exactly its own cases (7 of 7 do, including the
 * conjunction asked without its bank conjunct, which must fire on CREF). The
 * twin tether was negative-controlled in both drift directions and fails by
 * name on each: the old vocabulary disagrees on 11 of 41 pinned rows, a
 * name-only twin on 5 of 41.
 * =========================================================================== */
export const BANK_DEPOSIT_NAME =
  /\bdep(?:os|so)its?\b|\bsavings\s+acc(?:oun)?ts?\b|\b(?:bank|money\s*market)\s*savings\b/i;
/* ...and the fourth condition is a CONJUNCTION and cannot join the alternation
 * above, because `money market account` on its own is the filer's loose word
 * for a FUND position and not a deposit product: asked alone it reaches 189
 * fee-publishing rows / 486,616 participants, 41 of them `CREF Money Market
 * Account` (197,268 readers) and others `Vanguard Prime Money Market Account`,
 * `Prudential Government Money Market Account`, `Voya Government Money Market
 * Account` — variable-annuity accounts and registered money funds that have a
 * real expense ratio. Paired with a BANK word it reaches 9 rows, every one of
 * them read. */
export const BANK_DEPOSIT_MMA = /\bmoney\s*market\s+acc(?:oun)?ts?\b/i;
export const BANK_DEPOSIT_BANK = /\bbanks?\b/i;
export function isBankDepositRow(f, cleanedName) {
  /* the string the page PRINTS — `issuer · name`. A filing splits one program
   * name across the two cells at an arbitrary point, and the control-character
   * normalisation is `cleanFiledName`'s own (a broken font ships 0x03 where
   * the space belongs), applied here because the ISSUER cell never passes
   * through that function. */
  const s = (String((f && f.iss) || "").replace(/\*+/g, "") + " " + String(cleanedName || ""))
    .replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s{2,}/g, " ").trim();
  return BANK_DEPOSIT_NAME.test(s)
    || (BANK_DEPOSIT_MMA.test(s) && BANK_DEPOSIT_BANK.test(s));
}
/* THE TWO ARMS THIS RULE REPLACED ARE SUBSUMED, AND SOMETHING READS THAT.
 * `\bdeposit\s+acc(?:oun)?ts?\b` and `\bbank\s+deposit\b` are both strictly
 * inside `\bdep(?:os|so)its?\b`, so removing them changes no verdict — but the
 * 01:5xZ pruning made the same claim about two other arms by asking them
 * against the names the gate already reached, which could never have seen a
 * wording outside all four. This asserts the subsumption on the removed arms'
 * own cases, and asserts the decoys that cost the most readers stay OUT. */
for (const probe of ["deposit account", "deposit accounts", "deposit acct", "deposit accts",
  "bank deposit", "Merrill Lynch Bank Deposit Program", "Money Market Deposit Account",
  "Wells Fargo Bank, N.A.-Bank Deposit Sweep", "Demand deposit account"]) {
  if (!isBankDepositRow(null, probe))
    throw new Error(`lib-disclose: the widened bank-deposit rule no longer subsumes the two arms`
      + ` it replaced — ${JSON.stringify(probe)} matched \\bdeposit acc(oun)?ts?\\b or`
      + " \\bbank deposit\\b and no longer matches. Re-derive the relation rather than"
      + " shipping a quiet narrowing (2026-10-02).");
}
for (const probe of ["CREF Money Market Account", "CREF Money Market Account R2",
  "Vanguard Prime Money Market Account", "Prudential Government Money Market Account",
  "P&G Savings Short-Term Invested Unitized Account (money market fund)",
  "Procter & Gamble Savings Plan – Russell 2000 Index SMA", "SPDR S&P 500 Depository Receipt",
  "Vanguard Federal Money Market Fund", "Fidelity 500 Index Fund"]) {
  if (isBankDepositRow(null, probe))
    throw new Error(`lib-disclose: the bank-deposit rule now calls ${JSON.stringify(probe)} a bank`
      + " deposit, which would withdraw a real vehicle's expense ratio — the`money market"
      + " account` conjunction or the `savings` arm has been widened past its measurement.");
}

/* A POOLED FUND TYPED `Company stock` — 2026-09-29, and it is the first of
 * this family that costs readers a NUMBER as well as telling them a falsehood.
 *
 * THE CLAIM. `stockRow` in app.js reads the type and the name together, and
 * when it fires it does two things: it suppresses the ticker and the expense
 * ratio, and it puts the PLAN SPONSOR'S OWN STOCK TICKER in the ticker cell,
 * because an employer security really is named by the sponsor's symbol. So a
 * row typed `Company stock` whose filed name is `Target Retirement Date Fund
 * 2045` does not merely carry a wrong label: Duke Energy's 35,803 participants
 * were shown SIXTEEN pooled funds — nine target-date vintages, three index
 * funds and four blend funds, $5,575,809,000, 50.1% of the published menu —
 * each tagged DUK. A wrong answer outranks a missing one, and a symbol reads
 * as knowledge.
 *
 * THE CAUSE IS IN THE FILING AND IT IS STRUCTURAL, read rather than inferred.
 * Duke's Schedule H line 4i is printed under its own section headings:
 *     Common Stock Funds
 *       Duke Energy Common Stock Fund .................... 1,070,296
 *     Institutional Funds
 *       US Equity Small/Midcap Blend Fund .................. 572,190
 *       Target Retirement Date Fund 2045 ................... 313,262
 *     Commingled Funds
 *       US Equity S&P 500 Index Fund ..................... 2,884,255
 * `lib-4i` adopts a heading as the current section only when the heading
 * itself CLASSIFIES, so `Commingled Funds` resets the type and `Institutional
 * Funds` — which names no vehicle in the type table — does not. The previous
 * section's type therefore leaks over every row beneath it until the next
 * heading that happens to classify. That is a parser defect and it is worth a
 * bump of its own; this rule is the DISPLAY half, and it is display-side
 * because the whole of the evidence is in the stored name and type.
 *
 * THE DISCRIMINATOR IS WHAT THE NAME SAYS THE HOLDING IS, in the filing's own
 * words: a maturity vintage, a tracked index, or an asset class. A company's
 * shares have no maturity year, track no index and are not an asset class, so
 * a name stating one of those is not naming the employer's stock whatever the
 * type column inherited.
 *
 * WORDS THAT CAN ALSO NAME A FIRM ARE DELIBERATELY ABSENT, and each was
 * measured out rather than reasoned out. A first draft included `equity`,
 * `international`, `global`, `real estate`, `freedom` and `value`, and every
 * one produced false positives on real employer stock in this store:
 * `JOHNSON CONTROLS INTERNATIONAL`, `Oceaneering International, Inc.`,
 * `S&P GLOBAL INC`, `Dine Brands Global, Inc.`, `Real Estate Investment Trust`
 * [issuer American Tower Corporation], `Freedom Bank Unitized Stock`, and
 * Charles Schwab's own `Schwab 401(k) Equity Unit Fund`. An asset word is not
 * a house word — and here a house word is not an asset word either.
 * `freedom` survives only bound to a vintage (`Fidelity Freedom 2040`), which
 * is what separates it from Freedom Bank.
 *
 * THE VOCABULARY IS THE MINIMAL SUFFICIENT ONE AND THAT IS MEASURED. Every arm
 * below brings in at least one row no other arm reaches. Three further arms
 * were written and dropped because their marginal contribution over the whole
 * live store is ZERO: `\blifecycle\b|\blifepath\b`, `\bfixed income\b` (Duke's
 * two such rows are reached by `blend` and `index`) and `\basset allocation\b`.
 *
 * THE NAME ARM OF `stockRow` IS NOT TOUCHED, by construction: a row whose own
 * name says `common stock` or `employer security` is refused here, so
 * everything this rule can change is a row the TYPE alone condemned. That is
 * what keeps `Fidelity Leveraged Company Stock Fund`, `Marriott International,
 * Inc. Common Stock Fund` and `Listed equity securities Tesla Motors, Inc.
 * Common Stock` exactly as they are.
 *
 * MEASURED OVER THE WHOLE LIVE STORE THROUGH THE PUBLICATION GATE
 * (`lineups-status.c`), every distinct name read:
 *   - 184 rows / 59 published entries (2 of them master trusts) / 61 plans /
 *     353,959 participants / $10,909,455,123, across 167 distinct names.
 *   - 166 of the 167 name a pooled investment. The one that does not is
 *     `Bonds, and Common Stock Notes from 5.75% to` ($57,744) — an OCR'd prose
 *     fragment that names nothing either way, so the change withdraws a claim
 *     from it rather than making one. It is named here rather than rounded off.
 *   - 33 rows stop publishing the SPONSOR'S OWN TICKER on a pooled fund: 27
 *     withdrawn outright and 6 CORRECTED to the fund's own symbol (H&R Block's
 *     `Vanguard Extended Market Index Fund` moves HRB -> VEXAX).
 *   - 0 rows sit at 25% or more of their own menu, so no dominance guard and
 *     no confidence decision can move; this is a display rule and could not
 *     move them in any case.
 *
 * THE COVERAGE HALF IS REAL AND IS NOT THE LARGER HALF: 46 rows gain a fund
 * ticker and 102 gain an expense ratio they were denied, both counted AFTER
 * the guarantee refusal below. That is what makes this item different from its
 * annuity and investment-contract siblings, which cost readers nothing but the
 * truth.
 *
 * AND THE FEE MUST NOT BE LIFTED BLINDLY, which the measurement caught before
 * anything shipped. 9 of the flagged rows would newly publish `fund-er.js`'s
 * generic /stable value|managed income|guaranteed|gic/ fallback — `NOV Stable
 * Value Fund`, `Lincoln Stable Value Fund`, `Principal Fixed Income Guaranteed
 * Option` — which is the exact fabricated number 89 rows had withdrawn from
 * them on 2026-09-29. So the fee half asks its sibling's question: remove the
 * words the table prices a guarantee on and ask the same table again; if
 * nothing identifiable is left to price, the guarantee was the only thing
 * priced and no fee is published. Deliberately NOT keyed on `er === 0.35` — a
 * rule keyed on a magic number stops working in silence the day it moves.
 *
 * THE RESIDUE IS NAMED, NOT WAVED AT. Of the 1,810 rows this rule leaves typed
 * `Company stock`, 863 carry a stock designation in the name or issuer and 559
 * share a distinctive word with the plan sponsor's own filed name; all 385
 * distinct names in the remaining 388 were read. They are overwhelmingly an
 * affiliate's or parent's stock (`Elevance Health` at ATH Holding, `AT&T INC`
 * at BellSouth) or a brokerage window's individual securities. A real residue
 * of pooled funds this vocabulary does not reach survives and is not claimed
 * as fixed: `FID GR CO POOL CL O` ($2,201,284,123, a master trust),
 * `Fidelity Leveraged` and `Fidelity Advisor Leveraged` on nine small plans,
 * `Washington Mutual Investors Fund Class R-6`, `Income Fund` [Dodge & Cox],
 * `Enterprise Fund` [Janus Henderson], `Invesco Qqq Trust Series 1`,
 * `Ishares Bitcoin Trust ETF`. None of them states a vintage, an index or an
 * asset class, so no honest extension of this vocabulary reaches them; the
 * parser-side section fix would.
 *
 * app.js keeps a twin (browser script, no module system); the generator
 * extracts BOTH functions VERBATIM and `smoke-test.mjs` runs the browser copy
 * against this one on pinned rows and fails on drift. */
export const EMPLOYER_STOCK_CLAIM = /company stock|employer (security|stock)/i;
export const POOLED_CONSTRUCTION_NAME = new RegExp([
  /* a maturity vintage — a fund has one, a share of stock does not */
  "\\btarget(?:ed)?[- ](?:date|retirement)\\b", "\\bretirement date\\b",
  "\\b(?:freedom|target|retirement|lifecycle|lifepath)[- ]?\\s*20[0-7]\\d\\b",
  "\\b20[0-7]\\d[- ]?\\s*(?:target|retirement)\\b",
  /* a tracked index — a company's shares track nothing */
  "\\bindex\\b", "\\bidx\\b", "\\bs&p ?\\d", "\\brussell\\b", "\\bnasdaq\\b",
  "\\bmsci\\b", "\\bftse\\b", "\\bdow jones\\b",
  /* an asset class or a construction style — a pool, never one issuer */
  "\\bmoney market\\b", "\\bbonds?\\b", "\\btreasur",
  "\\bsmall.?cap\\b", "\\bmid.?cap\\b", "\\blarge.?cap\\b", "\\ball.?cap\\b",
  "\\bsmall/mid\\b", "\\bmidcap\\b", "\\bemerging markets?\\b",
  "\\bblend\\b", "\\bbalanced\\b", "\\binflation[- ](?:protected|response)\\b",
  "\\bgrowth fund\\b", "\\bstable value\\b", "\\bmanaged income\\b",
  "\\bguarantee(?:d|s)?\\b",
].join("|"), "i");
export function isMistypedStockRow(f, cleanedName) {
  const type = String((f && f.type) || "");
  if (!EMPLOYER_STOCK_CLAIM.test(type)) return false;
  const s = String(cleanedName || (f && f.name) || "");
  /* the NAME arm of the shipped predicate keeps deciding for itself */
  if (EMPLOYER_STOCK_CLAIM.test(s)) return false;
  return POOLED_CONSTRUCTION_NAME.test(s);
}
/* The fee a row may publish once the employer-stock claim is withdrawn — the
 * annuity rule's question asked of a different population, and kept as its own
 * function rather than folded into `annuityFeeIsGuaranteeOnly` because that one
 * is shipped, tethered on pinned names, and gates on the annuity phrase this
 * population does not carry. It requires a guarantee word to be PRESENT (the
 * strip must actually remove something), so it is inert on the 175 flagged rows
 * that carry none and cannot quietly blank a real fund's fee. */
export function mistypedStockFeeIsGuaranteeOnly(cleanedName, priceOf) {
  const s = String(cleanedName || "").replace(/\s+/g, " ").trim();
  const rest = s.replace(GUARANTEE_PRICED_WORDS, " ").replace(/\s+/g, " ").trim();
  if (rest === s) return false;
  return priceOf(rest) == null;
}

/* A ROW TYPED EMPLOYER STOCK THAT NAMES A DIFFERENT COMPANY — 2026-10-01.
 *
 * `app.js`'s ticker cell is `stockRow ? (plan.ticker || null) : ...`, so where
 * the row is judged employer stock the page does not merely withhold a symbol:
 * it PUBLISHES THE PLAN SPONSOR'S OWN, whatever the row is named. Bank of
 * America's 250,040 participants were shown `INTERNATIONAL BUSINESS MACHS` and
 * `EXXON MOBIL CORP` with **BAC** beside them; FedEx's two plans (310,374
 * between them) showed `Master Trust` as **FDX**; and the GE spin-off reads
 * wrong in BOTH directions — General Electric's plan (105,231) printed
 * `GE Vernova Common Stock` as **GE** where GE Vernova is GEV, and Ropcor's
 * (33,134, GE Vernova's own filer) printed `GE Common Stock` as **GEV**.
 *
 * `isMistypedStockRow` above cannot reach any of them, and not by oversight: it
 * stands down whenever the NAME itself claims stock — which is what keeps a
 * genuine `Employer Common Stock` row safe and exactly what lets a spun-off
 * company's *stock fund* read as the sponsor's own — and otherwise requires
 * `POOLED_CONSTRUCTION_NAME`, so a row naming a single other COMPANY, a master
 * trust or an ordinary mutual fund is outside it by construction.
 *
 * THE RULE, in one sentence: THE SPONSOR'S SYMBOL IS PUBLISHED ONLY WHERE THE
 * ROW NAMES THE SPONSOR, AND NEVER WHERE IT NAMES A DIFFERENT LISTED COMPANY.
 * Two arms, both over evidence the page already holds — the plan's own filed
 * sponsor name, the curated public name behind its ticker, and the boot
 * payload's 112,652 (sponsor, ticker) pairs. No registry, no new source and no
 * vocabulary of companies.
 *
 *   I  CORROBORATION. A content token of the company's name (>=3 characters,
 *      equal or in a PREFIX relation), or a SHORT FORM — the plan's own symbol,
 *      an acronym of the company's name, or a 2-5 character prefix of one of
 *      its words — where everything else in the name is employer-stock caption
 *      vocabulary, or a bare caption with no identification in it at all.
 *   II CONTRADICTION. Even when corroborated, a contiguous run of the name's
 *      content tokens that is ANOTHER plan sponsor's whole key, mapping to a
 *      different ticker, means the row names that company. This is the queue's
 *      own discriminator: Phillips 66, Keysight Technologies, Uber
 *      Technologies, Murphy USA and The Coca-Cola Company are themselves
 *      sponsors in our universe.
 *
 * IT WITHDRAWS AND NEVER ASSERTS. Arm II positively identifies the other
 * company and its symbol is deliberately NOT published in place: the row is
 * typed `Company stock` by a section heading our own parse inherited, so what
 * the holding IS remains unknown and only the false claim can be removed. A
 * blank is honest; a symbol reads as knowledge.
 *
 * MEASURED OVER THE WHOLE LIVE STORE through app.js's own render, with
 * plan.ticker supplied per MEMBER PLAN because a trust lineup is read by
 * several plans and each has its own symbol:
 *   - 463 published rows across 424 plans / 10,432,227 participants print the
 *     sponsor's symbol today. 412 are kept; 51 are withdrawn (44 by arm I,
 *     7 by arm II), across 45 plans / 1,047,002 participants.
 *   - all 51 read: 24 name a different, identifiable company (IBM and Exxon at
 *     BAC, Smucker at P&G and at ADM, LXP Industrial Trust at Amex and at CSX,
 *     Spotify at DXC, Raymond James at Ameriprise, Olin and Elevance at
 *     Rockwell, Albemarle at NewMarket, Ford at Cleveland-Cliffs, ONEOK at ONE
 *     Gas, Emerson at ESCO, ESAB at Enovis, Vitesse at Jefferies, ADC
 *     Therapeutics at Western Union, Pfizer at Minerals Technologies, F&G and
 *     Cannae at FNF, both GE rows, both Murphy rows, Coca-Cola at its bottler,
 *     Uber and Keysight at Agilent and Keysight); the other 27 name a MASTER
 *     TRUST, a mutual fund, cash, a brokerage aggregate or audit prose. Not one
 *     is the sponsor's own stock.
 *   - 0 fees move, 0 asterisks move, 0 shown types move: `stockRow` still
 *     suppresses the fee on these rows exactly as before, so the only cell that
 *     changes is the symbol.
 *
 * A RESIDUE TEST WAS WRITTEN FIRST AND ITS OWN OUTPUT KILLED IT. "Remove the
 * company's words and the caption vocabulary and ask whether anything is left"
 * is the idiom this file already uses for the loan description and the
 * investment contract, and here it withdraws 85 rows — destroying IBM's own
 * 149,818-participant row (`International Business Machines Corporation -
 * Managed by Independent Fiduciary - State Str`), PPG's `Investment in PPG
 * Industries, Inc.`, Markel's `common stock, cost of`, Vertex's `real-time
 * traded stock fund`, Leidos' `Closed Stock Fund` and Schwab's Ameritrade and
 * option rows. An employer-stock row legitimately carries arbitrary
 * descriptive prose about the FUND, so an empty residue is not available as
 * evidence. *A predicate that is right for one class is not thereby right for
 * its neighbour.*
 *
 * A NEGATIVE CONTROL PER CONDITION over the whole reachable population, each
 * variant written DIRECTLY from this body rather than by surgery on it, and
 * each required to disagree BY NAME on exactly its own cases. Six are
 * load-bearing and THREE ARE DECORATIVE ON THIS STORE, which is said here
 * rather than discovered later:
 *   (1) the content-token arm          325 rows — the rule itself
 *   (3) `rest is caption` on the short arm  1 — and it is the 105,231-participant
 *       `GE Vernova Common Stock` row, because `GE` is both General Electric's
 *       symbol and a prefix of `General`
 *   (4) the short-form arm                11 — FBIN, IFF, AIT, NJR x2, UPC,
 *       WD-40, `ADM COMMON STOCK`
 *   (5) the bare-caption arm              13 — Verizon's 119,145 and Cisco's
 *       72,556 among them
 *   (6) arm II                             7 — and ONLY arm II reaches those 7
 *   (9) the curated public name            1 — `GE Vernova` at Ropcor, the
 *       filer whose own name shares nothing with the company it files for
 *   (2) PREFIX-only containment   0 rows: subsumed, because arm II withdraws
 *       `Phillips 66 Stock Fund` at ConocoPhillips anyway. KEPT because arm
 *       II only reaches a company that is ITSELF a sponsor in our universe
 *       (1,190 keys), and this condition is the belt for every company that is
 *       not.
 *   (7) DELETING the apostrophe   0 rows: subsumed, because `mcdonald` is a
 *       PREFIX of `mcdonalds`, so arm I rescues `MCDONALD'S CORPORATION` even
 *       when the apostrophe is spaced. Kept because deletion is the correct
 *       normalisation and the two conditions are independent — spacing the
 *       apostrophe is the recorded miss that cost this record a sponsor match
 *       for the third time, and it is not protected here by design.
 *   (8) the acronym floor of 3    0 rows: subsumed by (3), which refuses `GE`
 *       before the floor is consulted. Kept as a pre-filter.
 *
 *
 * COST NAMED: 0 correct symbols are withdrawn, and that is what the reading of
 * all 51 rows establishes rather than a count. The arm-I floor of three
 * characters costs nothing only because of the short-form arm: without it
 * `EZ Corp` at EZCORP (4,511 ppl), `UPC Common Stock` at Union Pacific
 * (33,283), `CFSI ESOP` at Community Financial System (3,775), `IFF Common
 * Stock` (7,094), `FBIN STOCK` (6,433), `AIT INC` (5,948) and `NJR Common
 * Stock` (1,639) all lose a CORRECT symbol.
 *
 * AND THE 51 ROWS KEEP THEIR `Company stock` TYPE AND THEIR SUPPRESSED FEE,
 * which is the accepted cost of staying narrow: `stockRow` is untouched, so a
 * row like `MFS International Equity Fund Class 3A` stops asserting HRB and
 * still does not resolve its own fund. Lifting the fee means deciding what the
 * holding IS, which is the parser-side section fix.
 *
 * RESIDUE, named rather than claimed as fixed. Two Rockwell Automation rows
 * (15,827 ppl) keep ROK on `ELEVANCE HEALTH INC` and `OLIN CORP`, because
 * `rockwell` corroborates and neither other company is a ticker-bearing
 * sponsor key of two or more words in our universe; `Fidelity Adv Leveraged
 * Company Stock` and `Fidelity Leveraged Company Stock Fund` are withdrawn
 * here but still typed `Company stock`, which is the parser-side section fix.
 *
 * REPORT PATH ONLY, as a GUARANTEE and not as an empty diff:
 * `build-seo-pages.mjs` renders two columns, name and value, and has no symbol
 * cell for a holding at all, so no crawlable page can carry this claim.
 * app.js keeps the twin; the generator slices this VERBATIM and
 * `smoke-test.mjs` runs the browser copy against this one on pinned rows. */
const ESP_FORM_WORD = new Set(["inc", "incorporated", "corp", "corporation", "co",
  "company", "companies", "holding", "holdings", "group", "llc", "llp", "lp", "plc",
  "ltd", "limited", "sa", "nv", "ag", "se", "the", "and", "of", "its",
  "participating", "subsidiaries", "subsidiary"]);
/* Words an employer-stock row carries INSTEAD of naming anything — read off the
 * 463 rows this rule can reach, and used only to decide whether a SHORT token
 * is the whole identification. A word that could name a company is absent on
 * purpose, and that omission costs rows rather than correctness. */
const ESP_CAPTION_WORD = new Set(["common", "stock", "stocks", "share", "shares",
  "employer", "employers", "employee", "employees", "security", "securities",
  "related", "corporate", "fund", "funds", "unit", "units", "unitized", "esop",
  "equity", "equities", "preferred", "par", "value", "values", "per", "class",
  "at", "fair", "held", "sponsor", "sponsors", "allocated", "unallocated",
  "nonparticipant", "participant", "directed", "pending", "qualifying",
  "investments", "in", "no", "adr", "interest"]);
const espNorm = (s) => String(s || "").toLowerCase()
  .replace(/['’`]/g, "")          // DELETED, never spaced: Mcdonald's
  .replace(/&/g, " and ")
  .replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
const espToks = (s) => espNorm(s).split(" ").filter(Boolean);
const espContent = (s) => espToks(s).filter((w) => !ESP_FORM_WORD.has(w));
/* every in-order subsequence of a company name's token initials, 3-5 long:
 * `UPC` for Union Pacific [Railroad] Company, `CFSI` for Community Financial
 * System Inc, `AIT` for Applied Industrial Technologies. A floor of three is
 * what keeps `GE` out of General Electric's initials. */
function espInitials(words) {
  const out = new Set();
  const n = Math.min(words.length, 8);
  const rec = (i, acc) => {
    if (acc.length >= 3 && acc.length <= 5) out.add(acc);
    if (acc.length >= 5 || i >= n) return;
    for (let j = i; j < n; j++) rec(j + 1, acc + words[j][0]);
  };
  rec(0, "");
  return out;
}
const espRestIsCaption = (tokens, skip) => tokens.filter((w) => w !== skip)
  .every((w) => ESP_CAPTION_WORD.has(w) || ESP_FORM_WORD.has(w)
    || /^\d+$/.test(w) || w.length === 1);

/** The index key for one sponsor name. Exported so the browser's index builder
 *  and arm II cannot normalise differently. */
export function sponsorNameKey(sponsorName) {
  return espContent(sponsorName).join(" ");
}

/** May this row publish the plan sponsor's own ticker?
 *  @param otherSponsors Map<sponsorNameKey, Set<ticker>> over the boot list, or
 *  a falsy value — in which case arm II is inert, which is the safe direction. */
export function employerStockSymbolOk(cleanedName, iss, sponsorName, ticker, publicName, otherSponsors) {
  const nameToks = espToks(cleanedName);
  const nt = nameToks.concat(espToks(iss));
  if (!nt.length) return true;                      // nothing to judge
  const tk = espNorm(ticker);
  let ok = false;
  /* (I) a content token of the company's name */
  const own = new Set(espContent(sponsorName).concat(espContent(publicName)));
  for (const w of nt) {
    if (w.length < 3) continue;
    if (own.has(w)) { ok = true; break; }
    let pref = false;
    for (const s of own) {
      if (w.length >= 4 && s.length >= 4 && (w.startsWith(s) || s.startsWith(w))) { pref = true; break; }
    }
    if (pref) { ok = true; break; }
  }
  /* (I) a SHORT FORM, but only where it is the WHOLE identification */
  if (!ok) {
    const ac = espInitials(espToks(sponsorName));
    for (const w of espInitials(espToks(publicName))) ac.add(w);
    const filed = espContent(sponsorName);
    for (const w of nt) {
      if (w.length < 2 || w.length > 5) continue;
      if (!espRestIsCaption(nameToks, w)) continue;
      if ((tk && w === tk) || ac.has(w)) { ok = true; break; }
      for (const s of filed) if (s.startsWith(w)) { ok = true; break; }
      if (ok) break;
    }
  }
  /* (I) a bare employer-stock caption identifies nothing and claims nothing */
  if (!ok && nameToks.length && espRestIsCaption(nameToks, null)) ok = true;
  if (!ok) return false;
  /* (II) ...and the name must not be ANOTHER listed company's */
  if (!otherSponsors || !otherSponsors.size) return true;
  const t = espContent(cleanedName);
  const max = Math.min(t.length, 6);
  for (let len = max; len >= 2; len--) {
    for (let i = 0; i + len <= t.length; i++) {
      const hit = otherSponsors.get(t.slice(i, i + len).join(" "));
      if (!hit) continue;
      return hit.has(String(ticker || ""));         // its own symbol: faithful
    }
  }
  return true;
}

/* THE FEE LOOKUP NEVER SAW THE ISSUER COLUMN — canonical copy, 2026-09-29.
 *
 * `lookupTicker` has prepended the row's 4i IDENTITY cell on every attempt
 * since v67. The fee never has: app.js asked `fundERFiled(f.name)`, the cleaned
 * name ALONE. So a row whose house lives only in the identity column — the
 * normal shape since v126 promoted issuer headers — resolves a TICKER and
 * publishes a BLANK fee beside it. Cardinal Services publishes twelve clean
 * Vanguard target-date tickers and ZERO fees; TruGreen publishes 17 tickers of
 * 24 rows and 3 fees. Found by that asymmetry on the page, not by any count.
 *
 * This asks `fund-er.js` — the ONLY expense-ratio source — a more complete
 * question about the same row. It never invents, interpolates or defaults a
 * number: when the prefixed string resolves nothing the cell stays blank. And
 * it is STRICTLY ADDITIVE by construction, because app.js calls it only after
 * the bare-name lookup has already returned null.
 *
 * THE ISSUER MAY ADD A MANAGER AND MAY NEVER REPLACE ONE. That is
 * `resolveHolding`'s 2026-09-28 rule in scripts/match-sec-tickers.mjs, reused
 * rather than reinvented, because the identity cell OFTEN HOLDS A TRUSTEE or a
 * recordkeeping platform and a naive prefix then prices a competitor's fund at
 * this platform's rate. Three gates, and each was MEASURED against the rows it
 * exists to stop — all four of the recorded false positives, plus one this
 * record had not named:
 *
 *  (0) THE ISSUER CONTRIBUTES A FIRM, NOT ITS CORPORATE FORM. A firm's legal
 *      wrapper is not part of any fund's name, and leaving it in lets the
 *      wrapper satisfy a pattern's VEHICLE condition: `Vanguard Retirement
 *      Target 2045` under `Fidelity Management TRUST Company` matched
 *      fund-er.js's Vanguard-plus-target-plus-`trust|collective|pool` arm and
 *      published 0.045 — the COLLECTIVE TRUST price — on seven rows, with the
 *      word `trust` supplied entirely by the trustee's corporate name. Right
 *      house, wrong vehicle, and still a fabricated number. So the fiduciary
 *      and corporate-form words come off before the prefix is made.
 *
 *  (1) THE ISSUER MUST NOT SUPPLY THE ANSWER BY ITSELF. If the prefixed string
 *      resolves to the same number the issuer alone resolves to, the NAME
 *      contributed nothing and what is published is the issuer's house-wide
 *      default applied to whatever the row says. This is the largest gate and
 *      it catches three of the four recorded false positives outright:
 *        {American Funds} American Century Small Cap Growth R6 -> 0.4
 *        {American Funds Plans} DODGE & COX GLOBAL BOND - I    -> 0.4
 *        {Dimensional Fund Advisors} Schwab Fundamental Intl   -> 0.3
 *      each of which is `fund-er.js`'s bare `/american funds/i` or
 *      `/dfa |dimensional/i` house arm firing on the ISSUER text alone. It also
 *      closes a fabrication route this record has withdrawn cells for twice:
 *      an identity cell reading `Guaranteed Annuity Contracts TIAA` or
 *      `Stable value fund Standard Insurance Company` triggers the generic
 *      `/stable value|managed income|guaranteed|gic/` arm and would manufacture
 *      the exact 0.35% removed from 89 rows on 2026-09-29 and 34 before that.
 *
 *  (2) THE NAME'S FIRST WORD THAT COULD NAME A FIRM MUST BE LOAD-BEARING. Drop
 *      it and ask the same table again; if the answer does not move, the match
 *      never used that word — and in every wrong-house row read out of the
 *      residue that word is the OTHER house. `T. Rowe Price` + `MFS Mid Cap
 *      Value R6` resolves 0.65
 *      through a T. Rowe mid-cap-value arm that never reads `MFS`, and drops to
 *      the same 0.65 with `MFS` deleted. So does `{JP Morgan} AB Large Cap
 *      Growth I`, `{JPMorgan} American Century Equity Income`, `{T. Rowe Price}
 *      Parnassus Equity Income Inst`, `{T. Rowe Price} Putnam Large Cap Growth
 *      R6` and `{JP Morgan} Western Asset Core Plus Bond Fund`. This is the
 *      shipped sibling rule's own shape — remove the words, ask again — asked
 *      of IDENTITY rather than of price.
 *
 *      IT SKIPS A LEADING SHARE-CLASS DESIGNATION FIRST, and that one step was
 *      forced by the read: `{American Funds} Class R6 PGIM New World Fund Class
 *      R6` (2,582 participants) escaped a draft that looked only at the leading
 *      word, because `Class` is excused, so the gate never reached `PGIM` and
 *      0.57 — American Funds' New World fee — published under a name that says
 *      PGIM.
 *
 *      IT SKIPS ONLY A DESIGNATION, THOUGH, AND A SECOND DRAFT THAT SKIPPED
 *      EVERY EXCUSED WORD BROKE THIS ITEM'S OWN MOTIVATING CASE. Skipping the
 *      whole excused run walks past `Retirement 2030` in `{T. Rowe Price}
 *      Retirement 2030 Active Fund` and lands on `Active`, an adjective the
 *      T. Rowe retirement arm ignores — so the gate refused 0.55 on the very
 *      row this rule exists to fill. A share-class prefix is not part of the
 *      fund's name and may be stepped over; the fund's own first word may not.
 *
 * WHY GATE (2) NEEDS AN EXCUSE LIST, AND WHY THAT LIST IS NEGATIVE. A vintage
 * year is never load-bearing: `{American Funds} 2040 Target Date Retirement
 * Fund` resolves 0.32 through `/american funds.*target date/i`, which does not
 * read `2040`, and refusing it would withdraw 9,473 CORRECT rows. The same is
 * true of `The`, `Institutional` and `Advisor`. So the list names words that
 * CANNOT NAME A FIRM — and being negative it fails SAFE: a word missing from it
 * costs a correct gain and can never publish a wrong fee. It was read off the
 * 159 distinct first tokens gate (2) refuses, not written from memory, and the
 * firm-capable ones were deliberately LEFT OUT even where that costs rows:
 * `american`, `capital`, `mutual`, `investors`, `research`, `america` and every
 * house abbreviation (`amerfds`, `trwpr`, `amf`) are absent, because each of
 * them can lead another house's name — `American Beacon`, `American Century`,
 * `Capital Group`, `Mutual of America` — and the measured cost of refusing them
 * is ~2,300 rows against a wrong number on a live page.
 *
 * WHAT IS DELIBERATELY NOT HERE: a vocabulary of fund HOUSES. One was built to
 * READ the residue with, and it is the right tool for that — it is how these
 * wrong-house rows were found at all — but it is the wrong tool to ship. Its
 * most frequent hit is `{Vanguard} Wellington Admiral Fund`, a REAL Vanguard
 * fund whose name carries its SUB-ADVISER, and 260 of the 294 rows it flags are
 * that shape. A firm's name inside a fund's name is not always a second house,
 * and a house list is wrong in the UNSAFE direction: a house it omits publishes
 * a wrong fee in silence. Every gate above is structural and asks the fee table
 * itself.
 *
 * `priceOf` is injected for the same reason the two rules above inject it: this
 * module has no dependency on `fund-er.js`, a plain browser script. The caller
 * passes the bare table `fundER`, NOT app.js's `fundERFiled` — the
 * house-misspelling repair is a repair for a string believed to be a fund's
 * name, and two of the three gates here ask about strings that are explicitly
 * not one. app.js keeps a twin; the generator extracts this VERBATIM and
 * `smoke-test.mjs` runs the browser copy against this one on pinned cases. */
export const ISSUER_FORM_WORDS =
  /\b(?:trustee|trust|fiduciary|bank|banking|n\.?\s*a\.?|national association|custodian|custody|llc|l\.l\.c\.|inc|incorporated|corp|corporation|company|companies|co|l\.?p\.?|plc|ltd|limited)\b\.?/gi;
/* Words that cannot name a fund house, so gate (2) is not asked of them. READ
 * off the first tokens the gate refuses; firm-capable words are absent on
 * purpose and that omission costs rows rather than correctness. */
export const NAME_LEAD_DESIGNATION =
  /^(?:\d+|[a-z]|[a-z]\d|r-?\d|f-?\d|k\d?|the|an?|class|cls?|series)$/i;
export const NAME_LEAD_NEVER_A_FIRM =
  new RegExp(NAME_LEAD_DESIGNATION.source.replace(/\)\$$/, "")
    + "|institutional|institutionl|instl|inst|admiral|adm|advisors?|adv|retail"
    + "|funds?|fds?|shares?|shs|shrs|units?|registered|target(?:ed)?|trgt"
    + "|retirement|retire)$", "i");

export function issuerPricedER(priceOf, cleanedName, issuer) {
  const name = String(cleanedName || "").replace(/\s+/g, " ").trim();
  /* (0) the firm, without its corporate form */
  const iss = String(issuer || "").replace(/\*+/g, " ")
    .replace(ISSUER_FORM_WORDS, " ").replace(/[^A-Za-z0-9&.\- ]+/g, " ")
    .replace(/\s+/g, " ").trim();
  if (!name || !iss) return null;
  const er = priceOf(iss + " " + name);
  if (er == null) return null;
  /* (1) the issuer must not supply the answer by itself */
  if (er === priceOf(iss)) return null;
  /* (2) past a leading share-class designation, the fund's own first word must
   * be load-bearing — unless that word is one that cannot name a firm */
  const parts = name.split(" ");
  if (parts.length < 2) return er;
  const word = (p) => String(p || "").replace(/[^A-Za-z0-9&.-]/g, "");
  let j = 0;
  while (j < parts.length && NAME_LEAD_DESIGNATION.test(word(parts[j]))) j++;
  if (j >= parts.length) return er;               // the name is designation only
  const w = word(parts[j]);
  if (!w || NAME_LEAD_NEVER_A_FIRM.test(w)) return er;
  const less = parts.slice(0, j).concat(parts.slice(j + 1)).join(" ").trim();
  if (less && priceOf(iss + " " + less) === er) return null;
  return er;
}

/* ---------------------------------------------------------------------------
 * THE TRUST'S OWN SCHEDULE D IS A FILED FUND LIST, AND IT WAS CAPTURED IN
 * SEPTEMBER AND RENDERED NOWHERE (2026-10-02). Run #523 made `scanSchD` ingest
 * MTIA acks so a master trust's Schedule D collective-trust interests are
 * stored on the trust record as `cct` = [{n, v}]. 379 of 508 trusts carry one:
 * 4,334 rows, $936.6B. It has had ZERO consumers outside the line that writes
 * it, and `cct` is 231,260 of the 406,247 bytes of `mtias.json` -- a file every
 * visitor already downloads at boot -- so MORE THAN HALF of that download has
 * been an unused fund list. The cost was already paid; only the render was
 * missing. The owner sent his own filing twice asking whether it had been acted
 * on, and CLAUDE.md's #523 entry said "the owner's own filing is served" four
 * lines above its own "nothing is published".
 *
 * WHO GAINS: 61 plans / 874,136 participants / $105.6B across 29 trusts --
 * plans that publish NO menu of their own, whose trust publishes none either,
 * and whose trust's Schedule D names at least three funds.
 *
 * THREE CONDITIONS, EACH PRICED:
 *
 * (1) A FLOOR OF THREE. Northrop Grumman's trust lists ONE fund at $11.4B -- a
 *     trust holding a single collective trust, which is not a menu. Measured:
 *     28 further plans / 235,635 ppl sit behind a trust listing 1-2 funds and
 *     are deliberately left with the sentence they have.
 *
 * (2) A WOUND-DOWN PLAN IS EXCLUDED. 4 plans / 14,514 ppl report $0 year-end
 *     assets, and this record's own rule is that a fund list for a plan nobody
 *     is in anymore is fabrication risk for no user value -- the money has
 *     already left, and the wind-down sentence is the better answer.
 *
 * (3) IT NEVER OVERRIDES A MENU. Asked only where the plan has no rows of its
 *     own; measured at 0 of the 61 having a notes-derived option list either,
 *     so there is no contest with the more plan-specific sentence.
 *
 * AND THE SHARE IS WHAT MAKES IT HONEST, which is the design finding rather
 * than a caveat. Schedule D reports interests in COLLECTIVE TRUSTS and nothing
 * else, so a trust also holding mutual funds, separate accounts or employer
 * stock directly lists none of that. Across the 29 trusts the list accounts for
 * 39.6% to 100.0% of the trust's own assets, median about 85% -- PSEG's is
 * $2,006,425,398 of $4,417,985,729, so MORE THAN HALF ITS TRUST IS OUTSIDE THE
 * LIST. Publishing this as "the funds" would be a false claim about every one
 * of the 29. The caller must render `share` and must never present these as the
 * plan's own per-fund balances: they are the TRUST's totals, shared with every
 * sister plan.
 *
 * The contract is DATA, not a plan object, deliberately: `app.js` carries
 * `plan.zeroEOY` where `build-seo-pages.mjs` reads `assetsEOY`, and a function
 * reaching for a field name that differs between its two callers is the
 * recorded way a measurement reports on itself. The caller states the facts. */
export const TRUST_MENU_MIN_FUNDS = 3;
export function trustScheduleDMenu(trust, hasOwnMenu, zeroEOY) {
  if (hasOwnMenu || zeroEOY) return null;
  const cct = trust && Array.isArray(trust.cct) ? trust.cct : [];
  if (cct.length < TRUST_MENU_MIN_FUNDS) return null;
  const rows = [];
  for (const x of cct) {
    const name = String((x && x.n) || "").replace(/\s+/g, " ").trim();
    const value = Number((x && x.v) || 0);
    if (name) rows.push({ name, value: value > 0 ? value : 0 });
  }
  if (rows.length < TRUST_MENU_MIN_FUNDS) return null;
  rows.sort((a, b) => b.value - a.value || a.name.localeCompare(b.name));
  const total = rows.reduce((a, x) => a + x.value, 0);
  const assets = Number((trust && trust.assetsEOY) || 0);
  /* a share over 1 is rounding in the filing (one trust reports the list $2
   * above its own total), not a reason to withhold the list; clamp the CLAIM
   * at 100% rather than print an impossible number */
  const share = assets > 0 && total > 0 ? Math.min(1, total / assets) : null;
  return { rows, total, trustAssets: assets > 0 ? assets : 0, share };
}
