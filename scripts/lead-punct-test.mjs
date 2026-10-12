#!/usr/bin/env node
/* TETHER FOR THE LEADING-PUNCTUATION STRIP — 2026-10-12.
 *
 * `cleanFiledName`'s dash arm took an em-dash, an en-dash or a hyphen and
 * nothing else, so `—_ T. Rowe Price Retirement 2030` kept its `_`. The arm
 * beside it removes the rest of the leading debris: 586 published+served rows
 * / 209 plans / 602,588 ppl / $2,781,032,071, ticker +1 and lost 0, fee 0/0/0.
 *
 * FOUR conditions, and three of them were earned by something going wrong:
 *   (1) `\p{P}\p{S}` rather than a negated alphanumeric class, which matches
 *       an accented LETTER and would strip a leading `É` or `Ø`;
 *   (2) `*` and `+` refused BY NAME — party-in-interest markers, and writing
 *       `+` into a character class once cost three tickers;
 *   (3) the run must be followed by WHITESPACE, which spares a balanced
 *       parenthetical the filer meant;
 *   (4) ABSTAIN where the remainder is identifier-only, because the page DROPS
 *       such a row — without it, 20 rows / $62,612,555 vanish from Tenet
 *       Healthcare's 146,003-participant menu;
 *   plus a run carrying `(`, which orphans the `)` that closes it.
 *
 * CI-SAFE BY CONSTRUCTION: it reads only source files and its own literals —
 * no store, no registry, no network — so a DOL refresh cannot redden it. That
 * is the property `merge-name-test` lacks, and a gate that reddens on a
 * refresh with nothing wrong is the habitually-red gate that hid ten
 * `site-test` failures.
 *
 * EXITS 1 IF A MUTATION PASSES: a control that cannot fail is decorative. */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { cleanFiledName } from "./lib-disclose.mjs";

/* NEVER a hardcoded sandbox path: `cwd: "/home/user/no-app"` once made Node
 * report `spawn python3 ENOENT` and hid ten red CI runs. */
const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");
const LIB = readFileSync(join(HERE, "lib-disclose.mjs"), "utf8");
const APP = readFileSync(join(ROOT, "app.js"), "utf8");

let fails = 0;
const fail = (m) => { console.log(`  FAIL ${m}`); fails++; };
const ok = (m) => console.log(`  ok   ${m}`);

/* ------------------------------------------------------------------ *
 * 1. the arm reaches its cases, and refuses the ones it must refuse
 * ------------------------------------------------------------------ */
const MUST_STRIP = [
  ["®, separated from `Fidelity®` and moved to the front", "® Fidelity Low-Priced Stock", "Fidelity Low-Priced Stock"],
  ["the `=` the dash arm could not reach", "= T. Rowe Price Instl Large Cap Growth", "T. Rowe Price Instl Large Cap Growth"],
  ["an underscore", "_ T. Rowe Price Retirement 2030", "T. Rowe Price Retirement 2030"],
  ["TWO debris characters — the motivating case", "—_ T. Rowe Price Retirement 2030", "T. Rowe Price Retirement 2030"],
  ["a column rule", "| Fidelity 500 Index Fund", "Fidelity 500 Index Fund"],
  ["a hash", "# Vanguard 500 Index Fund Admiral Shares", "Vanguard 500 Index Fund Admiral Shares"],
  ["a colon — the one TICKER gain", ": MidCap Index", "MidCap Index"],
  ["a guillemet", "« Vanguard Total Bond Market Index", "Vanguard Total Bond Market Index"],
  ["a bar-underscore-bar run", "|_| Fidelity Contrafund", "Fidelity Contrafund"],
];
const MUST_KEEP = [
  ["`*` IS the party-in-interest marker, not debris", "* Vanguard 500 Index Fund"],
  ["`+` likewise, and `INST+` is a SHARE CLASS", "+ Allspring Special Mid Cap Value Fund"],
  ["a marker inside parens stops the run at the `*`", "(*) Fidelity Freedom 2030 Fund"],
  ["a balanced parenthetical IS Sentry Insurance's filed name", "(T. Rowe Price Equity Income Fund)"],
  ["an opening paren orphans its `)` — Comcast, $392,317,000", "($ In Thousands) Interest In The Comcast Corporation Employee"],
  ["an ACCENTED LETTER is not punctuation", "Ødegaard Nordic Equity Fund"],
  ["and neither is this one", "Ź ANTONINI FREIGHT EXPRESS, INC. 401(K) PLAN"],
  ["the remainder is identifier-only and the page DROPS such a row", "; CUSIP: BJQ0C55"],
  ["likewise with a SEDOL", "; SEDOL: BNM0752"],
  ["an undamaged name", "Fidelity Freedom 2040 Fund"],
  ["no whitespace after the run, so a different arm's business", "_t. Rowe Price Retirement 2025"],
];
console.log("must-STRIP:");
for (const [why, input, want] of MUST_STRIP) {
  const got = cleanFiledName(input);
  got === want ? ok(`${why}`) : fail(`${why}: ${JSON.stringify(input)} -> ${JSON.stringify(got)}, wanted ${JSON.stringify(want)}`);
}
console.log("must-KEEP:");
for (const [why, input] of MUST_KEEP) {
  const got = cleanFiledName(input);
  got === input ? ok(`${why}`) : fail(`${why}: ${JSON.stringify(input)} -> ${JSON.stringify(got)}`);
}

/* ------------------------------------------------------------------ *
 * 2. the app.js TWIN is hand-maintained, so assert it has not drifted
 * ------------------------------------------------------------------ */
console.log("app.js twin:");
const armOf = (src, label) => {
  const m = src.match(/const plead = s\.replace\((\/[^\n]*?\/u), ""\)\.trim\(\);\s*\n\s*if \(plead !== s && ([^\n]*?)\) s = plead;/);
  if (!m) throw new Error(`${label}: the arm did not match — this test has gone blind to the code it guards`);
  return { re: m[1], guard: m[2].replace(/\s+/g, " ") };
};
const libArm = armOf(LIB, "lib-disclose.mjs"), appArm = armOf(APP, "app.js");
libArm.re === appArm.re ? ok("the regex is identical in both copies")
  : fail(`the regex has DRIFTED:\n       lib ${libArm.re}\n       app ${appArm.re}`);
libArm.guard === appArm.guard ? ok("the guard expression is identical in both copies")
  : fail(`the guard has DRIFTED:\n       lib ${libArm.guard}\n       app ${appArm.guard}`);

/* ------------------------------------------------------------------ *
 * 3. `ID_ONLY_TWIN` is a TRANSCRIPTION of app.js's `ID_ONLY`, and a
 *    transcription of a shipped expression rots. Assert they agree.
 * ------------------------------------------------------------------ */
console.log("ID_ONLY transcription:");
const idOnlyOf = (src, name, label) => {
  const m = src.match(new RegExp(`const ${name} = (/[^\\n]*?/i);`));
  if (!m) throw new Error(`${label}: ${name} not found — the transcription check has gone blind`);
  return m[1];
};
const shipped = idOnlyOf(APP, "ID_ONLY", "app.js");
for (const [label, src] of [["lib-disclose.mjs", LIB], ["app.js", APP]]) {
  const twin = idOnlyOf(src, "ID_ONLY_TWIN", label);
  twin === shipped ? ok(`${label}'s ID_ONLY_TWIN matches app.js's ID_ONLY`)
    : fail(`${label}'s ID_ONLY_TWIN has DRIFTED from app.js's ID_ONLY:\n       twin    ${twin}\n       shipped ${shipped}`);
}

/* ------------------------------------------------------------------ *
 * 4. SINGLE-PROTECTION MUTATIONS. Each neuters exactly one condition
 *    and must break a named case. A mutation that PASSES means that
 *    condition protects nothing measurable, and this suite exits 1.
 * ------------------------------------------------------------------ */
console.log("mutations (each must BREAK its own case):");
const RE = new RegExp(libArm.re.slice(1, -2), "u");           // strip delimiters + flag
const GUARDS = {
  letters: (p) => /[A-Za-z]{3}/.test(p),
  idOnly: (p) => !new RegExp(shipped.slice(1, -2), "i").test(p),
};
const run = (input, { re = RE, letters = true, idOnly = true } = {}) => {
  /* the dash arm runs first in production; reproduce it so a mutation is
   * measured against the same starting point the shipped arm sees */
  let s = String(input).replace(/^[—–-]+\s*/, "");
  const plead = s.replace(re, "").trim();
  if (plead !== s && (!letters || GUARDS.letters(plead)) && (!idOnly || GUARDS.idOnly(plead))) s = plead;
  return s;
};
/* the baseline must reproduce the shipped behaviour, or the mutations below
 * are measuring a different function */
for (const [, input, want] of MUST_STRIP)
  if (run(input) !== want) fail(`BASELINE does not reproduce the shipped arm on ${JSON.stringify(input)} — the mutations are void`);
for (const [, input] of MUST_KEEP)
  if (run(input) !== String(input).replace(/^[—–-]+\s*/, "")) fail(`BASELINE moves a must-KEEP case: ${JSON.stringify(input)}`);

const MUTATIONS = [
  ["drop the `*`/`+`/`(` refusal", { re: /^[\p{P}\p{S}]+(?=\s)/u },
    "* Vanguard 500 Index Fund", "a party-in-interest marker is stripped"],
  ["use a negated alphanumeric class instead of \\p{P}\\p{S}", { re: /^(?:(?![*+(])[^\sA-Za-z0-9])+(?=\s)/u },
    "Ź ANTONINI FREIGHT EXPRESS, INC. 401(K) PLAN", "an accented LETTER is stripped"],
  /* NOT the balanced parenthetical: that case is protected TWICE, because the
   * `(` refusal covers it too, so it proved neither. Measured through the real
   * cleaner, `(?=\s)` is the only protection for 320 distinct names / 328
   * rows, and its best member is OCR damage: `£` is a garbled `F`, so the
   * filed string is FID 500 INDEX and stripping it INVENTS a name. */
  ["drop the trailing (?=\\s)", { re: /^(?:(?![*+(])[\p{P}\p{S}])+/u },
    "£ID S00 INDEX", "a garbled leading LETTER is stripped, inventing `ID S00 INDEX`"],
  ["drop the identifier-only abstention", { idOnly: false },
    "; CUSIP: BJQ0C55", "a row the page then DROPS entirely"],
  ["drop the 3-letter guard", { letters: false },
    "; 0", "a name is cut down to nothing word-like"],
];
for (const [label, opts, input, consequence] of MUTATIONS) {
  const shippedOut = cleanFiledName(input);
  const mutated = run(input, opts);
  mutated !== shippedOut
    ? ok(`${label} -> ${consequence}`)
    : fail(`MUTATION PASSED — "${label}" protects nothing measurable on ${JSON.stringify(input)}`);
}

/* ------------------------------------------------------------------ *
 * 5. INVARIANTS over a generated range, so a case nobody wrote down
 *    cannot slip through: the arm only ever REMOVES a prefix.
 * ------------------------------------------------------------------ */
console.log("invariants:");
let bad = 0;
const BODIES = ["Fidelity 500 Index Fund", "T. Rowe Price Retirement 2030", "Vanguard Windsor II Admiral Shares", "CUSIP: 123456789", "MidCap Index"];
for (const lead of ["", ",", ".", "|", "@", "_", ";", "#", ":", "©", "®", "«", "»", "~", "=", "$", "•", "|_|", "....", "*", "+", "(*)", "("]) {
  for (const body of BODIES) {
    const input = lead ? `${lead} ${body}` : body;
    const out = cleanFiledName(input);
    /* the output must be a SUFFIX of the input (a prefix was removed) or the
     * input unchanged — this arm must never rewrite the interior */
    if (out !== input && !input.endsWith(out)) { bad++; console.log(`       ${JSON.stringify(input)} -> ${JSON.stringify(out)} is not a suffix`); }
  }
}
bad === 0 ? ok(`the arm only ever removes a prefix (${BODIES.length * 24} combinations)`)
  : fail(`${bad} combination(s) rewrote the interior`);

console.log(fails === 0 ? "\nlead-punct-test: OK" : `\nlead-punct-test: ${fails} FAILURE(S)`);
process.exitCode = fails === 0 ? 0 : 1;
