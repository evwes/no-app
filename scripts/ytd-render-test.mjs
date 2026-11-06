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
        starredWithReturn: [...t.querySelectorAll(":scope > tbody > tr")].filter((tr) => {
          const td = [...tr.querySelectorAll("td")];
          const i = [...t.querySelectorAll(":scope > thead > tr > th")]
            .findIndex((e) => e.textContent.trim() === "YTD return");
          return i >= 0 && td[0] && /\\*/.test(td[0].innerText) && td[i]
            && td[i].innerText.trim() && td[i].innerText.trim() !== "\\u2014";
        }).map((tr) => tr.querySelector("td").innerText.replace(/\\s+/g, " ").slice(0, 60)),
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
    else ok(`${s.label}: no starred row prints a return`);

    if (filled.length && !got.note) fail(`${s.label}: returns printed with no note stating their as-of date`);
    else if (!filled.length && got.note) fail(`${s.label}: the note is printed with no figures to explain`);
    else if (got.note) {
      if (!/as of \d{1,2} [A-Z][a-z]{2} \d{4}/.test(got.note)) fail(`${s.label}: the note states no as-of date — "${got.note.slice(0, 90)}"`);
      else ok(`${s.label}: note carries the date — "${got.note.match(/as of [^,]+/)[0]}"`);
      if (!/marked \* shows none/.test(got.note)) fail(`${s.label}: the note does not say a comparable shows no return`);
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
