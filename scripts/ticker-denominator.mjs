#!/usr/bin/env node
/* wampo — what share of filed holdings CAN carry a ticker, and where the real
 * gap is.
 *
 * WHY THIS EXISTS. The target was "90% of funds listed are ticker matched or
 * labeled (comparable fund)". Measured against every holding row, that number
 * is not reachable, and reporting a single percentage hides why: a large part
 * of the denominator is rows for which no ticker exists in the world —
 * participant loans, employer stock, stable-value/GIC wrappers, brokerage
 * windows, cash sweeps — plus parser junk that names no fund at all. Counting
 * those as "missing coverage" would make the number look bad for the wrong
 * reason; silently dropping them would make it look good for the wrong reason.
 *
 * So this classifies EVERY row in every confident lineup into one of:
 *
 *   matched-exact       a registered fund, ticker asserted as fact
 *   matched-comparable  a pooled vehicle (CIT/separate account) shown with a
 *                       registered analogue and an asterisk
 *   no-ticker-exists    loans, employer stock, stable value/GIC/annuity,
 *                       brokerage windows, cash — a ticker would be invented
 *   unidentifiable      the filed string names no manager and no strategy we
 *                       can key on (terse recordkeeper codes, parser junk)
 *   GAP-registered      names a manager, is not pooled, and we still missed it
 *   GAP-pooled          names a manager, is pooled, and we found no comparable
 *
 * The last two are the only rows that represent work left to do. Everything
 * else is either done or honestly out of reach, and the report prints both
 * denominators so the coverage figure can't be quoted without its base.
 *
 * Usage: node scripts/ticker-denominator.mjs --index <sec-funds.json> [--gaps 40]
 */
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { buildIndex, resolve, norm } from "./match-sec-tickers.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const INDEX = arg("--index", path.join(root, "sec-funds.json"));
const NGAPS = +arg("--gaps", 40);

// fund-er.js runs in a sandbox so the hand-written patterns count too — the
// two sources together are what the site actually shows.
const ctx = { console };
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(root, "fund-er.js"), "utf8")
  + "\nglobalThis.__t = fundTickerInfo;", ctx);
const patternTicker = ctx.__t;

/* ---- classes of row that cannot carry a registered ticker -------------------
 * Each of these is a real thing a plan holds, and none of them has a public
 * ticker or a defensible registered analogue:
 *   - a participant loan is a receivable, not a fund
 *   - employer stock has a ticker, but it is the SPONSOR's, handled elsewhere
 *     on the page from plan.ticker rather than from a fund table
 *   - stable value / GIC / guaranteed / annuity contracts are insurance
 *     products priced per contract; a bond fund is not a comparable
 *   - a brokerage window is an account, and its contents are not disclosed
 *   - cash and short-term sweeps at a trustee are not a registered fund */
const NO_TICKER = [
  [/participant loan|loans? to participants|maturing through|notes? receivable/i, "participant loans"],
  [/company stock|employer (?:security|stock)|common stock fund|esop|unitized stock/i, "employer stock"],
  [/stable value|guaranteed|\bgic\b|annuity|tiaa traditional|guaranteed (?:income|interest)|general account|retirement savings trust/i, "stable value / insurance"],
  [/brokerage|self-directed|\bsdba\b|brokeragelink|personal choice|schwab pcra/i, "brokerage window"],
  // wampo's own label for the innards of a managed account, not a filed fund
  [/^managed account holdings|^managed by |\(\d+ positions\)/i, "managed account"],
  [/^\s*cash\b|cash equivalent|money market|short.?term investment fund|\bstif\b|interest.?bearing/i, "cash / sweep"],
  [/real estate|property fund|\breit\b.*(?:separate|collective)|hedge fund|private equity|limited partnership/i, "private / real asset"],
];

const pooledRe = /\btrust\b|\bcollective\b|\bcommingled\b|\bpool\b|\bcit\b|separate account|\bunitized\b|\bcommon\/collective\b/i;

/* A row is IDENTIFIABLE when its filed string names a fund manager. That is
 * the same gate the matcher uses to refuse a guess, so it is the honest
 * boundary between "we missed this" and "this string does not say what it is".
 * Built from the SEC registrant vocabulary, so it needs no hand-kept list. */
function managerNamed(idx, name) {
  const hay = " " + norm(name) + " ";
  for (const m of idx.managers) if (hay.includes(" " + m + " ")) return m;
  return null;
}

// idx.managers is the matcher's own vocabulary. Re-deriving it here once let
// the two drift: this script counted rows as "identifiable" that the matcher's
// gate would never accept, which flatters the denominator. Use its set.
const idx = buildIndex(INDEX);

const bucket = {};
const dollars = {};
const add = (k, v) => { bucket[k] = (bucket[k] || 0) + 1; dollars[k] = (dollars[k] || 0) + (v || 0); };

// ranked gap families, so the next pass has a work list rather than a number
const gapFam = {};
const famKey = (n) => String(n)
  .replace(/\b(class|cl|cls)\s*[a-z0-9]{1,3}\b/gi, "")
  .replace(/\b(fund|trust|pool|portfolio|port|index|idx|inst(itutional)?|adm(iral)?|collective|acct|account)\b/gi, " ")
  .replace(/\b(19|20)\d\d\b/g, "<year>")
  .replace(/[^A-Za-z<> ]/g, " ").replace(/\s+/g, " ").trim().toLowerCase()
  .split(" ").slice(0, 3).join(" ");

let total = 0, plans = 0;
for (let i = 0; i < 64; i++) {
  const p = path.join(root, "data/lineups", String(i).padStart(2, "0") + ".json");
  if (!fs.existsSync(p)) continue;
  const shard = JSON.parse(fs.readFileSync(p, "utf8"));
  for (const ack of Object.keys(shard)) {
    const e = shard[ack];
    if (!e.confident || !e.funds) continue;
    plans++;
    for (const f of e.funds) {
      total++;
      const name = String(f.name || "");
      const hay = (f.type || "") + " " + name;
      const v = f.value || 0;

      let structural = null;
      for (const [re, label] of NO_TICKER) if (re.test(hay)) { structural = label; break; }
      if (structural) { add("no-ticker:" + structural, v); continue; }

      const pat = patternTicker(name, f.type);
      const sec = pat ? null : resolve(idx, name);
      const hit = pat || sec;
      if (hit) { add(hit.comparable ? "matched-comparable" : "matched-exact", v); continue; }

      const mgr = managerNamed(idx, name);
      if (!mgr) { add("unidentifiable", v); continue; }

      const pooled = pooledRe.test(name);
      add(pooled ? "GAP-pooled" : "GAP-registered", v);
      const k = famKey(name);
      if (!k || k.length < 4) continue;
      const g = (gapFam[k] = gapFam[k] || { n: 0, v: 0, pooled: 0, ex: new Set() });
      g.n++; g.v += v; if (pooled) g.pooled++;
      if (g.ex.size < 3) g.ex.add(name);
    }
  }
}

const pct = (n, d) => d ? (100 * n / d).toFixed(1) + "%" : "—";
const B = (n) => "$" + (n / 1e9).toFixed(1) + "B";
const rowsOf = (pre) => Object.entries(bucket).filter(([k]) => k.startsWith(pre))
  .reduce((a, [, n]) => a + n, 0);

const structural = rowsOf("no-ticker:");
const matched = (bucket["matched-exact"] || 0) + (bucket["matched-comparable"] || 0);
const unident = bucket["unidentifiable"] || 0;
const gap = (bucket["GAP-registered"] || 0) + (bucket["GAP-pooled"] || 0);
const identifiable = matched + gap;

console.log(`confident lineups: ${plans.toLocaleString()}   holding rows: ${total.toLocaleString()}\n`);
console.log("EVERY ROW");
for (const k of Object.keys(bucket).sort((a, b) => bucket[b] - bucket[a])) {
  console.log(`  ${k.padEnd(34)} ${String(bucket[k]).padStart(9)}  ${pct(bucket[k], total).padStart(6)}  ${B(dollars[k]).padStart(10)}`);
}

console.log(`\nTHE THREE DENOMINATORS`);
console.log(`  all rows                    ${String(total).padStart(9)}   matched ${pct(matched, total)}`);
console.log(`  minus rows with no ticker   ${String(total - structural).padStart(9)}   matched ${pct(matched, total - structural)}`);
console.log(`     (loans, employer stock, stable value, brokerage, cash)`);
console.log(`  IDENTIFIABLE (names a mgr)  ${String(identifiable).padStart(9)}   matched ${pct(matched, identifiable)}`);
console.log(`\n  work left: ${gap.toLocaleString()} rows (${B(dollars["GAP-registered"] + dollars["GAP-pooled"])}) — ` +
  `${(bucket["GAP-registered"] || 0).toLocaleString()} registered, ${(bucket["GAP-pooled"] || 0).toLocaleString()} pooled`);
console.log(`  out of reach: ${unident.toLocaleString()} rows name no manager; ${structural.toLocaleString()} rows have no ticker to name`);

console.log(`\nTOP GAP FAMILIES (a work list, not a score)`);
for (const [k, g] of Object.entries(gapFam).sort((a, b) => b[1].v - a[1].v).slice(0, NGAPS)) {
  console.log(`  ${B(g.v).padStart(9)} ${String(g.n).padStart(6)} rows  ${g.pooled === g.n ? "pooled " : g.pooled ? "mixed  " : "reg'd  "} ${k}`);
  for (const ex of g.ex) console.log(`              ${ex}`);
}
