/* wampo — v197's two arms of `isGenericTypeName`, pinned and
 * NEGATIVE-CONTROLLED PER CONDITION.
 *
 * WHY THIS IS A FILE IN THE REPO. The generator that writes app.js's twin
 * lived in a session scratchpad once and a container restart wiped it; the
 * harnesses that sized this very item were wiped the same way between the
 * handoff and the build. A control that exists only in a transcript is not a
 * control.
 *
 * WHAT IT CHECKS, and the second half is the part that earns its keep:
 *
 *   1. PINS — both directions, on the SHIPPED predicate.
 *   2. A NEGATIVE CONTROL PER CONDITION. Each variant is written out IN FULL
 *      below rather than produced by string surgery on lib-4i's source,
 *      because surgery has twice produced a harness artefact here: a variant
 *      that broke a different condition than intended and "failed" in the
 *      direction that looks like success. Each must disagree with the shipped
 *      predicate BY NAME on exactly its own cases — a control that cannot
 *      fail is decorative, which this record has paid for repeatedly.
 *
 * Run: node scripts/generic-typo-test.mjs
 */
import { isGenericTypeName, isTypoGenericTypeName, oneEdit, gtaLanguage,
  GTA_MIN_TYPO_LEN, stripGenericDecoration, GENERIC_TYPE_ANY,
  GENERIC_TYPE_DESPACED } from "./lib-4i.mjs";

let fails = 0;
const bad = (m) => { console.error("FAIL " + m); fails++; };

/* ---------------------------------------------------------------- pins ---- */

/* ARM A — one edit from the vocabulary's own enumerated language. Every one of
 * these is a real published holding name, read against its filing's own type
 * cell; not one of the 165 the arm reaches names a fund, and 0 publish a
 * ticker. */
const A_FLAG = [
  "Registered invesmtent company",   // R&L Carriers, 22,449 ppl, 2.7% of menu
  "Mutuai Fund", "Mututal Fund", "Mutuat Fund", "Matual Fund", "Motual Fund",
  "Murual Fund", "Mutula fund", "Sutual fund", "Mutaal Fund", "TUTUAL FUNDS",
  "[/tutual Fund", "“otalMutualFunds", "Totat mutual funds",
  "Guranteed Investment Contract", "Guarenteed Investment Contract",
  "Guaranteed Investement Contract", "Guarateed investment contract",
  "Gauranteed Investment Contract", "Guaranateed Investment Contract",
  "GUARANTEED INVESTMNT CONTRACT", "Guarantee investment contract",
  "Guaranteed Intvestment Contracts", "Gauranteed Interest Contract",
  "Pooled Seperate Account", "Pooled Seprate Account", "Pooled separte accounts",
  "Pooled separate acocunt", "Posled Separate Accounts", "aooled Separate Account",
  "Pooled Separate Accountb", "Pooled Separato Account", "Pooted separate account",
  "Common/Coliective Trust", "Common/Collecctive Trust", "Commoni/collective trust fund",
  "Commor/Collective Trust Fund", "Common coflective trust", "Collectieve trust funds",
  "Cotlective Trust Funds", "Collectve Trust Funds", "Common Collective TrustbFund",
  "Commingted Funds", "Commen Stock", "Comon Stock", "Common Slock 26,182",
  "Registered Investmnet Companies", "Regislered investment company",
  "Registered Investmetn Company", "Registered Investment Co1npany",
  "Registered lnvestment Company", "Registred Investment Companies",
  "Rogistered investment company", "REGUSTERED INVESTMENT COMPANY",
  "Registexed Investment Company", "Registered investment compony",
  "Group Annuity Contact", "Group Annunity Contract",
  "lnvestments, At Fair Value", "Collective Trusts(b)", "Mutual Funds(a)",
];
/* ARM B — one leading word, and it is the filing's own `Plan`. */
const B_FLAG = [
  "Plans Master Trust",                                  // General Motors x2
  "Plan's Interest in Master Trust",                     // Mack Trucks, 57.4%
  "Plan’s interest in Master Trust at fair value",  // curly apostrophe
  "Plan's interest in Master Trust at contract value",
  "Plan Assets",
];
/* MUST KEEP. These are not names the arms happen not to see — each is a name
 * an arm REACHES and REFUSES, which is what makes the controls below able to
 * fail. The leading-plan block is the whole-population evidence for arm B:
 * of the 160 distinct published names beginning with plan/plans/plan's, the
 * arm reaches 5 and leaves 155, including a real TIAA fund on 194 rows. */
const KEEP = [
  /* refused by the ten-letter floor — `truist` is ONE edit from `trust`.
   * `Assset` was pinned here too, as a one-edit neighbour of `assets`, and the
   * C-A1 control REFUTED IT: `assset` and `assets` differ in three positions,
   * so it is never reached under any variant and the pin was decorative. It is
   * removed rather than kept as noise — a pin that cannot move proves nothing,
   * and I wrote it from memory instead of measuring it. */
  "Truist", "Tru ist", "Truist, at fair value", "Truist Fund",
  /* refused by the single-character last token: a real designation */
  "Common Stock B", "Common Stocks A", "Class B Common Stock", "Class E Common Stock",
  /* v188's OWN NAMED COST, which this arm reaches by a side door that never
   * touches the case-sensitive footnote arm, and which is published at 90.3%
   * of its menu — so without condition (3) the arm WITHDRAWS a lineup that a
   * pinned control exists to protect. */
  "Separate Account A, at fair value",
  /* refused by the anchor: a real fund or firm one word away from a label */
  "Plan Loan Default Fund", "Plan's interest in the Hilton Stable Value Fund",
  "Plans Participating In Master Trust: 35497 75441", "Plan Fidelity 500 Index",
  "Target Retirement 2035 Trust", "American Mutual Fund", "INVESCO QQQ TRUST",
  "Washington Mutual Fund", "iShares Gold Trust", "American High-Income Trust",
  "Northern Trust", "Wilmington Trust", "FIRST BANK & TRUST", "Matrix Trust",
  "Real estate investment trusts", "Retirement Savings Trust",
  /* the word-set predicate's own refuted members: a one-edit neighbourhood
   * around `value`/`stock`/`fund`/`portfolio` reaches ordinary fund names, and
   * these four are the most frequent of the 14,911 rows it wrongly read */
  "MFS Mid Cap Value R6", "MFS Value Fund", "Key Guaranteed Portfolio Fund",
  "MFS Value R6",
  /* and the standing controls from older arms */
  "Fidelity 500 Index Fund", "AMERICAN FUNDS BLANC MUTUAL FUND",
  "Mutual of America MUTUAL FUND", "Spartan 500 Index Plus Fund",
  "Invesco Stable Value Trust B1", "Investment Company Of America",
  "PIMCO Short-Term Floating NAV Portfolio II",
];

for (const n of [...A_FLAG, ...B_FLAG]) {
  if (!isGenericTypeName(n)) bad(`must be generic and is not: ${JSON.stringify(n)}`);
}
for (const n of KEEP) {
  if (isGenericTypeName(n)) bad(`must NOT be generic and is: ${JSON.stringify(n)}`);
}
console.log(`pins: ${A_FLAG.length} arm-A flag, ${B_FLAG.length} arm-B flag, ${KEEP.length} keep`);

/* THE ARMS MUST BE REACHED, not merely satisfied by an older arm. Without this
 * the pins above would pass on a build where arm A had been deleted and the
 * names happened to be caught by the despaced or decoration arms. */
const notReached = A_FLAG.filter((n) => !isTypoGenericTypeName(n));
if (notReached.length) bad(`arm A does not reach ${notReached.length} of its own pins: ${JSON.stringify(notReached.slice(0, 4))}`);

/* ------------------------------------------------- negative controls ------ */

const TERMS = [...new Set(gtaLanguage().map((t) => t.toLowerCase().replace(/[^a-z]/g, "")))];
const LONG = TERMS.filter((t) => t.length >= GTA_MIN_TYPO_LEN);
const TSET = new Set(LONG);

/* Each variant is a FULL reimplementation of `isGenericTypeName` with exactly
 * one condition changed, and the shared tail is written out once so each
 * variant differs from the shipped rule in one visible place. */
const mkGeneric = (typo) => (n) => {
  const s = String(n || "").trim();
  if (!s) return false;
  const bare = stripGenericDecoration(s);
  if (!bare) return true;
  return GENERIC_TYPE_ANY.test(s) || GENERIC_TYPE_ANY.test(bare)
      || GENERIC_TYPE_DESPACED.test(s.toLowerCase().replace(/[^a-z]/g, ""))
      || typo(s);
};

/* C-A0 — arm A absent altogether (the pre-v197 predicate for arm A). */
const vA0 = mkGeneric(() => false);

/* C-A1 — the TEN-LETTER FLOOR dropped. `trust` is five letters and `truist` is
 * one edit from it, so a bank becomes an asset-class label. */
const vA1 = mkGeneric((n) => {
  for (const cand of [String(n).trim(), stripGenericDecoration(String(n).trim())]) {
    const tk = cand.split(/\s+/);
    if (tk.length > 1 && tk[tk.length - 1].replace(/[^A-Za-z0-9]/g, "").length <= 1) continue;
    const k = cand.toLowerCase().replace(/[^a-z]/g, "");
    if (!k) continue;
    if (TSET.has(k) || TERMS.includes(k)) continue;
    for (const t of TERMS) if (oneEdit(k, t)) return true;   // no length floor
  }
  return false;
});

/* C-A2 — the ALREADY-A-TERM condition dropped. Letters-only strips DIGITS, so
 * a welded share count reduces to an exact term, which sits one edit from its
 * own plural — a different class filed under this label. */
const vA2 = mkGeneric((n) => {
  for (const cand of [String(n).trim(), stripGenericDecoration(String(n).trim())]) {
    const tk = cand.split(/\s+/);
    if (tk.length > 1 && tk[tk.length - 1].replace(/[^A-Za-z0-9]/g, "").length <= 1) continue;
    const k = cand.toLowerCase().replace(/[^a-z]/g, "");
    if (k.length < GTA_MIN_TYPO_LEN) continue;
    for (const t of LONG) if (oneEdit(k, t)) return true;     // no exact-term skip
  }
  return false;
});

/* C-A3 — the SINGLE-CHARACTER LAST TOKEN condition dropped. A trailing capital
 * may be a real share-class or separate-account designation; v188 leaves
 * `Separate Account A, at fair value` uncaught for exactly that reason. */
const vA3 = mkGeneric((n) => {
  for (const cand of [String(n).trim(), stripGenericDecoration(String(n).trim())]) {
    const k = cand.toLowerCase().replace(/[^a-z]/g, "");
    if (k.length < GTA_MIN_TYPO_LEN) continue;
    if (TSET.has(k)) continue;
    for (const t of LONG) if (oneEdit(k, t)) return true;      // no last-token guard
  }
  return false;
});

/* C-A4 — TRANSPOSITION dropped from the edit, i.e. plain Levenshtein. The row
 * that found this whole arm needs it: `invesmtent` vs `investment` is `tm` ->
 * `mt`, distance 1 with transposition and 2 without. */
const levOne = (a, b) => {
  if (a === b) return false;
  const la = a.length, lb = b.length;
  if (Math.abs(la - lb) > 1) return false;
  if (la === lb) {
    let d = 0;
    for (let i = 0; i < la; i++) if (a[i] !== b[i]) { d++; if (d > 1) return false; }
    return d === 1;
  }
  const s = la < lb ? a : b, l = la < lb ? b : a;
  let i = 0, j = 0, skipped = false;
  while (i < s.length && j < l.length) {
    if (s[i] === l[j]) { i++; j++; continue; }
    if (skipped) return false;
    skipped = true; j++;
  }
  return true;
};
const vA4 = mkGeneric((n) => {
  for (const cand of [String(n).trim(), stripGenericDecoration(String(n).trim())]) {
    const tk = cand.split(/\s+/);
    if (tk.length > 1 && tk[tk.length - 1].replace(/[^A-Za-z0-9]/g, "").length <= 1) continue;
    const k = cand.toLowerCase().replace(/[^a-z]/g, "");
    if (k.length < GTA_MIN_TYPO_LEN) continue;
    if (TSET.has(k)) continue;
    for (const t of LONG) if (levOne(k, t)) return true;
  }
  return false;
});

/* C-B0 — arm B absent: the leading `plan` alternative removed from the
 * decoration strip. Written as a full strip rather than by patching the shipped
 * table, and asked of the PRE-ARM-A predicate so the two arms are separable —
 * arm A reaches GM's rows on its own, which is the finding this control makes
 * visible. */
const DECO_NOPLAN = [
  [/^(?:sub[- ]?total|total)\s*[:.]?\s+/i, ""],
  [/^description\s*:\s*/i, ""],
  [/^shares\s+(?:of|in)\s+/i, ""],
  [/^(?:individual|managed|master|annuity|variable annuity in)\s+/i, ""],
  [/\s*[:;.]+$/, ""],
  [/[,;]?\s*at fair value$/i, ""],
  [/[,;]?\s*\(?\s*practical expedient\s*\)?$/i, ""],
  [/[,;]?\s*(?:(?:as\s+)?(?:measured?|valued|stated|carried|reported)\s+)?(?:at|using)\s+(?:(?:fair|contract|market|net asset|book|redemption)\s+value|n\.?a\.?v\.?)\s*(?:\(\s*[a-z0-9]{1,2}\s*\)|\d{1,2})?$/i, ""],
  [/\s*\(\s*\d{1,2}\s*\)$/, ""],
  [/^(?:investments?|assets)\s+(?=\S)/i, ""],
  [/\s+shares$/i, ""],
  [/[,;]?\s*dividends?\s*\/\s*interest reinvested$/i, ""],
  [/\s+not required$/i, ""],
  [/\s+[a-z]$/, ""],
];
const stripNoPlan = (name) => {
  let s = String(name || "").trim();
  for (let i = 0; i < 8; i++) {
    const before = s;
    for (const [re, to] of DECO_NOPLAN) s = s.replace(re, to);
    s = s.trim();
    if (s === before) break;
  }
  return s;
};
const vB0noA = (n) => {
  const s = String(n || "").trim();
  if (!s) return false;
  const bare = stripNoPlan(s);
  if (!bare) return true;
  return GENERIC_TYPE_ANY.test(s) || GENERIC_TYPE_ANY.test(bare)
      || GENERIC_TYPE_DESPACED.test(s.toLowerCase().replace(/[^a-z]/g, ""));
};
/* ...and arm A alone, with the pre-arm-B strip, to show what arm A carries by
 * itself. */
const vAonly = (n) => {
  const s = String(n || "").trim();
  if (!s) return false;
  const bare = stripNoPlan(s);
  if (!bare) return true;
  return GENERIC_TYPE_ANY.test(s) || GENERIC_TYPE_ANY.test(bare)
      || GENERIC_TYPE_DESPACED.test(s.toLowerCase().replace(/[^a-z]/g, ""))
      || isTypoGenericTypeName(s);
};

const ALL = [...A_FLAG, ...B_FLAG, ...KEEP];
const control = (label, fn, expect) => {
  const diff = ALL.filter((n) => fn(n) !== isGenericTypeName(n));
  const got = diff.slice().sort();
  const want = expect.slice().sort();
  const ok = got.length === want.length && got.every((x, i) => x === want[i]);
  console.log(`${ok ? "ok  " : "BAD "} ${label}: disagrees on ${diff.length} of ${ALL.length}`);
  if (!ok) {
    bad(`${label} did not fail on exactly its own cases`);
    console.error(`   got : ${JSON.stringify(got)}`);
    console.error(`   want: ${JSON.stringify(want)}`);
  }
  return diff;
};

/* Arm A absent -> every arm-A pin returns to not-generic, and the three names
 * both arms reach stay generic through arm B. */
control("C-A0 arm A deleted", vA0, A_FLAG);
/* The floor dropped -> the four Truist-shaped keeps leak. `Assset` is 6
 * letters and one edit from `assets`. */
control("C-A1 ten-letter floor dropped", vA1, ["Truist", "Tru ist", "Truist, at fair value"]);
/* The exact-term skip dropped -> nothing in the pin list moves, because every
 * pin is already decided by another condition. NAMED AS DECORATIVE ON THE PINS
 * and controlled on the STORE instead, below: it is what keeps 18 welded
 * share-count rows out of this class. */
control("C-A2 already-a-term skip dropped", vA2, []);
/* The last-token guard dropped -> the designations leak, v188's decoy among
 * them, and that one is published at 90.3% of its menu. */
control("C-A3 single-char last token dropped", vA3,
  ["Common Stock B", "Common Stocks A", "Separate Account A, at fair value"]);
/* Transposition dropped -> SEVEN pins are lost, and I registered TWO. The
 * control refuted my estimate and the correction is the more useful fact: a
 * transposition is not an edge case in this population, it is 7 of the 66
 * flagged pins. `Gauranteed` is `gu` -> `ua`, `Mutula` is `al` -> `la`,
 * `acocunt` is `co` -> `oc`, `Investmnet` is `en` -> `ne`, and
 * `invesmtent` — the row that found the whole arm — is `tm` -> `mt`. Plain
 * Levenshtein scores every one of them 2 and would miss all seven. */
control("C-A4 transposition dropped (plain Levenshtein)", vA4,
  ["Registered invesmtent company", "Registered Investmetn Company",
   "Registered Investmnet Companies", "Gauranteed Investment Contract",
   "Gauranteed Interest Contract", "Mutula fund", "Pooled separate acocunt"]);
/* Arm B absent AND arm A absent -> all pins of both arms return. */
control("C-B0 both arms deleted", vB0noA, [...A_FLAG, ...B_FLAG]);
/* Arm A alone -> exactly the arm-B members arm A cannot reach. THIS IS THE
 * SEPARATION: arm A reaches `Plans Master Trust` and `Plan's Interest in
 * Master Trust` by itself, because `plansmastertrust` is one insertion from
 * `planmastertrust`, which the vocabulary already accepts. So arm B's marginal
 * contribution is the three rows below and NOT General Motors' 136,838
 * readers, which arm A serves. */
control("C-B1 arm B deleted, arm A kept", vAonly,
  ["Plan’s interest in Master Trust at fair value",
   "Plan's interest in Master Trust at contract value", "Plan Assets"]);

/* C-A2 ON THE STORE, because its pin-level control is decorative and saying so
 * is not the same as testing it. A welded share count reduces to an exact term
 * under the letters-only form; the condition is what stops that reading as a
 * misspelling. */
const WELDED = ["22,782.2669 mutual fund shares", "12,108.7387 mutual fund shares",
  "1,121.1847 mutual fund shares", "746.9066 mutual fund shares"];
const a2leak = WELDED.filter((n) => vA2(n) && !isGenericTypeName(n));
if (a2leak.length !== WELDED.length) {
  bad(`C-A2's store-level control is decorative: expected all ${WELDED.length} welded share-count rows to leak without the exact-term skip, got ${a2leak.length}`);
} else {
  console.log(`ok   C-A2 store-level: all ${WELDED.length} welded share-count rows leak without the exact-term skip`);
}

/* AND THE ENUMERATION ITSELF, both halves, because every count in this item
 * rests on it: it must be non-trivial, and every string it produces must be
 * accepted by the regex it was derived from. lib-4i asserts this at import;
 * repeated here so a failure names the enumeration rather than a parse. */
if (TERMS.length < 100) bad(`gtaLanguage enumerated only ${TERMS.length} despaced terms`);
const rejected = gtaLanguage().filter((t) => !GENERIC_TYPE_ANY.test(t));
if (rejected.length) bad(`gtaLanguage produced ${rejected.length} strings GENERIC_TYPE_ANY rejects, e.g. ${JSON.stringify(rejected[0])}`);
console.log(`ok   enumeration: ${gtaLanguage().length} strings, ${LONG.length} despaced terms of ${GTA_MIN_TYPO_LEN}+ letters, 0 rejected by their own regex`);

/* THE VOCABULARY MUST NOT HAVE MOVED. This is the whole blast-radius argument:
 * `isClassLabel` reads GENERIC_TYPE_ANY and GENERIC_TYPE_NAME, and it feeds
 * `isStatement`'s label-share arm inside the REGION CONTEST. v196 widened the
 * vocabulary and so demoted two whole regions from menu to statement, costing
 * two lineups on a registration that said +0/-0. v197's arms live inside
 * `isGenericTypeName`, so the contest is untouched BY CONSTRUCTION — but a
 * later cycle that "simplifies" arm A by folding it into GENERIC_TYPE_ANY_EXTRA
 * would reintroduce exactly that exposure in silence. Pinned by LENGTH rather
 * than by content so the assertion does not have to be rewritten for a
 * legitimate vocabulary change; it fails loudly and names the hazard. */
if (GENERIC_TYPE_ANY.source.length !== 592 || GENERIC_TYPE_ANY.source.indexOf("invesmtent") >= 0) {
  bad("GENERIC_TYPE_ANY has changed shape — if that is deliberate, re-measure `isClassLabel` over every published row name and `labely` over every entry BEFORE shipping: v197's arms were confined to isGenericTypeName precisely so the region contest could not move, and widening the vocabulary moves it. Then update this length.");
}

console.log(fails ? `\n${fails} FAILURE(S)` : `\nall green (${ALL.length} pins, 7 negative controls)`);
process.exit(fails ? 1 : 0);
