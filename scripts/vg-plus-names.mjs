#!/usr/bin/env node
/* wampo — EVERY FILED NAME A VANGUARD "PLUS" WIDENING WOULD REACH, READ.
 *
 * `fund-er.js`'s VG_IPLUS requires the two words ADJACENT:
 *   (?:institutional|inst'?l?)\s*(?:plus|\+)
 * so "Vanguard Institutional Index Plus Fund" -- the filed name on Black Hills'
 * $143.5M top holding -- misses it and falls through to the bare
 * /vanguard institutional index/ arm, which asserts VINIX. VINIX is the
 * INSTITUTIONAL class (0.035%); the filing names the INSTITUTIONAL PLUS class,
 * VIIIX (0.020%). Both are now SOURCED in fund-facts.json, so the page prints
 * the wrong class's fee with a verified tick beside it.
 *
 * The standing rule on widening a class vocabulary is that it is licensed only
 * once EVERY newly reached name has been read. This prints them: every distinct
 * filed name in the served, published store that contains "vanguard" and a
 * "plus"-shaped class marker, with its row count, its reader count, the ticker
 * the page asserts TODAY, and whether the current VG_IPLUS already catches it.
 *
 * It decides nothing. It is the reading list.
 */
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildRenderer } from "./apppath.mjs";
import { loadPlans } from "./lib-schema.mjs";
import { servedLineup } from "./lib-ledger.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const R = buildRenderer({ appjs: path.join(ROOT, "app.js") });
const lidx = JSON.parse(readFileSync(`${ROOT}/lineups-index.json`, "utf8")).plans;
const d = loadPlans();
R.setPlans(d.rows.map((r) => ({ sponsorName: d.get(r, "sponsorName"), ticker: d.get(r, "ticker") })));

/* the shipped adjacency, sliced rather than retyped */
const src = readFileSync(`${ROOT}/fund-er.js`, "utf8");
const m = src.match(/const VG_IPLUS = String\.raw`([^`]*)`/);
if (!m) throw new Error("VG_IPLUS not found in fund-er.js — slice it, do not retype it");
const VG_IPLUS = new RegExp(m[1], "i");
console.log(`VG_IPLUS (sliced) = /${m[1]}/i\n`);

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

/* PLUS-SHAPED, deliberately wide: this is a reading list, not a predicate.
 * \+ is included because the filings use it as the class marker. */
const PLUSISH = /(\bplus\b|\+)/i;
const groups = new Map();   // iss\0name\0type -> { rows, value, plans:Set, lead, f }

for (const sh of readdirSync(`${ROOT}/data/lineups`).sort()) {
  if (!sh.endsWith(".json")) continue;
  const shard = JSON.parse(readFileSync(`${ROOT}/data/lineups/${sh}`, "utf8"));
  for (const [ack, e] of Object.entries(shard)) {
    const mem = members.get(ack);
    if (!mem || !e || !e.confident || !Array.isArray(e.funds) || !e.funds.length) continue;
    const lead = mem[0];
    const total = e.funds.reduce((a, f) => a + (+f.value || 0), 0);
    for (const raw of e.funds) {
      const nameRaw = String(raw.name || "");
      const iss = String(raw.iss || "").trim();
      const hay = `${iss} ${nameRaw}`;
      if (!/vanguard/i.test(hay) || !PLUSISH.test(hay)) continue;
      const key = `${iss}\u0000${nameRaw}\u0000${String(raw.type || "")}`;
      if (!groups.has(key)) groups.set(key, { rows: 0, value: 0, plans: new Set(), lead, total, f: { ...raw, nameRaw, name: R.clean(nameRaw) } });
      const G = groups.get(key);
      G.rows++; G.value += +raw.value || 0;
      for (const q of mem) G.plans.add(`${q.ein}|${q.pn}`);
    }
  }
}

const ppl = new Map();
for (const row of d.rows) ppl.set(`${d.get(row, "ein")}|${d.get(row, "pn")}`, +d.get(row, "partEOY") || +d.get(row, "participants") || 0);
const readers = (set) => [...set].reduce((a, k) => a + (ppl.get(k) || 0), 0);

const out = [];
for (const [key, G] of groups) {
  const [iss, nameRaw, type] = key.split("\u0000");
  const r = R.renderRow(G.lead, G.f, "menu", G.total);
  out.push({ iss, nameRaw, type, rows: G.rows, plans: G.plans.size, readers: readers(G.plans),
    value: G.value, tk: r ? (r.tk || "") : "(row not rendered)", star: r ? !!r.star : false,
    er: r ? r.er : null, caught: VG_IPLUS.test(`${iss} ${nameRaw}`) });
}
out.sort((a, b) => b.readers - a.readers);

/* POSITIVE CONTROL: the motivating row must be in here, by name, or the
 * screen is measuring something other than what it claims. */
const MOTIVE = "Vanguard Institutional Index Plus Fund";
const pin = out.find((o) => o.nameRaw === MOTIVE);
if (!pin) throw new Error(`positive control MISSING: no served row filed as ${JSON.stringify(MOTIVE)} — the screen does not reach the case that motivated it`);
if (pin.tk !== "VINIX") throw new Error(`positive control: expected the page to assert VINIX on ${JSON.stringify(MOTIVE)}, got ${JSON.stringify(pin.tk)}`);
console.log(`positive control OK: ${JSON.stringify(MOTIVE)} renders tk=${pin.tk} er=${pin.er} over ${pin.rows} rows / ${pin.readers.toLocaleString()} readers\n`);

console.log(`${out.length} distinct (issuer, filed name, type) groups mention Vanguard and a "plus"\n`);
console.log("CAUGHT  TICKER   ROWS  PLANS      READERS   VALUE          FILED NAME  [issuer]");
for (const o of out) {
  console.log(
    (o.caught ? "  yes " : "  NO  ").padEnd(8) +
    String((o.tk || "—") + (o.star ? "*" : "")).padEnd(9) +
    String(o.rows).padStart(5) + "  " +
    String(o.plans).padStart(5) + "  " +
    o.readers.toLocaleString().padStart(11) + "  $" +
    Math.round(o.value).toLocaleString().padEnd(14) + "  " +
    JSON.stringify(o.nameRaw) + (o.iss ? `  [${o.iss}]` : ""));
}

/* THE CANDIDATE WIDENING, APPLIED SO ITS WHOLE BLAST RADIUS CAN BE READ.
 * It relaxes ONLY the class marker: VG_IPLUS demands "institutional" and
 * "plus" adjacent, and the filings put the fund name between them
 * ("Institutional Index Plus", "Institutional Index Fund Plus Shares"). The
 * fund phrase stays required, so this cannot reach a Vanguard fund other than
 * Institutional Index. Every name it reaches is listed below to be READ --
 * that reading, not this comment, is what licenses the widening. */
const CANDIDATE = /^(?!.*\b(?:admiral|investor)\b)(?=.*\bvanguard\b)(?=.*institutional\s+index)(?=.*\bplus\b)/i;
const reached = out.filter((o) => CANDIDATE.test(`${o.iss} ${o.nameRaw}`));
const newly = reached.filter((o) => !o.caught);
console.log(`\n=== CANDIDATE widening reaches ${reached.length} group(s); ${newly.length} are NEW ===`);
for (const o of reached) {
  console.log(`  ${o.caught ? "already" : "  NEW  "}  today=${String(o.tk || "—").padEnd(7)} er=${String(o.er ?? "—").padEnd(6)} ${String(o.rows).padStart(4)} rows ${o.readers.toLocaleString().padStart(10)} readers  ${JSON.stringify(o.nameRaw)}${o.iss ? `  [${o.iss}]` : ""}`);
}
console.log(`  NEW total: ${newly.reduce((a, o) => a + o.rows, 0)} rows, ` +
  `${newly.reduce((a, o) => a + o.readers, 0).toLocaleString()} reader-slots, ` +
  `$${Math.round(newly.reduce((a, o) => a + o.value, 0)).toLocaleString()}`);

const miss = out.filter((o) => !o.caught);
console.log(`\n${miss.length} group(s) NOT caught by the shipped adjacency: ` +
  `${miss.reduce((a, o) => a + o.rows, 0)} rows, ` +
  `${new Set(miss.flatMap((o) => [...Array(0)])).size || miss.reduce((a, o) => a + o.plans, 0)} plan-slots, ` +
  `${miss.reduce((a, o) => a + o.readers, 0).toLocaleString()} reader-slots`);
