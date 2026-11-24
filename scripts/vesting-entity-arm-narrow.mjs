#!/usr/bin/env node
/* THE NARROWING FOR THE v215 VESTING SCOPE-GATE DIFFERENTIAL, AS A CACHE.
 *
 *   node scripts/vesting-entity-arm-narrow.mjs --out <cache-file>
 *
 * v215 adds one conjunct to the immediate-vesting loop's employer-scope gate
 * and two `labelBlocked` arms, all three keyed on `eemOnly`. `eemOnly` is false
 * everywhere `employerEntityMoney` returns null, and where it is false
 * `extractPlanFeatures` is byte-identical — so what decides whether the change
 * can touch a filing is
 *
 *     ∃ s ∈ vestSentences(text) : employerEntityMoney(s, sponsorName) ≠ null
 *
 * which SUPERSETS the real trigger by dropping TWO of its conjuncts:
 * `waPass === 1` and the five `!strictGate && !employerMoney && !universal &&
 * !wholeAcctOnly && !uvOnly` arms. Dropping a conjunct can only widen, so this
 * is a superset BY CONSTRUCTION rather than by sampling — *sampling cannot
 * establish a superset* — and `match-arm-diff --discharge N` exists to catch
 * the case where that reasoning is wrong.
 *
 * WHY IT IS A SEPARATE SCRIPT AND NOT `match-arm-diff --arm`. That harness
 * applies the named arm to the filing's FLAT TEXT, and this arm takes a SECOND
 * ARGUMENT — the sponsor's name, which its acronym half is an identity test
 * against. Asked with the name omitted, the acronym half is inert, so the
 * flat-text narrowing would be a SUBSET on exactly the eight plans that half
 * exists for, and would print a clean zero about a question it never asked.
 *
 * The selection comes from `lib-vestslice.mjs`, which cuts it out of lib-4i's
 * own bytes: a harness that re-types a mechanism measures the re-typing.
 *
 * Output is the `ack<TAB>0|1` format `match-arm-diff --narrow-cache` reads.
 */
import { appendFileSync, existsSync, readFileSync } from "node:fs";
import { buildLedger } from "./lib-ledger.mjs";
import { read } from "./lib-filingtext.mjs";
import { employerEntityMoney } from "./lib-4i.mjs";
import { vestingSelection } from "./lib-vestslice.mjs";

const argv = process.argv.slice(2);
const OUT = (() => { const i = argv.indexOf("--out"); return i >= 0 ? argv[i + 1] : null; })();
if (!OUT) { console.error("vesting-entity-arm-narrow: --out <cache-file> is required"); process.exit(2); }

/** does SOME selected sentence qualify under the arm, for THIS sponsor? */
function reaches(raw, sponsor) {
  const sel = vestingSelection(raw);
  for (const s of sel.vestSentences) if (employerEntityMoney(s, sponsor)) return true;
  return false;
}
/* THE PREFILTER IS SOUND BY CONSTRUCTION, not by sampling: every one of the
 * five arms of `employerEntityMoney` requires a `contribut` stem (the
 * possessive, acronym and all-prefix arms want the literal word
 * `contributions`; the all-mod and all-subj arms want `contributions`,
 * `contribution types/sources` or `amounts contributed`), and the SELECTION
 * itself requires a `vest` stem. Stated as stems rather than phrases because
 * `clean()` only DELETES characters and INSERTS spaces, so a stem in a selected
 * sentence is a contiguous run in the raw filing while a phrase need not be. */
const prefilter = (raw) => /vest/i.test(raw) && /contribut/i.test(raw);

/* CONTROLS ABOVE THE LOOP. *A broken arm and an inert arm read the same zero*,
 * so positives drawn FROM THE DATA are pinned before any count is believed,
 * and so are the negatives the gate exists to produce. */
{
  const pos = "Vesting Participants are vested immediately in their contributions and the Organization’s contributions plus actual earnings thereon.";
  if (!vestingSelection(pos).vestSentences.length)
    throw new Error("narrow control 1: the sliced selection returns nothing on the class's own commonest sentence");
  if (!reaches(pos, "Acme Widgets"))
    throw new Error("narrow control 2: no sentence qualifies on the class's own sentence — the arm is not reaching the selection");
  /* the ACRONYM half must narrow in, and must narrow in because of the SPONSOR
   * and not because of a shape — without the second assertion the identity test
   * could be broken open and this control would still pass */
  const acro = "Vesting Participants are vested immediately in their contributions and WPAHS’s contributions plus actual earnings thereon.";
  if (!reaches(acro, "West Penn Allegheny Health System"))
    throw new Error("narrow control 3: the acronym half is narrowed OUT for its own sponsor");
  if (reaches(acro, "Unrelated Holdings Inc"))
    throw new Error("narrow control 4: the acronym half narrows in for a sponsor whose initials it is not — the identity test is not being applied");
  /* the dominant CORRECT refusal must be narrowed OUT, or the excluded set is
   * not what this pass claims */
  const emp = "Participants are vested immediately in their contributions plus actual earnings thereon.";
  if (reaches(emp, "Acme Widgets"))
    throw new Error("narrow control 5: the employee-money sentence the gate exists to refuse is narrowed in");
  const bare = "The Plan is a defined contribution plan covering all eligible employees.";
  if (reaches(bare, "Acme Widgets"))
    throw new Error("narrow control 6: a sentence with no vesting content is narrowed in");
  /* and the prefilter, asserted necessary PER STEM rather than trusted */
  if (!prefilter(pos)) throw new Error("narrow control 7: the prefilter rejects the class's own sentence");
  for (const re of [/vest/gi, /contribut/gi])
    if (prefilter(pos.replace(re, "@")))
      throw new Error(`narrow control 7: the prefilter still passes with ${re} removed — that stem is not required and the prefilter is decorative`);
}
console.log("narrow controls: the selection reaches the arm, the possessive and acronym halves narrow in, the acronym half is an IDENTITY test, the employee-money and bare sentences narrow out, and the prefilter is necessary per stem\n");

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
  if (!prefilter(raw)) pre++;
  /* A THROW IS COUNTED AS A HIT, not as a miss: an unreadable filing must go to
   * the diff, where both sides see the same input, rather than silently into
   * the excluded set where nothing would ever look at it again. */
  else { try { h = reaches(raw, p.sponsorName || ""); } catch { h = true; } }
  if (h) hit++;
  buf.push(`${p.ack}\t${h ? 1 : 0}`);
  if (buf.length >= 200) { appendFileSync(OUT, buf.join("\n") + "\n"); buf.length = 0; }
  if (n % 2000 === 0) process.stderr.write(`  ${n} judged, ${hit} narrowed in\n`);
}
if (buf.length) appendFileSync(OUT, buf.join("\n") + "\n");
console.log(`judged ${n} fresh (${skipped} already cached), narrowed IN ${hit}, cut by the prefilter ${pre}, no cached text ${nocache}`);
