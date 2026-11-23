#!/usr/bin/env node
/* THE NARROWING FOR THE v212 VESTING DIFFERENTIAL, WRITTEN AS A CACHE.
 *
 *   node scripts/vesting-quotekeep-narrow.mjs --out <cache-file>
 *
 * v212 is a CONTROL-FLOW change, so there is no new predicate to run on a
 * filing's flattened text. What decides whether the change can touch a filing
 * is a question about the SHIPPED SELECTION and the SHIPPED GATE:
 *
 *     ∃ s ∈ vestSentences(text) : gate(s).passes ∧ ¬ gate(s).strictGate
 *
 * — "some selected sentence reaches the guard at all" — which supersets the
 * real trigger by dropping its `(remainderGraded || carveOut)` conjunct.
 * Dropping a conjunct can only widen, so this is a superset BY CONSTRUCTION
 * rather than by sampling, and the dropped conjunct is exactly why the
 * narrowing must not be made exact: the discharge exists to catch the case
 * where my reasoning about it is wrong.
 *
 * Both halves come from `lib-vestslice.mjs`, which cuts the selection and the
 * gate out of lib-4i's own bytes — a harness that re-types a mechanism measures
 * the re-typing, and a flat-text test would be neither a superset nor a subset
 * because `clean()` DELETES page-heading blocks out of the middle of a window.
 *
 * Output is the `ack<TAB>0|1` format `match-arm-diff --narrow-cache` reads.
 */
import { appendFileSync, existsSync, readFileSync } from "node:fs";
import { buildLedger } from "./lib-ledger.mjs";
import { read } from "./lib-filingtext.mjs";
import { vestingQuoteKeepTokens } from "./lib-4i.mjs";
import { vestingSelection, scopeGate } from "./lib-vestslice.mjs";

const argv = process.argv.slice(2);
const OUT = (() => { const i = argv.indexOf("--out"); return i >= 0 ? argv[i + 1] : null; })();
if (!OUT) { console.error("vesting-quotekeep-narrow: --out <cache-file> is required"); process.exit(2); }

/** does some selected sentence reach the v212 guard? */
function reaches(raw, sponsorName) {
  const sel = vestingSelection(raw);
  for (const s of sel.vestSentences) {
    const g = scopeGate(s, sel.t, sponsorName || "");
    if (g.passes && !g.strictGate) return true;
  }
  return false;
}

/* CONTROLS ABOVE THE LOOP. Each would catch a different way this pass could
 * report a clean, wrong zero — *a broken arm and an inert arm read the same
 * zero*, so a positive from the data is pinned before any count is believed. */
{
  const pos = "Vesting in the Employer's contribution portion of their accounts plus actual earnings thereon is based on years of service.";
  if (!vestingSelection(pos).vestSentences.length)
    throw new Error("narrow control 1: the sliced selection returns nothing on Tenet's own sentence");
  if (!reaches(pos, "Tenet Healthcare Corporation"))
    throw new Error("narrow control 2: no sentence reaches the guard on Tenet's own sentence");
  /* strictGate is the guard's own `!strictGate`, so a sentence naming employer
   * money ADJACENTLY must be reported as NOT reaching it. Without this the
   * narrowing would be the whole universe and the excluded set would be empty,
   * which reads exactly like a safe change. */
  const strict = "Participants are immediately vested in Company matching contributions.";
  if (reaches(strict, "Acme Industries Inc."))
    throw new Error("narrow control 3: a strictGate sentence is reported as reaching the guard — the `!strictGate` conjunct has gone from the slice");
  const bare = "The Plan is a defined contribution plan covering all eligible employees.";
  if (reaches(bare, "Acme Industries Inc."))
    throw new Error("narrow control 4: a sentence with no vesting content reaches the guard");
  /* and the token prefilter, asserted necessary per token class rather than
   * trusted — the same control v211's prefilter carried. */
  if (!vestingQuoteKeepTokens(pos)) throw new Error("narrow control 5: the token prefilter rejects Tenet's own sentence");
  for (const re of [/vest/gi, /contribution|account|match/gi])
    if (vestingQuoteKeepTokens(pos.replace(re, "@")))
      throw new Error(`narrow control 5: the prefilter still passes with ${re} removed — that token class is not required and the prefilter is decorative`);
}
console.log("narrow controls: the sliced selection and the sliced gate both reach their own case, both refuse theirs, and the token prefilter is necessary per class\n");

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
  if (!vestingQuoteKeepTokens(raw)) pre++;
  /* A THROW IS COUNTED AS A HIT, not as a miss: an unreadable filing must go
   * to the diff, where both sides see the same input, rather than silently
   * into the excluded set where nothing would ever look at it again. */
  else { try { h = reaches(raw, p.sponsorName || ""); } catch { h = true; } }
  if (h) hit++;
  buf.push(`${p.ack}\t${h ? 1 : 0}`);
  if (buf.length >= 200) { appendFileSync(OUT, buf.join("\n") + "\n"); buf.length = 0; }
  if (n % 2000 === 0) process.stderr.write(`  ${n} judged, ${hit} narrowed in\n`);
}
if (buf.length) appendFileSync(OUT, buf.join("\n") + "\n");
console.log(`judged ${n} fresh (${skipped} already cached), narrowed IN ${hit}, cut by the token prefilter ${pre}, no cached text ${nocache}`);
