/* SEC EDGAR 11-K fund lineups for plans whose EFAST2 filing has no fund-level
 * menu (master-trust members like Verizon, class-summary-only lineups).
 * Public-company plans file an audited 11-K with the SAME Schedule H line 4i
 * schedule of assets — at PLAN level, even when the DOL filing only shows a
 * trust interest. Everything shown stays filed data; the source is labeled
 * "SEC 11-K" with a link to the document.
 *
 * SEC access is blocked from the dev sandbox — this runs in GitHub Actions.
 * MODE=specimens fetches a fixed panel of known-category filings and writes
 * raw FTS JSON + 11-K HTML to edgar-specimens/ (uploaded as an artifact) so
 * the parser can be developed locally against real documents.
 *
 * Match-safety rule (accuracy first): a parsed schedule is accepted ONLY if
 * its total lands within [0.5, 2.0]x the plan's Schedule H assetsEOY
 * (thousands-scaling aware) — a wrong plan's 11-K essentially never passes.
 */
import { writeFileSync, mkdirSync, readFileSync, existsSync } from "fs";
import path from "path";

// SEC/Akamai REJECTS User-Agents containing parens or URLs (serves the
// "Undeclared Automated Tool" page, and a fake rate-limit page on the static
// host). The documented plain "name email" format passes — even from GitHub
// Actions runners. Probed 2026-08-03; do not "enrich" this string.
const UA = "wampo evanatchley1@gmail.com";
const FTS = "https://efts.sec.gov/LATEST/search-index";
const DELAY_MS = 400; // SEC asks for <=10 req/s; stay far under it
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let lastReq = 0;
async function polite(url, type = "json") {
  const wait = lastReq + DELAY_MS - Date.now();
  if (wait > 0) await sleep(wait);
  lastReq = Date.now();
  const res = await fetch(url, { headers: { "User-Agent": UA, "Accept-Encoding": "gzip, deflate" } });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
  return type === "json" ? res.json() : res.text();
}

/* Query ladder, most-specific first (order matters — mirrors the validated
 * prototype). Returns the list of quoted phrases to try. */
export function queryLadder(planName, sponsorName) {
  const qs = [];
  const plan = String(planName || "").trim().replace(/^THE\s+/i, "");
  if (plan) qs.push(plan);
  const no401k = plan.replace(/\s*401\(?K\)?\s*/gi, " ").replace(/\s+/g, " ").trim();
  if (no401k && no401k !== plan) {
    qs.push(no401k.replace(/\s+PLAN$/i, "").trim()); // "MICROSOFT CORPORATION SAVINGS PLUS"
    qs.push(no401k);
  }
  const sponsor = String(sponsorName || "").replace(/,? (inc|incorporated|corp|corporation|company|co|llc|llp|ltd)\.?$/i, "").trim();
  if (sponsor) { qs.push(sponsor + " Savings Plan"); qs.push(sponsor + " Retirement"); }
  return [...new Set(qs.filter((q) => q.length >= 8))];
}

/* One FTS call for one quoted phrase; returns usable hits (11-K primary
 * documents), newest plan year first. Relevance order is a trap — the
 * top-scored hit is frequently 2-3 years stale. */
export function usableHits(ftsJson) {
  const hits = ((ftsJson.hits || {}).hits || [])
    .filter((h) => {
      const s = h._source || {};
      return (s.file_type === "11-K" || s.file_type === "11-K/A") && parseInt(s.sequence, 10) === 1;
    })
    .sort((a, b) => String(b._source.period_ending || "").localeCompare(String(a._source.period_ending || "")));
  return hits;
}

export function docUrl(hit) {
  const s = hit._source;
  const cik = parseInt(s.ciks[0], 10).toString();
  const accNo = s.adsh.replace(/-/g, "");
  const filename = hit._id.split(":")[1];
  return `https://www.sec.gov/Archives/edgar/data/${cik}/${accNo}/${filename}`;
}

async function searchPlan(planName, sponsorName, startdt) {
  for (const q of queryLadder(planName, sponsorName)) {
    const url = `${FTS}?q=${encodeURIComponent('"' + q + '"')}&forms=11-K&startdt=${startdt}&enddt=${new Date().toISOString().slice(0, 10)}`;
    try {
      const j = await polite(url);
      const hits = usableHits(j);
      if (hits.length) return { query: q, hits, raw: j };
    } catch (e) {
      console.warn(`  FTS "${q}": ${e.message}`);
    }
  }
  return null;
}

/* ---------------- specimen mode ---------------- */
const SPECIMENS = [
  // the Verizon class this integration exists for
  { label: "verizon-mgmt", plan: "VERIZON SAVINGS PLAN FOR MANAGEMENT EMPLOYEES", sponsor: "Verizon Communications Inc.", ein: "232259884", pn: "102", assets: 31319296635 },
  { label: "verizon-nyne", plan: "VERIZON SAVINGS & SECURITY PLAN FOR NEW YORK AND NEW ENGLAND ASSOCIATES", sponsor: "Verizon Communications Inc.", ein: "232259884", pn: "011", assets: 6162578449 },
  { label: "verizon-midatl", plan: "VERIZON SAVINGS SECURITY PLAN FOR MID-ATLANTIC ASSOCIATES", sponsor: "Verizon Communications Inc.", ein: "232259884", pn: "004", assets: 3726083852 },
  // known-clean lineups (parser positives)
  { label: "lockheed", plan: "LOCKHEED MARTIN CORPORATION SALARIED SAVINGS PLAN", sponsor: "Lockheed Martin Corporation", ein: "521893632", pn: "017", assets: 51448624264 },
  { label: "chevron", plan: "CHEVRON EMPLOYEE SAVINGS INVESTMENT PLAN", sponsor: "Chevron Corporation", ein: "940890210", pn: "001", assets: 20378704663 }, // values in THOUSANDS (edge case 9)
  { label: "microsoft", plan: "MICROSOFT CORPORATION SAVINGS PLUS 401K PLAN", sponsor: "Microsoft Corporation", ein: "911144442", pn: "001", assets: 77853223310 }, // SDBA rows must filter
  // known-negative controls
  { label: "jnj-mastertrust", plan: "JOHNSON AND JOHNSON SAVINGS PLAN", sponsor: "Johnson And Johnson", ein: "221024240", pn: "100", assets: 23584765150 }, // master trust → must reject
  { label: "walmart-flood", plan: "WALMART 401(K) PLAN", sponsor: "Walmart Inc.", ein: "710415188", pn: "003", assets: 50790179678 }, // direct-held flood → must reject
];

async function runSpecimens() {
  const out = "edgar-specimens";
  mkdirSync(out, { recursive: true });
  const summary = [];
  for (const sp of SPECIMENS) {
    console.log(`\n== ${sp.label}: "${sp.plan}"`);
    const found = await searchPlan(sp.plan, sp.sponsor, "2025-01-01");
    if (!found) { console.log("  no FTS hits"); summary.push({ ...sp, hit: null }); continue; }
    const hit = found.hits[0];
    writeFileSync(path.join(out, `${sp.label}-fts.json`), JSON.stringify(found.raw, null, 1));
    const url = docUrl(hit);
    console.log(`  query "${found.query}" → ${hit._id} period ${hit._source.period_ending}`);
    console.log(`  fetching ${url}`);
    try {
      const html = await polite(url, "text");
      writeFileSync(path.join(out, `${sp.label}.html`), html);
      summary.push({ ...sp, query: found.query, id: hit._id, period: hit._source.period_ending, url, bytes: html.length });
      console.log(`  saved ${html.length} bytes`);
    } catch (e) {
      console.warn(`  fetch failed: ${e.message}`);
      summary.push({ ...sp, query: found.query, id: hit._id, url, error: e.message });
    }
  }
  writeFileSync(path.join(out, "summary.json"), JSON.stringify(summary, null, 1));
  console.log(`\nwrote ${out}/summary.json`);
}

/* Which SEC hosts does this egress reach? efts (full-text search) 403s from
 * Azure datacenter IPs; data.sec.gov + Archives are the workaround path:
 * ticker→CIK from company_tickers.json, 11-K list from the submissions API,
 * documents from Archives. */
async function runProbe() {
  const targets = [
    ["efts FTS", `${FTS}?q=%22VERIZON%20SAVINGS%20PLAN%22&forms=11-K&startdt=2025-01-01&enddt=2026-08-01`],
    ["company_tickers", "https://www.sec.gov/files/company_tickers.json"],
    ["submissions API (VZ)", "https://data.sec.gov/submissions/CIK0000732712.json"],
    ["archives dir (VZ)", "https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=0000732712&type=11-K&count=5"],
  ];
  mkdirSync("edgar-specimens", { recursive: true });
  const report = {};
  // SEC's documented "declared bot" header format, exactly:
  // User-Agent: Company Name admin@example.com / Accept-Encoding: gzip, deflate
  const HDRS = { "User-Agent": "wampo evanatchley1@gmail.com", "Accept-Encoding": "gzip, deflate", "Accept": "application/json, text/html" };
  for (const [label, url] of targets) {
    try {
      const res = await fetch(url, { headers: HDRS });
      const body = await res.text();
      report[label] = { status: res.status, bytes: body.length, head: body.slice(0, 200) };
      console.log(`${label}: ${res.status} (${body.length} bytes)`);
      if (!res.ok) console.log(`  body head: ${body.replace(/\s+/g, " ").slice(0, 300)}`);
      console.log(`  resp headers: ${JSON.stringify(Object.fromEntries([...res.headers].filter(([k]) => /server|akamai|cf-|x-|retry/.test(k))))}`);
      if (res.ok) writeFileSync(`edgar-specimens/probe-${label.replace(/[^a-z0-9]+/gi, "-")}.txt`, body.slice(0, 500000));
    } catch (e) {
      report[label] = { error: String(e) };
      console.log(`${label}: ERROR ${e.message}`);
    }
    await sleep(500);
  }
  writeFileSync("edgar-specimens/probe-report.json", JSON.stringify(report, null, 1));
}

const MODE = process.env.MODE || "specimens";
if (MODE === "specimens") await runSpecimens();
else if (MODE === "probe") await runProbe();
else { console.error(`unknown MODE ${MODE} (sweep mode lands after the parser is verified)`); process.exit(1); }
