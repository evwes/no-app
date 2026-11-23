#!/usr/bin/env node
/* THE NARROWING FOR THE v211 VESTING DIFFERENTIAL, WRITTEN AS A CACHE.
 *
 *   node scripts/vesting-arm-narrow.mjs --out <cache-file>
 *
 * `match-arm-diff.mjs` narrows by running the named arm on a filing's FLATTENED
 * TEXT, and for this arm that is not sound. `wholeAccountVested` is asked of one
 * selected SENTENCE, and the selection is `clean()`ed — page-heading blocks are
 * DELETED out of the middle of the window — so a sentence the arm fires on need
 * not be a substring of the filing at all, and the arm's `[^.]{0,45}` windows
 * can close over text the raw filing separates by hundreds of characters. A
 * flat-text test is therefore neither a superset nor a subset, and *a narrowing
 * believed and not discharged is the shape that has cost this record twice.*
 *
 * So the narrowing asks the SHIPPED SELECTION, sliced verbatim out of
 * lib-4i.mjs by `lib-vestslice.mjs`, exactly the question the parser asks:
 *
 *     ∃ s ∈ vestSentences(text) : wholeAccountVested(s)
 *
 * and that IS a superset by construction rather than by sampling, because the
 * change's only trigger is
 *     wholeAcctOnly = !strictGate && !employerMoney && !universal
 *                     && wholeAccountVested(s) && !AV_TRIGGER.test(s)
 * which is this predicate with three further conjuncts. Dropping conjuncts can
 * only widen. The three dropped conjuncts are also the reason this cannot be
 * made exact and must not be: narrowing on the full `wholeAcctOnly` would make
 * the EXCLUDED set unable to discharge anything, since the discharge exists to
 * catch the case where my reasoning about those conjuncts is wrong.
 *
 * Output is the `ack<TAB>0|1` format `match-arm-diff --narrow-cache` already
 * reads and appends to, so the two halves compose and a run that dies costs
 * only the filings it had not reached.
 */
import { appendFileSync, existsSync, readFileSync } from "node:fs";
import { buildLedger } from "./lib-ledger.mjs";
import { read } from "./lib-filingtext.mjs";
import { wholeAccountVested } from "./lib-4i.mjs";
import { vestingSelection } from "./lib-vestslice.mjs";

const argv = process.argv.slice(2);
const OUT = (() => { const i = argv.indexOf("--out"); return i >= 0 ? argv[i + 1] : null; })();
if (!OUT) { console.error("vesting-arm-narrow: --out <cache-file> is required"); process.exit(2); }

/* CONTROLS ABOVE THE LOOP. Each would catch a different way this pass could
 * report a clean, wrong zero. */
{
  const pos = "Vesting Participants are fully vested in Plan accounts at all times.";
  const sel = vestingSelection(pos).vestSentences;
  if (!sel.length) throw new Error("narrow control 1: the sliced selection returns nothing on Microsoft's own sentence");
  if (!sel.some(wholeAccountVested)) throw new Error("narrow control 2: the arm does not fire on Microsoft's own sentence — a broken arm and an inert arm read the same zero");
  const neg = "Vesting Participants are fully and immediately vested in their elective deferral and rollover accounts, plus earnings thereon.";
  if (vestingSelection(neg).vestSentences.some(wholeAccountVested))
    throw new Error("narrow control 3: the arm fires on an employee-scoped account — the refusal has gone and this narrowing would be measuring a different change");
  const bare = "The Plan is a defined contribution plan covering all eligible employees.";
  if (vestingSelection(bare).vestSentences.some(wholeAccountVested))
    throw new Error("narrow control 4: the arm fires on a sentence with no vesting content at all");
}
console.log("narrow controls: the sliced selection and the arm both reach their own case, and both refuse theirs\n");

const done = new Set();
if (existsSync(OUT))
  for (const line of readFileSync(OUT, "utf8").split("\n")) if (line) done.add(line.split("\t")[0]);
console.log(`cache already holds ${done.size} acks`);

/* A TOKEN PREFILTER ON THE RAW TEXT, AND WHY IT IS SOUND. `clean()` and the
 * whitespace flatten only DELETE characters and INSERT SPACES — neither ever
 * inserts a letter or a digit — so every alphanumeric token in a selected,
 * cleaned sentence appears as a contiguous run in the raw filing. The arm
 * requires, in that sentence, a vest stem, the noun `account`, one of
 * {100, percent, fully} and one of {times, always, immediate}. So a raw text
 * missing any of those four token classes cannot yield a firing sentence.
 * Stated as TOKENS rather than as the arm's phrases on purpose: "at all times"
 * can be broken across a line in the raw text and is only reassembled by the
 * flatten, so testing the phrase would NOT be sound while testing `times` is.
 * Asserted below rather than trusted. */
const PRE = [/vest/i, /account/i, /100|percent|fully/i, /times|always|immediate/i];
const preOk = (raw) => PRE.every((re) => re.test(raw));
{
  const s = "Vesting Participants are fully vested in Plan accounts at all times.";
  if (!preOk(s)) throw new Error("narrow control 5: the prefilter rejects Microsoft's own sentence");
  for (const re of PRE) {
    const mutilated = s.replace(new RegExp(re.source, "gi"), "@");
    if (preOk(mutilated)) throw new Error(`narrow control 5: the prefilter still passes with ${re} removed — that token class is not required and the prefilter is decorative`);
  }
}

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
  if (!preOk(raw)) pre++;
  else {
    try { h = vestingSelection(raw).vestSentences.some(wholeAccountVested); } catch { h = true; }
  }
  if (h) hit++;
  buf.push(`${p.ack}\t${h ? 1 : 0}`);
  if (buf.length >= 200) { appendFileSync(OUT, buf.join("\n") + "\n"); buf.length = 0; }
  if (n % 2000 === 0) process.stderr.write(`  ${n} judged, ${hit} narrowed in\n`);
}
if (buf.length) appendFileSync(OUT, buf.join("\n") + "\n");
console.log(`judged ${n} fresh (${skipped} already cached), narrowed IN ${hit}, cut by the token prefilter ${pre}, no cached text ${nocache}`);
/* A THROW IS COUNTED AS A HIT, not as a miss: an unreadable filing must go to
 * the diff, where both sides see the same input, rather than silently into the
 * excluded set where nothing would ever look at it again. */
