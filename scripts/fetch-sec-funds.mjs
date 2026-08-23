#!/usr/bin/env node
/* wampo — build a registered-fund NAME → TICKER index from SEC source data.
 *
 * Why this exists: hand-written patterns in fund-er.js cannot finish the job.
 * Measured 2026-08-23 across 53,218 confident lineups: 248,390 distinct filed
 * fund-name strings, of which the ones already matched average 20.0 holdings
 * each and the ones left average 4.5. The high-reuse names are done; the tail
 * is flat, and reaching 90% by hand would take tens of thousands of verified
 * entries. A lookup covers the tail in one pass.
 *
 * SOURCE. Two SEC files are needed together, because neither is sufficient:
 *   1. company_tickers_mf.json — CIK, seriesId, classId, ticker. NO NAMES.
 *   2. the Investment Company Series and Class information file — entity name,
 *      series ID, series name, class ID, class name, ticker.
 * (2) is the one that carries names, so it is the primary; (1) is used to fill
 * tickers that (2) leaves blank, joined on classId.
 *
 * SEC is unreachable from the dev sandbox — this runs in GitHub Actions. The
 * User-Agent must stay the plain "name email" form: SEC/Akamai rejects
 * User-Agents containing parens or URLs (verified 2026-08-03). Do not enrich it.
 *
 * Output: sec-funds.json — { generated, source, funds: [[name, ticker, kind], …] }
 * kind: "class" (a specific share class) or "series" (the fund itself).
 */
import { writeFileSync, mkdirSync } from "node:fs";

const UA = "wampo evanatchley1@gmail.com";
const HDRS = { "User-Agent": UA, "Accept-Encoding": "gzip, deflate" };
const OUT = process.env.SEC_OUT_DIR || "sec-funds";

async function get(url, kind = "text") {
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const res = await fetch(url, { headers: HDRS });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return kind === "json" ? await res.json() : await res.text();
    } catch (e) {
      console.log(`  ${url} attempt ${attempt + 1} failed: ${e.message}`);
      if (attempt === 3) throw e;
      await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)));
    }
  }
}

/* The series/class file is published per year and the path has changed shape
 * over time, so try the known forms newest-first and use the first that
 * answers. Every candidate is logged so a future break is diagnosable. */
async function fetchSeriesClass() {
  const year = new Date().getUTCFullYear();
  const candidates = [];
  for (const y of [year, year - 1, year - 2]) {
    candidates.push(`https://www.sec.gov/files/investment/data/other/investment-company-series-class-information/investment_company_series_class_${y}.csv`);
    candidates.push(`https://www.sec.gov/files/investment/data/other/investment-company-series-and-class-information/investment_company_series_class_${y}.csv`);
    candidates.push(`https://www.sec.gov/open/investment-company-series-class-${y}.csv`);
  }
  for (const url of candidates) {
    try {
      const t = await get(url);
      if (t && t.length > 5000 && /series/i.test(t.slice(0, 2000))) {
        console.log(`series/class file: ${url} (${(t.length / 1e6).toFixed(1)} MB)`);
        return { url, csv: t };
      }
      console.log(`  rejected ${url}: ${t ? t.length + " bytes, no header match" : "empty"}`);
    } catch { /* try the next shape */ }
  }
  throw new Error("no series/class file reachable — inspect the candidates above");
}

// minimal CSV reader: SEC quotes fields containing commas
function parseCsv(text) {
  const rows = [];
  let row = [], field = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') q = false;
      else field += c;
    } else if (c === '"') q = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
    else if (c !== "\r") field += c;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows;
}

const main = async () => {
  mkdirSync(OUT, { recursive: true });

  const { url, csv } = await fetchSeriesClass();
  const rows = parseCsv(csv);
  const head = rows[0].map((h) => h.trim().toLowerCase().replace(/[^a-z]/g, ""));
  console.log("columns: " + head.join(" | "));
  const col = (...names) => {
    for (const n of names) { const i = head.indexOf(n); if (i >= 0) return i; }
    return -1;
  };
  const iEntity = col("entityname", "companyname", "registrantname");
  const iSeries = col("seriesname");
  const iSeriesId = col("seriesid");
  const iClass = col("classname");
  const iClassId = col("classid");
  const iTicker = col("classticker", "ticker", "tickersymbol", "classtickersymbol");
  console.log(`indices entity=${iEntity} series=${iSeries} class=${iClass} ticker=${iTicker}`);
  if (iSeries < 0) throw new Error("series-name column not found — columns printed above");

  // ticker fallback keyed by class id
  let mf = null;
  try {
    const j = await get("https://www.sec.gov/files/company_tickers_mf.json", "json");
    const f = j.fields.map((x) => String(x).toLowerCase());
    const ci = f.indexOf("classid"), ti = f.indexOf("symbol");
    mf = new Map(j.data.map((d) => [String(d[ci]), String(d[ti])]));
    console.log(`company_tickers_mf.json: ${mf.size} class→ticker rows`);
  } catch (e) {
    console.log("company_tickers_mf.json unavailable, continuing without it: " + e.message);
  }

  const out = [];
  let withTicker = 0;
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    if (!row || row.length < 3) continue;
    const entity = (iEntity >= 0 ? row[iEntity] : "").trim();
    const series = (row[iSeries] || "").trim();
    const klass = (iClass >= 0 ? row[iClass] : "").trim();
    const classId = (iClassId >= 0 ? row[iClassId] : "").trim();
    let ticker = (iTicker >= 0 ? row[iTicker] : "").trim().toUpperCase();
    if (!ticker && mf && classId && mf.has(classId)) ticker = mf.get(classId).toUpperCase();
    if (!ticker || !/^[A-Z]{1,6}$/.test(ticker)) continue;
    withTicker++;
    // Emit the class-level name AND the series-level name. The filed 4i name
    // may state a share class ("Fidelity Contrafund K6") or not
    // ("Fidelity Contrafund") — the matcher decides which to trust.
    if (series) out.push([entity ? `${entity} :: ${series}` : series, ticker, klass ? "class" : "series", klass]);
  }
  console.log(`rows with a usable ticker: ${withTicker.toLocaleString()}`);

  const payload = { generated: new Date().toISOString(), source: url, count: out.length, funds: out };
  writeFileSync(`${OUT}/sec-funds.json`, JSON.stringify(payload));
  console.log(`wrote ${OUT}/sec-funds.json — ${out.length.toLocaleString()} name/ticker rows`);
};

main().catch((e) => { console.error("FAILED: " + e.message); process.exit(1); });
