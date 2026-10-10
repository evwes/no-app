#!/usr/bin/env node
/* THE COMPARABLE-FUND FOOTNOTE IS THE LARGEST UNTESTED DISCLOSURE ON THIS
 * RECORD, AND THIS IS ITS TETHER.
 *
 * 2026-10-10 01:4xZ sized what rests on it: **45,067 published rows / 6,959
 * plans / 34,282,495 participants / $1,455,409,472,270** carry an asterisked
 * comparable whose expense ratio comes from `info.er` — Bank of America's
 * `INSTITUTIONAL 500 INDEX TRUST` publishing VFIAX's 0.04 on $12.36B to
 * 250,040 readers, Microsoft's `Fidelity Growth Company Pool Class S`
 * publishing FDGRX's **0.61** on $8.2B. That entry sized the asymmetry as a
 * defect and then REFUTED itself: it is not one, because `app.js`'s
 * `fund-note` paragraph tells the reader the number's provenance, its
 * DIRECTION and its epistemic status, so 0.61 read as a CEILING is true.
 *
 * ***The whole $1.46T claim is therefore carried by one paragraph's wording,
 * and nothing tested it.*** A reword that drops "cheaper" or "ceiling" turns
 * 45,067 labelled approximations into 45,067 unlabelled retail fees, and no
 * count, no diff and no smoke test would say a word.
 *
 * TWO THINGS ARE CHECKED, because the disclosure can fail in two unrelated
 * ways and only one of them is about words:
 *
 *   (1) THE CLAIMS. Each load-bearing clause is its OWN assertion against the
 *       extracted paragraph, so a reword that drops exactly one fails BY NAME.
 *       The claims are not decoration — they are what makes the published
 *       number true rather than wrong.
 *
 *   (2) THE CHAIN. `starred` is declared, set inside the row callback and read
 *       in the template, 528 lines apart. Break any link and **the asterisks
 *       still print while the footnote vanishes**, which is strictly worse than
 *       either having it or not: the reader sees a mark with no referent and a
 *       retail fee with no caveat. The eager-evaluation link is included
 *       because `list.map` being eager is the only reason the template can read
 *       a flag the callback sets — make `rows` lazy and the flag reads false.
 *
 * EVERY CHECK CARRIES ITS OWN MUTATION CONTROL. *A control that cannot fail is
 * decorative*, so each claim is re-run against a COPY of the source with that
 * one claim's text removed, and the check must fail by name; the chain checks
 * are mutated the same way. The suite exits 1 if any control passes, because a
 * check that cannot fail is the thing this file exists to prevent.
 *
 * CI-SAFE BY CONSTRUCTION: it reads `app.js` and nothing else — no store, no
 * network, no DOL extracts — so a data refresh cannot redden it. That matters
 * here: `merge-name-test` is out of CI precisely because its verdicts are read
 * off live attestations and flipped three times on drift alone, and *a gate
 * that reddens on a refresh with nothing wrong* is the habitually-red gate that
 * hid ten `site-test` failures.
 *
 * `docs/accuracy-log.md` 2026-10-10 (01:4xZ) sized the dependency.
 */
import { readFileSync } from "node:fs";

const APP = process.env.APP_PATH || "/home/user/no-app/app.js";
const src0 = readFileSync(APP, "utf8");

/* ---- extract the paragraph, so a COMMENT can never satisfy a claim ----
 * app.js's own comments contain "normally CHEAPER" (line ~3749, about a
 * different defect entirely), so a bare file-wide grep for the direction word
 * would pass against a file whose reader-facing paragraph had been deleted.
 * Anchor on the rendered class and take one <p>. */
function noteOf(src) {
  const m = src.match(/<p class="fund-note">[\s\S]*?<\/p>/);
  return m ? m[0] : null;
}

/* ---- (1) the claims ---- */
const CLAIMS = [
  ["asterisk-explained", /\*\s*Comparable fund/i,
    "the mark itself is explained — without it the asterisk has no referent"],
  ["vehicle-named", /collective trust or separate account/i,
    "says WHAT the holding is, which is why it has no symbol of its own"],
  ["no-ticker-no-er", /no ticker and no published expense ratio/i,
    "states the absence the number is standing in for"],
  ["fee-provenance", /negotiated by the plan/i,
    "says why no public figure exists — the claim's foundation"],
  ["equivalent-not-holding", /registered equivalent/i,
    "the fund shown is NOT the holding; this is the identification caveat"],
  ["direction", /\bcheaper\b/i,
    "the DIRECTION of the error, which is what makes a ceiling reading safe"],
  ["epistemic-status", /\bceiling\b/i,
    "names the number as a bound and not as the plan's price"],
];

/* ---- (2) the chain, three links plus eagerness ---- */
const CHAIN = [
  ["declared", (s) => /let\s+starred\s*=\s*false\s*;/.test(s),
    "the flag exists"],
  ["set-in-row-loop", (s) => /if\s*\(\s*star\s*\)\s*starred\s*=\s*true\s*;/.test(s),
    "a comparable row RAISES the flag — the link that makes it data-driven"],
  ["read-in-template", (s) => {
    const i = s.indexOf('<p class="fund-note">');
    if (i < 0) return false;
    /* the paragraph must be GATED on the flag, not printed unconditionally and
     * not printed never. Look just behind the tag for the conditional. */
    return /\$\{\s*starred\s*\?\s*`?\s*$/.test(s.slice(Math.max(0, i - 40), i));
  }, "the paragraph is gated on the flag"],
  ["rows-bound-before-template", (s) => /const\s+rows\s*=\s*list\.map\s*\(/.test(s),
    "the row map is EAGER and bound to a name, so the template reads a flag the callback already set"],
];

let fail = 0, decorative = 0;

const note = noteOf(src0);
console.log("CLAIMS — each load-bearing clause of the paragraph 34.3M readers depend on");
if (!note) {
  console.log("  FAIL  the fund-note paragraph is not in app.js at all");
  fail += CLAIMS.length;
} else {
  for (const [name, re, why] of CLAIMS) {
    const ok = re.test(note);
    if (!ok) fail++;
    console.log(`  ${ok ? "ok  " : "FAIL"} ${name.padEnd(26)} ${why}`);
  }
}

console.log("\nCHAIN — break a link and the asterisks print with no footnote");
for (const [name, fn, why] of CHAIN) {
  const ok = fn(src0);
  if (!ok) fail++;
  console.log(`  ${ok ? "ok  " : "FAIL"} ${name.padEnd(26)} ${why}`);
}

/* ---- MUTATION CONTROLS: every check must be able to fail ----
 * For a claim, delete the matched text from the paragraph and require that
 * claim to fail. For a chain link, delete its construct. A control that still
 * passes means the check is reading something other than what it names. */
console.log("\nMUTATION CONTROLS — each check must FAIL on its own mutation");
if (note) {
  for (const [name, re] of CLAIMS) {
    const broken = src0.replace(note, note.replace(re, ""));
    const n2 = noteOf(broken);
    const stillPasses = n2 != null && re.test(n2);
    if (stillPasses) { decorative++; console.log(`  DECORATIVE ${name} — survived deletion of its own text`); }
    else console.log(`  ok   ${name.padEnd(26)} fails when its clause is removed`);
  }
}
const CHAIN_MUT = [
  ["declared", (s) => s.replace(/let\s+starred\s*=\s*false\s*;/, "")],
  ["set-in-row-loop", (s) => s.replace(/if\s*\(\s*star\s*\)\s*starred\s*=\s*true\s*;/, "")],
  ["read-in-template", (s) => s.replace('${starred ? `<p class="fund-note">', '${`<p class="fund-note">')],
  ["rows-bound-before-template", (s) => s.replace(/const\s+rows\s*=\s*list\.map\s*\(/, "const rows = lazyMap(")],
];
for (const [name, mutate] of CHAIN_MUT) {
  const fn = CHAIN.find((c) => c[0] === name)[1];
  const stillPasses = fn(mutate(src0));
  if (stillPasses) { decorative++; console.log(`  DECORATIVE ${name} — survived its own mutation`); }
  else console.log(`  ok   ${name.padEnd(26)} fails when its link is broken`);
}

console.log(`\n${fail} failing check(s), ${decorative} decorative control(s)`);
if (fail || decorative) {
  console.error("FUND-NOTE TETHER FAILED — the comparable-fee disclosure is not intact, or a check that guards it cannot fail");
  process.exit(1);
}
console.log("fund-note tether ok: the comparable-fee disclosure is intact and every guard can fail");
