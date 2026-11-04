#!/usr/bin/env node
/* wampo — SOURCE a fund's expense ratio and YTD return, with a date and a URL.
 *
 * THE CHAIN, AND EVERY LINK OF IT IS MEASURED RATHER THAN ASSUMED:
 *
 *   filed fund name
 *     -> `sec-funds.json`, ALREADY IN THIS REPO (29,406 class rows / 12,440
 *        series). `worklist-resolvable.mjs` measures that it names 35.9% of the
 *        top-1,000 filed names' readers today.
 *     -> a registered TICKER, but only where the class is unambiguous
 *     -> `schwab.wallst.com` research page, which run #8 measured answering a
 *        GitHub runner at 200 with BOTH an expense ratio and a YTD return for
 *        THREE FOREIGN HOUSES -- Fidelity FXAIX, Vanguard VTTVX and JPMorgan
 *        JSMYX -- in about 400ms each. That is what makes it a source rather
 *        than Schwab's own shelf, and SWPPX alone could not have shown it.
 *
 * WHY NOT YAHOO: 429 on runs #1 and #2, 401 on every probe since. Yahoo
 * rate-limits GitHub's runner range outright. WHY NOT THE ISSUERS DIRECTLY:
 * Vanguard answers and Fidelity answers, but T. Rowe Price, Schwab's own
 * product pages, BlackRock's LifePath pages and J.P. Morgan's are either
 * JS-rendered or keyed by a CUSIP we cannot derive -- the owner's own
 * J.P. Morgan URL proved the host is open and that a guessed path 404s
 * indistinguishably from a hostile one.
 *
 * NOTHING UNSOURCED AND NOTHING UNDATED. Every figure written carries the URL
 * it was read from and the as-of date the PAGE states. Where the page states no
 * date the figure is DROPPED rather than stamped with today, because a fee with
 * no date is the thing this project refuses to publish. `fund-facts-check.mjs`
 * enforces the rest.
 *
 * IT MUST RUN ON A RUNNER. In the CCR sandbox every host is ENOTFOUND and
 * `http=000` is a report on the QUERY, not the source -- so this script
 * distinguishes "blocked here" from "no such fund" and never writes a figure it
 * did not read.
 *
 * --explain IS NOT A DEBUG FLAG, IT IS THE CALIBRATION STEP. The extraction
 * patterns below are written against a page shape I have never seen, because
 * the sandbox cannot fetch it. Guessing a pattern and shipping it is how a
 * silent zero gets mistaken for "the source has nothing". So --explain prints
 * the surrounding bytes for each figure it looks for and writes NOTHING, which
 * turns one runner pass into the evidence for the real patterns.
 *
 * Run: node scripts/fund-facts-issuer.mjs [--limit 40] [--dry] [--explain] [--verbose]
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadRegistry, resolve, tickerFor } from "./lib-fundmatch.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const argv = process.argv.slice(2);
const one = (f, d) => { const i = argv.indexOf(f); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
const has = (f) => argv.includes(f);
const LIMIT = +one("--limit", "40");
const EXPLAIN = has("--explain");
const DRY = has("--dry") || EXPLAIN;      // --explain never writes
const VERBOSE = has("--verbose") || EXPLAIN;
const UA = "wampo-fund-facts/1.0 (+https://github.com/evwes/no-app)";

const reg = loadRegistry(path.join(ROOT, "sec-funds.json"));
const work = JSON.parse(readFileSync(path.join(ROOT, "data", "fund-worklist.json"), "utf8")).work;
const factsPath = path.join(ROOT, "data", "fund-facts.json");
const facts = existsSync(factsPath) ? JSON.parse(readFileSync(factsPath, "utf8")) : { funds: {}, vehicles: {} };
facts.funds ||= {}; facts.vehicles ||= {};
console.log(`registry ${reg.rows.toLocaleString()} class rows / ${reg.bySeries.size.toLocaleString()} series; worklist ${work.length} names\n`);

const schwab = (tk) =>
  `https://www.schwab.wallst.com/schwab/Prospect/research/mutualfunds/summary.asp?symbol=${encodeURIComponent(tk)}`;

async function get(url) {
  try {
    const r = await fetch(url, { headers: { "User-Agent": UA, Accept: "text/html,*/*" },
      signal: AbortSignal.timeout(25000), redirect: "follow" });
    const body = await r.text();
    return { ok: r.ok, status: r.status, body, bytes: body.length };
  } catch (e) {
    const why = `${e.message} ${e.cause?.code || ""}`;
    const blocked = /ENOTFOUND|EAI_AGAIN|ECONNREFUSED|ECONNRESET|CERT|timeout|aborted|fetch failed/i.test(why);
    return { ok: false, status: 0, body: "", bytes: 0, blocked, err: why.trim().slice(0, 70) };
  }
}

/* ---- extraction ----------------------------------------------------------
 * Tags are stripped first, because a figure and its label are routinely in
 * different cells and a window measured in raw HTML is mostly markup. */
const detag = (s) => s.replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ").replace(/<[^>]+>/g, " ")
  .replace(/&nbsp;?/gi, " ").replace(/&amp;/gi, "&").replace(/\s+/g, " ");

const ER_LABEL = /(net\s+expense\s+ratio|gross\s+expense\s+ratio|expense\s+ratio|operating\s+expenses)/i;
const YTD_LABEL = /(ytd\s+return|ytd|year[\s-]to[\s-]date)/i;
const DATE_ANY = /(?:as\s+of\s*)?(\d{2}\/\d{2}\/\d{4})|(\d{4}-\d{2}-\d{2})|([A-Z][a-z]{2,8}\s+\d{1,2},\s+\d{4})/;

const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
function isoDate(m) {
  if (!m) return null;
  if (m[1]) { const [mm, dd, yy] = m[1].split("/"); return `${yy}-${mm}-${dd}`; }
  if (m[2]) return m[2];
  if (m[3]) {
    const p = /([A-Za-z]+)\s+(\d{1,2}),\s+(\d{4})/.exec(m[3]);
    const mo = MONTHS[p[1].slice(0, 3).toLowerCase()];
    if (!mo) return null;
    return `${p[3]}-${String(mo).padStart(2, "0")}-${String(+p[2]).padStart(2, "0")}`;
  }
  return null;
}

function pctNear(text, labelRe, { window = 260 } = {}) {
  const m = labelRe.exec(text);
  if (!m) return null;
  const win = text.slice(m.index, m.index + window);
  const p = /(-?\d{1,3}\.\d{1,3})\s*%/.exec(win);
  if (!p) return { miss: "label found, no percentage within the window", win };
  /* the date may sit before the label (a page-wide "as of") as well as after,
   * so look in a wider span centred on the label */
  const span = text.slice(Math.max(0, m.index - 400), m.index + window);
  return { v: +p[1], asOf: isoDate(DATE_ANY.exec(span)), win };
}

function extract(text, url) {
  const out = { src: url };
  const er = pctNear(text, ER_LABEL);
  const ytd = pctNear(text, YTD_LABEL);
  if (er && er.v != null) { out._er = er.v; out._erAsOf = er.asOf; }
  if (ytd && ytd.v != null) { out._ytd = ytd.v; out._ytdAsOf = ytd.asOf; }
  /* A FIGURE WITHOUT A DATE IS NOT WRITTEN. Kept under `_` so the report can
   * say "read it but dropped it", which is a different finding from "the page
   * does not carry it" -- and the two have different remedies. */
  if (out._er != null && out._erAsOf) { out.er = out._er; out.erAsOf = out._erAsOf; }
  if (out._ytd != null && out._ytdAsOf) { out.ytd = out._ytd; out.ytdAsOf = out._ytdAsOf; }
  out._erWin = er?.win || er?.miss || "(no expense-ratio label on the page)";
  out._ytdWin = ytd?.win || ytd?.miss || "(no YTD label on the page)";
  return out;
}

/* ---- the run -------------------------------------------------------------- */
const rep = { names: 0, noTicker: 0, tried: 0, reached: 0, blocked: 0,
  er: 0, ytd: 0, erNoDate: 0, ytdNoDate: 0, wrote: 0, byGrade: {} };
const today = new Date().toISOString().slice(0, 10);
const misses = [];

for (const w of work.slice(0, LIMIT)) {
  rep.names++;
  const hit = resolve(reg, w.name);
  rep.byGrade[hit.grade || "none"] = (rep.byGrade[hit.grade || "none"] || 0) + 1;
  const t = hit.series ? tickerFor(hit, w.name) : null;
  if (!t) {
    rep.noTicker++;
    misses.push({ name: w.name, readers: w.readers,
      why: !hit.series ? `registry: ${hit.grade || "no match"}`
        : `${hit.classes.length} classes and the filing states none` });
    continue;
  }
  rep.tried++;
  const url = schwab(t.tk);
  const r = await get(url);
  if (r.blocked) { rep.blocked++; misses.push({ name: w.name, readers: w.readers, why: `blocked here (${r.err})` }); continue; }
  if (!r.ok || r.bytes < 500) { misses.push({ name: w.name, readers: w.readers, why: `http ${r.status} / ${r.bytes}B for ${t.tk}` }); continue; }
  rep.reached++;

  const text = detag(r.body);
  const e = extract(text, url);
  if (e._er != null) { if (e.er != null) rep.er++; else rep.erNoDate++; }
  if (e._ytd != null) { if (e.ytd != null) rep.ytd++; else rep.ytdNoDate++; }

  if (VERBOSE) {
    console.log(`${String(w.readers).padStart(10)} ppl  ${t.tk.padEnd(6)} ${hit.grade.padEnd(8)} er=${e.er ?? (e._er != null ? e._er + "(undated)" : "-")}@${e.erAsOf ?? "-"}  ytd=${e.ytd ?? (e._ytd != null ? e._ytd + "(undated)" : "-")}@${e.ytdAsOf ?? "-"}  ${w.name.slice(0, 40)}`);
  }
  if (EXPLAIN) {
    console.log(`      ER  window: ${String(e._erWin).slice(0, 190)}`);
    console.log(`      YTD window: ${String(e._ytdWin).slice(0, 190)}`);
  }

  if (!DRY && (e.er != null || e.ytd != null)) {
    const ent = facts.funds[t.tk.toUpperCase()] ||= { name: w.name, updated: today };
    ent.name = w.name; ent.updated = today;
    ent.matchGrade = hit.grade; ent.matchWhy = t.why;
    if (e.er != null) { ent.er = e.er; ent.erAsOf = e.erAsOf; ent.erSource = e.src; }
    if (e.ytd != null) { ent.ytd = e.ytd; ent.ytdAsOf = e.ytdAsOf; ent.ytdSource = e.src; }
    rep.wrote++;
  }
  await new Promise((s) => setTimeout(s, 600));   // politeness
}

if (!DRY && rep.wrote) {
  facts.generated = today;
  writeFileSync(factsPath, JSON.stringify(facts, null, 1) + "\n");
}

console.log(`\nnames ${rep.names} · no usable ticker ${rep.noTicker} · fetched ${rep.tried} · reached ${rep.reached} · blocked ${rep.blocked}`);
console.log(`match grades: ${Object.entries(rep.byGrade).map(([k, v]) => `${k} ${v}`).join(" · ")}`);
console.log(`extracted WITH a date: er ${rep.er} · ytd ${rep.ytd}`);
console.log(`read but DROPPED for having no date: er ${rep.erNoDate} · ytd ${rep.ytdNoDate}`);
console.log(`wrote ${rep.wrote} entries${DRY ? " (DRY — nothing written)" : " to data/fund-facts.json"}`);
if (rep.blocked) {
  console.log(`\n${rep.blocked} host(s) unreachable. If this ran in the CCR sandbox that is EXPECTED`);
  console.log(`and the result says NOTHING about the source — re-run it on a runner.`);
}
if ((rep.erNoDate || rep.ytdNoDate) && !rep.er && !rep.ytd) {
  console.log(`\nEVERY figure was read and DROPPED for lack of a date. That is a pattern`);
  console.log(`problem on OUR side, not an empty source: re-run with --explain and fix`);
  console.log(`DATE_ANY against the windows it prints.`);
}
for (const m of misses.slice(0, 20)) console.log(`   miss: ${String(m.readers).padStart(9)} ppl — ${m.why} — ${m.name.slice(0, 44)}`);
if (misses.length > 20) console.log(`   ... and ${misses.length - 20} more`);
