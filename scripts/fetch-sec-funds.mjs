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

/* DISCOVERY, not guessing. Run #1 tried nine invented paths and got nine
 * 404s — the file's URL is not something to recall, it is something to look
 * up. This asks SEC's own landing pages where the data is, and follows the
 * link they give. MODE=probe prints everything it finds and exits without
 * failing, so one Actions run tells us the real path. */
const INDEX_PAGES = [
  "https://www.sec.gov/dera/data/investment-company-series-and-class-information",
  "https://www.sec.gov/about/opendatasetsshtmlinvestment_company",
  "https://www.sec.gov/open/datasets-investment_company",
  "https://www.sec.gov/data-research/sec-markets-data/investment-company-series-class-information",
  "https://www.sec.gov/data-research/sec-markets-data",
  "https://www.sec.gov/open/datasets",
];

async function discover() {
  const found = [];
  for (const page of INDEX_PAGES) {
    let html;
    try { html = await get(page); } catch (e) { console.log(`index ${page}: ${e.message}`); continue; }
    console.log(`index ${page}: ${html.length} bytes`);
    const links = [...html.matchAll(/href="([^"]+\.(?:csv|json|zip))"/gi)].map((m) => m[1]);
    const rel = links.filter((h) => /series|class|company_tickers|investment/i.test(h));
    for (const h of new Set(rel)) {
      const abs = h.startsWith("http") ? h : "https://www.sec.gov" + (h.startsWith("/") ? h : "/" + h);
      console.log(`   candidate: ${abs}`);
      found.push(abs);
    }
    if (!rel.length && links.length) console.log(`   (${links.length} data links, none matched series/class)`);
  }
  return [...new Set(found)];
}

/* CONFIRMED by the probe run (#2, 2026-08-23): 200, 8,051,160 bytes, header
 *   Reporting File Number,CIK Number,Entity Name,Entity Org Type,Series ID,
 *   Series Name,Class ID,Class Name,Class Ticker,Address_1,…
 * Note the shape my guesses got wrong: HYPHENS in the file name, and the
 * directory has no "and" in it. Discovery stays as the fallback so a future
 * path change is self-healing rather than another round of 404s. */
const CONFIRMED = [
  "https://www.sec.gov/files/investment/data/other/investment-company-series-class-information/investment-company-series-class-2026.csv",
  "https://www.sec.gov/files/investment/data/other/investment-company-series-class-information/investment-company-series-class-2025.csv",
];

async function fetchSeriesClass() {
  for (const url of CONFIRMED) {
    try {
      const t = await get(url);
      if (t && t.length > 5000 && /series/i.test(t.slice(0, 2000))) {
        console.log(`series/class file: ${url} (${(t.length / 1e6).toFixed(1)} MB)`);
        console.log(`  header: ${t.slice(0, t.indexOf("\n"))}`);
        return { url, csv: t };
      }
    } catch (e) { console.log(`  confirmed URL failed, falling back to discovery: ${e.message}`); }
  }
  const candidates = await discover();
  if (!candidates.length) throw new Error("no candidate data links found on any SEC index page — see the pages probed above");
  for (const url of candidates) {
    if (!/\.csv$/i.test(url)) continue;
    try {
      const t = await get(url);
      if (t && t.length > 5000 && /series/i.test(t.slice(0, 2000))) {
        console.log(`series/class file: ${url} (${(t.length / 1e6).toFixed(1)} MB)`);
        console.log(`  header: ${t.slice(0, t.indexOf("\n"))}`);
        return { url, csv: t };
      }
      console.log(`  rejected ${url}: ${t ? t.length + " bytes, no series header" : "empty"}`);
    } catch (e) { console.log(`  ${url}: ${e.message}`); }
  }
  throw new Error("candidates found but none carried a series header — see above");
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

  /* MODE=companies: the ticker -> public-company-name map for EVERY SEC
   * registrant (~10k), which is what lets a Form 5500 sponsor name be matched
   * to a listed company. company_tickers.json is {cik_str, ticker, title} and
   * is the same source family as the fund index above, so it inherits the UA
   * discipline: SEC/Akamai rejects User-Agents containing parens or URLs, and
   * the plain "name email" form is the one that works. Do not enrich it.
   *
   * Fetched here rather than hand-listed because a hand-typed list of 500
   * companies is a list of 500 chances to invent a ticker, and this project
   * does not guess. */
  if (process.env.MODE === "companies") {
    const j = await get("https://www.sec.gov/files/company_tickers.json", "json");
    const rows = Object.values(j)
      .filter((r) => r && r.ticker && r.title)
      .map((r) => [String(r.ticker).toUpperCase(), String(r.title), r.cik_str]);
    console.log(`company_tickers.json: ${rows.length.toLocaleString()} registrants`);
    console.log(`  sample: ${JSON.stringify(rows.slice(0, 3))}`);
    writeFileSync(`${OUT}/sec-companies.json`, JSON.stringify({
      generated: new Date().toISOString(),
      source: "https://www.sec.gov/files/company_tickers.json",
      count: rows.length, companies: rows,
    }));
    console.log(`wrote ${OUT}/sec-companies.json`);
    return;
  }

  // MODE=probe: report what SEC actually serves and stop. One run answers
  // "where is the file" without burning attempts on invented URLs.
  if (process.env.MODE === "probe") {
    const cands = await discover();
    console.log(`\ncandidates found: ${cands.length}`);
    for (const c of cands) {
      try {
        const res = await fetch(c, { method: "GET", headers: HDRS });
        const body = await res.text();
        console.log(`  ${res.status}  ${String(res.headers.get("content-type")).slice(0, 40).padEnd(42)} ${String(body.length).padStart(10)}  ${c}`);
        if (res.ok && /\.csv$/i.test(c) && body.length > 1000) console.log(`        header: ${body.slice(0, body.indexOf("\n")).slice(0, 300)}`);
      } catch (e) { console.log(`  ERR ${e.message}  ${c}`); }
    }
    // also confirm the ticker file, which is the one URL run #1 never reached
    try {
      const j = await get("https://www.sec.gov/files/company_tickers_mf.json", "json");
      console.log(`\ncompany_tickers_mf.json OK: fields=${JSON.stringify(j.fields)} rows=${j.data.length}`);
      console.log(`  sample: ${JSON.stringify(j.data.slice(0, 3))}`);
    } catch (e) { console.log("company_tickers_mf.json: " + e.message); }
    return;
  }

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
