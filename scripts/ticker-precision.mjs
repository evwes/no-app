#!/usr/bin/env node
/* wampo — stratified precision sample for the SEC ticker matcher.
 *
 * Coverage numbers are cheap and precision is the whole product, so nothing
 * from match-sec-tickers.mjs ships without a pass through this. It samples
 * matched holdings STRATIFIED BY MATCH REASON, because each reason fails
 * differently and an unstratified sample drowns the rare-but-wrong paths in
 * the common-and-right ones:
 *
 *   exact        the normalized names are identical — fails only on genuine
 *                name collisions between managers
 *   superset     the series name is a subset of the filed name — fails by
 *                dropping a word that changed which product it is
 *   year-pinned  the filed name is shorter than the series — fails if two
 *                products in one manager-year were not really distinguished
 *   +class       a share class was read off the filed name — fails by
 *                picking the wrong class, which misstates the FEE
 *   +ambiguous   several classes, none named — never asserted as fact, shown
 *                with the asterisk, so a "wrong" one here is a fee estimate
 *                rather than a false claim
 *
 * Read every line and ask one question: is the series on the right the fund
 * the filing on the left is talking about? Anything where the manager or the
 * strategy differs is a defect, not a near miss.
 *
 * Usage: node scripts/ticker-precision.mjs --index <sec-funds.json> [--n 12]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildIndex, resolve } from "./match-sec-tickers.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const N = +arg("--n", 12);
const idx = buildIndex(arg("--index", path.join(root, "sec-funds.json")));

const excl = (f) => /brokerage|self-directed|participant loan|company stock|employer (security|stock)|stable value|guaranteed|\bgic\b|annuity|maturing through/i
  .test((f.type || "") + " " + f.name);

// reservoir sample per stratum, so a rare reason is represented as fully as a
// common one and the sample does not depend on shard order
let seed = 20260823;
const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
const strata = new Map();
const seen = new Set();
let n = 0;

for (let i = 0; i < 64; i++) {
  const p = path.join(root, "data/lineups", String(i).padStart(2, "0") + ".json");
  if (!fs.existsSync(p)) continue;
  const shard = JSON.parse(fs.readFileSync(p, "utf8"));
  for (const ack of Object.keys(shard)) {
    const e = shard[ack];
    if (!e.confident || !e.funds) continue;
    for (const f of e.funds) {
      if (excl(f)) continue;
      const r = resolve(idx, f.name);
      if (!r) continue;
      n++;
      // one row per DISTINCT filed string: 200 plans filing the same name is
      // one fact to check, not 200, and duplicates would crowd out the tail
      const k = String(f.name).toLowerCase();
      if (seen.has(k)) continue;
      seen.add(k);
      const s = strata.get(r.why) || [];
      strata.set(r.why, s);
      if (s.length < N) s.push([f.name, r]);
      else { const j = Math.floor(rnd() * s.length * 3); if (j < N) s[j] = [f.name, r]; }
    }
  }
}

console.log(`matched holdings: ${n.toLocaleString()}   distinct filed names: ${seen.size.toLocaleString()}\n`);
for (const [why, rows] of [...strata].sort((a, b) => a[0].localeCompare(b[0]))) {
  console.log(`── ${why} ──`);
  for (const [name, r] of rows) {
    console.log(`  ${r.ticker.padEnd(6)}${r.comparable ? "*" : " "} ${String(name).slice(0, 52).padEnd(54)}`);
    console.log(`         SEC: ${r.series}${r.className && r.className !== r.series ? "  /  " + r.className : ""}`);
  }
  console.log("");
}
