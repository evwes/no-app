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
];
// words that carry no identity — dropped from BOTH sides before comparison
// "series" is deliberately NOT here: "Fidelity Series Bond Index Fund" is a
// different family from "Fidelity U.S. Bond Index Fund", and treating it as
// noise made the first a token-subset of the second (observed in review).
const NOISE = new Set(["fund", "funds", "the", "inc", "trust", "portfolio", "shares", "share",
  "class", "cl", "account", "of", "and", "co", "company", "lp", "llc", "incorporated"]);

function norm(s) {
  let t = String(s).toLowerCase()
    .replace(/[®™℠]/g, " ")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ").trim();
  for (const [re, full] of ABBREV) t = t.replace(re, full);
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

export function buildIndex(indexPath) {
  const j = JSON.parse(fs.readFileSync(indexPath, "utf8"));
  // series key -> [{ticker, className, hint, entity}]
  const bySeries = new Map();
  for (const [name, ticker, , className] of j.funds) {
    const [entity, series] = String(name).includes(" :: ") ? String(name).split(" :: ") : ["", String(name)];
    const key = tokens(series).join(" ");
    if (!key) continue;
    const list = bySeries.get(key) || [];
    list.push({ ticker, className: className || "", hint: hintOf(className || ""), entity, series });
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
  // "American Funds" and "American Century" are real managers even though
  // "american" is a generic lead -- a two-word manager phrase is kept whole.
  // Managers are PHRASES, not words. Taking the second token when the first is
  // generic put "growth" in the vocabulary (from "AMERICAN GROWTH TRUST"), and
  // "growth" then satisfied the manager gate for "American Funds The Growth
  // Fund of America" -- which resolved to the wrong fund entirely -- and for
  // the manager-less "Large Cap Growth II". A phrase cannot do that: the filed
  // name must literally contain "american growth" to match that registrant.
  for (const [name] of j.funds) {
    const ent = String(name).split(" :: ")[0];
    const et = tokens(ent);
    if (!et.length) continue;
    MANAGERS.add(GENERIC_LEAD.has(et[0]) && et[1] ? et[0] + " " + et[1] : et[0]);
  }
  return { bySeries, byLead, memo: new Map(), generated: j.generated, source: j.source, rows: j.funds.length };
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

  let classes = idx.bySeries.get(key);
  let why = "exact";
  if (!classes) {
    // token-superset: every series token present in the filed name, and the
    // series' leading (manager/family) token among them. Longest series wins,
    // so "vanguard 500 index" beats "vanguard index".
    let best = null, bestLen = 0, bestKey = [];
    for (const w of fset) {
      const cands = idx.byLead.get(w);
      if (!cands) continue;
      for (const [st, list] of cands) {              // sorted longest-first
        if (st.length < 2 || st.length <= bestLen) break;
        let all = true;
        for (const x of st) if (!fset.has(x)) { all = false; break; }
        if (all) { best = list; bestLen = st.length; bestKey = st; break; }
      }
    }
    if (!best) return null;
    classes = best; why = "superset";
    // A superset match must not drop a DISCRIMINATOR. "BLACKROCK RUSSELL 2000
    // VAL IDX FD" is not "Russell 2000 Fund" -- value/index change which
    // product it is, and a subset match silently discards them. If the filing
    // states a discriminator the series does not, they are different funds.
    const sset = new Set(bestKey);
    for (const w of ft) {
      if (!DISCRIMINATORS.has(w) && !/^(19|20)\d\d$/.test(w)) continue;
      if (!sset.has(w)) return null;
    }
  }

  // MANAGER GATE. Two failures in review forced this: a series' leading token
  // is not its manager, so "VNGRD TOT STK MK IDX FD AD" matched a non-Vanguard
  // "Total Stock Market Index Trust", and "Government Bond Fund R6" -- which
  // names no manager at all -- was handed to American Century. A fund name
  // without an identifiable manager is not identifiable, full stop.
  const filedNorm = " " + ft.join(" ") + " ";
  const filedMgrs = [];
  for (const m of MANAGERS) if (filedNorm.includes(" " + m + " ")) filedMgrs.push(m);
  if (!filedMgrs.length) return null;
  // Series names are NOT unique across managers -- "SMALL CAP GROWTH FUND"
  // exists at American Century, DFA and others, and they all share one bucket.
  // Checking that SOME class in the bucket matches the manager let a DFA
  // filing satisfy the gate while an American Century class was handed back as
  // the answer. Filter the bucket to the manager the filing names, and let
  // only those classes supply the ticker.
  const mine = classes.filter((c) => {
    const hay = norm(c.entity + " " + c.series);
    return filedMgrs.some((m) => hay.includes(m));
  });
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
  const rep = uniq.find((c) => c.hint === "investor") || uniq.find((c) => c.hint === "admiral") || uniq[0];
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
