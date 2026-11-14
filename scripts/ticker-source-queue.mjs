#!/usr/bin/env node
/* wampo — WHICH TICKERS TO SOURCE NEXT, IN READER ORDER.
 *
 * `fund-worklist.mjs` ranks fund NAMES, and that over-counts the work badly:
 * "Fidelity 500 Index Fund" (11.9M readers), "Fidelity 500 Index" (6.9M) and
 * "500 Index Fund" (4.2M) are three spellings of FXAIX, which is ALREADY
 * sourced, and its top entry -- "Self-Directed Brokerage Account", 24.9M -- is
 * not a fund at all. So the name list cannot say how much sourcing is left.
 *
 * This ranks by TICKER, over the rows the page actually publishes, and counts
 * only ADDRESSABLE work: a row must resolve a ticker, must not be a comparable
 * (a starred row publishes no fee and no return by the owner's standing
 * decision, whatever we source), and its ticker must carry no sourced facts.
 *
 * It sources nothing. A ticker, a fee and a return are FACTS THAT MUST BE
 * SOURCED, and `data/fund-facts.json` -- written only by the fund-facts agent,
 * with a URL and an as-of date per figure -- is the only place they may live.
 *
 * Run: node scripts/ticker-source-queue.mjs [--top 40]
 */
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildRenderer } from "./apppath.mjs";
import { loadPlans, loadFundFactsAsset } from "./lib-schema.mjs";
import { servedLineup } from "./lib-ledger.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const R = buildRenderer({ appjs: path.join(ROOT, "app.js") });
const lidx = JSON.parse(readFileSync(`${ROOT}/lineups-index.json`, "utf8")).plans;
const d = loadPlans();
R.setPlans(d.rows.map((r) => ({ sponsorName: d.get(r, "sponsorName"), ticker: d.get(r, "ticker") })));

/* FUND_FACTS exactly as the page parses it. Through the loader, not by slicing
 * the file between its outermost braces: that slice spanned BOTH objects the
 * moment FUND_VEHICLES was added and this script died at load. */
const FF = loadFundFactsAsset(path.join(ROOT, "fund-facts.js")).facts;
const nYtd = Object.values(FF).filter((v) => v && v.ytd != null).length;
console.log(`fund-facts.js: ${Object.keys(FF).length} tickers, ${nYtd} carry a ytd`);
/* MUST-SEE: without this every figure below is a clean zero reporting on the
 * query rather than on the data. */
if (nYtd < 50) throw new Error(`CONTROL FAILED: only ${nYtd} tickers carry a ytd`);

const members = new Map();
for (const row of d.rows) {
  const p = { ack: d.get(row, "ack"), mtiaAck: d.get(row, "mtiaAck"),
    ein: d.get(row, "ein"), pn: d.get(row, "pn"),
    participants: +d.get(row, "partEOY") || +d.get(row, "participants") || 0,
    sponsorName: String(d.get(row, "sponsorName") || "").trim(), ticker: d.get(row, "ticker") };
  const s = servedLineup(p, lidx);
  if (!s.ack) continue;
  if (!members.has(s.ack)) members.set(s.ack, []);
  members.get(s.ack).push(p);
}

/* THE TEN FUND HOUSES THE OWNER NAMED, in the order he listed them.
 *
 * HE NAMED THEM AS TARGET-DATE FAMILIES AND THE FIRST VERSION OF THIS LABELLED
 * THEM THAT WAY, WHICH WAS WRONG BY A FACTOR OF SIX. The regexes key on the
 * HOUSE, so under "Vanguard Target Retirement" the names it actually reached
 * were European Stock Index Admiral and Dividend Appreciation, and under
 * "BlackRock LifePath" they were iShares ETFs -- a house's whole lineup, not
 * its target-date ladder. Nothing counted it wrong; the label claimed something
 * the count does not support, which is the same defect as a published cell
 * claiming more than its filing. Found by READING the names the classifier
 * reached, which is why that print exists and why it stays.
 *
 * So both are measured now: `house` is the whole lineup (the right unit for a
 * SOURCING batch, since one house is one issuer site), and `td` is the
 * target-date ladder inside it (the thing the owner asked after). A count keyed
 * on a vocabulary measures the vocabulary, so `--families` still prints the
 * names reached and the unmatched residue. */
const FAMILIES = [
  ["Vanguard",            /\bvanguard\b/i,                                 /\btarget\s*ret/i],
  ["Fidelity",            /\bfidelity\b|\bfid\b|\bffidx?\b/i,              /\bfreedom\b/i],
  ["BlackRock",           /\bblackrock\b|\bblk\b|\blifepath\b|\bishares\b/i, /\blifepath\b/i],
  ["T. Rowe Price",       /\bt\.?\s*rowe\b|\btrp\b|\btroweprice\b/i,       /\bretirement\b|\bret\.?\s*(?:20|19)\d\d\b|\bblend\b/i],
  ["American Funds",      /\bamerican funds\b|\bcapital group\b|\bamcap\b/i, /\btarget\s*date\b|\b20[2-7]\d\s*trgt\b/i],
  ["State Street",        /\bstate street\b|\bssga\b|\bssg[ab]?\b/i,       /\btarget\s*ret/i],
  ["J.P. Morgan",         /\bj\.?\s*p\.?\s*morgan\b|\bjpmorgan\b|\bjpm\b/i, /\bsmart\s*ret/i],
  ["Principal",           /\bprincipal\b/i,                                 /\blife\s*time\b/i],
  ["Nuveen / TIAA",       /\bnuveen\b|\btiaa\b|\bcref\b/i,                 /\blife\s*cycle\b/i],
  ["Schwab / Am.Century", /\bschwab\b|\bamerican century\b/i,              /\btarget\b|\bone\s*choice\b/i],
];
const famOf = (nameRaw, iss) => {
  const hay = `${iss || ""} ${nameRaw || ""}`;
  for (const [label, re, td] of FAMILIES) if (re.test(hay)) return { label, td: td.test(hay) };
  return null;
};

const VERDICT = new Map();
const QUEUE = new Map();
const FAM = new Map();            // family label -> {tickers:Set, rows, plans:Set, ppl, names:Map}
let stockRows = 0;                // the page's OWN flag, not a name rule
const STOCK_TK = new Set();
let rows = 0, priced = 0, tkRows = 0, ytdRows = 0, starBlocked = 0;
const menus = [];
for (const sh of readdirSync(`${ROOT}/data/lineups`).sort()) {
  if (!sh.endsWith(".json")) continue;
  const shard = JSON.parse(readFileSync(`${ROOT}/data/lineups/${sh}`, "utf8"));
  for (const [ack, e] of Object.entries(shard)) {
    const mem = members.get(ack);
    if (!mem || !e || !e.confident || !Array.isArray(e.funds) || !e.funds.length) continue;
    const lead = mem[0];
    const total = e.funds.reduce((a, f) => a + (+f.value || 0), 0);
    let n = 0, val = 0;
    for (const raw of e.funds) {
      rows++;
      const f = { ...raw, nameRaw: String(raw.name || ""), name: R.clean(String(raw.name || "")) };
      const key = `${String(f.iss || "").trim()}\u0000${f.nameRaw}\u0000${String(f.type || "")}`;
      let r = VERDICT.get(key);
      if (r === undefined) { r = R.renderRow(lead, f, "menu", total); VERDICT.set(key, r); }
      if (!r) continue;
      if (r.er != null && r.er !== "") priced++;
      if (!r.tk) continue;
      tkRows++;
      /* THE QUEUE: a row that RESOLVES a ticker, is not a comparable, and whose
       * ticker carries no sourced facts. Those three conditions are what stands
       * between a reader and a figure -- a starred row is refused by the owner's
       * standing decision whatever we source, so it is not addressable work. */
      if (r.star) { starBlocked++; continue; }
      const key2 = String(r.tk).toUpperCase();
      const sf = FF[key2];
      if (sf && sf.ytd != null) { ytdRows++; n++; val += +raw.value || 0; continue; }
      let q = QUEUE.get(key2);
      if (!q) QUEUE.set(key2, q = { rows: 0, plans: new Set(), ppl: 0, val: 0, names: new Map() });
      q.rows++; q.val += +raw.value || 0;
      if (!q.plans.has(ack)) { q.plans.add(ack); q.ppl += mem.reduce((a, m) => a + m.participants, 0); }
      q.names.set(f.nameRaw, (q.names.get(f.nameRaw) || 0) + 1);

      /* EMPLOYER STOCK IS NOT A FUND. A work list built from filed names
       * contains them, because the HOLDING's name carries a custodian's name,
       * and a stock has no expense ratio and no fund YTD. Keyed on the page's
       * OWN row flag rather than on a ticker list of mine. */
      if (r.flags && r.flags.stockRow) { stockRows++; STOCK_TK.add(key2); }

      /* the owner's families, deduplicated per family so a plan holding five
       * unsourced Nuveen funds counts its readers once */
      const fam = famOf(f.nameRaw, f.iss);
      if (fam) {
        let g = FAM.get(fam.label);
        if (!g) FAM.set(fam.label, g = { tickers: new Set(), rows: 0, plans: new Set(), ppl: 0, names: new Map(),
          tdTickers: new Set(), tdRows: 0, tdPlans: new Set(), tdPpl: 0, tdNames: new Map() });
        g.tickers.add(key2); g.rows++;
        if (!g.plans.has(ack)) { g.plans.add(ack); g.ppl += mem.reduce((a, m) => a + m.participants, 0); }
        g.names.set(f.nameRaw, (g.names.get(f.nameRaw) || 0) + 1);
        if (fam.td) {
          g.tdTickers.add(key2); g.tdRows++;
          if (!g.tdPlans.has(ack)) { g.tdPlans.add(ack); g.tdPpl += mem.reduce((a, m) => a + m.participants, 0); }
          g.tdNames.set(f.nameRaw, (g.tdNames.get(f.nameRaw) || 0) + 1);
        }
      }
    }
    if (n) menus.push({ name: mem[0].sponsorName, ppl: mem.reduce((a, m) => a + m.participants, 0),
      n, of: e.funds.length, share: total ? val / total : 0 });
  }
}

/* ---- the queue ---- */
const top = (() => { const i = process.argv.indexOf("--top"); return i > 0 ? +process.argv[i + 1] : 40; })();
const q = [...QUEUE.entries()].map(([tk, v]) => ({ tk, rows: v.rows, plans: v.plans.size, ppl: v.ppl, val: v.val,
  name: [...v.names].sort((a, b) => b[1] - a[1])[0][0] }))
  .sort((a, b) => b.ppl - a.ppl);

const sourcedRows = ytdRows;
const addressable = q.reduce((a, x) => a + x.rows, 0);
console.log(`\npublished+served rows ${rows.toLocaleString()}  (ticker resolved on ${tkRows.toLocaleString()})`);
console.log(`  ALREADY sourced:                  ${sourcedRows.toLocaleString()} rows`);
console.log(`  refused as a COMPARABLE (starred): ${starBlocked.toLocaleString()} rows — NOT addressable at any amount of sourcing`);
console.log(`  ADDRESSABLE by sourcing:          ${addressable.toLocaleString()} rows across ${q.length.toLocaleString()} distinct tickers`);

let cum = 0;
const marks = [10, 25, 50, 100, 200, 500, 1000];
console.log(`\nCUMULATIVE ROWS GAINED by sourcing the top N tickers:`);
const byRows = [...q].sort((a, b) => b.rows - a.rows);
let c2 = 0;
for (let i = 0; i < byRows.length; i++) {
  c2 += byRows[i].rows;
  if (marks.includes(i + 1)) console.log(`  top ${String(i + 1).padStart(4)} tickers -> ${String(c2.toLocaleString()).padStart(9)} rows  (${(100 * (sourcedRows + c2) / tkRows).toFixed(1)}% of all tickered rows sourced)`);
}

console.log(`\nTOP ${top} BY READERS — the work list for the fund-facts agent:`);
console.log(`  ${"ticker".padEnd(8)}${"readers".padStart(11)}${"plans".padStart(8)}${"rows".padStart(8)}   most common filed name`);
for (const x of q.slice(0, top)) {
  console.log(`  ${x.tk.padEnd(8)}${x.ppl.toLocaleString().padStart(11)}${x.plans.toLocaleString().padStart(8)}${x.rows.toLocaleString().padStart(8)}   ${x.name.slice(0, 44)}`);
}
console.log(`\n  (readers are PLAN-DEDUPLICATED per ticker but a reader holding two unsourced funds counts in both — these columns do not sum)`);

if (stockRows) {
  console.log(`\nOF THE ADDRESSABLE ROWS, ${stockRows.toLocaleString()} across ${STOCK_TK.size} ticker(s) are flagged EMPLOYER STOCK by the page itself`);
  console.log(`  ${[...STOCK_TK].sort().join(" ")}`);
  console.log(`  A stock has no expense ratio and no fund YTD. Sourcing one publishes a category error — exclude by hand.`);
}

/* ---- the owner's ten families ---- */
if (process.argv.includes("--families")) {
  const order = new Map(FAMILIES.map(([l], i) => [l, i]));
  const fams = [...FAM.entries()].sort((a, b) => order.get(a[0]) - order.get(b[0]));
  const famRows = fams.reduce((a, [, g]) => a + g.rows, 0);
  const tdRows = fams.reduce((a, [, g]) => a + g.tdRows, 0);
  console.log(`\nTHE TEN HOUSES THE OWNER NAMED, over the ADDRESSABLE rows only.`);
  console.log(`  "house" is the whole lineup; "target-date" is the ladder inside it. The owner`);
  console.log(`  named the ladders, and the house columns are SIX TIMES larger — so a figure`);
  console.log(`  taken from the wrong pair of columns answers a question he did not ask.`);
  console.log(`  ${"house".padEnd(22)}${"tickers".padStart(8)}${"rows".padStart(8)}${"readers".padStart(11)}  |${"td tk".padStart(7)}${"td rows".padStart(9)}${"td readers".padStart(12)}`);
  for (const [label, g] of fams) {
    console.log(`  ${label.padEnd(22)}${g.tickers.size.toLocaleString().padStart(8)}${g.rows.toLocaleString().padStart(8)}${g.ppl.toLocaleString().padStart(11)}  |${g.tdTickers.size.toLocaleString().padStart(7)}${g.tdRows.toLocaleString().padStart(9)}${g.tdPpl.toLocaleString().padStart(12)}`);
  }
  console.log(`  ${"TOTAL rows".padEnd(22)}${"".padStart(8)}${famRows.toLocaleString().padStart(8)}${"".padStart(11)}  |${"".padStart(7)}${tdRows.toLocaleString().padStart(9)}`);
  console.log(`  ${famRows.toLocaleString()} of ${addressable.toLocaleString()} addressable rows (${(100 * famRows / addressable).toFixed(1)}%) are in one of those HOUSES;`);
  console.log(`  ${tdRows.toLocaleString()} (${(100 * tdRows / addressable).toFixed(1)}%) are in their TARGET-DATE ladders.`);
  console.log(`  the other ${(addressable - famRows).toLocaleString()} are everything else a plan can hold.`);
  console.log(`  VANGUARD'S LADDER READS NEAR-ZERO HERE AND THAT IS CORRECT, NOT A BUG: plans hold`);
  console.log(`  it as COLLECTIVE TRUSTS, which carry no ticker and are served by the vehicles`);
  console.log(`  path instead. A ticker queue cannot see them and must not be read as denying them.`);

  /* READ IT, do not only count it: the top names each family reaches, and the
   * residue it does not. This is the print that caught the label claiming
   * "target-date families" over a house's entire lineup. */
  console.log(`\n  the names each house REACHES (top 3), then its TARGET-DATE slice (top 3) — read these:`);
  for (const [label, g] of fams) {
    const t3 = (m) => [...m].sort((a, b) => b[1] - a[1]).slice(0, 3);
    console.log(`    ${label}`);
    for (const [nm, c] of t3(g.names)) console.log(`      house ${String(c).padStart(4)}x  ${nm.slice(0, 66)}${nm.length > 66 ? `…+${nm.length - 66}` : ""}`);
    const td = t3(g.tdNames);
    if (!td.length) console.log(`      td    (none reached — if this house's ladder IS in the data, the td pattern is wrong)`);
    for (const [nm, c] of td) console.log(`      td    ${String(c).padStart(4)}x  ${nm.slice(0, 66)}${nm.length > 66 ? `…+${nm.length - 66}` : ""}`);
  }
  const unmatched = q.filter((x) => !famOf(x.name, "")).slice(0, 10);
  console.log(`\n  UNMATCHED residue — the ten biggest addressable tickers in NO named family:`);
  for (const x of unmatched) console.log(`    ${x.tk.padEnd(8)}${x.ppl.toLocaleString().padStart(11)}  ${x.name.slice(0, 54)}`);
}
