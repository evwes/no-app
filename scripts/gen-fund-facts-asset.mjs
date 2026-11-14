#!/usr/bin/env node
/* wampo — GENERATE `fund-facts.js` FROM `data/fund-facts.json`.
 *
 * WHY AN ASSET AND NOT A FETCH. `data/fund-facts.json` is the source of truth:
 * agent-written, hand-editable, and policed by `fund-facts-check.mjs`, which
 * refuses anything undated, unsourced, future-dated or implausible. The browser
 * needs a fraction of it -- ticker to figures -- and the project's precedent for
 * exactly this is `sec-tickers.js`: a generated global, loaded as a stamped
 * script, read behind a `typeof` guard. Mirroring that means the cache-buster
 * and `stamp-assets.mjs` cover it for free, where a `fetch` of the JSON would be
 * deliberately unstamped like the data files and could serve a reader a stale
 * fee from cache.
 *
 * IT SHIPS ONLY WHAT THE PAGE PRINTS: the expense ratio, its as-of date, and
 * the YTD return with its own. NOT the source URL -- that is 92 long strings
 * every visitor would download to render nothing, and the receipts stay in the
 * JSON where the checker reads them and where anyone auditing a figure can find
 * it by ticker.
 *
 * NOTHING IS INVENTED HERE. A fund with no `er` is skipped rather than written
 * with a blank, and the generator refuses to emit a figure whose date the
 * checker would reject -- so the asset cannot carry a claim the JSON does not.
 *
 * Run: node scripts/gen-fund-facts-asset.mjs [--check]
 *   --check exits 1 if the committed asset does not match what this would write,
 *   which is what lets `site-test` catch a hand-edited or stale asset.
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CHECK = process.argv.includes("--check");
const OUT = path.join(ROOT, "fund-facts.js");

const raw = JSON.parse(readFileSync(path.join(ROOT, "data", "fund-facts.json"), "utf8"));
const funds = raw.funds || {};
const isDate = (s) => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);
const today = new Date().toISOString().slice(0, 10);

const out = {};
const skipped = [];
for (const [tk, f] of Object.entries(funds)) {
  const e = {};
  /* The same refusals the checker applies, repeated HERE rather than trusted,
   * because this file is what a reader sees and the JSON is edited by hand and
   * by an agent. A generator that trusts its input publishes its input's
   * mistakes. */
  if (f.er != null && typeof f.er === "number" && f.er >= 0 && f.er <= 5 && isDate(f.erAsOf) && f.erAsOf <= today) {
    e.er = f.er; e.erAsOf = f.erAsOf;
  }
  if (f.ytd != null && typeof f.ytd === "number" && isDate(f.ytdAsOf) && f.ytdAsOf <= today) {
    e.ytd = f.ytd; e.ytdAsOf = f.ytdAsOf;
  }
  if (e.er == null && e.ytd == null) { skipped.push(tk); continue; }
  out[String(tk).toUpperCase()] = e;
}

/* ---- VEHICLES: a collective trust that DOES have a published price -------
 *
 * `funds` is keyed by ticker and a trust has none, so these live in their own
 * section and ship as their own table. The page resolves a filed holding name
 * to one of these keys with fund-er.js's vehicleKeyFor.
 *
 * THE PUBLISH GATE IS HERE, NOT IN THE RENDERER, and deliberately. This file
 * already re-applies the checker's refusals rather than trusting its input,
 * because it is what a reader sees; a figure refused here cannot reach a page
 * by any route, whereas a render-time check can be bypassed by the next call
 * site somebody adds. Two conditions beyond the ordinary receipts:
 *
 *  - `erBasis` MUST be "class-published". The other two bases mean the figure
 *    is the provider's own and NOT the plan's negotiated price; printing one
 *    as a plan's fee is the exact error the basis field exists to prevent.
 *  - `erAsOf` must be within STALE_YEARS. Vanguard serves dormant classes with
 *    an orphaned fee — every Target Retirement Trust III vintage reads 0.4000
 *    as of 2014-03-31, six times the live band, with no current return at all.
 *    Those entries belong in the JSON (they are what the source says) and must
 *    never reach a reader.
 */
const STALE_YEARS = 2;
const vehicles = raw.vehicles || {};
const vout = {};
const vskipped = [];
for (const [key, f] of Object.entries(vehicles)) {
  if (f.erBasis !== "class-published") { vskipped.push(`${key}(basis)`); continue; }
  const e = {};
  if (f.er != null && typeof f.er === "number" && f.er >= 0 && f.er <= 5 && isDate(f.erAsOf) && f.erAsOf <= today
      && (Date.parse(today) - Date.parse(f.erAsOf)) / 31557600000 <= STALE_YEARS) {
    e.er = f.er; e.erAsOf = f.erAsOf;
  }
  if (f.ytd != null && typeof f.ytd === "number" && isDate(f.ytdAsOf) && f.ytdAsOf <= today) {
    e.ytd = f.ytd; e.ytdAsOf = f.ytdAsOf;
  }
  if (e.er == null && e.ytd == null) { vskipped.push(`${key}(stale)`); continue; }
  /* the class the figure belongs to, so the page can SAY which unit class it
   * is quoting rather than leaving the reader to infer it from the filed name */
  if (typeof f.shareClass === "string" && f.shareClass.trim()) e.cls = f.shareClass.trim();
  vout[key] = e;
}
const vkeys = Object.keys(vout).sort();
const vbody = vkeys.map((k) => ` ${JSON.stringify(k)}:${JSON.stringify(vout[k])}`).join(",\n");

const keys = Object.keys(out).sort();
const body = keys.map((k) => ` ${JSON.stringify(k)}:${JSON.stringify(out[k])}`).join(",\n");
const text = `/* GENERATED by scripts/gen-fund-facts-asset.mjs — DO NOT EDIT.
 *
 * Source of truth: data/fund-facts.json, policed by scripts/fund-facts-check.mjs.
 * Every figure below was READ from a named page on a stated date; the source URL
 * for each lives in that JSON, by ticker. A figure here is SOURCED, not
 * estimated, which is the whole reason the page may print it without "est.".
 *
 * ${keys.length} funds · ${keys.filter((k) => out[k].er != null).length} with an expense ratio · ${keys.filter((k) => out[k].ytd != null).length} with a YTD return
 */
const FUND_FACTS = {
${body}
};
/* The same receipts, for vehicles that have no ticker to be keyed by. Resolved
 * from a filed holding name by fund-er.js's vehicleKeyFor. The cls field is
 * the unit class the figure is quoted for -- the page prints it, because "0.055%" means
 * nothing without saying which class of the trust it prices.
 *
 * ${vkeys.length} vehicles \u00b7 ${vkeys.filter((k) => vout[k].er != null).length} with an expense ratio \u00b7 ${vkeys.filter((k) => vout[k].ytd != null).length} with a YTD return
 */
const FUND_VEHICLES = {
${vbody}
};
`;

if (CHECK) {
  if (!existsSync(OUT)) { console.error("fund-facts.js is MISSING — run the generator"); process.exit(1); }
  const have = readFileSync(OUT, "utf8");
  if (have !== text) {
    console.error("fund-facts.js is STALE or hand-edited — it does not match data/fund-facts.json.");
    console.error("Run: node scripts/gen-fund-facts-asset.mjs && node scripts/stamp-assets.mjs");
    process.exit(1);
  }
  console.log(`fund-facts.js matches data/fund-facts.json (${keys.length} funds, ${vkeys.length} vehicles)`);
  process.exit(0);
}

writeFileSync(OUT, text);
console.log(`wrote fund-facts.js: ${keys.length} funds, ${vkeys.length} vehicles, ${text.length} bytes`);
if (vskipped.length) console.log(`vehicles withheld (not class-published, or a fee older than ${STALE_YEARS}y): ${vskipped.length} — ${vskipped.slice(0, 6).join(" ")}`);
if (skipped.length) console.log(`skipped ${skipped.length} with no usable dated figure: ${skipped.slice(0, 8).join(" ")}`);
