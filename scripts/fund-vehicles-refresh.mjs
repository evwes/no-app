#!/usr/bin/env node
/* wampo — REFRESH the dated figures on vehicles we have already sourced.
 *
 * The owner's requirement (2026-11-14): the YTD figure is updated daily at
 * 3 AM Eastern for the previous day. A sourced return that nobody refreshes
 * goes stale silently — 91 ticker entries crossed the ten-day staleness line
 * overnight the day this was written, and the only thing that noticed was the
 * validator's warning count.
 *
 * THIS SCRIPT REFRESHES AND NEVER DISCOVERS. It reads `vehicles`, re-fetches
 * each entry's OWN recorded source URL, and updates the figures that URL
 * carries. It cannot add an entry, cannot change a key, cannot invent a source
 * and cannot reach a vehicle nobody sourced by hand. Discovery stays with the
 * fund-facts agent, where a human-written report says what was found and why —
 * *a rename, a ticker, a fee and a return are FACTS that must be SOURCED*, and
 * a cron job is not a place to decide what a fund is.
 *
 * ON FAILURE IT KEEPS WHAT IT HAS. A fetch that 403s, times out or returns a
 * shape it does not recognise leaves the stored entry untouched and prints the
 * reason. The alternative — blanking on error — would turn one bad night at an
 * issuer into a page-wide loss of figures, and *a suppressed command is an
 * uninstrumented command*, so every skip is printed with its cause.
 *
 * Usage: node scripts/fund-vehicles-refresh.mjs [--dry] [--limit N]
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FILE = path.join(ROOT, "data", "fund-facts.json");
const DRY = process.argv.includes("--dry");
const LIMIT = (() => { const i = process.argv.indexOf("--limit"); return i > 0 ? +process.argv[i + 1] : Infinity; })();
const today = new Date().toISOString().slice(0, 10);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const isoDay = (s) => String(s || "").slice(0, 10);

const doc = JSON.parse(readFileSync(FILE, "utf8"));
const vehicles = doc.vehicles || {};
const keys = Object.keys(vehicles);
if (!keys.length) { console.log("fund-vehicles-refresh: no vehicles to refresh"); process.exit(0); }

/* ---- the issuer adapters -------------------------------------------------
 * Keyed on the HOST of the entry's own recorded source, so a vehicle can only
 * ever be refreshed from where it was originally read. Adding an issuer means
 * adding an adapter here AND sourcing its vehicles first; an unknown host is
 * reported and skipped rather than guessed at. */
const ADAPTERS = [
  {
    host: "investor.vanguard.com",
    /* the profile carries the fee, the performance endpoint the returns. The
     * YTD block is the DAILY figure and `calendarYTDPct` elsewhere in the same
     * response is the MONTH-END series under a similar name — taking the wrong
     * one reports a correct figure as a different correct figure, silently. */
    async read(url) {
      const id = (url.match(/\/vmf\/api\/([^/]+)\//) || [])[1];
      if (!id) return { skip: "no fund id in the recorded source URL" };
      const out = {};
      const prof = await getJson(`https://investor.vanguard.com/vmf/api/${id}/profile`);
      if (prof && prof.fundProfile) {
        const p = prof.fundProfile;
        const er = Number(p.expenseRatio);
        if (Number.isFinite(er) && er >= 0 && er <= 5 && p.expenseRatioAsOfDate) {
          out.er = er; out.erAsOf = isoDay(p.expenseRatioAsOfDate);
          out.erSource = `https://investor.vanguard.com/vmf/api/${id}/profile`;
        }
      }
      const perf = await getJson(`https://investor.vanguard.com/vmf/api/${id}/performance`);
      if (perf && perf.YTD && perf.YTD.regular != null && perf.YTD.asOfDate) {
        const y = Number(perf.YTD.regular);
        if (Number.isFinite(y) && y >= -100 && y <= 500) {
          out.ytd = y; out.ytdAsOf = isoDay(perf.YTD.asOfDate);
          out.ytdSource = `https://investor.vanguard.com/vmf/api/${id}/performance`;
        }
      }
      const r = perf && perf.recentInvestmentRtn && perf.recentInvestmentRtn.fundReturn;
      if (r && r.asOfDate) {
        const asOf = isoDay(r.asOfDate);
        const band = { r1y: [-95, 200], r3y: [-70, 120], r5y: [-60, 100], r10y: [-50, 80] };
        const src = { r1y: r.oneYrPct, r3y: r.threeYrPct, r5y: r.fiveYrPct, r10y: r.tenYrPct };
        for (const k of Object.keys(band)) {
          const v = Number(src[k]);
          if (!Number.isFinite(v) || v < band[k][0] || v > band[k][1]) continue;
          out[k] = v; out[`${k}AsOf`] = asOf;
          out[`${k}Source`] = `https://investor.vanguard.com/vmf/api/${id}/performance`;
        }
        if (Object.keys(out).some((k) => /^r\d+y$/.test(k))) out.returnBasis = "annualised";
      }
      return Object.keys(out).length ? { fields: out } : { skip: "the source returned no usable figure" };
    },
  },
];

async function getJson(url) {
  try {
    const res = await fetch(url, { headers: { Accept: "application/json" } });
    if (!res.ok) return null;
    return await res.json();
  } catch { return null; }
}

let refreshed = 0, unchanged = 0, skipped = 0, failedHost = 0;
const reasons = new Map();
const note = (why) => { reasons.set(why, (reasons.get(why) || 0) + 1); };
let n = 0;

for (const key of keys) {
  if (n >= LIMIT) break;
  const e = vehicles[key];
  const src = e.ytdSource || e.erSource || e.source;
  if (!src) { skipped++; note("entry records no source URL"); continue; }
  let host = "";
  try { host = new URL(src).host; } catch { skipped++; note("source URL does not parse"); continue; }
  const ad = ADAPTERS.find((a) => a.host === host);
  if (!ad) { failedHost++; note(`no adapter for ${host} — source it by hand first`); continue; }
  n++;
  const got = await ad.read(src);
  await sleep(150);                       // this is someone else's server
  if (got.skip) { skipped++; note(got.skip); continue; }

  /* ONLY MOVE A FIGURE FORWARD. An as-of date that is OLDER than the stored one
   * means the source is serving something staler than we already hold, which is
   * not a refresh; and a future date is refused outright, as the checker does. */
  let moved = false;
  for (const [k, v] of Object.entries(got.fields)) {
    /* the companions of a figure, not figures themselves. Without the Source
     * arm the loop looked for `erSourceAsOf`, found none, and filed six fields
     * per entry under "future or undated" — a diagnostic that counted my own
     * loop rather than anything the issuer returned. */
    if (/AsOf$/.test(k) || /Source$/.test(k)) continue;
    if (k === "returnBasis") continue;
    const asOfKey = `${k}AsOf`;
    const newAsOf = got.fields[asOfKey];
    if (!newAsOf || newAsOf > today) { note("source returned a future or undated figure"); continue; }
    if (e[asOfKey] && newAsOf < e[asOfKey]) { note("source is staler than what we hold"); continue; }
    if (e[k] === v && e[asOfKey] === newAsOf) continue;
    e[k] = v; e[asOfKey] = newAsOf;
    if (got.fields[`${k}Source`]) e[`${k}Source`] = got.fields[`${k}Source`];
    moved = true;
  }
  if (moved) {
    if (got.fields.returnBasis) e.returnBasis = got.fields.returnBasis;
    e.updated = today;
    refreshed++;
  } else unchanged++;
}

console.log(`fund-vehicles-refresh: ${keys.length} vehicles — ${refreshed} refreshed, ${unchanged} already current, ${skipped} skipped, ${failedHost} with no adapter`);
for (const [why, c] of [...reasons.entries()].sort((a, b) => b[1] - a[1])) console.log(`  ${String(c).padStart(4)}  ${why}`);

/* A RUN THAT REACHED NOTHING IS A FAILURE, NOT A QUIET SUCCESS. If every
 * adapter-eligible vehicle failed to read, the host is refusing us and the
 * right outcome is a red run somebody looks at — not a silent no-op that
 * reads exactly like "nothing needed refreshing". */
if (n > 0 && refreshed === 0 && unchanged === 0) {
  console.log("fund-vehicles-refresh: FAILED — every eligible vehicle was skipped; the source is not answering");
  process.exit(1);
}
if (DRY) { console.log("(--dry: nothing written)"); process.exit(0); }
if (refreshed) {
  doc.generated = new Date().toISOString();
  writeFileSync(FILE, JSON.stringify(doc, null, 1) + "\n");
  console.log(`wrote ${path.relative(ROOT, FILE)}`);
}
