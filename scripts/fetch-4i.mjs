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
import { readFileSync, writeFileSync, mkdirSync, existsSync, createWriteStream, statSync, unlinkSync, readdirSync, rmSync } from "node:fs";
import { execFileSync, execFile } from "node:child_process";
import { pipeline } from "node:stream/promises";
import path from "node:path";
import { parse4i, extractPlanFeatures, indexFlags, PARSER_VERSION } from "./lib-4i.mjs";

/* OCR fallback: ~half the "no 4i section" filings have a SCANNED auditor
 * attachment (zero extractable text) and many others have broken font
 * encodings that extract as cipher-garbage. Rasterize just those pages and
 * OCR them, then re-run the normal parser on the combined text. Bump
 * OCR_VERSION to re-attempt every no-section filing. */
const OCR_VERSION = 3; // v3: page targeting — strip-scan finds the schedule pages; big scans re-attempt
const OCR_MAX_PAGES = 40; // full-OCR budget per filing; TARGETING picks which 40
const OCR_SKIP_BAD = 250; // strip-scan makes big scans affordable; only 250+ page monsters skip
let hasOcrTools = true;
try { execFileSync("tesseract", ["--version"], { stdio: "ignore" }); execFileSync("pdftoppm", ["-v"], { stdio: "ignore" }); }
catch { hasOcrTools = false; console.log("tesseract/pdftoppm missing — OCR fallback disabled"); }

/* Pages needing OCR: near-empty (scanned image) or mostly non-letters
 * (subset-font cipher text like "&GFG3>G@6" for "Mutual Fund"). */
function findBadPages(text) {
  const pages = text.split("\f");
  // pdftotext ends output with one \f, leaving ONE empty split artifact.
  // Popping ALL trailing empties (a while-loop here once) deleted entire
  // tail-of-file scanned attachments — the most common layout — before
  // detection ever saw them. Pop exactly one.
  if (pages.length && !pages[pages.length - 1].trim()) pages.pop();
  const bad = [];
  for (let i = 0; i < pages.length; i++) {
    const t = pages[i];
    const chars = (t.match(/\S/g) || []).length;
    const letters = (t.match(/[a-zA-Z]/g) || []).length;
    // control characters never appear in honest pdftotext output — a page
    // full of them is subset-font cipher even when its letter ratio looks
    // fine (Avista 401(k): schedule pages at 63% letters slipped past the
    // ratio test and their cipher text silently lost the whole menu)
    const ctl = (t.match(/[\x00-\x08\x0b\x0e-\x1f]/g) || []).length;
    if (chars < 50 || (chars > 200 && letters / chars < 0.5) || ctl > 15) bad.push(i + 1);
  }
  return bad;
}

/* PAGE TARGETING (v3): for scans too big to OCR whole, find the schedule
 * pages first. Renders only the TOP STRIP of each page (3in at 100dpi —
 * headings live there) and OCRs the strips; a strip costs ~1-2s vs ~30s+
 * for a full page. Schedules also live at the END of filings, so the old
 * "first 40 bad pages" slice usually OCR'd financial statements and
 * missed the menu entirely; >120-page scans were skipped outright. */
async function stripScan(pdfPath, pages, workDir) {
  mkdirSync(workDir, { recursive: true });
  for (const p of pages) {
    try {
      execFileSync("pdftoppm", ["-r", "100", "-gray", "-y", "0", "-H", "300",
        "-f", String(p), "-l", String(p), pdfPath, path.join(workDir, "s" + String(p).padStart(4, "0"))]);
    } catch { /* damaged page — no strip */ }
  }
  const imgs = readdirSync(workDir).filter((f) => /\.p[gpb]m$/.test(f)).sort();
  const byPage = {};
  let next = 0;
  async function worker() {
    while (next < imgs.length) {
      const mine = next++;
      const page = +imgs[mine].slice(1, 5);
      byPage[page] = await new Promise((resolve) => {
        execFile("tesseract", [path.join(workDir, imgs[mine]), "stdout", "--psm", "6"],
          { encoding: "utf8", maxBuffer: 8 * 1024 * 1024, env: { ...process.env, OMP_THREAD_LIMIT: "1" } },
          (e, out) => resolve(out || ""));
      });
    }
  }
  await Promise.all([worker(), worker(), worker(), worker()]);
  rmSync(workDir, { recursive: true, force: true });
  return byPage;
}

// OCR-garble-tolerant 4i heading vocabulary for strip text
const STRIP_HEAD = /schedu[l1i]e\s*h\b|[l1i]ine\s*4\s*\(?\s*i\s*\)?|schedu[l1i]e\s*of\s*assets|assets\s*.{0,4}he[l1i]d\s*for\s*investment/i;

/* choose which bad pages deserve full OCR: heading hits + 2 continuation
 * pages each; no hits → the LAST 40 (schedules sit at the end) */
function targetPages(badPages, stripText) {
  const badSet = new Set(badPages);
  const hits = badPages.filter((p) => STRIP_HEAD.test(stripText[p] || ""));
  if (!hits.length) return badPages.slice(-OCR_MAX_PAGES);
  const chosen = new Set();
  for (const h of hits) for (const q of [h, h + 1, h + 2]) if (badSet.has(q)) chosen.add(q);
  return [...chosen].sort((a, b) => a - b).slice(0, OCR_MAX_PAGES);
}

async function ocrPages(pdfPath, badPages, workDir) {
  const take = badPages.slice(0, OCR_MAX_PAGES);
  mkdirSync(workDir, { recursive: true });
  // one pdftoppm call PER PAGE: rendering merged ranges let a single
  // damaged page (broken Type 3 glyphs) kill the whole invocation and
  // silently drop every later page in the range — Cochrane lost pages
  // 29-34 (the fund schedule) exactly that way and its 21-fund menu with
  // them. Per-page, a crash costs only its own page.
  for (const p of take) {
    try {
      execFileSync("pdftoppm", ["-r", "200", "-gray", "-f", String(p), "-l", String(p), pdfPath, path.join(workDir, "pg")]);
    } catch { /* damaged page renders what it can */ }
  }
  const imgs = readdirSync(workDir).filter((f) => /\.p[gpb]m$/.test(f)).sort().map((f) => path.join(workDir, f));
  const results = new Array(imgs.length).fill("");
  let next = 0;
  async function worker() {
    while (next < imgs.length) {
      const mine = next++;
      results[mine] = await new Promise((resolve) => {
        // OMP_THREAD_LIMIT=1: tesseract's own multithreading burns 4x CPU for
        // HALF the speed (measured), and 4 workers x 4 OMP threads thrashed the
        // 4-core runner to ~20 min per filing. Parallelism stays process-level.
        execFile("tesseract", [imgs[mine], "stdout", "--psm", "6", "-c", "preserve_interword_spaces=1"],
          { encoding: "utf8", maxBuffer: 64 * 1024 * 1024, env: { ...process.env, OMP_THREAD_LIMIT: "1" } },
          (e, out) => resolve(out || ""));
      });
    }
  }
  await Promise.all([worker(), worker(), worker(), worker()]);
  rmSync(workDir, { recursive: true, force: true });
  return results.join("\f");
}

const S3 = "https://efast2-filings-public.s3.amazonaws.com/prd";
const WORK = process.env.WORK_DIR_4I || "/tmp/f5500-pdfs";
mkdirSync(WORK, { recursive: true });
// OCR text cache (Actions cache mounts it): keyed by ack + OCR_VERSION so
// PARSER_VERSION bumps stop re-rasterizing ~12k scanned filings (~4h/run)
const OCR_CACHE = process.env.OCR_CACHE_DIR || "";
if (OCR_CACHE) mkdirSync(OCR_CACHE, { recursive: true });
// prior-year fallback map from prep (fallbacks.json is artifact-only):
// primary ack -> { a: prior full-form ack, y: its plan year }
let FALLBACKS = {};
try { FALLBACKS = JSON.parse(readFileSync("fallbacks.json", "utf8")).acks || {}; }
catch { console.log("fallbacks.json absent — prior-year fallback disabled this run"); }
// how many NEW filings to fetch this run (batches accumulate across runs)
const BATCH = process.env.BATCH_4I ? +process.env.BATCH_4I : 5000;
// the >=100-participant floor already bounds the universe; parse everything
const TOP_N = process.env.TOP_4I ? +process.env.TOP_4I : 999999;
// matrix mode: this job processes work items where index % PARSE_SHARDS === PARSE_SHARD
// and writes a results-<shard>.json delta instead of rewriting the stores
const PARSE_SHARD = process.env.PARSE_SHARD != null ? +process.env.PARSE_SHARD : null;
const PARSE_SHARDS = process.env.PARSE_SHARDS ? +process.env.PARSE_SHARDS : 1;

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
    let fullFormSeen = 0; // TOP_N must count full-form rows, not table rows —
    // the table interleaves SF filers that are excluded from parsing
    for (let r = 0; r < rows.length; r++) {
      const row = rows[r];
      if (i.sf != null && row[i.sf]) continue; // 5500-SF filers attach no audited fund schedule
      fullFormSeen++;
      const isTop = fullFormSeen <= TOP_N;
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
        codes: i.codes != null ? row[i.codes] || "" : "",
      });
    }
  } catch (e) {
    console.error("plans-all.json missing or unreadable — run build-data.mjs first:", e.message);
    process.exit(1);
  }
  // master-trust filings: parse their 4i so member plans can show trust holdings
  try {
    const m = JSON.parse(readFileSync("mtias.json", "utf8"));
    for (const t of m.trusts) {
      if (seen.has(t.ack)) continue;
      seen.add(t.ack);
      wanted.push({ ack: t.ack, ticker: "", planYear: t.planYear, assetsEOY: t.assetsEOY || 0, label: `MTIA: ${t.name}` });
    }
  } catch { /* no trusts yet */ }
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
// A job that hits the Actions timeout never uploads its artifact — hours of
// OCR work vanish (measured: 20 shards × 5.9h lost). Stop cleanly inside the
// budget instead: the partial delta uploads, ov markers persist, and the next
// run continues from the remainder.
const TIME_BUDGET_MIN = process.env.TIME_BUDGET_MIN ? +process.env.TIME_BUDGET_MIN : 0;
const runStart = Date.now();
// entries parsed before the securities detail was kept need one more pass
const needsSma = new Set();
for (const b of buckets) {
  for (const [ack, e] of Object.entries(b)) {
    if (!e.sma && e.funds && e.funds.some((f) => f.name.startsWith("Individually listed securities"))) needsSma.add(ack);
  }
}
// reparse anything from an older parser version (or never parsed at all);
// no-section filings additionally re-enter the queue when OCR_VERSION moves
let work = buildWorkList().filter((p) => {
  const st = status.plans[p.ack];
  if (!st || (st.pv || 1) !== PARSER_VERSION || needsSma.has(p.ack)) return true;
  return st.e === "no-section" && (st.ov || 0) !== OCR_VERSION;
});
const ocrCandidates = work.filter((p) => (status.plans[p.ack] || {}).e === "no-section").length;
if (PARSE_SHARD != null) work = work.filter((_, i) => i % PARSE_SHARDS === PARSE_SHARD);
console.log(`work list: ${work.length} filings to (re)parse at parser v${PARSER_VERSION}` +
  (PARSE_SHARD != null ? ` (matrix shard ${PARSE_SHARD}/${PARSE_SHARDS})` : "") + `; fetching up to ${BATCH} this run`);
console.log(`ocr candidates: ${ocrCandidates}`);
let fetched = 0;

const delta = { status: {}, entries: {} };
function record(plan, entry, features) {
  if (features) entry.features = features;
  const meta = { pv: PARSER_VERSION, ov: OCR_VERSION, c: entry.confident ? 1 : 0, s: entry.sdba ? 1 : 0, ...(features ? { f: 1 } : {}), ...(entry.error ? { e: entry.error } : {}), ...(entry.fb ? { fb: entry.fb } : {}), ...(entry.trustPtr ? { tp: 1 } : {}) };
  status.plans[plan.ack] = meta;
  delta.status[plan.ack] = meta;
  const keep = (entry.confident && entry.funds.length) || features;
  delta.entries[plan.ack] = keep ? entry : null;
  const b = buckets[shardOf(plan.ack)];
  if (keep) b[plan.ack] = entry;
  else delete b[plan.ack];
}

/* lineup confidence: shared by the primary and fallback attempts */
function isConfident(parsed) {
  const ratio = parsed.ratio || 0;
  // tiny parses get a tighter band: every junk fair-value-table parse the
  // audit caught (MP Materials, Ruhlin, Food Express — 3 rows summing both
  // comparative-year columns) landed at ratio 1.5-1.6 with exactly 3 rows,
  // while genuine 3-4 row lineups sit near 1.0
  return parsed.funds.length >= 3 && ratio > 0.45 && ratio < 1.6 &&
    (parsed.funds.length >= 5 || (ratio > 0.7 && ratio < 1.3)) &&
    !parsed.stmt && // statement-vocabulary fragments are never a real menu
    !parsed.trustPtr; // "interest in master trust" pages point AT a lineup, they aren't one
}

/* download + extract + parse (with OCR fallback) for ONE ack. Throws on
 * download failure — the caller decides whether that clobbers status
 * (primary) or is silently ignored (prior-year fallback attempt). */
async function analyzePdf(ack, plan, tag) {
  const dest = path.join(WORK, ack + ".pdf");
  await download(pdfUrl(ack), dest);
  let text;
  try {
    text = execFileSync("pdftotext", ["-layout", "-q", dest, "-"], {
      encoding: "utf8", maxBuffer: 200 * 1024 * 1024,
    });
  } catch {
    try { unlinkSync(dest); } catch { /* ignore */ }
    return { err: "pdftotext" };
  }
  // plan features (match formula, vesting, Roth, auto-enroll) live in the
  // audit notes and exist even when the 4i table can't be parsed
  let features = extractPlanFeatures(text);
  let parsed = parse4i(text, plan.assetsEOY, plan.label || "", plan.codes || "");
  let usedOcr = false;

  // scanned or cipher-encoded attachments: OCR just the unreadable pages and
  // re-run the same parser on the combined text. Trigger on a MISSING 4i
  // *or* missing features — v43 made cents-formatted schedules readable,
  // parsed.found went true for filings whose audit NOTES are scanned, OCR
  // stopped running, and 902 plans silently lost their match/vesting
  // features (the OCR cache makes the retry cheap for that class)
  if ((!parsed.found || !features) && hasOcrTools) {
    const bad = findBadPages(text);
    if (bad.length >= 3 && bad.length <= OCR_SKIP_BAD) {
      try {
        const cacheFile = OCR_CACHE ? path.join(OCR_CACHE, `${ack}.v${OCR_VERSION}.txt`) : null;
        let otext = null;
        if (cacheFile) { try { otext = readFileSync(cacheFile, "utf8"); } catch { /* cache miss */ } }
        if (otext === null) {
          const t0 = Date.now();
          let pages = bad;
          if (bad.length > OCR_MAX_PAGES) {
            const strips = await stripScan(dest, bad, path.join(WORK, "strips-" + ack.slice(-12)));
            pages = targetPages(bad, strips);
            console.log(`${tag}: strip-scan ${bad.length} bad pages → targeting ${pages.length}`);
          }
          otext = await ocrPages(dest, pages, path.join(WORK, "ocr-" + ack.slice(-12)));
          console.log(`${tag}: ocr ${Math.min(pages.length, OCR_MAX_PAGES)} pages in ${((Date.now() - t0) / 1000).toFixed(0)}s`);
          if (cacheFile && otext) { try { writeFileSync(cacheFile, otext); } catch { /* best-effort */ } }
        }
        if (otext && otext.replace(/\s+/g, "").length > 500) {
          const combined = text + "\f" + otext;
          const f2 = extractPlanFeatures(combined);
          if (f2 && !features) { features = f2; usedOcr = true; }
          // never replace a SUCCESSFUL text parse with the combined-text
          // parse — the OCR'd pages can add junk rows to a clean region
          // (Sierra Space class); OCR fills the lineup only when the text
          // parse found nothing
          if (!parsed.found) {
            const p2 = parse4i(combined, plan.assetsEOY, plan.label || "", plan.codes || "");
            if (p2.found) { parsed = p2; usedOcr = true; }
          }
        }
      } catch (e) {
        summary.push(`${tag}: ocr failed ${e.message}`);
      }
    }
  }
  try { unlinkSync(dest); } catch { /* keep disk bounded */ }
  return { parsed, features, usedOcr };
}

for (const plan of work) {
  if (fetched >= BATCH) break;
  if (TIME_BUDGET_MIN && (Date.now() - runStart) / 60000 > TIME_BUDGET_MIN) {
    console.log(`time budget (${TIME_BUDGET_MIN} min) reached after ${fetched} filings — stopping cleanly`);
    break;
  }
  fetched++;
  const tag = `${plan.ticker || plan.label} (${plan.ack.slice(0, 14)})`;
  let a;
  try {
    a = await analyzePdf(plan.ack, plan, tag);
  } catch (e) {
    summary.push(`${tag}: download failed ${e.message}`);
    // a failed download must never clobber a previous parse of the same
    // ack (transient S3 errors and withdrawn-from-bucket filings both
    // surface here — v37 dropped 6 good lineups this way). Keep the old
    // meta (old pv keeps the ack on future work lists for retry) and do
    // NOT touch the shard entry; only acks never parsed before get a
    // status record, with pv:0 so they too retry next run.
    const prev = status.plans[plan.ack];
    const meta = prev ? { ...prev, e: "download" } : { pv: 0, ov: 0, c: 0, s: 0, e: "download" };
    status.plans[plan.ack] = meta;
    delta.status[plan.ack] = meta;
    continue;
  }
  if (a.err === "pdftotext") {
    summary.push(`${tag}: pdftotext failed`);
    record(plan, { confident: false, error: "pdftotext", funds: [] });
    continue;
  }
  let { parsed, features, usedOcr } = a;

  // prior-year fallback: when the newest filing yields no confident lineup
  // (schedule missing from the public copy, or unreadable even via OCR),
  // the SAME plan's next-newest full-form filing often carries a good one —
  // AVI-SPL's 2024 public copy omits the schedule its 2023 filing includes.
  // Ratio is judged against the CURRENT year's assets; the confidence band
  // absorbs a year of drift. The entry discloses the fallback year.
  let fbUsed = null;
  const fb = FALLBACKS[plan.ack];
  if (fb && !(parsed.found && isConfident(parsed))) {
    try {
      const b = await analyzePdf(fb.a, plan, `${tag} fb${fb.y}`);
      if (!b.err && b.parsed.found && isConfident(b.parsed)) {
        parsed = b.parsed;
        usedOcr = b.usedOcr;
        fbUsed = fb;
        if (!features) features = b.features;
      }
    } catch { /* fallback download failed — keep the primary outcome */ }
  }

  if (!parsed.found) {
    summary.push(`${tag}: no 4i section found`);
    record(plan, { confident: false, error: "no-section", funds: [] }, features);
    continue;
  }
  const ratio = parsed.ratio || 0;
  const confident = isConfident(parsed);
  record(plan, {
    ack: plan.ack,
    ticker: plan.ticker,
    planYear: fbUsed ? fbUsed.y : plan.planYear,
    sdba: parsed.sdba,
    thousands: parsed.thousands,
    confident,
    coverageRatio: +ratio.toFixed(2),
    funds: parsed.funds,
    sma: parsed.sma,
    smaKind: parsed.smaKind,
    ...(usedOcr ? { ocr: 1 } : {}),
    ...(fbUsed ? { fb: fbUsed.y } : {}),
    ...(parsed.trustPtr ? { trustPtr: 1 } : {}),
    source: fbUsed
      ? `Schedule H line 4i attachment from the plan's ${fbUsed.y} filing — the newest filing's public copy has no readable schedule${usedOcr ? "; digitized from scanned pages via OCR" : ""}`
      : `Schedule H line 4i attachment, plan year ${plan.planYear} filing${usedOcr ? " (digitized from scanned pages via OCR)" : ""}`,
  }, features);
  summary.push(`${tag}: ${parsed.funds.length} rows, cov ${(ratio * 100).toFixed(0)}%, sdba=${parsed.sdba}, ok=${confident}${fbUsed ? ` [prior-year ${fbUsed.y} filing]` : ""}`);
  // flush the delta every 250 filings: a crash (the Jul-24 run OOM'd every
  // shard ~3h in) then costs minutes of progress, not the whole job, and the
  // merge job can ingest partials from failed shards
  if (PARSE_SHARD != null && fetched % 250 === 0) {
    writeFileSync(`results-${PARSE_SHARD}.json`, JSON.stringify(delta));
  }
  await new Promise((r) => setTimeout(r, 150)); // be polite to the bucket
}

if (PARSE_SHARD != null) {
  // matrix job: emit only this shard's results; the merge job assembles stores
  writeFileSync(`results-${PARSE_SHARD}.json`, JSON.stringify(delta));
  console.log(`wrote results-${PARSE_SHARD}.json: ${Object.keys(delta.status).length} entries`);
  process.exit(0);
}

status.generated = new Date().toISOString();
writeFileSync("lineups-status.json", JSON.stringify(status));
const index = {};
for (let i = 0; i < SHARDS; i++) {
  writeFileSync(shardName(i), JSON.stringify(buckets[i]));
  for (const [ack, e] of Object.entries(buckets[i])) index[ack] = indexFlags(e);
}
writeFileSync("lineups-index.json", JSON.stringify({ generated: new Date().toISOString(), shards: SHARDS, plans: index }));

console.log(summary.slice(0, 200).join("\n"));
const vals = Object.values(status.plans);
const ok = vals.filter((p) => p.c).length;
console.log(`\nlineups: ${vals.length} total parsed, ${ok} confident, ${fetched} fetched this run`);
