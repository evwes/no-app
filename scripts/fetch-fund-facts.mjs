#!/usr/bin/env node
/* wampo — fetch a fund's expense ratio and year-to-date return, with the
 * dates the source states, into data/fund-facts.json.
 *
 * WHY THIS RUNS ON A GITHUB RUNNER AND NOT IN THE SANDBOX (2026-09-17): the
 * CCR sandbox's egress proxy blocks every fund-data host (Vanguard,
 * Morningstar, Yahoo, MarketWatch, sec.gov, web.archive.org — each probed,
 * each CONNECT 403). The fund-facts agent's first run correctly wrote nothing.
 * A GitHub Actions runner has open egress, which is how the EDGAR 11-K
 * retrieval already works. This script is the retrieval; the agent and the
 * checker still own the rules, and the checker runs on the result.
 *
 * SOURCE: Yahoo Finance's quoteSummary API, modules fundProfile (net expense
 * ratio from the annual report) and fundPerformance (trailing returns with an
 * as-of date) and price (name, last trade time). Yahoo requires a session
 * cookie + crumb since 2023; both are fetched first. Every figure written
 * carries the date the API states — trailingReturns.asOfDate for the YTD,
 * the annual-report expense ratio carries the price's last-trade date as the
 * best available "true as of" (Yahoo does not date the fee separately).
 *
 * Usage: node scripts/fetch-fund-facts.mjs [TICKER ...]
 *   no args -> refresh every ticker already in data/fund-facts.json plus
 *   every line of data/fund-facts-tickers.txt.
 * Exits 1 if nothing could be written. Never writes a figure without its date.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FILE = path.join(root, "data", "fund-facts.json");
const LIST = path.join(root, "data", "fund-facts-tickers.txt");
const UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";
const today = new Date().toISOString().slice(0, 10);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const doc = fs.existsSync(FILE) ? JSON.parse(fs.readFileSync(FILE, "utf8")) : { funds: {} };
doc.funds = doc.funds || {};
let tickers = process.argv.slice(2).map((t) => t.trim().toUpperCase()).filter(Boolean);
if (!tickers.length) {
  const seed = fs.existsSync(LIST) ? fs.readFileSync(LIST, "utf8").split(/\r?\n/).map((s) => s.replace(/#.*/, "").trim().toUpperCase()).filter(Boolean) : [];
  tickers = [...new Set([...Object.keys(doc.funds), ...seed])];
}
if (!tickers.length) { console.log("no tickers to fetch"); process.exit(1); }

/* Yahoo session: a cookie from fc.yahoo.com, then a crumb tied to it. */
async function session() {
  const r = await fetch("https://fc.yahoo.com/", { headers: { "User-Agent": UA }, redirect: "manual" });
  const cookie = (r.headers.get("set-cookie") || "").split(";")[0];
  const c = await fetch("https://query1.finance.yahoo.com/v1/test/getcrumb", { headers: { "User-Agent": UA, Cookie: cookie } });
  const crumb = (await c.text()).trim();
  if (!crumb || crumb.includes("<")) throw new Error(`no crumb (status ${c.status})`);
  return { cookie, crumb };
}

const fmtDate = (d) => (d && d.fmt) ? d.fmt : (d && typeof d.raw === "number" ? new Date(d.raw * 1000).toISOString().slice(0, 10) : null);
const pct = (x) => (x && typeof x.raw === "number") ? Math.round(x.raw * 100 * 1000) / 1000 : null;

async function fetchOne(t, s) {
  const url = `https://query2.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(t)}?modules=fundProfile,fundPerformance,price&crumb=${encodeURIComponent(s.crumb)}`;
  const r = await fetch(url, { headers: { "User-Agent": UA, Cookie: s.cookie } });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const j = await r.json();
  const res = j && j.quoteSummary && j.quoteSummary.result && j.quoteSummary.result[0];
  if (!res) throw new Error(`empty result (${JSON.stringify(j && j.quoteSummary && j.quoteSummary.error).slice(0, 120)})`);
  const price = res.price || {}, prof = res.fundProfile || {}, perf = res.fundPerformance || {};
  const quoteType = String(price.quoteType || "");
  if (!/MUTUALFUND|ETF/i.test(quoteType)) throw new Error(`quoteType ${quoteType || "?"} is not a fund`);
  const name = price.longName || price.shortName || null;
  const tradeDate = fmtDate(price.regularMarketTime);
  const fees = prof.feesExpensesInvestment || {};
  const er = pct(fees.annualReportExpenseRatio) ?? pct(fees.netExpRatio);
  const tr = perf.trailingReturns || {};
  const ytd = pct(tr.ytd);
  const ytdAsOf = fmtDate(tr.asOfDate);
  const entry = { name, updated: today };
  if (er !== null && tradeDate) { entry.er = er; entry.erAsOf = tradeDate; entry.erSource = `https://finance.yahoo.com/quote/${t}/`; }
  if (ytd !== null && ytdAsOf) { entry.ytd = ytd; entry.ytdAsOf = ytdAsOf; entry.ytdSource = `https://finance.yahoo.com/quote/${t}/performance/`; }
  return entry;
}

const s = await session();
let written = 0, failed = 0;
for (const t of tickers) {
  try {
    const e = await fetchOne(t, s);
    if (!e.name || (e.er === undefined && e.ytd === undefined)) throw new Error("no dated figure in the response");
    const prev = doc.funds[t] || {};
    doc.funds[t] = { ...prev, ...e };
    written++;
    console.log(`${t.padEnd(7)} ${String(e.name).slice(0, 40).padEnd(40)} er=${e.er ?? "-"} (${e.erAsOf ?? "-"})  ytd=${e.ytd ?? "-"} (${e.ytdAsOf ?? "-"})`);
  } catch (err) {
    failed++;
    console.log(`${t.padEnd(7)} FAILED: ${err.message}`);
  }
  await sleep(400);
}
doc._schema = doc._schema || "one entry per ticker; every figure carries its as-of date and source; validate with node scripts/fund-facts-check.mjs";
const ordered = { _schema: doc._schema, funds: Object.fromEntries(Object.entries(doc.funds).sort()) };
fs.writeFileSync(FILE, JSON.stringify(ordered, null, 2) + "\n");
console.log(`fund-facts: ${written} written, ${failed} failed, ${Object.keys(ordered.funds).length} entries in the file`);
process.exit(written ? 0 : 1);
