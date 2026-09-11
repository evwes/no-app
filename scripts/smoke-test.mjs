/* wampo — deploy smoke test. Boots the site exactly as a visitor would and
 * asserts the four plan archetypes render: a big full-form plan with filed
 * features, a master-trust plan whose lineup comes from the trust, a
 * short-form filer (which must EXPLAIN its gaps, not just show dashes), and a
 * FILED-IN-AGGREGATE plan whose own filing reports investments in one line
 * (MetLife's class) — that page must say so rather than leave a blank a
 * reader would take for "nothing was filed".
 * Specimen plans are picked from the shipped data at runtime so the test
 * never goes stale as filings roll over. Run: node scripts/smoke-test.mjs
 * (requires playwright; serves the repo root on :8901). */
import { readFileSync } from "fs";
import { spawn } from "child_process";
import { chromium } from "playwright";

const PORT = 8901;
const fail = (msg) => { console.error("SMOKE FAIL: " + msg); process.exit(1); };

// pick specimens from the data
const d = JSON.parse(readFileSync("plans-all.json", "utf8"));
const F = d.fields; const ix = Object.fromEntries(F.map((f, i) => [f, i]));
const g = (r, f) => r[ix[f]];
const idx = JSON.parse(readFileSync("lineups-index.json", "utf8")).plans;
const dash = (ein) => String(ein).slice(0, 2) + "-" + String(ein).slice(2);
const id = (r) => `${dash(g(r, "ein"))}|${g(r, "pn")}|${g(r, "ticker") || ""}`;

const byAssets = [...d.plans].sort((a, b) => (g(b, "assetsEOY") || 0) - (g(a, "assetsEOY") || 0));
const fullPlan = byAssets.find((r) => !g(r, "sf") && ((idx[g(r, "ack")] || 0) & 5) === 5);
const trustPlan = byAssets.find((r) => !g(r, "sf") && g(r, "mtiaAck") && ((idx[g(r, "mtiaAck")] || 0) & 1) && !((idx[g(r, "ack")] || 0) & 1));
const sfPlan = byAssets.find((r) => g(r, "sf"));
/* plans-index.json is ROW-aligned to plans-all, unlike the ack-keyed
 * lineups-index the three picks above use. Bit 4096 = the filing reports
 * investments in aggregate (dx=stmt). */
const bootBits = JSON.parse(readFileSync("plans-index.json", "utf8")).bits;
if (bootBits.length !== d.plans.length)
  fail(`plans-index.json is not row-aligned to plans-all (${bootBits.length} vs ${d.plans.length})`);
const rowOf = new Map(d.plans.map((r, i) => [r, i]));
const aggPlan = byAssets.find((r) =>
  !g(r, "sf") && ((bootBits[rowOf.get(r)] || 0) & 4096) && (g(r, "assetsEOY") || 0) > 0);
if (!fullPlan || !trustPlan || !sfPlan) fail("could not pick specimen plans from data");
if (!aggPlan) fail("could not pick a filed-in-aggregate specimen — no live plan carries bit 4096");
/* bit 65536: the plan's own rows say its money is an interest in a master
 * trust we could not link. Six plans, 75,808 participants - small, but they
 * were being told something false about their filing, so the page they get
 * instead has to be checked. */
/* TWO populations carry 65536 and they get DIFFERENT endings, so pick one of
 * each. Testing only the larger would leave the other wording unexercised -
 * and the larger one flipped from unlinked to linked the moment bit 131072
 * shipped, which is exactly how a specimen silently stops covering a case. */
const trustUnlinkedPlan = byAssets.find((r) =>
  !g(r, "sf") && ((bootBits[rowOf.get(r)] || 0) & 65536) && !((bootBits[rowOf.get(r)] || 0) & 131072));
const trustOpaquePlan = byAssets.find((r) =>
  !g(r, "sf") && ((bootBits[rowOf.get(r)] || 0) & 131072));
if (!trustUnlinkedPlan) fail("could not pick a trust-held-but-UNLINKED specimen — no live plan carries 65536 without 131072");
if (!trustOpaquePlan) fail("could not pick a trust-linked-but-OPAQUE specimen — no live plan carries bit 131072");

const server = spawn("python3", ["-m", "http.server", String(PORT)], { stdio: "ignore" });
try {
  // CHROMIUM_PATH: run against a system chromium when the pinned Playwright
  // version's own browser download isn't present (e.g. the CCR sandbox)
  const browser = await chromium.launch(
    process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
  const page = await browser.newPage();
  page.on("pageerror", (e) => fail("page JS error: " + e.message));

  const openPlan = async (r, label) => {
    await page.goto(`http://localhost:${PORT}/#plan=${encodeURIComponent(id(r))}`);
    await page.waitForFunction(() => /\d{4,}/.test((document.getElementById("statPlans") || {}).textContent?.replace(/,/g, "") || ""), { timeout: 45000 });
    // imitate a real visitor: some headless environments (CCR sandbox) freeze
    // the renderer ~1s after load absent user activation — timers stop and
    // in-flight response bodies never reach page JS, so on-demand shard
    // fetches stall forever without this
    await page.mouse.click(2, 2);
    await page.waitForTimeout(2500);
    const txt = await page.evaluate(() => (document.querySelector(".detail-clamp") || {}).innerText || "");
    if (!txt) fail(`${label}: report did not render (id ${id(r)})`);
    if (/\bundefined\b|\bNaN\b|\[object /.test(txt)) fail(`${label}: leaked undefined/NaN into the page`);
    // the on-demand fee fetch must have settled — a stuck placeholder means
    // the async data-layer rebuild orphaned the fetch (deep-link race)
    if (txt.includes("Loading the provider fee table")) fail(`${label}: fee table never resolved (deep-link race)`);
    if (!txt.includes("PLAN FEATURES")) fail(`${label}: features panel missing`);
    if (!txt.includes("ESPP")) fail(`${label}: ESPP status row missing`);
    return txt;
  };

  const t1 = await openPlan(fullPlan, "full-form");
  if (!/FORM 5500 AUDIT NOTES|FUND HOLDINGS|INVESTMENT OPTIONS/.test(t1)) fail("full-form: no filed content section rendered");

  const t2 = await openPlan(trustPlan, "master-trust");
  if (!/trust/i.test(t2)) fail("master-trust: no trust-sourced content or explanation");

  const t3 = await openPlan(sfPlan, "short-form");
  if (!/short[- ]form|SHORT-FORM|doesn't collect|DOL/i.test(t3)) fail("short-form: page does not explain the SF gap");

  /* FILED IN AGGREGATE. The plan filed a schedule; it just reports one line
   * instead of a fund list. Suppressing the menu is right — publishing a
   * "participant-directed investments" row at 99.5% of the plan would be the
   * v105 dominant-row shape — but suppressing it SILENTLY would read as "no
   * schedule was filed", which is false and is the exact confusion the
   * standing rule forbids. */
  /* TRUST-HELD BUT UNLINKED. The filing is fine and we read it; the fund
   * detail is in the trust's separate return. The page must not blame this
   * filing, which is exactly what the document-shape sentence used to do. */
  const t5 = await openPlan(trustUnlinkedPlan, "trust-held-unlinked");
  if (!/interest in a master trust/i.test(t5))
    fail("trust-held-unlinked: page does not say the assets are an interest in a master trust");
  if (!/plan's own filing was read without trouble/i.test(t5.replace(/\s+/g, " ")))
    fail("trust-held-unlinked: page no longer clears the plan's own filing of the gap");
  if (/could not read it — that's our gap|pages are not present in the public copy/i.test(t5))
    fail("trust-held-unlinked: the false document-shape sentence is still being rendered");
  if (!/we could not match this plan to that return/i.test(t5.replace(/\s+/g, " ")))
    fail("trust-held-unlinked: page does not say we failed to MATCH the plan to a trust return");

  /* LINKED but the trust's own return is opaque. The page must NOT say we
   * failed to match a trust we did match - that would be a second false
   * claim replacing the first. */
  const t6 = await openPlan(trustOpaquePlan, "trust-linked-opaque");
  if (!/interest in a master trust/i.test(t6))
    fail("trust-linked-opaque: page does not say the assets are an interest in a master trust");
  if (!/that return does not publish a fund-by-fund list we can read either/i.test(t6.replace(/\s+/g, " ")))
    fail("trust-linked-opaque: page does not say it is the TRUST's return that lacks a readable fund list");
  if (/we could not match this plan to that return/i.test(t6.replace(/\s+/g, " ")))
    fail("trust-linked-opaque: page claims we could not match a trust we DID match");

  const t4 = await openPlan(aggPlan, "filed-in-aggregate");
  if (!/in aggregate/i.test(t4))
    fail("filed-in-aggregate: page does not explain that the FILING reports investments in aggregate");
  if (!/That's how\s+the plan filed, not a gap in our reading of it/i.test(t4.replace(/\s+/g, " ")))
    fail("filed-in-aggregate: the explanation no longer distinguishes the filing's choice from our gap");

  /* The match-quote guard exists twice — scripts/lib-quote.mjs for the static
   * pages, a twin inside app.js for the interactive report — because one is a
   * module and the other is a plain browser script. It has already drifted
   * between two homes once, and the static pages published a false heading on
   * 615 pages for as long as it did. Run the BROWSER copy, in the real page,
   * against the same pinned filings the module's --selftest uses. */
  const cases = JSON.parse(readFileSync("docs/quote-guard-cases.json", "utf8")).cases;
  const verdicts = await page.evaluate((cs) => {
    if (typeof window.__wampoMatchQuoteOk !== "function") return null;
    return cs.map((c) => window.__wampoMatchQuoteOk(c.text, c.hasFormula));
  }, cases);
  if (!verdicts) fail("app.js no longer exposes __wampoMatchQuoteOk — the guard cannot be cross-checked");
  const drift = cases.map((c, i) => [c, verdicts[i]]).filter(([c, got]) => got !== c.expect);
  if (drift.length) {
    for (const [c, got] of drift) console.error(`  app.js guard: expected ${c.expect}, got ${got} — ${c.why}`);
    fail(`match-quote guard in app.js disagrees with docs/quote-guard-cases.json on ${drift.length} of ${cases.length} filings`);
  }

  /* Same drift protection for the coverage band: scripts/lib-disclose.mjs is
   * canonical, app.js carries a twin because it is a plain browser script.
   * Run the BROWSER copy against the module's own boundary cases. */
  const { coverageBand, frozenClaimOk } = await import("./lib-disclose.mjs");
  const frozCases = [
    [true, "The Plan was terminated effective December 31, 2023.", "Capital Region Medical"],
    [true, "As amended on December 31, 2024, the Plan was frozen and all participants of the Plan became fully vested.", "Hanes Companies, Inc."],
    [true, "As of December 31, 2024, the Hanes Retirement Plan was frozen.", "Leggett & Platt, Incorporated"],
    [true, "The Solar Energy World 401k plan was frozen to new contributions as of January 31, 2025.", "Comcast Corporation"],
    [true, "A participant will become 100 percent vested in the event the Company permanently discontinues contributions to the Plan.", "Honeywell International Inc"],
    [true, "As of January 1, 2025, the Plan was frozen, and employees became eligible to participate in the Cayuga Health 401(k).", "Cayuga Medical Associates"],
    [true, "", "Anyone"],
    [false, "The Plan was terminated effective July 31, 2024.", "Macatawa Bank"],
  ];
  const frozGot = await page.evaluate((cs) => {
    if (typeof window.__wampoFrozenClaimOk !== "function") return null;
    return cs.map(([f, t, sp]) => window.__wampoFrozenClaimOk(f, t, sp));
  }, frozCases);
  if (!frozGot) fail("app.js no longer exposes __wampoFrozenClaimOk — the frozen guard cannot be cross-checked");
  const frozDrift = frozCases.filter(([f, t, sp], i) => frozenClaimOk(f, t, sp) !== frozGot[i]);
  if (frozDrift.length) fail(`frozen guard in app.js disagrees with scripts/lib-disclose.mjs on ${frozDrift.length} of ${frozCases.length} cases`);

  const covCases = [[95, 100, false], [100, 100, false], [949, 1000, false], [950, 1000, false],
    [1050, 1000, false], [1051, 1000, false], [3491, 5291, false], [400, 1000, false],
    [1000, 1000, true], [0, 1000, false], [1000, 0, false]];
  const covGot = await page.evaluate((cs) => {
    if (typeof window.__wampoCoverageBand !== "function") return null;
    return cs.map(([t, a, tr]) => { const r = window.__wampoCoverageBand(t, a, tr); return r ? `${r.kind}:${r.severe}` : null; });
  }, covCases);
  if (!covGot) fail("app.js no longer exposes __wampoCoverageBand — the coverage band cannot be cross-checked");
  const covDrift = covCases.filter(([t, a, tr], i) => {
    const r = coverageBand(t, a, tr);
    return (r ? `${r.kind}:${r.severe}` : null) !== covGot[i];
  });
  if (covDrift.length) fail(`coverage band in app.js disagrees with scripts/lib-disclose.mjs on ${covDrift.length} of ${covCases.length} cases`);

  await browser.close();
  console.log("SMOKE OK — full-form, master-trust, short-form, filed-in-aggregate and both trust-held pages all render honestly");
} finally {
  server.kill();
}
