#!/usr/bin/env node
/* wampo — size a failure class BEFORE opening any one filing.
 *
 * WHY THIS EXISTS. The recurring expensive mistake is reading one document
 * deeply, building a fix around what that document looks like, and only then
 * discovering how many filings actually share its shape. The US Foods heading
 * defect was real and, measured afterwards, recovered 0 of its 30 target
 * filings. The Medtronic column investigation consumed most of a session
 * before anyone counted.
 *
 * This runs the PRODUCTION parser over a set of acks and reports WHERE each
 * one fails, so the fix is chosen by how many filings it moves rather than by
 * which document happened to get opened first. It answers one question:
 *
 *     of these N filings, how many die at the heading, how many at region
 *     scoring, how many parse but fall outside the confidence band?
 *
 * Those are three different bugs with three different fixes, and eyeballing a
 * PDF cannot tell them apart.
 *
 * Usage:
 *   node scripts/size-class.mjs docs/review-list-verdicts.json "TABLE PRESENT"
 *   node scripts/size-class.mjs acks.txt          # one ack per line
 */
import { readFileSync, existsSync, mkdirSync, unlinkSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { parse4i } from "./lib-4i.mjs";
import { loadPlans, loadStatus } from "./lib-schema.mjs";

/* the exact production predicate — a sizing run that used a different band
 * would classify filings into buckets that do not exist downstream */
const isConfident = (p) =>
  p.funds.length >= 3 && (p.ratio || 0) > 0.45 && (p.ratio || 0) < 1.6 &&
  (p.funds.length >= 5 || ((p.ratio || 0) > 0.7 && (p.ratio || 0) < 1.3)) &&
  !p.stmt && !p.trustPtr;

/* the production region seed, copied deliberately: this script's whole job is
 * to say whether THIS regex fires, so it must be this regex */
const HEAD_RE = /(schedule\s+h.{0,40}line\s*4i|schedule\s+of\s+assets\s*\(held|schedule\s+of\s+assets\s+held)/i;

const src = process.argv[2];
const filter = process.argv[3] || "";
let acks;
if (src.endsWith(".json")) {
  const v = JSON.parse(readFileSync(src, "utf8"));
  acks = Object.keys(v).filter((a) => !filter || String(v[a].verdict || "").includes(filter));
} else {
  acks = readFileSync(src, "utf8").split("\n").map((s) => s.trim()).filter(Boolean);
}

const P = loadPlans();
const S = loadStatus();
const byAck = P.byAck();
const WORK = "/tmp/size-class";
if (!existsSync(WORK)) mkdirSync(WORK, { recursive: true });

const CAUSES = {
  "no-heading": "the 4i heading regex never fires — nothing seeds a region",
  "no-region": "heading fires but no candidate region wins scoring",
  "band-low": "parses, but holdings sum too FAR BELOW plan assets",
  "band-high": "parses, but holdings sum ABOVE plan assets",
  "too-few": "parses inside the band with fewer than 3 rows",
  "stmt": "region scored as a statement fragment, never a menu",
  "trustPtr": "region is an 'interest in master trust' pointer, not a lineup",
  "would-be-confident": "parses confidently NOW — status is stale or OCR-only",
  "unreachable": "the public copy could not be downloaded",
  "not-a-lineup-gap": "lineup is already confident — the gap is features or recordkeeper",
};
const buckets = {};
const detail = [];

for (const ack of acks) {
  const row = byAck.get(ack);
  if (!row) continue;
  const assets = +P.get(row, "assetsEOY") || 0;

  /* A plan can be on a review list for a gap that has nothing to do with the
   * 4i schedule — missing match/vesting/Roth comes from the AUDIT NOTES, and
   * missing recordkeeper comes from Schedule C. Parsing their 4i and finding
   * it healthy is not a discovery, it is the expected result, and reporting
   * it as "14 filings parse confidently now" would have been a false find.
   * Separate them before the parser runs. */
  const st0 = S.at(ack);
  if (st0 && st0.c) {
    const missing = [!st0.f && "features", !P.get(row, "recordkeeper") && "recordkeeper"].filter(Boolean);
    (buckets["not-a-lineup-gap"] = buckets["not-a-lineup-gap"] || []).push(ack);
    detail.push({ ack, cause: "not-a-lineup-gap", assets, seeds: 0, rows: 0, ratio: 0,
      name: String(P.get(row, "sponsorName") || "").trim().slice(0, 34),
      storedErr: `gap: ${missing.join("+") || "none?"}` });
    continue;
  }

  const url = `https://efast2-filings-public.s3.amazonaws.com/prd/${ack.slice(0, 4)}/${ack.slice(4, 6)}/${ack.slice(6, 8)}/${ack}.pdf`;
  const pdf = `${WORK}/${ack}.pdf`;
  let text = "";
  try {
    execFileSync("curl", ["-sfL", "--max-time", "150", "-o", pdf, url], { stdio: "ignore" });
    text = execFileSync("pdftotext", ["-layout", "-q", pdf, "-"], { encoding: "utf8", maxBuffer: 300 * 1024 * 1024 });
  } catch {
    (buckets["unreachable"] = buckets["unreachable"] || []).push(ack);
    try { unlinkSync(pdf); } catch { /* ignore */ }
    continue;
  }
  try { unlinkSync(pdf); } catch { /* ignore */ }

  const seeds = (text.match(new RegExp(HEAD_RE, "gi")) || []).length;
  const p = parse4i(text, assets, String(P.get(row, "sponsorName") || ""), String(P.get(row, "codes") || ""));

  let cause;
  if (!p.found) cause = seeds ? "no-region" : "no-heading";
  else if (p.stmt) cause = "stmt";
  else if (p.trustPtr) cause = "trustPtr";
  else if (isConfident(p)) cause = "would-be-confident";
  else if (p.funds.length < 3) cause = "too-few";
  else if ((p.ratio || 0) <= 0.45) cause = "band-low";
  else cause = "band-high";

  (buckets[cause] = buckets[cause] || []).push(ack);
  const s = S.at(ack);
  detail.push({
    ack, cause, assets, seeds,
    name: String(P.get(row, "sponsorName") || "").trim().slice(0, 34),
    rows: p.found ? p.funds.length : 0,
    ratio: p.found ? +(p.ratio || 0).toFixed(2) : 0,
    storedErr: s ? s.e || "" : "(no status)",
  });
}

const B = (v) => (v >= 1e9 ? `$${(v / 1e9).toFixed(1)}B` : `$${(v / 1e6).toFixed(0)}M`);
console.log(`\nsized ${detail.length} of ${acks.length} filings\n`);
const order = Object.keys(buckets).sort((a, b) => buckets[b].length - buckets[a].length);
for (const c of order) {
  const rows = detail.filter((d) => d.cause === c);
  const dollars = rows.reduce((s, d) => s + d.assets, 0);
  console.log(`${String(rows.length).padStart(3)}  ${c.padEnd(20)} ${B(dollars).padStart(8)}   ${CAUSES[c] || ""}`);
}
console.log("\nper filing:");
console.log("  cause               rows ratio seeds  assets  sponsor / stored error");
for (const d of detail.sort((a, b) => (a.cause < b.cause ? -1 : a.cause > b.cause ? 1 : b.assets - a.assets))) {
  console.log(`  ${d.cause.padEnd(19)} ${String(d.rows).padStart(4)} ${String(d.ratio).padStart(5)} ${String(d.seeds).padStart(5)} ${B(d.assets).padStart(7)}  ${d.name} [${d.storedErr}]`);
}
