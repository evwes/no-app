#!/usr/bin/env node
/* wampo — fetch each plan's full Form 5500 filing PDF from EFAST2's public S3
 * bucket and parse the "Schedule H, line 4i — Schedule of Assets" attachment
 * into a structured fund lineup. Writes lineups-status.json (metadata for
 * every attempted filing) plus data/lineups/ shards and lineups-index.json.
 *
 * PDF location (discovered via the 5500 Search app config):
 *   https://efast2-filings-public.s3.amazonaws.com/prd/YYYY/MM/DD/{ACK_ID}.pdf
 * where YYYY/MM/DD is the ACK_ID's own timestamp prefix.
 *
 * Requires pdftotext (poppler-utils). Runs in GitHub Actions.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync, createWriteStream, statSync, unlinkSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { pipeline } from "node:stream/promises";
import path from "node:path";
import { parse4i, extractPlanFeatures, PARSER_VERSION } from "./lib-4i.mjs";

const S3 = "https://efast2-filings-public.s3.amazonaws.com/prd";
const WORK = process.env.WORK_DIR_4I || "/tmp/f5500-pdfs";
mkdirSync(WORK, { recursive: true });
// how many NEW filings to fetch this run (batches accumulate across runs)
const BATCH = process.env.BATCH_4I ? +process.env.BATCH_4I : 5000;
const TOP_N = process.env.TOP_4I ? +process.env.TOP_4I : 62000;

/* Build the work list: every S&P-tagged plan + the top N universe plans by
 * assets, skipping acks already parsed into lineups.json (incremental). */
function buildWorkList() {
  const wanted = [];
  const seen = new Set();
  try {
    const all = JSON.parse(readFileSync("plans-all.json", "utf8"));
    const F = all.fields;
    const i = Object.fromEntries(F.map((f, x) => [f, x]));
    const rows = all.plans; // already sorted by assets desc
    for (let r = 0; r < rows.length; r++) {
      const row = rows[r];
      const isTop = r < TOP_N;
      const isTicker = !!row[i.ticker];
      if (!isTop && !isTicker) continue;
      const ack = row[i.ack];
      if (!ack || seen.has(ack)) continue;
      seen.add(ack);
      wanted.push({
        ack, ticker: row[i.ticker] || "",
        ein: row[i.ein], pn: row[i.pn],
        planYear: row[i.planYear],
        assetsEOY: row[i.assetsEOY] || 0,
        label: row[i.sponsorName],
      });
    }
  } catch (e) {
    console.error("plans-all.json missing or unreadable — run build-data.mjs first:", e.message);
    process.exit(1);
  }
  return wanted;
}

/* State lives in two places (a single lineups.json outgrew GitHub's 100MB
 * file limit): lineups-status.json holds compact per-ack metadata for EVERY
 * attempted filing (parse version, confident, error), and the 64 shard files
 * under data/lineups/ hold the actual funds for confident lineups only. */
const SHARDS = 64;
const shardOf = (ack) => {
  let h = 0;
  for (const c of ack) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return h % SHARDS;
};
const shardName = (i) => `data/lineups/${String(i).padStart(2, "0")}.json`;
mkdirSync("data/lineups", { recursive: true });

const buckets = Array.from({ length: SHARDS }, () => ({}));
for (let i = 0; i < SHARDS; i++) {
  try { Object.assign(buckets[i], JSON.parse(readFileSync(shardName(i), "utf8"))); } catch { /* first run */ }
}
let status = { plans: {} };
try { status = JSON.parse(readFileSync("lineups-status.json", "utf8")); } catch { /* first run */ }

function pdfUrl(ack) {
  return `${S3}/${ack.slice(0, 4)}/${ack.slice(4, 6)}/${ack.slice(6, 8)}/${ack}.pdf`;
}

async function download(url, dest) {
  if (existsSync(dest) && statSync(dest).size > 0) return true;
  const res = await fetch(url, {
    headers: { "User-Agent": "wampo-research/1.0" },
    signal: AbortSignal.timeout(60000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  await pipeline(res.body, createWriteStream(dest));
  return true;
}

/* ---- main ---------------------------------------------------------------- */

const summary = [];
// entries parsed before the securities detail was kept need one more pass
const needsSma = new Set();
for (const b of buckets) {
  for (const [ack, e] of Object.entries(b)) {
    if (!e.sma && e.funds && e.funds.some((f) => f.name.startsWith("Individually listed securities"))) needsSma.add(ack);
  }
}
// reparse anything from an older parser version (or never parsed at all)
const work = buildWorkList().filter((p) => !status.plans[p.ack] || (status.plans[p.ack].pv || 1) !== PARSER_VERSION || needsSma.has(p.ack));
console.log(`work list: ${work.length} filings to (re)parse at parser v${PARSER_VERSION}; fetching up to ${BATCH} this run`);
let fetched = 0;

function record(plan, entry, features) {
  if (features) entry.features = features;
  status.plans[plan.ack] = { pv: PARSER_VERSION, c: entry.confident ? 1 : 0, s: entry.sdba ? 1 : 0, ...(features ? { f: 1 } : {}), ...(entry.error ? { e: entry.error } : {}) };
  const b = buckets[shardOf(plan.ack)];
  if ((entry.confident && entry.funds.length) || features) b[plan.ack] = entry;
  else delete b[plan.ack];
}

for (const plan of work) {
  if (fetched >= BATCH) break;
  fetched++;
  const url = pdfUrl(plan.ack);
  const dest = path.join(WORK, plan.ack + ".pdf");
  const tag = `${plan.ticker || plan.label} (${plan.ack.slice(0, 14)})`;
  try {
    await download(url, dest);
  } catch (e) {
    summary.push(`${tag}: download failed ${e.message}`);
    record(plan, { confident: false, error: "download", funds: [] });
    continue;
  }
  let text;
  try {
    text = execFileSync("pdftotext", ["-layout", "-q", dest, "-"], {
      encoding: "utf8", maxBuffer: 200 * 1024 * 1024,
    });
  } catch (e) {
    summary.push(`${tag}: pdftotext failed`);
    record(plan, { confident: false, error: "pdftotext", funds: [] });
    try { unlinkSync(dest); } catch { /* ignore */ }
    continue;
  }
  try { unlinkSync(dest); } catch { /* keep disk bounded */ }

  // plan features (match formula, vesting, Roth, auto-enroll) live in the
  // audit notes and exist even when the 4i table can't be parsed
  const features = extractPlanFeatures(text);

  const parsed = parse4i(text, plan.assetsEOY, plan.label || "");
  if (!parsed.found) {
    summary.push(`${tag}: no 4i section found`);
    record(plan, { confident: false, error: "no-section", funds: [] }, features);
    continue;
  }
  const ratio = parsed.ratio || 0;
  const confident = parsed.funds.length >= 3 && ratio > 0.45 && ratio < 1.6;
  record(plan, {
    ack: plan.ack,
    ticker: plan.ticker,
    planYear: plan.planYear,
    sdba: parsed.sdba,
    thousands: parsed.thousands,
    confident,
    coverageRatio: +ratio.toFixed(2),
    funds: parsed.funds,
    sma: parsed.sma,
    source: `Schedule H line 4i attachment, plan year ${plan.planYear} filing`,
  }, features);
  summary.push(`${tag}: ${parsed.funds.length} rows, cov ${(ratio * 100).toFixed(0)}%, sdba=${parsed.sdba}, ok=${confident}`);
  await new Promise((r) => setTimeout(r, 150)); // be polite to the bucket
}

status.generated = new Date().toISOString();
writeFileSync("lineups-status.json", JSON.stringify(status));
const index = {};
for (let i = 0; i < SHARDS; i++) {
  writeFileSync(shardName(i), JSON.stringify(buckets[i]));
  for (const [ack, e] of Object.entries(buckets[i])) {
    const hasLineup = e.confident && e.funds && e.funds.length ? 1 : 0;
    index[ack] = hasLineup | (hasLineup && e.sdba ? 2 : 0) | (e.features ? 4 : 0);
  }
}
writeFileSync("lineups-index.json", JSON.stringify({ generated: new Date().toISOString(), shards: SHARDS, plans: index }));

console.log(summary.slice(0, 200).join("\n"));
const vals = Object.values(status.plans);
const ok = vals.filter((p) => p.c).length;
console.log(`\nlineups: ${vals.length} total parsed, ${ok} confident, ${fetched} fetched this run`);
