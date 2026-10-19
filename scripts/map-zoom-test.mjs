/* wampo — THE MAP'S MARKS, ITS PAN AND ITS DOT CARD. 2026-10-19.
 *
 * Three defects the owner reported, each with a mechanism the page can be
 * asked about directly rather than inspected by eye:
 *
 *   1. ZOOM MAGNIFIED THE MARKS. A circle's `r` is a length in VIEWBOX units
 *      and the viewBox shrinks as you zoom, so a constant `r` is drawn LARGER
 *      on screen the further in you go — the opposite of what zoom is for.
 *      The test measures the radius IN SCREEN PIXELS (`getBoundingClientRect`
 *      on the circle, which resolves the whole viewBox transform for us) and
 *      requires that zooming never grows it.
 *
 *   2. PAN WAS DEAD AFTER ONE FRAME. `pointermove` re-rendered, replacing the
 *      canvas's innerHTML and destroying the <svg> that held the pointer
 *      capture, so the second move went to a detached node. A test that drags
 *      ONCE cannot see this — the first move always landed — so this one
 *      drags in SEVERAL steps and requires the view to keep moving, and to
 *      move on BOTH axes.
 *
 *   3. A DOT SAID NOTHING ABOUT ITS PLAN. Clicking a small dot now prints a
 *      card with the company, the provider, the participants and the average
 *      balance; the test requires all four labels and a non-empty company.
 *
 * Run: node scripts/map-zoom-test.mjs    (serves the repo, drives Chromium)
 * It is deliberately separate from map-test.mjs, which owns the data-alignment
 * and selection contract; this one owns the VIEW. */
import { spawn } from "node:child_process";
import { chromium } from "playwright";

const ROOT = new URL("..", import.meta.url).pathname.replace(/\/$/, "");
const PORT = 8109 + (process.pid % 300);
const fail = [];

const server = spawn("python3", ["-m", "http.server", String(PORT), "--bind", "127.0.0.1"],
  { cwd: ROOT, stdio: "ignore" });
const stop = () => { try { server.kill(); } catch { /* already gone */ } };
process.on("exit", stop);

const until = async (page, fn, what, ms = 40000) => {
  const t0 = Date.now();
  for (;;) {
    if (await page.evaluate(fn)) return;
    if (Date.now() - t0 > ms) throw new Error(`timed out waiting for ${what}`);
    await page.waitForTimeout(150);
  }
};

await new Promise((r) => setTimeout(r, 2500));   // the server needs a moment before the first request
/* CHROMIUM_PATH is set in the sandbox and unset in CI, where Playwright's own
 * download is used — the same guard smoke-test.mjs and map-test.mjs use. */
const browser = await chromium.launch(
  process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await page.goto(`http://127.0.0.1:${PORT}/index.html`, { waitUntil: "domcontentloaded" });
  /* the sandbox's headless Chromium freezes an untouched page ~1s after load —
   * timers stop and in-flight response bodies never deliver. One real click
   * unfreezes it. CLAUDE.md records this trap; without it the boot fetch for
   * plans-list.json never resolves and every assertion below reads empty. */
  await page.mouse.click(640, 300);
  await until(page, () => document.querySelectorAll("#tbody tr").length > 0, "the table to boot");
  await page.click("#viewMap");
  await until(page, () => document.querySelectorAll("#mapSvg .map-dot").length > 0, "map clusters");

  /* ---- 1. zooming must not grow a mark on screen ---------------------- */
  const screenR = () => page.evaluate(() => {
    const c = document.querySelector("#mapSvg .map-dot circle");
    if (!c) return null;
    const b = c.getBoundingClientRect();
    const vb = document.querySelector("#mapSvg").getAttribute("viewBox");
    return { r: b.width / 2, vbW: +vb.split(/\s+/)[2] };
  });
  const z1 = await screenR();
  if (!z1) fail.push("no dot to measure");
  for (let i = 0; i < 3; i++) await page.click("#mapIn");
  const z2 = await screenR();
  if (z1 && z2) {
    if (!(z2.vbW < z1.vbW * 0.9)) fail.push(`zoom-in did not narrow the viewBox (${z1.vbW} -> ${z2.vbW})`);
    /* the real defect: the mark grew. A small tolerance absorbs the fact that
     * zooming re-clusters, so the biggest group at zoom 4 is not the biggest
     * group at zoom 1 — it must never be BIGGER, and in practice it shrinks. */
    if (!(z2.r <= z1.r * 1.05)) fail.push(`zooming in GREW the dot on screen: ${z1.r.toFixed(1)}px -> ${z2.r.toFixed(1)}px`);
    /* and the count label must shrink with it, or it overflows its circle */
    const fs = await page.evaluate(() => {
      const t = document.querySelector("#mapSvg .map-count");
      return t ? parseFloat(getComputedStyle(t).fontSize) : null;
    });
    if (fs != null && !(fs < 10)) fail.push(`the count label did not shrink with zoom (font-size ${fs})`);
  }

  /* ---- 2. pan must keep moving, on both axes -------------------------- */
  const vbXY = () => page.evaluate(() => {
    const p = document.querySelector("#mapSvg").getAttribute("viewBox").split(/\s+/).map(Number);
    return { x: p[0], y: p[1] };
  });
  const box = await page.evaluate(() => {
    const b = document.querySelector("#mapSvg").getBoundingClientRect();
    return { x: b.x, y: b.y, w: b.width, h: b.height };
  });
  const cx = box.x + box.w / 2, cy = box.y + box.h / 2;
  const before = await vbXY();
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  const seen = [];
  /* SEVERAL steps, because the bug let exactly the first one through */
  for (const [dx, dy] of [[-40, -30], [-80, -60], [-120, -90]]) {
    await page.mouse.move(cx + dx, cy + dy, { steps: 2 });
    await page.waitForTimeout(40);
    seen.push(await vbXY());
  }
  await page.mouse.up();
  const after = await vbXY();
  if (!(Math.abs(after.x - before.x) > 1)) fail.push(`dragging did not pan east/west (viewBox x ${before.x} -> ${after.x})`);
  if (!(Math.abs(after.y - before.y) > 1)) fail.push(`dragging did not pan north/south (viewBox y ${before.y} -> ${after.y})`);
  /* the discriminating one: the LAST move must have moved it too */
  if (seen.length === 3 && !(Math.abs(seen[2].x - seen[0].x) > 1 || Math.abs(seen[2].y - seen[0].y) > 1))
    fail.push("pan stopped after the first move — the svg is being destroyed mid-drag");
  /* a drag must still not count as a click */
  if (await page.evaluate(() => !document.getElementById("tableSection").hidden))
    fail.push("a drag opened the table");

  /* ---- 3. a small dot prints its own card ----------------------------- */
  const small = await page.evaluate(() => {
    /* Pick a dot the card is meant to answer for, and pick it by the thing
     * that DEFINES it rather than by its position in the DOM: a single-plan
     * dot's <title> opens with the company name, a cluster's with "N plans".
     * It must also sit well inside the visible frame, because a circle whose
     * centre is clipped cannot be clicked where its rect says it is — the
     * first version of this test picked the last dot in document order and
     * hit something else entirely. */
    const svg = document.querySelector("#mapSvg").getBoundingClientRect();
    const cands = [...document.querySelectorAll("#mapSvg .map-dot")].map((d) => {
      const t = (d.querySelector("title")?.textContent || "").trim();
      const b = d.querySelector("circle").getBoundingClientRect();
      return { single: !/^[\d,]+ plans/.test(t), title: t, x: b.x + b.width / 2, y: b.y + b.height / 2, r: b.width / 2 };
    }).filter((c) => c.single && c.r > 0
      && c.x - c.r > svg.x + 4 && c.x + c.r < svg.x + svg.width - 4
      && c.y - c.r > svg.y + 4 && c.y + c.r < svg.y + svg.height - 4);
    if (!cands.length) return null;
    /* the biggest such dot is the easiest to aim at, and overlapping marks are
     * painted in group order, so a larger one is never hidden behind a smaller */
    cands.sort((a, b) => b.r - a.r);
    return cands[0];
  });
  if (!small) fail.push("no single-plan dot found for the card");
  else {
    console.log(`picked: ${JSON.stringify(small.title)} r=${small.r.toFixed(1)}px`);
    await page.mouse.click(small.x, small.y);
    await page.waitForTimeout(150);
    const card = await page.evaluate(() => {
      const box = document.getElementById("mapInfo");
      if (!box || box.hidden) return null;
      return {
        name: (box.querySelector(".map-info-name")?.textContent || "").trim(),
        labels: [...box.querySelectorAll("dt")].map((d) => d.textContent.trim()),
        values: [...box.querySelectorAll("dd")].map((d) => d.textContent.trim()),
        openBtn: !!document.getElementById("mapInfoTable"),
        stillOnMap: !document.getElementById("mapSection").hidden,
      };
    });
    if (!card) fail.push("clicking a small dot showed no card");
    else {
      if (!card.name) fail.push("the card names no company");
      for (const want of ["Provider", "Participants", "Avg balance"])
        if (!card.labels.includes(want)) fail.push(`the card is missing the "${want}" field`);
      if (card.values.some((v) => !v)) fail.push("the card printed an empty value cell");
      if (!card.openBtn) fail.push("the card offers no way into the table");
      if (!card.stillOnMap) fail.push("clicking a small dot left the map");
      console.log(`card: ${JSON.stringify(card.name)} · ${card.labels.join(" / ")} · ${card.values.join(" / ")}`);
    }
    /* and it must close */
    await page.evaluate(() => document.getElementById("mapInfoClose")?.click());
    if (await page.evaluate(() => !document.getElementById("mapInfo").hidden))
      fail.push("the card would not close");
  }

  console.log(`zoom: dot ${z1 ? z1.r.toFixed(1) : "?"}px -> ${z2 ? z2.r.toFixed(1) : "?"}px on screen, viewBox ${z1 ? z1.vbW : "?"} -> ${z2 ? z2.vbW : "?"}`);
  console.log(`pan: viewBox (${before.x}, ${before.y}) -> (${after.x}, ${after.y})`);
} finally {
  await browser.close();
  stop();
}

if (fail.length) {
  console.error("\nMAP VIEW TEST FAILED:");
  for (const f of fail) console.error("  " + f);
  process.exit(1);
}
console.log("\nMAP VIEW OK — zoom shrinks the marks, drag pans both axes, a dot names its plan");
