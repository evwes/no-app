#!/usr/bin/env node
/* wampo — the tether for `houseCore`, the issuer-cell reduction in
 * scripts/gen-sec-tickers.mjs. 2026-10-10.
 *
 * WHAT IT GUARDS. The reduction lets the SEC matcher see the house on a row
 * whose NAME omits it and whose ISSUER cell carries it behind custodian or
 * corporate words — 2,983 table keys and ~2.39M participants depend on it. Its
 * hazard is the one this record has found three times: the issuer cell routinely
 * holds the CUSTODIAN or PLATFORM, and reducing a platform's cell to its house
 * core supplies a house the holding may not belong to. Unguarded, the arm
 * asserted a registered VALIC fund on 30 keys whose own issuer cell says the
 * holding is a variable annuity sub-account.
 *
 * WHY IT SLICES AND FREEZES. `scripts/merge-name-test.mjs` reads every pin's
 * verdict off LIVE store attestations and has flipped status three times on DOL
 * drift alone, so it cannot live in CI — and a gate that reddens on a refresh
 * with nothing wrong is the habitually-red gate that hid ten `site-test`
 * failures. This slices `houseCore` out of the source and supplies its own
 * FROZEN platform set, so the verdicts are a property of the CODE and drift
 * cannot reach them. The live pre-pass is asserted separately, inside the
 * generator, which throws if it ever flags a house the gain rests on.
 *
 *   node scripts/house-core-test.mjs
 */
import { readFileSync } from "node:fs";
import { buildIndex, norm } from "./match-sec-tickers.mjs";

const ROOT = new URL("..", import.meta.url).pathname.replace(/\/$/, "");
const fail = [];
const ok = (cond, what) => { if (!cond) fail.push(what); else console.log(`  ok   ${what}`); };

/* ---- slice the arm, never retype it: a harness that reproduces a shipped
 * construction from memory measures the memory ---- */
const src = readFileSync(`${ROOT}/scripts/gen-sec-tickers.mjs`, "utf8");
const a = src.indexOf("const ISS_DECLARES_VEHICLE");
const b = src.indexOf("\n};", src.indexOf("const houseCore = (iss) => {", a));
if (a < 0 || b < 0) { console.error("house-core-test: houseCore not found in gen-sec-tickers.mjs — slice boundary moved"); process.exit(1); }
const block = src.slice(a, b + 3).replace("const PLATFORM_HOUSE = new Set();", "");
const idx = buildIndex(`${ROOT}/sec-funds.json`);

/* THE FROZEN SET. These are the three houses the live pre-pass extracts from
 * the store's wrapper-declaring issuer cells, recorded here so this test's
 * verdicts cannot move with the data. `prudential` is included to exercise the
 * pre-pass's SELF-PROTECTING property: a cell that declares a wrapper puts its
 * own leading house into the set, which is why no separate vehicle refusal is
 * needed in the function. */
const FROZEN = new Set(["valic", "lincoln", "college", "prudential"]);
const mk = (drop) => {
  let s = block;
  if (drop === "slash") s = s.replace('if (raw.includes("/")) return null;', "if (false) return null;");
  if (drop === "platform") s = s.replace("return PLATFORM_HOUSE.has(p) ? null : p;", "return p;");
  return new Function("idx", "norm", "PLATFORM_HOUSE", `${s}; return houseCore;`)(idx, norm, FROZEN);
};
const houseCore = mk(null), noSlash = mk("slash"), noPlat = mk("platform");

/* ---- must REDUCE: the gain this arm exists for ---- */
console.log("must reduce:");
for (const [iss, want, why] of [
  ["Vanguard Fiduciary Trust", "vanguard", "a custodian's `Trust` made the row read as a collective trust"],
  ["Vanguard Group", "vanguard", "a leftover corporate token blocked the superset arm"],
  ["Fidelity Management Trust Company", "fidelity", "1,022 keys ride on this shape"],
  ["Dimensional Fund Advisors", "dimensional", "287 keys"],
  ["American Funds Fiduciary Trust", "american funds", "longest-first: must NOT cut to a bare `american`"],
  ["Principal Life Insurance Company", "principal", "an INSURER whose rows state a share class — a separate account has none"],
  ["Empower Annuity Insurance Co.", "empower", "a legal ENTITY name is not a declaration about the holding"],
])
  ok(houseCore(iss) === want, `${JSON.stringify(iss)} -> ${want}  (${why})`);

/* ---- must NOT reduce ---- */
console.log("must not reduce:");
for (const [iss, why] of [
  ["Vanguard", "already bare — adds no candidate"],
  ["", "empty issuer"],
  ["The Vanguard Group", "leads with `the`: the reduction is leading-anchored, so this is residue, not a gain"],
  ["Zzz Unknown Custodian", "no registered manager leads it"],
  ["VALIC variable annuity accounts", "THE PINNED HAZARD: the filer says the holding is a sub-account"],
  ["VALIC/SunAmerica", "a platform-and-sub-adviser pair names no single manager"],
  ["Principal/BlackRock", "reducing to `principal` would supply the wrong house for a BlackRock fund"],
  ["Prudential Separate Account", "self-protection: such a cell puts its own house in the set"],
])
  ok(houseCore(iss) === null, `${JSON.stringify(iss)} refused  (${why})`);

/* ---- single-protection cases: each condition gets a case where it is the ONLY
 * protection, drawn FROM the store rather than from what I expected to block.
 * `VALIC/SunAmerica` is deliberately NOT used — it is protected by both, so it
 * would prove neither. ---- */
console.log("single-protection (each condition alone):");
for (const [iss, drop, fn, why] of [
  ["Principal/BlackRock", "slash", noSlash, "67 issuer cells / 404 store rows are protected by this alone"],
  ["Valic Corebridge", "platform", noPlat, "no slash and no declaration — only the store-attested set refuses it"],
])
  ok(houseCore(iss) === null && fn(iss) !== null,
    `${JSON.stringify(iss)}: refused with all, ALLOWED without the ${drop} condition  (${why})`);

/* ---- the invariant that replaced a deleted condition. A vehicle declaration
 * needs no refusal of its own: such a cell either leads with a manager, whose
 * house the pre-pass has already flagged, or leads with none, and the loop
 * returns null anyway. Asserted over the shapes rather than asserted in prose,
 * because a condition unreachable by construction reads as a guard and is dead
 * code. ---- */
console.log("invariant — a wrapper declaration is refused without a refusal for it:");
{
  const declaring = ["VALIC variable annuity accounts", "Prudential Separate Account",
    "Lincoln Variable Annuity Account", "College Retirement Equities Fund variable annuity accounts",
    "Variable Annuity Prudential", "Investments held in pooled separate accounts Invesco"];
  const leaks = declaring.filter((i) => houseCore(i) !== null);
  ok(leaks.length === 0, `all ${declaring.length} wrapper-declaring shapes refused${leaks.length ? ` — LEAKED ${JSON.stringify(leaks)}` : ""}`);
}

if (fail.length) {
  console.error(`\nhouse-core-test: ${fail.length} FAILURE(S)`);
  for (const f of fail) console.error(`  FAIL ${f}`);
  process.exit(1);
}
console.log("\nhouse-core-test: all checks passed");
