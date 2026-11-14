#!/usr/bin/env node
/* wampo — DOES THE SOURCED YTD RETURN RENDER HONESTLY ON THE PAGE?
 *
 * The returns in `data/fund-facts.json` were sourced, generated into
 * `fund-facts.js`, downloaded by every visitor, and read by NOTHING for weeks:
 * `app.js` took `sf.er` and ignored `sf.ytd`. This gate exists so that cannot
 * silently become true again, and so the two claims the column makes stay
 * true. Both are claims, not cosmetics:
 *
 *   1. A STARRED ROW PRINTS NO RETURN. A starred ticker is a COMPARABLE: the
 *      plan holds a collective trust or separate account and the symbol is a
 *      registered equivalent. For a fee the page could call the retail figure a
 *      ceiling; a return has no such reading, because a trust tracking the same
 *      index returns something else -- different fee drag, different cash,
 *      different securities-lending credit. The owner's standing decision on
 *      comparables is symbol only, NO fee; a return is further from the vehicle
 *      than a fee is, so it follows that rule a fortiori. Amazon's page is the
 *      specimen that makes this testable: 15 starred rows.
 *   2. A FIGURE NEVER APPEARS WITHOUT ITS DATE. Every sourced figure carries an
 *      as-of date, and the note under the table states the DISTINCT dates of
 *      the returns that page actually prints. So a page with figures must carry
 *      the note, and a page with no figures must not.
 *
 * It also holds the column's shape: present on a plan menu, ABSENT on the
 * brokerage / managed-account tab, where the ticker resolver itself is gated on
 * tab === "menu" so every cell would be a dash by construction.
 *
 * THE SELECTORS ARE `:scope >` FOR A MEASURED REASON. The fund table is nested
 * inside the plans table's own tbody (the expanded detail row is
 * `<tr class="detail-tr"><td colspan=6>`), so a descendant `tbody tr` also
 * matches the fund table's own THEAD row, and an unscoped `table.fund-table`
 * query welds in the provider fee table -- which read as a ten-column header
 * and three phantom failures before it was scoped. A page instrument that
 * measures the wrong table is this project's most repeated self-inflicted
 * wound.
 *
 * Specimens are PINNED BY EIN|PN and the run THROWS if one is not in the store,
 * because a specimen chosen by a boot bit has twice turned out not to show what
 * it was picked for.
 *
 * Usage: node scripts/ytd-render-test.mjs        (exit 1 on any failure)
 *        CHROMIUM_PATH=/opt/pw-browsers/chromium node scripts/ytd-render-test.mjs
 */
import { chromium } from "playwright";
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PORT = 8907;
let bad = 0;
const fail = (m) => { bad++; console.log(`  FAIL  ${m}`); };
const ok = (m) => console.log(`  ok    ${m}`);

/* The figures must exist before the page can be blamed for not showing them:
 * a BROKEN render and an EMPTY source read the same zero. */
const FF = JSON.parse(readFileSync(path.join(ROOT, "data", "fund-facts.json"), "utf8"));
const withYtd = Object.entries(FF.funds).filter(([, v]) => v && v.ytd != null);
if (withYtd.length < 20) {
  console.log(`ytd-render-test: SOURCE CONTROL FAILED — only ${withYtd.length} funds carry a ytd`);
  process.exit(1);
}
ok(`${withYtd.length} funds carry a sourced ytd (source control)`);

/* PINNED, with the coverage each was chosen for. `minFilled`/`maxFilled` bound
 * what the page must show: a pin that only asserts "at least one" cannot see a
 * resolver that has started answering for rows it should refuse. */
const SPECS = [
  { key: "611790568|001", label: "Universal Services of America", minFilled: 8, maxFilled: 20, starred: 0,
    why: "a real mutual-fund menu — the case the column exists for" },
  { key: "710415188|003", label: "Walmart", minFilled: 1, maxFilled: 4, starred: 0,
    why: "1.97M readers and almost no sourced coverage — the column must still be honest, not hidden" },
  { key: "820544687|001", label: "Amazon", minFilled: 1, maxFilled: 4, starred: 10,
    why: "a collective-trust menu with starred comparables — the rows that must print NO return" },
  /* THE VEHICLE PATH'S OWN SPECIMEN, 2026-11-14. Amazon above is the control
   * for it rather than a duplicate: its twelve trust rows are filed as
   * "VANGUARD TARGET <year>" and state NO unit class, so they must stay blank
   * however many figures exist. FedEx files the same family WITH the class
   * ("... Trust II"), so the same menu shape resolves and must print. Two
   * specimens, one difference: whether the filing names the class. */
  { key: "621721435|004", label: "FedEx", minFilled: 12, maxFilled: 20, starred: 12, vehicles: 12,
    why: "a Vanguard target-date trust menu that STATES its unit class — the rows that must print the trust's own figure" },
  /* A SECOND HOUSE, 2026-11-14. FedEx alone pins the mechanism against ONE
   * issuer's filed shapes, and the T. Rowe arm differs in every detail that
   * matters: the class marker is "Cl. B" rather than "Trust II", the fee comes
   * from a quarterly fact sheet (so its YTD is dated 2026-09-30, not
   * yesterday), and the house sells a registered FUND beside the TRUST under
   * nearly the same name. A gate that only tests the house it was written for
   * is how a Vanguard-shaped narrowing passed its own discharge while
   * excluding every T. Rowe row. 13 of this menu's 35 rows are T. Rowe
   * trusts. */
  /* starred is 11 against 13 vehicle rows, and the gap is the point: TWO of
   * these trusts resolve to NO comparable ticker at all, so they print a fee
   * and a return beside an empty symbol cell. That is correct — a vehicle
   * figure belongs to the vehicle and never needed a comparable to stand on —
   * and pinning 13 here asserted a coupling that does not exist. */
  { key: "340648199|005", label: "Squire Patton Boggs", minFilled: 13, maxFilled: 24, starred: 11, vehicles: 13,
    why: "a T. ROWE PRICE trust menu — a second issuer, a different class marker, and a quarterly rather than daily figure" },
];

const TABLE = `[...document.querySelectorAll("table.fund-table")].find((x) => {
  const h = x.querySelector(":scope > thead > tr > th");
  return h && h.textContent.trim() === "Holding";
})`;

const server = spawn("python3", ["-m", "http.server", String(PORT)], { stdio: "ignore", cwd: ROOT });
try {
  const browser = await chromium.launch(
    process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
  const page = await browser.newPage();
  page.on("pageerror", (e) => fail("page JS error: " + e.message));

  const openTable = async (key) => {
    await page.goto(`http://localhost:${PORT}/#plan=${encodeURIComponent(key)}`);
    /* The sandbox's headless renderer FREEZES about a second after load without
     * user activation -- timers stop and in-flight response bodies never
     * deliver -- so on-demand shard fetches look stuck on a deep-linked page.
     * One synthetic click unfreezes it. Hours were lost to this once. */
    await page.mouse.click(5, 5);
    await page.waitForSelector("table.fund-table tbody tr", { timeout: 60000 });
    await page.waitForTimeout(1200);
    return page.evaluate(`(() => {
      const t = ${TABLE};
      if (!t) return null;
      return {
        head: [...t.querySelectorAll(":scope > thead > tr > th")].map((e) => e.textContent.trim()),
        rows: [...t.querySelectorAll(":scope > tbody > tr")].map((tr) =>
          [...tr.querySelectorAll("td")].map((td) => td.innerText.replace(/\\s+/g, " ").trim())),
        starred: [...t.querySelectorAll(":scope > tbody > tr")].filter((tr) =>
          /\\*/.test((tr.querySelector("td") || {}).innerText || "")).length,
        /* A STARRED ROW MAY NOW PRINT A RETURN, BUT ONLY ITS OWN.
         * The asterisk says the SYMBOL is a comparable. Where the provider
         * publishes a figure for the very unit class the filing names, the
         * return shown is the TRUST's, not the comparable fund's, and the
         * cell's title says so. These are two different claims sharing one
         * row, so the test has to tell them apart by reading the title rather
         * than by the asterisk alone -- keying on the asterisk would make a
         * correct page look wrong. */
        starredWithReturn: [...t.querySelectorAll(":scope > tbody > tr")].filter((tr) => {
          const td = [...tr.querySelectorAll("td")];
          const i = [...t.querySelectorAll(":scope > thead > tr > th")]
            .findIndex((e) => e.textContent.trim() === "YTD return");
          if (!(i >= 0 && td[0] && /\\*/.test(td[0].innerText) && td[i]
            && td[i].innerText.trim() && td[i].innerText.trim() !== "\\u2014")) return false;
          const sp = td[i].querySelector("span[title]");
          return !(sp && /unit class/.test(sp.getAttribute("title") || ""));
        }).map((tr) => tr.querySelector("td").innerText.replace(/\\s+/g, " ").slice(0, 60)),
        vehicleReturns: [...t.querySelectorAll(":scope > tbody > tr")].filter((tr) => {
          const td = [...tr.querySelectorAll("td")];
          const i = [...t.querySelectorAll(":scope > thead > tr > th")]
            .findIndex((e) => e.textContent.trim() === "YTD return");
          if (i < 0 || !td[i]) return false;
          const sp = td[i].querySelector("span[title]");
          return !!(sp && /unit class/.test(sp.getAttribute("title") || ""));
        }).map((tr) => { const td = [...tr.querySelectorAll("td")];
          const i = [...t.querySelectorAll(":scope > thead > tr > th")]
            .findIndex((e) => e.textContent.trim() === "YTD return");
          return { name: td[0].innerText.replace(/\\s+/g, " ").slice(0, 52),
                   er: td[2] ? td[2].innerText.trim() : "", ytd: td[i].innerText.trim(),
                   title: (td[i].querySelector("span[title]").getAttribute("title") || "").slice(0, 80) }; }),
        note: [...document.querySelectorAll("p.fund-note")]
          .map((p) => p.innerText.replace(/\\s+/g, " ").trim())
          .find((n) => /^YTD return\\./.test(n)) || null,
      };
    })()`);
  };

  for (const s of SPECS) {
    console.log(`\n  ${s.label} — ${s.why}`);
    const got = await openTable(s.key);
    if (!got) { fail(`${s.label}: no fund table whose first header is "Holding" — specimen or page broken`); continue; }

    const i = got.head.indexOf("YTD return");
    if (i < 0) { fail(`${s.label}: the plan menu has no "YTD return" column — header ${JSON.stringify(got.head)}`); continue; }
    ok(`${s.label}: column present at position ${i + 1} of ${got.head.length}`);

    const misaligned = got.rows.filter((r) => r.length !== got.head.length).length;
    if (misaligned) fail(`${s.label}: ${misaligned} row(s) do not have ${got.head.length} cells — every figure would sit under the wrong heading`);
    else ok(`${s.label}: all ${got.rows.length} rows have ${got.head.length} cells`);

    const filled = got.rows.filter((r) => r[i] && r[i] !== "—");
    if (filled.length < s.minFilled || filled.length > s.maxFilled) {
      fail(`${s.label}: ${filled.length} filled return cells, expected ${s.minFilled}..${s.maxFilled}`);
    } else ok(`${s.label}: ${filled.length} filled return cells of ${got.rows.length} rows`);

    /* EVERY printed figure must be a signed percentage. A bare number, a NaN or
     * an unsigned one is a different claim from the one the note explains. */
    const malformed = filled.filter((r) => !/^[+−]\d+\.\d\d%$/.test(r[i]));
    if (malformed.length) fail(`${s.label}: ${malformed.length} return cell(s) are not a signed 2dp percentage, e.g. "${malformed[0][i]}"`);
    else if (filled.length) ok(`${s.label}: every figure is a signed 2dp percentage (e.g. ${filled[0][i]})`);

    if (got.starred < s.starred) fail(`${s.label}: only ${got.starred} starred rows, expected at least ${s.starred} — the comparable rule is untested here`);
    else if (s.starred) ok(`${s.label}: ${got.starred} starred (comparable) rows present, so the rule below is actually exercised`);
    if (got.starredWithReturn.length) fail(`${s.label}: ${got.starredWithReturn.length} starred row(s) print a return — a comparable's return is not this plan's: ${got.starredWithReturn[0]}`);
    else ok(`${s.label}: no starred row prints a COMPARABLE's return`);

    /* AND THE NEW PATH MUST ACTUALLY BE REACHED SOMEWHERE. A broken arm and an
     * inert one read the same zero, so a specimen is pinned at the number of
     * unit-class figures it must show, not merely "some". */
    const wantVeh = s.vehicles || 0;
    if (got.vehicleReturns.length !== wantVeh) {
      fail(`${s.label}: ${got.vehicleReturns.length} rows print a trust's own return, expected ${wantVeh}`);
    } else if (wantVeh) {
      ok(`${s.label}: ${wantVeh} rows print the trust's OWN figure, e.g. ${JSON.stringify(got.vehicleReturns[0].name)} ${got.vehicleReturns[0].er} / ${got.vehicleReturns[0].ytd}`);
      const noCls = got.vehicleReturns.filter((v) => !/unit class/.test(v.title));
      if (noCls.length) fail(`${s.label}: ${noCls.length} unit-class figure(s) carry no class in the tooltip`);
      else ok(`${s.label}: every one names its unit class on hover — "${got.vehicleReturns[0].title.slice(0, 44)}…"`);
    }

    if (filled.length && !got.note) fail(`${s.label}: returns printed with no note stating their as-of date`);
    else if (!filled.length && got.note) fail(`${s.label}: the note is printed with no figures to explain`);
    else if (got.note) {
      if (!/as of \d{1,2} [A-Z][a-z]{2} \d{4}/.test(got.note)) fail(`${s.label}: the note states no as-of date — "${got.note.slice(0, 90)}"`);
      else ok(`${s.label}: note carries the date — "${got.note.match(/as of [^,]+/)[0]}"`);
      /* THE CLAIM BECAME CONDITIONAL ON 2026-11-14 and the pin moved with it.
       * It used to read "marked * shows none"; some starred rows now show the
       * TRUST's own return, so the unconditional sentence would be false on
       * exactly the pages that gained figures. The note must still tell a
       * reader that an asterisk usually means no return -- and, where any
       * vehicle figure is on the page, must name the exception. */
      if (!/marked \* usually shows none/.test(got.note)) fail(`${s.label}: the note does not say a comparable usually shows no return`);
      else ok(`${s.label}: the note still states the comparable rule`);
      if (got.vehicleReturns.length && !/unit class the filing names/.test(got.note))
        fail(`${s.label}: ${got.vehicleReturns.length} row(s) show a trust's own return and the note does not explain the exception`);
      else if (got.vehicleReturns.length) ok(`${s.label}: the note explains the unit-class exception`);
    }
  }

  /* THE BROKERAGE TAB: the column must be ABSENT, not empty. */
  console.log(`\n  brokerage / managed-account tab`);
  const smaKey = "824991898|002";  // Cigna — 150 individually held securities
  await page.goto(`http://localhost:${PORT}/#plan=${encodeURIComponent(smaKey)}`);
  await page.mouse.click(5, 5);
  await page.waitForSelector("table.fund-table tbody tr", { timeout: 60000 });
  const btn = await page.$('.lineup-tab[data-tab="sma"]');
  if (!btn) fail(`the pinned brokerage specimen ${smaKey} has no brokerage tab — pin a different plan`);
  else {
    await btn.click();
    await page.waitForTimeout(1200);
    const h = await page.evaluate(`(() => { const t = ${TABLE};
      return t ? [...t.querySelectorAll(":scope > thead > tr > th")].map((e) => e.textContent.trim()) : null; })()`);
    if (!h) fail("no Holding table on the brokerage tab");
    else if (h.includes("YTD return")) fail(`the brokerage tab carries an all-dashes YTD column — ${JSON.stringify(h)}`);
    else ok(`column absent on the brokerage tab (${h.length} columns: ${h.join(", ")})`);
  }

  await browser.close();
} finally {
  server.kill();
}

console.log(bad ? `\nytd-render-test: ${bad} FAILURE(S)` : `\nytd-render-test: the sourced returns render honestly`);
process.exit(bad ? 1 : 0);
