#!/usr/bin/env node
/* wampo — the full-form gap census.
 *
 * Owner directive 2026-09-02: every full form gets listed and described, and
 * no item rests as "unknown". This is the top of that work — the whole
 * full-form universe bucketed by WHICH field is missing and WHY, so effort
 * goes where the most people are affected rather than where the last
 * interesting filing happened to be.
 *
 * Three deliberate choices:
 *
 *  - Full-form filers only. A 5500-SF filer files no audited attachment, so a
 *    missing lineup is the law, not a gap. Counting them would inflate every
 *    bucket with plans that can never be filled.
 *  - Master-trust-held plans are reported SEPARATELY and excluded from the
 *    actionable buckets. Their data lives in the trust's filing; nothing in
 *    the plan's own document can close the gap.
 *  - Sized in PARTICIPANTS as well as dollars. Dollars rank the sponsors;
 *    participants rank the people who open the page and find a blank. They
 *    give different orders, and the second is the one that matters.
 *
 * Usage: node scripts/gap-census.mjs [--top N]
 */
import { loadPlans, loadStatus } from "./lib-schema.mjs";

const TOP = (() => { const i = process.argv.indexOf("--top"); return i > 0 ? +process.argv[i + 1] : 12; })();

const P = loadPlans();
const S = loadStatus();

const B = (v) => (v >= 1e12 ? `$${(v / 1e12).toFixed(2)}T` : v >= 1e9 ? `$${(v / 1e9).toFixed(1)}B` : `$${(v / 1e6).toFixed(0)}M`);
const N = (v) => v.toLocaleString();

const bucket = {};
const add = (key, r, assets, parts) => {
  const b = (bucket[key] = bucket[key] || { n: 0, assets: 0, parts: 0, ex: [] });
  b.n++; b.assets += assets; b.parts += parts;
  if (b.ex.length < 400) b.ex.push({ r, assets, parts });
};

let fullForm = 0, trustHeld = 0;
for (const r of P.rows) {
  if (P.get(r, "sf")) continue;                       // short-form: no attachment is filed, by law
  fullForm++;
  const assets = +P.get(r, "assetsEOY") || 0;
  const parts = +P.get(r, "partEOY") || +P.get(r, "participants") || 0;
  const ack = P.get(r, "ack");
  const s = S.at(ack);
  const mtia = P.get(r, "mtiaAck");

  if (mtia) { trustHeld++; add("Z. master-trust held (excluded — gap lives in the trust filing)", r, assets, parts); continue; }

  /* 1. the fund lineup. Prefer the cause the PARSER recorded (dx, written at
   * parse time since v106). Before that the store kept only an error string,
   * so 1,289 plans landed in "no cause recorded" and the only way to bucket
   * them was to re-download and re-parse a 40-filing sample — sampling error
   * on every estimate, and a fresh download before every investigation. With
   * dx the whole population is bucketed exactly, for free. */
  const DX = {
    nohead:   "A-nohead    no 4i heading anywhere seeded a region",
    noregion: "A-noregion  headings fired, no candidate scored as a table",
    stmt:     "A-stmt      parsed region is a statement/aggregate, not a menu",
    trust:    "A-trust     'interest in master trust' pointer, not a lineup",
    few:      "A-few       fewer than 3 rows",
    "band-lo": "A-band-lo   holdings sum FAR BELOW plan assets",
    "band-hi": "A-band-hi   holdings sum ABOVE plan assets",
    narrow:   "A-narrow    3-4 rows, plausible but too thin to trust",
    consolidated: "A-consolid  NOT OURS: the attachment is CONSOLIDATED — its own declared total exceeds the plan's Schedule H assets, so no part of it is this plan's lineup",
  };
  /* nohead, split by what the DOCUMENT contains. The A-nohead-* rows that
   * begin "NOT OURS" cannot be closed by any parser change: nothing to read.
   * Only readfail/unread are ours. */
  const DS = {
    noattach: "A-nohead-noattach  NOT OURS: no audited attachment in the public copy",
    notable:  "A-nohead-notable   NOT OURS: attachment present, carries no schedule",
    omitted:  "A-nohead-omitted   NOT OURS: filing states the schedule is omitted",
    absent:   "A-nohead-absent    NOT OURS: schedule referenced, pages not published",
    scanned:  "A-nohead-scanned   image-only text — OCR territory, not heading work",
    readfail: "A-nohead-readfail  OURS: statutory header present, we cannot read it",
    unread:   "A-nohead-unread    OURS: table-shaped pages under an unknown heading",
  };
  /* FINAL/TRANSITION-YEAR FILINGS ARE NOT LINEUP GAPS (found 2026-09-08).
   * 6,525 of the remaining "gap" plans filed Schedule H with $0 year-end
   * assets — plans that terminated, merged, or transferred mid-year. 99% of
   * the noregion bucket and 91% of nohead were this. Two mechanisms:
   * with assetsEOY=0 the parser's ratio guard can never accept ANY region
   * (noregion is inevitable when a heading fires), and a wound-down plan
   * usually files no schedule at all (nohead). Red Lobster is the type case:
   * Sch H filed $0 EOY while its own attached audit itemizes $25.2M still in
   * stable value and loans — the FILING is internally inconsistent, not our
   * ingest. These are not plans a participant opens looking for a menu; they
   * are plans that ended. Counted separately so the live-plan gap table stops
   * being 85% ghosts. */
  if (s && !s.c && !(+P.get(r, "assetsEOY"))) {
    add("F. final/transition-year filing — Schedule H reports $0 year-end assets", r, assets, parts);
  }
  else if (!s) add("A1. lineup — no status entry at all (never attempted)", r, assets, parts);
  else if (!s.c) {
    const e = s.e || "";
    if (e === "download") add("A3. lineup — public copy withdrawn from the bucket (403)", r, assets, parts);
    /* "analyze" (2026-09-10) is NOT the same claim. It means a step after the
     * fetch threw, so we know nothing about the filing — and until this split
     * existed both landed in A3, telling readers a filing had been withdrawn
     * when a 20-of-20 random probe answered HTTP 200 every time. */
    else if (e === "analyze") add("A2. lineup — OUR read of the filing threw; the copy is fetchable", r, assets, parts);
    /* v113: a `nohead` plan is not one thing. A RANDOM 30-filing sample of
     * this bucket (2026-09-09) measured 77% with no attachment published at
     * all, 13% an attachment carrying no schedule, 3% explicitly omitted —
     * 93% permanently outside our reach — against ~7% real parser gaps. The
     * `ds` code, recorded at parse time by classifyDocument(), splits them so
     * the actionable remainder is visible instead of buried. */
    else if (s.dx === "nohead" && s.ds && DS[s.ds]) add(DS[s.ds], r, assets, parts);
    else if (s.dx && DX[s.dx]) add(DX[s.dx], r, assets, parts);
    else if (e === "no-section") add("A2. lineup — no readable 4i section (pre-v106, cause not recorded)", r, assets, parts);
    else if (s.tp) add("A4. lineup — bare 'interest in master trust' line, no trust linked", r, assets, parts);
    else if (s.s) add("A5. lineup — schedule FOUND but does not reconcile", r, assets, parts);
    else add("A6. lineup — UNDIAGNOSED (pre-v106 data; re-parse to get a cause)", r, assets, parts);
  }

  /* 2. plan features: match, vesting, Roth. Read from the audit NOTES, a
   *    different extraction path from the 4i schedule — a plan can have a
   *    perfect lineup and no features, which is exactly what 14 of the 30
   *    review-list filings turned out to be. */
  if (!s || !s.f) {
    if (s && s.c) add("B1. features — MISSING although the lineup parsed fine (notes are readable)", r, assets, parts);
    else add("B2. features — missing, and the lineup is missing too", r, assets, parts);
  }

  /* 3. recordkeeper comes from Schedule C, independent of both */
  if (!P.get(r, "recordkeeper")) add("C1. recordkeeper — no Schedule C row identifies one", r, assets, parts);
}

console.log(`\nFULL-FORM UNIVERSE: ${N(fullForm)} plans   (${N(trustHeld)} master-trust held, reported separately)\n`);
const keys = Object.keys(bucket).sort();
console.log("  plans      participants        assets   bucket");
for (const k of keys) {
  const b = bucket[k];
  console.log(`  ${String(N(b.n)).padStart(7)}  ${String(N(b.parts)).padStart(14)}  ${B(b.assets).padStart(10)}   ${k}`);
}

for (const k of keys) {
  if (k.startsWith("Z.")) continue;
  const b = bucket[k];
  if (!b.n) continue;
  console.log(`\n--- ${k} — largest by PARTICIPANTS ---`);
  b.ex.sort((x, y) => y.parts - x.parts);
  for (const x of b.ex.slice(0, TOP)) {
    console.log(`   ${String(N(x.parts)).padStart(9)} participants  ${B(x.assets).padStart(8)}  ${String(P.get(x.r, "sponsorName") || "").trim().slice(0, 46)}`);
  }
}
