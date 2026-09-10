#!/usr/bin/env node
/* wampo — the DATA gate on mirroring, run by scripts/mirror.sh before it pushes.
 *
 * WHY THIS EXISTS. mirror.sh already refuses the two GIT hazards: main carrying
 * commits the branch lacks, and local disagreeing with origin. Neither of them
 * looks at the data. Twice in one week a store was sitting ready to mirror that
 * would have made the live site WORSE, and both times the only thing standing
 * between it and main was me reading numbers by hand:
 *
 *   #244  lost 31 real fund menus — $18.1B, 340,447 participants, Lowe's at
 *         295,951 people — while its coverage line went UP. The net was
 *         positive. A net is the wrong test when one of the losses is a plan
 *         with nearly 300,000 people in it.
 *   #239  was cancelled mid-parse and its merge job committed anyway under
 *         `if: always()`, leaving 44,466 acks at one parser version beside
 *         24,237 at another. A partial store looks entirely healthy in every
 *         aggregate.
 *
 * "Check it before mirroring" was already the documented rule in both cases.
 * The rule was not the problem. Enforcement by human attention was.
 *
 * Two refusals, both overridable with --force after the loss is justified:
 *   1. PARTIAL STORE   — the dominant parser version covers < 97% of acks.
 *   2. LINEUP LOSS     — main holds a confident lineup that the branch does not.
 *
 * Exits 0 to allow, 1 to refuse. Prints the numbers either way, so an allowed
 * mirror still leaves a record of what it was allowed on.
 */
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

const FORCE = process.argv.includes("--force");
const PV_MIN_SHARE = 0.97;

const load = (label, read) => {
  try {
    const raw = JSON.parse(read());
    if (!raw.plans) throw new Error("no .plans map");
    return raw.plans;
  } catch (e) {
    console.error(`mirror-gate: cannot read ${label}: ${e.message}`);
    process.exit(1);
  }
};

const branch = load("local lineups-status.json", () => readFileSync("lineups-status.json", "utf8"));
const main = load("origin/main lineups-status.json", () =>
  execFileSync("git", ["show", "origin/main:lineups-status.json"], { encoding: "utf8", maxBuffer: 512 * 1024 * 1024 }));

/* ---- 1. completeness ------------------------------------------------------ */
const pv = new Map();
let dl = 0, analyze = 0;
for (const st of Object.values(branch)) {
  pv.set(st.pv || 0, (pv.get(st.pv || 0) || 0) + 1);
  if (st.e === "download") dl++;
  if (st.e === "analyze") analyze++;
}
const total = Object.keys(branch).length;
const ranked = [...pv].sort((a, b) => b[1] - a[1]);
const [topPv, topN] = ranked[0] || [0, 0];
const share = total ? topN / total : 1;

console.log(`mirror-gate: ${total} acks; dominant pv ${topPv} covers ${topN} (${(share * 100).toFixed(1)}%)`);
console.log(`             fetch failures ${dl} (${((dl / total) * 100).toFixed(2)}%), reader failures ${analyze} (${((analyze / total) * 100).toFixed(2)}%)`);

let refuse = false;
if (share < PV_MIN_SHARE) {
  console.error(`\nREFUSING TO MIRROR — PARTIAL STORE. Only ${(share * 100).toFixed(1)}% of acks are at pv ${topPv}.`);
  console.error("  " + ranked.slice(1, 4).map(([v, n]) => `pv ${v}: ${n}`).join(", "));
  console.error("  A second large parser-version cohort means the run did not finish (cancel,");
  console.error("  crash, or time budget). Re-dispatch and let it complete before mirroring.");
  refuse = true;
}

/* ---- 2. lineup losses vs what is already live ----------------------------- */
const lost = [];
for (const [ack, st] of Object.entries(main)) {
  if (!st.c) continue;
  const b = branch[ack];
  if (!b || !b.c) lost.push(ack);
}
const gained = Object.entries(branch).filter(([ack, st]) => st.c && !(main[ack] && main[ack].c)).length;
console.log(`             confident lineups: +${gained} gained, -${lost.length} lost vs origin/main`);

if (lost.length) {
  // name them, with the row counts main holds — a lost 30-fund menu and a lost
  // 3-row fragment are different events and the operator must see which it is
  const shardOf = (ack) => { let h = 0; for (const c of ack) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h % 64; };
  const need = [...new Set(lost.map(shardOf))];
  const shards = {};
  for (const i of need) {
    const name = `data/lineups/${String(i).padStart(2, "0")}.json`;
    try { shards[i] = JSON.parse(execFileSync("git", ["show", `origin/main:${name}`], { encoding: "utf8", maxBuffer: 512 * 1024 * 1024 })); }
    catch { shards[i] = {}; }
  }
  const detail = lost.map((ack) => {
    const e = (shards[shardOf(ack)] || {})[ack] || {};
    return { ack, rows: (e.funds || []).length, fb: e.fb || null };
  }).sort((a, b) => b.rows - a.rows);

  console.error(`\nREFUSING TO MIRROR — ${lost.length} confident lineup(s) on main are NOT on the branch.`);
  console.error("  Mirroring would REMOVE a published fund menu from the live site.");
  for (const d of detail.slice(0, 25)) {
    console.error(`    ${d.ack}  ${d.rows} rows${d.fb ? `  (from the ${d.fb} filing)` : ""}`);
  }
  if (detail.length > 25) console.error(`    … and ${detail.length - 25} more`);
  console.error("\n  Sample them against their filings first. If the withdrawal is CORRECT —");
  console.error("  the old parse was junk — re-run mirror.sh with --force-data and say so");
  console.error("  in the commit. (--force alone covers the GIT check only, deliberately.)");
  refuse = true;
}

if (refuse && !FORCE) process.exit(1);
if (refuse) console.error("\n  --force given: proceeding despite the above.");
console.log("mirror-gate: ok");
