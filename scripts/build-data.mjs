#!/usr/bin/env node
/* wampo Form 5500 ingest.
 * Downloads the DOL EFAST2 datasets and builds two outputs:
 *
 *   plans-all.json    — EVERY 401(k) plan with ≥100 participants at either
 *                       end of the plan year (first-year filings — spinoffs,
 *                       new MEPs — legitimately report 0 at the beginning;
 *                       GE Vernova's first short year had 0 BOY / 32,995 EOY)
 *                       (compact
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

// dataset years roll automatically: the DOL posts each year's received
// filings under that year's "Latest" folder; missing years (early January,
// not-yet-published) are tolerated by the per-year try/catch below.
// Four years back covers late fiscal-year filers.
const Y0 = new Date().getUTCFullYear();
const YEARS = [Y0, Y0 - 1, Y0 - 2, Y0 - 3];
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
    partTotal: colIndex(H, ["TOT_PARTCP_BOY_CNT", "TOT_ACT_RTD_SEP_BENEF_CNT", "TOT_PARTCP_CNT"], /TOT_PARTCP/),
    partEOY: colIndex(H, ["TOT_ACT_RTD_SEP_BENEF_CNT"], /ACT_RTD_SEP_BENEF/),
    partActive: colIndex(H, ["TOT_ACTIVE_PARTCP_CNT", "TOT_ACT_PARTCP_CNT"], /ACTIVE_PARTCP|ACT_PARTCP/),
    partBalances: colIndex(H, ["PARTCP_ACCOUNT_BAL_CNT", "TOT_PARTCP_ACCOUNT_BAL_CNT"], /ACCOUNT_BAL_CNT/),
    pensionCode: colIndex(H, ["TYPE_PENSION_BNFT_CODE"], /PENSION.*CODE/),
    businessCode: colIndex(H, ["BUSINESS_CODE"], /BUSINESS_CODE/),
    received: colIndex(H, ["DATE_RECEIVED"], /DATE_RECEIVED/),
    planYearBegin: colIndex(H, ["FORM_PLAN_YEAR_BEGIN_DATE"], /PLAN_YEAR_BEGIN/),
    planYearEnd: colIndex(H, ["FORM_TAX_PRD", "FORM_PLAN_YEAR_END_DATE"], /TAX_PRD|PLAN_YEAR_END/),
    dfeType: colIndex(H, ["TYPE_DFE_PLAN_ENTITY_CD"], /DFE_PLAN_ENTITY/),
  };
  console.log("columns:", JSON.stringify(col));

  const out = [];
  let n = 0;
  for await (const r of rows) {
    n++;
    // master trust (MTIA) DFE filings — their 4i holds the actual investments
    // for member plans that report only a trust interest in their own filing
    if (col.dfeType !== -1 && String(r[col.dfeType]).trim().toUpperCase() === "M") {
      mtiaFilings.push({ year, ack: r[col.ack], ein: r[col.ein], pn: r[col.pn],
        name: r[col.planName] || r[col.sponsor] || "Master trust" });
      continue;
    }
    const code = col.pensionCode !== -1 ? r[col.pensionCode] || "" : "";
    // 401(k)-type (2J) and ERISA 403(b) plans (2L annuity / 2M custodial) —
    // both file the same schedules; the codes drive the plan-type badge
    if (!/2J|2L|2M/.test(code)) continue;
    // line 5 (beginning of year) is the primary count, but a first-year
    // filing (spinoff, new MEP) legitimately reports 0 there — line 6d
    // (end-of-year subtotal) keeps those plans in the universe
    const partBOY = +r[col.partTotal] || 0;
    const partEOY = col.partEOY !== -1 ? +r[col.partEOY] || 0 : 0;
    if (Math.max(partBOY, partEOY) < MIN_UNIVERSE) continue;
    const participants = partBOY >= MIN_UNIVERSE ? partBOY : partEOY;
    const sponsorNorm = norm(r[col.sponsor]);
    const company = matchCompany(sponsorNorm);
    out.push({
      year,
      // line 6d, the END-of-year headcount. line 5 (BOY) was the only count
      // carried, so the site paired a beginning-of-year total with the
      // end-of-year active count and end-of-year assets — R.H. White read
      // "693 participants, 520 active" when 733 were in the plan at year end.
      partEOY,
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
      partBalances: col.partBalances !== -1 ? +r[col.partBalances] || 0 : 0,
      pensionCode: code,
      businessCode: col.businessCode !== -1 ? r[col.businessCode] : "",
      received: r[col.received],
      planYearBegin: col.planYearBegin !== -1 ? r[col.planYearBegin] : "",
      planYearEnd: col.planYearEnd !== -1 ? r[col.planYearEnd] : "",
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
    feeProf: colIndex(H, ["PROFESSIONAL_FEES_AMT"], /PROFESSIONAL_FEES/),
    feeAdmin: colIndex(H, ["CONTRACT_ADMIN_FEES_AMT"], /CONTRACT_ADMIN/),
    feeInvMgmt: colIndex(H, ["INVST_MGMT_FEES_AMT"], /INVST_MGMT|INVEST.*MGMT.*FEES/),
    feeOther: colIndex(H, ["OTH_ADMIN_FEES_AMT", "OTHER_ADMIN_FEES_AMT"], /OTH(ER)?_ADMIN|ADMIN.*OTH(ER)?_FEES/),
    feeSalaries: colIndex(H, ["SALARIES_ALLWNC_AMT", "TOT_SALARIES_ALLWNC_AMT"], /SALARIES/),
    benefitsPaid: colIndex(H, ["TOT_DISTRIB_BNFT_AMT", "BENEFIT_PAYMENT_DIRECT_AMT"], /DISTRIB_BNFT|BENEFIT_PAYMENT/),
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
      feeProf: col.feeProf !== -1 ? +r[col.feeProf] || 0 : 0,
      feeAdmin: col.feeAdmin !== -1 ? +r[col.feeAdmin] || 0 : 0,
      feeInvMgmt: col.feeInvMgmt !== -1 ? +r[col.feeInvMgmt] || 0 : 0,
      feeOther: col.feeOther !== -1 ? +r[col.feeOther] || 0 : 0,
      feeSalaries: col.feeSalaries !== -1 ? +r[col.feeSalaries] || 0 : 0,
      benefitsPaid: col.benefitsPaid !== -1 ? +r[col.benefitsPaid] || 0 : 0,
    });
  }
  console.log(`rows: ${n}, joined: ${out.size}/${wantedAcks.size}`);
  return out;
}

/* ---------- pass 1b: Form 5500-SF (small-plan short form) ----------
 * The 80-120 rule lets plans with 100-120 participants keep filing the
 * short form, which lives in its own dataset. They are 401(k) plans with
 * 100+ participants and belong in the universe (basics only: the SF has
 * no Schedule H/C/D and no audited fund schedule). */
async function scanSF(csv, year) {
  console.log(`\n== scanning 5500-SF ${year}`);
  const rows = csvRows(csv);
  const { value: header } = await rows.next();
  const H = header.map((h) => h.toUpperCase().trim());
  const col = {
    ack: colIndex(H, ["ACK_ID"]),
    sponsor: colIndex(H, ["SF_SPONSOR_NAME", "SF_SPONS_NAME"], /SPONS.*NAME/),
    ein: colIndex(H, ["SF_SPONS_EIN", "SF_SPONSOR_EIN"], /EIN/),
    pn: colIndex(H, ["SF_SPONS_PN", "SF_PLAN_NUM"], /_PN$|PLAN_NUM/),
    planName: colIndex(H, ["SF_PLAN_NAME"], /PLAN_NAME/),
    city: colIndex(H, ["SF_SPONS_US_CITY", "SF_SPONS_MAIL_US_CITY"], /CITY/),
    state: colIndex(H, ["SF_SPONS_US_STATE", "SF_SPONS_MAIL_US_STATE"], /STATE/),
    zip: colIndex(H, ["SF_SPONS_US_ZIP", "SF_SPONS_MAIL_US_ZIP"], /ZIP/),
    partBOY: colIndex(H, ["SF_TOT_PARTCP_BOY_CNT"], /TOT_PARTCP_BOY/),
    partEOY: colIndex(H, ["SF_TOT_PARTCP_EOY_CNT", "SF_TOT_ACT_RTD_SEP_BENEF_CNT"], /PARTCP_EOY|ACT_RTD_SEP_BENEF/),
    partActive: colIndex(H, ["SF_TOT_ACT_PARTCP_CNT", "SF_TOT_ACTIVE_PARTCP_CNT"], /ACT.*PARTCP/),
    partBalances: colIndex(H, ["SF_PARTCP_ACCOUNT_BAL_CNT"], /ACCOUNT_BAL_CNT/),
    pensionCode: colIndex(H, ["SF_TYPE_PENSION_BNFT_CODE"], /PENSION.*CODE/),
    businessCode: colIndex(H, ["SF_BUSINESS_CODE"], /BUSINESS_CODE/),
    assetsBOY: colIndex(H, ["SF_TOT_ASSETS_BOY_AMT", "SF_NET_ASSETS_BOY_AMT"], /ASSETS_BOY/),
    assetsEOY: colIndex(H, ["SF_TOT_ASSETS_EOY_AMT", "SF_NET_ASSETS_EOY_AMT"], /ASSETS_EOY/),
    contribEmployer: colIndex(H, ["SF_EMPLR_CONTRIB_AMT", "SF_EMPLR_CONTRIB_INCOME_AMT"], /EMPLR_CONTRIB/),
    contribParticipant: colIndex(H, ["SF_PARTCP_CONTRIB_AMT"], /PARTCP_CONTRIB(?!.*BAL)/),
    received: colIndex(H, ["DATE_RECEIVED"], /DATE_RECEIVED/),
    planYearBegin: colIndex(H, ["SF_PLAN_YEAR_BEGIN_DATE"], /PLAN_YEAR_BEGIN/),
    planYearEnd: colIndex(H, ["SF_TAX_PRD", "SF_PLAN_YEAR_END_DATE"], /TAX_PRD|PLAN_YEAR_END/),
  };
  console.log("SF columns:", JSON.stringify(col));
  const out = [];
  let n = 0;
  for await (const r of rows) {
    n++;
    const code = col.pensionCode !== -1 ? r[col.pensionCode] || "" : "";
    if (!/2J|2L|2M/.test(code)) continue;
    // same first-year rescue as the full form: EOY count keeps new plans in
    const sfBOY = +r[col.partBOY] || 0;
    const sfEOY = col.partEOY !== -1 ? +r[col.partEOY] || 0 : 0;
    if (Math.max(sfBOY, sfEOY) < MIN_UNIVERSE) continue;
    const participants = sfBOY >= MIN_UNIVERSE ? sfBOY : sfEOY;
    const sponsorNorm = norm(r[col.sponsor]);
    const company = matchCompany(sponsorNorm);
    out.push({
      year, sf: 1,
      ticker: company ? company.ticker : "",
      companyName: company ? company.name : "",
      ack: r[col.ack],
      sponsorName: r[col.sponsor],
      ein: r[col.ein],
      pn: r[col.pn],
      planName: r[col.planName],
      city: r[col.city], state: r[col.state], zip: (r[col.zip] || "").slice(0, 5),
      participants,
      activeParticipants: col.partActive !== -1 ? +r[col.partActive] || 0 : 0,
      partBalances: col.partBalances !== -1 ? +r[col.partBalances] || 0 : 0,
      pensionCode: code,
      businessCode: col.businessCode !== -1 ? r[col.businessCode] : "",
      received: r[col.received],
      planYearBegin: col.planYearBegin !== -1 ? r[col.planYearBegin] : "",
      planYearEnd: col.planYearEnd !== -1 ? r[col.planYearEnd] : "",
      sfH: {
        assetsBOY: col.assetsBOY !== -1 ? +r[col.assetsBOY] || 0 : 0,
        assetsEOY: col.assetsEOY !== -1 ? +r[col.assetsEOY] || 0 : 0,
        contribEmployer: col.contribEmployer !== -1 ? +r[col.contribEmployer] || 0 : 0,
        contribParticipant: col.contribParticipant !== -1 ? +r[col.contribParticipant] || 0 : 0,
      },
    });
  }
  console.log(`SF rows: ${n}, 401(k) >=${MIN_UNIVERSE} participants: ${out.length}`);
  return out;
}

/* ---------- pass 2b: schedule D (plan -> master trust links) ---------- */
async function scanSchD(csv, year, wantedAcks) {
  console.log(`\n== scanning SCH_D ${year}`);
  const rows = csvRows(csv);
  const { value: header } = await rows.next();
  const H = header.map((h) => h.toUpperCase().trim());
  const col = {
    ack: colIndex(H, ["ACK_ID"]),
    ein: colIndex(H, ["MTIA_CCT_PSA_EIN", "DFE_EIN"], /EIN/),
    pn: colIndex(H, ["MTIA_CCT_PSA_PN", "DFE_PN"], /_PN$|PLAN_NUM/),
    type: colIndex(H, ["MTIA_CCT_PSA_ENTITY_CODE", "DFE_ENTITY_CODE", "TYPE_DFE_ENTITY_CD"], /ENTITY.*(CODE|CD)|TYPE/),
    // entity code C rows are COLLECTIVE TRUSTS the plan holds. Their dollar
    // values identify which schedule-of-assets rows are CITs even when the
    // filer's own description column calls them "Mutual Fund" — R.H. White
    // labelled 13 Great Gray CITs (70% of plan assets) that way, so the site
    // typed them as mutual funds and priced them off a mutual-fund share
    // class. An exact value match is the join.
    // the real column is DFE_P1_PLAN_INT_EOY_AMT ("plan's interest at end of
    // year"), confirmed from the header the run printed — the guessed
    // DOLLAR_VALUE names resolved to -1 and correctly disabled CIT typing
    // rather than mistyping anything
    value: colIndex(H, ["DFE_P1_PLAN_INT_EOY_AMT", "MTIA_CCT_PSA_DOLLAR_VALUE", "DFE_DOLLAR_VALUE"], /PLAN_INT_EOY_AMT|DOLLAR_VALUE|VALUE_AMT/),
  };
  console.log("SCH_D columns:", JSON.stringify(col), "| header sample:", H.slice(0, 14).join(","));
  const out = new Map(); // plan ack -> [einpn,...] of MTIAs
  const cct = new Map(); // plan ack -> Set of collective-trust dollar values
  let n = 0, cctRows = 0;
  for await (const r of rows) {
    n++;
    const ack = r[col.ack];
    if (!wantedAcks.has(ack)) continue;
    const code = col.type === -1 ? "" : String(r[col.type]).trim().toUpperCase();
    if (code === "C" && col.value !== -1) {
      const v = Math.round(Number(String(r[col.value]).replace(/[^0-9.-]/g, "")) || 0);
      if (v > 0) {
        cctRows++;
        if (!cct.has(ack)) cct.set(ack, new Set());
        if (cct.get(ack).size < 60) cct.get(ack).add(v);
      }
      continue;
    }
    if (col.type !== -1 && code !== "M") continue;
    const key = `${String(r[col.ein]).trim()}|${String(r[col.pn]).trim()}`;
    if (!out.has(ack)) out.set(ack, []);
    if (out.get(ack).length < 4) out.get(ack).push(key);
  }
  console.log(`SCH_D rows: ${n}, plans with MTIA links: ${out.size}, collective-trust rows: ${cctRows} across ${cct.size} plans` +
    (col.value === -1 ? "  ⚠ no dollar-value column resolved — CIT typing disabled" : ""));
  return { mtia: out, cct };
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

/* ---------- schedule R: 401(k) nondiscrimination method (line 21b) ---------- */
// The 2023-revision Schedule R asks how the plan satisfies Code §401(k)
// nondiscrimination: a design-based safe harbor (SIMPLE 401(k), §401(k)(12)
// safe harbor, or QACA), the ADP test (current/prior year), or N/A. This is
// the only STRUCTURED safe-harbor disclosure in the whole filing — audited
// notes only say "safe harbor" when the auditor happens to write it.
// Column names for this recent line aren't pinned down offline (askebsa is
// unreachable from the dev sandbox), so match loosely, log every candidate
// header, and degrade to "" — never guess a value.
async function scanSchR(csv, year, wantedAcks) {
  console.log(`\n== scanning SCH_R ${year}`);
  const rows = csvRows(csv);
  const { value: header } = await rows.next();
  const H = header.map((h) => h.toUpperCase().trim());
  console.log("SCH_R candidate headers:", H.filter((h) => /ADP|SAFE|HARBOR|NONDISCRIM|DSGN|DESIGN/.test(h)).join(", ") || "(none)");

  const find = (re) => H.findIndex((h) => re.test(h));
  const col = {
    ack: colIndex(H, ["ACK_ID"]),
    sh: find(/SAFE_?HARBOR|DSGN_?BASED|DESIGN_?BASED/),
    curAdp: find(/CUR(R(ENT)?)?_?(YR|YEAR)?_?ADP|ADP_?CUR(R(ENT)?)?/),
    priorAdp: find(/PRIOR_?(YR|YEAR)?_?ADP|ADP_?PRIOR/),
    na: find(/(NONDISCRIM|401K?)\w*_NA(_IND)?$|_TEST_NA/),
  };
  console.log("columns:", JSON.stringify(col));
  if (col.ack === -1 || col.sh === -1) { console.warn("SCH_R: safe-harbor column not found — skipping year"); return new Map(); }

  const truthy = (v) => { const s = String(v ?? "").trim(); return s !== "" && s !== "0"; };
  const out = new Map();
  let n = 0, d = 0;
  for await (const r of rows) {
    n++;
    const ack = r[col.ack];
    if (!wantedAcks.has(ack)) continue;
    let s = "";
    if (truthy(r[col.sh])) { s += "D"; d++; }
    if ((col.curAdp !== -1 && truthy(r[col.curAdp])) || (col.priorAdp !== -1 && truthy(r[col.priorAdp]))) s += "A";
    if (col.na !== -1 && truthy(r[col.na])) s += "N";
    if (s) out.set(ack, s);
  }
  console.log(`SCH_R rows: ${n}, matched plans with an answer: ${out.size} (design-based safe harbor: ${d})`);
  return out;
}

async function scanSchC(year, wantedAcks, feeTables) {
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
    row: colIndex(H, ["ROW_ORDER"], /^ROW/),
    comp: colIndex(H, ["PROVIDER_OTHER_DIRECT_COMP_AMT", "DIRECT_COMP_AMT"], /DIRECT.*COMP|COMP.*AMT/),
    // fee-schedule elements (e)-(h): indirect-comp received, eligible-only,
    // non-eligible indirect total, formula-instead-of-amount
    indirect: colIndex(H, ["PROV_OTHER_INDIRECT_COMP_IND"], /INDIRECT_COMP_IND/),
    eligInd: colIndex(H, ["PROV_OTHER_ELIG_IND_COMP_IND"], /ELIG_IND_COMP/),
    indAmt: colIndex(H, ["PROV_OTHER_TOT_IND_COMP_AMT"], /TOT_IND_COMP_AMT/),
    formula: colIndex(H, ["PROVIDER_OTHER_AMT_FORMULA_IND"], /FORMULA_IND/),
  };
  console.log("columns:", JSON.stringify(col));
  if (col.ack === -1 || col.name === -1) { console.warn("SCH_C: required columns missing"); return new Map(); }

  // Service codes: ITEM2's PROVIDER_OTHER_SRVC_CODES column exists in the
  // header but is EMPTY in the Latest extracts (verified 2026-08-07: 0 of
  // 155k rows) — the filed codes ship in the ITEM2_CODES child table, one
  // row per code, keyed by ACK_ID + ROW_ORDER.
  const codesByRow = new Map();
  try {
    const csvC = unzip(await download(year, `F_SCH_C_PART1_ITEM2_CODES_${year}_Latest.zip`));
    const rowsC = csvRows(csvC);
    const { value: hC } = await rowsC.next();
    const HC = hC.map((h) => h.toUpperCase().trim());
    const cc = {
      ack: colIndex(HC, ["ACK_ID"]),
      row: colIndex(HC, ["ROW_ORDER"], /ROW/),
      code: colIndex(HC, ["SERVICE_CODE", "PROVIDER_OTHER_SERVICE_CODE"], /SERVICE.*CODE|SRVC/),
    };
    console.log("SCH_C codes header:", HC.join(", "));
    console.log("SCH_C codes columns:", JSON.stringify(cc));
    if (cc.ack === -1 || cc.row === -1 || cc.code === -1) {
      console.warn("SCH_C codes: required columns missing — skipped");
    } else {
      for await (const r of rowsC) {
        const ack = r[cc.ack];
        if (!wantedAcks.has(ack)) continue;
        const code = String(r[cc.code] || "").trim();
        if (!code) continue;
        const k = ack + "|" + r[cc.row];
        codesByRow.set(k, codesByRow.has(k) ? codesByRow.get(k) + " " + code : code);
      }
      console.log(`SCH_C codes: ${codesByRow.size} provider rows carry service codes`);
    }
  } catch (e) { console.warn(`SCH_C codes table unavailable: ${e.message}`); }

  // per ack keep best row: recordkeeping service code (15) beats compensation size
  const best = new Map();
  let n = 0;
  for await (const r of rows) {
    n++;
    const ack = r[col.ack];
    if (!wantedAcks.has(ack)) continue;
    const name = r[col.name];
    if (!name) continue;
    // inline column when populated (older extracts), else the child table
    const codes = (col.codes !== -1 && String(r[col.codes] || "").trim()) ||
      (col.row !== -1 && codesByRow.get(ack + "|" + r[col.row])) || "";
    const comp = col.comp !== -1 ? +r[col.comp] || 0 : 0;
    // full provider fee table (Sch C Part I item 2 files providers in
    // descending order of compensation) — cap 12 per plan to bound shards
    if (feeTables) {
      let list = feeTables.get(ack);
      if (!list) { list = []; feeTables.set(ack, list); }
      if (list.length < 12) {
        list.push({
          n: name, c: codes, d: comp,
          ...(col.indirect !== -1 && /^(yes|1|x)$/i.test(String(r[col.indirect] || "").trim()) ? { i: 1 } : {}),
          ...(col.eligInd !== -1 && /^(yes|1|x)$/i.test(String(r[col.eligInd] || "").trim()) ? { e: 1 } : {}),
          ...(col.indAmt !== -1 && +r[col.indAmt] ? { t: +r[col.indAmt] } : {}),
          ...(col.formula !== -1 && /^(yes|1|x)$/i.test(String(r[col.formula] || "").trim()) ? { fm: 1 } : {}),
        });
      }
    }
    const isRk = /(^|\D)15(\D|$)/.test(codes) || /RECORDKEEP/i.test(name);
    // the participant-facing platform (the site employees log into) beats
    // advisors/auditors that also file with recordkeeping-ish codes
    const isPlatform = RK_BRANDS.some(([re]) => re.test(name));
    const cur = best.get(ack);
    const score = (isPlatform ? 2e15 : 0) + (isRk ? 1e15 : 0) + comp;
    if (!cur || score > cur.score) best.set(ack, { name, score });
  }
  // Part I line 1(b) — disclosers of eligible indirect compensation. Many
  // filings (esp. master trusts) name the recordkeeper ONLY here (Voya on
  // the Kohler trust). Used when item 2 produced nothing for the ack.
  try {
    const csv1 = unzip(await download(year, `F_SCH_C_PART1_ITEM1_${year}_Latest.zip`));
    const rows1 = csvRows(csv1);
    const { value: h1 } = await rows1.next();
    const H1 = h1.map((h) => h.toUpperCase().trim());
    const c1 = { ack: colIndex(H1, ["ACK_ID"]), name: colIndex(H1, ["PROVIDER_INDIRECT_NAME", "PROVIDER_NAME"], /PROVIDER.*NAME|NAME/) };
    if (c1.ack !== -1 && c1.name !== -1) {
      for await (const r of rows1) {
        const ack = r[c1.ack];
        if (!wantedAcks.has(ack)) continue;
        const name = r[c1.name];
        if (!name) continue;
        const isPlatform = RK_BRANDS.some(([re]) => re.test(name));
        const cur = best.get(ack);
        const score = (isPlatform ? 2 : 0) + 1; // always below any item-2 pick
        if (!cur || (cur.score < 1e6 && score > cur.score)) best.set(ack, { name, score });
      }
    }
  } catch (e) { console.warn(`  SCH_C item1 ${year}: ${e.message}`); }
  const out = new Map();
  for (const [ack, v] of best) out.set(ack, brandOf(v.name));
  console.log(`rows: ${n}, recordkeepers matched: ${out.size}/${wantedAcks.size}`);
  return out;
}

/* ---------- Schedule A: insurance carrier commissions & fees ----------
 * Insurance-platform plans (common under ~$50M) pay much of their real cost
 * as broker commissions and fees reported ONLY on Schedule A — invisible in
 * Sch H expense lines and Sch C. Aggregated per ack for the fee schedule.
 * Column names are guarded: if a year's layout doesn't match, the year is
 * skipped with a warning and the prep log shows the resolved columns. */
async function scanSchA(year, wantedAcks) {
  const out = new Map();
  let csv;
  try { csv = unzip(await download(year, `F_SCH_A_${year}_Latest.zip`)); }
  catch (e) { console.warn(`SCH_A ${year}: ${e.message}`); return out; }
  console.log(`\n== scanning SCH_A ${year}`);
  const rows = csvRows(csv);
  const { value: header } = await rows.next();
  const H = header.map((h) => h.toUpperCase().trim());
  const col = {
    ack: colIndex(H, ["ACK_ID"]),
    carrier: colIndex(H, ["INS_CARRIER_NAME"], /CARRIER.*NAME/),
    comm: colIndex(H, ["INS_BROKER_COMM_TOT_AMT", "TOT_COMMISSIONS_PD_AMT"], /BROKER_COMM|COMM.*TOT_AMT|TOT.*COMM.*AMT/),
    fees: colIndex(H, ["INS_BROKER_FEES_TOT_AMT", "TOT_FEES_PD_AMT"], /BROKER_FEES|FEES.*TOT_AMT|TOT.*FEES.*AMT/),
  };
  console.log("SCH_A columns:", JSON.stringify(col));
  if (col.ack === -1 || (col.comm === -1 && col.fees === -1)) {
    console.warn("SCH_A: required columns missing — skipped");
    return out;
  }
  let n = 0;
  for await (const r of rows) {
    n++;
    const ack = r[col.ack];
    if (!wantedAcks.has(ack)) continue;
    const comm = col.comm !== -1 ? +r[col.comm] || 0 : 0;
    const fees = col.fees !== -1 ? +r[col.fees] || 0 : 0;
    if (!comm && !fees) continue;
    const cur = out.get(ack) || { cm: 0, fe: 0, cr: 0 };
    cur.cm += comm; cur.fe += fees; cur.cr++;
    out.set(ack, cur);
  }
  console.log(`SCH_A rows: ${n}, plans with commissions/fees: ${out.size}`);
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
      const cur = byPlan.get(key);
  if (!cur || m.year > cur.year ||
      (m.year === cur.year && String(m.received || "") > String(cur.received || ""))) byPlan.set(key, m);
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
const mtiaFilings = [];
for (const year of YEARS) {
  try {
    const csv = unzip(await download(year, `F_5500_${year}_Latest.zip`));
    collected.push(...await scanMainForm(csv, year));
  } catch (e) {
    console.warn(`year ${year} main form failed: ${e.message}`);
  }
  try {
    const csv = unzip(await download(year, `F_5500_SF_${year}_Latest.zip`));
    collected.push(...await scanSF(csv, year));
  } catch (e) {
    console.warn(`year ${year} 5500-SF failed: ${e.message}`);
  }
}

// dedupe universe by EIN+PN keeping the newest filing year
const byPlan = new Map();
for (const m of collected) {
  const key = `${m.ein}|${m.pn}`;
  const cur = byPlan.get(key);
  if (!cur || m.year > cur.year ||
      (m.year === cur.year && String(m.received || "") > String(cur.received || ""))) byPlan.set(key, m);
}
const universe = [...byPlan.values()];
console.log(`\nuniverse: ${universe.length} unique 401(k) plans with ≥${MIN_UNIVERSE} participants`);

// prior-year fallback map: for each plan whose NEWEST filing may lack a
// readable schedule, the next-newest FULL-FORM filing of the same EIN|PN.
// fetch-4i tries it when the primary parse yields no confident lineup, and
// labels the result with the fallback plan year. Artifact-only — the
// frontend never sees this file.
const fallback = {};
{
  const runnerUp = new Map();
  for (const m of collected) {
    if (m.sf) continue; // SF filings carry no schedule — useless as fallback
    const key = `${m.ein}|${m.pn}`;
    const primary = byPlan.get(key);
    if (!primary || m.ack === primary.ack) continue;
    const cur = runnerUp.get(key);
    if (!cur || m.year > cur.year ||
        (m.year === cur.year && String(m.received || "") > String(cur.received || ""))) runnerUp.set(key, m);
  }
  for (const [key, m] of runnerUp) {
    const primary = byPlan.get(key);
    if (primary.sf) continue; // primary SF filers are excluded from PDF parsing
    fallback[primary.ack] = { a: m.ack, y: m.planYearBegin ? +String(m.planYearBegin).slice(0, 4) : m.year };
  }
  writeFileSync("fallbacks.json", JSON.stringify({ generated: new Date().toISOString(), count: Object.keys(fallback).length, acks: fallback }));
  console.log(`wrote fallbacks.json: ${Object.keys(fallback).length} plans with a prior-year full-form filing`);
}

// master-trust registry: newest filing per trust EIN|PN
const mtiaByKey = new Map();
for (const m of mtiaFilings) {
  const key = `${String(m.ein).trim()}|${String(m.pn).trim()}`;
  if (!mtiaByKey.has(key) || m.year > mtiaByKey.get(key).year) mtiaByKey.set(key, m);
}
console.log(`MTIA filings: ${mtiaFilings.length}, unique trusts: ${mtiaByKey.size}`);

// plan -> trust links from Schedule D
const schD = new Map();
const schDCct = new Map(); // plan ack -> Set of Schedule D collective-trust values
for (const year of YEARS) {
  const acks = new Set(universe.filter((p) => p.year === year).map((p) => p.ack));
  if (!acks.size) continue;
  try {
    const csv = unzip(await download(year, `F_SCH_D_PART1_${year}_Latest.zip`));
    const { mtia, cct } = await scanSchD(csv, year, acks);
    for (const [k, v] of mtia) schD.set(k, v);
    for (const [k, v] of cct) schDCct.set(k, v);
  } catch (e) { console.warn(`Sch D ${year}: ${e.message}`); }
}
// attach the collective-trust values so merge can retype matching holdings
for (const p of universe) {
  const s = schDCct.get(p.ack);
  if (s && s.size) p.cctVals = [...s].join(" ");
}
console.log(`plans carrying Schedule D collective-trust values: ${universe.filter((p) => p.cctVals).length}`);
// prefer trusts whose own filing already parsed to a confident lineup
let parsedOk = {};
try { parsedOk = JSON.parse(readFileSync("lineups-status.json", "utf8")).plans; } catch { /* first run */ }
const usedMtias = new Map(); // ack -> {name, year}
for (const p of universe) {
  const links = (schD.get(p.ack) || []).map((k) => mtiaByKey.get(k)).filter(Boolean);
  if (!links.length) continue;
  const best = links.find((m) => (parsedOk[m.ack] || {}).c) || links[0];
  p.mtiaAck = best.ack;
  for (const m of links) usedMtias.set(m.ack, m); // parse every referenced trust
}
// EIN fallback: some filings omit Schedule D even though the plan's 4i shows
// only "Investment in Master Trust" (Elevance et al.). A trust filed under
// the sponsor's own EIN is that sponsor's trust. Link only when unambiguous:
// never a pension-named trust, and when several viable trusts share the EIN,
// require a single DC-named or confidently-parsed candidate — else skip.
const trustsByEin = new Map();
for (const m of mtiaByKey.values()) {
  const e = String(m.ein).trim();
  if (!trustsByEin.has(e)) trustsByEin.set(e, []);
  trustsByEin.get(e).push(m);
}
let einLinked = 0;
for (const p of universe) {
  if (p.mtiaAck) continue;
  const cands = (trustsByEin.get(String(p.ein).trim()) || [])
    .filter((m) => !/pension|defined benefit|\bdb\b/i.test(m.name || ""));
  if (!cands.length) continue;
  let pick = null;
  if (cands.length === 1) pick = cands[0];
  else {
    const dc = cands.filter((m) => /401\(?k\)?|savings|defined contribution|thrift|profit sharing/i.test(m.name || ""));
    if (dc.length === 1) pick = dc[0];
    else pick = (dc.length ? dc : cands).find((m) => (parsedOk[m.ack] || {}).c) || null;
  }
  if (!pick) continue;
  p.mtiaAck = pick.ack;
  usedMtias.set(pick.ack, pick);
  einLinked++;
}
console.log(`plans linked to a master trust filing: ${universe.filter((p) => p.mtiaAck).length} (${einLinked} via EIN fallback), trusts referenced: ${usedMtias.size}`);

// join Schedule H + Schedule C per year
const schH = new Map();
const schC = new Map();
const schR = new Map();
const feeTables = new Map(); // ack -> Sch C provider fee rows
const schA = new Map();      // ack -> insurance commissions/fees
for (const year of YEARS) {
  const acks = new Set(universe.filter((p) => p.year === year).map((p) => p.ack));
  for (const [ack, m] of usedMtias) if (m.year === year) acks.add(ack);
  if (!acks.size) continue;
  try {
    const csv = unzip(await download(year, `F_SCH_H_${year}_Latest.zip`));
    for (const [k, v] of await scanSchH(csv, year, acks)) schH.set(k, v);
  } catch (e) { console.warn(`Sch H ${year}: ${e.message}`); }
  try {
    for (const [k, v] of await scanSchC(year, acks, feeTables)) schC.set(k, v);
  } catch (e) { console.warn(`Sch C ${year}: ${e.message}`); }
  try {
    const csv = unzip(await download(year, `F_SCH_R_${year}_Latest.zip`));
    for (const [k, v] of await scanSchR(csv, year, acks)) schR.set(k, v);
  } catch (e) { console.warn(`Sch R ${year}: ${e.message}`); }
  try {
    for (const [k, v] of await scanSchA(year, acks)) schA.set(k, v);
  } catch (e) { console.warn(`Sch A ${year}: ${e.message}`); }
}

// per-plan fee schedule shards (fetched on demand like lineups): Sch C
// provider table + Sch A insurance commissions, keyed by ack, hash matches
// data/lineups sharding
{
  const FEE_SHARDS = 64;
  const shardOf = (ack) => {
    let h = 0;
    for (const c of ack) h = (h * 31 + c.charCodeAt(0)) >>> 0;
    return h % FEE_SHARDS;
  };
  const buckets = Array.from({ length: FEE_SHARDS }, () => ({}));
  let plansWithFees = 0;
  for (const p of universe) {
    const entry = {};
    const provs = feeTables.get(p.ack);
    if (provs && provs.length) entry.p = provs;
    const a = schA.get(p.ack);
    if (a) entry.a = a;
    if (!entry.p && !entry.a) continue;
    buckets[shardOf(p.ack)][p.ack] = entry;
    plansWithFees++;
  }
  mkdirSync("data/fees", { recursive: true });
  for (let i = 0; i < FEE_SHARDS; i++) {
    writeFileSync(`data/fees/${String(i).padStart(2, "0")}.json`, JSON.stringify(buckets[i]));
  }
  console.log(`wrote data/fees shards: ${plansWithFees} plans with a provider fee table or Sch A entry`);
}

function titleCase(s) {
  return String(s || "").toLowerCase().replace(/\b[a-z]/g, (c) => c.toUpperCase());
}

/* --- compact universe file: array-of-arrays, keyed by FIELDS order --- */
const FIELDS = ["ein", "pn", "sponsorName", "planName", "city", "state", "zip", "businessCode",
  "planYear", "participants", "activeParticipants", "assetsBOY", "assetsEOY",
  "contribEmployer", "contribParticipant", "rollovers", "adminExpenses",
  "filedDate", "recordkeeper", "ticker", "ack", "codes", "pyb", "partBalances", "feeProf", "feeAdmin", "feeInvMgmt", "feeOther", "benefitsPaid", "mtiaAck", "sf", "shr", "pye", "feeSal", "cctVals", "partEOY"];

// pye is stored only for IRREGULAR plan years (short first/final years) —
// blank means the year ends at the natural 12-month boundary, which keeps
// the file size flat across 104k rows
function irregularYearEnd(p) {
  if (!p.planYearBegin || !p.planYearEnd) return "";
  const pyb = String(p.planYearBegin), pye = String(p.planYearEnd);
  const by = +pyb.slice(0, 4), bm = +pyb.slice(5, 7);
  const natural = bm === 1
    ? `${by}-12`
    : `${by + 1}-${String(bm - 1).padStart(2, "0")}`;
  return pye.slice(0, 7) === natural ? "" : pye.slice(0, 7);
}

const rowsOut = [];
for (const p of universe) {
  const h = p.sf ? p.sfH : (schH.get(p.ack) || {});
  rowsOut.push([
    p.ein, p.pn, titleCase(p.sponsorName), p.planName, titleCase(p.city), p.state, p.zip, p.businessCode,
    p.planYearBegin ? +String(p.planYearBegin).slice(0, 4) : p.year,
    p.participants, p.activeParticipants,
    h.assetsBOY || 0, h.assetsEOY || 0,
    h.contribEmployer || 0, h.contribParticipant || 0, h.rollovers || 0, h.adminExpenses || 0,
    p.received || "", schC.get(p.ack) || (p.mtiaAck && schC.get(p.mtiaAck)) || "", p.ticker || "", p.ack, p.pensionCode || "",
    p.planYearBegin ? String(p.planYearBegin).slice(0, 7) : "",
    p.partBalances || 0, h.feeProf || 0, h.feeAdmin || 0, h.feeInvMgmt || 0, h.feeOther || 0, h.benefitsPaid || 0,
    p.mtiaAck || "", p.sf || 0, schR.get(p.ack) || "", irregularYearEnd(p),
    h.feeSalaries || 0, p.cctVals || "", p.partEOY || 0,
  ]);
}
rowsOut.sort((a, b) => b[12] - a[12]); // by assets desc
writeFileSync("plans-all.json", JSON.stringify({ generated: new Date().toISOString(), fields: FIELDS, count: rowsOut.length, plans: rowsOut }));
console.log(`wrote plans-all.json: ${rowsOut.length} plans, ${(Buffer.byteLength(JSON.stringify(rowsOut)) / 1e6).toFixed(1)} MB`);

/* --- fee percentiles: admin-expense-per-participant by plan-size cohort.
 * Distribution over full-form filers that charged anything to plan assets;
 * zeroShare separately reports how many comparable plans filed $0 (fees
 * employer-paid or netted inside fund expenses — Sch H can't distinguish). */
{
  const iPart = FIELDS.indexOf("participants"), iAdmin = FIELDS.indexOf("adminExpenses"), iSF = FIELDS.indexOf("sf");
  const COHORTS = [
    { min: 100, max: 500, label: "100–499 participants" },
    { min: 500, max: 1000, label: "500–999 participants" },
    { min: 1000, max: 5000, label: "1,000–4,999 participants" },
    { min: 5000, max: 20000, label: "5,000–19,999 participants" },
    { min: 20000, max: Infinity, label: "20,000+ participants" },
  ].map((c) => ({ ...c, perHead: [], zero: 0 }));
  for (const r of rowsOut) {
    if (r[iSF] || !(r[iPart] > 0)) continue;
    const c = COHORTS.find((x) => r[iPart] >= x.min && r[iPart] < x.max);
    if (!c) continue;
    const admin = r[iAdmin] || 0;
    if (admin > 0) c.perHead.push(admin / r[iPart]);
    else c.zero++;
  }
  const QS = [0.05, 0.1, 0.25, 0.5, 0.75, 0.9, 0.95];
  const cohorts = COHORTS.map((c) => {
    c.perHead.sort((a, b) => a - b);
    const q = (f) => c.perHead.length ? c.perHead[Math.min(c.perHead.length - 1, Math.floor(f * c.perHead.length))] : null;
    return {
      min: c.min, max: c.max === Infinity ? null : c.max, label: c.label,
      n: c.perHead.length, zeroShare: +(c.zero / Math.max(1, c.zero + c.perHead.length)).toFixed(3),
      qs: QS, p: QS.map((f) => c.perHead.length ? +q(f).toFixed(2) : null),
    };
  });
  writeFileSync("fee-percentiles.json", JSON.stringify({ generated: new Date().toISOString(), cohorts }));
  console.log("fee percentiles: " + cohorts.map((c) => `${c.label}: n=${c.n} zero=${(100 * c.zeroShare).toFixed(0)}% median=$${c.p[3]}`).join(" | "));
}

/* --- boot-payload split ---------------------------------------------------
 * The site never downloads plans-all.json (pipeline-internal). Visitors get:
 *  - plans-list.json: columnar table/search/filter data (~2.7 MB gzipped)
 *  - data/plans/NN.json: per-plan filing detail, fetched on expand
 * List numbers are display-precision (am = assets in $100k units; ab/ac =
 * avg balance/contribution in $100 units, replicating derive()'s distrust
 * rule for the filer-entered with-balance count); exact figures come from
 * the detail shard. plan name ships only where a sponsor files several
 * plans (disambiguation); everyone gets the full name on expand.
 * cf bits: 1=2R brokerage, 2=2S auto-enroll, 4=2K match, 8=short-form,
 * 16=no employer contributions that year, 32=403(b). */
{
  const ix = Object.fromEntries(FIELDS.map((f, i) => [f, i]));
  const g = (r, f) => r[ix[f]];
  const einCount = new Map();
  for (const r of rowsOut) einCount.set(g(r, "ein"), (einCount.get(g(r, "ein")) || 0) + 1);
  const cols = { ein: [], pn: [], name: [], plan: [], st: [], bc: [], parts: [], am: [], ab: [], ac: [], rk: [], tk: [], cf: [], shr: [] };
  const DETAIL_SHARDS = 64;
  const shardOfKey = (k) => { let h = 0; for (const c of k) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h % DETAIL_SHARDS; };
  const buckets = Array.from({ length: DETAIL_SHARDS }, () => ({}));
  const DETAIL_FIELDS = ["ack", "planName", "city", "zip", "planYear", "pyb", "pye", "filedDate", "codes",
    "mtiaAck", "assetsBOY", "assetsEOY", "contribEmployer", "contribParticipant", "rollovers",
    "adminExpenses", "feeProf", "feeAdmin", "feeInvMgmt", "feeOther", "feeSal", "benefitsPaid",
    "partBalances", "activeParticipants"];
  for (const r of rowsOut) {
    const codes = g(r, "codes") || "";
    const cf = (/2R/.test(codes) ? 1 : 0) | (/2S/.test(codes) ? 2 : 0) | (/2K/.test(codes) ? 4 : 0) |
      (g(r, "sf") ? 8 : 0) | ((g(r, "contribEmployer") || 0) === 0 ? 16 : 0) | (/2L|2M/.test(codes) ? 32 : 0);
    const parts = g(r, "partEOY") || g(r, "participants") || 0, act = g(r, "activeParticipants") || 0;
    const assets = g(r, "assetsEOY") || 0, pb = g(r, "partBalances") || 0;
    const balCnt = pb && pb >= parts * 0.05 && (pb >= parts * 0.5 || !assets || assets / pb <= 1e6) ? pb : parts;
    const avgBal = assets > 0 && balCnt ? Math.round(assets / balCnt / 100) : 0;
    const totContrib = (g(r, "contribParticipant") || 0) + (g(r, "contribEmployer") || 0);
    let avgC = totContrib > 0 && act ? Math.round(totContrib / act / 100) : 0;
    if (avgC > 800) avgC = 0;
    cols.ein.push(g(r, "ein")); cols.pn.push(+g(r, "pn") || 0);
    cols.name.push(g(r, "sponsorName"));
    cols.plan.push(einCount.get(g(r, "ein")) > 1 ? g(r, "planName") : "");
    cols.st.push(g(r, "state") || ""); cols.bc.push(g(r, "businessCode") || "");
    cols.parts.push(parts); cols.am.push(Math.round(assets / 1e5));
    cols.ab.push(avgBal); cols.ac.push(avgC);
    cols.rk.push(g(r, "recordkeeper") || ""); cols.tk.push(g(r, "ticker") || "");
    cols.cf.push(cf); cols.shr.push(g(r, "shr") || "");
    const entry = {};
    for (const f of DETAIL_FIELDS) { const v = g(r, f); if (v) entry[f] = v; }
    const key = g(r, "ein") + "|" + g(r, "pn");
    buckets[shardOfKey(key)][key] = entry;
  }
  writeFileSync("plans-list.json", JSON.stringify({ generated: new Date().toISOString(), count: rowsOut.length, cols }));
  mkdirSync("data/plans", { recursive: true });
  for (let i = 0; i < DETAIL_SHARDS; i++) writeFileSync(`data/plans/${String(i).padStart(2, "0")}.json`, JSON.stringify(buckets[i]));
  console.log(`wrote plans-list.json (${(Buffer.byteLength(JSON.stringify(cols)) / 1e6).toFixed(1)} MB raw) + ${DETAIL_SHARDS} data/plans shards`);
}

// master-trust parse work list for fetch-4i
const mtiaOut = [...usedMtias.entries()].map(([ack, m]) => ({
  ack, name: m.name, planYear: m.year, assetsEOY: (schH.get(ack) || {}).assetsEOY || 0,
}));
writeFileSync("mtias.json", JSON.stringify({ generated: new Date().toISOString(), count: mtiaOut.length, trusts: mtiaOut }, null, 1));
console.log(`wrote mtias.json: ${mtiaOut.length} referenced master trusts`);

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
