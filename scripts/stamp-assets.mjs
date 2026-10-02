#!/usr/bin/env node
/* THE CACHE BUSTER WAS HAND-MAINTAINED AND WENT SEVENTEEN DAYS STALE, WHICH IS
 * AS GOOD AS NOT HAVING ONE — 2026-10-02.
 *
 * `index.html` pins its assets with a query string: `app.js?v=20260916b`,
 * `fund-er.js?v=20260915a`, `styles.css?v=20260915a`, `data.js?v=20260915a`.
 * Those strings are typed by hand, and on 2026-10-02 every one of the four was
 * behind: app.js and fund-er.js had both changed THAT DAY and styles.css and
 * data.js on 2026-09-27, while the URLs a browser sees had not moved since
 * 2026-09-15/16. A returning visitor asks for the same URL it already has, so
 * seventeen days of display-side work — every fee withdrawn, every ticker
 * corrected, the whole Vanguard target-date family — could be invisible to the
 * people it was shipped for while every Pages deployment reported success.
 *
 * THE OWNER REPORTED IT AS "nothing is updated in wampo ... no reason for the
 * old version to still be live", and the deploy chain was verified healthy at
 * the same moment: `pages-build-deployment` built and published every mirror
 * within about two minutes. A green deploy says the FILES are published; it
 * says nothing about whether a browser will ask for them.
 *
 * SO THE STAMP IS DERIVED, NOT TYPED: the first 8 hex of each asset's own
 * sha256. It cannot go stale, because changing the file changes the URL by
 * construction — the same reason this project derives a vocabulary from its own
 * source rather than listing it, and the same reason a harness slices a shipped
 * function rather than restating it.
 *
 * AND IT IS GATED, because deriving it only helps if it is actually re-run:
 * `--check` exits 1 and names every stale asset, and `site-test` runs it. A
 * frontend change pushed with a stale stamp now fails CI instead of shipping
 * invisibly.
 *
 * THE ASSET LIST IS READ OUT OF index.html, not typed here, so a new script or
 * stylesheet added to the page is covered the day it is added. Only
 * same-origin, non-absolute references are touched: the Google Fonts link and
 * the inline SVG favicon must be left exactly alone.
 *
 * NOT TOUCHED, deliberately: `plans-list.json`, `plans-index.json` and the
 * other data files, which are fetched by app.js rather than referenced here and
 * are rewritten by the pipeline on a cadence of their own. Stamping those needs
 * app.js to pass the stamp through, which is a separate change; the crawlable
 * `p/*.html` pages need nothing, because they are standalone and load neither
 * app.js nor fund-er.js (verified: 0 of them reference either).
 *
 * Usage:  node scripts/stamp-assets.mjs           rewrite index.html in place
 *         node scripts/stamp-assets.mjs --check   exit 1 if any stamp is stale
 */
import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

/* Resolve the repo from THIS file, never from cwd: a hardcoded sandbox path in
 * map-test.mjs once made Node report `spawn python3 ENOENT` on the runner and
 * sent the first reading of that failure at the runner image. */
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PAGE = path.join(ROOT, "index.html");
const check = process.argv.includes("--check");

const src = readFileSync(PAGE, "utf8");

/* The asset list comes from the page itself. A reference qualifies when it is
 * same-origin (no scheme, no leading slash) and names a file we can hash. */
const REF = /\b(?:src|href)="([A-Za-z0-9._\-/]+\.(?:js|css))(\?v=[A-Za-z0-9._-]*)?"/g;
const found = [];
for (const m of src.matchAll(REF)) found.push({ file: m[1], had: m[2] || "", whole: m[0] });

if (!found.length) {
  console.error("stamp-assets: index.html references no same-origin js/css — the matcher moved, refusing to guess");
  process.exit(1);
}

const hashOf = (f) =>
  createHash("sha256").update(readFileSync(path.join(ROOT, f))).digest("hex").slice(0, 8);

let out = src;
const stale = [];
for (const r of found) {
  const want = `?v=${hashOf(r.file)}`;
  if (r.had === want) continue;
  stale.push(`${r.file}: ${r.had || "(no stamp)"} -> ${want}`);
  const next = r.whole.replace(`"${r.file}${r.had}"`, `"${r.file}${want}"`);
  if (next === r.whole) {
    console.error(`stamp-assets: could not rewrite ${r.file} — refusing to write a partial page`);
    process.exit(1);
  }
  out = out.replace(r.whole, next);
}

console.log(`stamp-assets: ${found.length} same-origin asset(s) referenced by index.html`);
for (const r of found) console.log(`  ${r.file}  ${r.had || "(no stamp)"}`);

if (!stale.length) { console.log("stamp-assets: every stamp matches its asset's content hash"); process.exit(0); }

if (check) {
  console.error(`\nstamp-assets: ${stale.length} STALE stamp(s) — a returning browser will keep serving the cached copy:`);
  for (const s of stale) console.error(`  ${s}`);
  console.error(`\nRun \`node scripts/stamp-assets.mjs\` and commit index.html.`);
  process.exit(1);
}

writeFileSync(PAGE, out);
console.log(`\nstamp-assets: rewrote ${stale.length} stamp(s) in index.html:`);
for (const s of stale) console.log(`  ${s}`);
