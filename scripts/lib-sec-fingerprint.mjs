/* wampo — THE FINGERPRINT OF THE CODE `sec-tickers.js` WAS GENERATED FROM.
 * 2026-10-11.
 *
 * WHAT WAS WRONG. `gen-sec-tickers.mjs` ships a `--check` mode and it was
 * wired into no workflow, so the committed table could sit beside code that
 * did not produce it. `stamp-assets.mjs --check` cannot see this: the stamp is
 * a hash of the ASSET'S OWN CONTENT, so a stale table ships with a perfectly
 * matching stamp. And the failure mode is SILENT — the table only ever fills a
 * blank, so a ship that moves a name simply withholds its own gains and
 * nothing reports it. Measured: the 2026-10-11 09:5xZ regeneration absorbed 66
 * gain rows / 18 acks / 9,224 participants / $71,696,270 of drift from FIVE
 * earlier ships that had each moved a name without regenerating.
 *
 * WHY `--check` CANNOT BE THAT GATE, and this is the measurement that chose
 * this file's shape. `--check` compares the ASSET BYTES, and the asset's header
 * interpolates `sec-funds.json`'s row count AND four figures derived from the
 * lineup store (rows, plans, participants, comparable plans). So it conflates
 * three independent inputs and reddens when the SEC registry grows or when the
 * hourly pipeline commits one more filing — with no defect present. This
 * project's record is explicit that a gate which reddens when nothing is wrong
 * is worse than no gate: ten consecutive red `site-test` runs are how a real
 * failure became invisible for three days.
 *
 * SO THE GATE IS KEYED ON OUR CODE ALONE, and that is what makes it CI-SAFE BY
 * CONSTRUCTION rather than by promise: `sec-funds.json` and the lineup store
 * are NOT read here, so a registry refresh cannot move this value. The test
 * asserts that by perturbing a copy of each and requiring the fingerprint to
 * hold.
 *
 * THE app.js SURFACE IS THE SLICE, NOT THE FILE. app.js is 5,348 lines and the
 * region the table depends on is `apppath.mjs`'s own slice — the IIFE prologue
 * through `__wampoLookupTicker`, three named constants and the per-row block of
 * `filedLineupTable`. Hashing the whole file would redden on a template, a
 * formatter or a map edit that cannot move a key; hand-listing the resolver's
 * line ranges would be an EIGHTH transcription of a shipped expression, and
 * this record carries seven, every one of which produced a wrong published
 * figure. So the surface is asked of `composeSource`, which is the same string
 * the generator itself evaluates. Measured over the 70 commits from 2026-10-10
 * 11:15 to 2026-10-11 19:18: the fingerprint holds across 57 of them (every
 * data commit, every docs commit) and moves on exactly the 12 name/resolver
 * ships.
 *
 * `lib-disclose.mjs` IS DELIBERATELY ABSENT, and that is a finding rather than
 * an omission. CLAUDE.md names it as one of five files that can stale the
 * table; it is not an input. Neither `gen-sec-tickers.mjs` nor `apppath.mjs`
 * imports it — the generator reads app.js's own GENERATED TWIN of those
 * suppressors, which is inside the slice. So a `cleanFiledName` change stales
 * the table only once it reaches the twin, which is exactly when the slice
 * moves and this value changes. Hashing lib-disclose as well would redden on
 * its arms that gate `er` alone and can move no key.
 */
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { composeSource } from "./apppath.mjs";

const ROOT = new URL("..", import.meta.url).pathname.replace(/\/$/, "");

/* Every file the generator's answers are a function of, EXCEPT the app.js /
 * fund-er.js surface, which comes from the slice. Order is part of the hash,
 * so this list is append-only in effect: adding one changes the value once.
 *
 *   match-sec-tickers.mjs  the matcher whose answers the table carries
 *   lib-af-abbrev.mjs      the Capital Group abbreviation family and relation
 *   gen-sec-tickers.mjs    `secAsk`'s candidate list and every refusal
 *   lib-ledger.mjs         `servedLineup` — WHICH ack serves a plan, so which
 *                          rows are "published + served" and get a key
 *   lib-schema.mjs         `loadPlans` — the row population itself
 *   apppath.mjs            the slice markers: if they move, the surface moves
 */
export const CODE_INPUTS = [
  "scripts/match-sec-tickers.mjs",
  "scripts/lib-af-abbrev.mjs",
  "scripts/gen-sec-tickers.mjs",
  "scripts/lib-ledger.mjs",
  "scripts/lib-schema.mjs",
  "scripts/apppath.mjs",
];

/* the marker the asset carries, and the expression that reads it back. Both
 * live here so the generator and the test cannot spell it differently. */
export const CODE_LINE_RE = /^const SEC_TICKERS_CODE = "([a-z0-9:]+)";$/m;
export const codeLine = (fp) => `const SEC_TICKERS_CODE = ${JSON.stringify(fp)};`;

/* `opts` mirrors composeSource's, so a caller can fingerprint ANOTHER tree
 * (HEAD's app.js, a perturbed copy) without touching the working one — which
 * is the only way the test's mutation controls can be written. */
export function codeFingerprint(opts = {}) {
  const root = opts.root || ROOT;
  /* secTickers:false IS LOAD-BEARING: with the table loaded the slice would
   * contain the asset this value is stamped into, and the fingerprint would be
   * a function of its own output — it could never disagree with itself. */
  const { src } = composeSource({
    appjs: opts.appjs || `${root}/app.js`,
    funder: opts.funder || `${root}/fund-er.js`,
    secTickers: false,
  });
  const h = createHash("sha256");
  const parts = {};
  h.update("wampo-sec-tickers-code/1\u0000");
  h.update("apppath-slice\u0000");
  h.update(src);
  parts["apppath-slice"] = createHash("sha256").update(src).digest("hex").slice(0, 12);
  for (const rel of CODE_INPUTS) {
    const p = (opts.override && opts.override[rel]) || `${root}/${rel}`;
    const text = readFileSync(p, "utf8");
    h.update("\u0000" + rel + "\u0000");
    h.update(text);
    parts[rel] = createHash("sha256").update(text).digest("hex").slice(0, 12);
  }
  return { fp: "sha256:" + h.digest("hex"), parts };
}

/* the value stamped into the committed asset, or null if it carries none */
export function assetFingerprint(path) {
  const m = readFileSync(path, "utf8").match(CODE_LINE_RE);
  return m ? m[1] : null;
}
