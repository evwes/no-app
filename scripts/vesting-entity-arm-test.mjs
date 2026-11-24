#!/usr/bin/env node
/* wampo — THE GATE FOR v215's EMPLOYER-ROLE SCOPE ARM.
 *
 *   node scripts/vesting-entity-arm-test.mjs
 *
 * Corpus-free and CI-safe: every sentence below is lifted VERBATIM from a
 * filing that was read, so this runs anywhere. The population-level pricing of
 * each token lives in the accuracy-log entry and was derived with the corpus;
 * this is the regression gate.
 *
 * FIVE SECTIONS:
 *   1. must-FIRE     — one per cause, and one per vocabulary token that is the
 *                      SOLE reach for a plan in the measured population
 *   2. must-NOT-FIRE — every refusal, each on the filing or shape that earned
 *                      it, including the TWO WHOLE ARMS refused on v214's
 *                      record (QNEC, prevailing wage) and the FIVE possessors
 *                      refused by reading
 *   3. the GATE, not the predicate — `eemOnly` is what ships, so it is asked
 *      through `lib-vestslice`'s sliced gate, with the pass-0 inertness and the
 *      `mine && !everythingBefore` attribution both asserted
 *   4. END TO END through `extractPlanFeatures` — the two `labelBlocked` arms
 *      are CONTROL FLOW, not predicates, so the only honest test of them is
 *      the real extractor on the real sentence. *Testing the parts is not
 *      testing the path.*
 *   5. SLICED MUTANTS — one per condition, with the mutation KIND matched to
 *      the condition kind: a REQUIREMENT is widened to always-match, a REFUSAL
 *      is neutered. Each carries a CONTROL case that must NOT change, or a
 *      mutant that simply broke the predicate reads as a successful flip.
 */
import { readFileSync } from "node:fs";
import { employerEntityMoney, extractPlanFeatures } from "./lib-4i.mjs";
import { scopeGate, EEM_OFF } from "./lib-vestslice.mjs";

const R = new URL("..", import.meta.url).pathname.replace(/\/$/, "");
let bad = 0;
const ok = (c, msg) => { if (!c) { bad++; console.log(`  FAIL ${msg}`); } };

/* ---- 1. MUST FIRE ------------------------------------------------------- */
const FIRE = [
  ["Children's Hospital of Orange County (8,267) and 281 more — the class's commonest sentence, and `organization` is the sole reach for 282 plans / 159,632 readers",
    "Vesting Participants are vested immediately in their contributions and the Organization’s contributions plus actual earnings thereon.", "Childrens Hospital Of Orange County", "poss"],
  ["Orrick Herrington (3,184) — `firm`, 16 plans / 25,161 readers",
    "Vesting Participants are vested immediately in their contributions and the Firm’s contributions plus actual earnings thereon.", "Orrick, Herrington & Sutcliffe Llp", "poss"],
  ["St. Jude Children's Research Hospital (11,703) — `hospital`, and a SCHEDULE rather than an immediate claim: the arm admits it so the quote path can publish the filing's own words",
    "Vesting in the Hospital’s contribution portion of their accounts is based on years of service, as follows: Percentage Vested Years of Vesting Service: 0 to 1 —% 2 50 3 or more 100", "St. Jude Children'S Reseach Hospital", "poss"],
  ["Embry-Riddle (6,700) — `university`, 12 plans / 36,986 readers",
    "For participants hired prior to July 1, 2012, the University’s contributions were vested after one year of employment (defined as 1,000 hours worked during the Plan year).", "Embry-Riddle Aeronautical University", "poss"],
  ["Woodward Academy (1,050) — `school`, 22 plans / 7,954 readers",
    "Vesting Participants are vested immediately in their contributions and the School’s contributions in addition to actual earnings thereon.", "Woodward Academy, Inc.", "poss"],
  ["Ithaca College (3,698) — `college`",
    "Participants who were hired prior to January 1, 2019 are immediately vested in the College’s contributions.", "Ithaca College", "poss"],
  ["Child and Family Services of Erie County (1,650) — `agency`",
    "Vesting Participants are vested immediately in their contributions and the Agency’s contributions plus actual earnings thereon.", "Child And Family Services Of Erie County", "poss"],
  ["UChicago Argonne (5,076) — `laboratory`",
    "Vesting Participants are immediately vested in the Laboratory’s contributions, plus actual earnings thereon upon entry into the Plan.", "Uchicago Argonne, Llc Argonne National Laboratory", "poss"],
  ["Phoebe Putney Health System (6,293) — `system`",
    "Vesting in the System’s contributions is based on years of continuous service.", "Phoebe Putney Health System, Inc.", "poss"],
  ["Brookdale Hospital Medical Center (1,829) — `center`, and its `centre` twin",
    "Vesting Participants are vested immediately in their contributions and the Center's contributions plus actual earnings thereon.", "Brookdale Hospital Medical Center", "poss"],
  ["Greater Omaha Packing (1,689) — the PLURAL POSSESSIVE `Companies'`, which a four-spelling suffix read as 0 plans while the data carries eleven",
    "Vesting in the Companies' contribution portion of their accounts is based on years of continuous service.", "Greater Omaha Packing Co., Inc.", "poss"],
  ["Hobart and William Smith Colleges (1,467) — the plural `Colleges'`",
    "Vesting Participants are immediately vested in their account balance, which includes voluntary contributions, the Colleges’ contributions, and actual earnings/losses thereon.", "Hobart And William Smith Colleges", "poss"],
  ["Redstone Federal Credit Union (1,810) — `credit union`, the narrowed form of a token whose bare version would read a Taft-Hartley `Union`",
    "Vesting Participants are vested immediately in their contributions and the Credit Union’s contributions plus actual earnings thereon.", "Redstone Federal Credit Union", "poss"],
  ["The Metropolitan Museum of Art (2,810) — `museum`",
    "Participants are 100% vested in the Museum’s contributions after completing two plan (calendar) years and at least 1,000 hours of service in each of those two years.", "The Metropolitan Museum Of Art", "poss"],
  ["AIDS Healthcare Foundation (3,905) — `foundation`",
    "Vesting in the Foundation’s contribution plus actual earnings thereon is also immediate.", "Aids Healthcare Foundation", "poss"],
  ["Van Andel Research Institute (731) — `institute`",
    "Vesting in the Institute's contributions, plus actual earnings thereon, is based on years of service.", "Van Andel Research Institute", "poss"],
  ["UMS-Wright (332) — `institution`",
    "Vesting Participants are immediately 100% vested in their contributions and the Institution’s contributions, plus actual earnings thereon.", "Ums-Wright Preparatory School", "poss"],
  ["Endress+Hauser (1,391) — `group`",
    "Vesting Participants are immediately vested in their contributions and the Group’s contributions plus actual earnings or losses thereon, which is in compliance with the required provisions to operate as a Safe Harbor 401(k) Plan.", "Endress+Hauser Inc.", "poss"],
  ["Durham Academy (628) — `academy`",
    "Participant vesting in the Academy’s contribution portion of their accounts is immediate.", "Durham Academy, Inc.", "poss"],
  ["Oahu Country Club (199) — `club`",
    "(5) Vesting - Participants are immediately vested in their contributions and the Club’s contribution portion of their accounts, plus actual earnings thereon and such balance is not subject to forfeiture for any reason.", "Oahu Country Club", "poss"],
  ["John G. Shedd Aquarium (606) — `society`",
    "Participants who terminated prior to January 1, 2022 vest in the Society's contribution portion of their accounts, plus actual earnings thereon, after three years of service.", "John G. Shedd Aquarium", "poss"],
  ["San Francisco Conservatory of Music (719) — `conservatory`",
    "The portion of the participant’s accounts attributable to the Conservatory’s contributions are also vested 100%.", "San Francisco Conservatory Of Music", "poss"],
  ["National Council of State Boards of Nursing (302) — `council`",
    "Vesting: Participants become 100% vested in the Council’s contributions plus actual earnings thereon after six months of consecutive service.", "National Council Of State Boards Of Nursing, Inc.", "poss"],
  ["Columbia University (32,861) — ALL-MOD: an INTERVENING WORD between `all` and `contributions`, which `universal`'s literal test cannot cross",
    "Vesting of Plan Contributions A participant is 100% vested in all plan contributions once they are made, and the earnings thereon are at all times non-forfeitable.", "Trustees Of Columbia University", "all-mod"],
  ["Dungarvin (6,066) — ALL-MOD, the `sources of` spelling",
    "Vesting Participants are immediately vested in all sources of contributions plus actual earnings thereon.", "Dungarvin Group, Inc.", "all-mod"],
  ["Nana Regional (4,782) — ALL-MOD, the `contribution types` spelling",
    "Vesting: All participants are 100% vested in all contribution types immediately upon entry into the Plan.", "Nana Regional Corporation, Inc.", "all-mod"],
  ["Jones Lang LaSalle (48,832) — ALL-AMT: the subject is `all amounts contributed` and a PREPOSITIONAL PHRASE sits between it and the verb, which the SUBJECT arm cannot cross and must not be loosened to",
    "Vesting All amounts contributed to the Plan are immediately 100% vested, except under a prior retirement plan that was merged into the Plan may be subject to a different vesting schedule.", "Jones Lang Lasalle Americas, Inc.", "all-amt"],
  ["American Public Media Group (1,306) — ALL-MOD, the `amounts contributed` spelling in OBJECT position",
    "Vesting Participants are immediately vested in all amounts contributed.", "American Public Media Group", "all-mod"],
  ["George Washington University (14,802) — ALL-SUBJ: the un-narrowed phrase is the SUBJECT, not the object",
    "All plan contributions and benefits derived therefrom are immediately fully vested and nonforfeitable.", "The George Washington University", "all-subj"],
  ["Worthington Enterprises (4,209) — ALL-PREFIX: the positive arm matches and the employee veto fires on `all participant`, a PREFIX of `all participants are`",
    "Vesting: All participants are 100% vested in all contributions and related earnings credited to their accounts.", "Worthington Enterprises, Inc.", "all-prefix"],
  ["West Penn Allegheny Health System (14,519) — the SPONSOR'S OWN INITIALISM, which needs no vocabulary",
    "Vesting Participants are vested immediately in their contributions and WPAHS's contributions plus actual earnings thereon.", "West Penn Allegheny Health System", "acronym"],
  ["Workers' Compensation Insurance Rating Bureau of California (244) — an initialism with stop-words dropped",
    "Vesting Participants are vested immediately in their contributions and the WCIRB’s contributions plus actual earnings thereon.", "Workers' Compensation Insurance Rating Bureau Of California", "acronym"],
];
for (const [why, s, sponsor, kind] of FIRE) {
  const r = employerEntityMoney(s, sponsor);
  ok(r, `must FIRE and does not — ${why}`);
  ok(r && r.kind === kind, `fires under the wrong arm (${r && r.kind} != ${kind}) — ${why}`);
}
/* Fixtures are reached BY NAME below, never by index: inserting one case into
 * the list above silently re-pointed four mutant probes the first time, and a
 * probe aimed at the wrong fixture reads exactly like a mutation that is not
 * load-bearing. `fx` throws unless the tag identifies exactly one row. */
const fx = (tag) => {
  const hit = FIRE.filter(([why]) => why.includes(tag));
  if (hit.length !== 1) throw new Error(`fixture tag ${JSON.stringify(tag)} matches ${hit.length} rows, not 1`);
  return [hit[0][1], hit[0][2]];
};

/* ---- 2. MUST NOT FIRE -------------------------------------------------- */
const SILENT = [
  ["Teamsters-UPS (451,730) — the LARGEST member of the gated bucket and a CORRECT refusal: its notes describe pre-tax, after-tax, voluntary, catch-up and rollover money and NO employer contribution at all",
    "Vesting Participants are vested immediately in their contributions plus actual earnings thereon.", "Board Of Trustees Of The Teamsters - Ups 401k National Savings Plan"],
  ["the gate's whole reason for existing — employee money is vested by law",
    "Participants are immediately vested in their voluntary contributions.", "Acme Widgets Inc."],
  ["UPMC (109,112) — the participant's own pots named one by one",
    "Participants are always fully vested in their pretax and after-tax contributions.", "Upmc"],
  ["a QNEC is a CORRECTIVE pot, not the plan's employer money — v214's record names Day & Zimmermann, whose match vests over FIVE YEARS, as the harm (3 plans / 43,506 readers refused)",
    "The QNECs are immediately 100% vested to the employees.", "The Procter & Gamble Company"],
  ["prevailing-wage money is a DAVIS-BACON pot and says nothing about the match (9 plans / 11,356 readers refused)",
    "Vesting - Participants are immediately vested in their contributions, their share of prevailing wage contributions and rollover contributions.", "Inter-Con Security Systems, Inc."],
  ["a bare `Union's contributions` — in a Taft-Hartley plan the money comes from signatory EMPLOYERS and the union is not the sponsor (3 plans / 1,323 readers of `plan` and 5 / 4,173 of `union`, the credit unions kept by the narrower token)",
    "Vesting in the Union’s contributions is based on years of service.", "Local 123 Pension Fund"],
  ["`the Plan's contributions` can equally name the total contributions MADE TO the plan, which include the participant's own (The Felton Institute, 746)",
    "Vesting in the Plan’s contribution is based on years of service, as defined, until fully vested for three years or more.", "The Felton Institute"],
  ["`Management's Contributions` is the sponsor's own name wearing a role word; the repair for that family is `sponsorMoneyRe`'s IMMED gating (MidPen, 858)",
    "MidPen Management's Contributions and related earnings are vested in accordance with the schedule below.", "Midpen Property Management Corp."],
  ["`Unity House's discretionary contribution` — same cause (745)",
    "Employees are 100% vested in Unity House’s discretionary contribution at the time of the contribution.", "Unity House Of Troy, Inc."],
  ["`the Organization and Plan Administrator's contributions` — the possessive sits on a role word that was refused, and the apostrophe is not adjacent to `Organization` (Packard, 463)",
    "Vesting Participants are vested immediately in their contributions and the Organization and Plan Administrator’s contributions plus actual earnings thereon.", "Packard Children'S Health Alliance"],
  ["the employee-narrowing veto on the ALL-PREFIX arm must still hold when the narrowing word really does modify a money noun",
    "Participants are 100% vested in all employee contributions at all times.", "Acme Widgets Inc."],
  ["…and on `all of their own`",
    "Participants are fully vested at all times in all of their own contributions.", "Acme Widgets Inc."],
  ["an entity word with NO possessive is not a possessor — `the System contribution` is BJC's spelling and needs a different mechanism",
    "Prior to December 31, 2025, the System contribution vests 50% after one year of vesting service and 100% with two years of vesting service.", "Bjc Health System"],
  ["an ALL-CAPS possessive that is NOT this sponsor's initialism — the acronym half is an IDENTITY test and `EE's contributions` is EMPLOYEE money",
    "Participants are immediately vested in their contributions and EE's contributions plus actual earnings thereon.", "Zeta Manufacturing Holdings"],
  ["Qualtek USA (1,054) — `all participants BECAME 100% vested in all contributions` upon a resolution to terminate: the tense is what refuses it",
    "Vesting Upon the resolution to terminate the Plan, all participants became 100% vested in all contributions plus actual earning thereon.", "Qualtek Usa, Llc"],
  ["a plan WIND-DOWN, which dominates the general reading of the all-prefix defect (87 corpus sentences)",
    "In accordance with Plan provisions, all benefit accruals ceased, all participants became fully vested in their accounts, and all contributions ceased.", "Acme Widgets Inc."],
  ["a sentence with no vesting content at all",
    "The Plan is a defined contribution plan covering all eligible employees who make contributions.", "Acme Widgets Inc."],
];
for (const [why, s, sponsor] of SILENT) ok(!employerEntityMoney(s, sponsor), `must NOT fire and does — ${why}`);

/* ---- 3. THE GATE, NOT THE PREDICATE ------------------------------------ */
{
  const [s, sp] = fx("Children's Hospital of Orange County");
  ok(scopeGate(s, s, sp).eemOnly, "the sliced gate does not admit the arm's own largest case — every assertion below would pass vacuously");
  ok(scopeGate(s, s, sp).passes, "the gate does not PASS on the arm's own case, so the loop still `continue`s before every quote fallback");
  ok(!scopeGate(s, s, sp, 1, undefined, EEM_OFF).eemOnly, "EEM_OFF does not disable the arm — the before/after lever is broken");
  /* pass 0 must be byte-identical to the pre-v215 gate: the arm is
   * `waPass === 1` only, which is the whole additive-by-construction claim */
  ok(!scopeGate(s, s, sp, 0).eemOnly, "the arm fires on waPass 0 — it is NOT additive by construction and pass 0 is no longer the shipped loop");
  /* …and `mine && !everythingBefore`: a sentence an EXISTING arm admits must
   * not be attributed to this one, or every reader figure double-counts. */
  const old = "Participants are immediately vested in Company matching contributions.";
  ok(scopeGate(old, old, "Acme").strictGate && !scopeGate(old, old, "Acme").eemOnly,
    "a sentence the SHIPPED strict gate already admits is attributed to the v215 arm — the arm is not keyed on the earlier arms being false");
  /* the employee-money refusal, through the gate rather than the predicate */
  ok(!scopeGate(SILENT[0][1], SILENT[0][1], SILENT[0][2]).passes,
    "the gate now ADMITS Teamsters-UPS's employee-money sentence — the refusal this arm was built around has gone");
}

/* ---- 4. END TO END through the real extractor --------------------------- */
/* The two `labelBlocked` arms are CONTROL FLOW. A predicate test cannot see
 * them, and a hand-rebuilt loop would measure the re-typing, so each is asked
 * of `extractPlanFeatures` on the sentence that earned it, wrapped in the
 * minimum note context the selection needs. */
const NOTE = (s) => "NOTES TO FINANCIAL STATEMENTS NOTE 1 DESCRIPTION OF PLAN The Plan is a "
  + "defined contribution plan. " + s + " Payment of Benefits On termination of "
  + "service, a participant may elect to receive a lump sum. ";
const E2E = [
  ["the arm's own largest shape must LABEL and QUOTE",
    fx("Children's Hospital of Orange County")[0], fx("Children's Hospital of Orange County")[1], "Immediate", true],
  ["University of Redlands (1,650) — TWO CLAIMS in one sentence: `Immediate` would be the OPPOSITE of the truth for the employer money, and nothing else in this loop stops it. The quote states the real three-year rule.",
    "Vesting – Participants are vested immediately in their contributions, plus actual earnings thereon, and the University’s contributions are vested after three years of service.",
    "University Of Redlands", null, true],
  ["COUNTER-SPECIMEN — Qualtek USA (1,054): vesting caused by the plan WINDING UP must publish NOTHING, not even a quote. `planTermCond` cannot see it (its arms want `plan` adjacent to `termination` and the condition before the verb), so what refuses it is the all-prefix arm's `are|were` tense. A wider arm labelled this plan `Immediate`.",
    "Vesting Upon the resolution to terminate the Plan, all participants became 100% vested in all contributions plus actual earning thereon.",
    "Qualtek Usa, Llc", null, false],
  ["Misericordia University (714) and New England Baptist Hospital (2,221) — PAST TENSE is not a wind-down. A `UV_WOUND_UP` guard was written here and removed because these two were the only sentences it reached.",
    "Vesting Participants were vested immediately in their contributions and the Organization's contributions plus actual earnings thereon.",
    "Misericordia University", "Immediate", true],
  ["St. Jude (11,703) — a SCHEDULE: no label, and the filing's own ladder as the evidence",
    "Vesting in the Hospital’s contribution portion of their accounts is based on years of service, as follows: Percentage Vested Years of Vesting Service: 0 to 1 —% 2 50 3 or more 100",
    "St. Jude Children'S Reseach Hospital", null, true],
  ["COUNTER-SPECIMEN — Teamsters-UPS (451,730) must publish NOTHING AT ALL, not even a quote. A ship that gives this plan a vesting answer is wrong at the top of every ranked list.",
    SILENT[0][1], SILENT[0][2], null, false],
  ["COUNTER-SPECIMEN — an employee-money sentence with the word `voluntary`",
    SILENT[1][1], SILENT[1][2], null, false],
  ["COUNTER-SPECIMEN — the QNEC sentence must move nothing",
    SILENT[3][1], SILENT[3][2], null, false],
  ["COUNTER-SPECIMEN — the prevailing-wage sentence must move nothing",
    SILENT[4][1], SILENT[4][2], null, false],
];
/* THE ACCELERATION-DISPLACEMENT GUARD, ASKED IN BOTH DIRECTIONS. It is CONTROL
 * FLOW, so the sliced-mutant machinery below cannot reach it, and a single case
 * would not separate "the guard fires" from "the arm never reaches that write at
 * all". Audubon Engineering (2,065) is the differential's one real regression:
 * the age-65 clause replaced the plan's real rule because v203's acceleration
 * branch writes `out.vestingText` UNCONDITIONALLY and `break`s.
 *   NECESSITY  — with the good sentence FIRST, the stored quote must survive.
 *   SUFFICIENCY — with the acceleration sentence ALONE, it must still be
 *                 stored, or the guard is blocking the write entirely rather
 *                 than declining to displace. */
{
  const GOOD = "Vesting A participant is fully vested in their contributions, employer matching contributions, and related earnings at all times.";
  const ACCEL = "A participant becomes 100% vested in all Companies’ contributions after attaining normal retirement age of 65, disability or death.";
  const SP = "Audubon Engineering Company, L.L.C.";
  const both = extractPlanFeatures(NOTE(GOOD + " " + ACCEL), SP) || {};
  ok(!both.vesting, `Audubon: the acceleration clause must not produce a LABEL, got ${JSON.stringify(both.vesting)}`);
  ok(both.vestingText && both.vestingText.includes("employer matching contributions"),
    `Audubon: the age-65 clause DISPLACED the plan's real rule — got ${JSON.stringify(String(both.vestingText).slice(0, 90))}`);
  const alone = extractPlanFeatures(NOTE(ACCEL), SP) || {};
  ok(!alone.vesting, "Audubon control: the acceleration clause alone must still produce no label");
  ok(alone.vestingText && alone.vestingText.includes("normal retirement age"),
    "Audubon control: the acceleration clause alone is NOT stored, so the guard is blocking the write rather than declining to displace — the necessity assertion above proves nothing");
}

for (const [why, s, sponsor, label, quoted] of E2E) {
  const o = extractPlanFeatures(NOTE(s), sponsor) || {};
  ok((o.vesting || null) === label, `END TO END label is ${JSON.stringify(o.vesting || null)}, expected ${JSON.stringify(label)} — ${why}`);
  ok(!!o.vestingText === quoted, `END TO END quote ${o.vestingText ? "present" : "absent"}, expected ${quoted ? "present" : "absent"} — ${why}`);
}

/* ---- 5. SLICED MUTANTS ------------------------------------------------- */
const SRC = readFileSync(`${R}/scripts/lib-4i.mjs`, "utf8");
const BLOCK = (() => {
  const h = SRC.indexOf("const EE_ENTITY = ");
  const e = SRC.indexOf("\n}", SRC.indexOf("export function employerEntityMoney"));
  if (h < 0 || e < 0) throw new Error("vesting-entity-arm-test: the v215 block moved in lib-4i.mjs");
  return SRC.slice(h, e + 2).replace(/^export /gm, "");
})();
const build = (mutate) => {
  const s = mutate(BLOCK);
  if (s === BLOCK) throw new Error("a mutation did not land — its target string has moved in lib-4i.mjs");
  // eslint-disable-next-line no-new-func
  return new Function(`${s}\n return employerEntityMoney;`)();
};
/* prove the slicer works UNMUTATED first — *a broken slice makes every mutant
 * pass vacuously*. */
{
  const probe = build((s) => s + "\n/* probe */");
  for (const [why, t, sp] of FIRE) if (!probe(t, sp))
    throw new Error(`the slice cannot reproduce its own positive (${why}) — every mutant below would be meaningless`);
  for (const [why, t, sp] of SILENT) if (probe(t, sp))
    throw new Error(`the slice fires on its own refusal (${why}) — the slice is broken`);
}
const ALWAYS = "/(?:)/";
const MUTANTS = [
  /* REQUIREMENT: the possessive APOSTROPHE. Widened to make the apostrophe
   * optional, which is the always-match direction for this condition, and the
   * probe is the shape that proves the apostrophe is doing the work — BJC's
   * `the System contribution` names no possessor and is a schedule sentence. */
  ["REQUIREMENT the possessive apostrophe — BJC Health System's `the System contribution` must stay refused",
    (s) => s.replace("s?['’]s?\\\\s+", "s?['’]?s?\\\\s+"),
    ["Prior to December 31, 2025, the System contribution vests 50% after one year of vesting service and 100% with two years of vesting service.", "Bjc Health System"],
    fx("Children's Hospital of Orange County")],
  /* REQUIREMENT: the entity vocabulary itself. Widened to any word, and the
   * probe is the employee-money sentence the gate exists to refuse — if any
   * possessor counted, `their contributions` would read as employer money. */
  ["REQUIREMENT the EE_ENTITY vocabulary — widened to any possessor, Teamsters-UPS fires",
    (s) => s.replace("const EE_ENTITY = \"organi[sz]ation", "const EE_ENTITY = \"[a-z]+|organi[sz]ation"),
    ["Vesting Participants are vested immediately in their participants’ contributions plus actual earnings thereon.", "Acme"],
    fx("Orrick Herrington")],
  /* REQUIREMENT: the ALL-PREFIX arm's SUBJECT-AND-OBJECT shape. Widened so the
   * object may be anything, which is the always-match direction, and the probe
   * is the wind-down sentence that dominates the general reading of this
   * defect: 87 corpus sentences match "the veto fired on a prefix" and most are
   * "all benefit accruals ceased, ALL PARTICIPANTS BECAME FULLY VESTED IN THEIR
   * ACCOUNTS, and all contributions ceased". The tight arm refuses it, and
   * widening the object admits it. */
  ["REQUIREMENT the ALL-PREFIX arm's object must be `all contributions` — widened, a plan WIND-DOWN fires",
    (s) => s.replace("\\bvested\\s+in\\s+all\\s+contributions?\\b/i", "\\bvested\\s+in\\s+[a-z ]+/i"),
    ["In accordance with Plan provisions, all benefit accruals ceased, all participants are fully vested in their accounts, and all contributions ceased.", "Acme"],
    fx("Worthington Enterprises")],
  /* REQUIREMENT: the ALL-PREFIX arm's `are|were` tense. The wind-down shapes
   * write `became`, and admitting them is what made the general version of this
   * arm net harmful. */
  ["REQUIREMENT the ALL-PREFIX arm's `are|were` — widened to `became`, PCSB Bank's plan-termination sentence fires",
    (s) => s.replace("\\ball participants?\\s+(?:are|were)\\b", "\\ball participants?\\s+(?:are|were|became)\\b"),
    ["Vesting: As a result of Plan termination, described above, all participants became fully vested in all contributions.", "Pcsb Bank"],
    fx("Worthington Enterprises")],
  /* REQUIREMENT: the ACRONYM identity test. Widened to accept any all-caps
   * possessive, and the probe is `EE's contributions` — EE is employee. */
  ["REQUIREMENT the acronym IDENTITY test — widened to a shape test, `EE's contributions` fires",
    (s) => s.replace("if ((a && a.includes(m[1])) || (b && b.includes(m[1]))) return { kind: \"acronym\" };", "return { kind: \"acronym\" };"),
    [SILENT[13][1], SILENT[13][2]],
    fx("Children's Hospital of Orange County")],
  /* REVERSE DIRECTION: each half must be load-bearing for a positive. */
  ["DISJUNCT EE_POSS must be load-bearing (reverse: a positive is LOST)",
    (s) => s.replace("if (EE_POSS.test(x)) return { kind: \"poss\" };", ""),
    fx("Children's Hospital of Orange County"), fx("Columbia University")],
  ["DISJUNCT EE_ALL_MOD must be load-bearing for Columbia (reverse)",
    (s) => s.replace("if (EE_ALL_MOD.test(x)) return { kind: \"all-mod\" };", ""),
    fx("Columbia University"), fx("Children's Hospital of Orange County")],
  ["DISJUNCT EE_ALL_SUBJ must be load-bearing for George Washington (reverse)",
    (s) => s.replace("if (EE_ALL_SUBJ.test(x)) return { kind: \"all-subj\" };", ""),
    fx("George Washington University"), fx("Children's Hospital of Orange County")],
  ["DISJUNCT the acronym half must be load-bearing for WPAHS (reverse)",
    (s) => s.replace("  if (sponsorName) {", "  if (false) {"),
    fx("West Penn Allegheny"), fx("Children's Hospital of Orange County")],
];
for (const [why, mut, probe, control] of MUTANTS) {
  const m = build(mut);
  const got = !!m(probe[0], probe[1]), shipped = !!employerEntityMoney(probe[0], probe[1]);
  ok(got !== shipped, `MUTANT "${why}" is NOT load-bearing: the predicate still answers ${shipped} on its own case`);
  ok(!!m(control[0], control[1]) === !!employerEntityMoney(control[0], control[1]),
    `MUTANT "${why}" also changed its CONTROL case — the mutation broke the predicate rather than removing one condition`);
}

console.log(`vesting-entity-arm: ${FIRE.length} must-fire (one per cause and per sole-reach token), `
  + `${SILENT.length} must-not-fire, 6 gate-level assertions, 4 for the acceleration-displacement guard (both directions), ${E2E.length} end-to-end through extractPlanFeatures `
  + `(${E2E.filter(([w]) => w.startsWith("COUNTER")).length} of them COUNTER-specimens), ${MUTANTS.length} sliced mutants (${MUTANTS.length - 4} forward, 4 reverse), each with its own control`);
console.log(bad ? `${bad} FAILURES` : "all v215 employer-role scope arm checks pass");
process.exit(bad ? 1 : 0);
