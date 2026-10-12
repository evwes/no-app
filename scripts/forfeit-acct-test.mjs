#!/usr/bin/env node
/* TETHER for `isForfeitureAccountRow` — the rule that stops a plan's own
 * forfeiture or expense account being published as a menu choice (2026-10-12).
 *
 * WHY THIS FILE EXISTS AND WHY IT LOOKS LIKE THIS
 *
 * The predicate's whole correctness is a 34-word strip list and, more than
 * that, the words the list OMITS. `fund`, `trust`, `portfolio`, `money`,
 * `market`, `stable`, `value`, `guaranteed`, `interest`, `government`,
 * `index`, `asset`, `cash` and `mutual` are absent ON PURPOSE, and that
 * absence is the only thing refusing a REAL vehicle's forfeiture sub-balance —
 * `Key Guaranteed Portfolio Fund (including forfeiture $708,522)` at a 0.35
 * fee, `Vanguard Federal MMKT Fund - Forfeitures` carrying VMFXX. Adding one
 * of those tokens would relabel a real holding and every count on the
 * coverage line would still read clean, the class being 58 rows in a
 * 1.7M-row store.
 *
 * CI-SAFE BY CONSTRUCTION. It reads `lib-disclose.mjs` and nothing else — no
 * store, no registry, no network — so a DOL refresh cannot redden it. That is
 * deliberate: `merge-name-test.mjs` reads every pin's verdict off live
 * attestations and has changed status three times on drift alone, and a gate
 * that reddens on a refresh with nothing wrong is the habitually-red gate that
 * once hid ten consecutive `site-test` failures.
 *
 * IT EXITS 1 IF A MUTATION PASSES. A control that cannot fail is decorative,
 * so each mutation below is a transcription drift that MUST break a named
 * fixture; if one of them leaves every fixture green, this file has stopped
 * testing the thing it is named after and says so.
 */
import { readFileSync } from "node:fs";
import { isForfeitureAccountRow, forfeitureAccountResidue } from "./lib-disclose.mjs";

/* `import.meta.url`, never a hardcoded path: a sandbox path in anything CI
 * runs is what produced ten red `site-test` runs reading `spawn python3
 * ENOENT`, and one `ENOENT` on an app.js default a day later. */
const SRC = new URL("./lib-disclose.mjs", import.meta.url).pathname;
const src = readFileSync(SRC, "utf8");

let fail = 0;
const ok = (cond, what) => { if (!cond) { fail++; console.log(`  FAIL  ${what}`); } };

/* ───────── 1. MUST FIRE. Every string is a real filed name from the live
 * store, and each names the word it is the ONLY protection for, measured by
 * leave-one-out over all 1,721,920 published+served rows. ───────── */
const MUST_FIRE = [
  ["Master Expense Account 4", "Hartford Fire Insurance, 31,128 ppl — $961,793,000 at 13.04% of its menu, 96% of the class's money, and it was typed `Mutual fund`"],
  ["Fees paid by participants", "Publix Super Markets, 225,961 ppl — the motivating row"],
  ["Nonvested forfeited accounts", "Takeda, 37,289 ppl — $10,101,427"],
  ["12(b)(1) Fee Account", "BAE Systems, 58,807 ppl — $2,693,529"],
  ["Unallocated Forfeitures", "Privia Health, 7,546 ppl — $2,899,635"],
  ["Forfeiture Account", "8 rows, the commonest member — a regression to 0 here would look quiet"],
  ["FORFEITURES", "the one word that empties a residue ALONE"],
  ["Forfeitures in suspense", ""],
  ["FORFEITURE HOLDING ACCOUNT", ""],
  ["Expense Budget Account", "5 rows"],
  ["Expense Budget Suspense Account", ""],
  ["Forfeitures of Participant Non-Vested Amounts", "five words are each necessary for exactly this row"],
  ["Forfeiture Account Unallocated", ""],
  ["PLAN FORFEITURE ACCOUNT", "Honolulu Community Action Program — 0.90% of its menu, was typed `Mutual fund`"],
  ["General Forfeiture Account", ""],
  ["Administrative deductions", "an expense LINE, 2 rows"],
  ["Audit and accounting", "an expense LINE"],
  ["Forfeiture/Expense Account", ""],
  ["Forfeiture account balance", ""],
  ["Forfeitures, holding", ""],
  ["Forfeitures Forfeitures", ""],
  ["Forfeitures 118,632", "NAMED RESIDUE that fires anyway — the welded-table-row class, whose NAME half still names no fund"],
];
for (const [s, why] of MUST_FIRE) ok(isForfeitureAccountRow(s), `must fire: ${JSON.stringify(s)}${why ? ` — ${why}` : ""}`);

/* ───────── 2. MUST NOT FIRE. The load-bearing half. Each is a REAL vehicle
 * carrying its forfeiture sub-balance, or prose, or a share class — and the
 * protection is a word ABSENT from the strip list. ───────── */
const MUST_KEEP = [
  ["Key Guaranteed Portfolio Fund (including forfeiture $708,522)", "$4,102,992 at er 0.35 — `guaranteed`, `portfolio`, `fund`, `including`"],
  ["Key Guaranteed Portfolio Fund & Forfeitures", "$635,293 at er 0.35"],
  ["Vanguard Federal MMKT Fund - Forfeitures", "carries VMFXX at er 0.11 — the one refused row publishing a SYMBOL"],
  ["American Funds Us Govt Money Market R6 (including forfeitures $18,238)", "$528,506 at er 0.4"],
  ["(Forfeiture Accounts) American Funds New World Fund R6", "er 0.57 — the house LEADS and the forfeiture words trail"],
  ["Putnam Stable Value Fund/ Forfeiture Account Balance", "$1,066,524"],
  ["Galliard Stable Return Fund - Forfeiture Asset Holding Acct", "$349,355"],
  ["Galliard Stable Value Fund - Unallocated Forfeitures", ""],
  ["AIG Government Money Market Forfeiture", "er 0.2 and NO HOUSE WORD ANYWHERE — one of the two rows that killed the house-vocabulary version"],
  ["Gov Money Market Forfeiture", "er 0.2, likewise houseless — the other one"],
  ["Guaranteed Interest Fund-Forfeiture Account", "er 0.35, houseless"],
  ["Guaranteed Long-Term Account - forfeitures/asset holding", "iss `Empower`, er 0.35 — the house is in the ISSUER cell only, which no name-side list can read"],
  ["Empower Select Guaranteed Fund - Forfeitures", "$196,421 at er 0.35"],
  ["Stable Value Class I1 - Forfeitures", "iss `Transamerica`, er 0.35"],
  ["US Government Money Market Fund - Forfeitures", "iss `MassMutual`, er 0.2"],
  ["Corebridge Financial Government Money Market Forfeiture Fund", "er 0.2"],
  ["Nationwide Financial Services, Inc. Fed Hrms Gov Oblgtns Prmr (Forfeiture Acct)", "a real vehicle — and the row a prose test mis-bucketed, because `[a-z]\\.\\s+[A-Z]` matches `Inc. Fed`"],
  ["Forfeiture Holding Account Empower Trust Company, LLC", "$12,022,525, the largest refusal — a TRUSTEE's name in the residue"],
  ["MUTUAL FUND - FORFEITURES", "`mutual` and `fund` are absent from the strip list"],
  ["Forfeiture American Balance R6 Fund", ""],
  ["Reliance/MetLife CommonStable Forfeiture Credit Account", ""],
  ["FORFEITURE/ASSET HOLDING ACCOUNT", "NAMED RESIDUE, refused on purpose — `asset` is unmeasured, so this ≈10-row shape is left alone"],
  ["Forfeiture Cash Account", "likewise `cash`"],
  ["Non-Interest Bearing Cash - Forfeiture", "likewise, and `interest` is a Schedule H line item"],
  ["Fees paid directly to Fidelity to provide investment advisory services totaling", "$1,653,612 — PROSE, which is the `isSentenceRow` family's and not this rule's"],
  ["Employer - Net of forfeitures", "$7,612,654 — `net` keeps the residue"],
  ["Additions - balances forfeited during the year", "$2,053,869 — a MOVEMENT, not a balance"],
  ["Forfeitures during the year", "$365,287, likewise"],
  ["Unallocatad Forfeitures", "the filer's typo keeps a residue, correctly — a guess at it would be a name we invented"],
  ["Large Cap Growth Fund II Fee Class R1", "×105 rows at $318,179,963 — a collective trust's own SHARE CLASS, the family that refuted the expense-noun screen"],
  ["MORLEY STABLE VALUE FEE CL245", "the same family spelled without the word `Class`"],
  ["International Growth Fund II Fee R1", "likewise"],
  ["PIMCO Total Return Fund Administrative Class", "PTTRX at 0.51 — a REGISTERED Administrative class"],
  ["Dreyfus Government Securities Cash Management Administrative Shares", "likewise registered"],
  ["Fidelity 500 Index Fund", "an ordinary holding must not trigger at all"],
  ["Vanguard Institutional Index Fund", "likewise"],
  ["Interest Account (Loan Collateral)", "the LOAN family's, not this one"],
  ["", "the empty string"],
];
for (const [s, why] of MUST_KEEP) ok(!isForfeitureAccountRow(s), `must NOT fire: ${JSON.stringify(s)}${why ? ` — ${why}` : ""}`);

/* ───────── 3. SINGLE-PROTECTION MUTATIONS. Each is a transcription drift of
 * the kind the generator's comment warns about, and each MUST break a named
 * fixture. A mutation that leaves everything green means this file has stopped
 * guarding the rule, so the suite exits 1 on a PASS. ───────── */
const slice = (() => {
  const a = src.indexOf("const FORF_TRIGGER_WORD =");
  const b = src.indexOf("\n}\n", src.indexOf("export function isForfeitureAccountRow(")) + 3;
  if (a < 0 || b < 3) { fail++; console.log("  FAIL  cannot slice the rule out of lib-disclose — the markers moved"); return ""; }
  return src.slice(a, b).replace(/^export /gm, "");
})();

const build = (text) => {
  const fn = new Function(`${text}\nreturn isForfeitureAccountRow;`);
  return fn();
};
/* the slice must reproduce the module before any mutation is believed —
 * otherwise a mutation "breaking" a fixture proves nothing about the shipped
 * predicate, only about a copy that never worked. */
if (slice) {
  const plain = build(slice);
  const agree = [...MUST_FIRE.map(([s]) => s), ...MUST_KEEP.map(([s]) => s)]
    .every((s) => plain(s) === isForfeitureAccountRow(s));
  ok(agree, "the sliced copy reproduces the module on all fixtures (the control that a mutation tests the shipped rule)");
}

/* EVERY WORD-LIST MUTATION IS ANCHORED ON THE `FORF_BOOKKEEPING` LINE, never
 * on the first occurrence in the slice. Five of the first draft's mutations
 * reported PASS, and three of them were malformed for exactly that reason:
 * `budget`, `plan`, `paid`, `participants`, `account`, `expense`, `fee`, `and`,
 * `audit` and `accounting` all appear in a TRIGGER pattern as well, and
 * `String.replace` takes the FIRST occurrence — so the mutation mangled the
 * trigger instead of the list, and the row it aimed at stayed refused for a
 * reason that had nothing to do with the condition under test. */
const BK = "const FORF_BOOKKEEPING = /\\b(?:";
const addWord = (w) => (t) => t.replace(BK, BK + w + "|");
const dropWord = (w) => (t) => {
  const i = t.indexOf(BK);
  if (i < 0) return t;
  const j = t.indexOf("\n", i);
  return t.slice(0, i) + t.slice(i, j).replace(`|${w}|`, "|") + t.slice(j);
};
/* THE VICTIMS ARE MEASURED, NOT CHOSEN. Over all 99 live refusals, only 15
 * absent words flip even one of them, and NOT ONE flips a refusal that
 * publishes a fee or a ticker — the real vehicles are each held by SEVERAL
 * absent words, so no single-word mutation can reach them. Guessing `fund`,
 * `guaranteed`, `portfolio` or `net` therefore tests nothing: each row they aim
 * at is protected twice, which is the trap this project has paid for before.
 * What follows is the measured set, each victim flipped by EXACTLY ONE word. */
const MUTATIONS = [
  ["add `asset`", addWord("asset"), "FORFEITURE/ASSET HOLDING ACCOUNT", "flips 7 live refusals — the named residue this rule leaves alone"],
  ["add `cash`", addWord("cash"), "Cash Forfeitures Account", "flips 9 — the largest absent-word family"],
  ["add `annuity`", addWord("annuity"), "Annuity Forfeiture", "flips 2"],
  ["add `loan`", addWord("loan"), "Forfeitures and Loan", "would DOUBLE-LABEL: the loan family already claims this row"],
  ["add `valic`", addWord("valic"), "VALIC Forfeiture Account", "a recordkeeper BRAND keeps its residue, exactly as `isLoanAccountRow` records for `VALIC Loan Collateral Fund`"],
  ["add `directly`", addWord("directly"), "Fees paid directly by participants", "prose belongs to the `isSentenceRow` family"],
  ["drop the residue requirement", (t) => t.replace("return forfeitureAccountResidue(s).length === 0;", "return true;"), "Vanguard Federal MMKT Fund - Forfeitures", "the whole rule"],
  /* `General Account` is the right trigger victim and `Fidelity 500 Index
   * Fund` is the wrong one: the index fund keeps a residue and so is refused
   * by the residue test alone, protected twice. An insurer's GENERAL ACCOUNT
   * is entirely bookkeeping words, so the trigger is the only thing between
   * this rule and a real holding. */
  ["drop the trigger requirement", (t) => t.replace(/if \(!\(FORF_TRIGGER_WORD[^\n]*\n/, ""), "General Account", "an insurer's general account is all bookkeeping words and no trigger"],
  ["lose `master`", dropWord("master"), "Master Expense Account 4", "the $961,793,000 row"],
  ["lose `budget`", dropWord("budget"), "Expense Budget Account", "5 rows"],
  ["lose `holding`", dropWord("holding"), "FORFEITURE HOLDING ACCOUNT", "6 rows"],
  ["lose `suspense`", dropWord("suspense"), "Forfeitures in suspense", "3 rows"],
  ["lose `unallocated`", dropWord("unallocated"), "Unallocated Forfeitures", "3 rows"],
  ["lose `accounting`", dropWord("accounting"), "Audit and accounting", "an expense line"],
];
if (slice) for (const [what, mutate, victim, why] of MUTATIONS) {
  const text = mutate(slice);
  if (text === slice) { fail++; console.log(`  FAIL  mutation "${what}" did not apply — it is testing nothing`); continue; }
  let got;
  try { got = build(text)(victim); } catch { got = "threw"; }
  const want = isForfeitureAccountRow(victim);
  if (got === want) {
    fail++;
    console.log(`  FAIL  mutation "${what}" PASSED on ${JSON.stringify(victim)} (${why}) — that condition is not the only protection for it, so re-measure before trusting this suite`);
  }
}

/* ───────── 4. INVARIANTS. ───────── */
ok(forfeitureAccountResidue("Forfeiture Account").length === 0, "residue of a bare account is empty");
ok(forfeitureAccountResidue("Vanguard Federal MMKT Fund - Forfeitures").length > 0, "residue of a real vehicle is non-empty");
/* idempotence of the VERDICT under the display cleaner's own output shape */
ok(isForfeitureAccountRow("  Forfeiture Account  ") === isForfeitureAccountRow("Forfeiture Account"), "leading and trailing space cannot change the verdict");
/* a one-letter token must not count as a residue, which is what lets
 * `12(b)(1) Fee Account` fire while nothing a reader sees is invented */
ok(isForfeitureAccountRow("12(b)(1) Fee Account"), "a one-letter token is not a residue");
/* and the label the rule licenses must still exist on BOTH surfaces — a guard
 * and the claim it licenses are one change, so a reworded page that dropped
 * the sentence would leave 58 rows typed by a rule nothing explains. */
const app = readFileSync(new URL("../app.js", import.meta.url).pathname, "utf8");
ok(/forfeitAcctRow \? "Plan forfeiture or expense account — not a menu choice"/.test(app),
  "app.js still publishes the label this rule licenses");
ok(/window\.__wampoForfeitureAccountRow/.test(app),
  "app.js still carries the generated twin and its smoke-test hook");
const seo = readFileSync(new URL("./build-seo-pages.mjs", import.meta.url).pathname, "utf8");
ok(/isForfeitureAccountRow\(nm\) \? " — a plan forfeiture or expense account, not a menu choice"/.test(seo),
  "build-seo-pages still publishes the label on the static surface");

if (fail) { console.log(`\nforfeit-acct-test: ${fail} FAILURE(S)`); process.exit(1); }
console.log(`forfeit-acct-test: ok — ${MUST_FIRE.length} must-fire, ${MUST_KEEP.length} must-not-fire, ${MUTATIONS.length} single-protection mutations, 7 invariants`);
