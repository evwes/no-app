/* wampo — parser for "Schedule H, line 4i — Schedule of Assets" sections
 * extracted from Form 5500 filing PDFs (pdftotext -layout output).
 * Shared by fetch-4i.mjs (production) and local test harnesses. */

import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

// Bump to invalidate previously parsed lineups.json entries and force a reparse.
export const PARSER_VERSION = 161;
/* v138: the displayed row cap, and what it cuts. parseRows kept the largest
 * 80 rows and totalValue kept every row, so confidence judged the whole
 * schedule while the page showed a prefix of it — with no trace that
 * anything was missing. Measured on the v137 store: 386 published lineups
 * sit exactly at 80 rows; 12 plans / 481,363 participants / $27.6B have
 * >=15% of the plan in rows the site never showed (Boeing 217,061 ppl: 21%
 * = $15.5B; Goldman Sachs 61% = $7.75B; Marriott 17%; NXP 39%), and the
 * page's own coverage sentence told those readers the schedule "does not
 * itemise" the rest — it does. The cap stays (trustee statements run to
 * thousands of per-security rows) but is wider, and the cut is RECORDED:
 * `cut: {n, v}` = rows dropped and their value, so the page can say so. */
export const ROW_CAP = 120;
function cutTail(rows) {
  if (!rows || rows.length <= ROW_CAP) return null;
  let v = 0;
  for (let i = ROW_CAP; i < rows.length; i++) v += rows[i].value || 0;
  return { n: rows.length - ROW_CAP, v };
}

// form/statement vocabulary that must never appear as a fund NAME in a
// confident lineup. Shared by the audit (flags HIGH) and the merge (demotes
// stored entries whose PDFs can no longer be re-fetched — S3-withdrawn
// filings otherwise keep junk parses from old parser versions forever).
export const JUNK_NAME_RE = /subtract li[nm]e|add lines? \d|net income \(loss\)|\(e\.?g\.?[,.]|total (additions|deductions)\b|\(specify\)|type of contract|disbursed from|to pay benefits\b|[sce]{8,}|employe{1,2}r? identification|identification number|name of plan sponsor|^plan name\b|^\W*ranging from\b|schedule\s+h\b|\bform\s+\$?5?500\b/i;

const TYPE_PATTERNS = [
  [/self[- ]directed brokerage|brokerage ?link|brokeragelink|\bSDBA\b|self[- ]directed\b|^brokerage accounts?$/i, "SDBA"],
  [/publicly[- ]traded stock/i, "Stock"],
  // named trusts intervene: "Interest in Eaton Savings Trust Master Trust"
  [/interest in .{0,40}\bmaster trust\b/i, "Master trust interest"],
  [/collective trust|common\/collective|common collective|collective investment trust|commingled/i, "Collective trust"],
  [/mutual fund|registered investment/i, "Mutual fund"],
  /* v147: "Exchange Traded Fund" was not a type phrase. Ouraring and five
   * more small plans on one template file "b | Vanguard Total Stock Market
   * ETF | Exchange Traded Fund | 3,715,032"; once v146 stripped the footnote
   * letter the phrase became the DESCRIPTION, read as a fund name, won every
   * row, and 28 ETFs merged into one statement row — six confident menus
   * lost in run #381. */
  [/exchange[- ]traded funds?/i, "Exchange-traded fund"],
  [/pooled separate/i, "Pooled separate account"],
  [/common stock|company stock|employer securit/i, "Company stock"],
  [/interest[- ]bearing cash|short[- ]term investment|money market/i, "Cash / short-term"],
  [/participant loans?|loans to participants|participant notes/i, "Participant loans"],
  [/government securit|u\.?s\.? treasur/i, "Government securities"],
  [/corporate debt|corporate bond/i, "Corporate debt"],
  [/guaranteed investment|synthetic|wrapper/i, "Stable value / GIC"],
  [/separately managed|separate account/i, "Separate account"],
];

export function classify(text) {
  for (const [re, label] of TYPE_PATTERNS) if (re.test(text)) return label;
  return "";
}

// "plan name|plan sponsor's name": recordkeeper attachments repeat a
// "Plan Name X ... EIN: .." heading on EVERY page; valueless, it glued
// onto each page's first fund via nameBuf, and dropping the assembled row
// (v49) lost one REAL fund per page — 754 small-plan menus fell out of
// confidence. Skipping the heading LINE keeps the funds clean instead.
/* v139: a VALUELESS line built entirely from the 4i column caption's words —
 * "(a) (b) Identity of issue, borrower, lessor, or similar party (c)
 * Description of investment including maturity date, rate of interest,
 * collateral, par, or maturity value (d) Cost (e) Current value" — however
 * it wrapped and wherever it starts. Anchored both ends: a holding named
 * "Value Fund" is not all caption words. */
const HEADER_FRAG_LINE = /^(?:\(?[a-e]\)|description|of investment|investment|identity|of issue|issuer?|borrower|lessor|or|similar|party|including|maturity|date|rate|of|interest|collateral|par|value|cost|current|fair|shares|units|number|no\.|security|name|and|in|dollars|[\s,()$*:\-–—/])+$/i;
/* v142: the same caption, KERNED. Hill Brothers' filing prints the caption as
 * "De scription   Curre nt" / "of Inve stm e nt   Cost   Value"; neither line
 * is all caption WORDS, so v139's whole-line rule let them into the name
 * buffer and the first holding published as "De scription Curre nt of Inve
 * stm e nt Cost Value JOHN HANCOCK …" at 17% of the plan — the v141 verdict's
 * one new junk row. When a valueless line is fragmented (two or more 1-2
 * letter tokens in a row), compare it with every space removed. */
const HEADER_FRAG_DESPACED = /^(?:[a-e]|description|ofinvestment|investment|identity|ofissue|issuer?|borrower|lessor|or|similar|party|including|maturity|date|rate|of|interest|collateral|par|value|cost|current|fair|shares|units|number|no)+$/;
const KERNED = /(?:\b[A-Za-z]{1,2} ){2,}/;
const SKIP_ROW = new RegExp("^(total|subtotal|grand total|schedule|page \\d|form 5500|ein[: ]|employer id|employer i\\.?d\\.?\\s*#|(?:plan )?sponsor id\\b|employer no\\.?\\b|plan ?id\\b|plan ?#|plan no\\.?\\b|sponsor name|name of plan sponsor|plan name\\b|plan sponsor'?s name\\b|plan number|as of|see accompanying|\\(thousands|identity of issue|description of investment|rate of|maturity|cost\\b|current value|sales\\b|purchases\\b|dividends\\b|assets in.transit|investments? at fair value|dividend income|other income|administrative fees|" +
  // the 4i column heading wraps across up to four lines; only its first line
  // ("(c) Description of investment") was covered, so the continuation
  // "including maturity date, rate of" had no value, survived as a name
  // fragment, and glued onto the FIRST holding row (R.H. White shipped
  // "including maturity date, rate of American Funds Europacific GR R6")
  "including maturity date|interest, collateral|collateral, par)|" +
  /* FOOTNOTE REFERENCES, not holdings. L3Harris's master trust carries the
   * line "NOTE: TRANSACTIONS ARE BASED ON THE 2023-12-31 VALUE …" alongside a
   * figure, and it parsed as a $14.19 BILLION holding — which pushed the
   * trust's sum to $29.98B against $16.23B of real assets, ratio 1.848, so
   * the whole 80-fund menu was rejected as not confident. Two plans holding
   * $16.4B showed no lineup because of one footnote.
   *
   * The vocabulary has to be narrow, because "Note" is also a SECURITY type:
   * "Note 0.500% due 01/15/2028" is a real debt holding and there are stored
   * rows of exactly that shape. So this matches only a colon straight after
   * the word ("NOTE:"), or a numbered note followed by PROSE ("Note 9:
   * Related Party…", "Note 7. Exempt Party-in-Interest…"). A rate-and-due
   * date never matches either arm. */
  "notes?\\s*:|notes?\\s+\\d{1,2}\\s*[:.]\\s*[a-z]|" +
  // financial-statement lines that are not 4i holdings
  // "investments?,? at (fair|contract) value" must tolerate the comma/dash
  // spellings — 631 confident lineups carried "Investments, at fair value"
  // statement rows (up to 97% of the shown sum) because only the bare
  // space-separated form was covered
  "(net assets|benefits paid|investment (income|gain|loss)|(participation|interest) in (the )?net (income|loss)|net income \\(?loss\\)?|net income (of|from)\\b|interest and dividends|realized|unrealized|appreciat|depreciat|(?:^|net )transfers?\\b|transfers? (?:in|out|to|from|of|between)\\b|contributions?\\b|deemed distribut|administrative expense|beginning of year|end of year|financial statements|indirect compensation|reconcil|adjustment|level [123]\\b|liabilit|receivable|payable|expenses\\b|distribution|net (increase|decrease|change)|due (to|from)|notes? (to|receivable)|similar party|description of investment|current value|investments?,?\\s*[—–-]?\\s*at (fair|contract) value)|" +
  // form-page boilerplate: a filing with NO 4i attachment can still seed a
  // region from the Schedule H checkbox line, and the parser then reads phone
  // numbers and zip codes off address/signature pages as \"values\" (Aramark)
  // v114: the same family as the FEIN and street-address rows fixed in v76 —
  // a nine-digit identifier printed in a schedule's own page header parses as
  // a holding worth nine hundred million. Lucas Horsfall's attachment heads
  // every page "Tax Number: 954659692" and the region came to 68x plan assets.
  "(mailing address|include room|city or town|telephone|preparer|acknowledg|benefit payments?\\b|tax (?:number|id(?:entification)?(?: number)?)\\s*:|,\\s*[A-Za-z]{2}\\s+\\d{5}(-\\d{4})?\\s*$)", "i");

// "December 31, 2024" style heading lines — the year parses as a value otherwise
const DATE_LINE = /(january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{1,2},?(\s+(19|20)\d\d)?(\s+and)?\s*$/i;

/* ---------------------------------------------------------------------------
 * TRACE — why this is in the library and not in a throwaway script.
 *
 * The standing rule is to instrument before believing a cause, and it has
 * earned itself repeatedly: on 2026-09-02/03 the cause reasoned from the
 * layout was wrong four times running, and the cause printed from this loop's
 * actual state was right every time. But each of those investigations was done
 * by copying lib-4i.mjs to /tmp, injecting a console.log, and importing the
 * copy — four hand-patches in two days, each one a chance to instrument a
 * DIFFERENT file from the one production runs.
 *
 * So the hooks live here, off by default and costing one boolean test:
 *
 *   WAMPO_TRACE=rows    name resolution per row: nameBuf, the two columns,
 *                       the joined identity, the cleaned description, which
 *                       side won and why
 *   WAMPO_TRACE=cands   every region candidate with its score and penalties
 *   WAMPO_TRACE=all     both
 *   WAMPO_TRACE_MATCH=  only emit rows whose value or name contains this
 *                       (a bare number matches the value exactly)
 *
 * Example — the v103 diagnosis, which took a hand-patch, is now:
 *   WAMPO_TRACE=rows WAMPO_TRACE_MATCH=2585344 node scripts/trace-filing.mjs <ack>
 */
/* The two shapes a PUBLISHED holding must never have, exported so that the
 * parser, the run-time audit and the standalone audits all count the same
 * thing. They did not: three copies of this vocabulary drifted apart and the
 * same store reported 45 fabricated lineups by one definition and 206 by
 * another, which is a measurement of the query rather than the data. One
 * definition, three consumers.
 *
 *   GENERIC_TYPE_NAME  a name that is ONLY an investment type. Never a fund;
 *                      when several rows share one, they have merged.
 *   NOT_FUND_SHAPED    a statement line item or aggregate. Legitimate for a
 *                      filing to report, never legitimate as a plan's whole
 *                      published lineup.
 */
export const GENERIC_TYPE_NAME = /^(?:total )?(?:registered investment compan(?:y|ies)|(?:common[\/ ]?)?collective (?:investment )?trust(?: fund| portfolio)?|collective trust fund|mutual funds?|common (?:and preferred )?stocks?|corporate stocks?|pooled separate accounts?|separate accounts?|guaranteed (?:investment|interest) contracts?|group annuity contracts?)$/i;
/* v137: the same vocabulary with its nouns in the PLURAL. `Collective
 * investment trusts`, `Common/collective trust funds`, `Common collective
 * trusts` are type labels exactly as their singulars are — but they walked
 * past every consumer of GENERIC_TYPE_NAME, and ATH Holding / Elevance
 * (94,427 participants, $12.11B) published `Collective investment trusts`
 * at 91.7% of a six-row lineup: the v105 shape, live, with the guard built
 * for it silent. Found by the 2026-09-18 participant-weighted draw.
 *
 * Used by the dominant-row guard below and by the audits — NOT by the v133
 * category-total removal or the v107/v132 menu swaps. Widening those was
 * tried first and measured: it made 3M's fair-value note (ratio 2.33, 19
 * rows of `Corporate obligations`, `Interest rate swaps`, `Credit default
 * swaps`) CONFIDENT at 0.59 by deleting its $18.4B `Common/collective
 * trusts` row, and moved Lam Research's sum by $453M. Removing a subtotal
 * only makes the remainder publishable when the remainder is a menu, and
 * for the plural forms it usually is not. Under this guard a plural label
 * at >=90% is refused (stmt), and nothing is ever deleted.
 */
export const GENERIC_TYPE_ANY = new RegExp(GENERIC_TYPE_NAME.source.replace("trust(?: fund| portfolio)?|collective trust fund|", "trusts?(?: funds?| portfolios?)?|collective trust funds?|"), "i");
/* DOCUMENT SHAPE (v113) — why a filing yields no schedule, judged from the
 * document rather than from our parse. `dx` already says what the PARSER did;
 * this says what the FILING contains, and they are different claims. A random
 * 30-filing sample of the live `nohead` bucket (2026-09-09) measured 77% with
 * no attachment published at all, 13% an attachment carrying no schedule, 3%
 * a schedule explicitly omitted — 93% permanently not ours — against ~7% real
 * parser gaps. The site currently hedges all of them as "scanned/absent, or
 * a trust that doesn't itemize"; with this recorded at parse time the common
 * case can state the truth plainly.
 *
 * The ladder is MOVED verbatim from scripts/gap-verify.mjs, which now imports
 * it: two copies of a classifier drift, and this project has already paid for
 * a duplicated vocabulary twice (v110's split test, the merge triage). */
export function classifyDocument(text) {
  const HEADER = /identity of issue|description of investment/i;
  const TITLE = /schedule of assets|schedule h.{0,40}line\s*4i|sch\.? h.{0,10}4i/i;
  const pageList = String(text || "").split("\f");
  const pages = pageList.length;
  const perPage = Math.round(String(text || "").length / Math.max(pages, 1));
  const headers = (String(text || "").match(new RegExp(HEADER, "gi")) || []).length;
  const titles = (String(text || "").match(new RegExp(TITLE, "gi")) || []).length;
  const isFormPage = (p) => /form 5500|schedule [a-z] \(form 5500\)|omb no\.? 1210/i.test(p.slice(0, 400));
  const hasAudit = /report of independent|independent (?:certified public )?(?:accountants?|auditors?)/i.test(text || "");
  const omitted = /schedules?[^.]{0,200}?omitted[^.]{0,120}?(?:not applicable|no such|none)/is.test(text || "") ||
    /omitted because they are not applicable/i.test(text || "");
  const MONEY_ROW = /[A-Za-z]{4,}.{0,90}[\d,]{4,}(?:\.\d{2})?\s*$/;
  const FUNDISH = /\b(?:fund|trust|portfolio|index|target|instl?|admiral|shares|cl(?:ass)? [a-z0-9]|r[1-6]\b|equity|growth fund|value fund|bond fund|retirement 20\d\d)\b/i;
  let tableLikePages = 0;
  for (const p of pageList) {
    if (isFormPage(p)) continue;
    const rows = p.split("\n").map((l) => l.trim()).filter((l) => MONEY_ROW.test(l));
    if (rows.length < 12) continue;
    if (rows.filter((l) => FUNDISH.test(l)).length >= 6) tableLikePages++;
  }
  /* Short codes, because this is stored per non-confident ack:
   *   readfail  the table IS there under the statutory header — OUR gap
   *   unread    table-shaped pages under a heading we don't know — our gap
   *   absent    the schedule is referenced but its pages are not published
   *   omitted   the filing states the schedule is omitted as not applicable
   *   noattach  no audited attachment at all; form pages only
   *   notable   an audit attachment that simply carries no schedule
   *   scanned   too little extractable text — image-only */
  const code = headers > 0 ? "readfail"
    : titles > 0 ? "absent"
    : tableLikePages > 0 ? "unread"
    : omitted ? "omitted"
    : hasAudit ? "notable"
    : perPage < 800 ? "scanned"
    : "noattach";
  return { code, pages, perPage, headers, titles, hasAudit, omitted, tableLikePages };
}

/* A UNITS DECLARATION, wherever it appears. The parser already reads these as
 * scaling markers; this is the same vocabulary asked as "is this a fund NAME?",
 * exported so an audit can count the answer rather than re-inventing the list.
 * Deliberately anchored whole-string: "Thousand Oaks Fund" must survive. */
export const UNITS_MARKER_NAME = /^\(?\s*(?:\$\s*)?(?:amounts?|dollars?|figures?|values?)?\s*(?:are\s+)?(?:expressed\s+)?(?:in\s+|stated\s+in\s+)?(?:\(?\s*000'?s?\s*\)?|thousands?|millions?|billions?)(?:\s+of\s+dollars)?(?:\s+omitted)?\s*\)?\s*[.:]?$/i;
export const NOT_FUND_SHAPED = /^(?:at (?:fair|contract) value|investments?(?:,? at .*)?|total\b.*|various\b.*|master trust.*|investments? held in the trust.*|participants?[- ]directed.*|fully benefit[- ]responsive.*|cusip:?.*|net assets.*|assets\b.*|cash(?: and cash equivalents)?|other\b.*|[a-z]\s+total\b.*|see (?:note|attach).*|interest[- ]bearing cash|value of interest in .*)$/i;
/* UNAMBIGUOUS accounting-disclosure phrasing, for tests that ask "are these
 * rows JOINTLY an aggregate?" — deliberately narrower than NOT_FUND_SHAPED,
 * whose `total\b.*` arm is safe only for a single 90%-dominant row: reused
 * whole for a joint test it read "Total Stock Market Index" menus as
 * aggregates (v110's regression, and nearly the merge triage's on the same
 * day). Vocabularies are per-question; this one is exported so every
 * joint-aggregate question uses the same list. */
export const AGG_DISCLOSURE = /^(?:participants?[- ]directed.*|fully benefit[- ]responsive.*|investments?(?:,? at .*)?|at (?:fair|contract) value|net assets.*|value of interest in .*|master trust.*|investments? held in the trust.*)$/i;

/* A ROW THAT POINTS AT A MASTER TRUST rather than naming a holding. One copy,
 * used by the `trustPtr` flag on a finished parse AND (v135) by the last-resort
 * promotion of a one-row trust-pointer region — the two questions are the same
 * question and were one regex apart from being two vocabularies. */
export function isTrustPointerRow(f) {
  const n = String((f && f.name) || "");
  return (f && f.type === "Master trust interest") ||
    /^(?:the )?(?:plan(?:['’]s)? )?(?:value of )?interest in .{0,50}\btrust\b/i.test(n) ||
    /^master trust\b/i.test(n) ||
    // "Participation in … Defined Contribution Plans Master Trust"
    // (Northrop) — the name can END with the trust rather than start with
    // "interest in"
    /^participation in\b[^.]{0,60}?\bmaster trust\b/i.test(n) ||
    /\bmaster trust\s*$/i.test(n);
}

/* The production confidence SHAPE, in one place inside this library. fetch-4i's
 * isConfident is the gate production runs; this mirrors it for the parser's own
 * internal choices (the band-hi retry accept, and v135's trust-pointer
 * promotion), which previously carried the expression inline twice. */
function publishableShape(r) {
  const ratio = (r && r.ratio) || 0;
  return !!(r && r.found && Array.isArray(r.funds) && r.funds.length >= 3 &&
    ratio > 0.45 && ratio < 1.6 &&
    (r.funds.length >= 5 || (ratio > 0.7 && ratio < 1.3)) &&
    !r.stmt && !r.trustPtr);
}

const TRACE = process.env.WAMPO_TRACE || "";
const TRACE_ROWS = TRACE === "rows" || TRACE === "all";
const TRACE_CANDS = TRACE === "cands" || TRACE === "all";
const TRACE_MATCH = process.env.WAMPO_TRACE_MATCH || "";
const traceHit = (value, ...names) => {
  if (!TRACE_MATCH) return true;
  if (String(value) === TRACE_MATCH) return true;
  const n = TRACE_MATCH.toLowerCase();
  return names.some((s) => String(s || "").toLowerCase().includes(n));
};

/* Strip trailing column values (cost, shares, rates) from a row body without
 * eating year-like name tails such as "RETIREMENT 2045". */
function stripTrailingColumns(body) {
  // trim token-by-token from the end WITHOUT re-joining — internal column
  // gaps (3+ spaces) must survive for splitNameDesc
  let b = body;
  // v146: `N/R` / `N/A` is how a participant-directed filing writes the empty
  // cost column ("JP Morgan Mid Cap Growth Fund   N/R   22,050,627"); it is a
  // column cell, not the end of a name \u2014 238 plans / 486k ppl published it
  const tail = /\s+(?:[*$\u2013\u2014-]+|N\/[RA]|\$?\d{1,3}(?:,\d{3})+(?:\.\d+)?%?|\d+\.\d+%?|\d+%)\s*$/i;  // \u2013/\u2014: the empty cost column renders as an en/em dash and glued onto names (BWXT, report #18)
  for (let m = b.match(tail); m; m = b.match(tail)) b = b.slice(0, b.length - m[0].length);
  return b.trim();
}

/* Split a row into the identity-of-issuer column and the description column.
 * -layout preserves column gaps (3+ spaces); when the columns run together,
 * fall back on a mixed-case issuer followed by an ALL-CAPS description. */
function splitNameDesc(body) {
  const segs = body.split(/\s{3,}/).filter(Boolean);
  if (segs.length >= 2) return { nameCol: segs[0], descCol: segs.slice(1).join(" ") };
  const m = body.match(/^(.*?[a-z][^A-Z]*?)\s+([A-Z][A-Z0-9 &.,/'()%-]{10,})$/);
  if (m && /[A-Z]\s+[A-Z]/.test(m[2])) return { nameCol: m[1].trim(), descCol: m[2].trim() };
  return { nameCol: body, descCol: "" };
}

/* Remove share counts, rates, and cost markers from a description column so
 * only the investment's name remains. */
function cleanDesc(desc) {
  let d = desc.replace(/[*^†‡]+/g, " ");
  d = d.replace(/\b[\d,]+(\.\d+)?\s*(shares?|units?|interests?)\b/gi, " ");
  /* v156: the preposition the share count carried — "7,699,900.87 shares of
   * Vanguard Institutional 500 Index Trust" left "of Vanguard …" as the name
   * on every row of Progressive (74,118 ppl), Norfolk Southern, Brink's,
   * Owens & Minor: 628 rows / 108 plans / 317k ppl, 21 whole lineups. */
  d = d.replace(/^\s*(?:of|in)\s+(?=\S)/i, " ");
  d = d.replace(/\b(interest )?rates? (of|from|ranging).*$/i, " ");
  d = d.replace(/\bmaturit(y|ies).*$/i, " ");
  /* v68: FILLER columns. Many filings print the (c) sub-columns literally —
   * "FIDELITY 500 INDEX   N/A   VARIABLE   N/A   1,056,601 sh   #   215,747,363"
   * (Old Republic, $1.4B) — where the rate/maturity/collateral cells hold
   * "N/A" and "VARIABLE" rather than a description. Left in, the residue was
   * word-shaped and letter-rich enough to be preferred over the real name in
   * column (b), so all 28 of that plan's holdings were stored as "VARIABLE
   * 1,056,601 sh". Stripping the filler empties the description, and the
   * name column wins as it should. Same class as SMART Local 265. */
  /* "variable" is filler in the "N/A  VARIABLE  N/A" rate cell, and a real
   * word in "Variable Annuity Contract" — the product a small plan's whole
   * balance sits in. v68 stripped it everywhere and took nine such plans'
   * only holding row with it (found by reading v68's re-parse losses, which
   * is exactly what that review is for). Strip it only when it is NOT naming
   * a product. Same care for "fixed" (Fixed Annuity, Fixed Income). */
  d = d.replace(/\b(?:variable|fixed)\b(?!\s+(?:annuity|life|income|universal|account|fund|contract))/gi, " ");
  d = d.replace(/\b(?:n\s*\/\s*a|n\.?a\.?|not applicable|none)\b/gi, " ");
  /* v103: the COST column's standing answer. Column (d) is Cost, and plans
   * whose investments are participant-directed are permitted to leave it out;
   * most write a dash, but many type the reason instead — "Participant
   * Directed", "Participant-directed", "Cost not required". That phrase then
   * sits where a description belongs, and it is letter-rich and two words, so
   * it is preferred over the real fund name in column (c). Physician's
   * Computer Company files fifteen Vanguard funds this way and every row was
   * named "Participant Directed"; identical names then merge, so the whole
   * menu became one holding. It is never a description of an investment, so
   * strip it and let the name column win, exactly as with the N/A filler
   * above. Anchored to the whole remaining cell so a real product containing
   * the word (there is none in the corpus, but the guard is free) survives. */
  d = d.replace(/^\s*(?:participants?[\s-]*directed(?:\s+investments?)?|cost\s+not\s+required|not\s+required)\s*$/gi, " ");
  d = d.replace(/(^|\s)#(\s|$)/g, " ");
  return d.replace(/[\s,;:-]+$/g, "").replace(/\s{2,}/g, " ").trim();
}

/* True when a description column only states the investment TYPE ("Registered
 * Investment Company", "Common/Collective Trust") rather than naming a fund. */
/* Whole-phrase categories. Word-stripping cannot reach these: "Target Date
 * Retirement" leaves "Retirement", and adding that word to the strip list
 * would make "Retirement 2040 Fund I" — a real Great Gray vintage — read as
 * type-only and hand the row back to the issuer column. An anchored phrase
 * list cannot do that, because a real fund name carries something more.
 * "inves\w{0,2}ment" absorbs the OCR spelling "invesment". */
/* Does this identity column name a FIRM rather than a product? Used to decide
 * whether a generic category description ("Registered investment company") is
 * more informative than the identity beside it. The houses listed are the ones
 * v70 measured as actually causing the bare-manager defect — Vanguard 1,928
 * rows, Fidelity 1,827, American Funds 1,342 — plus institution suffixes, so a
 * firm keeps yielding to the category while a short fund name ("Explorer",
 * "Wellington", "Windsor II") keeps its own name. Anchored whole-string: a
 * fund whose name merely CONTAINS a house ("Vanguard Wellington Fund") is a
 * product and must not match. */
/* v161: TIAA-CREF was absent from the house list entirely — one of the two
 * largest 403(b) providers in the country, and `isHouseName('TIAA-CREF Funds')`
 * answered false, so every rule keyed on "the identity is only a firm" skipped
 * its filings. Found because the house-identity guard below then left Mass
 * General Brigham's merge unfixed. */
const HOUSE_ONLY = /^(?:the\s+)?(?:tiaa(?:[-\s]?cref)?|cref|vanguard|fidelity(?:\s+investments)?|american funds?|t\.?\s*rowe\s*price|blackrock|state street(?:\s+global(?:\s+advisors)?)?|schwab|charles schwab|jp\s?morgan|j\.?p\.?\s*morgan|goldman sachs|pimco|invesco|franklin(?:\s+templeton)?|templeton|dodge\s*&\s*cox|nuveen|janus(?:\s+henderson)?|wellington management|northern trust|principal|prudential|metlife|voya|empower|transamerica|john hancock|nationwide|lincoln|great gray|great-west|columbia|putnam|dimensional(?:\s+fund\s+advisors)?|dfa|allspring|abrdn|aberdeen|mfs|neuberger berman|pgim|tiaa|cref|galliard|reliance trust|matrix trust|alight|ascensus|milliman)\s*(?:funds?|trusts?|group|inc\.?|llc|company|co\.?)?[.,]?$/i;
const INSTITUTION_SUFFIX = /\b(?:trust (?:company|co)|bank|advisors?|asset management|investments?|capital management|fund management)\.?$/i;
/* exported v132 so sizing scripts and audits ask the SHIPPED question rather
 * than a retyped copy of it — the failure mode this project has hit twice
 * (a hand-rolled generic-name list, a hand-rolled fund-shape test), and the
 * reason `isLoanNoteName` was exported at v131. */
export function isHouseName(nc) {
  const s = String(nc || "").trim().replace(/\s+/g, " ").replace(/^[*^†‡(#]+\s*|\s*[*^†‡)#]+$/g, "");
  if (!s) return true;                 // no identity at all — the description is all there is
  if (HOUSE_ONLY.test(s)) return true;
  return INSTITUTION_SUFFIX.test(s) && s.split(/\s+/).length <= 5;
}

const CATEGORY_PHRASE = /^(?:target[- ]date(?: retirement)?(?: funds?)?|retirement (?:date )?funds?|registered inves\w{0,2}ments? compan(?:y|ies)|(?:common[\/ ]?)?collective trust funds?|separate accounts?|group annuity contracts?|guaranteed (?:interest|investment) contracts?|insurance company (?:general|pooled separate) accounts?|(?:group|variable|fixed) annuity(?: contracts?| accounts?)?|guaranteed (?:interest )?accounts?|insurance (?:general )?accounts?|general accounts?|insurance contracts?|guaranteed insurance contracts?|blended funds?|balanced funds?)$/i;
/* Harvested by measuring 3,928 rows where a PRODUCT-shaped identity sits
 * behind a short generic name. The list is deliberately PARTIAL: the same
 * measurement returned "TIAA Real Estate" (324), "TIAA Stable Value" (140),
 * "Fidelity Contrafund" (33) and "Cash Reserve Account" (171) — those are
 * REAL investment options, not type labels, and adding them would rename a
 * plan's actual holding. Only contract/category vocabulary from the Form
 * 5500 instructions is included. Every phrase here is additionally gated by
 * identityIsProduct, so a plan whose entire balance IS a group annuity
 * (no product identity behind it) keeps "Variable Annuity Contract" as its
 * holding — the v68 regression this must never repeat. */

const DESPACED_TYPE = /^(?:mutualfunds?|commoncollectivetrusts?(?:funds?)?|collectivetrusts?(?:funds?)?|collectiveinvestmenttrusts?|commingled(?:trust|fund)s?|pooledseparateaccounts?|separateaccounts?|registeredinvestmentcompan(?:y|ies)|guaranteed(?:investment|interest)contracts?|stablevalue(?:funds?)?|moneymarket(?:funds?)?|commonstocks?|corporatestocks?|employersecurities|interestbearingcash|cash|participantloans?|notesreceivablefromparticipants|unitizedfunds?|insurancecompanygeneralaccounts?)$/;
function typeOnly(desc) {
  /* v72: a trailing VALUE or footnote marker defeats the type test. Filings
   * print "Mutual funds   291,224 (1)" in the description column, and those
   * digits kept the phrase from reading as type-only — so the type won the
   * name and the real fund ("BlackRock Lifepath Index 2035 Fd") was demoted
   * to the issuer field. Measured: 2,174 rows have the product in `iss` and a
   * type in the name. */
  let r = String(desc).replace(/\s+[\d,]{3,}(?:\.\d+)?\s*(?:\(\d+\))?\s*$/, "").trim();
  if (CATEGORY_PHRASE.test(r)) return true;
  /* v141: A KERNED FONT SPLITS EVERY WORD INTO FRAGMENTS. Nelnet (11,248
   * participants, $760M) files its schedule in a font pdftotext renders as
   * "V an gu ard Targe t Re tire m e nt 2045 Tru st II | Com m o n Co lle ctive
   * Tru st". The description is a type label, but no pattern matched the
   * fragments, so the DESCRIPTION won the name and twelve target-date trusts
   * merged into one row called "Com m o n Co lle ctive Tru st" at 52.6% of
   * the plan beside "Mu tu al Fu nd" at 45.6% — a six-row fabricated lineup
   * that every guard passed (two labels, neither above 90%). 167 plans /
   * 558,665 ppl carry a letter-spaced row; 20 lineups are mostly such rows.
   * When the phrase is fragmented (two or more 1–2 letter tokens in a row),
   * compare it with every space removed against the type vocabulary. Only a
   * whole-phrase match counts, so no real fund name can trip it. */
  if (/(?:\b[A-Za-z]{1,2} ){2,}/.test(r) && DESPACED_TYPE.test(r.toLowerCase().replace(/[^a-z]/g, ""))) return true;
  for (const [re] of TYPE_PATTERNS) r = r.replace(re, " ");
  /* "guaranteed", "registered", "pooled", "separate", "collective",
   * "commingled", "insurance", "mutual", "stable" are TYPE words, never a
   * whole fund name on their own. Deliberately NOT added: "retirement",
   * "value", "income" — each is load-bearing in real names ("Retirement 2040
   * Fund I", "MFS Value Fund"), and stripping them would make a genuine fund
   * read as type-only and hand the row back to the issuer column. */
  /* "portfolio" joined v109: it plays the same grammatical role as "fund"/
   * "account" — State Farm's description column reads "Common Collective
   * Trust Portfolio" on all 18 CCT rows, the residue "Portfolio" (9 chars)
   * kept it from reading as type-only, the description won the name, and 18
   * real Vanguard trusts merged into one $18.0B row (the stmt guard caught
   * the merge, so the cost was the withheld menu, not a fabrication). A fund
   * named ONLY "Portfolio" does not exist; identity words survive the strip
   * ("Fidelity Managed Income Portfolio" -> "Fidelity Managed Income"). */
  r = r.replace(TYPE_WORDS, " ");
  return r.replace(/[^a-z0-9]/gi, "").length < 6;
}
/* the same vocabulary, named, because v130's wrap repair needs to ask a
 * slightly different question of it: not "is this phrase ONLY type words" but
 * "what is left when they are gone" */
const TYPE_WORDS = /\b(value of|interest in|the|a|an|of|in|at|held|funds?|accounts?|companies|company|end of year|publicly[- ]traded|common|trusts?|securit(y|ies)|contracts?|investments?|guaranteed|registered|pooled|separate|collective|commingled|insurance|mutual|stable|interest|portfolios?)\b/gi;

/* v130: MAY THIS LINE BE THE HEAD OF THE NAME BELOW IT?
 *
 * A valueless line sitting in the description column is usually a wrapped fund
 * name — that is the defect this version repairs — but it can also be a column
 * CAPTION or a TYPE header, and gluing either one onto a fund produces a name
 * no ticker will ever match. Three tests, all cheap, all measured against the
 * fragments this version has to keep:
 *   1. a name's first line starts with a capital, a digit or a bracket. Inotiv
 *      files its caption across three lines and the third is "or m aturity
 *      value" (OCR spacing and all), which sat directly above the first
 *      holding and would have renamed it.
 *   2. the shipped GENERIC_TYPE_NAME / typeOnly, which catch "Registered
 *      Investment Company" and "Pooled Separate Accounts".
 *   3. what survives the type vocabulary must still be two words or carry a
 *      digit. Principal Life's schedule prints "Insurance Company General"
 *      over every general-account row; the residue is "General", one word, so
 *      it is a header. "Fiera Asset Management USA Collective" keeps four,
 *      "Interest rates range from 3.25% to 8.50%," carries digits, and
 *      "Intermediate Government Bond Index Non-" is untouched.
 */
/* v131: is this name nothing but a participant-LOAN description? Exported so
 * the audit and any sizing script can ask the SHIPPED question instead of a
 * remembered one. Three parts, and all three are load-bearing:
 *   LOAN_TEXT / RATE_RANGE  the row talks about rates, maturities, collateral
 *   LOAN_SECURITY           a real security identity vetoes it (fund, trust,
 *                           contract, treasury, note, CUSIP, a company suffix)
 *   residue                 what survives the rate/date/repayment vocabulary
 *                           must be under four letters, i.e. no brand is left
 */
const LOAN_TEXT = /\b(?:interest rates?|rate range|maturit(?:y|ies)|maturing|matures|collateraliz\w+|bearing interest|per annum|due at various|participant loans?|loans? to participants)\b/i;
const RATE_RANGE = /\d+(?:\.\d+)?\s*(?:%|percent)\s*(?:[-–—]|to|through|and)\s*\d+(?:\.\d+)?\s*(?:%|percent)/i;
const LOAN_SECURITY = /\b(?:funds?|trusts?|index|idx|portfolios?|equit(?:y|ies)|stocks?|shares?|class|series|etf|annuity|contracts?|gic|guaranteed|insurance|treasur\w*|strips?|notes?|bonds?|debentures?|mortgages?|cusip|corp\w*|inc|incorporated|llc|ltd|compan(?:y|ies)|municipal|agency|reit|certificates?|deposits?|market|separate|stable|collective)\b/i;
const LOAN_VOCAB = /\b(?:interest|interests|rate|rates|ranging|range|ranges|from|to|through|thru|various|varying|varied|maturity|maturities|maturing|matures|mature|date|dates|due|at|and|or|with|per|annum|collateral|collateraliz\w+|secured|by|participant\w*|account|accounts|balance|balances|loan|loans|promissory|repaid|repayment|payable|payments?|vested|plan|plans|the|of|a|an|over|up|between|years?|months?|approximately|monthly|quarterly|weekly|bi-?weekly|payroll|deduction|deductions|january|february|march|april|may|june|july|august|september|october|november|december)\b/gi;
/* v135: IS THIS NAME PROSE RATHER THAN A HOLDING?
 *
 * Two shapes, both measured on published lineups before shipping:
 *
 *  A. a DESCRIPTION VERB PHRASE. National Medical Care (72,950 participants)
 *     publishes `the S&P 500® Index by investing in stocks that make up the
 *     index.` at $755M — the LAST LINE of an option's description, carrying
 *     the value that belongs to the option. A fund's NAME never explains what
 *     the fund does; a description column often does.
 *  B. a LOWERCASE FIRST WORD followed by another lowercase word. That is the
 *     tail of a wrapped sentence, never the head of a filed fund name: BJC
 *     Health System (43,409 participants) publishes `for benefits` at 84.4%
 *     and `assets available for benefits` at 15.0% — the entire menu — and
 *     the Board of Trustees of the Deferred Comp plan (33,824) publishes
 *     `investment contracts, at fair value` at 82%.
 *
 * The SECOND word carries the test on purpose, because that is what keeps the
 * house styles that legitimately start lowercase: `iShares Core S&P 500`,
 * `abrdn Emerging Markets`, `eBay Inc` all have a capitalised second word.
 * Exported so audits and sizing scripts ask the shipped question.
 */
export function isProseRowName(n) {
  const s = String(n || "").trim();
  if (!s) return false;
  if (/\b(?:by investing|seeks to|invests? (?:in|primarily)|is designed to|designed to provide|(?:whose|its) objective is)\b/i.test(s)) return true;
  /* Arm B is narrower than "starts lowercase", and the narrowing was measured
   * rather than guessed. A random 40 of what the first draft dropped contained
   * real holdings whose names merely carry damaged prefixes — `maturity date
   * AmCen Mid Cap Value Fund R6`, `required for Blackrock Lifepath 2060`,
   * `average rate is 1.25% American Century One Choice 2055` — the same rows
   * v131's loan predicate was written to KEEP. A capital letter or a digit
   * anywhere in the name means a product may still be named in it, so arm B
   * fires only on text that is lowercase prose end to end. `for benefits`,
   * `assets available for benefits`, `investment contracts, at fair value`,
   * `mutual fund shares`, `at net asset value` all qualify; `fidelity freedom
   * index 2020 fund` (a genuine lowercase-extracted fund) does not. */
  if (!/^[a-z][a-z'’.,()]*\s+[a-z(]/.test(s)) return false;
  if (/[A-Z0-9]/.test(s)) return false;
  /* …and a lowercase-extracted FUND still begins with its house. Reuses the
   * shipped HOUSE_ONLY vocabulary rather than a remembered list, applied to
   * the first token only: `fidelity international index fund` is a real
   * holding in a filing whose text layer lost its capitals (found in a random
   * 40 of what this predicate drops), while `for benefits` and `investment
   * contracts, at fair value` begin with no house at all. */
  return !HOUSE_ONLY.test(s.split(/\s+/)[0]);
}

/* v136: IS THIS NAME A LINE OF THE STATEMENT OF CHANGES?
 *
 * The audited financial statements print a Statement of Changes in Net Assets
 * beside the Schedule H line 4i table, and its caption column leaks into the
 * region: FMR LLC (93,003 participants) published `Employer, net of
 * forfeitures` at $1.29B = 3.8% of its 80-row menu; Marsh & McLennan (32,965
 * and 17,594) published `Net appreciation in fair value of plan identified
 * investments held by master trust` at 6.6% and 7.6%; Exelon `Rollover
 * receipts`; AutoNation and Bloomberg the FMR row; IRB Holding `Rollover,
 * participants`. The money is real and it moved — it is a contribution, a
 * rollover receipt, an investment gain or a benefit payment — but no such
 * holding exists, and every one of them is published as a fund.
 *
 * ANCHORED ON THE FIRST TOKEN, always, because a fund name may contain any of
 * these words in the middle ("Total Return", "Strategic Income"). The three
 * families are the sections of the statement itself:
 *   - contributions, filed with their source: `Employer, net of forfeitures`,
 *     `Participant, rollovers`, `Employer, net of forfeitures of $521`
 *   - rollover receipts, however phrased — but NEVER a row that goes on to
 *     name a product, so a hypothetical `Rollover Balanced Fund` is untouched
 *   - investment income and benefit payments: `Net appreciation in ...`,
 *     `Net Gain on Sale of Investments`, `Benefit paid to participants`
 * The `net gain/loss/income` arm requires a following preposition, so a fund
 * called `Net Income Fund` cannot match while `Net gain on investments` does.
 *
 * THE CONTROL IS THE FORFEITURE ACCOUNT, and it is why no arm here starts with
 * `forfeiture`. About 62 published rows are named `Forfeiture Account`,
 * `Forfeiture cash account`, `Forfeiture/Asset Holding Account`,
 * `Forfeiture suspense account` — those are REAL unallocated cash positions
 * that the plan genuinely holds, and they stay. Only `net of forfeitures`
 * appears here, and only as the tail of a contributions caption.
 *
 * MEASURED WHOLE-POPULATION BEFORE SHIPPING, not sampled: simulated over all
 * 59,748 published lineups it matches 48 rows across 47 plans / 340,403
 * participants, every one of which was read by name, and not one forfeiture
 * account. */
const STMT_OF_CHANGES_ROW = new RegExp([
  "^(?:employer|employee|participant|company|sponsor)s?['’]?,\\s*(?:net of forfeitures|contributions?|rollovers?)\\b",
  "^rollovers?\\b(?![^|]*\\b(?:fund|index|portfolio|etf|class|trust)\\b)",
  "^net\\s+(?:appreciation|depreciation|realized|unrealized)\\b",
  "^net\\s+(?:investment\\s+)?(?:gain|loss|income)\\s+(?:on|in|from|of)\\b",
  "^benefits?\\s+paid\\b",
  "^distributions?\\s+to\\s+participants\\b",
].join("|"), "i");
export function isStatementOfChangesRowName(n) {
  return STMT_OF_CHANGES_ROW.test(String(n || "").trim());
}

export function isLoanNoteName(n) {
  const s = String(n || "");
  if (!LOAN_TEXT.test(s) && !RATE_RANGE.test(s)) return false;
  if (LOAN_SECURITY.test(s)) return false;
  const residue = s.replace(/\d+(?:\.\d+)?\s*(?:%|percent)/gi, " ")
    .replace(/\b(?:19|20)\d{2}\b/g, " ")
    .replace(/\d+[-\/]\d+(?:[-\/]\d+)?/g, " ")
    .replace(LOAN_VOCAB, " ")
    .replace(/[^a-z]/gi, "");
  return residue.length < 4;
}

function wrapHeadOk(s) {
  const t = String(s || "").trim();
  if (t.length < 4 || !/^[A-Z0-9("'*]/.test(t)) return false;
  if (GENERIC_TYPE_NAME.test(t) || typeOnly(t)) return false;
  const residue = t.replace(TYPE_WORDS, " ").replace(/\s+/g, " ").trim();
  return residue.split(" ").filter(Boolean).length >= 2 || /\d/.test(residue);
}

/* v149 (queue item n): A CLASS SUBTOTAL BESIDE ITS OWN ITEMISATION, judged in
 * FILED ORDER at the leaves stage, before any view of the region is built.
 * Marriott (152,118 participants) files `COMMON STOCKS … 4,408,382,764` and
 * then the 443 stocks it totals; keeping both did two things: the published
 * sum double-counted, and the v77 restatement cut — which walks the filed
 * order until the cumulative sum reaches plan assets — reached it EARLY and
 * chopped off the 21 collective trusts that followed ($5.7B, the real menu).
 * No post-selection repair can recover a block the cut removed, so the
 * subtotal goes before the cut sees it.
 * A label is a name made only of class words; its run is the non-label rows
 * immediately after it (or before it, for totals printed under their items),
 * at least three rows, summing to 97–100.5% of the label (the parser loses a
 * few rows of any long itemisation). The Verizon trust's summary page — a
 * dozen class rows and nothing itemised in the region — is untouched, because
 * its neighbours are labels too and no run forms. */
const CLASS_ONLY_NAME = /^(?:(?:corporate|common|preferred|government|governmental|u\.?s\.?|treasury|agency|municipal|foreign|domestic|international|global|interest[- ]bearing|cash|equi[a-z]{4,9}|securities|stocks?|bonds?|debt|equit(?:y|ies)|debentures?|notes?|obligations?|loans?|participants?|receivables?|other|total|investments?|at|fair|value|contracts?|collective|common\/collective|pooled|separate|accounts?|registered|investment|compan(?:y|ies)|mutual|funds?|trusts?|guaranteed|insurance|synthetic|short[- ]term|fixed[- ]income|real\s+estate|exchange[- ]traded|variable|fixed|annuit(?:y|ies)|(?:non)?benefit[- ]responsive|custodial|general|and|&)(?![a-z0-9])[\s,.\-–—/()]*)+$/i;
const CLASS_NOUN = /(?:stocks?|bonds?|debt|securities|equit(?:y|ies)|loans?|cash|trusts?|accounts?|funds?|compan(?:y|ies)|contracts?|notes?|obligations?|debentures?|annuit(?:y|ies))\b/i;
export function isClassLabel(name) {
  const n = String(name || "").trim();
  return !!n && (GENERIC_TYPE_ANY.test(n) || GENERIC_TYPE_NAME.test(n) || (CLASS_ONLY_NAME.test(n) && CLASS_NOUN.test(n)));
}
export function subtotalIndices(rows) {
  const out = new Set();
  if (!Array.isArray(rows) || rows.length < 6) return out;
  const lab = rows.map((r) => isClassLabel(r && r.name));
  const runOk = (from, step, target) => {
    let s = 0, n = 0;
    for (let j = from; j >= 0 && j < rows.length && !lab[j]; j += step) {
      s += +rows[j].value || 0; n++;
      if (s > target * 1.005) return false;
    }
    return n >= 3 && s >= target * 0.97 && s <= target * 1.005;
  };
  for (let i = 0; i < rows.length; i++) {
    const v = +(rows[i] && rows[i].value) || 0;
    if (!v || !lab[i]) continue;
    if (runOk(i + 1, 1, v) || runOk(i - 1, -1, v)) out.add(i);
  }
  return out;
}

/* v154: a TYPE phrase closing an issuer cell — see the two uses in parseRows and parse4i. */
const ISS_TYPE_TAIL = /\b(?:variable annuit(?:y|ies)|registered investment compan(?:y|ies)|mutual funds?|pooled separate accounts?|separate accounts?|common\/?collective trusts?|collective (?:investment )?trusts?|insurance company general accounts?|master trust)\s*$/i;

const FORM_LINE = /^(?:\d[a-z]\(\d\)(?:\([A-Za-z]\))?|\([a-z]\)\s+(?:amount|total|common|preferred|all other|other)\b\.{0,3}|le\s+\d?\s*1f\b)/i;
/* v155 part 2: a `(N)` prefix is a Schedule H LINE only when what follows is
 * that line's own text — `(3) Other`, `(8) Participant loans`, `(14) … held in
 * insurance company general account`, `(2) From this plan`. Filings also
 * footnote real rows that way (`(1) JPMorgan US Equity R6`, Conditioned Air's
 * 34 rows; Central City Concern's 32), and the first draft of this rule
 * withdrew both menus in run #386. The marker is stripped and the row kept
 * unless the remainder is Schedule H vocabulary or a class label. */
const SCHED_H_ITEM = /^(?:other\b|from this plan|to this plan|[a-z]*\)?\s*held in insurance|participant loans?\b|loans? \(other|u\.?s\.? government|employer(?:-related)? securit|value of|interest[- ]bearing cash|corporate (?:debt|stocks?)|partnership|real estate|registered investment|common\/?collective|pooled separate|master trust|103-12|net (?:income|assets)|total\b|specify|x\s+d\b)/i;

/* v155: a dead-heat tie-break between two renderings of one schedule — the
 * share of rows with a lowercase letter (mixed case beats ALL-CAPS
 * abbreviation) and the mean name length against 40 (fuller beats clipped),
 * each half; 0..1, scaled by 0.002 at the score so it never outweighs a row. */
function nameQuality(rows) {
  if (!Array.isArray(rows) || !rows.length) return 0;
  /* v156: LENGTH was the wrong second signal — run #386 measured 775 render
   * swaps and length picked the abbreviated recordkeeper render as often as
   * not (`Blue Chip Growth` → `FIDELITY BLUE CHIP GRTH K6 FD`, `Principal
   * Fixed Income Account` → `Prin Fixed Income 401(a)/(k)`): the longer
   * string carried more house prefix and class suffix, not more words. The
   * share of tokens that contain a vowel measures abbreviation directly
   * (`Vgd Trgt Rtmt` has none) and is what a reader means by readable. */
  let lower = 0, toks = 0, vowel = 0;
  for (const r of rows) {
    const n = String(r.name || ""); if (/[a-z]/.test(n)) lower++;
    for (const t of n.split(/[^A-Za-z]+/)) { if (t.length < 2) continue; toks++; if (/[aeiouy]/i.test(t)) vowel++; }
  }
  return 0.5 * (lower / rows.length) + 0.5 * (toks ? vowel / toks : 0);
}

export function parseRows(section, opts = {}) {
  const rows = [];
  let sdba = false;
  let nameBuf = [];
  /* v132: the last buffered line before a BLANK gap, kept for exactly one
   * consumer — the bare-house-name row below. Cleared by any non-blank line. */
  let gapBuf = null;
  let curSection = "";
  /* v126: the ISSUER-HEADER form of a section. A 4i schedule may name the firm
   * once on its own line and then indent the products under it:
   *     T. Rowe Price Associates, Inc:
   *           Retirement 2030 Fund      Common collective trust    321,301
   * The children then carry no identity of their own, so "Retirement 2030
   * Fund" names no specific fund and resolves no ticker. Tracked separately
   * from curSection because the other curSection branches are TYPE headers
   * ("Common collective trusts", "Corporate stocks"), which must never be
   * published as an issuer. */
  let curIss = "";
  /* the header's own indentation. Its children are INDENTED under it; the
   * schedule returns to the header's column when the block ends. Without this
   * the issuer leaks: US Foods lists T. Rowe Price's vintages indented, then
   * returns to column 0 for "Spartan 500 Index Fund Class C" - a FIDELITY
   * fund, which inherited "T. Rowe Price Associates, Inc" and would have been
   * published under the wrong firm. Attributing a holding to a house that does
   * not run it is the v103 glued-header defect in a new place. */
  let curIssIndent = -1;
  // a valueless "Total ..." line means the subtotal WRAPPED: its value arrives
  // on the next short line ("Total Registered Investment" ↵ "Companies  613,913,288")
  let totalWrap = false;
  /* v130: a buffered line remembers WHERE its cells sit, because that is what
   * says whether a wrap belongs to the identity column or the description
   * column. `col` is the line's first character, `dcol` its description cell. */
  const mkBuf = (txt, col, rn) => {
    const bs = splitNameDesc(txt);
    const dcol = bs.descCol ? rn.indexOf(bs.descCol, col + bs.nameCol.length) : -1;
    /* `wide` = the line v129 refused to buffer at all, because its 90-char cap
     * counted the inter-column padding. Such a line may be REUNITED with the
     * value line it wrapped onto (the down-wrap branch, which takes one cell of
     * it), but it may never be glued in front of a name as free text: letting
     * it do that fabricated a $1.82B "Plan 13" row for Colgate-Palmolive and
     * turned twelve of Delta's brokerage rows into address-and-fee soup, both
     * of which then cleared the confidence band. Measured on the corpus before
     * the restriction: 2 plans / 121,336 participants would have been published
     * that way. A wider buffer is not a free improvement. */
    return { t: txt, col, name: bs.nameCol, desc: bs.descCol || "", dcol, wide: txt.length >= 90 };
  };
  // values may carry cents ("$175,869,410.45" — Eaton Savings Trust files its
  // whole menu that way); capture the dollars, tolerate the cents. Rates like
  // "10.50" stay out: the capture needs 3+ digit/comma chars before the dot.
  // millions-stated schedules (PPG "($ in millions)") print 1-2 digit
  // holding values ("JP Morgan Equity Income Fund   57") — allow them ONLY
  // when the caller saw the millions marker, so ordinary regions can't grow
  // fake rows from stray digits
  const valueRe = opts.smallValues
    ? /\$?\s*([0-9][0-9,]*)(?:\.\d{1,2})?\s*$/
    : /\$?\s*([0-9][0-9,]{2,})(?:\.\d{1,2})?\s*$/;

  for (const raw of section) {
    // leading "*" is the party-in-interest marker on holding rows — drop it
    // before matching so starred holdings aren't mistaken for footnotes.
    // trailing "**" (assets >5% of plan) hides the line-terminal value, and
    // trailing footnote-letter runs — "442,273,650 (a), (b), (c)" (GE
    // Vernova) — hide it the same way. Strip the letters ONLY after a
    // comma-grouped number: an unconditional strip turned "…401(a)" into
    // "…401", whose bare digits parsed as a value — that let a wrapped
    // "Total … Matching Program $1.1B" subtotal through as a holding and
    // let form-page "401(k)" lines fake rows that suppressed OCR.
    const rawIndent = (/^[ \t]*/.exec(raw) || [""])[0].replace(/\t/g, "    ").length;
    /* v130: the COLUMN a line's text starts in, past the party-in-interest
     * marker. A wrapped line has to be attributed to the column it sits
     * under — see the descPre block below — and that needs a real character
     * offset, not just an indent depth. */
    const rawNorm = raw.replace(/\t/g, "    ");
    const lead = (/^\s*(?:[*^]|#(?=\s))?\s*/.exec(rawNorm) || [""])[0].length;
    /* block ended: this row sits at or left of the header that opened it */
    if (curIss && raw.trim() && rawIndent <= curIssIndent) { curIss = ""; curIssIndent = -1; }
    /* v150 (queue item p): `^` is the party-in-interest mark in another
     * template — BAE `[^ The Vanguard Group]`, `Fidelity 500 Index Fund ^`,
     * `^ Empower Guaranteed Interest Fund`; 2,038 name rows + 38 issuers /
     * 164 plans / 476,133 ppl carried it. Same treatment as `*`. */
    let t = raw.trim().replace(/^(?:[*^†‡]+|#(?=\s))\s*/, "").replace(/\s*[*^†‡]{1,3}\s*$/, "")
      .replace(/([0-9]{1,3}(?:,[0-9]{3})+)(?:\s*[,.]?\s*\(\s*[a-z]\s*\)){1,4}\s*$/i, "$1")
      /* v146: a lone FOOTNOTE LETTER in column (a) — "b        JP Morgan
       * JP Morgan Mid Cap Growth Fund   N/R   22,050,627" in a filing's second
       * render — became the identity cell, pushed the house into the
       * description, and the double-render dedup then kept the LONGER name:
       * "JP Morgan JP Morgan Mid Cap Growth Fund" on 238 plans / 486k ppl.
       * Same treatment as the party-in-interest `*` above. */
      /* …but only on a row with TWO cells after the letter: the Form 5500
       * cover page also starts lines with a letter ("a   Name of Plan
       * Sponsor…", "b   Qvale Auto Group, Inc.   94-…"), and stripping those
       * made a cover line a $6.4M holding and cost Qvale its 22-row menu
       * (run #381). A 4i data row carries identity AND description. */
      .replace(/^[a-z]\s{3,}(?=\S[^\n]*\S\s{3,}\S)/, "");
    /* v132: A BLANK LINE STILL ENDS THE NAME BUFFER — but remember the last
     * line across the gap, for the one case that needs it (see `gapIn` below).
     * One recordkeeper template prints the fund in the DESCRIPTION column, then
     * three or four blank lines, then the identity+value line carrying only the
     * fund family:
     *
     *                                   Vanguard Target Retirement 2035 Fund
     *
     *
     *        Vanguard                          0            2,775,373
     *
     * The blank clears the buffer, every row falls back to the identity, and
     * each vintage is published as "Vanguard" — which then MERGE into one
     * holding at 95% of the plan (Bell Nursery, 1,991 participants). */
    if (!t) {
      if (nameBuf.length) { const lb = nameBuf[nameBuf.length - 1]; if (!lb.wide) gapBuf = lb; }
      nameBuf = []; continue;
    }
    /* every NON-blank line consumes the carried-over orphan, so it can only
     * ever reach the next value row and only when nothing else intervened */
    const gapIn = gapBuf; gapBuf = null;
    // an auditor's letterhead is not a holding: "Tel: 813 273-8300" parsed
    // as an $8.3M fund on MetLife's fallback filing (the phone's last four
    // digits read as a thousands-scaled value). The separator is required —
    // "TELUS Corp" and "Tel Aviv Stock Exchange" are real issuers (v110).
    if (/^(?:tel|fax|telephone)\s*[:.]/i.test(t)) { nameBuf = []; continue; }
    // "Current Value | Shares Par" layouts put the share count LAST — strip
    // the shares column and the currency code so the dollar value is trailing
    if (opts.sharesLast) {
      const sp = t.match(/^(.*?)\s+(?:USD|EUR|GBP|CAD)\s+(-|\$? ?[0-9][0-9,]*(?:\.\d{2})?)\s+[0-9][0-9,]*(?:\.\d+)?\s*$/);
      if (sp) {
        if (sp[2] === "-") { nameBuf = []; continue; } // stale zero-value holding
        t = sp[1] + "   " + sp[2].replace(/\.\d+$/, "");
      }
    }
    // "PAR/SHARES | COST | MARKET VALUE | UNREALIZED GAIN/LOSS" layouts
    // (Verizon Master Savings Trust) put the GAIN last — drop it (negatives
    // are parenthesized) so the market value becomes line-terminal
    if (opts.gainLast) {
      const gp = t.match(/^(.*?[0-9][0-9,]*(?:\.\d+)?)\s+(?:-|\(? ?-?[0-9][0-9,]*(?:\.\d+)?\)?)\s*$/);
      if (gp) {
        t = gp[1].replace(/\.\d+$/, "");
        if (/(^|\s)-$/.test(t)) { nameBuf = []; continue; } // worthless holding
      }
    }
    // cents layouts write empty holdings as "$0.00" — a zero row is not a
    // holding and must never glue into the NEXT row's name via nameBuf
    if (/(?:^|[\s$])0\.0{1,2}\s*$/.test(t)) { nameBuf = []; continue; }
    // line-terminal parenthesized numbers are negatives (accrued fees /
    // liabilities on trust fund-accounting pages) — not holdings, and not
    // wrapped name fragments either
    if (/\(\s*\$?\s*[0-9][0-9,]*(?:\.\d{1,2})?\s*\)\s*$/.test(t)) { nameBuf = []; continue; }
    // columnized address lines ("CLEVELAND   OH   44122"): the comma form is
    // in SKIP_ROW, but -layout renders sponsor addresses as columns and the
    // zip then parses as a $44k holding (Eaton)
    if (/\s[A-Z]{2}\s+\d{5}(?:-\d{4})?\s*$/.test(t) && !/\$/.test(t) &&
        t.split(/\s+/).length <= 5) { nameBuf = []; continue; }
    /* v68: the same address, spelled out. An auditor's letterhead prints
     * "500 North Lewis Road, Limerick PA 19468" — more than five words, so
     * the compact guard above misses it, and the leading street number makes
     * it look like a data row. A street suffix followed by a state and ZIP is
     * an address in any filing, never a fund. */
    if (/\b(?:street|st|road|rd|avenue|ave|boulevard|blvd|drive|dr|lane|ln|way|suite|ste|floor|fl)\b[^0-9]{0,40}\b[A-Z]{2}\s+\d{5}(?:-\d{4})?\b/i.test(t)) { nameBuf = []; continue; }
    // SKIP_ROW's statement vocabulary ("contributions?") is unanchored and
    // swallowed master-trust holdings whose NAME contains it — Northrop's
    // "Defined Contribution Plans Master Trust  ** $39,301,997" ($39.3B,
    // 89% of the plan) never parsed. An explicit participation/interest
    // phrase, or "Master Trust" directly before the trailing value, marks
    // a real holding row.
    // "Investment, at contract value: Key Guaranteed Portfolio Fund" is a
    // LABELLED HOLDING, not the statement subtotal the v44 guard was built
    // for ("Investments, at fair value   66,846,124"). The colon plus a name
    // tells them apart; strip the label so the fund keeps its own name.
    // R.H. White's $2.3M stable-value option — the plan's only capital-
    // preservation choice — was dropped from the lineup entirely.
    t = t.replace(/^investments?\s*,?\s*at\s+(?:fair|contract)\s+value\s*:\s*(?=\S)/i, "");
    const trustRow = (/\b(?:participation|interest) in\b[^.]{0,80}\bmaster trust\b|\bmaster trust\b\W*(?:\*{1,3})?\s*\$?\s*[\d,]+\s*$/i.test(t)) &&
      // "NET INVESTMENT GAIN FROM MASTER TRUST $105,798,097" (Kohler) is a
      // statement line, not a holding
      !/\b(?:gain|loss|income|transfers?|expenses?|contributions? (?:to|from))\b/i.test(t);
    /* v153: a BOND is not a statement line whatever word it carries. The
     * unanchored statement arm's `receivable` dropped every auto-loan
     * securitization in Marriott's corporate-bond sleeve — `ALLY AUTO
     * RECEIVABLES TR 2023-A B 6.01% 01/17/2034`, 43 rows — so the class
     * subtotal's run summed to 96.3% and `CORPORATE BONDS` published as a
     * $578M holding (the Energy Transfer `transfer` trap, next word). A
     * coupon followed by a maturity date, or a securitization series
     * (`TRUST 2021-2`), with a trailing value, is a security row. */
    const securityRow = valueRe.test(t) &&
      /\d+(?:\.\d+)?\s*%(?:\s*\/\s*var)?\s+(?:due\s+)?\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4}\b|\b(?:tr|trust|funding|receivables|llc)\s+(?:20)?\d\d-[a-z0-9]{1,6}\b/i.test(t);
    if ((SKIP_ROW.test(t) && !trustRow && !securityRow) || DATE_LINE.test(t)) {
      nameBuf = [];
      totalWrap = /^(sub|grand )?total\b/i.test(t) && !valueRe.test(t);
      continue;
    }
    /* v139: A LINE MADE ONLY OF COLUMN-CAPTION WORDS IS THE HEADER, wherever
     * it starts. SKIP_ROW anchors on the caption's FIRST word, so a wrapped
     * caption line that starts mid-phrase and carries no value ("of
     * Investment      Cost        Value", "maturity date", "Par or Maturity
     * Value") entered the name buffer and glued onto the page's first holding.
     * Nebraska Medicine (12,081 participants) published its largest holding,
     * Vanguard Institutional Index Fund at 19.6%, as "of Investment Cost
     * Value EMPOWER ANNUITY INSURANCE COMPANY O…"; store-wide 478 plans /
     * 409,634 participants carry one such row, 440 of them "maturity date
     * <fund>". Whole-line test: every word must be caption vocabulary, so a
     * fund name that merely contains "value" is untouched. */
    {
      const tn = t.replace(/\s+/g, " ").trim();
      if (HEADER_FRAG_LINE.test(tn) ||
          (KERNED.test(tn) && HEADER_FRAG_DESPACED.test(tn.toLowerCase().replace(/[^a-z]/g, "")))) { nameBuf = []; continue; }
      /* and the Form 5500 cover-page captions the same font fragments: Hill
       * Brothers published "Em ploye r Ide ntification N um be r" at 7.3% of
       * the plan, with the EIN box's neighbouring figure as its value. These
       * are SKIP_ROW's first words, compared with the spaces removed. */
      if (KERNED.test(tn) && /^(?:employeridentification|plansponsor|planname|plannumber|sponsorname|totalinvestment|total)/.test(tn.toLowerCase().replace(/[^a-z]/g, ""))) { nameBuf = []; continue; }
    }
    if (/:\s*$/.test(t)) {
      curSection = t.replace(/:\s*$/, "");
      /* v126: promote to an issuer header only when it names a FIRM. A colon
       * line is also how "Investments at fair value:" is written, so require a
       * corporate token AND that the phrase is not a type/category label. */
      /* v127: the header keeps its party-in-interest marker because it ends
       * in ":" and the trailing-"*" strip above only fires at end of line —
       * "Fidelity Management Trust Company*:" reached iss as "...Company*".
       * 3,224 rows / 446 plans / 1.02M participants rendered "Fidelity**"
       * as the issuer. Strip it here; curSection itself keeps the raw text
       * for the brokerage classifier, which does not care. */
      const cs = curSection.replace(/\s*[*^]+\s*/g, " ").replace(/^#\s*|\s*#$/g, "").replace(/\s+/g, " ").trim();
      curIss = (!typeOnly(cs) && !CATEGORY_PHRASE.test(cs) && cs.split(/\s+/).length <= 8 &&
                (isHouseName(cs) || /\b(?:inc|llc|l\.l\.c|corp(?:oration)?|compan(?:y|ies)|co|associates|advisors?|advisers?|management|investments?|group|partners|bank|trust|n\.a)\b\.?/i.test(cs)))
        ? cs : "";
      /* v154: a header that names the firm AND the vehicle — `Vanguard Group
       * Registered investment company:`, `Principal Life Insurance Company
       * Pooled separate account:` (IBEW 124) — keeps only the firm as the
       * issuer; the rows already take their type from curSection. */
      if (curIss) {
        const m = curIss.match(ISS_TYPE_TAIL);
        if (m && m.index >= 3) { const head = curIss.slice(0, m.index).replace(/[\s,\-–—/]+$/, ""); if (head.length >= 3) curIss = head; }
      }
      curIssIndent = curIss ? rawIndent : -1;
      nameBuf = []; totalWrap = false; continue;
    } // section subheading

    /* v133: A SECURITY IDENTIFIER IS NOT A DOLLAR VALUE.
     *
     * The Northern Trust "5500 Supplemental Schedules" template — filed by
     * HCA, Home Depot, Kroger, Marriott, Caterpillar, Honeywell, Marsh &
     * McLennan, ITW, Bechtel and a dozen more master trusts — prints the asset
     * ID on the line BELOW the holding it identifies:
     *
     *   MFB NT COLLECTIVE S&P 500 INDEX FUND - LENDING   177,225.140 ... 4,024,764,675.21
     *   CUSIP: 658991294
     *
     * `valueRe` read that nine-digit CUSIP as a line-terminal $658,991,294.
     * Every such line became a row; they all carried the same name, "CUSIP:",
     * so the same-name dedup SUMMED them into one holding that does not exist
     * — HCA published $7,934,229,851 at 26.7% of the menu its 377,504
     * participants see, Home Depot $3,564,236,088 for 439,390. Where the
     * identifier shares its line with the tail of a wrapped name the fabricated
     * row took THAT as its name instead, so the class is not findable by name:
     * HCA's "LENDING  $658,991,351" is CUSIP 658991351 of the Russell 1000
     * Growth fund. The same line also glued into the NEXT row's name
     * ("CUSIP: 0039999K7 MFB NT COLLECTIVE LONG-TERM GOVERNMENT BOND INDEX").
     *
     * Store-wide before the fix: 34 published lineups / 453 rows / 47 plans /
     * 2,095,708 participants.
     *
     * The identifier is STRIPPED rather than the line dropped, because a real
     * holding may carry its ISIN at the end of its NAME line with the value
     * wrapping below ("IRON MTN INC NEW COM ISIN #US46284V1017"); dropping the
     * line would cost that row its name. A line that is NOTHING but an
     * identifier ends the name buffer, since it belongs to the row above and
     * is not part of the next row's name either. */
    {
      const idm = t.match(/(?:^|\s)(?:cusip|sedol|isin|cins|asset id|security id)\s*[:#]{0,2}\s*([0-9a-z]{6,12})\s*$/i);
      if (idm && /\d/.test(idm[1])) {
        const rest = t.slice(0, t.length - idm[0].length).trim();
        if (!rest) { nameBuf = []; continue; }
        t = rest;
      }
    }

    // a genuine holding can be worth $81 (R.H. White's T. Rowe Price 2010
    // fund, the last dollars of a wound-down vintage). The 3-digit floor
    // exists to stop stray digits on form pages faking rows, so lift it only
    // where the row proves itself a 4i data row: it carries an investment
    // TYPE column ("Mutual Fund", "Guaranteed Investment Contract") and a
    // real name ahead of it. Filings that hide such a row leave the shown
    // fund count one short of what was filed.
    let vm = t.match(valueRe);
    if (!vm && !opts.smallValues) {
      const sm = t.match(/\$?\s*([0-9]{1,2})\s*$/);
      if (sm && classify(t) && t.slice(0, t.length - sm[0].length).trim().length >= 12) vm = sm;
    }
    if (vm && totalWrap && t.slice(0, t.length - vm[0].length).trim().split(/\s+/).length <= 3) {
      totalWrap = false;
      continue; // the wrapped subtotal's value line — not a holding
    }
    totalWrap = false;
    if (!vm) {
      // short ALL-CAPS lines and bare type phrases ("MUTUAL FUNDS",
      // "Publicly-traded Common Stock") are section headers, not wrapped
      // fund names — don't glue them onto the next row
      if (/^[A-Z][A-Z\s/&,-]*$/.test(t) && t.split(/\s+/).length <= 4) { curSection = t; curIss = ""; nameBuf = []; continue; }
      if (t.split(/\s+/).length <= 5 && classify(t) && typeOnly(t)) { curSection = t; curIss = ""; nameBuf = []; continue; }
      // mixed-case class headers that AREN'T in the type vocabulary — adding
      // them to TYPE_PATTERNS re-typed Verizon's trustee class SUMMARY rows
      // ("CORPORATE STOCK - COMMON" $9.7B) into the managed-account bucket,
      // so the vocabulary lives only here, on valueless lines
      if (/^(corporate stocks?|collective funds?|common stocks?|preferred stocks?|registered investment companies)(\s*[-–]\s*(common|preferred))?$/i.test(t)) { curSection = t; curIss = ""; nameBuf = []; continue; }
      /* v103: A GROUP HEADER, not the first line of a wrapped name. Filings
       * that group a menu by manager print a valueless header row carrying the
       * house in the identity column and the type in the description column,
       * then indent the members beneath it:
       *
       *     * Vanguard                     Registered Investment Company
       *                                    Vanguard Target Retirement 2025 Fund   ...
       *
       * Treated as a wrapped name, that header glues onto every member row, so
       * `full` became "Vanguard Registered Investment Company Vanguard Target
       * Retirement 2025 Fund" and the type-phrase cut reduced it to "Vanguard"
       * — one name for the whole menu, which then merged into a single
       * holding. A line with BOTH a house identity and a type-only
       * description describes a group, never an investment, so it ends the
       * name buffer instead of joining it. Requires a real description column
       * (3+ space gap), so a genuinely wrapped name — which has no second
       * column on its first line — is untouched. */
      {
        const gh = splitNameDesc(t.trim());
        if (gh.descCol && typeOnly(cleanDesc(gh.descCol)) && isHouseName(gh.nameCol)) {
          curSection = gh.nameCol.trim(); curIss = ""; nameBuf = []; continue;
        }
        /* v158 part 2: the same group header in ONE cell and no colon —
         * `The Vanguard Group Mutual Funds`, `The Vanguard Group Collective
         * Investment Trusts`, `Other Collective Investment Trusts` — with the
         * members indented beneath it (ATH Holding / Elevance's 2023 filing,
         * 94,689 ppl). Read as a wrapped name it glued onto the first member
         * of each block, both blocks' first rows were named `The Vanguard
         * Group`, and they MERGED: a $1,793,711,087 holding that is exactly
         * Explorer Fund + Institutional 500 Index Trust, while `Institutional
         * 500 Index Trust` ($1.57B) vanished from the page. The house is the
         * issuer of the block, the tail is its type; `Other …` names no
         * issuer. */
        const one = t.trim().replace(/\s+/g, " ");
        const tail = one.match(ISS_TYPE_TAIL);
        if (tail && tail.index >= 3 && one.split(/\s+/).length <= 8) {
          const head = one.slice(0, tail.index).replace(/[\s,\-–—/:]+$/, "");
          if (/^other$/i.test(head) || isHouseName(head)) {
            curSection = tail[0].trim(); curIss = /^other$/i.test(head) ? "" : head; curIssIndent = curIss ? rawIndent : -1; nameBuf = []; continue;
          }
        }
      }
      /* v130: MEASURE THE TEXT, NOT THE COLUMN PADDING. The 90-char cap is a
       * prose guard, but `t` keeps the filing's inter-column whitespace, so a
       * two-column line whose cells total 52 characters measured 93 and was
       * dropped. Intermountain Health Care (86,655 participants, $6.83B) files
       *
       *   * T. Rowe Price            T. Rowe Price U.S. Small-Cap Value Equity
       *                                  Trust Class D                  23,614
       *
       * and the first line — the one carrying the fund's identity — was
       * discarded on padding alone, so four holdings published as "Trust",
       * "Class", "Trust Class D" and "Institutional Class", $1.35B of one
       * plan. Collapse the runs before measuring; prose is still caught. */
      if (t.replace(/\s+/g, " ").length < 90 && !/^\d+$/.test(t)) nameBuf.push(mkBuf(t, lead, rawNorm));
      if (TRACE_ROWS) console.error("[buf+]", lead, JSON.stringify(t.slice(0, 70)), "n=" + nameBuf.length);
      if (nameBuf.length > 3) nameBuf = nameBuf.slice(-3);
      continue;
    }
    if (TRACE_ROWS) console.error("[val ]", lead, JSON.stringify(t.slice(0, 70)), "buf=" + nameBuf.length);

    const value = +vm[1].replace(/,/g, "");
    // in millions mode a bare 4-digit trailing number in 1900-2100 is a
    // target-date year at the end of a fund name, not a value — real $2B
    // rows print with a thousands separator ("2,045")
    if (opts.smallValues && value >= 1900 && value <= 2100 &&
        !vm[0].includes(",") && !/\$/.test(vm[0])) { nameBuf = []; continue; }
    /* v130: THE SAME YEAR, ON A WRAPPED NAME LINE, IN FULL-DOLLAR MODE.
     * Owens Corning wraps every target-date fund across two lines and the
     * vintage lands at the end of the FIRST one:
     *
     *   *   Fidelity Freedom Blend 2010
     *        Fund, Class S            77,282 units   (a)    1,619,822
     *
     * "2010" matched valueRe, so the wrapped line was consumed as a $2,010
     * holding, the name buffer was cleared, and twelve vintages were published
     * as one row called "Fund, Class S" — $481,573,572, 36.9% of the plan
     * (PN 004) and 56.4% of its sister (PN 014). The name that identifies the
     * holding was thrown away by the line that was supposed to carry it.
     * Scoped to a line with NO column structure: a laid-out row keeps its
     * trailing number, so a genuine value can never be read as a vintage. */
    if (!opts.smallValues && value >= 1900 && value <= 2100 &&
        !vm[0].includes(",") && !/\$/.test(vm[0]) &&
        t.split(/\s{3,}/).filter(Boolean).length === 1 &&
        /[a-z]{3}/i.test(t.slice(0, t.length - vm[0].length))) {
      if (t.replace(/\s+/g, " ").length < 90) nameBuf.push(mkBuf(t, lead, rawNorm));
      if (nameBuf.length > 3) nameBuf = nameBuf.slice(-3);
      continue;
    }
    // no real holding reaches $100B (the largest master-trust interests are
    // ~$50B) — bigger "values" are pre-printed form watermark digits
    // ("123456789012" under the EIN boxes) or OCR garbage, and one such row
    // poisoned every candidate region containing it (ClinicalMind's merged
    // cluster summed to $1.6 QUADRILLION and the real menu could never win)
    if (value >= 1e11) { nameBuf = []; continue; }
    /* v69: BLANK-FORM PLACEHOLDERS. Every filing embeds the empty Form 5500
     * pages, which are pre-printed with sample text — "ABCDEFGHI ABCDEFGHI
     * AB, ST", "CITYEFGHI", and ascending digit runs (123456789,
     * 12345678901) in the value boxes. Honeywell's $12.5B plan stored ten of
     * these as a CONFIDENT lineup, top "holding" $12,345,678,901 at 99% of
     * the table: "Charlotte NC 28202ABCDE CITYEFGHI ABCDEFGHI AB, ST". The
     * existing >=1e11 cap was built for this class but sits above the
     * placeholders that matter. Both halves are unmistakable — no fund name
     * contains a run of the alphabet, and no holding is worth exactly
     * 1234567890 — so match either and drop the row, which also collapses
     * the region's score so a real schedule can win. */
    if (/ABCDEFGHI|CITYEFGHI|\bABCDE\b/.test(t) ||
        /^1234567890?1?2?$/.test(String(value)) || /^123456789$/.test(String(value)) ||
        /^12345$/.test(String(value))) { nameBuf = []; continue; }
    // prose sentences that happen to end in a number are not holdings.
    // Spaced dot-leaders (". . . .", the Costco class) are typography, not
    // words — counting them as words made every leadered holding without a
    // $ look like prose and silently emptied whole real menus.
    /* v73: PROSE HAS NO COLUMNS. Counting words across the WHOLE line made
     * the guard fire on wide 4i rows whose cells are individually short:
     * "* | GREAT GRAY CAP GROUP 2015 TARGET DATE TR CL CT | Common
     * Collective Trust | ** | 151,024" is 16 words and carries no $, so
     * every one of Ramos Oil's twelve target-date trusts was dropped as a
     * sentence. What was left summed to 31% of plan assets, and a
     * fair-value-hierarchy note table won the region on closeness — the
     * plan showed four class labels where 30 funds were filed.
     * A laid-out row is recognisable without reading it: three or more cells
     * separated by 3+ spaces. Prose reflowed by pdftotext has no such
     * structure, so it still meets the original whole-line test.
     * A per-cell word cap was tried first and had to go: broken font
     * encodings inject spaces INSIDE words, so "Ameri ca n Funds EuroPa ci fi
     * c Growth Fund Cl a s s R-6" counts sixteen. That cap was the same crude
     * sentence-detector one level down, and it cost Ebara seven holdings
     * worth $18.4M of a $53M plan. The columns are the better signal; trust
     * them. */
    const wordsIn = (s) => s.split(/\s+/).filter((w) => !/^\.+$/.test(w)).length;
    const cells = t.split(/\s{3,}/).filter(Boolean);
    const laidOut = cells.length >= 3;
    if (!laidOut && wordsIn(t) > 14 && !/\$/.test(t)) { nameBuf = []; continue; }
    let body = t.slice(0, t.length - vm[0].length).trim().replace(/^[*^]+\s*/, "");
    body = stripTrailingColumns(body);
    // a bare number with no name on the same line is a leaked year/page/column
    if (!body) { nameBuf = []; continue; }

    let { nameCol, descCol } = splitNameDesc(body);
    /* every buffered line plus the identity column, exactly as v129 assembled
     * it — kept so the branch where the description does NOT win reads the
     * row the way it always did, and no row can lose text the split moved */
    const fullAll = (nameBuf.filter((b) => !b.wide).map((b) => b.t).join(" ") + " " + nameCol).trim();
    /* v130: A WRAPPED LINE BELONGS TO THE COLUMN IT SITS UNDER.
     *
     * Every buffered line used to be treated as a wrapped IDENTITY, glued in
     * front of nameCol. That is right for Amgen's layout (v100) and wrong
     * whenever the DESCRIPTION column is the one that wrapped, because the
     * description then wins the name and the prefix is thrown away:
     *
     *                                    Intermediate Government Bond Index Non-
     *   BlackRock Institutional Trust    Lendable Fund            **   423,138,593
     *                                    Long Term Government Bond Index Non-
     *   BlackRock Institutional Trust    Lendable Fund            **   267,132,531
     *                                    MSCI ACWI ex-U.S. IMI Index Non-
     *   BlackRock Institutional Trust    Lendable Fund            **  2,856,964,964
     *
     * All three were published as "Lendable Fund" and the same-name dedup SUMMED
     * them: Walmart's 1,970,230 participants saw one $3,547,236,088 holding that
     * does not exist, and a $2.86B international index fund vanished from the
     * menu. Same shape, same filing: "US) Value Equity Fund" $1.83B is the
     * continuation line of "The Collective LSV International (ACWI EX US) Value
     * Equity Fund"; and where the wrap takes the WHOLE description, the leftover
     * glues onto the issuer instead — "Fiera Asset Management USA Collective SEI
     * Trust Company".
     *
     * The column offset tells the two apart with no vocabulary at all: a
     * description continuation starts at the description column, an identity
     * continuation at the identity column. Only single-cell lines qualify, so a
     * line that carries both columns is untouched. */
    let descPre = "";
    let idPre = "";
    {
      // a continuation after a hyphenated word rejoins without a space
      // ("...Index Non-" + "Lendable Fund" -> "...Index Non-Lendable Fund")
      const join = (a, b2) => !a ? b2 : !b2 ? a : (/\S-$/.test(a) ? a + b2 : a + " " + b2);
      const idParts = [];
      const preParts = [];
      const nameStart = lead;
      let buf = nameBuf;
      /* THE OTHER HALF OF THE SAME LAYOUT: the description wraps DOWNWARD and
       * the value rides on the continuation, so it is the VALUE line that is a
       * fragment and the line above that holds both columns:
       *
       *   * T. Rowe Price        T. Rowe Price U.S. Small-Cap Value Equity
       *                              Trust Class D                    23,614
       *
       * The value line's only cell sits under the description column of the
       * line above, never under the identity column, so the same offset test
       * settles it — and the identity comes back from the buffered line. */
      const last = buf.length ? buf[buf.length - 1] : null;
      /* v146 (queue item k): BOTH COLUMNS WRAP, AND THE VALUE RIDES ON THE
       * SECOND LINE OF EACH. Rush Copley (3,426 participants) files:
       *
       *     Vanguard Target                Vanguard Total International Stock Index
       *      Retirement Income              Fund Institutional Shares        52,582,061
       *
       * The value line carries two cells, so the single-cell down-wrap branch
       * below never fires; the buffered line has two cells, so the generic
       * branch calls it identity text; and the description column wins the
       * name — `Fund Institutional Shares`, three times, summed by the
       * same-name merge into one $109M row at 35% of the plan (the v100
       * shape; 17 plans / 29,009 ppl publish such a fragment at >=30%). When
       * the line above holds both cells at the same two column offsets, its
       * description is a wrap HEAD and the value line's description is NOT
       * (a class / vehicle fragment), each cell continues the cell above. */
      const dStart0 = descCol ? rawNorm.indexOf(descCol, nameStart + nameCol.length) : -1;
      // a description that OPENS with a vehicle / share-class word is a
      // continuation, whatever follows it: `Fund Institutional Shares`,
      // `Shares`, `Admiral Shares`, `Class R6`, `Trust II`
      const FRAG_HEAD = /^(?:fund|funds|shares?|class|cl|institutional|investor|admiral|inst|premium|select|series|portfolio|trust|units?|r\d|[a-z])\b/i;
      if (nameCol && descCol && last && last.desc && last.name && last.dcol >= 0 && dStart0 >= 0 &&
          Math.abs(dStart0 - last.dcol) <= 3 && Math.abs(lead - last.col) <= 3 &&
          /[a-z]{3}/i.test(last.desc) && wrapHeadOk(last.desc) && (!wrapHeadOk(descCol) || FRAG_HEAD.test(descCol))) {
        descPre = last.desc;
        descCol = join(last.desc, descCol);
        nameCol = join(last.name, nameCol);
        buf = buf.slice(0, -1);
        for (const b of buf) if (!b.wide) idParts.push(b.t);
      } else if (nameCol && last && last.desc && last.name &&
          last.dcol >= 0 && lead >= last.dcol - 3 && lead <= last.dcol + 10 &&
          /[a-z]{3}/i.test(last.desc) && wrapHeadOk(last.desc)) {
        /* anything still to the right of the continuation is a cost/units
         * column ("-$0-", "(a)", "242,648 units"); keep it only if it carries
         * words, since cleanDesc can then strip it as a type phrase */
        const tail = descCol && /[a-z]{3}/i.test(descCol) ? descCol : "";
        descPre = last.desc;
        descCol = join(join(last.desc, nameCol), tail);
        nameCol = last.name;
        buf = buf.slice(0, -1);
        for (const b of buf) if (!b.wide) idParts.push(b.t);
      } else {
        const dStart = descCol ? rawNorm.indexOf(descCol, nameStart + nameCol.length) : -1;
        for (const b of buf) {
          if (b.wide) continue;             // v129 never saw this line; only the
                                            // down-wrap branch above may use it
          const single = !/\s{3,}/.test(b.t);
          const aligned = single && (dStart > nameStart + 3
            ? Math.abs(b.col - dStart) <= 3
            // no description on the value line: the wrap took all of it, so the
            // buffered line only has to sit clear to the RIGHT of the identity
            : !descCol && b.col >= nameStart + nameCol.length + 3);
          /* only the HEAD of a wrap has to prove itself: once a line is
           * accepted, the lines under it are its continuation. Walmart wraps
           * "Cohen & Steers Global Listed Infrastructure" / "Fund" over two
           * lines, and judging the second one alone throws away the word that
           * finishes the name. */
          if (aligned && b.t.length <= 70 && (preParts.length || wrapHeadOk(b.t))) preParts.push(b.t);
          else if (!aligned) idParts.push(b.t);
        }
        descPre = preParts.reduce((a, b2) => join(a, b2), "");
        if (descPre) descCol = join(descPre, descCol);
      }
      idPre = idParts.join(" ").trim();
      /* v132: THE DESCRIPTION SITS ABOVE, SEPARATED BY BLANK LINES.
       *
       * Everything above reunites a wrap that is ADJACENT to the value line.
       * One recordkeeper template (5 of the 6 filings read for this class)
       * leaves three or four blank lines between the fund name in column (c)
       * and the identity+value line, and a blank line clears the buffer — so
       * the name never reaches the row and every row falls back to the
       * IDENTITY column, which holds only the fund family. The vintages then
       * merge on that shared name: Bell Nursery published `Vanguard` at
       * $13,206,249 = 95.2% of the plan, Hufriedy, Northeast Security,
       * Mountville Mills and Metropolitan Family the same way.
       *
       * Deliberately the narrowest rule that covers it, because carrying text
       * across a blank line is what v103's glued group header did wrong:
       *   - it fires ONLY when the row's own name would be a bare HOUSE NAME
       *     and the row's own description says nothing (absent or type-only),
       *     so a row that names its own fund can never be touched;
       *   - the orphan must be a single cell sitting clear to the RIGHT of the
       *     identity column — i.e. in the description column — and must pass
       *     `wrapHeadOk`, the same head test the adjacent wrap uses;
       *   - a non-blank line consumes it, so it reaches at most one row.
       * The house then lands in `iss` exactly as in the adjacent-wrap case,
       * so nothing is lost: the row reads "Vanguard · Target Retirement 2035". */
      const ncGap = ((idPre ? idPre + " " : "") + nameCol).trim();
      if (!descPre && gapIn && nameCol && isHouseName(ncGap) &&
          (!descCol || typeOnly(cleanDesc(descCol))) &&
          !/\s{3,}/.test(gapIn.t) && gapIn.t.length <= 70 &&
          gapIn.col >= lead + nameCol.length + 3 &&
          /[a-z]{3}/i.test(gapIn.t) && wrapHeadOk(gapIn.t) &&
          /* page furniture sits in the same column band as the description and
           * would otherwise pass wrapHeadOk ("Page 3 of 12", "Tax Number:
           * 954659692", "December 31, 2024"). The row-level filters already
           * exist; the orphan has to face them too. */
          !SKIP_ROW.test(gapIn.t.trim()) && !JUNK_NAME_RE.test(gapIn.t) &&
          !DATE_LINE.test(gapIn.t.trim())) {
        descPre = gapIn.t;
        descCol = gapIn.t;
      }
    }
    /* what the identity column alone says, which is what decides WHICH column
     * names the fund (v100 judges the whole identity, not its last line) */
    const full = ((idPre ? idPre + " " : "") + nameCol).trim();
    nameBuf = [];
    // wrapped subtotals ("Total Registered Investment" ↵ "Companies  613,913,288")
    // defeat the line-level ^total filter — catch them once assembled
    if (/^(sub|grand )?total\b/i.test(fullAll)) continue;
    /* NO second ^total test on the reunited description, and that is
     * deliberate: the first draft of v130 added one, and it deleted IBM's
     * $9,827,773,829 "Total Stock Market Index (refer to Exhibit P)" and RW
     * Baird's $564,229,235 "Total Bond Market (Refer to Exhibit J)" — 17.8% of
     * a $64B plan — because both real funds begin with the word Total. v70
     * measured this exact hazard on the identity column ("Total Return Bond
     * Fund Class I") and the lesson transfers. */
    /* v130: classify the row as REUNITED. Ramos Oil files
     *   * PARTICIPANT LOANS   Interest rates range from 3.25% to 8.50%,
     *                           maturing through March 2043   -$0-   205,746
     * and v129 saw only the orphaned second line, so the loan classifier never
     * fired and "maturing through March 2043" was published as a $205,746
     * holding. The words that identify the row are in the identity column of
     * the line above; feed them in. */
    /* Appended only when it says something fullAll does not: REPEATING a cell
     * breaks anchored patterns, and the first draft duplicated "Brokerage
     * accounts" into "Brokerage accounts Brokerage accounts", which stopped
     * USAA's $323.9M row classifying as a self-directed brokerage account at
     * all — 52,789 participants would have lost the brokerage-window flag. */
    const type = classify([descCol, fullAll, fullAll.includes(full) ? "" : full]
      .filter(Boolean).join(" "));
    if (type === "SDBA") { sdba = true; rows.push({ name: "Self-Directed Brokerage Account", type: "Brokerage window", value }); continue; }
    if (type === "Participant loans") continue;

    // Prefer the description column when it names the fund; many filings put
    // the manager in the issuer column and the actual fund in the description.
    let dClean = cleanDesc(descCol);
    /* v160: the description this row's IDENTITY beat, kept so the dedup can
     * tell two holdings apart that the filing distinguished — see the key
     * below. Cleared per row. */
    let rejDesc = "";
    /* v69: DUPLICATED IDENTITY COLUMN. Trustee-generated schedules often print
     * (b) and (c) as the SAME text, and when the security's own name contains a
     * wide gap the row splits mid-name:
     *   "BRITISH COLUMBIA(PROVINCE OF)CANADA 1.3%    01-29-2031    <same again>"
     * splitNameDesc then hands back nameCol = "...1.3%" and descCol =
     * "01-29-2031 ...1.3% 01-29-2031", which is letter-rich enough to be
     * preferred — so MetLife's $8.3B plan stored 58 holdings each wearing its
     * maturity date as a PREFIX ("01-29-2031 BRITISH COLUMBIA..."). A
     * description that merely repeats the identity carries no information the
     * identity lacks, so the identity wins and the glue never happens. */
    if (dClean && nameCol && nameCol.length >= 12) {
      const a = dClean.toLowerCase().replace(/\s+/g, " ");
      const b = nameCol.toLowerCase().replace(/\s+/g, " ");
      /* The test is NOT "does the description contain the identity" — that is
       * the ordinary and correct "American Funds | Growth Fund of America R6"
       * layout, where the description is the informative half and must win.
       * (The first version of this check used containment and collapsed
       * Plexsys's menu from 32 rows to 3 manager names; the gate caught it.)
       * The duplicate case is narrower: removing the identity from the
       * description leaves no WORDS behind, only dates and punctuation. */
      if (a.includes(b)) {
        /* v104: A VINTAGE IS INFORMATION. The residue test asked whether any
         * LETTERS survived removing the identity from the description, which
         * is right for v69's case — "01-29-2031 BRITISH COLUMBIA…1.3%
         * 01-29-2031", where the residue is the same maturity date twice and
         * carries nothing. It is wrong for the commonest target-date layout
         * there is:
         *
         *     American Funds     American Funds 2010 R6
         *     American Funds     American Funds 2015 R6
         *
         * The residue "2010 r6" has exactly one letter, so the description was
         * blanked and every vintage fell back to the house. All twelve then
         * merged on the name "American Funds" into one holding worth 43% of
         * W. L. Gore's $2.0B plan. Measured across published lineups: 273
         * plans and $10.3B carry a row named only after a house holding at
         * least a quarter of the lineup.
         *
         * So strip what v69 actually meant by "no information" — dates and
         * rates — and then ask whether anything identifying is left. A
         * four-digit year or a share-class token is as distinguishing as a
         * word: it is the entire difference between one vintage and the next. */
        const residue = a.split(b).join(" ");
        const stripped = residue
          .replace(/\d{1,2}\s*[-\/]\s*\d{1,2}\s*[-\/]\s*\d{2,4}/g, " ")   // 01-29-2031
          .replace(/\d+(?:\.\d+)?\s*%/g, " ")                              // 1.3%
          .replace(/\bdue\b|\bmaturing\b/g, " ");
        const letters = stripped.replace(/[^a-z]/g, "").length;
        const vintage = /(?:19|20)\d{2}\b/.test(stripped) || /\b[a-z]{1,3}\d{1,2}\b/.test(stripped);
        if (letters < 4 && !vintage) dClean = "";
      }
    }
    let name;
    let iss = null;
    /* v70: the 8-LETTER FLOOR was silently renaming 12,850 rows after the
     * manager. Great Gray files a textbook two-column schedule —
     *   "Great Gray  |  Index 2040 R  |  **  |  12,945,215"
     * — but "Index 2040 R" carries only six letters, so the description was
     * rejected and the row fell back to the identity column: the fund became
     * "Great Gray", and so did the twenty other vintages beside it. Measured
     * universe-wide: 12,850 rows across 5,392 entries (8.3%) are named
     * nothing but a manager — Vanguard 1,928, Fidelity 1,827, American Funds
     * 1,342. A target-date vintage is exactly the kind of real fund whose
     * name is mostly digits, so the floor was excluding the names it should
     * have been protecting. When the identity column is SHORT (<=3 words,
     * i.e. a house name rather than a fund name) a description of four-plus
     * letters that carries a digit or a second word is the product, and the
     * house belongs in `iss` where v67 put it. */
    /* An identity column is a HOUSE NAME when it is short, or when it ends in
     * an institution suffix — "Great Gray Trust Company" is four words and was
     * missing the <=3 test, so its funds kept falling back to the house.
     * This only decides WHICH COLUMN WINS; it never drops a row, so employer
     * stock ("Genuine Parts Company", "Hess Corporation" — measured as 3,034
     * institution-suffixed names, many of them real holdings) is untouched:
     * those rows carry a type-only description and keep their own name. */
    /* v100: JUDGE THE WHOLE IDENTITY, NOT THE LAST LINE OF IT. These two
     * predicates decide whether the identity column names a product or merely
     * a house, and they were reading `nameCol` — the fragment that happens to
     * sit on the VALUE line — while the name actually used is `full`, which
     * includes the wrapped prefix accumulated in nameBuf.
     *
     * Amgen files its collective trusts wrapped:
     *     NT Collective Russell 3000 Index Fund / Non
     *     Lending*            Collective Trust Fund 22,328,542 units   2,073,570,958
     * `full` is right ("NT Collective Russell 3000 Index Fund / Non Lending"),
     * but `nc` was "Lending*" — one word, no digit, no fund/trust token — so
     * the identity was judged not-a-product, the generic description won, and
     * the row was named "Collective Trust Fund". Six such rows then merged on
     * that shared name into ONE holding of $3,587,717,422, 47% of the plan's
     * shown assets, displayed as a fund that does not exist. Sister rows
     * survived only because their fragment happened to contain "Fund" or
     * "Trust" ("Ex/US Fund / Non Lending*", "Investment Trust II*"), which is
     * how the same menu ended up half right.
     *
     * `full` always contains nameCol, so this widens what the predicates see;
     * it never narrows it. */
    const nc = (full || nameCol || "").trim();
    const shortIdentity = nc && (nc.split(/\s+/).length <= 3 ||
      (/\b(?:trust (?:company|co)|bank|advisors?|asset management|investments?)\.?$/i.test(nc) && nc.split(/\s+/).length <= 5));
    const dLetters = dClean.replace(/[^a-z]/gi, "").length;
    /* A CATEGORY phrase in the description is only worth discarding when the
     * identity actually names a product. "BLACKROCK LIFEPATH INDEX 2030 K |
     * Target-date retirement" should keep the fund; "Vanguard | Target Date
     * Retirement" must NOT collapse to "Vanguard" — that is the bare-manager
     * defect v70 fixed, and the first version of the category list
     * reintroduced it. Measured: 1,642 rows carry a Morningstar-style
     * category as the name, and they split in two — some have the whole fund
     * in the identity, others only the house. Where only the house is there,
     * "Vanguard · Mid Cap Growth" is the most the filing gives, and the
     * existing rendering already says exactly that. */
    const identityIsProduct = nc && (/\d/.test(nc) || nc.split(/\s+/).length >= 3 ||
      /\b(?:r[1-6]|k\d?|adm|inv|instl?|idx|index|fund|trust|pool)\b/i.test(nc));
    const catDesc = dClean && CATEGORY_PHRASE.test(
      String(dClean).replace(/\s+[\d,]{3,}(?:\.\d+)?\s*(?:\(\d+\))?\s*$/, "").trim());
    /* v102: A CATEGORY DESCRIPTION MAY ONLY BEAT A HOUSE, NOT A SHORT FUND.
     *
     * `!identityIsProduct` was standing in for "the identity is only a house
     * name", but it actually tests word count and fund-ish tokens, so any
     * SHORT REAL FUND NAME failed it. SAP America files its menu as a group
     * header with indented members:
     *
     *     (*)  Vanguard Funds:
     *            Emerging Markets Stock Index   Registered investment company
     *            Explorer                       Registered investment company
     *            Wellington                     Registered investment company
     *            Windsor II                     Registered investment company
     *
     * "Emerging Markets Stock Index" survives on word count; "Explorer",
     * "Wellington" and "Windsor II" do not, so they were all renamed
     * "Registered investment company" and merged on that shared name into one
     * row — 26% of a $9.2B plan, a fund that does not exist. Third distinct
     * cause of the same fabrication after v100 and v101.
     *
     * The real question was never length, it is whether the identity names a
     * FIRM. So ask that directly. v70 measured the opposite failure — 12,850
     * rows renamed after their manager because the description was rejected,
     * Vanguard 1,928, Fidelity 1,827, American Funds 1,342 — so the houses
     * that caused it are named explicitly and keep their v70 behaviour:
     * "Vanguard | Target Date Retirement" still yields the category, because
     * there the identity really is just the firm. */
    const dUsable = dClean && (!typeOnly(dClean) || (catDesc && isHouseName(nc))) &&
      (dLetters >= 8 ? dClean.split(/\s+/).length >= 2
        : shortIdentity && dLetters >= 4 && (/\d/.test(dClean) || dClean.split(/\s+/).length >= 2));
    if (TRACE_ROWS && traceHit(value, nameCol, descCol, dClean, full)) {
      console.error(`[row] value=${value}
   nameBuf = ${JSON.stringify(nameBuf)}
   nameCol = ${JSON.stringify(nameCol)}
   descCol = ${JSON.stringify(descCol)}${descPre ? `   (descPre ${JSON.stringify(descPre)})` : ""}
   full    = ${JSON.stringify(full)}
   dClean  = ${JSON.stringify(dClean)}  typeOnly=${dClean ? typeOnly(dClean) : "-"} catDesc=${!!catDesc} house=${isHouseName(nc)}
   -> name from ${dUsable ? "DESCRIPTION" : "IDENTITY"}`);
    }
    /* Only a NAME-SHAPED rejected description may disambiguate. Wells Fargo's
     * bond sleeve rejects `4.337%, $16,135,030 par (1` as its description, and
     * appending that to a name publishes a par amount as part of a holding —
     * the value-in-name shape. Letters, ordinary punctuation, no money, no
     * rate, nothing longer than a fund name. */
    /* v161: ...and only where the IDENTITY that beat it is a HOUSE. That is
     * the template this rule was built for (Mass General Brigham: house in
     * column (a), fund in column (c)), and confining it there is what keeps it
     * from touching anything else. v160 applied it to every row and cost
     * Hozhoni Foundation a real 34-row T. Rowe Price menu: the region still
     * scored the same, but a split inside the MENU candidate disqualified it
     * as `bestMenu`, the post-selection swap that had been rescuing the plan
     * stopped firing, and a 2-row Ameritas region won on closeness. A rule
     * that changes which REGION wins is doing something other than what its
     * description says. */
    if (!dUsable && dClean && isHouseName(nc) && /^[A-Za-z][A-Za-z0-9 .,&'()\/-]{1,40}$/.test(dClean) &&
        !/[$%]|\bpar\b|\d{4,}/i.test(dClean)) rejDesc = dClean;
    if (dUsable) {
      name = dClean;
      /* v67: KEEP the identity column instead of discarding it. This branch
       * is exactly where "Vanguard | Institutional 500 Index Trust D" lost
       * its Vanguard — 25+ billion-dollar filings confirmed by hand in the
       * 2026-08-24 test cycles, and the loss is worse than a missing ticker:
       * Harley-Davidson filed "Interest Held in Master Trust" in this column
       * with only "Various (includes Registered..." in the description, so
       * every master-trust guard keyed on those words passed the wreckage.
       * The issuer is stored as its own field (iss), never merged into the
       * name: names stay byte-identical to v66, so dedup keys, region
       * scores, confidence and the parser gate are untouched by design.
       * Kept only when it is name-shaped: not a type phrase ("Registered
       * Investment Company" is a TYPE-first layout, not an issuer), not
       * numeric residue, not a duplicate of the fund name itself. */
      const cand = full.replace(/\s{2,}/g, " ").trim();
      if (cand && cand.length >= 3 && cand.length <= 60 &&
          cand.split(/\s+/).length <= 7 &&
          cand.replace(/[^a-z]/gi, "").length >= 3 &&
          !/^[\d$*(]/.test(cand) && !typeOnly(cand) &&
          !/^(see attached|see accompanying|various|note \d)/i.test(cand) &&
          cand.toLowerCase() !== name.toLowerCase() &&
          !name.toLowerCase().includes(cand.toLowerCase())) {
        iss = cand;
      }
    } else {
      /* the description did NOT win, so the row is named from the identity
       * column — and there a wrapped description line is still the only extra
       * text the row has. Keep v129's reading verbatim (fullAll) so this
       * branch cannot lose anything the column split moved. */
      const base = fullAll;
      name = base;
      for (const [re] of TYPE_PATTERNS) {
        const m = base.match(re);
        if (m && m.index > 3) {
          const cut = base.slice(0, m.index).replace(/[-–—,\s]+$/, "");
          // only strip a type phrase when a real name remains — "BlackRock
          // Short-Term Investment Fund" must not shrink to "BlackRock".
          // "U. S. GOVERNMENT SECURITIES" splits into two "words" but its
          // cut is letter-poor punctuation — keep the full name so the
          // residue filter below doesn't silently drop the row (Verizon
          // Master Savings Trust summary lost its $2.77B govt row this way).
          // EXCEPT when the letter-poor cut is column glue swept into the
          // name cell ("6,793,341 $ 6,793,341 $ - $ -", "$ $ $ $",
          // "2020 2019 |"): those are statement fragments, and keeping them
          // let junk statement regions outscore real 4i tables — surface
          // the cut so the residue filter drops the row as it did pre-v32.
          if (cut.split(/\s+/).length >= 2) {
            if (cut.replace(/[^a-z]/gi, "").length >= 3) { name = cut; break; }
            if (/[$|]|\d,\d{3}/.test(cut)) { name = cut; break; }
          }
        }
      }
      if (name.length < 3) name = base;
      /* v147: A HOUSE PLUS A TYPE-ONLY PRODUCT PHRASE IS THE FUND'S NAME.
       * "Invesco | Stable Value Fund" and "TIAA | Money Market-Rtmt" name a
       * product; the description reads as type-only ("stable", "fund" are
       * type words), the identity wins, and the row publishes as the bare
       * house — the v104 family. v146's `N/R` strip exposed 121 such rows /
       * 102 plans / 267,852 ppl that the trailing marker had kept from
       * reading as type-only. Compose the two when the identity is a house
       * and the phrase is a product, not a class label ("Mutual funds"). */
      if (dClean && nc && isHouseName(nc) && !identityIsProduct && typeOnly(dClean) &&
          !GENERIC_TYPE_NAME.test(dClean) && !CATEGORY_PHRASE.test(dClean) &&
          !GENERIC_TYPE_ANY.test(dClean) && dClean.split(/\s+/).length >= 2 &&
          dClean.replace(/[^a-z]/gi, "").length >= 8 && !/\d{3,}/.test(dClean) &&
          !new RegExp("^" + nc.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\b", "i").test(dClean)) {
        name = `${nc} ${dClean}`.replace(/\s+/g, " ").trim();
      }
    }
    // Drop non-name residue like "9.50 percent" (wrapped loan-rate lines)
    if (name.replace(/\bpercent\b|\bto\b/gi, "").replace(/[^a-z]/gi, "").length < 3) continue;
    if (!name || name.length < 4) continue;
    // date fragments assembled from wrapped heading lines
    if (/(january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{1,2}\b/i.test(name)) continue;
    // "Artisan Mid Cap Account Total" style subtotal rows would double-count
    // the component rows above them; "Page subtotal" survives arithmetic
    // detection when the page holds skipped rows (loans)
    /* v70: the trailing-total guard was SINGULAR. "Investment Totals" — a
     * subtotal — survived it, and because a subtotal repeats the value of
     * everything above it, the region sum doubled and its coverage ratio hit
     * 1.94, which cost the plan its whole 24-fund target-date menu. Found by
     * reading v69's losses: what looked like a lost menu was a FOUND menu
     * that one plural word disqualified.
     * ONLY the trailing form is added. An anchored "^totals?" was tried and
     * immediately dropped "Total Return Bond Fund Class I" — PIMCO, Met West
     * and Baird all run funds by that name. (SKIP_ROW's line-level "^total"
     * has the same hazard and predates this; it needs its own measurement
     * before anyone touches it.) */
    if (/\btotals?\s*$/i.test(name) || /^page (sub)?totals?\b/i.test(name.trim())) { nameBuf = []; continue; }
    /* v69: a leading bare maturity date is column glue, never the start of a
     * security's name ("01-29-2031 BRITISH COLUMBIA..."). Backstop for the
     * duplicated-column fix above, since other layouts reach the same shape. */
    name = name.replace(/^(?:\d{1,2}[-\/]\d{1,2}[-\/]\d{2,4}|\d{4}-\d{2}-\d{2})\s+(?=\S)/, "");
    /* v74: a leading number EQUAL to the row's own value is the share column,
     * not part of the name. Money-market and stable-value funds hold units at
     * $1.00, so shares and dollars coincide and the count lands in front of
     * the name: "12,553,193 Money Market Fund", "8,669,840 FIDELITY BANK TRUST
     * SHORT TERM INVESTMENT FUND", "299,638.1700 Par Value Money Market Fund".
     * 80 rows across 57 entries, 56 of them confident — and reading them, the
     * HOLDINGS ARE REAL. This is a naming fix, so the row and its value stay;
     * only the prefix goes, and region sums are untouched by construction.
     * A unit word left stranded by the strip goes with it. */
    let leadStripped = 0;
    {
      const lead = name.match(/^([\d,]{4,})(?:\.\d+)?\s+(?=\S)/);
      if (lead && Number(lead[1].replace(/,/g, "")) === value) {
        name = name.slice(lead[0].length)
          .replace(/^(?:sh\.?|shares?(?:\s+of)?|units?|par value)\s+(?=\S)/i, "");
        leadStripped = 1;
      }
    }
    name = name.replace(/\s*\*+\s*$/, ""); // trailing footnote markers
    // OCR reads an empty cost-column dash as "=" glued to the name's tail
    // ("Fidelity TRIM 2030 Trust Company ="). ONLY "=": a trailing "~" run
    // is a Form-5500 dotted LEADER (pdftotext renders "......" as tildes)
    // and condemns its row downstream — stripping it admitted a Teamsters
    // form-page line at $452k; hyphens are the same trap
    // (v108, Compass image-table class)
    name = name.replace(/[\s=]+$/, "");
    // wrapped lines carry their column gaps into the assembled name
    name = name.replace(/\s{2,}/g, " ");
    /* v148 (queue item (f) A1, the rest of the parser half): a house that
     * opens the name TWICE is the identity glued in front of a description
     * that already carries it — "Fidelity Fidelity 500 Index", "American
     * Funds American Funds 2040 Target Date Fund", "VOYA Voya Fixed Account".
     * v146's footnote-letter fix covered one template; 202 plans / 375,590
     * ppl / 760 rows still publish the doubling by other routes (several via
     * prior-year fallbacks that cannot be traced in-sandbox). The display
     * strip has shipped this exact expression since 2026-09-18; the store
     * now says the same. Up to three words, and a real word must follow. */
    name = name.replace(/^((?:\S+\s+){0,2}\S+)\s+\1(?=\s+\S)/i, "$1");
    /* v74: the EFAST2 placeholder guard, applied to the ASSEMBLED NAME.
     * The line-level test above only sees the line carrying the VALUE, and on
     * a rendered form page the placeholder text and the number are on
     * different lines. The sponsor's address block wraps —
     *     738 ABCDEFGHI
     *     c/o NE Davis St
     *     Portland      OR  97232        624100
     * — so the first two lines buffer as a wrapped name and "624100" becomes
     * its value. That number is the NAICS BUSINESS CODE from box 2d, not a
     * dollar amount (624100 = Individual and Family Services; 623000, 623110,
     * 541330 and friends show up the same way).
     * Measured: 411 rows across 410 entries, 390 of them CONFIDENT, and every
     * sample is a sponsor address block. Nothing legitimate contains a run of
     * the alphabet, so the name is enough to condemn the row. */
    if (/ABCDEFGHI|CITYEFGHI|\bABCDE\b/.test(name + " " + (iss || ""))) { nameBuf = []; continue; }
    // "N/A" is the cost column (col d) gluing onto the name — 20k+ stored
    // names carried it ("500 Index Fund N/A"); note references are auditor
    // cross-refs, not part of the fund's name ("... (see Note 5)")
    name = name.replace(/(^|\s)N\/A(?=\s|$)/gi, " ")
      .replace(/\s*\(\s*(see\s+)?notes?\s+[^)]{1,16}\)\s*$/i, "")
      // a lone trailing "0" is a glued zero-cost column (double-rendered
      // schedules, Plexsys class) — with it stripped, both renditions
      // produce the same name and the same-value dedup collapses them
      .replace(/\s+0$/, "")
      // trailing footnote-column residue: "Target date fund #",
      // "Interest in Eaton Stable Value Fund - See" (wrapped "- See
      // Footnote 1" cross-ref) — never part of the fund's name
      .replace(/\s+#$/, "")
      .replace(/\s*[-–—]\s*see$/i, "")
      .replace(/\s{2,}/g, " ").trim();
    if (!name || name.length < 4) continue;
    /* v70: the 4i COLUMN HEADER, wrapped and parsed as a holding. 459 stored
     * rows begin with a fragment of "(b) identity of issue, borrower, lessor
     * or similar party | (c) description of investment including maturity
     * date, rate of interest, collateral, par, or maturity value". SKIP_ROW
     * catches the header when it starts a line, but a wrapped continuation
     * starts mid-phrase ("party date,rate of interest, collateral, par, or
     * maturity"). STRIP rather than drop: one in this class reads "par, or
     * maturity value Fidelity Government" — the header ran into the next
     * row's real name, so removing the header RECOVERS the fund. */
    /* Strip ONLY when the row actually opens with unmistakable header text —
     * "party date", "rate of interest", "maturity value", "identity of
     * issue". The first version stripped each header word independently and
     * had no word boundary, so "Parnassus Core Equity Fund" became "nassus
     * Core Equity Fund" and a full header line eroded to "maturity". The gate
     * caught both. Requiring the phrase before touching anything makes the
     * strip safe: a fund whose name merely starts with "Par" is not a header. */
    /* v139: three shapes leaked past the v70 trigger, measured on the v138
     * store — "maturity date <fund>" (440 rows: the caption's "including
     * maturity date" wrapped with the last two words alone), "Par or Maturity
     * Value <fund>" (20: no comma, which `par\s*,` required), and "of
     * Investment Cost Value <fund>" (10: the caption's SECOND line, which
     * "description of investment" never matched). A "(b) "/"(c) " column
     * letter also defeated `^[^a-z]*` because "b" is a letter (9 rows). */
    if (/^(?:\(?[a-e]\)\s*)?[^a-z]*(?:(?:similar\s+)?party\s+date|rate of interest|(?:including\s+)?maturity (?:value|date)|par\s*,?\s*(?:or\s+)?maturity|identity of issuer?|(?:description\s+)?of investment|cost\s+value|current\s+value)/i.test(name)) {
      const stripped = name
        .replace(/^(?:\(?[a-e]\)|(?:similar\s+)?party\b|\bdate\b|\bincluding\b|\brate of interest\b|\bcollateral\b|\bpar\b|\bor\b|\bmaturity (?:value|date)\b|\bidentity of issuer?\b|\bborrower\b|\blessor\b|\bdescription of investment\b|\bof investment\b|\bcost value\b|\bcurrent value\b|\bcost\b(?=\s+value\b)|\(\$\)|[\s,()])+/i, "")
        .trim();
      /* And the REMAINDER must not itself be header vocabulary: a truncated
       * header ("...par, or maturity") erodes to the bare word "maturity",
       * which is 8 characters of nothing. */
      if (stripped.length >= 4 && /[a-z]{3}/i.test(stripped) &&
          !/^(?:maturity|value|par|interest|collateral|date|issue|investment|borrower|lessor)s?$/i.test(stripped)) name = stripped;
      else { nameBuf = []; continue; }
    }
    if (!name || name.length < 4) { nameBuf = []; continue; }
    /* v70: participant-LOAN prose. 758 stored rows are the wrapped text of a
     * loan row's description ("Interest rates ranging from 4.25% to 9.50%",
     * "maturing at various dates through October 2034", "from participants
     * ranging from..."). The loan row itself is excluded by type; these are
     * its runaway continuation lines, and they name nothing. */
    if (/^(?:from participants|maturing at various|various maturity|interest rates? ranging|bearing interest at|range from \d{4}|collateralized by|secured by participants|with various maturity)/i.test(name)) { nameBuf = []; continue; }
    /* v131: THE SAME CLASS, UNANCHORED — and it is 6,937 published plans /
     * 12.7M participants, not the 758 rows v70 could see. The guard above is
     * anchored at the start of the name, and a loan row's description arrives
     * with anything at the front: "October 2029 at interest rates ranging from
     * 4.25% to 9.50% $" is 96.5% of The Haddad Organization's $58.2M plan and
     * sits above its ten real Vanguard funds; Adient publishes THREE of them
     * ("3.25% - 8.50% maturing through 2032.") and one real row. Read from the
     * store, 25 random members of this population were 25 loan rows.
     * The test is what the name is MADE of rather than where it starts: loan
     * language present, no security identity, and nothing left once rates,
     * dates and repayment vocabulary are removed. That residue rule is what
     * keeps the real holdings whose names contain the same words — "Putnam
     * Retirement Advantage Select Maturity R", "FNR 2017-11 KA, FANN, Expected
     * Maturity 2025", "or maturity value AB DISCOVERY GROWTH Z" — all of which
     * the first draft of this predicate dropped. */
    if (isLoanNoteName(name)) { nameBuf = []; continue; }
    /* v135: prose, not a holding — see isProseRowName. Dropped at the same
     * site and for the same reason as the loan-description rows: the value
     * belongs to something the filing names elsewhere, and publishing the
     * sentence fragment attaches money to a holding that does not exist. */
    if (isProseRowName(name)) { nameBuf = []; continue; }
    /* v70: SUBTOTALS HIDDEN BY SPACED-LETTER DAMAGE. Some PDFs extract with
     * letters scattered — "Tota l mutua l funds", "Tot al cont r i but i ons",
     * "To tal In ve stm e n t A sse ts" — and the damage carries the row
     * straight past every ^total guard. 58 such rows are stored, and a
     * subtotal is worse than a bad name because it DOUBLE-COUNTS the rows it
     * summarises. Fire only on the damage signature: removing all spaces
     * reveals a leading "total", AND the raw name contains a single-letter
     * word. A genuine fund ("To Talent Fund") squashes to "totalent" but has
     * no lone letter, so it is untouched. The lone letter must appear in the
     * first THREE tokens, where damage to the word "total" would land: a
     * trailing share class is not damage, and requiring it anywhere in the
     * name dropped "Vanguard | Total Return Bond Fund Class I" on the "I".
     * That is the hazard flagged when this class was first left alone —
     * "Class A", "Fund I", "TR B" — walked into one rule later. */
    /* grand/net variants too: "Gra nd tota l" squashes to "grandtotal", which
     * a bare ^total test misses. */
    /* v73: the short token must be part of the DAMAGED WORD, not merely near
     * it. "first three tokens" was a proxy for "inside the word total", and
     * it went wrong the moment a fund's own name began with Total and used a
     * two-letter abbreviation: "Vanguard | Total Intl Bd Idx Admiral" died on
     * "Bd", and with it went Reliance One's whole 30-fund menu — losing that
     * $5,394 row broke the arithmetic subtotal detector downstream (the
     * "Mutual funds, at fair value" subtotal no longer equalled the rows
     * above it), the region doubled to ratio 1.95, and a four-row class-label
     * table won instead. "Total Bd Idx", "Total US Bond", "Total Intl Bd" are
     * ordinary recordkeeper abbreviations of the most widely held funds in
     * the country.
     * The damage signature is exact: the word "total" is SPLIT, so the
     * fragments spelling it are themselves short. Consume only the leading
     * tokens that spell the matched word and look for damage there. An
     * undamaged "Total …" spells it in one token and can never match. */
    /* Form 5500 line items, not holdings: "5 Total number of participants at
     * the beginning of the plan year   5   439,390" leads with the line
     * number, so SKIP_ROW's line-anchored ^total never sees it. The old
     * spaced-letter rule swallowed it by accident, on the "of" — narrowing
     * that rule to real damage means naming this class properly. No fund is
     * called "Total number of …". (Howmet's stored lineup carries one of
     * these today; this removes it there too.) */
    if (/^total\s+(?:number|amount|value|dollar value)\s+of\b/i.test(name.trim())) { nameBuf = []; continue; }
    const sqTot = name.replace(/\s+/g, "").match(/^(?:grand|net|sub)?total/i);
    if (sqTot) {
      const toks = name.trim().split(/\s+/);
      let acc = "", k = 0;
      while (k < toks.length && acc.length < sqTot[0].length) { acc += toks[k]; k++; }
      if (toks.slice(0, k).some((w) => w.length <= 2 && /^[a-z]+$/i.test(w))) { nameBuf = []; continue; }
      /* v74: …but "TOTAL b b  $18,971,978" is still a grand total. v73 narrowed
       * this guard to damage INSIDE the word "total", which was right for
       * "Total Intl Bd Idx Admiral" and wrong here: the old first-three-tokens
       * test had been catching these by the stray "b" (empty column letters
       * from the form rendering), and v73's laid-out-row exemption then let
       * the wide line through the prose guard too. Both halves together
       * doubled 24 confident lineups to ratio ~1.9-2.2 — Historic Tours of
       * America gained exactly one row, its own $18.9M total, and lost its
       * menu.
       * What separates them is what FOLLOWS the word: a fund has real words
       * after "Total", a damaged total has only column debris. Require at
       * least one remaining token of three or more letters. */
      const rest = toks.slice(k);
      if (!rest.some((w) => /[a-z]{3,}/i.test(w))) { nameBuf = []; continue; }
    }
    /* v71: the 4i FOOTNOTE. Schedules close with "* Indicates a
     * party-in-interest as defined by ERISA", and 107 stored rows are that
     * sentence — one of them a 21-row plan's TOP holding, because the
     * footnote sits near a value on the same line. The leading asterisk is
     * stripped upstream as the party-in-interest MARKER, which is what lets
     * the sentence through. */
    /* v74: PLURAL. Auditors write "Represent parties-in-interest." as often as
     * the singular, and v71's guard only matched "party". The row carries the
     * schedule's grand total because the footnote sits beside it, so a missed
     * one doubles the whole region: Current Lighting's "Represent
     * parties-in-interest. $77,822,202" put its 30-fund menu at ratio 1.96 and
     * cost it confidence. Four of the twenty-four v73 casualties were this
     * word. */
    if (/^\s*(?:indicates?|denotes?|represents?)\b.{0,60}part(?:y|ies)[- ]in[- ]interest|^part(?:y|ies)[- ]in[- ]interest\b/i.test(name)) { nameBuf = []; continue; }
    /* v70: STOPWORD FRAGMENTS. "of year" was a $0.3B plan's top holding —
     * the tail of a wrapped "…at end of year" heading, four characters past
     * the minimum-length check and made of nothing but function words. A name
     * that is only prepositions plus a generic time/scope noun names nothing. */
    if (/^(?:of|at|in|for|to|from|the|and|as)(?:\s+(?:of|at|in|the|a))?\s+(?:years?|periods?|dates?|plans?|end|beginning|december|june)$/i.test(name.trim())) { nameBuf = []; continue; }
    /* v133: A UNITS MARKER IS NOT A HOLDING. "(in thousands)" is read
     * elsewhere as the scaling declaration it is (v125, v129); when it sits in
     * the identity column of a table whose values are alongside, it also
     * parsed as a NAME, and the number beside it became its value. Published
     * examples: New York Life Insurance (15,340 participants) shows
     * "(in thousands)" at $464,500,000 = 40% of a five-row menu; Caterpillar,
     * Ecolab, Domino's, Continental Casualty, Cleveland-Cliffs, Arcosa and
     * Solar Turbines carry smaller ones — 9 published lineups / 10 rows /
     * 143,083 participants. It also decides a whole plan elsewhere: First
     * American Financial's 2024 filing wins its region on a fair-value note
     * where this row is 32%, and with the row gone the note cannot win. */
    if (UNITS_MARKER_NAME.test(name.trim())) { nameBuf = []; continue; }
    // financial-statement rows ("Participants 41,200,000", "Company",
    // "Rollover", "From participants") leak in when a candidate region
    // sweeps a contributions schedule — bare finance nouns are never funds
    if (/^(participants?|company|employer|employee|rollovers?|forfeitures?|interest|dividends|other|contributions?|(?:from|to) participants?|other net disbursements?|net disbursements?)$/i.test(name.trim())) continue;
    /* v75: the same schedule with a SECOND word. "Employer match", "Participant
     * rollovers", "Employee deferrals" name where the money came from, not what
     * it is invested in — a contributions-by-source table, swept in when a
     * candidate region reaches it. The v44 rule above is anchored to bare
     * nouns, so every two-word form walked past it.
     * Measured: 183 rows across 137 entries, 83 of them confident, 45 distinct
     * names, and reading all 45 they are sources without exception
     * ("Participant rollovers" 49, "Employee Rollover" 14, "Employer match" 8).
     * The second word carries the whole rule: "Employer Stock Fund" and
     * "Company Stock" name real holdings and are untouched, as are participant
     * LOANS, which are a filed 4i line. */
    if (/^(?:employer|employee|participants?|company)['’]?s?\s+(?:match(?:ing)?|profit\s+sharing|rollovers?|contributions?|deferrals?|discretionary|elective|safe\s+harbor|non-?elective|forfeitures?)\b/i.test(name.trim())) { nameBuf = []; continue; }
    /* v75: Form 5500 INSTRUCTION TEXT read as a holding. "d Total income. Add
     * all income amounts in column (b) and enter total" was Westlie Motor's
     * largest "fund" at $2,497,256 — the Schedule H line 2d figure. v73's
     * laid-out-row exemption is what let these through: form lines are dot-
     * leadered and columnar, which is exactly what that rule takes as evidence
     * of a table row.
     * Measured: 72 rows across 49 entries, 36 confident, 50 distinct names, and
     * all 50 are form boilerplate. "2d Business code (see instructions) 75
     * CHESTNUT RIDGE ROAD" is the same NAICS-code-as-dollars mechanism the
     * ABCDEFGHI guard catches, in filings whose address block is real text so
     * that guard never fires. No fund is named after the instructions for
     * filling in a form. */
    // tested against the RAW assembled cell as well as the cut name: a type
    // cut can strip the instruction text and leave the street address behind
    // ("2d Business code (see instructions) 75 CHESTNUT RIDGE ROAD" ->
    // "CHESTNUT RIDGE ROAD"), which is no more a holding than the whole line
    if (/\(see instructions?\)|\benter total\b|\badd all\b.{0,24}\bamounts?\b|\benter name and ein\b|\benter the (?:number|amount) of\b/i
        .test(name + " " + fullAll)) { nameBuf = []; continue; }
    /* v75: "c/o" is an ADDRESS, and the third variant of the same defect. The
     * ABCDEFGHI guard catches the sponsor address block when EFAST2 left its
     * placeholder text in; where the filer's address is real text there is
     * nothing alphabetic to condemn — but the wrapped address still becomes a
     * name and the box-2d business code still becomes its value.
     * Measured on rows the placeholder guard does NOT already catch: 19 rows,
     * 19 entries, 18 CONFIDENT, and every single value is a NAICS code —
     * "c/o Katy Freeway Houston $522,130", "c/o WINOOSKI PARK COLCHESTER
     * $611,000", "2 Nazareth c/o Lane St. Louis $623,000". Care-of is postal
     * notation; no fund is named with it. */
    if (/\bc\s?\/\s?o\b/i.test(name)) { nameBuf = []; continue; }
    /* …and the plain street address, with no care-of and no placeholder text.
     * Found by the near-miss sweep the FEIN entry introduced: rows whose value
     * is NAICS-shaped and whose name is address-shaped but which no existing
     * guard catches. The answer was THREE — "250 MUNOZ RIVERA AVENUE
     * $524,150" (insurance agencies), "8280 WILLOW OAKS CORPORATE DRIVE SUITE
     * 450 $541,330" (engineering services), one more. Three rows is below the
     * bar for a new rule on its own; it is worth it here only because it
     * closes the family, and because the sweep's real finding is that the
     * family IS now closed — after four guards, three rows remain.
     * A house number followed by a street suffix, with no fund vocabulary
     * anywhere in the name. "State Street", "Dodge & Cox International St" and
     * every other house whose name contains a street word are excluded by the
     * fund-vocabulary test — that false positive is exactly what the first
     * version of this sweep returned, 2,094 rows of real funds. */
    if (/^\s*(?:\d{1,6}|p\.?\s?o\.?\s+box)\b[^,]{0,40}?\b(?:street|avenue|road|drive|boulevard|lane|suite|highway|parkway|court|place|circle|plaza|blvd|pkwy)\b/i.test(name)
        && !/\b(fund|trust|index|idx|class|portfolio|pool|equity|bond|stock|cap|growth|value|income|target|retirement|admiral|instl|institutional|annuity|market|account)\b/i.test(name)) { nameBuf = []; continue; }
    /* statement carry-forward openings. "Balance (Previous) $6,819,178" was
     * 99% of its plan's displayed lineup. 14 rows, 8 confident. */
    if (/^balance\s*\((?:previous|prior|forward|beginning)\)?|^(?:previous|prior|beginning|opening)\s+balance\b|^balance\s+forward\b/i.test(name.trim())) { nameBuf = []; continue; }
    // administrative-expense NOTE rows ("Payroll taxes 79,790 74,287",
    // "Occupancy", "Printing and postage") leak from two-column expense
    // schedules with the PRIOR-year figure as the line-terminal "value" —
    // bare accounting nouns are never funds
    if (/^(payroll( taxes| audits)?|employee benefits|occupancy|office( expenses?)?|office equipment( and rental)?|printing( and postage)?|postage|legal( and collection| fees)?|accounting( fees)?|audit(ing)? fees?|consulting|insurance|utilities|earnings|custodial (fees?|services)|recordkeeping fees?|trustee fees?|investment and custodial services|outside services|temporary services|security expense|conferences and meetings|travel( and conferences?)?|repairs and maintenance|reimbursements to related organizations?)$/i.test(name.trim())) continue;
    /* v74: the SAME expense schedule, phrased the ways the v44 list did not
     * enumerate. "Advisory fees" and "Professional fees" were two of the four
     * "holdings" St. Louis Auto Dealers displayed, next to "Collective trusts"
     * and "Mutual funds" — an expense note that reached ratio 0.93 and won.
     * Harvested rather than appended (report #42): every stored holding name
     * of four words or fewer ending in fee/expense/revenue/compensation/charge
     * vocabulary is 75 distinct names over 139 rows, and reading all 75 they
     * are accounting lines without exception — "administration fees",
     * "contract administrator fees", "bad debt expense", "prepaid expense".
     * The few that carry a fund name ("Mid Cap Value Fee", "S&P 500 Revenue")
     * are revenue-SHARING schedules, per-fund fee disclosures rather than
     * holdings, so they belong out too.
     * The break case is the share class, which is where the trailing-word
     * rules have gone wrong before: "Great Gray Retirement Date 2045 Trust Fee
     * Class R1" ends in "R1", "AST Wilmington … Fee Class" ends in "Class".
     * Only a name ENDING in the accounting noun matches. */
    if (/\b(?:fees?|expenses?|revenues?|compensation|charges?)$/i.test(name.trim())) { nameBuf = []; continue; }
    /* v74: an EIN is not a dollar amount. Employer identification numbers are
     * written NN-NNNNNNN, so a page heading like "PLAN ID #002; EIN:
     * 16-1187872" hands the row parser a name ending in "EIN:" and a
     * seven-digit "value" of $1,187,872. Measured across the stored lineups:
     * 728 entries carry one, 679 of them CONFIDENT, 773 rows in total, and
     * the fabricated amounts run to $14,400,225. Every one of the 25 sampled
     * was this same heading; no fund name ends in "EIN".
     * Removing them lowers those regions' sums (report #38 — judge junk
     * removal region by region): the fake row is a median 4.8% of its entry,
     * but in 99 entries it is over a quarter, and those are the ones to read
     * in the re-parse verdict. A confidence band propped up by an invented
     * seven-figure holding was never real. */
    /* v76: FEIN. The v74 rule above anchored on `\bein\b`, and in "FEIN" the
     * word boundary is not there — "OCEAN'S ELEVEN CASINO 401(k) PLAN PLAN
     * FEIN#: 33- $733,380" walked straight past a guard written that same day.
     * Measured on rows the v74 rule does NOT already catch: 255 rows across
     * 252 entries, 236 of them CONFIDENT, values to $4.7M. Filers write it
     * "FEIN 36-", "FEIN: 94-", "FEIN #75-", "PLAN FEIN 98-".
     * A guard is only as wide as the spellings it was shown. */
    /* v130: tested against the ROW as assembled, not only against the chosen
     * name. Colgate-Palmolive's form page prints "Plan Sponsor EIN  13-1815595"
     * under a wrapped "Plan"; once the column split handed the description the
     * name, the row was called "Plan 13" and sailed past a guard that was
     * looking for a name ENDING in "EIN". It published $1,815,595,000 — an EIN
     * read as dollars — at 36% of the plan, and carried Colgate over the
     * confidence band. A guard keyed to one rendering of a row is not a guard. */
    if (/\b(?:f?ein|employer identification(?: number)?)\b[\s:;#.,\/–—-]*\d{0,3}(?:[\/–—-]\d{0,3})?[\s–—-]*$/i
        .test(name.trim()) ||
        /\b(?:f?ein|employer identification(?: number)?)\b[\s:;#.,\/–—-]*\d{0,3}(?:[\/–—-]\d{0,3})?[\s–—-]*$/i
        .test(fullAll.trim())) { nameBuf = []; continue; }
    /* Income phrases that name no fund. Deliberately only these three: the
     * measurement over 6,890 income-shaped stored rows is overwhelmingly REAL
     * fund vocabulary ("Vanguard Target Retirement Income" 1,223, "Dodge & Cox
     * Income" 341, "PIMCO Income" 170), so a general income rule would rename
     * thousands of genuine holdings. Interest/dividend/accrued income are the
     * only unambiguous accounting members, and "Dividend and interest income"
     * was a displayed holding at Hydro-Air Components. */
    if (/^(?:accrued income|interest income|dividend and interest income|interest and dividend income)$/i.test(name.trim())) { nameBuf = []; continue; }
    // page carry-forward subtotals ("Forward  $21,786,094  $23,237,830" at
    // the top of every continuation page) — the same-name dedup SUMS the
    // distinct per-page values into a fake nine-figure "fund"
    /* v69: the same carry-forward, with the page reference still attached.
     * The v44 rule anchored at the end of the name, so "Balance Forward from
     * Page 12" survived and became a $0.5B plan's TOP holding — and because
     * the same-name dedup SUMS distinct per-page values, several of them
     * compound into one large fake fund. Allow the trailing reference. */
    if (/^(balance |carried |brought )?forwards?(\s+(from|to)\b.*)?$/i.test(name.trim())) { nameBuf = []; continue; }
    /* v68: AUDITOR LETTERHEAD. The page carrying the "Schedule H, Line 4i"
     * TITLE is often the audit firm's report page, and its letterhead parses
     * as holdings — Global Tax Management stored "Maillie LLP | maillie.com
     * 500 North Lewis Road, Limerick PA" as its largest "fund" while the real
     * menu (TRP Capital Appreciation $11.0M, Vanguard index funds) sat
     * unread 650 lines later. A web domain, a "Firm LLP |" masthead, or a PO
     * Box is never a fund name; killing these rows also drops the region's
     * score so the real schedule can win. */
    if (/\b[a-z0-9-]+\.(?:com|net|org|us)\b/i.test(name) ||
        /\b(?:llp|llc|p\.?c\.?|cpas?)\s*\|/i.test(name) ||
        /\bp\.?\s?o\.?\s+box\s+\d/i.test(name)) { nameBuf = []; continue; }
    // form/signature boilerplate that assembles into a named row
    if (/signature of (the )?(plan administrator|plan sponsor|employer|dfe)|^amounts per (the )?form \$?5?500\b/i.test(name)) continue;
    // OCR'd FORM-PAGE lines (Schedule H Part II items) parse as holdings on
    // scanned filings: "K Net income (loss). Subtract lime 2j..." $55M,
    // "companies (e.g., Mutual FUNGS)", "(6)Total Additions" (Galliano) —
    // form-instruction vocabulary never appears in a real fund's name
    if (/subtract li[nm]e|add lines? \d|net income \(loss\)|\(e\.?g\.?[,.]|transferred (from|to)\b|total (additions|deductions)\b|balance and additions|\(specify\)|type of contract|disbursed from|to pay benefits\b/i.test(name)) continue;
    // OCR-garbled dot leaders ("seecseecsessseesess", "..sscesss") — runs of
    // only s/c/e letters that real words never reach ("assesses" peaks at 7)
    if (/[sce]{8,}/i.test(name)) continue;
    // EIN/plan-number heading lines glue to a column value and land as fake
    // $1M+ "holdings" ("SPONSOR EIN: 23-", "PLAN'S EMPLOYER IDENTIFICATION
    // NUMBER: 34-" — that one displayed the EIN's own last digits as a
    // $4.4M fund) — they inflate the region sum and tank its assets ratio
    if (/^(sponsor(?:['’]s)? |plan(?:['’]s)? )?(federal )?(employer|employee) identification number\b|^(sponsor |plan )?ein\b|^e\.\s?i\.\s?n\.?\s*[:#]|^plan number\b|\bein\s*#?\s*\d{0,2}-?$/i.test(name.trim())) continue;
    // heading variants that defeat the anchored guard above: "Name of Plan
    // Sponsor: BitGo, Inc. Employee Identification Nu…" (511 confident
    // lineups carried this class, found by the audit's lineup-junk
    // tripwire; "EMPLOYEER" is a common OCR misread)
    // r? must stay OPTIONAL: "EMPLOYEE IDENTIFICATION NO." (Werner) — a
    // v49 edit made the r required and the tripwire caught the survivor
    if (/name of plan sponsor|employe{1,2}r?(?:['’]s)? identification|identification number|^\s*plan name\b/i.test(name)) continue;
    // OCR'd Schedule H form lines that reach row shape (v57, from the
    // #136 lineup-junk HIGHs): "d Total of balance and additions (add
    // lines 7b and 7C(6))", "K Net income (loss). Subtract lime 2j from
    // lime 2C" ("lime" is tesseract's favorite misread of "line"),
    // "@ Type of contract: (1) [] individual policies", and form-item
    // rows like "(13) [Pl]ans) interest in master trust…" (Paychex)
    if (/\b(?:add|subtract) l[i1]nes? \d|\bl[i1]me \d|total of balance and additions|^\W*type of contract\b/i.test(name)) continue;
    if (/^\(\d{1,2}\)\s.{0,15}?(?:interest|value of plan|total\b|net (?:income|assets)|receivables)/i.test(name.trim())) continue;
    // v49 edge-sample findings (all were confident rows): loan-rate range
    // fragments ("ranging from 4.25% to" = a $13M "fund"), truncated class
    // stems ("Common /"), and PROVIDER-TOTAL statement rows — a bare
    // custodian name ("Vanguard" $19M) is an assets-at-provider aggregate,
    // never a menu option
    if (/^\W*ranging from\b|^common ?\/?$/i.test(name.trim())) continue;
    // v48 residue sweep (the tripwire's remaining ~165): every EIN-heading
    // spelling, statement-reconciliation rows ("Net gain per the Form
    // 5500"), OCR'd Paperwork Reduction notices ("lnstructlons"), and
    // truncated sponsor headings — none of these words appear in real
    // fund names
    if (/\bform\s+\$?5?500\b|(federal|pension) identification num|identification number:?\s*\d{0,2}[-–]?\s*$|\bof plan sponsor:|paperwork reduct|the [li]nstruct[li]ons for|\bschedule\s+h\b/i.test(name)) continue;
    // dotted-leader runs are USUALLY form/TOC lines ("(1) Employer
    // Securities ......."), but some real menus typeset leaders between the
    // fund name and its value — dropping those cost a confident Vanguard
    // menu 5 of 17 rows. Strip the leaders and keep the row when what
    // remains reads like a fund name; item-numbered and type-only residue
    // is still the form/TOC junk the original rule targeted.
    // leaders come in two typesettings: consecutive dots ("Fund......") and
    // SPACED dots ("PIMCO . . . . Income Institutional", the Costco/JPM
    // class, where the run separates the issuer column from the description
    // column of the SAME row). Both strip to a space; initials like "U.S."
    // have only two dots and never match the 3+/4+ runs.
    if (/\.{6,}/.test(name) || /(?:\.\s){4,}/.test(name)) {
      const del = name.replace(/ ?\.{3,} ?/g, " ").replace(/(?: ?\. ){3,}\.? ?/g, " ").replace(/\s{2,}/g, " ").trim();
      if (/^\(?[a-z0-9]{1,3}\)/i.test(del) || typeOnly(del) || !/[a-z]{3}/i.test(del)) continue;
      name = del;
    }
    // cipher-font residue that reached row shape ("S@CUrities"): symbols
    // embedded inside words, or several non-name symbols, never appear in
    // honest fund names — these built the 2 known junk-confident lineups
    if (/[a-z][@#$%=_~`^{}\[\]<>][a-z]/i.test(name) || (name.match(/[@#=_~`^{}\[\]<>\\]/g) || []).length >= 2) continue;
    // financial-statement line items and note prose that sweep in with a
    // trailing number ("Net income per Form 5500", "Interest and dividend
    // income - investments", "Participants may borrow …") — AVI-SPL's
    // junk-confident 5-row "lineup" was built of these
    /* v68: OCR turns "receivable" into "recervable"/"recelvable", so an exact
     * spelling let Buchanan's participant-loan row through as a fund. Same
     * lesson as the "fair valuc" guard: match the stem, tolerate the middle. */
    if (/^net (?:income|assets)\b|per form 5500|^interest and dividend|^contributions? rec\w{0,3}vable|^participants may borrow|^notes? rec\w{0,3}vable/i.test(name.trim())) continue;
    // statement-of-net-assets lines assembled across wraps ("Assets
    // Investments, at fair value") — the line-level SKIP_ROW can't see
    // the assembled form
    /* v68: OCR misreads defeat an exact-spelling guard. Buchanan Ingersoll's
     * scanned schedule stored "Investments at fair valuc" — $412M, 99.4% of the
     * plan — because the v44 rule spells "value". The stem plus one or two
     * trailing characters covers valuc/valuo/valu without matching real fund
     * names, which never open with "investments at fair". */
    /* v69: also "INVESTMENTS (at Fair Value)" — the parenthesised form, which a
     * $2.8B plan stored as 99% of its table. Parens and case vary; the phrase
     * does not. */
    if (/^(assets[.,]?\s+)?investments?,?\s*[—–(-]{0,2}\s*at (fair|contract) valu\w{0,2}\b/i.test(name.trim())) continue;
    // section SUBTOTALS spelled as class descriptions instead of "Total…"
    // ("Interest in common/collective trusts $4,474,697,107", "Assets Held
    // for Investment", "Employer-related investments: Employer securities")
    // — Sempra Savings Master Trust double-counted its whole schedule to
    // ratio 3.0 and lost a clean $5.95B menu. Bare "Interest in" is the
    // type-cut residue of the same rows. Kohler-style "interest in master
    // trust" HOLDINGS are untouched (different stem, gate-verified).
    if (/^assets held for investment\b|^employer-related investments?\b|^interest in$|^interest in (?:common ?\/? ?collective trusts?|registered investment compan(?:y|ies)|pooled separate accounts?|103-12 investments?)\s*$/i.test(name.trim())) continue;
    // Schedule H part-II item lines ("(c) Value of interest in ...") leak
    // when a type-cut removes their dotted leaders before the leader check
    if (/^\(?[a-z0-9]{1,3}\)\s*value of\b|^value of interest\b/i.test(name.trim())) continue;
    /* v155: a Schedule H / Form 5500 LINE REFERENCE is not a holding — `le 1f`,
     * `1d(2) 0 0 le 0 0 1f`, `(a) Amount (b) Total 2b(6)`, `2e(2) 0 2e(3)`,
     * `(3) Other`, `6a(2), 6b, 6c` — form pages parsed as a region published
     * these on 75 confident lineups / 298k ppl (State Street and Deutsche
     * Bank 12 of 17 rows; Endeavor Health's 2023 fallback `le 1f` at 88%). */
    {
      const fm = name.trim().match(/^\((\d{1,2})\)\s+(.*)$/);
      if (fm) { if (SCHED_H_ITEM.test(fm[2]) || isClassLabel(fm[2])) continue; name = fm[2]; }
    }
    if (FORM_LINE.test(name.trim())) continue;
    /* v159: a participant-loan MATURITY phrase is not a holding and not the
     * start of one. `due 2025 to 2029`, `maturing though 2032 with interest at
     * 4.25%-9.50%`, `through January 2031 -0` published as rows on 22 lineups;
     * Weyerhaeuser (13,967 ppl) had `through November 2039` — the loan line's
     * tail — joined by the two-column wrap onto its first real fund, so its
     * largest holding (30%) read `through November 2039 Vanguard Institutional
     * 500 Index Trust`. The phrase alone is dropped; a phrase followed by a
     * name is stripped from it. */
    {
      const mat = name.trim().match(/^(?:through|thru|due|maturing(?:\s+th(?:r)?ough)?)\s+(?:[A-Za-z]+\s+)?\d{4}(?:\s*(?:to|-|–|and)\s*\d{4})?\s*/i);
      if (mat) {
        const rest = name.trim().slice(mat[0].length).replace(/^(?:with|bearing|at)\b.*$/i, "").trim();
        if (rest.split(/\s+/).filter(Boolean).length < 2 || /^-?\d/.test(rest)) continue;
        name = rest;
      }
    }
    // rows often carry no type of their own — it lives in the section header
    // ("Common/Collective Trusts"). SDBA/loans must not inherit: those section
    // types would wrongly collapse itemized rows.
    let rowType = type;
    if (!rowType && curSection) {
      const secType = classify(curSection);
      if (secType && secType !== "SDBA" && secType !== "Participant loans") rowType = secType;
    }
    // ownType = the row carried its OWN investment-type column, so it is a
    // proven 4i data row rather than a plausible-looking text line; the
    // sub-$10k residue filter trusts that proof (see parse4i)
    // the identity column carries the >5%-of-plan marker mid-line ("Fidelity**
    // 500 Index Fund ... 1,234"), which the end-of-line strip never reaches:
    // 3,000 published issuers still read "Fidelity**" after v127 stripped the
    // header path alone. Strip at the push so both paths are clean. Not a
    // version bump on its own — app.js already strips it for display and
    // lookup, so readers see clean names now; the store catches up on the
    // next real re-parse.
    /* v154: an identity cell that ends in a TYPE phrase names the firm AND the
     * vehicle — `Vanguard Group Registered investment company`, `Principal
     * Life Insurance Company Pooled separate account` (IBEW 124's template).
     * The head is the issuer; the tail is the row's type when the row carries
     * none of its own (a classified phrase only — a tail `classify` cannot
     * name stays on the cell). */
    let issCell = iss ? iss.replace(/[*^†‡]+/g, "").replace(/^#\s*|\s*#$/g, "").trim() : "";
    let issTail = false;
    if (issCell) {
      const tail = issCell.match(ISS_TYPE_TAIL);
      if (tail && tail.index >= 3) {
        const head = issCell.slice(0, tail.index).replace(/[\s,\-–—/]+$/, "");
        const tType = classify(tail[0]);
        if (head.length >= 3 && tType !== "SDBA" && tType !== "Participant loans") {
          issCell = head; issTail = true;
          if (!rowType && tType) rowType = tType;
        }
      }
    }
    rows.push({ name: name.slice(0, 90), type: rowType, value, sec: curSection, ...(rejDesc && rejDesc !== name ? { _dd: rejDesc.slice(0, 60) } : {}), ...(type ? { ownType: 1 } : {}), ...(issCell ? { iss: issCell.slice(0, 60), ...(issTail ? { _it: 1 } : {}) } : curIss ? { iss: curIss.slice(0, 60) } : {}), ...(leadStripped ? { _sl: 1 } : {}) });
  }

  // ARITHMETIC subtotal removal (owner directive after Sempra: takeaways
  // apply to ALL filers): a subtotal is arithmetic, not spelling. A row
  // whose value equals the sum of the preceding rows — since the last
  // boundary (section subtotal) or overall (grand total / carry-forward)
  // — is a subtotal no matter what it is called, in any auditor's
  // phrasing, any language, even OCR-garbled. Tolerance scales with group
  // size because cents are truncated per-row. Single-row "sections" stay
  // vocabulary-guarded (a coincidental equal-value pair must not merge).
  /* v74: the group is whatever sits ABOVE the subtotal, which is not always
   * "everything since the last subtotal". St. Louis Auto Dealers opens with a
   * Cash Equivalents section that has NO subtotal of its own, so by the time
   * "Mutual Funds $852,305" arrives the running group carries an extra
   * $9,534 of cash and the equality test misses by exactly that. Two class
   * subtotals survived, the region doubled to ratio 1.96, and a two-row
   * class-label fragment won the filing instead.
   * So ALSO test every SUFFIX: a row equal to the sum of the last j rows for
   * some j >= 2 is a subtotal of those j.
   * This runs as a FALLBACK after the original running-group test, and it
   * demands EXACT equality where that test tolerates j+2 dollars of cents
   * truncation. The loose tolerance is safe against one candidate group; it is
   * not safe against every suffix at once. Tried loose first and the parser
   * gate caught it: Reliance One's "Mid-Cap Growth Index Admiral" ($34,875)
   * sits $5 from the sum of the three rows above it, so it was dropped as a
   * subtotal — and removing it then broke the arithmetic for the REAL subtotal
   * below, which survived, doubled the region and cost the filing its menu,
   * 26 rows down to 4. A false positive here does not stay local; it corrupts
   * every later test in the same table. Real subtotals matched to the dollar
   * in every case examined, so exactness costs nothing. */
  const leaves = [];
  let group = 0, groupN = 0, leafSum = 0;
  for (const r of rows) {
    if (groupN >= 2 && Math.abs(r.value - group) <= groupN + 2) { group = 0; groupN = 0; continue; }
    if (leaves.length >= 3 && Math.abs(r.value - leafSum) <= leaves.length + 2) continue;
    let hit = 0, suffix = 0;                    // suffix grows monotonically,
    for (let j = 1; j <= leaves.length; j++) {  // so the first exact hit is
      suffix += leaves[leaves.length - j].value; // the only one
      if (j >= 2 && suffix === r.value) { hit = j; break; }
    }
    if (hit) { group = 0; groupN = 0; continue; }
    leaves.push(r); group += r.value; groupN++; leafSum += r.value;
  }

  /* v149: drop class subtotals beside their own itemisation before any view
   * (dedup, single-render, pair, restatement cut) is built — see
   * `subtotalIndices` above. `leafSum` and the group tallies are adjusted so
   * the region's own arithmetic stays consistent. */
  {
    const sub = subtotalIndices(leaves);
    if (sub.size) {
      let removed = 0;
      for (const i of sub) removed += +leaves[i].value || 0;
      if (TRACE_ROWS) console.error(`[subtotal] ${sub.size} class subtotal(s) removed at the leaves stage, worth ${removed}: ${[...sub].map((i) => `${String(leaves[i].name).slice(0, 30)}=${leaves[i].value}`).join(" | ")}`);
      const kept = leaves.filter((_, i) => !sub.has(i));
      leaves.length = 0; for (const r of kept) leaves.push(r);
      leafSum -= removed;
    }
  }
  const seen = new Map();
  const seenStem = new Map();
  let totalValue = 0;
  for (const r of leaves) {
    if (!r.value) continue;
    /* v74: dedup on PUNCTUATION-INSENSITIVE names. Filings render the schedule
     * twice and the two renders do not always agree on typography: Blain
     * Supply files "T Rowe Price Retirement 2030 Fund I" in one and "T. Rowe
     * Price Retirement 2030 Fund I" in the other. Same fund, same dollar
     * value, but the raw-name key made them two holdings and the region
     * summed to 1.93x plan assets. Twenty-two confident lineups landed at
     * ratio 1.86-2.20 this way once v73's prose fix let the second render
     * parse at all — the rows were always there, only half of them used to be
     * eaten. */
    /* v160: A NAME MAY NOT MERGE ROWS THE FILING DISTINGUISHED. Mass General
     * Brigham (131,090 ppl) files a two-column schedule whose identity is the
     * HOUSE and whose description is the fund — and for six of its rows that
     * description is a bare type word (`STOCK`, `GROWTH`, `MONEY MARKET`),
     * which `dUsable` rejects, so each was named `TIAA-CREF Funds` and three
     * of them SUMMED: $1,209,911k + $275,837k + $79,901k = **$1,565,649k**
     * exactly, published as one holding at 9.4% of a $16.75B plan. The
     * v100-v105 fabrication family in a new vocabulary, and invisible to both
     * guards — a house name is not a generic TYPE name, and 9.4% is far under
     * the dominant-row threshold.
     * The rejected description goes in the KEY, so rows the filing separated
     * stay separate; the post-pass below then puts it back in the NAME, but
     * only where two survivors would otherwise read identically. */
    const kBase = r.name.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
    /* The key stays the BASE name, so the duplicate-render suppression below
     * (`same name, same value`) still fires: keying on the description as well
     * un-merged the two renders of a schedule whose wording drifts, and the
     * corpus measured it — Bonner General 43 -> 79 rows, one menu sum moved.
     * The split happens only where a merge would otherwise SUM two rows the
     * filing gave different descriptions. */
    const kDd = r._dd ? `${kBase}\u0000${String(r._dd).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()}` : null;
    let k = kDd && seen.has(kDd) ? kDd : kBase;
    let e = seen.get(k);
    /* ...and SAME NAME + SAME VALUE is the duplicate render, whatever the two
     * copies call the description. The Wine Group files its menu twice — once
     * ALL-CAPS against `Registered Investment Company`, once mixed-case
     * against `Mutual Fund` — and splitting on the description let both
     * survive: 20 rows -> 25, every fund counted twice. The equal-value test
     * below must get the first look. */
    if (e && k === kBase && r._dd && e.row._dd && String(e.row._dd) !== String(r._dd) &&
        !e.vals.has(r.value)) { k = kDd; e = seen.get(k); }
    if (TRACE_ROWS && TRACE_MATCH && !/^\d+$/.test(TRACE_MATCH) && r.name.includes(TRACE_MATCH)) {
      const ks0 = k.replace(/\b(?:fund|funds|inc|class|cl|portfolio|shares?|the|trust|[a-z]|\d{1,2})\b/g, " ").replace(/\s+/g, " ").trim();
      console.error(`[dedup] ${JSON.stringify(r.name.slice(0, 50))} ${r.value} exact-dup=${e && e.vals.has(r.value) ? 1 : 0} stem=${JSON.stringify(ks0)} stem-dup=${seenStem.get(ks0) && seenStem.get(ks0).has(r.value) ? 1 : 0}`);
    }
    // filings usually render the schedule TWICE (once in the auditor's
    // statements, once as the form-page attachment copy) — the same name at
    // the same dollar value inside one region is that duplicate, not a
    // second holding. Counting it doubled region sums and let statement
    // pages outscore the real table. Different values still sum (share
    // classes reported on one name).
    if (e && e.vals.has(r.value)) continue;
    /* v74: two DIFFERENT issuers under one product name are two holdings, not
     * one to be summed. Stripping the leading share count made this visible:
     * "12,553,193 Money Market Fund" and "2,665,839 Money Market Fund" both
     * became "Money Market Fund" and merged into a single $15.2M row, even
     * though column (b) named Vanguard Treasury on one and Janus Henderson
     * Government on the other. The double-render dedup above is untouched —
     * a schedule rendered twice carries the SAME issuer, and an equal value
     * still collapses first — so this only splits rows the filing itself
     * distinguishes. Rows missing an issuer keep merging as before, which is
     * the case where a second render captured (b) and the first did not.
     * Scoped to rows the strip above actually renamed (_sl). Unscoped, the
     * parser gate caught it splitting a managed account's itemized
     * securities: a brokerage listing carries "Preferred stock" dozens of
     * times under different issuers, and collapsing those to one row is
     * deliberate — the specimen's honest result is a rollup, and splitting
     * them moved $19.4M out of the displayed list. This fix exists to undo a
     * collision the strip creates, so it applies only where the strip fired. */
    if (e && r._sl && r.iss && e.row.iss && r.iss.toLowerCase() !== e.row.iss.toLowerCase()) {
      let alt = k + " " + r.iss.toLowerCase(), n = 1;
      while (seen.has(alt) && seen.get(alt).vals.has(r.value)) alt += " " + n++;
      const ea = seen.get(alt);
      totalValue += r.value;
      if (ea) { ea.row.value += r.value; ea.vals.add(r.value); }
      else seen.set(alt, { row: r, vals: new Set([r.value]) });
      continue;
    }
    /* v145 (queue item i): the two renders of a schedule drift in WORDING as
     * well as typography — R&L Carriers files `Morley Stable Value Fund` and
     * `Morley Stable Value`, Kwik Trip `Eaton Vance Small Cap Fund` and
     * `… Small Cap I Fund`, Boston Consulting `Vanguard Emerging Markets St…`
     * twice — same dollar value, one holding, and the v74 key saw two: 277
     * confident lineups / 488,443 ppl / $0.68B counted twice. A second key
     * drops the filler a recordkeeper varies (fund, class, shares, a
     * share-class letter, a 1-2 digit token); an equal value under an equal
     * stem is the same row again. Cost, accepted and recorded: two genuine
     * lots of one security at one value (Goldman's repos) collapse to one. */
    const ks = k.replace(/\b(?:fund|funds|inc|class|cl|portfolio|shares?|the|trust|[a-z]|\d{1,2})\b/g, " ").replace(/\s+/g, " ").trim();
    if (ks) {
      let es = seenStem.get(ks);
      if (es && es.has(r.value)) continue;
      if (!es) { es = new Set(); seenStem.set(ks, es); }
      es.add(r.value);
    }
    totalValue += r.value;
    if (e) {
      e.row.value += r.value; e.vals.add(r.value);
      /* v130: A MERGED ROW MAY NOT KEEP ONE CONTRIBUTOR'S ISSUER. Intermountain
       * holds the same Invesco fund through four insurance contracts — Pacific
       * Life, Transamerica, RGA, Nationwide. Once v130 stopped gluing the
       * carrier into the fund name they merge on the name, which is right for
       * the money and wrong for the attribution: whichever row landed first
       * would publish its carrier over all $127.9M. The sum is real; the single
       * issuer is not, so the claim is dropped rather than picked. */
      if (e.row.iss && r.iss && String(e.row.iss).toLowerCase() !== String(r.iss).toLowerCase()) delete e.row.iss;
    } else seen.set(k, { row: r, vals: new Set([r.value]) });
  }
  /* v160 part 2: two SURVIVORS that would read identically get their filed
   * description back ("TIAA-CREF Funds STOCK" / "... GROWTH" / "... MONEY
   * MARKET"); a house row that is alone in its region keeps the plain name,
   * so nothing gains a type suffix it does not need. */
  {
    const byBase = new Map();
    for (const e of seen.values()) {
      if (!e.row._dd) continue;
      const b = String(e.row.name).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
      if (!byBase.has(b)) byBase.set(b, []);
      byBase.get(b).push(e.row);
    }
    for (const group of byBase.values()) {
      if (group.length < 2) continue;
      for (const rr of group) rr.name = `${rr.name} ${rr._dd}`.slice(0, 90);
    }
    for (const r of leaves) delete r._dd;
  }
  /* v74: a SINGLE-RENDER view of the same region, offered alongside the normal
   * one so scoring can choose. Some filings print the schedule twice with no
   * 4i heading between the copies, so no candidate region covers just one
   * copy and every candidate double-counts. The copies often disagree on
   * wording ("2030 Target Date Fund N/R" vs "American Funds 2030 Trgt Date
   * Retire R6") or on which YEAR's column they carry, so neither the
   * name+value dedup nor punctuation normalisation collapses them.
   * Here the first occurrence of each normalised name wins outright and later
   * ones are discarded rather than summed. On a genuine single-render table
   * this is identical to the normal view and cannot win anything; on a
   * doubled one it lands near ratio 1.0 and does. Computed in the same pass,
   * so it costs no extra parsing. */
  const hard = new Map();
  let hardTotal = 0;
  for (const r of leaves) {
    if (!r.value) continue;
    const k = r.name.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
    if (hard.has(k)) continue;
    hard.set(k, r); hardTotal += r.value;
  }
  /* …and the same view keyed by VALUE, because the two copies do not always
   * share a name. Brakebush Brothers files "2030 Target Date Fund N/R" in one
   * copy and "American Funds 2030 Trgt Date Retire R6" in the other — nothing
   * about the text says they are the same holding, but $15,530,426 appears
   * twice and 25 of its 29 distinct values are exact pairs covering 99% of the
   * sum. A dollar figure repeating to the cent across a schedule is a second
   * rendering, not two holdings that happen to match. Gated hard: only when
   * pairs dominate, so a menu with a couple of coincidentally equal small
   * positions is untouched, and the longer name of each pair is kept because
   * the fuller rendering is the more useful one. */
  const byVal = new Map();
  for (const r of leaves) if (r.value) (byVal.get(r.value) || byVal.set(r.value, []).get(r.value)).push(r);
  let pairedSum = 0, total = 0;
  for (const [v, rs] of byVal) { total += v * rs.length; if (rs.length === 2) pairedSum += v * 2; }
  let pairFunds = null, pairTotal = 0, pairCut = null;
  if (total > 0 && pairedSum / total >= 0.6) {
    pairFunds = [];
    for (const [v, rs] of byVal) {
      const keep = rs.length === 2 ? [rs.slice().sort((a, b) => b.name.length - a.name.length)[0]] : rs;
      for (const r of keep) { pairFunds.push(r); pairTotal += r.value; }
    }
    pairFunds.sort((a, b) => b.value - a.value);
    pairCut = cutTail(pairFunds);
  }
  const pairAll = pairFunds;
  if (pairFunds) pairFunds = pairFunds.slice(0, ROW_CAP);
  const allRows = [...seen.values()].map((e) => e.row).sort((a, b) => b.value - a.value);
  const hardAll = [...hard.values()].sort((a, b) => b.value - a.value);
  const allCut = cutTail(allRows);
  // totalValue covers every row, not just the displayed top 80 — huge filings
  // list thousands of individual securities and the ratio must reflect all.
  /* v144: `all` is the UNCAPPED list, so the winner's itemized-securities
   * fold can see every row before the display cap is applied (Boeing: 7,551
   * securities behind a 120-row cap, never folded, 19% of the plan hidden). */
  return { funds: allRows.slice(0, ROW_CAP), all: allRows, sdba, totalValue, ...(allCut ? { cut: allCut } : {}),
    hardFunds: hardAll.slice(0, ROW_CAP), hardAll, hardTotal, hardCut: cutTail(hardAll),
    ...(pairFunds ? { pairFunds, pairAll, pairTotal, pairCut } : {}),
    /* v77: the rows in FILED ORDER, so parse4i can look for the point where one
     * rendering of the schedule ends and the next begins. Only the caller knows
     * the plan's assets, which is the only thing that identifies that point. */
    ordered: leaves };
}

/* The full filing contains several look-alike headings (financial-statement
 * TOC, statement pages, the real 4i table). Parse every candidate region and
 * keep the one whose total best matches the plan's Schedule H assets, testing
 * both as-filed dollars and (thousands) scaling. */
/* A page of bare fund-house names against dollar totals ("Fidelity $8,971,947
 * / John Hancock $5,171,802 / BlackRock $2,355,232") is assets-at-custodian,
 * not a menu. It arises from a recordkeeper rendition that prints the fund
 * name on one line and the issuer + value on the NEXT, so the parser only
 * ever sees the house — then merges every row of that house into one.
 * Anchored: only a name that is NOTHING but the house matches, so "Vanguard
 * 500 Index Fund" and "Fidelity Contrafund Commingled Pool" are untouched.
 * Shared by the region SCORE and the final confidence flag. */
const PROVIDER_TOTAL_RE = /^(vanguard|fidelity(?: investments)?|t\.? ?rowe price|american funds|american century|blackrock|charles schwab|schwab|principal|voya|empower|john hancock|nationwide|transamerica|mass ?mutual|prudential|merrill(?: lynch)?|morgan stanley|wells fargo|mn life insurance co\.?|minnesota life|putnam|hartford|pimco|pgim|invesco|jp ?morgan|j\.?p\.? morgan|dodge & cox|mfs|janus(?: henderson)?|franklin(?: templeton)?|neuberger(?: berman)?|victory|baird|loomis(?: sayles)?|artisan|dimensional|great gray|wilmington(?: trust)?|northern trust|state street|ssga|carillon|macquarie|winslow|nyli|new york life|columbia|federated(?: hermes)?|goldman sachs|lord abbett|oppenheimer|thornburg|virtus|william blair|allspring|amundi|aberdeen|harbor|touchstone|calvert|parnassus|legg mason|pioneer|metlife|iShares|first eagle|nuveen|alliance ?bernstein)$/i;
/* Measured over the 61,133 stored lineups before this landed: 283 entries are
 * this shape and 226 of them were CONFIDENT — 226 plans showing "Vanguard /
 * Fidelity / Schwab" where a real menu was filed. Every sampled one was the
 * split-line rendition. The share tests do the work: a genuine schedule names
 * funds, so it cannot be half bare houses by count AND by value. */
const isProviderAgg = (rows) => {
  if (rows.length > 16) return false;
  const prov = rows.filter((f) => PROVIDER_TOTAL_RE.test(f.name.trim()));
  if (prov.length < 3 || prov.length / rows.length < 0.5) return false;
  const all = rows.reduce((a, f) => a + f.value, 0);
  return all > 0 && prov.reduce((a, f) => a + f.value, 0) / all >= 0.5;
};

/* v132: A SOURCE-SPLIT STATEMENT IS AN APPORTIONMENT TABLE, NOT A MENU.
 *
 * Found by the v132 gap-name repair, which is the same recordkeeper template:
 * Producers Rice Mill files TWO 4i attachments — the auditor's 21-fund
 * schedule, and the recordkeeper's rendition of the SAME money split by
 * contribution source, where every fund appears twice, once with a leading
 * source token ("GM Fidelity 500 Index Fund" beside "Fidelity 500 Index
 * Fund"). Once the repair gives that page its filed fund names it stops
 * looking like a page of house totals, and it covers the whole plan by
 * construction (0.997 against the auditor schedule's 0.918), so it outranks
 * the cleaner source. That is this project's recorded lesson about
 * apportionment tables — an employer roster, a fair-value note, a statement of
 * net assets all score ~1.0 for free — in a fourth vocabulary, and it gets the
 * same treatment as the other not-a-menu shapes: the existing 0.35 penalty,
 * not a new constant fitted to this filing. A penalty and not a rejection,
 * because where this page is the ONLY schedule its rows are still the plan's
 * real funds.
 * The extra token must be SHORT (<=4 chars) and LEADING, so a genuine
 * share-class pair ("...Index Fund" / "...Index Fund Admiral") never matches:
 * those differ at the tail. */
/* v132: HOW MUCH OF THE MONEY IS PUBLISHED UNDER A BARE HOUSE NAME.
 * `isProviderAgg` answers the same question as a yes/no with two fixed bars
 * (<=16 rows, >=3 provider rows, >=50% of the money) and Hoosier Motor Club
 * missed it by two points: 48%. That candidate merged `Pioneer Fundamental
 * Growth Fund A` $3,304,222 and `Victory S&P 500 Index Fund A` $804,408 into
 * one `Victory` row of $4,108,630 — a holding that does not exist — and beat
 * the filing's other schedule, which names every fund, by 0.02 of score.
 * A share is the honest form of this signal: scale the same 0.35 the other
 * not-a-menu shapes carry by the fraction of the plan a reading leaves
 * unnamed, so the parser prefers the reading that NAMES MORE OF THE MONEY and
 * no new threshold is invented. A region that is the only one in the filing
 * still wins: the penalty orders candidates, it never rejects one.
 * It counts ONLY `PROVIDER_TOTAL_RE`, the anchored list of actual fund houses,
 * and NOT `isHouseName` — whose institution-suffix arm exists to decide which
 * COLUMN names a fund and matches asset-class labels ending in the word
 * "investments". Using it cost RCB Bank its 10-row menu to a 2-row repair
 * candidate, because `Blended investments` and `Bond income investments`
 * counted as fund houses. Measured, not reasoned: the loss appeared in the
 * corpus diff and named itself. */
const houseShare = (rows) => {
  const tot = rows.reduce((a, f) => a + (+f.value || 0), 0);
  if (!tot) return 0;
  return rows.reduce((a, f) => {
    const n = String(f.name || "").trim();
    return a + (n && PROVIDER_TOTAL_RE.test(n) ? (+f.value || 0) : 0);
  }, 0) / tot;
};

/* v143 part 2 (queue item m): at near-equal score, prefer the candidate
 * whose names a reader can use. Lulus filed its menu twice — full names
 * (26 rows, ratio 1.014) and a 10-character code column (`RBF2055I`,
 * `ISHARES TO`, `AM FD NEW`; 23 rows, ratio 0.997) — and the two tied to
 * four decimals, so the code column won on order. Fusion Medical's kerned
 * rendition (`Re tire P ilo t M o d e rate 2035 Fu n d R1`) beat its clean
 * trustee statement (`RETIREPILOT MOD 2035 FUND R1`) by 0.014 on ratio
 * alone. Share of NAMES that are kerned, digit-bearing code tokens, or a
 * truncated all-caps column, scaled to at most 0.04 — enough to decide a
 * tie, not enough to beat a clearly better ratio. Bare tickers (VFIAX) are
 * identity, not noise, and are not counted. */
const unreadableShare = (rows) => {
  if (!rows.length) return 0;
  let bad = 0;
  for (const f of rows) {
    const n = String(f.name || "").replace(/\s+/g, " ").trim();
    /* three consecutive 1-2 letter tokens, not KERNED's two: `CL M 0.40%`,
     * `EQ US IDX` and `A or Better` are abbreviations a reader can use, and
     * the two-token test called 826 confident lineups kerned on them */
    if (/(?:\b[A-Za-z]{1,2} ){3,}/.test(n) || (/^[A-Z0-9][A-Z0-9.&/-]{2,9}$/.test(n) && /\d/.test(n))
      || (n.length <= 10 && /\s/.test(n) && !/[a-z]/.test(n))) bad++;
  }
  /* below a fifth of the names the term is silent: on Hewlett Packard
   * Enterprise it moved the winner between two same-score siblings of one
   * region (104 rows at 0.02 vs 99 at 0.01) and cost a row — a term meant
   * to decide ties between renditions must not decide ties within one. */
  const share = bad / rows.length;
  return share >= 0.2 ? share : 0;
};

const isSourceSplit = (rows) => {
  if (rows.length < 6) return false;
  const norm = (n) => String(n || "").toLowerCase().replace(/\s+/g, " ").trim();
  const names = rows.map((f) => norm(f.name));
  const set = new Set(names);
  let pairs = 0;
  for (const n of names) {
    const i = n.indexOf(" ");
    if (i > 0 && i <= 4 && set.has(n.slice(i + 1))) pairs++;
  }
  return pairs >= 3;
};

/* v114: two passes, and the SECOND one may only run when the first published
 * nothing at all. `parse4iPass` is the whole v113 parser plus one optional
 * extra region seed; the wrapper below runs it without that seed first, so a
 * filing that already yields a region — confident, stmt, band-hi, anything —
 * parses byte-identically to v113. Only `found:false` (the `nohead` and
 * `noregion` diagnoses, which publish nothing by definition) gets a retry.
 * That is the v81 scoping rule applied at the level of the whole parse: the
 * widening is strictly additive by code path, not by hoping the new seed
 * agrees with the old one on documents the old one already answered. */
function parse4iPass(text, assetsEOY, sponsorName = "", codes = "", captionSeed = false) {
  const lines = text.split("\n");
  const headRe = /(schedule\s+h.{0,40}line\s*4i|schedule\s+of\s+assets\s*\(held|schedule\s+of\s+assets\s+held)/i;
  const endRe = /(line\s*4j|acquired\s+and\s+disposed|signature of)/i;
  // an SMA's attached security-level statement follows the 4i table and its
  // headers/totals leak junk rows — a standalone statement heading ends the
  // region. Anchored to the whole trimmed line so the in-table reference
  // "(see attached Portfolio Statement)" doesn't truncate the real table.
  // "SUMMARY OF NET TRUST ASSETS" = a recordkeeper statement page appended
  // AFTER the 4i table, same funds in ALL CAPS with cents values — v43's
  // cents tolerance made it readable and the region summed both copies
  // (Sierra Space, ratio 1.0 → 1.89, real 29-fund menu lost)
  const stopRe = /^portfolio (valuation|statement)s?$|^(schedule|statement) of (portfolio )?investments?$|^summary of (net )?(trust|plan) assets$/i;
  /* v132: ANOTHER STATUTORY SCHEDULE'S PAGES END THE 4i REGION.
   * A region runs from its heading to the next heading, an end marker or a
   * statement stop — and where the 4i table is short and the composite PDF
   * keeps going, that is up to 4,000 lines of whatever comes next. The
   * Fidelity/CLA audit template prints page after page of
   *   SCHEDULE C SUPPLEMENTAL REPORT
   *   PART I, LINE 3 - INFORMATION ON SERVICE PROVIDERS RECEIVING INDIRECT FEES
   * whose PROVIDER NAME column parses as holdings and whose EIN/ADDRESS column
   * parses as dollars. 782,514,321 is Fidelity Institutional Operations
   * Company's ZIP+4 (San Antonio TX 78251-4321) and was published as
   * $782,514,321 — four times over on DELTA AIR LINES PN 004 (112,027
   * participants), where the real 4i schedule is ONE loan row because the
   * money is in a master trust. Same leak: Delta PN 014 (17,776), Allina
   * Health (37,565, a $1.35B `OPERATIONS COMPANY,` at 50.3% of the published
   * menu), Duke Energy (35,031, 78.5%).
   * No vocabulary judgement is involved and none is wanted: a Schedule C
   * caption is not part of Schedule H line 4i. The `assets` lookahead keeps a
   * page that titles the 4i attachment itself "Schedule C — Schedule of
   * Assets" from stopping its own region. */
  const otherSchedRe = /^(?:form\s*5500[,:\s]*)?schedule\s+c\b(?!.{0,80}\bassets\b)|\binformation on service providers\b/i;
  const atStop = (line) => (!trusteeMode && stopRe.test(line.trim())) || otherSchedRe.test(line.trim());

  const starts = [];
  for (let i = 0; i < lines.length; i++) if (headRe.test(lines[i])) starts.push(i);
  // trustee-report fallback: some filings (PSEG's rotated BNY report) carry
  // NO 4i heading at all — their only schedule is titled "Schedule of
  // Investments…". That title is normally stopRe vocabulary (it ENDS
  // regions to fence off SMA floods), so it may seed regions ONLY when the
  // document has zero real 4i headings — nothing legitimate can be
  // displaced, and scoring/guards judge the result as usual.
  let trusteeMode = false;
  if (!starts.length) {
    const trusteeHead = /^(?:schedule|statement)\s+of\s+(?:portfolio\s+)?investments\b/i;
    for (let i = 0; i < lines.length; i++) if (trusteeHead.test(lines[i].trim())) starts.push(i);
    /* v121: RECORDKEEPER TEMPLATE TITLES, retry pass only. Small plans often
     * attach the recordkeeper's own statement instead of a statutory 4i page,
     * and it carries the whole menu under a house title. Each of these was
     * read off a filing in the nohead/unread bucket rather than guessed:
     * Medical Device Components and MPB Hotel ("STATEMENT OF NET ASSETS",
     * a 27-fund table totalling to Schedule H to the cent), Atrium ("Plan
     * Investment Vehicle Summary"), Innovative Cosmetic ("Overview - Summary
     * By Fund"), Commercial Vehicle Group ("SUMMARY OF NET TRUST ASSETS",
     * 29 Fidelity funds at 0.987 of Schedule H).
     *
     * "Current Plan Assets" was in this list and was REMOVED after measuring
     * it. It is not a recordkeeper statement title at all — it is a heading
     * inside an ADVISER'S "Plan Investment Review" deck, laid out in two
     * columns with an asset-allocation table beside the holdings. The parser
     * read the side column as holdings and published "0.0 Median Market Cap"
     * at $1,097,571 — 46% of the sum — with asset classes glued into the
     * remaining names ("Large Growth JPMorgan Large Cap Growth R6"). That is
     * the fabricated-lineup shape this codebase has closed twice. The whole
     * plan is $2.6M and 166 participants; blank is the correct answer for it
     * until the layout itself can be read.
     *
     * TWO TRAPS, both of which decide the anchoring:
     *   1. "Statement of Net Assets AVAILABLE FOR BENEFITS" is the audited
     *      balance sheet — three rows, no menu — and three filings in this
     *      same bucket lead with it. The `$` anchor is what separates it from
     *      the bare template title; do not relax it to a \b.
     *   2. "summary of net trust assets" is ALSO in `stopRe`, where it ENDS
     *      regions (Sierra Space appended that page as a duplicate of its 4i
     *      table and the region summed both copies). Same phrase, two jobs —
     *      the trusteeHead trap exactly. It is safe here for the same reason
     *      it is safe there: this branch runs ONLY when the document has zero
     *      4i and zero trustee headings, so there is no real table for the
     *      stop to protect, and `trusteeMode` below disables the stop only in
     *      that case. */
    if (!starts.length && captionSeed) {
      const rkHead = /^statements? of net assets$|^summar(?:y|ies) of (?:net )?(?:trust|plan) assets$|^plan investment vehicle summary$|^overview\s*[-–—]\s*summary by fund$/i;
      for (let i = 0; i < lines.length; i++) if (rkHead.test(lines[i].trim())) starts.push(i);
    }
    /* v106: say WHY. These two returns are the difference between "no heading
     * anywhere seeded a region" and "headings fired but nothing scored as a
     * table", which are different defects with different fixes — and until now
     * both reached the status store as the same silence. Diagnosing them meant
     * re-downloading and re-parsing filings the pipeline had already read. */
    if (starts.length) trusteeMode = true;
    else if (!captionSeed) return { found: false, why: "nohead" };
  }
  /* v114: the statutory COLUMN CAPTION, seeded on the retry pass only. The
   * Form 5500 instructions prescribe the 4i column headings — "(b) Identity
   * of issue, borrower, lessor, or similar party" / "(c) Description of
   * investment…" — and many filings print those and no page TITLE at all, or
   * print the title once in a table of contents while the table itself sits
   * under the caption. Seeding from the caption reaches both shapes. The
   * caption lines are already JUNK_RE vocabulary ("similar party",
   * "description of investment"), so they cannot become rows themselves. */
  if (captionSeed) {
    /* A CONSOLIDATED attachment covers more than this plan, and no fragment
     * of it is this plan's lineup. Lucas Horsfall's schedule heads itself
     * "CONSOLIDATED" and closes "TOTAL NET ASSETS 30,643,999.64" against a
     * Schedule H of $14.2M; page 2 of it happens to sum to 1.32x, lands in
     * the confidence band on its own, and would publish 11 of ~60 holdings
     * as the menu. The test is the schedule's OWN declared total against the
     * form's assets — the document contradicting the form, not vocabulary —
     * and it reuses the confidence band's existing 1.6 ceiling rather than a
     * threshold fitted to this filing. It is ONE-SIDED (only an
     * over-declaration rejects), so a schedule printed in thousands can never
     * trip it, and it is confined to this second pass, so nothing v113
     * publishes can be withdrawn by it. Measured over the whole 32-filing
     * caption population: rejects Lucas alone, at 2.16x; the next highest is
     * 1.46x and its lineup reconciles to Schedule H at 1.00. */
    if (assetsEOY > 0) {
      const declRe = /^\s*total\s+(?:net\s+)?assets\b/i;
      for (const line of lines) {
        if (!declRe.test(line)) continue;
        const nums = line.match(/[\d,]+\.\d{2}|[\d,]{5,}/g) || [];
        const v = nums.map((s) => Number(s.replace(/,/g, ""))).filter((x) => x > 1000).pop();
        if (v && v > assetsEOY * 1.6) return { found: false, why: "consolidated" };
      }
    }
    const capHead = /identity of (?:issue|issuer)\b|description of investment/i;
    const seen = new Set(starts);
    for (let i = 0; i < lines.length; i++) {
      if (capHead.test(lines[i]) && !seen.has(i)) { starts.push(i); seen.add(i); }
    }
    if (!starts.length) return { found: false, why: "nohead" };
    starts.sort((a, b) => a - b);
  }

  // single-heading regions
  const candidates = [];
  for (let s = 0; s < starts.length; s++) {
    let end = s + 1 < starts.length ? starts[s + 1] : Math.min(lines.length, starts[s] + 4000);
    for (let i = starts[s] + 3; i < end; i++) {
      if (endRe.test(lines[i]) || atStop(lines[i])) { end = i; break; }
    }
    candidates.push([starts[s], end]);
  }
  // merged regions: multi-page attachments repeat the 4i header on every page,
  // so cluster nearby headings and score the whole span as one table too
  const clusters = [[starts[0]]];
  for (let k = 1; k < starts.length; k++) {
    if (starts[k] - starts[k - 1] < 400) clusters[clusters.length - 1].push(starts[k]);
    else clusters.push([starts[k]]);
  }
  for (const cl of clusters) {
    if (cl.length < 2) continue;
    const lastStart = cl[cl.length - 1];
    let end = Math.min(lines.length, lastStart + 4000);
    const nxt = starts.find((x) => x > lastStart);
    if (nxt) end = Math.min(end, nxt);
    for (let i = lastStart + 3; i < end; i++) {
      if (endRe.test(lines[i]) || atStop(lines[i])) { end = i; break; }
    }
    candidates.push([cl[0], end]);
    // SUFFIX candidates: a cluster often chains a TOC line and statement
    // pages onto the real multi-page attachment (headings all <400 apart),
    // and the polluted whole can never outscore fragments. Every suffix
    // gets to compete so the attachment-only span exists as a candidate
    // (ClinicalMind: [attachment..end] is the real 29-fund menu).
    for (let k = 1; k < Math.min(cl.length, 12); k++) candidates.push([cl[k], end]);
  }

  let best = null;
  // v112: the best candidate that LOOKS LIKE A REAL MENU (>=7 rows, wide
  // band, largest row not a category/aggregate name, no statement/code/
  // provider flags) — kept alongside `best` so the post-selection swap
  // below can prefer it over a tiny note-aggregate that wins on ratio
  let bestMenu = null;
  // v135: the best one-row master-trust POINTER region, used only if nothing
  // publishable won (see the promotion after this loop)
  let bestTrust = null;
  for (const [s, end] of candidates) {
    const region = lines.slice(s, end);
    const regionText = region.join("\n");
    // v125: the units-of-measure declaration lives in the schedule's TITLE
    // BLOCK, which sits ABOVE the column caption that seeds the region, so a
    // region-only scan cannot see it. US Foods prints "(In thousands)" three
    // lines above "Identity of Issuer": its 23-row menu parsed with every
    // value correct, summed to 0.001 of plan assets, was rejected by
    // isConfident, and the plan fell back to its 2023 filing - publishing a
    // 1.26x overshoot and telling readers the newest filing "has no readable
    // schedule", which was false. Scan a short window ABOVE the head for the
    // unit markers only; rows still come from the region itself.
    // Safe by construction rather than by luck: a marker only ADDS a scaled
    // candidate beside the unscaled one, and selection is by ratio-closeness,
    // so over-scaling a genuine full-dollar table would require the scaled
    // ratio to be CLOSER to 1 - i.e. the table really was in thousands.
    const unitText = lines.slice(Math.max(0, s - 8), end).join("\n");
    const sharesLast = /current\s+value\s+shares(\s*\/?\s*par)?|shares\s+par\s*$/im.test(regionText);
    // header ends with an unrealized gain/loss column AFTER the value column
    // — without this the parser reads each row's GAIN as its value
    const gainLast = /(?:market|current|fair) value unrealized (?:gain|appreciation)/i
      .test(regionText.replace(/[ \t]+/g, " "));
    // only consider (thousands) scaling when the region says so — otherwise a
    // page of small full-dollar rows can fake a good ratio at 1000x.
    // "$ in thousands" / "$ amounts in thousands" joined at v56: Mastercard's
    // clean 23-fund table was summing to ~$4.6M unscaled and losing to a
    // 3-row junk region. Millions is the same S&P-class phenomenon one unit
    // up (PPG, Regions, Dow — large plans round the schedule to millions),
    // and millions tables print 1-2 digit values, so the row parser needs
    // to know before it runs.
    // phrasing variants from the S&P sweep: "($ in thousands)" (Mastercard),
    // "(Dollar amounts in thousands)" (Weyerhaeuser), "(amounts in 000's)"
    // (Molson Coors), "(3 in thousands)" (Norfolk Southern — OCR reads the
    // $ as a 3/S), "($ in millions)" (PPG), "($ amounts in millions)"
    // (Regions)
    // markers scan the WHOLE region (GM/Comcast state units 20+ lines below
    // the region head), and BOTH scales are offered as candidates when both
    // markers appear — closeness picks. (An earlier head-window scope broke
    // GM/Comcast; a millions-overrides-thousands ternary broke Exxon, whose
    // merged region carries "(millions of dollars)" statements alongside
    // the "($000's)" 4i schedule.)
    // v116: a UNIT LIST between the noun and "in thousands". Every arm above
    // requires the noun to sit IMMEDIATELY before the phrase, so Paychex —
    // whose schedule is headed "(Dollars, Units, and Shares in Thousands)" —
    // was read unscaled and its real 39-fund menu summed to 0.23% of a
    // $2.26B plan, losing to the fair-value note. The new arm still requires
    // a unit noun, which is what makes it a units-of-measure declaration
    // rather than prose; measured over 325 cached filings it moves exactly
    // one, and moves nothing in the other direction.
    /* v129: a BARE `IN THOUSANDS` line — nothing else on it — between the
     * schedule title and the column caption. TJX (311,623 participants,
     * $3.67B) prints exactly that and matched no arm: every alternative wants
     * parentheses or a preceding noun (`Dollars in thousands`, `(in
     * thousands)`), so the 31-row menu parsed unscaled at ratio 0.001 and the
     * plan was served from its 2023 filing instead. A line that is ONLY the
     * phrase cannot be prose, so it is as safe as the parenthesised forms:
     * scaling only ever ADDS a candidate and ratio closeness picks. */
    const marked = /thousands? of dollars|\(in thousands|\(thousands|\(\$000|000s? omitted|(?:amounts?|dollars?|\$|\b[3sS]) ?in thousands|(?:amounts?|dollars?|units?|shares?)[^.\n]{0,30}in thousands|in 0{3}['’]?s?\)|^[ \t]*\(?in thousands\)?[ \t]*$/im.test(unitText);
    const markedM = /millions? of dollars|\(in millions|\(millions|(?:amounts?|dollars?|\$|\b[3sS]) ?in millions|^[ \t]*\(?in millions\)?[ \t]*$/im.test(unitText);
    // a millions-stated header ADDS a small-value candidate scored at 1e6
    // only — it must never replace the normal parse: statement pages and
    // merged clusters mention millions in prose, and small-value mode on a
    // full-dollar table fabricates rows (Ecolab/Baxter/GM/Comcast verified
    // regressing before this split)
    const variants = [{ parsed: parseRows(region, { sharesLast, gainLast }), scales: [1, ...(marked ? [1000] : [])] }];
    if (markedM) variants.push({ parsed: parseRows(region, { sharesLast, gainLast, smallValues: true }), scales: [1e6] });
    /* v74: the single-render view of each variant competes as its own
     * candidate (see parseRows' hardFunds). It only differs where a region
     * repeats names, and it only wins where that repetition was inflating the
     * region's sum. */
    /* Offered ONLY where the normal view is already too big to be right. These
     * views exist to undo a doubled region, and the parser gate proved they
     * must not be free to win anywhere else: on Black Hills — a correctly
     * parsed schedule at ratio 0.98 — the pair view scored higher purely on
     * carrying one more row, and swapped which rendering of two funds was
     * displayed. Requiring the normal view to sit at 1.5x assets or above
     * confines them to the defect they were built for. */
    for (const va of [...variants]) {
      const p = va.parsed;
      // per-variant: a millions-scaled sibling of the same region must not
      // vouch for this one
      if (!(assetsEOY > 0 && va.scales.some((sc) => (p.totalValue * sc) / assetsEOY >= 1.5))) continue;
      if (p.hardFunds && p.hardTotal && p.hardTotal !== p.totalValue) {
        variants.push({ parsed: { ...p, funds: p.hardFunds, all: p.hardAll, totalValue: p.hardTotal, cut: p.hardCut }, scales: va.scales, repair: 1, parentFunds: p.funds });
      }
      if (p.pairFunds && p.pairTotal && p.pairTotal !== p.totalValue) {
        variants.push({ parsed: { ...p, funds: p.pairFunds, all: p.pairAll, totalValue: p.pairTotal, cut: p.pairCut }, scales: va.scales, repair: 1, parentFunds: p.funds });
      }
      /* v77: PREFIX SPLIT. Some filings print the schedule twice with no 4i
       * heading between the copies, so no candidate region covers just one and
       * the two reconstructions above cannot help: the copies share neither
       * names (the second prefixes the plan's own name) nor exact values (the
       * second rounds to thousands). 4 Bears Casino files eighteen real rows
       * summing to $7,543,234 against $7.53M of assets, then the same
       * eighteen funds again as "4 Bears Casino & Lodge 401(k) Plan AVUVX
       * Avantis…" at $753,000, $546,000, $144,000.
       * In filed order the boundary is visible without reading anything: the
       * running total passes the plan's assets and keeps going. Offer the
       * prefix that lands closest to 1.0 as its own candidate. Like the other
       * repairs it pays 0.05 and is only built for a region already at 1.5x,
       * so it cannot touch a correctly parsed schedule. */
      if (p.ordered && p.ordered.length >= 6) {
        let cum = 0, cut = null;
        for (let i = 0; i < p.ordered.length; i++) {
          cum += p.ordered[i].value;
          if (i + 1 < 3) continue;
          const r = cum / assetsEOY;
          if (r < 0.7) continue;
          if (r > 1.3) break;
          const d = Math.abs(Math.log(r));
          if (!cut || d < cut.d) cut = { d, k: i + 1, sum: cum };
        }
        /* The cut is only a rendering boundary if what FOLLOWS it re-states
         * what precedes it. Without that test the split is just "trim the
         * region until the arithmetic works", and the parser gate showed where
         * that leads: on Power Design it lopped off the tail of an Empower code
         * page and scored the remainder — four "1GGCG25" fund codes and all —
         * past the honest 27-row schedule.
         * Re-statement is visible in the words: 4 Bears' second copy reads "4
         * Bears Casino & Lodge 401(k) Plan AVUVX Avantis U.S Small Cap Value"
         * against the first copy's "Avantis U.S Small Cap Value", sharing
         * three substantial tokens. A code page shares none. */
        if (cut && cut.k < p.ordered.length) {
          const sig = (r) => new Set(String(r.name).toLowerCase().match(/[a-z]{4,}/g) || []);
          const pre = p.ordered.slice(0, cut.k).map(sig);
          const post = p.ordered.slice(cut.k).map(sig);
          const restated = post.filter((t) =>
            pre.some((q) => [...t].filter((w) => q.has(w)).length >= 2)).length;
          if (!post.length || restated / post.length < 0.4) continue;
          const keep = new Map();
          for (const r of p.ordered.slice(0, cut.k)) {
            const k = r.name.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
            if (!keep.has(k)) keep.set(k, r);
          }
          const keptAll = [...keep.values()].sort((a, b) => b.value - a.value);
          variants.push({ parsed: { ...p,
            funds: keptAll.slice(0, ROW_CAP), all: keptAll, cut: cutTail(keptAll),
            totalValue: cut.sum }, scales: va.scales, repair: 1, parentFunds: p.funds });
        }
      }
    }
    for (const va of variants) {
    const parsed = va.parsed;
      /* v135: A ONE-ROW 4i SCHEDULE THAT SAYS "THE MONEY IS IN THE MASTER
       * TRUST" IS A READING OF THE FILING, NOT A FAILURE TO READ IT.
       *
       * First American Financial (17,090 participants, $2.86B) files exactly
       * that: its Schedule H line 4i is one row, `Plan's interest in Master
       * Trust | Master Trust – at fair value | $2,760,495,322` (97% of plan
       * assets) plus a participant-loan row the row parser drops. One fund
       * left, so the `< 2` skip below discarded the region entirely, no
       * candidate existed for it, and the winner became the audited Statement
       * of Net Assets printed in thousands — seven rows summing to 0.2% of
       * the plan, `dx=band-lo`, and the page told 17,090 readers the FILING
       * could not be read (`ds=readfail`) about a filing that states plainly
       * where their money is.
       *
       * Traced, not reasoned: `parseRows` over lines 1760-1800 of the filing
       * returns exactly one fund, typed `Master trust interest`.
       *
       * Kept as a LAST RESORT rather than a competitor, because a region that
       * scores at ratio ~1.0 on one row would otherwise outscore real menus
       * that sum to 0.9: it is consulted only when nothing publishable won.
       * The value must also be a majority of the plan, so a stray trust row
       * in a filing whose real schedule was not found cannot speak for the
       * whole plan. */
      if (parsed.funds.length === 1 && assetsEOY > 0 && isTrustPointerRow(parsed.funds[0])) {
        for (const scale of va.scales) {
          const r = (parsed.totalValue * scale) / assetsEOY;
          if (r < 0.5 || r > 1.6) continue;
          const d = Math.abs(Math.log(r));
          if (!bestTrust || d < bestTrust.d) {
            bestTrust = { d, score: -d, ratio: r, scale, ...parsed, funds: parsed.funds, totalValue: parsed.totalValue };
          }
        }
      }
      if (parsed.funds.length < 2) continue;
      /* v77: a repair is a VIEW of its parent region, so the region's character
       * still condemns it. Judged on its own trimmed rows a repair can dilute
       * the very signal the parent was penalised for — the parser gate caught
       * the prefix split of an Empower code page scoring past Power Design's
       * honest 27-row schedule while carrying four "1GGCG25"-style fund codes,
       * because four codes in thirty-three rows is under the code-page share
       * and the penalty stopped applying. Classify the parent, not the view. */
      const judged = va.parentFunds || parsed.funds;

      /* v101: THE SCHEDULE'S OWN GRAND TOTAL, PARSED AS A HOLDING.
       *
       * Many 4i tables end with an unlabelled total — the identity column is
       * blank and only the value is printed, so the row inherits whatever
       * nameBuf still holds from the wrapped line above it. Fremont Motor
       * ends exactly this way:
       *
       *     Notes receivable from   Interest rate 4.25%-9.50%  -      485,533
       *     participants
       *                                                        -  $19,197,798
       *
       * The last line has no name of its own, so it was stored as a holding
       * called "participants -" worth $19,197,798 — the ENTIRE plan. Its 33
       * real Fidelity funds sum to $18.7M, so the region came to 1.974x plan
       * assets and lost scoring to a two-row "for benefits" fragment off the
       * Statement of Net Assets, which sits at ratio 1.005 by construction.
       * The plan then published no lineup at all.
       *
       * This is the dominant failure in the no-cause bucket, measured over a
       * stratified sample: it produces the ~2x ratios (band-high) AND, by
       * pushing a real menu out of the band, hands the win to whatever tiny
       * total-shaped fragment scores nearest 1.0 (too-few, stmt).
       *
       * The test is a physical impossibility, not vocabulary: one holding
       * cannot BE the whole plan while other holdings also exist. So a row
       * within 2% of plan assets is the grand total whenever the remaining
       * rows still account for at least half the plan — which is what makes
       * it safe for a plan that genuinely holds one pooled vehicle, where the
       * remainder is near zero and the row is kept. Subtracting from
       * totalValue rather than re-summing funds keeps menus over 80 rows
       * correct, since funds is capped at 80 and totalValue is not. */
      let pFunds = parsed.funds, pTotal = parsed.totalValue;
      if (assetsEOY && pFunds.length >= 5) {
        const ti = pFunds.findIndex((f) => Math.abs(f.value / assetsEOY - 1) <= 0.02);
        if (ti >= 0) {
          const rest = pTotal - pFunds[ti].value;
          if (rest >= assetsEOY * 0.5) {
            pFunds = pFunds.filter((_, i) => i !== ti);
            pTotal = rest;
          }
        }
      }

      const raw = pTotal;
      // trustee statements (Verizon Master Savings Trust) file a CLASS-LEVEL
      // summary page followed by thousands of per-security detail pages that
      // double-count it. Prefer the summary; penalize security floods in
      // gain-last statements so an arbitrary detail slice can't outscore it.
      const CLASS_STEM = /^(interest[- ]bearing cash|u\.? ?s\.? government securities|corporate debt|corporate stock|common[/ ]?collective trust|pooled separate account|master trust|103[- ]12 investment|registered investment compan|insurance company general|other investments?|participant loans?|partnership\/joint venture|real estate|loans \(other|employer[- ]related securit)/i;
      const classy = judged.filter((f) => CLASS_STEM.test(f.name)).length;
      const isSummary = judged.length >= 4 && classy / judged.length >= 0.8;
      // a Statement of Net Assets page ("Investments, at fair value",
      // "Mutual funds", "Cash and cash equivalents") sums to ≈ plan assets by
      // construction, so it beats the real table on closeness whenever the
      // table's own ratio is imperfect. Its vocabulary gives it away; trustee
      // CLASS summaries (Verizon) are ≥10 rows of 4i class names and stay
      // above the ≤8-row gate.
      // brokerage-statement class nouns (common stocks / ETFs / money market)
      // joined the vocabulary after Galliano: an OCR'd statement page of
      // exactly those rows slipped INTO the confidence band when v44 removed
      // its other junk rows — removing junk can promote a still-junky region
      const STMT_ROW = /^(total )?(investments?,?( at (fair|contract) value.*)?|net assets( available for benefits)?|assets\b.*|cash( and cash equivalents)?|receivables?\b.*|notes? receivable\b.*|mutual funds?\b.*|(common|preferred) stocks?\b.*|exchange[- ]traded funds?\b.*|money market funds?\b.*|other (revenues?|income)\b.*|(?:common[- /]?)?collective (?:investment )?(?:trusts?|funds?)\b.*|pooled separate accounts?\b.*|guaranteed (investment|interest) (accounts?|contracts?)\b.*|employee rollovers?\b.*|(employer|participant)s?['’]?s?( contributions?( receivable)?)?)$/i;
      const stmty = judged.filter((f) => STMT_ROW.test(f.name)).length;
      // ≤3-row regions of class aggregates ("Registered investment companies")
      // are statement fragments too — v34's dedup fixed THEIR double-rendered
      // ratios as well, and 22 of them displaced real 15-35 row menus
      /* v155: a region whose rows are MOSTLY class labels is a statement at
       * any length — Seattle University's `Variable annuity accounts / Fixed
       * annuity contracts / Pooled separate account` (5 of 5) published as a
       * confident menu at 0.52 once v153 part 2 removed the junk row that had
       * kept a competing 2-row region alive. 34 lineups / 26,652 ppl on the
       * v154 store, every one read as a statement. */
      const labely = judged.filter((f) => isClassLabel(f.name)).length;
      const isStatement = (judged.length <= 8 && stmty / judged.length >= 0.5)
        || (judged.length <= 3 && (stmty + classy) / judged.length >= 0.5)
        || (judged.length >= 3 && labely / judged.length >= 0.6);
      // recordkeeper CODE pages (Empower group-annuity renditions): the same
      // menu re-filed as fund codes ("1GGCG50", "1NTSPI4") under its OWN
      // "SCHEDULE OF ASSETS" heading, with cents columns the v43 fix made
      // readable — it ties the real schedule on ratio and the tie broke
      // wrong (Power Design showed 28 codes as fund names). Code tokens
      // have no spaces and carry digits; real names have spaces, and pure
      // ticker menus (VFIAX) have no digits — both stay unpenalized.
      const codeish = judged.filter((f) => /^[A-Z0-9][A-Z0-9-]{3,9}$/.test(f.name.trim()) && /\d/.test(f.name)).length;
      const isCodePage = judged.length >= 5 && codeish / judged.length >= 0.6;
      /* v73: the provider-TOTAL test used to run only on the WINNER, where
       * all it could do was withhold confidence after the damage was done.
       * Producers Rice Mill filed a clean 21-fund schedule AND a
       * recordkeeper page of eight house totals; the house page hit ratio
       * 0.997 against the schedule's 0.918 (the schedule's loan row wraps
       * over three lines and is not counted) and won on closeness, so the
       * plan showed "Fidelity $8,971,947" where twenty-one funds were
       * filed. The same signal, applied where regions compete, prevents it.
       * Still region-level, never row-level: the ≤8-row bar means a real
       * menu carrying one legitimate provider-aggregate row is untouched —
       * that row-level version cost ~1,300 menus at v49. */
      const isProvPage = isProviderAgg(judged);
      const isSplitPage = isSourceSplit(judged);
      const maxV = pFunds.reduce((a, f) => Math.max(a, f.value), 0);
      for (const scale of va.scales) {
        const ratio = assetsEOY ? (raw * scale) / assetsEOY : 0;
        if (!ratio) continue;
        // physical impossibility guard: no single holding exceeds the
        // plan's total assets — a bogus x1000 on a tiny trust-side parse
        // otherwise lands "nearer" ratio 1 and wins (Northrop gate caught
        // its 150M parse rescaling to 150B against 40B of plan assets)
        if (scale > 1 && maxV * scale > assetsEOY * 1.05) continue;
        const closeness = Math.abs(Math.log(ratio));
        const score = -closeness + Math.min(pFunds.length, 40) * 0.005
          + (isSummary && closeness < 0.5 ? 0.1 : 0)
          - (isStatement ? 0.35 : 0)
          - (isCodePage ? 0.35 : 0)
          - (isProvPage ? 0.35 : 0)
          - houseShare(judged) * 0.35
          - unreadableShare(judged) * 0.04
          /* v155: exact ties between two renderings of one schedule (same rows,
           * same ratio) used to fall to document order, and any junk row that
           * came or went flipped 187 lineups / 189k ppl between renders in one
           * version. Below every other term's step: mixed case and fuller names
           * decide only a dead heat. */
          + nameQuality(judged) * 0.002
          /* a reconstructed view is a repair, not a reading of the filing, so
           * it must win clearly rather than by a hair. Without this Black
           * Hills' honest 22-row region lost by 0.003 to a repaired sibling
           * carrying one more row. */
          - (va.repair ? 0.05 : 0)
          - (gainLast && parsed.funds.length >= 60 ? 0.2 : 0);
        if (TRACE_CANDS) {
          console.error(`[cand] rows=${String(pFunds.length).padStart(3)} ratio=${ratio.toFixed(3).padStart(7)} scale=${scale} score=${score.toFixed(4).padStart(9)}` +
            ` stmt=${isStatement ? 1 : 0} prov=${isProvPage ? 1 : 0} split=${isSplitPage ? 1 : 0} code=${isCodePage ? 1 : 0} summary=${isSummary ? 1 : 0} repair=${va.repair ? 1 : 0} unread=${unreadableShare(judged).toFixed(2)}` +
            `  top=${JSON.stringify((pFunds[0] || {}).name || "").slice(0, 46)}`);
        }
        if (!best || score > best.score) {
          best = { score, ratio, scale, stmt: isStatement, ...parsed, funds: pFunds, totalValue: pTotal, split: isSplitPage };
        }
        if (pFunds.length >= 7 && ratio > 0.45 && ratio < 1.6 &&
            !isStatement && !isCodePage && !isProvPage && !isSplitPage) {
          const tv = pFunds.reduce((a, f) => (f.value > a.value ? f : a), pFunds[0]);
          const tn = String((tv || {}).name || "").trim();
          if (!GENERIC_TYPE_NAME.test(tn) && !AGG_DISCLOSURE.test(tn) && !NOT_FUND_SHAPED.test(tn)) {
            if (!bestMenu || score > bestMenu.score) bestMenu = { score, ratio, scale, stmt: isStatement, ...parsed, funds: pFunds, totalValue: pTotal };
          }
        }
      }
    }
  }
  /* v135 promotion, POST-selection for the reason v107 and v112 are: a
   * candidate that can change WHICH region wins changes every filing, and this
   * one would win on closeness wherever a real menu sums to less than 1.0.
   * It replaces the winner only when the winner is not publishable anyway, so
   * no reader can lose a lineup to it — the outcome is a truer CAUSE
   * (`trustPtr` -> dx `trust` -> the page names the master trust) in place of
   * a false one. */
  if (bestTrust && !publishableShape({ found: true, funds: best ? best.funds : [], ratio: best ? best.ratio : 0, stmt: best ? best.stmt : 0 })) best = bestTrust;
  if (!best) return { found: false, why: "noregion" };
  /* v112: a tiny NOTE AGGREGATE can out-score the real menu on ratio alone.
   * Two of eight sampled `few` in-band plans hid full 13-14 row menus behind
   * a 3-row "Mutual funds / GIC / ..." fair-value note at ratio ~1.0 — the
   * note wins the closeness term and the menu (summing 0.86 because a
   * section is unreadable) loses by a hair. POST-selection, like v107: when
   * the WINNER is <=4 rows whose LARGEST row is a category or aggregate
   * name, and a >=7-row candidate with a product-named largest row sits in
   * the wide band, the menu is the honest reading. The swap target already
   * excluded statement/code/provider pages, so junk cannot swap for junk. */
  if (bestMenu && bestMenu !== best && best.funds.length <= 4) {
    const wt = best.funds.reduce((a, f) => (f.value > a.value ? f : a), best.funds[0]);
    const wn = String((wt || {}).name || "").trim();
    if (GENERIC_TYPE_NAME.test(wn) || AGG_DISCLOSURE.test(wn)) best = bestMenu;
  }
  /* v132: A SOURCE-SPLIT PAGE LOSES TO A REAL MENU — but only when the filing
   * actually contains one. POST-selection for the reason v107 records: a score
   * penalty changes which region wins everywhere, and the first version of this
   * (a flat -0.35, the constant the other not-a-menu shapes use) cost Hospice
   * of Muskegon County its whole 38-fund menu to a 2-row fair-value note
   * ("Fair value" $4,518,380, "Contract value" $492,073) — because there the
   * split page IS the only schedule and its rows are the plan's real funds.
   * The swap target is `bestMenu`, which already excludes statement, code,
   * provider and split pages, so junk can never swap for junk. Producers Rice
   * Mill files both and keeps its auditor's 21-fund schedule; Hospice files
   * only the split page and keeps it. */
  /* v133: ...AND ONLY WHEN THE REAL MENU IS ACTUALLY A BETTER READING OF THE
   * PLAN. The swap above was unconditional on any `bestMenu` existing, and on
   * eight filings the alternative was not a different schedule at all — it was
   * a FRAGMENT OF THE SAME TABLE, one contribution source's worth of rows.
   * Saad Enterprises: the split page reads 48 rows at ratio 0.996, the
   * "menu" it swapped to reads 29 of the same funds at 0.565. Run #344's
   * `swaps-degraded.txt` caught all eight moving off a 2023 fallback onto a
   * 2024 filing at 0.48-0.63 — Putnam Investments, Printpack, Flexitallic,
   * Unex, Saad, Yale Club, Fam LLC, Robert Walters — and in every one of them
   * the v131 parse had been `stmt`-flagged, so v132's caption stop merely
   * removed the competitor that was masking this.
   * So compare coverage: a replacement may be no further from 1.0 than the
   * candidate it replaces, by more than 0.25 in |log| terms (~28% of the
   * plan). Producers Rice Mill still swaps — its auditor's schedule is 0.918
   * against the split page's 0.997 — and a split page that DOUBLE-COUNTS
   * (ratio ~1.9) still loses to a 0.95 menu, because that replacement is
   * closer to 1.0, not further. Half a plan published as the whole menu is
   * the degraded-swap shape `swaps-degraded.txt` exists to catch; it should
   * not be something the parser does on purpose. */
  if (bestMenu && bestMenu !== best && best.split &&
      Math.abs(Math.log(bestMenu.ratio || 1e-9)) <= Math.abs(Math.log(best.ratio || 1e-9)) + 0.25) best = bestMenu;
  /* v132: the v112 swap above is capped at four rows, and the house-share term
   * can promote a LONGER winner whose largest row is a bare type name. Northeast
   * Georgia Health System (14,317 participants) went to a 12-row reading topped
   * by `Registered investment companies` at $672,138,048 = 79% — the schedule's
   * own section header carrying the fair-value note's total, which is the
   * v100-v105 fabrication shape. Same swap, same target (`bestMenu` already
   * excludes statement/code/provider/split pages), but at any row count when the
   * generic row owns HALF the reading. Nothing may swap INTO this shape: the
   * target is menu-shaped by construction. */
  if (bestMenu && bestMenu !== best) {
    const wt = best.funds.reduce((a, f) => (f.value > a.value ? f : a), best.funds[0]);
    const wn = String((wt || {}).name || "").trim();
    const wsum = best.funds.reduce((a, f) => a + (+f.value || 0), 0);
    if (wsum && (+wt.value || 0) / wsum >= 0.5 &&
        (GENERIC_TYPE_NAME.test(wn) || AGG_DISCLOSURE.test(wn) || NOT_FUND_SHAPED.test(wn))) best = bestMenu;
  }
  /* v144: post-selection works on the UNCAPPED winner so the itemized fold
   * sees every row; the display cap is re-applied after the folds (below)
   * and the cut recomputed from what remains. Selection itself is untouched
   * — it scored the same capped views it always did. */
  /* only when `all` really is the uncapped form of THIS winner: a view built
   * as `{...p, funds: X}` inherits the base region's `all` while its own rows
   * are a different list (the gate caught Costco's 31-row spaced-leader view
   * being replaced by the base's 66 rows). Identity of the head rows is the
   * test, so no variant can be silently un-repaired. */
  const uncapped = Array.isArray(best.all) && best.all.length > best.funds.length &&
    best.funds.every((f, i) => best.all[i] === f);
  const srcFunds = uncapped ? best.all : best.funds;
  const topN = best.funds.length;
  let funds = best.scale > 1 ? srcFunds.map((f, i) => ({ ...f, value: f.value * best.scale, ...(uncapped && i >= topN ? { _deep: 1 } : {}) }))
    : srcFunds.map((f, i) => { if (uncapped && i >= topN) f._deep = 1; return f; });
  const tracePost = (tag) => { if (TRACE_ROWS && TRACE_MATCH && !/^\d+$/.test(TRACE_MATCH)) console.error(`[post ${tag}] ${funds.filter((f) => String(f.name).includes(TRACE_MATCH)).length} matching rows of ${funds.length} (uncapped=${uncapped ? 1 : 0}, all=${Array.isArray(best.all) ? best.all.length : "-"}, ordered=${Array.isArray(best.ordered) ? best.ordered.length : "-"})`); };
  tracePost("start");

  /* v136: A LINE OF THE STATEMENT OF CHANGES IS NOT A HOLDING — dropped from
   * the WINNER, POST-SELECTION, and the placement is the whole lesson of the
   * Dominion regression fixed in the same version.
   *
   * The first draft of this dropped the rows inside `parseRows`, beside the
   * loan and prose guards. It removed exactly the 48 rows it was written for —
   * and it also moved BLOOMBERG (20,110 participants) onto a different region
   * entirely: taking `Employer, net of forfeitures` ($92.1M) out of its real
   * 30-row menu lowered that region's sum, and a 26-row sibling whose names
   * are bare house fragments (`BlackRock` $238M, `Dodge & Cox` $215M, `S&P 500
   * Index Fund Class K` with no issuer) won instead. Same mechanism as the
   * note that buried Dominion's menu, in the opposite direction: a row-level
   * guard changes region SUMS, and region sums decide which region wins.
   *
   * Repairing only the already-chosen winner cannot flip a winner by
   * construction — the reason v107's total-row repair sits here too. The
   * removed value is real money that moved (a contribution, a rollover
   * receipt, an investment gain, a benefit payment), so the ratio is
   * recomputed from what remains rather than left stale. */
  {
    const keep = funds.filter((f) => !isStatementOfChangesRowName(f.name));
    if (keep.length !== funds.length && assetsEOY) {
      funds = keep;
      best.ratio = funds.reduce((a, f) => a + (+f.value || 0), 0) / assetsEOY;
    }
  }

  /* v107: drop the winner's own total row — POST-selection, deliberately.
   * Marriott Vacations filed a clean 31-fund menu plus one mangled total row
   * ("Participants $", $861.8M, 95.4% of the $903M plan); v101's 2% window
   * missed it and the region sat at ratio 1.88, real menu withheld. The wider
   * test drops one row at 50-108% of plan assets when the REMAINDER alone
   * lands in the confidence band (0.7-1.3) — arithmetic a legitimate dominant
   * holding cannot satisfy, since its remainder sits near zero — AND the
   * remainder's largest row is under 50% of the remainder, because a menu's
   * top fund does not own half a plan while a trust-note aggregate region is
   * always dominated by one class row (HCA: "Corporate bonds" plus a 63.7%
   * participation-in-master-trust row would otherwise have shipped as a
   * confident $19B lineup).
   *
   * Post-selection matters as much as the conditions. The first version ran
   * inside the candidate loop, where changing a candidate's total changes its
   * ratio, its score, and therefore WHICH REGION WINS — Capital Group's
   * honest 73-row menu lost to a 76-row sibling carrying a $511M "American
   * Funds" house-merge row. Repairing only the already-chosen winner cannot
   * flip a winner by construction. */
  if (assetsEOY && funds.length >= 6 && (best.ratio || 0) > 1.5) {
    const wTotal = funds.reduce((a, f) => a + f.value, 0);
    const wi = funds.findIndex((f) => {
      const share = f.value / assetsEOY;
      if (share < 0.5 || share > 1.08) return false;
      const rest = (wTotal - f.value) / assetsEOY;
      return rest >= 0.7 && rest <= 1.3;
    });
    if (wi >= 0) {
      const rest = wTotal - funds[wi].value;
      const maxRest = funds.reduce((a, f, i) => (i === wi ? a : Math.max(a, f.value)), 0);
      if (maxRest <= rest * 0.5) {
        funds = funds.filter((_, i) => i !== wi);
        best.ratio = rest / assetsEOY;
      }
    }
  }

  /* v133: THE FAIR-VALUE NOTE'S OWN CATEGORY TOTAL, SUMMED BESIDE THE MENU IT
   * TOTALS. The v107 repair above is deliberately narrow — ratio > 1.5, the
   * row worth half the PLAN, the remainder landing 0.7-1.3 — and a category
   * subtotal that is merely large enough to push a menu over its own assets
   * falls straight through it. 32 published plans / 25,456 participants sit at
   * >=1.15x with a top row named `Mutual funds`, `Pooled separate accounts`,
   * `Registered investment companies` or `Total assets at fair value`
   * (Metrolina Greenhouses 34 real rows + `Mutual funds` at 42%, ratio 1.34;
   * Ferrell Hospital 31 + `Pooled separate accounts`, 1.38; Editas Medicine 27
   * + `Mutual funds`, 1.29). Nine of them ENTERED overshoot at v130.
   *
   * The test is ARITHMETIC and the vocabulary only decides what may be
   * removed, never what a row is worth: fire only when the menu OVERSHOOTS,
   * only on a row the shipped aggregate vocabularies name, and only when
   * dropping it brings the remainder INTO the publishable band. A row whose
   * removal does not fix the arithmetic is left alone — it is not a subtotal
   * of what we are showing, and Idex (1.24x, `Mutual Funds` at 70%, remainder
   * 0.37) stays exactly as it is, correctly, because there the MENU is the
   * part we failed to read. */
  if (assetsEOY && funds.length >= 5 && (best.ratio || 0) >= 1.15) {
    const wTotal = funds.reduce((a, f) => a + f.value, 0);
    const wi = funds.findIndex((f) => {
      /* GENERIC_TYPE_NAME and AGG_DISCLOSURE ONLY. `NOT_FUND_SHAPED` was in
       * this test and was taken out on evidence: simulating the rule over all
       * 60,098 published lineups, its `total\b.*` arm dropped **"Total Bond
       * Market Index"** from Fairplay and **"Total International Stock Index
       * Admiral"** from The Roxbury Latin School — two real Vanguard funds.
       * That arm is documented as safe only for a single 90%-dominant row
       * (see AGG_DISCLOSURE's own comment, and v130's first draft deleting
       * IBM's $9.8B "Total Stock Market Index"), and this test is nowhere near
       * that narrow. The cost is that `See attached schedule` and `Other
       * Investments` are no longer removable here; a fabricated row left in
       * place is recoverable, a real fund deleted from a menu is not. */
      const n = String(f.name || "").trim();
      if (!(GENERIC_TYPE_NAME.test(n) || AGG_DISCLOSURE.test(n))) return false;
      const rest = (wTotal - f.value) / assetsEOY;
      return rest >= 0.45 && rest <= 1.15;
    });
    if (wi >= 0) {
      const rest = wTotal - funds[wi].value;
      const maxRest = funds.reduce((a, f, i) => (i === wi ? a : Math.max(a, f.value)), 0);
      // the remainder must look like a MENU, not like one more aggregate
      if (maxRest <= rest * 0.5) {
        funds = funds.filter((_, i) => i !== wi);
        best.ratio = rest / assetsEOY;
      }
    }
  }

  /* v136: A READING THAT CANNOT BE PUBLISHED MUST NOT DISPLACE ONE THAT CAN.
   *
   * Dominion Energy (18,365 participants, $4.92B) published a correct 16-row
   * menu at v134 — its own common stock plus the Vanguard Target Retirement
   * Trust Plus vintages — and lost it at v135 to a twelve-row master-trust
   * note (`Plan's interest in the Master Trust`, `Investments held by the
   * Plan`, `funds(2)`, `value`, `respectively, and Plan's`) sitting at ratio
   * 2.016. Nothing about the menu changed. What changed is that v135's prose
   * predicate correctly removed a $2.25B sentence fragment FROM THE NOTE, and
   * the note's ratio fell 2.474 -> 2.016, which moved its closeness score
   * -0.8406 -> -0.6413 and past the menu's -0.7125.
   *
   * That hazard is already written into this file three hundred lines above —
   * "removing junk can promote a still-junky region" (the Galliano case) — and
   * it will recur with every future row-level guard, because every one of them
   * shrinks junk regions faster than real ones. So the remedy is not another
   * penalty aimed at this vocabulary: it is to stop letting an UNPUBLISHABLE
   * winner bury a publishable alternative. The note at 2.016 could never be
   * shown to a reader under any confidence rule; the menu at 0.453 is what the
   * filing's Schedule H line 4i actually lists.
   *
   * Narrow in both directions, and nothing can be LOST to it:
   *  - it fires only when the winner's ratio is outside the production band
   *    (0.45-1.6), i.e. after both repairs above have had their chance and the
   *    winner still cannot be published;
   *  - the replacement is `bestMenu`, the same object v112/v132/v133 swap to,
   *    which is menu-shaped by construction (>=7 rows, in band, not a
   *    statement / code / provider / split page, largest row not generic, not
   *    an aggregate, not unfund-shaped). Junk cannot swap for junk;
   *  - a plan that had no publishable reading before still has this one, so no
   *    reader trades a lineup for a different lineup — only a blank for a menu.
   */
  if (bestMenu && bestMenu !== best && assetsEOY) {
    const r = best.ratio || 0;
    if (!(r > 0.45 && r < 1.6)) {
      best = bestMenu;
      funds = best.scale > 1 ? best.funds.map((f) => ({ ...f, value: f.value * best.scale })) : best.funds;
    }
  }

  // sub-$10k rows are residue (leaked years, currency cents), not menu
  // options — UNLESS the row proved itself by carrying its own investment-type
  // column, which residue never does. A wound-down vintage really can hold $81
  // (R.H. White's T. Rowe Price 2010), and dropping it made the site show 28
  // holdings where 29 were filed. Values in 1900-2100 stay excluded: those are
  // target-date years that leaked out of a fund name into the value column.
  // Sub-$10k rows are held to a higher bar than the row guards above, because
  // that is exactly the band where an OCR'd Schedule H form line ("@ Total
  // noninterest-bearing CASH … 8181") and stable-value plumbing ("Contract
  // Wrapper - No. GA-63066") live. A subtotal, a wrapper contract or a
  // manager's own name is not a menu option at any size.
  const TINY_JUNK = /\btotals?\b|contract wrapper|\bwrapper\b|capital management|asset management|\bLLC\b|\bL\.L\.C\b/i;
  funds = funds.filter((f) => f.value >= 10000 ||
    (f.ownType && f.value > 0 && !(f.value >= 1900 && f.value <= 2100) &&
     !TINY_JUNK.test(f.name) && !JUNK_NAME_RE.test(f.name)));

  // Some filings itemize every security inside a separately managed account
  // or stock window. Those aren't investment choices — roll them into one
  // line. The sponsor's own stock IS a menu option and stays separate.
  const GENERIC = new Set(["inc", "incorporated", "corp", "corporation", "company", "companies", "llc", "llp", "ltd", "group", "holdings", "holding", "the", "and", "trust", "master", "savings", "plan", "plans", "usa"]);
  const spTokens = sponsorName.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 2 && !GENERIC.has(w)).slice(0, 3);
  /* v151: a sponsor token matches a WORD, not a substring. `national` (First
   * National Bank) was matching Honeywell INTERnational and `red` (American
   * National Red Cross) was matching REDdit, so 24 brokerage picks across 21
   * plans stayed itemized beside the fold as "employer stock". Word bounds
   * lose nothing real: every substring-only match in the store was read. A
   * stricter rule — two tokens, or one uncommon one — was built and REJECTED
   * on the same read: it would have dropped U.S. Bancorp's own $782M row
   * (`bancorp` is the only token left after `u`/`s`), Southern Co's $3.06B,
   * Northern Trust's $271M and Caci's $165M. Costco's one BJ's WHOLESALE row
   * stays, and stays recorded. */
  const spRes = spTokens.map((tok) => new RegExp("\\b" + tok + "\\b"));
  const isEmployer = (n) => { const l = String(n || "").toLowerCase(); return spRes.some((re) => re.test(l)); };
  /* v133: A MENU IS NOT A MANAGED ACCOUNT, and a section header does not
   * govern the rows below it forever.
   *
   * A row with no investment-type column of its own inherits the type of the
   * last section header seen. Where that header is "Common Stock Funds"
   * (Duke), "H&R Block, Inc. Common Stock Fund:" (H&R Block) or the employer
   * stock block, the inheritance runs on over the sections that FOLLOW it —
   * Duke's sixteen "Institutional Funds", H&R Block's twenty-five Vanguard,
   * T. Rowe Price and PIMCO options — and the fold below then rolls the whole
   * MENU into one line: "Managed account holdings (25 positions)" at 96.8% of
   * H&R Block's plan, so its 27,766 participants were shown five rows and not
   * one of their funds. Duke's 35,031 could not see a single target-date fund;
   * Estee Lauder's 18,363 lost twelve JPMorgan vintages and an S&P 500 index
   * fund inside a row that also holds a genuine 62-security sleeve.
   *
   * The fold is right and must stay — itemised securities inside a managed
   * account or a stock window are not investment choices, and unfolding them
   * is the v100-v105 fabrication family in reverse. So the test is two-sided
   * and structural first:
   *   - `ownType` means the FILING typed this row as stock ON THE ROW. Trust
   *     it: Walmart's, Costco's, Danaher's and Parker Hannifin's sleeves stay
   *     folded whatever they are called.
   *   - only a row that INHERITED its type may be reconsidered, and only when
   *     its own name states a pooled product and carries no sign of being a
   *     single issuer (REITs are the trap: "Digital Realty Trust Inc",
   *     "Camden Property Trust", "Kite Realty Group Trust" are stocks).
   *   - the shipped aggregate vocabularies still veto it, so an inherited row
   *     called "Various RIC, CIT, and common stocks" (Capital One, 14% of the
   *     menu) cannot be promoted into a holding.
   * The arithmetic is untouched by construction: one aggregate row becomes N
   * rows summing to the same value, so no ratio and no confidence can move on
   * this alone. */
  const FUND_PRODUCT = /\b(?:funds?|trusts?|index|idx|portfolios?|pool|collective|cit|lifecycle|lifepath|target (?:date|retirement)|money market|stable value)\b/i;
  /* the REIT trap is why `trust` alone cannot decide: "Digital Realty Trust
   * Inc", "Kite Realty Group Trust" and "Camden Property Trust" are single
   * stocks inside real sleeves. The agency names are the same trap for
   * `pool` ("Fannie Mae Pool", "Freddie Mac Pool" in Danaher's bond sleeve). */
  const SINGLE_ISSUER = /\b(?:inc|incorporated|corp|corporation|plc|ltd|llc|l\.l\.c|lp|co\.|compan(?:y|ies)|holdings?|hldgs?|reit|realty|propert(?:y|ies)|bancorp|bancshares|fannie mae|freddie mac|fnma|fhlmc|gnma|ginnie mae|adr|npv|ord)\b|\b(?:fedl?|federal|govt|government)\s+(?:natl?|national|home)\s+(?:mtge?|mortgage|l(?:oa)?n)\b|\bpool\s*#/i;
  // Are these the innards of a managed account (a single menu option) or
  // participants' own brokerage picks? Section headers say; failing that,
  // a plan with the 2R brokerage code and NO aggregate brokerage line is
  // reporting brokerage assets individually (allowed by the instructions).
  const brokRe = /brokerage|self.?directed|sdba|pcra/i;
  /* a row sitting under a BROKERAGE heading is never reconsidered: a
   * participant's own window really does hold ETFs and mutual funds, and
   * those are not menu options either. The rule is for the managed-account
   * bucket, which is where a whole menu can be swallowed. */
  const inheritedMenuRow = (f) => !f.ownType && !brokRe.test(f.sec || "") &&
    FUND_PRODUCT.test(f.name) && !SINGLE_ISSUER.test(f.name) &&
    !NOT_FUND_SHAPED.test(String(f.name).trim()) && !GENERIC_TYPE_NAME.test(String(f.name).trim());
  /* v144: A FLAT TRUSTEE STATEMENT TYPES NOTHING, AND ITS SECURITIES ARE
   * STILL SECURITIES. Boeing's 4i is 7,671 rows in one alphabetical list —
   * no section headers, no type column — so `AON PLC`, `WALMART INC COM`
   * and `FNMA POOL #FM3004 4% 01-01-2046 BEO` carried no type, the fold
   * above (typed `Stock` only) never saw them, and readers were shown the
   * sleeves' innards as menu options beside the NT collective tier funds,
   * with 7,551 more "smaller holdings not shown" at 19% of the plan. A row
   * with no type of its own is a security when its NAME says so — a coupon
   * and maturity, a pool number, a Treasury issue, a repo, a share-class or
   * currency-par suffix, or a corporate suffix (`INC`, `PLC`, `CORP`) — and
   * it is not a pooled product (`FUND_PRODUCT` without a single-issuer
   * marker) and not the employer's own stock. Gated as a FLOOD (≥30 such
   * rows): three untyped stocks in a small plan are left as filed. */
  /* STRONG shapes name an instrument outright — a coupon and maturity, a
   * pool, a Treasury issue, a repo, a currency par — and hold whatever
   * column typed the row; SUFFIX shapes (`INC`, `PLC`, `COM`) are read only
   * on a row with no type of its own, because a section can type a fund. */
  const DATED_SEC = /\d+(?:\.\d+)?\s*%.*\b\d{1,2}[-\/]\d{1,2}[-\/]\d{2,4}\b|\b\d{2}[-\/]\d{2}[-\/]\d{4}\b|\b(?:VAR|FLTG?|FLOAT(?:ING)?)\s*(?:RT|RATE)\b.*\b\d{1,2}[-\/]\d{1,2}[-\/]\d{2,4}\b/i;
  const STRONG_SEC = /\d+(?:\.\d+)?\s*%.*\b\d{1,2}[-\/]\d{1,2}[-\/]\d{2,4}\b|\b\d{2}[-\/]\d{2}[-\/]\d{4}\b|\bDD\s+\d{2}\/\d{2}\/\d{2}\b|\bPOOL\s*(?:#|F[NR]\s)|\bTREAS(?:URY)?\s+(?:BONDS?|NOTES?|BILLS?|BDS?|NTS?|N\/B|ZERO)\b|\bT-?BONDS?\b|\bZERO\s+CPN\b|\bREV(?:ERSE)?\s+REPO\b|\b(?:USD|EUR|GBP|JPY|CHF|THB|HKD|AUD|CAD|SEK|DKK|NOK|KRW|TWD|INR|BRL|ZAR|MXN|SGD|ILS|NZD)\s*\d|\d+(?:\.\d+)?\s*%\s*(?:due\b.*)?$/i;
  const SUFFIX_SEC = /\b(?:COM|COM\s*STK|COMSTK|NPV|ADRS?|PLC|ORD|SHS|(?:ORD|REG)\s+SH|INC|CORP|CORPORATION|COMPANY|LTD|LLC|LP|CO|SA|SE|AG|NV|BEO|MTN|DEBS?|NTS?|BDS?|PFD|WTS?|DUE|DTD|TREAS|BANCORP|REG|TAXABLE|(?:FLTG|VAR)(?:\s+RT)?|CLS?\s+[A-Z]|CLASS\s+[A-Z]|COM\s+NEW|SPON(?:SORED)?\s+ADR|ADR\s+NEW)\.?\s*$/i;
  /* securitisations and structured notes — Dell's sleeves: `NAVIENT STUDENT
   * LOAN TRUST 2023`, `CARMAX AUTO OWNER TRUST 2022-1 A2`, `GALAXY XXII CLO
   * LTD TSFR3M+124`, `FNMA GTD MTG PASS THRU CTF SOFR30A+145`. Named with a
   * vintage, a floating-rate index, or a pass-through; `trust` here is an
   * issuing vehicle, not a pooled product, so the pooled veto stands aside. */
  const SECURITIZATION = /\b(?:TRUST|TR)\s+20\d\d(?:-[A-Z0-9]+)?\b|\b20\d\d-[A-Z0-9]{1,6}\b|\bCLO\b|\b(?:TSFR|SOFR|LIBOR|BSBY)\s*\d*[A-Z]*\s*\+\s*\d+|\bPASS[- ]?THRU\b|\bCTFS?\b|\b(?:OWNER|LEASE|LOAN|RECEIVABLES|CARD|ISSUANCE|FUNDING|EQUIPMENT|STUDENT)\s+(?:LOAN\s+)?TR(?:UST)?\b|\bMTG\s+(?:TR|TRUST|SECS?|PASS)\b/i;
  const SECURITY_SHAPE = new RegExp(`${STRONG_SEC.source}|${SUFFIX_SEC.source}|${SECURITIZATION.source}`, "i");
  /* a type a SECTION can hand a security: under `Corporate bonds` or
   * `Government securities` the rows are instruments, and Peterson Holding's
   * 76 `Wells Fargo & Company 5.875% Due 12-31-49` rows sat behind the cap
   * typed by their section. Pooled-product types (mutual fund, collective
   * trust, stable value) never fold. */
  const SEC_TYPE = /^(?:Stock|Company stock|Government securities|Corporate debt|Separate account|Cash \/ short-term)$/;
  /* Costco's sleeves name the SECURITY TYPE in the description column —
   * `Foreign Stock`, `Preferred Stock`, `… Tangible Equity Units Convertible
   * Equity` — twenty bare `Foreign Stock` rows in one region. Inside a flood
   * those are securities too; a lone category line in a real menu cannot
   * reach the ≥30 gate on its own. */
  const TYPE_LABEL_ROW = /^(?:foreign|preferred|common|domestic|international|convertible|corporate|government|municipal|agency|mortgage[- ]backed|asset[- ]backed)\s+(?:stocks?|equit(?:y|ies)|bonds?|notes?|securities|debt|obligations?)\s*$|\b(?:foreign|preferred|common)\s+stock\s*$|\bconvertible\s+(?:equity|bonds?|notes?|debt|preferred)\s*$|\bequity\s+units?\s*$/i;
  const untypedSecurity = (f) => {
    if (isEmployer(f.name)) return false;
    if (f.type && !SEC_TYPE.test(f.type)) return false;
    const nm = String(f.name || "").trim();
    /* v152: a coupon with a maturity date is a BOND whatever noun it carries.
     * `TRANSCANADA TRUST 5.3%/VAR 03/15/2077` (Marriott, ten rows), `GUARDIAN
     * LIFE GLOBAL FUND 144A 1.625% 09/16/2028` (a funding-agreement note),
     * `VERIZON MASTER TRUST 4.62% 11/20/2030` read as pooled on `trust` /
     * `fund` and stayed itemized beside the fold — 280 rows / 42 plans /
     * 1.07M ppl on the v147 store (Boeing 33 of 75 rows). A pooled vehicle
     * has no coupon and no maturity. */
    const pooled = FUND_PRODUCT.test(nm) && !SINGLE_ISSUER.test(nm) && !SECURITIZATION.test(nm) && !DATED_SEC.test(nm);
    if (f.type && f.ownType) return (STRONG_SEC.test(nm) || SECURITIZATION.test(nm)) && !pooled;
    if (TYPE_LABEL_ROW.test(nm)) return true;
    return SECURITY_SHAPE.test(nm) && !pooled && !NOT_FUND_SHAPED.test(nm) && !GENERIC_TYPE_NAME.test(nm);
  };
  tracePost("before-subtotal");
  /* v149 (queue item n): A CLASS SUBTOTAL BESIDE ITS OWN ITEMISATION.
   * Marriott (152,118 participants) files `COMMON STOCKS … 4,408,382,764`
   * as a class line and then the stocks it totals, one per row; the parser
   * kept both, so the published sum double counts and the region's ratio
   * (0.79) is an accident of how much of the plan the schedule covers. The
   * test is ARITHMETIC in FILED ORDER (`ordered`, the pre-dedup leaves):
   * a class-label row whose value equals — within 0.5% — the sum of the
   * run of non-label rows immediately AFTER it (or immediately BEFORE it,
   * for filings that print the total under the items), at least three
   * rows long, is the subtotal of those rows and is dropped; the ratio is
   * corrected by what was dropped. Post-selection, like v107 and v133, so
   * it cannot change which region wins; unlike them it needs no overshoot,
   * because a subtotal beside its items is a double count at any ratio —
   * Marriott's honest ratio is nearer 0.4 than 0.79, and that may put the
   * region below the band. 75 confident lineups / 225,667 participants
   * publish a class row at >=10% beside an itemisation (a floor). */
  {
    /* the rule now lives in `subtotalIndices`, applied at the leaves stage in
     * parseRows (a subtotal that reaches the restatement cut has already done
     * its damage); this post-selection copy is kept inert so the mechanism is
     * documented once — `ord` is empty, nothing below fires */
    const ord = [];
    /* a label is any name made ONLY of class words — the Verizon trust's
     * summary siblings (`CORPORATE STOCK - COMMON`, `PARTICIPANT LOANS`,
     * `INTEREST-BEARING CASH`) are labels too, and six of them summed within
     * 2% of the `COMMON/COLLECTIVE TRUST` total, which the first draft read
     * as that label's itemisation (parser gate) */
    const CLASS_ONLY = /^(?:(?:corporate|common|preferred|government|governmental|u\.?s\.?|treasury|agency|municipal|foreign|domestic|international|global|interest[- ]bearing|cash|equi[a-z]{4,9}|securities|stocks?|bonds?|debt|equit(?:y|ies)|debentures?|notes?|obligations?|loans?|participants?|receivables?|other|total|investments?|at|fair|value|contracts?|collective|common\/collective|pooled|separate|accounts?|registered|investment|compan(?:y|ies)|mutual|funds?|trusts?|guaranteed|insurance|synthetic|short[- ]term|fixed[- ]income|real\s+estate|and|&)(?![a-z0-9])[\s,.\-–—/()]*)+$/i;
    const isLabel = (r) => {
      const n = String((r && r.name) || "").trim();
      return !!n && (GENERIC_TYPE_ANY.test(n) || GENERIC_TYPE_NAME.test(n) || TYPE_LABEL_ROW.test(n) ||
        (CLASS_ONLY.test(n) && /(?:stocks?|bonds?|debt|securities|equit(?:y|ies)|loans?|cash|trusts?|accounts?|funds?|compan(?:y|ies)|contracts?|notes?|obligations?|debentures?)\b/i.test(n)));
    };
    const near = (a, b) => Math.abs(a - b) <= Math.max(1, b * 0.005);
    /* the run may UNDERSHOOT the label by the rows the parser could not read
     * (wrapped names, marker lines): Marriott's `COMMON STOCKS` 4,408,382,764
     * is followed by 443 stocks summing to 4,332,267,516 (98.3%), its
     * `CORPORATE BONDS` by 673 bonds at 97.2%, its `COMMON/COLLECTIVE TRUST`
     * and `MUTUAL FUNDS` by exact sums. A run within 97–100.5% of the label,
     * three rows or more, is the label's own itemisation. */
    const keyOf0 = (n) => String(n || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
    /* the label may only go when its ITEMS are in the published set: the
     * Verizon Master Savings Trust's summary page (12 class rows, the honest
     * lineup) is followed by thousands of per-security detail rows that
     * sum to each class and are NOT in the winner — dropping `COMMON STOCK`
     * there removed $16.3B and left the summary with nothing (parser gate).
     * Items present in `funds` must carry at least half the label's value. */
    const inFunds = new Map(); for (const f of funds) inFunds.set(keyOf0(f.name), (inFunds.get(keyOf0(f.name)) || 0) + (+f.value || 0));
    const scale0 = best.scale > 1 ? best.scale : 1;
    const runSum = (from, step, target) => {
      let s = 0, n = 0, present = 0;
      for (let j = from; j >= 0 && j < ord.length && !isLabel(ord[j]); j += step) {
        const v = +ord[j].value || 0; s += v; n++;
        if (inFunds.has(keyOf0(ord[j].name))) present += v;
        if (s > target * 1.005) return false;
      }
      return n >= 3 && s >= target * 0.97 && s <= target * 1.005 && present * scale0 >= target * scale0 * 0.5;
    };
    const drop = [];
    for (let i = 0; i < ord.length; i++) {
      const L = ord[i];
      if (!L || !(+L.value) || !isLabel(L)) continue;
      if (TRACE_ROWS) {
        let sa = 0, na = 0, pa = 0; for (let j = i + 1; j < ord.length && !isLabel(ord[j]); j++) { sa += +ord[j].value || 0; na++; if (inFunds.has(keyOf0(ord[j].name))) pa += +ord[j].value || 0; }
        let sb = 0, nb = 0; for (let j = i - 1; j >= 0 && !isLabel(ord[j]); j--) { sb += +ord[j].value || 0; nb++; }
        console.error(`[label] ${JSON.stringify(String(L.name).slice(0, 40))} ${L.value}  after: ${na} rows ${sa} (present in funds ${pa})  before: ${nb} rows ${sb}`);
      }
      if (runSum(i + 1, 1, +L.value) || runSum(i - 1, -1, +L.value)) drop.push(L);
    }
    if (drop.length && ord.length >= 6) {
      const keyOf = (n) => String(n || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
      const scale = best.scale > 1 ? best.scale : 1;
      const dropKeys = new Map(); for (const r of drop) dropKeys.set(keyOf(r.name), (+r.value) * scale);
      let removed = 0;
      funds = funds.filter((f) => {
        const v = dropKeys.get(keyOf(f.name));
        if (v === undefined || !near(+f.value, v)) return true;
        removed += +f.value; return false;
      });
      if (removed && assetsEOY) best.ratio = Math.max(0, (best.ratio || 0) - removed / assetsEOY);
      if (TRACE_ROWS && removed) console.error(`[subtotal] dropped ${drop.length} class subtotal(s) worth ${removed}; ratio now ${(best.ratio || 0).toFixed(3)}: ${drop.map((r) => `${String(r.name).slice(0, 30)}=${r.value}`).join(" | ")}`);
    }
  }
  const untypedFlood = funds.filter(untypedSecurity);
  const itemized = funds.filter((f) => (f.type === "Stock" || f.type === "Company stock") &&
    !isEmployer(f.name) && !inheritedMenuRow(f));
  if (untypedFlood.length >= 30) for (const f of untypedFlood) if (!itemized.includes(f)) itemized.push(f);
  if (TRACE_ROWS && TRACE_MATCH && !/^\d+$/.test(TRACE_MATCH)) {
    for (const f of itemized) if (String(f.name).includes(TRACE_MATCH)) console.error(`[fold] itemized ${JSON.stringify(String(f.name).slice(0, 60))} type=${f.type || "-"} own=${f.ownType ? 1 : 0} sec=${JSON.stringify(f.sec || "")} untyped=${untypedSecurity(f) ? 1 : 0}`);
  }
  /* v144 TRIED AND WITHDREW a rule folding every row under a brokerage
   * heading whatever its type. U.S. Bancorp's schedule lists `Self-Directed
   * Brokerage Account $214M` as a HOLDING LINE, the section tracker took it
   * for a heading, and the seventeen Vanguard trusts that follow it —
   * $11.07B, 88% of the plan — folded into one "Participant brokerage
   * holdings" row with the ratio untouched and every guard silent. The v100
   * shape exactly. A section label is not evidence about the rows that
   * follow a holding; only a row's own name and type may classify it. */
  let sma = null, smaKind = null, sdbaOut = best.sdba;
  if (itemized.length >= 3) {
    const brokRows = itemized.filter((f) => brokRe.test(f.sec || ""));
    const mgdRows = itemized.filter((f) => !brokRe.test(f.sec || ""));
    const hasAggSdba = funds.some((f) => f.type === "Brokerage window");
    const noSectionInfo = brokRows.length === 0 && !itemized.some((f) => brokRe.test(f.sec || ""));
    const treatAllAsBrok = noSectionInfo && !hasAggSdba && /2R/.test(codes);
    const itemSet = new Set(itemized);
    const keep = funds.filter((f) => !itemSet.has(f));
    const buckets = [];
    if (treatAllAsBrok) buckets.push(["Participant brokerage holdings", "Brokerage window", itemized]);
    else {
      if (brokRows.length) buckets.push(["Participant brokerage holdings", "Brokerage window", brokRows]);
      if (mgdRows.length) buckets.push(["Managed account holdings", "Managed account", mgdRows]);
    }
    for (const [label, type, list] of buckets) {
      keep.push({ name: `${label} (${list.length} positions)`, type, value: list.reduce((a, f) => a + f.value, 0) });
      if (type === "Brokerage window") sdbaOut = true;
    }
    funds = keep.sort((a, b) => b.value - a.value);
    sma = itemized.slice(0, 150).map((f) => ({ name: f.name, type: f.type, value: f.value }));
    smaKind = treatAllAsBrok || (brokRows.length && !mgdRows.length) ? "brokerage"
      : brokRows.length ? "mixed" : "managed";
  }
  for (const f of funds) { delete f.sec; delete f._sl; }

  /* v141: "fbo <person>" IS ONE PARTICIPANT'S ACCOUNT, NOT A MENU OPTION.
   * A self-directed brokerage account is sometimes itemised "fbo Jane Doe
   * (Roth)" — for the benefit of one named participant. Nelnet published two
   * such rows. They are the brokerage window's contents, folded into the
   * same aggregate row the itemised-securities fold produces, and a person's
   * name never becomes a holding. Anchored on a leading "fbo": an insurer's
   * contract "Allianz Life … FBO the Plan" is a plan asset and stays. */
  {
    const fbo = funds.filter((f) => /^f\/?b\/?o\s/i.test(String(f.name || "")));
    if (fbo.length) {
      const sum = fbo.reduce((a, f) => a + (f.value || 0), 0);
      funds = funds.filter((f) => !fbo.includes(f));
      const label = "Participant brokerage holdings";
      const agg = funds.find((f) => f.type === "Brokerage window" && /^Participant brokerage holdings \(\d+ positions\)$/.test(f.name));
      if (agg) { agg.name = `${label} (${+agg.name.match(/\((\d+)/)[1] + fbo.length} positions)`; agg.value += sum; }
      else funds.push({ name: `${label} (${fbo.length} positions)`, type: "Brokerage window", value: sum });
      funds.sort((a, b) => b.value - a.value);
      sdbaOut = true;
    }
  }

  /* v144: the display cap, applied AFTER the folds so a flood of securities
   * collapses into its aggregate row before the largest 120 are chosen. The
   * cut is what remains beyond the cap once the folds have run. */
  let foldCut = null;
  if (uncapped) {
    /* A row from BEYOND the old cap is shown only when it is a pooled
     * product or reads as one; a deep row the shapes did not recognise —
     * Dell's `NAVIENT STUDENT LOAN TRUST 2023`, `GALAXY XXII CLO LTD
     * TSFR3M+124`, ninety of them — stays in the "not shown" tail it was in
     * before, rather than surfacing as a menu option because the fold made
     * room. The fold reveals real funds and buries securities; it never
     * trades one hidden tail for a visible one. */
    const fundish = (f) => !f._deep || /holdings \(\d+ positions\)$/.test(f.name) ||
      (f.type && !SEC_TYPE.test(f.type)) || (FUND_PRODUCT.test(f.name) && !SINGLE_ISSUER.test(f.name) && !DATED_SEC.test(f.name));
    const shown = funds.filter(fundish).sort((a, b) => b.value - a.value);
    const buried = funds.filter((f) => !fundish(f));
    const c1 = cutTail(shown);
    const n = (c1 ? c1.n : 0) + buried.length, v = (c1 ? c1.v : 0) + buried.reduce((a, f) => a + (f.value || 0), 0);
    foldCut = n ? { n, v } : null;
    funds = shown.slice(0, ROW_CAP);
  }
  for (const f of funds) delete f._deep;
  /* v154: an issuer cell repeated on (nearly) every row and ending in a TYPE
   * phrase is the statement's own label, not the firm behind each fund.
   * TIAA's certified schedule prints `College Retirement Equities Fund
   * variable annuities` in the issuer column of EVERY row — Vanguard index
   * funds and Schwab S&P 500 included — and 13,731 rows / ~1,000 403(b)
   * plans / 1.45M ppl rendered `[College Retirement Equities Fund variable
   * annuities] Vanguard Small-Cap Idx Adm`. A house that really runs a whole
   * menu (`[T. Rowe Price] Retirement 2050 Fund`) carries no type word and
   * is untouched; the threshold is 90% of rows sharing one cell. */
  if (funds.length >= 5) {
    const tally = new Map(), tailed = new Map();
    for (const f of funds) if (f.iss) { tally.set(f.iss, (tally.get(f.iss) || 0) + 1); if (f._it) tailed.set(f.iss, (tailed.get(f.iss) || 0) + 1); }
    for (const [cell, n] of tally) {
      /* the cell's type tail was stripped at row creation (`_it`), so judge
       * the tail there: a headless `College Retirement Equities Fund` on 90%
       * of rows is still the statement's label */
      if (n / funds.length >= 0.9 && (ISS_TYPE_TAIL.test(cell) || (tailed.get(cell) || 0) === n)) {
        if (TRACE_ROWS) console.error(`[iss] statement-level issuer cell cleared from ${n} of ${funds.length} rows: ${JSON.stringify(cell)}`);
        for (const f of funds) if (f.iss === cell) delete f.iss;
      }
    }
  }
  for (const f of funds) delete f._it;
  tracePost("after-fold-and-cap");

  // trust-POINTER pages: a member plan's own 4i is often just "Interest in
  // <X> Master Trust $8B" plus a stray row or two (Eaton: + stable value +
  // loans). At 3+ rows and ratio ≈ 1 it sailed through the confidence rule
  // and displayed as a "lineup" — the real menu lives in the trust's own
  // filing. When trust-interest rows dominate a small parse, flag it so it
  // can never be marked confident.
  const trustish = funds.filter(isTrustPointerRow);
  const tSum = trustish.reduce((a, f) => a + f.value, 0);
  const allSum = funds.reduce((a, f) => a + f.value, 0);
  /* v157: the ≤8-row gate let a pointer through whenever a few real rows sat
   * beside it — Caterpillar (60,484 ppl) published `Investments Interest in
   * the Master Trust` at 90% of a nine-row "menu", Cleveland-Cliffs at 97% of
   * thirteen, IBEW Local 25 at 99% of eleven: 5 confident lineups / 70,874
   * ppl on the v155 store. A pointer that is three quarters of the page is a
   * pointer at any length; the real menu is in the trust's own filing. */
  const trustPtr = allSum > 0 && tSum / allSum >= 0.6 && (funds.length <= 8 || tSum / allSum >= 0.75);

  // provider-TOTAL statement pages: "T. Rowe Price $479M / Vanguard $271M /
  // Ariel $12M" is assets-at-custodian, not a menu. Judged at PARSE level,
  // not row level — a v49 row-level drop of bare provider names shifted
  // sums/region scores and killed ~1,300 real menus that carry ONE
  // legitimate provider-aggregate row among their real funds.
  const provAgg = isProviderAgg(funds);

  /* v105: ONE ROW THAT IS NOT A FUND, CARRYING THE WHOLE PLAN.
   *
   * A menu is many holdings. When a single row is 90%+ of the shown sum AND
   * that row is not even fund-shaped, what was parsed is an aggregate or a
   * statement line, not a lineup — and publishing it puts a holding on the
   * page that no participant can own.
   *
   * Comcast is the clearest: its public filing contains NO Schedule H 4i
   * table at all (no "Identity of issue" header anywhere), its money sits in
   * a master trust, and we published a confident 5-row lineup whose top row
   * was "At fair value" at 91% — a dot-leader line lifted off the Statement
   * of Net Assets, on a $19.69B plan. Others in the same shape: United
   * Airlines "Investments Held in the Trust" 96%, Providence and Albertsons
   * and Robert Bosch "Various (includes Registered Investment Companies…)"
   * 100%, Altria "Master Trust" 100%, Alight "CUSIP:" 95%, WVU "b Total
   * mutual funds" 92%.
   *
   * Measured across published lineups: of 373 whose top row is >=90% of the
   * sum, 50 have a top row that is not fund-shaped — $83.9B of plan assets —
   * and the other 323 ($34.8B) are plausible single-holding plans, which this
   * must not touch. So the test is BOTH conditions, never dominance alone.
   * The existing trustPtr rule misses these because it needs trust vocabulary
   * and <=8 rows; "At fair value" is neither.
   *
   * Flagged as `stmt`, which the confidence predicate already refuses, so
   * these become honest gaps with a recorded cause rather than a fabricated
   * menu. */
  const topRow = funds.reduce((a, f) => (f.value > (a ? a.value : -1) ? f : a), null);
  /* v111: the single-dominant-row test also condemns a GENERIC TYPE name.
   * Premier Care's fallback filing published "Mutual Funds" at 99.4% of a
   * $55M plan — a category, not a holding — which NOT_FUND_SHAPED misses
   * ("mutual funds" lives in GENERIC_TYPE_NAME). Product-named single
   * holdings (the 319 honest ones v105 preserved) match neither list. */
  const aggOnly = !!topRow && allSum > 0 && topRow.value / allSum >= 0.9 &&
    (NOT_FUND_SHAPED.test(String(topRow.name || "").trim()) ||
     GENERIC_TYPE_ANY.test(String(topRow.name || "").trim()));
  /* v110/v111: dominance SPLIT between aggregates evades the single-row
   * test. MetLife's fallback filing reports "Participant directed
   * investments" ($4.12B, 58%) plus "Fully benefit responsive investment
   * contract" ($2.89B, 41%) — together 99.7% of the region, neither alone
   * >=90% — and shipped as a confident lineup of an $8.3B plan.
   *
   * The vocabulary here must be NARROWER than NOT_FUND_SHAPED: its
   * `total\b.*` arm is safe when one row carries 90% alone (that is always
   * a subtotal) but v110 used the full list for the split test and
   * withdrew five honest three-fund Vanguard menus — "Total Stock Market
   * Index", "Total International Stock Index", "Total Bond Market Index"
   * are real funds whose names START with "Total". Only unambiguous
   * accounting-disclosure phrasing counts toward a split. */
  const aggRows = funds.filter((f) => AGG_DISCLOSURE.test(String(f.name || "").trim()));
  const aggSum = aggRows.reduce((a, f) => a + f.value, 0);
  const aggSplit = allSum > 0 && aggRows.length >= 2 && aggRows.length <= 3 && aggSum / allSum >= 0.9;

  // a statement-vocabulary fragment can still WIN when it's the only
  // candidate (the real schedule is scanned or absent) — surface the flag
  // so it can never be marked confident
  return { found: true, thousands: best.scale > 1, sdba: sdbaOut, funds, ratio: best.ratio, ...(best.stmt || provAgg || aggOnly || aggSplit ? { stmt: 1 } : {}), ...(trustPtr ? { trustPtr: 1 } : {}), ...(sma ? { sma, smaKind } : {}), ...(uncapped ? (foldCut && foldCut.n ? { cut: { n: foldCut.n, v: Math.round(foldCut.v) } } : {}) : best.cut && best.cut.n ? { cut: { n: best.cut.n, v: Math.round(best.cut.v * (best.scale > 1 ? best.scale : 1)) } } : {}) };
}

/* The public entry point. Pass 1 is v113 exactly. Pass 2 runs only when pass 1
 * returned found:false — nohead (no title anywhere) or noregion (a title fired,
 * commonly in a table of contents, but nothing under it scored as a table) —
 * and adds the statutory column caption as a region seed. When the retry also
 * finds nothing, pass 1's diagnosis is what gets recorded, so `dx` keeps
 * describing the first pass and the census stays comparable across versions. */
/* PUBLIC RETURN SHAPE IS A CONTRACT. Every exit of this function carries a
 * `funds` ARRAY, empty when nothing was found.
 *
 * The internal passes take shortcuts — `{ found: false, why: "nohead" }` with
 * no `funds` at all — and for a long time that was fine, because every caller
 * checked `.found` first. Then fetch-4i's OCR trigger was rewritten to call
 * `isConfident(parsed)` before `.found`, and `parsed.funds.length` threw a
 * TypeError on precisely the filings whose schedule could not be located:
 * 11,366 of them per run, $548B and 9.68M participants, silently misfiled as
 * download failures for three runs, and the same throw killed the prior-year
 * rescue behind Lowe's 31-fund menu.
 *
 * Guarding the consumer (done) fixes that caller. Guarding the SHAPE here
 * closes the class, so the next caller that reaches for `.funds` before
 * `.found` gets an empty array instead of an exception. Cheap, and it changes
 * nothing observable: `found` still decides, and an empty array fails every
 * length test the same way a missing one was supposed to. */
export function parse4i(text, assetsEOY, sponsorName = "", codes = "") {
  const out = parse4iInner(text, assetsEOY, sponsorName, codes);
  if (!Array.isArray(out.funds)) return { ...out, funds: [] };
  applyLegend(out, text);
  return out;
}

/* v140: THE SCHEDULE NAMES ITS HOLDINGS BY CODE AND DEFINES THE CODES IN A
 * LEGEND. Empower's (Great-West's) 4i template prints one column headed
 * "INVESTMENT OPTION" holding an internal code — `1VTIVX`, `1JPB40C`,
 * `1P0139A`: a leading "1" and, usually, the fund's ticker — beside the
 * cost and value columns, and then a LEGEND block after the table:
 *
 *   LEGEND
 *     INVESTMENT OPTION:
 *        1VTIVX   Vanguard Target Retirement 2045 Inv     1VFIFX   Vanguard Target Retirement 2050 Inv
 *
 * The rows parsed, the codes were published as the holding names, and the
 * ticker lookup resolved none of them: 742 plans / 709,129 participants /
 * 14,802 rows on the v139 store (619 of the plans Empower's), every fee cell
 * blank, every reader shown "1VFIAX" for the Vanguard 500 fund. The legend is
 * the filing's own statement of what each code means, so a row whose name IS
 * a legend code takes the legend's name; the code is kept on the row for
 * provenance. Codes read by OCR as "I…" (2,958 rows) match only when the
 * legend was read the same way, which is the honest outcome — no guessing at
 * a code the filing did not define. Two-column legends are split on a run of
 * three or more spaces before the next code. */
const LEGEND_CODE = /^[1I][A-Z0-9]{4,7}$/;
function legendMap(text) {
  const at = text.search(/^[ \t]*LEGEND[ \t]*$/m);
  if (at < 0) return null;
  const map = new Map();
  const pair = /(?:^|\s{2,})([1I][A-Z0-9]{4,7})\s{2,}(\S(?:.*?\S)?)(?=\s{3,}[1I][A-Z0-9]{4,7}\s{2,}|\s*$)/g;
  for (const line of text.slice(at).split("\n")) {
    if (!/^\s*(?:[1I][A-Z0-9]{4,7})\s{2,}\S/.test(line)) continue;
    let m;
    pair.lastIndex = 0;
    while ((m = pair.exec(line))) {
      const name = m[2].replace(/\s+/g, " ").trim();
      if (name.length >= 4 && /[a-z]/i.test(name) && !map.has(m[1])) map.set(m[1], name);
    }
  }
  return map.size ? map : null;
}
function applyLegend(out, text) {
  if (!out.found || !out.funds.length) return;
  if (!out.funds.some((f) => LEGEND_CODE.test(String(f.name || "").trim()))) return;
  const map = legendMap(text);
  for (const f of out.funds) {
    const k = String(f.name || "").trim();
    const nm = map && map.get(k);
    if (nm) { f.code = k; f.name = nm; continue; }
    /* v143: NO LEGEND IN THE PUBLIC COPY, BUT THE CODE IS A TICKER. On the
     * v140 store 249 plans still published Empower codes: their filings carry
     * the coded table and no LEGEND page at all (or OCR read the "1" as "I"
     * and the legend the other way). Empower's code is the fund's ticker with
     * a leading "1", and the SEC's class index (sec-funds.json, generated
     * from the Commission's own series/class file) names 29k tickers. A
     * five-letter mutual-fund ticker the index knows is an identification,
     * not a guess: 2,166 rows / 261 plans / 270,296 participants measured
     * (IRAFEX -> AMCAP Fund Class R-4). Anything else stays a code. */
    const t = k.match(/^[1I]([A-Z]{4}X)$/);
    const hit = t && secTickerName(t[1]);
    if (hit) { f.code = k; f.name = hit; f.tk = t[1]; }
  }
}
let SEC_BY_TICKER = null;
function secTickerName(tk) {
  if (SEC_BY_TICKER === null) {
    SEC_BY_TICKER = new Map();
    try {
      const p = join(dirname(fileURLToPath(import.meta.url)), "..", "sec-funds.json");
      if (existsSync(p)) {
        for (const [name, ticker, , cls] of JSON.parse(readFileSync(p, "utf8")).funds) {
          if (!ticker || SEC_BY_TICKER.has(ticker)) continue;
          const series = String(name).split(" :: ").pop().trim();
          const c = String(cls || "").trim();
          SEC_BY_TICKER.set(ticker, c && !new RegExp(c.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i").test(series) ? `${series} ${c}` : series);
        }
      }
    } catch { /* an unreadable index names nothing; codes stay codes */ }
  }
  return SEC_BY_TICKER.get(tk) || null;
}

function parse4iInner(text, assetsEOY, sponsorName = "", codes = "") {
  const first = parse4iPass(text, assetsEOY, sponsorName, codes, false);
  if (first.found) {
    /* v115: BAND-HI also gets the retry. A region whose holdings sum at or
     * above 1.6x the plan's assets is never published — it fails the
     * confidence band — so retrying it cannot withdraw anything; the only
     * possible outcome is a lineup where there was none. The mechanism the
     * retry fixes is specific: the statutory TITLE sits above a fair-value
     * note, and the region seeded from it swallows the note's own totals
     * alongside the real table. The COLUMN CAPTION sits at the top of the
     * table itself, so a caption-seeded candidate excludes the note and
     * competes on its own merits.
     *
     * The retry's result is accepted ONLY if it is confident by the exact
     * production predicate; anything less and the first pass's diagnosis is
     * kept untouched, so `dx` keeps meaning what it meant and the census
     * stays comparable. Measured on a RANDOM 40-plan draw from the 212 live
     * band-hi plans: 9 recovered, every one of their 315 published values
     * present verbatim in its own filing, zero generic-named rows. */
    /* v157 part 3: ...and so does ANY unpublishable first pass, statements
     * included. Frx Management (201 ppl, OCR text): a 4-row junk region at
     * 2.196 and a 2-row `Mutual funds` statement at 1.708 tie to the fourth
     * decimal; when the junk region won, this retry ran and the caption pass
     * found the 12-row LifePath menu at 0.894; when v156's tie-break let the
     * statement win, `!first.stmt` skipped the retry and the plan published
     * nothing. Which junk wins a dead heat must not decide whether the real
     * menu is looked for. Same acceptance rule: only a publishable shape
     * replaces the first pass, so nothing can be withdrawn by it. */
    if (!publishableShape(first) && !first.trustPtr) {
      const r = parse4iPass(text, assetsEOY, sponsorName, codes, true);
      if (publishableShape(r)) return r;
    }
    /* v135: a promoted ONE-ROW trust pointer must not cost the caption pass.
     * Before v135 a filing whose only region was that single row returned
     * `found:false` and the caption pass ran; now pass 1 finds something, and
     * without this the retry would be skipped and a real menu sitting under a
     * bare column caption would be lost. Accepted only if it is publishable by
     * the production shape, exactly like the band-hi retry above. */
    if (first.trustPtr && first.funds.length === 1) {
      const r = parse4iPass(text, assetsEOY, sponsorName, codes, true);
      if (publishableShape(r)) return r;
    }
    return first;
  }
  const retry = parse4iPass(text, assetsEOY, sponsorName, codes, true);
  if (retry.found) return retry;
  // "consolidated" is a fact about the DOCUMENT, not about which seed fired,
  // so it outranks pass 1's nohead/noregion as the recorded cause.
  return retry.why === "consolidated" ? retry : first;
}

/* ---- plan-feature extraction from the filing's audit notes ---------------- */

/* The "Notes to Financial Statements — Description of the Plan" section of
 * the audited statements (attached to every 100+ participant filing) spells
 * out the match formula, vesting schedule, Roth/after-tax options, and
 * auto-enrollment in prose. Extract what's stated; stay silent otherwise. */
/* ---- v96: a vesting schedule the filing has already replaced ----------------
 * Found 2026-09-01 by diffing labels after run #186 and then reading the
 * filing rather than the stored quote. Plan 20251006163156NAL0004018177001
 * shipped as "Graded schedule" and vests IMMEDIATELY. Its note prints a
 * 20/40/60/80/100 table introduced as the schedule "through the year ended
 * December 31, 2023", and then says:
 *
 *   "Effective January 1, 2024, matching contributions and non-elective
 *    Employer contributions are 100 percent vested at all times."
 *
 * Every table reader read the table and none read the sentence retiring it.
 * v86/v87 already guard superseded PROSE, but only in the "Prior to <date>"
 * shape and only on the cliff and immediate paths.
 *
 * This is a property of the NOTE, not of any one reader, so per the rule
 * earned in v84/v86 it is applied once, after every vesting reader has run,
 * and corrects whichever label they produced.
 *
 * Three conditions, all required, because each one alone is common and
 * harmless:
 *   1. the schedule is explicitly confined to a PAST period;
 *   2. a DATED replacement asserts full vesting;
 *   3. that replacement covers EMPLOYER money — "effective January 1 2024
 *      participants are 100% vested in their elective deferrals" is always
 *      true and supersedes nothing.
 * Plus: the replacement must already be in force for the year the document
 * reports, so a subsequent-event note in an earlier filing cannot rewrite
 * that year's actual schedule. */
const V96_MONTH = "(?:January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sept?|Oct|Nov|Dec)";
const V96_SCOPE = new RegExp(
  "(?:through|thru)\\s+the\\s+(?:year|plan\\s+year|period)\\s+ended\\b"
  + "|for\\s+plan\\s+years\\s+(?:beginning\\s+)?(?:prior\\s+to|before)\\b"
  + "|(?:applicable|in\\s+effect)\\s+(?:for|through)\\s+(?:plan\\s+)?years?\\s+(?:prior|ended|ending)\\b", "i");
const V96_REPLACEMENT = new RegExp(
  "effective\\s+(?:as\\s+of\\s+)?" + V96_MONTH + "\\s+\\d{1,2},?\\s+(20\\d\\d)"
  + "[^.]{0,240}?(?:100\\s*(?:percent|%)|fully)\\s*vested", "i");

// the document's own reporting year: the latest year stated in a full date
function v96ReportYear(t) {
  let y = 0;
  for (const m of t.matchAll(new RegExp(V96_MONTH + "\\s+\\d{1,2},?\\s+(20\\d\\d)", "gi")))
    if (+m[1] > y && +m[1] <= 2030) y = +m[1];
  return y || null;
}

function supersededSchedule(t) {
  if (!V96_SCOPE.test(t)) return null;
  const rm = V96_REPLACEMENT.exec(t);
  if (!rm) return null;
  const win = t.slice(rm.index, rm.index + 320);
  if (!/matching|employer|company|non.?elective|profit.?sharing|safe.?harbor/i.test(win)) return null;
  const ry = v96ReportYear(t);
  if (ry && +rm[1] > ry) return null;

  /* v97: THE REPLACEMENT MUST COVER THE MONEY THAT CARRIES THE SCHEDULE.
   *
   * Caught by the label diff on run #188 before it was mirrored. Plan
   * 20260707164235NAL0032859234001 says:
   *
   *   "Participants become 100 percent vested in the discretionary MATCH
   *    company contributions and the nonelective discretionary company
   *    contributions after three years of service. … Effective January 1,
   *    2026, the Plan was amended and participants are immediately 100
   *    percent vested in NONELECTIVE DISCRETIONARY company contributions."
   *
   * The amendment freed one money type. The discretionary match still has a
   * three-year cliff, and v96 relabelled the plan "Immediate" — telling a
   * participant their match is theirs today when it is not. Wrong is worse
   * than blank here, as v83 already recorded.
   *
   * So: if any OTHER sentence still puts employer money behind a service
   * condition, and that sentence is NOT itself scoped to a past period, the
   * schedule has not been replaced — only part of it has. Sentences scoped to
   * a prior period are exempt, which is what keeps the genuine case working:
   * 20250923152523NAL0006535681001 confines its three-year rule to
   * "contributions made … for plan years prior to January 1, 2010" while
   * every ongoing money type vests immediately. */
  const EMPLOYER = /matching|employer|company|non.?elective|profit.?sharing|discretionary/i;
  const SERVICE = /\b(?:after|once|upon|following)\b[^.]{0,60}?\b(?:\w+|\d+)\s+years?\s+of\s+(?:vesting |credited |continuous )?service|\byears? of (?:vesting |credited |continuous )?service has been completed/i;
  const PAST_SCOPE = /\b(?:for|to)\s+plan\s+years?\s+(?:beginning\s+)?(?:prior\s+to|before)\b|\b(?:through|thru)\s+the\s+(?:year|plan\s+year|period)\s+ended\b|\bmade\s+(?:to\s+the\s+plan\s+)?for\s+plan\s+years\s+prior\b/i;
  const repSentence = win.split(/(?<=\.)\s/)[0] || win;
  for (const sent of t.split(/(?<=\.)\s+/)) {
    if (sent === repSentence) continue;
    if (!EMPLOYER.test(sent) || !SERVICE.test(sent)) continue;
    if (PAST_SCOPE.test(sent)) continue;          // a retired cohort, not the current rule
    return null;                                   // part of the schedule survives
  }
  return { effective: +rm[1], text: repSentence.trim() };
}

const FROZEN_CONDITIONAL = /\b(?:in the event|if the (?:plan|company|employer|sponsor)\b|should the (?:plan|company|employer)\b|were the plan\b|reserves the right|although it has not expressed|may (?:be |elect to )?(?:freeze|terminate))/i;
const FROZEN_ARTICLES = new Set(["the", "this", "a", "an", "its", "such", "and", "that", "said"]);
/** The proper name qualifying the plan that froze, or null when it is "the Plan". */
export function frozenSubjectName(text, sponsorName = "") {
  const t = String(text || "").replace(/\s+/g, " ");
  const sponsorWords = new Set(String(sponsorName || "").toUpperCase().replace(/[^A-Z0-9 ]/g, " ")
    .split(/\s+/).filter((w) => w.length > 3));
  const re = /((?:[A-Za-z0-9&.'\u2019()-]+\s+){0,5})((?:401\(?k\)?|403\(?b\)?|Retirement|Savings|Pension|Thrift)?\s*[Pp]lan)\s+(?:was|were|has been|have been|is|are)\s+(?:frozen|terminated)/g;
  let m, best = null;
  while ((m = re.exec(t))) {
    const pre = m[1].trim().split(/\s+/).filter(Boolean);
    const names = [];
    for (let i = pre.length - 1; i >= 0; i--) {
      const w = pre[i];
      if (FROZEN_ARTICLES.has(w.toLowerCase())) break;
      if (!/^[A-Z0-9]/.test(w)) break;
      names.unshift(w);
    }
    const proper = names.filter((w) => /^[A-Z][a-z]|^[A-Z]{2,}/.test(w) && !sponsorWords.has(w.toUpperCase()));
    if (proper.length) best = proper.join(" ");
    else return null;
  }
  return best;
}
export function frozenClaimIsAboutThisPlan(text, sponsorName = "") {
  const t = String(text || "");
  if (!t.trim()) return true;
  if (FROZEN_CONDITIONAL.test(t)) return false;
  return frozenSubjectName(t, sponsorName) === null;
}

export function extractPlanFeatures(text, sponsorName = "") {
  // zero-width characters survive \s normalization and shipped inside quotes
  // (R.H. White's eligibility quote began with U+200B); strip them first so
  // every offset below is computed on the same clean text
  const t = text.replace(/[​-‏﻿]/g, "").replace(/\s+/g, " ");
  const out = {};
  // form-page boilerplate that must never pass as a plan-description note
  // form-question text mentions "matching contributions" as a checkbox
  // option (21b) — 30,795 false "quotes" shipped before these markers were
  // vetoed (found by hourly due diligence 2026-07-27)
  const BOILER = /_{3,}|provide explanation|part [ivx]+\b|schedule [a-z]\b|check(?:box| the box| all boxes)|see instructions|yes ?\/ ?no|permissive aggregation|design[- ]based safe harbor|\b2[01][abc]\b|complete this item|\bX\b ?(?:Yes|No)|(?:Yes|No) ?\bX\b/i;
  const clean = (s) => s
    // page-heading glue: strip the date ONLY as part of the heading block —
    // a blanket date removal ate real dates mid-sentence ("During the year
    // ended December 31, 2022, the Company…" became "the year ended ,")
    .replace(/\b[\w .,]{0,60}Notes? to Financial Statements\b(?:[\s,]*December 31, 20\d\d(?: and 20\d\d)?)?/gi, " ")
    .replace(/\bNote \d+ ?[-–—] ?[^.]{0,60}\((?:Continued|concluded)\)/gi, " ")
    .replace(/\s{2,}/g, " ").trim();
  const cap = (s, n = 300) => (s.length > n ? s.slice(0, n - 3) + "…" : s);
  const sentence = (idx, span = 0) => {
    let a = t.lastIndexOf(". ", idx); a = a === -1 ? Math.max(0, idx - 220) : a + 2;
    let b = t.indexOf(". ", idx); b = b === -1 ? Math.min(t.length, idx + 280) : b + 1;
    // bullet lists parse as one endless "sentence" — window the excerpt so
    // the quote always contains the FULL matched span (through the last
    // tier), not just its start (audit-verified: formula ⊆ quote)
    const end = idx + span;
    if (end + 20 > b) b = Math.min(t.length, end + 20);
    let cut = false;
    // trim leading context on long windows, but NEVER past the match head —
    // trimming to (end − 250) kept the last tier while cutting the leading
    // "100% of", so a dozen quotes started mid-word AFTER the very number
    // they existed to prove; the cap stretches instead when the formula
    // span itself is long
    if (end - a > 270) { const a0 = a; a = Math.max(a, Math.min(idx, end - 250)); cut = a > a0; }
    const s = clean(t.slice(a, b)).replace(/^[a-z]/, (c) => c.toUpperCase());
    return cap((cut ? "…" : "") + s, Math.max(300, span + 60));
  };

  // ---- employer match formula ----
  // some auditors spell every number out — "a safe-harbor match of one
  // hundred percent of the first one percent and fifty percent of the next
  // five percent" (O'Neal Steel). The head/tier patterns accept the words
  // and W() renders them as digits; quotes stay verbatim from the filing.
  const W = (x) => ({ "one hundred": 100, "seventy five": 75, "twenty five": 25, fifteen: 15, fifty: 50, forty: 40, thirty: 30, twenty: 20, sixty: 60, ten: 10, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9 }[String(x).toLowerCase().replace(/-/g, " ")] ?? +x);
  const mf =
    // "safe harbor matching contribution equal to 100% up to 3% and 50%
    // up to an additional 2%" — QACA phrasing with no "of <deferrals>"
    t.match(/match(?:ing|ed)?[^.]{0,120}?equal to (\d{1,3}(?:\.\d+)?) ?(?:percent|%) up to (\d{1,2}(?:\.\d+)?) ?(?:percent|%)/i) ||
    // bullet-style benefit summaries: "Up to 3% of eligible compensation,
    // calculated as 100% Company match on the first 3% of associate
    // deferrals" (Capital One) — the cap bullet must not become the rate
    t.match(/calculated as (\d{1,3}(?:\.\d+)?) ?(?:percent|%) (?:company )?match(?:ing)? on the first (\d{1,2}(?:\.\d+)?) ?(?:percent|%)/i) ||
    t.match(/match(?:ing|ed)?[^.]{0,140}?(\d{1,3}(?:\.\d+)?|one hundred|seventy[- ]five|twenty[- ]five|fifteen|fifty|forty|thirty|twenty|sixty|ten|one|two|three|four|five|six|seven|eight|nine) ?(?:percent|%) (?:of|on) (?:the )?first (\d{1,2}(?:\.\d+)?|ten|one|two|three|four|five|six|seven|eight|nine) ?(?:percent|%)/i) ||
    t.match(/(\d{1,3}(?:\.\d+)?) ?(?:percent|%) match(?:ing)?[^.]{0,80}?(?:up to|on the first) (\d{1,2}(?:\.\d+)?) ?(?:percent|%)/i) ||
    // "matching contribution ... equal to 100% of ... deferral contributions
    // up to 6% of ... compensation" (Black Hills style — no "first")
    // "up to a 1%" — without the optional article the engine backtracks
    // into pairing the wrong numbers (QACA filings extracted "1% of the
    // first 6%" instead of "100% of the first 1%")
    // enumerated clauses — "a) a matching contribution of 100% of
    // participant contributions for the first 1% of … base compensation
    // and b) … 50% … up to the next 5%" (Rotary) — "for the first" binds
    // the head; without it the maximum-of shape below grabs clause b)'s
    // rate with the 6% total cap ("50% of the first 6%")
    t.match(/match(?:ing|ed)?[^.]{0,160}?(\d{1,3}(?:\.\d+)?|one hundred|seventy[- ]five|twenty[- ]five|fifty|twenty) ?(?:percent|%) of [^.]{0,80}?(?:for|on|attributable to|up to) the first (\d{1,2}(?:\.\d+)?|ten|one|two|three|four|five|six|seven|eight|nine) ?(?:percent|%)/i) ||
    // v56 S&P sweep widened the cap vocabulary and gaps: "(not exceeding 6%
    // of compensation)" (Accenture), "which are not over 6%" (Kenvue),
    // "up to the lesser of 4% … or $7,200" (Gartner), a parenthetical
    // between rate and "of" ("100% (Company Match) of …" Synchrony)
    t.match(/match(?:ing|ed)?[^.]{0,160}?(\d{1,3}(?:\.\d+)?|one hundred|seventy[- ]five|twenty[- ]five|fifty|twenty) ?(?:percent|%) (?:\([^)]{0,30}\) )?of [^.]{0,140}?(?:up to|not to exceed|not exceeding|not in excess of|(?:which |that )?(?:is |are )?not over|(?:that )?do(?:es)? not exceed|to a maximum of|with a match(?:ing)? limit of|maximum[^.]{0,60}? of) (?:the lesser of )?(?:an? |the first )?(\d{1,2}(?:\.\d+)?|ten|one|two|three|four|five|six|seven|eight|nine) ?(?:percent|%) of/i) ||
    // "matching contributions of 100 percent up to a maximum of six percent"
    // (Eversource) — no "of <deferrals>" between the rate and the cap
    t.match(/match(?:ing|ed)? contributions? of (\d{1,3}(?:\.\d+)?|one hundred|fifty) ?(?:percent|%) up to a maximum of (\d{1,2}(?:\.\d+)?|ten|one|two|three|four|five|six|seven|eight|nine) ?(?:percent|%)/i) ||
    // "100% on up to 4% of an employee's compensation" (Campbell's)
    t.match(/match(?:ing|ed)?[^.]{0,120}?(\d{1,3}(?:\.\d+)?|one hundred|fifty) ?(?:percent|%) on up to (\d{1,2}(?:\.\d+)?|ten|one|two|three|four|five|six|seven|eight|nine) ?(?:percent|%)/i) ||
    // auditor template with no "match" word — "The Company contributed 25
    // percent of the first 3 percent of eligible compensation that a
    // participant contributed" (Rental One, Rabun Gap); the trailing
    // participant-deferral anchor is what makes it a match, not an NEC
    // …and its bare-verb spelling. R.H. White files "The Company contribute
    // 50 percent of the first 6 percent of base compensation that a
    // participant contributes to the Plan" — a filer typo that hid a plain
    // 50%-of-6% match behind subject-verb disagreement. The participant-
    // deferral anchor still does the work of proving it is a match.
    t.match(/(?:company|employer|school|organization|foundation|sponsor)[^.]{0,40}?contribut(?:es|ed|e) (\d{1,3}(?:\.\d+)?) ?(?:percent|%) of (?:the )?first (\d{1,2}(?:\.\d+)?) ?(?:percent|%) of [^.]{0,90}?(?:that (?:a|the|each) participant contribut|compensation|pay|wages)/i);
  // spelled-out fraction rates: "one-half of the first 8% of base
  // compensation" (Opus Inspection) — map to a percentage
  const FRAC = { "one-half": 50, "one half": 50, "one-third": 33, "one third": 33, "one-quarter": 25, "one quarter": 25, "two-thirds": 67, "two thirds": 67 };
  const frac = !mf && t.match(/match(?:ing|ed)?[^.]{0,160}?\b(one[- ]half|one[- ]third|one[- ]quarter|two[- ]thirds)\b of the first (\d{1,2}(?:\.\d+)?) ?(?:percent|%)/i);
  // dollar-phrased formulas: "dollar-for-dollar up to 4%", "50 cents per dollar
  // on the first 6%", "$1.00 for every dollar … up to 2%" (Kraft Heinz)
  // A percentage cap on a dollar-for-dollar match normally means percent OF
  // PAY. Meta's does not: "a dollar-for-dollar match, up to 50% of the IRS
  // employee deferral limit" caps the match at half the 402(g) dollar limit,
  // and reading it as a pay cap published "100% of the first 50% of pay" —
  // telling 93,515 participants their employer matches half their salary.
  // Report the ceiling the filing actually names.
  const dfm = !mf && t.match(/(?:dollar[- ]for[- ]dollar|(?:\$1(?:\.00)?|one dollar) for (?:each|every) dollar)[^.]{0,80}?(?:up to|on the first) (\d{1,2}(?:\.\d+)?) ?(?:percent|%)(?<tail>[^.]{0,60})/i);
  const dfLimit = dfm && /^\s*of (?:the |a )?(?:IRS|Internal Revenue|Code|statutory|annual|applicable|maximum|402\(?g\)?)/i.test(dfm.groups.tail);
  const df = dfm && !dfLimit ? { pct: 100, cap: null } : null;
  const cents = !mf && !df && t.match(/(\d{1,3}(?:\.\d+)?) ?cents (?:for|per|on) (?:each |every )?(?:\$1(?:\.00)?|dollar)[^.]{0,80}?(?:up to|on the first) (\d{1,2}(?:\.\d+)?) ?(?:percent|%)/i);
  /* v79: the same ratio written in DOLLARS rather than cents or words —
   * "$0.75 for each $1.00 of the first 6% contributed by a participant",
   * "$.50 per $1.00 of the participant's deferral contribution up to 5%".
   * The dollar-for-dollar reader above only matches an exact $1, and the cents
   * reader only matches the word "cents", so this very ordinary phrasing fell
   * through to quote-only. The numerator is dollars-per-dollar, so 0.50 is a
   * 50% match; anything above $1.00 per $1.00 is a >100% match, which exists
   * but is rare enough to bound at 300% rather than accept a typo. */
  /* v79: "N% of the participant's deferral UP TO M%" — the plain safe-harbor
   * phrasing, with an optional second tier "plus P% of deferrals from the next
   * Q%". The existing readers all expect "up to THE FIRST m%" or "on the first
   * m%"; without the word "first" the commonest match formula in the country
   * fell through to quote-only. 446 stored rows read like this, most of them
   * verbatim safe-harbor basic ("100% … up to 3% plus 50% … next 2%") or
   * enhanced ("100% … up to 4%"). */
  const shm = !mf && t.match(/(\d{1,3}(?:\.\d+)?)\s?(?:percent|%)\s*(?:of\s+)?(?:the\s+|each\s+)?(?:(?:participant'?s?|employee'?s?|eligible|salary|elective|annual|base|plan)\s+){0,3}(?:deferrals?|contributions?|compensation)?\s*up to\s+(?:the first\s+)?(\d{1,2}(?:\.\d+)?)\s?(?:percent|%)/i);
  const shmTier2 = shm && t.slice(shm.index, shm.index + 220).match(/\bplus\s+(\d{1,3}(?:\.\d+)?)\s?(?:percent|%)[^.]{0,60}?(?:next|additional)\s+(\d{1,2}(?:\.\d+)?)\s?(?:percent|%)/i);
  const dolRatio = !mf && !df && !cents && t.match(/\$\s?(\d?(?:\.\d{1,2})?|\d{1,2})\s*(?:for|per)\s+(?:each|every)?\s*\$\s?1(?:\.00?)?\b[^.]{0,90}?(?:up to|on the first|of the first)\s+(?:a\s+maximum\s+of\s+|the\s+first\s+)?(\d{1,2}(?:\.\d+)?)\s?(?:percent|%)/i);
  // match stated as a TABLE, not prose: "Employee Contribution | Employer
  // Match / First 2% of eligible compensation 100 % / Next 2% ... 50 %"
  // (Northrop Grumman). Table columns collapse onto one line in the
  // flattened text; require a nearby "match" so unrelated tables can't
  // masquerade as a formula.
  let mtab = null;
  if (!mf && !df && !cents) {
    const tabRe = /first (\d{1,2}(?:\.\d+)?) ?(?:percent|%) of (?:eligible |annual |base )?(?:compensation|pay|earnings) (\d{1,3}) ?(?:percent|%)/gi;
    let c;
    while ((c = tabRe.exec(t))) {
      if (/match/i.test(t.slice(Math.max(0, c.index - 300), c.index))) { mtab = c; break; }
    }
  }
  // rate-after-tier prose: "the first 3% of salary deferrals are matched
  // 100%, and salary deferrals greater than 3% and up to 5% are matched at
  // a rate of 50%" (Berry Foundation) — mf's rate-first shapes can't bind it
  let minv = null;
  if (!mf && !df && !cents && !mtab) {
    minv = t.match(/first (\d{1,2}(?:\.\d+)?) ?(?:percent|%) of [^.]{0,60}?(?:is|are) matched (?:at (?:a rate of )?)?(\d{1,3}(?:\.\d+)?) ?(?:percent|%)/i);
  }
  // DOLLAR-capped matches with no percent cap: "matched 50 percent of each
  // eligible participant's contribution, not to exceed $1,000 per year"
  // (Palo Alto), "matched 100% … up to $3,000" (Expeditors), "up to a
  // maximum employer contribution of $4,400" (F5), "100% of the
  // participants' elective deferral to $17,500" (MarketAxess). The IRS/
  // statutory-limit guard keeps 402(g)/catch-up dollar figures out.
  // "Participants who contribute at least 5% … received a matching
  // contribution of 5% of compensation" — contributing the threshold earns
  // the full flat match, i.e. 100% of the first N%
  const mcond = !mf && t.match(/contribute at least (\d{1,2}) ?(?:percent|%)[^.]{0,80}?match(?:ing)? contributions? of \1 ?(?:percent|%) of compensation/i);
  let mdol = null;
  if (!mf && !df && !cents && !mtab && !minv && !mcond) {
    mdol = t.match(/match(?:ing|ed)?[^.]{0,120}?(\d{1,3}(?:\.\d+)?|one hundred|fifty) ?(?:percent|%) of [^.]{0,120}?(?:contribution|deferral)s?[^.]{0,80}?(?:not to exceed|up to (?:a )?(?:maximum[^.]{0,50}?of )?|to ) ?\$ ?([\d,]{3,7})(?!\d)/i);
    if (mdol && /IRS|Internal Revenue|402\(g\)|catch[- ]up|statutory|Code limit/i.test(mdol[0])) mdol = null;
  }
  // a hedged "may contribute a discretionary match of 6% of the first 4%"
  // followed by a DEFINITE formula ("The Company makes a safe harbor
  // matching contribution equal to 100%…") must yield to the definite one
  // — the discretionary head once fused with the adjacent safe-harbor
  // sentence into "6% of the first 4% + 50% of the next 1%"
  if (mf) {
    const hedgePre = t.slice(Math.max(0, mf.index - 90), mf.index);
    if (/\bmay (?:elect to )?(?:make|contribute|provide)\b[^.]*?discretionary[^.]*$/i.test(hedgePre)) {
      const rest = t.slice(mf.index + mf[0].length, mf.index + mf[0].length + 600);
      const def = rest.match(/(?:makes|will make|provides)[^.]{0,60}?match(?:ing|ed)?[^.]{0,160}?(\d{1,3}(?:\.\d+)?) ?(?:percent|%) of [^.]{0,140}?(?:up to|not to exceed|not in excess of|(?:that )?do(?:es)? not exceed|to a maximum of) (?:an? |the first )?(\d{1,2}(?:\.\d+)?) ?(?:percent|%) of/i) ||
        rest.match(/(?:makes|will make|provides)[^.]{0,60}?match(?:ing|ed)?[^.]{0,140}?(\d{1,3}(?:\.\d+)?) ?(?:percent|%) (?:of|on) (?:the )?first (\d{1,2}(?:\.\d+)?) ?(?:percent|%)/i);
      if (def) Object.assign(mf, { 1: def[1], 2: def[2], index: def.index + mf.index + mf[0].length, 0: def[0] });
    }
  }
  // "Effective January 1, 2022, the Plan changed the safe harbor
  // contribution formula to contribute 200% of the first 2%…" supersedes
  // a formula stated EARLIER in the paragraph — mirror of the "prior to"
  // era handling below, which only catches backward-looking phrasing
  if (mf) {
    const rest = t.slice(mf.index + mf[0].length, mf.index + mf[0].length + 700);
    const chg = rest.match(/(?:effective|beginning) [^.]{0,60}?\bchanged\b[^.]{0,80}?formula to (?:contribute|match|provide)[^.]{0,40}?(\d{1,3}(?:\.\d+)?) ?(?:percent|%) of (?:the )?first (\d{1,2}(?:\.\d+)?) ?(?:percent|%)/i);
    if (chg) Object.assign(mf, { 1: chg[1], 2: chg[2], index: chg.index + mf.index + mf[0].length, 0: chg[0] });
  }
  // a formula introduced by "Prior to January 1, 2023 …" is DISCONTINUED
  // (Cooper Tire) — prefer a later-stated current formula; if none exists,
  // label the era so the site never presents an old formula as current
  let mfEra = "";
  if (mf) {
    const pre = t.slice(Math.max(0, mf.index - 130), mf.index + mf[0].length + 90);
    let era = pre.match(/((?:prior to|before|until|through)) (?:[A-Z][a-z]+ \d{1,2},? )?(\d{4})/i);
    // "the period from January 1, 2023 through March 17, 2023" is an
    // AUDIT-PERIOD range, not a formula expiry — H Enterprises' real 50%
    // match was swapped for a later discretionary sentence by this misfire
    if (era && /from (?:[A-Z][a-z]+ \d{1,2},? ?)?\d{0,4},? ?$/i.test(pre.slice(0, era.index))) era = null;
    // "employees HIRED prior to January 1, 2006 … receive 75%" (Avista) is
    // a hire-date COHORT, not a discontinued formula — the era label
    // wrongly implied staleness; hireSplitLabel covers the cohort split
    if (era && /hired (?:on or )?$/i.test(pre.slice(0, era.index))) era = null;
    // "The employer match for the year ended December 31, 2019 was 100%…"
    // in a plan-year-2023 filing is a STALE formula (Freedom Boat Club).
    // Two-year audit phrasing ("years ended 2023 and 2022") stays current;
    // a lone year ≥2 behind the filing's newest year gets the era label.
    if (!era) {
      const era2 = pre.match(/for the (?:plan )?year ended (?:[A-Z][a-z]+ \d{1,2},? )?(\d{4})\b(?!,? and)/i);
      // "…through March 17, 2023 AND for the year ended December 31, 2022"
      // enumerates a terminated plan's two audit periods — not staleness
      if (era2 && !/\band +$/i.test(pre.slice(0, era2.index))) {
        // newest year from DATED tokens only (month-name dates, mm/dd/yyyy,
        // "plan year YYYY") — bare years pollute (loan maturity ranges like
        // "2023-2027" made everything "stale")
        let maxYear = 0;
        for (const y of t.matchAll(/(?:(?:january|february|march|april|may|june|july|august|september|october|november|december) \d{1,2},? |\d{1,2}\/\d{1,2}\/|plan year )(20[0-4]\d)/gi)) maxYear = Math.max(maxYear, +y[1]);
        if (+era2[1] <= maxYear - 2) era = { 1: "for plan year", 2: era2[1], index: era2.index };
      }
    }
    if (era) {
      const rest = t.slice(mf.index + mf[0].length);
      const again = rest.match(/match(?:ing|ed)?[^.]{0,140}?(\d{1,3}(?:\.\d+)?) ?(?:percent|%) (?:of|on) (?:the )?first (\d{1,2}(?:\.\d+)?) ?(?:percent|%)/i) ||
        rest.match(/match(?:ing|ed)?[^.]{0,160}?(\d{1,3}(?:\.\d+)?) ?(?:percent|%) of [^.]{0,140}?(?:up to|not to exceed|to a maximum of) (?:an? |the first )?(\d{1,2}(?:\.\d+)?) ?(?:percent|%) of/i);
      if (again) { again.index += mf.index + mf[0].length; Object.assign(mf, { 1: again[1], 2: again[2], index: again.index, 0: again[0] }); }
      else mfEra = ` (formula in effect ${era[1].toLowerCase()} ${era[2]} per the filing)`;
    }
  }
  // hire-date cohorts: when the first-found formula belongs to the LEGACY
  // cohort ("hired prior to January 1, 2006 … 75%"), prefer the
  // current-hire cohort's formula stated later ("hired on or after
  // January 1, 2006 … 100% … does not exceed 6%") — the hire-split label
  // still says both exist, and the quote shows the picked sentence
  if (mf && /hired (?:prior to|before) [^.]{0,60}$/i.test(t.slice(Math.max(0, mf.index - 220), mf.index))) {
    const rest = t.slice(mf.index + mf[0].length);
    const cur = rest.match(/hired on or after [^.]{0,200}?match(?:ing|ed)?[^.]{0,140}?(\d{1,3}(?:\.\d+)?) ?(?:percent|%) of [^.]{0,140}?(?:does not exceed|up to|not to exceed|to a maximum of) (?:an? |the first )?(\d{1,2}(?:\.\d+)?) ?(?:percent|%)/i);
    if (cur) { cur.index += mf.index + mf[0].length; Object.assign(mf, { 1: cur[1], 2: cur[2], index: cur.index, 0: cur[0] }); }
  }
  if (mf) {
    // a formula prefixed "For participants of <entity>," is scoped to one
    // employer group — Continental Tire's plan pays Hoosier employees
    // 100%/5% and O'Sullivan employees 100%/6%; presenting either as THE
    // plan match is wrong. Say it varies and quote the group formulas.
    const scopePre = t.slice(Math.max(0, mf.index - 110), mf.index);
    // same-sentence test tolerates abbreviation periods ("Corp., the …");
    // only a period followed by a space and a capital ends the sentence
    const sm = scopePre.match(/for (?:participants|employees) (?:of|employed by|at) [A-Z]|(?:those|these) (?:union )?participants? who are employed by|for these (?:union |non-union )?participants/i);
    if (sm && !/\. +[A-Z]/.test(scopePre.slice(sm.index))) {
      out.match = "Varies by employer group";
      out.matchText = sentence(mf.index);
    } else {
    // "limited to 50% of employee contributions with a maximum of up to 2%
    // of the participant's compensation" (Yesler) caps the MATCH, not the
    // matched-deferral tier — rendering it "50% of the first 2%" halves the
    // real benefit. State it the way the filing does.
    const capStyle = /with a maximum of up to|up to a maximum match(?:ing)? (?:contribution )?of|with a match(?:ing)? limit of/i.test(mf[0]) &&
      /(?:percent|%) of (?:the |a )?(?:employee|participant)s?['’]?s? (?:elective )?(?:deferrals?|contributions?|compensation)/i.test(mf[0]);
    out.match = capStyle
      ? `${W(mf[1])}% of contributions, max match ${W(mf[2])}% of pay`
      : `${W(mf[1])}% of the first ${W(mf[2])}% of pay`;
    // capture EVERY additional tier — "75% of the first 1%, 50% of the next
    // 4%, and 25% of the next 1%" (Kohler) has a comma-joined middle tier;
    // "50% of a participant's contributions up to the next 2%" (Simmons
    // Foods) puts words between the rate and "next"
    // the gap must not cross another rate: '%' is excluded by character
    // class, spelled "percent" needs the lookahead (O'Neal double-bound
    // "one hundred" onto the second tier without it)
    const tierRe = /(\d{1,3}(?:\.\d+)?|one hundred|seventy[- ]five|twenty[- ]five|fifty|twenty) ?(?:percent|%) (?:of (?:(?!percent\b)[^.%]){0,60}?|(?:company )?match(?:ing)? on the )next (\d{1,2}(?:\.\d+)?|ten|one|two|three|four|five|six|seven|eight|nine) ?(?:percent|%)/gi;
    // a NEW match head in the following sentence is a separate formula —
    // its tiers must not chain onto this head (5%−4% once fabricated
    // "+ 50% of the next 1%"). Legit continuations ("In addition, … 50%
    // of the next 2%") carry no head phrase and still chain.
    let tail = t.slice(mf.index, mf.index + 400);
    const sEnd = tail.slice(mf[0].length).search(/\. +[A-Z(]/);
    if (sEnd !== -1) {
      const cont = tail.slice(mf[0].length + sEnd);
      // break on any re-statement verb ("provided a discretionary match",
      // "receive a match" — union/group formulas fused into one wrong
      // formula without these), on flexible "contributions was/were equal
      // to", and on era openers ("Prior to January 1, 2024, …" chained a
      // dead formula's tier onto the current one)
      if (/(?:makes?|may (?:elect to )?(?:make|contribute)|will make|provide[ds]?|receives?|offer(?:s|ed)?)[^.]{0,90}?match(?:ing)?\b|\b(?:employer|company|plan|organization)\b[^.]{0,40}?\bmatch(?:es|ed)\b|match(?:ing)? contributions? (?:was |were |is |are )?equal to|^\. +\W{0,3}(?:prior to|effective|before|beginning|starting|through|until)\b[^.]{0,60}?(?:19|20)\d\d/i.test(cont)) {
        tail = tail.slice(0, mf[0].length + sEnd + 1);
      }
      // v91, vocabulary-free companion to the verb list above: if the next
      // sentence states its OWN complete head ("100% of the first 4%") whose
      // rate or bound differs from ours, it is a DIFFERENT formula — another
      // cohort, location, hire-date class or plan year — and its tiers must
      // not chain onto ours. Verizon's management plan read "100% of the
      // first 6% … For all other union represented employees … 100% of the
      // first 4% and 50% of the next 2%" and shipped the splice
      // "100% of the first 6% + 50% of the next 2%", a formula no
      // participant receives. The verb list missed it by one word
      // ("equivalent to" rather than "equal to"), which is the third time a
      // spelling list has been the thing that failed; matching on the SHAPE
      // of a competing head needs no vocabulary. A restatement of the same
      // head ("…to become a tiered match paying 100% of the first 3%,
      // plus 50% of the next 2%") keeps chaining, because it is our formula.
      const rival = cont.match(/(\d{1,3}(?:\.\d+)?) ?(?:percent|%) of (?:the )?first (\d{1,2}(?:\.\d+)?) ?(?:percent|%)/i);
      if (rival && (W(mf[1]) !== +rival[1] || W(mf[2]) !== +rival[2])) {
        tail = tail.slice(0, mf[0].length + sEnd + 1);
      }
    }
    let tm; let tguard = 0; let lastTierEnd = mf[0].length;
    while ((tm = tierRe.exec(tail)) && tguard++ < 4) {
      // "(a) 30% of the next 5% … for participants with less than 20 years
      // … or (b) 50% of the next 5%" — lettered alternatives are cohort
      // CHOICES, not consecutive tiers; chaining them fabricated a formula
      // no participant gets. Say the tier varies and stop.
      const between = tail.slice(lastTierEnd, tm.index);
      // the varies-vocabulary often trails the FIRST lettered tier ("(a)
      // 30% of the next 5% … for participants with less than 20 years …
      // or (b) …") — look past the tier itself when judging
      const ahead = tail.slice(lastTierEnd, Math.min(tail.length, tm.index + tm[0].length + 130));
      if (/\(\s*[a-z]\s*\)/i.test(between) && /\bor\b *\(|less than|more than|years of (?:credited )?service/i.test(ahead)) {
        out.match += " + a further tier that varies by participant group (per the filing)";
        lastTierEnd = tm.index + tm[0].length;
        break;
      }
      out.match += ` + ${W(tm[1])}% of the next ${W(tm[2])}%`;
      lastTierEnd = tm.index + tm[0].length;
    }
    // QACA/two-part safe harbor phrasing: "…and 50% of the deferral which
    // exceeds 1% up to 6% of compensation" → 50% of the next (6−1)%
    if (tguard === 0) {
      const ex = tail.match(/\b(?:and|plus) (?:an additional )?(\d{1,3}(?:\.\d+)?) ?(?:percent|%) (?:match )?of [^.]{0,140}?(?:(?:exceeds?|exceeding|in excess of|above)[^.]{0,100}?(?:up to|not to exceed|(?:but )?not?,? more than)|between [^.]{0,40}? and) (?:an? )?(\d{1,2}(?:\.\d+)?) ?(?:percent|%)/i);
      if (ex && +ex[2] > W(mf[2])) {
        out.match += ` + ${+ex[1]}% of the next ${+ex[2] - W(mf[2])}%`;
        lastTierEnd = ex.index + ex[0].length;
      }
    }
    // "and 50% up to an additional 2%" — QACA second tier without "next"
    if (tguard === 0) {
      const ad = tail.match(/\b(?:and|plus) (\d{1,3}(?:\.\d+)?) ?(?:percent|%) up to an additional (\d{1,2}(?:\.\d+)?) ?(?:percent|%)/i);
      if (ad) { out.match += ` + ${+ad[1]}% of the next ${+ad[2]}%`; lastTierEnd = Math.max(lastTierEnd, ad.index + ad[0].length); tguard++; }
    }
    // rate-RAMP tiers: "an additional 0.2% for each 1% incremental
    // increase … over 6%, up to 11% of eligible pay" (Sempra) — a
    // per-increment formula no fixed-tier pattern can express
    const ramp = tail.match(/additional (\d+(?:\.\d+)?) ?(?:percent|%) for each (\d+(?:\.\d+)?) ?(?:percent|%)[^.]{0,80}?(?:over|above|in excess of) (\d+(?:\.\d+)?) ?(?:percent|%)[^.]{0,60}?up to (\d+(?:\.\d+)?) ?(?:percent|%)/i);
    if (ramp) {
      out.match += ` + ${ramp[1]}% per ${ramp[2]}% contributed above ${ramp[3]}%, up to ${ramp[4]}%`;
      lastTierEnd = Math.max(lastTierEnd, ramp.index + ramp[0].length);
    }
    // era label goes after ALL tiers so the annotation reads as one unit
    // a dollar cap changes the real benefit — "25% of deferrals up to 6%,
    // not to exceed $2,500 on an annual basis" (Digirad) is NOT the same
    // match as an uncapped 25%/6% for anyone earning over ~$167k
    const capWin = t.slice(mf.index, mf.index + lastTierEnd + 160);
    // "not to exceed $2,250 per quarter for a total of $9,000 per year"
    // (VMware) — take the ANNUAL total, never a shorter-period figure
    const dcap = capWin.match(/total of \$([\d,]+) per year/i) ||
      capWin.match(/not to exceed \$([\d,]+)(?! per (?:quarter|month|pay))[^.]{0,40}?(?: on an annual basis| per year| per plan year| each year| annually)/i) ||
      // "up to the lesser of 4% of … compensation or $7,200" (Gartner)
      capWin.match(/lesser of[^.]{0,80}? or \$([\d,]+)(?!\d)/i);
    if (dcap) out.match += ` (max $${dcap[1]}/yr per the filing)`;
    out.match += mfEra;
    // the quote must contain every tier the formula states
    out.matchText = sentence(mf.index, lastTierEnd);
    }
  } else if (frac) {
    out.match = `${FRAC[frac[1].toLowerCase().replace(/ /, "-")] || FRAC[frac[1].toLowerCase()]}% of the first ${+frac[2]}% of pay`;
    out.matchText = sentence(frac.index);
  } else if (df) {
    const m2 = t.match(/(?:dollar[- ]for[- ]dollar|(?:\$1(?:\.00)?|one dollar) for (?:each|every) dollar)[^.]{0,80}?(?:up to|on the first) (\d{1,2}(?:\.\d+)?) ?(?:percent|%)/i);
    out.match = `100% of the first ${+m2[1]}% of pay`;
    let dEnd = m2[0].length;
    // cents-per-dollar SECOND tier: "plus 50 cents for every dollar … that
    // is between 2% and 6% of eligible pay" (Kraft Heinz)
    const ct = t.slice(m2.index, m2.index + 400).match(/(\d{1,3}) ?cents (?:for|per|on) (?:each |every )?dollar[^.]{0,80}?between (\d{1,2}(?:\.\d+)?) ?(?:percent|%) and (\d{1,2}(?:\.\d+)?) ?(?:percent|%)/i);
    if (ct && +ct[3] > +ct[2]) { out.match += ` + ${+ct[1]}% of the next ${+ct[3] - +ct[2]}%`; dEnd = ct.index + ct[0].length; }
    out.matchText = sentence(m2.index, dEnd);
  } else if (cents) {
    out.match = `${+cents[1]}% of the first ${+cents[2]}% of pay`;
    out.matchText = sentence(cents.index);
  } else if (shm && +shm[1] > 0 && +shm[1] <= 300 && +shm[2] > 0 && +shm[2] <= 25) {
    out.match = `${+shm[1]}% of the first ${+shm[2]}% of pay`;
    let shEnd = shm[0].length;
    if (shmTier2 && +shmTier2[1] > 0 && +shmTier2[1] <= 300 && +shmTier2[2] > 0 && +shmTier2[2] <= 25) {
      out.match += ` + ${+shmTier2[1]}% of the next ${+shmTier2[2]}%`;
      shEnd = shmTier2.index + shmTier2[0].length;
    }
    out.matchText = sentence(shm.index, shEnd);
  } else if (dolRatio && +dolRatio[1] > 0 && +dolRatio[1] <= 3) {
    out.match = `${Math.round(+dolRatio[1] * 100)}% of the first ${+dolRatio[2]}% of pay`;
    out.matchText = sentence(dolRatio.index);
  } else if (minv) {
    out.match = `${+minv[2]}% of the first ${+minv[1]}% of pay`;
    const ex2 = t.slice(minv.index, minv.index + 300).match(/greater than (\d{1,2}(?:\.\d+)?) ?(?:percent|%) and up to (\d{1,2}(?:\.\d+)?) ?(?:percent|%) [^.]{0,60}?matched (?:at (?:a rate of )?)?(\d{1,3}(?:\.\d+)?) ?(?:percent|%)/i);
    let invEnd = minv[0].length;
    if (ex2 && +ex2[2] > +ex2[1]) { out.match += ` + ${+ex2[3]}% of the next ${+ex2[2] - +ex2[1]}%`; invEnd = ex2.index + ex2[0].length; }
    out.matchText = sentence(minv.index, invEnd);
  } else if (mcond) {
    out.match = `100% of the first ${+mcond[1]}% of pay`;
    out.matchText = sentence(mcond.index);
  } else if (mdol) {
    out.match = `${W(mdol[1])}% of contributions, capped at $${mdol[2]} per year`;
    out.matchText = sentence(mdol.index);
  } else if (mtab) {
    out.match = `${+mtab[2]}% of the first ${+mtab[1]}% of pay`;
    const tierRe2 = /next (\d{1,2}(?:\.\d+)?) ?(?:percent|%) of (?:eligible |annual |base )?(?:compensation|pay|earnings) (\d{1,3}) ?(?:percent|%)/gi;
    const tail = t.slice(mtab.index, mtab.index + 400);
    let tm2; let tg = 0;
    while ((tm2 = tierRe2.exec(tail)) && tg++ < 4) out.match += ` + ${+tm2[2]}% of the next ${+tm2[1]}%`;
    out.matchText = sentence(mtab.index);
  } else {
    // cumulative match tables — "When an Employee Contributes | Company
    // Will Match an Additional | Cumulative Company Match … 6% of their
    // pay … 3.00%" (Northcentral University): the last cumulative percent
    // is the total-match cap; the tier structure is non-linear, so state
    // the cap and let the quote carry the table
    const cumH = t.match(/when an employee contributes[^.]{0,60}?will match/i);
    if (cumH) {
      const win = t.slice(cumH.index, cumH.index + 700);
      const rows = [...win.matchAll(/(\d{1,2})(?:\.\d+)? ?% of (?:their|the employee'?s?) pay ([\d.]+) ?%[^%]{0,60}?([\d.]+) ?%/gi)];
      if (rows.length >= 3) {
        out.match = `Tiered schedule — up to ${+rows[rows.length - 1][3]}% of pay total match`;
        out.matchText = sentence(cumH.index, Math.min(700, win.length));
      }
    }
    // service-tiered flat rates: "matching contributions of 5%, 6%, or 8%
    // of each eligible participant's basic compensation, depending on
    // years of eligible service" (Stanford Health) — no single formula
    const svcTier = t.match(/match(?:ing)? contributions? of (\d{1,2}) ?(?:percent|%),? (\d{1,2}) ?(?:percent|%),? or (\d{1,2}) ?(?:percent|%) [^.]{0,80}?depending (?:up)?on (?:years of|length of|the participant)/i);
    if (!out.match && svcTier) {
      out.match = `Varies by years of service — ${+svcTier[1]}%, ${+svcTier[2]}%, or ${+svcTier[3]}% of pay (per the filing)`;
      out.matchText = sentence(svcTier.index);
    }
    // safe-harbor basic match written as one cap plus a second tier:
    // "Contributions are equal to 100% of the participant's elective
    // deferrals, up to 3% plus 50% of the next 3%" (Swinerton). Without it
    // the plan fell through to the DISCRETIONARY paragraph directly above —
    // the one that says the Company "did not make any matching
    // contributions" — so a real safe-harbor match read as "Discretionary".
    const shTier = t.match(/equal to (\d{1,3}(?:\.\d+)?) ?(?:percent|%) of[^.]{0,70}?deferrals?,? ?up to (\d{1,2}(?:\.\d+)?) ?(?:percent|%),? plus (\d{1,3}(?:\.\d+)?) ?(?:percent|%) of the next (\d{1,2}(?:\.\d+)?) ?(?:percent|%)/i);
    if (!out.match && shTier) {
      out.match = `${+shTier[1]}% of the first ${+shTier[2]}% of pay + ${+shTier[3]}% of the next ${+shTier[4]}%`;
      out.matchText = sentence(shTier.index);
    }
    // rate-only match with no stated cap: "The company contributed 10% of
    // the employee qualified contributions" (Exeter) — show the rate the
    // filing states rather than nothing
    const rateOnly = t.match(/(?:company|employer|plan sponsor)[^.]{0,40}?contribut(?:es|ed) (\d{1,3}(?:\.\d+)?) ?(?:percent|%) of the (?:employee|participant)s?'? ?(?:qualified |elective |eligible )?(?:deferral )?contributions/i);
    if (!out.match && rateOnly) {
      out.match = `${+rateOnly[1]}% of contributions`;
      out.matchText = sentence(rateOnly.index);
    }
    // "The Company made a match of up to 1% of compensation" (Columbia
    // Ford) — a stated cap with no rate is still a formula worth showing
    const upTo = t.match(/(?:made |makes )?a match of up to (\d{1,2}(?:\.\d+)?) ?(?:percent|%) of (?:eligible |annual )?compensation/i);
    // "may elect to make discretionary matching contributions … determined
    // by the Board" — roughly half the no-formula backlog. There IS no
    // formula; discretionary is the answer, not a gap.
    const disc = t.match(/discretionary (?:401\(k\) )?match(?:ing)?(?: and profit[- ]sharing)? contributions?|match(?:ing)?(?: and profit[- ]sharing)? contributions? [^.]{0,80}?(?:discretionary|determined (?:annually |each year )?by (?:its |the )?(?:board|company|employer|trustees|firm|plan sponsor|management))|on a discretionary basis,? contribut[^.]{0,30}?match|(?:contribute|make) a discretionary match(?:ing)?\b|at (?:its|their) discretion,? (?:may )?contribut\w+ a match|(?:company|employer) contributions are (?:entirely )?discretionary/i);
    if (out.match) {
      // rate-only already answered it
    } else if (dfLimit) {
      // a match capped at a share of the statutory deferral limit IS a stated
      // formula — it must outrank the discretionary sentence sitting beside
      // it, the same way Swinerton's safe-harbor tier does (2026-08-20)
      out.match = `100% of deferrals, capped at ${+dfm[1]}% of the IRS deferral limit`;
      out.matchText = sentence(dfm.index);
    } else if (upTo) {
      out.match = `Up to ${+upTo[1]}% of pay`;
      out.matchText = sentence(upTo.index);
    } else if (disc) {
      out.match = "Discretionary — set year to year";
      out.matchText = sentence(disc.index);
    } else {
      // fall back to the descriptive sentence, skipping form-page boilerplate
      const mre = /(?:employer|company|plan sponsor|organization|school|firm)(?:['’]s)? (?:made |makes |will make |shall make |may make |also )?(?:safe harbor )?match(?:ing|ed)? (?:safe harbor )?(?:401\(k\) )?contributions?|matching contributions? (?:is|are|equal|of|based|provided)/gi;
      /* v80: the fallback takes the first sentence carrying match vocabulary,
       * and "matching contributions" appears in sentences that are ABOUT
       * something else — who is eligible for them, when they vest, how much
       * was contributed in dollars, how accounts are credited. Measured across
       * the 8,711 quote-only rows: 2,242 (26%) are one of those, so a quarter
       * of the match quotes shown to users describe eligibility or vesting.
       * A blank is better than a sentence about the wrong thing.
       * The test is conservative: another topic's vocabulary only disqualifies
       * a sentence that states NO RATE. "The Company matches 50% … and
       * matching contributions vest over three years" keeps its quote, because
       * the rate is right there. And the loop now CONTINUES rather than
       * stopping, so a filing whose first hit is the eligibility paragraph can
       * still reach its real match sentence further down. */
      const OTHER_TOPIC = /\b(?:are eligible|becomes? eligible|eligibility|entry date|attain(?:ed|ing) (?:the )?age|vested|vesting|non-?forfeitable|forfeit\w*)\b/i;
      const DOLLAR_TOTAL = /\b(?:amounted to|totall?ing)\s*\$[\d,]|\bcontributions? of (?:approximately )?\$[\d,]/i;
      const ACCT_MECH = /each participant'?s? account is credited|participant accounts?\s*[-:\u2013]/i;
      const HAS_RATE = /\d\s?(?:percent|%)|\$\s?\d[\d.]*\s*(?:for|per)\s+(?:each|every)?\s*\$/i;
      let mm;
      while ((mm = mre.exec(t))) {
        const s = sentence(mm.index);
        if (BOILER.test(s) || s.length <= 60) continue;
        if (ACCT_MECH.test(s)) continue;
        if (!HAS_RATE.test(s) && (OTHER_TOPIC.test(s) || DOLLAR_TOTAL.test(s))) continue;
        out.matchText = s; break;
      }
    }
  }

  // schedules split by hire date ("hired before September 1, 2016 are
  // immediately vested … hired after … after three years" — United Farmers
  // Cooperative): showing one cohort's schedule alone misstates the other's
  const hireSplitLabel = (which) => {
    if (out[which] && out[which + "Text"] && !/varies|hire date/i.test(out[which]) &&
        /hired (?:before|after|on or after|prior to)/i.test(out[which + "Text"]))
      out[which] += " (varies by hire date per the filing)";
  };

  // Vesting can differ BY MONEY SOURCE, and showing only the graded schedule
  // overstates what a participant forfeits. R.H. White vests prevailing-wage
  // QNECs immediately — $2,087,932 of its $3,164,887 in employer money —
  // while the match vests 20%/year; the site showed a flat "Graded schedule"
  // over all employer money. Only sources the filing names as immediately
  // vested are called out, and never for a plan whose whole schedule is
  // already immediate.
  // NOT IMPLEMENTED, deliberately: the looser wording "100% / fully vested
  // in <source>" cannot be read safely. Across 822 filings it was
  // indistinguishable from a schedule's END state, event acceleration
  // ("immediately fully vested … upon reaching age 65, becoming disabled or
  // death"), employee-group splits, date-scoped eras, negated forfeiture
  // clauses ("if a participant is NOT fully vested in matching…") and
  // outright exclusions ("fully vested … WITH THE EXCEPTION OF the
  // employer-matching subaccount" — the opposite claim). Five rounds of
  // guards still left ~15% wrong, and the guard strict enough to suppress
  // them also suppressed the honest Eaton wording. Only the unambiguous
  // "vested immediately in X" / "X contributions are vested immediately"
  // forms below are read. See accuracy log 2026-08-19.
  const srcImmediate = () => {
    // never stack a second parenthetical onto a value that already carries one
    // (a hire-date-split schedule read "3-year cliff (varies by hire date per
    // the filing) (matching contributions vest immediately)")
    if (!out.vesting || /^Immediate/i.test(out.vesting) || /vest immediately|\(/.test(out.vesting)) return;
    const m = t.match(/vested immediately in [^.]{0,120}?\b(prevailing wage|safe harbor|qualified non-?elective|QNEC|profit sharing|matching)\b[^.]{0,40}?contributions?/i)
      || t.match(/\b(prevailing wage|safe harbor|qualified non-?elective|QNEC|profit sharing)\b[^.]{0,60}?contributions? are (?:100 ?(?:percent|%) |fully )?vested immediately/i)
      // deliberately NOT extended to "100% / fully vested in X" — see the
      // note above srcImmediate for why that wording cannot be read safely
      ;
    if (m) out.vesting += ` (${m[1].toLowerCase().replace(/^qnec$/i, "QNEC")} contributions vest immediately)`;
  };

  // "There were no discretionary Plan Sponsor matching contributions for
  // the 2023 plan year. During 2022, the Plan Sponsor matched 100%…"
  // (American Physician Partners) — the extracted formula is the OLD one;
  // say so instead of presenting it as current
  if (out.match && out.matchText && !/\(formula in effect|\(none made/.test(out.match)) {
    const neg = t.match(/(?:there (?:were|was)|made) no [^.]{0,80}?match(?:ing)? contributions? [^.]{0,60}?(?:for|in|during) the (\d{4}) plan year/i);
    const dur = out.matchText.match(/\bDuring (20\d\d)\b/i);
    if (neg && dur && +dur[1] < +neg[1]) out.match += ` (none made for plan year ${neg[1]} per the filing)`;
  }

  /* v90: whether a "prior to <date>" sentence states a REPLACED rule turns on
   * WHAT THE DATE MODIFIES, not on tense. Measured over the 465 labelled rows
   * whose quote carries such a date:
   *   36  the date modifies the MONEY or SERVICE - "Non-elective contributions
   *       that were MADE prior to July 1, 2002 ARE subject to a vesting
   *       schedule" is a live rule about legacy money. KEEP.
   *   132 the date modifies the PARTICIPANT - "participants ENROLLED in the
   *       Plan prior to July 29, 2015 ARE immediately vested" is a cohort
   *       still in force. KEEP.
   *   98  the date modifies the RULE, sentence-initial - "Prior to January 1,
   *       2020, participants were fully vested ... after two years". REPLACED.
   * Tense is a trap in both directions: the past-tense bucket held live
   * legacy-money rules ("were made ... are subject to") and the present-tense
   * bucket held superseded ones ("Prior to September 11, 2023, a participant
   * is 100% vested"), which is an auditor writing loosely, not a live rule.
   * v86 scoped this guard to spans the old gate had not answered because a
   * crude version removed correct labels. With the money/participant split
   * measured it can run unscoped. The label goes, the QUOTE STAYS - the
   * sentence is still the only thing the filing says about vesting. */
  const supersededRule = (x) =>
    /^[^.]{0,40}?\b(?:prior to|before)\s+(?:january|february|march|april|may|june|july|august|september|october|november|december|\d{1,2}\/|\d{4})/i.test(x)
    && !/(?:contributions?|amounts?|balances?|service|deferrals?)[^.]{0,30}?(?:made|earned|credited|allocated|incurred)?\s*(?:prior to|before)\s+(?:january|february|march|april|may|june|july|august|september|october|november|december|\d{1,2}\/|\d{4})/i.test(x)
    && !/\b(?:hired?|employed|enrolled|anyone who|who entered|terminated|participants? (?:who|in the plan|with)|employees? (?:who|in the plan|of))\b/i.test(x.slice(0, 140));

  // ---- vesting of EMPLOYER money (employee deferrals are always immediate) ----
  const vestSentences = [];
  const vre = /[^.]{0,220}\bvest(?:ed|ing)?\b[^.]{0,220}\./gi;
  let vm; let guard = 0;
  while ((vm = vre.exec(t)) && guard++ < 40) {
    const s = clean(vm[0]);
    // conditional/alternative schedules are not the plan's actual schedule:
    // top-heavy fallbacks and death/disability accelerations produced
    // "5-year cliff" claims that contradict the real graded schedule
    if (!BOILER.test(s) && !/defined benefit|pension benefit|top[- ]heavy|in the event (?:the plan|of (?:plan |the plan['’]s )?terminat|of death|of disab)|should the plan (?:be|become)|alternative vesting|if the plan (?:is|becomes)|vested upon (?:the )?(?:termination|discontinuation)|termination or discontinuation of the plan|upon (?:such |the |any )?termination of the plan/i.test(s) &&
      // death/disability ACCELERATION only excludes when the sentence has
      // no service schedule of its own — "100% vested after the completion
      // of three years of service or upon death" is a real 3-year cliff
      !(/vested [^.]{0,60}?upon [^.]{0,25}?(?:death|disab)/i.test(s) && !/years? of (?:vesting |credited |continuous )?service|completion of/i.test(s))
      || /\bvests? immediately\b/i.test(s)) vestSentences.push(s);
  }
  // sentences describing a SUPERSEDED schedule ("prior to January 1, 2021,
  // vesting was based on…", Silvertip) rank behind current-tense ones
  // forfeiture-accounting sentences ("forfeited non-vested accounts …
  // were used to reduce Company contributions") mention vesting words but
  // never state the schedule — 3,582 of them shipped as the vesting quote
  const vRank = (s) =>
    (/(?:prior to|before|until|through) (?:[a-z]+ \d{1,2},? )?\d{4}/i.test(s) ? 2 : 0) +
    (/forfeit/i.test(s) ? 1 : 0);
  vestSentences.sort((a, b) => vRank(a) - vRank(b));
  // "are vested immediately" word order counts the same as "immediately
  // vested"; and when the MATCH is stated immediately vested, a graded/
  // cliff schedule scoped ONLY to discretionary non-elective / profit-
  // sharing money must not displace it (Kast: safe-harbor match immediate,
  // PS graded 2–6 yrs — the match is the plan's active employer money)
  // "fully vested upon" must name an ENROLLMENT-type event — the bare
  // "upon" alternative matched "fully vested upon the termination or
  // discontinuation of the Plan", which is universal IRC-required
  // boilerplate in every plan, and shipped Sempra's 1-year cliff as
  // "Immediate" (owner-caught)
  const IMMED = /immediately? (?:(?:100|one hundred) ?(?:percent|%) )?(?:fully )?vested|vested immediately|\bvests? immediately\b|fully vested (?:at all times|immediately|upon (?:hire|enrollment|eligibility|entry|participation))|(?:100|one hundred) ?(?:percent|%) vested (?:at all times|immediately|in all)|always (?:fully |(?:100|one hundred) ?(?:percent|%) )?vested/i;
  const matchImmediate = vestSentences.some((s) =>
    /matching (?:contributions?|accounts?)|company match/i.test(s) && IMMED.test(s));
  // graded/cliff language always describes employer money — check it FIRST
  let horizonFallback = null; // 4-6yr full-vesting horizon, used only if nothing better is found
  // v93: a cliff read by SHAPE (v92) is a last resort, never a preemption. It
  // broke the sentence loop on first match and so beat the filed TABLE readers
  // that run after the loop: 48 plans lost a real "less than 2 yr: 0%, 2 yr:
  // 20% … 6 yr: 100%" schedule to one money type's single sentence.
  let shapeCliff = null;
  for (const s of vestSentences) {
    if (matchImmediate && /non.?elective|profit.?sharing/i.test(s) && !/match/i.test(s)) continue;
    // v81: an adjective between "per" and "year" is common and broke the
    // whole pattern — "A participant becomes 25% vested after one year of
    // service, INCREASING BY 25% PER ADDITIONAL YEAR, with full vesting
    // after four years of credited service" is a 4-year graded schedule
    // that read as nothing at all
    const graded = s.match(/(\d{1,2}) ?(?:percent|%) (?:per|a|each|for each|after each) (?:additional |subsequent |succeeding |full |completed |further )?year|vests? (\d{1,2}) ?(?:percent|%) after each year|graded vesting|graduated vesting/i);
    // a multi-step percent-at-year LIST is a graded schedule even though
    // no single step says "per year" — its final "100% after three years"
    // step matched the cliff pattern and shipped a graded schedule as
    // "3-year cliff" (Wisconsin Cheese class, both hire-date cohorts)
    const steps = (s.match(/\d{1,2} ?(?:percent|%)(?: vested)? after (?:\w{3,5}|\d{1,2}) years?/gi) || []).length;
    /* v89: that pattern needs the percentage ADJACENT to "after N years", and
     * auditors put the money type in between: "Participants become 50% vested
     * in the Employer's matching contributions AND EARNINGS THEREON after two
     * years of service and 100% vested after three years" counted one step, so
     * the sentence fell through and its final step matched the cliff reader —
     * shipping a 2-step ladder as a 3-year CLIFF. Measured on the v88 data:
     * 175 rows, 75 stored as a cliff and 100 as "N-year schedule (shape not
     * stated)". Held back until v88 because relabelling to a bare "Graded
     * schedule" dropped the horizon; the post-pass now restores it, so the
     * 100 schedule rows keep their year and gain the shape.
     * Two DISTINCT percentages with at least one under 100 — distinct values,
     * not step count, because two 100% steps are two cliffs for two money
     * types. Additive by construction: only sentences the narrow detector
     * could not see reach this. */
    const wideSteps = [...new Set([...s.matchAll(/(\d{1,3}|one hundred) ?(?:percent|%)[^.]{0,130}?after(?: completing| the completion of)?[^.]{0,25}?\b(?:\w{3,5}|\d)\s+years?/gi)]
      .map((m) => (String(m[1]).toLowerCase() === "one hundred" ? 100 : +m[1])))];
    const wideLadder = wideSteps.length >= 2 && wideSteps.some((v) => v < 100);
    if (steps >= 2 || wideLadder) { out.vesting = "Graded schedule"; out.vestingText = cap(s); break; }
    // 3rd alternative tolerates intervening words — "fully vested in
    // employer matching contributions, and earnings thereon, upon
    // completion of three years of service" (Northrop Grumman)
    // 6th alternative: "Vesting … occurs upon the earliest of … credited
    // with one year of vesting service" (Sempra) — earliest-of lists put
    // the schedule behind an alternatives structure no other shape catches
    /* v84: a LADDER is not a cliff. The reversed-order arms added below
     * ("are vested 100% after three years") match the first step of a
     * multi-step sentence too — "become 50% vested … after completing one
     * year … and 100% vested after completing two years" read as a 1-year
     * cliff, worse than the 2-year cliff it replaced. Two DISTINCT
     * percentages with at least one under 100 is a ladder; two 100% steps
     * are two cliffs for two money types, which is why the test is on
     * distinct values and not on step count. Measured: this leaves the
     * existing cliff readings untouched and only holds the new arms back.
     * (The 237 rows where a ladder currently reads as an N-year schedule or
     * a cliff are a separate change — relabelling them "Graded schedule"
     * would drop the horizon, and "6-year graded" needs the frontend
     * considered. Recorded as a v85 candidate, not smuggled in here.) */
    /* v86: the 80-char window between "100% vested" and "after N years" was
     * cutting off the money-type list auditors actually write — "100% vested
     * in the Company's discretionary employer match and discretionary
     * non-elective profit-sharing contributions, if any, after 5 years" is
     * 130 characters wide. Sized against the stored quotes: 163 rows that
     * state a plain cliff and carried no label, none of them ladders, none
     * with an unusable year.
     * The extra width can bridge TWO vesting claims, though, and then the
     * years belong only to the later one: "100% vested in the Company match
     * … and are vested in the Company RETIREMENT CONTRIBUTION upon completion
     * of 2 years" is two employer sources with different rules.
     * Scoped per the standing rule: this guard applies ONLY where the extra
     * width was needed. A span the 80-char window already matched keeps its
     * old answer — measured, a global version would have removed 13 existing
     * cliff labels, and reading them they are almost all correct, because the
     * commonest two-claim sentence is "employee money immediate AND employer
     * money after N years", where the cliff describes the employer money. */
    const cliffNarrow = /(?:(?:100|one hundred) ?(?:percent|%)|fully) vest(?:ed)?[^.]{0,80}?(?:after|upon)(?: the)?(?: complet\w+(?: of)?)? (?:\w{3,5}|\d) years?/i.test(s);
    const twoClaims = (span) => !cliffNarrow
      && /\bvest(?:ed|s|ing)?\b[^.]{0,120}?\b(?:and|but|while|whereas)\b[^.]{0,60}?\bvest(?:ed|s|ing)?\b/i.test(span);
    const ladderPcts = [...new Set([...s.matchAll(/(\d{1,2}|100) ?(?:percent|%)(?: vested)?[^.]{0,130}?after(?: completing| the completion of)?[^.]{0,25}?(?:\w{3,5}|\d{1,2}) years?/gi)].map((m) => +m[1]))];
    /* v87: a bare percentage TABLE is graded evidence too, and the ladder
     * test above could not see it — it requires "% … after N years", which a
     * rendered table never says: "…ntage Less than 1 0% 1 33% 2 67% 3 100%
     * Participants become fully vested in the Company's discretionary
     * non-elective contribution portion…" shipped as a 3-year CLIFF, which
     * tells the participant they get nothing for three years when they are
     * earning a third a year. Three of v86's 30 Graded->cliff moves were
     * this shape. Three or more distinct percentages with at least two under
     * 100 is a schedule, not a cliff. */
    const allPcts = [...new Set((s.match(/\b(\d{1,3}) ?%/g) || []).map((x) => parseInt(x)))];
    const pctTable = allPcts.length >= 3 && allPcts.filter((v) => v < 100).length >= 2;
    const isLadder = (ladderPcts.length >= 2 && ladderPcts.some((v) => v < 100)) || pctTable;
    let cliff = s.match(/(?:(\w{3,5}|\d)[- ]year cliff|cliff vesting[^.]{0,40}?(\w{3,5}|\d) years?|(?:(?:100|one hundred) ?(?:percent|%)|fully) vest(?:ed)?[^.]{0,130}?(?:after|upon)(?: the)?(?: complet\w+(?: of)?)? (\w{3,5}|\d) years?|0 ?(?:percent|%) vested until (\w{3,5}|\d) years|vests? (?:100|one hundred) ?(?:percent|%)[^.]{0,60}?(?:after|upon)(?: the)?(?: complet\w+(?: of)?)? (\w{3,5}|\d) years?|vest(?:ing|s)?\b[^.]{0,170}?credited with (\w{3,5}|\d) years? of (?:vesting |credited |continuous )?service|\bvest(?:ed|s)?\s+(?:at\s+)?(?:100|one hundred) ?(?:percent|%)[^.]{0,60}?(?:after|upon|following)(?: the)?(?: complet\w+(?: of)?)?\s+(\w{3,5}|\d)[\s(]*\d?\)?\s*years?|vesting of (?:100|one hundred) ?(?:percent|%)[^.]{0,40}?after[^.]{0,25}?(\w{3,5}|\d) years?|(?:100|one hundred) ?(?:percent|%) vesting occurr\w+[^.]{0,40}?after[^.]{0,25}?(\w{3,5}|\d)[\s(]*\d?\)?\s*years?|\b(?:fully |(?:100|one hundred) ?(?:percent|%) )vest\w*[^.]{0,110}?after (?:obtaining|completing|they complete)[^.]{0,25}?(\w{3,5}|\d) (?:or more )?years?|\bvest\w*[^.]{0,60}?(?:fully|(?:100|one hundred) ?(?:percent|%))[^.]{0,60}?after (?:obtaining|completing|they complete)[^.]{0,25}?(\w{3,5}|\d) (?:or more )?years?|\bis (?:100|one hundred) ?(?:percent|%) after[^.]{0,25}?(\w{3,5}|\d) years?)/i);
    if (graded) { out.vesting = "Graded schedule"; out.vestingText = cap(s); break; }
    /* v92: the cliff alternation above is a SPELLING LIST, and a sample of 12
     * real filings drawn from the 2,159 vesting-quote-only rows showed 12 of 12
     * stating a plain cliff it cannot read: "vest fully when such participant
     * ATTAINS two years of credited service", "fully vested … FOLLOWING
     * COMPLETION of three years", "are NOT VESTED UNTIL completion of 2 years
     * … at which time they become 100% vested", "fully vested … after
     * ATTAINING six years", "AFTER 4 years of service, Company contributions
     * become fully vested". Each needs its own arm in a regex that is already
     * 1,400 characters long, and the next filing will use a verb none of them
     * lists — the same failure that produced v76's FEIN guard and v91's match
     * splice. So match on SHAPE instead: a full-vesting claim and a service
     * duration inside one sentence, close together. Every existing guard still
     * applies, because this only supplies the match the alternation missed. */
    let cliffFromShape = false;
    if (!cliff) {
      // "36 months of vesting service" is three years; anything not a whole
      // number of years is left to the quote, which states it exactly
      const monthsAsYears = (txt) => {
        const m = /\b(\d{1,3}) months? of (?:vesting |credited |continuous )?(?:service|employment)/i.exec(txt);
        if (!m || +m[1] % 12 || +m[1] < 12 || +m[1] > 84) return null;
        const out = [m[0], String(+m[1] / 12)];
        out.index = m.index;
        return out;
      };
      const fullClaim = /(?:(?:100|one hundred) ?(?:percent|%)|fully)[ -]?vest\w*|vest\w* fully|not vested until|(?:are|is) not vested/i;
      // "becomes vested after one year of service" states a cliff without the
      // word "fully" — trustworthy only when the sentence names no partial
      // percentage, otherwise it is one step of a ladder
      // Ford states the whole rule with the bare verb and no adverb at all:
      // "Company matching contributions and FRP Contributions VEST three years
      // after the original date of hire." Requiring "vested"/"fully"/"100%"
      // loses it, so accept "<contributions> vest" — anchored on the noun, not
      // on the verb alone, which would fire on any vesting sentence anywhere.
      const bareClaim = /becomes? vested|(?:are|is) vested|contributions?\b[^.]{0,60}?\bvest\b/i;
      // A PARTIAL percentage anywhere in the sentence means the participant
      // earns the money in pieces, so the year count is the END of a graded
      // schedule, not a cliff: "Company contributions vest 25% FOR EACH of the
      // first two calendar years … and become fully vested after the
      // participant completes three years" reads as a 3-year cliff under a
      // count-based ladder test (only two distinct percentages) and would tell
      // that participant they get nothing for three years when they earn a
      // quarter of it a year. 0 and 100 are the cliff's OWN vocabulary
      // ("0% vested … until they complete two years, after which … 100%") and
      // stay allowed.
      const partialPct = allPcts.some((v) => v > 0 && v < 100);
      // and a carve-out sentence describes two money types at once ("all
      // contributions are fully vested at all times, EXCEPT the employer's
      // non-elective contributions, which require three years"). Naming
      // either half alone misdescribes the other, so leave the sentence to
      // the paths v81 already settled rather than relitigating it here.
      const carveOut = /\b(?:except|other than|with the exception of)\b/i.test(s);
      // a COLLECTIVELY BARGAINED cohort is not the plan: "All participants are
      // immediately vested … Participants NOT COVERED by a collective
      // bargaining agreement are also immediately vested in the Employer's safe
      // harbor contributions. Participants COVERED by a collective bargaining
      // agreement are vested in the Employer's non-safe-harbor contribution …
      // after the completion of three years of service." Everyone outside the
      // CBA gets employer money immediately, so "3-year cliff" would be wrong
      // for most of the plan. Hire-date cohorts differ — those already carry a
      // "(varies by hire date per the filing)" label — but no such disclosure
      // exists for bargaining units, so the sentence stays with its quote.
      const unionCohort = /collective(?:ly)? bargain|union[- ]represent|\bunion\b[^.]{0,40}(?:employee|participant|member)|(?:not )?covered by a (?:collective|cba)/i.test(s);
      const onlyFullPcts = allPcts.every((v) => v === 100);
      // "100% vested PROPORTIONALLY OVER three years", "vested OVER a period of
      // three years", "vesting … is BASED ON years of service" all describe
      // earning the money across the years, or state no shape at all. Reading
      // any of them as a cliff says the participant gets nothing until year N.
      // "vest … ON A SCHEDULE BEGINNING AFTER two years of service" and "vest in
      // increments of 20% BEGINNING AT the end of the second year" both name a
      // schedule's STARTING point, not the year the money is fully earned
      const gradedWording = /over a period of|proportionally over|\bover \w+ years?\b|based on (?:continuous |credited )?years of service|ratabl[ey]|in increments|each year thereafter|on a (?:graduated |vesting |graded )?schedule|beginning (?:at|after)|graduated basis/i.test(s);
      const claimRe = partialPct || carveOut || unionCohort || gradedWording ? null
        : fullClaim.test(s) ? fullClaim : (!isLadder && onlyFullPcts ? bareClaim : null);
      const cm = claimRe && claimRe.exec(s);
      /* v95, from six of the largest plans in the country, each showing no
       * vesting answer while its filing states one plainly. The duration
       * pattern only knew "N years of service":
       *   Ford            "vest three years after the original date of hire"
       *   American        "employed for two years before becoming 100% vested"
       *   Johnson&Johnson "completed a three-year period of service"
       *   Bank of America "fully vested after completion of 36 MONTHS of
       *                    vesting service"
       * Months are accepted only in whole years (12/24/36/48/60/72): a filing
       * that says 18 months means something the year label cannot express, and
       * guessing is worse than the quote alone. */
      const dm = cm && (/(\w{3,5}|\d)\+? (?:plan )?years? of (?:vesting |credited |continuous |eligibility )?(?:service|employment)/i.exec(s)
        || /(\w{3,5}|\d{1,2}) years? (?:after|from)[^.]{0,40}?(?:date of hire|hire date|original hire|date of employment|employment date)/i.exec(s)
        || /\bemployed[^.]{0,20}?for (\w{3,5}|\d{1,2}) years?/i.exec(s)
        || /(\w{3,5}|\d{1,2})[- ]year period of (?:credited |continuous |vesting )?service/i.exec(s)
        || monthsAsYears(s));
      if (cm && dm && !isLadder) {
        const a = Math.min(cm.index, dm.index);
        const b = Math.max(cm.index + cm[0].length, dm.index + dm[0].length);
        // the claim and the duration must belong to each other: a full stop
        // between them is two statements, and 200 characters is the widest
        // span any of the 12 sampled filings needed
        if (b - a <= 200 && !/[.;]\s/.test(s.slice(a, b))) {
          cliff = [s.slice(a, b), dm[1]];
          cliff.index = a;
          cliffFromShape = true;
        }
      }
    }
    if (cliff) {
      // v84 added five arms with the percentage AFTER the verb ("are vested
      // 100% after three years"); their capture groups are 7-11, and reading
      // only 1-6 would have matched the sentence and then produced NaN
      // groups 7-11 are the v84 reversed-order arms; on a ladder they are
      // matching a step, not the plan's cliff, so let the sentence fall
      // through to the graded readers instead of naming a wrong year
      const gi = cliff.slice(1).findIndex((g) => g != null);
      // a ladder IS a graded schedule, so say that rather than falling
      // through to nothing: "become 50% vested … after completing one year
      // … and 100% vested after completing two years" is graded, and the
      // step-count detector above missed it because its window could not
      // span the clause between the percentage and "after"
      if (twoClaims(cliff[0])) continue;
      /* …and a rule the filing has already REPLACED is not this plan's rule:
       * "PRIOR TO JULY 1, 2019, participants were fully vested in the
       * employer's matching and profit-sharing contributions … after three
       * years". Same scoping as twoClaims — 99 EXISTING cliff labels open
       * with a date clause and that population is contaminated: "Participants
       * HIRED BEFORE July 1, 2009 are 100% vested after three years" is a
       * cohort, already labelled correctly by hireSplitLabel. Untangling
       * those needs its own pass; this only stops the widening adding new ones. */
      /* v88: the cohort exemption was too narrow and the guard suppressed the
       * quote. Both found by reading run #172. "ANYONE WHO ENTERED the Plan
       * prior to January 1, 2008, IS always 100% vested", "Participants IN THE
       * PLAN before November 21, 2019 ARE immediately vested", "participants
       * ENROLLED on or before December 31, 2021 ARE immediately vested" all
       * describe WHO, in the present tense — they are live cohort rules, not
       * rules the plan replaced. 5 correct labels were dropped.
       * And the guard must keep the QUOTE: a superseded sentence is still the
       * only thing the filing says about vesting, it is verbatim, and it dates
       * itself so a reader can see what it is. 13 schedule-bearing quotes were
       * suppressed — the FOURTH time a new guard has taken the evidence with
       * the answer (v82, v83, v84, now v86/87). */
      if (supersededRule(s)) {
        if (!out.vestingText && !/forfeit/i.test(s)) out.vestingText = cap(s);
        continue;
      }
      if (isLadder && (gi >= 6 || pctTable)) { out.vesting = "Graded schedule"; out.vestingText = cap(s); break; }
      const n = cliff[gi + 1];
      // ordinals too: "100% vesting is achieved after the FIFTH year of
      // service" — 9 quotes state the year that way and captured a word the
      // map did not know, yielding NaN. NaN was harmless (both range tests
      // below fail) but the filing does state the number.
      const num = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6,
        first: 1, second: 2, third: 3, fourth: 4, fifth: 5, sixth: 6 }[String(n).toLowerCase()] || +n;
      // IRC §411(a)(2)(B) caps DC cliff vesting at 3 years — a "5-year
      // cliff" reading is a misparsed graded schedule or service reference
      // 4-6 years cannot be a cliff, but the filing DOES state when the
      // participant is fully vested — Swinerton's "100% vested after five
      // years of credited service" was dropped to nothing. Remember it as a
      // LAST RESORT only: taking it here would break the sentence loop and
      // preempt a graded schedule or an immediate-vesting statement later in
      // the notes, which the sweep caught it doing to 20 plans.
      if (num >= 4 && num <= 6 && !horizonFallback) {
        horizonFallback = { num, text: s.length > 300 && cliff.index > 60
          ? cap("…" + s.slice(Math.max(0, cliff.index - 60))) : cap(s) };
      }
      /* v86: "ratably" / "pro-rata" / "in equal installments" means the
       * participant earns a share each year — that is a GRADED schedule, and
       * calling it an N-year cliff tells them they get nothing until year N,
       * which is the opposite of true. 17 stored cliff labels say it outright:
       * "A participant is 100% vested RATABLY after three years of credited
       * service", "Vesting is on a ratable, three-year GRADUATED basis",
       * "fully vested on a PRO-RATA basis after three years".
       * Scoped to the CLIFF range (1-3) on purpose: a 4-6 year reading is
       * already stored as "N-year schedule (shape not stated)", and turning
       * that into a bare "Graded schedule" would DROP the horizon, which is
       * the trade deferred as the v85 label-format candidate. */
      if (num >= 1 && num <= 3 && /\bratabl[ey]\b|\bpro[- ]rata\b|\bin equal (?:annual )?installments\b/i.test(s)) {
        out.vesting = "Graded schedule";
        out.vestingText = s.length > 300 && cliff.index > 60
          ? cap("…" + s.slice(Math.max(0, cliff.index - 60))) : cap(s);
        break;
      }
      if (num >= 1 && num <= 3 && cliffFromShape) {
        // hold it: a table or graded reading later in the notes is the more
        // complete answer and must get first refusal
        // employerMoney belongs to the immediate-vesting loop; test this
        // sentence directly rather than reaching for a name from another scope
        if (!shapeCliff) shapeCliff = { num,
          employer: /matching|employer|company|non.?elective|profit.?sharing|discretionary/i.test(s),
          text: s.length > 300 && cliff.index > 60
            ? cap("…" + s.slice(Math.max(0, cliff.index - 60))) : cap(s) };
        continue;
      }
      if (num >= 1 && num <= 3) {
        out.vesting = `${num}-year cliff`;
        // long amendment sentences bury the cliff phrase past the 300-char
        // cap — window the quote around the MATCH so it always contains
        // the number it proves (the 3 residual audit mismatches were all
        // this: "amended … to retain the six-year schedule … and reduce …"
        // with "three-year cliff" cut off at char 300)
        out.vestingText = s.length > 300 && cliff.index > 60
          ? cap("…" + s.slice(Math.max(0, cliff.index - 60)))
          : cap(s);
        break;
      }
    }
  }
  // vesting stated as a service-year TABLE rather than prose ("2 Years 20,
  // 3 Years 40, ... 5 Years 100" — Kohler style). Require 3+ pairs with
  // non-decreasing percentages ending at 100 within reach of a "vest" word.
  if (!out.vesting) {
    for (const m of t.matchAll(/\bvest(?:ed|ing)?\b/gi)) {
      const win = t.slice(m.index, m.index + 500);
      const pairs = [...win.matchAll(/(?<!than )\b(\d{1,2}) ?years? +(\d{1,3})(?: ?(?:percent|%))?(?=[ .,;)])/gi)]
        .map((p) => [+p[1], +p[2]]).filter(([y, pc]) => y >= 1 && y <= 10 && pc <= 100);
      if (pairs.length >= 3 && pairs[pairs.length - 1][1] === 100 &&
          pairs.every(([, pc], i2) => i2 === 0 || pc >= pairs[i2 - 1][1])) {
        out.vesting = "Graded schedule";
        out.vestingText = cap("Vesting schedule as filed — " + pairs.map(([y, pc]) => `${y} yr: ${pc}%`).join(", "));
        break;
      }
    }
  }
  // header-labeled tables with BARE digit rows — "Years of Service  Vesting
  // Percentage / Less than 1  0% / 1  20% / … / 5 or more  100%" (Simmons
  // Foods) carry no "years" word per row, so the pairs fallback misses them
  if (!out.vesting) {
    // header variants: "Vested / Years of Service / Percentage" (AVI-SPL)
    // puts "Vested" ABOVE the column pair — the label order is free-form
    // floating-label headers put "Vesting"/"Vested" ABOVE the columns, so
    // the linearized order is "Vesting Years of Credited Service
    // Percentage" (AbbVie) or just "Vesting Service percentage" (Abbott)
    // v56 S&P-sweep header variants: "Completed Years of Service Percent
    // Vested" (Micron, Generac), "Years of Service Vesting" (UnitedHealth),
    // "Years of Service Vested %" (Transdigm), reversed "Percent Years of
    // vesting service vested" (Weyerhaeuser), "Vested Percentage Years of
    // service" (Rollins)
    const th = t.match(/years of\s+percent\s+(?:credited |continuous |vesting )?service\s+vested|years of (?:credited |continuous )?(?:service|vesting service)\s+(?:vesting|vested) percentage|following vesting schedule:?\s+years\s+(?:employer|vested|vesting)|vested\s+years of service\s+percentage|following schedule:?\s*vested\s+years of service\s+percentage|years of service\s+percentage|(?:vesting|vested)\s+(?:years of (?:credited |continuous )?service|service)\s+percentage|(?:completed )?years of (?:credited |continuous )?service\s+percent(?:age)? vested|years of service\s+vesting\b|years of (?:credited |continuous )?service\s+vested ?%?|percent\s+years of (?:vesting |credited |continuous )?service\s+vested|vested percentage\s+years of service|years of (?:credited |continuous )?service\s+%\s*vested|years\s+percentage\s+of service\s+vested|vested\s+(?:completed\s+)?years of (?:credited |continuous )?service\s+percent/i);
    if (th) {
      let win = t.slice(th.index + th[0].length, th.index + th[0].length + 340);
      // stop at resumed prose — back-to-back tables (AbbVie files the
      // match cliff then the ASP+ graded schedule) otherwise interleave
      // into one non-monotonic pair list that fails both shapes
      const cut = win.search(/(?:vesting|vested) in\b|is based on|according to|are forfeited/i);
      if (cut > 0) win = win.slice(0, cut);
      // "—%" / "–%" is a zero cell (Weyerhaeuser, Simon Property)
      win = win.replace(/[–—]\s*%/g, "0%");
      const W2N = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6 };
      /* v99: a RANGE row names the year the percentage STARTS, not the year it
       * ends. US Foods files "Less than 1 / 0%, 1 to 2 / 33%, 2 to 3 / 67%,
       * 3 or more / 100%" — a participant with ONE year of service is 33%
       * vested. Matching a bare number grabbed the range's UPPER bound and
       * stored "2 yr: 33%, 3 yr: 67%", shifting the whole schedule a year
       * later and understating every participant's vested balance.
       * Owner-reported 2026-09-01 from the filing itself. */
      const lowerBound = (lbl) => lbl.replace(/^(\d{1,2})\s*(?:to|through|[-–—])\s*\d{1,2}/, "$1");
      const RANGE = "\\d{1,2}\\s*(?:to|through|[-–—])\\s*\\d{1,2}(?: years?(?: of service)?)?";
      const pairs = [...win.matchAll(new RegExp("(" + RANGE + "|less than (?:\\d{1,2}|one|two|three|four|five|six)(?: years?(?: of service)?)?|(?:\\d{1,2}|one|two|three|four|five|six)(?: or more)?(?: years?(?: of service)?)?(?: or more| ?\\+)?) +(\\d{1,3}) ?%", "gi"))]
        .map((p) => [lowerBound(p[1].toLowerCase()), +p[2]]).filter(([, pc]) => pc <= 100);
      // bare-number tables ("Less than 2  0% / 2  20 / 3  40 … 6 or more
      // 100") print the percent sign only on the first row or not at all
      // (Simon Property) — a second scan without the % requirement,
      // accepted only with the strong structural guards below (>=4 rows,
      // ascending years, monotonic to exactly 100)
      if (pairs.length < 3) {
        const bare = [...win.matchAll(new RegExp("(" + RANGE + "|less than \\d{1,2}|\\d{1,2}(?: or more| ?\\+)?)(?: years?(?: of service)?)? +(\\d{1,3}) ?%?(?=[ \\n]|$)", "gi"))]
          .map((p) => [lowerBound(p[1].toLowerCase()), +p[2]]).filter(([, pc]) => pc <= 100);
        const yrs = bare.map(([y]) => +(y.match(/\d+/) || [0])[0]);
        const yAsc = yrs.every((v, i2) => i2 === 0 || v >= yrs[i2 - 1]);
        if (bare.length >= 4 && yAsc && bare[bare.length - 1][1] === 100 &&
            bare.every(([, pc], i2) => i2 === 0 || pc >= bare[i2 - 1][1])) { pairs.length = 0; pairs.push(...bare); }
      }
      const mono = pairs.every(([, pc], i2) => i2 === 0 || pc >= pairs[i2 - 1][1]);
      // an OCR-garbled 100% row ("Sy) 100%" — Builders FirstSource) drops
      // the terminal pair; ≥4 monotonic rows rising from ≤25 is still a
      // graded schedule even when the readable rows stop at 80%
      if (mono && (pairs.length >= 3 && pairs[pairs.length - 1][1] === 100 ||
                   pairs.length >= 4 && pairs[pairs.length - 1][1] >= 80 && pairs[0][1] <= 25)) {
        out.vesting = "Graded schedule";
        out.vestingText = cap("Vesting schedule as filed — " + pairs.map(([y, pc]) => `${y.replace(/ ?(?:or more )?years?(?: of service)?$/, "")} yr: ${pc}%`).join(", "));
      } else if (pairs.length === 2 && pairs[0][1] === 0 && pairs[1][1] === 100) {
        // a two-row 0%→100% table is a CLIFF stated tabularly ("Less than
        // two years 0% / Two years or more 100%" — Abbott, AbbVie)
        const yw = pairs[1][0].match(/\d{1,2}|one|two|three|four|five|six/);
        const n = yw ? (W2N[yw[0]] || +yw[0]) : 0;
        if (n >= 1 && n <= 3) {
          out.vesting = `${n}-year cliff`;
          out.vestingText = cap("Vesting schedule as filed — " + pairs.map(([y, pc]) => `${y}: ${pc}%`).join(", "));
        }
      }
    }
  }
  // months-based cliff: "fewer than 12 months – 0%; 12 or more months –
  // 100%" (FedEx) — a 1-year cliff stated in months
  if (!out.vesting) {
    const mo = t.match(/(?:fewer|less) than (\d{1,2}) months?[^%]{0,12}?0 ?%;? ?\1 (?:months? )?or more(?: months?)?[^%]{0,12}?100 ?%/i);
    if (mo && +mo[1] % 12 === 0 && +mo[1] <= 36) {
      out.vesting = `${+mo[1] / 12}-year cliff`;
      out.vestingText = sentence(mo.index);
    }
  }
  // months-stated graded tables: "24 months but less than 36 months 25% …
  // 60 months or more 100%" (Textron)
  if (!out.vesting) {
    const runs = [...t.matchAll(/(\d{1,3}) months?(?: but less than \d{1,3} months?| or more)? +(\d{1,3}) ?%/gi)];
    let cur = [], best = null;
    for (const m of runs) {
      if (cur.length && m.index - cur[cur.length - 1].index > 110) cur = [];
      cur.push(m);
      if (cur.length >= 3 && +cur[cur.length - 1][2] === 100) best = [...cur];
    }
    if (best) {
      const vals = best.map((m) => +m[2]);
      const mono = vals.every((v, i2) => i2 === 0 || v >= vals[i2 - 1]) && vals.every((v) => v <= 100);
      if (mono && /vest/i.test(t.slice(Math.max(0, best[0].index - 260), best[0].index))) {
        out.vesting = "Graded schedule";
        out.vestingText = cap("Vesting schedule as filed — " + best.map((m) => `${+m[1]} mo: ${+m[2]}%`).join(", "));
      }
    }
  }
  // graded schedules as PROSE pair runs with no table header:
  // "2 years – 20%; 3 years – 40%; … 6 years – 100%" (J.B. Hunt),
  // "0 years of service 0% 1 year of service 25% …" (AvalonBay).
  // Demands ≥3 tightly-spaced pairs, monotonic, ending at exactly 100,
  // with vesting vocabulary just before the run.
  if (!out.vesting) {
    const runs = [...t.matchAll(/(\d{1,2}) ?years?(?: of (?:vesting |credited |continuous )?service)?(?: (?:or more|and (?:greater|above|over|more)))? ?[–—:=-]? ?(\d{1,3}) ?%/gi)];
    let cur = [], best = null;
    for (const m of runs) {
      if (cur.length && m.index - cur[cur.length - 1].index > 90) cur = [];
      cur.push(m);
      if (cur.length >= 3 && +cur[cur.length - 1][2] === 100) best = [...cur];
    }
    if (best) {
      const vals = best.map((m) => +m[2]);
      const mono = vals.every((v, i2) => i2 === 0 || v >= vals[i2 - 1]) && vals.every((v) => v <= 100);
      if (mono && /vest/i.test(t.slice(Math.max(0, best[0].index - 260), best[0].index))) {
        out.vesting = "Graded schedule";
        out.vestingText = cap("Vesting schedule as filed — " + best.map((m) => `${m[1]} yr: ${+m[2]}%`).join(", "));
      }
    }
  }
  // rate-first prose spans: "40% for 3 years but less than 4 years, 70% for
  // 4 years …, 100% for 5 years or more" (Omnicom)
  if (!out.vesting) {
    const runs = [...t.matchAll(/(\d{1,3}) ?% for (\d{1,2}) years?/gi)];
    let cur = [], best = null;
    for (const m of runs) {
      if (cur.length && m.index - cur[cur.length - 1].index > 130) cur = [];
      cur.push(m);
      if (cur.length >= 2 && +cur[cur.length - 1][1] === 100) best = [...cur];
    }
    if (best) {
      const vals = best.map((m) => +m[1]);
      const mono = vals.every((v, i2) => i2 === 0 || v >= vals[i2 - 1]) && vals.every((v) => v <= 100);
      if (mono && /vest/i.test(t.slice(Math.max(0, best[0].index - 260), best[0].index))) {
        out.vesting = "Graded schedule";
        out.vestingText = cap("Vesting schedule as filed — " + best.map((m) => `${m[2]} yr: ${+m[1]}%`).join(", "));
      }
    }
  }
  // a bare "subject to a five-year vesting schedule" / "based on a 6-year
  // vesting schedule" states the horizon but not the shape — say exactly
  // that much rather than nothing (or worse, guessing cliff vs graded)
  if (!out.vesting) {
    const horizon = t.match(/(?:subject to|based (?:up)?on|follows?|under) a (\w{3,5}|\d)[- ]year (?:graded )?vesting schedule/i);
    if (horizon) {
      const num = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6 }[String(horizon[1]).toLowerCase()] || +horizon[1];
      if (num >= 2 && num <= 6) {
        out.vesting = `${num}-year schedule (shape not stated)`;
        out.vestingText = sentence(horizon.index);
      }
    }
  }
  // "immediate" only counts when the sentence explicitly covers employer money
  if (!out.vesting) {
    for (const s of vestSentences) {
      // "always 100% vested in ALL of their Plan accounts" (EP Energy)
      // covers employer money without naming it
      /* v81: the gate demanded the employer noun ADJACENT to "contributions",
       * and three phrasings auditors actually use never satisfy that:
       *   "immediately vested in ALL contributions plus actual earnings"
       *   "immediately vested in ... the Company's SAFE HARBOR contributions"
       *   "... as well as the Bank's safe harbor contributions"
       * A safe harbor contribution is employer money by statute (IRC
       * 401(k)(12)/(13)), and "all contributions" covers employer money by
       * definition unless the sentence narrows it to the participant's own.
       * Measured on 39 filings sampled from the match-but-no-vesting backlog:
       * 22 carried a real immediate-vesting sentence and the gate rejected
       * every one of them. */
      const employerMoney =
        /(?:matching|employer|company|corporation|bank|partnership|association|non.?elective|profit.?sharing|plan sponsor|sponsor)(?:'s|s'|’s|s’)?(?:\s+\w+){0,3}\s+contributions?/i.test(s)
        || /(?:matching|employer|company|non.?elective|profit.?sharing|plan sponsor)(?:'s|s'|’s|s’)?\s+accounts?|company match/i.test(s)
        || /safe.?harbor(?:\s+\w+){0,2}\s+contributions?/i.test(s)
        || /all (?:of (?:their|his|her) )?(?:plan )?accounts|all contribution sources/i.test(s);
      // "all contributions" is universal only when nothing narrows it to the
      // participant's own money ("all of their own contributions", "all
      // elective contributions" are employee-side statements)
      const universal = /\ball (?:of the |the )?contributions?\b/i.test(s)
        && !/\ball (?:of )?(?:their|his|her|its) own\b|\ball (?:elective|salary|employee|participant|pre.?tax|voluntary|deferral)/i.test(s);
      // the ORIGINAL gate: the employer noun adjacent to "contributions". A
      // sentence that satisfies it kept its v80 answer and must keep it —
      // measured on 955 cached filings, applying the guards below to these
      // too cost 35 correct "Immediate" readings against 27 gains, because
      // plans that vest the MATCH immediately and profit-sharing over years
      // are common and the pre-existing non-elective scoping already handles
      // them. The new guards therefore police only the new admissions.
      const strictGate = /(matching|employer|company|non.?elective|profit.?sharing|plan sponsor) (?:contributions?|accounts?)|company match|all (?:of (?:their|his|her) )?(?:plan )?accounts|all contribution sources/i.test(s);
      if (!strictGate && !employerMoney && !universal) continue;
      /* …and the widened gate must not answer for a plan that vests the
       * PARTICIPANT's money immediately and the employer's over years:
       *   "immediately vested in their voluntary contributions as well as
       *    Company safe harbor contributions. Vesting in the remainder of
       *    their accounts is based on full years of credited service"
       * The second sentence is the plan's actual schedule. When any vesting
       * sentence scopes some other portion to years of service, this pass
       * states nothing rather than the opposite of the truth — and does not
       * leave the immediate sentence behind as the quote either. */
      /* The guard has to be general, not shape-specific. Two shapes turned up
       * in five sampled gains, and a pattern written for either one alone
       * would have shipped the other as a false "Immediate":
       *   remainder — "Vesting in the Bank's discretionary profit sharing
       *     contributions … is based on years of continuous service"
       *   cohort — "Participants covered by a collective bargaining agreement
       *     are vested in the Employer's non-safe-harbor contribution … after
       *     the completion of three years of service"
       * So: ANY other vesting sentence that puts employer money behind a
       * service condition means the plan is not uniformly immediate. */
      const remainderGraded = vestSentences.some((o) => o !== s
        && (/(?:matching|employer|company|bank|partnership|association|sponsor|non.?elective|profit.?sharing)/i.test(o)
          // "Vesting in THE REMAINDER of their accounts is based on full years
          // of credited service" names no employer at all — the portion the
          // immediate sentence did not cover is identified only by exclusion
          || /\bthe (?:remainder|balance|rest|remaining portion)\b/i.test(o))
        && /\bvest\w*\b[^.]{0,140}?(?:\bis\s+based\s+on\b[^.]{0,40}?\byears?\b|\bafter\s+(?:the\s+)?(?:completion\s+of\s+)?(?:\w+|\d+)\s+years?\b|\byears?\s+of\s+(?:vesting|credited|continuous)\s+service\b|\bvesting schedule\b)/i.test(o))
        /* …and a schedule introduced by a COLON and rendered as a table is
         * invisible to the sentence scanner above, which requires a
         * terminating period: "Vesting in the Bank's discretionary profit
         * sharing contributions … is based on years of continuous service
         * with the Bank as follows:" followed by a Years/Percent table. That
         * filing's only readable vesting sentence is the immediate one, so
         * the sentence-level guard cannot see the schedule that contradicts
         * it. Fall back to the raw notes text for that shape. */
        || /\bvest\w*[^.:]{0,140}?\bis\s+based\s+on\b[^.:]{0,60}?\byears?\s+of\b[^.:]{0,30}?\bservice\b/i.test(t)
        || /(?:completed\s+)?years?\s+of\s+(?:vesting\s+|credited\s+|continuous\s+)?service\s+(?:vested\s+)?percent/i.test(t);
      // "…immediately vested in their own contributions, Company matching
      // contributions … EXCEPT for the portion attributable to Company
      // Non-Matching contributions" — the exception is the schedule
      const carveOut = /\bexcept\b[^.]{0,90}?(?:matching|employer|company|non.?elective|profit.?sharing)/i.test(s);
      if (!strictGate && (remainderGraded || carveOut)) continue;
      /* v87: a superseded sentence is not this plan's rule on the IMMEDIATE
       * path either — "PRIOR TO MARCH 31, 2024, participants were immediately
       * vested in their elective salary deferral … and were vested on Plan
       * Sponsor contributions after …" shipped as Immediate. v86 put this
       * guard on the cliff path and did not carry it here, which is the same
       * miss v84 made with the loan hatch. Cohorts are exempt: "participants
       * HIRED BEFORE July 1, 2009" is a group, not a replaced rule. */
      if (supersededRule(s)) {
        if (!out.vestingText && !/forfeit/i.test(s)) out.vestingText = cap(s);
        continue;
      }
      /* v78: vesting accelerated BY PLAN TERMINATION is not the plan's vesting
       * schedule. Every plan must fully vest affected participants on
       * termination or partial termination — IRC 411(d)(3) — so the auditor's
       * sentence saying so is boilerplate, and reading it as "Immediate" states
       * the opposite of the truth for a plan that actually has a graded
       * schedule. 19 stored rows carry this shape.
       * The line between the two is whether the immediate claim is CONDITIONED
       * on that event. "In the event of a plan termination, participants become
       * 100% vested in all employer contributions" is conditioned; "Participants
       * are immediately vested in their contributions as well as employer
       * contributions… upon termination of employment" is not — it states the
       * schedule and merely mentions when accounts are paid out. Termination of
       * EMPLOYMENT is the ordinary vesting trigger and exempts the sentence. */
      const employmentEnd = /termination of (?:employment|service)|terminates? employment|separation from service/i.test(s);
      const planTermCond = !employmentEnd && (
        /(?:in the event of|upon|at|on)\s+(?:a\s+|the\s+|such\s+)?(?:partial\s+)?plan\s+termination|upon\s+termination\s+of\s+the\s+plan|the plan (?:is|was|were|be) terminated|termination or discontinuan?ce of the plan/i.test(s)
        // the condition can follow the verb ("became 100% vested … upon
        // termination") or open the sentence ("Upon termination, participants
        // were immediately vested …"); "such termination" refers back to a
        // plan-termination sentence before it
        || /\b(?:became|become|becomes|will become|shall become|would become|shall vest|vest)\b[^.]{0,70}?\b(?:upon|at|in the event of)\s+(?:the\s+|such\s+)?(?:partial\s+)?termination\b/i.test(s)
        || /^\s*(?:upon|at|in the event of)\s+(?:the\s+|such\s+)?(?:partial\s+)?termination\b/i.test(s));
      if (planTermCond) continue;
      /* …and a sentence that spells out a GRADED schedule is not describing
       * immediate vesting, whatever else it says. "A participant is 20% vested
       * after two years of service and is 100% vested in all accounts after six
       * years or upon termination due to death, disability or retirement" was
       * stored as Immediate — the IMMED pattern's "100% vested in all" arm
       * matched the six-year end of a 2-to-6-year ladder. */
      // no \b after the percent sign — "20% vested" has no word boundary there,
      // which is why the first version of this let a 2-to-6-year ladder through
      if (/\b[1-9]\d?\s?(?:%|percent\b)[^.]{0,40}?\bafter\b[^.]{0,30}?\byears?\b/i.test(s)) continue;
      /* v83: four gaps in the guards above, found by self-checking all 3,907
       * new Immediate labels v81 produced against their own quotes. 4 were
       * wrong — 0.10%, and the false-Immediate RATE across the whole stock
       * actually improved (0.130% → 0.122%), but wrong is worse than blank
       * here: it tells a participant their employer money is theirs today.
       *   1. "100" cannot match [1-9]\d? — two digits max — so the guard
       *      immediately above was blind to "immediately vested at 100
       *      percent AFTER three years of service", the commonest way to
       *      write a cliff while using the word "immediately".
       *   2. the condition can OPEN the sentence: "Upon three years of
       *      service, the participant is 100% vested in all contributions".
       *   3. the carve-out is not always worded "except": "…immediately 100%
       *      vested in the Organization's safe harbor contributions, BUT DO
       *      NOT VEST in discretionary contributions UNTIL after three years".
       *   4. a loan sentence that happens to carry "vested" and employer
       *      money produced a label out of nothing — v82 kept loan text out
       *      of the QUOTE but the LABEL path had no such test. */
      /* …but not when the MATCH is immediate and only non-elective /
       * profit-sharing money carries the years — that split is already the
       * project's settled reading (the graded loop's matchImmediate rule),
       * and this guard was overriding it: "immediately vested in the
       * matching contributions received and 100% vested after five years of
       * vesting service in the nonelective contributions" is an immediate
       * match, and the plan's active employer money is the match. */
      // safe-harbor money counts as active employer money exactly like a
      // match — "immediately vested in the safe harbor contributions and 100%
      // vested after five years … in the discretionary non-elective
      // contributions" is the same split, written without the word "match".
      // The exemption must NOT cover an either/or across participant GROUPS:
      // "contributions vest under EITHER 'safe harbor' provisions … WHEREBY
      // such contributions are immediately vested OR under a vesting schedule
      // whereby the participant is 100% vested after five or six years" is
      // two populations, and "Immediate" is wrong for one of them.
      const activeImm = /(?:match\w*|safe.?harbor)[^.]{0,80}?(?:immediat|at all times)|(?:immediat|at all times)[^.]{0,80}?(?:match\w*|safe.?harbor)/i.test(s);
      const otherGraded = /non.?elective|profit.?sharing|discretionary|other (?:sponsor|company|employer|plan sponsor) contributions/i.test(s);
      const eitherOr = /\beither\b[^.]{0,120}?\bor\b|\bwhereby\b/i.test(s);
      const matchImmNonElecGraded = activeImm && otherGraded && !eitherOr;
      /* v84: these four block the LABEL, not the QUOTE. v83 wrote them as
       * bare `continue`s, which skipped the quote fallback at the bottom of
       * the loop too — and measured over the universe that removed 195
       * quotes of which 188 carried real schedule content ("Plan Sponsor
       * contributions are vested 100% after three years of service"). That
       * was a worse regression than the 4 false labels v83 fixed: the
       * sentence is the most informative thing the filing offers about
       * vesting, and it is exactly the sentence these guards recognise.
       * Blocking a wrong ANSWER must never suppress the honest EVIDENCE. */
      // WHY it was blocked decides whether the quote survives: the first
      // three guards fire on genuine vesting sentences that merely state a
      // service condition, so the sentence is the best evidence available
      // and must still be quoted. The loan guard fires on text that is not
      // about vesting at all — quoting it is the defect v82 removed, and
      // the gate caught this reintroducing it.
      let labelBlocked = false, blockedButQuotable = false;
      if (/(?:100|one hundred) ?(?:percent|%)[^.]{0,40}?\bafter\b[^.]{0,30}?\byears?\b/i.test(s)
          && !/regardless of (?:the )?(?:number of )?years/i.test(s)
          && !matchImmNonElecGraded) labelBlocked = blockedButQuotable = true;
      if (/^[^.]{0,30}\bupon\s+(?:the\s+)?(?:completion\s+of\s+)?(?:one|two|three|four|five|six|\d)\s+years?\s+of\s+service/i.test(s)) labelBlocked = blockedButQuotable = true;
      if (/\bbut\b[^.]{0,60}?\bnot\b[^.]{0,40}?\bvest\w*[^.]{0,40}?\buntil\b/i.test(s)) labelBlocked = blockedButQuotable = true;
      // the immediate-vesting words can sit on EITHER side of "vest"
      // ("immediately vested" vs "vested … at all times"), so this test must
      // be order-independent — the first version required them after, and
      // dropped a correct Immediate whose window happened to reach a loan note
      /* v85: the loan guard needs v82's escape hatch too. Measured over the
       * universe after v84: it still suppressed 26 quotes and ALL 26 carried
       * the plan's real schedule — "Employer contributions are subject to the
       * following vesting schedule: Notes receivable from participants —
       * Participants may borrow from their fund accounts…" is one sentence
       * window spanning the schedule AND the loan heading after it. The label
       * must still be blocked (that text is not a vesting claim), but the
       * schedule is the best evidence the filing offers and has to survive.
       * This is the same escape hatch v82 put on the quote fallback; v84 put
       * the guard on the label path and did not carry it across. */
      if (/loan application|prevailing interest rates|\bborrow\b|obtain loans/i.test(s)
          && !/(?:immediat|at all times|regardless of (?:the )?(?:number of )?years)/i.test(s)) {
        labelBlocked = true;
        if (/years? of (?:vesting |credited |continuous )?service|vesting schedule|\bgraded\b|\bcliff\b|\d{1,2} ?% vested|percentage vested|vested percentage|schedule below|as follows|following schedule/i.test(s)) blockedButQuotable = true;
      }
      if (labelBlocked) {
        if (blockedButQuotable && !out.vestingText && !/forfeit/i.test(s)) out.vestingText = cap(s);
        continue;
      }
      if (IMMED.test(s)) {
        out.vesting = "Immediate"; out.vestingText = cap(s); break;
      }
      /* v82: the same wrong-topic defect v80 fixed for the match quote —
       * measured separately here rather than ported blind, because the two
       * fields fail differently. A sentence can mention employer money AND
       * the word "vested" while describing loans, in-service withdrawals,
       * hardship distributions or "refer to the plan document"; 93 stored
       * rows display one under Vesting ("The Plan permits participants … to
       * borrow a minimum of $500 …").
       * The escape hatch is load-bearing and was found by measuring: 38 of
       * the 108 sentences this pattern matches ALSO carry the plan's real
       * schedule, because the sentence window spans the schedule and the
       * "Notes Receivable from Participants" heading that follows it. Some
       * carry a whole Years/Percent table. Dropping on the topic marker
       * alone would have deleted them. */
      const offTopic = /notes receivable from participants|\bborrow\b|obtain loans|in.?service withdrawal|available for withdrawal|\bhardship|refer to the (?:basic )?plan document|reference should be made to|summary plan description|eligibility (?:requirements|rules)|payment of benefits|lump.?sum distribution|may be withdrawn/i.test(s)
        && !/years? of (?:vesting |credited |continuous )?service|vesting schedule|\bgraded\b|\bcliff\b|\d{1,2} ?% vested|percentage vested|vested percentage|immediately vested|vested immediately|fully vested (?:at all times|immediately|in all)|100 ?% vested (?:at all times|immediately|in all)|at all times|schedule below|as follows|following schedule/i.test(s);
      if (!out.vestingText && !/forfeit/i.test(s) && !offTopic) out.vestingText = cap(s);
    }
  }
  // LAST of the vesting readers: a 4-6yr full-vesting horizon fills a gap
  // only when nothing better was found. Placed after the immediate-vesting
  // pass on purpose — sitting before it, this overwrote "Immediate" on 11
  // plans whose notes vest deferrals immediately and employer money over
  // years ("Participants are immediately vested in their contributions, and
  // become fully vested in their profit sharing contributions after six").
  /* v93: the held shape-cliff fills a BLANK and nothing else. It does not
   * arbitrate against "Immediate", and that is a deliberate deferral, not an
   * oversight. v92 let it win and produced 157 Immediate -> cliff flips;
   * reading them, most are right (the plan vests deferrals immediately and
   * employer money over years) but the class is not separable by any rule
   * tried here. Two counterexamples from the corpus: United's filing states a
   * plan-wide "100% vested after their third year of service" AND a bullet
   * "Pre-merger Continental and CMI Flight Attendants - Participants are
   * always 100% vested in their Employer Matching Contributions", where the
   * cliff is the general rule and the immediate claim is one cohort; while
   * another plan vests matching immediately and non-matching over three years,
   * where neither single label is complete. Deciding those needs a money-type
   * arbitration pass, sized and evidenced on its own. Until then the blank
   * rows gain a label and the labelled rows keep the one they had. */
  if (!out.vesting && horizonFallback) {
    out.vesting = `${horizonFallback.num}-year schedule (shape not stated)`;
    out.vestingText = horizonFallback.text;
  }
  /* v94: and the HORIZON outranks the held cliff, which is the reverse of the
   * order v93 shipped. A 4-6 year "100% vested after six years" sentence is the
   * plan's own full-vesting horizon; a 1-3 year cliff found elsewhere is
   * usually one money type inside it. Run #183 replaced 19 horizons with a
   * cliff and reading them, three of five sampled were worse: "A participant
   * is 100% vested after six years of credited service" lost to "Participants
   * are vested in THEIR contributions … at two years" (participant money, not
   * employer), and a 20%-a-year six-year schedule lost to an unscoped "2-year
   * cliff" that described only the safe-harbor match. */
  if (shapeCliff && !out.vesting) {
    out.vesting = `${shapeCliff.num}-year cliff`;
    out.vestingText = shapeCliff.text;
  }
  /* v96, LAST of all: whatever schedule the readers above settled on, the
   * filing may have already replaced it. Only a SCHEDULE can be superseded
   * this way — an "Immediate" label is what the replacement says anyway, so
   * there is nothing to correct. The quote becomes the replacement sentence,
   * because that sentence is now the plan's rule and the reader deserves to
   * see the words rather than a table that no longer applies. */
  if (out.vesting && /schedule|cliff|graded/i.test(out.vesting)) {
    const sup = supersededSchedule(text);
    if (sup) {
      out.vesting = "Immediate";
      out.vestingText = cap(sup.text);
    }
  }
  // a DECLARED-RATE discretionary match is not a standing formula: "The
  // Company may make matching contributions, at its discretion, equal to
  // the declared percentage … The Company's discretionary match formula
  // for 2024 was 22.5% of employee deferrals up to a maximum of 6%"
  // (AVI-SPL, owner-submitted). Label it so the year-specific rate can't
  // read as a plan commitment; the verbatim quote carries the details.
  if (out.match && !/^Discretionary/.test(out.match) &&
      /at (?:its|their) discretion,? equal to the declared percentage|discretionary match(?:ing)? formula for (?:the )?(?:first |second )?(?:half of )?\d{4}/i.test(out.matchText || "")) {
    const yr = /formula for [^.]*?(\d{4})/i.exec(out.matchText || "");
    out.match = `Discretionary — ${yr ? yr[1] + " declared: " : "most recent declared rate: "}${out.match}`;
  }
  /* v88: a graded schedule that also states its HORIZON should say so. 104
   * rows in run #172 moved from "N-year schedule (shape not stated)" to a bare
   * "Graded schedule" — more accurate about shape, but it dropped the one fact
   * a participant most wants ("when is it all mine?"). Both are in the filing:
   * "A participant is vested 20% a year beginning in year two and 100% vested
   * after six years of credited service."
   * Held back three times on the belief the frontend constrained the format.
   * It does not: vestingBar() is fed from the CURATED data.js overlay, not the
   * extractor, and the extracted label prints as a free-form string. The one
   * real coupling is app.js's exact-match enrichment of "Graded schedule",
   * updated in the same commit. Done as a single post-pass because nine
   * separate sites set this label. */
  if (out.vesting === "Graded schedule" && out.vestingText) {
    const W = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6 };
    /* Take the year attached to the 100% STEP, not the first "after N years"
     * in the sentence. A ladder names several: "20 percent after two years, 40
     * percent after three years, 60 percent after four years, 80 percent after
     * five years, and 100 percent after SIX years" — a first-match read picked
     * "four" out of the middle of that and labelled a 6-year schedule 4-year.
     * So pair every percentage with its year and use the 100% pair; fall back
     * to the "100% vested … after N years" prose form only when no pair is
     * found. Caught by reading the 71 changed rows, not by the totals. */
    const yrOf = (w) => W[String(w).toLowerCase()] || +w;
    let n = 0;
    for (const m of out.vestingText.matchAll(/(\d{1,3}|one hundred) ?(?:percent|%)[^.]{0,25}?after[^.]{0,20}?\b(\w{3,5}|\d)\s+years?/gi)) {
      const pct = String(m[1]).toLowerCase() === "one hundred" ? 100 : +m[1];
      if (pct === 100) n = Math.max(n, yrOf(m[2]));
    }
    if (!n) {
      const h = out.vestingText.match(/(?:(?:100|one hundred) ?(?:percent|%)|fully)\s+vest\w*[^.]{0,60}?after[^.]{0,30}?\b(\w{3,5}|\d)\s+years?/i);
      if (h) n = yrOf(h[1]);
    }
    if (n >= 2 && n <= 6) out.vesting = `${n}-year graded schedule`;
  }
  hireSplitLabel("vesting");
  hireSplitLabel("match");
  srcImmediate();

  // SCOPE FROM THE QUOTE ITSELF. Some filings name the money their schedule
  // covers inside the very sentence shown as evidence: "Participants fully
  // vest in the employer NON-ELECTIVE CONTRIBUTIONS and the related earnings
  // thereon after being credited with three years of vesting service"
  // (Caterpillar, whose matching contributions are fully vested). Labelling
  // that "3-year cliff" over all employer money overstates what a
  // participant forfeits. This is not the inference refused above — the
  // scope is read from the displayed sentence, so the evidence is on screen.
  if (out.vesting && out.vestingText && !/\(/.test(out.vesting) && !/^Immediate/i.test(out.vesting)) {
    // capture the LITERAL phrase the quote uses, not just its first keyword:
    // "employer matching and employer retirement contributions" covers two
    // sources, and naming only the first understates what the schedule
    // reaches. Compounds ("discretionary matching") survive intact this way.
    const sc = out.vestingText.match(/\bvests?(?:ed|s)? in ((?:the |their )?(?:[A-Za-z][A-Za-z-]* ){0,6}?(?:non-?elective|matching|profit[- ]sharing|safe harbor|discretionary)(?: (?:and|or) (?:[A-Za-z][A-Za-z-]* ){0,3}?(?:non-?elective|matching|profit[- ]sharing|safe harbor|discretionary))?) ?(?:contribution|account)/i);
    if (sc) {
      // keep the filing's own capitalisation — lowercasing turned KeyCorp's
      // "Key matching contributions" into "key matching" and "QACA" into
      // "qaca" — and drop pronouns and the hyphen a line-wrap leaves behind
      // ("his or her employer- matching contribution subaccount")
      const scope = sc[1]
        .replace(/^(?:the|their|its|his or her|his|her|in)\s+/i, "")
        .replace(/\b(?:company's|employer's)\b/gi, "")
        .replace(/(\w)-\s+(\w)/g, "$1 $2")
        .replace(/\s{2,}/g, " ").trim();
      if (scope && scope.length <= 60) out.vesting += ` (${scope} contributions)`;
    }
  }

  // ---- Roth / voluntary after-tax (only positive evidence counts) ----
  // "designate … deferral contributions as after-tax contributions into a
  // Roth account" (Kast) puts Roth LAST — accept contribution words before
  // "into/to/as a Roth" as positive evidence too
  /* v99: Roth offered as an ALTERNATIVE inside a contribution sentence —
   * "participants may contribute up to 75% of annual compensation (pre-tax or
   * Roth)". Nothing follows "Roth" but a closing paren, so the arms that need
   * a contribution word AFTER it all miss, and a $2.5B plan that plainly
   * offers Roth showed nothing. Requires the pre-tax/Roth pairing AND
   * contribution language, so it cannot fire on a passing mention.
   * Owner-reported 2026-09-01 from the filing itself. */
  const roth = t.match(/\broth\b[^.]{0,120}(contribut|deferral|option|401)/i) || t.match(/(designated|make) \broth\b/i) ||
    t.match(/(?:contribut|deferral)\w*[^.]{0,80}?(?:into|to|as) an? \broth\b/i) ||
    /* v124: allow a QUALIFIER between the separator and the word. "pre-tax or
     * after-tax Roth basis" (R.J. Kielty) is the ordinary way to write it and
     * was scoring as no Roth at all, so the page said "not stated" about a
     * filing that states it. Closed set, each glued directly to "roth", so
     * "pre-tax or after-tax" with no Roth still does not match. */
    t.match(/(?:contribut|defer)\w*[^.]{0,140}?(?:pre-?tax|before-?tax)\s*(?:,|\bor\b|\band\b|\/)\s*(?:designated\s+|after-?tax\s+|post-?tax\s+)?\broth\b/i) ||
    t.match(/(?:contribut|defer)\w*[^.]{0,140}?\broth\b\s*(?:,|\bor\b|\band\b|\/)\s*(?:pre-?tax|before-?tax)/i);
  if (roth) { out.roth = true; out.rothText = sentence(roth.index); }
  if (/in.?plan.{0,40}(roth )?(conversion|rollover)|convert.{0,40}(to )?(a )?roth/i.test(t)) out.inPlanRoth = true;
  // "after-tax [deferral] contributions", incl. enumerations like
  // "pre-tax, Roth and after-tax deferral contributions". Veto only the
  // "Roth contributions are made on an after-tax basis" phrasing, where
  // "roth" directly modifies the after-tax words with no list separator.
  // "after-tax contributions to a Roth 401(k) option" is ROTH, not
  // voluntary after-tax — Roth money IS after-tax and auditors say so.
  // 4,149 of 8,173 flags (51%) were this phrasing before the post-window
  // veto: a Roth within reach after the phrase, with no list separator
  // ("and"/"or"/comma) in between, means after-tax feeds Roth rather than
  // standing beside it ("Roth and after-tax contributions" still counts).
  // An elective DEFERRAL made "after-tax" is a Roth deferral by definition —
  // voluntary after-tax contributions are not deferrals. The discriminator is
  // whether the SAME sentence names Roth separately: "pretax salary deferrals,
  // Roth elective deferrals and/or after-tax contributions" lists three things,
  // so its after-tax money is real, while Caterpillar's "elect to defer …
  // through pre-tax and after-tax contributions" names no Roth at all and is
  // its Roth arrangement, spelled out two sentences later as "an after-tax
  // Roth 401(k) arrangement" — too far for the neighbouring windows to see.
  const DEFERRAL_ROTH = (s) => /\bdefer\w*\b[^.]{0,90}?after[- ]tax/i.test(s) &&
    !/\broth\b/i.test(s) &&
    !/(voluntary|traditional|regular|non-?deductible|thrift|additional)/i.test(s);

  for (const at of t.matchAll(/(?:voluntary |additional |employee )?after[- ]tax (?:deferral |employee |savings )?contributions?/gi)) {
    const pre = t.slice(Math.max(0, at.index - 40), at.index);
    const rothModifies = /roth\b[^.]{0,30}$/i.test(pre) && !/(?:,|\band\b|\bor\b)\s*$/i.test(pre);
    const post = t.slice(at.index + at[0].length, at.index + at[0].length + 45);
    const ri = post.search(/\broth\b/i);
    const rothTarget = ri >= 0 && !/[.,;]|\b(?:and|or)\b/i.test(post.slice(0, ri));
    if (rothModifies || rothTarget) continue;
    // An elective DEFERRAL made "after-tax" is a Roth deferral by
    // definition — voluntary after-tax contributions are not deferrals.
    // Caterpillar's "elect to defer a portion of their eligible
    // compensation through pre-tax and after-tax contributions" is its Roth
    // arrangement, spelled out two sentences later as "an after-tax Roth
    // 401(k) arrangement", too far for the windows above to see. A sentence
    // that also says voluntary/traditional/regular/non-deductible/thrift is
    // describing the separate after-tax money and keeps the flag.
    if (DEFERRAL_ROTH(sentence(at.index))) continue;
    out.afterTax = true; out.afterTaxText = sentence(at.index); break;
  }
  // BASIS enumerations never say "after-tax contributions": "Contributions
  // can be made on a tax-deferred (pre-tax) basis, after-tax basis or to a
  // Roth 401(k) on an after-tax basis" (Northrop Grumman). Accept when a
  // contribution verb governs the phrase and Roth doesn't directly modify it.
  if (!out.afterTax) {
    for (const m2 of t.matchAll(/after[- ]tax basis/gi)) {
      const pre = t.slice(Math.max(0, m2.index - 90), m2.index);
      const rothMod = /roth\b[^.]{0,40}$/i.test(pre) && !/(?:,|\band\b|\bor\b)\s*$/i.test(pre);
      // "on an after-tax basis as a Roth contribution" is Roth — same
      // post-window veto as the contributions branch (list separators keep
      // NG's "after-tax basis or to a Roth 401(k)" enumeration genuine)
      const post2 = t.slice(m2.index + m2[0].length, m2.index + m2[0].length + 45);
      const ri2 = post2.search(/\broth\b/i);
      const rothTarget2 = ri2 >= 0 && !/[.,;]|\b(?:and|or)\b/i.test(post2.slice(0, ri2));
      if (rothMod || rothTarget2 || !/contribut\w+[^.]{0,80}$/i.test(pre)) continue;
      out.afterTax = true; out.afterTaxText = sentence(m2.index); break;
    }
  }
  // list enumerations share ONE noun: "a combination of before-tax,
  // after-tax, and Roth contributions" (Eaton). "contributions" sits after
  // the other list items, so the branches above — which need the noun to
  // follow "after-tax" directly — never fire, and a real voluntary after-tax
  // option reads as "not stated". A separator right after "after-tax" also
  // proves Roth is a sibling item, not a modifier.
  if (!out.afterTax) {
    for (const m3 of t.matchAll(/\bafter[- ]tax\b(?=\s*(?:,|\bor\b|\band\b))[^.]{0,60}?contributions?/gi)) {
      const pre = t.slice(Math.max(0, m3.index - 80), m3.index);
      if (!/(?:before[- ]tax|pre[- ]tax|roth|combination of|may (?:make|contribute|elect)|contribute)\b/i.test(pre)) continue;
      if (DEFERRAL_ROTH(sentence(m3.index))) continue;
      out.afterTax = true; out.afterTaxText = sentence(m3.index); break;
    }
  }
  // an amendment REMOVING after-tax is an affirmative no, not a feature:
  // "amended the plan document effective June 1, 2023, to remove the
  // option for after-tax employee contributions" (AVI-SPL) shipped as
  // afterTax:true and joined the mega-backdoor chip
  if (out.afterTax &&
      /(?:remov\w+|eliminat\w+|discontinu\w+|no longer (?:permits?|allows?|offers?))[^.]{0,80}after[- ]tax|after[- ]tax[^.]{0,60}(?:was|were|has been|have been|is no longer) (?:remov|eliminat|discontinu|permitt|allow|offer)/i.test(out.afterTaxText || "")) {
    out.afterTax = false; // quote stays — it documents the removal
  }

  // ---- affirmative no-employer-contribution statements ----
  // "The Plan does not provide for employer contributions." (Amphenol) is
  // stronger evidence than a $0 Schedule H line — it's by design, not a
  // skipped year
  const noer = t.match(/plan does not (?:currently )?provide for (?:any )?(?:employer|company|matching)(?: matching)? contributions|no employer (?:matching )?contributions are (?:provided|permitted|made under the plan)/i);
  if (noer) { out.noEmployer = true; out.noEmployerText = sentence(noer.index); }

  // ---- frozen plans: contributions permanently discontinued ----
  const froz = t.match(/(?:plan (?:was|has been|is) (?:amended to )?(?:frozen|freeze)|amended to freeze the plan|permanently discontinu\w+[^.]{0,60}?contributions|(?:board|company|sponsor)[^.]{0,60}?(?:resolved|elected|adopted a resolution|approved a resolution)[^.]{0,40}? to terminate the plan|plan was terminated effective|prior to the plan[’']?s termination)/i);
  /* v123: the words appearing is not the claim being made.
   *
   * `frozen` renders as "the filing states contributions have been
   * discontinued". Measured over the whole full-form universe on 2026-09-10:
   * of 1,378 plans carrying it, 60 are demonstrably false in one of two
   * shapes, and both are visible in the sentence:
   *
   *   CONDITIONAL - Honeywell's "a participant will become 100 percent vested
   *   in the event the Company terminates or permanently discontinues
   *   contributions" is the boilerplate ERISA vesting clause present in
   *   nearly every plan document. It describes nothing that happened.
   *
   *   A DIFFERENT PLAN IS THE SUBJECT - Comcast's notes say "The Solar Energy
   *   World 401k plan was frozen" (a company it acquired); Leggett & Platt's
   *   say "the Hanes Retirement Plan was frozen", while HANES' OWN filing says
   *   "the Plan was frozen" and must be kept. That pair is the whole test.
   *
   * Tie the name to the VERB, not to the sentence. "the Plan was frozen, and
   * the Organization's employees became eligible to participate in the Cayuga
   * Health 401(k)" names another plan as the DESTINATION while this plan is
   * what froze; judging the sentence got 3 of 6 sampled wrong there, judging
   * the subject got 22 of 22 right.
   *
   * The predicate is shared with the display guard in scripts/lib-disclose.mjs
   * (frozenClaimOk), which shipped first because it needed no re-parse. Keep
   * them identical - do not evolve a second copy here. */
  if (froz && frozenClaimIsAboutThisPlan(sentence(froz.index), sponsorName)) {
    out.frozen = true;
    out.frozenText = sentence(froz.index);
  }

  // ---- safe harbor & true-up ----
  if (/safe harbor match/i.test(t)) out.safeHarbor = "match";
  else if (/safe harbor non.?elective|non.?elective safe harbor/i.test(t)) out.safeHarbor = "nonelective";
  if (/true[- ]?up/i.test(t)) out.trueUp = true;

  // ---- employer nonelective / core contribution ----
  const nec = t.match(/non.?(?:contributory|elective)[^.]{0,80}?contribution[^.]{0,60}?(\d{1,2}(?:\.\d+)?) ?(?:percent|%)/i) ||
    t.match(/(?:employer|company|university|college|institution|organization|hospital|health system) (?:core|automatic|basic|retirement) contribution[^.]{0,60}?(\d{1,2}(?:\.\d+)?) ?(?:percent|%)/i) ||
    t.match(/(?:university|college|institution|organization|hospital|health system|employer|company) (?:also )?contribut(?:es|ed) (?:an amount )?(?:equal to )?(\d{1,2}(?:\.\d+)?) ?(?:percent|%) of/i) ||
    t.match(/contribut\w+ (\d{1,2}(?:\.\d+)?) ?(?:percent|%) of (?:each |eligible |annual )?(?:participant|employee)s?'? (?:eligible )?(?:compensation|pay)[^.]{0,60}?regardless of/i) ||
    // "Company contributions under the safe harbor provision are equal to
    // 3% of compensation" (Eiwa) — a safe-harbor nonelective with neither
    // "nonelective" nor "safe harbor nonelective" in the sentence
    t.match(/(?:company|employer) contributions? under the safe harbor provision (?:is|are) equal to (\d{1,2}(?:\.\d+)?) ?(?:percent|%) of/i);
  // an ENUMERATED rate ("a non-elective contribution of 3, 4 or 5 percent of
  // eligible compensation", Caterpillar — the rate depends on an age +
  // service point total) must not be reported as its largest member: the
  // single-value patterns above skip to the number that sits directly before
  // "percent", which is always the last one, overstating the contribution for
  // everyone below the top band.
  const necRange = t.match(/non.?(?:contributory|elective)[^.]{0,80}?contribution[^.]{0,80}?\b(\d{1,2})(?:\s*,\s*\d{1,2})*\s*,?\s*or\s+(\d{1,2}) ?(?:percent|%)/i);
  if (necRange && +necRange[1] >= 1 && +necRange[2] <= 15 && +necRange[1] < +necRange[2]) {
    out.nec = `${+necRange[1]}%–${+necRange[2]}% of pay (rate varies per the filing)`;
    out.necText = sentence(necRange.index);
  } else if (nec && +nec[1] >= 1 && +nec[1] <= 15) { out.nec = `${+nec[1]}% of pay`; out.necText = sentence(nec.index); }
  // tenure-graded nonelective tables — "Employer contributes a percentage
  // of base compensation based on the following schedule: ≤7 yrs 6% … >10
  // yrs 10%" (Colorado Academy): state the range, quote the table
  if (!out.nec) {
    const svc = t.match(/(?:employer|company|school|academy|organization|university) contribut\w+ a percentage of [^.]{0,80}?compensation based on the following schedule/i);
    if (svc) {
      const pcts = [...t.slice(svc.index, svc.index + 420).matchAll(/(\d{1,2}(?:\.\d+)?) ?%/g)].map((m) => +m[1]).filter((p) => p > 0 && p <= 25);
      if (pcts.length >= 3) {
        out.nec = `${Math.min(...pcts)}%–${Math.max(...pcts)}% of pay, rising with years of service`;
        out.necText = sentence(svc.index, 380);
      }
    }
  }
  // multiemployer/union plans: the employer contribution is an hourly rate
  // set by the CBA, not a formula — say so instead of showing nothing
  if (!out.nec && !out.match && !out.matchText) {
    const cba = t.match(/(?:contribut\w+|amounts?) [^.]{0,120}?(?:collective bargaining agreements?|rates? specified in the (?:applicable )?(?:labor|bargaining) agreements?|per hour worked)/i) ||
      t.match(/signatory employers? [^.]{0,80}?(?:make|remit) contributions?/i);
    if (cba) {
      const s = sentence(cba.index);
      // Schedule R's multiemployer TABLE mentions the CBA too — only prose counts
      if (!BOILER.test(s) && !/name of contributing employer|dollar amount contributed|date collective bargaining agreement/i.test(s)) {
        out.nec = "Set by collective bargaining agreement"; out.necText = s;
      }
    }
  }

  // ---- auto-escalation ----
  const esc = t.match(/(?:automatic(?:ally)? increas\w+|escalat\w+)[^.]{0,120}?(\d{1,2}(?:\.\d+)?) ?(?:percent|%)[^.]{0,80}?(?:maximum|up to|cap|not to exceed)[^.]{0,40}?(\d{1,2}(?:\.\d+)?) ?(?:percent|%)/i);
  const esc2 = esc || t.match(/annual(?:ly)? [^.]{0,40}?automatic(?:ally)? increas\w+|automatic escalation/i);
  if (esc2) {
    out.autoEscalate = esc ? `+${+esc[1]}%/year up to ${+esc[2]}%` : true;
    out.autoEscalateText = sentence(esc2.index);
  }

  // ---- eligibility ----
  // window excludes % — a match/vesting TABLE ("First 4% of eligible
  // compensation 100 % ... less than 5 years of service") once bridged
  // "eligible" to an unrelated service count (Northrop Grumman); cohort
  // qualifiers like "less than N years" are never eligibility rules
  // A sentence scoped to ONE money source states that source's rule, not the
  // plan's. R.H. White shipped "Upon hire / immediate" from "For purposes of
  // prevailing wage contributions, employees are eligible upon hire" while
  // the plan's actual rule — "who have completed one month of service" — sat
  // in the sentence before it, and BEHIND the word "eligible" where a
  // forward-only scan could never see it.
  // The veto must name a NON-DEFERRAL source. A bare "for purposes of" also
  // trails legitimate rules — KeyCorp is "eligible to participate … as of
  // their first day of employment … for purposes of making pre-tax
  // contributions, Roth contributions" — and vetoing on the phrase alone
  // threw that plan's real eligibility away.
  const SCOPED_ELIG = /prevailing wage|davis[- ]bacon|qualified non-?elective|\bQNEC\b|(?:for purposes of|with respect to) (?:the )?(?:matching|profit[- ]sharing|discretionary|non-?elective|employer) contributions?/i;
  // a rule the filing has already REPLACED is not this plan's rule:
  // "Prior to January 1, 2024, employees … were eligible after completing
  // three calendar months … If this requirement was not met, the employee
  // WOULD HAVE BECOME eligible after completing 12 months and 1,000 hours"
  // (Swinerton) sits one sentence before the rule now in force
  const SUPERSEDED_ELIG = /\bprior to (?:january|february|march|april|may|june|july|august|september|october|november|december|\d)|would have become|were eligible to participate/i;
  // "1,000 hours" lost its leading digits to a bare \d{1,4} and shipped as
  // "000 hours of service"; "three consecutive calendar months" puts
  // adjectives between the number and its unit
  const ENUM = String.raw`\d{1,3}(?:,\d{3})+|\d{1,4}|one|two|three|four|five|six|nine|twelve`;
  const EUNIT = String.raw`(?:consecutive |calendar |full |complete |continuous )*(days?|months?|years?|hours?)`;
  const eligRe = new RegExp(String.raw`eligib\w+[^.%]{0,140}?(?:(?<!(?:less|more|fewer) than )(${ENUM}) ?${EUNIT} of (?:service|employment|continuous)|(?:upon|on) (?:their )?(?:date of )?(?:hire|employment)|first day of (?:employment|the month)|immediately)`, "gi");
  // "…who have completed one month of service" is a plan-wide eligibility
  // idiom on its own; the sponsor list before it is full of "Inc." periods,
  // so no sentence-bounded window can reach back to "The Plan covers".
  // …but "Eligible participants who have completed two years of service … may
  // request an additional withdrawal" is a DISTRIBUTION rule wearing the same
  // words. The idiom only states plan entry inside a coverage clause, and the
  // clause head can sit a few hundred characters back behind a sponsor list
  // ("…LaFleur Electrical Co. (referred to collectively as the Company) who
  // have completed one month of service"), so the context window is wider
  // than a sentence.
  const COVERS = /\b(?:plan covers|covers all|covering|eligible to participate|participate in the plan|becomes? (?:a )?participants?|entry into the plan|eligible employees)\b/i;
  const NOT_ENTRY = /withdraw|hardship|\bloans?\b|distribution|in-?service|rollover|request/i;
  let elig = null;
  // Eligibility to RECEIVE a contribution is not eligibility to JOIN: "who
  // have completed one year of service … are eligible for Employer
  // nonelective contributions" and "…eligible to receive allocations of
  // employer matching contributions" are money-source rules, and one of them
  // displaced a correct "immediately upon the start of employment". Same
  // defect class as the prevailing-wage sentence this release started with.
  const FOR_MONEY = /eligible (?:for|to receive)[^.]{0,80}?(?:matching|non-?elective|profit[- ]sharing|discretionary|employer)\b[^.]{0,20}?contribution|eligible for the employer\b/i;
  // rules written for one workforce slice are carve-outs, not the plan rule
  const SUBGROUP = /\b(?:temporary|part[- ]time|seasonal|per[- ]diem|intern|union|collectively bargained)\b[^.]{0,40}?employees?/i;
  for (const m of t.matchAll(new RegExp(String.raw`who (?:have |has )?complet\w+ (${ENUM}) ?${EUNIT} of (?:service|employment)`, "gi"))) {
    const ctx = t.slice(Math.max(0, m.index - 400), m.index);
    if (!COVERS.test(ctx) || NOT_ENTRY.test(t.slice(Math.max(0, m.index - 250), m.index))) continue;
    if (SCOPED_ELIG.test(sentence(m.index))) continue;
    if (FOR_MONEY.test(t.slice(m.index, m.index + 220))) continue;
    // the money type can also lead: "The Company will provide a matching
    // contribution for participants who have completed one year of service"
    if (/(?:matching|non-?elective|profit[- ]sharing|discretionary) contributions?\b/i.test(t.slice(Math.max(0, m.index - 130), m.index))) continue;
    if (SUBGROUP.test(t.slice(Math.max(0, m.index - 160), m.index))) continue;
    elig = m; break;
  }
  // an EXCLUSION list states who the plan keeps out, and the carve-outs it
  // writes for them are not the plan's entry rule. Meta's notes enumerate ten
  // excluded classes, one of which carries the SECURE long-term part-time
  // rule ("interns or co-op employees, unless they have reached … age 21 and
  // have completed at least 500 hours of service during each of three
  // consecutive 12-month periods"). Read as plan entry that becomes
  // "500 hours of service" for a plan whose actual rule is entry on hire.
  const EXCLUDED = /\b(?:are|is) not eligible to participate|following (?:employees|classes|individuals)[^.]{0,60}?(?:are|is) (?:not|excluded)|excluded from participation/i;
  if (!elig) {
    for (const m of t.matchAll(eligRe)) {
      if (SCOPED_ELIG.test(sentence(m.index)) || SUPERSEDED_ELIG.test(sentence(m.index))) continue;
      // Scoped to the matched SENTENCE, deliberately. I first imported the
      // primary path's NOT_ENTRY/FOR_MONEY/SUBGROUP vetoes here and tested
      // EXCLUDED over a 700-char lookback: that dropped 87 values in the
      // 822-filing corpus, most of them correct — "Full-time and part-time
      // employees … are eligible to participate upon hire" is a plan-wide
      // rule that SUBGROUP reads as a carve-out, and a lookback window
      // catches any filing that merely lists exclusions somewhere nearby.
      // Those vetoes were tuned for the "who completed N units" shape and
      // misfire on this one.
      if (EXCLUDED.test(sentence(m.index))) continue;
      // NOT_ENTRY is the one import that survives review: a rollover, loan or
      // withdrawal rule is never a plan-entry rule, whatever shape it takes
      // ("Employee Rollovers — Employees are eligible to invest amounts from
      // prior eligible employer plans … upon employment" read as entry)
      if (NOT_ENTRY.test(sentence(m.index))) continue;
      elig = m; break;
    }
  }
  if (elig) {
    // "completing six months of service" (Simmons Foods) — spelled-out counts
    const W = { one: 1, two: 2, three: 3, six: 6, nine: 9, twelve: 12 };
    const n = elig[1]
      ? (W[elig[1].toLowerCase()] || (+elig[1].replace(/,/g, "")).toLocaleString("en-US"))
      : null;
    out.eligibility = n ? `${n} ${elig[2]} of service` : "Upon hire / immediate";
    out.eligibilityText = sentence(elig.index);
  }

  // ---- participant loans ----
  const loan = t.match(/participants? may (?:borrow|obtain (?:a )?loans?)|loans? (?:are|is) (?:permitted|available|allowed)|loan provision/i);
  if (loan) { out.loans = true; out.loansText = sentence(loan.index); }

  // ---- brokerage window brand ----
  const brand = t.match(/brokerage ?link/i) ? "Fidelity BrokerageLink"
    : t.match(/personal choice retirement|pcra/i) ? "Schwab PCRA"
    : t.match(/td ameritrade self.?directed/i) ? "TD Ameritrade SDBA" : null;
  if (brand) out.sdbaBrand = brand;

  // ---- named investment menu ----
  // Master-trust plans whose per-fund schedule isn't public still NAME their
  // options in the notes as "Fund Name — description" paragraphs under an
  // "Investment Options/Funds" heading (Northrop: "U.S. Equity Fund — The
  // U.S. Equity Fund primarily consists of..."). Names only, no values.
  const menuHead = t.match(/investment (?:options|funds|programs|line ?up)\b/i);
  if (menuHead) {
    const win = t.slice(menuHead.index, menuHead.index + 9000);
    const menu = [];
    const nameRe = /([A-Z][\w .,&/()'’-]{1,60}?(?:Funds?|Portfolios?|Accounts?|Pools?)) ?[—–] ?(?=["“A-Z(])/g;
    let nm;
    while ((nm = nameRe.exec(win)) && menu.length < 40) {
      // drop any earlier sentence the lazy match dragged in ("...common
      // stock. Balanced Fund" → "Balanced Fund"); lowercase-before-period
      // marks a sentence end, unlike abbreviations ("U.S. Equity Fund")
      const n = nm[1].split(/(?<=[a-z]{2})[.;:] /).pop()
        .replace(/^(?:The|A|An|Each|These|Certain) /, "").trim();
      // generic asset-class rows aren't menu entries
      if (/^(?:mutual|collective|common|pooled|master|trust|investment|the|other|various)\b/i.test(n)) continue;
      if (n.length >= 6 && !menu.includes(n)) menu.push(n);
    }
    if (menu.length >= 3) out.menu = menu;
  }

  // ---- employer-directed (nonparticipant-directed) holdings ----
  // The 4i schedule lists everything the trust owns, including money the
  // EMPLOYER directs. Company stock contributed to an ESOP component is not a
  // menu choice a participant can make, yet it renders in the holdings table
  // with a "% of holdings" share exactly like a fund — Swinerton's company
  // stock is $410,158,397, 49.8% of the filed table, and the filing's own
  // statements separate it from the $413,980,459 participants direct.
  // Report it ONLY where the filing says so, quoted. The phrase also appears
  // in contexts that say nothing about employer-directed holdings —
  // forfeiture suspense accounts, money markets that exist to pay plan
  // expenses, wrap-contract "non-participant directed withdrawal" clauses,
  // "Historical cost is disclosed only for nonparticipant-directed
  // investments" footnotes, section headings glued to unrelated QDIA text
  // (GSK), and flat negations ("There are no non-participant directed
  // investments") — so the sentence must tie the phrase to employer stock or
  // an ESOP, and a 4i/financial-statement TABLE row never qualifies as prose.
  const NPD = /non-? ?participant[- ]directed/i;
  const npdAll = [...t.matchAll(/non-? ?participant[- ]directed/gi)];
  for (const m of npdAll) {
    const s = sentence(m.index);
    if (!/\bstock\b|\bESOP\b/i.test(s)) continue;
    // negations
    if (/\b(?:there (?:are|were|is|was)|had) no\b[^.]{0,40}?non-? ?participant/i.test(s)) continue;
    // wrap/GIC contract boilerplate: the phrase qualifies a WITHDRAWAL, not a holding
    if (/non-? ?participant[- ]directed (?:withdrawal|transfer|loan|event)/i.test(s)) continue;
    // Table rows must be judged on the RAW text around the phrase, not on the
    // quote: sentence() caps at ~300 chars, so a 4i row's dollar columns fall
    // off the end of the string and the row passes as prose (Vertex's
    // statement line and Lennar's 4i row both did). The forward window stays
    // short so a real intro sentence that merely PRECEDES a table survives.
    const raw = t.slice(Math.max(0, m.index - 250), m.index + 150);
    if ((raw.match(/\$/g) || []).length >= 2 || (raw.match(/\b\d{1,3}(?:,\d{3}){2,}\b/g) || []).length >= 2) continue;
    if (/Description of Investment|Identity of Issue|Party Par or Maturity|\(a\)\s*\(b\)|\(c\)\s*\(d\)/i.test(raw)) continue;
    // cost footnotes carry no plan fact
    if (/^\W*(?:\*+\s*)?(?:historical )?cost(?:s)? (?:is|are|of)\b/i.test(s)) continue;
    // v64, from reviewing all 133 quotes the first version shipped: a quote
    // has to READ as a sentence. ESOP filings print a two-column statement
    // whose header stacks the column labels ("Participant Nonparticipant
    // Directed Directed Allocated Unallocated Total"), and a match inside a
    // table leaves sentence() opening mid-word with its "…" truncation
    // marker, dragging in fund rows and share counts. 16 of 133 shipped
    // quotes were one of those two shapes. Skipping the candidate (rather
    // than the filing) lets a later occurrence — usually the real Note —
    // supply the quote instead.
    if (/^…/.test(s)) continue;
    // A lead sentence often runs straight into the statement it introduces.
    // Cut the table off and judge what's left — trimming AFTER the shape
    // guards threw away two correct lead sentences whose only sin was the
    // column header glued to their tail.
    const q = s
      .replace(/(:)\s+(?=(?:As of |For the |20\d\d\b|\$|Net [Aa]ssets\b)).*$/, "$1")
      .replace(/\s+(?=\bDirected\s+Directed\b|\b(?:Non-?)?Participant\s+(?:Non-?)?Participant\b|\bAllocated\s+Unallocated\b|\bStatements? of (?:Changes in )?Net Assets\b).*$/i, "")
      .replace(/\s*[-–—_]{6,}.*$/, "") // the rule line a table draws under its heading
      .trim();
    // The header signature is a REPEATED column label — "Participant
    // Nonparticipant / Directed Directed", "Allocated Unallocated". Matching
    // "participant directed" instead would reject the phrase this whole
    // reader exists to find: the first cut of this guard threw out 65 of 133
    // quotes, including Skyworks' correct one.
    if (/\bDirected\s+Directed\b|\b(?:Non-?)?Participant\s+(?:Non-?)?Participant\b|\bAllocated\s+Unallocated\b/i.test(q)) continue;
    if (/Statements? of (?:Changes in )?Net Assets/i.test(q)) continue;
    // an ALL-CAPS statement heading carries almost no lowercase words
    if ((q.match(/\b[a-z]{3,}\b/g) || []).length < 4) continue;
    // the trim must not have eaten the phrase the quote exists to show
    if (!NPD.test(q)) continue;
    out.nonPartDirected = true;
    out.nonPartDirectedText = q;
    break;
  }
  // A plan can lock the employer's stock contribution and still let
  // participants move it ("participants may diversify the company common
  // stock allocated to their account", Skyworks; NextEra says so in a
  // separate sentence). Quoting only the lock would overstate it, so carry
  // the counter-statement when the filing makes one.
  if (out.nonPartDirected) {
    const dv = t.match(/(?:participants?|employees?)[^.]{0,80}?(?:may|can|are (?:permitted|able|allowed) to|have the option to) (?:elect to )?(?:diversify|reinvest|transfer|redirect|move|reallocate)[^.]{0,160}?\./i);
    if (dv && (NPD.test(dv[0]) || /\bstock\b/i.test(dv[0]))) {
      // anchor the quote at the sentence START — the diversify verb can sit
      // late in a long sentence, and sentence() trims leading context around
      // a far-in match, which opened Regeneron's quote mid-clause
      const head = t.lastIndexOf(". ", dv.index);
      const q = sentence(head === -1 ? dv.index : head + 2);
      // Skyworks states the lock and the escape in ONE sentence — don't
      // print the same quote twice
      if (q && q !== out.nonPartDirectedText && !out.nonPartDirectedText.includes(q.slice(0, 60))) out.nonPartDirectedDiversify = q;
    }
  }

  // ---- automatic enrollment ----
  const ae = t.match(/automatic(?:ally)? enroll(?:ed|ment|s)?[^.]{0,100}?(\d{1,2}(?:\.\d+)?) ?(?:percent|%)/i);
  const ae2 = ae || t.match(/automatic(?:ally)? enroll(?:ed|ment|s)?/i);
  if (ae2) {
    out.autoEnroll = ae ? `${+ae[1]}% default deferral` : true;
    out.autoEnrollText = sentence(ae2.index);
  }

  return Object.keys(out).length ? out : null;
}

/* Boot-time index bitmask for a shard entry — the app filters the whole
 * universe on these without fetching shards: 1 lineup, 2 brokerage window,
 * 4 has features, 8 mega backdoor, 16 immediate vesting, 32 after-tax, 64 Roth. */
export function indexFlags(e) {
  const hasLineup = e.confident && e.funds && e.funds.length ? 1 : 0;
  let f = hasLineup | (hasLineup && e.sdba ? 2 : 0);
  const ff = e.features;
  if (ff) {
    f |= 4;
    if (ff.afterTax) f |= 32;
    if (ff.roth) f |= 64;
    if (ff.afterTax && (ff.inPlanRoth || /in.?plan.{0,30}(roth )?(conversion|rollover)/i.test((ff.rothText || "") + " " + (ff.afterTaxText || "")))) f |= 8;
    if (ff.vesting === "Immediate") f |= 16;
    if (ff.sdbaBrand) f |= 2;
    // match-type facet bits: 128 stated formula, 256 discretionary,
    // 512 affirmatively none/frozen, 1024 safe harbor per audited notes
    if (ff.match) f |= /^Discretionary/.test(ff.match) ? 256 : 128;
    if (ff.noEmployer || ff.frozen) f |= 512;
    if (ff.safeHarbor) f |= 1024;
  }
  if (e.sdba) f |= 2;
  return f;
}
