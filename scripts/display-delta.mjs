/* wampo — what a span of DISPLAY work actually changed for readers, deduplicated.
 *
 *   node scripts/display-delta.mjs <baseline-ref-or-sha>
 *
 * WHY THIS EXISTS. Every display ship reports its own rows / plans /
 * participants, and those figures MUST NOT be summed: a plan reached by several
 * ships is counted once per ship, which is the error this project's record warns
 * about repeatedly (one screen summed a plan's participants once per ROW and
 * came out 8x high). Asked "what did ten days of work accomplish", the honest
 * answer needs ONE number, not a column to add up.
 *
 * So this asks a single question: over the CURRENT store, how does the page at
 * <baseline-ref> answer differently from the page today? Two renderers, the only
 * difference being app.js, every published+served row, each plan counted ONCE.
 *
 * IT HOLDS THE DATA FIXED ON PURPOSE. The parse's own delta is the coverage
 * trail's job (`docs/coverage-history.jsonl`) and is a different question; this
 * isolates the display. A row that changed because a filing changed is invisible
 * here, which is what makes the answer attributable to the code.
 *
 * IT SEPARATES THE KINDS OF CHANGE, because they are not the same improvement:
 * a ticker gained is new identification; a ticker WITHDRAWN is a false claim
 * retracted; an asterisk added or removed changes the row's epistemic status;
 * a qualification label is neither — it says the filing named no fund. Summing
 * those into "rows improved" would hide that most display work is labelling.
 *
 * COST: it renders every published+served row twice, which is ~20-25 minutes of
 * CPU. Note that in this container a BACKGROUND process only gets CPU while a
 * turn is active, so run it in the foreground or keep the session busy.
 *
 * CONTROLS, all before the walk: the two renderers must DIFFER on a case the
 * span is known to have shipped (otherwise one app.js silently did not load and
 * a clean no-difference reads as "nothing was accomplished"), and the baseline
 * ref must actually resolve.
 */
import { readFileSync, readdirSync, writeFileSync, mkdtempSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildRenderer } from "./apppath.mjs";
import { loadPlans } from "./lib-schema.mjs";
import { servedLineup } from "./lib-ledger.mjs";

const ROOT = new URL("..", import.meta.url).pathname.replace(/\/$/, "");
const REF = process.argv[2];
if (!REF) {
  console.error("usage: node scripts/display-delta.mjs <baseline-ref-or-sha> [--probe \"<name>\"]");
  process.exit(2);
}
const pi = process.argv.indexOf("--probe");
/* the default probe is the 2026-10-12 withdrawal-terms caption; pass --probe to
 * measure a span that did not include it, or the control will fail by design */
const PROBE = pi > 0 ? process.argv[pi + 1] : "Non Benefit-Responsive Investment Contracts";

const tmp = mkdtempSync(join(tmpdir(), "wampo-display-delta-"));
const OLD = join(tmp, "app-baseline.js");
let base;
try {
  base = execFileSync("git", ["show", `${REF}:app.js`], { cwd: ROOT, encoding: "utf8", maxBuffer: 1 << 28 });
} catch (e) {
  console.error(`could not read app.js at ${REF}: ${e.message.split("\n")[0]}`);
  process.exit(2);
}
writeFileSync(OLD, base);

const A = buildRenderer({ appjs: OLD });              /* the baseline page */
const B = buildRenderer({ appjs: `${ROOT}/app.js` }); /* the page today */

{
  const mk = (R, n) => { const f = { nameRaw: n, iss: "", type: "" }; f.name = R.clean(n); return R.renderRow({ id: "x", assetsEOY: 1e9 }, f, "menu", 1e9); };
  const a = mk(A, PROBE), b = mk(B, PROBE);
  if (JSON.stringify(a) === JSON.stringify(b)) {
    console.error(`POSITIVE CONTROL FAILED: both renderers answer identically for ${JSON.stringify(PROBE)}.`);
    console.error("Either one app.js did not load, or this probe is not a case the span changed — pass --probe with one that is.");
    process.exit(2);
  }
  console.log(`control: ${REF} shownType ${JSON.stringify(a.shownType)}  ->  today ${JSON.stringify(b.shownType)}`);
}

const idx = JSON.parse(readFileSync(`${ROOT}/lineups-index.json`, "utf8")).plans;
const d = loadPlans();
const members = new Map();
for (const row of d.rows) {
  const p = { ack: d.get(row, "ack"), mtiaAck: d.get(row, "mtiaAck"), ein: d.get(row, "ein"),
    pn: d.get(row, "pn"), participants: d.get(row, "participants"), name: d.get(row, "sponsorName") };
  const s = servedLineup(p, idx);
  if (!s.ack) continue;
  if (!members.has(s.ack)) members.set(s.ack, []);
  members.get(s.ack).push(p);
}
if (members.size < 40000) throw new Error(`served map implausibly small (${members.size}) — the measurement is void`);

const CELLS = ["name", "tk", "er", "star", "shownType"];
const moved = Object.fromEntries(CELLS.map((c) => [c, 0]));
const kind = {
  tickerGained: 0, tickerWithdrawn: 0, tickerSwapped: 0,
  assertedToComparable: 0, comparableToAsserted: 0,
  feeGained: 0, feeWithdrawn: 0, feeChanged: 0,
  nameRepaired: 0, labelGained: 0, labelLost: 0,
};
const anyPlans = new Map(), claimPlans = new Map(), labelPlans = new Map();
let walked = 0, rowsMoved = 0, rowsA = 0, rowsB = 0;
/* the shipped qualification wordings. Kept as one regex because the question is
 * "does the page tell the reader this row names no fund", not which arm said so */
const QUALIFIED = /no specific fund|not a menu choice|not a holding|asset type as filed/i;

for (const sh of readdirSync(`${ROOT}/data/lineups`).sort()) {
  const shard = JSON.parse(readFileSync(`${ROOT}/data/lineups/${sh}`, "utf8"));
  for (const [ack, e] of Object.entries(shard)) {
    const mem = members.get(ack);
    if (!mem || !e || !Array.isArray(e.funds)) continue;
    const lead = mem[0];
    const total = e.funds.reduce((a, f) => a + (Number(f.value) || 0), 0);
    for (const f0 of e.funds) {
      walked++;
      const raw = String(f0.name || "");
      /* each copy cleans for itself: the page cleans UPSTREAM of the slice, so
       * handing both the same `name` would measure one cleaner twice */
      const fa = { ...f0, nameRaw: raw, name: A.clean(raw) };
      const fb = { ...f0, nameRaw: raw, name: B.clean(raw) };
      let ga = null, gb = null;
      try { ga = A.renderRow(lead, fa, "menu", total); } catch { }
      try { gb = B.renderRow(lead, fb, "menu", total); } catch { }
      if (ga) rowsA++;
      if (gb) rowsB++;
      let any = false;
      for (const c of CELLS) if (JSON.stringify(ga?.[c]) !== JSON.stringify(gb?.[c])) { moved[c]++; any = true; }
      if (!any) continue;
      rowsMoved++;
      const add = (m) => { for (const p of mem) m.set(`${p.ein}|${p.pn}`, p.participants || 0); };
      add(anyPlans);
      const ta = ga?.tk || null, tb = gb?.tk || null;
      const ea = ga?.er ?? null, eb = gb?.er ?? null;
      let claim = false;
      if (!ta && tb) { kind.tickerGained++; claim = true; }
      else if (ta && !tb) { kind.tickerWithdrawn++; claim = true; }
      else if (ta && tb && ta !== tb) { kind.tickerSwapped++; claim = true; }
      if (ta && tb && ta === tb) {
        if (!ga.star && gb.star) { kind.assertedToComparable++; claim = true; }
        if (ga.star && !gb.star) { kind.comparableToAsserted++; claim = true; }
      }
      if (ea == null && eb != null) { kind.feeGained++; claim = true; }
      else if (ea != null && eb == null) { kind.feeWithdrawn++; claim = true; }
      else if (ea != null && eb != null && ea !== eb) { kind.feeChanged++; claim = true; }
      if (claim) add(claimPlans);
      if (JSON.stringify(ga?.name) !== JSON.stringify(gb?.name)) kind.nameRepaired++;
      const la = QUALIFIED.test(String(ga?.shownType || "")), lb = QUALIFIED.test(String(gb?.shownType || ""));
      if (!la && lb) { kind.labelGained++; add(labelPlans); }
      if (la && !lb) { kind.labelLost++; add(labelPlans); }
    }
  }
}
const sum = (m) => [...m.values()].reduce((a, b) => a + b, 0);
console.log(`\nwalked ${walked.toLocaleString()} published+served rows through BOTH pages`);
console.log(`row membership: ${rowsA.toLocaleString()} at ${REF}, ${rowsB.toLocaleString()} today`);
console.log(`\nROWS WHOSE PUBLISHED ANSWER CHANGED: ${rowsMoved.toLocaleString()}`);
console.log(`  cells: ${CELLS.map((c) => `${c} ${moved[c].toLocaleString()}`).join(" | ")}`);
console.log(`\nDEDUPLICATED REACH (each plan counted ONCE — these three overlap, never sum them):`);
console.log(`  any change at all      ${String(anyPlans.size).padStart(7)} plans  ${sum(anyPlans).toLocaleString().padStart(12)} participants`);
console.log(`  a TICKER or FEE claim  ${String(claimPlans.size).padStart(7)} plans  ${sum(claimPlans).toLocaleString().padStart(12)} participants`);
console.log(`  a qualification LABEL  ${String(labelPlans.size).padStart(7)} plans  ${sum(labelPlans).toLocaleString().padStart(12)} participants`);
console.log(`\nBY KIND OF CLAIM (rows):`);
for (const [k, v] of Object.entries(kind)) console.log(`  ${k.padEnd(22)} ${v.toLocaleString()}`);
