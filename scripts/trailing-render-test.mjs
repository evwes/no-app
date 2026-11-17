#!/usr/bin/env node
/* wampo — DO THE TRAILING RETURNS (1Y / 3Y / 5Y / 10Y) RENDER HONESTLY?
 *
 * `data/fund-facts.json` carried a dated, sourced, annualised return curve for
 * 13,302 tickers and 416 trust unit classes, and NOTHING READ THEM: the
 * generator took `er` and `ytd` and dropped the curve, so the figures never
 * even reached the asset every visitor downloads. Same defect as the YTD
 * returns of 2026-11-06, one layer earlier — *a stored field is not a published
 * one* — and this gate exists so it cannot silently become true again.
 *
 * TWO HALVES, BECAUSE THE CLAIM HAS TWO LAYERS.
 *
 *  1. THE PUBLISH GATE. `gen-fund-facts-asset.mjs` re-applies the checker's
 *     refusals rather than trusting its input, and on the committed store every
 *     one of those refusals has a population of ZERO. *An inert arm and a
 *     broken arm read the same zero*, so each is fed a crafted entry through
 *     `--in` and must refuse it BY NAME while leaving its neighbours alone. The
 *     one that matters most is the BASIS: a 10-year CUMULATIVE return is about
 *     2.6x its annualised one, so publishing one in this column is not an
 *     imprecise number, it is a different quantity wearing this one's name.
 *
 *  2. THE PAGE. The columns must exist on a plan menu and be ABSENT on the
 *     brokerage tab (the ticker resolver is gated on `tab === "menu"`, so every
 *     cell there is a dash by construction); every printed figure must be a
 *     signed 2dp percentage carrying its own as-of date and, beyond 1Y, the
 *     word "annualised"; a STARRED row must print no comparable fund's curve,
 *     because a trust tracking an index returns something else; and the note
 *     under the table must be present exactly when figures are.
 *
 * THE PAGE HALF RUNS TWICE, AGAINST TWO ASSETS, AND THAT IS DELIBERATE.
 * `page.route` serves the asset this generator produces from the CURRENT source
 * of truth, so the claims are exercised against the whole chain (JSON ->
 * generator -> page) whatever the committed asset happens to hold. The second
 * pass uses the COMMITTED asset, where the assertions that hold either way are
 * checked — alignment, no undated figure, note iff figures. `gen-fund-facts-
 * asset.mjs --check` is what proves those two assets agree; this gate does not
 * duplicate it.
 *
 * THE SELECTORS ARE `:scope >` FOR A MEASURED REASON, inherited verbatim from
 * `ytd-render-test.mjs`: the fund table is nested inside the plans table's own
 * tbody, so an unscoped query welds in the provider fee table and matches the
 * fund table's own thead row. *A page instrument that measures the wrong table
 * is this project's most repeated self-inflicted wound.*
 *
 * Usage: node scripts/trailing-render-test.mjs        (exit 1 on any failure)
 *        CHROMIUM_PATH=/opt/pw-browsers/chromium node scripts/trailing-render-test.mjs
 */
import { chromium } from "playwright";
import { spawn, execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdtempSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadFundFactsAsset } from "./lib-schema.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PORT = 8911;
const HOR = ["r1y", "r3y", "r5y", "r10y"];
let bad = 0;
const fail = (m) => { bad++; console.log(`  FAIL  ${m}`); };
const ok = (m) => console.log(`  ok    ${m}`);
const tmp = mkdtempSync(path.join(os.tmpdir(), "wampo-trail-"));

/* ---------------------------------------------------------------- 1. the gate */
console.log(`\n  THE PUBLISH GATE — every refusal fires on its own case`);
const DAY = 86400000;
const today = new Date().toISOString().slice(0, 10);
const recent = new Date(Date.now() - 20 * DAY).toISOString().slice(0, 10);
const older = new Date(Date.now() - 60 * DAY).toISOString().slice(0, 10);
const SRC = "https://example.gov/fund";
const base = (extra) => ({ name: "Test Fund", updated: today, source: SRC, ...extra });
const curve = (d) => ({ r1y: 9.1, r1yAsOf: d, r3y: 8.2, r3yAsOf: d, r5y: 7.3, r5yAsOf: d, r10y: 6.4, r10yAsOf: d });
const crafted = {
  funds: {
    /* the good case — all four horizons, one shared date, and it must survive */
    GOODX: base({ er: 0.05, erAsOf: recent, ytd: 3.2, ytdAsOf: recent, returnBasis: "annualised", inception: "1999-01-01", ...curve(recent) }),
    /* NO er AND NO ytd: the entry must still be EMITTED, because the curve is
     * the only publishable figure it has and the old skip test named the other
     * two. 1,544 real entries carry a curve with no YTD. */
    CURVX: base({ returnBasis: "annualised", inception: "1999-01-01", ...curve(recent) }),
    /* THE BASIS — a cumulative curve in annualised fields. Every value is
     * plausible on its own, so no band can catch it; only the declaration can,
     * and the WHOLE curve goes. */
    CUMUX: base({ er: 0.1, erAsOf: recent, returnBasis: "cumulative", inception: "1999-01-01", ...curve(recent) }),
    /* ...and the same with the field simply absent, which is how a hand-edit
     * arrives rather than how a paste does. */
    NOBAX: base({ er: 0.1, erAsOf: recent, inception: "1999-01-01", ...curve(recent) }),
    /* THE BAND, per horizon: +159% is ten years at 10% a year stated
     * cumulatively. r10y's band stops at 80, so this one horizon is refused and
     * its three neighbours must be kept. */
    OOBX: base({ er: 0.1, erAsOf: recent, returnBasis: "annualised", inception: "1999-01-01", ...curve(recent), r10y: 159 }),
    /* STALENESS — the dormant-class hazard. Vanguard serves withdrawn unit
     * classes with an orphaned 2014 fee; a 2014 "10Y" describes 2004-2014. */
    STALX: base({ er: 0.1, erAsOf: recent, returnBasis: "annualised", inception: "1999-01-01", ...curve("2014-03-31") }),
    /* NO DATE on one horizon, and a FUTURE date on another. Either way the
     * figure is dropped: an undated return is not publishable here, so the
     * renderer is never asked to decide. */
    UNDTX: base({ er: 0.1, erAsOf: recent, returnBasis: "annualised", inception: "1999-01-01", ...curve(recent), r1yAsOf: undefined, r3yAsOf: "2099-01-01" }),
    /* INCEPTION — a ten-year figure on a fund that has lived six. */
    YUNGX: base({ er: 0.1, erAsOf: recent, returnBasis: "annualised", inception: "2020-06-30", ...curve(recent) }),
    /* MIXED DATES — the checker only WARNS, so the asset must carry a shape
     * that survives one: per-horizon dates and NO shared rAsOf. This arm is
     * inert on today's store (0 of 13,302 entries), which is exactly why it
     * needs a fixture. */
    MIXDX: base({ er: 0.1, erAsOf: recent, returnBasis: "annualised", inception: "1999-01-01", ...curve(recent), r5yAsOf: older }),
  },
  vehicles: {},
};
writeFileSync(path.join(tmp, "crafted.json"), JSON.stringify(crafted));
const genOut = execFileSync(process.execPath, [path.join(ROOT, "scripts", "gen-fund-facts-asset.mjs"),
  "--in", path.join(tmp, "crafted.json"), "--out", path.join(tmp, "crafted-asset.js")], { encoding: "utf8" });
const C = loadFundFactsAsset(path.join(tmp, "crafted-asset.js")).facts;
const has = (tk, h) => !!(C[tk] && C[tk][h] != null);
const dateOf = (tk, h) => (C[tk] ? (C[tk][`${h}AsOf`] || C[tk].rAsOf) : null);
const expect = (label, cond, detail) => (cond ? ok(label) : fail(`${label} — ${detail}`));

expect("GOODX keeps all four horizons under one shared rAsOf",
  HOR.every((h) => has("GOODX", h)) && C.GOODX && C.GOODX.rAsOf === recent && HOR.every((h) => C.GOODX[`${h}AsOf`] === undefined),
  `got ${JSON.stringify(C.GOODX)}`);
expect("a curve with NO fee and NO ytd is still emitted",
  !!C.CURVX && HOR.every((h) => has("CURVX", h)), `got ${JSON.stringify(C.CURVX)}`);
expect("returnBasis \"cumulative\" drops the WHOLE curve (and keeps the fee)",
  !!C.CUMUX && C.CUMUX.er === 0.1 && HOR.every((h) => !has("CUMUX", h)), `got ${JSON.stringify(C.CUMUX)}`);
expect("a MISSING returnBasis drops the whole curve",
  !!C.NOBAX && HOR.every((h) => !has("NOBAX", h)), `got ${JSON.stringify(C.NOBAX)}`);
expect("an out-of-band r10y (a cumulative +159%) is dropped and its neighbours kept",
  !has("OOBX", "r10y") && has("OOBX", "r1y") && has("OOBX", "r3y") && has("OOBX", "r5y"), `got ${JSON.stringify(C.OOBX)}`);
expect("a 2014 curve is refused as stale",
  HOR.every((h) => !has("STALX", h)), `got ${JSON.stringify(C.STALX)}`);
expect("an UNDATED horizon and a FUTURE-dated one are both dropped",
  !has("UNDTX", "r1y") && !has("UNDTX", "r3y") && has("UNDTX", "r5y"), `got ${JSON.stringify(C.UNDTX)}`);
expect("a 10-year figure on a six-year-old fund is refused, 1Y/3Y/5Y kept",
  !has("YUNGX", "r10y") && has("YUNGX", "r1y") && has("YUNGX", "r5y"), `got ${JSON.stringify(C.YUNGX)}`);
expect("mixed as-of dates produce PER-HORIZON dates and no shared rAsOf",
  !!C.MIXDX && C.MIXDX.rAsOf === undefined && C.MIXDX.r1yAsOf === recent && C.MIXDX.r5yAsOf === older,
  `got ${JSON.stringify(C.MIXDX)}`);
/* AND NOTHING MAY REACH THE ASSET UNDATED, which is the one invariant the
 * renderer is allowed to rely on. Asserted over every emitted entry rather
 * than over the ones this file crafted. */
{
  const undated = Object.entries(C).filter(([, e]) => HOR.some((h) => e[h] != null && !/^\d{4}-\d{2}-\d{2}$/.test(String(e[`${h}AsOf`] || e.rAsOf))));
  expect("no emitted figure is undated", undated.length === 0, `${undated.length}: ${undated.slice(0, 2).map(([k]) => k).join(" ")}`);
}
expect("the generator REPORTS its refusals rather than swallowing them",
  /trailing figures REFUSED: \d+/.test(genOut), `stdout was ${JSON.stringify(genOut.slice(-200))}`);

/* THE POSITIVE CONTROL, FROM THE REAL SOURCE OF TRUTH. Everything above runs
 * on fixtures, and a gate made only of fixtures cannot tell a working path from
 * a dead one. So the generator is run over the committed store and must produce
 * a curve for a substantial number of tickers. */
console.log(`\n  POSITIVE CONTROL — the committed source of truth produces curves`);
execFileSync(process.execPath, [path.join(ROOT, "scripts", "gen-fund-facts-asset.mjs"),
  "--out", path.join(tmp, "candidate.js")], { encoding: "utf8" });
const CAND = loadFundFactsAsset(path.join(tmp, "candidate.js"));
const candCurve = Object.values(CAND.facts).filter((e) => HOR.some((h) => e[h] != null)).length;
const candVeh = Object.values(CAND.vehicles).filter((e) => HOR.some((h) => e[h] != null)).length;
expect(`${candCurve} tickers and ${candVeh} trust classes carry a curve from data/fund-facts.json`,
  candCurve >= 500, `only ${candCurve} — the figures the page is meant to print are not in the source`);

/* ---------------------------------------------------------------- 2. the page */
/* PINNED BY EIN|PN, and the run FAILS if a specimen is not in the store: a
 * specimen chosen by a boot bit has twice turned out not to show what it was
 * picked for. `minFilled` and `maxFilled` bound what the page must print —
 * "at least one" cannot see a resolver that has started answering for rows it
 * should refuse. They count ROWS with at least one figure, not cells. */
const SPECS = [
  { key: "611790568|001", label: "Universal Services of America", minRows: 8, maxRows: 20, starred: 0,
    why: "a real mutual-fund menu — the case the columns exist for" },
  { key: "621721435|004", label: "FedEx", minRows: 10, maxRows: 20, starred: 12, vehicle: true,
    why: "Vanguard target-date TRUSTS that state their unit class — the curve must be the trust's own, not the comparable fund's" },
  { key: "820544687|001", label: "Amazon", minRows: 0, maxRows: 6, starred: 10,
    why: "the same family filed WITHOUT a unit class: starred comparables that must print no curve at all" },
  /* THE BAND'S OWN SPECIMEN, from the data rather than from imagination: 416
   * published menus carry a banded trailing row and this is the largest whose
   * rows name a T. ROWE trust and NO unit class. Without it the band branch of
   * `retCell` is machinery nothing runs — *an arm real in principle and inert
   * on the data is untested* — and the branch makes its own distinct claim: a
   * RANGE across the classes the provider publishes, with the count in the
   * tooltip, on a row whose ticker is a starred comparable. */
  { key: "610502302|002", label: "Dollar General", minRows: 13, maxRows: 24, starred: 13, bands: 10,
    why: "T. Rowe Price Retirement <year> Trust with no class stated — the rows that must show a RANGE, not a figure" },
];

const TABLE = `[...document.querySelectorAll("table.fund-table")].find((x) => {
  const h = x.querySelector(":scope > thead > tr > th");
  return h && h.textContent.trim() === "Holding";
})`;
const READ = `(() => {
  const t = ${TABLE};
  if (!t) return null;
  const head = [...t.querySelectorAll(":scope > thead > tr > th")].map((e) => e.textContent.trim());
  const idx = ["1Y", "3Y", "5Y", "10Y"].map((l) => head.indexOf(l));
  return {
    head, idx,
    rows: [...t.querySelectorAll(":scope > tbody > tr")].map((tr) => {
      const td = [...tr.querySelectorAll("td")];
      return {
        cells: td.length,
        name: (td[0] ? td[0].innerText : "").replace(/\\s+/g, " ").trim().slice(0, 70),
        star: /\\*/.test(td[0] ? td[0].innerText : ""),
        type: (td[1] ? td[1].innerText : "").trim(),
        ret: idx.map((i) => {
          if (i < 0 || !td[i]) return null;
          const sp = td[i].querySelector("span[title]");
          return { text: td[i].innerText.trim(), title: sp ? sp.getAttribute("title") : null };
        }),
      };
    }),
    note: [...document.querySelectorAll("p.fund-note")]
      .map((p) => p.innerText.replace(/\\s+/g, " ").trim())
      .find((n) => /^1Y \\/ 3Y \\/ 5Y \\/ 10Y return\\./.test(n)) || null,
    sub: [...document.querySelectorAll(".section-sub")].map((e) => e.textContent).join(" | "),
  };
})()`;

const server = spawn("python3", ["-m", "http.server", String(PORT)], { stdio: "ignore", cwd: ROOT });
try {
  const browser = await chromium.launch(
    process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});

  const openTable = async (page, key) => {
    await page.goto(`http://localhost:${PORT}/#plan=${encodeURIComponent(key)}`);
    /* The sandbox's headless renderer FREEZES about a second after load without
     * user activation — timers stop and in-flight response bodies never
     * deliver, so an on-demand shard fetch looks stuck on a deep-linked page.
     * One synthetic click unfreezes it. Hours were lost to this once. */
    await page.mouse.click(5, 5);
    await page.waitForSelector("table.fund-table tbody tr", { timeout: 60000 });
    await page.waitForTimeout(1200);
    return page.evaluate(READ);
  };

  /* the shape every printed figure must have, whichever asset is loaded */
  const FIG = /^[+−]\d+\.\d\d%$/;
  const RANGE = /^[+−]\d+\.\d\d–−?\d+\.\d\d%$/;
  const checkFigures = (label, got) => {
    let printed = 0, rowsFilled = 0;
    for (const r of got.rows) {
      let any = false;
      for (let i = 0; i < HOR.length; i++) {
        const c = r.ret[i];
        if (!c || !c.text || c.text === "—") continue;
        printed++; any = true;
        if (!FIG.test(c.text) && !RANGE.test(c.text))
          fail(`${label}: ${HOR[i]} cell "${c.text}" is neither a signed 2dp percentage nor a range — ${r.name}`);
        if (!c.title) { fail(`${label}: a printed ${HOR[i]} figure carries NO title, so its date is invisible — ${r.name}`); continue; }
        if (!/as of \d{1,2} [A-Z][a-z]{2} \d{4}/.test(c.title))
          fail(`${label}: a ${HOR[i]} figure states no as-of date — "${c.title.slice(0, 80)}"`);
        if (i > 0 && !/annualised/.test(c.title))
          fail(`${label}: the ${HOR[i]} figure's title does not say "annualised" — "${c.title.slice(0, 80)}"`);
        /* A STARRED ROW MAY PRINT A CURVE ONLY IF IT IS THE TRUST'S OWN, which
         * the title says by naming the unit class. Keying on the asterisk alone
         * would make a correct page look wrong — the asterisk describes the
         * SYMBOL, and the figure beside it can belong to the vehicle. */
        if (r.star && !/unit class/.test(c.title))
          fail(`${label}: a STARRED row prints a comparable fund's ${HOR[i]} return — ${r.name} :: ${c.title.slice(0, 70)}`);
      }
      if (any) rowsFilled++;
    }
    return { printed, rowsFilled };
  };

  /* ---- pass 1: the asset the generator produces RIGHT NOW ---- */
  console.log(`\n  THE PAGE, against the asset generated from data/fund-facts.json`);
  const candidateSrc = readFileSync(path.join(tmp, "candidate.js"), "utf8");
  const p1 = await browser.newPage();
  p1.on("pageerror", (e) => fail("page JS error: " + e.message));
  await p1.route("**/fund-facts.js*", (route) => route.fulfill({
    status: 200, contentType: "application/javascript", body: candidateSrc,
  }));
  for (const s of SPECS) {
    console.log(`\n  ${s.label} — ${s.why}`);
    const got = await openTable(p1, s.key);
    if (!got) { fail(`${s.label}: no fund table whose first header is "Holding" — specimen or page broken`); continue; }
    const missing = ["1Y", "3Y", "5Y", "10Y"].filter((l) => !got.head.includes(l));
    if (missing.length) { fail(`${s.label}: the plan menu is missing ${missing.join(", ")} — header ${JSON.stringify(got.head)}`); continue; }
    const ytdAt = got.head.indexOf("YTD return");
    if (!(ytdAt >= 0 && got.idx[0] === ytdAt + 1 && got.idx[1] === ytdAt + 2 && got.idx[2] === ytdAt + 3 && got.idx[3] === ytdAt + 4))
      fail(`${s.label}: the curve columns are not in 1Y/3Y/5Y/10Y order after "YTD return" — ${JSON.stringify(got.head)}`);
    else ok(`${s.label}: 1Y 3Y 5Y 10Y sit at ${got.idx.join(",")} of ${got.head.length}, right after YTD return`);
    const misaligned = got.rows.filter((r) => r.cells !== got.head.length).length;
    if (misaligned) fail(`${s.label}: ${misaligned} row(s) do not have ${got.head.length} cells — every figure would sit under the wrong heading`);
    else ok(`${s.label}: all ${got.rows.length} rows have ${got.head.length} cells`);

    const { printed, rowsFilled } = checkFigures(s.label, got);
    if (rowsFilled < s.minRows || rowsFilled > s.maxRows)
      fail(`${s.label}: ${rowsFilled} rows carry a curve, expected ${s.minRows}..${s.maxRows} (${printed} figures)`);
    else ok(`${s.label}: ${rowsFilled} of ${got.rows.length} rows carry a curve (${printed} figures)`);
    const starred = got.rows.filter((r) => r.star).length;
    if (starred < s.starred) fail(`${s.label}: only ${starred} starred rows, expected at least ${s.starred} — the comparable rule is untested here`);
    else if (s.starred) ok(`${s.label}: ${starred} starred (comparable) rows, so the rule is exercised`);

    /* THE VEHICLE PATH MUST BE REACHED SOMEWHERE, or "no starred row printed a
     * comparable's curve" is a claim about a page with no figures.
     *
     * AN EXACT UNIT-CLASS FIGURE IS NOT A BAND, AND THE FIRST VERSION OF THIS
     * LINE COULD NOT TELL THEM APART — it keyed on the phrase "unit class",
     * which BOTH tooltips contain, so Dollar General's thirteen banded rows
     * read as exact unit-class figures and the test demanded a note sentence
     * about "the unit class the filing names" on a page whose filings name no
     * class. The page was right and the instrument was wrong: *two different
     * claims sharing one row have to be told apart by what the cell SAYS*, and
     * what distinguishes them is that a band is a RANGE. */
    const unitClass = got.rows.filter((r) => r.ret.some((c) => c && c.title && /unit class/.test(c.title) && !RANGE.test(c.text || "")));
    if (s.vehicle && !unitClass.length) fail(`${s.label}: no row prints a TRUST unit class's own curve — the vehicle arm is inert here`);
    else if (s.vehicle) ok(`${s.label}: ${unitClass.length} rows print the trust's OWN curve, e.g. ${unitClass[0].name} ${unitClass[0].ret[0].text}`);
    if (!s.vehicle && !s.bands && unitClass.length) fail(`${s.label}: ${unitClass.length} rows claim a unit-class curve on a specimen that states no class`);

    /* THE BAND BRANCH, and it is a DIFFERENT claim from the exact figure: a
     * range over the unit classes the provider publishes, whose tooltip must
     * state how many classes it covers, because a range over a SUBSET does not
     * bound the family. */
    if (s.bands) {
      const ranged = got.rows.filter((r) => r.ret.some((c) => c && RANGE.test(c.text || "")));
      if (ranged.length < s.bands) fail(`${s.label}: ${ranged.length} rows show a RANGE, expected at least ${s.bands} — the band branch is inert here`);
      else {
        ok(`${s.label}: ${ranged.length} rows show a range, e.g. ${ranged[0].name} ${ranged[0].ret.map((c) => c.text).join(" ")}`);
        const noCount = ranged.filter((r) => r.ret.some((c) => c && RANGE.test(c.text || "") && !/\d+ unit classes of this trust/.test(c.title || "")));
        if (noCount.length) fail(`${s.label}: ${noCount.length} range(s) do not say how many unit classes they cover`);
        else ok(`${s.label}: every range names the number of classes it covers`);
      }
    }

    if (rowsFilled && !got.note) fail(`${s.label}: curves printed with no note stating their basis and date`);
    else if (!rowsFilled && got.note) fail(`${s.label}: the note is printed with no figures to explain`);
    else if (got.note) {
      if (!/as of \d{1,2} [A-Z][a-z]{2} \d{4}/.test(got.note)) fail(`${s.label}: the note states no as-of date — "${got.note.slice(0, 90)}"`);
      else if (!/annualised/.test(got.note)) fail(`${s.label}: the note does not say the figures are annualised`);
      else ok(`${s.label}: the note carries the basis and the date — "${got.note.match(/as of [^,]+/)[0]}"`);
      if (!/marked \* usually shows none/.test(got.note)) fail(`${s.label}: the note does not state the comparable rule`);
      if (unitClass.length && !/unit class the filing names/.test(got.note))
        fail(`${s.label}: rows show a trust's own curve and the note does not explain the exception`);
    }
    /* the one statement of the basis a reader sees WITHOUT hovering anything */
    if (rowsFilled && !/returns beyond 1Y are annualised/.test(got.sub))
      fail(`${s.label}: the line above the table does not state that the returns are annualised`);
    else if (rowsFilled) ok(`${s.label}: the visible sub-line states the basis`);
  }
  await p1.close();

  /* ---- pass 2: the COMMITTED asset, which is what a reader downloads ---- */
  console.log(`\n  THE PAGE, against the COMMITTED fund-facts.js`);
  const committed = loadFundFactsAsset(path.join(ROOT, "fund-facts.js"));
  const commCurve = Object.values(committed.facts).filter((e) => HOR.some((h) => e[h] != null)).length;
  console.log(`  committed asset carries a curve for ${commCurve} tickers`);
  const p2 = await browser.newPage();
  p2.on("pageerror", (e) => fail("page JS error: " + e.message));
  const got2 = await openTable(p2, SPECS[0].key);
  if (!got2) fail("committed asset: no fund table on the first specimen");
  else {
    const missing = ["1Y", "3Y", "5Y", "10Y"].filter((l) => !got2.head.includes(l));
    if (missing.length) fail(`committed asset: the columns are missing (${missing.join(", ")}) — the page code is not shipped`);
    else ok(`committed asset: the four columns are present`);
    const misaligned = got2.rows.filter((r) => r.cells !== got2.head.length).length;
    if (misaligned) fail(`committed asset: ${misaligned} misaligned row(s)`);
    else ok(`committed asset: all ${got2.rows.length} rows have ${got2.head.length} cells`);
    const { printed, rowsFilled } = checkFigures("committed asset", got2);
    /* NOT A SKIP. The claim here is an EQUIVALENCE between two statements, and
     * both are checkable: either the asset carries curves and the page prints
     * them with the note, or it carries none and the page prints neither. An
     * all-dashes column with a note explaining figures nobody can see would be
     * the defect this asserts against. */
    if (commCurve === 0) {
      if (printed) fail(`committed asset: ${printed} figures printed from an asset carrying no curve`);
      else if (got2.note) fail(`committed asset: the note is printed with no figures to explain`);
      else ok(`committed asset: carries no curve, prints no figure and no note — consistent (run gen-fund-facts-asset.mjs + stamp-assets.mjs to ship them)`);
    } else if (!printed) {
      fail(`committed asset: ${commCurve} tickers carry a curve and the page printed none`);
    } else {
      ok(`committed asset: ${rowsFilled} rows / ${printed} figures printed, each dated`);
      if (!got2.note) fail(`committed asset: figures printed with no note`);
    }
  }

  /* ---- the brokerage tab: the columns must be ABSENT, not empty ---- */
  console.log(`\n  brokerage / managed-account tab`);
  const smaKey = "824991898|002";   // Cigna — 150 individually held securities
  await p2.goto(`http://localhost:${PORT}/#plan=${encodeURIComponent(smaKey)}`);
  await p2.mouse.click(5, 5);
  await p2.waitForSelector("table.fund-table tbody tr", { timeout: 60000 });
  const btn = await p2.$('.lineup-tab[data-tab="sma"]');
  if (!btn) fail(`the pinned brokerage specimen ${smaKey} has no brokerage tab — pin a different plan`);
  else {
    await btn.click();
    await p2.waitForTimeout(1200);
    const h = await p2.evaluate(`(() => { const t = ${TABLE};
      return t ? [...t.querySelectorAll(":scope > thead > tr > th")].map((e) => e.textContent.trim()) : null; })()`);
    if (!h) fail("no Holding table on the brokerage tab");
    else {
      const present = ["1Y", "3Y", "5Y", "10Y"].filter((l) => h.includes(l));
      if (present.length) fail(`the brokerage tab carries all-dashes return columns (${present.join(", ")}) — ${JSON.stringify(h)}`);
      else ok(`columns absent on the brokerage tab (${h.length} columns: ${h.join(", ")})`);
    }
  }
  await browser.close();
} finally {
  server.kill();
}

console.log(bad ? `\ntrailing-render-test: ${bad} FAILURE(S)` : `\ntrailing-render-test: the trailing returns render honestly`);
process.exit(bad ? 1 : 0);
