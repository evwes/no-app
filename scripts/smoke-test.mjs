/* wampo — deploy smoke test. Boots the site exactly as a visitor would and
 * asserts the three plan archetypes render: a big full-form plan with filed
 * features, a master-trust plan whose lineup comes from the trust, and a
 * short-form filer (which must EXPLAIN its gaps, not just show dashes).
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
if (!fullPlan || !trustPlan || !sfPlan) fail("could not pick specimen plans from data");

const server = spawn("python3", ["-m", "http.server", String(PORT)], { stdio: "ignore" });
try {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  page.on("pageerror", (e) => fail("page JS error: " + e.message));

  const openPlan = async (r, label) => {
    await page.goto(`http://localhost:${PORT}/#plan=${encodeURIComponent(id(r))}`);
    await page.waitForFunction(() => /\d{4,}/.test((document.getElementById("statPlans") || {}).textContent?.replace(/,/g, "") || ""), { timeout: 45000 });
    await page.waitForTimeout(2500);
    const txt = await page.evaluate(() => (document.querySelector(".detail-clamp") || {}).innerText || "");
    if (!txt) fail(`${label}: report did not render (id ${id(r)})`);
    if (/\bundefined\b|\bNaN\b|\[object /.test(txt)) fail(`${label}: leaked undefined/NaN into the page`);
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

  await browser.close();
  console.log("SMOKE OK — full-form, master-trust, and short-form pages all render honestly");
} finally {
  server.kill();
}
