// POSITIVE AND NEGATIVE CONTROL for the Schedule C Part I line 1(b) capture,
// run against the SHIPPED scanSchC by slicing it out of build-data.mjs -- the
// module's top level downloads DOL extracts, so it cannot be imported from a
// sandbox. Same technique as schd-name-test.mjs.
//
// What this pins, and why each one is here rather than assumed:
//   (1) item-1 names ARE captured into item1Tables;
//   (2) the PUBLISHED selection is UNCHANGED -- an item-2 row still wins over
//       item 1, which is the whole safety claim of the change. Four designs for
//       "fix the recordkeeper" were measured and refused on 2026-10-02 because
//       they moved published names; this one must move none;
//   (3) an ack NOT in wantedAcks is skipped, so the capture cannot grow without
//       bound;
//   (4) names are DE-DUPLICATED and capped -- some filers repeat one discloser
//       on every line and the shard is fetched per plan by a browser;
//   (5) the capture is OPTIONAL: called without the map, scanSchC still works,
//       so an older caller cannot throw.
import fs from "node:fs";
import vm from "node:vm";
import path from "node:path";

/* Never hardcode the sandbox path in anything CI runs -- a hardcoded cwd is
 * what made map-test report `spawn python3 ENOENT` for three days. */
const SRC = fs.readFileSync(new URL("./build-data.mjs", import.meta.url), "utf8");
const i = SRC.indexOf("async function scanSchC(");
if (i < 0) throw new Error("scanSchC moved in build-data.mjs");
let d = 0, end = -1;
for (let k = SRC.indexOf("{", i); k < SRC.length; k++) {
  if (SRC[k] === "{") d++; else if (SRC[k] === "}") { d--; if (!d) { end = k + 1; break; } }
}
const body = SRC.slice(i, end);
if (!/item1Tables/.test(body)) throw new Error("scanSchC no longer takes item1Tables");

function colIndex(H, names, re) {
  for (const n of names) { const k = H.indexOf(n.toUpperCase()); if (k !== -1) return k; }
  if (re) for (let k = 0; k < H.length; k++) if (re.test(H[k])) return k;
  return -1;
}
async function* csvRows(csv) {
  for (const line of String(csv).split("\n")) {
    if (!line.trim()) continue;
    yield line.split(",").map((c) => c.replace(/^"|"$/g, ""));
  }
}

/* The fixture decides which extract each download() call returns, by filename.
 * ITEM2 carries one coded provider row for ACK_WITH2 and nothing for ACK_NO2. */
const ITEM2 = [
  "ACK_ID,ROW_ORDER,PROVIDER_OTHER_NAME,PROVIDER_OTHER_DIRECT_COMP,PROVIDER_OTHER_RELATION",
  "ACK_WITH2,1,FIDELITY INVESTMENTS INSTITUTIONAL,500000,",
  /* PSEG's TRUST, verbatim from the filing: the top-paid row is an asset
   * manager coded 28 and the recordkeeper sits second, coded 64. Compensation
   * alone picked Invesco and the page published it. */
  "ACK_PSEG,1,INVESCO ADVISORS INC,534926,",
  "ACK_PSEG,2,FID INV INST OPS CO,442941,",
  "ACK_PSEG,3,KRONICK KALADA BERDY \u0026 CO,72800,",
  /* THE COIN TOSS THAT MUST NOT MOVE: a 403(b) using both TIAA and Fidelity.
   * TIAA is the incumbent AND a recordkeeper brand, so the guard must refuse
   * to promote even though the Fidelity row is coded 64. Cornell, Brown,
   * Northwestern and Dana-Farber are the live cases. */
  "ACK_COIN,1,TIAA,900000,",
  "ACK_COIN,2,FID INV INST OPS CO,500000,",
  /* AN INCUMBENT THE FILER ITSELF CODED 15: untouchable. */
  "ACK_CODED,1,ALIGHT SOLUTIONS LLC,100,",
  "ACK_CODED,2,FID INV INST OPS CO,900000,",
  /* A CODE-64 ROW WITH NO BRAND WITNESS -- the consultant that killed the bare
   * code-64 variant. Must NOT be promoted over the auditor. */
  "ACK_CONSULT,1,PRICEWATERHOUSECOOPERS LLP,500000,",
  "ACK_CONSULT,2,AON INVESTMENTS USA INC,80000,",
].join("\n");
const ITEM2_CODES = [
  "ACK_ID,ROW_ORDER,PROVIDER_OTHER_SERVICE_CODE",
  "ACK_WITH2,1,15",
  "ACK_PSEG,1,28 99 50",
  "ACK_PSEG,2,65 99 64 50",
  "ACK_PSEG,3,10 99 50",
  "ACK_COIN,1,28",
  "ACK_COIN,2,64",
  "ACK_CODED,1,15",
  "ACK_CODED,2,64",
  "ACK_CONSULT,1,10",
  "ACK_CONSULT,2,64",
].join("\n");
const SCHC = "ACK_ID\nACK_WITH2\nACK_NO2\nACK_PSEG\nACK_COIN\nACK_CODED\nACK_CONSULT";
const ITEM1 = [
  "ACK_ID,PROVIDER_INDIRECT_NAME",
  "ACK_WITH2,SOME CONSULTANT LLC",          // must NOT beat the item-2 pick
  "ACK_NO2,INVESCO ADVISORS INC",           // PSEG's shape: item 1 only
  "ACK_NO2,INVESCO ADVISORS INC",           // duplicate -> must collapse
  "ACK_NO2,SECOND DISCLOSER INC",
  "ACK_UNWANTED,SHOULD NOT BE CAPTURED",    // not in wantedAcks
].join("\n");

const fixture = (f) => f.includes("ITEM2_CODES") ? ITEM2_CODES
  : f.includes("ITEM2") ? ITEM2
  : f.includes("ITEM1") ? ITEM1
  : SCHC;

const logs = [];
const ctx = {
  colIndex, csvRows, path,
  download: async (_y, f) => fixture(f),
  unzip: (x) => x,
  RK_BRANDS: [[/fidelity/i, "Fidelity"], [/ALIGHT/i, "Alight"], [/TIAA/i, "TIAA"],
              [/PRINCIPAL/i, "Principal"]],
  /* THE SHIPPED witness, evaluated from the real source rather than retyped --
   * a transcription of a shipped list rots as the list grows, and this test
   * exists to catch exactly that. */
  hasRkWitness: (() => {
    const m = /const RK_ALIASES\s*=\s*(\[[\s\S]*?\]);/.exec(SRC);
    if (!m) throw new Error("RK_ALIASES moved in build-data.mjs");
    // eslint-disable-next-line no-eval
    const AL = eval(m[1]);
    const BR = [[/fidelity/i], [/ALIGHT/i], [/TIAA/i], [/PRINCIPAL/i]];
    return (n) => [...BR, ...AL].some(([re]) => re.test(String(n || "")));
  })(),
  brandOf: (n) => n,
  console: { log: (...a) => logs.push(a.join(" ")), warn: (...a) => logs.push("WARN " + a.join(" ")) },
};
vm.createContext(ctx);
vm.runInContext(body, ctx);
const scanSchC = ctx.scanSchC;

const fails = [];
const ok = (cond, msg) => { if (!cond) fails.push(msg); };

const wanted = new Set(["ACK_WITH2", "ACK_NO2", "ACK_PSEG", "ACK_COIN", "ACK_CODED", "ACK_CONSULT"]);
const feeTables = new Map();
const item1 = new Map();
const picked = await scanSchC(2025, wanted, feeTables, item1);

/* (1) captured */
ok(item1.has("ACK_NO2"), "(1) item-1 names were NOT captured for the no-item-2 ack");
ok(item1.has("ACK_WITH2"), "(1) item-1 names were NOT captured for the with-item-2 ack");

/* (2) THE SAFETY CLAIM: the published pick is unchanged. The item-2 row coded
 * 15 must still win for ACK_WITH2, and item 1 must still supply ACK_NO2. */
ok(/FIDELITY/i.test(String(picked.get("ACK_WITH2") || "")),
   `(2) an item-2 row no longer wins: got ${picked.get("ACK_WITH2")}`);
ok(/INVESCO/i.test(String(picked.get("ACK_NO2") || "")),
   `(2) item-1 fallback changed: got ${picked.get("ACK_NO2")}`);

/* (3) an unwanted ack is not captured */
ok(!item1.has("ACK_UNWANTED"), "(3) an ack outside wantedAcks was captured");

/* (4) de-duplicated, order preserved */
const l = item1.get("ACK_NO2") || [];
ok(l.length === 2, `(4) expected 2 de-duplicated names, got ${l.length}: ${JSON.stringify(l)}`);
ok(l[0] === "INVESCO ADVISORS INC", "(4) first item-1 name wrong");

/* (5) optional: an older caller passing no map must still work */
let threw = null;
try { await scanSchC(2025, new Set(["ACK_NO2"]), new Map()); } catch (e) { threw = e.message; }
ok(!threw, `(5) scanSchC threw when called without item1Tables: ${threw}`);

/* NEGATIVE CONTROL -- drop the capture block and require (1) and (4) to FAIL by
 * name, so a future edit that quietly removes it cannot pass this file. A
 * control that cannot fail is decorative. */
const cut = body.replace(/if \(item1Tables\) \{[\s\S]*?\n        \}\n/, "");
if (cut === body) fails.push("NEGATIVE CONTROL did not land -- the capture block moved, so it tests nothing");
else {
  const ctx2 = { ...ctx, console: { log() {}, warn() {} } };
  vm.createContext(ctx2);
  vm.runInContext(cut, ctx2);
  const m2 = new Map();
  const picked2 = await ctx2.scanSchC(2025, new Set(["ACK_WITH2", "ACK_NO2"]), new Map(), m2);
  ok(m2.size === 0, "NEGATIVE CONTROL: capture still happened with the block removed");
  /* and the control must show the SELECTION is independent of the capture --
   * the same two picks come out either way */
  ok(String(picked2.get("ACK_WITH2")) === String(picked.get("ACK_WITH2"))
     && String(picked2.get("ACK_NO2")) === String(picked.get("ACK_NO2")),
     "NEGATIVE CONTROL: removing the capture CHANGED the published pick -- "
     + "the capture is not side-effect free");
}

/* the entry-keeping condition is in the shard assembly, not in scanSchC, so it
 * is asserted against the SOURCE rather than executed: a plan with only `i1`
 * must still get a shard, or the field is unreachable for exactly the plans it
 * exists to measure. */
if (!/if \(!entry\.p && !entry\.a && !entry\.i1\) continue;/.test(SRC))
  fails.push("the fee-shard skip does not keep an i1-only entry -- PSEG's bucket would get no shard");

/* ---- THE CODE-64 PROMOTION ---------------------------------------------
 * A row the filer coded 64 (recordkeeping fees) whose name carries a
 * recordkeeper brand may take the published name -- but ONLY where the current
 * winner has no claim to be the recordkeeper. The guard is the whole safety of
 * it: without it the rule does TIAA -> Fidelity at Cornell, Brown, Northwestern
 * and Dana-Farber, which is a coin toss in a 403(b) that uses both.
 *
 * Every case below is a real shape from the store, and the MUST-NOT-MOVE cases
 * outnumber the must-move one on purpose. */
{
  const got = (a) => String(picked.get(a) || "");

  /* (9) PSEG, the motivating case: an asset manager coded 28 outpaid the
   * recordkeeper coded 64, so compensation alone decided it. */
  ok(/FID INV INST OPS/i.test(got("ACK_PSEG")),
     `(9) PSEG did NOT move to the code-64 recordkeeper: got ${got("ACK_PSEG")}`);

  /* (10) THE COIN TOSS MUST NOT MOVE. TIAA is the incumbent and is itself a
   * recordkeeper brand, so the guard must refuse even though a code-64
   * Fidelity row is present. This is variant (2)'s recorded failure. */
  ok(/TIAA/i.test(got("ACK_COIN")),
     `(10) a 403(b) incumbent recordkeeper WAS replaced -- the guard failed: got ${got("ACK_COIN")}`);

  /* (11) AN INCUMBENT THE FILER CODED 15 is untouchable, even against a
   * code-64 row paid nine times as much. */
  ok(/ALIGHT/i.test(got("ACK_CODED")),
     `(11) a row the filer coded 15 lost to a code-64 row: got ${got("ACK_CODED")}`);

  /* (12) A CODE-64 ROW WITH NO BRAND WITNESS must not be promoted. This is the
   * consultant that killed the bare code-64 variant (Notre Dame -> AON). */
  ok(/PRICEWATERHOUSE/i.test(got("ACK_CONSULT")),
     `(12) a code-64 row with NO brand witness was promoted: got ${got("ACK_CONSULT")}`);

  /* (13) the ordinary coded-15 pick is still untouched */
  ok(/FIDELITY/i.test(got("ACK_WITH2")), `(13) the coded-15 pick moved: got ${got("ACK_WITH2")}`);

  /* NEGATIVE CONTROL: remove the GUARD and require the coin toss to FAIL BY
   * NAME. A guard that cannot be shown to be load-bearing is decorative, and
   * this one is the entire difference between 31 plans and 1,534. */
  const noGuard = body.replace("const promote = !v.claims && best64.get(ack);",
                               "const promote = best64.get(ack);");
  if (noGuard === body) fails.push("NEGATIVE CONTROL (code-64 guard) did not land -- it tests nothing");
  else {
    const c3 = { ...ctx, console: { log() {}, warn() {} } };
    vm.createContext(c3);
    vm.runInContext(noGuard, c3);
    const p3 = await c3.scanSchC(2025, new Set(["ACK_PSEG", "ACK_COIN", "ACK_CODED", "ACK_CONSULT"]), new Map(), new Map());
    ok(/FID INV/i.test(String(p3.get("ACK_COIN") || "")),
       "NEGATIVE CONTROL: dropping the guard did NOT move the coin toss -- the guard is decorative");
    ok(/FID INV INST OPS/i.test(String(p3.get("ACK_PSEG") || "")),
       "NEGATIVE CONTROL: PSEG should still move without the guard");
  }

  /* NEGATIVE CONTROL: remove the WITNESS and require PSEG to stop moving. */
  const noWit = body.replace("&& hasRkWitness(name)) {", "&& true) {");
  if (noWit === body) fails.push("NEGATIVE CONTROL (brand witness) did not land -- it tests nothing");
  else {
    const c4 = { ...ctx, console: { log() {}, warn() {} } };
    vm.createContext(c4);
    vm.runInContext(noWit, c4);
    const p4 = await c4.scanSchC(2025, new Set(["ACK_CONSULT"]), new Map(), new Map());
    ok(/AON/i.test(String(p4.get("ACK_CONSULT") || "")),
       "NEGATIVE CONTROL: dropping the brand witness did NOT promote the consultant -- the witness is decorative");
  }
}

/* ---- THE FEE-SHARD ASSEMBLY, SLICED AND RUN -----------------------------
 * The assembly is inline at module scope, so it is taken as source text and
 * executed against crafted inputs rather than grepped. A source-text assertion
 * cannot tell a loop that includes the trusts from one that mentions them in a
 * comment -- and the whole defect this arm fixes was a loop that iterated
 * `universe` while the comment above it discussed trusts.
 *
 * WHAT IT PINS: a master-trust ack gets its own shard entry, marked `mt`, and a
 * plan entry does NOT carry that mark. 138 plans / 2,648,558 participants have
 * the TRUST's Schedule C as the only source of their published recordkeeper, so
 * if trust acks are dropped here that evidence is unstorable. */
const SLICE_HEAD = "  const feeRows = [...universe.map(";
const SLICE_TAIL = "    if (p.trust) trustsWithFees++; else plansWithFees++;\n  }";
const sh = SRC.indexOf(SLICE_HEAD), st = SRC.indexOf(SLICE_TAIL);
if (sh < 0 || st < 0) fails.push("the fee-shard assembly moved -- this gate tests nothing");
else {
  const loop = SRC.slice(sh, st + SLICE_TAIL.length);
  const runLoop = (text) => {
    const c = {
      universe: [{ ack: "PLAN_A" }, { ack: "PLAN_NOTHING" }],
      usedMtias: new Map([["TRUST_A", { year: 2025 }], ["TRUST_NOTHING", { year: 2025 }]]),
      feeTables: new Map([["PLAN_A", [{ n: "X", d: 1 }]], ["TRUST_A", [{ n: "INVESCO ADVISORS INC", d: 9 }]]]),
      schA: new Map(), item1Tables: new Map([["TRUST_A", ["SOME DISCLOSER"]]]),
      FEE_SHARDS: 4, shardOf: () => 0, buckets: [{}, {}, {}, {}],
      plansWithFees: 0, trustsWithFees: 0, console: { log() {} },
    };
    vm.createContext(c);
    vm.runInContext(text, c);
    return c;
  };
  const c = runLoop(loop);
  const all = Object.assign({}, ...c.buckets);
  ok(!!all.PLAN_A, "(6) a plan with item-2 rows lost its shard entry");
  ok(!!all.TRUST_A, "(6) A MASTER TRUST ACK GOT NO SHARD ENTRY -- the trust's Schedule C, "
    + "which is the only source of the recordkeeper for 2.6M participants, is unstorable");
  ok(all.TRUST_A && all.TRUST_A.mt === 1, "(7) the trust entry is not marked `mt` -- a reader "
    + "could mistake the trust's providers for the plan's own");
  ok(all.PLAN_A && all.PLAN_A.mt === undefined, "(7) a PLAN entry was marked `mt`");
  ok(!all.PLAN_NOTHING && !all.TRUST_NOTHING, "(8) an ack with no rows, no Sch A and no i1 was kept");
  ok(c.plansWithFees === 1 && c.trustsWithFees === 1,
     `(8) the tallies are wrong: plans=${c.plansWithFees} trusts=${c.trustsWithFees}`);

  /* NEGATIVE CONTROL: drop the trust arm and require the trust assertion to
   * FAIL BY NAME. This is the control the original loop would have passed. */
  const noTrust = loop.replace(/,\n\s*\.\.\.\[\.\.\.usedMtias\.keys\(\)\][^\]]*\]/, "]");
  if (noTrust === loop) fails.push("NEGATIVE CONTROL (trust arm) did not land -- it tests nothing");
  else {
    const c2 = runLoop(noTrust);
    const all2 = Object.assign({}, ...c2.buckets);
    ok(!all2.TRUST_A, "NEGATIVE CONTROL: the trust entry survived removal of the trust arm");
    ok(!!all2.PLAN_A, "NEGATIVE CONTROL: removing the trust arm also dropped the PLAN entry");
  }
}

if (fails.length) { for (const f of fails) console.error("FAIL " + f); process.exit(1); }
console.log(`schc-item1: 26 assertions, 0 failures `
  + `(item-1 captured, published picks unchanged, trust acks sharded and marked; `
  + `code-64 promotion guarded; four negative controls fire)`);
