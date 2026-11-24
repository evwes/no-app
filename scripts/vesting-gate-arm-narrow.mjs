#!/usr/bin/env node
/* THE NARROWING FOR THE v214 VESTING SCOPE-GATE DIFFERENTIAL, AS A CACHE.
 *
 *   node scripts/vesting-gate-arm-narrow.mjs --out <cache-file>
 *
 * v214 adds one conjunct to the immediate-vesting loop's employer-scope gate
 * and one disjunct to its label branch, both keyed on `uvOnly`. `uvOnly` is
 * false everywhere `unnarrowedFullVesting` returns null, and where it is false
 * `extractPlanFeatures` is byte-identical — so what decides whether the change
 * can touch a filing is
 *
 *     ∃ s ∈ vestSentences(text) : unnarrowedFullVesting(s) ≠ null
 *
 * which SUPERSETS the real trigger by dropping THREE of its conjuncts:
 * `waPass === 1`, the four `!strictGate && !employerMoney && !universal &&
 * !wholeAcctOnly` arms, and `uv.employerNamed`. Dropping a conjunct can only
 * widen, so this is a superset BY CONSTRUCTION rather than by sampling —
 * *sampling cannot establish a superset* — and `match-arm-diff --discharge N`
 * exists to catch the case where that reasoning is wrong.
 *
 * WHY IT CANNOT BE A FLAT-TEXT TEST, which is what `match-arm-diff`'s own
 * `--arm` narrowing does and what I reached for first. `unnarrowedFullVesting`
 * is a conjunction of REQUIREMENTS and ELEVEN REFUSALS, and over a whole
 * filing's text some refusal fires almost always — `graded`, `credited
 * service`, `hardship`, `plan termination` and `no forfeitures` all appear
 * somewhere in most audited notes. So the flat-text reading returns null for
 * filings whose individual SENTENCES fire, which is a SUBSET and would have
 * excluded the very population under test while printing a clean zero. *A
 * clean zero reports on the QUERY.*
 *
 * The selection and the gate come from `lib-vestslice.mjs`, which cuts them
 * out of lib-4i's own bytes: a harness that re-types a mechanism measures the
 * re-typing, and a flat-text test would be neither a superset nor a subset of
 * the per-sentence one because `clean()` DELETES page-heading blocks out of the
 * middle of a selected window.
 *
 * Output is the `ack<TAB>0|1` format `match-arm-diff --narrow-cache` reads.
 */
import { appendFileSync, existsSync, readFileSync } from "node:fs";
import { buildLedger } from "./lib-ledger.mjs";
import { read } from "./lib-filingtext.mjs";
import { unnarrowedFullVesting, vestingQuoteKeepTokens } from "./lib-4i.mjs";
import { vestingSelection } from "./lib-vestslice.mjs";

const argv = process.argv.slice(2);
const OUT = (() => { const i = argv.indexOf("--out"); return i >= 0 ? argv[i + 1] : null; })();
if (!OUT) { console.error("vesting-gate-arm-narrow: --out <cache-file> is required"); process.exit(2); }

/** does SOME selected sentence qualify under the arm, either half? */
function reaches(raw) {
  const sel = vestingSelection(raw);
  for (const s of sel.vestSentences) if (unnarrowedFullVesting(s)) return true;
  return false;
}

/* CONTROLS ABOVE THE LOOP. Each would catch a different way this pass could
 * report a clean, wrong zero — *a broken arm and an inert arm read the same
 * zero*, so a positive drawn FROM THE DATA is pinned before any count is
 * believed, and so is a negative. */
{
  const pos = "Vesting – Participants are immediately vested in their accounts.";
  if (!vestingSelection(pos).vestSentences.length)
    throw new Error("narrow control 1: the sliced selection returns nothing on Stanford's own sentence");
  if (!reaches(pos))
    throw new Error("narrow control 2: no sentence qualifies on Stanford's own sentence — the arm is not reaching the selection");
  /* THE SUPERSET CONJUNCT THAT WAS DROPPED MUST ACTUALLY BE DROPPED. The gate
   * takes only `employerNamed`; this pass must narrow IN the other half too, or
   * the discharge would be run over a set that the narrowing had already
   * silently pruned on the same criterion the diff is testing. */
  const unnamed = "Vesting Participants are immediately vested in all sources of contributions plus actual earnings thereon.";
  if (!reaches(unnamed))
    throw new Error("narrow control 3: an `employerNamed: false` sentence is narrowed OUT — the narrowing is not a superset of the gate's own question");
  /* …and a sentence with no vesting claim must be narrowed OUT, or the
   * narrowing is the whole universe and the excluded set is empty, which reads
   * exactly like a safe change. */
  const bare = "The Plan is a defined contribution plan covering all eligible employees.";
  if (reaches(bare))
    throw new Error("narrow control 4: a sentence with no vesting content is narrowed in");
  /* the dominant CORRECT refusal must be narrowed OUT — if employee-money
   * sentences are narrowed in, the excluded set is not what this pass claims */
  const emp = "Participants are vested immediately in their contributions plus actual earnings thereon.";
  if (reaches(emp))
    throw new Error("narrow control 5: the employee-money sentence the gate exists to refuse is narrowed in");
  /* and the token prefilter, asserted necessary PER TOKEN CLASS rather than
   * trusted — the control v211's and v212's prefilters both carried */
  if (!vestingQuoteKeepTokens(pos)) throw new Error("narrow control 6: the token prefilter rejects Stanford's own sentence");
  for (const re of [/vest/gi, /contribution|account|match/gi])
    if (vestingQuoteKeepTokens(pos.replace(re, "@")))
      throw new Error(`narrow control 6: the prefilter still passes with ${re} removed — that token class is not required and the prefilter is decorative`);
}
console.log("narrow controls: the sliced selection reaches the arm, BOTH halves narrow in, a bare sentence and the employee-money sentence narrow out, and the token prefilter is necessary per class\n");

const done = new Set();
if (existsSync(OUT))
  for (const line of readFileSync(OUT, "utf8").split("\n")) if (line) done.add(line.split("\t")[0]);
console.log(`cache already holds ${done.size} acks`);

const L = buildLedger({ withStatus: false });
let n = 0, hit = 0, nocache = 0, skipped = 0, pre = 0;
const buf = [];
for (const p of L.plans) {
  if (p.sf || !p.ack) continue;
  if (done.has(p.ack)) { skipped++; continue; }
  const raw = read(p.ack);
  if (!raw) { nocache++; continue; }          // UNJUDGED — the diff counts these itself
  n++;
  let h = false;
  /* The token prefilter is sound for the same reason v212's is: every arm of
   * the gate, and `unnarrowedFullVesting` itself, requires a `vest` stem and
   * one of `contribution` / `account` / `match` — stated as TOKENS, because
   * `clean()` only DELETES characters and INSERTS spaces, so a token in a
   * selected sentence is a contiguous run in the raw filing while a PHRASE
   * need not be. */
  if (!vestingQuoteKeepTokens(raw)) pre++;
  /* A THROW IS COUNTED AS A HIT, not as a miss: an unreadable filing must go
   * to the diff, where both sides see the same input, rather than silently
   * into the excluded set where nothing would ever look at it again. */
  else { try { h = reaches(raw); } catch { h = true; } }
  if (h) hit++;
  buf.push(`${p.ack}\t${h ? 1 : 0}`);
  if (buf.length >= 200) { appendFileSync(OUT, buf.join("\n") + "\n"); buf.length = 0; }
  if (n % 2000 === 0) process.stderr.write(`  ${n} judged, ${hit} narrowed in\n`);
}
if (buf.length) appendFileSync(OUT, buf.join("\n") + "\n");
console.log(`judged ${n} fresh (${skipped} already cached), narrowed IN ${hit}, cut by the token prefilter ${pre}, no cached text ${nocache}`);
