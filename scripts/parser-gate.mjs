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
  ["UPenn Health (wrapped subtotal)", "20251015190140NAL0007224432001", 1110204528,
    { found: true, n: 30, sum: 1108624094 }],
  ["Verizon trust (class summary)", "20250922070418NAL0002030595001", 41099764177,
    { found: true, n: 12, sum: 38926187308 }],
  ["CCT 4-row (statement aggregate)", "20250912103135NAL0003410034001", 139583948,
    { found: true, n: 4, sum: 131590242 }],
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
  ["Northrop Grumman", "20260616115726NAL0000593907005", 44357243320,
    { found: true, n: 10, sum: 150128940 }],
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
  // across pages into a fake $197M top "fund" on a statement-page win;
  // with Forward dropped this filing honestly fails the ratio band
  ["Carry-forward subtotals", "20251008154534NAL0005779537001", 295570079,
    { found: true, n: 6, sum: 551546250 }],
  ["Black Hills", "20260623190115NAL0012535394001", 933735584,
    { found: true, n: 21, sum: 911785769 }],
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
