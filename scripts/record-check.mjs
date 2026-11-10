#!/usr/bin/env node
/* wampo — IS THE RECORD STILL TRUE? Every claim here has a derivation.
 *
 * CLAUDE.md is re-injected verbatim at the start of every turn, so a stale
 * number in it is ASSERTED AGAIN on every cycle and the reader cannot tell
 * which copy is live. The file says this about itself. It has not stopped
 * happening:
 *
 *   - the HIGH baseline read 4 while the trail had carried 7 for days. I
 *     corrected it to 7 on 2026-11-08. **By 2026-11-10 the trail read 6.**
 *     A hand-corrected number goes stale exactly as fast as the one it
 *     replaced, which is the whole argument for deriving it instead.
 *   - the ledger scalar read 79.82% from 2026-11-05 after v205 moved it.
 *   - `overshoot` read 764 after v205 took it to 679.
 *   - the Schedule A carrier entry claimed 9.45M readers; measured, 194,379.
 *   - the gotchas said the DOL host is unreachable; askebsa.dol.gov answers.
 *
 * WHAT THIS IS NOT: a parser for prose. Extracting "every number" from a
 * 1,200-line document generically is the guessed-shape trap this record keeps
 * paying for. Instead each claim is PINNED by a distinctive substring and
 * carries its own derivation, and **a pin that cannot find its target THROWS
 * rather than passing** — a silent pin is worse than no pin, because it reads
 * as a check. Whitespace is collapsed before matching: CLAUDE.md is hard
 * wrapped, so a claim routinely spans a line break, and literal matching on
 * one cost three failed fixtures earlier in this record.
 *
 * Adding a claim is cheap and is the point: anything with a one-line
 * derivation belongs here rather than in a human's memory.
 *
 * Exit 0 all true, 1 on any contradiction. Reads only; no network.
 * Usage: node scripts/record-check.mjs [--verbose]
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const VERBOSE = process.argv.includes("--verbose");
const raw = readFileSync(path.join(ROOT, "CLAUDE.md"), "utf8");
const flat = raw.replace(/\s+/g, " ");               // hard-wrap proof

const trailLines = readFileSync(path.join(ROOT, "docs", "coverage-history.jsonl"), "utf8")
  .trim().split("\n").filter(Boolean).map((l) => JSON.parse(l));
const trail = trailLines[trailLines.length - 1];
const ledgerLines = readFileSync(path.join(ROOT, "docs", "ledger-history.jsonl"), "utf8")
  .trim().split("\n").filter(Boolean).map((l) => JSON.parse(l));
const ledger = ledgerLines[ledgerLines.length - 1];

/* CONTROL: the derivations must come from a live store, not an empty read. */
if (!trail || trail.plans == null) { console.error("DERIVATION CONTROL FAILED: no usable coverage trail line"); process.exit(1); }
if (!ledger || ledger.overall == null) { console.error("DERIVATION CONTROL FAILED: no usable ledger trail line"); process.exit(1); }

const num = (s) => Number(String(s).replace(/,/g, ""));

/* Each claim: a PIN that must exist, a way to read the claimed value out of
 * the text just after it, and the derivation it must equal. */
const CLAIMS = [
  {
    label: "HIGH baseline",
    pin: "THE HIGH BASELINE IS",
    read: () => { const m = /THE HIGH BASELINE IS \*{0,2}(\d+)/.exec(flat); return m && num(m[1]); },
    derive: () => trail.high,
    note: "docs/coverage-history.jsonl `high` on the newest line",
  },
  {
    label: "universe plans",
    pin: "plans / 119,907,098 participants / overall",
    read: () => { const m = /\*\*([\d,]+) plans \/ [\d,]+ participants \/ overall/.exec(flat); return m && num(m[1]); },
    derive: () => trail.plans,
    note: "the trail's `plans`",
  },
  {
    label: "ledger scalar (overall %)",
    pin: "participants / overall",
    read: () => { const m = /participants \/ overall ([\d.]+)%/.exec(flat); return m && Number(m[1]); },
    derive: () => ledger.overall,
    note: "docs/ledger-history.jsonl `overall` on the newest line",
  },
  {
    label: "lineup overshoot (menus)",
    pin: "is a DOL refresh, not a regression",
    /* the sentence is a HISTORY ("366 -> 764 -> 679"), so take the LAST value:
     * a regex pinned to exactly two figures reported UNREADABLE the moment a
     * third was appended, which is the right failure but a needless one. */
    read: () => {
      const m = /`overshoot` ([\d,]+(?:\s*->\s*[\d,]+)*) is a DOL refresh/.exec(flat);
      if (!m) return null;
      const seq = m[1].split("->").map((x) => num(x.trim()));
      return seq[seq.length - 1];
    },
    derive: () => trail.overshoot,
    note: "the trail's `overshoot`",
  },
];

let bad = 0, checked = 0;
console.log(`  record: CLAUDE.md ${raw.length.toLocaleString()} bytes   store: trail d=${trail.d} pv=${trail.pv}, ledger d=${ledger.d}\n`);
for (const c of CLAIMS) {
  if (!flat.includes(c.pin.replace(/\s+/g, " "))) {
    bad++;
    console.log(`  PIN LOST   ${c.label}`);
    console.log(`             the text "${c.pin}" is no longer in CLAUDE.md, so this claim is unchecked.`);
    console.log(`             Re-point the pin or drop the claim — a pin that cannot find its target is not a check.`);
    continue;
  }
  const claimed = c.read();
  const actual = c.derive();
  checked++;
  if (claimed == null) {
    bad++;
    console.log(`  UNREADABLE ${c.label}: the pin is present but the value could not be parsed out — the wording moved.`);
    continue;
  }
  const same = Math.abs(Number(claimed) - Number(actual)) < 1e-9;
  if (same) { if (VERBOSE) console.log(`  ok         ${c.label}: ${claimed} (${c.note})`); }
  else {
    bad++;
    console.log(`  STALE      ${c.label}`);
    console.log(`             CLAUDE.md says ${claimed}   the store says ${actual}   (${c.note})`);
  }
}

console.log(bad
  ? `\nrecord-check: ${bad} of ${CLAIMS.length} claim(s) contradicted or unchecked — a stale number here is re-asserted on every turn`
  : `\nrecord-check: all ${checked} pinned claims match their derivation`);
process.exit(bad ? 1 : 0);
