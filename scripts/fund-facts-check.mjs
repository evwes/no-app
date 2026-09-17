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
let n = 0, withEr = 0, withYtd = 0;

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
  if (f.ytd !== undefined) {
    withYtd++;
    if (typeof f.ytd !== "number" || !(f.ytd >= -100 && f.ytd <= 500)) bad(`ytd ${f.ytd} is not a number in -100..500 (percent)`);
    if (!isDate(f.ytdAsOf)) bad("ytd has no ytdAsOf date");
    else {
      if (f.ytdAsOf > today) bad(`ytdAsOf ${f.ytdAsOf} is in the future`);
      const age = (Date.parse(today) - Date.parse(f.ytdAsOf)) / 86400000;
      if (age > STALE_DAYS) warns.push(`${ticker}: ytd as of ${f.ytdAsOf} is ${Math.round(age)} days old (stale for display)`);
      if (!f.ytdAsOf.startsWith(today.slice(0, 4))) warns.push(`${ticker}: ytdAsOf ${f.ytdAsOf} is not this calendar year — a YTD figure from a past year is not "year to date"`);
    }
    if (!isUrl(f.ytdSource || f.source)) bad("ytd has no source URL (ytdSource or source)");
  }
  if (f.er === undefined && f.ytd === undefined && !f.status) bad("entry carries neither er nor ytd nor a status");
  if (f.status !== undefined) {
    if (!["merged", "closed", "renamed"].includes(f.status)) bad(`status ${f.status} is not merged/closed/renamed`);
    if (!isUrl(f.statusSource)) bad("status has no statusSource URL");
  }
  for (const k of Object.keys(f)) if (!["name", "er", "erAsOf", "erSource", "ytd", "ytdAsOf", "ytdSource", "source", "updated", "status", "statusSource", "note"].includes(k)) bad(`unknown field ${k}`);
}

for (const w of warns) console.log(`WARN ${w}`);
for (const f of fails) console.log(`FAIL ${f}`);
console.log(`fund-facts: ${n} entries, ${withEr} with an expense ratio, ${withYtd} with a YTD return, ${fails.length} failures, ${warns.length} warnings`);
process.exit(fails.length ? 1 : 0);
