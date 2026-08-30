#!/usr/bin/env node
/* wampo — hands-on filing review sampler with a COMPANY-level memory.
 *
 * The accuracy protocol requires sampling real filings every cycle and reading
 * them against the extraction. Two things made that cost more than it should:
 * the downloaded corpus lives in an ephemeral scratch dir and vanishes between
 * sessions, and nothing recorded WHICH COMPANIES had already been read. So the
 * same sponsors kept coming back — a plan can be re-sampled under a different
 * class, and a sponsor with several plans can be re-sampled under each of them.
 *
 * This script is the single entry point for picking review filings. It:
 *   - excludes every EIN already recorded in docs/reviewed-filings.jsonl
 *   - allows one plan per EIN inside a single sample
 *   - records what it handed out, so the next cycle starts where this one left
 *
 * Usage:
 *   node scripts/sample-filings.mjs <class> [count] [--allow-repeat] [--dry]
 *
 * Classes (each is a stored-data predicate, so the sample is the class):
 *   vesting-quote-only   vesting sentence located, no label extracted
 *   match-quote-only     match sentence located, no formula extracted
 *   no-features          full-form filing parsed, no audited-note features
 *   no-lineup            no confident 4i lineup despite a full-form filing
 *
 * Output is a review table plus the extractor's current answer per filing, and
 * the picks are appended to the ledger unless --dry is given.
 */
import { readFileSync, writeFileSync, appendFileSync, existsSync, mkdirSync, readdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";

const LEDGER = "docs/reviewed-filings.jsonl";
const WORK = process.env.REVIEW_DIR || "/tmp/wampo-review";

const [, , className, countArg, ...flags] = process.argv;
const COUNT = Number(countArg) || 12;
const ALLOW_REPEAT = flags.includes("--allow-repeat");
const DRY = flags.includes("--dry");

if (!className) {
  console.error("usage: node scripts/sample-filings.mjs <class> [count] [--allow-repeat] [--dry]");
  process.exit(1);
}

/* ---- what has already been read, by COMPANY ------------------------------ */
const reviewedEins = new Set();
const reviewedAcks = new Set();
if (existsSync(LEDGER)) {
  for (const line of readFileSync(LEDGER, "utf8").split("\n")) {
    if (!line.trim()) continue;
    try {
      const r = JSON.parse(line);
      if (r.ein) reviewedEins.add(String(r.ein));
      if (r.ack) reviewedAcks.add(r.ack);
    } catch { /* a truncated tail line is not worth failing the sample over */ }
  }
}
console.log(`ledger: ${reviewedAcks.size} filings across ${reviewedEins.size} companies already reviewed`);

/* ---- the universe, and the stored parse ---------------------------------- */
const all = JSON.parse(readFileSync("plans-all.json", "utf8"));
const F = Object.fromEntries(all.fields.map((f, i) => [f, i]));
const g = (r, k) => r[F[k]];

const entries = {};
for (const f of readdirSync("data/lineups")) {
  Object.assign(entries, JSON.parse(readFileSync("data/lineups/" + f, "utf8")));
}

const CLASSES = {
  "vesting-quote-only": (r, e) => e && e.features && e.features.vestingText && !e.features.vesting,
  "match-quote-only": (r, e) => e && e.features && e.features.matchText && !e.features.match,
  "no-features": (r, e) => !g(r, "sf") && (!e || !e.features),
  "no-lineup": (r, e) => !g(r, "sf") && (!e || !e.confident || !e.funds || !e.funds.length),
};
const pred = CLASSES[className];
if (!pred) {
  console.error(`unknown class "${className}" — known: ${Object.keys(CLASSES).join(", ")}`);
  process.exit(1);
}

/* ---- pick: one plan per company, skipping companies already read ---------- */
const picks = [];
const seenEin = new Set();
// biggest first: a defect on a large plan reaches more participants, and the
// large plans are also the ones an owner is most likely to check by hand
const rows = [...all.plans].sort((a, b) => (g(b, "assetsEOY") || 0) - (g(a, "assetsEOY") || 0));
for (const r of rows) {
  if (picks.length >= COUNT) break;
  const ein = String(g(r, "ein"));
  if (seenEin.has(ein)) continue;            // one plan per company per sample
  if (!ALLOW_REPEAT && reviewedEins.has(ein)) continue; // and never a company twice
  const ack = g(r, "ack");
  if (reviewedAcks.has(ack)) continue;
  if (!pred(r, entries[ack])) continue;
  seenEin.add(ein);
  picks.push({ ack, ein, pn: String(g(r, "pn")), sponsor: String(g(r, "sponsorName")),
    plan: String(g(r, "planName")), assets: g(r, "assetsEOY") || 0, participants: g(r, "participants") || 0 });
}

if (!picks.length) {
  console.log(`no unreviewed companies left in class "${className}" — every candidate company is in the ledger.`);
  console.log("re-run with --allow-repeat only if you intend to re-read a company.");
  process.exit(0);
}

console.log(`\nclass "${className}": ${picks.length} filings, ${picks.length} distinct companies\n`);

/* ---- fetch, extract, and show the extractor's current answer -------------- */
mkdirSync(WORK, { recursive: true });
const { extractPlanFeatures } = await import("./lib-4i.mjs");
const out = [];
for (const p of picks) {
  const url = `https://efast2-filings-public.s3.amazonaws.com/prd/${p.ack.slice(0, 4)}/${p.ack.slice(4, 6)}/${p.ack.slice(6, 8)}/${p.ack}.pdf`;
  const pdf = path.join(WORK, p.ack + ".pdf"), txt = path.join(WORK, p.ack + ".txt");
  let text = null;
  try {
    if (!existsSync(txt)) {
      execFileSync("curl", ["-sf", "--retry", "2", "--max-time", "240", "-o", pdf, url]);
    } else text = readFileSync(txt, "utf8");
  } catch {
    // the filing itself is not retrievable — withdrawn from the bucket, or S3
    // is refusing. Say which failure this is: a review pass that reports a
    // missing TOOL as a missing FILING sends the next cycle chasing the wrong
    // thing (this script did exactly that on its first run, when the container
    // came back without poppler installed).
    console.log(`${p.sponsor} (${p.ack.slice(0, 14)}): filing not retrievable from EFAST2`);
    out.push({ ...p, class: className, reviewed: new Date().toISOString(), result: "download-failed" });
    continue;
  }
  if (text === null) {
    try {
      text = execFileSync("pdftotext", ["-layout", "-q", pdf, "-"], { encoding: "utf8", maxBuffer: 200 * 1024 * 1024 });
      writeFileSync(txt, text);
    } catch (e) {
      const missing = /ENOENT/.test(String(e && e.code));
      console.log(`${p.sponsor} (${p.ack.slice(0, 14)}): ${missing
        ? "pdftotext is not installed — run: apt-get update && apt-get install -y poppler-utils tesseract-ocr"
        : "pdftotext could not read this PDF"}`);
      if (missing) process.exit(1); // every remaining filing would fail the same way
      out.push({ ...p, class: className, reviewed: new Date().toISOString(), result: "pdftotext-failed" });
      continue;
    }
  }
  const ff = extractPlanFeatures(text) || {};
  const money = (v) => v >= 1e9 ? `$${(v / 1e9).toFixed(1)}B` : `$${Math.round(v / 1e6)}M`;
  console.log(`\n=== ${p.sponsor} — ${p.plan}`);
  console.log(`    EIN ${p.ein}|${p.pn} · ${p.participants.toLocaleString("en-US")} participants · ${money(p.assets)} · ${p.ack}`);
  console.log(`    vesting: ${ff.vesting || "(none)"}`);
  if (ff.vestingText) console.log(`      "${ff.vestingText.replace(/\s+/g, " ").slice(0, 220)}"`);
  console.log(`    match:   ${ff.match || "(none)"}`);
  if (ff.matchText) console.log(`      "${ff.matchText.replace(/\s+/g, " ").slice(0, 220)}"`);
  out.push({ ...p, class: className, reviewed: new Date().toISOString(),
    vesting: ff.vesting || null, match: ff.match || null, textPath: txt });
}

if (DRY) {
  console.log("\n--dry: nothing written to the ledger");
} else {
  appendFileSync(LEDGER, out.map((o) => JSON.stringify(o)).join("\n") + "\n");
  console.log(`\nrecorded ${out.length} filings in ${LEDGER} — these companies will not be sampled again`);
}
