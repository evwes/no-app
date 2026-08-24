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
  ["institutional", /\binstitutional\b|\binst\b|\bpremier\b/],
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

const hintOf = (s) => { const t = norm(s); for (const [k, re] of CLASS_HINTS) if (re.test(t)) return k; return null; };

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
  "target", "retirement", "total"]);
function managerPhrase(entity) {
  const t = norm(entity).split(" ").filter(Boolean);
  if (!t.length) return null;
  let n = 1;
  // extend while the phrase so far cannot stand for a house on its own
  while (n < 3 && t.length > n
    && (t.slice(0, n).join(" ").length <= 4
      || (n === 1 && (GENERIC_LEAD.has(t[0]) || STRUCTURAL.has(t[0]))))) n++;
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

/* Resolve one filed holding name. Returns null, or
 * { ticker, comparable, why, series, className } */
export function resolve(idx, filedName) {
  const memoKey = norm(filedName);
  if (idx.memo && idx.memo.has(memoKey)) return idx.memo.get(memoKey);
  const out = resolveUncached(idx, filedName);
  if (idx.memo) idx.memo.set(memoKey, out);
  return out;
}

function resolveUncached(idx, filedName) {
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
  if (!filedMgrs.length) return null;
  const mgrHit = (c) => c.mgrKeys.some((k) => filedMgrs.includes(k));

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
        /* A series whose whole name is generic finance words identifies
         * nothing. "American Funds Growth Portfolio" reduces to the key
         * "american growth", which is a subset of "American Funds EuroPacific
         * Growth Fund R6" and of "American Funds Growth Fund of America R6" --
         * two different funds, neither of them it. EuroPacific is not in the
         * SEC file at all, so the honest answer there is nothing. */
        if (st.every((x) => GENERIC_LEAD.has(x) || ASSET_WORDS.has(x) || STRUCTURAL.has(x))) continue;
        const score = st.length * 1000 + st.join("").length;
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
        if (!all || !list.some(mgrHit)) continue;
        uniq.set(st.join(" "), list);
        if (uniq.size > 1) break;
      }
      if (uniq.size !== 1) return null;
      classes = [...uniq.values()][0];
      why = "year-pinned";
    } else {
    classes = best; why = "superset";
    // A superset match must not drop a DISCRIMINATOR. "BLACKROCK RUSSELL 2000
    // VAL IDX FD" is not "Russell 2000 Fund" -- value/index change which
    // product it is, and a subset match silently discards them. If the filing
    // states a discriminator the series does not, they are different funds.
    const sset = new Set(bestKey);
    for (const w of ft) {
      if (!ASSET_WORDS.has(w) && !/^(19|20)\d\d$/.test(w)) continue;
      if (!sset.has(w)) return null;
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
  if (!mine.length && classes.every((c) => !c.mgrKeys.length)) {
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
  const h = hintOf(filedName);
  if (h) {
    const hit = uniq.filter((c) => c.hint === h);
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
