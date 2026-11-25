#!/usr/bin/env node
/* SIZE THE CUSTODIAN CLASS "no provider resolved from Schedule C".
 *
 * `lib-ledger`'s `custodianCell` returns `absent` with that reason for every
 * plan that is NOT short form and has no `plan.recordkeeper`. The reason string
 * describes US ("nothing resolved"), and a reader — human or agent — takes it as
 * a description of the FILING ("a provider is named and we failed to read it").
 * Its SIBLING string made exactly that promise about Schedule A's carrier and
 * over-stated the class 49x (`docs/accuracy-log.md` 2026-11-06), so the first
 * question about this one is whether the filing names anybody at all.
 *
 * THE STAGE, read rather than guessed: `recordkeeper` is computed in
 * `build-data.mjs`'s pass 3 (`scanSchC`) and assigned at `build-data.mjs:1254`
 * as `schC.get(p.ack) || schC.get(p.mtiaAck)`. That is PREP. A repair here
 * would need no `PARSER_VERSION` bump and no re-parse — which is why it was
 * worth measuring carefully before spending a cycle on it.
 *
 * WHY THE STORE CANNOT ANSWER THIS. `data/fees/NN.json`'s `p` rows and
 * `scanSchC`'s `best` map are filled from THE SAME LOOP, past the same
 * `if (!name) continue` — so "no recordkeeper" implies "no provider rows in the
 * shard" BY CONSTRUCTION, and a store-side partition can only ever report its
 * own premise. The question has to be put to the DOL extracts, which
 * `askebsa.dol.gov` serves to this sandbox (measured 2026-11-06).
 *
 * SURFACES ASKED — the whole of Schedule C that can name a service provider:
 *   Part I item 1  PROVIDER_ELIGIBLE_NAME   (pass 3 DOES read it)
 *   Part I item 2  PROVIDER_OTHER_NAME      (pass 3 DOES read it)
 *   Part I item 3  PROVIDER_INDIRECT_NAME   (pass 3 never downloads the table)
 *   Part II        PROVIDER_FAIL_NAME       (pass 3 never downloads the table)
 * Part III is the TERMINATED ACCOUNTANT. An accountant is never a recordkeeper,
 * so it is counted as a CAUSE of an otherwise-empty Schedule C and never as a
 * candidate name.
 *
 * SERVICE CODES COME FROM THE CHILD TABLES, NOT THE INLINE COLUMN. The inline
 * `*_SRVC_CODES` columns are empty in the Latest extracts (recorded 2026-08-07
 * for item 2); the same is true of item 3 and Part II, whose codes ship in
 * `F_SCH_C_PART1_ITEM3_CODES` and `F_SCH_C_PART2_CODES`. Reading only the
 * inline column reports "no code filed" on every row — a clean zero on the
 * query — which is what the first pass of this measurement did.
 *
 * FOLDER YEARS ARE PLAN YEARS, NOT FILING YEARS. A plan-year-2025 filing has a
 * 2026 ack prefix and lives in the 2025 folder; `build-data`'s own window is
 * [Y0..Y0-3]. This script reads 2019-2025 so that the handful of plans whose
 * newest filing is an older plan year are not scored as "filed nothing" when
 * the pipeline simply never fetched their folder.
 *
 * Usage: node scripts/custodian-schc-size.mjs [--dir <cache>]
 */
import { readFileSync, existsSync, mkdirSync, createWriteStream, readdirSync } from "fs";
import { execFileSync } from "child_process";
import { pipeline } from "stream/promises";
import path from "path";
import { buildLedger } from "./lib-ledger.mjs";

const argv = process.argv.slice(2);
const WORK = (() => { const i = argv.indexOf("--dir"); return i >= 0 ? argv[i + 1] : "/tmp/wampo-schc"; })();
mkdirSync(WORK, { recursive: true });

const YEARS = ["2019", "2020", "2021", "2022", "2023", "2024", "2025"];
/* Part II and the code child tables are only needed where a name was found, and
 * the older folders are not published for every table; a missing folder is
 * tolerated and reported rather than guessed at. */
const TABLES = {
  i1: { file: "F_SCH_C_PART1_ITEM1", name: "PROVIDER_ELIGIBLE_NAME" },
  i2: { file: "F_SCH_C_PART1_ITEM2", name: "PROVIDER_OTHER_NAME" },
  i3: { file: "F_SCH_C_PART1_ITEM3", name: "PROVIDER_INDIRECT_NAME", codes: "F_SCH_C_PART1_ITEM3_CODES" },
  p2: { file: "F_SCH_C_PART2", name: "PROVIDER_FAIL_NAME", codes: "F_SCH_C_PART2_CODES" },
  parent: { file: "F_SCH_C", name: "PROVIDER_EXCLUDE_IND" },
  t3: { file: "F_SCH_C_PART3", name: "PROVIDER_TERM_NAME" },
};
const RK_CODES = new Set(["15", "64"]); // instructions: 15 recordkeeping & information management, 64 recordkeeping fees

async function fetchTable(base, year) {
  const f = `${base}_${year}_Latest.zip`;
  const dest = path.join(WORK, f);
  if (!existsSync(dest)) {
    const url = `https://askebsa.dol.gov/FOIA%20Files/${year}/Latest/${f}`;
    const res = await fetch(url, { redirect: "follow" });
    if (!res.ok) return null;
    await pipeline(res.body, createWriteStream(dest));
  }
  const dir = dest.replace(/\.zip$/, "");
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
    try { execFileSync("unzip", ["-o", "-q", dest, "-d", dir]); } catch { return null; }
  }
  const csv = readdirSync(dir).find((x) => x.toLowerCase().endsWith(".csv"));
  return csv ? path.join(dir, csv) : null;
}

/* Minimal quote-aware CSV split. The name columns carry commas inside quotes
 * (`SMITH, HOWARD & CO`), so a bare split silently shifts every later column. */
function splitRow(L) {
  const c = []; let fl = "", q = false;
  for (let j = 0; j < L.length; j++) {
    const ch = L[j];
    if (q) { if (ch === '"') q = false; else fl += ch; }
    else if (ch === '"') q = true;
    else if (ch === ",") { c.push(fl); fl = ""; }
    else fl += ch;
  }
  c.push(fl);
  return c;
}

async function loadNamed(spec) {
  const byAck = new Map();
  const codesByRow = new Map();
  let folders = 0;
  for (const y of YEARS) {
    const csv = await fetchTable(spec.file, y);
    if (!csv) continue;
    folders++;
    const lines = readFileSync(csv, "utf8").split("\n");
    const H = lines[0].split(",").map((h) => h.toUpperCase().trim());
    const iN = H.indexOf(spec.name), iR = H.indexOf("ROW_ORDER");
    /* ASSERT THE HEADER. A guessed column name must throw, not read empty:
     * item 1's name column is PROVIDER_ELIGIBLE_NAME and item 3's is
     * PROVIDER_INDIRECT_NAME, and `build-data`'s own item-1 lookup only finds
     * the right one through a loose regex fallback. */
    if (H[0] !== "ACK_ID" || iN < 0) throw new Error(`${spec.file} ${y}: no ${spec.name}; header is ${H.slice(0, 6).join(",")}`);
    for (let i = 1; i < lines.length; i++) {
      const L = lines[i]; if (!L) continue;
      const c = splitRow(L);
      const ack = c[0].trim(), nm = (c[iN] || "").trim();
      if (!ack || !nm) continue;
      if (!byAck.has(ack)) byAck.set(ack, []);
      byAck.get(ack).push({ n: nm, row: iR >= 0 ? (c[iR] || "").trim() : "", c: "" });
    }
    if (spec.codes) {
      const cc = await fetchTable(spec.codes, y);
      if (cc) {
        const cl = readFileSync(cc, "utf8").split("\n");
        const HC = cl[0].split(",").map((h) => h.toUpperCase().trim());
        const ia = HC.indexOf("ACK_ID"), ir = HC.indexOf("ROW_ORDER"), ic = HC.indexOf("SERVICE_CODE");
        if (ia < 0 || ir < 0 || ic < 0) throw new Error(`${spec.codes} ${y}: header is ${HC.join(",")}`);
        for (let i = 1; i < cl.length; i++) {
          const L = cl[i]; if (!L) continue;
          const c = splitRow(L);
          const k = c[ia].trim() + "|" + c[ir].trim(), v = (c[ic] || "").trim();
          if (!v) continue;
          codesByRow.set(k, codesByRow.has(k) ? codesByRow.get(k) + " " + v : v);
        }
      }
    }
  }
  if (!folders) throw new Error(`${spec.file}: no folder downloaded for any of ${YEARS.join(",")}`);
  for (const [ack, rows] of byAck) for (const r of rows) r.c = codesByRow.get(ack + "|" + r.row) || "";
  return { byAck, folders };
}

const S = {};
for (const [k, spec] of Object.entries(TABLES)) {
  S[k] = await loadNamed(spec);
  console.log(`${spec.file}: ${S[k].byAck.size.toLocaleString()} acks named, ${S[k].folders} folders`);
}

const led = buildLedger();
const acksOf = (p) => [p.ack, p.mtiaAck].filter(Boolean);
const rowsOf = (p, k) => acksOf(p).flatMap((a) => S[k].byAck.get(a) || []);
const isRk = (c) => String(c).split(/[^0-9]+/).filter(Boolean).some((x) => RK_CODES.has(x));

/* THE CONTROL THAT MAKES EVERY ZERO BELOW MEAN SOMETHING. Items 1 and 2 are
 * where `recordkeeper` comes from, so a plan whose custodian we PUBLISH must be
 * present in one of them. Anything below ~95% means the ack join or the folder
 * coverage is broken and a zero on the absent side reports on the query, not on
 * the filings. Measured 2026-11-25: 66,649 / 66,649 = 100.00%. */
let pubIn = 0, pubTot = 0;
for (const p of led.plans) {
  if (p.cells.custodian.state !== "published") continue;
  pubTot++;
  if (acksOf(p).some((a) => S.i1.byAck.has(a) || S.i2.byAck.has(a))) pubIn++;
}
const pct = (100 * pubIn / pubTot).toFixed(2);
console.log(`\nCONTROL: published custodians present in item1/item2: ${pubIn.toLocaleString()} / ${pubTot.toLocaleString()} = ${pct}%`);
if (pubIn / pubTot < 0.95) throw new Error("CONTROL FAILED: the ack join or folder coverage is wrong — every zero below is about the query");

const b = new Map();
const add = (k, p, x) => {
  const v = b.get(k) || { plans: 0, ppl: 0, ex: [] };
  v.plans++; v.ppl += p.ppl;
  if (v.ex.length < 12) v.ex.push(`${p.sponsorName} (${p.ppl.toLocaleString()})${x ? " :: " + x : ""}`);
  b.set(k, v);
};
let tot = 0, totPpl = 0;
for (const p of led.plans) {
  const c = p.cells.custodian;
  if (c.state !== "absent" || p.sf) continue;
  tot++; totPpl += p.ppl;
  const r1 = rowsOf(p, "i1"), r2 = rowsOf(p, "i2"), r3 = rowsOf(p, "i3"), rp = rowsOf(p, "p2");
  const show = (rs) => rs.slice(0, 2).map((r) => `${r.n} [${r.c || "no code"}]`).join(" | ");
  if (r1.length || r2.length) add("Z. item1/item2 names somebody — IMPOSSIBLE by construction; a hit here is a BUG in this script", p, show([...r1, ...r2]));
  else if (rp.some((r) => isRk(r.c))) add("A. Part II names a provider CODED 15/64 who REFUSED to disclose", p, show(rp));
  else if (r3.some((r) => isRk(r.c))) add("B. item 3 names a provider CODED 15/64", p, show(r3));
  else if (r3.length || rp.length) add("C. item 3 / Part II names a provider, NOT coded 15/64", p, show([...r3, ...rp]));
  else {
    const par = acksOf(p).flatMap((a) => S.parent.byAck.get(a) || []);
    const t3 = acksOf(p).flatMap((a) => S.t3.byAck.get(a) || []);
    if (!par.length) add("D. CEILING — no Schedule C filed at all (not required: no provider was paid $5,000+ from the plan)", p);
    else if (t3.length) add("E. CEILING — Schedule C filed ONLY to report a TERMINATED ACCOUNTANT (Part III), which is never a recordkeeper", p, `terminated ${t3[0].n}`);
    else add("F. CEILING — Schedule C filed and names NO provider on any line", p, `exclude-ind ${[...new Set(par.map((r) => r.n || "(blank)"))].join("/")}`);
  }
}
console.log(`\npopulation (custodian absent, NOT short form): ${tot.toLocaleString()} plans / ${totPpl.toLocaleString()} readers`);
let addressable = 0, addrPpl = 0;
for (const [k, v] of [...b].sort((x, y) => y[1].ppl - x[1].ppl)) {
  if (/^[ABC]\./.test(k)) { addressable += v.plans; addrPpl += v.ppl; }
  console.log(`\n  ${v.plans.toLocaleString()} plans / ${v.ppl.toLocaleString()} readers  ${k}`);
  for (const e of v.ex) console.log(`      ${e}`);
}
console.log(`\nADDRESSABLE (Schedule C names somebody we discard): ${addressable.toLocaleString()} plans / ${addrPpl.toLocaleString()} readers`);
console.log(`CEILING: ${(tot - addressable).toLocaleString()} plans / ${(totPpl - addrPpl).toLocaleString()} readers `
  + `= ${(100 * (totPpl - addrPpl) / totPpl).toFixed(2)}% of the class's readers`);
console.log(`reader floor for new work is 500,000 — addressable is ${(500000 / Math.max(addrPpl, 1)).toFixed(0)}x below it`);
