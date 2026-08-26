/* wampo — parser for "Schedule H, line 4i — Schedule of Assets" sections
 * extracted from Form 5500 filing PDFs (pdftotext -layout output).
 * Shared by fetch-4i.mjs (production) and local test harnesses. */

// Bump to invalidate previously parsed lineups.json entries and force a reparse.
export const PARSER_VERSION = 88;

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
const SKIP_ROW = new RegExp("^(total|subtotal|grand total|schedule|page \\d|form 5500|ein[: ]|employer id|sponsor name|plan name\\b|plan sponsor'?s name\\b|plan number|as of|see accompanying|\\(thousands|identity of issue|description of investment|rate of|maturity|cost\\b|current value|sales\\b|purchases\\b|dividends\\b|assets in.transit|investments? at fair value|dividend income|other income|administrative fees|" +
  // the 4i column heading wraps across up to four lines; only its first line
  // ("(c) Description of investment") was covered, so the continuation
  // "including maturity date, rate of" had no value, survived as a name
  // fragment, and glued onto the FIRST holding row (R.H. White shipped
  // "including maturity date, rate of American Funds Europacific GR R6")
  "including maturity date|interest, collateral|collateral, par)|" +
  // financial-statement lines that are not 4i holdings
  // "investments?,? at (fair|contract) value" must tolerate the comma/dash
  // spellings — 631 confident lineups carried "Investments, at fair value"
  // statement rows (up to 97% of the shown sum) because only the bare
  // space-separated form was covered
  "(net assets|benefits paid|investment (income|gain|loss)|(participation|interest) in (the )?net (income|loss)|net income \\(?loss\\)?|net income (of|from)\\b|interest and dividends|realized|unrealized|appreciat|depreciat|transfers?\\b|contributions?\\b|deemed distribut|administrative expense|beginning of year|end of year|financial statements|indirect compensation|reconcil|adjustment|level [123]\\b|liabilit|receivable|payable|expenses\\b|distribution|net (increase|decrease|change)|due (to|from)|notes? (to|receivable)|similar party|description of investment|current value|investments?,?\\s*[—–-]?\\s*at (fair|contract) value)|" +
  // form-page boilerplate: a filing with NO 4i attachment can still seed a
  // region from the Schedule H checkbox line, and the parser then reads phone
  // numbers and zip codes off address/signature pages as \"values\" (Aramark)
  "(mailing address|include room|city or town|telephone|preparer|acknowledg|benefit payments?\\b|,\\s*[A-Za-z]{2}\\s+\\d{5}(-\\d{4})?\\s*$)", "i");

// "December 31, 2024" style heading lines — the year parses as a value otherwise
const DATE_LINE = /(january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{1,2},?(\s+(19|20)\d\d)?(\s+and)?\s*$/i;

/* Strip trailing column values (cost, shares, rates) from a row body without
 * eating year-like name tails such as "RETIREMENT 2045". */
function stripTrailingColumns(body) {
  // trim token-by-token from the end WITHOUT re-joining — internal column
  // gaps (3+ spaces) must survive for splitNameDesc
  let b = body;
  const tail = /\s+(?:[*$\u2013\u2014-]+|\$?\d{1,3}(?:,\d{3})+(?:\.\d+)?%?|\d+\.\d+%?|\d+%)\s*$/;  // \u2013/\u2014: the empty cost column renders as an en/em dash and glued onto names (BWXT, report #18)
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
  let d = desc.replace(/\*+/g, " ");
  d = d.replace(/\b[\d,]+(\.\d+)?\s*(shares?|units?|interests?)\b/gi, " ");
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

function typeOnly(desc) {
  /* v72: a trailing VALUE or footnote marker defeats the type test. Filings
   * print "Mutual funds   291,224 (1)" in the description column, and those
   * digits kept the phrase from reading as type-only — so the type won the
   * name and the real fund ("BlackRock Lifepath Index 2035 Fd") was demoted
   * to the issuer field. Measured: 2,174 rows have the product in `iss` and a
   * type in the name. */
  let r = String(desc).replace(/\s+[\d,]{3,}(?:\.\d+)?\s*(?:\(\d+\))?\s*$/, "").trim();
  if (CATEGORY_PHRASE.test(r)) return true;
  for (const [re] of TYPE_PATTERNS) r = r.replace(re, " ");
  /* "guaranteed", "registered", "pooled", "separate", "collective",
   * "commingled", "insurance", "mutual", "stable" are TYPE words, never a
   * whole fund name on their own. Deliberately NOT added: "retirement",
   * "value", "income" — each is load-bearing in real names ("Retirement 2040
   * Fund I", "MFS Value Fund"), and stripping them would make a genuine fund
   * read as type-only and hand the row back to the issuer column. */
  r = r.replace(/\b(value of|interest in|the|a|an|of|in|at|held|funds?|accounts?|companies|company|end of year|publicly[- ]traded|common|trusts?|securit(y|ies)|contracts?|investments?|guaranteed|registered|pooled|separate|collective|commingled|insurance|mutual|stable|interest)\b/gi, " ");
  return r.replace(/[^a-z0-9]/gi, "").length < 6;
}

export function parseRows(section, opts = {}) {
  const rows = [];
  let sdba = false;
  let nameBuf = [];
  let curSection = "";
  // a valueless "Total ..." line means the subtotal WRAPPED: its value arrives
  // on the next short line ("Total Registered Investment" ↵ "Companies  613,913,288")
  let totalWrap = false;
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
    let t = raw.trim().replace(/^\*+\s*/, "").replace(/\s*\*{1,3}\s*$/, "")
      .replace(/([0-9]{1,3}(?:,[0-9]{3})+)(?:\s*[,.]?\s*\(\s*[a-z]\s*\)){1,4}\s*$/i, "$1");
    if (!t) { nameBuf = []; continue; }
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
    if ((SKIP_ROW.test(t) && !trustRow) || DATE_LINE.test(t)) {
      nameBuf = [];
      totalWrap = /^(sub|grand )?total\b/i.test(t) && !valueRe.test(t);
      continue;
    }
    if (/:\s*$/.test(t)) { curSection = t.replace(/:\s*$/, ""); nameBuf = []; totalWrap = false; continue; } // section subheading

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
      if (/^[A-Z][A-Z\s/&,-]*$/.test(t) && t.split(/\s+/).length <= 4) { curSection = t; nameBuf = []; continue; }
      if (t.split(/\s+/).length <= 5 && classify(t) && typeOnly(t)) { curSection = t; nameBuf = []; continue; }
      // mixed-case class headers that AREN'T in the type vocabulary — adding
      // them to TYPE_PATTERNS re-typed Verizon's trustee class SUMMARY rows
      // ("CORPORATE STOCK - COMMON" $9.7B) into the managed-account bucket,
      // so the vocabulary lives only here, on valueless lines
      if (/^(corporate stocks?|collective funds?|common stocks?|preferred stocks?|registered investment companies)(\s*[-–]\s*(common|preferred))?$/i.test(t)) { curSection = t; nameBuf = []; continue; }
      if (t.length < 90 && !/^\d+$/.test(t)) nameBuf.push(t);
      if (nameBuf.length > 3) nameBuf = nameBuf.slice(-3);
      continue;
    }

    const value = +vm[1].replace(/,/g, "");
    // in millions mode a bare 4-digit trailing number in 1900-2100 is a
    // target-date year at the end of a fund name, not a value — real $2B
    // rows print with a thousands separator ("2,045")
    if (opts.smallValues && value >= 1900 && value <= 2100 &&
        !vm[0].includes(",") && !/\$/.test(vm[0])) { nameBuf = []; continue; }
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
    let body = t.slice(0, t.length - vm[0].length).trim().replace(/^\*+\s*/, "");
    body = stripTrailingColumns(body);
    // a bare number with no name on the same line is a leaked year/page/column
    if (!body) { nameBuf = []; continue; }

    const { nameCol, descCol } = splitNameDesc(body);
    const full = (nameBuf.join(" ") + " " + nameCol).trim();
    nameBuf = [];
    // wrapped subtotals ("Total Registered Investment" ↵ "Companies  613,913,288")
    // defeat the line-level ^total filter — catch them once assembled
    if (/^(sub|grand )?total\b/i.test(full)) continue;
    const type = classify(descCol ? descCol + " " + full : full);
    if (type === "SDBA") { sdba = true; rows.push({ name: "Self-Directed Brokerage Account", type: "Brokerage window", value }); continue; }
    if (type === "Participant loans") continue;

    // Prefer the description column when it names the fund; many filings put
    // the manager in the issuer column and the actual fund in the description.
    let dClean = cleanDesc(descCol);
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
        const residue = a.split(b).join(" ").replace(/[^a-z]/g, "");
        if (residue.length < 4) dClean = "";
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
    const nc = nameCol ? nameCol.trim() : "";
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
    const dUsable = dClean && (!typeOnly(dClean) || (catDesc && !identityIsProduct)) &&
      (dLetters >= 8 ? dClean.split(/\s+/).length >= 2
        : shortIdentity && dLetters >= 4 && (/\d/.test(dClean) || dClean.split(/\s+/).length >= 2));
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
      name = full;
      for (const [re] of TYPE_PATTERNS) {
        const m = full.match(re);
        if (m && m.index > 3) {
          const cut = full.slice(0, m.index).replace(/[-–—,\s]+$/, "");
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
      if (name.length < 3) name = full;
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
    // wrapped lines carry their column gaps into the assembled name
    name = name.replace(/\s{2,}/g, " ");
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
    if (/^[^a-z]*(?:(?:similar\s+)?party\s+date|rate of interest|maturity value|par\s*,\s*(?:or\s+)?maturity|identity of issue|description of investment)/i.test(name)) {
      const stripped = name
        .replace(/^(?:(?:similar\s+)?party\b|\bdate\b|\brate of interest\b|\bcollateral\b|\bpar\b|\bor\b|\bmaturity value\b|\bidentity of issue\b|\bdescription of investment\b|\(\$\)|[\s,()])+/i, "")
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
        .test(name + " " + full)) { nameBuf = []; continue; }
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
    if (/\b(?:f?ein|employer identification(?: number)?)\b[\s:;#.,\/–—-]*\d{0,3}(?:[\/–—-]\d{0,3})?[\s–—-]*$/i.test(name.trim())) { nameBuf = []; continue; }
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
    rows.push({ name: name.slice(0, 90), type: rowType, value, sec: curSection, ...(type ? { ownType: 1 } : {}), ...(iss ? { iss: iss.slice(0, 60) } : {}), ...(leadStripped ? { _sl: 1 } : {}) });
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

  const seen = new Map();
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
    const k = r.name.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
    const e = seen.get(k);
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
    totalValue += r.value;
    if (e) { e.row.value += r.value; e.vals.add(r.value); }
    else seen.set(k, { row: r, vals: new Set([r.value]) });
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
  let pairFunds = null, pairTotal = 0;
  if (total > 0 && pairedSum / total >= 0.6) {
    pairFunds = [];
    for (const [v, rs] of byVal) {
      const keep = rs.length === 2 ? [rs.slice().sort((a, b) => b.name.length - a.name.length)[0]] : rs;
      for (const r of keep) { pairFunds.push(r); pairTotal += r.value; }
    }
    pairFunds.sort((a, b) => b.value - a.value);
    pairFunds = pairFunds.slice(0, 80);
  }
  // totalValue covers every row, not just the displayed top 80 — huge filings
  // list thousands of individual securities and the ratio must reflect all.
  return { funds: [...seen.values()].map((e) => e.row).sort((a, b) => b.value - a.value).slice(0, 80), sdba, totalValue,
    hardFunds: [...hard.values()].sort((a, b) => b.value - a.value).slice(0, 80), hardTotal,
    ...(pairFunds ? { pairFunds, pairTotal } : {}),
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

export function parse4i(text, assetsEOY, sponsorName = "", codes = "") {
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
  const atStop = (line) => !trusteeMode && stopRe.test(line.trim());

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
    if (!starts.length) return { found: false };
    trusteeMode = true;
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
  for (const [s, end] of candidates) {
    const region = lines.slice(s, end);
    const regionText = region.join("\n");
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
    const marked = /thousands? of dollars|\(in thousands|\(thousands|\(\$000|000s? omitted|(?:amounts?|dollars?|\$|\b[3sS]) ?in thousands|in 0{3}['’]?s?\)/i.test(regionText);
    const markedM = /millions? of dollars|\(in millions|\(millions|(?:amounts?|dollars?|\$|\b[3sS]) ?in millions/i.test(regionText);
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
        variants.push({ parsed: { ...p, funds: p.hardFunds, totalValue: p.hardTotal }, scales: va.scales, repair: 1, parentFunds: p.funds });
      }
      if (p.pairFunds && p.pairTotal && p.pairTotal !== p.totalValue) {
        variants.push({ parsed: { ...p, funds: p.pairFunds, totalValue: p.pairTotal }, scales: va.scales, repair: 1, parentFunds: p.funds });
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
          variants.push({ parsed: { ...p,
            funds: [...keep.values()].sort((a, b) => b.value - a.value).slice(0, 80),
            totalValue: cut.sum }, scales: va.scales, repair: 1, parentFunds: p.funds });
        }
      }
    }
    for (const va of variants) {
    const parsed = va.parsed;
      if (parsed.funds.length < 2) continue;
      /* v77: a repair is a VIEW of its parent region, so the region's character
       * still condemns it. Judged on its own trimmed rows a repair can dilute
       * the very signal the parent was penalised for — the parser gate caught
       * the prefix split of an Empower code page scoring past Power Design's
       * honest 27-row schedule while carrying four "1GGCG25"-style fund codes,
       * because four codes in thirty-three rows is under the code-page share
       * and the penalty stopped applying. Classify the parent, not the view. */
      const judged = va.parentFunds || parsed.funds;

      const raw = parsed.totalValue;
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
      const isStatement = (judged.length <= 8 && stmty / judged.length >= 0.5)
        || (judged.length <= 3 && (stmty + classy) / judged.length >= 0.5);
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
      const maxV = parsed.funds.reduce((a, f) => Math.max(a, f.value), 0);
      for (const scale of va.scales) {
        const ratio = assetsEOY ? (raw * scale) / assetsEOY : 0;
        if (!ratio) continue;
        // physical impossibility guard: no single holding exceeds the
        // plan's total assets — a bogus x1000 on a tiny trust-side parse
        // otherwise lands "nearer" ratio 1 and wins (Northrop gate caught
        // its 150M parse rescaling to 150B against 40B of plan assets)
        if (scale > 1 && maxV * scale > assetsEOY * 1.05) continue;
        const closeness = Math.abs(Math.log(ratio));
        const score = -closeness + Math.min(parsed.funds.length, 40) * 0.005
          + (isSummary && closeness < 0.5 ? 0.1 : 0)
          - (isStatement ? 0.35 : 0)
          - (isCodePage ? 0.35 : 0)
          - (isProvPage ? 0.35 : 0)
          /* a reconstructed view is a repair, not a reading of the filing, so
           * it must win clearly rather than by a hair. Without this Black
           * Hills' honest 22-row region lost by 0.003 to a repaired sibling
           * carrying one more row. */
          - (va.repair ? 0.05 : 0)
          - (gainLast && parsed.funds.length >= 60 ? 0.2 : 0);
        if (!best || score > best.score) {
          best = { score, ratio, scale, stmt: isStatement, ...parsed };
        }
      }
    }
  }
  if (!best) return { found: false };
  let funds = best.scale > 1 ? best.funds.map((f) => ({ ...f, value: f.value * best.scale })) : best.funds;

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
  const isEmployer = (n) => spTokens.some((tok) => n.toLowerCase().includes(tok));
  const itemized = funds.filter((f) => (f.type === "Stock" || f.type === "Company stock") && !isEmployer(f.name));
  let sma = null, smaKind = null, sdbaOut = best.sdba;
  if (itemized.length >= 3) {
    // Are these the innards of a managed account (a single menu option) or
    // participants' own brokerage picks? Section headers say; failing that,
    // a plan with the 2R brokerage code and NO aggregate brokerage line is
    // reporting brokerage assets individually (allowed by the instructions).
    const brokRe = /brokerage|self.?directed|sdba|pcra/i;
    const brokRows = itemized.filter((f) => brokRe.test(f.sec || ""));
    const mgdRows = itemized.filter((f) => !brokRe.test(f.sec || ""));
    const hasAggSdba = funds.some((f) => f.type === "Brokerage window");
    const noSectionInfo = brokRows.length === 0 && !itemized.some((f) => brokRe.test(f.sec || ""));
    const treatAllAsBrok = noSectionInfo && !hasAggSdba && /2R/.test(codes);
    const keep = funds.filter((f) => !itemized.includes(f));
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

  // trust-POINTER pages: a member plan's own 4i is often just "Interest in
  // <X> Master Trust $8B" plus a stray row or two (Eaton: + stable value +
  // loans). At 3+ rows and ratio ≈ 1 it sailed through the confidence rule
  // and displayed as a "lineup" — the real menu lives in the trust's own
  // filing. When trust-interest rows dominate a small parse, flag it so it
  // can never be marked confident.
  const trustish = funds.filter((f) => f.type === "Master trust interest" ||
    /^(?:the )?(?:plan(?:['’]s)? )?(?:value of )?interest in .{0,50}\btrust\b/i.test(f.name) || /^master trust\b/i.test(f.name) ||
    // "Participation in … Defined Contribution Plans Master Trust"
    // (Northrop) — the name can END with the trust rather than start with
    // "interest in"
    /^participation in\b[^.]{0,60}?\bmaster trust\b/i.test(f.name) || /\bmaster trust\s*$/i.test(f.name));
  const tSum = trustish.reduce((a, f) => a + f.value, 0);
  const allSum = funds.reduce((a, f) => a + f.value, 0);
  const trustPtr = funds.length <= 8 && allSum > 0 && tSum / allSum >= 0.6;

  // provider-TOTAL statement pages: "T. Rowe Price $479M / Vanguard $271M /
  // Ariel $12M" is assets-at-custodian, not a menu. Judged at PARSE level,
  // not row level — a v49 row-level drop of bare provider names shifted
  // sums/region scores and killed ~1,300 real menus that carry ONE
  // legitimate provider-aggregate row among their real funds.
  const provAgg = isProviderAgg(funds);

  // a statement-vocabulary fragment can still WIN when it's the only
  // candidate (the real schedule is scanned or absent) — surface the flag
  // so it can never be marked confident
  return { found: true, thousands: best.scale > 1, sdba: sdbaOut, funds, ratio: best.ratio, ...(best.stmt || provAgg ? { stmt: 1 } : {}), ...(trustPtr ? { trustPtr: 1 } : {}), ...(sma ? { sma, smaKind } : {}) };
}

/* ---- plan-feature extraction from the filing's audit notes ---------------- */

/* The "Notes to Financial Statements — Description of the Plan" section of
 * the audited statements (attached to every 100+ participant filing) spells
 * out the match formula, vesting schedule, Roth/after-tax options, and
 * auto-enrollment in prose. Extract what's stated; stay silent otherwise. */
export function extractPlanFeatures(text) {
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
    if (steps >= 2) { out.vesting = "Graded schedule"; out.vestingText = cap(s); break; }
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
    const cliff = s.match(/(?:(\w{3,5}|\d)[- ]year cliff|cliff vesting[^.]{0,40}?(\w{3,5}|\d) years?|(?:(?:100|one hundred) ?(?:percent|%)|fully) vest(?:ed)?[^.]{0,130}?(?:after|upon)(?: the)?(?: complet\w+(?: of)?)? (\w{3,5}|\d) years?|0 ?(?:percent|%) vested until (\w{3,5}|\d) years|vests? (?:100|one hundred) ?(?:percent|%)[^.]{0,60}?(?:after|upon)(?: the)?(?: complet\w+(?: of)?)? (\w{3,5}|\d) years?|vest(?:ing|s)?\b[^.]{0,170}?credited with (\w{3,5}|\d) years? of (?:vesting |credited |continuous )?service|\bvest(?:ed|s)?\s+(?:at\s+)?(?:100|one hundred) ?(?:percent|%)[^.]{0,60}?(?:after|upon|following)(?: the)?(?: complet\w+(?: of)?)?\s+(\w{3,5}|\d)[\s(]*\d?\)?\s*years?|vesting of (?:100|one hundred) ?(?:percent|%)[^.]{0,40}?after[^.]{0,25}?(\w{3,5}|\d) years?|(?:100|one hundred) ?(?:percent|%) vesting occurr\w+[^.]{0,40}?after[^.]{0,25}?(\w{3,5}|\d)[\s(]*\d?\)?\s*years?|\b(?:fully |(?:100|one hundred) ?(?:percent|%) )vest\w*[^.]{0,110}?after (?:obtaining|completing|they complete)[^.]{0,25}?(\w{3,5}|\d) (?:or more )?years?|\bvest\w*[^.]{0,60}?(?:fully|(?:100|one hundred) ?(?:percent|%))[^.]{0,60}?after (?:obtaining|completing|they complete)[^.]{0,25}?(\w{3,5}|\d) (?:or more )?years?|\bis (?:100|one hundred) ?(?:percent|%) after[^.]{0,25}?(\w{3,5}|\d) years?)/i);
    if (graded) { out.vesting = "Graded schedule"; out.vestingText = cap(s); break; }
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
      if (!cliffNarrow && /^[^.]{0,40}?\b(?:prior to|before)\s+(?:january|february|march|april|may|june|july|august|september|october|november|december|\d{1,2}\/|\d{4})/i.test(s)
          && !/\bhired?\b|\bemployed\b|\benrolled\b|\banyone who\b|\bwho entered\b|\bparticipants? (?:who|hired|in the plan|before|enrolled)\b|\bemployees? (?:who|in the plan)\b|\b(?:is|are) (?:always|immediately|100)/i.test(s)) {
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
    const th = t.match(/years of (?:credited |continuous )?(?:service|vesting service)\s+(?:vesting|vested) percentage|following vesting schedule:?\s+years\s+(?:employer|vested|vesting)|vested\s+years of service\s+percentage|following schedule:?\s*vested\s+years of service\s+percentage|years of service\s+percentage|(?:vesting|vested)\s+(?:years of (?:credited |continuous )?service|service)\s+percentage|(?:completed )?years of (?:credited |continuous )?service\s+percent(?:age)? vested|years of service\s+vesting\b|years of (?:credited |continuous )?service\s+vested ?%?|percent\s+years of (?:vesting |credited |continuous )?service\s+vested|vested percentage\s+years of service|years of (?:credited |continuous )?service\s+%\s*vested|years\s+percentage\s+of service\s+vested|vested\s+(?:completed\s+)?years of (?:credited |continuous )?service\s+percent/i);
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
      const pairs = [...win.matchAll(/(less than (?:\d{1,2}|one|two|three|four|five|six)(?: years?(?: of service)?)?|(?:\d{1,2}|one|two|three|four|five|six)(?: or more)?(?: years?(?: of service)?)?(?: or more| ?\+)?) +(\d{1,3}) ?%/gi)]
        .map((p) => [p[1].toLowerCase(), +p[2]]).filter(([, pc]) => pc <= 100);
      // bare-number tables ("Less than 2  0% / 2  20 / 3  40 … 6 or more
      // 100") print the percent sign only on the first row or not at all
      // (Simon Property) — a second scan without the % requirement,
      // accepted only with the strong structural guards below (>=4 rows,
      // ascending years, monotonic to exactly 100)
      if (pairs.length < 3) {
        const bare = [...win.matchAll(/(less than \d{1,2}|\d{1,2}(?: or more| ?\+)?)(?: years?(?: of service)?)? +(\d{1,3}) ?%?(?=[ \n]|$)/gi)]
          .map((p) => [p[1].toLowerCase(), +p[2]]).filter(([, pc]) => pc <= 100);
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
      if (/^[^.]{0,40}?\b(?:prior to|before)\s+(?:january|february|march|april|may|june|july|august|september|october|november|december|\d{1,2}\/|\d{4})/i.test(s)
          && !/\bhired?\b|\bemployed\b|\benrolled\b|\banyone who\b|\bwho entered\b|\bparticipants? (?:who|hired|in the plan|before|enrolled)\b|\bemployees? (?:who|in the plan)\b|\b(?:is|are) (?:always|immediately|100)/i.test(s)) {
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
  if (!out.vesting && horizonFallback) {
    out.vesting = `${horizonFallback.num}-year schedule (shape not stated)`;
    out.vestingText = horizonFallback.text;
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
  const roth = t.match(/\broth\b[^.]{0,120}(contribut|deferral|option|401)/i) || t.match(/(designated|make) \broth\b/i) ||
    t.match(/(?:contribut|deferral)\w*[^.]{0,80}?(?:into|to|as) an? \broth\b/i);
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
  if (froz) { out.frozen = true; out.frozenText = sentence(froz.index); }

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
