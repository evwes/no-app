#!/usr/bin/env node
/* THE STATE FILTER — does the dropdown narrow, and does it agree with the
 * TYPED path? Two ways to set one filter must give one answer.
 *
 * WITNESS THE COUNT, NOT THE ROWS. The table renders at most MAX_ROWS (150),
 * so `tbody tr` reads 150 before and after any filter that leaves more than
 * 150 plans standing, and a row-count assertion reports FAIL on a filter that
 * is working perfectly. `#resultCount` carries the true filtered total, which
 * is the only element that can tell narrowing from capping.
 *
 * Run: CHROMIUM_PATH=/opt/pw-browsers/chromium-*\/chrome-linux*\/chrome \
 *        node scripts/state-filter-test.mjs
 */
import { chromium } from "playwright";
import { spawn } from "node:child_process";

const PORT = 8098;
const srv = spawn("python3", ["-m", "http.server", String(PORT)], {
  cwd: new URL("..", import.meta.url).pathname, stdio: "ignore",
});
await new Promise((r) => setTimeout(r, 1500));

let fail = 0;
const bad = (m) => { console.log("FAIL " + m); fail++; };
const ok = (m) => console.log("ok   " + m);
const browser = await chromium.launch(
  process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const pg = await browser.newPage();
pg.on("pageerror", (e) => bad("page JS error: " + e.message));

/* `#resultCount` reads "N of M plans · showing top 150" — N is the filtered
 * total and is what every assertion below is keyed on. */
const total = async () => {
  const t = await pg.$eval("#resultCount", (e) => e.textContent);
  const m = /^([\d,]+) of/.exec(t.trim());
  if (!m) throw new Error("could not read #resultCount: " + t);
  return +m[1].replace(/,/g, "");
};

try {
  await pg.goto(`http://localhost:${PORT}/index.html`, { waitUntil: "domcontentloaded" });
  /* the sandbox's headless Chromium freezes ~1s after load absent user
   * activation; one synthetic click unfreezes it */
  await pg.mouse.click(5, 5);
  await pg.waitForFunction(() => document.querySelectorAll("#stateFilter option").length > 10,
    { timeout: 60000 });

  const opts = await pg.$$eval("#stateFilter option", (os) => os.map((o) => [o.value, o.textContent]));
  if (opts.length < 40) bad(`only ${opts.length} state options`);
  else ok(`${opts.length} options, built from the data`);

  /* every value is a LOWERCASE two-letter code — the file's one convention for
   * a state code, shared with stateFromQuery. A capitalised value would filter
   * nothing, because the comparison lowercases the plan's side only. */
  const wrong = opts.filter(([v]) => v && !/^[a-z]{2}$/.test(v));
  if (wrong.length) bad(`non-lowercase-code values: ${JSON.stringify(wrong.slice(0, 3))}`);
  else ok("every option value is a lowercase two-letter code");

  /* a NAMED label, not bare letters. This is the regression that a map indexed
   * in the wrong direction would cause, and it is silent in every other way. */
  const tx = opts.find(([v]) => v === "tx");
  if (!tx) bad("no Texas option");
  else if (!/Texas/.test(tx[1])) bad(`Texas label fell back to bare letters: ${tx[1]}`);
  else ok(`labels name the state: ${tx[1].trim()}`);

  const all = await total();

  // A. the DROPDOWN narrows
  await pg.selectOption("#stateFilter", "tx");
  await pg.waitForTimeout(900);
  const viaDropdown = await total();
  if (!(viaDropdown > 0 && viaDropdown < all)) bad(`dropdown did not narrow: ${all} -> ${viaDropdown}`);
  else ok(`dropdown narrows ${all.toLocaleString()} -> ${viaDropdown.toLocaleString()}`);

  // the hero scope must SAY which state, or the totals above are unlabelled
  const scope = await pg.$eval("#heroScope", (e) => e.textContent.trim()).catch(() => "");
  if (!/Texas/.test(scope)) bad(`hero scope does not name the state: ${JSON.stringify(scope)}`);
  else ok(`hero scope reads ${JSON.stringify(scope)}`);

  // B. the TYPED path must agree exactly
  await pg.selectOption("#stateFilter", "");
  await pg.fill("#search", "texas");
  await pg.waitForTimeout(900);
  const viaTyped = await total();
  if (viaTyped !== viaDropdown) bad(`dropdown and typed disagree: ${viaDropdown} vs ${viaTyped}`);
  else ok(`dropdown and typed agree exactly (${viaTyped.toLocaleString()})`);

  // C. they COMPOSE as an AND rather than one overriding the other
  await pg.selectOption("#stateFilter", "ca");
  await pg.waitForTimeout(900);
  const conflict = await total();
  if (conflict !== 0) bad(`typed Texas + dropdown California should be empty, got ${conflict}`);
  else ok("typed and dropdown compose as an AND");

  // D. clearing both restores the universe — a filter that cannot be undone is a trap
  await pg.selectOption("#stateFilter", "");
  await pg.fill("#search", "");
  await pg.waitForTimeout(900);
  const restored = await total();
  if (restored !== all) bad(`clearing did not restore: ${all} -> ${restored}`);
  else ok(`clearing restores ${restored.toLocaleString()}`);
} catch (e) {
  bad("threw: " + e.message);
} finally {
  await browser.close();
  srv.kill();
}

console.log(fail ? `STATE FILTER FAILED (${fail})` : "STATE FILTER OK — narrows, labels, agrees with the typed path, composes and clears");
process.exit(fail ? 1 : 0);
