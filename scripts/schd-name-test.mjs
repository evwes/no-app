// POSITIVE AND NEGATIVE CONTROL for the Schedule D name capture, run against
// the SHIPPED scanSchD by slicing it out of build-data.mjs -- the module's top
// level downloads DOL extracts, so it cannot be imported from a sandbox.
// Proves: (1) the C branch keeps the NAME, (2) a trust ack in wantedAcks is
// scanned, (3) an ack NOT in wantedAcks is skipped, (4) the log says whether
// the name column resolved, in both directions.
import fs from "node:fs";
import vm from "node:vm";
/* Never hardcode the sandbox path in anything CI runs — a hardcoded cwd is
 * what made map-test report `spawn python3 ENOENT` for three days. */
const SRC = fs.readFileSync(new URL("./build-data.mjs", import.meta.url), "utf8");
const i = SRC.indexOf("async function scanSchD(");
if (i < 0) throw new Error("scanSchD moved");
let d = 0, end = -1;
for (let k = SRC.indexOf("{", i); k < SRC.length; k++) {
  if (SRC[k] === "{") d++; else if (SRC[k] === "}") { d--; if (!d) { end = k + 1; break; } }
}
const body = SRC.slice(i, end);

// the two helpers scanSchD calls, transcribed from build-data's own use:
// csvRows yields arrays, colIndex resolves a header name.
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
const logs = [];
const ctx = { colIndex, csvRows, console: { log: (...a) => logs.push(a.join(" ")), warn() {} } };
vm.createContext(ctx);
vm.runInContext(body, ctx);
const scanSchD = ctx.scanSchD;

const HEAD = "ACK_ID,DFE_NAME,MTIA_CCT_PSA_EIN,MTIA_CCT_PSA_PN,MTIA_CCT_PSA_ENTITY_CODE,DFE_P1_PLAN_INT_EOY_AMT";
const rows = [
  // the TRUST's own Schedule D -- the PSEG shape, three named collective trusts
  "TRUSTACK,VFTC INSTITUTIONAL 500 INDEX TRUST,816327456,001,C,1216710409",
  "TRUSTACK,VANGUARD FID TR CO TGT RET 2030 TR,846565712,001,C,97626170",
  "TRUSTACK,VANGUARD FID TR CO TGT RET 2040 TR,846572691,001,C,83166898",
  // a PLAN's Schedule D: one MTIA link (code M) and one collective trust
  "PLANACK,PSEG MASTER EMPLOYEE BENEFIT PLAN TRUST,222625848,002,M,0",
  "PLANACK,GREAT GRAY TRUST TARGET 2045,123456789,001,C,5000000",
  // an ack NOBODY asked for -- must be skipped entirely
  "OTHERACK,SOME OTHER TRUST,999999999,001,C,42",
];
const csv = [HEAD, ...rows].join("\n");

const r = await scanSchD(csv, 2024, new Set(["TRUSTACK", "PLANACK"]));
const named = r.cctNamed;
const pass = [];
const t = named.get("TRUSTACK") || [], p = named.get("PLANACK") || [];
pass.push(["trust ack scanned, 3 named CCTs", t.length === 3]);
pass.push(["trust names kept verbatim", t[0] && t[0].n === "VFTC INSTITUTIONAL 500 INDEX TRUST" && t[0].v === 1216710409]);
pass.push(["plan ack still gets its CCT name", p.length === 1 && p[0].n === "GREAT GRAY TRUST TARGET 2045"]);
pass.push(["unwanted ack skipped", !named.has("OTHERACK")]);
pass.push(["MTIA link branch unchanged", (r.mtia.get("PLANACK") || []).length === 1]);
pass.push(["value set for CIT typing unchanged", (r.cct.get("TRUSTACK") || new Set()).size === 3]);
pass.push(["log reports the name column RESOLVED", logs.some((l) => /collective-trust NAMES: resolved at index 1 \(DFE_NAME\)/.test(l))]);

// NEGATIVE CONTROL: drop the name column entirely. The capture must go to
// zero AND the log must say so -- a silent -1 is the failure this guards.
const noName = [HEAD.replace("DFE_NAME,", "JUNK_COL,"), ...rows].join("\n");
logs.length = 0;
const r2 = await scanSchD(noName, 2024, new Set(["TRUSTACK", "PLANACK"]));
pass.push(["without a name column, 0 named", r2.cctNamed.size === 0]);
pass.push(["...and the log SAYS the column was not found",
  logs.some((l) => /collective-trust NAMES: NOT FOUND/.test(l))]);
pass.push(["...while the MTIA links still resolve", (r2.mtia.get("PLANACK") || []).length === 1]);

let bad = 0;
for (const [name, ok] of pass) { if (!ok) bad++; console.log(`${ok ? "ok  " : "FAIL"}  ${name}`); }
console.log(`\n${pass.length - bad}/${pass.length} passed`);
process.exit(bad ? 1 : 0);
