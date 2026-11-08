/* wampo — THE FIELD LEDGER: one cell per plan per published field.
 *
 * WHY THIS EXISTS. The project's accuracy machinery measures ITEMS — confident
 * lineups, match coverage, vesting coverage — each on its own axis, each in its
 * own units. That is enough to spot a regression and not enough to answer the
 * question the owner actually asks: *for this plan, which of the seven things a
 * reader came for do we know, and which do we not?* A swarm of agents cannot
 * coordinate on seven unrelated counters; it can coordinate on a ledger.
 *
 * THE SEVEN FIELDS, as the owner named them:
 *   custodian      who keeps the plan's records (Fidelity, Vanguard, Voya, …)
 *   match          the employer formula, incl. discretionary / true-up
 *   vesting        cliff vs graded, years, percent per year
 *   contributions  pretax / Roth / AFTER-TAX availability
 *   lineup         the fund menu: names, tickers, brokerage window
 *   fees           expense ratio, or a labelled comparable for a trust
 *   performance    YTD / 1YR / 5YR / 10YR
 *
 * THE ONE DESIGN DECISION THAT MATTERS, AND IT IS THE DENOMINATOR.
 *
 * 44,114 of the 112,652 plans in the universe are SHORT-FORM filers, and a
 * short-form filer attaches no audited financial statements BY LAW. Their
 * match, vesting and fund menu are not missing — they are unobtainable from
 * this source, permanently, for every one of them. If `impossible` counts
 * against the score then:
 *
 *   - the loop is optimising against a number it cannot win;
 *   - a real improvement moves the total by a fraction of a point, which is
 *     indistinguishable from a DOL refresh reshuffling the universe; and
 *   - worst, an agent looking for the biggest gap is pointed straight at the
 *     44,114 plans where there is nothing to find.
 *
 * AND THE SIZE OF THAT CEILING IS NOT WHAT THE PLAN COUNT SUGGESTS — this
 * comment first said "the ceiling is ~61%", which is 68,538/112,652, a
 * PLAN-count figure applied to a PARTICIPANT-weighted score. Measured, the
 * impossible share of the match / vesting / lineup fields is **8.1% of
 * participants**, because short-form filers are overwhelmingly SMALL plans:
 * 39% of the filings carry 8% of the people. The denominator argument above is
 * unchanged, but the number it was illustrated with was wrong by ~5x, which is
 * this record's most repeated error — *a count keyed on PLANS is not a count of
 * people* — met here in the header of the file written to prevent it.
 *
 * So `score()` divides by the POSSIBLE cells only, and `impossible` is reported
 * separately as the structural ceiling. A field that cannot be known is not a
 * defect, and *a count of a condition is not a measure of a defect.*
 *
 * STATES. Four, and the distinction between the last two is the whole point:
 *   published   a reader sees a value today
 *   withheld    we have something and deliberately do not publish it, because
 *               a guard judged it wrong or unsupported. This is ACCURACY
 *               WORKING, not a gap, and it must never be optimised away.
 *   absent      the filing could carry it, we did not get it. THE WORK.
 *   impossible  the source cannot carry it. The ceiling.
 *
 * WHAT IS EXACT HERE AND WHAT IS NOT. Five fields are filing-level and are
 * computed over the whole universe exactly. Two — fees and performance — are
 * ROW-level: their honest unit is a share of a plan's menu VALUE, not a
 * per-plan boolean, and measuring them needs the render path over ~1.6M rows,
 * which does not finish in this container. They are therefore estimated by the
 * participant-weighted draw in `scripts/perf-coverage.mjs` and reported here as
 * sampled rates, labelled as such. *A measurement that answers a different
 * question than the one asked is not a partial answer, it is a different fact.*
 *
 * THE TRUST-SERVING CONDITION IS APPLIED. Both display surfaces serve a trust's
 * menu only where the plan's OWN lineup is unusable (`app.js:2898`,
 * `build-seo-pages.mjs:111`). This record carries THREE published figures that
 * were wrong for want of that condition, so `servedLineup()` is the one place
 * it lives here.
 *
 *   import { buildLedger, score } from "./lib-ledger.mjs";
 *   node scripts/ledger-report.mjs
 */
import { readFileSync, existsSync } from "node:fs";
import { loadPlans, loadStatus } from "./lib-schema.mjs";

const ROOT = new URL("..", import.meta.url).pathname.replace(/\/$/, "");

export const FIELDS = ["custodian", "match", "vesting", "contributions", "lineup", "fees", "performance"];
export const PLAN_LEVEL = ["custodian", "match", "vesting", "contributions", "lineup"];
export const ROW_LEVEL = ["fees", "performance"];
/* FIVE states, not the four the header describes — `partial` is the honest
 * answer for the contributions cell, where pretax is definitional, Roth has a
 * characteristic code, and after-tax has no code at all, so a plan can have
 * two thirds of the field settled and the third unknowable without the notes.
 * Collapsing it into `published` would over-claim and into `absent` would
 * discard two facts we do hold. It counts as ADDRESSABLE in the score. */
export const STATES = ["published", "withheld", "partial", "absent", "impossible"];

/* ---------------------------------------------------------------------------
 * the stores
 * ------------------------------------------------------------------------- */
/* EXPORTED so `ledger-test` can pin the contributions value against the NOTES
 * rather than against a `why` string. A string pin let a code-derived
 * assertion through the "notes state the contribution types" branch, which is
 * the branch a reintroduced code mapping would land in. */
export function loadLineups() {
  const byAck = new Map();
  for (let s = 0; s < 64; s++) {
    const f = `${ROOT}/data/lineups/${String(s).padStart(2, "0")}.json`;
    if (!existsSync(f)) continue;
    for (const [ack, e] of Object.entries(JSON.parse(readFileSync(f, "utf8")))) byAck.set(ack, e);
  }
  return byAck;
}

/* The published gate. `lineups-index.json`'s ack map is under `.plans`, not at
 * the top level — reading it flat returns undefined for every ack, and a clean
 * zero across a whole population reports on the query. There is no lib-schema
 * loader for this file, which is exactly why the shape is asserted. */
function loadIndex() {
  const f = JSON.parse(readFileSync(`${ROOT}/lineups-index.json`, "utf8"));
  if (!f.plans || typeof f.plans !== "object")
    throw new Error(`lib-ledger: lineups-index.json has no .plans map; keys are ${Object.keys(f).join(", ")}`);
  return f.plans;
}

const confident = (idx, ack) => !!ack && ((idx[ack] || 0) & 1) === 1;

/* WHICH LINEUP DOES THIS PLAN'S PAGE ACTUALLY SERVE? The plan's own entry when
 * it is usable, otherwise the linked trust's, otherwise none. Returns the ack
 * so a caller can never silently credit a trust's menu to a plan that is not
 * served it. */
export function servedLineup(plan, idx) {
  if (confident(idx, plan.ack)) return { ack: plan.ack, from: "own" };
  if (confident(idx, plan.mtiaAck)) return { ack: plan.mtiaAck, from: "trust" };
  return { ack: null, from: "none" };
}

/* ---------------------------------------------------------------------------
 * the cells
 * ------------------------------------------------------------------------- */
const cell = (state, why, value) => ({ state, why, value: value === undefined ? null : value });

/* A SHORT-FORM FILER ATTACHES NO AUDITED STATEMENTS BY LAW. That is the single
 * largest structural fact about this data set and it is a property of the FORM,
 * not of our parser. Note what it does NOT make impossible: the Form 5500's own
 * characteristic codes are on the short form too, so anything a code states is
 * still knowable for all of them, and treating the whole plan as unknowable
 * because its attachment is missing would write off a field the form answers.
 *
 * THIS COMMENT USED TO NAME "designated-Roth availability (code 2R)" AS THE
 * EXAMPLE, AND THAT WAS FALSE. `docs/form5500-instructions-2025.txt:1990`:
 * "2R Participant-directed brokerage accounts provided as an investment option
 * under the plan." There is NO Roth code and NO after-tax code anywhere in the
 * 8a list (the DC block is 2A-2T and was read end to end). `build-data.mjs`
 * and `app.js` have always used 2R for the brokerage window, so the repo held
 * one code with two incompatible meanings. See `contributionsCell`. */
const NOTES_FIELDS = new Set(["match", "vesting", "lineup", "fees", "performance"]);

function custodianCell(plan) {
  if (plan.recordkeeper) return cell("published", "named in the filing", plan.recordkeeper);
  /* Deliberately ABSENT rather than impossible even for a short-form filer: the
   * recorded queue item is that `build-data` resolves INS_CARRIER_NAME from
   * Schedule A and never reads it, and a Schedule A is not an audited
   * attachment. So this is reachable work, not a ceiling. */
  return cell("absent", plan.sf
    ? "short form: no Schedule C, but Schedule A's carrier is unread (queued)"
    : "no provider resolved from Schedule C");
}

function matchCell(plan, ft) {
  if (plan.sf) return cell("impossible", "short form: no audited notes by law");
  if (!ft) return cell("absent", "no features extracted from the attachment");
  if (ft.match) return cell("published", "formula stated", ft.match);
  /* THE WITHHELD STATE EARNS ITS KEEP HERE. v199/v200 withdraw a misread
   * formula rather than publish it and keep the withdrawn string in
   * `matchMisread`, so the fall in `match` coverage IS the improvement. An
   * optimiser that counted this as a gap would be rewarded for putting the
   * wrong formula back. */
  if (ft.matchMisread) return cell("withheld", "formula read but judged a misread (v199/v200)", ft.matchMisread);
  if (ft.matchText) return cell("withheld", "no formula parsed; the filing's own sentence is quoted instead", ft.matchText);
  if (ft.noEmployer) return cell("published", "filing states no employer contribution", "none");
  return cell("absent", "attachment read, no match statement found");
}

function vestingCell(plan, ft) {
  if (plan.sf) return cell("impossible", "short form: no audited notes by law");
  if (!ft) return cell("absent", "no features extracted from the attachment");
  if (ft.vesting) return cell("published", "schedule stated", ft.vesting);
  if (ft.vestingText) return cell("withheld", "no schedule parsed; the filing's own sentence is quoted instead", ft.vestingText);
  return cell("absent", "attachment read, no vesting statement found");
}

/* PRETAX / ROTH / AFTER-TAX, and the whole difficulty of the field is that
 * NEITHER Roth NOR after-tax has a characteristic code. Pretax is definitional
 * for a 401(k). For the other two the audited notes are the ONLY source, and
 * the absence of a code is not evidence of anything.
 *
 * THIS CELL USED TO READ `2R` AS DESIGNATED ROTH AND SCORED 2,344 PLANS /
 * 8,549,974 PARTICIPANTS AS `published` WITH `roth: true` ON THAT BASIS.
 * Code 2R is the PARTICIPANT-DIRECTED BROKERAGE WINDOW
 * (`docs/form5500-instructions-2025.txt:1990`), which is what `build-data.mjs`
 * sets `cf` bit 1 from and what `app.js:642` renders as "Self-directed
 * brokerage". Both reader surfaces source Roth only from the notes
 * (`app.js:646` bit 64, `build-seo-pages.mjs:240` `ff.roth`), so no reader was
 * ever told this — the defect was confined to the scoreboard the loop steers
 * by, which is why it survived: a wrong number here points every agent at the
 * wrong field and is invisible to every page-level check.
 *
 * AND THERE IS NO DEFENSIBLE "NO" FOR EITHER SUB-FIELD. `brokerage` gets one
 * (app.js:649) because the Schedule H 4i is an EXHAUSTIVE enumeration of
 * investment options, so a missing SDBA row is a real absence, corroborated by
 * 2R. Nothing in the filing enumerates CONTRIBUTION TYPES, and an audit note
 * is under no obligation to mention Roth: Amazon's notes state match, vesting,
 * eligibility and loans and never say "Roth". So notes-silence is not negative
 * evidence, every unknown here stays unknown, and the cell never asserts a
 * `false`. A wrong "no" would tell an advisor a plan has no Roth when it does,
 * which is worse than silence. */
function contributionsCell(plan, ft) {
  const codes = String(plan.codes || "");
  const roth = !!(ft && ft.roth);
  const afterTax = !!(ft && ft.afterTax);
  const has2K = /2K/.test(codes);
  const value = { pretax: true, roth, afterTax };
  if (ft && (afterTax || roth)) return cell("published", "notes state the contribution types", value);
  if (has2K) return cell("partial", "code 2K is 401(m) — a match and/or after-tax, and it cannot tell them apart", value);
  if (plan.sf) return cell("partial", "short form: pretax is definitional, and no 8a code states Roth or after-tax", value);
  /* THE DIAGNOSED CAUSE, split two ways, because "no contribution statement in
   * the notes" is a FALSE claim about notes we never read — 941 plans /
   * 526,313 participants whose attachment yielded no features at all. The
   * reason now names which of the two it is; `dx` supplies the cause. */
  if (!ft) return cell("absent", "the attachment yielded no features, so the notes are UNREAD on contributions", value);
  return cell("absent", "the attachment was read and states neither Roth nor after-tax, and no 8a code states either", value);
}

function lineupCell(plan, idx, haveEntry) {
  const served = servedLineup(plan, idx);
  if (served.ack) {
    return cell("published", served.from === "trust"
      ? "the plan's own menu is unusable; its master trust's menu is served"
      : "the plan's own Schedule H 4i schedule", served.from);
  }
  if (plan.sf) return cell("impossible", "short form: no schedule of assets attached by law");
  if (!haveEntry) return cell("absent", "attachment carries no readable schedule of assets");
  return cell("withheld", "a schedule was parsed but did not clear the confidence floor");
}

/* ---------------------------------------------------------------------------
 * the ledger
 * ------------------------------------------------------------------------- */
export function buildLedger(opts = {}) {
  const d = loadPlans();
  const idx = loadIndex();
  const lineups = loadLineups();
  const status = opts.withStatus === false ? null : loadStatus();

  const plans = [];
  for (const r of d.rows) {
    const plan = {
      ein: d.get(r, "ein"), pn: d.get(r, "pn"),
      sponsorName: d.get(r, "sponsorName"),
      ack: d.get(r, "ack"), mtiaAck: d.get(r, "mtiaAck"),
      sf: !!d.get(r, "sf"),
      codes: d.get(r, "codes"),
      recordkeeper: d.get(r, "recordkeeper"),
      ppl: d.get(r, "partEOY") || d.get(r, "participants") || 0,
      assetsEOY: d.get(r, "assetsEOY") || 0,
    };
    /* features come from the plan's OWN entry: both surfaces publish the plan's
     * own features and never the trust's (build-seo-pages:111, app.js:2801) */
    const own = plan.ack ? lineups.get(plan.ack) : null;
    const ft = own && own.features ? own.features : null;

    const cells = {
      custodian: custodianCell(plan),
      match: matchCell(plan, ft),
      vesting: vestingCell(plan, ft),
      contributions: contributionsCell(plan, ft),
      lineup: lineupCell(plan, idx, !!own),
    };
    plans.push({ ...plan, cells, dx: status && plan.ack ? (status.plans[plan.ack] || {}).dx : undefined });
  }
  return { plans, generated: new Date().toISOString(), fieldsExact: PLAN_LEVEL, fieldsSampled: ROW_LEVEL };
}

/* THE OBJECTIVE FUNCTION THE LOOP OPTIMISES.
 *
 * Participant-weighted, because a field known for Walmart's 1,996,659 people is
 * not worth the same as one known for a 103-person plan; and divided by the
 * POSSIBLE cells, because the impossible ones are a ceiling rather than a
 * target. `withheld` counts as NEITHER published nor addressable: it is a
 * deliberate refusal, and a score that rewarded removing it would reward
 * publishing things we judged wrong.
 */
export function score(ledger) {
  const per = {};
  for (const f of PLAN_LEVEL) per[f] = { published: 0, withheld: 0, partial: 0, absent: 0, impossible: 0 };
  let universePpl = 0;

  for (const p of ledger.plans) {
    universePpl += p.ppl;
    for (const f of PLAN_LEVEL) per[f][p.cells[f].state] += p.ppl;
  }
  const out = { universePpl, fields: {}, addressable: 0, possible: 0 };
  for (const f of PLAN_LEVEL) {
    const b = per[f];
    const possible = b.published + b.withheld + b.partial + b.absent;
    out.fields[f] = {
      ...b, possible,
      publishedShareOfPossible: possible ? b.published / possible : null,
      impossibleShareOfUniverse: universePpl ? b.impossible / universePpl : null,
    };
    out.addressable += b.absent + b.partial;
    out.possible += possible;
  }
  /* ONE SCALAR, so a cycle can say whether it moved anything: the
   * participant-weighted share of KNOWABLE plan-level cells that a reader
   * actually sees. */
  const pub = PLAN_LEVEL.reduce((a, f) => a + per[f].published, 0);
  out.overall = out.possible ? pub / out.possible : null;
  return out;
}
