#!/usr/bin/env node
/* wampo — resolve filed 4i holding names to registered-fund tickers using the
 * SEC series/class index (sec-funds.json, built by scripts/fetch-sec-funds.mjs).
 *
 * WHY A LOOKUP. Measured 2026-08-23: 248,390 distinct filed fund-name strings
 * across 53,218 confident lineups. Names already matched by fund-er.js patterns
 * average 20.0 holdings each; the rest average 4.5. The high-reuse names are
 * done and the tail is flat — hand-written patterns cannot finish it.
 *
 * ACCURACY RULES (the reason this file is careful rather than clever):
 *  - a match is exact-normalized, or filed-tokens ⊇ series-tokens WITH the
 *    manager token present. Nothing fuzzier.
 *  - never match across managers.
 *  - SHARE CLASS: one series can carry several tickers at different fees
 *    (Vanguard 500 Index = VFINX / VFIAX / VOO / VFFSX). If the filed name
 *    names a class, that class's ticker is exact. If it does not, the holding
 *    is AMBIGUOUS: it gets the comparable asterisk and a representative
 *    ticker — never a silently chosen class presented as fact.
 *
 * Usage:
 *   node scripts/match-sec-tickers.mjs --index sec-funds.json [--sample 40]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const INDEX = arg("--index", path.join(root, "sec-funds.json"));
const SAMPLE = +arg("--sample", 40);

/* ---- normalization ---------------------------------------------------------
 * Both sides get the same treatment. Kept self-contained rather than importing
 * fund-er.js so the matcher can be reasoned about on its own. */
const ABBREV = [
  [/\bvang\b|\bvg\b|\bvngrd\b|\bvngd\b|\bvanguard\b/g, "vanguard"], [/\baf\b|\bam fds\b/g, "american funds"],
  [/\btrp\b/g, "t rowe price"], [/\bvgd\b/g, "vanguard"], [/\bdfa\b/g, "dimensional"], [/\boakmrk\b/g, "oakmark"],
  [/\bidx\b/g, "index"], [/\bintl\b/g, "international"], [/\bmkt\b|\bmk\b/g, "market"],
  [/\btl\b|\btot\b/g, "total"], [/\bbd\b/g, "bond"], [/\bsm\b/g, "small"],
  [/\blg\b/g, "large"], [/\bval\b/g, "value"], [/\bgrwth\b|\bgrth\b/g, "growth"],
  [/\bsoc\b/g, "social"], [/\bstk\b/g, "stock"], [/\brtn\b/g, "return"],
  [/\bmm\b/g, "money market"], [/\badm\b/g, "admiral"], [/\binst\b/g, "institutional"],
  [/\bret\b/g, "retirement"], [/\bsvng\b/g, "savings"], [/\beuropac\b/g, "europacific"],
  /* Measured against the ranked gap list 2026-08-23: these spellings alone
   * account for ~10k unmatched holdings whose SEC series exists verbatim.
   * "Vanguard Tgt Rmt 2030 Inv Fund" and "Vanguard Target Retirement 2030
   * Fund" are the same fund; only the abbreviation stood between them. */
  [/\btgt\b/g, "target"], [/\brmt\b|\brtmt\b|\bretrmnt\b|\brtm\b|\bretire\b/g, "retirement"],
  [/\binstl\b|\binstitution\b/g, "institutional"],
  // SSgA is State Street Global Advisors; SEC registers the funds as "State Street".
  [/\bssga\b|\bssgs\b|\bssb\b/g, "state street"],
  [/\bjpm\b|\bjp morgan\b|\bj p morgan\b|\bjpmorgan\b/g, "jpmorgan"],
  [/\bblk\b/g, "blackrock"],
  // "R-6" survives punctuation-stripping as the two tokens "r" and "6", which
  // no series name contains, so the whole American Funds R-6 family failed the
  // subset test. Rejoin them before anything else looks at the tokens.
  [/\br (\d)\b/g, "r$1"],
  [/\btrgt\b/g, "target"],
  /* Spellings measured off the loss sample, 2026-08-23. Each one was costing
   * hundreds to thousands of holdings and none of them is ambiguous:
   * "VANGUARD SMALL CAP INDEX ADMRL", "VAN TARGET RETIRE 2050", "FID 500
   * INDEX", "Fidelity US Bond Index" (SEC registers it "U.S."), "Fidelity Mid
   * Cp Index". "van" is guarded against Van Kampen, a real and different
   * family. */
  [/\badmrl\b/g, "admiral"], [/\bvan\b(?! kampen)/g, "vanguard"], [/\bfid\b/g, "fidelity"],
  [/\bu s\b/g, "us"], [/\bcp\b/g, "cap"],
];
// words that carry no identity — dropped from BOTH sides before comparison
// "series" is deliberately NOT here: "Fidelity Series Bond Index Fund" is a
// different family from "Fidelity U.S. Bond Index Fund", and treating it as
// noise made the first a token-subset of the second (observed in review).
const NOISE = new Set(["fund", "funds", "the", "inc", "trust", "portfolio", "shares", "share",
  "class", "cl", "account", "of", "and", "co", "company", "lp", "llc", "incorporated"]);

export function norm(s) {
  let t = String(s).toLowerCase()
    .replace(/[®™℠]/g, " ")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ").trim();
  for (const [re, full] of ABBREV) t = t.replace(re, full);
  /* "TD" is target-date, but only where a vintage year says so. Audited across
   * the universe 2026-08-23: all 3,004 holdings carrying a standalone "td"
   * token are target-date funds ("American Funds 2050 TD Ret R6"), and none is
   * a TD Asset Management fund — but the year condition keeps the expansion
   * from ever reaching one. */
  if (/\b(?:19|20)\d\d\b/.test(t)) t = t.replace(/\btd\b/g, "target date");
  return t.replace(/\s+/g, " ").trim();
}
const tokens = (s) => norm(s).split(" ").filter((w) => w && !NOISE.has(w));

/* class indicators a filed name may state. Order matters — the longest and
 * most specific first, so "institutional select" is not eaten by "institutional". */
const CLASS_HINTS = [
  ["institutional select", /institutional select/],
  ["admiral", /\badmiral\b|\badm\b/],
  ["etf", /\betf\b/],
  /* PREMIER IS NOT INSTITUTIONAL, and collapsing them made a whole family
   * unanswerable. Fidelity Freedom Index runs FOUR classes — `Investor`,
   * `Institutional Premium`, `Premier`, `Premier II` — and with `premier`
   * folded into the `institutional` arm, THREE of them returned the hint
   * `institutional`. The selector needs `hit.length === 1`, so it could never
   * resolve, fell through to the ambiguous branch, and handed back the
   * INVESTOR class behind an asterisk for a filing that says PREMIER. That is
   * a different share class and therefore a different fee.
   * Measured on published lineups: 16,630 rows / 17.4M participant-weighted
   * state a class and get nothing, against 21,706 / 33.3M that state none and
   * must stay blank.
   * Order is longest-first because `hintOf` takes the FIRST match in table
   * order: `Premier II` must be read before `Premier`, and `Institutional
   * Premium` before the bare `Institutional`, or the specific class is eaten
   * by the general one — the same failure one level down. */
  ["premier ii", /\bpremier\s*(?:ii|2)\b/],
  ["institutional premium", /\binstitutional premium\b|\binstl?\s*prem\b|\bins\s*pre\b/],
  /* the specific arm must not also match the general one, or a class name
   * answers to both and set-membership can no longer separate them:
   * `Premier II Class` must not read as `premier`, and `Institutional Premium
   * Class` must not read as bare `institutional`. */
  ["premier", /\bpremier\b(?!\s*(?:ii|2)\b)/],
  ["institutional", /\binstitutional\b(?!\s*(?:premium|select)\b)|\binst\b/],
  ["investor", /\binvestor\b|\binv\b/],
  ["r6", /\br ?6\b/], ["r5", /\br ?5\b/], ["r4", /\br ?4\b/], ["r3", /\br ?3\b/],
  ["k6", /\bk ?6\b/], ["k", /\bclass k\b|\bk shares?\b/],
  ["z", /\bclass z\b|\bz shares?\b/], ["y", /\bclass y\b/], ["i", /\bclass i\b|\bi shares?\b/],
  ["a", /\bclass a\b/], ["c", /\bclass c\b/], ["r", /\bclass r\b/],
];
/* Words that change WHICH product a name refers to. A series may legitimately
 * be shorter than the filed name, but not by one of these. */
const DISCRIMINATORS = new Set(["value", "growth", "index", "blend", "international",
  "global", "small", "mid", "large", "short", "intermediate", "long", "income",
  "emerging", "developed", "aggressive", "conservative", "moderate", "inflation",
  "municipal", "corporate", "government", "treasury", "highyield", "high", "yield",
  "russell", "socially", "esg", "sustainable", "hedged", "unhedged"]);

/* The superset pass drops every filed word the series lacks, so any word that
 * changes WHAT THE FUND HOLDS has to be checked. DISCRIMINATORS alone was too
 * narrow: "PIMCO Commodity Real Return Strategy Fund" resolved to PRRIX, the
 * PIMCO REAL RETURN fund — a TIPS fund standing in for a commodities fund,
 * because neither "commodity" nor "strategy" was on the list. Asset class,
 * sector and region words all belong here. */
const ASSET_WORDS = new Set([...DISCRIMINATORS, "bond", "stock", "stocks", "equity",
  "equities", "money", "market", "return", "real", "estate", "reit", "tips", "balanced",
  "commodity", "commodities", "strategy", "strategies", "currency", "gold", "precious",
  "energy", "technology", "healthcare", "health", "utilities", "financial", "financials",
  "natural", "resources", "infrastructure", "convertible", "floating", "science",
  "world", "pacific", "europe", "european", "japan", "china", "asia", "asian",
  "dividend", "fixed", "allocation", "target", "retirement", "total", "core", "plus"]);

/* A WORD THAT SAYS WHAT A FUND HOLDS CAN NEVER BE EXCUSED AS A HOUSE WORD.
 *
 * The leftover check in the superset pass excuses a filed token when it is
 * part of a house name the filing states — which is right for `American Funds
 * Growth Fund of America`. But `house` is built from `MANAGERS`, and MANAGERS
 * is deliberately permissive: it is scraped from every registrant name in the
 * SEC file, so it holds `short term`, `smallcap`, `world` and `capital world`
 * beside `vanguard`. Those tokens then excused themselves, and the superset
 * pass dropped the very words that say WHICH product the filing means — the
 * exact failure the leftover check's own comment was written to prevent:
 *
 *   `Vanguard SmallCap Value Index Fund`            -> Vanguard VALUE Index
 *   `Vanguard Smallcap Index Fund Institutional`    -> Vanguard INSTITUTIONAL
 *                                                      Index, an S&P 500 fund
 *   `Vanguard Short-Term Inflation-Protected Sec…`  -> the INTERMEDIATE TIPS
 *                                                      fund
 *   `American Funds World Growth and Income Fund`   -> American Funds GROWTH
 *                                                      AND INCOME Portfolio
 *
 * Every one of those was returned with no issuer involved at all, so it is a
 * defect in `resolve` and not in how a caller composes the string.
 * The concatenated forms matter: a filing writes `SmallCap` as one token and
 * `small` and `cap` are both asset words, so the test has to try the splits. */
/* `cap` is not a discriminator on its own — "Cap" says nothing — but it is
 * half of one when a filing welds it: `SmallCap`, `MidCap`, `LargeCap`. It
 * belongs to the SPLIT test only, never to ASSET_WORDS itself, whose members
 * are judged whole elsewhere. */
const CONCAT_PART = new Set([...ASSET_WORDS, "cap", "caps"]);

/* VEHICLE NOUNS, for the magnet-key rule below. They are members of NOISE, so
 * `tokens()` throws them away on both sides before anything is compared — the
 * whole point of NOISE being that they carry no identity. `fund` and `funds`
 * are deliberately ABSENT: they are universal furniture, present in most
 * registered names and absent from most filed ones, so requiring them to
 * agree would refuse thousands of correct answers (`Fidelity Balanced Fund`
 * against a filed `Fidelity Balanced K`). What is left is the small set of
 * words a registrant uses to say this product is NOT the plain fund. */
const VEHICLE_NOUN = new Set(["portfolio", "portfolios", "trust", "trusts", "account", "accounts"]);
const vehiclesOf = (s) => new Set(norm(s).split(" ")
  .filter((w) => VEHICLE_NOUN.has(w)).map((w) => w.replace(/s$/, "")));
function isAssetWord(w) {
  if (ASSET_WORDS.has(w)) return true;
  for (let i = 3; i <= w.length - 3; i++)
    if (CONCAT_PART.has(w.slice(0, i)) && CONCAT_PART.has(w.slice(i))) return true;
  return false;
}

/* Share-class markers: words a filing adds that name a class, not a fund. */
const CLASS_MARK = /^(?:r[1-6]|k6|[akyzci]|inv|investor|adm|admrl|admiral|adv|advisor|institutional|instl|inst|premier|premium|retail|service|select|shares?)$/;
/* …and the subset of those that also NAME A SEPARATE SERIES, which is the only
 * reason the interrupting-token guard below exists. Measured, not guessed: on
 * the v189 store, restricting the guard to this word costs 954 names / 1,551
 * rows of previously-resolved holdings and keeps 569 names / 3,277 rows of
 * genuinely wrong ones. The words left out are the reason it is restricted —
 * `advisor` and `select` are ordinary parts of a fund's name (`Fidelity Select
 * Natural Resources`, `MassMutual Select Mid Cap Growth`, `Fidelity Adv Total
 * Bond Z`), and guarding on them withdrew correct answers, including some the
 * SEC's own class names would have excused had the filing not abbreviated
 * `Advisor` to `Adv`. */
const INTERRUPT_WORD = /^(?:institutional|instl|inst)$/;

const hintOf = (s) => { const t = norm(s); for (const [k, re] of CLASS_HINTS) if (re.test(t)) return k; return null; };
/* EVERY class word a name states, not just the first one CLASS_HINTS happens
 * to list. `hintOf` returns the earliest match in table order, so "Principal
 * Real Estate Securities Instl R6" answered "institutional" — the table lists
 * it above r6 — and the Institutional ticker PIREX was returned AS FACT for a
 * holding whose filed name says R-6. The ticker is wrong and so is the fee
 * beside it, which is the whole reason the class is read at all. */
const hintsRaw = (s) => { const t = norm(s); return CLASS_HINTS.filter(([, re]) => re.test(t)).map(([k]) => k); };
/* A CLASS WORD INSIDE PARENTHESES LOSES TO ONE OUTSIDE THEM, because a 4i
 * schedule's parentheses are usually a FOOTNOTE MARKER and not a class.
 * `Invesco Diversified Dividend Fund R5 Class (i)` states R-5 in the open and
 * carries a footnote `(i)`; norm strips the brackets, `\bclass i\b` then
 * matched, and the R-5 ticker DDFIX was replaced by Class A behind an
 * asterisk — a correct answer lost to a marker this project has already
 * recorded costing 1.17M readers in another guise. Where the brackets hold the
 * only class word there is nothing to prefer, so the full name is used. */
const hintsOf = (s) => {
  const open = hintsRaw(String(s).replace(/\([^)]*\)/g, " "));
  return open.length ? open : hintsRaw(s);
};

/* Manager vocabulary, derived from the SEC entity names rather than hand-listed
 * so it covers every registrant in the file. A token counts as a manager word
 * when it leads an entity name and is not a generic finance word. */
const MANAGERS = new Set();
const GENERIC_LEAD = new Set(["etf", "etfs", "variable", "insurance", "mutual", "funds",
  "american", "global", "national", "first", "us", "u", "core", "total",
  "government", "income", "growth", "value", "equity", "bond", "index", "international", "capital",
  "select", "strategic", "advisors", "advisor", "investors", "investment", "investments", "target",
  "retirement", "large", "small", "mid", "short", "long", "high", "real", "new", "north"]);

/* A manager is a PHRASE long enough to name a house, and a one- or two-letter
 * "manager" names every house. Taking the entity's leading token alone put
 * "t" (from "T. Rowe Price Growth Stock Fund, Inc."), "j", "x", "m" and the
 * English word "for" (from "TRUST FOR PROFESSIONAL MANAGERS") into the
 * vocabulary. "t" is a token of every normalized T. Rowe Price name, so the
 * manager gate below admitted the entire index for every T. Rowe Price
 * holding in the universe — the gate was doing nothing exactly where it was
 * most needed. Extend the phrase until it is distinctive: keep taking tokens
 * while the phrase so far is generic or three characters or shorter.
 *
 * The phrase is built from the entity name WITHOUT the NOISE list applied,
 * because "funds" is noise inside a series name but is half the house name in
 * "American Funds". Stripping it produced the phrase "american target date"
 * for the American Funds Target Date Retirement Series, which no filed name
 * contains (the vintage year sits between "funds" and "target"), and the whole
 * 20k-row family failed the gate. Filed names are matched against the same
 * un-stripped normalization, so both sides keep the house word. */
const STRUCTURAL = new Set(["trust", "trusts", "fund", "funds", "portfolio", "portfolios",
  "series", "company", "companies", "group", "the", "of", "for", "and", "inc", "llc", "lp",
  "plc", "corporation", "corp", "holdings", "shares", "class", "account", "ii", "iii", "iv"]);
/* Share-class and role words. A registrant named "INSTITUTIONAL FIDUCIARY
 * TRUST" contributed the single-token manager "institutional", which is a
 * token of every institutional share class in the universe -- the same failure
 * as "t" and "bond fund", one level along. These extend to a second token
 * rather than being dropped, so that registrant stays usable as "institutional
 * fiduciary" while the bare word stops naming every house. */
const CLASS_WORDS = new Set(["institutional", "investor", "premier", "premium", "advisor",
  "advisors", "adviser", "retail", "service", "services", "fiduciary", "admiral", "select",
  "administrative", "signal", "founders", "flagship"]);
/* Words that describe what a fund HOLDS. A registrant named after its own
 * product ("BOND FUND OF AMERICA", "INCOME FUND OF AMERICA") yields a phrase
 * made only of these, and such a phrase names no house — "bond fund" matched
 * the filed "High Yield Bd Fund", which states no manager at all, and handed
 * it a ticker. Same failure as the single-letter "t", one level up. A phrase
 * built entirely from description is rejected; a single long token is kept,
 * because that is how genuine houses whose name is also a word appear
 * ("Russell", "Oakmark"). */
const DESCRIPTIVE = new Set([...DISCRIMINATORS, "bond", "stock", "stocks", "equity",
  "equities", "money", "market", "return", "estate", "cap", "balanced", "date",
  "dividend", "fixed", "opportunity", "opportunities", "asset", "allocation",
  "target", "retirement", "total",
  /* `term` belongs here for the same reason every other word does, and leaving
   * it out cost 232 rows. `managerPhrase("Short-Term Bond Fund")` extends past
   * the generic lead `short` to `short term`, and that two-word phrase is not
   * ALL-descriptive only because `term` was missing from this set — so it was
   * kept as a manager. HOMESTEAD FUNDS INC registers its series under the bare
   * name `Short-Term Bond Fund`, so its manager keys became ["homestead",
   * "short term"], and `short term` is a token of EVERY house's short-term
   * bond fund. The manager gate then admitted Homestead for Vanguard, Victory,
   * TIAA-CREF, PIMCO, Allspring, Virtus, Schwab and American Funds holdings,
   * and HOSBX was published as fact on 171 of them. */
  "term"]);
function managerPhrase(entity) {
  const t = norm(entity).split(" ").filter(Boolean);
  if (!t.length) return null;
  let n = 1;
  // extend while the phrase so far cannot stand for a house on its own
  while (n < 3 && t.length > n
    && (t.slice(0, n).join(" ").length <= 4
      || (n === 1 && (GENERIC_LEAD.has(t[0]) || STRUCTURAL.has(t[0]) || CLASS_WORDS.has(t[0]))))) n++;
  const parts = t.slice(0, n);
  const p = parts.join(" ");
  if (parts.length > 1 && parts.every((w) => DESCRIPTIVE.has(w) || STRUCTURAL.has(w))) return null;
  return p.length >= 5 || p.includes(" ") ? p : null;
}

export function buildIndex(indexPath) {
  const j = JSON.parse(fs.readFileSync(indexPath, "utf8"));
  // series key -> [{ticker, className, hint, entity}]
  const bySeries = new Map();
  for (const [name, ticker, , className] of j.funds) {
    const [entity, series] = String(name).includes(" :: ") ? String(name).split(" :: ") : ["", String(name)];
    const key = tokens(series).join(" ");
    if (!key) continue;
    const list = bySeries.get(key) || [];
    /* The manager keys are the registrant's own name and the name the SERIES
     * LEADS with -- never a name appearing anywhere inside the series. A fund
     * sponsored by one house and sub-advised by another puts the sub-adviser
     * mid-name ("Virtus DFA 2015 Target Date Retirement Income Fund"), and a
     * substring test read that as Dimensional's own fund. It is Virtus's, at
     * Virtus's fee. Same failure as "Empower T. Rowe Price Mid Cap Growth". */
    list.push({ ticker, className: className || "", hint: hintOf(className || ""), entity, series,
      mgrKeys: [managerPhrase(entity), managerPhrase(series)].filter(Boolean) });
    bySeries.set(key, list);
  }
  // Inverted index on the series' LEADING token (the manager/family word).
  // Without it the superset pass is 1.25M filed rows x 29k series and simply
  // does not finish; with it a filed name only considers series from a manager
  // whose name it actually contains.
  const byLead = new Map();
  for (const [key, list] of bySeries) {
    const st = key.split(" ");
    const arr = byLead.get(st[0]) || [];
    arr.push([st, list]);
    byLead.set(st[0], arr);
  }
  for (const arr of byLead.values()) arr.sort((a, b) => b[0].length - a[0].length);
  // Series carrying a vintage year, bucketed by that year, for the year-pinned
  // pass in resolve(). Keeps that pass to a few dozen candidates instead of
  // every series in the file.
  const byYear = new Map();
  for (const [key, list] of bySeries) {
    const st = key.split(" ");
    for (const w of st) {
      if (!/^(19|20)\d\d$/.test(w)) continue;
      const arr = byYear.get(w) || [];
      arr.push([st, list]);
      byYear.set(w, arr);
      break;
    }
  }
  // "American Funds" and "American Century" are real managers even though
  // "american" is a generic lead -- a two-word manager phrase is kept whole.
  // Managers are PHRASES, not words. Taking the second token when the first is
  // generic put "growth" in the vocabulary (from "AMERICAN GROWTH TRUST"), and
  // "growth" then satisfied the manager gate for "American Funds The Growth
  // Fund of America" -- which resolved to the wrong fund entirely -- and for
  // the manager-less "Large Cap Growth II". A phrase cannot do that: the filed
  // name must literally contain "american growth" to match that registrant.
  for (const [name] of j.funds) {
    const p = managerPhrase(String(name).split(" :: ")[0]);
    if (p) MANAGERS.add(p);
  }
  return { bySeries, byLead, byYear, managers: MANAGERS, memo: new Map(), generated: j.generated, source: j.source, rows: j.funds.length };
}

/* Does this string name a fund house the SEC file knows? */
export function namesManager(idx, s) {
  const hay = " " + norm(s) + " ";
  for (const m of idx.managers) if (hay.includes(" " + m + " ")) return m;
  return null;
}

/* THE ONE WAY A HOLDING SHOULD BE LOOKED UP, so every caller shares the rule.
 *
 * A 4i row has two name cells and `app.js` tries both. The issuer cell is the
 * problem: it OFTEN HOLDS A TRUSTEE rather than the fund house — `Principal
 * Trust Company`, `Empower Trust Company, LLC` — which this project already
 * recorded on 2026-09-16 when the same prefix was BREAKING matches in
 * `fund-er.js`. Here it does the opposite and worse: a trustee is a registrant
 * in the SEC file, so prefixing it SUPPLIES a manager to the gate and licenses
 * a series that belongs to the trustee rather than to the fund.
 *
 * Measured case, found by a random draw of 30 and the only clear false
 * positive in it: `BlackRock High Yield Portfolio K Fund` with the issuer cell
 * `Principal Trust Company` resolved to CPHYX — a Class A of a series
 * registered as the bare `High Yield Fund`. The filed name says BlackRock. The
 * answer contradicted the row's own words.
 *
 * So the issuer may ADD a manager and may never REPLACE one: when the filed
 * name already names a house, the bare name is the only string asked. */
/* `of American` IS A FILED TYPO FOR `of America`, AND IT NAMES A DIFFERENT
 * REAL FUND, which is why it is repaired here rather than left alone.
 *
 * `American Funds The Growth Fund of American R6` resolved EXACTLY to RGWGX —
 * `American Funds Growth Portfolio`, the Portfolio Series fund-of-funds — and
 * the matcher was right to: after structural words that series' key is only
 * {american, growth}, so the misspelled `american` IS one of its tokens while
 * the right series (`GROWTH FUND OF AMERICA`) needs `america`, which the
 * filing never types. Nothing in the matcher can see the difference; the
 * string is wrong, so the string is repaired.
 *
 * THE TEST IS A POSITIVE VOCABULARY OF WHAT MAY FOLLOW, never a blocklist of
 * entity names. The American Funds forms end the entity at `America` and are
 * followed by nothing, a share class, or a vehicle word; a real entity
 * continues with a proper noun, and all four in the store do — `of American
 * Airlines, Inc.`, `of American United Life Insurance Company`, `of American
 * Trust Company`, `Best of American Fixed`. A blocklist would have to name
 * every entity that could ever follow; this names the handful of things that
 * may.
 *
 * UNDER-REPAIR IS THE SAFE DIRECTION AND IT IS TAKEN: `Mutual of American
 * Small Cap Growth Fund` is genuinely Mutual of America misspelled, and is
 * refused here because `Small` continues like a name. Those rows are typed
 * `Pooled separate account`, which the merge's own gate excludes anyway. */
const OF_AMERICAN = /\bof American\b(?=\s*$|\s*[-–,]|\s+(?:fund|funds|class|cl|shares?|r\b|r\s*-?\s*\d|[a-f]\d?\b|return\b))/i;
export function repairFiledName(s) {
  const t = String(s || "");
  return OF_AMERICAN.test(t) ? t.replace(OF_AMERICAN, "of America") : null;
}

export function resolveHolding(idx, filedName, issuer) {
  /* The repair is asked FIRST, and only when the vocabulary above fires. Once
   * it has, the filed string is established as a misspelling, so an answer it
   * resolves to is an answer to a name no fund has — which is how the two
   * flips below were being published as fact. It can still only improve: when
   * the repaired name resolves to nothing, the faithful path runs unchanged
   * and nothing is withdrawn. Measured whole-store: 15 rows gained a ticker,
   * 2 moved off `American Funds Growth Portfolio` onto the Growth Fund of
   * America class the filing states, 0 lost, and nothing outside the phrase
   * moved. The DISPLAYED name is untouched — only the lookup is repaired,
   * exactly as `repairHouse` does for `Vangaurd` on the display side.
   *
   * The repaired name gets the WHOLE faithful path, issuer cell included — a
   * first draft only re-asked `resolve`, which is inert, because the issuer
   * branch is where `Bond Fund of American R6` [iss American Funds] is
   * decided. */
  const fixed = repairFiledName(filedName);
  if (fixed) {
    const r = resolveFaithful(idx, fixed, issuer);
    if (r) return r;
  }
  return resolveFaithful(idx, filedName, issuer);
}

function resolveFaithful(idx, filedName, issuer) {
  const direct = resolve(idx, filedName);
  if (direct) return direct;
  const iss = String(issuer || "").replace(/\*+/g, "").trim();
  if (!iss) return null;
  const out = resolve(idx, iss + " " + filedName, new Set(norm(iss).split(" ").filter(Boolean)));
  if (!out) return null;
  /* ASKING "DOES THE FILED NAME NAME A HOUSE" IS THE WRONG QUESTION, and the
   * measurement said so before this shipped. `MANAGERS` is built permissive on
   * purpose — a wrong manager merely fails the gate — so it holds `emerging`,
   * `intermediate`, `selected`, `world` and `mutual fund` beside `blackrock`.
   * Refusing the issuer whenever the name matched any of them cost 1,758 names
   * / 3,330 rows of CORRECT answers (`Emerging Markets Index` [iss Fidelity]
   * → FPADX, 74 rows).
   * A COUNT THRESHOLD DOES NOT SEPARATE THEM EITHER, and that is worth
   * recording so it is not tried again: `emerging` carries 18 series and
   * `mutual fund` 44, while `blackrock` carries 39 and `american funds` 49.
   * No cut exists.
   * The question that does work is about the ANSWER, not the name: a house
   * that LEADS the filed name must be accounted for by the series the match
   * landed on, or by the issuer itself. `BlackRock High Yield Portfolio K` led
   * with blackrock and landed on a series registered as the bare `High Yield
   * Fund` under a `Principal Trust Company` issuer — the answer contradicted
   * the row's own first word. `Emerging Markets Index` landing on `Fidelity
   * Emerging Markets Index Fund` contradicts nothing. */
  const lead = leadManager(idx, filedName);
  if (!lead) return out;
  const hay = " " + norm(out.series || "") + " | " + norm(out.className || "") + " | " + norm(iss) + " ";
  return hay.includes(" " + lead + " ") ? out : null;
}

/* A house LEADS a fund's name. Returns the manager phrase the filed name
 * opens with, or null — and never a phrase built only from vehicle words,
 * because `Mutual Fund, 500 Index` opens with the registrant phrase
 * `mutual fund` and names no house at all. */
const VEHICLE_WORD = new Set(["mutual", "fund", "funds", "shares", "share", "trust", "trusts",
  "portfolio", "portfolios", "series", "account", "accounts", "collective", "common", "pooled",
  "separate", "index", "the", "of", "and", "class", "investment", "investments"]);
function leadManager(idx, filedName) {
  const t = norm(filedName).split(" ").filter(Boolean);
  for (let n = 3; n >= 1; n--) {
    if (t.length < n) continue;
    const p = t.slice(0, n).join(" ");
    if (!idx.managers.has(p)) continue;
    if (t.slice(0, n).every((w) => VEHICLE_WORD.has(w))) return null;
    return p;
  }
  return null;
}

/* Resolve one filed holding name. Returns null, or
 * { ticker, comparable, why, series, className } */
export function resolve(idx, filedName, issuerWords) {
  const memoKey = norm(filedName) + (issuerWords ? "\u0000i" : "");
  if (idx.memo && idx.memo.has(memoKey)) return idx.memo.get(memoKey);
  const out = resolveUncached(idx, filedName, issuerWords);
  if (idx.memo) idx.memo.set(memoKey, out);
  return out;
}

function resolveUncached(idx, filedName, issuerWords) {
  // A collective trust is never the mutual fund, however well the names line
  // up: "Vanguard Target Retirement 2025 Trust I" resolved to VTTVX and was
  // reported EXACT because "trust" is stripped as noise. Its fee is negotiated
  // per plan; the registered fund is only its comparable.
  const pooled = /\btrust\b|\bcollective\b|\bcommingled\b|\bpool\b|\bcit\b|separate account|\bunitized\b/i.test(filedName);
  const ft = tokens(filedName);
  if (ft.length < 2) return null;                    // too generic to identify anything
  const fset = new Set(ft);
  const key = ft.join(" ");

  // The manager is needed before the year-pinned pass below, not only after,
  // so it is resolved up front. Un-stripped normalization, to match
  // managerPhrase's un-stripped entity normalization.
  const filedNorm = " " + norm(filedName) + " ";
  const filedMgrs = [];
  for (const m of MANAGERS) if (filedNorm.includes(" " + m + " ")) filedMgrs.push(m);
  const mgrHit = (c) => c.mgrKeys.some((k) => filedMgrs.includes(k));
  /* A SERIES WHOSE REGISTRANT NAMES NO HOUSE, MATCHED BY A FILED NAME THAT
   * NAMES NO HOUSE EITHER. `SHORT-TERM BOND FUND OF AMERICA` and `GROWTH FUND
   * OF AMERICA` are American Funds funds whose legal names say so nowhere, so
   * they carry no manager key; a filing that writes only `Short-Term Bond Fund
   * of America R4` then names no manager either and the gate refused both
   * sides. Allowed only when the SERIES KEY IS NOT ENTIRELY DESCRIPTIVE —
   * `short term bond america` keeps `america`, while Homestead's `short term
   * bond` keeps nothing, which is exactly the pair that must be separated. */
  const anonDistinct = (st, list) => list.every((c) => !c.mgrKeys.length)
    && st.some((w) => !DESCRIPTIVE.has(w) && !STRUCTURAL.has(w));
  // tokens of the houses the filing names, and share-class markers: the two
  // kinds of filed word a series is allowed to leave unaccounted for
  /* A word the ISSUER cell contributed is not part of the filed name and can
   * never be the filing's own discriminator — `Prudential Financial, Inc.`
   * puts `financial` into the string, and `financial` is a SECTOR word, so
   * stripping it cost eight correct PGIM answers before this exemption. */
  const house = new Set(filedMgrs.flatMap((m) => m.split(" "))
    .filter((w) => !isAssetWord(w) || (issuerWords && issuerWords.has(w))));

  let classes = idx.bySeries.get(key);
  let why = "exact";
  if (!classes) {
    // token-superset: every series token present in the filed name, and the
    // series' leading (manager/family) token among them. Longest series wins,
    // so "vanguard 500 index" beats "vanguard index".
    /* Score = token count first, then characters matched. Token count alone
     * ties, and the tie was broken by iteration order: "American Funds
     * EuroPacific Growth Fund R6" matched BOTH "EuroPacific Growth" and
     * "American Funds Growth Portfolio" at two tokens each, and returned the
     * second -- a different fund. The character tie-break prefers the series
     * that explains more of the filed name, which is the one that named
     * "europacific". */
    let best = null, bestLen = 0, bestKey = [], bestScore = 0;
    for (const w of fset) {
      const cands = idx.byLead.get(w);
      if (!cands) continue;
      for (const [st, list] of cands) {              // sorted longest-first
        if (st.length < 2 || st.length < bestLen) break;
        let all = true;
        for (const x of st) if (!fset.has(x)) { all = false; break; }
        if (!all) continue;
        /* Rank by how much of the FILED name the series leaves unexplained,
         * before token count or length. "American Funds Growth Fund of America
         * R6" matches both "american growth" (leaving "america" dangling) and
         * "growth america" (leaving only the house word and the class); the
         * second is the fund. Ranking by size alone picked the first, and an
         * earlier attempt to fix it by discarding all-generic series keys threw
         * away "New World Fund" and "American Balanced Fund" too -- real funds
         * whose names happen to be ordinary words. Counting what is left over
         * separates them without a vocabulary judgement. */
        const st1 = new Set(st);
        let left = 0;
        for (const w of ft) if (!st1.has(w) && !house.has(w) && !CLASS_MARK.test(w)) left++;
        const score = (9 - Math.min(left, 9)) * 1e6 + st.length * 1000 + st.join("").length;
        if (score <= bestScore) continue;
        best = list; bestLen = st.length; bestKey = st; bestScore = score;
      }
    }
    /* YEAR-PINNED PASS. The superset test requires the registered name to be
     * SHORTER than the filed one, and target-date filings are routinely the
     * other way round: "American Funds 2040 Retirement" is filed for
     * "American Funds 2040 Target Date Retirement Fund", and the 2010-2025
     * vintages register as "... Retirement INCOME Fund" — a word the filing
     * omits. 35,546 holdings sat in that gap.
     *
     * Running the subset in the other direction is only safe because a vintage
     * year pins the product: within ONE manager and ONE year, a target-date
     * series is unique. All four conditions are required — the filed name
     * carries a year, names a manager, is a token-subset of the series, and
     * exactly one series in that manager+year survives. Two candidates (say
     * Vanguard's "Target Retirement 2025" and "Institutional Target Retirement
     * 2025") means the filing did not say which, so it resolves to nothing. */
    if (!best) {
      const yr = ft.find((w) => /^(19|20)\d\d$/.test(w));
      // The subset test runs on the fund's name, not its share class. R-6 is
      // the dominant 401(k) class for American Funds, and "American Funds 2025
      // Target Date Retirement R6" failed only because "r6" is absent from the
      // registered series name. Drop the class markers here; the class-hint
      // step below is what turns them back into the right ticker.
      const core = ft.filter((w) => !/^(?:r[1-6]|k6|[akyzci]|investor|admiral|adv|advisor)$/.test(w));
      if (core.length === ft.length && ft.length > 3) {
        // a trailing bare class letter the strip above does not name
        const last = ft[ft.length - 1];
        if (last.length === 1 || /^[a-z]\d$/.test(last)) core.pop();
      }
      if (!yr || core.length < 3) return null;
      const uniq = new Map();
      for (const [st, list] of idx.byYear.get(yr) || []) {
        if (st.length - core.length > 3) continue;     // series may add a little, not a lot
        const sset = new Set(st);
        let all = true;
        for (const w of core) if (!sset.has(w)) { all = false; break; }
        if (!all || !(list.some(mgrHit) || anonDistinct(st, list))) continue;
        uniq.set(st.join(" "), list);
        if (uniq.size > 1) break;
      }
      if (uniq.size !== 1) return null;
      classes = [...uniq.values()][0];
      why = "year-pinned";
    } else {
    classes = best; why = "superset";
    /* A MAGNET SERIES KEY: A HOUSE TOKEN PLUS ASSET WORDS AND NOTHING ELSE.
     *
     * `AMERICAN FUNDS PORTFOLIO SERIES :: American Funds Growth Portfolio`
     * keeps only {american, growth} once NOISE is dropped — a house word and
     * an asset word — and EVERY American Funds growth-ish filed name is a
     * superset of that pair. So `American Funds Growth Fund R6` and
     * `American Funds Growth and Income R6` were both handed a Growth
     * Portfolio ticker, asserted as fact, for filings naming a different fund.
     * Measured on the v191 store: 57 rows / 30,965 participant-weighted are
     * SHOWN such an answer through `stk`, which `app.js` reads when
     * `fund-er.js` has none.
     *
     * THE OBVIOUS FIX IS DEAD AND WAS KILLED BY MEASUREMENT, so it is recorded
     * rather than retried: taking `portfolio` out of NOISE costs 5,901 correct
     * rows / 5,830,477 participant-weighted / 1,196 names, because Dimensional
     * registers `U.S. Targeted Value Portfolio` while filings write `DFA US
     * Targeted Value I`, and the whole DFA family withdraws. `portfolio` stays
     * in NOISE. This is the exact mirror of that list's own comment on why
     * `series` must stay OUT of it.
     *
     * So the NOISE words are not restored — they are ASKED TO AGREE, and only
     * where the key has nothing else left to discriminate with. A registrant
     * that says `Portfolio` or `Trust` where the filing says neither is
     * naming a different product, and with an all-descriptive key that is the
     * only evidence there is. `fund`/`funds` are excluded because they are
     * furniture on both sides (see VEHICLE_NOUN).
     *
     * THE GATE IS "WHAT IS LEFT OF THE KEY ONCE THE HOUSE IS ACCOUNTED FOR",
     * and two weaker forms were written first and killed by the same
     * whole-store diff, so they are recorded rather than left to be retried:
     *
     *   (1) "the key is house tokens plus asset words" — fires on nearly
     *       everything, because `mgrKeys` holds `managerPhrase(series)` as
     *       well as the registrant's, and a series' own phrase is built from
     *       its own leading words. `U.S. Targeted Value Portfolio` yields
     *       `us targeted`, which covered two thirds of its own key. 2,510
     *       rows / 2.68M participant-weighted withdrawn, overwhelmingly DFA.
     *   (2) the vehicle test on its own, however the house tokens are built —
     *       992 rows / 1.17M still withdrawn, because DIMENSIONAL REGISTERS
     *       EVERYTHING AS `Portfolio` AND FILINGS WRITE `Fund` OR NOTHING.
     *       `DFA Global Equity I` and `DFA International Small Company Fund`
     *       are correct answers whose registrant simply uses the other word.
     *
     * What separates them is not the vehicle noun but how much the key still
     * says. `global equity` and `international small` keep TWO asset words
     * after DFA's house is removed, and two asset words name a product;
     * `american growth` keeps ONE, and one asset word cannot choose between
     * the dozens of growth funds a house registers. So the vehicle noun is
     * asked ONLY where the key has nothing else left — where it is the last
     * evidence there is rather than a preference between two readings.
     * `fidelity balanced` also keeps one, and is untouched, because Fidelity
     * registers that series as a `Fund` and the filing says `Fund` too.
     *
     * It FILTERS the bucket rather than refusing it, because one key can hold
     * two registrants' products: `american growth` holds John Hancock's
     * `American Growth Trust` beside American Funds' `Growth Portfolio`, and a
     * filed name stating `Trust` should reach the first and not the second. */
    const rest = bestKey.filter((w) => !house.has(w));
    if (rest.length <= 1 && rest.every(isAssetWord)) {
      const fv = vehiclesOf(filedName);
      const kept = best.filter((c) => [...vehiclesOf(c.series)].every((v) => fv.has(v)));
      if (!kept.length) return null;
      classes = kept; best = kept;
    }
    // A superset match must not drop a DISCRIMINATOR. "BLACKROCK RUSSELL 2000
    // VAL IDX FD" is not "Russell 2000 Fund" -- value/index change which
    // product it is, and a subset match silently discards them. If the filing
    // states a discriminator the series does not, they are different funds.
    const sset = new Set(bestKey);
    /* Every filed token the series does not account for has to be explained by
     * something. A word left over is either a different product or a different
     * sponsor's version of one, and both were shipping wrong tickers:
     *   "VANGUARD MIDCAP INDEX INSTL" -> Vanguard INSTITUTIONAL INDEX (VINIX),
     *      an S&P 500 fund, because "midcap" was simply dropped
     *   "LVIP SSGA S&P 500 Index"     -> State Street's own fund, when it is a
     *      Lincoln Variable Insurance Products fund sub-advised by SSgA, with
     *      Lincoln's fee
     * Only two kinds of leftover are legitimate: a share-class marker, and a
     * house name the filing states and the registrant's legal name omits
     * ("American Funds Growth Fund of America"). Anything else and we do not
     * know what we are looking at. */
    /* A SHARE CLASS NEVER INTERRUPTS THE FUND NAME, and that is the only
     * signal that separates a class marker from a word that is part of a
     * DIFFERENT product's name. "Vanguard Institutional Target Retirement
     * 2070" matched the series "vanguard target retirement 2070" with
     * "institutional" excused as a class marker, and was returned as VSVNX
     * WITH NO ASTERISK — asserted as fact. The Institutional Target Retirement
     * funds are a separate series and are not in the SEC file at all, so the
     * honest answer is a refusal, not a better pick. Same shape reached
     * "Vanguard Institutional Target Retire 2020" -> VTWNX.
     *
     * The test is positional AND evidential, because the positional half alone
     * costs real matches: "Fidelity Advisor Mid Cap Value Fund Class Z" leaves
     * "advisor" sitting between "fidelity" and "mid", and it IS a class — the
     * SEC's own class name for it reads "Fidelity Advisor Mid Cap Value Fund:
     * Class Z". So an interrupting word is excused only when some class of
     * this very series NAMES it. Vanguard's 2070 classes read "Investor
     * Shares" and nothing else, which is the index saying it does not know
     * this product. */
    const pos = [];
    for (let i = 0; i < ft.length; i++) if (sset.has(ft[i])) pos.push(i);
    const lo = pos.length ? pos[0] : -1, hi = pos.length ? pos[pos.length - 1] : -1;
    let classWords = null;
    for (let i = 0; i < ft.length; i++) {
      const w = ft[i];
      if (sset.has(w) || house.has(w)) continue;
      if (!CLASS_MARK.test(w)) return null;
      if (!INTERRUPT_WORD.test(w)) continue;            // not a word that renames a series
      if (i <= lo || i >= hi) continue;                 // trailing/leading: an ordinary class marker
      if (!classWords) {
        classWords = new Set();
        for (const c of best) for (const t of tokens(c.className)) classWords.add(t);
      }
      if (!classWords.has(w)) return null;              // part of another product's name
    }
    }
  }

  // MANAGER GATE. Two failures in review forced this: a series' leading token
  // is not its manager, so "VNGRD TOT STK MK IDX FD AD" matched a non-Vanguard
  // "Total Stock Market Index Trust", and "Government Bond Fund R6" -- which
  // names no manager at all -- was handed to American Century. A fund name
  // without an identifiable manager is not identifiable, full stop.
  // Series names are NOT unique across managers -- "SMALL CAP GROWTH FUND"
  // exists at American Century, DFA and others, and they all share one bucket.
  // Checking that SOME class in the bucket matches the manager let a DFA
  // filing satisfy the gate while an American Century class was handed back as
  // the answer. Filter the bucket to the manager the filing names, and let
  // only those classes supply the ticker.
  // The comparison must be on WHOLE TOKENS. `hay.includes("t")` is true of
  // almost every fund name in existence, so a substring test let a manager
  // gate built from short phrases pass anything; pad both sides so a phrase
  // only matches at token boundaries.
  let mine = classes.filter(mgrHit);
  /* Some registrants' legal names omit the house entirely: "GROWTH FUND OF
   * AMERICA" and "INVESTMENT COMPANY OF AMERICA" are American Funds funds and
   * say so nowhere, so they carry no manager key and the gate refuses them --
   * two of the largest funds held in 401(k) plans. Accept when the filed name
   * is exactly the series name plus a house name we DO recognise: every filed
   * token is either in the series, part of that house's name, or a share-class
   * marker. Nothing looser -- this is what keeps it from also accepting
   * "American Funds EuroPacific Growth Fund R6", whose "europacific" belongs
   * to none of the three and which is absent from the SEC file entirely. */
  if (!mine.length && classes.every((c) => !c.mgrKeys.length)
      && (filedMgrs.length || anonDistinct(tokens(classes[0].series), classes))) {
    const sset = new Set(tokens(classes[0].series));
    const house = new Set(filedMgrs.flatMap((m) => m.split(" ")));
    const ok = ft.every((w) => sset.has(w) || house.has(w)
      || /^(?:r[1-6]|k6|[akyzci]|investor|admiral|adv|advisor)$/.test(w));
    if (ok) mine = classes;
  }
  if (!mine.length) return null;
  classes = mine;

  const uniq = [...new Map(classes.map((c) => [c.ticker, c])).values()];
  if (uniq.length === 1) {
    return { ticker: uniq[0].ticker, comparable: pooled, why: pooled ? why + "+pooled" : why, series: uniq[0].series, className: uniq[0].className };
  }
  // several share classes -> does the filed name name one?
  /* A CLASS WORD THAT IS PART OF THE SERIES NAME CANNOT DISCRIMINATE BETWEEN
   * THAT SERIES' CLASSES. `Royce Premier Fund` and `Invesco Premier Portfolio`
   * are fund NAMES carrying the word; once `premier` became a class hint in
   * its own right it competed with the class those filings actually state, so
   * `ROYCE PREMIER INSTL` — which says Institutional in as many words — fell
   * through to the ambiguous branch and lost a correct answer. The series
   * already owns the word, so it carries no information about the class.
   * Same idiom as the leftover rule: a word is excused only when the index's
   * own evidence accounts for it.
   *
   * IT ONLY BREAKS TIES, and that restriction was forced by the pins. A first
   * draft filtered unconditionally and broke two of them: `Federated Hermes
   * Instl High Yield Bond` sits in the series `Institutional High Yield Bond
   * Fund`, so the series owns `institutional` and the filed name's ONLY class
   * signal was removed, dropping a pinned exact answer to an asterisk. When
   * the filing states one class word there is nothing to disambiguate and the
   * word is taken at face value; the filter fires only where a SECOND word
   * can carry the class instead. */
  let hs = hintsOf(filedName);
  if (hs.length > 1) {
    const seriesOwns = new Set(hintsOf(uniq[0].series || ""));
    const kept = hs.filter((k) => !seriesOwns.has(k));
    if (kept.length) hs = kept;
  }
  if (hs.length === 1) {
    /* MEMBERSHIP, NOT `c.hint`. `c.hint` is the FIRST hint in table order, and
     * a class name that embeds the fund name answers to the fund's words
     * first: every class of `Alger Capital Appreciation Institutional Fund`
     * is stored as `… Institutional Fund Class Y`, so all four carried the
     * hint `institutional` and a filing naming Class Y could not be matched.
     * Asking whether the class STATES the hint reads the whole name. */
    const hit = uniq.filter((c) => hintsOf(c.className).includes(hs[0]));
    if (hit.length === 1) {
      return { ticker: hit[0].ticker, comparable: pooled, why: why + (pooled ? "+pooled" : "+class"), series: hit[0].series, className: hit[0].className };
    }
  } else if (hs.length > 1) {
    /* The filed name states TWO class words. Only a class that accounts for
     * BOTH is an answer; anything else is a guess between them, and a guess
     * about the class is a guess about the FEE. When none does, this falls
     * through to the ambiguous branch below and the asterisk goes on, which
     * is the honest form of "the fund is identified and the class is not". */
    const hit = uniq.filter((c) => { const s = new Set(hintsOf(c.className)); return hs.every((k) => s.has(k)); });
    if (hit.length === 1) {
      return { ticker: hit[0].ticker, comparable: pooled, why: why + (pooled ? "+pooled" : "+class"), series: hit[0].series, className: hit[0].className };
    }
  }
  // AMBIGUOUS: the fund is identified, the class is not. Prefer a retail class
  // as the representative and mark it comparable so the page shows the asterisk.
  // a retail class is the honest representative when the filing names none;
  // American Funds has no Investor class, so Class A is its retail face and
  // picking uniq[0] handed back whichever R-class happened to sort first
  const rep = uniq.find((c) => c.hint === "investor") || uniq.find((c) => c.hint === "a")
    || uniq.find((c) => c.hint === "admiral") || uniq.find((c) => c.hint === "institutional") || uniq[0];
  return { ticker: rep.ticker, comparable: true, why: why + "+ambiguous", series: rep.series, className: rep.className, classes: uniq.length };
}

/* PINNED CASES — must-change and must-keep in ONE table, so a control that
 * stops reaching the rule it guards is visible rather than silently green.
 * Run: node scripts/match-sec-tickers.mjs --selftest
 * Negative control: check out the previous revision of this file and run the
 * same table against it — it must fail by name on the four `null` rows and
 * hold every other. A guard whose negative control passes has not been tested.
 * `*` means comparable (the asterisk the page renders), `—` means refused. */
const SELFTEST = [
  // the institutional series published as the retail one, asserted as fact
  ["Vanguard Institutional Target Retirement 2070 Fund Institutional Shares", "—"],
  ["Vanguard Institutional Target Retire 2020", "—"],
  ["Vanguard Institutional Target Retirement 2040 Fund", "—"],
  // two class words stated; neither class accounts for both
  ["Principal Real Estate Securities Instl R6", "PRRAX*"],
  // a footnote marker in brackets is not a share class
  ["Invesco Diversified Dividend Fund R5 Class (i)", "DDFIX"],
  ["Fidelity Freedom Index 2050 Fund Investor Class (i)", "FIPFX"],
  // …but two REAL class words still refuse
  ["Fidelity Freedom Index 2050 Fund Investor Class K", "FIPFX*"],
  /* MOVED FROM PRRIX* TO A REFUSAL, deliberately, and the pin records why so
   * the change is not read later as drift. There is no "PIMCO Real Return
   * Strategy Fund": there is PIMCO Real Return (PRRIX) and PIMCO COMMODITY
   * Real Return STRATEGY (PCRIX), and this file's own comment already names
   * that pair as a shipped defect. `strategy` is an asset word, so it stopped
   * being excusable as a house word — and a leftover asset word means the
   * filing may mean the other fund. */
  ["Pimco Real Return Strategy Fund Inst Class A", "—"],
  // "Premier" is this fund's NAME; recorded as a residual, pinned so a later
  // change to the institutional arm of CLASS_HINTS shows up here
  ["ROYCE PREMIER FUND INV CL", "RPFIX*"],
  // the class name itself carries both stated words -> assertable
  ["Alger Capital Appreciation Institutional Fund Class I", "ALARX"],
  ["Alger Capital Appreciation Institutional Fund - Class Y", "ACAYX"],
  // controls: an interrupting word that IS a class, per the index's own naming
  ["Fidelity Advisor Mid Cap Value Fund Class Z", "FIDFX"],
  ["Fidelity Advisor Equity Income Fund - Class A", "FEIAX"],
  // controls: ordinary resolutions that must not move
  ["Vanguard Explorer Fund: Admiral Shares", "VEXRX"],
  ["Federated Hermes Instl High Yield Bond", "FIHBX"],
  ["American Funds Capital World Growth and Income R-6", "RWIGX"],
  ["Fidelity 500 Index Fund", "FXAIX"],
  ["Pimco Income Institutional Fund", "PIMIX"],
  ["Vanguard Small Cap Value Index Admiral", "VSIAX"],
  ["Fidelity Freedom Index 2035 Fund;Investor", "FIHFX"],
  ["Vanguard Target Retirement 2070 Fund", "VSVNX"],
  // a trust edition is the comparable, never the fund
  ["VANGUARD TGT RET 2025 TRUST", "VTTVX*"],
  ["Massachusetts Investors Trust Class R4", "MITDX*"],
  /* A WORD THAT SAYS WHAT THE FUND HOLDS IS NOT A HOUSE WORD. Each of these
   * returned a DIFFERENT fund because the junk manager vocabulary excused the
   * discriminator: the answer is named in the comment beside it. */
  ["Vanguard SmallCap Value Index Fund", "—"],              // was VIVAX, the LARGE-cap value fund
  ["Vanguard Smallcap Index Fund Institutional", "—"],      // was VINIX, an S&P 500 fund
  ["Vanguard Short-Term Inflation-Protected Securities", "—"], // was VIPSX, the INTERMEDIATE TIPS fund
  ["American Funds World Growth and Income Fund", "—"],     // was the Growth AND INCOME Portfolio
  // …and the controls that prove it is not a blanket refusal
  ["American Funds SMALLCAP World Fund R6", "RLLGX"],       // `smallcap` is IN this series' name
  ["Vanguard Small-Cap Value Index Fund Admiral Shares", "VSIAX"],
  ["Vanguard Mid-Cap Index Fund Institutional", "VIMSX*"],
  ["Vanguard Short Term Bond Index Fund", "VBISX*"],
  ["American Funds Capital World Growth and Income R6", "RWIGX"],
  /* A DESCRIPTIVE SERIES NAME MUST NOT MANUFACTURE A HOUSE. Homestead's series
   * is the bare `Short-Term Bond Fund`, and while `short term` counted as one
   * of its manager keys every house's short-term bond fund satisfied the gate
   * and was handed HOSBX. The first three must refuse; the fourth is the
   * must-keep control, a real Vanguard series that states the same words. */
  ["Vanguard Short-Term Bond", "—"],
  ["Victory Short Term Bond Fund R6 Shares", "—"],
  ["Short Term Bond Fund", "—"],
  ["TIAA-CREF Short-Term Bond Inst", "—"],
  /* …and these must keep, because their series names are NOT all-descriptive:
   * `new world` and `american balanced` survive the same rule that removes
   * `short term`, which is what keeps two of the largest funds held in 401(k)
   * plans resolving from registrants that name no house. */
  ["American Funds New World R6", "RNWGX"],
  ["American Funds American Balanced R6", "RLBGX"],
  ["American Funds Growth Fund of America R6", "RGAGX"],
  /* THE FILED NAME NAMES NO HOUSE AND NEITHER DOES THE REGISTRANT. American
   * Funds' three flagships are registered as `GROWTH FUND OF AMERICA`, `BOND
   * FUND OF AMERICA` and `INCOME FUND OF AMERICA`, and a filing that writes
   * only that plus a class names no manager either — so both sides of the gate
   * were empty and 203 rows resolved to nothing. They are safe because the
   * series key keeps `america`; Homestead's `short term bond` keeps nothing,
   * which is the pair the rule has to separate and the reason the four
   * refusals above are pinned beside these. */
  ["GROWTH FUND OF AMERICA R6", "RGAGX"],
  ["The Bond Fund of America R6", "RBFGX"],
  ["INCOME FUND OF AMERICA R6", "RIDGX"],
  ["Short-Term Bond Fund Of America;R4", "RAMEX"],
  ["The Growth Fund of America R3", "RGACX"],
  /* …and the must-keeps that a first draft of the same rule DESTROYED: the
   * distinctive-key test is asked only when the filed name names no house,
   * because `International Growth and Income` is three descriptive words and
   * demanding a distinctive key there withdrew 127 correct rows. */
  ["American Funds International Growth and Income R6", "RIGGX"],
  /* The same fund with the house NOT in the filed name refuses on its own —
   * `international growth income` is entirely descriptive and names nobody —
   * and is resolved by the issuer cell instead, pinned in the issuer table.
   * This expectation was written the other way round and the selftest caught
   * it: the rule is about what the STRING can discriminate, not about which
   * fund a reader knows is meant. */
];

/* THE ISSUER CELL, pinned separately because it is a CALLER rule and the
 * table above tests `resolve` alone. Negative control: the old caller pattern
 * (`resolve(name) || resolve(issuer + " " + name)`) must fail on the first. */
const SELFTEST_ISS = [
  ["BlackRock High Yield Portfolio K Fund", "Principal Trust Company", "—"],
  ["Columbia Small Cap Value Fund", "Empower Trust Company, LLC", "—"],
  ["Invesco Core Bond r6", "Vanguard", "—"],
  ["Janus Balanced Fund", "Fidelity", "—"],
  ["American Century Growth R6", "American Funds", "—"],
  // the issuer ADDING a manager the filed name does not state — all must keep
  ["Core Plus BD R6", "Carillon Reams", "SCPWX"],
  ["S&P Small Cap 600 Index Fund Inv", "Empower", "MXISX"],
  /* WAS PINNED FFPFX* AND THE EXPECTATION WAS WRONG, not the code. FFPFX is
   * `Premier Class`; FFFHX is the base `Fidelity Freedom 2050 Fund` share
   * class. The filing names no class, so this branch is choosing a
   * REPRESENTATIVE, and its own comment says to prefer a retail one. FFPFX
   * only won because `premier` used to answer the `institutional` finder. */
  ["Freedom Fund 2050", "Fidelity", "FFFHX*"],
  ["Fidelity Inflation Protected Bond Index Fund", "Empower Trust Company, LLC", "FIPDX"],
  ["Fidelity 500 Index Fund", "Empower Trust Company, LLC", "FXAIX"],
  /* WAS PINNED FIHAX*, which is `Class A Shares` behind an asterisk — a
   * representative guess for a filing that states R6 in as many words. FIHLX
   * IS `Class R6 Shares` of that series. Reading the stated class is the whole
   * point of reading the class at all. */
  ["Institutional High Yield Bond Fund R6", "Federated Hermes", "FIHLX"],
  // the issuer's own words must not be stripped as asset words: `financial`
  // is a SECTOR word and is half of Prudential's legal name
  ["PGIM High Yield Fund", "Prudential Financial, Inc.", "PBHAX*"],
  ["PGIM Total Return BD R6", "Prudential Financial", "PTRQX"],
  /* Once the filed name stops resolving to Homestead on its own, the issuer
   * path reaches the house the filing actually names. All three were HOSBX. */
  ["Short Term Bond Fund", "Fidelity", "FBNAX*"],
  ["Short-Term Bond Fund", "T. Rowe Price", "PRWBX*"],
  ["Short Term Bond Fund Class R6", "Transamerica", "TASTX"],
  // the house-less registrant reached through the issuer cell instead
  ["International Growth and Income Fund R6", "American Funds", "RIGGX"],
  /* SHARE CLASSES THAT COLLAPSED ONTO ONE HINT. Fidelity Freedom Index runs
   * Investor / Institutional Premium / Premier / Premier II; with `premier`
   * folded into the `institutional` arm, three of them answered the same hint
   * and none could be selected. must-CHANGE: */
  ["FID FREEDOM INDEX 2050 PREMIER", "", "FRLPX"],
  ["Fidelity Freedom Index 2050 Fund Institutional Premium Class", "", "FFOPX"],
  /* PINNED AS A KNOWN RESIDUE, NOT FIXED HERE. `Instl Prem` is refused before
   * the class stage: `prem` is not a class marker, so the leftover check
   * rejects the whole name. Widening CLASS_MARK is its own change with its own
   * blast radius and does not belong in this commit. Roughly 1,350 rows across
   * the Freedom Index vintages wait on it; when it is fixed this pin fails and
   * should become FFOPX. */
  ["Fidelity Freedom Index 2050 Instl Prem", "", "—"],
  /* must-KEEP AMBIGUOUS — the filing states NO class, and asserting one here
   * is the defect that withdrew 10,387 fee cells on 2026-09-28: */
  ["Fidelity Freedom Index 2050 Fund", "", "FIPFX*"],
  ["T. Rowe Price Retirement 2040 Fund", "", "TRRDX*"],
  /* the series OWNS the word `premier`, so it cannot name a class of itself;
   * the class the filing really states must still win: */
  ["ROYCE PREMIER INSTL", "", "RPFIX"],
  ["Invesco Premier US Government Money Inst", "", "IUGXX"],
  ["Royce Premier Fund", "", "RPFIX*"],
  /* and Premier must never be handed to a filing that says Institutional:
   * this series has NO institutional class (R6 / Premier / Retirement / I) */
  ["Nuveen Lifecycle Index 2030 Inst", "", "TLHIX*"],
  /* `of American` — a FILED typo that names a different real fund. The first
   * two were published as RGWGX / RGPCX, classes of `American Funds Growth
   * Portfolio`; the rest had no ticker at all. The issuer-cell cases are here
   * rather than in SELFTEST because the repaired name has to reach the whole
   * caller rule, which a first draft did not. */
  ["American Funds the Growth Fund of American Class R-6", "", "RGAGX"],
  ["Growth Fund of American-R3", "American Funds", "RGACX"],
  ["American Funds Bond Fund of American R6", "", "RBFGX"],
  ["Bond Fund of American R6", "American Funds", "RBFGX"],
  ["Income Fund of American R6", "", "RIDGX"],
  ["American Growth Fund of American R4", "American Funds", "RGAEX"],
  ["The Bond Fund of American R-6", "", "RBFGX"],
  /* MUST REFUSE THE REPAIR — every one continues a real entity with a proper
   * noun, which is the whole discriminator. `Best of American Fixed` is a
   * genuine misspelling of Nationwide's `Best of America` and is refused
   * anyway: under-repair is the safe direction. */
  ["of American Airlines, Inc. and Affiliates, at fair value", "", "—"],
  ["Group Annuity Contract of American United Life Insurance Company AUL Fixed Fund", "", "—"],
  ["The Premier Trust Fund of American Trust Company", "", "—"],
  ["Best of American Fixed", "", "—"],
  ["Mutual of American Small Cap Growth Fund", "", "—"],
  /* and the correct spelling must be untouched by any of it */
  ["American Funds The Growth Fund of America R6", "", "RGAGX"],

  /* THE MAGNET SERIES KEY. `American Funds Growth Portfolio` keeps only
   * {american, growth}, so every American Funds growth-ish filed name is a
   * superset of it. Must REFUSE — none of these says `Portfolio`: */
  ["American Funds Growth Fund R6", "", "—"],
  /* THE HOUSE COMES FROM THE ISSUER CELL ON THIS ONE, and the pin carries it
   * for that reason: written with an empty issuer the bare `Growth Fund R6`
   * refuses on its own and the case never reaches the new rule at all — it
   * would have passed both before and after, the decorative control this
   * record has now been caught writing twice. The store's row has
   * `iss = "American Funds"`, which supplies the house and makes it resolve. */
  ["Growth Fund R6", "American Funds", "—"],
  ["Growth Fund R4", "American Funds", "—"],
  ["American Funds Growth R3", "", "—"],
  ["AF GRTH & INC R6", "", "—"],
  ["American Funds EUPAC Growth R6", "", "—"],
  ["American Funds New Perspective Growth Fund", "", "—"],
  ["JPMORGAN GRWTH ADV FUND SELECT CLASS af", "", "—"],
  /* …and must KEEP, because the filing states the registrant's own word: */
  ["American Funds Growth Portfolio R6", "", "RGWGX"],
  ["American Funds Growth Portfolio Class R-4", "", "RGWEX"],
  /* TWO ASSET WORDS AFTER THE HOUSE IS REMOVED NAME A PRODUCT, so the rule is
   * never asked. These are the family whose withdrawal killed two earlier
   * drafts of it: Dimensional registers every series as a `Portfolio` and
   * filings write `Fund` or nothing at all. */
  ["DFA Global Equity I", "", "DGEIX"],
  ["DFA International Small Company Fund", "", "DFISX"],
  ["DFA US Targeted Value I", "", "DFFVX"],
  ["DFA International Value I Fund", "", "DFIVX"],
  /* ONE asset word left, and untouched, because the registrant's own word is
   * `Fund` and so is the filing's — the pair that shows the gate is the
   * vehicle noun and not the key length. */
  ["Fidelity Balanced Fund Class K", "", "FBAKX"],
  /* a Growth and Income filing still reaches Growth and Income: two asset
   * words survive the house, so the rule does not fire */
  ["American Funds Growth and Income Portfolio R6", "", "RGNGX"],
];

if (process.argv.includes("--selftest")) {
  const idx = buildIndex(INDEX);
  let bad = 0, n = 0;
  for (const [name, want] of SELFTEST) {
    n++;
    const r = resolve(idx, name);
    const got = r ? r.ticker + (r.comparable ? "*" : "") : "—";
    if (got !== want) { bad++; console.log(`FAIL want ${want.padEnd(8)} got ${got.padEnd(8)} ${name}`); }
  }
  for (const [name, iss, want] of SELFTEST_ISS) {
    n++;
    const r = resolveHolding(idx, name, iss);
    const got = r ? r.ticker + (r.comparable ? "*" : "") : "—";
    if (got !== want) { bad++; console.log(`FAIL want ${want.padEnd(8)} got ${got.padEnd(8)} ${name}  [iss ${iss}]`); }
  }
  console.log(bad ? `\n${bad} of ${n} FAILED` : `selftest: ${n}/${n} ok`);
  process.exit(bad ? 1 : 0);
}

if (process.argv[1] && process.argv[1].endsWith("match-sec-tickers.mjs")) {
  const idx = buildIndex(INDEX);
  console.log(`SEC index: ${idx.rows.toLocaleString()} class rows, ${idx.bySeries.size.toLocaleString()} distinct series`);
  console.log(`  generated ${idx.generated}\n  ${idx.source}\n`);

  const excl = (f) => /brokerage|self-directed|participant loan|company stock|employer (security|stock)|stable value|guaranteed|\bgic\b|annuity/i.test((f.type || "") + " " + f.name) || !f.type || f.type === "-";
  let rows = 0, exact = 0, amb = 0;
  const hits = [];
  for (let i = 0; i < 64; i++) {
    const p = path.join(root, "data/lineups", String(i).padStart(2, "0") + ".json");
    if (!fs.existsSync(p)) continue;
    const shard = JSON.parse(fs.readFileSync(p, "utf8"));
    for (const ack of Object.keys(shard)) {
      const e = shard[ack];
      if (!e.confident || !e.funds) continue;
      for (const f of e.funds) {
        if (excl(f)) continue;
        rows++;
        const r = resolve(idx, f.name);
        if (!r) continue;
        if (r.comparable) amb++; else exact++;
        if (hits.length < 200000) hits.push([f.name, r]);
      }
    }
  }
  console.log(`fund-like rows: ${rows.toLocaleString()}`);
  console.log(`  exact ticker : ${exact.toLocaleString()}  (${(100 * exact / rows).toFixed(1)}%)`);
  console.log(`  ambiguous(*) : ${amb.toLocaleString()}  (${(100 * amb / rows).toFixed(1)}%)`);
  console.log(`  TOTAL matched: ${(exact + amb).toLocaleString()}  (${(100 * (exact + amb) / rows).toFixed(1)}%)\n`);

  // deterministic pseudo-random sample for hand review
  let seed = 12345;
  const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
  const pick = [];
  for (let i = 0; i < SAMPLE && hits.length; i++) pick.push(hits[Math.floor(rnd() * hits.length)]);
  console.log(`RANDOM SAMPLE OF ${pick.length} — check each filed name against the SEC series it resolved to:\n`);
  for (const [name, r] of pick) {
    console.log(`  filed : ${name}`);
    console.log(`  SEC   : ${r.series}${r.className ? "  [" + r.className + "]" : ""}`);
    console.log(`  ->      ${r.ticker}${r.comparable ? "*" : ""}   (${r.why}${r.classes ? ", " + r.classes + " classes" : ""})\n`);
  }
}
