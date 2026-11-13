#!/usr/bin/env node
/* wampo — validator for data/fund-facts.json (ticker / expense ratio / YTD
 * return, each with a source and an as-of date).
 *
 * WHY: the site stripped synthetic returns and fees on 2026-07-18 and does not
 * reintroduce them. This file is the only place a RETURN may live, and only
 * with its date and source. The checker refuses anything undated, unsourced,
 * dated in the future, or numerically implausible, so a figure cannot reach
 * the file — let alone a page — without its receipt.
 *
 * Usage: node scripts/fund-facts-check.mjs [path]   (exit 1 on any failure)
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const file = process.argv[2] || path.join(root, "data", "fund-facts.json");
const today = new Date().toISOString().slice(0, 10);
const STALE_DAYS = 10; // ~7 trading days; a warning, not a failure

let doc;
try { doc = JSON.parse(fs.readFileSync(file, "utf8")); }
catch (e) { console.log(`FAIL cannot read ${file}: ${e.message}`); process.exit(1); }

const funds = doc && doc.funds;
if (!funds || typeof funds !== "object" || Array.isArray(funds)) { console.log("FAIL top-level \"funds\" object missing"); process.exit(1); }

const isDate = (s) => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s));
const isUrl = (s) => typeof s === "string" && /^https?:\/\/\S+$/.test(s);
const fails = [], warns = [];
let n = 0, withEr = 0, withYtd = 0, withTrailing = 0;

/* THE RETURN RULES, SHARED BY BOTH SECTIONS (2026-11-13).
 *
 * They were written for `funds` and lived inside its loop, so `vehicles` —
 * which is where every collective trust lives — could not carry a return at
 * all: the field whitelist rejected `ytd` as unknown. That was invisible while
 * `vehicles` held zero entries, and it stops being invisible the moment a
 * provider that publishes its trusts is sourced. Vanguard publishes a profile
 * per TARGET RETIREMENT TRUST CLASS, with its own CUSIP, its own dated expense
 * ratio and its own dated returns, so the premise that a trust has no public
 * figures is false for 15,046 published rows / 10.7M readers.
 *
 * MOVED, NOT RETYPED. This body is the shipped text with `ticker` renamed to
 * `key`; the bands, the staleness warning, the annualised requirement, the
 * mixed-as-of-date warning and the inception check are the same rules, so a
 * vehicle's return cannot be held to a weaker standard than a fund's. A
 * re-implementation here would be a second set of rules wearing the first
 * one's name. */
function checkReturns(key, f, bad) {
  let ytd = 0, trailing = 0;
  if (f.ytd !== undefined) {
    ytd++;
    if (typeof f.ytd !== "number" || !(f.ytd >= -100 && f.ytd <= 500)) bad(`ytd ${f.ytd} is not a number in -100..500 (percent)`);
    if (!isDate(f.ytdAsOf)) bad("ytd has no ytdAsOf date");
    else {
      if (f.ytdAsOf > today) bad(`ytdAsOf ${f.ytdAsOf} is in the future`);
      const age = (Date.parse(today) - Date.parse(f.ytdAsOf)) / 86400000;
      if (age > STALE_DAYS) warns.push(`${key}: ytd as of ${f.ytdAsOf} is ${Math.round(age)} days old (stale for display)`);
      if (!f.ytdAsOf.startsWith(today.slice(0, 4))) warns.push(`${key}: ytdAsOf ${f.ytdAsOf} is not this calendar year — a YTD figure from a past year is not "year to date"`);
    }
    if (!isUrl(f.ytdSource || f.source)) bad("ytd has no source URL (ytdSource or source)");
  }
  const HORIZON = { r1y: [-95, 200], r3y: [-70, 120], r5y: [-60, 100], r10y: [-50, 80] };
  const present = Object.keys(HORIZON).filter((k) => f[k] !== undefined);
  for (const k of present) {
    trailing++;
    const [lo, hi] = HORIZON[k];
    if (typeof f[k] !== "number" || !(f[k] >= lo && f[k] <= hi))
      bad(`${k} ${f[k]} is not a number in ${lo}..${hi} (ANNUALISED percent — a cumulative figure belongs in no field here)`);
    if (!isDate(f[`${k}AsOf`])) bad(`${k} has no ${k}AsOf date`);
    else if (f[`${k}AsOf`] > today) bad(`${k}AsOf ${f[`${k}AsOf`]} is in the future`);
    if (!isUrl(f[`${k}Source`] || f.source)) bad(`${k} has no source URL (${k}Source or source)`);
  }
  if (present.length) {
    if (f.returnBasis !== "annualised")
      bad(`a trailing return needs returnBasis "annualised" (got ${JSON.stringify(f.returnBasis)}) — a 10-year cumulative figure is ~2.6x its annualised one and must not be published as it`);
    const dates = [...new Set(present.map((k) => f[`${k}AsOf`]).filter(isDate))];
    if (dates.length > 1) warns.push(`${key}: trailing returns carry ${dates.length} different as-of dates (${dates.join(", ")}) — a curve drawn across them is not one quote`);
    if (f.inception && isDate(f.inception)) {
      for (const k of present) {
        const yrs = +k.slice(1, -1);
        const age = (Date.parse(f[`${k}AsOf`] || today) - Date.parse(f.inception)) / 31557600000;
        if (age + 0.1 < yrs) bad(`${k} is longer than the fund's life (inception ${f.inception}, ${age.toFixed(1)} years to ${k}AsOf)`);
      }
    }
  }
  return { ytd, trailing };
}

for (const [ticker, f] of Object.entries(funds)) {
  n++;
  const bad = (m) => fails.push(`${ticker}: ${m}`);
  if (!/^[A-Z0-9.]{1,10}$/.test(ticker)) bad("key is not a ticker (upper-case letters/digits)");
  if (!f || typeof f !== "object") { bad("entry is not an object"); continue; }
  if (typeof f.name !== "string" || f.name.trim().length < 3) bad("name missing");
  if (!isDate(f.updated)) bad("updated (YYYY-MM-DD) missing");
  else if (f.updated > today) bad(`updated ${f.updated} is in the future`);

  if (f.er !== undefined) {
    withEr++;
    if (typeof f.er !== "number" || !(f.er >= 0 && f.er <= 3)) bad(`er ${f.er} is not a number in 0..3 (percent)`);
    if (!isDate(f.erAsOf)) bad("er has no erAsOf date");
    else if (f.erAsOf > today) bad(`erAsOf ${f.erAsOf} is in the future`);
    if (!isUrl(f.erSource || f.source)) bad("er has no source URL (erSource or source)");
  }
  /* the ytd + trailing rules now live in checkReturns above, shared with
   * `vehicles` so a trust's return is held to the same standard. */
  { const c = checkReturns(ticker, f, bad); withYtd += c.ytd; withTrailing += c.trailing; }
  if (f.er === undefined && f.ytd === undefined && !f.status) bad("entry carries neither er nor ytd nor a status");
  if (f.status !== undefined) {
    if (!["merged", "closed", "renamed"].includes(f.status)) bad(`status ${f.status} is not merged/closed/renamed`);
    if (!isUrl(f.statusSource)) bad("status has no statusSource URL");
  }
  /* `matchGrade` / `matchWhy` record HOW the filed fund name was tied to this
   * ticker, added 2026-11-04 when `fund-facts-issuer.mjs` began resolving names
   * through `sec-funds.json`. They are provenance about OUR inference, not a
   * figure, and they matter because the grades are not equally strong: "exact"
   * means the filed name IS the registered series name, while "nearest" means
   * several series contained the filed tokens and one had fewest unexplained
   * extras. A reader auditing a fee is entitled to know which. The allowlist
   * is kept CLOSED rather than widened to anything -- it is what caught these
   * two on their first run, which is the behaviour to preserve. */
  if (f.matchGrade !== undefined && !["exact", "subset", "nearest"].includes(f.matchGrade)) {
    bad(`matchGrade ${f.matchGrade} is not exact/subset/nearest — "ambiguous" and a non-match must never reach a written entry`);
  }
  if (f.matchGrade !== undefined && typeof f.matchWhy !== "string") bad("matchGrade has no matchWhy explaining which class was taken and why");
  /* `filedNames` counts how many distinct filed spellings resolved to this one
   * ticker -- about 2.3 on the first real run. It is a fact about the filings,
   * and it is also the reason `name` and `matchGrade` must record the STRONGEST
   * match rather than the last one written. */
  if (f.filedNames !== undefined && !(Number.isInteger(f.filedNames) && f.filedNames >= 1)) bad(`filedNames ${f.filedNames} is not a positive integer`);
  for (const k of Object.keys(f)) if (!["name", "er", "erAsOf", "erSource", "ytd", "ytdAsOf", "ytdSource", "source", "updated",
    "status", "statusSource", "note", "matchGrade", "matchWhy", "filedNames",
    /* trailing returns, 2026-11-06 — annualised, each dated and sourced */
    "returnBasis", "inception",
    "r1y", "r1yAsOf", "r1ySource", "r3y", "r3yAsOf", "r3ySource",
    "r5y", "r5yAsOf", "r5ySource", "r10y", "r10yAsOf", "r10ySource"].includes(k)) bad(`unknown field ${k}`);
}

/* VEHICLES: the same receipts, for something that has no ticker to be keyed by.
 *
 * A collective investment trust, a separate account and an insurer's guaranteed
 * option are the bulk of what this site cannot price — 54,013 published rows of
 * one provider alone, $111.9B, carrying neither a symbol nor a fee — and NONE of
 * them can live in `funds`, whose key is a ticker by assertion above. So they go
 * in their own section, keyed `provider::fund`, and every receipt rule is
 * repeated rather than relaxed: a figure without a source URL and an as-of date
 * is refused here exactly as it is there.
 *
 * `er` on a vehicle is the VEHICLE'S OWN stated total annual operating expense,
 * which for a CIT is commonly not what a given plan pays — a plan's share class
 * is negotiated. `erBasis` carries that distinction so a page can never print a
 * provider's figure as the plan's price; it is REQUIRED, because the whole
 * reason these rows are blank today is that we refuse to imply a number we do
 * not have. */
const vehicles = (doc && doc.vehicles) || {};
if (typeof vehicles !== "object" || Array.isArray(vehicles)) { console.log("FAIL \"vehicles\" is not an object"); process.exit(1); }
const VEHICLE_KINDS = ["collective-trust", "separate-account", "guaranteed-option", "stable-value", "other"];
/* `class-published` ADDED 2026-11-13, and it is a narrower claim than either of
 * the other two rather than a loosening of them.
 *
 * `vehicle-stated` exists because a CIT's price is usually negotiated per plan,
 * so the provider's headline figure is not the plan's and must never be printed
 * as it. That reasoning holds for a trust with ONE price and many plans. It does
 * NOT hold where the provider publishes a fee PER UNIT CLASS and the filing
 * NAMES the class: Vanguard publishes Target Retirement 2020 Trust I at 0.065%
 * under its own CUSIP (92202V591), and a filing reading "... 2020 Fund TR I"
 * has told us which class it holds. There the published figure IS that plan's
 * price, and blanking it is not caution, it is withholding a sourced fact.
 *
 * So the value asserts BOTH halves: the provider published a per-class figure,
 * AND the filed name states that class. An entry may only carry it when the
 * class in `shareClass` is the one the source document prices. Where the filing
 * states no class, the row does not reach a `class-published` entry at all and
 * nothing is published — which is the behaviour `vehicle-stated` was protecting
 * and still protects. */
const ER_BASIS = ["vehicle-stated", "plan-specific", "class-published"];
let nv = 0, vEr = 0, vYtd = 0, vTrailing = 0;
/* A vehicle fee older than this is a dormant record rather than a price.
 * Two years, because a provider restates a CIT's fee annually, so one
 * missed restatement is normal and two is a record nobody is maintaining. */
const VEHICLE_ER_STALE_YEARS = 2;

for (const [key, f] of Object.entries(vehicles)) {
  nv++;
  const bad = (m) => fails.push(`${key}: ${m}`);
  /* the key is `provider::fund`, both slugs, so it is stable, greppable and
   * cannot collide with a ticker */
  if (!/^[a-z0-9][a-z0-9-]*::[a-z0-9][a-z0-9-]*$/.test(key)) bad("key is not provider::fund in lower-case slugs");
  if (!f || typeof f !== "object") { bad("entry is not an object"); continue; }
  if (typeof f.name !== "string" || f.name.trim().length < 3) bad("name missing");
  if (typeof f.provider !== "string" || f.provider.trim().length < 2) bad("provider missing");
  if (!VEHICLE_KINDS.includes(f.kind)) bad(`kind ${JSON.stringify(f.kind)} is not one of ${VEHICLE_KINDS.join("/")}`);
  if (!isDate(f.updated)) bad("updated (YYYY-MM-DD) missing");
  else if (f.updated > today) bad(`updated ${f.updated} is in the future`);

  if (f.er !== undefined) {
    vEr++;
    if (typeof f.er !== "number" || !(f.er >= 0 && f.er <= 3)) bad(`er ${f.er} is not a number in 0..3 (percent)`);
    if (!isDate(f.erAsOf)) bad("er has no erAsOf date");
    else if (f.erAsOf > today) bad(`erAsOf ${f.erAsOf} is in the future`);
    if (!isUrl(f.erSource || f.source)) bad("er has no source URL (erSource or source)");
    /* the one field `funds` does not need: whose price this is */
    if (!ER_BASIS.includes(f.erBasis)) bad(`er has no erBasis (${ER_BASIS.join("/")}) — a vehicle's stated fee must never be printed as the plan's`);
  }
  /* the SAME return rules as a ticker entry, not a weaker set — see
   * checkReturns. A trust's YTD is dated, sourced and band-checked exactly as a
   * fund's, and a trailing figure still has to declare itself annualised. */
  /* COUNTED SEPARATELY FROM THE TICKER TOTALS. Sharing the counters made the
   * summary line read "503 ticker entries (503 with an expense ratio, 546 with
   * a YTD return)" the first time vehicles carried returns — more YTDs than
   * entries, which is impossible, and it was MY refactor that did it. A gate's
   * own summary is a published claim about the data; a number in it that
   * cannot be true is a defect even though no reader sees it. */
  { const c = checkReturns(key, f, bad); vYtd += c.ytd; vTrailing += c.trailing; }
  /* A FEE IS A CURRENT PRICE, AND A TWELVE-YEAR-OLD ONE IS NOT ONE.
   *
   * Vanguard's API serves its dormant trust classes with an orphaned figure:
   * every Target Retirement Trust III vintage returns er 0.4000 as of
   * 2014-03-31 — six times the 0.045–0.13 band its live classes sit in, the
   * same round number across all twelve — and a YTD block containing NO VALUE.
   * Recording that is correct, because it is what the source says. PUBLISHING
   * it as the plan's price would be badly wrong.
   *
   * The two witnesses partition the set EXACTLY and that is measured, not
   * assumed: of 67 Vanguard vehicles, all 44 whose erAsOf is current carry a
   * YTD and all 23 whose erAsOf is stale carry none. 44/44 and 23/23.
   *
   * A WARNING, NOT A FAILURE, and the distinction is the point: the entry is
   * honestly sourced and belongs in the file. What must not happen is the
   * figure reaching a page. Any renderer that publishes a vehicle fee is
   * required to gate on this same freshness — a warning here makes the
   * population visible and countable; it cannot stop a publish by itself. */
  if (isDate(f.erAsOf)) {
    const yrs = (Date.parse(today) - Date.parse(f.erAsOf)) / 31557600000;
    if (yrs > VEHICLE_ER_STALE_YEARS)
      warns.push(`${key}: er as of ${f.erAsOf} is ${yrs.toFixed(1)} years old — a dormant record, not a current price; it must not be published as the plan's fee`);
  }
  /* A CUSIP IS THE ONLY STABLE IDENTIFIER THESE VEHICLES HAVE. `funds` is keyed
   * by ticker and needs none; a trust has no ticker, so without this the entry
   * records a name and a price with nothing a reader could look the thing up
   * by. Checked for shape, which is all we can check: 9 characters, the last a
   * check digit, alphanumeric. */
  if (f.cusip !== undefined && !/^[A-Z0-9]{9}$/.test(f.cusip)) bad(`cusip ${JSON.stringify(f.cusip)} is not 9 alphanumeric characters`);
  if (f.erBasis === "class-published" && (typeof f.shareClass !== "string" || !f.shareClass.trim()))
    bad("erBasis \"class-published\" asserts the SOURCE prices a named unit class, so shareClass is required — without it nothing records which class the figure belongs to");
  if (f.er === undefined && f.ytd === undefined && !f.status) bad("entry carries neither er nor ytd nor a status");
  if (f.status !== undefined) {
    if (!["merged", "closed", "renamed"].includes(f.status)) bad(`status ${f.status} is not merged/closed/renamed`);
    if (!isUrl(f.statusSource)) bad("status has no statusSource URL");
  }
  for (const k of Object.keys(f)) if (!["name", "provider", "kind", "er", "erAsOf", "erSource", "erBasis",
    "source", "updated", "status", "statusSource", "shareClass", "note",
    /* the identifier a tickerless vehicle is looked up by */
    "cusip",
    /* returns, opened for vehicles 2026-11-13 — same rules as a ticker
     * entry, enforced by the shared checkReturns, not by a copy */
    "ytd", "ytdAsOf", "ytdSource", "returnBasis", "inception",
    "r1y", "r1yAsOf", "r1ySource", "r3y", "r3yAsOf", "r3ySource",
    "r5y", "r5yAsOf", "r5ySource", "r10y", "r10yAsOf", "r10ySource"].includes(k)) bad(`unknown field ${k}`);
}

for (const w of warns) console.log(`WARN ${w}`);
for (const f of fails) console.log(`FAIL ${f}`);
console.log(`fund-facts: ${n} ticker entries (${withEr} with an expense ratio, ${withYtd} with a YTD return, ${withTrailing} trailing figures), ${nv} vehicle entries (${vEr} with an expense ratio, ${vYtd} with a YTD return, ${vTrailing} trailing figures), ${fails.length} failures, ${warns.length} warnings`);
process.exit(fails.length ? 1 : 0);
