#!/usr/bin/env node
/* wampo parser gate — REQUIRED green before any pipeline run parses the
 * universe. Ten live specimens cover the failure classes that produced
 * real regressions (see docs/accuracy-log.md 2026-08-04): a fund menu
 * with a wrapped subtotal, a form-only filing that must fall through to
 * OCR, a tiny class-aggregate statement, a trustee class summary, a
 * footnote-lettered schedule, and four byte-match lineups.
 *
 * When a parser change INTENTIONALLY moves a specimen, update its
 * expectation in the same commit — that is the review moment the gate
 * exists to force. Run locally: node scripts/parser-gate.mjs */
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { parse4i } from "./lib-4i.mjs";

const SPECIMENS = [
  // [label, ack, assetsEOY, expect]
  ["GE Vernova (footnote letters)", "20251014171116NAL0004605680001", 8206402143,
    { found: true, n: 17, sum: 8083350345 }],
  /* v68: the filler-column class. Before the fix, all 28 of this plan's
   * holdings were stored as "VARIABLE 1,056,601 sh" — the (c) sub-columns
   * ("N/A  VARIABLE  N/A  ... sh  #") beat the real name in column (b).
   * After: FIDELITY 500 INDEX, PIMCO REALPATH BLEND vintages, VANGUARD
   * GROWTH INDEX INSTITUTIONAL. Guards the whole SMART Local 265 class. */
  ["Old Republic (N/A filler columns)", "20250911133230NAL0000243699001", 1400000000,
    { found: true, n: 30, sum: 2079074463 }],
  // v59 +1: "CREF Money Market Account | Registered Investment Companies |
  // 1,193" is a filed holding the sub-$10k residue floor used to hide
  ["UPenn Health (wrapped subtotal)", "20251015190140NAL0007224432001", 1110204528,
    { found: true, n: 31, sum: 1108625287 }],
  ["Verizon trust (class summary)", "20250922070418NAL0002030595001", 41099764177,
    { found: true, n: 12, sum: 38926187308 }],
  // v51's cluster suffix candidates unlocked this filing's REAL 27-fund
  // menu (Contrafund, TRP target dates, ratio 0.995) — the 4-row class
  // aggregate this specimen originally locked in was second-best all along
  ["CCT (real menu via suffix candidates)", "20250912103135NAL0003410034001", 139583948,
    { found: true, n: 27, sum: 138922286 }],
  ["form-only (must leave OCR open)", "20251010094924NAL0012761840001", 74759678,
    { found: false }],
  ["Cochrane (OCR-sourced menu)", "20250924093907NAL0002944403001", 19416362,
    { found: false }],
  ["TK Elevator", "20251008093049NAL0005343377001", 667683248,
    { found: true, n: 34, sum: 658091857 }],
  // v42: spaced dot-leaders (". . . .") between issuer and description
  // columns — counted as "words", they tripped the prose filter and emptied
  // the whole menu (1 junk row from a $41.5B plan)
  ["Costco (spaced leaders)", "20260723165543NAL0014354289001", 41523678630,
    { found: true, n: 30, sum: 38997301000 }],
  // v56: the REAL "$ in thousands" schedule ($39.3B master-trust
  // participation + $4.6B BrokerageLink) replaced a fair-value-note
  // fragment — trust-pointer flagged, so it can never display as a lineup
  ["Northrop Grumman", "20260616115726NAL0000593907005", 44357243320,
    { found: true, n: 3, sum: 43943483000 }],
  ["Kohler (trust interest)", "20251014134011NAL0002916849001", 781346186,
    { found: true, n: 1, sum: 845895707 }],
  // v43: a trust-POINTER page ("Interest in Eaton Savings Trust Master
  // Trust" + stable value) hit 3 rows at ratio 0.99 — incl. a $44k "fund"
  // that was really the sponsor's zip code — and displayed as a confident
  // lineup while the trust's real menu failed on cents-formatted values
  ["Eaton plan (trust pointer)", "20251014081726NAL0003409184002", 8394581291,
    { found: true, n: 2, sum: 8313440378 }],
  ["Eaton trust (cents values)", "20251014082229NAL0001120627001", 8537015596,
    { found: true, n: 51, sum: 8530688968 }],
  // v44: double-rendered schedule whose second rendition glues a "0" cost
  // column onto names — same-name dedup missed it and the region summed
  // both copies (ratio 2.02, lost the lineup)
  ["Plexsys (glued-0 dedup)", "20260706150053NAL0023514192001", 36432027,
    { found: true, n: 32, sum: 37829365 }],
  // v44: page carry-forward subtotals ("Forward $21,786,094 ...") summed
  // across pages into a fake $197M top "fund" on a statement-page win.
  // v46: brokerage vocabulary demoted its statement region. v51's suffix
  // candidates reach the honest result: managed-account rollup (74
  // positions) + real rows (Vanguard 500, Pershing cash)
  ["Carry-forward subtotals", "20251008154534NAL0005779537001", 295570079,
    { found: true, n: 7, sum: 192739241 }],
  // v45: recordkeeper "SUMMARY OF NET TRUST ASSETS" page appended after
  // the real 4i table — same menu in ALL CAPS with cents; v43's cents fix
  // made it readable and the doubled region lost a real 29-fund menu
  ["Sierra Space (rk summary after 4i)", "20251015115746NAL0005999248001", 293042847,
    { found: true, n: 29, sum: 291893410 }],
  // v46: Galliano — raw text has no readable schedule (all-scanned); its
  // OCR'd statement page ("Mutual funds" $584M > plan assets) got
  // confident when v44 removed the OTHER junk rows. Text parse must stay
  // found=false; the OCR-path fix is the STMT_ROW brokerage vocabulary.
  ["Galliano (scanned, OCR statement)", "20251013201846NAL0000931539001", 380897686,
    { found: false }],
  // v52: Empower group-annuity CODE page ("1NTSPI4", "1GGCG50") files
  // under its own SCHEDULE OF ASSETS heading and tied the real schedule
  // at ratio ~0.97 once v43 made its cents columns readable — 28 fund
  // codes displayed as names (Power Design, owner report). The code-page
  // penalty must keep the NAMED rendition winning.
  // v73 +1 row: "Northern Trust Asset Management | NT ACWI ex US IMI Fd DC NL
  // Tier 4  1,985,195" is 15 words with no $, so the whole-line prose guard
  // was eating it. Verified in the filing at line 2155; ratio 0.93 -> 0.95.
  ["Power Design (Empower code page)", "20251015163402NAL0010660226001", 79416197,
    { found: true, n: 28, sum: 75516844 }],
  // v53: section subtotals spelled as class descriptions ("Interest in
  // common/collective trusts $4.47B", "Assets Held for Investment")
  // double-counted the whole schedule to ratio 3.0 — a clean $5.95B
  // trust menu lost (Sempra, owner report)
  ["Sempra trust (class-worded subtotals)", "20260710080100NAL0000893043001", 5960266194,
    { found: true, n: 31, sum: 5951844380 }],
  // v59 +1: "Schwab U.S. Treasury Money Fund 2,784" — the notes confirm the
  // holding ("the Plan held Schwab U.S. Treasury Money Fund of $2,784")
  ["Black Hills", "20260623190115NAL0012535394001", 933735584,
    { found: true, n: 22, sum: 911788553 }],
  /* v73 specimens — four filings whose real menus lost to a class-label or
   * house-total page. Each pins a different half of the fix; all four were
   * found by reading the v69->v71 confidence losses one by one. */
  // wide laid-out rows read as prose: twelve "GREAT GRAY CAP GROUP 20XX
  // TARGET DATE TR CL CT" rows are 16 words with no $ (Ramos Oil)
  ["Ramos Oil (wide rows read as prose)", "20260105123510NAL0007177842001", 17544597,
    { found: true, n: 27, sum: 17537726 }],
  // "Vanguard | Total Intl Bd Idx Admiral" died on the spaced-letter subtotal
  // guard's "Bd"; losing that $5,394 row broke arithmetic subtotal detection
  // downstream and doubled the region (Reliance One)
  ["Reliance One (Total-prefixed fund name)", "20250926115624NAL0003997507001", 4979584,
    { found: true, n: 26, sum: 4873717 }],
  // a recordkeeper page of bare house totals ("Fidelity $8,971,947") beat the
  // filed 21-fund schedule on closeness (Producers Rice Mill)
  ["Producers Rice (house-total page)", "20251009155148NAL0006843793001", 23935999,
    { found: true, n: 10, sum: 21945392 }],
  // broken font encoding injects spaces inside words, so a per-cell word cap
  // still ate seven holdings worth $18.4M (Ebara)
  ["Ebara (spaced-letter wide rows)", "20251010185246NAL0004866995001", 53096393,
    { found: true, n: 23, sum: 52038566 }],
];

const work = mkdtempSync(path.join(tmpdir(), "gate-"));
let failed = 0;

for (const [label, ack, assets, expect] of SPECIMENS) {
  const url = `https://efast2-filings-public.s3.amazonaws.com/prd/${ack.slice(0, 4)}/${ack.slice(4, 6)}/${ack.slice(6, 8)}/${ack}.pdf`;
  const pdf = path.join(work, ack + ".pdf");
  let text = null;
  for (let attempt = 0; attempt < 3 && text === null; attempt++) {
    try {
      execFileSync("curl", ["-sf", "--retry", "2", "-o", pdf, url]);
      text = execFileSync("pdftotext", ["-layout", "-q", pdf, "-"],
        { encoding: "utf8", maxBuffer: 200 * 1024 * 1024 });
    } catch { await new Promise((r) => setTimeout(r, 3000 * (attempt + 1))); }
  }
  if (text === null) {
    // an unreachable specimen must not block the pipeline — S3 removals
    // happen (withdrawn filings); report loudly and move on
    console.log(`GATE SKIP  ${label}: specimen unreachable after retries`);
    continue;
  }
  const p = parse4i(text, assets, "", "");
  const n = (p.funds || []).length;
  const sum = (p.funds || []).reduce((s, f) => s + (f.value || 0), 0);
  const ok = p.found === expect.found &&
    (expect.n === undefined || n === expect.n) &&
    (expect.sum === undefined || sum === expect.sum);
  console.log(`GATE ${ok ? "OK  " : "FAIL"} ${label}: found=${p.found} n=${n} sum=${sum}` +
    (ok ? "" : ` (expected found=${expect.found} n=${expect.n ?? "-"} sum=${expect.sum ?? "-"})`));
  if (!ok) failed++;
}

if (failed) {
  console.error(`\nparser gate: ${failed} specimen(s) regressed — refusing to parse the universe.`);
  console.error("If the change is intentional, update the expectation in scripts/parser-gate.mjs in the same commit.");
  process.exit(1);
}
console.log("\nparser gate: all specimens green");
