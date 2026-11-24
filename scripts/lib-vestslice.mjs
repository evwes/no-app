/* wampo — THE VESTING SENTENCE SELECTION, SLICED VERBATIM FROM lib-4i.mjs.
 *
 * WHY A SLICE AND NOT A COPY. `vestSentences` is built inside
 * `extractPlanFeatures`, so no instrument can ask it what it selected without
 * either re-typing it — which measures the re-typing, a defect this record has
 * paid for repeatedly ("SLICE a shipped predicate or construction; never
 * reproduce it from memory") — or slicing it. This slices: the four regions it
 * needs are cut from the bytes of `scripts/lib-4i.mjs` and compiled, so the
 * instrument goes wrong the moment the parser moves rather than silently
 * drifting from it.
 *
 * It answers exactly one question: given a filing's text, WHICH sentences did
 * the vesting loop have to work with? A filing in the ledger's
 * "attachment read, no vesting statement found" bucket either
 *   (a) handed that loop NOTHING — the anchor regex found no sentence; or
 *   (b) handed it sentences and every arm and every quote fallback refused.
 * Those are different repairs, and no store-side field distinguishes them.
 */
import { readFileSync } from "node:fs";
import { SPONSOR_TWO_CLAIM, sponsorMoneyRe, wholeAccountVested, unnarrowedFullVesting } from "./lib-4i.mjs";
import { AV_TRIGGER } from "./lib-quote.mjs";

const ROOT = new URL("..", import.meta.url).pathname.replace(/\/$/, "");
const SRC = readFileSync(`${ROOT}/scripts/lib-4i.mjs`, "utf8");

/** Cut `[from, to)` by literal anchors, asserting both are unique. */
function cut(from, to, label) {
  const a = SRC.indexOf(from);
  if (a < 0) throw new Error(`vestslice: anchor not found for ${label}: ${JSON.stringify(from)}`);
  if (SRC.indexOf(from, a + 1) >= 0) throw new Error(`vestslice: anchor for ${label} is not unique: ${JSON.stringify(from)}`);
  const b = SRC.indexOf(to, a);
  if (b < 0) throw new Error(`vestslice: end anchor not found for ${label}: ${JSON.stringify(to)}`);
  return SRC.slice(a, b);
}

const S_T = cut("const t = text.replace(", "\n  const out = {};", "t normalization");
const S_BOILER = cut("const BOILER = /_{3,}", "\n  const clean =", "BOILER");
const S_CLEAN = cut("const clean = (s) => s", "\n  const cap =", "clean");
const S_VEST = cut("const vestSentences = [];", "\n  // \"are vested immediately\"", "the vestSentences loop");

for (const [name, s, must] of [
  ["t normalization", S_T, "replace(/\\s+/g"],
  ["BOILER", S_BOILER, "provide explanation"],
  ["clean", S_CLEAN, "Notes? to Financial Statements"],
  ["the vestSentences loop", S_VEST, "vestSentences.sort"],
]) if (!s.includes(must)) throw new Error(`vestslice: the ${name} slice is missing ${must} — the boundaries moved`);
/* The loop slice must carry the ANCHOR REGEX and the SORT and stop before the
 * arms, or this instrument would be measuring a different thing than it says. */
if (!/const vre = /.test(S_VEST)) throw new Error("vestslice: the loop slice carries no anchor regex");
if (/out\.vesting/.test(S_VEST)) throw new Error("vestslice: the loop slice reaches into the arms — it must stop at the selection");

const body = [S_T, S_BOILER, S_CLEAN, S_VEST,
  "return { t, vestSentences };"].join("\n");
const fn = new Function("text", body);

/** `{ t, vestSentences }` for one filing's raw text, from the shipped code. */
export function vestingSelection(text) {
  return fn(String(text || ""));
}

/* ---- THE EMPLOYER-SCOPE GATE, sliced as three expressions ----------------
 * The immediate-vesting loop opens with
 *   if (!strictGate && !employerMoney && !universal) continue;
 * and that `continue` runs BEFORE every quote fallback in the loop, so a
 * sentence it refuses yields neither a label nor a quote. It is therefore the
 * only gate in the chain that can leave a filing with a vesting sentence and
 * NOTHING stored, which is exactly the ledger's "attachment read, no vesting
 * statement found". A census of that bucket has to be able to ask it.
 *
 * Sliced as the three `const` expressions rather than as the loop, because the
 * loop body cannot be lifted out of the function it lives in. The three read
 * `s`, `t`, `sponsorName`, `IMMED`, `SPONSOR_TWO_CLAIM` and `sponsorMoneyRe`;
 * the first two module-level names are IMPORTED from lib-4i (same object), and
 * `IMMED` is sliced because it is local to the function. */
const S_IMMED = cut("const IMMED = /immediately?", "\n  const matchImmediate", "IMMED");
const S_EMP = cut("const employerMoney =", "\n      const universal =", "employerMoney");
const S_UNIV = cut("const universal = /\\ball", "\n      const strictGate =", "universal");
/* The end anchor reaches to the gate's own `continue`, so it carries v211's
 * `wholeAcctOnly` too — and when that line was added this slice THREW
 * `ReferenceError: wholeAccountVested is not defined` on its own controls,
 * which is the slicer doing the one thing a retyped copy could never do. The
 * two new names are passed in rather than re-derived. */
/* …and v214's `uvOnly` joined the same region, which moved this end anchor
 * again — the slicer threw `end anchor not found for strictGate` the moment the
 * parser's `continue` line grew its fifth conjunct, which is the one thing a
 * re-typed copy of this gate could never do. The new name is PASSED IN rather
 * than re-derived, exactly as v211's two were. */
const S_STRICT = cut("const strictGate =", "\n      if (!strictGate && !employerMoney && !universal && !wholeAcctOnly && !uvOnly)", "strictGate");
for (const [name, s, must] of [
  ["IMMED", S_IMMED, "always (?:fully |"],
  ["employerMoney", S_EMP, "sponsorMoneyRe(sponsorName)"],
  ["universal", S_UNIV, "all (?:of the |the )?contributions?"],
  ["strictGate", S_STRICT, "company match"],
  ["strictGate", S_STRICT, "wholeAcctOnly"],
  ["strictGate", S_STRICT, "uvOnly"],
]) if (!s.includes(must)) throw new Error(`vestslice: the ${name} slice is missing ${must} — the boundaries moved`);

/* `waPass` is v211's two-pass flag and the slice carries the line that reads
 * it, so it is supplied rather than re-derived — and it defaults to 1, the
 * pass on which the whole-account arm is live, because that is the gate's
 * widest behaviour and the one a census must be able to ask about. */
const gateFn = new Function("s", "t", "sponsorName", "SPONSOR_TWO_CLAIM", "sponsorMoneyRe",
  "wholeAccountVested", "AV_TRIGGER", "waPass", "unnarrowedFullVesting",
  [S_IMMED, S_EMP, S_UNIV, S_STRICT, "return { employerMoney, universal, strictGate, wholeAcctOnly, uvOnly, uv };"].join("\n"));

/**
 * The arms of the employer-scope gate for one candidate sentence.
 * `passes` is the gate's own verdict: false means the loop `continue`s before
 * any quote fallback, so the filing stores nothing at all.
 */
/* `uvArm` IS THE BEFORE/AFTER LEVER AND IT IS NOT A CONVENIENCE. Once v214's
 * arm is inside the gate, `passes` is TRUE for the very sentences a census of
 * "what the gate refuses" must count — so an instrument that asked the shipped
 * gate would measure the post-ship state and report the class it is sizing as
 * empty. *A before/after screen must ask the BEFORE side's index.* Passing
 * `UV_OFF` gives the pre-v214 gate exactly, by handing the slice an arm that
 * answers null; the slice itself is untouched, so the two readings differ in
 * one value and nothing else. `UV_OFF_CONTROL` below proves the lever moves. */
export const UV_OFF = () => null;
export function scopeGate(s, t = s, sponsorName = "", waPass = 1, uvArm = unnarrowedFullVesting) {
  const g = gateFn(s, t, sponsorName, SPONSOR_TWO_CLAIM, sponsorMoneyRe, wholeAccountVested, AV_TRIGGER, waPass, uvArm);
  return { ...g, passes: !!(g.strictGate || g.employerMoney || g.universal || g.wholeAcctOnly || g.uvOnly) };
}
/* A LEVER THAT DOES NOTHING READS EXACTLY LIKE A LEVER THAT IS OFF, and this
 * one decides every before/after number in the pass. So one sentence is pinned
 * on which the two settings MUST disagree, and one on which they must AGREE —
 * without the second, a stub that broke the whole gate would also "pass". */
{
  const S = "Vesting – Participants are immediately vested in their accounts.";
  const on = scopeGate(S, S, "Acme Widgets"), off = scopeGate(S, S, "Acme Widgets", 1, UV_OFF);
  if (!(on.passes && !off.passes)) throw new Error("vestslice: the UV_OFF lever does not move the gate on the pinned v214 sentence");
  const T = "Participants are immediately vested in the Company's matching contributions.";
  const tOn = scopeGate(T, T, "Acme Widgets"), tOff = scopeGate(T, T, "Acme Widgets", 1, UV_OFF);
  if (!(tOn.passes && tOff.passes)) throw new Error("vestslice: UV_OFF changed a sentence the PRE-v214 gate already admitted — the stub is breaking the gate, not disabling one arm");
}

/** The anchor regex itself, for callers that need to ask where it failed. */
export const VEST_ANCHOR = (() => {
  const m = S_VEST.match(/const vre = (\/[\s\S]*?\/[gimsuy]*);/);
  if (!m) throw new Error("vestslice: cannot read the anchor regex out of the slice");
  // eslint-disable-next-line no-new-func
  return new Function(`return ${m[1]};`)();
})();

/* ---- CONTROLS, ABOVE EVERY CALLER BY CONSTRUCTION ------------------------
 * `put a sliced predicate's own controls ABOVE the loop that uses it` — these
 * run at import, so a caller cannot use a broken slice. Each would catch a
 * DIFFERENT failure of the slice:
 *   1. a positive case          — the slice compiles and selects at all
 *                                 (a slice that threw would be caught here,
 *                                  and a slice that selects NOTHING reads
 *                                  exactly like a filing with no vesting)
 *   2. the BOILER veto          — the form's own text must not be selected,
 *                                 so the slice really carries the filter and
 *                                 not just the anchor
 *   3. the top-heavy veto       — the conditional-schedule filter survived
 *   4. the anchor's own blind spot — "vests" alone cannot anchor; this is the
 *                                 property the census is about, so if it ever
 *                                 stops holding the census is measuring
 *                                 nothing and must fail rather than report
 *   5. the SORT                 — forfeiture sentences rank LAST
 */
{
  const ok = vestingSelection("The Plan is a defined contribution plan. Employer contributions vest 20% per year of service and are fully vested after five years. ");
  if (!ok.vestSentences.length) throw new Error("vestslice control 1: the slice selects nothing on a plain vesting sentence");

  const boiler = vestingSelection("Part III   Amendments. Check all boxes that apply: the participant is 100% vested. ");
  if (boiler.vestSentences.length) throw new Error("vestslice control 2: the BOILER veto did not survive the slice");

  const th = vestingSelection("In the event the plan terminates, participants become fully vested in employer contributions. ");
  if (th.vestSentences.length) throw new Error("vestslice control 3: the plan-termination veto did not survive the slice");

  const plural = vestingSelection("The employer contribution vests at the rate of 20% for each year of service. ");
  if (plural.vestSentences.length) throw new Error("vestslice control 4: the anchor now reaches a bare \"vests\" — the census's own premise has changed and its buckets no longer mean what they say");

  const sorted = vestingSelection("Forfeited non-vested accounts were used to reduce Company contributions. Employer contributions are fully vested after three years of service. ");
  if (sorted.vestSentences.length !== 2) throw new Error(`vestslice control 5: expected 2 sentences, got ${sorted.vestSentences.length}`);
  if (/[Ff]orfeit/.test(sorted.vestSentences[0])) throw new Error("vestslice control 5: the forfeiture demotion did not survive the slice");

  /* ---- and the gate's own controls, one per arm, each ALONE ----
   * `a case protected by TWO conditions cannot fail for either, so it proves
   * neither` — so each case below is chosen to satisfy exactly one arm, and
   * the assertion names which. Control 9 is the refusal the whole census is
   * about: an EMPLOYEE-money sentence must fail the gate, because that is the
   * answer the gate exists to withhold. */
  const g6 = scopeGate("Participants are immediately vested in Company matching contributions.");
  if (!g6.strictGate) throw new Error("vestslice control 6: strictGate does not reach a plain \"Company matching contributions\"");
  const g7 = scopeGate("Participants are immediately vested in the Bank's annual contributions.");
  if (g7.strictGate || g7.universal) throw new Error("vestslice control 7: the case is protected by more than employerMoney — it proves nothing about that arm");
  if (!g7.employerMoney) throw new Error("vestslice control 7: employerMoney does not reach a non-generic employer noun");
  const g8 = scopeGate("Participants are immediately vested in all contributions made to the Plan.");
  if (g8.strictGate || g8.employerMoney) throw new Error("vestslice control 8: the case is protected by more than universal — it proves nothing about that arm");
  if (!g8.universal) throw new Error("vestslice control 8: the universal arm does not reach \"all contributions\"");
  const g9 = scopeGate("Participants are immediately vested in their voluntary contributions.");
  if (g9.passes) throw new Error("vestslice control 9: the gate now ADMITS an employee-money sentence — the refusal this census is built on has gone");
  /* v211's own arm, and the case where it is the ONLY protection: no generic
   * employer noun, no "all contributions", no "all plan accounts". */
  const g10 = scopeGate("Vesting Participants are fully vested in Plan accounts at all times.");
  if (g10.strictGate || g10.employerMoney || g10.universal)
    throw new Error("vestslice control 10: Microsoft's sentence is protected by more than the whole-account arm — it proves nothing about that arm");
  if (!g10.wholeAcctOnly) throw new Error("vestslice control 10: the whole-account arm does not reach its own case");
  /* and control 11: on PASS 0 the arm must be inert, which is the property
   * that makes v211 unable to change any label the shipped loop already
   * settles. A slice where pass 0 fires would mean the two-pass guard has
   * gone and the 17 displaced quotes would be back. */
  if (scopeGate("Vesting Participants are fully vested in Plan accounts at all times.", undefined, "", 0).wholeAcctOnly)
    throw new Error("vestslice control 11: the whole-account arm fires on PASS 0 — the two-pass guard has gone");
}
