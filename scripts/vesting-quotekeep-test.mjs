#!/usr/bin/env node
/* wampo — GATE FOR v212: THE remainderGraded / carveOut GUARD MUST KEEP THE
 * QUOTE, AND MUST NOT KEEP ANYTHING ELSE.
 *
 * WHAT THE CHANGE IS. In `extractPlanFeatures`'s immediate-vesting loop,
 *     if (!strictGate && (remainderGraded || carveOut)) continue;
 * was a BARE `continue` — it threw the sentence away along with the label, on a
 * sentence that had ALREADY PASSED the employer-scope gate and therefore names
 * employer money by construction. Every other refusal in that loop stores the
 * sentence (v82, v83, v84, v86/87, v202, v211). It now stores it under the
 * siblings' own conditions and still refuses the LABEL.
 *
 * WHY THIS TEST LOOKS DIFFERENT FROM `vesting-wholeaccount-test.mjs`. That one
 * tests a new PREDICATE and can slice it out of lib-4i's bytes. This is a
 * CONTROL-FLOW change inside a 2,500-line function that cannot be lifted out of
 * its file, so the mutants are built by materialising the WORKING TREE's whole
 * module graph with one condition deleted (`lib-refmod.materialiseWorkingTree`,
 * added for this and shared rather than retyped). Without that there would be
 * no leave-one-out evidence at all, and *a control that cannot fail is
 * decorative*.
 *
 * FIXTURE DISCIPLINE. Every sentence below is the SHAPE of a sentence read in a
 * real filing during the sizing pass, and the four largest are quoted verbatim
 * from theirs (ADP TotalSource, Tenet, Select Medical, U.S. Foodservice). The
 * negatives are constructed so that EACH CONDITION IS THE ONLY PROTECTION for
 * at least one of them — *a case protected by two conditions cannot fail for
 * either, so it proves neither* — and the test prints which condition each
 * negative isolates, so an over-wide change cannot pass by accident.
 *
 * It needs no network and no filing corpus, so it runs in build-data's prep and
 * in site-test.
 */
import { readFileSync } from "node:fs";
import { extractPlanFeatures } from "./lib-4i.mjs";
import { vestingQuoteOk } from "./lib-quote.mjs";
import { materialiseWorkingTree } from "./lib-refmod.mjs";

const SPONSOR = "Acme Industries Incorporated";
/* The notes wrapper. `extractPlanFeatures` reads a whole filing, so a bare
 * sentence is not a fixture — and the FIRST version of this file passed a bare
 * sentence and got `null` features back on two cases, which reads exactly like
 * a guard refusing. The wrapper is the minimum that makes the text a
 * plan-description note. */
/* THE TRIGGER FOR `remainderGraded` THAT IS NOT ITSELF A SELECTED SENTENCE, and
 * the one detail that took two attempts. `remainderGraded` fires on another
 * selected sentence, or on the raw notes text through two arms; the second of
 * those is the printed ladder HEADER, `years of service … vested percent`. A
 * table has no terminating period, so the sentence anchor
 * `[^.]{0,220}\bvest(?:ed|ing)?\b[^.]{0,220}\.` cannot terminate inside it —
 * which means a table placed BEFORE the fixture sentence GLUES ONTO IT and the
 * whole table becomes the stored quote (that is what the first version of this
 * file measured, and it reads exactly like the arm working). Placed at the END
 * with nothing period-terminated after it, the table is in `t` and in no
 * sentence, so each fixture below is a single sentence and the condition under
 * test is the only thing that can decide it. */
const LADDER_TABLE = "Years of Service      Vested Percentage\n"
  + "Less than 2                          0\n"
  + "2 but less than 3                   20\n"
  + "6 or more                          100";
const notes = (body) => "NOTES TO FINANCIAL STATEMENTS\n"
  + "Note 1 - Description of Plan\n"
  + "The Plan is a defined contribution plan covering eligible employees of the Company.\n"
  + body + "\n" + LADDER_TABLE;

const ft = (body) => extractPlanFeatures(notes(body), SPONSOR) || {};
let fail = 0;
const bad = (m) => { console.log(`FAIL ${m}`); fail++; };

/* ---- 1. MUST-FIRE: the sentence survives as a quote, and NO label appears ---
 * The label refusal is half the claim: these are sentences stating that
 * employer money vests over YEARS OF SERVICE without saying how, or a
 * multiple-employer plan where no single label is true for every reader. */
const MUST_FIRE = [
  ["ADP TotalSource, 339,248 readers — a multiple-employer plan whose vesting is elected per adopting employer",
    "Vesting in the adopting employer's contribution portion of their accounts, plus actual earnings thereon is based on years of service ranging from immediate to six years graded, as elected by each adopting employer."],
  ["Tenet Healthcare, 141,695 — a service condition with no schedule stated",
    "Vesting in the Employer's contribution portion of their accounts plus actual earnings thereon is based on years of service."],
  ["Select Medical, 60,990 — the same shape with 'continuous service'",
    "Vesting in the Corporation's contribution portion of their accounts is based on years of continuous service."],
  ["Beacon Health System, 14,085 — a service condition that also varies by employer",
    "Vesting in the Company's contribution portion of their account plus earnings thereon is based on years of continuous service and varies based on the election of each employer."],
  ["U.S. Foodservice, 33,735 — the whole filed Years/Percentage ladder inside one window",
    "The participant's vested interest in the matching and discretionary contributions made to his or her account is based on years of service as follows: Vesting Years of Service Percentage Less than 1 0 1 to 2 33 2 to 3 67 3 or more 100."],
  /* THE CARVE-OUT HALF OF THE GUARD, and the fixture is not the obvious one.
   * "except for the portion attributable to Company NON-MATCHING contributions"
   * is the sentence the shipped comment quotes, and it cannot test this arm:
   * `matching contributions` is a SUBSTRING of `non-matching contributions`, so
   * `strictGate` is TRUE, the guard is never reached and the plan labels
   * `Immediate`. *A fragment of a longer word is not thereby a fragment*, met
   * from the other side. The employer money is named without that adjacency
   * here, which is what the real members of this bucket look like. */
  ["a CARVE-OUT rather than a remainder — the other half of the guard",
    "Participants are immediately vested in their own contributions and the Employer's safe harbor contributions, except for the portion attributable to the Company's discretionary profit sharing allocation."],
];
for (const [why, body] of MUST_FIRE) {
  const f = ft(body);
  if (!f.vestingText) bad(`MUST-FIRE "${why}": no quote stored — the guard still discards the evidence`);
  else if (!vestingQuoteOk(f.vestingText)) bad(`MUST-FIRE "${why}": the quote stored is one the renderers refuse, so no reader sees it`);
  if (f.vesting) bad(`MUST-FIRE "${why}": a LABEL appeared (${JSON.stringify(f.vesting)}) — this arm writes vestingText and must never label`);
}

/* ---- 2. MUST-NOT, each naming the condition it is the ONLY protection for --
 * Each body is ONE sentence plus the table trigger, so no other sentence can
 * supply the quote and a pass here means the named condition decided it. */
const MUST_NOT = [
  /* the forfeiture sentence must not end "… to reduce Employer contributions":
   * that phrase satisfies `strictGate` on its own and the guard would never be
   * reached, so the case would prove nothing about the `forfeit` veto. */
  ["forfeit", "a forfeiture-accounting sentence — mentions vesting, states no rule",
    "Vesting in the Employer's discretionary contributions is determined by length of participation, and forfeited amounts were used to reduce the Company's future contributions."],
  ["offTopic", "'refer to the plan document' — the topic marker fires and nothing in the sentence escapes it",
    "Participants should refer to the plan document for a description of the Employer's safe harbor contributions and the vesting provisions applicable to them."],
  ["vestingQuoteOk", "a PLAN AMENDMENT sentence, which the oracle refuses and `offTopic` does not know",
    "The Plan was amended to change the Employer's safe harbor contributions, and amounts previously credited remain vested."],
];
for (const [cond, why, body] of MUST_NOT) {
  const f = ft(body);
  if (f.vestingText) bad(`MUST-NOT (${cond}) "${why}": stored ${JSON.stringify(f.vestingText.slice(0, 110))}`);
  if (f.vesting) bad(`MUST-NOT (${cond}) "${why}": a label appeared (${JSON.stringify(f.vesting)})`);
}

/* ---- 3. NO DISPLACEMENT. A quote a reader ALREADY sees must survive. The
 * earlier store comes from the graded loop's `supersededRule` path, which runs
 * BEFORE the immediate loop and sets `vestingText` with no label — the one
 * place in the chain that can hand this arm a publishable quote to displace.
 * This is the condition v211 paid for by measurement: *adding a WRITER to a
 * first-wins chain RE-ORDERS it.* */
{
  /* `earlier` names "Employer contributions" ADJACENTLY, so it satisfies
   * `strictGate` and therefore never reaches the new guard itself. That detail
   * is the whole case: written with "the Employer's safe harbor contributions"
   * the superseded sentence ALSO trips the guard, the mutant re-wrote the quote
   * on its own second iteration, and the displacement mutant read "not
   * load-bearing" while the condition was doing exactly its job. *A case
   * protected by two conditions cannot fail for either* — here the two were
   * the same condition firing twice. */
  const earlier = "Prior to January 1, 2021, participants became 100% vested in Employer contributions after five years of service.";
  const mine = "Vesting in the Employer's contribution portion of their accounts is based on years of continuous service.";
  /* `mine` is written FIRST in the document on purpose: `vestSentences` is
   * sorted and a "prior to <year>" sentence ranks LAST, so the superseded
   * sentence is processed after `mine` whatever the document order. Putting it
   * first in the text would have tested document order instead of the
   * displacement condition. */
  const alone = ft(earlier);
  if (!alone.vestingText || !/Prior to January 1, 2021/.test(alone.vestingText))
    bad(`NO-DISPLACEMENT premise: the superseded-rule path does not store its own sentence (got ${JSON.stringify((alone.vestingText || "").slice(0, 90))}) — this case proves nothing about displacement`);
  else {
    const both = ft(`${mine}\n${earlier}`);
    if (!/Prior to January 1, 2021/.test(both.vestingText || ""))
      bad(`NO-DISPLACEMENT: the new arm took over a quote already stored — got ${JSON.stringify((both.vestingText || "").slice(0, 110))}`);
  }
}
/* ---- 3b. AND THE DISPLACEMENT ROUTE THE DIFFERENTIAL ACTUALLY FOUND, which
 * 3a cannot see. There the already-stored quote arrives BEFORE the immediate
 * loop; here it arrives AFTER, from the loop's own end-of-loop fallback on a
 * LATER sentence — and that is the shape of all 341 displaced plans, because
 * the guard's sentence sorts first and writes into an EMPTY `vestingText`. The
 * `later` sentence names "Company matching contributions" adjacently, so it
 * satisfies `strictGate`, skips the guard, and reaches that fallback; it is
 * Consumers Energy's own stored quote (27,258 readers), the largest member. */
{
  const mine = "Vesting in the Corporation's contribution portion of their accounts is based on years of continuous service.";
  const later = "Other than for the DCCP, vesting in Company matching contributions is based on years of completed service, as defined by the Plan agreement.";
  const aloneLater = ft(later);
  if (!/Other than for the DCCP/.test(aloneLater.vestingText || ""))
    bad(`NO-DISPLACEMENT-2 premise: the end-of-loop fallback does not store the later sentence on its own (got ${JSON.stringify((aloneLater.vestingText || "").slice(0, 90))}) — this case proves nothing`);
  const aloneMine = ft(mine);
  if (!/Vesting in the Corporation/.test(aloneMine.vestingText || ""))
    bad(`NO-DISPLACEMENT-2 premise: the guard's own sentence is not held on its own — got ${JSON.stringify((aloneMine.vestingText || "").slice(0, 90))}`);
  const both = ft(`${mine}\n${later}`);
  if (!/Other than for the DCCP/.test(both.vestingText || ""))
    bad(`NO-DISPLACEMENT-2: the held sentence displaced a quote the end-of-loop fallback stores — got ${JSON.stringify((both.vestingText || "").slice(0, 120))}`);
}

/* ---- 4. THE STRICT-GATE POPULATION IS UNTOUCHED. The guard reads
 * `!strictGate`, so a sentence naming "Company matching contributions"
 * adjacently never reaches it and must still be LABELLED. If this ever fails,
 * the change has leaked out of its own population. */
{
  const f = ft("Participants are immediately vested in Company matching contributions.");
  if (f.vesting !== "Immediate")
    bad(`STRICT-GATE CONTROL: a plain strictGate sentence no longer labels Immediate (got ${JSON.stringify(f.vesting)})`);
}

/* ---- 5. SLICED MUTANTS. Each deletes ONE condition from the shipped source
 * and must flip a NAMED case. `materialiseWorkingTree` throws if a mutation
 * does not land, so a mutant cannot pass vacuously. */
const GUARD_SRC = "        if (!guardHeldQuote && !/forfeit/i.test(s) && !offTopic && vestingQuoteOk(s))\n"
  + "          guardHeldQuote = cap(s);";
const FILL_SRC = "  if (guardHeldQuote && (!out.vestingText || vestingQuoteUpgrade(out, guardHeldQuote)))\n"
  + "    out.vestingText = guardHeldQuote;";
{
  const src = readFileSync(new URL("./lib-4i.mjs", import.meta.url), "utf8");
  for (const [n, frag] of [["guard body", GUARD_SRC], ["post-loop fill", FILL_SRC]])
    if (!src.includes(frag))
      throw new Error(`the v212 ${n} has moved \u2014 every mutant below would be mutating the wrong text, so this test must fail rather than report`);
}
/* THE DISPLACEMENT FIXTURE, as a body, used by two mutants. */
const DISPLACE_BODY = "Vesting in the Corporation's contribution portion of their accounts is based on years of continuous service.\n"
  + "Other than for the DCCP, vesting in Company matching contributions is based on years of completed service, as defined by the Plan agreement.";
const MUTANTS = [
  ["drop the whole hold (the pre-v212 bare continue)",
    (s) => s.replace(GUARD_SRC, ""),
    MUST_FIRE[1][1], (f) => !f.vestingText,
    "Tenet's sentence is discarded again"],
  ["drop the `forfeit` veto",
    (s) => s.replace("&& !/forfeit/i.test(s) && !offTopic", "&& !offTopic"),
    MUST_NOT[0][2], (f) => !!f.vestingText,
    "the forfeiture-accounting sentence is published"],
  ["drop the `offTopic` veto",
    (s) => s.replace("&& !offTopic && vestingQuoteOk", "&& vestingQuoteOk"),
    MUST_NOT[1][2], (f) => !!f.vestingText,
    "the 'refer to the plan document' sentence is published"],
  ["drop the `vestingQuoteOk` oracle",
    (s) => s.replace("&& vestingQuoteOk(s))\n", "&& true)\n"),
    MUST_NOT[2][2], (f) => !!f.vestingText,
    "the plan-amendment sentence is stored"],
  /* THE TWO MUTANTS THAT PRICE THE FIX ITSELF. The first restores the inline
   * store the differential refuted \u2014 609 plans still gain a quote and 341
   * PUBLISHED quotes are displaced \u2014 and the second drops the blank test from
   * the post-loop fill, which is the same loss by the other route. Neither is
   * hypothetical: the first IS the code this ship started as. */
  ["store inline at the guard instead of HOLDING (the refuted first version)",
    (s) => s.replace(GUARD_SRC,
      "        if ((!out.vestingText || vestingQuoteUpgrade(out, cap(s))) && !/forfeit/i.test(s)\n"
      + "            && !offTopic && vestingQuoteOk(s)) out.vestingText = cap(s);"),
    DISPLACE_BODY, (f) => !/Other than for the DCCP/.test(f.vestingText || ""),
    "Consumers Energy's published quote is displaced by the held sentence"],
  ["drop the blank test from the post-loop fill",
    (s) => s.replace(FILL_SRC, "  if (guardHeldQuote)\n    out.vestingText = guardHeldQuote;"),
    DISPLACE_BODY, (f) => !/Other than for the DCCP/.test(f.vestingText || ""),
    "the fill overwrites a quote the end-of-loop fallback already stored"],
  /* AND ONE REVERSE MUTANT: removing the `continue` would let the arm reach the
   * label branches, which is the thing this change must never do. */
  ["turn the guard's `continue` into a fall-through",
    (s) => s.replace("guardHeldQuote = cap(s);\n        continue;\n      }",
      "guardHeldQuote = cap(s);\n      }"),
    MUST_FIRE[5][1], (f) => f.vesting === "Immediate",
    "the carve-out sentence labels `Immediate` over a profit-sharing portion the filing carves OUT \u2014 which is what the `continue` prevents"],
];
for (const [why, mutate, body, flipped, expect] of MUTANTS) {
  const m = materialiseWorkingTree("lib-4i.mjs", { mutate, label: "v212mut" });
  const lib = await import(m.entryPath);
  const f = lib.extractPlanFeatures(notes(body), SPONSOR) || {};
  if (!flipped(f))
    bad(`MUTANT "${why}" is NOT load-bearing — expected that ${expect}, and the mutated parser still answers `
      + `vesting=${JSON.stringify(f.vesting)} text=${JSON.stringify((f.vestingText || "").slice(0, 90))}`);
}

console.log(`\nvesting-quotekeep: ${MUST_FIRE.length} must-fire, ${MUST_NOT.length} single-protection must-not, `
  + `2 no-displacement routes, 1 strict-gate control, ${MUTANTS.length} materialised mutants (6 forward, 1 reverse)`);
if (fail) { console.error(`\n${fail} v212 quote-keep check(s) FAILED`); process.exit(1); }
console.log("all v212 quote-keep checks pass");
