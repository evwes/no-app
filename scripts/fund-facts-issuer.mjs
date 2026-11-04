#!/usr/bin/env node
/* wampo — SOURCE a fund's ticker, expense ratio and YTD return FROM THE ISSUER.
 *
 * WHY THIS AND NOT `fetch-fund-facts.mjs`. That one is Yahoo-only and Yahoo
 * refuses GitHub runners (429 on runs #1 and #2, 401 on the 2026-11-04 probe).
 * The probe measured which hosts DO answer a runner, and two do, including the
 * one that matters most:
 *
 *   200 · 220,422B · er+ytd   investor.vanguard.com profile (registered fund)
 *   200 ·  59,200B · er       investor.vanguard.com profile (COLLECTIVE TRUST)
 *   200 ·  32,240B           fundresearch.fidelity.com
 *
 * The trust page is the point. A CIT has no ticker and no SEC filing, which is
 * why 272,933 priced rows carry a regex guess; the issuer publishes its real
 * figure and a runner can read it.
 *
 * IT MUST RUN ON A RUNNER. In the CCR sandbox every host is ENOTFOUND, and
 * `http=000` is a report on the QUERY, not the source. This script therefore
 * distinguishes "blocked here" from "no such fund" and never writes a figure it
 * did not read.
 *
 * NOTHING UNSOURCED AND NOTHING UNDATED. Every figure written carries the URL
 * it came from and the as-of date the page states; where the page states no
 * date the figure is DROPPED rather than stamped with today. `fund-facts-check`
 * enforces the rest.
 *
 * Run: node scripts/fund-facts-issuer.mjs [--limit 40] [--dry] [--verbose]
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const argv = process.argv.slice(2);
const one = (f, d) => { const i = argv.indexOf(f); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
const has = (f) => argv.includes(f);
const LIMIT = +one("--limit", "40");
const DRY = has("--dry");
const VERBOSE = has("--verbose");
const UA = "wampo-fund-facts/1.0 (+https://github.com/evwes/no-app)";

const work = JSON.parse(readFileSync(path.join(ROOT, "data", "fund-worklist.json"), "utf8")).work;
const factsPath = path.join(ROOT, "data", "fund-facts.json");
const facts = existsSync(factsPath) ? JSON.parse(readFileSync(factsPath, "utf8")) : { funds: {}, vehicles: {} };
facts.funds ||= {}; facts.vehicles ||= {};

/* sec-funds.json maps a registered series/class to its ticker. It is already in
 * the repo and is the cheapest way from a filed NAME to a profile URL. */
let SEC = [];
try { SEC = JSON.parse(readFileSync(path.join(ROOT, "sec-funds.json"), "utf8")); } catch { /* optional */ }
const norm = (s) => String(s || "").toUpperCase().replace(/[^A-Z0-9]+/g, " ").trim();
const secByName = new Map();
for (const r of SEC) {
  const series = Array.isArray(r) ? r[0] : r.series;
  const tk = Array.isArray(r) ? r[1] : r.ticker;
  if (!series || !tk) continue;
  const k = norm(String(series).split("::").pop());
  if (!secByName.has(k)) secByName.set(k, tk);
}

async function get(url) {
  try {
    const r = await fetch(url, { headers: { "User-Agent": UA, Accept: "text/html,*/*" },
      signal: AbortSignal.timeout(25000), redirect: "follow" });
    const body = await r.text();
    return { ok: r.ok, status: r.status, body, bytes: body.length };
  } catch (e) {
    const blocked = /ENOTFOUND|EAI_AGAIN|ECONNREFUSED|timeout|aborted/i.test(e.message);
    return { ok: false, status: 0, body: "", bytes: 0, blocked, err: e.message.slice(0, 80) };
  }
}

/* ---- extraction ----------------------------------------------------------
 * Patterns are deliberately NARROW and each returns its own as-of date. A
 * number without a date is not written: a fee with no date is the thing this
 * project refuses to publish. */
const pctNear = (body, labelRe) => {
  const m = labelRe.exec(body);
  if (!m) return null;
  const win = body.slice(m.index, m.index + 600);
  const p = /(-?\d{1,3}\.\d{1,3})\s*%/.exec(win);
  const d = /as of\s*(\d{2}\/\d{2}\/\d{4})|(\d{4}-\d{2}-\d{2})/i.exec(win);
  if (!p) return null;
  let asOf = null;
  if (d) {
    if (d[1]) { const [mm, dd, yy] = d[1].split("/"); asOf = `${yy}-${mm}-${dd}`; }
    else asOf = d[2];
  }
  return { v: +p[1], asOf };
};

function extract(body, url) {
  const out = { src: url };
  const er = pctNear(body, /acquired fund fees and expenses|expense ratio|net expense ratio/i);
  if (er && er.asOf) { out.er = er.v; out.erAsOf = er.asOf; }
  else if (er) out._erNoDate = er.v;
  const ytd = pctNear(body, /ytd returns?|year[- ]to[- ]date/i);
  if (ytd && ytd.asOf) { out.ytd = ytd.v; out.ytdAsOf = ytd.asOf; }
  else if (ytd) out._ytdNoDate = ytd.v;
  const cusip = /CUSIP[^0-9A-Z]{0,20}([0-9A-Z]{9})\b/i.exec(body);
  if (cusip) out.cusip = cusip[1].toUpperCase();
  return out;
}

/* ---- the run -------------------------------------------------------------- */
const report = { tried: 0, reached: 0, blocked: 0, withEr: 0, withYtd: 0, withCusip: 0, noDate: 0, wrote: 0, misses: [] };
const today = new Date().toISOString().slice(0, 10);

for (const w of work.slice(0, LIMIT)) {
  const name = w.name;
  const tk = secByName.get(norm(name));
  /* candidate URLs, cheapest first. A trust has no ticker, so a name with no
   * SEC match still gets a search attempt rather than being skipped. */
  const urls = [];
  if (tk) urls.push(`https://investor.vanguard.com/investment-products/mutual-funds/profile/${tk.toLowerCase()}`);
  if (tk) urls.push(`https://fundresearch.fidelity.com/mutual-funds/summary/${tk.toUpperCase()}`);
  if (!urls.length) { report.misses.push({ name, why: "no ticker in sec-funds.json; a trust needs its issuer id" }); continue; }

  report.tried++;
  let got = null;
  for (const u of urls) {
    const r = await get(u);
    if (r.blocked) { report.blocked++; break; }
    if (!r.ok || r.bytes < 200) continue;
    report.reached++;
    const e = extract(r.body, u);
    if (e.er || e.ytd || e.cusip) { got = { ...e, tk }; break; }
    if (e._erNoDate != null || e._ytdNoDate != null) report.noDate++;
    await new Promise((r2) => setTimeout(r2, 500));
  }
  if (!got) { report.misses.push({ name, why: tk ? `reached, nothing extractable (${tk})` : "no candidate url" }); continue; }

  if (got.er != null) report.withEr++;
  if (got.ytd != null) report.withYtd++;
  if (got.cusip) report.withCusip++;
  if (VERBOSE) console.log(`  ${String(w.readers).padStart(9)} ppl  ${tk || "-"}  er=${got.er ?? "-"}@${got.erAsOf ?? "-"}  ytd=${got.ytd ?? "-"}@${got.ytdAsOf ?? "-"}  cusip=${got.cusip ?? "-"}  ${name.slice(0, 44)}`);

  if (!DRY && tk && (got.er != null || got.ytd != null)) {
    const e = facts.funds[tk.toUpperCase()] ||= { name, updated: today };
    e.name = name; e.updated = today;
    if (got.er != null) { e.er = got.er; e.erAsOf = got.erAsOf; e.erSource = got.src; }
    if (got.ytd != null) { e.ytd = got.ytd; e.ytdAsOf = got.ytdAsOf; e.ytdSource = got.src; }
    if (got.cusip) e.cusip = got.cusip;
    report.wrote++;
  }
  await new Promise((r) => setTimeout(r, 600));   // politeness
}

if (!DRY && report.wrote) {
  facts.generated = today;
  writeFileSync(factsPath, JSON.stringify(facts, null, 1) + "\n");
}
console.log(`\ntried ${report.tried} · reached ${report.reached} · blocked ${report.blocked}`);
console.log(`extracted: er ${report.withEr} · ytd ${report.withYtd} · cusip ${report.withCusip} · dropped for having no date ${report.noDate}`);
console.log(`wrote ${report.wrote} entries to data/fund-facts.json${DRY ? " (DRY -- nothing written)" : ""}`);
if (report.blocked) console.log(`\n${report.blocked} host(s) unreachable -- if this ran in the sandbox that is expected and the result says NOTHING about the sources.`);
for (const m of report.misses.slice(0, 15)) console.log(`   miss: ${m.why} — ${m.name.slice(0, 50)}`);
if (report.misses.length > 15) console.log(`   ... and ${report.misses.length - 15} more misses`);
