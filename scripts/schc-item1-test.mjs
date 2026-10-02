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
  "ACK_ID,PROVIDER_OTHER_NAME,PROVIDER_OTHER_DIRECT_COMP,PROVIDER_OTHER_RELATION",
  "ACK_WITH2,FIDELITY INVESTMENTS INSTITUTIONAL,500000,",
].join("\n");
const ITEM2_CODES = [
  "ACK_ID,ROW_ORDER,PROVIDER_OTHER_SERVICE_CODE",
  "ACK_WITH2,1,15",
].join("\n");
const SCHC = "ACK_ID\nACK_WITH2\nACK_NO2";
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
  RK_BRANDS: [[/fidelity/i, "Fidelity"]],
  brandOf: (n) => n,
  console: { log: (...a) => logs.push(a.join(" ")), warn: (...a) => logs.push("WARN " + a.join(" ")) },
};
vm.createContext(ctx);
vm.runInContext(body, ctx);
const scanSchC = ctx.scanSchC;

const fails = [];
const ok = (cond, msg) => { if (!cond) fails.push(msg); };

const wanted = new Set(["ACK_WITH2", "ACK_NO2"]);
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

if (fails.length) { for (const f of fails) console.error("FAIL " + f); process.exit(1); }
console.log(`schc-item1: 10 assertions, 0 failures `
  + `(captured ${item1.size} acks; published picks unchanged; negative control fires)`);
