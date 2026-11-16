#!/usr/bin/env node
/* THE PUBLISH GATE FOR A BULK SOURCING INGEST.
 *
 * Sourcing a figure makes a MIS-RESOLVED IDENTITY WORSE and no sourcing check
 * can see it: every receipt is valid, the fee is simply the fee of a DIFFERENT
 * SHARE CLASS of the same fund (Black Hills / VINIX-vs-Plus). With 94 tickers
 * that was answerable by reading; with thousands it has to be systematic.
 *
 * So, over every published+served row whose ticker now carries a sourced
 * figure: compare the share class the FILING states against the share class in
 * the SOURCE's own legal name. Both sides must state one — "the filing states
 * no class" is a different and already-decided question (the owner's standing
 * decision on comparables), and requiring the PRESENCE of the bad case is this
 * record's rule for a semantic class.
 *
 * Measured through production's renderRow with tab "menu" and the argument the
 * page passes (issuer INCLUDED). Prints conflicts by READERS, to be read.
 *
 * Run: node bulk-class-screen.mjs [--only-new <before.js>]
 */
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { writeFileSync } from "node:fs";
import { buildRenderer } from "./apppath.mjs";
import { loadPlans, loadFundFactsAsset } from "./lib-schema.mjs";
import { servedLineup } from "./lib-ledger.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const RAW = JSON.parse(readFileSync(`${ROOT}/data/fund-facts.json`, "utf8"));
const FACTS = RAW.funds || RAW;
const SOURCED = new Map();           // TICKER -> {name, er, ytd}
for (const [tk, v] of Object.entries(FACTS)) {
  if (!v || typeof v !== "object") continue;
  if (v.er == null && v.ytd == null) continue;
  SOURCED.set(tk.toUpperCase(), v);
}
if (SOURCED.size < 100) throw new Error(`CONTROL FAILED: only ${SOURCED.size} sourced tickers read`);

/* optional: restrict to tickers the committed asset does NOT already carry, so
 * a re-run prices only what this ingest adds */
let ONLY = null;
const oi = process.argv.indexOf("--only-new");
if (oi > 0) {
  const before = loadFundFactsAsset(process.argv[oi + 1]).facts;
  ONLY = new Set([...SOURCED.keys()].filter((t) => !before[t]));
  console.log(`restricted to the ${ONLY.size} tickers this ingest ADDS`);
}

/* one normalised share-class token, or null. Narrow on purpose: a bare letter
 * counts only where "Class"/"Cl" introduces it, because `Great Gray Trust T.
 * Rowe Price…` would otherwise read "T" as a class. */
const norm = (s) => {
  const n = " " + String(s).replace(/[‐-―]/g, "-").toLowerCase() + " ";
  const m =
    n.match(/\b(?:class|cl\.?)\s*([a-z]{1,2}-?\d{0,2})\b/) ||
    n.match(/\b(r-?[1-6])\b/) ||
    n.match(/\b(adv(?:isor)?|admiral|institutional|inst(?:l)?|instit|investor|retail|service|premier|select|signal|z|y2?|i[1-3]?|k6?)\s*(?:class|shares?)?\s*$/) ||
    n.match(/\b(admiral|institutional|instl|inst'l)\b/);
  if (!m) return null;
  let t = m[1].replace(/-/g, "").replace(/'/g, "");
  const alias = { instl: "inst", institutional: "inst", instit: "inst", i: "inst",
                  advisor: "adv", retail: "investor" };
  return alias[t] || t;
};

const R = buildRenderer({ appjs: path.join(ROOT, "app.js") });
const lidx = JSON.parse(readFileSync(`${ROOT}/lineups-index.json`, "utf8")).plans;
const d = loadPlans();
R.setPlans(d.rows.map((r) => ({ sponsorName: d.get(r, "sponsorName"), ticker: d.get(r, "ticker") })));

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

const VERDICT = new Map();
const CONFLICT = new Map();   // ticker -> {rows, ppl, plans:Set, pairs:Map}
const AGREED = new Map();     // ticker -> {rows, ppl, plans:Set} — the withholding COST
let rows = 0, judged = 0, agree = 0, conflict = 0, filedNone = 0, sourceNone = 0;
for (const sh of readdirSync(`${ROOT}/data/lineups`).sort()) {
  if (!sh.endsWith(".json")) continue;
  const shard = JSON.parse(readFileSync(`${ROOT}/data/lineups/${sh}`, "utf8"));
  for (const [ack, e] of Object.entries(shard)) {
    const mem = members.get(ack);
    if (!mem || !e || !e.confident || !Array.isArray(e.funds) || !e.funds.length) continue;
    const lead = mem[0];
    const total = e.funds.reduce((a, f) => a + (+f.value || 0), 0);
    for (const raw of e.funds) {
      const f = { ...raw, nameRaw: String(raw.name || ""), name: R.clean(String(raw.name || "")) };
      const key = `${String(f.iss || "").trim()}\u0000${f.nameRaw}\u0000${String(f.type || "")}`;
      let r = VERDICT.get(key);
      if (r === undefined) { r = R.renderRow(lead, f, "menu", total); VERDICT.set(key, r); }
      if (!r || !r.tk || r.star) continue;
      const tk = String(r.tk).toUpperCase();
      const sf = SOURCED.get(tk);
      if (!sf) continue;
      if (ONLY && !ONLY.has(tk)) continue;
      rows++;
      const fc = norm(f.nameRaw), pc = norm(sf.name || "");
      if (!pc) { sourceNone++; continue; }
      if (!fc) { filedNone++; continue; }
      judged++;
      if (fc === pc) {
        agree++;
        /* THE COST OF A TICKER-LEVEL WITHHOLDING, counted rather than assumed:
         * these are rows whose filed name names the RIGHT class and which lose
         * their sourced figure anyway because a sibling row on the same ticker
         * does not. A gate whose cost is not measured is a gate nobody can
         * argue with. */
        let a = AGREED.get(tk);
        if (!a) AGREED.set(tk, a = { rows: 0, ppl: 0, plans: new Set() });
        a.rows++;
        if (!a.plans.has(ack)) { a.plans.add(ack); a.ppl += mem.reduce((x, m) => x + m.participants, 0); }
        continue;
      }
      conflict++;
      let g = CONFLICT.get(tk);
      if (!g) CONFLICT.set(tk, g = { rows: 0, ppl: 0, plans: new Set(), pairs: new Map(), name: sf.name, er: sf.er, ytd: sf.ytd });
      g.rows++;
      if (!g.plans.has(ack)) { g.plans.add(ack); g.ppl += mem.reduce((a, m) => a + m.participants, 0); }
      g.pairs.set(`${fc}\u0000${f.nameRaw}`, (g.pairs.get(`${fc}\u0000${f.nameRaw}`) || 0) + 1);
    }
  }
}

console.log(`\npublished+served rows whose ticker carries a sourced figure: ${rows.toLocaleString()}`);
console.log(`  both sides state a class: ${judged.toLocaleString()}  ->  AGREE ${agree.toLocaleString()}   CONFLICT ${conflict.toLocaleString()}`);
console.log(`  filing states none: ${filedNone.toLocaleString()}   source name states none: ${sourceNone.toLocaleString()}`);
if (!judged) console.log(`  *** CONTROL: nothing judged — the normaliser or the name field is wrong, this is not a clean result ***`);

const list = [...CONFLICT.entries()].sort((a, b) => b[1].ppl - a[1].ppl);

/* ---- THE PUBLISH GATE IT FEEDS ------------------------------------------
 *
 * `--emit` writes `data/fund-facts-withheld.json`, which
 * `gen-fund-facts-asset.mjs` reads and refuses to publish. The withholding is
 * DERIVED by this script rather than typed, because a hand-kept list of 154
 * tickers rots the moment a filing is re-parsed, and this record's rule is
 * that a manual step in a verification path is the step that gets skipped.
 *
 * WHAT IT IS FOR. The owner's standing decision of 2026-11-05 on a filing that
 * states one share class where the page publishes another: CORRECT THE SYMBOL,
 * WITHDRAW THE FEE. That correction lives in the resolver and is not built yet.
 * Until it is, a sourced figure on one of these rows would upgrade a
 * wrong-class row from a hedged "est." to a confident tick — the one thing
 * sourcing makes WORSE rather than better. Withholding leaves those rows
 * exactly as they are today; it withdraws nothing a reader can see.
 *
 * IT IS DELIBERATELY TICKER-LEVEL AND THAT OVER-WITHHOLDS. The conflict is a
 * property of the ROW (the filed name), so a ticker whose other rows name the
 * right class loses its figure too. The cost is printed below rather than
 * waved past, and the per-row gate — which needs the share class in the
 * browser asset — is the next piece of work, not a reason to publish now. */
if (process.argv.includes("--emit")) {
  const out = { generated: new Date().toISOString().slice(0, 10), reason:
    "the filing states a share class the sourced fund's own name contradicts; " +
    "owner's standing decision 2026-11-05 is to correct the symbol and withdraw the fee, " +
    "and until the resolver does that a sourced figure here would publish a confident wrong class",
    producedBy: "scripts/fund-facts-class-screen.mjs --emit", tickers: {} };
  for (const [tk, g] of list) {
    out.tickers[tk] = { rows: g.rows, readers: g.ppl, plans: g.plans.size,
      sourceName: g.name || null,
      filed: [...g.pairs].sort((a, b) => b[1] - a[1]).slice(0, 2)
        .map(([k, n]) => ({ n, cls: k.split("\u0000")[0], name: k.split("\u0000")[1] })) };
  }
  writeFileSync(path.join(ROOT, "data", "fund-facts-withheld.json"), JSON.stringify(out, null, 1) + "\n");
  console.log(`\n--emit: wrote data/fund-facts-withheld.json (${list.length} tickers)`);
}

let costRows = 0, costPpl = 0;
for (const [tk] of list) { const a = AGREED.get(tk); if (a) { costRows += a.rows; costPpl += a.ppl; } }
console.log(`\nCOST OF WITHHOLDING AT TICKER LEVEL: ${costRows.toLocaleString()} rows / ${costPpl.toLocaleString()} reader-slots name the RIGHT class and lose their figure anyway.`);
console.log(`  (against ${[...list].reduce((a, [, g]) => a + g.rows, 0).toLocaleString()} conflicting rows the gate exists for)`);
console.log(`\nCONFLICTS — ${list.length} ticker(s), by readers. WITHHELD from publication:`);
for (const [tk, g] of list.slice(0, 40)) {
  console.log(`\n  ${tk}  ${g.ppl.toLocaleString()} readers · ${g.rows} rows · er ${g.er} ytd ${g.ytd}`);
  console.log(`     source name: ${(g.name || "").slice(0, 70)}`);
  for (const [k, n] of [...g.pairs].sort((a, b) => b[1] - a[1]).slice(0, 3)) {
    const [fc, nm] = k.split("\u0000");
    console.log(`     filed ${String(n).padStart(4)}x [${fc}]  ${nm.slice(0, 64)}`);
  }
}
