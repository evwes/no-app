#!/usr/bin/env node
/* wampo — A SEEDED UNIFORM DRAW of the rows that newly publish a trust's own
 * fee and return, read by hand, with each row's FILED TYPE printed.
 *
 * Required by the standing rules before any ship that moves published cells,
 * and for a specific reason this record has paid for: *a symbol can be right
 * for the FUND and wrong for the VEHICLE, where no count can see the
 * difference — only a draw printing each row's filed TYPE finds it.* Here the
 * question is sharper still, because the claim being published is about the
 * vehicle itself: if a drawn row's filed type is NOT a pooled vehicle, then we
 * are quoting a collective trust's unit-class fee on something that is not a
 * collective trust.
 *
 * Capped at 2 rows per plan: an uncapped draw over this family returns one
 * sponsor's twelve vintages and reads as twelve observations of one filing.
 */
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildRenderer } from "./apppath.mjs";
import { loadPlans } from "./lib-schema.mjs";
import { servedLineup } from "./lib-ledger.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const N = +(process.argv[2] || 30);
const SEED = +(process.argv[3] || 20261114);

/* a small deterministic PRNG, so the draw is reproducible and auditable */
let st = SEED >>> 0;
const rnd = () => { st ^= st << 13; st >>>= 0; st ^= st >> 17; st ^= st << 5; st >>>= 0; return st / 4294967296; };

const R = buildRenderer();
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

/* RESERVOIR over the population, capped per plan */
const pool = [];
const perPlan = new Map();
const CAP = 2;
for (const sh of readdirSync(`${ROOT}/data/lineups`).sort()) {
  if (!sh.endsWith(".json")) continue;
  const shard = JSON.parse(readFileSync(`${ROOT}/data/lineups/${sh}`, "utf8"));
  for (const [ack, e] of Object.entries(shard)) {
    const mem = members.get(ack);
    if (!mem || !e || !e.confident || !Array.isArray(e.funds) || !e.funds.length) continue;
    const lead = mem[0];
    const total = e.funds.reduce((a, f) => a + (+f.value || 0), 0);
    for (const raw of e.funds) {
      const nameRaw = String(raw.name || ""), iss = String(raw.iss || "").trim();
      if (!/vanguard/i.test(`${iss} ${nameRaw}`) || !/target/i.test(nameRaw)) continue;
      const r = R.renderRow(lead, { ...raw, nameRaw, name: R.clean(nameRaw) }, "menu", total);
      if (!r || !r.vehicleCls) continue;              // only rows that NEWLY publish
      const pk = `${lead.ein}|${lead.pn}`;
      const used = perPlan.get(pk) || 0;
      if (used >= CAP) continue;
      perPlan.set(pk, used + 1);
      pool.push({ sponsor: lead.sponsorName, pk, ack, nameRaw, iss,
        filedType: raw.type || "(none stated)", value: +raw.value || 0,
        tk: r.tk, star: r.star, shownType: r.shownType, cls: r.vehicleCls,
        er: r.erShown, erAsOf: r.erSourced ? r.erSourced.erAsOf : null,
        ytd: r.ytdSourced ? r.ytdSourced.ytd : null, ytdAsOf: r.ytdSourced ? r.ytdSourced.ytdAsOf : null,
        ppl: mem.reduce((a, q) => a + (q.participants || 0), 0) });
    }
  }
}

if (!pool.length) throw new Error("the draw found NO rows — a broken arm and an inert one read the same zero");
console.log(`population: ${pool.length.toLocaleString()} rows (<=${CAP} per plan) across ${perPlan.size.toLocaleString()} plans\n`);

const pick = [];
for (let i = 0; i < pool.length; i++) {
  if (pick.length < N) pick.push(pool[i]);
  else { const j = Math.floor(rnd() * (i + 1)); if (j < N) pick[j] = pool[i]; }
}

/* THE ONE THING A COUNT CANNOT SEE: is the row a pooled vehicle at all? */
const POOLED = /collective|commingled|pooled|separate account|trust|cit\b/i;
let notPooled = 0, noClassWord = 0;
console.log("#   FILED TYPE              CLASS         FEE     YTD      VALUE            FILED NAME");
pick.forEach((x, i) => {
  const bad = !POOLED.test(x.filedType);
  if (bad) notPooled++;
  /* and does the filed NAME really state the class we quoted? */
  const stated = new RegExp(`\\b(?:trust|tr)\\.?\\s*${x.cls.replace(/^Trust\s*/i, "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(x.nameRaw);
  if (!stated) noClassWord++;
  console.log(
    String(i + 1).padStart(3) + " " +
    String(x.filedType).slice(0, 22).padEnd(24) +
    String(x.cls).padEnd(14) +
    String(x.er != null ? x.er + "%" : "—").padEnd(8) +
    String(x.ytd != null ? (x.ytd > 0 ? "+" : "") + x.ytd + "%" : "—").padEnd(9) +
    ("$" + Math.round(x.value).toLocaleString()).padEnd(17) +
    /* A TRUNCATED PRINT CAN TURN A COMPLETE ANSWER INTO A DEFECT. Two rows in
     * the first run of this draw read as a class contradicting the filed name,
     * and both were the printer cutting "Trust II" to "Trust I" at 56
     * characters. The marker is not decoration: without it the reader cannot
     * tell a short name from a cut one. */
    (JSON.stringify(x.nameRaw).length > 56
      ? JSON.stringify(x.nameRaw).slice(0, 56) + `\u2026+${JSON.stringify(x.nameRaw).length - 56}`
      : JSON.stringify(x.nameRaw))
    + (bad ? "   <<< FILED TYPE NOT STATED AS A POOLED VEHICLE" : "") + (stated ? "" : "   <<< NAME DOES NOT STATE THIS CLASS"));
  console.log(`      ${x.sponsor.slice(0, 40)}  (${x.pk}, ${x.ppl.toLocaleString()} participants)  ticker ${x.tk}${x.star ? "*" : ""}  shown type ${JSON.stringify(x.shownType)}  fee as of ${x.erAsOf}  ytd as of ${x.ytdAsOf}`);
});
console.log(`\nseed ${SEED}, ${pick.length} drawn`);
console.log(`rows whose FILED TYPE is not a pooled vehicle: ${notPooled}${notPooled ? "   *** READ THESE — we would be quoting a trust class on something that is not a trust ***" : "   (none)"}`);
console.log(`rows whose FILED NAME does not state the quoted class: ${noClassWord}${noClassWord ? "   *** READ THESE ***" : "   (none)"}`);
