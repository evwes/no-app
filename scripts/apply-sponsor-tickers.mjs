#!/usr/bin/env node
/* wampo — fill the tk column of the PUBLISHED plans-list.json from the SEC
 * registrant match, without waiting for a pipeline run.
 *
 * build-data.mjs now applies scripts/match-sponsors.mjs on every prep, so this
 * is not a permanent second source of truth: it applies the SAME function to
 * the data already published, so the site gains searchable tickers today and
 * the next prep reproduces exactly these values. It only ever FILLS an empty
 * tk — a ticker already in the file (curated, or set by a previous prep) is
 * never overwritten, so this cannot undo a hand-confirmed attribution.
 *
 *   node scripts/apply-sponsor-tickers.mjs [--dry]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { matchSponsor } from "./match-sponsors.mjs";
import { matchCurated, norm } from "./match-curated.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DRY = process.argv.includes("--dry");
const LIST = path.join(root, "plans-list.json");

const j = JSON.parse(fs.readFileSync(LIST, "utf8"));
const c = j.cols;
const n = c.name.length;

let filled = 0, curated = 0, already = 0, review = 0;
const seen = new Map();
for (let i = 0; i < n; i++) {
  if (c.tk[i]) { already++; continue; }
  const nm = c.name[i] || "";
  // curated first, exactly as the pipeline does it — this is how a match a
  // human confirmed into companies.json reaches the published file
  const cur = matchCurated(norm(nm));
  const r = cur ? { ticker: cur.ticker } : matchSponsor(nm);
  if (!r) continue;
  if (r.review) { review++; continue; }   // refused by the guards: needs a human
  if (!DRY) c.tk[i] = r.ticker;
  filled++;
  if (cur) curated++;
  seen.set(r.ticker, (seen.get(r.ticker) || 0) + 1);
}

console.log(`plans          : ${n.toLocaleString()}`);
console.log(`  had a ticker : ${already.toLocaleString()}`);
console.log(`  FILLED       : ${filled.toLocaleString()} plans across ${seen.size.toLocaleString()} tickers  (${curated.toLocaleString()} from the curated list)`);
console.log(`  review queue : ${review.toLocaleString()} plans (refused by the guards, left empty)`);

if (DRY) { console.log("\n--dry: nothing written"); process.exit(0); }
fs.writeFileSync(LIST, JSON.stringify(j));
console.log(`\nwrote ${path.relative(root, LIST)}`);
