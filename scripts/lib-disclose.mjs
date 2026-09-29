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
  s = s.replace(/^[—–-]+\s*/, "");
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
  s = s.replace(/\s*\(\s*\d{1,2}\s*\)\s*$/, "").trim();
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
  const pm = s.match(TYPE_PREFIX);
  if (pm) { const rest = s.slice(pm[0].length).trim(); if (rest.split(/\s+/).length >= 2 && /[A-Za-z]{3}/.test(rest)) s = rest; }
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
  s = s.replace(/[,;:]+$/, "").trim();
  // a share COUNT is thousands or more (1,234 / 12345…); "Class R6 Shares"
  // is a share CLASS and must survive — the first draft of this cut it to
  // "Class R", measured as 26 lost tickers before it shipped
  s = s.replace(/(?:^|[\s,(-])[\s,(-]*(?:\d{1,3}(?:,\d{3})+|\d{4,})\s+shares?\)?\s*$/i, "").trim();
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
 * Mtges-Resid.` are all refused, and all four are pinned controls. */
export const LOAN_ROW = /^(?:participant[- ]?)?loans?(?:\s*(?:fund|receivable|to participants?|account))?\b[\s.,;:()%\d-]*$|^(?:notes? receivable from |loans? to )participants?\b|^participant notes?\b/i;
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
 * names rather than counting them. Both rows are pinned controls. */
const LOAN_DESC_RANGE = /\brates?\b[^.;]{0,40}?\b(?:rang(?:e|es|ing)|between|vary|varying|from)\b|\b\d+(?:\.\d+)?\s*%?\s*(?:to|[-–—])\s*\d+(?:\.\d+)?\s*%|\bfrom\s+\d+(?:\.\d+)?\s*%\s*(?:to|[-–—])/i;
const LOAN_DESC_WORDS = /\b(?:participants?|participation|loans?|notes?|promissory|receivable|outstanding|balances?|interest|rates?|ranging|range|ranges|rang|between|varying|various|vary|varies|bearing|earning|carrying|accruing|maturing|maturity|maturities|due|payable|dated?|dates|through|until|to|from|at|with|of|and|or|the|a|an|per|annum|annually|percent|pct|secured|collateralized|collateral|by|vested|terms?|years?|months?|less|more|than|generally|stated|fixed|variable|cost|no|later|amounts?|extending|into|repayment|plan|in|on|all|up)\b/gi;
const LOAN_DESC_MONTHS = /\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\b/gi;

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
    .filter((t) => t.length >= 2);
}
export function isLoanDescriptionRow(name) {
  const s = String(name || "").trim();
  if (!s || !/\d/.test(s) || !LOAN_DESC_RANGE.test(s)) return false;
  return loanDescriptionResidue(s).length === 0;
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
export function isNamelessFundRow(f, cleanedName, isGenericName) {
  const type = String((f && f.type) || "");
  const name = String(cleanedName || (f && f.name) || "");
  if (/^subtotal \(not a holding\)$/i.test(type)) return false;
  if (/brokerage window/i.test(type)) return false;
  if (/company stock|employer (security|stock)/i.test(type + " " + name)) return false;
  return !!isGenericName(name);
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
 * from a real fund's name if one ever arrived. `sa?gic` covers SAGIC because
 * fund-er's own pattern is `/gic\b/` with no leading boundary, so it prices
 * `SAGIC Group Annuity Contract 21016` on a substring accident.
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
export const GUARANTEE_PRICED_WORDS =
  /\bstable value\b|\bmanaged income\b|\bguarantee(?:d|s)?\b|\bsa?gic\b/gi;
export function annuityFeeIsGuaranteeOnly(cleanedName, priceOf) {
  const s = String(cleanedName || "");
  if (!ANNUITY_CONTRACT_NAME.test(s)) return false;
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
 * and the pricer disagree about an abbreviation. Widening the shared
 * `GUARANTEE_PRICED_WORDS` to chase it would change the annuity rule's measured
 * 144/0 split for one row, which is a worse trade than the row.
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
