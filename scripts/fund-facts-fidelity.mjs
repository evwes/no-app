#!/usr/bin/env node
/* wampo — REFRESH SOURCED FUND FIGURES FROM FIDELITY'S FUND-SCREENER API.
 *
 * WHY THIS EXISTS, and it is a correction rather than an addition. The daily
 * ticker refresh walks `schwab.wallst.com`, and on 2026-11-16 that source was
 * measured to LAG THE FUND COMPANY ON THE FUND COMPANY'S OWN FUNDS: for every
 * Fidelity-family fund where the two disagreed, `schwab − fidelity` equalled
 * exactly MINUS THAT DAY'S RETURN, with a residual averaging +0.019 and never
 * exceeding 0.13, across funds spanning money markets, bonds and leveraged
 * equity. So a figure Schwab labels "as of the 13th" is the 12th's close.
 * The lazy reading — "we are a day behind on everything" — is refuted by the
 * same data: 62 of 63 non-Fidelity same-day pairs AGREE exactly while moving
 * just as much that day. A distributor's feed lags the issuer, and only for
 * the issuer's own funds.
 *
 * Fidelity is the ISSUER for those funds, which this project's standing rule
 * already ranks above a distributor, and its API dates every daily YTD on one
 * date for all 8,538 funds that carry one — so one source buys CONSISTENCY and
 * CORRECTNESS together (owner, 2026-11-16: "just keep it consistent").
 *
 * IT REFRESHES AND NEVER DISCOVERS, exactly like `fund-vehicles-refresh.mjs`
 * and for the same reason: a cron job must never decide what a fund IS. It
 * cannot add an entry, change a key, or invent a source. `--add` exists for a
 * human or agent run and is off in CI.
 *
 * IT EXITS 1 WHEN IT REACHED NOTHING, because a silent no-op reads exactly
 * like "nothing needed refreshing".
 *
 * THE FIELD TRAP, which is the whole reason the extractor equivalent exists:
 * the payload carries TWO YTD figures. `dailyPerformance.cumulativeTotalReturnsYTD`
 * is the current one and `bestAvailableMonthlyPerformance.cumulativeTotalReturns.ytd`
 * is MONTH-END. They differ by whole points. Only the first is ever read here,
 * and `--selftest` asserts that against a pinned record.
 *
 * Run: node scripts/fund-facts-fidelity.mjs [--limit N] [--dry] [--add]
 *                                           [--pages DIR] [--selftest]
 */
import { readFileSync, writeFileSync, existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ENDPOINT = "https://fundresearch.fidelity.com/fund-screener/api/search/v1/funds";
const SUBJECTS = "fundInformation,dailyPerformance,bestAvailableMonthlyPerformance,expensesAndFees";
const PAGE_SIZE = 100;
const MAX_PAGES = 400;          // the universe ended at 94 when measured; this is a bound, not a target
const arg = (f, d) => { const i = process.argv.indexOf(f); return i > 0 ? process.argv[i + 1] : d; };
const DRY = process.argv.includes("--dry");
const ADD = process.argv.includes("--add");
const LIMIT = +arg("--limit", "0");
const PAGES_DIR = arg("--pages", "");   // read saved pages instead of fetching (tests, replay)

/* ---- the one place a record is turned into figures ---------------------- */

const htmlOff = (s) => String(s || "")
  .replace(/<[^>]+>/g, "")
  .replace(/&reg;/g, "®").replace(/&amp;/g, "&").replace(/&nbsp;/g, " ")
  .replace(/\s+/g, " ").trim();
const iso = (mdy) => {
  if (!mdy || !/^\d{2}\/\d{2}\/\d{4}$/.test(mdy)) return null;
  const [m, d, y] = mdy.split("/");
  return `${y}-${m}-${d}`;
};
const num = (v) => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

export function figuresFrom(rec) {
  const fi = rec.fundInformation || {};
  const ef = rec.expensesAndFees || {};
  const dp = rec.dailyPerformance || {};
  const mp = rec.bestAvailableMonthlyPerformance || {};
  const aar = mp.averageAnnualReturns || {};
  const tk = String(fi.ticker || "").trim().toUpperCase();
  if (!tk) return null;
  const cusip = String(fi.cusip || "").trim();
  const src = cusip ? `https://fundresearch.fidelity.com/mutual-funds/summary/${cusip}` : null;
  const out = { tk, name: htmlOff(fi.legalName), src, inception: iso(fi.inceptionDate) };

  const er = num(ef.netXpnsRatio), erAsOf = iso(ef.netXpnsDate);
  if (er != null && erAsOf && er >= 0 && er <= 3) { out.er = er; out.erAsOf = erAsOf; }

  /* THE DAILY FIGURE, NEVER mp.cumulativeTotalReturns.ytd */
  const ytd = num(dp.cumulativeTotalReturnsYTD), ytdAsOf = iso(dp.asOfDate);
  if (ytd != null && ytdAsOf && ytd >= -100 && ytd <= 500) { out.ytd = ytd; out.ytdAsOf = ytdAsOf; }

  /* A TRAILING RETURN LONGER THAN THE FUND'S LIFE IS REFUSED HERE, not only by
   * the checker. The API's "best available" history reaches back BEFORE a share
   * class existed — FSAKX launched 2024-06-26 and is served a 3, 5 and 10 year
   * figure; ISGDX launched 2017 and is served a 10 year. `fund-facts-check.mjs`
   * fails on exactly these, so a refresh that wrote them would redden the
   * build every morning. Re-applying the refusal at the point of extraction is
   * this project's standing pattern: a generator that trusts its input
   * publishes its input's mistakes. */
  const rAsOf = iso(mp.asOfDate);
  if (rAsOf) {
    const YEARS = { r1y: 1, r3y: 3, r5y: 5, r10y: 10 };
    const lifeYears = out.inception
      ? (Date.parse(rAsOf) - Date.parse(out.inception)) / 31557600000 : Infinity;
    for (const [k, f] of [["r1y", "year1"], ["r3y", "year3"], ["r5y", "year5"], ["r10y", "year10"]]) {
      const v = num(aar[f]);
      if (v == null || v < -100 || v > 200) continue;
      if (lifeYears < YEARS[k]) continue;        // the fund is younger than the horizon
      out[k] = v; out[`${k}AsOf`] = rAsOf;
    }
  }
  return out;
}

/* A FIGURE MAY BE REPLACED ONLY BY A STRICTLY NEWER ONE, OR BY ONE FROM THE
 * SAME SOURCE. This is the rule that stops a lagging distributor undoing a
 * correction, and it is source-agnostic on purpose: it protects whichever
 * source got there with the fresher date, rather than naming a favourite.
 * Equal dates from DIFFERENT sources resolve to "keep what is stored", which
 * also makes the refresh idempotent instead of flip-flopping. */
export function mayReplace(oldAsOf, oldSrc, newAsOf, newSrc) {
  if (!oldAsOf) return true;
  if (!newAsOf) return false;
  const host = (u) => { try { return new URL(u).host; } catch { return String(u || ""); } };
  /* SAME SOURCE STILL MAY NOT GO BACKWARDS. The first version returned true
   * unconditionally here, which let a REPLAY of older saved pages overwrite a
   * fresher figure from the same host with a staler one — a regression with a
   * valid receipt, and exactly the shape this file exists to prevent. */
  if (host(oldSrc) === host(newSrc)) return newAsOf >= oldAsOf;
  return newAsOf > oldAsOf;
}

/* EVERYTHING BELOW RUNS ONLY WHEN THIS FILE IS THE PROGRAM. Without this
 * guard, `import { figuresFrom } from "./fund-facts-fidelity.mjs"` in a
 * diagnostic EXECUTES THE REFRESH — a live fetch of the whole universe and a
 * write to data/fund-facts.json — as a side effect of asking a question about
 * it. That happened on 2026-11-16: a script written to explain 87 pending
 * moves performed them instead, and then reported "[]" because by the time it
 * looked, it had already applied them. *A module that acts when imported
 * cannot be inspected without being run.* */
const IS_MAIN = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);

/* ---- selftest ----------------------------------------------------------- */

if (IS_MAIN && process.argv.includes("--selftest")) {
  const rec = {
    fundInformation: { ticker: "ZZTEST", cusip: "000000000", legalName: "Zed<sup>&reg;</sup> Index Fund", inceptionDate: "02/17/1988" },
    expensesAndFees: { netXpnsRatio: "0.015", netXpnsDate: "04/29/2026" },
    dailyPerformance: { asOfDate: "11/13/2026", cumulativeTotalReturnsYTD: "11.53" },
    bestAvailableMonthlyPerformance: { asOfDate: "10/31/2026",
      averageAnnualReturns: { year1: "12.09", year3: "23.38", year5: "12.05", year10: "15.43" },
      cumulativeTotalReturns: { ytd: "11.75" } },
  };
  const f = figuresFrom(rec);
  const cases = [
    ["ticker", f.tk === "ZZTEST"],
    ["name HTML stripped", f.name === "Zed® Index Fund"],
    ["er + its own prospectus date", f.er === 0.015 && f.erAsOf === "2026-04-29"],
    ["ytd is the DAILY figure, not the 11.75 month-end one", f.ytd === 11.53 && f.ytdAsOf === "2026-11-13"],
    ["trailing carry the month-end date", f.r10y === 15.43 && f.r10yAsOf === "2026-10-31"],
    ["inception", f.inception === "1988-02-17"],
    ["source is cusip-keyed", f.src.endsWith("/000000000")],
    /* negative controls for the replace rule */
    ["same source replaces", mayReplace("2026-11-13", "https://a.com/x", "2026-11-13", "https://a.com/y") === true],
    ["same source, OLDER date, refused (a replay may not go backwards)",
      mayReplace("2026-11-13", "https://a.com/x", "2026-11-12", "https://a.com/y") === false],
    ["other source, EQUAL date, refused", mayReplace("2026-11-13", "https://a.com/x", "2026-11-13", "https://b.com/y") === false],
    ["other source, OLDER date, refused", mayReplace("2026-11-13", "https://a.com/x", "2026-11-12", "https://b.com/y") === false],
    ["other source, NEWER date, allowed", mayReplace("2026-11-13", "https://a.com/x", "2026-11-14", "https://b.com/y") === true],
    ["no stored date, allowed", mayReplace(null, null, "2026-11-13", "https://b.com/y") === true],
  ];
  let bad = 0;
  for (const [what, ok] of cases) { console.log(`${ok ? "ok  " : "FAIL"} ${what}`); if (!ok) bad++; }
  /* the trap, stated as its own case: a record whose ONLY ytd is month-end
   * must yield no ytd at all rather than falling back to it */
  const noDaily = figuresFrom({ ...rec, dailyPerformance: {} });
  const ok = noDaily.ytd === undefined;
  console.log(`${ok ? "ok  " : "FAIL"} no daily block -> NO ytd (never the month-end fallback)`);
  if (!ok) bad++;
  /* the young-fund refusal, with a POSITIVE control beside it so the test
   * cannot pass by refusing everything */
  const young = figuresFrom({ ...rec,
    fundInformation: { ...rec.fundInformation, inceptionDate: "06/26/2024" } });
  const okYoung = young.r1y === 12.09 && young.r3y === undefined
    && young.r5y === undefined && young.r10y === undefined;
  console.log(`${okYoung ? "ok  " : "FAIL"} a fund younger than the horizon keeps r1y and loses r3y/r5y/r10y`);
  if (!okYoung) bad++;
  console.log(`\nfund-facts-fidelity --selftest: ${bad ? bad + " FAILURE(S)" : "all checks passed"}`);
  process.exit(bad ? 1 : 0);
}

/* ---- the refresh -------------------------------------------------------- */

if (!IS_MAIN) {
  /* imported for its functions: expose them and do nothing else */
} else {

const factsPath = path.join(ROOT, "data", "fund-facts.json");
if (!existsSync(factsPath)) { console.error("no data/fund-facts.json"); process.exit(1); }
const facts = JSON.parse(readFileSync(factsPath, "utf8"));
facts.funds ||= {};
const have = new Set(Object.keys(facts.funds).map((t) => t.toUpperCase()));
console.log(`stored: ${have.size.toLocaleString()} ticker entries`);

async function fetchPage(p) {
  const body = JSON.stringify({ searchFilter: {}, sortBy: "averageAnnualReturnsYear3",
    sortOrder: "DESC", currentPageNumber: p, businessChannel: "RETAIL",
    noOfRowsPerPage: PAGE_SIZE, subjectAreaCode: SUBJECTS });
  const r = await fetch(ENDPOINT, { method: "POST", body,
    headers: { "Content-Type": "application/json", Accept: "application/json",
      Referer: "https://fundresearch.fidelity.com/fund-screener/results/table/overview/averageAnnualReturnsYear3/desc/1" } });
  if (r.status === 404) return null;                 // the clean end of the universe
  if (!r.ok) throw new Error(`page ${p}: HTTP ${r.status}`);
  return r.json();
}

const records = [];
if (PAGES_DIR) {
  for (const f of readdirSync(PAGES_DIR).filter((x) => /^p\d+\.json$/.test(x))) {
    let d; try { d = JSON.parse(readFileSync(path.join(PAGES_DIR, f), "utf8")); } catch { continue; }
    for (const r of d.funds || []) records.push(r);
  }
  console.log(`replayed ${records.length.toLocaleString()} records from ${PAGES_DIR}`);
} else {
  for (let p = 1; p <= MAX_PAGES; p++) {
    let d;
    try { d = await fetchPage(p); }
    catch (e) { console.error(`  ${e.message}`); break; }
    if (!d || !Array.isArray(d.funds) || !d.funds.length) { console.log(`  page ${p}: end of universe`); break; }
    records.push(...d.funds);
    if (LIMIT && records.length >= LIMIT) break;
    await new Promise((s) => setTimeout(s, 300));    // politeness
  }
  console.log(`fetched ${records.length.toLocaleString()} records`);
}

if (!records.length) {
  console.error("REACHED NOTHING — exiting 1 so this does not read as 'nothing needed refreshing'");
  process.exit(1);
}

const today = new Date().toISOString().slice(0, 10);
let seen = 0, touched = 0, added = 0, keptEr = 0, keptYtd = 0, skipped = 0;
for (const rec of records) {
  const f = figuresFrom(rec);
  if (!f || !f.src) continue;
  seen++;
  const known = have.has(f.tk);
  if (!known && !ADD) { skipped++; continue; }
  const ent = facts.funds[f.tk] || (facts.funds[f.tk] = { name: f.name, updated: today });
  if (!known) added++;
  let moved = false;
  if (f.er != null && mayReplace(ent.erAsOf, ent.erSource, f.erAsOf, f.src)) {
    if (ent.er !== f.er || ent.erAsOf !== f.erAsOf) moved = true;
    ent.er = f.er; ent.erAsOf = f.erAsOf; ent.erSource = f.src;
  } else if (f.er != null) keptEr++;
  if (f.ytd != null && mayReplace(ent.ytdAsOf, ent.ytdSource, f.ytdAsOf, f.src)) {
    if (ent.ytd !== f.ytd || ent.ytdAsOf !== f.ytdAsOf) moved = true;
    ent.ytd = f.ytd; ent.ytdAsOf = f.ytdAsOf; ent.ytdSource = f.src;
  } else if (f.ytd != null) keptYtd++;
  for (const k of ["r1y", "r3y", "r5y", "r10y"]) {
    if (f[k] == null) continue;
    if (!mayReplace(ent[`${k}AsOf`], ent.source || ent.ytdSource, f[`${k}AsOf`], f.src)) continue;
    if (ent[k] !== f[k]) moved = true;
    ent[k] = f[k]; ent[`${k}AsOf`] = f[`${k}AsOf`];
    ent.returnBasis = "annualised";
  }
  if (f.inception && !ent.inception) ent.inception = f.inception;
  if (moved) { ent.updated = today; touched++; }
}

console.log(`records with a ticker and a source: ${seen.toLocaleString()}`);
console.log(`  entries whose figures MOVED: ${touched.toLocaleString()}`);
console.log(`  added (--add): ${added.toLocaleString()}   not stored and not added: ${skipped.toLocaleString()}`);
console.log(`  figures KEPT because a different source holds an equal-or-newer date: er ${keptEr.toLocaleString()}, ytd ${keptYtd.toLocaleString()}`);
if (DRY) { console.log("--dry: nothing written"); process.exit(0); }
if (!touched && !added) { console.log("nothing moved — file left untouched"); process.exit(0); }
facts.generated = today;
writeFileSync(factsPath, JSON.stringify(facts, null, 1) + "\n");
console.log(`wrote data/fund-facts.json`);

}
