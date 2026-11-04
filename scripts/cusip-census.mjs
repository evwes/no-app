#!/usr/bin/env node
/* wampo — HOW MANY PUBLISHED ROWS ALREADY CARRY A CUSIP?
 *
 * WHY THIS QUESTION, 2026-11-04. The owner supplied a working J.P. Morgan
 * product URL and its path is `/products/<slug>-<cusip>`. So an issuer page is
 * addressable BY CUSIP, and a CUSIP is exactly what a collective trust has
 * instead of a ticker -- the population carrying 272,933 priced rows with no
 * symbol, because no SEC filing covers a CIT.
 *
 * And the filings print CUSIPs. This record already notes a LEADING CUSIP on
 * the name (`00206R102 At&T Inc`) and `CUSIP: 149123101` beside employer-stock
 * rows. If our own store carries them at scale, then for those rows the fund
 * identity problem is not an inference problem at all: we hold the identifier
 * and have never used it.
 *
 * THE SHAPE IS NOT THE WITNESS. A 9-character alphanumeric run is also what a
 * dollar amount, an EIN, a plan number and a contract number look like, and
 * this record is explicit that a count keyed on a character shape measures the
 * character shape. So every candidate is checked against the CUSIP CHECK DIGIT
 * (the modulus-10 double-add-double in the CUSIP standard), which a coincidence
 * passes only about one time in ten. That is arithmetic, not a vocabulary, and
 * it cannot go stale.
 *
 * It WRITES NOTHING. Its output decides whether a CUSIP-keyed fetch is worth
 * building, and it is deliberately reported in READERS as well as rows, because
 * rows are not people.
 *
 * Run: node scripts/cusip-census.mjs [--examples 25]
 */
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadPlans } from "./lib-schema.mjs";
import { servedLineup } from "./lib-ledger.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const argv = process.argv.slice(2);
const N_EX = +((argv[argv.indexOf("--examples") + 1]) || 25);

/* The check digit, the token shape and the self-test all live in
 * `lib-cusip.mjs`, shared with `issuer-page-probe.mjs`: a transcribed copy of a
 * predicate measures the transcription, and that module THROWS at import if the
 * checker is broken -- which matters because a broken checker reads as a clean
 * zero and this whole census is one number. */
import { cusipValid, CUSIP_TOKEN, MUST_PASS, MUST_FAIL, falsePositiveRate } from "./lib-cusip.mjs";
console.log(`check-digit self-test ok (${MUST_PASS.length} real CUSIPs pass, ${MUST_FAIL.length} near-misses fail)`);
console.log(`a random 9-digit run validates ${(falsePositiveRate() * 100).toFixed(1)}% of the time — that is the false-positive floor\n`);

/* ---- the store ------------------------------------------------------------ */
const d = loadPlans();
/* lineups-index.json keeps its ack map under `.plans`; `confident()` indexes
 * the map directly, so handing it the wrapper makes EVERY ack read as
 * non-confident and the census comes out a clean zero -- a report on the query.
 * Asserted rather than assumed, because that zero looks like a finding. */
const idxRaw = JSON.parse(readFileSync(path.join(ROOT, "lineups-index.json"), "utf8"));
const idx = idxRaw.plans || idxRaw;
if (!Object.keys(idx).length) { console.error("lineups-index.json: empty ack map"); process.exit(1); }
/* `col` is a FUNCTION and `get` takes (row, name) -- reading a row as an object
 * throws, which is what lib-schema is for. Participants is `participants`. */
const cAck = d.col("ack"), cMtia = d.col("mtiaAck"), cParts = d.col("participants");
const readersOf = new Map();          // served ack -> participants (plan-deduped)
const plansOf = new Map();
for (const r of d.rows) {
  const s = servedLineup({ ack: r[cAck], mtiaAck: r[cMtia] }, idx);
  if (!s || !s.ack) continue;
  const ppl = +r[cParts] || 0;
  readersOf.set(s.ack, (readersOf.get(s.ack) || 0) + ppl);
  plansOf.set(s.ack, (plansOf.get(s.ack) || 0) + 1);
}

/* CUSIP_TOKEN is a FACTORY, not a shared regex: a `/g` literal carries
 * `lastIndex`, so one object reused across 1.7M rows would skip matches. */
const tally = { rows: 0, withCusip: 0, shapeOnly: 0, readers: 0, dollars: 0, noTicker: 0, acks: new Set(), cusips: new Set() };
const examples = [];
const dir = path.join(ROOT, "data", "lineups");

for (const f of readdirSync(dir).filter((x) => x.endsWith(".json"))) {
  const shard = JSON.parse(readFileSync(path.join(dir, f), "utf8"));
  for (const [ack, entry] of Object.entries(shard)) {
    if (!readersOf.has(ack)) continue;            // not served to anyone
    if (!entry || !entry.confident || !Array.isArray(entry.funds)) continue;
    const ppl = readersOf.get(ack) || 0;
    let ackHasOne = false;
    for (const fund of entry.funds) {
      tally.rows++;
      /* look in BOTH cells, because the page prints `issuer · name` and the
       * record notes the identifier turning up in either */
      const hay = `${fund.iss || ""} ${fund.nameRaw || fund.name || ""}`.toUpperCase();
      const cands = [...new Set((hay.match(CUSIP_TOKEN()) || []))];
      if (!cands.length) continue;
      const good = cands.filter(cusipValid);
      if (!good.length) { tally.shapeOnly++; continue; }
      tally.withCusip++;
      tally.dollars += +fund.value || 0;
      if (!(fund.stk || fund.ftk)) tally.noTicker++;
      for (const g of good) tally.cusips.add(g);
      if (!ackHasOne) { ackHasOne = true; tally.acks.add(ack); tally.readers += ppl; }
      if (examples.length < 400) {
        examples.push({ ppl, cusip: good[0], v: +fund.value || 0,
          name: String(fund.nameRaw || fund.name || "").slice(0, 58),
          iss: String(fund.iss || "").slice(0, 26), tk: fund.stk || fund.ftk || "" });
      }
    }
  }
}

const fmt = (n) => n.toLocaleString("en-US");
console.log(`published+served rows scanned        ${fmt(tally.rows)}`);
console.log(`rows carrying a VALID CUSIP          ${fmt(tally.withCusip)}`);
console.log(`rows shape-matching but FAILING it   ${fmt(tally.shapeOnly)}   <- what a shape-only count would have added`);
console.log(`distinct CUSIPs                      ${fmt(tally.cusips.size)}`);
console.log(`of those rows, publishing NO ticker  ${fmt(tally.noTicker)}   <- the population a CUSIP could address`);
console.log(`dollars on those rows                $${fmt(Math.round(tally.dollars))}`);
console.log(`\nCOINCIDENCE FLOOR: ${fmt(tally.withCusip + tally.shapeOnly)} tokens matched the SHAPE and ~10% of those pass the`);
console.log(`check digit by chance, so roughly ${fmt(Math.round((tally.withCusip + tally.shapeOnly) * 0.101))} of the ${fmt(tally.withCusip)} are expected to be accidents.`);
console.log(`plans whose menu carries at least one ${fmt(tally.acks.size)} menus`);
console.log(`readers of those plans               ${fmt(tally.readers)}`);

examples.sort((a, b) => b.ppl - a.ppl);
console.log(`\nlargest by readers (a ticker column of "-" is a row we could address by CUSIP):`);
for (const e of examples.slice(0, N_EX)) {
  console.log(`  ${String(fmt(e.ppl)).padStart(9)} ppl  ${e.cusip}  tk=${(e.tk || "-").padEnd(6)} $${fmt(Math.round(e.v)).padStart(14)}  ${e.iss ? e.iss + " · " : ""}${e.name}`);
}
console.log(`\nNOTE: a CUSIP in the row is an IDENTIFIER, not a fee and not a return.`);
console.log(`It is the key an issuer page is addressed by. Whether the issuer answers a`);
console.log(`runner is a separate question, measured by scripts/fund-source-probe.mjs.`);
