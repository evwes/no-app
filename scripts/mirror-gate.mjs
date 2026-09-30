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
/* The ref the branch is compared against. Overridable ONLY so the plan-keyed
 * classification can be controlled against a real pair of stores — a gate whose
 * behaviour cannot be reproduced on demand is a gate nobody can trust. */
const MAIN_REF = process.env.MIRROR_GATE_MAIN_REF || "origin/main";

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
const main = load(`${MAIN_REF} lineups-status.json`, () =>
  execFileSync("git", ["show", `${MAIN_REF}:lineups-status.json`], { encoding: "utf8", maxBuffer: 512 * 1024 * 1024 }));

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
const lostAck = [];
for (const [ack, st] of Object.entries(main)) {
  if (!st.c) continue;
  const b = branch[ack];
  if (!b || !b.c) lostAck.push(ack);
}
const gained = Object.entries(branch).filter(([ack, st]) => st.c && !(main[ack] && main[ack].c)).length;
console.log(`             confident lineups: +${gained} gained, -${lostAck.length} lost vs origin/main (by ACK)`);

/* THIS CHECK IS ACK-KEYED AND ON A DOL DATASET REFRESH THAT MAKES IT UNREADABLE
 * — measured 2026-09-30, and it is worse than merely noisy. When DOL publishes a
 * new batch, "newest filing per EIN|PN wins" moves thousands of plans onto a new
 * ack and merge purges the old one, so an ack-keyed diff reported 7,830 lost
 * lineups. Every one of them looks identical here to a genuine withdrawal, the
 * operator is pushed onto --force-data to get past a list they cannot read, and
 * --force-data then rubber-stamps the REAL losses hiding inside it. A gate that
 * can only be satisfied by overriding it is not protecting anything.
 *
 * A reader addresses a plan by EIN|PN, so ask the question that way. Both stores
 * ship their own plans-all, so the ack -> plan join needed to tell a SUPERSESSION
 * from a WITHDRAWAL is already here; nothing new has to be stored.
 *
 * Of that 7,830: 275 plans actually stopped being served, and of those 171 were
 * WIND-DOWNS (the new filing reports $0 year-end assets — the plan terminated and
 * a final-year return correctly has no menu, and with assetsEOY = 0 the ratio
 * guard can never accept a region anyway) and 82 had moved to the SHORT FORM,
 * which files no attachment BY LAW. The real residue was 22 plans / 16,996
 * participants. Three populations inside one count, and the ack-keyed number was
 * 356x the one that mattered.
 *
 * So the refusal is keyed on the real residue and the benign classes are printed
 * rather than hidden. If either plans-all cannot be read the join is impossible
 * and this falls back to refusing on the ack count, which is the safe direction. */
const planKeyed = (() => {
  const rd = (label, read) => {
    try {
      const p = JSON.parse(read());
      if (!Array.isArray(p.plans) || !Array.isArray(p.fields)) throw new Error("shape");
      const f = p.fields, i = (n) => { const k = f.indexOf(n); if (k < 0) throw new Error(`no field ${n}`); return k; };
      const ix = { ack: i("ack"), ein: i("ein"), pn: i("pn"), sf: i("sf"),
                   eoy: i("assetsEOY"), mt: i("mtiaAck"), nm: i("sponsorName"),
                   ppl: i("partEOY"), pp2: i("participants") };
      const byAck = new Map(), byKey = new Map(), members = new Map();
      for (const r of p.plans) {
        const key = `${r[ix.ein]}|${r[ix.pn]}`;
        byAck.set(r[ix.ack], key);
        byKey.set(key, r);
        /* A MASTER TRUST HAS NO plans-all ROW, so an ack that maps to no plan
         * is not thereby irrelevant — it may be a trust whose lineup is what a
         * member plan publishes. Without this the gate files every trust loss
         * as benign and goes silent on exactly the largest cases: Levi Strauss
         * (8,288 participants) and Motrex (2,939) were served by their trust,
         * never by their own ack, so their own acks never enter the loss list
         * at all. Fifth instance on this record of a count keyed on plans being
         * blind to a trust row. */
        const mt = r[ix.mt];
        if (mt) { if (!members.has(mt)) members.set(mt, []); members.get(mt).push(key); }
      }
      return { byAck, byKey, members, ix };
    } catch (e) { console.error(`mirror-gate: plan-keyed check unavailable (${label}: ${e.message})`); return null; }
  };
  const M = rd(`${MAIN_REF} plans-all.json`, () =>
    execFileSync("git", ["show", `${MAIN_REF}:plans-all.json`], { encoding: "utf8", maxBuffer: 1024 * 1024 * 1024 }));
  const B = rd("local plans-all.json", () => readFileSync("plans-all.json", "utf8"));
  if (!M || !B) return null;

  const servedBranch = (key) => {
    const r = B.byKey.get(key); if (!r) return false;          // plan left the universe
    const own = branch[r[B.ix.ack]];
    if (own && own.c) return true;
    const mt = r[B.ix.mt];
    return !!(mt && branch[mt] && branch[mt].c);
  };
  const out = { superseded: 0, wind: 0, shortForm: 0, real: [], gone: 0 };
  const seen = new Set();
  const classify = (key) => {
    if (seen.has(key)) return;
    seen.add(key);
    if (servedBranch(key)) { out.superseded++; return; }        // same plan, newer ack
    const r = B.byKey.get(key);
    if (!r) { out.gone++; return; }                             // plan no longer filed
    if ((+r[B.ix.eoy] || 0) === 0) { out.wind++; return; }      // wind-down: correct
    if (r[B.ix.sf]) { out.shortForm++; return; }                // no attachment by law
    out.real.push({ key, ack: r[B.ix.ack], nm: String(r[B.ix.nm] || "").slice(0, 34),
                    ppl: +r[B.ix.ppl] || +r[B.ix.pp2] || 0 });
  };
  for (const ack of lostAck) {
    const key = M.byAck.get(ack);
    if (key) { classify(key); continue; }
    // no plan owns this ack: it is a TRUST, so ask after the plans it serves
    const mem = M.members.get(ack);
    if (!mem) { out.superseded++; continue; }
    for (const k of mem) classify(k);
  }
  out.real.sort((a, b) => b.ppl - a.ppl);
  return out;
})();

if (planKeyed) {
  const p = planKeyed;
  const realPpl = p.real.reduce((a, x) => a + x.ppl, 0);
  console.log(`             by PLAN (EIN|PN): ${p.real.length} plan(s) / ${realPpl.toLocaleString()} participants actually stop being served`);
  console.log(`               benign: ${p.superseded} superseded by a newer filing, ${p.wind} wind-down ($0 year-end), ` +
              `${p.shortForm} now short-form (no attachment by law), ${p.gone} no longer in the universe`);
}

/* Refuse on the plan-keyed residue when the join was possible, on the raw ack
 * count when it was not. */
const lost = planKeyed ? planKeyed.real.map((x) => x.ack) : lostAck;
if (planKeyed && lost.length) {
  console.error(`\nREFUSING TO MIRROR — ${lost.length} plan(s) stop being served, and their filings are neither`);
  console.error("  wound down nor short-form, so the menu is genuinely disappearing for these readers.");
  for (const d of planKeyed.real.slice(0, 25)) console.error(`    ${d.nm.padEnd(34)} ${String(d.ppl).padStart(7)}p  ${d.key}`);
  if (planKeyed.real.length > 25) console.error(`    … and ${planKeyed.real.length - 25} more`);
  console.error("\n  Read them against their filings first. If the withdrawal is CORRECT, re-run");
  console.error("  mirror.sh with --force-data and say so in the commit.");
  refuse = true;
} else if (!planKeyed && lost.length) {
  // name them, with the row counts main holds — a lost 30-fund menu and a lost
  // 3-row fragment are different events and the operator must see which it is
  const shardOf = (ack) => { let h = 0; for (const c of ack) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h % 64; };
  const need = [...new Set(lost.map(shardOf))];
  const shards = {};
  for (const i of need) {
    const name = `data/lineups/${String(i).padStart(2, "0")}.json`;
    try { shards[i] = JSON.parse(execFileSync("git", ["show", `${MAIN_REF}:${name}`], { encoding: "utf8", maxBuffer: 512 * 1024 * 1024 })); }
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
