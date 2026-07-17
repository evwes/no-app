#!/usr/bin/env node
/* wampo Form 5500 ingest.
 * Downloads the DOL EFAST2 datasets and builds two outputs:
 *
 *   plans-all.json    — EVERY 401(k) plan with ≥100 participants (compact
 *                       array-of-arrays; ~80-90k plans), joined with
 *                       Schedule H financials and the Schedule C
 *                       recordkeeper.
 *   plans-filed.json  — the S&P subset matched via scripts/companies.json
 *                       (same shape as before; feeds the 4i lineup fetcher
 *                       and the curated overlay).
 *
 * Runs in GitHub Actions (the dev sandbox has no DOL access). No deps.
 */
import { createReadStream, createWriteStream, existsSync, mkdirSync, writeFileSync, readFileSync, readdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { pipeline } from "node:stream/promises";
import path from "node:path";

const WORK = process.env.WORK_DIR || "/tmp/f5500";
mkdirSync(WORK, { recursive: true });

const YEARS = [2025, 2024, 2023];
const MIN_UNIVERSE = 100; // full Form 5500 filing threshold
const BASES = [
  (y, f) => `https://askebsa.dol.gov/FOIA%20Files/${y}/Latest/${f}`,
];

/* ---------- download + unzip ---------- */
async function download(year, file) {
  const dest = path.join(WORK, file);
  if (existsSync(dest)) return dest;
  let lastErr;
  for (const base of BASES) {
    const url = base(year, file);
    try {
      console.log("↓", url);
      const res = await fetch(url, { redirect: "follow" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await pipeline(res.body, createWriteStream(dest));
      return dest;
    } catch (e) {
      lastErr = e;
      console.warn("  failed:", e.message);
    }
  }
  throw new Error(`could not download ${file}: ${lastErr}`);
}

function unzip(zipPath) {
  const dir = zipPath.replace(/\.zip$/i, "");
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
    execFileSync("unzip", ["-o", "-q", zipPath, "-d", dir], { stdio: "inherit" });
  }
  const csv = readdirSync(dir).find((f) => f.toLowerCase().endsWith(".csv"));
  if (!csv) throw new Error(`no csv in ${dir}`);
  return path.join(dir, csv);
}

/* ---------- streaming CSV ---------- */
async function* csvRows(file) {
  const stream = createReadStream(file, { encoding: "utf8" });
  let field = "", row = [], inQuotes = false, prevQuote = false;
  for await (const chunk of stream) {
    for (let i = 0; i < chunk.length; i++) {
      const c = chunk[i];
      if (inQuotes) {
        if (c === '"') { inQuotes = false; prevQuote = true; }
        else field += c;
      } else if (prevQuote && c === '"') {
        field += '"'; inQuotes = true; prevQuote = false;
      } else {
        prevQuote = false;
        if (c === '"') inQuotes = true;
        else if (c === ",") { row.push(field); field = ""; }
        else if (c === "\n") {
          row.push(field.replace(/\r$/, ""));
          yield row;
          row = []; field = "";
        } else field += c;
      }
    }
  }
  if (field !== "" || row.length) { row.push(field.replace(/\r$/, "")); yield row; }
}

function colIndex(header, candidates, regex) {
  for (const c of candidates) {
    const i = header.indexOf(c);
    if (i !== -1) return i;
  }
  if (regex) {
    const i = header.findIndex((h) => regex.test(h));
    if (i !== -1) return i;
  }
  return -1;
}

/* ---------- company matching (S&P subset tagging) ---------- */
function norm(s) {
  return String(s || "").toUpperCase().replace(/[^A-Z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
}

const { companies } = JSON.parse(readFileSync(new URL("./companies.json", import.meta.url), "utf8"));
for (const c of companies) c.aliasNorms = c.aliases.map(norm);

function matchCompany(sponsorNorm) {
  for (const c of companies) {
    for (const a of c.aliasNorms) {
      if (sponsorNorm === a || sponsorNorm.startsWith(a + " ") || sponsorNorm.startsWith(a)) return c;
    }
  }
  return null;
}

/* ---------- pass 1: main form (whole universe) ---------- */
async function scanMainForm(csv, year) {
  console.log(`\n== scanning F_5500 ${year}`);
  const rows = csvRows(csv);
  const { value: header } = await rows.next();
  const H = header.map((h) => h.toUpperCase().trim());

  const col = {
    ack: colIndex(H, ["ACK_ID"]),
    sponsor: colIndex(H, ["SPONSOR_DFE_NAME", "SPONS_DFE_NAME"], /SPONSOR.*NAME/),
    ein: colIndex(H, ["SPONS_DFE_EIN", "SPONSOR_DFE_EIN"], /EIN/),
    pn: colIndex(H, ["SPONS_DFE_PN", "LAST_RPT_PLAN_NUM", "PLAN_NUM"], /_PN$/),
    planName: colIndex(H, ["PLAN_NAME"]),
    city: colIndex(H, ["SPONS_DFE_MAIL_US_CITY", "SPONS_DFE_LOC_US_CITY"], /MAIL.*CITY/),
    state: colIndex(H, ["SPONS_DFE_MAIL_US_STATE", "SPONS_DFE_LOC_US_STATE"], /MAIL.*STATE/),
    zip: colIndex(H, ["SPONS_DFE_MAIL_US_ZIP", "SPONS_DFE_LOC_US_ZIP"], /MAIL.*ZIP/),
    partTotal: colIndex(H, ["TOT_ACT_RTD_SEP_BENEF_CNT", "TOT_PARTCP_BOY_CNT", "TOT_PARTCP_CNT"], /TOT_PARTCP/),
    partActive: colIndex(H, ["TOT_ACTIVE_PARTCP_CNT", "TOT_ACT_PARTCP_CNT"], /ACTIVE_PARTCP|ACT_PARTCP/),
    pensionCode: colIndex(H, ["TYPE_PENSION_BNFT_CODE"], /PENSION.*CODE/),
    businessCode: colIndex(H, ["BUSINESS_CODE"], /BUSINESS_CODE/),
    received: colIndex(H, ["DATE_RECEIVED"], /DATE_RECEIVED/),
    planYearBegin: colIndex(H, ["FORM_PLAN_YEAR_BEGIN_DATE"], /PLAN_YEAR_BEGIN/),
  };
  console.log("columns:", JSON.stringify(col));

  const out = [];
  let n = 0;
  for await (const r of rows) {
    n++;
    const code = col.pensionCode !== -1 ? r[col.pensionCode] || "" : "";
    if (!code.includes("2J")) continue; // 401(k) plans only
    const participants = +r[col.partTotal] || 0;
    if (participants < MIN_UNIVERSE) continue;
    const sponsorNorm = norm(r[col.sponsor]);
    const company = matchCompany(sponsorNorm);
    out.push({
      year,
      ticker: company ? company.ticker : "",
      companyName: company ? company.name : "",
      ack: r[col.ack],
      sponsorName: r[col.sponsor],
      ein: r[col.ein],
      pn: r[col.pn],
      planName: r[col.planName],
      city: r[col.city], state: r[col.state], zip: (r[col.zip] || "").slice(0, 5),
      participants,
      activeParticipants: +r[col.partActive] || 0,
      pensionCode: code,
      businessCode: col.businessCode !== -1 ? r[col.businessCode] : "",
      received: r[col.received],
      planYearBegin: col.planYearBegin !== -1 ? r[col.planYearBegin] : "",
    });
  }
  console.log(`rows: ${n}, 401(k) ≥${MIN_UNIVERSE} participants: ${out.length}`);
  return out;
}

/* ---------- pass 2: schedule H (financials for all) ---------- */
async function scanSchH(csv, year, wantedAcks) {
  console.log(`\n== scanning SCH_H ${year}`);
  const rows = csvRows(csv);
  const { value: header } = await rows.next();
  const H = header.map((h) => h.toUpperCase().trim());

  const col = {
    ack: colIndex(H, ["ACK_ID"]),
    assetsBOY: colIndex(H, ["TOT_ASSETS_BOY_AMT"], /TOT_ASSETS_BOY/),
    assetsEOY: colIndex(H, ["TOT_ASSETS_EOY_AMT"], /TOT_ASSETS_EOY/),
    contribEmployer: colIndex(H, ["EMPLR_CONTRIB_INCOME_AMT"], /EMPLR.*CONTRIB.*INCOME/),
    contribParticipant: colIndex(H, ["PARTICIPANT_CONTRIB_AMT", "PARTICIPANT_CONTRIB_INCOME_AMT"], /PARTICIPANT_CONTRIB/),
    rollovers: colIndex(H, ["OTH_CONTRIB_RCVD_AMT"], /OTH_CONTRIB/),
    adminExpenses: colIndex(H, ["TOT_ADMIN_EXPENSES_AMT"], /ADMIN.*EXPENSE/),
  };
  console.log("columns:", JSON.stringify(col));

  const out = new Map();
  let n = 0;
  for await (const r of rows) {
    n++;
    const ack = r[col.ack];
    if (!wantedAcks.has(ack)) continue;
    out.set(ack, {
      assetsBOY: +r[col.assetsBOY] || 0,
      assetsEOY: +r[col.assetsEOY] || 0,
      contribEmployer: col.contribEmployer !== -1 ? +r[col.contribEmployer] || 0 : 0,
      contribParticipant: col.contribParticipant !== -1 ? +r[col.contribParticipant] || 0 : 0,
      rollovers: col.rollovers !== -1 ? +r[col.rollovers] || 0 : 0,
      adminExpenses: col.adminExpenses !== -1 ? +r[col.adminExpenses] || 0 : 0,
    });
  }
  console.log(`rows: ${n}, joined: ${out.size}/${wantedAcks.size}`);
  return out;
}

/* ---------- pass 3: schedule C (recordkeeper) ---------- */
const RK_BRANDS = [
  [/FIDELITY/i, "Fidelity"], [/VANGUARD/i, "Vanguard"], [/EMPOWER/i, "Empower"],
  [/ALIGHT/i, "Alight"], [/VOYA/i, "Voya"], [/SCHWAB/i, "Schwab"],
  [/T\.?\s*ROWE|TROWE/i, "T. Rowe Price"], [/PRINCIPAL/i, "Principal"],
  [/MERRILL|BANK OF AMERICA|BOFA/i, "Bank of America"], [/TRANSAMERICA/i, "Transamerica"],
  [/JOHN HANCOCK/i, "John Hancock"], [/PRUDENTIAL/i, "Prudential"], [/TIAA/i, "TIAA"],
  [/ADP/i, "ADP"], [/PAYCHEX/i, "Paychex"], [/ASCENSUS/i, "Ascensus"],
  [/NATIONWIDE/i, "Nationwide"], [/MILLIMAN/i, "Milliman"], [/CONDUENT/i, "Conduent"],
  [/NORTHWEST PLAN|NWPS/i, "NWPS"], [/LINCOLN/i, "Lincoln Financial"],
  [/MASS\s*MUTUAL|MASSMUTUAL/i, "MassMutual"], [/SENTINEL/i, "Sentinel"],
  [/VESTWELL/i, "Vestwell"], [/GUIDELINE/i, "Guideline"], [/BETTERMENT/i, "Betterment"],
  [/SLAVIC/i, "Slavic401k"], [/OneAmerica|ONE AMERICA/i, "OneAmerica"],
];

function brandOf(name) {
  for (const [re, brand] of RK_BRANDS) if (re.test(name)) return brand;
  return String(name || "").toLowerCase().replace(/\b[a-z]/g, (c) => c.toUpperCase()).slice(0, 40);
}

async function scanSchC(year, wantedAcks) {
  const files = [
    `F_SCH_C_PART1_ITEM2_${year}_Latest.zip`,
    `F_SCH_C_PART1_ITEM2_CODES_${year}_Latest.zip`,
    `F_SCH_C_${year}_Latest.zip`,
  ];
  let csv = null;
  for (const f of files) {
    try { csv = unzip(await download(year, f)); break; }
    catch (e) { console.warn(`  ${f}: ${e.message}`); }
  }
  if (!csv) { console.warn(`SCH_C ${year}: no dataset`); return new Map(); }

  console.log(`\n== scanning SCH_C ${year}: ${path.basename(csv)}`);
  const rows = csvRows(csv);
  const { value: header } = await rows.next();
  const H = header.map((h) => h.toUpperCase().trim());
  console.log("SCH_C header:", H.slice(0, 30).join(", "));

  const col = {
    ack: colIndex(H, ["ACK_ID"]),
    name: colIndex(H, ["PROVIDER_OTHER_NAME", "PROVIDER_NAME"], /PROVIDER.*NAME/),
    codes: colIndex(H, ["SERVICE_CODES", "PROVIDER_OTHER_SRVC_CODES"], /SERVICE.*CODE|SRVC/),
    comp: colIndex(H, ["PROVIDER_OTHER_DIRECT_COMP_AMT", "DIRECT_COMP_AMT"], /DIRECT.*COMP|COMP.*AMT/),
  };
  console.log("columns:", JSON.stringify(col));
  if (col.ack === -1 || col.name === -1) { console.warn("SCH_C: required columns missing"); return new Map(); }

  // per ack keep best row: recordkeeping service code (15) beats compensation size
  const best = new Map();
  let n = 0;
  for await (const r of rows) {
    n++;
    const ack = r[col.ack];
    if (!wantedAcks.has(ack)) continue;
    const name = r[col.name];
    if (!name) continue;
    const codes = col.codes !== -1 ? String(r[col.codes] || "") : "";
    const comp = col.comp !== -1 ? +r[col.comp] || 0 : 0;
    const isRk = /(^|\D)15(\D|$)/.test(codes) || /RECORDKEEP/i.test(name);
    const cur = best.get(ack);
    const score = (isRk ? 1e15 : 0) + comp;
    if (!cur || score > cur.score) best.set(ack, { name, score });
  }
  const out = new Map();
  for (const [ack, v] of best) out.set(ack, brandOf(v.name));
  console.log(`rows: ${n}, recordkeepers matched: ${out.size}/${wantedAcks.size}`);
  return out;
}

/* ---------- S&P pick (unchanged behavior) ---------- */
const MIN_SP = 500;

function pickTickered(all) {
  const byTicker = new Map();
  for (const m of all) {
    if (!m.ticker) continue;
    if (!byTicker.has(m.ticker)) byTicker.set(m.ticker, []);
    byTicker.get(m.ticker).push(m);
  }
  const picked = [];
  for (const [ticker, list] of byTicker) {
    const byPlan = new Map();
    for (const m of list) {
      const key = `${m.ein}|${m.pn}`;
      if (!byPlan.has(key) || m.year > byPlan.get(key).year) byPlan.set(key, m);
    }
    const pool = [...byPlan.values()].sort((a, b) => b.participants - a.participants);
    const best = pool[0];
    if (!best || best.participants < MIN_SP) {
      console.warn(`skipping ${ticker}: best match too small`);
      continue;
    }
    picked.push(best);
  }
  return picked;
}

/* ---------- main ---------- */
const collected = [];
for (const year of YEARS) {
  try {
    const csv = unzip(await download(year, `F_5500_${year}_Latest.zip`));
    collected.push(...await scanMainForm(csv, year));
  } catch (e) {
    console.warn(`year ${year} main form failed: ${e.message}`);
  }
}

// dedupe universe by EIN+PN keeping the newest filing year
const byPlan = new Map();
for (const m of collected) {
  const key = `${m.ein}|${m.pn}`;
  if (!byPlan.has(key) || m.year > byPlan.get(key).year) byPlan.set(key, m);
}
const universe = [...byPlan.values()];
console.log(`\nuniverse: ${universe.length} unique 401(k) plans with ≥${MIN_UNIVERSE} participants`);

// join Schedule H + Schedule C per year
const schH = new Map();
const schC = new Map();
for (const year of YEARS) {
  const acks = new Set(universe.filter((p) => p.year === year).map((p) => p.ack));
  if (!acks.size) continue;
  try {
    const csv = unzip(await download(year, `F_SCH_H_${year}_Latest.zip`));
    for (const [k, v] of await scanSchH(csv, year, acks)) schH.set(k, v);
  } catch (e) { console.warn(`Sch H ${year}: ${e.message}`); }
  try {
    for (const [k, v] of await scanSchC(year, acks)) schC.set(k, v);
  } catch (e) { console.warn(`Sch C ${year}: ${e.message}`); }
}

function titleCase(s) {
  return String(s || "").toLowerCase().replace(/\b[a-z]/g, (c) => c.toUpperCase());
}

/* --- compact universe file: array-of-arrays, keyed by FIELDS order --- */
const FIELDS = ["ein", "pn", "sponsorName", "planName", "city", "state", "zip", "businessCode",
  "planYear", "participants", "activeParticipants", "assetsBOY", "assetsEOY",
  "contribEmployer", "contribParticipant", "rollovers", "adminExpenses",
  "filedDate", "recordkeeper", "ticker", "ack", "codes", "pyb"];

const rowsOut = [];
for (const p of universe) {
  const h = schH.get(p.ack) || {};
  rowsOut.push([
    p.ein, p.pn, titleCase(p.sponsorName), p.planName, titleCase(p.city), p.state, p.zip, p.businessCode,
    p.planYearBegin ? +String(p.planYearBegin).slice(0, 4) : p.year,
    p.participants, p.activeParticipants,
    h.assetsBOY || 0, h.assetsEOY || 0,
    h.contribEmployer || 0, h.contribParticipant || 0, h.rollovers || 0, h.adminExpenses || 0,
    p.received || "", schC.get(p.ack) || "", p.ticker || "", p.ack, p.pensionCode || "",
    p.planYearBegin ? String(p.planYearBegin).slice(0, 7) : "",
  ]);
}
rowsOut.sort((a, b) => b[12] - a[12]); // by assets desc
writeFileSync("plans-all.json", JSON.stringify({ generated: new Date().toISOString(), fields: FIELDS, count: rowsOut.length, plans: rowsOut }));
console.log(`wrote plans-all.json: ${rowsOut.length} plans, ${(Buffer.byteLength(JSON.stringify(rowsOut)) / 1e6).toFixed(1)} MB`);

/* --- S&P subset (existing shape; feeds fetch-4i + curated overlay) --- */
const picked = pickTickered(universe);
const out = [];
const missing = [];
for (const c of companies) {
  const p = picked.find((m) => m.ticker === c.ticker);
  if (!p) { missing.push(c.ticker); continue; }
  const h = schH.get(p.ack) || {};
  out.push({
    ticker: p.ticker,
    ack: p.ack,
    company: c.name,
    sponsorName: p.sponsorName,
    ein: p.ein ? `${String(p.ein).slice(0, 2)}-${String(p.ein).slice(2)}` : "",
    pn: p.pn,
    planName: p.planName,
    city: titleCase(p.city), state: p.state, zip: p.zip,
    planYear: p.planYearBegin ? +String(p.planYearBegin).slice(0, 4) : p.year,
    participants: p.participants,
    activeParticipants: p.activeParticipants,
    pensionCode: p.pensionCode,
    businessCode: p.businessCode,
    filedDate: p.received,
    recordkeeper: schC.get(p.ack) || "",
    assetsBOY: h.assetsBOY || null,
    assetsEOY: h.assetsEOY || null,
    contribEmployer: h.contribEmployer || null,
    contribParticipant: h.contribParticipant || null,
    rollovers: h.rollovers || null,
    adminExpenses: h.adminExpenses || null,
    source: `Form 5500, plan year ${p.year} (DOL EFAST2 public dataset)`,
  });
}
out.sort((a, b) => (b.assetsEOY || 0) - (a.assetsEOY || 0));
writeFileSync("plans-filed.json", JSON.stringify({ generated: new Date().toISOString(), count: out.length, missing, plans: out }, null, 1));
console.log(`wrote plans-filed.json: ${out.length} S&P plans; missing: ${missing.join(", ") || "none"}`);
