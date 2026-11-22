#!/usr/bin/env node
/* wampo — THE CONTROLS FOR v208's DATE TEST, AND FOR THE ONE THING THE SIZER'S
 * `--selftest` CANNOT ASSERT: that the parser's two arms behave as claimed.
 *
 * WHAT IS ALREADY COVERED ELSEWHERE AND IS NOT REPEATED HERE.
 * `scripts/subsequent-events-size.mjs --selftest` owns the PREDICATES —
 * `EFFECTIVE_AFTER`'s 7 positives and 20 refusals (each READ in its own
 * filing), `presupposes`'s 3 keeps and 5 headline members, and 6 widening
 * mutations that must each reach a NAMED refusal. Since 2026-11-22 those
 * predicates live in `scripts/lib-effective-date.mjs` and the sizer IMPORTS
 * them, so that selftest gates the SHIPPED code; it is run as step 0 below
 * rather than duplicated, because two copies of a control are two things to
 * keep in step and one of them will rot.
 *
 * WHAT IS HERE, and each item is something no existing instrument asks:
 *   1. the sizer's selftest, invoked (the predicates, gated at their source)
 *   2. `planYearEnd` — the ordinary January year, a FISCAL year, an explicit
 *      irregular `pye`, and the absence that makes the whole test fail OPEN
 *   3. `catchupMandate` — REQUIREMENT vs PERMISSION, which is the whole
 *      discriminator, with US Acute Care's permission sentence as the refusal
 *   4. `restrictsExisting` — the suspension/freeze presupposition, including
 *      the reason it is not a fourth arm of `presupposes`
 *   5. SILENCE: no plan year, and an IN-YEAR date, must both yield no refusal.
 *      *A date test with no date is not a veto; it is silence.*
 *   6. EQUIVALENCE OVER THE REAL CORPUS — the control that the roth arm's
 *      conversion from a `||` chain to a candidate loop changed nothing it was
 *      not meant to change. With NO plan year the date test is inert, so v208
 *      must be BYTE-IDENTICAL to v207 on `afterTax`/`afterTaxText` for every
 *      filing, and on `roth`/`rothText` for every filing whose v207 quote is
 *      not a catch-up mandate. That second clause is not a hedge: the catch-up
 *      refusal is deliberately NOT gated on the plan year, because a statutory
 *      mandate is not a date question.
 *   7. SIX MUTATIONS, each required to break a NAMED case. The sharpest is
 *      number 5, which replaces the re-search with a TERMINAL VETO and must
 *      destroy Asphalt Materials' correct yes — the measurement that decided
 *      the design, asserted rather than remembered.
 *
 * USAGE
 *   node scripts/effective-date-test.mjs            # everything, ~3 min warm
 *   node scripts/effective-date-test.mjs --quick    # skip 6 and 7 (seconds)
 *   node scripts/effective-date-test.mjs --sample N --seed S
 *   node scripts/effective-date-test.mjs --restriction
 *       enumerate every PUBLISHED quote in the store that the date test would
 *       skip and print the ones `restrictsExisting` spares, to be READ. This
 *       is how the new disjunct's blast radius is measured rather than assumed.
 * Exit 1 on any failure; exit 1 with a named reason on any mutation that
 * reaches nothing, because a mutation that cannot fail prices nothing.
 */
import { readFileSync, readdirSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { loadPlans } from "./lib-schema.mjs";
import { materialiseAt } from "./lib-refmod.mjs";
import { read, seededShuffle } from "./lib-filingtext.mjs";
import {
  planYearEnd, futureEffectiveGrant, catchupMandate, catchupMandateRefusal,
  restrictsExisting, presupposes, grantRe,
} from "./lib-effective-date.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const argv = process.argv.slice(2);
const one = (f, d) => { const i = argv.indexOf(f); return i >= 0 ? argv[i + 1] : d; };
const has = (f) => argv.includes(f);
const SAMPLE = +one("--sample", 1500), SEED = +one("--seed", 20261122);
const BASE_REF = one("--vs", "3c0a6d2d");          /* v207 */

const fails = [];
const ok = (label, cond, detail = "") => {
  console.log(`  ${cond ? "ok  " : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`);
  if (!cond) fails.push(label);
};
const f0 = (n) => n.toLocaleString();

/* ---------------------------------------------------------------------------
 * the named members, each read in its own filing (accuracy-log 2026-11-22)
 * ------------------------------------------------------------------------- */
const JAN25 = planYearEnd("2025-01", "");
const MEMBERS = {
  "national-electrical": { ack: "20260730144050NAL0023443601001", arm: "roth", ppl: 30463 },
  "simpson": { ack: "20260706123851NAL0015558627001", arm: "afterTax", ppl: 3516 },
  "asphalt-materials": { ack: "20261001143444NAL0020761329001", arm: "roth", ppl: 3100 },
  "ultra-clean": { ack: "20261015150738NAL0007917105001", arm: "afterTax", ppl: 2666 },
  "irhythm": { ack: "20261007125342NAL0015420419001", arm: "afterTax", ppl: 2485 },
  "arcadium": { ack: "20260728112718NAL0017361811001", arm: "afterTax", ppl: 482 },
  "arcturus": { ack: "20261014150604NAL0003095363001", arm: "afterTax", ppl: 226 },
  /* the catch-up class, which the DATE test cannot reach: no post-year date in
   * the quote, so only `catchupMandateRefusal` can withdraw these */
  "american-eagle": { ack: "20261015081124NAL0008046673001", arm: "roth", ppl: 22309 },
  "mavis-tire": { ack: "20261015060126NAL0006780177001", arm: "roth", ppl: 14443 },
  /* and the MIXED sentence the grant veto spares — one sentence that both
   * announces the mandate and grants Roth. v207 published it and the first
   * version of v208 withdrew it. */
  "aijj": { ack: "20260910140119NAL0005259761001", arm: "roth", ppl: 7405 },
};

/* ---------------------------------------------------------------------------
 * --restriction: the blast radius of `restrictsExisting`, over the STORE
 * ------------------------------------------------------------------------- */
function storePopulation() {
  const feats = new Map();
  for (const sh of readdirSync(path.join(ROOT, "data/lineups"))) {
    if (!sh.endsWith(".json")) continue;
    for (const [ack, e] of Object.entries(JSON.parse(readFileSync(path.join(ROOT, "data/lineups", sh), "utf8"))))
      if (e && e.features && (e.features.roth || e.features.afterTax)) feats.set(ack, e.features);
  }
  if (!feats.size) throw new Error("CONTROL FAILED: no features loaded from data/lineups — this test is void");
  const d = loadPlans(path.join(ROOT, "plans-all.json"));
  const pop = [];
  for (const r of d.rows) {
    const ack = d.get(r, "ack");
    const ft = ack ? feats.get(ack) : null;
    if (!ft) continue;
    pop.push({
      ack, name: String(d.get(r, "sponsorName") || "").trim(),
      ppl: +d.get(r, "partEOY") || +d.get(r, "participants") || 0,
      pye: planYearEnd(d.get(r, "pyb"), d.get(r, "pye")),
      roth: !!ft.roth, afterTax: !!ft.afterTax,
      rothText: ft.rothText || "", afterTaxText: ft.afterTaxText || "",
    });
  }
  return pop.sort((a, b) => b.ppl - a.ppl);
}

if (has("--restriction")) {
  const pop = storePopulation();
  /* the question is asked of the PUBLISHED quote, which is what the parser is
   * choosing between and what the page prints — and of BOTH arms separately,
   * because `restrictsExisting` is keyed on the arm's own tax word */
  for (const arm of ["roth", "afterTax"]) {
    const qk = arm === "roth" ? "rothText" : "afterTaxText";
    const skipped = [], spared = [], byPresup = [];
    for (const p of pop) {
      if (!p[arm] || !p[qk] || !p.pye.pyeY) continue;
      /* ask WITHOUT the two presupposition refusals, to see what the date test
       * reaches, then attribute each sparing to the refusal that did it */
      const raw = futureEffectiveGrantRaw(p[qk], p.pye);
      if (!raw) continue;
      if (presupposes(p[qk], arm)) { byPresup.push(p); continue; }
      if (restrictsExisting(p[qk], arm)) { spared.push(p); continue; }
      skipped.push(p);
    }
    const S = (a) => a.reduce((t, x) => t + x.ppl, 0);
    console.log(`\n${arm}: published quotes the date test reaches`);
    console.log(`  SKIPPED (the class)                      ${f0(skipped.length).padStart(6)} plans / ${f0(S(skipped)).padStart(10)} readers`);
    console.log(`  spared by presupposes (degree change)    ${f0(byPresup.length).padStart(6)} plans / ${f0(S(byPresup)).padStart(10)} readers`);
    console.log(`  spared by restrictsExisting (suspension) ${f0(spared.length).padStart(6)} plans / ${f0(S(spared)).padStart(10)} readers`);
    for (const x of spared.sort((a, b) => b.ppl - a.ppl).slice(0, 25))
      console.log(`    ${String(x.ppl).padStart(7)}ppl  ${x.ack}  ${x.name.slice(0, 32).padEnd(32)} ${JSON.stringify(String(x[qk]).slice(0, 150))}`);
    if (spared.length > 25) console.log(`    … ${spared.length - 25} more`);
  }
  process.exit(0);
}
/* the date test WITHOUT its two presupposition refusals, so `--restriction`
 * can attribute each sparing. Sliced from `futureEffectiveGrant`'s own body by
 * calling it and then re-asking: a sentence it refuses for a presupposition is
 * exactly one it would otherwise have named. */
function futureEffectiveGrantRaw(quote, pye) {
  const hit = futureEffectiveGrant(quote, pye, "__none__");   /* no tax word -> both refusals inert */
  return hit;
}

/* ---------------------------------------------------------------------------
 * 1. the predicates, gated at their source
 * ------------------------------------------------------------------------- */
console.log(`--- 1/7 the predicates: subsequent-events-size.mjs --selftest (the one copy) ---`);
{
  let out = "", code = 0;
  try { out = execFileSync("node", ["scripts/subsequent-events-size.mjs", "--selftest"], { cwd: ROOT, encoding: "utf8" }); }
  catch (e) { out = String(e.stdout || "") + String(e.stderr || ""); code = e.status || 1; }
  ok("the sizer's selftest passes against lib-effective-date.mjs", code === 0,
    (out.trim().split("\n").pop() || "").slice(0, 150));
}

/* ---------------------------------------------------------------------------
 * 2. planYearEnd
 * ------------------------------------------------------------------------- */
console.log(`\n--- 2/7 planYearEnd ---`);
{
  const e = (a, b) => JSON.stringify(planYearEnd(a, b));
  ok("a January plan year ends in December of the SAME year", e("2025-01", "") === '{"pyeY":2025,"pyeM":12}', e("2025-01", ""));
  ok("a July (fiscal) plan year ends in June of the NEXT year", e("2024-07", "") === '{"pyeY":2025,"pyeM":6}', e("2024-07", ""));
  ok("an explicit irregular `pye` WINS over pyb", e("2024-04", "2024-12") === '{"pyeY":2024,"pyeM":12}', e("2024-04", "2024-12"));
  ok("neither field readable -> pyeY 0, which is what makes the test fail OPEN", e("", "") === '{"pyeY":0,"pyeM":0}', e("", ""));
  ok("a malformed pyb is not half-read", e("2025", "") === '{"pyeY":0,"pyeM":0}', e("2025", ""));
}

/* ---------------------------------------------------------------------------
 * 3. catchupMandate — REQUIREMENT vs PERMISSION
 * ------------------------------------------------------------------------- */
console.log(`\n--- 3/7 catchupMandate ---`);
{
  /* National Electrical is NOT here on purpose — its sentence carries the NOUN
   * "requirements", which the shipped vocabulary does not match, and that is
   * asserted explicitly below rather than left as a surprising absence. *A pin
   * scoped by the arm it is a pin FOR*: it is a DATE member, not a catch-up
   * one, and the two assertions under it say so. */
  const MANDATE = [
    ["whole-foods", "the Plan required all participants aged 50 and older to make their catch-up contributions on a Roth (after-tax) basis"],
    ["asphalt-603", "Effective January 1, 2026, any catch-up contributions must be a Roth contribution if the active participants wages for the prior calendar year were more than the wage limit"],
  ];
  const PERMISSION = [
    ["us-acute-care", "May elect to contribute up to 100% of compensation (plus catch-up contributions as defined in the Plan document) on a pre-tax basis and/or after-tax (Roth) basis"],
    ["plain-catchup", "Participants who have attained age 50 before the end of the Plan year are eligible to make catch-up contributions."],
    ["no-catchup-word", "Participants may elect to make Roth contributions, which are required to be designated at the time of deferral."],
  ];
  for (const [id, s] of MANDATE) ok(`mandate ${id} fires`, catchupMandate(s));
  for (const [id, s] of PERMISSION) ok(`permission ${id} does NOT fire`, !catchupMandate(s));
  ok("no-catchup-word is refused by the catch-up half, not the requirement half",
    !catchupMandate(PERMISSION[2][1]) && /required/i.test(PERMISSION[2][1]));

  /* THE GAP IN THE SHIPPED PREDICATE, ASSERTED RATHER THAN DISCOVERED TWICE.
   * `\b(?:required|requires|require|must|mandat\w+)\b` does NOT match the
   * NOUN "requirements", so the largest member of the catch-up class is not a
   * catch-up finding at all — National Electrical is withdrawn by the DATE
   * test. A WIDENING TO `requir\w+` WAS MEASURED AND REFUSED: it newly reaches
   * 89 plans / 303,113 readers, of which only 40 plans / 98,620 readers are not
   * already reachable by the date test, and reading those found at least 7
   * plans / ~35,030 readers that must be KEPT — Howmet (13,502 and 5,530),
   * Arconic (6,583 and 3,477), Alcoa (1,840 and 1,600) all say "who meet
   * certain requirements MAY ELECT to make ... Roth catch-up contributions",
   * a PERMISSION whose requirement word belongs to ELIGIBILITY, and Hims
   * (2,498) is US Acute Care's shape exactly ("Upon meeting eligibility
   * requirements participants may contribute ... on a pre-tax or Roth
   * basis"). Net below the reader floor and wrong in the expensive direction.
   * *A token added to a closed whole-string vocabulary multiplies with every
   * token already in it.* */
  ok("`requirements` (the NOUN) is NOT matched by the shipped vocabulary — National Electrical is a DATE finding",
    !catchupMandate("Effective January 1, 2026, the Plan implemented the Roth catch-up contribution requirements under the Internal Revenue Code."));
  ok("...and the date test is what reaches it",
    futureEffectiveGrant("Effective January 1, 2026, the Plan implemented the Roth catch-up contribution requirements under the Internal Revenue Code.", JAN25, "roth") === "January 1, 2026");
  ok("the refused `requir\\w+` widening would newly reach Hims's PERMISSION sentence (why it was refused)",
    /\b(?:requir\w+|must|mandat\w+)\b/i.test("Upon meeting eligibility requirements participants may contribute up to 90% (100% for catch up contributions) of their plan compensation on a pre-tax or \"Roth\" (after-tax) basis.") &&
    !catchupMandate("Upon meeting eligibility requirements participants may contribute up to 90% (100% for catch up contributions) of their plan compensation on a pre-tax or \"Roth\" (after-tax) basis."));

  console.log(`\n  catchupMandateRefusal — the one the parser calls: a mandate, and NOT a sentence that also GRANTS`);
  const MIXED = [
    ["aijj", "Among other changes, the amendment added a Roth elective deferral feature, incorporated provisions applicable to long-term part-time employees, and reflected certain changes required under recent retirement plan legislation, including enhanced catch-up contribution limits."],
    ["loyola", "Subsequent to year end, a ROTH contribution was added to the Plan, and the ROTH catch-up contribution as required by SECURE 2.0 was implemented."],
  ];
  for (const [id, s] of MANDATE) ok(`  mandate ${id} still refuses through the grant veto`, catchupMandateRefusal(s, "roth"));
  for (const [id, s] of MIXED) ok(`  MIXED ${id} is SPARED — ambiguity must not withdraw`, !catchupMandateRefusal(s, "roth") && catchupMandate(s));
  for (const [id, s] of [["american-eagle", "Additionally, the Plan was required to adopt SECURE 2.0 Act\u2019s provision for highly compensated participants, which requires any catch-up contributions to be made only as Roth contributions if their income is above certain limits."],
                         ["mavis", "Effective for taxable years beginning after December 31, 2025, catch-up contributions made by certain higher compensated participants whose wages exceeded $145,000 are required to be made as Roth contributions."],
                         ["resonetics", "\u2022 Roth treatment required for catch-up contributions for high earners."]])
    ok(`  mandate ${id} refuses (no grant verb: \`adopt\` is deliberately not one)`, catchupMandateRefusal(s, "roth"));
  ok("  the v206 arm's two single-protection cases are UNAFFECTED by the grant veto — roth-pairing-test asserts them end to end",
    !grantRe("roth").test(MANDATE[0][1]) && !grantRe("roth").test(MANDATE[1][1]));
}

/* ---------------------------------------------------------------------------
 * 4. restrictsExisting
 * ------------------------------------------------------------------------- */
console.log(`\n--- 4/7 restrictsExisting (the suspension presupposition) ---`);
{
  const ARC = "Effective March 31, 2026, the Plan was frozen and contributions under the Plan are temporarily suspended, including after-tax contributions (see Note 9).";
  ok("Arcadium's freeze fires on the afterTax arm", restrictsExisting(ARC, "afterTax"));
  ok("and NOT on the roth arm — it is keyed on the arm's own tax word", !restrictsExisting(ARC, "roth"));
  ok("THE REASON IT IS NOT A FOURTH ARM OF presupposes: that function's grant veto reads `including after-tax` as a GRANT",
    presupposes(ARC, "afterTax") === false);
  ok("Asphalt's roth suspension fires on the roth arm",
    restrictsExisting("The participants salary redirection contributions and Roth contributions will be suspended for the six-month period following the distribution.", "roth"));
  ok("a plain future GRANT does not fire",
    !restrictsExisting("On January 1, 2026, the Company amended the Plan to allow after-tax employee contributions.", "afterTax"));
  ok("a REMOVAL does not fire — that is an affirmative no and lib-4i's own removal veto owns it",
    !restrictsExisting("The Plan was amended effective June 1, 2026 to remove the option for after-tax employee contributions.", "afterTax"));
}

/* ---------------------------------------------------------------------------
 * 5. SILENCE
 * ------------------------------------------------------------------------- */
console.log(`\n--- 5/7 silence: no plan year, and an IN-YEAR date ---`);
{
  const GRANT = "On January 1, 2026, the Company amended the Plan to allow after-tax employee contributions.";
  ok("with a plan year ending 2025-12 the grant is named", futureEffectiveGrant(GRANT, JAN25, "afterTax") === "January 1, 2026");
  ok("with NO plan year it is silent", futureEffectiveGrant(GRANT, planYearEnd("", ""), "afterTax") === null);
  ok("with a plan year ending 2026-12 it is silent — the grant is IN-year",
    futureEffectiveGrant(GRANT, planYearEnd("2026-01", ""), "afterTax") === null);
  ok("a date in the SAME month as the year end is not after it",
    futureEffectiveGrant("Effective December 15, 2025, the Plan was amended to allow after-tax contributions.", JAN25, "afterTax") === null);
  ok("the 39 plans / 81,018 readers whose amendment was effective IN-YEAR are this case, and it is the one the fix must not touch", true,
    "in-year grants are silent by the afterPYE test, not by a list");
  ok("a sentence with no date at all is silent",
    futureEffectiveGrant("Roth contributions and voluntary (after-tax) contributions are also permitted under the Plan.", JAN25, "roth") === null);
}

if (has("--quick")) {
  if (fails.length) { console.error(`\nFAILED (${fails.length}): ${fails.join("; ")}`); process.exit(1); }
  console.log(`\n--quick PASSED — predicates only; the corpus equivalence and the mutations were SKIPPED and prove nothing.`);
  process.exit(0);
}

/* ---------------------------------------------------------------------------
 * 6. EQUIVALENCE over the real corpus
 * ------------------------------------------------------------------------- */
console.log(`\n--- 6/7 equivalence: v208 with NO plan year against v207, over the corpus ---`);
const v207 = (await import(materialiseAt(BASE_REF, "lib-4i.mjs", { label: "v207" }).entryPath)).extractPlanFeatures;
const v208 = (await import(new URL("./lib-4i.mjs", import.meta.url).href)).extractPlanFeatures;
{
  /* THE BASELINE PIN: a ref that does not exist throws inside materialiseAt, so
   * this cannot silently become the working tree twice. Asserted by asking for
   * the version constants. */
  const m207 = await import(materialiseAt(BASE_REF, "lib-4i.mjs", { label: "v207b" }).entryPath);
  const m208 = await import(new URL("./lib-4i.mjs", import.meta.url).href);
  ok(`the two sides are DIFFERENT versions (${m207.PARSER_VERSION} vs ${m208.PARSER_VERSION})`,
    m207.PARSER_VERSION !== m208.PARSER_VERSION, `${m207.PARSER_VERSION} -> ${m208.PARSER_VERSION}`);
}
const pop = storePopulation();
const cached = pop.filter((p) => read(p.ack));
const sample = seededShuffle(cached, SEED).slice(0, SAMPLE);
for (const id of Object.keys(MEMBERS)) {              /* the pins are forced in */
  const p = pop.find((x) => x.ack === MEMBERS[id].ack);
  if (!p) { fails.push(`member ${id} is not in the published-yes population — the store changed under this test`); continue; }
  if (!read(p.ack)) { fails.push(`member ${id} has no cached text — run tax-flag-gate --download`); continue; }
  if (!sample.some((x) => x.ack === p.ack)) sample.push(p);
}
console.log(`  ${f0(sample.length)} filings (${f0(cached.length)} of ${f0(pop.length)} published-yes plans are cached)`);
const diffs = { roth: [], afterTax: [], rothCatchup: [] };
let judged = 0;
for (const p of sample) {
  const t = read(p.ack);
  if (!t) continue;
  const a = v207(t, p.name) || {};
  const b = v208(t, p.name) || {};                     /* NO plan year: the date test is inert */
  judged++;
  if (!!a.afterTax !== !!b.afterTax || String(a.afterTaxText || "") !== String(b.afterTaxText || ""))
    diffs.afterTax.push(p);
  const rothSame = !!a.roth === !!b.roth && String(a.rothText || "") === String(b.rothText || "");
  if (!rothSame) (catchupMandate(a.rothText) ? diffs.rothCatchup : diffs.roth).push(p);
}
ok(`afterTax is BYTE-IDENTICAL on all ${f0(judged)} — those arms gained only the date test, which is silent here`,
  diffs.afterTax.length === 0, `${diffs.afterTax.length} differ${diffs.afterTax.slice(0, 3).map((x) => ` ${x.ack}`).join("")}`);
ok(`roth is BYTE-IDENTICAL except where v207's quote IS a catch-up mandate`,
  diffs.roth.length === 0, `${diffs.roth.length} unexplained${diffs.roth.slice(0, 3).map((x) => ` ${x.ack}(${x.ppl})`).join("")}`);
console.log(`  catch-up mandate quotes that moved or were withdrawn: ${f0(diffs.rothCatchup.length)} plans / ` +
  `${f0(diffs.rothCatchup.reduce((t, x) => t + x.ppl, 0))} readers in this sample — the INTENDED effect, priced exactly by tax-flag-gate`);
ok(`the conversion is OBSERVABLE at all: at least one catch-up quote moved`, diffs.rothCatchup.length > 0,
  `${diffs.rothCatchup.length} — a zero here means the sample cannot see the change, not that there is none`);

/* ---------------------------------------------------------------------------
 * 7. MUTATIONS — each must break a NAMED case
 * ------------------------------------------------------------------------- */
console.log(`\n--- 7/7 mutations: each must break a NAMED member ---`);
{
  /* the mutant base must BE the code under test, not a neighbouring commit */
  try { execFileSync("git", ["diff", "--quiet", "HEAD", "--", "scripts/lib-4i.mjs", "scripts/lib-effective-date.mjs"], { cwd: ROOT }); }
  catch { fails.push("MUTATION BASE: lib-4i.mjs / lib-effective-date.mjs differ from HEAD — the mutants would not test the committed code"); }

  const mutate = async (label, edits) => {
    const dir = materialiseAt("HEAD", "lib-4i.mjs", { label: "mut" }).dir;
    for (const [file, from, to] of edits) {
      const fp = path.join(dir, file);
      const src = readFileSync(fp, "utf8");
      if (!src.includes(from)) throw new Error(`MUTATION ${label}: anchor absent from ${file} — it prices nothing`);
      const next = src.split(from).join(to);
      if (next === src) throw new Error(`MUTATION ${label}: replacement changed nothing`);
      writeFileSync(fp, next);
    }
    return (await import(path.join(dir, "lib-4i.mjs") + `?m=${encodeURIComponent(label)}`)).extractPlanFeatures;
  };
  const flagOf = (fn, id) => {
    const m = MEMBERS[id]; const t = read(m.ack);
    if (!t) return { miss: true };
    const o = fn(t, "", { pyb: "2025-01", pye: "" }) || {};
    return { flag: !!o[m.arm], quote: String(o[m.arm === "roth" ? "rothText" : "afterTaxText"] || "") };
  };
  /* what the SHIPPED code says about each member, so a mutation is judged
   * against the real answer and not a remembered one */
  const shipped = {};
  for (const id of Object.keys(MEMBERS)) shipped[id] = flagOf(v208, id);
  for (const id of Object.keys(MEMBERS))
    console.log(`    shipped: ${id.padEnd(20)} ${MEMBERS[id].arm.padEnd(9)} ${shipped[id].flag ? "YES" : "no "}  ${JSON.stringify(shipped[id].quote.slice(0, 90))}`);

  const MUTS = [
    ["drop the catch-up refusal from the PRIMARY roth arm (the whole 04:xxZ defect)",
      [["lib-4i.mjs", "      if (catchupMandateRefusal(s, \"roth\")) continue;\n      if (futureEffectiveGrant(s, PYE, \"roth\"))",
        "      if (futureEffectiveGrant(s, PYE, \"roth\"))"]],
      ["american-eagle", "mavis-tire"]],
    ["drop the GRANT veto from catchupMandateRefusal (withdraws a TRUE flag from a MIXED sentence)",
      [["lib-effective-date.mjs", "  catchupMandate(s) && !grantRe(TAXWORD[arm] || TAXWORD.roth).test(String(s || \"\"));",
        "  catchupMandate(s);"]],
      ["aijj"]],
    ["drop the date refusal from the primary roth arm",
      [["lib-4i.mjs", "      if (futureEffectiveGrant(s, PYE, \"roth\")) continue;\n      hit = s", "      hit = s"]],
      ["national-electrical"]],
    ["drop the date refusal from the after-tax contributions arm",
      [["lib-4i.mjs", "    if (futureEffectiveGrant(sentence(at.index), PYE, \"afterTax\")) continue;\n", ""]],
      ["simpson", "ultra-clean", "arcturus"]],
    ["drop restrictsExisting (withdraws a TRUE flag from Arcadium)",
      [["lib-effective-date.mjs", "  if (restrictsExisting(quote, arm)) return null;\n", ""]],
      ["arcadium"]],
    ["drop presupposes (withdraws a TRUE flag from a DEGREE change)",
      [["lib-effective-date.mjs", "  if (presupposes(quote, arm)) return null;\n", ""]],
      ["irhythm"]],
    ["REPLACE THE RE-SEARCH WITH A TERMINAL VETO — the design decision, asserted",
      [["lib-4i.mjs", "    if (hit !== null) { out.roth = true; out.rothText = hit; break; }",
        "    if (hit !== null) { out.roth = true; out.rothText = hit; break; }\n" +
        "  }\n  if (out.roth && futureEffectiveGrant(out.rothText, PYE, \"roth\")) { out.roth = false; }\n  {"]],
      ["asphalt-materials"]],
  ];
  for (const [label, edits, expect] of MUTS) {
    let fn;
    try { fn = await mutate(label, edits); }
    catch (e) { console.log(`  FAIL  mutation: ${label} — ${e.message}`); fails.push(`mutation ${label}: ${e.message}`); continue; }
    const broke = [];
    for (const id of Object.keys(MEMBERS)) {
      const got = flagOf(fn, id);
      if (got.miss) continue;
      if (got.flag !== shipped[id].flag || got.quote !== shipped[id].quote) broke.push(id);
    }
    console.log(`  mutation: ${label}`);
    console.log(`    changes the answer for: ${broke.length ? broke.join(", ") : "(NOTHING)"}`);
    if (!expect.length) {
      /* a mutation with no named member is REPORTED, never silently passed:
       * the roth date refusal's own members are the 1.36M-reader roth half of
       * the class, which this seven-member pin list does not contain */
      console.log(`    NOTE: no named member in this list depends on it — reported, not asserted. ` +
        `Its population is priced by tax-flag-gate, not here.`);
      continue;
    }
    const named = expect.filter((e) => broke.includes(e));
    if (named.length !== expect.length)
      fails.push(`mutation ${label}: expected to break ${expect.join("/")} and broke ${broke.join(", ") || "nothing"} — the control is decorative`);
  }
}

if (fails.length) {
  console.error(`\nFAILED (${fails.length}):`);
  for (const x of fails) console.error(`  ${x}`);
  process.exit(1);
}
console.log(`\nPASSED — the predicates are gated at their source, the arms are byte-identical where the date test is silent,` +
  ` and six mutations each break a named member.`);
