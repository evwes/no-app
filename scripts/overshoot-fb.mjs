#!/usr/bin/env node
/* wampo — IS THE OVERSHOOT ENRICHED IN PRIOR-YEAR FALLBACKS, AND DID THE
 * PLAN'S OWN ASSETS FALL UNDER THE MENU?
 *
 * The attribution found that 379 of the 395 single-row-explained overshoots
 * have a largest row that NAMES A REAL FUND. So these are not phantom caption
 * rows: real rows sum to more than the plan. The recorded mechanism that
 * produces exactly that, with no parser defect anywhere, is `fb`:
 *
 *   "when the newest filing has no readable schedule, fetch-4i tries the same
 *    plan's next-newest full-form filing; RATIO IS JUDGED AGAINST CURRENT-YEAR
 *    ASSETS"
 *
 * A menu that was honest against last year's assets overshoots this year's by
 * exactly the amount the plan shrank. That is OUR labelling choice, not a
 * misread filing, and it is testable two ways that do not depend on each other:
 *
 *   (1) ENRICHMENT. If `fb` is the mechanism, its share of the overshoot set
 *       must be far above its share of all confident menus. A rate equal to the
 *       base rate REFUTES it -- which is the point of computing the base rate
 *       rather than quoting the overshoot share alone. 188 of 513 "looks high"
 *       and means nothing until the denominator is known.
 *
 *   (2) DIRECTION. For a fallback menu, the ratio should track how the plan's
 *       assets moved between the fallback year and the filed year. Markets rose
 *       over the period, so a fallback would normally UNDERSHOOT -- if these
 *       overshoot, the plans must have SHRUNK, and the filing says so on its own
 *       Schedule H. assetsBOY/assetsEOY on the newest filing is a free witness
 *       that needs no second store.
 *
 * Run: node scripts/overshoot-fb.mjs
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadPlans } from "./lib-schema.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const d = loadPlans();
const g = d.get;

/* FIELD CONTROL: name every field before the walk, so a guessed one throws here
 * rather than returning a plausible number 60,000 rows later. */
for (const k of ["ack", "assetsEOY", "assetsBOY", "partEOY", "sponsorName", "planYear"]) {
  if (d.fields.indexOf(k) < 0) throw new Error(`plans-all has no field ${k} — fields: ${d.fields.join(",")}`);
}
const byAck = new Map();
for (const r of d.rows) { const a = g(r, "ack"); if (a) byAck.set(a, r); }

let allConf = 0, allFb = 0;
const over = [];
for (let s = 0; s < 64; s++) {
  const nn = String(s).padStart(2, "0");
  let obj;
  try { obj = JSON.parse(readFileSync(path.join(ROOT, "data", "lineups", `${nn}.json`), "utf8")); } catch { continue; }
  for (const [ack, e] of Object.entries(obj)) {
    if (!e || !e.confident || !Array.isArray(e.funds) || !e.funds.length) continue;
    const row = byAck.get(ack);
    if (!row) continue;
    const fb = e.fb || (e.meta && e.meta.fb) || null;
    allConf++; if (fb) allFb++;
    const schH = g(row, "assetsEOY") || 0;
    if (schH < 1e6) continue;
    const sum = e.funds.reduce((a, x) => a + (+x.value || 0), 0);
    if (sum < schH * 1.15) continue;
    over.push({
      ack, fb, ratio: sum / schH, rows: e.funds.length,
      eoy: schH, boy: +g(row, "assetsBOY") || 0, py: g(row, "planYear"),
      ppl: g(row, "partEOY") || g(row, "participants") || 0,
      name: g(row, "sponsorName") || "",
    });
  }
}

const oFb = over.filter((x) => x.fb);
const baseRate = allFb / allConf, overRate = oFb.length / over.length;
console.log(`all confident menus with a plan row : ${allConf}, of which fb ${allFb}  (${(100 * baseRate).toFixed(2)}%)`);
console.log(`overshoot >=1.15x                   : ${over.length}, of which fb ${oFb.length}  (${(100 * overRate).toFixed(2)}%)`);
console.log(`ENRICHMENT                          : ${(overRate / baseRate).toFixed(1)}x\n`);

/* (2) DIRECTION, on the plans the mechanism is supposed to explain. The plan's
 * own BOY->EOY move is the free witness; a fallback menu priced a year earlier
 * should sit near the ratio the shrinkage predicts. */
const withBoy = oFb.filter((x) => x.boy > 1e6);
let grew = 0, shrank = 0, explained = 0;
for (const x of withBoy) {
  if (x.eoy > x.boy) grew++; else shrank++;
  /* if the fallback menu were priced at BOY, the honest ratio is sum/boy; so
   * sum/eoy ~= boy/eoy * (sum/boy). The menu is "explained by shrinkage" when
   * dividing by BOY instead of EOY brings it into band. */
  const asBoy = (x.ratio * x.eoy) / x.boy;
  if (Math.abs(asBoy - 1) < Math.abs(x.ratio - 1) && asBoy < 1.15) explained++;
}
console.log(`fb overshoots with a usable BOY: ${withBoy.length}   assets grew ${grew} / shrank ${shrank}`);
console.log(`  of those, judging the menu against BOY instead of EOY brings it into band: ${explained}  (${withBoy.length ? (100 * explained / withBoy.length).toFixed(0) : "-"}%)\n`);

/* and the same question for the NON-fb overshoots, as the control: if BOY
 * explains them just as often, BOY is not telling us about the fallback -- it is
 * telling us plan assets are volatile and the test is worthless. */
const oNo = over.filter((x) => !x.fb && x.boy > 1e6);
let expNo = 0;
for (const x of oNo) {
  const asBoy = (x.ratio * x.eoy) / x.boy;
  if (Math.abs(asBoy - 1) < Math.abs(x.ratio - 1) && asBoy < 1.15) expNo++;
}
console.log(`CONTROL  non-fb overshoots with a usable BOY: ${oNo.length}, BOY brings into band ${expNo}  (${oNo.length ? (100 * expNo / oNo.length).toFixed(0) : "-"}%)`);
console.log(`         if these two percentages are close, BOY is measuring asset volatility and NOT the fallback.\n`);

console.log("--- fb overshoots, largest by readers ---");
for (const x of oFb.sort((a, b) => b.ppl - a.ppl).slice(0, 10)) {
  const asBoy = x.boy > 1e6 ? ((x.ratio * x.eoy) / x.boy).toFixed(2) : "-";
  console.log(`  ${String(x.ppl).padStart(7)}p  py=${x.py} fb=${x.fb}  ${x.ratio.toFixed(2)}x vs EOY  ${asBoy}x vs BOY  ${x.rows} rows  ${x.name.slice(0, 34)}`);
}
