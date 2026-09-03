// Map view check: it draws, it counts, it responds to a filter, and it never
// claims to place a plan it could not place.
import { chromium } from "playwright";
import { spawn } from "node:child_process";


// The sandbox's headless Chromium stops animation frames ~1s after load unless
// the page keeps receiving input, and waitForFunction polls on those frames —
// so it hangs while the page underneath is perfectly healthy. Poll manually,
// nudging the page between checks.
async function until(page, fn, label, tries = 40) {
  for (let i = 0; i < tries; i++) {
    await page.mouse.move(400 + (i % 5), 300);
    await page.waitForTimeout(1500);
    if (await page.evaluate(fn)) return;
  }
  throw new Error("timed out waiting for " + label);
}

// a failure that names its own cause, before the browser work starts
async function die(msg) { console.log("\nMAP TEST FAILED:\n  " + msg); process.exit(1); }

const srv = spawn("python3", ["-m", "http.server", "8899"], { cwd: "/home/user/no-app", stdio: "ignore" });
await new Promise((r) => setTimeout(r, 2500));

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH });
const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
page.setDefaultTimeout(90000);
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
// python's http.server resets a connection under parallel fetches; that is a
// harness artifact, not a page defect, and must not mask real errors
page.on("console", (m) => { if (m.type() === "error" && !/ERR_CONNECTION_RESET|favicon/.test(m.text())) errors.push(m.text()); });

await page.goto("http://localhost:8899/index.html", { waitUntil: "domcontentloaded" });
await page.mouse.click(700, 300);              // the sandbox freezes an untouched page
await until(page, () => document.querySelectorAll("#tbody tr").length > 0, "the plans table");

/* Checked BEFORE waiting for dots, on purpose. map-points.json is POSITIONAL
 * against the boot payload; a stale one makes the page refuse to draw, and if
 * that surfaced only as "timed out waiting for map clusters" the next person
 * would hunt a rendering bug instead of a stale file. Name the real cause. */
const align = await page.evaluate(async () => {
  const pts = await fetch("map-points.json").then((r) => r.json());
  const list = await fetch("plans-list.json").then((r) => r.json());
  const boot = (list.ein || list.cols?.ein || []).length;
  return { universe: pts.universe, rows: pts.rows.length, boot };
});
console.log(`alignment: fingerprint ${align.universe}, rows ${align.rows}, boot payload ${align.boot}`);
if (align.universe == null)
  die("map-points.json carries no `universe` fingerprint — a stale file could not be detected");
if (align.universe !== align.boot)
  die(`STALE map-points.json: aligned to ${align.universe} plans, site boots ${align.boot}. `
    + `Regenerate with: node scripts/build-map-points.mjs`);
if (align.rows !== align.boot)
  die(`map-points.json has ${align.rows} rows for a ${align.boot}-plan universe`);

await page.click("#viewMap");
await until(page, () => document.querySelectorAll("#mapSvg .map-dot").length > 0, "map clusters");

const read = () => page.evaluate(() => ({
  dots: document.querySelectorAll("#mapSvg .map-dot").length,
  states: document.querySelectorAll("#mapSvg .map-state").length,
  plans: document.querySelector("#mapStats strong")?.textContent,
  stats: [...document.querySelectorAll("#mapStats strong")].map((e) => e.textContent),
  note: document.querySelector("#mapNote")?.textContent || "",
  legend: document.querySelectorAll("#mapLegend .legend-item").length,
}));

const fail0 = [];   // orientation findings, merged into `fail` below
const before = await read();
console.log("unfiltered:", JSON.stringify(before, null, 1));

/* ORIENTATION. The map shipped upside down — Maine at the bottom, Florida at
 * the top — because the textbook Albers y increases NORTH while SVG's y
 * increases DOWN. Every existing check passed: the outlines and the dots were
 * flipped together, so they agreed with each other and only disagreed with the
 * country. Alignment tests cannot catch that; only an absolute fact about the
 * world can. Maine is north of Florida, so it must be drawn above it. */
const orient = await page.evaluate(() => {
  const named = {};
  for (const p of document.querySelectorAll("#mapSvg .map-state")) {
    const t = p.querySelector("title")?.textContent;
    if (!t) continue;
    /* getBBox() returns an SVGRect, which does NOT survive serialization out of
     * the page — it arrives as {} and every field reads undefined, so the
     * comparison became NaN >= NaN, which is false, and the check silently
     * passed on an upside-down map. Caught by running the negative control.
     * Copy the numbers out explicitly. */
    const b = p.getBBox();
    named[t] = { y: b.y, height: b.height };
  }
  return { maine: named.Maine, florida: named.Florida, texas: named.Texas, minnesota: named.Minnesota,
           names: Object.keys(named).length };
});
if (!orient.names) fail0.push("no named state outlines found — orientation could not be checked");
if (!orient.maine || !orient.florida) {
  fail0.push("could not find Maine and Florida outlines to check orientation");
} else {
  const mid = (b) => b.y + b.height / 2;
  if (mid(orient.maine) >= mid(orient.florida))
    fail0.push(`MAP IS UPSIDE DOWN: Maine centre y=${mid(orient.maine).toFixed(0)} is not above Florida y=${mid(orient.florida).toFixed(0)}`);
  if (orient.texas && orient.minnesota && mid(orient.minnesota) >= mid(orient.texas))
    fail0.push(`MAP IS UPSIDE DOWN: Minnesota y=${mid(orient.minnesota).toFixed(0)} is not above Texas y=${mid(orient.texas).toFixed(0)}`);
}

// a filter must move the map, and it must move it DOWN
await page.evaluate(() => document.querySelector('.chip[data-filter="brokerage"]')?.click());
await page.waitForTimeout(2500);
const after = await read();
console.log("brokerage filter:", JSON.stringify({ dots: after.dots, plans: after.plans }, null, 1));

const num = (s) => Number(String(s || "").replace(/[^0-9.]/g, ""));
const fail = [...fail0];
if (before.states < 40) fail.push(`only ${before.states} state outlines drawn`);
if (before.dots < 50) fail.push(`only ${before.dots} clusters drawn`);
if (before.legend !== 4) fail.push(`legend has ${before.legend} bands, expected 4`);
if (!/FILED FROM/.test(before.note)) fail.push("the filed-from caveat is missing");
if (!/Short-form filers are excluded/.test(before.note)) fail.push("the short-form exclusion is not stated");
if (!(num(after.plans) < num(before.plans))) fail.push(`filter did not reduce the plan count (${before.plans} -> ${after.plans})`);
if (before.stats.some((s) => /NaN|undefined/.test(s))) fail.push("a stat rendered NaN/undefined: " + before.stats.join(" "));
// a zero total is not a crash, so NaN checks miss it — and $0 across 67k plans
// is exactly what a wrong field name produces (assetsEOY vs assetsB)
if (before.stats.slice(1).some((s) => /^\$?0$/.test(String(s).trim()))) fail.push("a total rendered as zero: " + before.stats.join(" | "));
if (errors.length) fail.push("page errors: " + errors.slice(0, 3).join(" | "));


await page.screenshot({ path: "/tmp/map.png" });
await browser.close();
srv.kill();

if (fail.length) { console.log("\nMAP TEST FAILED:\n  " + fail.join("\n  ")); process.exit(1); }
console.log("\nMAP OK — outlines, clusters, live filtering, honest caveats, no NaN");
