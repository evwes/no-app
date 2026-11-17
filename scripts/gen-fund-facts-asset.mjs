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
 * AND, SINCE 2026-11-17, THE TRAILING CURVE: r1y / r3y / r5y / r10y. See
 * `trailingOut` below for every refusal it re-applies and for why the as-of
 * date is written ONCE per entry when the horizons agree and PER HORIZON when
 * they do not -- there is no shape in which a figure reaches the page undated.
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
import vm from "node:vm";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { shareClassToken } from "./lib-disclose.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CHECK = process.argv.includes("--check");
/* `--out <path>` writes somewhere OTHER than the committed asset. It exists for
 * one caller: a differential that needs an asset built from a candidate
 * generator without writing the file another agent may be regenerating in the
 * same tree. The default is unchanged, so `--check` still compares the real
 * one, and a caller that passes `--out` is measuring, never shipping. */
const OUT = (() => {
  const i = process.argv.indexOf("--out");
  return i > 0 && process.argv[i + 1] ? path.resolve(process.argv[i + 1]) : path.join(ROOT, "fund-facts.js");
})();
/* `--in <path>` reads a DIFFERENT source of truth, and it exists so this file's
 * refusals can be TESTED. Every refusal below has a population of zero on the
 * committed store — which is the good case and also means an inert arm and a
 * broken arm read the same zero. `trailing-render-test.mjs` feeds crafted
 * entries through this flag and requires each refusal to fire by name. */
const SRC = (() => {
  const i = process.argv.indexOf("--in");
  return i > 0 && process.argv[i + 1] ? path.resolve(process.argv[i + 1]) : path.join(ROOT, "data", "fund-facts.json");
})();

/* THE FAMILY RELATION IS CALLED, NOT REIMPLEMENTED. Grouping published class
 * keys into families is the same relation `vehicleFamilyKeyFor` uses to turn a
 * filed name into a family, and this project has already paid twice for
 * implementing one relation in two places — `tkExact`/`tkComparable` re-derive
 * `lookupTicker` instead of calling it and went blind whenever an arm moved,
 * because nothing executes a comment asserting equivalence. So fund-er.js is
 * loaded and asked. */
const vehicleFamilyOfKey = (() => {
  const ctx = vm.createContext({ window: {}, console });
  vm.runInContext(readFileSync(path.join(ROOT, "fund-er.js"), "utf8") +
    "\nglobalThis.__famOf = vehicleFamilyOfKey;", ctx);
  if (typeof ctx.__famOf !== "function") {
    console.log("fund-er.js does not export vehicleFamilyOfKey — refusing to guess the family relation");
    process.exit(2);
  }
  return ctx.__famOf;
})();

const raw = JSON.parse(readFileSync(SRC, "utf8"));
const funds = raw.funds || {};
const isDate = (s) => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);
const today = new Date().toISOString().slice(0, 10);

/* ---- THE TRAILING CURVE, AND EVERY REFUSAL IT RE-APPLIES ------------------
 *
 * `data/fund-facts.json` carries r1y / r3y / r5y / r10y for 13,302 tickers and
 * 350-odd vehicles, every figure dated and sourced, and until today NOTHING
 * READ THEM: this generator took `er` and `ytd` and dropped the curve on the
 * floor, so the whole asset was shipped to every visitor without it. Same
 * shape as the YTD defect of 2026-11-06, one layer earlier.
 *
 * THE REFUSALS ARE REPEATED HERE RATHER THAN TRUSTED, like `er` and `ytd`
 * above, because this file is the publish gate: a figure refused here cannot
 * reach a page by any route somebody adds later. Five of them, and each one is
 * a claim the page would otherwise make:
 *
 *  - `returnBasis` MUST be "annualised", and the WHOLE curve is dropped when it
 *    is not. A 10-year CUMULATIVE return is about 2.6x its annualised one
 *    (10%/yr is +159% over a decade); the column is headed as an annual rate,
 *    so a cumulative figure in it is not an imprecise number, it is a
 *    different quantity wearing this one's name.
 *  - the per-horizon PLAUSIBILITY BAND, copied from `fund-facts-check.mjs`'s
 *    `HORIZON` — the band that exists to catch exactly that paste.
 *  - a DATE, not in the future. A return with no visible date is not
 *    publishable here, so an undated horizon is dropped rather than shipped
 *    bare and left to the renderer's discretion.
 *  - STALENESS, and this is the one the YTD path does NOT have. Vanguard serves
 *    DORMANT unit classes with an orphaned fee — every Target Retirement Trust
 *    III vintage reads 0.4000 as of 2014-03-31 — and the same hazard is worse
 *    for a return, because a horizon is anchored at its as-of date: "10Y" dated
 *    2014 describes 2004-2014 and is a true sentence about a decade no reader
 *    is asking about. Two years, the same window the vehicle fee uses, so there
 *    is one number here and not two. Nothing legitimate is near it: the oldest
 *    curve in the store today is 2026-05-31, and quarterly fact sheets (T. Rowe)
 *    land about four months back.
 *  - INCEPTION, the checker's own rule: a 10-year figure on a fund that has not
 *    lived ten years is refused, that horizon only.
 *
 * THE DATE IS WRITTEN ONCE WHEN THE HORIZONS AGREE AND PER HORIZON WHEN THEY DO
 * NOT. Providers quote every horizon at one month-end and 0 of 13,302 entries
 * disagree today, so a shared `rAsOf` saves roughly 330 KB of payload on a file
 * every visitor downloads. But the checker only WARNS on a disagreement, so the
 * shape must survive one: a horizon whose date differs carries its own
 * `<h>AsOf`, and the page reads `f[h + "AsOf"] || f.rAsOf`. Dropping the
 * mismatched entry instead would discard honest figures, and hoisting one date
 * for the whole FILE would be how a stale figure gets a fresh receipt — the
 * defect that once wrote 91 month-end returns wearing same-day dates.
 */
const HORIZON = { r1y: [-95, 200], r3y: [-70, 120], r5y: [-60, 100], r10y: [-50, 80] };
const STALE_RETURN_YEARS = 2;
const rRefused = [];
function trailingOut(key, f) {
  const present = Object.keys(HORIZON).filter((h) => f[h] != null);
  if (!present.length) return null;
  if (f.returnBasis !== "annualised") { rRefused.push(`${key}(basis:${f.returnBasis})`); return null; }
  const e = {};
  const dated = [];
  for (const h of present) {
    const v = f[h], d = f[`${h}AsOf`];
    const [lo, hi] = HORIZON[h];
    if (typeof v !== "number" || !(v >= lo && v <= hi)) { rRefused.push(`${key}.${h}(band:${v})`); continue; }
    if (!isDate(d) || d > today) { rRefused.push(`${key}.${h}(date:${d})`); continue; }
    if ((Date.parse(today) - Date.parse(d)) / 31557600000 > STALE_RETURN_YEARS) { rRefused.push(`${key}.${h}(stale:${d})`); continue; }
    if (isDate(f.inception)) {
      const age = (Date.parse(d) - Date.parse(f.inception)) / 31557600000;
      if (age + 0.1 < +h.slice(1, -1)) { rRefused.push(`${key}.${h}(inception:${f.inception})`); continue; }
    }
    e[h] = v; dated.push([h, d]);
  }
  if (!dated.length) return null;
  const uniq = [...new Set(dated.map(([, d]) => d))];
  if (uniq.length === 1) e.rAsOf = uniq[0];
  else for (const [h, d] of dated) e[`${h}AsOf`] = d;
  return e;
}

/* ---- THE SHARE-CLASS WITHHOLDING ----------------------------------------
 *
 * `data/fund-facts-withheld.json` lists tickers where the FILING states one
 * share class and the sourced fund's own name states another. Publishing a
 * sourced figure there would upgrade a wrong-class row from a hedged "est." to
 * a confident tick — the single thing sourcing makes WORSE rather than better,
 * and the owner's standing decision of 2026-11-05 is to correct the symbol and
 * withdraw the fee, not to price the wrong class. The correction lives in the
 * resolver and is not built yet, so until it is, these are withheld HERE,
 * because this file is the publish gate and a figure refused here cannot reach
 * a page by any route.
 *
 * A MISSING LIST IS A REFUSAL, NOT A PASS. "A gate the file it guards cannot
 * trigger is indistinguishable from no gate": if the list is absent the
 * generator stops rather than silently publishing everything. `--no-withhold`
 * is the explicit way to regenerate without it, and it says so in the output.
 */
/* SUPERSEDED BY THE PER-ROW GATE, AND THE REPLACEMENT IS WHY, NOT A RETREAT.
 *
 * The first version of this gate withheld whole TICKERS listed in
 * `data/fund-facts-withheld.json`. The screen that produced that list also
 * priced it, which is the only reason the mistake was visible: withholding at
 * ticker level cost **182,106 rows / 215,075,598 reader-slots** whose filed
 * name names the RIGHT class, to protect **6,190** rows that name a different
 * one. A gate with a 29:1 collateral ratio is the wrong instrument, and the
 * conflict was never a property of the ticker — it is a property of the ROW,
 * because the FILED NAME is what disagrees.
 *
 * So the asset now ships `cls`, the share class the sourced fund's own name
 * states, and `app.js` compares it against the filed name's class per row. A
 * figure is withheld exactly where the two disagree and published everywhere
 * else. `shareClassToken` is defined ONCE in `lib-disclose.mjs`, imported
 * here, imported by the screen, and sliced into app.js by
 * `gen-generic-twin.mjs`, so the three cannot drift apart.
 *
 * *A measurement built to keep a gate honest is allowed to veto the gate.*
 */
const out = {};
const skipped = [];
let withCls = 0;
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
  Object.assign(e, trailingOut(tk, f) || {});
  /* THE SKIP TEST ASKS WHETHER THE ENTRY CARRIES ANYTHING USABLE, not whether
   * it carries a fee or a YTD. It used to name those two, which would have
   * dropped an entry whose only publishable figure is the curve — and the
   * curve is the thing this version exists to ship. */
  if (e.er == null && e.ytd == null && e.r1y == null && e.r3y == null && e.r5y == null && e.r10y == null) { skipped.push(tk); continue; }
  /* the share class THIS SYMBOL is, so the page can refuse to price a row
   * whose filing names a different one. Absent where the fund's own name
   * states no class — which is not a conflict and must not be read as one. */
  const cls = shareClassToken(f.name);
  if (cls) { e.cls = cls; withCls++; }
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
  /* The trust's OWN curve, held to the same refusals as a ticker's — the
   * checker shares `checkReturns` between the two sections for exactly this
   * reason, so a trust's return cannot be published on a weaker standard than
   * a fund's. The entry has already passed the `class-published` basis test
   * above, so a figure reaching here is the price of the unit class the filing
   * names and not the provider's own house figure. */
  Object.assign(e, trailingOut(key, f) || {});
  if (e.er == null && e.ytd == null && e.r1y == null && e.r3y == null && e.r5y == null && e.r10y == null) { vskipped.push(`${key}(stale)`); continue; }
  /* the class the figure belongs to, so the page can SAY which unit class it
   * is quoting rather than leaving the reader to infer it from the filed name */
  if (typeof f.shareClass === "string" && f.shareClass.trim()) e.cls = f.shareClass.trim();
  vout[key] = e;
}
const vkeys = Object.keys(vout).sort();
const vbody = vkeys.map((k) => ` ${JSON.stringify(k)}:${JSON.stringify(vout[k])}`).join(",\n");

/* ---- FEE AND RETURN BANDS, for a trust row that states no unit class -------
 *
 * 3,777 published rows / 375 menus / 3,397,331 readers / $166.6B name a
 * collective trust and a vintage but no class: `T. Rowe Price Retirement 2050
 * Trust`, `Vanguard Target Retirement Income Trust`. The vehicle is settled
 * and the class is not, so no exact figure exists — but the classes we have
 * span a narrow, sourced range, and a range is worth more to a reader than the
 * blank these rows show today.
 *
 * BUILT FROM `vout`, WHICH IS THE PUBLISHED SET, NOT FROM `raw.vehicles`. A
 * band built upstream of the gate above puts Vanguard's dormant Trust III fee
 * — 0.4000 as of 2014-03-31, six times the live band — at the top of the
 * range. Measured: from the raw store the Vanguard 2020 band reads
 * 0.0375-0.4%; from `vout` it reads 0.0375-0.075%.
 *
 * `cls` IS EMITTED SO THE PAGE CAN NAME WHAT THE RANGE IS OVER. A band built
 * from a SUBSET of a family's classes does not bound the family — an
 * unsourced class could sit outside it — so the page may not claim "across the
 * trust's unit classes". It says "across these N", named. That is the
 * difference between a true statement and a plausible one.
 *
 * HYBRID IS EXCLUDED HERE AS WELL AS IN THE RESOLVER. `trowePriceVehicleParts`
 * refuses the Hybrid line before it builds a family, so no row can ask for a
 * Hybrid band today — but that makes the refusal accidental rather than
 * designed, and this file's own rule is that a figure refused here cannot
 * reach a reader by any route somebody adds later. The hold is real: T. Rowe
 * publishes no reachable Hybrid fact sheet, so the "trustee fee = expense
 * ratio" equivalence is carried over from a sibling product rather than stated
 * for Hybrid. */
const BAND_MIN_CLASSES = 2;
const famAgg = new Map();
for (const [k, e] of Object.entries(vout)) {
  const fam = vehicleFamilyOfKey(k);
  if (!fam) continue;                                   /* a classless vehicle */
  if (/retirement-hybrid-/.test(fam)) continue;          /* held, see above */
  let g = famAgg.get(fam);
  if (!g) famAgg.set(fam, g = { ers: [], erAsOf: [], ytds: [], ytdAsOf: [], cls: [], r: {} });
  if (e.er != null) { g.ers.push(e.er); g.erAsOf.push(e.erAsOf); g.cls.push(e.cls || "?"); }
  if (e.ytd != null) { g.ytds.push(e.ytd); g.ytdAsOf.push(e.ytdAsOf); }
  /* and the curve, per horizon rather than per entry: a family can publish a
   * 5-year figure for four classes and a 10-year figure for two, and a band
   * must say how many classes IT is a range over — `ytdN` exists for the same
   * reason. The date travels with the figure through `rAsOf` or the horizon's
   * own key, so a mixed-date entry cannot contribute an undated member. */
  for (const h of Object.keys(HORIZON)) {
    if (e[h] == null) continue;
    const d = e[`${h}AsOf`] || e.rAsOf;
    if (!isDate(d)) continue;
    const a = g.r[h] || (g.r[h] = { v: [], d: [] });
    a.v.push(e[h]); a.d.push(d);
  }
}
const fout = {};
for (const [fam, g] of famAgg) {
  if (g.ers.length < BAND_MIN_CLASSES) continue;
  const b = {
    erLo: Math.min(...g.ers), erHi: Math.max(...g.ers),
    /* THE OLDEST DATE, not the newest: the band is only as current as its
     * weakest figure, and quoting the newest would date a stale number with a
     * fresh receipt — the defect that once wrote 91 month-end returns wearing
     * same-day receipts. */
    erAsOf: g.erAsOf.slice().sort()[0],
    cls: g.cls.slice().sort(),
  };
  if (g.ytds.length >= BAND_MIN_CLASSES) {
    b.ytdLo = Math.min(...g.ytds); b.ytdHi = Math.max(...g.ytds);
    b.ytdAsOf = g.ytdAsOf.slice().sort()[0];
    b.ytdN = g.ytds.length;
  }
  for (const h of Object.keys(HORIZON)) {
    const a = g.r[h];
    if (!a || a.v.length < BAND_MIN_CLASSES) continue;
    b[`${h}Lo`] = Math.min(...a.v); b[`${h}Hi`] = Math.max(...a.v);
    b[`${h}AsOf`] = a.d.slice().sort()[0];   /* the OLDEST, as above */
    b[`${h}N`] = a.v.length;
  }
  fout[fam] = b;
}
const fkeys = Object.keys(fout).sort();
const fbody = fkeys.map((k) => ` ${JSON.stringify(k)}:${JSON.stringify(fout[k])}`).join(",\n");

const keys = Object.keys(out).sort();
const body = keys.map((k) => ` ${JSON.stringify(k)}:${JSON.stringify(out[k])}`).join(",\n");
const text = `/* GENERATED by scripts/gen-fund-facts-asset.mjs — DO NOT EDIT.
 *
 * Source of truth: data/fund-facts.json, policed by scripts/fund-facts-check.mjs.
 * Every figure below was READ from a named page on a stated date; the source URL
 * for each lives in that JSON, by ticker. A figure here is SOURCED, not
 * estimated, which is the whole reason the page may print it without "est.".
 *
 * ${keys.length} funds · ${keys.filter((k) => out[k].er != null).length} with an expense ratio · ${keys.filter((k) => out[k].ytd != null).length} with a YTD return · ${keys.filter((k) => out[k].r1y != null || out[k].r3y != null || out[k].r5y != null || out[k].r10y != null).length} with a trailing return (r1y/r3y/r5y/r10y, ANNUALISED, dated by rAsOf or by the horizon's own key)
 */
const FUND_FACTS = {
${body}
};
/* The same receipts, for vehicles that have no ticker to be keyed by. Resolved
 * from a filed holding name by fund-er.js's vehicleKeyFor. The cls field is
 * the unit class the figure is quoted for -- the page prints it, because "0.055%" means
 * nothing without saying which class of the trust it prices.
 *
 * ${vkeys.length} vehicles \u00b7 ${vkeys.filter((k) => vout[k].er != null).length} with an expense ratio \u00b7 ${vkeys.filter((k) => vout[k].ytd != null).length} with a YTD return \u00b7 ${vkeys.filter((k) => vout[k].r1y != null || vout[k].r3y != null || vout[k].r5y != null || vout[k].r10y != null).length} with a trailing return
 */
const FUND_VEHICLES = {
${vbody}
};
/* FEE AND RETURN BANDS for a trust row that names its vintage and NOT its unit
 * class. Keyed by family, built only from the classes above — so a band is a
 * range over NAMED, SOURCED classes and never over a class nobody priced.
 * The cls field lists them, because a range over a subset does not bound the
 * family and the page must say what it is quoting rather than imply more.
 *
 * ${fkeys.length} families · ${fkeys.filter((k) => fout[k].ytdLo != null).length} with a YTD band · ${fkeys.filter((k) => fout[k].r1yLo != null || fout[k].r3yLo != null || fout[k].r5yLo != null || fout[k].r10yLo != null).length} with a trailing-return band
 */
const FUND_VEHICLE_BANDS = {
${fbody}
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
console.log(`wrote ${path.relative(ROOT, OUT) || OUT}: ${keys.length} funds, ${vkeys.length} vehicles, ${text.length} bytes`);
{
  const nTrail = keys.filter((k) => out[k].r1y != null || out[k].r3y != null || out[k].r5y != null || out[k].r10y != null).length;
  const vTrail = vkeys.filter((k) => vout[k].r1y != null || vout[k].r3y != null || vout[k].r5y != null || vout[k].r10y != null).length;
  const fTrail = fkeys.filter((k) => fout[k].r1yLo != null || fout[k].r3yLo != null || fout[k].r5yLo != null || fout[k].r10yLo != null).length;
  console.log(`trailing returns: ${nTrail} tickers, ${vTrail} vehicles, ${fTrail} family bands`);
  /* A REFUSAL COUNT IS PART OF THE OUTPUT, not a silence. The dormant-class
   * hazard is exactly the kind that shows up as a number here before anybody
   * sees it on a page. */
  if (rRefused.length) console.log(`trailing figures REFUSED: ${rRefused.length} — ${rRefused.slice(0, 6).join(" ")}`);
}
if (vskipped.length) console.log(`vehicles withheld (not class-published, or a fee older than ${STALE_YEARS}y): ${vskipped.length} — ${vskipped.slice(0, 6).join(" ")}`);
console.log(`tickers carrying a share class for the per-row gate: ${withCls} of ${keys.length}`);
if (skipped.length) console.log(`skipped ${skipped.length} with no usable dated figure: ${skipped.slice(0, 8).join(" ")}`);
