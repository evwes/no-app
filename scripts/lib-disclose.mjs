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
const TYPE_SUFFIX = /\s+(?:mutual funds?(?: shares?)?|common\/?collective trusts?(?: funds?)?|collective (?:investment )?trusts?|registered investment compan(?:y|ies)(?: shares?)?|pooled separate accounts?|units? of participation)\s*$/i;
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
function despaceKerned(name) {
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
  const qlead = s.replace(/^[”“"]+\s*/, "").trim();
  // …unless a CLOSING quote follows with more name after it — that is a
  // balanced quoted term the filer meant ("\"Brokerage\" Account"), the same
  // shape as the FMC control, and it is left exactly as filed.
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
  if (m) { const rest = s.slice(0, m.index).trim(); if (rest.split(/\s+/).length >= 2 && /[A-Za-z]{3}/.test(rest)) s = rest; }
  s = s.replace(/[\s\-–,;:]+$/, "").trim();
  return /[A-Za-z]{3}/.test(s) ? s : String(name).trim();
}
